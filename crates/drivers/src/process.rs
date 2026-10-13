//! Process plumbing shared by the CLI drivers: the child in its own process group, its stderr
//! tail, the stdout pump that honours a kill signal, reaping, and stop with a grace period.
use crate::{DriverError, DriverEvent, LaunchSpec};
use std::os::unix::process::ExitStatusExt;
use std::path::Path;
use std::process::{ExitStatus, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::{AsyncReadExt, BufReader, Lines};
use tokio::process::{Child, ChildStderr, ChildStdout, Command};
use tokio::sync::{oneshot, watch};
use tokio::task::JoinHandle;

/// How long stderr may stay open after the child is reaped (a detached grandchild may hold it).
const STDERR_DRAIN: Duration = Duration::from_millis(500);
/// How much of stderr an `Exited` event carries, in bytes.
const TAIL_BYTES: usize = 4096;

/// `program args…` in the agent's folder and environment, without hostd's token, stdio piped,
/// killed on drop and leading a process group of its own.
pub(crate) fn command(program: &Path, spec: &LaunchSpec, args: impl IntoIterator<Item = String>) -> Command {
    let mut cmd = Command::new(program);
    cmd.args(args)
        .current_dir(&spec.cwd)
        .envs(spec.env.iter().cloned())
        .env_remove(crate::HOST_TOKEN_ENV)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .process_group(0);
    cmd
}

pub(crate) fn spawn(cmd: &mut Command, program: &Path) -> Result<Child, DriverError> {
    cmd.spawn().map_err(|source| DriverError::Spawn { program: program.display().to_string(), source })
}

/// Signals the process group this driver created (the child is its leader).
pub(crate) fn kill_group(child: &Child) {
    if let Some(pid) = child.id() {
        // SAFETY: signalling the process group this driver created. The leader is not reaped yet
        // (`id()` is Some), so the group id cannot have been reused.
        unsafe {
            libc::killpg(pid as i32, libc::SIGKILL);
        }
    }
}

/// stderr, read in the background into a buffer that keeps the last 4 KiB or so, so a drain
/// that is cut short by a timeout still leaves the bytes read so far.
pub(crate) struct StderrTail {
    buf: Arc<Mutex<Vec<u8>>>,
    task: JoinHandle<()>,
}

impl StderrTail {
    pub(crate) fn start(stderr: ChildStderr) -> Self {
        let buf = Arc::new(Mutex::new(Vec::new()));
        let task = tokio::spawn(collect_stderr(stderr, buf.clone()));
        Self { buf, task }
    }

    /// Waits a bounded time for stderr to end, then returns what was read.
    pub(crate) async fn finish(self) -> Vec<u8> {
        let _ = tokio::time::timeout(STDERR_DRAIN, self.task).await;
        self.buf.lock().unwrap().clone()
    }
}

async fn collect_stderr(stderr: ChildStderr, buf: Arc<Mutex<Vec<u8>>>) {
    let mut r = BufReader::new(stderr);
    let mut chunk = [0u8; 4096];
    loop {
        match r.read(&mut chunk).await {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                let mut b = buf.lock().unwrap();
                b.extend_from_slice(&chunk[..n]);
                if b.len() > 2 * TAIL_BYTES {
                    let cut = b.len() - TAIL_BYTES;
                    b.drain(..cut);
                }
            }
        }
    }
}

/// The session's last event: how the process ended and the tail of its stderr.
pub(crate) fn exited(status: Option<ExitStatus>, stderr: &[u8]) -> DriverEvent {
    let start = stderr.len().saturating_sub(TAIL_BYTES);
    DriverEvent::Exited {
        exit_code: status.and_then(|s| s.code()),
        signal: status.and_then(|s| s.signal()),
        stderr_tail: String::from_utf8_lossy(&stderr[start..]).into_owned(),
    }
}

/// Feeds each stdout line to `on_line` until the output ends (EOF or a read error) or `kill`
/// fires. True when `kill` fired or its sender was dropped: a completed oneshot must not be
/// polled again.
pub(crate) async fn pump_lines(
    lines: &mut Lines<BufReader<ChildStdout>>,
    kill: &mut oneshot::Receiver<()>,
    mut on_line: impl FnMut(String),
) -> bool {
    loop {
        tokio::select! {
            line = lines.next_line() => match line {
                Ok(Some(l)) => on_line(l),
                _ => return false,
            },
            _ = &mut *kill => return true,
        }
    }
}

/// Waits for the child. The child may still be alive, so `kill` (unless it already fired) is
/// still honoured by killing the group.
pub(crate) async fn reap(child: &mut Child, kill: &mut oneshot::Receiver<()>, mut kill_done: bool) -> Option<ExitStatus> {
    loop {
        tokio::select! {
            st = child.wait() => return st.ok(),
            _ = &mut *kill, if !kill_done => {
                kill_done = true;
                kill_group(child);
            }
        }
    }
}

/// Waits up to `grace` for the session to exit, then fires `kill` and waits for the exit.
pub(crate) async fn stop_within(grace: Duration, exited: &watch::Receiver<bool>, kill: &mut Option<oneshot::Sender<()>>) {
    let mut exited = exited.clone();
    if tokio::time::timeout(grace, exited.wait_for(|e| *e)).await.is_err() {
        if let Some(k) = kill.take() {
            let _ = k.send(());
        }
        let _ = exited.wait_for(|e| *e).await;
    }
}
