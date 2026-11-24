#!/usr/bin/env python3
"""Asks VirusTotal about the installer that site/gravitas-app/version.json offers and writes the result into site/gravitas-app/scan.json.

  python tools/vt_scan.py            looks the file up by its SHA-256, uploads it if VirusTotal does not know it yet, waits for the scan, writes the numbers
  python tools/vt_scan.py --lookup   only looks up, never uploads

The API key is in tools/virustotal_key.private (one line, never leaves this computer, never exported). Free key limits: 4 requests a minute, 500 a day.
Uploading shares the file with VirusTotal and its security partners: it is the public installer, so only run this on the FINAL build of a release.
Numbers are written as they are (flagged = malicious + suspicious, total = engines that gave an answer): a bad result is never hidden.
scan.json is kept per installer: when the sha256 changes, tools/scan_note.py starts a new record and the VirusTotal part has to be fetched again."""
import argparse, json, sys, time, uuid, urllib.request, urllib.error
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
GA = ROOT / "site" / "gravitas-app"
API = "https://www.virustotal.com/api/v3"
KEY = (ROOT / "tools" / "virustotal_key.private").read_text(encoding="utf-8").strip()
UA = "gravitas-release-tool"

def call(path, data=None, headers=None):
    h = {"x-apikey": KEY, "accept": "application/json", "User-Agent": UA}
    h.update(headers or {})
    req = urllib.request.Request(API + path, data=data, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try: body = json.loads(e.read().decode("utf-8"))
        except Exception: body = {}
        return e.code, body

def stats_of(attr):
    s = attr.get("last_analysis_stats") or {}
    flagged = int(s.get("malicious", 0)) + int(s.get("suspicious", 0))
    total = flagged + int(s.get("undetected", 0)) + int(s.get("harmless", 0))
    by = sorted(k for k, v in (attr.get("last_analysis_results") or {}).items() if v.get("category") in ("malicious", "suspicious"))
    return {"flagged": flagged, "malicious": int(s.get("malicious", 0)), "total": total, "by": by[:10]}

def upload(path):
    b = "----gravitas" + uuid.uuid4().hex
    body = (("--%s\r\nContent-Disposition: form-data; name=\"file\"; filename=\"%s\"\r\nContent-Type: application/octet-stream\r\n\r\n" % (b, path.name)).encode()
            + path.read_bytes() + ("\r\n--%s--\r\n" % b).encode())
    return call("/files", body, {"content-type": "multipart/form-data; boundary=" + b})

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--lookup", action="store_true"); a = ap.parse_args()
    v = json.loads((GA / "version.json").read_text(encoding="utf-8"))
    exe = GA / ("GRAVITAS_%s_x64-setup.exe" % v["latest"])
    import hashlib
    sha = hashlib.sha256(exe.read_bytes()).hexdigest()
    if sha != v["sha256"]: sys.exit("installer does not match version.json")
    code, j = call("/files/" + sha)
    if code == 404 and not a.lookup:
        if exe.stat().st_size > 32 * 1024 * 1024: sys.exit("file over 32 MB: needs the upload-url route, not built")
        print("VirusTotal does not know this file: uploading", exe.name)
        code, j = upload(exe)
        if code != 200: sys.exit("upload failed: %s %s" % (code, j))
        aid = j["data"]["id"]
        for i in range(40):
            time.sleep(20)
            c2, j2 = call("/analyses/" + aid)
            st = (j2.get("data", {}).get("attributes", {}) or {}).get("status")
            print("  analysis:", st)
            if st == "completed": break
        else: sys.exit("the analysis did not finish in time: run again later")
        time.sleep(16)
        code, j = call("/files/" + sha)
    if code != 200: sys.exit("VirusTotal has no result for this file (%s): run without --lookup to upload it" % code)
    st = stats_of(j["data"]["attributes"])
    if st["total"] < 10: sys.exit("too few engines answered yet (%d): run again in a minute" % st["total"])
    sp = GA / "scan.json"
    cur = json.loads(sp.read_text(encoding="utf-8")) if sp.exists() else {}
    if cur.get("sha256") != sha:
        cur = {"version": v["latest"], "sha256": sha, "kaspersky": "", "date": "", "virustotal": False}
    cur["virustotal"] = True
    cur["vt"] = st
    sp.write_text(json.dumps(cur, indent=2) + "\n", encoding="utf-8")
    print("VirusTotal: %d of %d engines flagged (malicious %d). scan.json updated for %s" % (st["flagged"], st["total"], st["malicious"], v["latest"]))
    print("report: https://www.virustotal.com/gui/file/" + sha)

main()
