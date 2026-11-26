//! BGS Watch, its settings (the key `bgs` in settings.json). OFF by default.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default)]
pub struct Settings {
    pub on: bool,
    /// "use the last N screenshots"
    pub n: u32,
    /// pages taken within this many minutes of each other are one snapshot
    pub window_min: u32,
    /// the band the charts draw, influence in percent, editable by the player (default 50 and 65, always 0..100 and low below high).
    /// Below the low edge there is a risk of losing control of the systems, above the high edge unwanted states can happen: both are risks.
    pub low: f32,
    pub high: f32,
    /// a value that moves more than this many points since the last snapshot is marked
    pub jump: f32,
    /// use the glyph shapes learned from the player's corrections (bgs_learned.bin) when reading
    pub use_learned: bool,
    /// a screenshot folder other than the game's default (empty = default)
    pub shots_dir: String,
    /// the faction number the player typed to build the link to the Inara page (digits only, never used by the app itself, only to open the page in the browser)
    pub inara_id: String,
    /// a change smaller than this (points) is drawn pale in the charts
    pub minor: f32,
    /// a tick is assumed when at least this share (percent) of the systems changed between two snapshots
    pub tick_pct: f32,
    /// show (Pop: N) next to the systems. The numbers come from Spansh (https://spansh.co.uk): the names of the systems go out, nothing else.
    pub population: bool,
    /// what the player left in the BGS bar (compare with, view, show, sorting...): kept so the page opens as it was left. Names are fixed (UI_KEYS), values short.
    pub ui: std::collections::BTreeMap<String, Value>,
}

/// the options of the BGS pages that are remembered
pub const UI_KEYS: &[&str] = &["res", "tmode", "base", "days", "msort", "rfilter", "tsort", "hsort", "hmode", "tmore"];

impl Default for Settings {
    fn default() -> Self { Settings { on: false, n: 8, window_min: 5, low: 50.0, high: 65.0, jump: 3.0, use_learned: true, shots_dir: String::new(), inara_id: String::new(), minor: 0.3, tick_pct: 20.0, population: true, ui: Default::default() } }
}

pub fn get() -> Settings { from_value(crate::store::read().get("bgs")) }

pub fn from_value(v: Option<&Value>) -> Settings {
    let mut s: Settings = v.and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default();
    s.n = s.n.clamp(1, 64);
    s.window_min = s.window_min.clamp(1, 60);
    s
}

/// checks one value and returns the settings with it applied
pub fn apply(mut s: Settings, key: &str, v: &Value) -> Result<Settings, String> {
    let num = |lo: f64, hi: f64| v.as_f64().filter(|x| x.is_finite() && *x >= lo && *x <= hi).ok_or_else(|| format!("{key} must be a number from {lo} to {hi}"));
    match key {
        "use_learned" => s.use_learned = v.as_bool().ok_or("use_learned must be true or false")?,
        "on" => s.on = v.as_bool().ok_or("on must be true or false")?,
        "n" => s.n = num(1.0, 64.0)?.round() as u32,
        "window_min" => s.window_min = num(1.0, 60.0)?.round() as u32,
        "low" => s.low = num(0.0, 100.0)? as f32,
        "high" => s.high = num(0.0, 100.0)? as f32,
        "jump" => s.jump = num(0.1, 50.0)? as f32,
        "inara_id" => {
            let t = v.as_str().ok_or("inara_id must be text")?.trim();
            if t.len() > 12 || !t.chars().all(|c| c.is_ascii_digit()) { return Err("the faction number is digits only".into()); }
            s.inara_id = t.to_string();
        }
        "band" => {
            // both edges together, so a new band like 70 to 80 is never refused because the old high edge is still 65
            let a = v.as_array().filter(|a| a.len() == 2).ok_or("band must be two numbers")?;
            let f = |x: &Value| x.as_f64().filter(|n| n.is_finite() && (0.0..=100.0).contains(n)).ok_or("the band edges are numbers from 0 to 100");
            s.low = f(&a[0])? as f32; s.high = f(&a[1])? as f32;
            if s.low >= s.high { return Err("low must be below high".into()); }
        }
        "population" => s.population = v.as_bool().ok_or("population must be true or false")?,
        k if k.starts_with("ui.") => {
            let name = &k[3..];
            if !UI_KEYS.contains(&name) { return Err(format!("unknown option {name}")); }
            let ok = match v { Value::String(t) => t.len() <= 20 && t.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'), Value::Number(n) => n.as_f64().map_or(false, |x| x.is_finite() && x.abs() <= 1000.0), _ => false };
            if !ok { return Err(format!("{name} has a value that is not allowed")); }
            s.ui.insert(name.to_string(), v.clone());
        }
        "minor" => s.minor = num(0.1, 5.0)? as f32,
        "tick_pct" => s.tick_pct = num(2.0, 90.0)? as f32,
        "shots_dir" => {
            let t = v.as_str().ok_or("shots_dir must be text")?.trim();
            if t.len() > 260 || t.chars().any(|c| c.is_control()) { return Err("that folder name is not valid".into()); }
            s.shots_dir = t.to_string();
        }
        _ => return Err(format!("unknown setting {key}")),
    }
    if s.low >= s.high && (key == "low" || key == "high") { return Err("low must be below high".into()); }
    Ok(s)
}

pub fn set(key: &str, v: &Value) -> Result<Settings, String> {
    let s = apply(get(), key, v)?;
    if !crate::store::set(&[("bgs", json!(s))]) { return Err("the settings could not be saved".into()); }
    Ok(s)
}

#[cfg(test)]
mod t0952 {
    use super::*;
    use serde_json::json;

    /// 0.9.52: a new band like 70 to 80 is saved as one pair, never refused because the old high edge is 65
    #[test]
    fn the_band_is_set_as_a_pair() {
        let s = Settings::default();
        assert!(apply(s.clone(), "low", &json!(70)).is_err(), "one edge alone cannot jump over the other (that was the old bug)");
        let t = apply(s.clone(), "band", &json!([70, 80])).unwrap();
        assert_eq!((t.low, t.high), (70.0, 80.0));
        assert!(apply(s.clone(), "band", &json!([80, 70])).is_err());
        assert!(apply(s.clone(), "band", &json!([50, 50])).is_err());
        assert!(apply(s.clone(), "band", &json!([-1, 50])).is_err());
        assert!(apply(s, "band", &json!([50])).is_err());
    }

    /// the options of the pages are remembered, only the known ones and only short values
    #[test]
    fn page_options_are_remembered_and_checked() {
        let s = Settings::default();
        let t = apply(s.clone(), "ui.base", &json!("6h")).unwrap();
        assert_eq!(t.ui.get("base"), Some(&json!("6h")));
        let t = apply(t, "ui.days", &json!(7)).unwrap();
        assert_eq!(t.ui.get("days"), Some(&json!(7)));
        assert!(apply(s.clone(), "ui.nonsense", &json!("x")).is_err());
        assert!(apply(s.clone(), "ui.base", &json!("a very long text that is not an option at all")).is_err());
        assert!(apply(s.clone(), "ui.base", &json!("<script>")).is_err());
        assert!(apply(s.clone(), "ui.base", &json!({"a": 1})).is_err());
        assert!(apply(s, "ui.days", &json!(1e9)).is_err());
    }

    #[test]
    fn population_is_on_by_default_and_can_be_switched_off() {
        let s = Settings::default();
        assert!(s.population);
        assert!(!apply(s.clone(), "population", &json!(false)).unwrap().population);
        assert!(apply(s, "population", &json!("no")).is_err());
        // a saved file from 0.9.51 (no new fields) still opens
        let old = json!({"on": true, "low": 55.0, "high": 70.0});
        let o = from_value(Some(&old));
        assert!(o.population && o.ui.is_empty() && o.low == 55.0);
    }
}
