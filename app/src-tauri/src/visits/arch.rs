//! Travel history, the ARCHIVE on disk: a folder `visits/` in the app's data folder with `index.json` (what is in the archive) and one file per
//! UTC month, `m-YYYY-MM.json`. Stops belong to the month of their own timestamp. A month file keeps its stops as SEGMENTS, one per Journal file
//! that gave stops to that month, so a Journal file that is read again replaces only its own segments. Everything here is rebuildable from the Journals.
use super::parse::{merge_act, Act, Stop, Tail};
use super::summary::MonthSum;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

/// the layout of the archive: another number = the archive is built again from the Journals
pub const VERSION: u64 = 2;

static CLOCK: AtomicU64 = AtomicU64::new(0);
/// A revision number that only goes up, also across app starts (milliseconds since 1970, +1 when two come in the same millisecond).
pub fn next_r() -> u64 {
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(1);
    let mut cur = CLOCK.load(Ordering::SeqCst);
    loop {
        let n = now.max(cur + 1);
        match CLOCK.compare_exchange(cur, n, Ordering::SeqCst, Ordering::SeqCst) { Ok(_) => return n, Err(c) => cur = c }
    }
}

/// "2026-11" of "2026-11-24T10:00:00Z" (None when the text does not start like a date)
pub fn month_key(t: &str) -> Option<&str> {
    let b = t.as_bytes();
    (b.len() >= 7 && b[..4].iter().all(u8::is_ascii_digit) && b[4] == b'-' && b[5..7].iter().all(u8::is_ascii_digit)).then(|| &t[..7])
}
/// exactly YYYY-MM (a month name is never put into a path before this says yes)
pub fn valid_month(m: &str) -> bool { m.len() == 7 && month_key(m).is_some() }

/// "2026-11" minus n months
pub fn month_back(m: &str, n: u32) -> Option<String> {
    let y: i64 = m.get(..4)?.parse().ok()?;
    let mo: i64 = m.get(5..7)?.parse().ok()?;
    let k = y * 12 + (mo - 1) - n as i64;
    Some(format!("{:04}-{:02}", k.div_euclid(12), k.rem_euclid(12) + 1))
}

/// the month in a new-style Journal name (Journal.2026-11-24T...), None for an old-style name
pub fn name_month(n: &str) -> Option<&str> { n.strip_prefix("Journal.").and_then(month_key) }

/// The carried-over state as one number. The month of the last stop is in it too: a file's head actions are put on the last stop of the file before,
/// so a change of that stop's month must make the file be read again.
pub fn cin_of(tail: &Tail, lm: &str) -> u64 {
    let mut h = tail.hash();
    for b in lm.bytes() { h ^= b as u64; h = h.wrapping_mul(0x100000001b3); }
    h ^ 0xa5
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct Seg { pub f: String, pub stops: Vec<Stop> }
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct PreSeg { pub f: String, pub acts: Vec<Act> }

/// One month: the segments of the Journal files (sorted by file name) and the head actions of later files that belong to a stop of this month.
#[derive(Clone, Debug, Default)]
pub struct MonthData { pub segs: Vec<Seg>, pub pre: Vec<PreSeg> }

#[derive(Serialize)]
struct Out<'a> { v: u64, segs: &'a Vec<Seg>, #[serde(skip_serializing_if = "Vec::is_empty")] pre: &'a Vec<PreSeg> }
#[derive(Deserialize)]
struct In { #[serde(default)] v: u64, #[serde(default)] segs: Vec<Seg>, #[serde(default)] pre: Vec<PreSeg> }

impl MonthData {
    pub fn is_empty(&self) -> bool { self.segs.is_empty() }
    /// Puts (or removes, None) the segment of one Journal file. Returns whether anything changed.
    pub fn set_seg(&mut self, f: &str, stops: Option<Vec<Stop>>) -> bool {
        let i = self.segs.iter().position(|s| s.f == f);
        match (i, stops) {
            (Some(i), Some(st)) => { if self.segs[i].stops == st { false } else { self.segs[i].stops = st; true } }
            (Some(i), None) => { self.segs.remove(i); true }
            (None, Some(st)) => { let at = self.segs.partition_point(|s| s.f.as_str() < f); self.segs.insert(at, Seg { f: f.to_string(), stops: st }); true }
            (None, None) => false,
        }
    }
    pub fn set_pre(&mut self, f: &str, acts: Option<Vec<Act>>) -> bool {
        let i = self.pre.iter().position(|s| s.f == f);
        match (i, acts) {
            (Some(i), Some(a)) => { if self.pre[i].acts == a { false } else { self.pre[i].acts = a; true } }
            (Some(i), None) => { self.pre.remove(i); true }
            (None, Some(a)) => { let at = self.pre.partition_point(|s| s.f.as_str() < f); self.pre.insert(at, PreSeg { f: f.to_string(), acts: a }); true }
            (None, None) => false,
        }
    }
    pub fn n_stops(&self) -> usize { self.segs.iter().map(|s| s.stops.len()).sum() }

    /// The month as one list, oldest first. Head actions join the last stop of the files before them (in this month).
    pub fn assemble(&self) -> Vec<Stop> {
        let mut out: Vec<Stop> = Vec::with_capacity(self.n_stops());
        let mut bounds: Vec<usize> = Vec::with_capacity(self.segs.len());
        for s in &self.segs { out.extend(s.stops.iter().cloned()); bounds.push(out.len()); }
        for p in &self.pre {
            let k = self.segs.partition_point(|s| s.f < p.f);
            if k == 0 { continue; }
            let end = bounds[k - 1];
            if end == 0 { continue; }
            for a in &p.acts { merge_act(&mut out[end - 1].acts, a.clone()); }
        }
        // (file names carry the date, so this is already true: only an odd old name could break it)
        if out.windows(2).any(|w| w[0].t > w[1].t) { out.sort_by(|a, b| a.t.cmp(&b.t)); }
        out
    }
    pub fn to_text(&self) -> String { serde_json::to_string(&Out { v: VERSION, segs: &self.segs, pre: &self.pre }).unwrap_or_default() }
    pub fn from_text(t: &str) -> Option<MonthData> {
        let i: In = serde_json::from_str(t.trim_start_matches('\u{feff}')).ok()?;
        (i.v == VERSION).then(|| MonthData { segs: i.segs, pre: i.pre })
    }
}

/// What the archive knows about one Journal file.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct Entry {
    pub size: u64,
    /// the carried-over state this file was read with (see cin_of)
    pub cin: u64,
    /// what the next file needs
    pub tail: Tail,
    /// the months this file gave stops to
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub ms: Vec<String>,
    /// the month of the last stop up to the end of this file
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub lm: String,
    /// the month holding the stop this file's head actions were put on ("" = none)
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub pm: String,
}

#[derive(Serialize)]
pub struct IndexOut<'a> { pub v: u64, pub files: &'a BTreeMap<String, Entry>, pub months: &'a BTreeMap<String, MonthSum> }
#[derive(Deserialize)]
pub struct IndexIn { #[serde(default)] pub v: u64, #[serde(default)] pub files: BTreeMap<String, Entry>, #[serde(default)] pub months: BTreeMap<String, MonthSum> }

pub fn index_path(dir: &Path) -> PathBuf { dir.join("index.json") }
pub fn month_path(dir: &Path, m: &str) -> PathBuf { dir.join(format!("m-{m}.json")) }

pub fn read_index(dir: &Path) -> Option<IndexIn> {
    let t = fs::read_to_string(index_path(dir)).ok()?;
    match serde_json::from_str::<IndexIn>(t.trim_start_matches('\u{feff}')) {
        Ok(i) if i.v == VERSION => Some(i),
        Ok(_) => None,
        Err(_) => { crate::store::quarantine(&index_path(dir)); None }
    }
}

pub enum Load { Ok(MonthData), Missing, Bad }
pub fn read_month(dir: &Path, m: &str) -> Load {
    let p = month_path(dir, m);
    let t = match fs::read_to_string(&p) { Ok(t) => t, Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Load::Missing, Err(_) => return Load::Bad };
    match MonthData::from_text(&t) { Some(d) => Load::Ok(d), None => { crate::store::quarantine(&p); Load::Bad } }
}

/// Removes everything the archive holds (month files, the index, temporary files); the folder too when it is empty after that.
pub fn wipe(dir: &Path) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.filter_map(|e| e.ok()) {
        let n = e.file_name().to_string_lossy().into_owned();
        if (n.starts_with("m-") && n.contains(".json")) || n.starts_with("index.json") { let _ = fs::remove_file(e.path()); }
    }
    let _ = fs::remove_dir(dir);
}
