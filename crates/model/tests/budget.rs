use model::*;
use serde_json::{from_value, json, to_value};

#[test]
fn soft_defaults_to_85_percent_of_hard() {
    assert_eq!(SoftHard { soft: None, hard: 1000u64 }.soft_value(), 850);
    assert_eq!(SoftHard { soft: Some(10u32), hard: 60 }.soft_value(), 10);
    let p = PlanBudget { provider: "claude".into(), window: "five_hour".into(), soft: None, hard: 30.0 };
    assert!((p.soft_value() - 25.5).abs() < 1e-9);
}

#[test]
fn soft_above_hard_and_nonsense_are_refused() {
    let mut b = RunBudget::default();
    assert!(b.problems().is_empty(), "an empty budget is fine");
    b.tokens = Some(SoftHard { soft: Some(2000), hard: 1000 });
    b.plan.push(PlanBudget { provider: "gemini".into(), window: "five_hour".into(), soft: None, hard: 30.0 });
    b.plan.push(PlanBudget { provider: "claude".into(), window: "daily".into(), soft: None, hard: 30.0 });
    b.plan.push(PlanBudget { provider: "codex".into(), window: "seven_day".into(), soft: None, hard: 130.0 });
    b.max_working = Some(0);
    let p = b.problems().join(" | ");
    for want in ["soft value is above the hard", "gemini", "daily", "130", "at least 1"] {
        assert!(p.contains(want), "{want}: {p}");
    }
    assert!(SoftHard { soft: Some(5u32), hard: 0 }.problem("Turns").is_some(), "a zero hard value means nothing can run");
}

#[test]
fn old_token_limit_loads_with_no_soft() {
    let t: TokenLimit = from_value(json!({ "tokens": 5000 })).unwrap();
    assert_eq!((t.tokens, t.soft, t.soft_value()), (5000, None, 4250));
}

#[test]
fn run_budget_round_trips_and_is_omitted_when_empty() {
    let b = RunBudget {
        plan: vec![PlanBudget { provider: "claude".into(), window: "five_hour".into(), soft: Some(25.0), hard: 30.0 }],
        tokens: None,
        minutes: Some(SoftHard { soft: None, hard: 60 }),
        max_working: Some(6),
    };
    let v = to_value(&b).unwrap();
    assert_eq!(v, json!({ "plan": [{ "provider": "claude", "window": "five_hour", "soft": 25.0, "hard": 30.0 }], "minutes": { "hard": 60 }, "max_working": 6 }));
    assert_eq!(from_value::<RunBudget>(v).unwrap(), b);
    assert!(RunBudget::default().is_empty());
}
