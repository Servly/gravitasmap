# Releasing

How the website, the app, the Store and GitHub stay in step. Release steps are run by the owner, never by automation.

## The rule

One release is the same everywhere: version numbers, notes in six languages, installer hash, live files. Check with:

```bash
python tools/release_check.py            # local files only
python tools/release_check.py --online   # plus the live site
```

It prints PASS, WARN or FAIL, writes nothing and deploys nothing.

## Site

1. Change `src/`, run `python tools/build.py`, check it locally.
2. Bump `APP_VERSION` (`src/js/20-quality.js`), add a *What's new* entry (`src/lazy/changes.js`), run `python tools/changelog.py` (writes `CHANGELOG.md`).
3. The owner runs `tools\deploy.bat` (pairing worker, then Cloudflare Pages).
4. Check live: the page loads, Sol opens, `/api/system` answers.

## App

1. Build and sign: `python tools/app_release.py --notes "..."`. It builds the installer, copies it to `site/gravitas-app/` and writes `version.json`, signed with a key that never leaves the owner's computer.
2. The owner runs `tools\deploy_app.bat`. **Site first, then app**: the app loads the live site.
3. Check live: `version.json` shows the new version and the installer's SHA-256 matches.
4. Scan the final installer (VirusTotal and, when possible, other engines) before telling testers.

## Microsoft Store

The Store build is `cargo build --features store` (no updater: the Store updates the app). It is not listed yet. When it is, the site's Store card changes from "coming soon" to a link.

## GitHub

The public repository is a clean copy of this source made by `tools/github_export.py` from an allow list, then scanned for anything private. Publishing it is the owner's step. Private files (signing key, report mail settings, recorded Journals, problem reports) are never in the copy.

## Never

- No deploy or push by an assistant.
- No remote switch that changes how the app behaves: the server may only say that a newer version exists.
