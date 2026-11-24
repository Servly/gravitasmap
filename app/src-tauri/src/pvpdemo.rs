//! Made-up PVP fights for looking at the PVP page before a real duel exists (cargo test make_demo_files -- --ignored).
//! They are made by feeding made-up Journal and Status lines through the REAL recorder (pvp.rs), so the files are exactly what the app writes.
//! Each fight is made twice: from Hongark's side and from TestFriend's side (whose PC clock is 7 s fast), so that the two can be put together.
//! research/pvp-demo/ (local only). The commander "TestFriend" and everything in the files is invented.
use crate::pvp::Pvp;
use serde_json::{json, Value};

const SHIP: u64 = 1 << 24;
const SHIELDS: u64 = 1 << 3;
const FA_OFF: u64 = 1 << 5;
const HOT: u64 = 1 << 20;

fn stamp(minute0: i64, off: f64) -> String {
    let s = off.floor() as i64;
    let (m, sec) = (minute0 + s / 60, s % 60);
    format!("2026-11-19T{:02}:{:02}:{:02}Z", 20 + m / 60, m % 60, sec)
}

struct Fight { p: Pvp, m0: i64, me: String, opp: String, skew: f64 }

impl Fight {
    /// `skew`: how many seconds this PC's clock is ahead of the true time
    fn new(me: &str, opp: &str, m0: i64, skew: f64, shield_end: bool) -> Fight {
        let mut p = Pvp::default();
        p.on = true;
        p.build_in = true;
        p.shield_end = shield_end;
        let mut f = Fight { p, m0, me: me.into(), opp: opp.into(), skew };
        f.j(-30.0, json!({"event": "Commander", "Name": me}));
        let load = if me == "Hongark" {
            json!({"event": "Loadout", "Ship": "krait_mkii", "Modules": [
                {"Slot": "PowerPlant", "Item": "int_powerplant_size8_class5", "Engineering": {"BlueprintName": "PowerPlant_Boosted", "Level": 5, "ExperimentalEffect": "special_powerplant_cooled"}},
                {"Slot": "ShieldGenerator", "Item": "int_shieldgenerator_size7_class5", "Engineering": {"BlueprintName": "ShieldGenerator_Reinforced", "Level": 5, "ExperimentalEffect": "special_shield_resistive"}},
                {"Slot": "MediumHardpoint1", "Item": "hpt_pulselaser_gimbal_medium", "Engineering": {"BlueprintName": "Weapon_LongRange", "Level": 5, "ExperimentalEffect": "special_scramble_spectrum"}}]})
        } else {
            json!({"event": "Loadout", "Ship": "krait_mkii", "Modules": [
                {"Slot": "PowerPlant", "Item": "int_powerplant_size8_class5", "Engineering": {"BlueprintName": "PowerPlant_Armoured", "Level": 5, "ExperimentalEffect": "special_powerplant_toughened"}},
                {"Slot": "ShieldGenerator", "Item": "int_shieldgenerator_size7_class5", "Engineering": {"BlueprintName": "ShieldGenerator_Kinetic", "Level": 5, "ExperimentalEffect": "special_shield_kinetic"}},
                {"Slot": "MediumHardpoint1", "Item": "hpt_multicannon_gimbal_medium", "Engineering": {"BlueprintName": "Weapon_Overcharged", "Level": 5, "ExperimentalEffect": "special_incendiary_rounds"}}]})
        };
        f.j(-20.0, load);
        f
    }
    fn at(&self, off: f64) -> (String, f64) { let s = stamp(self.m0, off + 60.0 + self.skew); let t = crate::host::parse_ts(&s).unwrap(); (s, t) }
    fn j(&mut self, off: f64, mut e: Value) { let (s, t) = self.at(off); e["timestamp"] = json!(s); self.p.feed(&e, t); self.p.tick(t); }
    fn status(&mut self, off: f64, fa_off: bool, shields: bool, hot: bool, pips: [i64; 3]) {
        let (s, t) = self.at(off);
        let flags = SHIP | if shields { SHIELDS } else { 0 } | if fa_off { FA_OFF } else { 0 } | if hot { HOT } else { 0 };
        self.p.status(&json!({"event": "Status", "timestamp": s, "Flags": flags, "Pips": pips}), t);
    }
    /// a scan of the other commander: what it showed of his shield and hull
    fn lock(&mut self, off: f64, sh: f64, hull: f64) {
        let who = format!("$cmdr_decorate:#name={};", self.opp);
        let loc = format!("CMDR {}", self.opp);
        self.j(off, json!({"event": "ShipTargeted", "TargetLocked": true, "Ship": "krait_mkii", "Ship_Localised": "Krait Mk II", "PilotName": who, "PilotName_Localised": loc, "PilotRank": "Deadly", "ShieldHealth": sh, "HullHealth": hull, "ScanStage": 3}));
    }
    fn hit(&mut self, off: f64, n: usize) { for k in 0..n { self.j(off + k as f64 * 0.4, json!({"event": "UnderAttack", "Target": "You"})); } }
    fn killer(&self) -> String { format!("$cmdr_decorate:#name={};", self.opp) }
    fn finish(mut self, off: f64) -> Value {
        let (_, t) = self.at(off);
        self.p.tick(t);
        assert_eq!(self.p.finished.len(), 1, "one file");
        self.p.finished.remove(0)
    }
}

// ---------------------------------------------------------------- fight 1: Hongark lost (3:20)

fn lost() -> Value {
    let mut f = Fight::new("Hongark", "TestFriend", 10, 0.0, false);
    f.status(-5.0, true, true, false, [4, 4, 4]);
    f.lock(0.0, 100.0, 100.0);
    for (t, sh, hu) in [(15.0, 100.0, 100.0), (35.0, 85.0, 100.0), (55.0, 62.0, 100.0), (75.0, 45.0, 100.0), (100.0, 40.0, 100.0), (125.0, 33.0, 92.0), (150.0, 20.0, 74.0), (175.0, 10.0, 50.0)] { f.lock(t, sh, hu); }
    for (t, n) in [(14.0, 3), (46.0, 6), (78.0, 10), (112.0, 8), (150.0, 14), (178.0, 7)] { f.hit(t, n); }
    f.status(30.0, true, true, false, [2, 4, 6]);
    f.status(80.0, true, false, false, [2, 4, 6]);
    f.status(96.0, false, false, false, [2, 4, 6]);
    f.status(101.0, true, false, true, [4, 2, 6]);
    f.j(98.0, json!({"event": "HeatWarning"}));
    f.status(112.0, true, true, true, [4, 2, 6]);
    f.status(118.0, true, true, false, [4, 2, 6]);
    f.j(120.0, json!({"event": "HullDamage", "Health": 0.8, "PlayerPilot": true, "Fighter": false}));
    f.j(150.0, json!({"event": "HeatWarning"}));
    f.status(152.0, true, false, true, [4, 2, 6]);
    f.status(170.0, true, false, false, [4, 2, 6]);
    f.j(168.0, json!({"event": "HullDamage", "Health": 0.6, "PlayerPilot": true, "Fighter": false}));
    let k = f.killer();
    f.j(196.0, json!({"event": "Died", "KillerName": k, "KillerShip": "krait_mkii", "KillerRank": "Deadly"}));
    f.finish(196.0 + 5.0)
}

/// the same fight from TestFriend's PC (7 s fast): he hit Hongark in the attacks above, Hongark's pulses hit him in the waves below, and he got the kill
fn lost_friend() -> Value {
    let mut f = Fight::new("TestFriend", "Hongark", 10, 7.0, false);
    f.status(-3.0, false, true, false, [4, 4, 4]);
    f.lock(2.0, 100.0, 100.0);
    for (t, sh, hu) in [(15.0, 100.0, 100.0), (40.0, 100.0, 100.0), (60.0, 100.0, 100.0), (80.0, 0.0, 100.0), (95.0, 0.0, 100.0), (115.0, 55.0, 100.0), (150.0, 0.0, 90.0), (180.0, 0.0, 70.0)] { f.lock(t, sh, hu); }
    for (t, n) in [(38.0, 4), (70.0, 7), (100.0, 5), (130.0, 9), (160.0, 6)] { f.hit(t, n); }
    f.status(40.0, false, true, false, [2, 4, 6]);
    f.status(72.0, false, true, false, [4, 2, 6]);
    f.status(132.0, false, false, false, [4, 2, 6]);
    f.status(150.0, false, true, false, [4, 2, 6]);
    f.j(138.0, json!({"event": "HullDamage", "Health": 0.8, "PlayerPilot": true, "Fighter": false}));
    f.j(166.0, json!({"event": "HullDamage", "Health": 0.6, "PlayerPilot": true, "Fighter": false}));
    let v = f.killer();
    f.j(196.0, json!({"event": "PVPKill", "Victim": v, "CombatRank": 5}));
    f.finish(196.0 + 5.0)
}

// ---------------------------------------------------------------- fight 2: Hongark won (2:32)

fn won() -> Value {
    let mut f = Fight::new("Hongark", "TestFriend", 20, 0.0, false);
    f.status(-5.0, true, true, false, [4, 4, 4]);
    f.lock(0.0, 100.0, 100.0);
    for (t, sh, hu) in [(12.0, 100.0, 100.0), (30.0, 70.0, 100.0), (50.0, 35.0, 100.0), (68.0, 5.0, 100.0), (85.0, 0.0, 80.0), (110.0, 0.0, 45.0), (130.0, 0.0, 12.0)] { f.lock(t, sh, hu); }
    for (t, n) in [(25.0, 2), (72.0, 5), (118.0, 3)] { f.hit(t, n); }
    f.status(40.0, true, true, false, [2, 4, 6]);
    f.status(75.0, true, false, false, [2, 4, 6]);
    f.status(90.0, true, true, false, [2, 4, 6]);
    f.j(60.0, json!({"event": "HeatWarning"}));
    f.status(62.0, true, true, true, [2, 4, 6]);
    f.status(70.0, true, true, false, [2, 4, 6]);
    f.j(122.0, json!({"event": "HullDamage", "Health": 0.8, "PlayerPilot": true, "Fighter": false}));
    let v = f.killer();
    f.j(148.0, json!({"event": "PVPKill", "Victim": v, "CombatRank": 6}));
    f.finish(148.0 + 5.0)
}

fn won_friend() -> Value {
    let mut f = Fight::new("TestFriend", "Hongark", 20, 7.0, false);
    f.status(-4.0, false, true, false, [4, 4, 4]);
    f.lock(3.0, 100.0, 100.0);
    for (t, sh, hu) in [(20.0, 100.0, 100.0), (60.0, 100.0, 100.0), (76.0, 20.0, 100.0), (100.0, 100.0, 100.0), (140.0, 100.0, 85.0)] { f.lock(t, sh, hu); }
    for (t, n) in [(28.0, 3), (50.0, 5), (66.0, 8), (82.0, 6), (96.0, 9), (110.0, 7), (125.0, 10), (140.0, 6)] { f.hit(t, n); }
    f.status(36.0, false, true, false, [2, 4, 6]);
    f.status(64.0, false, false, false, [2, 4, 6]);
    f.status(88.0, false, false, false, [2, 4, 6]);
    f.j(104.0, json!({"event": "HullDamage", "Health": 0.8, "PlayerPilot": true, "Fighter": false}));
    f.j(124.0, json!({"event": "HullDamage", "Health": 0.6, "PlayerPilot": true, "Fighter": false}));
    f.j(140.0, json!({"event": "HullDamage", "Health": 0.4, "PlayerPilot": true, "Fighter": false}));
    let k = f.killer();
    f.j(148.0, json!({"event": "Died", "KillerName": k, "KillerShip": "krait_mkii", "KillerRank": "Deadly"}));
    f.finish(148.0 + 5.0)
}

// ---------------------------------------------------------------- fight 3: to the first shield down, no result

fn to_the_shield() -> Value {
    let mut f = Fight::new("Hongark", "TestFriend", 30, 0.0, true);
    f.status(-5.0, false, true, false, [4, 4, 4]);
    f.lock(0.0, 100.0, 100.0);
    for (t, sh, hu) in [(10.0, 100.0, 100.0), (30.0, 60.0, 100.0), (50.0, 25.0, 100.0)] { f.lock(t, sh, hu); }
    for (t, n) in [(18.0, 2), (44.0, 4), (70.0, 9)] { f.hit(t, n); }
    f.status(35.0, false, true, false, [2, 4, 6]);
    f.status(72.0, false, false, false, [2, 4, 6]);
    f.j(72.0, json!({"event": "ShieldState", "ShieldsUp": false}));
    f.finish(72.0 + 3.0)
}

fn to_the_shield_friend() -> Value {
    let mut f = Fight::new("TestFriend", "Hongark", 30, 7.0, true);
    f.status(-5.0, true, true, false, [4, 4, 4]);
    f.lock(1.0, 100.0, 100.0);
    for (t, sh, hu) in [(12.0, 100.0, 100.0), (40.0, 100.0, 100.0), (60.0, 100.0, 100.0), (74.0, 0.0, 100.0)] { f.lock(t, sh, hu); }
    for (t, n) in [(30.0, 3), (52.0, 5), (66.0, 7)] { f.hit(t, n); }
    f.status(34.0, true, true, false, [2, 4, 6]);
    f.status(60.0, false, true, false, [2, 4, 6]);
    f.finish(80.0)
}

fn make(dir: &std::path::Path, fights: Vec<Value>) -> Vec<String> {
    let tr = crate::i18n::I18n::new("en");
    let _ = tr;
    let mut names = Vec::new();
    for mut f in fights {
        f["demo"] = json!(true);
        names.push(crate::pvpstore::save_in(dir, &mut f).unwrap());
    }
    names
}

#[test]
#[ignore]
fn make_demo_files() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../research/pvp-demo");
    let _ = std::fs::remove_dir_all(dir.join("files"));
    let _ = std::fs::remove_dir_all(dir.join("friend"));
    let mine = make(&dir.join("files"), vec![lost(), won(), to_the_shield()]);
    let theirs = make(&dir.join("friend"), vec![lost_friend(), won_friend()]);
    println!("mine: {mine:?}\ntheirs: {theirs:?}");
    // the same files read back, put in pairs and into one view, as the page does
    let read = |d: &str, names: &[String]| -> Vec<Value> { names.iter().map(|n| crate::pvpstore::read_in(&dir.join(d), n).unwrap()).collect() };
    let (a, b) = (read("files", &mine), read("friend", &theirs));
    let pairs = crate::pvpsync::pairs(&a, &b);
    let tr = crate::i18n::I18n::new("en");
    let mut views = serde_json::Map::new();
    for f in &a {
        let name = format!("{}_vs_{}_fight_{}.gravitas", f["me"].as_str().unwrap(), f["opponent"]["name"].as_str().unwrap(), f["no"]);
        let mut view = crate::dbview::view_of(&tr, &f["rec"], true).unwrap();
        view["pvp"] = json!({"me": f["me"], "opp": f["opponent"]["name"], "seen": f["opponent"]["seen"], "no": f["no"], "result": f["result"], "build": f.get("build").is_some(), "anchors": f["anchors"], "name": name});
        views.insert(name, view);
    }
    let mut pv = serde_json::Map::new();
    let mut plist = Vec::new();
    for p in &pairs {
        println!("pair: mine #{} <-> theirs #{}: {} off {:.1} s overlap {:.0} s", a[p.ai]["no"], b[p.bi]["no"], p.sync.kind, p.sync.off, p.overlap);
        plist.push(json!({"ai": p.ai, "bi": p.bi, "kind": p.sync.kind, "off": p.sync.off, "overlap": p.overlap, "a": crate::pvpsync::summary(&a[p.ai]), "b": crate::pvpsync::summary(&b[p.bi])}));
        pv.insert(format!("{}-{}", p.ai, p.bi), crate::pvpsync::pair_view(&tr, &a[p.ai], &b[p.bi], 0.0, true).unwrap());
    }
    let list = crate::pvpstore::list_in(&dir.join("files"));
    std::fs::write(dir.join("views.json"), json!({"list": list, "views": views, "pairs": plist, "pairviews": pv}).to_string()).unwrap();
    assert_eq!(pairs.len(), 2, "fights 1 and 2 pair up, the third has no partner");
    assert_eq!(pairs.iter().filter(|p| p.sync.kind != "clock").count(), 2);
}
