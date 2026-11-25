//! Travel history, part 2: the archive's state in memory (only the small index, never the stops) and what the window asks for:
//! the index (which months exist, a summary of each), one month's stops, a search. The scan that fills the archive is in scan.rs.
//! The history lives only on this PC: never uploaded, no FID, no commander name, no ship name.
use super::arch::{self, Entry, Load, MonthData};
use super::parse::{Act, Stop};
use super::summary::MonthSum;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

/// look at the folder at most this often
pub const SCAN_EVERY: Duration = Duration::from_secs(2);

#[derive(Default)]
pub struct Inner {
    pub loaded: bool,
    pub files: BTreeMap<String, Entry>,
    pub months: BTreeMap<String, MonthSum>,
    /// months that are published (in the index) but not written to disk yet: served from memory
    pub live: BTreeMap<String, (u64, Arc<Vec<Stop>>)>,
    pub rev: u64,
    pub scanning: bool,
    pub done: usize,
    pub total: usize,
    pub index_dirty: bool,
    pub last_write: Option<Instant>,
    pub last_scan: Option<Instant>,
    pub cache: Option<(u64, Value)>,
}

pub struct Slot { pub data: MonthData, pub dirty: bool, pub unwritten: bool }
#[derive(Default)]
pub struct Work { pub slots: BTreeMap<String, Slot>, pub gen: u64 }

pub struct Hist {
    /// the folder `visits/`
    pub dir: Option<PathBuf>,
    /// the old single file visits.json (version 1): ignored, deleted when the archive is complete
    pub legacy: Option<PathBuf>,
    /// tests only: a backup folder of their own (the real one is store's)
    pub backup: Option<PathBuf>,
    pub inner: Mutex<Inner>,
    pub work: Mutex<Work>,
    /// writes and Forget never run at the same time
    pub io: Mutex<()>,
    pub gen: AtomicU64,
    pub keep: AtomicBool,
    pub running: AtomicBool,
    /// month files written (tests and the stress test)
    pub writes: AtomicU64,
    pub write_bytes: AtomicU64,
}

pub struct Running<'a>(pub &'a AtomicBool);
impl Drop for Running<'_> { fn drop(&mut self) { self.0.store(false, Ordering::SeqCst); } }

pub fn empty_index(keep: bool) -> Value {
    json!({"rev": 0, "keep": keep, "scanning": false, "scanned": 0, "files": 0, "total": 0, "since": Value::Null, "until": Value::Null, "months": []})
}
fn empty_month(m: &str) -> Value { json!({"m": m, "r": 0, "stops": []}) }

/// May this folder be written to and cleaned? Only the app's own store folder: it is named "visits" (tests: any folder under the system temp folder),
/// and it holds nothing of the game (no Journal, Status, Bindings or other game file) and is not the game's folder.
pub fn safe_store_dir(d: &Path) -> bool {
    let named = d.file_name().map_or(false, |n| n == "visits") || (cfg!(test) && d.starts_with(std::env::temp_dir()));
    if !named { return false; }
    if let Some(g) = crate::journal::saved_games() { if d == g || d.starts_with(&g) || g.starts_with(d) { return false; } }
    if let Ok(rd) = std::fs::read_dir(d) {
        for e in rd.filter_map(|e| e.ok()) {
            let n = e.file_name().to_string_lossy().to_lowercase();
            if n.starts_with("journal.") || n.starts_with("status") || n.ends_with(".binds") || n == "navroute.json" || n == "market.json" || n == "cargo.json" { return false; }
        }
    }
    true
}

impl Hist {
    pub fn new(dir: Option<PathBuf>, legacy: Option<PathBuf>, backup: Option<PathBuf>) -> Hist {
        // THE GAME'S FILES ARE READ ONLY (owner's rule): this module deletes and writes ONLY inside its own store folder. A folder that is not the app's own
        // "visits" folder, or that holds anything of the game, is never used for writing or deleting (the history then simply stays in memory-less mode).
        let dir = dir.filter(|d| safe_store_dir(d));
        let legacy = legacy.filter(|p| p.file_name().map_or(false, |n| n == "visits.json"));
        Hist {
            dir, legacy, backup, inner: Mutex::new(Inner::default()), work: Mutex::new(Work::default()), io: Mutex::new(()), gen: AtomicU64::new(0),
            keep: AtomicBool::new(true), running: AtomicBool::new(false), writes: AtomicU64::new(0), write_bytes: AtomicU64::new(0),
        }
    }
    pub fn set_keep(&self, on: bool) {
        if self.keep.swap(on, Ordering::SeqCst) != on { let mut g = self.lock(); g.rev = arch::next_r(); }
    }
    pub fn lock(&self) -> MutexGuard<'_, Inner> { self.inner.lock().unwrap_or_else(|e| e.into_inner()) }

    /// The index file into memory (once). An index that is missing, broken or of another layout means the month files cannot be trusted: they go too.
    pub fn load(&self, g: &mut Inner) {
        if g.loaded { return; }
        g.loaded = true;
        let Some(d) = &self.dir else { return };
        match arch::read_index(d) {
            Some(ix) => { g.files = ix.files; g.months = ix.months; }
            None => arch::wipe(d),
        }
        g.rev = arch::next_r();
    }

    /// The index answer at once. Starts the one background scan when none runs and the last look is older than 2 s.
    /// `rev`: the number this function gave last time: when nothing changed since, only {"same": true} comes back.
    pub fn index(self: &Arc<Self>, dir: Option<PathBuf>, rev: Option<u64>) -> Value {
        if !self.keep.load(Ordering::SeqCst) { return empty_index(false); }
        let mut g = self.lock();
        self.load(&mut g);
        if g.last_scan.map_or(true, |t| t.elapsed() >= SCAN_EVERY) && !self.running.swap(true, Ordering::SeqCst) {
            g.last_scan = Some(Instant::now());
            // (nothing stored yet: the page says "reading your Journals" from the very first answer, never "no visits")
            if g.files.is_empty() && dir.is_some() { g.scanning = true; g.rev = arch::next_r(); }
            let me = Arc::clone(self);
            let spawned = std::thread::Builder::new().name("GRAVITAS visits".into()).spawn(move || {
                let _r = Running(&me.running);
                if let Some(d) = dir {
                    if std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| me.scan(&d))).is_err() {
                        crate::store::log("the travel history scan stopped by a panic (it starts again at the next look)");
                        let mut g = me.lock();
                        g.scanning = false;
                        g.rev = arch::next_r();
                    }
                }
            });
            if spawned.is_err() { self.running.store(false, Ordering::SeqCst); g.scanning = false; }
        }
        if rev.is_some() && rev == Some(g.rev) && !g.scanning { return json!({"same": true, "rev": g.rev}); }
        if g.cache.as_ref().map_or(true, |c| c.0 != g.rev) { let v = answer(&g); g.cache = Some((g.rev, v)); }
        g.cache.as_ref().map(|c| c.1.clone()).unwrap_or_else(|| empty_index(true))
    }

    /// The stops of ONE month (a month that is not in the index is empty). Read from disk, or from memory while the month is not written yet.
    pub fn month(&self, m: &str) -> Value {
        if !self.keep.load(Ordering::SeqCst) || !arch::valid_month(m) { return empty_month(m); }
        let r = {
            let mut g = self.lock();
            self.load(&mut g);
            let Some(s) = g.months.get(m) else { return empty_month(m) };
            if let Some((r, st)) = g.live.get(m) { return json!({"m": m, "r": r, "stops": &**st}); }
            s.r
        };
        let Some(d) = &self.dir else { return empty_month(m) };
        match arch::read_month(d, m) {
            Load::Ok(data) => json!({"m": m, "r": r, "stops": data.assemble()}),
            _ => { crate::store::log(&format!("travel history: month {m} could not be read, it is built again")); self.damaged(); empty_month(m) }
        }
    }

    /// A month file that is gone or broken: the archive is built again from the Journals at the next look.
    pub fn damaged(&self) {
        self.gen.fetch_add(1, Ordering::SeqCst);
        let _io = self.io.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(d) = &self.dir { arch::wipe(d); }
        let mut g = self.lock();
        g.files.clear(); g.months.clear(); g.live.clear(); g.cache = None; g.index_dirty = false; g.scanning = false;
        g.rev = arch::next_r();
        g.last_scan = None; g.last_write = None;
    }

    /// Search system, station and goods names (case-insensitive part of a name, at least 2 characters), the newest month first.
    pub fn find(&self, q: &str, limit: usize) -> Value {
        let q = q.trim();
        if !self.keep.load(Ordering::SeqCst) || q.chars().count() < 2 { return json!({"items": [], "done": true}); }
        let limit = limit.clamp(1, 500);
        let ql = q.to_lowercase();
        let raw_ok = !ql.contains('"') && !ql.contains('\\');
        let months: Vec<String> = { let mut g = self.lock(); self.load(&mut g); g.months.keys().rev().cloned().collect() };
        let mut items: Vec<Value> = Vec::new();
        for m in months {
            let live = self.lock().live.get(&m).map(|x| Arc::clone(&x.1));
            let stops: Vec<Stop> = match live {
                Some(a) => (*a).clone(),
                None => {
                    let Some(d) = &self.dir else { break };
                    let Ok(text) = fs::read_to_string(arch::month_path(d, &m)) else { continue };
                    if raw_ok && !text.to_lowercase().contains(&ql) { continue; }
                    let Some(data) = MonthData::from_text(&text) else { continue };
                    data.assemble()
                }
            };
            search_month(&m, &stops, &ql, limit + 1, &mut items);
            if items.len() > limit { break; }
        }
        let done = items.len() <= limit;
        items.truncate(limit);
        json!({"items": items, "done": done})
    }

    /// Forget: the whole folder, the old visits.json and its backup copy, and the memory. The next look builds it again (only when the keep switch is on).
    pub fn forget(&self) -> bool {
        self.gen.fetch_add(1, Ordering::SeqCst);
        let _io = self.io.lock().unwrap_or_else(|e| e.into_inner());
        {
            let mut g = self.lock();
            g.files.clear(); g.months.clear(); g.live.clear();
            g.rev = arch::next_r();
            g.cache = None; g.index_dirty = false; g.scanning = false; g.loaded = true; g.last_scan = None; g.last_write = None; g.done = 0; g.total = 0;
        }
        if let Some(d) = &self.dir { arch::wipe(d); let _ = fs::remove_dir_all(d); }
        if let Some(p) = &self.legacy { self.remove_legacy(p); }
        self.dir.as_ref().map_or(true, |d| !d.exists()) && self.legacy.as_ref().map_or(true, |p| !p.exists())
    }

    /// The old single file (version 1) and its backup copy.
    pub fn remove_legacy(&self, p: &Path) {
        let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let _ = fs::remove_file(p);
        let _ = fs::remove_file(p.with_file_name(format!("{name}.tmp")));
        match &self.backup {
            Some(b) => { let _ = fs::remove_file(b.join(&name)); }
            None => crate::store::unmirror(p),
        }
    }

    #[cfg(test)]
    pub fn idle(&self) -> bool { !self.running.load(Ordering::SeqCst) }
}

/// the index answer: one entry per month, oldest first
fn answer(g: &Inner) -> Value {
    let months: Vec<Value> = g.months.iter().map(|(m, s)| json!({
        "m": m, "n": s.n, "t0": s.t0, "t1": s.t1, "r": s.r, "cr": s.cr, "ly": s.ly, "sys": s.sys,
        "sell": s.sell, "buy": s.buy, "dock": s.dock, "grid": s.grid,
    })).collect();
    let total: usize = g.months.values().map(|s| s.n).sum();
    let since = g.months.values().next().map(|s| s.t0.clone());
    let until = g.months.values().next_back().map(|s| s.t1.clone());
    json!({"rev": g.rev, "keep": true, "scanning": g.scanning, "scanned": g.done, "files": g.total, "total": total, "since": since, "until": until, "months": months})
}

fn item(st: &Stop, m: &str, k: &str, a: Option<&Act>) -> Value {
    match a {
        None => json!({"t": st.t, "sys": st.sys, "m": m, "k": k, "what": "", "st": "", "n": 0, "cr": 0}),
        Some(a) => json!({"t": st.t, "sys": st.sys, "m": m, "k": k, "what": a.what, "st": a.st, "n": a.n.unwrap_or(0), "cr": a.cr.unwrap_or(0)}),
    }
}

/// The matches of one month, newest first, until `max` items are in `out`.
fn search_month(m: &str, stops: &[Stop], ql: &str, max: usize, out: &mut Vec<Value>) {
    for st in stops.iter().rev() {
        if st.sys.to_lowercase().contains(ql) { out.push(item(st, m, "sys", None)); }
        for a in st.acts.iter().rev() {
            if a.what.to_lowercase().contains(ql) || a.st.to_lowercase().contains(ql) { out.push(item(st, m, &a.k, Some(a))); }
        }
        if out.len() >= max { return; }
    }
}
