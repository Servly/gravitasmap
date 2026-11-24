//! A panel as a picture: premultiplied BGRA pixels, as Windows wants them for a layered window (the job Pillow's bgra() did in Python).
use ab_glyph::{point, Font, FontRef, PxScale, ScaleFont};
use tiny_skia::{FillRule, Paint, PathBuilder, Pixmap, Stroke, Transform};

const FONT: &[u8] = include_bytes!("../fonts/GravitasHud-Bold.ttf");
const HUD: (u8, u8, u8) = (255, 113, 0); // the game's own HUD orange, as the old plugin's default
const SOFT: (u8, u8, u8) = (255, 176, 102);

fn rounded(x: f32, y: f32, w: f32, h: f32, r: f32) -> tiny_skia::Path {
    let mut p = PathBuilder::new();
    p.move_to(x + r, y);
    p.line_to(x + w - r, y);
    p.quad_to(x + w, y, x + w, y + r);
    p.line_to(x + w, y + h - r);
    p.quad_to(x + w, y + h, x + w - r, y + h);
    p.line_to(x + r, y + h);
    p.quad_to(x, y + h, x, y + h - r);
    p.line_to(x, y + r);
    p.quad_to(x, y, x + r, y);
    p.close();
    p.finish().unwrap()
}

/// Text onto the pixmap (premultiplied RGBA): the glyph's coverage is the alpha it is laid on with.
fn text(pm: &mut Pixmap, font: &FontRef, s: &str, size: f32, x: f32, baseline: f32, rgb: (u8, u8, u8)) {
    let scale = PxScale::from(size);
    let scaled = font.as_scaled(scale);
    let (w, h) = (pm.width() as i32, pm.height() as i32);
    let mut cx = x;
    for ch in s.chars() {
        let id = font.glyph_id(ch);
        let g = id.with_scale_and_position(scale, point(cx, baseline));
        if let Some(o) = font.outline_glyph(g) {
            let b = o.px_bounds();
            let data = pm.data_mut();
            o.draw(|gx, gy, cov| {
                let (px, py) = (b.min.x as i32 + gx as i32, b.min.y as i32 + gy as i32);
                if px < 0 || py < 0 || px >= w || py >= h {
                    return;
                }
                let i = ((py * w + px) * 4) as usize;
                let inv = 1.0 - cov;
                data[i] = (rgb.0 as f32 * cov + data[i] as f32 * inv) as u8;
                data[i + 1] = (rgb.1 as f32 * cov + data[i + 1] as f32 * inv) as u8;
                data[i + 2] = (rgb.2 as f32 * cov + data[i + 2] as f32 * inv) as u8;
                data[i + 3] = (255.0 * cov + data[i + 3] as f32 * inv) as u8;
            });
        }
        cx += scaled.h_advance(id);
    }
}

/// The test panel of v0.2: says what an overlay does. (w, h, BGRA).
pub fn test_card() -> (i32, i32, Vec<u8>) {
    let (w, h) = (380u32, 128u32);
    let mut pm = Pixmap::new(w, h).unwrap();
    let path = rounded(1.5, 1.5, w as f32 - 3.0, h as f32 - 3.0, 10.0);
    let mut paint = Paint::default();
    paint.anti_alias = true;
    paint.set_color_rgba8(20, 8, 0, 170);
    pm.fill_path(&path, &paint, FillRule::Winding, Transform::identity(), None);
    paint.set_color_rgba8(HUD.0, HUD.1, HUD.2, 255);
    let stroke = Stroke { width: 2.0, ..Default::default() };
    pm.stroke_path(&path, &paint, &stroke, Transform::identity(), None);
    let font = FontRef::try_from_slice(FONT).unwrap();
    text(&mut pm, &font, "OVERLAY TEST", 20.0, 18.0, 38.0, HUD);
    text(&mut pm, &font, "Click-through. It takes no focus.", 14.0, 18.0, 66.0, SOFT);
    text(&mut pm, &font, "Move the mouse over it: it fades away.", 14.0, 18.0, 88.0, SOFT);
    text(&mut pm, &font, "The game keeps the mouse and the keyboard.", 14.0, 18.0, 110.0, SOFT);
    let mut bgra = pm.data().to_vec();
    for px in bgra.chunks_exact_mut(4) {
        px.swap(0, 2); // RGBA -> BGRA, already premultiplied
    }
    (w as i32, h as i32, bgra)
}
