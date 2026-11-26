//! Claims + bonds simulation: random and hand-written Journal scenarios replayed through Host the way live.rs does
//! (Claims/Bonds::start on the older files, catch_up of the newest file, handle for live lines, reset_at, restart with the saved base),
//! compared with a separate reference model. Run: cargo test claimsim -- --nocapture --test-threads=1
use super::Host;
use crate::host::format_ts;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::PathBuf;

const FACS: [&str; 4] = ["Turkish Galactic Empire", "Independent Pilots Guild", "Operation Ida", "Serra One"];
const BFACS: [(&str, &str, &str); 3] = [("$faction_Uniadi;", "Uniadi", "Uniadi"), ("$faction_PilotsFederation;", "Pilots' Federation", "PilotsFederation"), ("$faction_X;", "Colonia Co-operative", "Colonia Co-operative")];
const T0: i64 = 1_795_600_000; // 2026-11-25 or so

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
}

#[derive(Clone, Debug)]
enum Op {
    Bounty(Vec<(usize, i64)>, bool),
    Bond(usize, i64, bool),
    WingJoin,
    WingAdd,
    WingLeave,
    RedeemNamed(Vec<usize>),
    RedeemUnnamed(Vec<usize>),
    RedeemBondNamed(usize, u8),
    RedeemBondAll,
    Died,
    Gap(i64),
    Reset,
    Undo,
    NewFile(bool), // (true: the game writes WingLeave before Shutdown, as it does in the real Journals)
    Restart,
}

fn norm(s: &str) -> String {
    s.chars().filter(|c| c.is_alphanumeric()).flat_map(|c| c.to_lowercase()).collect()
}

/// The reference: balances after `events`, money stamped at or before `base` not counted. Independent of claims.rs and bonds.rs.
fn reference(events: &[Value], base: &str) -> [i64; 4] {
    let mut bal: BTreeMap<String, i64> = BTreeMap::new();
    let mut wing: BTreeMap<String, i64> = BTreeMap::new();
    let mut bond: BTreeMap<String, (i64, i64)> = BTreeMap::new();
    let mut inw = false;
    for e in events {
        let ev = e["event"].as_str().unwrap_or("");
        let ts = e["timestamp"].as_str().unwrap_or("");
        let money = matches!(ev, "Bounty" | "RedeemVoucher" | "FactionKillBond" | "CapShipBond");
        if money && !base.is_empty() && ts <= base {
            continue;
        }
        match ev {
            "Fileheader" | "LoadGame" | "WingLeave" => inw = false,
            "WingJoin" | "WingAdd" => inw = true,
            "Died" => {
                bal.clear();
                wing.clear();
            }
            "Bounty" => {
                let rs: Vec<(String, i64)> = if let Some(a) = e.get("Rewards").and_then(Value::as_array) {
                    a.iter().map(|r| (r["Faction"].as_str().unwrap().to_string(), r["Reward"].as_i64().unwrap())).collect()
                } else {
                    vec![(e["Faction"].as_str().unwrap().to_string(), e["Reward"].as_i64().unwrap())]
                };
                for (f, r) in rs {
                    *bal.entry(f.clone()).or_default() += r;
                    if inw {
                        *wing.entry(f).or_default() += r;
                    }
                }
            }
            "RedeemVoucher" if e["Type"] == "bounty" => {
                for fe in e["Factions"].as_array().cloned().unwrap_or_default() {
                    let f = fe["_f"].as_str().unwrap().to_string();
                    bal.insert(f.clone(), 0);
                    wing.insert(f, 0);
                }
                if e.get("_all").is_some() {
                    bal.clear();
                    wing.clear();
                }
            }
            "FactionKillBond" | "CapShipBond" => {
                let n = norm(e["AwardingFaction_Localised"].as_str().unwrap());
                let r = e["Reward"].as_i64().unwrap();
                let b = bond.entry(n).or_default();
                b.0 += r;
                if inw {
                    b.1 += (r as f64 * 0.075).round() as i64;
                }
            }
            "RedeemVoucher" if e["Type"] == "CombatBond" => {
                if e.get("_all").is_some() {
                    bond.clear();
                } else {
                    let n = norm(e["_f"].as_str().unwrap());
                    bond.insert(n, (0, 0));
                }
            }
            _ => {}
        }
    }
    let ct: i64 = bal.values().map(|v| (*v).max(0)).sum();
    let cw: i64 = wing.iter().map(|(f, v)| (*v).max(0).min(bal.get(f).copied().unwrap_or(0).max(0))).sum();
    let bt: i64 = bond.values().map(|b| b.0).sum();
    let bw: i64 = bond.values().filter(|b| b.0 > 0).map(|b| b.1).sum();
    [ct, (cw as f64 * 0.075).round() as i64, bt, bw]
}

struct Sim {
    dir: PathBuf,
    files: Vec<PathBuf>,
    host: Option<Host>,
    saved_base: String,
    clock: i64,
    all: Vec<Value>, // every line written, in order
    // the game's own ledger (no reset): what a cash-in pays
    g_bal: BTreeMap<usize, i64>,
    g_wing: BTreeMap<usize, i64>,
    g_bond: BTreeMap<usize, (i64, i64)>,
    inw: bool,
    seq: u64,
    log: Vec<String>,
}

impl Sim {
    fn new(tag: &str) -> Sim {
        let dir = std::env::temp_dir().join(format!("claimsim_{}_{}", std::process::id(), tag));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let mut s = Sim { dir, files: vec![], host: None, saved_base: String::new(), clock: T0, all: vec![], g_bal: BTreeMap::new(), g_wing: BTreeMap::new(), g_bond: BTreeMap::new(), inw: false, seq: 0, log: vec![] };
        s.new_file(false);
        s.start_app();
        s
    }

    fn write(&mut self, e: &Value) {
        use std::io::Write;
        let mut f = std::fs::OpenOptions::new().append(true).create(true).open(self.files.last().unwrap()).unwrap();
        writeln!(f, "{}", e).unwrap();
        self.all.push(e.clone());
    }

    fn stamp(&mut self, mut e: Value) -> Value {
        self.clock += 1;
        e["timestamp"] = json!(format_ts(self.clock));
        e
    }

    fn new_file(&mut self, live: bool) {
        let idx = self.files.len();
        let p = self.dir.join(format!("Journal.2026-11-25T{:06}.01.log", 100000 + idx));
        self.files.push(p);
        let evs = [json!({"event":"Fileheader","gameversion":"4.0.0.1","part":1}), json!({"event":"Commander","Name":"Hongark"}), json!({"event":"LoadGame","Commander":"Hongark","Ship":"x"})];
        for e in evs {
            let e = self.stamp(e);
            self.write(&e);
            if live {
                let now = self.clock as f64 + 1.0;
                self.host.as_mut().unwrap().handle(&e, now);
            }
        }
        self.inw = false;
    }

    fn start_app(&mut self) {
        // file times in order, newest last
        for (i, p) in self.files.iter().enumerate() {
            let f = std::fs::OpenOptions::new().write(true).open(p).unwrap();
            f.set_modified(std::time::UNIX_EPOCH + std::time::Duration::from_secs(1_700_000_000 + i as u64 * 1000)).unwrap();
        }
        let mut h = Host::new(false).unwrap();
        h.set.claim_bonds = true;
        h.set.wing_bonus_on = true;
        if !self.saved_base.is_empty() {
            h.claims.set_base(&self.saved_base);
        }
        let newest = self.files.last().unwrap().clone();
        let past: Vec<Value> = std::fs::read_to_string(&newest).unwrap().lines().filter_map(|l| serde_json::from_str(l).ok()).collect();
        h.claims.start(Some(&self.dir), Some(&newest));
        h.bonds.start(Some(&self.dir), Some(&newest));
        h.catch_up(&past);
        h.claims.wait_for_old();
        for _ in 0..4000 {
            if h.bonds.view()["ready"] == json!(true) {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(2));
        }
        self.host = Some(h);
    }

    fn app(&mut self) -> [i64; 4] {
        let h = self.host.as_mut().unwrap();
        let base = h.claims.base().to_string();
        h.bonds.set_base(&base);
        let c = h.claims.view();
        let b = h.bonds.view();
        let ct = c[0].as_i64().unwrap_or(-1);
        let cw = c[2].as_i64().unwrap_or(-1);
        [ct, cw, b["total"].as_i64().unwrap(), b["bonus"].as_i64().unwrap()]
    }

    fn truth(&self) -> [i64; 4] {
        reference(&self.all, &self.saved_base)
    }

    fn feed(&mut self, e: Value) {
        let e = self.stamp(e);
        self.write(&e);
        let now = self.clock as f64 + 1.1;
        self.host.as_mut().unwrap().handle(&e, now);
    }

    /// What the game pays for a voucher of `b` of which `w` was earned in a wing. SIMB=1: +7.5 % on everything (squadron perk, solo too).
    /// SIMP=n: the game pays up to n tenths of a percent less (seen: 0.1-0.5 %).
    fn pay(&mut self, b: i64, w: i64) -> i64 {
        let mode = std::env::var("SIMB").ok();
        let mut a = if mode.as_deref() == Some("1") { b + (b as f64 * 0.075).round() as i64 } else { b + (w as f64 * 0.075).round() as i64 };
        if let Some(n) = std::env::var("SIMP").ok().and_then(|v| v.parse::<u64>().ok()) {
            let k = (self.seq.wrapping_mul(2654435761) >> 7) % (n + 1);
            a -= a * k as i64 / 1000;
        }
        a
    }

    fn apply(&mut self, op: &Op) {
        self.seq += 1;
        match op {
            Op::Gap(n) => self.clock += n,
            Op::Bounty(rs, multi) => {
                let tot: i64 = rs.iter().map(|r| r.1).sum();
                let e = if *multi || rs.len() > 1 {
                    json!({"event":"Bounty","Rewards": rs.iter().map(|(f, r)| json!({"Faction": FACS[*f], "Reward": r})).collect::<Vec<_>>(), "TotalReward": tot, "VictimFaction":"v", "Target": format!("k{}", self.seq)})
                } else {
                    json!({"event":"Bounty","Faction": FACS[rs[0].0], "Reward": rs[0].1, "VictimFaction":"v", "Target": format!("k{}", self.seq)})
                };
                for (f, r) in rs {
                    *self.g_bal.entry(*f).or_default() += r;
                    if self.inw {
                        *self.g_wing.entry(*f).or_default() += r;
                    }
                }
                self.feed(e);
            }
            Op::Bond(f, r, cap) => {
                let (raw, loc, _) = BFACS[*f];
                let e = json!({"event": if *cap {"CapShipBond"} else {"FactionKillBond"}, "Reward": r, "AwardingFaction": raw, "AwardingFaction_Localised": loc, "VictimFaction":"v"});
                let g = self.g_bond.entry(*f).or_default();
                g.0 += r;
                if self.inw {
                    g.1 += (*r as f64 * 0.075).round() as i64;
                }
                self.feed(e);
            }
            Op::WingJoin | Op::WingAdd => {
                self.inw = true;
                self.feed(json!({"event": if matches!(op, Op::WingJoin) {"WingJoin"} else {"WingAdd"}, "Others":["A"], "Name":"A"}));
            }
            Op::WingLeave => {
                self.inw = false;
                self.feed(json!({"event":"WingLeave"}));
            }
            Op::RedeemNamed(fs) => {
                let mut ents = vec![];
                for f in fs {
                    let b = self.g_bal.get(f).copied().unwrap_or(0);
                    if b <= 0 {
                        continue;
                    }
                    let w = self.g_wing.get(f).copied().unwrap_or(0).min(b);
                    let amt = self.pay(b, w);
                    ents.push(json!({"Faction": FACS[*f], "Amount": amt, "_f": FACS[*f]}));
                    self.g_bal.insert(*f, 0);
                    self.g_wing.insert(*f, 0);
                }
                if !ents.is_empty() {
                    let tot: i64 = ents.iter().map(|x| x["Amount"].as_i64().unwrap()).sum();
                    self.feed(json!({"event":"RedeemVoucher","Type":"bounty","Amount":tot,"Factions":ents}));
                }
            }
            Op::RedeemUnnamed(fs) => {
                let mut ents = vec![];
                for f in fs {
                    let b = self.g_bal.get(f).copied().unwrap_or(0);
                    if b <= 0 {
                        continue;
                    }
                    let w = self.g_wing.get(f).copied().unwrap_or(0).min(b);
                    let amt = self.pay(b, w);
                    ents.push(json!({"Faction": "", "Amount": amt, "_f": FACS[*f]}));
                    self.g_bal.insert(*f, 0);
                    self.g_wing.insert(*f, 0);
                }
                if !ents.is_empty() {
                    let tot: i64 = ents.iter().map(|x| x["Amount"].as_i64().unwrap()).sum();
                    self.feed(json!({"event":"RedeemVoucher","Type":"bounty","Amount":tot,"Factions":ents}));
                }
            }
            Op::RedeemBondNamed(f, style) => {
                let g = self.g_bond.get(f).copied().unwrap_or((0, 0));
                if g.0 <= 0 {
                    return;
                }
                let amt = g.0 + g.1;
                let (_, loc, short) = BFACS[*f];
                let e = match style {
                    0 => json!({"event":"RedeemVoucher","Type":"CombatBond","Amount":amt,"Faction":short,"_f":loc}),
                    1 => json!({"event":"RedeemVoucher","Type":"CombatBond","Amount":amt,"Factions":[{"Faction":short,"Amount":amt}],"_f":loc}),
                    _ => json!({"event":"RedeemVoucher","Type":"CombatBond","Amount":amt,"Faction_Localised":loc,"_f":loc}),
                };
                self.g_bond.insert(*f, (0, 0));
                self.feed(e);
            }
            Op::RedeemBondAll => {
                let amt: i64 = self.g_bond.values().map(|g| g.0 + g.1).sum();
                if amt <= 0 {
                    return;
                }
                self.g_bond.clear();
                self.feed(json!({"event":"RedeemVoucher","Type":"CombatBond","Amount":amt,"_all":1}));
            }
            Op::Died => {
                self.g_bal.clear();
                self.g_wing.clear();
                self.feed(json!({"event":"Died"}));
            }
            Op::Reset => {
                self.clock += 1;
                let base = self.host.as_mut().unwrap().claims.reset_at(self.clock);
                self.saved_base = base; // (live.rs: store::set claims_base)
            }
            Op::Undo => {
                self.host.as_mut().unwrap().claims.set_base("");
                self.saved_base = String::new();
            }
            Op::NewFile(leave) => {
                if self.inw && *leave {
                    self.inw = false;
                    self.feed(json!({"event":"WingLeave"}));
                }
                self.feed(json!({"event":"Shutdown"}));
                self.new_file(true);
            }
            Op::Restart => {
                self.host = None;
                self.start_app();
            }
        }
    }
}

fn gen(seed: u64, len: usize, unnamed: bool) -> Vec<Op> {
    let mut r = Rng(seed.wrapping_mul(0x9E3779B97F4A7C15) | 1);
    let mut ops = vec![];
    for _ in 0..len {
        let k = r.below(100);
        let amt = |r: &mut Rng| ((r.below(900) + 1) as i64) * 1000 + if r.below(4) == 0 { r.below(999) as i64 } else { 0 };
        let op = match k {
            0..=29 => {
                let n = if r.below(5) == 0 { 2 + r.below(2) as usize } else { 1 };
                let mut v = vec![];
                for _ in 0..n {
                    v.push((r.below(4) as usize, amt(&mut r)));
                }
                // one faction once per line (the game lists each faction once)
                v.sort_by_key(|x| x.0);
                v.dedup_by_key(|x| x.0);
                Op::Bounty(v, r.below(2) == 0)
            }
            30..=41 => Op::Bond(r.below(3) as usize, [80000, 120000, 190000, 5000][r.below(4) as usize], r.below(10) == 0),
            42..=46 => Op::WingJoin,
            47..=48 => Op::WingAdd,
            49..=53 => Op::WingLeave,
            54..=60 => {
                let n = 1 + r.below(3) as usize;
                let fs: Vec<usize> = (0..n).map(|_| r.below(4) as usize).collect();
                if unnamed && r.below(2) == 0 {
                    if std::env::var("SIMU").map(|v| v == "2").unwrap_or(false) { Op::RedeemUnnamed(fs) } else { Op::RedeemUnnamed((0..4).collect()) }
                } else { Op::RedeemNamed(fs) }
            }
            61..=63 => Op::RedeemBondNamed(r.below(3) as usize, r.below(3) as u8),
            64 => Op::RedeemBondAll,
            65 => Op::Died,
            66..=71 => Op::Reset,
            72 => Op::Undo,
            73..=75 => Op::NewFile(true),
            76..=80 => Op::Restart,
            _ => Op::Gap(1 + r.below(40) as i64),
        };
        ops.push(op);
    }
    ops
}

/// Runs the ops, compares after each one; returns the first mismatch as text.
fn run(tag: &str, ops: &[Op]) -> Option<(usize, String, [i64; 4], [i64; 4])> {
    let mut s = Sim::new(tag);
    let mut out = None;
    for (i, op) in ops.iter().enumerate() {
        s.apply(op);
        let (a, t) = (s.app(), s.truth());
        let bad = (a[0] - t[0]).abs() > 0 || (a[1] - t[1]).abs() > 1 || a[2] != t[2] || (a[3] - t[3]).abs() > 1;
        if bad {
            out = Some((i, format!("{:?}", op), a, t));
            break;
        }
    }
    drop(s.host.take());
    let _ = std::fs::remove_dir_all(&s.dir);
    out
}

fn shrink(tag: &str, ops: &[Op], kind: &dyn Fn(&[i64; 4], &[i64; 4]) -> String, want: &str) -> Vec<Op> {
    let mut cur = ops.to_vec();
    let mut i = 0;
    while i < cur.len() {
        let mut t = cur.clone();
        t.remove(i);
        match run(tag, &t) {
            Some((_, _, a, tr)) if kind(&a, &tr) == want => cur = t,
            _ => i += 1,
        }
    }
    cur
}

fn kind(a: &[i64; 4], t: &[i64; 4]) -> String {
    let n = ["claims_total", "claims_bonus", "bonds_total", "bonds_bonus"];
    (0..4).filter(|i| a[*i] != t[*i]).map(|i| n[i]).collect::<Vec<_>>().join("+")
}

fn show(ops: &[Op]) -> String {
    ops.iter().filter(|o| !matches!(o, Op::Gap(_))).map(|o| format!("{:?}", o)).collect::<Vec<_>>().join("\n    ")
}

#[test]
fn claimsim_random() {
    let n: u64 = std::env::var("SIMN").ok().and_then(|v| v.parse().ok()).unwrap_or(100);
    let unnamed = std::env::var("SIMU").map(|v| v != "0").unwrap_or(false);
    let len: usize = std::env::var("SIML").ok().and_then(|v| v.parse().ok()).unwrap_or(40);
    let (mut bad, mut kinds): (usize, BTreeMap<String, (usize, u64)>) = (0, BTreeMap::new());
    for seed in 1..=n {
        let ops = gen(seed, len, unnamed);
        if let Some((i, op, a, t)) = run("rnd", &ops) {
            bad += 1;
            let k = kind(&a, &t);
            let e = kinds.entry(k.clone()).or_insert((0, seed));
            e.0 += 1;
            if e.0 == 1 {
                let mini = shrink("rnd", &ops[..=i], &kind, &k);
                println!("MISMATCH seed {seed} at op {i} ({op}) app {:?} truth {:?} kind {k}\n  minimal ({} ops):\n    {}", a, t, mini.len(), show(&mini));
            }
        }
    }
    println!("SCENARIOS {n} (unnamed={unnamed}, len={len}): {bad} mismatching; kinds {:?}", kinds);
}

/// Timestamp forms against the reset line (base = 10:30:00Z): which of these lines does the app count?
#[test]
fn claimsim_timestamps() {
    let base = "2026-11-25T10:30:00Z";
    let cases = [
        ("2026-11-25T10:29:59Z", false, "one second before"),
        ("2026-11-25T10:30:00Z", false, "same second (the line is at or before)"),
        ("2026-11-25T10:30:01Z", true, "one second after"),
        ("2026-11-25T10:30:00.500Z", true, "same second, 0.5 s after (fraction)"),
        ("2026-11-25T10:29:59.900Z", false, "before, with a fraction"),
        ("2026-11-25T11:00:00+01:00", false, "10:00Z written with an offset: BEFORE the line"),
        ("2026-11-25T11:45:00+01:00", true, "10:45Z written with an offset: after"),
        ("2026-11-25T09:45:00-01:00", true, "10:45Z written with an offset: after"),
        ("2026-11-25T10:30:00.0Z", false, "same second with .0 (the line is at or before)"),
    ];
    for (ts, truth_counts, what) in cases {
        let mut c = crate::claims::Claims::new();
        c.start(None, None);
        c.set_base(base);
        c.feed(&json!({"timestamp": ts, "event":"Bounty","Faction":"A","Reward":1000}));
        let counted = c.view()[0].as_i64().unwrap() == 1000;
        let mut b = crate::bonds::Bonds::default();
        b.set_base(base);
        b.feed(&json!({"timestamp": ts, "event":"FactionKillBond","Reward":1000,"AwardingFaction_Localised":"A"}));
        let bc = b.view()["total"].as_i64().unwrap() == 1000;
        assert!(counted == truth_counts && bc == truth_counts, "{ts} ({what}): claims counts={counted} bonds counts={bc}, expected {truth_counts}");
    }
}
