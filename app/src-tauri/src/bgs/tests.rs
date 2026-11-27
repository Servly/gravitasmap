//! BGS Watch tests. The fixtures (research/bgs/gt.json, inbox/bgs/1080 and 1440) are the owner's local screenshots: a test skips with a message when they are absent.
use super::decode::*;
use super::imgops::Img;
use super::reader::*;
use super::tpl::*;
use super::train::*;

pub fn lev(a: &str, b: &str) -> usize {
    let (a, b): (Vec<char>, Vec<char>) = (a.chars().collect(), b.chars().collect());
    let mut p: Vec<usize> = (0..=b.len()).collect();
    for i in 1..=a.len() {
        let mut c = vec![i];
        for j in 1..=b.len() { c.push((p[j] + 1).min(c[j - 1] + 1).min(p[j - 1] + (a[i - 1] != b[j - 1]) as usize)); }
        p = c;
    }
    p[b.len()]
}

pub(super) fn fixtures() -> Option<(Gt, Vec<Rgb>, Vec<Rgb>)> {
    let gt = load_gt();
    let a = load_pages("1440");
    let b = load_pages("1080");
    match (gt, a, b) {
        (Some(g), Some(a), Some(b)) => Some((g, a, b)),
        _ => { eprintln!("SKIPPED: research/bgs/gt.json or inbox/bgs/1080 and 1440 are not on this computer"); None }
    }
}

/// writes data/bgs_tpl.bin from every sample of both sizes (run by tools/bgs_templates.py)
#[test]
#[ignore]
fn bgs_build_templates() {
    let Some((gt, a, b)) = fixtures() else { panic!("the fixtures are missing") };
    let (mut samples, skipped) = collect(&[("1440", &a), ("1080", &b)], &gt);
    samples.extend(collect_today());
    samples.extend(super::train::collect_cyanidex());
    let t = build(&samples, None);
    let bin = encode(&t);
    println!("samples {} skipped lines {} exemplars name {} inf {} page {} file {} bytes", samples.len(), skipped, t.name.ch.len(), t.inf.ch.len(), t.page.ch.len(), bin.len());
    std::fs::write(PathBuf_data(), &bin).unwrap();
}

#[allow(non_snake_case)]
fn PathBuf_data() -> std::path::PathBuf { std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("data").join("bgs_tpl.bin") }

#[derive(Default, Debug)]
pub struct Stats {
    pub rows: usize,
    pub name_chars: usize,
    pub name_err: usize,
    pub val_chars: usize,
    pub val_err: usize,
    pub name_exact: usize,
    pub val_exact: usize,
    pub row_exact: usize,
    pub flagged: usize,
    pub wrong_unflagged: usize,
    pub wrong_flagged: usize,
    /// value cells: wrong ones, wrong ones no flag catches (first reading only / with the second reading), right ones flagged (first only / with the second)
    pub v_wrong: usize,
    pub v_missed_old: usize,
    pub v_missed_new: usize,
    pub v_right: usize,
    pub v_flag_old: usize,
    pub v_flag_new: usize,
}

impl Stats {
    pub fn add(&mut self, r: &RowRead, name: &str, inf: &str) {
        self.rows += 1;
        self.name_chars += name.len();
        self.name_err += lev(&r.name, name).min(name.len());
        self.val_chars += inf.len();
        self.val_err += lev(&r.inf, inf).min(inf.len());
        let (ne, ve) = (r.name == name, r.inf == inf);
        self.name_exact += ne as usize;
        self.val_exact += ve as usize;
        self.row_exact += (ne && ve) as usize;
        let old = r.inf_x10.is_none() || r.inf_cost > T_COST || r.inf_margin < T_MARGIN;
        let new = old || !r.inf_agree || r.inf_confusable;
        if ve { self.v_right += 1; self.v_flag_old += old as usize; self.v_flag_new += new as usize; } else { self.v_wrong += 1; self.v_missed_old += !old as usize; self.v_missed_new += !new as usize; }
        let flagged = !r.reasons.is_empty();
        self.flagged += flagged as usize;
        if !(ne && ve) { if flagged { self.wrong_flagged += 1 } else { self.wrong_unflagged += 1 } }
    }
    pub fn value_line(&self, label: &str) -> String {
        format!("{label} VALUE cells: wrong {} | missed by margin/cost only {} | missed with the second reading {} | right cells flagged: margin/cost only {} of {}, with the second reading {}",
            self.v_wrong, self.v_missed_old, self.v_missed_new, self.v_flag_old, self.v_right, self.v_flag_new)
    }
    pub fn line(&self, label: &str) -> String {
        let p = |a: usize, b: usize| 100.0 * a as f64 / b.max(1) as f64;
        format!("{label}: rows {} | name chars {:.1}% exact {:.1}% | value chars {:.1}% exact {:.1}% | row exact {:.1}% | flagged {} | wrong flagged {} unflagged {}",
            self.rows, 100.0 - p(self.name_err, self.name_chars), p(self.name_exact, self.rows), 100.0 - p(self.val_err, self.val_chars), p(self.val_exact, self.rows),
            p(self.row_exact, self.rows), self.flagged, self.wrong_flagged, self.wrong_unflagged)
    }
}

/// the whole list of one size put together: rows 10 per page, 7 on the last, order of the values, counts
#[test]
fn bgs_leave_one_page_out() {
    let Some((gt, a, b)) = fixtures() else { return };
    let t0 = std::time::Instant::now();
    let (samples, skipped) = collect(&[("1440", &a), ("1080", &b)], &gt);
    println!("samples {} (skipped lines {}) in {:?}", samples.len(), skipped, t0.elapsed());
    let mut all = [Stats::default(), Stats::default(), Stats::default()];
    let mut read_ms = Vec::new();
    let mut page_info = Vec::new();
    let mut lists: [Vec<super::gates::PageIn>; 2] = [Vec::new(), Vec::new()];
    for p in 1..=8usize {
        let t = build(&samples, Some(p));
        for (k, (res, pages)) in [("1440", &a), ("1080", &b)].iter().enumerate() {
            let t1 = std::time::Instant::now();
            let pr = read_screen(&Img::new(Rgb { w: pages[p - 1].w, h: pages[p - 1].h, px: pages[p - 1].px.clone() }), &t).expect("layout found");
            read_ms.push(t1.elapsed().as_millis());
            assert_eq!(pr.rows.len(), gt.pages[p - 1].len(), "{res} page {p}: row count");
            page_info.push((res.to_string(), p, pr.page, pr.pages, pr.systems));
            // the page digit cannot be read when its own page was left out of the templates: the order of the files stands in for it
            let mut pr2 = pr.clone();
            pr2.page = Some(p as u32);
            pr2.pages = Some(8);
            lists[k].push(super::gates::PageIn { file: format!("p{p}.bmp"), taken: 1000 + p as i64 * 20, read: pr2 });
            for (r, (name, inf)) in pr.rows.iter().zip(&gt.pages[p - 1]) {
                let nm = name.as_str();
                all[k].add(r, nm, inf);
                all[2].add(r, nm, inf);
            }
        }
    }
    // the whole list with the squadron's known names (as after the player confirmed the first snapshot): snapping and the gates
    let known: Vec<String> = gt.pages.iter().flatten().map(|(n, _)| n.clone()).collect();
    let csv = super::tests2::real_csv_names();
    let mut lists_to_try: Vec<(&str, Vec<String>)> = vec![("ground-truth names", known.clone())];
    if let Some(c) = &csv {
        lists_to_try.push(("Inara CSV names", c.clone()));
        let up = |v: &[String]| v.iter().map(|n| super::snap::norm(n)).collect::<std::collections::BTreeSet<_>>();
        let (a, b) = (up(&known), up(c));
        println!("CSV vs the game list: {} CSV names, {} game names; only in the CSV {:?}; only in the game list {:?}", b.len(), a.len(), b.difference(&a).collect::<Vec<_>>(), a.difference(&b).collect::<Vec<_>>());
    }
    for (label, names) in &lists_to_try {
        for (k, res) in ["1440", "1080"].iter().enumerate() {
            let pages: Vec<super::gates::PageIn> = lists[k].iter().map(|p| super::gates::PageIn { file: p.file.clone(), taken: p.taken, read: p.read.clone() }).collect();
            let prop = super::gates::build(pages, &super::gates::Ctx { known: names, prev: None, jump_x10: 30 });
            let truth: Vec<&(String, String)> = gt.pages.iter().flatten().collect();
            let (mut wrong, mut wrong_sure) = (0, 0);
            for (c, (n, inf)) in prop.rows.iter().zip(&truth) {
                if !super::snap::norm(&c.system).eq_ignore_ascii_case(&super::snap::norm(n)) || c.inf != *inf { wrong += 1; if !c.uncertain { wrong_sure += 1; } }
            }
            println!("{res} with {label}: rows {} wrong {} (shown as sure: {}), uncertain rows {}, issues {:?}", prop.rows.len(), wrong, wrong_sure, prop.uncertain_rows, prop.issues.iter().map(|i| i.code).collect::<Vec<_>>());
        }
    }
    println!("template count (last fold) {}", build(&samples, Some(8)).count());
    println!("{}", all[0].line("1440 leave-page-out"));
    println!("{}", all[1].line("1080 leave-page-out"));
    println!("{}", all[2].line("both"));
    println!("{}", all[2].value_line("both sizes, 154 rows"));
    println!("read ms per page: {:?}", read_ms);
    println!("page labels (res, page, read page, pages, systems): {:?}", page_info);
    assert!(all[2].val_exact * 100 >= all[2].rows * 90, "value exact");
}
