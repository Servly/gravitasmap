//! DEBRIEF: which of the game's ship keys are down, and when. Only the keys the game's own Bindings file binds to a SHIP action are ever looked
//! at (their state, nothing else): no other key is read, nothing typed is seen, nothing is written for a key that is not bound. It looks only
//! while the DEBRIEF recording is wanted (the game in front, you in the ship, no panel open), else the thread sleeps and reads nothing.
//! The state is read with GetAsyncKeyState (bit 15, "down now"), about every 8 ms: a tap is far longer than that.
use crate::dbnames;
use regex::Regex;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

/// One key (or mouse button, or wheel direction) and what the game does with it in the ship.
#[derive(Clone, Debug, PartialEq)]
pub struct Binding {
    pub key: String,
    pub vk: u32,
    pub acts: Vec<String>,
}

/// The ship's controls, as far as they can be followed.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Map {
    pub keys: Vec<Binding>,
    pub wheel_up: Vec<String>,
    pub wheel_down: Vec<String>,
    /// bound keys that cannot be followed (a modifier is part of them, or the key has no known place): (the key, its actions)
    pub untracked: Vec<(String, Vec<String>)>,
    /// actions that are also (or only) bound on a joystick, a pad or another device: pressing those is not seen
    pub elsewhere: Vec<String>,
    /// what the ship's mouse does: Bindings_MouseRoll, Bindings_MousePitch, Bindings_MouseYaw ... and whether it returns to the middle
    pub mouse_x: String,
    pub mouse_y: String,
    pub decay: bool,
}

/// What a ship key press looked like: the key's own name and the actions on it, from when to when (None while it is still down).
#[derive(Clone, Debug, PartialEq)]
pub struct Edge {
    pub t: f64,
    pub down: bool,
    pub key: String,
    pub acts: Vec<String>,
}

fn value_of(text: &str, tag: &str) -> String {
    Regex::new(&format!(r#"<{tag} Value="([^"]*)""#)).ok().and_then(|r| r.captures(text)).map(|c| c[1].to_string()).unwrap_or_default()
}

/// The virtual key of a key name of the game's: letters, digits, F-keys, the number pad, the modifiers, and the signs through the layout in use.
pub fn vk_of(device: &str, key: &str) -> Option<u32> {
    if device == "Mouse" {
        return match key { "Mouse_1" => Some(0x01), "Mouse_2" => Some(0x02), "Mouse_3" => Some(0x04), "Mouse_4" => Some(0x05), "Mouse_5" => Some(0x06), _ => None };
    }
    let k = key.strip_prefix("Key_")?;
    if let Some(v) = crate::panelkeys::vk_of(k) { return Some(v); }
    let v = match k {
        "LeftShift" => 0xA0, "RightShift" => 0xA1, "LeftControl" => 0xA2, "RightControl" => 0xA3, "LeftAlt" => 0xA4, "RightAlt" => 0xA5,
        "Numpad_Decimal" => 0x6E, "Numpad_Divide" => 0x6F, "Numpad_Multiply" => 0x6A, "Numpad_Subtract" => 0x6D, "Numpad_Add" => 0x6B,
        "Numpad_Enter" => 0x0D,
        _ => 0,
    };
    if v != 0 { return Some(v); }
    // a sign: the key that makes it on the keyboard in use, when it needs no Shift (else it is not followed)
    let c = match k { "Minus" => '-', "Equals" => '=', "Comma" => ',', "Period" => '.', "Slash" => '/', "Semicolon" => ';', "Apostrophe" => '\'', "DoubleQuote" => '"', "LessThan" => '<', _ => return None };
    char_vk(c)
}

#[cfg(windows)]
fn char_vk(c: char) -> Option<u32> {
    use windows::Win32::UI::Input::KeyboardAndMouse::VkKeyScanW;
    let r = unsafe { VkKeyScanW(c as u16) };
    if r == -1 || (r >> 8) & 0xff != 0 { None } else { Some((r & 0xff) as u32) }
}
#[cfg(not(windows))]
fn char_vk(_c: char) -> Option<u32> { None }

impl Map {
    /// From the text of the game's Bindings file (read only).
    pub fn from_text(text: &str) -> Map {
        let slot = Regex::new(r#"(?s)<(?:Primary|Secondary) Device="([^"]*)" Key="([^"]+)"\s*(/>|>.*?</(?:Primary|Secondary)>)"#).unwrap();
        let mut elsewhere: Vec<String> = Vec::new();
        let mut by_key: Vec<(String, String, bool, Vec<String>)> = Vec::new(); // (device, key, a modifier is part of it, actions)
        for (id, _, _) in dbnames::SHIP {
            let Ok(re) = Regex::new(&format!(r"(?s)<{0}>(.*?)</{0}>", regex::escape(id))) else { continue };
            let Some(body) = re.captures(text).map(|c| c[1].to_string()) else { continue };
            for c in slot.captures_iter(&body) {
                let (dev, key, rest) = (c[1].to_string(), c[2].to_string(), c[3].to_string());
                if dev != "Keyboard" && dev != "Mouse" {
                    // (a joystick or a pad is not followed: the action is marked, so nothing is ever said about it)
                    if dev != "{NoDevice}" && !dev.is_empty() { elsewhere.push(id.to_string()); }
                    continue;
                }
                let modi = rest.contains("Modifier");
                match by_key.iter_mut().find(|e| e.0 == dev && e.1 == key && e.2 == modi) {
                    Some(e) => { if !e.3.contains(&id.to_string()) { e.3.push(id.to_string()); } }
                    None => by_key.push((dev, key, modi, vec![id.to_string()])),
                }
            }
        }
        let mut m = Map { mouse_x: value_of(text, "MouseXMode"), mouse_y: value_of(text, "MouseYMode"), decay: value_of(text, "MouseXDecay") == "1" || value_of(text, "MouseYDecay") == "1", elsewhere, ..Default::default() };
        for (dev, key, modi, acts) in by_key {
            if key == "Pos_Mouse_ZAxis" { if !modi { m.wheel_up = acts; } continue; }
            if key == "Neg_Mouse_ZAxis" { if !modi { m.wheel_down = acts; } continue; }
            match (modi, vk_of(&dev, &key)) {
                (false, Some(vk)) => match m.keys.iter_mut().find(|b| b.vk == vk) {
                    Some(b) => { for a in acts { if !b.acts.contains(&a) { b.acts.push(a); } } }
                    None => m.keys.push(Binding { key, vk, acts }),
                },
                _ => m.untracked.push((key, acts)),
            }
        }
        m
    }
}

/// Follows the keys of a Map. `active` false: nothing is looked at, and a key that was down is let go.
pub struct Sampler {
    pub map: Map,
    down: HashMap<u32, f64>,
}

impl Sampler {
    pub fn new(map: Map) -> Sampler { Sampler { map, down: HashMap::new() } }

    pub fn step(&mut self, now: f64, active: bool, state: &dyn Fn(u32) -> bool) -> Vec<Edge> {
        let mut out = Vec::new();
        if !active {
            let held: Vec<u32> = self.down.keys().copied().collect();
            for vk in held {
                if let Some(b) = self.map.keys.iter().find(|b| b.vk == vk) { out.push(Edge { t: now, down: false, key: b.key.clone(), acts: b.acts.clone() }); }
                self.down.remove(&vk);
            }
            return out;
        }
        for b in &self.map.keys {
            let is = state(b.vk);
            let was = self.down.contains_key(&b.vk);
            if is && !was {
                self.down.insert(b.vk, now);
                out.push(Edge { t: now, down: true, key: b.key.clone(), acts: b.acts.clone() });
            } else if !is && was {
                self.down.remove(&b.vk);
                out.push(Edge { t: now, down: false, key: b.key.clone(), acts: b.acts.clone() });
            }
        }
        out
    }

    /// A wheel notch is a press and a release at once.
    pub fn wheel(&self, now: f64, up: bool) -> Vec<Edge> {
        let (key, acts) = if up { ("Pos_Mouse_ZAxis", &self.map.wheel_up) } else { ("Neg_Mouse_ZAxis", &self.map.wheel_down) };
        if acts.is_empty() { return vec![]; }
        vec![Edge { t: now, down: true, key: key.into(), acts: acts.clone() }, Edge { t: now, down: false, key: key.into(), acts: acts.clone() }]
    }
}

// ---- the thread: reads only while a recording is wanted
pub enum Item {
    Edge(Edge),
    /// mouse movement over about 100 ms: (when, along x, along y), in the mouse's own counts
    Move(f64, i64, i64),
}

static ACTIVE: AtomicBool = AtomicBool::new(false);
static STARTED: AtomicBool = AtomicBool::new(false);
static OUT: Mutex<Vec<Item>> = Mutex::new(Vec::new());
static MAP: Mutex<Option<Map>> = Mutex::new(None);

/// The recording is wanted now (the game in front, you in the ship, no panel open) or not.
pub fn set_active(on: bool) {
    ACTIVE.store(on, Ordering::Relaxed);
    crate::rawmouse::set_motion(on);
    if on && !STARTED.swap(true, Ordering::SeqCst) {
        crate::rawmouse::start();
        std::thread::Builder::new().name("GRAVITAS inputs".into()).spawn(|| crate::guard::keep_running("inputs", run)).ok();
    }
}

pub fn take() -> Vec<Item> {
    OUT.lock().map(|mut o| std::mem::take(&mut *o)).unwrap_or_default()
}

/// The map in use (for the page that tells which keys are followed).
pub fn map() -> Option<Map> {
    MAP.lock().ok().and_then(|m| m.clone())
}

fn now_secs() -> f64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs_f64()).unwrap_or(0.0)
}

pub fn load_map() -> Map {
    crate::panelkeys::binds_file(&crate::panelkeys::binds_dir())
        .and_then(|p| std::fs::read(p).ok())
        .map(|b| Map::from_text(&String::from_utf8_lossy(&b)))
        .unwrap_or_default()
}

fn run() {
    let mut s = Sampler::new(load_map());
    if let Ok(mut m) = MAP.lock() { *m = Some(s.map.clone()); }
    let mut was_active = false;
    let mut last_move = now_secs();
    let mut last_map = std::time::Instant::now();
    loop {
        let active = ACTIVE.load(Ordering::Relaxed);
        if !active {
            if was_active {
                let t = now_secs();
                let edges = s.step(t, false, &|_| false);
                if let Ok(mut o) = OUT.lock() { o.extend(edges.into_iter().map(Item::Edge)); }
                was_active = false;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
            continue;
        }
        if !was_active {
            // (the Bindings are read again every time a recording starts, and every few seconds while it runs: the player may change a key)
            s = Sampler::new(load_map());
            if let Ok(mut m) = MAP.lock() { *m = Some(s.map.clone()); }
            last_move = now_secs();
            last_map = std::time::Instant::now();
            let _ = crate::rawmouse::take_motion();
            was_active = true;
        }
        let t = now_secs();
        let mut items: Vec<Item> = s.step(t, true, &crate::panelkeys::key_down).into_iter().map(Item::Edge).collect();
        if t - last_move >= 0.1 {
            let (dx, dy, wheel) = crate::rawmouse::take_motion();
            if dx != 0 || dy != 0 { items.push(Item::Move(t, dx, dy)); }
            for _ in 0..wheel.unsigned_abs() { items.extend(s.wheel(t, wheel > 0).into_iter().map(Item::Edge)); }
            last_move = t;
        }
        if !items.is_empty() {
            if let Ok(mut o) = OUT.lock() { o.extend(items); if o.len() > 4000 { o.drain(..2000); } }
        }
        if last_map.elapsed().as_secs() >= 5 {
            let fresh = load_map();
            if fresh != s.map { s.map = fresh; if let Ok(mut m) = MAP.lock() { *m = Some(s.map.clone()); } }
            last_map = std::time::Instant::now();
        }
        std::thread::sleep(std::time::Duration::from_millis(8));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const BINDS: &str = r#"<Root>
<MouseXMode Value="Bindings_MouseRoll" />
<MouseXDecay Value="1" />
<MouseYMode Value="Bindings_MousePitch" />
<YawLeftButton>
	<Primary Device="Keyboard" Key="Key_A" />
	<Secondary Device="{NoDevice}" Key="" />
</YawLeftButton>
<ForwardThrustButton>
	<Primary Device="Keyboard" Key="Key_W" />
	<Secondary Device="{NoDevice}" Key="" />
</ForwardThrustButton>
<ToggleFlightAssist>
	<Primary Device="Keyboard" Key="Key_Space" />
	<Secondary Device="Keyboard" Key="Key_Z" />
</ToggleFlightAssist>
<BlockMouseDecay>
	<Primary Device="Keyboard" Key="Key_Space" />
	<Secondary Device="{NoDevice}" Key="" />
</BlockMouseDecay>
<PrimaryFire>
	<Primary Device="Mouse" Key="Mouse_1" />
	<Secondary Device="231D2A" Key="Joy_1" />
</PrimaryFire>
<ForwardKey>
	<Primary Device="Mouse" Key="Pos_Mouse_ZAxis" />
	<Secondary Device="{NoDevice}" Key="" />
</ForwardKey>
<DeployHeatSink>
	<Primary Device="Keyboard" Key="Key_V">
		<Modifier Device="Keyboard" Key="Key_LeftShift" />
	</Primary>
	<Secondary Device="{NoDevice}" Key="" />
</DeployHeatSink>
<UI_Up>
	<Primary Device="Keyboard" Key="Key_W" />
</UI_Up>
<HumanoidForwardButton>
	<Primary Device="Keyboard" Key="Key_W" />
</HumanoidForwardButton>
</Root>"#;

    #[test]
    fn the_map_holds_ship_actions_only_and_says_what_it_cannot_follow() {
        let m = Map::from_text(BINDS);
        // W is the ship's forward thrust only: the menu's and the on-foot W are other contexts
        let w = m.keys.iter().find(|b| b.key == "Key_W").unwrap();
        assert_eq!(w.acts, vec!["ForwardThrustButton"]);
        // one key, two ship actions: both are shown
        let sp = m.keys.iter().find(|b| b.key == "Key_Space").unwrap();
        assert_eq!(sp.acts, vec!["ToggleFlightAssist", "BlockMouseDecay"]);
        assert!(m.keys.iter().any(|b| b.key == "Key_Z" && b.acts == vec!["ToggleFlightAssist"]));
        // a mouse button is followed, a joystick button is not
        assert!(m.keys.iter().any(|b| b.key == "Mouse_1" && b.vk == 0x01));
        assert!(m.keys.iter().all(|b| b.vk != 0 && !b.key.starts_with("Joy")));
        assert_eq!(m.elsewhere, vec!["PrimaryFire"]); // (its second key is on a joystick: pressing that is not seen)
        // the wheel
        assert_eq!(m.wheel_up, vec!["ForwardKey"]);
        // a key with a modifier is listed as not followed, never as a plain V
        assert!(m.keys.iter().all(|b| b.key != "Key_V"));
        assert_eq!(m.untracked, vec![("Key_V".to_string(), vec!["DeployHeatSink".to_string()])]);
        // the mouse
        assert_eq!((m.mouse_x.as_str(), m.mouse_y.as_str(), m.decay), ("Bindings_MouseRoll", "Bindings_MousePitch", true));
    }

    #[test]
    #[ignore]
    fn real_bindings_of_this_pc() {
        let m = load_map();
        for b in &m.keys { println!("{:<18} vk {:#04x}  {:?}", b.key, b.vk, b.acts.iter().map(|a| dbnames::label(a)).collect::<Vec<_>>()); }
        println!("wheel up {:?} down {:?}", m.wheel_up, m.wheel_down);
        println!("NOT FOLLOWED {:?}", m.untracked);
        println!("mouse x {} y {} decay {}", m.mouse_x, m.mouse_y, m.decay);
        assert!(!m.keys.is_empty());
    }

    #[test]
    fn a_tap_and_a_hold_are_two_edges_each_and_nothing_is_read_while_off() {
        let m = Map::from_text(BINDS);
        let mut s = Sampler::new(m);
        let w = 0x57u32;
        let down = std::cell::Cell::new(false);
        let st = |vk: u32| vk == w && down.get();
        assert!(s.step(1.0, true, &st).is_empty());
        down.set(true);
        let e = s.step(2.0, true, &st);
        assert_eq!(e.len(), 1);
        assert!(e[0].down && e[0].key == "Key_W" && e[0].t == 2.0);
        assert!(s.step(2.5, true, &st).is_empty()); // (still down: no new edge)
        // the recording stops while the key is down: it is let go at that moment, and the key is not read again
        let called = std::cell::Cell::new(0);
        let spy = |_vk: u32| { called.set(called.get() + 1); true };
        let e = s.step(3.0, false, &spy);
        assert_eq!(e.len(), 1);
        assert!(!e[0].down && e[0].t == 3.0);
        assert_eq!(called.get(), 0, "a key was looked at while the recording was off");
        assert!(s.step(4.0, false, &spy).is_empty());
        assert_eq!(called.get(), 0);
        // wheel notches
        let up = s.wheel(5.0, true);
        assert_eq!(up.len(), 2);
        assert!(up[0].down && !up[1].down);
        assert!(s.wheel(5.0, false).is_empty()); // (nothing is bound to wheel down)
    }
}
