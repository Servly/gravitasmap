// ------------------------------------------------------------ v0.92.4 GRAVITAS MODES
// One panel on the left, between Bodies and Sync, for everything about fights: Combat Mode now, Thargoid and On Foot
// later. Each mode opens in the About window's frame, with its own tab. The panel's last line shows what is live
// (a fight, a team board) and opens it. Before, these buttons sat in the Sync card and the board floated over the map.
var MODES = { tab: "Combat", html: "", live: "", st: "" };
const mBtn = (a, label, cls) => `<button type="button" ${a}${cls ? ` class="${cls}"` : ""}>${label}</button>`;
// the live part of the Combat tab: what you can open right now
function modesCbHTML() {
  const sy = typeof SYNC !== "undefined" && SYNC.on, rem = sy && SYNC.remote, V = typeof cbLiveView === "function" ? cbLiveView() : null;
  const n = (typeof cbHistory === "function" ? cbHistory() : []).length;
  const st = CB.on ? (CB.soft ? `<b class="mHot soft">● HOSTILES NEAR</b> no fire yet` : `<b class="mHot">● IN COMBAT</b> ${V && V.ep ? V.ep.n : 0} kills`)
    : CB.report ? "Your last fight's report is ready." : sy ? `<b class="mOk">● READY</b> Combat Mode starts by itself when a fight starts.` : "Turn on <b>Sync with the game</b> (the panel below) to use Combat Mode.";
  const b = [];
  if (CB.on || CB.report) b.push(mBtn(`data-mcb="open"`, CB.on ? "Open the combat screen" : "Open the report", "pri"));
  b.push(mBtn(`data-cbhist`, `Past combats${n ? ` (${n})` : ""}`));
  if (typeof OP !== "undefined" && OP.id) b.push(mBtn(`data-mcb="board"`, `Team board · ${opCount()}`));
  else if (sy && !rem) b.push(mBtn(`data-opnew`, "Start a team board"));
  return `<p class="mSt">${st}</p><div class="mBtns">${b.join("")}</div>`;
}
const MODES_TABS = {
  "Combat": () => `<div class="q">GRAVITAS: COMBAT MODE</div><div id="mCb">${modesCbHTML()}</div>
    <div class="q">WHEN IT OPENS</div><p>By itself, when a fight starts: when you are attacked, when you destroy a ship, when your shields or hull take damage, when you are interdicted, or when the game's combat music starts. If a ship only scans you, or you lock a wanted ship, a small <b>HOSTILES NEAR</b> chip lights up at the top and the map stays as it is. Click <b>Map</b> on the combat screen to go back to the map. The chip at the top brings the screen back.</p>
    <div class="q">WHAT IT SHOWS</div><p>The ships you scanned, by value (their bounty), or in your own ship order. Your kills and credits, the attacks on you, your shields and hull, the active Operation and its phase. After the fight: a report you can copy as text or as an image for Discord. The last 30 reports stay in this browser under <b>Past combats</b>.</p>
    <div class="q">TEAM BOARD</div><p>One link, everyone's fight on one screen. Each CMDR opens the link on the computer where they play, with Sync on, and adds their own totals from their own game: CMDR name, ship, kills, credits, top kill. Anyone with the link can watch, so share it only with your team. GRAVITAS's server keeps nothing: a row lives only on that CMDR's open connection.</p>
    <div class="q">HOW IT WORKS</div><p>Combat Mode reads only your game's Journal and Status.json, in your browser, the same files as Sync. Nothing is uploaded. The game does not list the ships around you, so "seen" and some totals are estimates, and the screen says so. A shared kill counts for everyone who hit it, as in the game.</p>`,
  "Thargoid": () => `<div class="q">GRAVITAS: THARGOID MODE</div><p class="note">Planned. Not started yet.</p>
    <p>A mode of its own for fights with Thargoids. Combat Mode comes first: once it is stable, Thargoid Mode starts from the same base.</p>
    <p>Ideas are welcome. <button class="repOpen">Report a problem or an idea</button></p>`,
  "On Foot": () => `<div class="q">GRAVITAS: ON FOOT MODE</div><p class="note">Planned. Not started yet.</p>
    <p>A mode of its own for missions on foot, such as a map of the settlement you are in. An idea from CMDR Cyanidex.</p>
    <p>Ideas are welcome. <button class="repOpen">Report a problem or an idea</button></p>`,
};
// the panel's own lines
function modesPanel() {
  const el = $("modes"); if (!el) return;
  const sy = typeof SYNC !== "undefined" && SYNC.on, V = CB.on && typeof cbLiveView === "function" ? cbLiveView() : null, L = [];
  if (CB.on) L.push(CB.soft ? `<button type="button" data-mcb="open" class="mHot soft">● HOSTILES NEAR <span>no fire yet</span></button>` : `<button type="button" data-mcb="open" class="mHot">● IN COMBAT <span>${V && V.ep ? V.ep.n : 0} kills</span></button>`);
  if (typeof OP !== "undefined" && OP.id) L.push(`<button type="button" data-mcb="board" class="mOp">● TEAM BOARD <span>${opCount()}</span></button>`);
  const live = L.join(""), st = sy ? "" : "needs Sync";
  if (live !== MODES.live) { MODES.live = live; $("modesLive").innerHTML = live; $("modesLive").style.display = live ? "flex" : "none"; if (typeof layoutLeft === "function") layoutLeft(); }
  if (st !== MODES.st) { MODES.st = st; $("modesSt").textContent = st; }
  el.classList.toggle("hot", CB.on && !CB.soft);
  // the Combat tab, while it is open: only its live part is redrawn
  const box = $("news"), cb = document.getElementById("mCb");
  if (cb && box.style.display === "flex" && NEWS_SET === "modes") { const h = modesCbHTML(); if (h !== MODES.html) { MODES.html = h; cb.innerHTML = h; } }
}
function modesAct(a) {
  if (a === "open") { if (CB.on || CB.report) { CB.hist = false; CB.past = null; CB.full = true; cbRender(); } }
  else if (a === "board") { OP.show = true; opRender(); }
}
$("modes").addEventListener("click", e => {
  const m = e.target.closest("[data-mode]"); if (m) { openNews(m.dataset.mode, "modes"); return; }
  const b = e.target.closest("[data-mcb]"); if (b) modesAct(b.dataset.mcb);
});
// a button in the Combat tab opens its screen: the window closes first (Past combats and Team board have their own handlers)
$("newsBody").addEventListener("click", e => {
  if (NEWS_SET !== "modes") return;
  const b = e.target.closest("[data-mcb], [data-cbhist], [data-opnew]"); if (!b) return;
  $("news").style.display = "none"; if (b.dataset.mcb) modesAct(b.dataset.mcb);
});
TICK.add(modesPanel);
modesPanel();
