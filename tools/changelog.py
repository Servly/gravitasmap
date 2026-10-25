"""v0.92.2: CHANGELOG.md for GitHub, made from the release notes in the "What's new" tab (src/js/21-updates-window.js).
One list of changes for the site and for GitHub: nothing is written twice.

    python tools/changelog.py            -> CHANGELOG.md
"""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "js" / "21-updates-window.js"

def releases():
    t = SRC.read_text("utf-8")
    m = re.search(r"const CHANGES = (\[.*?\n\]);", t, re.S)
    if not m: raise SystemExit("CHANGES not found in 21-updates-window.js")
    js = m.group(1)
    js = re.sub(r"//[^\n]*", "", js)                                  # comments
    js = re.sub(r"([{,]\s*)(q|rel|v|k|d|t)\s*:", r'\1"\2":', js)        # keys in quotes
    js = re.sub(r",(\s*[\]}])", r"\1", js)                             # trailing commas
    return json.loads(js)

def main():
    out = ["# Changelog", "", "Every GRAVITAS release, newest first. The same notes are in the site's **About GRAVITAS → What's new** tab.", ""]
    for g in releases():
        out += [f"## {g['q']}", ""]
        for r in g["rel"]:
            out.append(f"### {r['v']} · {r['k']} · {r['d']}")
            out += [f"- {x}" for x in r["t"]] + [""]
    (ROOT / "CHANGELOG.md").write_text("\n".join(out), "utf-8")
    print(f"CHANGELOG.md: {sum(len(g['rel']) for g in releases())} releases")

if __name__ == "__main__":
    main()
