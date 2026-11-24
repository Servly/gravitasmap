//! Updates. The ONLY thing the server may tell the app is "a newer version exists": a small signed file on gravitasmap.com
//! (/gravitas-app/version.json) and the new installer next to it. Nothing about how the app behaves ever comes from outside.
//! The app asks at start and every few hours (no personal data: a plain GET, the user agent says only "GRAVITAS-app/<version>").
//! A newer version is checked three ways before it is run: the file's ed25519 signature (the public key is inside this app), the installer's
//! SHA-256 named in that signed file, and it is only ever fetched from our own address.
//! A small update installs by itself ONLY as the app is opened (close it and open it again: it updates, then starts again). While the app is
//! open nothing is ever installed behind the player's back: a newer version is announced ("new version") and the player presses Update.
//! A big change ("breaking") or a version below the minimum is announced the same way, also at launch.
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const BASE: &str = "https://gravitasmap.com/gravitas-app/";
const PUBLIC_KEY: &str = include_str!("../data/update_pub.key");
const EVERY: Duration = Duration::from_secs(6 * 3600);
pub const CURRENT: &str = env!("CARGO_PKG_VERSION");

#[derive(Serialize, Clone, Default)]
pub struct Update {
    /// idle, checking, uptodate, available, required, downloading, installing, error
    pub status: String,
    pub current: String,
    pub latest: String,
    pub notes: String,
    pub breaking: bool,
    pub error: String,
    pub progress: u8,
    pub auto: bool,
    /// seconds since 1970 of the last answer
    pub checked: u64,
}

pub static STATE: Mutex<Option<Update>> = Mutex::new(None);
pub static CHECK_NOW: AtomicBool = AtomicBool::new(false);
pub static INSTALL_NOW: AtomicBool = AtomicBool::new(false);
pub static GAME_RUNNING: AtomicBool = AtomicBool::new(false);

fn set(f: impl FnOnce(&mut Update)) {
    if let Ok(mut s) = STATE.lock() {
        let u = s.get_or_insert_with(|| Update { status: "idle".into(), current: CURRENT.into(), auto: true, ..Default::default() });
        f(u);
    }
}

pub fn state() -> Update {
    STATE.lock().ok().and_then(|s| s.clone()).unwrap_or(Update { status: "idle".into(), current: CURRENT.into(), auto: true, ..Default::default() })
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}
fn unhex(s: &str) -> Vec<u8> {
    if !s.is_ascii() { return vec![]; } // (a letter outside ASCII would cut the text in the middle: the signature then fails, it never panics)
    (0..s.len() / 2).filter_map(|i| u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).ok()).collect()
}

/// "0.5.0" as numbers, for comparing.
pub fn version_of(s: &str) -> Vec<u64> {
    s.split('.').map(|p| p.trim().parse::<u64>().unwrap_or(0)).collect()
}

pub fn newer(a: &str, b: &str) -> bool {
    let (x, y) = (version_of(a), version_of(b));
    let n = x.len().max(y.len());
    for i in 0..n {
        let (p, q) = (x.get(i).copied().unwrap_or(0), y.get(i).copied().unwrap_or(0));
        if p != q {
            return p > q;
        }
    }
    false
}

/// What was signed: the version, the installer's hash and address, the minimum and whether the change is big.
pub fn message(v: &Value) -> Option<String> {
    Some(format!(
        "{}|{}|{}|{}|{}",
        v.get("latest")?.as_str()?,
        v.get("sha256")?.as_str()?,
        v.get("url")?.as_str()?,
        v.get("minimum").and_then(Value::as_str).unwrap_or("0"),
        v.get("breaking").and_then(Value::as_bool).unwrap_or(false)
    ))
}

/// Is this file signed by us (the key inside the app)?
pub fn verified(v: &Value, key_hex: &str) -> bool {
    let (Some(msg), Some(sig)) = (message(v), v.get("signature").and_then(Value::as_str)) else { return false };
    let Ok(kb): Result<[u8; 32], _> = unhex(key_hex.trim()).try_into() else { return false };
    let Ok(key) = VerifyingKey::from_bytes(&kb) else { return false };
    let Ok(sb): Result<[u8; 64], _> = unhex(sig).try_into() else { return false };
    key.verify(msg.as_bytes(), &Signature::from_bytes(&sb)).is_ok()
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new().timeout(Duration::from_secs(20)).user_agent(&format!("GRAVITAS-app/{CURRENT}")).build()
}

/// One look at the server. Returns the signed file if it is a newer, valid one.
fn look() -> Result<Value, String> {
    let body = agent().get(&format!("{BASE}version.json")).call().map_err(|e| format!("no answer: {e}"))?.into_string().map_err(|e| e.to_string())?;
    let v: Value = serde_json::from_str(&body).map_err(|e| format!("not readable: {e}"))?;
    if !verified(&v, PUBLIC_KEY) {
        return Err("the update file is not signed by GRAVITAS: ignored".into());
    }
    let url = v["url"].as_str().unwrap_or("");
    if !url.starts_with(BASE) {
        return Err("the installer is not on gravitasmap.com: ignored".into());
    }
    // replay protection: a signed file older than one already accepted (an old file sent again) is ignored. The signed message itself is unchanged.
    let latest = v["latest"].as_str().unwrap_or("0");
    let floor = crate::store::read().get(FLOOR_KEY).and_then(Value::as_str).unwrap_or("0").to_string();
    if below_floor(&floor, latest) { return Err("the update file is older than one already accepted: ignored".into()); }
    if newer(latest, &floor) { crate::store::set(&[(FLOOR_KEY, serde_json::json!(latest))]); }
    Ok(v)
}

/// settings.json key: the highest `latest` of any signed file accepted so far
const FLOOR_KEY: &str = "update_floor";

/// Is this `latest` lower than the highest one ever accepted?
pub fn below_floor(floor: &str, latest: &str) -> bool {
    newer(floor, latest)
}

/// The private folder the installer is downloaded to: %LOCALAPPDATA%\GRAVITAS\update (not the shared temp folder, where another program could swap the file).
fn update_dir() -> Result<std::path::PathBuf, String> {
    let l = std::env::var_os("LOCALAPPDATA").filter(|l| !l.is_empty()).ok_or("no local app data folder")?;
    // (a sibling of the install folder %LOCALAPPDATA%\GRAVITAS, never inside it: the installer removes the old install while it runs)
    Ok(std::path::PathBuf::from(l).join("GRAVITAS-update"))
}

/// A file name from the address: plain letters, digits, dot, dash, underscore only.
fn safe_name(url: &str) -> Option<String> {
    let n = url.rsplit('/').next()?;
    (!n.is_empty() && n.len() < 100 && !n.starts_with('.') && n.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))).then(|| n.to_string())
}

/// Creates the folder and removes the files in it (older installers).
fn fresh_dir(dir: &std::path::Path) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("blocked: {e}"))?;
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.filter_map(|e| e.ok()) { if e.path().is_file() { let _ = std::fs::remove_file(e.path()); } }
    }
    Ok(())
}

/// SHA-256 of the file as it is on the disk now.
fn hash_file(path: &std::path::Path) -> Result<String, String> {
    let mut f = std::fs::File::open(path).map_err(|e| format!("blocked: {e}"))?;
    let mut h = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = f.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 { break; }
        h.update(&buf[..n]);
    }
    Ok(hex(&h.finalize()))
}

/// The file on the disk must still be the one the signed file names (it sat there a few seconds: nobody may have changed it).
pub fn rehash_ok(path: &std::path::Path, want: &str) -> Result<(), String> {
    if hash_file(path)? != want.to_lowercase() { return Err("the installer on the disk changed after the check: not run".into()); }
    Ok(())
}

/// The installer is about 5 MB: anything above this is not ours (and is never held in memory)
const MAX_INSTALLER: u64 = 100 * 1024 * 1024;

fn download(v: &Value) -> Result<std::path::PathBuf, String> {
    let (url, want) = (v["url"].as_str().unwrap_or(""), v["sha256"].as_str().unwrap_or("").to_lowercase());
    let dir = update_dir()?;
    fresh_dir(&dir)?;
    let file = dir.join(safe_name(url).ok_or("the installer's name is not a plain file name: ignored")?);
    let resp = ureq::AgentBuilder::new().timeout(Duration::from_secs(300)).user_agent(&format!("GRAVITAS-app/{CURRENT}")).build().get(url).call().map_err(|e| format!("download failed: {e}"))?;
    let total = resp.header("Content-Length").and_then(|l| l.parse::<u64>().ok()).unwrap_or(0);
    if total > MAX_INSTALLER { return Err("the installer is far bigger than expected: not downloaded".into()); }
    let mut r = resp.into_reader();
    let mut data = Vec::with_capacity(total.min(MAX_INSTALLER) as usize);
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = r.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        data.extend_from_slice(&buf[..n]);
        if data.len() as u64 > MAX_INSTALLER { return Err("the installer is far bigger than expected: stopped".into()); }
        if total > 0 {
            set(|u| u.progress = (data.len() as u64 * 100 / total).min(100) as u8);
        }
    }
    if hex(&Sha256::digest(&data)) != want {
        return Err("the downloaded installer does not match the signed hash: not run".into());
    }
    {
        use std::io::Write;
        // a new file only (never writes into one that is already there)
        let mut f = std::fs::OpenOptions::new().write(true).create_new(true).open(&file).map_err(|e| format!("blocked: {e}"))?;
        f.write_all(&data).map_err(|e| format!("blocked: {e}"))?;
    }
    Ok(file)
}

/// Runs the installer itself, silently (/S), asking it to start the app again when it is done (/R) in update mode (/UPDATE). No script, no
/// console window: the installer closes this app (it checks for it running) and puts the new files in. Started after the notice has been read.
fn run_installer(installer: &std::path::Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    // CREATE_NO_WINDOW: not even a console flash (the installer is a program with a window of its own, which /S keeps hidden)
    // (a file that is gone or cannot be opened right after it was written: Windows or an antivirus took it)
    if std::fs::metadata(installer).is_err() { return Err("blocked: the installer file is gone".into()); }
    std::process::Command::new(installer).args(["/S", "/R", "/UPDATE"]).creation_flags(0x0800_0000).spawn().map_err(|e| format!("blocked: {e}"))?;
    Ok(())
}

/// True in the Microsoft Store build: the Store updates the app, so there is no updater at all.
pub const STORE: bool = cfg!(feature = "store");

pub fn start(app: tauri::AppHandle, auto_default: bool) {
    if STORE { set(|u| { u.status = "store".into(); u.auto = false; }); return; }
    set(|u| u.auto = auto_default);
    std::thread::Builder::new()
        .name("GRAVITAS updates".into())
        .spawn(move || crate::guard::keep_running("updates", || {
            std::thread::sleep(Duration::from_secs(4)); // (as the app opens)
            let mut last = Instant::now() - EVERY;
            let mut at_launch = true;
            let mut pending: Option<Value> = None;
            loop {
                let manual = CHECK_NOW.swap(false, Ordering::SeqCst);
                let mut launch_pass = false;
                if manual || last.elapsed() >= EVERY {
                    launch_pass = at_launch; // the very first look, as the app opens
                    at_launch = false;
                    last = Instant::now();
                    set(|u| u.status = "checking".into());
                    match look() {
                        Ok(v) => {
                            let latest = v["latest"].as_str().unwrap_or("0").to_string();
                            let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
                            if newer(&latest, CURRENT) {
                                let minimum = v.get("minimum").and_then(Value::as_str).unwrap_or("0");
                                let breaking = v.get("breaking").and_then(Value::as_bool).unwrap_or(false);
                                let required = breaking || newer(minimum, CURRENT);
                                set(|u| {
                                    u.status = if required { "required".into() } else { "available".into() };
                                    u.latest = latest.clone();
                                    u.notes = v.get("notes").and_then(Value::as_str).unwrap_or("").to_string();
                                    u.breaking = required;
                                    u.error.clear();
                                    u.checked = now;
                                });
                                pending = Some(v);
                            } else {
                                set(|u| { u.status = "uptodate".into(); u.latest = latest; u.error.clear(); u.checked = now; });
                                pending = None;
                            }
                        }
                        Err(e) => set(|u| { u.status = "error".into(); u.error = e; }),
                    }
                }
                // installing: asked for by the player, or by itself for a small update while the game is not running
                if let Some(v) = pending.clone() {
                    let st = state();
                    let go = INSTALL_NOW.swap(false, Ordering::SeqCst) || (launch_pass && st.status == "available" && st.auto);
                    if go {
                        set(|u| { u.status = "downloading".into(); u.progress = 0; });
                        match download(&v).map(|f| { set(|u| u.status = "installing".into()); f }) {
                            Ok(f) => {
                                std::thread::sleep(Duration::from_secs(4)); // (long enough to read the notice on the screen)
                                let want = v["sha256"].as_str().unwrap_or("").to_string();
                                match rehash_ok(&f, &want).and_then(|_| run_installer(&f)) {
                                    Ok(()) => {
                                        std::thread::sleep(Duration::from_millis(1500));
                                        app.exit(0);
                                        return;
                                    }
                                    Err(e) => { set(|u| { u.status = "error".into(); u.error = e; }); pending = None; }
                                }
                            }
                            Err(e) => { set(|u| { u.status = "error".into(); u.error = e; }); pending = None; }
                        }
                    }
                } else {
                    INSTALL_NOW.store(false, Ordering::SeqCst);
                }
                std::thread::sleep(Duration::from_secs(2));
            }
        }))
        .ok();
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn an_older_signed_file_is_refused_after_a_newer_one() {
        assert!(below_floor("0.9.22", "0.9.21"));
        assert!(!below_floor("0.9.22", "0.9.22"));
        assert!(!below_floor("0.9.22", "0.9.23"));
        assert!(!below_floor("0", "0.1.0"));
        assert!(below_floor("0.10.0", "0.9.9"));
    }

    #[test]
    fn the_installer_is_hashed_again_from_the_disk() {
        let d = std::env::temp_dir().join(format!("gravitas-upd-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        let f = d.join("GRAVITAS_0.0.1_x64-setup.exe");
        std::fs::write(&f, b"installer bytes").unwrap();
        let want = hex(&Sha256::digest(b"installer bytes"));
        assert!(rehash_ok(&f, &want).is_ok());
        assert!(rehash_ok(&f, &want.to_uppercase()).is_ok());
        std::fs::write(&f, b"installer bytez").unwrap(); // swapped after the check
        assert!(rehash_ok(&f, &want).is_err());
        assert!(rehash_ok(&d.join("missing.exe"), &want).is_err());
        // older installers go, the folder stays
        std::fs::write(d.join("old.exe"), b"x").unwrap();
        fresh_dir(&d).unwrap();
        assert!(std::fs::read_dir(&d).unwrap().next().is_none());
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn only_plain_file_names_are_used() {
        assert_eq!(safe_name("https://gravitasmap.com/gravitas-app/GRAVITAS_0.9.23_x64-setup.exe").as_deref(), Some("GRAVITAS_0.9.23_x64-setup.exe"));
        assert_eq!(safe_name("https://gravitasmap.com/gravitas-app/"), None);
        assert_eq!(safe_name("https://gravitasmap.com/gravitas-app/..%5Cx.exe"), None);
        assert_eq!(safe_name("https://gravitasmap.com/gravitas-app/a b.exe"), None);
    }

    #[test]
    fn versions_compare_as_numbers() {
        assert!(newer("0.10.0", "0.9.9"));
        assert!(newer("1.0", "0.99.4"));
        assert!(!newer("0.5.0", "0.5.0"));
        assert!(!newer("0.5", "0.5.0"));
        assert!(newer("0.5.1", "0.5"));
    }

    /// The file the release script made (site/gravitas-app/version.json) is signed with the key whose public half is inside this app.
    #[test]
    fn the_released_file_verifies_with_the_apps_key() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../site/gravitas-app/version.json");
        let Ok(t) = std::fs::read_to_string(path) else { println!("SKIP: no release made yet"); return };
        let v: Value = serde_json::from_str(&t).unwrap();
        assert!(verified(&v, PUBLIC_KEY), "the signature does not match the public key in the app");
        assert!(v["url"].as_str().unwrap().starts_with(BASE));
    }

    #[test]
    fn only_our_signature_counts() {
        // a file signed with a key made for this test only
        use ed25519_dalek::{Signer, SigningKey};
        let sk = SigningKey::from_bytes(&[7u8; 32]);
        let key_hex = hex(sk.verifying_key().as_bytes());
        let mut v = json!({"latest": "0.6.0", "sha256": "ab", "url": "https://gravitasmap.com/gravitas-app/x.exe", "minimum": "0.5.0", "breaking": false});
        let sig = hex(&sk.sign(message(&v).unwrap().as_bytes()).to_bytes());
        v["signature"] = json!(sig);
        assert!(verified(&v, &key_hex));
        let mut tampered = v.clone();
        tampered["url"] = json!("https://evil.example/x.exe");
        assert!(!verified(&tampered, &key_hex), "a changed address breaks the signature");
        let mut other = v.clone();
        other["sha256"] = json!("cd");
        assert!(!verified(&other, &key_hex), "a changed hash breaks the signature");
        assert!(!verified(&v, &hex(SigningKey::from_bytes(&[8u8; 32]).verifying_key().as_bytes())), "another key does not match");
        assert!(!verified(&v, "nonsense"));
    }
}
