"""Makes the saved copy of Sol (saved/sol.full.json and saved/sol.lite.json) from Spansh's own dump.

It runs BY ITSELF at every build (tools/build.py, so also in deploy.bat and deploy_app.bat) when the copy is older than a day. It never breaks a
build: if Spansh does not answer, or the dump does not look like Sol, or Node is missing, the old copy stays and a warning is printed.
By hand:  python tools/refresh_sol.py   (always downloads again)

The site sends these files ONLY when Spansh does not answer (functions/api/system.js). Each file has its own "stale" line, which the page
shows calmly ("Spansh is not answering right now. Showing a saved copy of Sol from 20 Nov 2026.").
The files hold Spansh's data (Sol only). They go to the site, not to the public GitHub copy (tools/github_export.py KEEP has no "saved").
"""
import datetime, json, os, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOL = "10477373803"
URL = f"https://spansh.co.uk/api/dump/{SOL}"
UA = {"User-Agent": "GRAVITAS/1.0 (+https://gravitasmap.com; free fan-made Elite Dangerous system map)", "Accept": "application/json"}
OUT = ROOT / "saved"


def age_hours():
    """How old the copy is (the older of the two files), or None when one is missing."""
    try:
        return (time.time() - min((OUT / "sol.full.json").stat().st_mtime, (OUT / "sol.lite.json").stat().st_mtime)) / 3600
    except OSError:
        return None


def refresh(max_age_hours=None, url=URL):
    """Makes the copy again unless it is younger than max_age_hours. Returns a short sentence; raises when it could not be made (the old copy is then untouched)."""
    age = age_hours()
    if max_age_hours is not None and age is not None and age < max_age_hours:
        return f"fresh ({age:.1f} h old), not downloaded again"
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
    d = json.loads(raw)
    sysd = d.get("system") if isinstance(d, dict) else None
    # a dump that is not Sol, or far too small, is never saved over the good copy
    if not sysd or str(sysd.get("id64")) != SOL or sysd.get("name") != "Sol" or len(raw) < 200_000:
        raise RuntimeError(f"this does not look like Sol's dump ({len(raw)} bytes)")
    day = datetime.datetime.now(datetime.timezone.utc).strftime("%d %b %Y").lstrip("0")
    note = f"Spansh is not answering right now. Showing a saved copy of Sol from {day}."
    with tempfile.TemporaryDirectory() as t:
        a, b = Path(t) / "in.json", Path(t) / "out.json"
        a.write_bytes(raw)
        # the lite copy is made by the site's own slimmer (lib/slim.js), so it is the same as what the page gets
        subprocess.run(["node", str(ROOT / "tools" / "slim_file.mjs"), str(a), str(b)], check=True, capture_output=True)
        lite = json.loads(b.read_text(encoding="utf-8"))
    lite = {"stale": note, "system": lite["system"]}
    full = {"stale": note, "system": sysd}
    OUT.mkdir(exist_ok=True)
    # both are written aside first and put in place together, so a failure in the middle never leaves two different dates
    tmp = {n: OUT / (n + ".new") for n in ("sol.full.json", "sol.lite.json")}
    tmp["sol.full.json"].write_text(json.dumps(full, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp["sol.lite.json"].write_text(json.dumps(lite, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for n, p in tmp.items():
        os.replace(p, OUT / n)
    return f"made: full {(OUT / 'sol.full.json').stat().st_size // 1024} KB, lite {(OUT / 'sol.lite.json').stat().st_size // 1024} KB, dated {day}"


if __name__ == "__main__":
    try:
        print(refresh())
    except Exception as e:
        sys.exit(f"not saved: {e}")
