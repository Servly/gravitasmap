//! Travel history: the small summary of one month that the index keeps (counts, credits, light years, top goods and stations, a coarse density grid).
//! Built from the month's stops when the month is written. Holds no commander, ship or mission names.
use super::parse::Stop;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// size of one cell of the density grid, in light years
pub const CELL: f64 = 500.0;
/// at most this many grid cells per month (the rarest are dropped)
pub const MAX_CELLS: usize = 300;
const TOP: usize = 5;

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct MonthSum {
    pub n: usize,
    pub t0: String,
    pub t1: String,
    /// changes whenever this month's stops change
    pub r: u64,
    /// credits earned: sold goods + exploration + vouchers + mission rewards
    pub cr: u64,
    /// light years flown: the distance from each stop to the next one in this month (a game start is not a flight)
    pub ly: f64,
    pub sys: usize,
    pub sell: Vec<(String, u64)>,
    pub buy: Vec<(String, u64)>,
    pub dock: Vec<(String, u32)>,
    pub grid: Vec<(i32, i32, u32)>,
}

fn top_cr(m: HashMap<String, u64>) -> Vec<(String, u64)> {
    let mut v: Vec<(String, u64)> = m.into_iter().collect();
    v.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    v.truncate(TOP);
    v
}

pub fn sum_of(stops: &[Stop], r: u64) -> MonthSum {
    let mut s = MonthSum { n: stops.len(), r, ..Default::default() };
    if stops.is_empty() { return s; }
    s.t0 = stops[0].t.clone();
    s.t1 = stops[stops.len() - 1].t.clone();
    let (mut sell, mut buy): (HashMap<String, u64>, HashMap<String, u64>) = (HashMap::new(), HashMap::new());
    let mut dock: HashMap<String, u32> = HashMap::new();
    let mut grid: HashMap<(i32, i32), u32> = HashMap::new();
    let mut names: HashSet<&str> = HashSet::new();
    let mut ly = 0.0f64;
    for (i, st) in stops.iter().enumerate() {
        names.insert(st.sys.as_str());
        *grid.entry(((st.x / CELL).floor() as i32, (st.z / CELL).floor() as i32)).or_insert(0) += 1;
        if i > 0 && st.how != "start" {
            let p = &stops[i - 1];
            ly += ((st.x - p.x).powi(2) + (st.y - p.y).powi(2) + (st.z - p.z).powi(2)).sqrt();
        }
        for a in &st.acts {
            let cr = a.cr.unwrap_or(0);
            match a.k.as_str() {
                "sell" => { s.cr += cr; if !a.what.is_empty() { *sell.entry(a.what.clone()).or_insert(0) += cr; } }
                "buy" => { if !a.what.is_empty() { *buy.entry(a.what.clone()).or_insert(0) += cr; } }
                "explore" | "voucher" | "mission" => s.cr += cr,
                "dock" => { if !a.st.is_empty() { *dock.entry(a.st.clone()).or_insert(0) += 1; } }
                _ => {}
            }
        }
    }
    s.ly = (ly * 10.0).round() / 10.0;
    s.sys = names.len();
    s.sell = top_cr(sell);
    s.buy = top_cr(buy);
    let mut d: Vec<(String, u32)> = dock.into_iter().collect();
    d.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    d.truncate(TOP);
    s.dock = d;
    let mut g: Vec<(i32, i32, u32)> = grid.into_iter().map(|((x, z), n)| (x, z, n)).collect();
    if g.len() > MAX_CELLS {
        g.sort_by(|a, b| b.2.cmp(&a.2).then((a.0, a.1).cmp(&(b.0, b.1))));
        g.truncate(MAX_CELLS);
    }
    g.sort_by_key(|c| (c.0, c.1));
    s.grid = g;
    s
}
