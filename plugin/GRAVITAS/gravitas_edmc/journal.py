"""v0.33.0: GRAVITAS reads the newest Journal itself, every 15 ms, as SrvSurvey does: EDMC handed each line over 0.6 s
later in the middle and up to 1.4 s at worst (measured in v0.32.0, CMDR Hongark). Read only, on this computer.

v0.34.0: EDMC is only GRAVITAS's home (its window, settings and log), not its reader. GRAVITAS finds the game's folder
itself (folder), and at the start reads the newest Journal from its first line (Tail.past): which ship, which system,
in the game or not, without EDMC.

Tail: the new lines of the newest Journal. At the start the lines already written go to Tail.past (handled as the
past: they set the scene and start nothing); a Journal that appears later (a new game) is read from its first line.
Once: every line is handled once, by whichever side brings it first: GRAVITAS's own reader or EDMC. Lines only EDMC has
(its own StartUp, what it reads before GRAVITAS has found the file) still come through EDMC.
"""
import collections
import ctypes
import glob
import json
import os
import time

FIND_S = 2.0          # the newest Journal looked for again (a new game makes a new one)
KEEP_S = 120          # a line one side brought and the other never did is forgotten after this long (v0.37.0: 120 s, EDMC was up to 34 s late as it started)
SAVED_GAMES = "{4C5C32FF-BB9D-43B0-B5B4-2D72E54EAAA4}"     # Windows' Saved Games folder (FOLDERID_SavedGames)


def saved_games():
    """Windows' own Saved Games folder (it can be moved), else the usual place."""
    try:
        from ctypes import wintypes

        class GUID(ctypes.Structure):
            _fields_ = [("a", wintypes.DWORD), ("b", wintypes.WORD), ("c", wintypes.WORD), ("d", ctypes.c_ubyte * 8)]
        g = GUID()
        ctypes.oledll.ole32.CLSIDFromString(SAVED_GAMES, ctypes.byref(g))
        out = ctypes.c_wchar_p()
        ctypes.windll.shell32.SHGetKnownFolderPath(ctypes.byref(g), 0, None, ctypes.byref(out))
        path = out.value
        ctypes.windll.ole32.CoTaskMemFree(out)
        if path:
            return path
    except Exception:
        pass
    return os.path.join(os.path.expanduser("~"), "Saved Games")


def folder(chosen=None, edmc_default=None):
    """The game's folder (Journal, Status.json): one chosen by hand in EDMC's settings, else GRAVITAS's own find,
    else EDMC's default."""
    for d in (chosen, os.path.join(saved_games(), "Frontier Developments", "Elite Dangerous"), edmc_default):
        if d and os.path.isdir(d):
            return d
    return None


class Tail:
    def __init__(self):
        self.path = None
        self.pos = 0
        self.buf = b""
        self.look = -FIND_S
        self.found = False
        self.past = None           # the lines written before GRAVITAS started (once, as it starts)

    def lines(self, folder):
        """The Journal lines written since the last call, read whole (a line half written waits)."""
        now = time.perf_counter()
        if folder and now - self.look > FIND_S:
            self.look = now
            files = glob.glob(os.path.join(folder, "Journal.*.log"))
            newest = max(files, key=os.path.getmtime) if files else None
            if newest and newest != self.path:
                first = not self.found
                self.path, self.pos, self.buf, self.found = newest, 0, b"", True
                if first:                          # (as it starts: what is there now is the past)
                    self.past = self.read(os.path.getsize(newest))
                    return []
        if not self.path:
            return []
        size = os.path.getsize(self.path)
        if size < self.pos:
            self.pos, self.buf = 0, b""
        if size == self.pos:
            return []
        return self.read(size)

    def read(self, size):
        with open(self.path, "rb") as f:
            f.seek(self.pos)
            data = f.read(size - self.pos)
        self.pos += len(data)
        parts = (self.buf + data).split(b"\n")
        self.buf = parts.pop()                     # (bytes: a letter split between two reads stays whole)
        out = []
        for p in parts:
            p = p.strip()
            if not p:
                continue
            try:
                e = json.loads(p.decode("utf-8", "replace"))
            except ValueError:
                continue
            if isinstance(e, dict):
                out.append(e)
        return out


class Once:
    """Pairs the two copies of a line by its time and event (two Bounty lines in one second count twice)."""
    def __init__(self):
        self.wait = {"ours": collections.defaultdict(collections.deque),
                     "edmc": collections.defaultdict(collections.deque)}
        self.t_clean = time.perf_counter()

    def first(self, side, entry, t):
        """True if this side brings the line first (handle it), False if the other side has handled it already."""
        k = (entry.get("timestamp"), entry.get("event"))
        other = self.wait["edmc" if side == "ours" else "ours"]
        if other.get(k):
            other[k].popleft()
            if not other[k]:
                del other[k]
            return False
        return True

    def done(self, side, entry, t):
        """This side has handled the line: the other side's copy is skipped when it comes."""
        self.wait[side][(entry.get("timestamp"), entry.get("event"))].append(t)

    def clean(self, t):
        if t - self.t_clean < 5:
            return
        self.t_clean = t
        for d in self.wait.values():
            for k in [k for k, q in d.items() if not q or t - q[-1] > KEEP_S]:
                del d[k]
