//! What differs between the runner's systems (Linux, macOS, Windows): the home folder and finding a CLI.
use std::path::PathBuf;

/// This user's home folder (`HOME` on Unix, the profile folder on Windows).
pub fn home() -> Option<PathBuf> {
    std::env::home_dir().filter(|h| !h.as_os_str().is_empty())
}

/// The program to run for a CLI such as `claude`: its full path when it is on PATH, else the bare name.
/// On Windows this also finds `claude.cmd` / `codex.cmd` (npm's launchers) through PATHEXT, which a bare
/// name would miss.
pub fn program(name: &str) -> PathBuf {
    find_on_path(name).unwrap_or_else(|| PathBuf::from(name))
}

/// `name` on PATH, as a full path (Windows: with an extension from PATHEXT, `.exe` and `.cmd` first).
pub fn find_on_path(name: &str) -> Option<PathBuf> {
    let exts: Vec<String> = if cfg!(windows) {
        let pathext = std::env::var("PATHEXT").unwrap_or_else(|_| ".EXE;.CMD;.BAT".into());
        pathext.split(';').filter(|e| !e.is_empty()).map(|e| e.to_ascii_lowercase()).collect()
    } else {
        vec![String::new()]
    };
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path).find_map(|dir| exts.iter().map(|e| dir.join(format!("{name}{e}"))).find(|f| f.is_file()))
}
