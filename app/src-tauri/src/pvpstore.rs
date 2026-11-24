//! PVP mode's files: XXX_vs_YYY_fight_N.gravitas in the app's own folder (pvp\). One file for each fight; N counts the fights against that
//! commander. The files are plain JSON you can open in any editor. They are yours: the app writes them and reads them, never sends them.
use crate::pvpsync::short;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

const MAX_BYTES: u64 = 4_000_000;
const KEEP_LISTED: usize = 200;

pub fn dir() -> Option<PathBuf> {
    crate::store::dir().map(|d| d.join("pvp"))
}

/// A name that Windows accepts as part of a file name: the signs it forbids and control characters become "_", no dot or space at the end.
pub fn safe(name: &str) -> String {
    let s: String = name.chars().map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { '_' } else { c }).collect();
    let s = s.trim().trim_end_matches(['.', ' ']).to_string();
    if s.is_empty() { "_".into() } else { s.chars().take(60).collect() }
}

pub fn prefix(me: &str, opp: &str) -> String {
    format!("{}_vs_{}_fight_", safe(me), safe(opp))
}

/// The next free fight number against this commander in this folder.
pub fn next_no(dir: &Path, me: &str, opp: &str) -> u32 {
    let pre = prefix(me, opp);
    let mut top = 0u32;
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten() {
            let n = e.file_name().to_string_lossy().into_owned();
            if let Some(rest) = n.strip_prefix(&pre).and_then(|r| r.strip_suffix(".gravitas")) {
                if let Ok(k) = rest.parse::<u32>() { top = top.max(k); }
            }
        }
    }
    top + 1
}

/// Makes the file (its number is set here) and returns its name.
pub fn save_in(dir: &Path, file: &mut Value) -> Result<String, String> {
    let (me, opp) = (file["me"].as_str().unwrap_or("").to_string(), file["opponent"]["name"].as_str().unwrap_or("").to_string());
    if me.is_empty() || opp.is_empty() { return Err("no names".into()); }
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let n = next_no(dir, &me, &opp);
    file["no"] = json!(n);
    let name = format!("{}{}.gravitas", prefix(&me, &opp), n);
    let tmp = dir.join(format!("{name}.tmp"));
    std::fs::write(&tmp, serde_json::to_string_pretty(file).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, dir.join(&name)).map_err(|e| e.to_string())?;
    Ok(name)
}

pub fn save(file: &mut Value) -> Result<String, String> {
    let d = dir().ok_or("no folder")?;
    save_in(&d, file)
}

/// Is this what a PVP file must be? (A file that came from somewhere else is data: only this shape is read.)
pub fn valid(v: &Value) -> bool {
    v.get("gravitas").and_then(Value::as_i64) == Some(1)
        && v.get("kind").and_then(Value::as_str) == Some("pvp-fight")
        && v["me"].is_string() && v["opponent"]["name"].is_string()
        && v["rec"].get("dbv").is_some() && v["rec"]["ep"]["t0"].is_number()
}

fn read_path(p: &Path) -> Option<Value> {
    if std::fs::metadata(p).ok()?.len() > MAX_BYTES { return None; }
    let v: Value = serde_json::from_str(&std::fs::read_to_string(p).ok()?).ok()?;
    if valid(&v) { Some(v) } else { None }
}

/// One file's text by its name (never a path), only when it is a real PVP file: the page hands it back to pair it with another.
pub fn text_in(dir: &Path, name: &str) -> Option<String> {
    read_in(dir, name)?;
    std::fs::read_to_string(dir.join(name)).ok()
}

pub fn text(name: &str) -> Option<String> {
    text_in(&dir()?, name)
}

/// One file by its name (never a path).
pub fn read_in(dir: &Path, name: &str) -> Option<Value> {
    if name.contains(['/', '\\', ':']) || !name.ends_with(".gravitas") { return None; }
    read_path(&dir.join(name))
}

pub fn read(name: &str) -> Option<Value> {
    read_in(&dir()?, name)
}

/// The files kept, newest fight first: name, number, commander, result, length, ship.
/// files looked at in one listing
const MAX_READ: usize = 200;

pub fn list_in(dir: &Path) -> Vec<Value> {
    let mut out: Vec<(f64, Value)> = Vec::new();
    if let Ok(rd) = std::fs::read_dir(dir) {
        // at most 200 files are looked at (a folder with thousands of files cannot stall the page)
        for e in rd.flatten().take(MAX_READ) {
            let name = e.file_name().to_string_lossy().into_owned();
            if !name.ends_with(".gravitas") { continue; }
            let Some(v) = read_path(&e.path()) else { continue };
            let t0 = v["t0"].as_f64().unwrap_or(0.0);
            out.push((t0, json!({"name": name, "t0": t0, "no": v["no"], "opp": short(&v["opponent"]["name"]), "result": short(&v["result"]), "len": v["rec"]["len"], "ship": short(&v["rec"]["ship"])})));
        }
    }
    out.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    out.into_iter().take(KEEP_LISTED).map(|x| x.1).collect()
}

pub fn list() -> Vec<Value> {
    dir().map(|d| list_in(&d)).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("gravitas-pvp-test-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        d
    }
    fn file(me: &str, opp: &str) -> Value {
        json!({"gravitas": 1, "kind": "pvp-fight", "me": me, "opponent": {"name": opp}, "no": 0, "result": "lost", "t0": 1000.0,
               "rec": {"dbv": 1, "ep": {"t0": 1000.0, "t1": 61000.0}, "len": 60.0, "ship": "Krait Mk II"}})
    }

    #[test]
    fn names_are_safe_and_numbers_count_the_fights_against_one_commander() {
        assert_eq!(safe("Foo/Bar:Baz?"), "Foo_Bar_Baz_");
        assert_eq!(safe("name. "), "name");
        assert_eq!(safe(""), "_");
        let d = tmp("n");
        for want in 1..=3u32 {
            let mut f = file("Hongark", "Friend");
            let name = save_in(&d, &mut f).unwrap();
            assert_eq!(name, format!("Hongark_vs_Friend_fight_{want}.gravitas"));
            assert_eq!(f["no"], json!(want));
        }
        // another commander has its own count
        let mut g = file("Hongark", "Other");
        assert_eq!(save_in(&d, &mut g).unwrap(), "Hongark_vs_Other_fight_1.gravitas");
        assert_eq!(list_in(&d).len(), 4);
        // no leftover temporary file
        assert!(std::fs::read_dir(&d).unwrap().flatten().all(|e| !e.file_name().to_string_lossy().ends_with(".tmp")));
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn only_a_real_pvp_file_is_read_and_never_by_a_path() {
        let d = tmp("r");
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join("a.gravitas"), "not json").unwrap();
        std::fs::write(d.join("b.gravitas"), json!({"gravitas": 1, "kind": "other"}).to_string()).unwrap();
        std::fs::write(d.join("c.gravitas"), json!({"gravitas": 2, "kind": "pvp-fight", "me": "a", "opponent": {"name": "b"}, "rec": {"dbv": 1, "ep": {"t0": 1}}}).to_string()).unwrap();
        let mut ok = file("Me", "You");
        let name = save_in(&d, &mut ok).unwrap();
        assert_eq!(list_in(&d).len(), 1, "only the real one is listed");
        assert!(read_in(&d, &name).is_some());
        assert!(read_in(&d, "a.gravitas").is_none() && read_in(&d, "b.gravitas").is_none() && read_in(&d, "c.gravitas").is_none());
        assert!(read_in(&d, "../a.gravitas").is_none() && read_in(&d, "..\\a.gravitas").is_none() && read_in(&d, "x.txt").is_none());
        // too big
        let big = "x".repeat((MAX_BYTES + 1) as usize);
        std::fs::write(d.join("big.gravitas"), big).unwrap();
        assert!(read_in(&d, "big.gravitas").is_none());
        let _ = std::fs::remove_dir_all(&d);
    }
}
