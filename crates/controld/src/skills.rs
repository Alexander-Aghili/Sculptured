//! An agent's skills and integrations in its conversation. Claude Code loads skills natively (the
//! runner passes them as a plugin), so only other agents are told theirs and read one with `read_skill`.
use crate::state::AppState;
use model::{AgentKind, DraftAgent, Integration};
use serde_json::{json, Value};

/// Lines for the agent's briefing: its skills when its CLI cannot load them, and its integrations.
pub(crate) fn briefing_lines(me: &DraftAgent) -> Vec<String> {
    let mut out = Vec::new();
    if me.kind == AgentKind::Codex && !me.advanced.skills.is_empty() {
        let list: Vec<String> = me.advanced.skills.iter().map(|s| format!("- {}: {}", s.name, s.description.trim())).collect();
        out.push(format!("Your skills (load one with read_skill when its description applies, then follow it):\n{}", list.join("\n")));
    }
    if me.advanced.integrations.contains(&Integration::Kindex) {
        out.push("You also have Kindex (the kindex tools): a knowledge graph on this computer that outlasts this team. Search it before starting something it may cover, and add durable decisions and discoveries to it. Sculptured's record_lesson tells this team; Kindex keeps knowledge for later work in this project.".into());
    }
    out
}

/// `read_skill { name }`: one of the calling agent's skills, in full.
pub fn read_skill(st: &AppState, seat: &str, args: &Value) -> Result<Value, String> {
    let team = crate::seat_ids::rig_of(seat).ok_or("Unknown agent.")?;
    let name = args.get("name").and_then(Value::as_str).map(str::trim).filter(|n| !n.is_empty()).ok_or("Say which skill.")?;
    let draft = st.store.lock().unwrap().draft(team).map_err(|e| e.to_string())?.ok_or("This agent's team is gone.")?;
    let me = draft.agent_for_seat(seat).ok_or("This agent has no skills.")?;
    match me.advanced.skills.iter().find(|s| s.name == name) {
        Some(s) => Ok(json!({ "text": format!("# Skill: {}\n\n{}", s.name, s.body) })),
        None => {
            let names: Vec<&str> = me.advanced.skills.iter().map(|s| s.name.as_str()).collect();
            Err(format!("No skill named {name:?}. Your skills: {}.", if names.is_empty() { "none".to_string() } else { names.join(", ") }))
        }
    }
}
