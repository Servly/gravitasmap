//! Travel history, part 1: one Journal file's text -> stops (systems you arrived at) and the actions done there.
//! Pure code, no files, no settings. A line without one of the wanted event names is never parsed (a cheap text search first).
//! Never kept: the FID, the commander name, ship names, mission ids, free text. (LoadGame is not even looked at.)
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::BufRead;

/// the station names kept from one file to the next (a trade at the very start of a file may name a station docked at in the file before)
pub const STM_KEEP: usize = 12;
/// the station names remembered while a file is read
const STM_RUN: usize = 64;

/// One action done at a stop. k: dock, sell, buy, explore, voucher, mission.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct Act {
    pub k: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub what: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub n: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cr: Option<u64>,
    #[serde(default)]
    pub st: String,
    /// organic data sold (an explore action with this flag)
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub org: bool,
}

/// One arrival in a system.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct Stop {
    pub t: String,
    pub sys: String,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    /// jump | carrier | start
    pub how: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub acts: Vec<Act>,
    /// "taxi" or "crew" when the arrival was a taxi ride or as a crew member
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub fl: String,
}

/// What the next file needs to know about the one before it.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct Tail {
    pub sys: String,
    /// the station you are docked at now ("" when not docked)
    pub st: String,
    /// MarketID -> station name, the most recent last
    pub stm: Vec<(u64, String)>,
}

impl Tail {
    /// a fixed hash (FNV-1a, never changes between app versions) of what is carried over, so a file knows whether it was read with the same start
    pub fn hash(&self) -> u64 {
        let mut h: u64 = 0xcbf29ce484222325;
        let mut eat = |b: &[u8]| { for x in b { h ^= *x as u64; h = h.wrapping_mul(0x100000001b3); } h ^= 0xff; h = h.wrapping_mul(0x100000001b3); };
        eat(self.sys.as_bytes());
        eat(self.st.as_bytes());
        for (m, n) in self.stm.iter().rev().take(STM_KEEP).rev() { eat(&m.to_le_bytes()); eat(n.as_bytes()); }
        h
    }
    pub fn trimmed(mut self) -> Tail {
        if self.stm.len() > STM_KEEP { let cut = self.stm.len() - STM_KEEP; self.stm.drain(..cut); }
        self
    }
}

/// Adds an action to a list the way the page wants it: a dock once per station, repeated buys of one thing at one station added into one, missions per station added up.
pub fn merge_act(v: &mut Vec<Act>, a: Act) {
    match a.k.as_str() {
        "dock" => { if v.iter().any(|x| x.k == "dock" && x.st == a.st) { return; } }
        "buy" => {
            if let Some(x) = v.iter_mut().find(|x| x.k == "buy" && x.what == a.what && x.st == a.st) {
                x.n = Some(x.n.unwrap_or(0) + a.n.unwrap_or(0));
                x.cr = Some(x.cr.unwrap_or(0) + a.cr.unwrap_or(0));
                return;
            }
        }
        "mission" => {
            if let Some(x) = v.iter_mut().find(|x| x.k == "mission" && x.st == a.st) {
                x.n = Some(x.n.unwrap_or(0) + a.n.unwrap_or(0));
                x.cr = Some(x.cr.unwrap_or(0) + a.cr.unwrap_or(0));
                return;
            }
        }
        _ => {}
    }
    v.push(a);
}

/// A name for people: the game's own readable form, else the raw token without `$`, `;` and `:#index=N`.
pub fn clean(raw: &str) -> String {
    if !raw.starts_with('$') { return raw.trim().to_string(); }
    let t = raw.trim_start_matches('$');
    let t = t.split(";").next().unwrap_or(t);
    let t = t.split(":#").next().unwrap_or(t);
    t.replace('_', " ").trim().to_string()
}

fn text<'a>(j: &'a Value, k: &str) -> &'a str { j.get(k).and_then(Value::as_str).unwrap_or("") }
fn num(j: &Value, k: &str) -> u64 {
    j.get(k).and_then(|v| v.as_u64().or_else(|| v.as_f64().map(|f| if f > 0.0 { f as u64 } else { 0 }))).unwrap_or(0)
}
fn flag(j: &Value, k: &str) -> bool { j.get(k).and_then(Value::as_bool).unwrap_or(false) }
fn name_of(j: &Value, raw: &str, loc: &str) -> String {
    let l = text(j, loc);
    if !l.is_empty() { l.trim().to_string() } else { clean(text(j, raw)) }
}
fn r2(v: f64) -> f64 { (v * 100.0).round() / 100.0 }

/// the event's name, found without parsing the line
fn event_of(l: &str) -> Option<&str> {
    let i = l.find("\"event\":\"").map(|i| i + 9).or_else(|| l.find("\"event\": \"").map(|i| i + 10))?;
    let r = &l[i..];
    Some(&r[..r.find('"')?])
}

/// What one file gave: actions before its first arrival (they belong to the stop of the file before), its stops, what the next file needs.
#[derive(Debug, Default, Clone)]
pub struct Parsed {
    pub pre: Vec<Act>,
    pub stops: Vec<Stop>,
    pub tail: Tail,
    /// bytes read
    pub size: u64,
}

pub struct Parser {
    pre: Vec<Act>,
    stops: Vec<Stop>,
    tail: Tail,
}

impl Parser {
    pub fn new(tail: Tail) -> Parser { Parser { pre: Vec::new(), stops: Vec::new(), tail } }

    fn add(&mut self, a: Act) {
        let v = match self.stops.last_mut() { Some(s) => &mut s.acts, None => &mut self.pre };
        merge_act(v, a);
    }
    fn remember(&mut self, mid: u64, name: &str) {
        if mid == 0 || name.is_empty() { return; }
        self.tail.stm.retain(|(m, _)| *m != mid);
        self.tail.stm.push((mid, name.to_string()));
        if self.tail.stm.len() > STM_RUN { self.tail.stm.remove(0); }
    }
    fn station_of(&self, mid: u64) -> String {
        self.tail.stm.iter().find(|(m, _)| *m == mid && mid != 0).map(|(_, n)| n.clone()).unwrap_or_default()
    }
    fn dock_here(&mut self, mid: u64, name: String) {
        if name.is_empty() { return; }
        self.remember(mid, &name);
        self.tail.st = name.clone();
        self.add(Act { k: "dock".into(), st: name, ..Default::default() });
    }

    /// One Journal line.
    pub fn line(&mut self, l: &str) {
        let Some(ev) = event_of(l) else { return };
        if !matches!(ev, "FSDJump" | "CarrierJump" | "Location" | "Docked" | "Undocked" | "MarketBuy" | "MarketSell" | "MultiSellExplorationData"
            | "SellExplorationData" | "SellOrganicData" | "RedeemVoucher" | "MissionCompleted") { return; }
        let Ok(j) = serde_json::from_str::<Value>(l) else { return };
        match ev {
            "FSDJump" | "CarrierJump" | "Location" => self.arrival(ev, &j),
            "Docked" => { let n = name_of(&j, "StationName", "StationName_Localised"); self.dock_here(num(&j, "MarketID"), n); }
            "Undocked" => self.tail.st.clear(),
            "MarketBuy" | "MarketSell" => {
                let what = { let l = text(&j, "Type_Localised"); if l.is_empty() { clean(text(&j, "Type")) } else { l.to_string() } };
                if what.is_empty() { return; }
                let buy = ev == "MarketBuy";
                let st = self.station_of(num(&j, "MarketID"));
                self.add(Act { k: if buy { "buy" } else { "sell" }.into(), what, n: Some(num(&j, "Count")), cr: Some(num(&j, if buy { "TotalCost" } else { "TotalSale" })), st, org: false });
            }
            "MultiSellExplorationData" | "SellExplorationData" => {
                let mut cr = num(&j, "TotalEarnings");
                if cr == 0 { cr = num(&j, "BaseValue") + num(&j, "Bonus"); }
                if cr == 0 { return; }
                let st = self.tail.st.clone();
                self.add(Act { k: "explore".into(), cr: Some(cr), st, ..Default::default() });
            }
            "SellOrganicData" => {
                let cr: u64 = j.get("BioData").and_then(Value::as_array).map(|a| a.iter().map(|b| num(b, "Value") + num(b, "Bonus")).sum()).unwrap_or(0);
                if cr == 0 { return; }
                let st = { let s = self.station_of(num(&j, "MarketID")); if s.is_empty() { self.tail.st.clone() } else { s } };
                self.add(Act { k: "explore".into(), cr: Some(cr), st, org: true, ..Default::default() });
            }
            "RedeemVoucher" => {
                let cr = num(&j, "Amount");
                if cr == 0 { return; }
                let st = self.tail.st.clone();
                self.add(Act { k: "voucher".into(), cr: Some(cr), st, ..Default::default() });
            }
            "MissionCompleted" => {
                let st = self.tail.st.clone();
                self.add(Act { k: "mission".into(), n: Some(1), cr: Some(num(&j, "Reward")), st, ..Default::default() });
            }
            _ => {}
        }
    }

    fn arrival(&mut self, ev: &str, j: &Value) {
        let sys = text(j, "StarSystem");
        if sys.is_empty() { return; }
        let t = text(j, "timestamp");
        if sys != self.tail.sys {
            let pos = j.get("StarPos").and_then(Value::as_array).filter(|a| a.len() == 3).map(|a| (a[0].as_f64(), a[1].as_f64(), a[2].as_f64()));
            let (Some((Some(x), Some(y), Some(z))), false) = (pos, t.is_empty()) else { return };
            let fl = if flag(j, "Taxi") { "taxi" } else if flag(j, "Multicrew") { "crew" } else { "" };
            let how = match ev { "FSDJump" => "jump", "CarrierJump" => "carrier", _ => "start" };
            self.stops.push(Stop { t: t.to_string(), sys: sys.to_string(), x: r2(x), y: r2(y), z: r2(z), how: how.into(), acts: Vec::new(), fl: fl.into() });
            self.tail.sys = sys.to_string();
            self.tail.st.clear();
        }
        match ev {
            "FSDJump" => {}
            _ => {
                if flag(j, "Docked") {
                    let n = name_of(j, "StationName", "StationName_Localised");
                    self.dock_here(num(j, "MarketID"), n);
                } else if ev == "Location" {
                    self.tail.st.clear();
                }
            }
        }
    }

    pub fn finish(self) -> (Vec<Act>, Vec<Stop>, Tail) { (self.pre, self.stops, self.tail.trimmed()) }
}

/// A whole file (line by line, never all in memory), starting with what the file before it left.
pub fn parse_reader<R: BufRead>(mut r: R, tail_in: Tail) -> Parsed {
    let mut p = Parser::new(tail_in);
    let mut buf: Vec<u8> = Vec::new();
    let mut size = 0u64;
    loop {
        buf.clear();
        match r.read_until(b'\n', &mut buf) {
            Ok(0) | Err(_) => break,
            Ok(n) => size += n as u64,
        }
        if buf.len() > 1024 * 1024 { continue; } // not a Journal line
        if let Ok(s) = std::str::from_utf8(&buf) { p.line(s) } else { p.line(&String::from_utf8_lossy(&buf)) }
    }
    let (pre, stops, tail) = p.finish();
    Parsed { pre, stops, tail, size }
}

/// (tests and small texts)
#[allow(dead_code)]
pub fn parse_text(text: &str, tail_in: Tail) -> Parsed { parse_reader(std::io::Cursor::new(text.as_bytes()), tail_in) }
