# The GRAVITAS app

A free, fan-made Windows companion for Elite Dangerous. Built with Tauri 2 and the Windows WebView2 runtime. Source: [`app/`](../app).

## What it does

- **Map window.** The website's map and 3D orrery in a window of its own. It follows your jumps by itself, with no folder question: the app reads your Journal and hands the window only the events the map needs. The System map can also be shown as a panel over the game (off by default).
- **Overlay panels over the game.** Click-through, never take the mouse or keyboard, and appear only while the game is in front. Move them with **Edit HUD** in the in-game GRAVITAS menu.
- **Modes.**
  - **Combat**: bounty counter, claims, targets by value, kill feed, current fight, time to kill, and a report after each fight.
  - **Thargoid**: Xeno Hunt windows and a report while Thargoids are about.
  - **Debrief** (off until you switch it on): which ship keys you pressed and how a fight went.
  - **PVP** (preview, off until you switch it on): one file per fight that you can send to the other commander and compare.
  - **Collisions, Sonification, Lenses**: open in the map window.
  - **On Foot**: planned.
- **Phones and tablets.** Pair a device as a second screen (up to four). The list is the same in the app, the map window and the website.
- **Menu over the game.** Default key Ctrl+Shift+K. Keys are changeable on the Key Bindings page.
- **Six languages**: English, German, French, Spanish, Brazilian Portuguese, Russian (the non-English texts are drafts).

## Requirements

Windows 10 or 11 (64-bit). Elite Dangerous in **Borderless** or **Windowed** mode. The WebView2 runtime (part of current Windows).

## Install

1. Open [gravitasmap.com](https://gravitasmap.com) and press **App** in the Sync card.
2. Download the installer. Check its SHA-256 against the one shown there.
3. Run it. It installs for your user only, no administrator rights.

The Microsoft Store version is coming soon.

## Update

The app asks `gravitasmap.com/gravitas-app/version.json` when it opens and every few hours. The file is signed, and the installer's hash is inside it. A small update installs only as the app is opened. While it is open it only says "new version" and you press **Update**. The server can never change how the app behaves.

## Uninstall

Windows **Settings > Apps > Installed apps > GRAVITAS > Uninstall**.

## Where its files are

| What | Where |
|---|---|
| Program | `%LOCALAPPDATA%\GRAVITAS` |
| Settings, past fights, recordings, PVP files | `%APPDATA%\com.gravitasmap.app\` |
| Second copy of your settings and history | `%LOCALAPPDATA%\GRAVITAS-backup\` |
| Log | `gravitas.log` in the app's data folder |

All of it stays on your computer. Delete the folders by hand if you want nothing left. If the app cannot read one of its own files it keeps it as `<name>.bad-<time>` and uses the backup copy.

## Antivirus notes

The app uses Windows calls that read key states and the mouse (to hide panels when you look around, and, only if you switch Debrief on, to show the ship keys you press). Some antivirus programs judge unsigned programs by behaviour and may warn. The installer is unsigned today. Signing is planned with the Store build. The exact list of what is read and why is in [PRIVACY.md](../PRIVACY.md) under "The GRAVITAS app". If your antivirus warns, [open an issue](https://github.com/Servly/gravitasmap/issues/new/choose) with the program name and the detection name.

## Diagnostics

**About > Copy diagnostic report** copies counts of what the game wrote that this version did not know. It holds no names or paths and sends nothing.
