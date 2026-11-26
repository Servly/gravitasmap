//! BGS Watch: Import CSV. Reads back the file the Export CSV button writes (snapshot_utc, system, influence_percent, change_vs_previous, confirmed),
//! for example the numbers a friend read from his own screenshots. Each distinct snapshot_utc becomes one snapshot placed at that time, so the charts
//! put it in the right place. Only those columns are used, nothing is sent anywhere. A first call (apply = false) only plans and reports,
//! nothing is saved until the player confirms (apply = true).
use super::model::{Snapshot, StoredRow};
use super::snapstore::Store;
use super::{names, snap, timeutil};
use serde_json::{json, Value};

/// one snapshot found in the file
pub struct Group {
    pub t: i64,
    pub rows: Vec<StoredRow>,
    /// names that are not in the known list (the list is empty = nothing is checked)
    pub not_in_list: Vec<String>,
    /// why it will not be added ("already_have"), empty = it will be added
    pub skip: &'static str,
}

pub struct Plan {
    pub groups: Vec<Group>,
    /// rows of the file that could not be used (bad name, bad time or a value out of range)
    pub bad_rows: usize,
}

fn val_x10(s: &str) -> Result<Option<i32>, ()> {
    let t = s.trim().trim_end_matches('%').trim().replace(',', ".");
    if t.is_empty() { return Ok(None); }
    let f: f64 = t.parse().map_err(|_| ())?;
    if !f.is_finite() || !(0.0..=100.0).contains(&f) { return Err(()); }
    Ok(Some((f * 10.0).round() as i32))
}

/// Reads the file and decides, per snapshot, whether it is new. `known` = the known system names (may be empty), `window_s` = a stored snapshot this close in time counts as the same one.
pub fn plan(text: &str, st: &Store, known: &[String], window_s: i64) -> Result<Plan, String> {
    if text.len() > 20_000_000 { return Err("the file is too big".into()); }
    let rows = names::csv_rows(text);
    let head = rows.first().ok_or("the file is empty")?;
    let col = |n: &str| head.iter().position(|h| h.trim().trim_start_matches('\u{feff}').eq_ignore_ascii_case(n));
    let (Some(ct), Some(cs), Some(ci)) = (col("snapshot_utc"), col("system"), col("influence_percent")) else {
        return Err("this is not a GRAVITAS BGS export: the columns snapshot_utc, system and influence_percent were not found".into());
    };
    let cc = col("confirmed");
    let by_name: std::collections::HashMap<String, &String> = known.iter().map(|n| (snap::norm(n), n)).collect();
    let mut groups: Vec<Group> = Vec::new();
    let mut bad = 0usize;
    for r in rows.iter().skip(1) {
        if r.iter().all(|c| c.trim().is_empty()) { continue; }
        let (Some(t), Some(name), Some(inf)) = (r.get(ct), r.get(cs), r.get(ci)) else { bad += 1; continue };
        let Some(t) = timeutil::parse_iso(t.trim()) else { bad += 1; continue };
        let name = name.split_whitespace().collect::<Vec<_>>().join(" ");
        let Ok(x10) = val_x10(inf) else { bad += 1; continue };
        if !names::valid(&name) { bad += 1; continue }
        let confirmed = cc.and_then(|c| r.get(c)).map_or(false, |v| v.trim().eq_ignore_ascii_case("yes"));
        let (spelled, listed) = match by_name.get(&snap::norm(&name)) { Some(k) => ((*k).clone(), true), None => (name.clone(), known.is_empty()) };
        let g = match groups.iter().position(|g| g.t == t) { Some(i) => i, None => { groups.push(Group { t, rows: Vec::new(), not_in_list: Vec::new(), skip: "" }); groups.len() - 1 } };
        let g = &mut groups[g];
        if g.rows.iter().any(|x| snap::norm(&x.system) == snap::norm(&spelled)) { bad += 1; continue; }
        if !listed { g.not_in_list.push(spelled.clone()); }
        g.rows.push(StoredRow { system: spelled, inf_x10: x10, star: false, conf: if confirmed { 1.0 } else { 0.5 }, confirmed, accepted_unchecked: !confirmed, ..Default::default() });
    }
    if groups.len() > 2000 { return Err("the file has more than 2000 snapshots".into()); }
    groups.sort_by_key(|g| g.t);
    let have: Vec<i64> = st.all().iter().filter_map(|s| timeutil::parse_iso(&s.data_utc)).collect();
    for g in groups.iter_mut() {
        if g.rows.len() > 500 { return Err("a snapshot in the file has more than 500 systems".into()); }
        if have.iter().any(|h| (h - g.t).abs() <= window_s) { g.skip = "already_have"; }
    }
    if groups.is_empty() { return Err("no usable rows were found in the file".into()); }
    Ok(Plan { groups, bad_rows: bad })
}

/// What the player is shown before anything is saved.
pub fn summary(p: &Plan) -> Value {
    let add = p.groups.iter().filter(|g| g.skip.is_empty()).count();
    json!({
        "snapshots": p.groups.len(), "to_add": add, "to_skip": p.groups.len() - add, "bad_rows": p.bad_rows,
        "groups": p.groups.iter().map(|g| json!({
            "data_utc": timeutil::fmt_iso(g.t), "rows": g.rows.len(), "action": if g.skip.is_empty() { "add" } else { "skip" }, "reason": g.skip,
            "unchecked_rows": g.rows.iter().filter(|r| r.accepted_unchecked).count(),
            "not_in_list": g.not_in_list.iter().take(12).collect::<Vec<_>>(), "not_in_list_count": g.not_in_list.len(),
        })).collect::<Vec<_>>(),
    })
}

/// Saves the new snapshots (the skipped ones are not touched). Returns the ids.
pub fn apply(p: &Plan, st: &Store, known_count: usize) -> Result<Vec<String>, String> {
    let mut ids = Vec::new();
    for g in p.groups.iter().filter(|g| g.skip.is_empty()) {
        super::snapstore::check_rows(&g.rows)?;
        let s = Snapshot {
            v: 1, id: timeutil::fmt_id(g.t), taken_utc: timeutil::fmt_iso(g.t), data_utc: timeutil::fmt_iso(g.t), minutes_old: None, resolution: String::new(),
            sources: Vec::new(), pages: None, complete: known_count == 0 || g.rows.len() >= known_count, rows: g.rows.clone(), reader: "csv".into(), imported: true, proposal_id: String::new(),
        };
        ids.push(st.save(s)?);
    }
    Ok(ids)
}
