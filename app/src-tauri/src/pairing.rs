//! The pairing of phones and tablets ("Devices"), seen from the app. The app is the owner of the pairing when it runs:
//!  - The page that CREATES a pairing is the GRAVITAS MAP window (the site's own code makes the room, the code and the QR). The app never creates one.
//!  - The window's page keeps {room, host key} in its memory only (never in the web storage of that window). Every 2 s the app LOOKS at the page
//!    (WebView2 ExecuteScript, an answer comes back to the app: the page can call nothing in the app) and keeps its own copy in settings.json ("pairing").
//!  - A map window that is opened later is handed the app's copy (eval, the same way the Journal lines are handed over), so closing and
//!    opening the map window keeps the pairing.
//!  - The main window asks the server (HTTPS, gravitasmap.com only, the key in a header) who follows, removes a device, or stops the pairing.
//!  - LINK A BROWSER: the app asks the server for a one-time link code for its pairing (POST do=linkcode, the key in the header) and shows it. A normal browser
//!    on gravitasmap.com types it and is handed the pairing once (see PRIVACY.md). The code is 8 characters, lives 2 minutes and works once.
//! The host key never goes anywhere else: not into an address, not into a log, not to another host. "Open in the browser" puts it in the
//! address FRAGMENT (#host=room.key) that a browser never sends to a server.
use serde_json::{json, Value};
use std::sync::Mutex;
use std::time::Duration;

/// The only server this module ever talks to (GRAVITAS_MAP_URL does not move it: a development map window pairs with its own server, the app cannot see that).
pub const BASE: &str = "https://gravitasmap.com";
const KEY: &str = "pairing";

/// A pairing the app holds.
#[derive(Clone, Debug, PartialEq)]
pub struct Rec {
    pub room: String,
    pub key: String,
}

pub fn valid_room(s: &str) -> bool {
    (20..=32).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_lowercase() || (b'2'..=b'7').contains(&b))
}
pub fn valid_key(s: &str) -> bool {
    s.len() == 32 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn valid_id(s: &str) -> bool {
    s == "*" || (s.len() == 8 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)))
}

fn rec_of(room: &str, key: &str) -> Option<Rec> {
    (valid_room(room) && valid_key(key)).then(|| Rec { room: room.to_string(), key: key.to_string() })
}

/// What the page says about itself: `ready` = it has been handed the app's copy at least once (before that, an empty answer means nothing).
#[derive(Clone, Debug, PartialEq)]
pub struct Peek {
    pub ready: bool,
    pub rec: Option<Rec>,
}

/// The page's answer (a JSON text). Anything that is not exactly the shape is nothing.
pub fn parse_peek(text: &str) -> Option<Peek> {
    let v: Value = serde_json::from_str(text).ok()?;
    let o = v.as_object()?;
    let ready = o.get("ready")?.as_bool()?;
    // (a field is a text, null or missing; anything else is not an answer)
    let get = |k: &str| match o.get(k) { Some(Value::String(s)) => Some(Some(s.as_str())), None | Some(Value::Null) => Some(None), _ => None };
    let rec = match (get("room")?, get("hk")?) {
        (Some(r), Some(k)) => Some(rec_of(r, k)?),
        (None, None) => None,
        _ => return None,
    };
    Some(Peek { ready, rec })
}

/// What the app does after one look at the page.
#[derive(Debug, PartialEq)]
pub enum Action {
    Nothing,
    /// the page has not been handed the app's copy yet: hand it over (None = tell it there is none)
    Hand(Option<Rec>),
    /// the page holds a pairing the app does not (or another one): keep the page's
    Adopt(Rec),
    /// the page ended its pairing: forget it here too
    Forget,
    /// the page still holds a pairing the app knows is gone: tell it to drop it
    Drop(String),
}

/// `dead` = rooms the app has just seen end (stopped here or by the server): never taken back from a page that is slow to notice.
pub fn decide(app: Option<&Rec>, peek: Option<&Peek>, dead: &[String]) -> Action {
    let Some(p) = peek else { return Action::Nothing };
    if !p.ready { return Action::Hand(app.filter(|a| !dead.contains(&a.room)).cloned()); }
    match (app, &p.rec) {
        (_, Some(r)) if dead.contains(&r.room) => Action::Drop(r.room.clone()),
        (a, Some(r)) if a != Some(r) => Action::Adopt(r.clone()),
        (Some(_), None) => Action::Forget,
        _ => Action::Nothing,
    }
}

/// The address that opens the site in a browser already holding this pairing. The fragment is not sent to any server by a browser.
pub fn fragment_url(r: &Rec) -> String {
    format!("{BASE}/#host={}.{}", r.room, r.key)
}

// ---- the copy in settings.json
fn rec_in(settings: &Value) -> Option<Rec> {
    let p = settings.get(KEY)?;
    rec_of(p.get("room")?.as_str()?, p.get("hk")?.as_str()?)
}
fn value_of(r: Option<&Rec>) -> Value { r.map(|r| json!({"room": r.room, "hk": r.key})).unwrap_or(Value::Null) }
pub fn load() -> Option<Rec> { rec_in(&crate::store::read()) }
fn save(r: Option<&Rec>) { crate::store::set(&[(KEY, value_of(r))]); }

static DEAD: Mutex<Vec<String>> = Mutex::new(Vec::new());
fn dead() -> Vec<String> { DEAD.lock().map(|d| d.clone()).unwrap_or_default() }
fn bury(room: &str) {
    if let Ok(mut d) = DEAD.lock() { d.push(room.to_string()); let n = d.len(); if n > 8 { d.drain(..n - 8); } }
}

// ---- the server
fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new().timeout(Duration::from_secs(12)).user_agent(&format!("GRAVITAS-app/{}", env!("CARGO_PKG_VERSION"))).build()
}

/// What a call to the server came to.
#[derive(Debug, PartialEq)]
pub enum Answer {
    Ok(Value),
    /// the pairing is not there any more (stopped, expired) or the key is not its key
    Gone,
    Busy(String),
    Failed(String),
}

/// The address of one call. The key is NOT in it (it travels in the X-Host-Key header).
pub fn call_url(room: &str, what: &str, to: Option<&str>) -> Option<String> {
    if !valid_room(room) || !matches!(what, "status" | "kick" | "stop" | "linkcode") { return None; }
    match (what, to) {
        ("kick", Some(t)) if valid_id(t) => Some(format!("{BASE}/api/room?room={room}&do=kick&to={}", if t == "*" { "*" } else { t })),
        ("kick", _) => None,
        _ => Some(format!("{BASE}/api/room?room={room}&do={what}")),
    }
}

fn ask(r: &Rec, what: &str, to: Option<&str>) -> Answer {
    let Some(url) = call_url(&r.room, what, to) else { return Answer::Failed("bad call".into()) };
    let req = if what == "status" { agent().get(&url) } else { agent().post(&url) }.set("X-Host-Key", &r.key);
    let res = if what == "status" { req.call() } else { req.send_string("") };
    match res {
        Ok(resp) => match resp.into_string().ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()) { Some(v) => Answer::Ok(v), None => Answer::Failed("not readable".into()) },
        Err(ureq::Error::Status(403, _)) | Err(ureq::Error::Status(410, _)) => Answer::Gone,
        Err(ureq::Error::Status(429, _)) => Answer::Busy("too many calls, trying again in a moment".into()),
        Err(ureq::Error::Status(c, _)) => Answer::Failed(format!("the server answered {c}")),
        Err(e) => Answer::Failed(format!("no answer: {e}")),
    }
}

/// The list the page of the main window shows: {state: none | ok | gone | busy | error, hostOn, devices:[{id,n,awake,since,mode}], max}.
/// Only these fields are passed on (nothing else the server says reaches the page).
pub fn shape(v: &Value) -> Value {
    let devices: Vec<Value> = v.get("devices").and_then(Value::as_array).map(|a| a.iter().take(8).filter_map(|d| {
        let id = d.get("id")?.as_str()?;
        if !valid_id(id) || id == "*" { return None; }
        Some(json!({
            "id": id,
            "n": d.get("n").and_then(Value::as_str).unwrap_or("").chars().filter(|c| !c.is_control() && !"<>\"`".contains(*c)).take(40).collect::<String>(),
            "awake": d.get("awake").and_then(Value::as_bool).unwrap_or(false),
            "since": d.get("since").and_then(Value::as_f64).unwrap_or(0.0),
            "mode": if d.get("mode").and_then(Value::as_str) == Some("direct") { "direct" } else { "server" },
        }))
    }).collect()).unwrap_or_default();
    json!({"state": "ok", "hostOn": v.get("hostOn").and_then(Value::as_bool).unwrap_or(false), "devices": devices, "max": 4})
}

/// A link code as the server writes it: "ABCD-EFGH", 8 characters of a 32-character alphabet (no I, O, 0, 1).
pub fn valid_link_code(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 9 && b[4] == b'-' && b.iter().enumerate().all(|(i, c)| i == 4 || ((b'A'..=b'Z').contains(c) && *c != b'I' && *c != b'O') || (b'2'..=b'9').contains(c))
}

/// What the page of the main window gets for a link code: {state: ok, code, ttl} (ttl in seconds, 1 to 300, the server's own count: no clock of ours is compared with theirs).
/// Anything that is not exactly the shape is an error (the page never shows a text the server made up).
pub fn shape_link(v: &Value) -> Value {
    let code = v.get("code").and_then(Value::as_str).unwrap_or("");
    let ttl = v.get("ttl").and_then(Value::as_f64).unwrap_or(0.0);
    if !valid_link_code(code) || !(1.0..=300.0).contains(&ttl) { return json!({"state": "error", "msg": "the server's answer was not a link code"}); }
    json!({"state": "ok", "code": code, "ttl": ttl.floor() as u64})
}

fn answer_json(a: Answer) -> Value {
    match a {
        Answer::Ok(v) => shape(&v),
        Answer::Gone => json!({"state": "gone"}),
        Answer::Busy(m) => json!({"state": "busy", "msg": m}),
        Answer::Failed(m) => json!({"state": "error", "msg": m}),
    }
}

/// The page (the map window) is told to drop a pairing / is handed one. Only a window that shows gravitasmap.com gets the key.
fn on_own_site(w: &tauri::WebviewWindow) -> bool {
    w.url().ok().and_then(|u| u.host_str().map(|h| h == "gravitasmap.com")).unwrap_or(false)
}
fn js(s: &str) -> String { Value::String(s.to_string()).to_string() }
fn tell_page(app: &tauri::AppHandle, script: &str) {
    use tauri::Manager;
    if let Some(w) = app.get_webview_window("mapsite") { let _ = w.eval(script); }
}
fn forget(app: &tauri::AppHandle, room: &str) {
    bury(room);
    if load().map(|r| r.room == room).unwrap_or(false) { save(None); }
    tell_page(app, &format!("window.__gravitasApp&&__gravitasApp.pairClear&&__gravitasApp.pairClear({})", js(room)));
}

pub fn status(app: &tauri::AppHandle) -> Value {
    let Some(r) = load() else { return json!({"state": "none"}) };
    let a = ask(&r, "status", None);
    if a == Answer::Gone { forget(app, &r.room); }
    answer_json(a)
}
pub fn kick(app: &tauri::AppHandle, id: &str) -> Value {
    let Some(r) = load() else { return json!({"state": "none"}) };
    if !valid_id(id) { return json!({"state": "error", "msg": "bad device"}); }
    let a = ask(&r, "kick", Some(id));
    if a == Answer::Gone { forget(app, &r.room); }
    answer_json(a)
}
pub fn stop(app: &tauri::AppHandle) -> Value {
    let Some(r) = load() else { return json!({"state": "none"}) };
    match ask(&r, "stop", None) {
        Answer::Ok(_) | Answer::Gone => { forget(app, &r.room); json!({"state": "none"}) }
        a => answer_json(a),
    }
}
/// A one-time link code for this pairing (POST do=linkcode, the key in the X-Host-Key header). None of it is kept here: it is shown, then it is gone.
pub fn link_code(app: &tauri::AppHandle) -> Value {
    let Some(r) = load() else { return json!({"state": "none"}) };
    match ask(&r, "linkcode", None) {
        Answer::Ok(v) => shape_link(&v),
        Answer::Gone => { forget(app, &r.room); json!({"state": "gone"}) }
        a => answer_json(a),
    }
}
/// The site in the default browser, holding this pairing (see the top of this file). None when there is no pairing.
pub fn browser_url() -> Option<String> { load().map(|r| fragment_url(&r)) }

// ---- looking at the map window's page
fn peek_page(w: &tauri::WebviewWindow) -> Option<Peek> {
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    let ok = w.with_webview(move |wv| unsafe {
        use webview2_com::ExecuteScriptCompletedHandler;
        let Ok(core) = wv.controller().CoreWebView2() else { return };
        let handler = ExecuteScriptCompletedHandler::create(Box::new(move |res, text: String| {
            if res.is_ok() { let _ = tx.send(text); }
            Ok(())
        }));
        let script = windows::core::HSTRING::from("(function(){try{return window.__gravitasApp&&__gravitasApp.pairPeek?__gravitasApp.pairPeek():null}catch(e){return null}})()");
        let _ = core.ExecuteScript(&script, &handler);
    });
    if ok.is_err() { return None; }
    let raw = rx.recv_timeout(Duration::from_millis(1500)).ok()?;          // (the page's answer is a JSON text inside a JSON text)
    let inner: String = serde_json::from_str(&raw).ok()?;
    parse_peek(&inner)
}

pub fn start(app: tauri::AppHandle) {
    std::thread::Builder::new()
        .name("GRAVITAS pairing".into())
        .spawn(move || crate::guard::keep_running("pairing", || {
            use tauri::Manager;
            loop {
                std::thread::sleep(Duration::from_millis(2000));
                let Some(w) = app.get_webview_window("mapsite") else { continue };   // (no map window: nothing to look at)
                if !on_own_site(&w) { continue; }
                let peek = peek_page(&w);
                match decide(load().as_ref(), peek.as_ref(), &dead()) {
                    Action::Nothing => {}
                    Action::Hand(r) => {
                        let s = match r { Some(r) => format!("window.__gravitasApp&&__gravitasApp.pairIn&&__gravitasApp.pairIn({},{})", js(&r.room), js(&r.key)), None => "window.__gravitasApp&&__gravitasApp.pairIn&&__gravitasApp.pairIn(null,null)".into() };
                        let _ = w.eval(&s);
                    }
                    Action::Adopt(r) => save(Some(&r)),
                    Action::Forget => { if let Some(r) = load() { bury(&r.room); } save(None); }
                    Action::Drop(room) => { let _ = w.eval(&format!("window.__gravitasApp&&__gravitasApp.pairClear&&__gravitasApp.pairClear({})", js(&room))); }
                }
            }
        }))
        .ok();
}

#[cfg(test)]
mod tests {
    use super::*;
    const ROOM: &str = "abcdefghijklmnopqrst";
    const ROOM2: &str = "zyxwvutsrqponmlkjihg";
    const KEY1: &str = "0123456789abcdef0123456789abcdef";
    fn rec(room: &str) -> Rec { Rec { room: room.into(), key: KEY1.into() } }
    fn peek(ready: bool, r: Option<Rec>) -> Peek { Peek { ready, rec: r } }

    #[test]
    fn rooms_and_keys_have_exactly_the_servers_shape() {
        assert!(valid_room(ROOM) && valid_key(KEY1));
        assert!(!valid_room("short") && !valid_room("ABCDEFGHIJKLMNOPQRST") && !valid_room("abcdefghijklmnopqrs1") && !valid_room(&"a".repeat(33)));
        assert!(!valid_key("0123") && !valid_key(&"G".repeat(32)) && !valid_key(&"a".repeat(33)));
        assert!(valid_id("*") && valid_id("0a1b2c3d") && !valid_id("zz") && !valid_id("0a1b2c3d4") && !valid_id(""));
    }

    #[test]
    fn the_page_answer_is_read_strictly() {
        let ok = format!(r#"{{"ready":true,"room":"{ROOM}","hk":"{KEY1}"}}"#);
        assert_eq!(parse_peek(&ok), Some(peek(true, Some(rec(ROOM)))));
        assert_eq!(parse_peek(r#"{"ready":false,"room":null,"hk":null}"#), Some(peek(false, None)));
        assert_eq!(parse_peek(r#"{"ready":true}"#), Some(peek(true, None)));
        assert_eq!(parse_peek(&format!(r#"{{"ready":true,"room":"{ROOM}","hk":"nope"}}"#)), None, "a bad key is not an answer");
        assert_eq!(parse_peek(&format!(r#"{{"ready":true,"room":"{ROOM}"}}"#)), None, "a room without its key is not an answer");
        assert_eq!(parse_peek("null"), None);
        assert_eq!(parse_peek("[1]"), None);
        assert_eq!(parse_peek(r#"{"room":"x"}"#), None);
    }

    #[test]
    fn what_the_app_does_after_a_look() {
        let a = rec(ROOM);
        assert_eq!(decide(Some(&a), None, &[]), Action::Nothing, "no page, no hook: nothing");
        assert_eq!(decide(Some(&a), Some(&peek(false, None)), &[]), Action::Hand(Some(a.clone())), "a fresh page is handed the app's copy");
        assert_eq!(decide(None, Some(&peek(false, None)), &[]), Action::Hand(None));
        assert_eq!(decide(Some(&a), Some(&peek(false, None)), &[ROOM.into()]), Action::Hand(None), "a pairing that ended is not handed out");
        assert_eq!(decide(None, Some(&peek(true, Some(a.clone()))), &[]), Action::Adopt(a.clone()), "the page made one: the app keeps it");
        assert_eq!(decide(Some(&a), Some(&peek(true, Some(rec(ROOM2)))), &[]), Action::Adopt(rec(ROOM2)), "the page made a NEW link: that one wins");
        assert_eq!(decide(Some(&a), Some(&peek(true, None)), &[]), Action::Forget, "the page ended it: forgotten here too");
        assert_eq!(decide(Some(&a), Some(&peek(true, Some(a.clone()))), &[]), Action::Nothing);
        assert_eq!(decide(None, Some(&peek(true, None)), &[]), Action::Nothing);
        assert_eq!(decide(None, Some(&peek(true, Some(a.clone()))), &[ROOM.into()]), Action::Drop(ROOM.into()), "a slow page is not allowed to bring a dead pairing back");
    }

    #[test]
    fn a_call_never_carries_the_key_in_its_address() {
        let u = call_url(ROOM, "status", None).unwrap();
        assert_eq!(u, format!("https://gravitasmap.com/api/room?room={ROOM}&do=status"));
        assert!(!u.contains(KEY1) && !u.contains("hk"));
        assert_eq!(call_url(ROOM, "kick", Some("0a1b2c3d")).unwrap(), format!("https://gravitasmap.com/api/room?room={ROOM}&do=kick&to=0a1b2c3d"));
        assert!(call_url(ROOM, "kick", Some("../x")).is_none() && call_url(ROOM, "kick", None).is_none());
        assert!(call_url("bad room", "status", None).is_none() && call_url(ROOM, "explode", None).is_none());
        assert!(call_url(ROOM, "stop", None).unwrap().starts_with("https://gravitasmap.com/"));
        let l = call_url(ROOM, "linkcode", None).unwrap();
        assert_eq!(l, format!("https://gravitasmap.com/api/room?room={ROOM}&do=linkcode"));
        assert!(!l.contains(KEY1) && call_url(ROOM, "link", None).is_none(), "the redeem call is the browser's, never the app's");
    }

    #[test]
    fn the_browser_address_keeps_the_key_in_the_fragment_only() {
        let u = fragment_url(&rec(ROOM));
        assert_eq!(u, format!("https://gravitasmap.com/#host={ROOM}.{KEY1}"));
        let (before, after) = u.split_once('#').unwrap();
        assert!(!before.contains(KEY1) && after.contains(KEY1), "a browser never sends what follows the #");
    }

    #[test]
    fn the_list_for_the_page_has_only_its_own_fields() {
        let v = json!({"ok": true, "hostOn": true, "hk": "secret", "devices": [
            {"id": "0a1b2c3d", "n": "Android phone <b>x</b>", "awake": true, "since": 5.0, "mode": "direct", "extra": 1},
            {"id": "../etc", "n": "bad id", "awake": true},
            {"id": "11112222", "n": "x".repeat(100), "awake": false, "mode": "weird"}]});
        let s = shape(&v);
        assert_eq!(s["state"], "ok");
        assert_eq!(s["devices"].as_array().unwrap().len(), 2, "a device with a bad id is left out");
        assert_eq!(s["devices"][0]["n"], "Android phone bx/b", "markup characters are dropped");
        assert!(!s.to_string().contains("secret") && !s.to_string().contains("extra"));
        assert_eq!(s["devices"][1]["n"].as_str().unwrap().len(), 40);
        assert_eq!(s["devices"][1]["mode"], "server");
    }

    #[test]
    fn a_link_code_has_exactly_the_servers_shape() {
        assert!(valid_link_code("ABCD-EFGH") && valid_link_code("2345-9ZXW") && valid_link_code("HJKL-MNPQ"));
        for bad in ["ABCDEFGH", "ABCD-EFG", "ABCD-EFGHJ", "abcd-efgh", "ABCD-EFGO", "ABCD-EFGI", "ABCD-EFG0", "ABCD-EFG1", "ABC-DEFGH", "ABCD EFGH", "", "ABCD-EFG\u{e9}"] {
            assert!(!valid_link_code(bad), "{bad} is not a link code");
        }
    }

    #[test]
    fn the_page_gets_a_link_code_only_in_the_exact_shape() {
        let ok = shape_link(&json!({"code": "ABCD-EFGH", "ttl": 120, "room": ROOM, "hostKey": KEY1}));
        assert_eq!(ok, json!({"state": "ok", "code": "ABCD-EFGH", "ttl": 120}), "only code and ttl are passed on");
        assert!(!ok.to_string().contains(KEY1) && !ok.to_string().contains(ROOM));
        for v in [json!({}), json!({"code": "ABCD-EFGH"}), json!({"code": "ABCD-EFGH", "ttl": 0}), json!({"code": "ABCD-EFGH", "ttl": 9999}), json!({"code": "<b>x</b>", "ttl": 5}), json!({"code": 5, "ttl": 5}), json!({"code": "ABCD-EFGH", "ttl": "120"})] {
            assert_eq!(shape_link(&v)["state"], "error", "{v} is not a link code answer");
        }
    }

    #[test]
    fn the_copy_in_settings_round_trips() {
        // (pure: the settings file is shared by all tests, so only the value's shape is tested here)
        let mut s = json!({"lang": "en"});
        assert_eq!(rec_in(&s), None);
        s[KEY] = value_of(Some(&rec(ROOM)));
        assert_eq!(rec_in(&s), Some(rec(ROOM)));
        assert_eq!(s[KEY]["room"], ROOM);
        s[KEY] = json!({"room": "bad", "hk": KEY1});
        assert_eq!(rec_in(&s), None, "a bad copy is no copy");
        s[KEY] = value_of(None);
        assert_eq!(rec_in(&s), None);
    }
}
