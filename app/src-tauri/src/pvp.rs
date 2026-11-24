//! PVP mode: one file for each fight you have with another commander (XXX_vs_YYY_fight_N.gravitas), made on your computer from what the game
//! wrote about YOU. Nothing about keys or the mouse is ever in it. You send the file to the other commander yourself, if you want to.
//!
//! A fight starts at the first sign of an engagement (an attack on you, a commander locked, an interdiction, a kill or a death) and ends at a
//! death or a kill, when you leave (jump, supercruise, dock), when the game closes, after a calm, or (if switched on) when a shield goes down.
//! It is kept only when a commander was in it and something really happened: you were attacked, a kill or a death was written, an interdiction
//! happened, or the commander's scanned shield or hull went down. Commanders are told from NPCs by the game's own marker: "$cmdr_decorate".
use crate::debrief::{parse_ts, Db, Rec};
use serde_json::{json, Map, Value};
use std::collections::HashMap;

/// the fight is over after this many seconds with nothing happening
pub const CALM_S: f64 = 60.0;
/// after a death or a kill, the record runs on this long (the Journal writes its lines about a second late)
pub const POST_S: f64 = 4.0;
/// shorter than this is not a fight
pub const MIN_LEN: f64 = 5.0;
/// events that end a fight because you left
const LEAVE: &[&str] = &["FSDJump", "SupercruiseEntry", "SupercruiseExit", "Docked", "CarrierJump", "Shutdown", "StartJump"];

#[derive(Clone, Debug, Default)]
struct Cand {
    strong: u32,
    targeted: u32,
}

/// The commander's name in what the game wrote: "$cmdr_decorate:#name=Foo;" is the game's own marker of a commander, "Cmdr Foo" the readable one.
pub fn cmdr_name(raw: &str, localised: &str) -> Option<String> {
    if let Some(i) = raw.find("#name=") {
        let rest = &raw[i + 6..];
        let end = rest.find(';').unwrap_or(rest.len());
        let n = rest[..end].trim();
        if !n.is_empty() { return Some(n.to_string()); }
    }
    for pre in ["Cmdr ", "CMDR ", "cmdr "] {
        if let Some(n) = localised.strip_prefix(pre) { if !n.trim().is_empty() { return Some(n.trim().to_string()); } }
    }
    None
}

fn s<'a>(e: &'a Value, k: &str) -> &'a str { e.get(k).and_then(Value::as_str).unwrap_or("") }

#[derive(Default)]
pub struct Pvp {
    pub on: bool,
    /// a shield going down ends the fight (for those who fight to the shield only)
    pub shield_end: bool,
    /// the ship's build (its modules and their engineering) goes into the file
    pub build_in: bool,
    me: String,
    build: Option<Value>,
    pub db: Db,
    active: bool,
    t0: f64,
    last_wall: f64,
    end_at: Option<(f64, f64)>,
    cands: HashMap<String, Cand>,
    engaged: bool,
    pvpkill: Option<f64>,
    interdiction: Option<f64>,
    killed_by: Vec<String>,
    won_vs: Option<String>,
    opp_shield_prev: HashMap<String, f64>,
    /// files made (the caller writes them): number 0 = the store gives the next free one
    pub finished: Vec<Value>,
    /// a card for a few seconds after a file was made: (the commander, until when)
    pub saved: Option<(String, f64)>,
}

impl Pvp {
    pub fn active(&self) -> bool { self.active }

    /// Status.json is always followed (Flight Assist and shields as they are when a fight starts).
    pub fn status(&mut self, v: &Value, ts: f64) {
        if !self.on { return; }
        self.db.status(v, ts);
    }

    fn start(&mut self, ts: f64, now: f64) {
        if self.active { return; }
        self.active = true;
        self.t0 = ts;
        self.last_wall = now;
        self.end_at = None;
        let (ship, sys) = (self.db.ship.clone(), String::new());
        self.db.start("pvp", ts, ship, sys);
    }

    /// What was learned about a fight is forgotten once it is over (it is gathered from the first line on, the one that starts it too).
    fn reset(&mut self) {
        self.cands.clear();
        self.engaged = false;
        self.pvpkill = None;
        self.interdiction = None;
        self.killed_by.clear();
        self.won_vs = None;
        self.opp_shield_prev.clear();
    }

    fn cand(&mut self, name: &str) -> &mut Cand {
        self.cands.entry(name.to_string()).or_default()
    }

    /// One Journal line.
    pub fn feed(&mut self, e: &Value, now: f64) {
        if !self.on { return; }
        let ev = s(e, "event");
        let ts = parse_ts(e, now);
        match ev {
            "Commander" => { if !s(e, "Name").is_empty() { self.me = s(e, "Name").to_string(); } }
            "LoadGame" => { if !s(e, "Commander").is_empty() { self.me = s(e, "Commander").to_string(); } }
            "Loadout" => self.build = Some(build_of(e)),
            _ => {}
        }
        self.db.feed(e, now); // (the wing, the ship, and while a fight runs its events)
        // what counts as a sign of a fight, and who is in it
        let mut sign = false;
        match ev {
            "UnderAttack" if s(e, "Target") == "You" => { sign = true; self.engaged = true; }
            "ShipTargeted" => {
                if e.get("TargetLocked").and_then(Value::as_bool).unwrap_or(false) {
                    if let Some(n) = cmdr_name(s(e, "PilotName"), s(e, "PilotName_Localised")).filter(|n| *n != self.me) {
                        sign = true;
                        self.cand(&n).targeted += 1;
                        // the commander's scanned shield or hull going down is a hit that landed
                        let sh = e.get("ShieldHealth").and_then(Value::as_f64);
                        let hu = e.get("HullHealth").and_then(Value::as_f64);
                        if let Some(h) = hu { let k = format!("{n}#h"); if self.opp_shield_prev.get(&k).is_some_and(|p| h < *p - 0.5) { self.engaged = true; } self.opp_shield_prev.insert(k, h); }
                        if let Some(v) = sh {
                            let k = format!("{n}#s");
                            if self.opp_shield_prev.get(&k).is_some_and(|p| v < *p - 0.5) { self.engaged = true; }
                            self.opp_shield_prev.insert(k, v);
                            if self.shield_end && self.active && v <= 0.0 && self.end_at.is_none() { self.end_at = Some((ts, now)); }
                        }
                    }
                }
            }
            "PVPKill" => {
                if let Some(n) = cmdr_name(s(e, "Victim"), "").or_else(|| Some(s(e, "Victim").to_string()).filter(|v| !v.is_empty())).filter(|n| *n != self.me) {
                    sign = true; self.engaged = true;
                    self.cand(&n).strong += 3;
                    self.won_vs = Some(n);
                    self.pvpkill = Some(ts);
                    self.end_at = Some((ts + POST_S, now + POST_S));
                }
            }
            "Died" => {
                let mut names: Vec<String> = Vec::new();
                if let Some(n) = cmdr_name(s(e, "KillerName"), s(e, "KillerName_Localised")) { names.push(n); }
                for k in e.get("Killers").and_then(Value::as_array).into_iter().flatten() {
                    if let Some(n) = cmdr_name(s(k, "Name"), s(k, "Name_Localised")) { if !names.contains(&n) { names.push(n); } }
                }
                if self.active || !names.is_empty() {
                    sign = true; self.engaged = true;
                    let me = self.me.clone();
                    for n in names.into_iter().filter(|n| *n != me) { self.cand(&n).strong += 3; self.killed_by.push(n); }
                    self.end_at = Some((ts + POST_S, now + POST_S));
                }
            }
            "Interdicted" | "Interdiction" => {
                if e.get("IsPlayer").and_then(Value::as_bool).unwrap_or(false) {
                    let who = if ev == "Interdicted" { s(e, "Interdictor") } else { s(e, "Interdicted") };
                    let n = cmdr_name(who, "").unwrap_or_else(|| who.to_string());
                    if !n.is_empty() && n != self.me { sign = true; self.engaged = true; self.cand(&n).strong += 2; self.interdiction = Some(ts); }
                }
            }
            _ => {}
        }
        if LEAVE.contains(&ev) && self.active { self.end_at = Some((ts, now)); }
        if sign {
            if !self.active { self.start(ts, now); self.db.feed(e, now); } // (the first line is in the record too)
            self.last_wall = now;
        }
        if ev == "ShieldState" && self.shield_end && self.active && !e.get("ShieldsUp").and_then(Value::as_bool).unwrap_or(true) && self.end_at.is_none() {
            self.end_at = Some((ts, now));
        }
    }

    /// Called every step: the fight ends at its end time (or after a calm).
    pub fn tick(&mut self, now: f64) {
        if !self.on { if self.active { self.cancel(); } return; }
        if let Some((_, wall)) = self.end_at { if now >= wall { self.close(now); return; } }
        if self.active && now - self.last_wall > CALM_S { self.close(now); }
    }

    fn cancel(&mut self) {
        let _ = self.db.finish(self.t0);
        self.active = false;
        self.end_at = None;
        self.reset();
    }

    fn close(&mut self, now: f64) {
        let ts = match self.end_at { Some((t, _)) => t, None => self.last_seen_ts() };
        self.active = false;
        self.end_at = None;
        let rec = self.db.finish(ts);
        if let (Some(rec), Some((opp, seen))) = (rec, self.opponent()) {
            if self.engaged && rec.len() >= MIN_LEN {
                let file = self.file_of(&rec, &opp, seen);
                self.saved = Some((opp, now + 8.0));
                self.finished.push(file);
            }
        }
        self.reset();
    }

    /// The Journal time of the last sign of the fight (for a fight that ended by a calm).
    fn last_seen_ts(&self) -> f64 {
        let Some(r) = self.db.rec.as_ref() else { return self.t0 };
        let last = r.atk.iter().cloned().fold(0.0_f64, f64::max).max(r.sh.last().map(|x| x.0).unwrap_or(0.0)).max(r.tg.last().map(|g| g.b).unwrap_or(0.0));
        r.t0 + last + 1.0
    }

    /// Who the fight was against: the commander with most weight (a kill, a death or an interdiction weighs most, then how often the lock was on it).
    fn opponent(&self) -> Option<(String, Vec<String>)> {
        let mut v: Vec<(&String, &Cand)> = self.cands.iter().collect();
        if v.is_empty() { return None; }
        v.sort_by(|a, b| (b.1.strong, b.1.targeted, a.0).cmp(&(a.1.strong, a.1.targeted, b.0)));
        Some((v[0].0.clone(), v.iter().map(|c| c.0.clone()).collect()))
    }

    fn file_of(&self, rec: &Rec, opp: &str, seen: Vec<String>) -> Value {
        let result = if self.won_vs.as_deref() == Some(opp) { "won" } else if self.killed_by.iter().any(|k| k == opp) { "lost" } else if rec.died.is_some() { "lost" } else { "unknown" };
        let mut r = rec.to_value();
        // no key and no mouse data is ever in a PVP file
        if let Some(o) = r.as_object_mut() { for k in ["keys", "mouse", "cov", "bind"] { o.remove(k); } }
        let rel = |t: Option<f64>| t.map(|x| ((x - rec.t0) * 100.0).round() / 100.0);
        let mut f = Map::new();
        f.insert("gravitas".into(), json!(1));
        f.insert("kind".into(), json!("pvp-fight"));
        f.insert("app".into(), json!(env!("CARGO_PKG_VERSION")));
        f.insert("me".into(), json!(self.me));
        f.insert("opponent".into(), json!({"name": opp, "confirmed": false, "seen": seen}));
        f.insert("no".into(), json!(0));
        f.insert("result".into(), json!(result));
        f.insert("t0".into(), json!((rec.t0 * 1000.0).round()));
        f.insert("t1".into(), json!((rec.t1 * 1000.0).round()));
        f.insert("clock".into(), json!("Journal timestamps (UTC)"));
        f.insert("anchors".into(), json!({"died": rec.died, "pvpkill": rel(self.pvpkill), "interdiction": rel(self.interdiction),
            "first_attack": rec.atk.first(), "shield_down": rec.sh.windows(2).filter(|w| w[0].1 && !w[1].1).map(|w| w[1].0).collect::<Vec<_>>()}));
        if self.build_in { if let Some(b) = &self.build { f.insert("build".into(), b.clone()); } }
        f.insert("rec".into(), r);
        Value::Object(f)
    }
}

/// The ship and its modules with their engineering (no values, no health, no ship name, no ident).
fn build_of(e: &Value) -> Value {
    let mods: Vec<Value> = e.get("Modules").and_then(Value::as_array).into_iter().flatten().map(|m| {
        let en = m.get("Engineering");
        json!({"slot": s(m, "Slot"), "item": s(m, "Item"),
            "eng": en.map(|g| json!({"blueprint": s(g, "BlueprintName"), "level": g.get("Level").cloned().unwrap_or(Value::Null), "experimental": s(g, "ExperimentalEffect")}))})
    }).collect();
    json!({"ship": s(e, "Ship"), "modules": mods})
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(ts: &str, body: Value) -> Value {
        let mut v = body;
        v["timestamp"] = json!(ts);
        v
    }
    fn pvp() -> Pvp {
        let mut p = Pvp { on: true, build_in: true, ..Default::default() };
        p.feed(&ev("2026-11-19T10:00:00Z", json!({"event": "Commander", "Name": "Hongark", "FID": "F1234567"})), 0.0);
        p
    }
    const LOCK: &str = "$cmdr_decorate:#name=Friend;";
    fn lock(ts: &str, sh: f64) -> Value { ev(ts, json!({"event": "ShipTargeted", "TargetLocked": true, "Ship": "krait_mkii", "PilotName": LOCK, "PilotName_Localised": "CMDR Friend", "ShieldHealth": sh, "HullHealth": 100.0, "ScanStage": 3})) }
    fn attack(ts: &str) -> Value { ev(ts, json!({"event": "UnderAttack", "Target": "You"})) }
    fn epoch(ts: &str) -> f64 { crate::host::parse_ts(ts).unwrap() }

    #[test]
    fn commanders_are_told_from_npcs_by_the_games_own_marker() {
        assert_eq!(cmdr_name("$cmdr_decorate:#name=Friend;", ""), Some("Friend".into()));
        assert_eq!(cmdr_name("", "CMDR Friend"), Some("Friend".into()));
        assert_eq!(cmdr_name("Shane Mc Grath", "Shane Mc Grath"), None); // (an NPC: no marker)
        assert_eq!(cmdr_name("$UNKNOWN;", "Unknown"), None);
    }

    #[test]
    fn a_duel_that_ends_in_a_death_makes_one_file_and_never_holds_a_key() {
        let mut p = pvp();
        p.status(&json!({"event": "Status", "timestamp": "2026-11-19T10:00:05Z", "Flags": (1u64 << 24) | (1 << 3) | (1 << 5), "Pips": [4, 4, 4]}), epoch("2026-11-19T10:00:05Z"));
        let mut t = |ts: &str, e: Value| { let n = epoch(ts); p.feed(&e, n); p.tick(n); };
        t("2026-11-19T10:01:00Z", lock("2026-11-19T10:01:00Z", 100.0));
        t("2026-11-19T10:01:10Z", attack("2026-11-19T10:01:10Z"));
        t("2026-11-19T10:01:12Z", lock("2026-11-19T10:01:12Z", 60.0));
        t("2026-11-19T10:01:30Z", ev("2026-11-19T10:01:30Z", json!({"event": "Died", "KillerName": LOCK, "KillerShip": "krait_mkii", "KillerRank": "Elite"})));
        let end = epoch("2026-11-19T10:01:30Z") + POST_S + 0.1;
        p.tick(end);
        assert_eq!(p.finished.len(), 1, "one file");
        let f = &p.finished[0];
        assert_eq!((f["opponent"]["name"].as_str(), f["result"].as_str(), f["me"].as_str()), (Some("Friend"), Some("lost"), Some("Hongark")));
        // not a trace of keys or the mouse, and no commander ID anywhere
        for k in ["keys", "mouse", "cov", "bind"] { assert!(f["rec"].get(k).is_none(), "{k} is in the file"); }
        let text = f.to_string();
        assert!(!text.contains("F1234567") && !text.contains("FID"), "the ID is in the file");
        assert!(f["rec"]["atk"].as_array().unwrap().len() == 1 && f["anchors"]["died"].is_number());
        assert_eq!(f["rec"]["fa"][0], json!([0.0, 1]), "Flight Assist was off when the fight began");
        // the page can draw it: the view has the arrays the graph walks through, and no key is made up
        let view = crate::dbview::view_of(&crate::i18n::I18n::new("en"), &f["rec"], true).expect("a view");
        assert!(view["rec"]["keys"].as_array().is_some_and(|k| k.is_empty()) && view["rec"]["mouse"].as_array().is_some_and(|k| k.is_empty()) && view["rec"]["cov"].as_array().is_some_and(|k| k.is_empty()));
        assert_eq!(view["waves"].as_array().unwrap().len(), 1);
        // the opponent's scanned health: two samples on one locked ship
        assert_eq!(f["rec"]["tg"][0][4].as_array().unwrap().len(), 2);
    }

    #[test]
    fn a_fight_with_an_npc_or_without_a_real_engagement_makes_no_file() {
        // an NPC attacks: no commander in it
        let mut p = pvp();
        let n = epoch("2026-11-19T10:00:10Z");
        p.feed(&attack("2026-11-19T10:00:10Z"), n);
        p.tick(n + CALM_S + 1.0);
        assert!(p.finished.is_empty());
        // only a lock on a commander (no attack, no health going down): not a fight
        let mut q = pvp();
        let m = epoch("2026-11-19T10:00:10Z");
        q.feed(&lock("2026-11-19T10:00:10Z", 100.0), m);
        q.feed(&lock("2026-11-19T10:00:30Z", 100.0), m + 20.0);
        q.feed(&ev("2026-11-19T10:00:40Z", json!({"event": "ShipTargeted", "TargetLocked": false})), m + 30.0);
        q.tick(m + 30.0 + CALM_S + 1.0);
        assert!(q.finished.is_empty());
        // a lock on yourself is never an opponent
        let mut w = pvp();
        w.feed(&attack("2026-11-19T10:00:10Z"), m);
        w.feed(&ev("2026-11-19T10:00:20Z", json!({"event": "ShipTargeted", "TargetLocked": true, "PilotName": "$cmdr_decorate:#name=Hongark;", "Ship": "krait_mkii"})), m + 10.0);
        w.feed(&ev("2026-11-19T10:00:30Z", json!({"event": "ShipTargeted", "TargetLocked": false})), m + 20.0);
        w.tick(m + 20.0 + CALM_S + 1.0);
        assert!(w.finished.is_empty());
        // PVP mode off: nothing is read at all
        let mut o = Pvp::default();
        o.feed(&attack("2026-11-19T10:00:10Z"), n);
        assert!(!o.active());
    }

    #[test]
    fn the_shield_end_switch_ends_a_fight_at_the_first_shield_down() {
        for on in [false, true] {
            let mut p = pvp();
            p.shield_end = on;
            let a = epoch("2026-11-19T10:00:10Z");
            p.feed(&lock("2026-11-19T10:00:10Z", 100.0), a);
            p.feed(&attack("2026-11-19T10:00:12Z"), a + 2.0);
            p.feed(&ev("2026-11-19T10:00:40Z", json!({"event": "ShieldState", "ShieldsUp": false})), a + 30.0);
            p.tick(a + 30.0);
            assert_eq!(p.finished.len(), usize::from(on), "shield_end = {on}");
            if !on { assert!(p.active()); }
        }
    }

    #[test]
    fn jumping_away_ends_the_fight_and_a_kill_names_the_winner() {
        let mut p = pvp();
        let a = epoch("2026-11-19T10:00:10Z");
        p.feed(&attack("2026-11-19T10:00:10Z"), a);
        p.feed(&ev("2026-11-19T10:00:50Z", json!({"event": "PVPKill", "Victim": LOCK, "CombatRank": 5})), a + 40.0);
        p.tick(a + 40.0 + POST_S + 0.1);
        assert_eq!(p.finished.len(), 1);
        assert_eq!((p.finished[0]["result"].as_str(), p.finished[0]["opponent"]["name"].as_str()), (Some("won"), Some("Friend")));
        // a fight under 5 s is not kept
        let mut q = pvp();
        let b = epoch("2026-11-19T10:05:00Z");
        q.feed(&attack("2026-11-19T10:05:00Z"), b);
        q.feed(&ev("2026-11-19T10:05:00Z", json!({"event": "Died", "KillerName": LOCK})), b);
        q.tick(b + POST_S + 0.1);
        assert!(q.finished.is_empty());
    }

    #[test]
    fn the_build_goes_in_only_when_asked_and_without_values_or_names() {
        let load = ev("2026-11-19T09:59:00Z", json!({"event": "Loadout", "Ship": "krait_mkii", "ShipName": "My Own Name", "ShipIdent": "HG-01", "HullValue": 123456,
            "Modules": [{"Slot": "PowerPlant", "Item": "int_powerplant_size8_class5", "On": true, "Value": 99999, "Health": 1.0,
                         "Engineering": {"BlueprintName": "PowerPlant_Boosted", "Level": 5, "Quality": 1.0, "ExperimentalEffect": "special_powerplant_cooled"}}]}));
        for build_in in [true, false] {
            let mut p = pvp();
            p.build_in = build_in;
            p.feed(&load, epoch("2026-11-19T09:59:00Z"));
            let a = epoch("2026-11-19T10:00:10Z");
            p.feed(&attack("2026-11-19T10:00:10Z"), a);
            p.feed(&ev("2026-11-19T10:00:30Z", json!({"event": "Died", "KillerName": LOCK})), a + 20.0);
            p.tick(a + 20.0 + POST_S + 0.1);
            let f = &p.finished[0];
            assert_eq!(f.get("build").is_some(), build_in);
            let text = f.to_string();
            assert!(!text.contains("My Own Name") && !text.contains("HG-01") && !text.contains("99999") && !text.contains("123456"), "a name, an ident or a value is in the file");
            if build_in { assert!(text.contains("special_powerplant_cooled") && text.contains("int_powerplant_size8_class5")); }
        }
    }
}
