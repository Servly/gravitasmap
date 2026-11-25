# GRAVITAS app changelog

Every version of the GRAVITAS Windows app, newest first. These are the same notes the app shows in its What's new window (English; the app also has them in German, Spanish, French, Portuguese and Russian). The website's history is in [../CHANGELOG.md](../CHANGELOG.md).

## 0.9.35
- Fix: the GRAVITAS MAP window said "Waiting for the game…" while the game was running, when you had stayed in one system for a long time. The map found your position only in the newest part of the Journal, and after a long session without a jump that part held no position. GRAVITAS now also looks further back in the Journal (read only, as always) for your last position, so the map follows you right away.

## 0.9.34
- Visits now works like an archive, so even a history of hundreds of thousands of jumps stays light and fast. GRAVITAS keeps only a small index of your whole history in memory and loads the last 12 months in detail. Click an older month or year on the timeline and just that period is loaded, and it is dropped again when you open another one. The timeline shows your whole history, there is a new Year page, older travels appear as faint dust on the map, and the search finds where you sold or bought something across all your years. A very large archive reads in a few seconds the first time, newest months first, and a new jump in the game updates in an instant. GRAVITAS still only reads your Journal files and never changes them.

## 0.9.33
- Visits is smoother. While your Journals are read for the first time you now see a loading screen with a progress bar, instead of a short "no visits" message. The "last N visits" box takes any number, including 10, 20 and 30. The map keys now follow the usual game layout: W A S D move the map, Q and E zoom, F fits the view, R replays, T tilts, X switches reduced effects and C shows or hides the panel. The details panel opens when you click a stop and closes when you click empty space, and from the summary a Back button takes you to the stop you were looking at.
- Show on the map now keeps the system you picked even when Sync is on. The map still tells you where your ship is and offers a Go button, and it follows your ship again when you press it.

## 0.9.32
- Visits is now a travel diary on a galaxy map. Your route is drawn through the real star positions with glowing lines. Old stops gather into numbered groups so even a very long history stays smooth, and you can page back by session, day, week or month, or ask for your last N visits. Click a stop to see what you did there, or search for where you last sold or bought something. GRAVITAS keeps this history on your PC only (never sent) and you can switch it off or forget it at any time.
- New in About: Send feedback, a form for a problem, an idea or a question, with up to 3 screenshots and an optional diagnostic report. Nothing is sent until you press Send. Settings gained Start with Windows, tray choices, a settings file you can save and load on another PC, and the folders where your data lives. The history lists are taller, the Tests page is gone, and the installer file has the GRAVITAS icon.

## 0.9.31
- The installer now takes care of the Microsoft WebView2 Runtime that GRAVITAS needs. Microsoft's small WebView2 installer travels inside the GRAVITAS installer and runs by itself when a PC does not have WebView2 yet, so nobody has to install it first. If GRAVITAS ever starts without a usable WebView2, it shows one clear message in your language (English when your language is not one of GRAVITAS's six) with a button to open Microsoft's download page, instead of a hard error. The installer's own texts follow your Windows language too.

## 0.9.30
- Free look over an open game panel no longer brings your windows back. When you opened a cockpit panel (for example the left panel with 1) and then used the free look key over it, the GRAVITAS windows appeared again on top of the panel. They now stay hidden for as long as the panel is open, and come back when you close it.

## 0.9.29
- The fight numbers now agree. The Last fight card shows the same credits as the Combat report (the bounties plus the estimated wing bonus), where before one card left the bonus out. And the game sometimes writes the same bounty line twice: GRAVITAS now counts it once (before, such a kill counted twice in kills, credits and Claims). The wing bonus stays an estimate of 7.5 % on what you earn in a wing: checked against the game's own Claims panel it was within a few credits in most fights, and 0.14 % high in one operation.

## 0.9.28
- Clear the Last fight report with a key. Ctrl+Shift+F6 clears the report at once (change it on the Keys page or use the button in the GRAVITAS menu); your Past combats stay untouched, and the report says which key clears it. The hints at the bottom of the windows now show the keys you really set, and no key text at all for a job that has no key (before, they always showed fixed Ctrl+Shift+F-keys, even when nothing was set).
- Tidier settings: every dropdown, switch and button of the same kind now has the same size and lines up on its right edge, on every page and in the in-game menu. The Key Bindings rows keep their place when you pick Custom, and the Updates page is as wide as the others.

## 0.9.27
- The Combat report now explains Claims. The report counts only that fight, while Claims hold every bounty you have not cashed in yet. When Claims hold more, the report adds one line with the exact amount from before the fight, so the two numbers can be read side by side. There is a switch for it in the Claims card (on by default).

## 0.9.26
- Link a browser with a short code. In the Phones and tablets block, Link a browser shows a code for two minutes: type it on gravitasmap.com (Devices, Link with the GRAVITAS app) and that page shows and manages the same list of devices as the app. The version label now says Beta, the About page fits the other pages and its Frontier and Claude names are links, and a few labels and gaps are tidier.

## 0.9.25
- Phones and tablets are now managed in one place. The Modes page has a Phones and tablets block: who follows, whether they are awake, and a Remove button for each, plus Stop sharing. The same list is in the map window and in the browser (Open in browser), and a change made in one place shows in the others within seconds. The pairing now belongs to the app, so it survives closing the map window.
- A tidier look: a redesigned About page (with the TRGE squadron emblem), a better place for the Open the GRAVITAS MAP button, one clean layout for every window setting (On, Perspective, Colour, Default position), no Preview tag on Combat, Thargoid and Debrief, and the Debrief history tab is gone.

## 0.9.24
- Licences complete. The licence list that comes with the app (Licences button in About) now has the full text for every one of the open-source libraries it uses, including eight that were missing before. Nothing else changed.

## 0.9.23
- Safer and easier to look after. The Journal lines handed to the map window no longer carry your commander ID, credits or loan, and player chat text is not passed on. Links the map page opens in your browser are limited to a short list. Updates are saved in a private folder and checked again right before they run, and an older update file can no longer replace a newer one. Problems the app can see in the game's files (a field that changed, a track it does not know) are now noticed: a calm note on the Modes page, and About has a Copy diagnostic report button for bug reports (nothing is sent, you copy it yourself) and a Licences button.
- Also: a damaged Status.json no longer hides every window, the game's newest key bindings file is used, pairing a phone is safer, and a few layout details (the bottom bar in narrow windows, the menu tabs and buttons) are tidier.

## 0.9.22
- Stronger and steadier. A big Journal (30 MB and more) is now read in pieces in well under a second instead of stalling the app at start. If one of the app's own files (settings, Past combats, Hunts, Debriefs) ever cannot be read, it is kept as a .bad copy and the backup copy is used: nothing is wiped any more, and files are written in one safe step. A panic inside one part of the app is written to the log and that part starts again instead of dying silently. Hand-edited profile colours, huge or broken PVP files, oversized files and a wrong update download can no longer crash or freeze it.
- Lighter at rest: hidden windows (the menu, the editor, the app in the tray) really stop polling, the app window asks less often when you are in the game, settings sliders are saved when you stop moving them, and the Thargoid recordings and the log no longer grow for ever.

## 0.9.21
- The GRAVITAS MAP's Sync is lighter and safer: it no longer sends everything again every minute, it keeps only the newest lines for a page that reloads, starts again cleanly after a long gap, skips a half-written Status.json, looks for a new Journal every 10 s instead of every second, and the window opens only our own site (a link to another place opens in your browser).
- Clearer wording: the Visits and On-foot tabs say they are planned, the Updates page no longer repeats its title, the System map card says Edit HUD is in the GRAVITAS menu over the game, and some translations were corrected (orrery in German and Russian, On-foot history, PVP, Debrief).
- New: the Visits tab on the Map page lists the systems you jumped to, newest first, read from your Journal each time it opens (nothing is stored). Pick one and it opens in the GRAVITAS MAP.

## 0.9.19
- The GRAVITAS MAP now belongs to the app. Map, Collisions, Sonification and Lenses are marked Ready and open in the GRAVITAS MAP window (a button on the Map page and in the in-game menu). The map follows your jumps by itself: the app reads your Journal and hands it to the window, so there is no folder to choose and nothing to confirm each time. Nothing is uploaded.
- New: the Sync with the game card on the Modes page, Updates has its own place in the side bar, and About now thanks the people and projects behind GRAVITAS and lists the tools we support. Sub-tabs have clearer names (Visits, Fight history, Hunt history), the main buttons have colours of their own, and the Map page no longer says Planned.

## 0.9.17
- PVP mode: the new Compare tab. Load your fight files and the other commander's: GRAVITAS finds the fights that are the same fight, puts the two PCs' clocks together (a death and a kill are one moment, and an interdiction both wrote; else the clocks as they are, with a slider to move one side) and shows both fights on one timeline: shields, hull steps, attacks, heat, Flight Assist, what each scan showed of the other, deaths, and the two ship builds side by side. With Observations switched on it adds up to four plain facts. Files are only read, never sent.

## 0.9.16
- New mode: PVP (off until you switch it on). Each fight with another commander is saved as a file on your computer: XXX_vs_YYY_fight_N.gravitas, with what the game wrote about you (attacks, shields, hull steps, Flight Assist, heat, the ships you locked, your ship's build if you allow it). It holds no keys and no mouse data and no commander ID. You send the file to the other commander yourself. The PVP page lists your fights with a timeline. Next version: load your friend's file and read the two fights together.

## 0.9.15
- New mode: Debrief (off until you switch it on). A small window shows the ship keys you press while you fly (a tap flashes, a hold counts the seconds) with the game's action name first and your key in brackets, Flight Assist, and the mouse's direction. After each fight a report shows a timeline: shields, hull steps, attacks, heat, kills, the ship you locked, Flight Assist, your keys and the mouse. Only the keys the game binds to ship actions are followed, and only while you are in your ship with the game in front. Everything stays on your computer.

## 0.9.14
- Fix: after you dock, the Targets by value list is cleared. A ship you scanned in a fight but did not kill no longer stays on the card for 10 minutes.

## 0.9.13
- The Xeno Hunt report now compares the hunt with your other hunts: its time against your average, bonds per hour, the time since your last hunt, and a short summary of the session. It also names the build you flew (read from the Journal, nothing to type in) and shows your average on that build, plus your total overheating time.

## 0.9.12
- The Xeno Hunt report now shows your hull as a range (for example 40-60 %, marked as an estimate). The game writes the hull only in 20 % steps, and 12 of 12 real hunts fell inside the range. No step at all means 80-100 %. Attacks are counted as waves, not as Journal lines.

## 0.9.11
- The Xeno Hunt report no longer shows a hull number when the game wrote no hull step (it only writes one every 20 %). It says no step instead, and a new Damage taken block lists the attacks received and the heat damage events the Journal counted.

## 0.9.10
- The Xeno Hunt report no longer claims a lowest hull it cannot know. The game writes the hull only in 20 % steps and not at all for heat damage, so the tile now says Last hull with max in front after heat damage, and the timeline notes it.

## 0.9.9
- The modes switch by themselves. A small card at the top says Combat Mode On in a ship fight, Thargoid Mode On in a Xeno Hunt and On Foot Mode On when you leave the ship. All three are on by default. The switches in Modes only turn one off completely.
- A Xeno Hunt no longer shows a Combat report with 0 kills. The Xeno Hunt report shows instead, and the hunt goes to Past Thargoid with the system, the kills named by bond (Cyclops, Scout...) and the overheating time.
- Past Thargoid and Past combats refresh by themselves while they are open.
- Fixed: after a settings reset the Combat mode started off and no window showed.

## 0.9.7
- Your settings, Past combats and Past Thargoid now get a second copy in %LOCALAPPDATA%\GRAVITAS-backup, outside the app's folders, so an uninstall or a repair does not take them with it. A lost file comes back by itself at the next start.
- A blocked update now says so and what to do (an antivirus can block it), instead of "Could not check".
- Build changes against false antivirus alarms. The app is being prepared for code signing.

## 0.9.6
- Past Thargoid keeps your Xeno Hunts: system, what you killed (Scout, Cyclops, Orthrus, Basilisk, Medusa or Hydra, named by the bond), time, bonds and the full report. Copy for Discord and Show in the game work there too.
- Thargoid fights no longer land in Past combats with 0 kills.
- Star your best fights: a star button in Past combats and Past Thargoid. Starred ones stay on top and are never removed when the list is full.
- Overheating time: the Thargoid card shows how long the ship was really overheating, and the report lists each stretch.

## 0.9.5
- Xeno Hunt ends at the last kill: a Cyclops hunt ends the moment the Cyclops dies, a scout hunt when the last scout the signal promised is down (threat 3 = 2 scouts, threat 4 = 4 scouts). The report shows at once instead of about a minute later.
- The Thargoid card shows scout kills as 2/4 while the signal's promise is known.
- Fixed: when the game played its Exploration music right at the drop, the signal's threat level was lost and the card showed no threat.

## 0.9.4
- The Shutdown Field warning window is gone: the game gives no sign before a shutdown, and you feel it anyway.
- The Thargoid page is tidied: the two Xeno Hunt windows show by themselves while Thargoids are about, the page text says what is shown and what the game does not write, and the recording folder path is fixed.

## 0.9.3
- The three Xeno Hunt windows (Thargoid card, Xeno Hunt report, Shutdown Field warning) moved from the Combat page to the Thargoid page, in the app and in the GRAVITAS menu. Their settings stay as they were.

## 0.9.2
- Xeno Hunt: three new windows for Thargoid fights. The Thargoid card takes the place of Targets by value while Thargoids are about: threat level and likely enemy, time, kills and bonds, attacks, shutdowns, heat, your hull steps.
- Xeno Hunt report: when the hunt ends, a report shows for a minute: kills by type, timeline, lowest hull, salvage.
- Shutdown Field warning, at the very top: a hint to have the Shutdown Field Neutraliser ready in an Interceptor fight, and a red alert the moment your systems are shut down.
- The game writes no Thargoid hull, shield or hearts, so none are shown. Windows are in the Windows list and can be moved in Edit HUD.

## 0.9.1
- The System map follows the keys much faster: its picture is drawn about 8 times quicker.
- Size, opacity and dark ground in Edit HUD are now each window's own. "Same as all windows" puts a window back on the shared settings.
- The map's width and height sliders move the card live, without rebuilding it.
- Open the map window closes the menu and opens the site big, in front.

## 0.9.0
- NEW: the System map as a window over the game, like the Bounty counter. It shows the map of the system you are in, at the top of the screen by default, with the same eased perspective, Edit HUD and profiles. Switch it on in the Windows list (System map) or on the Map page.
- Move and zoom the map with Ctrl+Shift and the number pad (8 up, 4 left, 5 down, 6 right, + and - zoom, 0 the whole system). Every key can be changed on Key Bindings, Map tab.
- The Map page can also open the whole site in a window of its own.

## 0.8.5
- The windows hide while the game's own menu (Esc, Options) is open. It follows the "Hide in maps" switch.
- GRAVITAS reads the game's free look binding again every 3 seconds, so changing it between Toggle and Hold in the game works without a restart.
- The Wing bonus tip says it counts only if your squadron has the perk.

## 0.8.4
- Every control in the app and in the GRAVITAS menu now has a short hover tip that says what it does.

## 0.8.3
- The Thargoid recording writes a status line only when something changed (plus one every 2 s), so a fight's file is about 40 times smaller.

## 0.8.2
- While a Thargoid recording runs, GRAVITAS looks at the status file every 15 ms, as it does with the Journal (the game itself writes it about once a second).

## 0.8.1
- Thargoid recorder: while Thargoids are about, GRAVITAS records what the game's status file shows and the Journal events that matter into a file on your computer, so shutdowns, shields and hull steps can be studied. Never sent anywhere.

## 0.8.0
- Claims now include your combat bonds, as the game's own Claims panel does (a Thargoid Hydra bond, scout bonds and so on), with the 7.5 % wing estimate. Bonds are never lost, not even when your ship is destroyed. A switch under Claims turns it off.
- Closing the menu (key, X or Esc) turns Edit HUD off, so it opens clean next time.
- The windows list is tidier: each window has its own block, where it shows is grouped (Main view, Left, Comms, Role, Right panel), the arrow buttons are gone (drag in Edit HUD instead) and Reset is now Default position.
- Free look: after the game window was away or the menu was open, free look is taken as off again, so the windows no longer end up the wrong way round.

## 0.7.9
- Fix: grabbing a window straight after dropping it no longer sends the dashed box back to where it was before. Each grab starts exactly where you dropped, and the window lands where the box is dropped.

## 0.7.8
- Fix: grabbing a window again right after dropping it, the dashed box now starts where you dropped it (the game window is repainted a moment later).
- The editor button now names the state (Locked or Unlocked) instead of the action, which read the wrong way round.

## 0.7.7
- Fix: moving a window a second time, the dashed box now starts where the window is, not where it was before the first move.

## 0.7.6
- The menu key is Ctrl+Shift+K only (G got in the game's way). A saved G becomes K. You can still set your own key under Key Bindings.
- When the menu opens, the mouse cursor is brought to the middle of it, so it is never lost.
- The editor guides never stay on screen: they show only while the menu and Edit HUD are open, and the menu closes by itself when you switch to another program.
- Dragging a window now moves only the dashed box, and the window takes its place when you let go (smooth, no cost while dragging).

## 0.7.5
- Fix: Edit HUD froze the app (GRAVITAS stopped responding). The editor layer is now built safely.
- Fix: the Perspective switch no longer breaks the window rows in the Combat tab.

## 0.7.4
- Fix: the Profiles pop-up now opens in front of everything and is solid.

## 0.7.3
- Profiles: one button next to the game status on the Modes page. Pick your ship from the list (no typing), save your window settings for it, load or delete saved ones.
- The About text on the Modes page is wider and justified, and names its maker.

## 0.7.2
- Updates no longer open any command window: the installer is started directly, silently, and the app comes back by itself.
- Windows snap to the screen's edge guides and the centre line when you drop them.
- Each window has its own dark ground level in the editor's settings.
- The menu can be folded to its title bar with the new button.
- Profiles are now also on the Modes page and in the menu's first tab.

## 0.7.1
- Edit HUD: a new button in the menu (left of Opacity). Turn it on to get the bars on the windows. Every change is saved to your profile at once.
- Windows now follow the mouse while you drag them, and the bars line up with them.
- Every window takes the perspective of the side it is on (left: comms panel, right: right panel, middle: flat). Each window has a Perspective switch.
- Fix: clicking the editor no longer hides the menu or freezes the screen. Fix: the size bar works. Fix: the tray icon brings the app back. Wing is the first card under the quick actions.

## 0.7.0
- New on-screen editor: open the GRAVITAS menu and every window gets a thin bar. Unlock a window, drag it where you want, Lock it. Colour, size, opacity and dark ground are in the same bar.
- Drag a window across the middle of the screen: in the middle band it is flat, on the left it takes the comms panel's perspective, on the right the right panel's.
- The Kill feed length can be set.
- Fix: Esc could stop working in the game after the menu was opened and closed. GRAVITAS now tells the game that Ctrl, Shift, Alt, Windows and Esc are released.

## 0.6.5
- New Key Bindings menu: every shortcut in one place, each with a default, an alternative and a Custom choice (two modifiers and a key, Windows key too).
- The GRAVITAS menu key is Ctrl+Shift+G again (Ctrl+Shift+K is one click away).
- Bounty counter in brief: only the money, for those who do not want the details.
- A window moved to the other side of the screen takes that side's perspective.
- Colours have Apply and Default buttons.
- Dark ground is with the windows, Targets by value has one card, Look and Behaviour are separate, Wing is first in Behaviour and counts by itself.
- The Target card and the test panel are gone. The windows show only over the game, never over the desktop.
- The version is shown at the top. Tab order is Map, Combat, Thargoid, On Foot everywhere. See-through is now Opacity.
- Starting the app again brings back a hidden window. Tray actions are written to gravitas.log.

## 0.6.4
- Updating no longer flashes a console window: the update runs out of sight.
- While it updates, the app says where the update comes from (gravitasmap.com, checked and signed) and that it will restart in a few seconds.
- Windows that are on now stay on screen even when nothing is happening (Targets, Kill feed, Current fight, Time to kill wait as empty frames), like the Bounty counter. You can turn this off under Look and behaviour.

## 0.6.2
- Choose your own key to open the GRAVITAS window: Combat > Keys > "Open the GRAVITAS window". It works from the game too.
- This What's new window shows once after every update. You can open it again from About.
- The menu key is Ctrl+Shift+K. The other keys are optional now and each one can be removed.
- The app looks for an update when it opens and installs small ones by itself as it opens; while it is open it only says "new version".
- Moving or snapping a window now shows that window with made-up data wherever it is tied to, so you can see where it goes. It no longer turns Preview on by itself.
- The windows stay visible while the GRAVITAS menu is open.
- "Hide the overlay while the mouse is over" is gone.
