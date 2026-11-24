#!/usr/bin/env python3
"""Is ONE release the same everywhere? Read only, fast, no network unless --online.

    python tools/release_check.py            local files only
    python tools/release_check.py --online   plus the live site (version.json, installer, page script, /api/scan)
    python tools/release_check.py --app 0.9.27 --site 0.99.17   check a given version pair (default: the files' own)

Prints PASS / WARN / FAIL per check. Exit code 1 when any check FAILs (WARN never fails).
Never writes, deploys or pushes. Used by tools/github_release.py (it refuses to run when this fails).
"""
import argparse, hashlib, json, re, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
GA = ROOT / "site" / "gravitas-app"
LANGS = ["en", "de", "es", "fr", "pt-br", "ru"]
R = []          # (level, name, detail)

def rec(level, name, detail=""): R.append((level, name, detail))
def ok(name, detail=""): rec("PASS", name, detail)
def warn(name, detail=""): rec("WARN", name, detail)
def bad(name, detail=""): rec("FAIL", name, detail)
def check(cond, name, detail_bad="", detail_ok="", level="FAIL"):
    rec("PASS" if cond else level, name, detail_ok if cond else detail_bad)
    return cond

def rd(p): return Path(p).read_text("utf-8")
def jd(p): return json.loads(rd(p))
def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""): h.update(b)
    return h.hexdigest()
def vkey(s): return tuple(int(x) for x in re.findall(r"\d+", s))
def flat(d, pre=""):
    out = set()
    for k, v in d.items():
        if k.startswith("_"): continue
        if isinstance(v, dict): out |= flat(v, pre + k + ".")
        else: out.add(pre + k)
    return out

def versions(args):
    m = re.search(r'APP_VERSION = "v?([^"]+)"', rd(ROOT / "src/js/20-quality.js"))
    site = args.site or (m.group(1) if m else "")
    try: app = args.app or json.loads(rd(ROOT / "app/src-tauri/tauri.conf.json"))["version"]
    except Exception: app = args.app or ""
    return site, app

def site_checks(site):
    import changelog
    check(bool(site), "site APP_VERSION found", "src/js/20-quality.js has no APP_VERSION")
    rel = changelog.releases()[0]["rel"][0]
    check(rel["v"].lstrip("v") == site, "site: top What's new entry (src/lazy/changes.js) = APP_VERSION",
          f"top entry is {rel['v']}, APP_VERSION is {site}", f"{rel['v']}")
    top = next((l for l in rd(ROOT / "CHANGELOG.md").splitlines() if l.startswith("### v")), "")
    check(top.split()[1].lstrip("v") == site if top else False, "site: CHANGELOG.md top entry (run tools/changelog.py)",
          f"top is '{top}'", top)
    z = ROOT / "releases" / f"Gravitasmap_v{site}.zip"
    check(z.is_file() and z.stat().st_size > 0, "site: releases/Gravitasmap_v%s.zip exists" % site, "missing (made at the end of a version)")
    idx = ROOT / "site" / "index.html"
    check(idx.is_file(), "site: built (site/index.html exists)", "run python tools/build.py")
    st = "SITE v" + site
    cl = rd(ROOT / "CLAUDE.md")
    check(site in cl, "CLAUDE.md Status mentions site %s" % site, "update the Status section", level="WARN")

def app_checks(app):
    conf = jd(ROOT / "app/src-tauri/tauri.conf.json")["version"]
    pkg = jd(ROOT / "app/package.json")["version"]
    ct = re.search(r'(?m)^version\s*=\s*"([^"]+)"', rd(ROOT / "app/src-tauri/Cargo.toml")).group(1)
    lk = re.search(r'name = "gravitas"\nversion = "([^"]+)"', rd(ROOT / "app/src-tauri/Cargo.lock"))
    for n, v in (("tauri.conf.json", conf), ("package.json", pkg), ("Cargo.toml", ct), ("Cargo.lock (gravitas)", lk.group(1) if lk else "?")):
        check(v == app, f"app version in {n} = {app}", f"is {v}", v)
    pl = ROOT / "app/package-lock.json"
    if pl.is_file():
        v = jd(pl).get("version", "")
        check(v == app, "app version in package-lock.json = %s" % app, f"is {v}", v, level="WARN")
    # What's new inside the app
    w = jd(ROOT / "app/src/whatsnew.json")["versions"]
    top = w[0]
    check(top["v"] == app, "app: top app/src/whatsnew.json entry = %s" % app, f"top entry is {top['v']}", top["v"])
    miss = [l for l in LANGS if not (isinstance(top.get(l), list) and top[l] and all(isinstance(s, str) and s.strip() for s in top[l]))]
    check(not miss, "app: top What's new has all 6 languages, non-empty", "missing/empty: " + ", ".join(miss), ", ".join(LANGS))
    # six app language files
    sets = {}
    for l in LANGS:
        p = ROOT / "app/src/lang" / f"{l}.json"
        sets[l] = flat(jd(p)) if p.is_file() else None
    if None in sets.values():
        bad("app/src/lang: six files present", "missing: " + ", ".join(l for l, s in sets.items() if s is None))
    else:
        ref = sets["en"]; diffs = []
        for l in LANGS[1:]:
            a, b = ref - sets[l], sets[l] - ref
            if a or b: diffs.append(f"{l}: {len(a)} missing, {len(b)} extra (e.g. {sorted(a | b)[:3]})")
        check(not diffs, "app/src/lang: identical key sets in 6 languages", "; ".join(diffs), f"{len(ref)} keys each")
    for d in ("lang_hud", "lang_th", "lang_db"):
        base = ROOT / "app/src-tauri" / d
        if not base.is_dir(): continue
        sets = {p.stem: flat(jd(p)) for p in base.glob("*.json")}
        if len(sets) < 2: continue
        ref = sets.get("en") or next(iter(sets.values()))
        diffs = [f"{k}: {len(ref ^ s)} differ" for k, s in sets.items() if s != ref]
        check(not diffs, f"app/src-tauri/{d}: identical key sets", "; ".join(diffs), f"{len(sets)} files", level="WARN")
    # version.json, installers
    vj = jd(GA / "version.json")
    check(vj["latest"] == app, "site/gravitas-app/version.json latest = %s" % app, f"is {vj['latest']}", vj["latest"])
    exp = f"https://gravitasmap.com/gravitas-app/GRAVITAS_{app}_x64-setup.exe"
    check(vj["url"] == exp, "version.json url points at this installer", f"is {vj['url']}", vj["url"])
    check(bool(re.fullmatch(r"[0-9a-f]{128}", vj.get("signature", ""))), "version.json is signed (128 hex)", "signature missing/odd")
    rel = ROOT / "releases" / f"GRAVITAS_v{app}_x64-setup.exe"
    pub = GA / f"GRAVITAS_{app}_x64-setup.exe"
    hs = {}
    for n, p in (("releases/ installer", rel), ("site/gravitas-app/ installer", pub)):
        if check(p.is_file(), f"{n} exists", str(p)): hs[n] = sha(p)
    if len(hs) == 2:
        check(len(set(hs.values())) == 1, "the two installer files are byte-equal", str(hs))
    for n, h in hs.items():
        check(h == vj["sha256"], f"{n} sha256 = version.json", f"{h[:16]} vs {vj['sha256'][:16]}", h[:16])
    if pub.is_file(): check(pub.stat().st_size == vj["size"], "version.json size = installer size", f"{vj['size']} vs {pub.stat().st_size}", str(vj["size"]))
    # scan.json
    sc = jd(GA / "scan.json")
    check(sc.get("sha256") == vj["sha256"] and sc.get("version") == app, "scan.json is for this exact installer (version + sha256)",
          f"scan.json is for {sc.get('version')} {str(sc.get('sha256'))[:16]}; run vt_scan.py and scan_note.py", sc.get("version", ""))
    check(bool(sc.get("kaspersky")), "scan.json kaspersky field present", "missing (Burak scans, then scan_note.py)", str(sc.get("kaspersky")))
    vt = sc.get("vt") or {}
    check(sc.get("virustotal") is True and all(isinstance(vt.get(k), int) for k in ("flagged", "malicious", "total")),
          "scan.json VirusTotal numbers present", "run python tools/vt_scan.py", f"{vt.get('flagged')} of {vt.get('total')}")
    z = ROOT / "releases" / f"GRAVITAS_app_v{app}_source.zip"
    check(z.is_file() and z.stat().st_size > 0, "releases/GRAVITAS_app_v%s_source.zip exists" % app, "missing")
    # backups
    if not any((ROOT / "backups" / n).is_dir() for n in (app, "v" + app, "app-" + app)):
        warn("backups/ folder for %s exists" % app, "none of backups/%s, v%s, app-%s (CLAUDE.md rule: back up before changing)" % (app, app, app))
    else: ok("backups/ folder for %s exists" % app)
    check(app in rd(ROOT / "CLAUDE.md"), "CLAUDE.md Status mentions app %s" % app, "update the Status section", level="WARN")

def licence_checks():
    lock = rd(ROOT / "app/src-tauri/Cargo.lock")
    have = set(re.findall(r'name = "([^"]+)"\nversion = "([^"]+)"', lock))
    lic = ROOT / "THIRD-PARTY-LICENSES.txt"
    t = rd(lic)
    part = t.split("PART 1.")[1].split("LICENCE TEXTS")[0] if "PART 1." in t else ""
    listed = set(re.findall(r"(?m)^([A-Za-z0-9_.\-]+) (\d[^ ]*)  \|", part))
    gone = sorted(f"{n} {v}" for n, v in listed - have)
    check(bool(listed), "THIRD-PARTY-LICENSES.txt lists the Rust crates", "no crate list found")
    check(not gone, "THIRD-PARTY-LICENSES.txt: every listed crate version is in Cargo.lock",
          f"{len(gone)} not in Cargo.lock (e.g. {gone[:3]}): run python tools/make_licenses.py", f"{len(listed)} crates")
    toml = rd(ROOT / "app/src-tauri/Cargo.toml").split("[dependencies]")[1].split("\n[")[0] if "[dependencies]" in rd(ROOT / "app/src-tauri/Cargo.toml") else ""
    direct = set(re.findall(r"(?m)^([A-Za-z0-9_\-]+)\s*=", toml))
    names = {n for n, _ in listed}
    lost = sorted(d for d in direct if d not in names and d.replace("_", "-") not in names and d not in ("tauri-build",))
    check(not lost, "every direct app dependency is in THIRD-PARTY-LICENSES.txt", f"not listed: {lost}: run tools/make_licenses.py", level="WARN")
    if lic.stat().st_mtime < (ROOT / "app/src-tauri/Cargo.lock").stat().st_mtime:
        warn("THIRD-PARTY-LICENSES.txt is older than Cargo.lock (file time)", "harmless if only the version line changed; the content check above is the real test")
    else: ok("THIRD-PARTY-LICENSES.txt is newer than Cargo.lock")

def doc_checks(site, app):
    docs = [ROOT / "README.md", ROOT / "app/README.md"] + sorted((ROOT / "docs").glob("*.md")) if (ROOT / "docs").is_dir() else [ROOT / "README.md", ROOT / "app/README.md"]
    # lines that state "the current/latest version", a download or an installer name must not carry an older number
    stale = []
    for p in docs:
        if not p.is_file() or p.name == "GITHUB_SETUP.md": continue
        for i, l in enumerate(rd(p).splitlines(), 1):
            if not re.search(r"latest|current|download|installer|GRAVITAS_\d|setup\.exe|version\.json", l, re.I): continue
            for m in re.finditer(r"(?<![\d.])v?(0\.99?\.\d+)(?![\d.])", l):
                v = m.group(1); cur = site if v.startswith("0.99.") else app
                if cur and vkey(v) < vkey(cur): stale.append(f"{p.relative_to(ROOT).as_posix()}:{i} says {v} (now {cur})")
    check(not stale, "README/docs state no older version where they name the current one", "; ".join(stale[:5]), "none found")
    # every relative path README/docs link to must leave in the export
    import github_export as ge
    miss = []
    for p in docs:
        if not p.is_file(): continue
        for l in re.findall(r"\]\(([^)\s#]+)", rd(p)):
            if re.match(r"[a-z]+:", l) or l.startswith(("#", "mailto")): continue
            tgt = (p.parent / l).resolve()
            try: rel = tgt.relative_to(ROOT).as_posix()
            except ValueError: continue
            if tgt.is_dir():
                if not any(r.startswith(rel + "/") for r in ge.rels()): miss.append(f"{p.name} -> {rel}/ (nothing in it is exported)")
                continue
            if tgt.exists() and not ge.exported(rel): miss.append(f"{p.name} -> {rel}")
            if not tgt.exists(): miss.append(f"{p.name} -> {rel} (missing file)")
    check(not miss, "every file README/docs link to exists and is in the GitHub export", "; ".join(sorted(set(miss))[:6]), "ok")
    pub = [d.name for d in ROOT.iterdir() if d.is_dir() and d.name in ge.PUBLIC_DIRS_EXPECTED]
    notin = [d for d in pub if not any(k == d or k.startswith(d + "/") for k in ge.KEEP)]
    check(not notin, "export KEEP covers the expected public top-level folders", f"not covered: {notin}", ", ".join(pub))

def export_checks():
    import github_export as ge, app_changelog
    cur = ROOT / "app" / "CHANGELOG.md"
    check(cur.is_file() and cur.read_text("utf-8") == app_changelog.text(), "app/CHANGELOG.md is up to date (tools/app_changelog.py)", "run python tools/app_changelog.py")
    rels = ge.rels()
    found = ge.scan(ROOT, rels) + ge.secret_scan(ROOT, rels)
    check(not found, "GitHub export safety scan (private paths, keys, e-mails, FIDs)", "; ".join(found[:4]), f"{len(rels)} files clean")
    miss = ge.include_check(rels)
    check(not miss, "export is buildable: every include_str!/resource target is exported", "; ".join(miss[:4]), "ok")
    un = ge.unclassified()
    check(not un, "no top-level folder is undecided (KEEP or PRIVATE_TOP)", ", ".join(un), level="WARN")

def get(url, binary=False, timeout=30):
    rq = urllib.request.Request(url, headers={"User-Agent": "gravitas-release-check/1"})
    with urllib.request.urlopen(rq, timeout=timeout) as r:
        d = r.read(); return r.status, (d if binary else d.decode("utf-8", "replace"))

def online(app):
    base = "https://gravitasmap.com"
    vj = jd(GA / "version.json")
    try:
        s, t = get(base + "/gravitas-app/version.json"); live = json.loads(t)
        same = all(live.get(k) == vj.get(k) for k in ("latest", "url", "sha256", "size", "signature"))
        check(s == 200 and same, "live version.json equals the local one", f"live {live.get('latest')} {str(live.get('sha256'))[:12]} vs local {vj['latest']} {vj['sha256'][:12]}", live.get("latest"))
    except Exception as e: bad("live version.json", repr(e))
    try:
        s, d = get(vj["url"], True, 90)
        h = hashlib.sha256(d).hexdigest()
        check(s == 200 and h == vj["sha256"] and len(d) == vj["size"], "live installer answers 200 with the same sha256 and size", f"{s} {h[:12]} {len(d)}", h[:12])
    except Exception as e: bad("live installer download", repr(e))
    try:
        loc = re.search(r"app\.[0-9a-f]{10}\.js", rd(ROOT / "site/index.html")).group(0)
        s, t = get(base + "/")
        lv = re.search(r"app\.[0-9a-f]{10}\.js", t)
        check(bool(lv) and lv.group(0) == loc, "live page script = site/index.html", f"live {lv.group(0) if lv else None} vs local {loc}", loc)
    except Exception as e: bad("live page script", repr(e))
    try:
        s, t = get(base + "/api/scan"); j = json.loads(t)
        check(s == 200 and j.get("sha256") == vj["sha256"], "/api/scan answers 200 for the same sha256", f"{s} {str(j.get('sha256'))[:12]}", f"{j.get('flagged')} of {j.get('total')}")
    except Exception as e: bad("/api/scan", repr(e))

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--online", action="store_true"); ap.add_argument("--app"); ap.add_argument("--site")
    a = ap.parse_args()
    site, app = versions(a)
    print(f"GRAVITAS release check: site v{site}, app v{app}{' (+ online)' if a.online else ''}\n")
    for f in (lambda: site_checks(site), lambda: app_checks(app), licence_checks, export_checks, lambda: doc_checks(site, app)) + ((lambda: online(app),) if a.online else ()):
        try: f()
        except Exception as e: bad("check crashed: " + getattr(f, "__name__", "?"), repr(e))
    for lv, n, d in R: print(f"{lv:5} {n}" + (f"  [{d}]" if d else ""))
    c = {k: sum(1 for r in R if r[0] == k) for k in ("PASS", "WARN", "FAIL")}
    print(f"\n{c['PASS']} pass, {c['WARN']} warn, {c['FAIL']} FAIL")
    sys.exit(1 if c["FAIL"] else 0)

if __name__ == "__main__":
    main()
