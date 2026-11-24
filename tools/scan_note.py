#!/usr/bin/env python3
"""Writes site/gravitas-app/scan.json for the installer that site/gravitas-app/version.json offers.

Run it ONLY after the installer was really scanned (Burak scans avtest/ copies with Kaspersky Premium):
  python tools/scan_note.py --kaspersky clean [--virustotal] [--date YYYY-MM-DD]
It copies the sha256 from version.json, so the site page shows the line only for exactly that file.
--virustotal: only for a file uploaded to virustotal.com by hand. Normally python tools/vt_scan.py does it (it also writes the numbers).
A new release changes the sha256, so the line disappears until this tool is run again for the new installer."""
import argparse, datetime, hashlib, json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
GA = ROOT / "site" / "gravitas-app"
ap = argparse.ArgumentParser()
ap.add_argument("--kaspersky", choices=["clean"], required=True)
ap.add_argument("--virustotal", action="store_true")
ap.add_argument("--date", default=datetime.date.today().isoformat())
a = ap.parse_args()
v = json.loads((GA / "version.json").read_text(encoding="utf-8"))
exe = GA / ("GRAVITAS_%s_x64-setup.exe" % v["latest"])
h = hashlib.sha256(exe.read_bytes()).hexdigest()
if h != v["sha256"]:
    sys.exit("the installer file does not match version.json: %s vs %s" % (h[:16], v["sha256"][:16]))
old = json.loads((GA / "scan.json").read_text(encoding="utf-8")) if (GA / "scan.json").exists() else {}
out = {"version": v["latest"], "sha256": h, "kaspersky": a.kaspersky, "date": a.date, "virustotal": bool(a.virustotal)}
if old.get("sha256") == h and old.get("vt"):          # the VirusTotal numbers of this same installer stay (tools/vt_scan.py makes them)
    out["virustotal"] = True; out["vt"] = old["vt"]
(GA / "scan.json").write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
print("scan.json written for", v["latest"], h[:16])
