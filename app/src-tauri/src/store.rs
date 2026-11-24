//! settings.json in the app's config folder: one file, shared by the window (hover-hide, the Combat switch) and the Combat overlay (its
//! settings, profiles, the Claims reset line). Every change reads the file again and writes it back whole, so no one's keys are lost.
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

static PATH: OnceLock<PathBuf> = OnceLock::new();
static LOCK: Mutex<()> = Mutex::new(());

pub fn init(path: PathBuf) {
    restore(&path);
    let _ = PATH.set(path);
}

/// Where a second copy of the player's own files (settings, Past combats, Past Thargoid) is kept: not the app's data folder and not the install
/// folder, so an uninstall, a repair or an antivirus clean-up that removes those does not take the player's work with it. Local only.
fn backup_dir() -> Option<PathBuf> {
    // Store build: no second copy at all, so an uninstall from the Store removes every file the app made (the data folder goes with the app)
    if cfg!(feature = "store") { return None; }
    let own = crate::devenv::var_os("GRAVITAS_BACKUP_DIR").map(PathBuf::from);
    // (tests and a test setup with a data folder of its own never touch the player's real copy)
    if cfg!(test) || crate::devenv::var_os("GRAVITAS_DATA_DIR").is_some() { return own; }
    own.or_else(|| std::env::var_os("LOCALAPPDATA").map(|l| PathBuf::from(l).join("GRAVITAS-backup")))
}

/// Copies this file to the backup folder (a file with nothing in it is not worth a copy).
pub fn mirror(path: &std::path::Path) {
    let (Some(d), Some(name)) = (backup_dir(), path.file_name()) else { return };
    if std::fs::metadata(path).map(|m| m.len() > 2).unwrap_or(false) {
        let _ = std::fs::create_dir_all(&d);
        let _ = std::fs::copy(path, d.join(name));
    }
}

/// The player emptied a list on purpose: its copy goes too (else the restore below would bring the deleted records back).
pub fn unmirror(path: &std::path::Path) {
    let (Some(d), Some(name)) = (backup_dir(), path.file_name()) else { return };
    let _ = std::fs::remove_file(d.join(name));
}

/// A file that is gone (a new folder after a removal) comes back from its copy.
pub fn restore(path: &std::path::Path) {
    let (Some(d), Some(name)) = (backup_dir(), path.file_name()) else { return };
    let from = d.join(name);
    let have = std::fs::metadata(path).map(|m| m.len() > 60).unwrap_or(false);
    if !have && std::fs::metadata(&from).map(|m| m.len() > 60).unwrap_or(false) {
        if let Some(p) = path.parent() { let _ = std::fs::create_dir_all(p); }
        if std::fs::copy(&from, path).is_ok() {
            log(&format!("restored {} from the backup copy", name.to_string_lossy()));
        }
    }
}

/// The app's settings folder (also where gravitas.log is).
pub fn dir() -> Option<PathBuf> {
    PATH.get().and_then(|p| p.parent().map(|d| d.to_path_buf()))
}

/// One line into gravitas.log (what the tray, the menu and the updates did): to see what happened when something does not work.
pub fn log(msg: &str) {
    use std::io::Write;
    if let Some(d) = dir() {
        let _ = std::fs::create_dir_all(&d);
        // the log never grows for ever: past 1 MB the old one is kept once as gravitas.log.old and a new one starts
        if std::fs::metadata(d.join("gravitas.log")).map(|m| m.len() > 1_000_000).unwrap_or(false) { let _ = std::fs::rename(d.join("gravitas.log"), d.join("gravitas.log.old")); }
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(d.join("gravitas.log")) {
            let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
            let _ = writeln!(f, "{secs} v{} {msg}", env!("CARGO_PKG_VERSION"));
        }
    }
}

/// JSON text with a byte-order mark (Notepad and PowerShell add one) is still JSON.
fn parse(t: &str) -> Option<Value> {
    serde_json::from_str::<Value>(t.trim_start_matches('\u{feff}')).ok()
}

fn file_text(p: &std::path::Path) -> Option<String> {
    std::fs::read(p).ok().map(|b| String::from_utf8_lossy(&b).into_owned())
}

/// The copy of this file in the backup folder, when it is readable JSON.
fn backup_json(path: &std::path::Path) -> Option<Value> {
    let (d, name) = (backup_dir()?, path.file_name()?);
    parse(&file_text(&d.join(name))?)
}

/// A file that is there but cannot be read as JSON (cut off, a different encoding, hand-edited wrongly) is KEPT next to the original as <name>.bad-<time>
/// (the first one only), so nothing the player wrote is ever overwritten without a trace. Returns whether the file was bad.
pub fn quarantine(path: &std::path::Path) -> bool {
    let Some(t) = file_text(path) else { return false };
    if parse(&t).is_some() { return false; }
    let (Some(dir), Some(name)) = (path.parent(), path.file_name().map(|n| n.to_string_lossy().into_owned())) else { return true };
    let have = std::fs::read_dir(dir).map(|d| d.filter_map(|e| e.ok()).any(|e| e.file_name().to_string_lossy().starts_with(&format!("{name}.bad-")))).unwrap_or(false);
    if !have {
        let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        let _ = std::fs::copy(path, dir.join(format!("{name}.bad-{secs}")));
        log(&format!("{name} could not be read: kept as {name}.bad-{secs}, using the backup copy"));
    }
    true
}

/// A file's JSON (an object or a list), for the list files too: the file itself, else (cut off, wrongly edited) its backup copy.
pub fn load_json(path: &std::path::Path) -> Option<Value> {
    match file_text(path) {
        Some(t) => match parse(&t) {
            Some(v) => Some(v),
            None => { quarantine(path); backup_json(path) }
        },
        None => None,
    }
}

pub fn read() -> Value {
    let Some(p) = PATH.get() else { return json!({}) };
    // (writes are atomic, so a half file is not seen; one retry covers a moment when an antivirus holds the file)
    for attempt in 0..2 {
        if let Some(v) = file_text(p).and_then(|t| parse(&t)).filter(|v| v.is_object()) { return v; }
        if attempt == 0 && p.exists() { std::thread::sleep(std::time::Duration::from_millis(15)); }
    }
    if p.exists() { if let Some(v) = backup_json(p).filter(|v| v.is_object()) { return v; } }
    json!({})
}

/// Writes the whole file at once: to a temporary file next to it, then renamed over it. A crash, a kill or a power cut leaves the old file or the new one, never half.
pub fn write_atomic(p: &std::path::Path, text: &str) -> bool {
    let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let tmp = p.with_file_name(format!("{name}.tmp"));
    if std::fs::write(&tmp, text).is_err() { return false; }
    if std::fs::rename(&tmp, p).is_err() { let _ = std::fs::remove_file(&tmp); return false; }
    true
}

/// Sets these keys (each the whole value) and keeps every other.
pub fn set(pairs: &[(&str, Value)]) {
    let Some(p) = PATH.get() else { return };
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(d) = p.parent() {
        let _ = std::fs::create_dir_all(d);
    }
    // a file that cannot be read is kept as .bad-<time> and the backup copy is the base: the player's other settings do not vanish with one new key
    let mut v = if quarantine(p) { backup_json(p).filter(|v| v.is_object()).unwrap_or_else(|| json!({})) } else { read() };
    for (k, x) in pairs {
        v[*k] = x.clone();
    }
    if write_atomic(p, &v.to_string()) { mirror(p); }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_lost_file_comes_back_from_its_copy_and_an_empty_one_is_not_copied() {
        let base = std::env::temp_dir().join("gravitas_store_backup_test");
        let _ = std::fs::remove_dir_all(&base);
        // (one test sets the variable: the other tests only ever see a folder of their own)
        std::env::set_var("GRAVITAS_BACKUP_DIR", base.join("copy"));
        let f = base.join("data").join("settings.json");
        std::fs::create_dir_all(f.parent().unwrap()).unwrap();
        std::fs::write(&f, "{}").unwrap();
        mirror(&f); // two bytes: nothing to keep
        assert!(!base.join("copy").join("settings.json").exists());
        let text = format!("{{\"combat_settings\": {{\"opacity\": 80}}, \"pad\": \"{}\"}}", "x".repeat(80));
        std::fs::write(&f, &text).unwrap();
        mirror(&f);
        std::fs::remove_dir_all(base.join("data")).unwrap(); // the folder is removed (an uninstall, a clean-up)
        restore(&f);
        assert_eq!(std::fs::read_to_string(&f).unwrap(), text, "back as it was");
        std::fs::write(&f, "{\"newer\": 1, \"pad\": \"".to_string() + &"y".repeat(80) + "\"}").unwrap();
        restore(&f); // a file that is there is never overwritten
        assert!(std::fs::read_to_string(&f).unwrap().contains("newer"));
        broken_file_checks();
        std::env::remove_var("GRAVITAS_BACKUP_DIR");
        let _ = std::fs::remove_dir_all(&base);
    }

    /// (called from the test above: the tests share one environment variable for the backup folder, so only one test may set it)
    fn broken_file_checks() {
        let base = std::env::temp_dir().join(format!("gravitas_store_broken_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let f = base.join("data").join("settings.json");
        std::fs::create_dir_all(f.parent().unwrap()).unwrap();
        let good = format!("{{\"hotkeys\": {{\"menu\": \"Ctrl+Alt+Q\"}}, \"pad\": \"{}\"}}", "x".repeat(80));
        std::fs::write(&f, &good).unwrap();
        mirror(&f);
        // a BOM in front is still JSON
        std::fs::write(&f, format!("\u{feff}{good}")).unwrap();
        assert!(parse(&file_text(&f).unwrap()).is_some());
        assert!(!quarantine(&f));
        // a cut-off file: kept as .bad, and the backup is where the next write starts
        std::fs::write(&f, &good[..good.len() / 2]).unwrap();
        assert!(quarantine(&f));
        assert!(std::fs::read_dir(f.parent().unwrap()).unwrap().any(|e| e.unwrap().file_name().to_string_lossy().starts_with("settings.json.bad-")));
        assert_eq!(backup_json(&f).unwrap()["hotkeys"]["menu"], "Ctrl+Alt+Q");
        // an atomic write leaves no temporary file
        assert!(write_atomic(&f, "{\"a\":1}"));
        assert_eq!(std::fs::read_to_string(&f).unwrap(), "{\"a\":1}");
        assert!(!f.with_file_name("settings.json.tmp").exists());
        let _ = std::fs::remove_dir_all(&base);
    }
}
