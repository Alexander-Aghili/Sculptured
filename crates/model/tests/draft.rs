use model::*;
use serde_json::json;

fn builder() -> DraftAgent {
    DraftAgent {
        id: "builder".into(),
        group_id: None,
        name: "Builder".into(),
        kind: AgentKind::Practice,
        job: "Build it".into(),
        folder: None,
        x: 40,
        y: 40,
        advanced: AgentAdvanced::default(),
    }
}

fn reviewer() -> DraftAgent {
    DraftAgent {
        id: "reviewer".into(),
        group_id: Some("review".into()),
        name: "Reviewer".into(),
        kind: AgentKind::Claude,
        job: String::new(),
        folder: Some("/home/u/repo".into()),
        x: 300,
        y: 40,
        advanced: AgentAdvanced { model: Some("opus".into()), permission: PermissionPosture::Restricted, resume: ResumeBehaviour::RelaunchFresh, token_limit: None, check: None },
    }
}

fn draft() -> TeamDraft {
    TeamDraft { schedules: vec![], decision_log: false,
        workflow: None,
        folder: None,
        id: "my-team".into(),
        name: "My team".into(),
        groups: vec![],
        agents: vec![builder(), reviewer()],
        connections: vec![DraftConnection { id: "c1".into(), from: "builder".into(), to: "reviewer".into(), kind: ConnectionKind::HandsWorkTo }],
        models: ModelDefaults::default(),
        revision: 3,
    }
}

#[test]
fn draft_wire_shape_round_trips() {
    let d = draft();
    let v = serde_json::to_value(&d).unwrap();
    assert_eq!(v["agents"][0]["kind"], "practice");
    assert_eq!(v["agents"][0]["advanced"], json!({ "model": null, "permission": "unrestricted", "resume": "resume-if-possible" }));
    assert_eq!(v["agents"][1]["advanced"]["resume"], "relaunch-fresh");
    assert_eq!(v["connections"][0]["kind"], "hands-work-to");
    assert_eq!(v["revision"], 3);
    assert_eq!(serde_json::from_value::<TeamDraft>(v).unwrap(), d);
}

#[test]
fn optional_parts_take_defaults() {
    let d: TeamDraft = serde_json::from_value(json!({
        "id": "t", "name": "T", "revision": 0,
        "agents": [{ "id": "a", "group_id": null, "name": "A", "kind": "codex", "folder": null, "x": 0, "y": 0 }]
    }))
    .unwrap();
    assert!(d.groups.is_empty() && d.connections.is_empty());
    assert_eq!(d.agents[0].job, "");
    assert_eq!(d.agents[0].advanced, AgentAdvanced::default());
}

#[test]
fn seat_ids_come_from_immutable_ids_not_names() {
    let mut d = draft();
    assert_eq!(d.seat_id("builder").as_deref(), Some("team.builder@my-team"));
    assert_eq!(d.seat_id("reviewer").as_deref(), Some("review.reviewer@my-team"));
    d.agents[0].name = "Lead builder".into();
    d.name = "Renamed team".into();
    assert_eq!(d.seat_id("builder").as_deref(), Some("team.builder@my-team"));
    assert_eq!(d.seat_id("nobody"), None);
    assert_eq!(DEFAULT_GROUP_ID, "team");
}

#[test]
fn issue_wire_shape() {
    let i = DraftIssue {
        element: ElementRef { kind: ElementKind::Agent, id: "reviewer".into() },
        severity: IssueSeverity::Error,
        code: "folder-missing".into(),
        message: "Reviewer needs a folder to work in".into(),
        detail: None,
        spec_path: None,
    };
    let v = serde_json::to_value(&i).unwrap();
    assert_eq!(v["element"], json!({ "kind": "agent", "id": "reviewer" }));
    assert_eq!(v["severity"], "error");
}

/// C0: a team and each group may set a model per provider. A draft saved before that loads with no
/// defaults (inherit), and empty defaults are left out of the saved JSON, so old drafts stay byte-identical.
#[test]
fn model_defaults_are_optional_and_omitted_when_empty() {
    let old = json!({
        "id": "my-team", "name": "My team", "revision": 3,
        "groups": [{ "id": "g", "label": "G", "x": 0, "y": 0, "w": 1, "h": 1 }],
        "agents": [], "connections": []
    });
    let d: TeamDraft = serde_json::from_value(old.clone()).unwrap();
    assert!(d.models.is_empty());
    assert!(d.groups[0].models.is_empty());
    assert_eq!(d.models, ModelDefaults::default());
    assert_eq!(serde_json::to_value(&d).unwrap(), old, "empty defaults are not written");

    let mut d = d;
    d.models = ModelDefaults { claude: Some("sonnet".into()), codex: None };
    d.groups[0].models = ModelDefaults { claude: None, codex: Some("gpt-6-sol".into()) };
    let v = serde_json::to_value(&d).unwrap();
    assert_eq!(v["models"], json!({ "claude": "sonnet", "codex": null }));
    assert_eq!(v["groups"][0]["models"], json!({ "claude": null, "codex": "gpt-6-sol" }));
    assert_eq!(serde_json::from_value::<TeamDraft>(v).unwrap(), d);
    // A defaults object naming one provider only loads the other as inherit.
    let one: ModelDefaults = serde_json::from_value(json!({ "codex": "gpt-6-luna" })).unwrap();
    assert_eq!(one, ModelDefaults { claude: None, codex: Some("gpt-6-luna".into()) });
    assert!(!one.is_empty());
}
