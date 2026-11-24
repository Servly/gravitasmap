//! PVP mode: two fight files of the same fight (yours and the other commander's) put on one clock, and read together.
//! The files hold the Journal's own times (UTC), but two PCs' clocks can be seconds apart. So the clock is only the first guess: a death on one side and
//! a kill on the other are the SAME moment, and that pair (or an interdiction, which both sides write) sets the second clock to the first. With none of
//! them the clock is used as it is, and the page says so (and lets you move one side by hand). Nothing here is sent anywhere: files are read, never run.
use crate::dbcard::{fa_off_time, tx};
use crate::dbrules::mmss;
use crate::debrief::Rec;
use crate::i18n::I18n;
use serde_json::{json, Value};

/// two fights are the same fight only if they overlap in time by this many seconds (after the sync)
pub const MIN_OVERLAP: f64 = 5.0;
/// the first guess and the anchors may differ by this much before the anchor is taken as wrong (seconds)
pub const MAX_ANCHOR_JUMP: f64 = 600.0;
pub const MAX_LINES: usize = 4;

/// A fight file from text: only the exact shape of a PVP file, under 4 MB.
pub fn parse(text: &str) -> Option<Value> {
    if text.len() > 4_000_000 { return None; }
    let v: Value = serde_json::from_str(text).ok()?;
    if crate::pvpstore::valid(&v) { Some(v) } else { None }
}

/// A text from a received file: at most 80 letters, never anything but a string.
pub fn short(v: &Value) -> Value { Value::String(v.as_str().unwrap_or("").chars().take(80).collect()) }

/// The other person's ship build, rebuilt from the few things it may hold (ship, then up to 64 modules of slot, item and engineering), nothing else passes.
pub fn clean_build(b: Option<&Value>) -> Value {
    let Some(b) = b.filter(|b| b.is_object()) else { return Value::Null };
    let mods: Vec<Value> = b.get("modules").and_then(Value::as_array).into_iter().flatten().take(64).filter(|m| m.is_object()).map(|m| {
        let eng = m.get("eng").filter(|e| e.is_object()).map(|e| json!({"blueprint": short(&e["blueprint"]), "level": e["level"].as_i64(), "experimental": short(&e["experimental"])}));
        json!({"slot": short(&m["slot"]), "item": short(&m["item"]), "eng": eng})
    }).collect();
    json!({"ship": short(&b["ship"]), "modules": mods})
}

fn secs(v: &Value, k: &str) -> f64 { v[k].as_f64().unwrap_or(0.0) / 1000.0 }

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Sync {
    /// seconds to add to the second file's times to put them on the first file's clock
    pub off: f64,
    /// how it was found: "death" (A died, B killed), "kill" (A killed, B died), "interdiction", or "clock" (the PCs' clocks as they are)
    pub kind: &'static str,
}

pub fn sync_of(a: &Value, b: &Value) -> Sync {
    let (a0, b0) = (secs(a, "t0"), secs(b, "t0"));
    let an = |f: &Value, k: &str| f["anchors"][k].as_f64();
    let pair = |x: Option<f64>, y: Option<f64>, kind: &'static str| -> Option<Sync> {
        let off = (a0 + x?) - (b0 + y?);
        if off.abs() <= MAX_ANCHOR_JUMP { Some(Sync { off, kind }) } else { None }
    };
    pair(an(a, "died"), an(b, "pvpkill"), "death")
        .or_else(|| pair(an(a, "pvpkill"), an(b, "died"), "kill"))
        .or_else(|| pair(an(a, "interdiction"), an(b, "interdiction"), "interdiction"))
        .unwrap_or(Sync { off: 0.0, kind: "clock" })
}

fn names_match(a: &Value, b: &Value) -> bool {
    a["me"] == b["opponent"]["name"] && a["opponent"]["name"] == b["me"] && a["me"] != b["me"]
}

/// How long the two fights overlap once synced.
pub fn overlap(a: &Value, b: &Value, off: f64) -> f64 {
    let (a0, a1) = (secs(a, "t0"), secs(a, "t1"));
    let (b0, b1) = (secs(b, "t0") + off, secs(b, "t1") + off);
    (a1.min(b1) - a0.max(b0)).max(0.0)
}

#[derive(Clone, Debug, PartialEq)]
pub struct Pair {
    pub ai: usize,
    pub bi: usize,
    pub sync: Sync,
    pub overlap: f64,
}

/// Which of your fights and which of theirs are the same fight (the best overlap first, each file once).
pub fn pairs(a: &[Value], b: &[Value]) -> Vec<Pair> {
    let mut all: Vec<Pair> = Vec::new();
    for (i, x) in a.iter().enumerate() {
        for (j, y) in b.iter().enumerate() {
            if !names_match(x, y) { continue; }
            let sy = sync_of(x, y);
            let o = overlap(x, y, sy.off);
            if o >= MIN_OVERLAP { all.push(Pair { ai: i, bi: j, sync: sy, overlap: o }); }
        }
    }
    all.sort_by(|p, q| q.overlap.partial_cmp(&p.overlap).unwrap_or(std::cmp::Ordering::Equal));
    let (mut ua, mut ub) = (vec![false; a.len()], vec![false; b.len()]);
    let mut out = Vec::new();
    for p in all {
        if ua[p.ai] || ub[p.bi] { continue; }
        ua[p.ai] = true; ub[p.bi] = true;
        out.push(p);
    }
    out.sort_by(|p, q| secs(&a[q.ai], "t0").partial_cmp(&secs(&a[p.ai], "t0")).unwrap_or(std::cmp::Ordering::Equal));
    out
}

/// What the page lists for one file.
pub fn summary(f: &Value) -> Value {
    json!({"me": short(&f["me"]), "opp": short(&f["opponent"]["name"]), "no": f["no"], "result": short(&f["result"]), "len": f["rec"]["len"], "t0": f["t0"], "ship": short(&f["rec"]["ship"])})
}

#[derive(Clone, Debug, PartialEq)]
pub struct Line {
    pub key: &'static str,
    pub args: Vec<(&'static str, String)>,
    pub t: f64,
}

fn at(series: &[(f64, bool)], t: f64) -> Option<bool> { series.iter().take_while(|e| e.0 <= t).last().map(|e| e.1) }

/// The first shield down of one side that came after an attack on that side, in seconds from the first attack on it.
fn shield_after_attack(r: &Rec) -> Option<(f64, f64)> {
    let first = *r.atk.first()?;
    let mut prev: Option<bool> = None;
    for &(t, up) in &r.sh {
        let was = prev;
        prev = Some(up);
        if !up && was == Some(true) && t >= first { return Some((t, t - first)); }
    }
    None
}

/// Plain facts of the two fights together, in time order, at most MAX_LINES. `bshift` puts the second side on the first side's clock,
/// `base` is the earliest start (the 0:00 of the shared axis). No cause, no advice, nothing a file does not show.
pub fn lines(a: &Rec, b: &Rec, bshift: f64, base: f64, opp: &str) -> Vec<Line> {
    let mut out: Vec<Line> = Vec::new();
    let sh = |t: f64| mmss(t - base);
    if let (Some(&fa), Some(&fb)) = (a.atk.first(), b.atk.first()) {
        let (ta, tb) = (fa, fb + bshift);
        out.push(Line { key: "pvp.obs.first", t: ta.min(tb), args: vec![("ta", sh(ta)), ("tb", sh(tb)), ("opp", opp.to_string())] });
    }
    if let Some((t, s)) = shield_after_attack(a) {
        out.push(Line { key: "pvp.obs.shield_me", t, args: vec![("t", sh(t)), ("s", format!("{:.0}", s))] });
    }
    if let Some((t, s)) = shield_after_attack(b) {
        out.push(Line { key: "pvp.obs.shield_opp", t: t + bshift, args: vec![("t", sh(t + bshift)), ("s", format!("{:.0}", s)), ("opp", opp.to_string())] });
    }
    // Flight Assist: the share of each fight it was off (only when its state is known from the start of both)
    if at(&a.fa, 0.0).is_some() && at(&b.fa, 0.0).is_some() && a.len() > 0.0 && b.len() > 0.0 {
        let (pa, pb) = (fa_off_time(a).0 / a.len() * 100.0, fa_off_time(b).0 / b.len() * 100.0);
        out.push(Line { key: "pvp.obs.fa", t: f64::MAX / 4.0, args: vec![("pa", format!("{:.0}", pa)), ("pb", format!("{:.0}", pb)), ("opp", opp.to_string())] });
    }
    out.truncate(MAX_LINES);
    out.sort_by(|x, y| x.t.partial_cmp(&y.t).unwrap_or(std::cmp::Ordering::Equal));
    out
}

/// What the page gets for two sets of file texts: a summary of each (null for a text that is not a PVP file) and the pairs, as indexes into the sets as given.
pub fn pairs_json(mine: &[String], theirs: &[String]) -> Value {
    let (pm, pt): (Vec<Option<Value>>, Vec<Option<Value>>) = (mine.iter().map(|t| parse(t)).collect(), theirs.iter().map(|t| parse(t)).collect());
    let (ai, a): (Vec<usize>, Vec<Value>) = pm.iter().enumerate().filter_map(|(i, x)| x.clone().map(|v| (i, v))).unzip();
    let (bi, b): (Vec<usize>, Vec<Value>) = pt.iter().enumerate().filter_map(|(i, x)| x.clone().map(|v| (i, v))).unzip();
    let pairs: Vec<Value> = pairs(&a, &b).iter().map(|p| json!({"ai": ai[p.ai], "bi": bi[p.bi], "kind": p.sync.kind, "off": p.sync.off, "overlap": p.overlap})).collect();
    json!({"mine": pm.iter().map(|x| x.as_ref().map(summary)).collect::<Vec<_>>(), "theirs": pt.iter().map(|x| x.as_ref().map(summary)).collect::<Vec<_>>(), "pairs": pairs})
}

/// Both fights as one view for the page. `nudge` moves the second side by hand (seconds).
pub fn pair_view(tr: &I18n, a: &Value, b: &Value, nudge: f64, rules_on: bool) -> Option<Value> {
    if !names_match(a, b) { return None; }
    let (ra, rb) = (Rec::from_value(&a["rec"])?, Rec::from_value(&b["rec"])?);
    let sy = sync_of(a, b);
    let off = sy.off + nudge;
    let (a0, b0) = (secs(a, "t0"), secs(b, "t0"));
    let bshift = b0 + off - a0;
    let base = bshift.min(0.0);
    let opp = a["opponent"]["name"].as_str().unwrap_or("").to_string();
    let obs: Vec<Value> = if rules_on {
        lines(&ra, &rb, bshift, base, &opp).iter().map(|l| json!({"t": l.t, "text": tx(tr, l.key, &l.args)})).collect()
    } else { vec![] };
    let side = |f: &Value, r: &Rec| json!({"me": short(&f["me"]), "opp": short(&f["opponent"]["name"]), "no": f["no"].as_i64().unwrap_or(0), "result": short(&f["result"]), "rec": r.to_value(), "build": clean_build(f.get("build"))});
    Some(json!({
        "a": side(a, &ra), "b": side(b, &rb), "bshift": bshift, "base": base, "end": (ra.len()).max(rb.len() + bshift),
        "sync": {"kind": sy.kind, "off": sy.off, "nudge": nudge, "overlap": overlap(a, b, off)},
        "obs": obs, "rules": rules_on,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// a fight file in the shape pvp.rs writes (only what the sync and the lines read)
    fn file(me: &str, opp: &str, t0: f64, len: f64, anchors: Value, rec_extra: Value) -> Value {
        let mut rec = json!({"dbv": 1, "ep": {"t0": t0 * 1000.0, "t1": (t0 + len) * 1000.0}, "len": len, "ship": "Krait Mk II", "fa": [[0.0, 1]], "sh": [[0.0, 1]], "atk": [], "kind": "pvp"});
        for (k, v) in rec_extra.as_object().unwrap() { rec[k] = v.clone(); }
        json!({"gravitas": 1, "kind": "pvp-fight", "me": me, "opponent": {"name": opp}, "no": 1, "result": "unknown", "t0": t0 * 1000.0, "t1": (t0 + len) * 1000.0, "anchors": anchors, "rec": rec})
    }

    #[test]
    fn a_death_and_a_kill_are_one_moment_even_when_the_clocks_differ() {
        // Hongark died 100 s into his fight, which began at 1000. TestFriend's PC is 7 s fast: his fight began at 1013 (his clock), the kill is 94 s in (1107 on his clock = 1100 on Hongark's).
        let a = file("Hongark", "TestFriend", 1000.0, 120.0, json!({"died": 100.0}), json!({}));
        let b = file("TestFriend", "Hongark", 1013.0, 100.0, json!({"pvpkill": 94.0}), json!({}));
        let s = sync_of(&a, &b);
        assert_eq!(s.kind, "death");
        assert!((s.off - -7.0).abs() < 1e-9, "{s:?}"); // (his times are put 7 s earlier)
        // the other way round: Hongark killed
        let s2 = sync_of(&b, &a);
        assert_eq!(s2.kind, "kill");
        assert!((s2.off - 7.0).abs() < 1e-9);
        // no anchor at all: the clocks as they are
        let c = file("TestFriend", "Hongark", 1013.0, 100.0, json!({}), json!({}));
        assert_eq!(sync_of(&a, &c), Sync { off: 0.0, kind: "clock" });
        // an interdiction both wrote
        let d = file("Hongark", "TestFriend", 1000.0, 50.0, json!({"interdiction": 4.0}), json!({}));
        let e = file("TestFriend", "Hongark", 1010.0, 50.0, json!({"interdiction": 6.0}), json!({}));
        assert_eq!(sync_of(&d, &e).kind, "interdiction");
        assert!((sync_of(&d, &e).off - -12.0).abs() < 1e-9);
        // an anchor that would put the fights hours apart is not trusted
        let far = file("TestFriend", "Hongark", 50000.0, 100.0, json!({"pvpkill": 94.0}), json!({}));
        assert_eq!(sync_of(&a, &far).kind, "clock");
    }

    #[test]
    fn pairs_need_the_names_to_match_and_the_fights_to_overlap() {
        let a1 = file("Hongark", "TestFriend", 1000.0, 120.0, json!({"died": 100.0}), json!({}));
        let a2 = file("Hongark", "TestFriend", 5000.0, 90.0, json!({}), json!({}));
        let b1 = file("TestFriend", "Hongark", 1013.0, 100.0, json!({"pvpkill": 94.0}), json!({})); // the same fight as a1
        let b2 = file("TestFriend", "Hongark", 5002.0, 80.0, json!({}), json!({}));            // the same fight as a2 (clock only)
        let other = file("Someone", "Hongark", 1000.0, 120.0, json!({}), json!({}));              // not against Hongark's opponent
        let p = pairs(&[a1.clone(), a2.clone()], &[b2.clone(), other, b1.clone()]);
        assert_eq!(p.len(), 2);
        // newest of yours first
        assert_eq!((p[0].ai, p[0].bi, p[0].sync.kind), (1, 0, "clock"));
        assert_eq!((p[1].ai, p[1].bi, p[1].sync.kind), (0, 2, "death"));
        // the same two files where the clocks are far apart and nothing anchors them: no pair (they do not overlap)
        let late = file("TestFriend", "Hongark", 1300.0, 100.0, json!({}), json!({}));
        assert!(pairs(&[a1.clone()], &[late]).is_empty());
        // fewer than 5 s together
        let edge = file("TestFriend", "Hongark", 1117.0, 100.0, json!({}), json!({}));
        assert!(pairs(&[a1.clone()], &[edge]).is_empty());
        let edge2 = file("TestFriend", "Hongark", 1115.0, 100.0, json!({}), json!({}));
        assert_eq!(pairs(&[a1], &[edge2]).len(), 1); // exactly 5 s: together
        // a file from nowhere is not a fight file
        assert!(parse("{}").is_none() && parse("nonsense").is_none());
    }

    #[test]
    fn the_lines_are_facts_in_time_order_and_say_nothing_without_both_sides() {
        let ra = Rec::from_value(&file("Hongark", "TestFriend", 1000.0, 100.0, json!({}),
            json!({"atk": [10.0, 12.0], "sh": [[0.0, 1], [25.0, 0]], "fa": [[0.0, 1]]}))["rec"]).unwrap();
        let rb = Rec::from_value(&file("TestFriend", "Hongark", 1005.0, 100.0, json!({}),
            json!({"atk": [8.0], "sh": [[0.0, 1], [60.0, 0]], "fa": [[0.0, 0]]}))["rec"]).unwrap();
        // the second side's times are 5 s later on the shared axis (bshift 5), the axis starts at 0
        let l = lines(&ra, &rb, 5.0, 0.0, "TestFriend");
        let keys: Vec<&str> = l.iter().map(|x| x.key).collect();
        assert_eq!(keys, vec!["pvp.obs.first", "pvp.obs.shield_me", "pvp.obs.shield_opp", "pvp.obs.fa"]);
        assert_eq!(l[0].args[0], ("ta", "0:10".to_string())); // first attack on you at 10 s
        assert_eq!(l[0].args[1], ("tb", "0:13".to_string())); // first attack on the other at 8 + 5 s
        assert_eq!(l[1].args, vec![("t", "0:25".to_string()), ("s", "15".to_string())]); // 25 - 10
        assert_eq!(l[2].args[0], ("t", "1:05".to_string())); // 60 + 5, 52 s after its first attack at 8
        assert_eq!(l[2].args[1], ("s", "52".to_string()));
        assert_eq!(l[3].args[0], ("pa", "100".to_string())); // off the whole fight
        assert_eq!(l[3].args[1], ("pb", "0".to_string()));
        // no attack on the other side: no "first" line and no shield line for it
        let mut quiet = rb.clone();
        quiet.atk.clear();
        let l2 = lines(&ra, &quiet, 5.0, 0.0, "X");
        assert!(l2.iter().all(|x| x.key != "pvp.obs.first" && x.key != "pvp.obs.shield_opp"));
        // a shield drop BEFORE the first attack is not "after the attack"
        let mut early = ra.clone();
        early.atk = vec![30.0];
        assert!(lines(&early, &rb, 5.0, 0.0, "X").iter().all(|x| x.key != "pvp.obs.shield_me"));
        // shields that were never known to be up: no claim
        let mut unk = ra.clone();
        unk.sh = vec![(0.0, false), (25.0, false)];
        assert!(lines(&unk, &rb, 5.0, 0.0, "X").iter().all(|x| x.key != "pvp.obs.shield_me"));
    }

    #[test]
    fn the_page_gets_indexes_into_the_sets_as_loaded_even_with_files_that_are_not_fights() {
        let a = file("Hongark", "TestFriend", 1000.0, 120.0, json!({"died": 100.0}), json!({}));
        let b = file("TestFriend", "Hongark", 1013.0, 100.0, json!({"pvpkill": 94.0}), json!({}));
        let (ta, tb) = (a.to_string(), b.to_string());
        let r = pairs_json(&["garbage".to_string(), "{}".to_string(), ta.clone()], &["x".to_string(), tb.clone(), "y".to_string()]);
        assert_eq!(r["pairs"].as_array().unwrap().len(), 1);
        assert_eq!((r["pairs"][0]["ai"].as_u64(), r["pairs"][0]["bi"].as_u64()), (Some(2), Some(1)));
        assert!(r["mine"][0].is_null() && r["mine"][1].is_null() && !r["mine"][2].is_null() && r["theirs"][0].is_null() && r["theirs"][2].is_null());
        assert_eq!(r["pairs"][0]["kind"], "death");
    }

    #[test]
    fn the_view_puts_both_sides_on_one_axis_and_nudge_moves_the_second() {
        let a = file("Hongark", "TestFriend", 1000.0, 120.0, json!({"died": 100.0}), json!({"atk": [10.0]}));
        let b = file("TestFriend", "Hongark", 1013.0, 100.0, json!({"pvpkill": 94.0}), json!({"atk": [20.0]}));
        let tr = I18n::new("en");
        let v = pair_view(&tr, &a, &b, 0.0, true).unwrap();
        // B starts 13 s later on its own clock, 7 s of that is the clock: 6 s after A on the shared one
        assert!((v["bshift"].as_f64().unwrap() - 6.0).abs() < 1e-9, "{v}");
        assert_eq!(v["sync"]["kind"], "death");
        let n = pair_view(&tr, &a, &b, 2.5, true).unwrap();
        assert!((n["bshift"].as_f64().unwrap() - 8.5).abs() < 1e-9);
        // the other commander's file as "yours" does not pair with itself
        assert!(pair_view(&tr, &a, &a, 0.0, true).is_none());
        // lines only when the switch is on
        assert!(pair_view(&tr, &a, &b, 0.0, false).unwrap()["obs"].as_array().unwrap().is_empty());
    }

    /// A file from another person with huge lists, long texts and a build of the wrong shape cannot flood the page.
    #[test]
    fn a_hostile_file_is_cut_down_to_size() {
        let big: Vec<Value> = (0..20_000).map(|i| json!([i as f64, 1])).collect();
        let long = "x".repeat(5000);
        let rec = json!({"dbv": 1, "kind": long, "ship": "s", "sys": "y", "ep": {"t0": 1000.0, "t1": 9000.0}, "atk": big.iter().map(|e| e[0].clone()).collect::<Vec<_>>(), "keys": big,
            "bind": {"followed": [[long, [long]]]}});
        let r = crate::debrief::Rec::from_value(&rec).unwrap();
        assert_eq!(r.atk.len(), crate::debrief::MAX_ITEMS);
        assert_eq!(r.keys.len(), crate::debrief::MAX_ITEMS);
        assert_eq!(r.kind.chars().count(), 80);
        assert_eq!(r.followed[0].0.chars().count(), 80);
        // builds of the wrong shape: a string, an object where a list belongs, objects inside objects, 500 modules
        assert_eq!(clean_build(Some(&json!("x"))), Value::Null);
        assert_eq!(clean_build(None), Value::Null);
        let b = clean_build(Some(&json!({"ship": {"a": 1}, "modules": "no", "junk": [1, 2, 3]})));
        assert_eq!(b["modules"], json!([]));
        assert_eq!(b["ship"], "");
        assert!(b.get("junk").is_none());
        let many: Vec<Value> = (0..500).map(|i| json!({"slot": i, "item": {"x": 1}, "eng": {"blueprint": long, "level": "5", "experimental": 7}, "extra": "no"})).collect();
        let b = clean_build(Some(&json!({"ship": "krait", "modules": many})));
        assert_eq!(b["modules"].as_array().unwrap().len(), 64);
        let m = &b["modules"][0];
        assert_eq!(m["slot"], "");
        assert!(m.get("extra").is_none());
        assert_eq!(m["eng"]["blueprint"].as_str().unwrap().chars().count(), 80);
        assert!(m["eng"]["level"].is_null());
    }
}
