//! Free look and the Ctrl+Shift keys: load.py's look_loop and keys_step as a pure state machine (the caller reads the keys and the mouse, gives the
//! time, and carries out what it answers). The HUD hides while you look around (the game's own free look button, held or toggled) and the keys
//! do their jobs: flip, report, reset, clear, hide, claims. Proven against the plugin's own functions run for real under fakes (look_golden.json).
use crate::panelkeys::HeadLook;
use serde_json::Value;

/// raw mouse button events (RAWMOUSE.usButtonFlags): (down, up) for Mouse 3, 4 and 5
pub fn button_flags(btn: &str) -> (u32, u32) {
    match btn { "m4" => (0x0040, 0x0080), "m5" => (0x0100, 0x0200), _ => (0x0010, 0x0020) }
}
/// the virtual keys of those buttons, for GetAsyncKeyState
pub fn button_vk(btn: &str) -> u32 {
    match btn { "m4" => 0x05, "m5" => 0x06, _ => 0x04 }
}

#[derive(Clone, Debug, Default)]
pub struct Cfg {
    pub look_on: bool,
    pub look_btn: String,
    pub look_hold: bool,
    pub keys_on: bool,
    pub report_s: f64,
    pub report_win_on: bool,
    /// the game's own free look (None: unread, the settings' button and way are used)
    pub headlook: Option<HeadLook>,
    pub mouse_ok: bool,
    /// a side panel is held open over a free look (focus.rs hold): the end of the look does not put the windows ahead
    pub hold_panel: bool,
}

#[derive(Debug, PartialEq, Clone)]
pub enum Out {
    Hide,
    SetFocus(i64),
    Draw,
    CounterReset,
    ClaimsReset,
    EngineClear,
    /// the Last fight report was cleared: a past report shown from Past combats goes too (Past combats itself is not touched)
    ReportClear,
}

#[derive(Default)]
pub struct Controls {
    pub looking: bool,
    pub look_toggle: bool,
    pub look_held: bool,
    pub key_hidden: bool,
    pub report_until: f64,
    pub report_auto: bool,
    pub last_view: Option<Value>,
    /// the fight (its start time) whose report was cleared: the report key does not bring it back from the engine
    pub cleared: Option<String>,
}

pub struct In<'a> {
    pub front: bool,
    pub gui: i64,
    pub in_cockpit: bool,
    pub keys: &'a [String],
    pub mouse: &'a [(bool, u32)],
    /// GetAsyncKeyState of a key
    pub state: &'a dyn Fn(u32) -> u16,
    pub perf: f64,
    pub wall: f64,
    /// the engine's view now (asked only when a report is asked for and none is kept)
    pub engine_view: &'a dyn Fn() -> Option<Value>,
    pub engine_ok: bool,
    /// the focus machine's guess (set when free look ends over a side panel)
    pub guess: &'a mut Option<(i64, f64)>,
}

fn t0_text(v: &Value) -> Option<String> {
    if truthy_t0(v) { v.get("ep").and_then(|e| e.get("t0")).map(|t| t.to_string()) } else { None }
}

fn truthy_t0(v: &Value) -> bool {
    match v.get("ep").and_then(|e| e.get("t0")) { Some(Value::Null) | None => false, Some(Value::Bool(b)) => *b, Some(Value::Number(n)) => n.as_f64() != Some(0.0), Some(Value::String(s)) => !s.is_empty(), Some(_) => true }
}

impl Controls {
    /// look_reset: free look over, as the game has put the view back ahead.
    fn look_reset(&mut self, o: &mut Vec<Out>) {
        if self.looking || self.look_toggle {
            self.looking = false;
            self.look_toggle = false;
            o.push(Out::Draw);
        }
    }

    fn keys_step(&mut self, cfg: &Cfg, i: &In, o: &mut Vec<Out>) {
        if !cfg.keys_on { return; }
        for k in i.keys {
            match k.as_str() {
                "reset" => o.push(Out::CounterReset),
                "claims" => o.push(Out::ClaimsReset),
                "clear" if i.engine_ok => o.push(Out::EngineClear),
                "hide" => {
                    if self.looking { self.look_reset(o); } else { self.key_hidden = !self.key_hidden; }
                }
                "flip" => {
                    if cfg.look_on {
                        self.looking = !self.looking;
                        self.look_toggle = self.looking;
                        if self.looking { o.push(Out::Hide); }
                    }
                }
                "report" => {
                    let up = i.wall < self.report_until && (!self.report_auto || cfg.report_win_on);
                    if up {
                        self.report_until = 0.0; // (on the screen now: closed; not shown, its window off: shown)
                    } else {
                        let mut lv = self.last_view.clone();
                        if lv.is_none() && i.engine_ok {
                            let cur = (i.engine_view)();
                            lv = cur.filter(|c| {
                                let on = crate::pyval::truthy(c.get("on"));
                                !c.is_null() && c.as_object().is_some_and(|m| !m.is_empty()) && !on && truthy_t0(c)
                                    && (self.cleared.is_none() || t0_text(c) != self.cleared) // (a report that was cleared stays cleared)
                            });
                        }
                        if lv.is_some() {
                            self.last_view = lv;
                            self.report_until = i.wall + cfg.report_s;
                            self.report_auto = false;
                        }
                    }
                }
                "report_clear" => {
                    // hide the report now and forget the fight, so the report key does not bring it back; nothing to clear = nothing happens
                    let up = i.wall < self.report_until;
                    let kept = self.last_view.as_ref().and_then(t0_text).or_else(|| {
                        if !i.engine_ok { return None; }
                        (i.engine_view)().filter(|c| !crate::pyval::truthy(c.get("on"))).and_then(|c| t0_text(&c)).filter(|t| self.cleared.as_ref() != Some(t))
                    });
                    if up || kept.is_some() {
                        self.report_until = 0.0;
                        self.report_auto = false;
                        self.last_view = None;
                        if kept.is_some() { self.cleared = kept; }
                        o.push(Out::ReportClear);
                    }
                }
                _ => {}
            }
            o.push(Out::Draw);
        }
    }

    /// One look (every 50 ms while free look is on).
    pub fn step(&mut self, cfg: &Cfg, i: &mut In) -> Vec<Out> {
        let mut o = Vec::new();
        self.keys_step(cfg, i, &mut o);
        if !cfg.look_on {
            if self.looking {
                self.looking = false;
                self.look_toggle = false;
                o.push(Out::Draw);
            }
            return o;
        }
        let mut looking = self.looking;
        let hl = cfg.headlook.as_ref();
        let btn: String = match hl { Some(h) => h.mouse.clone().unwrap_or_default(), None => cfg.look_btn.clone() };
        let hold = match hl { Some(h) => !h.toggle, None => cfg.look_hold };
        if let Some(vk) = hl.and_then(|h| h.vk) {
            let down_now = (i.state)(vk) & 0x8000 != 0;
            if hold {
                looking = down_now && i.front;
            } else if down_now && !self.look_held && i.front {
                looking = !looking;
            }
            self.look_held = down_now;
        } else if cfg.mouse_ok {
            let down = button_flags(&btn).0;
            for (is_down, flag) in i.mouse {
                if *flag != down { continue; }
                if *is_down && i.front { looking = if hold { true } else { !looking }; }
                else if !*is_down && hold { looking = false; }
            }
        } else {
            let st = (i.state)(button_vk(&btn));
            if hold { looking = st & 0x8000 != 0; } else if st & 1 != 0 && i.front { looking = !looking; }
        }
        if looking != self.looking {
            self.looking = looking;
            if !looking && !cfg.hold_panel && (1..=4).contains(&i.gui) && i.in_cockpit {
                // looking at a side panel in free look puts the game's focus on it; free look over, the head goes back ahead and the game says so
                // a moment later: ahead is taken at once, as with a panel key (given 2 s: the head comes back slowly)
                *i.guess = Some((0, i.perf + 1.0));
                o.push(Out::SetFocus(0));
            }
            o.push(if looking { Out::Hide } else { Out::Draw });
        }
        o
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn free_look_and_keys_match_the_plugin() {
        let Ok(t) = std::fs::read_to_string(crate::host::parity::golden_dir().join("look_golden.json")) else { println!("SKIP"); return };
        let scripts: Vec<Value> = serde_json::from_str(&t).unwrap();
        let hls = [None, Some(("m3", None, false)), Some(("m4", None, true)), Some(("", Some(0x46u32), false)), Some(("", Some(0x47), true))];
        let (mut steps, mut bad) = (0, Vec::new());
        for (si, s) in scripts.iter().enumerate() {
            let c = &s[0];
            let headlook = hls[c["headlook"].as_u64().unwrap() as usize].map(|(m, vk, toggle)| HeadLook { mouse: if m.is_empty() { None } else { Some(m.to_string()) }, vk, toggle, label: String::new() });
            let cfg = Cfg { look_on: c["look"] == "hide", look_btn: c["look_btn"].as_str().unwrap().into(), look_hold: c["look_how"] == "hold", keys_on: c["keys"].as_bool().unwrap(),
                            report_s: c["report_s"].as_f64().unwrap(), report_win_on: c["report_on"].as_bool().unwrap(), headlook, mouse_ok: c["mouse_ok"].as_bool().unwrap(), hold_panel: false };
            let mut ctl = Controls::default();
            let mut guess: Option<(i64, f64)> = None;
            for (k, st) in s[1].as_array().unwrap().iter().enumerate() {
                let (inp, out) = (&st[0], &st[1]);
                ctl.looking = inp["looking"].as_bool().unwrap();
                ctl.report_until = inp["report_until"].as_f64().unwrap();
                ctl.report_auto = inp["report_auto"].as_bool().unwrap();
                ctl.last_view = inp["last_view"].as_i64().map(|t0| json!({"ep": {"t0": t0}}));
                let keys: Vec<String> = inp["keys"].as_array().unwrap().iter().map(|v| v.as_str().unwrap().to_string()).collect();
                let mouse: Vec<(bool, u32)> = inp["mouse"].as_array().unwrap().iter().map(|m| (m[0] == "down", m[1].as_u64().unwrap() as u32)).collect();
                let vkm = inp["vk"].as_object().unwrap().clone();
                let state = |vk: u32| vkm.get(&vk.to_string()).and_then(|v| v.as_u64()).unwrap_or(0) as u16;
                let cur = inp["cur"].clone();
                let ev = || if cur.is_null() { None } else { Some(cur.clone()) };
                let flags = inp["flags"].as_u64().unwrap();
                let in_cockpit = !(flags & 0x0300_0000 == 0 || inp["flags2"].as_u64().unwrap() & 1 != 0) && inp["in_game"] != json!(false);
                let perf = inp["t"].as_f64().unwrap();
                let outs = {
                    let mut i = In { front: inp["front"].as_bool().unwrap(), gui: inp["gui"].as_i64().unwrap(), in_cockpit, keys: &keys, mouse: &mouse, state: &state, perf, wall: perf + 1.7e9,
                                     engine_view: &ev, engine_ok: true, guess: &mut guess };
                    ctl.step(&cfg, &mut i)
                };
                // the plugin's record: hide, focus (only a change of the HUD's panel), draw, counter_reset, claims_reset + claims_base, engine_clear
                let mut hud_gui = inp["hud_gui"].as_i64().unwrap();
                let mut rec: Vec<Value> = Vec::new();
                for o in &outs {
                    match o {
                        Out::Hide => rec.push(json!(["hide"])),
                        Out::SetFocus(g) => { if *g != hud_gui { hud_gui = *g; rec.push(json!(["focus", g])); } }
                        Out::Draw => rec.push(json!(["draw"])),
                        Out::CounterReset => rec.push(json!(["counter_reset"])),
                        Out::ClaimsReset => { rec.push(json!(["claims_reset"])); rec.push(json!(["claims_base", "BASE"])); }
                        Out::EngineClear => rec.push(json!(["engine_clear"])),
                        Out::ReportClear => rec.push(json!(["report_clear"])),
                    }
                }
                let got = json!({"rec": rec, "looking": ctl.looking, "look_toggle": ctl.look_toggle, "look_held": ctl.look_held, "guess": guess.map(|(g, t)| json!([g, t])),
                                 "key_hidden": ctl.key_hidden, "report_until": ctl.report_until, "report_auto": ctl.report_auto,
                                 "last_view": ctl.last_view.as_ref().and_then(|v| v["ep"]["t0"].as_i64()), "hud_gui": hud_gui});
                steps += 1;
                if &got != out { bad.push(format!("script {si} step {k}: plugin {out}\n   app {got}")); }
            }
        }
        println!("free look and keys: {} scripts, {steps} steps, {} differences", scripts.len(), bad.len());
        assert!(bad.is_empty(), "{}", bad.iter().take(4).cloned().collect::<Vec<_>>().join("\n"));
    }

    fn press(ctl: &mut Controls, key: &str, wall: f64, engine: Option<Value>) -> Vec<Out> {
        let cfg = Cfg { keys_on: true, report_s: 10.0, report_win_on: true, ..Default::default() };
        let keys = vec![key.to_string()];
        let st = |_: u32| 0u16;
        let ev = || engine.clone();
        let mut guess = None;
        let mut i = In { front: true, gui: 0, in_cockpit: true, keys: &keys, mouse: &[], state: &st, perf: wall, wall, engine_view: &ev, engine_ok: true, guess: &mut guess };
        ctl.step(&cfg, &mut i)
    }

    /// The report key brings the last fight's report back; the clear key hides it, forgets it and the report key does not bring it back (a new fight's report still comes).
    #[test]
    fn the_clear_key_forgets_the_last_report() {
        let fight = json!({"on": false, "ep": {"t0": 1000, "t1": 2000, "n": 3}});
        let mut ctl = Controls { last_view: Some(fight.clone()), report_until: 1_700_000_050.0, report_auto: true, ..Default::default() };
        let outs = press(&mut ctl, "report_clear", 1_700_000_010.0, Some(fight.clone()));
        assert!(outs.contains(&Out::ReportClear), "{outs:?}");
        assert_eq!((ctl.report_until, ctl.last_view.is_none(), ctl.report_auto), (0.0, true, false));
        // the report key: the engine still has the fight, but it was cleared
        press(&mut ctl, "report", 1_700_000_020.0, Some(fight.clone()));
        assert_eq!(ctl.report_until, 0.0, "a cleared report does not come back");
        assert!(ctl.last_view.is_none());
        // a clear with nothing to clear does nothing
        assert!(!press(&mut ctl, "report_clear", 1_700_000_030.0, Some(fight.clone())).contains(&Out::ReportClear));
        // the next fight's report is not affected
        let next = json!({"on": false, "ep": {"t0": 5000, "t1": 6000, "n": 1}});
        press(&mut ctl, "report", 1_700_000_040.0, Some(next.clone()));
        assert_eq!(ctl.report_until, 1_700_000_050.0);
        assert_eq!(ctl.last_view, Some(next));
    }

    /// No report at all (nothing kept, nothing on the engine): the clear key shows and forgets nothing. A kept report that was already closed is forgotten too.
    #[test]
    fn the_clear_key_with_no_report_does_nothing() {
        let mut ctl = Controls::default();
        assert!(!press(&mut ctl, "report_clear", 1_700_000_000.0, None).contains(&Out::ReportClear));
        assert!(ctl.cleared.is_none());
        let fight = json!({"on": false, "ep": {"t0": 1000, "t1": 2000, "n": 3}});
        let mut ctl = Controls { last_view: Some(fight.clone()), ..Default::default() }; // (closed already, still kept for the report key)
        assert!(press(&mut ctl, "report_clear", 1_700_000_000.0, Some(fight)).contains(&Out::ReportClear));
        assert!(ctl.last_view.is_none());
    }

    /// The game's side panel is open (windows hidden), then the player presses the free look button (Mouse 3, HOLD in the owner's Bindings) over it.
    /// The windows must stay away at every step (owner's recording 25 Nov: they came back over the open left panel). Same glue as live.rs.
    struct Rig { ctl: Controls, f: crate::focus::Focus, gui: i64, t: f64, cfg: Cfg }
    impl Rig {
        fn new(keep: bool) -> Rig {
            let hl = HeadLook { mouse: Some("m3".into()), vk: None, toggle: false, label: String::new() };
            let mut f = crate::focus::Focus::default();
            f.keep = keep;
            Rig { ctl: Controls::default(), f, gui: 0, t: 100.0, cfg: Cfg { look_on: true, headlook: Some(hl), mouse_ok: true, ..Default::default() } }
        }
        /// what the game's Status.json says
        fn status(&mut self, gui: i64) { self.gui = gui; let _ = self.f.set_gui(gui, self.t); self.t += 0.1; }
        /// one 50 ms look with these mouse events (what live.rs does)
        fn look(&mut self, mouse: &[(bool, u32)]) {
            let down = button_flags("m3").0;
            let ev: Vec<(bool, u32)> = mouse.iter().map(|(d, _)| (*d, down)).collect();
            let st = |_: u32| 0u16;
            let eng = || None;
            self.cfg.hold_panel = self.f.hold.is_some();
            let was = self.ctl.looking;
            let mut guess = self.f.guess;
            let outs = {
                let mut i = In { front: true, gui: self.f.gui, in_cockpit: true, keys: &[], mouse: &ev, state: &st, perf: self.t, wall: self.t, engine_view: &eng, engine_ok: true, guess: &mut guess };
                self.ctl.step(&self.cfg, &mut i)
            };
            self.f.guess = guess;
            for o in outs { if let Out::SetFocus(g) = o { let mut a = Vec::new(); self.f.set_focus(g, &mut a); } }
            if self.ctl.looking && !was { self.f.look_started(); }
            self.t += 0.05;
        }
        /// the windows of the front group show (not looking, no panel in the HUD's mind)
        fn visible(&self) -> bool { !self.ctl.looking && self.f.hud_gui == 0 }
    }

    fn panel_sequence(keep: bool, game_says_no_panel: bool) -> Vec<bool> {
        let mut r = Rig::new(keep);
        let mut seen = vec![r.visible()];                       // GuiFocus 0, windows visible
        r.status(2); seen.push(r.visible());                    // the left panel opens: hidden
        r.look(&[(true, 0)]); seen.push(r.visible());           // free look button down: hidden (looking)
        if game_says_no_panel { r.status(0); }                  // (the game may drop the panel focus while the head looks)
        for _ in 0..8 { r.look(&[]); }
        seen.push(r.visible());
        r.look(&[(false, 0)]); seen.push(r.visible());          // button up: the windows must not come back over the open panel
        for _ in 0..40 { r.look(&[]); }                          // 2 s on (guess expiry)
        if let Some(g) = Some(r.t) { let _ = r.f.expire(g + 5.0); }
        seen.push(r.visible());
        r.f.settle();
        seen.push(r.visible());
        seen
    }

    #[test]
    fn free_look_over_an_open_panel_keeps_the_windows_away() {
        for says_zero in [false, true] {
            let seen = panel_sequence(true, says_zero);
            assert_eq!(seen, vec![true, false, false, false, false, false, false], "game says no panel: {says_zero}");
        }
    }

    /// Without the rule (the plugin's way) the windows do come back: the new test is not empty.
    #[test]
    fn without_the_rule_the_windows_come_back_over_the_panel() {
        let seen = panel_sequence(false, false);
        assert_eq!(seen[4], true, "{seen:?}");
    }

    /// The panel is closed by its key again: the windows come back (the rule does not hold them forever).
    #[test]
    fn the_panel_key_ends_the_hold() {
        let mut r = Rig::new(true);
        r.status(2);
        r.look(&[(true, 0)]); r.status(0); r.look(&[(false, 0)]);
        assert!(!r.visible());
        let _ = r.f.guessed(0, r.t); // its key pressed again (panelkeys::guess answers 0)
        assert!(r.f.hold.is_none() && r.visible());
        // and a free look over nothing (no panel open) behaves as before: windows ahead after it
        let mut r = Rig::new(true);
        r.look(&[(true, 0)]); assert!(!r.visible());
        r.look(&[(false, 0)]); assert!(r.visible());
    }
}
