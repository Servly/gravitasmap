// ------------------------------------------------------------ v0.92.4 GRAVITAS MODES
// One panel on the left, between Bodies and Sync: Combat now, Thargoid and On Foot later (Thargoid is a fight too, kept
// apart on purpose: it will show different things). Each mode opens in the About window's frame, with its own tab.
// v0.92.6: the panel holds only the three modes. Combat has three parts in its window: Overview, Past combats and
// Team board, so the list of fights and the board are a window now, not the whole screen.
var MODES = { tab: "Combat", sub: "home", html: "", nav: "", btn: "", undo: null };
const mBtn = (a, label, cls) => `<button type="button" ${a}${cls ? ` class="${cls}"` : ""}>${label}</button>`;
function modesShown() { return $("news").style.display === "flex" && NEWS_SET === "modes"; }
// open the modes window on a part of Combat ("home", "past", "board"). A report or a board on the full screen gives way
function modesOpen(sub) {
  if (sub) MODES.sub = sub;
  if (CB.el && CB.el.classList.contains("show") && !(CB.on && !CB.soft && !CB.past && !CB.hist)) { CB.full = false; CB.hist = false; CB.past = null; cbRender(); }
  else if (CB.el && CB.el.classList.contains("show")) { CB.full = false; cbRender(); }   // a live fight goes to its chip at the top
  if (typeof OP !== "undefined" && OP.show) { OP.show = false; opRender(); }
  openNews("Combat", "modes");
}
// Overview: what Combat Mode is doing now
function modesHomeHTML() {
  const sy = typeof SYNC !== "undefined" && SYNC.on, V = typeof cbLiveView === "function" ? cbLiveView() : null;
  const st = CB.on ? (CB.soft ? `<b class="mHot soft">● HOSTILES NEAR</b> no fire yet` : `<b class="mHot">● IN COMBAT</b> ${V && V.ep ? V.ep.n : 0} kills`)
    : CB.report ? "Your last fight's report is ready." : sy ? `<b class="mOk">● READY</b> Combat Mode starts by itself when a fight starts.` : "Turn on <b>Sync with the game</b> (the panel below) to use Combat Mode.";
  return `<p class="mSt">${st}</p>${CB.on || CB.report ? `<div class="mBtns">${mBtn(`data-mcb="open"`, CB.on ? "Open the combat screen" : "Open the report", "pri")}</div>` : ""}`;
}
const MODES_HOME_TEXT = `<div class="q">WHEN IT OPENS</div><p>By itself, when a fight starts: when you are attacked, when you destroy a ship, when your shields or hull take damage, when you are interdicted, or when the game's combat music starts. If a ship only scans you, or you lock a wanted ship, a small <b>HOSTILES NEAR</b> chip lights up at the top and the map stays as it is. Click <b>Map</b> on the combat screen to go back to the map. The chip at the top brings the screen back.</p>
    <div class="q">WHAT IT SHOWS</div><p>The ships you scanned, by value (their bounty), or in your own ship order. Your kills and credits, the attacks on you, your shields and hull, the active Operation and its phase. After the fight: a report you can copy as text or as an image for Discord. The last 30 reports stay in this browser under <b>Past combats</b>.</p>
    <div class="q">HOW IT WORKS</div><p>Combat Mode reads only your game's Journal and Status.json, in your browser, the same files as Sync. Nothing is uploaded. The game does not list the ships around you, so "seen" and some totals are estimates, and the screen says so. A shared kill counts for everyone who hit it, as in the game.</p>`;
// Team board: the board itself, or what it is and how to start one
function modesBoardHTML() {
  if (typeof OP !== "undefined" && OP.id) return opHTML(true);
  const sy = typeof SYNC !== "undefined" && SYNC.on && !SYNC.remote;
  return `<p>For flying together, for example an Operation with your squadron. Everyone's fight on one screen, live, and the results as one card for Discord.</p>
    <ol class="mSteps"><li>One of you starts a board here. Its link is copied.</li><li>Share the link with your team, on Discord for example.</li><li>Each CMDR opens the link on the computer where they play, with Sync on, and clicks <b>Add my fight</b>.</li><li>Everyone sees each CMDR's kills, credits and top kill as they happen. When the fight is over: <b>Copy image</b>.</li></ol>
    <div class="mBtns">${sy ? mBtn(`data-opnew`, "Start a team board", "pri") : `<span class="cbNote">Turn on Sync with the game first: the board shows your fight from your own game.</span>`}</div>
    <p class="cbNote">What the others see: your CMDR name, ship, kills, credits and top kill. Never your journal. Anyone with the link can watch, so share it only with your team. GRAVITAS's server keeps nothing: your row lives only on your open connection.</p>`;
}
function modesPastHTML() {
  const u = MODES.undo && Date.now() < MODES.undo.until ? `<div class="mUndo">Report deleted. <button type="button" data-cbundo>Undo</button></div>` : "";
  return u + cbHistHTML(true);
}
function modesNavHTML() {
  const n = cbHistory().length, ob = typeof OP !== "undefined" && OP.id;
  const b = (k, l) => `<button type="button" data-msub="${k}" class="${MODES.sub === k ? "on" : ""}">${l}</button>`;
  return b("home", "Overview") + b("past", `Past combats${n ? ` <small>${n}</small>` : ""}`) + b("board", `Team board${ob ? ` <i class="mdot" aria-label="open"></i>` : ""}`);
}
function modesCbBody() { return MODES.sub === "past" ? modesPastHTML() : MODES.sub === "board" ? modesBoardHTML() : modesHomeHTML(); }
var MODES_TABS = {   // (var: other parts may ask for it while the page is still loading)
  "Combat": () => { MODES.nav = modesNavHTML(); MODES.html = modesCbBody();
    return `<div class="q">GRAVITAS: COMBAT MODE</div><div class="mSub" id="mNav" role="tablist">${MODES.nav}</div><div id="mCb">${MODES.html}</div><div id="mText"${MODES.sub === "home" ? "" : ` style="display:none"`}>${MODES_HOME_TEXT}</div>`; },
  "Thargoid": () => `<div class="q">GRAVITAS: THARGOID MODE</div><p class="note">Planned. Not started yet.</p>
    <p>A mode of its own for fights with Thargoids. It is a fight too, but it needs different things on screen than Combat Mode, so it is kept apart. Combat Mode comes first: once it is stable, Thargoid Mode starts from the same base.</p>
    <p>Ideas are welcome. <button class="repOpen">Report a problem or an idea</button></p>`,
  "On Foot": () => `<div class="q">GRAVITAS: ON FOOT MODE</div><p class="note">Planned. Not started yet.</p>
    <p>A mode of its own for missions on foot, such as a map of the settlement you are in. An idea from CMDR Cyanidex.</p>
    <p>Ideas are welcome. <button class="repOpen">Report a problem or an idea</button></p>`,
};
// redraw the open Combat window: only what changed (so a click or a hover is not lost)
function modesRefresh() {
  if (!MODES || !MODES_TABS || !modesShown() || MODES.tab !== "Combat") return;
  const nav = document.getElementById("mNav"), body = document.getElementById("mCb"); if (!nav || !body) return;
  const n = modesNavHTML(); if (n !== MODES.nav) { MODES.nav = n; nav.innerHTML = n; }
  const h = modesCbBody(); if (h !== MODES.html) { MODES.html = h; body.innerHTML = h; }
  const tx = document.getElementById("mText"); if (tx) tx.style.display = MODES.sub === "home" ? "" : "none";
}
// the panel: three buttons. Combat glows red in a fight, amber when hostiles are near; a dot while a team board is open
function modesPanel() {
  const el = $("modes"); if (!el) return;
  const k = (CB.on ? (CB.soft ? "s" : "h") : "") + (typeof OP !== "undefined" && OP.id ? "b" : "") + (typeof SYNC !== "undefined" && SYNC.on ? "" : "n");
  if (k !== MODES.btn) { MODES.btn = k; const b = el.querySelector('[data-mode="Combat"]');
    b.classList.toggle("hot", k.includes("h")); b.classList.toggle("soft", k.includes("s")); b.classList.toggle("ob", k.includes("b"));
    b.title = k.includes("h") ? "In combat: open Combat Mode" : k.includes("s") ? "Hostiles near: open Combat Mode" : "GRAVITAS: Combat Mode";
    $("modesSt").textContent = k.includes("n") ? "needs Sync" : ""; }
  if (MODES.undo && Date.now() >= MODES.undo.until) MODES.undo = null;
  modesRefresh();
}
function modesAct(a) {
  if (a === "open") { if (CB.on || CB.report) { $("news").style.display = "none"; CB.hist = false; CB.past = null; CB.full = true; cbRender(); } }
}
$("modes").addEventListener("click", e => { const m = e.target.closest("[data-mode]"); if (m) { if (m.dataset.mode === "Combat") modesOpen(); else openNews(m.dataset.mode, "modes"); } });
// the buttons inside the Combat window
$("newsBody").addEventListener("click", e => {
  if (NEWS_SET !== "modes") return;
  const s = e.target.closest("[data-msub]"); if (s) { MODES.sub = s.dataset.msub; modesRefresh(); return; }
  const d = e.target.closest("[data-cbdel]"); if (d) { e.stopPropagation(); const r = cbHistDel(d.dataset.cbdel); if (r) MODES.undo = Object.assign(r, { until: Date.now() + 8000 }); modesRefresh(); return; }
  const u = e.target.closest("[data-cbundo]"); if (u) { if (MODES.undo) cbHistPut(MODES.undo); MODES.undo = null; modesRefresh(); return; }
  const r = e.target.closest("[data-cbt0]"); if (r && MODES.sub === "past") { $("news").style.display = "none"; cbPastOpen(r.dataset.cbt0); return; }
  if (e.target.closest("[data-ob]")) { opClick(e); return; }
  const b = e.target.closest("[data-mcb]"); if (b) modesAct(b.dataset.mcb);
});
$("newsBody").addEventListener("keydown", e => { if (NEWS_SET === "modes" && e.key === "Enter") { const r = e.target.closest && e.target.closest("[data-cbt0]"); if (r && !e.target.closest("[data-cbdel]")) { $("news").style.display = "none"; cbPastOpen(r.dataset.cbt0); } } });
TICK.add(modesPanel);
modesPanel();
// ------------------------------------------------------------ v0.93 GRAVITAS for EDMC (the Plugin button in the Sync card)
var PLUGIN_TABS = {
  "GRAVITAS for EDMC": () => `<div class="q">GRAVITAS FOR EDMC</div><p><span class="plSt">IN TESTING</span> Not released yet.</p>
    <p>A plugin for <b>E:D Market Connector</b> (EDMC) that shows Combat Mode on top of the game, for CMDRs who play on one screen. Each window (targets by value, kill feed, this fight and more) can be switched on or off, moved and coloured from the plugin's settings in EDMC. By default in the game's orange.</p>
    <div class="q">ON YOUR COMPUTER ONLY</div><p>The plugin reads the Journal that EDMC already reads, and works out the fight on your computer. It sends nothing anywhere and needs no browser: GRAVITAS does not have to be open. It runs the same Combat Mode code as this site, so the numbers are the same.</p>
    <div class="q">WHAT IT NEEDS</div><ul><li><a href="https://github.com/EDCD/EDMarketConnector" target="_blank" rel="noopener">E:D Market Connector</a> on Windows</li><li><b>EDMCModernOverlay</b>, the plugin that draws on top of the game (in fullscreen too)</li></ul>
    <div class="q">PLANNED</div><p>Combat Mode first. Then Thargoid Mode and a Route Mode (the next jump, star class, fuel), each one switched on or off in the plugin.</p>
    <p class="note">It will be free and open, under the MIT licence, like GRAVITAS. When it is ready, the download and the steps to install it will be here.</p>`,
};
