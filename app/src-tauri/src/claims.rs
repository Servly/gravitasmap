//! Claims: what you can still cash in, worked out from the Journal. claims.py (v0.45.0) in Rust, rule for rule.
//!
//! Python's Counter keeps keys in the order they were first written to, a read of a missing key does not add it, an assignment
//! (even `by[f] -= 0`) does: IndexMap with get()/set()/bump() below does the same, because the order decides which faction comes
//! first among equal balances and where a proportional share is left over. Rounding is Python's (half to even): pyval.rs.
use crate::pyval::{float_or0, int_or0, lower_str, round, round_div, str_or_empty, truthy};
use indexmap::IndexMap;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

pub const BONUS: f64 = 1.075;
const DUST: i64 = 5; // a balance this small after a cash-in is a rounding leftover, not a bounty
const MATCH: f64 = 0.03; // an unnamed cash-in belongs to the faction whose balance it is within 3% of

const EVENTS: &[&str] = &["Bounty", "RedeemVoucher", "Died", "WingJoin", "WingAdd", "WingLeave", "Docked"];
const MONEY: &[&str] = &["Bounty", "RedeemVoucher"];

type Map = IndexMap<String, i64>;

fn get(m: &Map, k: &str) -> i64 {
    m.get(k).copied().unwrap_or(0)
}
fn set(m: &mut Map, k: &str, v: i64) {
    m.insert(k.to_string(), v); // (an existing key keeps its place, a new one goes last: as a Python dict)
}
fn bump(m: &mut Map, k: &str, d: i64) {
    let v = get(m, k) + d;
    set(m, k, v);
}

/// Bounty vouchers held, by the faction that pays them.
#[derive(Default, Clone)]
pub struct Owed {
    by: Map,
    loose: i64,
    wing_by: Map,
    in_wing: bool,
    station: Option<(Value, Value)>,
    pub cashed: Vec<(i64, Value, Value)>,
}

impl Owed {
    pub fn new() -> Owed {
        Owed::default()
    }

    pub fn feed(&mut self, e: &Value) -> bool {
        let ev = e.get("event").and_then(Value::as_str).unwrap_or("");
        match ev {
            "Docked" => {
                // some stations write StationName as a raw token: StationName_Localised, when the game gives one, is the real name
                let l = e.get("StationName_Localised");
                let name = if truthy(l) { l.cloned().unwrap_or(Value::Null) } else { e.get("StationName").cloned().unwrap_or(Value::Null) };
                self.station = Some((e.get("StarSystem").cloned().unwrap_or(Value::Null), name));
                true
            }
            "WingJoin" | "WingAdd" => {
                self.in_wing = true;
                true
            }
            "WingLeave" => {
                self.in_wing = false;
                true
            }
            "Died" => {
                self.by.clear();
                self.loose = 0;
                self.wing_by.clear();
                true
            }
            "Bounty" => {
                let rewards: Vec<Value> = e.get("Rewards").and_then(Value::as_array).cloned().unwrap_or_default();
                let mut got: Vec<(String, i64)> = Vec::new();
                for r in &rewards {
                    let (a, fac) = (int_or0(r.get("Reward")), str_or_empty(r.get("Faction")));
                    bump(&mut self.by, &fac, a);
                    got.push((fac, a));
                }
                if rewards.is_empty() && truthy(e.get("Reward")) {
                    let (a, fac) = (int_or0(e.get("Reward")), str_or_empty(e.get("Faction")));
                    bump(&mut self.by, &fac, a);
                    got.push((fac, a));
                }
                if self.in_wing {
                    for (fac, a) in got {
                        bump(&mut self.wing_by, &fac, a); // kept per faction: one faction's cash-in must never dock another's
                    }
                }
                true
            }
            "RedeemVoucher" if lower_str(e, "Type") == "bounty" => {
                self.redeem(e);
                true
            }
            _ => false,
        }
    }

    fn redeem(&mut self, e: &Value) {
        let cut = float_or0(e.get("BrokerPercentage")); // (Interstellar Factors keep a share: what was owed)
        let (mut paid, mut loose_now) = (0i64, 0i64);
        let mut unnamed: Vec<i64> = Vec::new();
        let mut matched: Vec<String> = Vec::new();
        let factions: Vec<Value> = e.get("Factions").and_then(Value::as_array).cloned().unwrap_or_default();
        for r in &factions {
            let mut a = int_or0(r.get("Amount"));
            if 0.0 < cut && cut < 100.0 {
                a = round(a as f64 / (1.0 - cut / 100.0));
            }
            let fac = str_or_empty(r.get("Faction"));
            if !fac.is_empty() {
                // a cash-in never takes a faction below 0: what does not fit is dropped (the game can pay out more than the Bounty
                // lines add up to, its +7.5% wing bonus most often)
                let take = a.min(get(&self.by, &fac).max(0));
                bump(&mut self.by, &fac, -take);
                let w = (get(&self.wing_by, &fac) - take).max(0);
                set(&mut self.wing_by, &fac, w);
            } else {
                loose_now += a;
                unnamed.push(a);
            }
            paid += a;
        }
        // each Factions entry is one faction's voucher: an unnamed amount goes to the faction whose own balance it comes closest to (as
        // it stands, or with the +7.5% on its wing part), and that faction is cleared. Only what matches nothing is shared out below.
        let mut sorted = unnamed.clone();
        sorted.sort_by(|x, y| y.cmp(x));
        for a in sorted {
            let (mut best, mut err): (Option<String>, f64) = (None, MATCH);
            let names: Vec<String> = self.by.keys().cloned().collect();
            for f in names {
                let v = get(&self.by, &f);
                if v <= 0 || matched.contains(&f) {
                    continue;
                }
                let wing = get(&self.wing_by, &f).min(v);
                let expects = [None, Some(v as f64 + wing as f64 * (BONUS - 1.0))];
                for expect in expects {
                    let d = match expect {
                        None => (a - v).abs() as f64 / a.max(1) as f64, // (int over int, as Python)
                        Some(x) => (a as f64 - x).abs() / a.max(1) as f64,
                    };
                    if d <= err {
                        best = Some(f.clone());
                        err = d;
                    }
                }
            }
            if let Some(b) = best {
                matched.push(b.clone());
                set(&mut self.by, &b, 0);
                set(&mut self.wing_by, &b, 0);
                loose_now -= a;
            }
        }
        if loose_now > 0 {
            let base: i64 = self.by.values().filter(|v| **v > 0).sum();
            if base > 0 {
                let items: Vec<String> = self.by.iter().filter(|(_, v)| **v > 0).map(|(f, _)| f.clone()).collect();
                let mut remaining = loose_now;
                for (i, f) in items.iter().enumerate() {
                    let share = if i == items.len() - 1 { remaining } else { round_div(loose_now as i128 * get(&self.by, f) as i128, base as i128) };
                    let take = share.min(get(&self.by, f)); // never push another faction below 0 either
                    bump(&mut self.by, f, -take);
                    let w = (get(&self.wing_by, f) - take).max(0);
                    set(&mut self.wing_by, f, w);
                    remaining -= share;
                }
            }
        }
        let names: Vec<String> = self.by.keys().cloned().collect();
        for f in names {
            // the 1 cr that stayed on screen: no real bounty is that small, it is dust
            let v = get(&self.by, &f);
            if 0 < v && v <= DUST {
                set(&mut self.by, &f, 0);
                set(&mut self.wing_by, &f, 0);
            }
        }
        if paid != 0 {
            let (system, station) = self.station.clone().unwrap_or((Value::Null, Value::Null));
            self.cashed.push((paid, system, station));
        }
    }

    pub fn total(&self) -> i64 {
        (self.by.values().map(|v| (*v).max(0)).sum::<i64>() - self.loose).max(0)
    }

    /// Highest first; equal balances keep the order they were first written in.
    pub fn factions(&self) -> Vec<(String, i64)> {
        let mut v: Vec<(String, i64)> = self.by.iter().map(|(k, v)| (k.clone(), *v)).collect();
        v.sort_by_key(|(_, v)| -*v);
        v.into_iter().filter(|(_, v)| *v > 0).collect()
    }

    /// The +7.5% estimate on the part of what is owed that was earned in a wing, per faction.
    pub fn wing_bonus(&self) -> i64 {
        let s: i64 = self.wing_by.iter().map(|(f, v)| (*v).max(0).min(get(&self.by, f).max(0))).sum();
        round(s as f64 * (BONUS - 1.0))
    }

    pub fn in_wing(&self) -> bool {
        self.in_wing
    }

    /// Everything the state holds, in the order it is held (for the tests against the plugin's own Owed).
    pub fn dump(&self) -> Value {
        let pairs = |m: &Map| m.iter().map(|(k, v)| json!([k, v])).collect::<Vec<Value>>();
        json!({
            "by": pairs(&self.by), "wing_by": pairs(&self.wing_by), "loose": self.loose, "total": self.total(),
            "factions": self.factions().into_iter().map(|(f, v)| json!([f, v])).collect::<Vec<Value>>(),
            "wing_bonus": self.wing_bonus(),
            "cashed": self.cashed.iter().map(|(a, b, c)| json!([a, b, c])).collect::<Vec<Value>>(),
            "in_wing": self.in_wing,
        })
    }
}

// ------------------------------------------------------------------------------------------------ reading the older Journals

fn has(line: &[u8], pat: &[u8]) -> bool {
    line.windows(pat.len()).any(|w| w == pat)
}

/// The Bounty, RedeemVoucher, Died, Wing and Docked lines of one Journal, in order, and whose they are: (CMDR, legacy game).
pub(crate) fn events_of(path: &Path) -> (Vec<Value>, (Option<String>, Option<bool>)) {
    let mut out = Vec::new();
    let (mut cmdr, mut legacy): (Option<String>, Option<bool>) = (None, None);
    if crate::journal::too_big(path) { return (out, (cmdr, legacy)); }
    let Ok(bytes) = std::fs::read(path) else { return (out, (cmdr, legacy)) };
    let tags: Vec<Vec<u8>> = EVENTS.iter().map(|n| format!("\"{n}\"").into_bytes()).collect();
    for ln in bytes.split_inclusive(|b| *b == b'\n') {
        if ln.len() > 1_000_000 { continue; } // (not a Journal line)
        let head = legacy.is_none() && has(ln, b"\"Fileheader\"");
        let who = cmdr.is_none() && (has(ln, b"\"Commander\"") || has(ln, b"\"LoadGame\""));
        if head || who || tags.iter().any(|p| has(ln, p)) {
            let Ok(e) = serde_json::from_slice::<Value>(ln.trim_ascii()) else { continue };
            let ev = e.get("event").and_then(Value::as_str).unwrap_or("").to_string();
            if EVENTS.contains(&ev.as_str()) {
                out.push(e);
            } else if ev == "Fileheader" && legacy.is_none() {
                let gv = str_or_empty(e.get("gameversion"));
                legacy = Some(matches!(gv.split('.').next().unwrap_or(""), "1" | "2" | "3"));
            } else if (ev == "Commander" || ev == "LoadGame") && cmdr.is_none() && truthy(e.get("Name")) {
                cmdr = Some(str_or_empty(e.get("Name")));
            }
        }
    }
    (out, (cmdr, legacy))
}

fn same_file(a: &Path, b: &Path) -> bool {
    match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
        (Ok(x), Ok(y)) => x == y,
        _ => a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase(),
    }
}

/// The lines of every Journal in `folder` (but `skip`) since the last death, oldest first; whether a death was found (else: everything
/// ever written); and that death's own timestamp ("" if none).
pub fn events_since_death(folder: &Path, skip: Option<&Path>) -> (Vec<Value>, bool, String) {
    let mut files: Vec<(std::time::SystemTime, PathBuf)> = Vec::new();
    if let Ok(rd) = std::fs::read_dir(folder) {
        let mut names: Vec<PathBuf> = rd.filter_map(|e| e.ok()).map(|e| e.path()).collect();
        names.sort();
        for p in names {
            let n = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            if n.starts_with("Journal.") && n.ends_with(".log") {
                if let Some(m) = std::fs::metadata(&p).ok().and_then(|m| m.modified().ok()) {
                    files.push((m, p));
                }
            }
        }
    }
    files.sort_by(|a, b| b.0.cmp(&a.0)); // newest first (a stable sort: equal times keep their order)
    let mut kept: Vec<Vec<Value>> = Vec::new();
    let (mut found, mut died_ts) = (false, String::new());
    let mut mine: Option<(Option<String>, Option<bool>)> = None; // (CMDR, legacy) of the newest Journal: another CMDR's are left out
    for (_, p) in &files {
        let same = skip.map(|s| same_file(p, s)).unwrap_or(false);
        let (ev, who) = events_of(p);
        if mine.is_none() && who.0.is_some() {
            mine = Some(who.clone());
        }
        if let Some(m) = &mine {
            if who.0.is_some() && &who != m {
                continue;
            }
        }
        let died: Vec<usize> = ev.iter().enumerate().filter(|(_, e)| e.get("event").and_then(Value::as_str) == Some("Died")).map(|(i, _)| i).collect();
        if same {
            // the newest Journal is skipped (the live feed owns it) but a death IN it still stops the search
            if let Some(&last) = died.last() {
                found = true;
                died_ts = str_or_empty(ev[last].get("timestamp"));
                break;
            }
            continue;
        }
        if let Some(&last) = died.last() {
            kept.push(ev[last + 1..].to_vec());
            found = true;
            died_ts = str_or_empty(ev[last].get("timestamp"));
            break;
        }
        kept.push(ev);
    }
    (kept.into_iter().rev().flatten().collect(), found, died_ts)
}

// ------------------------------------------------------------------------------------------------ Claims

/// A Journal timestamp (UTC) as HH:MM on this computer's clock (Windows' own time zone rules), "" if it can't be read.
pub fn local_hhmm(base: &str) -> String {
    use windows::Win32::Foundation::SYSTEMTIME;
    use windows::Win32::System::Time::SystemTimeToTzSpecificLocalTime;
    let Some(secs) = crate::host::parse_ts(base) else { return String::new() };
    let days = (secs as i64).div_euclid(86400);
    let rem = (secs as i64).rem_euclid(86400);
    let ts = crate::host::format_ts(secs as i64); // (year, month, day from the same text)
    let utc = SYSTEMTIME {
        wYear: ts[0..4].parse().unwrap_or(1970),
        wMonth: ts[5..7].parse().unwrap_or(1),
        wDay: ts[8..10].parse().unwrap_or(1),
        wDayOfWeek: ((days + 4).rem_euclid(7)) as u16,
        wHour: (rem / 3600) as u16,
        wMinute: (rem % 3600 / 60) as u16,
        wSecond: (rem % 60) as u16,
        wMilliseconds: 0,
    };
    let mut local = SYSTEMTIME::default();
    if unsafe { SystemTimeToTzSpecificLocalTime(None, &utc, &mut local) }.is_err() {
        return String::new();
    }
    format!("{:02}:{:02}", local.wHour, local.wMinute)
}

type Pending = Arc<Mutex<Option<(Vec<Value>, bool, String)>>>;

/// The older Journals (read once, on a thread of their own) and everything since, replayed in order.
#[derive(Default)]
pub struct Claims {
    old: Option<Vec<Value>>,
    pub base: String, // Ctrl+Shift+F12's line: a Journal timestamp, money lines up to it are not counted
    pub died_ts: String,
    died_now: bool,
    rev: u64,
    thread_started: bool,
    pending: Option<Pending>,
    events: Vec<Value>,
    crev: Option<u64>,
    combined: Option<Owed>,
}

impl Claims {
    pub fn new() -> Claims {
        Claims::default()
    }

    pub fn start(&mut self, folder: Option<&Path>, newest: Option<&Path>) {
        if self.thread_started {
            return;
        }
        let Some(folder) = folder else {
            // (no game folder: only what comes from now on)
            if self.old.is_none() {
                self.old = Some(Vec::new());
                self.rev += 1;
            }
            return;
        };
        self.thread_started = true;
        let slot: Pending = Arc::new(Mutex::new(None));
        let (s2, f, n) = (slot.clone(), folder.to_path_buf(), newest.map(Path::to_path_buf));
        std::thread::Builder::new()
            .name("GRAVITAS claims".into())
            .spawn(move || {
                let r = events_since_death(&f, n.as_deref());
                if let Ok(mut g) = s2.lock() {
                    *g = Some(r);
                }
            })
            .ok();
        self.pending = Some(slot);
    }

    /// Takes what the thread found, once it has found it.
    fn poll(&mut self) {
        let done = self.pending.as_ref().and_then(|p| p.lock().ok().and_then(|mut g| g.take()));
        if let Some((events, _, died_ts)) = done {
            if died_ts > self.died_ts {
                self.died_ts = died_ts;
            }
            self.old = Some(events);
            self.rev += 1;
            self.pending = None;
        }
    }

    /// Tests: waits for the older Journals.
    #[cfg(test)]
    pub fn wait_for_old(&mut self) {
        for _ in 0..4000 {
            self.poll();
            if self.pending.is_none() {
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
    }

    pub fn feed(&mut self, e: &Value) {
        let ev = e.get("event").and_then(Value::as_str).unwrap_or("");
        if !EVENTS.contains(&ev) {
            return;
        }
        self.events.push(e.clone());
        if ev == "Died" {
            self.died_now = true;
            let ts = str_or_empty(e.get("timestamp"));
            if ts > self.died_ts {
                self.died_ts = ts;
            }
        }
        self.rev += 1;
    }

    fn combined(&mut self) -> &Owed {
        if self.crev != Some(self.rev) || self.combined.is_none() {
            let base = self.base.clone();
            let counts = |e: &Value| {
                base.is_empty()
                    || !MONEY.contains(&e.get("event").and_then(Value::as_str).unwrap_or(""))
                    || str_or_empty(e.get("timestamp")) > base
            };
            let mut o = Owed::new();
            let mut today: &[Value] = &self.events;
            if self.died_now {
                // today's own Died already cleared everything from that point on - the older Journals never mattered again
                let died = today.iter().rposition(|e| e.get("event").and_then(Value::as_str) == Some("Died")).unwrap_or(0);
                today = &today[died + 1..];
            } else {
                for e in self.old.iter().flatten() {
                    if counts(e) {
                        o.feed(e);
                    }
                }
                o.in_wing = false; // (today starts this replay-order state fresh)
                o.station = None;
            }
            for e in today {
                if counts(e) {
                    o.feed(e);
                }
            }
            self.crev = Some(self.rev);
            self.combined = Some(o);
        }
        self.combined.as_ref().unwrap()
    }

    /// Claims back to 0 by hand: a line, not a wipe. Money lines stamped at or before it stop counting, what comes after counts as always.
    pub fn reset_at(&mut self, epoch_secs: i64) -> String {
        self.base = crate::host::format_ts(epoch_secs);
        self.rev += 1;
        self.base.clone()
    }

    /// HH:MM (this computer's clock) of the reset line, for the Bounty counter's note: "" if there is none, or a death since has ended it
    /// (a note about a reset that no longer matters would only read as stale).
    pub fn base_local(&self) -> String {
        if self.base.is_empty() || self.died_ts > self.base { String::new() } else { local_hhmm(&self.base) }
    }

    pub fn set_base(&mut self, base: &str) {
        if base != self.base {
            self.base = base.to_string();
            self.rev += 1;
        }
    }

    /// (cr proven by the Journal, [(faction, cr)], the +7.5% wing bonus estimate, every cash-in, in a wing right now), or null while the
    /// older Journals are still read.
    pub fn view(&mut self) -> Value {
        self.poll();
        if self.old.is_none() && !self.died_now {
            return Value::Null;
        }
        let o = self.combined();
        let cashed: Vec<Value> = o.cashed.iter().map(|(p, s, t)| json!([p, s, t])).collect();
        let facs: Vec<Value> = o.factions().into_iter().map(|(f, v)| json!([f, v])).collect();
        json!([o.total(), facs, o.wing_bonus(), cashed, o.in_wing()])
    }
}
