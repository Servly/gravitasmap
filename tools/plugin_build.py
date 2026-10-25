"""v0.93: build GRAVITAS for EDMC (the plugin) from this folder.

    python tools\\plugin_build.py

1. copies the site's combat engine (src/js/42-combat-engine.js) into plugin/GRAVITAS/engine/, so the plugin runs the
   same Combat Mode code as the site, and stamps it with the site's version
2. checks every text file of the plugin for anything private (the same check as the GitHub export)
3. makes plugin/dist/GRAVITAS-plugin-v<version>.zip, with one folder GRAVITAS inside: unzip it into EDMC's plugins folder
Nothing in this folder is deleted.
"""
import hashlib, re, sys, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PL = ROOT / "plugin" / "GRAVITAS"
sys.path.insert(0, str(ROOT / "tools"))

def main():
    eng = (ROOT / "src/js/42-combat-engine.js").read_text("utf-8")
    site = re.search(r'APP_VERSION = "([^"]+)"', (ROOT / "src/js/20-quality.js").read_text("utf-8")).group(1)
    (PL / "engine").mkdir(exist_ok=True)
    (PL / "engine" / "combat-engine.js").write_text(eng, "utf-8")
    (PL / "engine" / "VERSION").write_text(f"{site} {hashlib.sha256(eng.encode()).hexdigest()[:10]}\n", "utf-8")
    ver = re.search(r'VERSION = "([^"]+)"', (PL / "load.py").read_text("utf-8")).group(1)
    import github_export
    files = [f for f in sorted(PL.rglob("*")) if f.is_file() and "__pycache__" not in f.parts]
    bad = []
    for f in files:
        if f.suffix.lower() in github_export.TEXT:
            t = f.read_text("utf-8", errors="replace")
            bad += [f"{f.relative_to(ROOT)}: {what}" for rx, what in github_export.BAD if rx.search(t)]
    if bad:
        sys.exit("Stopped. Private things found:\n  " + "\n  ".join(bad))
    out = ROOT / "plugin" / "dist" / f"GRAVITAS-plugin-v{ver}.zip"
    out.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for f in files:
            z.write(f, "GRAVITAS/" + f.relative_to(PL).as_posix())
    print(f"{out} ({len(files)} files, combat engine {site}). Unzip it into EDMC's plugins folder.")

if __name__ == "__main__":
    main()
