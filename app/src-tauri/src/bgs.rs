//! BGS Watch (OFF by default): the player presses F10 on every page of the game's Squadron > Faction list, the game writes the screenshots, and on a click
//! GRAVITAS reads the newest N of them (read only), recognises system names and influence percentages, and keeps NUMBERS ONLY on this PC.
//! The pictures are processed in memory and never copied, kept or sent. Nothing runs in the background: every function here is called by a button.
//! Files: decode (BMP, PNG), imgops, layout, glyphs, tpl (templates), grammar, reader (one page), gates (one snapshot, checks), snap (known names),
//! shots (finding files, Journal times), snapstore (saved snapshots, CSV), names (known system names, CSV import), settings, model, timeutil.
//! The Tauri commands are thin wrappers in main.rs. Every function returns JSON with `ok`.
pub mod crops;
pub mod csvimport;
pub mod decode;
pub mod gates;
pub mod glyphs;
pub mod grammar;
pub mod imgops;
pub mod layout;
pub mod learn;
pub mod model;
pub mod names;
pub mod reader;
pub mod settings;
pub mod shots;
pub mod snap;
pub mod snapstore;
pub mod timeutil;
pub mod tpl;
#[cfg(test)]
mod train;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests2;
#[cfg(test)]
mod tests3;
#[cfg(test)]
pub mod tests4;
#[cfg(test)]
mod tests5;
#[cfg(test)]
mod tests6;

use model::{Proposal, Skipped, Snapshot};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

static SCANNING: AtomicBool = AtomicBool::new(false);
static LAST: Mutex<Option<Value>> = Mutex::new(None);
/// the proposals of the last scan (cells with their glyph shapes), in memory only: a commit looks up which rows were flagged and what was read
static PROPS: Mutex<Vec<(String, Vec<model::Cell>)>> = Mutex::new(Vec::new());

fn props_put(id: &str, cells: Vec<model::Cell>) {
    let mut g = PROPS.lock().unwrap_or_else(|e| e.into_inner());
    g.retain(|(i, _)| i != id);
    g.push((id.to_string(), cells));
    if g.len() > 8 { g.remove(0); }
}
fn props_get(id: &str) -> Option<Vec<model::Cell>> { PROPS.lock().unwrap_or_else(|e| e.into_inner()).iter().find(|(i, _)| i == id).map(|(_, c)| c.clone()) }

fn err(m: impl Into<String>) -> Value { json!({"ok": false, "error": m.into()}) }

fn store() -> Option<snapstore::Store> { snapstore::Store::open() }

fn names_dir() -> Option<std::path::PathBuf> { crate::store::dir() }

fn names_of(dir: &Option<std::path::PathBuf>) -> names::NamesFile { dir.as_ref().map(|d| names::load(d)).unwrap_or_default() }

/// the state for the page: settings, known names, saved snapshots (small summaries), the last scan's summary
pub fn get() -> Value {
    let s = settings::get();
    let nf = names_of(&names_dir());
    let st = store();
    let pics = shots::pictures_dir(&s.shots_dir);
    json!({
        "ok": true, "settings": s,
        "names": {"count": nf.names.len(), "source": nf.source, "updated_utc": nf.updated_utc},
        "snapshots": st.as_ref().map(|x| x.summaries()).unwrap_or_default(),
        "storage_ok": st.is_some(),
        "pictures_dir": pics.map(|p| p.to_string_lossy().into_owned()),
        "templates_ok": tpl::bundled().is_ok(),
        "scanning": SCANNING.load(Ordering::SeqCst),
        "last_scan": LAST.lock().unwrap_or_else(|e| e.into_inner()).clone(),
    })
}

pub fn settings_set(key: &str, v: &Value) -> Value {
    match settings::set(key, v) { Ok(s) => json!({"ok": true, "settings": s}), Err(e) => err(e) }
}

struct Guard;
impl Drop for Guard { fn drop(&mut self) { SCANNING.store(false, Ordering::SeqCst); } }

enum Outcome {
    Page(reader::PageRead, imgops::Img),
    Skip(String),
}

fn read_one(path: &std::path::Path, t: &tpl::Templates) -> Outcome {
    let run = || -> Outcome {
        match decode::decode_file(path) {
            Err(e) => Outcome::Skip(format!("could not read this screenshot: {e}")),
            Ok(rgb) => {
                let img = imgops::Img::new(rgb);
                match reader::read_screen(&img, t) {
                    Some(p) if !p.rows.is_empty() => Outcome::Page(p, img),
                    _ => Outcome::Skip("this is not the Squadron > Faction list".into()),
                }
            }
        }
    };
    // a bad file must never take the app down
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(run)).unwrap_or_else(|_| Outcome::Skip("could not read this screenshot: unexpected picture".into()))
}

/// Reads the newest N screenshots (one click, on a worker thread of the command). Returns one proposal per group of pages taken within the window.
pub fn scan() -> Value {
    let s = settings::get();
    if !s.on { return err("BGS Watch is off"); }
    if SCANNING.swap(true, Ordering::SeqCst) { return err("a scan is already running"); }
    let _g = Guard;
    let t0 = std::time::Instant::now();
    let Some(pics) = shots::pictures_dir(&s.shots_dir) else { return err("the screenshot folder was not found (Pictures\\Frontier Developments\\Elite Dangerous): set the folder in the BGS settings") };
    let base = match tpl::bundled() { Ok(t) => t, Err(e) => return err(e) };
    // the shapes learned from the player's corrections are merged in unless the player switched that off
    let merged;
    let learned_n;
    let tpl: &tpl::Templates = match names_dir().filter(|_| s.use_learned).map(|d| learn::load(&d)).filter(|l| l.count() > 0) {
        Some(l) => { learned_n = l.count(); merged = learn::merged(base, &l); &merged }
        None => { learned_n = 0; base }
    };
    let journal = crate::journal::saved_games();
    let found = shots::newest(&pics, journal.as_deref(), s.n as usize);
    if found.is_empty() { return err("no screenshots were found in the screenshot folder: press F10 on each page of the faction list in the game"); }
    // pages are read on up to 4 threads
    let mut results: Vec<Option<Outcome>> = (0..found.len()).map(|_| None).collect();
    std::thread::scope(|sc| {
        let chunk = found.len().div_ceil(4).max(1);
        for (fs, rs) in found.chunks(chunk).zip(results.chunks_mut(chunk)) {
            sc.spawn(move || { for (f, r) in fs.iter().zip(rs.iter_mut()) { *r = Some(read_one(&f.path, tpl)); } });
        }
    });
    let mut skipped: Vec<Skipped> = Vec::new();
    let mut pages: Vec<(gates::PageIn, i64)> = Vec::new();
    let mut imgs: std::collections::HashMap<String, imgops::Img> = Default::default();
    for (f, r) in found.iter().zip(results) {
        match r {
            Some(Outcome::Page(p, img)) => {
                imgs.insert(f.name.clone(), img);
                pages.push((gates::PageIn { file: f.name.clone(), taken: f.taken, read: p }, f.taken));
            }
            Some(Outcome::Skip(why)) => skipped.push(Skipped { file: f.name.clone(), why }),
            None => skipped.push(Skipped { file: f.name.clone(), why: "not read".into() }),
        }
    }
    // groups: pages whose times follow each other within the window
    pages.sort_by(|a, b| b.1.cmp(&a.1));
    let mut groups: Vec<Vec<gates::PageIn>> = Vec::new();
    let mut last_t = i64::MAX;
    for (p, t) in pages {
        if groups.is_empty() || last_t - t > s.window_min as i64 * 60 { groups.push(Vec::new()); }
        last_t = t;
        groups.last_mut().unwrap().push(p);
    }
    let nf = names_of(&names_dir());
    let st = store();
    let mut proposals: Vec<Proposal> = Vec::new();
    for g in groups.into_iter().take(4) {
        let first = g.iter().map(|p| p.taken).min().unwrap_or(0);
        let prev = st.as_ref().and_then(|x| x.previous(first));
        let ctx = gates::Ctx { known: &nf.names, prev: prev.as_ref(), jump_x10: (s.jump * 10.0).round() as i32 };
        let mut p = gates::build(g, &ctx);
        if let Some(x) = &st {
            let mine: std::collections::BTreeSet<&String> = p.files.iter().collect();
            p.already_saved = x.all().iter().any(|o| !o.sources.is_empty() && o.sources.iter().collect::<std::collections::BTreeSet<_>>() == mine);
        }
        proposals.push(p);
    }
    // a small crop of every doubted cell (at most 40 rows per scan), made in memory for this answer only
    let mut crops_left = 40usize;
    for p in proposals.iter_mut() {
        for c in p.rows.iter_mut().filter(|c| c.uncertain) {
            if crops_left == 0 { break; }
            let Some(img) = imgs.get(&c.file) else { continue };
            let name_flag = matches!(c.name_state, "unsure" | "not_in_list" | "snapped");
            let inf_flag = c.inf_unsure || c.reasons.contains(&"order") || c.reasons.contains(&"jump");
            if name_flag { c.crop_name = crops::crop_png(img, c.name_box, c.cap_h); }
            if inf_flag { c.crop_inf = crops::crop_png(img, c.inf_box, c.cap_h); }
            if c.crop_name.is_some() || c.crop_inf.is_some() { crops_left -= 1; }
        }
        props_put(&p.id, p.rows.clone());
    }
    drop(imgs);
    let ms = t0.elapsed().as_millis() as u64;
    let summary = json!({"ms": ms, "files": found.len(), "skipped": skipped.len(), "proposals": proposals.len(), "at": timeutil::fmt_iso(timeutil::now())});
    *LAST.lock().unwrap_or_else(|e| e.into_inner()) = Some(summary);
    json!({"ok": true, "ms": ms, "files": found.iter().map(|f| json!({"name": f.name, "taken_utc": timeutil::fmt_iso(f.taken), "from_journal": f.from_journal})).collect::<Vec<_>>(),
           "skipped": skipped, "proposals": proposals, "pictures_dir": pics.to_string_lossy(), "snapshot_window_min": s.window_min, "learned_shapes": learned_n})
}

/// Stores the snapshot the player confirmed (rows as edited in the confirm table). Numbers only.
/// A row that was uncertain in the scan and that the player did not confirm is "open": the snapshot is refused unless `accept_flagged` is true, and
/// then those rows are stored with accepted_unchecked = true. Rows the player corrected teach the reader their glyph shapes (see learn.rs).
pub fn commit(v: &Value, accept_flagged: bool) -> Value {
    let Some(st) = store() else { return err("the BGS folder is not available") };
    commit_to(&st, v, &names_dir(), accept_flagged)
}

pub fn commit_to(st: &snapstore::Store, v: &Value, names_dir: &Option<std::path::PathBuf>, accept_flagged: bool) -> Value {
    let mut v = v.clone();
    if !v.is_object() { return err("not a snapshot"); }
    v["id"] = json!("x");
    let mut s: Snapshot = match serde_json::from_value(v) { Ok(s) => s, Err(e) => return err(format!("the snapshot is not valid: {e}")) };
    let (Some(taken), Some(data)) = (timeutil::parse_iso(&s.taken_utc), timeutil::parse_iso(&s.data_utc)) else { return err("the snapshot times are not valid") };
    if let Err(e) = snapstore::check_rows(&s.rows) { return err(e); }
    let cells = props_get(&s.proposal_id).unwrap_or_default();
    // open rows: uncertain in the scan (or marked by the UI) and not looked at by the player
    let mut open: Vec<u32> = Vec::new();
    for r in s.rows.iter() {
        let cell = cells.iter().find(|c| r.pos > 0 && c.pos == r.pos);
        if (r.flagged || cell.map_or(false, |c| c.uncertain)) && !r.confirmed { open.push(r.pos); }
    }
    if !open.is_empty() && !accept_flagged {
        return json!({"ok": false, "error": "some rows are still marked uncertain: look at them, or accept them unchecked", "code": "flagged_rows", "open": open, "open_count": open.len()});
    }
    s.id = timeutil::fmt_id(data);
    s.taken_utc = timeutil::fmt_iso(taken);
    s.data_utc = timeutil::fmt_iso(data);
    s.v = 1;
    s.reader = "bgs1".into();
    // file names only
    s.sources = s.sources.iter().take(64).map(|f| f.rsplit(['\\', '/']).next().unwrap_or("").chars().take(128).collect::<String>()).filter(|f| !f.is_empty()).collect();
    s.resolution = s.resolution.chars().filter(|c| c.is_ascii_digit() || *c == 'x').take(12).collect();
    // learn from the corrections (only rows the player confirmed)
    let mut learned_add = 0;
    let mut learned_t = names_dir.as_ref().map(|d| learn::load(d));
    for r in s.rows.iter_mut() {
        r.system = r.system.split_whitespace().collect::<Vec<_>>().join(" ");
        r.conf = r.conf.clamp(0.0, 1.0);
        r.accepted_unchecked = open.contains(&r.pos) && !r.confirmed;
        let Some(cell) = cells.iter().find(|c| r.pos > 0 && c.pos == r.pos) else { continue };
        if !r.confirmed { continue; }
        let Some(lt) = learned_t.as_mut() else { continue };
        let chars = |t: &str| -> Vec<char> { t.chars().filter(|c| !c.is_whitespace()).flat_map(|c| c.to_uppercase()).collect() };
        learned_add += learn::learn_cell(lt, tpl::FontKind::Name, &chars(&cell.read_name), &chars(&r.system), &cell.name_glyphs);
        if let Some(x) = r.inf_x10 {
            let truth: Vec<char> = format!("{}.{}%", x / 10, x % 10).chars().collect();
            learned_add += learn::learn_cell(lt, tpl::FontKind::Inf, &cell.inf.chars().collect::<Vec<_>>(), &truth, &cell.inf_glyphs);
        }
    }
    let n = s.rows.len();
    let accepted = s.rows.iter().filter(|r| r.accepted_unchecked).count();
    let names_now: Vec<String> = s.rows.iter().map(|r| r.system.clone()).collect();
    match st.save(s) {
        Err(e) => err(e),
        Ok(id) => {
            if let (Some(d), Some(lt)) = (names_dir, &learned_t) { if learned_add > 0 { learn::save(d, lt); } }
            // the first confirmed snapshot makes the list of known names (a list loaded from a CSV or pasted is never changed by it)
            if let Some(d) = names_dir {
                let mut nf = names::load(d);
                if nf.names.is_empty() || nf.source == "snapshot" {
                    let mut all = nf.names.clone();
                    all.extend(names_now);
                    if let Ok((list, _)) = names::clean(&all) {
                        nf.names = list;
                        nf.source = "snapshot".into();
                        nf.v = 1;
                        nf.updated_utc = timeutil::fmt_iso(timeutil::now());
                        names::save(d, &nf);
                    }
                }
            }
            json!({"ok": true, "id": id, "rows": n, "accepted_unchecked": accepted, "learned_shapes": learned_add})
        }
    }
}

pub fn snapshots(n: usize) -> Value {
    let Some(st) = store() else { return err("the BGS folder is not available") };
    let all = st.all();
    let from = all.len().saturating_sub(n.clamp(1, 500));
    json!({"ok": true, "snapshots": all[from..].iter().rev().collect::<Vec<_>>()})
}

pub fn snapshot(id: &str) -> Value {
    match store().and_then(|s| s.get(id)) { Some(s) => json!({"ok": true, "snapshot": s}), None => err("snapshot not found") }
}

pub fn names_get() -> Value {
    let nf = names_of(&names_dir());
    json!({"ok": true, "names": nf.names, "source": nf.source, "updated_utc": nf.updated_utc})
}

/// the player's own list (typed or pasted, one name per line): replaces the known names
pub fn names_set(list: &[String]) -> Value {
    let Some(d) = names_dir() else { return err("the app's data folder is not available") };
    let (names, bad) = match names::clean(list) { Ok(x) => x, Err(e) => return err(e) };
    let nf = names::NamesFile { v: 1, source: "paste".into(), inara_id: String::new(), updated_utc: timeutil::fmt_iso(timeutil::now()), names };
    if !names::save(&d, &nf) { return err("the names could not be saved"); }
    json!({"ok": true, "count": nf.names.len(), "rejected": bad})
}

/// The CSV the player exported from Inara (EXPORT button) in their own browser and chose here: ONLY the "Star system" column is kept, it replaces the list.
pub fn names_import_csv(text: &str) -> Value {
    let Some(d) = names_dir() else { return err("the app's data folder is not available") };
    let (names, bad) = match names::names_from_csv(text) { Ok(x) => x, Err(e) => return err(e) };
    if names.is_empty() { return err("no system names were found in the \"Star system\" column"); }
    let old = names::load(&d).names;
    let up = |v: &[String]| v.iter().map(|n| snap::norm(n)).collect::<std::collections::HashSet<_>>();
    let (a, b) = (up(&old), up(&names));
    let (added, removed) = (b.difference(&a).count(), a.difference(&b).count());
    let nf = names::NamesFile { v: 1, source: "csv".into(), inara_id: String::new(), updated_utc: timeutil::fmt_iso(timeutil::now()), names };
    if !names::save(&d, &nf) { return err("the names could not be saved"); }
    json!({"ok": true, "count": nf.names.len(), "added": added, "removed": removed, "rejected": bad.len()})
}

pub fn export_csv() -> Value {
    match store() { Some(s) => json!({"ok": true, "csv": s.csv(), "filename": "gravitas-bgs.csv"}), None => err("the BGS folder is not available") }
}

/// Edit table: the player's corrections. v = {"edits": [{"id": "<snapshot id>", "data_utc": "<new time, optional>", "cells": [{"system": "...", "inf_x10": 687 | null}]}]}.
/// Everything is checked first and nothing is written unless every edit is valid. A typed cell is a confirmed correction (marked `edited`).
pub fn edit(v: &Value) -> Value {
    let Some(st) = store() else { return err("the BGS folder is not available") };
    edit_in(&st, v)
}

pub fn edit_in(st: &snapstore::Store, v: &Value) -> Value {
    let Some(list) = v.get("edits").and_then(Value::as_array) else { return err("no edits") };
    if list.is_empty() || list.len() > 500 { return err("1 to 500 snapshots can be edited at once"); }
    let mut plan: Vec<(String, Snapshot)> = Vec::new();
    for e in list {
        let Some(id) = e.get("id").and_then(Value::as_str) else { return err("an edit has no snapshot id") };
        let Some(mut s) = st.get(id) else { return err(format!("snapshot {id} was not found")) };
        if let Some(t) = e.get("data_utc").and_then(Value::as_str) {
            if timeutil::parse_iso(t).is_none() { return err("the snapshot time is not valid"); }
            s.data_utc = t.to_string();
        }
        for c in e.get("cells").and_then(Value::as_array).map(|a| a.as_slice()).unwrap_or(&[]) {
            let Some(name) = c.get("system").and_then(Value::as_str) else { return err("a cell has no system") };
            let name = name.split_whitespace().collect::<Vec<_>>().join(" ");
            let val = match c.get("inf_x10") { Some(Value::Null) | None => None, Some(x) => match x.as_i64() { Some(n) if (0..=1000).contains(&n) => Some(n as i32), _ => return err(format!("the value for {name} must be 0.0 to 100.0")) } };
            if let Some(r) = s.rows.iter_mut().find(|r| snap::norm(&r.system) == snap::norm(&name)) {
                if r.inf_x10 != val { r.inf_x10 = val; r.edited = true; r.confirmed = true; r.accepted_unchecked = false; r.conf = 1.0; }
            } else if val.is_some() {
                if !names::valid(&name) { return err(format!("\"{name}\" is not a valid system name")); }
                s.rows.push(model::StoredRow { system: name, inf_x10: val, confirmed: true, edited: true, conf: 1.0, ..Default::default() });
            }
        }
        if let Err(e) = snapstore::check_rows(&s.rows) { return err(e); }
        plan.push((id.to_string(), s));
    }
    let mut ids = Vec::new();
    for (old, s) in plan { match st.replace(&old, s) { Ok(n) => ids.push(n), Err(e) => return err(e) } }
    json!({"ok": true, "ids": ids})
}

/// Deletes one stored snapshot.
pub fn delete_snapshot(id: &str) -> Value {
    let Some(st) = store() else { return err("the BGS folder is not available") };
    match st.delete(id) { Ok(()) => json!({"ok": true}), Err(e) => err(e) }
}

/// Import CSV: the file the Export CSV button writes. apply = false only reports what would happen, apply = true saves the new snapshots.
pub fn import_csv(text: &str, apply: bool) -> Value {
    let Some(st) = store() else { return err("the BGS folder is not available") };
    let known = names_of(&names_dir()).names;
    let window_s = (settings::get().window_min.max(1) as i64) * 60;
    let plan = match csvimport::plan(text, &st, &known, window_s) { Ok(p) => p, Err(e) => return err(e) };
    let mut out = csvimport::summary(&plan);
    out["ok"] = json!(true);
    out["applied"] = json!(false);
    if apply {
        match csvimport::apply(&plan, &st, known.len()) {
            Ok(ids) => { out["applied"] = json!(true); out["ids"] = json!(ids); }
            Err(e) => return err(e),
        }
    }
    out
}

/// forgets every snapshot, the known names and the learned glyph shapes, with the .bad copies of its own files (the settings stay)
pub fn forget() -> Value {
    let n = store().map(|s| s.forget()).unwrap_or(0);
    if let Some(d) = names_dir() { names::forget(&d); learn::forget(&d); }
    *LAST.lock().unwrap_or_else(|e| e.into_inner()) = None;
    json!({"ok": true, "files_removed": n})
}
