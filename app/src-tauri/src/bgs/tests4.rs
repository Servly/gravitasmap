//! BGS Watch tests, part 4: the pages of 26 Nov after the daily tick (research/bgs/today, 8 pages of 1440p with hand-verified truth).
use super::decode::decode_file;
use super::gates::*;
use super::imgops::Img;
use super::reader::*;
use super::tpl::{bundled, Templates};
use super::train::root;
use serde_json::Value;

pub struct Today {
    /// pages in page order (1..8): file name, rows (name, inf text like "68.0%")
    pub pages: Vec<(String, Vec<(String, String)>)>,
}

pub fn load_today() -> Option<Today> {
    let t = std::fs::read_to_string(root().join("research/bgs/today/gt_today.json")).ok()?;
    let v: Value = serde_json::from_str(&t).ok()?;
    let mut by: std::collections::BTreeMap<u64, (String, Vec<(u64, String, String)>)> = Default::default();
    for r in v["rows"].as_array()? {
        let e = by.entry(r["page"].as_u64()?).or_insert((r["file"].as_str()?.to_string(), vec![]));
        e.1.push((r["row"].as_u64()?, r["name"].as_str()?.to_string(), format!("{:.1}%", r["inf"].as_f64()?)));
    }
    Some(Today { pages: by.into_values().map(|(f, mut rows)| { rows.sort(); (f, rows.into_iter().map(|r| (r.1, r.2)).collect()) }).collect() })
}

pub fn load_today_images(t: &Today) -> Option<Vec<super::decode::Rgb>> {
    t.pages.iter().map(|(f, _)| decode_file(&root().join("research/bgs/today").join(f)).ok()).collect()
}

fn value_flag(r: &RowRead) -> bool { r.inf_x10.is_none() || r.inf_cost > T_COST || r.inf_margin < T_MARGIN || !r.inf_agree }

/// reads the 8 pages with `tpl`, snapping with `known`; prints and returns (value exact, rows)
pub fn report(label: &str, tpl: &Templates, known: &[String]) -> (usize, usize) {
    let Some(today) = load_today() else { eprintln!("SKIPPED: research/bgs/today"); return (0, 0) };
    let Some(imgs) = load_today_images(&today) else { eprintln!("SKIPPED: today images"); return (0, 0) };
    let mut pages = Vec::new();
    let mut reads = Vec::new();
    for (i, im) in imgs.iter().enumerate() {
        let pr = read_screen(&Img::new(super::decode::Rgb { w: im.w, h: im.h, px: im.px.clone() }), tpl).expect("layout found");
        assert_eq!(pr.rows.len(), today.pages[i].1.len(), "page {} rows", i + 1);
        let mut p2 = pr.clone();
        p2.page = Some(i as u32 + 1);
        p2.pages = Some(8);
        reads.push(pr);
        pages.push(PageIn { file: today.pages[i].0.clone(), taken: 1000 + i as i64 * 20, read: p2 });
    }
    let (mut v_ok, mut v_wrong_flagged, mut v_wrong_missed, mut v_right_flagged, mut n_ok, mut n_wrong_flagged, mut n_wrong_missed, mut total) = (0, 0, 0, 0, 0, 0, 0, 0);
    let mut wrong_vals = Vec::new();
    let (mut c_right_new, mut c_wrong_new) = (0, 0);
    for (pr, (_, gt)) in reads.iter().zip(&today.pages) {
        for (r, (name, inf)) in pr.rows.iter().zip(gt) {
            total += 1;
            let vf = value_flag(r);
            let vn = vf || r.inf_confusable;
            if r.inf == *inf { c_right_new += vn as usize; } else { c_wrong_new += vn as usize; }
            if r.inf == *inf { v_ok += 1; v_right_flagged += vf as usize; } else { if vf { v_wrong_flagged += 1 } else { v_wrong_missed += 1 }; wrong_vals.push(format!("{name}: {inf} read {} ({})", r.inf, if vf { "flagged" } else { "NOT flagged" })); }
            let nf = r.name_cost > T_COST || r.name_margin < T_MARGIN || r.name.is_empty();
            if r.name == *name { n_ok += 1; } else if nf { n_wrong_flagged += 1; } else { n_wrong_missed += 1; }
        }
    }
    let prop = build(pages, &Ctx { known, prev: None, jump_x10: 30 });
    let truth: Vec<&(String, String)> = today.pages.iter().flat_map(|p| p.1.iter()).collect();
    let wrong_final = prop.rows.iter().zip(&truth).filter(|(c, (n, inf))| !super::snap::norm(&c.system).eq_ignore_ascii_case(&super::snap::norm(n)) || c.inf != *inf).count();
    let wrong_final_sure = prop.rows.iter().zip(&truth).filter(|(c, (n, inf))| (!super::snap::norm(&c.system).eq_ignore_ascii_case(&super::snap::norm(n)) || c.inf != *inf) && !c.uncertain).count();
    println!("{label}: {total} rows | values exact {v_ok} (wrong {} : flagged {v_wrong_flagged}, NOT flagged {v_wrong_missed}; right values flagged {v_right_flagged}) | raw names exact {n_ok} (wrong flagged {n_wrong_flagged}, not flagged {n_wrong_missed}) | after snapping with the list: wrong rows {wrong_final}, of them shown as sure {wrong_final_sure}, uncertain rows {}", total - v_ok, prop.uncertain_rows);
    println!("   with the extra rule for confusable digits (6 8 9 0 3 5 close): right values flagged {c_right_new}, wrong values flagged {c_wrong_new}");
    for w in &wrong_vals { println!("   wrong value {w}"); }
    (v_ok, total)
}

#[test]
fn the_shipped_reader_on_the_new_pages_out_of_sample() {
    let known = super::tests2::real_csv_names().unwrap_or_default();
    let t = bundled().unwrap();
    report("TODAY with the templates built before these pages", t, &known);
}

/// leave one page out over all 24 real pages (8 old pages in two sizes, 8 pages of 26 Nov): templates from every other page
#[test]
fn leave_one_page_out_over_all_real_pages() {
    let known = super::tests2::real_csv_names().unwrap_or_default();
    let Some((gt, a)) = super::train::load_gt().zip(super::train::load_pages("1440")) else { eprintln!("SKIPPED: fixtures"); return };
    let b = super::train::load_pages("1080").unwrap();
    let Some(today) = load_today() else { eprintln!("SKIPPED: today"); return };
    let timgs = load_today_images(&today).unwrap();
    let (mut samples, _) = super::train::collect(&[("1440", &a), ("1080", &b)], &gt);
    samples.extend(super::train::collect_today());
    let mut st = [super::tests::Stats::default(), super::tests::Stats::default(), super::tests::Stats::default()];
    let mut margins: Vec<(f32, bool)> = Vec::new();
    let mut lists: [Vec<PageIn>; 3] = Default::default();
    for p in 1..=16usize {
        let t = super::train::build(&samples, Some(p));
        let sets: Vec<(usize, &super::decode::Rgb, &Vec<(String, String)>)> = if p <= 8 { vec![(0, &a[p - 1], &gt.pages[p - 1]), (1, &b[p - 1], &gt.pages[p - 1])] } else { vec![(2, &timgs[p - 9], &today.pages[p - 9].1)] };
        for (k, im, truth) in sets {
            let mut pr = read_screen(&Img::new(super::decode::Rgb { w: im.w, h: im.h, px: im.px.clone() }), &t).expect("layout");
            assert_eq!(pr.rows.len(), truth.len());
            for (r, (n, inf)) in pr.rows.iter().zip(truth) {
                st[k].add(r, n, inf);
                margins.push((r.inf_alike, r.inf == *inf));
            }
            pr.page = Some(if p <= 8 { p } else { p - 8 } as u32);
            pr.pages = Some(8);
            lists[k].push(PageIn { file: format!("p{p}.bmp"), taken: 1000 + p as i64 * 20, read: pr });
        }
    }
    for (k, label) in ["old 1440p (8 pages)", "old 1080p (8 pages)", "26 Nov 1440p (8 pages)"].iter().enumerate() {
        println!("{}", st[k].line(label));
        println!("{}", st[k].value_line(label));
        let prop = build(std::mem::take(&mut lists[k]), &Ctx { known: &known, prev: None, jump_x10: 30 });
        println!("   with the CSV names: uncertain rows {} of {}, issues {:?}", prop.uncertain_rows, prop.rows.len(), prop.issues.iter().map(|i| i.code).collect::<Vec<_>>());
    }
    let mut right: Vec<f32> = margins.iter().filter(|m| m.1).map(|m| m.0).filter(|&m| m < 9.0).collect();
    right.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let wrong: Vec<f32> = margins.iter().filter(|m| !m.1).map(|m| m.0).collect();
    let q = |p: f64| right.get(((right.len() as f64 - 1.0) * p) as usize).copied().unwrap_or(0.0);
    println!("look-alike margin of RIGHT values ({} rows have one): min {:.3} p5 {:.3} p10 {:.3} p25 {:.3} p50 {:.3}; wrong values: {:?}", right.len(), q(0.0), q(0.05), q(0.1), q(0.25), q(0.5), wrong);
    for t in [0.05f32, 0.1, 0.15, 0.2, 0.3, 0.35] { println!("   threshold {t}: right values flagged {} of {}", right.iter().filter(|&&m| m < t).count(), margins.len()); }
}
