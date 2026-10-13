use crate::journal::Journal;
use crate::link::run_link;
use crate::supervisor::Supervisor;
use drivers::claude::ClaudeStreamDriver;
use drivers::codex::CodexAppServerDriver;
use drivers::stub::StubDriver;
use drivers::Driver;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::signal::unix::{signal, SignalKind};

pub struct HostdOptions {
    pub controld_url: String,
    pub host_id: String,
    pub data_dir: PathBuf,
    pub token: String,
    pub claude_program: Option<PathBuf>,
    /// The Codex CLI (`codex` on `PATH` when unset).
    pub codex_program: Option<PathBuf>,
    /// Connected computers: allowed folders, enforced on every launch. None for a local `serve`.
    pub policy: Option<crate::policy::RunnerPolicy>,
}

/// Returned by `run_hostd` when another hostd already owns the data dir.
/// The `sculptured hostd` subcommand exits with code 75 (EX_TEMPFAIL) for it.
pub const ALREADY_RUNNING: &str = "another hostd already owns this data dir";

/// Holds an exclusive flock on `{data_dir}/hostd.lock` for the life of the process,
/// so a controld restart can never produce two hostds driving the same seats.
fn lock_data_dir(dir: &std::path::Path) -> Result<std::fs::File, String> {
    use std::os::fd::AsRawFd;
    let f = std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(dir.join("hostd.lock"))
        .map_err(|e| format!("open lock: {e}"))?;
    // SAFETY: flock on a file descriptor we own.
    let rc = unsafe { libc::flock(f.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) };
    if rc != 0 {
        return Err(ALREADY_RUNNING.to_string());
    }
    Ok(f)
}

/// Creates hostd's folder owner-only (0700) when it is missing, and refuses one that other users can
/// open: it holds the agents' tool socket and the files that name their tokens. An existing folder's
/// mode is never changed.
pub fn private_data_dir(dir: &std::path::Path) -> Result<(), String> {
    use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
    std::fs::DirBuilder::new().recursive(true).mode(0o700).create(dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    let mode = std::fs::metadata(dir).map_err(|e| format!("cannot read {}: {e}", dir.display()))?.permissions().mode();
    if mode & 0o077 != 0 {
        return Err(format!(
            "the agent runner's folder {} can be opened by other users (mode {:o}); make it private with chmod 700, because it holds the agents' tool socket",
            dir.display(),
            mode & 0o777
        ));
    }
    Ok(())
}

/// The supervisor, serving the agent tool socket in hostd's own folder (`host-local/` under `serve`),
/// which is private (`private_data_dir`): the socket and the agents' tool config files are reachable by
/// this user only.
fn with_seat_tools(opts: &HostdOptions, drivers: Vec<Arc<dyn Driver>>, journal: Journal) -> Result<Supervisor, String> {
    let socket = opts.data_dir.join(crate::seat_tools::SOCKET_FILE);
    let shim = std::env::current_exe().map_err(|e| format!("cannot locate sculptured for the agent tools: {e}"))?;
    let host = crate::supervisor::SeatToolsHost { socket: socket.clone(), shim };
    let sup = Supervisor::with_seat_tools(opts.host_id.clone(), drivers, journal, Some(host));
    let sup = match &opts.policy { Some(p) => sup.restricted(p.clone()), None => sup };
    let sup = sup.with_ops(ops_host(opts));
    let socket_sup = sup.clone();
    tokio::spawn(async move {
        if let Err(e) = crate::seat_tools::serve_socket(socket_sup, socket).await {
            tracing::error!(error = %e, "the agent tool socket stopped; agents cannot ask questions or report until hostd restarts");
        }
    });
    Ok(sup)
}

fn write_pid(data_dir: &Path) -> Result<(), String> {
    let pid_tmp = data_dir.join("hostd.pid.tmp");
    std::fs::write(&pid_tmp, std::process::id().to_string())
        .and_then(|_| std::fs::rename(&pid_tmp, data_dir.join("hostd.pid")))
        .map_err(|e| format!("write hostd.pid: {e}"))
}

/// A controld restarted on another port records its URL in the data dir; follow it.
fn controld_url(opts: &HostdOptions) -> String {
    // `controld.url` is how a local `serve` hands over its port; a connected computer never follows it.
    if opts.policy.is_some() {
        return opts.controld_url.clone();
    }
    std::fs::read_to_string(opts.data_dir.join("controld.url"))
        .ok()
        .map(|u| u.trim().to_string())
        .filter(|u| !u.is_empty())
        .unwrap_or_else(|| opts.controld_url.clone())
}

/// Runs the host runtime until told to stop, reconnecting to controld with backoff. Seats keep
/// running while controld is unreachable. On SIGTERM or SIGINT (the desktop quitting, `systemctl
/// stop`, Ctrl+C) it stops its agents first: each leads its own process group, so the signal alone
/// would leave them working with nothing watching or recording them.
pub async fn run_hostd(opts: HostdOptions) -> Result<(), String> {
    let drivers = drivers(&opts);
    private_data_dir(&opts.data_dir)?;
    let _lock = lock_data_dir(&opts.data_dir)?;
    write_pid(&opts.data_dir)?;
    let journal =
        Journal::open(&opts.data_dir.join("hostd.sqlite"), 10_000).map_err(|e| format!("open journal: {e}"))?;
    let sup = with_seat_tools(&opts, drivers, journal)?;
    let mut term = signal(SignalKind::terminate()).map_err(|e| format!("signal handler: {e}"))?;
    let mut int = signal(SignalKind::interrupt()).map_err(|e| format!("signal handler: {e}"))?;
    tokio::select! {
        r = keep_linked(&opts, &sup) => r,
        _ = async { tokio::select! { _ = term.recv() => {}, _ = int.recv() => {} } } => {
            let stopped = sup.stop_all(STOP_GRACE_MS).await;
            tracing::info!(stopped, "runner stopping: stopped its agents");
            Ok(())
        }
    }
}

/// How long an agent gets to finish its current output when the runner stops, before it is killed.
const STOP_GRACE_MS: u64 = 3000;

async fn keep_linked(opts: &HostdOptions, sup: &Supervisor) -> Result<(), String> {
    const MIN_BACKOFF: Duration = Duration::from_millis(500);
    let mut backoff = MIN_BACKOFF;
    loop {
        let connected_at = tokio::time::Instant::now();
        match run_link(&controld_url(opts), &opts.token, sup).await {
            Ok(()) => return Ok(()),
            // A connected computer whose key is refused was disconnected: say so and stop retrying.
            Err(e) if opts.policy.is_some() && e.disconnected() => {
                return Err("This computer was disconnected from its Sculptured account. Run `sculptured connect <address>` again to reconnect it.".into());
            }
            Err(e) => {
                tracing::warn!(error = %e, "link down; agents keep running");
                // A long, healthy connection starts the next retry from the shortest delay.
                if connected_at.elapsed() > Duration::from_secs(10) {
                    backoff = MIN_BACKOFF;
                }
                tokio::time::sleep(backoff).await;
                backoff = (backoff * 2).min(Duration::from_secs(5));
            }
        }
    }
}

/// Where this runner does local operations: its owner's home, a copies folder next to its data folder
/// (`~/.sculptured/copies` for a local `serve`, `<runner dir>/copies` for a connected computer), its CLIs.
fn ops_host(opts: &HostdOptions) -> crate::ops::OpsHost {
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/"));
    let copies_root = opts.data_dir.parent().map(|p| p.join("copies")).unwrap_or_else(|| opts.data_dir.join("copies"));
    let codex_home = std::env::var_os("CODEX_HOME").map(PathBuf::from).unwrap_or_else(|| home.join(".codex"));
    crate::ops::OpsHost { context: localops::Context {
        home,
        copies_root,
        claude: opts.claude_program.clone().unwrap_or_else(|| PathBuf::from("claude")),
        codex: opts.codex_program.clone().unwrap_or_else(|| PathBuf::from("codex")),
        codex_home,
    } }
}

/// The drivers this host offers. Kept at the bottom of the file so adding one never touches `run_hostd`.
fn drivers(opts: &HostdOptions) -> Vec<Arc<dyn Driver>> {
    let claude = ClaudeStreamDriver { program: opts.claude_program.clone().unwrap_or_else(|| PathBuf::from("claude")) };
    let codex = CodexAppServerDriver { program: opts.codex_program.clone().unwrap_or_else(|| PathBuf::from("codex")), native_questions: false };
    vec![Arc::new(StubDriver), Arc::new(claude), Arc::new(codex)]
}
