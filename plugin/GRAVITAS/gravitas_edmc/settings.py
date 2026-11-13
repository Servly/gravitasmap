"""The plugin's settings, kept by EDMC (its own config), and the settings tab in EDMC (File > Settings > GRAVITAS).

v0.17.0: the tab in four tabs of its own (HUD, Targets, Windows, Keys), the cockpit tracking gone with its settings.
Each HUD window: on or off, when it shows, where, and its colour. On the game's panels (the default), the arrows shift
a window and keep its shape; off them, the arrows move it flat (x and y as a percent of the game window, so it stays
in place at any resolution). Never with the mouse in the game. Preview shows every window in the game while you place
them.
"""
import tkinter as tk
from tkinter import ttk

from config import config  # EDMC's own settings store
import myNotebook as nb    # EDMC's themed widgets

from .modes import combat
from . import profiles
from .shiporder import OrderBox

SNAPS = [("left", "To the left edge"), ("centre", "To the middle"), ("right", "To the right edge"),
         ("top", "To the top"), ("bottom", "To the bottom")]          # v0.35.0: one click instead of many arrows
DX_MAX, DY_MAX = 150.0, 100.0   # how far a window may be shifted (in heights: from one side of a wide screen to the other)

GAME_ORANGE = "#ff7100"    # close to the game's default HUD orange
STEP = 0.5                 # one click of an arrow: half a percent of the game window
PREFIX = "gravitas_"
WHEN_LABEL = {w: lab for w, lab, _ in combat.WHEN}
LOOK = {"off": "Off", "hide": "Hide the HUD while I look around"}
THEMES = {"game": "The game's own look", "cards": "GRAVITAS cards"}
LOOK_HOW = {"hold": "while the button is held", "toggle": "from one press to the next"}
LOOK_BTN = {"m3": ("Mouse 3 (middle)", 0x04), "m4": ("Mouse 4", 0x05), "m5": ("Mouse 5", 0x06)}
SIZES = {"small": 0.85, "normal": 1.0, "large": 1.2}
SIZE_LO, SIZE_HI = 50, 200   # v0.21.0: the size as a percent of your own choosing


def auto_pct(h):
    """v0.35.0: Auto size, from the game window's height. Every window already grows with the screen's height (the same
    share of it at any resolution); on a smaller screen the game's own HUD leaves less room around its panels, so the
    windows are made a little smaller there (a player at 1080p had Targets by value over the weapons list)."""
    h = int(h or 1080)
    return 100 if h >= 1300 else 90 if h >= 1000 else 80     # (1300: 1440p in a window, its title bar off, stays 100)
SHORT = {"status": "Status", "alert": "Interdiction", "target": "Target", "targets": "Targets by value",
         "feed": "Kill feed", "fight": "This fight", "speed": "Takedown speed", "bounty": "Bounty counter",
         "report": "Combat report", "banner": "COMBAT banner", "shortcuts": "Keys (10 s)"}
PAD = 12


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


def parse_order(s):
    """Your ship order, "Fer-de-Lance, Corsair, Python Mk II": the names as the game shows them, at most 12."""
    return [x.strip() for x in str(s or "").split(",") if x.strip()][:12]


class Settings:
    """What the HUD reads every second."""

    def __init__(self):
        self.load()

    def load(self):
        self.combat_on = bool(get_int(_k("combat", "on"), 1))
        self.front = bool(get_int(_k("front"), 1))
        self.size = get_str(_k("size2"), "auto")       # v0.35.0: Auto (from the screen) for a new CMDR
        self.screen_h = 1080                           # the game window's height, as last drawn (for Auto)
        self.size_pct = max(SIZE_LO, min(SIZE_HI, get_int(_k("size", "pct"), round(SIZES.get(self.size, 1.0) * 100))))
        self.rows = max(1, min(20, get_int(_k("targets", "n"), 6)))   # v0.21.0: how many in Targets by value
        self.sort = "s" if get_str(_k("sort"), "v") == "s" else "v"
        self.order = parse_order(get_str(_k("order"), ", ".join(combat.DEFAULT_ORDER)))
        self.report_s = max(5, min(600, get_int(_k("report", "s"), 10)))
        if not get_int(_k("v0260"), 0):     # v0.26.0: the combat report stays 10 s (it was 60), once for everyone
            self.report_s = 10
            config.set(_k("report", "s"), 10); config.set(_k("v0260"), 1)
        self.red = False                                 # (v0.35.0: gone, see tab_hud)
        self.boot = bool(get_int(_k("boot"), 1))        # v0.35.0: the hologram boot as windows come into view
        if not get_int(_k("v0350"), 0):     # v0.35.0, once: Normal (never changed) becomes Auto
            if self.size == "normal" and self.size_pct == 100:
                self.size = "auto"
                config.set(_k("size2"), "auto")
            config.set(_k("v0350"), 1)
        self.hide_maps = bool(get_int(_k("hide", "maps"), 1))
        self.always = bool(get_int(_k("always"), 0))
        self.bonds = bool(get_int(_k("bonds"), 0))          # v0.16.0: the Bounty counter adds combat bonds too
        self.drop_lost = bool(get_int(_k("drop", "lost"), 1))   # v0.16.0: a ship whose lock is lost leaves Targets by value
        self.keys = bool(get_int(_k("keys"), 1))            # v0.16.0: Ctrl+Shift+F9 to F12
        old = get_str(_k("look"), "off")                 # v0.4.0 kept "hold" or "toggle" there: both meant "hide"
        self.look = get_str(_k("look2"), "hide" if old in LOOK_HOW else "off")
        self.look = self.look if self.look in LOOK else "off"
        self.bg = bool(get_int(_k("bg"), 0))            # v0.8.1: off (the look of v0.7.0 read better)
        self.auto = bool(get_int(_k("auto"), 1))        # the windows on the game's panels, in their perspective
        self.opacity = max(40, min(100, get_int(_k("opacity"), 92)))
        self.theme = "game"     # v0.22.0: the game's own look only (GRAVITAS cards did not look as good, nor as new)
        self.look_how = get_str(_k("look", "how"), old if old in LOOK_HOW else "hold")
        self.look_how = self.look_how if self.look_how in LOOK_HOW else "hold"
        self.turn_text = bool(get_int(_k("turn", "text"), 0))   # (a hand-tilted window's texts: kept, no longer in the tab)
        self.look_btn = get_str(_k("look", "btn"), "m3") if get_str(_k("look", "btn"), "m3") in LOOK_BTN else "m3"
        whens = {w for w, *_ in combat.WHEN}
        self.win = {}
        for key, _, x, y in combat.WINDOWS:   # places kept in tenths of a percent (EDMC keeps whole numbers)
            w = self.win[key] = {
                "on": bool(get_int(_k("win", key, "on"), 0 if key in combat.WINDOWS_OFF else 1)),
                "x": get_int(_k("win", key, "xp"), round(x * 10)) / 10,
                "y": get_int(_k("win", key, "yp"), round(y * 10)) / 10,
                "dx": get_int(_k("win", key, "dx"), 0) / 10,       # v0.17.0: shifted by hand on the game's panels
                "dy": get_int(_k("win", key, "dy"), 0) / 10,
                "colour": get_str(_k("win", key, "colour"), GAME_ORANGE)}
            when = get_str(_k("win", key, "when"), combat.DEFAULT_WHEN.get(key, "always"))
            w["when"] = when if when in whens else "always"
            # the shape given by hand up to v0.16 (angle in tenths of a degree), still drawn off the game's panels
            w["shape"] = (get_int(_k("win", key, "ang"), 0) / 10, get_int(_k("win", key, "per"), 0),
                          get_int(_k("win", key, "sx"), 100), get_int(_k("win", key, "sy"), 100))
        self.migrate()
        self.migrate3()
        self.migrate7()

    def migrate(self):
        """Once, for v0.8.0: fewer windows at first."""
        if get_int(_k("v080"), 0):
            return
        for key in combat.WINDOWS_OFF:
            self.win[key]["on"] = False
            config.set(_k("win", key, "on"), 0)
        config.set(_k("v080"), 1)

    def migrate3(self):
        """Once, for v0.9.0: every window in its place as a panel of the game (planes.py); This fight beside the left
        panel and Takedown speed beside the right panel, on."""
        if get_int(_k("v090"), 0):
            return
        self.auto = True
        config.set(_k("auto"), 1)
        for key, when in combat.DEFAULT_WHEN.items():
            self.win[key]["on"], self.win[key]["when"] = True, when
            config.set(_k("win", key, "on"), 1); config.set(_k("win", key, "when"), when)
        config.set(_k("v090"), 1)

    def migrate7(self):
        """Once, for v0.17.0: the windows back on the game's panels (up to 0.16 a window moved by hand fell flat and
        jumped; now the arrows shift it on its panel, its shape kept)."""
        if get_int(_k("v0170"), 0):
            return
        self.auto = True
        config.set(_k("auto"), 1)
        config.set(_k("v0170"), 1)

    def store(self, key, w):
        """One window as it is now into EDMC's config (a profile loaded, v0.19.0)."""
        for n, v in (("on", int(w["on"])), ("when", w["when"]), ("xp", round(w["x"] * 10)), ("yp", round(w["y"] * 10)),
                     ("dx", round(w["dx"] * 10)), ("dy", round(w["dy"] * 10)), ("colour", w["colour"])):
            config.set(_k("win", key, n), v)
        config.set(_k("auto"), int(self.auto))

    @property
    def scale(self):
        return auto_pct(self.screen_h) / 100 if self.size == "auto" else self.size_pct / 100


class Prefs:
    """The tab in EDMC's settings: four tabs. Every change shows at once in Preview, and is kept."""

    def __init__(self, parent, settings, on_preview, status_text, preview_on=False, headlook="", on_snap=None):
        self.headlook = headlook
        self.on_preview, self.on_snap, self.preview_on = on_preview, on_snap, preview_on
        self.s = settings
        self.vars = {}
        self.when = {}
        self.swatch = {}
        f = self.frame = nb.Frame(parent)
        f.columnconfigure(0, weight=1)
        head = nb.Frame(f)
        head.grid(row=0, column=0, sticky=tk.EW, padx=PAD, pady=(PAD, 6))
        head.columnconfigure(1, weight=1)
        nb.Label(head, text=status_text, font=("TkDefaultFont", 11, "bold")).grid(row=0, column=0, sticky=tk.W)
        nb.Label(head, text="Combat Mode on top of the game. On this computer only.").grid(row=1, column=0, sticky=tk.W)
        self.b_preview = nb.Button(head, command=lambda: self.preview(on_preview))
        self.b_preview.grid(row=0, column=2, rowspan=2, sticky=tk.E)
        self.show_preview(preview_on)
        tabs = ttk.Notebook(f)
        tabs.grid(row=1, column=0, sticky=tk.NSEW, padx=PAD, pady=(0, PAD))
        for name, build in (("HUD", self.tab_hud), ("Targets", self.tab_targets), ("Windows", self.tab_windows),
                            ("Keys", self.tab_keys)):
            page = nb.Frame(tabs)
            page.columnconfigure(0, weight=1)
            tabs.add(page, text=f"  {name}  ")
            build(page)

    # ---- the four tabs
    def check(self, parent, key, text, row, padx=PAD, pady=2):
        self.vars[key] = tk.IntVar(value=int(getattr(self.s, key)))
        nb.Checkbutton(parent, text=text, variable=self.vars[key], command=self.apply).grid(
            row=row, column=0, columnspan=4, sticky=tk.W, padx=padx, pady=pady)

    def section(self, parent, text, row):
        nb.Label(parent, text=text, font=("TkDefaultFont", 9, "bold")).grid(row=row, column=0, columnspan=4, sticky=tk.W,
                                                                             padx=PAD, pady=(PAD, 2))

    def number(self, parent, key, lo, hi, step, width=5):
        self.vars[key] = tk.StringVar(value=str(getattr(self.s, key)))
        sp = tk.Spinbox(parent, from_=lo, to=hi, increment=step, textvariable=self.vars[key], width=width,
                        command=self.apply)
        sp.bind("<Return>", lambda ev: self.apply())
        sp.bind("<FocusOut>", lambda ev: self.apply())
        return sp

    def tab_hud(self, p):
        s = self.s
        self.section(p, "Show", 0)
        self.check(p, "combat_on", "Combat Mode", 1)
        self.check(p, "front", "Only while the game is in front", 2)
        self.check(p, "always", "Keep the HUD up between fights (the last fight, or empty frames)", 3)
        self.check(p, "hide_maps", "Hide it in the maps, FSS, SAA and station services", 4)
        self.check(p, "boot", "Windows boot up as holograms as they come into view (off: they fade in)", 5)
        self.section(p, "Look", 6)
        row = nb.Frame(p)
        row.grid(row=7, column=0, sticky=tk.W, padx=PAD, pady=2)
        auto = s.size == "auto"
        self.vars["size"] = tk.StringVar(value="auto" if auto else s.size if round(SIZES.get(s.size, 0) * 100) == s.size_pct else "")
        nb.Label(row, text="Size", width=10).grid(row=0, column=0, sticky=tk.W)
        for i, (v, lab) in enumerate((("auto", "Auto"), ("small", "Small"), ("normal", "Normal"), ("large", "Large")), start=1):
            nb.Radiobutton(row, text=lab, value=v, variable=self.vars["size"], command=self.size_pick).grid(row=0, column=i, padx=(0, 10))
        self.number(row, "size_pct", SIZE_LO, SIZE_HI, 5).grid(row=0, column=5, padx=(6, 2))
        if auto:
            self.vars["size_pct"].set(str(auto_pct(s.screen_h)))
        nb.Label(row, text="%").grid(row=0, column=6)
        nb.Label(p, text=f"Auto: made for your screen ({s.screen_h} lines high: {auto_pct(s.screen_h)} %)").grid(
            row=8, column=0, sticky=tk.W, padx=PAD + 24)
        row = nb.Frame(p)
        row.grid(row=9, column=0, sticky=tk.W, padx=PAD, pady=2)
        nb.Label(row, text="Opacity %", width=10).grid(row=0, column=0, sticky=tk.W)
        self.number(row, "opacity", 40, 100, 5).grid(row=0, column=1, sticky=tk.W)
        self.check(p, "bg", "A dark ground behind each window (for bright places: stars, planets, stations)", 10, pady=(2, PAD))
        # (v0.35.0: "Windows turn red while the shooting goes on" is gone: red letters were hard to read, a player said;
        # every window keeps the colour chosen for it)

    def tab_targets(self, p):
        s = self.s
        self.section(p, "Targets by value", 0)
        self.vars["sort"] = tk.StringVar(value=s.sort)
        self.vars["order"] = tk.StringVar(value=", ".join(s.order))
        nb.Radiobutton(p, text="Most valuable first", value="v", variable=self.vars["sort"], command=self.apply).grid(
            row=1, column=0, sticky=tk.W, padx=PAD, pady=2)
        row = nb.Frame(p)
        row.grid(row=2, column=0, sticky=tk.W, padx=PAD, pady=2)
        nb.Radiobutton(row, text="My ship order first:", value="s", variable=self.vars["sort"], command=self.apply).grid(row=0, column=0, sticky=tk.NW)
        # v0.35.0: picked from a menu of the game's own ship names, not typed (shiporder.py)
        self.order_box = OrderBox(row, s.order, self.order_changed)
        self.order_box.grid(row=0, column=1, padx=(6, 0), sticky=tk.W)
        nb.Label(p, text="The first ship you add comes first. Clean ships always go to the end.").grid(row=3, column=0, sticky=tk.W, padx=PAD + 24)
        row = nb.Frame(p)
        row.grid(row=4, column=0, sticky=tk.W, padx=PAD, pady=2)
        nb.Label(row, text="Show").grid(row=0, column=0)
        self.number(row, "rows", 1, 20, 1, width=4).grid(row=0, column=1, padx=6)
        nb.Label(row, text="ships at most (the rest: \"+ more\")").grid(row=0, column=2)
        self.check(p, "drop_lost", "A ship leaves the list when its lock is lost (blown up, gone, or let go)", 5)
        self.section(p, "After a fight", 6)
        row = nb.Frame(p)
        row.grid(row=7, column=0, sticky=tk.W, padx=PAD, pady=2)
        nb.Label(row, text="The combat report stays").grid(row=0, column=0)
        self.number(row, "report_s", 5, 600, 5).grid(row=0, column=1, padx=6)
        nb.Label(row, text="seconds (every report is kept in Past combats)").grid(row=0, column=2)
        self.section(p, "Bounty counter", 8)
        self.check(p, "bonds", "Add combat bonds too", 9, pady=(2, PAD))

    def tab_windows(self, p):
        s = self.s
        # v0.19.0: profiles, one per ship
        pr = nb.Frame(p)
        pr.grid(row=0, column=0, sticky=tk.W, padx=PAD, pady=(PAD, 0))
        nb.Label(pr, text="Profile", font=("TkDefaultFont", 9, "bold")).grid(row=0, column=0, sticky=tk.W, padx=(0, 8))
        self.profile = tk.StringVar(value=profiles.active() or "")
        self.profile_menu = tk.OptionMenu(pr, self.profile, "")
        self.profile_menu.configure(width=18)
        self.profile_menu.grid(row=0, column=1, sticky=tk.W)
        nb.Button(pr, text="Delete", command=self.profile_delete).grid(row=0, column=2, padx=(6, 0))
        nb.Button(pr, text="Default", command=self.defaults).grid(row=0, column=3, padx=(6, 0))   # v0.23.0
        nb.Label(pr, text="Ship").grid(row=1, column=0, sticky=tk.W, pady=(6, 0))
        self.profile_name = tk.StringVar(value=profiles.active() or "")
        tk.Entry(pr, textvariable=self.profile_name, width=22).grid(row=1, column=1, sticky=tk.W, pady=(6, 0))
        nb.Button(pr, text="Save my settings", command=self.profile_save).grid(row=1, column=2, padx=(6, 0), pady=(6, 0))
        nb.Button(pr, text="Add another ship", command=self.profile_new).grid(row=1, column=3, padx=(6, 0), pady=(6, 0))
        nb.Label(p, text='Name it after a ship, its type ("Python Mk II") or its own name: GRAVITAS switches to it when you board it.').grid(
            row=1, column=0, sticky=tk.W, padx=PAD, pady=(2, 8))
        self.profile_menu_fill()
        self.vars["auto"] = tk.IntVar(value=int(s.auto))
        nb.Checkbutton(p, text="On the game's panels, in their perspective", variable=self.vars["auto"],
                       command=self.apply).grid(row=2, column=0, sticky=tk.W, padx=PAD, pady=(4, 0))
        nb.Label(p, text="Turn Preview on, then move a window with the arrows.").grid(row=3, column=0, sticky=tk.W,
                                                                                   padx=PAD + 24, pady=(0, 8))
        g = nb.Frame(p)
        g.grid(row=4, column=0, sticky=tk.W, padx=PAD)
        for c, text in enumerate(("Window", "Shows", "Move", "Colour", "")):
            nb.Label(g, text=text, font=("TkDefaultFont", 9, "bold")).grid(row=0, column=c, sticky=tk.W, padx=4, pady=(0, 4))
        for r, (key, *_rest) in enumerate(combat.WINDOWS, start=1):
            w = s.win[key]
            on, col = tk.IntVar(value=int(w["on"])), tk.StringVar(value=w["colour"])
            self.vars[key] = (on, col)
            nb.Checkbutton(g, text=SHORT.get(key, key), variable=on, command=self.apply).grid(row=r, column=0, sticky=tk.W, padx=4)
            wv = self.when[key] = tk.StringVar(value=WHEN_LABEL[w["when"]])
            om = tk.OptionMenu(g, wv, *WHEN_LABEL.values(), command=lambda _v: self.apply())
            om.configure(width=19)
            om.grid(row=r, column=1, sticky=tk.W, padx=4)
            mv = nb.Frame(g)
            mv.grid(row=r, column=2, padx=4)
            for i, (lab, dx, dy) in enumerate((("◀", -1, 0), ("▲", 0, -1), ("▼", 0, 1), ("▶", 1, 0))):
                nb.Button(mv, text=lab, width=2, command=lambda k=key, dx=dx, dy=dy: self.nudge(k, dx, dy)).grid(row=0, column=i, padx=1)
            if self.on_snap:                     # v0.35.0: to an edge or the middle in one click
                sn = tk.Menubutton(mv, text="⇔", width=2, relief=tk.RAISED)
                sn["menu"] = menu = tk.Menu(sn, tearoff=0)
                for where, lab in SNAPS:
                    menu.add_command(label=lab, command=lambda k=key, w_=where: self.snap(k, w_))
                sn.grid(row=0, column=4, padx=(3, 1))
            sw = self.swatch[key] = tk.Button(g, width=3, relief=tk.FLAT, bg=w["colour"], activebackground=w["colour"],
                                              command=lambda k=key: self.pick(k))
            sw.grid(row=r, column=3, padx=4, pady=1)
            nb.Button(g, text="Reset", command=lambda k=key: self.reset_one(k)).grid(row=r, column=4, padx=4)
        b = nb.Frame(p)
        b.grid(row=5, column=0, sticky=tk.W, padx=PAD, pady=PAD)
        for i, (text, cmd) in enumerate((("All on", lambda: self.all_on(1)), ("All off", lambda: self.all_on(0)),
                                         ("Default places", self.reset_places), ("Game colours", self.reset_colours))):
            nb.Button(b, text=text, command=cmd).grid(row=0, column=i, padx=(0, 8))

    def tab_keys(self, p):
        s = self.s
        self.check(p, "keys", "Keys, while the game is in front or not", 0, pady=(PAD, 2))
        for i, (k, what) in enumerate(combat.KEYS_HELP, start=1):
            nb.Label(p, text=f"{k:16s} {what}").grid(row=i, column=0, sticky=tk.W, padx=PAD + 24)
        self.section(p, "Free look", 6)
        self.vars["look_on"] = tk.IntVar(value=int(s.look == "hide"))
        nb.Checkbutton(p, text="Hide the HUD while I look around", variable=self.vars["look_on"], command=self.apply).grid(
            row=7, column=0, sticky=tk.W, padx=PAD, pady=2)
        self.vars["look_how"] = tk.StringVar(value=LOOK_HOW[s.look_how])
        self.vars["look_btn"] = tk.StringVar(value=LOOK_BTN[s.look_btn][0])
        if self.headlook:                    # v0.22.0: as the game's own free look, read from its controls
            nb.Label(p, text=f"As the game's own free look: {self.headlook} (read from the game's controls)").grid(
                row=8, column=0, sticky=tk.W, padx=PAD + 24, pady=(0, PAD))
        else:                                # (the game's controls could not be read: say it here)
            row = nb.Frame(p)
            row.grid(row=8, column=0, sticky=tk.W, padx=PAD + 24, pady=(0, PAD))
            tk.OptionMenu(row, self.vars["look_btn"], *(n for n, _ in LOOK_BTN.values()), command=lambda _v: self.apply()).grid(row=0, column=0)
            tk.OptionMenu(row, self.vars["look_how"], *LOOK_HOW.values(), command=lambda _v: self.apply()).grid(row=0, column=1, padx=6)

    def size_pick(self):
        """Small, Normal or Large: the percent box follows (it can then be set to any size, v0.21.0)."""
        v = self.vars["size"].get()
        if v in SIZES:
            self.vars["size_pct"].set(str(round(SIZES[v] * 100)))
        elif v == "auto":
            self.vars["size_pct"].set(str(auto_pct(self.s.screen_h)))
        self.apply()

    # ---- profiles (v0.19.0)
    def profile_menu_fill(self):
        m = self.profile_menu["menu"]
        m.delete(0, "end")
        for n in profiles.names() or ["(none yet)"]:
            m.add_command(label=n, command=lambda n=n: self.profile_pick(n))
        if self.profile.get() not in profiles.names():
            a = profiles.active()
            self.profile.set(a if a in profiles.names() else "" if profiles.names() else "(none yet)")

    def profile_pick(self, name):
        if name not in profiles.names():
            return
        if profiles.load(name, self.s, self.s.store):
            self.profile.set(name)
            self.profile_name.set(name)
            self.refresh()

    def profile_save(self):
        name = profiles.save(self.profile_name.get(), self.s)
        if name:
            self.profile.set(name)
            self.profile_menu_fill()

    def profile_new(self):
        """Another ship: a name to type, the windows as they are now to start from; Save keeps them under it."""
        self.profile_name.set("")
        self.profile.set("")

    def profile_delete(self):
        name = self.profile.get()
        if name in profiles.names():
            profiles.delete(name)
            self.profile_name.set("")
            self.profile.set("")
            self.profile_menu_fill()

    def defaults(self):
        """v0.23.0: the windows as GRAVITAS starts them (CMDR Hongark's set): Targets by value and the Bounty counter on
        the main panel, This fight with the left panel (1), Takedown speed with the right panel (4), the Keys card at the
        top in the middle, the combat report (v0.27.0: as a fight ends); the others off; on the game's panels, in their places, in the game's orange. Save it under a
        ship's name to keep it there."""
        s = self.s
        s.auto = True
        for key, _, x, y in combat.WINDOWS:
            w = s.win[key]
            w.update(on=key not in combat.WINDOWS_OFF, when=combat.DEFAULT_WHEN.get(key, "always"), x=x, y=y,
                     dx=0.0, dy=0.0, colour=GAME_ORANGE)
            s.store(key, w)
        self.refresh()

    def refresh(self):
        """The tab shows the live settings again (a profile loaded, here or when you boarded a ship)."""
        try:
            self.vars["auto"].set(int(self.s.auto))
            for key, *_ in combat.WINDOWS:
                w = self.s.win[key]
                self.vars[key][0].set(int(w["on"]))
                self.when[key].set(WHEN_LABEL[w["when"]])
                self.set_colour(key, w["colour"])
            if profiles.active():
                self.profile.set(profiles.active())
                self.profile_name.set(profiles.active())
        except (tk.TclError, KeyError):
            pass

    # ---- actions
    def preview(self, toggle):
        self.apply()
        self.show_preview(toggle())

    def show_preview(self, on):
        self.preview_on = bool(on)
        self.b_preview.configure(text="Preview: ON" if on else "Preview")

    def see(self):
        """v0.35.0: a window moved, snapped or reset with Preview off: Preview comes on, so it is seen where it went (a
        player moved This fight while no fight was on: nothing showed, and it seemed lost for good)."""
        if not self.preview_on and self.on_preview:
            self.preview(self.on_preview)

    def snap(self, key, where):
        self.see()
        if self.on_snap:
            self.on_snap(key, where)

    def order_changed(self, order):
        self.s.order = order
        config.set(_k("order"), ", ".join(order))

    def nudge(self, key, dx, dy):
        """On the game's panels: the window shifted, its shape kept; off them: moved flat."""
        self.see()
        w = self.s.win[key]
        if self.s.auto:
            w["dx"] = round(max(-DX_MAX, min(DX_MAX, w["dx"] + dx * STEP)), 1)
            w["dy"] = round(max(-DY_MAX, min(DY_MAX, w["dy"] + dy * STEP)), 1)
            config.set(_k("win", key, "dx"), round(w["dx"] * 10)); config.set(_k("win", key, "dy"), round(w["dy"] * 10))
        else:
            w["x"] = round(max(0.0, min(98.0, w["x"] + dx * STEP)), 1)
            w["y"] = round(max(0.0, min(98.0, w["y"] + dy * STEP)), 1)
            config.set(_k("win", key, "xp"), round(w["x"] * 10)); config.set(_k("win", key, "yp"), round(w["y"] * 10))

    def reset_one(self, key):
        x, y = next((x, y) for k, _, x, y in combat.WINDOWS if k == key)
        self.see()
        w = self.s.win[key]
        w.update(dx=0.0, dy=0.0, x=x, y=y)
        for n, v in (("dx", 0), ("dy", 0), ("xp", round(x * 10)), ("yp", round(y * 10))):
            config.set(_k("win", key, n), v)

    def reset_places(self):
        for key, *_ in combat.WINDOWS:
            self.reset_one(key)

    def all_on(self, v):
        for key, *_ in combat.WINDOWS:
            self.vars[key][0].set(v)
        self.apply()

    def set_colour(self, key, c):
        self.vars[key][1].set(c)
        self.swatch[key].configure(bg=c, activebackground=c)

    def pick(self, key):
        try:
            from tkinter import colorchooser
            c = colorchooser.askcolor(color=self.vars[key][1].get(), parent=self.frame)[1]
            if c:
                self.set_colour(key, c)
                self.apply()
        except Exception:
            pass

    def reset_colours(self):
        for key, *_ in combat.WINDOWS:
            self.set_colour(key, GAME_ORANGE)
        self.apply()

    def sync(self):
        """(Kept for callers: the places are no longer shown as numbers.)"""

    def apply(self):
        """Into the live settings at once (so Preview shows it), and into EDMC's config."""
        s, V = self.s, self.vars
        for key in ("combat_on", "front", "always", "hide_maps", "bg", "drop_lost", "bonds", "keys", "auto", "boot"):
            setattr(s, key, bool(V[key].get()))
        for key, name in (("combat_on", ("combat", "on")), ("front", ("front",)), ("always", ("always",)),
                          ("hide_maps", ("hide", "maps")), ("bg", ("bg",)), ("boot", ("boot",)),
                          ("drop_lost", ("drop", "lost")), ("bonds", ("bonds",)), ("keys", ("keys",)), ("auto", ("auto",))):
            config.set(_k(*name), int(getattr(s, key)))
        for key, lo, hi, name in (("size_pct", SIZE_LO, SIZE_HI, ("size", "pct")), ("rows", 1, 20, ("targets", "n"))):
            try:
                setattr(s, key, max(lo, min(hi, int(float(V[key].get())))))
            except (tk.TclError, ValueError):
                pass
            V[key].set(str(getattr(s, key)))
            config.set(_k(*name), getattr(s, key))
        # a percent of one's own: none of the four marked; Auto stays Auto while its own percent is in the box
        if V["size"].get() == "auto" and s.size_pct == auto_pct(s.screen_h):
            s.size = "auto"
        else:
            s.size = next((k for k, v in SIZES.items() if round(v * 100) == s.size_pct), "normal")
        V["size"].set("auto" if s.size == "auto" else s.size if round(SIZES[s.size] * 100) == s.size_pct else "")
        config.set(_k("size2"), s.size)
        s.sort = "s" if V["sort"].get() == "s" else "v"; config.set(_k("sort"), s.sort)
        s.order = list(self.order_box.order); config.set(_k("order"), ", ".join(s.order))
        for key, lo, hi in (("opacity", 40, 100), ("report_s", 5, 600)):
            try:
                setattr(s, key, max(lo, min(hi, int(float(V[key].get())))))
            except (tk.TclError, ValueError):
                pass
            V[key].set(str(getattr(s, key)))
        config.set(_k("opacity"), s.opacity); config.set(_k("report", "s"), s.report_s)
        s.look = "hide" if V["look_on"].get() else "off"; config.set(_k("look2"), s.look)
        s.look_how = next((k for k, lab in LOOK_HOW.items() if lab == V["look_how"].get()), "hold"); config.set(_k("look", "how"), s.look_how)
        s.look_btn = next((k for k, (lab, _) in LOOK_BTN.items() if lab == V["look_btn"].get()), "m3"); config.set(_k("look", "btn"), s.look_btn)
        for key, *_ in combat.WINDOWS:
            on, col = V[key]
            c = col.get().strip().lower()
            if not (len(c) == 7 and c.startswith("#") and all(ch in "0123456789abcdef" for ch in c[1:])):
                c = GAME_ORANGE
            when = next((w for w, lab in WHEN_LABEL.items() if lab == self.when[key].get()), "always")
            w = s.win[key]
            w.update(on=bool(on.get()), colour=c, when=when)
            config.set(_k("win", key, "when"), when)
            config.set(_k("win", key, "on"), int(w["on"])); config.set(_k("win", key, "colour"), c)
