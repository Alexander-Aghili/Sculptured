//! Generating teams with the user's own CLI: questions, alternatives as laid-out team files, retry.
//! The CLIs are fixtures; no model is called.
mod common;
use axum::http::StatusCode;
use common::m2::*;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

/// A fake `claude` that answers questions with `questions.json` and teams with `teams.json` from
/// `dir` (each a full `--output-format json` result), logging each prompt.
fn fake_claude(dir: &Path, body: &str) -> PathBuf {
    let p = dir.join("claude");
    std::fs::write(&p, format!("#!/bin/sh\n[ \"$1\" = --version ] && exit 0\nD={}\ncat >> $D/prompts\necho '---' >> $D/prompts\n{body}\n", dir.display())).unwrap();
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
    for _ in 0..100 {
        match std::process::Command::new(&p).arg("--version").output() {
            Err(e) if e.raw_os_error() == Some(26) => std::thread::sleep(std::time::Duration::from_millis(20)),
            _ => break,
        }
    }
    p
}

const BY_SCHEMA: &str = r#"case "$*" in *alternatives*) cat $D/teams.json;; *) cat $D/questions.json;; esac"#;

async fn served_with(claude: PathBuf) -> Served {
    let mut s = serve().await;
    s.st = s.st.clone().with_cli_programs(Some(claude), None);
    s.router = controld::app(s.st.clone(), None);
    s
}

fn result(v: Value) -> String {
    json!({ "type": "result", "structured_output": v }).to_string()
}

fn sketch(name: &str, agents: &[&str], arrows: &[(&str, &str)]) -> Value {
    json!({
        "name": name,
        "groups": [],
        "agents": agents.iter().map(|a| json!({ "name": a, "kind": "claude", "group": null, "job": format!("Do {a}'s part"), "check": null })).collect::<Vec<_>>(),
        "arrows": arrows.iter().map(|(f, t)| json!({ "from": f, "to": t, "kind": "hands-work-to" })).collect::<Vec<_>>(),
    })
}

fn opts(extra: Value) -> Value {
    let mut o = json!({ "cli": "claude", "model": null, "size": null, "kinds": null, "shape": null, "checks": false, "folder": null, "host": null, "team": null });
    for (k, v) in extra.as_object().unwrap() { o[k] = v.clone(); }
    o
}

#[tokio::test]
async fn questions_come_back_as_two_to_four_with_suggestions() {
    let d = tempfile::tempdir().unwrap();
    std::fs::write(d.path().join("questions.json"), result(json!({ "questions": [
        { "question": "Which framework?", "suggestions": ["Astro", "Next.js"] },
        { "question": "Who reviews?", "suggestions": ["A reviewer agent", "Nobody"] },
        { "question": "Tests?", "suggestions": ["Yes", "No"] },
    ]}))).unwrap();
    let s = served_with(fake_claude(d.path(), BY_SCHEMA)).await;
    let (status, v) = call(&s.router, "POST", "/api/generate/questions", json!({ "options": opts(json!({})), "prompt": "Rebuild our docs site" })).await;
    assert_eq!(status, StatusCode::OK, "{v}");
    assert_eq!(v["questions"].as_array().unwrap().len(), 3);
    assert!(std::fs::read_to_string(d.path().join("prompts")).unwrap().contains("Rebuild our docs site"));
}

#[tokio::test]
async fn three_alternatives_become_team_files_laid_out_with_issues() {
    let d = tempfile::tempdir().unwrap();
    std::fs::write(d.path().join("teams.json"), result(json!({ "alternatives": [
        { "label": "lean", "rationale": "Two agents.", "team": sketch("Docs", &["Writer", "Editor"], &[("Writer", "Editor")]) },
        { "label": "balanced", "rationale": "A chain.", "team": sketch("Docs", &["Planner", "Writer", "Editor"], &[("Planner", "Writer"), ("Writer", "Editor"), ("Editor", "Ghost")]) },
        { "label": "thorough", "rationale": "Four.", "team": sketch("Docs", &["Planner", "Writer", "Editor", "Checker"], &[("Planner", "Writer")]) },
    ]}))).unwrap();
    let s = served_with(fake_claude(d.path(), BY_SCHEMA)).await;
    let (status, v) = call(&s.router, "POST", "/api/generate/teams", json!({ "options": opts(json!({})), "prompt": "docs", "answers": [], "count": 3 })).await;
    assert_eq!(status, StatusCode::OK, "{v}");
    let alts = v["alternatives"].as_array().unwrap();
    assert_eq!(alts.len(), 3);
    assert!(alts.iter().all(|a| a["file"]["format"] == "sculptured.team/v1" && a["issues"].is_array()));
    let balanced = &alts[1];
    let x = |name: &str| balanced["file"]["team"]["agents"].as_array().unwrap().iter().find(|a| a["name"] == name).unwrap()["x"].as_i64().unwrap();
    assert!(x("Planner") < x("Writer") && x("Writer") < x("Editor"), "laid out along the chain");
    assert!(balanced["dropped"].to_string().contains("Ghost"), "{}", balanced["dropped"]);
    assert_eq!(balanced["file"]["team"]["connections"].as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn practice_option_makes_every_agent_practice_and_the_folder_is_set() {
    let d = tempfile::tempdir().unwrap();
    std::fs::write(d.path().join("teams.json"), result(json!({ "alternatives": [
        { "label": "team", "rationale": "One.", "team": sketch("Docs", &["Writer", "Editor"], &[("Writer", "Editor")]) },
    ]}))).unwrap();
    let s = served_with(fake_claude(d.path(), BY_SCHEMA)).await;
    let folder = s.home.path().join("docs");
    std::fs::create_dir_all(&folder).unwrap();
    let (status, v) = call(&s.router, "POST", "/api/generate/teams", json!({ "options": opts(json!({ "kinds": "practice", "folder": folder.display().to_string() })), "prompt": "docs", "answers": [], "count": 1 })).await;
    assert_eq!(status, StatusCode::OK, "{v}");
    let team = &v["alternatives"][0]["file"]["team"];
    assert!(team["agents"].as_array().unwrap().iter().all(|a| a["kind"] == "practice"));
    assert_eq!(team["folder"], json!(folder.display().to_string()));
}

#[tokio::test]
async fn a_bad_answer_is_retried_once_then_reported_with_the_raw_text() {
    let d = tempfile::tempdir().unwrap();
    let s = served_with(fake_claude(d.path(), r#"echo x >> $D/calls; echo '{"type":"result","result":"nonsense"}'"#)).await;
    let (status, v) = call(&s.router, "POST", "/api/generate/teams", json!({ "options": opts(json!({})), "prompt": "docs", "answers": [], "count": 1 })).await;
    assert_eq!((status, v["error"]["code"].as_str()), (StatusCode::BAD_GATEWAY, Some("generate_unusable")), "{v}");
    assert!(v.to_string().contains("nonsense"), "the raw answer is shown: {v}");
    assert_eq!(std::fs::read_to_string(d.path().join("calls")).unwrap().lines().count(), 2, "one retry");

    let d = tempfile::tempdir().unwrap();
    std::fs::write(d.path().join("teams.json"), result(json!({ "alternatives": [
        { "label": "team", "rationale": "One.", "team": sketch("Docs", &["Writer"], &[]) },
    ]}))).unwrap();
    let s = served_with(fake_claude(d.path(), r#"echo x >> $D/calls; if [ "$(wc -l < $D/calls)" -eq 1 ]; then echo garbage; else cat $D/teams.json; fi"#)).await;
    let (status, v) = call(&s.router, "POST", "/api/generate/teams", json!({ "options": opts(json!({})), "prompt": "docs", "answers": [], "count": 1 })).await;
    assert_eq!(status, StatusCode::OK, "the retry's answer is used: {v}");
    assert!(std::fs::read_to_string(d.path().join("prompts")).unwrap().contains("could not be used"), "the retry says why");
}

#[tokio::test]
async fn duplicate_agent_names_get_unique_ids() {
    let d = tempfile::tempdir().unwrap();
    std::fs::write(d.path().join("teams.json"), result(json!({ "alternatives": [
        { "label": "team", "rationale": "Two writers.", "team": sketch("Docs", &["Writer", "Writer"], &[]) },
    ]}))).unwrap();
    let s = served_with(fake_claude(d.path(), BY_SCHEMA)).await;
    let (status, v) = call(&s.router, "POST", "/api/generate/teams", json!({ "options": opts(json!({})), "prompt": "docs", "answers": [], "count": 1 })).await;
    assert_eq!(status, StatusCode::OK, "{v}");
    let agents = v["alternatives"][0]["file"]["team"]["agents"].as_array().unwrap();
    assert_ne!(agents[0]["id"], agents[1]["id"]);
}

fn one_team(dir: &Path, team: Value) {
    std::fs::write(dir.join("teams.json"), result(json!({ "alternatives": [{ "label": "team", "rationale": "One.", "team": team }] }))).unwrap();
}

#[tokio::test]
async fn two_arrows_between_the_same_agents_keep_distinct_ids() {
    let d = tempfile::tempdir().unwrap();
    let mut t = sketch("Docs", &["A", "B", "C", "A-B"], &[("A", "B")]);
    t["arrows"] = json!([
        { "from": "A", "to": "B", "kind": "hands-work-to" },
        { "from": "A", "to": "B", "kind": "watches" },
        { "from": "A-B", "to": "C", "kind": "hands-work-to" },
        { "from": "A", "to": "C", "kind": "hands-work-to" },
    ]);
    one_team(d.path(), t);
    let s = served_with(fake_claude(d.path(), BY_SCHEMA)).await;
    let (_, v) = call(&s.router, "POST", "/api/generate/teams", json!({ "options": opts(json!({})), "prompt": "docs", "answers": [], "count": 1 })).await;
    let ids: Vec<String> = v["alternatives"][0]["file"]["team"]["connections"].as_array().unwrap().iter().map(|c| c["id"].as_str().unwrap().to_string()).collect();
    assert_eq!(ids.len(), 4, "{ids:?}");
    assert_eq!(ids.iter().collect::<std::collections::HashSet<_>>().len(), 4, "every arrow has its own id: {ids:?}");
}

#[tokio::test]
async fn agents_sharing_a_name_are_renamed_and_names_match_regardless_of_case() {
    let d = tempfile::tempdir().unwrap();
    let mut t = sketch("Docs", &["Writer", "Writer", "Editor"], &[]);
    t["arrows"] = json!([{ "from": "writer", "to": " Editor ", "kind": "hands-work-to" }]);
    one_team(d.path(), t);
    let s = served_with(fake_claude(d.path(), BY_SCHEMA)).await;
    let (_, v) = call(&s.router, "POST", "/api/generate/teams", json!({ "options": opts(json!({})), "prompt": "docs", "answers": [], "count": 1 })).await;
    let alt = &v["alternatives"][0];
    let names: Vec<&str> = alt["file"]["team"]["agents"].as_array().unwrap().iter().map(|a| a["name"].as_str().unwrap()).collect();
    assert_eq!(names, ["Writer", "Writer 2", "Editor"], "the second is renamed so arrows and people can tell them apart");
    assert!(alt["dropped"].to_string().contains("Writer 2"), "and that is said: {}", alt["dropped"]);
    assert_eq!(alt["file"]["team"]["connections"].as_array().unwrap().len(), 1, "\"writer\" and \" Editor \" still match");
}

#[tokio::test]
async fn the_schemas_leave_counts_to_the_server() {
    let d = tempfile::tempdir().unwrap();
    // Asked for 3, the CLI gives 2: they are shown (no failed retry over a count).
    std::fs::write(d.path().join("teams.json"), result(json!({ "alternatives": [
        { "label": "lean", "rationale": "A.", "team": sketch("Docs", &["Writer"], &[]) },
        { "label": "thorough", "rationale": "B.", "team": sketch("Docs", &["Writer", "Editor"], &[]) },
    ]}))).unwrap();
    let s = served_with(fake_claude(d.path(), &format!(r#"printf '%s\n' "$@" > $D/args; {BY_SCHEMA}"#))).await;
    let (status, v) = call(&s.router, "POST", "/api/generate/teams", json!({ "options": opts(json!({})), "prompt": "docs", "answers": [], "count": 3 })).await;
    assert_eq!(status, StatusCode::OK, "{v}");
    assert_eq!(v["alternatives"].as_array().unwrap().len(), 2);
    let args = std::fs::read_to_string(d.path().join("args")).unwrap();
    assert!(!args.contains("minItems") && !args.contains("maxItems"), "structured-output modes may refuse item limits: {args}");
}
