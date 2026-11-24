# Building from source

## The website

Needs Python 3. Node.js is needed for minifying (esbuild, `cd tools && npm install`), for running locally and for publishing. Without esbuild the build still works, unminified.

```bash
python tools/build.py              # makes site/ from src/
npx wrangler pages dev site        # runs it locally, functions included
```

Parts of the site are `src/js/NN-*.js` (joined in order into one module), `src/lazy/*.js` (loaded when opened) and `src/css/app.css`. Do not add `<link rel=modulepreload>` for the modules: Cloudflare turns it into an early-hint header that loads them before the import map.

Safe checks that need no private data:

```bash
node tools/test_room.mjs
node tools/test_system_fallback.mjs
node tools/test_scan.mjs
```

## The app (Windows)

Needs Node.js, Rust (MSVC toolchain) and the Visual Studio Build Tools with the C++ workload.

```bash
cd app
npm install
npx tauri build                    # installer: src-tauri/target/release/bundle/nsis/
```

`cargo build` in `app/src-tauri` builds the program without the installer. `--features store` makes the Microsoft Store build: no updater, no developer switches, no second copy of the settings folder.

### Tests, honestly

Many of the app's tests are **parity tests**: they replay recorded Journals and compare the result with a reference. The recordings hold real commander data and are kept private, so **in a public checkout `cargo test` is mostly skipped or red**. Use `cargo build` and the Node and Python checks above. Contributors do not need the private fixtures: describe what you changed and how you tried it.

### Useful settings

- `GRAVITAS_JOURNAL_DIR` points the Journal reader at another folder (a moved Saved Games folder, tests).
- `GRAVITAS_DATA_DIR` uses another settings folder.

### Languages

One file per language in `app/src/lang/` (`en` is the reference, a missing word shows in English). Overlay sentences are in `app/src-tauri/lang_hud/`.
