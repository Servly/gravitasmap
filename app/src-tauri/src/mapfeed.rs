//! Sync for the GRAVITAS Map window. The app reads the Journal folder anyway, so the map window never has to ask for it (the browser's folder question
//! is skipped: src/js/48-app-hook.js turns what arrives here into a folder the site's own Sync reads).
//! What is handed over, and only while the map window is open: the Journal lines whose event the Sync needs (the same list as the site's own Sync), the
//! newest Journal's tail when the window opens, then every new line; Status.json and NavRoute.json when they change. It all goes into the page with `eval`
//! (the page gets no power and answers nothing). The page works on it in the window and keeps it nowhere. Nothing is sent to any server by this.
//! When the page (re)loads, the app hands everything over again once (on_page_load), so a slow or reloaded page is never left empty.
use crate::journal;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime};
use tauri::{AppHandle, Manager};

/// The same events as SYNC_EV in src/js/30-sync.js. Everything else in the Journal stays here.
pub(crate) const EVENTS: &[&str] = &[
    "Scan", "Shutdown", "LoadGame", "Location", "FSDJump", "CarrierJump", "StartJump", "ApproachBody", "SupercruiseExit", "Touchdown", "Docked", "LeaveBody", "Undocked",
    "ApproachSettlement", "Liftoff", "Disembark", "Embark", "NavRoute", "NavRouteClear", "Loadout", "CarrierLocation", "CarrierJumpRequest", "CarrierJumpCancelled", "CarrierStats",
    "Music", "ShipTargeted", "UnderAttack", "Bounty", "FactionKillBond", "CapShipBond", "HeatWarning", "HeatDamage", "ShieldState", "HullDamage", "Interdicted", "Interdiction",
    "EscapeInterdiction", "Died", "Resurrect", "GameModeChange", "WingJoin", "WingAdd", "WingLeave", "SupercruiseDestinationDrop", "FighterDestroyed", "LaunchFighter",
    "SupercruiseEntry", "Missions", "Statistics", "ReceiveText", "CommitCrime", "Rank", "Progress",
];
/// how much of the newest Journal is read when the window opens (the page looks back from the end for the last jump)
const TAIL: u64 = 1_500_000;
/// what is kept for a page that loads again: the newest lines up to about this much (older ones are dropped from the front, the page is never reset by it)
const CAP: usize = 4 * 1024 * 1024;
/// more than this arriving in one look (the thread was away): start again from the tail
const BURST: u64 = 4_000_000;
/// the folder is listed this often to find a newer Journal (the page itself looks every 15 s)
const RELIST: Duration = Duration::from_secs(10);

/// When the map page finished loading last (set from the window's on_page_load): the hand-over is then sent again, once.
static PAGE_LOADED: Mutex<Option<Instant>> = Mutex::new(None);
pub fn page_loaded() {
    if let Ok(mut g) = PAGE_LOADED.lock() { *g = Some(Instant::now()); }
}

/// Does the Sync need this Journal line?
pub fn keep(line: &str) -> bool {
    let Some(i) = line.find("\"event\":\"") else { return false };
    let r = &line[i + 9..];
    let Some(j) = r.find('"') else { return false };
    EVENTS.contains(&&r[..j])
}

/// The event name of a line (the part after "event":").
fn event_of(line: &str) -> Option<&str> {
    let i = line.find("\"event\":\"")?;
    let r = &line[i + 9..];
    Some(&r[..r.find('"')?])
}

/// Fields the site's code really reads, per event (checked against src/js: 42-combat-engine.js cbEvent, 41-own-carrier.js fcEvent, 30-sync.js).
/// "timestamp" and "event" always stay. Everything else of these events is removed before the line is handed to the page.
const FIELDS: &[(&str, &[&str])] = &[
    ("LoadGame", &["Commander", "Ship", "Ship_Localised", "ShipName", "ShipIdent"]),
    ("CarrierStats", &["CarrierID", "CarrierType", "Name", "Callsign"]),
    ("Statistics", &["Combat"]),
    ("Missions", &["Active"]),
    ("Rank", &["Combat"]),
    ("Progress", &["Combat"]),
];
/// Statistics.Combat: only what cbEvent reads
const STAT_COMBAT: &[&str] = &["Bounties_Claimed", "Bounty_Hunting_Profit", "Combat_Bonds", "Combat_Bond_Profits", "Highest_Single_Reward"];
/// Missions.Active entries: only Name and whether it Expires (the Operation's name is read from it)
const MISSION: &[&str] = &["Name", "Expires"];

fn only(o: &mut serde_json::Map<String, serde_json::Value>, keys: &[&str]) {
    o.retain(|k, _| keys.contains(&k.as_str()) || k == "timestamp" || k == "event");
}

/// Takes the identifying and unused fields out of a Journal line before it goes to the map page. Lines of other events pass untouched (fast path),
/// except that a "FID" (the commander's Frontier ID) is removed wherever it is. A line that has to be cleaned but cannot be parsed is dropped (empty string).
pub fn scrub(line: &str) -> String {
    use serde_json::Value;
    let Some(ev) = event_of(line) else { return line.to_string() };
    let table = FIELDS.iter().find(|(e, _)| *e == ev).map(|(_, f)| *f);
    if table.is_none() && ev != "ReceiveText" && !line.contains("\"FID\"") { return line.to_string(); }
    let Ok(Value::Object(mut o)) = serde_json::from_str::<Value>(line) else { return String::new() };
    o.remove("FID");
    if ev == "ReceiveText" {
        // what is read: wing lines: Channel, From (a count per teammate); npc lines: the game's own code words and the NPC's text. Player chat: nothing but the channel.
        let ch = o.get("Channel").and_then(|c| c.as_str()).unwrap_or("").to_string();
        let keys: &[&str] = match ch.as_str() {
            "npc" => &["Channel", "From", "From_Localised", "Message", "Message_Localised"],
            "wing" => &["Channel", "From", "From_Localised"],
            _ => &["Channel"],
        };
        only(&mut o, keys);
    } else if let Some(f) = table {
        only(&mut o, f);
        if let Some(Value::Object(c)) = o.get_mut("Combat") { only(c, STAT_COMBAT); }
        if let Some(Value::Array(a)) = o.get_mut("Active") {
            for m in a.iter_mut() { if let Value::Object(m) = m { only(m, MISSION); } }
        }
    }
    serde_json::to_string(&Value::Object(o)).unwrap_or_default()
}

/// Only the lines the Sync needs, cleaned by scrub, each ended by a newline.
pub fn filtered(text: &str) -> String {
    let mut out = String::new();
    for l in text.lines() {
        if keep(l) {
            let c = scrub(l);
            if !c.is_empty() { out.push_str(&c); out.push('\n'); }
        }
    }
    out
}

/// The newest Journal by name (new names carry the date: Journal.2026-11-24T120000.01.log), old-style names by their time.
fn newest(dir: &Path) -> Option<PathBuf> {
    let mut best: Option<(bool, String, SystemTime, PathBuf)> = None;
    for e in fs::read_dir(dir).ok()?.filter_map(|e| e.ok()) {
        let n = e.file_name().to_string_lossy().into_owned();
        if !(n.starts_with("Journal.") && n.ends_with(".log")) { continue; }
        let dated = n.as_bytes().get(12) == Some(&b'-');
        let m = e.metadata().ok().and_then(|m| m.modified().ok()).unwrap_or(SystemTime::UNIX_EPOCH);
        let k = (dated, if dated { n.clone() } else { String::new() }, m, e.path());
        if best.as_ref().map(|b| (b.0, &b.1, b.2) < (k.0, &k.1, k.2)).unwrap_or(true) { best = Some(k); }
    }
    best.map(|b| b.3)
}

/// Bytes from `from` to the end (at most `max`), and the file's length; a cut in the middle of a letter is repaired by the lossy conversion.
fn read_from(path: &Path, from: u64, max: u64) -> Option<(Vec<u8>, u64)> {
    let mut f = fs::File::open(path).ok()?;
    let len = f.metadata().ok()?.len();
    let start = if len.saturating_sub(from) > max { len - max } else { from.min(len) };
    f.seek(SeekFrom::Start(start)).ok()?;
    let mut b = Vec::new();
    f.take(len - start).read_to_end(&mut b).ok()?;
    Some((b, len))
}

fn js_str(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| "\"\"".into())
}

pub struct Feed {
    pub name: String,
    pos: u64,
    rest: Vec<u8>,
    /// the newest lines the page has been given (for a page that loads again), at most about CAP
    pub acc: String,
}

/// What one look at the Journal found.
#[derive(Debug, PartialEq)]
pub enum Step {
    /// nothing new
    Nothing,
    /// new lines for the page (only the ones the Sync needs, may be empty when the new lines were all of other events)
    Add(String),
    /// the file got shorter or far too much arrived at once: start again from the tail
    Again,
}

/// The first look at a Journal: its tail (or the whole file when it is small), cut at a line start.
pub fn open_feed(path: &Path) -> Option<Feed> {
    let name = path.file_name()?.to_string_lossy().into_owned();
    let (b, len) = read_from(path, 0, TAIL)?;
    let mut text = String::from_utf8_lossy(&b).into_owned();
    if len > TAIL { if let Some(i) = text.find('\n') { text = text[i + 1..].to_string(); } }
    // a half line at the very end waits for the rest
    let (done, rest) = match text.rfind('\n') { Some(i) => (text[..=i].to_string(), text[i + 1..].as_bytes().to_vec()), None => (String::new(), text.into_bytes()) };
    let mut acc = filtered(&done);
    // The page finds where the ship is from the last Location / FSDJump / CarrierJump line. A long session in one system (no jump for a long time) has that
    // line far above the tail, so the page waited for the game forever: when the tail has none, the newest one is looked for in the part above it (read only).
    if len > TAIL && !has_position(&acc) {
        if let Some(front) = earlier_position(path, len - TAIL) { acc = front + &acc; }
    }
    Some(Feed { name, pos: len, rest, acc })
}

/// Does this text hold a line that says where the ship is?
fn has_position(text: &str) -> bool {
    text.contains("\"event\":\"Location\"") || text.contains("\"event\":\"FSDJump\"") || text.contains("\"event\":\"CarrierJump\"")
}

/// Bytes `a..b` of a file (read only).
fn read_range(path: &Path, a: u64, b: u64) -> Option<Vec<u8>> {
    let mut f = fs::File::open(path).ok()?;
    f.seek(SeekFrom::Start(a)).ok()?;
    let mut v = Vec::new();
    f.take(b.saturating_sub(a)).read_to_end(&mut v).ok()?;
    Some(v)
}

/// In the bytes `0..end` of the Journal: the newest position line and the newest Loadout line (for the jump range), already filtered, or None.
/// Looks back in pieces of 4 MB, at most 64 MB, so a huge file costs little. Read only.
fn earlier_position(path: &Path, end: u64) -> Option<String> {
    const STEP: u64 = 4 * 1024 * 1024;
    const LIMIT: u64 = 64 * 1024 * 1024;
    let nl = '\n';
    let mut hi = end;
    let mut loadout: Option<String> = None;
    while hi > 0 && end - hi < LIMIT {
        let lo = hi.saturating_sub(STEP);
        let b = read_range(path, lo, hi)?;
        let text = String::from_utf8_lossy(&b).into_owned();
        // a piece that starts in the middle of the file starts in the middle of a line: that first part is left out
        let body: &str = if lo > 0 { match text.find(nl) { Some(k) => &text[k + 1..], None => "" } } else { &text };
        if loadout.is_none() { loadout = body.lines().rev().find(|l| l.contains("\"event\":\"Loadout\"")).map(str::to_string); }
        if let Some(pos) = body.lines().rev().find(|l| has_position(l)) {
            let mut raw = String::new();
            if let Some(x) = &loadout { raw.push_str(x); raw.push(nl); }
            raw.push_str(pos); raw.push(nl);
            return Some(filtered(&raw));
        }
        hi = lo;
    }
    None
}

/// The newest lines up to CAP: older ones go from the front, at a line start.
fn trim(acc: &mut String, cap: usize) {
    if acc.len() <= cap { return; }
    let mut cut = acc.len() - cap * 3 / 4;
    while !acc.is_char_boundary(cut) { cut += 1; }
    let at = acc[cut..].find('\n').map(|i| cut + i + 1).unwrap_or(acc.len());
    acc.drain(..at);
}

/// One look at the file: what is new since the last one.
pub fn advance(f: &mut Feed, path: &Path) -> Step {
    let Some((b, len)) = read_from(path, f.pos, BURST) else { return Step::Nothing };
    if len < f.pos || len - f.pos > BURST { return Step::Again; }
    if b.is_empty() || len == f.pos { return Step::Nothing; }
    f.pos = len;
    f.rest.extend_from_slice(&b);
    if f.rest.len() > 8 * 1024 * 1024 && !f.rest.contains(&b'\n') { f.rest.clear(); return Step::Nothing; } // (a "line" that never ends is not a Journal line)
    let Some(i) = f.rest.iter().rposition(|c| *c == b'\n') else { return Step::Nothing };
    let done: Vec<u8> = f.rest.drain(..=i).collect();
    let add = filtered(&String::from_utf8_lossy(&done));
    f.acc.push_str(&add);
    trim(&mut f.acc, CAP);
    Step::Add(add)
}

fn mtime(p: &Path) -> Option<SystemTime> {
    fs::metadata(p).ok()?.modified().ok()
}

/// The page's own function: `window.__gravitasApp` is the site's app hook (the page may not be loaded yet: then nothing happens and the page-load hand-over does it).
fn send_journal(w: &tauri::WebviewWindow, name: &str, text: &str, reset: bool) {
    let _ = w.eval(&format!("window.__gravitasApp&&__gravitasApp.journal&&__gravitasApp.journal({},{},{})", js_str(name), js_str(text), reset));
}

/// A game file (Status.json is rewritten several times a second: a half-written one is not sent, the next look tries again). Returns whether it was sent.
fn send_file(w: &tauri::WebviewWindow, f: &str, p: &Path) -> bool {
    if fs::metadata(p).map(|m| m.len() >= 2_000_000).unwrap_or(true) { return false; }
    let Ok(t) = fs::read_to_string(p) else { return false };
    if serde_json::from_str::<serde_json::Value>(&t).is_err() { return false; }
    let _ = w.eval(&format!("window.__gravitasApp&&__gravitasApp.file&&__gravitasApp.file({},{})", js_str(f), js_str(&t)));
    true
}

pub fn start(app: AppHandle) {
    std::thread::Builder::new()
        .name("GRAVITAS map feed".into())
        .spawn(move || crate::guard::keep_running("map feed", || {
            let mut feed: Option<Feed> = None;
            let mut path: Option<PathBuf> = None;
            let mut listed = Instant::now() - RELIST;
            let mut st_m: Option<SystemTime> = None;
            let mut rt_m: Option<SystemTime> = None;
            let mut loaded_seen: Option<Instant> = None;
            let mut resend_at: Option<Instant> = None;
            loop {
                std::thread::sleep(Duration::from_millis(1000));
                let Some(w) = app.get_webview_window("mapsite") else { feed = None; path = None; resend_at = None; continue }; // (no map window: nothing is read, nothing is kept)
                let Some(dir) = journal::saved_games() else { continue };
                if path.is_none() || listed.elapsed() >= RELIST {
                    listed = Instant::now();
                    let n = newest(&dir);
                    if n != path { path = n; }
                }
                let Some(p) = path.clone() else { continue };
                let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
                if feed.as_ref().map(|f| f.name != name).unwrap_or(true) {
                    // the window just opened, or the game started a new Journal
                    let Some(f) = open_feed(&p) else { path = None; continue };
                    send_journal(&w, &f.name, &f.acc, true);
                    st_m = if send_file(&w, "Status.json", &dir.join("Status.json")) { mtime(&dir.join("Status.json")) } else { None };
                    rt_m = if send_file(&w, "NavRoute.json", &dir.join("NavRoute.json")) { mtime(&dir.join("NavRoute.json")) } else { None };
                    feed = Some(f);
                    continue;
                }
                let Some(f) = feed.as_mut() else { continue };
                match advance(f, &p) {
                    Step::Again => { feed = None; continue; }
                    Step::Add(add) if !add.is_empty() => send_journal(&w, &f.name, &add, false),
                    _ => {}
                }
                // Status.json and NavRoute.json, when they changed
                let sp = dir.join("Status.json");
                let m = mtime(&sp);
                if m != st_m && send_file(&w, "Status.json", &sp) { st_m = m; }
                let rp = dir.join("NavRoute.json");
                let m = mtime(&rp);
                if m != rt_m && send_file(&w, "NavRoute.json", &rp) { rt_m = m; }
                // the page (re)loaded: everything again, once, a moment later (its scripts have run by then)
                let loaded = PAGE_LOADED.lock().ok().and_then(|g| *g);
                if loaded != loaded_seen { loaded_seen = loaded; if loaded.is_some() { resend_at = Some(Instant::now() + Duration::from_millis(1500)); } }
                if resend_at.map(|t| Instant::now() >= t).unwrap_or(false) {
                    resend_at = None;
                    send_journal(&w, &f.name, &f.acc, true);
                    send_file(&w, "Status.json", &sp);
                    send_file(&w, "NavRoute.json", &rp);
                }
            }
        }))
        .ok();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("gravitas-feed-{}-{}", std::process::id(), tag));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn only_the_events_the_sync_needs_are_kept() {
        assert!(keep(r#"{ "timestamp":"2026-11-24T12:00:00Z", "event":"FSDJump", "StarSystem":"Sol" }"#));
        assert!(keep(r#"{ "timestamp":"2026-11-24T12:00:00Z", "event":"Scan", "BodyName":"Earth" }"#));
        assert!(!keep(r#"{ "timestamp":"2026-11-24T12:00:00Z", "event":"Commander", "Name":"X", "FID":"F1" }"#));
        assert!(!keep(r#"{ "timestamp":"2026-11-24T12:00:00Z", "event":"Materials" }"#));
        assert!(!keep("not json"));
        assert!(!keep(r#"{"event":"FSDJumpX"}"#));
    }

    #[test]
    fn identifying_fields_never_reach_the_page() {
        use serde_json::{from_str, Value};
        let lg = r#"{ "timestamp":"2026-11-24T12:00:00Z", "event":"LoadGame", "FID":"F123", "Commander":"Hongark", "Ship":"krait_mkii", "Ship_Localised":"Krait Mk II", "ShipName":"N", "ShipIdent":"ID-1", "Credits":123456789, "Loan":5, "GameMode":"Solo" }"#;
        let o: Value = from_str(&scrub(lg)).unwrap();
        for k in ["FID", "Credits", "Loan", "GameMode"] { assert!(o.get(k).is_none(), "{k} must be gone"); }
        for k in ["timestamp", "event", "Commander", "Ship", "Ship_Localised", "ShipName", "ShipIdent"] { assert!(o.get(k).is_some(), "{k} is read by the site"); }
        assert!(!filtered(lg).contains("FID"));
        let o: Value = from_str(&scrub(r#"{ "event":"Docked", "FID":"F1", "StationName":"X" }"#)).unwrap();
        assert!(o.get("FID").is_none() && o["StationName"] == "X");
        let pl: Value = from_str(&scrub(r#"{ "event":"ReceiveText", "From":"CMDR Bob", "Message":"hello", "Message_Localised":"hello", "Channel":"player" }"#)).unwrap();
        assert!(pl.get("Message").is_none() && pl.get("Message_Localised").is_none() && pl.get("From").is_none() && pl["Channel"] == "player");
        let w: Value = from_str(&scrub(r#"{ "event":"ReceiveText", "From":"Bob", "Message":"secret", "Channel":"wing" }"#)).unwrap();
        assert!(w.get("Message").is_none() && w["From"] == "Bob" && w["Channel"] == "wing");
        let n: Value = from_str(&scrub(r#"{ "event":"ReceiveText", "From":"$ShipName_Pirate;", "From_Localised":"Pirate", "Message":"$Pirate_OnStartScanCargo01;", "Message_Localised":"Halt", "Channel":"npc" }"#)).unwrap();
        assert!(n["Message"] == "$Pirate_OnStartScanCargo01;" && n["Message_Localised"] == "Halt" && n["From_Localised"] == "Pirate");
        let st: Value = from_str(&scrub(r#"{ "event":"Statistics", "Bank_Account":{"Current_Wealth":9}, "Combat":{"Bounties_Claimed":3,"Bounty_Hunting_Profit":10,"Combat_Bonds":2,"Combat_Bond_Profits":5,"Highest_Single_Reward":7,"Assassinations":1} }"#)).unwrap();
        assert!(st.get("Bank_Account").is_none() && st["Combat"].get("Assassinations").is_none());
        for k in STAT_COMBAT { assert!(st["Combat"].get(*k).is_some(), "{k}"); }
        let ms: Value = from_str(&scrub(r#"{ "event":"Missions", "Active":[{"MissionID":1,"Name":"Op_X","Expires":0,"PassengerMission":false}], "Failed":[], "Complete":[] }"#)).unwrap();
        assert!(ms.get("Failed").is_none() && ms["Active"][0]["Name"] == "Op_X" && ms["Active"][0].get("MissionID").is_none() && ms["Active"][0].get("Expires").is_some());
        let r: Value = from_str(&scrub(r#"{ "event":"Rank", "Combat":5, "Trade":3, "Federation":1 }"#)).unwrap();
        assert!(r["Combat"] == 5 && r.get("Trade").is_none());
        let cs: Value = from_str(&scrub(r#"{ "event":"CarrierStats", "CarrierID":1, "CarrierType":"FleetCarrier", "Callsign":"AB1-2C3", "Name":"N", "Finance":{"CarrierBalance":5}, "Crew":[] }"#)).unwrap();
        assert!(cs.get("Finance").is_none() && cs["Callsign"] == "AB1-2C3" && cs["CarrierID"] == 1);
        let f = r#"{ "timestamp":"t", "event":"FSDJump", "StarSystem":"Sol" }"#;
        assert_eq!(scrub(f), f);
        assert_eq!(scrub(r#"{ "event":"LoadGame", "FID":"x" "#), "");
    }

    #[test]
    fn the_list_is_the_one_of_the_site() {
        // src/js/30-sync.js SYNC_EV: the two lists must stay the same
        let js = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../src/js/30-sync.js")).unwrap_or_default();
        if js.is_empty() { println!("SKIP"); return; }
        let line = js.lines().find(|l| l.starts_with("const SYNC_EV")).expect("SYNC_EV");
        let open = line.find("(Scan").unwrap() + 1;
        let close = line[open..].find(")\"").unwrap() + open;
        let site: Vec<&str> = line[open..close].split('|').collect();
        assert_eq!(site.len(), EVENTS.len(), "different number of events");
        for e in EVENTS { assert!(site.contains(e), "{e} is not in the site's list"); }
    }

    #[test]
    fn a_long_session_without_a_jump_still_hands_over_the_last_position() {
        let dir = tmp("far");
        let p = dir.join("Journal.2026-11-24T120000.01.log");
        let mut body = String::new();
        body.push_str("{ \"event\":\"Loadout\", \"Ship\":\"python\" }
");
        body.push_str("{ \"event\":\"Location\", \"StarSystem\":\"Far Away\" }
");
        let filler = "{ \"event\":\"ReservoirReplenished\", \"FuelMain\":1.0, \"pad\":\"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\" }
";
        while (body.len() as u64) < TAIL + 400_000 { body.push_str(filler); }
        fs::write(&p, &body).unwrap();
        let f = open_feed(&p).unwrap();
        assert!(f.acc.contains("Far Away"), "the last position above the tail is handed over");
        assert!(f.acc.contains("Loadout"));
        assert!(f.acc.len() < 1_000, "and the page still gets only what the Sync needs");
        // a tail that has a position is left alone
        let mut body2 = body.clone();
        body2.push_str("{ \"event\":\"FSDJump\", \"StarSystem\":\"Near\" }
");
        fs::write(&p, &body2).unwrap();
        let f2 = open_feed(&p).unwrap();
        assert!(f2.acc.contains("Near") && !f2.acc.contains("Far Away"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_tail_starts_at_a_line_and_a_half_line_waits() {
        let dir = tmp("tail");
        let p = dir.join("Journal.2026-11-24T120000.01.log");
        let mut body = String::new();
        body.push_str("{ \"event\":\"Commander\", \"Name\":\"X\" }\n");
        body.push_str("{ \"event\":\"FSDJump\", \"StarSystem\":\"Sol\" }\n");
        body.push_str("{ \"event\":\"Locat"); // half line
        fs::write(&p, &body).unwrap();
        let f = open_feed(&p).unwrap();
        assert!(f.acc.contains("FSDJump") && !f.acc.contains("Commander"));
        assert_eq!(f.rest, b"{ \"event\":\"Locat");
        assert_eq!(newest(&dir).unwrap(), p);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn new_lines_arrive_whole_even_when_a_letter_or_a_line_is_cut() {
        let dir = tmp("inc");
        let p = dir.join("Journal.2026-11-24T120000.01.log");
        fs::write(&p, "{ \"event\":\"FSDJump\", \"StarSystem\":\"Sol\" }\n").unwrap();
        let mut f = open_feed(&p).unwrap();
        assert_eq!(advance(&mut f, &p), Step::Nothing);
        // a line with a two-byte letter, cut in the middle of the letter
        let line = "{ \"event\":\"FSDJump\", \"StarSystem\":\"Ünye\" }\n";
        let bytes = line.as_bytes();
        let cut = line.find('Ü').unwrap() + 1; // between the two bytes of Ü
        let mut file = fs::OpenOptions::new().append(true).open(&p).unwrap();
        use std::io::Write;
        file.write_all(&bytes[..cut]).unwrap();
        assert_eq!(advance(&mut f, &p), Step::Nothing); // no whole line yet
        file.write_all(&bytes[cut..]).unwrap();
        match advance(&mut f, &p) { Step::Add(a) => assert_eq!(a, line), s => panic!("{s:?}") }
        // lines of other events are read but add nothing
        file.write_all(b"{ \"event\":\"Materials\" }\n").unwrap();
        assert_eq!(advance(&mut f, &p), Step::Add(String::new()));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_shorter_file_or_a_huge_gap_starts_again() {
        let dir = tmp("again");
        let p = dir.join("Journal.2026-11-24T120000.01.log");
        fs::write(&p, "{ \"event\":\"FSDJump\", \"StarSystem\":\"Sol\" }\n{ \"event\":\"FSDJump\", \"StarSystem\":\"A\" }\n").unwrap();
        let mut f = open_feed(&p).unwrap();
        fs::write(&p, "{ \"event\":\"FSDJump\" }\n").unwrap(); // the file got shorter
        assert_eq!(advance(&mut f, &p), Step::Again);
        // more than BURST arrives between two looks
        let mut f = open_feed(&p).unwrap();
        let big = format!("{}\n", "x".repeat(BURST as usize + 10));
        let mut file = fs::OpenOptions::new().append(true).open(&p).unwrap();
        use std::io::Write;
        file.write_all(big.as_bytes()).unwrap();
        assert_eq!(advance(&mut f, &p), Step::Again);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn what_is_kept_for_a_reloaded_page_stays_small_and_ends_at_a_line() {
        let mut acc = String::new();
        for i in 0..2000 { acc.push_str(&format!("{{ \"event\":\"Scan\", \"n\":{i} }}\n")); }
        let all = acc.len();
        trim(&mut acc, all / 2);
        assert!(acc.len() <= all / 2 && acc.len() > all / 4, "{} of {}", acc.len(), all);
        assert!(acc.starts_with("{ \"event\"") && acc.ends_with("}\n"));
        assert!(acc.contains("\"n\":1999"), "the newest line must stay");
        let mut small = "{ \"event\":\"Scan\" }\n".to_string();
        let before = small.clone();
        trim(&mut small, 1000);
        assert_eq!(small, before);
    }

    #[test]
    fn a_new_journal_is_found_by_its_name() {
        let dir = tmp("new");
        fs::write(dir.join("Journal.2026-11-23T100000.01.log"), "x\n").unwrap();
        let newer = dir.join("Journal.2026-11-24T120000.01.log");
        fs::write(&newer, "y\n").unwrap();
        assert_eq!(newest(&dir).unwrap(), newer);
        let _ = fs::remove_dir_all(&dir);
    }
}
