# GRAVITAS · live system map and eclipse calendar for Elite Dangerous

Free, fan-made website: **https://gravitasmap.com**
Made by CMDR Hongark and Claude (an AI assistant by Anthropic). System data from [Spansh](https://spansh.co.uk). Hosted on Cloudflare.

No accounts, no ads, no tracking, no analytics. This repository is public so that anyone can check what GRAVITAS reads and what it sends.

## Your journal stays on your computer

The full explanation, with every step in the code and how to check it yourself in your browser: **[PRIVACY.md](PRIVACY.md)**.

"Sync with the game" and Combat Mode read your Elite Dangerous journal files **in your browser**, with the browser's own folder access (File System Access API). The files are not uploaded. You can check every step:

| What | Where in the code | What leaves your computer |
|---|---|---|
| Reading the journal and Status.json | `src/js/30-sync.js`, `src/js/42-combat.js` | Only the **name of a system** when GRAVITAS opens it, the same as typing it in the search box (`/api/system?name=…`) |
| Combat Mode, combat reports | `src/js/42-combat.js` | Nothing. Reports are kept in your browser (`localStorage`), the last 30 |
| A phone or tablet as a second screen | `src/js/33-pair.js`, `worker/src/room.js` | Only when you pair a device: the short "where am I" summary the Sync card shows, and in a fight the combat screen. The server keeps the latest "where am I" summary for up to 12 hours. The combat screen is only passed on, not kept |
| Team board | `src/js/43-opboard.js`, `worker/src/room.js` | Only when you choose to add your fight: your CMDR name, ship, kills, credits and top kill, to the people with the board's link. The server keeps nothing: your row lives only on your open connection |
| Problem reports | `src/js/27-report.js`, `functions/api/report.js` | Only when you send one: what you wrote, your screenshots and the details shown in the report window |

Every network call the app makes is a `fetch(` or `new WebSocket(` in `src/js/`. Search for them. The direct link between your computer and your own phone on the same Wi-Fi is WebRTC with no outside servers (`iceServers: []` in `src/js/33-pair.js`).
The page's Content-Security-Policy (`tools/_headers`) lets the browser run only the site's own code and three.js, and connect only to the site itself.

## Folders

```
src/            the app's source
  _shell.html     page markup
  css/app.css     all styles
  js/NN-*.js      the app in numbered parts, joined in order into one file by the build
  assets/         logos, textures and sounds
  vendor/         three.js and a QR code library (MIT)
functions/      the site's server on Cloudflare Pages: /api/system, /api/autocomplete, /api/room, /api/report
lib/            helpers shared by the functions (Spansh calls)
worker/         the small pairing and team-board server (a Cloudflare Durable Object)
plugin/GRAVITAS GRAVITAS for EDMC: Combat Mode on top of the game (tools/plugin_build.py makes its zip)
tools/          build and publish scripts
```

## Build and run

You need Python 3 and, to publish, Node.js.

```
python tools/build.py            makes site/ from src/
npx wrangler pages dev site      runs it locally (the functions too)
```

`tools/deploy.bat` publishes the worker and the site to Cloudflare (Windows). Secrets live only in Cloudflare (`RESEND_API_KEY`, `REPORT_TO` for problem reports). They are never in these files.

## Rules we keep

- No ads, no tracking, no analytics scripts.
- Only the game's own files and public data. No reading of the game's memory, no reverse engineering.
- Nothing on the map is invented. Where the data or the model differs from the game, the site says so. The Accuracy tab lists the in-game tests.

## Licence

MIT, see `LICENSE`. Every release and its notes: `CHANGELOG.md` and the tags of this repository. Some parts keep their own terms (three.js, the QR code library, the TRGE squadron emblem): see `NOTICE.md`.
Elite Dangerous is a trademark of Frontier Developments plc. GRAVITAS is not made or endorsed by Frontier.
