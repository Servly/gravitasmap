"""Turn Canonn's open list of colliding-orbit pairs (an .xlsx from Canonn Research) into two files.

  python3 tools/canonn_import.py <canonn.xlsx> [out_dir]

1. src/assets/coll-pairs.json: the pairs only (system, the two bodies, where the system is, a few flags).
   This is all the site uses: GRAVITAS works out every time itself. Canonn is credited as the source of the list.
2. <out_dir>/coll-canonn-private.json: Canonn's own times and results, and the Observatory sightings.
   For our comparison only (the ?lab=coll page reads it from your disk). It never goes on the site or to GitHub.

Needs openpyxl (pip install openpyxl).
"""
import datetime as dt
import json
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
SOURCE = {"name": "Canonn Research", "url": "https://canonn.science", "note": "List of bodies with crossing orbits, shared openly by Canonn (LCU)."}

# flags, one bit each
F_MEAN, F_HAB, F_COLONY, F_NOTABLE, F_LAND, F_RING, F_POP, F_WEA, F_ATMO = 1, 2, 4, 8, 16, 32, 64, 128, 256
WEA = ("Water world", "Earthlike body", "Earth-like world", "Ammonia world")
SHORT = {"High metal content world": "HMC", "Metal-rich body": "Metal-rich", "Rocky body": "Rocky", "Icy body": "Icy",
         "Rocky Ice world": "Rocky ice", "Water world": "Water world", "Earthlike body": "Earth-like", "Earth-like world": "Earth-like", "Ammonia world": "Ammonia",
         "Class I gas giant": "Gas giant I", "Class II gas giant": "Gas giant II", "Class III gas giant": "Gas giant III",
         "Class IV gas giant": "Gas giant IV", "Class V gas giant": "Gas giant V", "Gas giant with water-based life": "GG water life",
         "Gas giant with ammonia-based life": "GG ammonia life", "Water giant": "Water giant", "Helium-rich gas giant": "Helium-rich GG"}


def rows(ws):
    out = [r for r in ws.iter_rows(values_only=True) if any(c is not None for c in r)]
    return out[0], out[1:]


def id64of(v):
    try:
        return int(str(v).split(".")[0])
    except (TypeError, ValueError):
        return None


def suffix(body, system):
    body, system = str(body or ""), str(system or "")
    return body[len(system):].strip() if body.lower().startswith(system.lower()) else body


def key(sysname, a, b):              # "6a" and "6 a" are the same body
    n = lambda v: str(v).lower().replace(" ", "")
    return (n(sysname), *sorted([n(a), n(b)]))


def iso(v):
    if isinstance(v, dt.datetime):
        return v.replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")
    return None


def main():
    src = Path(sys.argv[1]); out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT.parent / "gravitas-private"
    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    hd, sp = rows(wb["Same Parent"])
    c = {n: i for i, n in enumerate(hd) if n}
    hab = {}; wea = set(); colony = set(); notable = set(); pop = set()
    h, hr = rows(wb["Hab Hitters"]); hi = {n: i for i, n in enumerate(h)}
    for r in hr:
        hab[key(r[hi["systemName"]], suffix(r[hi["bodyName1"]], r[hi["systemName"]]), suffix(r[hi["bodyName2"]], r[hi["systemName"]]))] = r
    for name, bag in (("WaterEarthAmmonia", wea), ("Populated", pop)):
        h, rr = rows(wb[name]); ix = {n: i for i, n in enumerate(h) if n}
        for r in rr:
            s = r[ix["system.name"]]; bag.add(key(s, suffix(r[ix["body.name"]], s), suffix(r[ix["candidate.name"]], s)))
    _, rr = rows(wb["Colonisation Targets"])
    for r in rr:
        if r[0] and r[1]:
            colony.add(key(r[0], suffix(r[1], r[0]), suffix(r[2], r[0])))
    _, rr = rows(wb["Notable"])
    for r in rr:
        if r[0] and r[3]:
            notable.add(key(r[0], str(r[3]).replace(".0", ""), str(r[4]).replace(".0", "")))

    types, tix = [], {}
    def t(v):
        v = SHORT.get(v, v or "?")
        if v not in tix:
            tix[v] = len(types); types.append(v)
        return tix[v]

    pub, priv, seen = [], [], set()
    for r in sp:
        s = r[c["system.name"]]; i64 = id64of(r[c["id64"]])
        if not s or i64 is None:
            continue
        a, b = suffix(r[c["body.name"]], s), suffix(r[c["candidate.name"]], s)
        k = key(s, a, b)
        if k in seen:
            continue
        seen.add(k)
        f = 0
        if r[c["mean_exists"]] == "Y": f |= F_MEAN
        if k in hab: f |= F_HAB
        if k in colony: f |= F_COLONY
        if k in notable: f |= F_NOTABLE
        if r[c["landable"]] is True: f |= F_LAND
        if r[c["ringed"]] is True: f |= F_RING
        if (r[c["population"]] or 0) > 0 or k in pop: f |= F_POP
        if r[c["body.subType"]] in WEA or r[c["candidate.subType"]] in WEA or k in wea: f |= F_WEA
        if any(str(r[c[x]] or "No atmosphere") != "No atmosphere" for x in ("body.atmosphere", "candidate.atmosphere")): f |= F_ATMO
        xyz = [round(float(r[c[q]] or 0)) for q in "xyz"]
        pub.append([i64 if i64 < 2 ** 53 else str(i64), s, a, b, *xyz, t(r[c["body.subType"]]), t(r[c["candidate.subType"]]), f])
        priv.append({"id64": str(i64), "sys": s, "a": a, "b": b, "verdict": r[c["Confirmed"]], "next": iso(r[c["Nearest Collision"]]),
                     "synodic_d": r[c["synodic period"]], "periods_d": [r[c["body.orbitalPeriod"]], r[c["candidate.orbitalPeriod"]]]})

    # pairs in "Hab Hitters" that are not in "Same Parent": a terraformable or habitable world in each pair
    for k, r in hab.items():
        if k in seen:
            continue
        seen.add(k)
        s = r[hi["systemName"]]; i64 = id64of(r[hi["id64"]])
        if i64 is None:
            continue
        a, b = suffix(r[hi["bodyName1"]], s), suffix(r[hi["bodyName2"]], s)
        f = F_HAB | (F_MEAN if len(r) > hi["hasPhaseData"] and r[hi["hasPhaseData"]] else 0)
        if k in colony: f |= F_COLONY
        if k in notable: f |= F_NOTABLE
        if r[hi["landable1"]] or r[hi["landable2"]]: f |= F_LAND
        if r[hi["ringed1"]] or r[hi["ringed2"]]: f |= F_RING
        if r[hi["systemPopulated"]]: f |= F_POP
        if r[hi["subType1"]] in WEA or r[hi["subType2"]] in WEA: f |= F_WEA
        if any(str(r[hi[x]] or "No atmosphere") not in ("No atmosphere", "None") for x in ("atmosphereType1", "atmosphereType2")): f |= F_ATMO
        xyz = [round(float(r[hi[q]] or 0)) for q in "xyz"]
        pub.append([i64 if i64 < 2 ** 53 else str(i64), s, a, b, *xyz, t(r[hi["subType1"]]), t(r[hi["subType2"]]), f])
        priv.append({"id64": str(i64), "sys": s, "a": a, "b": b, "verdict": None, "next": (r[hi["nextCollisionStart"]] if len(r) > hi["nextCollisionStart"] else None),
                     "synodic_d": r[hi["synodicPeriodDays"]], "periods_d": [r[hi["orbitalPeriodDays1"]], r[hi["orbitalPeriodDays2"]]]})

    obs = []
    _, rr = rows(wb["Observatory Data"])
    for r in rr:
        if not r[0] or not r[4]:
            continue
        m = str(r[4]).replace("Collision at ", "").replace(" UTC", "")
        try:
            est = dt.datetime.strptime(m, "%d-%b-%Y %H:%M").strftime("%Y-%m-%dT%H:%M:00Z")
        except ValueError:
            continue
        fix = lambda v: str(v).replace(".0", "") if isinstance(v, float) else str(v)
        obs.append({"sys": r[0], "a": fix(r[1]), "b": fix(r[2]), "period_d": r[3], "estimate": est, "duration": r[5],
                    "observed": r[7] if len(r) > 7 else None})

    today = dt.date.today().isoformat()
    meta = {"source": SOURCE, "imported": today, "fields": ["id64", "system", "body", "body", "x", "y", "z", "type", "type", "flags"],
            "flags": {"mean": F_MEAN, "habitable": F_HAB, "colony": F_COLONY, "notable": F_NOTABLE, "landable": F_LAND,
                      "ringed": F_RING, "populated": F_POP, "water_earth_ammonia": F_WEA, "atmosphere": F_ATMO}, "types": types}
    dst = ROOT / "src" / "assets" / "coll-pairs.json"
    dst.write_text(json.dumps({**meta, "pairs": pub}, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    out_dir.mkdir(parents=True, exist_ok=True)
    pv = out_dir / "coll-canonn-private.json"
    pv.write_text(json.dumps({"source": SOURCE, "imported": today, "pairs": priv, "observatory": obs}, ensure_ascii=False), encoding="utf-8")
    print(f"{len(pub)} pairs -> {dst} ({dst.stat().st_size // 1024} KB)")
    print(f"Canonn's times and {len(obs)} sightings -> {pv} (private: keep it out of the site and GitHub)")


if __name__ == "__main__":
    main()
