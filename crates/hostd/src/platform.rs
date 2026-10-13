//! What differs between the runner's systems (Linux, macOS, Windows): the home folder and finding a CLI.
use std::path::PathBuf;

/// This user's home folder (`HOME` on Unix, the profile folder on Windows).
pub fn home() -> Option<PathBuf> {
    std::env::home_dir().filter(|h| !h.as_os_str().is_empty())
}

/// The program to run for a CLI such as `claude`: its full path when it is on PATH or where its installers
/// put it, else the bare name. On Windows this also finds `claude.cmd` / `codex.cmd` (npm's launchers)
/// through PATHEXT, which a bare name would miss. A login service may start with a PATH that lacks the
/// user's own folders (installed after logging in, or set only in a shell profile), hence the known places.
pub fn program(name: &str) -> PathBuf {
    program_in(name, std::env::var_os("PATH").as_deref(), home().as_deref(), std::env::var_os("APPDATA").map(PathBuf::from).as_deref())
}

/// `program` with the home and (Windows) roaming app-data folders given.
pub fn program_in(name: &str, path: Option<&std::ffi::OsStr>, home: Option<&std::path::Path>, appdata: Option<&std::path::Path>) -> PathBuf {
    if let Some(found) = path.and_then(|p| find_in(name, p)) {
        return found;
    }
    let mut places: Vec<PathBuf> = Vec::new();
    if let Some(h) = home {
        if cfg!(windows) {
            places.push(h.join(".local").join("bin").join(format!("{name}.exe")));
        } else {
            for dir in [".local/bin", ".npm-global/bin", ".bun/bin", ".volta/bin"] {
                places.push(h.join(dir).join(name));
            }
        }
    }
    if cfg!(windows) {
        if let Some(a) = appdata {
            places.push(a.join("npm").join(format!("{name}.cmd")));
        }
    } else {
        places.extend(["/opt/homebrew/bin", "/usr/local/bin"].iter().map(|d| PathBuf::from(d).join(name)));
    }
    places.into_iter().find(|p| p.is_file()).unwrap_or_else(|| PathBuf::from(name))
}

/// `name` on PATH, as a full path (Windows: with an extension from PATHEXT, `.exe` and `.cmd` first).
pub fn find_on_path(name: &str) -> Option<PathBuf> {
    find_in(name, &std::env::var_os("PATH")?)
}

fn find_in(name: &str, path: &std::ffi::OsStr) -> Option<PathBuf> {
    let exts: Vec<String> = if cfg!(windows) {
        let pathext = std::env::var("PATHEXT").unwrap_or_else(|_| ".EXE;.CMD;.BAT".into());
        pathext.split(';').filter(|e| !e.is_empty()).map(|e| e.to_ascii_lowercase()).collect()
    } else {
        vec![String::new()]
    };
    std::env::split_paths(path).find_map(|dir| exts.iter().map(|e| dir.join(format!("{name}{e}"))).find(|f| f.is_file()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_cli_off_the_path_is_found_where_its_installer_puts_it() {
        let home = tempfile::tempdir().unwrap();
        let bin = home.path().join(".local").join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        let file = if cfg!(windows) { "claude.exe" } else { "claude" };
        std::fs::write(bin.join(file), b"").unwrap();
        assert_eq!(program_in("claude", None, Some(home.path()), None), bin.join(file), "not on PATH: the native installer's folder");
        assert_eq!(program_in("codex", None, Some(home.path()), None), PathBuf::from("codex"), "nowhere: the bare name, so the error names it");
    }

    #[test]
    fn windows_long_paths_read_as_people_write_them() {
        assert_eq!(localops::folders::plain(PathBuf::from(r"\\?\C:\Users\Quickemu")), PathBuf::from(r"C:\Users\Quickemu"));
        assert_eq!(localops::folders::plain(PathBuf::from(r"\\?\UNC\server\share")), PathBuf::from(r"\\?\UNC\server\share"), "network shares keep their form");
        assert_eq!(localops::folders::plain(PathBuf::from("/home/a")), PathBuf::from("/home/a"));
    }
}
