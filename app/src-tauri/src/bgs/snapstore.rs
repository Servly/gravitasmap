//! BGS Watch, the saved snapshots: the folder `bgs/` of the app's data folder, one file `snap-<id>.json` per snapshot and an `index.json` of small
//! summaries. NUMBERS ONLY: system names, influence, time, the screenshot file names. The pictures are never copied or kept.
//! Writes are atomic (store.rs), each file gets the backup copy like the settings, a file that cannot be read is kept as .bad-<time> (store::load_json).
//! This module writes and deletes ONLY inside its own folder, never in a game folder.
use super::model::{Snapshot, StoredRow};
use super::snap::norm;
use super::timeutil::parse_iso;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub struct Store {
    pub dir: PathBuf,
}

/// May this folder be written to? Only the app's own `bgs` folder (tests: a folder under the system temp folder), never the game's folders.
pub fn safe_dir(d: &Path) -> bool {
    let named = d.file_name().map_or(false, |n| n == "bgs") || (cfg!(test) && d.starts_with(std::env::temp_dir()));
    if !named { return false; }
    if let Some(g) = crate::journal::saved_games() { if d == g || d.starts_with(&g) || g.starts_with(d) { return false; } }
    let l = d.to_string_lossy().to_lowercase();
    if l.contains("frontier developments") { return false; }
    if let Ok(rd) = std::fs::read_dir(d) {
        for e in rd.filter_map(|e| e.ok()) {
            let n = e.file_name().to_string_lossy().to_lowercase();
            if n.starts_with("journal.") || n.starts_with("status") || n.ends_with(".binds") || n == "navroute.json" || n == "market.json" || n == "cargo.json" || n.starts_with("screenshot") { return false; }
        }
    }
    true
}

fn id_ok(id: &str) -> bool { !id.is_empty() && id.len() <= 40 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') }

impl Store {
    /// the real store: <app data>/bgs
    pub fn open() -> Option<Store> { Store::at(crate::store::dir()?.join("bgs")) }
    pub fn at(dir: PathBuf) -> Option<Store> { safe_dir(&dir).then_some(Store { dir }) }

    fn index_path(&self) -> PathBuf { self.dir.join("index.json") }
    fn snap_path(&self, id: &str) -> PathBuf { self.dir.join(format!("snap-{id}.json")) }

    fn write(&self, p: &Path, v: &Value) -> bool {
        let _ = std::fs::create_dir_all(&self.dir);
        let ok = serde_json::to_string(v).map(|t| crate::store::write_atomic(p, &t)).unwrap_or(false);
        if ok { crate::store::mirror(p); }
        ok
    }

    /// a snapshot file by id
    pub fn get(&self, id: &str) -> Option<Snapshot> {
        if !id_ok(id) { return None; }
        let p = self.snap_path(id);
        crate::store::restore(&p);
        serde_json::from_value(crate::store::load_json(&p)?).ok()
    }

    fn summary(s: &Snapshot) -> Value {
        let known = s.rows.iter().filter(|r| r.inf_x10.is_some()).count();
        json!({"id": s.id, "taken_utc": s.taken_utc, "data_utc": s.data_utc, "rows": s.rows.len(), "with_value": known,
               "confirmed_rows": s.rows.iter().filter(|r| r.confirmed).count(), "complete": s.complete, "resolution": s.resolution, "imported": s.imported})
    }

    /// ids of every snapshot, oldest first (from the index, else the folder)
    pub fn ids(&self) -> Vec<String> {
        let mut ids: Vec<String> = crate::store::load_json(&self.index_path()).and_then(|v| v["snapshots"].as_array().map(|a| a.iter().filter_map(|s| s["id"].as_str().map(String::from)).collect())).unwrap_or_default();
        if ids.is_empty() {
            crate::store::restore(&self.index_path());
            if let Ok(rd) = std::fs::read_dir(&self.dir) {
                for e in rd.filter_map(|e| e.ok()) {
                    let n = e.file_name().to_string_lossy().into_owned();
                    if let Some(id) = n.strip_prefix("snap-").and_then(|x| x.strip_suffix(".json")) { if id_ok(id) { ids.push(id.to_string()); } }
                }
            }
        }
        ids.sort();
        ids.dedup();
        ids
    }

    /// every snapshot, oldest first (a file that cannot be read is skipped)
    pub fn all(&self) -> Vec<Snapshot> {
        let mut v: Vec<Snapshot> = self.ids().iter().filter_map(|id| self.get(id)).collect();
        v.sort_by(|a, b| a.data_utc.cmp(&b.data_utc).then(a.id.cmp(&b.id)));
        v
    }

    pub fn summaries(&self) -> Vec<Value> { self.all().iter().map(Self::summary).collect() }

    fn write_index(&self, all: &[Snapshot]) {
        self.write(&self.index_path(), &json!({"v": 1, "snapshots": all.iter().map(Self::summary).collect::<Vec<_>>()}));
    }

    /// Saves a snapshot under a new id (never overwrites a stored one). Returns the id.
    pub fn save(&self, mut s: Snapshot) -> Result<String, String> {
        let base = s.id.clone();
        if !id_ok(&base) { return Err("the snapshot has no valid id".into()); }
        let mut id = base.clone();
        let mut k = 2;
        while self.snap_path(&id).exists() {
            id = format!("{base}-{k}");
            k += 1;
            if k > 99 { return Err("too many snapshots with the same time".into()); }
        }
        s.id = id.clone();
        if !self.write(&self.snap_path(&id), &serde_json::to_value(&s).map_err(|e| e.to_string())?) { return Err("the snapshot could not be saved".into()); }
        let mut all = self.all();
        if !all.iter().any(|x| x.id == id) { all.push(s); }
        all.sort_by(|a, b| a.data_utc.cmp(&b.data_utc).then(a.id.cmp(&b.id)));
        self.write_index(&all);
        Ok(id)
    }

    /// the newest stored snapshot taken before `t` (UTC seconds), else None
    pub fn previous(&self, t: i64) -> Option<Snapshot> {
        self.all().into_iter().filter(|s| parse_iso(&s.taken_utc).map_or(false, |x| x < t)).max_by(|a, b| a.data_utc.cmp(&b.data_utc))
    }

    /// forgets every snapshot and the index (only files this module made)
    pub fn forget(&self) -> usize {
        let mut n = 0;
        if let Ok(rd) = std::fs::read_dir(&self.dir) {
            for e in rd.filter_map(|e| e.ok()) {
                let name = e.file_name().to_string_lossy().into_owned();
                let ours = name == "index.json" || (name.starts_with("snap-") && (name.ends_with(".json") || name.contains(".json.")));
                if ours && std::fs::remove_file(e.path()).is_ok() {
                    crate::store::unmirror(&e.path());
                    n += 1;
                }
            }
        }
        n
    }

    /// CSV text (UTF-8 with a byte-order mark so Excel opens it right): one line per system per snapshot, oldest first
    pub fn csv(&self) -> String {
        let q = |s: &str| if s.contains([',', '"', '\n']) { format!("\"{}\"", s.replace('"', "\"\"")) } else { s.to_string() };
        let mut out = String::from("\u{feff}snapshot_utc,system,influence_percent,change_vs_previous,confirmed\n");
        let mut last: std::collections::HashMap<String, i32> = Default::default();
        for s in self.all() {
            for r in &s.rows {
                let key = norm(&r.system);
                let inf = r.inf_x10.map(|v| format!("{}.{}", v / 10, v % 10)).unwrap_or_default();
                let chg = match (r.inf_x10, last.get(&key)) { (Some(v), Some(p)) => { let d = v - p; format!("{}{}.{}", if d < 0 { "-" } else { "+" }, d.abs() / 10, d.abs() % 10) } _ => String::new() };
                out.push_str(&format!("{},{},{},{},{}\n", q(&s.data_utc), q(&r.system), inf, chg, if r.confirmed { "yes" } else { "no" }));
                if let Some(v) = r.inf_x10 { last.insert(key, v); }
            }
        }
        out
    }
}

/// checks rows the player sends before they are stored
pub fn check_rows(rows: &[StoredRow]) -> Result<(), String> {
    if rows.is_empty() || rows.len() > 500 { return Err("a snapshot has 1 to 500 systems".into()); }
    let mut seen = std::collections::HashSet::new();
    for r in rows {
        if !super::names::valid(r.system.trim()) { return Err(format!("\"{}\" is not a valid system name", r.system)); }
        if let Some(v) = r.inf_x10 { if !(0..=1000).contains(&v) { return Err(format!("the influence of {} is out of range", r.system)); } }
        if !seen.insert(norm(&r.system)) { return Err(format!("{} appears twice", r.system)); }
    }
    Ok(())
}
