//! BGS Watch, the glyph templates: every labelled glyph picture is an exemplar, the answer is the character of the nearest exemplar
//! (squared difference of the canvases, plus a small penalty for a different glyph width in the two text fonts).
//! The bundled file (data/bgs_tpl.bin, made by `cargo test bgs_build_templates -- --ignored`, wrapper tools/bgs_templates.py) holds
//! three fonts: `name` (the UI font), `inf` (monospaced, slashed zero: digits . %) and `page` (digits and slash of PAGE n/m).
use super::glyphs::{Glyph, CH, CW};

/// scales the squared pixel difference (0..1 per pixel) of two canvases to about 0..2 (it was 18 at a cap height of 12, the canvas has 4 times the pixels now)
pub const COST_DIV: f32 = 72.0;
/// extra cost per cap height of glyph width difference (name and page font). The value font is monospaced: its width carries nothing.
pub const WIDTH_W_NAME: f32 = 1.5;
pub const WIDTH_W_INF: f32 = 0.0;
pub const NPIX: usize = CW * CH;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum FontKind { Name, Inf, Page }

#[derive(Default, Clone)]
pub struct Font {
    pub ch: Vec<u8>,
    pub w: Vec<f32>,
    pub canv: Vec<u8>,
}

#[derive(Default, Clone)]
pub struct Templates {
    pub name: Font,
    pub inf: Font,
    pub page: Font,
}

impl Templates {
    pub fn font(&self, k: FontKind) -> &Font { match k { FontKind::Name => &self.name, FontKind::Inf => &self.inf, FontKind::Page => &self.page } }
    pub fn font_mut(&mut self, k: FontKind) -> &mut Font { match k { FontKind::Name => &mut self.name, FontKind::Inf => &mut self.inf, FontKind::Page => &mut self.page } }
    pub fn count(&self) -> usize { self.name.ch.len() + self.inf.ch.len() + self.page.ch.len() }
}

pub fn width_w(k: FontKind) -> f32 { if k == FontKind::Inf { WIDTH_W_INF } else { WIDTH_W_NAME } }

#[inline]
fn sqdist(a: &[u8], b: &[u8]) -> u32 {
    a.iter().zip(b).map(|(&x, &y)| { let d = x as i32 - y as i32; (d * d) as u32 }).sum()
}

impl Font {
    pub fn push(&mut self, ch: u8, w: f32, canvas: &[u8]) {
        self.ch.push(ch);
        self.w.push(w);
        self.canv.extend_from_slice(canvas);
    }
    /// cost of the best exemplar of every character: (char, cost), small = good
    pub fn costs(&self, g: &Glyph, ww: f32) -> Vec<(char, f32)> {
        let mut best = [f32::INFINITY; 128];
        for (i, &c) in self.ch.iter().enumerate() {
            let d = sqdist(&self.canv[i * NPIX..(i + 1) * NPIX], &g.canvas) as f32 / 65025.0 / COST_DIV + ww * (self.w[i] - g.wrel).abs();
            let slot = &mut best[(c & 127) as usize];
            if d < *slot { *slot = d; }
        }
        best.iter().enumerate().filter(|(_, v)| v.is_finite()).map(|(c, &v)| ((c as u8) as char, v)).collect()
    }
}

/// the canvas moved by -1..1 pixel in x and y (9 copies, empty edges are black)
fn shifted(c: &[u8]) -> Vec<Vec<u8>> {
    let mut out = Vec::with_capacity(9);
    for dy in -1i32..=1 {
        for dx in -1i32..=1 {
            let mut o = vec![0u8; NPIX];
            for y in 0..CH as i32 {
                for x in 0..CW as i32 {
                    let (sy, sx) = (y - dy, x - dx);
                    if sy >= 0 && sy < CH as i32 && sx >= 0 && sx < CW as i32 { o[(y * CW as i32 + x) as usize] = c[(sy * CW as i32 + sx) as usize]; }
                }
            }
            out.push(o);
        }
    }
    out
}

impl Font {
    /// The SECOND reading: the same exemplars, but each is compared with the glyph moved by up to one pixel (the best of 9 positions), so a wrong
    /// alignment or sub-pixel phase that tipped the first reading does not tip this one. A different way of being wrong.
    pub fn costs_shift(&self, g: &Glyph, ww: f32) -> Vec<(char, f32)> {
        let sh = shifted(&g.canvas);
        let mut best = [f32::INFINITY; 128];
        for (i, &c) in self.ch.iter().enumerate() {
            let e = &self.canv[i * NPIX..(i + 1) * NPIX];
            let d = sh.iter().map(|s| sqdist(e, s)).min().unwrap_or(u32::MAX) as f32 / 65025.0 / COST_DIV + ww * (self.w[i] - g.wrel).abs();
            let slot = &mut best[(c & 127) as usize];
            if d < *slot { *slot = d; }
        }
        best.iter().enumerate().filter(|(_, v)| v.is_finite()).map(|(c, &v)| ((c as u8) as char, v)).collect()
    }
}

// ---------------------------------------------------------------- the bundled file

const MAGIC: &[u8; 4] = b"BGT1";

pub fn encode(t: &Templates) -> Vec<u8> {
    let mut out = MAGIC.to_vec();
    for f in [&t.name, &t.inf, &t.page] {
        out.extend_from_slice(&(f.ch.len() as u32).to_le_bytes());
        for i in 0..f.ch.len() {
            out.push(f.ch[i]);
            out.extend_from_slice(&((f.w[i] * 1000.0).round().clamp(0.0, 65535.0) as u16).to_le_bytes());
            let c = &f.canv[i * NPIX..(i + 1) * NPIX];
            let mut j = 0;
            while j < NPIX {
                if c[j] != 0 { out.push(c[j]); j += 1; continue; }
                let mut n = 0;
                while j < NPIX && c[j] == 0 && n < 255 { n += 1; j += 1; }
                out.push(0);
                out.push(n as u8);
            }
        }
    }
    out
}

pub fn decode(b: &[u8]) -> Result<Templates, String> {
    let bad = || "the template file is damaged".to_string();
    if b.len() < 4 || &b[..4] != MAGIC { return Err(bad()); }
    let mut p = 4;
    let mut t = Templates::default();
    for k in [FontKind::Name, FontKind::Inf, FontKind::Page] {
        let n = u32::from_le_bytes(b.get(p..p + 4).ok_or_else(bad)?.try_into().map_err(|_| bad())?) as usize;
        p += 4;
        if n > 200_000 { return Err(bad()); }
        let f = t.font_mut(k);
        f.canv.reserve(n * NPIX);
        for _ in 0..n {
            let ch = *b.get(p).ok_or_else(bad)?;
            let w = u16::from_le_bytes(b.get(p + 1..p + 3).ok_or_else(bad)?.try_into().map_err(|_| bad())?) as f32 / 1000.0;
            p += 3;
            let start = f.canv.len();
            while f.canv.len() - start < NPIX {
                let v = *b.get(p).ok_or_else(bad)?;
                p += 1;
                if v != 0 { f.canv.push(v); continue; }
                let c = *b.get(p).ok_or_else(bad)? as usize;
                p += 1;
                if c == 0 || f.canv.len() - start + c > NPIX { return Err(bad()); }
                f.canv.resize(f.canv.len() + c, 0);
            }
            f.ch.push(ch);
            f.w.push(w);
        }
    }
    Ok(t)
}

static BUNDLED: &[u8] = include_bytes!("../../data/bgs_tpl.bin");

/// the bundled templates (decoded once)
pub fn bundled() -> Result<&'static Templates, String> {
    static T: std::sync::OnceLock<Result<Templates, String>> = std::sync::OnceLock::new();
    T.get_or_init(|| decode(BUNDLED)).as_ref().map_err(|e| e.clone())
}
