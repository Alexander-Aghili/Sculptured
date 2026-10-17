//! Protections: rules Sculptured applies between an agent and its tools. The first ones keep an agent's
//! context small (efficiency); the same layer takes safety rules later. A rule that cannot decide lets
//! the call through: a protection never stalls an agent.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use ts_rs::TS;

/// Every refusal's reason starts with this, so the runner can tell a protection from other errors.
pub const MARK: &str = "Sculptured protection:";

/// A team's protections (Advanced). On by default.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema, TS)]
#[ts(export)]
pub struct Protection {
    #[serde(default = "yes")]
    pub on: bool,
    /// A read with no line range of a file larger than this many KB is refused.
    #[serde(default = "read_kb")]
    pub read_kb: u32,
    /// The most shell output, in characters, that reaches an agent's context.
    #[serde(default = "shell_chars")]
    pub shell_chars: u32,
    /// Past this many tokens of context, an agent writes its notes and continues fresh.
    #[serde(default = "context_tokens")]
    pub context_tokens: u32,
}

fn yes() -> bool {
    true
}
fn read_kb() -> u32 {
    100
}
fn shell_chars() -> u32 {
    8000
}
fn context_tokens() -> u32 {
    60_000
}

impl Default for Protection {
    fn default() -> Self {
        Self { on: true, read_kb: read_kb(), shell_chars: shell_chars(), context_tokens: context_tokens() }
    }
}

impl Protection {
    pub fn is_default(&self) -> bool {
        *self == Self::default()
    }

    /// What a runner needs to guard an agent's calls; None when protections are off.
    pub fn guard_rules(&self) -> Option<GuardRules> {
        self.on.then(|| GuardRules { max_read_bytes: u64::from(self.read_kb) * 1024, shell_output_chars: self.shell_chars })
    }

    /// The context ceiling in tokens; None when protections are off.
    pub fn context_ceiling(&self) -> Option<u64> {
        self.on.then_some(u64::from(self.context_tokens))
    }
}

/// The rules a runner applies to one agent's tool calls (sent with its launch).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct GuardRules {
    pub max_read_bytes: u64,
    pub shell_output_chars: u32,
}

/// Files read as a whole by nature (an image cannot be read in pieces): never refused.
const WHOLE: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "pdf", "ipynb"];

/// Commands that print whole files.
const PRINTERS: &[&str] = &["cat", "tac", "nl", "less", "more", "bat", "batcat", "type"];

/// The refusal reason for a pending tool call (`hook` is the PreToolUse input), or None to let it run.
/// `size` gives a file's size in bytes (None if it cannot be read).
pub fn decide(rules: &GuardRules, hook: &Value, size: &dyn Fn(&Path) -> Option<u64>) -> Option<String> {
    let input = hook.get("tool_input")?;
    let cwd = hook.get("cwd").and_then(Value::as_str).map(PathBuf::from);
    let big = |file: &str| -> Option<u64> {
        let p = Path::new(file);
        let p = if p.is_absolute() { p.to_path_buf() } else { cwd.clone()?.join(p) };
        let whole = p.extension().and_then(|e| e.to_str()).is_some_and(|e| WHOLE.contains(&e.to_ascii_lowercase().as_str()));
        size(&p).filter(|n| !whole && *n > rules.max_read_bytes)
    };
    match hook.get("tool_name")?.as_str()? {
        "Read" => {
            if input.get("limit").is_some_and(|l| !l.is_null()) {
                return None;
            }
            let file = input.get("file_path")?.as_str()?;
            big(file).map(|n| reason(file, n))
        }
        "Bash" | "shell" | "exec_command" => {
            let command = input.get("command").and_then(command_text)?;
            whole_file_printed(&command).and_then(|file| big(&file).map(|n| reason(&file, n)))
        }
        _ => None,
    }
}

/// A shell command as text (Codex sends an argv list).
fn command_text(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => Some(s.clone()),
        Value::Array(a) => Some(a.iter().filter_map(Value::as_str).collect::<Vec<_>>().join(" ")),
        _ => None,
    }
}

/// The file a command prints whole, when its output is not piped into a filter: `cat f`,
/// `sed -n '1,$p' f`. Anything unclear is None (the call goes through).
fn whole_file_printed(command: &str) -> Option<String> {
    let last = command.rsplit("&&").next()?.rsplit(';').next()?;
    if last.contains('|') || last.contains('>') {
        return None;
    }
    let words: Vec<&str> = last.split_whitespace().map(|w| w.trim_matches(|c| c == '\'' || c == '"')).collect();
    let (cmd, args) = words.split_first()?;
    let files: Vec<&&str> = args.iter().filter(|a| !a.starts_with('-')).collect();
    let printer = PRINTERS.contains(cmd) || (*cmd == "sed" && args.iter().any(|a| *a == "1,$p" || a.is_empty()));
    match (printer, *cmd == "sed", files.as_slice()) {
        (true, false, [file]) => Some((**file).to_string()),
        (true, true, [_, file]) => Some((**file).to_string()),
        _ => None,
    }
}

fn reason(file: &str, bytes: u64) -> String {
    let name = Path::new(file).file_name().and_then(|n| n.to_str()).unwrap_or(file);
    format!(
        "{MARK} {name} is {} KB, too large to read whole. Search it with `grep -n` for what you need, then read only those lines (Read with offset and limit).",
        bytes.div_ceil(1024)
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn rules() -> GuardRules {
        Protection::default().guard_rules().unwrap()
    }

    fn sizes(p: &Path) -> Option<u64> {
        match p.file_name()?.to_str()? {
            "big.csv" | "page.png" | "manual.pdf" => Some(400_000),
            "small.rs" => Some(2_000),
            _ => None,
        }
    }

    fn call(tool: &str, input: Value) -> Option<String> {
        decide(&rules(), &json!({ "tool_name": tool, "tool_input": input, "cwd": "/work" }), &sizes)
    }

    #[test]
    fn a_large_file_read_whole_is_refused_and_a_ranged_or_small_read_is_not() {
        let r = call("Read", json!({ "file_path": "/work/big.csv" })).expect("refused");
        assert!(r.starts_with(MARK) && r.contains("big.csv is 391 KB") && r.contains("grep -n"), "{r}");
        assert_eq!(call("Read", json!({ "file_path": "/work/big.csv", "offset": 1, "limit": 200 })), None);
        assert_eq!(call("Read", json!({ "file_path": "/work/small.rs" })), None);
        assert_eq!(call("Read", json!({ "file_path": "/work/missing.txt" })), None, "unknown size: let it through");
    }

    #[test]
    fn images_pdfs_and_notebooks_are_never_refused() {
        assert_eq!(call("Read", json!({ "file_path": "/work/page.png" })), None);
        assert_eq!(call("Read", json!({ "file_path": "/work/manual.pdf" })), None);
    }

    #[test]
    fn printing_a_large_file_whole_in_the_shell_is_refused_but_filtering_it_is_not() {
        assert!(call("Bash", json!({ "command": "cat big.csv" })).is_some(), "relative to cwd");
        assert!(call("Bash", json!({ "command": "cd /work && cat big.csv" })).is_some());
        assert!(call("Bash", json!({ "command": "sed -n '1,$p' big.csv" })).is_some());
        assert!(call("shell", json!({ "command": ["cat", "/work/big.csv"] })).is_some(), "Codex sends an argv list");
        assert_eq!(call("Bash", json!({ "command": "cat big.csv | grep wing" })), None);
        assert_eq!(call("Bash", json!({ "command": "grep -n wing big.csv" })), None);
        assert_eq!(call("Bash", json!({ "command": "cat small.rs" })), None);
        assert_eq!(call("Bash", json!({ "command": "cat a.csv b.csv" })), None, "unclear: let it through");
    }

    #[test]
    fn other_tools_and_odd_input_pass() {
        assert_eq!(call("Write", json!({ "file_path": "/work/big.csv" })), None);
        assert_eq!(decide(&rules(), &json!({}), &sizes), None);
        assert!(!Protection { on: false, ..Protection::default() }.guard_rules().is_some());
    }
}
