"""The text of a GitHub Release for one GRAVITAS APP version, built only from the single sources the products show:
  app/src/whatsnew.json (English entry), src/lazy/changes.js (the site's entry of the current site version),
  site/gravitas-app/version.json (download link, size, SHA-256) and scan.json (Kaspersky / VirusTotal line).
Writes releases/github/GRAVITAS-app-v<ver>.md (local only: releases/ never goes to GitHub). Nothing is sent anywhere.

    python tools/github_release_notes.py                 for the app version in tauri.conf.json
    python tools/github_release_notes.py --app 0.9.27    for another version in whatsnew.json (links/hash only if it is the one version.json offers)
    python tools/github_release_notes.py --print         also print it

Importable: build(app) -> dict(title, tag, body, assets, warnings).
"""
import hashlib, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
GA = ROOT / "site" / "gravitas-app"
OUT = ROOT / "releases" / "github"
REPO = "https://github.com/Servly/gravitasmap"

def app_version():
    return json.loads((ROOT / "app/src-tauri/tauri.conf.json").read_text("utf-8"))["version"]

def site_version():
    m = re.search(r'APP_VERSION = "v?([^"]+)"', (ROOT / "src/js/20-quality.js").read_text("utf-8"))
    return m.group(1)

def build(app):
    import changelog
    warn = []
    entry = next((e for e in json.loads((ROOT / "app/src/whatsnew.json").read_text("utf-8"))["versions"] if e["v"] == app), None)
    if not entry: raise SystemExit(f"app/src/whatsnew.json has no entry for {app}")
    site = site_version()
    sentry = next((r for g in changelog.releases() for r in g["rel"] if r["v"].lstrip("v") == site), None)
    vj = json.loads((GA / "version.json").read_text("utf-8"))
    sc = json.loads((GA / "scan.json").read_text("utf-8")) if (GA / "scan.json").exists() else {}
    b = [f"## What's new in the GRAVITAS app {app}", ""] + [f"- {x}" for x in entry["en"]] + [""]
    assets = []
    if vj["latest"] == app:
        mb = vj["size"] / 1048576
        exe = f"GRAVITAS_{app}_x64-setup.exe"
        b += ["## Download", "",
              f"**[{exe}]({vj['url']})** ({mb:.1f} MB, Windows 10/11, 64-bit). The same file the website offers at https://gravitasmap.com/ (About GRAVITAS, App).",
              "", f"SHA-256: `{vj['sha256']}`", "",
              f"To check it in PowerShell: `Get-FileHash .\\{exe} -Algorithm SHA256` (the value must be the one above and the one in the signed `https://gravitasmap.com/gravitas-app/version.json`).", "",
              "The app updates itself from gravitasmap.com (signed, checked). The installer is not code-signed yet: Windows SmartScreen may warn. Signing comes with the Microsoft Store version.", ""]
        if sc.get("sha256") == vj["sha256"] and sc.get("kaspersky"):
            line = f"Scanned with Kaspersky Premium on {sc['date']}: no threat found."
            vt = sc.get("vt")
            if sc.get("virustotal") and vt:
                names = f" ({', '.join(vt['by'])})" if vt.get("by") else ""
                line += f" VirusTotal: {vt['flagged']} of {vt['total']} engines flagged this file{names}. [Full report](https://www.virustotal.com/gui/file/{vj['sha256']})."
                if vt["flagged"]:
                    line += " Why does a scanner flag it? The installer is not signed yet, and automatic engines are often more cautious with new, unsigned files. We do not know their exact reason."
            b += ["## Scan", "", line, ""]
        else:
            warn.append("scan.json is not for this installer: no scan line in the notes")
        exe_path = ROOT / "releases" / f"GRAVITAS_v{app}_x64-setup.exe"
        if exe_path.is_file():
            h = hashlib.sha256(exe_path.read_bytes()).hexdigest()
            if h == vj["sha256"]: assets.append(str(exe_path))
            else: warn.append("releases/ installer hash differs from version.json: not attached")
    else:
        warn.append(f"version.json offers {vj['latest']}, not {app}: no download/scan section")
    if sentry:
        b += [f"## What's new on the website ({sentry['v']}, {sentry['d']})", ""] + [f"- {x}" for x in sentry["t"]] + [""]
    b += ["## More", "",
          f"- App history: [app/CHANGELOG.md]({REPO}/blob/main/app/CHANGELOG.md). Website history: [CHANGELOG.md]({REPO}/blob/main/CHANGELOG.md)",
          f"- What GRAVITAS sends and reads: [PRIVACY.md]({REPO}/blob/main/PRIVACY.md)",
          f"- Licences of the parts: [THIRD-PARTY-LICENSES.txt]({REPO}/blob/main/THIRD-PARTY-LICENSES.txt)",
          "- Free fan-made tool for Elite Dangerous. MIT licence. No ads, no tracking.", ""]
    return {"title": f"GRAVITAS app {app}", "tag": f"app-v{app}", "body": "\n".join(b), "assets": assets, "warnings": warn}

def main():
    a = sys.argv[1:]
    app = a[a.index("--app") + 1] if "--app" in a else app_version()
    r = build(app)
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / f"GRAVITAS-app-v{app}.md"
    p.write_text(r["body"], "utf-8")
    print(f"{p}  (title: {r['title']}, tag: {r['tag']}, assets: {len(r['assets'])})")
    for w in r["warnings"]: print("WARNING:", w)
    if "--print" in a: print("\n" + r["body"])

if __name__ == "__main__":
    main()
