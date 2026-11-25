#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod devenv;
mod webview_check;
mod card;
#[allow(dead_code)]
mod bonds;
mod thargoid;
mod thargoid_rec;
mod dbnames;
mod inputs;
mod debrief;
mod dbrules;
mod dbcard;
mod dbview;
mod pvp;
mod pvpstore;
mod pvpsync;
#[cfg(test)]
mod pvpdemo;
mod claims;
#[allow(dead_code)]
mod combat;
#[allow(dead_code)]
mod i18n;
#[allow(dead_code)]
mod counter;
#[allow(dead_code)]
mod engine;
#[allow(dead_code)]
mod host;
mod hud;
#[allow(dead_code)]
mod pyval;
mod journal;
mod overlay;
mod live;
mod menu;
mod updater;
mod store;
mod focus;
mod history;
mod reporttext;
mod settings_io;
mod profiles;
mod rawmouse;
mod hotkeys;
mod mapcap;
mod guard;
mod drift;
mod mapfeed;
mod pairing;
mod visits;
mod mapwin;
mod controls;
mod panelkeys;

use std::sync::{Arc, Mutex};
use std::time::Duration;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};
use tauri::{Emitter, Manager, State};

type Shared = Arc<Mutex<journal::State>>;

const GAME: &str = "EliteDangerous64.exe";
const POLL: Duration = Duration::from_millis(50);
const PROCESS_EVERY: u32 = 100; // the game's process is looked for about every 5 s (100 polls)

#[tauri::command]
fn get_state(state: State<Shared>) -> journal::State {
    state.lock().map(|s| s.clone()).unwrap_or_default()
}

#[tauri::command]
fn overlay_info(ov: State<overlay::Overlay>) -> overlay::Info {
    ov.info()
}

#[tauri::command]
fn overlay_set_test(on: bool, ov: State<overlay::Overlay>) {
    ov.set_test(on);
}

#[tauri::command]
fn overlay_set_hover_hide(on: bool, ov: State<overlay::Overlay>, app: tauri::AppHandle) {
    ov.set_hover_hide(on);
    live::HOVER_HIDE.store(on, std::sync::atomic::Ordering::Relaxed);
    save_setting(&app, "hover_hide", on);
}

/// Past combats: the list (newest first), one report in full, show it on the game, delete (with undo).
#[tauri::command]
fn past_list(lang: String) -> Vec<serde_json::Value> {
    let tr = i18n::I18n::new(&lang);
    let h = history::HISTORY.lock().ok();
    h.as_deref().and_then(|h| h.as_ref()).map(|h| h.items.iter().map(|v| {
        let ep = v.get("ep").cloned().unwrap_or_default();
        let place = combat::where_of(v);
        let place = if place.is_empty() { pyval::str_or_empty(ep.get("sys")) } else { place };
        serde_json::json!({
            "t0": ep.get("t0"),
            "fav": history::fav_of(v),
            "line": format!("{} · {} {} · {} cr", place, pyval::py_str(&combat::getd(&ep, "n", serde_json::json!(0))), tr.t0("tile.kills").to_lowercase(), pyval::num(ep.get("cr"))),
        })
    }).collect()).map(favs_first).unwrap_or_default()
}

/// The favourites go first in a list (the order inside each group stays: newest first).
fn favs_first(mut a: Vec<serde_json::Value>) -> Vec<serde_json::Value> {
    a.sort_by_key(|x| !x["fav"].as_bool().unwrap_or(false));
    a
}

#[tauri::command]
fn past_fav(t0: serde_json::Value, on: bool) -> bool {
    history::HISTORY.lock().ok().and_then(|mut h| h.as_mut().map(|h| h.set_fav(&t0, on))).unwrap_or(false)
}

/// DEBRIEF: the records kept (debriefs.json): the list, one record read for the page, shown in the game, deleted (with Undo), starred.
#[tauri::command]
fn db_list(lang: String) -> Vec<serde_json::Value> {
    let tr = i18n::I18n::new(&lang);
    let h = history::DHIST.lock().ok();
    favs_first(h.as_deref().and_then(|h| h.as_ref()).map(|h| h.items.iter().map(|v| serde_json::json!({
        "t0": v["ep"]["t0"], "fav": history::fav_of(v), "line": dbview::line_of(&tr, v)})).collect()).unwrap_or_default())
}

#[tauri::command]
fn db_get(t0: serde_json::Value, lang: String) -> Option<serde_json::Value> {
    let tr = i18n::I18n::new(&lang);
    let h = history::DHIST.lock().ok()?;
    let v = h.as_ref()?.items.iter().find(|v| v["ep"]["t0"] == t0)?;
    dbview::view_of(&tr, v, live::DEBRIEF_RULES.load(std::sync::atomic::Ordering::Relaxed))
}

#[tauri::command]
fn db_show(t0: serde_json::Value) {
    if let Some(v) = history::DHIST.lock().ok().and_then(|h| h.as_ref().and_then(|h| h.items.iter().find(|v| v["ep"]["t0"] == t0).cloned())) {
        if let Ok(mut s) = history::DSHOW.lock() { *s = Some(v); }
    }
}

#[tauri::command]
fn db_delete(t0: serde_json::Value) -> bool {
    let got = history::DHIST.lock().ok().and_then(|mut h| h.as_mut().and_then(|h| h.delete(&t0)));
    let ok = got.is_some();
    if let Ok(mut u) = history::DUNDO.lock() { *u = got; }
    ok
}

#[tauri::command]
fn db_undo() {
    let got = history::DUNDO.lock().ok().and_then(|mut u| u.take());
    if let (Some((i, v)), Ok(mut h)) = (got, history::DHIST.lock()) {
        if let Some(h) = h.as_mut() { h.put_back(i, v); }
    }
}

#[tauri::command]
fn db_fav(t0: serde_json::Value, on: bool) -> bool {
    history::DHIST.lock().ok().and_then(|mut h| h.as_mut().map(|h| h.set_fav(&t0, on))).unwrap_or(false)
}

/// PVP mode: the fight files in the app's pvp folder, one read for the page, and the folder opened in Explorer.
#[tauri::command(async)]
fn pvp_list() -> Vec<serde_json::Value> { pvpstore::list() }

#[tauri::command(async)]
fn pvp_get(name: String, lang: String) -> Option<serde_json::Value> {
    let tr = i18n::I18n::new(&lang);
    let f = pvpstore::read(&name)?;
    let mut view = dbview::view_of(&tr, &f["rec"], live::DEBRIEF_RULES.load(std::sync::atomic::Ordering::Relaxed))?;
    view["pvp"] = serde_json::json!({"me": f["me"], "opp": f["opponent"]["name"], "seen": f["opponent"]["seen"], "no": f["no"], "result": f["result"], "build": f.get("build").is_some(), "anchors": f["anchors"], "name": name});
    Some(view)
}

/// PVP: one of your saved files as text (to pair it with the other commander's), the fights of two sets of files that are the same fight, and two fights as one view.
#[tauri::command(async)]
fn pvp_text(name: String) -> Option<String> { pvpstore::text(&name) }

#[tauri::command(async)]
fn pvp_pairs(mine: Vec<String>, theirs: Vec<String>) -> serde_json::Value { pvpsync::pairs_json(&mine, &theirs) }

#[tauri::command(async)]
fn pvp_pair_get(a: String, b: String, nudge: f64, lang: String) -> Option<serde_json::Value> {
    let tr = i18n::I18n::new(&lang);
    let (fa, fb) = (pvpsync::parse(&a)?, pvpsync::parse(&b)?);
    pvpsync::pair_view(&tr, &fa, &fb, nudge.clamp(-120.0, 120.0), live::DEBRIEF_RULES.load(std::sync::atomic::Ordering::Relaxed))
}

#[tauri::command]
fn pvp_folder() -> bool {
    let Some(d) = pvpstore::dir() else { return false };
    let _ = std::fs::create_dir_all(&d);
    // the full path (never a name that a folder next to the app could answer to)
    let sys = std::env::var_os("SystemRoot").filter(|s| !s.is_empty()).map(std::path::PathBuf::from).unwrap_or_else(|| std::path::PathBuf::from(r"C:\Windows"));
    std::process::Command::new(sys.join("explorer.exe")).arg(&d).spawn().is_ok()
}

/// The diagnostic report (About page): counts of what the game wrote that this version does not know, as plain text. In memory only, nothing is sent:
/// the page puts the text on the clipboard when the player asks for it.
#[tauri::command(async)]
fn diagnostic_report() -> String {
    drift::report_text(env!("CARGO_PKG_VERSION"), drift::game_info())
}

/// A cheap yes/no for the Modes page note: did the game write something this version does not know?
#[tauri::command]
fn drift_flag() -> bool {
    drift::flag()
}

/// Opens THIRD-PARTY-LICENSES.txt (installed next to the exe; in a dev run the copy in the repo root), by its full path.
#[tauri::command]
fn open_licences() -> Result<(), String> {
    let exe_dir = std::env::current_exe().ok().and_then(|p| p.parent().map(std::path::Path::to_path_buf)).ok_or("no exe folder")?;
    let mut found = exe_dir.join("THIRD-PARTY-LICENSES.txt");
    if !found.is_file() {
        // a dev run (target/release or target/debug inside app/src-tauri): the repo root copy
        found = exe_dir.ancestors().map(|a| a.join("THIRD-PARTY-LICENSES.txt")).find(|p| p.is_file()).ok_or("THIRD-PARTY-LICENSES.txt was not found")?;
    }
    let sys = std::env::var_os("SystemRoot").filter(|s| !s.is_empty()).map(std::path::PathBuf::from).unwrap_or_else(|| std::path::PathBuf::from(r"C:\Windows"));
    std::process::Command::new(sys.join("explorer.exe")).arg(&found).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Which of the game's ship keys DEBRIEF follows (read from the Bindings file now), and which it cannot.
#[tauri::command(async)]
fn db_binds() -> serde_json::Value { dbview::binds_info() }

/// Past Thargoid: the Xeno Hunts kept (hunts.json), the same moves as Past combats.
#[tauri::command]
fn th_list(lang: String) -> Vec<serde_json::Value> {
    let _ = lang;
    let h = history::THIST.lock().ok();
    favs_first(h.as_deref().and_then(|h| h.as_ref()).map(|h| h.items.iter().map(|v| serde_json::json!({
        "t0": v["ep"]["t0"], "fav": history::fav_of(v), "line": thargoid::Th::line_of(v)})).collect()).unwrap_or_default())
}

#[tauri::command]
fn th_report(t0: serde_json::Value, lang: String) -> Option<serde_json::Value> {
    let tr = i18n::I18n::new(&lang);
    let h = history::THIST.lock().ok()?;
    let v = h.as_ref()?.items.iter().find(|v| v["ep"]["t0"] == t0)?;
    let past: Vec<thargoid::Hunt> = h.as_ref()?.items.iter().filter_map(thargoid::Hunt::from_value).collect();
    let (details, text) = thargoid::Th::texts_of(&tr, v, &past)?;
    Some(serde_json::json!({"details": details, "text": text}))
}

#[tauri::command]
fn th_show(t0: serde_json::Value) {
    if let Some(v) = history::THIST.lock().ok().and_then(|h| h.as_ref().and_then(|h| h.items.iter().find(|v| v["ep"]["t0"] == t0).cloned())) {
        if let Ok(mut s) = history::THSHOW.lock() { *s = Some(v); }
    }
}

#[tauri::command]
fn th_delete(t0: serde_json::Value) -> bool {
    let got = history::THIST.lock().ok().and_then(|mut h| h.as_mut().and_then(|h| h.delete(&t0)));
    let ok = got.is_some();
    if let Ok(mut u) = history::THUNDO.lock() { *u = got; }
    ok
}

#[tauri::command]
fn th_undo() {
    let got = history::THUNDO.lock().ok().and_then(|mut u| u.take());
    if let (Some((i, v)), Ok(mut h)) = (got, history::THIST.lock()) {
        if let Some(h) = h.as_mut() { h.put_back(i, v); }
    }
}

#[tauri::command]
fn th_fav(t0: serde_json::Value, on: bool) -> bool {
    history::THIST.lock().ok().and_then(|mut h| h.as_mut().map(|h| h.set_fav(&t0, on))).unwrap_or(false)
}

#[tauri::command]
fn past_report(t0: serde_json::Value, lang: String) -> Option<serde_json::Value> {
    let tr = i18n::I18n::new(&lang);
    let h = history::HISTORY.lock().ok()?;
    let v = h.as_ref()?.items.iter().find(|v| v["ep"]["t0"] == t0)?;
    Some(serde_json::json!({"details": reporttext::report_details(&tr, v), "text": reporttext::report_text(&tr, v)}))
}

#[tauri::command]
fn past_show(t0: serde_json::Value) {
    if let Some(v) = history::HISTORY.lock().ok().and_then(|h| h.as_ref().and_then(|h| h.items.iter().find(|v| v["ep"]["t0"] == t0).cloned())) {
        if let Ok(mut s) = history::SHOW.lock() {
            *s = Some(v);
        }
    }
}

#[tauri::command]
fn past_delete(t0: serde_json::Value) -> bool {
    let got = history::HISTORY.lock().ok().and_then(|mut h| h.as_mut().and_then(|h| h.delete(&t0)));
    let ok = got.is_some();
    if let Ok(mut u) = history::UNDO.lock() {
        *u = got;
    }
    ok
}

#[tauri::command]
fn past_undo() {
    let got = history::UNDO.lock().ok().and_then(|mut u| u.take());
    if let (Some((i, v)), Ok(mut h)) = (got, history::HISTORY.lock()) {
        if let Some(h) = h.as_mut() {
            h.put_back(i, v);
        }
    }
}

#[tauri::command]
fn combat_set(on: bool, app: tauri::AppHandle) {
    live::ENABLED.store(on, std::sync::atomic::Ordering::Relaxed);
    save_setting(&app, "combat", on);
}

/// The settings of the Combat windows as they are now (the menu and the window show the same).
#[tauri::command]
fn combat_settings() -> serde_json::Value {
    let s = live::SETTINGS.lock().map(|s| s.clone()).unwrap_or_default();
    if s.is_null() {
        let mut d = host::Settings::default();
        if let Some(c) = store::read().get("combat_settings") { d.apply_json(c); }
        d.to_json()
    } else {
        s
    }
}

/// One setting changed: its name ("opacity", "win.status.on") and its new value.
#[tauri::command]
fn combat_setting(key: String, value: serde_json::Value) {
    if let Ok(mut c) = live::CHANGES.lock() { c.push((key, value)); }
}

/// One of the keys' jobs done from a button: flip, report, reset, clear, hide, claims, report_clear.
#[tauri::command]
fn combat_action(name: String) {
    if ["flip", "report", "reset", "clear", "hide", "claims", "report_clear"].contains(&name.as_str()) {
        if let Ok(mut a) = live::ACTIONS.lock() { a.push(name); }
    }
}

/// The keys that do the jobs, as set now: (job, key text).
#[tauri::command]
fn map_get() -> serde_json::Value { mapwin::get_json() }
#[tauri::command]
fn map_set(key: String, value: serde_json::Value) { mapwin::set_key(&key, value); }
#[tauri::command]
fn map_open_site(app: tauri::AppHandle, mode: Option<String>, system: Option<String>) { mapwin::open_site(&app, mode.as_deref(), system.as_deref()); }
// the phones and tablets that follow (pairing.rs): the server's list, one device removed, the pairing stopped, the site opened in a browser with the pairing
#[tauri::command(async)]
fn pair_status(app: tauri::AppHandle) -> serde_json::Value { pairing::status(&app) }
#[tauri::command(async)]
fn pair_kick(app: tauri::AppHandle, id: String) -> serde_json::Value { pairing::kick(&app, &id) }
#[tauri::command(async)]
fn pair_stop(app: tauri::AppHandle) -> serde_json::Value { pairing::stop(&app) }
#[tauri::command(async)]
fn pair_link_code(app: tauri::AppHandle) -> serde_json::Value { pairing::link_code(&app) }
#[tauri::command]
fn pair_open_browser(app: tauri::AppHandle) -> bool {
    use tauri_plugin_opener::OpenerExt;
    pairing::browser_url().map(|u| app.opener().open_url(u, None::<&str>).is_ok()).unwrap_or(false)
}
#[tauri::command(async)]
fn visits_list() -> Vec<serde_json::Value> { visits::list() }

#[tauri::command]
fn hotkeys_get() -> Vec<(String, String)> {
    let saved = store::read();
    let custom: Vec<(String, String)> = saved.get("hotkeys").and_then(|v| v.as_object()).map(|o| o.iter().filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string()))).collect()).unwrap_or_default();
    let keys = hotkeys::Keys::new(&custom);
    hotkeys::JOBS.iter().map(|n| (n.to_string(), keys.text_of(n))).collect()
}

/// The app's language, for the windows' own sentences (the same language files as the app).
#[tauri::command]
fn set_hud_language(code: String) {
    if ["en", "de", "es", "fr", "pt-br", "ru"].contains(&code.as_str()) {
        if let Ok(mut l) = live::LANG.lock() { *l = code.clone(); }
        store::set(&[("lang", serde_json::json!(code))]);
    }
}

/// A bigger job from the pages (nudge a window, snap it, reset, defaults, a profile, the Claims reset, a key).
#[tauri::command]
fn combat_op(name: String, value: serde_json::Value) {
    if let Ok(mut o) = live::OPS.lock() { o.push((name, value)); }
}

#[tauri::command]
fn editor_rects() -> serde_json::Value {
    live::EDITRECTS.lock().map(|r| r.clone()).unwrap_or(serde_json::Value::Null)
}

#[tauri::command]
fn combat_extra() -> serde_json::Value {
    live::EXTRA.lock().map(|e| e.clone()).unwrap_or_default()
}

/// Every ship type the combat engine knows (for the ship order), A to Z.
#[tauri::command(async)]
fn ship_names_list() -> Vec<String> {
    let mut v: Vec<String> = live::ship_names().values().cloned().collect();
    v.sort();
    v.dedup();
    v
}

/// For each of the keys that do things: the game's own actions on the same key (the game gets our key too).
#[tauri::command(async)]
fn hotkey_conflicts() -> serde_json::Value {
    let saved = store::read();
    let custom: Vec<(String, String)> = saved.get("hotkeys").and_then(|v| v.as_object()).map(|o| o.iter().filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string()))).collect()).unwrap_or_default();
    let keys = hotkeys::Keys::new(&custom);
    let text = panelkeys::binds_file(&panelkeys::binds_dir()).and_then(|p| std::fs::read(p).ok()).map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default();
    let mut out = serde_json::Map::new();
    for job in hotkeys::JOBS.iter() {
        let t = keys.text_of(job);
        if t.is_empty() { continue; }
        let key = t.rsplit('+').next().unwrap_or("").to_string();
        let found = panelkeys::actions_using(&text, &key);
        if !found.is_empty() { out.insert(job.to_string(), serde_json::json!(found.join(", "))); }
    }
    serde_json::Value::Object(out)
}

/// Updates: where it stands (see updater.rs: only "a newer version exists" ever comes from the server).
#[tauri::command]
fn update_status() -> updater::Update {
    updater::state()
}

/// True in the Microsoft Store build (no updater there: the Store updates the app).
#[tauri::command]
fn store_build() -> bool {
    updater::STORE
}

#[tauri::command]
fn update_check() {
    updater::CHECK_NOW.store(true, std::sync::atomic::Ordering::SeqCst);
}

#[tauri::command]
fn update_install() {
    updater::INSTALL_NOW.store(true, std::sync::atomic::Ordering::SeqCst);
}

#[tauri::command]
fn set_auto_update(on: bool) {
    store::set(&[("auto_update", serde_json::json!(on))]);
    if let Ok(mut s) = updater::STATE.lock() {
        if let Some(u) = s.as_mut() { u.auto = on; }
    }
}

/// What's new: which version this is, which one the player last saw the notes of, and whether this is a first install (nothing to say then).
static TRAY: std::sync::OnceLock<tauri::tray::TrayIcon> = std::sync::OnceLock::new();
static FRESH: std::sync::OnceLock<bool> = std::sync::OnceLock::new();

#[tauri::command]
fn whatsnew_state() -> serde_json::Value {
    serde_json::json!({"current": updater::CURRENT, "seen": store::read().get("seen_version").and_then(|v| v.as_str()).unwrap_or(""), "fresh": FRESH.get().copied().unwrap_or(false)})
}

#[tauri::command]
fn whatsnew_seen() {
    store::set(&[("seen_version", serde_json::json!(updater::CURRENT))]);
}

#[tauri::command]
fn menu_toggle() { menu::request_toggle(); }

#[tauri::command]
fn menu_close() { menu::close(); }

/// Edit HUD on or off (the menu's button): the bars on the windows show over the game.
#[tauri::command]
fn edit_hud(on: bool, app: tauri::AppHandle) {
    // (a window is never built inside a command: commands run on the main thread and building one there freezes the app on Windows, this was the 0.7.0-0.7.4 hang)
    menu::store_edit_hud(on); // (at once: the menu's button reads it)
    let a = app.clone();
    let _ = app.run_on_main_thread(move || menu::set_edit_hud(&a, on));
}

#[tauri::command]
fn edit_hud_state() -> bool { menu::edit_hud() }

#[tauri::command]
fn menu_collapse(on: bool, app: tauri::AppHandle) { let a = app.clone(); let _ = app.run_on_main_thread(move || menu::collapse(&a, on)); }

/// The editor layer was clicked: the menu goes back on top of it.
#[tauri::command]
fn menu_raise(app: tauri::AppHandle) { let a = app.clone(); let _ = app.run_on_main_thread(move || menu::raise_menu(&a)); }

/// The app's window goes to the Windows tray (by the clock and the volume), the app keeps running.
#[tauri::command]
fn hide_to_tray(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") { let _ = w.hide(); menu::set_visible(&w, false); }
}

/// The Thargoid and On Foot modes on or off (the Combat one is combat_set).
#[tauri::command]
fn mode_set(name: String, on: bool, app: tauri::AppHandle) {
    match name.as_str() {
        "thargoid" => { live::THARGOID_ON.store(on, std::sync::atomic::Ordering::Relaxed); save_setting(&app, "thargoid_mode", on); }
        "foot" => { live::FOOT_ON.store(on, std::sync::atomic::Ordering::Relaxed); save_setting(&app, "foot_mode", on); }
        "debrief" => { live::DEBRIEF_ON.store(on, std::sync::atomic::Ordering::Relaxed); save_setting(&app, "debrief_mode", on); }
        "pvp" => { live::PVP_ON.store(on, std::sync::atomic::Ordering::Relaxed); save_setting(&app, "pvp_mode", on); }
        "pvp_shield" => { live::PVP_SHIELD.store(on, std::sync::atomic::Ordering::Relaxed); save_setting(&app, "pvp_shield", on); }
        "pvp_build" => { live::PVP_BUILD.store(on, std::sync::atomic::Ordering::Relaxed); save_setting(&app, "pvp_build", on); }
        "debrief_rules" => { live::DEBRIEF_RULES.store(on, std::sync::atomic::Ordering::Relaxed); save_setting(&app, "debrief_rules", on); }
        _ => {}
    }
}

#[tauri::command]
fn combat_preview(on: bool, app: tauri::AppHandle) {
    if on && !live::ENABLED.load(std::sync::atomic::Ordering::Relaxed) {
        // Preview shows the windows: it turns the Combat overlay on too (it works only with it)
        live::ENABLED.store(true, std::sync::atomic::Ordering::Relaxed);
        save_setting(&app, "combat", true);
    }
    live::PREVIEW.store(on, std::sync::atomic::Ordering::Relaxed);
}

#[tauri::command]
fn combat_info() -> serde_json::Value {
    let i = live::info();
    serde_json::json!({ "on": live::ENABLED.load(std::sync::atomic::Ordering::Relaxed), "thargoid": live::THARGOID_ON.load(std::sync::atomic::Ordering::Relaxed), "foot": live::FOOT_ON.load(std::sync::atomic::Ordering::Relaxed), "debrief": live::DEBRIEF_ON.load(std::sync::atomic::Ordering::Relaxed), "debrief_rules": live::DEBRIEF_RULES.load(std::sync::atomic::Ordering::Relaxed), "pvp": live::PVP_ON.load(std::sync::atomic::Ordering::Relaxed), "pvp_shield": live::PVP_SHIELD.load(std::sync::atomic::Ordering::Relaxed), "pvp_build": live::PVP_BUILD.load(std::sync::atomic::Ordering::Relaxed), "windows": i.windows, "shown": i.shown, "gui": i.gui, "error": i.error, "look": live::LOOKINFO.lock().map(|l| l.clone()).unwrap_or_default(), "preview": live::PREVIEW.load(std::sync::atomic::Ordering::Relaxed) })
}

fn settings_file(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    // GRAVITAS_DATA_DIR: another folder for the settings (the tests use it, so they never touch a player's own settings)
    if let Some(d) = crate::devenv::var_os("GRAVITAS_DATA_DIR").filter(|d| !d.is_empty()) { return Some(std::path::PathBuf::from(d).join("settings.json")); }
    app.path().app_config_dir().ok().map(|d| d.join("settings.json"))
}

fn read_settings(_app: &tauri::AppHandle) -> serde_json::Value {
    store::read()
}

/// A yes/no setting, `default` when it was never saved.
fn load_flag(app: &tauri::AppHandle, key: &str, default: bool) -> bool {
    read_settings(app).get(key).and_then(|b| b.as_bool()).unwrap_or(default)
}

fn save_setting(_app: &tauri::AppHandle, key: &str, on: bool) {
    store::set(&[(key, serde_json::json!(on))]);
}

fn game_running(sys: &mut System) -> bool {
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
    sys.processes().values().any(|p| p.name().to_string_lossy().eq_ignore_ascii_case(GAME))
}

/// One GRAVITAS at a time: a second start (also the one after an update) leaves at once.
fn only_one() -> bool {
    if crate::devenv::var("GRAVITAS_MULTI").is_some() { return true; } // (a developer test next to the real app)
    use windows::core::w;
    use windows::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS};
    use windows::Win32::System::Threading::{CreateEventW, CreateMutexW, OpenEventW, SetEvent, EVENT_MODIFY_STATE};
    unsafe {
        let h = CreateMutexW(None, true, w!("Local\\GRAVITAS-app-single"));
        std::mem::forget(h); // (kept for as long as the process lives)
        if GetLastError() == ERROR_ALREADY_EXISTS {
            // a second start (the Start menu, a shortcut): the one that runs brings its window back, then this one leaves
            if let Ok(ev) = OpenEventW(EVENT_MODIFY_STATE, false, w!("Local\\GRAVITAS-app-show")) {
                let _ = SetEvent(ev);
            }
            return false;
        }
        if let Ok(ev) = CreateEventW(None, false, false, w!("Local\\GRAVITAS-app-show")) {
            let raw = ev.0 as usize;
            std::thread::spawn(move || {
                use windows::Win32::Foundation::{HANDLE, WAIT_OBJECT_0};
                use windows::Win32::System::Threading::{WaitForSingleObject, INFINITE};
                loop {
                    if WaitForSingleObject(HANDLE(raw as *mut _), INFINITE) == WAIT_OBJECT_0 {
                        store::log("second start: show the window");
                        menu::request_show_main();
                    } else {
                        break; // (a failed wait must not spin the CPU)
                    }
                }
            });
        }
        true
    }
}

fn main() {
    webview_check::require(); // (no WebView2: one message box, then leave)
    guard::install_panic_log();
    if !only_one() {
        return;
    }
    let shared: Shared = Arc::new(Mutex::new(journal::State::default()));
    let for_thread = shared.clone();
    let for_map = shared.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(shared)
        .setup(move |app| {
            let handle = app.handle().clone();
            let _ = menu::APP.set(handle.clone());
            updater::start(handle.clone(), true);
            {
                use tauri::menu::{MenuBuilder, MenuItemBuilder};
                use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
                let show = MenuItemBuilder::with_id("show", "Show GRAVITAS").build(app)?;
                let menu_item = MenuItemBuilder::with_id("menu", "GRAVITAS menu").build(app)?;
                let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
                let tray_menu = MenuBuilder::new(app).items(&[&show, &menu_item, &quit]).build()?;
                let mut tray = TrayIconBuilder::new().tooltip(format!("GRAVITAS {}", updater::CURRENT)).menu(&tray_menu).show_menu_on_left_click(false)
                    .on_menu_event(|app, ev| match ev.id().as_ref() {
                        "show" => { store::log("tray: Show GRAVITAS"); menu::show_main(app) }
                        "menu" => { store::log("tray: menu"); menu::request_toggle() }
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, ev| {
                        match ev {
                            TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } | TrayIconEvent::DoubleClick { button: MouseButton::Left, .. } => { store::log("tray: click"); menu::show_main(tray.app_handle()) }
                            _ => {}
                        }
                    });
                if let Some(icon) = app.default_window_icon() { tray = tray.icon(icon.clone()); }
                let icon = tray.build(app)?;
                let _ = TRAY.set(icon); // (kept for as long as the app lives)
            }
            if let Some(p) = settings_file(&handle) {
                let _ = FRESH.set(!p.exists()); // (before anything writes: a first install has no settings file yet)
                if let Some(d) = p.parent() { history::init(d.join("combats.json")); history::init_hunts(d.join("hunts.json")); history::init_debriefs(d.join("debriefs.json")); }
                store::init(p);
            }
            if !load_flag(&handle, "auto_update", true) {
                if let Ok(mut s) = updater::STATE.lock() { if let Some(u) = s.as_mut() { u.auto = false; } }
            }
            let hover = false; // (the hide-while-the-mouse-is-over feature is gone: Burak, 16 Nov)
            live::HOVER_HIDE.store(hover, std::sync::atomic::Ordering::Relaxed);
            if let Some(l) = read_settings(&handle).get("lang").and_then(|v| v.as_str()) { if let Ok(mut g) = live::LANG.lock() { *g = l.to_string(); } }
            // (the modes come on by themselves now: all three are on until the player turns one off)
            live::ENABLED.store(load_flag(&handle, "combat", true), std::sync::atomic::Ordering::Relaxed);
            live::THARGOID_ON.store(load_flag(&handle, "thargoid_mode", true), std::sync::atomic::Ordering::Relaxed);
            live::FOOT_ON.store(load_flag(&handle, "foot_mode", true), std::sync::atomic::Ordering::Relaxed);
            // DEBRIEF follows keys: off until the player turns it on, and its observations too
            live::DEBRIEF_ON.store(load_flag(&handle, "debrief_mode", false), std::sync::atomic::Ordering::Relaxed);
            live::DEBRIEF_RULES.store(load_flag(&handle, "debrief_rules", false), std::sync::atomic::Ordering::Relaxed);
            // PVP mode follows nothing until it is switched on; the build is in the file unless the player says otherwise
            live::PVP_ON.store(load_flag(&handle, "pvp_mode", false), std::sync::atomic::Ordering::Relaxed);
            live::PVP_SHIELD.store(load_flag(&handle, "pvp_shield", false), std::sync::atomic::Ordering::Relaxed);
            live::PVP_BUILD.store(load_flag(&handle, "pvp_build", true), std::sync::atomic::Ordering::Relaxed);
            live::start();
            mapwin::start(handle.clone(), for_map.clone());
            mapfeed::start(handle.clone());
            pairing::start(handle.clone());
            app.manage(overlay::Overlay::start(hover));
            std::thread::spawn(move || guard::keep_running("journal", || {
                let mut tail = journal::Tail::new();
                let mut sys = System::new();
                let mut n: u32 = 0;
                let mut running = false;
                loop {
                    let mut changed = tail.poll();
                    if n % PROCESS_EVERY == 0 {
                        let r = game_running(&mut sys);
                        if r != running {
                            running = r;
                            changed = true;
                        }
                    }
                    n = n.wrapping_add(1);
                    tail.state.game_running = running;
                    updater::GAME_RUNNING.store(running, std::sync::atomic::Ordering::Relaxed);
                    if changed || n == 1 {
                        if let Ok(mut s) = for_thread.lock() {
                            *s = tail.state.clone();
                        }
                        let _ = handle.emit("journal-state", tail.state.clone());
                    }
                    std::thread::sleep(POLL);
                }
            }));
            Ok(())
        })
        .on_window_event(|window, event| {
            // the app's window is never destroyed: the close button and Alt+F4 take it to the tray (Quit is in the tray's menu)
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                    if let Some(w) = window.app_handle().get_webview_window("main") { menu::set_visible(&w, false); }
                }
            }
            // Alt+F4 on the menu or the editor must not destroy them (the menu would then think it is still open): it closes the menu as the key does
            if window.label() == "menu" || window.label() == "editor" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    menu::close_quiet();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![get_state, overlay_info, overlay_set_test, overlay_set_hover_hide, combat_set, mode_set, combat_preview, combat_info, combat_settings, combat_setting, combat_action, menu_toggle, menu_close, hotkeys_get, whatsnew_state, whatsnew_seen, update_status, store_build, update_check, update_install, set_auto_update, hotkey_conflicts, combat_op, combat_extra, editor_rects, ship_names_list, set_hud_language, hide_to_tray, edit_hud, edit_hud_state, menu_raise, menu_collapse, past_list, past_report, past_show, past_delete, past_undo, past_fav, th_list, th_report, th_show, th_delete, th_undo, th_fav, db_list, db_get, db_show, db_delete, db_undo, db_fav, db_binds, pvp_list, pvp_get, pvp_folder, pvp_text, pvp_pairs, pvp_pair_get, map_get, map_set, map_open_site, pair_status, pair_kick, pair_stop, pair_open_browser, pair_link_code, visits_list, diagnostic_report, drift_flag, open_licences])
        .run(tauri::generate_context!())
        .expect("error while running GRAVITAS");
}

#[cfg(test)]
mod capability_tests {
    /// The windows that show a page from the internet (the map windows) must never get a capability: no "remote" key, and no mention of their labels.
    #[test]
    fn the_capability_never_reaches_a_remote_page() {
        let t = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/capabilities/default.json")).unwrap();
        let v: serde_json::Value = serde_json::from_str(&t).unwrap();
        assert!(v.get("remote").is_none(), "capabilities/default.json must not have a remote key");
        let wins: Vec<&str> = v["windows"].as_array().unwrap().iter().filter_map(|w| w.as_str()).collect();
        for w in ["mapsite", "sysmap"] { assert!(!wins.contains(&w), "{w} must not have a capability"); }
        assert!(!t.contains("\"mapsite\"") && !t.contains("\"sysmap\""));
        for e in std::fs::read_dir(concat!(env!("CARGO_MANIFEST_DIR"), "/capabilities")).unwrap().flatten() {
            let s = std::fs::read_to_string(e.path()).unwrap_or_default();
            assert!(!s.contains("\"remote\"") && !s.contains("mapsite") && !s.contains("sysmap"), "{:?}", e.path());
        }
    }
}
