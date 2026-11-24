//! planes.py: the game's own panels as planes (perspective), the free areas beside opened panels, and the perspective map between them.
//! Measured by CMDR Hongark at 2560 x 1440 on a 2000 x 1125 guide, kept from the window's centre in heights.
pub type P2 = (f64, f64);

const GUIDE_W: f64 = 2000.0;
const GUIDE_H: f64 = 1125.0;
const COMMS_TOP: [P2; 2] = [(155.0, 109.0), (653.0, 196.5)];
const INFO_TOP: [P2; 2] = [(1306.0, 194.0), (1836.0, 95.0)];
const LEFT_PANEL: [P2; 4] = [(349.0, 301.0), (1309.0, 286.0), (1324.0, 797.0), (390.0, 891.0)];
const RIGHT_PANEL: [P2; 4] = [(683.0, 282.0), (1684.0, 293.0), (1641.0, 887.0), (671.0, 791.0)];
const NEAR: f64 = 1.154;
const DEPTH: f64 = 0.50;

/// (u, v) where each plane's first window starts; u None = on the right of its plane (INFO) or on the left of the right panel.
pub fn slot(name: &str) -> (Option<f64>, f64) {
    match name { "comms" => (Some(0.0), 0.40), "info" => (None, 0.32), "left" => (Some(1.03), 0.0), _ => (None, 0.0) }
}
pub const GAP: f64 = 0.025;
pub const AREA_GAP: f64 = 0.012;
pub const MID_Y0: f64 = 0.17;

pub fn area_guide(name: &str) -> Option<(f64, f64, f64, f64)> {
    Some(match name {
        "comms_a" => (13.0, 11.0, 467.0, 731.0),
        "comms_b" => (489.0, 12.0, 942.0, 156.0),
        "role_a" => (26.0, 307.0, 501.0, 836.0),
        "role_b" => (547.0, 186.0, 1391.0, 309.0),
        "right_t" => (700.0, 120.0, 1660.0, 272.0),
        _ => return None,
    })
}

pub fn to_screen(p: P2, w: f64, h: f64) -> P2 {
    (w / 2.0 + (p.0 - GUIDE_W / 2.0) / GUIDE_H * h, p.1 / GUIDE_H * h)
}

fn front_plane(top: [P2; 2], near_left: bool, w: f64, h: f64) -> [P2; 4] {
    let (a, b) = (to_screen(top[0], w, h), to_screen(top[1], w, h));
    let d = DEPTH * h;
    let (hl, hr) = if near_left { (d, d / NEAR) } else { (d / NEAR, d) };
    [a, b, (b.0, b.1 + hr), (a.0, a.1 + hl)]
}

pub fn plane(name: &str, w: f64, h: f64) -> Option<[P2; 4]> {
    Some(match name {
        "comms" => front_plane(COMMS_TOP, true, w, h),
        "info" => front_plane(INFO_TOP, false, w, h),
        "left" => LEFT_PANEL.map(|p| to_screen(p, w, h)),
        "right" => RIGHT_PANEL.map(|p| to_screen(p, w, h)),
        _ => return None,
    })
}

/// (left, top, right, bottom) of an area on a w x h window.
pub fn area(name: &str, w: f64, h: f64) -> Option<(f64, f64, f64, f64)> {
    let (x0, y0, x1, y1) = area_guide(name)?;
    let (a, b) = (to_screen((x0, y0), w, h), to_screen((x1, y1), w, h));
    Some((a.0, a.1, b.0, b.1))
}

fn solve(a: Vec<Vec<f64>>, b: Vec<f64>) -> Option<Vec<f64>> {
    let n = b.len();
    let mut m: Vec<Vec<f64>> = a.into_iter().zip(b).map(|(mut r, v)| { r.push(v); r }).collect();
    for c in 0..n {
        let p = (c..n).max_by(|&i, &j| m[i][c].abs().partial_cmp(&m[j][c].abs()).unwrap_or(std::cmp::Ordering::Equal))?;
        if m[p][c].abs() < 1e-12 { return None; }
        m.swap(c, p);
        for r in 0..n {
            if r != c {
                let f = m[r][c] / m[c][c];
                let row_c = m[c].clone();
                for (x, y) in m[r].iter_mut().zip(row_c) { *x -= f * y; }
            }
        }
    }
    Some((0..n).map(|i| m[i][n] / m[i][i]).collect())
}

/// The perspective map that takes the four points src to the four points dst (nine numbers, the last 1).
pub fn homography(src: &[P2], dst: &[P2]) -> Option<[f64; 9]> {
    let (mut a, mut b) = (Vec::new(), Vec::new());
    for (&(x, y), &(u, v)) in src.iter().zip(dst) {
        a.push(vec![x, y, 1.0, 0.0, 0.0, 0.0, -u * x, -u * y]);
        b.push(u);
        a.push(vec![0.0, 0.0, 0.0, x, y, 1.0, -v * x, -v * y]);
        b.push(v);
    }
    let h = solve(a, b)?;
    Some([h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1.0])
}

pub fn apply(h: &[f64; 9], x: f64, y: f64) -> P2 {
    let w = h[6] * x + h[7] * y + h[8];
    ((h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w)
}

/// A plane's size as if seen flat (pixels).
pub fn size(q: &[P2; 4]) -> (f64, f64) {
    let d = |a: P2, b: P2| ((a.0 - b.0).powi(2) + (a.1 - b.1).powi(2)).sqrt();
    ((d(q[0], q[1]) + d(q[3], q[2])) / 2.0, (d(q[0], q[3]) + d(q[1], q[2])) / 2.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn n(v: &Value) -> f64 { v.as_f64().unwrap() }

    #[test]
    fn planes_match_the_plugin() {
        let Ok(t) = std::fs::read_to_string(crate::host::parity::golden_dir().join("planes_golden.json")) else { println!("SKIP"); return };
        let d: Value = serde_json::from_str(&t).unwrap();
        let close = |a: f64, b: f64| (a - b).abs() < 1e-6 * b.abs().max(1.0);
        let mut count = 0;
        for p in d["planes"].as_array().unwrap() {
            let (name, w, h) = (p[0].as_str().unwrap(), n(&p[1]), n(&p[2]));
            let q = plane(name, w, h).unwrap();
            for (i, c) in p[3].as_array().unwrap().iter().enumerate() {
                assert!(close(q[i].0, n(&c[0])) && close(q[i].1, n(&c[1])), "{name} {w}x{h} corner {i}");
            }
            let s = size(&q);
            assert!(close(s.0, n(&p[4][0])) && close(s.1, n(&p[4][1])), "{name} size");
            count += 1;
        }
        for a in d["areas"].as_array().unwrap() {
            let r = area(a[0].as_str().unwrap(), n(&a[1]), n(&a[2])).unwrap();
            let g: Vec<f64> = a[3].as_array().unwrap().iter().map(n).collect();
            assert!(close(r.0, g[0]) && close(r.1, g[1]) && close(r.2, g[2]) && close(r.3, g[3]), "area {}", a[0]);
            count += 1;
        }
        for h in d["hom"].as_array().unwrap() {
            let q = plane("info", n(&h[0]), n(&h[1])).unwrap();
            let m = homography(&[(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)], &q).unwrap();
            for (i, v) in h[2].as_array().unwrap().iter().enumerate() { assert!(close(m[i], n(v)), "homography {i}"); }
            for p in h[3].as_array().unwrap() {
                let r = apply(&m, n(&p[0]), n(&p[1]));
                assert!(close(r.0, n(&p[2])) && close(r.1, n(&p[3])), "apply");
            }
            count += 1;
        }
        println!("planes: {count} cases equal");
    }
}
