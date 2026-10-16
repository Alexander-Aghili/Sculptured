//! MADL files: a team exports as a valid MADL document and comes back identical; a MADL file
//! written elsewhere imports as a team, listing what Sculptured can't keep.
mod common;
use axum::http::StatusCode;
use common::m2::*;
use controld::portable::madl::{read, to_madl};
use controld::portable::team::{PortableSettings, TeamFile, TEAM_FORMAT, TEAM_SCHEMA_URL};
use serde_json::json;

fn file_of(team: model::TeamDraft, settings: PortableSettings) -> TeamFile {
    TeamFile { schema: Some(TEAM_SCHEMA_URL.into()), format: TEAM_FORMAT.into(), team, settings }
}

/// Export to MADL YAML, read it back, and check nothing changed.
fn round_trip(file: &TeamFile) {
    let doc = to_madl(file);
    let report = madl::validate(&doc);
    assert!(report.is_ok(), "the export is valid MADL: {:?}", report.diagnostics);
    let yaml = serde_yaml_ng::to_string(&doc).unwrap();
    let back = read(&yaml).unwrap_or_else(|e| panic!("{e:?}\n{yaml}"));
    assert!(back.dropped.is_empty(), "nothing dropped: {:?}", back.dropped);
    assert_eq!(serde_json::to_value(&back.file).unwrap(), serde_json::to_value(file).unwrap(), "{yaml}");
}

#[test]
fn an_example_team_round_trips_through_madl() {
    let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../examples/teams/gstack-roles.sculptured-team.json")).unwrap();
    let mut file: TeamFile = serde_json::from_str(&text).unwrap();
    file.team.revision = 0;
    round_trip(&file);
}

#[test]
fn budgets_and_agent_limits_round_trip_through_madl() {
    let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../examples/teams/gstack-roles.sculptured-team.json")).unwrap();
    let mut file: TeamFile = serde_json::from_str(&text).unwrap();
    file.team.revision = 0;
    file.team.budget = serde_json::from_value(json!({
        "plan": [{ "provider": "claude", "window": "five_hour", "soft": 25.0, "hard": 30.0, "pause": { "continue_with": "resume", "max_windows": 2 } }, { "provider": "codex", "window": "seven_day", "hard": 10.0 }],
        "tokens": { "hard": 50000000 }, "minutes": { "soft": 45, "hard": 60 }, "max_working": 6,
    })).unwrap();
    let a = &mut file.team.agents[0].advanced;
    a.token_limit = Some(serde_json::from_value(json!({ "tokens": 2000000, "soft": 1000000, "counts": "all", "include_subagents": false })).unwrap());
    a.turn_limit = Some(model::SoftHard { soft: None, hard: 40 });
    a.minute_limit = Some(model::SoftHard { soft: Some(20), hard: 30 });
    file.team.claude_setup = model::ClaudeSetup { global: true, project: false };
    round_trip(&file);
    let doc = to_madl(&file);
    let yaml = serde_yaml_ng::to_string(&doc).unwrap();
    assert!(yaml.contains("wall_clock:\n      soft: 45m\n      hard: 60m") && yaml.contains("max_working: 6"), "{yaml}");
}

#[test]
fn a_workflow_team_round_trips_and_its_stages_are_drawn_in_madl() {
    let mut team = rigspec::textbook::template("book", "Book", true);
    team.agents[0].advanced.token_limit = Some(model::TokenLimit { soft: None, tokens: 50_000, counts: model::TokenCount::Output, include_subagents: false });
    team.agents[1].advanced.model = Some("claude-opus-5-5".into());
    let w = team.workflow.as_mut().unwrap();
    let first = w.stages[0].id.clone();
    w.stages[0].routes.insert("check".into(), Some("verify".into()));
    w.stages.push(model::WorkflowStage { id: "verify".into(), name: "Verify".into(), kind: model::StageKind::Check, command: Some("make verify".into()), routes: [("failed".to_string(), Some(first)), ("passed".to_string(), Some("sign-off".to_string()))].into(), ..Default::default() });
    w.stages.push(model::WorkflowStage { id: "sign-off".into(), name: "Sign off".into(), kind: model::StageKind::Human, prompt: Some("Publish this book?".into()), routes: [("yes".to_string(), None)].into(), ..Default::default() });
    team.input = Some(model::TeamInput { text: "Physics for first years".into(), x: -200, y: 10, to: vec![team.agents[0].id.clone()] });
    let settings = PortableSettings { posture: Some(model::PermissionPosture::Restricted), own_copies: true, question_timeout_min: Some(45) };
    let file = file_of(team, settings);
    round_trip(&file);
    let doc = to_madl(&file);
    assert!(!doc.steps.is_empty(), "check, person and merge stages are MADL steps");
    assert!(doc.connections.iter().any(|c| c.when.as_deref().is_some_and(|w| w.starts_with("outcome =="))), "routes carry their outcome");
}

const FOREIGN: &str = r#"
madl: draft
system: { id: cad-review, name: CAD review }
defaults:
  preferences: { runtime: claude-code, model: anthropic/claude-sonnet-5-5 }
  restrictions: { budget: { tokens: 90000 } }
inputs: [ { id: brief, text: "Design a bracket." } ]
groups: [ { id: design, name: Design } ]
agents:
  - { id: planner, groups: [design], instructions: Plan it. }
  - { id: cad, groups: [design], runtime: camel }
  - { id: lead, runtime: human }
channels: [ { id: chat, medium: direct, protocol: a2a@1.2 } ]
connections:
  - { from: planner, to: cad, kind: handoff, via: chat }
  - { from: cad, to: lead, kind: approve }
communication: { mode: closed, deny: [ { from: cad, to: planner } ] }
"#;

#[test]
fn a_foreign_madl_file_imports_and_lists_what_was_not_kept() {
    let got = read(FOREIGN).unwrap();
    let team = &got.file.team;
    assert_eq!(team.agents.iter().map(|a| a.id.as_str()).collect::<Vec<_>>(), ["planner", "cad"], "the person is not a board agent");
    assert_eq!(team.agents[0].advanced.model.as_deref(), Some("claude-sonnet-5-5"), "the default model, without its provider");
    assert_eq!(team.agents[0].advanced.token_limit.map(|l| l.tokens), Some(90_000));
    assert_eq!(team.input.as_ref().map(|i| i.to.clone()), Some(vec!["planner".to_string()]), "the Input goes to the starting agent");
    let paths: Vec<&str> = got.dropped.iter().map(|d| d.path.as_str()).collect();
    for expected in ["/agents/1/runtime", "/agents/2", "/connections/0", "/connections/1", "/channels/0", "/communication"] {
        assert!(paths.contains(&expected), "{expected} is listed: {paths:?}");
    }
}

#[test]
fn an_invalid_madl_file_is_refused_with_its_errors() {
    let err = read("madl: draft\nsystem: { id: s, name: S }\nagents: [ { id: a, groups: [nope] } ]\n").unwrap_err();
    let text = format!("{err:?}");
    assert!(text.contains("/agents/0/groups/0") && text.contains("unknown-reference"), "{text}");
}

#[tokio::test]
async fn the_api_exports_madl_and_imports_it_as_a_new_team() {
    let s = serve().await;
    let id = practice_chain(&s, "Exported", &[("a", "Alpha", "plan"), ("b", "Beta", "build")], &[("a", "b")]).await;
    let (status, body) = get(&s.router, &format!("/api/teams/{id}/madl")).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let yaml = body["yaml"].as_str().unwrap().to_string();
    assert!(yaml.starts_with("madl: draft"), "{yaml}");
    let (status, imported) = call(&s.router, "POST", "/api/teams/import-madl", json!({ "request_id": rid(), "text": yaml })).await;
    assert_eq!(status, StatusCode::OK, "{imported}");
    assert_ne!(imported["team"]["draft"]["id"], json!(id), "a new team");
    assert_eq!(imported["dropped"], json!([]));
    let names: Vec<&str> = imported["team"]["draft"]["agents"].as_array().unwrap().iter().map(|a| a["name"].as_str().unwrap()).collect();
    assert_eq!(names, ["Alpha", "Beta"]);
    let (status, refused) = call(&s.router, "POST", "/api/teams/import-madl", json!({ "request_id": rid(), "text": "madl: draft\nsystem: { id: s }\n" })).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{refused}");
}
