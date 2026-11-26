//! BGS Watch, from glyph costs to text. The only knowledge about the content lives here:
//! influence is `d.d%`, `dd.d%` or `ddd.d%`, a word of a system name is letters, digits, `XY-Z`, `B27`, `B27-4`, `G-123`.
//! Each glyph gets the set of characters it may be in that shape, so O/0, B/8, S/5 and I/1 are settled by the company they keep.
use super::glyphs::{Glyph, Seg};
use super::tpl::{width_w, Font, FontKind};

pub type Costs = Vec<(char, f32)>;

const LETTERS: &str = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS: &str = "0123456789";
/// a gap wider than this many cap heights is a word space
pub const SPACE_GAP: f64 = 0.5;
/// width of a digit cell in cap heights (a "1" is narrow but its cell is as wide)
const DIGIT_W: f64 = 0.62;
/// the name grammar is dropped for a word when it costs this much more than the free reading
pub const GRAMMAR_SLACK: f32 = 0.8;

#[derive(Clone, Debug)]
pub struct GInfo {
    pub ch: char,
    pub cost: f32,
    pub margin: f32,
    /// the best other allowed character and its cost
    pub alt: Option<(char, f32)>,
}

#[derive(Clone, Debug, Default)]
pub struct Recog {
    pub chars: Vec<char>,
    pub space_before: Vec<bool>,
    /// cost of the worst glyph (small = good)
    pub conf: f32,
    /// smallest margin to the second best character
    pub margin: f32,
    pub glyphs: Vec<GInfo>,
}

impl Recog {
    pub fn text(&self) -> String { self.render(None) }
    fn render(&self, subst: Option<(usize, char)>) -> String {
        let mut s = String::new();
        for i in 0..self.chars.len() {
            if self.space_before[i] { s.push(' '); }
            s.push(match subst { Some((k, c)) if k == i => c, _ => self.chars[i] });
        }
        s
    }
    /// up to `k` other readings: the glyphs with the smallest margin, each with its second best character
    pub fn alternatives(&self, k: usize) -> Vec<String> {
        let mut c: Vec<(f32, usize, char)> = self.glyphs.iter().enumerate().filter_map(|(i, g)| g.alt.map(|(a, ac)| (ac - g.cost, i, a))).collect();
        c.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
        c.into_iter().take(k).map(|(_, i, a)| self.render(Some((i, a)))).collect()
    }
}

/// best char among the allowed ones: (char, cost, margin to the best other, that other)
pub fn pick(costs: &Costs, allowed: Option<&str>) -> (char, f32, f32, Option<(char, f32)>) {
    let mut items: Vec<(f32, char)> = costs.iter().filter(|(c, _)| allowed.map_or(true, |a| a.contains(*c))).map(|&(c, v)| (v, c)).collect();
    items.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    match items.as_slice() {
        [] => ('?', 9.0, 0.0, None),
        [a] => (a.1, a.0, 9.0, None),
        [a, b, ..] => (a.1, a.0, b.0 - a.0, Some((b.1, b.0))),
    }
}

fn cost_of(c: &Costs, ch: char) -> f32 { c.iter().find(|(k, _)| *k == ch).map(|x| x.1).unwrap_or(9.0) }

/// Name grammar for one word. None = no grammar fits, keep the free reading.
pub fn decode_word(costs: &[Costs]) -> Vec<Option<&'static str>> {
    let n = costs.len();
    let free: Vec<_> = costs.iter().map(|c| pick(c, None)).collect();
    let hy: Vec<bool> = free.iter().map(|f| f.0 == '-').collect();
    let mut pieces: Vec<Vec<usize>> = vec![vec![]];
    for i in 0..n {
        if hy[i] { pieces.push(vec![]); } else { pieces.last_mut().unwrap().push(i); }
    }
    if pieces.iter().any(|p| p.is_empty()) || pieces.len() > 2 { return vec![None; n]; }
    // A = letters, D = digits, L = a letter then digits
    let options: &[&[char]] = if pieces.len() == 1 { &[&['A'], &['D'], &['L']] } else { &[&['A', 'A'], &['L', 'D'], &['D', 'D'], &['A', 'D']] };
    let mut best: Option<Vec<Option<&'static str>>> = None;
    let mut best_cost = 1e9f32;
    for opt in options {
        let mut allowed: Vec<Option<&'static str>> = vec![None; n];
        let mut total = 0f32;
        let mut ok = true;
        for (kind, p) in opt.iter().zip(&pieces) {
            for (j, &i) in p.iter().enumerate() {
                let set = match kind {
                    'A' => LETTERS,
                    'D' => DIGITS,
                    _ => { if p.len() < 2 { ok = false; break; } if j == 0 { LETTERS } else { DIGITS } }
                };
                allowed[i] = Some(set);
                total += pick(&costs[i], Some(set)).1;
            }
        }
        if !ok { continue; }
        for i in 0..n {
            if hy[i] {
                allowed[i] = Some("-");
                total += cost_of(&costs[i], '-');
            }
        }
        if total < best_cost { best = Some(allowed); best_cost = total; }
    }
    let free_cost: f32 = free.iter().map(|f| f.1).sum();
    match best {
        Some(b) if best_cost - free_cost <= GRAMMAR_SLACK => b,
        _ => vec![None; n],
    }
}

/// INF text is d.d% / dd.d% / ddd.d%
pub fn decode_inf(n: usize) -> Vec<Option<&'static str>> {
    if !(4..=6).contains(&n) { return vec![None; n]; }
    let mut v: Vec<Option<&'static str>> = vec![Some(DIGITS); n - 3];
    v.extend([Some("."), Some(DIGITS), Some("%")]);
    v
}

/// Reads one segmented line. `spaces`: look for word gaps. `allowed`: only these characters (no grammar then).
pub fn recognise(seg: Option<&Seg>, font: &Font, kind: FontKind, spaces: bool, allowed: Option<&str>) -> Recog {
    recognise_mode(seg, font, kind, spaces, allowed, false)
}

pub fn recognise_mode(seg: Option<&Seg>, font: &Font, kind: FontKind, spaces: bool, allowed: Option<&str>, shift: bool) -> Recog {
    let Some(seg) = seg else { return Recog::default() };
    if seg.glyphs.is_empty() { return Recog::default(); }
    recognise_glyphs_mode(&seg.glyphs, seg.cap_h, font, kind, spaces, allowed, shift)
}

pub fn recognise_glyphs(glyphs: &[Glyph], cap_h: f64, font: &Font, kind: FontKind, spaces: bool, allowed: Option<&str>) -> Recog {
    recognise_glyphs_mode(glyphs, cap_h, font, kind, spaces, allowed, false)
}

/// `shift`: the second, shift-tolerant reading (see Font::costs_shift)
pub fn recognise_glyphs_mode(glyphs: &[Glyph], cap_h: f64, font: &Font, kind: FontKind, spaces: bool, allowed: Option<&str>, shift: bool) -> Recog {
    let ww = width_w(kind);
    let mut costs: Vec<Costs> = glyphs.iter().map(|g| if shift { font.costs_shift(g, ww) } else { font.costs(g, ww) }).collect();
    if let Some(a) = allowed { for c in costs.iter_mut() { c.retain(|(k, _)| a.contains(*k)); } }
    let n = costs.len();
    let free: Vec<char> = costs.iter().map(|c| pick(c, None).0).collect();
    let ext: Vec<(f64, f64)> = glyphs.iter().zip(&free).map(|(g, &ch)| {
        let (mut lo, mut hi) = (g.bx[0] as f64, g.bx[2] as f64);
        if ch == '1' && kind == FontKind::Name {
            let c = (lo + hi) / 2.0;
            lo = lo.min(c - DIGIT_W * cap_h / 2.0);
            hi = hi.max(c + DIGIT_W * cap_h / 2.0);
        }
        (lo, hi)
    }).collect();
    let mut space_before = vec![false; n];
    if spaces { for i in 1..n { space_before[i] = ext[i].0 - ext[i - 1].1 > SPACE_GAP * cap_h; } }
    let mut sets: Vec<Option<&'static str>> = vec![None; n];
    if allowed.is_none() {
        if kind == FontKind::Inf { sets = decode_inf(n); } else {
            let mut a = 0;
            for i in 1..=n {
                if i == n || space_before[i] {
                    let w = decode_word(&costs[a..i]);
                    for (k, s) in w.into_iter().enumerate() { sets[a + k] = s; }
                    a = i;
                }
            }
        }
    }
    let mut r = Recog { chars: vec![], space_before, conf: 0.0, margin: 9.0, glyphs: vec![] };
    for i in 0..n {
        let (ch, cost, mg, alt) = pick(&costs[i], sets[i]);
        r.chars.push(ch);
        r.conf = r.conf.max(cost);
        r.margin = r.margin.min(mg);
        r.glyphs.push(GInfo { ch, cost, margin: mg, alt });
    }
    r
}

/// cuts a segmented line into words at the word gaps
pub fn split_words(seg: &Seg) -> Vec<Vec<Glyph>> {
    let mut words: Vec<Vec<Glyph>> = Vec::new();
    let mut cur: Vec<Glyph> = Vec::new();
    let mut prev: Option<[i64; 4]> = None;
    for g in &seg.glyphs {
        if let Some(p) = prev {
            if (g.bx[0] - p[2]) as f64 > SPACE_GAP * seg.cap_h && !cur.is_empty() { words.push(std::mem::take(&mut cur)); }
        }
        cur.push(Glyph { canvas: g.canvas.clone(), wrel: g.wrel, bx: g.bx });
        prev = Some(g.bx);
    }
    if !cur.is_empty() { words.push(cur); }
    words
}
