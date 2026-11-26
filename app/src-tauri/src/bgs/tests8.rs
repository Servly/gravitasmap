//! BGS Watch, 0.9.51: the reader must not depend on the colour, the gamma or the brightness of the player's screen, and the home system's house icon must never
//! break the name. Real-page tests skip when the local sample pages are not there (they are never in the public repository).
use super::decode::{decode_file, Rgb};
use super::imgops::Img;
use super::reader::{read_screen, PageRead};

fn page(rel: &str) -> Option<Rgb> {
    let p = super::train::root().join(rel);
    if !p.exists() { eprintln!("SKIPPED: {rel} is not here"); return None; }
    decode_file(&p).ok()
}

fn map_px(src: &Rgb, mut f: impl FnMut(u8, u8, u8) -> (u8, u8, u8)) -> Rgb {
    let mut px = Vec::with_capacity(src.px.len());
    for p in src.px.chunks_exact(3) { let (r, g, b) = f(p[0], p[1], p[2]); px.extend_from_slice(&[r, g, b]); }
    Rgb { w: src.w, h: src.h, px }
}

fn read(src: &Rgb) -> Option<PageRead> {
    read_screen(&Img::new(Rgb { w: src.w, h: src.h, px: src.px.clone() }), super::tpl::bundled().unwrap())
}

fn texts(p: &PageRead) -> Vec<(String, String)> { p.rows.iter().map(|r| (r.name.clone(), r.inf.clone())).collect() }

const PAGE1: &str = "inbox/shipcmp/Screenshot_0001.bmp";
const HOME: &str = "inbox/p3/Screenshot_0005.bmp";

#[test]
fn a_recoloured_or_darker_or_brighter_screen_reads_the_same() {
    let Some(a) = page(PAGE1) else { return };
    let want = texts(&read(&a).expect("original"));
    assert_eq!(want.len(), 10);
    let tint = |kr: f32, kg: f32, kb: f32| map_px(&a, move |r, g, b| (((r as f32) * kr).min(255.0) as u8, ((g as f32) * kg).min(255.0) as u8, ((b as f32) * kb).min(255.0) as u8));
    let gamma = |ga: f32| map_px(&a, move |r, g, b| { let f = |v: u8| (255.0 * (v as f32 / 255.0).powf(ga)) as u8; (f(r), f(g), f(b)) });
    let scale = |k: f32| map_px(&a, move |r, g, b| (((r as f32) * k).min(255.0) as u8, ((g as f32) * k).min(255.0) as u8, ((b as f32) * k).min(255.0) as u8));
    // (name, picture, strict). Strict: the reading is identical. Not strict (a dark or very bright curve can lose a thin hyphen): every cell that differs
    // must be marked uncertain, never shown as sure.
    let cases: Vec<(&str, Rgb, bool)> = vec![
        ("orange HUD (red strongest)", tint(1.0, 0.45, 0.15), true),
        ("green HUD", tint(0.3, 1.0, 0.3), true),
        ("red HUD", tint(1.0, 0.1, 0.1), true),
        ("channels swapped", map_px(&a, |r, g, b| (b, r, g)), true),
        ("dark 70 %", scale(0.7), true),
        ("dark 50 %", scale(0.5), true),
        ("bright 130 %", scale(1.3), true),
        ("gamma 0.7", gamma(0.7), true),
        ("gamma 1.4", gamma(1.4), false),
    ];
    for (name, img, strict) in &cases {
        let got = read(img).unwrap_or_else(|| panic!("{name}: the list was not found"));
        if *strict { assert_eq!(texts(&got), want, "{name}: the reading changed"); continue; }
        assert_eq!(got.rows.len(), want.len(), "{name}: rows");
        for (i, (r, w)) in got.rows.iter().zip(&want).enumerate() {
            if (r.name.clone(), r.inf.clone()) != *w { assert!(!r.reasons.is_empty(), "{name} row {i}: {:?} read instead of {:?} and not marked", (&r.name, &r.inf), w); }
        }
    }
}

/// gamma 2.0 is extreme: the list must still be found, and every cell that differs from the original must be marked uncertain (never a wrong value shown as sure)
#[test]
fn an_extreme_gamma_never_gives_a_wrong_value_with_confidence() {
    let Some(a) = page(PAGE1) else { return };
    let orig = read(&a).expect("original");
    let g2 = map_px(&a, |r, g, b| { let f = |v: u8| (255.0 * (v as f32 / 255.0).powf(2.0)) as u8; (f(r), f(g), f(b)) });
    let got = read(&g2).expect("the list is found even at gamma 2.0");
    assert_eq!(got.rows.len(), 10);
    for (i, (x, y)) in got.rows.iter().zip(&orig.rows).enumerate() {
        if x.inf != y.inf { assert!(!x.reasons.is_empty(), "row {i}: a changed value must be flagged ({} instead of {})", x.inf, y.inf); }
    }
}

/// the home system row holds the name, "SYSTEM OF ORIGIN" and a house icon. However bright the icon is, the name is the top line only.
#[test]
fn the_home_system_icon_never_breaks_the_name() {
    let Some(a) = page(HOME) else { return };
    let base = read(&a).expect("original");
    let home = base.rows.iter().position(|r| r.name == "DURYAMPAS").expect("the home system is read");
    assert!(base.rows[home].reasons.is_empty(), "{:?}", base.rows[home].reasons);
    for k in [1.35f32, 1.6, 2.0, 2.6] {
        let (w, h) = (a.w, a.h);
        // the house icon of the 1440p page sits at x 938..977, y 887..927
        let mut px = a.px.clone();
        for y in 887.min(h)..927.min(h) { for x in 938.min(w)..977.min(w) { for c in 0..3 { let i = (y * w + x) * 3 + c; px[i] = ((px[i] as f32) * k).min(255.0) as u8; } } }
        let got = read(&Rgb { w, h, px }).expect("list");
        assert_eq!(got.rows[home].name, "DURYAMPAS", "icon x{k}");
        assert_eq!(texts(&got), texts(&base), "icon x{k}: the rest of the page changed");
    }
}

/// A real list page is always found. Screens far outside the normal range (very dark, very washed out, noisy, soft) must still give the 10 rows.
#[test]
fn the_list_is_found_on_very_hard_screens() {
    let Some(a) = page(PAGE1) else { return };
    let gamma = |ga: f32| map_px(&a, move |r, g, b| { let f = |v: u8| (255.0 * (v as f32 / 255.0).powf(ga)) as u8; (f(r), f(g), f(b)) });
    let scale = |k: f32| map_px(&a, move |r, g, b| (((r as f32) * k) as u8, ((g as f32) * k) as u8, ((b as f32) * k) as u8));
    let washed = map_px(&a, |r, g, b| ((r as u32 / 2 + 90) as u8, (g as u32 / 2 + 90) as u8, (b as u32 / 2 + 90) as u8));
    let mut x: u32 = 7;
    let noisy = map_px(&a, |r, g, b| { x = x.wrapping_mul(1664525).wrapping_add(1013904223); let v = (((x >> 16) % 25) as i32) - 12; let f = |c: u8| (c as i32 + v).clamp(0, 255) as u8; (f(r), f(g), f(b)) });
    let (w, h) = (a.w, a.h);
    let mut px = a.px.clone();
    for y in 1..h - 1 { for xx in 1..w - 1 { for c in 0..3 { let mut s = 0u32; for dy in 0..3 { for dx in 0..3 { s += a.px[((y + dy - 1) * w + xx + dx - 1) * 3 + c] as u32; } } px[(y * w + xx) * 3 + c] = (s / 9) as u8; } } }
    let soft = Rgb { w, h, px };
    let cases: Vec<(&str, Rgb)> = vec![("gamma 2.5", gamma(2.5)), ("dark 30 %", scale(0.3)), ("washed out", washed), ("noise +-12", noisy), ("soft 3x3", soft)];
    for (name, img) in cases {
        let r = read(&img).unwrap_or_else(|| panic!("{name}: the list was not found"));
        if r.rows.len() != 10 { let sc = super::reader::segment_screen(&Img::new(Rgb { w: img.w, h: img.h, px: img.px.clone() })).unwrap(); eprintln!("{name}: rows at {:?}, div {} hl {:?}", sc.lay.rows, sc.lay.div_x, sc.lay.hlines); }
        assert_eq!(r.rows.len(), 10, "{name}: rows");
    }
}
