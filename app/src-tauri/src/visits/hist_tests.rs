//! Tests of the travel history (cargo test visits). Journals here are small made-up files in a temp folder: the real data folder is never written.
use super::hist::{assemble, Entry, Hist};
use super::parse::{parse_text, Stop, Tail};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;

fn tmp(tag: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("gravitas-vh-{tag}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
}

fn l(t: &str, ev: &str, rest: &str) -> String { format!("{{ \"timestamp\":\"{t}\", \"event\":\"{ev}\"{rest} }}\n") }
fn jump(t: &str, sys: &str, x: f64) -> String { l(t, "FSDJump", &format!(", \"StarSystem\":\"{sys}\", \"StarPos\":[{x},2.5,3.0], \"JumpDist\":8.4"))}
fn loc(t: &str, sys: &str, x: f64, docked: Option<(&str, u64)>) -> String {
    let d = docked.map(|(n, m)| format!(", \"Docked\":true, \"StationName\":\"{n}\", \"MarketID\":{m}")).unwrap_or_else(|| ", \"Docked\":false".into());
    l(t, "Location", &format!(", \"StarSystem\":\"{sys}\", \"StarPos\":[{x},2.5,3.0]{d}"))
}
fn dock(t: &str, name: &str, m: u64) -> String { l(t, "Docked", &format!(", \"StationName\":\"{name}\", \"MarketID\":{m}, \"StarSystem\":\"X\"")) }
fn buy(t: &str, m: u64, what: &str, n: u64, cost: u64) -> String { l(t, "MarketBuy", &format!(", \"MarketID\":{m}, \"Type\":\"{}\", \"Type_Localised\":\"{what}\", \"Count\":{n}, \"BuyPrice\":10, \"TotalCost\":{cost}", what.to_lowercase())) }
fn sell(t: &str, m: u64, what: &str, n: u64, total: u64) -> String { l(t, "MarketSell", &format!(", \"MarketID\":{m}, \"Type\":\"{}\", \"Type_Localised\":\"{what}\", \"Count\":{n}, \"SellPrice\":10, \"TotalSale\":{total}", what.to_lowercase())) }

fn one(text: &str) -> Vec<Stop> { parse_text(text, Tail::default()).stops }

#[test]
fn a_jump_chain_with_a_restart_in_the_same_system_is_one_stop_each() {
    let mut t = String::new();
    t += &l("2026-11-24T10:00:00Z", "LoadGame", ", \"FID\":\"FXTESTAAA\", \"Commander\":\"SECRETCMDR\", \"Ship\":\"krait_mkii\", \"ShipName\":\"SecretShip\"");
    t += &loc("2026-11-24T10:00:01Z", "Sol", 0.0, Some(("Galileo", 1)));
    t += &jump("2026-11-24T10:05:00Z", "Alpha Centauri", 3.03);
    t += &l("2026-11-24T10:06:00Z", "FSDJump", ", \"StarSystem\":\"Taxi Town\", \"StarPos\":[1.239,2.0,3.0], \"Taxi\":true");
    t += &loc("2026-11-24T10:09:00Z", "Taxi Town", 1.239, None); // a restart in place
    t += &dock("2026-11-24T10:10:00Z", "Port", 77);
    let s = one(&t);
    let names: Vec<&str> = s.iter().map(|x| x.sys.as_str()).collect();
    assert_eq!(names, ["Sol", "Alpha Centauri", "Taxi Town"]);
    assert_eq!(s[0].how, "start");
    assert_eq!(s[1].how, "jump");
    assert_eq!(s[1].x, 3.03);
    assert_eq!(s[2].fl, "taxi");
    assert_eq!(s[2].x, 1.24); // two decimals
    assert_eq!(s[0].acts.len(), 1); // docked at Galileo when the game started
    assert_eq!(s[2].acts[0].st, "Port");
    let out = serde_json::to_string(&s).unwrap();
    assert!(!out.contains("FXTESTAAA") && !out.contains("SECRETCMDR") && !out.contains("SecretShip") && !out.contains("krait"), "{out}");
}

#[test]
fn a_carrier_jump_is_a_stop_with_the_carrier_as_station() {
    let mut t = jump("2026-11-24T10:00:00Z", "Start", 1.0);
    t += &l("2026-11-24T11:00:00Z", "CarrierJump", ", \"StarSystem\":\"Far Away\", \"StarPos\":[50.0,60.0,70.0], \"Docked\":true, \"StationName\":\"K7X-12Z\", \"MarketID\":3700001");
    t += &sell("2026-11-24T11:05:00Z", 3700001, "Gold", 5, 5000);
    let s = one(&t);
    assert_eq!(s[1].how, "carrier");
    assert_eq!(s[1].acts.len(), 2);
    assert_eq!(s[1].acts[0].k, "dock");
    assert_eq!(s[1].acts[1].st, "K7X-12Z");
}

#[test]
fn trades_find_their_station_by_market_id_and_none_is_left_empty() {
    let mut t = jump("2026-11-24T10:00:00Z", "A", 1.0);
    t += &sell("2026-11-24T10:01:00Z", 55, "Gold", 1, 10); // no Docked yet: no station
    t += &dock("2026-11-24T10:02:00Z", "Port A", 55);
    t += &sell("2026-11-24T10:03:00Z", 55, "Silver", 2, 20);
    t += &sell("2026-11-24T10:04:00Z", 55, "Silver", 2, 20); // a second sale is its own line
    let s = one(&t);
    let sells: Vec<_> = s[0].acts.iter().filter(|a| a.k == "sell").collect();
    assert_eq!(sells.len(), 3);
    assert_eq!(sells[0].st, "");
    assert_eq!(sells[1].st, "Port A");
}

#[test]
fn repeated_buys_of_one_thing_at_one_station_are_one_action() {
    let mut t = jump("2026-11-24T10:00:00Z", "A", 1.0);
    t += &dock("2026-11-24T10:02:00Z", "Port A", 55);
    for i in 0..5 { t += &buy(&format!("2026-11-24T10:0{}:00Z", 3 + i), 55, "Steel", 100, 1000); }
    t += &buy("2026-11-24T10:09:00Z", 55, "Gold", 1, 7);
    t += &dock("2026-11-24T10:10:00Z", "Port A", 55); // the same dock again: still one
    let s = one(&t);
    let buys: Vec<_> = s[0].acts.iter().filter(|a| a.k == "buy").collect();
    assert_eq!(buys.len(), 2);
    assert_eq!((buys[0].n, buys[0].cr), (Some(500), Some(5000)));
    assert_eq!(s[0].acts.iter().filter(|a| a.k == "dock").count(), 1);
}

#[test]
fn exploration_organic_vouchers_and_missions() {
    let mut t = jump("2026-11-24T10:00:00Z", "A", 1.0);
    t += &dock("2026-11-24T10:02:00Z", "Port A", 55);
    t += &l("2026-11-24T10:03:00Z", "MultiSellExplorationData", ", \"BaseValue\":1, \"Bonus\":2, \"TotalEarnings\":1500");
    t += &l("2026-11-24T10:03:01Z", "SellOrganicData", ", \"MarketID\":55, \"BioData\":[{\"Value\":100,\"Bonus\":10},{\"Value\":200,\"Bonus\":0}]");
    t += &l("2026-11-24T10:04:00Z", "RedeemVoucher", ", \"Type\":\"bounty\", \"Amount\":999");
    t += &l("2026-11-24T10:05:00Z", "MissionCompleted", ", \"MissionID\":424242, \"LocalisedName\":\"Secret text\", \"Reward\":1000");
    t += &l("2026-11-24T10:05:01Z", "MissionCompleted", ", \"MissionID\":424243, \"LocalisedName\":\"Secret text\", \"Reward\":500");
    let s = one(&t);
    let a = &s[0].acts;
    assert!(a.iter().any(|x| x.k == "explore" && x.cr == Some(1500) && !x.org));
    assert!(a.iter().any(|x| x.k == "explore" && x.cr == Some(310) && x.org && x.st == "Port A"));
    assert!(a.iter().any(|x| x.k == "voucher" && x.cr == Some(999)));
    assert!(a.iter().any(|x| x.k == "mission" && x.n == Some(2) && x.cr == Some(1500)));
    let out = serde_json::to_string(&s).unwrap();
    assert!(!out.contains("424242") && !out.contains("Secret text"));
}

#[test]
fn raw_tokens_are_cleaned() {
    let t = jump("2026-11-24T10:00:00Z", "A", 1.0) + &l("2026-11-24T10:02:00Z", "Docked", ", \"StationName\":\"$Operations_Runner_Name:#index=1;\", \"MarketID\":9")
        + &l("2026-11-24T10:03:00Z", "Docked", ", \"StationName\":\"$EXT_PANEL_X:#index=1;\", \"StationName_Localised\":\"Colonisation Ship\", \"MarketID\":10");
    let s = one(&t);
    assert_eq!(s[0].acts[0].st, "Operations Runner Name");
    assert_eq!(s[0].acts[1].st, "Colonisation Ship");
}

#[test]
fn a_broken_line_is_skipped_and_the_rest_is_read() {
    let mut t = jump("2026-11-24T10:00:00Z", "A", 1.0);
    t += "{ \"timestamp\":\"2026-11-24T10:01:00Z\", \"event\":\"FSDJump\", \"StarSystem\":\"Cut o\n";
    t += "ff fragment of the line before\n";
    t += "\n{\"event\":\"FSDJump\"}\n"; // no system
    t += "{ \"timestamp\":\"2026-11-24T10:01:30Z\", \"event\":\"FSDJump\", \"StarSystem\":\"NoPos\" }\n"; // no StarPos: no stop at (0,0,0)
    t += &jump("2026-11-24T10:02:00Z", "B", 2.0);
    let s = one(&t);
    assert_eq!(s.iter().map(|x| x.sys.as_str()).collect::<Vec<_>>(), ["A", "B"]);
}

#[test]
fn a_file_boundary_keeps_the_system_and_the_stations() {
    let d = tmp("boundary");
    let j = tmp("boundary-j");
    fs::write(j.join("Journal.2026-11-24T100000.01.log"), jump("2026-11-24T10:00:00Z", "B", 1.0) + &dock("2026-11-24T10:05:00Z", "Port B", 88)).unwrap();
    // the next game start: trade lines first (the game was left docked), then the Location of the same system
    fs::write(j.join("Journal.2026-11-24T120000.01.log"),
        sell("2026-11-24T12:00:00Z", 88, "Gold", 3, 300) + &loc("2026-11-24T12:00:05Z", "B", 1.0, Some(("Port B", 88))) + &jump("2026-11-24T12:10:00Z", "C", 5.0)).unwrap();
    let h = Arc::new(Hist::new(Some(d.join("visits.json")), Some(d.join("bk"))));
    h.scan(&j);
    let s = h.stops();
    assert_eq!(s.iter().map(|x| x.sys.as_str()).collect::<Vec<_>>(), ["B", "C"], "the restart in B is not a new stop");
    assert_eq!(s[0].how, "jump");
    let sell = s[0].acts.iter().find(|a| a.k == "sell").expect("the head trade joins the stop of the file before");
    assert_eq!(sell.st, "Port B");
    assert_eq!(s[0].acts.iter().filter(|a| a.k == "dock").count(), 1);
    let _ = fs::remove_dir_all(&d);
    let _ = fs::remove_dir_all(&j);
}

#[test]
fn a_growing_file_is_read_again_and_nothing_is_counted_twice() {
    let d = tmp("grow");
    let j = tmp("grow-j");
    let f = j.join("Journal.2026-11-24T100000.01.log");
    let mut t = jump("2026-11-24T10:00:00Z", "A", 1.0) + &dock("2026-11-24T10:01:00Z", "Port A", 5) + &buy("2026-11-24T10:02:00Z", 5, "Steel", 10, 100);
    fs::write(&f, &t).unwrap();
    let h = Arc::new(Hist::new(Some(d.join("visits.json")), Some(d.join("bk"))));
    h.scan(&j);
    h.scan(&j); // nothing changed: the same
    let a = h.stops();
    assert_eq!(a.len(), 1);
    t += &buy("2026-11-24T10:03:00Z", 5, "Steel", 10, 100);
    t += &jump("2026-11-24T10:04:00Z", "B", 2.0);
    fs::write(&f, &t).unwrap();
    h.scan(&j);
    let b = h.stops();
    assert_eq!(b.len(), 2);
    let buy = b[0].acts.iter().find(|x| x.k == "buy").unwrap();
    assert_eq!((buy.n, buy.cr), (Some(20), Some(200)), "added once, not twice");
    // a new instance reads the saved file and still sees the same, and a new scan changes nothing
    h.flush();
    let h2 = Arc::new(Hist::new(Some(d.join("visits.json")), Some(d.join("bk"))));
    assert_eq!(h2.stops(), b);
    h2.scan(&j);
    assert_eq!(h2.stops(), b);
    // the file the game later deleted: its history stays
    fs::remove_file(&f).unwrap();
    h2.scan(&j);
    assert_eq!(h2.stops(), b);
    let _ = fs::remove_dir_all(&d);
    let _ = fs::remove_dir_all(&j);
}

#[test]
fn the_stored_text_has_no_fid_no_name_no_ship() {
    let d = tmp("priv");
    let j = tmp("priv-j");
    let t = l("2026-11-24T09:59:00Z", "Commander", ", \"FID\":\"FXTESTBBB\", \"Name\":\"SECRETCMDR\"")
        + &l("2026-11-24T10:00:00Z", "LoadGame", ", \"FID\":\"FXTESTBBB\", \"Commander\":\"SECRETCMDR\", \"Ship\":\"python\", \"ShipName\":\"MyShip\", \"ShipIdent\":\"AB-12C\"")
        + &jump("2026-11-24T10:01:00Z", "A", 1.0)
        + &l("2026-11-24T10:02:00Z", "MissionCompleted", ", \"MissionID\":987654, \"Name\":\"Mission_X\", \"LocalisedName\":\"Free text\", \"Reward\":5, \"Faction\":\"Some Faction\"")
        + &l("2026-11-24T10:03:00Z", "Died", ", \"KillerName\":\"CMDR Killer\"");
    fs::write(j.join("Journal.2026-11-24T100000.01.log"), t).unwrap();
    let h = Arc::new(Hist::new(Some(d.join("visits.json")), Some(d.join("bk"))));
    h.scan(&j);
    h.flush();
    let text = fs::read_to_string(d.join("visits.json")).unwrap();
    let copy = fs::read_to_string(d.join("bk").join("visits.json")).unwrap();
    for s in ["FXTESTBBB", "SECRETCMDR", "MyShip", "AB-12C", "python", "987654", "Free text", "Mission_X", "Killer", "Some Faction"] {
        assert!(!text.contains(s) && !copy.contains(s), "{s} must not be stored");
    }
    assert!(text.contains("\"sys\":\"A\""));
    let _ = fs::remove_dir_all(&d);
    let _ = fs::remove_dir_all(&j);
}

#[test]
fn forget_removes_the_file_and_its_backup_copy_and_the_keep_switch_stops_work() {
    let d = tmp("forget");
    let j = tmp("forget-j");
    fs::write(j.join("Journal.2026-11-24T100000.01.log"), jump("2026-11-24T10:00:00Z", "A", 1.0)).unwrap();
    let h = Arc::new(Hist::new(Some(d.join("visits.json")), Some(d.join("bk"))));
    h.scan(&j);
    h.flush();
    assert!(d.join("visits.json").exists() && d.join("bk").join("visits.json").exists());
    assert!(h.forget());
    assert!(!d.join("visits.json").exists() && !d.join("bk").join("visits.json").exists());
    assert!(h.stops().is_empty());
    h.scan(&j); // rebuilt from the Journals
    assert_eq!(h.stops().len(), 1);
    // keep off: nothing is computed, nothing written
    let h3 = Arc::new(Hist::new(Some(d.join("v3.json")), Some(d.join("bk"))));
    h3.set_keep(false);
    let r = h3.get(Some(j.clone()), None);
    assert_eq!(r["keep"], false);
    assert_eq!(r["total"], 0);
    assert!(!d.join("v3.json").exists());
    let _ = fs::remove_dir_all(&d);
    let _ = fs::remove_dir_all(&j);
}

#[test]
fn get_answers_at_once_scans_in_the_background_and_says_same_when_nothing_changed() {
    let d = tmp("get");
    let j = tmp("get-j");
    fs::write(j.join("Journal.2026-11-24T100000.01.log"), jump("2026-11-24T10:00:00Z", "A", 1.0) + &jump("2026-11-24T10:01:00Z", "B", 2.0)).unwrap();
    let h = Arc::new(Hist::new(Some(d.join("visits.json")), Some(d.join("bk"))));
    let first = h.get(Some(j.clone()), None);
    assert_eq!(first["keep"], true);
    let t0 = Instant::now();
    let mut r = first;
    while r["total"] != 2 && t0.elapsed().as_secs() < 10 { std::thread::sleep(std::time::Duration::from_millis(50)); r = h.get(Some(j.clone()), None); }
    assert_eq!(r["total"], 2);
    assert_eq!(r["stops"].as_array().unwrap().len(), 2);
    assert_eq!(r["since"], "2026-11-24T10:00:00Z");
    assert_eq!(r["stops"][0]["how"], "jump");
    assert!(r["stops"][0].get("acts").is_none(), "empty acts are left out");
    while !h.idle() { std::thread::sleep(std::time::Duration::from_millis(20)); }
    let rev = r["rev"].as_u64().unwrap();
    let again = h.get(Some(j.clone()), Some(rev));
    assert_eq!(again["same"], true);
    assert!(again.get("stops").is_none());
    while !h.idle() { std::thread::sleep(std::time::Duration::from_millis(20)); }
    let _ = fs::remove_dir_all(&d);
    let _ = fs::remove_dir_all(&j);
}

/// 100,000 stops: how long it takes to write, to read back and to put into the answer
#[test]
fn a_hundred_thousand_stops_load_and_serialise_fast_enough() {
    let d = tmp("stress");
    let h = Hist::new(Some(d.join("visits.json")), Some(d.join("bk")));
    let mut n = 0u64;
    for f in 0..1000 {
        let mut stops = Vec::new();
        for i in 0..100 {
            n += 1;
            let mut s = Stop { t: format!("2026-11-24T10:{:02}:{:02}Z", i % 60, (i * 7) % 60), sys: format!("Some Star System {n}"), x: n as f64 * 0.37, y: 1.5, z: -2.25, how: "jump".into(), ..Default::default() };
            if i % 2 == 0 { s.acts = parse_text(&(dock("2026-11-24T10:00:00Z", "Port", 1) + &buy("2026-11-24T10:00:01Z", 1, "Steel", 10, 100)), Tail::default()).pre; }
            stops.push(s);
        }
        h.put(&format!("Journal.2026-{:04}.01.log", f), Entry { size: 1, cin: 0, pre: vec![], stops, tail: Tail::default() });
    }
    let t0 = Instant::now();
    h.flush();
    let write_ms = t0.elapsed().as_millis();
    let size = fs::metadata(d.join("visits.json")).unwrap().len();
    let t1 = Instant::now();
    let h2 = Hist::new(Some(d.join("visits.json")), Some(d.join("bk")));
    let st = h2.stops();
    let load_ms = t1.elapsed().as_millis();
    assert_eq!(st.len(), 100_000);
    let t2 = Instant::now();
    let v = serde_json::to_value(&st).unwrap();
    let ser_ms = t2.elapsed().as_millis();
    let t3 = Instant::now();
    let _c = v.clone();
    let clone_ms = t3.elapsed().as_millis();
    println!("100,000 stops: file {} KB, write {write_ms} ms, load+assemble {load_ms} ms, to JSON value {ser_ms} ms, clone {clone_ms} ms", size / 1024);
    let _ = assemble(&BTreeMap::new());
    let _ = fs::remove_dir_all(&d);
}

/// Burak's own Journal folder, read into a temporary data folder (never the real one): cargo test visits -- --ignored --nocapture
#[test]
#[ignore]
fn the_real_folder() {
    let Some(j) = crate::journal::saved_games() else { panic!("no Journal folder") };
    let d = tmp("real");
    let h = Arc::new(Hist::new(Some(d.join("visits.json")), Some(d.join("bk"))));
    let t0 = Instant::now();
    h.scan(&j);
    let cold = t0.elapsed();
    let t1 = Instant::now();
    h.scan(&j);
    let warm = t1.elapsed();
    h.flush();
    let s = h.stops();
    let mut systems = std::collections::HashSet::new();
    let (mut docks, mut buys_n, mut sells, mut xs, mut orgs, mut vs, mut ms, mut buy_cr, mut sell_cr) = (0, 0, 0, 0, 0, 0, 0u64, 0u64, 0u64);
    for x in &s {
        systems.insert(x.sys.clone());
        for a in &x.acts {
            match a.k.as_str() {
                "dock" => docks += 1,
                "buy" => { buys_n += 1; buy_cr += a.cr.unwrap_or(0); }
                "sell" => { sells += 1; sell_cr += a.cr.unwrap_or(0); }
                "explore" => { if a.org { orgs += 1 } else { xs += 1 } }
                "voucher" => vs += 1,
                "mission" => ms += a.n.unwrap_or(0),
                _ => {}
            }
        }
    }
    let by_how = |h: &str| s.iter().filter(|x| x.how == h).count();
    let size = fs::metadata(d.join("visits.json")).unwrap().len();
    println!("stops {} (jump {}, carrier {}, start {}), systems {}, docks {}, buy actions {} ({} cr), sells {} ({} cr), explore {}, organic {}, vouchers {}, missions {}",
        s.len(), by_how("jump"), by_how("carrier"), by_how("start"), systems.len(), docks, buys_n, buy_cr, sells, sell_cr, xs, orgs, vs, ms);
    println!("cold scan {} ms, no-change scan {} ms, visits.json {} KB", cold.as_millis(), warm.as_millis(), size / 1024);
    println!("first {:?} last {:?}", s.first().map(|x| &x.t), s.last().map(|x| &x.t));
    assert!(!s.is_empty());
    let _ = fs::remove_dir_all(&d);
}
