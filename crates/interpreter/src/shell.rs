//! Shell commands: what kind of command it is, and its risks. Reads words, never runs anything.
use crate::{flag, outside};
use model::{ActionClass, RiskFlag};
use std::path::Path;

/// Words of `s`, with simple quote handling (no expansion).
fn words(s: &str) -> Vec<String> {
    let (mut out, mut cur, mut quote, mut quoted) = (Vec::new(), String::new(), None::<char>, false);
    for c in s.chars() {
        match quote {
            Some(q) if c == q => quote = None,
            Some(_) => cur.push(c),
            None if c == '\'' || c == '"' => {
                quote = Some(c);
                quoted = true;
            }
            None if c.is_whitespace() => {
                if !cur.is_empty() || quoted {
                    out.push(std::mem::take(&mut cur));
                    quoted = false;
                }
            }
            None => cur.push(c),
        }
    }
    if !cur.is_empty() || quoted {
        out.push(cur);
    }
    out
}

/// `/bin/bash -lc 'X'` (how Codex runs commands) is `X`.
pub fn unwrap_shell(cmd: &str) -> String {
    let w = words(cmd);
    let base = |s: &str| s.rsplit('/').next().unwrap_or(s).to_string();
    if w.len() >= 3 && matches!(base(&w[0]).as_str(), "bash" | "sh" | "zsh") && matches!(w[1].as_str(), "-c" | "-lc" | "-cl") {
        return w[2].clone();
    }
    cmd.to_string()
}

/// One simple command: its words after env assignments and wrappers, and whether it ran under sudo.
struct Seg {
    words: Vec<String>,
    sudo: bool,
}

fn seg(text: &str) -> Option<Seg> {
    let mut w = words(text);
    let mut sudo = false;
    loop {
        let first = w.first()?;
        let assignment = first.split_once('=').is_some_and(|(k, _)| !k.is_empty() && k.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'));
        if assignment || matches!(first.as_str(), "time" | "nohup" | "env" | "command" | "exec" | "nice") {
            w.remove(0);
        } else if first == "sudo" {
            sudo = true;
            w.remove(0);
        } else {
            break;
        }
    }
    Some(Seg { words: w, sudo })
}

/// Simple commands split on `&&`, `||`, `;`, `|` and newlines, outside quotes.
fn segments(cmd: &str) -> Vec<Seg> {
    let chars: Vec<char> = cmd.chars().collect();
    let (mut parts, mut cur, mut quote, mut i) = (Vec::new(), String::new(), None::<char>, 0);
    while i < chars.len() {
        let c = chars[i];
        match quote {
            Some(q) => {
                if c == q {
                    quote = None;
                }
                cur.push(c);
            }
            None => match c {
                '\'' | '"' => {
                    quote = Some(c);
                    cur.push(c);
                }
                ';' | '\n' | '|' => {
                    parts.push(std::mem::take(&mut cur));
                    if c == '|' && chars.get(i + 1) == Some(&'|') {
                        i += 1;
                    }
                }
                '&' if chars.get(i + 1) == Some(&'&') => {
                    parts.push(std::mem::take(&mut cur));
                    i += 1;
                }
                _ => cur.push(c),
            },
        }
        i += 1;
    }
    parts.push(cur);
    parts.iter().filter_map(|p| seg(p)).collect()
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Kind {
    Other,
    Git,
    Install,
    Build,
    Test,
}

fn tool_kind(name: &str, next: &str) -> Kind {
    match name {
        "vitest" | "jest" | "mocha" | "pytest" | "ctest" => Kind::Test,
        "playwright" if next == "test" => Kind::Test,
        "tsc" | "webpack" | "esbuild" => Kind::Build,
        "vite" if next == "build" => Kind::Build,
        _ => Kind::Other,
    }
}

fn kind(w: &[String]) -> Option<Kind> {
    let a = |i: usize| w.get(i).map(String::as_str).unwrap_or("");
    let first = a(0).rsplit('/').next().unwrap_or("");
    Some(match first {
        "cd" | "pushd" | "popd" => return None,
        "cargo" => match a(1) {
            "test" | "nextest" => Kind::Test,
            "build" | "check" | "clippy" | "doc" => Kind::Build,
            "install" | "add" => Kind::Install,
            _ => Kind::Other,
        },
        "npm" | "pnpm" | "yarn" | "bun" => match a(1) {
            "test" | "t" => Kind::Test,
            "run" if a(2).starts_with("test") || a(2) == "e2e" => Kind::Test,
            "run" if a(2).starts_with("build") => Kind::Build,
            "build" => Kind::Build,
            "install" | "i" | "ci" | "add" => Kind::Install,
            _ => Kind::Other,
        },
        "npx" | "pnpx" | "bunx" => tool_kind(a(1), a(2)),
        "python" | "python3" if a(1) == "-m" && a(2) == "pytest" => Kind::Test,
        "python" | "python3" if a(1) == "-m" && a(2) == "pip" && a(3) == "install" => Kind::Install,
        "go" => match a(1) {
            "test" => Kind::Test,
            "build" | "vet" => Kind::Build,
            "get" | "install" => Kind::Install,
            _ => Kind::Other,
        },
        "make" if w[1..].iter().any(|x| x == "test" || x == "check") => Kind::Test,
        "make" | "cmake" | "ninja" => Kind::Build,
        "mvn" | "gradle" | "./gradlew" | "gradlew" if w[1..].iter().any(|x| x == "test") => Kind::Test,
        "mvn" | "gradle" | "./gradlew" | "gradlew" => Kind::Build,
        "git" => Kind::Git,
        "pip" | "pip3" if a(1) == "install" => Kind::Install,
        "uv" if a(1) == "add" || (a(1) == "pip" && a(2) == "install") => Kind::Install,
        "apt" | "apt-get" | "brew" | "dnf" | "yum" | "pacman" if matches!(a(1), "install" | "-S" | "add") => Kind::Install,
        other => tool_kind(other, a(1)),
    })
}

/// The kind of a shell command: a test run if any part runs tests, else a build, an install, git, or other.
pub fn classify_command(cmd: &str) -> ActionClass {
    let best = segments(&unwrap_shell(cmd)).iter().filter_map(|s| kind(&s.words)).max().unwrap_or(Kind::Other);
    match best {
        Kind::Test => ActionClass::ShellTestRun,
        Kind::Build => ActionClass::ShellBuild,
        Kind::Install => ActionClass::ShellInstall,
        Kind::Git => ActionClass::ShellGit,
        Kind::Other => ActionClass::ShellOther,
    }
}

fn positionals(args: &[String]) -> Vec<&str> {
    args.iter().map(String::as_str).filter(|a| !a.starts_with('-')).collect()
}

fn host_of(url: &str) -> Option<String> {
    let rest = url.split_once("://")?.1;
    let host = rest.split(['/', '?', '#']).next()?;
    let host = host.rsplit('@').next()?;
    Some(host.split(':').next()?.to_string()).filter(|h| !h.is_empty())
}

fn curl_writes(args: &[String]) -> bool {
    let write_method = |m: &str| matches!(m.to_ascii_uppercase().as_str(), "POST" | "PUT" | "PATCH" | "DELETE");
    args.iter().enumerate().any(|(i, a)| match a.as_str() {
        "-X" | "--request" => args.get(i + 1).is_some_and(|m| write_method(m)),
        "-d" | "-F" | "--form" | "-T" | "--upload-file" => true,
        a if a.starts_with("--data") => true,
        a if a.starts_with("-X") && a.len() > 2 => write_method(&a[2..]),
        _ => false,
    })
}

/// Where the command's later parts run, after a `cd` earlier in the same command.
enum Dir {
    /// No `cd` yet: the agent's folder.
    Start,
    /// The folder a `cd` named, as typed (absolute, `~…`, or relative to the agent's folder).
    At(String),
    /// A `cd` to a folder that cannot be read from the words (`cd -`, `cd "$OUT"`, `popd`).
    Unknown,
}

impl Dir {
    /// `path` as seen from the agent's folder, or None when the folder it is in is unknown.
    fn resolve(&self, path: &str) -> Option<String> {
        if path.starts_with('/') || path.starts_with('~') || path.starts_with("$HOME") || path.starts_with("${HOME}") {
            return Some(path.to_string());
        }
        match self {
            Dir::Start => Some(path.to_string()),
            Dir::At(dir) => Some(format!("{}/{path}", dir.trim_end_matches('/'))),
            Dir::Unknown => None,
        }
    }

    fn cd(&self, args: &[String]) -> Dir {
        if args.iter().any(|a| a == "-") {
            return Dir::Unknown;
        }
        match positionals(args).first().copied() {
            None => Dir::At("~".into()),
            Some(to) if to.starts_with('$') && !(to.starts_with("$HOME") || to.starts_with("${HOME}")) => Dir::Unknown,
            Some(to) => self.resolve(to).map(Dir::At).unwrap_or(Dir::Unknown),
        }
    }
}

/// Risks of a shell command, before or after it ran. A `cd` earlier in the same command is followed,
/// so `cd /tmp && rm -rf build` deletes `/tmp/build`; a `cd` the words cannot place flags nothing after it.
pub fn risks(cmd: &str, cwd: Option<&Path>) -> Vec<RiskFlag> {
    let mut out = Vec::new();
    let mut dir = Dir::Start;
    for s in segments(&unwrap_shell(cmd)) {
        if s.sudo {
            out.push(flag("sudo", "ran a command as administrator (sudo)".into()));
        }
        let w = &s.words;
        let Some(first) = w.first().map(|f| f.rsplit('/').next().unwrap_or(f).to_string()) else { continue };
        let args = &w[1..];
        match first.as_str() {
            "cd" | "pushd" => dir = dir.cd(args),
            "popd" => dir = Dir::Unknown,
            "git" if args.first().map(String::as_str) == Some("push") => {
                if args.iter().any(|a| a == "-f" || a.starts_with("--force") || (a.starts_with('+') && a.len() > 1)) {
                    let to = positionals(&args[1..]);
                    let text = if to.is_empty() { "force-pushed to the default remote".to_string() } else { format!("force-pushed to {}", to.join(" ")) };
                    out.push(flag("force-push", text));
                }
            }
            "git" if args.first().map(String::as_str) == Some("reset") && args.iter().any(|a| a == "--hard") => {
                out.push(flag("discard-changes", "discarded uncommitted changes (git reset --hard)".into()));
            }
            "git" if args.first().map(String::as_str) == Some("clean") && args.iter().any(|a| a.starts_with('-') && !a.starts_with("--") && a.contains('f')) => {
                out.push(flag("discard-changes", "deleted untracked files (git clean)".into()));
            }
            "rm" => {
                let recursive = args.iter().any(|a| a == "--recursive" || (a.starts_with('-') && !a.starts_with("--") && (a.contains('r') || a.contains('R'))));
                if recursive {
                    for t in positionals(args).into_iter().filter_map(|t| dir.resolve(t)) {
                        if outside(&t, cwd) {
                            out.push(flag("outside-folder-delete", format!("deleted {t} and everything in it, outside the agent's folder")));
                        }
                    }
                }
            }
            "chmod" if args.iter().any(|a| a == "-R" || a == "--recursive") => {
                let p = positionals(args);
                if let Some((mode, targets)) = p.split_first()
                    && (*mode == "777" || mode.contains("o+w") || mode.contains("a+w") || *mode == "a+rwx")
                {
                    for t in targets {
                        out.push(flag("world-writable", format!("made {t} writable by everyone, recursively")));
                    }
                }
            }
            "curl" if curl_writes(args) => {
                let host = args.iter().find_map(|a| host_of(a)).unwrap_or_else(|| "an unknown host".into());
                out.push(flag("network-write", format!("network write to {host}")));
            }
            "wget" if args.iter().any(|a| a.starts_with("--post") || (a.starts_with("--method=") && !a.ends_with("GET"))) => {
                let host = args.iter().find_map(|a| host_of(a)).unwrap_or_else(|| "an unknown host".into());
                out.push(flag("network-write", format!("network write to {host}")));
            }
            "scp" | "rsync" => {
                if let Some(remote) = positionals(args).into_iter().rev().find(|a| {
                    !a.contains("://") && !a.starts_with('/') && !a.starts_with('.') && a.split_once(':').is_some_and(|(h, _)| !h.is_empty())
                }) {
                    let host = remote.split_once(':').map(|(h, _)| h.rsplit('@').next().unwrap_or(h)).unwrap_or(remote);
                    out.push(flag("network-write", format!("copied files to {host}")));
                }
            }
            _ => {}
        }
    }
    out
}
