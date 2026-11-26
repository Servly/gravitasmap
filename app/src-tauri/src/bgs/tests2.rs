//! BGS Watch tests, part 2: decoder, hostile input, grammar, snapping, gates, storage, names, and the real screenshots end to end.
use super::decode::{decode_bmp, read_file, Rgb, MAX_BYTES};
use super::decode::decode as decode_pic;
use super::gates::*;
use super::grammar::*;
use super::model::*;
use super::reader::*;
use super::snap::*;
use super::snapstore::*;
use super::timeutil::*;
use super::tpl::{bundled, encode, Templates, NPIX};
use serde_json::json;

fn tmp(name: &str) -> std::path::PathBuf {
    let d = std::env::temp_dir().join(format!("gravitas-bgs-test-{}-{name}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}

fn bmp(w: usize, h: usize, bpp: usize, top_down: bool) -> Vec<u8> {
    let bytes_pp = bpp / 8;
    let stride = (w * bpp).div_ceil(32) * 4;
    let mut b = vec![0u8; 54 + stride * h];
    b[0] = b'B'; b[1] = b'M';
    b[2..6].copy_from_slice(&((54 + stride * h) as u32).to_le_bytes());
    b[10..14].copy_from_slice(&54u32.to_le_bytes());
    b[14..18].copy_from_slice(&40u32.to_le_bytes());
    b[18..22].copy_from_slice(&(w as i32).to_le_bytes());
    b[22..26].copy_from_slice(&(if top_down { -(h as i32) } else { h as i32 }).to_le_bytes());
    b[26..28].copy_from_slice(&1u16.to_le_bytes());
    b[28..30].copy_from_slice(&(bpp as u16).to_le_bytes());
    // pixel (x, y) from the top: B = x, G = y, R = 7
    for y in 0..h {
        let row = if top_down { y } else { h - 1 - y };
        for x in 0..w { let o = 54 + row * stride + x * bytes_pp; b[o] = x as u8; b[o + 1] = y as u8; b[o + 2] = 7; }
    }
    b
}

#[test]
fn bmp_24_and_32_bit_bottom_up_and_top_down_decode_to_the_same_picture() {
    for (bpp, td) in [(24, false), (24, true), (32, false), (32, true)] {
        let r = decode_bmp(&bmp(5, 3, bpp, td)).unwrap();
        assert_eq!((r.w, r.h), (5, 3));
        // pixel (x=4, y=2): R 7, G 2, B 4
        assert_eq!(&r.px[(2 * 5 + 4) * 3..(2 * 5 + 4) * 3 + 3], &[7, 2, 4], "{bpp} bit top_down {td}");
    }
}

#[test]
fn hostile_pictures_are_refused_never_a_panic() {
    let good = bmp(8, 8, 24, false);
    assert!(decode_pic(&good[..good.len() - 1]).is_err(), "cut off");
    assert!(decode_pic(&good[..30]).is_err(), "header cut off");
    assert!(decode_pic(b"").is_err());
    assert!(decode_pic(b"not a picture at all").is_err());
    assert!(decode_pic(&[0x89, 0x50, 0x4e, 0x47]).is_err(), "png stub");
    let mut huge = good.clone();
    huge[18..22].copy_from_slice(&100000i32.to_le_bytes());
    assert!(decode_pic(&huge).unwrap_err().contains("too large"));
    let mut neg = good.clone();
    neg[18..22].copy_from_slice(&(-5i32).to_le_bytes());
    assert!(decode_pic(&neg).is_err());
    let mut zero = good.clone();
    zero[22..26].copy_from_slice(&0i32.to_le_bytes());
    assert!(decode_pic(&zero).is_err());
    let mut min = good.clone();
    min[22..26].copy_from_slice(&i32::MIN.to_le_bytes());
    assert!(decode_pic(&min).is_err());
    let mut rle = good.clone();
    rle[30..34].copy_from_slice(&1u32.to_le_bytes());
    assert!(decode_pic(&rle).unwrap_err().contains("compressed"));
    let mut bpp8 = good.clone();
    bpp8[28..30].copy_from_slice(&8u16.to_le_bytes());
    assert!(decode_pic(&bpp8).is_err());
    let mut off = good.clone();
    off[10..14].copy_from_slice(&u32::MAX.to_le_bytes());
    assert!(decode_pic(&off).is_err(), "offset past the end");
    // 1 x 1 decodes but is not a faction list
    let one = decode_pic(&bmp(1, 1, 24, false)).unwrap();
    assert!(read_screen(&super::imgops::Img::new(one), &Templates::default()).is_none());
    // a png header that claims a huge picture
    let mut png = vec![0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, b'I', b'H', b'D', b'R'];
    png.extend_from_slice(&60000u32.to_be_bytes());
    png.extend_from_slice(&60000u32.to_be_bytes());
    png.extend_from_slice(&[8, 2, 0, 0, 0]);
    assert!(decode_pic(&png).unwrap_err().contains("too large"));
    // a plain picture with no list in it
    let flat = decode_pic(&bmp(1920, 1080, 24, false)).unwrap();
    assert!(read_screen(&super::imgops::Img::new(flat), &Templates::default()).is_none());
}

#[test]
fn a_file_over_the_size_cap_is_not_read() {
    let d = tmp("big");
    let f = d.join("Screenshot_0001.bmp");
    let h = std::fs::File::create(&f).unwrap();
    h.set_len(MAX_BYTES + 1).unwrap();
    assert!(read_file(&f).unwrap_err().contains("64 MB"));
    let _ = std::fs::remove_dir_all(&d);
}

#[test]
fn templates_round_trip_through_the_compact_file() {
    let mut t = Templates::default();
    let mut c = vec![0u8; NPIX];
    for (i, v) in c.iter_mut().enumerate() { if i % 7 == 0 { *v = (i % 250 + 1) as u8; } }
    t.name.push(b'A', 0.6, &c);
    t.inf.push(b'0', 0.55, &vec![0u8; NPIX]);
    t.page.push(b'/', 0.3, &vec![255u8; NPIX]);
    let b = encode(&t);
    let r = decode_tpl(&b);
    assert_eq!(r.name.canv, t.name.canv);
    assert_eq!(r.inf.canv, t.inf.canv);
    assert_eq!(r.page.canv, t.page.canv);
    assert!((r.name.w[0] - 0.6).abs() < 0.001);
    assert!(super::tpl::decode(&b[..b.len() - 3]).is_err());
    assert!(super::tpl::decode(b"junk").is_err());
}

fn decode_tpl(b: &[u8]) -> Templates { super::tpl::decode(b).unwrap() }

#[test]
fn the_bundled_templates_load_and_hold_every_digit_of_the_value_font() {
    let t = bundled().expect("bundled templates");
    for c in "0123456789.%".bytes() { assert!(t.inf.ch.contains(&c), "value font lacks {}", c as char); }
    for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-".bytes() { assert!(t.name.ch.contains(&c), "name font lacks {}", c as char); }
    for c in "12345678/".bytes() { assert!(t.page.ch.contains(&c), "page font lacks {}", c as char); }
}

// ---------------------------------------------------------------- grammar

fn costs(best: char, other: char, gap: f32) -> Costs { vec![(best, 0.1), (other, 0.1 + gap), ('Z', 3.0)] }

#[test]
fn the_value_grammar_forces_digits_dot_percent() {
    assert_eq!(decode_inf(4), vec![Some("0123456789"), Some("."), Some("0123456789"), Some("%")]);
    assert_eq!(decode_inf(6).len(), 6);
    assert!(decode_inf(3).iter().all(|x| x.is_none()));
    assert!(decode_inf(7).iter().all(|x| x.is_none()));
}

#[test]
fn the_name_grammar_settles_letter_o_and_digit_zero_by_company() {
    // "BB-E": the first glyph reads as 8 a little better than B, but a letter word wants letters
    let w = vec![vec![('8', 0.10), ('B', 0.12)], vec![('B', 0.1)], costs('-', 'Z', 1.0), vec![('E', 0.1), ('F', 0.3)]];
    let s = decode_word(&w);
    assert_eq!(pick(&w[0], None).0, '8', "free reading");
    assert_eq!(pick(&w[0], s[0]).0, 'B', "with the grammar");
    // "B6-1": digits after a letter are digits
    let w2 = vec![vec![('B', 0.1), ('8', 0.12)], vec![('6', 0.1)], costs('-', 'Z', 1.0), vec![('1', 0.1), ('I', 0.14)]];
    let s2 = decode_word(&w2);
    assert_eq!(pick(&w2[0], s2[0]).0, 'B');
    assert_eq!(pick(&w2[3], s2[3]).0, '1');
    // a word that fits no grammar keeps the free reading (all None)
    let w3 = vec![costs('-', 'Z', 1.0), costs('-', 'Z', 1.0)];
    assert!(decode_word(&w3).iter().all(|x| x.is_none()));
}

#[test]
fn alternatives_list_the_closest_other_characters() {
    let r = Recog {
        chars: vec!['6', '6', '.', '9', '%'], space_before: vec![false; 5], conf: 0.2, margin: 0.02,
        glyphs: vec![
            GInfo { ch: '6', cost: 0.1, margin: 0.6, alt: Some(('8', 0.7)) }, GInfo { ch: '6', cost: 0.1, margin: 0.02, alt: Some(('8', 0.12)) },
            GInfo { ch: '.', cost: 0.0, margin: 9.0, alt: None }, GInfo { ch: '9', cost: 0.1, margin: 0.3, alt: Some(('8', 0.4)) }, GInfo { ch: '%', cost: 0.0, margin: 9.0, alt: None },
        ],
    };
    let a = r.alternatives(2);
    assert_eq!(a, vec!["68.9%".to_string(), "66.9%".replace("66.9", "66.8")]);
}

#[test]
fn parse_inf_takes_only_the_exact_shape() {
    assert_eq!(parse_inf("66.9%"), Some(669));
    assert_eq!(parse_inf("3.8%"), Some(38));
    assert_eq!(parse_inf("100.0%"), Some(1000));
    for bad in ["66.9", "66%", "6.69%", "66,9%", "abc", "", "1000.0%", "66.9 %", ".9%", "66.%"] { assert_eq!(parse_inf(bad), None, "{bad}"); }
}

// ---------------------------------------------------------------- snapping

fn v(a: &[&str]) -> Vec<String> { a.iter().map(|s| s.to_string()).collect() }

#[test]
fn snapping_exact_near_ambiguous() {
    let known = v(&["GUNWIN", "SERRA", "HIP 95718", "HIP 88785", "COL 285 SECTOR VR-E B27-1"]);
    let read = v(&["GUNWIN", "SERRA", "HIP 9571B", "HIP 88785", "C0L 285 SECTOR VR-E B27-1"]);
    let h = snap_all(&read, &known);
    assert_eq!(h[0], Hit::Exact(0));
    assert_eq!(h[2], Hit::Near(2, 1), "one wrong digit snaps");
    assert_eq!(h[3], Hit::Exact(3));
    assert_eq!(h[4], Hit::Near(4, 1));
    // lower case in the list, upper case read
    assert_eq!(snap_all(&v(&["HIP 88785"]), &v(&["Hip 88785"]))[0], Hit::Exact(0));
    // a name far from everything stays unmatched
    assert_eq!(snap_all(&v(&["WHATEVER"]), &known)[0], Hit::None);
    // two known names equally near: not taken
    assert_eq!(snap_all(&v(&["HIP 88780"]), &v(&["HIP 88785", "HIP 88786"]))[0], Hit::None);
    // two rows want the same name: neither is taken
    let h2 = snap_all(&v(&["HIP 8878B", "HIP 8878C"]), &v(&["HIP 88785", "OTHER SYSTEM"]));
    assert_eq!(h2, vec![Hit::None, Hit::None]);
    assert!(duplicates(&h).is_empty());
    // distance two is only used for a known name no other row took
    assert_eq!(snap_all(&v(&["HIP 9BB18"]), &v(&["HIP 95718", "HIP 11111"]))[0], Hit::Near(0, 2));
}

// ---------------------------------------------------------------- gates

fn row(name: &str, x10: i32) -> RowRead {
    RowRead { name: name.into(), name_cost: 0.1, name_margin: 0.5, inf: format!("{}.{}%", x10 / 10, x10 % 10), inf_cost: 0.1, inf_margin: 0.5, inf_x10: Some(x10), inf_agree: true, inf_confusable: false, ..Default::default() }
}

fn page(n: u32, m: u32, systems: u32, rows: Vec<RowRead>, taken: i64) -> PageIn {
    PageIn { file: format!("Screenshot_{n:04}.bmp"), taken, read: PageRead { page: Some(n), pages: Some(m), systems: Some(systems), minutes: Some(5), rows, width: 1920, height: 1080 } }
}

fn list(n: usize, start: i32) -> Vec<RowRead> { (0..n).map(|i| row(&format!("SYS {i:03}"), start - i as i32)).collect() }

fn ctx<'a>(known: &'a [String], prev: Option<&'a Snapshot>) -> Ctx<'a> { Ctx { known, prev, jump_x10: 30 } }

#[test]
fn a_complete_list_passes_the_gates() {
    let rows = list(23, 700);
    let pages = vec![page(1, 3, 23, rows[..10].to_vec(), 1000), page(2, 3, 23, rows[10..20].to_vec(), 1010), page(3, 3, 23, rows[20..].to_vec(), 1020)];
    let p = build(pages, &ctx(&[], None));
    assert!(p.complete && p.can_save, "{:?}", p.issues.iter().map(|i| i.code).collect::<Vec<_>>());
    assert_eq!(p.rows.len(), 23);
    assert_eq!(p.pages_found, vec![1, 2, 3]);
    assert_eq!(p.rows[0].pos, 1);
    assert_eq!(p.rows[22].page, 3);
    assert_eq!(p.minutes_old, Some(5));
    assert_eq!(parse_iso(&p.data_utc).unwrap(), 1000 - 300, "data time = first page time minus LAST UPDATED");
    assert!(p.rows.iter().all(|c| c.state == "sure"));
}

#[test]
fn a_missing_page_a_wrong_row_count_and_a_repeated_page_are_found() {
    let rows = list(23, 700);
    let miss = build(vec![page(1, 3, 23, rows[..10].to_vec(), 1000), page(3, 3, 23, rows[20..].to_vec(), 1020)], &ctx(&[], None));
    assert!(!miss.complete && !miss.can_save);
    assert!(miss.issues.iter().any(|i| i.code == "missing_page" && i.page == Some(2) && i.blocking));
    let short = build(vec![page(1, 3, 23, rows[..9].to_vec(), 1000), page(2, 3, 23, rows[10..20].to_vec(), 1010), page(3, 3, 23, rows[20..].to_vec(), 1020)], &ctx(&[], None));
    assert!(short.issues.iter().any(|i| i.code == "row_count" && i.page == Some(1)));
    assert!(!short.can_save);
    let dup = build(vec![page(1, 3, 23, rows[..10].to_vec(), 1000), page(1, 3, 23, rows[..10].to_vec(), 1005), page(2, 3, 23, rows[10..20].to_vec(), 1010), page(3, 3, 23, rows[20..].to_vec(), 1020)], &ctx(&[], None));
    assert!(dup.issues.iter().any(|i| i.code == "duplicate_page") && dup.can_save);
    // the last page must hold systems - 10 x (pages - 1) rows
    let wrong_total = build(vec![page(1, 2, 18, rows[..10].to_vec(), 1000), page(2, 2, 18, rows[10..20].to_vec(), 1010)], &ctx(&[], None));
    assert!(wrong_total.issues.iter().any(|i| i.code == "row_count" && i.page == Some(2)));
}

#[test]
fn an_unreadable_page_number_takes_the_next_free_page_and_says_so() {
    let rows = list(15, 700);
    let mut p2 = page(2, 2, 15, rows[10..].to_vec(), 1010);
    p2.read.page = None;
    let p = build(vec![page(1, 2, 15, rows[..10].to_vec(), 1000), p2], &ctx(&[], None));
    assert!(p.complete && p.can_save);
    assert!(p.issues.iter().any(|i| i.code == "page_number_unread"));
}

#[test]
fn the_sorted_order_marks_the_rows_around_a_wrong_digit() {
    let mut rows = list(20, 700);
    rows[7] = row("SYS 007", 760); // a 6 read as 7: higher than the row above it
    rows[7].inf_alts = vec!["68.0%".into(), "69.3%".into(), "69.2%".into()];
    let pages = vec![page(1, 2, 20, rows[..10].to_vec(), 1000), page(2, 2, 20, rows[10..].to_vec(), 1010)];
    let p = build(pages, &ctx(&[], None));
    assert_eq!(p.rows[7].state, "order");
    assert_eq!(p.rows[6].state, "order", "the neighbour above is marked too");
    assert_eq!(p.rows[5].state, "sure");
    assert!(p.rows[7].uncertain);
    // the alternative that fits between the neighbours (700-6=694 above, 700-8=692 below) is offered first: none of these fit, order is kept
    assert_eq!(p.rows[7].inf_alts.len(), 3);
    // a list that is not sorted at all switches the order check off
    let mut mixed = list(20, 700);
    for (i, r) in mixed.iter_mut().enumerate() { *r = row(&format!("SYS {i:03}"), if i % 2 == 0 { 300 } else { 600 }); }
    let pm = build(vec![page(1, 2, 20, mixed[..10].to_vec(), 1000), page(2, 2, 20, mixed[10..].to_vec(), 1010)], &ctx(&[], None));
    assert!(pm.issues.iter().any(|i| i.code == "not_sorted"));
    assert!(pm.rows.iter().all(|c| c.state == "sure"));
}

fn prev_snapshot(rows: &[(&str, i32)]) -> Snapshot {
    Snapshot { v: 1, id: "p".into(), taken_utc: fmt_iso(500), data_utc: fmt_iso(500), minutes_old: None, resolution: String::new(), sources: vec![], pages: None, complete: true,
        rows: rows.iter().map(|(n, v)| StoredRow { system: n.to_string(), inf_x10: Some(*v), star: false, conf: 1.0, confirmed: true, ..Default::default() }).collect(), reader: String::new(), ..Default::default() }
}

#[test]
fn a_value_that_jumps_since_the_last_snapshot_is_marked_never_changed() {
    let rows = list(10, 700);
    let prev = prev_snapshot(&[("SYS 000", 700), ("SYS 001", 650), ("SYS 002", 698), ("SYS 003", 600)]);
    let p = build(vec![page(1, 1, 10, rows.clone(), 1000)], &ctx(&[], Some(&prev)));
    assert_eq!(p.rows[0].state, "sure");
    assert_eq!(p.rows[1].state, "jump", "699 now, 650 before: 4.9 points");
    assert_eq!(p.rows[1].prev_x10, Some(650));
    assert_eq!(p.rows[1].inf_x10, Some(699), "the value itself is never changed");
    assert_eq!(p.rows[2].state, "sure", "2 tenths is not a jump");
    assert_eq!(p.rows[3].state, "jump");
    assert!(p.rows[5].reasons.contains(&"new_system"), "a system the last snapshot did not have");
    assert_eq!(p.rows[5].state, "sure", "a new system alone is information, not doubt");
    assert!(p.issues.iter().any(|i| i.code == "systems_gone") == false);
}

#[test]
fn known_names_make_exact_rows_sure_and_snap_the_rest() {
    let mut rows = list(10, 700);
    rows[2].name = "SYS 0O2".into(); // a misread
    rows[2].name_cost = 0.5;
    rows[2].name_margin = 0.01;
    rows[3].name = "UNKNOWN PLACE".into();
    let known: Vec<String> = (0..10).map(|i| format!("Sys {i:03}")).collect();
    let p = build(vec![page(1, 1, 10, rows, 1000)], &ctx(&known, None));
    assert_eq!(p.rows[0].name_state, "exact");
    assert_eq!(p.rows[0].system, "Sys 000", "the list's spelling is saved");
    assert_eq!(p.rows[2].name_state, "snapped");
    assert_eq!(p.rows[2].system, "Sys 002");
    assert_eq!(p.rows[2].state, "snapped");
    assert!(!p.rows[2].uncertain, "snapped to the one known name: 16 of 16 were right out of sample, so it is shown as sure but marked as snapped");
    assert!(p.rows[2].name_alts.contains(&"SYS 0O2".to_string()), "what was read stays visible");
    // 'UNKNOWN PLACE' is far from SYS 003, but SYS 003 is the only known name left: still not taken at distance 2
    assert_eq!(p.rows[3].name_state, "not_in_list");
    assert!(p.rows[3].uncertain);
}

#[test]
fn weak_readings_are_flagged_and_strong_ones_are_not() {
    let mut rows = list(10, 700);
    rows[4].inf_margin = 0.02; // 6 or 8?
    rows[5].name_cost = 0.95;
    let p = build(vec![page(1, 1, 10, rows, 1000)], &ctx(&[], None));
    assert_eq!(p.rows[4].state, "unsure");
    assert!(p.rows[4].inf_unsure);
    assert_eq!(p.rows[5].state, "unsure");
    assert_eq!(p.rows[5].name_state, "unsure");
    assert_eq!(p.rows[6].state, "sure");
    assert_eq!(p.uncertain_rows, 2);
}

// ---------------------------------------------------------------- time, storage, names, settings

#[test]
fn utc_time_round_trips() {
    assert_eq!(parse_iso("2026-11-25T06:18:37Z"), Some(1795587517));
    for t in [0i64, 951782400, 1795587517, 4102444800] { assert_eq!(parse_iso(&fmt_iso(t)), Some(t)); }
    assert_eq!(fmt_id(1795587517), "20261125T061837");
    assert_eq!(parse_iso("2026-13-01T00:00:00Z"), None);
    assert_eq!(parse_iso("garbage"), None);
}

fn snap(id: &str, data: &str, rows: &[(&str, i32)]) -> Snapshot {
    Snapshot { v: 1, id: id.into(), taken_utc: data.into(), data_utc: data.into(), minutes_old: None, resolution: "1920x1080".into(), sources: vec!["Screenshot_0001.bmp".into()], pages: Some(1), complete: true,
        rows: rows.iter().map(|(n, v)| StoredRow { system: n.to_string(), inf_x10: Some(*v), star: true, conf: 0.9, confirmed: true, ..Default::default() }).collect(), reader: "bgs1".into(), ..Default::default() }
}

#[test]
fn snapshots_are_saved_listed_exported_and_forgotten_inside_their_own_folder() {
    let d = tmp("store").join("bgs");
    let st = Store::at(d.clone()).expect("safe folder");
    let id1 = st.save(snap("20261125T060000", "2026-11-25T06:00:00Z", &[("GUNWIN", 669), ("SERRA, A", 660)])).unwrap();
    let id1b = st.save(snap("20261125T060000", "2026-11-25T06:00:00Z", &[("GUNWIN", 670)])).unwrap();
    assert_eq!(id1, "20261125T060000");
    assert_eq!(id1b, "20261125T060000-2", "an id is never overwritten");
    let id2 = st.save(snap("20261126T060000", "2026-11-26T06:00:00Z", &[("GUNWIN", 672), ("SERRA, A", 655)])).unwrap();
    assert_eq!(st.all().len(), 3);
    assert_eq!(st.get(&id2).unwrap().rows[0].inf_x10, Some(672));
    assert!(st.get("../../x").is_none(), "no path in an id");
    assert_eq!(st.summaries().len(), 3);
    let csv = st.csv();
    assert!(csv.starts_with('\u{feff}'));
    assert!(csv.contains("2026-11-26T06:00:00Z,GUNWIN,67.2,+0.2,yes"), "{csv}");
    assert!(csv.contains("\"SERRA, A\",65.5,-0.5,yes"), "{csv}");
    // the index can be rebuilt from the files
    std::fs::remove_file(d.join("index.json")).unwrap();
    assert_eq!(st.ids().len(), 3);
    // a broken snapshot file is kept as .bad and skipped
    std::fs::write(d.join("snap-20270101T000000.json"), "{ broken").unwrap();
    assert!(st.get("20270101T000000").is_none());
    assert!(std::fs::read_dir(&d).unwrap().any(|e| e.unwrap().file_name().to_string_lossy().contains(".bad-")));
    // forget removes only our files
    std::fs::write(d.join("other.txt"), "mine").unwrap();
    assert!(st.forget() >= 3);
    assert!(st.all().is_empty());
    assert!(d.join("other.txt").exists());
    let _ = std::fs::remove_dir_all(d.parent().unwrap());
}

#[test]
fn the_store_refuses_a_game_folder() {
    let d = tmp("game").join("bgs");
    std::fs::create_dir_all(&d).unwrap();
    std::fs::write(d.join("Journal.2026-11-25T000000.01.log"), "x").unwrap();
    assert!(Store::at(d.clone()).is_none(), "a folder with a Journal in it is never used");
    let _ = std::fs::remove_file(d.join("Journal.2026-11-25T000000.01.log"));
    std::fs::write(d.join("Screenshot_0001.bmp"), "x").unwrap();
    assert!(Store::at(d.clone()).is_none(), "nor a screenshot folder");
    assert!(!safe_dir(std::path::Path::new("C:/Users/Someone/Saved Games/Frontier Developments/Elite Dangerous/bgs")));
    assert!(!safe_dir(std::path::Path::new("C:/Users/Someone/Pictures/Frontier Developments/Elite Dangerous/bgs")));
    assert!(!safe_dir(std::path::Path::new("C:/Users/Someone/AppData/Roaming/com.gravitasmap.app/other")));
    let _ = std::fs::remove_dir_all(d.parent().unwrap());
}

#[test]
fn commit_validates_and_the_first_snapshot_makes_the_known_names() {
    let base = tmp("commit");
    let st = Store::at(base.join("bgs")).unwrap();
    let nd = Some(base.clone());
    let good = json!({"taken_utc": "2026-11-25T06:18:37Z", "data_utc": "2026-11-25T06:03:37Z", "minutes_old": 15, "resolution": "1920x1080", "sources": ["C:\\x\\Screenshot_0074.bmp"], "pages": 1, "complete": true,
        "rows": [{"system": "GUNWIN", "inf_x10": 669, "star": true, "conf": 0.9, "confirmed": true}, {"system": "Hip 88785", "inf_x10": 656, "confirmed": false}]});
    let r = super::commit_to(&st, &good, &nd, false);
    assert_eq!(r["ok"], true, "{r}");
    assert_eq!(r["id"], "20261125T060337");
    let s = st.get("20261125T060337").unwrap();
    assert_eq!(s.sources, vec!["Screenshot_0074.bmp"], "file names only");
    assert_eq!(super::names::load(&base).names, vec!["GUNWIN", "Hip 88785"]);
    assert_eq!(super::names::load(&base).source, "snapshot");
    for (bad, why) in [
        (json!({"taken_utc": "x", "data_utc": "y", "rows": []}), "times"),
        (json!({"taken_utc": "2026-11-25T06:18:37Z", "data_utc": "2026-11-25T06:18:37Z", "rows": []}), "no rows"),
        (json!({"taken_utc": "2026-11-25T06:18:37Z", "data_utc": "2026-11-25T06:18:37Z", "rows": [{"system": "<script>", "inf_x10": 5}]}), "name"),
        (json!({"taken_utc": "2026-11-25T06:18:37Z", "data_utc": "2026-11-25T06:18:37Z", "rows": [{"system": "OK ONE", "inf_x10": 5000}]}), "range"),
        (json!({"taken_utc": "2026-11-25T06:18:37Z", "data_utc": "2026-11-25T06:18:37Z", "rows": [{"system": "OK ONE", "inf_x10": 5}, {"system": "ok  one", "inf_x10": 6}]}), "twice"),
        (json!("text"), "not an object"),
    ] { assert_eq!(super::commit_to(&st, &bad, &nd, false)["ok"], false, "{why}"); }
    let _ = std::fs::remove_dir_all(&base);
}

#[test]
fn names_clean_and_the_csv_import_takes_only_the_star_system_column() {
    let (n, bad) = super::names::clean(&v(&["GUNWIN", "  hip   88785 ", "HIP 88785", "", "<b>x</b>", "A"])).unwrap();
    assert_eq!(n, vec!["GUNWIN", "hip 88785"]);
    assert_eq!(bad, vec!["<b>x</b>", "A"]);
    let csv = "\u{feff}\"Population\",\"STAR SYSTEM \",\"Inf\"\r\n\"237,710\",\"Amahibuhcha\",\"61.1%\"\r\n\"1\",\"Say \"\"hi\"\", Sector\",\"5.0%\"\r\n\"2\",\"Barnard's Star\",\"7.7%\"\r\n\"3\",\"amahibuhcha\",\"1%\"\r\n";
    let (names, bad) = super::names::names_from_csv(csv).unwrap();
    assert_eq!(names, vec!["Amahibuhcha", "Barnard's Star"]);
    assert_eq!(bad.len(), 1, "a quote in a name is not a system name");
    assert!(super::names::names_from_csv("\"Name\",\"Inf\"\n\"x\",\"1\"\n").unwrap_err().contains("Star system"));
    assert!(super::names::names_from_csv("").is_err());
    assert_eq!(super::names::csv_rows("a,\"b,\nc\",d\n")[0], vec!["a", "b,\nc", "d"]);
}

#[test]
fn csv_import_stores_names_only_never_a_percent_or_any_other_column() {
    let base = tmp("csvimport");
    let csv = "\"Star system\",\"Government\",\"Population\",\"Inf\",\"Updated\"\n\"Gunwin\",\"Patronage\",\"237,710\",\"66.9%\",\"9 days ago\"\n\"Serra\",\"Democracy\",\"1,234\",\"42.5%\",\"1 day ago\"\n";
    let (names, _) = super::names::names_from_csv(csv).unwrap();
    let nf = super::names::NamesFile { v: 1, source: "csv".into(), inara_id: String::new(), updated_utc: String::new(), names };
    assert!(super::names::save(&base, &nf));
    let text = std::fs::read_to_string(super::names::file(&base)).unwrap();
    for leak in ["66.9", "42.5", "%", "Patronage", "Democracy", "237", "ago", "Population"] { assert!(!text.contains(leak), "{leak} reached storage: {text}"); }
    assert!(text.contains("Gunwin") && text.contains("Serra"));
    std::fs::write(base.join("bgs_names.json.bad-1"), "x").unwrap();
    super::names::forget(&base);
    assert!(!super::names::file(&base).exists() && !base.join("bgs_names.json.bad-1").exists());
    let _ = std::fs::remove_dir_all(&base);
}

pub(super) fn real_csv_names() -> Option<Vec<String>> {
    let p = std::env::var_os("USERPROFILE").map(std::path::PathBuf::from)?.join("Downloads").join("Turkish Galactic Empire - minor faction presence  EliteDangerous  INARA.csv");
    let t = std::fs::read_to_string(p).ok()?;
    Some(super::names::names_from_csv(&t).ok()?.0)
}

#[test]
fn the_real_inara_export_gives_the_squadrons_systems() {
    let Some(n) = real_csv_names() else { eprintln!("SKIPPED: the Inara CSV is not in Downloads"); return };
    println!("CSV names: {}", n.len());
    assert_eq!(n.len(), 77);
}

#[test]
fn settings_are_checked() {
    use super::settings::*;
    let s = Settings::default();
    assert!(!s.on && s.n == 8 && s.window_min == 5 && s.low == 50.0 && s.high == 65.0);
    assert!(apply(s.clone(), "on", &json!(true)).unwrap().on);
    assert!(apply(s.clone(), "on", &json!("yes")).is_err());
    assert_eq!(apply(s.clone(), "n", &json!(12)).unwrap().n, 12);
    assert!(apply(s.clone(), "n", &json!(0)).is_err());
    assert!(apply(s.clone(), "n", &json!(1000)).is_err());
    assert!(apply(s.clone(), "low", &json!(70)).is_err(), "low above high");
    assert!(apply(s.clone(), "window_min", &json!(0)).is_err());
    assert!(apply(s.clone(), "bogus", &json!(1)).is_err());
    assert!(apply(s.clone(), "shots_dir", &json!("D:\\Shots")).is_ok());
    assert_eq!(from_value(Some(&json!({"n": 500}))).n, 64);
    assert!(!from_value(None).on, "off by default");
}

// ---------------------------------------------------------------- screenshots: Journal stamps, real pictures

#[test]
fn screenshots_are_found_newest_first_and_stamped_with_the_journal_time() {
    let base = tmp("shots");
    let pics = base.join("pics");
    let jd = base.join("journal");
    std::fs::create_dir_all(&pics).unwrap();
    std::fs::create_dir_all(&jd).unwrap();
    for n in ["Screenshot_0001.bmp", "Screenshot_0002.bmp", "Screenshot_0003.BMP", "notes.txt", "Screenshot_0004.jpg"] { std::fs::write(pics.join(n), b"x").unwrap(); }
    let mt = super::timeutil::mtime(&pics.join("Screenshot_0002.bmp")).unwrap();
    let line = |f: &str, t: i64| format!("{{ \"timestamp\":\"{}\", \"event\":\"Screenshot\", \"Filename\":\"\\\\ED_Pictures\\\\{f}\", \"Width\":1920, \"Height\":1080, \"System\":\"X\" }}\n", fmt_iso(t));
    std::fs::write(jd.join("Journal.2026-11-25T000000.01.log"), format!("{{ \"event\":\"Music\" }}\n{}{}", line("Screenshot_0002.bmp", mt - 3), line("Screenshot_0001.bmp", mt - 100))).unwrap();
    let all = super::shots::newest(&pics, Some(&jd), 8);
    let names: Vec<&str> = all.iter().map(|s| s.name.as_str()).collect();
    assert_eq!(all.len(), 3, "{names:?}: only Screenshot*.bmp and png");
    let s2 = all.iter().find(|s| s.name == "Screenshot_0002.bmp").unwrap();
    assert!(s2.from_journal && s2.taken == mt - 3);
    assert!(!all.iter().find(|s| s.name == "Screenshot_0003.BMP").unwrap().from_journal);
    assert_eq!(super::shots::newest(&pics, Some(&jd), 2).len(), 2, "the newest N");
    assert!(super::shots::newest(&base.join("missing"), None, 8).is_empty());
    let _ = std::fs::remove_dir_all(&base);
}

#[test]
fn the_real_screenshots_read_end_to_end_with_the_bundled_templates() {
    let Some(gt) = super::train::load_gt() else { eprintln!("SKIPPED: no research/bgs/gt.json"); return };
    let t = bundled().unwrap();
    for res in ["1440", "1080"] {
        let Some(pages) = super::train::load_pages(res) else { eprintln!("SKIPPED: no inbox/bgs/{res}"); return };
        let names: Vec<String> = gt.pages.iter().flatten().map(|(n, _)| n.to_lowercase()).collect();
        let reads: Vec<PageIn> = pages.iter().enumerate().map(|(i, p)| {
            let r = read_screen(&super::imgops::Img::new(Rgb { w: p.w, h: p.h, px: p.px.clone() }), t).expect("layout");
            PageIn { file: format!("Screenshot_{i}.bmp"), taken: 1000 + i as i64 * 20, read: r }
        }).collect();
        for (i, p) in reads.iter().enumerate() {
            assert_eq!(p.read.rows.len(), if i == 7 { 7 } else { 10 }, "{res} page {}: 10 rows, 7 on the last", i + 1);
            assert_eq!(p.read.page, Some(i as u32 + 1), "{res}: page number (the templates have seen these pages)");
            assert_eq!(p.read.pages, Some(8));
            assert_eq!(p.read.systems, Some(77));
            assert!(p.read.minutes == Some(52) || p.read.minutes == Some(55), "LAST UPDATED {:?}", p.read.minutes);
        }
        let p = build(reads, &ctx(&names, None));
        assert!(p.complete && p.can_save, "{res}: {:?}", p.issues.iter().map(|i| (i.code, &i.msg)).collect::<Vec<_>>());
        assert_eq!(p.rows.len(), 77);
        // the list as the player would save it equals the hand-read truth
        let truth: Vec<&(String, String)> = gt.pages.iter().flatten().collect();
        let wrong = p.rows.iter().zip(&truth).filter(|(c, (n, inf))| !c.system.eq_ignore_ascii_case(n) || c.inf != *inf).count();
        println!("{res}: seen pages, {} of 77 rows differ from the truth, {} rows flagged", wrong, p.uncertain_rows);
        assert_eq!(wrong, 0, "{res}: with templates that have seen these pages every row must be right");
        assert!(p.issues.iter().all(|i| !i.blocking));
    }
}

/// the templates built WITHOUT the page that is read, on sizes the templates never saw (rescaled pages)
#[test]
fn unseen_sizes_read_how_well() {
    let Some((gt, a)) = super::train::load_gt().zip(super::train::load_pages("1440")) else { eprintln!("SKIPPED: fixtures"); return };
    let b = super::train::load_pages("1080").unwrap();
    let (samples, _) = super::train::collect(&[("1440", &a), ("1080", &b)], &gt);
    let mut out = Vec::new();
    for (label, h) in [("720p", 720.0), ("900p", 900.0), ("1200p", 1200.0), ("1800p", 1800.0), ("2160p", 2160.0)] {
        let mut st = super::tests::Stats::default();
        for p in 1..=8usize {
            let t = super::train::build(&samples, Some(p));
            let img = super::imgops::Img::new(super::train::rescale(&a[p - 1], h / 1440.0));
            let Some(pr) = read_screen(&img, &t) else { continue };
            if pr.rows.len() != gt.pages[p - 1].len() { continue; }
            for (r, (n, inf)) in pr.rows.iter().zip(&gt.pages[p - 1]) { st.add(r, n, inf); }
        }
        out.push(st.line(label));
        out.push(st.value_line(label));
    }
    for l in out { println!("{l}"); }
}

#[test]
fn a_misread_page_number_is_repaired_by_the_values() {
    // the friend's case: page 6 read as page 8, so 8 appears twice and 6 is missing; the pages are put in order by their first value
    let rows = list(50, 700);
    let mut pages: Vec<PageIn> = (0..5).map(|k| page(k as u32 + 1, 5, 50, rows[k * 10..k * 10 + 10].to_vec(), 1000 + k as i64 * 10)).collect();
    pages[2].read.page = Some(5);
    pages[4].read.page = Some(5);
    let p = build(pages, &ctx(&[], None));
    assert!(p.issues.iter().any(|i| i.code == "page_numbers_fixed"), "{:?}", p.issues.iter().map(|i| i.code).collect::<Vec<_>>());
    assert!(!p.issues.iter().any(|i| i.code == "missing_page" || i.code == "duplicate_page"));
    assert_eq!(p.pages_found, vec![1, 2, 3, 4, 5]);
    assert_eq!(p.rows.len(), 50);
    assert!(p.rows.windows(2).all(|w| w[0].inf_x10 >= w[1].inf_x10), "the rows are in list order");
}

#[test]
fn a_garbled_name_with_a_clear_ending_snaps_to_the_one_known_name() {
    // the friend's blurred screenshots: touching letters merge ('SECTOR' read as 'SEWOR', 'ZP-O' as 'H')
    let known: Vec<String> = ["COL 285 SECTOR UE-N B21-6", "COL 285 SECTOR UE-N B21-4", "COL 285 SECTOR UE-N B21-0", "ICZ ZP-O B6-5", "ICZ ZP-O B6-6", "SHUI WEI SECTOR XU-P B5-2"].iter().map(|s| s.to_string()).collect();
    let v = |a: &[&str]| a.iter().map(|s| s.to_string()).collect::<Vec<_>>();
    let h = snap_all(&v(&["COL285 SEWOR UE-N B21-6", "ICZZH B6-5", "SHUI MI SECTOR XU-P B5-2"]), &known);
    assert_eq!(h[0], Hit::Near(0, 9), "{h:?}");
    assert_eq!(h[1], Hit::Near(3, 9), "{h:?}");
    assert!(matches!(h[2], Hit::Near(5, _)), "{h:?}");
    // an ending shared by several known names and no clear word before it is left to the player
    let none = snap_all(&v(&["COL285 SEWOR QQ-Q B21-6"]), &known);
    assert!(matches!(none[0], Hit::Near(0, 9)) || none[0] == Hit::None, "{none:?}");
    // two rows never take the same known name
    let two = snap_all(&v(&["ICZZH B6-5", "ICZXX B6-5"]), &known);
    assert_eq!(two.iter().filter(|x| **x != Hit::None).count(), 1, "{two:?}");
}

#[test]
fn a_look_alike_doubt_is_cleared_when_the_value_equals_the_last_snapshots_value() {
    let known: Vec<String> = (0..10).map(|i| format!("SYS {i:03}")).collect();
    let mut rows = list(10, 700);
    rows[0].inf_confusable = true;      // equals the last snapshot: cleared
    rows[1].inf_confusable = true;      // differs from the last snapshot: stays in doubt
    rows[2].inf_agree = false;          // the second reading disagrees: stays in doubt even when equal
    let prev = super::model::Snapshot { rows: (0..10).map(|i| super::model::StoredRow { system: format!("SYS {i:03}"), inf_x10: Some(if i == 1 { 650 } else { 700 - i }), ..Default::default() }).collect(), ..Default::default() };
    let p = build(vec![page(1, 1, 10, rows, 1000)], &ctx(&known, Some(&prev)));
    assert_eq!(p.rows[0].state, "sure", "{:?}", p.rows[0].reasons);
    assert!(p.rows[0].reasons.contains(&"value_matches_previous"));
    assert!(p.rows[1].uncertain, "a changed value that is also a look-alike must be checked");
    assert!(p.rows[2].uncertain, "a disagreeing second reading is never cleared");
    assert_eq!(p.rows[3].state, "sure");
}

#[test]
fn a_zero_read_as_o_and_a_lost_hyphen_still_snap_to_the_one_known_name() {
    let known: Vec<String> = vec!["Col 285 Sector UE-N b21-0".into(), "Col 285 Sector AW-J b23-0".into(), "Col 285 Sector UE-N b21-4".into()];
    let read: Vec<String> = vec!["COL 285 SECTOR UE N B21 O".into(), "COL 285 SECTOR AWJ B23 O".into(), "COL 285 SECTOR UE-N B21-4".into()];
    let h = super::snap::snap_all(&read, &known);
    assert!(matches!(h[0], super::snap::Hit::Near(0, _)), "{:?}", h);
    assert!(matches!(h[1], super::snap::Hit::Near(1, _)), "{:?}", h);
    assert_eq!(h[2], super::snap::Hit::Exact(2));
}

#[test]
fn a_twin_that_already_has_its_own_row_is_no_doubt_but_an_unclaimed_twin_is() {
    // B23-5 and B23-6 both known. Read weakly as exact names.
    let known: Vec<String> = vec!["Col 285 Sector CR-J b23-5".into(), "Col 285 Sector CR-J b23-6".into(), "HIP 1".into()];
    let mut rows = list(3, 700);
    rows[0].name = "COL 285 SECTOR CR-J B23-5".into(); rows[1].name = "COL 285 SECTOR CR-J B23-6".into(); rows[2].name = "HIP 1".into();
    for r in rows.iter_mut() { r.name_cost = 0.3; r.name_margin = 0.05; }
    let both = build(vec![page(1, 1, 3, rows.clone(), 1000)], &ctx(&known, None));
    assert!(!both.rows[0].uncertain && !both.rows[1].uncertain, "each twin has its own row: no doubt");
    let only_one = build(vec![page(1, 1, 2, vec![rows[0].clone(), rows[2].clone()], 1000)], &ctx(&known, None));
    assert!(only_one.rows[0].uncertain, "the twin has no row: the reading may be the wrong digit");
}

#[test]
fn a_stray_separator_and_one_wrong_letter_still_snap_and_two_rows_never_share_a_name() {
    let known: Vec<String> = vec!["Duryampas".into(), "Serra".into()];
    let h = super::snap::snap_all(&["DURYAMF-AS -".to_string(), "SERRA".to_string()], &known);
    assert!(matches!(h[0], super::snap::Hit::Near(0, _)), "{h:?}");
    let h2 = super::snap::snap_all(&["DURYAMF-AS -".to_string(), "DURYAMQ-AS -".to_string()], &known);
    assert_eq!(h2[0], super::snap::Hit::None);
    assert_eq!(h2[1], super::snap::Hit::None);
}
