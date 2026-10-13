mod common;
use common::{m2::*,seat_tools::*};
use serde_json::json;
#[tokio::test]
async fn hide_trash_restore_are_persistent_and_do_not_remove_drafts() {
    let s=serve().await;
    let (status,created)=call(&s.router,"POST","/api/teams",json!({"request_id":rid(),"template":"blank","name":"Visibility test"})).await;
    assert_eq!(status,200);
    let id=created["draft"]["id"].as_str().unwrap();
    let endpoint=format!("/api/project-visibility/{id}");
    for state in ["hidden","trashed"] {
        let (status,result)=call(&s.router,"PUT",&endpoint,json!({"status":state})).await;
        assert_eq!(status,200,"{result}");
        let (_,rows)=call(&s.router,"GET","/api/project-visibility",json!({})).await;
        assert_eq!(rows[0]["status"],state);
        assert!(s.st.store.lock().unwrap().draft(id).unwrap().is_some());
    }
    let (status,result)=call(&s.router,"PUT",&format!("/api/teams/{id}"),json!({"request_id":rid(),"revision":created["draft"]["revision"],"draft":created["draft"]})).await;
    assert_eq!(status,409);assert_eq!(result["error"]["code"],"project_trashed");
    let (status,result)=call(&s.router,"POST",&format!("/api/teams/{id}/start"),json!({"request_id":rid(),"revision":created["draft"]["revision"]})).await;
    assert_eq!(status,409);assert_eq!(result["error"]["code"],"project_trashed");
    assert_eq!(call(&s.router,"PUT",&endpoint,json!({"status":"visible"})).await.0,200);
    assert_eq!(call(&s.router,"GET","/api/project-visibility",json!({})).await.1,json!([]));
    assert_eq!(call(&s.router,"PUT","/api/project-visibility/missing",json!({"status":"hidden"})).await.0,404);
    assert_eq!(call(&s.router,"PUT",&endpoint,json!({"status":"invalid"})).await.0,422);
}
#[tokio::test]
async fn running_agents_can_be_hidden_but_cannot_be_trashed_or_stopped_implicitly() {
    let (s,_sup,_dir)=with_tools().await;
    let id=practice_team(&s,"solo").await;
    let endpoint=format!("/api/project-visibility/{id}");
    assert_eq!(call(&s.router,"PUT",&endpoint,json!({"status":"hidden"})).await.0,200);
    let (status,result)=call(&s.router,"PUT",&endpoint,json!({"status":"trashed"})).await;
    assert_eq!(status,409,"{result}");assert_eq!(result["error"]["code"],"project_running");
    assert!(s.st.store.lock().unwrap().rig_snapshot(&id).unwrap().unwrap().seats.iter().any(|a|controld::store::is_live(a.lifecycle)));
    let claim=s.st.try_begin_boot(&id).unwrap();
    assert_eq!(call(&s.router,"PUT",&endpoint,json!({"status":"visible"})).await.0,409);
    drop(claim);
    assert_eq!(call(&s.router,"PUT",&endpoint,json!({"status":"visible"})).await.0,200);
}
