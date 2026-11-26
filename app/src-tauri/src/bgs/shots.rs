//! BGS Watch, finding the screenshots the player took (F10): the newest N files in the game's Pictures folder, each stamped with the time of
//! the Journal's `Screenshot` event for it. Everything here only READS: it lists a folder, reads file times and reads Journal lines.
use super::timeutil::{mtime, parse_iso};
use serde_json::Value;
use std::collections::HashMap;
use std::io::BufRead;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug)]
pub struct Shot {
    pub path: PathBuf,
    pub name: String,
    /// UTC seconds: the Journal event's time, else the file's modified time
    pub taken: i64,
    pub from_journal: bool,
}

/// the game's default screenshot folder (Pictures\Frontier Developments\Elite Dangerous), or the folder the player set
pub fn pictures_dir(custom: &str) -> Option<PathBuf> {
    if !custom.trim().is_empty() {
        let p = PathBuf::from(custom.trim());
        return p.is_dir().then_some(p);
    }
    if let Some(d) = crate::devenv::var_os("GRAVITAS_BGS_DIR").map(PathBuf::from) { return d.is_dir().then_some(d); }
    let base = known_folders::get_known_folder_path(known_folders::KnownFolder::Pictures).or_else(|| std::env::var_os("USERPROFILE").map(|p| PathBuf::from(p).join("Pictures")))?;
    let d = base.join("Frontier Developments").join("Elite Dangerous");
    d.is_dir().then_some(d)
}

fn is_shot_name(n: &str) -> bool {
    let l = n.to_lowercase();
    l.starts_with("screenshot") && (l.ends_with(".bmp") || l.ends_with(".png"))
}

/// Screenshot events of the newest Journals: file name (lower case) -> every (time, width, height) written for it
pub fn journal_events(dir: &Path, files: usize) -> HashMap<String, Vec<(i64, u32, u32)>> {
    let mut out: HashMap<String, Vec<(i64, u32, u32)>> = HashMap::new();
    let Ok(rd) = std::fs::read_dir(dir) else { return out };
    let mut js: Vec<(String, PathBuf)> = rd.filter_map(|e| e.ok()).filter_map(|e| {
        let n = e.file_name().to_string_lossy().into_owned();
        (n.starts_with("Journal.") && n.ends_with(".log") && !crate::journal::too_big(&e.path())).then(|| (crate::journal::name_key(&n), e.path()))
    }).collect();
    js.sort();
    for (_, p) in js.iter().rev().take(files) {
        let Ok(f) = std::fs::OpenOptions::new().read(true).open(p) else { continue };
        for line in std::io::BufReader::new(f).split(b'\n').map_while(|l| l.ok()) {
            if line.len() > 4096 || !line.windows(12).any(|w| w == b"\"Screenshot\"") { continue; }
            let Ok(v) = serde_json::from_slice::<Value>(&line) else { continue };
            if v["event"] != "Screenshot" { continue; }
            let (Some(f), Some(t)) = (v["Filename"].as_str(), v["timestamp"].as_str().and_then(parse_iso)) else { continue };
            let base = f.rsplit(['\\', '/']).next().unwrap_or(f).to_lowercase();
            out.entry(base).or_default().push((t, v["Width"].as_u64().unwrap_or(0) as u32, v["Height"].as_u64().unwrap_or(0) as u32));
        }
    }
    out
}

/// The newest `n` screenshot files (BMP or PNG named Screenshot...), newest first, with the Journal's time when the Journal has the event.
pub fn newest(pictures: &Path, journal: Option<&Path>, n: usize) -> Vec<Shot> {
    let Ok(rd) = std::fs::read_dir(pictures) else { return vec![] };
    let mut files: Vec<(i64, String, PathBuf)> = rd.filter_map(|e| e.ok()).filter(|e| e.file_type().map_or(false, |t| t.is_file()))
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            if !is_shot_name(&name) { return None; }
            Some((mtime(&e.path())?, name, e.path()))
        }).collect();
    files.sort_by(|a, b| b.cmp(a));
    files.truncate(n.clamp(1, 64));
    let events = journal.map(|j| journal_events(j, 4)).unwrap_or_default();
    let mut out: Vec<Shot> = files.into_iter().map(|(mt, name, path)| {
        // the event nearest in time to the file (a name can come back after the game's counter restarted)
        let ev = events.get(&name.to_lowercase()).and_then(|v| v.iter().min_by_key(|e| (e.0 - mt).abs()));
        match ev {
            Some(e) if (e.0 - mt).abs() < 6 * 3600 => Shot { path, name, taken: e.0, from_journal: true },
            _ => Shot { path, name, taken: mt, from_journal: false },
        }
    }).collect();
    out.sort_by(|a, b| b.taken.cmp(&a.taken).then(b.name.cmp(&a.name)));
    out
}
