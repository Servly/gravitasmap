//! Profiles (profiles.py): the windows set up for each ship, kept under a name. Name one after a ship, by its type ("Python Mk II") or by the
//! name you gave it, and save: which windows show, when, where and in what colour are kept. GRAVITAS switches to it by itself when you board
//! that ship (the Journal's Loadout says which one it is).
use crate::combat::WinCfg;
use crate::host::Settings;
use indexmap::IndexMap;
use serde_json::{json, Value};

const FIELDS: [&str; 7] = ["on", "when", "x", "y", "dx", "dy", "colour"];

#[derive(Default, Clone)]
pub struct Profiles {
    pub map: IndexMap<String, Value>,
    pub active: String,
}

fn win_json(w: &WinCfg) -> Value {
    json!({"on": w.on, "when": w.when, "x": w.x, "y": w.y, "dx": w.dx, "dy": w.dy, "colour": w.colour})
}

impl Profiles {
    pub fn from_json(v: &Value) -> Profiles {
        let map = v.get("profiles").and_then(Value::as_object).map(|o| o.iter().map(|(k, v)| (k.clone(), v.clone())).collect()).unwrap_or_default();
        Profiles { map, active: v.get("profile_active").and_then(Value::as_str).unwrap_or("").to_string() }
    }

    pub fn to_json(&self) -> Value {
        json!({"profiles": Value::Object(self.map.iter().map(|(k, v)| (k.clone(), v.clone())).collect()), "profile_active": self.active})
    }

    /// Sorted by name, letter case aside.
    pub fn names(&self) -> Vec<String> {
        let mut n: Vec<String> = self.map.keys().cloned().collect();
        n.sort_by_key(|s| s.to_lowercase());
        n
    }

    /// The windows as they are now, kept under name (made or written over); it becomes the active profile.
    pub fn save(&mut self, name: &str, s: &Settings) -> Option<String> {
        let name: String = name.trim().chars().take(40).collect();
        if name.is_empty() {
            return None;
        }
        let win: serde_json::Map<String, Value> = s.win.iter().map(|(k, w)| (k.to_string(), win_json(w))).collect();
        self.map.insert(name.clone(), json!({"auto": s.auto, "win": Value::Object(win)}));
        self.active = name.clone();
        Some(name)
    }

    pub fn delete(&mut self, name: &str) {
        self.map.shift_remove(name);
        if self.active == name {
            self.active.clear();
        }
    }

    /// The profile's windows into the live settings. True if found.
    pub fn load(&mut self, name: &str, s: &mut Settings) -> bool {
        let Some(prof) = self.map.get(name).cloned() else { return false };
        if let Some(a) = prof.get("auto").and_then(Value::as_bool) {
            s.auto = a;
        }
        if let Some(wins) = prof.get("win").and_then(Value::as_object) {
            for (key, saved) in wins {
                let Some((_, w)) = s.win.iter_mut().find(|(k, _)| *k == key.as_str()) else { continue };
                for f in FIELDS {
                    let Some(v) = saved.get(f) else { continue };
                    match f {
                        "on" => w.on = v.as_bool().unwrap_or(w.on),
                        "when" => { if let Some(x) = v.as_str().filter(|x| crate::combat::WHEN.iter().any(|(k, _)| k == x)) { w.when = x.to_string(); } }   // (a hand-edited profile cannot name a place that does not exist)
                        "x" => w.x = v.as_f64().unwrap_or(w.x),
                        "y" => w.y = v.as_f64().unwrap_or(w.y),
                        "dx" => w.dx = v.as_f64().map(|x| x.clamp(-150.0, 150.0)).unwrap_or(w.dx),
                        "dy" => w.dy = v.as_f64().map(|x| x.clamp(-100.0, 100.0)).unwrap_or(w.dy),
                        _ => { if let Some(c) = v.as_str().filter(|c| c.len() == 7 && c.starts_with('#') && c[1..].chars().all(|h| h.is_ascii_hexdigit())) { w.colour = c.to_string(); } }   // (#rrggbb only: anything else would break the painter)
                    }
                }
            }
        }
        self.active = name.to_string();
        true
    }

    /// The profile named after this ship (its type or its own name, letter case aside), or None.
    pub fn for_ship(&self, labels: &[Option<&str>]) -> Option<String> {
        let want: Vec<String> = labels.iter().flatten().filter(|x| !x.is_empty()).map(|x| x.trim().to_lowercase()).collect();
        self.names().into_iter().find(|n| want.contains(&n.to_lowercase()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn win_of(s: &Settings, v: &Value) -> bool {
        // does the settings' window state equal the golden's {key: {on, when, x, y, dx, dy, colour}}?
        v.as_object().unwrap().iter().all(|(k, g)| {
            let Some((_, w)) = s.win.iter().find(|(n, _)| *n == k.as_str()) else { return false };
            g["on"].as_bool() == Some(w.on) && g["when"].as_str() == Some(&w.when) && g["x"].as_f64() == Some(w.x) && g["y"].as_f64() == Some(w.y)
                && g["dx"].as_f64() == Some(w.dx) && g["dy"].as_f64() == Some(w.dy) && g["colour"].as_str() == Some(&w.colour)
        })
    }

    fn set_win(s: &mut Settings, v: &Value) {
        for (k, g) in v.as_object().unwrap() {
            if let Some((_, w)) = s.win.iter_mut().find(|(n, _)| *n == k.as_str()) {
                w.on = g["on"].as_bool().unwrap();
                w.when = g["when"].as_str().unwrap().to_string();
                w.x = g["x"].as_f64().unwrap();
                w.y = g["y"].as_f64().unwrap();
                w.dx = g["dx"].as_f64().unwrap();
                w.dy = g["dy"].as_f64().unwrap();
                w.colour = g["colour"].as_str().unwrap().to_string();
            }
        }
    }

    #[test]
    fn profiles_match_the_plugin() {
        let Ok(t) = std::fs::read_to_string(crate::host::parity::golden_dir().join("profiles_golden.json")) else { println!("SKIP"); return };
        let scripts: Vec<Value> = serde_json::from_str(&t).unwrap();
        let (mut steps, mut bad) = (0, Vec::new());
        for (si, ops) in scripts.iter().enumerate() {
            let mut p = Profiles::default();
            let mut s = Settings::default();
            for (oi, op) in ops.as_array().unwrap().iter().enumerate() {
                let tail = op.as_array().unwrap().last().unwrap().clone();
                let mut err = None;
                match op[0].as_str().unwrap() {
                    "save" => {
                        s.auto = op[2].as_bool().unwrap();
                        set_win(&mut s, &op[3]);
                        let r = p.save(op[1].as_str().unwrap(), &s);
                        if r.as_deref() != op[4].as_str() { err = Some(format!("save result {r:?} vs {}", op[4])); }
                    }
                    "load" => {
                        let r = p.load(op[1].as_str().unwrap(), &mut s);
                        if r != op[2].as_bool().unwrap() { err = Some("load result".to_string()); }
                        else if r && (s.auto != op[3].as_bool().unwrap() || !win_of(&s, &op[4])) { err = Some("load state".to_string()); }
                    }
                    "delete" => p.delete(op[1].as_str().unwrap()),
                    "ship" => {
                        let labels: Vec<Option<&str>> = op[1].as_array().unwrap().iter().map(|v| v.as_str()).collect();
                        let r = p.for_ship(&labels);
                        if r.as_deref() != op[2].as_str() { err = Some(format!("for_ship {r:?} vs {}", op[2])); }
                    }
                    _ => { s.auto = op[1].as_bool().unwrap(); set_win(&mut s, &op[2]); }
                }
                if err.is_none() && (json!(p.names()) != tail[0] || p.active != tail[1].as_str().unwrap()) { err = Some(format!("names/active: app {:?} {:?}, plugin {tail}", p.names(), p.active)); }
                steps += 1;
                if let Some(e) = err { bad.push(format!("script {si} op {oi} {}: {e}", op[0])); }
            }
        }
        println!("profiles: {} scripts, {steps} steps, {} differences", scripts.len(), bad.len());
        assert!(bad.is_empty(), "{}", bad.iter().take(5).cloned().collect::<Vec<_>>().join("\n"));
    }
}
