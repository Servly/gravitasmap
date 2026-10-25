"""The plugin's settings, kept by EDMC (its own config), and the settings tab in EDMC (File > Settings > GRAVITAS).

Each overlay window: on or off, where (x, y on the overlay's screen), and its colour. Moving is done here with the
arrow buttons or the numbers, never with the mouse in the game. Preview shows every window for 20 seconds.
"""
import tkinter as tk

from config import config  # EDMC's own settings store
import myNotebook as nb    # EDMC's themed widgets

from .modes import combat

GAME_ORANGE = "#ff7100"    # close to the game's default HUD orange
STEP = 10
PREFIX = "gravitas_"


def _k(*parts):
    return PREFIX + "_".join(parts)


def get_bool(key, default):
    try:
        return bool(config.get_int(key, default=1 if default else 0))
    except Exception:
        return default


def get_int(key, default):
    try:
        return int(config.get_int(key, default=default))
    except Exception:
        return default


def get_str(key, default):
    try:
        v = config.get_str(key, default=default)
        return v if v else default
    except Exception:
        return default


class Settings:
    """What the overlay reads every second."""

    def __init__(self):
        self.load()

    def load(self):
        self.combat_on = get_bool(_k("combat", "on"), True)
        self.size = get_str(_k("size"), "normal")
        self.bg = get_bool(_k("bg"), False)
        self.win = {}
        for key, _, x, y in combat.WINDOWS:
            self.win[key] = {"on": get_bool(_k("win", key, "on"), True), "x": get_int(_k("win", key, "x"), x),
                             "y": get_int(_k("win", key, "y"), y), "colour": get_str(_k("win", key, "colour"), GAME_ORANGE)}


class Prefs:
    """The tab in EDMC's settings. Changes are kept when EDMC's settings window is closed with OK."""

    def __init__(self, parent, settings, on_preview, status_text):
        self.s = settings
        self.vars = {}
        f = self.frame = nb.Frame(parent)
        r = 0
        nb.Label(f, text="GRAVITAS for EDMC: Combat Mode on top of the game. On this computer only.").grid(row=r, column=0, columnspan=8, sticky=tk.W, padx=10, pady=(10, 2)); r += 1
        nb.Label(f, text=status_text).grid(row=r, column=0, columnspan=8, sticky=tk.W, padx=10, pady=(0, 8)); r += 1
        self.vars["combat_on"] = tk.IntVar(value=1 if settings.combat_on else 0)
        nb.Checkbutton(f, text="Combat Mode", variable=self.vars["combat_on"]).grid(row=r, column=0, columnspan=3, sticky=tk.W, padx=10); r += 1
        self.vars["bg"] = tk.IntVar(value=1 if settings.bg else 0)
        nb.Checkbutton(f, text="Dark box behind each window (easier to read on bright planets)", variable=self.vars["bg"]).grid(row=r, column=0, columnspan=8, sticky=tk.W, padx=10); r += 1
        self.vars["size"] = tk.StringVar(value=settings.size)
        sz = nb.Frame(f); sz.grid(row=r, column=0, columnspan=8, sticky=tk.W, padx=10); r += 1
        nb.Label(sz, text="Text size").pack(side=tk.LEFT, padx=(0, 8))
        nb.Radiobutton(sz, text="Normal", value="normal", variable=self.vars["size"]).pack(side=tk.LEFT)
        nb.Radiobutton(sz, text="Large", value="large", variable=self.vars["size"]).pack(side=tk.LEFT, padx=(8, 0))
        nb.Label(f, text="Windows (move them with the arrows while Preview shows them in the game)").grid(row=r, column=0, columnspan=8, sticky=tk.W, padx=10, pady=(10, 2)); r += 1
        for key, name, _, _ in combat.WINDOWS:
            w = settings.win[key]
            on, x, y, col = tk.IntVar(value=1 if w["on"] else 0), tk.IntVar(value=w["x"]), tk.IntVar(value=w["y"]), tk.StringVar(value=w["colour"])
            self.vars[key] = (on, x, y, col)
            rf = nb.Frame(f); rf.grid(row=r, column=0, columnspan=8, sticky=tk.W, padx=(20, 4), pady=1); r += 1   # one row: the window, arrows, x y, colour
            nb.Checkbutton(rf, text=name, variable=on, width=40).pack(side=tk.LEFT)
            for lab, var, d in (("◀", x, -STEP), ("▲", y, -STEP), ("▼", y, STEP), ("▶", x, STEP)):
                nb.Button(rf, text=lab, width=2, command=lambda v=var, d=d: (v.set(max(0, v.get() + d)), self.apply())).pack(side=tk.LEFT, padx=1)
            nb.Label(rf, text="x").pack(side=tk.LEFT, padx=(8, 2)); nb.Entry(rf, textvariable=x, width=5).pack(side=tk.LEFT)
            nb.Label(rf, text="y").pack(side=tk.LEFT, padx=(8, 2)); nb.Entry(rf, textvariable=y, width=5).pack(side=tk.LEFT)
            nb.Entry(rf, textvariable=col, width=9).pack(side=tk.LEFT, padx=(10, 2))
            nb.Button(rf, text="Colour", command=lambda v=col: self.pick(v)).pack(side=tk.LEFT)
        bf = nb.Frame(f); bf.grid(row=r, column=0, columnspan=8, sticky=tk.W, padx=10, pady=10); r += 1
        nb.Button(bf, text="Preview in the game for 20 s", command=lambda: (self.apply(), on_preview())).pack(side=tk.LEFT)
        nb.Button(bf, text="Game colours", command=self.reset_colours).pack(side=tk.LEFT, padx=8)
        nb.Label(f, text="Positions are on the overlay's own screen; the overlay fits it to the game window.").grid(row=r, column=0, columnspan=8, sticky=tk.W, padx=10)

    def pick(self, var):
        try:
            from tkinter import colorchooser
            c = colorchooser.askcolor(color=var.get(), parent=self.frame)[1]
            if c:
                var.set(c); self.apply()
        except Exception:
            pass

    def reset_colours(self):
        for key, *_ in combat.WINDOWS:
            self.vars[key][3].set(GAME_ORANGE)
        self.apply()

    def apply(self):
        """Into the live settings at once (so Preview shows it), and into EDMC's config."""
        s = self.s
        s.combat_on = bool(self.vars["combat_on"].get()); config.set(_k("combat", "on"), int(s.combat_on))
        s.bg = bool(self.vars["bg"].get()); config.set(_k("bg"), int(s.bg))
        s.size = self.vars["size"].get() or "normal"; config.set(_k("size"), s.size)
        for key, *_ in combat.WINDOWS:
            on, x, y, col = self.vars[key]
            try:
                xv, yv = max(0, int(x.get())), max(0, int(y.get()))
            except (tk.TclError, ValueError):
                xv, yv = s.win[key]["x"], s.win[key]["y"]
            c = col.get().strip()
            if not (len(c) == 7 and c.startswith("#")):
                c = GAME_ORANGE
            s.win[key] = {"on": bool(on.get()), "x": xv, "y": yv, "colour": c}
            config.set(_k("win", key, "on"), int(bool(on.get()))); config.set(_k("win", key, "x"), xv)
            config.set(_k("win", key, "y"), yv); config.set(_k("win", key, "colour"), c)
