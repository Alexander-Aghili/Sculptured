mod common;
use common::{lifecycle, m2::*, seat_tools::*, wait_for};
use model::{Actor, EventBody, SeatLifecycle};
use serde_json::json;

#[tokio::test]
async fn managed_children_messages_and_hard_stop_are_observed_and_idempotent() {
    let (s, _sup, _dir) = with_tools().await;
    let id = practice_team(&s, "solo").await;
    let parent = seat(&id, "claude");
    let args = json!({"request_id":"child1","name":"Geometry helper","task":"Check sampled curve endpoints"});
    let (ok, result, error) = direct(&s, &parent, "spawn_agent", args.clone()).await;
    assert!(ok, "{error:?}");
    let child = result["child"].as_str().unwrap().to_string();
    let (ok, replayed, error) = direct(&s, &parent, "spawn_agent", args).await;
    assert!(ok, "{error:?}");
    assert_eq!(result, replayed);
    let snap =
        s.st.store
            .lock()
            .unwrap()
            .rig_snapshot(&id)
            .unwrap()
            .unwrap();
    assert_eq!(snap.rig.seats.len(), 2);
    assert!(
        snap.rig
            .edges
            .iter()
            .any(|e| e.from == child && e.to == parent)
    );
    assert_eq!(snap.rig.seats[0].cwd, snap.rig.seats[1].cwd);
    assert_eq!(
        snap.rig.seats[0].permission_policy,
        snap.rig.seats[1].permission_policy
    );
    let args =
        json!({"request_id":"msg1","to":parent,"text":"Endpoint check: complete, see result."});
    let (ok, result, error) = direct(&s, &child, "send_agent_message", args.clone()).await;
    assert!(ok, "{error:?}");
    let (ok, replay, _) = direct(&s, &child, "send_agent_message", args).await;
    assert!(ok);
    assert_eq!(replay, result);
    assert_eq!(
        events(&s.st, &parent)
            .iter()
            .filter(|e| e.actor == Actor::Seat(child.clone())
                && e.provenance == model::Provenance::AgentReported
                && matches!(e.body, EventBody::MessageQueued { .. }))
            .count(),
        1
    );
    let (ok, _, _) = direct(
        &s,
        &child,
        "send_agent_message",
        json!({"request_id":"bad","to":"other.project@elsewhere","text":"No"}),
    )
    .await;
    assert!(!ok);
    let (status, body) = call(
        &s.router,
        "POST",
        &format!("/api/seats/{parent}/control"),
        json!({"request_id":rid(),"mode":"hard"}),
    )
    .await;
    assert!(status.is_success(), "{body}");
    wait_for("parent and child stopped", || {
        lifecycle(&s.st, &parent) == Some(SeatLifecycle::Stopped)
            && lifecycle(&s.st, &child) == Some(SeatLifecycle::Stopped)
    })
    .await;
    let (ok, _, _) = direct(
        &s,
        &parent,
        "spawn_agent",
        json!({"request_id":"no-after-stop","name":"No","task":"No"}),
    )
    .await;
    assert!(!ok);
    controld::reconciler::restart_seat(&s.st, &parent)
        .await
        .unwrap();
    wait_for("parent restarted", || {
        lifecycle(&s.st, &parent) == Some(SeatLifecycle::Running)
    })
    .await;
    assert!(
        s.st.store
            .lock()
            .unwrap()
            .control(&parent)
            .unwrap()
            .is_none()
    );
}
#[tokio::test]
async fn soft_stop_wraps_up_then_stops_and_archive_is_recoverable() {
    let (s, _sup, _dir) = with_tools().await;
    let id = practice_team(&s, "solo").await;
    let agent = seat(&id, "claude");
    say(&s, &agent, "hang").await;
    let (status, body) = call(
        &s.router,
        "POST",
        &format!("/api/seats/{agent}/control"),
        json!({"request_id":rid(),"mode":"soft"}),
    )
    .await;
    assert!(status.is_success(), "{body}");
    wait_for("wrap-up stopped", || {
        lifecycle(&s.st, &agent) == Some(SeatLifecycle::Stopped)
    })
    .await;
    assert!(
        events(&s.st, &agent)
            .iter()
            .any(|e| matches!(&e.body,EventBody::MessageQueued{text,..} if text.contains("5,000")))
    );
    let (status, body) = call(
        &s.router,
        "POST",
        &format!("/api/teams/{id}/archive"),
        json!({"request_id":rid()}),
    )
    .await;
    assert!(status.is_success(), "{body}");
    assert!(
        get(&s.router, "/api/teams")
            .await
            .1
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert!(
        get(&s.router, "/api/rigs")
            .await
            .1
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert!(!events(&s.st, &agent).is_empty());
    let (status, _) = call(
        &s.router,
        "POST",
        &format!("/api/teams/{id}/start"),
        json!({"request_id":rid()}),
    )
    .await;
    assert!(!status.is_success());
    let (status, body) = call(
        &s.router,
        "POST",
        &format!("/api/teams/{id}/archive"),
        json!({"request_id":rid(),"archived":false}),
    )
    .await;
    assert!(status.is_success(), "{body}");
    assert_eq!(
        get(&s.router, "/api/teams")
            .await
            .1
            .as_array()
            .unwrap()
            .len(),
        1
    );
}

#[tokio::test]
async fn nested_children_inherit_budget_and_exhaustion_cannot_be_resumed() {
    let (s, _sup, _dir) = with_tools().await;
    let id = practice_team(&s, "solo").await;
    let parent = seat(&id, "claude");
    // Public budget changes are refused while live.
    let (status, _) = call(&s.router,"POST",&format!("/api/teams/{id}/budget"),json!({"request_id":rid(),"output_limit":5000})).await;
    assert_eq!(status.as_u16(),409);
    controld::reconciler::stop_rig(s.st.clone(),id.clone()).await.unwrap();
    wait_for("parent stopped",||lifecycle(&s.st,&parent)==Some(SeatLifecycle::Stopped)).await;
    let (status, body) = call(&s.router,"POST",&format!("/api/teams/{id}/budget"),json!({"request_id":rid(),"output_limit":5000})).await;
    assert!(status.is_success(),"{body}");
    let (status,body)=call(&s.router,"POST",&format!("/api/teams/{id}/start"),json!({"request_id":rid()})).await;
    assert!(status.is_success(),"{body}");
    wait_for("parent ready",||lifecycle(&s.st,&parent)==Some(SeatLifecycle::Running) && !s.st.is_booting(&id)).await;
    let (ok, child, error)=direct(&s,&parent,"spawn_agent",json!({"request_id":"nested-child","name":"Branch","task":"Bounded branch"})).await;
    assert!(ok,"{error:?}");
    let child=child["child"].as_str().unwrap().to_string();
    let (ok,leaf,error)=direct(&s,&child,"spawn_agent",json!({"request_id":"nested-leaf","name":"Leaf","task":"Bounded leaf"})).await;
    assert!(ok,"{error:?}");
    let leaf=leaf["child"].as_str().unwrap().to_string();
    assert_eq!(s.st.store.lock().unwrap().parent(&leaf).unwrap(),Some(child.clone()));
    let budget=get(&s.router,&format!("/api/teams/{id}/budget")).await.1;
    assert_eq!(budget["output_limit"],5000);
    assert_eq!(budget["agents"].as_array().unwrap().len(),3);
    // Captured usage is cumulative across turns. Only this leaf reaches its budget.
    let used=s.st.store.lock().unwrap().budget_used(&leaf).unwrap().unwrap_or(0);
    s.st.local_event(Actor::System("fixture".into()),model::Subject::Seat(leaf.clone()),model::Provenance::ProtocolObserved,
      EventBody::UsageReported{turn_id:None,input_tokens:0,output_tokens:5000-used as u64,cache_read_tokens:0,cache_write_tokens:0,cost:None}).unwrap();
    wait_for("leaf budget stop",||lifecycle(&s.st,&leaf)==Some(SeatLifecycle::Stopped)).await;
    assert_eq!(lifecycle(&s.st,&parent),Some(SeatLifecycle::Running));
    assert_eq!(lifecycle(&s.st,&child),Some(SeatLifecycle::Running));
    let (status,_)=call(&s.router,"POST",&format!("/api/seats/{leaf}/control"),json!({"request_id":rid(),"mode":"resume"})).await;
    assert_eq!(status.as_u16(),409);
    let (ok,_,_)=direct(&s,&leaf,"spawn_agent",json!({"request_id":"bypass","name":"No","task":"No"})).await;
    assert!(!ok);
    controld::reconciler::stop_rig(s.st.clone(),id).await.unwrap();
}

#[tokio::test]
async fn each_agent_can_spawn_ten_children_but_not_eleven_and_retries_do_not_count() {
    let (s,_sup,_dir)=with_tools().await;
    let id=practice_team(&s,"solo").await;
    let root=seat(&id,"claude");
    let mut first=None;
    for i in 0..10 {
        let args=json!({"request_id":format!("wide-{i}"),"name":format!("Child {i}"),"task":"Small bounded task"});
        let (ok,result,error)=direct(&s,&root,"spawn_agent",args.clone()).await;
        assert!(ok,"{error:?}");
        if i==0 {first=Some(result["child"].as_str().unwrap().to_string());}
        let (ok,replay,error)=direct(&s,&root,"spawn_agent",args).await;
        assert!(ok,"{error:?}");assert_eq!(result,replay);
    }
    let (ok,_,error)=direct(&s,&root,"spawn_agent",json!({"request_id":"eleventh","name":"Too many","task":"No"})).await;
    assert!(!ok);assert!(error.unwrap().contains("10 direct"));
    let (ok,_,error)=direct(&s,&first.unwrap(),"spawn_agent",json!({"request_id":"grandchild","name":"Deeper branch","task":"Small bounded task"})).await;
    assert!(ok,"{error:?}");
    assert_eq!(s.st.store.lock().unwrap().children(&root).unwrap().len(),10);
    controld::reconciler::stop_rig(s.st.clone(),id).await.unwrap();
}

#[tokio::test]
async fn deployment_history_keeps_removed_children_and_isolates_run_evidence() {
    let (s,_sup,_dir)=with_tools().await;let id=practice_team(&s,"solo").await;let root=seat(&id,"claude");
    let runs=get(&s.router,&format!("/api/teams/{id}/deployments")).await.1;
    let first=runs[0]["start_seq"].as_i64().unwrap();
    let (ok,result,error)=direct(&s,&root,"spawn_agent",json!({"request_id":"historical-child","name":"Historical child","task":"old run task"})).await;assert!(ok,"{error:?}");
    let child=result["child"].as_str().unwrap().to_string();
    say(&s,&root,"first run evidence").await;
    controld::reconciler::stop_rig(s.st.clone(),id.clone()).await.unwrap();
    wait_for("all stopped",||lifecycle(&s.st,&root)==Some(SeatLifecycle::Stopped)&&lifecycle(&s.st,&child)==Some(SeatLifecycle::Stopped)).await;
    let (status,body)=call(&s.router,"POST",&format!("/api/teams/{id}/start"),json!({"request_id":rid()})).await;assert!(status.is_success(),"{body}");
    wait_for("restarted",||lifecycle(&s.st,&root)==Some(SeatLifecycle::Running)&&!s.st.is_booting(&id)).await;
    assert!(s.st.store.lock().unwrap().seat(&child).unwrap().is_none());
    let runs=get(&s.router,&format!("/api/teams/{id}/deployments")).await.1;
    assert_eq!(runs.as_array().unwrap().len(),2);let next=runs[0]["start_seq"].as_i64().unwrap();
    let path=format!("/api/teams/{id}/deployments/{first}");
    let (status,history)=get(&s.router,&path).await;assert!(status.is_success(),"{history}");assert_eq!(history["has_snapshot"],true);
    let old=history["agents"].as_array().unwrap().iter().find(|a|a["id"]==child).unwrap();
    assert_eq!(old["name"],"Historical child");assert_eq!(old["parent"],root);assert_eq!(old["lifecycle"],"stopped");
    let evidence=get(&s.router,&format!("{path}/events?seat={child}")).await.1;
    assert!(!evidence["events"].as_array().unwrap().is_empty());
    assert!(evidence["events"].as_array().unwrap().iter().all(|e|e["seq"].as_i64().unwrap()>=first&&e["seq"].as_i64().unwrap()<next));
    assert_eq!(get(&s.router,&format!("/api/teams/other/deployments/{first}")).await.0.as_u16(),404);
    s.st.store.lock().unwrap().connection().execute("DELETE FROM deployment_specs WHERE rig=?1 AND start_seq=?2",rusqlite::params![id,first]).unwrap();
    let recovered=get(&s.router,&path).await.1;assert_eq!(recovered["has_snapshot"],false);
    assert!(recovered["agents"].as_array().unwrap().iter().any(|a|a["id"]==child&&a["name"]=="Historical child"));
    let older=get(&s.router,&format!("/api/teams/{id}/deployments?before={next}")).await.1;assert_eq!(older.as_array().unwrap().len(),1);
    controld::reconciler::stop_rig(s.st.clone(),id).await.unwrap();
}

/// A per-agent token limit counts the agent and, when it says so, the agents it spawned; reaching it
/// soft-stops the agent (wrap-up, then stop with its subagents) and a stopped agent cannot be resumed.
#[tokio::test]
async fn a_token_limit_including_subagents_soft_stops_the_agent_with_its_children() {
    let (s, _sup, _dir) = with_tools().await;
    let id = practice_team(&s, "solo").await;
    let parent = seat(&id, "claude");
    wait_for("parent ready", || lifecycle(&s.st, &parent) == Some(SeatLifecycle::Running) && !s.st.is_booting(&id)).await;
    let (ok, child, error) = direct(&s, &parent, "spawn_agent", json!({"request_id":"c","name":"Helper","task":"Help"})).await;
    assert!(ok, "{error:?}");
    let child = child["child"].as_str().unwrap().to_string();
    {
        let mut store = s.st.store.lock().unwrap();
        let mut d = store.draft(&id).unwrap().unwrap();
        let limit = model::TokenLimit { tokens: 1_000_000, counts: model::TokenCount::All, include_subagents: true };
        d.agents[0].advanced.token_limit = Some(limit);
        let rev = d.revision;
        store.save_draft(&d, rev).unwrap();
    }
    // Only the child's usage crosses the parent's limit (cache reads count with "all").
    s.st.local_event(Actor::System("fixture".into()), model::Subject::Seat(child.clone()), model::Provenance::ProtocolObserved,
        EventBody::UsageReported { turn_id: None, input_tokens: 0, output_tokens: 0, cache_read_tokens: 1_000_000, cache_write_tokens: 0, cost: None }).unwrap();
    let budget = get(&s.router, &format!("/api/teams/{id}/budget")).await.1;
    let mine = budget["agents"].as_array().unwrap().iter().find(|a| a["seat"] == parent.as_str()).cloned().unwrap();
    assert!(mine["token_used"].as_u64().unwrap() >= 1_000_000, "{budget}");
    assert_eq!(mine["exhausted"], true, "{budget}");
    wait_for("parent and child stopped", || {
        [&parent, &child].iter().all(|x| lifecycle(&s.st, x) == Some(SeatLifecycle::Stopped))
    }).await;
    let (status, _) = call(&s.router, "POST", &format!("/api/seats/{parent}/control"), json!({"request_id":rid(),"mode":"resume"})).await;
    assert_eq!(status.as_u16(), 409);
}

#[tokio::test]
async fn team_usage_reports_running_totals_and_the_latest_context_fill() {
    let (s,_sup,_dir)=with_tools().await;
    let id=practice_team(&s,"solo").await;
    let seat=s.st.store.lock().unwrap().rig_snapshot(&id).unwrap().unwrap().seats[0].id.clone();
    let put=|body:EventBody|{s.st.local_event(Actor::System("fixture".into()),model::Subject::Seat(seat.clone()),model::Provenance::ProtocolObserved,body).unwrap();};
    put(EventBody::UsageReported{turn_id:None,input_tokens:100,output_tokens:10,cache_read_tokens:7,cache_write_tokens:0,cost:None});
    put(EventBody::ContextReported{turn_id:None,used_tokens:900,window_tokens:Some(200_000),basis:model::ContextBasis::Reported});
    put(EventBody::UsageReported{turn_id:None,input_tokens:50,output_tokens:5,cache_read_tokens:0,cache_write_tokens:0,cost:None});
    let (status,usage)=get(&s.router,&format!("/api/teams/{id}/usage")).await;
    assert_eq!(status.as_u16(),200,"{usage}");
    let a=usage["agents"].as_array().unwrap().iter().find(|a|a["seat"]==seat.as_str()).expect("agent").clone();
    let last=a["points"].as_array().unwrap().last().unwrap().clone();
    assert_eq!((last["input"].as_u64(),last["output"].as_u64(),last["cache_read"].as_u64()),(Some(150),Some(15),Some(7)));
    assert_eq!(a["reports"].as_u64().unwrap()>=2,true);
    assert_eq!((a["context"]["used_tokens"].as_u64(),a["context"]["estimated"].as_bool()),(Some(900),Some(false)));
    controld::reconciler::stop_rig(s.st.clone(),id).await.unwrap();
}
