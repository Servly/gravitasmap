"""The plugin's settings, kept by EDMC (its own config), and the settings tab in EDMC (File > Settings > GRAVITAS).

Each HUD window: on or off, where (x and y as a percent of the game window, so it stays in place at any resolution),
and its colour. Moving is done here with the arrow buttons or the numbers, never with the mouse in the game.
Preview shows every window in the game for 20 seconds while you place them.
"""
import tkinter as tk

from config import config  # EDMC's own settings store
import myNotebook as nb    # EDMC's themed widgets

from .modes import combat

GAME_ORANGE = "#ff7100"    # close to the game's default HUD orange
STEP = 1.0                 # one click of an arrow: 1 % of the game window
PREFIX = "gravitas_"
SIZES = {"small": 0.85, "normal": 1.0, "large": 1.2}


def _k(*parts):
    return PREFIX + "_".join(parts)


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
    """What the HUD reads every second."""

    def __init__(self):
        self.load()

    def load(self):
        self.combat_on = bool(get_int(_k("combat", "on"), 1))
        self.front = bool(get_int(_k("front"), 1))
        self.size = get_str(_k("size2"), "normal")
        self.win = {}
        for key, _, x, y in combat.WINDOWS:   # positions kept in tenths of a percent (EDMC keeps whole numbers)
            self.win[key] = {"on": bool(get_int(_k("win", key, "on"), 1)), "x": get_int(_k("win", key, "xp"), round(x * 10)) / 10,
                             "y": get_int(_k("win", key, "yp"), round(y * 10)) / 10, "colour": get_str(_k("win", key, "colour"), GAME_ORANGE)}

    @property
    def scale(self):
        return SIZES.get(self.size, 1.0)


class Prefs:
    """The tab in EDMC's settings. Every change shows at once in Preview, and is kept."""

    def __init__(self, parent, settings, on_preview, status_text):
        self.s = settings
        self.vars = {}
        f = self.frame = nb.Frame(parent)
        nb.Label(f, text="GRAVITAS for EDMC: Combat Mode on top of the game. On this computer only, nothing else to install.").grid(row=0, column=0, sticky=tk.W, padx=10, pady=(10, 2))
        nb.Label(f, text=status_text).grid(row=1, column=0, sticky=tk.W, padx=10, pady=(0, 8))
        r = 2
        self.vars["combat_on"] = tk.IntVar(value=int(settings.combat_on))
        nb.Checkbutton(f, text="Combat Mode", variable=self.vars["combat_on"], command=self.apply).grid(row=r, column=0, sticky=tk.W, padx=10); r += 1
        self.vars["front"] = tk.IntVar(value=int(settings.front))
        nb.Checkbutton(f, text="Show only while the game is in front", variable=self.vars["front"], command=self.apply).grid(row=r, column=0, sticky=tk.W, padx=10); r += 1
        self.vars["size"] = tk.StringVar(value=settings.size)
        sz = nb.Frame(f); sz.grid(row=r, column=0, sticky=tk.W, padx=10, pady=(4, 0)); r += 1
        nb.Label(sz, text="Size").pack(side=tk.LEFT, padx=(0, 8))
        for v, lab in (("small", "Small"), ("normal", "Normal"), ("large", "Large")):
            nb.Radiobutton(sz, text=lab, value=v, variable=self.vars["size"], command=self.apply).pack(side=tk.LEFT, padx=(0, 8))
        nb.Label(f, text="Windows: x and y are % of the game window. Press Preview, then move them with the arrows.").grid(row=r, column=0, sticky=tk.W, padx=10, pady=(10, 2)); r += 1
        for key, name, _, _ in combat.WINDOWS:
            w = settings.win[key]
            on, x, y, col = tk.IntVar(value=int(w["on"])), tk.DoubleVar(value=w["x"]), tk.DoubleVar(value=w["y"]), tk.StringVar(value=w["colour"])
            self.vars[key] = (on, x, y, col)
            rf = nb.Frame(f); rf.grid(row=r, column=0, sticky=tk.W, padx=(20, 4), pady=1); r += 1   # one row: the window, arrows, x y, colour
            nb.Checkbutton(rf, text=name, variable=on, width=40, command=self.apply).pack(side=tk.LEFT)
            for lab, var, d in (("◀", x, -STEP), ("▲", y, -STEP), ("▼", y, STEP), ("▶", x, STEP)):
                nb.Button(rf, text=lab, width=2, command=lambda v=var, d=d: self.nudge(v, d)).pack(side=tk.LEFT, padx=1)
            for lab, var in (("x", x), ("y", y)):
                nb.Label(rf, text=lab).pack(side=tk.LEFT, padx=(8, 2))
                e = nb.Entry(rf, textvariable=var, width=5); e.pack(side=tk.LEFT)
                e.bind("<Return>", lambda ev: self.apply()); e.bind("<FocusOut>", lambda ev: self.apply())
            e = nb.Entry(rf, textvariable=col, width=9); e.pack(side=tk.LEFT, padx=(10, 2))
            e.bind("<Return>", lambda ev: self.apply()); e.bind("<FocusOut>", lambda ev: self.apply())
            nb.Button(rf, text="Colour", command=lambda v=col: self.pick(v)).pack(side=tk.LEFT)
        bf = nb.Frame(f); bf.grid(row=r, column=0, sticky=tk.W, padx=10, pady=10); r += 1
        nb.Button(bf, text="Preview in the game for 20 s", command=lambda: (self.apply(), on_preview())).pack(side=tk.LEFT)
        nb.Button(bf, text="Game colours", command=self.reset_colours).pack(side=tk.LEFT, padx=8)
        nb.Button(bf, text="Default places", command=self.reset_places).pack(side=tk.LEFT)

    def nudge(self, var, d):
        try:
            var.set(round(max(0.0, min(98.0, float(var.get()) + d)), 1))
        except (tk.TclError, ValueError):
            pass
        self.apply()

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

    def reset_places(self):
        for key, _, x, y in combat.WINDOWS:
            self.vars[key][1].set(x); self.vars[key][2].set(y)
        self.apply()

    def apply(self):
        """Into the live settings at once (so Preview shows it), and into EDMC's config."""
        s = self.s
        s.combat_on = bool(self.vars["combat_on"].get()); config.set(_k("combat", "on"), int(s.combat_on))
        s.front = bool(self.vars["front"].get()); config.set(_k("front"), int(s.front))
        s.size = self.vars["size"].get() if self.vars["size"].get() in SIZES else "normal"; config.set(_k("size2"), s.size)
        for key, *_ in combat.WINDOWS:
            on, x, y, col = self.vars[key]
            try:
                xv, yv = max(0.0, min(98.0, float(x.get()))), max(0.0, min(98.0, float(y.get())))
            except (tk.TclError, ValueError):
                xv, yv = s.win[key]["x"], s.win[key]["y"]
            c = col.get().strip().lower()
            if not (len(c) == 7 and c.startswith("#") and all(ch in "0123456789abcdef" for ch in c[1:])):
                c = GAME_ORANGE
            s.win[key] = {"on": bool(on.get()), "x": xv, "y": yv, "colour": c}
            config.set(_k("win", key, "on"), int(bool(on.get()))); config.set(_k("win", key, "xp"), round(xv * 10))
            config.set(_k("win", key, "yp"), round(yv * 10)); config.set(_k("win", key, "colour"), c)
