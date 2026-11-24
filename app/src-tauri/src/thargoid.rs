//! The Xeno Hunt: what the game's own files say about an Anti-Xeno fight, as two windows (the Thargoid card and the Xeno Hunt report).
//! Only what the game writes is shown: no Thargoid hull, shield or hearts exist in any file (checked on real Journals and the recorder's Status.json files).
//! A hunt starts at the first marker (Music Combat_Unknown / Unknown_Encounter, a Thargoid kill bond, SystemsShutdown, an attack after a "Nonhuman signal source"
//! drop), carries the drop's threat level, and ends when the music, the jump, the dock or a death says so (or the InDanger flag has been off for 30 s).
use crate::i18n::I18n;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::OnceLock;

pub const REPORT_S: f64 = 60.0;
const QUIET_S: f64 = 30.0;
/// after a hunt closed by its last kill, the game's music and the last hits that follow do not start a new one for this long
const CLOSED_QUIET_S: f64 = 20.0;
const IN_DANGER: u64 = 1 << 22;
/// Status.json's OverHeating flag (bit 20)
const OVERHEATING: u64 = 1 << 20;
/// a signal source drop counts for an attack or the music this long after it
const ARMED_S: f64 = 120.0;

const FILES: [(&str, &str); 6] = [
    ("en", include_str!("../lang_th/en.json")),
    ("de", include_str!("../lang_th/de.json")),
    ("es", include_str!("../lang_th/es.json")),
    ("fr", include_str!("../lang_th/fr.json")),
    ("pt-br", include_str!("../lang_th/pt-br.json")),
    ("ru", include_str!("../lang_th/ru.json")),
];

fn table() -> &'static HashMap<&'static str, Value> {
    static T: OnceLock<HashMap<&'static str, Value>> = OnceLock::new();
    T.get_or_init(|| FILES.iter().map(|(c, t)| (*c, serde_json::from_str(t).unwrap_or(Value::Null))).collect())
}

/// One sentence in the HUD's language (English where a translation is missing), {name} fields filled in.
pub(crate) fn tx(tr: &I18n, key: &str, vars: &[(&str, String)]) -> String {
    let t = table();
    let mut s = t.get(tr.language()).and_then(|v| v.get(key)).and_then(Value::as_str).or_else(|| t.get("en").and_then(|v| v.get(key)).and_then(Value::as_str)).unwrap_or(key).to_string();
    for (k, v) in vars {
        s = s.replace(&format!("{{{k}}}"), v);
    }
    s
}

fn s<'a>(e: &'a Value, k: &str) -> &'a str {
    e.get(k).and_then(Value::as_str).unwrap_or("")
}

pub fn dur(secs: f64) -> String {
    let n = secs.max(0.0).round() as i64;
    if n >= 3600 { format!("{}:{:02}:{:02}", n / 3600, n / 60 % 60, n % 60) } else { format!("{}:{:02}", n / 60, n % 60) }
}

fn money(v: i64) -> String {
    if v >= 1_000_000 { format!("{:.1}M", v as f64 / 1e6) } else if v >= 1000 { format!("{}k", v / 1000) } else { v.to_string() }
}

/// Which Thargoid a kill bond belongs to (the AXI wiki's figures: Scout 80k, Cyclops 8M, Orthrus 15M, Basilisk 24M, Medusa 40M, Hydra 60M).
pub fn kind_of(bond: i64) -> &'static str {
    match bond {
        0..=1_000_000 => "Scout",
        7_000_000..=9_000_000 => "Cyclops",
        14_000_000..=16_000_000 => "Orthrus",
        23_000_000..=25_000_000 => "Basilisk",
        39_000_000..=41_000_000 => "Medusa",
        59_000_000..=61_000_000 => "Hydra",
        _ => "Thargoid",
    }
}

#[derive(Clone, Default, Debug)]
pub struct Hunt {
    pub t0: f64,
    pub t1: f64,
    pub threat: i64,
    /// the big music (Unknown_Encounter) came with the drop: an Interceptor, not scouts
    pub big: bool,
    pub sys: String,
    pub kills: Vec<(f64, i64)>,
    pub hull: Vec<(f64, f64)>,
    pub shutdowns: Vec<f64>,
    pub attacks: Vec<f64>,
    pub heat: u32,
    /// HeatDamage events: the hull the heat took is written nowhere, so the hull steps are only what the game reported
    pub heat_dmg: Vec<f64>,
    pub loot: Vec<(String, i64)>,
    pub died: bool,
    /// the stretches Status.json said the ship was overheating (start, end), and the one still going
    pub heat_spans: Vec<(f64, f64)>,
    heat_on: Option<f64>,
    /// the build you flew, from the Loadout: "ship|hull reinforcements|caustic sink|neutraliser", and a hash of every module with its engineering (cosmetics left out)
    pub build: String,
    pub build_fp: String,
    last_t: f64,
}

impl Hunt {
    pub fn interceptor(&self) -> bool {
        self.big && self.threat >= 5
    }
    /// How many Thargoids this hunt brings, when the game's own signal tells (checked on 16 scout fights: threat 3 = 2 scouts, threat 4 = 4 scouts, always).
    pub fn expected(&self) -> Option<usize> {
        if self.big { return None; }
        match self.threat { 3 => Some(2), 4 => Some(4), _ => None }
    }
    /// Everything this hunt brings has been killed (the scouts of a threat 3/4 signal, or the Cyclops of a threat 5 one).
    fn complete(&self) -> bool {
        if let Some(n) = self.expected() {
            return self.kills.len() >= n && self.kills.iter().all(|k| kind_of(k.1) == "Scout");
        }
        self.interceptor() && self.threat == 5 && self.kills.iter().any(|k| kind_of(k.1) == "Cyclops")
    }
    fn bonds(&self) -> i64 {
        self.kills.iter().map(|k| k.1).sum()
    }
    /// Attack waves: UnderAttack lines more than 5 s apart (one wave writes 1 to 40 lines, the waves come about every 60 s).
    pub fn waves(&self) -> usize {
        let mut n = 0;
        let mut last = f64::NEG_INFINITY;
        for t in &self.attacks {
            if *t - last > 5.0 { n += 1; }
            last = *t;
        }
        n
    }
    /// The hull range the game's own 20 % steps allow, in percent: after a step of v the hull is above the step below it and not above v.
    /// No step at all means the hull never fell under 80 %. Checked on 12 real hunts: all 12 inside (a repair limpet can break it).
    pub fn hull_band(&self) -> (i64, i64) {
        match self.hull.last() {
            None => (80, 100),
            Some(&(_, v)) => {
                let b = ((v / 0.2) - 0.01).ceil() * 20.0;
                let hi = (v * 100.0).min(b).round().max(0.0);
                let lo = (b - 20.0).max(0.0);
                (lo as i64, hi as i64)
            }
        }
    }
    /// Seconds spent overheating (the game's own flag), counting the stretch that is still going.
    pub fn heat_secs(&self, now: f64) -> f64 {
        self.heat_spans.iter().map(|s| (s.1 - s.0).max(0.0)).sum::<f64>() + self.heat_on.map(|t| (now - t).max(0.0)).unwrap_or(0.0)
    }

    /// The record kept in Past Thargoid (hunts.json): the same shape as a fight there (ep.t0 in ms), plus the hunt itself.
    pub fn to_value(&self) -> Value {
        json!({"ep": {"t0": (self.t0 * 1000.0).round() as i64, "sys": self.sys, "n": self.kills.len(), "cr": self.bonds()}, "fav": false,
            "hunt": {"t0": self.t0, "t1": self.t1, "threat": self.threat, "big": self.big, "sys": self.sys, "died": self.died, "heat": self.heat, "heat_dmg": self.heat_dmg, "build": self.build, "build_fp": self.build_fp,
                "kills": self.kills.iter().map(|k| json!([k.0, k.1])).collect::<Vec<_>>(),
                "hull": self.hull.iter().map(|k| json!([k.0, k.1])).collect::<Vec<_>>(),
                "shutdowns": self.shutdowns, "attacks": self.attacks,
                "heat_spans": self.heat_spans.iter().map(|k| json!([k.0, k.1])).collect::<Vec<_>>(),
                "loot": self.loot.iter().map(|l| json!([l.0, l.1])).collect::<Vec<_>>()}})
    }

    pub fn from_value(v: &Value) -> Option<Hunt> {
        let h = v.get("hunt")?;
        let f = |k: &str| h.get(k).and_then(Value::as_f64).unwrap_or(0.0);
        let pairs = |k: &str| -> Vec<(f64, f64)> { h.get(k).and_then(Value::as_array).map(|a| a.iter().filter_map(|p| Some((p.get(0)?.as_f64()?, p.get(1)?.as_f64()?))).collect()).unwrap_or_default() };
        let times = |k: &str| -> Vec<f64> { h.get(k).and_then(Value::as_array).map(|a| a.iter().filter_map(Value::as_f64).collect()).unwrap_or_default() };
        Some(Hunt {
            t0: f("t0"), t1: f("t1"), threat: h.get("threat").and_then(Value::as_i64).unwrap_or(0), big: h.get("big").and_then(Value::as_bool).unwrap_or(false),
            sys: h.get("sys").and_then(Value::as_str).unwrap_or("").to_string(),
            kills: pairs("kills").into_iter().map(|p| (p.0, p.1 as i64)).collect(), hull: pairs("hull"), shutdowns: times("shutdowns"), attacks: times("attacks"),
            heat: h.get("heat").and_then(Value::as_u64).unwrap_or(0) as u32, heat_dmg: h.get("heat_dmg").and_then(Value::as_array).map(|a| a.iter().filter_map(Value::as_f64).collect()).unwrap_or_default(), heat_spans: pairs("heat_spans"), heat_on: None,
            loot: h.get("loot").and_then(Value::as_array).map(|a| a.iter().filter_map(|p| Some((p.get(0)?.as_str()?.to_string(), p.get(1)?.as_i64()?))).collect()).unwrap_or_default(),
            died: h.get("died").and_then(Value::as_bool).unwrap_or(false), last_t: f("t1"),
            build: h.get("build").and_then(Value::as_str).unwrap_or("").to_string(), build_fp: h.get("build_fp").and_then(Value::as_str).unwrap_or("").to_string(),
        })
    }
}

/// "krait_mkii" -> "Krait Mk II"
pub(crate) fn ship_name(id: &str) -> String {
    id.split('_').map(|w| match w {
        "mkii" => "Mk II".to_string(), "mkiii" => "Mk III".to_string(), "mkiv" => "Mk IV".to_string(), "mkv" => "Mk V".to_string(),
        _ => { let mut c = w.chars(); c.next().map(|f| f.to_uppercase().collect::<String>() + c.as_str()).unwrap_or_default() }
    }).collect::<Vec<_>>().join(" ")
}

/// +0:50 / -0:06
fn sdur(x: f64) -> String {
    if x.abs() < 1.0 { "0:00".to_string() } else { format!("{}{}", if x < 0.0 { "-" } else { "+" }, dur(x.abs())) }
}

/// What the report says about a hunt against the ones kept in Past Thargoid.
struct Ctx {
    /// this hunt's time minus the average of your last 20 like hunts (same threat), when there are 2 or more
    vs: Option<f64>,
    build_n: usize,
    build_avg: f64,
    gap: Option<f64>,
    ses_n: usize,
    ses_bonds: i64,
    ses_shut: usize,
    ses_avg: f64,
    per_hour: Option<f64>,
}

fn context(h: &Hunt, past: &[Hunt]) -> Ctx {
    let secs = |x: &Hunt| (x.t1 - x.t0).max(0.0);
    let like: Vec<&Hunt> = past.iter().filter(|p| p.t0 != h.t0 && p.big == h.big && p.threat == h.threat && !p.kills.is_empty() && !p.died && p.t1 > p.t0).take(20).collect();
    let vs = if like.len() >= 2 { Some(secs(h) - like.iter().map(|p| secs(p)).sum::<f64>() / like.len() as f64) } else { None };
    let same: Vec<&&Hunt> = like.iter().filter(|p| !h.build_fp.is_empty() && p.build_fp == h.build_fp).collect();
    let build_avg = if same.is_empty() { 0.0 } else { same.iter().map(|p| secs(p)).sum::<f64>() / same.len() as f64 };
    let gap = past.iter().filter(|p| p.t0 != h.t0 && p.t1 > 0.0 && p.t1 <= h.t0).map(|p| h.t0 - p.t1).fold(None, |m: Option<f64>, g| Some(m.map_or(g, |m| m.min(g))));
    // the session: this hunt and the ones before it, each less than 30 minutes after the one before
    let mut prior: Vec<&Hunt> = past.iter().filter(|p| p.t0 < h.t0 && p.t1 > p.t0).collect();
    prior.sort_by(|a, b| b.t1.partial_cmp(&a.t1).unwrap_or(std::cmp::Ordering::Equal));
    let mut chain: Vec<&Hunt> = vec![h];
    let mut start = h.t0;
    for p in prior {
        let g = start - p.t1;
        if g >= 1800.0 { break; }
        if g < -1.0 { continue; }
        chain.push(p);
        start = p.t0;
    }
    let bonds: i64 = chain.iter().map(|x| x.bonds()).sum();
    let per_hour = if chain.len() >= 2 && h.t1 > start { Some(bonds as f64 / ((h.t1 - start) / 3600.0)) } else { None };
    Ctx { vs, build_n: same.len(), build_avg, gap, ses_n: chain.len(), ses_bonds: bonds, ses_shut: chain.iter().filter(|x| !x.shutdowns.is_empty()).count(),
        ses_avg: chain.iter().map(|x| secs(x)).sum::<f64>() / chain.len() as f64, per_hour }
}

#[derive(Clone, Copy, Debug)]
struct Armed {
    t: f64,
    threat: i64,
    big: bool,
}

#[derive(Default)]
pub struct Th {
    armed: Option<Armed>,
    pub cur: Option<Hunt>,
    pub last: Option<Hunt>,
    pub report_until: f64,
    danger_seen: bool,
    danger_off: Option<f64>,
    sys: String,
    /// when the last hunt was closed by its own last kill (the Interceptor's music plays 2-3 s after it and must not start a new hunt)
    closed_at: f64,
    /// hunts that ended with something to keep (the caller takes them for Past Thargoid)
    pub finished: Vec<Hunt>,
    /// where each hunt of this run began and ended, to tell a Combat fight that was really a hunt
    spans: Vec<(f64, f64)>,
    /// the build of the last Loadout line (the hunts take it when they begin)
    build: String,
    build_fp: String,
    /// the hunts kept in Past Thargoid, newest first (the report compares with them)
    pub past: Vec<Hunt>,
    pub past_ok: bool,
}

impl Th {
    pub fn active(&self) -> bool {
        self.cur.is_some()
    }

    fn engage(&mut self, now: f64) -> &mut Hunt {
        if self.cur.is_none() {
            let a = self.armed.filter(|a| now - a.t < ARMED_S);
            let t0 = a.map(|a| a.t).unwrap_or(now);
            self.cur = Some(Hunt { t0, threat: a.map(|a| a.threat).unwrap_or(0), big: a.map(|a| a.big).unwrap_or(false), sys: self.sys.clone(), last_t: now, build: self.build.clone(), build_fp: self.build_fp.clone(), ..Default::default() });
            self.danger_seen = false;
            self.danger_off = None;
        }
        let h = self.cur.as_mut().unwrap();
        h.last_t = now;
        h
    }

    fn end(&mut self, now: f64) {
        if let Some(mut h) = self.cur.take() {
            h.t1 = now;
            if let Some(t) = h.heat_on.take() { h.heat_spans.push((t, now)); }
            self.spans.push((h.t0, now));
            if self.spans.len() > 40 { self.spans.remove(0); }
            if !h.kills.is_empty() || !h.shutdowns.is_empty() || h.died { self.finished.push(h.clone()); }
            self.report_until = now + REPORT_S;
            self.last = Some(h);
            self.armed = None;
        }
    }

    /// The Loadout line: which build you fly (ship, hull reinforcements, caustic sink, neutraliser) and a hash of every module with its engineering.
    pub fn note_loadout(&mut self, e: &Value) {
        let ship = s(e, "Ship");
        let mut parts: Vec<String> = Vec::new();
        let (mut hrp, mut sink, mut sfn) = (0, false, false);
        for m in e.get("Modules").and_then(Value::as_array).into_iter().flatten() {
            let slot = s(m, "Slot");
            if ["PaintJob", "Decal", "WeaponColour", "EngineColour", "VesselVoice", "ShipCockpit", "CargoHatch", "ShipKit", "Bobble", "Nameplate", "String"].iter().any(|p| slot.starts_with(p)) { continue; }
            let item = s(m, "Item");
            if item.contains("hullreinforcement") { hrp += 1; }
            if item.contains("causticsink") { sink = true; }
            if item.contains("antiunknownshutdown") { sfn = true; }
            let g = m.get("Engineering");
            parts.push(format!("{}|{}|{}|{}", slot, item, g.map(|g| s(g, "BlueprintName")).unwrap_or(""), g.map(|g| s(g, "ExperimentalEffect")).unwrap_or("")));
        }
        if ship.is_empty() || parts.is_empty() { return; }
        parts.sort();
        let mut hsh: u64 = 0xcbf29ce484222325;
        for b in ship.bytes().chain(parts.join(";").bytes()) { hsh ^= b as u64; hsh = hsh.wrapping_mul(0x100000001b3); }
        self.build = format!("{}|{}|{}|{}", ship, hrp, sink as u8, sfn as u8);
        self.build_fp = format!("{:x}", hsh);
    }

    /// One Journal line that just came (not the catch-up of the old ones).
    pub fn feed(&mut self, e: &Value, now: f64) {
        let ev = s(e, "event");
        match ev {
            "FSDJump" | "Location" | "CarrierJump" => {
                if !s(e, "StarSystem").is_empty() { self.sys = s(e, "StarSystem").to_string(); }
                if ev != "Location" { self.end(now); self.armed = None; }
            }
            "SupercruiseExit" => {
                // (the drop names the system: the hunt knows where it was even when the app opened after the last jump)
                if !s(e, "StarSystem").is_empty() { self.sys = s(e, "StarSystem").to_string(); }
            }
            "SupercruiseEntry" | "StartJump" | "Docked" | "LoadGame" | "Shutdown" => { self.end(now); self.armed = None; }
            "Died" => {
                if let Some(h) = self.cur.as_mut() { h.died = true; }
                self.end(now);
            }
            "USSDrop" if s(e, "USSType").contains("NonHuman") => {
                if self.cur.is_none() {
                    self.armed = Some(Armed { t: now, threat: e.get("USSThreat").and_then(Value::as_i64).unwrap_or(0), big: false });
                }
            }
            "Music" => match s(e, "MusicTrack") {
                "Unknown_Encounter" | "Combat_Unknown" if self.cur.is_none() && now - self.closed_at < CLOSED_QUIET_S => {}
                "Unknown_Encounter" => {
                    if let Some(a) = self.armed.as_mut().filter(|a| now - a.t < 15.0 && self.cur.is_none()) { a.big = true; }
                    self.engage(now);
                }
                "Combat_Unknown" => { self.engage(now); }
                "Exploration" | "Supercruise" | "DestinationFromSupercruise" | "Docking" | "Starport" | "MainMenu" | "CQCMenu" => self.end(now),
                "Unknown_Exploration" => {
                    // (it also plays at a drop, before anything has happened: it ends a hunt only after a kill)
                    if self.cur.as_ref().is_some_and(|h| !h.kills.is_empty()) { self.end(now); }
                }
                _ => {}
            },
            "UnderAttack" => {
                if self.cur.is_some() || self.armed.is_some_and(|a| now - a.t < ARMED_S) {
                    self.engage(now).attacks.push(now);
                }
            }
            "SystemsShutdown" => self.engage(now).shutdowns.push(now),
            "FactionKillBond" if s(e, "VictimFaction").contains("Thargoid") => {
                let r = e.get("Reward").and_then(Value::as_i64).unwrap_or(0);
                let h = self.engage(now);
                h.kills.push((now, r));
                // the last kill the signal promised ends the hunt at once: the report comes now, not a minute later
                if h.complete() {
                    self.closed_at = now;
                    self.end(now);
                }
            }
            "HullDamage" => {
                if e.get("PlayerPilot").and_then(Value::as_bool).unwrap_or(false) && !e.get("Fighter").and_then(Value::as_bool).unwrap_or(false) {
                    if let (Some(h), Some(v)) = (self.cur.as_mut(), e.get("Health").and_then(Value::as_f64)) {
                        h.hull.push((now, v));
                        h.last_t = now;
                    }
                }
            }
            "HeatDamage" => {
                if let Some(h) = self.cur.as_mut() { h.heat_dmg.push(now); }
            }
            "HeatWarning" => {
                if let Some(h) = self.cur.as_mut() { h.heat += 1; }
            }
            "MaterialCollected" => {
                if let Some(h) = self.cur.as_mut() {
                    let name = if s(e, "Name_Localised").is_empty() { s(e, "Name") } else { s(e, "Name_Localised") }.to_string();
                    let n = e.get("Count").and_then(Value::as_i64).unwrap_or(1);
                    match h.loot.iter_mut().find(|l| l.0 == name) { Some(l) => l.1 += n, None => h.loot.push((name, n)) }
                }
            }
            _ => {}
        }
    }

    /// Status.json's Flags: InDanger is the game's own "hostiles about".
    pub fn status(&mut self, flags: u64, now: f64) {
        let Some(h) = self.cur.as_mut() else { return };
        match (flags & OVERHEATING != 0, h.heat_on) {
            (true, None) => h.heat_on = Some(now),
            (false, Some(t)) => { h.heat_spans.push((t, now)); h.heat_on = None; }
            _ => {}
        }
        if flags & IN_DANGER != 0 {
            self.danger_seen = true;
            self.danger_off = None;
            h.last_t = now;
        } else if self.danger_seen && self.danger_off.is_none() {
            self.danger_off = Some(now);
        }
    }

    /// A Combat fight that ran between these two moments (seconds) was a Xeno Hunt: Past Thargoid keeps it, not Past combats.
    pub fn overlaps(&self, from: f64, to: f64) -> bool {
        if self.cur.as_ref().is_some_and(|h| h.t0 <= to + 5.0) { return true; }
        self.spans.iter().any(|s| s.0 <= to + 5.0 && s.1 >= from - 5.0)
    }

    /// A hunt is going or ended within this many seconds (the Combat fight that follows a hunt is its tail, not a fight of its own).
    pub fn recent(&self, now: f64, within: f64) -> bool {
        self.cur.is_some() || self.spans.last().is_some_and(|s| now - s.1 < within)
    }

    /// A kept hunt shown on the HUD again for 20 s.
    pub fn show(&mut self, h: Hunt, now: f64) {
        self.last = Some(h);
        self.report_until = now + 20.0;
    }

    /// Every look: a hunt whose danger flag has been off for a while, with nothing happening, is over.
    pub fn tick(&mut self, now: f64) {
        if let (Some(h), Some(off)) = (self.cur.as_ref(), self.danger_off) {
            if now - off >= QUIET_S && now - h.last_t >= QUIET_S {
                self.end(now);
            }
        }
    }

    // -------------------------------------------------------------------------------------------- the windows

    fn exp_text(tr: &I18n, h: &Hunt) -> String {
        let k = if h.threat <= 0 { return String::new() }
            else if h.big { format!("th.exp.b{}", h.threat.clamp(5, 9)) }
            else { match h.threat { 3 => "th.exp.s3".into(), 4 => "th.exp.s4".into(), 5.. => "th.exp.s5".into(), _ => "th.exp.sx".into() } };
        tx(tr, &k, &[])
    }

    /// "2/4" while the signal's promise is known (scouts), else just the count.
    fn kills_text(h: &Hunt) -> String {
        match h.expected() { Some(n) => format!("{}/{}", h.kills.len(), n), None => h.kills.len().to_string() }
    }

    /// "2" warnings, and how long the ship was really overheating (the game's own flag) once it was.
    fn heat_text(h: &Hunt, now: f64) -> String {
        let secs = h.heat_secs(now);
        if secs >= 1.0 { format!("{} · {}", h.heat, dur(secs)) } else { h.heat.to_string() }
    }

    fn kill_rows(h: &Hunt) -> Vec<Value> {
        h.kills.iter().map(|(t, b)| json!([format!("+{}", money(*b)), kind_of(*b), format!("{}", dur(*t - h.t0))])).collect()
    }

    /// The live Thargoid card (it takes the place of Targets by value while Thargoids are about).
    pub fn card(&self, tr: &I18n, now: f64) -> Option<Value> {
        let h = self.cur.as_ref()?;
        let (lo, hi) = h.hull_band();
        let hull = ((lo + hi) as f64 / 2.0).round();
        let what = Self::exp_text(tr, h);
        let head2 = if h.threat > 0 { tx(tr, "th.head.sig", &[("n", h.threat.to_string()), ("what", what)]) } else { tx(tr, "th.head.none", &[]) };
        let tiles = vec![
            json!([tx(tr, "th.tile.time", &[]), dur(now - h.t0)]),
            json!([tx(tr, "th.tile.kills", &[]), Self::kills_text(h)]),
            json!([tx(tr, "th.tile.bonds", &[]), money(h.bonds())]),
            json!([tx(tr, "th.tile.hits", &[]), h.waves().to_string()]),
            json!([tx(tr, "th.tile.shut", &[]), h.shutdowns.len().to_string()]),
            json!([tx(tr, "th.tile.heat", &[]), Self::heat_text(h, now)]),
        ];
        let mut sections = Vec::new();
        let kr = Self::kill_rows(h);
        if !kr.is_empty() { sections.push(json!([tx(tr, "th.sec.kills", &[]), "feed", kr])); }
        let hr: Vec<Value> = h.hull.iter().rev().take(4).rev().map(|(t, v)| json!([format!("{} %", (v * 100.0).round() as i64), tx(tr, "th.at", &[("t", dur(*t - h.t0))]), ""])).collect();
        if !hr.is_empty() { sections.push(json!([tx(tr, "th.sec.hull", &[]), "feed", hr])); }
        Some(json!({"kind": "card", "title": tx(tr, "th.title", &[]), "head2": head2, "badge": [tx(tr, "th.badge.on", &[]), "red"],
            "bars": if h.hull.is_empty() { Vec::<Value>::new() } else { vec![json!([tx(tr, "th.bar.est", &[("lo", lo.to_string()), ("hi", hi.to_string())]), hull])] }, "tiles": tiles, "sections": sections, "note": tx(tr, "th.note", &[])}))
    }

    /// The Xeno Hunt report: shown for a minute after the hunt.
    pub fn report(&self, tr: &I18n, now: f64) -> Option<Value> {
        let h = self.last.as_ref()?;
        if now >= self.report_until { return None; }
        Some(Self::report_card(tr, h, Some((self.report_until - now).ceil().max(0.0) as i64), &self.past))
    }

    fn report_card(tr: &I18n, h: &Hunt, count: Option<i64>, past: &[Hunt]) -> Value {
        let secs = (h.t1 - h.t0).max(0.0);
        let (lo, hi) = h.hull_band();
        let cx = context(h, past);
        let tiles = vec![
            json!([tx(tr, "th.tile.time", &[]), dur(secs)]),
            json!([tx(tr, "th.tile.kills", &[]), Self::kills_text(h)]),
            json!([tx(tr, "th.tile.bonds", &[]), money(h.bonds())]),
            json!([tx(tr, "th.tile.hits", &[]), h.waves().to_string()]),
            json!([tx(tr, "th.tile.shut", &[]), h.shutdowns.len().to_string()]),
            json!([tx(tr, "th.tile.low", &[]), format!("{}-{} %", lo, hi)]),
            json!([tx(tr, "th.tile.vs", &[]), cx.vs.map(sdur).unwrap_or_else(|| "-".to_string())]),
            json!([tx(tr, "th.tile.hour", &[]), cx.per_hour.map(|p| tx(tr, "th.per_h", &[("m", money(p.round() as i64))])).unwrap_or_else(|| "-".to_string())]),
            json!([tx(tr, "th.tile.gap", &[]), cx.gap.filter(|g| *g < 10800.0).map(dur).unwrap_or_else(|| "-".to_string())]),
        ];
        let mut sections = Vec::new();
        let kr = Self::kill_rows(h);
        sections.push(json!([tx(tr, "th.sec.kills", &[]), "feed", if kr.is_empty() { vec![json!(["", tx(tr, "th.nokills", &[]), ""])] } else { kr }]));
        let mut tl: Vec<(f64, String)> = Vec::new();
        if let Some(k) = h.kills.first() { tl.push((k.0 - h.t0, tx(tr, "th.line.first", &[]))); }
        for t in &h.shutdowns { tl.push((*t - h.t0, tx(tr, "th.line.shut", &[]))); }
        for (t, v) in &h.hull { tl.push((*t - h.t0, tx(tr, "th.line.hull", &[("p", ((v * 100.0).round() as i64).to_string())]))); }
        {
            let spans: Vec<&(f64, f64)> = h.heat_spans.iter().filter(|s| s.1 - s.0 >= 1.0).collect();
            if let Some(f) = spans.first() {
                let hot: f64 = spans.iter().map(|s| s.1 - s.0).sum();
                tl.push((f.0 - h.t0, tx(tr, "th.line.hot", &[("t", dur(hot)), ("n", spans.len().to_string())])));
            }
        }
        if let Some(t) = h.heat_dmg.first() { tl.push((*t - h.t0, tx(tr, "th.line.hd", &[]))); }
        tl.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
        let rows: Vec<Value> = tl.iter().take(10).map(|(t, l)| json!([dur(*t), l, ""])).collect();
        if !rows.is_empty() { sections.push(json!([tx(tr, "th.sec.time", &[]), "feed", rows])); }
        let mut bs: Vec<Value> = Vec::new();
        let bp: Vec<&str> = h.build.split('|').collect();
        if bp.len() == 4 {
            let mut parts = vec![ship_name(bp[0])];
            if bp[1] != "0" { parts.push(tx(tr, "th.build.hrp", &[("n", bp[1].to_string())])); }
            if bp[2] == "1" { parts.push(tx(tr, "th.build.sink", &[])); }
            if bp[3] == "1" { parts.push(tx(tr, "th.build.sfn", &[])); }
            bs.push(json!(["", parts.join(" \u{b7} "), ""]));
            if cx.build_n >= 2 { bs.push(json!([dur(cx.build_avg), tx(tr, "th.build.avg", &[("n", cx.build_n.to_string())]), ""])); }
        }
        if cx.ses_n >= 2 {
            bs.push(json!([cx.ses_n.to_string(), tx(tr, "th.ses.line", &[("b", money(cx.ses_bonds)), ("s", cx.ses_shut.to_string()), ("a", dur(cx.ses_avg))]), ""]));
        }
        if !bs.is_empty() { sections.push(json!([tx(tr, "th.sec.bs", &[]), "feed", bs])); }
        let (word, tone) = if h.died { (tx(tr, "th.rep.lost", &[]), "red") } else { (tx(tr, "th.rep.done", &[]), "green") };
        let mut card = json!({"kind": "card", "wide": true, "title": tx(tr, "th.rep.title", &[]), "head": if h.sys.is_empty() { Value::Null } else { json!(h.sys) },
            "head2": if h.threat > 0 { tx(tr, "th.head.sig", &[("n", h.threat.to_string()), ("what", Self::exp_text(tr, h))]) } else { String::new() },
            "badge": [word, tone], "tiles": tiles, "sections": sections});
        if let Some(n) = count { card["count"] = json!([tx(tr, "th.rep.count", &[]), n, tx(tr, "th.unit.s", &[])]); }
        card
    }

    /// One kept hunt as a line of the Past Thargoid list: place, what was killed, how long, bonds.
    pub fn line_of(v: &Value) -> String {
        let Some(h) = Hunt::from_value(v) else { return String::new() };
        let mut kinds: Vec<(&str, usize)> = Vec::new();
        for k in &h.kills { let n = kind_of(k.1); match kinds.iter_mut().find(|x| x.0 == n) { Some(x) => x.1 += 1, None => kinds.push((n, 1)) } }
        let what = if kinds.is_empty() { "-".to_string() } else { kinds.iter().map(|(n, c)| if *c > 1 { format!("{c} {n}") } else { n.to_string() }).collect::<Vec<_>>().join(", ") };
        format!("{} · {} · {} · {}", if h.sys.is_empty() { "?" } else { &h.sys }, what, dur((h.t1 - h.t0).max(0.0)), money(h.bonds()))
    }

    /// A kept hunt as text: (what the Past Thargoid page shows, what Copy for Discord copies).
    pub fn texts_of(tr: &I18n, v: &Value, past: &[Hunt]) -> Option<(String, String)> {
        let h = Hunt::from_value(v)?;
        let m = Self::report_card(tr, &h, None, past);
        let g = |k: &str| m.get(k).and_then(Value::as_str).unwrap_or("").to_string();
        let mut out = vec![format!("{} {}", g("title"), g("head")).trim().to_string()];
        if !g("head2").is_empty() { out.push(g("head2")); }
        out.push(String::new());
        for t in m["tiles"].as_array().into_iter().flatten() { out.push(format!("{}: {}", t[0].as_str().unwrap_or(""), t[1].as_str().unwrap_or(""))); }
        for sec in m["sections"].as_array().into_iter().flatten() {
            out.push(String::new());
            out.push(sec[0].as_str().unwrap_or("").to_string());
            for r in sec[2].as_array().into_iter().flatten() {
                let c: Vec<&str> = (0..3).filter_map(|i| r[i].as_str()).filter(|x| !x.is_empty()).collect();
                out.push(format!("    {}", c.join("  ")));
            }
        }
        let body = out.join("\n");
        let text = format!("GRAVITAS {}\ngravitasmap.com\n\n{}", out[0], out[1..].join("\n").trim_start());
        Some((body, text))
    }

    /// Made-up hunt for Edit HUD and Preview.
    pub fn sample(now: f64) -> Th {
        let h = Hunt { t0: now - 190.0, t1: now, threat: 5, big: true, sys: "Asterope".into(), kills: vec![(now - 30.0, 8_000_000)], hull: vec![(now - 120.0, 0.8), (now - 60.0, 0.6)],
            shutdowns: vec![(now - 8.0)], attacks: vec![now - 150.0, now - 120.0, now - 90.0, now - 60.0, now - 30.0], heat: 2, heat_dmg: vec![now - 100.0], loot: vec![("Ship Flight Data".into(), 3)], died: false, heat_spans: vec![(now - 110.0, now - 70.0)], heat_on: None, build: String::new(), build_fp: String::new(), last_t: now };
        Th { cur: Some(h.clone()), last: Some(h), report_until: now + 30.0, ..Default::default() }
    }

    /// The model of one of the two windows (key "thargoid" or "xenoreport").
    pub fn model(&self, tr: &I18n, key: &str, now: f64) -> Option<Value> {
        match key {
            "thargoid" => self.card(tr, now),
            "xenoreport" => self.report(tr, now),
            _ => None,
        }
    }
}

pub fn is_key(k: &str) -> bool {
    matches!(k, "thargoid" | "xenoreport")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn replay(path: &Path) -> Option<Th> {
        let text = std::fs::read_to_string(path).ok()?;
        let mut th = Th::default();
        let mut flags = 0u64;
        for l in text.lines() {
            let Ok(o) = serde_json::from_str::<Value>(l) else { continue };
            let now = o.get("wall").and_then(Value::as_f64).unwrap_or(0.0);
            match o.get("kind").and_then(Value::as_str) {
                Some("journal") => th.feed(&o["e"], now),
                Some("status") => {
                    flags = o["status"].get("Flags").and_then(Value::as_u64).unwrap_or(flags);
                    th.status(flags, now);
                    th.tick(now);
                }
                _ => {}
            }
        }
        Some(th)
    }

    #[test]
    fn the_cyclops_fight_makes_one_hunt() {
        let p = Path::new("../../research/thargoid-logs/thargoid-20261117-143810.jsonl");
        let Some(th) = replay(p) else { eprintln!("recording not here, skipped"); return };
        let h = th.last.as_ref().expect("the hunt ended and was kept");
        assert!(th.cur.is_none());
        assert_eq!(h.threat, 5);
        assert!(h.big && h.interceptor());
        assert_eq!(h.kills.len(), 1);
        assert_eq!(h.kills[0].1, 8_000_000);
        assert_eq!(h.shutdowns.len(), 1);
        assert_eq!(h.hull.len(), 2);
        assert!(h.attacks.len() >= 5);
        let secs = h.t1 - h.t0;
        assert!((330.0..440.0).contains(&secs), "hunt length {secs}");
        // the pictures of it
        let tr = I18n::new("en");
        let mut th2 = Th { last: th.last.clone(), report_until: h.t1 + 60.0, ..Default::default() };
        assert!(th2.report(&tr, h.t1 + 1.0).is_some());
        th2.cur = th.last.clone();
        assert!(th2.card(&tr, h.t1).is_some());
    }

    /// every hunt that ended in a replay, in order
    fn hunts_of(path: &Path) -> Option<Vec<Hunt>> {
        let text = std::fs::read_to_string(path).ok()?;
        let mut th = Th::default();
        let (mut flags, mut out, mut seen) = (0u64, Vec::new(), f64::MIN);
        for l in text.lines() {
            let Ok(o) = serde_json::from_str::<Value>(l) else { continue };
            let now = o.get("wall").and_then(Value::as_f64).unwrap_or(0.0);
            match o.get("kind").and_then(Value::as_str) {
                Some("journal") => th.feed(&o["e"], now),
                Some("status") => {
                    flags = o["status"].get("Flags").and_then(Value::as_u64).unwrap_or(flags);
                    th.status(flags, now);
                    th.tick(now);
                }
                _ => {}
            }
            if let Some(h) = th.last.as_ref().filter(|h| h.t1 > seen) { seen = h.t1; out.push(h.clone()); }
        }
        Some(out)
    }

    #[test]
    fn a_cyclops_hunt_ends_at_its_kill_and_the_music_after_it_starts_nothing() {
        for name in ["thargoid-20261117-143810.jsonl", "thargoid-20261117-173018.jsonl"] {
            let Some(hs) = hunts_of(&Path::new("../../research/thargoid-logs").join(name)) else { eprintln!("{name} not here, skipped"); continue };
            assert_eq!(hs.len(), 1, "{name}: one hunt, not {}", hs.len());
            let h = &hs[0];
            assert_eq!(h.kills.len(), 1);
            assert_eq!(h.t1, h.kills[0].0, "{name}: the hunt ends at the kill");
            assert!(h.interceptor() && h.expected().is_none());
        }
    }

    #[test]
    fn overheating_is_timed_from_the_status_flag_and_the_hunt_is_kept_and_told_by_name() {
        let tr = I18n::new("en");
        let mut th = Th::default();
        th.feed(&serde_json::json!({"event": "USSDrop", "USSType": "$USS_Type_NonHuman;", "USSThreat": 5}), 100.0);
        th.feed(&serde_json::json!({"event": "Music", "MusicTrack": "Unknown_Encounter"}), 101.0);
        th.feed(&serde_json::json!({"event": "Music", "MusicTrack": "Combat_Unknown"}), 120.0);
        th.status(IN_DANGER, 121.0);
        th.status(IN_DANGER | OVERHEATING, 130.0);
        th.status(IN_DANGER | OVERHEATING, 150.0);
        th.status(IN_DANGER, 170.0); // 40 s hot
        th.status(IN_DANGER | OVERHEATING, 300.0);
        th.feed(&serde_json::json!({"event": "SystemsShutdown"}), 310.0);
        assert!((th.cur.as_ref().unwrap().heat_secs(320.0) - 60.0).abs() < 1e-9, "40 s closed + 20 s still going");
        assert!(th.card(&tr, 320.0).unwrap().to_string().contains("0 \u{b7} 1:00"), "the card shows the warnings and the time");
        th.feed(&serde_json::json!({"event": "FactionKillBond", "Reward": 8_000_000, "VictimFaction": "$faction_Thargoid;"}), 330.0);
        assert!(th.cur.is_none(), "a Cyclops kill closes the hunt");
        assert_eq!(th.finished.len(), 1);
        let h = th.finished.remove(0);
        assert_eq!(h.heat_spans.len(), 2);
        assert!((h.heat_secs(999.0) - 70.0).abs() < 1e-9, "the open stretch was closed at the end: 40 + 30");
        // kept and read back
        let v = h.to_value();
        let back = Hunt::from_value(&v).unwrap();
        assert_eq!(back.kills, h.kills);
        assert_eq!(back.heat_spans, h.heat_spans);
        assert_eq!(back.shutdowns, h.shutdowns);
        assert!(Th::line_of(&v).contains("Cyclops"), "named by its bond: {}", Th::line_of(&v));
        let (details, text) = Th::texts_of(&tr, &v, &[]).unwrap();
        assert!(details.contains("Cyclops") && details.contains("Overheating 1:10"), "{details}");
        assert!(text.starts_with("GRAVITAS ") && text.contains("gravitasmap.com"));
        // a Combat fight that ran inside this hunt is the hunt's, one after it is not
        assert!(th.overlaps(105.0, 400.0));
        assert!(!th.overlaps(1000.0, 1100.0));
    }

    /// Seconds from a Journal time stamp (only differences matter).
    fn secs_of(ts: &str) -> f64 {
        let p: Vec<f64> = ts[11..19].split(':').map(|x| x.parse().unwrap()).collect();
        1_794_960_000.0 + p[0] * 3600.0 + p[1] * 60.0 + p[2] // (the real clock of 18 Nov 2026, 00:00 UTC: the engine reads the Journal's own time stamps)
    }

    #[derive(Default)]
    struct Seen { modes: Vec<crate::host::Mode>, cards: Vec<String>, combat_report: bool, xeno_report: bool }

    /// One look of the 250 ms loop, at this second of the fake clock.
    fn look(host: &mut crate::host::Host, at: f64, seen: &mut Seen) {
        host.eng.set_now((at * 1000.0) as i64);
        let t = host.draw(at);
        if seen.modes.last() != Some(&host.mode) { seen.modes.push(host.mode); }
        for it in t.items.unwrap_or_default() {
            match it[0].as_str().unwrap_or("") {
                "report" => seen.combat_report = true,
                "xenoreport" => seen.xeno_report = true,
                "modecard" => { let tx = it[1]["text"].as_str().unwrap_or("").to_string(); if seen.cards.last() != Some(&tx) { seen.cards.push(tx); } }
                _ => {}
            }
        }
    }

    #[test]
    fn a_real_hunt_switches_the_mode_by_itself_and_leaves_no_combat_report() {
        let path = Path::new("../../research/thargoid-logs/Journal.2026-11-18T025743.01.log");
        let Ok(text) = std::fs::read_to_string(path) else { eprintln!("journal not here, skipped"); return };
        let mut host = crate::host::Host::new(true).unwrap(); // (the engine's clock is ours: its calm time passes as the Journal's does)
        let (mut next, mut seen) = (0.0, Seen::default());
        for l in text.lines() {
            let Ok(e) = serde_json::from_str::<Value>(l) else { continue };
            let ts = e["timestamp"].as_str().unwrap_or("");
            if ts < "2026-11-18T00:08:00" || ts > "2026-11-18T00:17:30" { continue; }
            let now = secs_of(ts) + 2.0;
            if next == 0.0 { next = now; }
            while next + 1.0 < now { next += 1.0; look(&mut host, next, &mut seen); }
            host.eng.set_now((now * 1000.0) as i64);
            host.handle(&e, now);
        }
        for _ in 0..200 { next += 1.0; look(&mut host, next, &mut seen); } // (the quiet after the hunt: the engine's fight ends by itself)
        assert!(seen.modes.contains(&crate::host::Mode::Thargoid), "the hunt turns the Thargoid mode on: {:?}", seen.modes);
        assert!(!seen.modes.contains(&crate::host::Mode::Combat), "the fight of a hunt is never a Combat mode: {:?}", seen.modes);
        assert_eq!(seen.cards, vec!["Thargoid Mode On".to_string()], "one card, the Thargoid one");
        assert!(seen.xeno_report, "the Xeno Hunt report shows after the kill");
        assert!(!seen.combat_report, "no Combat report for a Xeno Hunt");
        assert_eq!(host.finished.len(), 0, "the fight is not kept in Past combats");
        assert!(host.last_view.is_some(), "(the engine did end a fight in this test: otherwise it would prove nothing)");
        assert_eq!(host.th.finished.len(), 1, "the hunt is kept for Past Thargoid");
        assert_eq!(host.th.finished[0].sys, "Asterope", "the system is named from the drop");
    }

    #[test]
    fn on_foot_is_a_mode_of_its_own_with_its_card() {
        let mut host = crate::host::Host::new(false).unwrap();
        host.flags = 1 << 24;
        host.flags2 = 1; // OnFoot
        let t = host.draw(100.0);
        assert_eq!(host.mode, crate::host::Mode::Foot);
        let keys: Vec<String> = t.items.unwrap_or_default().iter().map(|i| i[0].as_str().unwrap_or("").to_string()).collect();
        assert_eq!(keys, vec!["modecard".to_string()], "on foot only the card is drawn");
        let t2 = host.draw(110.0); // the card is for a few seconds
        assert!(t2.items.unwrap_or_default().is_empty());
        host.foot_on = false;
        host.flags2 = 0;
        host.draw(120.0);
        host.flags2 = 1;
        host.draw(130.0);
        assert_eq!(host.mode, crate::host::Mode::None, "with the On Foot mode off nothing comes on");
    }

    #[test]
    fn scouts_end_at_the_last_scout_the_signal_promised() {
        let Some(hs) = hunts_of(Path::new("../../research/thargoid-logs/thargoid-20261117-053102.jsonl")) else { eprintln!("recording not here, skipped"); return };
        assert!(!hs.is_empty());
        for h in &hs {
            if let Some(n) = h.expected() {
                if h.kills.len() >= n { assert_eq!(h.t1, h.kills.last().unwrap().0, "ends at the last kill"); }
                assert!(h.kills.len() <= n, "never more than the signal said");
            }
        }
        // the card shows n/m
        let tr = I18n::new("en");
        let h = Hunt { threat: 4, kills: vec![(1.0, 80_000)], ..Default::default() };
        let th = Th { cur: Some(h), ..Default::default() };
        assert!(th.card(&tr, 10.0).unwrap().to_string().contains("1/4"));
    }

    #[test]
    fn hull_is_a_range_from_the_games_steps() {
        let tr = I18n::new("en");
        // no step: the hull never fell under 80 %
        let h0 = Hunt { t0: 10.0, t1: 40.0, last_t: 10.0, ..Default::default() };
        assert_eq!(h0.hull_band(), (80, 100));
        assert!(Th::report_card(&tr, &h0, None, &[]).to_string().contains("80-100 %"));
        // the values the game really wrote on 18 Nov (0.799..., 0.599..., 0.75, 0.40)
        let band = |v: f64| Hunt { hull: vec![(1.0, v)], ..Default::default() }.hull_band();
        assert_eq!(band(0.799837), (60, 80));
        assert_eq!(band(0.599987), (40, 60));
        assert_eq!(band(0.8), (60, 80));
        assert_eq!(band(0.6), (40, 60));
        assert_eq!(band(0.75), (60, 75));
        assert_eq!(band(0.40), (20, 40));
        // a step is fed through the card: range in the report, middle of it in the bar
        let mut th = Th { cur: Some(Hunt { t0: 10.0, t1: 40.0, last_t: 10.0, ..Default::default() }), ..Default::default() };
        th.feed(&json!({"event": "HullDamage", "Health": 0.599987, "PlayerPilot": true, "Fighter": false}), 20.0);
        let r1 = Th::report_card(&tr, th.cur.as_ref().unwrap(), None, &[]).to_string();
        assert!(r1.contains("40-60 %") && !r1.contains("max 60"), "{r1}");
        let c = th.card(&tr, 30.0).unwrap().to_string();
        assert!(c.contains("EST. 40-60 %") && c.contains("50"), "{c}");
        // heat damage is only counted, the amount is not logged
        th.feed(&json!({"event": "HeatDamage"}), 30.0);
        let h = th.cur.as_ref().unwrap();
        let r2 = Th::report_card(&tr, h, None, &[]).to_string();
        assert!(r2.contains("40-60 %") && r2.contains("not logged"), "{r2}");
        assert!(Hunt::from_value(&Hunt::to_value(h)).unwrap().heat_dmg.len() == 1);
        // 40 UnderAttack lines in 3 waves are 3 attack waves (the real hunt of 11:36 wrote 40 lines in 7 waves)
        let mut at = vec![];
        for w in 0..3 { for k in 0..13 { at.push(100.0 * w as f64 + k as f64 * 0.5); } }
        let h3 = Hunt { t0: 0.0, t1: 300.0, last_t: 0.0, attacks: at, heat_dmg: vec![5.0, 6.0], ..Default::default() };
        assert_eq!(h3.waves(), 3);
        let r3 = Th::report_card(&tr, &h3, None, &[]).to_string();
        assert!(r3.contains("ATTACK WAVES") && r3.contains("Heat damage"), "{r3}");
    }

    #[test]
    fn the_report_compares_with_your_other_hunts_and_names_the_build() {
        let tr = I18n::new("en");
        let mk = |t0: f64, secs: f64, fp: &str| Hunt { t0, t1: t0 + secs, threat: 5, big: true, kills: vec![(t0 + secs, 8_000_000)], build: "krait_mkii|6|1|1".into(), build_fp: fp.into(), last_t: t0, ..Default::default() };
        let past = vec![mk(10_000.0, 300.0, "a"), mk(9_000.0, 360.0, "a"), mk(5_000.0, 420.0, "b")];
        let h = mk(10_700.0, 330.0, "a");
        let r = Th::report_card(&tr, &h, None, &past).to_string();
        assert!(r.contains("-0:30"), "against the average of the other 3 (360 s): {r}");
        assert!(r.contains("5:30") && r.contains("Krait Mk II") && r.contains("6 HRP") && r.contains("caustic sink") && r.contains("neutralizer"), "{r}");
        assert!(r.contains("6:40"), "400 s since the last hunt ended: {r}");
        assert!(r.contains("24.0M") && r.contains("/h"), "a session of 3 hunts (the 4th is 58 min before): {r}");
        // no past hunts: dashes, no session
        let r0 = Th::report_card(&tr, &h, None, &[]).to_string();
        assert!(!r0.contains("hunts, ") && !r0.contains("average of") && r0.contains("\"-\""), "{r0}");
        // the build from a Loadout: cosmetics do not change it, engineering does
        let ld = |paint: &str, bp: &str| json!({"event": "Loadout", "Ship": "krait_mkii", "Modules": [
            {"Slot": "PaintJob", "Item": paint}, {"Slot": "Armour", "Item": "krait_mkii_armour_grade3", "Engineering": {"BlueprintName": bp}},
            {"Slot": "Slot02_Size6", "Item": "int_hullreinforcement_size5_class2"}, {"Slot": "TinyHardpoint3", "Item": "hpt_causticsinklauncher_turret_tiny"},
            {"Slot": "TinyHardpoint4", "Item": "hpt_antiunknownshutdown_tiny"}]});
        let mut t = Th::default();
        t.note_loadout(&ld("a", "x"));
        let fp1 = t.build_fp.clone();
        assert_eq!(t.build, "krait_mkii|1|1|1");
        t.note_loadout(&ld("b", "x"));
        assert_eq!(t.build_fp, fp1);
        t.note_loadout(&ld("a", "y"));
        assert_ne!(t.build_fp, fp1);
        assert_eq!(ship_name("krait_mkii"), "Krait Mk II");
    }

    fn epoch(ts: &str) -> Option<f64> {
        let n: Vec<i64> = ts.trim_end_matches('Z').split(|c| c == '-' || c == 'T' || c == ':').filter_map(|x| x.parse().ok()).collect();
        if n.len() != 6 { return None; }
        let (y, m, d) = (n[0] - (n[1] <= 2) as i64, n[1], n[2]);
        let era = y.div_euclid(400);
        let yoe = y - era * 400;
        let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
        let days = era * 146097 + yoe * 365 + yoe / 4 - yoe / 100 + doy - 719468;
        Some((days * 86400 + n[3] * 3600 + n[4] * 60 + n[5]) as f64)
    }

    /// The real Journals of the 16-17 Nov hunts (16 scout fights, 4 Cyclops fights), fed line by line with their own time stamps.
    #[test]
    fn the_real_journals_every_hunt_ends_at_its_last_kill() {
        let dir = Path::new("../../research/thargoid-logs");
        let Ok(rd) = std::fs::read_dir(dir) else { return };
        let (mut scout, mut cyclops) = (0, 0);
        for f in rd.flatten().map(|f| f.path()) {
            let n = f.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
            if !n.starts_with("Journal.") || !n.ends_with(".log") || n.contains("copy") { continue; }
            let text = std::fs::read_to_string(&f).unwrap_or_default();
            let mut th = Th::default();
            let mut seen = f64::MIN;
            for l in text.lines() {
                let Ok(e) = serde_json::from_str::<Value>(l) else { continue };
                let Some(now) = e.get("timestamp").and_then(Value::as_str).and_then(epoch) else { continue };
                th.feed(&e, now);
                th.tick(now);
                if let Some(h) = th.last.as_ref().filter(|h| h.t1 > seen) {
                    seen = h.t1;
                    if let Some(k) = h.expected() {
                        if h.kills.len() == k { scout += 1; assert_eq!(h.t1, h.kills.last().unwrap().0, "{n}: a scout hunt ends at its last kill"); }
                    } else if h.interceptor() && h.kills.iter().any(|k| kind_of(k.1) == "Cyclops") {
                        cyclops += 1;
                        assert_eq!(h.t1, h.kills.iter().find(|k| kind_of(k.1) == "Cyclops").unwrap().0, "{n}: a Cyclops hunt ends at its kill");
                    }
                }
            }
        }
        eprintln!("complete scout hunts {scout}, Cyclops hunts {cyclops}");
        if scout + cyclops > 0 { assert!(scout >= 10 && cyclops >= 1); }
    }

    #[test]
    fn scouts_are_a_hunt_without_an_interceptor() {
        let p = Path::new("../../research/thargoid-logs/thargoid-20261117-053102.jsonl");
        let Some(th) = replay(p) else { eprintln!("recording not here, skipped"); return };
        let h = th.last.as_ref().expect("waves were kept");
        assert!(!h.interceptor());
        assert!(h.kills.iter().all(|k| k.1 < 1_000_000));
    }

    /// The two windows drawn on a dark screen: research/app-golden/out/xeno_windows.png (looked at by eye, not compared).
    #[test]
    fn the_windows_are_drawn() {
        let out = crate::host::parity::golden_dir().join("../out");
        let _ = std::fs::create_dir_all(&out);
        let (w, h) = (2560.0, 1440.0);
        let s = crate::hud::pieces::scale(h, 1.0);
        let mut canvas = tiny_skia::Pixmap::new(w as u32, h as u32).unwrap();
        canvas.fill(tiny_skia::Color::from_rgba8(30, 40, 60, 255));
        let th = Th::sample(1_000_000.0);
        let tr = I18n::new("en");
        for (key, place) in [("thargoid", json!(["plane", "comms"])), ("xenoreport", json!(["top", 0.115]))] {
            let m = th.model(&tr, key, 1_000_000.0).unwrap();
            let pv: Vec<Value> = place.as_array().unwrap().clone();
            let v0 = crate::hud::place::cursor_key(&pv).and_then(|_| crate::hud::place::start_of(&pv, w, h));
            let p = crate::hud::place::paint(&tr, &m, 0.0, 0.0, "#ff7100", (0.0, 0, 100, 100), Some(&pv), v0, s, w, h, false, true, 190).unwrap_or_else(|| panic!("no picture for {key}"));
            let src = tiny_skia::PixmapRef::from_bytes(&p.pic.rgba, p.pic.w, p.pic.h).unwrap();
            canvas.draw_pixmap(p.pic.x, p.pic.y, src, &tiny_skia::PixmapPaint::default(), tiny_skia::Transform::identity(), None);
        }
        // the card that says which mode came on
        let card = json!({"kind": "chip", "tone": "red", "text": tx(&tr, "mode.card.thargoid", &[]), "sub": ""});
        let pv = vec![json!("top"), json!(0.03)];
        let v0 = crate::hud::place::cursor_key(&pv).and_then(|_| crate::hud::place::start_of(&pv, w, h));
        let p = crate::hud::place::paint(&tr, &card, 0.0, 0.0, "#ff7100", (0.0, 0, 100, 100), Some(&pv), v0, s, w, h, false, true, 190).expect("no picture for the mode card");
        let src = tiny_skia::PixmapRef::from_bytes(&p.pic.rgba, p.pic.w, p.pic.h).unwrap();
        canvas.draw_pixmap(p.pic.x, p.pic.y, src, &tiny_skia::PixmapPaint::default(), tiny_skia::Transform::identity(), None);
        canvas.save_png(out.join("xeno_windows.png")).unwrap();
    }

    #[test]
    fn kinds_by_bond_and_every_language_has_every_key() {
        assert_eq!(kind_of(80_000), "Scout");
        assert_eq!(kind_of(8_000_000), "Cyclops");
        assert_eq!(kind_of(60_000_000), "Hydra");
        let en = table().get("en").and_then(Value::as_object).unwrap().clone();
        for (c, _) in FILES.iter() {
            let t = table().get(c).and_then(Value::as_object).unwrap_or_else(|| panic!("{c} did not parse"));
            for k in en.keys() { assert!(t.contains_key(k), "{c} lacks {k}"); }
        }
        let tr = I18n::new("de");
        for key in ["thargoid", "xenoreport"] {
            assert!(Th::sample(1_000_000.0).model(&tr, key, 1_000_000.0).is_some(), "{key}");
        }
    }
}
