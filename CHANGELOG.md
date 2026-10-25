# Changelog

Every GRAVITAS release, newest first. The same notes are in the site's **About GRAVITAS → What's new** tab.

## 2026 Q4

### v0.92.5 · minor · 25 Oct 2026
- GRAVITAS's source code is public on GitHub, under the MIT licence: github.com/Servly/gravitasmap
- How GRAVITAS reads your journal, step by step in the code, and how to check it yourself: linked from the Privacy tab and the Sync window
- Every release now also goes to GitHub with its version number and these notes

### v0.92.4 · minor · 25 Oct 2026
- GRAVITAS MODES: a new panel on the left, between Bodies and Sync. Combat Mode, and Thargoid and On Foot (planned) each open in their own tab, like About GRAVITAS. Past combats and the team board moved there from the Sync card. Asked by CMDR Hongark
- While a fight or a team board is live, the panel shows it, and one click opens it. The board no longer floats over the system map (it still does on phones)
- Team board: one CMDR counted as 1, 2, 3... while sitting idle. Each time the link dropped and came back, the board added a new row. Now a CMDR keeps one row, the count shows who is on the board now, and a quiet link is kept open. Found by CMDR Hongark
- The GitHub links are hidden until the repository opens

### v0.92.3 · minor · 25 Oct 2026
- Combat Mode no longer opens for a look: pirates scanning you, or a wanted ship you lock, only light the small HOSTILES NEAR chip. The screen opens when the shooting starts. If nothing happens in 20 seconds, the chip goes out. Found by CMDR Hongark
- Cycling targets no longer keeps a fight going
- After an Operation, the game writes a few late attack lines while you are docked. They no longer start an empty fight that hid your real report. Your report stays on screen
- A fight with no kills, no shields lost and under a minute of fire leaves no report

### v0.92.2 · minor · 25 Oct 2026
- Getting GRAVITAS's source code ready for GitHub, under the MIT licence
- Privacy tab: how to check it yourself in your browser (F12, Network tab)
- Privacy tab, more exact: Cloudflare's short technical logs include the names of the systems your map asks for, and from v0.91 to v0.91.7 a paired device's combat screen was kept for up to 12 hours (changed in v0.92)
- Once the GitHub repository is open, every release will also go there with its version number and these notes

### v0.92.1 · minor · 25 Oct 2026
- 3D: the mouse wheel works again with the browser zoomed below 100 % (for example 90 % in Chrome). One turn of the wheel threw the camera onto the body or five billion units out. The cause was one line in the 3D library's controls, now fixed
- 3D: the camera also stays within a few times the size of the system, and comes back at once if it is ever further out
- 3D: the camera no longer goes inside the body it looks at, where the screen turned black
- The measuring box (?perf=1) has a Close button. Found by CMDR War Khan

### v0.92 · major · 25 Oct 2026
- Combat Mode: Targets by value. Cycle "next hostile" and every ship you scan lands in a list, the most valuable first, with its bounty, shields and hull. Sort by value or by your own ship order (Fer-de-Lance, Corsair, Python Mk II first, change it as you like). Clean ships are marked: firing on them is a crime. Idea by CMDR Cyanidex
- Team board: one link, everyone's fight on one screen. Each CMDR adds their own fight from their own game, anyone with the link can watch, and when everyone is done it shows the results, ready to copy as an image. GRAVITAS's server keeps nothing. Idea by CMDR Cyanidex
- The combat report lists the ships you locked that are not among your kills: they got away, or someone else finished them
- A fight now lasts until its last hot moment, not until the calm was noticed, and going into supercruise ends it at once
- A new Combat Mode intro: a cinematic cue made for GRAVITAS, a rising swell and two huge brass blasts over war drums
- Your privacy: with a phone or tablet paired, the combat screen now only passes through GRAVITAS's server and is never kept. The Privacy tab tells exactly what Sync and Combat Mode read
- About GRAVITAS: a Thanks tab, and the Turkish Galactic Empire [TRGE] squadron. The tabs no longer jump when you switch between them
- GRAVITAS's source code is going public on GitHub (MIT licence), so anyone can check what GRAVITAS reads and what it sends

### v0.91.7 · minor · 25 Oct 2026
- Combat Mode comes in like a screen cutting over: a bright line, COMBAT MODE in the middle, then the combat screen
- A new alert: a warship's battle-stations klaxon, made for GRAVITAS (three rising horns over a low impact)
- Operation places show their names ("Docked at Frontline Runner") instead of the game's codes
- Team tab: each teammate's ship, rank and squadron once you have locked them, how often they were in your sights, their lines in team chat (only the count), how your kills were shared (solo, with 1, 2 or 3), and your combat rank
- A teammate in your sights is marked in blue in the ships list and on the timeline. Fire on a teammate is shown when the game records it
- An enemy's last words under its kill, "critically hit" for ships that cried out, and the game's large-fight moments shaded on the timeline

### v0.91.6 · minor · 25 Oct 2026
- Combat Mode: "~21 enemies seen · 12 you helped destroy" with a 12/21 ring, on the combat screen, the report, the Discord card and Past combats. Seen means a ship you locked or a pilot who spoke to you in the fight (their threats and cries carry their name). The game lists no ships around you, so it is an estimate, and a kill counts when you damaged it

### v0.91.5 · minor · 25 Oct 2026
- Combat report on big screens: the card is drawn at twice the size (sharp on large and high-density screens, and when pasted into Discord), and the page keeps to the card's size instead of stretching it
- The timeline's dots stay round at any width (they were stretched into ovals)
- A teammate's crew or fighter ("Crew CMDR …") no longer appears among the ships you fought

### v0.91.4 · minor · 25 Oct 2026
- Sync panel: the buttons no longer spill out of the panel. Past combats moved into the Sync card (bottom right)
- Phone is now Devices (a phone or a tablet), up to 4 at once, as the Show on a phone or tablet window now says
- The computer knows whether its devices are really there: green only while a device follows, amber while waiting, and "asleep" when a linked device went quiet (screen off, app in the background) for 40 s. It catches up as soon as it wakes

### v0.91.3 · minor · 24 Oct 2026
- Interdiction in stages: the combat screen comes up the moment the tether pulls you (the game's own flag), then shows who dropped you, whether you submitted, or that you escaped (an escape with nothing else closes the screen 12 s later)
- Lock the same target again and the combat screen shows how much shield and hull came off since your last lock, and how fast (%/s)
- The report has a timeline of the whole fight: phases, every kill (bigger dots for bigger bounties), waves of fire, heat warnings, interdiction
- The Operation's name (from the journal, e.g. Terminal Prosecution) on the combat screen, the report, the card and Past combats
- Past combats shows your career totals from the game: bounties, combat bonds, highest single reward

### v0.91.2 · minor · 24 Oct 2026
- Combat Mode in Operations: the lulls between phases no longer end the fight. One Operation is one combat, with its phases marked (PHASE 2 at the top, phase breaks in the kill feed, "3 phases" in the report)
- Takedown speed: how long each kill took from your first lock, the average and the fastest, and how fast shields and hull came down (%/s). The game writes no damage numbers, so this comes from the shield and hull % at each lock and the moment of the kill, your team's fire included
- Past combats: every combat report is kept in this browser (the last 30), with totals. Open them from the crossed-swords button in the Sync panel, or from a report
- No combat screen from the game's menu music while docked

### v0.91.1 · minor · 24 Oct 2026
- Combat Mode shows only what the cockpit does not: the module you target on your target (its health, e.g. the FSD before it can run), every ship you fought this fight (destroyed ones struck through), the kill feed (solo or shared with the team) and the fight
- Solo and Team tabs in a team: the team, your kills shared with them and your solo kills. Your teammates' own kills are not in your journal
- The combat report is now an image card: Copy image and paste it straight into Discord, or save it
- Times under fire count waves (a burst of hits is one), not every hit

### v0.91.0 · major · 24 Oct 2026
- Combat Mode (with Sync on): the moment a fight starts, GRAVITAS turns red and becomes a combat screen. The locked target (ship, pilot, rank, faction, bounty, shield and hull as last scanned), a kill feed with every bounty, the fight's tally (kills, credits, time, kills per minute, times under fire, heat warnings) and your own ship (shields, pips, fire group, fuel, hull and ammo at launch)
- In an Operation: the site, the threat, the team and the time on a strip at the top
- When the fight calms down, a combat report stays on screen, with a short text to copy for Discord
- Your paired tablet shows the same combat screen, as a second screen beside the keyboard
- While the combat screen is up, the map and the 3D view are not drawn at all: the graphics card is the game's. The Map button (or Esc) shows the map again, with a red COMBAT chip at the top

### v0.90.8 · minor · 24 Oct 2026
- Target: a targeted carrier now also says which body it is parked at (Target JBY-46M · near A, or orbiting A)
- Your carrier parked at a star itself now sits on the star's line on the system map, in order of distance like the game's map, instead of hanging on the star. The distance comes from the journal when you dock aboard; until then it is placed first
- Sync: the computer could end up showing another system than the ship's (the tablet was right). An older system request that answered late could replace the newer one. Now only the newest request is drawn, and with auto-jump on, if the map shows a system you did not open yourself, the ship's system comes back within a few seconds

### v0.90.7 · minor · 24 Oct 2026
- Your own carriers, from your journal (with Sync on): your fleet carrier and your squadron's carrier are placed where the journal says, beside the right body, even when Spansh still has them somewhere else or not at all
- A planned carrier jump counts down to departure, on the carrier, in the Sync card, and in the system it is jumping to ("jumping here"). A cancelled jump disappears, and at departure the carrier moves to its new system
- Target: a carrier you target in the game is recognised by its callsign or name, so the target is the carrier, not the body it parks at

### v0.90.6 · minor · 24 Oct 2026
- Event card: "Show the body" appears only when that body is not already open (from the station window, say), and opens its Sky tab

### v0.90.5 · minor · 24 Oct 2026
- Event cards open on the first press. The Sky tab and the station window refresh their times several times a second, and a press that landed during a refresh was lost, so it could take a few presses

### v0.90.4 · minor · 24 Oct 2026
- Route mode: an old, finished route no longer comes back after a fleet carrier jump. The game leaves the last route in its file, and when the ship moved without it (on a carrier) GRAVITAS showed it again from its start, as a route back to where it ended. A route that does not include the ship's system is now ignored

### v0.90.3 · minor · 24 Oct 2026
- System map: no more dark flashes while zooming, dragging or changing the quality. When the drawing resolution changed, the map could stay blank for a frame or more. It is now redrawn at once, and a picture whose shader is still being prepared is simply left out for that moment

### v0.90.2 · minor · 24 Oct 2026
- System map: the live pictures no longer switch off while a shader is prepared (the map could blink dark and back). They wait only once, when a system first opens, and after that a wait just keeps the last picture on screen
- A system with a black hole no longer re-checks the map's shaders on every frame

### v0.90.1 · minor · 24 Oct 2026
- Fixed: an error message could open by itself on the system map ("Cannot read properties of undefined (reading 'isReady')"). It came from three.js's background shader compile when a map picture was thrown away while its shader still compiled. GRAVITAS now waits for the compile itself and simply skips a picture that is gone. Thanks for the report

### v0.90 · major · 24 Oct 2026
- v0.9, the complete version. From here on: testing and fixes on the way to v1.0, then the code goes public on GitHub (MIT licence)
- Day and night at settlements: on tidally locked moons (one face always to their planet, like 7 c to 7 g here) every settlement and surface port shows whether it is day or night now, how high the star is, the next sunrise and sunset, how long a day lasts there and whether its planet hangs in the sky. In the station window and in the Sky tab. Bodies that spin freely: the data has no rotation phase, so no times, and the panel says so
- Being checked: which side of a locked moon faces its planet and which way is east are assumed (marked on the panel) until compared with the game
- Event cards: the next eclipse (Sky tab, ⏰ Event card) and every sunrise or sunset at a settlement open a card with a live countdown, game time and your own time, a link that opens the same card for a friend, and Add to calendar (.ics) with a reminder 15 minutes before
- Watch: a new group, System state: Boom, War and Civil War, with the factions and the date of the report
- No freeze when the camera enters an atmosphere: the shell seen from inside needed a new shader in the middle of the zoom. Both sides are now prepared with the rest, so zooming close or landing in the surface view compiles nothing new
- A nicer page for addresses that do not exist

### v0.83 · major · 23 Oct 2026
- First step to v0.9, the complete version: stability. GRAVITAS no longer uses a graphics shader before the driver has finished compiling it. Using one earlier made the browser wait on the spot, and on Windows that wait happens in the browser's one graphics process, so every Chrome tab could freeze with it (the "whole browser froze when I zoomed in" reports)
- The surfaces, the Milky Way, the map pictures, the live map, the glow and the 3D scene now compile their shaders in the background first. The 3D view waits behind the loading screen until they are ready, and the loading screen no longer goes away while they still compile
- The loading screen now prepares the exact shader versions the 3D view uses (three.js keeps one for drawing into a picture and one for the screen; the wrong one was prepared before)
- The surface shader is prepared, and drawn once on 8 pixels, a few seconds after a system opens, so the first zoom onto a planet no longer stalls
- Measured on a software graphics card (the slowest case): entering 3D blocked the page for 1.7 s in total, now 0.7 s; the first zoom's longest stall went from 1.4 s to 0.13 s
- For the curious: ?perf=sync measures each part of a frame on any card, also without a GPU timer (slow while open)

### v0.82.5 · minor · 21 Oct 2026
- Watch: tick what you do not want to miss on the way (Watch ▾ at the top of the route column). Earth-like, water and ammonia worlds, terraformable bodies, biological and geological signals, landable worlds with an atmosphere, ring hotspots, neutron stars, black holes, white dwarfs, Wolf-Rayet, carbon and giant stars, water giants, helium-rich gas giants and gas giants with life
- Matches show as small badges on the system you are in and your next three jumps, in the column and the bars below. Only those four systems are checked, and only a few numbers of each are kept, so it stays light
- Arriving at a match: a short WATCH note, one soft chime (you can turn it off in the menu), and the matching bodies glow on the map
- Fuel stars in the route column: an amber edge and a little fuel pump
- 3D on a computer now has the same buttons as the map: Find me, Follow, zoom in and out, Reset view and names, top right beside the open window

### v0.82.4 · minor · 21 Oct 2026
- Your ship's target from the game, in orange, on the system map and in 3D (overview and true scale): under the body or station, pointing up. You are here stays above, pointing down, so the two never cover each other, even on the same body. A target in another system (your next jump) is not marked
- Follow: a lock beside Find me, on the system map and on the 3D buttons of phones and tablets. While locked, a dashed ring turns around it and the view keeps your ship in sight: the map glides to it when it moves on, 3D stays on it. Dragging the map or picking another body unlocks it
- Out in supercruise with no exact place known, the green tag stays where your ship was last seen, as an outline: "In supercruise · last seen near 3". The system chip says so too

### v0.82.3 · minor · 20 Oct 2026
- A new route starts a new journey: the bar above the map says "Your journey starts here" and also where you were last ("last time you left … 9 h ago", tap it to open that system). The systems you pass on this route then fill it
- Earlier trips are not lost: scroll up past the line "Earlier trips above · this journey below". A jump after more than an hour without one also starts a new journey. A reload or a recalculated route keeps the journey you are on

### v0.82.2 · minor · 20 Oct 2026
- The last jump: the game clears the route as the last jump starts. GRAVITAS took that as a cleared route, said ROUTE CLEARED during hyperspace and showed the system you were leaving on the normal map. Now route mode stays through the jump and ends with ROUTE COMPLETE once you arrive

### v0.82.1 · minor · 20 Oct 2026
- Route column on a computer: wider on wide screens, and long system names wrap to two lines instead of being cut
- The bar above the map now always shows the system you just left (it could stay on an earlier one when route mode opened)
- The green "In supercruise · heading to …" chip stays inside the system panel (hover it for the full text)

### v0.82 · minor · 20 Oct 2026
- A new route while on one: the map stays in route mode and says ROUTE RECALCULATED with the new destination, jumps and distance. The column and the bars refresh with a short motion
- When the game clears the route for a moment before the new one, the old route stays for a few seconds, faded, with "Route changing in the game…". Only if no new route comes does it say ROUTE CLEARED
- The last jump: route mode stays while your last system is drawn, with an Arrived bar, and leaves a moment later with ROUTE COMPLETE. No more jump back to the normal map before the last system appears
- Route mode comes and goes with motion: the column slides in from the left, the bars from above and below, and the map's edges glide to their new place. Leaving, it is the other way round, and the map is fitted again
- Phones and tablets ask your computer every 10 seconds whether they are in step, and at once when they wake up or come back online. If they fell behind, the computer sends the news again. A link that went quiet while the device slept is rebuilt at once

### v0.81 · minor · 20 Oct 2026
- Route mode: when you plot a route, a short message says the system map now follows your route, and another says when you leave it (route cleared, or route complete when you arrive)
- The whole route in a column on the left of the map: jumps done, the system your ship is in, and every jump ahead with its star, length and distance so far. It scrolls, and after each jump your ship's row moves to the top. Tap any row to open that system
- Jumps are numbered by their place in the route: Jump 7/50, then 8/50 after the next jump, instead of always 1st jump
- The next three bars now show each system's summary: bodies, landable ones, stations, people, economy, security and Earth-like, water or ammonia worlds. Until it arrives, the bar says what the star means for you (fuel scoop or boost). Only the summary is kept, the data itself is dropped
- A clear jump motion: the map you leave slides up and shrinks into the bar above, the new system unfolds up from the next bar, and the bars below move up one stop
- Back to (your ship's system) now shows that system whole, fitted to the screen

### v0.80 · major · 20 Oct 2026
- The journey. When Sync knows your plotted route, the system map becomes a column: the system you just left as a thin bar above the map (scroll up for the ones before it), the map of where you are, and your next three jumps as thin bars below it: 1st, 2nd and 3rd jump, the star (fuel or a boost), the jump's length, and for the next one its bodies, landable ones, stations and people
- When your ship jumps, the map you leave rises into the bar above and the new system grows up from below. The next system is fetched while you fly to it, so the new map is there at once
- Tap any bar to open that system. Its bar then carries Back to (your ship's system) at its right end
- Light on memory: only the system behind you, the one you are in and the next one are kept; every other stop is just a name until you tap it
- On phones and tablets the bar left behind takes the route strip's place at the top, and the next jumps sit above the clock. Only on the system map: 3D keeps the route strip

### v0.79.9 · minor · 20 Oct 2026
- Find me: a target button above the zoom buttons, on the system map and in 3D on phones and tablets. One tap goes straight to your ship, like a navigation app: the map glides and zooms in on it, 3D flies there. It is green when your ship is known (Sync with the game, on this computer or followed from one)

### v0.79.8 · minor · 20 Oct 2026
- The station window now has its own room like the Body window: the system map (and in 3D the filter bar) moves aside instead of lying under it, and the station is marked on the map and its name in 3D, like a selected body

### v0.79.7 · minor · 20 Oct 2026
- The station window works like the Body window: same place, same title bar with Collapse and Close, and a click on empty space (map or 3D) closes it. Picking a body brings the Body window back
- Stations in orbit: the body is named with much more certainty. A second body is offered only when it really was as close at the reported time (within 0.1 ls), so "7 e or 7 f" now shows only when it truly cannot be told apart
- Shipyard: S, M, L now simply say small, medium or large ship

### v0.79.6 · minor · 20 Oct 2026
- Outfitting is tables all the way: every module shows one plain line, and a tap opens its table. Weapons: sizes down the side, fixed, gimballed and turret across, the grade in each cell. Other modules: a dot for each size and grade on sale
- Armour is one table: ships down the side, the five kinds across, ● for the usual armour and ◆ for the Mk II ablative kind
- The newer ships are named in the armour list too (Kestrel Mk II, Lynx Highliner, Caspian Explorer)

### v0.79.5 · minor · 20 Oct 2026
- Outfitting says plainly what is sold: "Sizes 2–8 · grades A–E · every grade". A tap shows a small table with a dot for each size and grade on sale. Weapons with one grade per size keep their short chips (1F 2E 3D). A line explains sizes and grades
- Market: the column titles stay in place when categories open and close

### v0.79.4 · minor · 20 Oct 2026
- Station window: every group starts closed, open only what you need. Expand all and Collapse all, beside the search, open or close a whole tab at once. A search still opens the groups with a match

### v0.79.3 · minor · 20 Oct 2026
- Outfitting has a second level, like the game's menu. Hardpoints: lasers, cannons, missiles and torpedoes, mines, plasma and rail, mining tools, Guardian and anti-xeno weapons. Utility: shield boosters, countermeasures, scanners. Core: armour, frame shift drives, thrusters, power plants and the rest. Optional: shields, protection, limpet controllers, cargo and fuel, hangars and cabins, docking, exploration and more
- Each weapon once, with a line for each mount (fixed, gimballed, turret) and its sizes and grades
- Armour by ship: each ship with the armour grades sold for it

### v0.79.2 · minor · 20 Oct 2026
- Outfitting: a module's sizes and grades come as one chip per size (8 ABCDE, 7 ABCDE…). When they do not fit beside the name they go under it, so they never run over the name. The same size and grade twice is shown once
- Shipyard: the newer ships have their makers and pads too: Caspian Explorer (Zorgon Peterson, L), Lynx Highliner (Zorgon Peterson, M), Corsair (Gutamaya, M), Kestrel Mk II (Core Dynamics, S), Type-11 Prospector (Lakon). No "Other" group: a ship GRAVITAS does not know yet is listed last

### v0.79.1 · minor · 20 Oct 2026
- Station window: the market is grouped by category (Metals, Chemicals, Technology…), each group opens and closes. Sorting by a price, stock or demand lists everything in one order across the categories
- Outfitting comes in the game's four kinds (hardpoints, utility mounts, core and optional internals), each module once, with its sizes and grades side by side and fixed, gimballed or turret where it matters
- Shipyard: the ships by maker, each with the landing pad it needs (S, M, L)
- Long lists start closed, short ones open. A search opens every group with a match

### v0.79 · major · 20 Oct 2026
- Stations have their own window. Click or tap a station, a settlement, a construction site or a fleet carrier: on the system map, on its name in 3D, in the System panel or in a body's panel
- In it: where it is, its landing pads (can a large ship dock?), its services (refuel, repair, black market, Interstellar Factors, material trader and more), its economy, government and faction
- Its market: what it sells and buys, prices, stock and demand. Sort by any column, show only what it sells or buys, or search. Illegal goods are listed too
- Search a commodity and the window also shows where else in this system it is cheapest to buy and pays most to sell
- Its outfitting by kind of module, and the ships its shipyard sells. Each list says how old it is: these come from players' tools through Spansh
- Several stations on one mark of the map: the window lists them first
- Phones and tablets: the 3D buttons (zoom, Reset view, names) now also show while following a computer

### v0.78.6 · minor · 19 Oct 2026
- Sync with GRAVITAS keeps its pace behind the game. With the game in front, the browser slowed the GRAVITAS tab's timers to about once a minute after a few minutes. The Journal was read late, and the phone or tablet showed "Last seen in…" and "Connecting…" now and then. Sync now keeps its own one-second clock in a small background worker

### v0.78.5 · minor · 19 Oct 2026
- Phones and tablets following a computer: the route is on the main screen, on the map and in 3D. Jumps left, light years to go and the next stop with its star class, just under the Sync pill. A tap opens the Sync window with every jump

### v0.78.4 · minor · 19 Oct 2026
- Phones and tablets: the 3D view has the map's buttons too, at the bottom right: zoom in, zoom out, Reset view (⤢) and names on or off (Aa)
- Filters close with a tap anywhere outside them. That tap only closes them, it does not pick a body

### v0.78.3 · minor · 19 Oct 2026
- Phones and tablets: after a drag that started on a name in 3D, turning and pinching stopped working. Fixed: the finger is handed to the 3D view and its lift always reaches it, so every gesture keeps working
- Sync with GRAVITAS: the link server now answers a closing link, so both sides end it cleanly

### v0.78.2 · minor · 19 Oct 2026
- In 3D, the mouse wheel over a name (a body, a station, a carrier) zooms like anywhere else. In a crowded system the names covered much of the view and the zoom seemed stuck
- A drag that starts on a name turns the view. A plain click on a name still selects it
- After an unexpected stop, GRAVITAS runs on Low for that one visit only, no longer for good
- The system map's live surfaces also wait while the graphics card is behind

### v0.78.1 · minor · 19 Oct 2026
- The 3D orrery opens behind a loading screen: shaders, the Milky Way and the surfaces in view are made ready first, so the view moves smoothly from the start. It shows the first time for each system and after a quality change. Skip or Esc ends it
- No more frozen browsers: GRAVITAS now checks after every frame whether the graphics card has finished it. When the card falls behind, background work stops and new frames wait, so the browser and other windows stay responsive. This works in every browser, also with ?perf=1 open
- Medium is lighter: surfaces are painted in smaller pieces each frame
- Auto is more careful: it tries Medium only when the card had room to spare, steps back to Low at the first long wait, and remembers that for two weeks on that computer
- The Sync switch on the computer stays inside its window with every status word

### v0.78 · major · 19 Oct 2026
- Sync at a glance: one light, the same on the computer and the phone. A green dot that breathes: live. Amber half disc: waiting (game closed, computer not sharing). Red cross: the link dropped and is being rebuilt by itself. Grey ring: off
- A new Sync panel: the system, where your ship is (docked, landed, in supercruise, jumping…) and how fresh the news is. Its buttons have the site's own icons, Auto-jump is a switch, and a line under it shows the phones that follow
- Your route: Sync reads the route you plotted in the galaxy map. Jumps left, light years to go, the next stop, and every jump with its star class (fuel stars and neutron boosts marked) and its length against your ship's jump range
- An arrival card for five seconds after each jump: the system, its star, bodies, landable, life, stations and the jumps still to go
- A short jump sound when the jump starts (switch in View). The background hum now plays in the 3D view only, the system map stays quiet
- A phone or tablet notices a link that went quiet and rebuilds it by itself. The route and the card come to the phone too
- Measuring box (?perf=1): no old numbers on the map, and on a phone it sits low, clear of the buttons

### v0.77.2 · minor · 18 Oct 2026
- Finished colony buildings show again, on the map, in 3D and in the panels. Spansh keeps calling them "Construction Depot" after they are built, so GRAVITAS took them for building sites and hid them with the construction switch. Only a name that still starts with "Construction Site" counts as one now
- Phones and tablets: Sync has its own window (left edge), with its state, the code box and short steps. About no longer holds it
- Filters are a small card beside their tab: the view stays visible and usable, the tab shows how many are on, and a tap on it closes them
- Map | 3D stays at the top right, also while following a computer
- The surface view's controls sit under the top bar. A tap on its title shows the long note
- Phones and tablets start on Low quality. View can raise it

### v0.77.1 · minor · 18 Oct 2026
- T Tauri stars looked like T brown dwarfs (striped and dim), because both classes start with T. They now look like the young sun-like stars they are

### v0.77 · major · 18 Oct 2026
- Phones and tablets get their own layout, upright or sideways. The system map or the 3D view fills the screen
- A slim bar on top: the system's name (tap it to search) and Map | 3D. In 3D, Overview | True scale sits just below
- Every window waits on the screen edge as a named tab: Bodies, System, View and About on the left, Body and Filters on the right. Tap a tab or pull it. Tap beside a window or push it back to close it
- The clock sits at the bottom: tap it for real time, speed, the date and Reset view
- A body you tap opens on the right, the map stays usable beside it. Filters work from their own window in both views
- Uses the whole screen on phones with a notch or rounded corners. Nothing extra runs while you look: the windows move with the browser's own animation
- New icons for every structure type: clearer at small size, on the map and in the panels

### v0.76.4 · minor · 18 Oct 2026
- Every kind of structure now has a little model of its own, in 3D and as an icon on the system map and in the panels
- Outposts in orbit by what they do (industrial, scientific, military, civilian, extraction, tourism, agriculture, anarchy), and installations: satellite, communication, space farm, pirate base, mining, relay, military, security, government, medical, research, tourist and space bar
- On the surface: civilian, industrial and scientific outposts, Odyssey settlements by economy (farms, mines, industry, military, bio labs, tourism) and the hubs
- The look comes from the type and main economy Spansh reports. The real layout of a station is not in the data. Installations and hubs have no landing pads, so Spansh may not list them: they show when it does

### v0.76.3 · minor · 18 Oct 2026
- Phones and tablets: every window now has a named tab on the screen edge (Bodies, System, View, About on the left, Body on the right). Tap it or pull it. A finger on a tab no longer moves the map
- The windows slide in with a soft glow. About GRAVITAS and Report a problem are in the About window, also while following a computer
- No more false "stopped unexpectedly" note on phones and tablets. iPad Safari and Android Chrome close pages in the background without notice, and GRAVITAS took that for a crash and started on Low
- A tablet that follows a computer keeps its smooth pace (iPad Safari often says the page has no focus, which slowed it to a few frames a second)

### v0.76.2 · minor · 18 Oct 2026
- A phone or tablet that follows your computer now shows only the system map, full screen, upright or sideways
- Everything else waits at the edges: pull the left edge (or tap it) for Bodies, System, View and About. Tap a body and its panel slides in from the right. Push a panel back, or tap beside it, to close it
- A small bar on top says where your ship is and how the link runs. Its switch stops following. The Sync bar no longer covers the About panel

### v0.76.1 · minor · 18 Oct 2026
- Asteroid bases appear again, in their belt: on the system map under the belt's name, in 3D among its rocks, in the System panel ("in the A Belt") and under You are here when you dock there

### v0.76 · major · 18 Oct 2026
- Sync with GRAVITAS: your phone or tablet becomes a second screen. With Sync on, click 📱 Phone on the computer and scan the QR code (or type the 6-digit code under About on the phone). The phone follows your jumps, shows You are here and your target, live
- It goes through the GRAVITAS server, or straight over your own network when that is clearly faster. The way is chosen once and remembered
- Only the small summary Sync shows is shared. Your Journal stays on your computer
- After a jump, You are here sits on the arrival star only for the first minute ("Arrived here"). Out in supercruise it says "In supercruise · heading to …" instead of pinning the star
- Lighter again: the little moon in the GRAVITAS logo no longer keeps the browser busy all the time (it circles when the page opens and under the pointer). On the map at rest the browser now does about a fifth of the work

### v0.75.7 · minor · 18 Oct 2026
- Lighter on every computer: the same pictures with much less work. Orbit lines, the clocks, the 3D names and the sound bars no longer redo their work every frame when nothing changed (about two thirds less script work in our measurements)
- The system map no longer runs at full speed for as long as you stay on it (it waited for the 3D Milky Way, which is only drawn in 3D)
- Safer zooming in: new surface pictures are finished in one step instead of being rebuilt again and again while they are drawn, and shaders no longer stop the page to check themselves. Laptop graphics cards start at Medium
- On Medium the glow is worked out at half resolution: about half its cost, the look is the same
- Star flames are calmer, lighter to draw and no longer flicker. While a star is big on screen it moves at 30 frames a second
- You are here points at your surface port's pin on the map when you are docked there
- Sync says "Last seen in …, the game is closed" after you quit the game
- If GRAVITAS ever stops unexpectedly, the next problem report carries what was on screen, even after a reload
- For the curious: add ?perf=1 to the address to see what each frame costs on your computer

### v0.75.6 · minor · 18 Oct 2026
- Sync carries on where you left it. With Sync on, the next visit opens the system your ship was last in (not Sol), and follows the ship by itself if you jumped while the site was closed
- When Chrome asks for the Journal folder again, choose "Allow on every visit": then Sync starts by itself on every visit
- A link to another system still opens that system. Sync then only offers to jump to your ship
- Screen readers: the main part of the page is now the view on screen, the map or the 3D view

### v0.75.5 · minor · 18 Oct 2026
- Safety: the browser is told to always use https here, and the site turns off what it never needs (camera, microphone, location and similar)
- three.js, the 3D engine, now comes from this site instead of an outside server. One less outside dependency, and nobody else sees your visit
- Problem reports: one a minute from the same place, and only from GRAVITAS itself. This keeps bots from filling the inbox, so real reports always get through
- Systems you look up are remembered by the server for an hour, so Spansh is asked less often

### v0.75.4 · minor · 17 Oct 2026
- The pop-out map is gone. A browser window over the game took the game's focus on a click, and browsers do not let a website place it or keep it out of the way. Thanks to everyone who tried it
- Sync, You are here and the ship's target on the site's own map stay as they were

### v0.75.3 · minor · 17 Oct 2026
- Pop-out map: two kinds to try in the game. Classic is a small window with Chrome's own bar. Frameless (test) plays the map in Chrome's video window, with no bar around it. The weaker one goes in a later version
- Classic: a thinner strip at the very top middle of the screen, a smaller bar, and no "back to tab" button
- Classic: when a click on the window takes the game's focus, it says so. Click the game once to fly again
- Placing note: a second monitor is best. On one screen the top edge is the safest place

### v0.75.2 · minor · 17 Oct 2026
- Pop-out map: planets and stars show their pictures again. With a graphics card the site draws the bodies on a live 3D layer under the map, and the pop-out copy was hiding the pictures as if that layer were there

### v0.75.1 · minor · 17 Oct 2026
- Pop-out map: always shown now, at the top middle of the canopy. The first time it opens at the right size for your screen (any resolution) and the guide shows you where to drag it
- Planet and star pictures now show in the pop-out window too
- No tilt any more, so the map fills the whole window. When you and your target are far apart in a big system, it frames both
- A thank-you line in the pop-out window and under the credits

### v0.75 · major · 17 Oct 2026
- Pop-out map, second test: it is meant to sit in the canopy right above the game's left panel. The first time it opens at the right size for your screen and a live arrow guides you there (browsers let only you move such a window). Chrome remembers the place after that. "⇱ Place" shows the guide again
- It looks like part of the game's panel: orange HUD lines, a light orange tint and the panel's slight tilt
- By default the map shows only while the game's left panel (1) is open. With the panel closed the window stays plain dark (a browser window cannot hide itself)
- You are here and Target no longer cover each other: one tag when they point at the same place, the target below when they are close
- The Pop out button moved to the map's upper left, clear of the legend. Planet pictures are now made even while the GRAVITAS tab is behind the game

### v0.74 · major · 17 Oct 2026
- New, first test: the pop-out map. "⧉ Pop out · always on top" in the system map's lower left opens a small window that stays above the game (Chrome or Edge, Elite Dangerous in borderless window mode). Place it once over the game's left panel, it remembers where
- It wears the game's HUD colours, follows Sync with the game (jumps, You are here) and marks your ship's current target from the game in orange
- Click its top bar to choose: always shown, or only while the game's left panel (the 1 key) is open. The map itself never catches the pointer, so it does not take the game's focus

### v0.73 · major · 17 Oct 2026
- You are here tells a station from a body: docked at a station in orbit, a fleet carrier (squadron carriers too) or a megaship, the green tag sits on that station's own name in 3D, and on the system map it points at the station's icon instead of the planet
- A surface port is marked on its planet as "Docked at … (on the surface)", with the green pin at the port's spot when Spansh knows it
- Your station always shows, even when it is a construction site and Construction sites is switched off

### v0.72.2 · minor · 17 Oct 2026
- Graphics card watchdog: where the browser allows it, GRAVITAS measures how long your graphics card really spends on each 3D frame. If it is too long, background work stops at once and the 3D view uses fewer pixels. If it stays far too long, quality steps down one level by itself, so the card is never pushed into a reset
- Video memory guard: High and Ultra never draw more than a 4K screen's worth of pixels, and anti-aliasing is reduced until the drawing buffers fit in about 200 MB (on a sharp 1440p screen Ultra could ask for close to 1 GB before)
- Surfaces are generated in smaller pieces on every quality (at most 0.5 M pixels a frame, 0.26 M in one go)
- The 3D view changes sharpness only in three steps and rarely, because each change is itself a short hitch
- You are here in 3D: its name stays on screen even for a far moon at Reset view, and a new "📍 Show me" button in the Sync panel takes you there (on the map too)

### v0.72.1 · minor · 17 Oct 2026
- Zooming in is gentler on the graphics card: a large planet surface is started only once the zoom has settled, and it begins with small slices
- If the graphics card resets while drawing, GRAVITAS no longer freezes: it says so and reloads on Low
- If a visit stopped unexpectedly, the next one starts on Low and says so once. The Report window then includes what was on screen at that moment (system, view, nearest body, distance), which helps us find the cause

### v0.72 · major · 17 Oct 2026
- Smoother when you zoom in: if 3D frames get slower than about 45 a second, the 3D view is drawn with fewer pixels until there is room again. Panels and text stay sharp. It never goes below half the chosen sharpness
- Low: lighter planets up close (a single-sample ring shadow, 4 steps through the air instead of 10). Eclipses and shadows stay exact
- The system map opens faster: on Low its planet pictures come from the ready textures, all pictures are made in batches of sixteen, and the browser encodes them in the background
- The first switch to 3D for a system gets its shaders ready in the background, with a small "Preparing the 3D orrery" card if that takes more than a moment
- You are here now follows stations, fleet carriers (squadron carriers too) and megaships: docked at one, it marks the body it belongs to and names it
- Landed, in the SRV or on foot: GRAVITAS reads the game's Status.json (only latitude, longitude and what you are in) and puts a green pin at your live position on the planet in 3D

### v0.71 · major · 17 Oct 2026
- GRAVITAS now opens on the system map, the lightest view. SYSTEM MAP is the first option in VIEW. The 3D orrery opens in Overview, with a small hint the first few times that True scale is one click away
- Much less work for your computer in 3D: a planet that is a few pixels wide is now drawn with a few hundred triangles instead of 36,000. In a busy system one frame went from about 2.6 million triangles to about 0.2 million
- The gravity well grid is lighter on Low and Medium (fewer lines, same wells). Without a graphics card it starts off and can be turned on in View
- Low: stars keep a still, lighter surface without flares, Overview belts use fewer rocks, and planets use ready pictures (about 190 KB in all, made by GRAVITAS's own surface generator) instead of generating surfaces on your graphics card. Medium and up still generate every surface from its seed
- Quieter when nothing moves: 15 frames a second at normal speed, 4 while paused, and 3 while the game (or any other window) is in front
- Sync with the game: a green "You are here" marks the body or station you are at, on the system map and in 3D, and a chip by the system name shows it is your system

### v0.70 · major · 17 Oct 2026
- New: Sync with the game (Chrome and Edge on a computer). Turn it on in the panel above the GRAVITAS panel and choose your Journal folder once. When you jump in Elite Dangerous, GRAVITAS jumps with you
- While you jump, GRAVITAS already asks Spansh for the next system, so the map is ready when you drop out. Approaching a body, landing or docking selects that body
- Looking at another system? You get a note with a Go button instead. Auto-jump can be turned off, and a system Spansh does not know yet is tried again for ten minutes
- Your journal files are read in your own browser. They are never uploaded or stored. Only the system's name is sent, the same as a search
- GRAVITAS now opens light on every computer and browser. Quality starts on Auto: it begins at Low and steps up to Medium only when your computer stays smooth. High and Ultra are always your own choice in View
- No more freezes on laptop graphics: heavy background work (planet surfaces, the Milky Way) is cut into small slices that shrink at once when frames slow down, and the first seconds after opening are kept free of it
- At most 60 frames a second. When nothing moves on screen GRAVITAS draws 30 a second, or 10 while paused, so a quiet tab barely uses your graphics card
- Low is truly light: smaller surfaces, no Milky Way, no glow, no live map. On Low and Medium the panels are solid instead of blurred
- For the sharpest 3D, use Chrome or Edge with hardware acceleration on. GRAVITAS tells you once if it had to lower the quality, and it never blocks the page

### v0.64.2 · minor · 17 Oct 2026
- Rings keep their own colour when hovered or selected: hover draws thin white edges, selection pink edges and a soft pink tint, on the map and in 3D, so hover and selection are easy to tell apart
- System map: no more thin seam line across the rings, no heavy dark line between two rings, and hovering a ring no longer lights up the planet's circle too

### v0.64.1 · minor · 17 Oct 2026
- Each ring of a planet is now its own band on the system map, coloured by its type, so two-tone rings read at a glance
- Hover and selection work ring by ring, on the map and in 3D: the ring under the pointer lights up, a click selects just that ring and its panel shows all the planet's rings with the chosen one marked

### v0.64 · major · 17 Oct 2026
- Planetary rings can be selected like a body, on the system map and in 3D (Overview and True scale): hover for a tooltip with each ring's type and edges, click for a panel with type, edges, width and mass from Spansh
- A selected ring turns pink with bright edges, a hovered one lights up, and a click on empty space lets go and closes the panel. Double-click a ring on the map to fly to its planet

### v0.63.5 · minor · 17 Oct 2026
- Among a belt's rocks, flying with WASD no longer makes rocks suddenly turn: each rock keeps its own shape, turn and tumble as the field around you is refreshed
- Ringed planets: the rings' shadow on the planet is now soft and banded, without the fine stripes (moiré) that showed on some giants

### v0.63.4 · minor · 17 Oct 2026
- A click on empty space now lets go of a selected belt too, on the map and in 3D, and closes its panel
- System map: opening or closing the body panel no longer makes the map zoom back and forth. Only a change of the window size refits the whole system

### v0.63.3 · minor · 17 Oct 2026
- System map: zooming in on several big bodies no longer makes some of them go dark, and panning no longer flickers. Sharper surfaces are made one at a time, and a body on screen keeps its surface

### v0.63.2 · minor · 17 Oct 2026
- System map: zoomed far in, the star keeps its flares and its whole disc stays evenly lit (before, the flares vanished and one side went flat)

### v0.63.1 · minor · 17 Oct 2026
- System map: the names from the 3D view no longer stay on screen after switching to the map
- System map: bodies keep turning after the map redraws (before, they sometimes stopped until you switched views)
- System map: bodies under a very thick atmosphere show their banded cloud deck instead of a plain disc

### v0.63 · major · 17 Oct 2026
- A living system map: bodies and stars are drawn with the same surfaces and the same star as the 3D view, and every body turns at its real rotation period on the app's clock. Play faster to see which spin fast and which slow. The flares on the star move too. Low quality keeps still pictures
- Asteroid belts in True scale stay true: at a distance, two dashed edge lines and a faint band show where the belt is, like an orbit line. Fly in and the guides fade while real-sized rocks (tens of metres to a few km) appear around you, with fainter ones farther out. This now also works in belts far from their star, like Sol's
- In the Overview, belt rocks now lie on the gravity well like the orbits, stay smaller than the planets, and get denser with the belt's mass (from Spansh)
- Metal belts are dark grey with glints, as in the game
- A belt is now selected on its own, like a body: its own panel with its edges, width and mass, a hover ring and selection colour on the system map, its row in the Bodies list and its name in 3D. Share links can open a belt
- Belt names are short now ("A Belt", not the full system name)

### v0.62 · major · 17 Oct 2026
- One picture everywhere: Overview, True scale and the system map now use the same light, the same stars and the same surfaces. Only the sizes and distances differ
- The system map draws each star with the same surface as in 3D
- Stations on a surface now stand on the ground. Before, they floated above it
- The boiling of star surfaces and their flares follow the clock: pause stops them, playing backwards runs them backwards, and fast playback only makes them a little faster
- Asteroid belts around stars are drawn as rocks from seven different models, like the game's belt view. In True scale the rocks have their real size, so you see them only up close: double-click the belt's name to fly in among them
- A belt can be selected like a body: its name in 3D, a row in the Bodies list and the belt on the system map show its details, and a click opens it in the panel
- The grid-like ring around the star in the Overview is gone

### v0.61 · major · 16 Oct 2026
- Overview | True scale now has its own small panel to the right of the filters. Your choice is remembered in this browser, and Overview is the default
- True scale keeps everything: stations, megaships and fleet carriers stay beside their body, and stations on a surface keep their model. They are drawn enlarged, because at real size they would be invisible, and their spot is not in the data
- The system map now shows each body with the same surface as the 3D view
- Icy bodies are white unless their colour was checked in the game. Which icy bodies are red is not in the data, so we no longer guess. Bodies checked against in-game screenshots get their real colour, and the panel says so
- Stars have a boiling surface with hot bright patches, and prominences and flares rise from their edge
- Asteroid belts: scattered rocks in True scale, and a band with spokes in the Overview, as in the game's orrery. The old flat disc is gone
- New in View: "Bodies sit in the wells". Switch it off to keep every body and orbit on one flat plane, so only the grid shows the wells. Thanks to the Canonn commanders
- The date box reads a year like 2026 as a real-world date and moves to game time 3312
- Collisions: "older data" now says how old the orbit data is, and "happening now" follows the clock within seconds
- Checked in the game: Saturn and Uranus in Sol stand where GRAVITAS puts them

### v0.60 · major · 16 Oct 2026
- A new look for the 3D orrery. True scale now uses realistic light: a filmic tone curve, soft day and night lines, glints on oceans and darker edges on gas giants
- Every body gets its own surface, made on your graphics card from its data and its id, so it always looks the same: craters, ridges, ice cracks, lava, oceans, continents and clouds. Up to 4096 px on Ultra (Low 512, Medium 1024, High 2048)
- Gas giant colours now follow the game's own cloud layer model, as worked out by the EDGGG team. Class, temperature and density set the colours of its 7 layers. A layer that lands exactly on a band edge stays green, as in the game. Checked on in-game screenshots of every class
- Atmospheres scatter light: a thin halo on thin air, a soft veil on thick ones. As in the game, very thick atmospheres hide the surface and ammonia worlds still show theirs
- Rings are lit from the right side, show the planet's shadow and glow softly when the star is behind them
- Stars glow, with darker edges and moving granules
- The Milky Way in the background, drawn from where the system really is in the galaxy, with its dust lanes and the bright core. Its direction is calibrated from in-game screenshots taken on moon 9 a in Col 285 Sector VR-E b27-1, so it is approximate. Switch it off in View
- Surface details stay illustrative and the panel says so. Positions, sizes, light and shadows come from the data as before

### v0.58.1 · minor · 16 Oct 2026
- The list of bodies passing through each other no longer shrinks after Watch. It always starts from the moment the system was opened. Found by CMDR Hongark

### v0.58 · major · 16 Oct 2026
- New in the System panel: bodies passing through each other in the next 90 days. In the game, bodies whose orbits cross pass right through each other, and commanders go to watch
- When several bodies meet at once, they share one row, with the window when all of them touch
- Watch jumps to a minute before, plays at 1 min/s and shows the bodies at their true size
- Times use true positions and radii from the Spansh orbit data. They are not yet checked against the game. Thanks to CMDR LCU No Fool Like One for the systems to test

### v0.57 · major · 16 Oct 2026
- True scale for the 3D orrery: real sizes and real distances, as in space. The switch is at the right of the filters, and in View
- In True scale the bodies are not enlarged, so Body size is switched off there. Stations and carriers are hidden, because their exact spot is not in the data
- Leaving the surface view brings you back to the scale you were in. Thanks to CMDR DaftMav and the Canonn commanders

### v0.56 · minor · 16 Oct 2026
- When the system's data was last updated now stays in view under its name, with how long ago. Idea from CMDR Cyanidex
- The search box shows your recent systems. They are kept only in this browser, and one click clears them
- Rings are calmer: less glow, and the fine bands no longer shimmer from far away. Thanks to CMDR DaftMav

### v0.55 · major · 11 Oct 2026
- Stations on a surface now stand on their body in 3D too, at the latitude and longitude Spansh gives. Which way a body faces right now is not in the data, so the spot turns with an illustrative spin, and the tooltip says so
- The filters now work over the 3D orrery as well. Matches get a soft pulsing ring that can be seen from anywhere, the rest fades back. What you choose is kept when you switch views
- Hover a body in 3D, or its name, for the same details as on the system map. Stations and carriers have tooltips too
- A switch under the search box skips the jump animation, and is remembered
- Stronger atmosphere haze on the system map. New construction site icons
- The Tutorial bar and the Report, FPS and View buttons now stand exactly as tall as the time panel

### v0.54 · major · 11 Oct 2026
- On the system map, stations on a surface now stand on their body's edge. Only stations in orbit and fleet carriers hang off a body on a line
- Construction sites are hidden unless you switch them on, at the right end of the filters. The switch hides them in 3D too
- Bodies with an atmosphere show a haze in its colour, the same colours as in 3D
- Eclipses are shown by a small badge with the time: when the next one starts, or how long the shadow lasts. The dashed ring that looked like an atmosphere is gone
- Reset view works on the system map too
- The VIEW switch is wider, with both views side by side. The Tutorial button is a slim bar above Report, FPS and View
- In 3D, a click on empty space closes the body panel, as on the map
- Loading a system by dropping a file was removed. Moving the map could set it off by mistake

### v0.53 · major · 11 Oct 2026
- The system map is now one picture laid out like the game's: each star with its planets on a line, moons hanging below, a moon's own moons and every station branching to the right, one line down the left joining the stars
- Drag to move the map, scroll or pinch to zoom, and fit it back with one button. Names can be hidden
- Hover a body for its details: landable, atmosphere, stations, biological and geological signals, distance and light right now. Hover an icon for the station
- Stations filter: choose in orbit, on the surface or a large landing pad
- Clicking a body opens its panel at once. Clicking empty space closes it and the map slides wider
- Phones held sideways get their own layout instead of overlapping panels
- The VIEW button, the Tutorial button and the time panel are equally tall again

### v0.52 · major · 11 Oct 2026
- Stations in orbit: Coriolis, Orbis, Ocellus, Dodec, outposts, asteroid bases, megaships and construction sites, each matched to the body it was reported at, with a simple 3D model beside it
- The system map shows stations, settlements and fleet carriers as small icons under each body. Hover an icon for its name. New Carriers filter
- The System panel lists the stations in orbit. A body's Signals tab lists its stations in orbit and on the surface
- An open System panel now pushes the system map to the side instead of squeezing it from the top
- The VIEW and Tutorial buttons are as tall as the time panel beside them
- New tagline: every orbit, every shadow, every eclipse

### v0.51 · minor · 11 Oct 2026
- The system map now draws the game's lines: one line through each star and its planets, the moons hanging below their planet, and brackets over bodies that circle each other, nested as in the game
- Each star's row names its star
- The VIEW switch shows both views at once. The one you are in is lit, the other is faded, and a frame slides between them
- The Tutorial button is smaller and sits level with the buttons next to it

### v0.50 · major · 11 Oct 2026
- New system map: every star with its planets in orbit order and the moons below, like the game's System Map. Asked for by our squadron, TRGE
- On the map, live: which bodies are in shadow now, when the shadow ends, and when the next eclipse starts. Buttons highlight landable bodies, signals, rings, stations and eclipses within a day
- The big VIEW button switches between the 3D orrery and the system map. Flat orbits moved into the View panel
- Search suggestions are much faster and are kept for a day. Large systems load with far less work on the server, and stay in the cache for an hour
- A clear message if the site ever reaches its host's free daily limit
- Strong graphics cards start at High quality. Without a graphics card the system map opens first
- The tutorial shows the system map and no longer stops if one frame fails

### v0.49.4 · minor · 10 Oct 2026
- The browser now runs only GRAVITAS's own code and the 3D library. This blocks a visitor-counting script that Cloudflare added by itself
- Privacy tab updated

### v0.49.3 · major · 10 Oct 2026
- The sky seen from a surface was the mirror image of the game. Found from moon 9 a and fixed
- Distances and eclipse times do not change
- How it works and Accuracy explain the finding

### v0.49.2 · minor · 10 Oct 2026
- A page opened during an update could stay without its styles. Fixed

### v0.49.1 · minor · 10 Oct 2026
- New Privacy tab: what GRAVITAS keeps, what it sends and to whom
- three.js is credited in the CMDR Hongark tab
- Requests to Spansh now name the site, so Spansh knows who to contact

### v0.49 · minor · 10 Oct 2026
- Typing in a text box no longer moves the map. Thanks to the first live report

### v0.48 · minor · 10 Oct 2026
- Online at its own address, hosted on Cloudflare
- GRAVITAS is free and without ads, now and later. The CMDR Hongark tab explains the plan for the first year

### v0.47 · minor · 10 Oct 2026
- How it works checked line by line against Curtis, Meeus and Gallardo. Every formula matched. References now give chapter and equation numbers
- The textbook rotation formula is shown first. The sign difference in Elite Dangerous is now stated openly, with how we found it
- New paragraphs on barycentres, on fixed two-body orbits, and on limb darkening in the starlight percentage
- Figure 2 shows the direction of motion

### v0.46 · major · 10 Oct 2026
- Public beta. Tested on 22 very different systems, from Sol and Colonia to Maia, Jackson's Lighthouse and Sagittarius A*
- Report a problem: describe what you saw, add in-game screenshots, and the report goes straight to the developers with a link to your exact view
- FPS counter next to the View button
- If the browser is not using the graphics card, quality drops to Low and a note explains how to turn hardware acceleration on
- Surface view: asteroid belts are hidden unless you switch them on, because the game shows them clearly only up close

### v0.45 · minor · 3 Oct 2026
- Moon pairs: orbit lines of two moons that circle each other now sit with their moons on the overview map, instead of floating above it
- Eclipse calendar shows the selected body's own family: a planet with its moons, a moon with its planet and sister moons, a star with its planets. A button shows every body
- Starlight readout names the body in front of a star when the star is partly covered

### v0.44 · major · 3 Oct 2026
- Axial tilt rule corrected after two new tests in the game. Planet 3 seen from moon 3 a showed the old rule was wrong for a barycentre inside another barycentre. The eclipse of moon 9 a by planet 9 confirmed the new rule within 2 minutes
- Surface view: a Default button puts height, spot and field of view back
- Shorter, simpler sentences across the site. Wide text is justified

### v0.43 · minor · 3 Oct 2026
- How it works: redrawn figures, references as superscripts and checked again, no more scroll bars around equations
- Each release is marked major or minor
- The Feedback tab is simply 'Feedback'

### v0.42 · minor · 3 Oct 2026
- 'How it works' now explains the orbit and eclipse equations like a textbook, with figures and references
- Contact and Feedback merged into one tab
- Tutorial: the surface-view card waits until you have landed

### v0.41 · minor · 3 Oct 2026
- View from the surface now lands: the camera descends from orbit to the ground and levels out to the sky, and climbs back to orbit when you exit

### v0.40 · major · 3 Oct 2026
- Guided tour: the new Tutorial button warps you to the reference system and walks you through the map step by step

### v0.39 · minor · 3 Oct 2026
- 'What's new' became 'About GRAVITAS', with new CMDR Hongark, Contact and Feedback tabs
- Fleet carrier models drawn at a quarter of their former size
- The site is now built from separate source parts into compact files, with search-engine information in the page

### v0.38 · major · 3 Oct 2026
- Axial tilt now leans the way the game shows: found from the rings of planets 7 and 8 and the eclipse of moon 2 a, and re-checked against every earlier test
- Eclipse calendar times are exact to the minute and no longer jump as the clock runs. An eclipse that passes midnight shows its end date. Your local time is shown too
- New 'How it works' tab: where the data comes from, the equations in plain words, and how we test against the game

### v0.37 · minor · 2 Oct 2026
- Eclipse labels give both moments: when the star's edge first reappears and when it is fully clear. During the partial phase the label shows the starlight percentage

### v0.36 · minor · 2 Oct 2026
- Rings seen almost exactly edge-on fade out with their real on-screen thickness (seen from moon 2 a, the rings of planet 2 vanish, as in the game)
- The unlit face of a ring is drawn darker
- Shadow guide lines are hidden in the surface view

### v0.35 · minor · 2 Oct 2026
- A body in shadow now says when the shadow ends (game time, UTC). The first prediction, for moon 2 a, was checked in the game

### v0.34 · minor · 2 Oct 2026
- This window: what's new, what's planned, and how accurate the map is
- Your view settings, sound on/off and volume are remembered in this browser. A button puts the view settings back to defaults
- Sound starts at half volume
- Search only opens a system whose name matches exactly. Anything else gets a list of suggestions instead of a jump

### v0.33 · minor · 2 Oct 2026
- Opens live: the clock follows real game time until you choose another speed or moment
- Surface view: a 'Your spot' slider, so the tilt of a ring or crescent can be matched to what you see in the game

### v0.32 · minor · 2 Oct 2026
- View menu checked option by option: hidden fleet carriers no longer leave their names behind, hidden rings no longer cast shadows, the shadow switch turns off every shadow, the true-tilt guide lines follow the grid switch

### v0.31 · major · 2 Oct 2026
- Surface view at true scale: stand on a body and look at the sky with real sizes and distances
- Fleet carriers from Spansh, with the body they were last reported at and when
- Rings seen edge-on show as a thin line, as in the game
- Clear notes on what is illustrative (surface patterns, spin angle) and what comes from the data

### v0.30 · minor · 2 Oct 2026
- Rings and spin axes point the way they do in the game (checked from the surface of a moon)
- A planet and its moons are drawn as one rigid system

### v0.28 – v0.29 · major · 2 Oct 2026
- True tilt view: real 3D directions of orbits. It is now the default
- In true tilt, light and shadows come from the star's real direction

### v0.26 – v0.27 · major · 2 Oct 2026
- Orbit positions checked against the game: distances in the navigation panel and angles in the system map orrery
- A built-in self-test repeats that check

### v0.24 – v0.25 · minor · 2 Oct 2026
- New spacing so bodies and rings never overlap. Overlapping labels make way for each other
- Materials chart with chemical symbols

### v0.21 – v0.23 · minor · 2 Oct 2026
- Phone layout
- Warp jump with countdown voice and sound effects when you search a system
- Built-in self-test page

### v0.16 – v0.20 · minor · 1 – 2 Oct 2026
- Powers, factions and system politics
- Share links (system, body, tab and moment)
- Graphics quality presets
- Space ambience sound

### v0.09 – v0.15 · major · 1 Oct 2026
- Body panel with charts: orbit, sky, signals, rings, habitable zone
- Eclipses and starlight, sky panorama and eclipse calendar
- Gravitational lensing around black holes

### v0.03 – v0.08 · major · 1 Oct 2026
- First prototype: a gravity-well map of any system, built live from Spansh data, with a game-time clock
