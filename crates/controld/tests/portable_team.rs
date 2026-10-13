//! Team files (`sculptured.team/v1`): export without machine folders unless asked; import refuses a
//! wrong or broken file before creating anything, listing every issue.
mod common;
use axum::http::StatusCode;
use common::m2::*;
use serde_json::{Value, json};

async fn team_count(s: &Served) -> usize {
    get(&s.router, "/api/teams").await.1.as_array().map(Vec::len).unwrap_or(0)
}

/// A two-agent Practice team with folders, own copies and the restricted posture.
async fn designed(s: &Served) -> (String, String) {
    let id = practice_chain(s, "Exported", &[("a", "Alpha", "plan"), ("b", "Beta", "build")], &[("a", "b")]).await;
    let folder = s.home.path().join("proj");
    std::fs::create_dir_all(&folder).unwrap();
    let folder = folder.display().to_string();
    let (_, rec) = get(&s.router, &format!("/api/teams/{id}")).await;
    let mut draft = rec["draft"].clone();
    draft["folder"] = json!(folder);
    draft["agents"][1]["folder"] = json!(folder);
    let (status, body) = call(&s.router, "PUT", &format!("/api/teams/{id}"), json!({ "request_id": rid(), "revision": draft["revision"], "draft": draft })).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let (status, body) = call(&s.router, "PUT", &format!("/api/teams/{id}/settings"), json!({ "settings": { "posture": "restricted", "question_timeout_min": null, "own_copies": true } })).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    (id, folder)
}

fn without_machine_parts(mut d: Value) -> Value {
    for k in ["id", "revision", "folder"] { d.as_object_mut().unwrap().remove(k); }
    for a in d["agents"].as_array_mut().unwrap() { a.as_object_mut().unwrap().remove("folder"); }
    d
}

#[tokio::test]
async fn a_team_exports_without_folders_and_imports_as_an_identical_new_team() {
    let s = serve().await;
    let (id, folder) = designed(&s).await;
    let (status, file) = get(&s.router, &format!("/api/teams/{id}/file")).await;
    assert_eq!(status, StatusCode::OK, "{file}");
    assert_eq!(file["format"], "sculptured.team/v1");
    assert!(!file.to_string().contains(&folder), "no machine folder in the file: {file}");
    assert_eq!((file["settings"]["own_copies"].clone(), file["settings"]["posture"].clone()), (json!(true), json!("restricted")));

    let (status, imported) = call(&s.router, "POST", "/api/teams/import-file", json!({ "request_id": rid(), "file": file })).await;
    assert_eq!(status, StatusCode::OK, "{imported}");
    let new_id = imported["team"]["draft"]["id"].as_str().unwrap().to_string();
    assert_ne!(new_id, id, "a new team");
    let (_, original) = get(&s.router, &format!("/api/teams/{id}")).await;
    assert_eq!(without_machine_parts(imported["team"]["draft"].clone()), without_machine_parts(original["draft"].clone()));
    let (_, settings) = get(&s.router, &format!("/api/teams/{new_id}/settings")).await;
    assert_eq!((settings["own_copies"].clone(), settings["posture"].clone()), (json!(true), json!("restricted")));

    let (_, with) = get(&s.router, &format!("/api/teams/{id}/file?folders=true")).await;
    assert_eq!((with["team"]["folder"].clone(), with["team"]["agents"][1]["folder"].clone()), (json!(folder), json!(folder)));
}

#[tokio::test]
async fn a_wrong_or_broken_file_creates_nothing_and_says_why() {
    let s = serve().await;
    let (id, _) = designed(&s).await;
    let (_, file) = get(&s.router, &format!("/api/teams/{id}/file")).await;
    let before = team_count(&s).await;

    let mut v2 = file.clone();
    v2["format"] = json!("sculptured.team/v2");
    let (status, err) = call(&s.router, "POST", "/api/teams/import-file", json!({ "request_id": rid(), "file": v2 })).await;
    assert_eq!((status, err["error"]["code"].as_str()), (StatusCode::UNPROCESSABLE_ENTITY, Some("team_file_invalid")), "{err}");
    assert!(err.to_string().contains("sculptured.team/v1"), "names the expected format: {err}");

    let (status, err) = call(&s.router, "POST", "/api/teams/import-file", json!({ "request_id": rid(), "file": {} })).await;
    assert_eq!((status, err["error"]["code"].as_str()), (StatusCode::UNPROCESSABLE_ENTITY, Some("team_file_invalid")), "{err}");

    let mut broken = file.clone();
    broken["team"]["connections"] = json!([{ "id": "c-x", "from": "a", "to": "ghost", "kind": "hands-work-to" }]);
    let dup = broken["team"]["agents"][0].clone();
    broken["team"]["agents"].as_array_mut().unwrap().push(dup);
    let (status, err) = call(&s.router, "POST", "/api/teams/import-file", json!({ "request_id": rid(), "file": broken })).await;
    assert_eq!((status, err["error"]["code"].as_str()), (StatusCode::UNPROCESSABLE_ENTITY, Some("team_invalid")), "{err}");
    let issues = err["error"]["issues"].as_array().unwrap();
    assert!(issues.len() >= 2, "every issue is listed, not just the first: {err}");

    assert_eq!(team_count(&s).await, before, "nothing was created");
}

#[tokio::test]
async fn a_claude_team_without_folders_imports_and_its_missing_folders_are_warnings() {
    let s = serve().await;
    let (id, _) = designed(&s).await;
    let (_, mut file) = get(&s.router, &format!("/api/teams/{id}/file")).await;
    for a in file["team"]["agents"].as_array_mut().unwrap() { a["kind"] = json!("claude"); }
    let (status, imported) = call(&s.router, "POST", "/api/teams/import-file", json!({ "request_id": rid(), "file": file })).await;
    assert_eq!(status, StatusCode::OK, "{imported}");
    let codes: Vec<&str> = imported["warnings"].as_array().unwrap().iter().filter_map(|i| i["code"].as_str()).collect();
    assert!(codes.contains(&"folder-missing"), "shown so the user can choose a folder in Design: {codes:?}");
}

#[tokio::test]
async fn duplicate_agent_ids_are_refused() {
    let s = serve().await;
    let (id, _) = designed(&s).await;
    let (_, mut file) = get(&s.router, &format!("/api/teams/{id}/file")).await;
    let mut dup = file["team"]["agents"][0].clone();
    dup["name"] = json!("Another name");
    file["team"]["agents"].as_array_mut().unwrap().push(dup);
    let (status, err) = call(&s.router, "POST", "/api/teams/import-file", json!({ "request_id": rid(), "file": file })).await;
    assert_eq!((status, err["error"]["code"].as_str()), (StatusCode::UNPROCESSABLE_ENTITY, Some("team_invalid")), "{err}");
    assert!(err.to_string().contains("agent-id-invalid"), "{err}");
}

#[tokio::test]
async fn a_file_can_be_checked_without_creating_a_team() {
    let s = serve().await;
    let (id, _) = designed(&s).await;
    let (_, file) = get(&s.router, &format!("/api/teams/{id}/file")).await;
    let before = team_count(&s).await;
    let (status, v) = call(&s.router, "POST", "/api/teams/check-file", json!({ "file": file })).await;
    assert_eq!(status, StatusCode::OK, "{v}");
    assert!(v["issues"].is_array());
    let mut v2 = file.clone();
    v2["format"] = json!("sculptured.team/v2");
    let (status, err) = call(&s.router, "POST", "/api/teams/check-file", json!({ "file": v2 })).await;
    assert_eq!((status, err["error"]["code"].as_str()), (StatusCode::UNPROCESSABLE_ENTITY, Some("team_file_invalid")), "{err}");
    assert_eq!(team_count(&s).await, before, "nothing was created");
}

#[tokio::test]
async fn an_imported_team_keeps_where_it_came_from() {
    let s = serve().await;
    let (id, _) = designed(&s).await;
    let (_, file) = get(&s.router, &format!("/api/teams/{id}/file")).await;
    let origin = json!({ "kind": "generated", "cli": "claude", "model": null, "at_ms": 1, "prompt": "docs team" });
    let (status, imported) = call(&s.router, "POST", "/api/teams/import-file", json!({ "request_id": rid(), "file": file, "origin": origin })).await;
    assert_eq!(status, StatusCode::OK, "{imported}");
    let new_id = imported["team"]["draft"]["id"].as_str().unwrap().to_string();
    let (_, rec) = get(&s.router, &format!("/api/teams/{new_id}")).await;
    assert_eq!((rec["origin"]["cli"].clone(), rec["origin"]["prompt"].clone()), (json!("claude"), json!("docs team")), "{rec}");
    let (_, plain) = call(&s.router, "POST", "/api/teams/import-file", json!({ "request_id": rid(), "file": file })).await;
    assert!(plain["team"].get("origin").is_none_or(|o| o.is_null()), "{plain}");
}
