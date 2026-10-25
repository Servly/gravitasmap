# GRAVITAS for EDMC

Combat Mode from [GRAVITAS](https://gravitasmap.com) on top of the game, for CMDRs who play on one screen.
A plugin for [E:D Market Connector](https://github.com/EDCD/EDMarketConnector). Free, MIT licence.

**In testing.** Version 0.1.1: Combat Mode. Thargoid Mode and Route Mode are planned.

## On your computer only

The plugin reads the Journal and Status.json that EDMC already reads, and works out the fight on your computer.
It opens no network connection and needs no browser. It runs the same Combat Mode code as the GRAVITAS site
(`engine/combat-engine.js`), in QuickJS, a small JavaScript engine (`lib/`).

## Install

1. In EDMC: File > Settings > Plugins > Open. Unzip this folder there, so you have `plugins\GRAVITAS\load.py`.
2. Restart EDMC. Its main window shows a GRAVITAS line: "engine ready · HUD on the game" (or "waiting for the game window").

Nothing else to install. GRAVITAS draws with its own overlay: a see-through window over the game that lets every click
through and never touches the game itself. It works with the game in borderless or windowed mode (fullscreen is being tested).

## Settings (File > Settings > GRAVITAS)

Each window (Status, Target, Targets by value, Kill feed, This fight, Takedown speed) can be switched on or off,
moved with the arrows or the x and y numbers (a percent of the game window), and coloured. Size: small, normal, large. **Preview** shows them all in the game for 20 seconds
while you place them. **Game colours** puts back the game's orange.

## Folders

```
load.py                  what EDMC loads
gravitas_edmc/           the plugin: engine host (engine.py), the HUD (hud.py), settings
gravitas_edmc/modes/     one file per mode (combat.py)
engine/                  the site's combat engine, copied by tools/plugin_build.py
lib/                     QuickJS for 32 and 64-bit Windows and Linux (quickjs-ng, MIT)
```
