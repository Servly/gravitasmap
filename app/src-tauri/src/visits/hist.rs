//! Travel history, part 2: the stored history (visits.json in the app's data folder) and the scan that keeps it current.
//! Stops are kept PER Journal file: a file that is new or has changed is read again from its start and its entry replaced, so nothing is counted twice.
//! The file is a history only on this PC: never uploaded, no FID, no commander name, no ship name.
use super::parse::{merge_act, parse_reader, Act, Stop, Tail};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

const VERSION: u64 = 1;
/// look at the folder at most this often
const SCAN_EVERY: Duration = Duration::from_secs(2);
/// while a long first scan runs the file is saved this often
const SAVE_EVERY_SCANNING: Duration = Duration::from_secs(5);
/// after a small change (a jump while you play) the file is saved at most this often: it can always be built again from the Journals
const SAVE_EVERY: Duration = Duration::from_secs(20);

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Entry {
    pub size: u64,
    /// hash of the Tail this file was read with (the file before it); another start means it must be read again
    #[serde(default)]
    pub cin: u64,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub pre: Vec<Act>,
    pub stops: Vec<Stop>,
    #[serde(default)]
    pub tail: Tail,
}

#[derive(Default)]
struct Inner {
    loaded: bool,
    files: BTreeMap<String, Entry>,
    rev: u64,
    gen: u64,
    scanning: bool,
    done: usize,
    total: usize,
    dirty: bool,
    last_write: Option<Instant>,
    last_scan: Option<Instant>,
    cache: Option<(u64, Value, Option<String>, usize)>,
}

pub struct Hist {
    path: Option<PathBuf>,
    /// tests only: a backup folder of their own (the real one is store's)
    backup: Option<PathBuf>,
    inner: Mutex<Inner>,
    keep: AtomicBool,
    running: AtomicBool,
}

struct Running<'a>(&'a AtomicBool);
impl Drop for Running<'_> { fn drop(&mut self) { self.0.store(false, Ordering::SeqCst); } }

/// The Journal files of a folder: name -> (size, path). Files over the size limit are left out like everywhere else.
fn journal_files(dir: &Path) -> BTreeMap<String, (u64, PathBuf)> {
    let mut m = BTreeMap::new();
    let Ok(rd) = fs::read_dir(dir) else { return m };
    for e in rd.filter_map(|e| e.ok()) {
        let n = e.file_name().to_string_lossy().into_owned();
        if !(n.starts_with("Journal.") && n.ends_with(".log")) { continue; }
        let Ok(md) = e.metadata() else { continue };
        if md.len() > crate::journal::MAX_JOURNAL_BYTES { continue; }
        m.insert(n, (md.len(), e.path()));
    }
    m
}

impl Hist {
    pub fn new(path: Option<PathBuf>, backup: Option<PathBuf>) -> Hist {
        Hist { path, backup, inner: Mutex::new(Inner::default()), keep: AtomicBool::new(true), running: AtomicBool::new(false) }
    }
    pub fn set_keep(&self, on: bool) { self.keep.store(on, Ordering::SeqCst); }
    fn lock(&self) -> MutexGuard<'_, Inner> { self.inner.lock().unwrap_or_else(|e| e.into_inner()) }

    fn load(&self, g: &mut Inner) {
        if g.loaded { return; }
        g.loaded = true;
        let Some(p) = &self.path else { return };
        if self.backup.is_none() { crate::store::restore(p); }
        let Some(v) = crate::store::load_json(p) else { return };
        if v.get("v").and_then(Value::as_u64) != Some(VERSION) { return; } // another layout: built again from the Journals
        if let Some(f) = v.get("files").and_then(|f| serde_json::from_value::<BTreeMap<String, Entry>>(f.clone()).ok()) { g.files = f; }
        g.rev += 1;
    }

    fn write(&self, g: &mut Inner) {
        let Some(p) = &self.path else { return };
        if let Some(d) = p.parent() { let _ = fs::create_dir_all(d); }
        let text = serde_json::to_string(&json!({"v": VERSION, "files": &g.files})).unwrap_or_default();
        if text.is_empty() || !crate::store::write_atomic(p, &text) { return; }
        match &self.backup {
            Some(b) => { let _ = fs::create_dir_all(b); if let Some(n) = p.file_name() { let _ = fs::copy(p, b.join(n)); } }
            None => crate::store::mirror(p),
        }
        g.dirty = false;
        g.last_write = Some(Instant::now());
    }

    /// The stored history at once. Starts the one background scan when none runs and the last look is older than 2 s.
    /// `rev`: the number this function gave last time: when nothing changed since, no stops are sent again ("same": true).
    pub fn get(self: &Arc<Self>, dir: Option<PathBuf>, rev: Option<u64>) -> Value {
        if !self.keep.load(Ordering::SeqCst) { return empty_reply(false); }
        let mut g = self.lock();
        self.load(&mut g);
        if g.last_scan.map_or(true, |t| t.elapsed() >= SCAN_EVERY) && !self.running.swap(true, Ordering::SeqCst) {
            g.last_scan = Some(Instant::now());
            if g.files.is_empty() && dir.is_some() { g.scanning = true; }   // (nothing stored yet: the page says "reading your Journals" from the very first answer, not "no visits")
            let me = Arc::clone(self);
            let spawned = std::thread::Builder::new().name("GRAVITAS visits".into()).spawn(move || {
                let _r = Running(&me.running);
                if let Some(d) = dir {
                    if std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| me.scan(&d))).is_err() {
                        crate::store::log("the travel history scan stopped by a panic (it starts again at the next look)");
                        let mut g = me.lock();
                        g.scanning = false;
                    }
                }
            });
            if spawned.is_err() { self.running.store(false, Ordering::SeqCst); g.scanning = false; }
        }
        let same = rev == Some(g.rev) && rev.is_some() && !g.scanning;   // (a scan in progress always answers in full, so the page sees the flag flip)
        let (scanning, done, total) = (g.scanning, g.done, g.total);
        if g.cache.as_ref().map_or(true, |c| c.0 != g.rev) {
            let stops = assemble(&g.files);
            let since = stops.first().map(|s| s.t.clone());
            let n = stops.len();
            g.cache = Some((g.rev, serde_json::to_value(&stops).unwrap_or_else(|_| json!([])), since, n));
        }
        let c = g.cache.as_ref().unwrap();
        let mut out = json!({"total": c.3, "scanning": scanning, "scanned": done, "files": total, "since": c.2, "keep": true, "rev": g.rev});
        if same { out["same"] = json!(true); } else { out["stops"] = c.1.clone(); }
        out
    }

    /// The one scan: every Journal file in name order, one start after the other. Unchanged files are not read.
    pub fn scan(&self, dir: &Path) {
        let disk = journal_files(dir);
        let (gen0, names): (u64, Vec<String>) = {
            let mut g = self.lock();
            self.load(&mut g);
            let mut n: Vec<String> = g.files.keys().cloned().chain(disk.keys().cloned()).collect();
            n.sort();
            n.dedup(); // (a file the game has since deleted keeps its history)
            (g.gen, n)
        };
        self.lock().total = names.len();
        let mut tail = Tail::default();
        let mut parsed = 0usize;
        for (i, name) in names.iter().enumerate() {
            if !self.keep.load(Ordering::SeqCst) { break; }
            let cin = tail.hash();
            let current = {
                let g = self.lock();
                if g.gen != gen0 { return; }
                g.files.get(name).filter(|e| match disk.get(name) { Some((size, _)) => e.size == *size && e.cin == cin, None => true }).map(|e| e.tail.clone())
            };
            if let Some(t) = current { tail = t; self.lock().done = i + 1; continue; }
            let Some((_, path)) = disk.get(name) else { continue };
            { let mut g = self.lock(); g.scanning = true; g.done = i; }
            let Ok(f) = fs::File::open(path) else { continue };
            let p = parse_reader(std::io::BufReader::with_capacity(1 << 20, f), tail.clone());
            let mut g = self.lock();
            if g.gen != gen0 { g.scanning = false; return; }
            tail = p.tail.clone();
            g.files.insert(name.clone(), Entry { size: p.size, cin, pre: p.pre, stops: p.stops, tail: p.tail });
            g.rev += 1;
            g.dirty = true;
            g.done = i + 1;
            parsed += 1;
            if g.last_write.map_or(true, |t| t.elapsed() >= SAVE_EVERY_SCANNING) { self.write(&mut g); }
        }
        let mut g = self.lock();
        if g.gen != gen0 { g.scanning = false; return; }
        g.scanning = false;
        g.done = g.total;
        if g.dirty && (parsed > 3 || g.last_write.map_or(true, |t| t.elapsed() >= SAVE_EVERY)) { self.write(&mut g); }
    }

    /// Writes a pending change now (used by tests and when the app has something to flush).
    #[allow(dead_code)]
    pub fn flush(&self) { let mut g = self.lock(); if g.dirty { self.write(&mut g); } }

    /// Forget: the file, its backup copy and the memory. The next look builds it again (only when the keep switch is on).
    pub fn forget(&self) -> bool {
        let mut g = self.lock();
        g.gen += 1;
        g.files.clear();
        g.rev += 1;
        g.cache = None;
        g.dirty = false;
        g.scanning = false;
        g.loaded = true;
        g.last_scan = None;
        g.last_write = None;
        let Some(p) = &self.path else { return true };
        let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let _ = fs::remove_file(p);
        let _ = fs::remove_file(p.with_file_name(format!("{name}.tmp")));
        match &self.backup {
            Some(b) => { let _ = fs::remove_file(b.join(&name)); }
            None => crate::store::unmirror(p),
        }
        !p.exists()
    }

    #[cfg(test)]
    pub fn stops(&self) -> Vec<Stop> { let mut g = self.lock(); self.load(&mut g); assemble(&g.files) }
    #[cfg(test)]
    pub fn put(&self, name: &str, e: Entry) { let mut g = self.lock(); g.loaded = true; g.files.insert(name.to_string(), e); g.rev += 1; g.dirty = true; }
    #[cfg(test)]
    pub fn idle(&self) -> bool { !self.running.load(Ordering::SeqCst) }
}

pub fn empty_reply(keep: bool) -> Value {
    json!({"stops": [], "total": 0, "scanning": false, "scanned": 0, "files": 0, "since": Value::Null, "keep": keep, "rev": 0})
}

/// All files in name order become one list: actions at the head of a file join the last stop of the file before.
pub fn assemble(files: &BTreeMap<String, Entry>) -> Vec<Stop> {
    let mut out: Vec<Stop> = Vec::new();
    for e in files.values() {
        if !e.pre.is_empty() {
            if let Some(last) = out.last_mut() { for a in &e.pre { merge_act(&mut last.acts, a.clone()); } }
        }
        out.extend(e.stops.iter().cloned());
    }
    // (file names carry the date, so this is already true: only an odd old name could break it)
    if out.windows(2).any(|w| w[0].t > w[1].t) { out.sort_by(|a, b| a.t.cmp(&b.t)); }
    out
}
