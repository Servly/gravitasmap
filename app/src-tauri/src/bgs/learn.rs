//! BGS Watch, learning from the player's corrections: when the player fixes a cell, the small shapes of the glyphs that were read wrong are kept
//! (cap-24 canvases of 36 x 40 grey values with their character, a few hundred bytes each, NO pictures) in bgs_learned.bin in the app's data folder,
//! and merged into the templates at the next scan. A setting turns it off, Forget removes the file.
use super::tpl::{decode, encode, width_w, FontKind, Templates, COST_DIV, NPIX};
use std::path::{Path, PathBuf};

/// at most this many learned shapes per font (about 1.5 KB each before compression)
pub const MAX_PER_FONT: usize = 400;
const DEDUPE: f32 = 0.05;

pub fn path(dir: &Path) -> PathBuf { dir.join("bgs_learned.bin") }

/// the learned shapes (empty when there is no file). A file that cannot be read is kept as .bad-<time> and ignored.
pub fn load(dir: &Path) -> Templates {
    let p = path(dir);
    crate::store::restore(&p);
    let Ok(b) = std::fs::read(&p) else { return Templates::default() };
    match decode(&b) {
        Ok(t) => t,
        Err(_) => {
            let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
            let _ = std::fs::copy(&p, dir.join(format!("bgs_learned.bin.bad-{secs}")));
            let _ = std::fs::remove_file(&p);
            Templates::default()
        }
    }
}

pub fn save(dir: &Path, t: &Templates) -> bool {
    let _ = std::fs::create_dir_all(dir);
    let p = path(dir);
    let tmp = dir.join("bgs_learned.bin.tmp");
    if std::fs::write(&tmp, encode(t)).is_err() { return false; }
    if std::fs::rename(&tmp, &p).is_err() { let _ = std::fs::remove_file(&tmp); return false; }
    crate::store::mirror(&p);
    true
}

pub fn forget(dir: &Path) {
    let p = path(dir);
    let _ = std::fs::remove_file(&p);
    crate::store::unmirror(&p);
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.filter_map(|e| e.ok()) {
            if e.file_name().to_string_lossy().starts_with("bgs_learned.bin.") { let _ = std::fs::remove_file(e.path()); }
        }
    }
}

pub fn count(t: &Templates) -> usize { t.count() }

/// the bundled templates plus the learned ones
pub fn merged(base: &Templates, learned: &Templates) -> Templates {
    let mut t = base.clone();
    for k in [FontKind::Name, FontKind::Inf, FontKind::Page] {
        let l = learned.font(k);
        let f = t.font_mut(k);
        f.ch.extend_from_slice(&l.ch);
        f.w.extend_from_slice(&l.w);
        f.canv.extend_from_slice(&l.canv);
    }
    t
}

/// adds one shape unless the same character already has a learned shape that close to it, or the font is full
pub fn add(learned: &mut Templates, kind: FontKind, ch: char, w: f32, canvas: &[u8]) -> bool {
    if !ch.is_ascii() || canvas.len() != NPIX { return false; }
    let ww = width_w(kind);
    let f = learned.font_mut(kind);
    if f.ch.len() >= MAX_PER_FONT { return false; }
    for i in 0..f.ch.len() {
        if f.ch[i] != ch as u8 { continue; }
        let s: u32 = f.canv[i * NPIX..(i + 1) * NPIX].iter().zip(canvas).map(|(&a, &b)| { let d = a as i32 - b as i32; (d * d) as u32 }).sum();
        if s as f32 / 65025.0 / COST_DIV + ww * (f.w[i] - w).abs() < DEDUPE { return false; }
    }
    f.push(ch as u8, (w * 1000.0).round() / 1000.0, canvas);
    true
}

/// The glyphs of a corrected cell: where the character the reader gave differs from the one the player confirmed, that glyph's shape is learned
/// under the confirmed character. Only when both texts have one character per glyph. Returns how many shapes were added.
pub fn learn_cell(learned: &mut Templates, kind: FontKind, read: &[char], truth: &[char], glyphs: &[(Vec<u8>, f32)]) -> usize {
    if read.len() != truth.len() || read.len() != glyphs.len() { return 0; }
    let mut n = 0;
    for i in 0..read.len() {
        if read[i] != truth[i] && add(learned, kind, truth[i], glyphs[i].1, &glyphs[i].0) { n += 1; }
    }
    n
}

/// Calibration to one screen: every glyph of a confirmed cell is learned under its confirmed character, also the ones the reader got right
/// (the font is fixed, only the way a screen draws it changes). Near copies of a shape already learned are skipped, so this stays small.
pub fn learn_cell_all(learned: &mut Templates, kind: FontKind, truth: &[char], glyphs: &[(Vec<u8>, f32)]) -> usize {
    if truth.len() != glyphs.len() { return 0; }
    (0..truth.len()).filter(|&i| add(learned, kind, truth[i], glyphs[i].1, &glyphs[i].0)).count()
}
