"""Drawing on top of the game, through an overlay plugin for EDMC.

EDMCModernOverlay (recommended: fullscreen too) and the original EDMCOverlay share one small API:
send_message(id, text, colour, x, y, ttl, size) and send_shape(id, "rect", colour, fill, x, y, w, h, ttl).
Coordinates are on the overlay's own virtual screen (the overlay scales it to the game window).
Every line is sent with a short time to live, so if EDMC or this plugin stops, the overlay clears itself.
"""
LINE_H = {"normal": 18, "large": 26}
TTL = 4


def find_overlay():
    """The overlay module, or None (and a short reason)."""
    for path in ("EDMCOverlay", "edmcoverlay"):
        try:
            mod = __import__(path, fromlist=["edmcoverlay"])
            return getattr(mod, "edmcoverlay", mod), ""
        except Exception:
            continue
    return None, "no overlay plugin found: install EDMCModernOverlay"


class Overlay:
    def __init__(self, logger):
        self.log = logger
        self.mod, self.why = find_overlay()
        self.client = None
        self.drawn = {}                              # window -> how many lines it drew last time

    @property
    def ok(self):
        return self.mod is not None

    def _c(self):
        if self.client is None and self.mod is not None:
            try:
                self.client = self.mod.Overlay()
            except Exception as e:
                self.why = f"the overlay did not answer: {e}"
                self.client = None
        return self.client

    def window(self, key, lines, x, y, colour, size="normal", bg=False):
        """One window: a list of lines (the first is its title). Lines it drew before and no longer has are cleared."""
        c = self._c()
        if c is None:
            return
        h = LINE_H.get(size, 18)
        try:
            if bg and lines:
                w = max(len(s) for s in lines) * (8 if size == "normal" else 11) + 16
                c.send_shape(f"gravitas-{key}-bg", "rect", "#00000000", "#000000a0", x - 8, y - 4, w, h * len(lines) + 8, TTL)
            for i, s in enumerate(lines):
                c.send_message(f"gravitas-{key}-{i}", s, colour, x, y + i * h, ttl=TTL, size=size)
            for i in range(len(lines), self.drawn.get(key, 0)):
                c.send_message(f"gravitas-{key}-{i}", "", colour, x, y + i * h, ttl=1, size=size)
            if not lines and self.drawn.get(key):
                c.send_shape(f"gravitas-{key}-bg", "rect", "#00000000", "#00000000", 0, 0, 0, 0, 1)
            self.drawn[key] = len(lines)
        except Exception as e:                       # the overlay went away: try again next second
            self.log.debug(f"GRAVITAS overlay: {e}")
            self.client = None

    def clear(self):
        for k in list(self.drawn):
            self.window(k, [], 0, 0, "#000000")
