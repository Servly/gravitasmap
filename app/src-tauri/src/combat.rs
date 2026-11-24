//! Combat Mode's windows as cards: modes/combat.py in Rust. "No numbers are worked out again here: only which ones go where."
//! A card model is a JSON object: {"kind": "chip"|"card"|"banner", "title", "head", "head2", "badge": [text, tone], "bars": [[label, 0..100|null]],
//! "tiles": [[label, value]], "sections": [[heading, column layout, [[cells]]]], "note", "rows", "cols", "count"}.
//!
//! Python's rules are kept on purpose: `x or default` (a 0, "" or [] counts as nothing), `d.get(k, default)` (only a MISSING key takes the
//! default), f-strings (None is written "None", whole numbers without a dot), round() half to even, sorts that keep the order of equals.
use crate::i18n::I18n;
use crate::pyval::{as_float, fmt_f, n_or0, num, py_str, round, truthy};
use serde_json::{json, Value};

/// window key, default place (percent of the game window: x, y)
pub const WINDOWS: &[(&str, f64, f64)] = &[
    ("status", 40.0, 4.0),
    ("alert", 40.0, 9.5),
    ("target", 2.0, 14.0),
    ("targets", 2.0, 40.0),
    ("feed", 78.0, 14.0),
    ("fight", 78.0, 40.0),
    ("speed", 78.0, 62.0),
    ("bounty", 80.0, 4.0),
    ("report", 36.0, 16.0),
    ("banner", 38.0, 26.0),
    ("shortcuts", 38.0, 30.0),
    ("sysmap", 38.0, 1.0),
    // the Xeno Hunt: the Thargoid card sits where Targets by value does, the report where the Combat report does, the warning at the very top
    ("thargoid", 2.0, 40.0),
    ("xenoreport", 36.0, 16.0),
    // the card that says which mode came on (Combat, Thargoid, On Foot), at the top for a few seconds
    ("modecard", 38.0, 3.0),
    // DEBRIEF: the live input window low in the middle, its report where the Combat report sits
    ("inputs", 36.0, 66.0),
    ("debrief", 36.0, 16.0),
    // PVP mode: the chip that says it is on, at the top
    ("pvp", 38.0, 4.5),
];
pub const WINDOWS_OFF: &[&str] = &["status", "alert", "target", "feed", "banner", "sysmap"];
pub const DEFAULT_WHEN: &[(&str, &str)] = &[("fight", "ext"), ("speed", "int"), ("shortcuts", "main_t")];
/// when a window shows, and the GuiFocus of the panel it needs open (None: the main panel)
pub const WHEN: &[(&str, Option<i64>)] = &[
    ("always", None), ("main_l", None), ("main_r", None), ("main_t", None), ("ext", Some(2)), ("comms", Some(3)), ("role", Some(4)),
    ("int", Some(1)), ("role_l", Some(4)), ("role_t", Some(4)), ("int_t", Some(1)),
];
pub const BANNER_S: f64 = 4.0;
pub const REPORT_S: f64 = 60.0;
pub const ALERT_S: i64 = 120;
pub const KEYS_S: f64 = 10.0;
pub const DEFAULT_ORDER: &[&str] = &["Fer-de-Lance", "Corsair", "Python Mk II"];

pub fn panel_of(when: &str) -> Option<i64> {
    WHEN.iter().find(|(w, _)| *w == when).and_then(|(_, g)| *g)
}

/// What draw() hands the models (combat.py's opts dict).
#[derive(Default, Clone)]
pub struct Opts {
    pub sort: String,
    pub order: Vec<String>,
    pub report_s: f64,
    pub banner: bool,
    pub scan: Option<Value>,
    pub tg: Option<Value>,
    pub always: bool,
    pub gone: Value,
    pub show_gone: bool,
    pub bounty: Option<Value>,
    pub wing_bonus_on: bool,
    pub wing_bonus_op: bool,
    /// the report says when Claims hold more than the fight (off = the plugin's report)
    pub claims_note: bool,
    pub rows: i64,
    /// how many of the latest kills the Kill feed lists (6 = the plugin's)
    pub feed_rows: i64,
    pub keys_on: bool,
    pub keys_left: i64,
    pub report_on: bool,
    pub report_left: i64,
    /// The keys the player set for the jobs the footers name (job -> key text, only the jobs that have one). None = the plugin's footers, with its fixed
    /// Ctrl+Shift+F7..F12 (what the parity tests compare); Some = every footer shows the key set for its job, and nothing for a job that has no key.
    pub hints: Option<Hints>,
}

pub type Hints = std::collections::HashMap<String, String>;

/// The text of a footer with the player's key in it: None while that job has no key.
fn with_key(tr: &I18n, h: &Hints, job: &str, text_key: &str) -> Option<String> {
    h.get(job).filter(|k| !k.is_empty()).map(|k| tr.t(text_key, &[("key", json!(k))]))
}

// ------------------------------------------------------------------------------------------------ small helpers

/// `d.get(k, default)`: only a missing key takes the default (a null stays null).
pub(crate) fn getd(d: &Value, k: &str, default: Value) -> Value {
    d.get(k).cloned().unwrap_or(default)
}
fn txt(d: &Value, k: &str) -> String {
    match getd(d, k, json!("")) {
        Value::Null => String::new(), // (only ever joined with falsy parts dropped: Python leaves a None out)
        v => py_str(&v),
    }
}
/// `p.get("s") or p.get("p", "")`: the value itself, not text (a null name stays null in the card).
fn name_of(p: &Value) -> Value {
    if truthy(p.get("s")) { p["s"].clone() } else { getd(p, "p", json!("")) }
}
/// `d.get(k) or ""` as text.
pub(crate) fn or_s(d: &Value, k: &str) -> String {
    match d.get(k) {
        Some(Value::String(s)) => s.clone(),
        Some(v) if truthy(Some(v)) => py_str(v),
        _ => String::new(),
    }
}
pub(crate) fn get_or_empty<'a>(d: &'a Value, k: &str, empty: &'a Value) -> &'a Value {
    match d.get(k) {
        Some(v) if truthy(Some(v)) => v,
        _ => empty,
    }
}
pub(crate) fn arr(v: Option<&Value>) -> Vec<Value> {
    match v {
        Some(Value::Array(a)) => a.clone(),
        _ => Vec::new(),
    }
}
fn join(parts: Vec<String>, sep: &str) -> String {
    parts.into_iter().filter(|p| !p.is_empty()).collect::<Vec<_>>().join(sep)
}
fn first_chars(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}

/// `dur(ms)`: m:ss, or h min over an hour.
pub fn dur(tr: &I18n, ms: f64) -> String {
    let s = round(ms / 1000.0).max(0);
    let m = s / 60;
    if m >= 60 {
        format!("{} {} {} {}", m / 60, tr.t0("unit.h"), m % 60, tr.t0("unit.min"))
    } else {
        format!("{m}:{:02}", s % 60)
    }
}

/// `per_min(n, ms)`.
fn per_min(tr: &I18n, n: f64, ms: f64) -> String {
    if ms > 60000.0 { fmt_f(n / (ms / 60000.0), 1) } else { tr.t0("unit.none") }
}

fn millions(v: f64) -> String {
    if v.abs() >= 1e6 { format!("{}M", fmt_f(v / 1e6, 1)) } else { format!("{}k", fmt_f(v / 1e3, 0)) }
}

pub(crate) fn where_of(v: &Value) -> String {
    let empty = json!({});
    let (ep, op) = (get_or_empty(v, "ep", &empty), get_or_empty(v, "op", &empty));
    let pick = |a: &Value, ka: &str, b: &Value, kb: &str| -> String {
        let x = or_s(a, ka);
        if !x.is_empty() { x } else { or_s(b, kb) }
    };
    join(vec![or_s(op, "name"), pick(op, "sys", ep, "sys"), pick(op, "site", ep, "site")], " · ")
}

fn result(tr: &I18n, ep: &Value) -> Value {
    if truthy(ep.get("died")) {
        return json!([tr.t0("result.lost"), "red"]);
    }
    if truthy(ep.get("shDown")) {
        return json!([tr.t("result.fell", &[("n", ep["shDown"].clone())]), "amber"]);
    }
    json!([tr.t0("result.held"), "green"])
}

/// a ship with a bounty 0, one still being scanned 1, scanned with no bounty 2, clean (firing on it is a crime) 3, always last
fn kind_of(x: &Value) -> i64 {
    if truthy(x.get("l")) {
        3
    } else if truthy(x.get("b")) {
        0
    } else if truthy(x.get("q")) {
        2
    } else {
        1
    }
}

fn sort_targets(pri: Vec<Value>, opts: &Opts) -> Vec<Value> {
    let mut a = pri;
    let newest = |x: &Value| -n_or0(x.get("t"));
    let negb = |x: &Value| -n_or0(x.get("b"));
    if opts.sort == "s" {
        let order: Vec<String> = opts.order.iter().map(|o| o.to_lowercase()).collect();
        let at = |x: &Value| -> f64 {
            let s = or_s(x, "s").to_lowercase();
            order.iter().position(|o| *o == s).map(|i| i as f64).unwrap_or(99.0)
        };
        a.sort_by(|x, y| {
            let kx = [n_or0(x.get("l")), at(x), kind_of(x) as f64, negb(x), newest(x)];
            let ky = [n_or0(y.get("l")), at(y), kind_of(y) as f64, negb(y), newest(y)];
            kx.partial_cmp(&ky).unwrap_or(std::cmp::Ordering::Equal)
        });
    } else {
        a.sort_by(|x, y| {
            let kx = [kind_of(x) as f64, negb(x), newest(x)];
            let ky = [kind_of(y) as f64, negb(y), newest(y)];
            kx.partial_cmp(&ky).unwrap_or(std::cmp::Ordering::Equal)
        });
    }
    a
}

/// Targets by value without the ships whose lock was lost, or that were there when the list was cleared.
fn drop_lost(pri: Vec<Value>, opts: &Opts) -> Vec<Value> {
    let empty = json!({});
    let g = if truthy(Some(&opts.gone)) { &opts.gone } else { &empty };
    let lost = get_or_empty(g, "gone", &empty);
    let cleared = n_or0(g.get("cleared"));
    if !truthy(Some(lost)) && cleared == 0.0 {
        return pri;
    }
    pri.into_iter()
        .filter(|x| {
            let t = n_or0(x.get("t"));
            let key = format!("{}|{}", txt(x, "p"), txt(x, "s"));
            let since = lost.get(&key).and_then(|v| as_float(Some(v))).unwrap_or(-1.0);
            t > cleared && t > since
        })
        .collect()
}

/// The Keys card's rows (key, what it does). The plugin's six fixed keys when `hints` is None; else the keys the player set, only the jobs that have one.
pub fn keys_help(tr: &I18n, hints: Option<&Hints>) -> Vec<(String, String)> {
    match hints {
        None => vec![("Ctrl+Shift+F7", tr.t0("key.free_look")), ("Ctrl+Shift+F8", tr.t0("key.report")), ("Ctrl+Shift+F9", tr.t0("key.bounty")),
                     ("Ctrl+Shift+F10", tr.t0("key.clear")), ("Ctrl+Shift+F11", tr.t0("key.hud")), ("Ctrl+Shift+F12", tr.t0("key.claims"))]
            .into_iter().map(|(k, w)| (k.to_string(), w)).collect(),
        Some(h) => [("flip", "key.free_look"), ("report", "key.report"), ("reset", "key.bounty"), ("clear", "key.clear"), ("hide", "key.hud"), ("claims", "key.claims"), ("report_clear", "key.report_clear")]
            .iter().filter_map(|(job, text)| h.get(*job).filter(|k| !k.is_empty()).map(|k| (k.clone(), tr.t0(text)))).collect(),
    }
}

pub(crate) fn intd(tr: &I18n, st: Option<&Value>) -> (String, String, &'static str) {
    let s = st.and_then(Value::as_str).unwrap_or("");
    let tone = match s {
        "pulling" => "amber",
        "dropped" => "red",
        "submitted" => "amber",
        "escaped" => "green",
        "you interdicted" => "red",
        _ => return (tr.t0("intd.pulling"), String::new(), "amber"),
    };
    (tr.t0(&format!("intd.{s}")), tr.t0(&format!("intd.{s}.what")), tone)
}

// ------------------------------------------------------------------------------------------------ the Bounty counter

pub fn bounty(tr: &I18n, b: Option<&Value>, in_op: bool) -> Value {
    bounty_h(tr, b, in_op, None)
}

pub fn bounty_h(tr: &I18n, b: Option<&Value>, in_op: bool, hints: Option<&Hints>) -> Value {
    let empty = json!({});
    let b = match b {
        Some(v) if truthy(Some(v)) => v,
        _ => &empty,
    };
    let claim = b.get("claim").filter(|c| truthy(Some(c)));
    let wing_on = truthy(b.get("wing_bonus_on")) || (truthy(b.get("wing_bonus_op")) && in_op);
    let fight_bonus = if wing_on { n_or0(b.get("wing_bonus")) } else { 0.0 };
    let cr = n_or0(b.get("cr")) + fight_bonus;
    let mut tiles = vec![
        json!([tr.t0("bounty.fight"), format!("{} cr", num(Some(&json!(cr))))]),
        json!([tr.t0("bounty.kills"), py_str(&getd(b, "n", json!(0)))]),
    ];
    let claim_n = |i: usize| claim.and_then(|c| c.get(i));
    let bonus = if claim.is_some() && wing_on { n_or0(claim_n(2)) } else { 0.0 };
    // the combat bonds you carry are Claims too (the game lists them there): added to the total, one line each below
    let owed = b.get("bond_owed").filter(|o| truthy(Some(o)));
    let bond_total = owed.map(|o| n_or0(o.get("total")) + if wing_on { n_or0(o.get("bonus")) } else { 0.0 }).unwrap_or(0.0);
    tiles.push(match claim {
        Some(_) => json!([tr.t0("bounty.claims"), format!("{} cr", num(Some(&json!(n_or0(claim_n(0)) + bonus + bond_total))))]),
        None => json!([tr.t0("bounty.claims"), tr.t0("bounty.reading")]),
    });
    let badge = if claim.is_some() && wing_on && truthy(claim_n(4)) { Some(json!([tr.t0("bounty.badge.wing"), "green"])) } else { None };
    let mut lines: Vec<String> = Vec::new();
    if let Some(c) = claim {
        let facs = arr(c.get(1));
        if truthy(c.get(0)) || !facs.is_empty() {
            let shown: Vec<Value> = facs.iter().take(3).cloned().collect();
            for f in &shown {
                let fname = f.get(0).map(|x| if truthy(Some(x)) { py_str(x) } else { tr.t0("bounty.unnamed") }).unwrap_or_default();
                lines.push(format!("• {} {} cr", fname, millions(n_or0(f.get(1)))));
            }
            if bonus != 0.0 {
                lines.push(format!("• {}", tr.t("bounty.wing_bonus", &[("amount", json!(millions(bonus)))])));
            }
            let rest = n_or0(c.get(0)) - shown.iter().map(|f| n_or0(f.get(1))).sum::<f64>();
            if rest != 0.0 {
                let label = if facs.len() > shown.len() { tr.t("bounty.more", &[("n", json!(facs.len() - shown.len()))]) } else { tr.t0("bounty.untied") };
                lines.push(format!("• {} {} cr", label, millions(rest)));
            }
        }
    }
    if let Some(o) = owed {
        for f in arr(o.get("by")).iter().take(3) {
            lines.push(format!("• {} {} cr ({})", f.get(0).map(py_str).unwrap_or_default(), millions(n_or0(f.get(1))), tr.t0("feed.bond")));
        }
        if wing_on && n_or0(o.get("bonus")) != 0.0 {
            lines.push(format!("• {} ({})", tr.t("bounty.wing_bonus", &[("amount", json!(millions(n_or0(o.get("bonus")))))]), tr.t0("feed.bond")));
        }
    }
    if truthy(b.get("claim_reset")) {
        lines.push(format!("• {}", tr.t("bounty.reset", &[("t", b["claim_reset"].clone())])));
    }
    // the footer names the key set for "Reset Current Fight" (nothing when none is set); the plugin's footer has its fixed F9
    let mut tail = match hints { None => tr.t0("bounty.tail"), Some(h) => with_key(tr, h, "reset", "bounty.tail.key").unwrap_or_default() };
    if b.get("bonds").map(|v| !v.is_null()).unwrap_or(false) {
        tail = tr.t("bounty.tail.bounties", &[("bounties", json!(num(b.get("bounties")))), ("bonds", json!(num(b.get("bonds"))))]) + &tail;
    }
    if truthy(b.get("lost")) {
        tail = tr.t("bounty.lost", &[("amount", json!(num(b.get("lost"))))]) + &tail;
    }
    if hints.is_some() {
        tail = tail.trim_end_matches(" · ").to_string(); // (the lines before the key end with a separator: no key, no dangling dot)
    }
    if hints.is_none() || !tail.is_empty() {
        lines.push(tail);
    }
    if truthy(b.get("brief")) {
        // in brief: the two money tiles only (this fight, Claims)
        let keep = vec![tiles[0].clone(), tiles[2].clone()];
        let mut m = json!({"kind": "card", "title": tr.t0("bounty.title"), "tiles": keep, "note": ""});
        if let Some(bg) = badge {
            m["badge"] = bg;
        }
        return m;
    }
    let mut m = json!({"kind": "card", "title": tr.t0("bounty.title"), "tiles": tiles, "note": lines.join("\n")});
    if let Some(bg) = badge {
        m["badge"] = bg;
    }
    m
}

// ------------------------------------------------------------------------------------------------ rows and the report

fn kill_row(tr: &I18n, k: &Value) -> Value {
    if truthy(k.get("bond")) {
        let fac = or_s(k, "fac");
        return json!([format!("+{}", num(k.get("cr"))), if fac.is_empty() { tr.t0("feed.bond") } else { fac }, getd(k, "ship", json!(tr.t0("feed.bond")))]);
    }
    let shared = if truthy(k.get("shared")) { tr.t("feed.shared", &[("name", k["shared"].clone())]) } else { tr.t0("feed.solo") };
    let ttk = if n_or0(k.get("ttk")) > 1000.0 { tr.t("feed.ttk", &[("t", json!(dur(tr, n_or0(k.get("ttk")))))]) } else { String::new() };
    let sub = join(vec![txt(k, "ship"), txt(k, "rank"), shared, ttk], " · ");
    json!([format!("+{}", num(k.get("cr"))), getd(k, "pilot", json!("")), sub])
}

fn max_f(a: f64, b: f64) -> f64 {
    if a >= b { a } else { b }
}

/// `x or 0` as a value (a 0, "", [] or null becomes the whole number 0).
fn or0v(v: Option<&Value>) -> Value {
    match v {
        Some(x) if truthy(Some(x)) => x.clone(),
        _ => json!(0),
    }
}

/// Python's max(a, b): the first one unless the second is larger (so a whole number stays a whole number when written out).
fn pymax(a: Value, b: Value) -> Value {
    if n_or0(Some(&b)) > n_or0(Some(&a)) { b } else { a }
}

/// What the Claims tile of the Bounty counter shows: bounties not cashed in (+ the wing estimate when it counts) + combat bonds carried.
/// None while Claims are still being read.
pub fn claims_total(b: Option<&Value>, wing_on: bool) -> Option<f64> {
    let b = b.filter(|v| truthy(Some(v)))?;
    let claim = b.get("claim").filter(|c| truthy(Some(c)))?;
    let bonus = if wing_on { n_or0(claim.get(2)) } else { 0.0 };
    let owed = b.get("bond_owed").filter(|o| truthy(Some(o)));
    let bond_total = owed.map(|o| n_or0(o.get("total")) + if wing_on { n_or0(o.get("bonus")) } else { 0.0 }).unwrap_or(0.0);
    Some(n_or0(claim.get(0)) + bonus + bond_total)
}

/// How much Claims hold beyond this fight, in whole credits (0 when none, or when Claims are unknown).
/// The fight counts like the Credits tile (bounties + wing estimate) plus its bonds when bonds count in Claims.
pub fn claims_before(v: &Value, bounty: Option<&Value>, wing_on: bool) -> f64 {
    let empty = json!({});
    let ep = get_or_empty(v, "ep", &empty);
    let total = match claims_total(bounty, wing_on) {
        Some(t) => t,
        None => return 0.0,
    };
    let bonds_in = bounty.and_then(|b| b.get("bond_owed")).is_some_and(|o| truthy(Some(o)));
    let fight = n_or0(ep.get("cr")) + if wing_on { n_or0(ep.get("wing_bonus")) } else { 0.0 } + if bonds_in { n_or0(ep.get("bonds")) } else { 0.0 };
    let d = (total - fight).round();
    if d > 0.0 { d } else { 0.0 }
}

pub fn report(tr: &I18n, v: &Value, now_ms: f64, wing_on: bool, claims_extra: f64) -> Value {
    let empty = json!({});
    let ep = get_or_empty(v, "ep", &empty);
    let fight_bonus = if wing_on { n_or0(ep.get("wing_bonus")) } else { 0.0 };
    let n = n_or0(ep.get("n"));
    let n_v = getd(ep, "n", json!(0));
    let ms = max_f(0.0, n_or0(ep.get("t1")) - n_or0(ep.get("t0")));
    let seen_v = pymax(or0v(ep.get("seenN")), n_v.clone());
    let seen = n_or0(Some(&seen_v));
    let phases = if n_or0(ep.get("phases")) > 1.0 { tr.t("report.phases", &[("n", ep["phases"].clone())]) } else { String::new() };
    let head2 = join(vec![where_of(v), phases], " · ");
    let tiles = vec![
        json!([tr.t0("tile.kills"), if truthy(Some(&seen_v)) { format!("{}/{}", py_str(&n_v), py_str(&seen_v)) } else { py_str(&n_v) }]),
        json!([tr.t0("tile.credits"), num(Some(&json!(n_or0(ep.get("cr")) + fight_bonus)))]),
        json!([tr.t0("tile.time"), dur(tr, ms)]),
        json!([tr.t0("tile.kpm"), per_min(tr, n, ms)]),
        json!([tr.t0("tile.waves"), py_str(&getd(ep, "attacks", json!(0)))]),
        json!([tr.t0("tile.heat"), py_str(&getd(ep, "heat", json!(0)))]),
    ];
    let kills = arr(ep.get("kills"));
    let mut top: Vec<Value> = kills.iter().filter(|k| !truthy(k.get("bond"))).cloned().collect();
    top.sort_by(|a, b| (-n_or0(a.get("cr"))).partial_cmp(&(-n_or0(b.get("cr")))).unwrap_or(std::cmp::Ordering::Equal));
    top.truncate(5);
    let rows: Vec<Value> = top.iter().map(|k| kill_row(tr, k)).collect();
    let mut sections: Vec<Value> = vec![json!([tr.t0("report.top"), "feed", if rows.is_empty() { vec![json!(["", tr.t0("report.nokills"), ""])] } else { rows }])];
    let bonds: Vec<&Value> = kills.iter().filter(|k| truthy(k.get("bond"))).collect();
    if !bonds.is_empty() {
        let mut facs: Vec<String> = bonds.iter().filter(|k| truthy(k.get("fac"))).map(|k| py_str(&k["fac"])).collect();
        facs.sort();
        facs.dedup();
        sections.push(json!([tr.t0("report.bonds"), "feed", [[format!("+{}", num(ep.get("bonds"))), tr.t_n("report.bond", bonds.len() as i64), first_chars(&facs.join(", "), 60)]]]));
    }
    let away: Vec<Value> = arr(ep.get("pri")).into_iter().filter(|x| !truthy(x.get("l"))).take(4).collect();
    if !away.is_empty() {
        let rows: Vec<Value> = away.iter().map(|x| json!([if truthy(x.get("b")) { num(x.get("b")) } else { String::new() }, getd(x, "p", json!("")), getd(x, "s", json!(""))])).collect();
        sections.push(json!([tr.t0("report.away"), "feed", rows]));
    }
    let mut notes: Vec<String> = Vec::new();
    if truthy(ep.get("ttkAvg")) {
        let f = get_or_empty(ep, "ttkFast", &empty);
        let mut s = tr.t("report.avg", &[("t", json!(dur(tr, n_or0(ep.get("ttkAvg")))))]);
        if truthy(Some(f)) {
            s += &tr.t("report.fastest", &[("t", json!(dur(tr, n_or0(f.get("ms")))))]);
        }
        notes.push(s);
    }
    let r = get_or_empty(v, "rank", &empty);
    if let (Some(p), Some(p0)) = (r.get("p").filter(|x| !x.is_null()), r.get("p0").filter(|x| !x.is_null())) {
        if as_float(Some(p)).unwrap_or(0.0) > as_float(Some(p0)).unwrap_or(0.0) {
            let d = as_float(Some(p)).unwrap_or(0.0) - as_float(Some(p0)).unwrap_or(0.0);
            notes.push(tr.t("report.rank", &[("n", if d.fract() == 0.0 { json!(d as i64) } else { json!(d) })]));
        }
    }
    if truthy(v.get("team")) {
        notes.push(tr.t("report.team", &[("n", getd(ep, "shN", json!(0))), ("total", n_v.clone())]));
    }
    if claims_extra > 0.0 {
        notes.push(tr.t("report.claims", &[("amount", json!(num(Some(&json!(claims_extra)))))]));
    }
    let head = if truthy(v.get("cmdr")) { format!("CMDR {}", py_str(&v["cmdr"])) } else { tr.t0("report.last") };
    let _ = now_ms;
    json!({"kind": "card", "wide": true, "title": tr.t0("report.title"), "head": head, "head2": head2, "badge": result(tr, ep), "tiles": tiles, "sections": sections, "note": notes.join(" · ")})
}

pub fn placeholder(tr: &I18n, key: &str) -> Option<Value> {
    if !["target", "targets", "feed", "fight", "speed"].contains(&key) {
        return None;
    }
    Some(json!({"kind": "card", "title": tr.t0(&format!("ph.name.{key}")), "note": tr.t0(&format!("ph.{key}"))}))
}

/// Between fights, when the HUD stays up: the last fight's kills, totals and takedown speed.
fn last_fight(tr: &I18n, key: &str, ep: &Value, outer_now: f64) -> Option<Value> {
    let mut e2 = ep.clone();
    if let Some(o) = e2.as_object_mut() {
        let (t0, t1) = (ep.get("t0").cloned().unwrap_or(Value::Null), ep.get("t1").cloned().unwrap_or(Value::Null));
        o.insert("t0".into(), t0);
        o.insert("t1".into(), t1);
    }
    let v = json!({"on": true, "ep": e2});
    let now = if truthy(ep.get("t1")) { n_or0(ep.get("t1")) } else { outer_now };
    let mut m = model(tr, key, &v, now, &Opts::default())?;
    let title = if key == "fight" { tr.t0("fight.last") } else { format!("{}{}", m.get("title").and_then(Value::as_str).unwrap_or(""), tr.t0("fight.last_suffix")) };
    m["title"] = json!(title);
    Some(m)
}

// ------------------------------------------------------------------------------------------------ one window's card

pub fn model(tr: &I18n, key: &str, v: &Value, now_ms: f64, opts: &Opts) -> Option<Value> {
    let empty = json!({});
    let v = if truthy(Some(v)) { v } else { &empty };
    let always = opts.always;
    let ep = get_or_empty(v, "ep", &empty);
    let (on, soft) = (truthy(v.get("on")), truthy(v.get("soft")));
    let op = get_or_empty(v, "op", &empty);
    let report_ms = (if opts.report_s != 0.0 { opts.report_s } else { REPORT_S }) * 1000.0;
    let fresh_report = !on && (truthy(v.get("past")) || now_ms - n_or0(ep.get("t1")) < report_ms);
    let wing_on = opts.wing_bonus_on || (opts.wing_bonus_op && truthy(Some(op)));
    match key {
        "status" => {
            if on && soft {
                return Some(json!({"kind": "chip", "tone": "amber", "text": tr.t0("st.near"), "sub": tr.t0("st.near.sub")}));
            }
            if on {
                let ph = if truthy(ep.get("op")) { tr.t("st.phase", &[("n", getd(ep, "phase", json!(1)))]) } else { String::new() };
                let t0 = if truthy(ep.get("t0")) { n_or0(ep.get("t0")) } else { now_ms };
                return Some(json!({"kind": "chip", "tone": "red", "text": tr.t0("st.combat"),
                    "sub": tr.t("st.combat.sub", &[("n", getd(ep, "n", json!(0))), ("cr", json!(num(ep.get("cr")))), ("time", json!(dur(tr, now_ms - t0))), ("phase", json!(ph))])}));
            }
            let name = { let n = or_s(op, "name"); if !n.is_empty() { n } else { or_s(ep, "sys") } };
            let fight_bonus = if wing_on { n_or0(ep.get("wing_bonus")) } else { 0.0 };
            let totals = format!("{}{}", if name.is_empty() { String::new() } else { format!("{name}  ·  ") },
                tr.t("st.totals", &[("n", getd(ep, "n", json!(0))), ("cr", json!(num(Some(&json!(n_or0(ep.get("cr")) + fight_bonus))))),
                    ("time", json!(dur(tr, n_or0(ep.get("t1")) - n_or0(ep.get("t0")))))]));
            if fresh_report && !truthy(v.get("past")) {
                let died = truthy(ep.get("died"));
                return Some(json!({"kind": "chip", "tone": if died { "red" } else { "green" }, "text": if died { tr.t0("st.lost") } else { tr.t0("st.over") }, "sub": totals}));
            }
            if always {
                return Some(json!({"kind": "chip", "tone": "grey", "text": tr.t0("st.standby"),
                    "sub": if truthy(ep.get("t0")) { tr.t("st.standby.last", &[("totals", json!(totals))]) } else { tr.t0("st.standby.none") }}));
            }
            None
        }
        "shortcuts" => {
            if !opts.keys_on {
                return None;
            }
            let rows: Vec<Value> = keys_help(tr, opts.hints.as_ref()).into_iter().map(|(k, what)| json!([k, what, ""])).collect();
            if rows.is_empty() {
                return None; // (live key hints and no key set for any job: nothing to list)
            }
            Some(json!({"kind": "card", "title": tr.t0("keys.title"), "head2": tr.t0("keys.head2"), "sections": [["", "feed", rows]],
                "count": [tr.t0("keys.count"), opts.keys_left, tr.t0("unit.s")]}))
        }
        "bounty" => Some(bounty_h(tr, opts.bounty.as_ref(), truthy(Some(op)), opts.hints.as_ref())),
        "report" => {
            if !opts.report_on || !truthy(ep.get("t0")) {
                return None;
            }
            let extra = if opts.claims_note { claims_before(v, opts.bounty.as_ref(), wing_on) } else { 0.0 };
            let mut m = report(tr, v, now_ms, wing_on, extra);
            match opts.hints.as_ref() {
                None => m["count"] = json!([tr.t0("report.count"), opts.report_left, tr.t0("report.count.unit")]),
                Some(h) => {
                    // "closes in 10 s · <key>: Close" (the close key is the one set for the report key; no key set: just the countdown), and under it how to clear it
                    let unit = with_key(tr, h, "report", "report.count.unit.key").unwrap_or_else(|| tr.t0("unit.s"));
                    m["count"] = json!([tr.t0("report.count"), opts.report_left, unit]);
                    if let Some(c) = with_key(tr, h, "report_clear", "report.clear.hint") {
                        let note = m.get("note").and_then(Value::as_str).unwrap_or("").to_string();
                        m["note"] = json!(if note.is_empty() { c } else { format!("{note}
{c}") });
                    }
                }
            }
            Some(m)
        }
        "banner" => {
            if !(opts.banner && on && !soft) {
                return None;
            }
            Some(json!({"kind": "banner", "text": tr.t0("banner.text"), "sub": join(vec![tr.t0("banner.sub"), where_of(v)], " · ")}))
        }
        "target" => target(tr, v, ep, on, opts),
        "targets" => targets(tr, v, ep, on, opts),
        _ => {
            // This fight and Takedown speed show the last fight between fights; the kill feed too while the HUD stays up
            let last = !on && truthy(ep.get("t0")) && (matches!(key, "fight" | "speed") || (always && key == "feed"));
            if !on && !last {
                return None;
            }
            if key == "alert" {
                let i = ep.get("intd").filter(|x| truthy(Some(x)))?;
                if now_ms - n_or0(i.get("t")) >= (ALERT_S * 1000) as f64 {
                    return None;
                }
                let (head, what, tone) = intd(tr, i.get("st"));
                let who = or_s(i, "who");
                let st = i.get("st").and_then(Value::as_str).unwrap_or("");
                let by = if who.is_empty() { String::new() } else {
                    let pre = if st == "you interdicted" { String::new() } else if st == "escaped" { tr.t0("intd.from") } else { tr.t0("intd.by") };
                    format!("{pre}{who}")
                };
                let player = if truthy(i.get("player")) { tr.t0("intd.player") } else { String::new() };
                let ago = tr.t("unit.ago", &[("t", json!(dur(tr, now_ms - n_or0(i.get("t")))))]);
                return Some(json!({"kind": "chip", "tone": tone, "text": head, "sub": join(vec![format!("{by}{player}"), what, ago], "  ·  ")}));
            }
            if soft {
                return None;
            }
            if last {
                return last_fight(tr, key, ep, now_ms);
            }
            match key {
                "feed" => {
                    let ks: Vec<Value> = arr(ep.get("kills")).into_iter().take(if opts.feed_rows > 0 { opts.feed_rows as usize } else { 6 }).collect();
                    if ks.is_empty() {
                        return None;
                    }
                    Some(json!({"kind": "card", "title": tr.t0("feed.title"), "cols": "feed", "rows": ks.iter().map(|k| kill_row(tr, k)).collect::<Vec<_>>()}))
                }
                "fight" => {
                    let seen_v = pymax(or0v(ep.get("seenN")), or0v(ep.get("n")));
                    let seen = n_or0(Some(&seen_v));
                    let ms = now_ms - if truthy(ep.get("t0")) { n_or0(ep.get("t0")) } else { now_ms };
                    let n_v = getd(ep, "n", json!(0));
                    let tiles = vec![
                        json!([tr.t0("tile.kills"), format!("{}{}", py_str(&n_v), if truthy(Some(&seen_v)) { format!("/{}", py_str(&seen_v)) } else { String::new() })]),
                        json!([tr.t0("tile.credits"), num(ep.get("cr"))]),
                        json!([tr.t0("tile.time"), dur(tr, ms)]),
                        json!([tr.t0("tile.kpm"), per_min(tr, n_or0(Some(&n_v)), ms)]),
                        json!([tr.t0("tile.waves"), py_str(&getd(ep, "attacks", json!(0)))]),
                        json!([tr.t0("tile.fell"), format!("{}×", py_str(&getd(ep, "shDown", json!(0))))]),
                    ];
                    let big = ep.get("big").filter(|x| truthy(Some(x)));
                    let note = join(vec![
                        if seen != 0.0 { tr.t("fight.seen", &[("n", seen_v.clone())]) } else { String::new() },
                        match big { Some(b) => tr.t("fight.big", &[("pilot", getd(b, "pilot", Value::Null)), ("cr", json!(num(b.get("cr"))))]), None => String::new() },
                    ], " · ");
                    Some(json!({"kind": "card", "title": tr.t0("fight.title"), "tiles": tiles, "note": note}))
                }
                "speed" => {
                    if !truthy(ep.get("ttkAvg")) {
                        return None;
                    }
                    let empty2 = json!({});
                    let f = get_or_empty(ep, "ttkFast", &empty2);
                    let mut tiles = vec![
                        json!([tr.t0("tile.average"), dur(tr, n_or0(ep.get("ttkAvg")))]),
                        json!([tr.t0("tile.fastest"), if truthy(Some(f)) { dur(tr, n_or0(f.get("ms"))) } else { "-".into() }]),
                    ];
                    if let Some(x) = ep.get("shRate").filter(|x| !x.is_null()) {
                        tiles.push(json!([tr.t0("tile.sh_rate"), fmt_f(as_float(Some(x)).unwrap_or(0.0), 1)]));
                    }
                    if let Some(x) = ep.get("hRate").filter(|x| !x.is_null()) {
                        tiles.push(json!([tr.t0("tile.h_rate"), fmt_f(as_float(Some(x)).unwrap_or(0.0), 1)]));
                    }
                    let note = if truthy(Some(f)) { join(vec![or_s(f, "pilot"), or_s(f, "ship")], " · ") } else { String::new() };
                    Some(json!({"kind": "card", "title": tr.t0("speed.title"), "tiles": tiles, "note": note}))
                }
                _ => None,
            }
        }
    }
}

fn has_wanted(legal: &str) -> bool {
    let l = legal.to_lowercase();
    l.contains("wanted") || l.contains("enemy") || l.contains("hunter")
}

fn target(tr: &I18n, v: &Value, _ep: &Value, on: bool, opts: &Opts) -> Option<Value> {
    let mut tg: Option<&Value> = if on { v.get("tg") } else { opts.tg.as_ref() };
    if let Some(t) = tg {
        if !on && truthy(Some(t)) && !(opts.always || truthy(t.get("bounty")) || has_wanted(&or_s(t, "legal"))) {
            tg = None; // out of a fight: only a wanted ship, unless the HUD stays up
        }
    }
    let tg = tg.filter(|t| truthy(Some(t)))?;
    let rank = or_s(tg, "rank");
    let head = { let p = or_s(tg, "pilot"); if !p.is_empty() { p } else { let s = or_s(tg, "ship"); if !s.is_empty() { s } else { tr.t0("target.unknown") } } };
    let mut head2 = join(vec![if truthy(tg.get("pilot")) { or_s(tg, "ship") } else { String::new() }, rank, if truthy(tg.get("cmdr")) { "CMDR".into() } else { String::new() }], " · ");
    if head2.is_empty() {
        head2 = tr.t0("target.unscanned");
    }
    let mut bars = vec![json!([tr.t0("target.shield"), getd(tg, "sh", Value::Null)]), json!([tr.t0("target.hull"), getd(tg, "hull", Value::Null)])];
    if truthy(tg.get("sub")) {
        bars.push(json!([first_chars(&py_str(&tg["sub"]).to_uppercase(), 22), getd(tg, "subH", Value::Null)]));
    }
    let d = tg.get("d").filter(|x| truthy(Some(x)));
    let nosub = if truthy(tg.get("sub")) { String::new() } else { tr.t0("target.nosub") };
    let note = if truthy(tg.get("lost")) {
        tr.t0("target.lost") + &nosub
    } else if let Some(d) = d.filter(|d| truthy(d.get("dt"))) {
        let (sh, h) = (n_or0(d.get("sh")), n_or0(d.get("h")));
        let sign = |x: f64| format!("{}{}%", if x > 0.0 { "−" } else if x < 0.0 { "+" } else { "" }, round(x).abs());
        let dt = n_or0(d.get("dt"));
        let rate = fmt_f((sh.max(0.0) + h.max(0.0)) / (dt / 1000.0), 1);
        tr.t("target.since", &[("t", json!(dur(tr, dt))), ("sh", json!(sign(sh))), ("h", json!(sign(h))), ("rate", json!(rate))]) + &nosub
    } else {
        tr.t0("target.asof") + &nosub
    };
    Some(json!({"kind": "card", "title": tr.t0("target.title"), "head": head, "head2": head2, "bars": bars, "note": note}))
}

fn targets(tr: &I18n, v: &Value, ep: &Value, on: bool, opts: &Opts) -> Option<Value> {
    let source = if on { arr(ep.get("pri")) } else { arr(opts.scan.as_ref()) };
    let pri = sort_targets(drop_lost(source, opts), opts);
    let gone: Vec<Value> = if on && opts.show_gone { arr(ep.get("tgts")).into_iter().filter(|x| truthy(x.get("k"))).take(4).collect() } else { Vec::new() };
    let mut cur: Option<&Value> = if on { v.get("tg") } else { opts.tg.as_ref() }.filter(|c| truthy(Some(c)));
    if let Some(c) = cur {
        if truthy(c.get("lost")) {
            cur = None; // the lock itself is gone: nothing here should still read as selected
        }
    }
    if pri.is_empty() && gone.is_empty() && cur.is_none() {
        return None;
    }
    let top_idx = pri.iter().position(|x| truthy(x.get("b")));
    let n = { let r = opts.rows; (if r != 0 { r } else { 6 }).max(1) as usize };
    let same_t = |p: &Value, c: &Value| truthy(c.get("t")) && match (p.get("t"), c.get("t")) {
        (Some(a), Some(b)) => as_float(Some(a)) == as_float(Some(b)) && as_float(Some(a)).is_some(),
        _ => false,
    };
    let cur_i = cur.and_then(|c| pri.iter().position(|p| same_t(p, c)));
    let value_of = |p: &Value| -> String {
        if truthy(p.get("b")) { num(p.get("b")) } else if truthy(p.get("q")) { tr.t0("targets.nobounty") } else { tr.t0("targets.scanning") }
    };
    let row_of = |i: usize, p: &Value, locked: bool| -> Value {
        let mut flags: Vec<String> = vec![txt(p, "s"), txt(p, "r")];
        if truthy(p.get("c")) { flags.push("CMDR".into()); }
        if truthy(p.get("l")) { flags.push(tr.t0("targets.clean")); }
        if truthy(p.get("x")) { flags.push(tr.t0("targets.crit")); }
        flags[0] = if truthy(p.get("s")) { txt(p, "p") } else { String::new() }; // the ship's type on top, the pilot under it
        let name = name_of(p);
        json!([(i + 1).to_string(), name, join(flags, " · "), value_of(p), [getd(p, "sh", Value::Null), getd(p, "h", Value::Null)], top_idx == Some(i), locked])
    };
    let main_idx: Vec<usize> = pri.iter().enumerate().filter(|(_, p)| kind_of(p) < 2).map(|(i, _)| i).take(n).collect();
    let mut rows: Vec<Value> = main_idx.iter().map(|&i| row_of(i, &pri[i], Some(i) == cur_i)).collect();
    if let Some(ci) = cur_i.filter(|ci| !main_idx.contains(ci)) {
        rows.push(row_of(ci, &pri[ci], true)); // locked onto one outside the top rows: shown here too, its real rank kept
    } else if let (Some(c), None) = (cur, cur_i) {
        // locked onto something the list does not have yet: straight from the TARGET card's own data, so it is never late
        let empty = json!({});
        let scan_tg = opts.tg.as_ref().filter(|t| truthy(Some(t))).unwrap_or(&empty);
        let legal = or_s(scan_tg, "legal");
        let b = scan_tg.get("bounty").filter(|x| truthy(Some(x)));
        let flags = join(vec![or_s(c, "rank"), if truthy(c.get("cmdr")) { "CMDR".into() } else { String::new() }, if legal == "Clean" { tr.t0("targets.clean") } else { String::new() }], " · ");
        let value = match b { Some(b) => num(Some(b)), None => if !legal.is_empty() { tr.t0("targets.nobounty") } else { tr.t0("targets.scanning") } };
        let name = { let s = or_s(c, "ship"); if !s.is_empty() { s } else { or_s(c, "pilot") } };
        rows.push(json!(["?", name, flags, value, [getd(c, "sh", Value::Null), getd(c, "hull", Value::Null)], false, true]));
    }
    let shown: Vec<usize> = { let mut s = main_idx.clone(); if let Some(ci) = cur_i { s.push(ci); } s };
    let rest: Vec<&Value> = pri.iter().enumerate().filter(|(i, _)| !shown.contains(i)).map(|(_, p)| p).collect();
    let more_rows: Vec<Value> = rest.iter().take(n).map(|p| json!([value_of(p), name_of(p), ""])).collect();
    let note = if rest.len() > n { tr.t("targets.more", &[("n", json!(rest.len() - n))]) } else { String::new() };
    let alive = if !pri.is_empty() {
        let total: f64 = pri.iter().map(|x| n_or0(x.get("b"))).sum();
        tr.t(if on { "targets.alive" } else { "targets.scanned" }, &[("n", json!(pri.len())), ("cr", json!(num(Some(&json!(total)))))])
    } else {
        tr.t0("targets.cycle")
    };
    let mut sections: Vec<Value> = Vec::new();
    if !more_rows.is_empty() {
        sections.push(json!(["", "feed", more_rows]));
    }
    if !gone.is_empty() {
        let rows: Vec<Value> = gone.iter().map(|x| {
            let sub = join(vec![if truthy(x.get("s")) { txt(x, "p") } else { String::new() }, or_s(x, "r")], " · ");
            json!([tr.t0("targets.destroyed"), name_of(x), sub])
        }).collect();
        sections.push(json!([tr.t0("targets.gone"), "feed", rows]));
    }
    Some(json!({"kind": "card", "title": if opts.sort != "s" { tr.t0("targets.title.value") } else { tr.t0("targets.title.order") }, "head2": alive,
        "cols": "rank", "rows": rows, "sections": sections, "note": note}))
}

// ------------------------------------------------------------------------------------------------ places (load.py's home and anchor_of)

#[derive(Clone)]
pub struct WinCfg {
    pub on: bool,
    pub x: f64,
    pub y: f64,
    pub dx: f64,
    pub dy: f64,
    pub colour: String,
    pub shape: (f64, i64, i64, i64),
    pub when: String,
    /// the left and right of the screen give the window the perspective of the panel there (the middle is flat); off = always flat
    pub persp: bool,
    /// the dark ground behind this window: -1 follows the global switch, 0 off, 1..100 on at that level (75 is the plugin's)
    pub ground: i64,
    /// this window's own size (percent) and opacity (percent): -1 follows the settings for all windows
    pub size: i64,
    pub opacity: i64,
}

/// A window's default place, as a panel of the game: flat at the top in the middle, on the plane under the comms panel or the INFO panel
/// ahead, or beside the side panel it is tied to.
pub fn home(key: &str, w: &WinCfg, i: usize) -> Vec<Value> {
    let top = [("status", 0.022), ("alert", 0.072), ("report", 0.115), ("banner", 0.27), ("sysmap", 0.012), ("xenoreport", 0.115), ("modecard", 0.03), ("inputs", 0.66), ("debrief", 0.115), ("pvp", 0.045)];
    if let Some((_, t)) = top.iter().find(|(k, _)| *k == key) {
        return vec![json!("top"), json!(t)];
    }
    let plane = |p: &str| vec![json!("plane"), json!(p)];
    let area = |a: &str| vec![json!("area"), json!(a)];
    match w.when.as_str() {
        "ext" => return plane("left"),
        "int" => return plane("right"),
        "main_l" => return plane("comms"),
        "main_r" => return plane("info"),
        "main_t" => return vec![json!("mid"), json!("top")],
        _ if key == "shortcuts" => return vec![json!("mid"), json!("top")],
        "role_l" => return area("role_a"),
        "role_t" => return area("role_b"),
        "int_t" => return area("right_t"),
        "comms" | "role" => return area(&format!("{}_{}", w.when, ["a", "b"][i % 2])),
        _ => {}
    }
    let p = match key {
        "targets" | "thargoid" => "comms",
        "target" | "feed" | "bounty" => "info",
        "fight" => "left",
        "speed" => "right",
        _ => "comms",
    };
    let p = if p == "left" { "comms" } else if p == "right" { "info" } else { p }; // tied to no panel: ahead, on its side
    plane(p)
}

/// Which game panel a window holds on to: the one it sits by, both for the windows in the middle at the top; None for a side panel's windows.
pub fn anchor_of(w: &WinCfg, place: Option<&Vec<Value>>) -> Value {
    if let Some(p) = place {
        if p[0] == "top" {
            return json!("center");
        }
        return match p[1].as_str() {
            Some("comms") => json!("comms"),
            Some("info") => json!("info"),
            _ => Value::Null,
        };
    }
    if panel_of(&w.when).is_some() {
        return Value::Null;
    }
    json!(if w.x < 40.0 { "comms" } else if w.x > 60.0 { "info" } else { "center" })
}

// ------------------------------------------------------------------------------------------------ Preview: made-up fights

pub const REPORT_DEMO_S: i64 = 10; // (Preview: the report's countdown shows this)

/// What the windows look like in a fight: for Preview (made-up pilots).
pub fn sample(now_ms: f64) -> Value {
    let n = now_ms as i64;
    json!({"on": true, "soft": 0, "op": {"name": "Preview"},
        "tg": {"pilot": "Ada Kell", "ship": "Viper Mk III", "rank": "Elite", "sh": 0, "hull": 64, "sub": "Frame Shift Drive", "subH": 41,
               "d": {"dt": 12_000, "sh": 40, "h": 20}},
        "ep": {"n": 3, "cr": 1_234_000, "t0": n - 133_000, "t1": n, "phase": 2, "op": true, "seenN": 7, "attacks": 4, "heat": 1, "shDown": 1,
               "ttkAvg": 34_000, "ttkFast": {"ms": 12_000, "pilot": "Vex Morrow", "ship": "Fer-de-Lance"}, "shRate": 3.4, "hRate": 1.9,
               "big": {"pilot": "Vex Morrow", "cr": 412_000},
               "intd": {"t": n - 20_000, "st": "dropped", "who": "Naraya", "player": false},
               "pri": [{"p": "Naraya", "s": "Fer-de-Lance", "r": "Deadly", "b": 1_198_100, "sh": 0, "h": 62, "q": 1},
                       {"p": "Neil Bond", "s": "Python Mk II", "r": "Elite", "b": 975_800, "sh": 100, "h": 100, "q": 1},
                       {"p": "General Curse", "s": "Anaconda", "b": 881_600, "sh": 55, "h": 100, "q": 1, "x": 1},
                       {"p": "CMDR Rho Tann", "s": "Corsair", "b": 250_000, "c": 1, "q": 1},
                       {"p": "Officer Lane", "s": "Viper Mk IV", "b": 0, "l": 1, "q": 1}],
               "kills": [{"pilot": "Vex Morrow", "ship": "Fer-de-Lance", "cr": 412_000, "shared": 2}, {"pilot": "Brian Boru", "ship": "Cobra Mk IV", "cr": 159_984, "shared": 0},
                         {"pilot": "Mark Cross", "ship": "Cobra Mk V", "cr": 271_300, "shared": 1}]}})
}

pub fn sample_bounty() -> Value {
    json!({"cr": 2_871_400, "n": 14, "bounties": 2_871_400, "kills": 14, "bonds": null, "bond_n": 0,
           "unclaimed": 6_402_150, "cashed": 21_824_739, "lost": 0,
           "claim": [5_300_000, [["Federal Navy", 4_200_000], ["Pilots' Federation", 1_100_000]], 95_000, [[21_824_739, "Col 285 Sector VR-E b27-1", "Nermesos Forge"]], true]})
}

/// A finished fight, for Preview: the report window.
pub fn sample_report(now_ms: f64) -> Value {
    let mut v = sample(now_ms);
    v["on"] = json!(false);
    v["past"] = json!(true);
    v["cmdr"] = json!("Hongark");
    let pri = v["ep"]["pri"].as_array().cloned().unwrap_or_default();
    v["ep"]["pri"] = Value::Array(pri.into_iter().skip(1).take(2).collect());
    v
}

#[cfg(test)]
mod claims_note_tests {
    use super::*;

    /// The real case: 10 kills worth 5,669,929, one 569,701 kill from 8 minutes before the fight is still in Claims.
    fn case(claims: i64, wing_bonus_claims: i64, fight_cr: i64, fight_bonus: i64, bonds: Option<(i64, i64)>, ep_bonds: i64) -> (Value, Value) {
        let mut b = json!({"cr": 0, "claim": [claims, [], wing_bonus_claims, [], false]});
        if let Some((t, bonus)) = bonds {
            b["bond_owed"] = json!({"total": t, "bonus": bonus, "by": []});
        }
        let v = json!({"ep": {"t0": 1000, "t1": 2000, "n": 10, "cr": fight_cr, "wing_bonus": fight_bonus, "bonds": ep_bonds}});
        (v, b)
    }
    fn note(m: &Value) -> String { m["note"].as_str().unwrap_or("").to_string() }

    #[test]
    fn claims_above_the_fight_say_how_much_is_from_before() {
        let tr = I18n::new("en");
        let (v, b) = case(6_239_630, 0, 5_669_929, 0, None, 0);
        assert_eq!(claims_before(&v, Some(&b), false), 569_701.0);
        let n = note(&report(&tr, &v, 0.0, false, claims_before(&v, Some(&b), false)));
        assert!(n.contains("569,701"), "{n}");
        // in German and Russian too (the sentence exists in every language)
        for l in ["de", "es", "fr", "pt-br", "ru"] {
            let n = note(&report(&I18n::new(l), &v, 0.0, false, 569_701.0));
            assert!(n.contains("569,701"), "{l}: {n}");
        }
    }
    #[test]
    fn equal_or_lower_or_unknown_claims_say_nothing() {
        let tr = I18n::new("en");
        let (v, b) = case(5_669_929, 0, 5_669_929, 0, None, 0);
        assert_eq!(claims_before(&v, Some(&b), false), 0.0);
        assert!(!note(&report(&tr, &v, 0.0, false, 0.0)).contains("Claims"));
        let (v, b) = case(100, 0, 5_669_929, 0, None, 0); // (part of it cashed in already)
        assert_eq!(claims_before(&v, Some(&b), false), 0.0);
        // Claims still being read, or no counter at all
        let unknown = json!({"cr": 0, "claim": null});
        assert_eq!(claims_before(&v, Some(&unknown), false), 0.0);
        assert_eq!(claims_before(&v, None, false), 0.0);
    }
    #[test]
    fn the_wing_estimate_counts_on_both_sides_and_bonds_only_when_claims_carry_them() {
        // wing on: claims 6,239,630 + 7.5 % bonus of 440,000 = 6,679,630; the fight 5,669,929 + 400,000 = 6,069,929 -> 609,701
        let (v, b) = case(6_239_630, 440_000, 5_669_929, 400_000, None, 0);
        assert_eq!(claims_before(&v, Some(&b), true), 609_701.0);
        // wing off: the bonuses are left out on both sides -> 569,701 again
        assert_eq!(claims_before(&v, Some(&b), false), 569_701.0);
        // bonds carried in Claims: the fight's own bonds are counted against them (a fight of 5,000,000 bounty + 2,000,000 bonds)
        let (v, b) = case(1_000_000, 0, 5_000_000, 0, Some((2_500_000, 0)), 2_000_000);
        // claims 1,000,000 + 2,500,000 = 3,500,000 < fight 7,000,000: nothing
        assert_eq!(claims_before(&v, Some(&b), false), 0.0);
        let (v, b) = case(6_000_000, 0, 5_000_000, 0, Some((2_500_000, 0)), 2_000_000);
        assert_eq!(claims_before(&v, Some(&b), false), 1_500_000.0); // 8,500,000 - 7,000,000
        // bonds off in Claims (no bond_owed): the fight's bonds are not counted either
        let (v, b) = case(6_000_000, 0, 5_000_000, 0, None, 2_000_000);
        assert_eq!(claims_before(&v, Some(&b), false), 1_000_000.0);
    }
    /// The report card with and without the note, drawn on a dark screen: research/app-golden/out/claims_note_<lang>.png (looked at by eye).
    #[test]
    fn the_report_with_the_note_is_drawn() {
        let out = crate::host::parity::golden_dir().join("../out");
        let _ = std::fs::create_dir_all(&out);
        let (w, h) = (2560.0, 1440.0);
        let s = crate::hud::pieces::scale(h, 1.0);
        for (lang, note) in [("en", false), ("en", true), ("de", true), ("ru", true), ("fr", true), ("pt-br", true), ("es", true)] {
            let tr = I18n::new(lang);
            let mut v = sample_report(1_000_000.0);
            v["on"] = json!(false);
            let cr = v["ep"]["cr"].as_f64().unwrap();
            let b = json!({"cr": 0, "claim": [cr + 569_701.0, [], 0, [], false]});
            let opts = Opts { bounty: Some(b), report_on: true, report_s: 60.0, claims_note: note, ..Default::default() };
            let m = model(&tr, "report", &v, v["ep"]["t1"].as_f64().unwrap() + 1000.0, &opts).expect("a report");
            let mut canvas = tiny_skia::Pixmap::new(w as u32, h as u32).unwrap();
            canvas.fill(tiny_skia::Color::from_rgba8(30, 40, 60, 255));
            let pv: Vec<Value> = vec![json!("top"), json!(0.115)];
            let v0 = crate::hud::place::cursor_key(&pv).and_then(|_| crate::hud::place::start_of(&pv, w, h));
            let p = crate::hud::place::paint(&tr, &m, 0.0, 0.0, "#ff7100", (0.0, 0, 100, 100), Some(&pv), v0, s, w, h, false, true, 190).expect("no picture");
            let src = tiny_skia::PixmapRef::from_bytes(&p.pic.rgba, p.pic.w, p.pic.h).unwrap();
            canvas.draw_pixmap(p.pic.x, p.pic.y, src, &tiny_skia::PixmapPaint::default(), tiny_skia::Transform::identity(), None);
            println!("{lang} note={note}: card {}x{} px at y {}", p.pic.w, p.pic.h, p.pic.y);
            canvas.save_png(out.join(format!("claims_note_{lang}{}.png", if note { "" } else { "_none" }))).unwrap();
        }
    }

    #[test]
    fn the_switch_off_is_the_plugins_report() {
        let tr = I18n::new("en");
        let (v, b) = case(6_239_630, 0, 5_669_929, 0, None, 0);
        let mut v2 = v.clone();
        v2["on"] = json!(false);
        let mut opts = Opts { bounty: Some(b), report_on: true, report_s: 60.0, ..Default::default() };
        let off = model(&tr, "report", &v2, 3000.0, &opts).unwrap();
        assert!(!note(&off).contains("569,701"));
        opts.claims_note = true;
        let on = model(&tr, "report", &v2, 3000.0, &opts).unwrap();
        assert!(note(&on).contains("569,701"));
    }
}
