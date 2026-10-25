"""GRAVITAS for EDMC: Combat Mode on top of the game.

https://gravitasmap.com · MIT licence · by CMDR Hongark and Claude (Anthropic)

The fight is worked out by the same Combat Mode code as the GRAVITAS site, run here in QuickJS. EDMC gives the
Journal lines and Status.json; the result is drawn by GRAVITAS's own overlay (gravitas_edmc/hud.py): a see-through
window over the game that lets every click through. Nothing else to install.
Everything stays on this computer: this plugin opens no network connection.

Folders: gravitas_edmc/ (the plugin), gravitas_edmc/modes/ (one file per mode: Combat now; Thargoid and Route later),
engine/ (the site's combat engine), lib/ (QuickJS for 32 and 64-bit Windows and Linux).
"""
import logging
from datetime import datetime, timezone
import os
import sys
import time
import tkinter as tk

from config import appname

PLUGIN_NAME = "GRAVITAS"
VERSION = "0.1.1"
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

logger = logging.getLogger(f"{appname}.{os.path.basename(HERE)}")

from gravitas_edmc.engine import Engine          # noqa: E402
from gravitas_edmc.hud import Hud, game_rect    # noqa: E402
from gravitas_edmc.modes import combat           # noqa: E402
from gravitas_edmc import settings as gs         # noqa: E402

FRESH_S = 60            # a Journal line older than this sets the scene but starts nothing (EDMC catching up)


class State:
    engine = None
    hud = None
    prefs = None
    settings = None
    label = None
    preview_until = 0
    after_id = None
    root = None
    rev = -1


S = State()


def plugin_start3(plugin_dir):
    S.settings = gs.Settings()
    S.engine = Engine(HERE, logger)
    return PLUGIN_NAME


def plugin_stop():
    try:
        if S.root is not None and S.after_id:
            S.root.after_cancel(S.after_id)
    except Exception:
        pass
    if S.hud:
        S.hud.destroy()
    if S.engine:
        S.engine.stop()


def status_text():
    e = S.engine
    a = f"engine ready ({e.version})" if e and e.ok else f"engine not running: {e.error if e else 'not started'}"
    g = game_rect()
    b = "HUD on the game" if g else "HUD waiting for the game window"
    return f"GRAVITAS v{VERSION}: {a} · {b}"


def plugin_app(parent):
    """A short line in EDMC's main window, and the once-a-second loop (on EDMC's own thread)."""
    S.root = parent
    try:
        S.hud = Hud(parent, logger)
    except Exception as e:
        logger.error(f"GRAVITAS HUD could not start: {e}")
    S.label = tk.Label(parent, text=status_text(), anchor=tk.W, justify=tk.LEFT)
    S.after_id = parent.after(1000, loop)
    return S.label


def plugin_prefs(parent, cmdr, is_beta):
    def preview():
        S.preview_until = time.time() + 20
    S.prefs = gs.Prefs(parent, S.settings, preview, status_text())
    return S.prefs.frame


def prefs_changed(cmdr, is_beta):
    try:
        S.prefs.apply()
    except Exception as e:
        logger.warning(f"GRAVITAS settings: {e}")


def journal_entry(cmdr, is_beta, system, station, entry, state):
    if not S.engine or not S.engine.ok:
        return
    if system:
        S.engine.here(system)
    age = 0
    try:
        t = datetime.strptime(entry.get("timestamp", ""), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        age = time.time() - t.timestamp()
    except Exception:
        pass
    S.engine.feed(entry, age > FRESH_S)


def dashboard_entry(cmdr, is_beta, entry):
    if S.engine and S.engine.ok and entry:
        S.engine.status(entry)


def loop():
    """Once a second: the engine's clock (a calm ends a fight), then the overlay."""
    try:
        draw()
    except Exception as e:
        logger.warning(f"GRAVITAS: {e}")
    if S.label is not None:
        t = status_text()
        if S.label.cget("text") != t:
            S.label.configure(text=t)
    if S.root is not None:
        S.after_id = S.root.after(1000, loop)


def draw():
    s, h, e = S.settings, S.hud, S.engine
    now = combat.now_ms()
    preview = time.time() < S.preview_until
    if e and e.ok:
        e.tick()
    if not h:
        return
    v = combat.sample(now) if preview else (e.view() if e and e.ok and s.combat_on else None)
    items = []
    for key, *_ in combat.WINDOWS:
        w = s.win[key]
        m = combat.model(key, v, now) if w["on"] else None
        if m:
            items.append((key, m, w["x"], w["y"], w["colour"]))
    if not items:
        h.hide()
        return
    if h.place(force_show=preview, only_front=s.front):
        h.render(items, s.scale)
