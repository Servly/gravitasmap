"""The GRAVITAS combat engine, run inside the plugin.

The engine is the site's own Combat Mode code (engine/combat-engine.js, copied from the site's 42-combat-engine.js by
tools/plugin_build.py). It runs here in QuickJS, a small JavaScript engine (lib/<platform>/_quickjs.*, from the
quickjs-ng package, MIT). Only the C part of that package is used: EDMC's Python carries few standard modules.

QuickJS must always be called from the same thread, so the engine lives on one thread of its own and every call is
handed to it through a queue. Nothing here touches the network.
"""
import json
import os
import queue
import struct
import sys
import threading

API_JS = r"""
var SYNC = { here: "", on: true };
function __feed(s, replay) { var j = JSON.parse(s); if (j.StarSystem) SYNC.here = String(j.StarSystem); if (CB_EV.test(j.event)) cbEvent(j, !!replay);
  // the plugin only: while Hostiles near is up, each new wanted ship you scan keeps it up (the site gives it 20 s in all)
  if (!replay && CB.on && CB.soft && j.event === "ShipTargeted" && j.TargetLocked && (+j.Bounty > 0 || /wanted|enemy|hunter/i.test(String(j.LegalStatus || "")))) CB.softT = Date.now();
  // the plugin only (v0.16.0): a lock lost and no other ship locked within LOST_MS: it blew up, flew off or was let go,
  // so it leaves Targets by value (a lock on another ship at once is a switch: both stay)
  if (!replay && j.event === "ShipTargeted") { var now = Date.now();
    if (!j.TargetLocked) { if (CB.target && CB.target.pilot) PEND = { k: CB.target.pilot + "|" + CB.target.ship, t: now }; }
    else PEND = null; }
  return CB.rev; }
var PEND = null, GONE = {}, CLEARED = 0, LOST_MS = 2000;
function __gone() { var now = Date.now();
  if (PEND && now - PEND.t >= LOST_MS) { GONE[PEND.k] = PEND.t; PEND = null; }
  return JSON.stringify({ gone: GONE, cleared: CLEARED }); }
function __clear() { CLEARED = Date.now(); GONE = {}; PEND = null; return 1; }
function __status(s) { cbStatus(JSON.parse(s)); return CB.rev; }
function __tick() { cbEngineTick(); return CB.rev; }
// the plugin only (v0.26.0): the game says a fight is over as soon as it is (its combat music ends, "in danger" goes);
// the site's engine waits 45 s of that calm. Here: ms of it are enough, unless in an Operation (its lulls are part of it)
function __calm(ms) {
  if (!CB.on || CB.soft || CB.remote || (CB.ep && CB.ep.op && CB.op)) return CB.rev;
  if (/^Combat/i.test(CB.music) || (CB.st && CB.st.danger && CB.st.hp)) return CB.rev;
  if (Date.now() - CB.lastHot > ms) cbEnd(0, "calm");
  return CB.rev; }
// the plugin only (v0.36.0): EDMC is closing: a fight still on is ended now, so it can be kept in Past combats
function __end() { if (CB.on && !CB.soft) cbEnd(0, "stop"); return CB.rev; }
function __view() { var v = cbLiveView(); return v ? JSON.stringify(v) : ""; }
function __here(s) { if (s) SYNC.here = String(s); return 1; }
// the plugin only (v0.4.0): the ships you scanned in the last 10 minutes, in or out of a fight (the engine keeps them in
// CB.scan and forgets them in supercruise or a jump), less the ones destroyed, and your locked target: for Targets by
// value before any shooting
function __scan() {
  var now = Date.now(), dead = {}, eps = [CB.ep, CB.report];
  for (var e = 0; e < eps.length; e++) if (eps[e]) eps[e].kills.forEach(function (k) { if (k.pilot) dead[k.pilot] = 1; });
  var L = [];
  CB.scan.forEach(function (o) { if (now - o.t < 10 * 60000 && !dead[o.pilot]) L.push({ p: o.pilot, s: o.ship, r: o.rank, b: o.bounty || 0, c: o.cmdr ? 1 : 0,
    sh: o.sh == null ? null : o.sh, h: o.h == null ? null : o.h, t: o.t, q: (o.stage || 0) >= 3 ? 1 : 0, x: CB.crit.has(o.pilot) ? 1 : 0, l: o.legal === "Clean" ? 1 : 0 }); });
  var g = CB.target && !CB.target.lost ? CB.target : null;
  return JSON.stringify({ pri: L, tg: g && { t: g.t, ship: g.ship, pilot: g.pilot, rank: g.rank, cmdr: g.cmdr, lost: 0, sub: g.sub, subH: g.subH, sh: g.sh, hull: g.hull, d: g.delta || null,
    bounty: g.bounty || 0, legal: g.legal || "" } });
}
"""


def lib_dir(plugin_dir):
    """The folder with the QuickJS engine for this EDMC (32 or 64-bit Windows, or Linux)."""
    bits = struct.calcsize("P") * 8
    if sys.platform == "win32":
        sub = "win32" if bits == 32 else "win_amd64"
    elif sys.platform.startswith("linux"):
        sub = "linux_x86_64"
    else:
        sub = ""
    return os.path.join(plugin_dir, "lib", sub) if sub else ""


class Engine:
    def __init__(self, plugin_dir, logger):
        self.dir, self.log = plugin_dir, logger
        self.q = queue.Queue()
        self.ok = False
        self.error = ""
        self.version = ""
        self._ready = threading.Event()
        self._t = threading.Thread(target=self._run, name="GRAVITAS-engine", daemon=True)
        self._t.start()
        self._ready.wait(10)
        if not self._ready.is_set():
            self.error = "the engine did not start in 10 seconds"

    def _run(self):
        try:
            d = lib_dir(self.dir)
            if not d or not os.path.isdir(d):
                raise RuntimeError(f"no engine for this system ({sys.platform}, {struct.calcsize('P') * 8}-bit)")
            if hasattr(os, "add_dll_directory"):
                try:
                    os.add_dll_directory(d)          # (a helper DLL placed next to the engine is found there)
                except OSError:
                    pass
            if d not in sys.path:
                sys.path.insert(0, d)
            import _quickjs                          # noqa: E402  the C engine
            ctx = _quickjs.Context()
            ctx.set_memory_limit(64 * 1024 * 1024)
            ctx.set_max_stack_size(1024 * 1024)
            src = open(os.path.join(self.dir, "engine", "combat-engine.js"), encoding="utf-8").read()
            ctx.eval(src + "\n" + API_JS)
            try:
                self.version = open(os.path.join(self.dir, "engine", "VERSION"), encoding="utf-8").read().strip()
            except OSError:
                self.version = "?"
            fns = {n: ctx.get(n) for n in ("__feed", "__status", "__tick", "__view", "__here", "__scan", "__gone", "__clear", "__calm", "__end")}
            self.ok = True
            self.log.info(f"GRAVITAS engine ready (combat engine {self.version}, QuickJS from {d})")
        except Exception as e:                       # the plugin says why, in EDMC and in its log
            self.error = self._why(e)
            self.log.error(f"GRAVITAS engine could not start: {self.error}")
            self._ready.set()
            return
        self._ready.set()
        while True:
            item = self.q.get()
            if item is None:
                return
            name, args, box, done = item
            try:
                box.append(fns[name](*args))
            except Exception as e:
                box.append(None)
                self.log.warning(f"GRAVITAS engine: {name} failed: {e}")
            done.set()

    @staticmethod
    def _why(e):
        s = str(e)
        if "DLL load failed" in s or "python3.dll" in s:
            return ("Windows could not load the engine (" + s + "). EDMC may be missing python3.dll. "
                    "Please report this with Report a problem on gravitasmap.com.")
        return s

    def call(self, name, *args, timeout=2.0):
        if not self.ok:
            return None
        box, done = [], threading.Event()
        self.q.put((name, args, box, done))
        return box[0] if done.wait(timeout) and box else None

    def feed(self, entry, replay):
        return self.call("__feed", json.dumps(entry, separators=(",", ":")), bool(replay))

    def status(self, entry):
        return self.call("__status", json.dumps(entry, separators=(",", ":")))

    def tick(self):
        return self.call("__tick")

    def end(self):
        """v0.36.0: a fight still on ended at once (EDMC closing)."""
        return self.call("__end")

    def calm(self, ms):
        """v0.26.0: the fight over after ms of the game's own calm (no combat music, not in danger)."""
        return self.call("__calm", int(ms))

    def here(self, system):
        return self.call("__here", system or "")

    def view(self):
        s = self.call("__view")
        try:
            return json.loads(s) if s else None
        except ValueError:
            return None

    def scan(self):
        """Out of a fight too: {"pri": [the ships scanned], "tg": the locked target or None}."""
        s = self.call("__scan")
        try:
            return json.loads(s) if s else {}
        except ValueError:
            return {}

    def gone(self):
        """The ships whose lock was lost ({"pilot|ship": when, ms}) and when the list was last cleared (ms)."""
        s = self.call("__gone")
        try:
            return json.loads(s) if s else {}
        except ValueError:
            return {}

    def clear(self):
        """Targets by value cleared (Ctrl+Shift+F10): a ship comes back when it is scanned again."""
        return self.call("__clear")

    def stop(self):
        self.q.put(None)
