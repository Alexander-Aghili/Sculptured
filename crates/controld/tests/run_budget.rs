//! Run budgets end to end, with fake-claude agents (no model is called): each `spend` call reports its
//! tokens, and with a plan file adds to a shared 5-hour percent, like one account's agents.
mod common;
use axum::http::StatusCode;
use common::m2::*;
use common::{fake_bin, lifecycle, wait_for};
use controld::budget::BudgetState;
use drivers::claude::ClaudeStreamDriver;
use model::SeatLifecycle;
use serde_json::{json, Value};
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

async fn claude_runner(s: &Served) -> hostd::supervisor::Supervisor {
    connect(s, vec![Arc::new(ClaudeStreamDriver { program: fake_bin("fake-claude") })], None).await
}

/// A team of independent Claude agents in `dir`, each with its own job, and `budget`.
async fn team(s: &Served, dir: &Path, jobs: &[(&str, String)], budget: Value) -> String {
    let (status, rec) = call(&s.router, "POST", "/api/teams", json!({ "request_id": rid(), "template": "blank", "name": "Spend" })).await;
    assert_eq!(status, StatusCode::OK, "{rec}");
    let mut draft = rec["draft"].clone();
    draft["agents"] = jobs.iter().enumerate().map(|(i, (id, job))| json!({ "id": id, "group_id": null, "name": id, "kind": "claude",
        "job": job, "folder": dir.display().to_string(), "x": 40 + 260 * i as i32, "y": 40 })).collect();
    draft["connections"] = json!([]);
    draft["budget"] = budget;
    let id = draft["id"].as_str().unwrap().to_string();
    let (status, body) = call(&s.router, "PUT", &format!("/api/teams/{id}"), json!({ "request_id": rid(), "revision": draft["revision"], "draft": draft })).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    id
}

fn state(s: &Served, id: &str) -> BudgetState {
    controld::budget::status(&s.st, id).unwrap().expect("a budget").state
}

async fn wait_long(what: &str, pred: impl Fn() -> bool) {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(30);
    while !pred() {
        assert!(tokio::time::Instant::now() < deadline, "timed out waiting for {what}");
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

fn plan_percent(file: &Path) -> f64 {
    std::fs::read_to_string(file).map(|s| s.trim().parse().unwrap_or(0.0)).unwrap_or(0.0)
}

#[tokio::test]
async fn a_run_wraps_up_at_soft_and_stops_at_hard_within_the_bound() {
    let s = serve().await;
    let _runner = claude_runner(&s).await;
    let dir = tempfile::tempdir_in(s.home.path()).unwrap();
    let plan = dir.path().join("plan");
    // Each call: 1000 tokens and 0.5% of the window, 30 ms apart; two agents together.
    let job = format!("spend:400:1000:30:{}:0.5", plan.display());
    let id = team(&s, dir.path(), &[("a", job.clone()), ("b", job)], json!({ "plan": [{ "provider": "claude", "window": "five_hour", "soft": 10.0, "hard": 20.0 }] })).await;
    start_team(&s, &id).await;
    wait_long("the run wraps up", || !matches!(state(&s, &id), BudgetState::Normal)).await;
    wait_long("the run is stopped", || matches!(state(&s, &id), BudgetState::Stopped { .. })).await;
    let (a, b) = (seat(&id, "a"), seat(&id, "b"));
    wait_for("both agents stopped", || [&a, &b].iter().all(|x| lifecycle(&s.st, x) == Some(SeatLifecycle::Stopped))).await;
    let r = s.st.store.lock().unwrap().run_budget(&id).unwrap().unwrap();
    assert!(r.wrap_up_ms.is_some(), "it wrapped up before it stopped");
    let BudgetState::Stopped { reason, .. } = &r.state else { unreachable!() };
    assert!(reason.starts_with("Claude 5-hour:") && reason.contains("hard limit of 20.0%"), "{reason}");
    // The account's whole use since the first reading (0.5%), against 20%: the stop comes one call
    // per working agent early (the reserve), so only in-flight calls can pass it.
    let account = plan_percent(&plan) - 0.5;
    assert!(account <= 20.0 + 2.0 * 0.5, "the run added {account:.1}% against a 20% hard limit");
    assert!(account >= 15.0, "it ran most of its budget first: {account:.1}%");
}

#[tokio::test]
async fn with_no_plan_reading_a_learned_rate_still_stops_the_run() {
    let s = serve().await;
    let _runner = claude_runner(&s).await;
    // An earlier run learned 0.001% per token; this run's CLIs report no plan readings at all.
    s.st.store.lock().unwrap().connection().execute("INSERT INTO settings (k, json) VALUES ('budget-rate:claude', '0.001')", []).unwrap();
    let dir = tempfile::tempdir_in(s.home.path()).unwrap();
    let id = team(&s, dir.path(), &[("a", "spend:400:1000:20".into())], json!({ "plan": [{ "provider": "claude", "window": "five_hour", "hard": 10.0 }] })).await;
    start_team(&s, &id).await;
    wait_long("the run is stopped on the estimate", || matches!(state(&s, &id), BudgetState::Stopped { .. })).await;
    let st = controld::budget::status(&s.st, &id).unwrap().unwrap();
    assert!(st.meters[0].estimated, "{:?}", st.meters);
    let r = s.st.store.lock().unwrap().run_budget(&id).unwrap().unwrap();
    assert!(r.peak_tokens <= 10_000 + 2 * 1010, "10% at 0.001%/token is 10 000 tokens: {}", r.peak_tokens);
}

#[tokio::test]
async fn token_and_time_budgets_enforce_without_plan_readings() {
    let s = serve().await;
    let _runner = claude_runner(&s).await;
    let dir = tempfile::tempdir_in(s.home.path()).unwrap();
    let id = team(&s, dir.path(), &[("a", "spend:400:1000:20".into())], json!({ "tokens": { "hard": 30000 } })).await;
    start_team(&s, &id).await;
    wait_long("the token budget stops the run", || matches!(state(&s, &id), BudgetState::Stopped { .. })).await;
    let r = s.st.store.lock().unwrap().run_budget(&id).unwrap().unwrap();
    assert!(r.wrap_up_ms.is_some(), "85% of 30 000 tokens wrapped up first");
    assert!(r.peak_tokens <= 30_000 + 1010, "{}", r.peak_tokens);

    let id = team(&s, dir.path(), &[("a", "spend:400:10:50".into())], json!({ "minutes": { "soft": 0, "hard": 1 } })).await;
    start_team(&s, &id).await;
    wait_long("a soft time limit of 0 wraps up at once", || matches!(state(&s, &id), BudgetState::WrapUp { .. })).await;
}

/// Turn intervals per agent, from its TurnStarted/TurnEnded events: (start seq, end seq).
fn turns(s: &Served, seat: &str) -> Vec<(i64, i64)> {
    let ev = events(&s.st, seat);
    let mut out = vec![];
    let mut open = None;
    for e in ev {
        match e.body {
            model::EventBody::TurnStarted { .. } => open = Some(e.seq),
            model::EventBody::TurnEnded { .. } => out.extend(open.take().map(|o| (o, e.seq))),
            _ => {}
        }
    }
    out
}

#[tokio::test]
async fn a_delivery_waits_for_a_slot_then_runs() {
    let s = serve().await;
    let _runner = claude_runner(&s).await;
    let dir = tempfile::tempdir_in(s.home.path()).unwrap();
    let job = || "spend:10:100:30".to_string();
    let id = team(&s, dir.path(), &[("a", job()), ("b", job()), ("c", job())], json!({ "max_working": 1 })).await;
    start_team(&s, &id).await;
    let seats: Vec<String> = ["a", "b", "c"].iter().map(|a| seat(&id, a)).collect();
    wait_long("every agent ran its job", || seats.iter().all(|x| !turns(&s, x).is_empty())).await;
    let mut all: Vec<(i64, i64)> = seats.iter().flat_map(|x| turns(&s, x)).collect();
    all.sort();
    assert!(all.windows(2).all(|w| w[0].1 < w[1].0), "one agent worked at a time: {all:?}");
}

#[tokio::test]
async fn every_path_to_new_work_is_refused_past_the_soft_value() {
    use controld::budget::gate::{decide, Gate};
    let s = serve().await;
    let _runner = claude_runner(&s).await;
    let dir = tempfile::tempdir_in(s.home.path()).unwrap();
    let id = team(&s, dir.path(), &[("a", "hello".into()), ("b", "hello".into())], json!({ "tokens": { "hard": 1000000 } })).await;
    start_team(&s, &id).await;
    let a = seat(&id, "a");
    wait_for("a's job ran", || !turns(&s, &a).is_empty()).await;
    {
        let store = s.st.store.lock().unwrap();
        let mut r = store.run_budget(&id).unwrap().unwrap();
        r.state = BudgetState::WrapUp { reason: "Tokens: test".into(), at_ms: 1 };
        store.put_run_budget(&id, &r).unwrap();
    }
    // A person's message, through the API.
    let (status, body) = call(&s.router, "POST", &format!("/api/seats/{a}/send"), json!({ "request_id": rid(), "text": "more", "intent": "inform" })).await;
    assert!(status.is_client_error() || status.is_server_error(), "{status} {body}");
    assert!(body.to_string().contains("Run budget: Tokens: test"), "{body}");
    // Every command that starts work, whoever sends it: the gate sits in front of every runner command.
    let store = s.st.store.lock().unwrap();
    let send = host_proto::HostCommand::Send { seat: a.clone(), message_id: "m".into(), intent: model::MessageIntent::Inform, text: "x".into() };
    assert!(matches!(decide(&store, &send).unwrap(), Gate::Refuse(r) if r.contains("Run budget")));
    let interrupt = host_proto::HostCommand::Interrupt { seat: a.clone() };
    assert_eq!(decide(&store, &interrupt).unwrap(), Gate::Pass, "interrupts and stops are never held");
    assert!(controld::budget::gate::refusal(&store, &id).unwrap().is_some(), "spawn_agent refuses before creating a child");
    store.record_control(&a, controld::store::ControlMode::Soft, 0).unwrap();
    assert_eq!(decide(&store, &send).unwrap(), Gate::Pass, "the wrap-up instruction reaches an agent that is wrapping up");
}
