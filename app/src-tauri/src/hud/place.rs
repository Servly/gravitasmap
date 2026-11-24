//! Where a window goes and its picture: hud.py's paint() for a flat window, one on a plane of the game's panels, in a free area, in the
//! middle at the top, or flat at the top. Returns the picture (in game window pixels) and where the next window on that plane starts.
use super::paint::{picture_with, Picture};
use super::pieces::{self, draw_canvas};
use super::planes::{self, P2};
use crate::i18n::I18n;
use serde_json::Value;

/// Which side of the screen a window's centre is on: the left takes the comms panel's perspective, the right the INFO panel's, and a band in the
/// middle (a twelfth of the width each way) is flat.
#[derive(Debug, PartialEq, Clone, Copy)]
pub enum Zone { Left, Middle, Right }
pub const MIDDLE_BAND: f64 = 0.08;
pub fn zone(cx: f64, w: f64) -> Zone {
    if (cx - w / 2.0).abs() < w * MIDDLE_BAND { Zone::Middle } else if cx < w / 2.0 { Zone::Left } else { Zone::Right }
}

#[cfg(test)]
mod zone_tests {
    use super::*;
    /// Moving a window by some pixels must move its picture by those pixels, on whichever side of the screen it ends up.
    #[test]
    fn a_window_lands_where_it_is_dropped() {
        let tr = I18n::new("en");
        let now = 1_700_000_000_000.0;
        let opts = crate::combat::Opts { bounty: Some(crate::combat::sample_bounty()), rows: 5, feed_rows: 6, ..Default::default() };
        let m = crate::combat::model(&tr, "bounty", &crate::combat::sample(now), now, &opts).expect("a bounty model");
        let (w, h) = (2560.0, 1440.0);
        let centre = |dx: f64, dy: f64| -> (f64, f64) {
            let place = vec![serde_json::json!("plane"), serde_json::json!("info"), serde_json::json!(dx), serde_json::json!(dy)];
            let v0 = start_of(&place, w, h);
            let pl = paint(&tr, &m, 0.0, 0.0, "#ff7100", (0.0, 0, 100, 100), Some(&place), v0, 1.0, w, h, false, true, 190).expect("placed");
            (pl.pic.x as f64 + pl.pic.w as f64 / 2.0, pl.pic.y as f64 + pl.pic.h as f64 / 2.0)
        };
        // the path of the video: right side -> further left in the right zone -> bottom right -> the middle -> the left
        let path = [(0.0, 0.0), (-8.0, 5.0), (-3.0, 20.0), (-40.0, -12.0), (-70.0, 8.0), (-35.0, -12.9)];
        let mut prev = centre(path[0].0, path[0].1);
        for (i, (dx, dy)) in path.iter().enumerate().skip(1) {
            let c = centre(*dx, *dy);
            let (wx, wy) = ((dx - path[i - 1].0) / 100.0 * h, (dy - path[i - 1].1) / 100.0 * h);
            let got = (c.0 - prev.0, c.1 - prev.1);
            println!("step {i}: offset ({dx},{dy}) wanted move ({wx:.0},{wy:.0}) got ({:.0},{:.0}) centre ({:.0},{:.0})", got.0, got.1, c.0, c.1);
            assert!((got.0 - wx).abs() < 6.0 && (got.1 - wy).abs() < 6.0, "step {i}: wanted ({wx:.0},{wy:.0}), the window moved ({:.0},{:.0})", got.0, got.1);
            prev = c;
        }
    }

    #[test]
    fn a_moved_window_takes_the_perspective_of_its_side() {
        let b = (0.0, 0.0, 300.0, 200.0);
        for (name, cx) in [("comms", 300.0), ("info", 1600.0)] {
            let q = on_plane(name, 1920.0, 1080.0, b, cx, 500.0).unwrap();
            let c = (q.iter().map(|p| p.0).sum::<f64>() / 4.0, q.iter().map(|p| p.1).sum::<f64>() / 4.0);
            assert!((c.0 - cx).abs() < 0.5 && (c.1 - 500.0).abs() < 0.5, "{name} centre {c:?}");
            // not a plain rectangle: the top edge and the bottom edge are not level, or the sides are not upright
            let flat = (q[0].1 - q[1].1).abs() < 0.01 && (q[3].1 - q[2].1).abs() < 0.01 && (q[0].0 - q[3].0).abs() < 0.01;
            assert!(!flat, "{name} is drawn flat: {q:?}");
        }
    }

    #[test]
    fn the_screen_has_a_left_a_flat_middle_and_a_right() {
        assert_eq!(zone(100.0, 1920.0), Zone::Left);
        assert_eq!(zone(960.0, 1920.0), Zone::Middle);
        assert_eq!(zone(960.0 + 140.0, 1920.0), Zone::Middle);
        assert_eq!(zone(960.0 + 160.0, 1920.0), Zone::Right);
        assert_eq!(zone(960.0 - 160.0, 1920.0), Zone::Left);
    }
}

pub struct Placed {
    pub pic: Picture,
    pub vend: Option<f64>,
}

fn shape_quad(b: (f64, f64, f64, f64), x0: f64, y0: f64, shape: (f64, i64, i64, i64)) -> [P2; 4] {
    let (ang, per, sx, sy) = (shape.0, shape.1 as f64 / 100.0, shape.2 as f64 / 100.0, shape.3 as f64 / 100.0);
    let (wc, hc) = ((b.2 - x0).max(1.0), (b.3 - y0).max(1.0));
    let (c, s) = (ang.to_radians().cos(), ang.to_radians().sin());
    let t = |px: f64, py: f64| {
        let k = 1.0 + per * ((px - x0) / wc - 0.5);
        let (u, v) = ((px - x0) * sx, ((py - y0) - hc / 2.0) * k * sy + hc * sy / 2.0);
        (x0 + u * c - v * s, y0 + u * s + v * c)
    };
    [t(b.0, b.1), t(b.2, b.1), t(b.2, b.3), t(b.0, b.3)]
}

fn rect(b: (f64, f64, f64, f64), dx: f64) -> [P2; 4] {
    [(b.0 + dx, b.1), (b.2 + dx, b.1), (b.2 + dx, b.3), (b.0 + dx, b.3)]
}

/// Where a plane's cursor starts for this window (hud.py render): v0.
pub fn start_of(place: &[Value], w: f64, h: f64) -> Option<f64> {
    match place.first().and_then(|p| p.as_str()) {
        Some("plane") => Some(planes::slot(place[1].as_str()?).1),
        Some("area") => Some(planes::area(place[1].as_str()?, w, h)?.1),
        Some("mid") => Some(planes::MID_Y0 * h),
        _ => None,
    }
}

/// The cursor's key for a place: windows on one plane follow one another downwards.
pub fn cursor_key(place: &[Value]) -> Option<String> {
    match place.first().and_then(|p| p.as_str()) {
        Some("mid") => Some("mid".into()),
        Some("plane") | Some("area") => place[1].as_str().map(String::from),
        _ => None,
    }
}

/// The picture (size from its box b) laid on a front plane with its centre at (cx, cy) on the screen: the perspective of that side.
fn on_plane(name: &str, w: f64, h: f64, b: (f64, f64, f64, f64), cx: f64, cy: f64) -> Option<[P2; 4]> {
    let q = planes::plane(name, w, h)?;
    let (wp, hp) = planes::size(&q);
    let (du, dv) = ((b.2 - b.0) / wp, (b.3 - b.1) / hp);
    let unit = planes::homography(&[(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)], &q)?;
    let inv = planes::homography(&q, &[(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)])?;
    let (uc, vc) = planes::apply(&inv, cx, cy);
    let (u0, v) = (uc - du / 2.0, vc - dv / 2.0);
    let a = |uu: f64, vv: f64| planes::apply(&unit, uu, vv);
    let d2 = [a(u0, v), a(u0 + du, v), a(u0 + du, v + dv), a(u0, v + dv)];
    let (c2x, c2y) = (d2.iter().map(|q| q.0).sum::<f64>() / 4.0, d2.iter().map(|q| q.1).sum::<f64>() / 4.0);
    Some(d2.map(|q| (q.0 + cx - c2x, q.1 + cy - c2y)))
}

#[allow(clippy::too_many_arguments)]
pub fn paint(tr: &I18n, m: &Value, xp: f64, yp: f64, col: &str, shape: (f64, i64, i64, i64), place: Option<&[Value]>, v0: Option<f64>, s: f64, w: f64, h: f64, bg: bool, persp: bool, ground_a: u8) -> Option<Placed> {
    let (mut x, mut y) = if place.is_some() { (0.0, 0.0) } else { (crate::pyval::round(w * xp / 100.0) as f64, crate::pyval::round(h * yp / 100.0) as f64) };
    if let Some(p) = place {
        if p[0] == "top" { y = crate::pyval::round(h * p[1].as_f64()?) as f64; }
    }
    let _ = &mut x;
    let cv = draw_canvas(tr, m, x, y, s, col, bg);
    let b_all = cv.bbox(0)?;
    let mut b = cv.bbox_no_ground().unwrap_or(b_all);
    let (mut dst, mut vend): ([P2; 4], Option<f64>);
    let kind = place.and_then(|p| p[0].as_str());
    match kind {
        Some("top") => { dst = rect(b, crate::pyval::round(w / 2.0 - (b.0 + b.2) / 2.0) as f64); vend = None; }
        Some("plane") => {
            let name = place?[1].as_str()?;
            let q = planes::plane(name, w, h)?;
            let (wp, hp) = planes::size(&q);
            let (du, dv) = ((b.2 - b.0) / wp, (b.3 - b.1) / hp);
            let u0 = planes::slot(name).0.unwrap_or(if name == "info" { 1.0 - du } else { -du - 0.03 });
            let v = v0?;
            let unit = planes::homography(&[(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)], &q)?;
            let a = |uu: f64, vv: f64| planes::apply(&unit, uu, vv);
            dst = [a(u0, v), a(u0 + du, v), a(u0 + du, v + dv), a(u0, v + dv)];
            vend = Some(v + dv + planes::GAP);
        }
        Some("area") => {
            let name = place?[1].as_str()?;
            let (x0, _, x1, y1) = planes::area(name, w, h)?;
            let (bw, bh) = (b.2 - b.0, b.3 - b.1);
            let v = v0?;
            let k = 1.0f64.min((x1 - x0) / bw.max(1.0)).min(0.5f64.max((y1 - v) / bh.max(1.0)));
            let (ww, hh) = (bw * k, bh * k);
            dst = [(x0, v), (x0 + ww, v), (x0 + ww, v + hh), (x0, v + hh)];
            vend = Some(v + hh + planes::AREA_GAP * h);
        }
        Some("mid") => {
            let dx = crate::pyval::round(w / 2.0 - (b.0 + b.2) / 2.0) as f64;
            let v = v0?;
            dst = [(b.0 + dx, v), (b.2 + dx, v), (b.2 + dx, v + b.3 - b.1), (b.0 + dx, v + b.3 - b.1)];
            vend = Some(v + (b.3 - b.1) + planes::AREA_GAP * h);
        }
        _ if shape != (0.0, 0, 100, 100) => { dst = shape_quad(b, x, y, shape); vend = None; }
        _ => { dst = rect(b, 0.0); vend = None; }
    }
    if let Some(p) = place {
        if p.len() > 2 && (p[2].as_f64().unwrap_or(0.0) != 0.0 || p.get(3).and_then(|v| v.as_f64()).unwrap_or(0.0) != 0.0) {
            let (mx, my) = (h * p[2].as_f64().unwrap_or(0.0) / 100.0, h * p.get(3).and_then(|v| v.as_f64()).unwrap_or(0.0) / 100.0);
            dst = dst.map(|q| (q.0 + mx, q.1 + my));
        }
    }
    if b_all != b {
        // the ground round it, carried the same way
        if let Some(hm) = planes::homography(&[(b.0, b.1), (b.2, b.1), (b.2, b.3), (b.0, b.3)], &dst) {
            dst = [planes::apply(&hm, b_all.0, b_all.1), planes::apply(&hm, b_all.2, b_all.1), planes::apply(&hm, b_all.2, b_all.3), planes::apply(&hm, b_all.0, b_all.3)];
            b = b_all;
        }
    }
    // the left or right of the screen is the perspective it has: a window on a front plane (comms on the left, INFO on the right) that has been moved
    // across the middle is drawn on the other plane, kept where it is on the screen (the plugin shifted it with its shape kept)
    // any other window that has been moved (Combat report, banner, the windows in a free area) takes the side's perspective too: left the comms
    // panel's, right the INFO panel's, the middle flat
    if let Some(p) = place {
        let moved = p.len() > 2 && (p[2].as_f64().unwrap_or(0.0) != 0.0 || p.get(3).and_then(|v| v.as_f64()).unwrap_or(0.0) != 0.0);
        if p[0] != "plane" && moved && persp {
            let cx = dst.iter().map(|q| q.0).sum::<f64>() / 4.0;
            let cy = dst.iter().map(|q| q.1).sum::<f64>() / 4.0;
            let side = match zone(cx, w) { Zone::Left => "comms", Zone::Right => "info", Zone::Middle => "" };
            if !side.is_empty() {
                if let Some(d2) = on_plane(side, w, h, b, cx, cy) { dst = d2; }
            }
        }
    }
    if let Some(p) = place {
        if p[0] == "plane" {
            if let Some(name) = p[1].as_str().filter(|n| *n == "comms" || *n == "info") {
                let cx = dst.iter().map(|q| q.0).sum::<f64>() / 4.0;
                let cy = dst.iter().map(|q| q.1).sum::<f64>() / 4.0;
                let other = if !persp { "" } else { match zone(cx, w) { Zone::Left => "comms", Zone::Right => "info", Zone::Middle => "" } };
                if other.is_empty() {
                    // in the middle band the window is flat (no perspective), kept where it is on the screen
                    let (bw, bh) = (b.2 - b.0, b.3 - b.1);
                    dst = [(cx - bw / 2.0, cy - bh / 2.0), (cx + bw / 2.0, cy - bh / 2.0), (cx + bw / 2.0, cy + bh / 2.0), (cx - bw / 2.0, cy + bh / 2.0)];
                } else if other != name {
                    if let (Some(q), Some(v)) = (planes::plane(other, w, h), v0) {
                        let (wp, hp) = planes::size(&q);
                        let (du, dv) = ((b.2 - b.0) / wp, (b.3 - b.1) / hp);
                        let u0 = planes::slot(other).0.unwrap_or(if other == "info" { 1.0 - du } else { -du - 0.03 });
                        if let Some(unit) = planes::homography(&[(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)], &q) {
                            let a = |uu: f64, vv: f64| planes::apply(&unit, uu, vv);
                            let mut d2 = [a(u0, v), a(u0 + du, v), a(u0 + du, v + dv), a(u0, v + dv)];
                            let (c2x, c2y) = (d2.iter().map(|q| q.0).sum::<f64>() / 4.0, d2.iter().map(|q| q.1).sum::<f64>() / 4.0);
                            d2 = d2.map(|q| (q.0 + cx - c2x, q.1 + cy - c2y));
                            dst = d2;
                        }
                    }
                }
            }
        }
    }
    let mut pic = picture_with(&cv.items, b, &dst, s, tr.font_fallback(), ground_a)?;
    let mg = 6;
    let (iw, ih) = (pic.w as i32, pic.h as i32);
    if (iw as f64) < w - 12.0 { pic.x = pic.x.max(mg).min(w as i32 - mg - iw); }
    if (ih as f64) < h - 12.0 { pic.y = pic.y.max(mg).min(h as i32 - mg - ih); }
    Some(Placed { pic, vend })
}

#[allow(dead_code)]
pub fn scale(h: f64, user: f64) -> f64 { pieces::scale(h, user) }
