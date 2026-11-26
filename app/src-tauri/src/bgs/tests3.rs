//! BGS Watch tests, part 3: crops, learning from corrections, the flagged-rows rule of a commit, and edge values.
use super::decode::Rgb;
use super::glyphs::Glyph;
use super::grammar::{pick, recognise_glyphs_mode};
use super::model::*;
use super::reader::{parse_inf, T_COST, T_MARGIN};
use super::snapstore::Store;
use super::tpl::{bundled, FontKind};
use serde_json::json;

fn tmp(name: &str) -> std::path::PathBuf {
    let d = std::env::temp_dir().join(format!("gravitas-bgs-test3-{}-{name}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}

#[test]
fn base64_and_crops_make_a_small_png_data_url() {
    assert_eq!(super::crops::b64(b"Man"), "TWFu");
    assert_eq!(super::crops::b64(b"Ma"), "TWE=");
    assert_eq!(super::crops::b64(b"M"), "TQ==");
    let (w, h) = (300usize, 80usize);
    let px: Vec<u8> = (0..w * h * 3).map(|i| (i % 251) as u8).collect();
    let img = super::imgops::Img::new(Rgb { w, h, px });
    let u = super::crops::crop_png(&img, [20, 20, 280, 60], 14.0).unwrap();
    assert!(u.starts_with("data:image/png;base64,iVBORw0KGgo"), "a PNG");
    assert!(u.len() < 20_000, "small: {}", u.len());
    assert!(super::crops::crop_png(&img, [10, 10, 10, 20], 14.0).is_none(), "an empty box");
}

fn exemplar(font: &super::tpl::Font, ch: u8) -> (Vec<u8>, f32) {
    let i = font.ch.iter().position(|&c| c == ch).expect("exemplar");
    (font.canv[i * super::tpl::NPIX..(i + 1) * super::tpl::NPIX].to_vec(), font.w[i])
}

fn best(t: &super::tpl::Templates, c: &[u8], w: f32) -> char {
    let g = Glyph { canvas: c.to_vec(), wrel: w, bx: [0; 4] };
    pick(&t.name.costs(&g, 1.5), None).0
}

fn cell(pos: u32, read: &str, uncertain: bool, glyphs: Vec<(Vec<u8>, f32)>) -> Cell {
    Cell { pos, read_name: read.into(), system: read.into(), uncertain, name_glyphs: glyphs, inf: "66.9%".into(), ..Default::default() }
}

fn snap_json(pid: &str, rows: serde_json::Value) -> serde_json::Value {
    json!({"taken_utc": "2026-11-25T06:18:37Z", "data_utc": "2026-11-25T06:03:37Z", "resolution": "1920x1080", "sources": ["Screenshot_0001.bmp"], "pages": 1, "complete": true, "proposal_id": pid, "rows": rows})
}

#[test]
fn a_corrected_8_instead_of_b_changes_the_next_read() {
    let base = tmp("learn");
    let st = Store::at(base.join("bgs")).unwrap();
    let nd = Some(base.clone());
    let t = bundled().unwrap();
    let (cb, wb) = exemplar(&t.name, b'B');
    let (cx, wx) = exemplar(&t.name, b'X');
    assert_eq!(best(t, &cb, wb), 'B', "before");
    super::props_put("T-learn", vec![cell(1, "BX", true, vec![(cb.clone(), wb), (cx, wx)])]);
    let r = super::commit_to(&st, &snap_json("T-learn", json!([{"system": "8X", "inf_x10": 669, "pos": 1, "confirmed": true}])), &nd, false);
    assert_eq!(r["ok"], true, "{r}");
    assert_eq!(r["learned_shapes"], 1, "only the glyph that was wrong is learned");
    let learned = super::learn::load(&base);
    assert_eq!(learned.count(), 1);
    assert_eq!(learned.name.ch, vec![b'8']);
    // no picture, only a canvas of 36 x 40 values: the file is small
    assert!(std::fs::metadata(super::learn::path(&base)).unwrap().len() < 3000);
    let merged = super::learn::merged(t, &learned);
    assert_eq!(best(&merged, &cb, wb), '8', "after: the corrected shape wins");
    // the same shape corrected twice is stored once
    super::props_put("T-learn2", vec![cell(1, "BX", true, vec![(cb.clone(), wb), exemplar(&t.name, b'X')])]);
    let r2 = super::commit_to(&st, &snap_json("T-learn2", json!([{"system": "8X", "inf_x10": 668, "pos": 1, "confirmed": true}])), &nd, false);
    assert_eq!(r2["learned_shapes"], 0);
    // a row the player did not confirm teaches nothing
    super::props_put("T-learn3", vec![cell(1, "BX", false, vec![(cb.clone(), wb), exemplar(&t.name, b'X')])]);
    let r3 = super::commit_to(&st, &snap_json("T-learn3", json!([{"system": "8X", "inf_x10": 667, "pos": 1, "confirmed": false}])), &nd, true);
    assert_eq!(r3["learned_shapes"], 0);
    // Forget removes it, also the .bad copies
    std::fs::write(base.join("bgs_learned.bin.bad-1"), "x").unwrap();
    super::learn::forget(&base);
    assert_eq!(super::learn::load(&base).count(), 0);
    assert!(!base.join("bgs_learned.bin.bad-1").exists());
    let _ = std::fs::remove_dir_all(&base);
}

#[test]
fn a_damaged_learned_file_is_kept_aside_and_ignored() {
    let base = tmp("learnbad");
    std::fs::write(super::learn::path(&base), "junk").unwrap();
    assert_eq!(super::learn::load(&base).count(), 0);
    assert!(std::fs::read_dir(&base).unwrap().any(|e| e.unwrap().file_name().to_string_lossy().starts_with("bgs_learned.bin.bad-")));
    let _ = std::fs::remove_dir_all(&base);
}

#[test]
fn learned_shapes_are_capped() {
    let mut l = super::tpl::Templates::default();
    for i in 0..(super::learn::MAX_PER_FONT + 20) {
        let mut c = vec![0u8; super::tpl::NPIX];
        c[i % 1400] = 255;
        c[(i * 7) % 1400] = 200;
        c[(i * 13 + 5) % 1400] = 150;
        c[(i * 31 + 9) % 1400] = 100;
        super::learn::add(&mut l, FontKind::Inf, '8', 0.6, &c);
    }
    assert!(l.inf.ch.len() <= super::learn::MAX_PER_FONT);
}

#[test]
fn a_commit_with_open_flagged_rows_is_refused_unless_accepted() {
    let base = tmp("flagged");
    let st = Store::at(base.join("bgs")).unwrap();
    let nd = Some(base.clone());
    super::props_put("T-open", vec![cell(1, "GUNWIN", false, vec![]), cell(2, "SERRA", true, vec![]), cell(3, "HIP 88785", true, vec![])]);
    let rows = |c2: bool, c3: bool| json!([
        {"system": "GUNWIN", "inf_x10": 669, "pos": 1, "confirmed": false},
        {"system": "SERRA", "inf_x10": 666, "pos": 2, "confirmed": c2},
        {"system": "HIP 88785", "inf_x10": 656, "pos": 3, "confirmed": c3}]);
    let r = super::commit_to(&st, &snap_json("T-open", rows(false, true)), &nd, false);
    assert_eq!(r["ok"], false);
    assert_eq!(r["code"], "flagged_rows");
    assert_eq!(r["open"], json!([2]));
    assert!(st.all().is_empty(), "nothing was stored");
    // accepted unchecked: stored, and the row says so
    let r = super::commit_to(&st, &snap_json("T-open", rows(false, true)), &nd, true);
    assert_eq!(r["ok"], true, "{r}");
    assert_eq!(r["accepted_unchecked"], 1);
    let s = st.get(r["id"].as_str().unwrap()).unwrap();
    assert!(!s.rows[0].accepted_unchecked && s.rows[1].accepted_unchecked && !s.rows[2].accepted_unchecked);
    // every flagged row looked at: no flag needed
    let r = super::commit_to(&st, &snap_json("T-open", rows(true, true)), &nd, false);
    assert_eq!(r["ok"], true, "{r}");
    // rows the UI itself marks flagged count even without a cached proposal
    let r = super::commit_to(&st, &snap_json("none", json!([{"system": "ONE", "inf_x10": 1, "flagged": true, "confirmed": false}])), &nd, false);
    assert_eq!(r["code"], "flagged_rows");
    let _ = std::fs::remove_dir_all(&base);
}

/// Values at the edges (0.0 3.8 9.9 10.0 49.9 100.0) put together from REAL value glyphs of the held-out page, read with templates that never saw that page.
#[test]
fn edge_values_composed_from_real_glyphs_read_how_well() {
    let Some((gt, a)) = super::train::load_gt().zip(super::train::load_pages("1440")) else { eprintln!("SKIPPED: fixtures"); return };
    let b = super::train::load_pages("1080").unwrap();
    let (samples, _) = super::train::collect(&[("1440", &a), ("1080", &b)], &gt);
    let _ = &gt;
    let values = ["0.0%", "3.8%", "9.9%", "10.0%", "49.9%", "100.0%", "5.5%", "99.9%"];
    let mut table: Vec<(String, usize, usize, usize, usize, usize)> = values.iter().map(|v| (v.to_string(), 0, 0, 0, 0, 0)).collect();
    let mut skipped = 0;
    for p in 1..=8usize {
        let t = super::train::build(&samples, Some(p));
        let pool: Vec<&super::train::Sample> = samples.iter().filter(|s| s.font == FontKind::Inf && s.page == p).collect();
        for (vi, v) in values.iter().enumerate() {
            for k in 0..12usize {
                // a glyph this page does not have is not taken from another page (the templates have seen those): the combination is skipped
                let mut gl: Vec<Glyph> = Vec::new();
                for (i, c) in v.bytes().enumerate() {
                    let of: Vec<&&super::train::Sample> = pool.iter().filter(|s| s.ch == c).collect();
                    if of.is_empty() { break; }
                    let s = of[(k * 5 + i * 3 + vi) % of.len()];
                    gl.push(Glyph { canvas: s.canvas.clone(), wrel: s.w, bx: [0; 4] });
                }
                if gl.len() != v.len() { skipped += 1; continue; }
                let r1 = recognise_glyphs_mode(&gl, 1.0, &t.inf, FontKind::Inf, false, None, false);
                let r2 = recognise_glyphs_mode(&gl, 1.0, &t.inf, FontKind::Inf, false, None, true);
                let (t1, t2) = (r1.text(), r2.text());
                let row = &mut table[vi];
                row.1 += 1;
                row.2 += (t1 == *v) as usize;
                row.3 += (t2 == *v) as usize;
                let flagged = parse_inf(&t1).is_none() || r1.conf > T_COST || r1.margin < T_MARGIN || t1 != t2;
                if t1 != *v { row.4 += 1; if !flagged { row.5 += 1; } }
            }
        }
    }
    println!("edge values: {} combinations skipped (a digit missing on the held-out page)", skipped);
    let (mut wrong, mut missed) = (0, 0);
    for (v, n, ok1, ok2, w, m) in &table {
        println!("edge value {v}: first reading right {ok1}/{n}, second reading right {ok2}/{n}, wrong cells {w} of which not flagged {m}");
        wrong += w;
        missed += m;
    }
    println!("edge values: {} wrong of {} composed cells, {} not flagged", wrong, table.iter().map(|t| t.1).sum::<usize>(), missed);
}
