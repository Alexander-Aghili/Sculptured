// WARNING: re-running these probes writes RAW, UNSCRUBBED recordings to
// crates/fixtures/recordings/, overwriting the committed (scrubbed) fixtures.
// They contain home paths, account/plan details, hook output and ids. After any
// re-run, apply the M0 Task 4 scrub (see docs/spikes/m0-driver-capabilities.md
// "Scrub note") before committing, and make the recordings valid JSONL again.
mod claude;
mod codex;
mod session;

use serde_json::{json, Value};
use session::LineSession;
use std::path::PathBuf;
use std::time::Duration;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}
fn sandbox() -> PathBuf {
    root().join("spikes/m0/sandbox")
}
fn rec(name: &str) -> PathBuf {
    let dir = root().join("crates/fixtures/recordings");
    std::fs::create_dir_all(&dir).unwrap();
    dir.join(format!("{name}.jsonl"))
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.iter().map(String::as_str).collect::<Vec<_>>().as_slice() {
        ["selftest"] => selftest(),
        ["claude", scenario] => claude::run(scenario, &sandbox(), rec),
        ["codex", scenario] => codex::run(scenario, &sandbox(), rec),
        ["mcp-approve"] => mcp_approve(),
        other => {
            eprintln!("unknown probe {other:?}; try: selftest | claude <scenario> | codex <scenario>");
            std::process::exit(2);
        }
    }
}

/// Exercises LineSession against `cat` so the harness is proven before any model call.
fn selftest() {
    // Test 1: Basic send/wait/finish cycle
    let mut s = LineSession::spawn("cat", &[], &sandbox(), &rec("selftest-basic"));
    s.send(json!({ "hello": 1 }));
    let got = s.wait_for(Duration::from_secs(2), |v| v.get("hello").is_some());
    assert_eq!(got, Some(json!({ "hello": 1 })));
    let none = s.wait_for(Duration::from_millis(300), |_| true);
    assert_eq!(none, None::<Value>);
    assert_eq!(s.finish(Duration::from_secs(2)), Some(0));
    std::fs::remove_file(rec("selftest-basic")).ok();
    println!("selftest 1/3: basic ok");

    // Test 2: Buffer scan test - send a, b, c; wait_for(c) then wait_for(b) then wait_for(a)
    // This verifies that wait_for can scan the buffer and find a match that's not the first item.
    let mut s = LineSession::spawn("cat", &[], &sandbox(), &rec("selftest-buffer"));
    s.send(json!({ "a": 1 }));
    s.send(json!({ "b": 2 }));
    s.send(json!({ "c": 3 }));
    // Sleep briefly to let cat echo all three items (so they're likely buffered)
    std::thread::sleep(Duration::from_millis(100));

    // Wait for c - should retrieve it (either from buffer or channel)
    let c = s.wait_for(Duration::from_secs(2), |v| v.get("c").is_some());
    assert_eq!(c, Some(json!({ "c": 3 })));

    // Wait for b - should find it in buffer even if a is before it
    let b = s.wait_for(Duration::from_secs(2), |v| v.get("b").is_some());
    assert_eq!(b, Some(json!({ "b": 2 })));

    // Wait for a - should find it in buffer
    let a = s.wait_for(Duration::from_secs(2), |v| v.get("a").is_some());
    assert_eq!(a, Some(json!({ "a": 1 })));

    // Wait for b again with short timeout - should return None (already consumed)
    let none = s.wait_for(Duration::from_millis(200), |v| v.get("b").is_some());
    assert_eq!(none, None::<Value>);

    s.finish(Duration::from_secs(2));
    std::fs::remove_file(rec("selftest-buffer")).ok();
    println!("selftest 2/3: buffer scan ok");

    // Test 3: stdout_closed test - spawn `true` (exits immediately)
    let s = LineSession::spawn("true", &[], &sandbox(), &rec("selftest-closed"));
    let none = s.wait_for(Duration::from_millis(500), |_| true);
    assert_eq!(none, None::<Value>);
    // Verify stdout_closed in recording
    let recording = std::fs::read_to_string(rec("selftest-closed")).expect("read recording");
    assert!(recording.contains("\"stdout_closed\":true"), "recording should contain stdout_closed");
    s.finish(Duration::from_secs(2));
    std::fs::remove_file(rec("selftest-closed")).ok();
    println!("selftest 3/3: stdout_closed ok");

    println!("selftest ok");
}

fn mcp_approve() {
    use std::io::{BufRead, Write};
    let log_path = sandbox().join("mcp-approve.log");
    let mut log = std::fs::OpenOptions::new().create(true).append(true).open(log_path).unwrap();
    let stdin = std::io::stdin();
    let mut out = std::io::stdout();
    for line in stdin.lock().lines().map_while(Result::ok) {
        writeln!(log, "{line}").unwrap();
        let req: Value = match serde_json::from_str(&line) { Ok(v) => v, Err(_) => continue };
        let Some(id) = req.get("id").cloned() else { continue }; // notifications need no reply
        let method = req["method"].as_str().unwrap_or("");
        let result = match method {
            "initialize" => json!({
                "protocolVersion": req["params"]["protocolVersion"].clone(),
                "capabilities": { "tools": {} },
                "serverInfo": { "name": "probe", "version": "0.0.0" }
            }),
            "tools/list" => json!({ "tools": [{
                "name": "approve",
                "description": "Approve a permission request",
                "inputSchema": { "type": "object", "properties": {
                    "tool_name": { "type": "string" }, "input": { "type": "object" }, "tool_use_id": { "type": "string" }
                }, "required": ["tool_name", "input"] }
            }]}),
            "tools/call" => {
                let input = req["params"]["arguments"]["input"].clone();
                let decision = json!({ "behavior": "allow", "updatedInput": input });
                json!({ "content": [{ "type": "text", "text": decision.to_string() }] })
            }
            _ => json!({}),
        };
        writeln!(out, "{}", json!({ "jsonrpc": "2.0", "id": id, "result": result })).unwrap();
        out.flush().unwrap();
    }
}
