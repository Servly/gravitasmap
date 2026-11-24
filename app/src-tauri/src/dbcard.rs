//! DEBRIEF: the windows' card models (the live input window and the report after a fight) and their words (lang_db/*.json, six languages).
use crate::dbnames;
use crate::dbrules;
use crate::debrief::{Db, Rec, TAP_MAX};
use crate::i18n::I18n;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::OnceLock;

const FILES: [(&str, &str); 6] = [
    ("en", include_str!("../lang_db/en.json")),
    ("de", include_str!("../lang_db/de.json")),
    ("es", include_str!("../lang_db/es.json")),
    ("fr", include_str!("../lang_db/fr.json")),
    ("pt-br", include_str!("../lang_db/pt-br.json")),
    ("ru", include_str!("../lang_db/ru.json")),
];

fn table() -> &'static HashMap<&'static str, Value> {
    static T: OnceLock<HashMap<&'static str, Value>> = OnceLock::new();
    T.get_or_init(|| FILES.iter().map(|(c, t)| (*c, serde_json::from_str(t).unwrap_or(Value::Null))).collect())
}

/// One sentence in the HUD's language (English where a translation is missing), {name} fields filled in.
pub fn tx(tr: &I18n, key: &str, vars: &[(&str, String)]) -> String {
    let t = table();
    let mut s = t.get(tr.language()).and_then(|v| v.get(key)).and_then(Value::as_str).or_else(|| t.get("en").and_then(|v| v.get(key)).and_then(Value::as_str)).unwrap_or(key).to_string();
    for (k, v) in vars {
        s = s.replace(&format!("{{{k}}}"), v);
    }
    s
}

pub fn is_key(k: &str) -> bool { matches!(k, "inputs" | "debrief") }

/// How long a tap stays on the live window, and a hold after it was let go
const TAP_SHOWN: f64 = 0.9;
const HELD_SHOWN: f64 = 1.4;
const ROWS: usize = 4;

fn axis_word(tr: &I18n, bind: &str) -> String {
    match bind {
        "Bindings_MouseRoll" => tx(tr, "db.ax.roll", &[]),
        "Bindings_MousePitch" => tx(tr, "db.ax.pitch", &[]),
        "Bindings_MouseYaw" => tx(tr, "db.ax.yaw", &[]),
        "Bindings_MousePitchInverted" => tx(tr, "db.ax.pitch", &[]),
        _ => String::new(),
    }
}

fn name_of(acts: &[String]) -> String {
    acts.iter().map(|a| dbnames::label(a)).collect::<Vec<_>>().join(" / ")
}

/// The live input window: the keys down now and let go a moment ago, the mouse, Flight Assist.
pub fn live_model(db: &Db, tr: &I18n, now: f64) -> Value {
    let mut rows: Vec<(f64, Value)> = Vec::new();
    for k in &db.live {
        let end = k.u.unwrap_or(now);
        let dur = end - k.d;
        let (state, secs, show) = match k.u {
            None if dur < TAP_MAX => ("tap", 0.0, true),
            None => ("hold", dur, true),
            Some(u) if dur < TAP_MAX => ("tap", 0.0, now - k.d < TAP_SHOWN && u <= now),
            Some(u) => ("held", dur, now - u < HELD_SHOWN),
        };
        if !show { continue; }
        rows.push((k.d, json!({"key": dbnames::key_label(&k.key), "name": name_of(&k.acts), "state": state, "secs": (secs * 10.0).round() / 10.0, "age": ((now - k.d) * 100.0).round() / 100.0})));
    }
    rows.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    let rows: Vec<Value> = rows.into_iter().take(ROWS).map(|r| r.1).collect();
    // the mouse over the last 0.3 s (its own counts, scaled so that a brisk movement reaches the edge of the circle)
    let (mut sx, mut sy) = (0i64, 0i64);
    for m in db.moves.iter().filter(|m| now - m.0 < 0.3) { sx += m.1; sy += m.2; }
    let sc = |v: i64| ((v as f64) / 450.0).clamp(-1.0, 1.0);
    let down = |key: &str| db.live.iter().any(|k| k.key == key && k.u.is_none());
    let wheel = if db.live.iter().any(|k| k.key == "Pos_Mouse_ZAxis" && now - k.d < 0.4) { 1 } else if db.live.iter().any(|k| k.key == "Neg_Mouse_ZAxis" && now - k.d < 0.4) { -1 } else { 0 };
    let (ax, ay) = db.map.as_ref().map(|m| (axis_word(tr, &m.mouse_x), axis_word(tr, &m.mouse_y))).unwrap_or_default();
    json!({
        "kind": "inputs", "title": tx(tr, "db.live.title", &[]),
        "fa": db.fa_off.map(|o| if o { "off" } else { "on" }),
        "fa_text": match db.fa_off { Some(true) => tx(tr, "db.fa.off", &[]), Some(false) => tx(tr, "db.fa.on", &[]), None => String::new() },
        "rec": db.rec.is_some(),
        "rows": rows,
        "words": {"tap": tx(tr, "db.state.tap", &[]), "hold": tx(tr, "db.state.hold", &[]), "held": tx(tr, "db.state.held", &[])},
        "mouse": {"x": sc(sx), "y": sc(sy), "l": down("Mouse_1"), "m": down("Mouse_3"), "r": down("Mouse_2"), "wheel": wheel, "ax": ax, "ay": ay},
    })
}

pub fn sample_live(tr: &I18n, now: f64) -> Value {
    let t = now % 6.0;
    json!({
        "kind": "inputs", "title": tx(tr, "db.live.title", &[]), "fa": "off", "fa_text": tx(tr, "db.fa.off", &[]), "rec": true,
        "rows": [
            {"key": "W", "name": dbnames::label("ForwardThrustButton"), "state": "hold", "secs": ((t * 10.0).round() / 10.0), "age": t},
            {"key": "Z", "name": dbnames::label("ToggleFlightAssist"), "state": "tap", "secs": 0.0, "age": 0.3},
        ],
        "words": {"tap": tx(tr, "db.state.tap", &[]), "hold": tx(tr, "db.state.hold", &[]), "held": tx(tr, "db.state.held", &[])},
        "mouse": {"x": (t * 1.7).sin() * 0.7, "y": (t * 1.1).cos() * 0.4, "l": t > 3.0, "m": false, "r": false, "wheel": 0, "ax": tx(tr, "db.ax.roll", &[]), "ay": tx(tr, "db.ax.pitch", &[])},
    })
}

/// Seconds the shields were down in a record (a state still down at the end counts to the end).
pub fn shields_down(r: &Rec) -> f64 {
    let mut total = 0.0;
    let mut since: Option<f64> = None;
    for &(t, up) in &r.sh {
        if !up && since.is_none() { since = Some(t); }
        if up { if let Some(s) = since.take() { total += t - s; } }
    }
    if let Some(s) = since { total += (r.len() - s).max(0.0); }
    total
}

pub fn fa_off_time(r: &Rec) -> (f64, usize) {
    let (mut total, mut sw) = (0.0, 0usize);
    let mut since: Option<f64> = None;
    for (i, &(t, off)) in r.fa.iter().enumerate() {
        if i > 0 && r.fa[i - 1].1 != off { sw += 1; }
        if off && since.is_none() { since = Some(t); }
        if !off { if let Some(s) = since.take() { total += t - s; } }
    }
    if let Some(s) = since { total += (r.len() - s).max(0.0); }
    (total, sw)
}

fn money(v: i64) -> String {
    if v >= 1_000_000 { format!("{:.1}M", v as f64 / 1e6) } else if v >= 1000 { format!("{}k", v / 1000) } else { v.to_string() }
}

/// The report after a fight, as a card: the figures, the key moments, and (when switched on) the lines the rules found.
pub fn report_model(tr: &I18n, r: &Rec, obs_on: bool) -> Value {
    let w = dbrules::waves(&r.atk);
    let kills_v: i64 = r.kills.iter().map(|k| k.1).sum();
    let (fa_t, fa_n) = fa_off_time(r);
    let over: f64 = r.over.iter().map(|(a, b)| b - a).sum();
    let tiles = vec![
        json!([tx(tr, "db.tile.kills", &[]), format!("{} · {}", r.kills.len(), money(kills_v))]),
        json!([tx(tr, "db.tile.waves", &[]), w.len().to_string()]),
        json!([tx(tr, "db.tile.shields", &[]), dbrules::mmss(shields_down(r))]),
        json!([tx(tr, "db.tile.fa", &[]), dbrules::mmss(fa_t)]),
        json!([tx(tr, "db.tile.heat", &[]), dbrules::mmss(over)]),
        json!([tx(tr, "db.tile.fa_sw", &[]), fa_n.to_string()]),
    ];
    let mut sections: Vec<Value> = Vec::new();
    // what the game wrote about the ship, in a line
    let mut lines: Vec<Value> = Vec::new();
    if !r.tg.is_empty() {
        let names: Vec<String> = r.tg.iter().map(|g| g.ship.clone()).collect();
        lines.push(json!([r.tg.len().to_string(), tx(tr, "db.line.targets", &[]), names.join(", ")]));
    }
    if let Some(&(t, v)) = r.hull.last() { lines.push(json!([format!("{:.0} %", v * 100.0), tx(tr, "db.line.hull", &[]), dbrules::mmss(t)])); }
    if let Some(t) = r.died { lines.push(json!([dbrules::mmss(t), tx(tr, "db.line.died", &[]), ""])); }
    if !lines.is_empty() { sections.push(json!([tx(tr, "db.sec.fight", &[]), "feed", lines])); }
    if obs_on {
        let obs = dbrules::observations(r);
        if !obs.is_empty() {
            let rows: Vec<Value> = obs.iter().map(|o| {
                let args: Vec<(&str, String)> = o.args.iter().map(|(k, v)| (*k, if *k == "fa" || *k == "to" { tx(tr, &format!("db.word.{v}"), &[]) } else { v.clone() })).collect();
                json!([dbrules::mmss(o.t), tx(tr, &format!("{}.h", o.key), &[]), tx(tr, o.key, &args)])
            }).collect();
            sections.push(json!([tx(tr, "db.sec.obs", &[]), "feed", rows]));
        }
    }
    let head2 = [r.ship.clone(), r.sys.clone()].into_iter().filter(|s| !s.is_empty()).collect::<Vec<_>>().join(" · ");
    let (word, tone) = if r.died.is_some() { (tx(tr, "db.badge.died", &[]), "red") } else { (tx(tr, "db.badge.over", &[]), "green") };
    json!({
        "title": tx(tr, "db.report.title", &[]),
        "head": format!("{} · {}", dbrules::mmss(r.len()), if r.kind == "hunt" { tx(tr, "db.kind.hunt", &[]) } else { tx(tr, "db.kind.fight", &[]) }),
        "head2": head2,
        "badge": [word, tone],
        "tiles": tiles, "sections": sections,
        "note": tx(tr, "db.report.note", &[]),
    })
}

pub fn sample_report(tr: &I18n) -> Value {
    let mut r = Rec { t0: 0.0, t1: 210.0, kind: "fight".into(), ship: "Krait Mk II".into(), sys: "Muang".into(), fa: vec![(0.0, false), (22.0, true), (96.0, false), (101.0, true)],
        sh: vec![(0.0, true), (62.0, false), (84.0, true)], atk: vec![30.0, 62.0, 63.0, 88.0, 120.0, 148.0], kills: vec![(45.0, 1_200_000), (78.0, 2_400_000)],
        hull: vec![(95.0, 0.8)], over: vec![(100.0, 118.0)], ..Default::default() };
    r.tg = vec![crate::debrief::Tg { a: 3.0, b: 45.0, ship: "Fer-de-Lance".into(), rank: "Elite".into(), snaps: vec![] }];
    report_model(tr, &r, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::debrief::{Db, LiveKey};

    fn db_with(keys: Vec<LiveKey>) -> Db { let mut d = Db::default(); d.live = keys; d }
    fn lk(key: &str, act: &str, d: f64, u: Option<f64>) -> LiveKey { LiveKey { key: key.into(), acts: vec![act.into()], d, u } }

    #[test]
    fn a_tap_flashes_and_goes_a_hold_counts_and_stays_a_moment() {
        let tr = I18n::new("en");
        let rows = |keys: Vec<LiveKey>, now: f64| live_model(&db_with(keys), &tr, now)["rows"].as_array().unwrap().clone();
        // down for 0.1 s: shown as a tap (it may still be one)
        let r = rows(vec![lk("Key_Z", "ToggleFlightAssist", 10.0, None)], 10.1);
        assert_eq!((r[0]["state"].as_str(), r[0]["name"].as_str(), r[0]["key"].as_str()), (Some("tap"), Some("Flight Assist"), Some("Z")));
        // still down after 0.3 s: now a hold, with its seconds
        let r = rows(vec![lk("Key_W", "ForwardThrustButton", 10.0, None)], 11.4);
        assert_eq!((r[0]["state"].as_str(), r[0]["secs"].as_f64()), (Some("hold"), Some(1.4)));
        // let go after 0.1 s: a tap for 0.9 s, then gone
        assert_eq!(rows(vec![lk("Key_Z", "ToggleFlightAssist", 10.0, Some(10.1))], 10.8).len(), 1);
        assert!(rows(vec![lk("Key_Z", "ToggleFlightAssist", 10.0, Some(10.1))], 11.0).is_empty());
        // held 2.3 s, let go: "held" for 1.4 s, then gone
        let r = rows(vec![lk("Key_W", "ForwardThrustButton", 10.0, Some(12.3))], 13.0);
        assert_eq!((r[0]["state"].as_str(), r[0]["secs"].as_f64()), (Some("held"), Some(2.3)));
        assert!(rows(vec![lk("Key_W", "ForwardThrustButton", 10.0, Some(12.3))], 13.8).is_empty());
        // never more rows than the window has room for
        let many: Vec<LiveKey> = (0..9).map(|i| lk("Key_W", "ForwardThrustButton", 10.0 + i as f64 * 0.01, None)).collect();
        assert_eq!(rows(many, 11.0).len(), ROWS);
    }

    #[test]
    fn the_report_counts_only_what_the_record_holds() {
        let tr = I18n::new("en");
        let mut r = Rec { t0: 0.0, t1: 200.0, kind: "fight".into(), fa: vec![(0.0, false), (20.0, true), (50.0, false), (60.0, true)], sh: vec![(0.0, true), (30.0, false), (40.0, true), (190.0, false)],
            atk: vec![10.0, 11.0, 40.0], kills: vec![(30.0, 1_000_000), (90.0, 2_000_000)], ..Default::default() };
        assert_eq!(shields_down(&r), 10.0 + 10.0); // (the last drop counts to the end of the record)
        assert_eq!(fa_off_time(&r), (30.0 + 140.0, 3));
        let m = report_model(&tr, &r, false).to_string();
        assert!(m.contains("2 · 3.0M") && !m.contains("db.sec.obs"), "{m}");
        // the observations are shown only when switched on, and only when a rule fires
        r.atk = vec![28.0]; // a wave 2 s before the shields went down
        assert!(report_model(&tr, &r, true).to_string().contains(&tx(&tr, "db.sec.obs", &[])));
        assert!(!report_model(&tr, &r, false).to_string().contains(&tx(&tr, "db.sec.obs", &[])));
    }

    /// The two windows drawn on a dark screen: research/app-golden/out/debrief_windows.png (looked at by eye, not compared).
    #[test]
    fn the_windows_are_drawn() {
        let out = crate::host::parity::golden_dir().join("../out");
        let _ = std::fs::create_dir_all(&out);
        let (w, h) = (2560.0, 1440.0);
        let s = crate::hud::pieces::scale(h, 1.0);
        let mut canvas = tiny_skia::Pixmap::new(w as u32, h as u32).unwrap();
        canvas.fill(tiny_skia::Color::from_rgba8(30, 40, 60, 255));
        let tr = I18n::new("en");
        for (m, place) in [(sample_live(&tr, 4.0), json!(["top", 0.66])), (sample_report(&tr), json!(["top", 0.115]))] {
            let pv: Vec<Value> = place.as_array().unwrap().clone();
            let v0 = crate::hud::place::cursor_key(&pv).and_then(|_| crate::hud::place::start_of(&pv, w, h));
            let p = crate::hud::place::paint(&tr, &m, 0.0, 0.0, "#ff7100", (0.0, 0, 100, 100), Some(&pv), v0, s, w, h, false, true, 190).expect("no picture");
            let src = tiny_skia::PixmapRef::from_bytes(&p.pic.rgba, p.pic.w, p.pic.h).unwrap();
            canvas.draw_pixmap(p.pic.x, p.pic.y, src, &tiny_skia::PixmapPaint::default(), tiny_skia::Transform::identity(), None);
        }
        canvas.save_png(out.join("debrief_windows.png")).unwrap();
    }

    #[test]
    fn every_language_has_every_key_the_cards_and_rules_use() {
        let en: Vec<String> = table()["en"].as_object().unwrap().keys().cloned().collect();
        for (code, _) in FILES.iter() {
            let t = table()[code].as_object().unwrap();
            for k in &en { assert!(t.contains_key(k), "{code} lacks {k}"); }
            assert_eq!(t.len(), en.len(), "{code} has keys English does not");
        }
        // every key the code asks for exists in English
        for k in ["db.live.title", "db.fa.off", "db.fa.on", "db.state.tap", "db.state.hold", "db.state.held", "db.tile.kills", "db.tile.waves", "db.tile.shields", "db.tile.fa", "db.tile.heat", "db.tile.fa_sw",
                  "db.sec.obs", "db.obs.shield", "db.obs.shield.h", "db.obs.heat_sink", "db.obs.heat_sink.h", "db.obs.heat_none", "db.obs.heat_none.h", "db.obs.fa_wave", "db.obs.fa_wave.h", "db.word.on", "db.word.off"] {
            assert!(table()["en"].get(k).is_some(), "English lacks {k}");
        }
    }
}
