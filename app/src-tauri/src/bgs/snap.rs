//! BGS Watch, snapping a read system name to the known list of the squadron's systems (edit distance), never guessing silently:
//! an exact match is sure, a near one is marked "snapped", nothing close is left as read.

/// the form names are compared in: upper case, single spaces
pub fn norm(s: &str) -> String { s.split_whitespace().collect::<Vec<_>>().join(" ").to_uppercase() }

pub fn lev(a: &str, b: &str) -> usize {
    let (a, b): (Vec<char>, Vec<char>) = (a.chars().collect(), b.chars().collect());
    let mut p: Vec<usize> = (0..=b.len()).collect();
    for i in 1..=a.len() {
        let mut c = vec![i];
        for j in 1..=b.len() { c.push((p[j] + 1).min(c[j - 1] + 1).min(p[j - 1] + (a[i - 1] != b[j - 1]) as usize)); }
        p = c;
    }
    p[b.len()]
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Hit { None, Exact(usize), Near(usize, usize) }

/// For every read name the index of the known name it is, or is near to. Every known name is used by at most one row.
/// 1. exact (after `norm`), 2. unique nearest known name within distance 1, 3. among the known names no row took, unique nearest within distance 2.
pub fn snap_all(read: &[String], known: &[String]) -> Vec<Hit> {
    let kn: Vec<String> = known.iter().map(|k| norm(k)).collect();
    let rn: Vec<String> = read.iter().map(|r| norm(r)).collect();
    let mut hit = vec![Hit::None; read.len()];
    let mut used = vec![false; known.len()];
    for (i, r) in rn.iter().enumerate() {
        if let Some(k) = kn.iter().enumerate().position(|(k, n)| n == r && !used[k]) {
            hit[i] = Hit::Exact(k);
            used[k] = true;
        }
    }
    // 1b. the same name once the look-alikes are put together: a hyphen read as a space or lost, a zero read as the letter O (B21-0 read as "B21 O").
    //     The key is the same function on both sides, so it can only join names that are equal under it, and only when exactly one known name has that key.
    let key = |s: &str| -> String { s.chars().filter(|c| *c != '-' && !c.is_whitespace()).map(|c| if c == 'O' { '0' } else { c }).collect::<String>() };
    let kk: Vec<String> = kn.iter().map(|k| key(k)).collect();
    for i in (0..read.len()).filter(|&i| hit[i] == Hit::None && !rn[i].is_empty()).collect::<Vec<_>>() {
        let r = key(&rn[i]);
        let c: Vec<usize> = (0..known.len()).filter(|&k| kk[k] == r).collect();
        if c.len() == 1 && !used[c[0]] { hit[i] = Hit::Near(c[0], 1); used[c[0]] = true; }
    }
    for maxd in [1usize, 2] {
        // candidates: (distance, row, known) where the known name is the row's unique nearest among the names no row has yet
        let mut cands: Vec<(usize, usize, usize)> = Vec::new();
        for i in (0..read.len()).filter(|&i| hit[i] == Hit::None && !rn[i].is_empty()) {
            let mut ds: Vec<(usize, usize)> = (0..known.len()).filter(|&k| !used[k]).map(|k| (lev(&rn[i], &kn[k]), k)).collect();
            ds.sort();
            if let Some(&(d, k)) = ds.first() {
                if d <= maxd && ds.get(1).map_or(true, |s| s.0 > d) { cands.push((d, i, k)); }
            }
        }
        // two rows that want the same known name: neither is taken (the player decides)
        let want: Vec<usize> = cands.iter().map(|c| c.2).collect();
        for &(d, i, k) in &cands {
            if want.iter().filter(|&&w| w == k).count() > 1 { continue; }
            hit[i] = Hit::Near(k, d);
            used[k] = true;
        }
    }
    // 4. a garbled name (blurred letters that touch each other become one wrong letter, 'SECTOR' read as 'SEWOR') whose ENDING is still read right:
    //    the last word (a code like B6-5 or C12-9), and when several known names end alike also the word before it, must point to exactly one known name no row took.
    //    Weak on purpose: it is shown as a snapped name that the player confirms.
    let todo: Vec<usize> = (0..read.len()).filter(|&i| hit[i] == Hit::None && !rn[i].is_empty()).collect();
    for i in todo {
        let toks: Vec<&str> = rn[i].split(' ').collect();
        if toks.len() < 2 { continue; }
        let last = toks[toks.len() - 1];
        if !last.chars().any(|c| c.is_ascii_digit()) || last.len() < 3 { continue; }
        let mut c: Vec<usize> = (0..known.len()).filter(|&k| !used[k] && kn[k].split(' ').last() == Some(last)).collect();
        if c.len() > 1 && toks.len() >= 2 {
            let prev = toks[toks.len() - 2];
            c.retain(|&k| { let kt: Vec<&str> = kn[k].split(' ').collect(); kt.len() >= 2 && lev(kt[kt.len() - 2], prev) <= 1 });
        }
        if c.len() == 1 && !hit.iter().any(|h| matches!(h, Hit::Near(k, _) if *k == c[0])) {
            hit[i] = Hit::Near(c[0], 9);
            used[c[0]] = true;
        }
    }
    hit
}

/// known names that more than one row snapped to (should not happen, kept as a safety check for the caller)
pub fn duplicates(hit: &[Hit]) -> Vec<usize> {
    let mut seen = std::collections::HashMap::new();
    for h in hit { if let Hit::Exact(k) | Hit::Near(k, _) = h { *seen.entry(*k).or_insert(0usize) += 1; } }
    seen.into_iter().filter(|(_, n)| *n > 1).map(|(k, _)| k).collect()
}
