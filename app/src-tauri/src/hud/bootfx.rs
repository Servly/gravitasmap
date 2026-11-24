//! The windows come on as a hologram does (bootfx.py): a thin bright line opens from the window's middle as a beam, the window unfolds from it
//! flickering with its edges bright, one scan line sweeps down over it, and it is on. About 0.6 s each; the windows start one after another.
//! Pictures are premultiplied RGBA (as the overlay windows take them).
use super::paint::Picture;
use crate::pyval::round;
use std::collections::HashMap;

pub const BOOT_S: f64 = 0.6;
pub const STAGGER: f64 = 0.06;
const LINE_S: f64 = 0.14;
const OPEN_S: f64 = 0.32;
pub const STEPS: i64 = 16;
const GLOW: (u8, u8, u8) = (255, 196, 120);

pub fn ease(p: f64) -> f64 {
    let p = p.clamp(0.0, 1.0);
    1.0 - (1.0 - p).powi(3)
}

/// A hologram finding its signal: unsteady at first, then still.
pub fn flicker(p: f64) -> f64 {
    if p >= 1.0 {
        return 1.0;
    }
    (0.7 + 0.3 * (p * 38.0).sin() * (p * 13.0 + 1.3).sin() + 0.3 * p).clamp(0.25, 1.0)
}

struct Strip {
    w: usize,
    h: usize,
    rgba: Vec<u8>, // premultiplied
    pad: i64,
}

/// A bright line with a soft glow, `length` wide from the middle: a thin strip, and how far its middle is from its top.
fn beam(w: usize, length: f64, thick: i64, alpha: i64) -> Strip {
    let pad = thick * 4;
    let h = (2 * pad) as usize;
    let mut straight = vec![0f32; w * h * 4];
    if length >= 1.0 {
        let (x0, x1) = (w as f64 / 2.0 - length / 2.0, w as f64 / 2.0 + length / 2.0);
        let mut rect = |ya: i64, yb: i64, a: i64| {
            for y in ya.max(0)..=yb.min(h as i64 - 1) {
                for x in (x0.trunc() as i64).max(0)..=(x1.trunc() as i64).min(w as i64 - 1) {
                    let i = (y as usize * w + x as usize) * 4;
                    straight[i..i + 4].copy_from_slice(&[GLOW.0 as f32, GLOW.1 as f32, GLOW.2 as f32, a as f32]);
                }
            }
        };
        rect(pad - thick * 3, pad + thick * 3, alpha / 5);
        rect(pad - thick, pad + thick, alpha);
        straight = blur(&straight, w, h, 1.2); // (Pillow blurs the straight channels one by one: the edges go dark as they fade)
    }
    let mut rgba = vec![0u8; w * h * 4];
    for i in (0..straight.len()).step_by(4) {
        let a = straight[i + 3] / 255.0;
        for c in 0..3 {
            rgba[i + c] = (straight[i + c] * a).round().clamp(0.0, 255.0) as u8;
        }
        rgba[i + 3] = straight[i + 3].round().clamp(0.0, 255.0) as u8;
    }
    Strip { w, h, rgba, pad }
}

fn blur(src: &[f32], w: usize, h: usize, sigma: f64) -> Vec<f32> {
    let r = (sigma * 3.0).ceil() as i64;
    let k: Vec<f32> = (-r..=r).map(|i| (-(i * i) as f64 / (2.0 * sigma * sigma)).exp() as f32).collect();
    let sum: f32 = k.iter().sum();
    let k: Vec<f32> = k.iter().map(|v| v / sum).collect();
    let mut tmp = vec![0f32; src.len()];
    for y in 0..h {
        for x in 0..w {
            for c in 0..4 {
                let mut a = 0.0;
                for (i, kv) in k.iter().enumerate() {
                    let xx = (x as i64 + i as i64 - r).clamp(0, w as i64 - 1) as usize;
                    a += kv * src[(y * w + xx) * 4 + c];
                }
                tmp[(y * w + x) * 4 + c] = a;
            }
        }
    }
    let mut out = vec![0f32; src.len()];
    for y in 0..h {
        for x in 0..w {
            for c in 0..4 {
                let mut a = 0.0;
                for (i, kv) in k.iter().enumerate() {
                    let yy = (y as i64 + i as i64 - r).clamp(0, h as i64 - 1) as usize;
                    a += kv * tmp[(yy * w + x) * 4 + c];
                }
                out[(y * w + x) * 4 + c] = a;
            }
        }
    }
    out
}

/// The strip laid over `out` with its middle at height y (clipped at the edges): source-over on premultiplied pixels.
fn put(out: &mut [u8], ow: usize, oh: usize, s: &Strip, y: f64) {
    let top = round(y) - s.pad;
    for sy in 0..s.h as i64 {
        let oy = top + sy;
        if oy < 0 || oy >= oh as i64 {
            continue;
        }
        for x in 0..s.w.min(ow) {
            let si = (sy as usize * s.w + x) * 4;
            let oi = (oy as usize * ow + x) * 4;
            let sa = s.rgba[si + 3] as u32;
            for c in 0..4 {
                out[oi + c] = (s.rgba[si + c] as u32 + out[oi + c] as u32 * (255 - sa) / 255).min(255) as u8;
            }
        }
    }
}

/// The window's picture t seconds into its boot: (picture bytes, alpha 0..1), or None when it is on. k: its speed.
pub fn frame(pic: &Picture, t: f64, k: f64) -> Option<(Vec<u8>, usize, usize, f64)> {
    let t = t / k;
    if t >= BOOT_S {
        return None;
    }
    if t < 0.0 {
        return Some((vec![0, 0, 0, 0], 1, 1, 0.0));
    }
    let (w, h) = (pic.w as usize, pic.h as usize);
    let cy = h as f64 / 2.0;
    let mut out = vec![0u8; w * h * 4];
    if t < LINE_S {
        put(&mut out, w, h, &beam(w, w as f64 * ease(t / LINE_S), 2, 255), cy);
        return Some((out, w, h, 1.0));
    }
    if t < LINE_S + OPEN_S {
        let p = (t - LINE_S) / OPEN_S;
        let band = (round(h as f64 * ease(p))).max(2);
        let top = round(cy - band as f64 / 2.0);
        for y in top.max(0)..(top + band).min(h as i64) {
            let (a, b) = ((y as usize * w) * 4, (y as usize * w + w) * 4);
            out[a..b].copy_from_slice(&pic.rgba[a..b]);
        }
        let edge = beam(w, w as f64, 1, 200);
        put(&mut out, w, h, &edge, top as f64);
        put(&mut out, w, h, &edge, (top + band) as f64);
        return Some((out, w, h, flicker(p)));
    }
    let p = (t - LINE_S - OPEN_S) / (BOOT_S - LINE_S - OPEN_S);
    out.copy_from_slice(&pic.rgba);
    put(&mut out, w, h, &beam(w, w as f64, 1, round(160.0 * (1.0 - p))), h as f64 * ease(p));
    Some((out, w, h, 1.0))
}

/// The boots under way: which window starts when, and its picture as made so far (one picture per step).
pub struct Boot {
    pub t0: f64,
    pub k: f64,
    start: HashMap<String, f64>,
    made: HashMap<String, (i64, Option<(Vec<u8>, usize, usize, f64)>)>,
}

impl Boot {
    /// `order`: each window and when it starts (seconds after t0).
    pub fn new(t0: f64, order: Vec<(String, f64)>, k: f64) -> Boot {
        Boot { t0, k, start: order.into_iter().collect(), made: HashMap::new() }
    }

    pub fn done(&self, now: f64) -> bool {
        now - self.t0 > self.start.values().cloned().fold(0.0, f64::max) + BOOT_S * self.k
    }

    /// The picture and alpha for this window now, or None once it is on (or it was not there when the boot began).
    pub fn picture(&mut self, key: &str, pic: &Picture, now: f64) -> Option<(Vec<u8>, usize, usize, f64)> {
        let start = *self.start.get(key)?;
        let t = now - self.t0 - start;
        if t >= BOOT_S * self.k {
            return None;
        }
        let step = if t < 0.0 { -1 } else { (t / (BOOT_S * self.k) * STEPS as f64) as i64 };
        let fresh = self.made.get(key).map(|(s, _)| *s != step).unwrap_or(true);
        if fresh {
            let f = frame(pic, if step >= 0 { (step as f64 + 0.5) / STEPS as f64 * BOOT_S } else { -1.0 }, 1.0);
            self.made.insert(key.to_string(), (step, f));
        }
        self.made.get(key).and_then(|(_, f)| f.clone())
    }

    /// Forget a window's made picture (its own picture changed).
    pub fn forget(&mut self, key: &str) {
        self.made.remove(key);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::host::parity::golden_dir;
    use serde_json::Value;

    #[test]
    fn boot_frames_match_the_plugin() {
        let dir = golden_dir();
        let Ok(t) = std::fs::read_to_string(dir.join("boot_golden.json")) else { println!("SKIP"); return };
        let frames: Vec<Value> = serde_json::from_str(&t).unwrap();
        let (mut n, mut none_ok, mut worst, mut sum, mut bad) = (0, 0, 0f64, 0f64, Vec::new());
        for f in &frames {
            let src = tiny_skia::Pixmap::load_png(dir.join("../out/scene").join(f["src"].as_str().unwrap())).unwrap();
            let pic = Picture { w: src.width(), h: src.height(), x: 0, y: 0, rgba: src.data().to_vec() };
            let got = frame(&pic, f["t"].as_f64().unwrap(), f["k"].as_f64().unwrap());
            if f.get("none").is_some() {
                if got.is_none() { none_ok += 1; } else { bad.push(format!("{} t {} k {}: the plugin has none", f["src"], f["t"], f["k"])); }
                continue;
            }
            let Some((px, w, h, a)) = got else { bad.push(format!("{} t {}: none, plugin has a frame", f["src"], f["t"])); continue };
            if (a - f["alpha"].as_f64().unwrap()).abs() > 1e-9 { bad.push(format!("{} t {}: alpha {a} vs {}", f["src"], f["t"], f["alpha"])); }
            let theirs = tiny_skia::Pixmap::load_png(dir.join("../out/boot").join(f["png"].as_str().unwrap())).unwrap();
            if (w, h) != (theirs.width() as usize, theirs.height() as usize) { bad.push(format!("{} t {}: size {w}x{h} vs {}x{}", f["src"], f["t"], theirs.width(), theirs.height())); continue }
            let mean = px.iter().zip(theirs.data()).map(|(a, b)| (*a as f64 - *b as f64).abs()).sum::<f64>() / px.len() as f64;
            n += 1; sum += mean; worst = worst.max(mean);
            if mean > 1.5 { bad.push(format!("{} t {} k {}: pixels differ by {mean:.2}", f["src"], f["t"], f["k"])); }
        }
        println!("boot: {n} frames + {none_ok} 'on' equal in kind, mean pixel difference {:.3}/255, worst {worst:.2}, {} problems", sum / n.max(1) as f64, bad.len());
        assert!(bad.is_empty(), "{}", bad.iter().take(6).cloned().collect::<Vec<_>>().join("\n"));
    }
}
