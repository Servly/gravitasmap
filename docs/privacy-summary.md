# Privacy in plain language

This page is a summary. **[PRIVACY.md](../PRIVACY.md) is the exact text**, with the file and function for every step and instructions to check it yourself. If the two ever differ, PRIVACY.md wins and we will fix this page.

## The short version

- GRAVITAS reads the files Elite Dangerous writes on your PC (the Journal and Status.json), read-only.
- **They are not uploaded.** On the website your browser reads them. In the app the app reads them.
- What goes out because of them is the **name of a star system**, so the map can show it.
- No accounts, no ads, no analytics, no cookies.

## What leaves your computer

| When | What |
|---|---|
| You open or follow a system | The system's name, to gravitasmap.com (which asks Spansh) |
| The app checks for updates | A plain request for a signed `version.json`. No name, no ID. The user agent says only `GRAVITAS-app/<version>` |
| You pair a phone or tablet | The short "where am I" summary and, in a fight, the combat screen, to your own devices. The server keeps the summary up to 12 hours |
| You add your fight to a team board | CMDR name, ship, kills, credits, top kill, to people with the link. Not kept |
| You send a problem report | What you wrote, your screenshots and the details shown |

## What stays on your computer

Settings, combat, Thargoid, Debrief and PVP records, and recordings are files on your PC (see [the app page](app.md)). Debrief and PVP are off until you switch them on, and PVP files hold no key or mouse data.

## What we cannot see or control

Cloudflare hosts the site and keeps short technical logs of requests, which include system names. Browser extensions and security software can add code to any page.

## Check it yourself

Open the site, press F12, open **Network**, turn on Sync and play. You will find system names and the site's own files, and no Journal line. Steps are in PRIVACY.md.
