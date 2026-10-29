# Notices

GRAVITAS's own code is under the MIT licence (see `LICENSE`). These parts are not ours and keep their own terms.

## Libraries
- **three.js** 0.160.0, `src/vendor/three@0.160.0/`: MIT licence, © three.js authors. Its licence is in that folder. A copy of its `OrbitControls.js` with one line patched is in `src/vendor/gravitas-patches/` (marked "GRAVITAS v0.92.1 patch"): the mouse wheel zoom broke when the browser was zoomed below 100 %.
- **QR Code Generator** 1.4.4, `src/vendor/qrcode-generator@1.4.4/`: MIT licence, © Kazuhiko Arase.

## Names, data and images
- **Elite Dangerous** is a trademark of Frontier Developments plc. GRAVITAS is a fan-made project. It is not made, endorsed or supported by Frontier Developments.
- **System data** comes from [Spansh](https://spansh.co.uk) at the moment you open a system. No Spansh data is stored in this repository.
- **The list of colliding orbits** (`src/assets/coll-pairs.json`, used by Collisions) comes from [Canonn Research](https://canonn.science), who shared it openly and allowed GRAVITAS to use it, with Canonn named as the source. It holds the pairs only (systems, bodies, flags). Every collision time in GRAVITAS is worked out by GRAVITAS. The data is Canonn's and is not covered by the MIT licence.
- **The Turkish Galactic Empire [TRGE] emblem and banner** (`src/assets/trge-*`) belong to the TRGE squadron. They are used here with the squadron's permission and are **not** covered by the MIT licence. Please do not reuse them.
- **The GRAVITAS logo** (`src/assets/gravitas-logo*`) is part of this project.
- **Sounds** (`src/assets/audio/`): the sound effects and the Combat Mode cues were made for GRAVITAS by synthesis in code. The jump countdown voice was generated for GRAVITAS with the open Kokoro-82M text-to-speech model (Apache 2.0 licence).
- **Planet surface textures** (`src/assets/tex/`): generated for GRAVITAS from noise in code. They are representative looks, not maps of real bodies.
