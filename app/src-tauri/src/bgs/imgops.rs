//! BGS Watch, small image tools written by hand (no OpenCV): colour masks, percentile, area and bilinear resize, connected components.
use super::decode::Rgb;

/// The picture with its green plane (the text brightness is read from green).
pub struct Img {
    pub w: usize,
    pub h: usize,
    pub rgb: Vec<u8>,
    pub g: Vec<u8>,
}

impl Img {
    pub fn new(src: Rgb) -> Img {
        let g = src.px.chunks_exact(3).map(|p| p[1]).collect();
        Img { w: src.w, h: src.h, rgb: src.px, g }
    }
    fn mask(&self, f: impl Fn(i32, i32, i32) -> bool) -> Vec<u8> {
        self.rgb.chunks_exact(3).map(|p| f(p[0] as i32, p[1] as i32, p[2] as i32) as u8).collect()
    }
    /// frame lines and the divider: grey-aqua, medium bright
    pub fn line_mask(&self) -> Vec<u8> { self.mask(|r, g, b| g > 90 && b > 90 && (r as f32) < g as f32 * 0.8 && (g - b).abs() < 14) }
    pub fn yellow_mask(&self) -> Vec<u8> { self.mask(|r, g, b| r > 170 && g > 140 && b < 110 && r - b > 90) }
    /// NAME text: aqua (R clearly below G and B), grey sub lines are left out
    pub fn aqua_mask(&self) -> Vec<u8> { self.mask(|r, g, b| g > 105 && b > 105 && (r as f32) < g as f32 * 0.86) }
    pub fn neutral_mask(&self) -> Vec<u8> { self.mask(|r, g, b| r > 50 && (r - g).abs() < 14 && (g - b).abs() < 14) }
    pub fn white_mask(&self) -> Vec<u8> { self.mask(|r, g, b| r > 120 && g > 120 && b > 120 && (r - g).abs() < 24 && (g - b).abs() < 24) }
}

/// numpy's percentile (linear) of 8-bit values given as a histogram
pub fn percentile_hist(hist: &[u32; 256], n: u32, p: f64) -> f64 {
    if n == 0 { return 0.0; }
    let idx = p / 100.0 * (n as f64 - 1.0);
    let (lo, hi) = (idx.floor() as u32, idx.ceil() as u32);
    let at = |k: u32| -> f64 {
        let mut acc = 0u32;
        for (v, c) in hist.iter().enumerate() {
            acc += c;
            if k < acc { return v as f64; }
        }
        255.0
    };
    let (a, b) = (at(lo), at(hi));
    a + (idx - lo as f64) * (b - a)
}

fn weights_area(sw: usize, dw: usize) -> Vec<Vec<(usize, f32)>> {
    let sx = sw as f64 / dw as f64;
    (0..dw).map(|i| {
        let (a, b) = (i as f64 * sx, (i as f64 + 1.0) * sx);
        let mut v = Vec::new();
        let mut j = a.floor() as usize;
        while (j as f64) < b && j < sw {
            let ov = (b.min(j as f64 + 1.0) - a.max(j as f64)).max(0.0);
            if ov > 0.0 { v.push((j, (ov / sx) as f32)); }
            j += 1;
        }
        v
    }).collect()
}

fn weights_linear(sw: usize, dw: usize) -> Vec<Vec<(usize, f32)>> {
    let sx = sw as f64 / dw as f64;
    (0..dw).map(|i| {
        let fx = (i as f64 + 0.5) * sx - 0.5;
        let j0 = fx.floor();
        let f = (fx - j0) as f32;
        let c = |j: f64| (j.max(0.0) as usize).min(sw - 1);
        vec![(c(j0), 1.0 - f), (c(j0 + 1.0), f)]
    }).collect()
}

/// Resizes a float plane to dw x dh: area averaging when `area`, else bilinear (what OpenCV INTER_AREA / INTER_LINEAR do).
pub fn resize(src: &[f32], sw: usize, sh: usize, dw: usize, dh: usize, area: bool) -> Vec<f32> {
    let (wx, wy) = if area { (weights_area(sw, dw), weights_area(sh, dh)) } else { (weights_linear(sw, dw), weights_linear(sh, dh)) };
    let mut tmp = vec![0f32; dw * sh];
    for y in 0..sh {
        for (x, ws) in wx.iter().enumerate() {
            tmp[y * dw + x] = ws.iter().map(|&(j, w)| src[y * sw + j] * w).sum();
        }
    }
    let mut out = vec![0f32; dw * dh];
    for (y, ws) in wy.iter().enumerate() {
        for x in 0..dw {
            out[y * dw + x] = ws.iter().map(|&(j, w)| tmp[j * dw + x] * w).sum();
        }
    }
    out
}

/// 8-connected components of a mask window (w x h). Boxes (x0, y0, x1, y1), x1 and y1 exclusive, area >= min_area, sorted.
pub fn components(mask: &[u8], w: usize, h: usize, min_area: usize) -> Vec<[usize; 4]> {
    let mut seen = vec![false; w * h];
    let mut out = Vec::new();
    let mut stack = Vec::new();
    for s in 0..w * h {
        if mask[s] == 0 || seen[s] { continue; }
        seen[s] = true;
        stack.push(s);
        let (mut x0, mut y0, mut x1, mut y1, mut area) = (w, h, 0usize, 0usize, 0usize);
        while let Some(p) = stack.pop() {
            let (x, y) = (p % w, p / w);
            area += 1;
            x0 = x0.min(x);
            y0 = y0.min(y);
            x1 = x1.max(x + 1);
            y1 = y1.max(y + 1);
            for dy in -1i32..=1 {
                for dx in -1i32..=1 {
                    let (nx, ny) = (x as i32 + dx, y as i32 + dy);
                    if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 { continue; }
                    let q = ny as usize * w + nx as usize;
                    if mask[q] != 0 && !seen[q] {
                        seen[q] = true;
                        stack.push(q);
                    }
                }
            }
        }
        if area >= min_area { out.push([x0, y0, x1, y1]); }
    }
    out.sort();
    out
}

/// start and end (inclusive) of the true runs of a 1-D mask, runs closer than `gap` are joined
pub fn runs(m: &[bool], gap: usize) -> Vec<(usize, usize)> {
    let mut out: Vec<(usize, usize)> = Vec::new();
    for (i, &v) in m.iter().enumerate() {
        if !v { continue; }
        match out.last_mut() {
            Some(l) if i - l.1 <= gap => l.1 = i,
            _ => out.push((i, i)),
        }
    }
    out
}
