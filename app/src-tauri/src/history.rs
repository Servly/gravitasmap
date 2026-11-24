//! Past combats (history.py): every combat report is kept on this computer, the last 30, as on the site. One file in the app's own folder
//! (combats.json), written whole and put in place at once. Nothing is sent anywhere.
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Mutex;

const KEEP: usize = 30;

pub struct History {
    path: PathBuf,
    pub items: Vec<Value>,
}

fn t0_of(v: &Value) -> Option<&Value> {
    v.get("ep").and_then(|e| e.get("t0")).filter(|t| crate::pyval::truthy(Some(t)))
}

pub fn fav_of(v: &Value) -> bool {
    v.get("fav").and_then(Value::as_bool).unwrap_or(false)
}

fn same(a: &Value, b: &Value) -> bool {
    match (a.as_f64(), b.as_f64()) { (Some(x), Some(y)) => x == y, _ => a == b }
}

impl History {
    pub fn open(path: PathBuf) -> History {
        crate::store::restore(&path);
        // a list file that cannot be read is kept as .bad-<time> and its backup copy is used, never overwritten by an empty list
        let items = crate::store::load_json(&path)
            .and_then(|a| a.as_array().cloned())
            .map(|a| a.into_iter().filter(|v| v.is_object() && t0_of(v).is_some()).collect())
            .unwrap_or_default();
        History { path, items }
    }

    fn write(&self) {
        let tmp = self.path.with_extension("json.tmp");
        if let Some(d) = self.path.parent() {
            let _ = std::fs::create_dir_all(d);
        }
        if std::fs::write(&tmp, Value::Array(self.items.clone()).to_string()).is_ok() {
            let _ = std::fs::rename(&tmp, &self.path);
            if self.items.is_empty() { crate::store::unmirror(&self.path); } else { crate::store::mirror(&self.path); }
        }
    }

    pub fn has(&self, t0: &Value) -> bool {
        self.items.iter().any(|v| t0_of(v).is_some_and(|x| same(x, t0)))
    }

    /// A finished fight's report (the engine's view with on false). The newest first.
    pub fn add(&mut self, v: &Value) {
        let mut r = v.clone();
        r["on"] = json!(false);
        r["rev"] = json!(0);
        r["tg"] = Value::Null;
        if let Some(o) = r.as_object_mut() {
            o.remove("past");
        }
        let Some(t0) = t0_of(&r).cloned() else { return };
        if self.items.iter().any(|x| fav_of(x) && t0_of(x).is_some_and(|y| same(y, &t0))) {
            r["fav"] = json!(true); // (the same one again keeps its star)
        }
        self.items.retain(|x| !t0_of(x).is_some_and(|y| same(y, &t0)));
        self.items.insert(0, r);
        self.trim();
        self.write();
    }

    /// The last KEEP are kept, and the ones marked as favourites are never the ones that go.
    fn trim(&mut self) {
        while self.items.len() > KEEP {
            match self.items.iter().rposition(|v| !fav_of(v)) {
                Some(i) => { self.items.remove(i); }
                None => break,
            }
        }
    }

    /// Mark (or unmark) one as a favourite.
    pub fn set_fav(&mut self, t0: &Value, on: bool) -> bool {
        let Some(v) = self.items.iter_mut().find(|v| t0_of(v).is_some_and(|x| same(x, t0))) else { return false };
        v["fav"] = json!(on);
        self.write();
        true
    }

    /// Returns what was deleted and where, for Undo.
    pub fn delete(&mut self, t0: &Value) -> Option<(usize, Value)> {
        let i = self.items.iter().position(|v| t0_of(v).is_some_and(|x| same(x, t0)))?;
        let v = self.items.remove(i);
        self.write();
        Some((i, v))
    }

    pub fn put_back(&mut self, i: usize, v: Value) {
        if !t0_of(&v).is_some_and(|t| self.has(t)) {
            let at = i.min(self.items.len());
            self.items.insert(at, v);
            self.trim();
            self.write();
        }
    }
}

/// The one history of the app (the Combat overlay adds to it, the window lists it).
pub static HISTORY: Mutex<Option<History>> = Mutex::new(None);
/// The Xeno Hunts (hunts.json): the same kind of list, kept apart from the Combat fights.
pub static THIST: Mutex<Option<History>> = Mutex::new(None);
pub static THSHOW: Mutex<Option<Value>> = Mutex::new(None);
pub static THUNDO: Mutex<Option<(usize, Value)>> = Mutex::new(None);

pub fn init_hunts(path: PathBuf) {
    if let Ok(mut h) = THIST.lock() {
        if h.is_none() {
            *h = Some(History::open(path));
        }
    }
}

/// DEBRIEF: the records of fights and hunts (debriefs.json), the one asked for in the game, and what the last delete removed.
pub static DHIST: Mutex<Option<History>> = Mutex::new(None);
pub static DSHOW: Mutex<Option<Value>> = Mutex::new(None);
pub static DUNDO: Mutex<Option<(usize, Value)>> = Mutex::new(None);

pub fn init_debriefs(path: PathBuf) {
    if let Ok(mut h) = DHIST.lock() {
        if h.is_none() {
            *h = Some(History::open(path));
        }
    }
}

/// A past report the window asked to show on the HUD (the Combat overlay takes it).
pub static SHOW: Mutex<Option<Value>> = Mutex::new(None);
/// What the last delete removed, for Undo.
pub static UNDO: Mutex<Option<(usize, Value)>> = Mutex::new(None);

pub fn init(path: PathBuf) {
    if let Ok(mut h) = HISTORY.lock() {
        if h.is_none() {
            *h = Some(History::open(path));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fight(t0: i64) -> Value {
        json!({"on": true, "past": true, "tg": {"x": 1}, "ep": {"t0": t0, "n": 3}})
    }

    #[test]
    fn favourites_are_never_the_ones_that_go() {
        let dir = std::env::temp_dir().join("gravitas_history_fav_test");
        let _ = std::fs::remove_dir_all(&dir);
        let mut h = History::open(dir.join("combats.json"));
        for t in 1..=3 { h.add(&fight(t)); }
        assert!(h.set_fav(&json!(1), true));
        for t in 4..=40 { h.add(&fight(t)); }
        assert_eq!(h.items.len(), 30);
        assert!(h.items.iter().any(|v| v["ep"]["t0"] == 1 && fav_of(v)), "the favourite is still there");
        assert!(!h.items.iter().any(|v| v["ep"]["t0"] == 2), "an ordinary old one went");
        h.add(&fight(1)); // the same one again keeps its star
        assert!(fav_of(&h.items[0]));
        let again = History::open(dir.join("combats.json"));
        assert_eq!(again.items.len(), h.items.len());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn history_keeps_the_last_thirty_newest_first() {
        let dir = std::env::temp_dir().join("gravitas_history_test");
        let _ = std::fs::remove_dir_all(&dir);
        let mut h = History::open(dir.join("combats.json"));
        for t in 1..=35 {
            h.add(&fight(t));
        }
        assert_eq!(h.items.len(), 30);
        assert_eq!(h.items[0]["ep"]["t0"], 35);
        assert_eq!(h.items[29]["ep"]["t0"], 6);
        assert_eq!(h.items[0]["on"], false);
        assert!(h.items[0].get("past").is_none());
        h.add(&fight(20)); // the same fight again: moved to the front, not doubled
        assert_eq!(h.items.len(), 30);
        assert_eq!(h.items[0]["ep"]["t0"], 20);
        let (i, v) = h.delete(&json!(30)).unwrap();
        assert_eq!(h.items.len(), 29);
        h.put_back(i, v.clone());
        assert_eq!(h.items.len(), 30);
        assert_eq!(h.items[i]["ep"]["t0"], 30);
        h.put_back(0, v); // already there: nothing
        assert_eq!(h.items.len(), 30);
        let again = History::open(dir.join("combats.json"));
        assert_eq!(again.items, h.items, "what is on disk is what is in memory");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
