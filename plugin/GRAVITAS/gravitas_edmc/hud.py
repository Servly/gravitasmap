"""GRAVITAS's own overlay (the HUD): nothing else to install.

A borderless, always-on-top, see-through window that sits exactly over the game window and lets every click through
to the game. It is an ordinary window beside the game: it never touches the game's process or its graphics.
It shows only while the game is in front (and during Preview), follows the game window when it moves or resizes,
and redraws only when something on it changes.

Windows: transparency, click-through and finding the game use the Windows API through ctypes (part of Python).
Elsewhere (tests on Linux) the same drawing runs in an ordinary window.
"""
import math
import os
import sys
import time
import tkinter as tk
import tkinter.font as tkfont

from . import bootfx, planes, sprites

try:                                   # Pillow, as EDMC carries it: a tilted window drawn as one smooth picture
    from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageTk
except Exception:                      # (without it: point by point, texts upright)
    Image = None

WIN = sys.platform == "win32"
GAME_TITLE = "Elite - Dangerous (CLIENT)"
KEY = "#010203"            # the see-through colour: never used for anything drawn
PANEL = "#0c0812"          # card background
TRACK = "#2a2232"          # empty part of a bar
ALPHA = 0.94
BASE_H = 1080              # sizes are for a 1080-line game window and scale with it
TONES = {"red": ("#3a0a12", "#ff4d5e", "#ffd6da"), "amber": ("#33240a", "#ffb84d", "#ffe7c2"), "green": ("#0b2a1a", "#3ddc84", "#d6ffe8"),
         "grey": ("#15121b", "#9a90a8", "#d9d2e3")}
FLAT = (0.0, 0, 100, 100)
GROUND = "#06040a"         # the dark ground behind a panel (never KEY: KEY is what turns see-through)  # a window's shape: angle (degrees), perspective (%), width (%), height (%)

# The game turns the head to a side panel in about 0.2 s, and the panel appears in about 0.45 s (measured on CMDR
# Hongark's videos, v0.10.0). The windows go out where they are, at once, as the turn starts (v0.11.0: no sliding);
# a side panel's windows show as the panel itself appears, the windows ahead as the head is back
TURN_S = 0.22
TURN = {}                           # (v0.10.0 slid the windows with the turn: CMDR Hongark prefers them to go at once)
BETWEEN = 99                        # v0.28.0: a panel just closed by the game's own screens: maybe a map comes next
SIDE = (1, 2, 3, 4, BETWEEN)        # (no window shows in between)
OUT_S = 0.09                        # a window that leaves is gone in this long (sliding away with the head's turn)
IN_FRONT = (0.2, 0.25)              # the windows ahead come back as the head is back (from, how long)
IN_PANEL = (0.4, 0.45)              # a panel's windows boot up as the panel itself appears (from, how long): v0.22.0,
                                    # the game's panel shows about 0.45 s after its key; at 0.2 s they had booted already
# v0.20.0: which way the windows ahead slide while the head turns to a panel (parts of the height): the head turns
# left to the left panel (GuiFocus 2), so what is ahead goes right; right (1) the other way; down to the role panel
# (4), so it goes up; the comms panel (3) is up and left
SLIDE = {2: (0.06, 0.0), 1: (-0.06, 0.0), 4: (0.0, -0.05), 3: (0.03, 0.02)}
TURN_EVERY = 0.07                   # a window leaned or grown with the cockpit is drawn again at most this often (s)
TURN_STEP = (math.radians(0.3), 0.006)   # ... and only when the cockpit leaned or grew this much more
FADE_S = 0.15                       # the HUD showing (the game back in front): soft, as SrvSurvey's panels
FRAME_MS = 15


def count_colour(col):
    """v0.26.0: the countdown's colour: red, or for a window that is red itself (or near it) a bright cyan, red's
    opposite, so that the number always stands out from the window."""
    try:
        r, g, b = (int(col[i:i + 2], 16) / 255 for i in (1, 3, 5))
    except (TypeError, ValueError):
        return "#ff3b4e"
    hi, lo = max(r, g, b), min(r, g, b)
    if hi - lo < 0.15:
        return "#ff3b4e"                       # grey or white: red stands out
    if hi == r:
        hue = (60 * ((g - b) / (hi - lo))) % 360
    elif hi == g:
        hue = 60 * ((b - r) / (hi - lo)) + 120
    else:
        hue = 60 * ((r - g) / (hi - lo)) + 240
    return "#22e1ff" if hue < 15 or hue > 330 else "#ff3b4e"     # (the game's orange, 27 degrees, keeps red)


def smooth(p):
    p = max(0.0, min(1.0, p))
    return p * p * (3 - 2 * p)


def seen_in(group, gui):
    """Is a window of this group shown while this panel (GuiFocus) is open: the windows ahead while no side panel is,
    a panel's windows with their panel, "all" always (a past report asked for)."""
    if group == "all":
        return True
    if group == "front":
        return gui not in SIDE
    return group == gui


class Sprite:
    def __init__(self, layer):
        self.layer = layer
        self.key = None
        self.pos = (0, 0)
        self.group = "front"
        self.vend = None           # on a plane: where the next window on it starts
        self.img = None            # its picture as drawn (upright, at rest)
        self.anchor = None         # the game's panel it holds on to ("comms", "info", "center"), or None
        self.shown = None          # the lean and growth of the picture now on screen, its size, when it was made


FONT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fonts")
GAME_FONT, GAME_WIDE = "GRAVITAS HUD", "GRAVITAS HUD Wide"    # the game's square, technical letters (fonts/, OFL)

if WIN:
    import ctypes
    from ctypes import wintypes
    _u32 = ctypes.windll.user32


def load_fonts():
    """GRAVITAS's fonts for this program only (Windows: AddFontResourceEx, private): nothing is installed."""
    if not WIN or not os.path.isdir(FONT_DIR):
        return
    for f in os.listdir(FONT_DIR):
        if f.lower().endswith(".ttf"):
            try:
                ctypes.windll.gdi32.AddFontResourceExW(os.path.join(FONT_DIR, f), 0x10, 0)
            except Exception:
                pass


def mix(a, b, t):
    """Colour a moved toward colour b by t (0..1)."""
    a, b = a.lstrip("#"), b.lstrip("#")
    ca = [int(a[i:i + 2], 16) for i in (0, 2, 4)]
    cb = [int(b[i:i + 2], 16) for i in (0, 2, 4)]
    return "#" + "".join(f"{round(x + (y - x) * t):02x}" for x, y in zip(ca, cb))


def game_rect():
    """The game's drawing area on screen (x, y, w, h), whether it is in front, or None."""
    if not WIN:
        return None
    h = _u32.FindWindowW(None, GAME_TITLE)
    if not h or _u32.IsIconic(h):
        return None
    r, p = wintypes.RECT(), wintypes.POINT(0, 0)
    if not _u32.GetClientRect(h, ctypes.byref(r)) or not _u32.ClientToScreen(h, ctypes.byref(p)):
        return None
    w, hh = r.right - r.left, r.bottom - r.top
    if w < 200 or hh < 200:
        return None
    return p.x, p.y, w, hh, _u32.GetForegroundWindow() == h


def ours_in_front():
    """EDMC itself (its main window or its settings) is the window in front."""
    if not WIN:
        return True
    pid = wintypes.DWORD()
    _u32.GetWindowThreadProcessId(_u32.GetForegroundWindow(), ctypes.byref(pid))
    return pid.value == os.getpid()


class Hud:
    def __init__(self, root, logger):
        self.log = logger
        self.top = tk.Toplevel(root)
        self.top.withdraw()
        self.top.overrideredirect(True)
        self.top.title("GRAVITAS HUD")
        try:
            self.top.attributes("-topmost", True)
        except tk.TclError:
            pass
        bg = KEY if WIN else "#000000"
        self.cv = tk.Canvas(self.top, bg=bg, highlightthickness=0, bd=0)
        self.cv.pack(fill=tk.BOTH, expand=True)
        if WIN:
            try:
                self.top.attributes("-transparentcolor", KEY)
                self.top.attributes("-alpha", ALPHA)
            except tk.TclError as e:
                logger.warning(f"GRAVITAS HUD: no transparency: {e}")
        load_fonts()
        fams = set(tkfont.families(root))
        self.fam = next((f for f in ("Bahnschrift", "Segoe UI", "DejaVu Sans", "Helvetica") if f in fams), "TkDefaultFont")
        self.game_fam = GAME_FONT if GAME_FONT in fams else self.fam
        self.game_wide = GAME_WIDE if GAME_WIDE in fams else self.game_fam
        self.theme = "game"        # "game": lines and glowing letters like the game's own panels; "cards": GRAVITAS's cards
        self.bg = True             # the game look on a dark, see-through ground (as SrvSurvey's panels), for any background
        self.alpha = ALPHA         # how see-through the whole HUD is
        self._fade = None
        self.shown = False
        self.force, self.only_front = False, True
        self.geo = None
        self.key = None
        self.backdrop = None       # tests only: a picture of the game behind the cards
        self._fonts = {}
        self._clickthrough_done = False
        self._failed = set()       # cards that could not be drawn, already in the log
        self.sizes = {}            # each window's size as last drawn (pixels): for placing them (layout.py)
        self._tx = {}              # each text drawn: its size, weight and wrap width, for reshaping
        self._photos = []          # the pictures of tilted windows (Tk forgets a picture nobody holds)
        self._pil_fonts = {}
        self.turn_text = False     # a tilted card keeps its texts upright and sharp (v0.5.0: Windows draws turned text badly)
        self.base = {}             # every piece as drawn (its kind and points): the cockpit's move is applied to these
        self.move = None           # the cockpit's move now (track.Move, in game-window pixels), or None: at rest
        self.lost = False          # the cockpit is out of sight (a look far away): the cards hide until it is back
        # v0.10.0: each window one picture (Pillow): on Windows a layered window of its own, else on the canvas
        self.mode = "layered" if WIN and Image is not None else "canvas"
        self.sprites = {}
        self.gui = 0               # the game's panel open now (GuiFocus)
        self.turn = None           # the head turn under way: (when it began, where the cockpit goes, from, to)
        self.fade_t0 = 0.0
        self.origin = (0, 0)
        self.W, self.H = 1920, 1080
        self._anim = None
        self._bd = None
        self._was_lost = False
        self.found_t = 0.0
        self.found = {}            # when the cockpit was found again (canvas drawing, below)
        self.boot = None           # v0.18.0: the windows booting up as holograms (bootfx.Boot), or None
        self.boot_on = True        # v0.35.0: off in the settings: windows fade in instead

    # ---- where: over the game window, only while it is in front
    def place(self, force_show=False, only_front=True):
        """Over the game window, while the game is in front. Preview (force_show) also shows while EDMC's own window
        is in front, to place the cards from its settings; never over another program (v0.7.1)."""
        self.force, self.only_front = force_show, only_front
        g = game_rect()
        if g is None:
            if not force_show:
                return self.hide()
            sw, sh = self.top.winfo_screenwidth(), self.top.winfo_screenheight()
            g = (0, 0, sw, sh, False)
        x, y, w, h, front = g
        if not self.may_show(front):
            return self.hide()
        geo = f"{w}x{h}+{x}+{y}"
        if self.mode == "layered":                  # the windows are on their own: the HUD's window stays hidden
            if geo != self.geo:
                self.top.geometry(geo)
                self.geo, self.key = geo, None
            self.origin, self.W, self.H = (x, y), w, h
            if not self.shown:
                self.shown = True
                self.fade_t0 = time.perf_counter()
                self.animate()
            return True
        if geo != self.geo:
            self.top.geometry(geo)
            self.geo, self.key = geo, None
        self.W, self.H = w, h
        if not self.shown:
            if WIN:
                try:
                    self.top.attributes("-alpha", 0.0)
                except tk.TclError:
                    pass
            self.top.deiconify()
            self.top.lift()
            self.shown = True
            self._clickthrough()
            self.fade_in()
            self.animate()
        return True

    def fade_in(self, step=0):
        """Shows softly (about 0.15 s), as SrvSurvey's panels do, instead of popping up."""
        if not WIN or not self.shown:
            return
        try:
            self.top.attributes("-alpha", self.alpha * min(1.0, (step + 1) / 5))
        except tk.TclError:
            return
        if step < 4:
            self._fade = self.top.after(30, self.fade_in, step + 1)

    def set_alpha(self, a):
        if abs(a - self.alpha) > 0.001:
            self.alpha = a
            if self.mode == "layered":
                self.arrange()
            elif WIN and self.shown:
                try:
                    self.top.attributes("-alpha", a)
                except tk.TclError:
                    pass

    def may_show(self, front):
        return front or not self.only_front or (self.force and ours_in_front())

    def check_front(self):
        """Often: another program came in front: hide at once. True when the HUD should
        come back (the game is in front again)."""
        g = game_rect()
        ok = self.may_show(bool(g and g[4]))
        back = ok and not getattr(self, "_front_ok", True)    # only the moment it comes back, not every check
        self._front_ok = ok
        if self.shown and not ok:
            self.hide()
        return back

    def _clickthrough(self):
        """Clicks go through to the game; the HUD never takes the focus or shows in the taskbar."""
        if not WIN or self._clickthrough_done:
            return
        try:
            self.top.update_idletasks()
            hwnd = _u32.GetParent(self.top.winfo_id()) or self.top.winfo_id()
            GWL_EXSTYLE, LAYERED, TRANSPARENT, TOOL, NOACT = -20, 0x80000, 0x20, 0x80, 0x08000000
            ex = _u32.GetWindowLongW(hwnd, GWL_EXSTYLE)
            _u32.SetWindowLongW(hwnd, GWL_EXSTYLE, ex | LAYERED | TRANSPARENT | TOOL | NOACT)
            self._clickthrough_done = True
        except Exception as e:
            self.log.warning(f"GRAVITAS HUD: click-through: {e}")

    def hide(self):
        if self.shown:
            if self.mode == "layered":
                for sp in self.sprites.values():
                    sp.layer.show(False)
            else:
                self.top.withdraw()
            self.shown = False
        return False

    def destroy(self):
        for sp in self.sprites.values():
            sp.layer.destroy()
        self.sprites = {}
        try:
            self.top.destroy()
        except tk.TclError:
            pass

    # ---- what
    def font(self, size, weight="normal", family=None):
        k = (max(8, round(size)), weight, family or self.fam)    # whole pixels: one font for each size, not each float
        if k not in self._fonts:
            self._fonts[k] = tkfont.Font(family=k[2], size=-k[0], weight=weight)
        return self._fonts[k]

    # ---- v0.10.0: each window one picture, drawn again only when it changes; shown, hidden and moved with the game
    def render(self, items, scale=1.0):
        """items: [(key, model, x_percent, y_percent, colour, shape, place, group)]. A window is drawn again only when
        it changed; which of them show is the panel open (set_focus), at once and without drawing."""
        if Image is None:
            return self.render_canvas(items, scale)
        cv, W, H = self.cv, self.W, self.H
        if self.backdrop is not self._bd:                    # (tests only: a picture of the game behind)
            cv.delete("backdrop")
            if self.backdrop is not None:
                cv.create_image(0, 0, image=self.backdrop, anchor="nw", tags="backdrop")
                cv.tag_lower("backdrop")
            self._bd = self.backdrop
        S = max(0.6, H / BASE_H) * scale * (1.2 if self.theme == "game" else 1.0)    # (v0.11.0: a size larger)
        self._tx = {}
        cursor, keep = {}, set()
        for it in items:
            k, m, xp, yp, col = it[:5]
            shape = it[5] if len(it) > 5 else FLAT
            place = it[6] if len(it) > 6 else None
            group = it[7] if len(it) > 7 else "front"
            anchor = it[8] if len(it) > 8 else None
            if not m:
                continue
            v0 = None
            if place and place[0] == "plane":
                v0 = cursor.get(place[1], planes.SLOTS[place[1]][1])
            elif place and place[0] == "area":                # v0.19.0: in a free area beside an opened panel
                v0 = cursor.get(place[1], planes.area(place[1], W, H)[1])
            elif place and place[0] == "mid":                 # v0.21.0: the main panel's top, in the middle
                v0 = cursor.get("mid", planes.MID_Y0 * H)
            key = repr((m, xp, yp, col, shape, place, v0, round(S, 4), W, H, self.theme, self.bg))
            sp = self.sprites.get(k)
            if sp is None or sp.key != key:
                try:
                    got = self.paint(k, m, xp, yp, col, shape, place, v0, S, W, H)
                except Exception as e:              # one window that fails is left out; the others are still drawn
                    why = f"{k}: {type(e).__name__}: {e}"
                    if why not in self._failed:
                        self._failed.add(why)
                        self.log.exception(f"GRAVITAS HUD: the {k} window could not be drawn: {e} | model: {m!r}")
                    got = None
                if got is None:
                    continue
                img, ox, oy, vend = got
                # v0.35.0: a window drawn again (its numbers changed) keeps showing as it does now, where it is now (the
                # head's turn under way included): it was given its new picture unseen and shown again only once
                # every other changed window was drawn too, a blink of a tenth of a second at each change (seen in a
                # player's video: Targets by value blinked, the Bounty counter, unchanged, did not)
                a_now, mx, my = 0.0, 0.0, 0.0
                if sp is None:
                    sp = self.sprites[k] = Sprite(self.new_layer())
                elif sp.layer.at:
                    a_now = sp.layer.alpha_now()
                    mx = sp.layer.at[0] - (self.origin[0] + sp.pos[0])
                    my = sp.layer.at[1] - (self.origin[1] + sp.pos[1])
                try:
                    if getattr(sp, "fx", False):
                        pass                        # (booting: its boot pictures go on from the new one, arrange)
                    else:
                        sp.layer.picture(img, self.origin[0] + ox + mx, self.origin[1] + oy + my, a_now)
                except Exception as e:
                    self.log.warning(f"GRAVITAS HUD: layered windows do not work here ({e}): the HUD's own window is used")
                    self.to_canvas()
                    return self.render(items, scale)
                sp.key, sp.pos, sp.vend = key, (ox, oy), vend
                sp.img, sp.shown = img, (0.0, 1.0, img.size, 0.0)
            sp.group = group
            sp.anchor = anchor
            if sp.vend is not None and place and place[0] in ("plane", "area", "mid"):
                cursor["mid" if place[0] == "mid" else place[1]] = sp.vend
            keep.add(k)
        for k in list(self.sprites):
            if k not in keep:
                self.sprites.pop(k).layer.destroy()
        self.arrange()

    def new_layer(self):
        if self.mode == "layered":
            return sprites.Layered()
        return sprites.OnCanvas(self.cv, cut=WIN)

    def to_canvas(self):
        """Layered windows failed: GRAVITAS's own see-through window carries the pictures (as up to v0.9.0)."""
        for sp in self.sprites.values():
            sp.layer.destroy()
        self.sprites = {}
        self.mode = "canvas"
        self.shown = False
        self.geo = None
        self.place(self.force, self.only_front)

    def paint(self, k, m, xp, yp, col, shape, place, v0, S, W, H):
        """One window drawn on the (hidden) canvas, then made one picture where it goes: (picture, x, y, where the next
        window on its plane starts)."""
        cv = self.cv
        x, y = (0, 0) if place else (round(W * xp / 100), round(H * yp / 100))
        if place and place[0] == "top":
            y = round(H * place[1])
        before = set(cv.find_all())
        try:
            if self.theme == "game":
                {"chip": self.g_chip, "banner": self.g_banner}.get(m.get("kind"), self.g_card)(m, x, y, S, col)
            else:
                {"chip": self.chip, "banner": self.banner}.get(m.get("kind"), self.card)(m, x, y, S, col)
        except Exception:
            for i in set(cv.find_all()) - before:
                cv.delete(i)
            raise
        new = set(cv.find_all()) - before
        # v0.22.0: the window is placed by what it shows, not by its dark ground (which reaches past it): the ground
        # turned on or off moved every window on a panel
        ground = {i for i in new if "ground" in cv.gettags(i)}
        b_all = cv.bbox(*new) if new else None
        b = cv.bbox(*(new - ground)) if new - ground else b_all
        if not b:
            for i in new:
                cv.delete(i)
            return None
        if m.get("title") not in ("GRAVITAS",):
            ow, oh = self.sizes.get(k, (0, 0))
            self.sizes[k] = (max(ow, b[2] - b[0]), max(oh, b[3] - b[1]))
        vend = None
        rect = lambda dx=0: [(b[0] + dx, b[1]), (b[2] + dx, b[1]), (b[2] + dx, b[3]), (b[0] + dx, b[3])]
        if place and place[0] == "top":
            dst = rect(round(W / 2 - (b[0] + b[2]) / 2))
        elif place and place[0] == "plane":
            dst, vend = self.plane_quad(b, place[1], W, H, v0)
        elif place and place[0] == "area":
            dst, vend = self.area_quad(b, place[1], W, H, v0)
        elif place and place[0] == "mid":                       # v0.21.0: flat, in the middle, one under another
            dx = round(W / 2 - (b[0] + b[2]) / 2)
            dst = [(b[0] + dx, v0), (b[2] + dx, v0), (b[2] + dx, v0 + b[3] - b[1]), (b[0] + dx, v0 + b[3] - b[1])]
            vend = v0 + (b[3] - b[1]) + planes.AREA_GAP * H
        elif shape and tuple(shape) != FLAT:
            dst = self.shape_quad(b, x, y, shape)
        else:
            dst = rect()
        if place and len(place) > 2 and (place[2] or place[3]):
            # v0.17.0: moved by hand with the arrows, as a panel of the game still: its shape kept, only shifted (up to
            # 0.16 a window moved by hand fell flat and jumped to where its numbers said)
            mx, my = H * place[2] / 100, H * place[3] / 100      # (in heights: alike on a wide screen, v0.19.0)
            dst = [(px + mx, py + my) for px, py in dst]
        if b_all and tuple(b_all) != tuple(b):                  # the ground round it, carried the same way
            h = planes.homography([(b[0], b[1]), (b[2], b[1]), (b[2], b[3]), (b[0], b[3])], dst)
            if h:
                dst = [planes.apply(h, px, py) for px, py in ((b_all[0], b_all[1]), (b_all[2], b_all[1]),
                                                              (b_all[2], b_all[3]), (b_all[0], b_all[3]))]
                b = b_all
        pic = self.picture(new, b, dst, S)
        if pic is None:
            return None
        img, ox, oy = pic
        m_ = 6                                                  # kept inside the game window, whole
        if img.width < W - 2 * m_:
            ox = min(max(ox, m_), W - m_ - img.width)
        if img.height < H - 2 * m_:
            oy = min(max(oy, m_), H - m_ - img.height)
        return img, ox, oy, vend

    def plane_quad(self, b, name, W, H, v):
        """Where a window goes on one of the game's panels (planes.py), from v down: its four corners, and where the
        next window on that plane starts."""
        q = planes.plane(name, W, H)
        Wp, Hp = planes.size(q)
        du, dv = (b[2] - b[0]) / Wp, (b[3] - b[1]) / Hp
        u0 = planes.SLOTS[name][0]
        if u0 is None:                                  # on the right of its plane, or on the left of the right panel
            u0 = 1.0 - du if name == "info" else -du - 0.03
        unit = planes.homography([(0, 0), (1, 0), (1, 1), (0, 1)], q)
        dst = [planes.apply(unit, uu, vv) for uu, vv in ((u0, v), (u0 + du, v), (u0 + du, v + dv), (u0, v + dv))]
        return dst, v + dv + planes.GAP

    def area_quad(self, b, name, W, H, v):
        """v0.19.0: a window flat in a free area beside an opened panel (planes.AREAS), from v down, made smaller if
        it does not fit: its four corners, and where the next window in that area starts."""
        x0, _, x1, y1 = planes.area(name, W, H)
        bw, bh = b[2] - b[0], b[3] - b[1]
        # as wide as the area at most, and as tall as the room left in it (but never under half its size)
        k = min(1.0, (x1 - x0) / max(1, bw), max(0.5, (y1 - v) / max(1, bh)))
        w, h = bw * k, bh * k
        dst = [(x0, v), (x0 + w, v), (x0 + w, v + h), (x0, v + h)]
        return dst, v + h + planes.AREA_GAP * H

    def shape_quad(self, b, x0, y0, shape):
        """Where the corners of a window go with the shape given by hand (angle, perspective, width, height)."""
        ang, per, sx, sy = shape
        Wc, Hc = max(1, b[2] - x0), max(1, b[3] - y0)
        sx, sy, p = sx / 100, sy / 100, per / 100
        c, s_ = math.cos(math.radians(ang)), math.sin(math.radians(ang))

        def T(px, py):
            k = 1 + p * ((px - x0) / Wc - 0.5)
            u, v = (px - x0) * sx, ((py - y0) - Hc / 2) * k * sy + Hc * sy / 2
            return x0 + u * c - v * s_, y0 + u * s_ + v * c
        return [T(b[0], b[1]), T(b[2], b[1]), T(b[2], b[3]), T(b[0], b[3])]

    def picture(self, ids, b, dst, S):
        """The pieces drawn for one window painted again as one picture, four times as fine, bent so that its corners
        go to dst and brought down to size smoothly (thin lines and small letters stay whole), with the game's soft glow
        round its lines and letters. The pieces are then taken off the canvas."""
        ss = 4
        img, x0, y0 = self.replay(ids, b, ss)
        for i in ids:
            self.cv.delete(i)
        pad = max(2, round(4 * S)) if self.theme == "game" else 2      # room for the glow
        ox, oy = int(min(p[0] for p in dst)) - pad, int(min(p[1] for p in dst)) - pad
        ow = int(max(p[0] for p in dst)) - ox + pad + 2
        oh = int(max(p[1] for p in dst)) - oy + pad + 2
        if ow <= 0 or oh <= 0 or ow * oh > 40_000_000:
            return None
        src = [(0, 0), (img.width, 0), (img.width, img.height), (0, img.height)]
        inv = planes.homography([((px - ox) * ss, (py - oy) * ss) for px, py in dst], src)
        if not inv:
            return None
        bent = img.convert("RGBa").transform((ow * ss, oh * ss), Image.PERSPECTIVE, inv[:8], Image.BICUBIC)
        bent = bent.resize((ow, oh), Image.LANCZOS)
        if self.theme == "game":
            glow = bent.filter(ImageFilter.GaussianBlur(max(1.2, 2.6 * S)))
            dim = lambda v: int(v * 0.8)                        # premultiplied: colour and alpha alike
            glow = Image.merge("RGBa", [c.point(dim) for c in glow.split()])
            bent = Image.alpha_composite(glow.convert("RGBA"), bent.convert("RGBA"))
        else:
            bent = bent.convert("RGBA")
        return bent, ox, oy

    def replay(self, ids, b, ss):
        """The canvas pieces of one window as a Pillow picture, ss times as fine (the dark glow copies are left out:
        the picture gets a real glow)."""
        cv = self.cv
        x0, y0 = b[0] - 2, b[1] - 2
        w, h = int(b[2] - x0 + 3), int(b[3] - y0 + 3)
        img = Image.new("RGBA", (w * ss, h * ss), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        P = lambda pts: [((pts[j] - x0) * ss, (pts[j + 1] - y0) * ss) for j in range(0, len(pts) - 1, 2)]
        rgba = lambda c, a=255: (*[int(c.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)], a) if c and c.startswith("#") else None
        keep = set(ids)
        for i in cv.find_all():                         # in the order they lie, bottom first
            if i not in keep or "gl" in cv.gettags(i):
                continue
            kind = cv.type(i)
            try:
                if kind == "polygon":
                    a = 190 if cv.itemcget(i, "stipple") else 255
                    fill, out = rgba(cv.itemcget(i, "fill"), a), rgba(cv.itemcget(i, "outline"))
                    pts = P(cv.coords(i))
                    if len(pts) >= 3:
                        d.polygon(pts, fill=fill, outline=out, width=max(1, round(float(cv.itemcget(i, "width") or 1) * ss)) if out else 0)
                elif kind == "line":
                    col = rgba(cv.itemcget(i, "fill"))
                    if col:
                        d.line(P(cv.coords(i)), fill=col, width=max(1, round(float(cv.itemcget(i, "width") or 1) * ss)))
                elif kind == "text":
                    self.pil_text(d, i, x0, y0, ss, rgba)
            except Exception as e:
                self.log.debug(f"GRAVITAS HUD: a piece left out of the picture: {e}")
        return img, x0, y0

    def boot_up(self):
        """v0.18.0: every window shown boots up as a hologram, one after another from the top (bootfx.py)."""
        if self.mode != "layered" or bootfx.Image is None or not self.sprites:
            return
        order = [k for k, sp in sorted(self.sprites.items(), key=lambda kv: (kv[1].pos[1], kv[1].pos[0]))]
        self.boot = bootfx.Boot(time.perf_counter(), order)
        self.animate()

    def set_focus(self, gui):
        """The game opened or closed one of its panels (GuiFocus): the windows go with the head's turn, at once."""
        if gui == self.gui:
            return
        old, self.gui = self.gui, gui
        now = time.perf_counter()
        self.turn = (now, (0.0, 0.0), old, gui)
        self.turn_hidden = not self.shown          # v0.24.0: the HUD hidden as it began (free look): nothing to see leave
        # v0.20.0: the panel's own windows boot up as holograms (quicker than at the start) as the panel appears;
        # v0.21.0: every window that comes into view does, the windows ahead too as the head comes back
        starts, i = {}, 0
        for k, sp in sorted(self.sprites.items(), key=lambda kv: (kv[1].pos[1], kv[1].pos[0])):
            if seen_in(sp.group, gui) and not seen_in(sp.group, old):
                start = IN_FRONT[0] if sp.group == "front" else IN_PANEL[0]
                starts[k] = start + i * bootfx.STAGGER * 0.5
                i += 1
        if starts and self.boot_on and self.mode == "layered" and bootfx.Image is not None:
            self.boot = bootfx.Boot(now, starts, k=0.8)        # (0.5 s: v0.21.0's 0.3 s was over too soon)
        self.animate()

    def animate(self):
        if self._anim is None:
            self._anim = self.top.after(0, self._frame)

    def _frame(self):
        self._anim = None
        try:
            busy = self.arrange()
        except Exception as e:
            busy = False
            self.log.warning(f"GRAVITAS HUD: {e}")
        if busy:
            self._anim = self.top.after(FRAME_MS, self._frame)

    def motion(self, sp, t):
        """Where a window is pushed (pixels) and how much of it shows (0..1) at time t, in the turn under way."""
        now = seen_in(sp.group, self.gui)
        if self.turn is None:
            return 0.0, 0.0, 1.0 if now else 0.0
        t0, _, old, new = self.turn
        el = t - t0
        was = seen_in(sp.group, old)
        if was == now:
            return 0.0, 0.0, 1.0 if now else 0.0
        if was and getattr(self, "turn_hidden", False):
            return 0.0, 0.0, 0.0                         # (it left while the HUD was hidden: already gone when it shows)
        if was:                                          # leaves: slides away with the head's turn, fading quickly
            sx, sy = SLIDE.get(new, (0.0, 0.0)) if sp.group == "front" else (-SLIDE.get(old, (0, 0))[0], -SLIDE.get(old, (0, 0))[1])
            e = smooth(el / OUT_S)
            return sx * self.H * e, sy * self.H * e, max(0.0, 1.0 - e)
        start, dur = IN_FRONT if sp.group == "front" else IN_PANEL
        p = max(0.0, min(1.0, (el - start) / dur))
        if sp.group == "front":                          # back: slides in from where the head was, as the head comes back
            sx, sy = SLIDE.get(old, (0.0, 0.0))
            e = smooth(p)
            # (booting up as it comes, v0.21.0: the boot shows it; without one it fades in)
            return sx * self.H * (1 - e), sy * self.H * (1 - e), (1.0 if p > 0 else 0.0) if self.boot is not None else e
        if self.boot is None:                            # (v0.35.0: no boot: it fades in)
            return 0.0, 0.0, smooth(p)
        return 0.0, 0.0, 1.0 if p > 0 else 0.0           # a panel's window: it boots up (set_focus)

    def arrange(self):
        """Every window where it is now: its place and the head's turn under way; shown or not. True while something
        still moves. (v0.17.0: the cockpit tracking is gone: the windows stay where they are put.)"""
        if not self.sprites:
            return False
        t = time.perf_counter()
        busy = False
        if self.turn is not None and t - self.turn[0] > max(TURN_S, OUT_S, IN_FRONT[0] + IN_FRONT[1], IN_PANEL[0] + IN_PANEL[1]):
            self.turn = None
        busy = self.turn is not None
        fade = 1.0
        if self.mode == "layered":
            fade = min(1.0, (t - self.fade_t0) / FADE_S)
            busy = busy or fade < 1.0
            alpha = self.alpha
        else:
            alpha = 1.0                                  # the HUD's window is see-through as a whole
        ox, oy = self.origin
        boot = self.boot
        for key, sp in self.sprites.items():
            dx, dy, a = self.motion(sp, t)
            if not self.shown or self.lost:
                a = 0.0
            if sp.shown and sp.shown[0:2] != (0.0, 1.0) and sp.img is not None:
                self.lean(sp, 0.0, 1.0, t, ox, oy, force=True)
            x, y = ox + sp.pos[0] + dx, oy + sp.pos[1] + dy
            fx = boot.picture(key, sp.img, t) if boot is not None and a > 0 else None
            if fx is not None:                           # booting: one of its boot pictures (bootfx.py)
                sp.layer.picture(fx[0], x, y, a * alpha * fade * fx[1])
                sp.fx = busy = True
                continue
            if getattr(sp, "fx", False):                 # booted: its own picture back
                sp.layer.picture(sp.img, x, y, a * alpha * fade)
                sp.fx = False
                continue
            sp.layer.place(x, y, a * alpha * fade)
        if boot is not None:
            if boot.done(t):
                self.boot = None
            busy = True
        return busy

    def lean(self, sp, rot, scale, t, ox, oy, force=False):
        """The window's picture leaned and grown as the cockpit is (drawn again only when it changed enough, and not
        too often: moving it is cheap, drawing it is not)."""
        r0, s0, _, t0 = sp.shown
        if not force and (t - t0 < TURN_EVERY or (abs(rot - r0) < TURN_STEP[0] and abs(scale - s0) < TURN_STEP[1])):
            return
        img = sp.img
        if abs(rot) > 1e-4:
            img = img.rotate(-math.degrees(rot), Image.BICUBIC, expand=True)
        if abs(scale - 1) > 1e-3:
            img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.BICUBIC)
        sp.shown = (rot, scale, img.size, t)
        x, y = sp.layer.at[:2] if sp.layer.at else (ox + sp.pos[0], oy + sp.pos[1])
        sp.layer.picture(img, x, y, sp.layer.alpha_now())

    def render_canvas(self, items, scale=1.0):
        """Without Pillow (as up to v0.9.0): every piece on the canvas, tilted point by point.
        items: [(key, model, x_percent, y_percent, colour, shape, place, group)]. Redraws only when something changed."""
        items = [it for it in items if seen_in(it[7] if len(it) > 7 else "front", self.gui)]
        key = repr((items, scale, self.geo, self.turn_text, self.theme, self.bg))
        if key == self.key:
            return
        self.key = key
        cv = self.cv
        cv.delete("all")
        self._tx = {}
        self._photos = []
        W = self.top.winfo_width() or self.top.winfo_screenwidth()
        H = self.top.winfo_height() or self.top.winfo_screenheight()
        if self.backdrop is not None:
            cv.create_image(0, 0, image=self.backdrop, anchor="nw", tags="backdrop")
        S = max(0.6, H / BASE_H) * scale * (1.12 if self.theme == "game" else 1.0)     # the game's letters read a little larger
        self.W, self.H = W, H
        self._cursor = {}                                   # how far down each plane is filled already
        for k, m, xp, yp, col, *rest in items:
            shape = rest[0] if rest else FLAT
            place = rest[1] if len(rest) > 1 else None      # None: where you put it; ("top", y) or ("plane", name)
            if m:
                x, y = (0, 0) if place else (round(W * xp / 100), round(H * yp / 100))
                if place and place[0] == "top":
                    y = round(H * place[1])
                before = set(cv.find_all())
                try:
                    if self.theme == "game":
                        {"chip": self.g_chip, "banner": self.g_banner}.get(m.get("kind"), self.g_card)(m, x, y, S, col)
                    else:
                        {"chip": self.chip, "banner": self.banner}.get(m.get("kind"), self.card)(m, x, y, S, col)
                except Exception as e:                  # one card that fails is left out; the others are still drawn
                    for i in set(cv.find_all()) - before:
                        cv.delete(i)
                    why = f"{k}: {type(e).__name__}: {e}"
                    if why not in self._failed:         # into EDMC's log once, with where it happened
                        self._failed.add(why)
                        self.log.exception(f"GRAVITAS HUD: the {k} window could not be drawn: {e} | model: {m!r}")
                    continue
                new = set(cv.find_all()) - before
                for i in new:
                    cv.addtag_withtag("w" + k, i)          # every piece of a card carries its window's name
                b = cv.bbox(*new) if new else None
                if b and m.get("title") not in ("GRAVITAS",):
                    ow, oh = self.sizes.get(k, (0, 0))
                    self.sizes[k] = (max(ow, b[2] - b[0]), max(oh, b[3] - b[1]))     # the largest it has been
                if place and place[0] == "top" and b:         # in the middle at the top, flat
                    cv.move("w" + k, round(W / 2 - (b[0] + b[2]) / 2), 0)
                elif place and place[0] == "plane" and b:
                    self.on_plane(new, b, place[1], W, H, k)
                elif shape and tuple(shape) != FLAT:
                    self.reshape(new, x, y, shape, k)
        self._keep_inside()
        self.base = {i: (cv.type(i), cv.coords(i)) for i in cv.find_all()}
        self.applied = None
        self.follow(force=True)

    def follow(self, force=False):
        """The cards stay on the cockpit: every piece goes where the cockpit's move takes it (turned and shifted as the
        cockpit is), texts upright. When the cockpit is out of sight, the cards hide."""
        if Image is not None:
            if self.lost != self._was_lost:
                self._was_lost = self.lost
                if not self.lost:                        # the cockpit found again: the windows show softly
                    self.found[None] = time.perf_counter()
                    self.animate()
            return self.arrange()
        cv = self.cv
        if not self.base:
            return
        hidden = "hidden" if self.lost else "normal"
        if force or hidden != getattr(self, "_state", "normal"):
            cv.itemconfigure("all", state=hidden)
            self._state = hidden
        m = self.move
        key = None if m is None else (round(m.tx, 1), round(m.ty, 1), round(m.rot, 4), round(m.scale, 4))
        if not force and key == self.applied:
            return
        self.applied = key
        cx, cy = self.W / 2, self.H / 2
        for i, (kind, pts) in self.base.items():
            if kind == "image":
                continue                        # (tests only: the picture of the game behind the cards)
            if m is None:
                out = pts
            elif kind == "text":
                out = m.at(pts[0], pts[1], cx, cy)
            else:
                out = []
                for j in range(0, len(pts) - 1, 2):
                    out += m.at(pts[j], pts[j + 1], cx, cy)
            try:
                cv.coords(i, *out)
            except tk.TclError:
                pass

    def reshape(self, ids, x0, y0, shape, k=""):
        """Tilt a card to sit along one of the game's panels: turned by an angle, one side taller than the other
        (perspective), wider or narrower, taller or shorter. Every point of every shape moves; texts move, turn
        with the line they sit on and grow or shrink with it (Tk cannot bend letters)."""
        cv = self.cv
        b = cv.bbox(*ids) if ids else None
        if not b:
            return
        ang, per, sx, sy = shape
        Wc, Hc = max(1, b[2] - x0), max(1, b[3] - y0)
        sx, sy, p = sx / 100, sy / 100, per / 100
        c, s_ = math.cos(math.radians(ang)), math.sin(math.radians(ang))

        def T(px, py):
            k = 1 + p * ((px - x0) / Wc - 0.5)         # p > 0: the right side taller (nearer), p < 0: the left
            u, v = (px - x0) * sx, ((py - y0) - Hc / 2) * k * sy + Hc * sy / 2
            return x0 + u * c - v * s_, y0 + u * s_ + v * c

        if Image is not None:                           # one smooth picture, bent to where its corners go
            self.warp(ids, b, [T(b[0], b[1]), T(b[2], b[1]), T(b[2], b[3]), T(b[0], b[3])], k)
        else:
            self.map_items(ids, T)

    def on_plane(self, ids, b, name, W, H, k=""):
        """A window on one of the game's panels (planes.py): placed after the windows already on that plane, then
        every point of it carried onto the plane in its perspective."""
        q = planes.plane(name, W, H)
        Wp, Hp = planes.size(q)
        cw, ch = b[2] - b[0], b[3] - b[1]
        du, dv = cw / Wp, ch / Hp
        u0, v0 = planes.SLOTS[name]
        if u0 is None:                                  # on the right of its plane, or on the left of the right panel
            u0 = 1.0 - du if name == "info" else -du - 0.03
        v = self._cursor.get(name, v0)
        self._cursor[name] = v + dv + planes.GAP
        unit = planes.homography([(0, 0), (1, 0), (1, 1), (0, 1)], q)
        dst = [planes.apply(unit, uu, vv) for uu, vv in ((u0, v), (u0 + du, v), (u0 + du, v + dv), (u0, v + dv))]
        if Image is not None:                           # one smooth picture in the panel's perspective, letters too
            self.warp(ids, b, dst, k)
            return
        h = planes.homography([(b[0], b[1]), (b[2], b[1]), (b[2], b[3]), (b[0], b[3])], dst)
        if h:
            self.map_items(ids, lambda px, py: planes.apply(h, px, py))

    # ---- a window as one picture (Pillow), bent in perspective: as the game draws its panels (v0.9.0)
    def pil_font(self, family, weight, px):
        files = {(GAME_FONT, "normal"): "GravitasHud-Regular.ttf", (GAME_FONT, "bold"): "GravitasHud-Bold.ttf",
                 (GAME_WIDE, "normal"): "GravitasHudWide-Regular.ttf", (GAME_WIDE, "bold"): "GravitasHudWide-Regular.ttf"}
        key = (family, weight, max(6, round(px)))
        if key not in self._pil_fonts:
            name = files.get((family, weight))
            paths = [os.path.join(FONT_DIR, name)] if name else []
            win = os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Fonts")
            paths += [os.path.join(win, "bahnschrift.ttf"), os.path.join(win, "segoeuib.ttf" if weight == "bold" else "segoeui.ttf"),
                      os.path.join(FONT_DIR, "GravitasHud-Bold.ttf" if weight == "bold" else "GravitasHud-Regular.ttf")]
            font = None
            for p in paths:
                try:
                    font = ImageFont.truetype(p, key[2])
                    break
                except Exception:
                    continue
            self._pil_fonts[key] = font or ImageFont.load_default()
        return self._pil_fonts[key]

    def warp(self, ids, b, dst, k=""):
        """The pieces drawn for one window, painted again as one picture (twice as fine, smooth edges), then bent so
        that its corners go to dst; the pieces give way to the picture."""
        cv, ss = self.cv, 2
        x0, y0 = b[0] - 2, b[1] - 2
        w, h = int(b[2] - x0 + 3), int(b[3] - y0 + 3)
        img = Image.new("RGBA", (w * ss, h * ss), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        P = lambda pts: [((pts[j] - x0) * ss, (pts[j + 1] - y0) * ss) for j in range(0, len(pts) - 1, 2)]
        rgba = lambda c, a=255: (*[int(c.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)], a) if c and c.startswith("#") else None
        keep = set(ids)
        for i in cv.find_all():                         # in the order they lie, bottom first
            if i not in keep:
                continue
            kind = cv.type(i)
            try:
                if kind == "polygon":
                    a = 190 if cv.itemcget(i, "stipple") else 255
                    fill, out = rgba(cv.itemcget(i, "fill"), a), rgba(cv.itemcget(i, "outline"))
                    pts = P(cv.coords(i))
                    if len(pts) >= 3:
                        d.polygon(pts, fill=fill, outline=out, width=max(1, round(float(cv.itemcget(i, "width") or 1) * ss)) if out else 0)
                elif kind == "line":
                    col = rgba(cv.itemcget(i, "fill"))
                    if col:
                        d.line(P(cv.coords(i)), fill=col, width=max(1, round(float(cv.itemcget(i, "width") or 1) * ss)))
                elif kind == "text":
                    self.pil_text(d, i, x0, y0, ss, rgba)
            except Exception as e:
                self.log.debug(f"GRAVITAS HUD: a piece left out of the picture: {e}")
        for i in ids:
            cv.delete(i)
        bx0, by0 = min(p[0] for p in dst), min(p[1] for p in dst)
        bx1, by1 = max(p[0] for p in dst), max(p[1] for p in dst)
        ox, oy, ow, oh = int(bx0), int(by0), int(bx1 - int(bx0)) + 2, int(by1 - int(by0)) + 2
        src = [(0, 0), (w * ss, 0), (w * ss, h * ss), (0, h * ss)]
        inv = planes.homography([(px - ox, py - oy) for px, py in dst], src)       # from the screen back to the picture
        if not inv or ow <= 0 or oh <= 0:
            return
        bent = img.transform((ow, oh), Image.PERSPECTIVE, inv[:8], Image.BICUBIC)
        a = bent.getchannel("A").point(lambda v: 0 if v < 40 else v)                # no faint haze round it
        bent.putalpha(a)
        photo = ImageTk.PhotoImage(bent)
        self._photos.append(photo)
        cv.create_image(ox, oy, image=photo, anchor="nw", tags=("w" + k,) if k else ())

    def pil_text(self, d, i, x0, y0, ss, rgba):
        """One text of the window, in the picture: same font file, size, colour, place and wrapping as on the canvas."""
        cv = self.cv
        col = rgba(cv.itemcget(i, "fill"))
        s = cv.itemcget(i, "text")
        if not col or not s:
            return
        size, weight, width, family = self._tx.get(i, (12, "normal", 0, None))
        font = self.pil_font(family or self.fam, weight, size * ss)
        lines = [s]
        if width:                                       # wrapped as Tk wraps it: word by word within the width
            lines, cur, room = [], "", width * ss
            for word in s.split(" "):
                t = (cur + " " + word).strip()
                if cur and font.getlength(t) > room:
                    lines.append(cur); cur = word
                else:
                    cur = t
            lines.append(cur)
        asc, desc = font.getmetrics()
        lh = asc + desc
        x, y = cv.coords(i)
        x, y = (x - x0) * ss, (y - y0) * ss
        an = cv.itemcget(i, "anchor")
        hor = "m" if an == "center" else "r" if "e" in an else "l" if "w" in an else "m"
        total = lh * len(lines)
        top = y if an.startswith("n") else y - total if an.startswith("s") else y - total / 2
        for n, line in enumerate(lines):
            d.text((x, top + n * lh), line, font=font, fill=col, anchor=hor + "a")

    def map_items(self, ids, T):
        """Every piece moved by T: shapes point by point; texts moved and grown or shrunk with the place they go to,
        upright unless asked otherwise."""
        cv = self.cv
        for i in ids:
            kind = cv.type(i)
            if kind == "text":
                px, py = cv.coords(i)
                (ax, ay), (bx, by), (vx, vy) = T(px, py), T(px + 1, py), T(px, py + 1)
                size, weight, width, family = self._tx.get(i, (12, "normal", 0, None))
                g = max(0.85, min(1.25, math.hypot(vx - ax, vy - ay)))   # taller or shorter here, kept readable
                opts = {"font": self.font(size * g, weight, family)}
                if self.turn_text:
                    opts["angle"] = -math.degrees(math.atan2(by - ay, bx - ax)) % 360
                if width:
                    opts["width"] = max(1, round(width * math.hypot(bx - ax, by - ay)))
                cv.coords(i, ax, ay)
                cv.itemconfigure(i, **opts)
            else:
                pts = cv.coords(i)
                out = []
                for j in range(0, len(pts) - 1, 2):
                    out += T(pts[j], pts[j + 1])
                cv.coords(i, *out)

    # ---- the game's own look (v0.7.0): no boxes, thin orange lines, square letters that glow, segmented bars
    def g_colours(self, col):
        return {"hi": mix(col, "#ffffff", 0.22), "txt": col, "dim": mix(col, "#000000", 0.3),
                "line": mix(col, "#000000", 0.15), "faint": mix(col, "#000000", 0.68), "glow": mix(col, "#000000", 0.8)}

    def g_text(self, x, y, s, size, colour, glow, weight="normal", anchor="nw", width=0, wide=False):
        """A text with the game's soft glow round it (a dark copy just behind it)."""
        fam = self.game_wide if wide else self.game_fam
        for dx, dy in ((1, 1), (-1, 0)):
            self.cv.addtag_withtag("gl", self.text(x + dx, y + dy, s, size, glow, weight, anchor, width, fam))
        return self.text(x, y, s, size, colour, weight, anchor, width, fam)

    def g_line(self, x1, y1, x2, y2, colour, w=1):
        return self.cv.create_line(x1, y1, x2, y2, fill=colour, width=max(1, round(w)))

    def g_head(self, x, y, W, S, title, c, badge=None):
        """A panel's head, as the game draws them: the name above a long line that starts with a slanted tab."""
        self.g_text(x + 2 * S, y, title.upper(), 11.5 * S, c["hi"], c["glow"], wide=True)
        ly = y + 21 * S
        self.cv.create_polygon(x, ly - 3 * S, x + 26 * S, ly - 3 * S, x + 22 * S, ly + 1 * S, x, ly + 1 * S, fill=c["txt"], outline="")
        self.g_line(x + 26 * S, ly - 1 * S, x + W, ly - 1 * S, c["line"], 1.6 * S)
        if badge:
            bt, tone = badge
            edge = TONES.get(tone, TONES["green"])[1]
            bw = self.font(10 * S, "bold", self.game_fam).measure(bt) + 14 * S
            self.cv.create_polygon(x + W - bw, y - 2 * S, x + W, y - 2 * S, x + W, y + 15 * S, x + W - bw, y + 15 * S, fill="", outline=edge, width=1)
            self.g_text(x + W - bw / 2, y + 6.5 * S, bt, 10 * S, edge, c["glow"], "bold", "center")
        return ly + 9 * S

    def g_bar(self, x1, x2, y, h, v, c, red="#ff3b30"):
        """A bar in segments, like the game's fuel and shield bars."""
        seg, gap = max(3, h * 1.6), max(1, h * 0.45)
        n = max(1, int((x2 - x1 + gap) // (seg + gap)))
        on = 0 if v is None else round(n * max(0.0, min(100.0, float(v))) / 100)
        fill = red if v is not None and float(v) < 25 else c["txt"]
        for i in range(n):
            a = x1 + i * (seg + gap)
            self.rect(a, y, a + seg, y + h, fill=fill if i < on else c["faint"], outline="")

    def g_ground(self, first, S, c):
        """SrvSurvey's ground: dark and see-through behind the panel, a thin orange line along its top and its bottom."""
        if not self.bg:
            return
        ids = [i for i in self.cv.find_all() if i >= first]
        b = self.cv.bbox(*ids) if ids else None
        if not b:
            return
        p = 9 * S
        x1, y1, x2, y2 = b[0] - p, b[1] - p, b[2] + p, b[3] + p
        g = self.rect(x1, y1, x2, y2, fill=GROUND, outline="", stipple="gray75")   # 1 dot in 4 left clear: see-through
        top = self.cv.create_line(x1 + 2, y1 + 2, x2 - 2, y1 + 2, fill=c["line"], width=max(1, round(1.4 * S)))
        bot = self.cv.create_line(x1 + 2, y2 - 2, x2 - 2, y2 - 2, fill=c["faint"], width=max(1, round(1.4 * S)))
        for i in (bot, top, g):
            self.cv.tag_lower(i, first)
            self.cv.addtag_withtag("ground", i)   # (v0.22.0: left out of where the window goes, see paint)

    def g_card(self, m, x, y, S, col):
        c = self.g_colours(col)
        first = self.cv.create_line(x, y, x, y, fill="")         # (marks where this card starts)
        W = round((460 if m.get("wide") else 400 if m.get("cols") else 330) * S)
        cy = self.g_head(x, y, W, S, m.get("title", ""), c, m.get("badge"))
        if m.get("head"):
            self.g_text(x, cy, m["head"].upper(), 17 * S, c["hi"], c["glow"], "bold", width=W); cy += 23 * S
        if m.get("head2"):
            self.g_text(x, cy, m["head2"].upper(), 11.5 * S, c["dim"], c["glow"], width=W); cy += 19 * S
        if m.get("head") or m.get("head2"):
            cy += 4 * S
        for lab, v in m.get("bars") or []:
            self.g_text(x, cy, lab, 10.5 * S, c["dim"], c["glow"], "bold")
            self.g_text(x + W, cy, "—" if v is None else f"{round(float(v))}%", 11.5 * S, c["hi"], c["glow"], "bold", "ne")
            cy += 17 * S
            self.g_bar(x, x + W, cy, max(3, round(5 * S)), v, c)
            cy += max(3, round(5 * S)) + 9 * S
        tiles = m.get("tiles") or []
        if tiles:
            n = 3 if len(tiles) > 2 else 2
            tw = W / n
            for i, (lab, val) in enumerate(tiles):
                cx, ty = x + (i % n) * tw, cy + (i // n) * 50 * S
                if i % n:
                    self.g_line(cx - 6 * S, ty + 4 * S, cx - 6 * S, ty + 40 * S, c["faint"], 1)
                self.g_text(cx, ty, val, self.fit(val, 19 * S, "bold", tw - 14 * S, self.game_fam), c["hi"], c["glow"], "bold")
                self.g_text(cx, ty + 26 * S, lab, 9.5 * S, c["dim"], c["glow"], "bold")
            cy += ((len(tiles) + n - 1) // n) * 50 * S + 4 * S
        sections = list(m.get("sections") or [])
        if m.get("rows"):
            sections.insert(0, ("", m.get("cols"), m["rows"]))
        for head, kind, rows in sections:
            if head:
                cy += 4 * S
                self.g_text(x, cy, head, 9.5 * S, c["txt"], c["glow"], wide=True)
                self.g_line(x, cy + 16 * S, x + W, cy + 16 * S, c["faint"], 1)
                cy += 22 * S
            for i, r in enumerate(rows):
                if i:
                    self.g_line(x, cy - 4 * S, x + W, cy - 4 * S, c["faint"], 1)
                if kind == "rank":
                    best = len(r) > 5 and r[5]
                    money = r[3][:1].isdigit()
                    # v0.35.0: each on one line, made a little smaller and then cut short if it is too long: a long
                    # pilot's name ran onto a second line, over the line under it (a player's 1080p screenshot)
                    vw = max(self.font((14 if money else 11) * S, "bold", self.game_fam).measure(r[3].upper()), 76 * S)
                    room = W - 22 * S - vw - 10 * S
                    self.g_text(x, cy, r[0], 13 * S, c["txt"], c["glow"], "bold")
                    t1, z1 = self.clip(r[1].upper(), 13 * S, "bold", room)
                    self.g_text(x + 22 * S, cy, t1, z1, c["hi"], c["glow"], "bold")
                    t2, z2 = self.clip(r[2].upper(), 10.5 * S, "normal", room)
                    self.g_text(x + 22 * S, cy + 18 * S, t2, z2, c["dim"], c["glow"])
                    self.g_text(x + W, cy + 2 * S, r[3].upper(), (14 if money else 11) * S, c["hi"] if best else c["txt"], c["glow"], "bold", "ne")
                    if money:
                        self.g_text(x + W, cy + 20 * S, "CR" + ("  · BEST" if best else ""), 9.5 * S, c["dim"], c["glow"], anchor="ne")
                    sh, h = r[4] if len(r) > 4 and r[4] else (None, None)
                    if sh is not None:
                        bw, bx = 76 * S, x + W - 76 * S
                        self.g_bar(bx, bx + bw, cy + 36 * S, max(2, round(3 * S)), sh, dict(c, txt="#5aa9ff"))
                        self.g_bar(bx, bx + bw, cy + 41 * S, max(2, round(3 * S)), h, c)
                        cy += 8 * S
                    cy += 40 * S
                else:
                    t1, z1 = self.clip(r[1].upper(), 13 * S, "bold", W - self.font(14 * S, "bold", self.game_fam).measure(r[0]) - 14 * S)
                    self.g_text(x, cy, t1, z1, c["hi"], c["glow"], "bold")
                    b = self.cv.bbox(self.g_text(x, cy + 18 * S, r[2].upper(), 10.5 * S, c["dim"], c["glow"], width=W * 0.6))
                    self.g_text(x + W, cy + 6 * S, r[0], 14 * S, c["txt"], c["glow"], "bold", "ne")
                    cy = max(cy + 40 * S, (b[3] if b else 0) + 8 * S)
        if m.get("note"):
            t = self.g_text(x, cy + 2 * S, m["note"].upper(), 9.5 * S, c["dim"], c["glow"], width=W)
            b = self.cv.bbox(t)
            cy += (b[3] - b[1] if b else 14 * S) + 4 * S
        if m.get("count"):                       # v0.26.0: "closes in 7 s": the seconds counting down, in a colour apart
            # one line in one font and size, as the note above; only the number bold and in its own colour, the words
            # placed by the font's own widths (v0.26.0: a larger number, placed by its glow's box, ran over "IN")
            before, n, after = m["count"]
            size = 10 * S
            fn, fb = self.font(size, "normal", self.game_fam), self.font(size, "bold", self.game_fam)
            t1, t2, t3 = before.upper(), str(n), after.upper()
            yy, gap = cy + 2 * S, 0.45 * size       # (a space of its own: a trailing space is not measured alike)
            self.g_text(x, yy, t1, size, c["dim"], c["glow"])
            x2 = x + fn.measure(t1) + gap
            self.g_text(x2, yy, t2, size, count_colour(col), c["glow"], "bold")
            self.g_text(x2 + fb.measure(t2) + gap, yy, t3, size, c["dim"], c["glow"])
            cy += fn.metrics("linespace") + 4 * S
        self.g_line(x, cy + 2 * S, x + W * 0.35, cy + 2 * S, c["faint"], 1)     # the panel's short closing line
        self.g_ground(first, S, c)

    def g_chip(self, m, x, y, S, col):
        """Like the game's INFO label: the word in a thin frame, what it means beside it."""
        first = self.cv.create_line(x, y, x, y, fill="")
        self._g_chip(m, x, y, S, col)
        edge = TONES.get(m.get("tone"), TONES["red"])[1]
        self.g_ground(first, S, {"line": mix(edge, "#000000", 0.2), "faint": mix(edge, "#000000", 0.65)})

    def _g_chip(self, m, x, y, S, col):
        bg, edge, fg = TONES.get(m.get("tone"), TONES["red"])
        glow = mix(edge, "#000000", 0.8)
        f1, f2 = 14 * S, 12.5 * S
        t = m["text"].upper()
        w1 = self.font(f1, "bold", self.game_wide).measure(t)
        pad, h = 9 * S, 28 * S
        self.cv.create_polygon(x, y, x + w1 + pad * 2, y, x + w1 + pad * 2, y + h, x, y + h, fill="", outline=edge, width=max(1, round(1.4 * S)))
        self.g_text(x + pad, y + h / 2, t, f1, edge, glow, "bold", "w", wide=True)
        sub = m.get("sub", "").upper()
        if sub:
            self.g_text(x + w1 + pad * 3, y + h / 2, sub, f2, mix(edge, "#ffffff", 0.25), glow, "normal", "w")
            sw = self.font(f2, "normal", self.game_fam).measure(sub)
            self.g_line(x + w1 + pad * 2, y + h, x + w1 + pad * 3 + sw, y + h, mix(edge, "#000000", 0.4), 1.2 * S)

    def g_banner(self, m, x, y, S, col):
        """The fight has started: COMBAT in the game's wide letters between two lines."""
        red = "#ff3b30"
        glow = mix(red, "#000000", 0.78)
        big = " ".join(m.get("text", "COMBAT"))
        f1, f2 = 44 * S, 13 * S
        w = max(self.font(f1, "bold", self.game_wide).measure(big), self.font(f2, "normal", self.game_fam).measure(m.get("sub", ""))) + 40 * S
        self.g_line(x, y, x + w, y, red, 2 * S)
        self.cv.create_polygon(x, y, x + 40 * S, y, x + 34 * S, y + 6 * S, x, y + 6 * S, fill=red, outline="")
        self.g_text(x + w / 2, y + 12 * S, " ".join("GRAVITAS"), 10 * S, mix(red, "#ffffff", 0.3), glow, "normal", "n", wide=True)
        self.g_text(x + w / 2, y + 28 * S, big, f1, red, glow, "bold", "n", wide=True)
        self.g_text(x + w / 2, y + 90 * S, m.get("sub", "").upper(), f2, mix(red, "#ffffff", 0.3), glow, "normal", "n")
        self.g_line(x, y + 112 * S, x + w, y + 112 * S, mix(red, "#000000", 0.35), 1.4 * S)

    def rrect(self, x1, y1, x2, y2, r, **kw):
        """A rectangle with round corners."""
        r = min(r, (x2 - x1) / 2, (y2 - y1) / 2)
        pts = [x1 + r, y1, x2 - r, y1, x2, y1, x2, y1 + r, x2, y2 - r, x2, y2, x2 - r, y2, x1 + r, y2, x1, y2, x1, y2 - r, x1, y1 + r, x1, y1]
        return self.cv.create_polygon(pts, smooth=True, splinesteps=12, **kw)

    def _keep_inside(self):
        """A card that would go past the edge of the game window is moved back inside, whole."""
        cv, m = self.cv, 6
        for tag in {t for i in cv.find_all() for t in cv.gettags(i) if t.startswith("w")}:
            b = cv.bbox(tag)
            if not b:
                continue
            dx = min(0, self.W - m - b[2]) or max(0, m - b[0])
            dy = min(0, self.H - m - b[3]) or max(0, m - b[1])
            if dx or dy:
                cv.move(tag, dx, dy)

    def fit(self, s, size, weight, room, family=None):
        """The largest size (down to 60 %) at which s fits in room."""
        sz = size
        while sz > size * 0.6 and self.font(sz, weight, family).measure(s) > room:
            sz -= 1
        return sz

    def clip(self, s, size, weight, room):
        """v0.35.0: one line in room: down to 85 % of its size, then cut short with "…"."""
        fam = self.game_fam
        sz = max(self.fit(s, size, weight, room, fam), size * 0.85)
        f = self.font(sz, weight, fam)
        if f.measure(s) <= room:
            return s, sz
        while s and f.measure(s.rstrip(" ·") + "…") > room:
            s = s[:-1]
        return s.rstrip(" ·") + "…", sz

    def text(self, x, y, s, size, colour, weight="normal", anchor="nw", width=0, family=None):
        # a width (a distance, unlike x and y) must be whole pixels: the Tk in EDMC 6 refuses "342.27" (v0.2.2)
        i = self.cv.create_text(x, y, text=s, font=self.font(size, weight, family), fill=colour, anchor=anchor, width=max(1, round(width)) if width else None)
        self._tx[i] = (size, weight, width, family)
        return i

    def rect(self, x1, y1, x2, y2, **kw):
        """A plain rectangle, as a polygon so that a tilted card can turn it (v0.4.0)."""
        return self.cv.create_polygon(x1, y1, x2, y1, x2, y2, x1, y2, **kw)

    def chip(self, m, x, y, S, col):
        bg, edge, fg = TONES.get(m.get("tone"), TONES["red"])
        f1, f2 = 15 * S, 13 * S
        t = f"●  {m['text']}"
        w1 = self.font(f1, "bold").measure(t)
        w2 = self.font(f2).measure(m.get("sub", ""))
        pad, h = 16 * S, 38 * S
        w = w1 + w2 + pad * 3
        self.rrect(x, y, x + w, y + h, h / 2, fill=bg, outline=edge, width=max(1, round(1.5 * S)))
        self.text(x + pad, y + h / 2, t, f1, edge, "bold", "w")
        self.text(x + pad * 2 + w1, y + h / 2, m.get("sub", ""), f2, fg, "normal", "w")

    def banner(self, m, x, y, S, col):
        """The fight has started: a big COMBAT, like the site's intro, for a few seconds."""
        red, glow = "#ff3b4e", "#3a0a12"
        big = " ".join(m.get("text", "COMBAT"))
        f1, f2 = 46 * S, 14 * S
        w = max(self.font(f1, "bold").measure(big), self.font(f2).measure(m.get("sub", ""))) + 64 * S
        h = 112 * S
        self.rrect(x, y, x + w, y + h, 10 * S, fill=glow, outline=red, width=max(2, round(2 * S)))
        self.rect(x, y + 14 * S, x + 5 * S, y + h - 14 * S, fill=red, outline="")
        self.text(x + w / 2, y + 14 * S, " ".join("GRAVITAS"), 11 * S, mix(red, "#ffffff", 0.35), "bold", "n")
        self.text(x + w / 2, y + 30 * S, big, f1, red, "bold", "n")
        self.text(x + w / 2, y + h - 12 * S, m.get("sub", ""), f2, "#ffd6da", "normal", "s")

    def card(self, m, x, y, S, col):
        light, dim = mix(col, "#ffffff", 0.72), mix(mix(col, "#ffffff", 0.5), PANEL, 0.35)
        W = round((460 if m.get("wide") else 400 if m.get("cols") else 330) * S)
        pad, gap = 14 * S, 6 * S
        panel = self.rrect(x, y, x + W, y + 40 * S, 8 * S, fill=PANEL, outline=mix(col, PANEL, 0.55), width=max(1, round(S)))
        accent = self.rect(x, y + 8 * S, x + 3 * S, y + 32 * S, fill=col, outline="")
        cy = y + pad * 0.9
        self.text(x + pad, cy, " ".join(m.get("title", "")), 11 * S, col, "bold")
        if m.get("badge"):                          # SHIELDS HELD / SHIELDS FELL 2× / SHIP LOST, top right
            bt, tone = m["badge"]
            bg, edge, _ = TONES.get(tone, TONES["green"])
            bw = self.font(10 * S, "bold").measure(bt) + 16 * S
            self.rrect(x + W - pad - bw, cy - 3 * S, x + W - pad, cy + 17 * S, 4 * S, fill=bg, outline=edge, width=1)
            self.text(x + W - pad - bw / 2, cy + 7 * S, bt, 10 * S, edge, "bold", "center")
        cy += 20 * S
        if m.get("head"):
            self.text(x + pad, cy, m["head"], 17 * S, light, "bold", width=W - pad * 2); cy += 23 * S
        if m.get("head2"):
            self.text(x + pad, cy, m["head2"], 12.5 * S, dim, width=W - pad * 2); cy += 19 * S
        if m.get("head") or m.get("head2"):
            cy += gap
        for lab, v in m.get("bars") or []:
            self.text(x + pad, cy, lab, 10.5 * S, dim, "bold")
            self.text(x + W - pad, cy, "—" if v is None else f"{round(float(v))}%", 11.5 * S, light, "bold", "ne")
            cy += 17 * S
            self.bar(x + pad, x + W - pad, cy, max(3, round(5 * S)), v, col)
            cy += max(3, round(5 * S)) + 10 * S
        tiles = m.get("tiles") or []
        if tiles:
            n = 3 if len(tiles) > 2 else 2
            tw = (W - pad * 2 - gap * (n - 1)) / n
            for i, (lab, val) in enumerate(tiles):
                cx, ty = x + pad + (i % n) * (tw + gap), cy + (i // n) * 56 * S
                self.rrect(cx, ty, cx + tw, ty + 50 * S, 5 * S, fill=mix(PANEL, col, 0.08), outline="")
                self.text(cx + 9 * S, ty + 6 * S, val, self.fit(val, 18 * S, "bold", tw - 16 * S), light, "bold")
                self.text(cx + 9 * S, ty + 31 * S, lab, self.fit(lab, 9.5 * S, "bold", tw - 14 * S), dim, "bold")
            cy += ((len(tiles) + n - 1) // n) * 56 * S + 4 * S
        sections = list(m.get("sections") or [])
        if m.get("rows"):
            sections.insert(0, ("", m.get("cols"), m["rows"]))
        for head, kind, rows in sections:
            if head:
                cy += 4 * S
                self.text(x + pad, cy, " ".join(head), 9.5 * S, col, "bold")
                cy += 18 * S
            for i, r in enumerate(rows):
                if i:
                    self.cv.create_line(x + pad, cy - 4 * S, x + W - pad, cy - 4 * S, fill=mix(col, PANEL, 0.8))
                if kind == "rank":                  # 1  Naraya  Fer-de-Lance · CMDR      1,198,100 cr  + shield/hull
                    best = len(r) > 5 and r[5]
                    self.text(x + pad, cy, r[0], 13 * S, col, "bold")
                    self.text(x + pad + 22 * S, cy, r[1], 13.5 * S, light, "bold", width=W * 0.5)
                    self.text(x + pad + 22 * S, cy + 18 * S, r[2], 11.5 * S, dim, width=W * 0.55)
                    money = r[3][:1].isdigit()
                    self.text(x + W - pad, cy + 2 * S, r[3], (14 if money else 11.5) * S, col if best or not money else light, "bold", "ne")
                    if money:
                        self.text(x + W - pad, cy + 20 * S, "cr" + ("  · best" if best else ""), 10 * S, dim, "normal", "ne")
                    sh, h = r[4] if len(r) > 4 and r[4] else (None, None)
                    if sh is not None:              # shields and hull at your last lock, as two thin bars
                        bw, bx = 70 * S, x + W - pad - 70 * S
                        self.bar(bx, bx + bw, cy + 36 * S, max(2, round(3 * S)), sh, "#5aa9ff")
                        self.bar(bx, bx + bw, cy + 41 * S, max(2, round(3 * S)), h, col)
                        cy += 8 * S
                    cy += 40 * S
                else:                               # +412,000  Vex Morrow · Fer-de-Lance · solo
                    self.text(x + pad, cy, r[1], 13.5 * S, light, "bold", width=W * 0.6)
                    b = self.cv.bbox(self.text(x + pad, cy + 18 * S, r[2], 11.5 * S, dim, width=W * 0.6))
                    self.text(x + W - pad, cy + 6 * S, r[0], 14 * S, col, "bold", "ne")
                    cy = max(cy + 40 * S, (b[3] if b else 0) + 8 * S)      # a long second line wraps: the row grows
        if m.get("note"):
            t = self.text(x + pad, cy + 2 * S, m["note"], 10.5 * S, dim, width=W - pad * 2)
            b = self.cv.bbox(t)
            cy += (b[3] - b[1] if b else 14 * S) + 4 * S
        h = cy - y + pad * 0.7
        self.cv.delete(panel)
        p = self.rrect(x, y, x + W, y + h, 8 * S, fill=PANEL, outline=mix(col, PANEL, 0.55), width=max(1, round(S)))
        self.cv.tag_lower(p)
        if self.backdrop is not None:
            self.cv.tag_lower("backdrop")
        self.cv.coords(accent, x, y + 10 * S, x + 3 * S, y + 10 * S, x + 3 * S, y + h - 10 * S, x, y + h - 10 * S)
        self.cv.tag_raise(accent)

    def bar(self, x1, x2, y, h, v, col):
        """A bar from 0 to 100 %, red under 25 %; an empty track when it is not known."""
        self.rect(x1, y, x2, y + h, fill=TRACK, outline="")
        if v is not None:
            fv = max(0.0, min(100.0, float(v)))
            if fv > 0:
                self.rect(x1, y, x1 + (x2 - x1) * fv / 100, y + h, fill="#ff4d5e" if fv < 25 else col, outline="")
