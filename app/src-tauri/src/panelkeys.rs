//! The game's panel keys, seen the moment they go down (panelkeys.py): the windows ahead go at once when you open a panel, before Status.json
//! says so. The keys are read from the game's own Bindings file (read only); a key's state is only looked at (GetAsyncKeyState), the game gets
//! every key as before. Status.json still has the last word (focus.rs takes a guess back).
use regex::Regex;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// the game's panel actions and the GuiFocus each opens (Status.json), the maps and the FSS too
const PANELS: [(&str, i64); 7] = [
    ("FocusLeftPanel", 2),
    ("FocusCommsPanel", 3),
    ("FocusRadarPanel", 4),
    ("FocusRightPanel", 1),
    ("GalaxyMapOpen", 6),
    ("SystemMapOpen", 7),
    ("ExplorationFSSEnter", 9),
];

pub fn vk_of(name: &str) -> Option<u32> {
    let fixed = match name {
        "Tab" => 0x09,
        "Enter" => 0x0D,
        "Space" => 0x20,
        "Backspace" => 0x08,
        "Delete" => 0x2E,
        "Insert" => 0x2D,
        "Home" => 0x24,
        "End" => 0x23,
        "PageUp" => 0x21,
        "PageDown" => 0x22,
        "LeftArrow" => 0x25,
        "UpArrow" => 0x26,
        "RightArrow" => 0x27,
        "DownArrow" => 0x28,
        "Escape" => 0x1B,
        _ => 0,
    };
    if fixed != 0 {
        return Some(fixed);
    }
    let b = name.as_bytes();
    if b.len() == 1 && (b[0].is_ascii_uppercase() || b[0].is_ascii_digit()) {
        return Some(b[0] as u32);
    }
    if let Some(n) = name.strip_prefix("Numpad_") {
        if n.len() == 1 {
            if let Some(d) = n.chars().next().and_then(|c| c.to_digit(10)) {
                return Some(0x60 + d);
            }
        }
    }
    // GRAVITAS's own keys on the number pad: Num0 to Num9, NumAdd (+) and NumSub (-) (the "+" itself cannot be written in "Ctrl+Shift+Num+")
    if let Some(n) = name.strip_prefix("Num") {
        match n {
            "Add" => return Some(0x6B),
            "Sub" => return Some(0x6D),
            _ => if n.len() == 1 { if let Some(d) = n.chars().next().and_then(|c| c.to_digit(10)) { return Some(0x60 + d); } },
        }
    }
    if let Some(n) = name.strip_prefix('F') {
        if let Ok(i) = n.parse::<u32>() {
            if (1..=12).contains(&i) && n == i.to_string() {
                return Some(0x6F + i);
            }
        }
    }
    None
}

fn mouse_vk(key: &str) -> Option<u32> {
    match key {
        "Mouse_2" => Some(0x02),
        "Mouse_3" => Some(0x04),
        "Mouse_4" => Some(0x05),
        "Mouse_5" => Some(0x06),
        _ => None,
    }
}

/// The ship controls' Bindings file the game uses (StartPreset's second line), or None for a built-in preset.
pub fn binds_file(binds: &Path) -> Option<PathBuf> {
    let found = binds_file_inner(binds);
    crate::drift::bindings(found.is_some());
    found
}

/// The newest StartPreset.*.start of the folder (the game numbers it: StartPreset.4.start today, another number if Frontier changes it), else None.
fn start_file(binds: &Path) -> Option<PathBuf> {
    let mut got: Vec<(std::time::SystemTime, PathBuf)> = Vec::new();
    for e in std::fs::read_dir(binds).ok()?.flatten() {
        let n = e.file_name().to_string_lossy().into_owned();
        if n.starts_with("StartPreset.") && n.ends_with(".start") {
            if let Ok(t) = e.metadata().and_then(|m| m.modified()) {
                got.push((t, e.path()));
            }
        }
    }
    got.into_iter().max_by_key(|(t, _)| *t).map(|(_, p)| p)
}

fn binds_file_inner(binds: &Path) -> Option<PathBuf> {
    // the newest StartPreset file; the old fixed name when none is found
    let start = start_file(binds).unwrap_or_else(|| binds.join("StartPreset.4.start"));
    let text = std::fs::read_to_string(start).ok()?;
    let lines: Vec<&str> = text.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
    let name = if lines.len() > 1 { lines[1] } else { *lines.first()? };
    let mut got: Vec<(std::time::SystemTime, PathBuf)> = Vec::new();
    for e in std::fs::read_dir(binds).ok()?.flatten() {
        let n = e.file_name().to_string_lossy().into_owned();
        if n.starts_with(&format!("{name}.")) && n.ends_with(".binds") {
            got.push((e.metadata().ok()?.modified().ok()?, e.path()));
        }
    }
    got.into_iter().max_by_key(|(t, _)| *t).map(|(_, p)| p)
}

/// Where the game keeps its Bindings: %LOCALAPPDATA%\Frontier Developments\Elite Dangerous\Options\Bindings.
pub fn binds_dir() -> PathBuf {
    PathBuf::from(std::env::var_os("LOCALAPPDATA").unwrap_or_default()).join("Frontier Developments").join("Elite Dangerous").join("Options").join("Bindings")
}

/// The keys bound to an action (one key alone, no modifier): their virtual keys.
pub fn keys_of(text: &str, action: &str) -> Vec<u32> {
    let Ok(re) = Regex::new(&format!(r"(?s)<{0}>(.*?)</{0}>", regex::escape(action))) else { return vec![] };
    let body = re.captures(text).map(|c| c[1].to_string()).unwrap_or_default();
    let slot = Regex::new(r#"(?s)<(?:Primary|Secondary) Device="([^"]*)" Key="([^"]+)"\s*(/>|>.*?</(?:Primary|Secondary)>)"#).unwrap();
    let mut out = Vec::new();
    for c in slot.captures_iter(&body) {
        let (dev, key, rest) = (&c[1], &c[2], &c[3]);
        if rest.contains("Modifier") {
            continue; // (Ctrl+1 and the like: not guessed)
        }
        let vk = if dev == "Keyboard" && key.starts_with("Key_") {
            vk_of(&key[4..])
        } else if dev == "Mouse" {
            mouse_vk(key)
        } else {
            None
        };
        if let Some(v) = vk {
            out.push(v);
        }
    }
    out
}

pub struct PanelKeys {
    pub ok: bool,
    pub open: Vec<(u32, i64)>,
    pub back: Vec<u32>,
    held: HashSet<u32>,
}

impl PanelKeys {
    pub fn from_text(text: &str) -> PanelKeys {
        let mut open: Vec<(u32, i64)> = Vec::new();
        for (action, gui) in PANELS {
            for vk in keys_of(text, action) {
                match open.iter_mut().find(|(k, _)| *k == vk) {
                    Some(e) => e.1 = gui,
                    None => open.push((vk, gui)),
                }
            }
        }
        let back = keys_of(text, "UI_Back");
        PanelKeys { ok: !open.is_empty(), open, back, held: HashSet::new() }
    }

    pub fn load(binds: &Path) -> PanelKeys {
        let text = binds_file(binds).and_then(|p| std::fs::read(p).ok()).map(|b| String::from_utf8_lossy(&b).into_owned());
        match text {
            Some(t) => PanelKeys::from_text(&t),
            None => PanelKeys { ok: false, open: vec![], back: vec![], held: HashSet::new() },
        }
    }

    /// The panel the game is about to show, from a key just pressed (`gui`: the one open now), or None. `state` tells whether a key is down.
    /// (Two keys newly down in one look: the first in the order of the Bindings file wins; the plugin's order there is CPython's set order.)
    pub fn guess(&mut self, gui: i64, state: &dyn Fn(u32) -> bool) -> Option<i64> {
        if !self.ok {
            return None;
        }
        let all: Vec<u32> = self.open.iter().map(|(k, _)| *k).chain(self.back.iter().copied()).collect();
        let down: HashSet<u32> = all.iter().copied().filter(|k| state(*k)).collect();
        let new: Vec<u32> = all.iter().copied().filter(|k| down.contains(k) && !self.held.contains(k)).collect();
        self.held = down;
        for vk in new {
            if let Some((_, p)) = self.open.iter().find(|(k, _)| *k == vk) {
                return Some(if *p == gui { 0 } else { *p }); // its key again closes it
            }
            if gui != 0 && self.back.contains(&vk) {
                return Some(0);
            }
        }
        None
    }
}

/// The game's own free look (head look), read from its Bindings file.
#[derive(Debug, PartialEq, Clone)]
pub struct HeadLook {
    pub mouse: Option<String>,
    pub vk: Option<u32>,
    pub toggle: bool,
    pub label: String,
}

pub fn headlook(text: &str) -> Option<HeadLook> {
    let m = Regex::new(r"(?s)<HeadLookToggle>(.*?)</HeadLookToggle>").unwrap().captures(text)?;
    let body = m[1].to_string();
    let toggle = Regex::new(r#"<ToggleOn Value="1""#).unwrap().is_match(&body);
    let how = if toggle { "press to look, again to stop" } else { "hold to look" };
    for c in Regex::new(r#"<(?:Primary|Secondary) Device="([^"]*)" Key="([^"]+)""#).unwrap().captures_iter(&body) {
        let (dev, key) = (&c[1], &c[2]);
        if dev == "Mouse" && matches!(key, "Mouse_3" | "Mouse_4" | "Mouse_5") {
            let n = &key[key.len() - 1..];
            return Some(HeadLook { mouse: Some(format!("m{n}")), vk: None, toggle, label: format!("Mouse {n}, {how}") });
        }
        if dev == "Keyboard" && key.starts_with("Key_") {
            if let Some(v) = vk_of(&key[4..]) {
                return Some(HeadLook { mouse: None, vk: Some(v), toggle, label: format!("{}, {how}", &key[4..]) });
            }
        }
    }
    None
}

/// The game's actions that use this keyboard key (the key part of a combo like "Ctrl+Shift+G": "G"), from the Bindings text, by name ("Cycle Next Target").
/// The game also receives the key when our combo is pressed, so a key it uses can do something there.
pub fn actions_using(text: &str, key: &str) -> Vec<String> {
    let name = if key.chars().count() == 1 { key.to_ascii_uppercase() } else { key.to_string() };
    let needle = format!("Key=\"Key_{name}\"");
    let block = Regex::new(r"(?s)<(\w+)>(.*?)</\w+>").unwrap();
    let mut out = Vec::new();
    for c in block.captures_iter(text) {
        let (action, body) = (&c[1], &c[2]);
        if body.contains("Device=\"Keyboard\"") && body.lines().any(|l| l.contains("Keyboard") && l.contains(&needle)) {
            let mut h = String::new();
            for (i, ch) in action.chars().enumerate() {
                if i > 0 && ch.is_ascii_uppercase() { h.push(' '); }
                h.push(ch);
            }
            if !out.contains(&h) { out.push(h); }
        }
    }
    out
}

/// The first of these keys that the game does not use, from the Bindings text (for the menu key: the game also gets our key).
pub fn first_free_key(text: &str, candidates: &[&str]) -> Option<String> {
    candidates.iter().find(|k| actions_using(text, k).is_empty()).map(|k| k.to_string())
}

/// GetAsyncKeyState: bit 15 is "down now", bit 0 "pressed since the last look".
pub fn key_state(vk: u32) -> u16 {
    use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    if cfg!(feature = "diag-noinput") { return 0; } // (diagnostic build only)
    unsafe { GetAsyncKeyState(vk as i32) as u16 }
}

/// Is a key down right now?
pub fn key_down(vk: u32) -> bool {
    key_state(vk) & 0x8000 != 0
}

#[cfg(test)]
mod conflict_tests {
    use super::*;

    #[test]
    fn game_actions_on_a_key_are_found() {
        let t = "<CycleNextTarget>
<Primary Device=\"Keyboard\" Key=\"Key_G\" />
<Secondary Device=\"{NoDevice}\" Key=\"\" />
</CycleNextTarget>
<HumanoidThrowGrenadeButton>
<Primary Device=\"Keyboard\" Key=\"Key_X\" />
<Secondary Device=\"Keyboard\" Key=\"Key_G\" />
</HumanoidThrowGrenadeButton>
<Other>
<Primary Device=\"Mouse\" Key=\"Key_G\" />
</Other>";
        assert_eq!(actions_using(t, "G"), vec!["Cycle Next Target", "Humanoid Throw Grenade Button"]);
        assert!(actions_using(t, "H").is_empty());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;
    use std::collections::HashMap;

    #[test]
    fn panel_keys_match_the_plugin() {
        let Ok(t) = std::fs::read_to_string(crate::host::parity::golden_dir().join("panelkeys_golden.json")) else {
            println!("SKIP");
            return;
        };
        let d: Value = serde_json::from_str(&t).unwrap();
        let mut bad: Vec<String> = Vec::new();
        let u32s = |v: &Value| -> Vec<u32> { v.as_array().unwrap().iter().map(|x| x.as_u64().unwrap() as u32).collect() };
        for (i, c) in d["texts"].as_array().unwrap().iter().enumerate() {
            let text = c[0].as_str().unwrap();
            for (a, want) in c[1].as_object().unwrap() {
                let (got, want) = (keys_of(text, a), u32s(want));
                if got != want {
                    bad.push(format!("text {i} keys_of {a}: plugin {want:?}, app {got:?}"));
                }
            }
            let pk = PanelKeys::from_text(text);
            if pk.ok != c[2].as_bool().unwrap() {
                bad.push(format!("text {i}: ok"));
            }
            let want_open: HashMap<u32, i64> = c[3].as_object().unwrap().iter().map(|(k, v)| (k.parse().unwrap(), v.as_i64().unwrap())).collect();
            if pk.open.iter().cloned().collect::<HashMap<u32, i64>>() != want_open {
                bad.push(format!("text {i}: open map"));
            }
            if pk.back != u32s(&c[4]) {
                bad.push(format!("text {i}: back keys"));
            }
            let hl = headlook(text);
            let want_hl = if c[5].is_null() {
                None
            } else {
                let h = &c[5];
                Some(HeadLook { mouse: h["mouse"].as_str().map(String::from), vk: h["vk"].as_u64().map(|v| v as u32), toggle: h["toggle"].as_bool().unwrap(), label: h["label"].as_str().unwrap().to_string() })
            };
            if hl != want_hl {
                bad.push(format!("text {i}: headlook plugin {want_hl:?}, app {hl:?}"));
            }
        }
        let mut steps = 0;
        for (i, g) in d["guess"].as_array().unwrap().iter().enumerate() {
            let mut pk = PanelKeys::from_text(g[0].as_str().unwrap());
            for (j, (s, a)) in g[1].as_array().unwrap().iter().zip(g[2].as_array().unwrap()).enumerate() {
                let down: HashSet<u32> = u32s(&s[0]).into_iter().collect();
                let got = pk.guess(s[1].as_i64().unwrap(), &|k| down.contains(&k));
                steps += 1;
                if got != a.as_i64() {
                    bad.push(format!("guess script {i} step {j}: plugin {a}, app {got:?}"));
                }
            }
        }
        let tmp = std::env::temp_dir().join("gravitas_binds_test");
        for (i, p) in d["presets"].as_array().unwrap().iter().enumerate() {
            let _ = std::fs::remove_dir_all(&tmp);
            std::fs::create_dir_all(&tmp).unwrap();
            let lines: Vec<&str> = p[0].as_array().unwrap().iter().map(|v| v.as_str().unwrap()).collect();
            std::fs::write(tmp.join("StartPreset.4.start"), if lines.is_empty() { String::new() } else { lines.join("\n") + "\n" }).unwrap();
            let t0 = std::time::SystemTime::now() - std::time::Duration::from_secs(1000);
            for f in p[1].as_array().unwrap() {
                let path = tmp.join(f[0].as_str().unwrap());
                std::fs::write(&path, "x").unwrap();
                let file = std::fs::File::options().write(true).open(&path).unwrap();
                file.set_modified(t0 + std::time::Duration::from_secs(10 * f[1].as_u64().unwrap())).unwrap();
            }
            let got = binds_file(&tmp).map(|p| p.file_name().unwrap().to_string_lossy().into_owned());
            if got.as_deref() != p[2].as_str() {
                bad.push(format!("preset {i} {lines:?}: plugin {}, app {got:?}", p[2]));
            }
        }
        let _ = std::fs::remove_dir_all(&tmp);
        println!("panel keys: {} texts, {steps} guess steps, {} presets, {} differences", d["texts"].as_array().unwrap().len(), d["presets"].as_array().unwrap().len(), bad.len());
        assert!(bad.is_empty(), "{}", bad.iter().take(6).cloned().collect::<Vec<_>>().join("\n"));
    }

    #[test]
    fn a_renumbered_start_preset_is_found() {
        let tmp = std::env::temp_dir().join(format!("gravitas_binds_renumbered_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        std::fs::write(tmp.join("StartPreset.4.start"), "Old
Old
").unwrap();
        std::fs::write(tmp.join("Old.4.0.binds"), "x").unwrap();
        assert_eq!(binds_file(&tmp).unwrap().file_name().unwrap().to_string_lossy(), "Old.4.0.binds");
        // the game moves to StartPreset.5.start (written later): that one wins
        std::thread::sleep(std::time::Duration::from_millis(30));
        std::fs::write(tmp.join("StartPreset.5.start"), "Mine
Mine
").unwrap();
        std::fs::write(tmp.join("Mine.5.0.binds"), "x").unwrap();
        assert_eq!(binds_file(&tmp).unwrap().file_name().unwrap().to_string_lossy(), "Mine.5.0.binds");
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
