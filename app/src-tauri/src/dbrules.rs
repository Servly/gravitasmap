//! DEBRIEF: what the record can say about the fight in plain facts. Every line is a thing that happened together, with the times it came from.
//! No cause is ever named, no advice is ever given, nothing is said that a file does not show. Few rules, each narrow, each with a named limit:
//!   A. shields went down within SHIELD_AFTER_WAVE s after an attack wave began: when, how long after, how many UnderAttack events, Flight Assist state
//!   B. a heat warning, then whether the Heat Sink key was pressed in the next HEAT_SINK_WITHIN s (only when that key is followed completely)
//!   C. Flight Assist switched during an attack wave (from its start to WAVE_TAIL s after its last event)
//! At most MAX_LINES lines. If no rule fires, nothing is shown. No rule needs distance, aim, speed, heat or ammunition: no file has them.
use crate::debrief::Rec;

/// UnderAttack events more than this many seconds apart belong to different attack waves
pub const WAVE_GAP: f64 = 5.0;
pub const SHIELD_AFTER_WAVE: f64 = 10.0;
pub const HEAT_SINK_WITHIN: f64 = 10.0;
/// heat warnings closer than this belong to one overheating spell: only its first is looked at
pub const HEAT_SPELL: f64 = 10.0;
pub const WAVE_TAIL: f64 = 3.0;
pub const MAX_LINES: usize = 3;
/// the ship action of the Heat Sink key
const HEAT_SINK: &str = "DeployHeatSink";

#[derive(Clone, Debug, PartialEq)]
pub struct Wave {
    pub start: f64,
    pub end: f64,
    pub n: usize,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Obs {
    pub key: &'static str,
    pub args: Vec<(&'static str, String)>,
    /// the first moment it speaks of (for the order)
    pub t: f64,
    /// every time the line stands on
    pub ev: Vec<f64>,
}

pub fn waves(atk: &[f64]) -> Vec<Wave> {
    let mut out: Vec<Wave> = Vec::new();
    for &t in atk {
        match out.last_mut() {
            Some(w) if t - w.end <= WAVE_GAP => { w.end = t; w.n += 1; }
            _ => out.push(Wave { start: t, end: t, n: 1 }),
        }
    }
    out
}

fn at(series: &[(f64, bool)], t: f64) -> Option<bool> {
    series.iter().take_while(|e| e.0 <= t).last().map(|e| e.1)
}

pub fn mmss(t: f64) -> String {
    let n = t.max(0.0).round() as i64;
    format!("{}:{:02}", n / 60, n % 60)
}

fn rule_a(r: &Rec, w: &[Wave]) -> Vec<Obs> {
    let mut out = Vec::new();
    let mut prev: Option<bool> = None;
    for &(t, up) in &r.sh {
        let was = prev;
        prev = Some(up);
        if up || was != Some(true) { continue; } // (only a drop from a known "up")
        let Some(wv) = w.iter().rev().find(|x| x.start <= t) else { continue };
        let after = t - wv.start;
        if after > SHIELD_AFTER_WAVE { continue; }
        let Some(fa_off) = at(&r.fa, t) else { continue };
        out.push(Obs { key: "db.obs.shield", t: wv.start.min(t), ev: vec![wv.start, t],
            args: vec![("t", mmss(t)), ("s", format!("{:.0}", after)), ("w", mmss(wv.start)), ("n", wv.n.to_string()), ("fa", if fa_off { "off".into() } else { "on".into() })] });
    }
    out
}

/// Is the Heat Sink key one this record followed completely? (It is bound, every key of it is followed, none is on another device.)
fn heat_sink_followed(r: &Rec) -> Option<String> {
    if r.elsewhere.iter().any(|a| a == HEAT_SINK) || r.untracked.iter().any(|(_, a)| a.iter().any(|x| x == HEAT_SINK)) { return None; }
    let keys: Vec<&String> = r.followed.iter().filter(|(_, a)| a.iter().any(|x| x == HEAT_SINK)).map(|(k, _)| k).collect();
    if keys.is_empty() { None } else { Some(keys.iter().map(|k| crate::dbnames::key_label(k)).collect::<Vec<_>>().join(" / ")) }
}

fn rule_b(r: &Rec) -> Vec<Obs> {
    let Some(label) = heat_sink_followed(r) else { return vec![] };
    let mut out = Vec::new();
    let mut last: Option<f64> = None;
    for &tw in &r.warn {
        if last.is_some_and(|l| tw - l <= HEAT_SPELL) { last = Some(tw); continue; }
        last = Some(tw);
        // the whole look-ahead must lie inside the record and inside a stretch the keys were followed
        if tw + HEAT_SINK_WITHIN > r.len() || !r.covered(tw, tw + HEAT_SINK_WITHIN) { continue; }
        let press = r.keys.iter().filter(|p| p.acts.iter().any(|a| a == HEAT_SINK) && p.d >= tw && p.d <= tw + HEAT_SINK_WITHIN).map(|p| p.d).fold(f64::INFINITY, f64::min);
        if press.is_finite() {
            out.push(Obs { key: "db.obs.heat_sink", t: tw, ev: vec![tw, press], args: vec![("t", mmss(tw)), ("s", format!("{:.0}", press - tw)), ("k", label.clone())] });
        } else {
            out.push(Obs { key: "db.obs.heat_none", t: tw, ev: vec![tw], args: vec![("t", mmss(tw)), ("s", format!("{:.0}", HEAT_SINK_WITHIN)), ("k", label.clone())] });
        }
    }
    out
}

fn rule_c(r: &Rec, w: &[Wave]) -> Vec<Obs> {
    let mut out = Vec::new();
    for (i, &(t, off)) in r.fa.iter().enumerate() {
        if i == 0 { continue; } // (the state at the start is not a switch)
        if r.fa[i - 1].1 == off { continue; }
        let Some(wv) = w.iter().rev().find(|x| x.start <= t) else { continue };
        if t > wv.end + WAVE_TAIL { continue; }
        out.push(Obs { key: "db.obs.fa_wave", t: wv.start.min(t), ev: vec![wv.start, t],
            args: vec![("to", if off { "off".into() } else { "on".into() }), ("t", mmss(t)), ("s", format!("{:.0}", t - wv.start)), ("w", mmss(wv.start))] });
    }
    out
}

/// The lines for a record, in time order, at most MAX_LINES (A first, then B, then C when there are more).
pub fn observations(r: &Rec) -> Vec<Obs> {
    let w = waves(&r.atk);
    let mut all: Vec<Obs> = Vec::new();
    for batch in [rule_a(r, &w), rule_b(r), rule_c(r, &w)] {
        for o in batch { if all.len() < MAX_LINES { all.push(o); } }
    }
    all.sort_by(|a, b| a.t.partial_cmp(&b.t).unwrap_or(std::cmp::Ordering::Equal));
    all
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::debrief::Press;

    fn rec() -> Rec {
        Rec { t0: 1000.0, t1: 1200.0, kind: "fight".into(), fa: vec![(0.0, true)], sh: vec![(0.0, true)], ..Default::default() }
    }
    fn press(act: &str, d: f64) -> Press { Press { d, u: d + 0.1, key: "Key_DoubleQuote".into(), acts: vec![act.into()] } }

    #[test]
    fn attack_waves_are_events_more_than_five_seconds_apart() {
        let w = waves(&[10.0, 10.5, 15.5, 21.6, 22.0]);
        assert_eq!(w, vec![Wave { start: 10.0, end: 15.5, n: 3 }, Wave { start: 21.6, end: 22.0, n: 2 }]); // (15.5 to 21.6 is 6.1 s: a new wave)
        assert_eq!(waves(&[1.0, 6.0]).len(), 1); // (exactly 5 s: the same wave)
        assert!(waves(&[]).is_empty());
    }

    #[test]
    fn rule_a_needs_a_wave_before_the_drop_within_ten_seconds_and_a_known_fa_state() {
        let mut r = rec();
        r.atk = vec![100.0, 100.5, 101.0];
        r.sh.push((108.0, false)); // 8 s after the wave began
        let o = observations(&r);
        assert_eq!(o.len(), 1);
        assert_eq!(o[0].key, "db.obs.shield");
        assert!(o[0].args.contains(&("s", "8".into())) && o[0].args.contains(&("n", "3".into())) && o[0].args.contains(&("fa", "off".into())));
        assert_eq!(o[0].ev, vec![100.0, 108.0]);
        // exactly 10 s is still inside, 10.01 s is not (a boundary the fight fixtures never reach)
        let mut r2 = rec(); r2.atk = vec![100.0]; r2.sh.push((110.0, false));
        assert_eq!(observations(&r2).len(), 1);
        let mut r3 = rec(); r3.atk = vec![100.0]; r3.sh.push((110.01, false));
        assert!(observations(&r3).is_empty());
        // no wave before the drop: nothing is said
        let mut r4 = rec(); r4.sh.push((50.0, false));
        assert!(observations(&r4).is_empty());
        // a wave AFTER the drop does not count
        let mut r5 = rec(); r5.atk = vec![60.0]; r5.sh.push((50.0, false));
        assert!(observations(&r5).is_empty());
        // Flight Assist state unknown at that moment: nothing is said
        let mut r6 = rec(); r6.fa.clear(); r6.atk = vec![100.0]; r6.sh.push((105.0, false));
        assert!(observations(&r6).is_empty());
        // shields that were never known to be up: a drop is not claimed
        let mut r7 = rec(); r7.sh = vec![(0.0, false), (105.0, false)]; r7.atk = vec![100.0];
        assert!(observations(&r7).is_empty());
    }

    #[test]
    fn rule_b_speaks_only_when_the_heat_sink_key_is_followed_completely() {
        let mut r = rec();
        r.warn = vec![50.0, 52.0, 53.0]; // one overheating spell
        r.followed = vec![("Key_DoubleQuote".into(), vec![HEAT_SINK.into()])];
        r.cov = vec![(0.0, 200.0)];
        r.keys = vec![press(HEAT_SINK, 56.0)];
        let o = observations(&r);
        assert_eq!(o.len(), 1, "{o:?}");
        assert_eq!((o[0].key, o[0].args.contains(&("s", "6".into()))), ("db.obs.heat_sink", true));
        // not pressed within 10 s of the first warning
        r.keys = vec![press(HEAT_SINK, 60.5)];
        assert_eq!(observations(&r)[0].key, "db.obs.heat_none");
        r.keys = vec![press(HEAT_SINK, 60.0)]; // exactly 10 s: pressed
        assert_eq!(observations(&r)[0].key, "db.obs.heat_sink");
        // the key is also on a joystick, or one of its keys is not followed: nothing is said
        let mut e = r.clone(); e.elsewhere = vec![HEAT_SINK.into()];
        assert!(observations(&e).is_empty());
        let mut u = r.clone(); u.untracked = vec![("Key_V".into(), vec![HEAT_SINK.into()])];
        assert!(observations(&u).is_empty());
        // the keys were not followed over the whole 10 s (a panel was open in the middle): nothing is said
        let mut c = r.clone(); c.cov = vec![(0.0, 55.0), (58.0, 200.0)];
        assert!(observations(&c).is_empty());
        // the record ends before the 10 s are over
        let mut s = r.clone(); s.warn = vec![195.0]; s.keys = vec![];
        assert!(observations(&s).is_empty());
        // no Heat Sink key bound at all
        let mut n = r.clone(); n.followed.clear();
        assert!(observations(&n).is_empty());
    }

    #[test]
    fn rule_c_is_a_switch_during_a_wave_and_never_the_state_at_the_start() {
        let mut r = rec();
        r.atk = vec![100.0, 104.0, 108.0];
        r.fa = vec![(0.0, true), (110.0, false)]; // 2 s after the wave's last event: inside the tail
        let o = observations(&r);
        assert_eq!(o.len(), 1);
        assert_eq!(o[0].key, "db.obs.fa_wave");
        assert!(o[0].args.contains(&("to", "on".into())) && o[0].args.contains(&("s", "10".into())));
        r.fa = vec![(0.0, true), (111.1, false)]; // 3.1 s after: outside
        assert!(observations(&r).is_empty());
        r.fa = vec![(0.0, true), (100.0, true), (101.0, true)]; // no change of state: no switch
        assert!(observations(&r).is_empty());
        r.fa = vec![(105.0, true)]; // the first entry is a start, not a switch
        assert!(observations(&r).is_empty());
    }

    #[test]
    fn at_most_three_lines_in_time_order_and_nothing_when_no_rule_fires() {
        assert!(observations(&rec()).is_empty());
        let mut r = rec();
        r.atk = vec![20.0, 80.0, 140.0];
        r.sh = vec![(0.0, true), (24.0, false), (30.0, true), (84.0, false), (90.0, true), (144.0, false)];
        r.fa = vec![(0.0, true), (22.0, false)];
        let o = observations(&r);
        assert_eq!(o.len(), 3);
        assert!(o.windows(2).all(|p| p[0].t <= p[1].t));
        assert!(o.iter().all(|x| x.key == "db.obs.shield" || x.key == "db.obs.fa_wave"));
    }
}
