//! BGS Watch, building the templates from the hand-read screenshots. Tests only (never in the shipped app).
//! Ground truth: research/bgs/gt.json (77 rows read by hand), pictures: inbox/bgs/1440 and inbox/bgs/1080 (8 BMP pages each).
//! Every labelled glyph of every page, also of rescaled copies of the pages, is a sample. A fold (leave one page out) builds templates from the other pages.
use super::decode::{decode_file, Rgb};
use super::glyphs::Seg;
use super::imgops::{resize, Img};
use super::reader::segment_screen;
use super::tpl::{width_w, FontKind, Templates, COST_DIV, NPIX};
use serde_json::Value;
use std::path::PathBuf;

pub const DEDUPE: f32 = 0.05;
/// synthetic sizes: none of them is a size used by the unseen-size test (720p 900p 1800p 2160p)
pub fn aug_scales(res: &str) -> &'static [f64] { if res != "1080" { &[0.7, 0.85, 1.0, 1.1] } else { &[0.8, 0.9, 1.0, 1.2, 1.4] } }

pub fn root() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("..") }

pub struct Gt { pub pages: Vec<Vec<(String, String)>> }

pub fn load_gt() -> Option<Gt> {
    let t = std::fs::read_to_string(root().join("research/bgs/gt.json")).ok()?;
    let v: Value = serde_json::from_str(&t).ok()?;
    let pages = v["pages"].as_array()?.iter().map(|p| p.as_array().unwrap().iter().map(|r| (r["name"].as_str().unwrap().to_string(), r["inf"].as_str().unwrap().to_string())).collect()).collect();
    Some(Gt { pages })
}

/// the 8 pages of one size, None when the folder is not there
pub fn load_pages(res: &str) -> Option<Vec<Rgb>> {
    let d = root().join("inbox/bgs").join(res);
    let mut files: Vec<_> = std::fs::read_dir(&d).ok()?.filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| p.extension().map_or(false, |x| x == "bmp")).collect();
    files.sort();
    if files.len() != 8 { return None; }
    files.iter().map(|f| decode_file(f).ok()).collect()
}

fn cubic_w(t: f64) -> [f64; 4] {
    let a = -0.75;
    let f = |x: f64| { let x = x.abs(); if x <= 1.0 { ((a + 2.0) * x - (a + 3.0)) * x * x + 1.0 } else if x < 2.0 { (((x - 5.0) * x + 8.0) * x - 4.0) * a } else { 0.0 } };
    [f(1.0 + t), f(t), f(1.0 - t), f(2.0 - t)]
}

/// a picture rescaled by a factor: area averaging down, bicubic up (like OpenCV)
pub fn rescale(src: &Rgb, f: f64) -> Rgb {
    if f == 1.0 { return Rgb { w: src.w, h: src.h, px: src.px.clone() }; }
    let (dw, dh) = (((src.w as f64 * f).round()) as usize, ((src.h as f64 * f).round()) as usize);
    let mut px = vec![0u8; dw * dh * 3];
    for c in 0..3 {
        let plane: Vec<f32> = src.px.iter().skip(c).step_by(3).map(|&v| v as f32).collect();
        let out = if f < 1.0 { resize(&plane, src.w, src.h, dw, dh, true) } else { cubic(&plane, src.w, src.h, dw, dh) };
        for (i, v) in out.iter().enumerate() { px[i * 3 + c] = v.round().clamp(0.0, 255.0) as u8; }
    }
    Rgb { w: dw, h: dh, px }
}

fn cubic(src: &[f32], sw: usize, sh: usize, dw: usize, dh: usize) -> Vec<f32> {
    let taps = |s: usize, d: usize| -> Vec<[(usize, f32); 4]> {
        let sx = s as f64 / d as f64;
        (0..d).map(|i| {
            let fx = (i as f64 + 0.5) * sx - 0.5;
            let j = fx.floor();
            let w = cubic_w(fx - j);
            let mut t = [(0usize, 0f32); 4];
            for k in 0..4 { t[k] = (((j as i64 - 1 + k as i64).clamp(0, s as i64 - 1)) as usize, w[k] as f32); }
            t
        }).collect()
    };
    let (tx, ty) = (taps(sw, dw), taps(sh, dh));
    let mut tmp = vec![0f32; dw * sh];
    for y in 0..sh { for x in 0..dw { tmp[y * dw + x] = tx[x].iter().map(|&(j, w)| src[y * sw + j] * w).sum(); } }
    let mut out = vec![0f32; dw * dh];
    for y in 0..dh { for x in 0..dw { out[y * dw + x] = ty[y].iter().map(|&(j, w)| tmp[j * dw + x] * w).sum(); } }
    out
}

#[derive(Clone)]
pub struct Sample { pub font: FontKind, pub ch: u8, pub canvas: Vec<u8>, pub w: f32, pub page: usize }

fn add(out: &mut Vec<Sample>, seg: &Option<Seg>, text: &str, font: FontKind, page: usize) -> bool {
    let Some(s) = seg else { return false };
    if s.glyphs.len() != text.len() { return false; }
    for (g, c) in s.glyphs.iter().zip(text.bytes()) { out.push(Sample { font, ch: c, canvas: g.canvas.clone(), w: g.wrel, page }); }
    true
}

/// every labelled glyph of the given sizes and their scales. Lines whose glyph count differs from the truth are skipped (counted in the second value).
pub fn collect(sizes: &[(&str, &Vec<Rgb>)], gt: &Gt) -> (Vec<Sample>, usize) {
    let mut out = Vec::new();
    let mut skipped = 0;
    for (res, pages) in sizes { collect_pages(res, pages, &gt.pages, 0, &mut out, &mut skipped); }
    (out, skipped)
}

/// the pages of 26 Nov (research/bgs/today), page tags 9..16, as more training samples (empty when the files are not here)
pub fn collect_today() -> Vec<Sample> {
    let Some(t) = super::tests4::load_today() else { return vec![] };
    let Some(imgs) = super::tests4::load_today_images(&t) else { return vec![] };
    let gt: Vec<Vec<(String, String)>> = t.pages.iter().map(|p| p.1.clone()).collect();
    let (mut out, mut skipped) = (Vec::new(), 0);
    collect_pages("today", &imgs, &gt, 8, &mut out, &mut skipped);
    out
}

fn collect_pages(res: &str, pages: &[Rgb], gt: &[Vec<(String, String)>], offset: usize, out: &mut Vec<Sample>, skipped: &mut usize) {
    for (pi, base) in pages.iter().enumerate() {
        let tag = pi + 1 + offset;
        for &fac in aug_scales(res) {
            let img = Img::new(rescale(base, fac));
            let Some(sc) = segment_screen(&img) else { *skipped += 1; continue };
            for (r, (name, inf)) in sc.rows.iter().zip(&gt[pi]) {
                if !add(out, &r.name, &name.replace(' ', ""), FontKind::Name, tag) { *skipped += 1; }
                if !add(out, &r.inf, inf, FontKind::Inf, tag) { *skipped += 1; }
            }
            // the page label (digits and slash in their own font, PAGE in the name font) and the systems count
            if let Some(p) = &sc.page {
                let t = format!("PAGE{}/8", pi + 1);
                if p.glyphs.len() == t.len() {
                    for (g, c) in p.glyphs.iter().zip(t.bytes()) {
                        let font = if c.is_ascii_digit() || c == b'/' { FontKind::Page } else { FontKind::Name };
                        out.push(Sample { font, ch: c, canvas: g.canvas.clone(), w: g.wrel, page: tag });
                    }
                } else { *skipped += 1; }
            }
            if !add(out, &sc.systems, "77SYSTEMS", FontKind::Name, tag) { *skipped += 1; }
        }
    }
}

fn dist(a: &Sample, b: &(Vec<u8>, f32), ww: f32) -> f32 {
    let s: u32 = a.canvas.iter().zip(&b.0).map(|(&x, &y)| { let d = x as i32 - y as i32; (d * d) as u32 }).sum();
    s as f32 / 65025.0 / COST_DIV + ww * (a.w - b.1).abs()
}

/// templates from the samples of every page except `skip` (None = all pages). A sample closer than DEDUPE to a kept one of the same character is dropped.
pub fn build(samples: &[Sample], skip: Option<usize>) -> Templates {
    let mut t = Templates::default();
    let mut kept: std::collections::HashMap<(u8, u8), Vec<(Vec<u8>, f32)>> = Default::default();
    for s in samples.iter().filter(|s| Some(s.page) != skip) {
        let k = (s.font as u8, s.ch);
        let list = kept.entry(k).or_default();
        let ww = width_w(s.font);
        if list.iter().any(|c| dist(s, c, ww) < DEDUPE) { continue; }
        list.push((s.canvas.clone(), s.w));
        t.font_mut(s.font).push(s.ch, (s.w * 1000.0).round() / 1000.0, &s.canvas);
    }
    debug_assert!(t.name.canv.len() == t.name.ch.len() * NPIX);
    t
}
