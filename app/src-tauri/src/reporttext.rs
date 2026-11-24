//! A report as text: the site's Copy text (combat.py report_text) for Discord, and everything in a past report (report_details) for the
//! Past combats window.
use crate::combat::{arr, dur, get_or_empty, getd, intd, where_of};
use crate::i18n::I18n;
use crate::pyval::{n_or0, num, py_str, truthy};
use serde_json::{json, Value};

fn f(tr: &I18n, key: &str, vars: &[(&str, Value)]) -> String {
    tr.t(key, vars)
}

fn if_truthy<'a>(v: Option<&'a Value>) -> Option<&'a Value> {
    v.filter(|x| truthy(Some(x)))
}

/// The report as text for Discord.
pub fn report_text(tr: &I18n, v: &Value) -> String {
    let empty = json!({});
    let ep = get_or_empty(v, "ep", &empty);
    let n_v = getd(ep, "n", json!(0));
    let ms = (n_or0(ep.get("t1")) - n_or0(ep.get("t0"))).max(0.0);
    let w = where_of(v);
    let seen_a = if truthy(ep.get("seenN")) { ep["seenN"].clone() } else { json!(0) };       // max(seenN or 0, n): the first wins a tie
    let seen = if n_or0(Some(&n_v)) > n_or0(Some(&seen_a)) { n_v.clone() } else { seen_a };
    let phases = if n_or0(ep.get("phases")) > 1.0 { f(tr, "rt.phases", &[("n", ep["phases"].clone())]) } else { String::new() };
    let seen_s = if truthy(ep.get("seenN")) { f(tr, "rt.seen", &[("n", seen)]) } else { String::new() };
    let bonds = if truthy(ep.get("bonds")) { f(tr, "rt.bonds", &[("n", json!(num(ep.get("bonds"))))]) } else { String::new() };
    let end = if truthy(ep.get("died")) { tr.t0("rt.lost") } else if truthy(ep.get("shDown")) { f(tr, "rt.fell", &[("n", ep["shDown"].clone())]) } else { tr.t0("rt.held") };
    let mut lines = vec![
        format!("{}{}", tr.t0("rt.title"), if w.is_empty() { String::new() } else { format!(" · {w}") }),
        f(tr, "rt.line", &[("time", json!(dur(tr, ms))), ("phases", json!(phases)), ("n", n_v.clone()), ("seen", json!(seen_s)), ("cr", json!(num(ep.get("cr")))), ("bonds", json!(bonds)), ("end", json!(end))]),
    ];
    if let Some(k) = if_truthy(ep.get("big")) {
        let rank = if truthy(k.get("rank")) { format!(", {}", py_str(&k["rank"])) } else { String::new() };
        lines.push(f(tr, "rt.top", &[("pilot", getd(k, "pilot", Value::Null)), ("ship", getd(k, "ship", Value::Null)), ("rank", json!(rank)), ("cr", json!(num(k.get("cr"))))]));
    }
    if truthy(ep.get("ttkAvg")) {
        let fast = match if_truthy(ep.get("ttkFast")) {
            Some(fv) => f(tr, "rt.fast", &[("t", json!(dur(tr, n_or0(fv.get("ms")))))]),
            None => String::new(),
        };
        lines.push(f(tr, "rt.avg", &[("t", json!(dur(tr, n_or0(ep.get("ttkAvg"))))), ("fast", json!(fast))]));
    }
    lines.push("gravitasmap.com".to_string());
    lines.join("\n")
}

/// `f"{s:>12}"`: right-aligned in 12 characters.
fn right12(s: &str) -> String {
    let n = s.chars().count();
    if n >= 12 { s.to_string() } else { format!("{}{s}", " ".repeat(12 - n)) }
}

/// Everything in a past report, as text.
pub fn report_details(tr: &I18n, v: &Value) -> String {
    let empty = json!({});
    let ep = get_or_empty(v, "ep", &empty);
    let mut out: Vec<String> = vec![report_text(tr, v), String::new()];
    let kills = arr(ep.get("kills"));
    if !kills.is_empty() {
        out.push(tr.t0("rd.kills"));
        for k in &kills {
            let who = if truthy(k.get("pilot")) { py_str(&k["pilot"]) } else if truthy(k.get("fac")) { py_str(&k["fac"]) } else { tr.t0("rd.bond") };
            let rank = if truthy(k.get("rank")) { format!(" ({})", py_str(&k["rank"])) } else { String::new() };
            let ship = match k.get("ship") { Some(x) => py_str(x), None => String::new() };
            let with = if truthy(k.get("shared")) { f(tr, "rd.with", &[("name", k["shared"].clone())]) } else { String::new() };
            let down = if n_or0(k.get("ttk")) > 1000.0 { f(tr, "rd.down", &[("t", json!(dur(tr, n_or0(k.get("ttk")))))]) } else { String::new() };
            out.push(format!("  {}  {who}{rank} · {ship}{with}{down}", right12(&format!("+{}", num(k.get("cr"))))));
        }
        out.push(String::new());
    }
    let away: Vec<Value> = arr(ep.get("pri")).into_iter().filter(|x| !truthy(x.get("l"))).collect();
    if !away.is_empty() {
        out.push(tr.t0("rd.away"));
        for x in &away {
            let p = match x.get("p") { Some(y) => py_str(y), None => String::new() };
            let s = match x.get("s") { Some(y) => py_str(y), None => String::new() };
            let b = if truthy(x.get("b")) { format!(" · {} cr", num(x.get("b"))) } else { String::new() };
            out.push(format!("  {p} · {s}{b}"));
        }
        out.push(String::new());
    }
    if truthy(v.get("team")) {
        let names: Vec<String> = arr(v.get("team")).iter().map(py_str).collect();
        out.push(f(tr, "rd.team", &[("names", json!(names.join(", "))), ("n", getd(ep, "shN", json!(0))), ("total", getd(ep, "n", json!(0)))]));
    }
    if truthy(ep.get("ff")) {
        out.push(f(tr, "rd.ff", &[("n", ep["ff"].clone())]));
    }
    if let Some(i) = if_truthy(ep.get("intd")) {
        let who = if truthy(i.get("who")) { format!(" · {}", py_str(&i["who"])) } else { String::new() };
        out.push(f(tr, "rd.intd", &[("what", json!(intd(tr, i.get("st")).0.to_lowercase())), ("who", json!(who))]));
    }
    out.join("\n").trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn report_texts_match_the_plugin() {
        let Ok(t) = std::fs::read_to_string(crate::host::parity::golden_dir().join("model_fuzz.json")) else { println!("SKIP"); return };
        let cases: Vec<Value> = serde_json::from_str(&t).unwrap();
        let (mut n, mut bad) = (0, Vec::new());
        for (i, c) in cases.iter().enumerate() {
            let tr = I18n::new(c["lang"].as_str().unwrap());
            for (key, got_fn) in [("text", report_text as fn(&I18n, &Value) -> String), ("details", report_details)] {
                let want = &c["texts"][key];
                if want.is_null() || want == "ERR" { continue; }
                let got = got_fn(&tr, &c["v"]);
                n += 1;
                if Some(got.as_str()) != want.as_str() { bad.push(format!("case {i} {} {key}:\n--- plugin\n{}\n--- app\n{got}", c["lang"], want.as_str().unwrap())); }
            }
        }
        println!("report texts: {n} texts, {} differences", bad.len());
        assert!(bad.is_empty(), "{}", bad.iter().take(2).cloned().collect::<Vec<_>>().join("\n=====\n"));
    }
}
