//! The Thargoid recorder (local only, never sent anywhere): while Thargoids are about, every change of the game's Status.json (flags, pips, fuel, focus,
//! destination, legal state...) is written with the time, next to the Journal events that matter (Music, signal source drops, SystemsShutdown, hull steps,
//! kills, attacks, deaths). The Journal says "shut down" but not what Status.json showed when it happened or ended: this file is what shows it.
//! It starts at the first Thargoid marker (Music Combat_Unknown / Unknown_Encounter / Unknown_Exploration, a "Nonhuman signal source", a SystemsShutdown) and ends
//! ten minutes after the last one. One file per encounter: <settings folder>/thargoid-rec/thargoid-<date>-<time>.jsonl
use serde_json::{json, Value};
use std::io::Write;
use std::path::PathBuf;

pub const KEEP_S: f64 = 600.0;

/// The names of Status.json's Flags bits (the game's documented ones).
pub const FLAGS: [&str; 32] = [
    "Docked", "Landed", "LandingGear", "ShieldsUp", "Supercruise", "FlightAssistOff", "Hardpoints", "InWing", "Lights", "CargoScoop", "SilentRunning", "ScoopingFuel",
    "SrvHandbrake", "SrvTurret", "SrvUnderShip", "SrvDriveAssist", "MassLocked", "FsdCharging", "FsdCooldown", "LowFuel", "OverHeating", "HasLatLong", "InDanger",
    "BeingInterdicted", "InMainShip", "InFighter", "InSrv", "HudAnalysis", "NightVision", "AltFromAvgRadius", "FsdJump", "SrvHighBeam",
];

/// The names of the bits that differ between two Flags values: "+ShieldsUp" came on, "-ShieldsUp" went off.
pub fn flag_changes(old: u64, new: u64) -> Vec<String> {
    let diff = old ^ new;
    (0..32).filter(|b| diff >> b & 1 == 1).map(|b| format!("{}{}", if new >> b & 1 == 1 { "+" } else { "-" }, FLAGS[b])).collect()
}

/// one recording stops growing at this size
const MAX_FILE: u64 = 20 * 1024 * 1024;
/// only the newest recordings are kept (the older ones were studied already; the folder must not grow for ever)
const KEEP_FILES: usize = 30;

fn prune(dir: &std::path::Path) {
    let mut v: Vec<std::path::PathBuf> = std::fs::read_dir(dir).map(|d| d.filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| p.extension().map(|x| x == "jsonl").unwrap_or(false)).collect()).unwrap_or_default();
    v.sort();
    while v.len() > KEEP_FILES { let _ = std::fs::remove_file(v.remove(0)); }
}

fn is_marker(e: &Value) -> bool {
    let s = |k: &str| e.get(k).and_then(Value::as_str).unwrap_or("");
    match s("event") {
        "Music" => matches!(s("MusicTrack"), "Combat_Unknown" | "Unknown_Encounter" | "Unknown_Exploration"),
        "USSDrop" => s("USSType").contains("NonHuman"),
        "SystemsShutdown" => true,
        _ => false,
    }
}

/// The Journal events worth writing beside Status.json while a recording runs.
fn is_noted(e: &Value) -> bool {
    matches!(
        e.get("event").and_then(Value::as_str).unwrap_or(""),
        "Music" | "USSDrop" | "SupercruiseDestinationDrop" | "SupercruiseExit" | "SupercruiseEntry" | "SystemsShutdown" | "HullDamage" | "ShieldState" | "UnderAttack" | "FactionKillBond"
            | "Died" | "SelfDestruct" | "Resurrect" | "LaunchDrone" | "MaterialCollected" | "ShipTargeted" | "RebootRepair" | "HeatDamage" | "HeatWarning" | "FighterDestroyed"
            | "Interdicted" | "EscapeInterdiction" | "WingJoin" | "WingLeave" | "Docked" | "Undocked"
    )
}

#[derive(Default)]
pub struct Rec {
    dir: Option<PathBuf>,
    file: Option<PathBuf>,
    last_marker: f64,
    last_flags: Option<u64>,
    last_status: Option<Value>,
    pending: Vec<Value>,
    /// the status line written last (without its time stamp) and when: the game rewrites the file about 5 times a second, 98 % of it unchanged
    written: Option<(Value, f64)>,
}

impl Rec {
    pub fn new(dir: Option<PathBuf>) -> Rec {
        Rec { dir, ..Default::default() }
    }

    /// A live Journal line (not the catch-up of the old ones).
    pub fn journal(&mut self, e: &Value, now: f64) {
        if is_marker(e) {
            if !self.running(now) {
                self.file = None; // (a new encounter: a new file)
            }
            self.last_marker = now;
        }
        if self.running(now) && is_noted(e) {
            self.pending.push(e.clone());
        }
    }

    pub fn running(&self, now: f64) -> bool {
        self.last_marker > 0.0 && now - self.last_marker < KEEP_S
    }

    fn open(&mut self, now: f64) -> Option<PathBuf> {
        if let Some(f) = &self.file {
            return Some(f.clone());
        }
        let dir = self.dir.clone()?;
        std::fs::create_dir_all(&dir).ok()?;
        let secs = now as i64;
        let stamp = crate::host::format_ts(secs).replace(['-', ':'], "").replace('T', "-").replace('Z', "");
        let f = dir.join(format!("thargoid-{stamp}.jsonl"));
        crate::store::log(&format!("thargoid recording started: {}", f.display()));
        prune(&dir);
        self.file = Some(f.clone());
        Some(f)
    }

    fn write(&mut self, now: f64, lines: Vec<Value>) {
        if lines.is_empty() {
            return;
        }
        let Some(f) = self.open(now) else { return };
        if std::fs::metadata(&f).map(|m| m.len() > MAX_FILE).unwrap_or(false) { return; } // (a recording never grows past this)
        if let Ok(mut h) = std::fs::OpenOptions::new().create(true).append(true).open(f) {
            for l in lines {
                let _ = writeln!(h, "{l}");
            }
        }
    }

    /// Called every time Status.json changed (and when a Journal marker came): writes what is pending while a recording runs.
    pub fn status(&mut self, st: Option<&Value>, now: f64) {
        if !self.running(now) {
            self.pending.clear();
            if let Some(s) = st {
                self.last_status = Some(s.clone()); // (the state it starts from)
            }
            return;
        }
        let mut lines: Vec<Value> = Vec::new();
        if self.file.is_none() {
            // a recording starts: the status as it was just before is the first line
            if let Some(s) = self.last_status.clone() {
                self.last_flags = s.get("Flags").and_then(Value::as_u64); // (the changes are told from here)
                lines.push(json!({"wall": now, "kind": "status", "start": true, "status": s}));
            }
        }
        for e in std::mem::take(&mut self.pending) {
            lines.push(json!({"wall": now, "kind": "journal", "e": e}));
        }
        if let Some(s) = st {
            let flags = s.get("Flags").and_then(Value::as_u64).unwrap_or(0);
            let mut body = s.clone();
            if let Some(o) = body.as_object_mut() { o.remove("timestamp"); }
            // only a changed status is written, and one line every 2 s as a heartbeat (so a quiet stretch is seen as quiet, not as a gap)
            let same = self.written.as_ref().map(|(w, t)| *w == body && now - *t < 2.0).unwrap_or(false);
            if !same {
                let ch = self.last_flags.map(|o| flag_changes(o, flags)).unwrap_or_default();
                lines.push(json!({"wall": now, "kind": "status", "flag_changes": ch, "status": s}));
                self.written = Some((body, now));
            }
            self.last_flags = Some(flags);
            self.last_status = Some(s.clone());
        }
        self.write(now, lines);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flag_bits_are_named() {
        assert_eq!(flag_changes(0b1000, 0b0000), vec!["-ShieldsUp"]);
        assert_eq!(flag_changes(0, (1 << 3) | (1 << 22)), vec!["+ShieldsUp", "+InDanger"]);
        assert!(flag_changes(5, 5).is_empty());
    }

    #[test]
    fn a_recording_starts_at_a_marker_and_ends_ten_minutes_after() {
        let dir = std::env::temp_dir().join(format!("gravitas-rec-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let mut r = Rec::new(Some(dir.clone()));
        let st = |f: u64| json!({"event": "Status", "Flags": f, "Pips": [2, 4, 6]});
        let t0 = 1_700_000_000.0;
        r.status(Some(&st(16842757 | 8)), t0 - 5.0); // before any marker: nothing written
        assert!(!dir.exists() || std::fs::read_dir(&dir).unwrap().count() == 0);
        r.journal(&json!({"event": "Music", "MusicTrack": "Unknown_Encounter"}), t0);
        r.journal(&json!({"event": "UnderAttack", "Target": "You"}), t0 + 1.0);
        r.status(Some(&st(16842757 | 8)), t0 + 1.5);
        r.status(Some(&st(16842757 & !8)), t0 + 2.0); // shields went off
        r.journal(&json!({"event": "SystemsShutdown"}), t0 + 30.0);
        r.status(Some(&st(16842757 & !8)), t0 + 30.5);
        let files: Vec<_> = std::fs::read_dir(&dir).unwrap().filter_map(|e| e.ok()).collect();
        assert_eq!(files.len(), 1, "one file per encounter");
        let text = std::fs::read_to_string(files[0].path()).unwrap();
        assert!(text.contains("\"start\":true"), "{text}");
        assert!(text.contains("-ShieldsUp"), "{text}");
        assert!(text.contains("SystemsShutdown"), "{text}");
        // ten minutes after the last marker it stops writing
        // the same status again (only its time stamp is new) is not written twice
        let n = std::fs::read_to_string(files[0].path()).unwrap().lines().count();
        let mut again = st(16842757 & !8);
        again["timestamp"] = json!("later");
        r.status(Some(&again), t0 + 30.9);
        assert_eq!(std::fs::read_to_string(files[0].path()).unwrap().lines().count(), n, "an unchanged status is skipped");
        let before = text.lines().count();
        r.status(Some(&st(1)), t0 + 30.0 + KEEP_S + 5.0);
        assert_eq!(std::fs::read_to_string(files[0].path()).unwrap().lines().count(), before);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
