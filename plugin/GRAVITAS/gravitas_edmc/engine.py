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
function __feed(s, replay) { var j = JSON.parse(s); if (j.StarSystem) SYNC.here = String(j.StarSystem); if (CB_EV.test(j.event)) cbEvent(j, !!replay); return CB.rev; }
function __status(s) { cbStatus(JSON.parse(s)); return CB.rev; }
function __tick() { cbEngineTick(); return CB.rev; }
function __view() { var v = cbLiveView(); return v ? JSON.stringify(v) : ""; }
function __here(s) { if (s) SYNC.here = String(s); return 1; }
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
            fns = {n: ctx.get(n) for n in ("__feed", "__status", "__tick", "__view", "__here")}
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

    def here(self, system):
        return self.call("__here", system or "")

    def view(self):
        s = self.call("__view")
        try:
            return json.loads(s) if s else None
        except ValueError:
            return None

    def stop(self):
        self.q.put(None)
