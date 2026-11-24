//! The Bounty counter and Claims against the Python plugin: 2,500 random event sequences (research/app-golden/make_logic_fuzz.py) and the
//! plugin's own hand-written cases (test44.py, test45.py), as they were when they found real bugs. Run: cargo test logic -- --nocapture
use super::parity::{first_diff, golden_dir};
use crate::claims::{events_of, Claims, Owed};
use crate::counter::Counter;
use crate::pyval::{round, round_div};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

#[test]
fn counter_and_owed_match_the_plugin_on_random_sequences() {
    let path = golden_dir().join("logic_fuzz.json");
    let Ok(text) = std::fs::read_to_string(&path) else {
        println!("SKIP: {} is not made yet (python research/app-golden/make_logic_fuzz.py)", path.display());
        return;
    };
    let seqs: Vec<Value> = serde_json::from_str(&text).unwrap();
    let (mut states, mut events) = (0usize, 0usize);
    for (n, q) in seqs.iter().enumerate() {
        let evs = q["events"].as_array().unwrap();
        let (mut owed, mut counter) = (Owed::new(), Counter::new());
        let mut st = q["states"].as_array().unwrap().iter().peekable();
        for (i, e) in evs.iter().enumerate() {
            owed.feed(e);
            counter.feed(e);
            events += 1;
            if let Some(s) = st.peek() {
                if s["at"].as_u64() == Some(i as u64) {
                    let s = st.next().unwrap();
                    if let Some(d) = first_diff("owed", &s["owed"], &owed.dump()) {
                        panic!("sequence {n}, after event {i} ({}): {d}", evs[i]);
                    }
                    let mine = json!([counter.view(false), counter.view(true)]);
                    if let Some(d) = first_diff("counter", &s["counter"], &mine) {
                        panic!("sequence {n}, after event {i} ({}): {d}", evs[i]);
                    }
                    states += 1;
                }
            }
        }
    }
    println!("random sequences: {} sequences, {events} events, {states} states compared, all equal", seqs.len());
    assert!(states > 20_000);
}

#[test]
fn local_time_matches_the_plugin() {
    let path = golden_dir().join("local_time.json");
    let Ok(text) = std::fs::read_to_string(&path) else {
        println!("SKIP: {} is not made yet (python research/app-golden/make_local_time.py)", path.display());
        return;
    };
    let d: Value = serde_json::from_str(&text).unwrap();
    let mut bad = Vec::new();
    let cases = d["cases"].as_array().unwrap();
    for c in cases {
        let (ts, want) = (c[0].as_str().unwrap(), c[1].as_str().unwrap());
        let got = crate::claims::local_hhmm(ts);
        if got != want {
            bad.push(format!("{ts}: plugin {want:?}, app {got:?}"));
        }
    }
    println!("local time: {} cases in {}, {} differences", cases.len(), d["tz"], bad.len());
    assert!(bad.is_empty(), "{}", bad.iter().take(8).cloned().collect::<Vec<_>>().join("\n"));
}

/// 1,500 random fights and settings (make_model_fuzz.py) through every card model in every language: the plugin's card and the app's must be equal.
#[test]
fn card_models_match_the_plugin_on_random_input() {
    use crate::combat::{self, Opts};
    let path = golden_dir().join("model_fuzz.json");
    let Ok(text) = std::fs::read_to_string(&path) else {
        println!("SKIP: {} is not made yet (python research/app-golden/make_model_fuzz.py)", path.display());
        return;
    };
    let cases: Vec<Value> = serde_json::from_str(&text).unwrap();
    let (mut bad, mut cards) = (Vec::new(), 0usize);
    for (i, c) in cases.iter().enumerate() {
        let tr = crate::i18n::I18n::new(c["lang"].as_str().unwrap());
        let now = c["now"].as_f64().unwrap();
        let o = &c["opts"];
        let s = |k: &str| o[k].as_str().unwrap_or("").to_string();
        let b = |k: &str| o[k].as_bool().unwrap_or(false);
        let n = |k: &str| o[k].as_f64().unwrap_or(0.0);
        let opt = |k: &str| if o[k].is_null() { None } else { Some(o[k].clone()) };
        let opts = Opts {
            sort: s("sort"), order: o["order"].as_array().unwrap().iter().map(|x| x.as_str().unwrap().to_string()).collect(),
            report_s: n("report_s"), banner: b("banner"), scan: opt("scan"), tg: opt("tg"), always: b("always"),
            gone: if o["gone"].is_null() { json!({}) } else { o["gone"].clone() }, show_gone: b("show_gone"), bounty: opt("bounty"),
            wing_bonus_on: b("wing_bonus_on"), wing_bonus_op: b("wing_bonus_op"), rows: n("rows") as i64, feed_rows: 6, keys_on: b("keys_on"),
            keys_left: n("keys_left") as i64, report_on: b("report_on"), report_left: n("report_left") as i64, ..Default::default()
        };
        for (key, want) in c["out"].as_object().unwrap() {
            let mut m = combat::model(&tr, key, &c["v"], now, &opts);
            if m.is_none() && opts.always {
                m = combat::placeholder(&tr, key);
            }
            let got = m.unwrap_or(Value::Null);
            cards += 1;
            if let Some(d) = first_diff(key, want, &got) {
                bad.push(format!("case {i} ({}) {d}", c["lang"]));
            }
        }
    }
    println!("model fuzz: {} cases, {cards} cards, {} differences", cases.len(), bad.len());
    assert!(bad.is_empty(), "{}", bad.iter().take(8).cloned().collect::<Vec<_>>().join("\n"));
}

#[test]
fn python_rounding_rules() {
    // round() goes half to even; a division of whole numbers is rounded the same way
    assert_eq!([round(0.5), round(1.5), round(2.5), round(3.5), round(-0.5), round(-1.5), round(-2.5)], [0, 2, 2, 4, 0, -2, -2]);
    assert_eq!([round_div(1, 2), round_div(3, 2), round_div(5, 2), round_div(7, 2), round_div(-5, 2), round_div(1, 3), round_div(2, 3)], [0, 2, 2, 4, -2, 0, 1]);
}

// ---------------------------------------------------------------------------------------------------- test44.py (Claims, Owed)

fn b(f: &str, a: i64) -> Value {
    json!({"event": "Bounty", "Rewards": [{"Faction": f, "Reward": a}]})
}
fn r(fs: &[(&str, i64)], cut: Option<f64>) -> Value {
    let mut e = json!({"event": "RedeemVoucher", "Type": "bounty", "Factions": fs.iter().map(|(f, a)| json!({"Faction": f, "Amount": a})).collect::<Vec<Value>>()});
    if let Some(c) = cut {
        e["BrokerPercentage"] = json!(c);
    }
    e
}
fn run(evs: &[Value]) -> (i64, Vec<(String, i64)>) {
    let mut o = Owed::new();
    for e in evs {
        o.feed(e);
    }
    (o.total(), o.factions())
}
fn fx(v: &[(&str, i64)]) -> Vec<(String, i64)> {
    v.iter().map(|(f, a)| (f.to_string(), *a)).collect()
}

#[test]
fn the_plugins_claims_cases() {
    // a tester's empty faction name: the 98,388 cr is matched to Emergence, not shared out
    assert_eq!(run(&[b("TGE", 7_700_950), b("Emergence", 98_388), r(&[("", 99_277)], None)]), (7_700_950, fx(&[("TGE", 7_700_950)])));
    // Burak's 14 Nov line: Operation Ida named, 2,656,109 unnamed = the Guild's 2,470,800 in a wing, x 1.075
    let wing = json!({"event": "WingJoin"});
    let left = json!({"event": "WingLeave"});
    assert_eq!(run(&[wing, b("Operation Ida", 20_712_598), b("IPG", 2_470_800), left, r(&[("Operation Ida", 20_712_598), ("", 2_656_109)], None)]), (0, fx(&[])));
    // six unnamed amounts, one to one
    let f = [("A", 667_700), ("B", 65_600), ("C", 361_500), ("D", 2_640_700), ("E", 358_400), ("F", 11_517_944)];
    let mut evs: Vec<Value> = f.iter().map(|(n, a)| b(n, *a)).collect();
    evs.push(r(&f.iter().map(|(_, a)| ("", *a)).collect::<Vec<_>>(), None));
    assert_eq!(run(&evs), (0, fx(&[])));
    // an amount that matches nothing falls back to the proportional share
    assert_eq!(run(&[b("X", 1_000_000), r(&[("", 400_000)], None)]), (600_000, fx(&[("X", 600_000)])));
    // the 1 cr: broker cut worked back, 5 cr or less left is dust
    assert_eq!(run(&[b("J", 5), r(&[("J", 3)], Some(25.0))]), (0, fx(&[])));
    // a cash-in never goes below 0, a later unrelated bounty is whole (the v0.43 bug)
    assert_eq!(run(&[b("TGE", 12_774_627), r(&[("TGE", 13_732_725)], None), b("TGE", 1_085_922), b("SO", 576_816)]), (1_662_738, fx(&[("TGE", 1_085_922), ("SO", 576_816)])));
    assert_eq!(run(&[b("A", 500_000), b("B", 900_000), r(&[("A", 500_000)], None)]), (900_000, fx(&[("B", 900_000)])));
}

// ---------------------------------------------------------------------------------------------------- test45.py (the reset line)

fn bt(ts: &str, f: &str, a: i64) -> Value {
    let mut e = b(f, a);
    e["timestamp"] = json!(ts);
    e
}
fn rt(ts: &str, fs: &[(&str, i64)]) -> Value {
    let mut e = r(fs, None);
    e["timestamp"] = json!(ts);
    e
}
fn view(c: &mut Claims) -> Option<(i64, Vec<(String, i64)>)> {
    let v = c.view();
    let a = v.as_array()?;
    Some((a[0].as_i64()?, a[1].as_array()?.iter().map(|p| (p[0].as_str().unwrap().to_string(), p[1].as_i64().unwrap())).collect()))
}

#[test]
fn the_plugins_reset_line_cases() {
    let mut c = Claims::new();
    c.start(None, None);
    c.feed(&bt("2026-11-16T10:00:00Z", "A", 1000));
    c.feed(&bt("2026-11-16T10:01:00Z", "B", 500));
    assert_eq!(view(&mut c), Some((1500, fx(&[("A", 1000), ("B", 500)]))));
    c.set_base("2026-11-16T10:02:00Z");
    assert_eq!(view(&mut c), Some((0, fx(&[]))));
    c.feed(&bt("2026-11-16T10:03:00Z", "A", 700));
    assert_eq!(view(&mut c), Some((700, fx(&[("A", 700)]))));
    c.feed(&rt("2026-11-16T10:04:00Z", &[("B", 500)]));
    assert_eq!(view(&mut c), Some((700, fx(&[("A", 700)]))), "a cash-in of money from before the line takes nothing and goes nowhere");
    c.feed(&rt("2026-11-16T10:05:00Z", &[("A", 700)]));
    assert_eq!(view(&mut c), Some((0, fx(&[]))));
    c.set_base("");
    assert_eq!(view(&mut c), Some((1000, fx(&[("A", 1000)]))), "the line taken away: the Journals' own figure");

    // survives a restart: real files
    let dir: PathBuf = std::env::temp_dir().join(format!("gravitas_logic_{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let write = |name: &str, evs: &[Value]| {
        let mut s = String::from("{\"timestamp\":\"2026-01-01T00:00:00Z\",\"event\":\"Fileheader\",\"gameversion\":\"4.0.0.1\"}\n{\"timestamp\":\"2026-01-01T00:00:00Z\",\"event\":\"Commander\",\"Name\":\"Hongark\"}\n");
        for e in evs {
            s.push_str(&format!("{e}\n"));
        }
        std::fs::write(dir.join(name), s).unwrap();
    };
    write("Journal.2026-11-15T100000.01.log", &[bt("2026-11-15T10:00:00Z", "A", 4000), bt("2026-11-15T10:05:00Z", "B", 900)]);
    std::thread::sleep(std::time::Duration::from_millis(1100)); // (the newest by modification time)
    let newest = dir.join("Journal.2026-11-16T100000.01.log");
    write("Journal.2026-11-16T100000.01.log", &[bt("2026-11-16T10:00:10Z", "A", 300)]);
    let restart = |base: &str, dir: &Path, newest: &Path| {
        let mut c = Claims::new();
        c.set_base(base);
        c.start(Some(dir), Some(newest));
        c.wait_for_old();
        for e in events_of(newest).0 {
            c.feed(&e);
        }
        c
    };
    assert_eq!(view(&mut restart("", &dir, &newest)), Some((5200, fx(&[("A", 4300), ("B", 900)]))));
    assert_eq!(view(&mut restart("2026-11-16T10:00:05Z", &dir, &newest)), Some((300, fx(&[("A", 300)]))), "the reset survives a restart");
    assert_eq!(view(&mut restart("2026-11-16T11:00:00Z", &dir, &newest)), Some((0, fx(&[]))));
    // a death in an older Journal ends the search there, and the older money before it stays out
    write("Journal.2026-11-15T100000.01.log", &[bt("2026-11-15T10:00:00Z", "A", 4000), json!({"timestamp": "2026-11-15T10:30:00Z", "event": "Died"}), bt("2026-11-15T10:40:00Z", "C", 50)]);
    std::thread::sleep(std::time::Duration::from_millis(1100));
    write("Journal.2026-11-16T100000.01.log", &[bt("2026-11-16T10:00:10Z", "A", 300)]);
    assert_eq!(view(&mut restart("2026-11-15T10:10:00Z", &dir, &newest)), Some((350, fx(&[("A", 300), ("C", 50)]))));
    let _ = std::fs::remove_dir_all(&dir);
}

/// Burak's own Journal folder, all of it: the plugin's Python and the app's Rust must reach the same Claims. Run by hand (it starts Python):
/// cargo test real_folder_claims -- --ignored --nocapture
#[test]
#[ignore]
fn real_folder_claims() {
    let Some(folder) = crate::journal::saved_games() else {
        println!("SKIP: no game folder on this PC");
        return;
    };
    let script = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../research/app-golden/real_folder_claims.py");
    let out = std::process::Command::new("python").arg(&script).arg(&folder).output().expect("python runs");
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    let theirs: Value = serde_json::from_slice(&out.stdout).expect("the plugin's answer is JSON");
    let (events, found, died_ts) = crate::claims::events_since_death(&folder, None);
    let mut o = Owed::new();
    for e in &events {
        o.feed(e);
    }
    let mine = json!({"found": found, "died_ts": died_ts, "events": events.len(), "owed": o.dump()});
    println!("{} Journals folder: {} events since the last death ({}), total owed {}", folder.display(), events.len(), if found { "a death was found" } else { "no death found" }, o.total());
    if let Some(d) = first_diff("real folder", &theirs, &mine) {
        panic!("{d}");
    }
    println!("the plugin and the app agree on the whole folder");
}

/// draw() on 900 random states of what decides what shows with no fight on: Preview, a past report shown, free look, maps, the hide key, the Keys card,
/// the report countdown, the cockpit flags (make_preview_golden.py runs the plugin's real draw()).
#[test]
fn preview_and_shown_match_the_plugin() {
    let Ok(t) = std::fs::read_to_string(golden_dir().join("preview_golden.json")) else { println!("SKIP"); return };
    let recs: Vec<Value> = serde_json::from_str(&t).unwrap();
    let (mut bad, mut shown_n) = (Vec::new(), 0);
    for (i, r) in recs.iter().enumerate() {
        let mut h = crate::host::Host::new(true).unwrap();
        h.claims.start(None, None); // (no game folder: nothing older to read, the plugin's thread was waited for too)
        let (st, se) = (&r["state"], &r["settings"]);
        for (k, w) in h.set.win.iter_mut() { w.on = se["on"][*k].as_bool().unwrap_or(false); }
        h.set.always = se["always"].as_bool().unwrap();
        h.set.claims_note = false; // (the plugin has no Claims note)
        h.set.claims_dedupe = false; // (the plugin counted a repeated Bounty line twice)
        h.set.keep_hidden_in_panel = false; // (the plugin showed the windows again at the end of a free look over a panel)
        h.set.live_key_hints = false; // (the plugin's footers name its fixed Ctrl+Shift+F7..F12)
        h.set.show_gone = se["show_gone"].as_bool().unwrap();
        h.set.hide_maps = se["hide_maps"].as_bool().unwrap();
        h.set.look_hide = se["look"] == "hide";
        h.set.wing_bonus_on = se["wing_bonus_on"].as_bool().unwrap();
        h.set.rows = se["rows"].as_i64().unwrap();
        h.set.auto = se["auto"].as_bool().unwrap();
        h.preview = st["preview"].as_bool().unwrap();
        h.preview_t0 = st["preview_t0"].as_f64().unwrap();
        h.shown = st["shown"].as_array().map(|a| (a[0].clone(), a[1].as_f64().unwrap()));
        h.gui = st["gui"].as_i64().unwrap();
        h.guess_gui = st["guess"].as_array().map(|g| g[0].as_i64().unwrap());
        h.looking = st["looking"].as_bool().unwrap();
        h.key_hidden = st["key_hidden"].as_bool().unwrap();
        h.map_music = st["map_music"].as_bool().unwrap();
        h.flags = st["flags"].as_u64().unwrap();
        h.flags2 = st["flags2"].as_u64().unwrap();
        h.in_game = st["in_game"].as_bool();
        h.keys_shown = st["keys_shown"].as_bool().unwrap();
        h.keys_until = st["keys_until"].as_f64().unwrap();
        h.report_until = st["report_until"].as_f64().unwrap();
        h.report_auto = st["report_auto"].as_bool().unwrap();
        h.banner_until = st["banner_until"].as_f64().unwrap();
        h.last_view = if st["last_view"].is_null() { None } else { Some(st["last_view"].clone()) };
        let t = h.draw(r["now"].as_f64().unwrap());
        let got = t.items.map(Value::Array).unwrap_or(Value::Null);
        if r["items"].is_array() { shown_n += 1; }
        if let Some(d) = first_diff("items", &r["items"], &got) { bad.push(format!("state {i}: {d}")); }
    }
    println!("preview/shown: {} states ({shown_n} with windows), {} differences", recs.len(), bad.len());
    assert!(bad.is_empty(), "{}", bad.iter().take(6).cloned().collect::<Vec<_>>().join("\n"));
}

/// A window being placed shows with made-up data, tied to a panel or not, in a fight or not; the others are not shown by it.
#[test]
fn a_window_being_placed_shows_alone_with_made_up_data() {
    let mut h = crate::host::Host::new(true).unwrap();
    h.set.always = false;
    h.claims.start(None, None);
    let names = |t: crate::host::Tick| -> Vec<String> { t.items.unwrap_or_default().iter().map(|i| i[0].as_str().unwrap().to_string()).collect() };
    assert!(!names(h.draw(1_800_000_000.0)).contains(&"fight".to_string()), "no fight on: no fight window");
    h.edit = Some("fight".into()); // tied to the left panel (group 2)
    let t = h.draw(1_800_000_000.0);
    let items = t.items.expect("the edited window shows");
    let f = items.iter().find(|i| i[0] == "fight").expect("the edited window is there");
    assert_eq!(f[7], "all", "shown whatever panel is open");
    assert!(!f[1].is_null());
    h.edit = Some("*".into());
    let all = h.draw(1_800_000_000.0).items.unwrap();
    assert!(all.len() >= 5, "all windows when defaults are put back: {}", all.len());
    h.edit = None;
    assert!(!names(h.draw(1_800_000_000.0)).contains(&"fight".to_string()));
}

/// After the Last fight report was cleared, that fight is left out of the windows that show the last fight between fights; a new fight, or a fight still on, is not.
#[test]
fn a_cleared_fight_is_left_out_between_fights() {
    let mut h = crate::host::Host::new(true).unwrap();
    let over = json!({"on": false, "ep": {"t0": 1000, "t1": 2000}});
    assert!(!h.is_cleared(&over), "nothing cleared yet");
    h.cleared = Some("1000".into());
    assert!(h.is_cleared(&over));
    assert!(!h.is_cleared(&json!({"on": true, "ep": {"t0": 1000}})), "a fight that is on is never hidden");
    assert!(!h.is_cleared(&json!({"on": false, "ep": {"t0": 5000, "t1": 6000}})), "the next fight shows");
}
