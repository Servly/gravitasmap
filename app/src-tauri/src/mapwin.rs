//! The map. The site (gravitasmap.com) is the map: GRAVITAS shows it in two ways, both by opening the site in a window of its own (the site does not allow being
//! framed inside another page, and a page from the internet gets NO power over the app: it cannot call any of our commands, we only send it small
//! instructions with `eval`, and it answers nothing back).
//!   1. the whole site in a normal window ("Open the map window").
//!   2. the System map alone, see-through, as an overlay over the game: the site's own `?app=smap` mode (src/js/48-app-hook.js). It sits at the top of the game
//!      window by default, never takes a click or the focus (same styles as every overlay), shows only while the game is in front, and follows the system the
//!      Journal says you are in. Ctrl+Shift+Numpad keys move and zoom it (8 up, 4 left, 5 down, 6 right, + and - zoom, 0 the whole system); every key can be changed.
//! Settings (settings.json, "map_overlay"): on (off by default), w and h (percent of the game window), x (0 left to 100 right) and y (percent from the top).
use crate::overlay::{self, Game};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, ShowWindow, GWL_EXSTYLE, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOSIZE, SWP_NOZORDER, SW_HIDE, SW_SHOWNOACTIVATE, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
};

const SITE: &str = "https://gravitasmap.com";
/// the test site of a developer: GRAVITAS_MAP_URL=http://localhost:8765
/// What the map window does with a link it is asked to leave for.
#[derive(Debug, PartialEq)]
pub enum Decision {
    /// our own site: the window goes there
    Stay,
    /// a place on the list below: the browser opens it (the window stays where it is)
    OpenOutside,
    /// anything else, or too soon after the last one: nothing happens (the reason is logged once)
    Ignore(&'static str),
}
/// The places a link in the map window may open in the browser (the same list as the opener permission in capabilities/default.json, plus our own site).
/// A host alone allows every path on it, a github.com entry allows only that project.
const OUTSIDE_HOSTS: &[&str] = &["gravitasmap.com", "spansh.co.uk", "science.canonn.tech", "inara.cz", "edsy.org"];
const OUTSIDE_GITHUB: &[&str] = &["/Servly/gravitasmap", "/njthomson/SrvSurvey", "/jixxed/ed-odyssey-materials-helper", "/characterecho-sean/ed-unofficial-patch"];
/// at most one link opens in the browser in this time
const OPEN_GAP: Duration = Duration::from_secs(3);

static LAST_OPEN: Mutex<Option<Instant>> = Mutex::new(None);
static LOGGED: AtomicBool = AtomicBool::new(false);
fn last_open() -> Option<Instant> { LAST_OPEN.lock().ok().and_then(|g| *g) }
fn mark_open() { if let Ok(mut g) = LAST_OPEN.lock() { *g = Some(Instant::now()); } }
fn log_once(why: &str) {
    if !LOGGED.swap(true, Ordering::SeqCst) { crate::store::log(&format!("map window: a link was not opened ({why}); further ones are not logged")); }
}

/// Our own site, over http(s) only.
fn own_only(own_host: &str, u: &tauri::Url) -> bool {
    matches!(u.scheme(), "http" | "https") && u.host_str() == Some(own_host)
}

/// The decision for a link of the map window: (own host, the link, when the last one was opened outside, now).
pub fn decide(own_host: &str, u: &tauri::Url, last: Option<Instant>, now: Instant) -> Decision {
    if own_only(own_host, u) { return Decision::Stay; }
    if u.scheme() != "https" { return Decision::Ignore("not https"); }
    if !u.username().is_empty() || u.password().is_some() || u.port().is_some() { return Decision::Ignore("user or port in the address"); }
    let host = u.host_str().unwrap_or("");
    let path = u.path();
    let ok = OUTSIDE_HOSTS.contains(&host)
        || (host == "github.com" && OUTSIDE_GITHUB.iter().any(|p| path == *p || path.strip_prefix(p).map(|r| r.starts_with('/')).unwrap_or(false)));
    if !ok { return Decision::Ignore("not on the list"); }
    if last.map(|t| now.saturating_duration_since(t) < OPEN_GAP).unwrap_or(false) { return Decision::Ignore("too soon after the last one"); }
    Decision::OpenOutside
}

fn site() -> String {
    crate::devenv::var("GRAVITAS_MAP_URL").unwrap_or_else(|| SITE.to_string())
}

static BUILDING: AtomicBool = AtomicBool::new(false);
static SITE_BUILDING: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Cfg {
    /// the map card's size in design pixels (the Combat windows' own unit: 330 is a card, the game scales it with its window)
    pub w: f64,
    pub h: f64,
}

/// The settings, read from the file at most every 120 ms (the HUD asks at every look, the sliders are followed within a blink).
pub fn cfg() -> Cfg {
    static CACHE: Mutex<Option<(Instant, Cfg)>> = Mutex::new(None);
    if let Ok(c) = CACHE.lock() { if let Some((t, v)) = *c { if t.elapsed() < Duration::from_millis(120) { return v; } } }
    let v = read_cfg();
    if let Ok(mut c) = CACHE.lock() { *c = Some((Instant::now(), v)); }
    v
}

fn read_cfg() -> Cfg {
    let v = crate::store::read();
    let m = v.get("map_overlay").cloned().unwrap_or(json!({}));
    let f = |k: &str, d: f64, lo: f64, hi: f64| m.get(k).and_then(Value::as_f64).unwrap_or(d).clamp(lo, hi);
    Cfg { w: f("w", 560.0, 300.0, 1100.0), h: f("h", 300.0, 160.0, 800.0) }
}

/// The map window is on (Windows list of the Combat page, key "sysmap"): the one switch, saved with the other windows.
fn window_on() -> bool {
    crate::store::read().get("combat_settings").and_then(|c| c.get("win")).and_then(|w| w.get("sysmap")).and_then(|w| w.get("on")).and_then(Value::as_bool).unwrap_or(false)
}

/// The size (percent) the System map window is drawn at: its own, or the one for all windows (Auto: from the game window's height).
fn size_pct(gh: i32) -> f64 {
    let v = crate::store::read();
    let c = v.get("combat_settings").cloned().unwrap_or(json!({}));
    let own = c.get("win").and_then(|w| w.get("sysmap")).and_then(|w| w.get("size")).and_then(Value::as_i64).unwrap_or(-1);
    if own > 0 { return (own as f64).clamp(30.0, 200.0); }
    if c.get("size_auto").and_then(Value::as_bool).unwrap_or(true) { crate::hud::pieces::auto_pct(gh as f64) } else { c.get("size_pct").and_then(Value::as_f64).unwrap_or(90.0).clamp(50.0, 200.0) }
}

/// {"w", "h"} for the pages.
pub fn get_json() -> Value {
    let c = cfg();
    json!({"w": c.w, "h": c.h})
}

pub fn set_key(key: &str, value: Value) {
    if !matches!(key, "w" | "h") { return; }
    let mut m = crate::store::read().get("map_overlay").and_then(Value::as_object).cloned().unwrap_or_default();
    m.insert(key.to_string(), value);
    crate::store::set(&[("map_overlay", Value::Object(m))]);
}

fn hwnd_of(w: &tauri::WebviewWindow) -> Option<HWND> {
    w.hwnd().ok().map(|h| HWND(h.0 as *mut _))
}

/// The whole site in a normal window. Built on a thread of its own (a window built inside a command never finishes on Windows).
/// `mode`: a tool of the map window to open at once ("sono", "lenses", "coll" or "pair" = the Devices dialog), nothing = the map itself. Only these words are ever used.
pub fn open_site(app: &AppHandle, mode: Option<&str>, system: Option<&str>) {
    let system = system.map(|s| s.chars().take(80).collect::<String>()).filter(|s| !s.trim().is_empty());
    let tool = match mode { Some("sono") => "Sonification", Some("lenses") => "Lenses", Some("coll") => "Collisions", Some("pair") => "Devices", _ => "" };
    crate::menu::close_quiet(); // (the menu belongs to the game: it closes, the map window is what you are looking at now)
    if let Some(w) = app.get_webview_window("mapsite") {
        if let Some(sys) = &system { let _ = w.eval(&format!("window.__gravitasApp&&__gravitasApp.openSystem&&__gravitasApp.openSystem({})", js_str(sys))); }
        if !tool.is_empty() { let _ = w.eval(&format!("window.__gravitasApp&&__gravitasApp.openTool&&__gravitasApp.openTool({})", js_str(tool))); }
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.maximize();
        if let Some(h) = hwnd_of(&w) { crate::menu::force_foreground(h); }
        let _ = w.set_focus();
        return;
    }
    if SITE_BUILDING.swap(true, Ordering::SeqCst) { return; }
    let app = app.clone();
    std::thread::spawn(move || {
        let url = format!("{}/?app=window{}{}", site(), match tool { "Sonification" => "&open=sono", "Lenses" => "&open=lenses", "Collisions" => "&open=coll", "Devices" => "&open=pair", _ => "" }, system.as_deref().map(|s| format!("&system={}", enc(s))).unwrap_or_default());
        // the window only ever shows our own site: a link to another place opens in the browser instead (so the Journal hand-over never reaches a foreign page)
        let own_host = url.parse::<tauri::Url>().ok().and_then(|u| u.host_str().map(str::to_string)).unwrap_or_default();
        let opener = app.clone();
        let r = url.parse().map(|u| {
            WebviewWindowBuilder::new(&app, "mapsite", WebviewUrl::External(u))
                .title("GRAVITAS Map")
                .background_color(tauri::window::Color(11, 7, 22, 255)) // (the page's own dark ground: no white flash while it loads)
                .inner_size(1400.0, 860.0)
                .min_inner_size(640.0, 420.0)
                .maximized(true)
                .on_navigation(move |u| {
                    match decide(&own_host, u, last_open(), Instant::now()) {
                        Decision::Stay => true,
                        Decision::OpenOutside => {
                            mark_open();
                            use tauri_plugin_opener::OpenerExt;
                            let _ = opener.opener().open_url(u.as_str(), None::<&str>);
                            false
                        }
                        Decision::Ignore(why) => { log_once(why); false }
                    }
                })
                .on_page_load(|_, p| { if matches!(p.event(), tauri::webview::PageLoadEvent::Finished) { crate::mapfeed::page_loaded(); } })
                .build()
        });
        match r {
            Ok(Ok(w)) => { if let Some(h) = hwnd_of(&w) { crate::menu::force_foreground(h); } let _ = w.set_focus(); }
            Ok(Err(e)) => crate::store::log(&format!("map window: {e}")),
            Err(e) => crate::store::log(&format!("map window url: {e}")),
        }
        SITE_BUILDING.store(false, Ordering::SeqCst);
    });
}

/// The window the site draws its System map in: a real window, far off the screen (nobody sees it, it keeps drawing, measured), made once.
fn build_capture_window(app: &AppHandle, system: &str, pw: u32, ph: u32) {
    if BUILDING.swap(true, Ordering::SeqCst) { return; }
    let app = app.clone();
    let name = if system.is_empty() { "Sol".to_string() } else { system.to_string() };
    std::thread::spawn(move || {
        let url = format!("{}/?app=smap&system={}", site(), enc(&name));
        let own_host = url.parse::<tauri::Url>().ok().and_then(|u| u.host_str().map(str::to_string)).unwrap_or_default();
        let built = url.parse().map(|u| {
            WebviewWindowBuilder::new(&app, "sysmap", WebviewUrl::External(u))
                .title("GRAVITAS system map (picture)")
                .decorations(false)
                .skip_taskbar(true)
                .resizable(false)
                .transparent(true)
                .shadow(false)
                .focused(false)
                .on_navigation(move |u| own_only(&own_host, u)) // (a picture window: our own site only, nothing opens outside)
                .position(-20000.0, -20000.0)
                .inner_size(pw as f64, ph as f64) // (made at its size from the start: a later set_size left the page laid out for the old one, seen in the test)
                .build()
        });
        match built {
            Ok(Ok(w)) => {
                let _ = w.set_ignore_cursor_events(true);
                if let Some(h) = hwnd_of(&w) {
                    unsafe {
                        let ex = GetWindowLongPtrW(h, GWL_EXSTYLE);
                        SetWindowLongPtrW(h, GWL_EXSTYLE, ex | (WS_EX_NOACTIVATE.0 | WS_EX_TOOLWINDOW.0) as isize);
                        // far off the screen (the builder's own position is not kept: Windows put the window at a default place, seen in the test)
                        let _ = SetWindowPos(h, None, -20000, -20000, 0, 0, SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOZORDER);
                    }
                }
                crate::store::log("system map picture window built");
            }
            Ok(Err(e)) => crate::store::log(&format!("system map window: {e}")),
            Err(e) => crate::store::log(&format!("system map window url: {e}")),
        }
        BUILDING.store(false, Ordering::SeqCst);
    });
}

/// A system name for a web address: letters, digits and - stay, a space is +, the rest %XX (UTF-8).
fn enc(s: &str) -> String {
    s.bytes().map(|b| if b.is_ascii_alphanumeric() || b == b'-' { (b as char).to_string() } else if b == b' ' { "+".to_string() } else { format!("%{b:02X}") }).collect()
}

fn js_str(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| "\"\"".into())
}

/// The map thread. While the System map window is on and the game is in front it keeps the picture window the size of its card, tells it the system you
/// are in (the Journal) and the key moves, and asks for a new picture when something changed (and every few seconds: the eclipse clocks). The pictures go
/// to the HUD through mapcap.rs, which draws them like the other windows (perspective, place, Edit HUD, profiles).
pub fn start(app: AppHandle, state: Arc<Mutex<crate::journal::State>>) {
    std::thread::Builder::new()
        .name("GRAVITAS map".into())
        .spawn(move || crate::guard::keep_running("map", || {
            use crate::mapcap::{capture, Sink};
            let mut keys = make_keys();
            let mut keys_read = Instant::now();
            let mut c = cfg();
            let mut on = window_on();
            let mut c_read = Instant::now();
            let mut sent_system = String::new();
            let mut built_at: Option<Instant> = None;
            let mut sized: Option<(u32, u32)> = None;
            let mut menu_votes = 0u8;
            let mut game_menu = false;
            let mut hand_off = false; // (the player hid it with the key)
            let mut dirty_at: Option<Instant> = Some(Instant::now());
            let mut last_cap = Instant::now() - Duration::from_secs(60);
            let mut asked: Option<Instant> = None;
            let mut last_hash = 0u64;
            let dbg = crate::devenv::var_os("GRAVITAS_MAP_DEBUG").is_some();
            let sink: Sink = Arc::new(Mutex::new(None));
            let mut last = Instant::now();
            loop {
                std::thread::sleep(Duration::from_millis(30));
                let dt = last.elapsed().as_secs_f64().min(0.2);
                last = Instant::now();
                if c_read.elapsed() >= Duration::from_millis(120) { c = cfg(); on = window_on(); c_read = Instant::now(); }
                if keys_read.elapsed() >= Duration::from_secs(2) { keys = make_keys(); keys_read = Instant::now(); }
                let mut fit_now = false;
                for k in keys.pressed(&crate::panelkeys::key_down) {
                    match k.as_str() {
                        "map_show" => hand_off = !hand_off,
                        "map_site" => open_site(&app, None, None),
                        "map_fit" => fit_now = true,
                        _ => {}
                    }
                }
                let (front, gh) = match overlay::game_rect() { Game::Window { h, front, .. } => (front, h), _ => (false, 0) };
                {
                    let seen = front && !crate::menu::is_open() && overlay::cursor_showing();
                    if seen == game_menu { menu_votes = 0; } else { menu_votes += 1; if menu_votes >= 5 { game_menu = seen; menu_votes = 0; } }
                }
                let want = on && !hand_off && gh > 0 && (front || crate::menu::is_open()) && !game_menu;
                if !want { continue; } // (nothing is asked of the page while the card is not wanted)
                // the picture window is as big as the card will be on the screen (design pixels times what the game window scales them by)
                let sc = crate::hud::pieces::scale(gh as f64, size_pct(gh) / 100.0);
                let (pw, ph) = ((c.w * sc).round().max(200.0) as u32, (c.h * sc).round().max(120.0) as u32);
                let Some(win) = app.get_webview_window("sysmap") else {
                    let sys = state.lock().map(|s| s.system.clone()).unwrap_or_default();
                    build_capture_window(&app, &sys, pw, ph);
                    sent_system = sys;
                    built_at = Some(Instant::now());
                    sized = Some((pw, ph));
                    continue;
                };
                if sized != Some((pw, ph)) {
                    // a new size (the card's size, or the game window's): the same window is resized, the page fits the map to it again (about 250 ms later)
                    let _ = win.set_size(tauri::PhysicalSize::new(pw, ph));
                    sized = Some((pw, ph));
                    dirty_at = Some(Instant::now() + Duration::from_millis(450));
                }
                // the system you are in (the Journal), sent when it changes; once more a few seconds after the build, the page may not have been ready
                let sys = state.lock().map(|s| s.system.clone()).unwrap_or_default();
                let late = built_at.map(|t| { let e = t.elapsed(); e > Duration::from_secs(6) && e < Duration::from_millis(6100) }).unwrap_or(false);
                if !sys.is_empty() && (sys != sent_system || late) {
                    let _ = win.eval(&format!("window.__gravitasApp&&__gravitasApp.setSystem({})", js_str(&sys)));
                    sent_system = sys;
                    dirty_at = Some(Instant::now() + Duration::from_millis(1500)); // (the new system takes a moment to load)
                }
                // moves and zoom while the keys are held
                let held = keys.held_now(&crate::panelkeys::key_down);
                let (mut dx, mut dy, mut z) = (0.0f64, 0.0f64, 0.0f64);
                let px = 0.9 * (pw.min(ph * 2) as f64) * dt;
                for k in &held {
                    match k.as_str() {
                        "map_left" => dx += px,
                        "map_right" => dx -= px,
                        "map_up" => dy += px,
                        "map_down" => dy -= px,
                        "map_zin" => z += 1.0,
                        "map_zout" => z -= 1.0,
                        _ => {}
                    }
                }
                if dbg && (dx != 0.0 || dy != 0.0 || z != 0.0) { crate::store::log(&format!("map keys: dx {dx:.1} dy {dy:.1} z {z}")); }
                if dx != 0.0 || dy != 0.0 { let _ = win.eval(&format!("window.__gravitasApp&&__gravitasApp.pan({:.1},{:.1})", dx, dy)); dirty_at = Some(Instant::now()); }
                if z != 0.0 { let _ = win.eval(&format!("window.__gravitasApp&&__gravitasApp.zoom({:.4})", (1.0f64 + 0.9 * dt).powf(z))); dirty_at = Some(Instant::now()); }
                if fit_now { let _ = win.eval("window.__gravitasApp&&__gravitasApp.fit()"); dirty_at = Some(Instant::now() + Duration::from_millis(200)); }
                // a picture is asked for when something changed (at most about 12 a second), and every 6 seconds anyway (the eclipse clocks)
                if last_cap.elapsed() > Duration::from_secs(6) && dirty_at.is_none() { dirty_at = Some(Instant::now()); }
                if let Some(t) = dirty_at {
                    if Instant::now() >= t && asked.is_none() && last_cap.elapsed() >= Duration::from_millis(70) {
                        if let Ok(mut g) = sink.lock() { *g = None; }
                        capture(&win, sink.clone());
                        asked = Some(Instant::now());
                        dirty_at = None;
                        last_cap = Instant::now();
                    }
                }
                if let Some(t) = asked {
                    let got = sink.lock().ok().and_then(|mut g| g.take());
                    if let Some(sh) = got {
                        let name = state.lock().map(|s| s.system.clone()).unwrap_or_default();
                        // the same picture as before (nothing moved): not published, so the HUD does not paint the card again
                        let hash = sh.rgba.iter().step_by(61).fold(1469598103934665603u64, |a, b| (a ^ *b as u64).wrapping_mul(1099511628211));
                        if hash != last_hash || crate::mapcap::current().map(|c| c.system != name).unwrap_or(true) {
                            last_hash = hash;
                            if dbg {
                                crate::store::log(&format!("map picture published {}x{} in {} ms", sh.w, sh.h, sh.ms));
                                // what the page gave, as a file (so a wrong picture can be looked at): one file, overwritten
                                if let (Some(dir), Some(pm)) = (crate::store::dir(), tiny_skia::Pixmap::from_vec(sh.rgba.clone(), tiny_skia::IntSize::from_wh(sh.w, sh.h).unwrap_or(tiny_skia::IntSize::from_wh(1, 1).unwrap()))) {
                                    let _ = pm.save_png(dir.join("sysmap-capture.png"));
                                }
                            }
                            crate::mapcap::publish(sh, &name);
                        }
                        asked = None;
                    } else if t.elapsed() > Duration::from_secs(3) {
                        asked = None; // (no answer: ask again next time)
                    }
                }
            }
        }))
        .ok();
}

fn make_keys() -> crate::hotkeys::Keys {
    let custom: Vec<(String, String)> = crate::store::read().get("hotkeys").and_then(Value::as_object).map(|o| o.iter().filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string()))).collect()).unwrap_or_default();
    crate::hotkeys::Keys::new(&custom)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The System map as a window: the card (title, system, the picture) drawn by the same painter as the Bounty counter, flat at the top and on a plane.
    #[test]
    fn the_map_is_drawn_as_a_card_like_the_other_windows() {
        let out = crate::host::parity::golden_dir().join("../out");
        let Ok(pm) = tiny_skia::Pixmap::load_png(out.join("map_shot.png")) else { println!("SKIP"); return };
        crate::mapcap::publish(crate::mapcap::Shot { id: 0, system: String::new(), w: pm.width(), h: pm.height(), rgba: pm.data().to_vec(), at: std::time::Instant::now(), ms: 0 }, "Sol");
        let cur = crate::mapcap::current().unwrap();
        let tr = crate::i18n::I18n::new("en");
        let m = json!({"title": "SYSTEM MAP", "head2": "Sol", "mapw": 560.0, "map": {"id": cur.id, "w": cur.w, "h": cur.h}});
        let (w, h) = (2560.0, 1440.0);
        let s = crate::hud::pieces::scale(h, 1.0);
        let mut canvas = tiny_skia::Pixmap::new(w as u32, h as u32).unwrap();
        canvas.fill(tiny_skia::Color::from_rgba8(30, 40, 60, 255));
        for (i, place) in [json!(["top", 0.012]), json!(["plane", "info"])].iter().enumerate() {
            let pv: Vec<Value> = place.as_array().unwrap().clone();
            let v0 = crate::hud::place::cursor_key(&pv).and_then(|_| crate::hud::place::start_of(&pv, w, h));
            let t0 = std::time::Instant::now();
            let p = crate::hud::place::paint(&tr, &m, 0.0, 0.0, "#ff7100", (0.0, 0, 100, 100), Some(&pv), v0, s, w, h, false, true, 190);
            println!("paint of place {i}: {} ms", t0.elapsed().as_millis());
            let p = p.unwrap_or_else(|| panic!("no picture for place {i}"));
            let src = tiny_skia::PixmapRef::from_bytes(&p.pic.rgba, p.pic.w, p.pic.h).unwrap();
            canvas.draw_pixmap(p.pic.x, p.pic.y, src, &tiny_skia::PixmapPaint::default(), tiny_skia::Transform::identity(), None);
        }
        canvas.save_png(out.join("map_card.png")).unwrap();
    }

    #[test]
    fn a_system_name_goes_into_a_web_address() {
        assert_eq!(enc("Col 285 Sector VR-E b27-1"), "Col+285+Sector+VR-E+b27-1");
        assert_eq!(enc("Sol"), "Sol");
    }

    #[test]
    fn links_in_the_map_window_follow_the_list() {
        let u = |s: &str| s.parse::<tauri::Url>().unwrap();
        let now = Instant::now();
        let d = |s: &str, last: Option<Instant>| decide("gravitasmap.com", &u(s), last, now);
        assert_eq!(d("https://gravitasmap.com/?system=Sol", None), Decision::Stay);
        assert_eq!(d("https://inara.cz/elite/", None), Decision::OpenOutside);
        assert_eq!(d("https://spansh.co.uk/system/1", None), Decision::OpenOutside);
        assert_eq!(d("https://github.com/Servly/gravitasmap/issues", None), Decision::OpenOutside);
        assert_eq!(d("https://github.com/characterecho-sean/ed-unofficial-patch", None), Decision::OpenOutside);
        assert!(matches!(d("https://github.com/Servly/gravitasmap-evil", None), Decision::Ignore(_)));
        assert!(matches!(d("https://github.com/someone/else", None), Decision::Ignore(_)));
        assert!(matches!(d("http://inara.cz/", None), Decision::Ignore(_)));
        assert!(matches!(d("https://inara.cz.evil.com/", None), Decision::Ignore(_)));
        assert!(matches!(d("https://evil.com@inara.cz/", None), Decision::Ignore(_)));
        assert!(matches!(d("file:///c:/x", None), Decision::Ignore(_)));
        assert!(matches!(d("javascript:alert(1)", None), Decision::Ignore(_)));
        // one external open per 3 seconds
        assert!(matches!(d("https://inara.cz/", Some(now)), Decision::Ignore(_)));
        assert_eq!(d("https://inara.cz/", Some(now - Duration::from_secs(4))), Decision::OpenOutside);
        // our own site is never rate limited, and the picture window takes only our own host
        assert_eq!(d("https://gravitasmap.com/", Some(now)), Decision::Stay);
        assert!(own_only("gravitasmap.com", &u("https://gravitasmap.com/?app=smap")));
        assert!(!own_only("gravitasmap.com", &u("https://inara.cz/")));
    }
}
