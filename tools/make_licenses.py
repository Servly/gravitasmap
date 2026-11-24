#!/usr/bin/env python3
"""Writes THIRD-PARTY-LICENSES.txt at the repo root: every Rust crate in the shipped
Windows build (normal dependencies of the gravitas package, no dev/build-only ones),
their licence texts verbatim, plus vendored JS, fonts and Kokoro-82M.
Run: python tools/make_licenses.py   (needs cargo on PATH; standard library only)"""
import json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TAURI = ROOT / "app" / "src-tauri"
OUT = ROOT / "THIRD-PARTY-LICENSES.txt"
TARGET = "x86_64-pc-windows-msvc"
# crates whose package carries no licence file: the text is copied from the upstream repository
EXTRA = {"alloc-stdlib": "alloc-stdlib.txt", "rquickjs-core": "rquickjs.txt", "rquickjs-sys": "rquickjs.txt",
         "webview2-com": "webview2-rs.txt", "webview2-com-macros": "webview2-rs.txt", "webview2-com-sys": "webview2-rs.txt",
         "selectors": "mpl-2.0.txt"}
NAMES = ("license", "licence", "copying", "notice", "unlicense", "copyright")

def norm(t): return t.replace("\r\n", "\n").replace("\r", "\n").strip("\n") + "\n"

def read(p):
    return norm(Path(p).read_text("utf-8", errors="replace"))

def shipped():
    r = subprocess.run(["cargo", "metadata", "--format-version", "1", "--filter-platform", TARGET],
                       cwd=TAURI, capture_output=True, text=True, encoding="utf-8")
    if r.returncode: sys.exit(r.stderr)
    m = json.loads(r.stdout)
    pk = {p["id"]: p for p in m["packages"]}
    nodes = {n["id"]: n for n in m["resolve"]["nodes"]}
    root = m["resolve"]["root"]
    seen, stack = {root}, [root]
    while stack:
        for d in nodes[stack.pop()]["deps"]:
            # keep an edge only when at least one dep kind is "normal" (kind None)
            if not any(k.get("kind") is None for k in d["dep_kinds"]): continue
            if d["pkg"] not in seen:
                seen.add(d["pkg"]); stack.append(d["pkg"])
    seen.discard(root)
    return sorted((pk[i] for i in seen), key=lambda p: (p["name"], p["version"]))

def lic_files(p):
    d = Path(p["manifest_path"]).parent
    out = []
    for f in sorted(d.iterdir()):
        if f.is_file() and f.name.lower().startswith(NAMES) and (f.suffix.lower() in ("", ".txt", ".md") or f.name.lower().startswith(("license.", "licence."))):
            out.append(f)
    return out

def main():
    crates = shipped()
    texts = {}      # text -> list of (crate, filename)
    missing = []
    lines = []
    for p in crates:
        lic = p.get("license") or ("file: " + str(p.get("license_file"))) if (p.get("license") or p.get("license_file")) else "UNKNOWN"
        lines.append(f"{p['name']} {p['version']}  |  {lic}  |  {p.get('repository') or p.get('homepage') or 'crates.io/crates/' + p['name']}")
        fs = lic_files(p)
        if not fs and p["name"] in EXTRA: fs = [ROOT / "tools/extra-licenses" / EXTRA[p["name"]]]
        if not fs: missing.append(f"{p['name']} {p['version']} ({lic})")
        for f in fs:
            texts.setdefault(read(f), []).append(f"{p['name']} {p['version']}")
    o = []
    o.append("GRAVITAS THIRD-PARTY LICENSES\n" + "=" * 29 + "\n")
    o.append("GRAVITAS itself is MIT licensed (see LICENSE). This file lists the open-source software\n"
             "that is part of the GRAVITAS Windows app or of the GRAVITAS site, with the licence texts\n"
             "their authors ask to be passed on. It is made by tools/make_licenses.py from the Rust\n"
             "dependency list (cargo metadata, normal dependencies, target " + TARGET + ").\n"
             "The Microsoft WebView2 runtime is used as installed on the PC and is not part of this file.\n"
             "Crates under MPL-2.0 are used unmodified; their source is at crates.io.\n")
    o.append("\n" + "=" * 70 + "\nPART 1. RUST CRATES (%d)\n" % len(crates) + "=" * 70 + "\n")
    o.append("name version  |  licence  |  repository\n")
    o.extend(l + "\n" for l in lines)
    o.append("\n" + "=" * 70 + "\nLICENCE TEXTS OF THE RUST CRATES\n" + "=" * 70 + "\n")
    for t in sorted(texts, key=lambda t: (texts[t][0], t)):
        users = texts[t]
        o.append("\n" + "-" * 70 + "\nUsed by: " + ", ".join(users) + "\n" + "-" * 70 + "\n" + t)
    if missing:
        o.append("\n" + "-" * 70 + "\nCrates whose package has no licence file. Licence text is at the\n"
                 "repository named above (SPDX id as listed):\n" + "-" * 70 + "\n")
        o.extend("  " + m + "\n" for m in missing)
    # vendored JS
    o.append("\n" + "=" * 70 + "\nPART 2. VENDORED JAVASCRIPT (the site)\n" + "=" * 70 + "\n")
    o.append("\nthree.js 0.160.0 (src/vendor/three@0.160.0), including OrbitControls with one GRAVITAS\n"
             "line patched (src/vendor/gravitas-patches/OrbitControls-0.160.0-p1.js, marked\n"
             "'GRAVITAS v0.92.1 patch'). MIT licence:\n\n")
    o.append(read(ROOT / "src/vendor/three@0.160.0/LICENSE"))
    q = ROOT / "src/vendor/qrcode-generator@1.4.4/LICENSE"
    o.append("\nqrcode-generator 1.4.4 (src/vendor/qrcode-generator@1.4.4). MIT licence:\n\n" + read(q))
    # fonts
    o.append("\n" + "=" * 70 + "\nPART 3. FONTS (the app's HUD)\n" + "=" * 70 + "\n")
    o.append("\nThe HUD fonts (app/src-tauri/fonts/) are made from Saira Semi Condensed (Regular and\n"
             "Bold, copyright 2016 The Saira Project Authors) and Michroma (copyright 2011 The\n"
             "Michroma Project Authors), joined, converted to TrueType and renamed GRAVITAS HUD,\n"
             "under the SIL Open Font License 1.1.\n")
    for n in ("OFL-Saira.txt", "OFL-Michroma.txt"):
        o.append("\n" + "-" * 70 + "\n" + n + "\n" + "-" * 70 + "\n" + read(TAURI / "fonts" / n))
    # kokoro
    o.append("\n" + "=" * 70 + "\nPART 4. VOICE\n" + "=" * 70 + "\n")
    o.append("\nThe jump countdown voice (src/assets/audio) was generated for GRAVITAS with the\n"
             "Kokoro-82M text-to-speech model (hexgrad/Kokoro-82M, https://huggingface.co/hexgrad/Kokoro-82M),\n"
             "Apache License 2.0. The generated audio files contain no model code. Apache 2.0 text:\n"
             "https://www.apache.org/licenses/LICENSE-2.0\n")
    OUT.write_text("".join(o), "utf-8", newline="\n")
    print(f"{OUT.name}: {OUT.stat().st_size} bytes, {len(crates)} crates, {len(texts)} distinct licence texts")
    print("Crates without a licence file (%d):" % len(missing))
    for m in missing: print("  " + m)

main()
