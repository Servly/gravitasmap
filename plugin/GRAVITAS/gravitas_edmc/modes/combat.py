"""Combat Mode's windows on the overlay: the same view the site's combat screen shows, as short lines of text.

The engine gives the view (the site's cbViewOf). Here it only becomes lines: no numbers are worked out again.
"""
import time

# window key, its name in the settings, default position on the overlay's screen
WINDOWS = [
    ("status", "Status (Hostiles near / In combat / Fight over)", 500, 40),
    ("target", "Target", 20, 120),
    ("targets", "Targets by value", 20, 220),
    ("feed", "Kill feed", 960, 120),
    ("fight", "This fight", 960, 300),
    ("speed", "Takedown speed", 960, 420),
]
REPORT_S = 60          # after a fight: its totals stay on the Status line this long


def num(n):
    try:
        return f"{round(float(n)):,}"
    except (TypeError, ValueError):
        return "0"


def dur(ms):
    s = max(0, round((ms or 0) / 1000))
    m = s // 60
    return f"{m // 60} h {m % 60} min" if m >= 60 else f"{m}:{s % 60:02d}"


def pct(v):
    return "?" if v is None else f"{round(float(v))}%"


def lines(key, v, now_ms):
    """The lines of one window for the view v (None: nothing to show)."""
    if not v:
        return []
    ep, on, soft = v.get("ep") or {}, bool(v.get("on")), bool(v.get("soft"))
    op = v.get("op") or {}
    if key == "status":
        if on and soft:
            return ["● HOSTILES NEAR · no fire yet"]
        if on:
            ph = f" · PHASE {ep.get('phase', 1)}" if ep.get("op") else ""
            return [f"● IN COMBAT · {ep.get('n', 0)} kills · {num(ep.get('cr'))} cr · {dur(now_ms - (ep.get('t0') or now_ms))}{ph}"]
        if now_ms - (ep.get("t1") or 0) < REPORT_S * 1000:
            name = op.get("name") or ep.get("sys") or ""
            return [f"FIGHT OVER{(' · ' + name) if name else ''} · {ep.get('n', 0)} kills · {num(ep.get('cr'))} cr · {dur((ep.get('t1') or 0) - (ep.get('t0') or 0))}"]
        return []
    if not on:
        return []
    if key == "target":
        t = v.get("tg")
        if not t:
            return []
        out = ["TARGET", f"{t.get('pilot') or 'Unknown pilot'} · {t.get('ship', '')}{(' · ' + t['rank']) if t.get('rank') else ''}",
               f"Shield {pct(t.get('sh'))} · Hull {pct(t.get('hull'))} (last lock)"]
        if t.get("sub"):
            out.append(f"Module {t['sub']} {pct(t.get('subH'))}")
        return out
    if key == "targets":
        pri = ep.get("pri") or []
        if not pri:
            return []
        out = ["TARGETS BY VALUE"]
        for i, p in enumerate(pri[:5]):
            tag = " · clean" if p.get("l") else (" · CMDR" if p.get("c") else "")
            out.append(f"{i + 1}  {p.get('p', '')} · {p.get('s', '')} · {num(p.get('b'))} cr{tag}")
        return out
    if soft:
        return []
    if key == "feed":
        ks = [k for k in (ep.get("kills") or []) if not k.get("bond")][:5]
        if not ks:
            return []
        out = ["KILL FEED"]
        for k in ks:
            sh = f" · with {k['shared']} of the team" if k.get("shared") else " · solo"
            out.append(f"+{num(k.get('cr'))}  {k.get('pilot', '')} · {k.get('ship', '')}{sh}")
        return out
    if key == "fight":
        seen = max(ep.get("seenN") or 0, ep.get("n") or 0)
        out = ["THIS FIGHT", f"{ep.get('n', 0)} kills{(' of ~' + str(seen) + ' seen') if seen else ''} · {num(ep.get('cr'))} cr",
               f"Time {dur(now_ms - (ep.get('t0') or now_ms))} · waves of fire {ep.get('attacks', 0)} · heat warnings {ep.get('heat', 0)}"]
        if ep.get("shDown"):
            out.append(f"Shields fell {ep['shDown']}×")
        return out
    if key == "speed":
        if not ep.get("ttkAvg"):
            return []
        f = ep.get("ttkFast") or {}
        out = ["TAKEDOWN SPEED", f"Average {dur(ep['ttkAvg'])}"]
        if f:
            out.append(f"Fastest {dur(f.get('ms'))} · {f.get('pilot', '')} · {f.get('ship', '')}")
        return out
    return []


def sample(now_ms):
    """What the windows look like in a fight: for Preview in the settings (made-up pilots)."""
    return {"on": True, "soft": 0, "op": {"name": "Preview"},
            "tg": {"pilot": "Ada Kell", "ship": "Viper Mk III", "rank": "Elite", "sh": 0, "hull": 64, "sub": "Frame Shift Drive", "subH": 41},
            "ep": {"n": 3, "cr": 1_234_000, "t0": now_ms - 133_000, "t1": now_ms, "phase": 2, "op": True, "seenN": 7, "attacks": 4, "heat": 1, "shDown": 1,
                   "ttkAvg": 34_000, "ttkFast": {"ms": 12_000, "pilot": "Vex Morrow", "ship": "Fer-de-Lance"},
                   "pri": [{"p": "Naraya", "s": "Fer-de-Lance", "b": 1_198_100}, {"p": "Neil Bond", "s": "Python Mk II", "b": 975_800}, {"p": "Rho Tann", "s": "Corsair", "b": 250_000}],
                   "kills": [{"pilot": "Vex Morrow", "ship": "Fer-de-Lance", "cr": 412_000, "shared": 2}, {"pilot": "Brian Boru", "ship": "Cobra Mk IV", "cr": 159_984, "shared": 0}]}}


def now_ms():
    return int(time.time() * 1000)
