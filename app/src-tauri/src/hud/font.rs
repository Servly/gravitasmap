//! The game-style fonts and how wide a text is in them (Tk's font.measure in the plugin). Sizes are whole pixels of the em, as Tk's
//! negative sizes are: max(8, round(size)).
use ab_glyph::{Font, FontRef, PxScale, ScaleFont};
use std::sync::OnceLock;

pub struct Fonts {
    pub regular: FontRef<'static>,
    pub bold: FontRef<'static>,
    pub wide: FontRef<'static>,
}

pub fn fonts() -> &'static Fonts {
    static F: OnceLock<Fonts> = OnceLock::new();
    F.get_or_init(|| Fonts {
        regular: FontRef::try_from_slice(include_bytes!("../../fonts/GravitasHud-Regular.ttf")).unwrap(),
        bold: FontRef::try_from_slice(include_bytes!("../../fonts/GravitasHud-Bold.ttf")).unwrap(),
        wide: FontRef::try_from_slice(include_bytes!("../../fonts/GravitasHudWide-Regular.ttf")).unwrap(),
    })
}

/// Which font file a (weight, wide) pair is, as hud.py's pil_font picks it: wide has one file for both weights.
pub fn pick(bold: bool, wide: bool) -> &'static FontRef<'static> {
    let f = fonts();
    if wide { &f.wide } else if bold { &f.bold } else { &f.regular }
}

/// Tk's size for a font: whole pixels, never under 8.
pub fn tk_px(size: f64) -> f64 {
    crate::pyval::round(size).max(8) as f64
}

/// Width of one line of text in pixels at an em of `px`.
pub fn measure(s: &str, size: f64, bold: bool, wide: bool) -> f64 {
    let font = pick(bold, wide);
    let sc = font.as_scaled(PxScale::from(tk_px(size) as f32));
    s.chars().map(|c| sc.h_advance(sc.glyph_id(c)) as f64).sum()
}

/// Height of one text line (Tk's "linespace": ascent plus descent).
pub fn linespace(size: f64, bold: bool, wide: bool) -> f64 {
    let font = pick(bold, wide);
    let sc = font.as_scaled(PxScale::from(tk_px(size) as f32));
    (sc.ascent() - sc.descent()) as f64
}

/// Tk's width of a Cyrillic letter in the game-style fonts at this pixel size (see make_tk_cyrillic.py), None if it is not one of them.
pub fn tk_cyrillic(c: char, px: i32, bold: bool, wide: bool) -> Option<f64> {
    use serde_json::Value;
    static T: OnceLock<Value> = OnceLock::new();
    let t = T.get_or_init(|| serde_json::from_str(include_str!("../../data/tk_cyrillic.json")).unwrap());
    let first = t["first"].as_u64()? as u32;
    let i = (c as u32).checked_sub(first)? as usize;
    let key = format!("{}/{}/{}", if wide { "wide" } else { "hud" }, if bold { "bold" } else { "normal" }, px.clamp(8, 80));
    t["widths"].get(&key)?.get(i)?.as_f64()
}
