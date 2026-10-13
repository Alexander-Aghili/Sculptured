use crate::session::LineSession;
use serde_json::{json, Value};
use std::path::Path;
use std::time::Duration;

const T: Duration = Duration::from_secs(180);

fn base_args(extra: &[&str]) -> Vec<String> {
    let mut a: Vec<String> = [
        "-p", "--input-format", "stream-json", "--output-format", "stream-json",
        "--verbose", "--replay-user-messages",
    ].iter().map(|s| s.to_string()).collect();
    a.extend(extra.iter().map(|s| s.to_string()));
    a
}
fn user(text: &str) -> Value {
    json!({ "type": "user", "message": { "role": "user", "content": [{ "type": "text", "text": text }] } })
}
fn is_type(v: &Value, t: &str) -> bool {
    v.get("type").and_then(Value::as_str) == Some(t)
}
fn session_id(v: &Value) -> Option<String> {
    v.get("session_id").and_then(Value::as_str).map(str::to_string)
}

pub fn run(scenario: &str, sandbox: &Path, rec: impl Fn(&str) -> std::path::PathBuf) {
    let skip = ["--dangerously-skip-permissions"];
    match scenario {
        // Does `system/init` arrive before the first user message?
        "init" => {
            let s = LineSession::spawn("claude", &base_args(&skip), sandbox, &rec("claude-init"));
            let early = s.wait_for(Duration::from_secs(5), |v| is_type(v, "system") && v.get("subtype").and_then(Value::as_str) == Some("init"));
            println!("init before first message: {}", early.is_some());
            s.finish(Duration::from_secs(5));
        }
        "basic" => {
            let mut s = LineSession::spawn("claude", &base_args(&skip), sandbox, &rec("claude-basic"));
            s.send(user("Reply with exactly the word: ready"));
            let r = s.wait_for(T, |v| is_type(v, "result"));
            println!("result: {r:?}");
            s.finish(Duration::from_secs(10));
        }
        "tool" => {
            let mut s = LineSession::spawn("claude", &base_args(&skip), sandbox, &rec("claude-tool"));
            s.send(user("Run the shell command `ls -1` and tell me how many entries it printed."));
            s.wait_for(T, |v| is_type(v, "result"));
            s.finish(Duration::from_secs(10));
        }
        // Interrupt mid-turn, then prove the process accepts another turn.
        "interrupt" => {
            let mut s = LineSession::spawn("claude", &base_args(&skip), sandbox, &rec("claude-interrupt"));
            s.send(user("Run `for i in $(seq 1 120); do echo $i; sleep 1; done` with the Bash tool and report the last number."));
            s.wait_for(T, |v| is_type(v, "assistant") && v["message"]["content"].as_array().is_some_and(|c| c.iter().any(|b| b.get("type").and_then(Value::as_str) == Some("tool_use"))));
            s.send(json!({ "type": "control_request", "request_id": "probe-int-1", "request": { "subtype": "interrupt" } }));
            let ack = s.wait_for(Duration::from_secs(30), |v| is_type(v, "control_response"));
            let end = s.wait_for(Duration::from_secs(60), |v| is_type(v, "result"));
            println!("interrupt ack: {}, turn ended: {}", ack.is_some(), end.is_some());
            s.send(user("Reply with exactly the word: alive"));
            let alive = s.wait_for(T, |v| is_type(v, "result"));
            println!("second turn after interrupt: {}", alive.is_some());
            s.finish(Duration::from_secs(10));
        }
        // Two messages sent back to back: are they replayed separately and in order? Batched into one turn?
        "queue" => {
            let mut s = LineSession::spawn("claude", &base_args(&skip), sandbox, &rec("claude-queue"));
            s.send(user("Reply with exactly: one"));
            s.send(user("Reply with exactly: two"));
            s.wait_for(T, |v| is_type(v, "result"));
            s.wait_for(Duration::from_secs(90), |v| is_type(v, "result"));
            s.finish(Duration::from_secs(10));
        }
        "resume" => {
            let id = "6b0c1f5e-4b8f-4a51-9a4e-0d6f1b6c2a01";
            let mut a = LineSession::spawn("claude", &base_args(&[skip[0], "--session-id", id]), sandbox, &rec("claude-resume-1"));
            a.send(user("Remember the codeword PLUM-42. Reply with exactly: noted"));
            let r1 = a.wait_for(T, |v| is_type(v, "result"));
            println!("first session id: {:?}", r1.as_ref().and_then(session_id));
            a.finish(Duration::from_secs(10));
            let mut b = LineSession::spawn("claude", &base_args(&[skip[0], "--resume", id]), sandbox, &rec("claude-resume-2"));
            b.send(user("What codeword did I ask you to remember? Reply with only the codeword."));
            let r2 = b.wait_for(T, |v| is_type(v, "result"));
            println!("resumed session id: {:?}; result: {:?}", r2.as_ref().and_then(session_id), r2.as_ref().and_then(|v| v.get("result").cloned()));
            b.finish(Duration::from_secs(10));
        }
        "subagent" => {
            let mut s = LineSession::spawn("claude", &base_args(&skip), sandbox, &rec("claude-subagent"));
            s.send(user("Use the Task tool to launch one general-purpose subagent that lists the files in the current directory, then summarize its answer in one sentence."));
            s.wait_for(Duration::from_secs(300), |v| is_type(v, "result"));
            s.finish(Duration::from_secs(10));
        }
        // Restricted posture: permission prompts routed to our MCP tool.
        "permission" => {
            let log_path = sandbox.join("mcp-approve.log");
            let _ = std::fs::remove_file(&log_path);
            let _ = std::fs::remove_file(sandbox.join("probe.txt"));
            let probe = std::env::current_exe().unwrap();
            let cfg = json!({ "mcpServers": { "probe": { "command": probe, "args": ["mcp-approve"] } } });
            let cfg_path = sandbox.join("probe-mcp.json");
            std::fs::write(&cfg_path, cfg.to_string()).unwrap();
            let args = base_args(&[
                "--permission-mode", "default",
                "--mcp-config", cfg_path.to_str().unwrap(),
                "--permission-prompt-tool", "mcp__probe__approve",
            ]);
            let mut s = LineSession::spawn("claude", &args, sandbox, &rec("claude-permission"));
            s.send(user("Create a file named probe.txt containing the text hi, using the Write tool."));
            s.wait_for(T, |v| is_type(v, "result"));
            s.finish(Duration::from_secs(10));
            println!("probe.txt exists: {}", sandbox.join("probe.txt").exists());
            let log = std::fs::read_to_string(&log_path).unwrap_or_default();
            let calls: Vec<Value> = log.lines().filter_map(|l| serde_json::from_str::<Value>(l).ok())
                .filter(|v| v.get("method").and_then(Value::as_str) == Some("tools/call")).collect();
            println!("approve invoked: {}", calls.len());
            for c in &calls { println!("  tool_name requested: {}", c["params"]["arguments"]["tool_name"]); }
        }
        other => panic!("unknown claude scenario {other}"),
    }
}
