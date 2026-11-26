//! BGS Watch: the population of each system, shown as "(Pop: N)" next to its name. The numbers come from Spansh (https://spansh.co.uk), the same source the website uses.
//! What goes out: ONE request per 100 system names (the names of the systems in your newest snapshot), nothing else: no CMDR name, no Journal data, no influence values.
//! The answer is kept in `bgs_pop.json` in the app's data folder and asked again after 6 hours at the earliest (the numbers change slowly). A switch in the BGS Setup turns it off.
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

const URL: &str = "https://spansh.co.uk/api/systems/search";
/// the cache is trusted for this long (seconds)
pub const FRESH_S: i64 = 6 * 3600;
/// names per request
const CHUNK: usize = 100;
/// most names asked in one refresh
const MAX_NAMES: usize = 400;
/// the biggest answer read (a page of 100 systems is about 1.2 MB)
const MAX_BYTES: u64 = 8_000_000;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Pop {
    /// unix seconds of the last successful refresh (0 = never)
    pub updated: i64,
    /// system name in lower case -> population
    pub map: BTreeMap<String, u64>,
}

fn file(dir: &Path) -> PathBuf { dir.join("bgs_pop.json") }

pub fn load(dir: &Path) -> Pop {
    let Ok(text) = std::fs::read_to_string(file(dir)) else { return Pop::default() };
    let Ok(v) = serde_json::from_str::<Value>(text.trim_start_matches('\u{feff}')) else { return Pop::default() };
    let map = v.get("systems").and_then(|m| m.as_object()).map(|m| m.iter().filter_map(|(k, v)| v.as_u64().map(|n| (k.clone(), n))).collect()).unwrap_or_default();
    Pop { updated: v.get("updated").and_then(|x| x.as_i64()).unwrap_or(0), map }
}

pub fn save(dir: &Path, p: &Pop) -> bool {
    let v = json!({"updated": p.updated, "systems": p.map});
    crate::store::write_atomic(&file(dir), &v.to_string())
}

/// the request body for one group of names
pub fn body(names: &[String]) -> Value { json!({"filters": {"name": {"value": names}}, "size": CHUNK, "page": 0}) }

/// from Spansh's answer: system name (lower case) -> population. A system without a number is left out.
pub fn parse(v: &Value) -> BTreeMap<String, u64> {
    let mut out = BTreeMap::new();
    for r in v.get("results").and_then(|x| x.as_array()).into_iter().flatten() {
        let (Some(n), Some(p)) = (r.get("name").and_then(|x| x.as_str()), r.get("population").and_then(|x| x.as_u64())) else { continue };
        out.insert(n.trim().to_lowercase(), p);
    }
    out
}

/// the names to ask for: unique, trimmed, no control characters, at most MAX_NAMES
pub fn clean_names(names: &[String]) -> Vec<String> {
    let mut seen = std::collections::BTreeSet::new();
    let mut out = Vec::new();
    for n in names {
        let t = n.split_whitespace().collect::<Vec<_>>().join(" ");
        if t.is_empty() || t.len() > 60 || t.chars().any(|c| c.is_control()) { continue; }
        if seen.insert(t.to_lowercase()) { out.push(t); }
        if out.len() >= MAX_NAMES { break; }
    }
    out
}

/// true when the cache is recent and holds a number for every name
pub fn fresh(p: &Pop, names: &[String], now: i64) -> bool {
    p.updated > 0 && now - p.updated < FRESH_S && names.iter().all(|n| p.map.contains_key(&n.to_lowercase()))
}

fn ask(chunk: &[String]) -> Result<BTreeMap<String, u64>, String> {
    let agent = ureq::AgentBuilder::new().timeout(std::time::Duration::from_secs(25)).user_agent(&format!("GRAVITAS-app/{}", env!("CARGO_PKG_VERSION"))).build();
    let resp = agent.post(URL).set("Content-Type", "application/json").send_string(&body(chunk).to_string()).map_err(|e| match e {
        ureq::Error::Status(c, _) => format!("Spansh answered with status {c}"),
        _ => "Spansh could not be reached".to_string(),
    })?;
    let mut text = String::new();
    std::io::Read::read_to_string(&mut std::io::Read::take(resp.into_reader(), MAX_BYTES), &mut text).map_err(|_| "Spansh's answer could not be read".to_string())?;
    let v: Value = serde_json::from_str(&text).map_err(|_| "Spansh's answer was not understood".to_string())?;
    Ok(parse(&v))
}

/// Asks Spansh for the names and keeps the answer. `force` ignores the 6 hour rule. A failed call keeps the old numbers.
pub fn refresh(dir: &Path, names: &[String], force: bool, now: i64) -> Result<Pop, String> {
    let names = clean_names(names);
    let old = load(dir);
    if names.is_empty() { return Ok(old); }
    if !force && fresh(&old, &names, now) { return Ok(old); }
    let mut map = old.map.clone();
    for chunk in names.chunks(CHUNK) {
        for (k, v) in ask(chunk)? { map.insert(k, v); }
    }
    let p = Pop { updated: now, map };
    save(dir, &p);
    Ok(p)
}

#[cfg(test)]
mod t {
    use super::*;

    #[test]
    fn spanshs_answer_gives_populations_by_lower_case_name() {
        let v = json!({"count": 3, "results": [
            {"name": "Serra", "population": 316782, "bodies": []},
            {"name": "Col 285 Sector UE-N b21-0", "population": 47930407},
            {"name": "Empty", "population": null},
            {"population": 5}
        ]});
        let m = parse(&v);
        assert_eq!(m.get("serra"), Some(&316782));
        assert_eq!(m.get("col 285 sector ue-n b21-0"), Some(&47930407));
        assert!(!m.contains_key("empty"), "a system without a number is left out");
        assert_eq!(m.len(), 2);
    }

    #[test]
    fn the_request_holds_only_the_names() {
        let b = body(&["Serra".to_string(), "Corin".to_string()]);
        assert_eq!(b, serde_json::from_str::<Value>(r#"{"filters":{"name":{"value":["Serra","Corin"]}},"page":0,"size":100}"#).unwrap());
        assert_eq!(b.as_object().unwrap().len(), 3, "nothing else is sent");
    }

    #[test]
    fn names_are_cleaned_and_capped() {
        let n: Vec<String> = vec!["Serra".into(), " serra ".into(), "A\u{0}B".into(), "".into(), "Col  285 Sector".into()];
        assert_eq!(clean_names(&n), vec!["Serra".to_string(), "Col 285 Sector".to_string()]);
        let many: Vec<String> = (0..1000).map(|i| format!("S{i}")).collect();
        assert_eq!(clean_names(&many).len(), MAX_NAMES);
    }

    #[test]
    fn the_cache_is_fresh_for_six_hours_and_only_when_it_has_every_name() {
        let mut p = Pop { updated: 1000, map: BTreeMap::new() };
        p.map.insert("serra".into(), 1);
        let names = vec!["Serra".to_string()];
        assert!(fresh(&p, &names, 1000 + FRESH_S - 1));
        assert!(!fresh(&p, &names, 1000 + FRESH_S));
        assert!(!fresh(&p, &["Serra".to_string(), "Corin".to_string()], 1001));
        assert!(!fresh(&Pop::default(), &names, 5));
    }

    #[test]
    fn the_cache_file_round_trips() {
        let dir = std::env::temp_dir().join(format!("gv-pop-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let mut p = Pop { updated: 42, map: BTreeMap::new() };
        p.map.insert("serra".into(), 316782);
        assert!(save(&dir, &p));
        assert_eq!(load(&dir), p);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Real call (needs the internet). cargo test --release bgs::pop::t::live_spansh -- --ignored --nocapture
    #[test]
    #[ignore]
    fn live_spansh() {
        let dir = std::env::temp_dir().join(format!("gv-pop-live-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let names: Vec<String> = ["Serra", "Corin", "Col 285 Sector VR-E b27-1"].iter().map(|s| s.to_string()).collect();
        let p = refresh(&dir, &names, true, 1_000_000).unwrap();
        println!("{:?}", p.map);
        assert!(p.map.get("serra").map_or(false, |n| *n > 0));
        // the second call within 6 hours does not go out (the cache holds every name)
        assert!(fresh(&load(&dir), &names, 1_000_100));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
