//! The gstack-style example team (`examples/teams/gstack-roles.sculptured-team.json`) is a valid
//! team file: it matches the published schema, carries no machine folder, passes every draft check and imports
//! with no issue once a folder is set. Every job credits gstack and none requires it. Nothing here
//! starts the team or calls a model.
mod common;
use axum::http::StatusCode;
use common::m2::*;
use controld::portable;
use serde_json::{json, Value};

fn file() -> Value {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../examples/teams/gstack-roles.sculptured-team.json");
    serde_json::from_str(&std::fs::read_to_string(path).expect("the team file")).expect("JSON")
}

#[test]
fn the_gstack_team_file_matches_the_schema_and_passes_the_draft_checks() {
    let raw = file();
    let schemas: std::collections::HashMap<_, _> = portable::schemas().into_iter().collect();
    let v = jsonschema::validator_for(&serde_json::to_value(&schemas["team-v1.json"]).unwrap()).unwrap();
    let errors: Vec<String> = v.iter_errors(&raw).map(|e| e.to_string()).collect();
    assert!(errors.is_empty(), "{errors:?}");

    let parsed: portable::team::TeamFile = serde_json::from_value(raw).expect("a sculptured.team/v1 file");
    assert_eq!(parsed.format, portable::team::TEAM_FORMAT);
    // The file carries no folder, so it is portable: without one, "needs a folder" is the only issue.
    let d = &parsed.team;
    assert!(d.folder.is_none() && d.agents.iter().all(|a| a.folder.is_none()));
    let missing = rigspec::validate_draft(d);
    assert!(!missing.is_empty() && missing.iter().all(|i| i.code == "folder-missing"), "{missing:#?}");
    let mut placed = d.clone();
    placed.folder = Some("/home/someone/my-project".into());
    let build = rigspec::from_draft(&placed).unwrap_or_else(|issues| panic!("draft errors: {issues:#?}"));
    assert!(build.warnings.is_empty(), "{:#?}", build.warnings);

    let groups: Vec<_> = d.groups.iter().map(|g| g.label.as_str()).collect();
    assert_eq!(groups, ["Think & plan", "Build", "Review & QA", "Ship", "Reflect"]);
    assert!(d.workflow.is_none(), "plain hands-work-to connections, no workflow");
    assert_eq!(d.connections.len(), 8);
    for a in &d.agents {
        assert!(a.advanced.model.is_some() && a.advanced.token_limit.is_some(), "{}: names its model and a token limit", a.id);
        assert!(a.job.contains("https://github.com/garrytan/gstack") && a.job.contains("MIT"), "{}: credits gstack", a.id);
        assert!(a.job.contains("it is not required"), "{}: gstack stays optional", a.id);
    }
}

#[tokio::test]
async fn importing_the_gstack_team_file_finds_no_issue_once_it_has_a_folder() {
    let s = serve().await;
    let mut f = file();
    let folder = s.home.path().join("my-project");
    std::fs::create_dir_all(&folder).unwrap();
    f["team"]["folder"] = json!(folder.display().to_string());
    let (status, v) = call(&s.router, "POST", "/api/teams/check-file", json!({ "file": f })).await;
    assert_eq!(status, StatusCode::OK, "{v}");
    assert_eq!(v["issues"], json!([]), "{v}");
}
