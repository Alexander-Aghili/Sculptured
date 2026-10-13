//! `sculptured connect <origin>`: link this computer to a Sculptured account. It pairs once (a code
//! approved in the browser), keeps its key in `<data dir>/device.json` (0600), then runs the agent
//! runner against the account over `wss://…/host`, within the folders allowed in `runner.json`.
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Credentials { pub origin: String, pub device_id: String, pub key: String }

impl Credentials {
    pub fn load(dir: &Path) -> Result<Option<Credentials>, String> {
        match std::fs::read_to_string(dir.join("device.json")) {
            Ok(t) => serde_json::from_str(&t).map(Some).map_err(|e| format!("device.json is not valid: {e}")),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
    pub fn save(&self, dir: &Path) -> Result<(), String> {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        let tmp = dir.join("device.json.tmp");
        let mut f = std::fs::OpenOptions::new().create(true).write(true).truncate(true).mode(0o600).open(&tmp).map_err(|e| e.to_string())?;
        f.write_all(serde_json::to_string_pretty(self).unwrap().as_bytes()).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, dir.join("device.json")).map_err(|e| e.to_string())
    }
}

pub fn host_url(origin: &str) -> Result<String, String> {
    let bad = || format!("{origin} must be like https://app.example.com (http:// only for this computer, for testing)");
    let u = reqwest::Url::parse(origin.trim_end_matches('/')).map_err(|_| bad())?;
    if !u.username().is_empty() || u.password().is_some() || u.query().is_some() || !matches!(u.path(), "" | "/") { return Err(bad()) }
    let host = u.host_str().ok_or_else(bad)?;
    let port = u.port().map(|p| format!(":{p}")).unwrap_or_default();
    match u.scheme() {
        "https" => Ok(format!("wss://{host}{port}/host")),
        "http" if matches!(host, "127.0.0.1" | "localhost") => Ok(format!("ws://{host}{port}/host")),
        _ => Err(bad()),
    }
}

/// The one TLS crypto provider (`ring`) this process uses, for the pairing client and the runner link.
pub fn tls_provider() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}

fn http() -> reqwest::Client { tls_provider(); reqwest::Client::builder().timeout(std::time::Duration::from_secs(20)).build().expect("client") }

/// Runs the pairing: shows the code via `on_code(code, url)`, waits for approval, returns the credentials.
pub async fn pair(origin: &str, name: &str, platform: &str, on_code: impl Fn(&str, &str)) -> Result<Credentials, String> {
    let origin = origin.trim_end_matches('/');
    #[derive(Deserialize)] struct Start { device_code: String, user_code: String, verify_url: String, interval: u64, expires_in: u64 }
    let c = http();
    let s: Start = c.post(format!("{origin}/gw/api/device/start")).header("origin", origin).json(&serde_json::json!({"name": name, "platform": platform}))
        .send().await.map_err(|e| format!("cannot reach {origin}: {e}"))?.error_for_status().map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;
    on_code(&s.user_code, &s.verify_url);
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(s.expires_in);
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(s.interval.clamp(1, 30))).await;
        if std::time::Instant::now() > deadline { return Err("The code expired before it was approved. Run `sculptured connect` again.".into()) }
        let r = c.post(format!("{origin}/gw/api/device/token")).header("origin", origin).json(&serde_json::json!({"device_code": s.device_code})).send().await.map_err(|e| e.to_string())?;
        match r.status().as_u16() {
            200 => {
                #[derive(Deserialize)] struct Got { device_id: String, device_key: String }
                let g: Got = r.json().await.map_err(|e| e.to_string())?;
                return Ok(Credentials { origin: origin.to_string(), device_id: g.device_id, key: g.device_key });
            }
            428 => continue,
            _ => return Err("Pairing was not approved in time or was refused. Run `sculptured connect` again.".into()),
        }
    }
}

/// What the login service runs: `connect` for this origin, with the CLIs' full paths, because a login
/// service starts with a minimal PATH that usually lacks `~/.local/bin`, nvm or Homebrew.
pub fn service_args(exe: &Path, origin: &str, data_dir: &Path, claude: Option<&Path>, codex: Option<&Path>) -> Vec<String> {
    let mut a = vec![exe.display().to_string(), "connect".into(), origin.into(), "--data-dir".into(), data_dir.display().to_string()];
    if let Some(c) = claude { a.extend(["--claude-program".into(), c.display().to_string()]); }
    if let Some(c) = codex { a.extend(["--codex-program".into(), c.display().to_string()]); }
    a
}

/// `name` on PATH, as a full path.
pub fn find_on_path(name: &str) -> Option<PathBuf> {
    std::env::var_os("PATH").and_then(|p| std::env::split_paths(&p).map(|d| d.join(name)).find(|f| f.is_file()))
}

fn xml(s: &str) -> String { s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;") }
fn systemd_quote(s: &str) -> String { format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\"").replace('%', "%%")) }

/// The login service that keeps this computer connected: (file to write, contents).
pub fn service_unit(args: &[String], path_env: &str) -> (PathBuf, String) {
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default();
    if cfg!(target_os = "macos") {
        let file = home.join("Library/LaunchAgents/dev.sculptured.runner.plist");
        let argv: String = args.iter().map(|a| format!("<string>{}</string>", xml(a))).collect();
        let text = format!(r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>dev.sculptured.runner</string>
<key>ProgramArguments</key><array>{argv}</array>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>{}</string></dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
</dict></plist>
"#, xml(path_env));
        (file, text)
    } else {
        let file = home.join(".config/systemd/user/sculptured-runner.service");
        let exec: Vec<String> = args.iter().map(|a| systemd_quote(a)).collect();
        let text = format!("[Unit]\nDescription=Sculptured runner\nAfter=network-online.target\n\n[Service]\nEnvironment={}\nExecStart={}\nRestart=always\nRestartSec=5\n\n[Install]\nWantedBy=default.target\n",
            systemd_quote(&format!("PATH={path_env}")), exec.join(" "));
        (file, text)
    }
}

pub struct ConnectArgs {
    pub origin: String,
    pub name: Option<String>,
    pub allow: Vec<PathBuf>,
    pub data_dir: Option<PathBuf>,
    pub claude_program: Option<PathBuf>,
    pub codex_program: Option<PathBuf>,
    pub install_service: bool,
    /// Don't open the system browser for the pairing link (the desktop app shows it itself).
    pub no_browser: bool,
    /// Change this computer's access level (None: keep what `runner.json` says; new computers get full access).
    pub access: Option<hostd::policy::Access>,
    /// Capabilities to turn on (true) or off (false), by name.
    pub caps: Vec<(String, bool)>,
}

/// Applies `--enable` / `--disable` to the policy's capabilities.
pub fn set_caps(policy: &mut hostd::policy::RunnerPolicy, changes: &[(String, bool)]) -> Result<(), String> {
    let c = &mut policy.capabilities;
    for (name, on) in changes {
        let slot = match name.as_str() {
            "git" => &mut c.git,
            "copies" => &mut c.copies,
            "checks" => &mut c.checks,
            "cli-sign-in" | "cli_sign_in" => &mut c.cli_sign_in,
            "plan-usage" | "plan_usage" => &mut c.plan_usage,
            "generate" => &mut c.generate,
            other => return Err(format!("Unknown capability {other:?}: use git, copies, checks, cli-sign-in, plan-usage or generate")),
        };
        *slot = Some(*on);
    }
    Ok(())
}

/// `~/.sculptured/runner` unless `--data-dir` is given; created owner-only.
fn runner_dir(given: Option<PathBuf>) -> Result<PathBuf, String> {
    let dir = match given {
        Some(d) => d,
        None => PathBuf::from(std::env::var_os("HOME").ok_or("HOME is not set; pass --data-dir")?).join(".sculptured/runner"),
    };
    hostd::run::private_data_dir(&dir)?;
    Ok(dir)
}

fn this_computer() -> String {
    std::fs::read_to_string("/etc/hostname").ok().map(|h| h.trim().to_string()).filter(|h| !h.is_empty())
        .or_else(|| std::env::var("HOSTNAME").ok())
        .or_else(|| std::process::Command::new("hostname").output().ok().map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).filter(|h| !h.is_empty()))
        .unwrap_or_else(|| "This computer".into())
}

pub async fn run_connect(a: ConnectArgs) -> Result<(), String> {
    tls_provider();
    let origin = a.origin.trim_end_matches('/').to_string();
    let url = host_url(&origin)?;
    let dir = runner_dir(a.data_dir)?;
    let policy_file = dir.join("runner.json");
    let mut policy = hostd::policy::RunnerPolicy::load(&policy_file)?;
    for f in &a.allow { policy.allow(f)?; }
    if let Some(access) = a.access { policy.access = access; }
    set_caps(&mut policy, &a.caps)?;
    policy.save(&policy_file)?;
    let creds = match Credentials::load(&dir)? {
        Some(c) if c.origin == origin => c,
        _ => {
            let name = a.name.clone().unwrap_or_else(this_computer);
            let c = pair(&origin, &name, std::env::consts::OS, |code, link| {
                println!("To connect this computer, open:\n  {link}\nand confirm the code {code}");
                // The desktop app shows the link in its own window instead (`--no-browser`).
                if !a.no_browser {
                    let opener = if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
                    let _ = std::process::Command::new(opener).arg(link).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).spawn();
                }
            }).await?;
            c.save(&dir)?;
            c
        }
    };
    if a.install_service {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let claude = a.claude_program.clone().or_else(|| find_on_path("claude"));
        let codex = a.codex_program.clone().or_else(|| find_on_path("codex"));
        let args = service_args(&exe, &origin, &dir, claude.as_deref(), codex.as_deref());
        let path_env = std::env::var("PATH").unwrap_or_else(|_| "/usr/local/bin:/usr/bin:/bin".into());
        let (file, text) = service_unit(&args, &path_env);
        if let Some(parent) = file.parent() { std::fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
        std::fs::write(&file, text).map_err(|e| format!("cannot write {}: {e}", file.display()))?;
        let ok = if cfg!(target_os = "macos") {
            std::process::Command::new("launchctl").args(["load", "-w"]).arg(&file).status().is_ok_and(|s| s.success())
        } else {
            std::process::Command::new("systemctl").args(["--user", "daemon-reload"]).status().is_ok_and(|s| s.success())
                && std::process::Command::new("systemctl").args(["--user", "enable", "--now", "sculptured-runner"]).status().is_ok_and(|s| s.success())
        };
        println!("{} {}", if ok { "Installed and started" } else { "Wrote (start it yourself)" }, file.display());
        return Ok(());
    }
    if policy.allowed_folders.is_empty() {
        println!("No folders allowed yet: agents can't start here until you run `sculptured allow <folder>`.");
    }
    println!("Connected to {origin}. Agents start here, in: {}", policy.allowed_folders.iter().map(|f| f.display().to_string()).collect::<Vec<_>>().join(", "));
    println!("{}", match policy.access {
        hostd::policy::Access::Full => "Access: full. Agents can act as you do on this computer. Use --sandboxed to limit them.",
        hostd::policy::Access::Sandboxed => "Access: sandboxed. Claude asks before risky actions; Codex writes only inside its folder.",
    });
    println!("Your account may also use here: {}", { let c = policy.info().capabilities; if c.is_empty() { "nothing else".to_string() } else { c.join(", ") } });
    hostd::run_hostd(hostd::HostdOptions {
        controld_url: url,
        host_id: creds.device_id.clone(),
        data_dir: dir.join("hostd"),
        token: format!("{}.{}", creds.device_id, creds.key),
        claude_program: a.claude_program,
        codex_program: a.codex_program,
        policy: Some(policy),
    }).await
}

pub fn run_allow(folder: &Path, data_dir: Option<PathBuf>) -> Result<(), String> {
    let dir = runner_dir(data_dir)?;
    let file = dir.join("runner.json");
    let mut policy = hostd::policy::RunnerPolicy::load(&file)?;
    let added = policy.allow(folder)?;
    policy.save(&file)?;
    println!("Agents may now work in {}.", added.display());
    println!("Allowed: {}", policy.allowed_folders.iter().map(|f| f.display().to_string()).collect::<Vec<_>>().join(", "));
    println!("Restart `sculptured connect` (or its service) so running agents see it.");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{routing::post, Json, Router};
    use serde_json::{json, Value};
    use std::sync::{Arc, atomic::{AtomicU32, Ordering}};

    #[test]
    fn host_urls_use_wss_except_on_this_machine() {
        assert_eq!(host_url("https://app.example.com").unwrap(), "wss://app.example.com/host");
        assert_eq!(host_url("http://127.0.0.1:4430/").unwrap(), "ws://127.0.0.1:4430/host");
        assert!(host_url("http://app.example.com").is_err(), "plain http to another machine would expose the key");
        assert!(host_url("http://localhost:1@evil.example").is_err(), "credentials-in-URL tricks are not this machine");
        assert!(host_url("https://user@app.example.com").is_err());
    }

    #[tokio::test]
    async fn pairing_shows_the_code_waits_for_approval_and_saves_private_credentials() {
        let polls = Arc::new(AtomicU32::new(0));
        let p2 = polls.clone();
        let app = Router::new()
            .route("/gw/api/device/start", post(|Json(b): Json<Value>| async move {
                assert_eq!(b["platform"], std::env::consts::OS);
                Json(json!({"device_code":"d".repeat(64),"user_code":"WXYZ-2345","verify_url":"http://127.0.0.1/connect?code=WXYZ-2345","interval":0,"expires_in":600}))
            }))
            .route("/gw/api/device/token", post(move || { let n = p2.fetch_add(1, Ordering::SeqCst); async move {
                if n < 2 { (axum::http::StatusCode::PRECONDITION_REQUIRED, Json(json!({"error":{"code":"authorization_pending","message":"wait"}}))) }
                else { (axum::http::StatusCode::OK, Json(json!({"device_id":"11111111-1111-1111-1111-111111111111","device_key":"k".repeat(64)}))) }
            }}));
        let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let origin = format!("http://{}", l.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(l, app).await.unwrap() });
        let shown = Arc::new(std::sync::Mutex::new(String::new()));
        let s2 = shown.clone();
        let creds = pair(&origin, "Laptop", std::env::consts::OS, move |code, _url| *s2.lock().unwrap() = code.to_string()).await.unwrap();
        assert_eq!(&*shown.lock().unwrap(), "WXYZ-2345");
        assert_eq!(polls.load(Ordering::SeqCst), 3);
        let dir = tempfile::tempdir().unwrap();
        creds.save(dir.path()).unwrap();
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(std::fs::metadata(dir.path().join("device.json")).unwrap().permissions().mode() & 0o777, 0o600);
        assert_eq!(Credentials::load(dir.path()).unwrap(), Some(creds));
    }

    #[test]
    fn the_login_service_runs_connect_for_this_origin_and_finds_the_clis_after_a_reboot() {
        let args = service_args(Path::new("/opt/My Apps/sculptured"), "https://app.x", Path::new("/home/a/.sculptured/runner"),
            Some(Path::new("/home/a/.local/bin/claude")), Some(Path::new("/opt/homebrew/bin/codex")));
        assert_eq!(args, ["/opt/My Apps/sculptured", "connect", "https://app.x", "--data-dir", "/home/a/.sculptured/runner",
            "--claude-program", "/home/a/.local/bin/claude", "--codex-program", "/opt/homebrew/bin/codex"]);
        let (file, text) = service_unit(&args, "/usr/bin:/home/a/.local/bin:/a&b");
        if cfg!(target_os = "linux") {
            assert!(file.ends_with(".config/systemd/user/sculptured-runner.service"));
            assert!(text.contains(r#"ExecStart="/opt/My Apps/sculptured" "connect""#), "{text}");
            assert!(text.contains(r#"Environment="PATH=/usr/bin:/home/a/.local/bin:/a&b""#), "{text}");
            assert!(text.contains("Restart=always"));
        }
        if cfg!(target_os = "macos") {
            assert!(file.ends_with("Library/LaunchAgents/dev.sculptured.runner.plist"));
            assert!(text.contains("<string>/opt/My Apps/sculptured</string>") && text.contains("/a&amp;b") && text.contains("<key>KeepAlive</key>"));
        }
    }
}

#[cfg(test)]
mod caps_tests {
    #[test]
    fn capabilities_turn_on_and_off_by_name() {
        let mut p = hostd::policy::RunnerPolicy::default();
        super::set_caps(&mut p, &[("checks".into(), false), ("git".into(), false)]).unwrap();
        assert!(!p.caps().checks && !p.caps().git && p.caps().copies);
        super::set_caps(&mut p, &[("git".into(), true)]).unwrap();
        assert!(p.caps().git);
        assert!(super::set_caps(&mut p, &[("rm".into(), true)]).is_err());
        super::set_caps(&mut p, &[("generate".into(), false)]).unwrap();
        assert!(!p.caps().generate);
    }

    #[test]
    fn switching_to_sandboxed_later_turns_checks_off_unless_enabled_by_name() {
        let mut p = hostd::policy::RunnerPolicy::default();
        super::set_caps(&mut p, &[("git".into(), false)]).unwrap();
        p.access = hostd::policy::Access::Sandboxed;
        assert!(!p.caps().checks, "checks follow the access level unless the owner set them");
        assert!(!p.caps().git, "the owner's own choice stays");
        super::set_caps(&mut p, &[("checks".into(), true)]).unwrap();
        assert!(p.caps().checks);
        let saved: hostd::policy::RunnerPolicy = serde_json::from_str(r#"{"access":"sandboxed","capabilities":{"git":false}}"#).unwrap();
        assert!(!saved.caps().git && !saved.caps().checks && saved.caps().copies, "a file naming only some capabilities loads");
    }
}
