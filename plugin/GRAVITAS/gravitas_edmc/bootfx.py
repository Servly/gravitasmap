"""The windows come on as a hologram does (v0.18.0, CMDR Hongark: "a nice effect, fit for a space game").

When the cockpit's HUD shows (the game loaded, in the ship) or Preview is turned on, each window boots up in turn,
one after another (STAGGER apart, from the top of the screen down):
  1. a thin bright line opens from the window's middle, as a beam
  2. the window unfolds from that line, up and down, and flickers as it settles, its edges bright
  3. one scan line sweeps down over it, and it is on
About half a second each. Each step is a picture made from the window's own (Pillow), only while it boots.
"""
import math

try:
    from PIL import Image, ImageDraw, ImageFilter
except ImportError:          # (no Pillow: no effect, the windows simply show)
    Image = None

BOOT_S = 0.6                 # one window's boot
STAGGER = 0.06               # the next window starts this much later
LINE_S, OPEN_S = 0.14, 0.32  # the beam, then the unfolding (the scan for the rest)
STEPS = 16                   # pictures per boot at most (made only as time comes to them)
GLOW = (255, 196, 120)       # a hot, pale version of the HUD's orange


def ease(p):
    p = max(0.0, min(1.0, p))
    return 1 - (1 - p) ** 3


def flicker(p):
    """A hologram finding its signal: unsteady at first, then still."""
    if p >= 1:
        return 1.0
    return max(0.25, min(1.0, 0.7 + 0.3 * math.sin(p * 38.0) * math.sin(p * 13.0 + 1.3) + 0.3 * p))


def beam(w, length, thick=2, alpha=255):
    """A bright line with a soft glow, length wide from the middle: a thin strip (w x 8 thick), and how far its middle
    is from its top. Only the strip is blurred (v0.18.0: blurring the whole window took 13 ms a picture)."""
    pad = thick * 4
    img = Image.new("RGBA", (w, 2 * pad), (0, 0, 0, 0))
    if length >= 1:
        d = ImageDraw.Draw(img)
        x0, x1 = w / 2 - length / 2, w / 2 + length / 2
        d.rectangle((x0, pad - thick * 3, x1, pad + thick * 3), fill=GLOW + (alpha // 5,))
        d.rectangle((x0, pad - thick, x1, pad + thick), fill=GLOW + (alpha,))
        img = img.filter(ImageFilter.GaussianBlur(1.2))
    return img, pad


def put(out, strip, y):
    """The strip laid over out with its middle at height y (clipped at the edges)."""
    s, pad = strip
    top = round(y) - pad
    if top < 0:
        s = s.crop((0, -top, s.width, s.height))
        top = 0
    if top + s.height > out.height:
        s = s.crop((0, 0, s.width, max(0, out.height - top)))
    if s.height > 0:
        out.alpha_composite(s, (0, top))


def frame(img, t, k=1.0):
    """The window's picture t seconds into its boot: (picture, alpha 0..1), or None when it is on. k: its speed (a
    panel's windows boot in about half the time, v0.20.0)."""
    t = t / k
    if Image is None or img is None or t >= BOOT_S:
        return None
    if t < 0:
        return Image.new("RGBA", (1, 1), (0, 0, 0, 0)), 0.0
    w, h = img.size
    cy = h / 2
    if t < LINE_S:                                       # 1. the beam opens
        out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        put(out, beam(w, w * ease(t / LINE_S)), cy)
        return out, 1.0
    if t < LINE_S + OPEN_S:                              # 2. it unfolds from the beam, flickering
        p = (t - LINE_S) / OPEN_S
        band = max(2, round(h * ease(p)))
        out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        top = round(cy - band / 2)
        out.paste(img.crop((0, top, w, top + band)), (0, top))
        edge = beam(w, w, 1, 200)
        put(out, edge, top)
        put(out, edge, top + band)
        return out, flicker(p)
    p = (t - LINE_S - OPEN_S) / (BOOT_S - LINE_S - OPEN_S)   # 3. one scan line down over it
    out = img.copy()
    put(out, beam(w, w, 1, round(160 * (1 - p))), h * ease(p))
    return out, 1.0


class Boot:
    """The boots under way: which window starts when, and its pictures as made so far."""

    def __init__(self, t0, order, k=1.0):
        self.t0, self.k = t0, k
        # order: the windows in turn, or {window: when it starts (s after t0)} given as they are (v0.21.0)
        self.start = dict(order) if isinstance(order, dict) else {key: i * STAGGER * k for i, key in enumerate(order)}
        self.made = {}

    def done(self, now):
        return now - self.t0 > max(self.start.values(), default=0.0) + BOOT_S * self.k

    def picture(self, key, img, now):
        """(picture, alpha) for this window now, or None once it is on (or it was not there when the boot began)."""
        if key not in self.start:
            return None
        t = now - self.t0 - self.start[key]
        if t >= BOOT_S * self.k:
            return None
        step = -1 if t < 0 else int(t / (BOOT_S * self.k) * STEPS)
        got = self.made.get(key)
        if got is None or got[0] != step or got[1] is not img:
            f = frame(img, (step + 0.5) / STEPS * BOOT_S if step >= 0 else -1)
            got = self.made[key] = (step, img, f)
        return got[2]
