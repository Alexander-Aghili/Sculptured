use controld::portable::convert::{convert, Upload};
use controld::portable::session::{parse_session, Origin, Source};
use model::EventBody;

fn fixture(path: &str) -> Upload {
    let full = format!("{}/tests/fixtures/sessions/{path}", env!("CARGO_MANIFEST_DIR"));
    Upload { name: path.rsplit('/').next().unwrap().into(), text: std::fs::read_to_string(full).unwrap() }
}

fn bodies(session: &str) -> Vec<EventBody> {
    parse_session(session).unwrap().1.into_iter().map(|(_, l)| l.event.body).collect()
}

/// 2026-10-01T10:00:00Z in Unix milliseconds.
const T0: i64 = 1_790_848_800_000;

#[test]
fn a_claude_session_converts_to_a_run_with_one_agent() {
    let c = convert(&[fixture("claude/main.jsonl")]).unwrap();
    let (header, lines) = parse_session(&c.session).unwrap();
    assert_eq!(header.source, Source::ClaudeCode);
    assert_eq!(header.agents.len(), 1);
    assert_eq!(header.agents[0].name.as_deref(), Some("Login page"));
    assert_eq!(header.started_ms, T0);
    assert!(lines.iter().all(|(_, l)| l.origin == Origin::Converted));
    assert_eq!(c.preview.agents, 1);
    assert_eq!(c.preview.unknown_lines, 1);
}

#[test]
fn usage_counts_once_per_message_even_when_split_over_lines() {
    let c = convert(&[fixture("claude/main.jsonl")]).unwrap();
    let t = &parse_session(&c.session).unwrap().0.tokens;
    assert_eq!((t.input, t.output, t.cache_read), (110, 23, 5));
}

#[test]
fn only_real_prompts_become_messages() {
    let c = convert(&[fixture("claude/main.jsonl")]).unwrap();
    let prompts: Vec<String> = bodies(&c.session).into_iter().filter_map(|b| match b { EventBody::MessageQueued { text, .. } => Some(text), _ => None }).collect();
    assert_eq!(prompts, vec!["Add a login page".to_string()]);
}

#[test]
fn tool_calls_results_text_and_turns_are_kept_in_order() {
    let c = convert(&[fixture("claude/main.jsonl")]).unwrap();
    let kinds: Vec<&str> = bodies(&c.session)
        .iter()
        .map(|b| match b {
            EventBody::TenureStarted { .. } => "tenure",
            EventBody::MessageQueued { .. } => "prompt",
            EventBody::TurnStarted { .. } => "turn",
            EventBody::AgentText { .. } => "text",
            EventBody::ToolCalled { .. } => "call",
            EventBody::ToolResulted { .. } => "result",
            EventBody::TurnEnded { .. } => "end",
            EventBody::TenureEnded { .. } => "tenure-end",
            _ => "",
        })
        .filter(|k| !k.is_empty())
        .collect();
    assert_eq!(kinds, ["tenure", "prompt", "turn", "text", "call", "result", "text", "end", "tenure-end"]);
}

#[test]
fn a_line_without_a_timestamp_takes_the_previous_time() {
    let c = convert(&[fixture("claude/main.jsonl")]).unwrap();
    let (_, lines) = parse_session(&c.session).unwrap();
    let done = lines.iter().find(|(_, l)| matches!(&l.event.body, EventBody::AgentText { text, .. } if text == "Done.")).unwrap();
    assert_eq!(done.1.event.at_ms, T0 + 7_000);
}

#[test]
fn a_file_that_is_neither_format_is_refused() {
    let e = convert(&[Upload { name: "x.jsonl".into(), text: "{\"hello\":1}\n".into() }]).unwrap_err();
    assert!(e.message.contains("isn't a Claude Code or Codex session file"));
}
