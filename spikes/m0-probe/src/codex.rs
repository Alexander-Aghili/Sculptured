use crate::session::LineSession;
use serde_json::{json, Value};
use std::path::Path;
use std::time::Duration;

const T: Duration = Duration::from_secs(240);

struct Rpc { s: LineSession, next: u64 }

fn is_notification(v: &Value, method: &str) -> bool {
    v.get("method").and_then(Value::as_str) == Some(method) && v.get("id").is_none()
}
/// Server-to-client request: has both `id` and `method`.
fn is_server_request(v: &Value) -> bool {
    v.get("id").is_some() && v.get("method").is_some()
}
fn is_command_item(v: &Value, method: &str) -> bool {
    is_notification(v, method) && v.pointer("/params/item/type").and_then(Value::as_str) == Some("commandExecution")
}

impl Rpc {
    fn start(sandbox: &Path, rec: &Path) -> Rpc {
        // CODEX_PROBE_ARGS: extra args after `app-server` (e.g. `--enable <feature>`), space separated.
        let mut args = vec!["app-server".to_string()];
        if let Ok(extra) = std::env::var("CODEX_PROBE_ARGS") {
            args.extend(extra.split_whitespace().map(str::to_string));
        }
        let s = LineSession::spawn("codex", &args, sandbox, rec);
        let mut r = Rpc { s, next: 1 };
        let init = r.call("initialize", json!({ "clientInfo": { "name": "sculptured-probe", "version": "0.0.0" } }));
        println!("initialize -> {init}");
        r.s.send(json!({ "jsonrpc": "2.0", "method": "initialized" }));
        r
    }
    /// Sends a request and waits for its response (has id, no method, id equals ours). Prints errors in full.
    fn call(&mut self, method: &str, params: Value) -> Value {
        let id = self.next;
        self.next += 1;
        self.s.send(json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }));
        let resp = self.s.wait_for(T, |v| v.get("id") == Some(&json!(id)) && v.get("method").is_none());
        let resp = resp.unwrap_or_else(|| json!({ "timeout": method }));
        if resp.get("error").is_some() {
            eprintln!("JSON-RPC ERROR for {method}: {resp}");
        }
        resp
    }
    fn notified(&self, method: &str, timeout: Duration) -> Option<Value> {
        self.s.wait_for(timeout, |v| is_notification(v, method))
    }
    fn thread(&mut self, sandbox: &Path, approval: &str) -> String {
        let r = self.call("thread/start", json!({
            "cwd": sandbox, "approvalPolicy": approval, "sandbox": "danger-full-access"
        }));
        let id = r.pointer("/result/thread/id").or_else(|| r.pointer("/result/threadId"))
            .and_then(Value::as_str).unwrap_or_else(|| panic!("no thread id in {r}")).to_string();
        println!("thread id: {id}");
        id
    }
    fn turn(&mut self, thread: &str, text: &str) -> Value {
        self.call("turn/start", json!({ "threadId": thread, "input": [{ "type": "text", "text": text }] }))
    }
}

fn turn_id(resp: &Value) -> Option<String> {
    resp.pointer("/result/turn/id").or_else(|| resp.pointer("/result/turnId"))
        .and_then(Value::as_str).map(str::to_string)
}

pub fn run(scenario: &str, sandbox: &Path, rec: impl Fn(&str) -> std::path::PathBuf) {
    match scenario {
        "basic" => {
            let mut r = Rpc::start(sandbox, &rec("codex-basic"));
            let t = r.thread(sandbox, "never");
            r.turn(&t, "Reply with exactly the word: ready");
            println!("completed: {:?}", r.notified("turn/completed", T).is_some());
            r.s.finish(Duration::from_secs(10));
        }
        "tool" => {
            let mut r = Rpc::start(sandbox, &rec("codex-tool"));
            let t = r.thread(sandbox, "never");
            r.turn(&t, "Run `ls -1` and tell me how many entries it printed.");
            println!("completed: {:?}", r.notified("turn/completed", T).is_some());
            r.s.finish(Duration::from_secs(10));
        }
        "interrupt" => {
            let mut r = Rpc::start(sandbox, &rec("codex-interrupt"));
            let t = r.thread(sandbox, "never");
            let resp = r.turn(&t, "Run `for i in $(seq 1 120); do echo $i; sleep 1; done` and report the last number.");
            let tid = turn_id(&resp).or_else(|| r.notified("turn/started", T)
                .and_then(|n| n.pointer("/params/turn/id").and_then(Value::as_str).map(str::to_string)));
            // Wait for the command item specifically (userMessage/reasoning items also emit item/started).
            let started = r.s.wait_for(T, |v| is_command_item(v, "item/started"));
            println!("command item started: {}", started.is_some());
            let ack = r.call("turn/interrupt", json!({ "threadId": t, "turnId": tid }));
            println!("interrupt resp: {ack}");
            let done = r.notified("turn/completed", Duration::from_secs(60));
            println!("turn completed after interrupt: {done:?}");
            r.turn(&t, "Reply with exactly the word: alive");
            println!("second turn: {:?}", r.notified("turn/completed", T).is_some());
            r.s.finish(Duration::from_secs(10));
        }
        "steer" => {
            let mut r = Rpc::start(sandbox, &rec("codex-steer"));
            let t = r.thread(sandbox, "never");
            let resp = r.turn(&t, "Run `sleep 20` and then reply with the word: first");
            let tid = turn_id(&resp);
            let started = r.s.wait_for(T, |v| is_command_item(v, "item/started"));
            println!("command item started: {}", started.is_some());
            // Schema rename: turn/steer takes `expectedTurnId`, not `turnId`.
            let steer = r.call("turn/steer", json!({ "threadId": t, "expectedTurnId": tid,
                "input": [{ "type": "text", "text": "Change of plan: reply with the word: steered" }] }));
            println!("steer resp: {steer}");
            println!("completed: {:?}", r.notified("turn/completed", T).is_some());
            r.s.finish(Duration::from_secs(10));
        }
        "user-input" => {
            let mut r = Rpc::start(sandbox, &rec("codex-user-input"));
            let t = r.thread(sandbox, "never");
            r.turn(&t, "Before doing anything, ask me (the user) which color I prefer using your request-user-input tool, then reply with my answer.");
            let req = r.s.wait_for(T, |v| is_server_request(v)
                && v.get("method").and_then(Value::as_str) == Some("item/tool/requestUserInput"));
            println!("requestUserInput observed: {:?}", req.is_some());
            if let Some(req) = req {
                let qid = req.pointer("/params/questions/0/id").and_then(Value::as_str).unwrap_or("q0").to_string();
                r.s.send(json!({ "jsonrpc": "2.0", "id": req["id"].clone(),
                    "result": { "answers": { qid: { "answers": ["green"] } } } }));
            }
            println!("completed: {:?}", r.notified("turn/completed", T).is_some());
            r.s.finish(Duration::from_secs(10));
        }
        "approval" => {
            let mut r = Rpc::start(sandbox, &rec("codex-approval"));
            let t = r.thread(sandbox, "untrusted");
            r.turn(&t, "Create a file named codex-probe.txt containing hi.");
            // Answer every approval request until the turn completes.
            loop {
                let ev = r.s.wait_for(T, |v| is_notification(v, "turn/completed")
                    || (is_server_request(v) && v.get("method").and_then(Value::as_str).is_some_and(|m| m.contains("equestApproval"))));
                match ev {
                    Some(v) if is_server_request(&v) => {
                        println!("approval request: {v}");
                        r.s.send(json!({ "jsonrpc": "2.0", "id": v["id"].clone(), "result": { "decision": "accept" } }));
                    }
                    other => { println!("completed: {:?}", other.is_some()); break; }
                }
            }
            println!("file exists: {}", sandbox.join("codex-probe.txt").exists());
            r.s.finish(Duration::from_secs(10));
        }
        "fork" => {
            let mut r = Rpc::start(sandbox, &rec("codex-fork"));
            let t = r.thread(sandbox, "never");
            r.turn(&t, "Remember the codeword FIG-7. Reply with exactly: noted");
            r.notified("turn/completed", T);
            let f = r.call("thread/fork", json!({ "threadId": t }));
            println!("fork resp: {f}");
            r.s.finish(Duration::from_secs(10));
        }
        "resume" => {
            let mut a = Rpc::start(sandbox, &rec("codex-resume-1"));
            let t = a.thread(sandbox, "never");
            a.turn(&t, "Remember the codeword PEAR-9. Reply with exactly: noted");
            a.notified("turn/completed", T);
            a.s.finish(Duration::from_secs(10));
            let mut b = Rpc::start(sandbox, &rec("codex-resume-2"));
            let res = b.call("thread/resume", json!({ "threadId": t }));
            println!("resume resp: {res}");
            b.turn(&t, "What codeword did I ask you to remember? Reply with only the codeword.");
            println!("completed: {:?}", b.notified("turn/completed", T).is_some());
            b.s.finish(Duration::from_secs(10));
        }
        other => panic!("unknown codex scenario {other}"),
    }
}
