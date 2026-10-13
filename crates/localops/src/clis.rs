//! The Claude Code and Codex CLIs on this computer: installed, version, signed in (as this OS user),
//! and a sign-in started from the browser. The CLI runs its own login (it opens the system browser);
//! the page shows the link it prints in case the browser did not open. Nothing stores credentials.
use crate::LocalError;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use ts_rs::TS;

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CliStatus {
    /// `claude` or `codex`.
    pub name: String,
    pub installed: bool,
    pub version: Option<String>,
    /// None when the CLI did not say.
    pub signed_in: Option<bool>,
    /// The account it names (an email, or the sign-in method), verbatim.
    pub account: Option<String>,
    /// The CLI's own status output, verbatim (evidence).
    pub detail: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct LoginStarted {
    /// The sign-in link the CLI printed, if any.
    pub url: Option<String>,
    /// What the CLI printed so far, verbatim (it may hold a device code).
    pub output: String,
}

/// Runs `program args` with a timeout; Some((success, stdout + stderr)) when it ran at all.
async fn run(program: &std::path::Path, args: &[&str]) -> Option<(bool, String)> {
    let out = Command::new(crate::programs::resolve(program)).args(args).stdin(Stdio::null()).kill_on_drop(true).output();
    let out = tokio::time::timeout(Duration::from_secs(15), out).await.ok()?.ok()?;
    let text = format!("{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
    Some((out.status.success(), text.trim().to_string()))
}

pub async fn status(name: &str, program: &Path) -> CliStatus {
    let Some((_, version)) = run(program, &["--version"]).await else {
        let detail = format!("{} was not found", program.display());
        return CliStatus { name: name.into(), installed: false, version: None, signed_in: None, account: None, detail };
    };
    let args: &[&str] = if name == "claude" { &["auth", "status"] } else { &["login", "status"] };
    let (ok, detail) = run(program, args).await.unwrap_or((false, "status did not answer".into()));
    let (signed_in, account) = if name == "claude" { claude_auth(&detail) } else { codex_auth(ok, &detail) };
    CliStatus { name: name.into(), installed: true, version: Some(version), signed_in, account, detail }
}

/// `claude auth status` prints JSON with `loggedIn` and `email` (or the auth method).
fn claude_auth(text: &str) -> (Option<bool>, Option<String>) {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(text) else { return (None, None) };
    let account = v["email"].as_str().or(v["authMethod"].as_str()).map(str::to_string);
    (v["loggedIn"].as_bool(), account)
}

/// `codex login status` exits 0 with "Logged in using …" when signed in.
fn codex_auth(ok: bool, text: &str) -> (Option<bool>, Option<String>) {
    let line = text.lines().find(|l| l.starts_with("Logged in"));
    match (ok, line) {
        (true, Some(l)) => (Some(true), l.strip_prefix("Logged in using ").map(str::to_string)),
        (false, _) if text.contains("Not logged in") => (Some(false), None),
        (false, _) => (None, None),
        (true, None) => (Some(true), None),
    }
}

/// Starts the CLI's sign-in and returns the link it prints within a few seconds. The CLI keeps
/// running until the sign-in completes (or after 10 minutes is stopped); the page re-reads the status.
pub async fn login(name: &str, program: &Path) -> Result<LoginStarted, LocalError> {
    let args: &[&str] = match name {
        "claude" => &["auth", "login", "--claudeai"],
        "codex" => &["login"],
        _ => return Err(LocalError::not_found("not_found", format!("no CLI {name:?}"))),
    };
    let mut child = Command::new(crate::programs::resolve(program)).args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .kill_on_drop(true).spawn().map_err(|e| LocalError::conflict("cli_missing", format!("{name} could not start: {e}")))?;
    let (out, err) = (child.stdout.take().expect("piped"), child.stderr.take().expect("piped"));
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    for stream in [Box::new(out) as Box<dyn tokio::io::AsyncRead + Unpin + Send>, Box::new(err)] {
        let tx = tx.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stream).lines();
            while let Ok(Some(l)) = lines.next_line().await {
                let _ = tx.send(l);
            }
        });
    }
    tokio::spawn(async move {
        let _ = tokio::time::timeout(Duration::from_secs(600), child.wait()).await;
    });
    Ok(first_link(&mut rx).await)
}

/// Collects output until a link appears (then a moment more, for a device code) or 8 seconds pass.
async fn first_link(rx: &mut tokio::sync::mpsc::UnboundedReceiver<String>) -> LoginStarted {
    let mut output = String::new();
    let mut deadline = tokio::time::Instant::now() + Duration::from_secs(8);
    let mut url = None;
    while let Ok(Some(line)) = tokio::time::timeout_at(deadline, rx.recv()).await {
        if url.is_none() {
            url = line.split_whitespace().find(|w| w.starts_with("https://") || w.starts_with("http://localhost")).map(str::to_string);
            if url.is_some() {
                deadline = tokio::time::Instant::now() + Duration::from_millis(800);
            }
        }
        output.push_str(&line);
        output.push('\n');
    }
    LoginStarted { url, output }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_each_cli_status_in_its_own_words() {
        let claude = r#"{"loggedIn": true, "authMethod": "claude.ai", "email": "a@b.c"}"#;
        assert_eq!(claude_auth(claude), (Some(true), Some("a@b.c".into())));
        assert_eq!(claude_auth("not json"), (None, None));
        assert_eq!(codex_auth(true, "Logged in using ChatGPT"), (Some(true), Some("ChatGPT".into())));
        assert_eq!(codex_auth(false, "Not logged in"), (Some(false), None));
    }
}
