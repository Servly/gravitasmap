//! Ignored tests of the travel history archive: the scale test with made-up Journals and the dump of the real folder for the window's mock.
//!   cargo test --release visits_archive_stress -- --ignored --nocapture      (env VISITS_STRESS = number of stops, default 500000)
//!   cargo test visits_dump_fixture -- --ignored --nocapture                  (env VISITS_FIXTURE_DIR = where the answers go)
use super::archive_tests::{age, hist_in};
use super::hist_tests::tmp;
use std::fs;
use std::io::Write;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

fn rss_mb() -> u64 {
    use sysinfo::{ProcessesToUpdate, System};
    let pid = sysinfo::get_current_pid().unwrap();
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::Some(&[pid]), true);
    sys.process(pid).map(|p| p.memory() / (1024 * 1024)).unwrap_or(0)
}

/// (year, month, day) of a day number counted from 1970-01-01
fn civil(z: i64) -> (i64, i64, i64) {
    let z = z + 719468;
    let era = z.div_euclid(146097);
    let doe = z.rem_euclid(146097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// Journal files that look like real ones: FSDJump with StarSystem and StarPos, on ~30 % of the jumps Docked, MarketBuy and MarketSell.
/// `files` files from 2016-01 to 2026-11, `total` jumps together. One rare system and one rare station in 2018. Streamed to disk.
fn make_journals(dir: &Path, files: usize, total: usize) -> (String, usize) {
    let per = (total / files).max(1);
    let start = 16801; // 2016-01-01
    let end = 20781; // 2026-11-24
    let mut seed: u64 = 0x9e3779b97f4a7c15;
    let mut rnd = move || { seed ^= seed << 13; seed ^= seed >> 7; seed ^= seed << 17; seed };
    let mut made = 0usize;
    let mut newest = String::new();
    for f in 0..files {
        let day = start + (f as i64) * (end - start) / (files as i64 - 1).max(1);
        let (y, m, d) = civil(day);
        let name = format!("Journal.{y:04}-{m:02}-{d:02}T080000.01.log");
        newest = name.clone();
        let mut w = std::io::BufWriter::new(fs::File::create(dir.join(&name)).unwrap());
        for k in 0..per {
            if made >= total { break; }
            made += 1;
            let secs = 8 * 3600 + k * 25;
            let ts = format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z", secs / 3600 % 24, secs / 60 % 60, secs % 60);
            let r = rnd();
            let (x, yy, z) = (((r >> 8) % 80000) as f64 / 2.0 - 20000.0, ((r >> 24) % 2000) as f64 / 2.0 - 500.0, ((r >> 36) % 80000) as f64 / 2.0 - 20000.0 + 25000.0);
            let rare = f == files / 4 && k == 7;
            let sys = if rare { "Zzyzx Rarefied Reach".to_string() } else { format!("Col {} Sector AB-C d{}-{}", r % 999, r % 7, made) };
            writeln!(w, "{{ \"timestamp\":\"{ts}\", \"event\":\"FSDJump\", \"StarSystem\":\"{sys}\", \"SystemAddress\":{}, \"StarPos\":[{x:.5},{yy:.5},{z:.5}], \"JumpDist\":{:.3}, \"FuelUsed\":1.2 }}", r % 100000000, (r % 90) as f64 / 3.0 + 4.0).unwrap();
            if r % 10 < 3 || rare {
                let st = if rare { "Rarefied Orbital".to_string() } else { format!("Orbital Port {}", r % 5000) };
                let mid = 3500000000u64 + r % 90000000;
                writeln!(w, "{{ \"timestamp\":\"{ts}\", \"event\":\"Docked\", \"StationName\":\"{st}\", \"StationType\":\"Coriolis\", \"StarSystem\":\"{sys}\", \"MarketID\":{mid} }}").unwrap();
                writeln!(w, "{{ \"timestamp\":\"{ts}\", \"event\":\"MarketBuy\", \"MarketID\":{mid}, \"Type\":\"steel\", \"Type_Localised\":\"Steel\", \"Count\":{}, \"BuyPrice\":100, \"TotalCost\":{} }}", r % 200, (r % 200) * 100).unwrap();
                writeln!(w, "{{ \"timestamp\":\"{ts}\", \"event\":\"MarketSell\", \"MarketID\":{mid}, \"Type\":\"gold\", \"Type_Localised\":\"Gold\", \"Count\":{}, \"SellPrice\":50000, \"TotalSale\":{} }}", r % 30 + 1, (r % 30 + 1) * 50000).unwrap();
                writeln!(w, "{{ \"timestamp\":\"{ts}\", \"event\":\"Undocked\", \"StationName\":\"{st}\", \"MarketID\":{mid} }}").unwrap();
            }
        }
        w.flush().unwrap();
    }
    (newest, made)
}

fn dir_size(d: &Path) -> u64 { fs::read_dir(d).map(|r| r.filter_map(|e| e.ok()).filter_map(|e| e.metadata().ok()).map(|m| m.len()).sum()).unwrap_or(0) }

/// The scale test of the archive: cold first scan, memory, what the window gets, search, live change. Compare with the single-file design:
/// 500,000 stops = file 92 MB, load 4.1 s, +194 MB memory, every new jump re-sent 92 MB.
#[test]
#[ignore]
fn visits_archive_stress() {
    let total: usize = std::env::var("VISITS_STRESS").ok().and_then(|v| v.parse().ok()).unwrap_or(500_000);
    let files = 1400;
    let d = tmp("astress");
    let j = tmp("astress-j");
    let t = Instant::now();
    let (newest, made) = make_journals(&j, files, total);
    let jsize = dir_size(&j);
    println!("made {made} jumps in {files} Journal files, {} MB, in {} ms", jsize / 1048576, t.elapsed().as_millis());
    let base = rss_mb();
    let peak = Arc::new(AtomicU64::new(base));
    let stop = Arc::new(AtomicBool::new(false));
    let sampler = { let (p, s) = (Arc::clone(&peak), Arc::clone(&stop)); std::thread::spawn(move || { while !s.load(Ordering::SeqCst) { p.fetch_max(rss_mb(), Ordering::SeqCst); std::thread::sleep(Duration::from_millis(40)); } }) };

    // cold first scan through the real entry (the background thread), polled like the window does
    let h = hist_in(&d);
    let t0 = Instant::now();
    let first = h.index(Some(j.clone()), None);
    assert_eq!(first["scanning"], true);
    let mut newest12_ms = None;
    let mut ans_during = 0usize;
    let mut r;
    let _ = first;
    loop {
        std::thread::sleep(Duration::from_millis(15));
        r = h.index(Some(j.clone()), None);
        if newest12_ms.is_none() && r["months"].as_array().map_or(false, |m| m.iter().any(|x| x["m"] == "2026-11")) { newest12_ms = Some(t0.elapsed().as_millis()); ans_during = r.to_string().len(); }
        if r["scanning"] == false && r["total"].as_u64().unwrap_or(0) as usize >= made { break; }
        if t0.elapsed().as_secs() > 600 { panic!("scan too slow"); }
    }
    let cold = t0.elapsed();
    while !h.idle() { std::thread::sleep(Duration::from_millis(10)); }
    stop.store(true, Ordering::SeqCst);
    sampler.join().unwrap();
    println!("cold first scan: total {} ms, newest months listed after {:?} ms, memory +{} MB at the peak, now +{} MB (base {base} MB), {} month files written ({} MB)",
        cold.as_millis(), newest12_ms, peak.load(Ordering::SeqCst).saturating_sub(base), rss_mb().saturating_sub(base), h.writes.load(Ordering::SeqCst), h.write_bytes.load(Ordering::SeqCst) / 1048576);
    assert_eq!(r["total"].as_u64().unwrap() as usize, made);
    let months = r["months"].as_array().unwrap().len();
    let idx_text = r.to_string();
    let vdir = d.join("visits");
    println!("months {months}, index.json {} KB, index answer {} KB (first listing {} KB), archive total {} MB, Journals {} MB",
        fs::metadata(vdir.join("index.json")).unwrap().len() / 1024, idx_text.len() / 1024, ans_during / 1024, dir_size(&vdir) / 1048576, jsize / 1048576);

    // one month at a time
    let ms: Vec<String> = r["months"].as_array().unwrap().iter().map(|m| m["m"].as_str().unwrap().to_string()).collect();
    let newest_m = ms.last().unwrap().clone();
    let m2018 = ms.iter().find(|m| m.starts_with("2018")).cloned().unwrap_or_else(|| ms[ms.len() / 2].clone());
    for m in [newest_m.clone(), m2018.clone()] {
        let t = Instant::now();
        let a = h.month(&m);
        let ms_ = t.elapsed().as_millis();
        let text = a.to_string();
        println!("visits_month {m}: {} stops, {} KB as text, {ms_} ms (+ text {} ms)", a["stops"].as_array().unwrap().len(), text.len() / 1024, t.elapsed().as_millis() - ms_);
    }
    // search
    for (q, label) in [("zzyzx rarefied", "rare"), ("rarefied orbital", "rare station"), ("sector", "common"), ("steel", "common goods")] {
        let t = Instant::now();
        let a = h.find(q, 30);
        println!("visits_find {label} ({q}): {} items, done {}, {} ms, {} KB", a["items"].as_array().unwrap().len(), a["done"], t.elapsed().as_millis(), a.to_string().len() / 1024);
    }
    let t = Instant::now();
    let none = h.find("no such thing anywhere", 30);
    println!("visits_find no match at all: {} items, {} ms", none["items"].as_array().unwrap().len(), t.elapsed().as_millis());

    // no-change calls
    let rev = r["rev"].as_u64().unwrap();
    let t = Instant::now();
    let same = h.index(None, Some(rev));
    let same_us = t.elapsed().as_micros();
    assert_eq!(same["same"], true);
    let t = Instant::now();
    h.scan(&j);
    println!("no-change index call {same_us} us, no-change scan (stat of {files} files) {} ms", t.elapsed().as_millis());

    // a live change: one jump appended to the newest Journal
    let w0 = (h.writes.load(Ordering::SeqCst), h.write_bytes.load(Ordering::SeqCst));
    let mut f = fs::OpenOptions::new().append(true).open(j.join(&newest)).unwrap();
    writeln!(f, "{{ \"timestamp\":\"2026-11-24T23:00:00Z\", \"event\":\"FSDJump\", \"StarSystem\":\"Live Stress Jump\", \"StarPos\":[1.0,2.0,3.0] }}").unwrap();
    drop(f);
    let t = Instant::now();
    h.scan(&j);
    let idx2 = h.index(None, None);
    let seen = h.month("2026-11")["stops"].to_string().contains("Live Stress Jump");
    println!("live change: scan {} ms, rev changed {}, the page can read the new stop {seen}, files written at once {} ({} KB)",
        t.elapsed().as_millis(), idx2["rev"].as_u64().unwrap() != rev, h.writes.load(Ordering::SeqCst) - w0.0, (h.write_bytes.load(Ordering::SeqCst) - w0.1) / 1024);
    age(&h);
    let t = Instant::now();
    h.scan(&j);
    println!("the delayed write: {} ms, {} month file(s), {} KB", t.elapsed().as_millis(), h.writes.load(Ordering::SeqCst) - w0.0, (h.write_bytes.load(Ordering::SeqCst) - w0.1) / 1024);
    assert!(seen);
    // a restart: a new instance loads the index only
    let t = Instant::now();
    let h2 = hist_in(&d);
    let i2 = h2.index(None, None);
    println!("a new start: index loaded and answered in {} ms, memory {} MB, total {}", t.elapsed().as_millis(), rss_mb().saturating_sub(base), i2["total"]);
    let _ = fs::remove_dir_all(&d);
    let _ = fs::remove_dir_all(&j);
}

/// Burak's real Journal folder (read only) -> a temporary archive -> plain answer files for the window's mock:
/// index.json = the visits_index answer, m-YYYY-MM.json = the visits_month answers. Anonymised exactly like the store.
#[test]
#[ignore]
fn visits_dump_fixture() {
    let out = std::env::var("VISITS_FIXTURE_DIR").expect("VISITS_FIXTURE_DIR");
    let Some(j) = crate::journal::saved_games() else { panic!("no Journal folder") };
    let d = tmp("fixture");
    let h = hist_in(&d);
    h.scan(&j);
    fs::create_dir_all(&out).unwrap();
    let idx = h.index(None, None);
    fs::write(Path::new(&out).join("index.json"), serde_json::to_string_pretty(&idx).unwrap()).unwrap();
    let mut n = 0;
    for m in idx["months"].as_array().unwrap() {
        let m = m["m"].as_str().unwrap();
        let a = h.month(m);
        n += a["stops"].as_array().unwrap().len();
        fs::write(Path::new(&out).join(format!("m-{m}.json")), serde_json::to_string(&a).unwrap()).unwrap();
    }
    println!("fixture: {} months, {n} stops, index total {} -> {out}", idx["months"].as_array().unwrap().len(), idx["total"]);
    let all = fs::read_dir(&out).unwrap().filter_map(|e| e.ok()).map(|e| fs::read_to_string(e.path()).unwrap_or_default()).collect::<String>();
    assert!(!all.contains("FID") && !all.contains("\"Commander\"") && !all.contains("ShipName"));
    let _ = fs::remove_dir_all(&d);
}
