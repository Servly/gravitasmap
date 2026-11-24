//! DEBRIEF: the record of one fight or hunt (what you pressed, how the mouse moved, what the game wrote) and the recorder that makes it.
//! All times in a record are seconds from its start. Journal lines are put at their own timestamp (the game writes them about a second late),
//! the keys at the moment the PC saw them. Nothing here is sent anywhere. Written to debriefs.json in the app's own folder by the caller.
use crate::dbnames;
use crate::inputs::{Edge, Item, Map};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

/// how long the report of a finished fight stays on the screen
pub const REPORT_S: f64 = 40.0;
/// a press shorter than this is a tap, else a hold
pub const TAP_MAX: f64 = 0.30;
/// the mouse's movement is kept in slices of this many seconds
pub const SLICE: f64 = 0.5;
/// Status.json flags
const SHIELDS_UP: u64 = 1 << 3;
const FA_OFF: u64 = 1 << 5;
const OVERHEATING: u64 = 1 << 20;
const IN_SHIP: u64 = 1 << 24;
const IN_FIGHTER: u64 = 1 << 25;
const IN_SRV: u64 = 1 << 26;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Press {
    pub d: f64,
    pub u: f64,
    pub key: String,
    pub acts: Vec<String>,
}

/// One locked ship: from when to when, and what its scan showed (when, shield %, hull %; -1 where the game wrote nothing)
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Tg {
    pub a: f64,
    pub b: f64,
    pub ship: String,
    pub rank: String,
    pub snaps: Vec<(f64, f64, f64)>,
}

/// the longest list of any kind that is read back from a file (a real fight has a few hundred entries, a very long hunt a few thousand)
pub const MAX_ITEMS: usize = 5000;

#[derive(Clone, Debug, Default)]
pub struct Rec {
    /// unix seconds
    pub t0: f64,
    pub t1: f64,
    pub kind: String,
    pub ship: String,
    pub sys: String,
    pub wing: i64,
    pub fa: Vec<(f64, bool)>,
    pub sh: Vec<(f64, bool)>,
    pub hull: Vec<(f64, f64)>,
    pub atk: Vec<f64>,
    pub warn: Vec<f64>,
    pub hdmg: Vec<f64>,
    pub over: Vec<(f64, f64)>,
    pub kills: Vec<(f64, i64)>,
    pub tg: Vec<Tg>,
    pub pips: Vec<(f64, i64, i64, i64)>,
    pub keys: Vec<Press>,
    pub mouse: Vec<(f64, i64, i64)>,
    /// the stretches when the keys were followed (the game in front, you in the ship, no panel open)
    pub cov: Vec<(f64, f64)>,
    pub mx: String,
    pub my: String,
    pub decay: bool,
    pub followed: Vec<(String, Vec<String>)>,
    pub untracked: Vec<(String, Vec<String>)>,
    pub elsewhere: Vec<String>,
    pub died: Option<f64>,
}

fn r2(x: f64) -> f64 { (x * 100.0).round() / 100.0 }

impl Rec {
    pub fn len(&self) -> f64 { (self.t1 - self.t0).max(0.0) }

    /// Is the whole stretch a..b one the keys were followed in?
    pub fn covered(&self, a: f64, b: f64) -> bool {
        self.cov.iter().any(|(x, y)| *x <= a && *y >= b)
    }

    pub fn to_value(&self) -> Value {
        let ids = |v: &Vec<(String, Vec<String>)>| v.iter().map(|(k, a)| json!([k, a])).collect::<Vec<_>>();
        json!({
            "dbv": 1, "ep": {"t0": (self.t0 * 1000.0).round(), "t1": (self.t1 * 1000.0).round()},
            "kind": self.kind, "ship": self.ship, "sys": self.sys, "wing": self.wing, "len": r2(self.len()),
            "fa": self.fa.iter().map(|(t, o)| json!([r2(*t), *o as i64])).collect::<Vec<_>>(),
            "sh": self.sh.iter().map(|(t, u)| json!([r2(*t), *u as i64])).collect::<Vec<_>>(),
            "hull": self.hull.iter().map(|(t, v)| json!([r2(*t), r2(*v)])).collect::<Vec<_>>(),
            "atk": self.atk.iter().map(|t| r2(*t)).collect::<Vec<_>>(),
            "warn": self.warn.iter().map(|t| r2(*t)).collect::<Vec<_>>(),
            "hdmg": self.hdmg.iter().map(|t| r2(*t)).collect::<Vec<_>>(),
            "over": self.over.iter().map(|(a, b)| json!([r2(*a), r2(*b)])).collect::<Vec<_>>(),
            "kills": self.kills.iter().map(|(t, v)| json!([r2(*t), v])).collect::<Vec<_>>(),
            "tg": self.tg.iter().map(|g| json!([r2(g.a), r2(g.b), g.ship, g.rank, g.snaps.iter().map(|(t, s, h)| json!([r2(*t), *s, *h])).collect::<Vec<_>>()])).collect::<Vec<_>>(),
            "pips": self.pips.iter().map(|(t, s, e, w)| json!([r2(*t), s, e, w])).collect::<Vec<_>>(),
            "keys": self.keys.iter().map(|p| json!([p.key, p.acts, r2(p.d), r2(p.u)])).collect::<Vec<_>>(),
            "mouse": self.mouse.iter().map(|(t, x, y)| json!([r2(*t), x, y])).collect::<Vec<_>>(),
            "cov": self.cov.iter().map(|(a, b)| json!([r2(*a), r2(*b)])).collect::<Vec<_>>(),
            "bind": {"x": self.mx, "y": self.my, "decay": self.decay, "followed": ids(&self.followed), "untracked": ids(&self.untracked), "else": self.elsewhere},
            "died": self.died.map(r2),
        })
    }

    /// (from_value is also the way a received PVP file is read: see MAX_ITEMS)
    pub fn from_value(v: &Value) -> Option<Rec> {
        if v.get("dbv").is_none() { return None; }
        let f = |x: &Value| x.as_f64().unwrap_or(0.0);
        // a file from another person is never trusted for size: every list is cut at MAX_ITEMS, every text at 80 letters
        let arr = |k: &str| v.get(k).and_then(Value::as_array).map(|a| a.iter().take(MAX_ITEMS).cloned().collect::<Vec<_>>()).unwrap_or_default();
        let txt = |x: &Value| -> String { x.as_str().unwrap_or("").chars().take(80).collect() };
        let ids = |x: &Value| -> Vec<(String, Vec<String>)> {
            x.as_array().into_iter().flatten().take(200).map(|e| (txt(&e[0]), e[1].as_array().into_iter().flatten().take(20).filter_map(|a| a.as_str().map(|s| s.chars().take(80).collect::<String>())).collect())).collect()
        };
        Some(Rec {
            t0: v["ep"]["t0"].as_f64()? / 1000.0, t1: v["ep"]["t1"].as_f64().unwrap_or(0.0) / 1000.0,
            kind: txt(&v["kind"]), ship: txt(&v["ship"]), sys: txt(&v["sys"]),
            wing: v["wing"].as_i64().unwrap_or(0),
            fa: arr("fa").iter().map(|e| (f(&e[0]), f(&e[1]) != 0.0)).collect(),
            sh: arr("sh").iter().map(|e| (f(&e[0]), f(&e[1]) != 0.0)).collect(),
            hull: arr("hull").iter().map(|e| (f(&e[0]), f(&e[1]))).collect(),
            atk: arr("atk").iter().map(f).collect(), warn: arr("warn").iter().map(f).collect(), hdmg: arr("hdmg").iter().map(f).collect(),
            over: arr("over").iter().map(|e| (f(&e[0]), f(&e[1]))).collect(),
            kills: arr("kills").iter().map(|e| (f(&e[0]), e[1].as_i64().unwrap_or(0))).collect(),
            tg: arr("tg").iter().map(|e| Tg { a: f(&e[0]), b: f(&e[1]), ship: txt(&e[2]), rank: txt(&e[3]),
                snaps: e[4].as_array().into_iter().flatten().take(MAX_ITEMS).map(|s| (f(&s[0]), f(&s[1]), f(&s[2]))).collect() }).collect(),
            pips: arr("pips").iter().map(|e| (f(&e[0]), e[1].as_i64().unwrap_or(0), e[2].as_i64().unwrap_or(0), e[3].as_i64().unwrap_or(0))).collect(),
            keys: arr("keys").iter().map(|e| Press { key: txt(&e[0]), acts: e[1].as_array().into_iter().flatten().take(20).filter_map(|a| a.as_str().map(|s| s.chars().take(80).collect::<String>())).collect(), d: f(&e[2]), u: f(&e[3]) }).collect(),
            mouse: arr("mouse").iter().map(|e| (f(&e[0]), e[1].as_i64().unwrap_or(0), e[2].as_i64().unwrap_or(0))).collect(),
            cov: arr("cov").iter().map(|e| (f(&e[0]), f(&e[1]))).collect(),
            mx: txt(&v["bind"]["x"]), my: txt(&v["bind"]["y"]), decay: v["bind"]["decay"].as_bool().unwrap_or(false),
            followed: ids(&v["bind"]["followed"]), untracked: ids(&v["bind"]["untracked"]),
            elsewhere: v["bind"]["else"].as_array().into_iter().flatten().take(200).filter_map(|a| a.as_str().map(|s| s.chars().take(80).collect::<String>())).collect(),
            died: v.get("died").and_then(Value::as_f64),
        })
    }
}

/// A key that is down, or was a moment ago (for the live window).
#[derive(Clone, Debug)]
pub struct LiveKey {
    pub key: String,
    pub acts: Vec<String>,
    pub d: f64,
    pub u: Option<f64>,
}

#[derive(Default)]
pub struct Db {
    /// the mode is switched on (settings)
    pub on: bool,
    /// the live window's own switch
    pub rec: Option<Rec>,
    pub finished: Vec<Value>,
    pub fa_off: Option<bool>,
    pub sh_up: Option<bool>,
    hot_since: Option<f64>,
    pub live: Vec<LiveKey>,
    pub moves: Vec<(f64, i64, i64)>,
    open: HashMap<String, usize>,
    cov_open: Option<f64>,
    team: HashSet<String>,
    pub map: Option<Map>,
    pub following: bool,
    /// the Loadout's ship, and the last finished record with the time its report stops showing in the game
    pub ship: String,
    pub last: Option<(Rec, f64)>,
    pub rules_on: bool,
    tg_open: Option<usize>,
    tg_pilot: String,
    pips: (i64, i64, i64),
}

pub fn parse_ts(e: &Value, now: f64) -> f64 {
    e.get("timestamp").and_then(Value::as_str).and_then(crate::host::parse_ts).unwrap_or(now)
}

impl Db {
    /// May the keys be followed now? The game in front, you in the ship (not the fighter, the SRV or on foot), no panel or menu open.
    pub fn want(&self, flags: u64, flags2: u64, gui: i64, front: bool, game_menu: bool) -> bool {
        self.on && front && !game_menu && gui == 0 && flags & IN_SHIP != 0 && flags & (IN_FIGHTER | IN_SRV) == 0 && flags2 & 1 == 0
    }

    pub fn start(&mut self, kind: &str, ts: f64, ship: String, sys: String) {
        if self.rec.is_some() { return; }
        let mut r = Rec { t0: ts, t1: ts, kind: kind.into(), ship, sys, wing: self.team_size(), ..Default::default() };
        if let Some(o) = self.fa_off { r.fa.push((0.0, o)); }
        if let Some(u) = self.sh_up { r.sh.push((0.0, u)); }
        if self.pips != (0, 0, 0) { r.pips.push((0.0, self.pips.0, self.pips.1, self.pips.2)); }
        if let Some(m) = &self.map {
            r.mx = m.mouse_x.clone(); r.my = m.mouse_y.clone(); r.decay = m.decay;
            r.followed = m.keys.iter().map(|b| (b.key.clone(), b.acts.clone())).collect();
            r.untracked = m.untracked.clone();
            r.elsewhere = m.elsewhere.clone();
        }
        if self.following { self.cov_open = Some(0.0); }
        self.rec = Some(r);
        self.open.clear();
        self.tg_open = None;
        // a key that is down already belongs to the record from its first moment
        let held: Vec<LiveKey> = self.live.iter().filter(|k| k.u.is_none()).cloned().collect();
        for k in held { self.press_open(&k.key, &k.acts, 0.0); }
    }

    fn press_open(&mut self, key: &str, acts: &[String], t: f64) {
        if let Some(r) = self.rec.as_mut() {
            r.keys.push(Press { d: t, u: -1.0, key: key.into(), acts: acts.to_vec() });
            self.open.insert(key.into(), r.keys.len() - 1);
        }
    }

    /// The record is over: everything still open is closed, and the record is handed back (PVP keeps every one).
    pub fn finish(&mut self, ts: f64) -> Option<Rec> {
        let mut r = self.rec.take()?;
        let t = (ts - r.t0).max(0.0);
        r.t1 = ts;
        for (_, i) in self.open.drain() { if let Some(p) = r.keys.get_mut(i) { if p.u < 0.0 { p.u = t; } } }
        if let Some(a) = self.cov_open.take() { r.cov.push((a, t)); }
        if let Some(i) = self.tg_open.take() { if let Some(g) = r.tg.get_mut(i) { g.b = t; } }
        if let Some(s) = self.hot_since.take() { let a = (s - r.t0).max(0.0); r.over.push((a, t)); }
        Some(r)
    }

    /// The record is over: it is kept when anything happened in it.
    pub fn end(&mut self, ts: f64) {
        let Some(r) = self.finish(ts) else { return };
        if !r.keys.is_empty() || !r.kills.is_empty() || !r.atk.is_empty() {
            self.finished.push(r.to_value());
            self.last = Some((r, ts + REPORT_S));
        }
    }

    /// Whether the keys are being followed now (called every step with `want`).
    pub fn follow(&mut self, want: bool, ts: f64) {
        if want == self.following { return; }
        self.following = want;
        if let Some(r) = self.rec.as_mut() {
            let t = (ts - r.t0).max(0.0);
            if want { self.cov_open = Some(t); } else if let Some(a) = self.cov_open.take() { r.cov.push((a, t)); }
        }
    }

    /// Keys and mouse movement from the sampler.
    pub fn input(&mut self, it: Item) {
        match it {
            Item::Edge(e) => self.edge(e),
            Item::Move(t, dx, dy) => {
                self.moves.push((t, dx, dy));
                self.moves.retain(|m| t - m.0 < 1.5);
                if let Some(r) = self.rec.as_mut() {
                    let rt = t - r.t0;
                    if rt >= 0.0 {
                        let b = (rt / SLICE).floor() * SLICE;
                        match r.mouse.last_mut() {
                            Some(l) if (l.0 - b).abs() < 1e-6 => { l.1 += dx; l.2 += dy; }
                            _ => r.mouse.push((b, dx, dy)),
                        }
                    }
                }
            }
        }
    }

    fn edge(&mut self, e: Edge) {
        // the live window: a key that is down, or was let go less than 2 s ago
        if e.down {
            self.live.push(LiveKey { key: e.key.clone(), acts: e.acts.clone(), d: e.t, u: None });
        } else if let Some(k) = self.live.iter_mut().rev().find(|k| k.key == e.key && k.u.is_none()) {
            k.u = Some(e.t);
        }
        self.live.retain(|k| k.u.is_none_or(|u| e.t - u < 2.0));
        if self.live.len() > 40 { self.live.drain(..20); }
        let t0 = match &self.rec { Some(r) => r.t0, None => return };
        let t = e.t - t0;
        if t < 0.0 { return; }
        if e.down {
            self.press_open(&e.key, &e.acts, t);
        } else if let Some(i) = self.open.remove(&e.key) {
            if let Some(p) = self.rec.as_mut().and_then(|r| r.keys.get_mut(i)) { p.u = t; }
        }
    }

    /// Status.json: Flight Assist, shields, overheating and pips, from their own timestamps.
    pub fn status(&mut self, v: &Value, ts: f64) {
        let flags = v.get("Flags").and_then(Value::as_u64).unwrap_or(0);
        if flags & IN_SHIP == 0 { return; } // (the fighter's and the SRV's own flags are not the ship's)
        let (fa, sh, hot) = (flags & FA_OFF != 0, flags & SHIELDS_UP != 0, flags & OVERHEATING != 0);
        let pips = v.get("Pips").and_then(Value::as_array).filter(|a| a.len() == 3).map(|a| (a[0].as_i64().unwrap_or(0), a[1].as_i64().unwrap_or(0), a[2].as_i64().unwrap_or(0)));
        let (old_fa, old_sh) = (self.fa_off, self.sh_up);
        self.fa_off = Some(fa);
        self.sh_up = Some(sh);
        if let Some(p) = pips { self.pips = p; }
        let Some(r) = self.rec.as_mut() else { return };
        let t = (ts - r.t0).max(0.0);
        if old_fa != Some(fa) && r.fa.last().map(|x| x.1) != Some(fa) { r.fa.push((t, fa)); }
        if old_sh != Some(sh) && r.sh.last().map(|x| x.1) != Some(sh) { r.sh.push((t, sh)); }
        if let Some(p) = pips { if r.pips.last().map(|x| (x.1, x.2, x.3)) != Some(p) { r.pips.push((t, p.0, p.1, p.2)); } }
        if hot && self.hot_since.is_none() { self.hot_since = Some(ts); }
        if !hot { if let Some(s) = self.hot_since.take() { r.over.push(((s - r.t0).max(0.0), t)); } }
    }

    /// One Journal line (whether or not a record is running: the wing is learned all the time).
    pub fn feed(&mut self, e: &Value, now: f64) {
        let ev = e.get("event").and_then(Value::as_str).unwrap_or("");
        if ev == "Loadout" {
            if let Some(sh) = e.get("Ship").and_then(Value::as_str) { self.ship = crate::thargoid::ship_name(sh); }
        }
        match ev {
            "WingJoin" => { self.team = e.get("Others").and_then(Value::as_array).into_iter().flatten().filter_map(|n| n.as_str().map(String::from)).collect(); }
            "WingAdd" => { if let Some(n) = e.get("Name").and_then(Value::as_str) { self.team.insert(n.into()); } }
            "WingLeave" => self.team.clear(),
            _ => {}
        }
        let Some(r) = self.rec.as_mut() else { return };
        let t = parse_ts(e, now) - r.t0;
        if t < 0.0 { return; }
        let n = |k: &str| e.get(k).and_then(Value::as_f64);
        match ev {
            "UnderAttack" => { if e.get("Target").and_then(Value::as_str) == Some("You") { r.atk.push(t); } }
            "HullDamage" => {
                if e.get("PlayerPilot").and_then(Value::as_bool).unwrap_or(false) && !e.get("Fighter").and_then(Value::as_bool).unwrap_or(false) {
                    if let Some(h) = n("Health") { r.hull.push((t, h)); }
                }
            }
            "HeatWarning" => r.warn.push(t),
            "HeatDamage" => r.hdmg.push(t),
            "Bounty" => { r.kills.push((t, n("TotalReward").unwrap_or(0.0) as i64)); }
            "FactionKillBond" => { r.kills.push((t, n("Reward").unwrap_or(0.0) as i64)); }
            "Died" => { if r.died.is_none() { r.died = Some(t); } }
            "ShipTargeted" => {
                let locked = e.get("TargetLocked").and_then(Value::as_bool).unwrap_or(false);
                if !locked {
                    if let Some(i) = self.tg_open.take() { if let Some(g) = r.tg.get_mut(i) { g.b = t; } }
                    return;
                }
                let s = |k: &str| e.get(k).and_then(Value::as_str).unwrap_or("").to_string();
                let ship = { let l = s("Ship_Localised"); if l.is_empty() { s("Ship") } else { l } };
                let pilot = s("PilotName");
                let same = self.tg_open.and_then(|i| r.tg.get(i)).is_some_and(|g| g.ship == ship) && self.tg_pilot == pilot;
                if !same {
                    if let Some(i) = self.tg_open.take() { if let Some(g) = r.tg.get_mut(i) { g.b = t; } }
                    r.tg.push(Tg { a: t, b: t, ship, rank: s("PilotRank"), snaps: vec![] });
                    self.tg_open = Some(r.tg.len() - 1);
                    self.tg_pilot = pilot;
                }
                if let (Some(sh), Some(h)) = (n("ShieldHealth"), n("HullHealth")) {
                    if let Some(g) = self.tg_open.and_then(|i| r.tg.get_mut(i)) { g.snaps.push((t, sh, h)); }
                }
            }
            _ => {}
        }
    }

    pub fn team_size(&self) -> i64 { if self.team.is_empty() { 0 } else { self.team.len() as i64 + 1 } }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A real Journal (a Thargoid hunt) fed through the recorder as one record: the events land where the game wrote them, and the record survives its own file.
    #[test]
    fn a_real_journal_makes_a_record_that_round_trips() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../research/thargoid-logs");
        let Ok(text) = std::fs::read_to_string(dir.join("Journal.2026-11-18T025743.01.log")) else { return }; // (local only: not in the public copy)
        let mut db = Db { on: true, ..Default::default() };
        let mut started = false;
        let mut last = 0.0;
        for line in text.lines() {
            let Ok(e) = serde_json::from_str::<Value>(line) else { continue };
            let t = parse_ts(&e, 0.0);
            if t == 0.0 { continue; }
            if !started && e["event"] == "UnderAttack" { db.start("fight", t, "Krait Mk II".into(), "X".into()); started = true; }
            db.feed(&e, t);
            last = t;
        }
        db.end(last);
        let v = db.finished.pop().expect("a record was kept");
        let r = Rec::from_value(&v).unwrap();
        assert!(!r.atk.is_empty() && r.atk.windows(2).all(|w| w[0] <= w[1]), "attacks in time order");
        assert!(r.atk.iter().all(|t| *t >= 0.0 && *t <= r.len()));
        println!("attacks {} kills {} hull steps {} targets {} len {:.0}", r.atk.len(), r.kills.len(), r.hull.len(), r.tg.len(), r.len());
        // what is written can be read back unchanged
        assert_eq!(Rec::from_value(&r.to_value()).unwrap().to_value(), r.to_value());
        let _ = crate::dbrules::observations(&r);
    }
}
