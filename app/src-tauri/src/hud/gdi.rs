//! Text width the way Tk measures it: Windows' own GDI, on the game-style fonts held for this program only (never installed).
//! The plugin laid its cards out with Tk's font.measure, which is GDI: the same call here keeps every card the same size.
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use windows::core::PCWSTR;
use windows::Win32::Foundation::SIZE;
use windows::Win32::Graphics::Gdi::*;

const REG: &[u8] = include_bytes!("../../fonts/GravitasHud-Regular.ttf");
const BOLD: &[u8] = include_bytes!("../../fonts/GravitasHud-Bold.ttf");
const WIDE: &[u8] = include_bytes!("../../fonts/GravitasHudWide-Regular.ttf");

struct Gdi {
    dc: HDC,
    fonts: HashMap<(i32, bool, bool, i32), HFONT>,
}
unsafe impl Send for Gdi {}

/// A font is made for every size the cards are measured at (the size slider makes many). They are deleted when there are too many, so the GDI object count never climbs.
const MAX_FONTS: usize = 96;
fn trim(g: &mut Gdi) {
    if g.fonts.len() >= MAX_FONTS {
        for (_, f) in g.fonts.drain() { unsafe { let _ = DeleteObject(f.into()); } }
    }
}

fn gdi() -> &'static Mutex<Gdi> {
    static G: OnceLock<Mutex<Gdi>> = OnceLock::new();
    G.get_or_init(|| {
        for data in [REG, BOLD, WIDE] {
            let mut n = 0u32;
            unsafe { AddFontMemResourceEx(data.as_ptr() as *const _, data.len() as u32, None, &mut n) };
        }
        Mutex::new(Gdi { dc: unsafe { CreateCompatibleDC(None) }, fonts: HashMap::new() })
    })
}

/// Width of one line in whole pixels. `height` is the lfHeight the Tk font would ask for (negative: em pixels).
pub fn measure_h(s: &str, height: i32, bold: bool, wide: bool, mode: i32) -> f64 {
    let mut g = gdi().lock().unwrap_or_else(|e| e.into_inner());
    trim(&mut g);
    let dc = g.dc;
    let font = *g.fonts.entry((height, bold, wide, mode)).or_insert_with(|| unsafe {
        let name: Vec<u16> = (if wide { "GRAVITAS HUD Wide" } else { "GRAVITAS HUD" }).encode_utf16().chain(Some(0)).collect();
        CreateFontW(height, 0, 0, 0, if bold { 700 } else { 400 }, 0, 0, 0, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, DEFAULT_QUALITY, 0, PCWSTR(name.as_ptr()))
    });
    unsafe {
        let old = SelectObject(dc, font.into());
        let w: Vec<u16> = s.encode_utf16().collect();
        let mut sz = SIZE::default();
        let _ = GetTextExtentPoint32W(dc, &w, &mut sz);
        SelectObject(dc, old);
        sz.cx as f64
    }
}

/// Height of one line of text (Tk's linespace: GDI's tmHeight).
pub fn line_height(height: i32, bold: bool, wide: bool) -> f64 {
    let mut g = gdi().lock().unwrap_or_else(|e| e.into_inner());
    trim(&mut g);
    let dc = g.dc;
    let font = *g.fonts.entry((height, bold, wide, 0)).or_insert_with(|| unsafe {
        let name: Vec<u16> = (if wide { "GRAVITAS HUD Wide" } else { "GRAVITAS HUD" }).encode_utf16().chain(Some(0)).collect();
        CreateFontW(height, 0, 0, 0, if bold { 700 } else { 400 }, 0, 0, 0, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, DEFAULT_QUALITY, 0, PCWSTR(name.as_ptr()))
    });
    unsafe {
        let old = SelectObject(dc, font.into());
        let mut tm = TEXTMETRICW::default();
        let _ = GetTextMetricsW(dc, &mut tm);
        SelectObject(dc, old);
        tm.tmHeight as f64
    }
}
