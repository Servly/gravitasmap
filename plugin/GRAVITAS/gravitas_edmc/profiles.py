"""Profiles (v0.19.0, CMDR Hongark): the windows set up for each ship, kept under a name of your choosing.

Name a profile after a ship, by its type ("Python Mk II") or by the name you gave it ("Miata Mk II"), and save: which
windows show, when, where and in what colour are kept under that name. GRAVITAS switches to it by itself when you
board that ship (the Journal's Loadout says which ship it is). Kept by EDMC, in its own settings, as one line of JSON.
"""
import json

from config import config

KEY = "gravitas_profiles"
ACTIVE = "gravitas_profile"
FIELDS = ("on", "when", "x", "y", "dx", "dy", "colour")


def all_():
    try:
        got = json.loads(config.get_str(KEY, default="") or "{}")
        return got if isinstance(got, dict) else {}
    except Exception:
        return {}


def names():
    return sorted(all_(), key=str.lower)


def active():
    try:
        return config.get_str(ACTIVE, default="") or ""
    except Exception:
        return ""


def _keep(profiles):
    config.set(KEY, json.dumps(profiles, separators=(",", ":")))


def save(name, settings):
    """The windows as they are now, kept under name (made or written over); it becomes the active profile."""
    name = name.strip()[:40]
    if not name:
        return None
    p = all_()
    p[name] = {"auto": settings.auto, "win": {k: {f: w[f] for f in FIELDS} for k, w in settings.win.items()}}
    _keep(p)
    config.set(ACTIVE, name)
    return name


def delete(name):
    p = all_()
    if p.pop(name, None) is not None:
        _keep(p)
    if active() == name:
        config.set(ACTIVE, "")


def load(name, settings, store):
    """The profile's windows into the live settings (and EDMC's config through store(key, window)). True if found."""
    prof = all_().get(name)
    if not prof:
        return False
    settings.auto = bool(prof.get("auto", settings.auto))
    for key, saved in (prof.get("win") or {}).items():
        w = settings.win.get(key)
        if w is None:
            continue
        for f in FIELDS:
            if f in saved:
                w[f] = saved[f]
        store(key, w)
    config.set(ACTIVE, name)
    return True


def for_ship(*labels):
    """The profile named after this ship (its type or its own name, letter case aside), or None."""
    want = {str(x).strip().lower() for x in labels if x}
    return next((n for n in names() if n.lower() in want), None)
