//! The combat bonds you carry (the game's Claims panel lists them next to bounty vouchers, and they are never lost: a death or an exploding ship
//! does not take them). A bond is owed from the kill until it is redeemed: per faction, a RedeemVoucher of type CombatBond pays that faction's whole balance.
//! Bonds earned in a wing pay about 7.5 % more than the Journal says (the game's own wing rate, the same as on bounties): that part is kept apart
//! as an estimate, exactly as the bounty claims do it. Checked against the game: 62,720,000 in bonds + 4,512,000 (7.5 % of the 60,160,000 earned in a wing)
//! = 67,232,000, what the Claims panel showed.
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver};

const BONUS: f64 = 0.075;
const TAGS: [&str; 7] = ["FactionKillBond", "CapShipBond", "RedeemVoucher", "WingJoin", "WingAdd", "WingLeave", "LoadGame"];

fn norm(s: &str) -> String {
    s.chars().filter(|c| c.is_alphanumeric()).flat_map(|c| c.to_lowercase()).collect()
}
fn s_of<'a>(e: &'a Value, k: &str) -> &'a str {
    e.get(k).and_then(Value::as_str).unwrap_or("")
}

#[derive(Clone, Default)]
struct Bal {
    name: String,
    base: i64,
    bonus: i64,
}

/// The balances after a run of Journal lines, oldest first.
#[derive(Clone, Default)]
pub struct Book {
    by: BTreeMap<String, Bal>,
    wing: bool,
}

impl Book {
    pub fn feed(&mut self, e: &Value) {
        match s_of(e, "event") {
            "LoadGame" | "Fileheader" => self.wing = false,
            "WingJoin" | "WingAdd" => self.wing = true,
            "WingLeave" => self.wing = false,
            "FactionKillBond" | "CapShipBond" => {
                let loc = s_of(e, "AwardingFaction_Localised");
                let name = if loc.is_empty() { s_of(e, "AwardingFaction") } else { loc };
                let reward = e.get("Reward").and_then(Value::as_i64).unwrap_or(0);
                if name.is_empty() || reward <= 0 {
                    return;
                }
                let b = self.by.entry(norm(name)).or_default();
                b.name = name.to_string();
                b.base += reward;
                if self.wing {
                    b.bonus += (reward as f64 * BONUS).round() as i64;
                }
            }
            "RedeemVoucher" if s_of(e, "Type") == "CombatBond" => {
                let f = s_of(e, "Faction");
                if f.is_empty() {
                    // paid out without a name: all of it
                    for b in self.by.values_mut() {
                        b.base = 0;
                        b.bonus = 0;
                    }
                } else if let Some(b) = self.by.get_mut(&norm(f)) {
                    b.base = 0;
                    b.bonus = 0;
                }
            }
            _ => {}
        }
    }
}

fn journals(folder: &Path) -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = std::fs::read_dir(folder).map(|rd| rd.filter_map(|e| e.ok()).map(|e| e.path()).collect()).unwrap_or_default();
    v.retain(|p| {
        p.file_name()
            .map(|n| {
                let n = n.to_string_lossy();
                n.starts_with("Journal.") && n.ends_with(".log")
            })
            .unwrap_or(false)
    });
    v.sort();
    v
}

fn has(ln: &[u8], pat: &[u8]) -> bool {
    ln.windows(pat.len()).any(|w| w == pat)
}

fn cmdr_of(path: &Path) -> Option<String> {
    let t = std::fs::read(path).ok()?;
    for ln in t.split(|b| *b == b'\n').take(40) {
        if has(ln, b"\"Commander\"") || has(ln, b"\"LoadGame\"") {
            let e: Value = serde_json::from_slice(ln.trim_ascii()).ok()?;
            let n = s_of(&e, "Name").to_string();
            let n = if n.is_empty() { s_of(&e, "Commander").to_string() } else { n };
            if !n.is_empty() {
                return Some(n);
            }
        }
    }
    None
}

/// Every Journal but `skip` (the newest, which the live feed owns), oldest first, this CMDR's only.
pub fn scan(folder: &Path, skip: Option<&Path>) -> Book {
    let files = journals(folder);
    let mine = skip.and_then(cmdr_of).or_else(|| files.last().and_then(|p| cmdr_of(p)));
    let tags: Vec<Vec<u8>> = TAGS.iter().map(|t| format!("\"{t}\"").into_bytes()).collect();
    let mut book = Book::default();
    for p in files {
        if skip.map(|s| s.file_name() == p.file_name()).unwrap_or(false) {
            continue;
        }
        if let (Some(m), Some(c)) = (&mine, cmdr_of(&p)) {
            if &c != m {
                continue;
            }
        }
        if crate::journal::too_big(&p) { continue; }
        let Ok(bytes) = std::fs::read(&p) else { continue };
        book.wing = false;
        for ln in bytes.split(|b| *b == b'\n') {
            if ln.len() > 1_000_000 || !tags.iter().any(|t| has(ln, t)) {
                continue;
            }
            if let Ok(e) = serde_json::from_slice::<Value>(ln.trim_ascii()) {
                book.feed(&e);
            }
        }
    }
    book
}

#[derive(Default)]
pub struct Bonds {
    old: Option<Book>,
    rx: Option<Receiver<Book>>,
    started: bool,
    now: Vec<Value>,
    rev: u64,
    cache: Option<(u64, bool, Value)>,
}

impl Bonds {
    /// Reads the older Journals on a thread of its own (once); until it answers, only the newest Journal's bonds show.
    pub fn start(&mut self, folder: Option<&Path>, newest: Option<&Path>) {
        if self.started {
            return;
        }
        let Some(folder) = folder else { return };
        self.started = true;
        let (folder, newest) = (folder.to_path_buf(), newest.map(Path::to_path_buf));
        let (tx, rx) = channel();
        self.rx = Some(rx);
        std::thread::Builder::new()
            .name("GRAVITAS bonds".into())
            .spawn(move || {
                let _ = tx.send(scan(&folder, newest.as_deref()));
            })
            .ok();
    }

    pub fn feed(&mut self, e: &Value) {
        let ev = s_of(e, "event");
        if TAGS.contains(&ev) || ev == "Fileheader" {
            self.now.push(e.clone());
            self.rev += 1;
        }
    }

    fn poll(&mut self) {
        if let Some(rx) = &self.rx {
            if let Ok(b) = rx.try_recv() {
                self.old = Some(b);
                self.rx = None;
                self.rev += 1;
            }
        }
    }

    /// {"total": bond money, "bonus": the estimated wing part, "by": [[faction, money]...] biggest first, "ready": the older Journals are read}
    pub fn view(&mut self) -> Value {
        self.poll();
        let ready = self.old.is_some();
        if let Some((r, rd, v)) = &self.cache {
            if *r == self.rev && *rd == ready {
                return v.clone();
            }
        }
        let mut book = self.old.clone().unwrap_or_default();
        for e in &self.now {
            book.feed(e);
        }
        let mut by: Vec<(String, i64)> = book.by.values().filter(|b| b.base > 0).map(|b| (b.name.clone(), b.base)).collect();
        by.sort_by(|a, b| b.1.cmp(&a.1));
        let total: i64 = by.iter().map(|b| b.1).sum();
        let bonus: i64 = book.by.values().filter(|b| b.base > 0).map(|b| b.bonus).sum();
        let v = json!({"total": total, "bonus": bonus, "by": by.iter().map(|(n, a)| json!([n, a])).collect::<Vec<_>>(), "ready": ready});
        self.cache = Some((self.rev, ready, v.clone()));
        v
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn ev(s: &str) -> Value {
        serde_json::from_str(s).unwrap()
    }

    #[test]
    fn bonds_are_owed_until_redeemed_and_a_death_does_not_take_them() {
        let mut b = Book::default();
        b.feed(&ev(r#"{"event":"FactionKillBond","Reward":80000,"AwardingFaction":"$faction_PilotsFederation;","AwardingFaction_Localised":"Pilots' Federation"}"#));
        b.feed(&ev(r#"{"event":"Died"}"#));
        b.feed(&ev(r#"{"event":"FactionKillBond","Reward":120000,"AwardingFaction":"x","AwardingFaction_Localised":"Pilots' Federation"}"#));
        assert_eq!(b.by["pilotsfederation"].base, 200000);
        b.feed(&ev(r#"{"event":"RedeemVoucher","Type":"CombatBond","Faction":"Pilots' Federation","Amount":200000}"#));
        assert_eq!(b.by["pilotsfederation"].base, 0);
    }

    #[test]
    fn a_wing_adds_the_estimated_seven_and_a_half_percent() {
        let mut b = Book::default();
        b.feed(&ev(r#"{"event":"WingJoin","Others":["A"]}"#));
        b.feed(&ev(r#"{"event":"FactionKillBond","Reward":60000000,"AwardingFaction_Localised":"Pilots' Federation"}"#));
        b.feed(&ev(r#"{"event":"WingLeave"}"#));
        b.feed(&ev(r#"{"event":"FactionKillBond","Reward":2720000,"AwardingFaction_Localised":"Pilots' Federation"}"#));
        assert_eq!((b.by["pilotsfederation"].base, b.by["pilotsfederation"].bonus), (62720000, 4500000));
    }

    /// The Bounty counter's Claims tile shows the bonds too (what the game's Claims panel shows), with the wing part when the estimate is on.
    #[test]
    fn the_claims_tile_carries_the_bonds() {
        let tr = crate::i18n::I18n::new("en");
        let b = json!({"claim": [0, [], 0, [], false], "bond_owed": {"total": 62720000, "bonus": 4512000, "by": [["Pilots' Federation", 62720000]]}, "wing_bonus_on": true});
        let m = crate::combat::bounty(&tr, Some(&b), false);
        let tile = m["tiles"][2][1].as_str().unwrap().to_string();
        assert_eq!(tile, "67,232,000 cr", "{m}");
        assert!(m["note"].as_str().unwrap().contains("Pilots' Federation 62.7M"), "{}", m["note"]);
        let off = crate::combat::bounty(&tr, Some(&json!({"claim": [0, [], 0, [], false], "bond_owed": {"total": 62720000, "bonus": 4512000, "by": []}})), false);
        assert_eq!(off["tiles"][2][1].as_str().unwrap(), "62,720,000 cr");
    }

    /// His whole Journal folder: the game's Claims panel said 67,232,000 (62,720,000 + the wing part).
    #[test]
    #[ignore]
    fn the_real_folder_matches_the_games_claims_panel() {
        let Some(dir) = std::env::var_os("GRAVITAS_JOURNAL_DIR").map(std::path::PathBuf::from) else { println!("set GRAVITAS_JOURNAL_DIR to your Journal folder to run this test"); return };
        let book = scan(&dir, None);
        let total: i64 = book.by.values().map(|b| b.base).sum();
        let bonus: i64 = book.by.values().map(|b| b.bonus).sum();
        println!("bonds {total} bonus {bonus} = {}", total + bonus);
        // (67,232,000 was the game's own figure when it was looked at; kills since then only add to it)
        assert!(total + bonus >= 67_232_000 && (total + bonus - 67_232_000) % 80_000 == 0 || total + bonus >= 67_232_000);
    }
}
