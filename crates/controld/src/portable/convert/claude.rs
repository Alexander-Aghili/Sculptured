//! Claude Code session files (`~/.claude/projects/<project>/<session>.jsonl`): one line per message
//! content block, sharing `message.id`; prompts, tool results and bookkeeping lines in between.
use super::{ts_ms, Ev, Read, Step, Thread, Upload};
use crate::error::ApiError;
use model::cap::{cap_input, truncate, MAX_TEXT};
use model::{EventBody, Provenance, TurnStatus};
use serde_json::Value;
use std::collections::HashSet;

/// Lines that only keep Claude Code's own books: nothing to show.
const BOOKKEEPING: &[&str] = &["system", "summary", "queue-operation", "attachment", "last-prompt", "atis-latch", "file-history-snapshot"];

pub(super) fn read(files: &[Upload]) -> Result<Read, ApiError> {
    let main = files.iter().find(|f| f.name.ends_with(".jsonl")).expect("convert checked for a session file");
    let mut r = Reader::new("main");
    for line in main.text.lines().filter(|l| !l.trim().is_empty()) {
        match serde_json::from_str::<Value>(line) {
            Ok(v) => r.line(&v),
            Err(_) => r.push(r.prev, unrecognized(Value::String(line.to_string()))),
        }
    }
    Ok(Read { threads: vec![r.finish()], ..Read::default() })
}

fn body(b: EventBody) -> Ev {
    Ev::Body(b, Provenance::ProtocolObserved)
}

fn unrecognized(raw: Value) -> Ev {
    let text = raw.to_string();
    body(EventBody::Unrecognized { raw: if text.len() > MAX_TEXT { Value::String(truncate(text, MAX_TEXT)) } else { raw } })
}

/// One agent's file, read line by line.
pub(super) struct Reader {
    pub(super) t: Thread,
    pub(super) prev: i64,
    turn: Option<String>,
    turns: u32,
    /// `message.id`s whose usage was already counted (a message spans several lines).
    seen: HashSet<String>,
}

impl Reader {
    pub(super) fn new(key: &str) -> Self {
        Self { t: Thread { key: key.into(), runtime: "claude-stream", ..Thread::default() }, prev: 0, turn: None, turns: 0, seen: HashSet::new() }
    }

    pub(super) fn push(&mut self, at_ms: i64, ev: Ev) {
        self.t.steps.push(Step { at_ms, ev });
    }

    pub(super) fn line(&mut self, v: &Value) {
        let at = ts_ms(v, self.prev);
        self.prev = at;
        if self.t.session_id.is_none() {
            self.t.session_id = v["sessionId"].as_str().map(str::to_string);
        }
        if self.t.cwd.is_none() {
            self.t.cwd = v["cwd"].as_str().map(str::to_string);
        }
        match v["type"].as_str().unwrap_or("") {
            "user" => self.user(v, at),
            "assistant" => self.assistant(v, at),
            "ai-title" => self.t.name = v["aiTitle"].as_str().map(str::to_string).or(self.t.name.take()),
            t if BOOKKEEPING.contains(&t) => {}
            _ => self.push(at, unrecognized(v.clone())),
        }
    }

    pub(super) fn finish(mut self) -> Thread {
        self.end_turn(self.prev);
        self.t
    }

    fn user(&mut self, v: &Value, at: i64) {
        if let Some(text) = prompt_text(v) {
            self.end_turn(at);
            self.push(at, Ev::Prompt { text, from: None });
            return;
        }
        for b in v["message"]["content"].as_array().into_iter().flatten().filter(|b| b["type"] == "tool_result") {
            let call_id = b["tool_use_id"].as_str().unwrap_or_default().to_string();
            let output = truncate(result_text(&b["content"]), MAX_TEXT);
            let is_error = b["is_error"].as_bool().unwrap_or(false);
            self.push(at, body(EventBody::ToolResulted { turn_id: self.turn.clone(), call_id, output, is_error }));
        }
    }

    fn assistant(&mut self, v: &Value, at: i64) {
        let turn = self.ensure_turn(at);
        let m = &v["message"];
        if let Some(model) = m["model"].as_str().filter(|m| !m.starts_with('<')) {
            self.t.models.push(model.to_string());
        }
        for b in m["content"].as_array().into_iter().flatten() {
            if let Some(ev) = block(b, &turn) {
                self.push(at, ev);
            }
        }
        let first = m["id"].as_str().is_some_and(|id| self.seen.insert(id.to_string()));
        if first && m["usage"].is_object() {
            self.push(at, body(usage(&m["usage"], turn)));
        }
    }

    fn ensure_turn(&mut self, at: i64) -> String {
        if let Some(t) = &self.turn {
            return t.clone();
        }
        self.turns += 1;
        let t = format!("turn-{}", self.turns);
        self.turn = Some(t.clone());
        self.push(at, body(EventBody::TurnStarted { turn_id: t.clone() }));
        t
    }

    fn end_turn(&mut self, at: i64) {
        if let Some(turn_id) = self.turn.take() {
            self.push(at, body(EventBody::TurnEnded { turn_id, status: TurnStatus::Completed }));
        }
    }
}

/// One content block of an agent's message, as an event (thinking is not shown, like the live view).
fn block(b: &Value, turn: &str) -> Option<Ev> {
    let turn_id = Some(turn.to_string());
    match b["type"].as_str().unwrap_or("") {
        "text" => Some(body(EventBody::AgentText { turn_id, text: truncate(b["text"].as_str().unwrap_or_default().to_string(), MAX_TEXT) })),
        "tool_use" => Some(body(EventBody::ToolCalled {
            turn_id,
            call_id: b["id"].as_str().unwrap_or_default().to_string(),
            name: b["name"].as_str().unwrap_or_default().to_string(),
            input: cap_input(b["input"].clone()),
            parent_call_id: None,
        })),
        "thinking" | "redacted_thinking" => None,
        _ => Some(unrecognized(b.clone())),
    }
}

fn usage(u: &Value, turn: String) -> EventBody {
    let n = |k: &str| u[k].as_u64().unwrap_or(0);
    EventBody::UsageReported {
        turn_id: Some(turn),
        input_tokens: n("input_tokens"),
        output_tokens: n("output_tokens"),
        cache_read_tokens: n("cache_read_input_tokens"),
        cache_write_tokens: n("cache_creation_input_tokens"),
        cost: None,
    }
}

/// The person's words, when this user line is a prompt: not a tool result, not Claude Code's own
/// meta lines (`isMeta`, slash-command echoes, interruption markers).
pub(super) fn prompt_text(v: &Value) -> Option<String> {
    if v["isMeta"] == true {
        return None;
    }
    let c = &v["message"]["content"];
    let text = match c {
        Value::String(s) => s.clone(),
        Value::Array(blocks) if !blocks.is_empty() && blocks.iter().all(|b| b["type"] == "text") => {
            blocks.iter().filter_map(|b| b["text"].as_str()).collect::<Vec<_>>().join("\n")
        }
        _ => return None,
    };
    let t = text.trim();
    let own = ["<command-", "<local-command-", "[Request interrupted"].iter().any(|p| t.starts_with(p));
    (!t.is_empty() && !own).then(|| t.to_string())
}

fn result_text(c: &Value) -> String {
    match c {
        Value::String(s) => s.clone(),
        Value::Array(parts) => parts.iter().filter_map(|p| p["text"].as_str()).collect::<Vec<_>>().join("\n"),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}
