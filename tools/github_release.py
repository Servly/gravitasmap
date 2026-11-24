"""Create the GitHub Release for the current GRAVITAS APP version with the `gh` command line tool.
DRY RUN BY DEFAULT: it only checks and prints what it would do. It creates a release (and so a tag on GitHub) ONLY with --publish.

    python tools/github_release.py                  dry run: checks, builds the notes, prints the gh command
    python tools/github_release.py --publish        really creates the release  (needs: gh installed, `gh auth login` done)
    python tools/github_release.py --publish --draft   creates it as a draft you can read on github.com first, then press Publish there
    python tools/github_release.py --app 0.9.27     another version (must be the one version.json offers to attach the installer)

Order (docs/releasing.md): deploy first, then python tools/release_check.py --online, then python tools/github_publish.py
(pushes the source and the site tag), and only then this tool: the release tag app-v<version> must point at the source of this version.

Refuses to run when:  tools/release_check.py fails (WARN is fine) | app/CHANGELOG.md is out of date |
                      the GitHub copy (..\\gravitasmap-github) differs from what tools/github_export.py would export now |
                      with --publish: gh is missing or not logged in, or the release/tag already exists.
Never pushes code, never deletes anything. It uploads the installer as a release file (the very file the website offers, hash-checked).
"""
import shutil, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
REPO = "Servly/gravitasmap"
OUTREPO = ROOT.parent / "gravitasmap-github"

def sh(*a, cwd=None):
    r = subprocess.run(list(a), cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    return r.returncode, (r.stdout + r.stderr).strip()

def main():
    a = sys.argv[1:]
    publish, draft = "--publish" in a, "--draft" in a
    import github_release_notes as N, github_export as E
    app = a[a.index("--app") + 1] if "--app" in a else N.app_version()
    print(f"GitHub release for the GRAVITAS app {app}: {'PUBLISH' if publish else 'dry run (nothing will be created)'}")
    # 1. one release, the same everywhere
    code, out = sh(sys.executable, str(ROOT / "tools" / "release_check.py"), "--app", app)
    print("\n".join(l for l in out.splitlines() if l.startswith(("FAIL", "WARN")) or "pass," in l))
    if code: sys.exit("Refused: tools/release_check.py failed. Fix the FAIL lines first.")
    code, out = sh(sys.executable, str(ROOT / "tools" / "app_changelog.py"), "--check")
    if code: sys.exit("Refused: " + out)
    # 2. the GitHub copy must be what we would export now (the tag must point at this version's source)
    if not (OUTREPO / ".git").exists(): sys.exit("Refused: the GitHub copy ..\\gravitasmap-github does not exist (run tools/github_publish.py first).")
    rels = E.rels()
    stage = Path(tempfile.mkdtemp(prefix="gravitas-rel-"))
    try:
        E.copy_to(stage, rels)
        add, rem, chg = E.diff(E.manifest(stage, rels), E.manifest(OUTREPO))
    finally: shutil.rmtree(stage, ignore_errors=True)
    if add or chg or rem:
        sys.exit(f"Refused: the GitHub copy differs from the current source ({len(add)} to add, {len(chg)} changed, {len(rem)} to remove). Run tools/github_publish.py first.")
    c, st = sh("git", "status", "--porcelain", cwd=OUTREPO)
    if st: sys.exit("Refused: the GitHub copy has uncommitted changes. Run tools/github_publish.py.")
    c, ahead = sh("git", "rev-list", "--count", "@{u}..HEAD", cwd=OUTREPO)
    if c == 0 and ahead.strip() not in ("0", ""): sys.exit(f"Refused: {ahead.strip()} commit(s) in the GitHub copy are not pushed yet.")
    # 3. the notes
    r = N.build(app)
    N.OUT.mkdir(parents=True, exist_ok=True)
    nf = N.OUT / f"GRAVITAS-app-v{app}.md"; nf.write_text(r["body"], "utf-8")
    for w in r["warnings"]: print("WARNING:", w)
    cmd = ["gh", "release", "create", r["tag"], "--repo", REPO, "--target", "main", "--title", r["title"], "--notes-file", str(nf)]
    if draft: cmd.append("--draft")
    cmd += r["assets"]
    print("\nNotes:", nf, f"({len(r['body'])} chars)")
    print("Command:", " ".join(f'"{x}"' if " " in x else x for x in cmd))
    gh = shutil.which("gh")
    if not publish:
        print("gh:", gh or "NOT INSTALLED (https://cli.github.com)", "| auth:", (sh("gh", "auth", "status")[1].splitlines() or ["?"])[0] if gh else "-")
        print("\nDry run only. Add --publish to create the release.")
        return
    if not gh: sys.exit("Refused: gh is not installed (https://cli.github.com), then run: gh auth login")
    if sh("gh", "auth", "status")[0]: sys.exit("Refused: gh is not logged in. Run: gh auth login")
    if sh("gh", "release", "view", r["tag"], "--repo", REPO)[0] == 0: sys.exit(f"Refused: the release {r['tag']} already exists.")
    code, out = sh(*cmd)
    print(out)
    if code: sys.exit(f"gh failed (exit {code}).")
    print("Done. Check the release page, then run tools/release_check.py --online once more if you like.")

if __name__ == "__main__":
    main()
