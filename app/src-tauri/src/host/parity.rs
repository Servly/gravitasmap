//! Proof against the Python plugin: the app's host, fed the same Journal under the same fake clock, must answer what the plugin
//! answered (research/app-golden/fixtures, made by make_golden.py from the plugin 0.45.0). A fixture whose Journal is not in this
//! PC's Saved Games folder is skipped with a note. Run: cargo test parity -- --nocapture
use super::*;
use std::path::PathBuf;

pub fn golden_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../research/app-golden/fixtures")
}

/// Equal as JSON: numbers by value (Python writes 5.0, JavaScript 5), objects without caring about key order.
pub fn first_diff(path: &str, a: &Value, b: &Value) -> Option<String> {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => {
            let (x, y) = (x.as_f64().unwrap_or(f64::NAN), y.as_f64().unwrap_or(f64::NAN));
            if x == y || (x.is_nan() && y.is_nan()) { None } else { Some(format!("{path}: {x} != {y}")) }
        }
        (Value::Object(x), Value::Object(y)) => {
            for (k, v) in x {
                match y.get(k) {
                    Some(w) => {
                        if let Some(d) = first_diff(&format!("{path}.{k}"), v, w) {
                            return Some(d);
                        }
                    }
                    None => return Some(format!("{path}.{k}: only in the plugin's answer ({})", short(v))),
                }
            }
            y.keys().find(|k| !x.contains_key(*k)).map(|k| format!("{path}.{k}: only in the app's answer"))
        }
        (Value::Array(x), Value::Array(y)) => {
            if x.len() != y.len() {
                return Some(format!("{path}: {} entries != {}", x.len(), y.len()));
            }
            for (i, (v, w)) in x.iter().zip(y).enumerate() {
                if let Some(d) = first_diff(&format!("{path}[{i}]"), v, w) {
                    return Some(d);
                }
            }
            None
        }
        _ => {
            if a == b { None } else { Some(format!("{path}: {} != {}", short(a), short(b))) }
        }
    }
}

fn short(v: &Value) -> String {
    let s = v.to_string();
    if s.len() > 90 { format!("{}...", &s[..90]) } else { s }
}

pub struct Fixture {
    pub doc: Value,
    pub raw: Vec<String>,
    pub pre: Vec<usize>,
}

/// The fixture and its Journal (None, with a note, when this PC has not got the Journal).
pub fn load(name: &str) -> Option<Fixture> {
    let path = golden_dir().join(format!("{name}.json"));
    let doc: Value = serde_json::from_str(&std::fs::read_to_string(&path).ok()?).ok()?;
    let jname = doc["journal"].as_str()?;
    // a real Journal of this PC, or one of the made-up hard fights (research/app-golden/stress)
    let stress = golden_dir().join("../stress").join(jname);
    let jf = if stress.exists() { stress } else { crate::journal::saved_games()?.join(jname) };
    let text = match std::fs::read(&jf) {
        Ok(b) => String::from_utf8_lossy(&b).into_owned(),
        Err(_) => {
            println!("SKIP {name}: {} is not in this PC's Journal folder", doc["journal"]);
            return None;
        }
    };
    let raw: Vec<String> = text.split('\n').map(|l| l.trim_end_matches(['\r', '\n']).to_string()).filter(|l| !l.trim().is_empty()).collect();
    let mut stamped: Vec<(f64, usize)> = raw
        .iter()
        .enumerate()
        .filter_map(|(i, l)| {
            let a = l.find("\"timestamp\":\"")? + 13;
            let ts = &l[a..a + l[a..].find('"')?];
            Some((parse_ts(ts)?, i))
        })
        .collect();
    stamped.sort_by(|x, y| x.partial_cmp(y).unwrap());
    let pct = doc["prefill_pct"].as_i64().unwrap_or(0) as usize;
    let n_pre = stamped.len() * pct / 100;
    let pre = stamped[..n_pre].iter().map(|r| r.1).collect();
    Some(Fixture { doc, raw, pre })
}

pub fn line_value(raw: &str) -> Option<Value> {
    serde_json::from_str::<Value>(raw.trim()).ok().filter(Value::is_object)
}

/// The schedule as the plugin ran it: (time in ms, Some(line index) or None for a tick).
pub fn steps(doc: &Value) -> Vec<(i64, Option<usize>)> {
    let mut out = Vec::new();
    for e in doc["schedule"].as_array().unwrap() {
        let e = e.as_array().unwrap();
        let t = e[0].as_i64().unwrap();
        if e.len() == 2 {
            out.push((t, Some(e[1].as_u64().unwrap() as usize)));
        } else {
            let (step, count) = (e[2].as_i64().unwrap(), e[3].as_i64().unwrap());
            for k in 0..count {
                out.push((t + step * k, None));
            }
        }
    }
    out
}

pub fn clock_start(fx: &Fixture) -> f64 {
    let stamp = |i: usize| {
        let l = &fx.raw[i];
        let a = l.find("\"timestamp\":\"").unwrap() + 13;
        parse_ts(&l[a..a + l[a..].find('"').unwrap()]).unwrap()
    };
    let _ = stamp;
    fx.doc["clock0_ms"].as_i64().unwrap() as f64 / 1000.0
}

fn engine_run(name: &str) -> Result<usize, String> {
    let fx = match load(name) {
        Some(f) => f,
        None => return Ok(0),
    };
    let mut host = Host::new(true)?;
    // the plugin's variants of the settings (make_golden.py VARIANTS): "wing" has combat bonds on
    host.set.always = false; // (the plugin's own default; the app's default is on: every window that is on stays up, as the Bounty counter does)
    host.set.wing_bonus_on = false; // (likewise: the app counts the wing bonus on by default)
    host.set.claims_dedupe = false; // (the plugin counted a repeated Bounty line twice)
    host.set.keep_hidden_in_panel = false; // (the plugin showed the windows again at the end of a free look over a panel)
    host.set.claim_bonds = false; // (the plugin's Claims never counted bonds)
    host.set.claims_note = false; // (the plugin's report has no Claims note)
    host.set.live_key_hints = false; // (the plugin's footers name its fixed Ctrl+Shift+F7..F12)
    match fx.doc["variant"].as_str() {
        Some("wing") => {
            host.set.bonds = true;
            host.set.wing_bonus_on = true;
            host.set.sort = "s".into();
            host.set.order = ["Fer-de-Lance", "Corsair", "Python Mk II"].iter().map(|s| s.to_string()).collect();
        }
        Some("always") => {
            host.set.always = true;
            host.set.show_gone = true;
        }
        _ => {}
    }
    for (_, w) in host.set.win.iter_mut() {
        w.on = true; // (make_golden.py turns every window on, so every card is checked)
    }
    let clock0 = clock_start(&fx);
    // the plugin's start: the past (the first part of the Journal) is read as it starts, 0.1 s after the clock's start
    let mut now = if fx.pre.is_empty() { clock0 } else { prefill_end(&fx) + 1.0 };
    now += 0.1;
    host.eng.set_now((now * 1000.0) as i64);
    let past: Vec<Value> = fx.pre.iter().filter_map(|&i| line_value(&fx.raw[i])).collect();
    host.catch_up(&past);
    // the older Journals: the plugin read the game folder (here: one Journal, the newest, holding what the past part had written)
    let dir = std::env::temp_dir().join(format!("gravitas_parity_{}_{}", std::process::id(), name));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let newest = dir.join("Journal.2026-01-01T000000.01.log");
    let text: String = fx.pre.iter().map(|&i| format!("{}
", fx.raw[i])).collect();
    std::fs::write(&newest, text).map_err(|e| e.to_string())?;
    host.claims.start(Some(&dir), Some(&newest));
    host.claims.wait_for_old();

    let records = fx.doc["records"].as_array().unwrap();
    let mut next = 0usize;
    let mut compared = 0usize;
    for (t_ms, line) in steps(&fx.doc) {
        now = t_ms as f64 / 1000.0;
        host.eng.set_now(t_ms);
        if let Some(i) = line {
            if let Some(e) = line_value(&fx.raw[i]) {
                host.handle(&e, now);
            }
            continue;
        }
        let t = host.draw(now);
        if next < records.len() && records[next]["t"].as_i64() == Some(t_ms) {
            let r = &records[next];
            let null = Value::Null;
            let mine = |v: &Option<Value>| v.clone().unwrap_or(Value::Null);
            // (the card that says which mode came on is the app's own: the plugin has none)
            let items = t.items.clone().map(|v| Value::Array(v.into_iter().filter(|i| i[0].as_str() != Some("modecard")).collect())).unwrap_or(Value::Null);
            let checks: [(&str, Value, &Value); 8] = [
                ("items", items, &r["items"]),
                ("counter", t.counter.clone(), &r["counter"]),
                ("claims", t.claims.clone(), &r["claims"]),
                ("view", mine(&t.view), &r["view"]),
                ("scan", mine(&t.scan), &r["scan"]),
                ("gone", mine(&t.gone), &r["gone"]),
                ("had_fire", Value::Bool(t.had_fire), &r["had_fire"]),
                ("report_until", json!((t.report_until * 1000.0).round() / 1000.0), &r["report_until"]),
            ];
            for (what, mine, theirs) in checks {
                let theirs = if theirs.is_null() { &null } else { theirs };
                if let Some(d) = first_diff(what, theirs, &mine) {
                    return Err(format!("{name}: at {t_ms} ms (record {next}) the plugin and the app differ in {d}"));
                }
            }
            compared += 1;
            next += 1;
        }
    }
    if next != records.len() {
        return Err(format!("{name}: only {next} of {} records were reached", records.len()));
    }
    Ok(compared)
}


/// The same replay, but the Journal goes through the app's own live path: a file on disk, read by journal::Tail (the past as the app starts, then
/// every new line), exactly as live.rs feeds the host.
fn engine_run_tail(name: &str) -> Result<usize, String> {
    let fx = match load(name) {
        Some(f) => f,
        None => return Ok(0),
    };
    let mut host = Host::new(true)?;
    // the plugin's variants of the settings (make_golden.py VARIANTS): "wing" has combat bonds on
    host.set.always = false; // (the plugin's own default; the app's default is on: every window that is on stays up, as the Bounty counter does)
    host.set.wing_bonus_on = false; // (likewise: the app counts the wing bonus on by default)
    host.set.claims_dedupe = false; // (the plugin counted a repeated Bounty line twice)
    host.set.keep_hidden_in_panel = false; // (the plugin showed the windows again at the end of a free look over a panel)
    host.set.claim_bonds = false; // (the plugin's Claims never counted bonds)
    host.set.claims_note = false; // (the plugin's report has no Claims note)
    host.set.live_key_hints = false; // (the plugin's footers name its fixed Ctrl+Shift+F7..F12)
    match fx.doc["variant"].as_str() {
        Some("wing") => {
            host.set.bonds = true;
            host.set.wing_bonus_on = true;
            host.set.sort = "s".into();
            host.set.order = ["Fer-de-Lance", "Corsair", "Python Mk II"].iter().map(|s| s.to_string()).collect();
        }
        Some("always") => {
            host.set.always = true;
            host.set.show_gone = true;
        }
        _ => {}
    }
    for (_, w) in host.set.win.iter_mut() {
        w.on = true; // (make_golden.py turns every window on, so every card is checked)
    }
    let clock0 = clock_start(&fx);
    // the plugin's start: the past (the first part of the Journal) is read as it starts, 0.1 s after the clock's start
    let mut now = if fx.pre.is_empty() { clock0 } else { prefill_end(&fx) + 1.0 };
    now += 0.1;
    host.eng.set_now((now * 1000.0) as i64);
    // the older Journals: the plugin read the game folder (here: one Journal, the newest, holding what the past part had written)
    let dir = std::env::temp_dir().join(format!("gravitas_parity_{}_{}", std::process::id(), name));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let newest = dir.join("Journal.2026-01-01T000000.01.log");
    let text: String = fx.pre.iter().map(|&i| format!("{}
", fx.raw[i])).collect();
    std::fs::write(&newest, text).map_err(|e| e.to_string())?;
    let mut tail = crate::journal::Tail::with_folder(dir.clone());
    tail.collect = true;
    tail.poll();
    let (past, live0): (Vec<_>, Vec<_>) = tail.take().into_iter().partition(|(_, live)| !*live);
    if !live0.is_empty() { return Err(format!("{name}: the first look gave live lines")); }
    host.claims.start(Some(&dir), tail.path().map(|p| p.as_path()));
    host.catch_up(&past.into_iter().map(|(v, _)| v).collect::<Vec<_>>());
    host.claims.wait_for_old();
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new().append(true).open(&newest).map_err(|e| e.to_string())?;

    let records = fx.doc["records"].as_array().unwrap();
    let mut next = 0usize;
    let mut compared = 0usize;
    for (t_ms, line) in steps(&fx.doc) {
        now = t_ms as f64 / 1000.0;
        host.eng.set_now(t_ms);
        if let Some(i) = line {
            writeln!(file, "{}", fx.raw[i]).map_err(|e| e.to_string())?;
            file.flush().map_err(|e| e.to_string())?;
            tail.poll();
            for (e, live) in tail.take() {
                if !live { return Err(format!("{name}: a past line after the start")); }
                host.handle(&e, now);
            }
            continue;
        }
        let t = host.draw(now);
        if next < records.len() && records[next]["t"].as_i64() == Some(t_ms) {
            let r = &records[next];
            let null = Value::Null;
            let mine = |v: &Option<Value>| v.clone().unwrap_or(Value::Null);
            // (the card that says which mode came on is the app's own: the plugin has none)
            let items = t.items.clone().map(|v| Value::Array(v.into_iter().filter(|i| i[0].as_str() != Some("modecard")).collect())).unwrap_or(Value::Null);
            let checks: [(&str, Value, &Value); 8] = [
                ("items", items, &r["items"]),
                ("counter", t.counter.clone(), &r["counter"]),
                ("claims", t.claims.clone(), &r["claims"]),
                ("view", mine(&t.view), &r["view"]),
                ("scan", mine(&t.scan), &r["scan"]),
                ("gone", mine(&t.gone), &r["gone"]),
                ("had_fire", Value::Bool(t.had_fire), &r["had_fire"]),
                ("report_until", json!((t.report_until * 1000.0).round() / 1000.0), &r["report_until"]),
            ];
            for (what, mine, theirs) in checks {
                let theirs = if theirs.is_null() { &null } else { theirs };
                if let Some(d) = first_diff(what, theirs, &mine) {
                    return Err(format!("{name}: at {t_ms} ms (record {next}) the plugin and the app differ in {d}"));
                }
            }
            compared += 1;
            next += 1;
        }
    }
    if next != records.len() {
        return Err(format!("{name}: only {next} of {} records were reached", records.len()));
    }
    Ok(compared)
}


fn prefill_end(fx: &Fixture) -> f64 {
    let mut last = 0.0f64;
    for &i in &fx.pre {
        let l = &fx.raw[i];
        if let Some(a) = l.find("\"timestamp\":\"") {
            let a = a + 13;
            if let Some(e) = l[a..].find('"') {
                if let Some(t) = parse_ts(&l[a..a + e]) {
                    last = last.max(t);
                }
            }
        }
    }
    last
}

#[test]
fn engine_answers_match_the_plugin() {
    let mut total = 0;
    let mut fixtures = 0;
    let mut bad = Vec::new();
    let mut names: Vec<String> = std::fs::read_dir(golden_dir())
        .map(|d| d.filter_map(|e| e.ok()).filter_map(|e| e.file_name().into_string().ok()).filter(|n| n.ends_with(".all.json") || n.ends_with(".wing.json") || n.ends_with(".always.json")).map(|n| n.trim_end_matches(".json").to_string()).collect())
        .unwrap_or_default();
    names.sort();
    if let Ok(f) = std::env::var("FIXTURE") {
        names.retain(|n| n.starts_with(&f)); // (FIXTURE=bonds1031 runs only the fixtures whose name starts so)
    }
    for n in &names {
        match engine_run(n) {
            Ok(c) => {
                println!("{n}: {c} records compared, all equal");
                total += c;
                fixtures += (c > 0) as usize;
            }
            Err(e) => {
                println!("{e}");
                bad.push(e);
            }
        }
    }
    println!("engine parity: {fixtures} fixtures, {total} records compared, {} differences", bad.len());
    assert!(names.is_empty() || fixtures > 0, "no fixture could be run");
    assert!(bad.is_empty(), "{}", bad.join("\n"));
}


#[test]
fn live_path_matches_the_plugin() {
    let mut names: Vec<String> = std::fs::read_dir(golden_dir())
        .map(|d| d.filter_map(|e| e.ok()).filter_map(|e| e.file_name().into_string().ok()).filter(|n| n.ends_with(".all.json") || n.ends_with(".wing.json")).map(|n| n.trim_end_matches(".json").to_string()).collect())
        .unwrap_or_default();
    names.sort();
    if let Ok(f) = std::env::var("FIXTURE") { names.retain(|n| n.starts_with(&f)); }
    let (mut total, mut fixtures, mut bad) = (0, 0, Vec::new());
    for n in &names {
        match engine_run_tail(n) {
            Ok(c) => { println!("{n}: {c} records compared through the live path, all equal"); total += c; fixtures += (c > 0) as usize; }
            Err(e) => { println!("{e}"); bad.push(e); }
        }
    }
    println!("live path: {fixtures} fixtures, {total} records, {} differences", bad.len());
    assert!(bad.is_empty(), "{}", bad.join("
"));
}
