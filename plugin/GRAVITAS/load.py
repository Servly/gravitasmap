"""GRAVITAS for EDMC: Combat Mode on top of the game.

https://gravitasmap.com · MIT licence · by CMDR Hongark and Claude (Anthropic)

The fight is worked out by the same Combat Mode code as the GRAVITAS site, run here in QuickJS. EDMC gives the
Journal lines and Status.json; the result is drawn by GRAVITAS's own overlay (gravitas_edmc/hud.py): a see-through
window over the game that lets every click through. Nothing else to install.
Everything stays on this computer: this plugin opens no network connection.

Folders: gravitas_edmc/ (the plugin), gravitas_edmc/modes/ (one file per mode: Combat now; Thargoid and Route later),
engine/ (the site's combat engine), lib/ (QuickJS for 32 and 64-bit Windows and Linux).
"""
import json
import math
import logging
from datetime import datetime, timezone
import os
import sys
import time
import tkinter as tk

from config import appname, config

PLUGIN_NAME = "GRAVITAS"
VERSION = "0.37.0"
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

logger = logging.getLogger(f"{appname}.{os.path.basename(HERE)}")

from gravitas_edmc.engine import Engine          # noqa: E402
from gravitas_edmc.hud import Hud, game_rect, WIN, BETWEEN as H_BETWEEN    # noqa: E402
from gravitas_edmc.modes import combat          # noqa: E402
from gravitas_edmc import settings as gs         # noqa: E402
from gravitas_edmc import look                   # noqa: E402
from gravitas_edmc import planes                 # noqa: E402
from gravitas_edmc.history import History        # noqa: E402
from gravitas_edmc.past import PastWindow        # noqa: E402
from gravitas_edmc import bounty                 # noqa: E402
from gravitas_edmc import panelkeys              # noqa: E402
from gravitas_edmc import profiles               # noqa: E402
from gravitas_edmc.timing import Lag             # noqa: E402
from gravitas_edmc.journal import Tail, Once, folder as game_folder    # noqa: E402
from gravitas_edmc.claims import Claims          # noqa: E402

LOOK_MS = 50            # the free-look button is read this often, while that setting is on
FRONT_MS = 16           # the HUD hides at once when another program comes in front (v0.17.0: was the tracking's turn)
TICK_MS = 250           # the HUD's contents are brought up to date four times a second
FOCUS_MS = 15           # Status.json is looked at this often: the windows go with the game's panels at once (v0.10.0)
MAP_GUESS_S = 5.0       # v0.28.0: a map takes a while to load: its key's guess waits this long for Status.json
SETTLE_S = 0.8          # a panel closed from the game's screens (not by its key): the windows ahead wait this long, as a map may come
GUESS_S = 1.0           # a panel guessed from its key (panelkeys.py) that Status.json does not confirm this soon: taken back
CALM_MS = 8000          # v0.26.0: the game's combat music over and "in danger" gone this long: the fight is over
FRESH_S = 60            # a Journal line older than this sets the scene but starts nothing (EDMC catching up)


class State:
    engine = None
    hud = None
    hud_failed = False
    prefs = None
    settings = None
    label = None
    after_id = None
    root = None
    rev = -1
    history = None
    past = None             # the Past combats window, when open
    last_error = ""
    gui = 0                 # GuiFocus from Status.json: 0 none, 1 right panel, 2 left, 3 comms, 4 role, 5-11 maps and services
    hot = False             # the shooting was going on at the last tick
    preview = False         # Preview on (v0.4.0: on until turned off, not for 20 s)
    preview_t0 = 0          # when it was turned on: the COMBAT banner shows first, then the report (not both at once)
    looking = False         # free look: you are looking around (the button held, or toggled on)
    look_toggle = False
    look_id = None
    mouse = None            # look.RawMouse, made when free look is first turned on
    front_id = None
    focus_id = None
    status_seen = None      # Status.json as last read (its time and size): read again when it changes
    status_n = 0            # looks at it so far (it is read in full now and then anyway)
    status_ts = ""          # the newest Status.json line taken (its timestamp)
    unseen = 0
    last_move = None
    flags = 0               # Status.json's Flags and Flags2
    flags2 = 0
    banner_until = 0
    saved = set()           # the fights whose report is kept already (by start time)
    shown = None            # a past report shown on the HUD from that window, and until when: (view, time)
    counter = None          # bounty.Counter: this game session's bounties (v0.16.0)
    keys = None             # bounty.Keys: Ctrl+Shift+F9 to F12
    key_hidden = False      # Ctrl+Shift+F11: the HUD hidden
    key_off = False         # Ctrl+Shift+F12: the HUD off
    in_game = None          # v0.18.0: the game loaded and in space (Journal); None: not known yet (EDMC started late)
    panel_keys = None       # panelkeys.PanelKeys: the game's panel keys, seen as they go down
    guess = None            # (the panel guessed from its key, when)
    need_boot = True        # the windows boot up as holograms the next time they show (bootfx.py)
    map_music = False       # v0.28.0: a map's music plays (GalaxyMap, SystemMap, FSS...): a map is open
    tail = None             # v0.33.0: journal.Tail, the newest Journal read here (every line, journal_tail)
    once = None             # journal.Once: each line handled once, by GRAVITAS's reader or EDMC, whichever is first
    system = None           # the star system, from the Journal (or EDMC)
    claims = None           # v0.37.0: claims.Claims
    status_fed = None       # v0.34.0: the last Status.json line given to the engine (from GRAVITAS's own reading)
    t_start = 0.0
    folder = None           # the game's folder, found by GRAVITAS (journal.folder), looked for again if missing
    folder_look = -10.0
    lag = None             # v0.32.0: timing.Lag, EDMC's delay against GRAVITAS's own reading
    headlook = None         # v0.22.0: the game's own free look, from its controls (panelkeys.headlook), {} if unread
    look_held = False
    keys_shown = False      # v0.21.0: the Keys card shown since the HUD came on (until when: keys_until)
    had_fire = False        # v0.26.0: a fight with shooting is on (seen live): its end brings the report
    last_view = None        # the last fight that ended with shooting, as it ended (its report, for Ctrl+Shift+F8)
    report_until = 0.0      # the report shows until then (as a fight ends, or asked for with Ctrl+Shift+F8)
    report_auto = False     # shown as the fight ended (only if its window is on) or asked for (always)
    keys_until = 0.0


S = State()


def plugin_start3(plugin_dir):
    S.lag = Lag(logger)
    S.tail, S.once = Tail(), Once()
    S.claims = Claims()                          # v0.37.0: bounties to claim, from every Journal since the last death
    S.t_start = time.perf_counter()
    S.settings = gs.Settings()
    S.engine = Engine(HERE, logger)
    S.history = History(HERE, logger)
    S.counter = bounty.Counter()
    S.keys = bounty.Keys()
    return PLUGIN_NAME


def plugin_stop():
    try:                                         # v0.36.0: a fight still on as EDMC closes: ended and kept
        if S.engine and S.engine.ok:
            S.engine.end()
            fight_step()
    except Exception as e:
        logger.warning(f"GRAVITAS: the last fight could not be kept: {e}")
    try:
        if S.lag:
            S.lag.tick(time.perf_counter(), final=True)
        if S.root is not None and S.after_id:
            S.root.after_cancel(S.after_id)
        if S.root is not None and S.look_id:
            S.root.after_cancel(S.look_id)
        if S.root is not None and S.front_id:
            S.root.after_cancel(S.front_id)
        if S.root is not None and S.focus_id:
            S.root.after_cancel(S.focus_id)
        if S.mouse:
            S.mouse.stop()
    except Exception:
        pass
    if S.hud:
        S.hud.destroy()
    if S.engine:
        S.engine.stop()


def status_text():
    """EDMC's main window and the settings' head: only the name and the version (v0.17.0), and an error if any."""
    e = S.engine
    bad = "" if e and e.ok else f" · engine not running: {e.error if e else 'not started'}"
    return f"GRAVITAS v{VERSION}{bad}"


def plugin_app(parent):
    """A short line in EDMC's main window with the Past combats button, and the loop four times a second (on EDMC's own
    thread). Only plain tk widgets here: EDMC gives them its theme."""
    S.root = parent
    f = tk.Frame(parent)
    f.columnconfigure(0, weight=1)
    S.label = tk.Label(f, text=status_text(), anchor=tk.W, justify=tk.LEFT)
    S.label.grid(row=0, column=0, sticky=tk.EW)
    tk.Button(f, text="Past combats", command=open_past).grid(row=0, column=1, sticky=tk.E, padx=(6, 0))
    S.after_id = parent.after(TICK_MS, loop)
    S.look_id = parent.after(LOOK_MS, look_loop)
    S.front_id = parent.after(FRONT_MS, front_loop)
    S.focus_id = parent.after(FOCUS_MS, focus_loop)
    return f


def open_past():
    """The Past combats window (one at a time)."""
    if S.past and S.past.alive():
        S.past.top.lift()
        return
    S.past = PastWindow(S.root.winfo_toplevel(), S.history, show_past)


def show_past(v):
    S.shown = (dict(v, past=True), time.time() + 20)


def plugin_prefs(parent, cmdr, is_beta):
    S.headlook = None                            # (read again: the game's controls may have changed)
    def preview():
        S.preview = not S.preview
        S.preview_t0 = time.time()
        S.need_boot = True
        draw_safe()
        return S.preview
    S.prefs = gs.Prefs(parent, S.settings, preview, status_text(), S.preview,
                       headlook=(panelkeys.headlook() or {}).get("label", ""), on_snap=snap)
    S.prefs.frame.bind("<Destroy>", lambda ev: preview_off() if ev.widget is S.prefs.frame else None)
    return S.prefs.frame


def preview_off():
    """v0.35.0: Preview ends as the settings close (OK or Cancel): a moved window now turns it on by itself, and its
    sample fight must never stay over the real game."""
    if S.preview:
        S.preview = False
        S.need_boot = True
        draw_safe()


def snap(key, where):
    """v0.35.0: a window to the left or right edge, the middle, the top or the bottom of the game window in one click
    (Windows tab): from where it is drawn now, the shift it needs, drawn again until it is there (a window held inside
    the screen at an edge takes two goes)."""
    s = S.settings
    w = s.win.get(key)
    if not w:
        return
    for _ in range(4):
        draw_safe()
        h = S.hud
        sp = h.sprites.get(key) if h else None
        if not sp or sp.img is None or not h.H:
            break
        W, H = h.W, h.H
        (x, y), (iw, ih) = sp.pos, sp.img.size
        m = round(0.015 * W)
        dx, dy = {"left": (m - x, 0), "right": (W - m - iw - x, 0), "centre": ((W - iw) / 2 - x, 0),
                  "top": (0, m - y), "bottom": (0, H - m - ih - y)}[where]
        if abs(dx) < 2 and abs(dy) < 2:
            break
        if s.auto:
            w["dx"] = round(max(-gs.DX_MAX, min(gs.DX_MAX, w["dx"] + dx / H * 100)), 1)
            w["dy"] = round(max(-gs.DY_MAX, min(gs.DY_MAX, w["dy"] + dy / H * 100)), 1)
        else:
            w["x"] = round(max(0.0, min(98.0, w["x"] + dx / W * 100)), 1)
            w["y"] = round(max(0.0, min(98.0, w["y"] + dy / H * 100)), 1)
    s.store(key, w)
    draw_safe()


def prefs_changed(cmdr, is_beta):
    try:
        S.prefs.apply()
    except Exception as e:
        logger.warning(f"GRAVITAS settings: {e}")
    preview_off()




PANEL_OF = {w: g for w, _, g in combat.WHEN}    # each "Shows" choice: the game's panel it needs open (None: the main panel)
IN_GAME = ("Location", "Undocked", "Docked", "FSDJump", "SupercruiseEntry", "SupercruiseExit", "StartJump", "Touchdown",
           "Liftoff", "ShipTargeted")
OUT_GAME = ("Fileheader", "LoadGame", "Shutdown")
# v0.27.0: the game puts the view back ahead by itself on these (and in its maps): free look is over then
# v0.28.0: the game plays a map's own music the moment it opens, and writes it to the Journal at once; Status.json is
# written only once a second (measured: always at the same part of the second), so its GuiFocus came up to a second late
MAP_MUSIC = ("GalaxyMap", "SystemMap", "SystemAndSurfaceScanner", "Codex", "FleetCarrier_Managment", "Squadrons",
             "GalacticPowers")
LOOK_RESET = ("LoadGame", "Docked", "Undocked", "FSDJump", "SupercruiseEntry", "SupercruiseExit", "Died", "Resurrect")


HERE_FROM = ("Location", "FSDJump", "CarrierJump", "SupercruiseExit", "SupercruiseEntry")


def journal_entry(cmdr, is_beta, system, station, entry, state):
    """EDMC's copy of a Journal line: handled only if GRAVITAS's own reader has not had it first (v0.33.0)."""
    t = time.perf_counter()
    if S.lag:                                     # v0.32.0: how late EDMC hands it over (timing.py)
        S.lag.edmc_gave(entry.get("timestamp"), entry.get("event"), t)
    if system:
        S.system = system
    if S.once and not S.once.first("edmc", entry, t):
        return
    handle(entry)
    if S.once:
        S.once.done("edmc", entry, t)


def handle(entry):
    """One Journal line, from whichever side brought it first."""
    ev = entry.get("event")
    if ev in HERE_FROM and entry.get("StarSystem"):
        S.system = entry.get("StarSystem")
    # v0.18.0: the HUD shows only in the game itself: not in the intro, the menu or while it loads
    if ev in OUT_GAME or (ev == "Music" and entry.get("MusicTrack") in ("MainMenu", "CQCMenu")):
        S.in_game = False
    elif ev in IN_GAME:
        S.in_game = True
    if ev in ("Loadout", "LoadGame"):
        ship_profile(entry)
    if ev in LOOK_RESET:
        look_reset()
    if ev == "Music":
        music(entry.get("MusicTrack"))
    if S.counter:
        S.counter.feed(entry)
    if S.claims:
        S.claims.feed(entry)
    if not S.engine or not S.engine.ok:
        return
    if S.system:
        S.engine.here(S.system)
    age = 0
    try:
        t = datetime.strptime(entry.get("timestamp", ""), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        age = time.time() - t.timestamp()
    except Exception:
        pass
    S.engine.feed(entry, age > FRESH_S)


def dashboard_entry(cmdr, is_beta, entry):
    # v0.20.0: which panel is open comes from focus_loop only (one reader, the newest line wins): EDMC's own copy of
    # Status.json came at other times, and an older one could put back "no panel" while one was open (the windows
    # ahead stayed up until Status.json was written again). v0.34.0: the engine's Status too; EDMC's copy is used only
    # if GRAVITAS has not found the game's folder
    if not entry or status_path() is not None:
        return
    S.flags, S.flags2 = int(entry.get("Flags") or 0), int(entry.get("Flags2") or 0)
    set_gui(int(entry.get("GuiFocus") or 0))
    if S.engine and S.engine.ok:
        S.engine.status(entry)


def set_gui(gui):
    """One of the game's panels opened or closed: the windows go with the head's turn at once (hud.set_focus: moved
    and faded, nothing drawn again)."""
    if gui == S.gui:
        # (Status.json is written for many things: one written before the game has opened the panel a key just
        # asked for must not undo the guess: that made the windows go, come back and go again, v0.19.0)
        return
    g = S.guess
    if gui == 0 and S.gui in (1, 2, 3, 4) and not g and S.hud:
        # v0.28.0: a panel closed by the game itself, not by its key (the galaxy or system map chosen in the left
        # panel): the game says "no panel" at once and the map only once it has loaded, and the windows ahead came up
        # over the map's opening (CMDR Hongark). In between nothing shows; ahead only if no map has come by then
        S.gui = gui
        S.hud.set_focus(H_BETWEEN)
        if S.root is not None:
            S.root.after(int(SETTLE_S * 1000), settle)
        return
    if gui == 0 and g and g[0] in (1, 2, 3, 4) and time.perf_counter() - g[1] < GUESS_S:
        # v0.26.0: from one side panel straight to another (1 then 4) the game says "no panel" for a moment as the head
        # passes the middle: the windows ahead came up and went again. A side panel a key has just asked for keeps the
        # HUD where it is; Status.json saying that panel ends the guess, as ever (and a guess not met is taken back)
        S.gui = gui
        return
    S.guess = None                                # Status.json has said which panel is open
    S.gui = gui
    if gui in combat.MAPS:
        look_reset()                              # (a map or station services: the game ends free look)
    # (v0.23.0: a panel opened or closed in free look no longer ends it: the game keeps looking around, and the HUD
    # came back in the middle of it, CMDR Hongark; free look ends only with its own button)
    if S.hud:
        S.hud.set_focus(gui)
    if S.root is not None:
        S.root.after_idle(draw_safe)              # (the maps hide the HUD)


def status_path():
    """Status.json in the game's folder: v0.34.0 found by GRAVITAS itself (a folder chosen by hand in EDMC's settings
    still wins), looked for again every 10 s while not there."""
    p = os.environ.get("GRAVITAS_STATUS_FILE")
    if p:
        return p
    now = time.perf_counter()
    if S.folder is None and now - S.folder_look > 10:
        S.folder_look = now
        S.folder = game_folder(config.get_str("journaldir"), getattr(config, "default_journal_dir", None))
    return os.path.join(S.folder, "Status.json") if S.folder else None


def focus_loop():
    """The game writes Status.json the moment a panel opens; it is looked at here every 15 ms (only its time and size,
    unless it changed), as SrvSurvey watches it: the windows start moving with the head's turn, not after it."""
    try:
        p = status_path()
        if p:
            st = os.stat(p)
            seen = (st.st_mtime_ns, st.st_size)
            S.status_n += 1
            # read when it changed, and every 12th look (0.18 s) anyway: "GuiFocus":0 and "GuiFocus":2 are the same size,
            # and two writes close together can show one time (v0.20.0)
            if seen != S.status_seen or S.status_n % 12 == 0:
                with open(p, encoding="utf-8") as f:
                    entry = json.load(f)
                S.status_seen = seen          # (a file half written fails to read: tried again next time)
                if entry.get("event") == "Status" and str(entry.get("timestamp", "")) >= S.status_ts:
                    S.status_ts = str(entry.get("timestamp", ""))     # (never an older line over a newer one)
                    S.flags, S.flags2 = int(entry.get("Flags") or 0), int(entry.get("Flags2") or 0)
                    set_gui(int(entry.get("GuiFocus") or 0))
                    if entry != S.status_fed and S.engine and S.engine.ok:
                        S.status_fed = entry          # v0.34.0: the engine's Status from here, not EDMC's later copy
                        S.engine.status(entry)
    except (OSError, ValueError):
        pass
    try:
        journal_tail()
        if S.lag:
            S.lag.tick(time.perf_counter())
    except OSError:
        pass
    except Exception as e:
        if str(e) != S.last_error:
            S.last_error = str(e)
            logger.exception(f"GRAVITAS journal: {e}")
    try:
        guess_panel()
    except Exception as e:
        if str(e) != S.last_error:
            S.last_error = str(e)
            logger.exception(f"GRAVITAS panel keys: {e}")
    except Exception as e:
        if str(e) != S.last_error:
            S.last_error = str(e)
            logger.exception(f"GRAVITAS: {e}")
    if S.root is not None:
        S.focus_id = S.root.after(FOCUS_MS, focus_loop)


def settle():
    """After SETTLE_S: still no panel and no map: the windows ahead come back (with their boot)."""
    if S.hud and S.hud.gui == H_BETWEEN and S.gui == 0:
        S.hud.set_focus(0)
        draw_safe()


def guess_panel():
    """v0.18.0: a panel key just pressed in the ship: the windows go with the head's turn now, before Status.json says
    so (it comes a moment later). Not confirmed within GUESS_S: taken back."""
    h = S.hud
    if h is None or not WIN:
        return
    if S.panel_keys is None:
        S.panel_keys = panelkeys.PanelKeys()
    if not S.panel_keys.ok or not in_cockpit():
        return
    g = S.panel_keys.guess(h.gui)
    now = time.perf_counter()
    if g is not None and game_in_front():
        S.guess = (g, now)
        h.set_focus(g)
        if g in combat.MAPS:
            draw_safe()                          # (a map asked for: the HUD goes at once)
    elif S.guess and now - S.guess[1] > (MAP_GUESS_S if S.guess[0] in combat.MAPS else GUESS_S):
        S.guess = None
        h.set_focus(S.gui)
        draw_safe()


def ship_profile(entry):
    """v0.19.0: boarding a ship that has a profile of its own (named after its type or its name): that profile."""
    kind = entry.get("Ship_Localised") or entry.get("Ship") or ""
    try:
        from edmc_data import ship_name_map         # EDMC's own names: "python_nx" is "Python Mk II"
        kind = ship_name_map.get(str(entry.get("Ship", "")).lower(), kind)
    except Exception:
        pass
    name = profiles.for_ship(kind, entry.get("ShipName"), entry.get("ShipIdent"), entry.get("Ship"))
    if name and name != profiles.active() and profiles.load(name, S.settings, S.settings.store):
        logger.info(f"GRAVITAS: profile {name!r} for this ship")
        if S.prefs:
            S.prefs.refresh()
        draw_safe()


def music(track):
    """A map's music started or stopped (from the Journal: read here first, or through EDMC, whichever comes first)."""
    in_map = track in MAP_MUSIC
    if in_map != S.map_music:
        S.map_music = in_map
        if in_map:
            look_reset()
        draw_safe()                               # (into a map: the HUD goes at once; out of it: Status.json says where)


def journal_tail():
    """v0.33.0: every new line of the newest Journal, read here (journal.py) and handled at once: EDMC handed them over
    0.6 s later in the middle, up to 1.4 s (v0.32.0's measurement). EDMC's copies are then skipped (journal_entry)."""
    sp = status_path()
    t = time.perf_counter()
    if not S.tail.found and S.engine and not S.engine.ok and t - S.t_start < 5:
        return                                    # (the past waits for the engine, a moment as EDMC starts)
    new = S.tail.lines(os.path.dirname(sp) if sp else None)
    if S.tail.past is not None:
        past, S.tail.past = S.tail.past, None
        catch_up(past)
        if S.claims and sp:                      # (the older Journals: read once, on a thread of their own)
            S.claims.start(os.path.dirname(sp), S.tail.path)
    elif S.claims and not sp and t - S.t_start > 5:
        S.claims.start(None, None)               # (no game folder found: what EDMC hands over from now on, not "reading")
    for e in new:
        if S.lag:
            S.lag.ours_saw(e.get("timestamp"), e.get("event"), t)
        if not S.once.first("ours", e, t):
            continue
        try:
            handle(e)
        except Exception as x:                   # (not marked as handled: EDMC's copy gets its turn)
            if str(x) != S.last_error:
                S.last_error = str(x)
                logger.exception(f"GRAVITAS journal line {e.get('event')}: {x}")
            continue
        S.once.done("ours", e, t)
    S.once.clean(t)


CATCH_UP = IN_GAME + OUT_GAME + ("Loadout", "Music", "CarrierJump", "Died", "Resurrect", "Embark", "Disembark",
                                  "Bounty", "FactionKillBond", "CapShipBond", "RedeemVoucher")
MONEY = ("Bounty", "FactionKillBond", "CapShipBond", "RedeemVoucher", "Died")


def catch_up(lines):
    """v0.34.0: the newest Journal from its first line, as GRAVITAS starts (EDMC started while the game ran): which
    ship (its profile), which system, in the game or in the menu, a map's music. Only the scene: no fight starts and
    this fight's Bounty counter stays at 0 (those were before GRAVITAS was watching); v0.35.0: what you carry
    (unclaimed, cashed in, lost at death) is taken from it."""
    ship = track = None
    now = time.perf_counter()
    for e in lines:
        ev = e.get("event")
        if ev not in CATCH_UP:
            continue
        if ev in HERE_FROM and e.get("StarSystem"):
            S.system = e.get("StarSystem")
        if ev in OUT_GAME or (ev == "Music" and e.get("MusicTrack") in ("MainMenu", "CQCMenu")):
            S.in_game = False
        elif ev in IN_GAME:
            S.in_game = True
        if ev in ("Loadout", "LoadGame"):
            ship = e
        if ev == "Music":
            track = e.get("MusicTrack")
        if ev in MONEY and S.once:                # v0.37.0: EDMC's copy came first (in the first seconds): counted once
            if not S.once.first("ours", e, now):
                continue
            S.once.done("ours", e, now)
        if S.counter:                             # v0.35.0: what you carry, from the whole session (not this fight's count)
            S.counter.feed_past(e)
        if S.claims:
            S.claims.feed(e)
        if ev in ("Bounty", "FactionKillBond", "CapShipBond", "RedeemVoucher"):
            continue                              # (the engine does not need old fights' lines)
        if S.engine and S.engine.ok:
            S.engine.feed(e, True)
    if S.engine and S.engine.ok and S.system:
        S.engine.here(S.system)
    if ship:
        ship_profile(ship)
    if track:
        music(track)
    logger.info(f"GRAVITAS: the Journal read from its start ({len(lines)} lines): in the game {S.in_game}, "
                f"{S.system or 'system not known'}")


def look_reset():
    """v0.27.0: free look over, as the game has put the view back ahead. GRAVITAS only counts the free look button (the
    game says nowhere whether you look around): when the game ended free look by itself, or EDMC started in the middle
    of one, the count stood the wrong way round (the HUD hid when you looked ahead and showed when you looked around)
    until EDMC started again. These are the moments the game ends it for sure."""
    if S.looking or S.look_toggle:
        S.looking = S.look_toggle = False
        if S.root is not None:
            S.root.after_idle(draw_safe)


def in_cockpit():
    """In the ship (or a fighter), in the game itself: not on foot, not in the intro, the menu or a loading screen."""
    if not S.flags & 0x03000000 or S.flags2 & 0x1:
        return False
    return S.in_game is not False


def draw_safe():
    try:
        draw()
    except Exception as e:
        logger.warning(f"GRAVITAS: {e}")


def loop():
    """Four times a second: the engine's clock (a calm ends a fight), then the overlay."""
    try:
        draw()
    except Exception as e:
        if str(e) != S.last_error:              # with where it happened, once for the same error
            S.last_error = str(e)
            logger.exception(f"GRAVITAS: {e}")
    if S.label is not None:
        t = status_text()
        if S.label.cget("text") != t:
            S.label.configure(text=t)
    if S.root is not None:
        S.after_id = S.root.after(TICK_MS, loop)


def game_in_front():
    g = game_rect()
    return bool(g and g[4]) or not WIN


def keys_step():
    """Ctrl+Shift+F9 to F12 (bounty.py): read, never hooked or blocked."""
    if not (S.keys and S.settings.keys):
        return
    for k in S.keys.pressed():
        if k == "reset" and S.counter:
            S.counter.reset()
        elif k == "clear" and S.engine and S.engine.ok:
            S.engine.clear()
        elif k == "hide":
            if S.looking:                        # v0.27.0: hidden by free look: shown again (and the count set right)
                look_reset()
            else:
                S.key_hidden = not S.key_hidden
        elif k == "flip":                        # v0.31.0: free look counted the wrong way round: turned over
            # (the game writes nowhere whether you look around: EDMC started in the middle of a free look counted it
            # backwards, the HUD up as you looked around and gone as you looked ahead, CMDR Hongark)
            if S.settings.look == "hide":
                S.looking = S.look_toggle = not S.looking
                if S.hud:
                    S.hud.hide() if S.looking else None
        elif k == "report":                      # v0.26.0: the last fight's report, or away with it
            up = time.time() < S.report_until and (not S.report_auto or S.settings.win["report"]["on"])
            if up:                               # (on the screen now: closed; not shown, its window off: shown)
                S.report_until = 0.0
            else:
                lv = S.last_view
                if lv is None and S.engine and S.engine.ok:
                    cur = S.engine.view()            # (no fight ended yet this session: the engine's last one, if any)
                    lv = cur if cur and not cur.get("on") and (cur.get("ep") or {}).get("t0") else None
                if lv:
                    S.last_view, S.report_until, S.report_auto = lv, time.time() + S.settings.report_s, False
        draw_safe()


def look_loop():
    """Free look: the HUD hides while you look around (the button held, or from one press to the next). The button is
    seen through Raw Input (or, without it, GetAsyncKeyState); it is never blocked or changed."""
    s, h = S.settings, S.hud
    try:
        keys_step()
        if s.look == "off" or h is None:
            if S.mouse:
                S.mouse.take()                   # (its button events not left to pile up)
            if S.looking:
                S.looking = S.look_toggle = False
                draw_safe()
        else:
            looking = S.looking
            # v0.22.0: the game's own free look, as its controls say (button, held or toggled): GRAVITAS hides when
            # the game looks around, never on its own guess; the settings' button and way only if the game's is unread
            if S.headlook is None:
                S.headlook = panelkeys.headlook() or {}
            hl = S.headlook
            btn = hl.get("mouse") if hl else s.look_btn
            hold = (not hl.get("toggle")) if hl else s.look_how == "hold"
            if hl.get("vk") and WIN:                # a keyboard key: its state looked at
                import ctypes
                down_now = bool(ctypes.windll.user32.GetAsyncKeyState(hl["vk"]) & 0x8000)
                if hold:
                    looking = down_now and game_in_front()
                elif down_now and not S.look_held and game_in_front():
                    looking = not looking
                S.look_held = down_now
            else:
                if look.WIN and S.mouse is None:
                    S.mouse = look.RawMouse(logger)
                if S.mouse and S.mouse.ok:
                    _, _, events = S.mouse.take()
                    down = look.BUTTONS.get(btn, look.BUTTONS["m3"])[0]
                    for kind, flag in events:
                        if flag != down:
                            continue
                        if kind == "down" and game_in_front():
                            looking = True if hold else not looking
                        elif kind == "up" and hold:
                            looking = False
                elif WIN:
                    import ctypes
                    st = ctypes.windll.user32.GetAsyncKeyState(gs.LOOK_BTN.get(btn, gs.LOOK_BTN["m3"])[1])
                    if hold:
                        looking = bool(st & 0x8000)
                    elif st & 1 and game_in_front():
                        looking = not looking
            if looking != S.looking:
                S.looking = looking
                if not looking and S.gui in (1, 2, 3, 4) and in_cockpit():
                    # v0.24.0: looking at a side panel in free look puts the game's focus on it; free look over, the
                    # head goes back ahead and the game says so a moment later. Until then the HUD showed that panel's
                    # windows (This fight came up ahead and went again, CMDR Hongark's video): ahead is taken at once,
                    # as with a panel key, and Status.json still has the last word
                    S.guess = (0, time.perf_counter() + 1.0)   # (given 2 s: the head comes back slowly)
                    h.set_focus(0)
                h.hide() if looking else draw_safe()
    except Exception as e:
        if str(e) != S.last_error:
            S.last_error = str(e)
            logger.exception(f"GRAVITAS free look: {e}")
    if S.root is not None:
        S.look_id = S.root.after(LOOK_MS, look_loop)


def front_loop():
    """Another program came in front: the HUD hides at once; back to the game: it shows at once (v0.17.0: this was
    the cockpit tracking's loop, which is gone)."""
    h = S.hud
    try:
        if h is not None and h.check_front():
            draw_safe()
    except Exception as e:
        if str(e) != S.last_error:
            S.last_error = str(e)
            logger.exception(f"GRAVITAS HUD: {e}")
    if S.root is not None:
        S.front_id = S.root.after(FRONT_MS, front_loop)


def anchor_of(key, w, place):
    """Which game panel a window holds on to: the one it sits by (planes.py), both for the windows in the middle at
    the top; a window placed by hand, the panel on its side. None for a side panel's windows."""
    if place:
        if place[0] == "top":
            return "center"
        return {"comms": "comms", "info": "info"}.get(place[1])
    if PANEL_OF.get(w["when"]) is not None:
        return None
    return "comms" if w["x"] < 40 else "info" if w["x"] > 60 else "center"


def home(key, w, i=0):
    """A window's default place, as a panel of the game (planes.py): flat at the top in the middle, on the plane under
    the comms panel or the INFO panel ahead, or beside the side panel it is tied to."""
    if key in planes.TOP:
        return ("top", planes.TOP[key])
    if w["when"] == "ext":
        return ("plane", "left")
    if w["when"] == "int":
        return ("plane", "right")
    if w["when"] == "main_l":                    # v0.21.0: the main panel's left, right or top, as chosen
        return ("plane", "comms")
    if w["when"] == "main_r":
        return ("plane", "info")
    if w["when"] == "main_t" or key == "shortcuts":   # (the Keys card: in the middle at the top)
        return ("mid", "top")
    if w["when"] == "role_l":                    # v0.25.0: the role panel's left or top, the right panel's top
        return ("area", "role_a")
    if w["when"] == "role_t":
        return ("area", "role_b")
    if w["when"] == "int_t":
        return ("area", "right_t")
    if w["when"] in ("comms", "role"):           # v0.19.0: in the free room beside that panel, A, B, A...
        return ("area", f"{w['when']}_{'ab'[i % 2]}")
    p = planes.HOME.get(key, "comms")
    if p in ("left", "right"):                   # tied to no panel: ahead, on its side
        p = "comms" if p == "left" else "info"
    return ("plane", p)


def gone_of(e, s):
    """The ships to leave out of Targets by value: those whose lock was lost (if that setting is on), and every ship
    there when the list was cleared."""
    g = e.gone() if e and e.ok else {}
    return g if s.drop_lost else {"cleared": g.get("cleared", 0)}


def fight_step():
    """A fight's end, whatever is on the screen (v0.36.0): its report readied, the Bounty counter back to 0, the fight
    kept in Past combats. Up to v0.35 this was done only while the HUD was drawn in the cockpit: a fight that ended in
    the main menu, with EDMC closed before the next flight, was never kept (CMDR Hongark: two of four fights lost).
    The fight as the engine sees it now is given back."""
    s, e = S.settings, S.engine
    v = e.view() if e and e.ok and s.combat_on else None
    if v and v.get("on") and not v.get("soft"):  # v0.26.0: a fight with shooting: its report goes, if it was up
        S.had_fire, S.report_until = True, 0.0
    elif S.had_fire and v and not v.get("on"):   # ... and it has just ended (seen live, this session): its report
        S.had_fire = False
        S.last_view, S.report_until, S.report_auto = v, time.time() + s.report_s, True
        if S.counter:
            S.counter.reset()                    # the Bounty counter starts again with the next fight
    t0 = v and not v.get("on") and (v.get("ep") or {}).get("t0")
    if t0 and t0 not in S.saved:
        S.saved.add(t0)                          # once: a report deleted in Past combats does not come back
        S.history.add(v)                         # a fight just ended with a report: kept in Past combats
        if S.past and S.past.alive():
            S.past.fill()
    return v


def make_hud():
    """The HUD's window belongs to EDMC's main window, not to the plugin's area in it: EDMC styles every widget in
    that area and a separate window there stops it (v0.1.1). It is made on the first tick, after EDMC has started."""
    if S.hud is None and S.root is not None and not S.hud_failed:
        try:
            S.hud = Hud(S.root.winfo_toplevel(), logger)
            S.hud.gui = S.gui
        except Exception as e:
            S.hud_failed = True
            logger.error(f"GRAVITAS HUD could not start: {e}")
    return S.hud


def draw():
    make_hud()
    s, h, e = S.settings, S.hud, S.engine
    now = combat.now_ms()
    preview = S.preview
    if e and e.ok:
        e.tick()
        e.calm(CALM_MS)
    v = fight_step()                             # (v0.36.0: before the HUD's own checks: in the menu too)
    if not h:
        return
    if not (preview or (S.shown and time.time() < S.shown[1]) or in_cockpit()):
        S.need_boot = True                       # (the next time the HUD shows, it boots up)
        S.keys_shown = False
        h.hide()
        return
    if not S.keys_shown:                         # v0.21.0: the Keys card, 10 s each time the HUD comes on in the cockpit
        S.keys_shown, S.keys_until = True, time.time() + combat.KEYS_S
    live_hot = bool(v and v.get("on") and not v.get("soft"))
    shown = S.shown and time.time() < S.shown[1]
    if preview:
        v = combat.sample(now)
    elif shown and not (v and v.get("on")):     # a past report, asked for from the Past combats window
        v = S.shown[0]
    if live_hot and not S.hot:                   # Hostiles near (or nothing) turned into a fight: say so, loud
        S.banner_until = time.time() + combat.BANNER_S
    S.hot = live_hot
    hot = live_hot and not preview and not shown
    # (v0.35.0: Ctrl+Shift+F12 "off" is gone: it did what F11 does, CMDR Hongark's tester; the windows keep their own
    # colour in a fight too: red was hard to read on the game's red alerts)
    if S.key_off or S.key_hidden:                # Ctrl+Shift+F11 (the fight is still followed, the report still kept)
        h.hide()
        return
    # Preview behaves as the game will: hidden in free look and in the maps, panel windows only with their panel
    in_map = S.gui in combat.MAPS or S.map_music or bool(S.guess and S.guess[0] in combat.MAPS)    # (v0.28.0: its music or key too)
    if ((S.looking and s.look == "hide") or (s.hide_maps and in_map)) and not shown:
        h.hide()
        return
    scan = e.scan() if e and e.ok and s.combat_on and not preview else {}
    pbanner = preview and time.time() - S.preview_t0 < combat.BANNER_S
    opts = {"sort": s.sort, "order": s.order, "report_s": s.report_s, "banner": pbanner or time.time() < S.banner_until,
            "scan": scan.get("pri"), "tg": scan.get("tg"), "always": s.always and not preview and not shown,
            "gone": gone_of(e, s) if not preview else {},
            "bounty": combat.SAMPLE_BOUNTY if preview else dict(S.counter.view(s.bonds), claim=S.claims.view() if S.claims else None) if S.counter else None,
            "rows": s.rows, "keys_on": preview or time.time() < S.keys_until,
            "keys_left": max(0, math.ceil(S.keys_until - time.time())) if not preview else combat.KEYS_S,
            "report_on": preview or bool(shown) or time.time() < S.report_until,
            "report_left": (combat.REPORT_DEMO_S if preview else max(0, math.ceil((S.shown[1] if shown else S.report_until) - time.time())))}
    # (asked for with Ctrl+Shift+F8, or from Past combats: shown even if its window is off)
    asked = bool(shown) or (time.time() < S.report_until and not S.report_auto)
    panel = {w: g for w, _, g in combat.WHEN}
    items = []
    tied_n = {}                                  # how many windows are tied to the comms and role panels so far
    for key, *_ in combat.WINDOWS:
        w = s.win[key]
        m = None
        tied = panel.get(w["when"]) is not None
        # every window is made ready, whichever panel is open: the HUD shows a side panel's windows while that panel is
        # open, the windows ahead while none is (hud.seen_in), and moves them with the head's turn (v0.10.0)
        group = "all" if shown else panel.get(w["when"]) if tied else "front"
        if w["on"] or (key == "report" and asked):
            o = dict(opts, report_s=10 ** 9) if tied and not preview else opts   # a panel window shows the last report too
            if preview and key == "report" and pbanner:
                continue
            vv = v
            if key == "report" and not preview and not shown and S.last_view:
                vv = S.last_view                 # (the fight as it ended)
            m = combat.model(key, combat.sample_report(now) if preview and key == "report" else vv, now, o)
            if not m and opts["always"]:
                m = combat.placeholder(key)       # the HUD stays up: the window's frame, waiting
        if m:
            # on the game's panels, shifted as moved by hand with the arrows (v0.17.0: its shape kept)
            i = tied_n.get(w["when"], 0)
            tied_n[w["when"]] = i + 1
            place = home(key, w, i) + (w["dx"], w["dy"]) if s.auto else None
            items.append((key, m, w["x"], w["y"], w["colour"], w["shape"],
                          place, group, anchor_of(key, w, place)))
    if not items:
        S.need_boot = True
        h.hide()
        return
    if h.place(force_show=preview or shown, only_front=s.front):
        h.turn_text = s.turn_text
        h.theme = s.theme
        h.bg = s.bg
        h.set_alpha(s.opacity / 100)
        h.boot_on = s.boot                       # v0.35.0: the hologram boot can be turned off (HUD tab)
        if h.H:
            s.screen_h = h.H                     # (Auto size: from the game window's height)
        h.render(items, s.scale)
        if S.need_boot:                          # v0.18.0: back in the cockpit, or Preview on: a hologram boot
            S.need_boot = False
            if s.boot:
                h.boot_up()
