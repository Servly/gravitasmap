//! BGS Watch, from the pages of ONE snapshot to the confirm table: page gates (10 rows per page, 7 on the last, page numbers 1..m, the systems count),
//! snapping to the known names, the sorted order of the values (soft), continuity with the previous snapshot, and the state of every cell.
//! Nothing here saves anything. A reading is never presented as a fact: a row the reader or a rule doubts is marked uncertain with its alternatives.
use super::model::{Cell, Issue, Proposal, Snapshot};
use super::reader::{PageRead, RowRead, T_COST, T_MARGIN, T_VAL_MARGIN};
use super::snap::{lev, norm, snap_all, Hit};
use super::timeutil::{fmt_id, fmt_iso};

pub struct PageIn {
    pub file: String,
    pub taken: i64,
    pub read: PageRead,
}

pub struct Ctx<'a> {
    pub known: &'a [String],
    pub prev: Option<&'a Snapshot>,
    /// a value that moves more than this (times ten) since the previous snapshot is marked
    pub jump_x10: i32,
}

fn mode<T: Copy + PartialEq>(v: &[T]) -> Option<T> {
    let mut best: Option<(usize, T)> = None;
    for &a in v {
        let n = v.iter().filter(|&&b| b == a).count();
        if best.map_or(true, |(bn, _)| n > bn) { best = Some((n, a)); }
    }
    best.map(|b| b.1)
}

/// a 0..1 score, not a probability
pub fn score(cost: f32, margin: f32) -> f32 { ((1.0 - cost).clamp(0.0, 1.0) * (margin / 0.5).clamp(0.0, 1.0) * 1000.0).round() / 1000.0 }

fn issue(code: &'static str, msg: impl Into<String>, page: Option<u32>, blocking: bool) -> Issue { Issue { code, msg: msg.into(), page, blocking } }

pub fn build(mut pages: Vec<PageIn>, ctx: &Ctx) -> Proposal {
    let mut p = Proposal::default();
    let mut issues: Vec<Issue> = Vec::new();
    if pages.is_empty() { p.issues.push(issue("no_pages", "no page of the faction list was read", None, true)); return p; }
    pages.sort_by(|a, b| a.taken.cmp(&b.taken).then(a.file.cmp(&b.file)));
    let total = mode(&pages.iter().filter_map(|x| x.read.pages).filter(|&m| (1..=20).contains(&m)).collect::<Vec<_>>());
    p.pages_total = total;
    p.systems_read = mode(&pages.iter().filter_map(|x| x.read.systems).collect::<Vec<_>>());
    p.resolution = format!("{}x{}", pages[0].read.width, pages[0].read.height);

    // The page number digits are sometimes confused (a 6 read as 8: one page seems taken twice and another missing). When there are exactly as many pages
    // as the list has and the numbers are not 1..m once each, the pages are put in order by their first influence value (the list is sorted from high to low).
    if let Some(m) = total {
        let nums: Vec<Option<u32>> = pages.iter().map(|x| x.read.page).collect();
        let mut seen: Vec<u32> = nums.iter().flatten().copied().collect();
        seen.sort_unstable(); seen.dedup();
        let clean = nums.iter().all(|n| n.is_some()) && seen.len() == pages.len() && seen.iter().all(|n| (1..=m).contains(n));
        let firsts: Vec<Option<i32>> = pages.iter().map(|x| x.read.rows.first().and_then(|r| r.inf_x10)).collect();
        if !clean && nums.iter().all(|n| n.is_some()) && pages.len() as u32 == m && firsts.iter().all(|f| f.is_some()) {   // (an unreadable number keeps its own rule below)
            let mut order: Vec<usize> = (0..pages.len()).collect();
            order.sort_by(|&a, &b| firsts[b].cmp(&firsts[a]).then(pages[a].taken.cmp(&pages[b].taken)));
            for (rank, &i) in order.iter().enumerate() { pages[i].read.page = Some(rank as u32 + 1); }
            issues.push(issue("page_numbers_fixed", "a page number was misread: the pages were put in order by their values", None, false));
        }
    }
    // page numbers: the read ones, a page without a readable number takes the lowest free number in the order the pages were taken
    let m = total.unwrap_or(pages.len() as u32);
    let mut slot: Vec<Option<usize>> = vec![None; m as usize + 1];
    let mut unnumbered: Vec<usize> = Vec::new();
    for (i, pg) in pages.iter().enumerate() {
        match pg.read.page.filter(|n| (1..=m).contains(n)) {
            Some(n) => {
                if let Some(old) = slot[n as usize] {
                    // the same page twice: the newer file wins (pages are sorted by time, so this one is newer)
                    issues.push(issue("duplicate_page", format!("page {n} was taken twice ({} and {}), the newer one is used", pages[old].file, pg.file), Some(n), false));
                }
                slot[n as usize] = Some(i);
            }
            None => unnumbered.push(i),
        }
    }
    for i in unnumbered {
        if let Some(n) = (1..=m as usize).find(|&n| slot[n].is_none()) {
            slot[n] = Some(i);
            issues.push(issue("page_number_unread", format!("the page number of {} could not be read, it is taken as page {n}", pages[i].file), Some(n as u32), false));
        }
    }
    let mut cells: Vec<Cell> = Vec::new();
    let mut used_files: Vec<String> = Vec::new();
    for n in 1..=m as usize {
        let Some(i) = slot[n] else {
            if total.is_some() { issues.push(issue("missing_page", format!("page {n} of {m} is missing"), Some(n as u32), true)); }
            continue;
        };
        p.pages_found.push(n as u32);
        used_files.push(pages[i].file.clone());
        let want = if n as u32 == m { p.systems_read.map(|s| s.saturating_sub(10 * (m - 1))) } else { Some(10) };
        let got = pages[i].read.rows.len() as u32;
        if let Some(w) = want {
            if got != w { issues.push(issue("row_count", format!("page {n} shows {got} rows, {w} were expected"), Some(n as u32), true)); }
        }
        for r in &pages[i].read.rows {
            cells.push(Cell { page: n as u32, pos: cells.len() as u32 + 1, file: pages[i].file.clone(), ..cell_from(r) });
        }
    }
    p.files = used_files;
    p.complete = total.is_some() && p.pages_found.len() as u32 == m;
    if let (Some(s), true) = (p.systems_read, p.complete) {
        if cells.len() as u32 != s { issues.push(issue("systems_count", format!("the page says {s} systems, {} rows were read", cells.len()), None, true)); }
    }
    // times
    let first = &pages[0];
    // the time of the snapshot IS the time the first screenshot was taken (Journal Screenshot event, else the file's write time). Never anything read from the picture.
    p.taken_utc = fmt_iso(first.taken);
    p.data_utc = p.taken_utc.clone();
    p.id = fmt_id(first.taken);

    snap_names(&mut cells, ctx.known, &mut issues);
    order_gate(&mut cells, &mut issues);
    order_clears_look_alikes(&mut cells);
    continuity(&mut cells, ctx, &mut issues, p.complete);
    for c in cells.iter_mut() { finish(c); }
    p.names_known = ctx.known.len();
    p.uncertain_rows = cells.iter().filter(|c| c.uncertain).count();
    p.can_save = !issues.iter().any(|i| i.blocking) && !cells.is_empty();
    p.rows = cells;
    p.issues = issues;
    p
}

fn cell_from(r: &RowRead) -> Cell {
    let mut reasons: Vec<&'static str> = Vec::new();
    let name_weak = r.name.is_empty() || r.name_cost > T_COST || r.name_margin < T_MARGIN;
    // a value is doubtful when the shape is wrong, the match is weak, the second reading disagrees, or the best two digits are close
    let inf_weak = r.inf_x10.is_none() || r.inf_cost > T_COST || r.inf_margin < T_VAL_MARGIN || !r.inf_agree || r.inf_confusable;
    if r.inf_x10.is_none() { reasons.push("value_shape"); }
    if r.name.is_empty() { reasons.push("no_name"); }
    if name_weak && !r.name.is_empty() { reasons.push("name_weak"); }
    if inf_weak && r.inf_x10.is_some() { reasons.push(if !r.inf_agree { "value_disagree" } else if r.inf_cost > T_COST { "value_weak" } else if r.inf_margin < T_VAL_MARGIN { "value_margin" } else { "value_confusable" }); }
    Cell {
        read_name: r.name.clone(), system: r.name.clone(),
        name_state: if name_weak { "unsure" } else { "ok" },
        name_conf: score(r.name_cost, r.name_margin), name_alts: r.name_alts.clone(),
        inf: r.inf.clone(), inf_x10: r.inf_x10, inf_conf: score(r.inf_cost, r.inf_margin), inf_alts: alts_with(&r.inf_b, !r.inf_agree, &r.inf_alts), inf_unsure: inf_weak,
        inf_second: (!r.inf_agree).then(|| r.inf_b.clone()),
        name_box: r.name_box, inf_box: r.inf_box, name_glyphs: r.name_glyphs.clone(), inf_glyphs: r.inf_glyphs.clone(), cap_h: r.cap_h,
        star: r.star, reasons, ..Default::default()
    }
}

/// the second reading comes first among the alternatives when it differs
fn alts_with(second: &str, differs: bool, alts: &[String]) -> Vec<String> {
    let mut v: Vec<String> = Vec::new();
    if differs && super::reader::parse_inf(second).is_some() { v.push(second.to_string()); }
    for a in alts { if !v.contains(a) { v.push(a.clone()); } }
    v
}

/// another known name that differs from this one by exactly one character, both being digits of the look-alike set
/// and that no row has taken: in a complete list a wrong digit would leave a known name without a row (or give one name to two rows), so a twin that already has its own row is no doubt
fn has_alike_twin(name: &str, known: &[String], taken: &[bool]) -> bool {
    let a: Vec<char> = norm(name).chars().collect();
    known.iter().enumerate().any(|(ki, o)| {
        if o == name || taken.get(ki).copied().unwrap_or(false) { return false; }
        let b: Vec<char> = norm(o).chars().collect();
        if a.len() != b.len() { return false; }
        let d: Vec<usize> = (0..a.len()).filter(|&i| a[i] != b[i]).collect();
        d.len() == 1 && "689035".contains(a[d[0]]) && "689035".contains(b[d[0]])
    })
}

fn snap_names(cells: &mut [Cell], known: &[String], issues: &mut Vec<Issue>) {
    if known.is_empty() { return; }
    let read: Vec<String> = cells.iter().map(|c| c.read_name.clone()).collect();
    let hits = snap_all(&read, known);
    let mut taken_k = vec![false; known.len()];
    for h in &hits { if let Hit::Exact(k) | Hit::Near(k, _) = h { taken_k[*k] = true; } }
    for (c, h) in cells.iter_mut().zip(&hits) {
        match *h {
            Hit::Exact(k) => {
                let raw = c.name_conf;
                c.system = known[k].clone(); c.name_state = "exact"; c.name_conf = 1.0; c.reasons.retain(|r| *r != "name_weak");
                // a known twin that differs by one look-alike digit (B23-5 / B23-6): an exact match is no proof when the reading was not clear
                if raw < 0.5 && has_alike_twin(&known[k], known, &taken_k) { c.name_state = "snapped"; c.reasons.push("name_twin"); }
            }
            Hit::Near(k, d) => {
                c.system = known[k].clone();
                c.name_state = "snapped";
                c.reasons.retain(|r| *r != "name_weak");
                c.reasons.push("snapped");
                c.name_alts.insert(0, c.read_name.clone());
                let _ = d;
            }
            Hit::None => {
                c.name_state = "not_in_list";
                c.reasons.retain(|r| *r != "name_weak");
                c.reasons.push("not_in_list");
                // the nearest known names as alternatives
                let rn = norm(&c.read_name);
                let mut ds: Vec<(usize, &String)> = known.iter().map(|k| (lev(&rn, &norm(k)), k)).collect();
                ds.sort();
                let mut alts: Vec<String> = ds.into_iter().take(3).filter(|(d, _)| *d <= 4).map(|(_, k)| k.clone()).collect();
                alts.append(&mut c.name_alts);
                c.name_alts = alts;
            }
        }
    }
    // By elimination: a complete list (as many rows as known systems) where exactly one row has no name and exactly one known system has no row.
    // The row can only be that system, however badly its name was read.
    let unmatched: Vec<usize> = hits.iter().enumerate().filter(|(_, h)| **h == Hit::None).map(|(i, _)| i).collect();
    let unclaimed: Vec<usize> = (0..known.len()).filter(|&k| !taken_k[k]).collect();
    let no_dups = super::snap::duplicates(&hits).is_empty();
    if cells.len() == known.len() && unmatched.len() == 1 && unclaimed.len() == 1 && no_dups {
        let (i, k) = (unmatched[0], unclaimed[0]);
        let c = &mut cells[i];
        c.name_alts.insert(0, c.read_name.clone());
        c.system = known[k].clone();
        c.name_state = "snapped";
        c.reasons.retain(|r| *r != "not_in_list" && *r != "name_weak");
        c.reasons.push("snapped");
        c.reasons.push("only_name_left");
    }
    let dups = super::snap::duplicates(&hits);
    for k in dups { issues.push(issue("duplicate_name", format!("two rows are \"{}\"", known[k]), None, false)); }
    let exact_or_near = hits.iter().filter(|h| **h != Hit::None).count() + cells.iter().filter(|c| c.reasons.contains(&"only_name_left")).count();
    if cells.len() != known.len() || exact_or_near != cells.len() {
        let missing = known.len().saturating_sub(exact_or_near);
        if missing > 0 && cells.len() >= known.len() / 2 { issues.push(issue("names_unmatched", format!("{missing} known systems did not appear in this list"), None, false)); }
    }
}

/// the real list is sorted by influence, highest first. A row above its predecessor is marked (it is a digit that was read wrong, or the list is sorted another way).
fn order_gate(cells: &mut [Cell], issues: &mut Vec<Issue>) {
    let vals: Vec<Option<i32>> = cells.iter().map(|c| c.inf_x10).collect();
    let breaks: Vec<usize> = (1..vals.len()).filter(|&i| matches!((vals[i - 1], vals[i]), (Some(a), Some(b)) if b > a)).collect();
    if breaks.is_empty() { return; }
    if breaks.len() * 4 > cells.len() {
        issues.push(issue("not_sorted", "the values are not sorted from high to low: the order check is off for this list", None, false));
        return;
    }
    for &i in &breaks {
        let (prev, next) = (vals[i - 1], vals.get(i + 1).copied().flatten());
        for k in [i - 1, i] {
            if !cells[k].reasons.contains(&"order") { cells[k].reasons.push("order"); }
        }
        // alternatives that fit between the neighbours come first
        for k in [i - 1, i] {
            let (lo, hi) = (if k == i { next } else { vals.get(k + 1).copied().flatten() }, if k == i { prev } else if k >= 1 { vals[k - 1] } else { None });
            let fits = |t: &str| super::reader::parse_inf(t).map_or(false, |v| lo.map_or(true, |l| v >= l) && hi.map_or(true, |h| v <= h));
            let mut alts = std::mem::take(&mut cells[k].inf_alts);
            alts.sort_by_key(|a| !fits(a));
            cells[k].inf_alts = alts;
        }
    }
}

/// A value that is doubtful only because two look-alike digits (6 8 9 0 3 5) were close is cleared when the list is in order around it and
/// no swap of one such digit would still fit between its two neighbours: the order of the list is a second, independent proof.
fn order_clears_look_alikes(cells: &mut [Cell]) {
    let vals: Vec<Option<i32>> = cells.iter().map(|c| c.inf_x10).collect();
    if vals.len() < 3 { return; }
    for i in 0..cells.len() {
        let c = &cells[i];
        let alike_only = c.reasons.contains(&"value_confusable");
        if !c.inf_unsure || !(alike_only || c.reasons.contains(&"value_margin")) || c.reasons.contains(&"value_weak") || c.reasons.contains(&"value_disagree") || c.reasons.contains(&"value_shape") || c.reasons.contains(&"order") { continue; }
        let Some(v) = vals[i] else { continue };
        let hi = if i > 0 { vals[i - 1] } else { None };
        let lo = vals.get(i + 1).copied().flatten();
        if hi.is_none() && lo.is_none() { continue; }
        if hi.map_or(false, |h| v > h) || lo.map_or(false, |l| v < l) { continue; }
        let digits: Vec<u8> = v.to_string().bytes().collect();
        let mut fits_other = false;
        for p in 0..digits.len() {
            let set: &[u8] = if alike_only { b"689035" } else { b"0123456789" };
            if !set.contains(&digits[p]) { continue; }
            for &d in set {
                if d == digits[p] { continue; }
                let mut t = digits.clone(); t[p] = d;
                let alt: i32 = String::from_utf8_lossy(&t).parse().unwrap_or(-1);
                if alt >= 0 && hi.map_or(true, |h| alt <= h) && lo.map_or(true, |l| alt >= l) { fits_other = true; }
            }
        }
        if !fits_other {
            let c = &mut cells[i];
            c.inf_unsure = false;
            c.reasons.retain(|r| *r != "value_confusable" && *r != "value_margin");
            c.reasons.push("value_fits_order");
        }
    }
}

fn continuity(cells: &mut [Cell], ctx: &Ctx, issues: &mut Vec<Issue>, complete: bool) {
    let Some(prev) = ctx.prev else { return };
    let map: std::collections::HashMap<String, Option<i32>> = prev.rows.iter().map(|r| (norm(&r.system), r.inf_x10)).collect();
    let mut seen = std::collections::HashSet::new();
    for c in cells.iter_mut() {
        let key = norm(&c.system);
        seen.insert(key.clone());
        match map.get(&key) {
            Some(Some(pv)) => {
                c.prev_x10 = Some(*pv);
                if let Some(v) = c.inf_x10 {
                    // The value hardly ever changes between two snapshots (96 % of the steps in real histories are zero). A reading the reader doubted whose
                    // runner-up is exactly the last value is much more likely that value: it is taken, and stays marked.
                    if v != *pv && c.inf_unsure && (v - pv).abs() <= ctx.jump_x10 && !c.reasons.contains(&"value_shape") {
                        let alt = c.inf_alts.iter().find(|a| super::reader::parse_inf(a) == Some(*pv)).cloned();
                        if let Some(a) = alt {
                            c.inf_alts.insert(0, c.inf.clone());
                            c.inf = a; c.inf_x10 = Some(*pv);
                            c.reasons.push("value_prior_prev");
                            continue;
                        }
                    }
                    if (v - pv).abs() > ctx.jump_x10 { c.reasons.push("jump"); }
                    else if v == *pv && c.inf_unsure && !c.reasons.contains(&"value_disagree") && !c.reasons.contains(&"value_shape") && matches!(c.name_state, "exact" | "ok" | "snapped") {
                        // two independent proofs agree: the reading and the same system's value in the last snapshot. A look-alike doubt or a low margin alone is cleared.
                        c.inf_unsure = false;
                        c.reasons.retain(|r| *r != "value_confusable" && *r != "value_weak" && *r != "value_margin");
                        c.reasons.push("value_matches_previous");
                    }
                }
            }
            Some(None) => {}
            None => { if c.name_state != "unsure" { c.reasons.push("new_system"); } }
        }
    }
    if complete {
        let gone: Vec<&String> = prev.rows.iter().map(|r| &r.system).filter(|s| !seen.contains(&norm(s))).collect();
        if !gone.is_empty() { issues.push(issue("systems_gone", format!("{} systems of the last snapshot are not in this list", gone.len()), None, false)); }
    }
}

fn finish(c: &mut Cell) {
    let name_unsure = matches!(c.name_state, "unsure" | "not_in_list");
    c.state = if c.reasons.contains(&"jump") { "jump" } else if c.reasons.contains(&"order") { "order" }
        else if name_unsure || c.inf_unsure { "unsure" } else if c.name_state == "snapped" { "snapped" } else { "sure" };
    c.uncertain = matches!(c.state, "jump" | "order" | "unsure") || (c.state == "snapped" && (c.reasons.contains(&"name_twin") || c.reasons.contains(&"only_name_left")));
}

pub fn snapshot_of(p: &Proposal) -> Snapshot {
    Snapshot {
        v: 1, id: p.id.clone(), taken_utc: p.taken_utc.clone(), data_utc: p.data_utc.clone(), legacy_minutes: None, resolution: p.resolution.clone(),
        sources: p.files.clone(), pages: p.pages_total, complete: p.complete,
        rows: p.rows.iter().map(|c| super::model::StoredRow { system: c.system.clone(), inf_x10: c.inf_x10, star: c.star, conf: c.name_conf.min(c.inf_conf), confirmed: false, accepted_unchecked: false, edited: false, flagged: false, pos: 0 }).collect(),
        reader: "bgs1".into(), imported: false, proposal_id: p.id.clone(),
    }
}

#[cfg(test)]
mod rules_0951 {
    use super::*;
    use super::super::model::StoredRow;

    fn cell(name: &str) -> Cell { Cell { read_name: name.into(), system: name.into(), name_state: "ok", ..Default::default() } }

    /// 0.9.51: a complete list where exactly one row has no name and exactly one known system has no row: the row is that system.
    #[test]
    fn the_only_name_left_goes_to_the_only_row_left() {
        let known: Vec<String> = ["ALPHA", "BRAVO", "CHARLIE"].iter().map(|s| s.to_string()).collect();
        let mut cells = vec![cell("ALPHA"), cell("-11-1T111 A"), cell("CHARLIE")];
        let mut issues = Vec::new();
        snap_names(&mut cells, &known, &mut issues);
        assert_eq!(cells[1].system, "BRAVO");
        assert_eq!(cells[1].name_state, "snapped");
        assert!(cells[1].reasons.contains(&"only_name_left"));
        assert!(!issues.iter().any(|i| i.code == "names_unmatched"), "the list is complete now");
    }

    /// two rows without a name and two known names left: no guess (it could be swapped)
    #[test]
    fn two_unknown_rows_are_not_guessed() {
        let known: Vec<String> = ["ALPHA", "BRAVO", "CHARLIE", "DELTA"].iter().map(|s| s.to_string()).collect();
        let mut cells = vec![cell("ALPHA"), cell("-11-1T111 A"), cell("%%%%%%"), cell("DELTA")];
        let mut issues = Vec::new();
        snap_names(&mut cells, &known, &mut issues);
        assert_eq!(cells[1].name_state, "not_in_list");
        assert_eq!(cells[2].name_state, "not_in_list");
    }

    /// a doubted reading whose runner-up equals the value of the last snapshot: the last value is taken, and the row stays marked
    #[test]
    fn a_doubted_value_whose_runner_up_is_the_last_value_becomes_that_value() {
        let prev = Snapshot { rows: vec![StoredRow { system: "Sys".into(), inf_x10: Some(645), ..Default::default() }], ..Default::default() };
        let ctx = Ctx { known: &[], prev: Some(&prev), jump_x10: 30 };
        let mut c = Cell { system: "Sys".into(), name_state: "ok", inf: "65.0%".into(), inf_x10: Some(650), inf_unsure: true, inf_alts: vec!["64.5%".into()], ..Default::default() };
        let mut issues = Vec::new();
        continuity(std::slice::from_mut(&mut c), &ctx, &mut issues, false);
        assert_eq!(c.inf_x10, Some(645));
        assert_eq!(c.inf, "64.5%");
        assert!(c.inf_unsure, "it is still a guess: the player is asked");
        assert!(c.reasons.contains(&"value_prior_prev"));
        assert_eq!(c.inf_alts[0], "65.0%", "the reading that was changed stays among the alternatives");
    }

    /// a SURE reading is never changed by the last value, however different
    #[test]
    fn a_sure_value_is_never_replaced_by_the_last_value() {
        let prev = Snapshot { rows: vec![StoredRow { system: "Sys".into(), inf_x10: Some(645), ..Default::default() }], ..Default::default() };
        let ctx = Ctx { known: &[], prev: Some(&prev), jump_x10: 30 };
        let mut c = Cell { system: "Sys".into(), name_state: "ok", inf: "65.0%".into(), inf_x10: Some(650), inf_unsure: false, inf_alts: vec!["64.5%".into()], ..Default::default() };
        let mut issues = Vec::new();
        continuity(std::slice::from_mut(&mut c), &ctx, &mut issues, false);
        assert_eq!(c.inf_x10, Some(650));
    }
}
