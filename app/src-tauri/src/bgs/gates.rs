//! BGS Watch, from the pages of ONE snapshot to the confirm table: page gates (10 rows per page, 7 on the last, page numbers 1..m, the systems count),
//! snapping to the known names, the sorted order of the values (soft), continuity with the previous snapshot, and the state of every cell.
//! Nothing here saves anything. A reading is never presented as a fact: a row the reader or a rule doubts is marked uncertain with its alternatives.
use super::model::{Cell, Issue, Proposal, Snapshot};
use super::reader::{PageRead, RowRead, T_COST, T_MARGIN};
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
    p.taken_utc = fmt_iso(first.taken);
    p.minutes_old = pages.iter().find(|x| x.taken == first.taken).and_then(|x| x.read.minutes).or_else(|| pages.iter().find_map(|x| x.read.minutes));
    let data = first.taken - p.minutes_old.unwrap_or(0) as i64 * 60;
    p.data_utc = fmt_iso(data);
    if p.minutes_old.is_none() { issues.push(issue("no_last_updated", "LAST UPDATED could not be read: the time of the screenshot is used", None, false)); }
    p.id = fmt_id(data);

    snap_names(&mut cells, ctx.known, &mut issues);
    order_gate(&mut cells, &mut issues);
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
    let inf_weak = r.inf_x10.is_none() || r.inf_cost > T_COST || r.inf_margin < T_MARGIN || !r.inf_agree || r.inf_confusable;
    if r.inf_x10.is_none() { reasons.push("value_shape"); }
    if r.name.is_empty() { reasons.push("no_name"); }
    if name_weak && !r.name.is_empty() { reasons.push("name_weak"); }
    if inf_weak && r.inf_x10.is_some() { reasons.push(if !r.inf_agree { "value_disagree" } else if r.inf_confusable && !(r.inf_cost > T_COST || r.inf_margin < T_MARGIN) { "value_confusable" } else { "value_weak" }); }
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

fn snap_names(cells: &mut [Cell], known: &[String], issues: &mut Vec<Issue>) {
    if known.is_empty() { return; }
    let read: Vec<String> = cells.iter().map(|c| c.read_name.clone()).collect();
    let hits = snap_all(&read, known);
    for (c, h) in cells.iter_mut().zip(&hits) {
        match *h {
            Hit::Exact(k) => { c.system = known[k].clone(); c.name_state = "exact"; c.name_conf = 1.0; c.reasons.retain(|r| *r != "name_weak"); }
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
    let dups = super::snap::duplicates(&hits);
    for k in dups { issues.push(issue("duplicate_name", format!("two rows are \"{}\"", known[k]), None, false)); }
    let exact_or_near = hits.iter().filter(|h| **h != Hit::None).count();
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
                if let Some(v) = c.inf_x10 { if (v - pv).abs() > ctx.jump_x10 { c.reasons.push("jump"); } }
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
    c.uncertain = matches!(c.state, "jump" | "order" | "unsure" | "snapped");
}

pub fn snapshot_of(p: &Proposal) -> Snapshot {
    Snapshot {
        v: 1, id: p.id.clone(), taken_utc: p.taken_utc.clone(), data_utc: p.data_utc.clone(), minutes_old: p.minutes_old, resolution: p.resolution.clone(),
        sources: p.files.clone(), pages: p.pages_total, complete: p.complete,
        rows: p.rows.iter().map(|c| super::model::StoredRow { system: c.system.clone(), inf_x10: c.inf_x10, star: c.star, conf: c.name_conf.min(c.inf_conf), confirmed: false, accepted_unchecked: false, flagged: false, pos: 0 }).collect(),
        reader: "bgs1".into(), imported: false, proposal_id: p.id.clone(),
    }
}
