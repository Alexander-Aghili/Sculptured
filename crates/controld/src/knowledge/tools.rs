//! `search_history` and `record_lesson`: an agent finds what its team (finished agents included)
//! already wrote, ran and decided, at no model cost; and leaves a lesson every later agent is told.
use crate::state::AppState;
use serde_json::{json, Value};

/// Matches returned, and the characters of text around each.
const HITS: usize = 8;
const AROUND: usize = 160;
const LESSON_CHARS: usize = 400;

/// The text of an event worth searching, by its kind.
fn searchable(body: &Value) -> Option<(&'static str, String)> {
    let s = |k: &str| body.get(k).and_then(Value::as_str).map(str::to_string);
    match body.get("type")?.as_str()? {
        "agent-text" => Some(("wrote", s("text")?)),
        "tool-called" => Some(("ran", format!("{} {}", s("name").unwrap_or_default(), body.get("input").map(Value::to_string).unwrap_or_default()))),
        "tool-resulted" => Some(("got back", s("output")?)),
        "message-queued" => Some(("was told", s("text")?)),
        _ => None,
    }
}

/// The part of `text` around the first match of `q` (lowercase), on character boundaries.
fn snippet(text: &str, q: &str) -> String {
    let lower = text.to_lowercase();
    let at = lower.find(q).map_or(0, |i| lower[..i].chars().count());
    let chars: Vec<char> = text.chars().collect();
    let (from, to) = (at.saturating_sub(AROUND), (at + q.chars().count() + AROUND).min(chars.len()));
    let core: String = chars[from..to].iter().collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ");
    format!("{}{core}{}", if from > 0 { "…" } else { "" }, if to < chars.len() { "…" } else { "" })
}

/// `search_history { query, agent? }`: the newest matches in what this team's agents wrote, ran, got
/// back and were told, with who and when.
pub fn search_history(st: &AppState, seat: &str, args: &Value) -> Result<Value, String> {
    let team = crate::seat_ids::rig_of(seat).ok_or("Unknown agent.")?;
    let query = args.get("query").and_then(Value::as_str).map(|q| q.trim().to_lowercase()).filter(|q| q.chars().count() >= 3)
        .ok_or("Give a query of at least 3 characters.")?;
    let agent = args.get("agent").and_then(Value::as_str).map(|a| a.trim().to_lowercase()).filter(|a| !a.is_empty());
    let like = format!("%{}%", query.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"));
    let store = st.store.lock().unwrap();
    let draft = store.draft(team).map_err(|e| e.to_string())?;
    let mut q = store.connection().prepare(
        "SELECT substr(e.subject, 6), e.at_ms, e.json FROM events e JOIN seats s ON e.subject = 'seat:' || s.id WHERE s.rig = ?1
         AND json_extract(e.json, '$.body.type') IN ('agent-text', 'tool-called', 'tool-resulted', 'message-queued')
         AND lower(e.json) LIKE ?2 ESCAPE '\\' ORDER BY e.seq DESC LIMIT 200",
    ).map_err(|e| e.to_string())?;
    let rows = q.query_map(rusqlite::params![team, like], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, String>(2)?))).map_err(|e| e.to_string())?;
    let mut hits = Vec::new();
    for (who, at_ms, raw) in rows.flatten() {
        let name = draft.as_ref().and_then(|d| d.agent_for_seat(&who)).map_or(who.clone(), |a| a.name.clone());
        if agent.as_ref().is_some_and(|a| !name.to_lowercase().contains(a.as_str()) && !who.to_lowercase().contains(a.as_str())) {
            continue;
        }
        let Some((verb, text)) = serde_json::from_str::<Value>(&raw).ok().and_then(|e| searchable(&e["body"])) else { continue };
        if !text.to_lowercase().contains(&query) {
            continue;
        }
        hits.push(json!({ "agent": name, "at_ms": at_ms, "what": verb, "text": snippet(&text, &query) }));
        if hits.len() == HITS {
            break;
        }
    }
    let text = if hits.is_empty() { format!("Nothing in this team's history mentions {query:?}.") } else { serde_json::to_string(&hits).map_err(|e| e.to_string())? };
    Ok(json!({ "text": text }))
}

/// `record_lesson { lesson }`: kept in the team's log; every later agent of the team is told it.
pub fn record_lesson(st: &AppState, seat: &str, args: &Value) -> Result<Value, String> {
    let team = crate::seat_ids::rig_of(seat).ok_or("Unknown agent.")?;
    let lesson = args.get("lesson").and_then(Value::as_str).map(str::trim).filter(|l| !l.is_empty()).ok_or("Say the lesson.")?;
    let lesson: String = lesson.chars().take(LESSON_CHARS).collect();
    let store = st.store.lock().unwrap();
    let author = store.draft(team).ok().flatten().and_then(|d| d.agent_for_seat(seat).map(|a| a.name.clone())).unwrap_or_else(|| seat.to_string());
    store.add_decision(team, &author, &lesson, "lesson").map_err(|e| e.to_string())?;
    Ok(json!({ "text": "Recorded. Every agent of this team is told it when it next starts a conversation." }))
}

#[cfg(test)]
mod tests {
    use super::snippet;

    #[test]
    fn a_snippet_is_the_text_around_the_match() {
        let text = format!("{} the Slack bridge lives in messaging/slack.rs {}", "x ".repeat(200), "y ".repeat(200));
        let s = snippet(&text, "slack bridge");
        assert!(s.starts_with('…') && s.ends_with('…') && s.contains("Slack bridge lives in messaging/slack.rs"), "{s}");
        assert!(s.chars().count() < 400);
    }
}
