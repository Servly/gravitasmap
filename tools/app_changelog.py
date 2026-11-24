"""APP changelog for GitHub (app/CHANGELOG.md), made from app/src/whatsnew.json: the same English notes the app shows in its
What's new window. The site's history is CHANGELOG.md (tools/changelog.py); this is the app's. Nothing is written twice.

    python tools/app_changelog.py            -> app/CHANGELOG.md
    python tools/app_changelog.py --check    -> exit 1 when app/CHANGELOG.md is not up to date (writes nothing)
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "app" / "src" / "whatsnew.json"
OUT = ROOT / "app" / "CHANGELOG.md"

def entries():
    return json.loads(SRC.read_text("utf-8"))["versions"]

def text():
    out = ["# GRAVITAS app changelog", "",
           "Every version of the GRAVITAS Windows app, newest first. These are the same notes the app shows in its What's new window (English; the app also has them in German, Spanish, French, Portuguese and Russian). The website's history is in [../CHANGELOG.md](../CHANGELOG.md).", ""]
    for e in entries():
        out.append(f"## {e['v']}")
        out += [f"- {x}" for x in e["en"]] + [""]
    return "\n".join(out)

def main():
    t = text()
    if "--check" in sys.argv:
        cur = OUT.read_text("utf-8") if OUT.exists() else ""
        if cur != t: sys.exit("app/CHANGELOG.md is out of date: run python tools/app_changelog.py")
        print("app/CHANGELOG.md is up to date"); return
    OUT.write_text(t, "utf-8")
    print(f"app/CHANGELOG.md: {len(entries())} versions")

if __name__ == "__main__":
    main()
