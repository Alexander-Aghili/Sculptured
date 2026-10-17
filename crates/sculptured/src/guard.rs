//! `sculptured guard`: Claude Code's PreToolUse hook for Sculptured's protections. It reads the pending
//! tool call on stdin and the agent's rules from `SCULPTURED_PROTECTION`, and prints a refusal or
//! nothing. It runs before anything else in this binary starts, reads no file contents, and lets the
//! call through whenever it cannot decide.
use std::io::Read;
use std::process::ExitCode;

/// Larger hook input is not a tool call this guard judges.
const MAX_INPUT: u64 = 4 * 1024 * 1024;

pub fn run() -> ExitCode {
    let rules = std::env::var("SCULPTURED_PROTECTION").ok().and_then(|r| serde_json::from_str::<model::GuardRules>(&r).ok());
    let mut input = String::new();
    let read = std::io::stdin().take(MAX_INPUT).read_to_string(&mut input);
    let (Some(rules), Ok(_), Ok(hook)) = (rules, read, serde_json::from_str::<serde_json::Value>(&input)) else {
        return ExitCode::SUCCESS;
    };
    let size = |p: &std::path::Path| std::fs::metadata(p).ok().filter(|m| m.is_file()).map(|m| m.len());
    if let Some(reason) = model::protection::decide(&rules, &hook, &size) {
        let deny = serde_json::json!({ "hookSpecificOutput": {
            "hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": reason,
        } });
        println!("{deny}");
    }
    ExitCode::SUCCESS
}
