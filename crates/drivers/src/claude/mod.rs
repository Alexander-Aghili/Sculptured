//! Claude Code via `claude -p --input-format stream-json --output-format stream-json`.
mod limits;
mod parser;

use crate::process::{self, StderrTail};
use crate::{check_cwd, Driver, DriverError, DriverEvent, LaunchSpec, OutboundMessage, Session};
use async_trait::async_trait;
use futures::stream::{BoxStream, StreamExt};
use model::{Caps, PermissionPosture};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin};
use tokio::sync::{mpsc, oneshot, watch};
use tokio_stream::wrappers::UnboundedReceiverStream;

pub use limits::{cli_limit_message, limit_kind};
pub use parser::ClaudeParser;

pub struct ClaudeStreamDriver {
    pub program: PathBuf,
}

impl Default for ClaudeStreamDriver {
    fn default() -> Self {
        Self { program: PathBuf::from("claude") }
    }
}

impl ClaudeStreamDriver {
    /// Unrestricted posture by default (spec D7). A restricted agent drops the bypass flag; with seat
    /// tools it routes permission prompts to `approve` (M0: the gate runs through an MCP tool).
    pub fn args(spec: &LaunchSpec, resume: Option<&str>, session_id: &str) -> Vec<String> {
        let mut a: Vec<String> = ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--replay-user-messages"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        if spec.posture == PermissionPosture::Unrestricted {
            a.push("--dangerously-skip-permissions".into());
        }
        match resume {
            Some(id) => a.extend(["--resume".to_string(), id.to_string()]),
            None => a.extend(["--session-id".to_string(), session_id.to_string()]),
        }
        if let Some(m) = &spec.model {
            a.extend(["--model".to_string(), m.clone()]);
        }
        if let Some(t) = &spec.seat_tools {
            // A file keeps the token off argv (`/proc/<pid>/cmdline` is world-readable); `spawn` writes it.
            let config = t.config_file.as_ref().map(|p| p.display().to_string()).unwrap_or_else(|| Self::mcp_config(t));
            a.extend(["--mcp-config".to_string(), config]);
            a.extend(["--disallowedTools".to_string(), "Agent,Task".to_string()]);
            if spec.posture == PermissionPosture::Restricted {
                // Sculptured's own tools never need a permission prompt: without this, every
                // request_input / record_decision / report call of a restricted agent would first
                // raise an `approve` question ("Allow mcp__rig__request_input to run?").
                a.extend([
                    "--allowedTools".to_string(),
                    format!("mcp__{0}__request_input,mcp__{0}__record_decision,mcp__{0}__report,mcp__{0}__dispatch_work,mcp__{0}__complete_work,mcp__{0}__workflow_status,mcp__{0}__spawn_agent,mcp__{0}__send_agent_message,mcp__{0}__team_status,mcp__{0}__read_decisions", crate::MCP_SERVER),
                ]);
            }
            if spec.posture == PermissionPosture::Restricted && t.approve {
                a.extend(["--permission-prompt-tool".to_string(), crate::APPROVE_TOOL.to_string()]);
            }
        }
        for dir in &spec.add_dirs {
            a.extend(["--add-dir".to_string(), dir.display().to_string()]);
        }
        a.extend(spec.extra_args.iter().cloned());
        a
    }

    /// `--mcp-config` JSON naming one stdio server, `rig`.
    pub fn mcp_config(t: &crate::SeatToolsLaunch) -> String {
        let env: serde_json::Map<String, Value> = t.env.iter().map(|(k, v)| (k.clone(), Value::String(v.clone()))).collect();
        json!({ "mcpServers": { crate::MCP_SERVER: {
            "type": "stdio", "command": t.program.display().to_string(), "args": t.args, "env": env,
        } } })
        .to_string()
    }

    async fn spawn(&self, spec: LaunchSpec, resume: Option<&str>) -> Result<Box<dyn Session>, DriverError> {
        check_cwd(&spec)?;
        let session_id = resume
            .map(str::to_string)
            .or_else(|| spec.native_session_id.clone())
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let mut child = self.start_child(&spec, resume, &session_id)?;
        let stdin = child.stdin.take();
        let parser = Arc::new(Mutex::new(spec.usage_baseline.map(ClaudeParser::with_usage_baseline).unwrap_or_default()));
        let (tx, rx) = mpsc::unbounded_channel();
        let (kill_tx, kill_rx) = oneshot::channel::<()>();
        let (exited_tx, exited_rx) = watch::channel(false);
        let _ = tx.send(DriverEvent::SessionReady { native_session_id: session_id });
        tokio::spawn(run_output(child, parser.clone(), tx, kill_rx, exited_tx));
        Ok(Box::new(ClaudeSession {
            stdin,
            parser,
            events: Some(UnboundedReceiverStream::new(rx).boxed()),
            kill: Some(kill_tx),
            exited: exited_rx,
            interrupt_seq: 0,
        }))
    }

    /// Writes the seat-tools config file (if any) and starts `claude`.
    fn start_child(&self, spec: &LaunchSpec, resume: Option<&str>, session_id: &str) -> Result<Child, DriverError> {
        if let Some(t) = &spec.seat_tools
            && let Some(path) = &t.config_file
        {
            write_private(path, &Self::mcp_config(t))?;
        }
        let program = spec.program.clone().unwrap_or_else(|| self.program.clone());
        let mut cmd = process::command(&program, spec, Self::args(spec, resume, session_id));
        if spec.seat_tools.is_some() {
            // A request_input or approve call may wait for the whole question timeout.
            cmd.env("MCP_TOOL_TIMEOUT", crate::MCP_TOOL_TIMEOUT_MS);
        }
        process::spawn(&mut cmd, &program)
    }
}

/// Feeds stdout to the parser until it ends or Stop's kill fires, then reaps the child (still
/// honouring the kill) and sends `Exited`.
async fn run_output(
    mut child: Child,
    parser: Arc<Mutex<ClaudeParser>>,
    tx: mpsc::UnboundedSender<DriverEvent>,
    mut kill_rx: oneshot::Receiver<()>,
    exited_tx: watch::Sender<bool>,
) {
    let stderr = StderrTail::start(child.stderr.take().expect("piped stderr"));
    let mut lines = BufReader::new(child.stdout.take().expect("piped stdout")).lines();
    let killed = process::pump_lines(&mut lines, &mut kill_rx, |l| {
        for e in parser.lock().unwrap().parse_line(&l) {
            let _ = tx.send(e);
        }
    })
    .await;
    if killed {
        process::kill_group(&child);
    }
    let status = process::reap(&mut child, &mut kill_rx, killed).await;
    let stderr = stderr.finish().await;
    let _ = tx.send(process::exited(status, &stderr));
    let _ = exited_tx.send(true);
}

#[async_trait]
impl Driver for ClaudeStreamDriver {
    fn name(&self) -> &'static str {
        "claude-stream"
    }
    fn capabilities(&self) -> Caps {
        // M0 Caps table: fork was not probed, questions are unknown, and a mid-turn
        // message queues instead of steering.
        Caps {
            interrupt: true,
            resume: true,
            usage: true,
            subagent_events: true,
            fork: false,
            questions: false,
            mid_turn_input: false,
        }
    }
    async fn launch(&self, spec: LaunchSpec) -> Result<Box<dyn Session>, DriverError> {
        self.spawn(spec, None).await
    }
    async fn resume(&self, spec: LaunchSpec, native_id: &str) -> Result<Box<dyn Session>, DriverError> {
        self.spawn(spec, Some(native_id)).await
    }
}

struct ClaudeSession {
    stdin: Option<ChildStdin>,
    parser: Arc<Mutex<ClaudeParser>>,
    events: Option<BoxStream<'static, DriverEvent>>,
    kill: Option<oneshot::Sender<()>>,
    exited: watch::Receiver<bool>,
    interrupt_seq: u32,
}

impl ClaudeSession {
    async fn write_line(&mut self, v: Value) -> Result<(), DriverError> {
        let stdin = self.stdin.as_mut().ok_or(DriverError::Closed)?;
        stdin.write_all(format!("{v}\n").as_bytes()).await.map_err(|_| DriverError::Closed)?;
        stdin.flush().await.map_err(|_| DriverError::Closed)
    }
}

#[async_trait]
impl Session for ClaudeSession {
    async fn send(&mut self, msg: OutboundMessage) -> Result<(), DriverError> {
        if *self.exited.borrow() {
            return Err(DriverError::Closed);
        }
        self.parser.lock().unwrap().on_sent(msg.message_id);
        self.write_line(json!({
            "type": "user",
            "message": { "role": "user", "content": [{ "type": "text", "text": msg.text }] }
        }))
        .await
    }

    async fn interrupt(&mut self) -> Result<(), DriverError> {
        self.interrupt_seq += 1;
        self.parser.lock().unwrap().on_interrupt();
        let id = format!("interrupt-{}", self.interrupt_seq);
        self.write_line(json!({ "type": "control_request", "request_id": id, "request": { "subtype": "interrupt" } }))
            .await
    }

    async fn stop(&mut self, grace: Duration) -> Result<(), DriverError> {
        self.stdin.take(); // EOF: `claude -p` finishes and exits
        process::stop_within(grace, &self.exited, &mut self.kill).await;
        Ok(())
    }

    fn take_events(&mut self) -> Option<BoxStream<'static, DriverEvent>> {
        self.events.take()
    }
}

/// Writes `text` to `path`, readable by this user only (0600), replacing what was there.
fn write_private(path: &std::path::Path, text: &str) -> std::io::Result<()> {
    use std::io::Write;
    use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
    let mut f = std::fs::OpenOptions::new().write(true).create(true).truncate(true).mode(0o600).open(path)?;
    // `mode` applies only on create; an existing file is narrowed too.
    f.set_permissions(std::fs::Permissions::from_mode(0o600))?;
    f.write_all(text.as_bytes())
}
