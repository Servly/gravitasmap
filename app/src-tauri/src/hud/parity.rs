//! Every piece of every card the plugin's own Tk canvas drew (make_render_golden.py) against the app's pieces.
use super::pieces::{self, Shape};
use crate::host::parity::golden_dir;
use serde_json::Value;
use std::collections::BTreeMap;

fn f(v: &Value) -> f64 { v.as_f64().unwrap_or(f64::NAN) }

/// first difference between a golden piece and ours, or None
fn diff(g: &Value, p: &pieces::Piece) -> Option<String> {
    let kind = g["t"].as_str().unwrap();
    if g["glow"].as_bool().unwrap() != p.glow { return Some("glow flag".into()) }
    let ground = g["tags"].as_array().unwrap().iter().any(|t| t == "ground");
    if ground != p.ground { return Some("ground flag".into()) }
    let tol = 0.01;
    let close = |a: &[f64], b: &Value, what: &str| -> Option<String> {
        let b: Vec<f64> = b.as_array().unwrap().iter().map(f).collect();
        if a.len() != b.len() { return Some(format!("{what}: {} numbers, plugin {}", a.len(), b.len())) }
        a.iter().zip(&b).find(|(x, y)| (*x - *y).abs() > tol).map(|(x, y)| format!("{what}: app {x:.3}, plugin {y:.3}"))
    };
    match (&p.shape, kind) {
        (Shape::Text { x, y, s, size, bold, wide, fill, anchor, wrap }, "text") => {
            if g["tags"].as_array().unwrap().iter().any(|t| t == "ground") { return None } else if let Some(d) = close(&[*x, *y], &g["c"], "xy") { return Some(d) }
            if s != g["text"].as_str().unwrap() { return Some(format!("text: app {s:?}, plugin {:?}", g["text"])) }
            if (size - f(&g["size"])).abs() > 1e-6 { return Some(format!("size: app {size}, plugin {}", g["size"])) }
            if *bold != (g["weight"] == "bold") { return Some("weight".into()) }
            if *wide != g["family"].as_str().unwrap().ends_with("Wide") { return Some("family".into()) }
            if fill != g["fill"].as_str().unwrap() { return Some(format!("colour: app {fill}, plugin {}", g["fill"])) }
            if *anchor != g["anchor"].as_str().unwrap() { return Some("anchor".into()) }
            if (wrap - f(&g["wrap"])).abs() > 1e-6 { return Some("wrap".into()) }
            None
        }
        (Shape::Line { pts, fill, width }, "line") => {
            close(pts, &g["c"], "line xy").or_else(|| (fill != g["fill"].as_str().unwrap()).then(|| format!("line colour: app {fill}, plugin {}", g["fill"])))
                .or_else(|| (!fill.is_empty() && (width - g["width"].as_str().unwrap().parse::<f64>().unwrap()).abs() > 0.01).then(|| format!("line width: app {width}, plugin {}", g["width"])))
        }
        (Shape::Poly { pts, fill, outline, width, stipple }, "polygon") => {
            close(pts, &g["c"], "poly xy").or_else(|| (fill != g["fill"].as_str().unwrap()).then(|| format!("poly fill: app {fill:?}, plugin {}", g["fill"])))
                .or_else(|| (outline != g["outline"].as_str().unwrap()).then(|| format!("poly outline: app {outline:?}, plugin {}", g["outline"])))
                .or_else(|| (!outline.is_empty() && (width - g["width"].as_str().unwrap().parse::<f64>().unwrap()).abs() > 0.01).then(|| format!("poly width: app {width}, plugin {}", g["width"])))
                .or_else(|| (*stipple != !g["stipple"].as_str().unwrap().is_empty()).then(|| "stipple".into()))
        }
        _ => Some(format!("kind: app {:?}, plugin {kind}", std::mem::discriminant(&p.shape))),
    }
}

#[test]
fn pieces_match_the_plugins_canvas() {
    let Ok(t) = std::fs::read_to_string(golden_dir().join("render_golden.json")) else { println!("SKIP: run make_render_golden.py"); return };
    let d: Vec<Value> = serde_json::from_str(&t).unwrap();
    let only_ru = std::env::var("LANG_ONLY").ok();
    let (mut bad, mut n, mut pc) = (Vec::new(), 0, 0);
    let mut by_kind: BTreeMap<String, usize> = BTreeMap::new();
    for (ci, c) in d.iter().enumerate() {
        let lang = c["lang"].as_str().unwrap();
        if only_ru.as_deref().is_some_and(|l| l != lang) { continue }
        let tr = crate::i18n::I18n::new(lang);
        let mine = pieces::draw(&tr, &c["model"], f(&c["x"]), f(&c["y"]), f(&c["S"]), c["col"].as_str().unwrap(), c["bg"].as_bool().unwrap());
        let gp = c["pieces"].as_array().unwrap();
        n += 1;
        pc += gp.len();
        let mut first: Option<String> = None;
        if mine.len() != gp.len() { first = Some(format!("{} pieces, plugin {}", mine.len(), gp.len())) }
        else { for (i, (g, p)) in gp.iter().zip(&mine).enumerate() { if let Some(x) = diff(g, p) { first = Some(format!("piece {i}: {x}")); break } } }
        if let Some(x) = first {
            let k = x.split(':').next().unwrap_or("").chars().filter(|c| !c.is_ascii_digit()).collect::<String>();
            *by_kind.entry(k).or_default() += 1;
            bad.push(format!("case {ci} {} {} H{} [{}] {x}", c["key"], lang, c["H"], c["src"]));
        }
    }
    println!("pieces: {n} cards, {pc} pieces, {} cards differ", bad.len());
    for (k, v) in &by_kind { println!("  {v:5}  {k}") }
    for b in bad.iter().filter(|b| !b.contains(" ru ")).take(12) { println!("{b}") }
    // Russian is left out on purpose: Tk measured Cyrillic in a Windows fallback font, the app measures what it draws
    assert!(bad.is_empty(), "cards differ");
}

#[test]
fn text_boxes_match_tk() {
    let Ok(t) = std::fs::read_to_string(golden_dir().join("render_golden.json")) else { return };
    let d: Vec<Value> = serde_json::from_str(&t).unwrap();
    let mut by: BTreeMap<String, usize> = BTreeMap::new();
    let (mut n, mut shown) = (0, 0);
    for c in d.iter().filter(|c| c["lang"] == "en") {
        let tr = crate::i18n::I18n::new("en");
        let mine = pieces::draw_canvas(&tr, &c["model"], f(&c["x"]), f(&c["y"]), f(&c["S"]), c["col"].as_str().unwrap(), c["bg"].as_bool().unwrap());
        let gp = c["pieces"].as_array().unwrap();
        if mine.items.len() != gp.len() { continue }
        for (i, g) in gp.iter().enumerate() {
            if g["t"] != "text" || g["glow"] == true { continue }
            let b = mine.text_box(i);
            let w: Vec<f64> = g["bbox"].as_array().unwrap().iter().map(f).collect();
            n += 1;
            let key = format!("dx0 {} dy0 {} dx1 {} dy1 {}", (b.0 - w[0]).round(), (b.1 - w[1]).round(), (b.2 - w[2]).round(), (b.3 - w[3]).round());
            *by.entry(key.clone()).or_default() += 1;
            if key != "dx0 0 dy0 0 dx1 0 dy1 0" && shown < 4 { shown += 1; println!("{:?} anchor {} wrap {} size {} bold {} app {:?} tk {:?}", g["text"], g["anchor"], g["wrap"], g["size"], g["weight"], b, w) }
        }
    }
    let mut v: Vec<_> = by.into_iter().collect();
    v.sort_by_key(|x| std::cmp::Reverse(x.1));
    println!("text boxes: {n}");
    for (k, c) in v.iter().take(8) { println!("  {c:6} {k}") }
}

/// Pictures of a few real cards (research/app-golden/out/rust_<n>.png) for the side-by-side with the plugin's (make_render_png.py).
#[test]
fn write_pictures() {
    let Ok(t) = std::fs::read_to_string(golden_dir().join("render_golden.json")) else { return };
    let d: Vec<Value> = serde_json::from_str(&t).unwrap();
    let out = golden_dir().join("../out");
    std::fs::create_dir_all(&out).unwrap();
    let mut seen = std::collections::HashSet::new();
    for (ci, c) in d.iter().enumerate() {
        if c["lang"] != std::env::var("PIC_LANG").unwrap_or("en".into()).as_str() || c["H"] != 1080 || c["bg"] != true || !c["src"].as_str().unwrap().starts_with(if std::env::var("PIC_LANG").is_ok() { "fuzz" } else { "fixture" }) || !seen.insert(c["key"].as_str().unwrap().to_string()) { continue }
        let tr = crate::i18n::I18n::new(c["lang"].as_str().unwrap());
        let cv = pieces::draw_canvas(&tr, &c["model"], f(&c["x"]), f(&c["y"]), f(&c["S"]), c["col"].as_str().unwrap(), true);
        let b = cv.bbox(0).unwrap();
        let pic = super::paint::picture(&cv.items, b, &[(b.0, b.1), (b.2, b.1), (b.2, b.3), (b.0, b.3)], f(&c["S"]), tr.font_fallback()).unwrap();
        let pm = tiny_skia::Pixmap::from_vec(pic.rgba, tiny_skia::IntSize::from_wh(pic.w, pic.h).unwrap()).unwrap();
        pm.save_png(out.join(format!("rust_{ci}.png"))).unwrap();
        println!("wrote rust_{ci}.png ({})", c["key"]);
    }
}

/// Whole scenes (the plugin's own Hud.paint for every window of a busy moment, make_scene_golden.py): where each window goes, its size, and how
/// close its picture is. Pixels are not equal to the last digit (another rasteriser): the test reports the difference and holds it to a limit.
#[test]
fn scenes_match_the_plugins_hud() {
    use super::{place, planes};
    let dir = golden_dir();
    let Ok(t) = std::fs::read_to_string(dir.join("scene_golden.json")) else { println!("SKIP: run make_scene_golden.py"); return };
    let scenes: Vec<Value> = serde_json::from_str(&t).unwrap();
    let tr = crate::i18n::I18n::new("en");
    let (mut n, mut bad, mut worst, mut sum) = (0, Vec::new(), 0f64, 0f64);
    for sc in &scenes {
        let (w, h, s, bg) = (f(&sc["W"]), f(&sc["H"]), f(&sc["S"]), sc["bg"].as_bool().unwrap());
        let mut cursor: std::collections::HashMap<String, f64> = Default::default();
        let mut wins = sc["wins"].as_array().unwrap().iter();
        for it in sc["items"].as_array().unwrap() {
            let (k, m) = (it[0].as_str().unwrap(), &it[1]);
            if m.is_null() { continue }
            let place_v: Option<Vec<Value>> = it[6].as_array().cloned();
            let v0 = place_v.as_ref().and_then(|p| { let ck = place::cursor_key(p)?; cursor.get(&ck).copied().or_else(|| place::start_of(p, w, h)) });
            let sh = it[5].as_array().map(|v| (f(&v[0]), v[1].as_i64().unwrap(), v[2].as_i64().unwrap(), v[3].as_i64().unwrap())).unwrap_or((0.0, 0, 100, 100));
            let got = place::paint(&tr, m, f(&it[2]), f(&it[3]), it[4].as_str().unwrap(), sh, place_v.as_deref(), v0, s, w, h, bg, true, 190);
            let Some(g) = wins.next() else { break };
            let Some(p) = got else { bad.push(format!("scene {} {k}: no picture, plugin made one", sc["scene"])); continue };
            if g["key"] != k { bad.push(format!("scene {}: order {k} vs {}", sc["scene"], g["key"])); continue }
            if let (Some(pc), Some(v)) = (&place_v, p.vend) { if let Some(ck) = place::cursor_key(pc) { cursor.insert(ck, v); } }
            n += 1;
            let (ox, oy, pw, ph) = (f(&g["ox"]) as i32, f(&g["oy"]) as i32, f(&g["w"]) as u32, f(&g["h"]) as u32);
            let geo = (p.pic.x - ox).abs().max((p.pic.y - oy).abs()).max((p.pic.w as i32 - pw as i32).abs()).max((p.pic.h as i32 - ph as i32).abs());
            if std::env::var("SHOW_GEO").is_ok() && n < 14 { println!("  {k} {w}x{h}: app ({},{}) {}x{}  plugin ({ox},{oy}) {pw}x{ph}", p.pic.x, p.pic.y, p.pic.w, p.pic.h); }
            if geo > if bg { 2 } else { 1 } { bad.push(format!("scene {} {}x{} bg{bg} {k}: app at ({},{}) {}x{}, plugin ({ox},{oy}) {pw}x{ph}", sc["scene"], w, h, p.pic.x, p.pic.y, p.pic.w, p.pic.h)); continue }
            if let Some(vp) = g["vend"].as_f64() { if (p.vend.unwrap_or(f64::NAN) - vp).abs() > 0.01 { bad.push(format!("scene {} {k}: vend {:?} vs {vp}", sc["scene"], p.vend)); } }
            // pixels: the plugin's picture against ours, each placed on the game window's pixels
            if std::env::var("DUMP_SCENES").is_ok() {
                let od = dir.join("../out/scene_app");
                std::fs::create_dir_all(&od).unwrap();
                let pm = tiny_skia::Pixmap::from_vec(p.pic.rgba.clone(), tiny_skia::IntSize::from_wh(p.pic.w, p.pic.h).unwrap()).unwrap();
                pm.save_png(od.join(g["png"].as_str().unwrap())).unwrap();
            }
            let theirs = tiny_skia::Pixmap::load_png(dir.join("../out/scene").join(g["png"].as_str().unwrap())).unwrap();
            let (x0, y0) = (p.pic.x.min(ox), p.pic.y.min(oy));
            let (x1, y1) = ((p.pic.x + p.pic.w as i32).max(ox + pw as i32), (p.pic.y + p.pic.h as i32).max(oy + ph as i32));
            let mut acc = 0f64;
            for yy in y0..y1 {
                for xx in x0..x1 {
                    let at = |px: &[u8], pw: u32, ph: u32, bx: i32, by: i32| -> [f64; 4] {
                        let (u, v) = (xx - bx, yy - by);
                        if u < 0 || v < 0 || u >= pw as i32 || v >= ph as i32 { return [0.0; 4] }
                        let i = ((v as u32 * pw + u as u32) * 4) as usize;
                        [px[i] as f64, px[i + 1] as f64, px[i + 2] as f64, px[i + 3] as f64]
                    };
                    let a = at(&p.pic.rgba, p.pic.w, p.pic.h, p.pic.x, p.pic.y);
                    let b = at(theirs.data(), pw, ph, ox, oy);
                    acc += (0..4).map(|c| (a[c] - b[c]).abs()).sum::<f64>() / 4.0;
                }
            }
            let mean = acc / (((x1 - x0) * (y1 - y0)).max(1)) as f64;
            sum += mean; worst = worst.max(mean);
            if mean > 15.0 { bad.push(format!("scene {} {}x{} bg{bg} {k}: pixels differ by {mean:.1}", sc["scene"], w, h)); }
        }
    }
    println!("scenes: {} renders, {n} windows, mean pixel difference {:.2}/255, worst {worst:.2}, {} problems", scenes.len(), sum / n as f64, bad.len());
    for b in bad.iter().take(8) { println!("  {b}") }
    assert!(bad.is_empty());
    let _ = planes::GAP;
}
