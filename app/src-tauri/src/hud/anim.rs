//! How the windows move while the head turns to a panel (hud.py motion): the windows ahead slide away with the turn and come back as the head is
//! back, a panel's windows show as the panel itself appears. The game turns the head to a side panel in about 0.2 s, and the panel appears in
//! about 0.45 s (measured on CMDR Hongark's videos).
use serde_json::Value;

pub const BETWEEN: i64 = 99; // a panel just closed by the game's own screens: maybe a map comes next
pub const SIDE: [i64; 5] = [1, 2, 3, 4, BETWEEN];
pub const OUT_S: f64 = 0.09; // a window that leaves is gone in this long
pub const IN_FRONT: (f64, f64) = (0.2, 0.25); // the windows ahead come back as the head is back (from, how long)
pub const IN_PANEL: (f64, f64) = (0.4, 0.45); // a panel's windows boot up as the panel itself appears
pub const TURN_S: f64 = 0.22;
pub const FADE_S: f64 = 0.15; // the HUD showing (the game back in front): soft
/// which way the windows ahead slide while the head turns to a panel (parts of the height)
pub fn slide(gui: i64) -> (f64, f64) {
    match gui { 2 => (0.06, 0.0), 1 => (-0.06, 0.0), 4 => (0.0, -0.05), 3 => (0.03, 0.02), _ => (0.0, 0.0) }
}

pub fn smooth(p: f64) -> f64 {
    let p = p.clamp(0.0, 1.0);
    p * p * (3.0 - 2.0 * p)
}

/// Is a window of this group shown while this panel (GuiFocus) is open?
pub fn seen_in(group: &Value, gui: i64) -> bool {
    match group {
        Value::String(g) if g == "all" => true,
        Value::String(g) if g == "front" => !SIDE.contains(&gui),
        v => v.as_i64() == Some(gui),
    }
}

/// The head's turn under way: when it began, the panel before and the panel now.
#[derive(Clone, Copy, Debug)]
pub struct Turn {
    pub t0: f64,
    pub old: i64,
    pub new: i64,
}

/// Where a window is pushed (parts of... pixels) and how much of it shows (0..1) at time t, in the turn under way: (dx, dy, alpha).
/// `boot`: a hologram boot is under way (the windows then boot instead of fading in).
pub fn motion(group: &Value, gui: i64, turn: Option<Turn>, turn_hidden: bool, boot: bool, t: f64, h: f64) -> (f64, f64, f64) {
    let now = seen_in(group, gui);
    let Some(tn) = turn else { return (0.0, 0.0, if now { 1.0 } else { 0.0 }) };
    let el = t - tn.t0;
    let was = seen_in(group, tn.old);
    if was == now {
        return (0.0, 0.0, if now { 1.0 } else { 0.0 });
    }
    if was && turn_hidden {
        return (0.0, 0.0, 0.0); // it left while the HUD was hidden: already gone when it shows
    }
    let front = group.as_str() == Some("front");
    if was {
        // leaves: slides away with the head's turn, fading quickly
        let (sx, sy) = if front { slide(tn.new) } else { let s = slide(tn.old); (-s.0, -s.1) };
        let e = smooth(el / OUT_S);
        return (sx * h * e, sy * h * e, (1.0 - e).max(0.0));
    }
    let (start, dur) = if front { IN_FRONT } else { IN_PANEL };
    let p = ((el - start) / dur).clamp(0.0, 1.0);
    if front {
        // back: slides in from where the head was, as the head comes back
        let (sx, sy) = slide(tn.old);
        let e = smooth(p);
        return (sx * h * (1.0 - e), sy * h * (1.0 - e), if boot { if p > 0.0 { 1.0 } else { 0.0 } } else { e });
    }
    if !boot {
        return (0.0, 0.0, smooth(p)); // no boot: it fades in
    }
    (0.0, 0.0, if p > 0.0 { 1.0 } else { 0.0 }) // a panel's window: it boots up
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn motion_matches_the_plugin() {
        let Ok(t) = std::fs::read_to_string(crate::host::parity::golden_dir().join("motion_golden.json")) else { println!("SKIP"); return };
        let cases: Vec<Value> = serde_json::from_str(&t).unwrap();
        let mut bad = Vec::new();
        for (i, c) in cases.iter().enumerate() {
            let turn = c[2].as_array().map(|a| Turn { t0: c[5].as_f64().unwrap(), old: a[0].as_i64().unwrap(), new: a[1].as_i64().unwrap() });
            let got = motion(&c[0], c[1].as_i64().unwrap(), turn, c[3].as_bool().unwrap(), c[4].as_bool().unwrap(), c[6].as_f64().unwrap(), c[7].as_f64().unwrap());
            let want: Vec<f64> = c[8].as_array().unwrap().iter().map(|v| v.as_f64().unwrap()).collect();
            if (got.0 - want[0]).abs() > 1e-9 || (got.1 - want[1]).abs() > 1e-9 || (got.2 - want[2]).abs() > 1e-9 {
                bad.push(format!("case {i} {}: plugin {want:?}, app {got:?}", c));
            }
        }
        println!("motion: {} cases, {} differences", cases.len(), bad.len());
        assert!(bad.is_empty(), "{}", bad.iter().take(4).cloned().collect::<Vec<_>>().join("\n"));
    }
}
