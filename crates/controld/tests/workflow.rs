mod common;
use common::{m2::*, seat_tools::direct, wait_for};
use axum::http::StatusCode;
use model::TaskStatus;
use serde_json::json;

#[tokio::test]
async fn host_delivery_plain_reply_blocking_retry_and_stop_are_observed() {
    let s = serve().await;
    let _host = connect_stub(&s).await;
    let id = practice_team(&s, "textbook").await;
    let (_, rec) = get(&s.router, &format!("/api/teams/{id}")).await;
    let (code, body) = call(&s.router, "POST", &format!("/api/teams/{id}/textbook/prepare"), json!({"revision":rec["draft"]["revision"]})).await;
    assert_eq!(code, StatusCode::CONFLICT); assert_eq!(body["error"]["code"],"team_running");
    let dispatcher = seat(&id, "dispatcher");
    let reference = format!("webgpu-engine.engine-creator@{id}");
    let args = json!({"batch_id":"one", "summary":"Offline fixture", "tasks":[{"id":"curves","title":"Curves","context":"Fixture source section 1"}]});
    let (ok, _, error) = direct(&s, &dispatcher, "dispatch_work", args).await;
    assert!(ok, "{error:?}");
    wait_for("plain reply blocks instead of advancing", || {
        s.st.store.lock().unwrap().latest_workflow(&id).unwrap().is_some_and(|r| r.tasks[0].status == TaskStatus::Blocked)
    }).await;
    assert_eq!(messages_by(&s.st, &reference, "workflow").len(), 1);
    assert!(messages_by(&s.st, &seat(&id, "frontend"), "workflow").is_empty());
    let (_, view) = get(&s.router, &format!("/api/teams/{id}/workflow")).await;
    assert_eq!(view["active"], true);
    let retry = json!({"task":"curves", "start_seq":view["run"]["start_seq"]});
    let (code, body) = call(&s.router, "POST", &format!("/api/teams/{id}/workflow/retry"), retry.clone()).await;
    assert_eq!(code, StatusCode::OK, "{body}");
    wait_for("second assignment delivered", || messages_by(&s.st, &reference, "workflow").len() == 2).await;
    stop_team(&s, &id).await;
    let (_, view) = get(&s.router, &format!("/api/teams/{id}/workflow")).await;
    assert_eq!(view["active"], false);
    let (code, _) = call(&s.router, "POST", &format!("/api/teams/{id}/workflow/retry"), retry).await;
    assert_eq!(code, StatusCode::CONFLICT);
}
