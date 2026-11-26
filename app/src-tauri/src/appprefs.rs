//! Settings page extras: start with Windows, tray behaviour, export and import of the settings file, and where the app keeps its data.
//! Everything here is something the player switches on or presses; nothing runs in the background.
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

/// Keys that never leave this PC in an export and are never taken from an import (they belong to this PC or hold a secret).
const PRIVATE_KEYS: &[&str] = &["pairing", "seen_version", "claims_base", "claims_base_stack", "update_floor"];
/// An imported file may not be bigger than this
const MAX_IMPORT: usize = 2 * 1024 * 1024;

// ---------------------------------------------------------------- tray behaviour (settings keys, default ON)

fn flag(key: &str) -> bool {
    crate::store::read().get(key).and_then(Value::as_bool).unwrap_or(true)
}
/// The minimise button takes the window to the tray (otherwise it minimises to the taskbar as every program does).
pub fn minimize_to_tray() -> bool { flag("minimize_to_tray") }
/// The close button takes the window to the tray and the app keeps running (otherwise it quits the app).
pub fn close_to_tray() -> bool { flag("close_to_tray") }

// ---------------------------------------------------------------- start with Windows

const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const RUN_NAME: &str = "GRAVITAS";

fn wide(s: &str) -> Vec<u16> { s.encode_utf16().chain(std::iter::once(0)).collect() }

/// The Run entry's text for this exe: the full quoted path and the flag that keeps the window hidden at start (it starts in the tray).
pub fn run_value(exe: &Path) -> String { format!("\"{}\" --minimized", exe.display()) }

/// Is the entry there and does it point at THIS exe?
pub fn autostart_on() -> bool {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_SZ};
    let (key, name) = (wide(RUN_KEY), wide(RUN_NAME));
    let mut buf = vec![0u16; 1024];
    let mut len = (buf.len() * 2) as u32;
    let ok = unsafe { RegGetValueW(HKEY_CURRENT_USER, PCWSTR(key.as_ptr()), PCWSTR(name.as_ptr()), RRF_RT_REG_SZ, None, Some(buf.as_mut_ptr() as *mut _), Some(&mut len)) };
    if ok.0 != 0 { return false; }
    let text = String::from_utf16_lossy(&buf[..(len as usize / 2).saturating_sub(1).min(buf.len())]);
    std::env::current_exe().map(|e| text == run_value(&e)).unwrap_or(false)
}

/// Switches it on or off for the current user only (HKCU, no administrator rights). Returns whether the state is now the wanted one.
pub fn autostart_set(on: bool) -> bool {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{RegDeleteKeyValueW, RegSetKeyValueW, HKEY_CURRENT_USER, REG_SZ};
    let (key, name) = (wide(RUN_KEY), wide(RUN_NAME));
    if on {
        let Ok(exe) = std::env::current_exe() else { return false };
        let v = wide(&run_value(&exe));
        let r = unsafe { RegSetKeyValueW(HKEY_CURRENT_USER, PCWSTR(key.as_ptr()), PCWSTR(name.as_ptr()), REG_SZ.0, Some(v.as_ptr() as *const _), (v.len() * 2) as u32) };
        if r.0 != 0 { return false; }
    } else {
        let _ = unsafe { RegDeleteKeyValueW(HKEY_CURRENT_USER, PCWSTR(key.as_ptr()), PCWSTR(name.as_ptr())) };
    }
    autostart_on() == on
}

/// Started by Windows at sign-in (the flag the Run entry carries): the window stays in the tray.
pub fn started_hidden() -> bool { std::env::args().any(|a| a == "--minimized") }

// ---------------------------------------------------------------- export and import of the settings file

/// The settings as text for a file: everything in settings.json except this PC's private keys.
pub fn export_text(all: &Value) -> String {
    let mut out = serde_json::Map::new();
    out.insert("gravitas_settings".into(), json!(1));
    if let Some(o) = all.as_object() {
        for (k, v) in o { if !PRIVATE_KEYS.contains(&k.as_str()) { out.insert(k.clone(), v.clone()); } }
    }
    serde_json::to_string_pretty(&Value::Object(out)).unwrap_or_default() + "\n"
}

/// What an import will set: the keys of a settings file made by `export_text`, without the private ones. Err = a short reason.
pub fn import_pairs(text: &str) -> Result<Vec<(String, Value)>, String> {
    if text.len() > MAX_IMPORT { return Err("too big".into()); }
    let v: Value = serde_json::from_str(text.trim_start_matches('\u{feff}')).map_err(|_| "not a settings file".to_string())?;
    let o = v.as_object().ok_or("not a settings file")?;
    if o.get("gravitas_settings").and_then(Value::as_i64) != Some(1) { return Err("not a settings file".into()); }
    Ok(o.iter().filter(|(k, _)| k.as_str() != "gravitas_settings" && !PRIVATE_KEYS.contains(&k.as_str())).map(|(k, v)| (k.clone(), v.clone())).collect())
}

fn documents() -> Option<PathBuf> {
    known_folders::get_known_folder_path(known_folders::KnownFolder::Documents)
}

fn explorer() -> PathBuf {
    let sys = std::env::var_os("SystemRoot").filter(|s| !s.is_empty()).map(PathBuf::from).unwrap_or_else(|| PathBuf::from(r"C:\Windows"));
    sys.join("explorer.exe")
}

/// Writes GRAVITAS-settings-<date>.json into the Documents folder and shows it in Explorer. Returns the file's full path.
pub fn export_file() -> Result<String, String> {
    let dir = documents().ok_or("no Documents folder")?;
    let stamp = {
        // (a plain UTC date from the clock, no extra crate)
        let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) as i64;
        let (y, m, d) = civil(secs.div_euclid(86400));
        format!("{y:04}-{m:02}-{d:02}")
    };
    let mut path = dir.join(format!("GRAVITAS-settings-{stamp}.json"));
    let mut n = 2;
    while path.exists() { path = dir.join(format!("GRAVITAS-settings-{stamp}-{n}.json")); n += 1; }
    if !crate::store::write_atomic(&path, &export_text(&crate::store::read())) { return Err("could not write the file".into()); }
    let _ = std::process::Command::new(explorer()).arg(format!("/select,{}", path.display())).spawn();
    Ok(path.display().to_string())
}

/// Writes a text file the player asked for (kind "bgs" = the BGS CSV) into the Documents folder as GRAVITAS-<kind>-<date>.csv and shows it in Explorer.
/// The name is made here, never taken from the page. Returns the full path.
pub fn save_text_file(kind: &str, text: &str) -> Result<String, String> {
    if kind != "bgs" { return Err("unknown file kind".into()); }
    if text.len() > 20_000_000 { return Err("the file is too big".into()); }
    let dir = documents().ok_or("no Documents folder")?;
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) as i64;
    let (y, m, d) = civil(secs.div_euclid(86400));
    let stamp = format!("{y:04}-{m:02}-{d:02}");
    let mut path = dir.join(format!("GRAVITAS-{kind}-{stamp}.csv"));
    let mut n = 2;
    while path.exists() { path = dir.join(format!("GRAVITAS-{kind}-{stamp}-{n}.csv")); n += 1; }
    if !crate::store::write_atomic(&path, text) { return Err("could not write the file".into()); }
    let _ = std::process::Command::new(explorer()).arg(format!("/select,{}", path.display())).spawn();
    Ok(path.display().to_string())
}

/// Days since 1970-01-01 to (year, month, day), proleptic Gregorian (Howard Hinnant's algorithm)
fn civil(z: i64) -> (i64, u32, u32) {
    let z = z + 719468;
    let era = z.div_euclid(146097);
    let doe = z.rem_euclid(146097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (yoe + era * 400 + if m <= 2 { 1 } else { 0 }, m, d)
}

/// Takes a settings file's text. The settings now in use are first copied next to them as settings.json.before-import. The keys are applied by the
/// shared store; the app reads most of them again at its next start. Returns how many keys were taken.
pub fn import_text(text: &str) -> Result<usize, String> {
    let pairs = import_pairs(text)?;
    if pairs.is_empty() { return Err("empty".into()); }
    if let Some(d) = crate::store::dir() {
        let cur = d.join("settings.json");
        if cur.is_file() { let _ = std::fs::copy(&cur, d.join("settings.json.before-import")); }
    }
    let refs: Vec<(&str, Value)> = pairs.iter().map(|(k, v)| (k.as_str(), v.clone())).collect();
    crate::store::set(&refs);
    Ok(pairs.len())
}

// ---------------------------------------------------------------- where the data is

/// The folders the app uses, as full paths for the Settings page: {"data", "backup", "journal"} (a missing one is null).
pub fn folders() -> Value {
    let data = crate::store::dir().map(|p| p.display().to_string());
    let backup = if cfg!(feature = "store") { None } else { std::env::var_os("LOCALAPPDATA").map(|l| PathBuf::from(l).join("GRAVITAS-backup").display().to_string()) };
    let journal = crate::journal::saved_games().map(|p| p.display().to_string());
    json!({ "data": data, "backup": backup, "journal": journal })
}

/// Opens one of those folders in Explorer (by its full path, never by a name). `which` = data, backup or journal.
pub fn open_folder(which: &str) -> bool {
    let f = folders();
    let Some(p) = f.get(which).and_then(Value::as_str) else { return false };
    let p = PathBuf::from(p);
    if !p.is_dir() { return false; }
    std::process::Command::new(explorer()).arg(&p).spawn().is_ok()
}

// ---------------------------------------------------------------- colour theme of the app window and the menu (settings key "theme")

const THEMES: &[&str] = &["gravitas", "game", "cold", "green", "red", "graphite", "custom"];

/// A theme from the pages or from an imported file, or None when it is not one: {"id": name} and, for "custom", {"c": "#rrggbb"}.
pub fn theme_clean(v: &Value) -> Option<Value> {
    let id = v.get("id")?.as_str()?;
    if !THEMES.contains(&id) { return None; }
    if id == "custom" {
        let c = v.get("c")?.as_str()?;
        let ok = c.len() == 7 && c.starts_with('#') && c[1..].chars().all(|ch| ch.is_ascii_hexdigit());
        return if ok { Some(json!({ "id": "custom", "c": c.to_ascii_lowercase() })) } else { None };
    }
    Some(json!({ "id": id }))
}

/// The saved theme (Null = the default one).
pub fn theme_get() -> Value {
    crate::store::read().get("theme").and_then(theme_clean).unwrap_or(Value::Null)
}

/// Keeps the theme. Returns whether it was valid and written.
pub fn theme_set(v: &Value) -> bool {
    match theme_clean(v) { Some(t) => crate::store::set(&[("theme", t)]), None => false }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_export_leaves_out_the_private_keys_and_an_import_takes_the_rest() {
        let all = json!({ "lang": "de", "pairing": { "room": "r", "hk": "SECRET" }, "seen_version": "0.9.31", "claims_base": "x", "combat_settings": { "a": 1 } });
        let t = export_text(&all);
        assert!(!t.contains("SECRET") && !t.contains("seen_version") && !t.contains("claims_base"));
        let p = import_pairs(&t).unwrap();
        let keys: Vec<&str> = p.iter().map(|x| x.0.as_str()).collect();
        assert_eq!(keys, vec!["lang", "combat_settings"]);
    }

    #[test]
    fn an_import_refuses_what_is_not_a_settings_file_and_never_takes_private_keys() {
        assert!(import_pairs("not json").is_err());
        assert!(import_pairs("{\"lang\":\"de\"}").is_err()); // no marker
        assert!(import_pairs("[1]").is_err());
        let t = "{\"gravitas_settings\":1,\"pairing\":{\"hk\":\"X\"},\"update_floor\":\"9\",\"lang\":\"fr\"}";
        let p = import_pairs(t).unwrap();
        assert_eq!(p.len(), 1);
        assert_eq!(p[0].0, "lang");
        assert!(import_pairs(&format!("{{\"gravitas_settings\":1,\"x\":\"{}\"}}", "a".repeat(MAX_IMPORT))).is_err());
    }

    #[test]
    fn the_run_entry_quotes_the_path_and_starts_hidden() {
        assert_eq!(run_value(Path::new(r"C:\Users\A B\GRAVITAS\gravitas.exe")), "\"C:\\Users\\A B\\GRAVITAS\\gravitas.exe\" --minimized");
    }

    #[test]
    fn the_date_of_a_day_count_is_right() {
        assert_eq!(civil(0), (1970, 1, 1));
        assert_eq!(civil(20_453), (2025, 12, 31));
        assert_eq!(civil(20_454), (2026, 1, 1));
    }

    #[test]
    fn the_theme_is_checked() {
        assert_eq!(theme_clean(&json!({"id":"game"})), Some(json!({"id":"game"})));
        assert_eq!(theme_clean(&json!({"id":"custom","c":"#FFAA00"})), Some(json!({"id":"custom","c":"#ffaa00"})));
        assert_eq!(theme_clean(&json!({"id":"custom","c":"red"})), None);
        assert_eq!(theme_clean(&json!({"id":"custom"})), None);
        assert_eq!(theme_clean(&json!({"id":"<script>"})), None);
        assert_eq!(theme_clean(&json!("game")), None);
    }
}
