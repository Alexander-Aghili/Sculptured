//! Knowledge: the project map made at a start and carried in the agents' first messages, lessons agents
//! record, a search of the team's history, and the Knowledge view's data. Fake CLIs only.
mod common;
use axum::http::StatusCode;
use common::m2::*;
use common::{fake_bin, wait_for};
use drivers::claude::ClaudeStreamDriver;
use serde_json::json;
use std::sync::Arc;

#[tokio::test]
async fn a_start_maps_the_folder_and_agents_get_the_map_lessons_and_a_history_search() {
    let s = serve().await;
    let _runner = connect(&s, vec![Arc::new(ClaudeStreamDriver { program: fake_bin("fake-claude") })], None).await;
    let dir = tempfile::tempdir_in(s.home.path()).unwrap();
    std::fs::create_dir_all(dir.path().join("messaging")).unwrap();
    std::fs::write(dir.path().join("messaging/README.md"), "# Messaging primitives\n\n## Slack bridge\nsends to Slack\n").unwrap();
    std::fs::write(dir.path().join("messaging/bus.rs"), "fn send() {}").unwrap();
    let (status, rec) = call(&s.router, "POST", "/api/teams", json!({ "request_id": rid(), "template": "blank", "name": "Know" })).await;
    assert_eq!(status, StatusCode::OK, "{rec}");
    let mut draft = rec["draft"].clone();
    draft["agents"] = json!([{ "id": "a", "group_id": null, "name": "Builder", "kind": "claude", "job": "hello", "folder": dir.path().display().to_string(), "x": 40, "y": 40 }]);
    let id = draft["id"].as_str().unwrap().to_string();
    let (status, body) = call(&s.router, "PUT", &format!("/api/teams/{id}"), json!({ "request_id": rid(), "revision": draft["revision"], "draft": draft })).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    s.st.store.lock().unwrap().add_decision(&id, "Builder", "Reuse the message bus; do not build a second one.", "lesson").unwrap();
    start_team(&s, &id).await;
    let a = seat(&id, "a");
    let first = || events(&s.st, &a).into_iter().find_map(|e| match e.body { model::EventBody::MessageQueued { text, .. } => Some(text), _ => None });
    wait_for("the job is sent", || first().is_some()).await;
    let text = first().unwrap();
    assert!(text.contains("Project map, generated at this start") && text.contains("- messaging (2 files") && text.contains("Messaging primitives"), "{text}");
    assert!(text.contains("Reuse the message bus; do not build a second one. (Builder)") && text.contains("search_history"), "{text}");
    assert!(dir.path().join(".sculptured/map.md").exists(), "the full map is in the folder");
    // The agent's job reply ("fake: …") is in the history the team can search, once that turn is past.
    wait_for("the reply is recorded", || events(&s.st, &a).iter().any(|e| matches!(&e.body, model::EventBody::AgentText { .. }))).await;
    let (status, body) = call(&s.router, "POST", &format!("/api/seats/{a}/send"), json!({ "request_id": rid(), "text": "next", "intent": "inform" })).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    wait_for("the next message is queued", || events(&s.st, &a).iter().filter(|e| matches!(&e.body, model::EventBody::MessageQueued { .. })).count() == 2).await;
    let found = controld::knowledge::search_history(&s.st, &a, &json!({ "query": "fake" })).unwrap();
    assert!(found["text"].as_str().unwrap().contains("\"agent\":\"Builder\""), "{found}");
    controld::knowledge::record_lesson(&s.st, &a, &json!({ "lesson": "Check the map first." })).unwrap();
    let (status, view) = call(&s.router, "GET", &format!("/api/teams/{id}/knowledge"), json!(null)).await;
    assert_eq!(status, StatusCode::OK, "{view}");
    assert_eq!(view["maps"][0]["map"]["files"], 2);
    let lesson = view["entries"].as_array().unwrap().iter().find(|e| e["text"] == "Check the map first.").expect("the new lesson").clone();
    let (status, _) = call(&s.router, "POST", &format!("/api/teams/{id}/decisions/{}/confirm", lesson["id"].as_str().unwrap()), json!({})).await;
    assert_eq!(status, StatusCode::OK);
    let (_, view) = call(&s.router, "GET", &format!("/api/teams/{id}/knowledge"), json!(null)).await;
    assert!(view["entries"].as_array().unwrap().iter().any(|e| e["text"] == "Check the map first." && e["confirmed_ms"].is_number()));
}

#[tokio::test]
async fn a_lesson_recorded_mid_run_reaches_running_teammates_with_their_next_message() {
    let s = serve().await;
    let _runner = connect(&s, vec![Arc::new(ClaudeStreamDriver { program: fake_bin("fake-claude") })], None).await;
    let dir = tempfile::tempdir_in(s.home.path()).unwrap();
    let (_, rec) = call(&s.router, "POST", "/api/teams", json!({ "request_id": rid(), "template": "blank", "name": "Know" })).await;
    let mut draft = rec["draft"].clone();
    let folder = dir.path().display().to_string();
    draft["agents"] = json!([
        { "id": "a", "group_id": null, "name": "Scout", "kind": "claude", "job": "scout it", "folder": folder, "x": 40, "y": 40 },
        { "id": "b", "group_id": null, "name": "Builder", "kind": "claude", "job": "build it", "folder": folder, "x": 300, "y": 40 },
    ]);
    let id = draft["id"].as_str().unwrap().to_string();
    let (status, body) = call(&s.router, "PUT", &format!("/api/teams/{id}"), json!({ "request_id": rid(), "revision": draft["revision"], "draft": draft })).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    start_team(&s, &id).await;
    let (a, b) = (seat(&id, "a"), seat(&id, "b"));
    let sent = |who: &str| events(&s.st, who).into_iter().filter_map(|e| match e.body { model::EventBody::MessageQueued { text, .. } => Some(text), _ => None }).collect::<Vec<_>>();
    let replied = |who: &str| events(&s.st, who).iter().any(|e| matches!(&e.body, model::EventBody::TurnEnded { .. }));
    wait_for("both first turns end", || replied(&a) && replied(&b)).await;
    controld::knowledge::record_lesson(&s.st, &a, &json!({ "lesson": "Money helpers live in money.py." })).unwrap();
    for who in [&a, &b] {
        let (status, body) = call(&s.router, "POST", &format!("/api/seats/{who}/send"), json!({ "request_id": rid(), "text": "next step", "intent": "inform" })).await;
        assert_eq!(status, StatusCode::OK, "{body}");
        wait_for("the second message is queued", || sent(who).len() == 2).await;
    }
    let to_b = sent(&b).pop().unwrap();
    assert!(to_b.contains("New lesson from your team since your last message") && to_b.contains("Money helpers live in money.py. (Scout)") && to_b.ends_with("next step"), "{to_b}");
    assert!(!to_b.contains("Project map, generated"), "the briefing itself is not repeated: {to_b}");
    assert_eq!(sent(&a).pop().unwrap(), "next step", "an agent is not told its own lesson back");
    // A search leaves out the asking agent's current turn: its message and its own calls.
    let found = controld::knowledge::search_history(&s.st, &b, &json!({ "query": "next step" })).unwrap();
    let text = found["text"].as_str().unwrap();
    assert!(text.contains("\"agent\":\"Scout\"") && !text.contains("\"agent\":\"Builder\""), "{text}");
}
