//! BGS Watch: what makes the reader doubt a page? An ignored diagnostic: runs the shipped reader on a folder of screenshots and counts, per rule, the rows it would flag.
//! cargo test --release bgs::tests7 -- --ignored --nocapture
use super::decode::decode_file;
use super::imgops::Img;
use super::reader::{read_screen, T_COST, T_MARGIN};

fn stats(dir: &str) {
    let Ok(rd) = std::fs::read_dir(dir) else { println!("{dir}: folder not found, skipped"); return };
    let t = super::tpl::bundled().expect("templates");
    let mut files: Vec<_> = rd.filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| p.extension().map_or(false, |x| x == "bmp" || x == "png")).collect();
    files.sort();
    let (mut n, mut nc, mut nm, mut ic, mut im, mut dis, mut conf, mut any_v, mut any_n, mut any) = (0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    let (mut snc, mut snm, mut sic, mut sim) = (0f32, 0f32, 0f32, 0f32);
    let mut ins: Vec<super::gates::PageIn> = Vec::new();
    for f in &files {
        let Ok(im_) = decode_file(f) else { println!("{}: cannot decode", f.display()); continue };
        let Some(pr) = read_screen(&Img::new(super::decode::Rgb { w: im_.w, h: im_.h, px: im_.px.clone() }), t) else { println!("{}: no list found", f.display()); continue };
        ins.push(super::gates::PageIn { file: f.file_name().unwrap().to_string_lossy().to_string(), taken: 1000 + ins.len() as i64 * 10, read: pr.clone() });
        let mut prev: Option<i32> = None; let mut breaks = 0;
        for r in &pr.rows { if let Some(v) = r.inf_x10 { if let Some(p) = prev { if v > p { breaks += 1; } } prev = Some(v); } }
        let gaps: Vec<String> = pr.rows.iter().filter(|r| r.inf_confusable).map(|r| format!("{:.1}@{:.2}", r.inf_x10.unwrap_or(0) as f32 / 10.0, r.inf_alike)).collect();
        println!("   {} order breaks {} | look-alike: {}", f.file_name().unwrap().to_string_lossy(), breaks, gaps.join(" "));
        for r in &pr.rows {
            if r.name_cost > T_COST && dir.contains("cyanidex") { println!("   BADNAME {} | read {:?} cost {:.2} margin {:.2} | value {} ", f.file_name().unwrap().to_string_lossy(), r.name, r.name_cost, r.name_margin, r.inf); }
            n += 1;
            let (a, b, c, d) = (r.name_cost > T_COST, r.name_margin < T_MARGIN, r.inf_cost > T_COST, r.inf_margin < T_MARGIN);
            nc += a as i32; nm += b as i32; ic += c as i32; im += d as i32; dis += (!r.inf_agree) as i32; conf += r.inf_confusable as i32;
            let v = c || d || !r.inf_agree || r.inf_confusable || r.inf_x10.is_none();
            let nn = a || b || r.name.is_empty();
            any_v += v as i32; any_n += nn as i32; any += (v || nn) as i32;
            snc += r.name_cost; snm += r.name_margin; sic += r.inf_cost; sim += r.inf_margin;
        }
    }
    if dir.contains("cyanidex") {
        let gt: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(super::train::root().join("research/bgs/cyanidex/gt_cyanidex.json")).unwrap()).unwrap();
        let names: Vec<String> = gt["rows"].as_array().unwrap().iter().map(|r| r["name"].as_str().unwrap().to_string()).collect();
        let p = super::gates::build(ins.iter().map(|x| super::gates::PageIn { file: x.file.clone(), taken: x.taken, read: x.read.clone() }).collect(), &super::gates::Ctx { known: &names, prev: None, jump_x10: 30 });
        let (mut ok, mut wrong, mut st) = (0, 0, std::collections::BTreeMap::new());
        for (c, g) in p.rows.iter().zip(&names) {
            *st.entry(c.state).or_insert(0) += 1;
            if &c.system == g { ok += 1 } else { wrong += 1; println!("   WRONGNAME read {:?} -> {:?} state {} (truth {:?})", c.read_name, c.system, c.state, g); }
        }
        println!("   REAL KNOWN LIST: names right {ok}, wrong {wrong}, states {st:?}");
    }
    let known: Vec<String> = ins.iter().flat_map(|p| p.read.rows.iter().map(|r| r.name.clone())).collect();
    let p = super::gates::build(ins, &super::gates::Ctx { known: &known, prev: None, jump_x10: 30 });
    let vu = p.rows.iter().filter(|c| c.inf_unsure).count();
    let cleared = p.rows.iter().filter(|c| c.reasons.contains(&"value_fits_order")).count();
    println!("   AFTER THE GATES (names taken as read): value doubts {vu} of {} (cleared by order {cleared}), issues {:?}", p.rows.len(), p.issues.iter().map(|i| i.code).collect::<Vec<_>>());
    let f = |x: f32| x / n.max(1) as f32;
    println!("{dir}: {} files, {n} rows | flagged any {any} ({:.0} %), by value {any_v}, by name {any_n}", files.len(), 100.0 * any as f32 / n.max(1) as f32);
    println!("   name: cost>{T_COST} {nc}, margin<{T_MARGIN} {nm} | value: cost>{T_COST} {ic}, margin<{T_MARGIN} {im}, second reading differs {dis}, look-alike {conf}");
    println!("   means: name cost {:.2} margin {:.2} | value cost {:.2} margin {:.2}", f(snc), f(snm), f(sic), f(sim));
}

#[test]
#[ignore]
fn why_the_reader_doubts_a_folder() {
    stats(&super::train::root().join(r"inbox\cyanidex").to_string_lossy());
    stats(&super::train::root().join(r"inbox\bgs\1080").to_string_lossy());
    stats(&super::train::root().join(r"inbox\bgs\1440").to_string_lossy());
    stats(&super::train::root().join(r"research\bgs\today").to_string_lossy());
}

/// Calibration experiment: templates WITHOUT the friend's pages (a screen the reader never saw). Page 1 is confirmed (ground truth) and learned,
/// pages 2..8 are read with and without that. cargo test --release bgs::tests7::calibrate -- --ignored --nocapture
#[test]
#[ignore]
fn calibrate_to_a_new_screen() {
    use super::{learn, tpl::FontKind, train::*};
    let Some((gt, a, b)) = super::tests::fixtures() else { println!("fixtures missing"); return };
    let (mut samples, _) = collect(&[("1440", &a), ("1080", &b)], &gt);
    samples.extend(collect_today());
    let base = build(&samples, None);
    let Some(t) = super::tests4::load_set("cyanidex", "gt_cyanidex.json") else { println!("no cyanidex"); return };
    let Some(imgs) = super::tests4::load_set_images("cyanidex", &t) else { return };
    let chars = |s: &str| -> Vec<char> { s.chars().filter(|c| !c.is_whitespace()).flat_map(|c| c.to_uppercase()).collect() };
    let names: Vec<String> = t.pages.iter().flat_map(|p| p.1.iter().map(|r| r.0.clone())).collect();
    let rd = |tp: &super::tpl::Templates, i: usize| read_screen(&Img::new(super::decode::Rgb { w: imgs[i].w, h: imgs[i].h, px: imgs[i].px.clone() }), tp).expect("layout");
    for confirmed in [0usize, 1, 2] {
        let mut learned = super::tpl::Templates::default();
        for i in 0..confirmed {
            let pr = rd(&base, i);
            for (r, (n, v)) in pr.rows.iter().zip(&t.pages[i].1) {
                learn::learn_cell_all(&mut learned, FontKind::Name, &chars(n), &r.name_glyphs);
                learn::learn_cell_all(&mut learned, FontKind::Inf, &v.chars().collect::<Vec<_>>(), &r.inf_glyphs);
            }
        }
        let tp = if confirmed == 0 { base.clone() } else { learn::merged(&base, &learned) };
        let (mut rows, mut flagged, mut wrong, mut wrong_sure, mut wv, mut wn) = (0, 0, 0, 0, 0, 0);
        let mut ins = Vec::new();
        let mut truth: Vec<(String, String)> = Vec::new();
        for i in confirmed..8 {
            let mut pr = rd(&tp, i); pr.page = Some(i as u32 + 1); pr.pages = Some(8);
            ins.push(super::gates::PageIn { file: format!("p{i}"), taken: 1000 + i as i64 * 10, read: pr });
            truth.extend(t.pages[i].1.iter().cloned());
        }
        let p = super::gates::build(ins, &super::gates::Ctx { known: &names, prev: None, jump_x10: 30 });
        for (c, (n, v)) in p.rows.iter().zip(&truth) {
            rows += 1; flagged += c.uncertain as i32;
            let bad_n = !super::snap::norm(&c.system).eq_ignore_ascii_case(&super::snap::norm(n)); let bad_v = c.inf != *v;
            if bad_n || bad_v { wrong += 1; wn += bad_n as i32; wv += bad_v as i32; if !c.uncertain { wrong_sure += 1; println!("      SURE BUT WRONG: {:?} -> {:?} truth {n} {v} read {}", c.read_name, c.system, c.inf); } }
        }
        let mut rc: std::collections::BTreeMap<String, i32> = std::collections::BTreeMap::new();
        for c in p.rows.iter().filter(|c| c.uncertain) { let mut k: Vec<&str> = c.reasons.iter().copied().filter(|r| *r != "value_fits_order").collect(); k.sort(); *rc.entry(format!("{} {:?}", c.state, k)).or_insert(0) += 1; }
        println!("   flag reasons: {rc:?}");
        println!("CONFIRMED PAGES {confirmed} (learned shapes {}): rows {rows} | flagged {flagged} ({:.0} %) | wrong {wrong} (names {wn}, values {wv}), wrong AND shown as sure {wrong_sure}", learned.count(), 100.0 * flagged as f32 / rows as f32);
    }
}

/// Out-of-sample features of every value: leave one page (all its sizes) out, 24 real pages, then which wrong values exist and what separates them from the right ones.
/// cargo test --release bgs::tests7::value_features -- --ignored --nocapture
#[test]
#[ignore]
fn value_features() {
    use super::train::*;
    let Some((gt, a, b)) = super::tests::fixtures() else { return };
    let today = super::tests4::load_today().unwrap();
    let timgs = super::tests4::load_today_images(&today).unwrap();
    let cy = super::tests4::load_set("cyanidex", "gt_cyanidex.json").unwrap();
    let cimgs = super::tests4::load_set_images("cyanidex", &cy).unwrap();
    let (mut samples, _) = collect(&[("1440", &a), ("1080", &b)], &gt);
    samples.extend(collect_today()); samples.extend(collect_cyanidex());
    // (correct, margin, cost, alike, agree)
    let mut v: Vec<(bool, f32, f32, f32, bool, &str)> = Vec::new();
    let mut nm: Vec<(bool, f32, f32)> = Vec::new();
    let mut rows_by_set: std::collections::BTreeMap<&str, Vec<(String, String)>> = Default::default();
    for p in 1..=24usize {
        let t = build(&samples, Some(p));
        let mut sets: Vec<(&super::decode::Rgb, &Vec<(String, String)>, &str)> = Vec::new();
        if p <= 8 { sets.push((&a[p - 1], &gt.pages[p - 1], "1440")); sets.push((&b[p - 1], &gt.pages[p - 1], "1080")); }
        else if p <= 16 { sets.push((&timgs[p - 9], &today.pages[p - 9].1, "today")); }
        else { sets.push((&cimgs[p - 17], &cy.pages[p - 17].1, "friend")); }
        for (im, truth, lab) in sets {
            let pr = read_screen(&Img::new(super::decode::Rgb { w: im.w, h: im.h, px: im.px.clone() }), &t).expect("layout");
            for (r, (n, inf)) in pr.rows.iter().zip(truth) {
                v.push((r.inf == *inf, r.inf_margin, r.inf_cost, r.inf_alike, r.inf_agree, lab));
                nm.push((r.name == *n, r.name_margin, r.name_cost));
                rows_by_set.entry(lab).or_default().push((r.name.clone(), n.clone()));
            }
        }
    }
    let wrong: Vec<_> = v.iter().filter(|x| !x.0).collect();
    println!("values {} wrong {}", v.len(), wrong.len());
    for w in &wrong { println!("   WRONG {} margin {:.3} cost {:.3} alike {:.3} agree {}", w.5, w.1, w.2, w.3, w.4); }
    let right: Vec<_> = v.iter().filter(|x| x.0).collect();
    for (tm, ta) in [(0.10f32, 0.12f32), (0.06, 0.08), (0.04, 0.06), (0.03, 0.04), (0.02, 0.03)] {
        let caught = wrong.iter().filter(|w| w.1 < tm || w.3 < ta || !w.4 || w.2 > 0.8).count();
        let fl = right.iter().filter(|w| w.1 < tm || w.3 < ta || !w.4 || w.2 > 0.8).count();
        let fl_f = right.iter().filter(|w| w.5 == "friend" && (w.1 < tm || w.3 < ta || !w.4 || w.2 > 0.8)).count();
        println!("margin<{tm} alike<{ta}: wrong caught {caught} of {}, right flagged {fl} of {} (friend {fl_f} of {})", wrong.len(), right.len(), right.iter().filter(|w| w.5 == "friend").count());
    }
    let nw: Vec<_> = nm.iter().filter(|x| !x.0).collect();
    println!("names {} wrong {}", nm.len(), nw.len());
    for w in &nw { println!("   WRONGNAME margin {:.3} cost {:.3}", w.1, w.2); }
    // with the known list: how good is the snapping, out of sample
    let (mut ex_ok, mut ex_bad, mut nr_ok, mut nr_bad, mut none, mut none_ok) = (0, 0, 0, 0, 0, 0);
    let mut near_d: std::collections::BTreeMap<usize, (i32, i32)> = Default::default();
    for (_, rows) in &rows_by_set {
        let known: Vec<String> = rows.iter().map(|r| r.1.clone()).collect();
        let read: Vec<String> = rows.iter().map(|r| r.0.clone()).collect();
        let hits = super::snap::snap_all(&read, &known);
        for (h, (rn, tn)) in hits.iter().zip(rows) {
            match *h {
                super::snap::Hit::Exact(k) => { if super::snap::norm(&known[k]) == super::snap::norm(tn) { ex_ok += 1 } else { ex_bad += 1; println!("   EXACT BUT WRONG {rn:?} -> {:?} truth {tn:?}", known[k]) } }
                super::snap::Hit::Near(k, d) => { let ok = super::snap::norm(&known[k]) == super::snap::norm(tn); if ok { nr_ok += 1 } else { nr_bad += 1; println!("   NEAR BUT WRONG {rn:?} -> {:?} truth {tn:?} d {d}", known[k]) } let e = near_d.entry(d).or_insert((0, 0)); if ok { e.0 += 1 } else { e.1 += 1 } }
                super::snap::Hit::None => { none += 1; none_ok += (rn == tn) as i32; }
            }
        }
    }
    println!("SNAPPING out of sample: exact right {ex_ok} wrong {ex_bad} | near right {nr_ok} wrong {nr_bad} by distance (right, wrong) {near_d:?} | no hit {none} (read was right {none_ok})");
}

/// Real 4K pages (inbox/4k, 3840x2160) read with the shipped templates, compared with the friend's list (the same squadron data).
#[test]
#[ignore]
fn real_4k_pages() {
    let t = super::tpl::bundled().unwrap();
    let cy = super::tests4::load_set("cyanidex", "gt_cyanidex.json").unwrap();
    let truth: Vec<(String, String)> = cy.pages.iter().flat_map(|p| p.1.iter().cloned()).collect();
    let names: Vec<String> = truth.iter().map(|r| r.0.clone()).collect();
    let mut files: Vec<_> = std::fs::read_dir(super::train::root().join(std::env::var("GV_DIR").unwrap_or("inbox/4k".into()))).unwrap().filter_map(|e| e.ok()).map(|e| e.path()).collect();
    files.sort();
    let mut ins = Vec::new();
    for (i, f) in files.iter().enumerate() {
        let im = super::decode::decode_file(f).unwrap();
        println!("{} {}x{}", f.file_name().unwrap().to_string_lossy(), im.w, im.h);
        let Some(mut pr) = read_screen(&Img::new(super::decode::Rgb { w: im.w, h: im.h, px: im.px.clone() }), t) else { println!("   no list found"); continue };
        let first = pr.rows.first().map(|r| r.inf.clone()).unwrap_or_default();
        println!("   rows {} first {} page {:?}", pr.rows.len(), first, pr.page);
        pr.page = pr.page.or(Some(i as u32 + 1));
        ins.push(super::gates::PageIn { file: format!("p{i}"), taken: 1000 + i as i64 * 10, read: pr });
    }
    let p = super::gates::build(ins, &super::gates::Ctx { known: &names, prev: None, jump_x10: 30 });
    let (mut wn, mut wv, mut flagged, mut wrong_sure) = (0, 0, 0, 0);
    for (c, (n, v)) in p.rows.iter().zip(&truth) {
        let bn = !super::snap::norm(&c.system).eq_ignore_ascii_case(&super::snap::norm(n)); let bv = c.inf != *v;
        wn += bn as i32; wv += bv as i32; flagged += c.uncertain as i32;
        if (bn || bv) && !c.uncertain { wrong_sure += 1; }
        if bn || bv { println!("   WRONG {:?} -> {:?} {} | truth {n} {v} | state {}", c.read_name, c.system, c.inf, c.state); }
    }
    let mut rc: std::collections::BTreeMap<String, i32> = Default::default();
    for c in p.rows.iter().filter(|c| c.uncertain) { *rc.entry(format!("{} {:?}", c.state, c.reasons)).or_insert(0) += 1; }
    println!("4K: rows {} wrong names {wn} wrong values {wv} flagged {flagged} wrong AND sure {wrong_sure} issues {:?}
   {rc:?}", p.rows.len(), p.issues.iter().map(|i| i.code).collect::<Vec<_>>());
}
