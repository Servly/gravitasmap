"""Combat Mode's windows on the HUD: the same view the site's combat screen shows (the engine's cbViewOf),
laid out as cards. No numbers are worked out again here: only which ones go where.

A card model: {"kind": "chip"|"card", "title", "head", "head2", "badge": (text, tone), "bars": [(label, 0..100|None)],
"tiles": [(label, value)], "sections": [(heading, column layout, [[cells]])], "note"}.
"rows" and "cols" are the same as one section with no heading.
"""
import re
import time

# window key, its name in the settings, default place (percent of the game window: x, y)
WINDOWS = [
    ("status", "Status (Hostiles near / In combat / Fight over)", 40.0, 4.0),
    ("alert", "Interdiction (pulled, dropped, escaped)", 40.0, 9.5),
    ("target", "Target", 2.0, 14.0),
    ("targets", "Targets by value", 2.0, 40.0),
    ("feed", "Kill feed", 78.0, 14.0),
    ("fight", "This fight", 78.0, 40.0),
    ("speed", "Takedown speed", 78.0, 62.0),
    ("bounty", "Bounty counter (this game session)", 80.0, 4.0),
    ("report", "Combat report (after a fight)", 36.0, 16.0),
    ("banner", "COMBAT banner when the shooting starts (4 s)", 38.0, 26.0),
    ("shortcuts", "Keys: GRAVITAS's shortcuts as the HUD comes on (10 s)", 38.0, 30.0),    # v0.21.0
]
WINDOWS_OFF = ("status", "alert", "target", "feed", "banner")   # (v0.27.0: the combat report on too: it shows only as a fight ends)   # v0.19.0: a new CMDR starts with Targets by value, This fight, Takedown speed and the Bounty counter only
DEFAULT_WHEN = {"fight": "ext", "speed": "int", "shortcuts": "main_t"}   # beside the left and the right panel, shown while you open them)
# when a window shows: always, or only while one of the game's panels is open. The game writes which panel is open
# in Status.json (GuiFocus); the key is the game's default for that panel
WHEN = [("always", "Main panel", None),     # v0.18.0: "Always" read wrong: it shows ahead, while no panel is open
        # v0.21.0: on the main panel too, at a side of your choosing: left (under the comms panel), right (under INFO),
        # top (flat in the middle)
        ("main_l", "Main panel left", None), ("main_r", "Main panel right", None), ("main_t", "Main panel top", None),
        ("ext", "Left panel (1)", 2), ("comms", "Comms panel (2)", 3),
        ("role", "Role panel (3)", 4), ("int", "Right panel (4)", 1),
        # v0.25.0: with the role and right panels too, at a place of your choosing (as on the main panel)
        ("role_l", "Role panel (3) left", 4), ("role_t", "Role panel (3) top", 4),
        ("int_t", "Right panel (4) top", 1)]
MAPS = range(5, 12)    # GuiFocus: station services, galaxy map, system map, orrery, FSS, SAA, codex
BANNER_S = 4
COMBAT_RED = "#ff3b4e"
REPORT_S = 60          # after a fight: the report and the Status chip's totals stay this long (changed in the settings)
ALERT_S = 120          # an interdiction stays on screen this long, as on the site
KEYS_HELP = [("Ctrl+Shift+F7", "Free look the right way round"), ("Ctrl+Shift+F8", "Last combat report, on or off"), ("Ctrl+Shift+F9", "Bounty counter to 0"), ("Ctrl+Shift+F10", "Clear Targets by value"),
             ("Ctrl+Shift+F11", "Hide or show the HUD")]
KEYS_S = 10            # the Keys card stays this long as the HUD comes on
REPORT_DEMO_S = 10     # (Preview: the report's countdown shows this)
DEFAULT_ORDER = ["Fer-de-Lance", "Corsair", "Python Mk II"]
RANKS = ["Harmless", "Mostly Harmless", "Novice", "Competent", "Expert", "Master", "Dangerous", "Deadly", "Elite",
         "Elite I", "Elite II", "Elite III", "Elite IV", "Elite V"]
# the interdiction's stages, as the site names them (CB_INT in 42-combat.js): heading, what it means, chip tone
INTD = {"pulling": ("INTERDICTION", "being pulled out of supercruise", "amber"),
        "dropped": ("INTERDICTED", "you were pulled out", "red"),
        "submitted": ("SUBMITTED", "you dropped out", "amber"),
        "escaped": ("ESCAPED", "you got away", "green"),
        "you interdicted": ("YOU INTERDICTED", "you pulled them out", "red")}


def num(n):
    try:
        return f"{round(float(n)):,}"
    except (TypeError, ValueError):
        return "0"


def dur(ms):
    s = max(0, round((ms or 0) / 1000))
    m = s // 60
    return f"{m // 60} h {m % 60} min" if m >= 60 else f"{m}:{s % 60:02d}"


def where(v):
    """Operation, system and site, as on the site (cbWhere)."""
    ep, op = v.get("ep") or {}, v.get("op") or {}
    return " · ".join(x for x in (op.get("name"), op.get("sys") or ep.get("sys"), op.get("site") or ep.get("site")) if x)


def per_min(n, ms):
    return f"{n / (ms / 60000):.1f}" if ms and ms > 60000 else "—"


def result(ep):
    """How the fight ended for your ship: the badge on the report."""
    if ep.get("died"):
        return "SHIP LOST", "red"
    if ep.get("shDown"):
        return f"SHIELDS FELL {ep['shDown']}×", "amber"
    return "SHIELDS HELD", "green"


def kind_of(x):
    """v0.35.0: a ship with a bounty 0, one still being scanned 1, scanned with no bounty 2, clean (firing on it is a
    crime: security, traders) 3, always last."""
    if x.get("l"):
        return 3
    if x.get("b"):
        return 0
    return 2 if x.get("q") else 1


def sort_targets(pri, opts):
    """Targets by value, or by your own ship order and then by value (cbPriSort). v0.35.0: a clean ship goes to the end,
    and among the same value (or none yet) the ship you locked last comes first: a ship joins the list at the top of
    its kind, not under the others (players' feedback)."""
    a = list(pri)
    newest = lambda x: -(x.get("t") or 0)
    if (opts or {}).get("sort") == "s":
        order = [str(o).lower() for o in (opts or {}).get("order") or []]
        at = lambda x: order.index(str(x.get("s") or "").lower()) if str(x.get("s") or "").lower() in order else 99
        a.sort(key=lambda x: (x.get("l") or 0, at(x), kind_of(x), -(x.get("b") or 0), newest(x)))
    else:
        a.sort(key=lambda x: (kind_of(x), -(x.get("b") or 0), newest(x)))
    return a


def drop_lost(pri, opts):
    """Targets by value without the ships whose lock was lost (v0.16.0) or that were there when the list was cleared
    (Ctrl+Shift+F10): a ship locked again after that is back."""
    g = (opts or {}).get("gone") or {}
    lost, cleared = g.get("gone") or {}, g.get("cleared") or 0
    if not lost and not cleared:
        return list(pri)
    def keep(x):
        t = x.get("t") or 0
        return t > cleared and t > lost.get(f"{x.get('p', '')}|{x.get('s', '')}", -1)
    return [x for x in pri if keep(x)]


def bounty(b):
    """The Bounty counter: what the ships you destroyed this game session paid, and how many."""
    b = b or {}
    tiles = [("THIS FIGHT", num(b.get("cr")) + " cr"), ("KILLS", str(b.get("n", 0)))]
    # v0.37.0: what you can claim, from every Journal since your last death (claims.py): at least that much (the game
    # adds bonuses it writes nowhere); per faction under it, as the game's Claims panel lists them
    claim = b.get("claim")
    tiles.append(("TO CLAIM, AT LEAST", (num(claim[0]) + " cr") if claim else "reading…"))   # (no "≥": not in the game's font)
    note = "Ctrl+Shift+F9: this fight back to 0, to claim kept"     # (v0.26.0: back to 0 as each fight's report comes)
    if b.get("bonds") is not None:
        note = f"bounties {num(b.get('bounties'))} cr · bonds {num(b.get('bonds'))} cr · " + note
    held = [f"cashed in {num(b['cashed'])} cr" if b.get("cashed") else "", f"lost at death {num(b['lost'])} cr" if b.get("lost") else ""]
    if any(held):
        note = " · ".join(x for x in held if x) + " · " + note
    if claim and claim[1]:                         # (the F9 hint makes way: it is on the Keys card)
        note = " · ".join([f"{f or 'unnamed'} {millions(v)}" for f, v in claim[1][:3]] + [x for x in held if x])
    return {"kind": "card", "title": "BOUNTY COUNTER", "tiles": tiles, "note": note}


def millions(v):
    return f"{v / 1e6:.1f}M" if v >= 1e6 else f"{v / 1e3:.0f}k"


def kill_row(k):
    if k.get("bond"):
        return ["+" + num(k.get("cr")), k.get("fac") or "Combat bond", k.get("ship", "Combat bond")]
    sub = [k.get("ship", ""), k.get("rank", ""), f"with {k['shared']}" if k.get("shared") else "solo",
           f"down in {dur(k['ttk'])}" if (k.get("ttk") or 0) > 1000 else ""]
    return ["+" + num(k.get("cr")), k.get("pilot", ""), " · ".join(x for x in sub if x)]


def report(v, now_ms):
    """The combat report: the site's report card (cbCard and cbReportText) as one HUD card."""
    ep = v.get("ep") or {}
    n, ms = ep.get("n", 0), max(0, (ep.get("t1") or 0) - (ep.get("t0") or 0))
    seen = max(ep.get("seenN") or 0, n)
    head2 = " · ".join(x for x in (where(v), f"{ep['phases']} phases" if (ep.get("phases") or 0) > 1 else "") if x)
    tiles = [("KILLS", f"{n}/{seen}" if seen else str(n)), ("CREDITS", num(ep.get("cr"))), ("TIME", dur(ms)),
             ("KILLS / MIN", per_min(n, ms)), ("WAVES OF FIRE", str(ep.get("attacks", 0))), ("HEAT", str(ep.get("heat", 0)))]
    top = sorted((k for k in ep.get("kills") or [] if not k.get("bond")), key=lambda k: -(k.get("cr") or 0))[:5]
    sections = [("TOP KILLS", "feed", [kill_row(k) for k in top] or [["", "No kills this time", ""]])]
    bonds = [k for k in ep.get("kills") or [] if k.get("bond")]
    if bonds:
        sections.append(("BONDS", "feed", [["+" + num(ep.get("bonds")), f"{len(bonds)} bond{'s' if len(bonds) > 1 else ''}", ", ".join(sorted({k.get('fac') for k in bonds if k.get('fac')}))[:60]]]))
    away = [x for x in ep.get("pri") or [] if not x.get("l")][:4]
    if away:
        sections.append(("NOT IN YOUR KILLS", "feed", [[num(x.get("b")) if x.get("b") else "", x.get("p", ""), x.get("s", "")] for x in away]))
    notes = []
    if ep.get("ttkAvg"):
        f = ep.get("ttkFast") or {}
        notes.append(f"average takedown {dur(ep['ttkAvg'])}" + (f", fastest {dur(f.get('ms'))}" if f else ""))
    r = v.get("rank") or {}
    if r.get("p") is not None and r.get("p0") is not None and r["p"] > r["p0"]:
        notes.append(f"combat rank +{r['p'] - r['p0']}%")
    if v.get("team"):
        notes.append(f"{ep.get('shN', 0)} of {n} kills shared with the team")
    return {"kind": "card", "wide": True, "title": "COMBAT REPORT", "head": "CMDR " + v["cmdr"] if v.get("cmdr") else "Your last fight",
            "head2": head2, "badge": result(ep), "tiles": tiles, "sections": sections, "note": " · ".join(notes)}


def model(key, v, now_ms, opts=None):
    """The card of one window for the view v (None out of a fight with no report), or None (nothing to show).
    opts: {"sort": "v"|"s", "order": [ship types], "report_s": seconds, "banner": bool,
    "scan": the ships scanned out of a fight, "tg": the locked target out of a fight, "always": the HUD stays up,
    "gone": the ships whose lock was lost and when the list was cleared, "bounty": the Bounty counter}."""
    opts = opts or {}
    v = v or {}
    always = bool(opts.get("always"))
    ep, on, soft = v.get("ep") or {}, bool(v.get("on")), bool(v.get("soft"))
    op = v.get("op") or {}
    report_ms = (opts.get("report_s") or REPORT_S) * 1000
    fresh_report = not on and (v.get("past") or now_ms - (ep.get("t1") or 0) < report_ms)
    if key == "status":
        if on and soft:
            return {"kind": "chip", "tone": "amber", "text": "HOSTILES NEAR", "sub": "no fire yet"}
        if on:
            ph = f"  ·  PHASE {ep.get('phase', 1)}" if ep.get("op") else ""
            return {"kind": "chip", "tone": "red", "text": "IN COMBAT",
                    "sub": f"{ep.get('n', 0)} kills  ·  {num(ep.get('cr'))} cr  ·  {dur(now_ms - (ep.get('t0') or now_ms))}{ph}"}
        name = op.get("name") or ep.get("sys") or ""
        totals = f"{(name + '  ·  ') if name else ''}{ep.get('n', 0)} kills  ·  {num(ep.get('cr'))} cr  ·  {dur((ep.get('t1') or 0) - (ep.get('t0') or 0))}"
        if fresh_report and not v.get("past"):
            return {"kind": "chip", "tone": "red" if ep.get("died") else "green", "text": "SHIP LOST" if ep.get("died") else "FIGHT OVER", "sub": totals}
        if always:                                  # the HUD stays up: a quiet chip between fights
            return {"kind": "chip", "tone": "grey", "text": "STANDBY", "sub": ("last fight  ·  " + totals) if ep.get("t0") else "no fight yet"}
        return None
    if key == "shortcuts":                      # v0.21.0: the shortcuts, for 10 s as the HUD comes on
        if not opts.get("keys_on"):
            return None
        return {"kind": "card", "title": "GRAVITAS KEYS", "head2": "while the game is in front or not",
                "sections": [("", "feed", [[k, what, ""] for k, what in KEYS_HELP])],
                "count": ("this card goes in", opts.get("keys_left") or 0, "s")}
    if key == "bounty":                         # the whole game session, in a fight or not
        return bounty(opts.get("bounty"))
    if key == "report":
        # v0.26.0: only as a fight with shooting ends (live, this session), or asked for with Ctrl+Shift+F8; never
        # from an old fight as the game starts. It counts down to its going (Ctrl+Shift+F8 sends it at once)
        if not opts.get("report_on") or not ep.get("t0"):
            return None
        m = report(v, now_ms)
        m["count"] = ("closes in", opts.get("report_left") or 0, "s · Ctrl+Shift+F8 to close it now")
        return m
    if key == "banner":
        if not (opts.get("banner") and on and not soft):
            return None
        return {"kind": "banner", "text": "COMBAT", "sub": " · ".join(x for x in ("the shooting has started", where(v)) if x)}
    if key == "target":
        t = v.get("tg") if on else opts.get("tg")
        if not on and t and not (always or t.get("bounty") or re.search("wanted|enemy|hunter", t.get("legal") or "", re.I)):
            t = None                                # out of a fight: only a wanted ship, unless the HUD stays up
        if not t:
            return None
        rank = t.get("rank") or ""
        m = {"kind": "card", "title": "TARGET", "head": t.get("pilot") or t.get("ship") or "Unknown pilot",
             "head2": " · ".join(x for x in (t.get("ship") if t.get("pilot") else "", rank, "CMDR" if t.get("cmdr") else "") if x)
             or "not scanned yet: hold the lock to see the pilot",
             "bars": [("SHIELD", t.get("sh")), ("HULL", t.get("hull"))]}
        if t.get("sub"):
            m["bars"].append((str(t["sub"]).upper()[:22], t.get("subH")))
        d = t.get("d")
        nosub = "" if t.get("sub") else " · no module targeted: target its FSD to see its health"
        if t.get("lost"):
            m["note"] = "lock lost · as of your last lock" + nosub
        elif d and d.get("dt"):
            sh, h = d.get("sh") or 0, d.get("h") or 0
            sign = lambda x: f"{'−' if x > 0 else '+' if x < 0 else ''}{abs(round(x))}%"
            m["note"] = f"since your lock {dur(d['dt'])} ago: shield {sign(sh)} · hull {sign(h)} · {(max(0, sh) + max(0, h)) / (d['dt'] / 1000):.1f} %/s" + nosub
        else:
            m["note"] = "as of your last lock · lock it again to see how fast it comes down" + nosub
        return m
    if key == "targets":
        # in a fight the engine's list; before any shooting, every ship you scanned (v0.4.0: lock them all, pick the best)
        pri = sort_targets(drop_lost((ep.get("pri") or []) if on else (opts.get("scan") or []), opts), opts)
        gone = [x for x in ep.get("tgts") or [] if x.get("k")][:4] if on else []    # the site's "Ships this fight"
        if not pri and not gone:
            return None
        top = next((x for x in pri if x.get("b")), None)
        rows = []
        n = max(1, int(opts.get("rows") or 6))           # v0.21.0: how many, as set in the Targets tab
        for i, p in enumerate(pri[:n]):
            # v0.18.0: the pilot's combat rank beside the ship (Elite, Deadly, Dangerous, Master...), as the game scans it
            flags = [p.get("s", ""), p.get("r", "")] + [f for f, on_ in (("CMDR", p.get("c")), ("clean: firing is a crime", p.get("l")), ("critically hit", p.get("x"))) if on_]
            value = num(p.get("b")) if p.get("b") else ("no bounty" if p.get("q") else "scanning")
            # v0.35.0: the ship's type on top (the bright line), the pilot under it (players' feedback)
            flags[0] = p.get("p", "") if p.get("s") else ""
            rows.append([str(i + 1), p.get("s") or p.get("p", ""), " · ".join(f for f in flags if f), value, (p.get("sh"), p.get("h")), p is top])
        alive = (f"{len(pri)} {'alive' if on else 'scanned'} · {num(sum(x.get('b') or 0 for x in pri))} cr on the field" if pri
                 else 'Cycle "next hostile": every ship you scan lands here, the most valuable first')
        sections = [("SHIPS THIS FIGHT", "feed", [["destroyed", x.get("s") or x.get("p", ""), " · ".join(y for y in ((x.get("p") if x.get("s") else ""), x.get("r")) if y)] for x in gone])] if gone else []
        return {"kind": "card", "title": "TARGETS BY VALUE" if opts.get("sort") != "s" else "TARGETS BY SHIP ORDER", "head2": alive,
                "cols": "rank", "rows": rows, "sections": sections, "note": f"+{len(pri) - n} more" if len(pri) > n else ""}
    # v0.26.0: This fight and Takedown speed show the last fight between fights (always: they are kept, never cleared);
    # the kill feed too while the HUD stays up
    last = not on and ep.get("t0") and (key in ("fight", "speed") or (always and key == "feed"))
    if not on and not last:
        return None
    if key == "alert":
        i = ep.get("intd")
        if not i or now_ms - (i.get("t") or 0) >= ALERT_S * 1000:
            return None
        head, what, tone = INTD.get(i.get("st"), ("INTERDICTION", "", "amber"))
        who = i.get("who") or ""
        by = ("" if i.get("st") == "you interdicted" else "from " if i.get("st") == "escaped" else "by ") + who if who else ""
        return {"kind": "chip", "tone": tone, "text": head,
                "sub": "  ·  ".join(x for x in (by + (" (a player)" if i.get("player") else ""), what, dur(now_ms - i["t"]) + " ago") if x)}
    if soft:
        return None
    m = last_fight(key, ep, now_ms) if last else None
    if last:
        return m
    if key == "feed":
        ks = (ep.get("kills") or [])[:6]
        if not ks:
            return None
        return {"kind": "card", "title": "KILL FEED", "cols": "feed", "rows": [kill_row(k) for k in ks]}
    if key == "fight":
        seen = max(ep.get("seenN") or 0, ep.get("n") or 0)
        ms = now_ms - (ep.get("t0") or now_ms)
        tiles = [("KILLS", f"{ep.get('n', 0)}" + (f"/{seen}" if seen else "")), ("CREDITS", num(ep.get("cr"))), ("TIME", dur(ms)),
                 ("KILLS / MIN", per_min(ep.get("n", 0), ms)), ("WAVES OF FIRE", str(ep.get("attacks", 0))), ("SHIELDS FELL", f"{ep.get('shDown', 0)}×")]
        big = ep.get("big")
        note = [f"of about {seen} enemies seen" if seen else "", f"biggest: {big.get('pilot')} · {num(big.get('cr'))} cr" if big else ""]
        return {"kind": "card", "title": "THIS FIGHT", "tiles": tiles, "note": " · ".join(x for x in note if x)}
    if key == "speed":
        if not ep.get("ttkAvg"):
            return None
        f = ep.get("ttkFast") or {}
        tiles = [("AVERAGE", dur(ep["ttkAvg"])), ("FASTEST", dur(f.get("ms")) if f else "-")]
        if ep.get("shRate") is not None:
            tiles.append(("SHIELDS %/S", f"{ep['shRate']:.1f}"))
        if ep.get("hRate") is not None:
            tiles.append(("HULL %/S", f"{ep['hRate']:.1f}"))
        return {"kind": "card", "title": "TAKEDOWN SPEED", "tiles": tiles,
                "note": " · ".join(x for x in (f.get("pilot"), f.get("ship")) if x) if f else ""}
    return None


def last_fight(key, ep, now_ms):
    """Between fights, when the HUD stays up: the last fight's kills, totals and takedown speed."""
    v = {"on": True, "ep": dict(ep, t0=ep.get("t0"), t1=ep.get("t1"))}
    m = model(key, v, (ep.get("t1") or now_ms), {})
    if m:
        m["title"] = "LAST FIGHT" if key == "fight" else m.get("title", "") + "  ·  LAST FIGHT"
    return m


def placeholder(key):
    """When the HUD stays up and a window has nothing yet: its frame, so it can be seen and placed."""
    what = {"target": "lock a ship", "targets": 'cycle "next hostile": every ship you scan lands here',
            "feed": "your kills land here", "fight": "the fight's totals", "speed": "how fast you bring them down"}
    # (v0.26.0: no empty frame for the combat report: it shows only as a fight ends, or with Ctrl+Shift+F8)
    if key not in what:
        return None
    name = next((n for k, n, *_ in WINDOWS if k == key), key).split(" (")[0].upper()
    return {"kind": "card", "title": name, "note": what[key]}


def report_text(v):
    """The report as text for Discord: the site's Copy text (cbReportText), with the kills under it."""
    ep = v.get("ep") or {}
    n, ms, k = ep.get("n", 0), max(0, (ep.get("t1") or 0) - (ep.get("t0") or 0)), ep.get("big")
    w = where(v)
    seen = max(ep.get("seenN") or 0, n)
    phases = (ep.get("phases") or 0) > 1 and f" · {ep['phases']} phases" or ""
    seen_s = ep.get("seenN") and f" of about {seen} enemies seen" or ""
    bonds = ep.get("bonds") and f" (bonds {num(ep['bonds'])})" or ""
    end = "ship lost" if ep.get("died") else f"shields fell {ep['shDown']}x" if ep.get("shDown") else "shields held"
    lines = [f"GRAVITAS combat report{' · ' + w if w else ''}",
             f"{dur(ms)}{phases} · {n} kills{seen_s} · {num(ep.get('cr'))} cr{bonds} · {end}"]
    if k:
        lines.append(f"Top: {k.get('pilot')} ({k.get('ship')}{', ' + k['rank'] if k.get('rank') else ''}) {num(k.get('cr'))} cr")
    if ep.get("ttkAvg"):
        f = ep.get("ttkFast")
        lines.append(f"Average takedown {dur(ep['ttkAvg'])}{', fastest ' + dur(f.get('ms')) if f else ''}")
    lines.append("gravitasmap.com")
    return "\n".join(lines)


def report_details(v):
    """Everything in a past report, as text for the Past combats window."""
    ep = v.get("ep") or {}
    out = [report_text(v), ""]
    kills = ep.get("kills") or []
    if kills:
        out.append("Kills")
        out += [f"  {'+' + num(k.get('cr')):>12}  {(k.get('pilot') or k.get('fac') or 'Bond')}{' (' + k['rank'] + ')' if k.get('rank') else ''} · {k.get('ship', '')}"
                f"{' · with ' + str(k['shared']) if k.get('shared') else ''}{' · down in ' + dur(k['ttk']) if (k.get('ttk') or 0) > 1000 else ''}" for k in kills]
        out.append("")
    away = [x for x in ep.get("pri") or [] if not x.get("l")]
    if away:
        out.append("Not in your kills (they escaped, or someone else finished them)")
        out += [f"  {x.get('p', '')} · {x.get('s', '')}{' · ' + num(x.get('b')) + ' cr' if x.get('b') else ''}" for x in away]
        out.append("")
    if v.get("team"):
        out.append("Team: " + ", ".join(v["team"]) + f" · {ep.get('shN', 0)} of {ep.get('n', 0)} kills shared")
    if ep.get("ff"):
        out.append(f"Friendly fire recorded by the game: {ep['ff']}×")
    if ep.get("intd"):
        i = ep["intd"]
        out.append(f"Interdiction: {INTD.get(i.get('st'), ('?',))[0].lower()}{' · ' + i['who'] if i.get('who') else ''}")
    return "\n".join(out).strip()


def sample(now_ms):
    """What the windows look like in a fight: for Preview in the settings (made-up pilots)."""
    return {"on": True, "soft": 0, "op": {"name": "Preview"},
            "tg": {"pilot": "Ada Kell", "ship": "Viper Mk III", "rank": "Elite", "sh": 0, "hull": 64, "sub": "Frame Shift Drive", "subH": 41,
                   "d": {"dt": 12_000, "sh": 40, "h": 20}},
            "ep": {"n": 3, "cr": 1_234_000, "t0": now_ms - 133_000, "t1": now_ms, "phase": 2, "op": True, "seenN": 7, "attacks": 4, "heat": 1, "shDown": 1,
                   "ttkAvg": 34_000, "ttkFast": {"ms": 12_000, "pilot": "Vex Morrow", "ship": "Fer-de-Lance"}, "shRate": 3.4, "hRate": 1.9,
                   "big": {"pilot": "Vex Morrow", "cr": 412_000},
                   "intd": {"t": now_ms - 20_000, "st": "dropped", "who": "Naraya", "player": False},
                   "pri": [{"p": "Naraya", "s": "Fer-de-Lance", "r": "Deadly", "b": 1_198_100, "sh": 0, "h": 62, "q": 1},
                           {"p": "Neil Bond", "s": "Python Mk II", "r": "Elite", "b": 975_800, "sh": 100, "h": 100, "q": 1},
                           {"p": "General Curse", "s": "Anaconda", "b": 881_600, "sh": 55, "h": 100, "q": 1, "x": 1},
                           {"p": "CMDR Rho Tann", "s": "Corsair", "b": 250_000, "c": 1, "q": 1},
                           {"p": "Officer Lane", "s": "Viper Mk IV", "b": 0, "l": 1, "q": 1}],
                   "kills": [{"pilot": "Vex Morrow", "ship": "Fer-de-Lance", "cr": 412_000, "shared": 2}, {"pilot": "Brian Boru", "ship": "Cobra Mk IV", "cr": 159_984, "shared": 0},
                             {"pilot": "Mark Cross", "ship": "Cobra Mk V", "cr": 271_300, "shared": 1}]}}


SAMPLE_BOUNTY = {"cr": 2_871_400, "n": 14, "bounties": 2_871_400, "kills": 14, "bonds": None, "bond_n": 0,
                 "unclaimed": 6_402_150, "cashed": 21_824_739, "lost": 0,
                 "claim": (5_300_000, [("Federal Navy", 4_200_000), ("Pilots' Federation", 1_100_000)])}    # Preview


def sample_report(now_ms):
    """A finished fight, for Preview: the report window."""
    v = sample(now_ms)
    v["on"], v["past"], v["cmdr"] = False, True, "Hongark"
    v["ep"]["pri"] = v["ep"]["pri"][1:3]
    return v


def now_ms():
    return int(time.time() * 1000)
