//! BGS Watch, the list of the squadron faction's system NAMES (bgs_names.json in the app's data folder). The names come from the player (typed or
//! pasted), from the first snapshot the player confirmed, or from a CSV the player exported in their own browser (the EXPORT button of the Inara
//! faction presence page) and loads here. Only the "Star system" column of that CSV is taken: every other column is dropped at once and never
//! stored, logged or returned. BGS Watch makes no network call.
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct NamesFile {
    pub v: u32,
    /// "csv", "paste" or "snapshot"
    pub source: String,
    pub inara_id: String,
    pub updated_utc: String,
    pub names: Vec<String>,
}

pub const MAX_NAMES: usize = 500;

pub fn file(dir: &Path) -> PathBuf { dir.join("bgs_names.json") }

pub fn load(dir: &Path) -> NamesFile {
    crate::store::load_json(&file(dir)).and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default()
}

pub fn save(dir: &Path, n: &NamesFile) -> bool {
    let _ = std::fs::create_dir_all(dir);
    let p = file(dir);
    let ok = serde_json::to_string(n).map(|t| crate::store::write_atomic(&p, &t)).unwrap_or(false);
    if ok { crate::store::mirror(&p); }
    ok
}

pub fn forget(dir: &Path) {
    let p = file(dir);
    let _ = std::fs::remove_file(&p);
    crate::store::unmirror(&p);
    // the copies kept of an unreadable names file (bgs_names.json.bad-<time>)
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.filter_map(|e| e.ok()) {
            let n = e.file_name().to_string_lossy().into_owned();
            if n.starts_with("bgs_names.json.") { let _ = std::fs::remove_file(e.path()); }
        }
    }
}

/// a system name: letters, digits, space, hyphen, apostrophe, period (and + / parentheses), 2 to 64 characters
pub fn valid(s: &str) -> bool {
    let n = s.chars().count();
    (2..=64).contains(&n) && s.chars().all(|c| c.is_alphanumeric() || " -'.+/()".contains(c)) && s.chars().any(|c| c.is_alphanumeric())
}

/// trimmed, single spaces, no duplicates (compared in upper case), invalid lines are returned separately
pub fn clean(list: &[String]) -> Result<(Vec<String>, Vec<String>), String> {
    let mut out: Vec<String> = Vec::new();
    let mut bad = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for l in list {
        let t = l.split_whitespace().collect::<Vec<_>>().join(" ");
        if t.is_empty() { continue; }
        if !valid(&t) { bad.push(t); continue; }
        if seen.insert(t.to_uppercase()) { out.push(t); }
    }
    if out.len() > MAX_NAMES { return Err(format!("more than {MAX_NAMES} names")); }
    Ok((out, bad))
}


/// CSV text to rows of fields: a byte-order mark, CRLF or LF, quoted fields with commas, line breaks and doubled quotes
pub fn csv_rows(text: &str) -> Vec<Vec<String>> {
    let t = text.trim_start_matches('\u{feff}');
    let (mut rows, mut row, mut f) = (Vec::new(), Vec::new(), String::new());
    let (mut q, mut was_q) = (false, false);
    let mut it = t.chars().peekable();
    while let Some(c) = it.next() {
        if q {
            if c == '"' {
                if it.peek() == Some(&'"') { f.push('"'); it.next(); } else { q = false; }
            } else { f.push(c); }
            continue;
        }
        match c {
            '"' => { q = true; was_q = true; }
            ',' => { row.push(std::mem::take(&mut f)); was_q = false; }
            '\r' => {}
            '\n' => {
                if !row.is_empty() || !f.is_empty() || was_q { row.push(std::mem::take(&mut f)); rows.push(std::mem::take(&mut row)); }
                was_q = false;
            }
            _ => f.push(c),
        }
        if rows.len() > 5000 { break; }
    }
    if !row.is_empty() || !f.is_empty() || was_q { row.push(f); rows.push(row); }
    rows
}

/// The names of the "Star system" column and nothing else: every other field is dropped here. Returns (names, rejected lines).
pub fn names_from_csv(text: &str) -> Result<(Vec<String>, Vec<String>), String> {
    if text.len() > 2_000_000 { return Err("the file is too large for a system list".into()); }
    let rows = csv_rows(text);
    let head = rows.first().ok_or("the file is empty")?;
    let col = head.iter().position(|h| h.trim().eq_ignore_ascii_case("Star system"))
        .ok_or("this file has no \"Star system\" column: use the EXPORT button of the Inara faction presence page")?;
    let list: Vec<String> = rows.iter().skip(1).filter_map(|r| r.get(col).cloned()).collect();
    drop(rows);
    clean(&list)
}
