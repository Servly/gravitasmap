# How GRAVITAS reads your journal, and how to check it yourself

GRAVITAS's code does not upload or store your Elite Dangerous journal. This page says exactly what it reads, what it sends and when, where that happens in the code, and how you can watch it in your own browser.

## In short

- Your browser reads the journal files itself. The files are not uploaded.
- GRAVITAS asks the browser for **read-only** access to the folder you choose. It cannot write, change or delete anything there.
- What goes out because of your journal is the **name of a star system**, so the map can show it. That is the same request as typing the name in the search box.
- Combat reports and settings stay in your own browser. GRAVITAS's server does not receive them, except the parts you choose to share (below).
- Sharing with your own phone, or with your team, happens only when you switch it on. What goes where is listed below.

## What Sync and Combat Mode read

Where you are and where you jump, your route and jump range, your carriers, your target, and for Combat Mode the fight: the ships you scan and their bounty, your kills, the attacks on you, your loadout, your combat rank, your team's names, the active Operation, and what NPCs say to you. Of your team's chat, only how many lines each one wrote is counted, never the words. All of it is read and kept in your browser's memory.

## Where it happens in the code

| Step | File · function | What it does |
|---|---|---|
| You choose the folder | `src/js/30-sync.js` · `syncDialog` | `showDirectoryPicker({ mode: "read" })`: the browser asks you, and gives read-only access |
| The folder is remembered | `src/js/30-sync.js` · `syncDB` | Keeps the folder **handle** (the permission, not the files) in the browser's own IndexedDB, so you don't choose it again |
| The newest journal is found | `src/js/30-sync.js` · `syncScan`, `syncNewest` | Lists the folder in your browser |
| New lines are read every second | `src/js/30-sync.js` · `syncTick` | `file.slice(...).text()`: reads only the new part of the file, in memory |
| Each line is understood | `src/js/30-sync.js` · `syncLine`, `src/js/42-combat.js` · `cbEvent`, `src/js/41-own-carrier.js` · `fcEvent` | Picks out the things listed above. The rest of the line is ignored |
| The map follows you | `src/js/30-sync.js` · `syncFollow` → `src/js/23-data.js` · `loadSystem` | Asks `/api/system?name=<system>`. Only the system's name |
| Combat reports | `src/js/42-combat.js` · `cbSave` | `localStorage` in your browser, the last 30. Not sent |

The server side is in this repository too:
- `functions/api/system.js`: takes a system name, asks Spansh, answers. Spansh's answer for that system is kept in Cloudflare's cache for an hour, shared by everyone. Nothing about who asked is kept with it.
- `functions/api/autocomplete.js`: the search box's suggestions, cached the same way by the text typed.
- `functions/api/room.js` and `worker/src/room.js`: the phone pairing and the team board (see below).
- `functions/api/report.js`: problem reports, only when you send one.

## Only when you switch it on

| Feature | What goes out | Kept? |
|---|---|---|
| A phone or tablet as a second screen (`src/js/33-pair.js`) | The short "where am I" summary the Sync card shows, and in a fight the combat screen, to **your** paired devices | The server keeps the latest "where am I" summary for up to 12 hours after the last device leaves. The combat screen is passed on and not kept (see the note below) |
| Team board (`src/js/43-opboard.js`) | Your CMDR name, ship, kills, credits and top kill, to the people who have the board's link | Not kept: your row lives only on your open connection |
| Report a problem (`src/js/27-report.js`) | What you write, your screenshots, and the details shown in the report window | Sent by e-mail to the developers |

**A note on earlier versions.** From v0.91 to v0.91.7, with a phone or tablet paired, the combat screen was kept in the pairing room together with the "where am I" summary, for up to 12 hours after the last device left. It held your CMDR name, your kills and your team's names. It was not your journal, but our privacy text did not say so. We found it ourselves and changed it in v0.92: since then the combat screen is only passed on.

## GRAVITAS for EDMC (the plugin)

The plugin (`plugin/GRAVITAS/`, in testing) runs inside E:D Market Connector on your computer. It reads the Journal and
Status.json that EDMC gives it, works out the fight with the same code as the site (`plugin/GRAVITAS/engine/`, a copy of
`src/js/42-combat-engine.js`) and draws it with an overlay plugin. It opens no network connection: its own code imports no `socket`, `urllib`, `http.client` or
`requests` (search `plugin/GRAVITAS/` for `import`). (The overlay plugin it draws
with talks to its own helper on your computer, 127.0.0.1.)

## What we cannot see or control

- **Hosting.** GRAVITAS runs on Cloudflare. Like any host, Cloudflare handles your IP address to deliver the pages and keeps short technical logs of the requests. Those requests include the names of the systems your map asks for, so in Cloudflare's logs a series of them could show where you travelled. GRAVITAS itself does not keep these, and does not read them to follow anyone.
- **Your own computer.** Browser extensions and security software can add their own code to any page. The site's rules tell your browser to block scripts that are not GRAVITAS's own, but we cannot answer for what runs outside the site.

## Check it yourself, in your browser

You do not need to read code to check this.

1. Open https://gravitasmap.com in Chrome or Edge.
2. Press **F12** and open the **Network** tab.
3. Turn on **Sync with the game** and play for a while: jump, dock, fight.
4. Watch the list. You will see:
   - `system?name=...` when you arrive in a new system,
   - the site's own files (`app.*.js`, pictures, sounds),
   - and only if you switched them on: `room` (pairing, team board) and `report`.
5. Click any request and look at its URL or **Payload**. You will not find a journal line.

Every network call the app makes is a `fetch(` or `new WebSocket(` in `src/js/`. You can search for them. The site's Content-Security-Policy (`tools/_headers`) tells the browser to run only GRAVITAS's own code and the 3D library, and to connect only to gravitasmap.com.

## No tracking

No accounts, no analytics, no ads. GRAVITAS sets no cookies. There is no analytics or tracking code in this repository.

If you find anything that does not match this page, please open an issue here or use **Report a problem** on the site. We will correct it and say so in the changelog.
