//! BGS Watch, cutting a text line into glyphs and turning each glyph into a small cap-height-normalised picture (the thing that is matched).
use super::imgops::{components, percentile_hist, resize, Img};

/// the cap height is drawn this many pixels tall on the canvas, the canvas is CW x CH
pub const CAP: usize = 24;
pub const CW: usize = 36;
pub const CH: usize = 40;
pub const TOP_PAD: f64 = 6.0;
pub const G_FRAC: f64 = 0.45;

pub struct Glyph {
    pub canvas: Vec<u8>,
    /// glyph width in cap heights
    pub wrel: f32,
    /// x0, y0, x1, y1 in the picture (x1, y1 exclusive)
    pub bx: [i64; 4],
}

pub struct Seg {
    pub glyphs: Vec<Glyph>,
    pub cap_h: f64,
    pub cap_top: f64,
}

fn median(v: &mut Vec<f64>) -> f64 {
    v.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let n = v.len();
    if n % 2 == 1 { v[n / 2] } else { (v[n / 2 - 1] + v[n / 2]) / 2.0 }
}

fn hist_of(vals: impl Iterator<Item = u8>) -> ([u32; 256], u32) {
    let mut h = [0u32; 256];
    let mut n = 0;
    for v in vals { h[v as usize] += 1; n += 1; }
    (h, n)
}

/// background and ink peak of a window (20th and 99.7th percentile of green)
fn line_bg_peak(img: &Img, x0: usize, x1: usize, y0: usize, y1: usize) -> (f64, f64) {
    let (h, n) = hist_of((y0..y1).flat_map(|y| img.g[y * img.w + x0..y * img.w + x1].iter().copied()));
    (percentile_hist(&h, n, 20.0), percentile_hist(&h, n, 99.7))
}

/// the tallest thing that may be a letter (x screen height). The biggest letter measured on 69 real pages is 0.0111, the house icon of the home system is 0.028.
pub const MAX_LETTER_H: f64 = 0.015;
/// the capital height always lies in this band (x screen height): a measuring that leaves it is clamped
pub const CAP_BAND: (f64, f64) = (0.009, 0.0135);

fn ink_mask(img: &Img, mask: Option<&[u8]>, win: (usize, usize, usize, usize), frac: f64, bg: f64, peak: f64) -> Vec<u8> {
    let (x0, x1, y0, y1) = win;
    let (ww, wh) = (x1 - x0, y1 - y0);
    let mut sub = vec![0u8; ww * wh];
    for y in 0..wh {
        for x in 0..ww {
            let i = (y0 + y) * img.w + x0 + x;
            let mut on = mask.map_or(true, |m| m[i] != 0);
            if on && frac > 0.0 { on = img.g[i] as f64 > bg + frac * (peak - bg); }
            sub[y * ww + x] = on as u8;
        }
    }
    sub
}

fn boxes_of(sub: &[u8], win: (usize, usize, usize, usize), hf: f64) -> Vec<[i64; 4]> {
    let (x0, x1, y0, y1) = win;
    let min_area = (((0.0025 * hf).powi(2)) as usize).max(2);
    components(sub, x1 - x0, y1 - y0, min_area).into_iter()
        .map(|b| [b[0] as i64 + x0 as i64, b[1] as i64 + y0 as i64, b[2] as i64 + x0 as i64, b[3] as i64 + y0 as i64]).collect()
}

/// The NAME line of a row. Everything the window sees is sorted first: a box taller than a letter (an icon, the house of the home system) is not text,
/// and when a row holds two text lines (the home system has "SYSTEM OF ORIGIN" under its name) the TOP line is the name. Colour is never asked.
fn name_line(boxes: Vec<[i64; 4]>, hf: f64) -> Vec<[i64; 4]> {
    let mut letters: Vec<[i64; 4]> = boxes.into_iter().filter(|b| (b[3] - b[1]) as f64 <= MAX_LETTER_H * hf).collect();
    if letters.is_empty() { return letters; }
    letters.sort_by(|a, b| (a[1] + a[3]).cmp(&(b[1] + b[3])));
    let mut hs: Vec<f64> = letters.iter().map(|b| (b[3] - b[1]) as f64).collect();
    let capref = median(&mut hs);
    let mut lines: Vec<Vec<[i64; 4]>> = vec![vec![letters[0]]];
    for b in letters.into_iter().skip(1) {
        let c = (b[1] + b[3]) as f64 / 2.0;
        let l = lines.last().unwrap();
        let lc = l.iter().map(|z| (z[1] + z[3]) as f64 / 2.0).sum::<f64>() / l.len() as f64;
        if c - lc > 0.6 * capref { lines.push(vec![b]); } else { lines.last_mut().unwrap().push(b); }
    }
    let mut top = lines.swap_remove(0);
    top.sort();
    top
}

/// two letters that touch make one box clearly wider than a capital is tall
fn merged_sign(boxes: &[[i64; 4]]) -> bool {
    if boxes.is_empty() { return false; }
    let mut hs: Vec<f64> = boxes.iter().map(|b| (b[3] - b[1]) as f64).collect();
    let cap = median(&mut hs);
    boxes.iter().any(|b| (b[2] - b[0]) as f64 > 1.5 * cap)
}

/// Cuts one text line (window x0..x1, y0..y1, clamped to the picture) into glyphs. `mask` (optional) narrows what counts as ink, `g_frac` is the brightness
/// threshold between the window's background and its peak. `name` = a NAME cell: icons and a second text line are sorted out, touching letters are
/// separated by a stricter threshold, hyphens are peeled. `cap_hint` = the capital height the other rows of the page agree on.
pub fn segment_line(img: &Img, mask: Option<&[u8]>, win: [i64; 4], hf: f64, g_frac: f64, name: bool) -> Option<Seg> { segment_line_h(img, mask, win, hf, g_frac, name, None) }

pub fn segment_line_h(img: &Img, mask: Option<&[u8]>, win: [i64; 4], hf: f64, g_frac: f64, peel: bool, cap_hint: Option<f64>) -> Option<Seg> {
    let x0 = win[0].clamp(0, img.w as i64) as usize;
    let x1 = win[1].clamp(0, img.w as i64) as usize;
    let y0 = win[2].clamp(0, img.h as i64) as usize;
    let y1 = win[3].clamp(0, img.h as i64) as usize;
    if x1 <= x0 + 2 || y1 <= y0 + 2 { return None; }
    let w = (x0, x1, y0, y1);
    let (ww, _wh) = (x1 - x0, y1 - y0);
    let (bg, peak) = line_bg_peak(img, x0, x1, y0, y1);
    let mut sub = ink_mask(img, mask, w, g_frac, bg, peak);
    let mut boxes = boxes_of(&sub, w, hf);
    if peel {
        boxes = name_line(boxes, hf);
        if g_frac > 0.0 {
            // letters that touch (bright or blooming screens): try stricter thresholds, keep the first that has no merged-looking box and loses at most one blob
            for f in [0.50, 0.55, 0.62, 0.70] {
                if !merged_sign(&boxes) { break; }
                let s2 = ink_mask(img, mask, w, f, bg, peak);
                let b2 = name_line(boxes_of(&s2, w, hf), hf);
                if b2.len() + 1 >= boxes.len() { boxes = b2; sub = s2; } else { break; }
            }
        }
    }
    if boxes.is_empty() { return None; }
    let hs: Vec<i64> = boxes.iter().map(|b| b[3] - b[1]).collect();
    let maxh = *hs.iter().max()? as f64;
    // names: the tallest group (capitals). Other cells (numbers, labels) may hold a separator bar taller than the letters ("77 SYSTEMS | 77 CONTROLLED"),
    // so there the typical height (75th percentile) decides and the group is the boxes close to it.
    let tall: Vec<&[i64; 4]> = if peel {
        boxes.iter().zip(&hs).filter(|(_, &h)| h as f64 >= 0.7 * maxh).map(|(b, _)| b).collect()
    } else {
        let mut sh: Vec<i64> = hs.clone();
        sh.sort_unstable();
        let r = sh[(0.75 * (sh.len() - 1) as f64).round() as usize] as f64;
        boxes.iter().zip(&hs).filter(|(_, &h)| (h as f64) >= 0.8 * r && (h as f64) <= 1.3 * r).map(|(b, _)| b).collect()
    };
    let mut cap_h = median(&mut tall.iter().map(|b| (b[3] - b[1]) as f64).collect());
    let cap_top = median(&mut tall.iter().map(|b| b[1] as f64).collect());
    if peel {
        cap_h = cap_h.clamp(CAP_BAND.0 * hf, CAP_BAND.1 * hf);
        if let Some(c) = cap_hint { if (cap_h - c).abs() > 0.25 * c { cap_h = c; } }
    }
    let mut boxes = boxes;
    if peel { restore_faint_hyphens(img, mask, w, hf, &mut boxes, cap_top, cap_h, bg, peak); }
    let boxes = if peel { peel_hyphens(&sub, ww, &boxes, x0 as i64, y0 as i64, cap_top, cap_h) } else { boxes };
    let mut glyphs = Vec::with_capacity(boxes.len());
    for (i, bx) in boxes.iter().enumerate() {
        let lnb = if i > 0 { Some(boxes[i - 1][2]) } else { None };
        let rnb = boxes.get(i + 1).map(|b| b[0]);
        let canvas = glyph_canvas(img, bx, cap_top, cap_h, peak, lnb, rnb);
        glyphs.push(Glyph { canvas, wrel: ((bx[2] - bx[0]) as f64 / cap_h) as f32, bx: *bx });
    }
    Some(Seg { glyphs, cap_h, cap_top })
}

/// A dark or very bright screen can lose a hyphen (thin and dim): "B22-5" would be read "B22 5" and shown as sure. A second, much lower threshold finds
/// such strokes again. Only a mark of hyphen size (short, thin, at mid height of the capitals, clear of every letter box) is taken back.
#[allow(clippy::too_many_arguments)]
fn restore_faint_hyphens(img: &Img, mask: Option<&[u8]>, win: (usize, usize, usize, usize), hf: f64, boxes: &mut Vec<[i64; 4]>, cap_top: f64, cap_h: f64, bg: f64, peak: f64) {
    if boxes.len() < 2 { return; }
    let low = ink_mask(img, mask, win, 0.25, bg, peak);
    let (mid_a, mid_b) = (cap_top + 0.25 * cap_h, cap_top + 0.75 * cap_h);
    let mut add: Vec<[i64; 4]> = Vec::new();
    for b in boxes_of(&low, win, hf) {
        let (w, h) = ((b[2] - b[0]) as f64, (b[3] - b[1]) as f64);
        let cy = (b[1] + b[3]) as f64 / 2.0;
        if h < 0.08 * cap_h || h > 0.30 * cap_h || w < 0.25 * cap_h || w > 0.70 * cap_h || cy < mid_a || cy > mid_b { continue; }
        // clear of every letter (a gap between two letters, not part of a thickened stroke)
        if boxes.iter().any(|l| b[0] < l[2] + 1 && l[0] < b[2] + 1 && b[1] < l[3] && l[1] < b[3]) { continue; }
        let left = boxes.iter().any(|l| l[2] <= b[0] && b[0] - l[2] <= (0.6 * cap_h) as i64 + 1);
        let right = boxes.iter().any(|l| l[0] >= b[2] && l[0] - b[2] <= (0.6 * cap_h) as i64 + 1);
        if left && right { add.push(b); }
    }
    if !add.is_empty() { boxes.extend(add); boxes.sort(); }
}

/// A hyphen can touch the next glyph. A hyphen is ink only in the middle band of the line, so columns at the END of a blob that carry ink only
/// inside that band are cut off as their own glyph.
fn peel_hyphens(sub: &[u8], ww: usize, boxes: &[[i64; 4]], x0: i64, y0: i64, cap_top: f64, cap_h: f64) -> Vec<[i64; 4]> {
    let mut out: Vec<[i64; 4]> = Vec::new();
    let b0 = (cap_top + 0.38 * cap_h).round_ties_even() as i64 - y0;
    let b1 = (cap_top + 0.66 * cap_h).round_ties_even() as i64 - y0;
    let min_run = ((0.18 * cap_h).round_ties_even() as i64).max(2);
    for &[ax, ay, bx, by] in boxes {
        if ((bx - ax) as f64) < 0.6 * cap_h { out.push([ax, ay, bx, by]); continue; }
        let n = (bx - ax) as usize;
        let ink_at = |x: usize, y: i64| sub[(ay - y0 + y) as usize * ww + (ax - x0) as usize + x] != 0;
        let rows = (by - ay) as usize;
        let mut stub = vec![false; n];
        for (x, s) in stub.iter_mut().enumerate() {
            let (mut ink, mut outside) = (false, false);
            for y in 0..rows as i64 {
                if ink_at(x, y) {
                    ink = true;
                    let r = ay - y0 + y;
                    if !(r >= b0 && r < b1) { outside = true; }
                }
            }
            *s = ink && !outside;
        }
        let left = stub.iter().take_while(|&&s| s).count() as i64;
        let right = stub.iter().rev().take_while(|&&s| s).count() as i64;
        let ni = n as i64;
        let mut cuts: Vec<(i64, i64)> = Vec::new();
        if min_run <= left && left as f64 <= 0.7 * cap_h && left < ni - 1 { cuts.push((0, left)); }
        if min_run <= right && right as f64 <= 0.7 * cap_h && right < ni - 1 && ni - right > left { cuts.push((ni - right, ni)); }
        if cuts.is_empty() { out.push([ax, ay, bx, by]); continue; }
        let ybounds = |ca: i64, cb: i64| -> (i64, i64) {
            let (mut lo, mut hi) = (i64::MAX, i64::MIN);
            for y in 0..rows as i64 {
                if (ca..cb).any(|x| ink_at(x as usize, y)) { lo = lo.min(y); hi = hi.max(y); }
            }
            (lo, hi)
        };
        let (mut keep_a, mut keep_b) = (0i64, ni);
        for &(ca, cb) in &cuts {
            let (lo, hi) = ybounds(ca, cb);
            out.push([ax + ca, ay + lo, ax + cb, ay + hi + 1]);
            if ca == 0 { keep_a = cb } else { keep_b = ca }
        }
        let (lo, hi) = ybounds(keep_a, keep_b);
        if lo <= hi { out.push([ax + keep_a, ay + lo, ax + keep_b, ay + hi + 1]); }
    }
    out.sort();
    out
}

/// cap-height-normalised soft glyph on the fixed canvas, 0..255
fn glyph_canvas(img: &Img, b: &[i64; 4], cap_top: f64, cap_h: f64, peak: f64, left_nb: Option<i64>, right_nb: Option<i64>) -> Vec<u8> {
    let mut canvas = vec![0u8; CW * CH];
    let ya0 = (b[1] - 1).max(0);
    let mut xa0 = (b[0] - 1).max(0);
    let mut xb0 = b[2] + 1;
    if let Some(l) = left_nb { xa0 = xa0.max((l + b[0] + 1).div_euclid(2)); }
    if let Some(r) = right_nb { xb0 = xb0.min((b[2] + r).div_euclid(2)); }
    let xb0 = xb0.min(img.w as i64);
    let yb0 = (b[3] + 1).min(img.h as i64);
    if xa0 >= xb0 || ya0 >= yb0 { return canvas; }
    let (cw, chh) = ((xb0 - xa0) as usize, (yb0 - ya0) as usize);
    let (h, n) = hist_of((ya0 as usize..yb0 as usize).flat_map(|y| img.g[y * img.w + xa0 as usize..y * img.w + xb0 as usize].iter().copied()));
    let floor = percentile_hist(&h, n, 10.0);
    let den = (peak - floor).max(1.0);
    let mut ink = Vec::with_capacity(cw * chh);
    for y in ya0 as usize..yb0 as usize {
        for x in xa0 as usize..xb0 as usize { ink.push((((img.g[y * img.w + x] as f64 - floor) / den).clamp(0.0, 1.0)) as f32); }
    }
    let s = CAP as f64 / cap_h;
    let nw = ((cw as f64 * s).round_ties_even() as usize).clamp(1, 4 * CW);
    let nh = ((chh as f64 * s).round_ties_even() as usize).clamp(1, 4 * CH);
    let r = resize(&ink, cw, chh, nw, nh, s < 1.0);
    let ty = (TOP_PAD + (ya0 as f64 - cap_top) * s).round_ties_even() as i64;
    let tx = ((CW as f64 - nw as f64) / 2.0).round_ties_even() as i64;
    for y in 0..nh as i64 {
        let cy = ty + y;
        if cy < 0 || cy >= CH as i64 { continue; }
        for x in 0..nw as i64 {
            let cx = tx + x;
            if cx < 0 || cx >= CW as i64 { continue; }
            canvas[cy as usize * CW + cx as usize] = (r[y as usize * nw + x as usize] * 255.0).round_ties_even().clamp(0.0, 255.0) as u8;
        }
    }
    canvas
}
