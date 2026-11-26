//! BGS Watch, a small picture of a cell the reader doubts, so the player sees what the reader saw. Made in memory for one answer as a PNG data URL,
//! never written to a file, never kept.
use super::imgops::{resize, Img};

const MAX_W: f64 = 192.0;
const MAX_H: f64 = 32.0;

pub fn b64(data: &[u8]) -> String {
    const A: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut s = String::with_capacity(data.len().div_ceil(3) * 4);
    for c in data.chunks(3) {
        let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        s.push(A[(n >> 18) as usize & 63] as char);
        s.push(A[(n >> 12) as usize & 63] as char);
        s.push(if c.len() > 1 { A[(n >> 6) as usize & 63] as char } else { '=' });
        s.push(if c.len() > 2 { A[n as usize & 63] as char } else { '=' });
    }
    s
}

/// the box (x0, y0, x1, y1) with some margin, scaled down to at most 192 x 32 pixels, as "data:image/png;base64,..."
pub fn crop_png(img: &Img, b: [i64; 4], cap_h: f64) -> Option<String> {
    if b[2] <= b[0] || b[3] <= b[1] { return None; }
    let pad = (0.35 * cap_h).max(2.0) as i64;
    let x0 = (b[0] - pad).clamp(0, img.w as i64) as usize;
    let x1 = (b[2] + pad).clamp(0, img.w as i64) as usize;
    let y0 = (b[1] - pad).clamp(0, img.h as i64) as usize;
    let y1 = (b[3] + pad).clamp(0, img.h as i64) as usize;
    if x1 <= x0 + 1 || y1 <= y0 + 1 { return None; }
    let (w, h) = (x1 - x0, y1 - y0);
    let s = (MAX_W / w as f64).min(MAX_H / h as f64).min(2.0);
    let (dw, dh) = (((w as f64 * s).round() as usize).max(1), ((h as f64 * s).round() as usize).max(1));
    let mut pm = tiny_skia::Pixmap::new(dw as u32, dh as u32)?;
    let mut planes = Vec::new();
    for c in 0..3 {
        let mut p = Vec::with_capacity(w * h);
        for y in y0..y1 { for x in x0..x1 { p.push(img.rgb[(y * img.w + x) * 3 + c] as f32); } }
        planes.push(resize(&p, w, h, dw, dh, s < 1.0));
    }
    for (i, px) in pm.data_mut().chunks_exact_mut(4).enumerate() {
        px[0] = planes[0][i].round().clamp(0.0, 255.0) as u8;
        px[1] = planes[1][i].round().clamp(0.0, 255.0) as u8;
        px[2] = planes[2][i].round().clamp(0.0, 255.0) as u8;
        px[3] = 255;
    }
    let png = pm.encode_png().ok()?;
    Some(format!("data:image/png;base64,{}", b64(&png)))
}
