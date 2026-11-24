//! DRIFT: counts (in memory only) what the game writes that this version does not know, so a change by Frontier shows up in a report
//! instead of as a silent failure. Nothing here is ever sent anywhere or stored: the counters live as long as the process, and the
//! text only leaves the app when the player clicks "Copy diagnostic report" (About page) and pastes it somewhere themselves.
//! The report holds counts, event and music names, bit numbers, the game version and the Windows version: no commander name, no
//! system names, no file paths (only whether the Journal folder and the Bindings were found).
//!
//! Nothing here changes an answer of the app: every function only counts.
use serde_json::{json, Value};
use std::collections::{BTreeSet, HashSet};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering::Relaxed};
use std::sync::{Mutex, OnceLock};

/// at most this many distinct names are kept per set
const CAP: usize = 200;
/// Flags: all 32 documented bits are known (0 Docked .. 31 SrvHighBeam), anything above is new
const FLAGS_KNOWN: u64 = 0xFFFF_FFFF;
/// Flags2: the documented bits end at 19 (FsdHyperdriveCharging); a bit from 20 up is new
const FLAGS2_KNOWN_BITS: u32 = 20;
/// GuiFocus: the documented values are 0 to 11
const GUI_KNOWN: i64 = 12;

static LINES_OK: AtomicU64 = AtomicU64::new(0);
static LINES_BAD: AtomicU64 = AtomicU64::new(0);
static STATUS_OK: AtomicU64 = AtomicU64::new(0);
static STATUS_BAD: AtomicU64 = AtomicU64::new(0);
static FLAGS_MISSING: AtomicU64 = AtomicU64::new(0);
static STATUS_EVENT_ODD: AtomicU64 = AtomicU64::new(0);
static TS_BAD: AtomicU64 = AtomicU64::new(0);
static ENGINE_ERRORS: AtomicU64 = AtomicU64::new(0);
static BINDS_FOUND: AtomicU64 = AtomicU64::new(0);
static BINDS_MISSING: AtomicU64 = AtomicU64::new(0);
static FLAGS_LOGGED: AtomicBool = AtomicBool::new(false);

static EV_UNKNOWN: Mutex<BTreeSet<String>> = Mutex::new(BTreeSet::new());
static MUSIC_UNKNOWN: Mutex<BTreeSet<String>> = Mutex::new(BTreeSet::new());
static FLAG_BITS: Mutex<BTreeSet<String>> = Mutex::new(BTreeSet::new());
static FLAG2_BITS: Mutex<BTreeSet<String>> = Mutex::new(BTreeSet::new());
static GUI_ODD: Mutex<BTreeSet<String>> = Mutex::new(BTreeSet::new());
static FIELDS_MISSING: Mutex<BTreeSet<String>> = Mutex::new(BTreeSet::new());
static ENGINE_MSGS: Mutex<Vec<String>> = Mutex::new(Vec::new());

fn add(set: &Mutex<BTreeSet<String>>, name: &str) {
    if let Ok(mut s) = set.lock() {
        if s.len() < CAP {
            s.insert(name.chars().take(60).collect());
        }
    }
}
fn items(set: &Mutex<BTreeSet<String>>) -> Vec<String> {
    set.lock().map(|s| s.iter().cloned().collect()).unwrap_or_default()
}

/// The Journal events the app uses or deliberately ignores. One list: the events host.rs, the Combat engine, Thargoid, Debrief, PVP, Claims, Bonds,
/// the Bounty counter and the map feed (mapfeed::EVENTS) act on, plus the events the game writes all the time that nothing here needs.
/// A name outside it is "new" (counted, shown by name in the report). Keep it generous: a false alarm costs more than a late one.
pub fn known_events() -> &'static HashSet<&'static str> {
    static K: OnceLock<HashSet<&'static str>> = OnceLock::new();
    K.get_or_init(|| {
        let mut s: HashSet<&'static str> = HashSet::new();
        for l in [crate::host::HERE_FROM, crate::host::IN_GAME, crate::host::OUT_GAME, crate::host::CATCH_UP_EXTRA, crate::mapfeed::EVENTS, USED, IGNORED] {
            s.extend(l.iter().copied());
        }
        s
    })
}

/// acted on by modules that match on the name themselves (debrief, pvp, thargoid, thargoid_rec, claims, bonds, counter, the combat engine)
const USED: &[&str] = &[
    "Bounty", "FactionKillBond", "CapShipBond", "RedeemVoucher", "Died", "Resurrect", "WingJoin", "WingAdd", "WingLeave", "UnderAttack", "HullDamage", "HeatWarning", "HeatDamage",
    "ShieldState", "ShipTargeted", "Interdicted", "Interdiction", "EscapeInterdiction", "PVPKill", "Loadout", "Commander", "LoadGame", "Fileheader", "Shutdown", "Docked",
    "Undocked", "SupercruiseEntry", "SupercruiseExit", "StartJump", "USSDrop", "SystemsShutdown", "MaterialCollected", "Music", "Status", "CombatBond", "SelfDestruct",
    "FighterDestroyed", "LaunchFighter", "SupercruiseDestinationDrop", "ReceiveText", "CommitCrime",
];

/// events the game writes that the app does not need (the Journal's own list, as seen in real Journals and the documentation)
const IGNORED: &[&str] = &[
    "AfmuRepairs", "ApproachBody", "ApproachSettlement", "Backpack", "BackpackChange", "BookDropship", "BookTaxi", "Bounty", "BuyAmmo", "BuyDrones",
    "BuyExplorationData", "BuyMicroResources", "Cargo", "CargoDepot", "CargoTransfer", "CarrierBankTransfer", "CarrierBuy", "CarrierCrewServices",
    "CarrierDepositFuel", "CarrierFinance", "CarrierJump", "CarrierJumpCancelled", "CarrierJumpRequest", "CarrierLocation", "CarrierNameChange",
    "CarrierStats", "CarrierTradeOrder", "ChangeCrewRole", "CodexEntry", "CollectCargo", "CollectItems", "ColonisationBeaconDeployed",
    "ColonisationConstructionDepot", "ColonisationContribution", "ColonisationSystemClaim", "ColonisationSystemClaimRelease", "CombatBond",
    "Commander", "CommitCrime", "CompleteConstruction", "CreateSuitLoadout", "CrewAssign", "CrewFire", "CrewHire", "CrewLaunchFighter",
    "CrewMemberJoins", "CrewMemberQuits", "CrewMemberRoleChange", "CrimeVictim", "DataScanned", "DatalinkScan", "DatalinkVoucher",
    "DeleteSuitLoadout", "DeliverPowerMicroResources", "Died", "DiscoveryScan", "Disembark", "DockSRV", "Docked", "DockingCancelled",
    "DockingDenied", "DockingGranted", "DockingRequested", "DropItems", "DropshipDeploy", "EjectCargo", "Embark", "EndCrewSession",
    "EngineerContribution", "EngineerCraft", "EngineerProgress", "EscapeInterdiction", "FCMaterials", "FSDJump", "FSDTarget", "FSSAllBodiesFound",
    "FSSBodySignals", "FSSDiscoveryScan", "FSSSignalDiscovered", "FactionKillBond", "FetchRemoteModule", "FighterDestroyed", "FighterRebuilt",
    "Fileheader", "Friends", "FuelScoop", "GameModeChange", "HeatDamage", "HeatWarning", "HullDamage", "Interdicted", "JetConeBoost", "JoinACrew",
    "KickCrewMember", "LaunchDrone", "LaunchFighter", "LaunchSRV", "LaunchVessel", "LeaveBody", "Liftoff", "LoadGame", "Loadout",
    "LoadoutEquipModule", "Location", "Market", "MarketBuy", "MarketID", "MarketSell", "MaterialCollected", "MaterialDiscovered", "MaterialTrade",
    "Materials", "MiningRefined", "MissionAbandoned", "MissionAccepted", "MissionCompleted", "MissionFailed", "MissionRedirected", "Missions",
    "ModuleBuy", "ModuleInfo", "ModuleRetrieve", "ModuleSell", "ModuleSellRemote", "ModuleStore", "ModuleSwap", "MultiSellExplorationData", "Music",
    "NavBeaconScan", "NavRoute", "NavRouteClear", "NpcCrewPaidWage", "NpcCrewRank", "Outfitting", "PVPKill", "PayBounties", "PayFines", "Powerplay",
    "PowerplayCollect", "PowerplayDeliver", "PowerplayJoin", "PowerplayMerits", "PowerplayRank", "Progress", "Promotion", "QuitACrew", "Rank",
    "RebootRepair", "ReceiveText", "RedeemVoucher", "RefuelAll", "RenameSuitLoadout", "Repair", "RepairAll", "RepairDrone", "Reputation",
    "ReservedNewContactDetails", "ReservoirReplenished", "RestockVehicle", "Resupply", "Resurrect", "SAAScanComplete", "SAASignalsFound",
    "SRVDestroyed", "Scan", "ScanBaryCentre", "ScanOrganic", "Scanned", "Screenshot", "SearchAndRescue", "SelfDestruct", "SellExplorationData",
    "SellMicroResources", "SellOrganicData", "SellSuit", "SendText", "SetUserShipName", "ShieldState", "ShipLocker", "ShipRedeemed", "ShipTargeted",
    "Shipyard", "ShipyardBuy", "ShipyardNew", "ShipyardRedeem", "ShipyardSell", "ShipyardSwap", "ShipyardTransfer", "Shutdown", "SquadronStartup",
    "StartJump", "Statistics", "StoredModules", "StoredShips", "SuitLoadout", "SupercruiseDestinationDrop", "SupercruiseEntry", "SupercruiseExit",
    "SwitchSuitLoadout", "Synthesis", "SystemsShutdown", "TechnologyBroker", "Touchdown", "TradeMicroResources", "USSDrop", "UnderAttack",
    "Undocked", "UpgradeSuit", "UpgradeWeapon", "UseConsumable", "VehicleSwitch", "WingAdd", "WingInvite", "WingJoin", "WingLeave",
];

/// Music tracks the app knows (host.rs MAP_MUSIC, the Thargoid strings, and the ones the game writes all the time)
pub fn known_music() -> &'static HashSet<&'static str> {
    static K: OnceLock<HashSet<&'static str>> = OnceLock::new();
    K.get_or_init(|| {
        let mut s: HashSet<&'static str> = HashSet::new();
        s.extend(crate::host::MAP_MUSIC.iter().copied());
        s.extend(["Unknown_Encounter", "Combat_Unknown", "Unknown_Exploration", "Exploration", "Supercruise", "DestinationFromSupercruise", "Docking", "Starport", "MainMenu", "CQCMenu"]);
        s.extend(["NoTrack", "OnFoot", "NoInGameMusic", "DestinationFromHyperspace", "DockingComputer", "Combat_SRV", "Combat_Dogfight", "Combat_LargeDogFight", "Unknown_Settlement", "Hyperspace", "Interdiction", "Combat_CapShip", "Combat_HeavyCapShip"]);
        s
    })
}

// ---- Journal ----
pub fn journal_line(ok: bool) {
    (if ok { &LINES_OK } else { &LINES_BAD }).fetch_add(1, Relaxed);
}
/// One Journal event name. A line with no name at all is counted as "(none)".
pub fn event(name: &str) {
    if name.is_empty() {
        add(&EV_UNKNOWN, "(none)");
    } else if !known_events().contains(name) {
        add(&EV_UNKNOWN, name);
    }
}
pub fn music(track: &str) {
    if !track.is_empty() && !known_music().contains(track) {
        add(&MUSIC_UNKNOWN, track);
    }
}
pub fn ts_failed() {
    TS_BAD.fetch_add(1, Relaxed);
}
/// A key event is missing a field the app reads (the event and the field name only).
pub fn field_missing(event: &str, field: &str) {
    add(&FIELDS_MISSING, &format!("{event}.{field}"));
}
/// The fields the app needs on the events that matter most. Only counts.
pub fn check_fields(e: &Value) {
    let ev = e.get("event").and_then(Value::as_str).unwrap_or("");
    let need = match ev {
        "FSDJump" | "Location" | "CarrierJump" => "StarSystem",
        "FactionKillBond" => "Reward",
        "RedeemVoucher" => "Amount",
        _ => return,
    };
    if e.get(need).map_or(true, Value::is_null) {
        field_missing(ev, need);
    }
}

// ---- Status.json ----
pub fn status_read(ok: bool) {
    (if ok { &STATUS_OK } else { &STATUS_BAD }).fetch_add(1, Relaxed);
}

/// What one parsed Status.json says: the flags to use, and whether the file is taken at all.
pub struct StatusIn {
    pub accept: bool,
    pub flags: u64,
    pub flags2: u64,
    pub gui: i64,
}

/// The guard. `event` "Status" is the normal case; any other name with a usable Flags is accepted too (and counted). A Flags that is missing or not an
/// unsigned integer keeps the PREVIOUS flags (before, it became 0 and every overlay hid) and is counted, with one line per session in gravitas.log.
/// Flags2 and GuiFocus behave as before (missing = 0). Also counts the bits and the GuiFocus values this version does not know.
pub fn status_in(v: &Value, prev_flags: u64, prev_flags2: u64) -> StatusIn {
    let flags_v = v.get("Flags").and_then(Value::as_u64);
    let named = v.get("event").and_then(Value::as_str) == Some("Status");
    if !named && flags_v.is_none() {
        return StatusIn { accept: false, flags: prev_flags, flags2: prev_flags2, gui: 0 };
    }
    if !named {
        STATUS_EVENT_ODD.fetch_add(1, Relaxed);
    }
    let flags = match flags_v {
        Some(f) => f,
        None => {
            FLAGS_MISSING.fetch_add(1, Relaxed);
            if !FLAGS_LOGGED.swap(true, Relaxed) {
                crate::store::log("Status.json: Flags is missing or not a whole number, the previous flags are kept (counted, not logged again this session)");
            }
            prev_flags
        }
    };
    let flags2 = v.get("Flags2").and_then(Value::as_u64).unwrap_or(0);
    let gui = v.get("GuiFocus").and_then(Value::as_i64).unwrap_or(0);
    if flags_v.is_some() {
        let odd = flags & !FLAGS_KNOWN;
        if odd != 0 {
            for b in 0..64 {
                if odd >> b & 1 == 1 {
                    add(&FLAG_BITS, &b.to_string());
                }
            }
        }
    }
    if flags2 >> FLAGS2_KNOWN_BITS != 0 {
        for b in FLAGS2_KNOWN_BITS..64 {
            if flags2 >> b & 1 == 1 {
                add(&FLAG2_BITS, &b.to_string());
            }
        }
    }
    if gui >= GUI_KNOWN {
        add(&GUI_ODD, &gui.to_string());
    }
    StatusIn { accept: true, flags, flags2, gui }
}

// ---- engine, bindings ----
/// A JavaScript error of the Combat engine: counted, the first three messages kept (the first line of each, cut at 120 characters).
pub fn engine_error(msg: &str) {
    ENGINE_ERRORS.fetch_add(1, Relaxed);
    if let Ok(mut m) = ENGINE_MSGS.lock() {
        if m.len() < 3 {
            m.push(msg.lines().next().unwrap_or("").chars().take(120).collect());
        }
    }
}
pub fn bindings(found: bool) {
    (if found { &BINDS_FOUND } else { &BINDS_MISSING }).fetch_add(1, Relaxed);
}

// ---- reading it ----
/// true when something unknown was seen (the one-line note on the Modes page).
pub fn flag() -> bool {
    let n = |a: &AtomicU64| a.load(Relaxed);
    let sets = [&EV_UNKNOWN, &MUSIC_UNKNOWN, &FLAG_BITS, &FLAG2_BITS, &GUI_ODD, &FIELDS_MISSING];
    sets.iter().any(|s| s.lock().map(|g| !g.is_empty()).unwrap_or(false))
        || n(&FLAGS_MISSING) > 0
        || n(&ENGINE_ERRORS) > 0
        || n(&TS_BAD) > 0
        || n(&LINES_BAD) > 0
        || (n(&STATUS_BAD) >= 5 && n(&STATUS_OK) == 0)
}

pub fn snapshot() -> Value {
    let n = |a: &AtomicU64| a.load(Relaxed);
    json!({
        "journal_lines_ok": n(&LINES_OK),
        "journal_lines_failed": n(&LINES_BAD),
        "unknown_events": items(&EV_UNKNOWN),
        "unknown_music": items(&MUSIC_UNKNOWN),
        "status_ok": n(&STATUS_OK),
        "status_failed": n(&STATUS_BAD),
        "status_flags_missing": n(&FLAGS_MISSING),
        "status_event_not_status": n(&STATUS_EVENT_ODD),
        "unknown_flag_bits": items(&FLAG_BITS),
        "unknown_flags2_bits": items(&FLAG2_BITS),
        "odd_gui_focus": items(&GUI_ODD),
        "engine_errors": n(&ENGINE_ERRORS),
        "engine_messages": ENGINE_MSGS.lock().map(|m| m.clone()).unwrap_or_default(),
        "bindings_found": n(&BINDS_FOUND),
        "bindings_missing": n(&BINDS_MISSING),
        "timestamps_failed": n(&TS_BAD),
        "fields_missing": items(&FIELDS_MISSING),
        "flag": flag(),
    })
}

/// What the newest Journal's first line (Fileheader) says about the game, and the Windows version. No names.
#[derive(Default, Clone)]
pub struct GameInfo {
    pub journal_folder_found: bool,
    pub game_version: String,
    pub build: String,
    pub part: String,
    pub language: String,
    pub odyssey: String,
    pub windows: String,
}

pub fn game_info() -> GameInfo {
    let mut g = GameInfo::default();
    if let Some(dir) = crate::journal::saved_games() {
        g.journal_folder_found = true;
        if let Some(p) = crate::journal::newest(&dir) {
            use std::io::Read;
            let mut head = Vec::new();
            if let Ok(f) = std::fs::File::open(p) {
                let _ = f.take(64 * 1024).read_to_end(&mut head);
            }
            let first = String::from_utf8_lossy(&head).lines().next().unwrap_or("").to_string();
            if let Ok(v) = serde_json::from_str::<Value>(&first) {
                let s = |k: &str| v.get(k).map(|x| x.as_str().map(str::to_string).unwrap_or_else(|| x.to_string())).unwrap_or_default();
                g.game_version = s("gameversion");
                g.build = s("build").trim().to_string();
                g.part = s("part");
                g.language = s("language");
                g.odyssey = s("Odyssey");
            }
        }
    }
    g.windows = windows_version();
    g
}

/// "10.0.26300.1" from `cmd /c ver` (full path, nothing else is asked of the machine)
fn windows_version() -> String {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let sys = std::env::var_os("SystemRoot").filter(|s| !s.is_empty()).map(std::path::PathBuf::from).unwrap_or_else(|| std::path::PathBuf::from(r"C:\Windows"));
        if let Ok(o) = std::process::Command::new(sys.join("System32").join("cmd.exe")).args(["/c", "ver"]).creation_flags(0x0800_0000).output() {
            let t = String::from_utf8_lossy(&o.stdout);
            if let (Some(a), Some(b)) = (t.find("Version "), t.rfind(']')) {
                if b > a + 8 {
                    return t[a + 8..b].trim().to_string();
                }
            }
        }
    }
    String::new()
}

pub fn report_text(app_version: &str, game: GameInfo) -> String {
    let n = |a: &AtomicU64| a.load(Relaxed);
    let list = |v: Vec<String>| if v.is_empty() { "none".to_string() } else { v.join(", ") };
    let or = |s: &str| if s.is_empty() { "unknown".to_string() } else { s.to_string() };
    let msgs = ENGINE_MSGS.lock().map(|m| m.clone()).unwrap_or_default();
    let mut t = String::new();
    t.push_str("GRAVITAS diagnostic report\n");
    t.push_str("(counts since the app started; kept in memory only; nothing was sent anywhere)\n\n");
    t.push_str(&format!("App version: {app_version}\n"));
    t.push_str(&format!("Game: version {}, build {}, part {}, language {}, Odyssey {}\n", or(&game.game_version), or(&game.build), or(&game.part), or(&game.language), or(&game.odyssey)));
    t.push_str(&format!("Windows: {}\n", or(&game.windows)));
    t.push_str(&format!("Journal folder found: {}\n", if game.journal_folder_found { "yes" } else { "no" }));
    t.push_str(&format!("Bindings file: found {} times, not found {} times\n\n", n(&BINDS_FOUND), n(&BINDS_MISSING)));
    t.push_str(&format!("Journal lines read: {}, failed to parse: {}\n", n(&LINES_OK), n(&LINES_BAD)));
    t.push_str(&format!("Events this version does not know: {}\n", list(items(&EV_UNKNOWN))));
    t.push_str(&format!("Music tracks this version does not know: {}\n", list(items(&MUSIC_UNKNOWN))));
    t.push_str(&format!("Timestamps that failed to parse: {}\n", n(&TS_BAD)));
    t.push_str(&format!("Fields missing on key events: {}\n\n", list(items(&FIELDS_MISSING))));
    t.push_str(&format!("Status.json reads: {} ok, {} failed\n", n(&STATUS_OK), n(&STATUS_BAD)));
    t.push_str(&format!("Status.json with Flags missing or not a whole number: {}\n", n(&FLAGS_MISSING)));
    t.push_str(&format!("Status.json with an event name other than Status: {}\n", n(&STATUS_EVENT_ODD)));
    t.push_str(&format!("Flags bits above the known ones: {}\n", list(items(&FLAG_BITS))));
    t.push_str(&format!("Flags2 bits above the known ones: {}\n", list(items(&FLAG2_BITS))));
    t.push_str(&format!("GuiFocus values of {GUI_KNOWN} or more: {}\n\n", list(items(&GUI_ODD))));
    t.push_str(&format!("Combat engine errors: {}\n", n(&ENGINE_ERRORS)));
    for (i, m) in msgs.iter().enumerate() {
        t.push_str(&format!("  {}. {}\n", i + 1, m));
    }
    t
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn the_known_list_holds_what_the_app_uses() {
        let k = known_events();
        for e in ["FSDJump", "Bounty", "Music", "ShipTargeted", "UnderAttack", "PVPKill", "SystemsShutdown", "Cargo", "Materials", "Commander", "Reputation", "Fileheader"] {
            assert!(k.contains(e), "{e}");
        }
        assert!(!k.contains("TotallyNewEvent"));
        assert!(known_music().contains("Unknown_Encounter") && known_music().contains("GalaxyMap"));
    }

    #[test]
    fn unknown_names_are_kept_by_name_and_capped() {
        event("DriftTestNewEvent");
        music("DriftTestTrack");
        assert!(items(&EV_UNKNOWN).contains(&"DriftTestNewEvent".to_string()));
        assert!(items(&MUSIC_UNKNOWN).contains(&"DriftTestTrack".to_string()));
        assert!(flag());
        let s = Mutex::new(BTreeSet::new());
        for i in 0..1000 {
            add(&s, &format!("e{i}"));
        }
        assert_eq!(items(&s).len(), CAP);
    }

    #[test]
    fn status_guard_keeps_the_previous_flags() {
        let before = FLAGS_MISSING.load(Relaxed);
        for bad in [json!({"event":"Status","Flags":"16"}), json!({"event":"Status"}), json!({"event":"Status","Flags":-5}), json!({"event":"Status","Flags":1.5}), json!({"event":"Status","Flags":null})] {
            let r = status_in(&bad, 0x1234, 7);
            assert!(r.accept && r.flags == 0x1234, "{bad}");
        }
        assert!(FLAGS_MISSING.load(Relaxed) >= before + 5);
        let ok = status_in(&json!({"event":"Status","Flags":16,"Flags2":1,"GuiFocus":3}), 0x1234, 7);
        assert_eq!((ok.accept, ok.flags, ok.flags2, ok.gui), (true, 16, 1, 3));
    }

    #[test]
    fn a_renamed_event_is_accepted_when_flags_is_there() {
        let r = status_in(&json!({"event":"StatusV2","Flags":24}), 0, 0);
        assert!(r.accept && r.flags == 24);
        let r = status_in(&json!({"event":"Cargo","Inventory":[]}), 5, 0);
        assert!(!r.accept && r.flags == 5);
    }

    #[test]
    fn unknown_bits_and_gui_values_are_counted() {
        status_in(&json!({"event":"Status","Flags":(1u64 << 40) | 1,"Flags2":1u64 << 30,"GuiFocus":14}), 0, 0);
        assert!(items(&FLAG_BITS).contains(&"40".to_string()));
        assert!(items(&FLAG2_BITS).contains(&"30".to_string()));
        assert!(items(&GUI_ODD).contains(&"14".to_string()));
    }

    #[test]
    fn missing_fields_on_key_events_are_noted() {
        check_fields(&json!({"event":"FSDJump"}));
        check_fields(&json!({"event":"FactionKillBond"}));
        check_fields(&json!({"event":"RedeemVoucher","Amount":null}));
        check_fields(&json!({"event":"FSDJump","StarSystem":"Sol"}));
        let f = items(&FIELDS_MISSING);
        for k in ["FSDJump.StarSystem", "FactionKillBond.Reward", "RedeemVoucher.Amount"] {
            assert!(f.contains(&k.to_string()), "{k}");
        }
    }

    #[test]
    fn the_report_has_no_names_and_says_what_it_counts() {
        engine_error("TypeError: x is undefined\n    at foo");
        let t = report_text("0.9.23", GameInfo { game_version: "4.4.2.1".into(), ..Default::default() });
        assert!(t.contains("App version: 0.9.23") && t.contains("4.4.2.1") && t.contains("Combat engine errors"));
        assert!(!t.contains('\\'), "no file paths");
        let s = snapshot();
        assert!(s["engine_errors"].as_u64().unwrap() >= 1 && s["flag"].is_boolean());
    }
}
