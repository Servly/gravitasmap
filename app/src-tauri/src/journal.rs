//! Reads the game's own Journal files, the same way the EDMC plugin's journal.py did (v0.1 of the app).
//! The newest Journal.*.log is looked at often; whatever was added since the last look is read, a half-written line
//! waits for its end, and every whole line is parsed. Nothing here is ever written or uploaded.
use serde::Serialize;
use serde_json::Value;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const FIND_EVERY: Duration = Duration::from_secs(2); // a new game makes a new Journal: look for the newest this often
const KEEP: usize = 8; // lines kept for the "Journal" list on screen

#[derive(Serialize, Clone, Default, PartialEq)]
pub struct LogLine {
    pub time: String,
    pub event: String,
    pub text: String,
}

#[derive(Serialize, Clone, Default, PartialEq)]
pub struct State {
    pub folder: Option<String>,
    pub file: Option<String>,
    pub commander: String,
    pub system: String,
    pub station: String,
    pub game_running: bool,
    pub lines: u64,
    pub recent: Vec<LogLine>,
}

/// A Journal file that is far bigger than any real one (a real one is a few MB, the biggest seen 30 MB): it is not read whole.
pub const MAX_JOURNAL_BYTES: u64 = 400 * 1024 * 1024;
pub fn too_big(p: &Path) -> bool {
    fs::metadata(p).map(|m| m.len() > MAX_JOURNAL_BYTES).unwrap_or(false)
}

pub fn saved_games() -> Option<PathBuf> {
    // GRAVITAS_JOURNAL_DIR: a Journal folder elsewhere (a moved Saved Games folder, tests, a second install)
    if let Some(d) = crate::devenv::var_os("GRAVITAS_JOURNAL_DIR").map(PathBuf::from) {
        return d.is_dir().then_some(d);
    }
    let base = known_folders::get_known_folder_path(known_folders::KnownFolder::SavedGames)
        .or_else(|| std::env::var_os("USERPROFILE").map(|p| PathBuf::from(p).join("Saved Games")))?;
    let dir = base.join("Frontier Developments").join("Elite Dangerous");
    dir.is_dir().then_some(dir)
}

pub(crate) fn newest(folder: &Path) -> Option<PathBuf> {
    fs::read_dir(folder)
        .ok()?
        .filter_map(|e| e.ok())
        .filter(|e| {
            let n = e.file_name();
            let n = n.to_string_lossy();
            n.starts_with("Journal.") && n.ends_with(".log")
        })
        .filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path())))
        .max_by_key(|(t, _)| *t)
        .map(|(_, p)| p)
}

/// at most this much of the file is read at once
const CHUNK: u64 = 8 * 1024 * 1024;
/// a line longer than this is not a Journal line (the longest real ones are some tens of KB): it is skipped without being parsed
const MAX_LINE: usize = 1024 * 1024;

pub struct Tail {
    folder: Option<PathBuf>,
    path: Option<PathBuf>,
    pos: u64,
    buf: Vec<u8>,
    /// true while the rest of an over-long line is being thrown away
    skipping: bool,
    look: Instant,
    pub state: State,
    /// every line applied since the last take(), with whether it came live (false: the past, read as the app started); only when `collect` is on
    pub collect: bool,
    taken: Vec<(Value, bool)>,
}

impl Tail {
    pub fn new() -> Self {
        Tail {
            folder: None,
            path: None,
            pos: 0,
            buf: Vec::new(),
            skipping: false,
            look: Instant::now() - FIND_EVERY,
            state: State::default(),
            collect: false,
            taken: Vec::new(),
        }
    }

    /// A reader of one given folder (tests, a moved Saved Games folder).
    pub fn with_folder(dir: PathBuf) -> Self {
        let mut t = Tail::new();
        t.state.folder = Some(dir.to_string_lossy().into_owned());
        t.folder = Some(dir);
        t
    }

    /// One look. Returns true if what the screen shows has changed.
    pub fn poll(&mut self) -> bool {
        let before = self.state.clone();
        if self.folder.is_none() {
            self.folder = saved_games();
            self.state.folder = self.folder.as_ref().map(|p| p.to_string_lossy().into_owned());
        }
        if let Some(folder) = self.folder.clone() {
            if self.look.elapsed() >= FIND_EVERY {
                self.look = Instant::now();
                if let Some(n) = newest(&folder) {
                    if self.path.as_ref() != Some(&n) {
                        let first = self.path.is_none();
                        self.path = Some(n.clone());
                        self.pos = 0;
                        self.buf.clear();
                        self.state.file = n.file_name().map(|f| f.to_string_lossy().into_owned());
                        if first {
                            // as the app starts, what is there is the past: it fills the state, it is not "news"
                            self.read_all(false);
                            return self.state != before;
                        }
                    }
                }
            }
            if self.path.is_some() {
                self.read_all(true);
            }
        }
        self.state != before
    }

    /// One chunk of new lines (at most CHUNK bytes of the file), and whether more is waiting. The caller loops until nothing more is waiting, so a 30 MB Journal is
    /// read in pieces and never held (or copied byte by byte) as one big buffer.
    fn read(&mut self) -> (Vec<Value>, bool) {
        let Some(path) = self.path.clone() else { return (vec![], false) };
        // the file is only opened when its size says something new was written (a size look is much cheaper than an open)
        let Ok(size) = fs::metadata(&path).map(|m| m.len()) else { return (vec![], false) };
        if size == self.pos {
            return (vec![], false);
        }
        let Ok(mut f) = File::open(&path) else { return (vec![], false) };
        if size < self.pos {
            self.pos = 0; // the file was replaced by a shorter one: from the start
            self.buf.clear();
            self.skipping = false;
        }
        if size == self.pos {
            return (vec![], false);
        }
        if f.seek(SeekFrom::Start(self.pos)).is_err() {
            return (vec![], false);
        }
        let want = (size - self.pos).min(CHUNK);
        let mut data = Vec::with_capacity(want as usize);
        if f.take(want).read_to_end(&mut data).is_err() {
            return (vec![], false);
        }
        self.pos += data.len() as u64;
        let more = self.pos < size;
        // bytes, not text: a letter split between two reads stays whole until its other half comes
        let mut at = 0usize;
        if self.skipping {
            // the end of a line that was far too long: dropped up to its newline
            match data.iter().position(|b| *b == b'\n') { Some(i) => { at = i + 1; self.skipping = false; } None => return (vec![], more) }
        }
        self.buf.extend_from_slice(&data[at..]);
        let mut out = Vec::new();
        let mut cur = 0usize; // (one cursor over the buffer: it is cut once at the end, never once per line)
        while let Some(i) = self.buf[cur..].iter().position(|b| *b == b'\n') {
            let line = &self.buf[cur..cur + i];
            cur += i + 1;
            if line.len() > MAX_LINE { continue; }
            let line = String::from_utf8_lossy(line);
            let line = line.trim();
            if !line.is_empty() {
                match serde_json::from_str::<Value>(line) {
                    Ok(v) if v.is_object() => {
                        crate::drift::journal_line(true);
                        out.push(v);
                    }
                    _ => crate::drift::journal_line(false),
                }
            }
        }
        self.buf.drain(..cur);
        if self.buf.len() > MAX_LINE {
            // a "line" with no end that is already too long: it is dropped, and so is the rest of it
            self.buf.clear();
            self.skipping = true;
        }
        (out, more)
    }

    /// Everything new in the file, chunk by chunk, each applied before the next is read.
    fn read_all(&mut self, live: bool) {
        loop {
            let (vs, more) = self.read();
            for v in vs {
                self.apply(&v, live);
            }
            if !more { break; }
        }
    }

    pub fn take(&mut self) -> Vec<(Value, bool)> {
        std::mem::take(&mut self.taken)
    }

    pub fn path(&self) -> Option<&PathBuf> {
        self.path.as_ref()
    }

    pub fn folder(&self) -> Option<&PathBuf> {
        self.folder.as_ref()
    }

    fn apply(&mut self, v: &Value, live: bool) {
        if self.collect {
            self.taken.push((v.clone(), live));
        }
        let s = |k: &str| v.get(k).and_then(Value::as_str).unwrap_or("");
        let ev = s("event");
        crate::drift::event(ev);
        crate::drift::check_fields(v);
        if live {
            self.state.lines += 1;
        }
        match ev {
            "Commander" | "LoadGame" => {
                let n = if ev == "Commander" { s("Name") } else { s("Commander") };
                if !n.is_empty() {
                    self.state.commander = n.to_string();
                }
            }
            "Location" | "FSDJump" | "CarrierJump" => {
                self.state.system = s("StarSystem").to_string();
                let docked = v.get("Docked").and_then(Value::as_bool).unwrap_or(false);
                self.state.station = if docked { station_of(v) } else { String::new() };
            }
            "Docked" => {
                self.state.system = s("StarSystem").to_string();
                self.state.station = station_of(v);
            }
            "Undocked" => self.state.station.clear(),
            _ => {}
        }
        if live && ev == "Docked" {
            // (the hub lists only where you docked)
            if let Some(text) = summary(ev, v) {
                let time = s("timestamp").to_string(); // the Journal's own UTC stamp: the window shows it in this PC's time
                self.state.recent.insert(0, LogLine { time, event: ev.to_string(), text });
                self.state.recent.truncate(KEEP);
            }
        }
    }
}

fn station_of(v: &Value) -> String {
    // some stations write a raw token in StationName, the real name is in StationName_Localised
    let l = v.get("StationName_Localised").and_then(Value::as_str).unwrap_or("");
    let n = v.get("StationName").and_then(Value::as_str).unwrap_or("");
    if l.is_empty() { n } else { l }.to_string()
}

/// The few events worth a line in the list (what they say, in a few words, as the game wrote them).
fn summary(ev: &str, v: &Value) -> Option<String> {
    let s = |k: &str| v.get(k).and_then(Value::as_str).unwrap_or("");
    let n = |k: &str| v.get(k).and_then(Value::as_i64).unwrap_or(0);
    Some(match ev {
        "Docked" => station_of(v),
        "Undocked" => station_of(v),
        "FSDJump" | "CarrierJump" | "Location" => s("StarSystem").to_string(),
        "SupercruiseEntry" | "SupercruiseExit" => s("StarSystem").to_string(),
        "Bounty" => format!("+{} cr", group(n("TotalReward"))),
        "RedeemVoucher" => format!("{} cr", group(n("Amount"))),
        "Died" => String::new(),
        "ShipTargeted" => s("Ship_Localised").to_string(),
        "Interdicted" | "Interdiction" => s("Interdictor").to_string(),
        _ => return None,
    })
}

fn group(n: i64) -> String {
    let s = n.abs().to_string();
    let mut out = String::new();
    for (i, c) in s.chars().enumerate() {
        if i > 0 && (s.len() - i) % 3 == 0 {
            out.push(',');
        }
        out.push(c);
    }
    if n < 0 { format!("-{out}") } else { out }
}


#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn line(ts: &str, body: &str) -> String {
        format!("{{ \"timestamp\":\"{ts}\", {body} }}
")
    }

    #[test]
    fn reads_the_past_then_follows_new_lines_and_waits_for_half_lines() {
        let dir = std::env::temp_dir().join(format!("gravitas_journal_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("Journal.2026-11-16T030408.01.log");
        let mut f = File::create(&file).unwrap();
        f.write_all(line("2026-11-16T03:04:08Z", "\"event\":\"Fileheader\"").as_bytes()).unwrap();
        f.write_all(line("2026-11-16T03:04:09Z", "\"event\":\"Commander\", \"Name\":\"Hongark\"").as_bytes()).unwrap();
        f.write_all(line("2026-11-16T03:04:10Z", "\"event\":\"Location\", \"StarSystem\":\"Col 285 Sector VR-E b27-1\", \"Docked\":true, \"StationName\":\"$Raw;\", \"StationName_Localised\":\"Servly Alloys\"").as_bytes()).unwrap();
        f.flush().unwrap();

        let mut t = Tail { folder: Some(dir.clone()), path: None, pos: 0, buf: Vec::new(), skipping: false, look: Instant::now() - FIND_EVERY, state: State::default(), collect: false, taken: Vec::new() };
        assert!(t.poll(), "the past fills the state");
        assert_eq!(t.state.commander, "Hongark");
        assert_eq!(t.state.system, "Col 285 Sector VR-E b27-1");
        assert_eq!(t.state.station, "Servly Alloys", "the localised name wins over the raw token");
        assert_eq!(t.state.lines, 0, "the past is not news");
        assert!(t.state.recent.is_empty());

        // a live Bounty, then a line cut in half (a letter of a multi-byte name split between two reads)
        f.write_all(line("2026-11-16T03:05:00Z", "\"event\":\"Bounty\", \"TotalReward\":1085922").as_bytes()).unwrap();
        let half = line("2026-11-16T03:05:05Z", "\"event\":\"Docked\", \"StarSystem\":\"Sol\", \"StationName\":\"Ünite\"");
        let bytes = half.as_bytes();
        let cut = half.find('Ü').unwrap() + 1; // between the two bytes of Ü
        f.write_all(&bytes[..cut]).unwrap();
        f.flush().unwrap();
        assert!(t.poll());
        assert_eq!(t.state.lines, 1);
        assert!(t.state.recent.is_empty(), "only Docked is listed");
        assert_eq!(t.state.system, "Col 285 Sector VR-E b27-1", "the half line has not been handled yet");

        f.write_all(&bytes[cut..]).unwrap();
        f.flush().unwrap();
        assert!(t.poll());
        assert_eq!(t.state.system, "Sol");
        assert_eq!(t.state.recent[0].event, "Docked");
        assert_eq!(t.state.recent[0].text, "Ünite");
        assert_eq!(t.state.station, "Ünite");
        assert_eq!(t.state.lines, 2);
        assert!(!t.poll(), "nothing new: no change");

        let _ = fs::remove_dir_all(&dir);
    }

    /// Run by hand against the real game folder: cargo test real_folder -- --ignored --nocapture
    #[test]
    #[ignore]
    fn real_folder() {
        let mut t = Tail::new();
        t.poll();
        println!("folder: {:?}", t.state.folder);
        println!("file: {:?}", t.state.file);
        println!("commander: {:?}  system: {:?}  station: {:?}", t.state.commander, t.state.system, t.state.station);
    }

    fn fresh(name: &str) -> (PathBuf, PathBuf) {
        let dir = std::env::temp_dir().join(format!("gravitas_journal_{}_{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("Journal.2026-11-16T030408.01.log");
        (dir, file)
    }

    /// A big Journal (about 30 MB, 250,000 lines) is read in pieces, fast, and every line is seen (it used to be cut line by line out of one big buffer).
    #[test]
    fn a_huge_journal_is_read_fast_and_whole() {
        let (dir, file) = fresh("huge");
        {
            let mut f = std::io::BufWriter::new(File::create(&file).unwrap());
            for i in 0..250_000u32 {
                f.write_all(line("2026-11-16T03:04:08Z", &format!("\"event\":\"Scan\", \"BodyName\":\"Body {i}\", \"Pad\":\"{}\"", "x".repeat(60))).as_bytes()).unwrap();
            }
            f.write_all(line("2026-11-16T03:04:09Z", "\"event\":\"Location\", \"StarSystem\":\"The End\"").as_bytes()).unwrap();
        }
        let mut t = Tail::with_folder(dir.clone());
        t.collect = true;
        let t0 = Instant::now();
        t.poll();
        let ms = t0.elapsed().as_millis();
        println!("30 MB Journal read in {ms} ms");
        assert_eq!(t.state.system, "The End");
        assert_eq!(t.take().len(), 250_001);
        assert!(ms < 15_000, "took {ms} ms");
        let _ = fs::remove_dir_all(&dir);
    }

    /// A line that is far too long (no end in sight) is thrown away, the app does not grow, and the lines after it are read.
    #[test]
    fn a_monster_line_is_skipped_and_the_next_lines_are_read() {
        let (dir, file) = fresh("monster");
        let mut f = File::create(&file).unwrap();
        f.write_all(line("2026-11-16T03:04:08Z", "\"event\":\"Location\", \"StarSystem\":\"Before\"").as_bytes()).unwrap();
        f.flush().unwrap();
        let mut t = Tail::with_folder(dir.clone());
        t.poll();
        assert_eq!(t.state.system, "Before");
        // 3 MB with no newline, written in two steps, then a good line
        f.write_all(&vec![b'x'; 2 * 1024 * 1024]).unwrap();
        f.flush().unwrap();
        t.poll();
        assert!(t.buf.len() <= MAX_LINE + 1, "the buffer must not keep growing");
        f.write_all(&vec![b'y'; 1024 * 1024]).unwrap();
        f.write_all(b"
").unwrap();
        f.write_all(line("2026-11-16T03:05:00Z", "\"event\":\"FSDJump\", \"StarSystem\":\"After\"").as_bytes()).unwrap();
        f.flush().unwrap();
        t.poll();
        assert_eq!(t.state.system, "After");
        assert!(t.buf.is_empty() || t.buf.len() < 1000);
        let _ = fs::remove_dir_all(&dir);
    }

    /// Random bytes of every kind appended to a Journal in random pieces (cut lines, NULs, invalid UTF-8, CRLF, very long lines, valid lines): the reader never panics, never keeps more
    /// than one over-long line, and still sees the valid lines that follow. (FUZZ_SECS makes it longer: cargo test byte_noise -- --nocapture)
    #[test]
    fn byte_noise_never_breaks_the_reader() {
        let secs: u64 = std::env::var("FUZZ_SECS").ok().and_then(|s| s.parse().ok()).unwrap_or(2);
        let (dir, file) = fresh("noise");
        let mut f = File::create(&file).unwrap();
        f.write_all(line("2026-11-16T03:04:08Z", "\"event\":\"Location\", \"StarSystem\":\"Start\"").as_bytes()).unwrap();
        f.flush().unwrap();
        let mut t = Tail::with_folder(dir.clone());
        t.collect = true;
        t.poll();
        let mut x: u64 = 0x2545F4914F6CDD1D;
        let mut rnd = move |n: u64| { x ^= x << 13; x ^= x >> 7; x ^= x << 17; x % n.max(1) };
        let t0 = Instant::now();
        let mut n = 0u64;
        while t0.elapsed().as_secs() < secs {
            n += 1;
            let mut chunk: Vec<u8> = Vec::new();
            for _ in 0..rnd(6) + 1 {
                match rnd(8) {
                    0 => chunk.extend((0..rnd(3000)).map(|_| rnd(256) as u8)),
                    1 => chunk.extend(vec![0u8; rnd(500) as usize]),
                    2 => chunk.extend(b"{ \"timestamp\":\"2026-11-16T03:05:00Z\", \"event\":\"FSDJump\", \"StarSyst"),
                    3 => chunk.extend(vec![b'q'; (rnd(40) * 50_000) as usize]),
                    4 => chunk.extend(b"

"),
                    5 => chunk.extend(&[0xC3, 0x28, 0xE2, 0x82, 0xFF]),
                    6 => chunk.extend(b"
"),
                    _ => chunk.extend(line("2026-11-16T03:05:00Z", "\"event\":\"Docked\", \"StarSystem\":\"Sol\", \"StationName\":\"Ünite\"").as_bytes()),
                }
            }
            f.write_all(&chunk).unwrap();
            f.flush().unwrap();
            t.poll();
            let _ = t.take();
            assert!(t.buf.len() <= MAX_LINE + 4096, "buffer grew to {}", t.buf.len());
        }
        // after any amount of noise a clean line is still read
        f.write_all(b"
").unwrap();
        f.write_all(line("2026-11-16T03:09:00Z", "\"event\":\"FSDJump\", \"StarSystem\":\"Survivor\"").as_bytes()).unwrap();
        f.flush().unwrap();
        for _ in 0..3 { t.poll(); }
        assert_eq!(t.state.system, "Survivor");
        println!("byte noise: {n} rounds, reader fine");
        let _ = fs::remove_dir_all(&dir);
    }
}
