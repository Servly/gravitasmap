//! BGS Watch, small image tools written by hand (no OpenCV): colour masks, percentile, area and bilinear resize, connected components.
use super::decode::Rgb;

/// The picture with ONE grey plane. Everything the reader sees comes from this plane after auto-levels (dark and bright ends stretched to 0..255),
/// so the colour of the player's HUD, the gamma and the brightness of the screen do not matter. The plane is the brightest of R, G, B (text stays bright in
/// ANY HUD colour). `rgb` is kept only for the star icon (informative).
pub struct Img {
    pub w: usize,
    pub h: usize,
    pub rgb: Vec<u8>,
    pub g: Vec<u8>,
}

/// stretches the 2nd percentile to 0 and the 99.95th to 255 (a flat picture is left as it is)
fn auto_levels(raw: &[u8]) -> Vec<u8> {
    let mut h = [0u32; 256];
    for &v in raw { h[v as usize] += 1; }
    let n = raw.len() as u32;
    let (lo, hi) = (percentile_hist(&h, n, 2.0), percentile_hist(&h, n, 99.95));
    if hi - lo < 8.0 { return raw.to_vec(); }
    let k = 255.0 / (hi - lo);
    raw.iter().map(|&v| ((v as f64 - lo) * k).clamp(0.0, 255.0).round() as u8).collect()
}

impl Img {
    pub fn new(src: Rgb) -> Img {
        let raw: Vec<u8> = src.px.chunks_exact(3).map(|p| p[0].max(p[1]).max(p[2])).collect();
        let g = auto_levels(&raw);
        Img { w: src.w, h: src.h, rgb: src.px, g }
    }

    /// Thin bright strips (frame lines, the divider): the pixel is brighter than both sides at distance `o` by more than `t`.
    /// `vertical` looks left and right (finds vertical lines), else up and down. Colour free.
    pub fn ridge(&self, vertical: bool, o: usize, t: i32) -> Vec<u8> {
        let (w, h) = (self.w, self.h);
        let mut out = vec![0u8; w * h];
        if w <= 2 * o || h <= 2 * o { return out; }
        for y in 0..h {
            for x in 0..w {
                let (a, b) = if vertical {
                    if x < o || x + o >= w { continue; }
                    (self.g[y * w + x - o] as i32, self.g[y * w + x + o] as i32)
                } else {
                    if y < o || y + o >= h { continue; }
                    (self.g[(y - o) * w + x] as i32, self.g[(y + o) * w + x] as i32)
                };
                if self.g[y * w + x] as i32 - (a + b) / 2 > t { out[y * w + x] = 1; }
            }
        }
        out
    }
    pub fn yellow_mask(&self) -> Vec<u8> { self.rgb.chunks_exact(3).map(|p| { let (r, g, b) = (p[0] as i32, p[1] as i32, p[2] as i32); (r > 170 && g > 140 && b < 110 && r - b > 90) as u8 }).collect() }
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
