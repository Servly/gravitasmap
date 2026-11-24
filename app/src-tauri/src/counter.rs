//! The Bounty counter: bounty.py's Counter, line for line. "This fight" and Kills (back to 0 as a fight ends), and what you carry
//! (unclaimed, cashed in, lost at death) from the Journal's lines.
use crate::claims::BONUS;
use crate::pyval::{float_or0, int_or0, lower_str, round};
use serde_json::{json, Value};

#[derive(Default, Clone)]
pub struct Counter {
    pub cr: i64,
    pub n: i64,
    pub bonds: i64,
    pub bond_n: i64,
    pub rev: u64,
    pub unclaimed: i64,
    pub unclaimed_bonds: i64,
    pub cashed: i64,
    pub lost: i64,
    pub wing_cr: i64,
    in_wing: bool,
}

/// A Bounty line's whole reward (every faction that pays it).
pub fn reward_of(e: &Value) -> i64 {
    let total = e.get("TotalReward").filter(|v| !v.is_null());
    let reward: i64 = match total {
        Some(v) => int_or0(Some(v)),
        None => {
            let sum: i64 = e.get("Rewards").and_then(Value::as_array).map(|a| a.iter().map(|r| int_or0(r.get("Reward"))).sum()).unwrap_or(0);
            if sum != 0 { sum } else { int_or0(e.get("Reward")) }
        }
    };
    reward
}

impl Counter {
    pub fn new() -> Counter {
        Counter::default()
    }

    pub fn reset(&mut self) {
        self.cr = 0;
        self.n = 0;
        self.bonds = 0;
        self.bond_n = 0;
        self.wing_cr = 0;
        self.rev += 1;
    }

    pub fn feed(&mut self, e: &Value) {
        let ev = e.get("event").and_then(Value::as_str).unwrap_or("");
        match ev {
            "Fileheader" => self.reset(), // a new game session: a new Journal file
            "Bounty" => {
                let a = reward_of(e);
                self.cr += a;
                self.n += 1;
                if self.in_wing {
                    self.wing_cr += a;
                }
                self.rev += 1;
            }
            "FactionKillBond" | "CapShipBond" => {
                self.bonds += int_or0(e.get("Reward"));
                self.bond_n += 1;
                self.rev += 1;
            }
            _ => {}
        }
        self.feed_past(e);
    }

    /// What you carry, and the live wing state (a wing joined before the app started is not missed).
    pub fn feed_past(&mut self, e: &Value) {
        let ev = e.get("event").and_then(Value::as_str).unwrap_or("");
        match ev {
            "WingJoin" | "WingAdd" => {
                self.in_wing = true;
                return;
            }
            "WingLeave" => {
                self.in_wing = false;
                return;
            }
            "Bounty" => self.unclaimed += reward_of(e),
            "FactionKillBond" | "CapShipBond" => self.unclaimed_bonds += int_or0(e.get("Reward")),
            "RedeemVoucher" if matches!(lower_str(e, "Type").as_str(), "bounty" | "combatbond") => {
                let paid = int_or0(e.get("Amount"));
                let cut = float_or0(e.get("BrokerPercentage")); // (Interstellar Factors keep a share: what was owed)
                let owed = if 0.0 < cut && cut < 100.0 { round(paid as f64 / (1.0 - cut / 100.0)) } else { paid };
                if lower_str(e, "Type") == "bounty" {
                    self.unclaimed = (self.unclaimed - owed).max(0);
                } else {
                    self.unclaimed_bonds = (self.unclaimed_bonds - owed).max(0);
                }
                self.cashed += paid;
            }
            "Died" => {
                self.lost += self.unclaimed + self.unclaimed_bonds;
                self.unclaimed = 0;
                self.unclaimed_bonds = 0;
            }
            _ => return,
        }
        self.rev += 1;
    }

    pub fn view(&self, with_bonds: bool) -> Value {
        json!({
            "cr": self.cr + if with_bonds { self.bonds } else { 0 },
            "n": self.n + if with_bonds { self.bond_n } else { 0 },
            "bounties": self.cr, "kills": self.n,
            "bonds": if with_bonds { json!(self.bonds) } else { Value::Null },
            "bond_n": self.bond_n,
            "unclaimed": self.unclaimed + if with_bonds { self.unclaimed_bonds } else { 0 },
            "cashed": self.cashed, "lost": self.lost,
            "wing_bonus": round(self.wing_cr as f64 * (BONUS - 1.0)),
        })
    }
}
