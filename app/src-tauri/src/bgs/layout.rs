//! BGS Watch, layout of the Squadron > Faction screen found from its structure. Every size is a fraction of the screen height H
//! (the UI is a centred 16:9 area that scales with H), nothing is a pixel constant.
use super::imgops::{percentile_hist, runs, Img};

pub struct Layout {
    pub h: usize,
    pub div_x: f64,
    pub div_top: usize,
    pub div_bottom: usize,
    pub list_left: usize,
    pub list_right: usize,
    /// (y, x_left, x_right) of the long horizontal frame lines that cross the divider
    pub hlines: Vec<(usize, usize, usize)>,
    /// (y_top, y_bottom) of every list row
    pub rows: Vec<(usize, usize)>,
    pub title_line: Option<(usize, usize, usize)>,
}

fn game_x0(w: usize, h: usize) -> f64 { ((w as f64 - h as f64 * 16.0 / 9.0) / 2.0).max(0.0) }

/// the long vertical line between NAME and INF: (x, y_top, y_bottom)
fn find_divider(img: &Img, line: &[u8]) -> Option<(f64, usize, usize)> {
    let (w, h) = (img.w, img.h);
    let x0 = game_x0(w, h);
    let w16 = h as f64 * 16.0 / 9.0;
    let (lo, hi) = ((x0 + 0.28 * w16) as usize, ((x0 + 0.52 * w16) as usize).min(w));
    if lo >= hi { return None; }
    let k = ((0.30 * h as f64) as usize).max(5);
    // morphological opening with a vertical line = the runs of at least k pixels
    let mut opened = vec![vec![false; h]; hi - lo];
    let mut cols = vec![0usize; hi - lo];
    for (ci, x) in (lo..hi).enumerate() {
        let mut y = 0;
        while y < h {
            if line[y * w + x] == 0 { y += 1; continue; }
            let s = y;
            while y < h && line[y * w + x] != 0 { y += 1; }
            if y - s >= k {
                for yy in s..y { opened[ci][yy] = true; }
                cols[ci] += y - s;
            }
        }
    }
    let max = *cols.iter().max()?;
    if max == 0 { return None; }
    let c = cols.iter().position(|&v| v == max)?;
    let ys: Vec<usize> = (0..h).filter(|&y| opened[c][y]).collect();
    let xs: Vec<usize> = (0..cols.len()).filter(|&i| cols[i] as f64 >= max as f64 * 0.8 && (i as i64 - c as i64).abs() <= 4).collect();
    let mean = xs.iter().sum::<usize>() as f64 / xs.len() as f64;
    Some((lo as f64 + mean, *ys.first()?, *ys.last()?))
}

/// long horizontal frame lines that cross the divider column: (y, x_left, x_right)
fn find_hlines(img: &Img, line: &[u8], div_x: f64) -> Vec<(usize, usize, usize)> {
    let (w, h) = (img.w, img.h);
    let k = ((0.30 * h as f64) as usize).max(5);
    let dx = (div_x.round_ties_even() as usize).min(w - 1);
    let mut hit: Vec<(usize, usize, usize)> = Vec::new();
    for y in 0..h {
        if line[y * w + dx] == 0 { continue; }
        let (mut a, mut b) = (dx, dx);
        while a > 0 && line[y * w + a - 1] != 0 { a -= 1; }
        while b + 1 < w && line[y * w + b + 1] != 0 { b += 1; }
        if b - a + 1 >= k { hit.push((y, a, b)); }
    }
    let mut groups: Vec<Vec<(usize, usize, usize)>> = Vec::new();
    for e in hit {
        match groups.last_mut() {
            Some(g) if e.0 - g.last().unwrap().0 <= 2 => g.push(e),
            _ => groups.push(vec![e]),
        }
    }
    groups.iter().map(|g| {
        let mean = g.iter().map(|e| e.0).sum::<usize>() as f64 / g.len() as f64;
        let mid = g[g.len() / 2];
        (mean.round_ties_even() as usize, mid.1, mid.2)
    }).collect()
}

/// How the frame lines are looked for: the ridge distance (x screen height) and the contrast the line must have against both sides (on the auto-levelled plane).
/// A real list page is always found: the first try is the sharp one, then the search relaxes (softer lines, a wider or narrower line) until a plausible list appears.
const LADDER: &[(f64, i32)] = &[(0.005, 14), (0.005, 9), (0.0035, 9), (0.007, 9), (0.005, 6), (0.0035, 6), (0.007, 6), (0.004, 4), (0.006, 4)];

pub fn find_layout(img: &Img) -> Option<Layout> {
    let (w, h) = (img.w, img.h);
    if h < 300 || w < 400 { return None; }
    for &(of, t) in LADDER {
        if let Some(l) = layout_try(img, of, t) { if l.rows.len() >= 3 { return Some(l); } }
    }
    None
}

fn layout_try(img: &Img, of: f64, ridge_t: i32) -> Option<Layout> {
    let (w, h) = (img.w, img.h);
    let o = ((of * h as f64).round() as usize).max(2);
    let line_v = img.ridge(true, o, ridge_t);
    let div = find_divider(img, &line_v)?;
    drop(line_v);
    let line_h = img.ridge(false, o, ridge_t);
    let hl_all = find_hlines(img, &line_h, div.0);
    drop(line_h);
    // The ridge divider starts under the NAME | INF header: the first frame line at or below its top is the line under that header,
    // the one before it is the top of the list and the one before that (if any) is the title underline.
    let i0 = hl_all.iter().position(|l| l.0 as i64 >= div.1 as i64 - 2)?;
    // Which line is the one under the NAME | INF header depends on where the divider was seen to start (a soft picture runs it through the header).
    // Both candidates are tried and the one whose rows are evenly spaced wins (a header text read as a row breaks the pitch).
    let mut first: Option<Layout> = None;
    for shift in [1usize, 0] {
        if i0 < shift || (shift == 1 && i0 < 1) { continue; }
        let hl: Vec<_> = hl_all[i0 - shift..].to_vec();
        if hl.len() < 3 { continue; }
        // the title underline is the widest line above the list (the text over it can break a thin line into pieces)
        let above = hl_all.len() - hl.len();
        let title_line = hl_all[..above.saturating_sub(1)].iter().max_by_key(|l| l.2 - l.1).copied();
        let list_left = hl.iter().map(|l| l.1).min()?;
        let list_right = hl.iter().map(|l| l.2).max()?;
        let head_bottom = hl[1].0;
        let rows = list_rows(img, div, head_bottom);
        let lay = Layout { h, div_x: div.0, div_top: div.1, div_bottom: div.2, list_left, list_right, hlines: hl, rows, title_line };
        if lay.rows.len() >= 3 && even_pitch(&lay.rows) { return Some(lay); }
        if first.is_none() && lay.rows.len() >= 3 { first = Some(lay); }
    }
    first
}

/// the rows are as far apart as the median pitch, give or take 8 %
fn even_pitch(rows: &[(usize, usize)]) -> bool {
    let mut p: Vec<f64> = rows.windows(2).map(|w| w[1].0 as f64 - w[0].0 as f64).collect();
    if p.is_empty() { return true; }
    p.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let m = p[p.len() / 2];
    p.iter().all(|&x| (x - m).abs() <= 0.08 * m)
}

/// the list rows: ink in the number column under the header line
fn list_rows(img: &Img, div: (f64, usize, usize), head_bottom: usize) -> Vec<(usize, usize)> {
    let (w, h) = (img.w, img.h);
    let hf = h as f64;
    let xa = ((div.0 + 0.008 * hf) as usize).min(w);
    let xb = ((div.0 + 0.125 * hf) as usize).min(w);
    let (ya, yb) = ((head_bottom + 2).min(h), div.2.min(h));
    if yb <= ya || xb <= xa { return Vec::new(); }
    // the number column: any pixel clearly brighter than the column's own background counts as ink (no colour rule)
    let mut hist = [0u32; 256];
    for y in ya..yb { for &v in &img.g[y * w + xa..y * w + xb] { hist[v as usize] += 1; } }
    let n = ((yb - ya) * (xb - xa)) as u32;
    let (bg, pk) = (percentile_hist(&hist, n, 20.0), percentile_hist(&hist, n, 99.7));
    let thr = bg + 0.35 * (pk - bg);
    let mut proj = vec![false; yb - ya];
    for (i, y) in (ya..yb).enumerate() {
        proj[i] = img.g[y * w + xa..y * w + xb].iter().filter(|&&v| v as f64 > thr).take(3).count() >= 3;   // a few bright pixels, not one noise speck
    }
    let mut rows = Vec::new();
    for (a, b) in runs(&proj, (0.006 * hf) as usize) {
        let (a, b) = (a + ya, b + ya);
        let len = (b - a + 1) as f64;
        if 0.008 * hf <= len && len <= 0.04 * hf { rows.push((a, b)); }
    }
    rows
}

/// True per row when a yellow star icon sits in the row (informative only)
pub fn star_rows(img: &Img, lay: &Layout, yellow: &[u8]) -> Vec<bool> {
    let hf = lay.h as f64;
    let xa = ((lay.div_x + 0.10 * hf) as usize).min(img.w);
    let xb = lay.list_right.min(img.w).max(xa);
    let reach = (0.03 * hf) as usize;
    lay.rows.iter().map(|&(a, b)| {
        let yc = (a + b) / 2;
        let (y0, y1) = (yc.saturating_sub(reach), (yc + reach).min(img.h));
        let mut n = 0usize;
        for y in y0..y1 { n += yellow[y * img.w + xa..y * img.w + xb].iter().filter(|&&v| v != 0).count(); }
        n as f64 > (0.01 * hf).powi(2) * 2.0
    }).collect()
}
