"""v0.92.2 (v0.92.5: github.com/Servly/gravitasmap): put the current version of GRAVITAS on GitHub, with its version number and release notes.

    python tools\\github_publish.py --setup     the first time only (asks for your GitHub noreply address)
    python tools\\github_publish.py             every release (deploy.bat runs it after the site is published)

What it does:
  1. CHANGELOG.md from the "What's new" notes (tools/changelog.py)
  2. a clean copy for GitHub in ..\\gravitasmap-github (tools/github_export.py: an allow list, then a scan for anything private)
  3. one commit "GRAVITAS v0.92.2" and a tag "v0.92.2" whose message holds that version's notes, then a push

It never uses your personal e-mail: the commits are signed with your GitHub "noreply" address, and it stops if the
copy's address is anything else. It never deletes anything in this folder.
"""
import re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT.parent / "gravitasmap-github"   # v0.92.5: a new folder (the test copy in gravitas-github stays as it is)
REPO = "https://github.com/Servly/gravitasmap.git"
sys.path.insert(0, str(ROOT / "tools"))

def git(*a, check=True, cwd=OUT):
    r = subprocess.run(["git", *a], cwd=cwd, capture_output=True, text=True)
    if check and r.returncode: sys.exit(f"git {' '.join(a)} failed:\n{r.stderr.strip() or r.stdout.strip()}")
    return r.stdout.strip()

def version():
    m = re.search(r'APP_VERSION = "([^"]+)"', (ROOT / "src/js/20-quality.js").read_text("utf-8"))
    return m.group(1)

def notes(ver):
    import changelog
    for g in changelog.releases():
        for r in g["rel"]:
            if r["v"] == ver: return "\n".join(f"- {x}" for x in r["t"])
    return ""

def main():
    setup = "--setup" in sys.argv
    try: subprocess.run(["git", "--version"], capture_output=True, check=True)
    except Exception: sys.exit("Git is not installed. Install it from https://git-scm.com/download/win, then run this again.")
    if not (ROOT / "tools" / "private_words.txt").exists():
        sys.exit("First create tools\\private_words.txt with your personal e-mail address and your surname, one per line.\n"
                 "The export looks for them in every file before anything is copied. That file itself is never copied.")
    if not setup and not (OUT / ".git").exists():
        print("GitHub is not set up yet (run: python tools\\github_publish.py --setup). Skipped."); return
    import changelog, github_export
    changelog.main()
    sys.argv = [sys.argv[0], str(OUT)]; github_export.OUT = OUT; github_export.main()
    if not (OUT / ".git").exists():
        mail = input("Your GitHub noreply address (GitHub > Settings > Emails, ends with @users.noreply.github.com): ").strip()
        if not mail.lower().endswith("@users.noreply.github.com"): sys.exit("That is not a noreply address. Nothing was pushed.")
        git("init", "-b", "main"); git("config", "user.name", "GRAVITAS"); git("config", "user.email", mail)
        git("remote", "add", "origin", REPO)
    mail = git("config", "user.email", check=False)
    if not mail.lower().endswith("@users.noreply.github.com"):
        sys.exit(f"The GitHub copy would sign commits with '{mail}', not a noreply address. Stopped, nothing was pushed.")
    ver = version()
    git("add", "-A")
    if git("status", "--porcelain"):
        git("commit", "-m", f"GRAVITAS {ver}", "-m", notes(ver) or "See CHANGELOG.md")
    else: print("No changes since the last push.")
    if not git("tag", "-l", ver):
        git("tag", "-a", ver, "-m", f"GRAVITAS {ver}\n\n{notes(ver)}")
    git("push", "-u", "origin", "main"); git("push", "origin", ver)
    print(f"GitHub: GRAVITAS {ver} pushed, with its tag. https://github.com/Servly/gravitasmap")

if __name__ == "__main__":
    main()
