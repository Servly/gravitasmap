//! Tests of the travel history (cargo test visits). Journals here are small made-up files in a temp folder: the real data folder is never written.
use super::parse::{parse_text, Stop, Tail};
use std::fs;
use std::path::PathBuf;

pub(crate) fn tmp(tag: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("gravitas-vh-{tag}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
}

pub(crate) fn l(t: &str, ev: &str, rest: &str) -> String { format!("{{ \"timestamp\":\"{t}\", \"event\":\"{ev}\"{rest} }}\n") }
pub(crate) fn jump(t: &str, sys: &str, x: f64) -> String { l(t, "FSDJump", &format!(", \"StarSystem\":\"{sys}\", \"StarPos\":[{x},2.5,3.0], \"JumpDist\":8.4"))}
pub(crate) fn loc(t: &str, sys: &str, x: f64, docked: Option<(&str, u64)>) -> String {
    let d = docked.map(|(n, m)| format!(", \"Docked\":true, \"StationName\":\"{n}\", \"MarketID\":{m}")).unwrap_or_else(|| ", \"Docked\":false".into());
    l(t, "Location", &format!(", \"StarSystem\":\"{sys}\", \"StarPos\":[{x},2.5,3.0]{d}"))
}
pub(crate) fn dock(t: &str, name: &str, m: u64) -> String { l(t, "Docked", &format!(", \"StationName\":\"{name}\", \"MarketID\":{m}, \"StarSystem\":\"X\"")) }
pub(crate) fn buy(t: &str, m: u64, what: &str, n: u64, cost: u64) -> String { l(t, "MarketBuy", &format!(", \"MarketID\":{m}, \"Type\":\"{}\", \"Type_Localised\":\"{what}\", \"Count\":{n}, \"BuyPrice\":10, \"TotalCost\":{cost}", what.to_lowercase())) }
pub(crate) fn sell(t: &str, m: u64, what: &str, n: u64, total: u64) -> String { l(t, "MarketSell", &format!(", \"MarketID\":{m}, \"Type\":\"{}\", \"Type_Localised\":\"{what}\", \"Count\":{n}, \"SellPrice\":10, \"TotalSale\":{total}", what.to_lowercase())) }

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

