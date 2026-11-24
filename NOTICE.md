# Notices

GRAVITAS's own code is under the MIT licence (see `LICENSE`). These parts are not ours and keep their own terms. The full licence texts of the Rust libraries, the vendored JavaScript, the fonts and the voice model are in `THIRD-PARTY-LICENSES.txt` (made by `tools/make_licenses.py`, installed with the app).

## Libraries
- **three.js** 0.160.0, `src/vendor/three@0.160.0/`: MIT licence, © three.js authors. Its licence is in that folder (`LICENSE`). A copy of its `OrbitControls.js` with one line patched is in `src/vendor/gravitas-patches/` (marked "GRAVITAS v0.92.1 patch"): the mouse wheel zoom broke when the browser was zoomed below 100 %.
- **QR Code Generator** 1.4.4, `src/vendor/qrcode-generator@1.4.4/`: MIT licence, © Kazuhiko Arase. Its licence is in that folder (`LICENSE`).

## Fonts
The GRAVITAS HUD fonts (`app/src-tauri/fonts/`) are made from Saira Semi Condensed (Regular and Bold), copyright 2016 The Saira Project Authors, and Michroma (Wide), copyright 2011 The Michroma Project Authors, both under the SIL Open Font License 1.1 (`OFL-Saira.txt`, `OFL-Michroma.txt`). They were changed (converted to TrueType and renamed GRAVITAS HUD and GRAVITAS HUD Wide, as the licence asks of a changed version) and are not sold on their own.

## Rust libraries
The Windows app is built with open-source Rust crates, mostly MIT or Apache-2.0, others BSD-2/3-Clause, ISC, Zlib, Unicode-3.0, CDLA-Permissive-2.0 and MPL-2.0 (used unmodified, source at crates.io). The full list with every licence text is `THIRD-PARTY-LICENSES.txt`, shipped with the app. The Microsoft WebView2 runtime is used as installed on the PC.

## Names, data and images
- **Elite Dangerous** is a trademark of Frontier Developments plc. GRAVITAS is a fan-made project. It is not made, endorsed or supported by Frontier Developments.
- **System data** comes from [Spansh](https://spansh.co.uk) at the moment you open a system. No Spansh data is stored in this repository.
- **The list of colliding orbits** (`src/assets/coll-pairs.json`, used by Collisions) comes from [Canonn Research](https://canonn.science), who shared it openly and allowed GRAVITAS to use it, with Canonn named as the source. It holds the pairs only (systems, bodies, flags). Every collision time in GRAVITAS is worked out by GRAVITAS. The data is Canonn's and is not covered by the MIT licence.
- **The Turkish Galactic Empire [TRGE] emblem and banner** (`src/assets/trge-*`, and the copy `app/src/assets/trge-banner.png` shown on the Windows app's About page) belong to the TRGE squadron. They are used here with the squadron's permission and are **not** covered by the MIT licence. Please do not reuse them.
- **The GRAVITAS logo** (`src/assets/gravitas-logo*`) is part of this project.
- **Sounds** (`src/assets/audio/`): the sound effects and the Combat Mode cues were made for GRAVITAS by synthesis in code. The jump countdown voice was generated for GRAVITAS with the open Kokoro-82M text-to-speech model (Apache 2.0 licence).
- **Planet surface textures** (`src/assets/tex/`): generated for GRAVITAS from noise in code. They are representative looks, not maps of real bodies.
