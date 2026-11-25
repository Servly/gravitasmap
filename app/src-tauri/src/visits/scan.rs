//! Travel history, part 3: the scan that fills the archive from the Journal files.
//! FIRST RUN: pass 1 reads the newest ~12 months of Journals (no carried-over state, so the facts before a file's first system are dropped) and
//! publishes them within seconds; pass 2 goes through every file oldest to newest with the right carried-over state, reads again only the files whose
//! carried-over state differs, and fills the older months. LATER RUNS: pass 2 only, and only files that are new or changed are read.
//! Finished months are written and dropped from memory as the scan goes: the stops of the whole history are never in memory at once.
use super::arch::{self, cin_of, Entry, Load, MonthData};
use super::hist::{Hist, Slot, Work};
use super::parse::{parse_reader, Act, Stop, Tail};
use super::summary::sum_of;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::{Duration, Instant};

/// while a long scan runs the changed months and the index are written this often
const SAVE_EVERY_SCANNING: Duration = Duration::from_secs(5);
/// after a small change (a jump while you play) month files are written at most this often: the page already gets it from memory
const SAVE_EVERY: Duration = Duration::from_secs(20);
/// a long scan keeps at most about this many unwritten stops in memory
const MEM_STOPS: usize = 60_000;
/// pass 1 covers this many months back from the newest Journal
const FIRST_MONTHS: u32 = 12;
/// more changed files than this = a long scan (the page shows the progress)
const BULK_FILES: usize = 3;

/// The Journal files of a folder: name -> (size, path). Files over the size limit are left out like everywhere else.
pub fn journal_files(dir: &Path) -> BTreeMap<String, (u64, PathBuf)> {
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

#[derive(Clone, Default)]
struct Carry { tail: Tail, lm: String }

struct Scan<'a> {
    h: &'a Hist,
    dir: &'a Path,
    w: &'a mut Work,
    gen0: u64,
    bulk: bool,
    last_flush: Instant,
    last_prog: Instant,
    parsed: usize,
    index_written: bool,
}

impl Hist {
    /// The one scan. Unchanged files are not read (only their size is looked at).
    pub fn scan(&self, dir: &Path) {
        let Some(adir) = self.dir.clone() else { return };
        if !self.keep.load(Ordering::SeqCst) { return; }
        let gen0 = self.gen.load(Ordering::SeqCst);
        let disk = journal_files(dir);
        let mut w = self.work.lock().unwrap_or_else(|e| e.into_inner());
        if w.gen != gen0 { w.slots.clear(); w.gen = gen0; }
        let (names, first, todo): (Vec<String>, bool, usize) = {
            let mut g = self.lock();
            self.load(&mut g);
            let mut n: Vec<String> = g.files.keys().cloned().chain(disk.keys().cloned()).collect();
            n.sort();
            n.dedup(); // (a file the game has since deleted keeps its history)
            let todo = n.iter().filter(|x| match (g.files.get(*x), disk.get(*x)) { (None, Some(_)) => true, (Some(e), Some((s, _))) => e.size != *s, _ => false }).count();
            (n, g.files.is_empty(), todo)
        };
        let bulk = todo > BULK_FILES || (first && todo > 0);
        if bulk {
            let mut g = self.lock();
            g.scanning = true; g.total = names.len(); g.done = 0; g.rev = arch::next_r();
        } else {
            self.lock().total = names.len();
        }
        let mut sc = Scan { h: self, dir: &adir, w: &mut w, gen0, bulk, last_flush: Instant::now(), last_prog: Instant::now(), parsed: 0, index_written: false };
        let ok = sc.run(&names, &disk, first);
        sc.finish(ok);
    }
}

impl Scan<'_> {
    fn alive(&self) -> bool { self.h.keep.load(Ordering::SeqCst) && self.h.gen.load(Ordering::SeqCst) == self.gen0 }

    fn run(&mut self, names: &[String], disk: &BTreeMap<String, (u64, PathBuf)>, first: bool) -> bool {
        if first && self.bulk {
            // pass 1: the newest months, without any carried-over state
            let newest = names.iter().filter_map(|n| arch::name_month(n)).max().map(|s| s.to_string());
            if let Some(cut) = newest.and_then(|m| arch::month_back(&m, FIRST_MONTHS - 1)) {
                let mut n1 = 0usize;
                for name in names.iter().filter(|n| arch::name_month(n).map_or(false, |m| m >= cut.as_str())) {
                    if !self.alive() { return false; }
                    let Some((_, path)) = disk.get(name) else { continue };
                    if self.read_file(name, path, &Carry::default()).is_none() { return false; }
                    n1 += 1;
                    self.progress(n1);
                    self.checkpoints(name);
                }
                self.checkpoint(None);
            }
        }
        // pass 2: every file, oldest to newest
        let mut carry = Carry::default();
        for (i, name) in names.iter().enumerate() {
            if !self.alive() { return false; }
            let cin = cin_of(&carry.tail, &carry.lm);
            let skip = {
                let g = self.h.lock();
                g.files.get(name).filter(|e| match disk.get(name) { Some((size, _)) => e.size == *size && e.cin == cin, None => true }).map(|e| Carry { tail: e.tail.clone(), lm: e.lm.clone() })
            };
            if let Some(c) = skip { carry = c; self.progress(i + 1); continue; }
            let Some((_, path)) = disk.get(name) else { continue };
            match self.read_file(name, path, &carry) { Some(c) => carry = c, None => return false }
            self.progress(i + 1);
            self.checkpoints(name);
        }
        true
    }

    /// the progress shown by the page: only goes up, and the index is told at most every 400 ms
    fn progress(&mut self, n: usize) {
        if !self.bulk { return; }
        let mut g = self.h.lock();
        if n > g.done { g.done = n; }
        if self.last_prog.elapsed() >= Duration::from_millis(400) { self.last_prog = Instant::now(); g.rev = arch::next_r(); }
    }

    /// One file: parse it with the carried-over state, put its stops into the months, return what the next file needs (None = stop, the archive is damaged).
    fn read_file(&mut self, name: &str, path: &Path, carry: &Carry) -> Option<Carry> {
        let Ok(f) = fs::File::open(path) else { return Some(carry.clone()) };
        let cin = cin_of(&carry.tail, &carry.lm);
        let p = parse_reader(std::io::BufReader::with_capacity(1 << 20, f), carry.tail.clone());
        let mut by_m: BTreeMap<String, Vec<Stop>> = BTreeMap::new();
        let mut lm = carry.lm.clone();
        for s in p.stops {
            let Some(m) = arch::month_key(&s.t).map(|m| m.to_string()) else { continue };
            lm = m.clone();
            by_m.entry(m).or_default().push(s);
        }
        // (the head actions need a stop of the file before: with no carried-over state there is none and they are dropped)
        let (pre, pm) = if carry.lm.is_empty() { (Vec::new(), String::new()) } else { (p.pre, carry.lm.clone()) };
        let pm = if pre.is_empty() { String::new() } else { pm };
        let ent = Entry { size: p.size, cin, tail: p.tail.clone(), ms: by_m.keys().cloned().collect(), lm: lm.clone(), pm };
        if self.replace(name, ent, by_m, pre).is_err() { self.h.damaged(); return None; }
        self.parsed += 1;
        Some(Carry { tail: p.tail, lm })
    }

    fn slot(&mut self, m: &str) -> Result<&mut Slot, ()> {
        if !self.w.slots.contains_key(m) {
            let data = match arch::read_month(self.dir, m) {
                Load::Ok(d) => d,
                // (a month the index knows must have its file)
                Load::Missing => { if self.h.lock().months.contains_key(m) { return Err(()); } MonthData::default() }
                Load::Bad => return Err(()),
            };
            self.w.slots.insert(m.to_string(), Slot { data, dirty: false, unwritten: false });
        }
        self.w.slots.get_mut(m).ok_or(())
    }

    /// The new segments of a file replace its old ones (in every month the old or the new read touched).
    fn replace(&mut self, name: &str, ent: Entry, mut by_m: BTreeMap<String, Vec<Stop>>, pre: Vec<Act>) -> Result<(), ()> {
        let old = self.h.lock().files.get(name).cloned();
        let mut touched: BTreeSet<String> = by_m.keys().cloned().collect();
        if let Some(o) = &old { touched.extend(o.ms.iter().cloned()); if !o.pm.is_empty() { touched.insert(o.pm.clone()); } }
        if !ent.pm.is_empty() { touched.insert(ent.pm.clone()); }
        for m in touched {
            let st = by_m.remove(&m);
            let pr = if ent.pm == m && !pre.is_empty() { Some(pre.clone()) } else { None };
            let slot = self.slot(&m)?;
            let c1 = slot.data.set_seg(name, st);
            let c2 = slot.data.set_pre(name, pr);
            if c1 || c2 { slot.dirty = true; }
        }
        let mut g = self.h.lock();
        if old.as_ref() != Some(&ent) { g.index_dirty = true; }
        g.files.insert(name.to_string(), ent);
        Ok(())
    }

    /// Dirty months become visible: the summary goes into the index, the stops are served from memory until the file is written.
    fn publish(&mut self) {
        let mut g = self.h.lock();
        let mut any = false;
        for (m, s) in self.w.slots.iter_mut() {
            if !s.dirty { continue; }
            s.dirty = false;
            s.unwritten = true;
            any = true;
            let stops = s.data.assemble();
            if stops.is_empty() { g.months.remove(m); g.live.remove(m); }
            else { let r = arch::next_r(); g.months.insert(m.clone(), sum_of(&stops, r)); g.live.insert(m.clone(), (r, Arc::new(stops))); }
            g.index_dirty = true;
        }
        if any { g.rev = arch::next_r(); g.cache = None; }
    }

    /// Month files that are published but not written, then the index. Returns false when a write failed or Forget came in between.
    fn write(&mut self) -> bool {
        let h = self.h;
        let _io = h.io.lock().unwrap_or_else(|e| e.into_inner());
        if !self.alive() { return false; }
        let _ = fs::create_dir_all(self.dir);
        let mut ok = true;
        for (m, s) in self.w.slots.iter_mut() {
            if !s.unwritten { continue; }
            let p = arch::month_path(self.dir, m);
            let done = if s.data.is_empty() { let _ = fs::remove_file(&p); true } else {
                let t = s.data.to_text();
                let r = crate::store::write_atomic(&p, &t);
                if r { self.h.writes.fetch_add(1, Ordering::SeqCst); self.h.write_bytes.fetch_add(t.len() as u64, Ordering::SeqCst); }
                r
            };
            if done { s.unwritten = false; self.h.lock().live.remove(m); } else { ok = false; }
        }
        if !ok { return false; }
        let text = {
            let mut g = self.h.lock();
            g.index_dirty = false;
            serde_json::to_string(&arch::IndexOut { v: arch::VERSION, files: &g.files, months: &g.months }).unwrap_or_default()
        };
        if text.is_empty() || !crate::store::write_atomic(&arch::index_path(self.dir), &text) { self.h.lock().index_dirty = true; return false; }
        self.h.write_bytes.fetch_add(text.len() as u64, Ordering::SeqCst);
        self.h.lock().last_write = Some(Instant::now());
        self.index_written = true;
        self.last_flush = Instant::now();
        true
    }

    /// Publish and write what is pending; months before `keep_from` (and clean ones) are dropped from memory afterwards.
    fn checkpoint(&mut self, keep_from: Option<&str>) {
        if !self.alive() { return; }
        self.publish();
        if self.write() {
            self.w.slots.retain(|m, s| s.dirty || s.unwritten || keep_from.map_or(false, |k| m.as_str() >= k));
        }
    }

    /// During a long scan: write finished months at once (a month is finished when a file two months later is being read), everything every 5 s,
    /// and never keep more than MEM_STOPS stops that are not written.
    fn checkpoints(&mut self, name: &str) {
        if !self.bulk { return; }
        let cur = arch::name_month(name).map(|s| s.to_string());
        let keep_from = cur.as_deref().and_then(|c| arch::month_back(c, 1));
        let pending: usize = self.w.slots.values().map(|s| s.data.n_stops()).sum();
        let finished = keep_from.as_deref().map_or(false, |k| self.w.slots.iter().any(|(m, s)| (s.dirty || s.unwritten) && m.as_str() < k));
        if finished || pending > MEM_STOPS || self.last_flush.elapsed() >= SAVE_EVERY_SCANNING {
            let k = if pending > MEM_STOPS { cur.clone() } else { keep_from };
            self.checkpoint(k.as_deref());
        }
    }

    fn finish(&mut self, ok: bool) {
        if ok && self.alive() {
            self.publish();
            let pending = self.w.slots.values().any(|s| s.unwritten) || self.h.lock().index_dirty;
            let due = { let g = self.h.lock(); g.last_write.map_or(true, |t| t.elapsed() >= SAVE_EVERY) };
            if pending && (self.bulk || self.parsed > BULK_FILES || due) { self.write(); }
            self.w.slots.retain(|_, s| s.dirty || s.unwritten);
            // the old single file (version 1) is not needed any more once the new archive is on disk
            let complete = { let g = self.h.lock(); !g.files.is_empty() && self.dir.join("index.json").exists() };
            if complete { if let Some(p) = self.h.legacy.clone() { self.h.remove_legacy(&p); } }
        }
        let mut g = self.h.lock();
        if self.h.gen.load(Ordering::SeqCst) == self.gen0 {
            if g.scanning { g.scanning = false; g.done = g.total; g.rev = arch::next_r(); }
            g.cache = None;
        }
    }
}
