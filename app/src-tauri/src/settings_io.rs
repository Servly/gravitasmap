//! The settings on disk (settings.json, key "combat_settings"): every value read back with the plugin's own limits (settings.py), a value that
//! is missing or not valid keeps its default.
use crate::combat;
use crate::host::Settings;
use serde_json::{json, Value};

fn clamp(v: Option<&Value>, lo: i64, hi: i64, default: i64) -> i64 {
    v.and_then(Value::as_i64).map(|x| x.clamp(lo, hi)).unwrap_or(default)
}

fn flag(v: Option<&Value>, default: bool) -> bool {
    v.and_then(Value::as_bool).unwrap_or(default)
}

impl Settings {
    pub fn to_json(&self) -> Value {
        let win: serde_json::Map<String, Value> = self.win.iter().map(|(k, w)| (k.to_string(), json!({
            "on": w.on, "x": w.x, "y": w.y, "dx": w.dx, "dy": w.dy, "colour": w.colour, "when": w.when,
            "shape": [w.shape.0, w.shape.1, w.shape.2, w.shape.3], "persp": w.persp, "ground": w.ground, "size": w.size, "opacity": w.opacity, "z": w.z,
        }))).collect();
        json!({
            "combat_on": self.combat_on, "calm_s": self.calm_s, "sc_ends": self.sc_ends, "report_s": self.report_s, "drop_lost": self.drop_lost,
            "hide_maps": self.hide_maps, "look_hide": self.look_hide, "keep_hidden_in_panel": self.keep_hidden_in_panel, "bonds": self.bonds, "rows": self.rows, "sort": self.sort, "order": self.order,
            "brief": self.brief, "feed_rows": self.feed_rows, "wing_bonus_on": self.wing_bonus_on, "wing_bonus_op": self.wing_bonus_op, "claim_bonds": self.claim_bonds, "claims_note": self.claims_note, "claims_dedupe": self.claims_dedupe, "claims_fix": self.claims_fix, "always": self.always, "show_gone": self.show_gone, "auto": self.auto,
            "bg": self.bg, "opacity": self.opacity, "size_auto": self.size_auto, "size_pct": self.size_pct, "front": self.front, "boot": self.boot, "keys": self.keys, "look_btn": self.look_btn, "look_hold": self.look_hold, "win": Value::Object(win),
        })
    }

    /// Takes what is saved over the defaults, within the plugin's limits.
    pub fn apply_json(&mut self, v: &Value) {
        let d = Settings::default();
        self.combat_on = flag(v.get("combat_on"), d.combat_on);
        self.calm_s = clamp(v.get("calm_s"), 3, 60, d.calm_s);
        self.sc_ends = flag(v.get("sc_ends"), d.sc_ends);
        self.report_s = v.get("report_s").and_then(Value::as_f64).map(|x| x.clamp(5.0, 600.0)).unwrap_or(d.report_s);
        self.drop_lost = flag(v.get("drop_lost"), d.drop_lost);
        self.hide_maps = flag(v.get("hide_maps"), d.hide_maps);
        self.look_hide = flag(v.get("look_hide"), d.look_hide);
        self.bonds = flag(v.get("bonds"), d.bonds);
        self.rows = clamp(v.get("rows"), 1, 20, d.rows);
        self.sort = if v.get("sort").and_then(Value::as_str) == Some("s") { "s".into() } else { "v".into() };
        self.order = match v.get("order").and_then(Value::as_array) {
            Some(a) => a.iter().filter_map(|x| x.as_str()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).take(12).collect(),
            None => d.order.clone(),
        };
        self.wing_bonus_on = flag(v.get("wing_bonus_on"), d.wing_bonus_on);
        self.claim_bonds = flag(v.get("claim_bonds"), d.claim_bonds);
        self.claims_note = flag(v.get("claims_note"), d.claims_note);
        self.claims_dedupe = flag(v.get("claims_dedupe"), d.claims_dedupe);
        self.claims_fix = flag(v.get("claims_fix"), d.claims_fix);
        self.keep_hidden_in_panel = flag(v.get("keep_hidden_in_panel"), d.keep_hidden_in_panel);
        self.feed_rows = clamp(v.get("feed_rows"), 1, 10, d.feed_rows);
        self.brief = flag(v.get("brief"), d.brief);
        self.wing_bonus_op = flag(v.get("wing_bonus_op"), d.wing_bonus_op);
        self.always = flag(v.get("always"), d.always);
        self.show_gone = flag(v.get("show_gone"), d.show_gone);
        self.auto = flag(v.get("auto"), d.auto);
        self.bg = flag(v.get("bg"), d.bg);
        self.opacity = clamp(v.get("opacity"), 40, 100, d.opacity);
        self.size_auto = flag(v.get("size_auto"), d.size_auto);
        self.size_pct = clamp(v.get("size_pct"), 50, 200, d.size_pct);
        self.front = flag(v.get("front"), d.front);
        self.boot = flag(v.get("boot"), d.boot);
        self.keys = flag(v.get("keys"), d.keys);
        self.look_btn = v.get("look_btn").and_then(Value::as_str).filter(|b| ["m3", "m4", "m5"].contains(b)).unwrap_or("m3").to_string();
        self.look_hold = flag(v.get("look_hold"), d.look_hold);
        if let Some(wins) = v.get("win").and_then(Value::as_object) {
            for (key, saved) in wins {
                let Some((_, w)) = self.win.iter_mut().find(|(k, _)| *k == key.as_str()) else { continue };
                w.on = flag(saved.get("on"), w.on);
                w.x = saved.get("x").and_then(Value::as_f64).unwrap_or(w.x);
                w.y = saved.get("y").and_then(Value::as_f64).unwrap_or(w.y);
                w.dx = saved.get("dx").and_then(Value::as_f64).map(|x| x.clamp(-150.0, 150.0)).unwrap_or(w.dx);
                w.dy = saved.get("dy").and_then(Value::as_f64).map(|x| x.clamp(-100.0, 100.0)).unwrap_or(w.dy);
                if let Some(c) = saved.get("colour").and_then(Value::as_str).filter(|c| c.len() == 7 && c.starts_with('#') && c[1..].chars().all(|h| h.is_ascii_hexdigit())) { w.colour = c.to_string(); }
                w.persp = flag(saved.get("persp"), w.persp);
                w.ground = saved.get("ground").and_then(Value::as_i64).map(|g| g.clamp(-1, 100)).unwrap_or(w.ground);
                w.size = saved.get("size").and_then(Value::as_i64).map(|g| if g < 0 { -1 } else { g.clamp(30, 200) }).unwrap_or(w.size);
                w.opacity = saved.get("opacity").and_then(Value::as_i64).map(|g| if g < 0 { -1 } else { g.clamp(10, 100) }).unwrap_or(w.opacity);
                w.z = saved.get("z").and_then(Value::as_i64).map(|g| g.clamp(-100, 100)).unwrap_or(w.z);
                if let Some(wh) = saved.get("when").and_then(Value::as_str).filter(|wh| combat::WHEN.iter().any(|(k, _)| k == wh)) { w.when = wh.to_string(); }
                if let Some(s) = saved.get("shape").and_then(Value::as_array).filter(|s| s.len() == 4) {
                    w.shape = (s[0].as_f64().unwrap_or(0.0), s[1].as_i64().unwrap_or(0), s[2].as_i64().unwrap_or(100), s[3].as_i64().unwrap_or(100));
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_round_trip_and_limits() {
        let mut a = Settings::default();
        a.rows = 9; a.sort = "s".into(); a.bg = true; a.opacity = 70; a.look_hide = false; a.order = vec!["Corsair".into()];
        a.win[0].1.on = false; a.win[1].1.x = 12.5; a.win[2].1.colour = "#3ddc84".into();
        let mut b = Settings::default();
        b.apply_json(&a.to_json());
        assert_eq!(b.to_json(), a.to_json(), "what is saved comes back as it was");
        let mut c = Settings::default();
        c.apply_json(&json!({"rows": 99, "calm_s": 1, "opacity": 5, "size_pct": 999, "report_s": 1, "sort": "x", "order": [" a ", "", "b"], "win": {"status": {"colour": "red", "when": "nonsense", "dx": 999}}}));
        assert_eq!((c.rows, c.calm_s, c.opacity, c.size_pct, c.report_s), (20, 3, 40, 200, 5.0));
        assert_eq!(c.sort, "v");
        assert_eq!(c.order, vec!["a", "b"]);
        let st = &c.win[0].1;
        assert_eq!((st.colour.as_str(), st.dx), ("#ff7100", 150.0));
        assert_ne!(st.when, "nonsense");
        let mut d = Settings::default();
        d.apply_json(&json!({}));
        assert_eq!(d.to_json(), Settings::default().to_json(), "nothing saved: the defaults");
    }
}
