//! Mutation fuzzing of the whole Journal path: REAL Journal lines (the Thargoid logs and the made-up stress fights in research/) are changed on purpose (a value turned into null, a huge
//! string, a negative or enormous number, a list, an object; a key removed) and fed to the host (engine, counter, claims, bonds, Thargoid, Debrief, PVP) while it draws.
//! Nothing may panic. Run: FUZZ_SECS=300 cargo test --release mutated_journals -- --ignored --nocapture
//! A panic prints the exact (mutated) line and the seed, so it can be replayed. The Journals hold a real commander ID: they are only read here, never copied.
use super::*;
use serde_json::json;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::PathBuf;

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: usize) -> usize { if n == 0 { 0 } else { (self.next() % n as u64) as usize } }
    fn chance(&mut self, percent: u64) -> bool { self.next() % 100 < percent }
}

fn nasty(r: &mut Rng) -> Value {
    match r.below(16) {
        0 => Value::Null,
        1 => json!(true),
        2 => json!(""),
        3 => json!("x".repeat(20_000)),
        4 => json!(-1),
        5 => json!(0),
        6 => json!(1e308),
        7 => json!(-1e308),
        8 => json!(9_007_199_254_740_993i64),
        9 => json!([]),
        10 => json!([1, "a", null, {"b": 2}]),
        11 => json!({}),
        12 => json!({"a": {"b": {"c": [1, 2, 3]}}}),
        13 => json!("<b>é\u{0}\\\"\u{202e}ü</b>"),
        14 => json!(0.5),
        _ => json!("$cmdr_decorate:#name=Zed;"),
    }
}

/// One change somewhere inside the value.
fn mutate(v: &mut Value, r: &mut Rng, depth: usize) {
    match v {
        Value::Object(m) if !m.is_empty() => {
            let keys: Vec<String> = m.keys().cloned().collect();
            let k = keys[r.below(keys.len())].clone();
            if r.chance(20) { m.remove(&k); }
            else if depth < 3 && r.chance(40) && matches!(m[&k], Value::Object(_) | Value::Array(_)) { mutate(&mut m[&k], r, depth + 1); }
            else { m.insert(k, nasty(r)); }
        }
        Value::Array(a) if !a.is_empty() => {
            let i = r.below(a.len());
            if r.chance(20) { a.remove(i); }
            else if depth < 3 && r.chance(40) && matches!(a[i], Value::Object(_) | Value::Array(_)) { mutate(&mut a[i], r, depth + 1); }
            else { a[i] = nasty(r); }
        }
        _ => *v = nasty(r),
    }
}

fn sources() -> Vec<Vec<Value>> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../research");
    let mut files: Vec<PathBuf> = Vec::new();
    for dir in ["thargoid-logs", "app-golden/stress"] {
        if let Ok(rd) = std::fs::read_dir(root.join(dir)) {
            for e in rd.flatten() {
                let n = e.file_name().to_string_lossy().into_owned();
                if n.starts_with("Journal.") && n.ends_with(".log") && !n.contains("copy") { files.push(e.path()); }
            }
        }
    }
    files.sort();
    files.iter().filter_map(|p| std::fs::read(p).ok()).map(|b| String::from_utf8_lossy(&b).lines().filter_map(|l| serde_json::from_str::<Value>(l).ok()).filter(Value::is_object).collect::<Vec<_>>()).filter(|v: &Vec<Value>| !v.is_empty()).collect()
}

/// The time of a line, to move the clock forward like a real session.
fn stamp(e: &Value) -> Option<f64> {
    parse_ts(e.get("timestamp")?.as_str()?)
}

#[test]
#[ignore]
fn mutated_journals_never_panic() {
    let secs: u64 = std::env::var("FUZZ_SECS").ok().and_then(|s| s.parse().ok()).unwrap_or(20);
    let seed: u64 = std::env::var("FUZZ_SEED").ok().and_then(|s| s.parse().ok()).unwrap_or(0x9E3779B97F4A7C15);
    let srcs = sources();
    if srcs.is_empty() { println!("SKIP: no Journals in research/"); return; }
    std::panic::set_hook(Box::new(|_| {})); // (the failing line is printed below, once, with its seed)
    let t0 = std::time::Instant::now();
    let (mut events, mut mutated, mut rounds) = (0u64, 0u64, 0u64);
    let mut rng = Rng(seed);
    while t0.elapsed().as_secs() < secs {
        rounds += 1;
        let src = &srcs[rng.below(srcs.len())];
        let round_seed = rng.next();
        let mut r = Rng(round_seed | 1);
        let mut host = Host::new(true).expect("host");
        host.set.always = r.chance(50);
        host.db.on = r.chance(60);
        host.pvp.on = r.chance(60);
        let start = r.below(src.len());
        let mut now = src.get(start).and_then(stamp).unwrap_or(1_000_000.0);
        let mut last_line = String::new();
        let res = catch_unwind(AssertUnwindSafe(|| {
            if r.chance(30) { // sometimes as a catch-up (the app starting in the middle of a session)
                let part: Vec<Value> = src[start..src.len().min(start + 300)].iter().map(|e| { let mut e = e.clone(); if r.chance(15) { mutate(&mut e, &mut r, 0); } e }).collect();
                host.catch_up(&part);
            }
            for e in src[start..].iter().take(400) {
                let mut e = e.clone();
                if r.chance(25) { mutate(&mut e, &mut r, 0); mutated += 1; if r.chance(30) { mutate(&mut e, &mut r, 0); } }
                last_line = e.to_string();
                if let Some(t) = e.get("timestamp").and_then(Value::as_str).and_then(parse_ts) { now = t.max(now); } else { now += 0.3; }
                host.handle(&e, now);
                events += 1;
                if r.chance(15) { let _ = host.draw(now + 0.1); }
                if r.chance(3) { now += r.below(120) as f64; let _ = host.draw(now); }
            }
            let _ = host.draw(now + 30.0);
            let _ = host.draw(now + 400.0);
        }));
        if res.is_err() {
            let _ = std::panic::take_hook();
            panic!("PANIC after {events} events. replay: FUZZ_SEED={seed} (round {rounds}, round seed {round_seed}). Last line fed: {last_line}");
        }
    }
    let _ = std::panic::take_hook();
    println!("fuzz: {rounds} sessions, {events} events ({mutated} mutated) in {secs} s, no panic");
}

// ---- canary: the app's Journal events, changed forms of each (what Frontier might do in an update) ----

/// One well-formed line of each Journal event the app acts on.
fn canary_lines() -> Vec<Value> {
    let ts = "2026-11-24T12:00:00Z";
    let mut v = vec![
        json!({"event":"Fileheader","part":1,"language":"English/UK","Odyssey":true,"gameversion":"4.4.2.1","build":"r334925/r0 "}),
        json!({"event":"Commander","FID":"F1","Name":"Test"}),
        json!({"event":"LoadGame","Commander":"Test","Ship":"krait_mkii","ShipName":"x","GameMode":"Open"}),
        json!({"event":"Location","StarSystem":"Sol","StarPos":[0,0,0],"Docked":true,"StationName":"Abraham Lincoln","StationName_Localised":"Abraham Lincoln"}),
        json!({"event":"FSDJump","StarSystem":"Col 285 Sector AB-C d1","JumpDist":12.5,"FuelUsed":1.2}),
        json!({"event":"CarrierJump","StarSystem":"Sol","Docked":true,"StationName":"K1X-12Z"}),
        json!({"event":"Docked","StarSystem":"Sol","StationName":"Abraham Lincoln"}),
        json!({"event":"Undocked","StationName":"Abraham Lincoln"}),
        json!({"event":"SupercruiseEntry","StarSystem":"Sol"}),
        json!({"event":"SupercruiseExit","StarSystem":"Sol","Body":"Earth","BodyType":"Planet"}),
        json!({"event":"StartJump","JumpType":"Hyperspace","StarSystem":"Sol"}),
        json!({"event":"Music","MusicTrack":"Combat_Dogfight"}),
        json!({"event":"ShipTargeted","TargetLocked":true,"Ship":"viper","Ship_Localised":"Viper Mk III","ScanStage":3,"PilotName":"$npc_name_decorate:#name=Bob;","PilotName_Localised":"Bob","PilotRank":"Expert","ShieldHealth":80.5,"HullHealth":100.0,"LegalStatus":"Wanted","Bounty":12000,"Faction":"Pirates"}),
        json!({"event":"UnderAttack","Target":"You"}),
        json!({"event":"HullDamage","Health":0.79,"PlayerPilot":true,"Fighter":false}),
        json!({"event":"ShieldState","ShieldsUp":false}),
        json!({"event":"HeatWarning"}),
        json!({"event":"HeatDamage"}),
        json!({"event":"Bounty","Rewards":[{"Faction":"Pirates","Reward":50000}],"Target":"viper","TotalReward":50000,"VictimFaction":"Pirates"}),
        json!({"event":"FactionKillBond","Reward":150000,"AwardingFaction":"A","VictimFaction":"B"}),
        json!({"event":"CapShipBond","Reward":1000000,"AwardingFaction":"A","VictimFaction":"B"}),
        json!({"event":"RedeemVoucher","Type":"bounty","Amount":50000,"Factions":[{"Faction":"Pirates","Amount":50000}],"BrokerPercentage":25.0}),
        json!({"event":"Died","KillerName":"$cmdr_decorate:#name=Zed;","KillerShip":"python","KillerRank":"Deadly"}),
        json!({"event":"Resurrect","Option":"rebuy","Cost":1000,"Bankrupt":false}),
        json!({"event":"WingJoin","Others":["A","B"]}),
        json!({"event":"WingAdd","Name":"A"}),
        json!({"event":"WingLeave"}),
        json!({"event":"Interdicted","Submitted":false,"Interdictor":"$cmdr_decorate:#name=Zed;","IsPlayer":true}),
        json!({"event":"Interdiction","Success":true,"Interdicted":"Zed","IsPlayer":true}),
        json!({"event":"EscapeInterdiction","Interdictor":"Zed","IsPlayer":true}),
        json!({"event":"PVPKill","Victim":"Zed","CombatRank":3}),
        json!({"event":"SystemsShutdown"}),
        json!({"event":"USSDrop","USSType":"$USS_Type_NonHuman;","USSThreat":4}),
        json!({"event":"MaterialCollected","Category":"Encoded","Name":"x","Count":3}),
        json!({"event":"Loadout","Ship":"krait_mkii","ShipName":"x","ShipIdent":"AB-12","HullValue":1,"ModulesValue":2,"Rebuy":3,"Modules":[{"Slot":"MediumHardpoint1","Item":"hpt_pulselaser_fixed_medium","On":true,"Priority":0,"Health":1.0,"Engineering":{"BlueprintName":"x","Level":5}}]}),
        json!({"event":"Shutdown"}),
    ];
    for e in v.iter_mut() {
        e["timestamp"] = json!(ts);
    }
    v
}

/// The changed forms: a field renamed, a field missing, a field of the wrong type (several), an extra new field with an odd value.
fn canary_forms(base: &Value) -> Vec<Value> {
    let mut out = Vec::new();
    let keys: Vec<String> = base.as_object().unwrap().keys().filter(|k| *k != "event" && *k != "timestamp").cloned().collect();
    for k in &keys {
        let mut renamed = base.clone();
        let val = renamed.as_object_mut().unwrap().remove(k).unwrap();
        renamed[format!("{k}_renamed")] = val;
        out.push(renamed);
        let mut missing = base.clone();
        missing.as_object_mut().unwrap().remove(k);
        out.push(missing);
        for wrong in [json!("text"), json!(12345), json!(null), json!([1, 2]), json!({"x": 1}), json!(true)] {
            let mut w = base.clone();
            w[k] = wrong;
            out.push(w);
        }
    }
    for extra in [json!("a new value"), json!(7), json!({"new": [1, 2, 3]}), json!(null)] {
        let mut x = base.clone();
        x["BrandNewField"] = extra;
        out.push(x);
    }
    out
}

#[test]
fn canary_changed_journal_events_never_panic_and_the_counters_move() {
    let lines = canary_lines();
    let mut fed = 0usize;
    let mut now = 1_793_992_999.0;
    let mut host = Host::new(true).expect("host");
    host.set.always = true;
    host.db.on = true;
    host.pvp.on = true;
    for base in &lines {
        for form in canary_forms(base) {
            let res = catch_unwind(AssertUnwindSafe(|| {
                host.handle(&form, now);
                host.handle(base, now + 1.0);
                let _ = host.draw(now + 2.0);
            }));
            assert!(res.is_ok(), "panic on {form}");
            fed += 1;
            now += 3.0;
        }
    }
    assert!(fed > 600, "{fed} changed lines were fed");
    // the counters that must move
    let snap = || crate::drift::snapshot();
    let list = |s: &Value, k: &str| s[k].as_array().unwrap().iter().filter_map(|x| x.as_str().map(String::from)).collect::<Vec<_>>();
    let mut host = Host::new(true).expect("host");
    let stamp = "2026-11-24T12:00:00Z";
    host.handle(&json!({"timestamp":stamp,"event":"CanaryBrandNewEvent"}), now);
    host.handle(&json!({"timestamp":stamp,"event":"Music","MusicTrack":"CanaryNewTrack"}), now);
    host.handle(&json!({"timestamp":stamp,"event":"FSDJump"}), now);
    host.handle(&json!({"timestamp":stamp,"event":"FactionKillBond"}), now);
    host.handle(&json!({"timestamp":stamp,"event":"RedeemVoucher"}), now);
    let ts0 = snap()["timestamps_failed"].as_u64().unwrap();
    host.handle(&json!({"timestamp":"yesterday","event":"Died"}), now);
    host.handle(&json!({"event":"Died"}), now);
    let s = snap();
    assert!(list(&s, "unknown_events").contains(&"CanaryBrandNewEvent".to_string()));
    assert!(list(&s, "unknown_music").contains(&"CanaryNewTrack".to_string()));
    let f = list(&s, "fields_missing");
    for k in ["FSDJump.StarSystem", "FactionKillBond.Reward", "RedeemVoucher.Amount"] {
        assert!(f.contains(&k.to_string()), "{k} not counted");
    }
    assert!(s["timestamps_failed"].as_u64().unwrap() >= ts0 + 2, "bad timestamps are counted");
    assert!(s["flag"].as_bool().unwrap());
}

#[test]
fn canary_the_events_the_app_uses_are_all_known() {
    let known = crate::drift::known_events();
    for l in canary_lines() {
        let e = l["event"].as_str().unwrap();
        assert!(known.contains(e), "{e} is used by the app but missing from drift::known_events()");
    }
}

#[test]
fn canary_a_status_with_flags_as_text_keeps_the_previous_flags() {
    let prev = 0x0000_0004_0000_0010u64;
    for bad in [json!({"event":"Status","Flags":"16"}), json!({"event":"Status","Flags":"0x10"}), json!({"event":"Status","Flags":[16]}), json!({"event":"Status","Flags2":1})] {
        let r = crate::drift::status_in(&bad, prev, 3);
        assert!(r.accept && r.flags == prev, "{bad}");
    }
    // a good one replaces them; a renamed event with Flags is taken; no Flags and no Status name is not taken
    assert_eq!(crate::drift::status_in(&json!({"event":"Status","Flags":0}), prev, 3).flags, 0);
    assert_eq!(crate::drift::status_in(&json!({"event":"StatusX","Flags":8}), prev, 3).flags, 8);
    assert!(!crate::drift::status_in(&json!({"event":"Other"}), prev, 3).accept);
}

#[test]
fn canary_timestamp_forms() {
    let base = parse_ts("2026-11-06T19:23:19Z").unwrap();
    assert_eq!(base, 1_793_992_999.0, "the plain form gives whole seconds, as before");
    assert_eq!(parse_ts("1970-01-01T00:00:00Z"), Some(0.0));
    assert_eq!(parse_ts("2026-11-06T19:23:19.500Z"), Some(base + 0.5));
    assert_eq!(parse_ts("2026-11-06T19:23:19.25+00:00"), Some(base + 0.25));
    assert_eq!(parse_ts("2026-11-06T20:23:19+01:00"), Some(base));
    assert_eq!(parse_ts("2026-11-06T14:23:19-05:00"), Some(base));
    assert_eq!(parse_ts("2026-11-06T14:53:19-04:30"), Some(base));
    for bad in ["", "yesterday", "2026-11-06T19:23:19", "2026-11-06 19:23:19Z", "2026-11-06T19:23:19.Z", "2026-11-06T19:23:19+0100", "2026-11-06T19:23:19+25:00", "2026-11-06T19:23:19Zx", "20x6-11-06T19:23:19Z"] {
        assert_eq!(parse_ts(bad), None, "{bad:?}");
    }
}
