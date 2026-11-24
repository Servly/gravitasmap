//! DEBRIEF's own drawing: the live input window (kind "inputs"): the keys that are down, the mouse's direction, Flight Assist.
//! Made of the same pieces as every other window (lines, polygons, texts), so placing, perspective, colour and size work as they do for the others.
use super::pieces::{colours, mix, Canvas, Shape};
use crate::pyval::round;
use serde_json::Value;

fn text_of(m: &Value, k: &str) -> String { m.get(k).and_then(Value::as_str).unwrap_or("").to_string() }

/// The card as wide as the Combat cards, always the height of four rows, so that it does not jump about as keys come and go.
pub fn g_inputs(cv: &mut Canvas, m: &Value, x: f64, y: f64, s: f64, col: &str) {
    let c = colours(col);
    let first = cv.items.len();
    cv.push(Shape::Line { pts: vec![x, y, x, y], fill: String::new(), width: 1.0 }, false);
    let w = round(430.0 * s) as f64;
    let fa = text_of(m, "fa");
    let badge = if fa.is_empty() { None } else { Some((text_of(m, "fa_text"), if fa == "off" { "amber" } else { "green" })) };
    let mut cy = cv.g_head(x, y, w, s, &text_of(m, "title"), &c, badge.as_ref().map(|b| (b.0.as_str(), b.1)));
    if m.get("rec").and_then(Value::as_bool).unwrap_or(false) {
        // a small red square at the title: it is being recorded
        let (rx, ry) = (x + w - 150.0 * s, y + 1.0 * s);
        cv.rect(rx, ry + 2.0 * s, rx + 7.0 * s, ry + 9.0 * s, "#ff3b30", "", false);
    }
    cy += 4.0 * s;
    let words = m.get("words").cloned().unwrap_or(Value::Null);
    let word = |k: &str| text_of(&words, k);
    let rows_w = w - 150.0 * s;
    let (row_h, cap_w) = (34.0 * s, 46.0 * s);
    let rows: Vec<Value> = m.get("rows").and_then(Value::as_array).cloned().unwrap_or_default();
    for (i, r) in rows.iter().take(4).enumerate() {
        let ry = cy + i as f64 * row_h;
        let state = text_of(r, "state");
        let age = r.get("age").and_then(Value::as_f64).unwrap_or(9.0);
        let secs = r.get("secs").and_then(Value::as_f64).unwrap_or(0.0);
        let key = text_of(r, "key").to_uppercase();
        let (fill, edge, ink) = match state.as_str() {
            "hold" => (c.txt.clone(), c.txt.clone(), "#1a0d00".to_string()),
            "tap" if age < 0.25 => (mix(&c.hi, "#ffffff", 0.7), c.hi.clone(), "#1a0d00".to_string()), // the flash of a fresh press
            "tap" => (mix(&c.txt, "#000000", 0.82), c.txt.clone(), c.hi.clone()),
            _ => (String::new(), c.dim.clone(), c.dim.clone()), // held: let go a moment ago
        };
        cv.rect(x, ry, x + cap_w, ry + 28.0 * s, &fill, &edge, false);
        let ks = cv.fit(&key, 15.0 * s, true, cap_w - 6.0 * s, false);
        cv.g_text(x + cap_w / 2.0, ry + 14.0 * s, &key, ks, &ink, &c.glow, true, "center", 0.0, false);
        let right = x + rows_w;
        let (label, lab_col) = match state.as_str() {
            "hold" => (format!("{} {:.1} s", word("hold"), secs), c.hi.clone()),
            "held" => (format!("{} {:.1} s", word("held"), secs), c.dim.clone()),
            _ => (word("tap"), mix(&c.hi, "#ffffff", 0.5)),
        };
        let lw = cv.measure(&label, 11.0 * s, true, false);
        let name = text_of(r, "name").to_uppercase();
        let (nt, nz) = cv.clip(&name, 13.0 * s, true, rows_w - cap_w - lw - 22.0 * s);
        cv.g_text(x + cap_w + 10.0 * s, ry + 14.0 * s, &nt, nz, &c.hi, &c.glow, true, "w", 0.0, false);
        if state == "hold" {
            // the bar fills over three seconds under the label: how long it has been held
            let bw = (lw + 8.0 * s).max(70.0 * s);
            let frac = (secs / 3.0).clamp(0.0, 1.0);
            cv.rect(right - bw, ry + 20.0 * s, right, ry + 25.0 * s, "", &c.dim, false);
            cv.rect(right - bw, ry + 20.0 * s, right - bw + bw * frac, ry + 25.0 * s, &c.txt, "", false);
        }
        cv.g_text(right, ry + 9.0 * s, &label, 11.0 * s, &lab_col, &c.glow, true, "e", 0.0, false);
    }
    // the mouse: the direction it went in the last moment, its buttons and the wheel
    let mo = m.get("mouse").cloned().unwrap_or(Value::Null);
    let (mx, my) = (mo.get("x").and_then(Value::as_f64).unwrap_or(0.0), mo.get("y").and_then(Value::as_f64).unwrap_or(0.0));
    let (px0, py0, rad) = (x + w - 56.0 * s, cy + 46.0 * s, 40.0 * s);
    let ring: Vec<f64> = (0..28).flat_map(|i| { let a = i as f64 / 28.0 * std::f64::consts::TAU; [px0 + rad * a.cos(), py0 + rad * a.sin()] }).collect();
    cv.poly(ring, "", &c.txt, 1.0, false);
    cv.g_line(px0 - rad + 5.0 * s, py0, px0 + rad - 5.0 * s, py0, &c.faint, 1.0);
    cv.g_line(px0, py0 - rad + 5.0 * s, px0, py0 + rad - 5.0 * s, &c.faint, 1.0);
    let (dx, dy) = (px0 + mx * (rad - 9.0 * s), py0 + my * (rad - 9.0 * s));
    if mx.abs() + my.abs() > 0.05 { cv.g_line(px0, py0, dx, dy, &c.dim, 2.0 * s); }
    cv.rect(dx - 5.0 * s, dy - 5.0 * s, dx + 5.0 * s, dy + 5.0 * s, &c.hi, "", false);
    // what the mouse's two directions do in the ship (from the Bindings file: roll, pitch or yaw)
    let (ax, ay) = (text_of(&mo, "ax"), text_of(&mo, "ay"));
    if !ax.is_empty() { cv.g_text(px0 + rad + 2.0 * s, py0 - 4.0 * s, &ax, 8.5 * s, &c.dim, &c.glow, false, "e", 0.0, false); }
    if !ay.is_empty() { cv.g_text(px0, py0 - rad - 12.0 * s, &ay, 8.5 * s, &c.dim, &c.glow, false, "n", 0.0, false); }
    let by = py0 + rad + 8.0 * s;
    for (i, (k, lab)) in [("l", "L"), ("m", "M"), ("r", "R")].iter().enumerate() {
        let bx = px0 - 3.0 * 15.0 * s / 2.0 * 1.0 + i as f64 * 16.0 * s - 2.0 * s;
        let on = mo.get(*k).and_then(Value::as_bool).unwrap_or(false);
        cv.rect(bx, by, bx + 13.0 * s, by + 14.0 * s, if on { &c.txt } else { "" }, if on { &c.txt } else { &c.dim }, false);
        cv.g_text(bx + 6.5 * s, by + 7.0 * s, lab, 8.5 * s, if on { "#1a0d00" } else { &c.dim }, &c.glow, true, "center", 0.0, false);
    }
    let wheel = mo.get("wheel").and_then(Value::as_i64).unwrap_or(0);
    if wheel != 0 {
        let (wx, wy) = (px0 + 34.0 * s, by + 7.0 * s);
        let d = if wheel > 0 { -1.0 } else { 1.0 };
        cv.poly(vec![wx, wy + d * 5.0 * s, wx - 4.0 * s, wy - d * 3.0 * s, wx + 4.0 * s, wy - d * 3.0 * s], &c.txt, "", 1.0, false);
    }
    // the card always has the height of four rows and the mouse
    let bottom = (cy + 4.0 * row_h).max(by + 18.0 * s);
    cv.g_line(x, bottom + 2.0 * s, x + w * 0.35, bottom + 2.0 * s, &c.faint, 1.0);
    cv.g_ground(first, s, &c.line, &c.faint);
}
