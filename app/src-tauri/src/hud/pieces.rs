//! A window's drawing as a list of pieces (polygons, lines, texts), exactly as the plugin's game theme puts them on its canvas
//! (hud.py g_card, g_chip, g_banner and what they call): the same numbers in the same order. Painting them is paint.rs.
use super::gdi;
use crate::i18n::I18n;
use crate::pyval::{round, truthy};
use serde_json::Value;

pub const GROUND: &str = "#06040a";
pub const BASE_H: f64 = 1080.0;
/// How much larger the game's letters read in the layered windows (hud.py render: 1.2; the canvas drawing used 1.12).
pub const GAME_LARGER: f64 = 1.2;

/// (background, edge, text) of a tone.
pub fn tone(name: Option<&str>, default: &str) -> (&'static str, &'static str, &'static str) {
    match name.unwrap_or(default) {
        "red" => ("#3a0a12", "#ff4d5e", "#ffd6da"),
        "amber" => ("#33240a", "#ffb84d", "#ffe7c2"),
        "green" => ("#0b2a1a", "#3ddc84", "#d6ffe8"),
        "grey" => ("#15121b", "#9a90a8", "#d9d2e3"),
        _ => tone(Some(default), "red"),
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum Shape {
    Text { x: f64, y: f64, s: String, size: f64, bold: bool, wide: bool, fill: String, anchor: &'static str, wrap: f64 },
    Line { pts: Vec<f64>, fill: String, width: f64 },
    Poly { pts: Vec<f64>, fill: String, outline: String, width: f64, stipple: bool },
    /// A picture made elsewhere (the System map: mapcap.rs), drawn in this box; `id` says which one (the painter looks it up).
    Image { x: f64, y: f64, w: f64, h: f64, id: u64 },
}

#[derive(Clone, Debug, PartialEq)]
pub struct Piece {
    pub shape: Shape,
    pub glow: bool,
    pub ground: bool,
}

pub fn mix(a: &str, b: &str, t: f64) -> String {
    let p = |s: &str, i: usize| s.trim_start_matches('#').get(i..i + 2).and_then(|x| i64::from_str_radix(x, 16).ok()).unwrap_or(0) as f64;
    let c = |i: usize| round(p(a, i) + (p(b, i) - p(a, i)) * t);
    format!("#{:02x}{:02x}{:02x}", c(0), c(2), c(4))
}

/// hud.py count_colour: the countdown's colour, apart from the window's own.
pub fn count_colour(col: &str) -> &'static str {
    let h = col.trim_start_matches('#');
    let ch = |i: usize| h.get(i..i + 2).and_then(|x| u8::from_str_radix(x, 16).ok()).map(|v| v as f64 / 255.0);
    let (Some(r), Some(g), Some(b)) = (ch(0), ch(2), ch(4)) else { return "#ff3b4e" };
    let (hi, lo) = (r.max(g).max(b), r.min(g).min(b));
    if hi - lo < 0.15 { return "#ff3b4e"; }
    let hue = if hi == r { (60.0 * ((g - b) / (hi - lo))).rem_euclid(360.0) } else if hi == g { 60.0 * ((b - r) / (hi - lo)) + 120.0 } else { 60.0 * ((r - g) / (hi - lo)) + 240.0 };
    if hue < 15.0 || hue > 330.0 { "#22e1ff" } else { "#ff3b4e" }
}

pub(super) struct Colours { pub hi: String, pub txt: String, pub dim: String, pub line: String, pub faint: String, pub glow: String }

pub(super) fn colours(col: &str) -> Colours {
    Colours { hi: mix(col, "#ffffff", 0.22), txt: col.to_string(), dim: mix(col, "#000000", 0.3), line: mix(col, "#000000", 0.15), faint: mix(col, "#000000", 0.68), glow: mix(col, "#000000", 0.8) }
}

fn lines_of(text: &str, size: f64, bold: bool, wide: bool, wrap: f64) -> Vec<String> {
    let mut out = Vec::new();
    for para in text.split('\n') {
        if wrap <= 0.0 { out.push(para.to_string()); continue; }
        let room = round(wrap).max(1) as f64; // (Tk is given whole pixels)
        let mut cur = String::new();
        for word in para.split(' ') {
            let t = if cur.is_empty() { word.to_string() } else { format!("{cur} {word}") };
            if !cur.is_empty() && px(&t, size, bold, wide) > room { out.push(std::mem::take(&mut cur)); cur = word.to_string(); } else { cur = t; }
        }
        out.push(cur);
    }
    out
}

fn px(s: &str, size: f64, bold: bool, wide: bool) -> f64 {
    let p = crate::hud::font::tk_px(size) as i32;
    if s.chars().any(|c| ('\u{400}'..='\u{4FF}').contains(&c)) {
        // The game-style fonts have no Cyrillic: Tk measured those letters in a font of its own choice, and the plugin laid its cards out with
        // that. The widths it gave are kept (data/tk_cyrillic.json), so a Russian card is laid out as the plugin laid it out.
        return s.chars().map(|c| crate::hud::font::tk_cyrillic(c, p, bold, wide).unwrap_or_else(|| gdi::measure_h(&c.to_string(), -p, bold, wide, 0))).sum();
    }
    gdi::measure_h(s, -p, bold, wide, 0)
}

pub struct Canvas<'a> {
    pub items: Vec<Piece>,
    tr: &'a I18n,
    /// the dark ground behind a panel (the plugin's setting `bg`, off by default)
    pub bg: bool,
}

type Box4 = (f64, f64, f64, f64);

impl<'a> Canvas<'a> {
    pub fn new(tr: &'a I18n, bg: bool) -> Self { Canvas { items: Vec::new(), tr, bg } }

    pub(super) fn push(&mut self, shape: Shape, glow: bool) -> usize {
        self.items.push(Piece { shape, glow, ground: false });
        self.items.len() - 1
    }

    pub fn measure(&self, s: &str, size: f64, bold: bool, wide: bool) -> f64 { px(s, size, bold, wide) }

    /// The text's box as Tk reports it (canvas bbox): whole pixels, one beyond the letters on each side.
    pub fn text_box(&self, i: usize) -> Box4 {
        let Shape::Text { x, y, s, size, bold, wide, anchor, wrap, .. } = &self.items[i].shape else { return (0.0, 0.0, 0.0, 0.0) };
        let lines = lines_of(s, *size, *bold, *wide, *wrap);
        let w = lines.iter().map(|l| px(l, *size, *bold, *wide)).fold(0.0, f64::max);
        let h = gdi::line_height(-(crate::hud::font::tk_px(*size) as i32), *bold, *wide) * lines.len() as f64;
        let left = if *anchor == "center" || *anchor == "n" || *anchor == "s" { x - w / 2.0 } else if anchor.contains('e') { x - w } else { *x };
        let top = if anchor.starts_with('n') { *y } else if anchor.starts_with('s') { y - h } else { (y + 0.5).floor() - (h / 2.0).floor() };
        let (x0, y0) = ((left + 0.5).floor() - 1.0, (top + 0.5).floor());
        (x0, y0, x0 + w + 2.0, y0 + h)
    }

    /// Tk's bbox of one piece.
    pub fn bbox_of(&self, i: usize) -> Option<Box4> {
        match &self.items[i].shape {
            Shape::Text { .. } => Some(self.text_box(i)),
            Shape::Line { pts, fill, width } => {
                // Tk's canvas rules, fitted on 1,968 real cards (every one exact): the whole width each side, one pixel of margin
                let w = if fill.is_empty() { 1.0 } else { width.max(1.0) };
                let e = raw(pts);
                let up = |v: f64| (v + 0.5).floor();
                Some(((e.0 - w).trunc() - 1.0, (e.1 - w).trunc() - 1.0, up(e.2 + w) + 1.0, up(e.3 + w) + 1.0))
            }
            Shape::Image { x, y, w, h, .. } => Some((*x, *y, x + w, y + h)),
            Shape::Poly { pts, outline, width, .. } => {
                let e = raw(pts);
                Some(if outline.is_empty() {
                    (e.0.trunc() - 1.0, e.1.trunc() - 1.0, e.2.trunc() + 2.0, e.3.trunc() + 2.0)
                } else {
                    let pad = ((width.max(1.0).trunc() + 1.0) / 2.0).trunc();
                    let up = |v: f64| (v + 0.5).floor();
                    ((e.0 - pad).trunc() - 1.0, (e.1 - pad).trunc() - 1.0, up(e.2 + pad) + 1.0, up(e.3 + pad) + 1.0)
                })
            }
        }
    }

    /// The box of the pieces that are not the dark ground (where the window goes is decided by what it shows).
    pub fn bbox_no_ground(&self) -> Option<Box4> {
        let mut b: Option<Box4> = None;
        for i in 0..self.items.len() {
            if self.items[i].ground { continue; }
            if let Some(q) = self.bbox_of(i) {
                b = Some(match b { None => q, Some(a) => (a.0.min(q.0), a.1.min(q.1), a.2.max(q.2), a.3.max(q.3)) });
            }
        }
        b
    }

    pub fn bbox(&self, from: usize) -> Option<Box4> {
        let mut b: Option<Box4> = None;
        for i in from..self.items.len() {
            if self.items[i].glow && false { continue; }
            if let Some(q) = self.bbox_of(i) {
                b = Some(match b { None => q, Some(a) => (a.0.min(q.0), a.1.min(q.1), a.2.max(q.2), a.3.max(q.3)) });
            }
        }
        b
    }

    // ---- the primitives (hud.py text, rect, g_text, g_line)
    #[allow(clippy::too_many_arguments)]
    pub fn text(&mut self, x: f64, y: f64, s: &str, size: f64, fill: &str, bold: bool, anchor: &'static str, wrap: f64, wide: bool) -> usize {
        self.push(Shape::Text { x, y, s: s.to_string(), size, bold, wide, fill: fill.to_string(), anchor, wrap }, false)
    }

    /// A text with the game's soft glow round it (two dark copies just behind it).
    #[allow(clippy::too_many_arguments)]
    pub fn g_text(&mut self, x: f64, y: f64, s: &str, size: f64, colour: &str, glow: &str, bold: bool, anchor: &'static str, wrap: f64, wide: bool) -> usize {
        for (dx, dy) in [(1.0, 1.0), (-1.0, 0.0)] {
            let i = self.text(x + dx, y + dy, s, size, glow, bold, anchor, wrap, wide);
            self.items[i].glow = true;
        }
        self.text(x, y, s, size, colour, bold, anchor, wrap, wide)
    }

    pub fn g_line(&mut self, x1: f64, y1: f64, x2: f64, y2: f64, colour: &str, w: f64) {
        self.push(Shape::Line { pts: vec![x1, y1, x2, y2], fill: colour.to_string(), width: round(w).max(1) as f64 }, false);
    }

    pub fn poly(&mut self, pts: Vec<f64>, fill: &str, outline: &str, width: f64, stipple: bool) {
        self.push(Shape::Poly { pts, fill: fill.to_string(), outline: outline.to_string(), width, stipple }, false);
    }

    pub fn rect(&mut self, x1: f64, y1: f64, x2: f64, y2: f64, fill: &str, outline: &str, stipple: bool) {
        self.poly(vec![x1, y1, x2, y1, x2, y2, x1, y2], fill, outline, 1.0, stipple);
    }

    /// The largest size (down to 60 %) at which s fits in room.
    pub fn fit(&self, s: &str, size: f64, bold: bool, room: f64, wide: bool) -> f64 {
        let mut sz = size;
        while sz > size * 0.6 && px(s, sz, bold, wide) > room { sz -= 1.0; }
        sz
    }

    /// One line in room: down to 85 % of its size, then cut short with "…".
    pub fn clip(&self, s: &str, size: f64, bold: bool, room: f64) -> (String, f64) {
        let sz = self.fit(s, size, bold, room, false).max(size * 0.85);
        let mut s: Vec<char> = s.chars().collect();
        let whole: String = s.iter().collect();
        if px(&whole, sz, bold, false) <= room { return (whole, sz); }
        let trim = |v: &[char]| -> String { v.iter().collect::<String>().trim_end_matches([' ', '·']).to_string() };
        while !s.is_empty() && px(&format!("{}…", trim(&s)), sz, bold, false) > room { s.pop(); }
        (format!("{}…", trim(&s)), sz)
    }

    pub(super) fn g_head(&mut self, x: f64, y: f64, w: f64, s: f64, title: &str, c: &Colours, badge: Option<(&str, &str)>) -> f64 {
        self.g_text(x + 2.0 * s, y, &title.to_uppercase(), 11.5 * s, &c.hi, &c.glow, false, "nw", 0.0, true);
        let ly = y + 21.0 * s;
        self.poly(vec![x, ly - 3.0 * s, x + 26.0 * s, ly - 3.0 * s, x + 22.0 * s, ly + 1.0 * s, x, ly + 1.0 * s], &c.txt, "", 1.0, false);
        self.g_line(x + 26.0 * s, ly - 1.0 * s, x + w, ly - 1.0 * s, &c.line, 1.6 * s);
        if let Some((bt, tn)) = badge {
            let edge = tone(Some(tn), "green").1;
            let bw = px(bt, 10.0 * s, true, false) + 14.0 * s;
            self.poly(vec![x + w - bw, y - 2.0 * s, x + w, y - 2.0 * s, x + w, y + 15.0 * s, x + w - bw, y + 15.0 * s], "", edge, 1.0, false);
            self.g_text(x + w - bw / 2.0, y + 6.5 * s, bt, 10.0 * s, edge, &c.glow, true, "center", 0.0, false);
        }
        ly + 9.0 * s
    }

    /// A bar in segments, like the game's fuel and shield bars.
    fn g_bar(&mut self, x1: f64, x2: f64, y: f64, h: f64, v: Option<f64>, c_txt: &str, c_faint: &str) {
        let (seg, gap) = ((h * 1.6).max(3.0), (h * 0.45).max(1.0));
        let n = (((x2 - x1 + gap) / (seg + gap)).floor() as i64).max(1);
        let on = match v { None => 0, Some(v) => round(n as f64 * v.clamp(0.0, 100.0) / 100.0) };
        let fill = if v.is_some_and(|v| v < 25.0) { "#ff3b30" } else { c_txt };
        for i in 0..n {
            let a = x1 + i as f64 * (seg + gap);
            self.rect(a, y, a + seg, y + h, if i < on { fill } else { c_faint }, "", false);
        }
    }

    /// SrvSurvey's ground: dark and see-through behind the panel, a thin orange line along its top and its bottom.
    pub(super) fn g_ground(&mut self, first: usize, s: f64, line: &str, faint: &str) {
        if !self.bg { return; }
        let Some(b) = self.bbox(first) else { return };
        let p = 9.0 * s;
        let (x1, y1, x2, y2) = (b.0 - p, b.1 - p, b.2 + p, b.3 + p);
        let w = round(1.4 * s).max(1) as f64;
        let mut mk = |shape: Shape| Piece { shape, glow: false, ground: true };
        let g = mk(Shape::Poly { pts: vec![x1, y1, x2, y1, x2, y2, x1, y2], fill: GROUND.into(), outline: String::new(), width: 1.0, stipple: true });
        let top = mk(Shape::Line { pts: vec![x1 + 2.0, y1 + 2.0, x2 - 2.0, y1 + 2.0], fill: line.into(), width: w });
        let bot = mk(Shape::Line { pts: vec![x1 + 2.0, y2 - 2.0, x2 - 2.0, y2 - 2.0], fill: faint.into(), width: w });
        // lowered below the card's first piece, one after the other: bottom line, top line, the ground
        self.items.splice(first..first, [bot, top, g]);
    }
}

fn raw(pts: &[f64]) -> Box4 {
    let (mut x0, mut y0, mut x1, mut y1) = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
    for p in pts.chunks(2) {
        x0 = x0.min(p[0]); x1 = x1.max(p[0]); y0 = y0.min(p[1]); y1 = y1.max(p[1]);
    }
    (x0, y0, x1, y1)
}

fn sv(v: &Value) -> String { crate::pyval::py_str(v) }
fn upper(s: &str) -> String { s.to_uppercase() }
fn get_s(m: &Value, k: &str) -> String { match m.get(k) { Some(Value::String(s)) => s.clone(), _ => String::new() } }

/// hud.py g_card.
pub fn g_card(cv: &mut Canvas, m: &Value, x: f64, y: f64, s: f64, col: &str) {
    let c = colours(col);
    let first = cv.items.len();
    cv.push(Shape::Line { pts: vec![x, y, x, y], fill: String::new(), width: 1.0 }, false);
    let w = match m.get("mapw").and_then(Value::as_f64) {
        Some(mw) => round(mw * s) as f64,
        None => round(if truthy(m.get("wide")) { 460.0 } else if truthy(m.get("cols")) { 400.0 } else { 330.0 } as f64 * s) as f64,
    };
    let badge = m.get("badge").and_then(|b| b.as_array()).filter(|b| b.len() == 2 && truthy(Some(&b[0]))).map(|b| (b[0].as_str().unwrap_or(""), b[1].as_str().unwrap_or("")));
    let mut cy = cv.g_head(x, y, w, s, &get_s(m, "title"), &c, badge);
    if truthy(m.get("head")) {
        cv.g_text(x, cy, &upper(&get_s(m, "head")), 17.0 * s, &c.hi, &c.glow, true, "nw", w, false);
        cy += 23.0 * s;
    }
    if truthy(m.get("head2")) {
        cv.g_text(x, cy, &upper(&get_s(m, "head2")), 11.5 * s, &c.dim, &c.glow, false, "nw", w, false);
        cy += 19.0 * s;
    }
    if truthy(m.get("head")) || truthy(m.get("head2")) { cy += 4.0 * s; }
    // the System map: a picture of the site's own map, as wide as the card
    if let Some(mp) = m.get("map") {
        let (id, pw, ph) = (mp.get("id").and_then(Value::as_u64).unwrap_or(0), mp.get("w").and_then(Value::as_f64).unwrap_or(1.0).max(1.0), mp.get("h").and_then(Value::as_f64).unwrap_or(1.0));
        let ih = (w * ph / pw).round();
        cv.push(Shape::Image { x, y: cy, w, h: ih, id }, false);
        cy += ih + 6.0 * s;
    }
    for b in m.get("bars").and_then(|b| b.as_array()).into_iter().flatten() {
        let (lab, v) = (sv(&b[0]), b.get(1).filter(|v| !v.is_null()).and_then(|v| crate::pyval::as_float(Some(v))));
        cv.g_text(x, cy, &lab, 10.5 * s, &c.dim, &c.glow, true, "nw", 0.0, false);
        let pct = match v { None => "—".to_string(), Some(v) => format!("{}%", round(v)) };
        cv.g_text(x + w, cy, &pct, 11.5 * s, &c.hi, &c.glow, true, "ne", 0.0, false);
        cy += 17.0 * s;
        let bh = round(5.0 * s).max(3) as f64;
        cv.g_bar(x, x + w, cy, bh, v, &c.txt, &c.faint);
        cy += bh + 9.0 * s;
    }
    let tiles: Vec<&Value> = m.get("tiles").and_then(|t| t.as_array()).map(|t| t.iter().collect()).unwrap_or_default();
    if !tiles.is_empty() {
        let n = if tiles.len() > 2 { 3 } else { 2 };
        let tw = w / n as f64;
        for (i, t) in tiles.iter().enumerate() {
            let (lab, val) = (sv(&t[0]), sv(&t[1]));
            let (cx, ty) = (x + (i % n) as f64 * tw, cy + (i / n) as f64 * 50.0 * s);
            if i % n != 0 { cv.g_line(cx - 6.0 * s, ty + 4.0 * s, cx - 6.0 * s, ty + 40.0 * s, &c.faint, 1.0); }
            let sz = cv.fit(&val, 19.0 * s, true, tw - 14.0 * s, false);
            cv.g_text(cx, ty, &val, sz, &c.hi, &c.glow, true, "nw", 0.0, false);
            cv.g_text(cx, ty + 26.0 * s, &lab, 9.5 * s, &c.dim, &c.glow, true, "nw", 0.0, false);
        }
        cy += tiles.len().div_ceil(n) as f64 * 50.0 * s + 4.0 * s;
    }
    let mut sections: Vec<(String, Value, Vec<Value>)> = m.get("sections").and_then(|t| t.as_array()).into_iter().flatten()
        .map(|sec| (sv(&sec[0]), sec[1].clone(), sec[2].as_array().cloned().unwrap_or_default())).collect();
    if truthy(m.get("rows")) {
        sections.insert(0, (String::new(), m.get("cols").cloned().unwrap_or(Value::Null), m["rows"].as_array().cloned().unwrap_or_default()));
    }
    for (head, kind, rows) in &sections {
        if !head.is_empty() {
            cy += 4.0 * s;
            cv.g_text(x, cy, head, 9.5 * s, &c.txt, &c.glow, false, "nw", 0.0, true);
            cv.g_line(x, cy + 16.0 * s, x + w, cy + 16.0 * s, &c.faint, 1.0);
            cy += 22.0 * s;
        }
        for (i, r) in rows.iter().enumerate() {
            if i > 0 { cv.g_line(x, cy - 4.0 * s, x + w, cy - 4.0 * s, &c.faint, 1.0); }
            let cell = |k: usize| r.get(k).cloned().unwrap_or(Value::Null);
            if kind.as_str() == Some("rank") {
                let best = r.as_array().is_some_and(|a| a.len() > 5) && truthy(r.get(5));
                let locked = r.as_array().is_some_and(|a| a.len() > 6) && truthy(r.get(6));
                let val = sv(&cell(3));
                let money = val.chars().next().is_some_and(|ch| ch.is_ascii_digit());
                let (sh, h) = match r.get(4) { Some(Value::Array(a)) if !a.is_empty() => (a.first().cloned().unwrap_or(Value::Null), a.get(1).cloned().unwrap_or(Value::Null)), _ => (Value::Null, Value::Null) };
                if locked {
                    let row_h = if !sh.is_null() { 48.0 * s } else { 40.0 * s };
                    cv.rect(x - 4.0 * s, cy - 4.0 * s, x + w + 4.0 * s, cy - 4.0 * s + row_h, &mix(col, "#000000", 0.72), col, false);
                }
                let vw = px(&upper(&val), (if money { 14.0 } else { 11.0 }) * s, true, false).max(76.0 * s);
                let room = w - 22.0 * s - vw - 10.0 * s;
                cv.g_text(x, cy, &sv(&cell(0)), 13.0 * s, &c.txt, &c.glow, true, "nw", 0.0, false);
                let name = format!("{}{}", if locked { ">>> " } else { "" }, sv(&cell(1)));
                let (t1, z1) = cv.clip(&upper(&name), 13.0 * s, true, room);
                cv.g_text(x + 22.0 * s, cy, &t1, z1, &c.hi, &c.glow, true, "nw", 0.0, false);
                let (t2, z2) = cv.clip(&upper(&sv(&cell(2))), 10.5 * s, false, room);
                cv.g_text(x + 22.0 * s, cy + 18.0 * s, &t2, z2, &c.dim, &c.glow, false, "nw", 0.0, false);
                cv.g_text(x + w, cy + 2.0 * s, &upper(&val), (if money { 14.0 } else { 11.0 }) * s, if best || locked { &c.hi } else { &c.txt }, &c.glow, true, "ne", 0.0, false);
                if money {
                    let tail = if best { format!("  · {}", cv.tr.t0("targets.top")) } else { String::new() };
                    cv.g_text(x + w, cy + 20.0 * s, &format!("CR{tail}"), 9.5 * s, &c.dim, &c.glow, false, "ne", 0.0, false);
                }
                if !sh.is_null() {
                    let (bw, bx) = (76.0 * s, x + w - 76.0 * s);
                    let bh = round(3.0 * s).max(2) as f64;
                    cv.g_bar(bx, bx + bw, cy + 36.0 * s, bh, crate::pyval::as_float(Some(&sh)), "#5aa9ff", &c.faint);
                    cv.g_bar(bx, bx + bw, cy + 41.0 * s, bh, h.as_f64().or_else(|| crate::pyval::as_float(Some(&h))), &c.txt, &c.faint);
                    cy += 8.0 * s;
                }
                cy += 40.0 * s;
            } else {
                let (v0, v1) = (sv(&cell(0)), sv(&cell(1)));
                let v2 = if truthy(Some(&cell(2))) { sv(&cell(2)) } else { String::new() };
                let (t1, z1) = cv.clip(&upper(&v1), 13.0 * s, true, w - px(&v0, 14.0 * s, true, false) - 14.0 * s);
                if !v2.is_empty() {
                    cv.g_text(x, cy, &t1, z1, &c.hi, &c.glow, true, "nw", 0.0, false);
                    let i2 = cv.g_text(x, cy + 18.0 * s, &upper(&v2), 10.5 * s, &c.dim, &c.glow, false, "nw", w * 0.6, false);
                    let b = cv.text_box(i2);
                    cv.g_text(x + w, cy + 6.0 * s, &v0, 14.0 * s, &c.txt, &c.glow, true, "ne", 0.0, false);
                    cy = (cy + 40.0 * s).max(b.3 + 8.0 * s);
                } else {
                    cv.g_text(x, cy + 3.0 * s, &t1, z1, &c.hi, &c.glow, true, "nw", 0.0, false);
                    cv.g_text(x + w, cy + 3.0 * s, &v0, 11.0 * s, &c.txt, &c.glow, true, "ne", 0.0, false);
                    cy += 22.0 * s;
                }
            }
        }
    }
    if truthy(m.get("note")) {
        let t = cv.g_text(x, cy + 2.0 * s, &upper(&get_s(m, "note")), 9.5 * s, &c.dim, &c.glow, false, "nw", w, false);
        let b = cv.text_box(t);
        cy += (b.3 - b.1) + 4.0 * s;
    }
    if let Some(cnt) = m.get("count").filter(|v| truthy(Some(v))).and_then(|v| v.as_array()) {
        let size = 10.0 * s;
        let (t1, t2, t3) = (upper(&sv(&cnt[0])), sv(&cnt[1]), upper(&sv(&cnt[2])));
        let (yy, gap) = (cy + 2.0 * s, 0.45 * size);
        cv.g_text(x, yy, &t1, size, &c.dim, &c.glow, false, "nw", 0.0, false);
        let x2 = x + px(&t1, size, false, false) + gap;
        cv.g_text(x2, yy, &t2, size, count_colour(col), &c.glow, true, "nw", 0.0, false);
        cv.g_text(x2 + px(&t2, size, true, false) + gap, yy, &t3, size, &c.dim, &c.glow, false, "nw", 0.0, false);
        cy += gdi::line_height(-(crate::hud::font::tk_px(size) as i32), false, false) + 4.0 * s;
    }
    cv.g_line(x, cy + 2.0 * s, x + w * 0.35, cy + 2.0 * s, &c.faint, 1.0);
    cv.g_ground(first, s, &c.line, &c.faint);
}

/// hud.py g_chip: like the game's INFO label, the word in a thin frame, what it means beside it.
pub fn g_chip(cv: &mut Canvas, m: &Value, x: f64, y: f64, s: f64, _col: &str) {
    let first = cv.items.len();
    cv.push(Shape::Line { pts: vec![x, y, x, y], fill: String::new(), width: 1.0 }, false);
    let (_, edge, _) = tone(m.get("tone").and_then(|t| t.as_str()), "red");
    let glow = mix(edge, "#000000", 0.8);
    let (f1, f2) = (14.0 * s, 12.5 * s);
    let t = upper(&get_s(m, "text"));
    let w1 = px(&t, f1, true, true);
    let (pad, h) = (9.0 * s, 28.0 * s);
    cv.poly(vec![x, y, x + w1 + pad * 2.0, y, x + w1 + pad * 2.0, y + h, x, y + h], "", edge, round(1.4 * s).max(1) as f64, false);
    cv.g_text(x + pad, y + h / 2.0, &t, f1, edge, &glow, true, "w", 0.0, true);
    let sub = upper(&get_s(m, "sub"));
    if !sub.is_empty() {
        cv.g_text(x + w1 + pad * 3.0, y + h / 2.0, &sub, f2, &mix(edge, "#ffffff", 0.25), &glow, false, "w", 0.0, false);
        let sw = px(&sub, f2, false, false);
        cv.g_line(x + w1 + pad * 2.0, y + h, x + w1 + pad * 3.0 + sw, y + h, &mix(edge, "#000000", 0.4), 1.2 * s);
    }
    cv.g_ground(first, s, &mix(edge, "#000000", 0.2), &mix(edge, "#000000", 0.65));
}

/// hud.py g_banner: the fight has started, COMBAT in the game's wide letters between two lines.
pub fn g_banner(cv: &mut Canvas, m: &Value, x: f64, y: f64, s: f64, _col: &str) {
    let red = "#ff3b30";
    let glow = mix(red, "#000000", 0.78);
    let spaced = |t: &str| t.chars().map(String::from).collect::<Vec<_>>().join(" ");
    let big = spaced(&if m.get("text").is_some() { get_s(m, "text") } else { "COMBAT".to_string() });
    let sub = get_s(m, "sub");
    let (f1, f2) = (44.0 * s, 13.0 * s);
    let w = px(&big, f1, true, true).max(px(&sub, f2, false, false)) + 40.0 * s;
    cv.g_line(x, y, x + w, y, red, 2.0 * s);
    cv.poly(vec![x, y, x + 40.0 * s, y, x + 34.0 * s, y + 6.0 * s, x, y + 6.0 * s], red, "", 1.0, false);
    cv.g_text(x + w / 2.0, y + 12.0 * s, &spaced("GRAVITAS"), 10.0 * s, &mix(red, "#ffffff", 0.3), &glow, false, "n", 0.0, true);
    cv.g_text(x + w / 2.0, y + 28.0 * s, &big, f1, red, &glow, true, "n", 0.0, true);
    cv.g_text(x + w / 2.0, y + 90.0 * s, &upper(&sub), f2, &mix(red, "#ffffff", 0.3), &glow, false, "n", 0.0, false);
    cv.g_line(x, y + 112.0 * s, x + w, y + 112.0 * s, &mix(red, "#000000", 0.35), 1.4 * s);
}

/// settings.py auto_pct: Auto size from the game window's height (a smaller screen leaves less room round the game's own panels).
pub fn auto_pct(h: f64) -> f64 {
    if h >= 1300.0 { 100.0 } else if h >= 1000.0 { 90.0 } else { 80.0 }
}

/// The scale of a game window of this height: hud.py render_canvas.
pub fn scale(h: f64, user_scale: f64) -> f64 {
    (h / BASE_H).max(0.6) * user_scale * GAME_LARGER
}

/// Draw one window: its pieces, from the card model (kind "chip", "banner", or a card).
pub fn draw(tr: &I18n, m: &Value, x: f64, y: f64, s: f64, col: &str, bg: bool) -> Vec<Piece> {
    let mut cv = Canvas::new(tr, bg);
    match m.get("kind").and_then(|k| k.as_str()) {
        Some("chip") => g_chip(&mut cv, m, x, y, s, col),
        Some("banner") => g_banner(&mut cv, m, x, y, s, col),
        Some("inputs") => super::pieces_db::g_inputs(&mut cv, m, x, y, s, col),
        _ => g_card(&mut cv, m, x, y, s, col),
    }
    cv.items
}

/// Like `draw` but keeps the canvas (for boxes).
pub fn draw_canvas<'a>(tr: &'a I18n, m: &Value, x: f64, y: f64, s: f64, col: &str, bg: bool) -> Canvas<'a> {
    let mut cv = Canvas::new(tr, bg);
    match m.get("kind").and_then(|k| k.as_str()) {
        Some("chip") => g_chip(&mut cv, m, x, y, s, col),
        Some("banner") => g_banner(&mut cv, m, x, y, s, col),
        Some("inputs") => super::pieces_db::g_inputs(&mut cv, m, x, y, s, col),
        _ => g_card(&mut cv, m, x, y, s, col),
    }
    cv
}

#[cfg(test)]
mod colour_tests {
    use super::mix;

    /// A colour from a hand-edited file ("red", "", "é", "#12") must never panic the painter.
    #[test]
    fn a_broken_colour_does_not_panic_the_painter() {
        for bad in ["red", "", "é", "#12", "#", "#ééé", "zzzzzz", "#ff"] {
            let r = mix(bad, "#ff8800", 0.5);
            assert!(r.starts_with('#') && r.len() == 7, "{bad} gave {r}");
            let r = mix("#336699", bad, 0.5);
            assert!(r.starts_with('#') && r.len() == 7, "{bad} gave {r}");
        }
        assert_eq!(mix("#000000", "#ffffff", 0.5), "#808080");
    }
}
