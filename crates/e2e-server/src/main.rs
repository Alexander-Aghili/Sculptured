//! `e2e-server`: the Playwright web server. Builds the web UI into a throwaway directory, runs
//! `sculptured serve` on port 14410 with a throwaway data dir and `HOME`, and on exit, SIGINT,
//! SIGTERM or SIGHUP stops serve and hostd and removes the directory.
//!
//! The binary is `$SCULPTURED_BIN` when set; otherwise `cargo build -p sculptured` runs and
//! `${CARGO_TARGET_DIR:-target}/debug/sculptured` is used. `$RIG_E2E_PORT` picks another
//! port (the Playwright config reads the same variable), so two runs can share a machine.
//!
//! Serve runs with `--question-timeout-secs 8`: questions expire in 8 s, long enough for a
//! Playwright test to answer one first and short enough to see an expiry.
//!
//! Codex agents run on `fake-codex` (`$RIG_E2E_FAKE_CODEX`, else built with cargo).

use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use e2e_server::Session;

const DEFAULT_PORT: &str = "14410";

fn port() -> String {
    std::env::var("RIG_E2E_PORT").ok().filter(|p| p.parse::<u16>().is_ok()).unwrap_or_else(|| DEFAULT_PORT.to_string())
}

static STOP: AtomicBool = AtomicBool::new(false);

extern "C" fn on_signal(_: libc::c_int) {
    STOP.store(true, Ordering::SeqCst);
}

fn install_signal_handlers() {
    for sig in [libc::SIGINT, libc::SIGTERM, libc::SIGHUP] {
        // SAFETY: the handler only stores to an atomic, which is async-signal-safe.
        unsafe {
            libc::signal(sig, on_signal as *const () as libc::sighandler_t);
        }
    }
}

/// The workspace root: two levels above this crate.
fn workspace() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..").canonicalize().expect("workspace root")
}

fn run(what: &str, cmd: &mut Command) -> Result<(), String> {
    let status = cmd.status().map_err(|e| format!("{what}: {e}"))?;
    if STOP.load(Ordering::SeqCst) {
        return Err(format!("{what}: stopped by a signal"));
    }
    if !status.success() {
        return Err(format!("{what} failed ({status})"));
    }
    Ok(())
}

fn binary(root: &Path) -> Result<PathBuf, String> {
    if let Some(bin) = std::env::var_os("SCULPTURED_BIN") {
        let bin = PathBuf::from(bin);
        return if bin.is_file() { Ok(bin) } else { Err(format!("SCULPTURED_BIN is not a file: {}", bin.display())) };
    }
    run("cargo build -p sculptured", Command::new("cargo").args(["build", "-q", "-p", "sculptured"]).current_dir(root))?;
    let target = std::env::var_os("CARGO_TARGET_DIR").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("target"));
    let target = if target.is_absolute() { target } else { root.join(target) };
    Ok(target.join("debug").join("sculptured"))
}

/// fake-codex, so e2e runs Codex agents without the real CLI: `$RIG_E2E_FAKE_CODEX`, else built with cargo.
fn fake_codex(root: &Path) -> Result<PathBuf, String> {
    if let Some(bin) = std::env::var_os("RIG_E2E_FAKE_CODEX") {
        let bin = PathBuf::from(bin);
        return if bin.is_file() { Ok(bin) } else { Err(format!("RIG_E2E_FAKE_CODEX is not a file: {}", bin.display())) };
    }
    run(
        "cargo build -p fixtures --bin fake-codex",
        Command::new("cargo").args(["build", "-q", "-p", "fixtures", "--bin", "fake-codex"]).current_dir(root),
    )?;
    let target = std::env::var_os("CARGO_TARGET_DIR").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("target"));
    let target = if target.is_absolute() { target } else { root.join(target) };
    Ok(target.join("debug").join("fake-codex"))
}

fn serve(session: &mut Session) -> Result<ExitCode, String> {
    let root = workspace();
    let dist = session.web_dist();
    run(
        "web build",
        Command::new("npm")
            .arg("--prefix")
            .arg(root.join("web"))
            .args(["run", "build", "--", "--outDir"])
            .arg(&dist)
            .arg("--emptyOutDir"),
    )?;
    let bin = binary(&root)?;
    let codex = fake_codex(&root)?;
    let port = port();
    let child = Command::new(&bin)
        .env("HOME", session.home())
        .args(["serve", "--port", &port, "--data-dir"])
        .arg(session.data_dir())
        .arg("--web-dir")
        .arg(&dist)
        .args(["--question-timeout-secs", "8"])
        .arg("--codex-program")
        .arg(&codex)
        .spawn()
        .map_err(|e| format!("start {}: {e}", bin.display()))?;
    eprintln!("e2e-server: serving http://127.0.0.1:{port} from {} (data and HOME in {})", bin.display(), session.root().display());
    session.adopt_serve(child);
    loop {
        if STOP.load(Ordering::SeqCst) {
            return Ok(ExitCode::SUCCESS);
        }
        if let Some(status) = session.serve_mut().and_then(|c| c.try_wait().ok().flatten()) {
            return Ok(if status.success() { ExitCode::SUCCESS } else { ExitCode::FAILURE });
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

fn main() -> ExitCode {
    install_signal_handlers();
    // Created before any build, so every way out removes the throwaway directory.
    let mut session = match Session::new() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("e2e-server: cannot create a throwaway directory: {e}");
            return ExitCode::FAILURE;
        }
    };
    let code = serve(&mut session).unwrap_or_else(|e| {
        eprintln!("e2e-server: {e}");
        ExitCode::FAILURE
    });
    session.shutdown();
    code
}
