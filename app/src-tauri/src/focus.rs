//! Which of the game's panels is open (GuiFocus) and what the windows do about it: load.py's set_gui, settle and the panel-key guess.
//! A pure state machine (the caller gives it the time and carries out what it answers), proven against the plugin's own functions.
pub const BETWEEN: i64 = 99; // a panel just closed by the game's own screens: maybe a map comes next (no window shows in between)
const SETTLE_S: f64 = 0.8; // the windows ahead wait this long before coming back
const GUESS_S: f64 = 1.0; // a panel guessed from its key that Status.json does not confirm this soon is taken back
const MAP_GUESS_S: f64 = 5.0; // a map takes a while to load

#[derive(Debug, PartialEq, Clone)]
pub enum Act {
    /// the HUD's windows go with this panel (hud.set_focus)
    Focus(i64),
    /// the game ends free look
    LookReset,
    /// draw the windows again
    Draw,
    /// call settle() after this many milliseconds
    After(u32),
}

#[derive(Default)]
pub struct Focus {
    /// GuiFocus from Status.json: 0 none, 1 right panel, 2 left, 3 comms, 4 role, 5-11 maps and services
    pub gui: i64,
    /// the panel the HUD shows for now (a guess or BETWEEN may differ from gui)
    pub hud_gui: i64,
    /// the panel guessed from its key, and when
    pub guess: Option<(i64, f64)>,
}

fn is_map(g: i64) -> bool {
    (5..12).contains(&g)
}

impl Focus {
    pub fn set_focus(&mut self, g: i64, acts: &mut Vec<Act>) {
        if g != self.hud_gui {
            self.hud_gui = g;
            acts.push(Act::Focus(g));
        }
    }

    /// One of the game's panels opened or closed.
    pub fn set_gui(&mut self, gui: i64, now: f64) -> Vec<Act> {
        let mut a = Vec::new();
        if gui == self.gui {
            return a; // (Status.json is written for many things: one written before the game opened the panel a key asked for must not undo the guess)
        }
        if gui == 0 && (1..=4).contains(&self.gui) && self.guess.is_none() {
            // a panel closed by the game itself, not by its key (a map chosen in the left panel): nothing shows in between
            self.gui = gui;
            self.set_focus(BETWEEN, &mut a);
            a.push(Act::After((SETTLE_S * 1000.0) as u32));
            return a;
        }
        if let (0, Some((g, t))) = (gui, self.guess) {
            if (1..=4).contains(&g) && now - t < GUESS_S {
                self.gui = gui; // from one side panel straight to another the game says "no panel" for a moment: the HUD stays where it is
                return a;
            }
        }
        self.guess = None;
        self.gui = gui;
        if is_map(gui) {
            a.push(Act::LookReset);
        }
        self.set_focus(gui, &mut a);
        a.push(Act::Draw);
        a
    }

    /// After SETTLE_S: still no panel and no map: the windows ahead come back.
    pub fn settle(&mut self) -> Vec<Act> {
        let mut a = Vec::new();
        if self.hud_gui == BETWEEN && self.gui == 0 {
            self.set_focus(0, &mut a);
            a.push(Act::Draw);
        }
        a
    }

    /// A panel key was just pressed in the ship: the windows go now, before Status.json says so.
    pub fn guessed(&mut self, g: i64, now: f64) -> Vec<Act> {
        let mut a = Vec::new();
        self.guess = Some((g, now));
        self.set_focus(g, &mut a);
        if is_map(g) {
            a.push(Act::Draw);
        }
        a
    }

    /// A guess Status.json has not confirmed in time is taken back.
    pub fn expire(&mut self, now: f64) -> Vec<Act> {
        let mut a = Vec::new();
        if let Some((g, t)) = self.guess {
            if now - t > if is_map(g) { MAP_GUESS_S } else { GUESS_S } {
                self.guess = None;
                let gui = self.gui;
                self.set_focus(gui, &mut a);
                a.push(Act::Draw);
            }
        }
        a
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    fn rec(a: &[Act]) -> Value {
        Value::Array(a.iter().map(|x| match x {
            Act::Focus(g) => json!(["focus", g]),
            Act::LookReset => json!(["look_reset"]),
            Act::Draw => json!(["draw"]),
            Act::After(ms) => json!(["after", ms]),
        }).collect())
    }

    #[test]
    fn focus_matches_the_plugin() {
        let Ok(t) = std::fs::read_to_string(crate::host::parity::golden_dir().join("focus_golden.json")) else { println!("SKIP"); return };
        let scripts: Vec<Value> = serde_json::from_str(&t).unwrap();
        let (mut steps, mut bad) = (0, Vec::new());
        for (si, s) in scripts.iter().enumerate() {
            let mut f = Focus::default();
            for (i, op) in s[0].as_array().unwrap().iter().enumerate() {
                let (kind, now) = (op[0].as_str().unwrap(), op[1].as_f64().unwrap());
                let acts = match kind {
                    "gui" => f.set_gui(op[2].as_i64().unwrap(), now),
                    "guess" => f.guessed(op[2].as_i64().unwrap(), now),
                    "expire" => f.expire(now),
                    _ => f.settle(),
                };
                let want = &s[1][i];
                let got = json!([rec(&acts), f.gui, f.hud_gui, f.guess.map(|(g, t)| json!([g, t]))]);
                steps += 1;
                if &got != want { bad.push(format!("script {si} step {i} {op}: plugin {want}, app {got}")); }
            }
        }
        println!("focus: {} scripts, {steps} steps, {} differences", scripts.len(), bad.len());
        assert!(bad.is_empty(), "{}", bad.iter().take(5).cloned().collect::<Vec<_>>().join("\n"));
    }
}
