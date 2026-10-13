//! Seat tools on the supervisor side: the tokens that live while an agent's process runs, the
//! config files that name them, and the relay of tool calls to controld.
use super::Supervisor;
use host_proto::seat_tools::shim_env;
use host_proto::{FromHost, SeatToolsParams};
use drivers::SeatToolsLaunch;
use model::EventBody;
use serde_json::Value;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tokio::sync::{broadcast, oneshot};

/// What a live seat-tools token grants: its seat, whether it may call `approve` (a restricted Claude
/// agent), and the config file naming it (deleted with the token).
pub(super) struct Grant {
    seat: String,
    approve: bool,
    config_file: Option<PathBuf>,
}

/// Where the seat-tools shim reaches this hostd (Task 6 serves the socket).
#[derive(Clone, Debug)]
pub struct SeatToolsHost {
    /// The socket the shim dials. Its folder is hostd's private (0700) directory; the per-agent config
    /// files that name a token are written to `seat-tools/` next to it.
    pub socket: PathBuf,
    /// The `sculptured` binary; its `seat-tools` subcommand is the MCP shim.
    pub shim: PathBuf,
}

/// What an agent's tool call returns when controld cannot answer. The agent reads these.
pub const NOT_CONNECTED: &str = "Sculptured is not connected right now, so this call could not be made. Carry on with your best judgment.";
pub const LINK_DROPPED: &str =
    "Sculptured's connection to this agent's runner dropped before the call was answered. Carry on with your best judgment.";
pub const TOO_BUSY: &str = "Sculptured was too busy to pass this call on. Carry on with your best judgment.";

impl Supervisor {
    /// The seat a seat-tools token belongs to, while that seat's process runs.
    pub fn seat_for_token(&self, token: &str) -> Option<String> {
        self.inner.tokens.lock().unwrap().get(token).map(|g| g.seat.clone())
    }

    /// The seat a live token belongs to and whether it was launched with the `approve` tool.
    pub fn tool_grant(&self, token: &str) -> Option<(String, bool)> {
        self.inner.tokens.lock().unwrap().get(token).map(|g| (g.seat.clone(), g.approve))
    }

    /// Records a seat-tool call hostd refused before it reached controld (`report-rejected` evidence).
    pub fn reject_tool_call(&self, seat: &str, tool: &str, reason: &str, raw: Value) {
        let body = EventBody::ReportRejected { tool: tool.chars().take(200).collect(), reason: reason.to_string(), raw };
        self.emit_system(seat, body);
    }

    /// Forgets a token and deletes the config file that names it.
    pub(super) fn forget_token(&self, token: &Option<String>) {
        let Some(t) = token else { return };
        let removed = self.inner.tokens.lock().unwrap().remove(t);
        if let Some(Grant { seat, config_file: Some(file), .. }) = removed
            && let Err(e) = std::fs::remove_file(&file)
            && e.kind() != std::io::ErrorKind::NotFound
        {
            tracing::warn!(%seat, file = %file.display(), error = %e, "cannot delete the seat-tools config file");
        }
    }

    /// Relays one seat-tool call to controld and waits for its reply (which may take as long as a question).
    pub async fn tool_call(&self, seat: &str, tool: &str, args: Value) -> Result<Value, String> {
        let call_id = uuid::Uuid::new_v4().to_string();
        let (tx, rx) = oneshot::channel();
        self.inner.tool_pending.lock().unwrap().insert(call_id.clone(), tx);
        let frame = FromHost::SeatTool { call_id: call_id.clone(), seat: seat.to_string(), tool: tool.to_string(), args };
        // No link is subscribed: controld is not connected right now.
        if self.inner.tool_out.send(frame).is_err() {
            self.inner.tool_pending.lock().unwrap().remove(&call_id);
            return Err(NOT_CONNECTED.to_string());
        }
        rx.await.unwrap_or_else(|_| Err(LINK_DROPPED.to_string()))
    }

    pub fn subscribe_tool_calls(&self) -> broadcast::Receiver<FromHost> {
        self.inner.tool_out.subscribe()
    }

    /// Hands controld's reply to the waiting call; a call already failed (or unknown) ignores it.
    pub fn resolve_tool_call(&self, call_id: &str, reply: Result<Value, String>) {
        let waiting = self.inner.tool_pending.lock().unwrap().remove(call_id);
        if let Some(tx) = waiting {
            let _ = tx.send(reply);
        }
    }

    /// True while the call still waits for its reply (not yet answered or failed).
    pub fn tool_call_pending(&self, call_id: &str) -> bool {
        self.inner.tool_pending.lock().unwrap().contains_key(call_id)
    }

    /// Ends every waiting call with `reason` (the link dropped).
    pub fn fail_tool_calls(&self, reason: &str) {
        let pending: Vec<_> = self.inner.tool_pending.lock().unwrap().drain().collect();
        for (_, tx) in pending {
            let _ = tx.send(Err(reason.to_string()));
        }
    }

    /// Ends the waiting calls that never reached controld (calls were lost on the way). A call in
    /// `forwarded` already did: its question may be open in Needs you and controld's reply still comes.
    pub fn fail_tool_calls_except(&self, forwarded: &HashSet<String>, reason: &str) {
        let lost: Vec<_> = {
            let mut pending = self.inner.tool_pending.lock().unwrap();
            let ids: Vec<String> = pending.keys().filter(|id| !forwarded.contains(*id)).cloned().collect();
            ids.into_iter().filter_map(|id| pending.remove(&id)).collect()
        };
        for tx in lost {
            let _ = tx.send(Err(reason.to_string()));
        }
    }

    /// A new token for an agent launched with seat tools, when this hostd serves them.
    pub(super) fn new_token(&self, params: Option<&SeatToolsParams>) -> Option<String> {
        (params.is_some() && self.inner.seat_tools.is_some()).then(|| uuid::Uuid::new_v4().simple().to_string())
    }

    /// The seat-tools launch for token `t`, recorded as a live grant. A driver that passes the config
    /// as a file gets a unique one, so a late cleanup of an earlier process never deletes this one's
    /// (Codex passes it over stdin).
    pub(super) fn grant_tools(&self, seat: &str, as_file: bool, p: &SeatToolsParams, t: &str) -> Result<Option<SeatToolsLaunch>, String> {
        let Some(host) = &self.inner.seat_tools else { return Ok(None) };
        let config_file = if as_file {
            let f = private_dir(host).map(|d| d.join(format!("{seat}.{}.json", &uuid::Uuid::new_v4().simple().to_string()[..8])));
            Some(f.map_err(|e| format!("cannot prepare the agent's tools: {e}"))?)
        } else {
            None
        };
        let launch = SeatToolsLaunch {
            program: host.shim.clone(),
            args: vec!["seat-tools".into()],
            env: shim_env(&host.socket, t, p.approve),
            approve: p.approve,
            config_file: config_file.clone(),
        };
        self.inner.tokens.lock().unwrap().insert(t.to_string(), Grant { seat: seat.to_string(), approve: p.approve, config_file });
        Ok(Some(launch))
    }
}

fn tools_dir(host: &SeatToolsHost) -> PathBuf {
    host.socket.parent().unwrap_or_else(|| Path::new(".")).join("seat-tools")
}

/// `seat-tools/` next to the socket, created owner-only (0700): the agents' config files name tokens.
fn private_dir(host: &SeatToolsHost) -> std::io::Result<PathBuf> {
    use std::os::unix::fs::PermissionsExt;
    let dir = tools_dir(host);
    std::fs::create_dir_all(&dir)?;
    std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700))?;
    Ok(dir)
}

/// Deletes config files an earlier hostd left behind (it died before it could): they name tokens
/// that no longer exist. Called when a supervisor with seat tools starts, before any agent launches.
pub(super) fn sweep_config_files(host: &SeatToolsHost) {
    let dir = tools_dir(host);
    let Ok(entries) = std::fs::read_dir(&dir) else { return };
    for path in entries.flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|x| x == "json")) {
        if let Err(e) = std::fs::remove_file(&path) {
            tracing::warn!(file = %path.display(), error = %e, "cannot delete a leftover seat-tools config file");
        }
    }
}
