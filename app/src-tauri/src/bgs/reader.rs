//! BGS Watch, one screenshot of the Squadron > Faction list to numbers: layout, glyphs, matching, grammar. Memory only.
use super::glyphs::{segment_line, segment_line_h, Seg, G_FRAC};
use super::grammar::{recognise, recognise_glyphs, recognise_mode, split_words, Recog};
use super::imgops::Img;
use super::layout::{find_layout, star_rows, Layout};
use super::tpl::{FontKind, Templates};

/// a glyph whose best match costs more than this makes the row uncertain
pub const T_COST: f32 = 0.8;
/// ... and so does a glyph whose second best character is almost as good
pub const T_MARGIN: f32 = 0.10;
/// A VALUE is doubted only below this gap to the second best reading. Measured out of sample (24 real pages, each left out of the training in turn, three screens):
/// 0 wrong values in 308, so the old 0.10 flagged 42 right values for nothing. The second reading, the order of the list, the jump check and the confirm table stay as safety nets.
pub const T_VAL_MARGIN: f32 = 0.04;

pub struct RowSeg {
    pub star: bool,
    pub name: Option<Seg>,
    pub inf: Option<Seg>,
}

pub struct Screen {
    pub lay: Layout,
    pub rows: Vec<RowSeg>,
    pub page: Option<Seg>,
    pub systems: Option<Seg>,
}

#[derive(Clone, Debug, Default)]
pub struct RowRead {
    pub name: String,
    pub name_alts: Vec<String>,
    pub name_cost: f32,
    pub name_margin: f32,
    /// the value as read, "66.9%"
    pub inf: String,
    pub inf_alts: Vec<String>,
    pub inf_cost: f32,
    pub inf_margin: f32,
    /// influence times ten (66.9 % = 669), None when the text is not a value
    pub inf_x10: Option<i32>,
    pub star: bool,
    pub reasons: Vec<&'static str>,
    /// the value as the SECOND (shift tolerant) reading sees it, and whether the two readings agree
    pub inf_b: String,
    pub inf_agree: bool,
    /// two candidate digits that look alike (6 8 9 0 3 5) are close in the value: not clear enough to trust
    pub inf_confusable: bool,
    pub inf_alike: f32,
    /// where the name and the value are in the picture (x0, y0, x1, y1), for the crop shown to the player
    pub name_box: [i64; 4],
    pub inf_box: [i64; 4],
    /// the glyph pictures of the name (without spaces) and of the value: (canvas, width in cap heights), kept in memory for learning from corrections
    pub name_glyphs: Vec<(Vec<u8>, f32)>,
    pub inf_glyphs: Vec<(Vec<u8>, f32)>,
    pub cap_h: f64,
}

#[derive(Clone, Debug, Default)]
pub struct PageRead {
    pub page: Option<u32>,
    pub pages: Option<u32>,
    pub systems: Option<u32>,
    pub rows: Vec<RowRead>,
    pub width: usize,
    pub height: usize,
}

/// brightness threshold (between the cell's background and its peak) for number and label text
const NUM_FRAC: f64 = 0.45;
/// the NAME cell ends this far (x screen height) before the divider: the home system's house icon sits right before it and is no part of any name
const NAME_END: f64 = 0.065;

pub fn segment_screen(img: &Img) -> Option<Screen> {
    let lay = find_layout(img)?;
    let (name_frac, num_frac) = (G_FRAC, NUM_FRAC);
    let hf = lay.h as f64;
    let stars = star_rows(img, &lay, &img.yellow_mask());
    let half = (0.0305 * hf) as i64;
    let name_win = |a: usize, b: usize| { let yc = ((a + b) / 2) as i64; [lay.list_left as i64 + 2, (lay.div_x - NAME_END * hf) as i64, yc - half, yc + half] };
    // pass 1: every name cut by itself. The capital height of a page is one number: rows that disagree with the page's median are cut again with it.
    let first: Vec<Option<Seg>> = lay.rows.iter().map(|&(a, b)| segment_line(img, None, name_win(a, b), hf, name_frac, true)).collect();
    let mut caps: Vec<f64> = first.iter().flatten().map(|s| s.cap_h).collect();
    let page_cap = if caps.len() >= 3 { caps.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal)); Some(caps[caps.len() / 2]) } else { None };
    let mut rows = Vec::new();
    for ((&(a, b), &star), name1) in lay.rows.iter().zip(&stars).zip(first) {
        let name = match (page_cap, &name1) {
            (Some(c), Some(s)) if (s.cap_h - c).abs() > 0.25 * c => segment_line_h(img, None, name_win(a, b), hf, name_frac, true, Some(c)).or(name1),
            _ => name1,
        };
        let pad = (0.004 * hf) as i64;
        let inf = segment_line(img, None, [(lay.div_x + 0.008 * hf) as i64, (lay.div_x + 0.125 * hf) as i64, a as i64 - pad, b as i64 + pad], hf, num_frac, false);
        rows.push(RowSeg { star, name, inf });
    }
    // "PAGE n/m": centred on the list, just under the pager line (the first frame line after the divider)
    let below: Vec<usize> = lay.hlines.iter().filter(|l| l.0 > lay.div_bottom).map(|l| l.0).collect();
    let page = below.first().and_then(|&y| {
        let cx = (lay.list_left + lay.list_right) as f64 / 2.0;
        let y0 = y as i64 + (0.014 * hf) as i64;
        segment_line(img, None, [(cx - 0.12 * hf) as i64, (cx + 0.12 * hf) as i64, y0, y0 + (0.026 * hf) as i64], hf, num_frac, false)
    });
    // "77 SYSTEMS": the line above the first frame line of the list
    let top = lay.hlines[0].0 as i64;
    let systems = segment_line(img, None, [lay.list_left as i64, lay.list_left as i64 + (0.30 * hf) as i64, top - (0.040 * hf) as i64, top - (0.006 * hf) as i64], hf, num_frac, false);
    // (the game's "LAST UPDATED: N MINUTES AGO" is NOT read: it is wrong, the time the screenshot was taken is the only time)
    Some(Screen { lay, rows, page, systems })
}

/// "66.9%" -> 669, only for the exact shape d.d% / dd.d% / ddd.d%
pub fn parse_inf(t: &str) -> Option<i32> {
    let b = t.as_bytes();
    let n = b.len();
    if !(4..=6).contains(&n) || b[n - 1] != b'%' || b[n - 3] != b'.' || !b[n - 2].is_ascii_digit() { return None; }
    if !b[..n - 3].iter().all(|c| c.is_ascii_digit()) { return None; }
    let v: i32 = format!("{}{}", &t[..n - 3], &t[n - 2..n - 1]).parse().ok()?;
    (v <= 1000).then_some(v)
}

/// the digits the font makes look alike: if the best two readings of a value glyph are two of them and the gap is below T_CONFUSABLE, the value is not trusted
pub const T_CONFUSABLE: f32 = 0.06;
const ALIKE: &str = "689035";

/// the smallest gap between the best and the second best character over the glyphs where both are look-alike digits (9 when there is none)
pub fn alike_margin(r: &Recog) -> f32 {
    r.glyphs.iter().filter(|g| g.ch.is_ascii_digit() && ALIKE.contains(g.ch) && g.alt.map_or(false, |(a, _)| a != g.ch && ALIKE.contains(a))).map(|g| g.margin).fold(9.0, f32::min)
}

fn bbox(s: Option<&Seg>) -> [i64; 4] {
    let Some(s) = s else { return [0; 4] };
    let mut b = [i64::MAX, i64::MAX, i64::MIN, i64::MIN];
    for g in &s.glyphs { b = [b[0].min(g.bx[0]), b[1].min(g.bx[1]), b[2].max(g.bx[2]), b[3].max(g.bx[3])]; }
    if s.glyphs.is_empty() { [0; 4] } else { b }
}

fn glyph_data(s: Option<&Seg>) -> Vec<(Vec<u8>, f32)> { s.map_or(vec![], |s| s.glyphs.iter().map(|g| (g.canvas.clone(), g.wrel)).collect()) }

fn digits_only(r: &Recog) -> Option<u32> {
    let t = r.text();
    if !t.is_empty() && t.len() <= 4 && t.chars().all(|c| c.is_ascii_digit()) { t.parse().ok() } else { None }
}

pub fn read_screen(img: &Img, tpl: &Templates) -> Option<PageRead> {
    let sc = segment_screen(img)?;
    let mut rows = Vec::new();
    for r in &sc.rows {
        let nm = recognise(r.name.as_ref(), &tpl.name, FontKind::Name, true, None);
        let inf = recognise(r.inf.as_ref(), &tpl.inf, FontKind::Inf, false, None);
        let inf_text = inf.text();
        let inf_x10 = parse_inf(&inf_text);
        let inf_b = recognise_mode(r.inf.as_ref(), &tpl.inf, FontKind::Inf, false, None, true).text();
        let mut reasons = Vec::new();
        if inf_x10.is_none() { reasons.push("value_shape"); }
        if inf_b != inf_text { reasons.push("value_disagree"); }
        let inf_alike = alike_margin(&inf);
        let inf_confusable = inf_alike < T_CONFUSABLE;
        if inf_confusable { reasons.push("value_confusable"); }
        if nm.chars.is_empty() { reasons.push("no_name"); }
        if nm.conf.max(inf.conf) > T_COST { reasons.push("low_match"); }
        if nm.margin.min(inf.margin) < T_MARGIN { reasons.push("close_second"); }
        rows.push(RowRead {
            name: nm.text(), name_alts: nm.alternatives(3), name_cost: nm.conf, name_margin: nm.margin,
            inf: inf_text, inf_alts: inf.alternatives(3), inf_cost: inf.conf, inf_margin: inf.margin, inf_x10, star: r.star, reasons,
            inf_agree: inf_b == inf.text(), inf_confusable, inf_alike, inf_b, name_box: bbox(r.name.as_ref()), inf_box: bbox(r.inf.as_ref()),
            name_glyphs: glyph_data(r.name.as_ref()), inf_glyphs: glyph_data(r.inf.as_ref()), cap_h: r.name.as_ref().map_or(0.0, |s| s.cap_h),
        });
    }
    let (mut page, mut pages, mut systems) = (None, None, None);
    if let Some(p) = &sc.page {
        // position based: only digits and the slash are read (the word PAGE is skipped: the last word is n/m)
        if let Some(w) = split_words(p).last() {
            let t = recognise_glyphs(w, p.cap_h, &tpl.page, FontKind::Page, false, Some("0123456789/")).text();
            if let Some((a, b)) = t.split_once('/') {
                if let (Ok(a), Ok(b)) = (a.parse::<u32>(), b.parse::<u32>()) { page = Some(a); pages = Some(b); }
            }
        }
    }
    if let Some(s) = &sc.systems {
        if let Some(w) = split_words(s).first() {
            systems = digits_only(&recognise_glyphs(w, s.cap_h, &tpl.name, FontKind::Name, false, Some("0123456789")));
        }
    }
    Some(PageRead { page, pages, systems, rows, width: img.w, height: img.h })
}
