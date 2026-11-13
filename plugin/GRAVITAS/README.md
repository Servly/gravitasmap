# GRAVITAS for EDMC

Combat Mode from [GRAVITAS](https://gravitasmap.com) on top of the game, for CMDRs who play on one screen.
A plugin for [E:D Market Connector](https://github.com/EDCD/EDMarketConnector). Free, MIT licence.

**In testing.** Version 0.37.0 (the Bounty counter shows what you can claim, at least, from every Journal since your last death, whether EDMC ran or not, and per faction; it is never set back to 0, only cashing in or dying takes it down; 0.36.0: a fight that ends in the main menu, or is still on as EDMC closes, is kept in Past combats; 0.35.0: players' feedback: no more blinking as a window's numbers change; Targets by value with the ship's type on top, clean ships last and the ship locked last first among equals, long names on one line; the Bounty counter shows what you carry unclaimed, cashed in and lost at death; ship order picked from a menu; a window to an edge or the middle in one click; Auto size for your screen; the hologram boot can be turned off; no red windows in a fight; Ctrl+Shift+F12 gone, F11 hides and shows; 0.34.0: EDMC is only GRAVITAS's home: GRAVITAS finds the game's folder, reads the Journal from its start and Status.json for the fight itself; 0.33.0: GRAVITAS reads the whole Journal itself: fights, targets and bounties up to a second sooner; 0.32.0: a measurement of how late EDMC hands the Journal over; 0.31.0: the Journal's map music read at once, Ctrl+Shift+F7 for free look; 0.30.0: 10 MB instead of 58; 0.29.0: the maps hide the HUD at once; 0.27.0: free look kept in step with the game; 0.26.0: the combat report only as a fight ends, with a countdown, and Ctrl+Shift+F8 for it; the Bounty counter per fight; This fight and Takedown speed keep the last fight; 0.25.0: places of your choosing with the role and right panels too; 0.24.0: free look ended at a side panel: no window of that panel flashes up ahead; 0.23.0: free look stays through the panels, a Default button; 0.22.0: panel holograms timed to the game's panels, the dark ground no longer moves the windows, free look as the game's own, the game's look only; 0.21.0: every window boots up as it comes into view, the main panel's left, right and top, a size of your own, how many targets, a Keys card; 0.20.0: smooth and sure panel changes; 0.19.0: profiles per ship, the comms and role panels' own places, four windows to start with; 0.18.0: shows only in the cockpit, boots up as a hologram, pilot ranks, no sound; 0.17.0: settings in four tabs, the cockpit tracking taken out): Combat Mode, with the combat report, Past combats, and windows that sit as panels of the game, in its perspective and its look, and hold on to the game's own HUD panels as they sway and zoom. Thargoid Mode and Route Mode are planned.

## On your computer only

The plugin reads the game's Journal and Status.json itself, from the game's own folder (Saved Games\Frontier
Developments\Elite Dangerous, or the folder chosen in EDMC's settings), only reading, never writing, and works out the
fight on your computer. Since v0.34.0 EDMC is only its home (its window, settings and log): EDMC's copies of the same
lines are used only if GRAVITAS has not read them first.
It opens no network connection, needs no browser and never reads the screen (v0.17.0: the experimental cockpit
tracking, which read parts of the game window, is gone). It runs the same Combat Mode code as the GRAVITAS site
(`engine/combat-engine.js`), in QuickJS, a small JavaScript engine (`lib/`).

## Install

1. In EDMC: File > Settings > Plugins > Open. Unzip this folder there, so you have `plugins\GRAVITAS\load.py`.
2. Restart EDMC. Its main window shows a GRAVITAS line with the version (and what is wrong, if the engine cannot start).

Nothing else to install. GRAVITAS draws with its own overlay: a see-through window over the game that lets every click
through and never touches the game itself. It works with the game in borderless or windowed mode (fullscreen is being tested).

## What it shows

**Keys card (v0.21.0, on at first):** each time the HUD comes on in the cockpit, a card at the top in the middle lists
GRAVITAS's shortcuts (Ctrl+Shift+F7 to F11) for 10 seconds, counting down. Turn it off in the Windows tab.

In a fight, as on the site's combat screen: the Status chip (Hostiles near, In combat, Fight over, Ship lost), an
interdiction (pulled, dropped, submitted, escaped), your target with its shield, hull and module and how fast they
came down since your last lock, Targets by value (or by your own ship order) with each one's shield and hull, the kill
feed with bonds, This fight and Takedown speed.

After a fight: the combat report on the game for a minute (top kills, the ships that got away, time, kills a minute),
and kept in **Past combats** (the button on GRAVITAS's line in EDMC's main window): the last 30 fights, on this
computer only (`gravitas_combats.json` in EDMC's own folder). Copy for Discord, Show in the game for 20 s, Delete.

Scanning a wanted ship lights Hostiles near: the cards show in orange, and each new wanted ship you scan keeps them up.
**Combat report (v0.26.0):** it shows only as a fight with shooting ends (seen live: never from an old fight as the
game starts, which it did), for 10 seconds (the Targets tab sets how long), counting down in red (in cyan on a red
window, so the number always stands out). Ctrl+Shift+F8 brings the last fight's report back, or sends it away at once;
it shows even with its window off. As the report comes, the Bounty counter starts again from 0 (per fight now), and
This fight (then "Last fight") and Takedown speed keep showing the last fight until the next one: never cleared.
A fight is over 8 seconds after the game says so itself (its combat music ends and "in danger" goes off in
Status.json); the site's engine waits 45 seconds of that calm, which made the report come late. (In an Operation its
lulls are part of it: the 45 seconds stay.)
Last fight's TIME is the whole fight, first fire to the end; Takedown speed's is from your first hit on a ship to its
end (the average, and the fastest).

When the shooting starts, a big COMBAT banner shows for 4 seconds (v0.18.0: no sound any more; v0.35.0: the cards keep
their own colour, red letters were hard to read).

**Only in the cockpit (v0.18.0):** the HUD shows once the game is loaded and you sit in your ship or fighter: not in
the intro, the main menu or a loading screen (the Journal says so: LoadGame and the menu's music hide it, Location and
the like show it), not on foot. When it shows, each window boots up as a hologram, one after another from the top:
a bright beam opens, the window unfolds from it flickering, and one scan line sweeps down over it (half a second;
Preview does it too). Each step is a picture made from the window's own, only while it boots (under a millisecond).

**The game's own look (default):** no boxes, as the game's panels: thin orange lines, a name over a long line with a
slanted tab, square letters that glow (fonts/, GRAVITAS HUD, from the open fonts Saira and Michroma), bars in segments
like the fuel bar, labels in a thin frame like INFO. Red in a fight. A setting puts each panel on a dark, see-through ground with a
thin orange line along its top and bottom, as SrvSurvey's panels. The panels keep their place on the game window, show softly when the game comes in front and
hide at once when it does not. "GRAVITAS cards" in the settings brings back the dark cards.

## Bounty counter and keys (v0.16.0)

From the Bounty Counter script of our squadron: the **Bounty counter** window adds up every bounty paid for a ship you
destroyed this game session (all factions, whoever pays), with the number of kills. It counts from the start of the
game session, or from when EDMC started if that was later; since v0.26.0 it starts again from 0 as each fight's
report comes (the bounties of one fight). A setting adds combat bonds too. Nothing is kept on disk.

Since v0.37.0 it also shows **To claim, at least**: the bounty vouchers you carry, from every Journal since your last
death (gravitas_edmc/claims.py), so also what you earned while EDMC was closed, with the factions that pay most. It is
never set back to 0: only cashing in (RedeemVoucher) or dying takes it down. "At least": the game sometimes pays more
than its Bounty lines say (about 7.5 % more for some factions, mostly on bounties shared with a wing) and writes that
nowhere, so GRAVITAS shows only what the Journal proves.

**Targets by value** now lets a ship go when its lock is lost and no other ship is locked within 2 seconds: it blew
up, flew off or you let it go. Locking another ship at once is a switch, and both stay. A setting turns this off.

**Keys**, while the game is in front or not:

| Keys | What they do |
|---|---|
| Ctrl+Shift+F7 | free look the right way round (v0.31.0: when the HUD shows as you look around) |
| Ctrl+Shift+F8 | the last fight's combat report, or away with it (v0.26.0; it goes by itself after its seconds) |
| Ctrl+Shift+F9 | the Bounty counter's This fight back to 0 (To claim stays) |
| Ctrl+Shift+F10 | Targets by value cleared (a ship comes back when you lock it again) |
| Ctrl+Shift+F11 | the HUD hidden or shown (v0.35.0: F12 did the same and is gone) |

The keys are read with GetAsyncKeyState, as the free-look button's fallback is: nothing is hooked, blocked or changed,
and the game gets every key as before. A setting turns them off.

## Windows as panels of the game (default)

Each window has a default place on one of the game's own panels, in that panel's perspective, as if the game drew it:
straight ahead, Targets by value on the plane under the comms panel (left) and Target and the kill feed on the plane
under the INFO panel (right), leaning as those panels do; the status chips and the combat report flat, at the top in
the middle; This fight beside the left panel (key 1) and Takedown speed beside the right panel (key 4), shown while you
open them. While a side panel is open the windows ahead hide, as the game has turned your head to it.
The places come from guide lines drawn by CMDR Hongark on the game at 2560 × 1440 (the comms and INFO panels' top
edges, the side panels' frames, `gravitas_edmc/planes.py`). The game keeps its vertical field of view and widens the
view for a wider screen, so they are kept from the middle of the window in heights: they fit every 16:9 screen alike
(1920 × 1080, 2560 × 1440, 3840 × 2160) and wider ones too, in the game's default field of view.
A window on a plane is drawn as one smooth picture (Pillow, which EDMC carries) and bent in perspective, letters too.
Move a window with the arrows and it is shifted on its panel, its shape kept (v0.17.0: up to 0.16 it fell flat and
jumped to where its numbers said); "Reset" puts one back, "Default places" all of them.

**With the game's panels:** press 1 and the windows ahead go at once, where they are, as the game turns your head to
the left panel; This fight shows as the panel itself appears. Close it and the windows ahead are back as your head is
(4, comms and role likewise). GRAVITAS looks at Status.json every 15 ms, as SrvSurvey does. Each window is drawn once
as a picture (four times as fine, brought down smoothly, with a soft glow round its lines and letters, as the game's
own) and only moved after that; it is drawn again only when what it shows changes. On Windows each window is a small
see-through window of its own (a layered window, as overlays made with Qt or WinForms are).

## Windows tied to the game's panels

Each window shows on the main panel (ahead, while no panel is open: in its own place, or since v0.21.0 at its left
under the comms panel, its right under INFO, or its top, flat in the middle, as you choose), or only while you hold one of the game's panels
open: the left panel (key 1), comms (2), role (3) or the right panel (4). For example Targets by value only when you
press 1. The game writes which panel is open in Status.json (GuiFocus), but only once the panel has begun to open; so
since v0.18.0 the panel keys themselves are looked at too (read from the game's own Bindings file, read only; their
state only looked at, as the Bounty keys are): the windows ahead go the moment you press 1, 2, 3 or 4 in the ship, and
Status.json has the last word (a key the game did not follow is taken back within a second; v0.26.0: going straight
from one side panel to another, the game says "no panel" for a moment as the head passes the middle, and the windows
ahead came up and went again: no longer; v0.19.0: Status.json
written for something else meanwhile no longer undoes it, which made the windows go, come back and go again).
**v0.22.0:** a panel's windows boot up as the game's panel shows (0.4 s after its key; they had booted before it) and
take half a second.
**v0.21.0:** a panel's windows now really boot up as the panel appears (their boot was drawn into a window still
hidden, so they popped up at the end), and so does every window that comes back into view as a panel closes.
**Panel changes (v0.20.0):** as you open a panel the windows ahead slide away the way your head turns (right for the
left panel, left for the right one, up for the role panel) and are gone in 0.09 s; as you close it they slide back in
with your head; the panel's own windows boot up as holograms as the panel appears. The windows ahead could stay up
while a panel was open, until the game wrote Status.json again (alt-tab put it right): "GuiFocus":0 and "GuiFocus":2
are the same size, so two writes close together could look like one, and EDMC's own copy of Status.json, coming at
other times, could put back an older "no panel". Now one reader takes it, the newest line only, and reads it in full
every 0.18 s anyway.
**The comms and role panels (v0.19.0):** while one of them is open, the windows tied to it sit flat in the free room
CMDR Hongark marked beside it: for comms (2) left of the opened panel, then above it; for role (3) left of it over the
console, then above it (one window in each, then on down; a window that does not fit is made smaller). Since v0.25.0 a
window can also be given its place there itself: "Role panel (3) left" or "top", "Right panel (4) top" (over the right
panel's frame), as on the main panel. A window tied to a panel also shows your last
combat report. In the galaxy and system maps, FSS, SAA and station services the HUD hides. Since v0.28.0 at once: measured in the game, Status.json is
written only once a second (always at the same part of it), so its "a map is open" came up to a second late, while
the game writes the map's own music to the Journal as it opens (GalaxyMap, SystemMap, SystemAndSurfaceScanner, Codex,
fleet carrier, squadrons, powers): GRAVITAS hides on that music (since v0.31.0 read from the newest Journal by GRAVITAS
itself every 15 ms, as SrvSurvey does, not after EDMC hands it over: gone 16 ms after the line is written).
**The Journal read by GRAVITAS itself (v0.33.0):** measured in v0.32.0, EDMC handed each Journal line over 0.6 s after
it was written in the middle, and up to 1.4 s. Since v0.33.0 GRAVITAS reads every new line of the newest Journal itself
every 15 ms (gravitas_edmc/journal.py) and handles it at once: the fight, the targets, the Bounty counter, the maps.
EDMC's copy of the same line is then skipped (matched by its time and event), and lines only EDMC has still come
through EDMC. Since v0.34.0, as GRAVITAS starts, the newest Journal is read from its first line (which ship, which
system, in the game or in the menu; no old bounty is counted and no old fight starts), and the fight's Status comes
from GRAVITAS's own reading of Status.json too. EDMC's log still gets the timing line every two minutes ("GRAVITAS timing: ..."). Only times, in memory;
nothing is sent. A map key (if you have one bound) hides it too, and a
panel closed by the game's own screens shows nothing ahead for 0.8 s, as a map or station services may come next.

**Targets by value before any shooting:** every ship you lock lands in the list with its bounty at once, in a fight or
not (the last 10 minutes; supercruise or a jump clears it). Lock them all, then go for the most valuable. Each
ship shows its pilot's combat rank as the game scans it (Elite, Deadly, Dangerous, Master...), since v0.18.0.

**Why the windows stay put:** the game writes nowhere where the HUD is, and its HUD moves with the head (150-300 px at
2560 x 1440 in a Python Mk II while boosting). Up to v0.17.0 an experimental setting read the screen to follow it;
measured frame by frame, a window beside the game always comes 2-4 frames late, and the marks it pinned to went off the
screen or were not found well enough. It is gone: the windows stay where they are put, as SrvSurvey's and EDMC Modern
Overlay's.

**Free look:** the HUD can also hide while you look around. Since v0.22.0 it does so exactly as the game's own free
look is set: its button or key, held or toggled, read from the game's Bindings file (read only); up to 0.21 the plugin
had a way of its own ("held"), which against the game's "toggle" hid the HUD at the wrong times. Since v0.23.0 a
panel opened or closed while you look around no longer ends it (the game goes on looking, and the HUD came back in the
middle of it): free look ends only with its own button. Looking at a side panel in free look puts the game's focus on it;
since v0.24.0, as free look ends there, ahead is taken at once (the game says so a moment later), and a window that
left while the HUD was hidden does not show leaving: This fight no longer came up ahead and went again.
The game says nowhere whether you look around: GRAVITAS counts the free look button. Since v0.27.0 the count is set
back when the game itself puts the view ahead (its maps and station services, docking, undocking, a jump, supercruise
in or out, a new game): when the game had ended free look by itself, or EDMC started in the middle of one, the HUD hid
as you looked ahead and showed as you looked around, until EDMC started again. Ctrl+Shift+F11 also brings back a HUD
hidden by free look, and puts the count right; Ctrl+Shift+F7 (v0.31.0) turns the count over when the HUD shows as
you look around and goes as you look ahead (EDMC started in the middle of a free look). A mouse button is read
through Windows' Raw Input, a key by its state; never blocked or changed.

**Dark ground (v0.22.0):** a dark, see-through ground behind each window, bent with it; the window is placed by what it
shows, so turning the ground on or off no longer moves the windows. The GRAVITAS cards style is gone: the game's own
look only.

**Keep the HUD up:** a setting keeps every window on screen all the time. Between fights they show the last fight, or
an empty frame.

## Every screen size

Every place is kept from the middle of the game window, in parts of its height, and every size grows with its height:
the windows sit alike at 1920 x 1080, 2560 x 1440 and 3840 x 2160, and in between (1366 x 768, 1680 x 1050...), as on
wide screens (2560 x 1080, 3440 x 1440), as the game's own HUD does (it keeps its height and widens the view). Checked
in v0.19.0 by laying the windows out at each of those sizes: the same places to a hundredth of the height. On a
narrower screen than 16:9 a window that would go off the side is kept in.

## Profiles (v0.19.0)

In the Windows tab: type a ship (its type, "Python Mk II", or its own name), set the windows up, press **Save my
settings**. **Add another ship** starts the next one from the windows as they are. GRAVITAS switches to a ship's
profile by itself when you board it (the Journal's Loadout says which ship), or pick one by hand. Kept by EDMC in its
own settings. A new CMDR starts with Targets by value, This fight, Takedown speed, the Bounty counter, the Keys card
and (since v0.27.0) the combat report.

## Settings (File > Settings > GRAVITAS)

Four tabs, and **Preview** at the top (a switch: it shows the windows in the game with a made-up fight, as the game
will: a window tied to a panel shows when you open that panel).
- **HUD:** Combat Mode, only while the game is in front, keep it up between fights, hide it in the maps; size (small,
  normal, large, or any percent from 50 to 200), opacity, a dark ground; red windows in a fight.
- **Targets:** most valuable first, or your own ship order ("Fer-de-Lance, Corsair, Python Mk II"); how many ships
  at most (1 to 20, six at first); a ship leaves the
  list when its lock is lost; how long the combat report stays; combat bonds in the Bounty counter.
- **Windows:** the profile for this ship, and **Default** (v0.23.0): the windows as GRAVITAS starts them (Targets by
  value and the Bounty counter ahead, This fight with the left panel, Takedown speed with the right, the Keys card at
  the top, the combat report; the others off); save it under a ship's name to keep it; each one on or off, when it shows (on the main panel, or with one of the game's panels), moved with the arrows,
  its colour, Reset; on the game's panels in their perspective, or flat.
- **Keys:** Ctrl+Shift+F7 to F11, and free look (as the game's own).

## Folders

```
load.py                  what EDMC loads
gravitas_edmc/           the plugin: engine host (engine.py), the HUD (hud.py), settings, Past combats (history.py, past.py),
                         the free-look button (look.py), the panel keys (panelkeys.py), the hologram boot (bootfx.py), the Journal reader (journal.py) and its timing (timing.py), the ship order menu (shiporder.py), what you can claim (claims.py),
                         profiles per ship (profiles.py),
                         the Bounty counter and the keys (bounty.py),
                         the game's panels as planes and the windows on them (planes.py),
                         each window as a picture that moves and fades (sprites.py)
gravitas_edmc/modes/     one file per mode (combat.py)
engine/                  the site's combat engine, copied by tools/plugin_build.py
lib/                     QuickJS for 32 and 64-bit Windows and Linux (quickjs-ng, MIT) (v0.30.0: numpy, dxcam and
                         comtypes, for the cockpit tracking gone in v0.17.0, and the empty files it left are taken out:
                         the plugin is 10 MB instead of 58)
```
