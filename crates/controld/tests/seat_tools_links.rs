//! A seat-tool question whose host connection closes while controld runs (hostd restarted, the machine
//! slept): hostd already failed the agent's call, so nothing is ever "answered" into that connection.
mod common;

use common::m2::*;
use common::seat_tools::*;
use model::*;

fn answer_failed(s: &Served, seat: &str, id: &str) -> Option<String> {
    events(&s.st, seat).into_iter().find_map(|e| match e.body {
        EventBody::QuestionAnswerFailed { question_id, reason } if question_id == id => Some(reason),
        _ => None,
    })
}

/// A running Practice agent (its host has no tool socket: these tests call the tools directly).
async fn agent(s: &Served) -> String {
    connect_stub(s).await;
    seat(&practice_team(s, "solo").await, "claude")
}

/// The question is withdrawn and its waiter removed.
#[tokio::test]
async fn a_dropped_host_connection_withdraws_the_waiting_question() {
    let s = serve().await;
    let seat = "team.a@t";
    let (call, link, q) = which(&s, seat).await;
    drop(link);
    ended(call).await;
    let w = wait_event(&s.st, seat, "withdrawn", |b| matches!(b, EventBody::QuestionWithdrawn { question_id, .. } if *question_id == q)).await;
    assert_eq!(w.actor, Actor::System("controld".into()));
    assert!(s.st.seat_waits.lock().unwrap().is_empty());
    assert_eq!(question_view(&s, seat, &q).await["state"], "withdrawn");
}

/// Concern 4: the operator answers after the connection closed, before controld noticed. `deliver`
/// sees the closed connection: the answer is not sent (Task 3's QuestionAnswerFailed path, the operator
/// is told), and the question ends withdrawn.
#[tokio::test]
async fn an_answer_to_a_call_whose_connection_closed_is_not_sent() {
    let s = serve().await;
    let agent = agent(&s).await;
    let (call, link, q) = which(&s, &agent).await;
    // No await between closing the connection and answering: the waiting call cannot notice first.
    drop(link);
    let err = controld::questions::answer(&s.st, &q, Answer::Text { text: "Green".into() }).await.unwrap_err();
    assert_eq!(err.code, "host_unreachable", "{}", err.message);
    assert!(answer_failed(&s, &agent, &q).is_some(), "the answer is recorded as not delivered");
    ended(call).await;
    assert_eq!(question_view(&s, &agent, &q).await["state"], "withdrawn");
    assert!(s.st.seat_waits.lock().unwrap().is_empty());
}

/// Concern 4: the answer reached the waiting call, but its connection closed before the reply went
/// out. controld records the answer as failed and withdraws the question.
#[tokio::test]
async fn an_answer_whose_reply_cannot_go_out_is_recorded_as_failed() {
    let s = serve().await;
    let agent = agent(&s).await;
    let (call, link, q) = which(&s, &agent).await;
    controld::questions::answer(&s.st, &q, Answer::Text { text: "Green".into() }).await.unwrap();
    // Closed before the waiting call runs again to send its reply.
    drop(link);
    ended(call).await;
    let reason = answer_failed(&s, &agent, &q).expect("the lost answer is recorded");
    assert!(reason.contains("dropped before the answer reached the agent"), "{reason}");
    assert_eq!(question_view(&s, &agent, &q).await["state"], "withdrawn");
}
