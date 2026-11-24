"""Make a clean copy of GRAVITAS for GitHub (the public repository, github.com/Servly/gravitasmap).

Copies only the files that belong in the public repository (an allow list, KEEP) into a folder, then checks every
copied file for anything private (personal e-mail, keys and tokens, private paths, FID-like numbers, the private
file list). If anything is found, nothing is copied and the file is named. Nothing in this folder is changed or deleted.

    python tools/github_export.py              -> ..\\gravitasmap-github\\ (new, or your GitHub copy from last time)
    python tools/github_export.py D:\\out       -> D:\\out\\
    python tools/github_export.py --check      -> exports into a temporary folder only, runs all safety checks,
                                                  prints what would be exported and the diff against ..\\gravitasmap-github
    (always) the GitHub copy becomes an exact mirror: files that are no longer exported are removed from it (never .git).
    python tools/github_export.py --no-prune  -> only add and update, remove nothing
    python tools/github_export.py --check --keep-temp   keep the temporary folder (its path is printed)

Importable: exported(rel) tells whether a repo-relative path would be public (used by tools/release_check.py).
"""
import hashlib, re, shutil, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT.parent / "gravitasmap-github"

# what goes public: the site's source, the server code, the app's source, the build tools, the papers
KEEP = ["src", "functions", "lib", "worker/src", "worker/wrangler.toml",
        "tools/build.py", "tools/deploy.bat", "tools/deploy_app.bat", "tools/_headers", "tools/serve.py",
        "tools/github_export.py", "tools/github_publish.py", "tools/github_release.py", "tools/github_release_notes.py",
        "tools/release_check.py", "tools/check_langs.py", "tools/changelog.py", "tools/app_changelog.py",
        "tools/canonn_import.py",                                           # v0.95: the list behind Collisions
        "tools/refresh_sol.py", "tools/slim_file.mjs", "tools/vt_scan.py", "tools/scan_note.py", "tools/app_release.py",
        "tools/test_room.mjs", "tools/test_system_fallback.mjs", "tools/test_scan.mjs", "tools/package.json",
        "tools/appsign/Cargo.toml", "tools/appsign/Cargo.lock", "tools/appsign/src",   # the update signing tool (the KEY is never here)
        "README.md", "PRIVACY.md", "CHANGELOG.md", "LICENSE", "NOTICE.md", "THIRD-PARTY-LICENSES.txt", "tools/make_licenses.py", "tools/extra-licenses", ".gitignore",
        "CODE_SIGNING.md", ".github",                                       # v0.9.7: the app is built and signed in public
        "docs", "assets",                                                   # the papers and their pictures (docs/GITHUB_SETUP.md stays private: EXCLUDE)
        "app/README.md", "app/CHANGELOG.md", "app/package.json", "app/package-lock.json", "app/src",   # the GRAVITAS app (Tauri)
        "app/src-tauri/Cargo.toml", "app/src-tauri/Cargo.lock", "app/src-tauri/build.rs", "app/src-tauri/tauri.conf.json",
        "app/src-tauri/capabilities", "app/src-tauri/data", "app/src-tauri/engine", "app/src-tauri/fonts", "app/src-tauri/icons",
        "app/src-tauri/lang_hud", "app/src-tauri/lang_th", "app/src-tauri/lang_db", "app/src-tauri/src"]
# top-level folders that are expected to be public (release_check warns when one is not covered by KEEP)
PUBLIC_DIRS_EXPECTED = {"src", "functions", "lib", "worker", "docs", "assets", ".github", "app", "tools"}
# the EDMC plugin (plugin/) is retired: it is not exported (the old GitHub history keeps it). Archive: releases/ and CLAUDE.md
# top-level things that are private on purpose (anything else not in KEEP is reported as "not classified" in --check)
PRIVATE_TOP = {"plugin", "backups", "inbox", "releases", "avtest", "research", "site", "saved", "data", ".claude", ".wrangler", "node_modules",
               "CLAUDE.md", "__pycache__"}
# never, wherever they are
NEVER = re.compile(r"(app/src-tauri/target|/target/|\.private$|app_update_key|virustotal_key|report_mail\.json$|private_words\.txt$|\.env|node_modules|__pycache__|\.wrangler|"
                   r"virustotal|problem-reports|coll-canonn-private|\.pyc$|\.log$|plugin/dist/|(^|/)(backups|inbox|releases|avtest|research)/|\.claude/|\.dev\.vars|"
                   r"\.pfx$|\.p12$|\.pem$|\.bad-|\.bak|CLAUDE\.md$)", re.I)
# exact files that stay private although their folder is public
EXCLUDE = {"docs/GITHUB_SETUP.md"}
# private things that must not be in any public file
BAD = [(re.compile(r"[A-Za-z0-9._%+-]+@(gmail|hotmail|outlook|yahoo|icloud|proton|protonmail|live|msn)\.[a-z.]+", re.I), "a personal e-mail address"),
       (re.compile(r"\bre_[A-Za-z0-9]{16,}"), "a Resend API key"),
       (re.compile(r"\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{10,}"), "an API key"),
       (re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}"), "a GitHub token"),
       (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "an AWS access key"),
       (re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}"), "a Slack token"),
       (re.compile(r"\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}"), "a JWT token"),
       (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"), "a private key"),
       (re.compile(r"\"app_password\"\s*:\s*\"[a-z]{16}\"", re.I), "an app password"),
       (re.compile(r"(?i)\b(api[_-]?key|secret|token|passw(or)?d|authorization)\b[\"']?\s*[:=]\s*[\"'][A-Za-z0-9+/_=\-]{24,}[\"']"), "a secret-like value"),
       (re.compile(r"(?i)\bx-apikey\b[\"']?\s*[:=]\s*[\"'][A-Za-z0-9]{20,}"), "a VirusTotal-style key"),
       (re.compile(r"(?i)[A-Za-z]:[\\/]+Users[\\/]+(burak)\b"), "a private path (C:\\Users\\Burak)"),
       (re.compile(r"(?i)[A-Za-z]:[\\/]+Local[\\/]+Website\b"), "a private path (C:\\Local\\Website)"),
       (re.compile(r"\"FID\"\s*:\s*\"?F?\d{4,}"), "a commander FID"),
       (re.compile(r"\bF\d{7,8}\b"), "a FID-like number")]
# your own words to look for (your e-mail address, your name...), one per line, in tools/private_words.txt.
# That file is yours only: it is never copied, so the words stay off GitHub too
PW = ROOT / "tools" / "private_words.txt"
if PW.exists():
    for w in PW.read_text("utf-8").splitlines():
        if w.strip(): BAD.append((re.compile(re.escape(w.strip()), re.I), "one of your private words"))
# any e-mail address at all is private, except these. The licence files of other people's code list their authors' public addresses
# (only those files: a personal-provider address stays forbidden there too, except the PUBLIC ones)
ANY_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
EMAIL_OK = re.compile(r"(@users\.noreply\.github\.com|@example\.(com|org|net)|@localhost|noreply@anthropic\.com|@resend\.dev|@\w+\.(png|jpe?g|gif|svg|webp|ico))$", re.I)
LICENCE_FILE = re.compile(r"(THIRD-PARTY-LICENSES\.txt|tools/extra-licenses/|src/vendor/|/fonts/|(^|/)(LICENSE|NOTICE|OFL)[^/]*$)", re.I)
# public addresses that must stay as they are: the Saira font's authors, in its licence. Only these exact addresses are skipped
PUBLIC = ("omnibus.type@gmail.com",)
# other people's public addresses inside THEIR licence texts that we must pass on (only in LICENCE_FILE files)
LICENCE_PUBLIC = ("jonasschievink@gmail.com", "jpixton@gmail.com", "tituswormer@gmail.com")
# made-up values used by the tests (not a real commander's FID)
FAKE = ("F1234567",)

def in_keep(rel):
    return any(rel == k or rel.startswith(k.rstrip("/") + "/") for k in KEEP)

def exported(rel):
    """True when this repo-relative path would be public."""
    rel = rel.replace("\\", "/")
    return in_keep(rel) and rel not in EXCLUDE and not NEVER.search(rel)

def files():
    for k in KEEP:
        p = ROOT / k
        if p.is_file(): yield p
        elif p.is_dir():
            for f in sorted(p.rglob("*")):
                if f.is_file(): yield f

def rels():
    seen = []
    for f in files():
        rel = f.relative_to(ROOT).as_posix()
        if exported(rel) and rel not in seen: seen.append(rel)
    return seen

def text_of(path):
    """The file's text, or None for a binary file or one over 12 MB."""
    try:
        if path.stat().st_size > 12 * 1024 * 1024: return None
        b = path.read_bytes()
    except OSError: return None
    if b"\0" in b[:8192]: return None
    return b.decode("utf-8", errors="replace")

def scan(base, rel_list):
    """Safety scan of the files as they are under base. Returns a list of 'path: what'."""
    found = []
    for rel in rel_list:
        if NEVER.search(rel) or rel in EXCLUDE: found.append(f"{rel}: a file from the private list"); continue
        if rel == "tools/github_export.py": continue          # this file names the patterns and the public addresses it lets through
        t = text_of(base / rel)
        if t is None: continue
        for w in PUBLIC + FAKE: t = t.replace(w, "")
        if LICENCE_FILE.search(rel):
            for w in LICENCE_PUBLIC: t = t.replace(w, "")
        for rx, what in BAD:
            if rx.search(t): found.append(f"{rel}: {what}")
        if not LICENCE_FILE.search(rel):
            for m in ANY_EMAIL.finditer(t):
                if not EMAIL_OK.search(m.group(0)) and t[max(0, m.start() - 2):m.start()] != "//":
                    found.append(f"{rel}: an e-mail address ({m.group(0)[:3]}...{m.group(0)[-12:]})"); break
    return found

def secret_values():
    """Exact private values: every line of tools/*.private and every string value of tools/report_mail.json (8+ characters)."""
    vals = set()
    for p in list((ROOT / "tools").glob("*.private")) + [ROOT / "tools" / "report_mail.json"]:
        if not p.is_file(): continue
        try: txt = p.read_text("utf-8", errors="ignore")
        except OSError: continue
        if p.suffix == ".json":
            try:
                import json
                def walk(o):
                    if isinstance(o, dict): [walk(v) for v in o.values()]
                    elif isinstance(o, list): [walk(v) for v in o]
                    elif isinstance(o, str) and len(o.strip()) >= 8: vals.add(o.strip())
                walk(json.loads(txt))
            except ValueError: pass
        else:
            for l in txt.splitlines():
                l = l.strip()
                if len(l) >= 8 and not l.startswith(("-----", "#")): vals.add(l)
    return vals

def secret_scan(base, rel_list):
    vals = secret_values(); found = []
    if not vals: return found
    for rel in rel_list:
        t = text_of(base / rel)
        if t and any(v in t for v in vals): found.append(f"{rel}: contains the exact content of a private file (tools/*.private or report_mail.json)")
    return found

INC = re.compile(r'include_(?:str|bytes)!\(\s*(?:concat!\()?\s*(?:env!\("CARGO_MANIFEST_DIR"\),\s*)?r?"([^"]+)"')

def include_check(rel_list):
    """Every include_str!/include_bytes! target (and every tauri.conf resource) must be in the export: else the public tree does not build."""
    have, miss = set(rel_list), []
    for rel in rel_list:
        if rel.startswith("app/src-tauri/") and rel.endswith(".rs"):
            t = text_of(ROOT / rel) or ""
            for m in INC.finditer(t):
                tgt = m.group(1)
                if tgt.startswith("/") or not ("/" in tgt or tgt.endswith((".json", ".js", ".key", ".txt", ".ttf"))): continue
                base = ROOT / "app/src-tauri" if "CARGO_MANIFEST_DIR" in t[m.start():m.end()] else (ROOT / rel).parent
                try: r = (base / tgt).resolve().relative_to(ROOT).as_posix()
                except ValueError: miss.append(f"{rel}: {tgt} (outside the repository)"); continue
                if r not in have: miss.append(f"{rel}: {tgt} -> {r} is not exported")
    conf = ROOT / "app/src-tauri/tauri.conf.json"
    if conf.is_file():
        import json
        for k in (json.loads(conf.read_text("utf-8")).get("bundle", {}).get("resources") or {}):
            try: r = (conf.parent / k).resolve().relative_to(ROOT).as_posix()
            except ValueError: miss.append(f"tauri.conf.json resource {k} is outside the repository"); continue
            if r not in have: miss.append(f"tauri.conf.json resource {k} -> {r} is not exported")
    return miss

def sha(p):
    h = hashlib.sha256(); h.update(Path(p).read_bytes()); return h.hexdigest()

def manifest(base, rel_list=None):
    base = Path(base)
    if rel_list is None:
        rel_list = [f.relative_to(base).as_posix() for f in base.rglob("*") if f.is_file() and f.relative_to(base).parts[0] != ".git"]
    return {r: sha(base / r) for r in rel_list if (base / r).is_file()}

def copy_to(dest, rel_list):
    for rel in rel_list:
        d = dest / rel; d.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(ROOT / rel, d)

def diff(new, old):
    add = sorted(set(new) - set(old)); rem = sorted(set(old) - set(new))
    chg = sorted(r for r in new if r in old and new[r] != old[r])
    return add, rem, chg

def show(title, items, cap=25):
    print(f"  {title}: {len(items)}")
    for r in items[:cap]: print(f"    {r}")
    if len(items) > cap: print(f"    ... and {len(items) - cap} more")

def summary(rel_list):
    groups = {}
    for r in rel_list:
        g = "/".join(r.split("/")[:2]) if r.startswith(("app/", "tools/", "plugin/", "worker/")) else r.split("/")[0]
        n, s = groups.get(g, (0, 0)); groups[g] = (n + 1, s + (ROOT / r).stat().st_size)
    total = sum(s for _, s in groups.values())
    print(f"Export: {len(rel_list)} files, {total / 1048576:.1f} MB")
    for g, (n, s) in sorted(groups.items()): print(f"  {g:28} {n:5} files  {s / 1024:9.0f} KB")

def unclassified():
    """Top-level entries that are neither public (KEEP) nor known private: a new folder nobody decided about."""
    out = []
    for p in sorted(ROOT.iterdir()):
        n = p.name
        if n in PRIVATE_TOP or n.startswith(".git") and n != ".github": continue
        if any(k == n or k.startswith(n + "/") for k in KEEP): continue
        out.append(n)
    return out

def lines(head, items):
    return head + chr(10) + chr(10).join("  " + i for i in items)

def run(out=None, check=False, prune=True, keep_temp=False):
    out = Path(out) if out else DEFAULT_OUT
    if not check and out.exists() and any(out.iterdir()) and not (out / ".git").exists():
        sys.exit(f"{out} is not empty and is not your GitHub copy. Choose a new folder (nothing was copied).")
    missing = [k for k in KEEP if not (ROOT / k).exists()]
    rel_list = rels()
    stage = Path(tempfile.mkdtemp(prefix="gravitas-export-"))          # always stage first, scan what is really in it, only then touch the destination
    copy_to(stage, rel_list)
    found = scan(ROOT, rel_list)
    found += [f for f in scan(stage, rel_list) if f not in found]
    found += secret_scan(stage, rel_list)
    found += ["BUILD: " + m for m in include_check(rel_list)]
    if found and not check:
        shutil.rmtree(stage, ignore_errors=True)
        sys.exit(lines("Stopped. Private things found (nothing was copied):", found))
    if found: print(lines("SAFETY CHECK FAILED (a real export would stop here):", found) + chr(10))
    old = manifest(out) if out.exists() else {}
    new = manifest(stage, rel_list)
    summary(rel_list)
    for u in unclassified(): print(f"  NOTE: top-level '{u}' is neither in KEEP nor in PRIVATE_TOP: decide and add it")
    for m in missing:
        if m not in ("app/CHANGELOG.md", "tools/github_release.py", "tools/github_release_notes.py", "tools/app_changelog.py") and not m.startswith(("docs", "assets")):
            print(f"  NOTE: KEEP entry not found in this folder (skipped): {m}")
    add, rem, chg = diff(new, old)
    print(f"Diff against {out}{'' if old else ' (nothing there yet: everything is new)'}:")
    show("added", add); show("changed", chg); show("only in the GitHub copy (no longer exported)", rem)
    if check:
        print(f"{chr(10)}{'CHECK FAILED' if found else 'CHECK OK'}: {len(rel_list)} files, {len(found)} safety finding(s). Nothing was written to {out}.")
        if keep_temp: print(f"Temporary export kept at {stage}")
        else: shutil.rmtree(stage, ignore_errors=True)
        if found: sys.exit(1)
        return rel_list
    for rel in rel_list:
        d = out / rel; d.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(stage / rel, d)
    shutil.rmtree(stage, ignore_errors=True)
    if prune and rem:
        for r in rem:
            p = out / r
            if p.is_file() and ".git" not in p.relative_to(out).parts: p.unlink()
        for d in sorted((x for x in out.rglob("*") if x.is_dir() and ".git" not in x.relative_to(out).parts), key=lambda x: -len(x.parts)):
            try: d.rmdir()
            except OSError: pass
        print(f"  pruned {len(rem)} files from the GitHub copy")
    elif rem: print("  (--no-prune: they stay in the GitHub copy)")
    print(f"{len(rel_list)} files in {out} ({len(add)} added, {len(chg)} changed). Checked: no personal e-mail, no keys or tokens, no private paths, no FIDs, no private files.")
    return rel_list

def main(argv=None):
    a = sys.argv[1:] if argv is None else argv
    flags = {x for x in a if x.startswith("--")}
    pos = [x for x in a if not x.startswith("--")]
    run(pos[0] if pos else None, check="--check" in flags, prune="--no-prune" not in flags, keep_temp="--keep-temp" in flags)

if __name__ == "__main__":
    main()
