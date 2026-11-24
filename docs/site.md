# The website

**[gravitasmap.com](https://gravitasmap.com)** is a live system map and 3D orrery for Elite Dangerous. It works in a current Chrome, Edge or Firefox. Chrome and Edge also allow *Sync with the game* by reading your Journal folder in the browser (read-only).

## What is on it

- **System map**: the system drawn like the game's, with true size ratios (compressed) and landable, atmosphere, ring and station filters.
- **3D orrery**: an *Overview* (default) and *True scale*. Real orbit tilt and rotation, shadows and eclipse times at the game's time.
- **Eclipse calendar, Sky view, Station window, Journey** and a **Model check** row that says where the model differs from the game.
- **Sync with the game**: the map follows you. Combat Mode and a team board are there too.
- **GRAVITAS MODES**: Collisions (bodies passing close to each other, list from Canonn Research), Sonification (Listen, Studio, Patterns) and the Lenses (Landscape, Time).
- **Phone and tablet pairing**, **Report a problem**, a tour, and an **App** window with the installer.

## Where the data comes from

System data comes from [Spansh](https://spansh.co.uk) when you open a system, through `functions/api/system.js`. Nothing on the map is invented. If Spansh is down the site says so calmly, and for Sol only it can show a saved copy with its date.

## How it is built

`python tools/build.py` joins `src/js/NN-*.js` into one file and writes `site/`. The server side is Cloudflare Pages Functions (`functions/api/`) plus a small pairing worker (`worker/`). See [building](building.md).
