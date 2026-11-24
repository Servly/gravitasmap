"""The app's language files must have the same keys in all six languages (en is the reference).
Checks app/src/lang, app/src-tauri/lang_hud, lang_th, lang_db. Keys that start with "_" (like the Russian "_font") are metadata and ignored.

    python tools/check_langs.py        exit 1 when a language misses or has extra keys
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIRS = ["app/src/lang", "app/src-tauri/lang_hud", "app/src-tauri/lang_th", "app/src-tauri/lang_db"]
LANGS = ["en", "de", "es", "fr", "pt-br", "ru"]

def flat(d, pre=""):
    out = set()
    for k, v in d.items():
        if k.startswith("_"): continue
        if isinstance(v, dict): out |= flat(v, pre + k + ".")
        else: out.add(pre + k)
    return out

def main():
    bad = []
    for d in DIRS:
        sets = {}
        for l in LANGS:
            p = ROOT / d / f"{l}.json"
            if not p.is_file(): bad.append(f"{d}/{l}.json is missing"); continue
            sets[l] = flat(json.loads(p.read_text("utf-8")))
        ref = sets.get("en", set())
        for l, s in sets.items():
            if s != ref: bad.append(f"{d}/{l}.json: {len(ref - s)} missing, {len(s - ref)} extra (e.g. {sorted((ref ^ s))[:3]})")
        print(f"{d}: {len(ref)} keys x {len(sets)} languages")
    if bad: sys.exit("FAIL:\n  " + "\n  ".join(bad))
    print("language files OK")

if __name__ == "__main__":
    main()
