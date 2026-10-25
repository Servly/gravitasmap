"""Combat Mode's windows on the HUD: the same view the site's combat screen shows (the engine's cbViewOf),
laid out as cards. No numbers are worked out again here: only which ones go where.

A card model: {"kind": "chip"|"card", "title", "head", "head2", "bars": [(label, 0..100|None)],
"rows": [[cells]], "cols": column layout name, "tiles": [(label, value)], "note"}.
"""
import time

# window key, its name in the settings, default place (percent of the game window: x, y)
WINDOWS = [
    ("status", "Status (Hostiles near / In combat / Fight over)", 40.0, 4.0),
    ("target", "Target", 2.0, 14.0),
    ("targets", "Targets by value", 2.0, 34.0),
    ("feed", "Kill feed", 78.0, 14.0),
    ("fight", "This fight", 78.0, 40.0),
    ("speed", "Takedown speed", 78.0, 58.0),
]
REPORT_S = 60          # after a fight: its totals stay on the Status chip this long


def num(n):
    try:
        return f"{round(float(n)):,}"
    except (TypeError, ValueError):
        return "0"


def dur(ms):
    s = max(0, round((ms or 0) / 1000))
    m = s // 60
    return f"{m // 60} h {m % 60} min" if m >= 60 else f"{m}:{s % 60:02d}"


def model(key, v, now_ms):
    """The card of one window for the view v, or None (nothing to show)."""
    if not v:
        return None
    ep, on, soft = v.get("ep") or {}, bool(v.get("on")), bool(v.get("soft"))
    op = v.get("op") or {}
    if key == "status":
        if on and soft:
            return {"kind": "chip", "tone": "amber", "text": "HOSTILES NEAR", "sub": "no fire yet"}
        if on:
            ph = f"  ·  PHASE {ep.get('phase', 1)}" if ep.get("op") else ""
            return {"kind": "chip", "tone": "red", "text": "IN COMBAT",
                    "sub": f"{ep.get('n', 0)} kills  ·  {num(ep.get('cr'))} cr  ·  {dur(now_ms - (ep.get('t0') or now_ms))}{ph}"}
        if now_ms - (ep.get("t1") or 0) < REPORT_S * 1000:
            name = op.get("name") or ep.get("sys") or ""
            return {"kind": "chip", "tone": "green", "text": "FIGHT OVER",
                    "sub": f"{(name + '  ·  ') if name else ''}{ep.get('n', 0)} kills  ·  {num(ep.get('cr'))} cr  ·  {dur((ep.get('t1') or 0) - (ep.get('t0') or 0))}"}
        return None
    if not on:
        return None
    if key == "target":
        t = v.get("tg")
        if not t:
            return None
        m = {"kind": "card", "title": "TARGET", "head": t.get("pilot") or "Unknown pilot",
             "head2": " · ".join(x for x in (t.get("ship"), t.get("rank")) if x),
             "bars": [("SHIELD", t.get("sh")), ("HULL", t.get("hull"))], "note": "as of your last lock"}
        if t.get("sub"):
            m["bars"].append((str(t["sub"]).upper()[:22], t.get("subH")))
        return m
    if key == "targets":
        pri = ep.get("pri") or []
        if not pri:
            return None
        rows = [[str(i + 1), p.get("p", ""), p.get("s", "") + (" · clean" if p.get("l") else " · CMDR" if p.get("c") else ""), num(p.get("b"))] for i, p in enumerate(pri[:6])]
        return {"kind": "card", "title": "TARGETS BY VALUE", "cols": "rank", "rows": rows}
    if soft:
        return None
    if key == "feed":
        ks = [k for k in (ep.get("kills") or []) if not k.get("bond")][:6]
        if not ks:
            return None
        rows = [["+" + num(k.get("cr")), k.get("pilot", ""), (k.get("ship", "") + (f" · with {k['shared']}" if k.get("shared") else " · solo"))] for k in ks]
        return {"kind": "card", "title": "KILL FEED", "cols": "feed", "rows": rows}
    if key == "fight":
        seen = max(ep.get("seenN") or 0, ep.get("n") or 0)
        tiles = [("KILLS", f"{ep.get('n', 0)}" + (f"/{seen}" if seen else "")), ("CREDITS", num(ep.get("cr"))), ("TIME", dur(now_ms - (ep.get("t0") or now_ms))),
                 ("WAVES OF FIRE", str(ep.get("attacks", 0))), ("HEAT", str(ep.get("heat", 0))), ("SHIELDS FELL", f"{ep.get('shDown', 0)}×")]
        return {"kind": "card", "title": "THIS FIGHT", "tiles": tiles, "note": f"of ~{seen} enemies seen" if seen else ""}
    if key == "speed":
        if not ep.get("ttkAvg"):
            return None
        f = ep.get("ttkFast") or {}
        return {"kind": "card", "title": "TAKEDOWN SPEED", "tiles": [("AVERAGE", dur(ep["ttkAvg"])), ("FASTEST", dur(f.get("ms")) if f else "-")],
                "note": " · ".join(x for x in (f.get("pilot"), f.get("ship")) if x) if f else ""}
    return None


def sample(now_ms):
    """What the windows look like in a fight: for Preview in the settings (made-up pilots)."""
    return {"on": True, "soft": 0, "op": {"name": "Preview"},
            "tg": {"pilot": "Ada Kell", "ship": "Viper Mk III", "rank": "Elite", "sh": 0, "hull": 64, "sub": "Frame Shift Drive", "subH": 41},
            "ep": {"n": 3, "cr": 1_234_000, "t0": now_ms - 133_000, "t1": now_ms, "phase": 2, "op": True, "seenN": 7, "attacks": 4, "heat": 1, "shDown": 1,
                   "ttkAvg": 34_000, "ttkFast": {"ms": 12_000, "pilot": "Vex Morrow", "ship": "Fer-de-Lance"},
                   "pri": [{"p": "Naraya", "s": "Fer-de-Lance", "b": 1_198_100}, {"p": "Neil Bond", "s": "Python Mk II", "b": 975_800}, {"p": "General Curse", "s": "Anaconda", "b": 881_600},
                           {"p": "Rho Tann", "s": "Corsair", "b": 250_000}, {"p": "Officer Lane", "s": "Viper Mk IV", "b": 0, "l": 1}],
                   "kills": [{"pilot": "Vex Morrow", "ship": "Fer-de-Lance", "cr": 412_000, "shared": 2}, {"pilot": "Brian Boru", "ship": "Cobra Mk IV", "cr": 159_984, "shared": 0},
                             {"pilot": "Mark Cross", "ship": "Cobra Mk V", "cr": 271_300, "shared": 1}]}}


def now_ms():
    return int(time.time() * 1000)
