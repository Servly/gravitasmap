//! The keys that do things (bounty.py Keys): each press seen once, on the way down, whichever window is in front. Read with GetAsyncKeyState,
//! never hooked or blocked. The plugin's keys were Ctrl+Shift+F7 to F12; they clash with other programs, so here every one can be chosen
//! ("Ctrl+Alt+K"). The defaults are the plugin's.
use crate::panelkeys::vk_of;
use std::collections::HashMap;

const VK_CTRL: u32 = 0x11;
const VK_SHIFT: u32 = 0x10;
const VK_ALT: u32 = 0x12;
const VK_LWIN: u32 = 0x5B;
const VK_RWIN: u32 = 0x5C;

/// The jobs, in the plugin's order. Only the menu has a key to begin with (Ctrl+Shift+K: the game uses no K, and G, the first default, got in the way of
/// the game's own G binds): the others are in the menu as buttons, and a key for any of them can be set under Key Bindings (and taken away again). The plugin's own
/// keys were Ctrl+Shift+F7 to F12 (offered there as each job's default choice).
pub const JOBS: [&str; 17] = ["flip", "report", "reset", "clear", "hide", "claims", "menu", "app", "map_up", "map_left", "map_down", "map_right", "map_zin", "map_zout", "map_fit", "map_show", "map_site"];

/// The map keys move or zoom the System map while they are held (read by mapwin.rs every 30 ms), they are not "pressed once" jobs.
/// Shift turns the number pad's digits into the arrow and navigation keys while Num Lock is on (and back while it is off): a key bound to Num8 with Shift is
/// really seen as Up (or as Num8 when Num Lock is off). Both are taken, so the number pad works either way.
fn pad_twin(vk: u32) -> Option<u32> {
    Some(match vk {
        0x60 => 0x2D, // Num0 / Insert
        0x61 => 0x23, // Num1 / End
        0x62 => 0x28, // Num2 / Down
        0x63 => 0x22, // Num3 / Page Down
        0x64 => 0x25, // Num4 / Left
        0x65 => 0x0C, // Num5 / Clear
        0x66 => 0x27, // Num6 / Right
        0x67 => 0x24, // Num7 / Home
        0x68 => 0x26, // Num8 / Up
        0x69 => 0x21, // Num9 / Page Up
        _ => return None,
    })
}

/// Windows lets go of Shift (a "fake" Shift-up) whenever a number pad digit is pressed with Shift held, so Shift never reads as down together with one:
/// a binding with Shift and a pad key takes the pad key alone as enough (Ctrl and Alt are not touched by this).
fn shift_ok(state: &dyn Fn(u32) -> bool, shift: bool, vk: u32) -> bool {
    !shift || pad_twin(vk).is_some() || state(VK_SHIFT)
}

fn key_is_down(state: &dyn Fn(u32) -> bool, vk: u32) -> bool {
    state(vk) || pad_twin(vk).is_some_and(|t| state(t))
}

pub fn is_map_hold(job: &str) -> bool { matches!(job, "map_up" | "map_left" | "map_down" | "map_right" | "map_zin" | "map_zout") }

/// The key a job has until it is changed ("" = none).
pub fn default_text(job: &str) -> &'static str {
    match job {
        "menu" => "Ctrl+Shift+K",
        // the System map over the game: Ctrl+Shift and the number pad, 8 up, 4 left, 5 down, 6 right (like WASD), + and - zoom, 0 shows the whole system
        "map_up" => "Ctrl+Shift+Num8",
        "map_left" => "Ctrl+Shift+Num4",
        "map_down" => "Ctrl+Shift+Num5",
        "map_right" => "Ctrl+Shift+Num6",
        "map_zin" => "Ctrl+Shift+NumAdd",
        "map_zout" => "Ctrl+Shift+NumSub",
        "map_fit" => "Ctrl+Shift+Num0",
        _ => "",
    }
}

/// "Ctrl+Shift+F9" as (ctrl, shift, alt, windows, key), or None when it cannot be read (a key needs a letter, digit, F key or the like after the modifiers).
pub fn parse(text: &str) -> Option<(bool, bool, bool, bool, u32)> {
    let (mut ctrl, mut shift, mut alt, mut win) = (false, false, false, false);
    let mut key = None;
    for part in text.split('+').map(str::trim) {
        match part.to_ascii_lowercase().as_str() {
            "ctrl" | "control" => ctrl = true,
            "shift" => shift = true,
            "alt" => alt = true,
            "win" | "windows" | "meta" | "super" => win = true,
            _ => {
                if key.is_some() { return None; }
                let canon: String = if part.len() == 1 || (part.len() <= 3 && part.starts_with(['f', 'F']) && part[1..].chars().all(|c| c.is_ascii_digit())) {
                    part.to_ascii_uppercase()
                } else {
                    let mut c = part.chars();
                    c.next().map(|f| f.to_ascii_uppercase().to_string() + c.as_str()).unwrap_or_default()
                };
                key = Some(vk_of(&canon)?);
            }
        }
    }
    Some((ctrl, shift, alt, win, key?))
}

pub struct Keys {
    binds: Vec<(String, (bool, bool, bool, bool, u32))>,
    held: HashMap<String, bool>,
}

impl Keys {
    /// `custom`: (job, text) pairs that replace the defaults ("" takes a key away); one that cannot be read keeps its default.
    pub fn new(custom: &[(String, String)]) -> Keys {
        let binds = JOBS.iter().filter_map(|name| {
            let def = default_text(name);
            let text = custom.iter().find(|(n, _)| n == name).map(|(_, t)| t.as_str()).unwrap_or(def);
            // the old default of the menu (Ctrl+Shift+G) is retired: a saved one becomes K (any other key the player chose stays)
            let text = if *name == "menu" && text.eq_ignore_ascii_case("Ctrl+Shift+G") { def } else { text };
            if text.is_empty() { return None; }
            parse(text).or_else(|| parse(def)).map(|b| (name.to_string(), b))
        }).collect();
        Keys { binds, held: HashMap::new() }
    }

    /// The keys pressed since the last look, by name. `state` tells whether a key is down.
    pub fn pressed(&mut self, state: &dyn Fn(u32) -> bool) -> Vec<String> {
        let mut out = Vec::new();
        for (name, (ctrl, shift, alt, win, vk)) in &self.binds {
            let mods = (!ctrl || state(VK_CTRL)) && shift_ok(state, *shift, *vk) && (!alt || state(VK_ALT)) && (!win || state(VK_LWIN) || state(VK_RWIN));
            let down = mods && key_is_down(state, *vk);
            if is_map_hold(name) { continue; } // (held keys: see `held_now`)
            if down && !self.held.get(name).copied().unwrap_or(false) {
                out.push(name.clone());
            }
            self.held.insert(name.clone(), down);
        }
        out
    }

    /// The map keys that are down right now (they repeat while held).
    pub fn held_now(&self, state: &dyn Fn(u32) -> bool) -> Vec<String> {
        self.binds.iter().filter(|(n, _)| is_map_hold(n)).filter(|(_, (ctrl, shift, alt, win, vk))| {
            (!ctrl || state(VK_CTRL)) && shift_ok(state, *shift, *vk) && (!alt || state(VK_ALT)) && (!win || state(VK_LWIN) || state(VK_RWIN)) && key_is_down(state, *vk)
        }).map(|(n, _)| n.clone()).collect()
    }

    pub fn text_of(&self, name: &str) -> String {
        self.binds.iter().find(|(n, _)| n == name).map(|(_, (c, s, a, w, vk))| {
            let mut t = String::new();
            if *w { t += "Win+"; }
            if *c { t += "Ctrl+"; }
            if *s { t += "Shift+"; }
            if *a { t += "Alt+"; }
            let key = (0u32..=255).find(|k| *k == *vk).map(|k| {
                if (0x60..=0x69).contains(&k) { format!("Num{}", k - 0x60) } else if k == 0x6B { "NumAdd".to_string() } else if k == 0x6D { "NumSub".to_string() } else if (0x70..=0x7B).contains(&k) { format!("F{}", k - 0x6F) } else if k >= 0x20 && k < 0x7F { (k as u8 as char).to_string() } else { format!("0x{k:02X}") }
            }).unwrap_or_default();
            t + &key
        }).unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The map keys: Ctrl+Shift and the number pad, read while held (they repeat), the "+" and "-" of the pad written NumAdd and NumSub.
    #[test]
    fn the_map_keys_are_numpad_keys_and_repeat_while_held() {
        assert_eq!(parse("Ctrl+Shift+Num8"), Some((true, true, false, false, 0x68)));
        assert_eq!(parse("Ctrl+Shift+NumAdd"), Some((true, true, false, false, 0x6B)));
        assert_eq!(parse("Ctrl+Shift+NumSub"), Some((true, true, false, false, 0x6D)));
        let k = Keys::new(&[]);
        let down = |keys: &'static [u32]| move |vk: u32| keys.contains(&vk);
        assert_eq!(k.held_now(&down(&[VK_CTRL, VK_SHIFT, 0x68])), vec!["map_up"]);
        assert_eq!(k.held_now(&down(&[VK_CTRL, VK_SHIFT, 0x68, 0x6B])), vec!["map_up", "map_zin"]);
        assert_eq!(k.held_now(&down(&[VK_CTRL, 0x68])), vec!["map_up"], "Windows drops Shift while a pad digit is down");
        assert!(k.held_now(&down(&[0x68])).is_empty(), "Ctrl is still needed");
        assert!(k.held_now(&down(&[VK_CTRL, VK_SHIFT])).is_empty());
        assert_eq!(k.held_now(&down(&[VK_CTRL, VK_SHIFT, 0x26])), vec!["map_up"], "Num Lock on: Shift makes Num8 an Up key");
        assert_eq!(k.text_of("map_zout"), "Ctrl+Shift+NumSub");
        // held keys are not "pressed once" jobs
        let mut k = Keys::new(&[]);
        assert!(k.pressed(&down(&[VK_CTRL, VK_SHIFT, 0x68])).is_empty());
        assert_eq!(k.pressed(&down(&[VK_CTRL, VK_SHIFT, 0x60])), vec!["map_fit"]);
    }
    use std::collections::HashSet;

    const PLUGIN_KEYS: [(&str, &str); 6] = [("flip", "Ctrl+Shift+F7"), ("report", "Ctrl+Shift+F8"), ("reset", "Ctrl+Shift+F9"), ("clear", "Ctrl+Shift+F10"), ("hide", "Ctrl+Shift+F11"), ("claims", "Ctrl+Shift+F12")];

    #[test]
    fn only_the_menu_has_a_key_to_begin_with() {
        let mut k = Keys::new(&[]);
        let st = |s: &[u32]| { let set: HashSet<u32> = s.iter().copied().collect(); move |vk: u32| set.contains(&vk) };
        assert_eq!(k.text_of("menu"), "Ctrl+Shift+K");
        assert_eq!(Keys::new(&[("menu".into(), "Ctrl+Shift+G".into())]).text_of("menu"), "Ctrl+Shift+K", "the retired G becomes K");
        assert_eq!(k.text_of("reset"), "");
        assert!(k.pressed(&st(&[VK_CTRL, VK_SHIFT, 0x78])).is_empty(), "no key for reset until one is set");
        assert_eq!(k.pressed(&st(&[VK_CTRL, VK_SHIFT, 'K' as u32])), vec!["menu"]);
    }

    #[test]
    fn the_plugins_keys_work_as_the_plugins_did() {
        let custom: Vec<(String, String)> = PLUGIN_KEYS.iter().map(|(a, b)| (a.to_string(), b.to_string())).collect();
        let mut k = Keys::new(&custom);
        let down = |s: &[u32]| { let set: HashSet<u32> = s.iter().copied().collect(); move |vk: u32| set.contains(&vk) };
        assert!(k.pressed(&down(&[0x78])).is_empty(), "F9 alone does nothing");
        assert_eq!(k.pressed(&down(&[VK_CTRL, VK_SHIFT, 0x78])), vec!["reset"]);
        assert!(k.pressed(&down(&[VK_CTRL, VK_SHIFT, 0x78])).is_empty(), "held: seen once");
        assert!(k.pressed(&down(&[VK_CTRL, 0x78])).is_empty(), "Shift let go");
        assert_eq!(k.pressed(&down(&[VK_CTRL, VK_SHIFT, 0x78])), vec!["reset"], "down again: seen again");
        assert_eq!(k.pressed(&down(&[VK_CTRL, VK_SHIFT, 0x77, 0x7B])), vec!["report", "claims"].into_iter().map(String::from).collect::<Vec<_>>());
        assert_eq!(k.text_of("flip"), "Ctrl+Shift+F7");
        let mut gone = Keys::new(&[("menu".into(), String::new())]);
        assert_eq!(gone.text_of("menu"), "", "a key can be taken away");
        assert!(gone.pressed(&down(&[VK_CTRL, VK_SHIFT, 'G' as u32])).is_empty());
    }

    #[test]
    fn keys_can_be_chosen() {
        assert_eq!(parse("Ctrl+Alt+K"), Some((true, false, true, false, 'K' as u32)));
        assert_eq!(parse("Win+Shift+F5"), Some((false, true, false, true, 0x74)));
        assert_eq!(parse("shift+f5"), Some((false, true, false, false, 0x74)));
        assert_eq!(parse("Ctrl+"), None);
        assert_eq!(parse("Ctrl+Nonsense"), None);
        let mut k = Keys::new(&[("reset".into(), "Ctrl+Alt+K".into()), ("hide".into(), "garbage++".into())]);
        let st = |vk: u32| [VK_CTRL, VK_ALT, 'K' as u32].contains(&vk);
        assert_eq!(k.pressed(&st), vec!["reset"]);
        assert_eq!(k.text_of("hide"), "", "a key that cannot be read keeps its default (none)");
    }
}
