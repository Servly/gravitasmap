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
}

impl Default for Settings {
    fn default() -> Self { Settings { on: false, n: 8, window_min: 5, low: 50.0, high: 65.0, jump: 3.0, use_learned: true, shots_dir: String::new(), inara_id: String::new(), minor: 0.3, tick_pct: 20.0 } }
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
