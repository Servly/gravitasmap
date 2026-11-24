# GRAVITAS app

A free, fan-made Windows companion for Elite Dangerous. It reads the files the game itself writes (the Journal and Status.json) on your PC and does not upload them. Beta, built with [Tauri 2](https://tauri.app) and the Windows WebView2 runtime.

Players: see [docs/app.md](../docs/app.md). Privacy: [PRIVACY.md](../PRIVACY.md), section "The GRAVITAS app".

## What it has

- **Map window**: the website's map and 3D orrery in a window of its own, following your jumps without a folder question. Collisions, Sonification and Lenses open there. The System map can also be a panel over the game.
- **Overlay panels**: Combat (bounty counter, claims, targets, kill feed, current fight, reports), Thargoid (Xeno Hunt), Debrief and PVP (both off until switched on). Click-through, never take the mouse or keyboard, shown only while the game is in front. Placed with Edit HUD in the in-game menu (default key Ctrl+Shift+K).
- **Phone and tablet pairing**, key bindings, profiles per ship, six languages (`src/lang/`, English is the reference).
- **Updates** from a signed `version.json` on gravitasmap.com: a small update installs when the app is opened, otherwise the app only tells you. The Microsoft Store build (`--features store`) has no updater.
- On Foot is planned.

## Layout

```text
src/             the window: plain HTML, CSS and JavaScript, no framework; lang/*.json
src-tauri/src/   Rust: journal.rs (Journal reader), host/live (overlay logic), hud/ (drawing), updater.rs, pairing.rs, mapfeed.rs
src-tauri/engine the combat engine shared with the site
src-tauri/lang_hud, lang_th   overlay sentences in six languages
```

## Build

You need Node.js, Rust (MSVC) and the Visual Studio Build Tools with the C++ workload.

```bash
npm install
npx tauri build      # the installer ends up in src-tauri/target/release/bundle/nsis/
```

`cargo build` in `src-tauri` builds the program alone. `--features store` builds the Store variant.

## Tests

Most of the app's tests are parity tests that replay recorded Journals. The recordings hold real commander data and are not published, so **in a public checkout `cargo test` is mostly skipped or red**. Use `cargo build` plus the checks in [docs/building.md](../docs/building.md).

`GRAVITAS_JOURNAL_DIR` points the reader at another Journal folder. `GRAVITAS_DATA_DIR` uses another settings folder.

## Rules this app keeps

- Only the game's own files and public data. No reverse engineering, no reading the game's memory.
- Light on the PC: nothing animates forever, hidden windows stop polling, no ads, no tracking.
- Overlays never take focus, mouse or keyboard from the game.
- The server can only say that a newer version exists: it can never change how the app behaves.
