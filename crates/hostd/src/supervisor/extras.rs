//! What an agent is given beyond its CLI and Sculptured's tools: its skills, as a plugin folder
//! Claude Code loads for that session only, and integrations (tools installed on this computer, such
//! as Kindex) found here, never named by the server.
use super::Supervisor;
use drivers::McpServer;
use model::{EventBody, SafetyRule, Skill};
use std::path::{Path, PathBuf};

/// The plugin that carries one agent's skills; Claude names them `sculptured:<skill>`.
const PLUGIN: &str = "sculptured";

impl Supervisor {
    /// Writes the agent's skills as a plugin folder in this runner's own data, replacing an earlier one.
    /// Nothing is written into the person's project.
    pub(super) fn skills_plugin(&self, seat: &str, skills: &[Skill]) -> Result<Option<PathBuf>, String> {
        let Some(host) = &self.inner.seat_tools else { return Ok(None) };
        let root = host.socket.parent().unwrap_or_else(|| Path::new(".")).join("skills");
        let dir = root.join(seat.replace(|c: char| !(c.is_ascii_alphanumeric() || "@.-_".contains(c)), "_"));
        write_plugin(&dir, skills).map_err(|e| format!("cannot prepare the agent's skills: {e}"))?;
        Ok(Some(dir))
    }

    /// The integrations found on this computer, as MCP servers and tool hooks; each one missing is told
    /// on the agent, and the agent starts without it. `safety`: the team's rules, which Signet-Eval
    /// enforces too.
    pub(super) fn integrations(&self, seat: &str, names: &[String], safety: &[SafetyRule]) -> (Vec<McpServer>, Vec<String>) {
        let (mut servers, mut hooks) = (Vec::new(), Vec::new());
        for name in names {
            let found = match name.as_str() {
                "kindex" => find_program("kin-mcp").map(|program| servers.push(McpServer { name: "kindex".into(), program, args: vec![] })),
                "signet" => find_program("signet-eval").and_then(|program| self.signet_hook(seat, &program, safety).map(|h| hooks.push(h))),
                _ => None,
            };
            if found.is_none() {
                self.emit_system(seat, EventBody::FeaturesDropped { features: vec![name.clone()], note: missing_note(name) });
            }
        }
        (servers, hooks)
    }

    /// Signet-Eval as a hook command, with the team's safety rules as its user rules (its own system
    /// policy, `~/.signet/policy.yaml` or its built-in one, still applies).
    fn signet_hook(&self, seat: &str, program: &Path, safety: &[SafetyRule]) -> Option<String> {
        let host = self.inner.seat_tools.as_ref()?;
        let dir = host.socket.parent().unwrap_or_else(|| Path::new(".")).join("signet").join(seat.replace(|c: char| !(c.is_ascii_alphanumeric() || "@.-_".contains(c)), "_"));
        let rules: Vec<serde_json::Value> = safety.iter().map(|r| serde_json::json!({
            "name": r.name, "tool_pattern": r.tool_pattern, "conditions": r.conditions, "action": "DENY",
            "reason": r.reason.clone().unwrap_or_else(|| "Not allowed in this team.".into()),
        })).collect();
        // YAML reads JSON, so the rules file is written as JSON.
        let file = dir.join("rules.yaml");
        std::fs::create_dir_all(&dir).and_then(|()| std::fs::write(&file, serde_json::to_string_pretty(&rules).unwrap_or_default())).ok()?;
        Some(format!("\"{}\" --rules-path \"{}\"", program.display(), file.display()))
    }
}

fn missing_note(name: &str) -> String {
    match name {
        "kindex" => "This agent runs without Kindex: `kin-mcp` is not installed on its computer. Install it there with `pip install 'kindex[mcp]'` (or `uv tool install 'kindex[mcp]'`), then restart the agent.".into(),
        "signet" => "This agent runs without Signet-Eval: `signet-eval` is not installed on its computer. Install it there with `cargo install signet-eval`, then restart the agent. Sculptured's own safety rules still apply.".into(),
        other => format!("This agent runs without {other}: this computer's runner does not know it. Reinstall the runner from Computers."),
    }
}

pub(crate) fn write_plugin(dir: &Path, skills: &[Skill]) -> std::io::Result<()> {
    if dir.exists() {
        std::fs::remove_dir_all(dir)?;
    }
    std::fs::create_dir_all(dir.join(".claude-plugin"))?;
    let manifest = serde_json::json!({ "name": PLUGIN, "version": "1.0.0", "description": "This agent's skills, from its Sculptured team" });
    std::fs::write(dir.join(".claude-plugin/plugin.json"), manifest.to_string())?;
    for s in skills {
        // Names were checked by the server; a name that could leave the folder is skipped anyway.
        if s.name.is_empty() || !s.name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
            continue;
        }
        let skill = dir.join("skills").join(&s.name);
        std::fs::create_dir_all(&skill)?;
        std::fs::write(skill.join("SKILL.md"), s.to_skill_md())?;
    }
    Ok(())
}

/// A program on PATH, or in the usual per-user install folders (login services start with a short PATH).
fn find_program(name: &str) -> Option<PathBuf> {
    let exe = if cfg!(windows) { format!("{name}.exe") } else { name.to_string() };
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from);
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH").map(|p| std::env::split_paths(&p).collect()).unwrap_or_default();
    if let Some(h) = home {
        dirs.extend([h.join(".local/bin"), h.join(".cargo/bin")]);
    }
    dirs.into_iter().map(|d| d.join(&exe)).find(|p| p.is_file())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_agents_skills_become_a_plugin_folder_and_an_unsafe_name_is_skipped() {
        let dir = tempfile::tempdir().unwrap();
        let plugin = dir.path().join("p");
        let good = Skill { name: "money-rules".into(), description: "Use for money.".into(), body: "Decimal only.\n".into() };
        let bad = Skill { name: "../escape".into(), description: "x".into(), body: "x".into() };
        write_plugin(&plugin, &[good.clone(), bad]).unwrap();
        let md = std::fs::read_to_string(plugin.join("skills/money-rules/SKILL.md")).unwrap();
        assert_eq!(Skill::from_skill_md(&md).unwrap(), good);
        assert!(plugin.join(".claude-plugin/plugin.json").is_file());
        assert_eq!(std::fs::read_dir(plugin.join("skills")).unwrap().count(), 1, "the unsafe name is not written");
        write_plugin(&plugin, &[]).unwrap();
        assert!(!plugin.join("skills/money-rules").exists(), "a later launch replaces the folder");
    }
}
