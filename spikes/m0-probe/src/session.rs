use serde_json::{json, Value};
use std::cell::RefCell;
use std::collections::VecDeque;
use std::fs::File;
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

pub struct LineSession {
    child: Child,
    stdin: Option<ChildStdin>,
    rx: Receiver<Value>,
    rec: Arc<Mutex<File>>,
    start: Instant,
    pending: RefCell<VecDeque<Value>>,
}

fn record(rec: &Arc<Mutex<File>>, start: Instant, dir: &str, line: Value) {
    let entry = json!({ "t_ms": start.elapsed().as_millis() as u64, "dir": dir, "line": line });
    let mut f = rec.lock().unwrap();
    writeln!(f, "{entry}").unwrap();
}

impl LineSession {
    pub fn spawn(program: &str, args: &[String], cwd: &Path, rec_path: &Path) -> LineSession {
        let rec = Arc::new(Mutex::new(File::create(rec_path).expect("create recording")));
        let start = Instant::now();
        record(&rec, start, "meta", json!({ "program": program, "args": args }));
        let mut child = Command::new(program)
            .args(args)
            .current_dir(cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap_or_else(|e| panic!("spawn {program}: {e}"));
        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();
        let (tx, rx) = channel();
        let rec_out = rec.clone();
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                let v = serde_json::from_str::<Value>(&line).unwrap_or(Value::String(line));
                record(&rec_out, start, "out", v.clone());
                if tx.send(v).is_err() {
                    break;
                }
            }
        });
        let rec_err = rec.clone();
        thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                record(&rec_err, start, "stderr", Value::String(line));
            }
        });
        let stdin = child.stdin.take();
        LineSession { child, stdin, rx, rec, start, pending: RefCell::new(VecDeque::new()) }
    }

    pub fn send(&mut self, v: Value) {
        record(&self.rec, self.start, "in", v.clone());
        let stdin = self.stdin.as_mut().expect("stdin open");
        writeln!(stdin, "{v}").unwrap();
        stdin.flush().unwrap();
    }

    /// Drains output lines until `pred` matches. Returns the matching line, or
    /// None on timeout (recorded as an explicit timeout marker). Buffers non-matching
    /// lines for later retrieval.
    pub fn wait_for(&self, timeout: Duration, pred: impl Fn(&Value) -> bool) -> Option<Value> {
        let deadline = Instant::now() + timeout;
        let mut pending = self.pending.borrow_mut();

        // Scan whole pending buffer for a match
        if let Some(idx) = pending.iter().position(|v| pred(v)) {
            let v = pending.remove(idx).unwrap();
            drop(pending);
            return Some(v);
        }
        drop(pending);

        loop {
            let left = deadline.saturating_duration_since(Instant::now());
            match self.rx.recv_timeout(left) {
                Ok(v) if pred(&v) => return Some(v),
                Ok(v) => {
                    self.pending.borrow_mut().push_back(v);
                    continue;
                }
                Err(RecvTimeoutError::Timeout) => {
                    record(&self.rec, self.start, "meta", json!({ "timeout_ms": timeout.as_millis() as u64 }));
                    return None;
                }
                Err(RecvTimeoutError::Disconnected) => {
                    record(&self.rec, self.start, "meta", json!({ "stdout_closed": true }));
                    return None;
                }
            }
        }
    }

    /// Closes stdin and waits up to `grace` for exit; kills after that.
    pub fn finish(mut self, grace: Duration) -> Option<i32> {
        self.stdin.take();
        let deadline = Instant::now() + grace;
        loop {
            if let Some(status) = self.child.try_wait().unwrap() {
                record(&self.rec, self.start, "meta", json!({ "exit": status.code() }));
                return status.code();
            }
            if Instant::now() >= deadline {
                let _ = self.child.kill();
                let _ = self.child.wait();
                record(&self.rec, self.start, "meta", json!({ "killed_after_ms": grace.as_millis() as u64 }));
                return None;
            }
            thread::sleep(Duration::from_millis(100));
        }
    }
}
