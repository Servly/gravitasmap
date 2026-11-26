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
    /// ignore a Bounty line that is an exact copy of the Bounty line before it (the game sometimes writes one twice)
    pub dedupe: bool,
    /// claims_fix: a named cash-in a little below the balance clears it (the game sometimes pays 0.1-0.5 % less)
    pub fix: bool,
    last_bounty: Option<Value>,
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
                if self.dedupe {
                    if self.last_bounty.as_ref() == Some(e) {
                        return false;
                    }
                    self.last_bounty = Some(e.clone());
                }
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
                let held = get(&self.by, &fac).max(0);
                // (claims_fix) paid within MATCH of what is held: the faction is cleared, no leftover that would never go away
                let take = if self.fix && held > 0 && (a as f64) >= held as f64 * (1.0 - MATCH) { held } else { a.min(held) };
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
    // newest first, by FILE NAME (the same order everywhere: journal::name_key). The modified time is not trusted: an antivirus touches old files.
    let mut files: Vec<PathBuf> = crate::journal::journal_files(folder);
    files.reverse();
    let mut kept: Vec<Vec<Value>> = Vec::new();
    let (mut found, mut died_ts) = (false, String::new());
    let mut mine: Option<(Option<String>, Option<bool>)> = None; // (CMDR, legacy) of the newest Journal: another CMDR's are left out
    for p in &files {
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
            // (claims_fix) the wing and station lines before the death stay: a death does not take you out of your wing, only the money goes.
            // They are marked "_pre" so that Claims skips them while the flag is off (the old plugin lost the wing state here).
            let mut after: Vec<Value> = ev[..last].iter().filter(|e| matches!(e.get("event").and_then(Value::as_str), Some("WingJoin" | "WingAdd" | "WingLeave" | "Docked"))).cloned().map(|mut e| { e["_pre"] = Value::Bool(true); e }).collect();
            after.extend_from_slice(&ev[last + 1..]);
            kept.push(after);
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
    dedupe: bool,
    fix: bool,
    /// the resets before the current line (newest last, at most 5), for Undo
    older: Vec<String>,
    logged: Option<(std::time::Instant, i64)>,
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

    /// The claims_fix setting (see Owed::fix and the wing state kept over a death).
    pub fn set_fix(&mut self, on: bool) {
        if self.fix != on {
            self.fix = on;
            self.rev += 1;
        }
    }

    /// Whether a repeated Bounty line counts once (see Owed::dedupe).
    pub fn set_dedupe(&mut self, on: bool) {
        if self.dedupe != on {
            self.dedupe = on;
            self.rev += 1;
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
            let base_t = crate::host::parse_ts(&base);
            let counts = |e: &Value| {
                if base.is_empty() || !MONEY.contains(&e.get("event").and_then(Value::as_str).unwrap_or("")) { return true; }
                let ts = str_or_empty(e.get("timestamp"));
                // times, not text (an offset or a fraction of a second), the text only when one of them does not parse
                match (crate::host::parse_ts(&ts), base_t) { (Some(t), Some(b)) => t > b, _ => ts > base }
            };
            let fix = self.fix;
            let mut o = Owed::new();
            o.dedupe = self.dedupe;
            o.fix = fix;
            let mut today: &[Value] = &self.events;
            if self.died_now {
                // today's own Died already cleared everything from that point on - the older Journals never mattered again
                let died = today.iter().rposition(|e| e.get("event").and_then(Value::as_str) == Some("Died")).unwrap_or(0);
                if fix {
                    // (claims_fix) a death does not take you out of your wing: the wing and station state before it carries on, money does not
                    for e in &today[..died] {
                        if matches!(e.get("event").and_then(Value::as_str), Some("WingJoin" | "WingAdd" | "WingLeave" | "Docked")) {
                            o.feed(e);
                        }
                    }
                }
                today = &today[died + 1..];
            } else {
                for e in self.old.iter().flatten() {
                    if !fix && e.get("_pre").is_some() { continue; }
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
        self.older.push(self.base.clone());
        if self.older.len() > 5 { self.older.remove(0); }
        self.base = crate::host::format_ts(epoch_secs);
        self.rev += 1;
        self.base.clone()
    }

    /// HH:MM (this computer's clock) of the reset line, for the Bounty counter's note: "" if there is none, or a death since has ended it
    /// (a note about a reset that no longer matters would only read as stale).
    pub fn base_local(&self) -> String {
        if self.base.is_empty() || self.died_ts > self.base { String::new() } else { local_hhmm(&self.base) }
    }

    /// Undo the last reset: back to the line before it (the stack keeps the last 5), nothing left = no line at all. Returns the new line.
    pub fn undo_reset(&mut self) -> String {
        let b = self.older.pop().unwrap_or_default();
        self.set_base(&b);
        b
    }

    /// Restore: the reset line and the stack of older ones are gone, Claims are worked out again from the Journals (every unredeemed bounty and bond since the
    /// last death, as the game's own Claims panel counts them). Returns "" (no line).
    pub fn restore(&mut self) -> String {
        self.older.clear();
        self.set_base("");
        String::new()
    }

    pub fn older(&self) -> &[String] {
        &self.older
    }

    /// The older resets loaded at start (newest last).
    pub fn set_older(&mut self, older: Vec<String>) {
        let n = older.len().saturating_sub(5);
        self.older = older[n..].to_vec();
    }

    pub fn base(&self) -> &str {
        &self.base
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
        let (nold, nlive, base, died) = (self.old.as_ref().map(Vec::len).unwrap_or(0), self.events.len(), self.base.clone(), self.died_ts.clone());
        let total = self.combined().total();
        // the evidence trail for a report ("Claims is wrong"): one line when the total changes, at most one per 5 s
        let due = self.logged.map(|(t, last)| total != last && t.elapsed() >= std::time::Duration::from_secs(5)).unwrap_or(true);
        if due {
            self.logged = Some((std::time::Instant::now(), total));
            crate::store::log(&format!("claims: total={total} base={base} died_ts={died} old_events={nold} live_events={nlive}"));
        }
        let o = self.combined.as_ref().unwrap();
        let cashed: Vec<Value> = o.cashed.iter().map(|(p, s, t)| json!([p, s, t])).collect();
        let facs: Vec<Value> = o.factions().into_iter().map(|(f, v)| json!([f, v])).collect();
        json!([o.total(), facs, o.wing_bonus(), cashed, o.in_wing()])
    }
}

/// Real cases from Burak's Journals, checked against the game's own Claims panel / the voucher the game paid.
#[cfg(test)]
mod real_cases {
    use super::*;

    fn bounty(ts: &str, rewards: &[i64], fac: &str) -> Value {
        let r: Vec<Value> = rewards.iter().map(|a| json!({"Faction": fac, "Reward": a})).collect();
        json!({"timestamp": ts, "event": "Bounty", "Rewards": r, "TotalReward": rewards.iter().sum::<i64>(), "SharedWithOthers": 2})
    }
    /// What the app shows for one faction: what the Journal proves + the wing bonus estimate.
    fn shown(o: &Owed) -> i64 {
        o.total() + o.wing_bonus()
    }
    fn wing_run(fac: &str, kills: &[i64], dedupe: bool) -> Owed {
        let mut o = Owed::new();
        o.dedupe = dedupe;
        o.feed(&json!({"timestamp": "2026-11-24T20:00:00Z", "event": "WingJoin", "Others": ["A", "B"]}));
        for (i, k) in kills.iter().enumerate() {
            o.feed(&bounty(&format!("2026-11-24T20:{:02}:00Z", i + 1), &[*k], fac));
        }
        o
    }

    const PROG: [i64; 8] = [992600, 126000, 104000, 836500, 202158, 1014900, 151300, 1149800];
    const DARK: [i64; 12] = [239382, 732000, 153800, 595800, 1156200, 916400, 610500, 167400, 778200, 1020300, 252978, 124100];
    const LYS: [i64; 10] = [795200, 1212200, 136950, 638000, 1035000, 1110100, 1148700, 657300, 80700, 730600];
    const HIP: [i64; 17] = [100848, 761000, 593500, 787700, 166386, 1211700, 776300, 154110, 1150500, 888100, 101046, 872100, 122430, 668900, 105600, 890800, 1296700];

    /// 24 Nov 2026: three factions match the game's Claims panel to 3 cr or less.
    #[test]
    fn the_wing_estimate_matches_the_games_panel() {
        for (fac, kills, base, game) in [("Progressive Party of Scylla", &PROG[..], 4_577_258, 4_920_550), ("The Dark Wheel", &DARK[..], 6_747_060, 7_253_087), ("L.Y.S Corp.", &LYS[..], 7_544_750, 8_110_604)] {
            let o = wing_run(fac, kills, true);
            assert_eq!(o.total(), base, "{fac}: the Journal's own sum");
            assert!((shown(&o) - game).abs() <= 3, "{fac}: app {} game {game}", shown(&o));
        }
    }

    /// 24 Nov 21:21-21:38, Minutemen: 14 kills, the first (120,252) with no SharedWithOthers field: it gets the bonus too. Game panel 6,454,095.
    #[test]
    fn an_unshared_kill_in_a_wing_gets_the_bonus_too() {
        let kills = [120252, 648000, 115805, 66585, 931400, 121000, 276400, 646100, 751800, 1038900, 60100, 110300, 731600, 385572];
        let o = wing_run("Minutemen", &kills, true);
        assert_eq!(o.total(), 6_003_814);
        assert!((shown(&o) - 6_454_095).abs() <= 5, "app {} game 6,454,095", shown(&o));
    }

    /// The fourth faction of that night is NOT explained: the game paid 754,620 cr of bonus on 10,647,720 cr (7.09 %), 7.5 % on all of it
    /// is 798,580. No subset of the 17 kills x 7.5 % gives 754,620, and the kill with no SharedWithOthers is not the cause. This test pins
    /// what is known so a change of the estimate is noticed: the app is 43,959 cr above the game here.
    #[test]
    fn hip_5700_is_a_known_unexplained_gap() {
        let o = wing_run("HIP 5700 Empire League", &HIP, true);
        assert_eq!(o.total(), 10_647_720);
        assert_eq!(shown(&o) - 11_402_340, 43_959);
    }

    /// 7 Nov 2026: the game wrote one Bounty line (two rewards of 654,300) twice and paid it once: the voucher was 19,716,887 cr.
    #[test]
    fn a_bounty_line_written_twice_counts_once() {
        let kills: [i64; 30] = [
            1163600, 116955, 751200, 138930, 135200, 128700, 934900, 1009200, 1001200, 185328, 876000, 81700, 1160400, 1052900, 83490, 876900, 94990, 1033300, 189156, 681000,
            253600, 938300, 601700, 455664, 123200, 1094600, 76600, 782900, 142887, 868200,
        ];
        let run = |dedupe: bool| {
            let mut o = Owed::new();
            o.dedupe = dedupe;
            o.feed(&json!({"timestamp": "2026-11-07T18:00:00Z", "event": "WingJoin", "Others": ["A", "B"]}));
            for (i, k) in kills.iter().enumerate() {
                o.feed(&bounty(&format!("2026-11-07T19:{:02}:{:02}Z", i / 60, i % 60), &[*k], "Turkish Galactic Empire"));
            }
            let twice = bounty("2026-11-07T19:02:45Z", &[654300, 654300], "Turkish Galactic Empire");
            o.feed(&twice);
            o.feed(&twice);
            o
        };
        let (on, off) = (run(true), run(false));
        assert_eq!(on.total(), 18_341_300, "once");
        assert_eq!(off.total(), 19_649_900, "both copies, as the plugin did");
        assert!((shown(&on) - 19_716_887).abs() <= 15, "app {} game 19,716,887", shown(&on));
        // two different kills with the same reward are NOT a repeat (the timestamp differs)
        let mut o = Owed::new();
        o.dedupe = true;
        o.feed(&bounty("2026-11-07T19:00:00Z", &[500_000], "X"));
        o.feed(&bounty("2026-11-07T19:00:01Z", &[500_000], "X"));
        assert_eq!(o.total(), 1_000_000);
    }

    /// The Host drops the copy for everything (counter, Claims, engine), and only with the setting on.
    #[test]
    fn the_host_drops_the_copy_for_every_reader() {
        let line = bounty("2026-11-07T19:02:45Z", &[654300, 654300], "Turkish Galactic Empire");
        for on in [true, false] {
            let mut h = crate::host::Host::new(true).unwrap();
            h.set.claims_dedupe = on;
            h.claims.start(None, None);
            h.handle(&line, 1_800_000_000.0);
            h.handle(&line, 1_800_000_000.0);
            assert_eq!(h.counter.n, if on { 1 } else { 2 }, "kills (dedupe {on})");
            assert_eq!(h.counter.cr, if on { 1_308_600 } else { 2_617_200 }, "this fight (dedupe {on})");
            let v = h.claims.view();
            assert_eq!(v[0].as_i64().unwrap(), if on { 1_308_600 } else { 2_617_200 }, "Claims (dedupe {on})");
        }
    }

    /// Claims replays Journals itself (the older ones too): the flag reaches that replay.
    #[test]
    fn claims_replay_counts_the_copy_once() {
        let line = bounty("2026-11-07T19:02:45Z", &[654300, 654300], "Turkish Galactic Empire");
        for on in [true, false] {
            let mut c = Claims::new();
            c.start(None, None);
            c.set_dedupe(on);
            c.feed(&line);
            c.feed(&line);
            assert_eq!(c.view()[0].as_i64().unwrap(), if on { 1_308_600 } else { 2_617_200 }, "dedupe {on}");
        }
    }

    fn temp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("gravitas_claims_{tag}_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn set_mtime(p: &Path, secs: u64) {
        let f = std::fs::OpenOptions::new().write(true).open(p).unwrap();
        f.set_modified(std::time::UNIX_EPOCH + std::time::Duration::from_secs(secs)).unwrap();
    }

    /// An antivirus touches an old Journal: its modified time is newer than the real newest. The order must stay the file names' order.
    #[test]
    fn the_older_journals_replay_in_file_name_order_not_by_modified_time() {
        let d = temp_dir("order");
        let head = r#"{"timestamp":"2026-11-20T10:00:00Z","event":"Fileheader","gameversion":"4.0.0.1"}"#;
        let cmdr = r#"{"timestamp":"2026-11-20T10:00:01Z","event":"Commander","Name":"X"}"#;
        let a = d.join("Journal.2026-11-20T100000.01.log");
        let b = d.join("Journal.2026-11-21T100000.01.log");
        std::fs::write(&a, format!("{head}
{cmdr}
{}
", bounty("2026-11-20T10:05:00Z", &[1000], "F"))).unwrap();
        std::fs::write(&b, format!("{head}
{cmdr}
{}
", r#"{"timestamp":"2026-11-21T10:05:00Z","event":"RedeemVoucher","Type":"bounty","Factions":[{"Faction":"F","Amount":1000}]}"#)).unwrap();
        // the OLD file looks newer by its modified time
        set_mtime(&a, 2_000_000_000);
        set_mtime(&b, 1_000_000_000);
        let (ev, _, _) = events_since_death(&d, None);
        let order: Vec<&str> = ev.iter().map(|e| e["event"].as_str().unwrap()).collect();
        assert_eq!(order, ["Bounty", "RedeemVoucher"]);
        let mut o = Owed::new();
        for e in &ev { o.feed(e); }
        assert_eq!(o.total(), 0, "bounty paid by the later voucher");
        // and the newest file (the live feed's) is the greatest name, whatever the times say
        assert_eq!(crate::journal::newest(&d).unwrap(), b);
        let _ = std::fs::remove_dir_all(&d);
    }

    /// The tester's case: two resets, then a restart. What is loaded from the store must give the same figure as the running app.
    #[test]
    fn two_resets_and_a_restart_give_the_same_claims() {
        let lines = [
            bounty("2026-11-25T15:00:00Z", &[5_000_000], "F"),
            bounty("2026-11-25T15:40:00Z", &[3_000_000], "F"),
            bounty("2026-11-25T16:10:00Z", &[400_000], "F"),
            bounty("2026-11-25T17:00:00Z", &[200_000], "F"),
        ];
        let run = |bases: &[&str]| {
            let mut c = Claims::new();
            c.start(None, None);
            for (i, l) in lines.iter().enumerate() {
                c.feed(l);
                if i == 1 { c.set_base(bases[0]); }
                if i == 2 && bases.len() > 1 { c.set_base(bases[1]); }
            }
            c.view()[0].as_i64().unwrap()
        };
        let running = run(&["2026-11-25T15:50:00Z", "2026-11-25T16:49:00Z"]);
        assert_eq!(running, 200_000, "only what came after the second reset");
        // a restart that loads the STALE first base would show the money between the resets again: this is what C1 prevents
        assert_eq!(run(&["2026-11-25T15:50:00Z"]), 600_000);
        // a restart that loads the later of the two stored copies equals the running figure
        let mut c = Claims::new();
        c.start(None, None);
        for l in &lines { c.feed(l); }
        let later = ["2026-11-25T15:50:00Z", "2026-11-25T16:49:00Z"].iter().max().unwrap().to_string();
        c.set_base(&later);
        assert_eq!(c.view()[0].as_i64().unwrap(), running);
    }

    fn ev(s: &str) -> Value { serde_json::from_str(s).unwrap() }

    /// claims_fix: WingJoin, Died, Bounty must still give the 7.5 % estimate; with the flag off it is the old plugin's loss.
    #[test]
    fn a_death_keeps_the_wing_state_only_with_the_fix() {
        for fix in [true, false] {
            let mut c = Claims::new();
            c.start(None, None);
            c.set_fix(fix);
            c.feed(&ev(r#"{"timestamp":"2026-11-25T10:00:00Z","event":"WingJoin","Others":["x"]}"#));
            c.feed(&ev(r#"{"timestamp":"2026-11-25T10:01:00Z","event":"Died"}"#));
            c.feed(&bounty("2026-11-25T10:02:00Z", &[143000], "A"));
            let v = c.view();
            assert_eq!(v[0].as_i64().unwrap(), 143000);
            assert_eq!(v[2].as_i64().unwrap(), if fix { 10725 } else { 0 }, "fix {fix}");
        }
    }

    /// the same over a restart: the death is in an older Journal (events_since_death), the wing line before it too
    #[test]
    fn the_wing_state_before_a_death_survives_in_the_older_journals() {
        let d = temp_dir("wingdeath");
        let head = r#"{"timestamp":"2026-11-20T10:00:00Z","event":"Fileheader","gameversion":"4.0.0.1"}"#;
        let cmdr = r#"{"timestamp":"2026-11-20T10:00:01Z","event":"Commander","Name":"X"}"#;
        let a = d.join("Journal.2026-11-20T100000.01.log");
        let b = d.join("Journal.2026-11-21T100000.01.log");
        std::fs::write(&a, format!("{head}
{cmdr}
{}
{}
{}
{}
", r#"{"timestamp":"2026-11-20T10:01:00Z","event":"WingJoin","Others":["x"]}"#, bounty("2026-11-20T10:02:00Z", &[1000], "B"), r#"{"timestamp":"2026-11-20T10:03:00Z","event":"Died"}"#, bounty("2026-11-20T10:04:00Z", &[143000], "A"))).unwrap();
        std::fs::write(&b, format!("{head}
{cmdr}
")).unwrap();
        for fix in [true, false] {
            let mut c = Claims::new();
            c.set_fix(fix);
            c.start(Some(&d), Some(&b));
            c.wait_for_old();
            let v = c.view();
            assert_eq!(v[0].as_i64().unwrap(), 143000);
            assert_eq!(v[2].as_i64().unwrap(), if fix { 10725 } else { 0 }, "fix {fix}");
        }
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn a_cash_in_a_little_below_the_balance_clears_it_only_with_the_fix() {
        for fix in [true, false] {
            let mut c = Claims::new();
            c.start(None, None);
            c.set_fix(fix);
            c.feed(&bounty("2026-11-25T10:00:00Z", &[1_000_000], "A"));
            c.feed(&json!({"timestamp":"2026-11-25T10:05:00Z","event":"RedeemVoucher","Type":"bounty","Factions":[{"Faction":"A","Amount":996000}]}));
            assert_eq!(c.view()[0].as_i64().unwrap(), if fix { 0 } else { 4000 }, "fix {fix}");
        }
    }

    #[test]
    fn restore_brings_back_everything_the_resets_took_away() {
        let mut c = Claims::new();
        c.start(None, None);
        c.feed(&bounty("2020-01-01T10:00:00Z", &[1000, 2500], "A"));
        c.feed(&bounty("2020-01-01T11:00:00Z", &[4000], "B"));
        let before = c.view()[0].as_i64().unwrap();
        assert_eq!(before, 7500);
        c.reset_at(1_900_000_000);
        std::thread::sleep(std::time::Duration::from_millis(5));
        c.reset_at(1_900_001_000);
        assert_eq!(c.view()[0].as_i64().unwrap(), 0, "after two resets nothing counts");
        assert_eq!(c.restore(), "", "no line any more");
        assert!(c.older().is_empty(), "the stack is gone too");
        assert_eq!(c.view()[0].as_i64().unwrap(), before, "Claims are worked out again, the same total as before the resets");
        assert_eq!(c.base_local(), "", "no reset note");
        // money earned after a restore counts as always
        c.feed(&bounty("2026-11-26T12:00:00Z", &[500], "A"));
        assert_eq!(c.view()[0].as_i64().unwrap(), before + 500);
    }

    #[test]
    fn undo_goes_back_one_reset_at_a_time() {
        let mut c = Claims::new();
        c.start(None, None);
        c.feed(&bounty("2020-01-01T10:00:00Z", &[1000], "A"));
        let a = c.reset_at(1_700_000_000);
        std::thread::sleep(std::time::Duration::from_millis(5));
        let b = c.reset_at(1_700_001_000);
        assert!(b > a);
        assert_eq!(c.undo_reset(), a, "back to the first reset");
        assert_eq!(c.base(), a);
        assert_eq!(c.undo_reset(), "", "then no line at all");
        assert_eq!(c.undo_reset(), "", "an empty stack clears (the old behaviour)");
        for i in 0..8 { c.reset_at(1_700_000_000 + i * 100); }
        assert_eq!(c.older().len(), 5, "only the last five are kept");
        let mut d = Claims::new();
        d.set_older(c.older().to_vec());
        assert_eq!(d.older(), c.older());
    }

    /// the reset line against stamps with an offset or a fraction: times, not text
    #[test]
    fn the_reset_line_compares_times_not_text() {
        let base = "2026-11-25T10:30:00Z";
        for (ts, counts) in [("2026-11-25T11:00:00+01:00", false), ("2026-11-25T11:45:00+01:00", true), ("2026-11-25T10:30:00.500Z", true), ("2026-11-25T10:29:59.900Z", false), ("2026-11-25T10:30:01Z", true), ("2026-11-25T10:30:00Z", false)] {
            let mut c = Claims::new();
            c.start(None, None);
            c.set_base(base);
            c.feed(&bounty(ts, &[1000], "A"));
            assert_eq!(c.view()[0].as_i64().unwrap() == 1000, counts, "{ts}");
        }
    }
}
