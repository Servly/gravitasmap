# Contributing to GRAVITAS

Thank you for helping. GRAVITAS is a small, fan-made project with one maintainer, so please keep changes focused.

## Good first contributions

- Wrong or odd game terms, and translation fixes (`app/src/lang/*.json`, `app/src-tauri/lang_hud/*.json`)
- Bug reports with steps to reproduce (use the issue templates)
- Notes on what the game writes that GRAVITAS does not know yet (in the app, About, *Copy diagnostic report*)

## The rules of the project

- **Only the game's own files and public data.** No reading of the game's memory, no reverse engineering, no changing the game.
- **No ads, no tracking, no analytics.** Privacy claims must be exact: if a change reads a file or makes a network call, update [PRIVACY.md](../PRIVACY.md) and the README in the same change.
- **Nothing invented on the map.** Where the data or the model differs from the game, say so.
- **Light on the PC.** The app runs next to a game: no endless animation, no polling that is not needed.
- **Every control gets a hover tip** (`tip.<name>` in all six app language files).
- **English** for code, comments and text. Other languages are drafts a native speaker can improve.
- **No private data** in issues, pull requests or test files: no Journal files, no real CMDR names, no keys.

## How to build

See [docs/building.md](../docs/building.md). The big parity tests need recordings that are not public, so a public `cargo test` is mostly skipped or red. Say in your pull request what you tried.

## How a change gets in

This repository is a published copy of the maintainer's source folder. A pull request is read here, an accepted change is applied to the source, and it appears in the next published release. It may take a while.

Please open an issue first for anything big.
