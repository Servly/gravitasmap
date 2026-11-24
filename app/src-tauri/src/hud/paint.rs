//! A window's pieces painted as one picture, as hud.py's picture()/replay()/pil_text() do for a flat window: drawn 4 times as fine,
//! brought down smoothly, with the game's soft glow round the lines and letters (a blurred copy at 80 %, under it).
use super::pieces::{Piece, Shape};
use super::planes::P2;
use ab_glyph::{Font, FontVec, PxScale, ScaleFont};
use std::sync::OnceLock;
use tiny_skia::{FillRule, Paint, PathBuilder, Pixmap, Stroke, Transform};

const SS: f64 = 4.0;

pub struct Picture {
    pub w: u32,
    pub h: u32,
    /// where its top left goes, in the game window's pixels
    pub x: i32,
    pub y: i32,
    /// premultiplied-alpha RGBA
    pub rgba: Vec<u8>,
}

fn rgb(c: &str) -> Option<(u8, u8, u8)> {
    let h = c.strip_prefix('#')?;
    Some((u8::from_str_radix(h.get(0..2)?, 16).ok()?, u8::from_str_radix(h.get(2..4)?, 16).ok()?, u8::from_str_radix(h.get(4..6)?, 16).ok()?))
}

fn paint_of(c: (u8, u8, u8), a: u8) -> Paint<'static> {
    let mut p = Paint::default();
    p.set_color_rgba8(c.0, c.1, c.2, a);
    p.anti_alias = true;
    p
}

/// The font a piece's text is drawn in: the game-style files, or (a language they lack letters for) Bahnschrift as hud.py's pil_font does.
fn face(bold: bool, wide: bool, fallback: bool) -> &'static FontVec {
    static F: OnceLock<[FontVec; 5]> = OnceLock::new();
    let f = F.get_or_init(|| {
        let win = std::env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".into());
        let load = |files: &[&str], own: &'static [u8]| -> FontVec {
            for f in files {
                if let Ok(d) = std::fs::read(std::path::Path::new(&win).join("Fonts").join(f)) {
                    if let Ok(v) = FontVec::try_from_vec(d) { return v; }
                }
            }
            FontVec::try_from_vec(own.to_vec()).unwrap()
        };
        [
            FontVec::try_from_vec(include_bytes!("../../fonts/GravitasHud-Regular.ttf").to_vec()).unwrap(),
            FontVec::try_from_vec(include_bytes!("../../fonts/GravitasHud-Bold.ttf").to_vec()).unwrap(),
            load(&["bahnschrift.ttf", "segoeui.ttf"], include_bytes!("../../fonts/GravitasHud-Regular.ttf")),
            load(&["bahnschrift.ttf", "segoeuib.ttf"], include_bytes!("../../fonts/GravitasHud-Bold.ttf")),
            FontVec::try_from_vec(include_bytes!("../../fonts/GravitasHudWide-Regular.ttf").to_vec()).unwrap(),
        ]
    });
    if fallback { &f[if bold { 3 } else { 2 }] } else if wide { &f[4] } else { &f[if bold { 1 } else { 0 }] }
}

fn scale_for(font: &FontVec, px: f64) -> PxScale {
    let h = font.ascent_unscaled() - font.descent_unscaled();
    PxScale::from((px * h as f64 / font.units_per_em().unwrap_or(1000.0) as f64) as f32)
}

fn width_of(font: &FontVec, px: f64, s: &str) -> f64 {
    let sc = font.as_scaled(scale_for(font, px));
    let mut prev: Option<ab_glyph::GlyphId> = None;
    s.chars().map(|c| {
        let id = sc.glyph_id(c);
        let k = prev.map(|p| sc.kern(p, id) as f64).unwrap_or(0.0); // (FreeType's basic layout in Pillow kerns pairs)
        prev = Some(id);
        sc.h_advance(id) as f64 + k
    }).sum()
}

#[allow(clippy::too_many_arguments)]
fn draw_text(pm: &mut Pixmap, x0: f64, y0: f64, p: &Shape, fallback: bool) {
    let Shape::Text { x, y, s, size, bold, wide, fill, anchor, wrap } = p else { return };
    let Some(col) = rgb(fill) else { return };
    if s.is_empty() { return; }
    let font = face(*bold, *wide, fallback);
    let px = super::font::tk_px(*size) * SS;
    let mut lines: Vec<String> = Vec::new();
    for para in s.split('\n') {
        if *wrap <= 0.0 { lines.push(para.to_string()); continue; }
        let room = wrap * SS;
        let mut cur = String::new();
        for word in para.split(' ') {
            let t = if cur.is_empty() { word.to_string() } else { format!("{cur} {word}") };
            if !cur.is_empty() && width_of(font, px, &t) > room { lines.push(std::mem::take(&mut cur)); cur = word.to_string(); } else { cur = t; }
        }
        lines.push(cur);
    }
    let sc = font.as_scaled(scale_for(font, px));
    let mut lh = (sc.ascent() - sc.descent()).ceil() as f64;
    if fallback {
        // the card was laid out for the game-style font's line height: kept (hud.py pil_text)
        let own = face(*bold, false, false);
        let osc = own.as_scaled(scale_for(own, px));
        lh = lh.max((osc.ascent() - osc.descent()).ceil() as f64);
    }
    let (x, y) = ((x - x0) * SS, (y - y0) * SS);
    let total = lh * lines.len() as f64;
    let top = if anchor.starts_with('n') { y } else if anchor.starts_with('s') { y - total } else { y - total / 2.0 };
    for (n, line) in lines.iter().enumerate() {
        let w = width_of(font, px, line);
        let left = if *anchor == "center" || *anchor == "n" || *anchor == "s" { x - w / 2.0 } else if anchor.contains('e') { x - w } else { x };
        let base = top + n as f64 * lh + sc.ascent() as f64;
        let mut cx = left;
        let mut prev: Option<ab_glyph::GlyphId> = None;
        for ch in line.chars() {
            let id = sc.glyph_id(ch);
            if let Some(p) = prev { cx += sc.kern(p, id) as f64; }
            prev = Some(id);
            let g = id.with_scale_and_position(scale_for(font, px), ab_glyph::point(cx as f32, base as f32));
            if let Some(o) = font.outline_glyph(g) {
                let b = o.px_bounds();
                o.draw(|gx, gy, c| {
                    let (ix, iy) = (b.min.x as i32 + gx as i32, b.min.y as i32 + gy as i32);
                    if ix < 0 || iy < 0 || ix >= pm.width() as i32 || iy >= pm.height() as i32 || c <= 0.0 { return; }
                    let i = (iy as u32 * pm.width() + ix as u32) as usize * 4;
                    let d = pm.data_mut();
                    let a = (c.min(1.0) * 255.0) as u32;
                    for (k, v) in [col.0, col.1, col.2].iter().enumerate() {
                        d[i + k] = ((*v as u32 * a + d[i + k] as u32 * (255 - a)) / 255) as u8;
                    }
                    d[i + 3] = (a + d[i + 3] as u32 * (255 - a) / 255) as u8;
                });
            }
            cx += sc.h_advance(id) as f64;
        }
    }
}

fn blur(rgba: &mut [u8], w: usize, h: usize, sigma: f64) {
    let r = (sigma * 3.0).ceil() as i32;
    let k: Vec<f32> = (-r..=r).map(|i| (-(i * i) as f64 / (2.0 * sigma * sigma)).exp() as f32).collect();
    let sum: f32 = k.iter().sum();
    let k: Vec<f32> = k.iter().map(|v| v / sum).collect();
    let mut tmp = vec![0f32; w * h * 4];
    let row_on: Vec<bool> = (0..h).map(|y| rgba[y * w * 4..(y + 1) * w * 4].iter().any(|v| *v != 0)).collect();
    for y in 0..h {
        if !row_on[y] { continue; }
        for x in 0..w {
            for c in 0..4 {
                let mut a = 0.0;
                for (i, kv) in k.iter().enumerate() {
                    let xx = x as i32 + i as i32 - r;
                    if xx >= 0 && (xx as usize) < w { a += kv * rgba[(y * w + xx as usize) * 4 + c] as f32; }
                }
                tmp[(y * w + x) * 4 + c] = a;
            }
        }
    }
    for y in 0..h {
        let (lo, hi) = ((y as i32 - r).max(0) as usize, (y as i32 + r).min(h as i32 - 1) as usize);
        if !row_on[lo..=hi].iter().any(|b| *b) { continue; }
        for x in 0..w {
            for c in 0..4 {
                let mut a = 0.0;
                for (i, kv) in k.iter().enumerate() {
                    let yy = y as i32 + i as i32 - r;
                    if yy >= 0 && (yy as usize) < h { a += kv * tmp[(yy as usize * w + x) * 4 + c]; }
                }
                rgba[(y * w + x) * 4 + c] = a.round().min(255.0) as u8;
            }
        }
    }
}

/// Draws a picture made elsewhere (mapcap.rs) into the output straight from its own pixels: every output pixel asks where it comes from (the same bend as the rest of the window)
/// and takes one bilinear sample there. Premultiplied, over what is there.
fn image_pass(out: &mut [u8], ow: usize, oh: usize, inv: &[f64; 9], org: (f64, f64), r: (f64, f64, f64, f64), id: u64) {
    let Some(sh) = crate::mapcap::current().filter(|c| c.id == id) else { return };
    let (iw, ih) = (sh.w as i64, sh.h as i64);
    let (kx, ky) = (iw as f64 / r.2.max(1.0), ih as f64 / r.3.max(1.0));
    let src = &sh.rgba;
    let at = |x: i64, y: i64, c: usize| -> f32 { src[((y.clamp(0, ih - 1) * iw + x.clamp(0, iw - 1)) as usize) * 4 + c] as f32 };
    let ss = SS as usize;
    for y in 0..oh {
        for x in 0..ow {
            let (u, v) = super::planes::apply(inv, (x * ss) as f64 + ss as f64 / 2.0, (y * ss) as f64 + ss as f64 / 2.0);
            let (fx, fy) = (((u / SS + org.0) - r.0) * kx - 0.5, ((v / SS + org.1) - r.1) * ky - 0.5);
            if fx < -0.5 || fy < -0.5 || fx > iw as f64 - 0.5 || fy > ih as f64 - 0.5 { continue; }
            let (ix, iy) = (fx.floor() as i64, fy.floor() as i64);
            let (ax, ay) = ((fx - ix as f64) as f32, (fy - iy as f64) as f32);
            let mut c4 = [0f32; 4];
            for c in 0..4 { c4[c] = at(ix, iy, c) * (1.0 - ax) * (1.0 - ay) + at(ix + 1, iy, c) * ax * (1.0 - ay) + at(ix, iy + 1, c) * (1.0 - ax) * ay + at(ix + 1, iy + 1, c) * ax * ay; }
            let a = c4[3] / 255.0;
            let o = (y * ow + x) * 4;
            for c in 0..4 { out[o + c] = (c4[c] + out[o + c] as f32 * (1.0 - a)).round().clamp(0.0, 255.0) as u8; }
        }
    }
}

/// One window as a picture. `b` is the window's box (the pieces' bbox without the ground), `s` its scale.
pub fn picture(pieces: &[Piece], b: (f64, f64, f64, f64), dst: &[P2; 4], s: f64, fallback: bool) -> Option<Picture> {
    picture_with(pieces, b, dst, s, fallback, 190)
}

/// The same, with the dark ground's own see-through level (alpha 0..255, 190 is the plugin's).
pub fn picture_with(pieces: &[Piece], b: (f64, f64, f64, f64), dst: &[P2; 4], s: f64, fallback: bool, ground_a: u8) -> Option<Picture> {
    let (x0, y0) = (b.0 - 2.0, b.1 - 2.0);
    let (w, h) = ((b.2 - x0 + 3.0) as u32, (b.3 - y0 + 3.0) as u32);
    let mut pm = Pixmap::new(w * SS as u32, h * SS as u32)?;
    let t = Transform::identity();
    for p in pieces.iter().filter(|p| !p.glow) {
        match &p.shape {
            Shape::Poly { pts, fill, outline, width, stipple } if pts.len() >= 6 => {
                let mut pb = PathBuilder::new();
                for (i, c) in pts.chunks(2).enumerate() {
                    let (px, py) = (((c[0] - x0) * SS) as f32, ((c[1] - y0) * SS) as f32);
                    if i == 0 { pb.move_to(px, py) } else { pb.line_to(px, py) }
                }
                pb.close();
                let Some(path) = pb.finish() else { continue };
                if let Some(c) = rgb(fill) { pm.fill_path(&path, &paint_of(c, if *stipple { ground_a } else { 255 }), FillRule::Winding, t, None); }
                if let Some(c) = rgb(outline) {
                    let st = Stroke { width: (width * SS).max(1.0) as f32, ..Stroke::default() };
                    pm.stroke_path(&path, &paint_of(c, 255), &st, t, None);
                }
            }
            Shape::Line { pts, fill, width } if pts.len() >= 4 => {
                let Some(c) = rgb(fill) else { continue };
                let mut pb = PathBuilder::new();
                pb.move_to(((pts[0] - x0) * SS) as f32, ((pts[1] - y0) * SS) as f32);
                pb.line_to(((pts[2] - x0) * SS) as f32, ((pts[3] - y0) * SS) as f32);
                let Some(path) = pb.finish() else { continue };
                let st = Stroke { width: (width * SS).max(1.0) as f32, ..Stroke::default() };
                pm.stroke_path(&path, &paint_of(c, 255), &st, t, None);
            }
            Shape::Text { .. } => draw_text(&mut pm, x0, y0, &p.shape, fallback),
            Shape::Image { .. } => {} // (warped straight from its own pixels after the rest, see `image_pass`)
            _ => {}
        }
    }
    // Bent so that the picture's corners (the box plus 2 px round it) go to dst, brought down to size smoothly (hud.py picture): for a
    // flat window dst is the box itself, so it comes out a little smaller (about 1 %), and that is how the plugin's windows look.
    let pad = (4.0 * s).round().max(2.0) as i64;
    let minx = dst.iter().map(|p| p.0).fold(f64::MAX, f64::min);
    let miny = dst.iter().map(|p| p.1).fold(f64::MAX, f64::min);
    let maxx = dst.iter().map(|p| p.0).fold(f64::MIN, f64::max);
    let maxy = dst.iter().map(|p| p.1).fold(f64::MIN, f64::max);
    let (ox, oy) = (minx.trunc() as i64 - pad, miny.trunc() as i64 - pad);
    let (ow, oh) = ((maxx.trunc() as i64 - ox + pad + 2).max(1) as usize, (maxy.trunc() as i64 - oy + pad + 2).max(1) as usize);
    if (ow * oh) > 40_000_000 { return None; }
    let (sw, sh) = (pm.width() as f64, pm.height() as f64);
    let d4: Vec<P2> = dst.iter().map(|p| ((p.0 - ox as f64) * SS, (p.1 - oy as f64) * SS)).collect();
    let inv = super::planes::homography(&d4, &[(0.0, 0.0), (sw, 0.0), (sw, sh), (0.0, sh)])?;
    let src = pm.data();
    let (swi, shi) = (pm.width() as i64, pm.height() as i64);
    let px = |x: i64, y: i64, c: usize| -> f32 { if x < 0 || y < 0 || x >= swi || y >= shi { 0.0 } else { src[((y * swi + x) as usize) * 4 + c] as f32 } };
    let mut small = vec![0u8; ow * oh * 4];
    let ss = SS as usize;
    // which 16 x 16 blocks of the supersampled picture hold anything: a pixel whose neighbourhood is empty is empty (a card with a picture in it is mostly empty)
    const BLK: i64 = 16;
    let (bw, bh) = ((swi + BLK - 1) / BLK, (shi + BLK - 1) / BLK);
    let mut busy = vec![false; (bw * bh) as usize];
    for y in 0..shi {
        let row = &src[(y * swi * 4) as usize..((y + 1) * swi * 4) as usize];
        for bx in 0..bw {
            if busy[(y / BLK * bw + bx) as usize] { continue; }
            let (a, z) = ((bx * BLK * 4) as usize, (((bx + 1) * BLK).min(swi) * 4) as usize);
            if row[a..z].iter().skip(3).step_by(4).any(|v| *v != 0) { busy[(y / BLK * bw + bx) as usize] = true; }
        }
    }
    let near_busy = |u: f64, v: f64| -> bool {
        let (bx, by) = ((u / BLK as f64).floor() as i64, (v / BLK as f64).floor() as i64);
        for yy in by - 1..=by + 1 { for xx in bx - 1..=bx + 1 { if xx >= 0 && yy >= 0 && xx < bw && yy < bh && busy[(yy * bw + xx) as usize] { return true; } } }
        false
    };
    for y in 0..oh {
        for x in 0..ow {
            { let (u, v) = super::planes::apply(&inv, (x * ss) as f64 + ss as f64 / 2.0, (y * ss) as f64 + ss as f64 / 2.0); if !near_busy(u, v) { continue; } }
            let mut acc = [0f32; 4];
            for dy in 0..ss {
                for dx in 0..ss {
                    let (u, v) = super::planes::apply(&inv, (x * ss + dx) as f64 + 0.5, (y * ss + dy) as f64 + 0.5);
                    let (u, v) = (u - 0.5, v - 0.5);
                    let (iu, iv) = (u.floor() as i64, v.floor() as i64);
                    let (fu, fv) = ((u - iu as f64) as f32, (v - iv as f64) as f32);
                    for c in 0..4 {
                        acc[c] += px(iu, iv, c) * (1.0 - fu) * (1.0 - fv) + px(iu + 1, iv, c) * fu * (1.0 - fv) + px(iu, iv + 1, c) * (1.0 - fu) * fv + px(iu + 1, iv + 1, c) * fu * fv;
                    }
                }
            }
            let o = (y * ow + x) * 4;
            for c in 0..4 { small[o + c] = (acc[c] / (ss * ss) as f32).round().min(255.0) as u8; }
        }
    }
    let mut glow = small.clone();
    blur(&mut glow, ow, oh, (2.6 * s).max(1.2));
    for v in glow.iter_mut() { *v = (*v as f32 * 0.8) as u8; }
    // a picture made elsewhere (the System map) lies between the glow and the pieces over it
    for p in pieces.iter().filter(|p| !p.glow) {
        if let Shape::Image { x, y, w, h, id } = &p.shape {
            image_pass(&mut glow, ow, oh, &inv, (x0, y0), (*x, *y, *w, *h), *id);
        }
    }
    // the picture over its glow (premultiplied)
    for i in (0..small.len()).step_by(4) {
        let a = small[i + 3] as u32;
        for c in 0..4 { glow[i + c] = (small[i + c] as u32 + glow[i + c] as u32 * (255 - a) / 255).min(255) as u8; }
    }
    Some(Picture { w: ow as u32, h: oh as u32, x: ox as i32, y: oy as i32, rgba: glow })
}
