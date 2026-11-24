//! Visits: the systems you jumped to (or started the game in), newest first, read from the Journal files on this PC when the page asks.
//! Nothing is stored or sent: it is read again each time, so there is no second copy of your Journal anywhere.
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};

/// at most this many visits are returned
const LIMIT: usize = 200;
/// at most this many Journal files are looked at (newest first)
const FILES: usize = 60;

/// The Journal files, newest first (new names carry the date, so the name sorts by time).
fn files(dir: &Path) -> Vec<PathBuf> {
    let mut v: Vec<(String, PathBuf)> = fs::read_dir(dir)
        .map(|d| d.filter_map(|e| e.ok()).filter_map(|e| {
            let n = e.file_name().to_string_lossy().into_owned();
            (n.starts_with("Journal.") && n.ends_with(".log")).then(|| (n, e.path()))
        }).collect())
        .unwrap_or_default();
    v.sort_by(|a, b| b.0.cmp(&a.0));
    v.into_iter().map(|x| x.1).take(FILES).collect()
}

/// The visits of one Journal's text, oldest first: (time, system, how). A line that is not a jump or a start is skipped without being parsed.
fn visits_of(text: &str) -> Vec<(String, String, &'static str)> {
    let mut out = Vec::new();
    for l in text.lines() {
        let how = if l.contains("\"event\":\"FSDJump\"") { "jump" } else if l.contains("\"event\":\"CarrierJump\"") { "carrier" } else if l.contains("\"event\":\"Location\"") { "start" } else { continue };
        let Ok(j) = serde_json::from_str::<Value>(l) else { continue };
        let (Some(sys), Some(t)) = (j.get("StarSystem").and_then(Value::as_str), j.get("timestamp").and_then(Value::as_str)) else { continue };
        if sys.is_empty() { continue; }
        out.push((t.to_string(), sys.to_string(), how));
    }
    out
}

/// Newest first, a system you were in already is not listed again right after itself (the game writes a Location line at every start).
pub fn list_in(dir: &Path) -> Vec<Value> {
    let mut all: Vec<(String, String, &'static str)> = Vec::new();
    for p in files(dir) {
        if crate::journal::too_big(&p) { continue; }
        let Ok(b) = fs::read(&p) else { continue };
        let mut v = visits_of(&String::from_utf8_lossy(&b));
        v.append(&mut all);
        all = v; // (older file first)
        if all.len() >= LIMIT * 2 { break; }
    }
    let mut out: Vec<Value> = Vec::new();
    let mut prev: Option<&str> = None;
    for (t, s, how) in all.iter() {
        if prev == Some(s.as_str()) { continue; }
        prev = Some(s.as_str());
        out.push(json!({"time": t, "system": s, "how": how}));
    }
    out.reverse();
    out.truncate(LIMIT);
    out
}

pub fn list() -> Vec<Value> {
    crate::journal::saved_games().map(|d| list_in(&d)).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn visits_come_newest_first_and_a_restart_in_the_same_system_is_one_visit() {
        let dir = std::env::temp_dir().join(format!("gravitas-visits-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("Journal.2026-11-23T100000.01.log"),
            "{ \"timestamp\":\"2026-11-23T10:00:00Z\", \"event\":\"Location\", \"StarSystem\":\"Sol\" }\n\
             { \"timestamp\":\"2026-11-23T10:05:00Z\", \"event\":\"FSDJump\", \"StarSystem\":\"Alpha Centauri\" }\n\
             { \"timestamp\":\"2026-11-23T10:06:00Z\", \"event\":\"Commander\", \"Name\":\"X\" }\n").unwrap();
        fs::write(dir.join("Journal.2026-11-24T120000.01.log"),
            "{ \"timestamp\":\"2026-11-24T12:00:00Z\", \"event\":\"Location\", \"StarSystem\":\"Alpha Centauri\" }\n\
             { \"timestamp\":\"2026-11-24T12:10:00Z\", \"event\":\"CarrierJump\", \"StarSystem\":\"Asterope\" }\n\
             not json but FSDJump\n").unwrap();
        let v = list_in(&dir);
        let names: Vec<&str> = v.iter().map(|x| x["system"].as_str().unwrap()).collect();
        assert_eq!(names, vec!["Asterope", "Alpha Centauri", "Sol"]);
        assert_eq!(v[0]["how"], "carrier");
        assert_eq!(v[1]["time"], "2026-11-23T10:05:00Z"); // the first time you were there, not the restart
        let _ = fs::remove_dir_all(&dir);
    }

    /// Burak's own Journal folder (cargo test visits -- --ignored --nocapture)
    #[test]
    #[ignore]
    fn the_real_folder() {
        let t = std::time::Instant::now();
        let v = list();
        println!("{} visits in {} ms", v.len(), t.elapsed().as_millis());
        for x in v.iter().take(6) { println!("{} {} {}", x["time"], x["system"], x["how"]); }
        assert!(!v.is_empty());
    }

    #[test]
    fn the_list_is_never_longer_than_the_limit() {
        let mut text = String::new();
        for i in 0..500 { text.push_str(&format!("{{ \"timestamp\":\"2026-11-24T12:00:00Z\", \"event\":\"FSDJump\", \"StarSystem\":\"S{i}\" }}\n")); }
        assert_eq!(visits_of(&text).len(), 500);
        let dir = std::env::temp_dir().join(format!("gravitas-visits2-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("Journal.2026-11-24T120000.01.log"), text).unwrap();
        let v = list_in(&dir);
        assert_eq!(v.len(), LIMIT);
        assert_eq!(v[0]["system"], "S499");
        let _ = fs::remove_dir_all(&dir);
    }
}
