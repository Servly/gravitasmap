"""v0.92: make a clean copy of GRAVITAS for GitHub.

Copies only the files that belong in the public repository (an allow list) into a new folder next to this one,
then checks every copied file for anything private (e-mail addresses, keys, the report mail settings).
If anything is found, the copy is stopped and the file is named. Nothing in this folder is changed or deleted.

    python tools\\github_export.py            -> ..\\gravitasmap-github\\  (new, or your GitHub copy from last time)
    python tools\\github_export.py D:\\out     -> D:\\out\\
"""
import re, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / "gravitasmap-github"

# what goes public: the app's source, the server code, the build tools and the papers
KEEP = ["src", "functions", "lib", "worker/src", "worker/wrangler.toml",
        "tools/build.py", "tools/deploy.bat", "tools/_headers", "tools/github_export.py", "tools/github_publish.py", "tools/changelog.py",
        "tools/plugin_build.py", "plugin/GRAVITAS", "plugin/.gitignore",   # v0.93: GRAVITAS for EDMC
        "README.md", "PRIVACY.md", "CHANGELOG.md", "LICENSE", "NOTICE.md", ".gitignore"]
# never, wherever they are
NEVER = re.compile(r"(report_mail\.json$|private_words\.txt$|\.env|node_modules|__pycache__|\.wrangler|problem-reports|\.pyc$|\.log$|plugin/dist/)", re.I)
# private things that must not be in any public file
BAD = [(re.compile(r"[A-Za-z0-9._%+-]+@(gmail|hotmail|outlook|yahoo|icloud|proton)\.[a-z.]+", re.I), "a personal e-mail address"),
       (re.compile(r"\bre_[A-Za-z0-9]{16,}"), "a Resend API key"),
       (re.compile(r"\b(sk|pk)_(live|test)_[A-Za-z0-9]{10,}"), "an API key"),
       (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"), "a private key"),
       (re.compile(r"\"app_password\"\s*:\s*\"[a-z]{16}\"", re.I), "an app password")]
# your own words to look for (your e-mail address, your name...), one per line, in tools/private_words.txt.
# That file is yours only: it is never copied, so the words stay off GitHub too
PW = ROOT / "tools" / "private_words.txt"
if PW.exists():
    for w in PW.read_text("utf-8").splitlines():
        if w.strip(): BAD.append((re.compile(re.escape(w.strip()), re.I), "one of your private words"))
TEXT = {".js", ".mjs", ".css", ".html", ".py", ".json", ".toml", ".md", ".txt", ".bat", ".svg", ".xml", ""}

def files():
    for k in KEEP:
        p = ROOT / k
        if p.is_file(): yield p
        elif p.is_dir():
            for f in sorted(p.rglob("*")):
                if f.is_file(): yield f

def main():
    if OUT.exists() and any(OUT.iterdir()) and not (OUT / ".git").exists():
        sys.exit(f"{OUT} is not empty and is not your GitHub copy. Choose a new folder (nothing was copied).")
    # the GitHub copy from last time (it has a .git folder): the files are updated in place, ready to commit
    found, n = [], 0
    for f in files():
        rel = f.relative_to(ROOT).as_posix()
        if NEVER.search(rel): continue
        if f.suffix.lower() in TEXT:
            t = f.read_text("utf-8", errors="replace")
            for rx, what in BAD:
                if rx.search(t): found.append(f"{rel}: {what}")
    if found:
        sys.exit("Stopped. Private things found (nothing was copied):\n  " + "\n  ".join(found))
    for f in files():
        rel = f.relative_to(ROOT).as_posix()
        if NEVER.search(rel): continue
        d = OUT / rel; d.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(f, d); n += 1
    print(f"{n} files copied to {OUT}. Checked: no personal e-mail, no keys, no report mail settings.")

if __name__ == "__main__":
    main()
