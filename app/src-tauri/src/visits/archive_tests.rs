//! Tests of the travel history archive (cargo test visits). Journals are small made-up files in a temp folder: the real data folder is never written.
use super::hist::Hist;
use super::hist_tests::{buy, dock, jump, l, loc, sell, tmp};
use super::parse::{merge_act, parse_text, Stop, Tail};
use serde_json::{json, Value};
use std::fs;
use std::path::Path;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::{Duration, Instant};

/// a Hist in a temp folder: archive folder visits/, legacy visits.json, backup folder bk/
pub(crate) fn hist_in(d: &Path) -> Arc<Hist> { Arc::new(Hist::new(Some(d.join("visits")), Some(d.join("visits.json")), Some(d.join("bk")))) }

/// All stops of the archive as the window sees them: every month's answer, oldest month first.
pub(crate) fn all_stops(h: &Arc<Hist>) -> Vec<Stop> {
    let idx = h.index(None, None);
    let mut out = Vec::new();
    for m in idx["months"].as_array().unwrap() {
        let a = h.month(m["m"].as_str().unwrap());
        out.extend(serde_json::from_value::<Vec<Stop>>(a["stops"].clone()).unwrap());
    }
    out
}

/// makes the next scan write at once (the live write limit of 20 s is over)
pub(crate) fn age(h: &Hist) { h.lock().last_write = Instant::now().checked_sub(Duration::from_secs(60)); }

/// the old rule (before the archive): every file parsed with the tail of the file before, head actions joined to the last stop before, one list
fn old_chain(files: &[(String, String)]) -> Vec<Stop> {
    let mut sorted: Vec<&(String, String)> = files.iter().collect();
    sorted.sort_by(|a, b| a.0.cmp(&b.0));
    let mut out: Vec<Stop> = Vec::new();
    let mut tail = Tail::default();
    for (_, text) in sorted {
        let p = parse_text(text, tail.clone());
        if let Some(last) = out.last_mut() { for a in &p.pre { merge_act(&mut last.acts, a.clone()); } }
        out.extend(p.stops);
        tail = p.tail;
    }
    out
}

fn write_all(j: &Path, files: &[(String, String)]) { for (n, t) in files { fs::write(j.join(n), t).unwrap(); } }
fn mfile(d: &Path, m: &str) -> std::path::PathBuf { d.join("visits").join(format!("m-{m}.json")) }

/// Journals that cross the UTC month boundary inside a file, head actions that belong to a stop in an EARLIER month, a restart in the same system,
/// and one old file outside the quick first pass.
fn chain_files() -> Vec<(String, String)> {
    let f0 = loc("2025-01-05T10:00:00Z", "OldSys", 9.0, Some(("OldPort", 9))) + &jump("2025-01-05T10:10:00Z", "OldSys2", 10.0);
    // restart in the old system 2: the head trade and the Location belong to the old file's last stop
    let f1 = sell("2026-10-29T09:00:00Z", 9, "Wine", 4, 400) + &loc("2026-10-29T09:00:05Z", "OldSys2", 10.0, Some(("OldPort2", 10))) + &jump("2026-10-29T09:05:00Z", "Alpha", 1.0)
        + &dock("2026-10-29T09:06:00Z", "Port", 77) + &buy("2026-10-29T09:07:00Z", 77, "Steel", 5, 50);
    // November: the first trade belongs to Alpha of October
    let f2 = sell("2026-11-01T08:00:00Z", 77, "Gold", 3, 300) + &loc("2026-11-01T08:00:05Z", "Alpha", 1.0, Some(("Port", 77))) + &jump("2026-11-01T08:10:00Z", "Beta", 2.0);
    // a file across the month boundary at midnight UTC
    let f3 = jump("2026-11-30T23:30:00Z", "Gamma", 3.0) + &jump("2026-11-30T23:59:30Z", "Delta", 4.0) + &jump("2026-12-01T00:00:30Z", "Eps", 5.0)
        + &dock("2026-12-01T00:01:00Z", "Hub", 5) + &buy("2026-12-01T00:02:00Z", 5, "Tea", 2, 20);
    let f4 = sell("2026-12-01T09:00:00Z", 5, "Salt", 1, 10) + &loc("2026-12-01T09:00:05Z", "Eps", 5.0, Some(("Hub", 5))) + &jump("2026-12-01T09:10:00Z", "Zeta", 6.0);
    vec![
        ("Journal.2025-01-05T100000.01.log".into(), f0), ("Journal.2026-10-29T090000.01.log".into(), f1), ("Journal.2026-11-01T080000.01.log".into(), f2),
        ("Journal.2026-11-30T230000.01.log".into(), f3), ("Journal.2026-12-01T090000.01.log".into(), f4),
    ]
}

#[test]
fn the_archive_gives_exactly_what_the_old_single_list_gave_cold_and_after_growing() {
    let d = tmp("equiv");
    let j = tmp("equiv-j");
    let mut files = chain_files();
    write_all(&j, &files);
    let h = hist_in(&d);
    h.scan(&j); // a cold first run: the quick pass without the carried-over state, then the pass that fixes the continuity
    let want = old_chain(&files);
    let got = all_stops(&h);
    assert_eq!(got.iter().map(|s| s.sys.as_str()).collect::<Vec<_>>(), want.iter().map(|s| s.sys.as_str()).collect::<Vec<_>>(), "no duplicate start stops");
    assert_eq!(got, want);
    // the months: a file's stops are split at midnight UTC of the month boundary, a head trade sits on the stop of the EARLIER month
    let idx = h.index(None, None);
    let ms: Vec<&str> = idx["months"].as_array().unwrap().iter().map(|m| m["m"].as_str().unwrap()).collect();
    assert_eq!(ms, ["2025-01", "2026-10", "2026-11", "2026-12"]);
    let nov = h.month("2026-11");
    assert_eq!(nov["stops"].as_array().unwrap().iter().map(|s| s["sys"].as_str().unwrap()).collect::<Vec<_>>(), ["Beta", "Gamma", "Delta"]);
    let oct = h.month("2026-10");
    let alpha = &oct["stops"][0];
    assert!(alpha["acts"].as_array().unwrap().iter().any(|a| a["what"] == "Gold" && a["st"] == "Port"), "the November trade sits on Alpha of October");
    let jan = h.month("2025-01");
    assert!(jan["stops"].as_array().unwrap().last().unwrap()["acts"].as_array().unwrap().iter().any(|a| a["what"] == "Wine"), "the head trade of a far later file");
    assert_eq!(h.month("2026-12")["stops"][0]["sys"], "Eps");
    // again with nothing changed: the same
    h.scan(&j);
    assert_eq!(all_stops(&h), want);
    // the last file grows (the game is running)
    files[4].1 += &(buy("2026-12-01T09:11:00Z", 5, "Tea", 1, 9) + &jump("2026-12-01T09:20:00Z", "Eta", 7.0));
    write_all(&j, &files);
    h.scan(&j);
    assert_eq!(all_stops(&h), old_chain(&files));
    // a new instance reads the saved archive and still gives the same
    age(&h);
    h.scan(&j);
    let h2 = hist_in(&d);
    assert_eq!(all_stops(&h2), old_chain(&files));
    h2.scan(&j);
    assert_eq!(all_stops(&h2), old_chain(&files));
    // the file the game later deleted: its history stays
    fs::remove_file(j.join(&files[0].0)).unwrap();
    h2.scan(&j);
    assert_eq!(all_stops(&h2), old_chain(&files));
    let _ = fs::remove_dir_all(&d);
    let _ = fs::remove_dir_all(&j);
}

#[test]
fn a_file_older_than_the_quick_pass_is_fixed_by_the_second_pass() {
    let d = tmp("pass2");
    let j = tmp("pass2-j");
    let files: Vec<(String, String)> = vec![
        ("Journal.2024-03-01T100000.01.log".into(), jump("2024-03-01T10:00:00Z", "A", 1.0) + &jump("2024-03-01T10:05:00Z", "B", 2.0)),
        ("Journal.2026-11-24T100000.01.log".into(), loc("2026-11-24T10:00:00Z", "B", 2.0, Some(("PortB", 3))) + &jump("2026-11-24T10:05:00Z", "C", 3.0)),
    ];
    write_all(&j, &files);
    let h = hist_in(&d);
    h.scan(&j);
    assert_eq!(all_stops(&h), old_chain(&files));
    assert_eq!(all_stops(&h).iter().map(|s| s.sys.as_str()).collect::<Vec<_>>(), ["A", "B", "C"]);
    let _ = fs::remove_dir_all(&d);
    let _ = fs::remove_dir_all(&j);
}

#[test]
fn only_the_months_that_changed_are_written_again() {
    let d = tmp("writes");
    let j = tmp("writes-j");
    let mut files = chain_files();
    write_all(&j, &files);
    let h = hist_in(&d);
    h.scan(&j);
    let w0 = h.writes.load(Ordering::SeqCst);
    assert!(w0 >= 4, "every month is written at least once: {w0}");
    age(&h);
    h.scan(&j);
    assert_eq!(h.writes.load(Ordering::SeqCst), w0, "nothing changed: nothing written");
    let old = ["2025-01", "2026-10", "2026-11"];
    let before: Vec<_> = old.iter().map(|m| fs::read(mfile(&d, m)).unwrap()).collect();
    files[4].1 += &jump("2026-12-01T09:20:00Z", "Eta", 7.0);
    write_all(&j, &files);
    age(&h);
    h.scan(&j);
    assert_eq!(h.writes.load(Ordering::SeqCst), w0 + 1, "only December is written again");
    let after: Vec<_> = old.iter().map(|m| fs::read(mfile(&d, m)).unwrap()).collect();
    assert_eq!(before, after);
    assert!(fs::read_to_string(mfile(&d, "2026-12")).unwrap().contains("Eta"));
    let _ = fs::remove_dir_all(&d);
    let _ = fs::remove_dir_all(&j);
}

#[test]
fn a_new_jump_shows_at_once_from_memory_while_the_file_write_waits() {
    let d = tmp("live");
    let j = tmp("live-j");
    let mut files = chain_files();
    write_all(&j, &files);
    let h = hist_in(&d);
    h.scan(&j);
    let rev_of = |h: &Arc<Hist>| h.index(None, None)["months"].as_array().unwrap().iter().find(|m| m["m"] == "2026-12").unwrap()["r"].as_u64().unwrap();
    let r0 = rev_of(&h);
    let rev0 = h.index(None, None)["rev"].as_u64().unwrap();
    let w0 = h.writes.load(Ordering::SeqCst);
    files[4].1 += &jump("2026-12-01T09:20:00Z", "Live Jump", 7.0);
    write_all(&j, &files);
    h.scan(&j); // (the 20 s limit is not over: no write)
    assert_eq!(h.writes.load(Ordering::SeqCst), w0);
    assert_ne!(h.index(None, None)["rev"].as_u64().unwrap(), rev0);
    let r1 = rev_of(&h);
    assert_ne!(r0, r1, "the month's revision changed");
    assert!(h.month("2026-12")["stops"].to_string().contains("Live Jump"));
    assert!(!fs::read_to_string(mfile(&d, "2026-12")).unwrap().contains("Live Jump"), "not on disk yet");
    assert_eq!(h.find("live jump", 5)["items"].as_array().unwrap().len(), 1, "search sees it too");
    age(&h);
    h.scan(&j);
    assert!(fs::read_to_string(mfile(&d, "2026-12")).unwrap().contains("Live Jump"), "written after the limit");
    assert_eq!(h.month("2026-12")["r"].as_u64().unwrap(), r1, "the revision does not change by writing");
    let _ = fs::remove_dir_all(&d);
    let _ = fs::remove_dir_all(&j);
}

#[test]
fn the_stored_files_have_no_fid_no_name_no_ship() {
    let d = tmp("priv");
    let j = tmp("priv-j");
    let t = l("2026-11-24T09:59:00Z", "Commander", ", \"FID\":\"FXTESTBBB\", \"Name\":\"SECRETCMDR\"")
        + &l("2026-11-24T10:00:00Z", "LoadGame", ", \"FID\":\"FXTESTBBB\", \"Commander\":\"SECRETCMDR\", \"Ship\":\"python\", \"ShipName\":\"MyShip\", \"ShipIdent\":\"AB-12C\"")
        + &jump("2026-11-24T10:01:00Z", "A", 1.0)
        + &l("2026-11-24T10:02:00Z", "MissionCompleted", ", \"MissionID\":987654, \"Name\":\"Mission_X\", \"LocalisedName\":\"Free text\", \"Reward\":5, \"Faction\":\"Some Faction\"")
        + &l("2026-11-24T10:03:00Z", "Died", ", \"KillerName\":\"CMDR Killer\"");
    fs::write(j.join("Journal.2026-11-24T100000.01.log"), t).unwrap();
    let h = hist_in(&d);
    h.scan(&j);
    let mut seen = 0;
    for e in fs::read_dir(d.join("visits")).unwrap() {
        let text = fs::read_to_string(e.unwrap().path()).unwrap();
        seen += 1;
        for s in ["FXTESTBBB", "SECRETCMDR", "MyShip", "AB-12C", "python", "987654", "Free text", "Mission_X", "Killer", "Some Faction"] {
            assert!(!text.contains(s), "{s} must not be stored");
        }
    }
    assert_eq!(seen, 2, "one month file and the index");
    assert!(fs::read_to_string(mfile(&d, "2026-11")).unwrap().contains("\"sys\":\"A\""));
    if let Ok(rd) = fs::read_dir(d.join("bk")) { assert_eq!(rd.count(), 0, "no backup copy of the archive"); }
    let _ = fs::remove_dir_all(&d);
    let _ = fs::remove_dir_all(&j);
}

#[test]
fn the_old_single_file_is_ignored_and_deleted_with_its_copy_when_the_archive_is_complete() {
    let d = tmp("migr");
    let j = tmp("migr-j");
    fs::write(j.join("Journal.2026-11-24T100000.01.log"), jump("2026-11-24T10:00:00Z", "A", 1.0) + &jump("2026-11-24T10:01:00Z", "B", 2.0)).unwrap();
    fs::write(d.join("visits.json"), "{\"v\":1,\"files\":{\"Journal.x.log\":{\"size\":1,\"stops\":[]}}}").unwrap();
    fs::create_dir_all(d.join("bk")).unwrap();
    fs::write(d.join("bk").join("visits.json"), "{\"v\":1,\"files\":{}}").unwrap();
    let h = hist_in(&d);
    h.scan(&j);
    assert_eq!(all_stops(&h).len(), 2);
    assert!(!d.join("visits.json").exists() && !d.join("bk").join("visits.json").exists(), "old file and its copy are gone");
    assert!(d.join("visits").join("index.json").exists());
    let _ = fs::remove_dir_all(&d);
    let _ = fs::remove_dir_all(&j);
}

#[test]
fn forget_removes_everything_and_the_keep_switch_stops_work() {
    let d = tmp("forget");
    let j = tmp("forget-j");
    fs::write(j.join("Journal.2026-11-24T100000.01.log"), jump("2026-11-24T10:00:00Z", "A", 1.0)).unwrap();
    let h = hist_in(&d);
    h.scan(&j);
    fs::create_dir_all(d.join("bk")).unwrap();
    fs::write(d.join("bk").join("visits.json"), "{}").unwrap(); // (a mirror copy)
    fs::write(d.join("visits.json"), "{}").unwrap();
    assert!(d.join("visits").join("index.json").exists());
    assert!(h.forget());
    assert!(!d.join("visits").exists() && !d.join("visits.json").exists() && !d.join("bk").join("visits.json").exists());
    assert!(all_stops(&h).is_empty());
    h.scan(&j); // rebuilt from the Journals
    assert_eq!(all_stops(&h).len(), 1);
    // keep off: nothing is computed, nothing written
    let d3 = tmp("forget3");
    let h3 = hist_in(&d3);
    h3.set_keep(false);
    let r = h3.index(Some(j.clone()), None);
    assert_eq!(r["keep"], false);
    assert_eq!(r["total"], 0);
    assert_eq!(h3.month("2026-11")["stops"].as_array().unwrap().len(), 0);
    assert_eq!(h3.find("A", 5)["items"].as_array().unwrap().len(), 0);
    h3.scan(&j);
    assert!(!d3.join("visits").exists());
    for p in [&d, &d3, &j] { let _ = fs::remove_dir_all(p); }
}

#[test]
fn the_first_call_says_scanning_then_the_index_fills_and_a_call_with_the_same_rev_is_same() {
    let d = tmp("get");
    let j = tmp("get-j");
    fs::write(j.join("Journal.2026-11-24T100000.01.log"), jump("2026-11-24T10:00:00Z", "A", 1.0) + &jump("2026-11-24T10:01:00Z", "B", 2.0)).unwrap();
    let h = hist_in(&d);
    let first = h.index(Some(j.clone()), None);
    assert_eq!(first["scanning"], true, "never an empty not-scanning answer from the first call");
    assert_eq!(first["keep"], true);
    let t0 = Instant::now();
    let mut r = first;
    while (r["scanning"] == true || r["total"] != 2) && t0.elapsed().as_secs() < 10 { std::thread::sleep(Duration::from_millis(30)); r = h.index(Some(j.clone()), None); }
    assert_eq!(r["total"], 2);
    assert_eq!(r["scanning"], false);
    assert_eq!(r["since"], "2026-11-24T10:00:00Z");
    assert_eq!(r["until"], "2026-11-24T10:01:00Z");
    assert_eq!(r["files"], 1);
    assert_eq!(r["months"][0]["m"], "2026-11");
    while !h.idle() { std::thread::sleep(Duration::from_millis(20)); }
    let rev = r["rev"].as_u64().unwrap();
    let again = h.index(Some(j.clone()), Some(rev));
    assert_eq!(again["same"], true);
    assert!(again.get("months").is_none());
    let stops = h.month("2026-11");
    assert_eq!(stops["stops"].as_array().unwrap().len(), 2);
    assert!(stops["stops"][0].get("acts").is_none(), "empty acts are left out");
    while !h.idle() { std::thread::sleep(Duration::from_millis(20)); }
    let _ = fs::remove_dir_all(&d);
    let _ = fs::remove_dir_all(&j);
}

#[test]
fn a_month_name_is_checked_before_it_touches_a_path_and_only_listed_months_answer() {
    let d = tmp("safe");
    let j = tmp("safe-j");
    fs::write(j.join("Journal.2026-11-24T100000.01.log"), jump("2026-11-24T10:00:00Z", "A", 1.0)).unwrap();
    fs::write(d.join("secret.json"), "{}").unwrap();
    let h = hist_in(&d);
    h.scan(&j);
    for m in ["../secret", "..\\secret", "2026-1", "2026-11/..", "index", "2026-11.json", "", "2026-12"] {
        let a = h.month(m);
        assert_eq!(a["stops"].as_array().unwrap().len(), 0, "{m}");
        assert_eq!(a["r"], 0);
    }
    assert_eq!(h.month("2026-11")["stops"].as_array().unwrap().len(), 1);
    let _ = fs::remove_dir_all(&d);
    let _ = fs::remove_dir_all(&j);
}

#[test]
fn a_lost_index_takes_the_month_files_with_it_and_a_lost_month_file_is_built_again() {
    let d = tmp("lost");
    let j = tmp("lost-j");
    let files = chain_files();
    write_all(&j, &files);
    let want = old_chain(&files);
    let h = hist_in(&d);
    h.scan(&j);
    // index gone: a new instance cannot trust the month files, so they are rebuilt and everything is published again
    fs::remove_file(d.join("visits").join("index.json")).unwrap();
    let h2 = hist_in(&d);
    h2.scan(&j);
    assert_eq!(all_stops(&h2), want);
    // a month file gone while the index says it exists
    age(&h2);
    h2.scan(&j);
    fs::remove_file(mfile(&d, "2026-11")).unwrap();
    let h3 = hist_in(&d);
    assert_eq!(h3.month("2026-11")["stops"].as_array().unwrap().len(), 0);
    h3.scan(&j);
    h3.scan(&j);
    assert_eq!(all_stops(&h3), want);
    let _ = fs::remove_dir_all(&d);
    let _ = fs::remove_dir_all(&j);
}

#[test]
fn the_index_summary_has_the_counts_credits_light_years_tops_and_a_density_grid() {
    let d = tmp("sum");
    let j = tmp("sum-j");
    let mut t = loc("2026-11-24T10:00:00Z", "Sol", 0.0, Some(("Galileo", 1)));
    t += &jump("2026-11-24T10:05:00Z", "Alpha", 3.0);
    t += &dock("2026-11-24T10:06:00Z", "Port", 77);
    t += &sell("2026-11-24T10:07:00Z", 77, "Gold", 5, 5000);
    t += &sell("2026-11-24T10:08:00Z", 77, "Silver", 5, 700);
    t += &sell("2026-11-24T10:08:30Z", 77, "Gold", 1, 100);
    t += &buy("2026-11-24T10:09:00Z", 77, "Steel", 10, 300);
    t += &l("2026-11-24T10:10:00Z", "MultiSellExplorationData", ", \"TotalEarnings\":1500");
    t += &l("2026-11-24T10:11:00Z", "RedeemVoucher", ", \"Type\":\"bounty\", \"Amount\":200");
    t += &l("2026-11-24T10:12:00Z", "MissionCompleted", ", \"Reward\":1000");
    t += &l("2026-11-24T10:20:00Z", "FSDJump", ", \"StarSystem\":\"Far\", \"StarPos\":[1000.0,2.5,3.0]");
    t += &jump("2026-11-24T10:30:00Z", "Alpha", 3.0);
    fs::write(j.join("Journal.2026-11-24T100000.01.log"), t).unwrap();
    let h = hist_in(&d);
    h.scan(&j);
    let idx = h.index(None, None);
    let m = &idx["months"][0];
    assert_eq!((m["n"].as_u64(), m["sys"].as_u64()), (Some(4), Some(3)), "four stops, three different systems");
    assert_eq!(m["cr"], 5000 + 700 + 100 + 1500 + 200 + 1000);
    // Sol -> Alpha 3, Alpha -> Far 997, Far -> Alpha 997 (y and z are the same)
    assert_eq!(m["ly"].as_f64().unwrap(), 3.0 + 997.0 + 997.0);
    assert_eq!(m["sell"], json!([["Gold", 5100], ["Silver", 700]]));
    assert_eq!(m["buy"], json!([["Steel", 300]]));
    assert_eq!(m["dock"], json!([["Galileo", 1], ["Port", 1]]));
    // cells of 500 ly: Sol and the two Alpha stops are in cell (0, 0), Far in (2, 0)
    assert_eq!(m["grid"], json!([[0, 0, 3], [2, 0, 1]]));
    assert_eq!(m["t0"], "2026-11-24T10:00:00Z");
    assert_eq!(m["t1"], "2026-11-24T10:30:00Z");
    assert_eq!(idx["total"], 4);
    let _ = fs::remove_dir_all(&d);
    let _ = fs::remove_dir_all(&j);
}

#[test]
fn the_grid_keeps_at_most_300_cells_and_drops_the_rarest() {
    let mut stops: Vec<Stop> = Vec::new();
    for i in 0..400 { stops.push(Stop { t: format!("2026-11-24T10:{:02}:00Z", i % 60), sys: format!("S{i}"), x: i as f64 * 500.0 + 1.0, y: 0.0, z: 0.0, how: "jump".into(), ..Default::default() }); }
    for _ in 0..3 { stops.push(Stop { t: "2026-11-24T11:00:00Z".into(), sys: "Hub".into(), x: 1.0, y: 0.0, z: 0.0, how: "jump".into(), ..Default::default() }); }
    let s = super::summary::sum_of(&stops, 1);
    assert_eq!(s.grid.len(), 300);
    assert!(s.grid.iter().any(|c| *c == (0, 0, 4)), "the busiest cell stays");
}

#[test]
fn find_is_newest_first_limited_and_says_when_it_stopped_early() {
    let d = tmp("find");
    let j = tmp("find-j");
    let mut a = jump("2026-10-05T10:00:00Z", "Colonia Gate", 1.0);
    a += &dock("2026-10-05T10:01:00Z", "Jaques Station", 5);
    a += &sell("2026-10-05T10:02:00Z", 5, "Gold", 1, 10);
    let mut b = jump("2026-11-05T10:00:00Z", "Colonia Two", 2.0);
    b += &dock("2026-11-05T10:01:00Z", "Gold Port", 6);
    b += &sell("2026-11-05T10:02:00Z", 6, "Gold", 2, 20);
    b += &jump("2026-11-06T10:00:00Z", "Plain", 3.0);
    fs::write(j.join("Journal.2026-10-05T100000.01.log"), a).unwrap();
    fs::write(j.join("Journal.2026-11-05T100000.01.log"), b).unwrap();
    let h = hist_in(&d);
    h.scan(&j);
    let r = h.find("gold", 30);
    let items = r["items"].as_array().unwrap();
    assert_eq!(r["done"], true);
    assert_eq!(items.len(), 3, "{r}");
    assert_eq!(items[0]["m"], "2026-11");
    assert_eq!((items[0]["k"].as_str(), items[0]["what"].as_str(), items[0]["st"].as_str()), (Some("sell"), Some("Gold"), Some("Gold Port")));
    assert_eq!(items[1]["k"], "dock");
    assert_eq!(items[2]["m"], "2026-10");
    assert_eq!(items[2]["cr"], 10);
    let r = h.find("COLONIA", 30);
    assert_eq!(r["items"].as_array().unwrap().iter().map(|x| x["sys"].as_str().unwrap()).collect::<Vec<_>>(), ["Colonia Two", "Colonia Gate"]);
    assert_eq!(r["items"][0]["k"], "sys");
    let r = h.find("gold", 2);
    assert_eq!(r["items"].as_array().unwrap().len(), 2);
    assert_eq!(r["done"], false, "more matches exist");
    let r = h.find("gold", 3);
    assert_eq!(r["done"], true, "exactly the limit and nothing more");
    assert_eq!(h.find("g", 5)["items"].as_array().unwrap().len(), 0, "at least 2 characters");
    assert_eq!(h.find("nothing like this", 5)["items"].as_array().unwrap().len(), 0);
    let _ = fs::remove_dir_all(&d);
    let _ = fs::remove_dir_all(&j);
}

#[test]
fn a_broken_line_and_a_file_boundary_keep_working_in_the_archive() {
    let d = tmp("boundary");
    let j = tmp("boundary-j");
    fs::write(j.join("Journal.2026-11-24T100000.01.log"), jump("2026-11-24T10:00:00Z", "B", 1.0) + &dock("2026-11-24T10:05:00Z", "Port B", 88) + "{ \"timestamp\":\"2026-11-24T10:06:00Z\", \"event\":\"FSDJump\", \"StarSystem\":\"Cut o\n").unwrap();
    fs::write(j.join("Journal.2026-11-24T120000.01.log"),
        sell("2026-11-24T12:00:00Z", 88, "Gold", 3, 300) + &loc("2026-11-24T12:00:05Z", "B", 1.0, Some(("Port B", 88))) + &jump("2026-11-24T12:10:00Z", "C", 5.0)).unwrap();
    let h = hist_in(&d);
    h.scan(&j);
    let s = all_stops(&h);
    assert_eq!(s.iter().map(|x| x.sys.as_str()).collect::<Vec<_>>(), ["B", "C"], "the restart in B is not a new stop");
    let sell = s[0].acts.iter().find(|a| a.k == "sell").expect("the head trade joins the stop of the file before");
    assert_eq!(sell.st, "Port B");
    assert_eq!(s[0].acts.iter().filter(|a| a.k == "dock").count(), 1);
    let _ = fs::remove_dir_all(&d);
    let _ = fs::remove_dir_all(&j);
}

/// Burak's own Journal folder, read into a temporary data folder (never the real one): cargo test visits_real_folder -- --ignored --nocapture
#[test]
#[ignore]
fn visits_real_folder() {
    let Some(j) = crate::journal::saved_games() else { panic!("no Journal folder") };
    let d = tmp("real");
    let h = hist_in(&d);
    let t0 = Instant::now();
    h.scan(&j);
    let cold = t0.elapsed();
    let t1 = Instant::now();
    h.scan(&j);
    let warm = t1.elapsed();
    let s = all_stops(&h);
    let idx = h.index(None, None);
    let size: u64 = fs::read_dir(d.join("visits")).unwrap().filter_map(|e| e.ok()).filter_map(|e| e.metadata().ok()).map(|m| m.len()).sum();
    println!("stops {}, months {}, cold scan {} ms, no-change scan {} ms, archive {} KB, index answer {} KB", s.len(), idx["months"].as_array().unwrap().len(), cold.as_millis(), warm.as_millis(), size / 1024, idx.to_string().len() / 1024);
    assert!(!s.is_empty());
    let v: Value = h.find("a", 3);
    assert!(v["items"].is_array());
    let _ = fs::remove_dir_all(&d);
}

/// THE GAME'S FILES ARE READ ONLY: the store never writes or deletes in a folder that holds game files or is not its own "visits" folder.
#[test]
fn the_store_refuses_a_folder_that_holds_game_files() {
    use super::hist::safe_store_dir;
    let d = std::env::temp_dir().join(format!("gravitas-safe-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    assert!(safe_store_dir(&d), "an empty temp folder is fine in tests");
    std::fs::write(d.join("Journal.2026-11-24T120000.01.log"), "x").unwrap();
    assert!(!safe_store_dir(&d), "a folder with a Journal in it is never used");
    std::fs::remove_file(d.join("Journal.2026-11-24T120000.01.log")).unwrap();
    std::fs::write(d.join("Status.json"), "{}").unwrap();
    assert!(!safe_store_dir(&d), "Status.json too");
    let _ = std::fs::remove_dir_all(&d);
    assert!(!safe_store_dir(std::path::Path::new("C:/Users/Someone/Saved Games/Frontier Developments/Elite Dangerous")));
    assert!(!safe_store_dir(std::path::Path::new("C:/Users/Someone/AppData/Roaming/com.gravitasmap.app/other")));
}
