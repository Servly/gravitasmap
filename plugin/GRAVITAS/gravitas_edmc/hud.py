"""GRAVITAS's own overlay (the HUD): nothing else to install.

A borderless, always-on-top, see-through window that sits exactly over the game window and lets every click through
to the game. It is an ordinary window beside the game: it never touches the game's process or its graphics.
It shows only while the game is in front (and during Preview), follows the game window when it moves or resizes,
and redraws only when something on it changes.

Windows: transparency, click-through and finding the game use the Windows API through ctypes (part of Python).
Elsewhere (tests on Linux) the same drawing runs in an ordinary window.
"""
import sys
import tkinter as tk
import tkinter.font as tkfont

WIN = sys.platform == "win32"
GAME_TITLE = "Elite - Dangerous (CLIENT)"
KEY = "#010203"            # the see-through colour: never used for anything drawn
PANEL = "#0c0812"          # card background
TRACK = "#2a2232"          # empty part of a bar
ALPHA = 0.94
BASE_H = 1080              # sizes are for a 1080-line game window and scale with it
TONES = {"red": ("#3a0a12", "#ff4d5e", "#ffd6da"), "amber": ("#33240a", "#ffb84d", "#ffe7c2"), "green": ("#0b2a1a", "#3ddc84", "#d6ffe8")}

if WIN:
    import ctypes
    from ctypes import wintypes
    _u32 = ctypes.windll.user32


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
        fams = set(tkfont.families(root))
        self.fam = next((f for f in ("Bahnschrift", "Segoe UI", "DejaVu Sans", "Helvetica") if f in fams), "TkDefaultFont")
        self.shown = False
        self.geo = None
        self.key = None
        self.backdrop = None       # tests only: a picture of the game behind the cards
        self._fonts = {}
        self._clickthrough_done = False

    # ---- where: over the game window, only while it is in front
    def place(self, force_show=False, only_front=True):
        g = game_rect()
        if g is None:
            if not force_show:
                return self.hide()
            sw, sh = self.top.winfo_screenwidth(), self.top.winfo_screenheight()
            g = (0, 0, sw, sh, True)
        x, y, w, h, front = g
        if only_front and not front and not force_show:
            return self.hide()
        geo = f"{w}x{h}+{x}+{y}"
        if geo != self.geo:
            self.top.geometry(geo)
            self.geo, self.key = geo, None
        if not self.shown:
            self.top.deiconify()
            self.top.lift()
            self.shown = True
            self._clickthrough()
        return True

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
            self.top.withdraw()
            self.shown = False
        return False

    def destroy(self):
        try:
            self.top.destroy()
        except tk.TclError:
            pass

    # ---- what
    def font(self, size, weight="normal"):
        k = (size, weight)
        if k not in self._fonts:
            self._fonts[k] = tkfont.Font(family=self.fam, size=-max(8, round(size)), weight=weight)
        return self._fonts[k]

    def render(self, items, scale=1.0):
        """items: [(key, model, x_percent, y_percent, colour)]. Redraws only when something changed."""
        key = repr((items, scale, self.geo))
        if key == self.key:
            return
        self.key = key
        cv = self.cv
        cv.delete("all")
        W = self.top.winfo_width() or self.top.winfo_screenwidth()
        H = self.top.winfo_height() or self.top.winfo_screenheight()
        if self.backdrop is not None:
            cv.create_image(0, 0, image=self.backdrop, anchor="nw", tags="backdrop")
        S = max(0.6, H / BASE_H) * scale
        self.W, self.H = W, H
        for k, m, xp, yp, col in items:
            if m:
                x, y = round(W * xp / 100), round(H * yp / 100)
                before = set(cv.find_all())
                (self.chip if m.get("kind") == "chip" else self.card)(m, x, y, S, col)
                for i in set(cv.find_all()) - before:
                    cv.addtag_withtag("w" + k, i)          # every piece of a card carries its window's name
        self._keep_inside()

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

    def fit(self, s, size, weight, room):
        """The largest size (down to 60 %) at which s fits in room."""
        sz = size
        while sz > size * 0.6 and self.font(sz, weight).measure(s) > room:
            sz -= 1
        return sz

    def text(self, x, y, s, size, colour, weight="normal", anchor="nw", width=0):
        return self.cv.create_text(x, y, text=s, font=self.font(size, weight), fill=colour, anchor=anchor, width=width or None)

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

    def card(self, m, x, y, S, col):
        light, dim = mix(col, "#ffffff", 0.72), mix(mix(col, "#ffffff", 0.5), PANEL, 0.35)
        W = round((400 if m.get("cols") else 330) * S)
        pad, gap = 14 * S, 6 * S
        panel = self.rrect(x, y, x + W, y + 40 * S, 8 * S, fill=PANEL, outline=mix(col, PANEL, 0.55), width=max(1, round(S)))
        accent = self.cv.create_rectangle(x, y + 8 * S, x + 3 * S, y + 32 * S, fill=col, outline="")
        cy = y + pad * 0.9
        self.text(x + pad, cy, " ".join(m.get("title", "")), 11 * S, col, "bold")
        cy += 20 * S
        if m.get("head"):
            self.text(x + pad, cy, m["head"], 17 * S, light, "bold"); cy += 23 * S
            if m.get("head2"):
                self.text(x + pad, cy, m["head2"], 12.5 * S, dim); cy += 19 * S
            cy += gap
        for lab, v in m.get("bars") or []:
            self.text(x + pad, cy, lab, 10.5 * S, dim, "bold")
            self.text(x + W - pad, cy, "—" if v is None else f"{round(float(v))}%", 11.5 * S, light, "bold", "ne")
            cy += 17 * S
            bx1, bx2, bh = x + pad, x + W - pad, max(3, round(5 * S))
            self.cv.create_rectangle(bx1, cy, bx2, cy + bh, fill=TRACK, outline="")
            if v is not None:
                fv = max(0.0, min(100.0, float(v)))
                c = "#ff4d5e" if fv < 25 else col
                if fv > 0:
                    self.cv.create_rectangle(bx1, cy, bx1 + (bx2 - bx1) * fv / 100, cy + bh, fill=c, outline="")
            cy += bh + 10 * S
        rows, kind = m.get("rows") or [], m.get("cols")
        for i, r in enumerate(rows):
            if i:
                self.cv.create_line(x + pad, cy - 4 * S, x + W - pad, cy - 4 * S, fill=mix(col, PANEL, 0.8))
            if kind == "rank":                      # 1  Naraya  Fer-de-Lance        1,198,100
                self.text(x + pad, cy, r[0], 13 * S, col, "bold")
                self.text(x + pad + 22 * S, cy, r[1], 13.5 * S, light, "bold", width=W * 0.5)
                self.text(x + pad + 22 * S, cy + 18 * S, r[2], 11.5 * S, dim)
                self.text(x + W - pad, cy + 2 * S, r[3], 14 * S, col, "bold", "ne")
                self.text(x + W - pad, cy + 20 * S, "cr", 10 * S, dim, "normal", "ne")
                cy += 40 * S
            else:                                   # +412,000  Vex Morrow · Fer-de-Lance · solo
                self.text(x + pad, cy, r[1], 13.5 * S, light, "bold", width=W * 0.6)
                self.text(x + pad, cy + 18 * S, r[2], 11.5 * S, dim)
                self.text(x + W - pad, cy + 6 * S, r[0], 14 * S, col, "bold", "ne")
                cy += 40 * S
        tiles = m.get("tiles") or []
        if tiles:
            n = 3 if len(tiles) > 2 else 2
            tw = (W - pad * 2 - gap * (n - 1)) / n
            for i, (lab, val) in enumerate(tiles):
                cx, ty = x + pad + (i % n) * (tw + gap), cy + (i // n) * 56 * S
                self.rrect(cx, ty, cx + tw, ty + 50 * S, 5 * S, fill=mix(PANEL, col, 0.08), outline="")
                self.text(cx + 9 * S, ty + 6 * S, val, self.fit(val, 18 * S, "bold", tw - 16 * S), light, "bold")
                self.text(cx + 9 * S, ty + 31 * S, lab, 9.5 * S, dim, "bold")
            cy += ((len(tiles) + n - 1) // n) * 56 * S
        if m.get("note"):
            self.text(x + pad, cy + 2 * S, m["note"], 10.5 * S, dim)
            cy += 18 * S
        h = cy - y + pad * 0.7
        self.cv.delete(panel)
        p = self.rrect(x, y, x + W, y + h, 8 * S, fill=PANEL, outline=mix(col, PANEL, 0.55), width=max(1, round(S)))
        self.cv.tag_lower(p)
        if self.backdrop is not None:
            self.cv.tag_lower("backdrop")
        self.cv.coords(accent, x, y + 10 * S, x + 3 * S, y + h - 10 * S)
        self.cv.tag_raise(accent)
