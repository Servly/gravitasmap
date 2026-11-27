//! The Combat overlay, live (GRAVITAS v0.3): the journal is read, the combat host (engine, counters, claims, card models) runs every
//! 250 ms, and every window of the HUD is its own see-through, click-through overlay window over the game, drawn as the plugin drew it.
//! The rules, all from Burak: windows show only while the game is in front, never take a click, the focus or a key, and fade out while the
//! mouse is over them. A window is drawn again only when its card changed, and with nothing to show nothing is built.
use crate::host::Host;
use crate::hud::anim::{self, Turn};
use crate::hud::bootfx::{self, Boot};
use crate::hud::paint::Picture;
use crate::hud::{pieces, place};
use crate::overlay::{self, Game, Win};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use windows::Win32::Foundation::POINT;
use windows::Win32::UI::WindowsAndMessaging::{
    DestroyWindow, DispatchMessageW, GetCursorPos, PeekMessageW, SetWindowPos, ShowWindow, HWND_TOPMOST, MSG, PM_REMOVE, SWP_NOACTIVATE,
    SWP_NOMOVE, SWP_NOSIZE, SW_HIDE, SW_SHOWNOACTIVATE,
};

pub static ENABLED: AtomicBool = AtomicBool::new(false);
/// The Thargoid and On Foot modes (on by default: the modes switch by themselves, these only turn one off completely)
pub static THARGOID_ON: AtomicBool = AtomicBool::new(true);
pub static FOOT_ON: AtomicBool = AtomicBool::new(true);
/// DEBRIEF (off until the player turns it on: it follows the ship keys), and its observations (off until switched on)
pub static DEBRIEF_ON: AtomicBool = AtomicBool::new(false);
pub static DEBRIEF_RULES: AtomicBool = AtomicBool::new(false);
/// PVP mode (off until switched on): its fight files, whether a shield going down ends a fight, whether the ship's build goes into the file
pub static PVP_ON: AtomicBool = AtomicBool::new(false);
pub static PVP_SHIELD: AtomicBool = AtomicBool::new(false);
pub static PVP_BUILD: AtomicBool = AtomicBool::new(true);
pub static HOVER_HIDE: AtomicBool = AtomicBool::new(true);
/// Preview: made-up fights on the windows (switched from the app's window)
pub static PREVIEW: AtomicBool = AtomicBool::new(false);
/// What the menu (or the app's window) asked for, done by this thread: the keys' jobs ("reset", "clear", "report", "hide", "claims", "flip") and
/// settings changes ("opacity" = 80, or "win.status.on" = false).
pub static ACTIONS: Mutex<Vec<String>> = Mutex::new(Vec::new());
pub static CHANGES: Mutex<Vec<(String, Value)>> = Mutex::new(Vec::new());
/// The settings as they are now (for the menu and the window to show).
pub static SETTINGS: Mutex<Value> = Mutex::new(Value::Null);
/// The language of the windows' own sentences: the app's language (lang/<code>.json of the HUD).
pub static LANG: Mutex<String> = Mutex::new(String::new());
/// Bigger jobs from the menu or the window: ("nudge", {key, dx, dy}), ("reset", {key}), ("defaults"), ("snap", {key, where}), ("profile.save" / "profile.load" /
/// "profile.delete", name), ("claims.undo"), ("hotkey", {job, text}).
pub static OPS: Mutex<Vec<(String, Value)>> = Mutex::new(Vec::new());
/// The window being placed (or "*") and when it was last touched: shown with made-up data for a while after.
pub static EDIT: Mutex<Option<(String, Instant)>> = Mutex::new(None);
/// Where each window is on the game's screen (for the on-screen editor): {"gx","gy","gw","gh","wins":[{key,x,y,w,h,colour,on}]}.
pub static EDITRECTS: Mutex<Value> = Mutex::new(Value::Null);
const EDIT_FOR: Duration = Duration::from_secs(20);
/// Edit HUD shows every window with made-up data for this long at most (it can be switched on again)
const EDIT_MAX: Duration = Duration::from_secs(600);
/// What the pages show besides the settings: the profiles (names, the active one) and the note about the Claims reset.
pub static EXTRA: Mutex<Value> = Mutex::new(Value::Null);

const DX_MAX: f64 = 150.0;
const DY_MAX: f64 = 100.0;
const STEP: f64 = 0.5; // one click of an arrow: half a percent of the game window

fn round1(v: f64) -> f64 {
    (v * 10.0).round_ties_even() / 10.0
}
/// What free look sees, in words (for the menu): the game's own binding, whether the mouse is read, whether you are looking around now.
pub static LOOKINFO: Mutex<String> = Mutex::new(String::new());

/// "win.status.on" = false into the settings' JSON.
fn set_path(root: &mut Value, path: &str, v: Value) {
    let mut cur = root;
    let parts: Vec<&str> = path.split('.').collect();
    for (i, p) in parts.iter().enumerate() {
        if i + 1 == parts.len() {
            cur[*p] = v;
            return;
        }
        if !cur.get(*p).is_some_and(Value::is_object) {
            cur[*p] = serde_json::json!({});
        }
        cur = &mut cur[*p];
    }
}
static INFO: Mutex<Option<LiveInfo>> = Mutex::new(None);

const DRAW_EVERY: Duration = Duration::from_millis(250);
const SIDE: [i64; 5] = [1, 2, 3, 4, 99];

#[derive(Serialize, Clone, Default)]
pub struct LiveInfo {
    pub windows: usize,
    pub shown: usize,
    pub gui: i64,
    pub error: String,
}

pub fn info() -> LiveInfo {
    INFO.lock().ok().and_then(|i| i.clone()).unwrap_or_default()
}

/// hud.py seen_in: is a window of this group shown while this panel (GuiFocus) is open?
fn seen_in(group: &Value, gui: i64) -> bool {
    match group {
        Value::String(g) if g == "all" => true,
        Value::String(g) if g == "front" => !SIDE.contains(&gui),
        v => v.as_i64() == Some(gui),
    }
}

struct Slot {
    win: Win,
    key: String,
    group: Value,
    /// where the picture goes, in the game window's pixels
    rel: (i32, i32),
    /// where the next window on its plane starts
    vend: Option<f64>,
    /// the window's own picture (premultiplied RGBA) and the same as BGRA for the overlay window
    own: Picture,
    own_bgra: Vec<u8>,
    /// a boot picture is up instead of its own
    fx: bool,
    /// 1 when the mouse is away, fading to 0 as it comes near
    hover: f32,
    /// this window's own opacity (0..1), or -1 to follow the setting for all windows
    op: f32,
    /// the stacking order set by the player (not part of the picture's key)
    z: i64,
}

/// What `animate` needs: the panel open, the head's turn, the boot, whether the HUD shows, and the settings that decide how.
struct Anim {
    gui: i64,
    turn: Option<Turn>,
    turn_hidden: bool,
    boot: Option<Boot>,
    hud_shown: bool,
    fade_t0: f64,
    opacity: f32,
    hover: bool,
    t: f64,
    /// the order the shown windows were last stacked in (keys, bottom to top)
    order: Vec<String>,
}

fn now_secs() -> f64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs_f64()).unwrap_or(0.0)
}

pub fn start() {
    std::thread::Builder::new().name("GRAVITAS combat".into()).spawn(|| crate::guard::keep_running("combat", run)).ok();
}

fn clear(slots: &mut HashMap<String, Slot>) {
    for (_, s) in slots.drain() {
        unsafe {
            let _ = DestroyWindow(s.win.hwnd);
        }
    }
}

fn run() {
    let mut host: Option<Host> = None;
    let mut profiles = crate::profiles::Profiles::default();
    let ships = ship_names();
    let mut tail = crate::journal::Tail::new();
    tail.collect = true;
    let mut status_seen: Option<(SystemTime, u64)> = None;
    let (mut status_n, mut status_ts, mut status_fed) = (0u32, String::new(), Value::Null);
    // the Thargoid recorder (local file): Status.json's changes and the Journal's key events while Thargoids are about
    let mut rec = crate::thargoid_rec::Rec::new(crate::store::dir().map(|d| d.join("thargoid-rec")));
    let mut focus = crate::focus::Focus::default();
    let mut settle_at: Option<Instant> = None;
    let t_start = Instant::now();
    let mut keys: Option<crate::panelkeys::PanelKeys> = None;
    let mut hotkeys = {
        let custom: Vec<(String, String)> = crate::store::read().get("hotkeys").and_then(Value::as_object).map(|o| o.iter().filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string()))).collect()).unwrap_or_default();
        crate::hotkeys::Keys::new(&custom)
    };
    let mut ctl = crate::controls::Controls::default();
    let mut headlook: Option<Option<crate::panelkeys::HeadLook>> = None;
    let mut last_look = Instant::now();
    // free look that is a toggle cannot be read back from the game: after the game window was away or the menu was open, a press may have been missed,
    // so it is taken as OFF again (it was found out of step in the game: the windows showed in free look and hid out of it)
    let (mut was_front, mut was_menu) = (false, false);
    let mut menu_votes = 0u8;
    let mut hl_read = Instant::now();
    let mut hide_all = false;
    let mut an = Anim { gui: 0, turn: None, turn_hidden: false, boot: None, hud_shown: false, fade_t0: 0.0, opacity: 0.92, hover: true, t: 0.0, order: Vec::new() };
    let mut prev_hud_gui = 0i64;
    let mut hud_lang = String::from("en");
    // a window being snapped to an edge: (window, where, goes left): drawn, measured, shifted, until it is there
    let mut snap: Option<(String, String, u8)> = None;
    // a window being dragged with the mouse: where it was when the drag began (key, dx, dy, x, y)
    let mut drag_base: Option<(String, f64, f64, f64, f64)> = None;
    let mut set_dirty = true; // (the settings changed since the copy for the pages was made: to_json is built only then)
    let mut edit_plus_since: Option<Instant> = None; // (Edit HUD showing every window: since when)
    let mut hidden_since = Instant::now();
    let mut map_id = 0u64;
    let mut slots: HashMap<String, Slot> = HashMap::new();
    let mut last_draw = Instant::now() - DRAW_EVERY;
    let mut save_at: Option<Instant> = None; // (a settings save waiting for the changes to stop)
    let mut last_anim = Instant::now();
    let mut game = Game::NotRunning;
    loop {
        unsafe {
            let mut msg = MSG::default();
            while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
                DispatchMessageW(&msg);
            }
        }
        if !(ENABLED.load(Ordering::Relaxed) || THARGOID_ON.load(Ordering::Relaxed) || FOOT_ON.load(Ordering::Relaxed) || DEBRIEF_ON.load(Ordering::Relaxed) || PVP_ON.load(Ordering::Relaxed)) {
            crate::inputs::set_active(false);
            if !slots.is_empty() {
                clear(&mut slots);
                an.boot = None;
                an.hud_shown = false;
                set_info(0, 0, focus.hud_gui, "");
            }
            // (the menu key works with the Combat overlay off too: it is how a new user turns it on)
            for k in hotkeys.pressed(&crate::panelkeys::key_down) {
                if k == "menu" { crate::menu::request_toggle(); }
                if k == "app" { crate::menu::request_show_main(); }
            }
            std::thread::sleep(Duration::from_millis(50));
            continue;
        }
        if host.is_none() {
            match Host::new(false) {
                Ok(mut h) => {
                    // what was saved: the settings, the ship profiles, the line Claims was reset at
                    let saved = crate::store::read();
                    if let Some(c) = saved.get("combat_settings") { h.set.apply_json(c); }
                    h.set.removed = vec!["target"]; // the Target card is gone: the game's own is used
                    profiles = crate::profiles::Profiles::from_json(&saved);
                    { let (b, older, src) = crate::store::load_claims_base(); crate::store::log(&format!("claims base: loaded at start '{b}' (from {src}, {} older)", older.len())); if !b.is_empty() { h.claims.set_base(&b); } h.claims.set_older(older); }
                    h.key_texts = hotkeys.hint_texts(); h.key_texts.extend(hotkeys.map_texts()); // (the footers name the keys the player set)
                    host = Some(h);
                }
                Err(e) => {
                    set_info(0, 0, 0, &e);
                    std::thread::sleep(Duration::from_secs(2));
                    continue;
                }
            }
        }
        let h = host.as_mut().unwrap();
        // the windows speak the app's language
        if let Ok(l) = LANG.lock() {
            if !l.is_empty() && *l != hud_lang {
                hud_lang = l.clone();
                h.tr = crate::i18n::I18n::new(&hud_lang);
                last_draw = Instant::now() - DRAW_EVERY;
            }
        }
        // a window being placed shows (with made-up data) while it is touched and for a while after
        h.edit = EDIT.lock().ok().and_then(|e| e.as_ref().filter(|(_, t)| t.elapsed() < EDIT_FOR).map(|(k, _)| k.clone()));
        // the menu open = the on-screen editor: every window that is on shows (with made-up data) so each can be moved with the mouse
        // (only while the menu window is really on screen, and for 10 minutes at most: made-up data must never stay over a real game)
        let editing_all = crate::menu::is_open() && crate::menu::edit_hud() && crate::menu::window_visible();
        if editing_all {
            let since = *edit_plus_since.get_or_insert_with(Instant::now);
            if since.elapsed() > EDIT_MAX {
                edit_plus_since = None;
                crate::menu::store_edit_hud(false); // (the guard hides the editor layer; Edit HUD can be switched on again)
                crate::store::log("Edit HUD ended after 10 minutes");
            } else if h.edit.as_deref() != Some("*") { h.edit = Some("+".into()); }
        } else { edit_plus_since = None; }
        h.edit_chip = true;
        h.combat_enabled = ENABLED.load(Ordering::Relaxed);
        h.th_on = THARGOID_ON.load(Ordering::Relaxed);
        h.foot_on = FOOT_ON.load(Ordering::Relaxed);
        h.db.on = DEBRIEF_ON.load(Ordering::Relaxed);
        h.db.rules_on = DEBRIEF_RULES.load(Ordering::Relaxed);
        h.pvp.on = PVP_ON.load(Ordering::Relaxed);
        h.pvp.shield_end = PVP_SHIELD.load(Ordering::Relaxed);
        h.pvp.build_in = PVP_BUILD.load(Ordering::Relaxed);
        // Preview is a look at made-up fights: it turns itself off after 3 minutes, so it can never stay on over a real game by mistake
        if h.preview && now_secs() - h.preview_t0 > 180.0 { PREVIEW.store(false, Ordering::Relaxed); }
        if PREVIEW.load(Ordering::Relaxed) != h.preview {
            h.preview = !h.preview;
            h.preview_t0 = now_secs(); // the COMBAT banner shows first, then the report
            last_draw = Instant::now() - DRAW_EVERY;
        }
        // Status.json: looked at every step (its time and size only), read when it changed and every 12th look anyway
        // (two writes close together can show one time): the windows go with the game's panels at once
        if let Some(f) = tail.folder() {
            let path = f.join("Status.json");
            if let Ok(md) = std::fs::metadata(&path) {
                let seen = (md.modified().unwrap_or(UNIX_EPOCH), md.len());
                status_n = status_n.wrapping_add(1);
                if Some(seen) != status_seen || (status_n % 12 == 0 && !matches!(game, Game::NotRunning)) { // (no game: only a changed file is read)
                    if md.len() > 1_000_000 { status_seen = Some(seen); } // (Status.json is a few hundred bytes: a huge file is not ours and is not read)
                    else if let Some(v) = { let r = std::fs::read_to_string(&path).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()); crate::drift::status_read(r.is_some()); r } {
                        let rewritten = Some(seen) != status_seen; // (a newer file on disk is newer even when the clock went back)
                        status_seen = Some(seen);
                        let ts = v.get("timestamp").and_then(Value::as_str).unwrap_or("").to_string();
                        // (drift::status_in: a Flags that is missing or wrongly typed keeps the previous flags; another event name with a Flags is taken too; all counted)
                        let sin = crate::drift::status_in(&v, h.flags, h.flags2);
                        if sin.accept && (ts >= status_ts || rewritten) {
                            status_ts = ts;
                            h.flags = sin.flags;
                            h.flags2 = sin.flags2;
                            let acts = focus.set_gui(sin.gui, t_start.elapsed().as_secs_f64());
                            if crate::devenv::var_os("GRAVITAS_TRACE").is_some() { crate::store::log(&format!("trace GuiFocus {} -> hud_gui {} hold {:?} looking {}", sin.gui, focus.hud_gui, focus.hold, h.looking)); }
                            carry_out(&acts, &mut last_draw, &mut settle_at);
                            rec.status(Some(&v), now_secs());
                            h.th.status(h.flags, now_secs());
                            h.db.status(&v, crate::debrief::parse_ts(&v, now_secs()));
                            h.pvp.status(&v, crate::debrief::parse_ts(&v, now_secs()));
                            if v != status_fed {
                                h.eng.status(&v.to_string());
                                status_fed = v;
                            }
                        }
                    }
                }
            }
        }
        // DEBRIEF: the ship keys are followed only while it is wanted (the game in front, you in the ship, no panel or menu open), else nothing is read
        {
            let front = matches!(overlay::game_rect(), Game::Window { front: true, .. });
            let want = h.db.want(h.flags, h.flags2, focus.hud_gui, front, h.game_menu);
            crate::inputs::set_active(want);
            h.db.follow(want, now_secs());
            if h.db.map.is_none() || want { h.db.map = crate::inputs::map(); }
            for it in crate::inputs::take() { h.db.input(it); }
        }
        if settle_at.is_some_and(|t| Instant::now() >= t) {
            settle_at = None;
            let acts = focus.settle();
            carry_out(&acts, &mut last_draw, &mut settle_at);
        }
        // bigger jobs: nudge, snap, reset, defaults, profiles, the Claims reset, the keys
        let ops: Vec<(String, Value)> = OPS.lock().map(|mut o| o.drain(..).collect()).unwrap_or_default();
        for (name, v) in ops {
            let key = v.get("key").and_then(Value::as_str).unwrap_or("").to_string();
            let see = |_p: &AtomicBool, _e: &AtomicBool| { if let Ok(mut e) = EDIT.lock() { *e = Some((if name == "defaults" { "*".to_string() } else { key.clone() }, Instant::now())); } };
            match name.as_str() {
                "nudge" => {
                    let (dx, dy) = (v["dx"].as_f64().unwrap_or(0.0), v["dy"].as_f64().unwrap_or(0.0));
                    let auto = h.set.auto;
                    if let Some((_, w)) = h.set.win.iter_mut().find(|(k, _)| *k == key.as_str()) {
                        if auto {
                            w.dx = round1((w.dx + dx * STEP).clamp(-DX_MAX, DX_MAX));
                            w.dy = round1((w.dy + dy * STEP).clamp(-DY_MAX, DY_MAX));
                        } else {
                            w.x = round1((w.x + dx * STEP).clamp(0.0, 98.0));
                            w.y = round1((w.y + dy * STEP).clamp(0.0, 98.0));
                        }
                        see(&PREVIEW, &ENABLED);
                    }
                }
                "move" => {
                    // dragged with the mouse: pixels of the game's window; offsets are a percent of its height (as the arrows), a free window a percent of each side
                    let (px, py) = (v["dx"].as_f64().unwrap_or(0.0), v["dy"].as_f64().unwrap_or(0.0));
                    let (gw, gh) = (v["gw"].as_f64().unwrap_or(1.0).max(1.0), v["gh"].as_f64().unwrap_or(1.0).max(1.0));
                    let auto = h.set.auto;
                    if let Some((_, w)) = h.set.win.iter_mut().find(|(k, _)| *k == key.as_str()) {
                        if auto {
                            w.dx = round1((w.dx + px / gh * 100.0).clamp(-DX_MAX, DX_MAX));
                            w.dy = round1((w.dy + py / gh * 100.0).clamp(-DY_MAX, DY_MAX));
                        } else {
                            w.x = round1((w.x + px / gw * 100.0).clamp(0.0, 98.0));
                            w.y = round1((w.y + py / gh * 100.0).clamp(0.0, 98.0));
                        }
                    }
                }
                "drag_begin" => {
                    drag_base = h.set.win.iter().find(|(k, _)| *k == key.as_str()).map(|(k, w)| (k.to_string(), w.dx, w.dy, w.x, w.y));
                    if crate::devenv::var_os("GRAVITAS_TRACE").is_some() { crate::store::log(&format!("trace drag_begin {key} base {:?}", drag_base)); }
                }
                "drag_to" => {
                    // the whole way from where the drag began, so the window follows the mouse without the rounding adding up
                    let (px, py) = (v["dx"].as_f64().unwrap_or(0.0), v["dy"].as_f64().unwrap_or(0.0));
                    let (gw, gh) = (v["gw"].as_f64().unwrap_or(1.0).max(1.0), v["gh"].as_f64().unwrap_or(1.0).max(1.0));
                    let auto = h.set.auto;
                    if crate::devenv::var_os("GRAVITAS_TRACE").is_some() { crate::store::log(&format!("trace drag_to {key} px ({px},{py}) base {:?}", drag_base)); }
                    if let Some((bk, bdx, bdy, bx, by)) = drag_base.clone().filter(|b| b.0 == key) {
                        if let Some((_, w)) = h.set.win.iter_mut().find(|(k, _)| *k == bk.as_str()) {
                            if auto {
                                w.dx = round1((bdx + px / gh * 100.0).clamp(-DX_MAX, DX_MAX));
                                w.dy = round1((bdy + py / gh * 100.0).clamp(-DY_MAX, DY_MAX));
                            } else {
                                w.x = round1((bx + px / gw * 100.0).clamp(0.0, 98.0));
                                w.y = round1((by + py / gh * 100.0).clamp(0.0, 98.0));
                            }
                        }
                    }
                }
                "editor.lock" => {
                    // Lock: the windows as they are now go into the active profile (when there is one; the settings file has them anyway)
                    let name = profiles.active.clone();
                    if !name.is_empty() { profiles.save(&name, &h.set); }
                }
                "reset" => {
                    // a real reset of this window: place, colour, when, perspective, ground, size, opacity and stacking order as GRAVITAS starts it
                    // (on or off stays as it is)
                    let d = crate::host::Settings::default();
                    if let Some((_, w)) = h.set.win.iter_mut().find(|(k, _)| *k == key.as_str()) {
                        if let Some((_, dw)) = d.win.iter().find(|(dk, _)| *dk == key.as_str()) { reset_window(w, dw); }
                        see(&PREVIEW, &ENABLED);
                    }
                }
                "defaults" => {
                    // the windows as GRAVITAS starts them: on the game's panels, in their places, in the game's orange
                    let d = crate::host::Settings::default();
                    h.set.auto = true;
                    for (k, w) in h.set.win.iter_mut() {
                        if let Some((_, dw)) = d.win.iter().find(|(dk, _)| dk == k) { *w = dw.clone(); }  // (everything, z too; on/off as GRAVITAS starts them)
                    }
                    see(&PREVIEW, &ENABLED);
                }
                "zorder" => {
                    let front = v.get("dir").and_then(Value::as_str) != Some("back");
                    if h.set.win.iter().any(|(k, _)| *k == key.as_str()) {
                        z_move(&mut h.set.win, &key, front);
                        see(&PREVIEW, &ENABLED);
                    }
                }
                "snap" => {
                    snap = Some((key.clone(), v["where"].as_str().unwrap_or("centre").to_string(), 4));
                    see(&PREVIEW, &ENABLED);
                }
                "profile.save" => { profiles.save(v.as_str().unwrap_or(""), &h.set); }
                "profile.load" => { profiles.load(v.as_str().unwrap_or(""), &mut h.set); }
                "profile.delete" => profiles.delete(v.as_str().unwrap_or("")),
                "claims.undo" => {
                    let b = h.claims.undo_reset(); // the reset before it (a stack of the last 5), or nothing
                    crate::store::log(&format!("claims base: undo, now '{b}'"));
                    crate::store::save_claims_base(&b, h.claims.older());
                }
                "hotkey" => {
                    let (job, text) = (v["job"].as_str().unwrap_or("").to_string(), v["text"].as_str().unwrap_or("").to_string());
                    if (text.is_empty() || crate::hotkeys::parse(&text).is_some()) && crate::hotkeys::JOBS.contains(&job.as_str()) {
                        let mut saved = crate::store::read().get("hotkeys").and_then(Value::as_object).cloned().unwrap_or_default();
                        saved.insert(job, Value::String(text));
                        crate::store::set(&[("hotkeys", Value::Object(saved.clone()))]);
                        let custom: Vec<(String, String)> = saved.iter().filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string()))).collect();
                        hotkeys = crate::hotkeys::Keys::new(&custom);
                        h.key_texts = hotkeys.hint_texts(); h.key_texts.extend(hotkeys.map_texts()); // (the footers show the new key at once)
                    }
                }
                _ => {}
            }
            // every change of a window is kept in the active profile at once
            if ["move", "drag_to", "nudge", "reset", "defaults", "zorder"].contains(&name.as_str()) && !profiles.active.is_empty() {
                let a = profiles.active.clone();
                profiles.save(&a, &h.set);
            }
            set_dirty = true;
            if name == "drag_to" || name == "drag_begin" {
                // a drag sends about 20 of these a second: the file (and its backup copy) is written when they stop, like the sliders' changes
                save_at = Some(Instant::now());
            } else {
                crate::store::set(&[("combat_settings", h.set.to_json()), ("profiles", profiles.to_json()["profiles"].clone()), ("profile_active", Value::String(profiles.active.clone()))]);
            }
            last_draw = Instant::now() - DRAW_EVERY;
        }
        if let Ok(mut e) = EXTRA.lock() {
            *e = serde_json::json!({"profiles": {"names": profiles.names(), "active": profiles.active}, "claims_reset": h.claims.base_local()});
        }
        // settings changed from the menu or the window: applied, kept, shown again
        let changes: Vec<(String, Value)> = CHANGES.lock().map(|mut c| c.drain(..).collect()).unwrap_or_default();
        if !changes.is_empty() {
            let mut cur = h.set.to_json();
            let by_hand = changes.iter().any(|(k, _)| k == "size_pct") && !changes.iter().any(|(k, _)| k == "size_auto");
            for (k, v) in changes { set_path(&mut cur, &k, v); }
            if by_hand { cur["size_auto"] = Value::Bool(false); } // a size set by hand ends Auto
            h.set.apply_json(&cur);
            set_dirty = true;
            // and kept in the active profile (what you set stays with the profile)
            if !profiles.active.is_empty() { let a = profiles.active.clone(); profiles.save(&a, &h.set); }
            save_at = Some(Instant::now()); // (written when the changes stop: a slider sends about 11 a second, each write is also copied to the backup folder)
            last_draw = Instant::now() - DRAW_EVERY;
        }
        if save_at.is_some_and(|t| t.elapsed() >= Duration::from_millis(400)) {
            save_at = None;
            crate::store::set(&[("combat_settings", h.set.to_json()), ("profiles", profiles.to_json()["profiles"].clone())]);
        }
        // a new System map picture (mapcap.rs): the window is painted again at once, not at the next 250 ms look
        { let mid = crate::mapcap::current().map(|c| c.id).unwrap_or(0); if mid != map_id { map_id = mid; last_draw = Instant::now() - DRAW_EVERY; } }
        if set_dirty {
            set_dirty = false;
            let cur = h.set.to_json();
            if let Ok(mut s) = SETTINGS.lock() { if s.is_null() || *s != cur { *s = cur; } }
        }
        // free look and the keys (load.py look_loop, every 50 ms)
        if last_look.elapsed() >= Duration::from_millis(50) {
            last_look = Instant::now();
            focus.keep = h.set.keep_hidden_in_panel;
            if h.set.look_hide { crate::rawmouse::start(); }
            // the game's free look binding is read again every 3 s: a change in the game's options (Toggle to Hold) is taken at once, no restart
            if hl_read.elapsed() >= Duration::from_secs(3) {
                hl_read = Instant::now();
                let fresh = crate::panelkeys::binds_file(&crate::panelkeys::binds_dir()).and_then(|p| std::fs::read(p).ok()).and_then(|b| crate::panelkeys::headlook(&String::from_utf8_lossy(&b)));
                if headlook.as_ref().is_some_and(|old| *old != fresh) { ctl.looking = false; ctl.look_toggle = false; ctl.look_held = false; last_draw = Instant::now() - DRAW_EVERY; }
                headlook = Some(fresh);
            }
            let hl = headlook.get_or_insert_with(|| {
                crate::panelkeys::binds_file(&crate::panelkeys::binds_dir()).and_then(|p| std::fs::read(p).ok()).and_then(|b| crate::panelkeys::headlook(&String::from_utf8_lossy(&b)))
            }).clone();
            let cfg = crate::controls::Cfg {
                look_on: h.set.look_hide, look_btn: h.set.look_btn.clone(), look_hold: h.set.look_hold, keys_on: h.set.keys, report_s: h.set.report_s,
                report_win_on: h.set.win.iter().any(|(k, w)| *k == "report" && w.on), headlook: hl, mouse_ok: crate::rawmouse::ok(), hold_panel: focus.hold.is_some(),
            };
            let mut pressed = hotkeys.pressed(&crate::panelkeys::key_down);
            crate::menu::guard();
            if pressed.iter().any(|k| k == "menu") { crate::menu::request_toggle(); }
            if pressed.iter().any(|k| k == "app") { crate::menu::request_show_main(); }
            pressed.retain(|k| k != "menu" && k != "app" && !k.starts_with("map_"));
            // Restore claims / Show claims: from the keys (only while the keys are on) and from the buttons (always)
            let mut claim_jobs: Vec<String> = if h.set.keys { pressed.iter().filter(|k| k.starts_with("claims_")).cloned().collect() } else { Vec::new() };
            pressed.retain(|k| !k.starts_with("claims_"));
            if let Ok(mut a) = ACTIONS.lock() { for k in a.drain(..) { if k.starts_with("claims_") { claim_jobs.push(k); } else { pressed.push(k); } } }
            for j in claim_jobs {
                if j == "claims_restore" {
                    let b = h.claims.restore();
                    crate::store::log("claims base: restored (the reset line and its stack removed, Claims worked out again from the Journals)");
                    crate::store::save_claims_base(&b, h.claims.older());
                    h.show_claims(now_secs(), true);
                } else {
                    h.show_claims(now_secs(), false);
                }
                last_draw = Instant::now() - DRAW_EVERY;
            }
            if h.set.keys && pressed.iter().any(|k| k == "report_clear") { h.shown = None; } // (a past report shown from Past combats goes with it; its list is not touched)
            let mouse = crate::rawmouse::take();
            let front = matches!(overlay::game_rect(), Game::Window { front: true, .. });
            let menu_now = crate::menu::is_open();
            // the game's own menu (Esc, Options): the cursor shows only there (not in flight, not over the cockpit panels); steady for 3 looks (150 ms)
            {
                let seen = front && !menu_now && overlay::cursor_showing();
                if seen == h.game_menu { menu_votes = 0; } else { menu_votes += 1; if menu_votes >= 3 { h.game_menu = seen; menu_votes = 0; last_draw = Instant::now() - DRAW_EVERY; } }
            }
            if (front && !was_front) || (was_menu && !menu_now) {
                if ctl.looking || ctl.look_toggle { ctl.looking = false; ctl.look_toggle = false; last_draw = Instant::now() - DRAW_EVERY; }
            }
            was_front = front; was_menu = menu_now;
            ctl.report_until = h.report_until;
            ctl.report_auto = h.report_auto;
            ctl.last_view = h.last_view.clone();
            let outs = {
                let ev = || h.eng.view();
                let mut inp = crate::controls::In {
                    front, gui: focus.gui, in_cockpit: h.in_cockpit(), keys: &pressed, mouse: &mouse, state: &crate::panelkeys::key_state,
                    perf: t_start.elapsed().as_secs_f64(), wall: now_secs(), engine_view: &ev, engine_ok: true, guess: &mut focus.guess,
                };
                ctl.step(&cfg, &mut inp)
            };
            h.report_until = ctl.report_until;
            h.report_auto = ctl.report_auto;
            h.last_view = ctl.last_view.clone();
            h.cleared = ctl.cleared.clone();
            for o in outs {
                use crate::controls::Out;
                match o {
                    Out::Hide => {}
                    Out::Draw => last_draw = Instant::now() - DRAW_EVERY,
                    Out::SetFocus(g) => {
                        let mut acts = Vec::new();
                        focus.set_focus(g, &mut acts);
                        carry_out(&acts, &mut last_draw, &mut settle_at);
                    }
                    Out::CounterReset => h.counter.reset(),
                    Out::ClaimsReset => {
                        let base = h.claims.reset_at(now_secs() as i64); // kept, so a restart does not bring the old figure back
                        crate::store::log(&format!("claims base: set by reset key '{base}'"));
                        crate::store::save_claims_base(&base, h.claims.older());
                    }
                    Out::EngineClear => h.eng.clear(),
                    Out::ReportClear => h.shown = None,
                }
            }
            if ctl.looking && !h.looking { focus.look_started(); if crate::devenv::var_os("GRAVITAS_TRACE").is_some() { crate::store::log(&format!("trace free look began: gui {} hud_gui {} hold {:?}", focus.gui, focus.hud_gui, focus.hold)); } } // (free look just began: an open side panel is remembered)
            h.looking = ctl.looking;
            h.key_hidden = ctl.key_hidden;
            if let Ok(mut li) = LOOKINFO.lock() {
                *li = format!("{} · mouse reading: {} · looking now: {} · HUD hidden by key: {}",
                    cfg.headlook.as_ref().map(|x| x.label.clone()).unwrap_or_else(|| "the game's free look binding was not read (Mouse 3, hold, is assumed)".into()),
                    if crate::rawmouse::ok() { "yes" } else { "NO (the button is looked at the old way)" }, if ctl.looking { "yes" } else { "no" }, if ctl.key_hidden { "yes" } else { "no" });
            }
        }
        h.gui = focus.gui;
        h.guess_gui = focus.guess.map(|g| g.0);
        // a panel key just pressed in the ship: the windows go with it now, before Status.json says so (load.py guess_panel)
        let pk = keys.get_or_insert_with(|| crate::panelkeys::PanelKeys::load(&crate::panelkeys::binds_dir()));
        if pk.ok && h.in_cockpit() {
            let front = matches!(overlay::game_rect(), Game::Window { front: true, .. });
            let now = t_start.elapsed().as_secs_f64();
            let g = pk.guess(focus.hud_gui, &crate::panelkeys::key_down);
            let acts = match g {
                Some(g) if front => focus.guessed(g, now),
                _ => focus.expire(now),
            };
            carry_out(&acts, &mut last_draw, &mut settle_at);
        }
        if last_draw.elapsed() >= DRAW_EVERY {
            last_draw = Instant::now();
            let now = now_secs();
            tail.poll();
            // a past report asked for in the Past combats window: on the HUD for 20 s
            if let Some(v) = crate::history::SHOW.lock().ok().and_then(|mut s| s.take()) {
                let mut v = v;
                v["past"] = Value::Bool(true);
                h.shown = Some((v, now + 20.0));
            }
            // a kept Xeno Hunt asked for in the Past Thargoid window: its report on the HUD for 20 s
            if let Some(v) = crate::history::THSHOW.lock().ok().and_then(|mut s| s.take()) {
                if let Some(hunt) = crate::thargoid::Hunt::from_value(&v) { h.th.show(hunt, now); }
            }
            let (past, live): (Vec<_>, Vec<_>) = tail.take().into_iter().partition(|(_, live)| !*live);
            if !past.is_empty() {
                // the older Journals are read in the background for Claims (what you still carry, back to the last death)
                h.claims.start(tail.folder().map(|p| p.as_path()), tail.path().map(|p| p.as_path()));
                h.bonds.start(tail.folder().map(|p| p.as_path()), tail.path().map(|p| p.as_path()));
                h.catch_up(&past.into_iter().map(|(v, _)| v).collect::<Vec<_>>());
            }
            for (v, _) in &live {
                rec.journal(v, now);
                h.handle(v, now);
                if v.get("event").and_then(Value::as_str) == Some("Loadout") {
                    // boarding a ship that has a profile of its own (named after its type or its name): that profile
                    let sh = |k: &str| v.get(k).and_then(Value::as_str);
                    let kind = ships.get(&sh("Ship").unwrap_or("").to_lowercase()).map(String::as_str).or(sh("Ship_Localised")).or(sh("Ship")).unwrap_or("");
                    if let Some(name) = profiles.for_ship(&[Some(kind), sh("ShipName"), sh("ShipIdent"), sh("Ship")]) {
                        if name != profiles.active && profiles.load(&name, &mut h.set) {
                            set_dirty = true;
                            crate::store::set(&[("combat_settings", h.set.to_json()), ("profile_active", Value::String(name))]);
                            last_draw = Instant::now() - DRAW_EVERY;
                        }
                    }
                }
            }
            if !live.is_empty() { rec.status(None, now_secs()); } // (the Journal lines that matter, beside the Status.json changes)
            game = overlay::game_rect();
            let tick = h.draw(now);
            // fights that just ended with a report are kept in Past combats
            if !h.finished.is_empty() {
                if let Ok(mut hist) = crate::history::HISTORY.lock() {
                    if let Some(hist) = hist.as_mut() {
                        for v in h.finished.drain(..) {
                            // a fight that was really a Xeno Hunt belongs to Past Thargoid (its kills are bonds, not ships)
                            let ms = |k: &str| v.get("ep").and_then(|e| e.get(k)).and_then(Value::as_f64).unwrap_or(0.0) / 1000.0;
                            let (from, to) = (ms("t0"), ms("t1").max(ms("t0")));
                            if h.th.overlaps(from, to) { continue; }
                            hist.add(&v);
                        }
                    }
                }
            }
            if !h.th.past_ok || !h.th.finished.is_empty() {
                if let Ok(mut hist) = crate::history::THIST.lock() {
                    if let Some(hist) = hist.as_mut() {
                        for hunt in h.th.finished.drain(..) { hist.add(&hunt.to_value()); }
                        // the report compares a hunt with the ones kept here
                        h.th.past = hist.items.iter().filter_map(crate::thargoid::Hunt::from_value).collect();
                        h.th.past_ok = true;
                    }
                }
            }
            // PVP: a fight that is over becomes a file (XXX_vs_YYY_fight_N.gravitas) in the app's pvp folder
            for mut f in h.pvp.finished.drain(..) {
                match crate::pvpstore::save(&mut f) { Ok(n) => crate::store::log(&format!("pvp fight saved: {n}")), Err(e) => crate::store::log(&format!("pvp fight not saved: {e}")) }
            }
            // DEBRIEF: a finished record is kept (debriefs.json), and one asked for in the app's window shows on the HUD for a while
            if !h.db.finished.is_empty() {
                if let Ok(mut hist) = crate::history::DHIST.lock() {
                    if let Some(hist) = hist.as_mut() { for v in h.db.finished.drain(..) { hist.add(&v); } }
                }
                h.db.finished.clear();
            }
            if let Some(v) = crate::history::DSHOW.lock().ok().and_then(|mut s| s.take()) {
                if let Some(r) = crate::debrief::Rec::from_value(&v) { h.db.last = Some((r, now_secs() + crate::debrief::REPORT_S)); }
            }
            // Preview and a past report show also while this app's window is in front (to see what is set), as the plugin did over EDMC's
            // the windows show over the GAME only: while it is in front, or while the GRAVITAS menu (over the game) is open; never over the desktop
            let force = crate::menu::is_open();
            let (items, in_front, size) = match (&tick.items, game) {
                (Some(items), Game::Window { w, h, front, .. }) => (items.clone(), front || force, (w as f64, h as f64)),
                _ => (Vec::new(), false, (0.0, 0.0)),
            };
            if items.is_empty() || size.0 == 0.0 {
                // nothing to show (not in the cockpit, free look, a map, hidden by key): the windows fade out and stay ready for a while
                if !hide_all { hide_all = true; hidden_since = Instant::now(); }
                if hidden_since.elapsed() > Duration::from_secs(60) { clear(&mut slots); }
            } else {
                hide_all = false;
                if in_front || !slots.is_empty() { layout(&h.tr, &items, size, &mut slots, if h.set.size_auto { pieces::auto_pct(size.1) } else { h.set.size_pct as f64 } / 100.0, h.set.bg, &h.set.win.iter().map(|(k, w)| (k.to_string(), (w.persp, w.ground, w.size, w.opacity, w.z))).collect(), &mut an.boot); }
                // (written AFTER the layout, so the boxes of the editor are where the windows are NOW: written before it they lagged one move behind)
                if crate::menu::is_open() && crate::menu::edit_hud() {
                    let g = match game { Game::Window { x, y, w, h, .. } => (x, y, w, h), _ => (0, 0, 0, 0) };
                    // (in the stacking order, bottom to top: the editor stacks and hit-tests its boxes the same way; the EDIT HUD chip is not a window to move)
                    let ord = stack_order(slots.iter().filter(|(k, sl)| sl.own.w > 0 && k.as_str() != "editchip").map(|(k, sl)| (k.as_str(), sl.z, sl.own.w as i64 * sl.own.h as i64)).collect());
                    let wins: Vec<Value> = ord.iter().filter_map(|k| slots.get(k).map(|sl| (k, sl))).map(|(k, sl)| {
                        let col = h.set.win.iter().find(|(wk, _)| *wk == k.as_str()).map(|(_, w)| w.colour.clone()).unwrap_or_default();
                        serde_json::json!({"key": k, "x": sl.rel.0, "y": sl.rel.1, "w": sl.own.w, "h": sl.own.h, "colour": col, "z": sl.z})
                    }).collect();
                    if let Ok(mut r) = EDITRECTS.lock() { *r = serde_json::json!({"gx": g.0, "gy": g.1, "gw": g.2, "gh": g.3, "wins": wins}); }
                }
                // snapping: where the window is now against the edge asked for (hud.py snap in load.py)
                if let Some((k, wh, left)) = snap.take() {
                    let mut done = true;
                    if let Some(sl) = slots.get(&k) {
                        let (gw, gh) = size;
                        let (x, y, iw, ih) = (sl.rel.0 as f64, sl.rel.1 as f64, sl.own.w as f64, sl.own.h as f64);
                        let m = crate::pyval::round(0.015 * gw) as f64;
                        let (dx, dy) = match wh.as_str() { "left" => (m - x, 0.0), "right" => (gw - m - iw - x, 0.0), "top" => (0.0, m - y), "bottom" => (0.0, gh - m - ih - y), _ => ((gw - iw) / 2.0 - x, 0.0) };
                        if (dx.abs() >= 2.0 || dy.abs() >= 2.0) && left > 0 {
                            let auto = h.set.auto;
                            set_dirty = true;
                            if let Some((_, w)) = h.set.win.iter_mut().find(|(wk, _)| *wk == k.as_str()) {
                                if auto {
                                    w.dx = round1((w.dx + dx / gh * 100.0).clamp(-DX_MAX, DX_MAX));
                                    w.dy = round1((w.dy + dy / gh * 100.0).clamp(-DY_MAX, DY_MAX));
                                } else {
                                    w.x = round1((w.x + dx / gw * 100.0).clamp(0.0, 98.0));
                                    w.y = round1((w.y + dy / gh * 100.0).clamp(0.0, 98.0));
                                }
                            }
                            snap = Some((k.clone(), wh.clone(), left - 1));
                            done = false;
                            last_draw = Instant::now() - DRAW_EVERY;
                        }
                    }
                    if done { crate::store::set(&[("combat_settings", h.set.to_json())]); }
                }
                if h.need_boot && in_front && !slots.is_empty() {
                    // back in the cockpit, or Preview on: every window boots up as a hologram, one after another from the top
                    h.need_boot = false;
                    if h.set.boot {
                    let mut order: Vec<(&String, &Slot)> = slots.iter().collect();
                    order.sort_by_key(|(_, s)| (s.rel.1, s.rel.0));
                    an.boot = Some(Boot::new(t_start.elapsed().as_secs_f64(), order.iter().enumerate().map(|(i, (k, _))| ((*k).clone(), i as f64 * bootfx::STAGGER)).collect(), 1.0));
                    }
                }
            }
        }
        let dt = last_anim.elapsed().as_secs_f32() * 1000.0;
        last_anim = Instant::now();
        // the menu open counts as the game being in front: the windows stay visible while you change them
        let force_front = crate::menu::is_open();
        let t = t_start.elapsed().as_secs_f64();
        let front_now = matches!(game, Game::Window { front: true, .. });
        let hud_shown = !slots.is_empty() && !hide_all && (front_now || !h.set.front || force_front);
        if hud_shown && !an.hud_shown { an.fade_t0 = t; } // the HUD showing again: soft
        an.hud_shown = hud_shown;
        an.t = t;
        an.gui = focus.hud_gui;
        an.opacity = h.set.opacity as f32 / 100.0;
        if focus.hud_gui != prev_hud_gui {
            // a panel opened or closed: the windows go with the head's turn (hud.set_focus); the ones that come into view boot up
            let (old, new) = (prev_hud_gui, focus.hud_gui);
            prev_hud_gui = new;
            an.turn = Some(Turn { t0: t, old, new });
            an.turn_hidden = !hud_shown;
            let mut order: Vec<(&String, &Slot)> = slots.iter().collect();
            order.sort_by_key(|(_, s)| (s.rel.1, s.rel.0));
            let mut starts = Vec::new();
            for (k, s) in order {
                if anim::seen_in(&s.group, new) && !anim::seen_in(&s.group, old) {
                    let from = if s.group.as_str() == Some("front") { anim::IN_FRONT.0 } else { anim::IN_PANEL.0 };
                    starts.push((k.clone(), from + starts.len() as f64 * bootfx::STAGGER * 0.5));
                }
            }
            if !starts.is_empty() && h.set.boot { an.boot = Some(Boot::new(t, starts, 0.8)); }
        }
        let active = animate(&mut slots, game, &mut an, dt);
        let shown = slots.values().filter(|s| s.win.shown).count();
        set_info(slots.len(), shown, focus.hud_gui, "");
        // (15 ms while a Thargoid recording runs: Status.json is looked at that often, as the Journal is; the game itself writes it about once a second)
        std::thread::sleep(Duration::from_millis(if active || rec.running(now_secs()) { 15 } else { 100 }));
    }
}

/// What the focus state machine asked for.
fn carry_out(acts: &[crate::focus::Act], last_draw: &mut Instant, settle_at: &mut Option<Instant>) {
    use crate::focus::Act;
    for a in acts {
        match a {
            Act::Draw => *last_draw = Instant::now() - DRAW_EVERY, // drawn at the next step
            Act::After(ms) => *settle_at = Some(Instant::now() + Duration::from_millis(*ms as u64)),
            Act::Focus(_) | Act::LookReset => {} // (the windows read the panel from the focus itself; free look comes with its own slice)
        }
    }
}

/// The ships' names as the game shows them, by the id the Journal gives (the combat engine's own table): "python_nx" is "Python Mk II".
pub fn ship_names() -> HashMap<String, String> {
    let js = include_str!("../engine/combat-engine.js");
    let (Some(a), Some(_)) = (js.find("const CB_SHIPS = {"), js.find("};")) else { return HashMap::new() };
    let block = &js[a..];
    let block = &block[..block.find("};").unwrap_or(block.len())];
    let re = regex::Regex::new(r#"(\w+):\s*"([^"]+)""#).unwrap();
    re.captures_iter(block).map(|c| (c[1].to_string(), c[2].to_string())).collect()
}

/// This app's own window is the one in front (hud.py ours_in_front).
fn app_in_front() -> bool {
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};
    unsafe {
        let mut pid = 0u32;
        GetWindowThreadProcessId(GetForegroundWindow(), Some(&mut pid));
        pid == std::process::id()
    }
}

fn set_info(windows: usize, shown: usize, gui: i64, error: &str) {
    if let Ok(mut i) = INFO.lock() {
        *i = Some(LiveInfo { windows, shown, gui, error: error.into() });
    }
}

/// Make (or keep) every window's picture. A window is drawn again only when what decides its picture changed.
fn layout(tr: &crate::i18n::I18n, items: &[Value], size: (f64, f64), slots: &mut HashMap<String, Slot>, user_scale: f64, bg: bool, look: &HashMap<String, (bool, i64, i64, i64, i64)>, boot: &mut Option<Boot>) {
    let (w, h) = size;
    let s0 = pieces::scale(h, user_scale);
    let mut cursor: HashMap<String, f64> = HashMap::new();
    let mut keep: Vec<String> = Vec::new();
    for it in items {
        let Some(a) = it.as_array() else { continue };
        let Some(k) = a[0].as_str() else { continue };
        let m = &a[1];
        if m.is_null() {
            continue;
        }
        let (xp, yp) = (a[2].as_f64().unwrap_or(0.0), a[3].as_f64().unwrap_or(0.0));
        let col = a[4].as_str().unwrap_or("#ff7100");
        let sh = a[5].as_array().map(|v| (v[0].as_f64().unwrap_or(0.0), v[1].as_i64().unwrap_or(0), v[2].as_i64().unwrap_or(100), v[3].as_i64().unwrap_or(100))).unwrap_or((0.0, 0, 100, 100));
        let place_v: Option<Vec<Value>> = a[6].as_array().cloned();
        let group = a[7].clone();
        let v0 = place_v.as_ref().and_then(|p| {
            let ck = place::cursor_key(p)?;
            cursor.get(&ck).copied().or_else(|| place::start_of(p, w, h))
        });
        let (pe, gl, sz, op, zz) = look.get(k).copied().unwrap_or((true, -1, -1, -1, if k == "editchip" { 1000 } else { 0 }));
        // this window's own size, or the one for all windows
        let s = if sz > 0 { pieces::scale(h, sz as f64 / 100.0) } else { s0 };
        // the dark ground of this window: its own level, or the global switch at the plugin's level
        let (bg_w, ga) = match gl { 0 => (false, 190u8), g if g > 0 => (true, (g as f64 * 2.55).round() as u8), _ => (bg, 190u8) };
        let key = format!("{m}|{xp}|{yp}|{col}|{sh:?}|{place_v:?}|{v0:?}|{s:.4}|{w}|{h}|{bg_w}|{pe}|{ga}");
        let fresh = slots.get(k).map(|sl| sl.key != key).unwrap_or(true);
        if fresh {
            let Some(p) = place::paint(tr, m, xp, yp, col, sh, place_v.as_deref(), v0, s, w, h, bg_w, pe, ga) else { continue };
            let mut bgra = p.pic.rgba.clone();
            for px in bgra.chunks_mut(4) {
                px.swap(0, 2); // RGBA to BGRA, still premultiplied
            }
            if let Some(b) = boot.as_mut() { b.forget(k); } // (its boot pictures go on from the new one)
            let slot = slots.entry(k.to_string()).or_insert_with(|| {
                let hwnd = unsafe { overlay::create_hwnd() };
                Slot {
                    win: Win { hwnd: hwnd.unwrap_or_default(), bgra: Vec::new(), w: 0, h: 0, alpha: 0.0, shown: false, has_picture: false, at: (-32000, -32000, 0) },
                    key: String::new(),
                    group: Value::Null,
                    rel: (0, 0),
                    vend: None,
                    own: Picture { w: 0, h: 0, x: 0, y: 0, rgba: Vec::new() },
                    own_bgra: Vec::new(),
                    fx: false,
                    hover: 1.0,
                    op: -1.0,
                    z: 0,
                }
            });
            slot.own_bgra = bgra.clone();
            slot.own = Picture { w: p.pic.w, h: p.pic.h, x: p.pic.x, y: p.pic.y, rgba: p.pic.rgba };
            slot.fx = false;
            slot.win.bgra = bgra;
            slot.win.w = p.pic.w as i32;
            slot.win.h = p.pic.h as i32;
            slot.win.has_picture = false; // the new picture goes up at the next animation step, showing as it is now (no blink)
            slot.rel = (p.pic.x, p.pic.y);
            slot.key = key;
            slot.vend = p.vend;
        }
        if let Some(sl) = slots.get_mut(k) {
            sl.group = group;
            sl.op = if op > 0 { op as f32 / 100.0 } else { -1.0 };
            sl.z = zz;
            if let (Some(p), Some(v)) = (&place_v, sl.vend) {
                if let Some(ck) = place::cursor_key(p) {
                    cursor.insert(ck, v);
                }
            }
        }
        keep.push(k.to_string());
    }
    let gone: Vec<String> = slots.keys().filter(|k| !keep.contains(k)).cloned().collect();
    for k in gone {
        if let Some(sl) = slots.remove(&k) {
            unsafe {
                let _ = DestroyWindow(sl.win.hwnd);
            }
        }
    }
}

/// Every window where it is now (hud.py arrange): its place, the head's turn under way (slide and fade), a hologram boot, the HUD showing softly,
/// and the mouse (the window fades out while it is near). True while anything is showing or still moving.
fn animate(slots: &mut HashMap<String, Slot>, game: Game, an: &mut Anim, dt_ms: f32) -> bool {
    let (gx, gy, gh) = match game {
        Game::Window { x, y, h, .. } => (x, y, h as f64),
        _ => (0, 0, 1080.0),
    };
    // a turn is over after the longest of its parts
    if an.turn.is_some_and(|tn| an.t - tn.t0 > anim::TURN_S.max(anim::OUT_S).max(anim::IN_FRONT.0 + anim::IN_FRONT.1).max(anim::IN_PANEL.0 + anim::IN_PANEL.1)) {
        an.turn = None;
    }
    let fade = ((an.t - an.fade_t0) / anim::FADE_S).clamp(0.0, 1.0);
    let mut cur = POINT::default();
    unsafe {
        let _ = GetCursorPos(&mut cur);
    }
    let mut busy = an.turn.is_some() || (an.hud_shown && fade < 1.0) || an.boot.is_some();
    let mut newly = false;
    let boot_on = an.boot.is_some();
    for (key, sl) in slots.iter_mut() {
        let (dx, dy, am) = anim::motion(&sl.group, an.gui, an.turn, an.turn_hidden, boot_on, an.t, gh);
        let a_m = if an.hud_shown { am } else { 0.0 };
        let (x, y) = (gx + sl.rel.0 + dx.round() as i32, gy + sl.rel.1 + dy.round() as i32);
        let win = &mut sl.win;
        let mut fx_alpha = 1.0f64;
        let mut fx = None;
        if a_m > 0.0 {
            if let Some(b) = an.boot.as_mut() {
                fx = b.picture(key, &sl.own, an.t);
            }
        }
        match fx {
            Some((px, w, h, fa)) => {
                if !sl.fx || win.w != w as i32 || win.h != h as i32 || win.bgra != px {
                    let mut bgra = px;
                    for q in bgra.chunks_mut(4) {
                        q.swap(0, 2);
                    }
                    win.bgra = bgra;
                    win.w = w as i32;
                    win.h = h as i32;
                    win.has_picture = false;
                }
                sl.fx = true;
                fx_alpha = fa;
            }
            None if sl.fx => {
                win.bgra = sl.own_bgra.clone();
                win.w = sl.own.w as i32;
                win.h = sl.own.h as i32;
                win.has_picture = false;
                sl.fx = false;
            }
            None => {}
        }
        let final_a = a_m * (if sl.op >= 0.0 { sl.op } else { an.opacity }) as f64 * fade.max(if an.hud_shown { 0.0 } else { 1.0 }) * sl.hover as f64 * fx_alpha;
        let a = (final_a * 255.0).round().clamp(0.0, 255.0) as u8;
        win.alpha = a as f32;
        if a > 0 || sl.hover < 1.0 && a_m > 0.0 { busy = true; }
        unsafe {
            if a == 0 {
                if win.shown {
                    let _ = ShowWindow(win.hwnd, SW_HIDE);
                    win.shown = false;
                }
                continue;
            }
            if !win.has_picture {
                overlay::picture(win, x, y, a);
            } else if win.at != (x, y, a) {
                overlay::place(win, x, y, a);
            }
            if !win.shown {
                let _ = ShowWindow(win.hwnd, SW_SHOWNOACTIVATE);
                win.shown = true;
                newly = true; // (stacked again below, in the player's order)
            }
        }
    }
    // the stacking order: the player's z, then the larger window first so the smaller one ends on top, then the key. The windows are put in that
    // order (all topmost, each one put on top in turn) only when the order changed or a window just came up
    let order = stack_order(slots.iter().filter(|(_, s)| s.win.shown).map(|(k, s)| (k.as_str(), s.z, s.own.w as i64 * s.own.h as i64)).collect());
    if newly || order != an.order {
        unsafe {
            for k in &order {
                if let Some(sl) = slots.get(k) {
                    let _ = SetWindowPos(sl.win.hwnd, Some(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE);
                }
            }
        }
        if !order.is_empty() { crate::menu::raise_over_overlays(); }
        an.order = order;
    }
    if an.boot.as_ref().is_some_and(|b| b.done(an.t)) {
        an.boot = None;
    }
    busy
}

/// The windows from the bottom to the top: the player's z first (higher = more in front), then the larger window below the smaller one (so a small
/// card is never lost under a big one), then the key (so the order is always the same).
fn stack_order(mut v: Vec<(&str, i64, i64)>) -> Vec<String> {
    v.sort_by(|a, b| a.1.cmp(&b.1).then(b.2.cmp(&a.2)).then(a.0.cmp(b.0)));
    v.into_iter().map(|(k, _, _)| k.to_string()).collect()
}

/// "Default position" of one window: place, colour, when, perspective, ground, size, opacity and stacking order back to GRAVITAS's defaults.
/// On/off and the shape stay as they are.
fn reset_window(w: &mut crate::combat::WinCfg, d: &crate::combat::WinCfg) {
    w.x = d.x; w.y = d.y; w.dx = 0.0; w.dy = 0.0;
    w.colour = d.colour.clone();
    w.when = d.when.clone();
    w.persp = d.persp; w.ground = d.ground; w.size = d.size; w.opacity = d.opacity; w.z = d.z;
}

/// "To front" / "To back" (the keys' z): one more than the highest, or one less than the lowest, of all the windows. At the end of the range
/// (-100..100) the others move one step the other way, so the order always holds.
fn z_move(win: &mut [(&'static str, crate::combat::WinCfg)], key: &str, front: bool) {
    let others: Vec<i64> = win.iter().filter(|(k, _)| *k != key).map(|(_, w)| w.z).collect();
    let new = if front { others.iter().copied().max().unwrap_or(0) + 1 } else { others.iter().copied().min().unwrap_or(0) - 1 };
    let shift = if new > 100 { -1 } else if new < -100 { 1 } else { 0 };
    for (k, w) in win.iter_mut() {
        if *k == key { w.z = new.clamp(-100, 100); } else if shift != 0 { w.z = (w.z + shift).clamp(-100, 100); }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_position_is_a_real_reset() {
        let d = crate::host::Settings::default();
        let mut s = crate::host::Settings::default();
        let (_, w) = s.win.iter_mut().find(|(k, _)| *k == "fight").unwrap();
        w.x = 50.0; w.y = 50.0; w.dx = 9.0; w.dy = -9.0; w.colour = "#00ff00".into(); w.when = "always".into(); w.persp = false; w.ground = 40; w.size = 150; w.opacity = 30; w.z = 5; w.on = false;
        let dw = &d.win.iter().find(|(k, _)| *k == "fight").unwrap().1;
        reset_window(w, dw);
        assert_eq!((w.x, w.y, w.dx, w.dy, w.colour.as_str(), w.when.as_str(), w.persp, w.ground, w.size, w.opacity, w.z), (dw.x, dw.y, 0.0, 0.0, "#ff7100", "ext", true, -1, -1, -1, 0));
        assert!(!w.on, "on/off is not part of the position");
    }

    #[test]
    fn z_order_front_back_and_the_comparator() {
        let mut s = crate::host::Settings::default();
        z_move(&mut s.win, "targets", true);
        z_move(&mut s.win, "bounty", true);
        z_move(&mut s.win, "fight", false);
        let z = |k: &str| s.win.iter().find(|(n, _)| *n == k).unwrap().1.z;
        assert_eq!((z("targets"), z("bounty"), z("fight")), (1, 2, -1));
        // at the end of the range the others give way, the order holds
        let mut t = crate::host::Settings::default();
        for (_, w) in t.win.iter_mut() { w.z = 100; }
        z_move(&mut t.win, "report", true);
        assert_eq!(t.win.iter().find(|(n, _)| *n == "report").unwrap().1.z, 100);
        assert!(t.win.iter().filter(|(n, _)| *n != "report").all(|(_, w)| w.z == 99));
        // by z first, then the larger below the smaller, then the key
        let o = stack_order(vec![("small", 0, 10), ("big", 0, 100), ("front", 1, 1000), ("back", -1, 1), ("big2", 0, 100)]);
        assert_eq!(o, vec!["back", "big", "big2", "small", "front"]);
    }

    #[test]
    fn ship_ids_get_the_games_names() {
        let n = ship_names();
        assert_eq!(n.get("python_nx").map(String::as_str), Some("Python Mk II"));
        assert_eq!(n.get("ferdelance").map(String::as_str), Some("Fer-de-Lance"));
        assert!(n.len() > 20, "{} names", n.len());
    }

    /// Lays out a real moment of a fight (a golden fixture's items) on a 1920x1080 and 2560x1440 game window, and writes what the windows would
    /// show as one picture (research/app-golden/out/live_<W>.png): the planes' perspective, the order down each plane, the places.
    #[test]
    fn layout_of_a_real_fight() {
        let path = crate::host::parity::golden_dir().join("op1114.all.json");
        let Ok(t) = std::fs::read_to_string(path) else { println!("SKIP"); return };
        let d: Value = serde_json::from_str(&t).unwrap();
        let best = d["records"].as_array().unwrap().iter().filter_map(|r| r["items"].as_array()).max_by_key(|i| i.iter().filter(|x| !x[1].is_null()).count()).unwrap().clone();
        let tr = crate::i18n::I18n::new("en");
        let out = crate::host::parity::golden_dir().join("../out");
        std::fs::create_dir_all(&out).unwrap();
        for (w, h) in [(1920.0, 1080.0), (2560.0, 1440.0)] {
            let mut slots = HashMap::new();
            layout(&tr, &best, (w, h), &mut slots, 0.9, false, &HashMap::new(), &mut None);
            assert!(slots.len() >= 6, "{} windows", slots.len());
            let mut pm = tiny_skia::Pixmap::new(w as u32, h as u32).unwrap();
            pm.fill(tiny_skia::Color::from_rgba8(30, 40, 60, 255));
            for s in slots.values() {
                let src = tiny_skia::PixmapRef::from_bytes(&s.own.rgba, s.own.w, s.own.h).unwrap();
                pm.draw_pixmap(s.rel.0, s.rel.1, src, &tiny_skia::PixmapPaint::default(), tiny_skia::Transform::identity(), None);
            }
            pm.save_png(out.join(format!("live_{}.png", w as u32))).unwrap();
            clear(&mut slots);
        }
    }
}
