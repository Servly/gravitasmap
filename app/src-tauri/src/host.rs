//! The Combat host: load.py's orchestration in Rust, one piece at a time, each piece proved against the Python plugin's own output
//! (research/app-golden: the plugin run on real Journals under a fake clock).
//!
//! Done: which Journal lines reach the engine, the Bounty counter and Claims, and when (handle, catch_up); the engine's clock (tick, calm);
//! the end of a fight (fight_step, with the counter's wing bonus stamped on it); what draw() asks the engine while the HUD is drawn.
//! Next: the card models.
use crate::claims::Claims;
use crate::combat::{self, Opts, WinCfg};
use crate::counter::Counter;
use crate::engine::Engine;
use crate::i18n::I18n;
use serde_json::{json, Value};
use std::collections::HashMap;

const FRESH_S: f64 = 60.0; // a Journal line older than this sets the scene but starts nothing

pub(crate) const HERE_FROM: &[&str] = &["Location", "FSDJump", "CarrierJump", "SupercruiseExit", "SupercruiseEntry"];
pub(crate) const IN_GAME: &[&str] = &["Location", "Undocked", "Docked", "FSDJump", "SupercruiseEntry", "SupercruiseExit", "StartJump", "Touchdown", "Liftoff", "ShipTargeted"];
pub(crate) const OUT_GAME: &[&str] = &["Fileheader", "LoadGame", "Shutdown"];
pub(crate) const MAP_MUSIC: &[&str] = &["GalaxyMap", "SystemMap", "SystemAndSurfaceScanner", "Codex", "FleetCarrier_Managment", "Squadrons", "GalacticPowers"];
pub(crate) const CATCH_UP_EXTRA: &[&str] = &["Loadout", "Music", "CarrierJump", "Died", "Resurrect", "Embark", "Disembark", "Bounty", "FactionKillBond", "CapShipBond", "RedeemVoucher", "WingJoin", "WingAdd", "WingLeave"];

/// What the settings are at the start (the plugin's own values after its migrations).
pub struct Settings {
    pub combat_on: bool,
    pub calm_s: i64,
    pub sc_ends: bool,
    pub report_s: f64,
    pub drop_lost: bool,
    pub hide_maps: bool,
    /// free look hides the HUD (the plugin's settings.look == "hide")
    pub look_hide: bool,
    pub bonds: bool,
    pub rows: i64,
    pub sort: String,
    pub order: Vec<String>,
    pub wing_bonus_on: bool,
    /// Bounty counter in brief: only the money (this fight and Claims), no kills, no faction lines, no tail
    pub brief: bool,
    /// the combat bonds you carry count in Claims (the game's Claims panel lists them)
    pub claim_bonds: bool,
    /// the Combat report says when Claims hold more than the fight (money from before it)
    pub claims_note: bool,
    /// how many kills the Kill feed shows
    pub feed_rows: i64,
    pub wing_bonus_op: bool,
    pub always: bool,
    pub show_gone: bool,
    pub auto: bool,
    /// the dark ground behind each window (off), how see-through the whole HUD is (percent), the size: Auto from the game window's height, or a percent
    pub bg: bool,
    pub opacity: i64,
    pub size_auto: bool,
    pub size_pct: i64,
    /// only while the game is the window in front
    pub front: bool,
    /// the hologram boot as windows come into view (off: they fade in)
    pub boot: bool,
    /// windows that are not offered any more (the Target card: the game's own is used); not saved
    pub removed: Vec<&'static str>,
    /// the keys work (Ctrl+Shift+F9.. in the plugin); the free look button and way when the game's own binding is unread
    pub keys: bool,
    pub look_btn: String,
    pub look_hold: bool,
    /// the footers and the Keys card name the keys the player set (Host.key_texts); off = the plugin's fixed Ctrl+Shift+F7..F12 texts (the parity tests).
    /// Not saved: always on in the app.
    pub live_key_hints: bool,
    pub win: Vec<(&'static str, WinCfg)>,
}

impl Default for Settings {
    fn default() -> Self {
        let win = combat::WINDOWS
            .iter()
            .map(|(key, x, y)| {
                let when = combat::DEFAULT_WHEN.iter().find(|(k, _)| k == key).map(|(_, w)| *w).unwrap_or("always");
                (*key, WinCfg { on: !combat::WINDOWS_OFF.contains(key), x: *x, y: *y, dx: 0.0, dy: 0.0, colour: "#ff7100".into(), shape: (0.0, 0, 100, 100), when: when.into(), persp: true, ground: -1, size: -1, opacity: -1 })
            })
            .collect();
        Settings {
            combat_on: true, calm_s: 60, sc_ends: true, report_s: 10.0, drop_lost: true, hide_maps: true, look_hide: true, bonds: false, rows: 6,
            sort: "v".into(), order: combat::DEFAULT_ORDER.iter().map(|s| s.to_string()).collect(), wing_bonus_on: true, brief: false, feed_rows: 6,
            wing_bonus_op: false, claim_bonds: true, claims_note: true, always: true, show_gone: false, auto: true, bg: false, opacity: 92, size_auto: true, size_pct: 100, front: true, boot: true, removed: Vec::new(), keys: true, look_btn: "m3".into(), look_hold: true, live_key_hints: true, win,
        }
    }
}

/// What one tick of draw() asked the engine, and what had changed in the host.
#[derive(Default, Debug)]
pub struct Tick {
    pub view: Option<Value>,
    pub scan: Option<Value>,
    pub gone: Option<Value>,
    pub had_fire: bool,
    pub report_until: f64,
    pub counter: Value,
    pub claims: Value,
    /// The windows the HUD shows: (key, card, x, y, colour, shape, place, group, anchor); None while the HUD is hidden.
    pub items: Option<Vec<Value>>,
}

pub struct Host {
    pub eng: Engine,
    pub set: Settings,
    pub counter: Counter,
    pub claims: Claims,
    /// the combat bonds you carry (they are Claims in the game too; never lost on a death)
    pub bonds: crate::bonds::Bonds,
    pub system: Option<String>,
    pub in_game: Option<bool>,
    pub map_music: bool,
    pub flags: u64,
    pub flags2: u64,
    pub had_fire: bool,
    pub report_until: f64,
    pub report_auto: bool,
    pub last_view: Option<Value>,
    pub tr: I18n,
    pub keys_shown: bool,
    pub keys_until: f64,
    pub banner_until: f64,
    pub hot: bool,
    /// you are looking around (free look), the HUD hidden by Ctrl+Shift+hide, the panel open (GuiFocus) and the panel guessed from its key
    pub looking: bool,
    /// the game's own menu (Esc, Options...) is open: the mouse cursor shows (set by live.rs, steady for 150 ms)
    pub game_menu: bool,
    pub key_hidden: bool,
    pub gui: i64,
    pub guess_gui: Option<i64>,
    /// a past report shown on the HUD from the Past combats window, and until when (unix seconds)
    pub shown: Option<(Value, f64)>,
    /// Preview: made-up fights on the windows (from the settings), and when it was turned on (the COMBAT banner shows first)
    pub preview: bool,
    pub preview_t0: f64,
    /// the keys the player set for the jobs the footers name (job -> key text), kept up to date by live.rs
    pub key_texts: HashMap<String, String>,
    /// the fight (its start time) whose Last fight report was cleared with its key: the windows that show the last fight between fights leave it out too
    pub cleared: Option<String>,
    /// the windows boot up as holograms the next time they show (after the HUD was away: not in the cockpit, nothing to show)
    pub need_boot: bool,
    /// a window being placed from the menu or the window (its name, or "*" for all): shown with made-up data while it is edited, whatever else is on
    pub edit: Option<String>,
    /// fights that just ended with a report, to be kept in Past combats (the caller takes them), and the ones kept already (by start time)
    pub finished: Vec<Value>,
    saved: std::collections::HashSet<String>,
    /// the Xeno Hunt (thargoid.rs): the Thargoid card, its report and the shutdown warning
    pub th: crate::thargoid::Th,
    /// DEBRIEF: what you pressed and what the game wrote, kept per fight (debrief.rs)
    pub db: crate::debrief::Db,
    /// PVP mode: one file for each fight with another commander (pvp.rs)
    pub pvp: crate::pvp::Pvp,
    /// the modes (Combat, Thargoid, On Foot) switch by themselves: which one is on, and the card that says so for a few seconds when it changes
    pub combat_enabled: bool,
    pub th_on: bool,
    pub foot_on: bool,
    pub mode: Mode,
    mode_card: Option<(Mode, f64)>,
    fight_on: bool,
}

/// What the player is doing now, as the app sees it from the Journal and Status.json.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Mode {
    #[default]
    None,
    Combat,
    Thargoid,
    Foot,
}

impl Mode {
    pub fn key(self) -> &'static str {
        match self { Mode::Combat => "mode.card.combat", Mode::Thargoid => "mode.card.thargoid", Mode::Foot => "mode.card.foot", Mode::None => "" }
    }
}

impl Host {
    pub fn new(fake_clock: bool) -> Result<Host, String> {
        Ok(Host {
            eng: Engine::new(fake_clock)?,
            set: Settings::default(),
            counter: Counter::new(),
            claims: Claims::new(),
            bonds: Default::default(),
            system: None,
            in_game: None,
            map_music: false,
            flags: 1 << 24, // (in the main ship: Status.json's own Flags come with the Status slice)
            flags2: 0,
            had_fire: false,
            report_until: 0.0,
            report_auto: false,
            last_view: None,
            tr: I18n::new("en"),
            keys_shown: false,
            keys_until: 0.0,
            banner_until: 0.0,
            hot: false,
            looking: false, game_menu: false,
            key_hidden: false,
            gui: 0,
            guess_gui: None,
            shown: None,
            preview: false,
            preview_t0: 0.0,
            key_texts: HashMap::new(),
            cleared: None,
            need_boot: true,
            edit: None,
            finished: Vec::new(),
            saved: Default::default(),
            th: Default::default(),
            db: Default::default(),
            pvp: Default::default(),
            combat_enabled: true,
            th_on: true,
            foot_on: true,
            mode: Mode::None,
            mode_card: None,
            fight_on: false,
        })
    }

    fn s<'a>(e: &'a Value, k: &str) -> &'a str {
        e.get(k).and_then(Value::as_str).unwrap_or("")
    }

    /// A map's music started or stopped.
    fn music(&mut self, track: &str) {
        crate::drift::music(track);
        self.map_music = MAP_MUSIC.contains(&track);
    }

    /// One Journal line, from whichever side brought it first (load.py's handle).
    pub fn handle(&mut self, entry: &Value, now: f64) {
        let ev = Self::s(entry, "event");
        crate::drift::event(ev); // (counts only: what the game writes that this version does not know)
        crate::drift::check_fields(entry);
        if HERE_FROM.contains(&ev) && !Self::s(entry, "StarSystem").is_empty() {
            self.system = Some(Self::s(entry, "StarSystem").to_string());
        }
        if OUT_GAME.contains(&ev) || (ev == "Music" && matches!(Self::s(entry, "MusicTrack"), "MainMenu" | "CQCMenu")) {
            self.in_game = Some(false);
        } else if IN_GAME.contains(&ev) {
            self.in_game = Some(true);
        }
        if ev == "Music" {
            let t = Self::s(entry, "MusicTrack").to_string();
            self.music(&t);
        }
        if ev == "Loadout" { self.th.note_loadout(entry); }
        self.db.feed(entry, now);
        self.pvp.feed(entry, now);
        self.counter.feed(entry);
        self.claims.feed(entry);
        self.bonds.feed(entry);
        if let Some(sys) = self.system.clone() {
            self.eng.here(&sys);
        }
        let age = parse_ts(Self::s(entry, "timestamp")).map(|t| now - t).unwrap_or(0.0);
        self.eng.feed(&entry.to_string(), age > FRESH_S);
        if age <= FRESH_S && self.th_on {
            self.th.feed(entry, now); // (the Xeno Hunt follows live lines only: an old Journal never starts one)
        }
        if ev == "SupercruiseEntry" && age <= FRESH_S && self.set.sc_ends {
            self.eng.end();
        }
    }

    /// The newest Journal from its first line, as the app starts: only the scene, no fight starts; what you carry is taken from it.
    pub fn catch_up(&mut self, lines: &[Value]) {
        let mut track: Option<String> = None;
        for e in lines {
            let ev = Self::s(e, "event");
            let known = IN_GAME.contains(&ev) || OUT_GAME.contains(&ev) || CATCH_UP_EXTRA.contains(&ev);
            if !known {
                continue;
            }
            if HERE_FROM.contains(&ev) && !Self::s(e, "StarSystem").is_empty() {
                self.system = Some(Self::s(e, "StarSystem").to_string());
            }
            if OUT_GAME.contains(&ev) || (ev == "Music" && matches!(Self::s(e, "MusicTrack"), "MainMenu" | "CQCMenu")) {
                self.in_game = Some(false);
            } else if IN_GAME.contains(&ev) {
                self.in_game = Some(true);
            }
            if ev == "Music" {
                track = Some(Self::s(e, "MusicTrack").to_string());
            }
            if ev == "Loadout" { self.th.note_loadout(e); }
            self.counter.feed_past(e); // what you carry, from the whole session (not this fight's count)
            self.claims.feed(e);
            self.bonds.feed(e);
            if matches!(ev, "Bounty" | "FactionKillBond" | "CapShipBond" | "RedeemVoucher") {
                continue; // (the engine does not need old fights' lines)
            }
            self.eng.feed(&e.to_string(), true);
        }
        if let Some(sys) = self.system.clone() {
            self.eng.here(&sys);
        }
        if let Some(t) = track {
            self.music(&t);
        }
    }

    /// In the ship (or a fighter), in the game itself: not on foot, not in the intro, the menu or a loading screen.
    pub fn in_cockpit(&self) -> bool {
        if self.flags & 0x0300_0000 == 0 || self.flags2 & 0x1 != 0 {
            return false;
        }
        self.in_game != Some(false)
    }

    /// A Combat fight that was really a Xeno Hunt (its kills are bonds, not ships): Past Thargoid and the Xeno Hunt report have it, Combat does not.
    fn is_hunt(&self, v: &Value) -> bool {
        let ms = |k: &str| v.get("ep").and_then(|e| e.get(k)).and_then(Value::as_f64).unwrap_or(0.0) / 1000.0;
        self.th.overlaps(ms("t0"), ms("t1").max(ms("t0")))
    }

    /// A fight's end, whatever is on the screen (load.py's fight_step): its report readied and the counter back to 0.
    fn fight_step(&mut self, now: f64) -> Option<Value> {
        let mut v = if self.set.combat_on { self.eng.view() } else { None };
        let on = v.as_ref().and_then(|v| v.get("on")).map(truthy).unwrap_or(false);
        let soft = v.as_ref().and_then(|v| v.get("soft")).map(truthy).unwrap_or(false);
        if v.is_some() && on && !soft {
            self.had_fire = true;
            self.report_until = 0.0;
        } else if self.had_fire && v.is_some() && !on {
            self.had_fire = false;
            // the fight's own wing bonus estimate is stamped onto it as it ends, so the report and Past combats read the same number
            let stamp = self.counter.view(self.set.bonds).get("wing_bonus").cloned().unwrap_or(json!(0));
            if let Some(ep) = v.as_mut().and_then(|v| v.get_mut("ep")).filter(|ep| ep.is_object()) {
                ep["wing_bonus"] = stamp;
            }
            self.last_view = v.clone();
            if !v.as_ref().is_some_and(|v| self.is_hunt(v)) {
                self.report_until = now + self.set.report_s;
                self.report_auto = true;
            }
            self.counter.reset(); // This fight and Kills: back to 0 the instant the fight ends
        }
        // a fight just ended with a report: kept in Past combats, once (a report deleted there does not come back)
        if let Some(vv) = v.as_ref().filter(|vv| !truthy_opt(vv.get("on"))) {
            if let Some(t0) = vv.get("ep").and_then(|e| e.get("t0")).filter(|t| truthy(t)) {
                if self.saved.insert(t0.to_string()) && !self.is_hunt(vv) {
                    self.finished.push(vv.clone());
                }
            }
        }
        v
    }

    /// The 250 ms loop (load.py's draw), as far as the engine and the counters go.
    pub fn draw(&mut self, now: f64) -> Tick {
        let mut t = self.draw_engine(now);
        t.counter = self.counter.view(self.set.bonds);
        t.claims = self.claims.view();
        t
    }

    fn draw_engine(&mut self, now: f64) -> Tick {
        self.eng.tick();
        self.eng.calm(self.set.calm_s * 1000);
        let v = self.fight_step(now);
        // (a real fight: shots fired, not just hostiles near)
        self.fight_on = v.as_ref().map(|v| truthy_opt(v.get("on")) && !truthy_opt(v.get("soft"))).unwrap_or(false);
        // DEBRIEF: one record for each fight or hunt (a hunt first: its fight is the same fight)
        let span = if self.th.active() { Some("hunt") } else if self.fight_on { Some("fight") } else { None };
        match (span, self.db.rec.is_some()) {
            (Some(k), false) => { let (ship, sys) = (self.db.ship.clone(), self.system.clone().unwrap_or_default()); self.db.start(k, now, ship, sys); }
            (None, true) => self.db.end(now),
            _ => {}
        }
        self.pvp.tick(now);
        let want = if self.th_on && self.th.active() { Mode::Thargoid }
            else if self.combat_enabled && self.fight_on && !self.th.recent(now, 100.0) { Mode::Combat }
            else if self.foot_on && self.flags2 & 0x1 != 0 { Mode::Foot }
            else { Mode::None };
        if want != self.mode {
            if want != Mode::None && !self.preview { self.mode_card = Some((want, now + 4.0)); }
            self.mode = want;
        }
        let shown = self.shown.as_ref().filter(|s| now < s.1).map(|s| s.0.clone());
        self.th.tick(now);
        let mut t = Tick { view: v.clone(), had_fire: self.had_fire, report_until: self.report_until, ..Default::default() };
        let editing = self.edit.is_some();
        // (on foot there is no cockpit: only the card that says "On Foot Mode On" is drawn)
        let foot_card = self.mode_card.is_some_and(|c| c.0 == Mode::Foot && now < c.1);
        if !self.in_cockpit() && !foot_card && shown.is_none() && !self.preview && !editing {
            self.need_boot = true;
            self.keys_shown = false; // (the HUD hides: nothing more is asked of the engine; the Keys card comes again with the HUD)
            return t;
        }
        if !self.keys_shown {
            // the Keys card, 10 s each time the HUD comes on in the cockpit
            self.keys_shown = true;
            self.keys_until = now + combat::KEYS_S;
        }
        let live_hot = v.as_ref().map(|v| crate::pyval::truthy(v.get("on")) && !crate::pyval::truthy(v.get("soft"))).unwrap_or(false);
        if live_hot && !self.hot {
            self.banner_until = now + combat::BANNER_S; // Hostiles near (or nothing) turned into a fight: say so, loud
        }
        self.hot = live_hot;
        if self.key_hidden {
            return t; // Ctrl+Shift+hide: the fight is still followed, the report still kept
        }
        // the maps and station services, by panel, music or key (the HUD goes at once), and free look
        let in_map = self.game_menu || (5..12).contains(&self.gui) || self.map_music || self.guess_gui.is_some_and(|g| (5..12).contains(&g));
        if ((self.looking && self.set.look_hide) || (self.set.hide_maps && in_map)) && shown.is_none() && !editing {  // (Preview behaves as the game will: hidden in free look and in the maps)
            return t;
        }
        let scan = if self.set.combat_on && !self.preview { Some(self.eng.scan()) } else { None };
        let gone = if self.preview { json!({}) } else { self.eng.gone() };
        t.scan = scan.clone();
        t.gone = Some(gone.clone());
        let on_now = v.as_ref().map(|x| truthy_opt(x.get("on"))).unwrap_or(false);
        let v_shown = if self.preview { Some(combat::sample(now * 1000.0)) } else if shown.is_some() && !on_now { shown.clone() } else { v.clone().filter(|x| !self.is_cleared(x)) }; // Preview, or a past report asked for from Past combats
        t.items = self.windows(v_shown.as_ref(), scan.as_ref(), &gone, now, shown.is_some());
        t
    }

    /// A fight that is over and whose report was cleared (Controls.cleared): nothing of it is shown between fights any more.
    pub fn is_cleared(&self, v: &Value) -> bool {
        self.cleared.is_some() && !truthy_opt(v.get("on")) && v.get("ep").and_then(|e| e.get("t0")).map(|t| t.to_string()) == self.cleared
    }

    /// load.py's draw(), the part that makes the windows: which ones show, and each one's card and place.
    fn windows(&mut self, v: Option<&Value>, scan: Option<&Value>, gone: &Value, now: f64, shown: bool) -> Option<Vec<Value>> {
        let now_ms = (now * 1000.0).trunc();
        let preview = self.preview;
        let edit = self.edit.clone();
        let foot_only = !self.in_cockpit() && !shown && !preview && edit.is_none();
        let pbanner = preview && now - self.preview_t0 < combat::BANNER_S as f64;
        let (drop_lost, bonds) = (self.set.drop_lost, self.set.bonds);
        let gone_of = if drop_lost { gone.clone() } else { json!({"cleared": gone.get("cleared").cloned().unwrap_or(json!(0))}) };
        let mut bounty = self.counter.view(bonds);
        bounty["claim"] = self.claims.view();
        bounty["claim_reset"] = json!(self.claims.base_local());
        if self.set.claim_bonds {
            bounty["bond_owed"] = self.bonds.view();
        }
        bounty["wing_bonus_on"] = json!(self.set.wing_bonus_on);
        bounty["wing_bonus_op"] = json!(self.set.wing_bonus_op);
        bounty["brief"] = json!(self.set.brief);
        let s = &self.set;
        let opts = Opts {
            sort: s.sort.clone(), order: s.order.clone(), report_s: s.report_s, banner: pbanner || now < self.banner_until,
            scan: scan.and_then(|x| x.get("pri")).cloned(), tg: scan.and_then(|x| x.get("tg")).cloned(), always: s.always && !preview && !shown, gone: gone_of, show_gone: s.show_gone,
            bounty: Some(if preview { combat::sample_bounty() } else { bounty }), wing_bonus_on: s.wing_bonus_on, wing_bonus_op: s.wing_bonus_op, claims_note: s.claims_note, rows: s.rows, feed_rows: s.feed_rows,
            keys_on: preview || now < self.keys_until, keys_left: if preview { combat::KEYS_S as i64 } else { ((self.keys_until - now).ceil() as i64).max(0) },
            report_on: preview || shown || now < self.report_until,
            hints: if s.live_key_hints { Some(self.key_texts.clone()) } else { None },
            report_left: if preview { combat::REPORT_DEMO_S } else { ((if shown { self.shown.as_ref().map(|x| x.1).unwrap_or(0.0) } else { self.report_until } - now).ceil() as i64).max(0) },
        };
        let asked = shown || (now < self.report_until && !self.report_auto);
        let mut items: Vec<Value> = Vec::new();
        let mut tied_n: HashMap<String, usize> = HashMap::new();
        for (key, w) in &s.win {
            if s.removed.contains(key) {
                continue;
            }
            let mut m: Option<Value> = None;
            let is_th = crate::thargoid::is_key(key);
            let is_db = crate::dbcard::is_key(key);
            let is_pvp = *key == "pvp";
            let touched = edit.as_deref().is_some() || preview;
            if foot_only && *key != "modecard" { continue; }
            if !self.combat_enabled && !is_th && !is_db && !is_pvp && *key != "modecard" && !touched { continue; }
            if is_pvp && !self.pvp.on && !touched { continue; }
            if is_db && !self.db.on && !touched { continue; }
            if is_th && !self.th_on && !touched { continue; }
            if *key == "targets" && self.th.active() && !self.preview {
                continue; // (the Thargoid card is in its place: Targets by value has nothing to say about Thargoids)
            }
            let tied = combat::panel_of(&w.when).is_some();
            let editing = edit.as_deref().is_some_and(|e| e == "*" || e == *key || (e == "+" && w.on));
            let group = if shown || editing { json!("all") } else if tied { json!(combat::panel_of(&w.when)) } else { json!("front") };
            if *key == "sysmap" {
                // the System map: a picture of the site's map (mapcap.rs); nothing until the first picture has come
                if w.on || editing {
                    if let Some(sh) = crate::mapcap::current() {
                        m = Some(json!({"title": "SYSTEM MAP", "head2": sh.system, "mapw": crate::mapwin::cfg().w, "map": {"id": sh.id, "w": sh.w, "h": sh.h}}));
                    }
                }
            } else if *key == "modecard" {
                // the card that says which mode just came on (a few seconds, by itself)
                if w.on || editing {
                    let want = if editing || preview { Some(Mode::Combat) } else { self.mode_card.filter(|c| now < c.1).map(|c| c.0) };
                    if let Some(md) = want {
                        m = Some(json!({"kind": "chip", "tone": if md == Mode::Foot { "green" } else { "red" }, "text": crate::thargoid::tx(&self.tr, md.key(), &[]), "sub": ""}));
                    }
                }
            } else if crate::thargoid::is_key(key) {
                // the Xeno Hunt windows: only while Thargoids are about (or the hunt just ended), made-up data while placed or in Preview
                if w.on || editing {
                    m = if editing || self.preview { crate::thargoid::Th::sample(now).model(&self.tr, key, now) } else { self.th.model(&self.tr, key, now) };
                }
            } else if is_pvp {
                // PVP mode: the chip that says it is on (and, for a few seconds, that a fight was saved)
                if w.on || editing {
                    let saved = self.pvp.saved.as_ref().filter(|(_, until)| now < *until).map(|(o, _)| o.clone());
                    m = Some(if let Some(o) = saved.filter(|_| !editing && !self.preview) {
                        json!({"kind": "chip", "tone": "green", "text": crate::dbcard::tx(&self.tr, "pvp.saved", &[]), "sub": o})
                    } else {
                        let sub = if self.pvp.active() && !editing && !self.preview { "pvp.chip.fight" } else { "pvp.chip.sub" };
                        json!({"kind": "chip", "tone": "red", "text": crate::dbcard::tx(&self.tr, "pvp.chip", &[]), "sub": crate::dbcard::tx(&self.tr, sub, &[])})
                    });
                }
            } else if is_db {
                // DEBRIEF: the live input window while the keys are followed, its report for a while after a fight; made-up data while placed or in Preview
                if w.on || editing {
                    m = if editing || self.preview {
                        Some(if *key == "inputs" { crate::dbcard::sample_live(&self.tr, now) } else { crate::dbcard::sample_report(&self.tr) })
                    } else if *key == "inputs" {
                        if self.db.following { Some(crate::dbcard::live_model(&self.db, &self.tr, now)) } else { None }
                    } else {
                        self.db.last.as_ref().filter(|(_, until)| now < *until).map(|(r, _)| crate::dbcard::report_model(&self.tr, r, self.db.rules_on))
                    };
                }
            } else if editing {
                // being placed: made-up data, so it can be seen where it goes (this window only; the others show as they would)
                let vv = if *key == "report" { combat::sample_report(now_ms) } else { combat::sample(now_ms) };
                let o = Opts { banner: *key == "banner", bounty: Some(combat::sample_bounty()), keys_on: true, keys_left: combat::KEYS_S as i64, report_on: true, report_left: combat::REPORT_DEMO_S, always: false, ..opts.clone() };
                m = combat::model(&self.tr, key, &vv, now_ms, &o);
            } else if w.on || (*key == "report" && asked) {
                if preview && *key == "report" && pbanner {
                    continue;
                }
                let o = if tied && !preview { Opts { report_s: 1e9, ..opts.clone() } } else { opts.clone() };
                let mut vv = v.cloned().unwrap_or(Value::Null);
                if *key == "report" {
                    if let Some(lv) = self.last_view.as_ref().filter(|x| truthy(x) && !shown && !preview) {
                        vv = lv.clone(); // (the fight as it ended)
                    }
                }
                if preview && *key == "report" {
                    vv = combat::sample_report(now_ms);
                }
                // (a fight that was a Xeno Hunt has no Combat report: the hunt's own report shows)
                let hunt_report = *key == "report" && !preview && !shown && self.is_hunt(&vv);
                m = if hunt_report { None } else { combat::model(&self.tr, key, &vv, now_ms, &o) };
                if m.is_none() && opts.always && !hunt_report {
                    m = combat::placeholder(&self.tr, key); // the HUD stays up: the window's frame, waiting
                }
            }
            if let Some(m) = m {
                let i = *tied_n.get(&w.when).unwrap_or(&0);
                tied_n.insert(w.when.clone(), i + 1);
                let place: Option<Vec<Value>> = if s.auto {
                    let mut p = combat::home(key, w, i);
                    p.push(json!(w.dx));
                    p.push(json!(w.dy));
                    Some(p)
                } else {
                    None
                };
                items.push(json!([key, m, w.x, w.y, w.colour, [w.shape.0, w.shape.1, w.shape.2, w.shape.3], place, group, combat::anchor_of(w, place.as_ref())]));
            }
        }
        if items.is_empty() {
            self.need_boot = true;
            None
        } else {
            Some(items)
        }
    }
}

fn truthy(v: &Value) -> bool {
    crate::pyval::truthy(Some(v))
}

fn truthy_opt(v: Option<&Value>) -> bool {
    crate::pyval::truthy(v)
}

/// "2026-11-06T19:23:19Z" as seconds since 1970, or None.
pub fn parse_ts(s: &str) -> Option<f64> {
    let r = parse_ts_inner(s);
    if r.is_none() {
        crate::drift::ts_failed(); // (counted for the diagnostic report: the game may have changed how it writes its time)
    }
    r
}

/// "2026-11-06T19:23:19Z" (the Journal's own form, the answer is whole seconds), and also fractional seconds ("...19.250Z") and an offset instead of the Z ("...19+01:00", "...19.5-05:30").
fn parse_ts_inner(s: &str) -> Option<f64> {
    let b = s.as_bytes();
    if b.len() < 20 || b[4] != b'-' || b[7] != b'-' || b[10] != b'T' || b[13] != b':' || b[16] != b':' {
        return None;
    }
    let n = |a: usize, z: usize| -> Option<i64> {
        let t = s.get(a..z)?;
        if !t.bytes().all(|c| c.is_ascii_digit()) { return None; }
        t.parse::<i64>().ok()
    };
    let (y, mo, d, h, mi, se) = (n(0, 4)?, n(5, 7)?, n(8, 10)?, n(11, 13)?, n(14, 16)?, n(17, 19)?);
    // what follows the seconds: Z, or .fraction then Z or an offset, or an offset
    let mut rest = &s[19..];
    let mut frac = 0.0f64;
    if let Some(r) = rest.strip_prefix('.') {
        let digits = r.bytes().take_while(u8::is_ascii_digit).count();
        if digits == 0 { return None; }
        frac = format!("0.{}", &r[..digits]).parse::<f64>().ok()?;
        rest = &r[digits..];
    }
    let off: i64 = if rest == "Z" {
        0
    } else if (rest.starts_with('+') || rest.starts_with('-')) && rest.len() == 6 && rest.as_bytes()[3] == b':' {
        let oh = rest.get(1..3)?.parse::<i64>().ok().filter(|v| (0..24).contains(v))?;
        let om = rest.get(4..6)?.parse::<i64>().ok().filter(|v| (0..60).contains(v))?;
        let secs = oh * 3600 + om * 60;
        if rest.starts_with('+') { secs } else { -secs }
    } else {
        return None;
    };
    // days since 1970-01-01 (the civil-from-days algorithm)
    let y2 = if mo <= 2 { y - 1 } else { y };
    let era = if y2 >= 0 { y2 } else { y2 - 399 } / 400;
    let yoe = y2 - era * 400;
    let doy = (153 * (if mo > 2 { mo - 3 } else { mo + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;
    Some((days * 86400 + h * 3600 + mi * 60 + se - off) as f64 + frac)
}

/// Seconds since 1970 as "2026-11-06T19:23:19Z" (the Journal's own way).
pub fn format_ts(secs: i64) -> String {
    let days = secs.div_euclid(86400);
    let rem = secs.rem_euclid(86400);
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z.rem_euclid(146097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z", rem / 3600, rem % 3600 / 60, rem % 60)
}

#[cfg(test)]
pub mod parity;
#[cfg(test)]
mod logic;
#[cfg(test)]
mod fuzz;
