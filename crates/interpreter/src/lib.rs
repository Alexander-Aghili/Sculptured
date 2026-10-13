//! The action interpreter (spec §6.4): what a tool call did, in Sculptured's words. Pure and
//! observe-only: it reads tool names and inputs (never the filesystem) and never blocks anything.
//! Everything it says is heuristic (`≈`): it reads words, so it can miss a risk or name one that
//! did not happen. An empty list means nothing stood out, never that a call was safe or correct.
pub mod shell;

use model::{ActionClass, RiskFlag};
use serde_json::Value;
use std::path::{Component, Path, PathBuf};

/// A flag's text is at most about this many bytes. It names a path, host or branch taken from
/// the command, which can be long; the full command stays in the tool call as evidence.
pub const MAX_FLAG_TEXT: usize = 1024;

/// Cuts `s` in the middle like an approval prompt (`model::cap::approval_cut`): the start and the
/// end stay, so the sentence's own words and the end of what it names are never lost.
fn cut_middle(s: String, max: usize) -> String {
    match model::cap::middle(&s, max) {
        None => s,
        Some((start, hidden, end)) => format!("{start} [{hidden} bytes not shown; the full command is in the tool call] {end}"),
    }
}

pub(crate) fn flag(code: &str, text: String) -> RiskFlag {
    RiskFlag { code: code.to_string(), text: cut_middle(text, MAX_FLAG_TEXT) }
}

/// The command of a shell tool call (Claude `Bash`, Codex `commandExecution`).
pub fn command_of(input: &Value) -> String {
    match &input["command"] {
        Value::String(s) => s.clone(),
        Value::Array(parts) => parts.iter().filter_map(Value::as_str).collect::<Vec<_>>().join(" "),
        _ => String::new(),
    }
}

fn paths(input: &Value, key: &str) -> Vec<String> {
    input[key].as_str().map(|p| vec![p.to_string()]).unwrap_or_default()
}

/// What kind of action a tool call is, and the files it names.
pub fn classify(tool: &str, input: &Value) -> (ActionClass, Vec<String>) {
    if let Some(rest) = tool.strip_prefix("mcp__") {
        let (server, name) = rest.split_once("__").unwrap_or((rest, ""));
        return (ActionClass::Mcp { server: server.to_string(), tool: name.to_string() }, Vec::new());
    }
    match tool {
        "Bash" | "commandExecution" => (shell::classify_command(&command_of(input)), Vec::new()),
        "Read" => (ActionClass::FileRead, paths(input, "file_path")),
        "Grep" | "Glob" | "LS" => (ActionClass::FileRead, paths(input, "path")),
        "Edit" | "Write" | "MultiEdit" => (ActionClass::FileEdit, paths(input, "file_path")),
        "NotebookEdit" => (ActionClass::FileEdit, paths(input, "notebook_path")),
        "fileChange" => (
            ActionClass::FileEdit,
            input["changes"].as_array().map(|c| c.iter().filter_map(|x| x["path"].as_str().map(str::to_string)).collect()).unwrap_or_default(),
        ),
        // `webSearch` is how Task 12 emits a Codex web search.
        "WebFetch" | "WebSearch" | "webSearch" => (ActionClass::Web, Vec::new()),
        "Task" | "Agent" => (ActionClass::SubagentSpawn, Vec::new()),
        "Skill" => {
            let name = ["skill", "name", "command"].iter().find_map(|k| input[*k].as_str()).unwrap_or("unknown");
            (ActionClass::Skill { name: name.to_string() }, Vec::new())
        }
        _ => (ActionClass::Other, Vec::new()),
    }
}

fn normalize(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// True when `path` (relative to `cwd` unless absolute) is outside the agent's folder, read
/// lexically. `~` and `$HOME` paths count as outside. Without a folder nothing is called outside.
pub fn outside(path: &str, cwd: Option<&Path>) -> bool {
    let Some(cwd) = cwd else { return false };
    if path.starts_with('~') || path.starts_with("$HOME") || path.starts_with("${HOME}") {
        return true;
    }
    let p = Path::new(path);
    let full = if p.is_absolute() { p.to_path_buf() } else { cwd.join(p) };
    !normalize(&full).starts_with(normalize(cwd))
}

/// What a tool call would do that is worth a person's attention, before it runs (permission prompts).
pub fn consequence(tool: &str, input: &Value, cwd: Option<&Path>) -> Vec<RiskFlag> {
    let mut out = Vec::new();
    if matches!(tool, "Bash" | "commandExecution") {
        out.extend(shell::risks(&command_of(input), cwd));
    }
    let (class, files) = classify(tool, input);
    if class == ActionClass::FileEdit {
        for f in files.iter().filter(|f| outside(f, cwd)) {
            out.push(flag("outside-folder-edit", format!("edited {f}, outside the agent's folder")));
        }
    }
    out
}

/// What a finished tool call did that is worth a person's attention. A failed call did nothing.
pub fn risks(tool: &str, input: &Value, output: &str, ok: bool, cwd: Option<&Path>) -> Vec<RiskFlag> {
    if !ok {
        return Vec::new();
    }
    let mut out = consequence(tool, input, cwd);
    if output.contains("(forced update)") {
        for f in out.iter_mut().filter(|f| f.code == "force-push") {
            f.text.push_str(": the remote branch was rewritten");
        }
    }
    out
}
