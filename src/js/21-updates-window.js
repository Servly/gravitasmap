// ------------------------------------------------------------ updates window (tabs: add a new entry to NEWS_TABS)
const CHANGES = [
  { q: "2026 Q4", rel: [
    { v: "v0.94", k: "major", d: "29 Oct 2026", t: [
      "Bookmarks: the star beside the search box keeps the system you are looking at. Your bookmarks and recent systems open from the search box, and × removes one",
      "A button beside the system's name copies it, exactly as the game writes it (for the galaxy map or a message)",
      "Time: 15 and 30 minutes a second, and any speed of your own (minutes a second, ◀ backwards or ▶ forwards)",
      "Keyboard, like a media player: Space plays and pauses, ← and → go slower or faster, held down they wind back or forward fast. On the system map, ← and → move the map only when you reach it with Tab",
      "Sync with GRAVITAS: the devices that follow you are listed (for example \"Android phone · Chrome\"), and × stops one. New link stops every device and makes a fresh link and code, so a link you shared no longer works",
      "Data updated now shows Spansh's newest date. Its search could show a date days behind the system's own data",
      "Spansh's data is kept on GRAVITAS's server for 15 minutes instead of an hour, so new scans show sooner",
      "A new system that Spansh's search does not know yet opens anyway: paste its Spansh link, or its number, into the search box. A link with ?id64= opens it too",
      "Asked by CMDR Hongark and the squadron",
    ] },
    { v: "v0.93.1", k: "minor", d: "26 Oct 2026", t: [
      "GRAVITAS for EDMC (in testing) draws with its own overlay: nothing else to install. Cards like the site's combat screen, with columns, bars and the game's orange, placed as a percent of the game window so they stay in place at any resolution",
      "Asked by CMDR Hongark",
    ] },
    { v: "v0.93", k: "major", d: "26 Oct 2026", t: [
      "GRAVITAS for EDMC, in testing: Combat Mode on top of the game, for CMDRs who play on one screen. A plugin for E:D Market Connector. It works out the fight on your computer, with the same Combat Mode code as this site, and sends nothing anywhere. Asked for by many CMDRs",
      "Sync card: the Plugin button tells what it is and what it needs. It takes the place of Show me, which is on the map already (Find me)",
      "Combat Mode's code is now in two parts: the fight itself (one file, the same on the site and in the plugin) and the screen. Nothing changes on the site: every combat test and CMDR Hongark's own journals give the same results as before",
    ] },
    { v: "v0.92.6", k: "minor", d: "25 Oct 2026", t: [
      "GRAVITAS MODES holds only the modes: Combat, Thargoid and On Foot. Combat glows red in a fight and amber when hostiles are near. A small blue dot means a team board is open",
      "Combat Mode's window has three parts: Overview, Past combats and Team board. Past combats and the team board open there, in a window, not over the whole screen",
      "Past combats: ✕ deletes a report from this browser, with Undo for a few seconds. The totals follow",
      "A combat report opens as a window too. The live fight stays full screen",
      "Team board: what it is and how to start one, step by step, in its own part of the window",
      "Asked by CMDR Hongark",
    ] },
    { v: "v0.92.5", k: "minor", d: "25 Oct 2026", t: [
      "GRAVITAS's source code is public on GitHub, under the MIT licence: github.com/Servly/gravitasmap",
      "How GRAVITAS reads your journal, step by step in the code, and how to check it yourself: linked from the Privacy tab and the Sync window",
      "Every release now also goes to GitHub with its version number and these notes",
    ] },
    { v: "v0.92.4", k: "minor", d: "25 Oct 2026", t: [
      "GRAVITAS MODES: a new panel on the left, between Bodies and Sync. Combat Mode, and Thargoid and On Foot (planned) each open in their own tab, like About GRAVITAS. Past combats and the team board moved there from the Sync card. Asked by CMDR Hongark",
      "While a fight or a team board is live, the panel shows it, and one click opens it. The board no longer floats over the system map (it still does on phones)",
      "Team board: one CMDR counted as 1, 2, 3... while sitting idle. Each time the link dropped and came back, the board added a new row. Now a CMDR keeps one row, the count shows who is on the board now, and a quiet link is kept open. Found by CMDR Hongark",
      "The GitHub links are hidden until the repository opens",
    ] },
    { v: "v0.92.3", k: "minor", d: "25 Oct 2026", t: [
      "Combat Mode no longer opens for a look: pirates scanning you, or a wanted ship you lock, only light the small HOSTILES NEAR chip. The screen opens when the shooting starts. If nothing happens in 20 seconds, the chip goes out. Found by CMDR Hongark",
      "Cycling targets no longer keeps a fight going",
      "After an Operation, the game writes a few late attack lines while you are docked. They no longer start an empty fight that hid your real report. Your report stays on screen",
      "A fight with no kills, no shields lost and under a minute of fire leaves no report",
    ] },
    { v: "v0.92.2", k: "minor", d: "25 Oct 2026", t: [
      "Getting GRAVITAS's source code ready for GitHub, under the MIT licence",
      "Privacy tab: how to check it yourself in your browser (F12, Network tab)",
      "Privacy tab, more exact: Cloudflare's short technical logs include the names of the systems your map asks for, and from v0.91 to v0.91.7 a paired device's combat screen was kept for up to 12 hours (changed in v0.92)",
      "Once the GitHub repository is open, every release will also go there with its version number and these notes",
    ] },
    { v: "v0.92.1", k: "minor", d: "25 Oct 2026", t: [
      "3D: the mouse wheel works again with the browser zoomed below 100 % (for example 90 % in Chrome). One turn of the wheel threw the camera onto the body or five billion units out. The cause was one line in the 3D library's controls, now fixed",
      "3D: the camera also stays within a few times the size of the system, and comes back at once if it is ever further out",
      "3D: the camera no longer goes inside the body it looks at, where the screen turned black",
      "The measuring box (?perf=1) has a Close button. Found by CMDR War Khan",
    ] },
    { v: "v0.92", k: "major", d: "25 Oct 2026", t: [
      "Combat Mode: Targets by value. Cycle \"next hostile\" and every ship you scan lands in a list, the most valuable first, with its bounty, shields and hull. Sort by value or by your own ship order (Fer-de-Lance, Corsair, Python Mk II first, change it as you like). Clean ships are marked: firing on them is a crime. Idea by CMDR Cyanidex",
      "Team board: one link, everyone's fight on one screen. Each CMDR adds their own fight from their own game, anyone with the link can watch, and when everyone is done it shows the results, ready to copy as an image. GRAVITAS's server keeps nothing. Idea by CMDR Cyanidex",
      "The combat report lists the ships you locked that are not among your kills: they got away, or someone else finished them",
      "A fight now lasts until its last hot moment, not until the calm was noticed, and going into supercruise ends it at once",
      "A new Combat Mode intro: a cinematic cue made for GRAVITAS, a rising swell and two huge brass blasts over war drums",
      "Your privacy: with a phone or tablet paired, the combat screen now only passes through GRAVITAS's server and is never kept. The Privacy tab tells exactly what Sync and Combat Mode read",
      "About GRAVITAS: a Thanks tab, and the Turkish Galactic Empire [TRGE] squadron. The tabs no longer jump when you switch between them",
      "GRAVITAS's source code is going public on GitHub (MIT licence), so anyone can check what GRAVITAS reads and what it sends",
    ] },
    { v: "v0.91.7", k: "minor", d: "25 Oct 2026", t: [
      "Combat Mode comes in like a screen cutting over: a bright line, COMBAT MODE in the middle, then the combat screen",
      "A new alert: a warship's battle-stations klaxon, made for GRAVITAS (three rising horns over a low impact)",
      "Operation places show their names (\"Docked at Frontline Runner\") instead of the game's codes",
      "Team tab: each teammate's ship, rank and squadron once you have locked them, how often they were in your sights, their lines in team chat (only the count), how your kills were shared (solo, with 1, 2 or 3), and your combat rank",
      "A teammate in your sights is marked in blue in the ships list and on the timeline. Fire on a teammate is shown when the game records it",
      "An enemy's last words under its kill, \"critically hit\" for ships that cried out, and the game's large-fight moments shaded on the timeline",
    ] },
    { v: "v0.91.6", k: "minor", d: "25 Oct 2026", t: [
      "Combat Mode: \"~21 enemies seen · 12 you helped destroy\" with a 12/21 ring, on the combat screen, the report, the Discord card and Past combats. Seen means a ship you locked or a pilot who spoke to you in the fight (their threats and cries carry their name). The game lists no ships around you, so it is an estimate, and a kill counts when you damaged it",
    ] },
    { v: "v0.91.5", k: "minor", d: "25 Oct 2026", t: [
      "Combat report on big screens: the card is drawn at twice the size (sharp on large and high-density screens, and when pasted into Discord), and the page keeps to the card's size instead of stretching it",
      "The timeline's dots stay round at any width (they were stretched into ovals)",
      "A teammate's crew or fighter (\"Crew CMDR …\") no longer appears among the ships you fought",
    ] },
    { v: "v0.91.4", k: "minor", d: "25 Oct 2026", t: [
      "Sync panel: the buttons no longer spill out of the panel. Past combats moved into the Sync card (bottom right)",
      "Phone is now Devices (a phone or a tablet), up to 4 at once, as the Show on a phone or tablet window now says",
      "The computer knows whether its devices are really there: green only while a device follows, amber while waiting, and \"asleep\" when a linked device went quiet (screen off, app in the background) for 40 s. It catches up as soon as it wakes",
    ] },
    { v: "v0.91.3", k: "minor", d: "24 Oct 2026", t: [
      "Interdiction in stages: the combat screen comes up the moment the tether pulls you (the game's own flag), then shows who dropped you, whether you submitted, or that you escaped (an escape with nothing else closes the screen 12 s later)",
      "Lock the same target again and the combat screen shows how much shield and hull came off since your last lock, and how fast (%/s)",
      "The report has a timeline of the whole fight: phases, every kill (bigger dots for bigger bounties), waves of fire, heat warnings, interdiction",
      "The Operation's name (from the journal, e.g. Terminal Prosecution) on the combat screen, the report, the card and Past combats",
      "Past combats shows your career totals from the game: bounties, combat bonds, highest single reward",
    ] },
    { v: "v0.91.2", k: "minor", d: "24 Oct 2026", t: [
      "Combat Mode in Operations: the lulls between phases no longer end the fight. One Operation is one combat, with its phases marked (PHASE 2 at the top, phase breaks in the kill feed, \"3 phases\" in the report)",
      "Takedown speed: how long each kill took from your first lock, the average and the fastest, and how fast shields and hull came down (%/s). The game writes no damage numbers, so this comes from the shield and hull % at each lock and the moment of the kill, your team's fire included",
      "Past combats: every combat report is kept in this browser (the last 30), with totals. Open them from the crossed-swords button in the Sync panel, or from a report",
      "No combat screen from the game's menu music while docked",
    ] },
    { v: "v0.91.1", k: "minor", d: "24 Oct 2026", t: [
      "Combat Mode shows only what the cockpit does not: the module you target on your target (its health, e.g. the FSD before it can run), every ship you fought this fight (destroyed ones struck through), the kill feed (solo or shared with the team) and the fight",
      "Solo and Team tabs in a team: the team, your kills shared with them and your solo kills. Your teammates' own kills are not in your journal",
      "The combat report is now an image card: Copy image and paste it straight into Discord, or save it",
      "Times under fire count waves (a burst of hits is one), not every hit",
    ] },
    { v: "v0.91.0", k: "major", d: "24 Oct 2026", t: [
      "Combat Mode (with Sync on): the moment a fight starts, GRAVITAS turns red and becomes a combat screen. The locked target (ship, pilot, rank, faction, bounty, shield and hull as last scanned), a kill feed with every bounty, the fight's tally (kills, credits, time, kills per minute, times under fire, heat warnings) and your own ship (shields, pips, fire group, fuel, hull and ammo at launch)",
      "In an Operation: the site, the threat, the team and the time on a strip at the top",
      "When the fight calms down, a combat report stays on screen, with a short text to copy for Discord",
      "Your paired tablet shows the same combat screen, as a second screen beside the keyboard",
      "While the combat screen is up, the map and the 3D view are not drawn at all: the graphics card is the game's. The Map button (or Esc) shows the map again, with a red COMBAT chip at the top",
    ] },
    { v: "v0.90.8", k: "minor", d: "24 Oct 2026", t: [
      "Target: a targeted carrier now also says which body it is parked at (Target JBY-46M · near A, or orbiting A)",
      "Your carrier parked at a star itself now sits on the star's line on the system map, in order of distance like the game's map, instead of hanging on the star. The distance comes from the journal when you dock aboard; until then it is placed first",
      "Sync: the computer could end up showing another system than the ship's (the tablet was right). An older system request that answered late could replace the newer one. Now only the newest request is drawn, and with auto-jump on, if the map shows a system you did not open yourself, the ship's system comes back within a few seconds",
    ] },
    { v: "v0.90.7", k: "minor", d: "24 Oct 2026", t: [
      "Your own carriers, from your journal (with Sync on): your fleet carrier and your squadron's carrier are placed where the journal says, beside the right body, even when Spansh still has them somewhere else or not at all",
      "A planned carrier jump counts down to departure, on the carrier, in the Sync card, and in the system it is jumping to (\"jumping here\"). A cancelled jump disappears, and at departure the carrier moves to its new system",
      "Target: a carrier you target in the game is recognised by its callsign or name, so the target is the carrier, not the body it parks at",
    ] },
    { v: "v0.90.6", k: "minor", d: "24 Oct 2026", t: [
      "Event card: \"Show the body\" appears only when that body is not already open (from the station window, say), and opens its Sky tab",
    ] },
    { v: "v0.90.5", k: "minor", d: "24 Oct 2026", t: [
      "Event cards open on the first press. The Sky tab and the station window refresh their times several times a second, and a press that landed during a refresh was lost, so it could take a few presses",
    ] },
    { v: "v0.90.4", k: "minor", d: "24 Oct 2026", t: [
      "Route mode: an old, finished route no longer comes back after a fleet carrier jump. The game leaves the last route in its file, and when the ship moved without it (on a carrier) GRAVITAS showed it again from its start, as a route back to where it ended. A route that does not include the ship's system is now ignored",
    ] },
    { v: "v0.90.3", k: "minor", d: "24 Oct 2026", t: [
      "System map: no more dark flashes while zooming, dragging or changing the quality. When the drawing resolution changed, the map could stay blank for a frame or more. It is now redrawn at once, and a picture whose shader is still being prepared is simply left out for that moment",
    ] },
    { v: "v0.90.2", k: "minor", d: "24 Oct 2026", t: [
      "System map: the live pictures no longer switch off while a shader is prepared (the map could blink dark and back). They wait only once, when a system first opens, and after that a wait just keeps the last picture on screen",
      "A system with a black hole no longer re-checks the map's shaders on every frame",
    ] },
    { v: "v0.90.1", k: "minor", d: "24 Oct 2026", t: [
      "Fixed: an error message could open by itself on the system map (\"Cannot read properties of undefined (reading 'isReady')\"). It came from three.js's background shader compile when a map picture was thrown away while its shader still compiled. GRAVITAS now waits for the compile itself and simply skips a picture that is gone. Thanks for the report",
    ] },
    { v: "v0.90", k: "major", d: "24 Oct 2026", t: [
      "v0.9, the complete version. From here on: testing and fixes on the way to v1.0, then the code goes public on GitHub (MIT licence)",
      "Day and night at settlements: on tidally locked moons (one face always to their planet, like 7 c to 7 g here) every settlement and surface port shows whether it is day or night now, how high the star is, the next sunrise and sunset, how long a day lasts there and whether its planet hangs in the sky. In the station window and in the Sky tab. Bodies that spin freely: the data has no rotation phase, so no times, and the panel says so",
      "Being checked: which side of a locked moon faces its planet and which way is east are assumed (marked on the panel) until compared with the game",
      "Event cards: the next eclipse (Sky tab, ⏰ Event card) and every sunrise or sunset at a settlement open a card with a live countdown, game time and your own time, a link that opens the same card for a friend, and Add to calendar (.ics) with a reminder 15 minutes before",
      "Watch: a new group, System state: Boom, War and Civil War, with the factions and the date of the report",
      "No freeze when the camera enters an atmosphere: the shell seen from inside needed a new shader in the middle of the zoom. Both sides are now prepared with the rest, so zooming close or landing in the surface view compiles nothing new",
      "A nicer page for addresses that do not exist",
    ] },
    { v: "v0.83", k: "major", d: "23 Oct 2026", t: [
      "First step to v0.9, the complete version: stability. GRAVITAS no longer uses a graphics shader before the driver has finished compiling it. Using one earlier made the browser wait on the spot, and on Windows that wait happens in the browser's one graphics process, so every Chrome tab could freeze with it (the \"whole browser froze when I zoomed in\" reports)",
      "The surfaces, the Milky Way, the map pictures, the live map, the glow and the 3D scene now compile their shaders in the background first. The 3D view waits behind the loading screen until they are ready, and the loading screen no longer goes away while they still compile",
      "The loading screen now prepares the exact shader versions the 3D view uses (three.js keeps one for drawing into a picture and one for the screen; the wrong one was prepared before)",
      "The surface shader is prepared, and drawn once on 8 pixels, a few seconds after a system opens, so the first zoom onto a planet no longer stalls",
      "Measured on a software graphics card (the slowest case): entering 3D blocked the page for 1.7 s in total, now 0.7 s; the first zoom's longest stall went from 1.4 s to 0.13 s",
      "For the curious: ?perf=sync measures each part of a frame on any card, also without a GPU timer (slow while open)",
    ] },
    { v: "v0.82.5", k: "minor", d: "21 Oct 2026", t: [
      "Watch: tick what you do not want to miss on the way (Watch ▾ at the top of the route column). Earth-like, water and ammonia worlds, terraformable bodies, biological and geological signals, landable worlds with an atmosphere, ring hotspots, neutron stars, black holes, white dwarfs, Wolf-Rayet, carbon and giant stars, water giants, helium-rich gas giants and gas giants with life",
      "Matches show as small badges on the system you are in and your next three jumps, in the column and the bars below. Only those four systems are checked, and only a few numbers of each are kept, so it stays light",
      "Arriving at a match: a short WATCH note, one soft chime (you can turn it off in the menu), and the matching bodies glow on the map",
      "Fuel stars in the route column: an amber edge and a little fuel pump",
      "3D on a computer now has the same buttons as the map: Find me, Follow, zoom in and out, Reset view and names, top right beside the open window",
    ] },
    { v: "v0.82.4", k: "minor", d: "21 Oct 2026", t: [
      "Your ship's target from the game, in orange, on the system map and in 3D (overview and true scale): under the body or station, pointing up. You are here stays above, pointing down, so the two never cover each other, even on the same body. A target in another system (your next jump) is not marked",
      "Follow: a lock beside Find me, on the system map and on the 3D buttons of phones and tablets. While locked, a dashed ring turns around it and the view keeps your ship in sight: the map glides to it when it moves on, 3D stays on it. Dragging the map or picking another body unlocks it",
      "Out in supercruise with no exact place known, the green tag stays where your ship was last seen, as an outline: \"In supercruise · last seen near 3\". The system chip says so too",
    ] },
    { v: "v0.82.3", k: "minor", d: "20 Oct 2026", t: [
      "A new route starts a new journey: the bar above the map says \"Your journey starts here\" and also where you were last (\"last time you left … 9 h ago\", tap it to open that system). The systems you pass on this route then fill it",
      "Earlier trips are not lost: scroll up past the line \"Earlier trips above · this journey below\". A jump after more than an hour without one also starts a new journey. A reload or a recalculated route keeps the journey you are on",
    ] },
    { v: "v0.82.2", k: "minor", d: "20 Oct 2026", t: [
      "The last jump: the game clears the route as the last jump starts. GRAVITAS took that as a cleared route, said ROUTE CLEARED during hyperspace and showed the system you were leaving on the normal map. Now route mode stays through the jump and ends with ROUTE COMPLETE once you arrive",
    ] },
    { v: "v0.82.1", k: "minor", d: "20 Oct 2026", t: [
      "Route column on a computer: wider on wide screens, and long system names wrap to two lines instead of being cut",
      "The bar above the map now always shows the system you just left (it could stay on an earlier one when route mode opened)",
      "The green \"In supercruise · heading to …\" chip stays inside the system panel (hover it for the full text)",
    ] },
    { v: "v0.82", k: "minor", d: "20 Oct 2026", t: [
      "A new route while on one: the map stays in route mode and says ROUTE RECALCULATED with the new destination, jumps and distance. The column and the bars refresh with a short motion",
      "When the game clears the route for a moment before the new one, the old route stays for a few seconds, faded, with \"Route changing in the game…\". Only if no new route comes does it say ROUTE CLEARED",
      "The last jump: route mode stays while your last system is drawn, with an Arrived bar, and leaves a moment later with ROUTE COMPLETE. No more jump back to the normal map before the last system appears",
      "Route mode comes and goes with motion: the column slides in from the left, the bars from above and below, and the map's edges glide to their new place. Leaving, it is the other way round, and the map is fitted again",
      "Phones and tablets ask your computer every 10 seconds whether they are in step, and at once when they wake up or come back online. If they fell behind, the computer sends the news again. A link that went quiet while the device slept is rebuilt at once",
    ] },
    { v: "v0.81", k: "minor", d: "20 Oct 2026", t: [
      "Route mode: when you plot a route, a short message says the system map now follows your route, and another says when you leave it (route cleared, or route complete when you arrive)",
      "The whole route in a column on the left of the map: jumps done, the system your ship is in, and every jump ahead with its star, length and distance so far. It scrolls, and after each jump your ship's row moves to the top. Tap any row to open that system",
      "Jumps are numbered by their place in the route: Jump 7/50, then 8/50 after the next jump, instead of always 1st jump",
      "The next three bars now show each system's summary: bodies, landable ones, stations, people, economy, security and Earth-like, water or ammonia worlds. Until it arrives, the bar says what the star means for you (fuel scoop or boost). Only the summary is kept, the data itself is dropped",
      "A clear jump motion: the map you leave slides up and shrinks into the bar above, the new system unfolds up from the next bar, and the bars below move up one stop",
      "Back to (your ship's system) now shows that system whole, fitted to the screen",
    ] },
    { v: "v0.80", k: "major", d: "20 Oct 2026", t: [
      "The journey. When Sync knows your plotted route, the system map becomes a column: the system you just left as a thin bar above the map (scroll up for the ones before it), the map of where you are, and your next three jumps as thin bars below it: 1st, 2nd and 3rd jump, the star (fuel or a boost), the jump's length, and for the next one its bodies, landable ones, stations and people",
      "When your ship jumps, the map you leave rises into the bar above and the new system grows up from below. The next system is fetched while you fly to it, so the new map is there at once",
      "Tap any bar to open that system. Its bar then carries Back to (your ship's system) at its right end",
      "Light on memory: only the system behind you, the one you are in and the next one are kept; every other stop is just a name until you tap it",
      "On phones and tablets the bar left behind takes the route strip's place at the top, and the next jumps sit above the clock. Only on the system map: 3D keeps the route strip",
    ] },
    { v: "v0.79.9", k: "minor", d: "20 Oct 2026", t: [
      "Find me: a target button above the zoom buttons, on the system map and in 3D on phones and tablets. One tap goes straight to your ship, like a navigation app: the map glides and zooms in on it, 3D flies there. It is green when your ship is known (Sync with the game, on this computer or followed from one)",
    ] },
    { v: "v0.79.8", k: "minor", d: "20 Oct 2026", t: [
      "The station window now has its own room like the Body window: the system map (and in 3D the filter bar) moves aside instead of lying under it, and the station is marked on the map and its name in 3D, like a selected body",
    ] },
    { v: "v0.79.7", k: "minor", d: "20 Oct 2026", t: [
      "The station window works like the Body window: same place, same title bar with Collapse and Close, and a click on empty space (map or 3D) closes it. Picking a body brings the Body window back",
      "Stations in orbit: the body is named with much more certainty. A second body is offered only when it really was as close at the reported time (within 0.1 ls), so \"7 e or 7 f\" now shows only when it truly cannot be told apart",
      "Shipyard: S, M, L now simply say small, medium or large ship",
    ] },
    { v: "v0.79.6", k: "minor", d: "20 Oct 2026", t: [
      "Outfitting is tables all the way: every module shows one plain line, and a tap opens its table. Weapons: sizes down the side, fixed, gimballed and turret across, the grade in each cell. Other modules: a dot for each size and grade on sale",
      "Armour is one table: ships down the side, the five kinds across, ● for the usual armour and ◆ for the Mk II ablative kind",
      "The newer ships are named in the armour list too (Kestrel Mk II, Lynx Highliner, Caspian Explorer)",
    ] },
    { v: "v0.79.5", k: "minor", d: "20 Oct 2026", t: [
      "Outfitting says plainly what is sold: \"Sizes 2–8 · grades A–E · every grade\". A tap shows a small table with a dot for each size and grade on sale. Weapons with one grade per size keep their short chips (1F 2E 3D). A line explains sizes and grades",
      "Market: the column titles stay in place when categories open and close",
    ] },
    { v: "v0.79.4", k: "minor", d: "20 Oct 2026", t: [
      "Station window: every group starts closed, open only what you need. Expand all and Collapse all, beside the search, open or close a whole tab at once. A search still opens the groups with a match",
    ] },
    { v: "v0.79.3", k: "minor", d: "20 Oct 2026", t: [
      "Outfitting has a second level, like the game's menu. Hardpoints: lasers, cannons, missiles and torpedoes, mines, plasma and rail, mining tools, Guardian and anti-xeno weapons. Utility: shield boosters, countermeasures, scanners. Core: armour, frame shift drives, thrusters, power plants and the rest. Optional: shields, protection, limpet controllers, cargo and fuel, hangars and cabins, docking, exploration and more",
      "Each weapon once, with a line for each mount (fixed, gimballed, turret) and its sizes and grades",
      "Armour by ship: each ship with the armour grades sold for it",
    ] },
    { v: "v0.79.2", k: "minor", d: "20 Oct 2026", t: [
      "Outfitting: a module's sizes and grades come as one chip per size (8 ABCDE, 7 ABCDE…). When they do not fit beside the name they go under it, so they never run over the name. The same size and grade twice is shown once",
      "Shipyard: the newer ships have their makers and pads too: Caspian Explorer (Zorgon Peterson, L), Lynx Highliner (Zorgon Peterson, M), Corsair (Gutamaya, M), Kestrel Mk II (Core Dynamics, S), Type-11 Prospector (Lakon). No \"Other\" group: a ship GRAVITAS does not know yet is listed last",
    ] },
    { v: "v0.79.1", k: "minor", d: "20 Oct 2026", t: [
      "Station window: the market is grouped by category (Metals, Chemicals, Technology…), each group opens and closes. Sorting by a price, stock or demand lists everything in one order across the categories",
      "Outfitting comes in the game's four kinds (hardpoints, utility mounts, core and optional internals), each module once, with its sizes and grades side by side and fixed, gimballed or turret where it matters",
      "Shipyard: the ships by maker, each with the landing pad it needs (S, M, L)",
      "Long lists start closed, short ones open. A search opens every group with a match",
    ] },
    { v: "v0.79", k: "major", d: "20 Oct 2026", t: [
      "Stations have their own window. Click or tap a station, a settlement, a construction site or a fleet carrier: on the system map, on its name in 3D, in the System panel or in a body's panel",
      "In it: where it is, its landing pads (can a large ship dock?), its services (refuel, repair, black market, Interstellar Factors, material trader and more), its economy, government and faction",
      "Its market: what it sells and buys, prices, stock and demand. Sort by any column, show only what it sells or buys, or search. Illegal goods are listed too",
      "Search a commodity and the window also shows where else in this system it is cheapest to buy and pays most to sell",
      "Its outfitting by kind of module, and the ships its shipyard sells. Each list says how old it is: these come from players' tools through Spansh",
      "Several stations on one mark of the map: the window lists them first",
      "Phones and tablets: the 3D buttons (zoom, Reset view, names) now also show while following a computer",
    ] },
    { v: "v0.78.6", k: "minor", d: "19 Oct 2026", t: [
      "Sync with GRAVITAS keeps its pace behind the game. With the game in front, the browser slowed the GRAVITAS tab's timers to about once a minute after a few minutes. The Journal was read late, and the phone or tablet showed \"Last seen in…\" and \"Connecting…\" now and then. Sync now keeps its own one-second clock in a small background worker",
    ] },
    { v: "v0.78.5", k: "minor", d: "19 Oct 2026", t: [
      "Phones and tablets following a computer: the route is on the main screen, on the map and in 3D. Jumps left, light years to go and the next stop with its star class, just under the Sync pill. A tap opens the Sync window with every jump",
    ] },
    { v: "v0.78.4", k: "minor", d: "19 Oct 2026", t: [
      "Phones and tablets: the 3D view has the map's buttons too, at the bottom right: zoom in, zoom out, Reset view (⤢) and names on or off (Aa)",
      "Filters close with a tap anywhere outside them. That tap only closes them, it does not pick a body",
    ] },
    { v: "v0.78.3", k: "minor", d: "19 Oct 2026", t: [
      "Phones and tablets: after a drag that started on a name in 3D, turning and pinching stopped working. Fixed: the finger is handed to the 3D view and its lift always reaches it, so every gesture keeps working",
      "Sync with GRAVITAS: the link server now answers a closing link, so both sides end it cleanly",
    ] },
    { v: "v0.78.2", k: "minor", d: "19 Oct 2026", t: [
      "In 3D, the mouse wheel over a name (a body, a station, a carrier) zooms like anywhere else. In a crowded system the names covered much of the view and the zoom seemed stuck",
      "A drag that starts on a name turns the view. A plain click on a name still selects it",
      "After an unexpected stop, GRAVITAS runs on Low for that one visit only, no longer for good",
      "The system map's live surfaces also wait while the graphics card is behind",
    ] },
    { v: "v0.78.1", k: "minor", d: "19 Oct 2026", t: [
      "The 3D orrery opens behind a loading screen: shaders, the Milky Way and the surfaces in view are made ready first, so the view moves smoothly from the start. It shows the first time for each system and after a quality change. Skip or Esc ends it",
      "No more frozen browsers: GRAVITAS now checks after every frame whether the graphics card has finished it. When the card falls behind, background work stops and new frames wait, so the browser and other windows stay responsive. This works in every browser, also with ?perf=1 open",
      "Medium is lighter: surfaces are painted in smaller pieces each frame",
      "Auto is more careful: it tries Medium only when the card had room to spare, steps back to Low at the first long wait, and remembers that for two weeks on that computer",
      "The Sync switch on the computer stays inside its window with every status word",
    ] },
    { v: "v0.78", k: "major", d: "19 Oct 2026", t: [
      "Sync at a glance: one light, the same on the computer and the phone. A green dot that breathes: live. Amber half disc: waiting (game closed, computer not sharing). Red cross: the link dropped and is being rebuilt by itself. Grey ring: off",
      "A new Sync panel: the system, where your ship is (docked, landed, in supercruise, jumping…) and how fresh the news is. Its buttons have the site's own icons, Auto-jump is a switch, and a line under it shows the phones that follow",
      "Your route: Sync reads the route you plotted in the galaxy map. Jumps left, light years to go, the next stop, and every jump with its star class (fuel stars and neutron boosts marked) and its length against your ship's jump range",
      "An arrival card for five seconds after each jump: the system, its star, bodies, landable, life, stations and the jumps still to go",
      "A short jump sound when the jump starts (switch in View). The background hum now plays in the 3D view only, the system map stays quiet",
      "A phone or tablet notices a link that went quiet and rebuilds it by itself. The route and the card come to the phone too",
      "Measuring box (?perf=1): no old numbers on the map, and on a phone it sits low, clear of the buttons"] },
    { v: "v0.77.2", k: "minor", d: "18 Oct 2026", t: [
      "Finished colony buildings show again, on the map, in 3D and in the panels. Spansh keeps calling them \"Construction Depot\" after they are built, so GRAVITAS took them for building sites and hid them with the construction switch. Only a name that still starts with \"Construction Site\" counts as one now",
      "Phones and tablets: Sync has its own window (left edge), with its state, the code box and short steps. About no longer holds it",
      "Filters are a small card beside their tab: the view stays visible and usable, the tab shows how many are on, and a tap on it closes them",
      "Map | 3D stays at the top right, also while following a computer",
      "The surface view's controls sit under the top bar. A tap on its title shows the long note",
      "Phones and tablets start on Low quality. View can raise it"] },
    { v: "v0.77.1", k: "minor", d: "18 Oct 2026", t: [
      "T Tauri stars looked like T brown dwarfs (striped and dim), because both classes start with T. They now look like the young sun-like stars they are"] },
    { v: "v0.77", k: "major", d: "18 Oct 2026", t: [
      "Phones and tablets get their own layout, upright or sideways. The system map or the 3D view fills the screen",
      "A slim bar on top: the system's name (tap it to search) and Map | 3D. In 3D, Overview | True scale sits just below",
      "Every window waits on the screen edge as a named tab: Bodies, System, View and About on the left, Body and Filters on the right. Tap a tab or pull it. Tap beside a window or push it back to close it",
      "The clock sits at the bottom: tap it for real time, speed, the date and Reset view",
      "A body you tap opens on the right, the map stays usable beside it. Filters work from their own window in both views",
      "Uses the whole screen on phones with a notch or rounded corners. Nothing extra runs while you look: the windows move with the browser's own animation",
      "New icons for every structure type: clearer at small size, on the map and in the panels"] },
    { v: "v0.76.4", k: "minor", d: "18 Oct 2026", t: [
      "Every kind of structure now has a little model of its own, in 3D and as an icon on the system map and in the panels",
      "Outposts in orbit by what they do (industrial, scientific, military, civilian, extraction, tourism, agriculture, anarchy), and installations: satellite, communication, space farm, pirate base, mining, relay, military, security, government, medical, research, tourist and space bar",
      "On the surface: civilian, industrial and scientific outposts, Odyssey settlements by economy (farms, mines, industry, military, bio labs, tourism) and the hubs",
      "The look comes from the type and main economy Spansh reports. The real layout of a station is not in the data. Installations and hubs have no landing pads, so Spansh may not list them: they show when it does"] },
    { v: "v0.76.3", k: "minor", d: "18 Oct 2026", t: [
      "Phones and tablets: every window now has a named tab on the screen edge (Bodies, System, View, About on the left, Body on the right). Tap it or pull it. A finger on a tab no longer moves the map",
      "The windows slide in with a soft glow. About GRAVITAS and Report a problem are in the About window, also while following a computer",
      "No more false \"stopped unexpectedly\" note on phones and tablets. iPad Safari and Android Chrome close pages in the background without notice, and GRAVITAS took that for a crash and started on Low",
      "A tablet that follows a computer keeps its smooth pace (iPad Safari often says the page has no focus, which slowed it to a few frames a second)"] },
    { v: "v0.76.2", k: "minor", d: "18 Oct 2026", t: [
      "A phone or tablet that follows your computer now shows only the system map, full screen, upright or sideways",
      "Everything else waits at the edges: pull the left edge (or tap it) for Bodies, System, View and About. Tap a body and its panel slides in from the right. Push a panel back, or tap beside it, to close it",
      "A small bar on top says where your ship is and how the link runs. Its switch stops following. The Sync bar no longer covers the About panel"] },
    { v: "v0.76.1", k: "minor", d: "18 Oct 2026", t: [
      "Asteroid bases appear again, in their belt: on the system map under the belt's name, in 3D among its rocks, in the System panel (\"in the A Belt\") and under You are here when you dock there"] },
    { v: "v0.76", k: "major", d: "18 Oct 2026", t: [
      "Sync with GRAVITAS: your phone or tablet becomes a second screen. With Sync on, click 📱 Phone on the computer and scan the QR code (or type the 6-digit code under About on the phone). The phone follows your jumps, shows You are here and your target, live",
      "It goes through the GRAVITAS server, or straight over your own network when that is clearly faster. The way is chosen once and remembered",
      "Only the small summary Sync shows is shared. Your Journal stays on your computer",
      "After a jump, You are here sits on the arrival star only for the first minute (\"Arrived here\"). Out in supercruise it says \"In supercruise · heading to …\" instead of pinning the star",
      "Lighter again: the little moon in the GRAVITAS logo no longer keeps the browser busy all the time (it circles when the page opens and under the pointer). On the map at rest the browser now does about a fifth of the work"] },
    { v: "v0.75.7", k: "minor", d: "18 Oct 2026", t: [
      "Lighter on every computer: the same pictures with much less work. Orbit lines, the clocks, the 3D names and the sound bars no longer redo their work every frame when nothing changed (about two thirds less script work in our measurements)",
      "The system map no longer runs at full speed for as long as you stay on it (it waited for the 3D Milky Way, which is only drawn in 3D)",
      "Safer zooming in: new surface pictures are finished in one step instead of being rebuilt again and again while they are drawn, and shaders no longer stop the page to check themselves. Laptop graphics cards start at Medium",
      "On Medium the glow is worked out at half resolution: about half its cost, the look is the same",
      "Star flames are calmer, lighter to draw and no longer flicker. While a star is big on screen it moves at 30 frames a second",
      "You are here points at your surface port's pin on the map when you are docked there",
      "Sync says \"Last seen in …, the game is closed\" after you quit the game",
      "If GRAVITAS ever stops unexpectedly, the next problem report carries what was on screen, even after a reload",
      "For the curious: add ?perf=1 to the address to see what each frame costs on your computer"] },
    { v: "v0.75.6", k: "minor", d: "18 Oct 2026", t: [
      "Sync carries on where you left it. With Sync on, the next visit opens the system your ship was last in (not Sol), and follows the ship by itself if you jumped while the site was closed",
      "When Chrome asks for the Journal folder again, choose \"Allow on every visit\": then Sync starts by itself on every visit",
      "A link to another system still opens that system. Sync then only offers to jump to your ship",
      "Screen readers: the main part of the page is now the view on screen, the map or the 3D view"] },
    { v: "v0.75.5", k: "minor", d: "18 Oct 2026", t: [
      "Safety: the browser is told to always use https here, and the site turns off what it never needs (camera, microphone, location and similar)",
      "three.js, the 3D engine, now comes from this site instead of an outside server. One less outside dependency, and nobody else sees your visit",
      "Problem reports: one a minute from the same place, and only from GRAVITAS itself. This keeps bots from filling the inbox, so real reports always get through",
      "Systems you look up are remembered by the server for an hour, so Spansh is asked less often"] },
    { v: "v0.75.4", k: "minor", d: "17 Oct 2026", t: [
      "The pop-out map is gone. A browser window over the game took the game's focus on a click, and browsers do not let a website place it or keep it out of the way. Thanks to everyone who tried it",
      "Sync, You are here and the ship's target on the site's own map stay as they were"] },
    { v: "v0.75.3", k: "minor", d: "17 Oct 2026", t: [
      "Pop-out map: two kinds to try in the game. Classic is a small window with Chrome's own bar. Frameless (test) plays the map in Chrome's video window, with no bar around it. The weaker one goes in a later version",
      "Classic: a thinner strip at the very top middle of the screen, a smaller bar, and no \"back to tab\" button",
      "Classic: when a click on the window takes the game's focus, it says so. Click the game once to fly again",
      "Placing note: a second monitor is best. On one screen the top edge is the safest place"] },
    { v: "v0.75.2", k: "minor", d: "17 Oct 2026", t: [
      "Pop-out map: planets and stars show their pictures again. With a graphics card the site draws the bodies on a live 3D layer under the map, and the pop-out copy was hiding the pictures as if that layer were there"] },
    { v: "v0.75.1", k: "minor", d: "17 Oct 2026", t: [
      "Pop-out map: always shown now, at the top middle of the canopy. The first time it opens at the right size for your screen (any resolution) and the guide shows you where to drag it",
      "Planet and star pictures now show in the pop-out window too",
      "No tilt any more, so the map fills the whole window. When you and your target are far apart in a big system, it frames both",
      "A thank-you line in the pop-out window and under the credits"] },
    { v: "v0.75", k: "major", d: "17 Oct 2026", t: [
      "Pop-out map, second test: it is meant to sit in the canopy right above the game's left panel. The first time it opens at the right size for your screen and a live arrow guides you there (browsers let only you move such a window). Chrome remembers the place after that. \"⇱ Place\" shows the guide again",
      "It looks like part of the game's panel: orange HUD lines, a light orange tint and the panel's slight tilt",
      "By default the map shows only while the game's left panel (1) is open. With the panel closed the window stays plain dark (a browser window cannot hide itself)",
      "You are here and Target no longer cover each other: one tag when they point at the same place, the target below when they are close",
      "The Pop out button moved to the map's upper left, clear of the legend. Planet pictures are now made even while the GRAVITAS tab is behind the game"] },
    { v: "v0.74", k: "major", d: "17 Oct 2026", t: [
      "New, first test: the pop-out map. \"⧉ Pop out · always on top\" in the system map's lower left opens a small window that stays above the game (Chrome or Edge, Elite Dangerous in borderless window mode). Place it once over the game's left panel, it remembers where",
      "It wears the game's HUD colours, follows Sync with the game (jumps, You are here) and marks your ship's current target from the game in orange",
      "Click its top bar to choose: always shown, or only while the game's left panel (the 1 key) is open. The map itself never catches the pointer, so it does not take the game's focus"] },
    { v: "v0.73", k: "major", d: "17 Oct 2026", t: [
      "You are here tells a station from a body: docked at a station in orbit, a fleet carrier (squadron carriers too) or a megaship, the green tag sits on that station's own name in 3D, and on the system map it points at the station's icon instead of the planet",
      "A surface port is marked on its planet as \"Docked at … (on the surface)\", with the green pin at the port's spot when Spansh knows it",
      "Your station always shows, even when it is a construction site and Construction sites is switched off"] },
    { v: "v0.72.2", k: "minor", d: "17 Oct 2026", t: [
      "Graphics card watchdog: where the browser allows it, GRAVITAS measures how long your graphics card really spends on each 3D frame. If it is too long, background work stops at once and the 3D view uses fewer pixels. If it stays far too long, quality steps down one level by itself, so the card is never pushed into a reset",
      "Video memory guard: High and Ultra never draw more than a 4K screen's worth of pixels, and anti-aliasing is reduced until the drawing buffers fit in about 200 MB (on a sharp 1440p screen Ultra could ask for close to 1 GB before)",
      "Surfaces are generated in smaller pieces on every quality (at most 0.5 M pixels a frame, 0.26 M in one go)",
      "The 3D view changes sharpness only in three steps and rarely, because each change is itself a short hitch",
      "You are here in 3D: its name stays on screen even for a far moon at Reset view, and a new \"📍 Show me\" button in the Sync panel takes you there (on the map too)"] },
    { v: "v0.72.1", k: "minor", d: "17 Oct 2026", t: [
      "Zooming in is gentler on the graphics card: a large planet surface is started only once the zoom has settled, and it begins with small slices",
      "If the graphics card resets while drawing, GRAVITAS no longer freezes: it says so and reloads on Low",
      "If a visit stopped unexpectedly, the next one starts on Low and says so once. The Report window then includes what was on screen at that moment (system, view, nearest body, distance), which helps us find the cause"] },
    { v: "v0.72", k: "major", d: "17 Oct 2026", t: [
      "Smoother when you zoom in: if 3D frames get slower than about 45 a second, the 3D view is drawn with fewer pixels until there is room again. Panels and text stay sharp. It never goes below half the chosen sharpness",
      "Low: lighter planets up close (a single-sample ring shadow, 4 steps through the air instead of 10). Eclipses and shadows stay exact",
      "The system map opens faster: on Low its planet pictures come from the ready textures, all pictures are made in batches of sixteen, and the browser encodes them in the background",
      "The first switch to 3D for a system gets its shaders ready in the background, with a small \"Preparing the 3D orrery\" card if that takes more than a moment",
      "You are here now follows stations, fleet carriers (squadron carriers too) and megaships: docked at one, it marks the body it belongs to and names it",
      "Landed, in the SRV or on foot: GRAVITAS reads the game's Status.json (only latitude, longitude and what you are in) and puts a green pin at your live position on the planet in 3D"] },
    { v: "v0.71", k: "major", d: "17 Oct 2026", t: [
      "GRAVITAS now opens on the system map, the lightest view. SYSTEM MAP is the first option in VIEW. The 3D orrery opens in Overview, with a small hint the first few times that True scale is one click away",
      "Much less work for your computer in 3D: a planet that is a few pixels wide is now drawn with a few hundred triangles instead of 36,000. In a busy system one frame went from about 2.6 million triangles to about 0.2 million",
      "The gravity well grid is lighter on Low and Medium (fewer lines, same wells). Without a graphics card it starts off and can be turned on in View",
      "Low: stars keep a still, lighter surface without flares, Overview belts use fewer rocks, and planets use ready pictures (about 190 KB in all, made by GRAVITAS's own surface generator) instead of generating surfaces on your graphics card. Medium and up still generate every surface from its seed",
      "Quieter when nothing moves: 15 frames a second at normal speed, 4 while paused, and 3 while the game (or any other window) is in front",
      "Sync with the game: a green \"You are here\" marks the body or station you are at, on the system map and in 3D, and a chip by the system name shows it is your system"] },
    { v: "v0.70", k: "major", d: "17 Oct 2026", t: [
      "New: Sync with the game (Chrome and Edge on a computer). Turn it on in the panel above the GRAVITAS panel and choose your Journal folder once. When you jump in Elite Dangerous, GRAVITAS jumps with you",
      "While you jump, GRAVITAS already asks Spansh for the next system, so the map is ready when you drop out. Approaching a body, landing or docking selects that body",
      "Looking at another system? You get a note with a Go button instead. Auto-jump can be turned off, and a system Spansh does not know yet is tried again for ten minutes",
      "Your journal files are read in your own browser. They are never uploaded or stored. Only the system's name is sent, the same as a search",
      "GRAVITAS now opens light on every computer and browser. Quality starts on Auto: it begins at Low and steps up to Medium only when your computer stays smooth. High and Ultra are always your own choice in View",
      "No more freezes on laptop graphics: heavy background work (planet surfaces, the Milky Way) is cut into small slices that shrink at once when frames slow down, and the first seconds after opening are kept free of it",
      "At most 60 frames a second. When nothing moves on screen GRAVITAS draws 30 a second, or 10 while paused, so a quiet tab barely uses your graphics card",
      "Low is truly light: smaller surfaces, no Milky Way, no glow, no live map. On Low and Medium the panels are solid instead of blurred",
      "For the sharpest 3D, use Chrome or Edge with hardware acceleration on. GRAVITAS tells you once if it had to lower the quality, and it never blocks the page"] },
    { v: "v0.64.2", k: "minor", d: "17 Oct 2026", t: [
      "Rings keep their own colour when hovered or selected: hover draws thin white edges, selection pink edges and a soft pink tint, on the map and in 3D, so hover and selection are easy to tell apart",
      "System map: no more thin seam line across the rings, no heavy dark line between two rings, and hovering a ring no longer lights up the planet's circle too"] },
    { v: "v0.64.1", k: "minor", d: "17 Oct 2026", t: [
      "Each ring of a planet is now its own band on the system map, coloured by its type, so two-tone rings read at a glance",
      "Hover and selection work ring by ring, on the map and in 3D: the ring under the pointer lights up, a click selects just that ring and its panel shows all the planet's rings with the chosen one marked"] },
    { v: "v0.64", k: "major", d: "17 Oct 2026", t: [
      "Planetary rings can be selected like a body, on the system map and in 3D (Overview and True scale): hover for a tooltip with each ring's type and edges, click for a panel with type, edges, width and mass from Spansh",
      "A selected ring turns pink with bright edges, a hovered one lights up, and a click on empty space lets go and closes the panel. Double-click a ring on the map to fly to its planet"] },
    { v: "v0.63.5", k: "minor", d: "17 Oct 2026", t: [
      "Among a belt's rocks, flying with WASD no longer makes rocks suddenly turn: each rock keeps its own shape, turn and tumble as the field around you is refreshed",
      "Ringed planets: the rings' shadow on the planet is now soft and banded, without the fine stripes (moiré) that showed on some giants"] },
    { v: "v0.63.4", k: "minor", d: "17 Oct 2026", t: [
      "A click on empty space now lets go of a selected belt too, on the map and in 3D, and closes its panel",
      "System map: opening or closing the body panel no longer makes the map zoom back and forth. Only a change of the window size refits the whole system"] },
    { v: "v0.63.3", k: "minor", d: "17 Oct 2026", t: [
      "System map: zooming in on several big bodies no longer makes some of them go dark, and panning no longer flickers. Sharper surfaces are made one at a time, and a body on screen keeps its surface"] },
    { v: "v0.63.2", k: "minor", d: "17 Oct 2026", t: [
      "System map: zoomed far in, the star keeps its flares and its whole disc stays evenly lit (before, the flares vanished and one side went flat)"] },
    { v: "v0.63.1", k: "minor", d: "17 Oct 2026", t: [
      "System map: the names from the 3D view no longer stay on screen after switching to the map",
      "System map: bodies keep turning after the map redraws (before, they sometimes stopped until you switched views)",
      "System map: bodies under a very thick atmosphere show their banded cloud deck instead of a plain disc"] },
    { v: "v0.63", k: "major", d: "17 Oct 2026", t: [
      "A living system map: bodies and stars are drawn with the same surfaces and the same star as the 3D view, and every body turns at its real rotation period on the app's clock. Play faster to see which spin fast and which slow. The flares on the star move too. Low quality keeps still pictures",
      "Asteroid belts in True scale stay true: at a distance, two dashed edge lines and a faint band show where the belt is, like an orbit line. Fly in and the guides fade while real-sized rocks (tens of metres to a few km) appear around you, with fainter ones farther out. This now also works in belts far from their star, like Sol's",
      "In the Overview, belt rocks now lie on the gravity well like the orbits, stay smaller than the planets, and get denser with the belt's mass (from Spansh)",
      "Metal belts are dark grey with glints, as in the game",
      "A belt is now selected on its own, like a body: its own panel with its edges, width and mass, a hover ring and selection colour on the system map, its row in the Bodies list and its name in 3D. Share links can open a belt",
      "Belt names are short now (\"A Belt\", not the full system name)"] },
    { v: "v0.62", k: "major", d: "17 Oct 2026", t: [
      "One picture everywhere: Overview, True scale and the system map now use the same light, the same stars and the same surfaces. Only the sizes and distances differ",
      "The system map draws each star with the same surface as in 3D",
      "Stations on a surface now stand on the ground. Before, they floated above it",
      "The boiling of star surfaces and their flares follow the clock: pause stops them, playing backwards runs them backwards, and fast playback only makes them a little faster",
      "Asteroid belts around stars are drawn as rocks from seven different models, like the game's belt view. In True scale the rocks have their real size, so you see them only up close: double-click the belt's name to fly in among them",
      "A belt can be selected like a body: its name in 3D, a row in the Bodies list and the belt on the system map show its details, and a click opens it in the panel",
      "The grid-like ring around the star in the Overview is gone"] },
    { v: "v0.61", k: "major", d: "16 Oct 2026", t: [
      "Overview | True scale now has its own small panel to the right of the filters. Your choice is remembered in this browser, and Overview is the default",
      "True scale keeps everything: stations, megaships and fleet carriers stay beside their body, and stations on a surface keep their model. They are drawn enlarged, because at real size they would be invisible, and their spot is not in the data",
      "The system map now shows each body with the same surface as the 3D view",
      "Icy bodies are white unless their colour was checked in the game. Which icy bodies are red is not in the data, so we no longer guess. Bodies checked against in-game screenshots get their real colour, and the panel says so",
      "Stars have a boiling surface with hot bright patches, and prominences and flares rise from their edge",
      "Asteroid belts: scattered rocks in True scale, and a band with spokes in the Overview, as in the game's orrery. The old flat disc is gone",
      "New in View: \"Bodies sit in the wells\". Switch it off to keep every body and orbit on one flat plane, so only the grid shows the wells. Thanks to the Canonn commanders",
      "The date box reads a year like 2026 as a real-world date and moves to game time 3312",
      "Collisions: \"older data\" now says how old the orbit data is, and \"happening now\" follows the clock within seconds",
      "Checked in the game: Saturn and Uranus in Sol stand where GRAVITAS puts them"] },
    { v: "v0.60", k: "major", d: "16 Oct 2026", t: [
      "A new look for the 3D orrery. True scale now uses realistic light: a filmic tone curve, soft day and night lines, glints on oceans and darker edges on gas giants",
      "Every body gets its own surface, made on your graphics card from its data and its id, so it always looks the same: craters, ridges, ice cracks, lava, oceans, continents and clouds. Up to 4096 px on Ultra (Low 512, Medium 1024, High 2048)",
      "Gas giant colours now follow the game's own cloud layer model, as worked out by the EDGGG team. Class, temperature and density set the colours of its 7 layers. A layer that lands exactly on a band edge stays green, as in the game. Checked on in-game screenshots of every class",
      "Atmospheres scatter light: a thin halo on thin air, a soft veil on thick ones. As in the game, very thick atmospheres hide the surface and ammonia worlds still show theirs",
      "Rings are lit from the right side, show the planet's shadow and glow softly when the star is behind them",
      "Stars glow, with darker edges and moving granules",
      "The Milky Way in the background, drawn from where the system really is in the galaxy, with its dust lanes and the bright core. Its direction is calibrated from in-game screenshots taken on moon 9 a in Col 285 Sector VR-E b27-1, so it is approximate. Switch it off in View",
      "Surface details stay illustrative and the panel says so. Positions, sizes, light and shadows come from the data as before"] },
    { v: "v0.58.1", k: "minor", d: "16 Oct 2026", t: ["The list of bodies passing through each other no longer shrinks after Watch. It always starts from the moment the system was opened. Found by CMDR Hongark"] },
    { v: "v0.58", k: "major", d: "16 Oct 2026", t: [
      "New in the System panel: bodies passing through each other in the next 90 days. In the game, bodies whose orbits cross pass right through each other, and commanders go to watch",
      "When several bodies meet at once, they share one row, with the window when all of them touch",
      "Watch jumps to a minute before, plays at 1 min/s and shows the bodies at their true size",
      "Times use true positions and radii from the Spansh orbit data. They are not yet checked against the game. Thanks to CMDR LCU No Fool Like One for the systems to test"] },
    { v: "v0.57", k: "major", d: "16 Oct 2026", t: [
      "True scale for the 3D orrery: real sizes and real distances, as in space. The switch is at the right of the filters, and in View",
      "In True scale the bodies are not enlarged, so Body size is switched off there. Stations and carriers are hidden, because their exact spot is not in the data",
      "Leaving the surface view brings you back to the scale you were in. Thanks to CMDR DaftMav and the Canonn commanders"] },
    { v: "v0.56", k: "minor", d: "16 Oct 2026", t: [
      "When the system's data was last updated now stays in view under its name, with how long ago. Idea from CMDR Cyanidex",
      "The search box shows your recent systems. They are kept only in this browser, and one click clears them",
      "Rings are calmer: less glow, and the fine bands no longer shimmer from far away. Thanks to CMDR DaftMav"] },
    { v: "v0.55", k: "major", d: "11 Oct 2026", t: [
      "Stations on a surface now stand on their body in 3D too, at the latitude and longitude Spansh gives. Which way a body faces right now is not in the data, so the spot turns with an illustrative spin, and the tooltip says so",
      "The filters now work over the 3D orrery as well. Matches get a soft pulsing ring that can be seen from anywhere, the rest fades back. What you choose is kept when you switch views",
      "Hover a body in 3D, or its name, for the same details as on the system map. Stations and carriers have tooltips too",
      "A switch under the search box skips the jump animation, and is remembered",
      "Stronger atmosphere haze on the system map. New construction site icons",
      "The Tutorial bar and the Report, FPS and View buttons now stand exactly as tall as the time panel"] },
    { v: "v0.54", k: "major", d: "11 Oct 2026", t: [
      "On the system map, stations on a surface now stand on their body's edge. Only stations in orbit and fleet carriers hang off a body on a line",
      "Construction sites are hidden unless you switch them on, at the right end of the filters. The switch hides them in 3D too",
      "Bodies with an atmosphere show a haze in its colour, the same colours as in 3D",
      "Eclipses are shown by a small badge with the time: when the next one starts, or how long the shadow lasts. The dashed ring that looked like an atmosphere is gone",
      "Reset view works on the system map too",
      "The VIEW switch is wider, with both views side by side. The Tutorial button is a slim bar above Report, FPS and View",
      "In 3D, a click on empty space closes the body panel, as on the map",
      "Loading a system by dropping a file was removed. Moving the map could set it off by mistake"] },
    { v: "v0.53", k: "major", d: "11 Oct 2026", t: [
      "The system map is now one picture laid out like the game's: each star with its planets on a line, moons hanging below, a moon's own moons and every station branching to the right, one line down the left joining the stars",
      "Drag to move the map, scroll or pinch to zoom, and fit it back with one button. Names can be hidden",
      "Hover a body for its details: landable, atmosphere, stations, biological and geological signals, distance and light right now. Hover an icon for the station",
      "Stations filter: choose in orbit, on the surface or a large landing pad",
      "Clicking a body opens its panel at once. Clicking empty space closes it and the map slides wider",
      "Phones held sideways get their own layout instead of overlapping panels",
      "The VIEW button, the Tutorial button and the time panel are equally tall again"] },
    { v: "v0.52", k: "major", d: "11 Oct 2026", t: [
      "Stations in orbit: Coriolis, Orbis, Ocellus, Dodec, outposts, asteroid bases, megaships and construction sites, each matched to the body it was reported at, with a simple 3D model beside it",
      "The system map shows stations, settlements and fleet carriers as small icons under each body. Hover an icon for its name. New Carriers filter",
      "The System panel lists the stations in orbit. A body's Signals tab lists its stations in orbit and on the surface",
      "An open System panel now pushes the system map to the side instead of squeezing it from the top",
      "The VIEW and Tutorial buttons are as tall as the time panel beside them",
      "New tagline: every orbit, every shadow, every eclipse"] },
    { v: "v0.51", k: "minor", d: "11 Oct 2026", t: [
      "The system map now draws the game's lines: one line through each star and its planets, the moons hanging below their planet, and brackets over bodies that circle each other, nested as in the game",
      "Each star's row names its star",
      "The VIEW switch shows both views at once. The one you are in is lit, the other is faded, and a frame slides between them",
      "The Tutorial button is smaller and sits level with the buttons next to it"] },
    { v: "v0.50", k: "major", d: "11 Oct 2026", t: [
      "New system map: every star with its planets in orbit order and the moons below, like the game's System Map. Asked for by our squadron, TRGE",
      "On the map, live: which bodies are in shadow now, when the shadow ends, and when the next eclipse starts. Buttons highlight landable bodies, signals, rings, stations and eclipses within a day",
      "The big VIEW button switches between the 3D orrery and the system map. Flat orbits moved into the View panel",
      "Search suggestions are much faster and are kept for a day. Large systems load with far less work on the server, and stay in the cache for an hour",
      "A clear message if the site ever reaches its host's free daily limit",
      "Strong graphics cards start at High quality. Without a graphics card the system map opens first",
      "The tutorial shows the system map and no longer stops if one frame fails"] },
    { v: "v0.49.4", k: "minor", d: "10 Oct 2026", t: ["The browser now runs only GRAVITAS's own code and the 3D library. This blocks a visitor-counting script that Cloudflare added by itself", "Privacy tab updated"] },
    { v: "v0.49.3", k: "major", d: "10 Oct 2026", t: ["The sky seen from a surface was the mirror image of the game. Found from moon 9 a and fixed", "Distances and eclipse times do not change", "How it works and Accuracy explain the finding"] },
    { v: "v0.49.2", k: "minor", d: "10 Oct 2026", t: ["A page opened during an update could stay without its styles. Fixed"] },
    { v: "v0.49.1", k: "minor", d: "10 Oct 2026", t: ["New Privacy tab: what GRAVITAS keeps, what it sends and to whom", "three.js is credited in the CMDR Hongark tab", "Requests to Spansh now name the site, so Spansh knows who to contact"] },
    { v: "v0.49", k: "minor", d: "10 Oct 2026", t: ["Typing in a text box no longer moves the map. Thanks to the first live report"] },
    { v: "v0.48", k: "minor", d: "10 Oct 2026", t: ["Online at its own address, hosted on Cloudflare", "GRAVITAS is free and without ads, now and later. The CMDR Hongark tab explains the plan for the first year"] },
    { v: "v0.47", k: "minor", d: "10 Oct 2026", t: ["How it works checked line by line against Curtis, Meeus and Gallardo. Every formula matched. References now give chapter and equation numbers",
      "The textbook rotation formula is shown first. The sign difference in Elite Dangerous is now stated openly, with how we found it",
      "New paragraphs on barycentres, on fixed two-body orbits, and on limb darkening in the starlight percentage",
      "Figure 2 shows the direction of motion"] },
    { v: "v0.46", k: "major", d: "10 Oct 2026", t: ["Public beta. Tested on 22 very different systems, from Sol and Colonia to Maia, Jackson's Lighthouse and Sagittarius A*",
      "Report a problem: describe what you saw, add in-game screenshots, and the report goes straight to the developers with a link to your exact view",
      "FPS counter next to the View button",
      "If the browser is not using the graphics card, quality drops to Low and a note explains how to turn hardware acceleration on",
      "Surface view: asteroid belts are hidden unless you switch them on, because the game shows them clearly only up close"] },
    { v: "v0.45", k: "minor", d: "3 Oct 2026", t: ["Moon pairs: orbit lines of two moons that circle each other now sit with their moons on the overview map, instead of floating above it",
      "Eclipse calendar shows the selected body's own family: a planet with its moons, a moon with its planet and sister moons, a star with its planets. A button shows every body",
      "Starlight readout names the body in front of a star when the star is partly covered"] },
    { v: "v0.44", k: "major", d: "3 Oct 2026", t: ["Axial tilt rule corrected after two new tests in the game. Planet 3 seen from moon 3 a showed the old rule was wrong for a barycentre inside another barycentre. The eclipse of moon 9 a by planet 9 confirmed the new rule within 2 minutes",
      "Surface view: a Default button puts height, spot and field of view back",
      "Shorter, simpler sentences across the site. Wide text is justified"] },
    { v: "v0.43", k: "minor", d: "3 Oct 2026", t: ["How it works: redrawn figures, references as superscripts and checked again, no more scroll bars around equations", "Each release is marked major or minor", "The Feedback tab is simply 'Feedback'"] },
    { v: "v0.42", k: "minor", d: "3 Oct 2026", t: ["'How it works' now explains the orbit and eclipse equations like a textbook, with figures and references", "Contact and Feedback merged into one tab", "Tutorial: the surface-view card waits until you have landed"] },
    { v: "v0.41", k: "minor", d: "3 Oct 2026", t: ["View from the surface now lands: the camera descends from orbit to the ground and levels out to the sky, and climbs back to orbit when you exit"] },
    { v: "v0.40", k: "major", d: "3 Oct 2026", t: ["Guided tour: the new Tutorial button warps you to the reference system and walks you through the map step by step"] },
    { v: "v0.39", k: "minor", d: "3 Oct 2026", t: ["'What's new' became 'About GRAVITAS', with new CMDR Hongark, Contact and Feedback tabs", "Fleet carrier models drawn at a quarter of their former size", "The site is now built from separate source parts into compact files, with search-engine information in the page"] },
    { v: "v0.38", k: "major", d: "3 Oct 2026", t: ["Axial tilt now leans the way the game shows: found from the rings of planets 7 and 8 and the eclipse of moon 2 a, and re-checked against every earlier test",
      "Eclipse calendar times are exact to the minute and no longer jump as the clock runs. An eclipse that passes midnight shows its end date. Your local time is shown too",
      "New 'How it works' tab: where the data comes from, the equations in plain words, and how we test against the game"] },
    { v: "v0.37", k: "minor", d: "2 Oct 2026", t: ["Eclipse labels give both moments: when the star's edge first reappears and when it is fully clear. During the partial phase the label shows the starlight percentage"] },
    { v: "v0.36", k: "minor", d: "2 Oct 2026", t: ["Rings seen almost exactly edge-on fade out with their real on-screen thickness (seen from moon 2 a, the rings of planet 2 vanish, as in the game)", "The unlit face of a ring is drawn darker", "Shadow guide lines are hidden in the surface view"] },
    { v: "v0.35", k: "minor", d: "2 Oct 2026", t: ["A body in shadow now says when the shadow ends (game time, UTC). The first prediction, for moon 2 a, was checked in the game"] },
    { v: "v0.34", k: "minor", d: "2 Oct 2026", t: ["This window: what's new, what's planned, and how accurate the map is",
      "Your view settings, sound on/off and volume are remembered in this browser. A button puts the view settings back to defaults",
      "Sound starts at half volume",
      "Search only opens a system whose name matches exactly. Anything else gets a list of suggestions instead of a jump"] },
    { v: "v0.33", k: "minor", d: "2 Oct 2026", t: ["Opens live: the clock follows real game time until you choose another speed or moment",
      "Surface view: a 'Your spot' slider, so the tilt of a ring or crescent can be matched to what you see in the game"] },
    { v: "v0.32", k: "minor", d: "2 Oct 2026", t: ["View menu checked option by option: hidden fleet carriers no longer leave their names behind, hidden rings no longer cast shadows, the shadow switch turns off every shadow, the true-tilt guide lines follow the grid switch"] },
    { v: "v0.31", k: "major", d: "2 Oct 2026", t: ["Surface view at true scale: stand on a body and look at the sky with real sizes and distances",
      "Fleet carriers from Spansh, with the body they were last reported at and when",
      "Rings seen edge-on show as a thin line, as in the game",
      "Clear notes on what is illustrative (surface patterns, spin angle) and what comes from the data"] },
    { v: "v0.30", k: "minor", d: "2 Oct 2026", t: ["Rings and spin axes point the way they do in the game (checked from the surface of a moon)", "A planet and its moons are drawn as one rigid system"] },
    { v: "v0.28 – v0.29", k: "major", d: "2 Oct 2026", t: ["True tilt view: real 3D directions of orbits. It is now the default", "In true tilt, light and shadows come from the star's real direction"] },
    { v: "v0.26 – v0.27", k: "major", d: "2 Oct 2026", t: ["Orbit positions checked against the game: distances in the navigation panel and angles in the system map orrery", "A built-in self-test repeats that check"] },
    { v: "v0.24 – v0.25", k: "minor", d: "2 Oct 2026", t: ["New spacing so bodies and rings never overlap. Overlapping labels make way for each other", "Materials chart with chemical symbols"] },
    { v: "v0.21 – v0.23", k: "minor", d: "2 Oct 2026", t: ["Phone layout", "Warp jump with countdown voice and sound effects when you search a system", "Built-in self-test page"] },
    { v: "v0.16 – v0.20", k: "minor", d: "1 – 2 Oct 2026", t: ["Powers, factions and system politics", "Share links (system, body, tab and moment)", "Graphics quality presets", "Space ambience sound"] },
    { v: "v0.09 – v0.15", k: "major", d: "1 Oct 2026", t: ["Body panel with charts: orbit, sky, signals, rings, habitable zone", "Eclipses and starlight, sky panorama and eclipse calendar", "Gravitational lensing around black holes"] },
    { v: "v0.03 – v0.08", k: "major", d: "1 Oct 2026", t: ["First prototype: a gravity-well map of any system, built live from Spansh data, with a game-time clock"] },
  ] },
];
const PLANS = [
  { q: "2026 Q4", items: ["Tell apart the two tilt rules that both fit our tests so far, using planets in other systems", "More checks against the game: a system with two stars, moon pairs, and the sun's position seen from a surface",
    "Find out whether rings cast shadows on their moons in the game, and show it only if so",
    "Time both ends of one eclipse on moon 9 a, to explain why the map was a few minutes late there"] },
  { q: "2027 Q1", items: ["Version 1.0: polish, speed and accessibility", "Agree data use with Spansh and follow Frontier's fan-site terms"] },
  { q: "Always", items: ["Free and without ads. No payment is asked for now. After the first year, if GRAVITAS proves useful, a small support page may open to cover running costs"] },
  { q: "Later", items: ["A map of the systems around the one you are looking at", "Upload your game journal straight into GRAVITAS to compare the map with what you saw", "Version 2: optional sign-in and an API for other tools (the site keeps working without an account)"] },
];
function howHtml() {
  return `<p class="note">GRAVITAS is built by CMDR Hongark and Claude, an AI assistant made by Anthropic. This tab explains what the map computes, where the numbers come from, and how we check them against the game.</p>
  <div class="q">WHY</div><p>To see a system as it is right now, before you fly there. Where every planet and moon is. What lights what. When a moon falls into shadow. For any system, for free. And to show it honestly: anything the data cannot tell is labelled as such.</p>
  <div class="q">1 · THE DATA</div><p>Every system is loaded live from <b>Spansh</b><sup class="cite">6</sup>, which collects what players' tools (such as EDMC) send to the EDDN network when they scan. For each body it gives the orbit: size <i>a</i>, shape <i>e</i>, tilt <i>i</i>, the angles Ω and ω, the period <i>P</i>, the position along the orbit (mean anomaly <i>M₀</i>) and the moment it was measured. It also gives radius, axial tilt and rings. Nothing on the map is invented. Where data is missing, the map says so.</p>
  <div class="q">2 · WHERE IS A BODY NOW?</div>
  <p>Every orbit is an ellipse with its parent at one focus (Kepler's first law), and a body sweeps out equal areas in equal times (Kepler's second law)<sup class="cite">1</sup>: fast near periapsis, slow far away. Figure 1 shows the quantities that describe one orbit.</p>
  <p>The parent is not always a star or a planet. Two bodies pull on each other, so both move around their common centre of mass, the barycentre<sup class="cite">3,8</sup>. When the two have similar masses, as in a double planet or a pair of stars, both clearly circle that point. Spansh lists these barycentres with orbits of their own. GRAVITAS nests the orbits: a moon around its planet, the planet around its barycentre, the barycentre around its star.</p>
  <figure class="fig"><svg viewBox="0 0 460 345" width="100%" style="max-width:600px" role="img" aria-label="Orbit geometry"><circle cx="230" cy="175" r="160" fill="none" stroke="var(--dim)" stroke-dasharray="3 4" opacity=".55"/><ellipse cx="230" cy="175" rx="160" ry="128.0" fill="none" stroke="var(--cyan)" stroke-width="1.6"/><line x1="70" y1="175" x2="390" y2="175" stroke="var(--dim)" opacity=".7"/><line x1="230" y1="175" x2="230" y2="303.0" stroke="var(--dim)" opacity=".7"/><line x1="230" y1="175" x2="305.1" y2="33.7" stroke="var(--dim)" stroke-dasharray="2 3"/><line x1="305.1" y1="33.7" x2="305.1" y2="62.0" stroke="var(--dim)" stroke-dasharray="2 3"/><line x1="326.0" y1="175" x2="305.1" y2="62.0" stroke="var(--accent)" stroke-width="1.6"/><path d="M352.0,175.0 L351.9,172.7 L351.6,170.5 L351.1,168.2 L350.4,166.1 L349.5,164.0 L348.5,161.9 L347.3,160.0 L345.9,158.2 L344.3,156.5 L342.6,155.0 L340.8,153.6 L338.9,152.4 L336.9,151.4 L334.8,150.5 L332.6,149.8 L330.3,149.4 L328.1,149.1 L325.8,149.0 L323.5,149.1 L321.3,149.4" fill="none" stroke="var(--accent)"/><path d="M266.0,175.0 L265.9,173.1 L265.8,171.1 L265.5,169.2 L265.2,167.3 L264.7,165.4 L264.1,163.5 L263.4,161.7 L262.7,159.9 L261.8,158.2 L260.9,156.5 L259.8,154.8 L258.7,153.2 L257.5,151.7 L256.2,150.3 L254.8,148.9 L253.3,147.6 L251.8,146.4 L250.2,145.2 L248.6,144.2 L246.9,143.2" fill="none" stroke="var(--dim)"/><circle cx="326.0" cy="175" r="8" fill="#ffd27a"/><circle cx="305.1" cy="62.0" r="5.5" fill="var(--accent)"/><circle cx="230" cy="175" r="2.5" fill="var(--dim)"/><circle cx="305.1" cy="33.7" r="2.5" fill="var(--dim)"/><text x="351.6" y="148.3" fill="var(--accent)" text-anchor="middle" font-size="14" font-style="italic">ν</text><text x="272.9" y="153.2" fill="var(--dim)" text-anchor="middle" font-size="14" font-style="italic">E</text><text x="324.6" y="118.5" fill="var(--accent)" text-anchor="start" font-size="14" font-style="italic">r</text><text x="150.0" y="168.0" fill="var(--cyan)" text-anchor="middle" font-size="14" font-style="italic">a</text><text x="238.0" y="243.0" fill="var(--cyan)" text-anchor="start" font-size="14" font-style="italic">b</text><text x="326.0" y="201.0" fill="currentColor" text-anchor="middle" font-size="12">star (focus)</text><text x="315.1" y="56.0" fill="currentColor" text-anchor="start" font-size="12">body</text><text x="398.0" y="179.0" fill="var(--dim)" text-anchor="start" font-size="12">periapsis</text><text x="62.0" y="179.0" fill="var(--dim)" text-anchor="end" font-size="12">apoapsis</text><text x="224.0" y="191.0" fill="var(--dim)" text-anchor="end" font-size="11">centre</text></svg>
  <figcaption>Figure 1 · An orbit: semi-major axis <i>a</i>, semi-minor axis <i>b</i> = <i>a</i>√(1 − <i>e</i>²), distance <i>r</i>, true anomaly ν and eccentric anomaly <i>E</i>. The dashed circle of radius <i>a</i> is the auxiliary circle on which <i>E</i> is measured<sup class="cite">4</sup>. The true anomaly is written <i>v</i> in [4], θ in [5] and <i>f</i> in [3].</figcaption></figure>
  <p>Spansh gives the mean anomaly <i>M</i>₀ at a measured moment <i>t</i>₀. Because the mean anomaly grows evenly with time, its value now is</p>
  <math display="block"><mi>M</mi><mo>=</mo><msub><mi>M</mi><mn>0</mn></msub><mo>+</mo><mfrac><mrow><mn>2</mn><mi>π</mi></mrow><mi>P</mi></mfrac><mo>(</mo><mi>t</mi><mo>−</mo><msub><mi>t</mi><mn>0</mn></msub><mo>)</mo></math>
  <p>where <i>P</i> is the orbital period (by Kepler's third law<sup class="cite">2,8</sup>, <i>P</i>² ∝ <i>a</i>³, but the data gives <i>P</i> directly). The eccentric anomaly <i>E</i> follows from Kepler's equation<sup class="cite">3–5</sup></p>
  <math display="block"><mi>M</mi><mo>=</mo><mi>E</mi><mo>−</mo><mi>e</mi><mspace width=".2em"/><mi>sin</mi><mspace width=".15em"/><mi>E</mi></math>
  <p>This equation has no closed solution. The map solves it with Newton's method<sup class="cite">4,5</sup>, repeating</p>
  <math display="block"><msub><mi>E</mi><mrow><mi>k</mi><mo>+</mo><mn>1</mn></mrow></msub><mo>=</mo><msub><mi>E</mi><mi>k</mi></msub><mo>−</mo><mfrac><mrow><msub><mi>E</mi><mi>k</mi></msub><mo>−</mo><mi>e</mi><mspace width=".15em"/><mi>sin</mi><mspace width=".1em"/><msub><mi>E</mi><mi>k</mi></msub><mo>−</mo><mi>M</mi></mrow><mrow><mn>1</mn><mo>−</mo><mi>e</mi><mspace width=".15em"/><mi>cos</mi><mspace width=".1em"/><msub><mi>E</mi><mi>k</mi></msub></mrow></mfrac></math>
  <p>until it stops changing. Distance and true anomaly then follow<sup class="cite">4</sup>:</p>
  <math display="block"><mi>r</mi><mo>=</mo><mi>a</mi><mo>(</mo><mn>1</mn><mo>−</mo><mi>e</mi><mspace width=".15em"/><mi>cos</mi><mspace width=".1em"/><mi>E</mi><mo>)</mo><mspace width="2em"/><mi>tan</mi><mfrac><mi>ν</mi><mn>2</mn></mfrac><mo>=</mo><msqrt><mfrac><mrow><mn>1</mn><mo>+</mo><mi>e</mi></mrow><mrow><mn>1</mn><mo>−</mo><mi>e</mi></mrow></mfrac></msqrt><mspace width=".2em"/><mi>tan</mi><mfrac><mi>E</mi><mn>2</mn></mfrac></math>
  <p>Finally the flat ellipse is turned into space by three angles (Figure 2): the ascending node Ω, the inclination <i>i</i> and the argument of periapsis ω. In the textbook form<sup class="cite">3,5</sup></p>
  <math display="block"><mover><mi>r</mi><mo>→</mo></mover><mo>=</mo><msub><mi>R</mi><mi>z</mi></msub><mo>(</mo><mi>Ω</mi><mo>)</mo><mspace width=".15em"/><msub><mi>R</mi><mi>x</mi></msub><mo>(</mo><mi>i</mi><mo>)</mo><mspace width=".15em"/><msub><mi>R</mi><mi>z</mi></msub><mo>(</mo><mi>ω</mi><mo>)</mo><mo>(</mo><mi>r</mi><mspace width=".1em"/><mi>cos</mi><mi>ν</mi><mo>,</mo><mspace width=".2em"/><mi>r</mi><mspace width=".1em"/><mi>sin</mi><mi>ν</mi><mo>,</mo><mspace width=".2em"/><mn>0</mn><mo>)</mo></math>
  <figure class="fig"><svg viewBox="0 0 640 335" width="100%" style="max-width:680px" role="img" aria-label="Orbit orientation"><path d="M480.1,197.9 L482.7,193.4 L484.8,188.8 L486.3,184.2 L487.2,179.6 L487.5,175.0 L487.2,170.4 L486.3,165.8 L484.8,161.2 L482.7,156.6 L480.1,152.1 L476.9,147.7 L473.1,143.3 L468.7,139.0 L463.8,134.8 L458.4,130.8 L452.4,126.8 L446.0,123.0 L439.0,119.3 L431.6,115.8 L423.8,112.4 L415.5,109.3 L406.9,106.2 L397.8,103.4 L388.5,100.8 L378.8,98.4 L368.7,96.2 L358.5,94.2 L347.9,92.4 L337.2,90.9 L326.3,89.5 L315.2,88.5 L304.0,87.6 L292.7,87.0 L281.4,86.7 L270.0,86.5 L258.6,86.7 L247.3,87.0 L236.0,87.6 L224.8,88.5 L213.7,89.5 L202.8,90.9 L192.1,92.4 L181.5,94.2 L171.3,96.2 L161.2,98.4 L151.5,100.8 L142.2,103.4 L133.1,106.2 L124.5,109.3 L116.2,112.4 L108.4,115.8 L101.0,119.3 L94.0,123.0 L87.6,126.8 L81.6,130.8 L76.2,134.8 L71.3,139.0 L66.9,143.3 L63.1,147.7 L59.9,152.1 L57.3,156.6 L55.2,161.2 L53.7,165.8 L52.8,170.4 L52.5,175.0 L52.8,179.6 L53.7,184.2 L55.2,188.8 L57.3,193.4 L59.9,197.9 L63.1,202.3 L66.9,206.7 L71.3,211.0 L76.2,215.2 L81.6,219.2 L87.6,223.2 L94.0,227.0 L101.0,230.7 L108.4,234.2 L116.2,237.6 L124.5,240.7 L133.1,243.8 L142.2,246.6 L151.5,249.2 L161.3,251.6 L171.3,253.8 L181.5,255.8 L192.1,257.6 L202.8,259.1 L213.7,260.5 L224.8,261.5 L236.0,262.4 L247.3,263.0 L258.6,263.3 L270.0,263.5 L281.4,263.3 L292.7,263.0 L304.0,262.4 L315.2,261.5 L326.3,260.5 L337.2,259.1 L347.9,257.6 L358.5,255.8 L368.7,253.8 L378.7,251.6 L388.5,249.2 L397.8,246.6 L406.9,243.8 L415.5,240.7 L423.8,237.6 L431.6,234.2 L439.0,230.7 L446.0,227.0 L452.4,223.2 L458.4,219.2 L463.8,215.2 L468.7,211.0 L473.1,206.7 L476.9,202.3 L480.1,197.9" fill="rgba(160,140,220,.06)" stroke="var(--dim)" stroke-dasharray="4 4"/><path d="M239.9,78.6 L237.4,78.6 L235.0,78.6 L232.5,78.8 L230.1,78.9 L227.7,79.1 L225.2,79.4 L222.9,79.7 L220.5,80.1 L218.2,80.6 L215.9,81.0 L213.6,81.6 L211.3,82.2 L209.1,82.8 L206.8,83.5 L204.7,84.3 L202.5,85.1 L200.4,85.9 L198.3,86.9 L196.2,87.8 L194.1,88.8 L192.1,89.9 L190.2,91.1 L188.2,92.2 L186.3,93.5 L184.4,94.8 L182.6,96.1 L180.8,97.5 L179.0,99.0 L177.3,100.5 L175.6,102.1 L174.0,103.7 L172.4,105.4 L170.8,107.1 L169.3,108.9 L167.9,110.7 L166.5,112.6 L165.1,114.6 L163.8,116.6 L162.5,118.7 L161.3,120.8 L160.2,123.0 L159.1,125.2 L158.0,127.5 L157.0,129.8 L156.1,132.2 L155.3,134.6 L154.5,137.1 L153.7,139.7 L153.1,142.3 L152.5,144.9 L151.9,147.6 L151.5,150.4 L151.1,153.2 L150.8,156.1 L150.5,159.0 L150.4,161.9 L150.3,164.9 L150.3,168.0 L150.3,171.0 L150.5,174.2 L150.8,177.3 L151.1,180.5 L151.5,183.8 L152.0,187.1 L152.6,190.4 L153.3,193.8 L154.1,197.2 L154.9,200.6 L155.9,204.0 L157.0,207.5 L158.2,211.0 L159.4,214.5 L160.8,218.0" fill="none" stroke="var(--cyan)" stroke-width="1.6" /><path d="M160.8,218.0 L162.3,221.6 L163.8,225.2 L165.5,228.7 L167.3,232.3 L169.1,235.9 L171.1,239.5 L173.2,243.1 L175.4,246.6 L177.7,250.2 L180.1,253.7 L182.6,257.3 L185.2,260.8 L187.9,264.3 L190.7,267.7 L193.5,271.1 L196.5,274.5 L199.6,277.8 L202.8,281.1 L206.1,284.3 L209.5,287.5 L212.9,290.6 L216.4,293.7 L220.1,296.6 L223.8,299.5 L227.5,302.3 L231.4,305.1 L235.3,307.7 L239.2,310.3 L243.3,312.7 L247.4,315.0 L251.5,317.3 L255.7,319.4 L259.9,321.4 L264.1,323.3 L268.4,325.1 L272.7,326.7 L277.1,328.2 L281.4,329.6 L285.8,330.8 L290.1,332.0 L294.5,332.9 L298.8,333.8 L303.1,334.4 L307.4,335.0 L311.7,335.4 L315.9,335.6 L320.1,335.7 L324.2,335.7 L328.3,335.5 L332.4,335.2 L336.4,334.7 L340.3,334.0 L344.1,333.3 L347.9,332.4 L351.5,331.3 L355.1,330.1 L358.6,328.8 L362.0,327.3 L365.3,325.7 L368.5,324.0 L371.6,322.2 L374.6,320.2 L377.5,318.2 L380.2,316.0 L382.9,313.7 L385.4,311.3 L387.8,308.8 L390.1,306.2 L392.2,303.5 L394.2,300.7 L396.1,297.9 L397.9,294.9 L399.6,291.9 L401.1,288.8 L402.5,285.7 L403.8,282.5 L404.9,279.3 L405.9,276.0 L406.8,272.6 L407.6,269.2 L408.3,265.8 L408.8,262.3 L409.2,258.9 L409.5,255.3 L409.7,251.8 L409.8,248.3 L409.7,244.7 L409.6,241.1 L409.3,237.6 L409.0,234.0 L408.5,230.4 L408.0,226.9 L407.3,223.3 L406.6,219.8 L405.7,216.2 L404.8,212.7 L403.8,209.2 L402.7,205.7 L401.5,202.3 L400.3,198.9 L398.9,195.5 L397.5,192.1 L396.1,188.8 L394.5,185.5 L392.9,182.2 L391.2,179.0 L389.5,175.8 L387.7,172.7 L385.8,169.6 L383.9,166.5 L382.0,163.5 L380.0,160.6 L377.9,157.6 L375.8,154.8 L373.7,152.0 L371.5,149.2 L369.3,146.5 L367.0,143.8 L364.7,141.2 L362.4,138.6" fill="none" stroke="var(--cyan)" stroke-width="1.6" stroke-dasharray="4 4" opacity=".55"/><path d="M362.4,138.6 L360.0,136.1 L357.6,133.6 L355.2,131.2 L352.8,128.8 L350.3,126.5 L347.8,124.3 L345.3,122.1 L342.8,119.9 L340.2,117.8 L337.6,115.8 L335.0,113.8 L332.4,111.9 L329.8,110.0 L327.2,108.2 L324.5,106.4 L321.9,104.7 L319.2,103.1 L316.6,101.5 L313.9,99.9 L311.2,98.4 L308.5,97.0 L305.8,95.6 L303.1,94.3 L300.4,93.0 L297.8,91.8 L295.1,90.6 L292.4,89.5 L289.7,88.5 L287.0,87.5 L284.3,86.5 L281.6,85.6 L279.0,84.8 L276.3,84.0 L273.6,83.3 L271.0,82.6 L268.3,82.0 L265.7,81.4 L263.1,80.9 L260.4,80.4 L257.8,80.0 L255.2,79.6 L252.6,79.3 L250.1,79.1 L247.5,78.9 L245.0,78.7 L242.5,78.6 L239.9,78.6" fill="none" stroke="var(--cyan)" stroke-width="1.6" /><line x1="270.0" y1="175.0" x2="516.3" y2="201.8" stroke="var(--dim)" stroke-width="1.2"/><text x="522.3" y="205.8" fill="var(--dim)" text-anchor="start" font-size="12">reference direction</text><line x1="100.3" y1="244.0" x2="439.7" y2="106.0" stroke="var(--accent)" stroke-width="1.2" opacity=".85"/><text x="443.7" y="100.0" fill="var(--accent)" text-anchor="start" font-size="12">line of nodes</text><circle cx="361.6" cy="137.7" r="3.5" fill="var(--accent)"/><text x="367.6" y="157.7" fill="var(--accent)" text-anchor="start" font-size="12">ascending node</text><path d="M335.2,182.1 L336.0,180.7 L336.7,179.3 L337.1,177.9 L337.4,176.4 L337.5,175.0 L337.4,173.6 L337.1,172.1 L336.7,170.7 L336.0,169.3 L335.2,167.9 L334.2,166.5 L333.0,165.2 L331.7,163.8 L330.1,162.5 L328.5,161.3 L326.6,160.0 L324.6,158.9 L322.5,157.7 L320.2,156.6 L317.7,155.6" fill="none" stroke="var(--dim)" stroke-width="1.3"/><text x="354.0" y="170.8" fill="var(--dim)" text-anchor="middle" font-size="14" font-style="italic">Ω</text><path d="M313.9,118.3 L313.9,115.7 L314.1,113.0 L314.3,110.4 L314.6,107.9 L315.0,105.4 L315.5,103.0 L316.1,100.7 L316.8,98.4 L317.5,96.2 L318.3,94.1 L319.3,92.0 L320.3,90.1 L321.3,88.2 L322.5,86.5 L323.7,84.8 L325.0,83.2" fill="none" stroke="#ffd27a" stroke-width="1.5"/><line x1="361.6" y1="137.7" x2="303.3" y2="114.0" stroke="#ffd27a" stroke-dasharray="3 3" opacity=".8"/><line x1="361.6" y1="137.7" x2="316.9" y2="71.1" stroke="#ffd27a" opacity=".8"/><text x="326.8" y="100.4" fill="#ffd27a" text-anchor="start" font-size="14" font-style="italic">i</text><path d="M314.5,156.9 L312.8,154.3 L310.8,151.8 L308.8,149.4 L306.7,147.0 L304.5,144.7 L302.2,142.4 L299.8,140.3 L297.4,138.2 L294.9,136.2 L292.3,134.4 L289.6,132.6 L286.9,131.0 L284.2,129.4 L281.4,128.0 L278.6,126.7 L275.7,125.6 L272.9,124.5 L270.0,123.6 L267.2,122.8 L264.3,122.2 L261.5,121.7 L258.7,121.3 L255.9,121.1 L253.2,121.0" fill="none" stroke="var(--accent)" stroke-width="1.3"/><text x="292.6" y="121.3" fill="var(--accent)" text-anchor="middle" font-size="14" font-style="italic">ω</text><line x1="270.0" y1="175.0" x2="239.9" y2="78.6" stroke="var(--accent)" stroke-dasharray="3 3" opacity=".8"/><circle cx="239.9" cy="78.6" r="5" fill="var(--accent)"/><text x="248.9" y="72.6" fill="var(--accent)" text-anchor="start" font-size="12">periapsis</text><circle cx="270.0" cy="175.0" r="7" fill="#ffd27a"/><text x="60.0" y="262.0" fill="var(--dim)" text-anchor="start" font-size="12">reference plane</text><text x="141.3" y="189.8" fill="var(--cyan)" text-anchor="end" font-size="12">orbit</text><path d="M187.4,92.3 L195.0,82.8 L199.5,91.8 z" fill="var(--cyan)"/><text x="192.9" y="111.8" fill="var(--cyan)" text-anchor="middle" font-size="11">direction of motion</text></svg>
  <figcaption>Figure 2 · Orientation of an orbit, in the textbook convention<sup class="cite">3</sup>. Ω is measured in the reference plane from the reference direction to the ascending node, <i>i</i> is the tilt between the two planes, and ω is measured in the orbit plane from the ascending node to periapsis. The arrow shows the direction of motion. The dashed part of the orbit lies below the reference plane.</figcaption></figure>
  <p>Here R<sub>z</sub>(φ) and R<sub>x</sub>(φ) turn a vector anticlockwise by the angle φ about the <i>z</i> and <i>x</i> axes. <b>Elite Dangerous differs from the textbook here.</b> To match the game, Spansh's Ω and ω must be applied with the opposite sign:</p>
  <math display="block"><mover><mi>r</mi><mo>→</mo></mover><mo>=</mo><msub><mi>R</mi><mi>z</mi></msub><mo>(</mo><mo>−</mo><mi>Ω</mi><mo>)</mo><mspace width=".15em"/><msub><mi>R</mi><mi>x</mi></msub><mo>(</mo><mi>i</mi><mo>)</mo><mspace width=".15em"/><msub><mi>R</mi><mi>z</mi></msub><mo>(</mo><mo>−</mo><mi>ω</mi><mo>)</mo><mo>(</mo><mi>r</mi><mspace width=".1em"/><mi>cos</mi><mi>ν</mi><mo>,</mo><mspace width=".2em"/><mi>r</mi><mspace width=".1em"/><mi>sin</mi><mi>ν</mi><mo>,</mo><mspace width=".2em"/><mn>0</mn><mo>)</mo></math>
  <p>We found this by comparing distances and planet positions with the game<sup class="cite">7</sup>. Either the game measures these two angles the other way round, or its axes are arranged differently. The data cannot tell which, and the result is the same. This is the form GRAVITAS uses.</p>
  <p>One more difference shows only when you look at the sky. Seen from moon 9 a, the star, planet 3 and moon 9 b sat on the other side of planet 9's rings than this formula gives<sup class="cite">7</sup>. The game's space is the mirror image of it. So GRAVITAS mirrors every position and every frame through the reference plane, which turns <i>z</i> into −<i>z</i>. A mirror keeps all distances, angles and times the same, so the distances and eclipse times in the Accuracy tab do not change. Only the handedness of the view changes.</p>
  <p>A moon's orbit is measured around its planet's equator, so the planet's axial tilt is turned in as well, and these frames nest from star to planet to moon. The data does not say which way the tilt turns. The game decided it in our tests (section 4). For a body that orbits a barycentre which is not itself inside another barycentre, the tilt turns one way. For every other body it turns the other way. Two slightly different rules fit all tests so far, as the Accuracy tab explains.</p>
  <p>GRAVITAS treats every orbit as a fixed two-body orbit. Real orbits change slowly, because every other body pulls a little too<sup class="cite">8</sup>. Our in-game tests agree with fixed orbits to within the game's own rounding<sup class="cite">7</sup>.</p>
  <div class="q">3 · LIGHT AND ECLIPSES</div>
  <p>Seen from a body, a sphere of radius <i>R</i> at distance <i>d</i> has the apparent radius<sup class="cite">4</sup></p>
  <math display="block"><mi>α</mi><mo>=</mo><mi>arcsin</mi><mfrac><mi>R</mi><mi>d</mi></mfrac></math>
  <p>Let α<sub>S</sub> be the star's apparent radius, α<sub>P</sub> that of a body in front of it, and θ the angle between their centres (Figure 3). Then</p>
  <math display="block"><mtable columnalign="left"><mtr><mtd><mi>θ</mi><mo>≤</mo><msub><mi>α</mi><mi>P</mi></msub><mo>−</mo><msub><mi>α</mi><mi>S</mi></msub></mtd><mtd><mtext>  total eclipse</mtext></mtd></mtr><mtr><mtd><mi>θ</mi><mo>&lt;</mo><msub><mi>α</mi><mi>P</mi></msub><mo>+</mo><msub><mi>α</mi><mi>S</mi></msub></mtd><mtd><mtext>  partial or annular eclipse</mtext></mtd></mtr><mtr><mtd><mi>θ</mi><mo>≥</mo><msub><mi>α</mi><mi>P</mi></msub><mo>+</mo><msub><mi>α</mi><mi>S</mi></msub></mtd><mtd><mtext>  full starlight</mtext></mtd></mtr></mtable></math>
  <figure class="fig"><svg viewBox="40 15 460 150" width="100%" style="max-width:560px" role="img" aria-label="Eclipse geometry"><circle cx="170" cy="90" r="34" fill="#ffd27a"/><circle cx="240" cy="90" r="62" fill="#140c24" fill-opacity=".93" stroke="var(--cyan)" stroke-width="1.4"/><line x1="170" y1="90" x2="240" y2="90" stroke="var(--accent)" stroke-width="1.4"/><line x1="170" y1="90" x2="143.95448893395474" y2="111.85477872934234" stroke="#7a5a10" stroke-width="1.4"/><line x1="240" y1="90" x2="279.85283180056547" y2="42.505244526623365" stroke="var(--cyan)" stroke-width="1.2"/><circle cx="170" cy="90" r="2.5" fill="#000"/><circle cx="240" cy="90" r="2.5" fill="var(--cyan)"/><text x="126.0" y="122.0" fill="#ffd27a" text-anchor="end" font-size="14" font-style="italic">α<tspan font-size="10" dy="3">S</tspan></text><text x="269.9" y="64.3" fill="var(--cyan)" text-anchor="start" font-size="14" font-style="italic">α<tspan font-size="10" dy="3">P</tspan></text><text x="205.0" y="108.0" fill="var(--accent)" text-anchor="middle" font-size="14" font-style="italic">θ</text><circle cx="340" cy="70" r="6" fill="#ffd27a"/><text x="354.0" y="74.0" fill="var(--dim)" text-anchor="start" font-size="12">star (behind)</text><circle cx="340" cy="96" r="6" fill="#140c24" stroke="var(--cyan)"/><text x="354.0" y="100.0" fill="var(--dim)" text-anchor="start" font-size="12">body in front</text><line x1="332" y1="122" x2="348" y2="122" stroke="var(--accent)" stroke-width="1.4"/><text x="354.0" y="126.0" fill="var(--dim)" text-anchor="start" font-size="12">angle between centres</text></svg>
  <figcaption>Figure 3 · A partial eclipse: two discs on the sky. The uncovered share of the star's disc gives the starlight percentage. An annular eclipse is the case where the body in front looks smaller than the star and sits inside its disc.</figcaption></figure>
  <p>Between the two limits the covered fraction of the star's disc is the overlap area of two circles. The map treats the star's disc as evenly bright. Real stars are darker near the edge (limb darkening), so during a partial eclipse the percentage is approximate. Start and end times are found by stepping forward in time and halving the interval until it is a couple of seconds wide.</p>
  <div class="q">4 · HOW WE TEST IT AGAINST THE GAME</div>
  <p>Formulas alone are not enough: the game has its own conventions. So CMDR Hongark flies to a reference system, <b>Col 285 Sector VR-E b27-1</b>, and records<sup class="cite">7</sup> what the game shows, with the game's own timestamps. That means distances in the navigation panel, the system map, the sky from a moon's surface, and the minute a star disappears behind a planet. Claude compares each record with the map's prediction, made before looking. When several conventions are possible, the observations decide which one is right. When a prediction misses, the cause is found and fixed. Example: the way a planet's axial tilt is applied was first set from three tests. A fourth test, from moon 3 a, showed it was wrong for planets inside nested barycentres. The rule was corrected, and a fifth test on moon 9 a confirmed it. The results are in the Accuracy tab.</p>
  <div class="q">5 · WHAT COMES NEXT</div>
  <p>The in-game tests so far come from one reference system. Automated checks also run on 22 very different systems before every release. They show that the map works there, not that it matches the game. Next we repeat the in-game tests in other systems: with two stars, with moon pairs, far from home. This shows whether the same rules hold everywhere. Accuracy will keep improving and known gaps (listed in Accuracy) will be closed one by one, always by checking against the game.</p>
  <div class="q">REFERENCES</div>
  <ol class="refs">
    <li>J. Kepler, <i>Astronomia Nova</i>, 1609.</li>
    <li>J. Kepler, <i>Harmonices Mundi</i>, 1619.</li>
    <li>C. D. Murray and S. F. Dermott, <i>Solar System Dynamics</i>, Cambridge University Press, 1999.</li>
    <li>J. Meeus, <i>Astronomical Algorithms</i>, 2nd ed., Willmann-Bell, 1998. Chapter 30, Eq. 30.1, 30.2, 30.5 and 30.7 (Kepler's equation and its solution). Chapter 55 (apparent semidiameters).</li>
    <li>H. D. Curtis, <i>Orbital Mechanics for Engineering Students</i>, Elsevier Butterworth-Heinemann, 2005. Eq. 3.11 (Kepler's equation), Eq. 3.14 and Algorithm 3.1 (Newton's method), Eq. 4.44 (from the orbit plane to space).</li>
    <li>Spansh, Elite Dangerous galaxy data, spansh.co.uk, compiled from the Elite Dangerous Data Network (EDDN).</li>
    <li>CMDR Hongark, in-game observations in Col 285 Sector VR-E b27-1, 2–10 Oct 2026. Results are in the Accuracy tab.</li>
    <li>T. Gallardo, <i>Solar System Dynamics</i>, lecture notes, COSPAR Capacity Building Workshop on Planetary Science, Montevideo, 2007. Two-body problem, barycentre, Kepler's laws and perturbed orbits.</li>
  </ol>`;
}
function accuracyHtml() {
  return `<p class="note">What the map gets right, how we checked it, and what it cannot know. Checks were made in the game by CMDR Hongark in Col 285 Sector VR-E b27-1.</p>
  <table><tr><th>Check</th><th>Result</th></tr>
  <tr><td>30 distances in the navigation panel, ship parked by the star (2 Oct 2026, 12:23 UTC)</td><td>average difference 0.36 ls</td></tr>
  <tr><td>27 distances from a second spot near planet 3, predicted without looking (14:04 UTC)</td><td>average 0.23 ls, largest 0.50 ls. This is inside the game's own rounding</td></tr>
  <tr><td>Planet angles in the in-game system map orrery</td><td>agree within about 10° (judged from screenshots)</td></tr>
  <tr><td>Moon 2 a in the shadow of planet 2 (2 Oct 2026, 17:47–17:51 UTC)</td><td>dark in the game, as the map showed</td></tr>
  <tr><td>End of that eclipse, filmed minute by minute from the surface of 2 a: the moment the star's centre clears the edge of planet 2 (the game's target marker turns from dashed to solid)</td><td>game 18:46:34 UTC, map 18:45:38 UTC. Under a minute apart</td></tr>
  <tr><td>Start of an eclipse on moon 7 a by planet 7, seen from the surface (target marker turns dashed)</td><td>game 21:37:12 UTC, map 21:38:38 UTC for the moon's centre. Within the ±1.7 min a spot on the surface allows</td></tr>
  <tr><td>Which side of planet 8's rings the star lights, seen from moon 8 c (2 Oct 2026, 22:29 UTC)</td><td>led to the axial-tilt rule of v0.38. Now matches the game</td></tr>
  <tr><td>Rings of planet 8 seen from the surface of moon 8 c</td><td>edge-on line, with moons 8 a and 8 b at its two ends, as in the game</td></tr>
  <tr><td>Planet 3 seen from moon 3 a (3 Oct 2026, 15:27–15:38 UTC). Which half of the planet is lit, with its rings across it</td><td>did not match with the v0.38 rule. Led to the corrected rule of v0.44, which matches. Distances to 3 b (3.39 ls) and to planet 3 (1.52 ls) matched to 0.01 ls</td></tr>
  <tr><td>End of an eclipse on moon 9 a by planet 9, predicted with the corrected rule before looking (target marker turns solid)</td><td>game 16:43:29 UTC, map 16:45:15 UTC for the moon's centre. Within the ±3.1 min a spot on the surface allows. The other possible rule gave 16:33:50 and was ruled out</td></tr>
  <tr><td>The sky from moon 9 a: the star, planet 3 and moon 9 b around the rings of planet 9 (10 Oct 2026, 17:41–18:44 UTC)</td><td>the map showed the mirror image of the game. No turn of the view could fix it. Fixed in v0.49.3. The angles now agree within about 6°</td></tr>
  <tr><td>End of a second eclipse on moon 9 a by planet 9, predicted before looking (target marker turns solid)</td><td>game 18:43:43 UTC, map 18:48:00 UTC for the moon's centre. 4.3 min apart, a little more than the ±3.1 min a spot on the surface allows. Being checked</td></tr></table>
  <div class="q">ALWAYS FROM THE DATA</div><p>Orbits and positions at any moment, sizes, rings, axial tilt, light, shadows and eclipse times. Every system uses the same calculation. Other systems have not yet been compared with the game one by one.</p>
  <div class="q">NOT IN THE DATA</div><p>Which way a surface faces at a given moment (rotation phase), so sunrise times at a spot and your exact spot in the surface view cannot be known. Which body a station in orbit or a fleet carrier circles (we match it from its reported distance) and where exactly it sits around that body. Construction sites may already be finished in the game. Bodies without an orbit timestamp in Spansh may be out of place. Their panel says so.</p>
  <div class="q">STILL BEING CHECKED</div><p>The times when bodies pass through each other. They come from the same orbits as the eclipse times, and will be compared with what commanders see at the next events.</p><p>Eclipse times on moon 9 a. In both tests the map was late, by 1.8 and 4.3 minutes. We will time both ends of one eclipse to find out why.</p><p>The axial-tilt rule fits all five planets tested so far. Two slightly different rules fit them equally well. They give different answers only for some planets inside barycentres, and we are looking for such planets in other systems to tell them apart.</p>
  <div class="q">ILLUSTRATIVE</div><p>Surface patterns, the spin angle of a body in the 3D view, the fleet carrier and station models (simple original shapes for each type), the compressed distances and enlarged sizes of the overview map (True scale and the surface view show real sizes and distances), and the system map's layout, station icons and planet looks, with its compressed sizes and even spacing. A station on a surface is drawn on its body's edge, not at its real spot: hover it for its latitude and longitude. In 3D it stands at that latitude and longitude, but the body's spin angle is illustrative. The system map's shadows and eclipse times are computed exactly like the eclipse calendar.</p>`;
}
// v0.92.2: GRAVITAS's source code, public on GitHub (MIT): anyone can check what is read and what is sent
const GH_URL = "https://github.com/Servly/gravitasmap", GH_PRIV = GH_URL + "/blob/main/PRIVACY.md";
const GH_ON = true;    // v0.92.4: false hides every GitHub link (v0.92.5: the repository is open)
const NEWS_TABS = {
  "What's new": () => CHANGES.map(g => g.rel.map(r => `<div class="rel"><h4>${r.v}<em class="k ${r.k}">${r.k}</em></h4><ul>${r.t.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")).join(""),
  "Plans": () => `<p class="note">Plans, not promises: the order and timing may change.</p>` + PLANS.map(g => `<div class="q">${g.q}</div><div class="rel soon"><ul>${g.items.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join(""),
  "Accuracy": accuracyHtml,
  "How it works": howHtml,
  "CMDR Hongark": () => `<div class="q">CMDR HONGARK</div><p>Commander in Elite Dangerous and the developer of GRAVITAS. CMDR Hongark designs the map and flies every in-game test behind the Accuracy tab: parking by stars to read the navigation panel, landing on moons to watch eclipses minute by minute, and photographing rings and skies to compare with the map.</p>
    <div class="sqd"><img src="assets/trge-banner.png" alt="Turkish Galactic Empire squadron emblem" width="250" height="75" loading="lazy"><p>CMDR Hongark is a member of the <b>Turkish Galactic Empire [TRGE]</b> squadron.</p></div>
    <p>GRAVITAS is written together with Claude, an AI assistant made by Anthropic. CMDR Hongark sets the direction and checks the results in the game. Claude writes the code and works through the comparisons.</p>
    <div class="q">FREE, WITHOUT ADS</div>
    <p>GRAVITAS is free. There are no ads on the site, and there never will be. We do not ask for money now.</p>
    <p>The plan is to develop GRAVITAS for one year, up to its final version. If by then players find it useful, a small support page (such as Patreon) may open. It would only cover running costs and keep the site going. Our priority is to build something that helps players.</p>
    ${GH_ON ? `<p>The source code is public on <a href="${GH_URL}" target="_blank" rel="noopener">GitHub</a> (MIT licence).</p>` : ""}
    <p class="note">GRAVITAS is fan-made. It is not affiliated with Frontier Developments or Spansh. The map is drawn with <a href="https://threejs.org" target="_blank" rel="noopener">three.js</a> (MIT licence).</p>`,
  "Thanks": () => `<div class="q">THANKS</div><p>GRAVITAS stands on the work and the help of others. Thank you.</p>
    <ul class="thx">
      <li><b>Spansh</b> (Gareth Harper). Every system on the map comes from Spansh's data. Thank you for building it, and for letting GRAVITAS use it.</li>
      <li><b>CMDR Cyanidex</b>, leader of TRGE. One of the first to test GRAVITAS, and the source of many Combat Mode ideas: the targets by value, the team board and more.</li>
      <li><b>Taha Koçer</b>, for his support.</li>
      <li><b>CMDR Nermesos</b>, a close friend, for his support.</li>
      <li><b>The Canonn community</b>, for the first feedback from players outside the squadron.</li>
      <li><b>Frontier Developments</b>, for Elite Dangerous.</li>
    </ul>
    <div class="sqd big"><img src="assets/trge-banner.png" alt="Turkish Galactic Empire squadron emblem" width="250" height="75" loading="lazy"><p>And the whole <b>Turkish Galactic Empire [TRGE]</b> squadron: for testing, for every report and idea, and for supporting GRAVITAS from the first day.</p></div>`,
  "Feedback": () => `<div class="q">FEEDBACK</div><p>Found something that does not match the game? That is the most useful thing you can tell us. Press <b>Report a problem</b>, say what GRAVITAS showed and what the game showed, and add an in-game screenshot taken with <b>F10</b>. Your report goes straight to the developers.</p>
    <p><button class="repOpen pri">⚑ Report a problem</button></p>
    <p>The report also carries what we need to see the same thing: a link to your exact view, the version, and how smoothly the map ran. You can read all of it in the window before you send.</p>
    <p>Ideas and questions are welcome too. Use the same button.</p>
    <p class="note">GRAVITAS is in public beta. Some results are still being checked against the game.</p>`,
  "Privacy": () => `<div class="q">PRIVACY</div><p>GRAVITAS has no accounts, no ads and no tracking. It sets no cookies and runs no analytics scripts. We do not sell your data. What you choose to share (a paired device, a team board, a problem report) goes only where you send it.</p>
    <div class="q">CHECK IT YOURSELF</div>${GH_ON ? `<p>GRAVITAS's source code is public on GitHub, under the MIT licence. <a href="${GH_PRIV}" target="_blank" rel="noopener">How GRAVITAS reads your journal</a> shows every step in the code, and how to watch it in your own browser (F12, Network tab): the names of systems go out, and you will not find a line of your journal. <a href="${GH_URL}" target="_blank" rel="noopener">The whole code</a>.</p>`
      : `<p>Open GRAVITAS in Chrome or Edge, press F12 and open the Network tab. Turn on Sync with the game and play for a while. You will see the names of systems go out (system?name=…), the site's own files, and only if you switched them on: room (pairing, team board) and report. Click any request and look at its address and Payload: you will not find a line of your journal. We are preparing to publish the source code on GitHub, under the MIT licence.</p>`}
    <p>The site also tells your browser to run only GRAVITAS's own code and the 3D library. Any other script, even one a service adds on the way, is blocked.</p>
    <div class="q">IN YOUR BROWSER</div><p>Your settings stay in your own browser: quality, sound, view options, the notes you closed, your recent searches and your bookmarks. Your combat reports (the last 30), your ship order for the target list and the team board you joined stay there too. They never leave your computer. Clearing the site data in your browser removes them.</p>
    <div class="q">SYNC WITH THE GAME</div><p>Only when you turn it on. Your browser reads your game's Journal files and Status.json from the folder you choose. It reads the lines that say where you are or where you jump to, your ship's jump range and your carriers. From NavRoute.json it reads the route you plotted (the systems, their star class and position). From Status.json your position on a planet, whether you are landed, in the SRV or on foot, which game panel is open, your ship's current target and, for Combat Mode, your pips, heat and danger flags. For Combat Mode it also reads the fight: the ships you scan and their bounty, your kills, the attacks on you, your loadout, your combat rank, your team's names, the active Operation, and what NPCs say to you. Of your team's chat it counts only how many lines each one wrote, never the words. GRAVITAS does not upload or store the files, and keeps no log of them. Only the system's name is sent, the same as a search. Your browser remembers which folder you chose, and the last system Sync showed, so the next visit opens there. Clearing the site data removes that too.</p>
    <div class="q">SYNC WITH GRAVITAS (PHONE OR TABLET)</div><p>Only when you pair a device. Your computer then sends the same small summary Sync shows (system, body, station, landed or docked, your ship's target, game closed, the route you plotted and your jump range) to the device you paired, through GRAVITAS's server on Cloudflare, or directly over your own network when that is faster. In a fight, the combat screen goes to your device too. Your Journal never leaves your computer. The server keeps only the latest "where am I" summary of each pairing and deletes it about 12 hours after the last device left. The combat screen is only passed on and not kept. (From v0.91 to v0.91.7 it was kept there with the summary, for up to 12 hours. We changed that in v0.92.) Each device also tells your computer what kind it is (for example "Android phone · Chrome"), so you can see which devices follow and stop one with ×. That is passed on, not kept. Pairings use a random link and a code that works for 5 minutes. To limit misuse, the server allows a new pairing only every few seconds from the same IP address and keeps a one-way code made from it for those seconds.</p>
    <div class="q">TEAM BOARD</div><p>Only when you start or join one. You choose to add your fight. Then your CMDR name, your ship, your kills, your credits and your top kill go to everyone who has the board's link, through GRAVITAS's server. Your Journal stays on your computer. The server keeps nothing: your row lives only on your open connection and is gone when you close GRAVITAS or leave the board. Anyone with the link can watch, so share it only with your team.</p>
    <div class="q">WHEN YOU OPEN A SYSTEM</div><p>The page asks our server for the system, and our server asks Spansh. Spansh does not see your IP address. The 3D library (three.js) comes from this site too, not from an outside server.</p>
    <div class="q">HOSTING</div><p>The site runs on Cloudflare. Like any host, Cloudflare handles your IP address to deliver the pages and keeps short technical logs. Those logs include the names of the systems your map asks for, so a series of them could show where you travelled. GRAVITAS does not keep them or read them. GRAVITAS itself does not store IP addresses (one short exception, see Problem reports).</p>
    <div class="q">PROBLEM REPORTS</div><p>A report holds what you write, your screenshots and the details shown in the report window: version, a link to your view, graphics card, browser, screen size and recent errors. Your CMDR name and e-mail are optional. Your e-mail is used only to answer you. To stop bots, the server allows one report a minute from the same IP address. For that minute it keeps only a one-way code made from the address (not the address itself), then forgets it.</p>
    <p>Reports are sent by e-mail to the developers through the Resend mail service. We keep a report only as long as we need it to fix the problem. To have a report deleted, send a new report that asks for it.</p>`,
};
let newsTab = "What's new", NEWS_SET = "about";
// v0.92.4: the same window shows ABOUT GRAVITAS and GRAVITAS MODES (43-modes.js), each with its own tabs
function openNews(tab, set) {
  NEWS_SET = set === "modes" && typeof MODES_TABS !== "undefined" ? "modes" : set === "plugin" && typeof PLUGIN_TABS !== "undefined" ? "plugin" : "about";   // v0.93: and the plugin
  const T = NEWS_SET === "modes" ? MODES_TABS : NEWS_SET === "plugin" ? PLUGIN_TABS : NEWS_TABS;
  if (NEWS_SET === "modes") { if (tab && T[tab]) MODES.tab = tab; tab = MODES.tab; } else if (NEWS_SET === "plugin") { tab = tab && T[tab] ? tab : Object.keys(T)[0]; } else { if (tab) newsTab = tab; tab = newsTab; }
  $("newsH3").textContent = NEWS_SET === "modes" ? "GRAVITAS MODES" : NEWS_SET === "plugin" ? "GRAVITAS PLUGIN" : "ABOUT GRAVITAS"; $("news").setAttribute("aria-label", $("newsH3").textContent);
  $("newsTabs").innerHTML = Object.keys(T).map(t => `<button data-t="${t}" class="${t === tab ? "on" : ""}">${t}</button>`).join("");
  $("newsBody").innerHTML = T[tab](); $("newsBody").scrollTop = 0;
  $("newsTabs").querySelectorAll("button").forEach(b => b.onclick = () => openNews(b.dataset.t, NEWS_SET));
  $("newsBody").querySelectorAll(".repOpen").forEach(b => b.onclick = () => { $("news").style.display = "none"; openReport(); });
  $("news").style.display = "flex";
}
$("newsBtn").onclick = () => openNews();
document.querySelector("#credits .newsIn").onclick = () => openNews();
$("newsX").onclick = () => ($("news").style.display = "none");
$("news").addEventListener("mousedown", e => { if (e.target === $("news")) $("news").style.display = "none"; });
addEventListener("keydown", e => { if (e.key === "Escape" && $("news").style.display === "flex") $("news").style.display = "none"; });
// remember the visitor's view settings between visits (this browser only)
const VIEW_KEYS = [...document.querySelectorAll("#view input, #view select")].map(i => i.id).filter(id => id && id !== "vQuality" && id !== "vFlat");   // Flat has its own saved setting
const VIEW_DEF = Object.fromEntries(VIEW_KEYS.map(id => [id, $(id).type === "checkbox" ? $(id).checked : $(id).value]));
function saveView() { try { localStorage.setItem("gravitas.view", JSON.stringify(Object.fromEntries(VIEW_KEYS.map(id => [id, $(id).type === "checkbox" ? $(id).checked : $(id).value])))); } catch (e) {} }
function setViewValues(o) { for (const id of VIEW_KEYS) if (id in o) { if ($(id).type === "checkbox") $(id).checked = !!o[id]; else $(id).value = o[id]; } bodyScale = $("vBody").value / 100; applyView(); }
{ let o = null; try { o = JSON.parse(localStorage.getItem("gravitas.view") || "null"); } catch (e) {} if (o) setViewValues(o); }
document.querySelectorAll("#view input, #view select").forEach(i => { i.addEventListener("input", saveView); i.addEventListener("change", saveView); });
$("viewReset").onclick = e => { e.preventDefault(); setViewValues(VIEW_DEF); saveView(); if (!TILT) setTilt(true); if (S) { rebuildStylOrbits(); S.bodies.forEach(b => (b._det.innerHTML = detailLine(b))); if (selected) select(selected, false); } toast("View settings back to defaults"); };
$("vTemp").addEventListener("change", () => { if (S) S.bodies.forEach(b => (b._det.innerHTML = detailLine(b))); if (selected) select(selected, false); });
$("resetBig").onclick = () => MAPMODE ? smapFit() : resetView();     // v0.54: on the map it shows the whole system again
document.querySelectorAll(".rst").forEach(btn => btn.onclick = e => { e.preventDefault(); const i = $(btn.dataset.for); i.value = btn.dataset.def; i.dispatchEvent(new Event("input")); });
$("vTrue").addEventListener("change", () => setTrueScale($("vTrue").checked, true));     // v0.57
document.querySelectorAll("#scaleMode .opt").forEach(o => o.addEventListener("click", () => { const on = o.dataset.sc === "1"; if (on !== TRUESCALE) { setTrueScale(on, true); Sound.click(); } }));
{ let sc = null; try { sc = localStorage.getItem("gravitas.scale"); } catch (e) {} if (sc === "true") setTrueScale(true); }   // v0.61: opens as the visitor left it
$("vBody").addEventListener("input", () => { bodyScale = $("vBody").value / 100; if (S) rebuildStylOrbits(); });

document.querySelectorAll(".coll[data-target]").forEach(btn => btn.onclick = () => {
  const c = $(btn.dataset.target).classList.toggle("collapsed"); btn.textContent = c ? "+" : "–";
  requestAnimationFrame(() => document.documentElement.style.setProperty("--listTop", ($("top").offsetHeight + 20) + "px"));
});
function infoHide() {                                  // v0.53: the body panel slides out, then the map takes the space
  const el = $("info"); if (el.style.display === "none") return;
  if (isPhone()) { el.style.display = "none"; return; }
  el.classList.remove("opening"); el.classList.add("closing"); clearTimeout(infoHide.t);
  infoHide.t = setTimeout(() => { el.style.display = "none"; el.classList.remove("closing"); if (MAPMODE) smapLayout(); }, 190);
}
$("infoClose").onclick = () => { infoHide(); beltUnselect(); ringUnselect(); if (selected) { selected._item && selected._item.classList.remove("sel"); selected._div.classList.remove("sel"); selected = null; } if (MAPMODE) smapMarkSel(); updateUrl(); if (document.body.dataset.sheet === "info") setSheet(""); mnavState(); };

