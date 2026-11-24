"""Makes a GRAVITAS APP release ready for the server (it does NOT deploy: tools\\deploy_app.bat does that, run by Burak).

  python tools\\app_release.py --notes "What is new, in a sentence" [--breaking] [--minimum 0.5.0] [--no-build]

 1. builds the installer (npx tauri build in app\\), unless --no-build
 2. copies it to releases\\GRAVITAS_v<version>_x64-setup.exe (never over an existing different file) and to site\\gravitas-app\\
 3. writes site\\gravitas-app\\version.json, signed with tools\\app_update_key.private (ed25519: tools\\appsign)
    The app checks that signature with the public key inside it, then the installer's SHA-256 named in the signed file.

 version.json = {"latest", "minimum", "breaking", "url", "sha256", "size", "notes", "published", "signature"}
   breaking / minimum: the app only ANNOUNCES them ("a bigger update is needed", with an Update button); a small update installs by itself
   only as the app is opened, never while it is open. Nothing else ever comes from the server: no settings, no code, no switches.
The private key never leaves this computer (never in the GitHub copy)."""
import argparse
import datetime
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"
SITE_DIR = ROOT / "site" / "gravitas-app"
KEY = ROOT / "tools" / "app_update_key.private"
SIGN = ROOT / "tools" / "appsign" / "target" / "release" / "appsign.exe"
BASE = "https://gravitasmap.com/gravitas-app/"


def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode:
        sys.exit(f"failed: {' '.join(map(str, cmd))}\n{r.stdout}\n{r.stderr}")
    return r.stdout.strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--notes", required=True)
    ap.add_argument("--breaking", action="store_true")
    ap.add_argument("--minimum", default="0")
    ap.add_argument("--no-build", action="store_true")
    a = ap.parse_args()
    if not KEY.exists() or not SIGN.exists():
        sys.exit("the signing key or tools\\appsign is missing (cargo build --release in tools\\appsign; the key is made once with: appsign keygen tools\\app_update_key.private)")
    conf = json.loads((APP / "src-tauri" / "tauri.conf.json").read_text(encoding="utf-8"))
    version = conf["version"]
    if not a.no_build:
        env = dict(os.environ, PATH=os.environ["PATH"] + os.pathsep + str(Path.home() / ".cargo" / "bin"))
        subprocess.run("npx tauri build", cwd=APP, shell=True, env=env, check=True)
    built = APP / "src-tauri" / "target" / "release" / "bundle" / "nsis" / f"GRAVITAS_{version}_x64-setup.exe"
    if not built.exists():
        sys.exit(f"{built} is not there: build first")
    rel = ROOT / "releases" / f"GRAVITAS_v{version}_x64-setup.exe"
    if rel.exists() and rel.read_bytes() != built.read_bytes():
        sys.exit(f"{rel.name} exists and is different: bump the version (never overwrite a release)")
    if not rel.exists():
        shutil.copy2(built, rel)
    SITE_DIR.mkdir(parents=True, exist_ok=True)
    name = f"GRAVITAS_{version}_x64-setup.exe"
    shutil.copy2(rel, SITE_DIR / name)
    sha = run([SIGN, "sha256", SITE_DIR / name])
    info = {"latest": version, "minimum": a.minimum, "breaking": a.breaking, "url": BASE + name, "sha256": sha,
            "size": (SITE_DIR / name).stat().st_size, "notes": a.notes, "published": datetime.date.today().isoformat()}
    msg = f"{version}|{sha}|{BASE + name}|{a.minimum}|{'true' if a.breaking else 'false'}"
    info["signature"] = run([SIGN, "sign", KEY, msg])
    (SITE_DIR / "version.json").write_text(json.dumps(info, indent=2), encoding="utf-8")
    print(f"ready: site\\gravitas-app\\{name} and version.json ({version}, breaking={a.breaking}, minimum={a.minimum})")
    print("next: tools\\deploy_app.bat (publishes it); older apps see it the next time they check")


if __name__ == "__main__":
    main()
