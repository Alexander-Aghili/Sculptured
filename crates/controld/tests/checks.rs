mod common;
use common::{m2::*, seat_tools::*, wait_for};
use model::EventBody;
use serde_json::json;

#[tokio::test]
async fn a_finished_turn_runs_the_agents_check_and_the_seat_shows_its_result() {
    let (s, _sup, _dir) = with_tools().await;
    let (_, rec) = call(&s.router, "POST", "/api/teams", json!({ "request_id": rid(), "template": "solo", "practice": true })).await;
    let id = rec["draft"]["id"].as_str().unwrap().to_string();
    let mut draft = rec["draft"].clone();
    draft["agents"][0]["advanced"]["check"] = json!("test -f marker && echo found marker");
    let (status, body) = call(&s.router, "PUT", &format!("/api/teams/{id}"), json!({ "request_id": rid(), "revision": draft["revision"], "draft": draft })).await;
    assert_eq!(status.as_u16(), 200, "{body}");
    start_team(&s, &id).await;
    let seat = s.st.store.lock().unwrap().rig_snapshot(&id).unwrap().unwrap().seats[0].id.clone();

    say(&s, &seat, "hello").await;
    wait_event(&s.st, &seat, "a failed check", |b| matches!(b, EventBody::CheckRan { passed: false, .. })).await;
    let check = s.st.store.lock().unwrap().seat(&seat).unwrap().unwrap().check.unwrap();
    assert_eq!((check.passed, check.exit_code, check.command.as_str()), (Some(false), Some(1), "test -f marker && echo found marker"));

    let cwd = s.st.store.lock().unwrap().seat(&seat).unwrap().unwrap().cwd.unwrap();
    std::fs::write(std::path::Path::new(&cwd).join("marker"), "").unwrap();
    let (status, _) = call(&s.router, "POST", &format!("/api/seats/{seat}/check"), json!({})).await;
    assert_eq!(status.as_u16(), 202);
    wait_for("a passing check", || s.st.store.lock().unwrap().seat(&seat).unwrap().unwrap().check.is_some_and(|c| c.passed == Some(true))).await;
    let check = s.st.store.lock().unwrap().seat(&seat).unwrap().unwrap().check.unwrap();
    assert_eq!(check.output, "found marker");

    let other = format!("{seat}x");
    let (status, _) = call(&s.router, "POST", &format!("/api/seats/{other}/check"), json!({})).await;
    assert_eq!(status.as_u16(), 409, "an agent without a check is refused");
    stop_team(&s, &id).await;
}
