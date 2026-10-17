//! Knowledge: what a team's agents know about their project and each other, with nobody maintaining
//! it. A project map generated on the agents' computer at every start (`localops::map`), who has been
//! working where, lessons agents recorded, and a search of what the team already did. Agents get the
//! short version in their briefing and look up the rest; people see it in the Knowledge view.
mod tools;
pub use tools::{record_lesson, search_history};

use crate::error::{respond, ApiError};
use crate::extract::Path;
use crate::state::AppState;
use axum::extract::State;
use axum::response::Response;
use axum::routing::{get, post};
use axum::Router;
use localops::map::ProjectMap;
use model::TeamDraft;
use rusqlite::params;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::time::Duration;

/// How long a start waits for the maps before the agents' first messages go without one.
const MAP_WAIT: Duration = Duration::from_secs(20);
/// Areas in a briefing's outline, at most (the full map has the rest).
const OUTLINE_AREAS: usize = 25;
/// Lessons in a briefing, newest first.
const BRIEFING_LESSONS: usize = 8;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/teams/{id}/knowledge", get(view))
        .route("/api/teams/{id}/decisions/{entry}/confirm", post(confirm))
}

/// The folders the team's agents work in, as this computer (or the agents' computer) names them.
fn folders(st: &AppState, d: &TeamDraft) -> BTreeSet<String> {
    let home = st.home.as_deref().cloned().unwrap_or_default();
    d.agents.iter().filter_map(|a| d.effective_folder(a)).map(|f| crate::launch::cwd_for(st, &home, f)).collect()
}

/// Maps every folder the team works in, on the agents' computer, and keeps them. Never fails a start:
/// a folder that cannot be mapped (an older runner, a missing folder) is skipped.
pub async fn refresh(st: &AppState, team: &str, d: &TeamDraft) {
    for folder in folders(st, d) {
        let op = localops::LocalOp::ProjectMap { path: folder.clone() };
        match tokio::time::timeout(MAP_WAIT, crate::ops::run(st, crate::ops::Target::Team(team), op)).await {
            Ok(Ok(map)) => {
                let saved = st.store.lock().unwrap().connection().execute(
                    "INSERT OR REPLACE INTO project_maps (team, folder, json, at_ms) VALUES (?1, ?2, ?3, ?4)",
                    params![team, folder, map.to_string(), model::now_ms()],
                );
                if let Err(e) = saved {
                    tracing::warn!(%team, error = %e, "project map not kept");
                }
            }
            Ok(Err(e)) => tracing::info!(%team, %folder, error = %e.message, "no project map for this folder"),
            Err(_) => tracing::info!(%team, %folder, "the project map took too long; agents start without it"),
        }
    }
}

/// The team's kept maps: (folder, map, when).
fn maps(st: &AppState, team: &str) -> Vec<(String, ProjectMap, i64)> {
    let store = st.store.lock().unwrap();
    let Ok(mut q) = store.connection().prepare("SELECT folder, json, at_ms FROM project_maps WHERE team = ?1 ORDER BY folder") else { return vec![] };
    let rows = q.query_map([team], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?)));
    rows.map(|it| it.flatten().filter_map(|(f, j, at)| serde_json::from_str(&j).ok().map(|m| (f, m, at))).collect()).unwrap_or_default()
}

/// Who has changed files where: folder area → agent names, from the agents' recorded file writes.
fn workers(st: &AppState, team: &str, d: &TeamDraft, folder: &str) -> BTreeMap<String, BTreeSet<String>> {
    let store = st.store.lock().unwrap();
    let sql = "SELECT substr(e.subject, 6), json_extract(e.json, '$.body.input.file_path') FROM events e JOIN seats s ON e.subject = 'seat:' || s.id
               WHERE s.rig = ?1 AND json_extract(e.json, '$.body.type') = 'tool-called'
               AND json_extract(e.json, '$.body.name') IN ('Write', 'Edit', 'MultiEdit', 'NotebookEdit') ORDER BY e.seq DESC LIMIT 5000";
    let Ok(mut q) = store.connection().prepare(sql) else { return BTreeMap::new() };
    let rows = q.query_map([team], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?)));
    let mut out: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for (seat, file) in rows.map(|it| it.flatten().collect::<Vec<_>>()).unwrap_or_default() {
        let Some(rel) = file.as_deref().and_then(|f| f.strip_prefix(folder)).map(|r| r.trim_start_matches('/')) else { continue };
        let area: Vec<&str> = rel.split('/').collect();
        let area = area[..area.len().saturating_sub(1)].iter().take(2).copied().collect::<Vec<_>>().join("/");
        let name = d.agent_for_seat(&seat).map_or(seat.clone(), |a| a.name.clone());
        out.entry(area).or_default().insert(name);
    }
    out
}

/// What goes into an agent's briefing: its folder's map outline (with who worked where), the team's
/// lessons, and how to look further.
pub(crate) fn briefing_lines(st: &AppState, team: &str, seat: &str, d: &TeamDraft) -> Vec<String> {
    let mut out = Vec::new();
    let home = st.home.as_deref().cloned().unwrap_or_default();
    let folder = d.agent_for_seat(seat).and_then(|a| d.effective_folder(a)).map(|f| crate::launch::cwd_for(st, &home, f));
    if let Some((f, map, _)) = folder.and_then(|f| maps(st, team).into_iter().find(|(m, ..)| *m == f)) {
        out.push(outline(&map, &workers(st, team, d, &f)));
    }
    let lessons: Vec<String> = st.store.lock().unwrap().decisions(team, None, 50, false).unwrap_or_default().into_iter()
        .filter(|e| e.source == "lesson").take(BRIEFING_LESSONS)
        .map(|e| format!("{}{} ({})", if e.confirmed_ms.is_some() { "[confirmed] " } else { "" }, e.text.trim(), e.author)).collect();
    if !lessons.is_empty() {
        out.push(format!("Lessons this team's agents recorded, newest first:\n- {}", lessons.join("\n- ")));
    }
    out.push("Before building something, check whether it already exists: the project map, then search_history (what the team's agents, including finished ones, wrote, ran and decided). When something cost you a wrong turn that others could avoid, record it with record_lesson.".into());
    out
}

fn outline(map: &ProjectMap, who: &BTreeMap<String, BTreeSet<String>>) -> String {
    let mut areas: Vec<_> = map.areas.iter().collect();
    areas.sort_by(|a, b| who.contains_key(&b.path).cmp(&who.contains_key(&a.path)).then(b.files.cmp(&a.files)));
    let lines: Vec<String> = areas.iter().take(OUTLINE_AREAS).map(|a| {
        let kinds: Vec<&str> = a.kinds.iter().take(2).map(|(k, _)| k.as_str()).collect();
        let name = if a.path.is_empty() { "(top level)" } else { a.path.as_str() };
        let about = a.about.as_ref().map(|s| format!(": {s}")).unwrap_or_default();
        let by = who.get(&a.path).map(|w| format!(" · worked on by {}", w.iter().cloned().collect::<Vec<_>>().join(", "))).unwrap_or_default();
        format!("- {name} ({} files, {}){about}{by}", a.files, kinds.join(", "))
    }).collect();
    let more = map.areas.len().saturating_sub(OUTLINE_AREAS);
    format!(
        "Project map, generated at this start from your folder ({} files). The full map, with every document's sections and their line ranges, is in {}: read it before building something that may exist already.\n{}{}",
        map.files, map.file, lines.join("\n"), if more > 0 { format!("\n- and {more} more areas in the full map") } else { String::new() }
    )
}

async fn view(State(st): State<AppState>, Path(id): Path<String>) -> Response {
    let d = st.store.lock().unwrap().draft(&id).ok().flatten();
    let maps: Vec<Value> = maps(&st, &id).into_iter().map(|(folder, map, at)| {
        let who = d.as_ref().map(|d| workers(&st, &id, d, &folder)).unwrap_or_default();
        json!({ "folder": folder, "at_ms": at, "map": map, "workers": who })
    }).collect();
    let entries = st.store.lock().unwrap().decisions(&id, None, 200, false);
    respond(entries.map(|e| json!({ "maps": maps, "entries": e })).map_err(ApiError::from))
}

async fn confirm(State(st): State<AppState>, Path((id, entry)): Path<(String, String)>) -> Response {
    let done = st.store.lock().unwrap().confirm_decision(&id, &entry);
    respond(match done {
        Ok(true) => Ok(json!({ "confirmed": entry })),
        Ok(false) => Err(ApiError::not_found("No such entry")),
        Err(e) => Err(ApiError::from(e)),
    })
}
