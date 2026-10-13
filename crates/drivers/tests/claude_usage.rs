//! A resumed Claude session reports `modelUsage` that carries across `--resume` (claude-resume-2), so the
//! parser starts from the previous session's totals instead of counting the whole session again.
use drivers::claude::ClaudeParser;
use drivers::DriverEvent;

fn result_with_usage(u: [u64; 4]) -> String {
    serde_json::json!({ "type": "result", "subtype": "success", "is_error": false, "result": "ok", "num_turns": 1,
        "modelUsage": { "claude-x": { "inputTokens": u[0], "outputTokens": u[1],
                                      "cacheReadInputTokens": u[2], "cacheCreationInputTokens": u[3] } } })
    .to_string()
}

fn usage(p: &mut ClaudeParser, line: &str) -> [u64; 4] {
    p.on_sent("m".into());
    p.parse_line(line)
        .into_iter()
        .find_map(|e| match e {
            DriverEvent::Usage { input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, .. } => {
                Some([input_tokens, output_tokens, cache_read_tokens, cache_write_tokens])
            }
            _ => None,
        })
        .expect("a usage event")
}

#[test]
fn a_usage_baseline_is_subtracted_from_the_first_turn_after_a_resume() {
    let line = result_with_usage([100, 50, 10, 5]);
    assert_eq!(usage(&mut ClaudeParser::default(), &line), [100, 50, 10, 5]);
    let mut resumed = ClaudeParser::with_usage_baseline([90, 40, 10, 0]);
    assert_eq!(usage(&mut resumed, &line), [10, 10, 0, 5]);
    // The next turn counts from the new totals, not from the baseline again.
    assert_eq!(usage(&mut resumed, &result_with_usage([130, 60, 10, 5])), [30, 10, 0, 0]);
}
