//! DEBRIEF: what the app's page needs to show a kept record: the record itself, the words for its actions and keys, the figures and the lines
//! the rules found (when switched on). The page draws the graph from the record; nothing here draws.
use crate::dbcard::{fa_off_time, shields_down, tx};
use crate::dbnames;
use crate::dbrules;
use crate::debrief::Rec;
use crate::i18n::I18n;
use serde_json::{json, Value};
use std::collections::BTreeMap;

/// One line of the list: how long, what kind, which ship and where, and the kills.
pub fn line_of(tr: &I18n, v: &Value) -> String {
    let Some(r) = Rec::from_value(v) else { return String::new() };
    let kind = if r.kind == "hunt" { tx(tr, "db.kind.hunt", &[]) } else { tx(tr, "db.kind.fight", &[]) };
    let mut parts = vec![dbrules::mmss(r.len()), kind];
    for s in [&r.ship, &r.sys] { if !s.is_empty() { parts.push(s.clone()); } }
    if !r.kills.is_empty() { parts.push(format!("{} {}", r.kills.len(), tx(tr, "db.list.kills", &[]))); }
    parts.join(" · ")
}

pub fn view_of(tr: &I18n, v: &Value, rules_on: bool) -> Option<Value> {
    let r = Rec::from_value(v)?;
    let mut names: BTreeMap<String, String> = BTreeMap::new();
    let mut keys: BTreeMap<String, String> = BTreeMap::new();
    let mut toggles: Vec<String> = Vec::new();
    for p in &r.keys {
        keys.insert(p.key.clone(), dbnames::key_label(&p.key));
        for a in &p.acts {
            names.insert(a.clone(), dbnames::label(a));
            if dbnames::is_toggle(a) && !toggles.contains(a) { toggles.push(a.clone()); }
        }
    }
    let obs: Vec<Value> = if rules_on {
        dbrules::observations(&r).iter().map(|o| {
            let args: Vec<(&str, String)> = o.args.iter().map(|(k, val)| (*k, if *k == "fa" || *k == "to" { tx(tr, &format!("db.word.{val}"), &[]) } else { val.clone() })).collect();
            json!({"t": o.t, "h": tx(tr, &format!("{}.h", o.key), &[]), "text": tx(tr, o.key, &args), "ev": o.ev})
        }).collect()
    } else { vec![] };
    let waves: Vec<Value> = dbrules::waves(&r.atk).iter().map(|w| json!([w.start, w.end, w.n])).collect();
    let (fa_t, fa_n) = fa_off_time(&r);
    let over: f64 = r.over.iter().map(|(a, b)| b - a).sum();
    Some(json!({
        "rec": r.to_value(), "names": names, "keys": keys, "toggles": toggles, "obs": obs, "rules": rules_on, "waves": waves,
        "sum": {"len": r.len(), "kills": r.kills.len(), "value": r.kills.iter().map(|k| k.1).sum::<i64>(), "shields_down": shields_down(&r), "fa_off": fa_t, "fa_sw": fa_n, "over": over},
        "ax": {"x": r.mx, "y": r.my, "decay": r.decay},
    }))
}

/// The ship keys DEBRIEF follows now, read from the game's Bindings file, and the ones it cannot follow (and why).
pub fn binds_info() -> Value {
    let m = crate::inputs::map().unwrap_or_else(crate::inputs::load_map);
    let lab = |acts: &Vec<String>| acts.iter().map(|a| dbnames::label(a)).collect::<Vec<_>>();
    json!({
        "followed": m.keys.iter().map(|b| json!({"key": dbnames::key_label(&b.key), "acts": lab(&b.acts)})).collect::<Vec<_>>(),
        "wheel": {"up": lab(&m.wheel_up), "down": lab(&m.wheel_down)},
        "untracked": m.untracked.iter().map(|(k, a)| json!({"key": dbnames::key_label(k), "acts": lab(a)})).collect::<Vec<_>>(),
        "elsewhere": m.elsewhere.iter().map(|a| dbnames::label(a)).collect::<Vec<_>>(),
        "mouse": {"x": m.mouse_x, "y": m.mouse_y, "decay": m.decay},
    })
}
