// ------------------------------------------------------------ v0.70 Sync with the game
// The browser reads the game's Journal files from the folder the player chooses (Chrome and Edge only).
// Nothing is uploaded or stored: only the lines that say where the ship is are read, and only the system's name
// is sent, the same way a search does. All system data still comes from Spansh.
const SYNC = {
  ok: typeof window.showDirectoryPicker === "function" && window.isSecureContext,
  on: false, dir: null, file: null, fname: "", pos: 0, rest: "", timer: 0, scanT: 0, busy: false,
  here: "", at: null, jumping: "", pend: null, miss: "", missN: 0, missT: 0, auto: true, err: 0,
};
const SYNC_LINKED = new URLSearchParams(location.search).has("system");   // v0.75.6: read at once (the page rewrites its address later)
const SYNC_ARRIVE_MS = 60000;                                         // v0.76: how long the arrival star keeps "You are here"
const SYNC_PATH = "%USERPROFILE%\\Saved Games\\Frontier Developments\\Elite Dangerous";
const SYNC_EV = /"event":"(Shutdown|LoadGame|Location|FSDJump|CarrierJump|StartJump|ApproachBody|SupercruiseExit|Touchdown|Docked|LeaveBody|Undocked|ApproachSettlement|Liftoff|Disembark|Embark|NavRoute|NavRouteClear|Loadout|CarrierLocation|CarrierJumpRequest|CarrierJumpCancelled|CarrierStats|Music|ShipTargeted|UnderAttack|Bounty|FactionKillBond|CapShipBond|HeatWarning|HeatDamage|ShieldState|HullDamage|Interdicted|Interdiction|EscapeInterdiction|Died|Resurrect|GameModeChange|WingJoin|WingAdd|WingLeave|SupercruiseDestinationDrop|FighterDestroyed|LaunchFighter|SupercruiseEntry|Missions|Statistics|ReceiveText|CommitCrime|Rank|Progress)"/;   // v0.91: and the fight   // v0.78: the route and the jump range too
try { SYNC.auto = localStorage.getItem("gravitas.sync.auto") !== "0"; } catch (e) {}

// the folder handle is kept in this browser's own storage (IndexedDB), so the folder is chosen only once
function syncDB(mode, fn) {
  return new Promise((ok, no) => {
    const r = indexedDB.open("gravitas", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("sync");
    r.onerror = () => no(r.error);
    r.onsuccess = () => { let tx, q; try { tx = r.result.transaction("sync", mode); q = fn(tx.objectStore("sync")); } catch (e) { r.result.close(); return no(e); } tx.oncomplete = () => { ok(q && q.result); r.result.close(); }; tx.onerror = () => no(tx.error); };
  });
}
const syncSaveDir = h => syncDB("readwrite", s => s.put(h, "dir")).catch(() => {});
const syncLoadDir = () => syncDB("readonly", s => s.get("dir")).catch(() => null);
const syncLS = (k, v) => { try { if (v === undefined) return localStorage.getItem("gravitas.sync." + k); localStorage.setItem("gravitas.sync." + k, v); } catch (e) { return null; } };

// ---- the panel
function syncShow() {
  const p = $("sync"); if (!p) return;
  const rem = !!SYNC.remote;                                         // v0.76: following another computer (Sync with GRAVITAS)
  p.dataset.st = rem ? "on" : !SYNC.ok ? "nosup" : SYNC.on ? "on" : "off";
  p.classList.toggle("remote", rem);
  const ttl = p.querySelector(".srow b"); if (ttl) ttl.textContent = rem ? "SYNC WITH GRAVITAS" : "SYNC WITH THE GAME";
  const sw = $("syncSw"); sw.setAttribute("aria-checked", SYNC.on ? "true" : "false");
  $("syncSt").textContent = rem ? "on" : !SYNC.ok ? "needs Chrome or Edge" : SYNC.on ? "on" : "off";
  $("syncAuto").checked = SYNC.auto;
  let msg = "", go = false;
  if (SYNC.on) {
    if (SYNC.jumping) msg = `Jumping to <b>${esc(SYNC.jumping)}</b>…`;
    else if (SYNC.miss) msg = `<b>${esc(SYNC.miss)}</b> is not in Spansh yet. Trying again soon.`;
    else if (SYNC.pend) { msg = `You are in <b>${esc(SYNC.pend)}</b>`; go = true; }
    else if (SYNC.here && SYNC.closed) msg = `Last seen in <b>${esc(SYNC.here)}</b> · the game is closed`;
    else if (rem && !PAIR.ws) msg = "Connecting to your computer…";
    else if (rem && PAIR.miss >= 2) msg = SYNC.here ? `Last seen in <b>${esc(SYNC.here)}</b> · checking with your computer…` : "Checking with your computer…";   // v0.82
    else if (rem && !PAIR.hostOn) msg = SYNC.here ? `Last seen in <b>${esc(SYNC.here)}</b> · your computer is not sharing right now` : "Waiting for your computer…";
    else if (SYNC.here && rem) msg = PFULL ? `<b>${esc(SYNC.here)}</b> <span class="via">· ${pairHow()}</span>` : "";   // v0.78: the card says it on a computer
    else if (SYNC.here) msg = "";
    else msg = rem ? "Waiting for your computer…" : "Waiting for the game…";
  } else if (SYNC.paused) msg = SYNC.ask ? "Click the switch to resume. When Chrome asks, choose <b>Allow on every visit</b> and Sync starts by itself next time." : "Click the switch to resume.";
  $("syncMsg").innerHTML = msg; $("syncGo").style.display = go ? "" : "none";
  yahUpdate();
  p.classList.toggle("ping", go);
  if (PAIR_ON) pairUi();                                             // v0.76: the 📱 Phone button follows Sync's state
  if (PFULL) pfullSync();                                            // v0.77.2: the Sync window on phones
  syncUi();                                                          // v0.78: the light, the ship card, the route
  if (typeof layoutLeft === "function") layoutLeft();
}
function syncToggle() {
  if (SYNC.remote) { pairLeave(); return; }                           // v0.76: stop following the other computer
  if (!SYNC.ok) { const i = document.querySelector("#sync .pjoin input"); if (i) { i.focus(); toast("Sync with the game needs Chrome or Edge on a computer. To follow one, type the code it shows under Devices."); } else toast("Sync with the game needs Chrome or Edge on a computer."); return; }
  if (SYNC.on) { syncStop(); syncLS("on", "0"); return; }
  syncStartFlow(false);
}
async function syncStartFlow(change) {
  // with a remembered answer and a folder chosen before, starting only asks the browser for permission again
  if (!change && syncLS("consent") === "1") {
    const h = SYNC.dir || await syncLoadDir();
    if (h) { try { if (await h.requestPermission({ mode: "read" }) === "granted") return syncStart(h, true); } catch (e) {} }
  }
  syncDialog(change);
}
function syncDialog(change) {
  let d = $("syncDlg");
  if (!d) {
    d = document.createElement("div"); d.id = "syncDlg"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-label", "Sync with the game");
    d.innerHTML = `<div class="box"><div class="hd"><h3>SYNC WITH THE GAME</h3><button class="x" title="Close (Esc)">✕</button></div><div class="bd">
      <p>GRAVITAS will follow you: when you jump to a new system in Elite Dangerous, the map jumps with you.</p>
      <p>You choose your game's Journal folder once. Your browser reads the lines that say where you are or where you jump to, your position on a planet, which game panel is open, your current target and, for Combat Mode, your fights. GRAVITAS does not upload or store your journal files, and keeps no log of them. Only the system's name is sent, the same as typing it into the search box. All system data still comes from Spansh. ${GH_ON ? `<a href="${GH_PRIV}" target="_blank" rel="noopener">Check it yourself in the code</a>.` : "How to check it yourself: About GRAVITAS, Privacy tab."}</p>
      <div class="path"><span>Journal folder on Windows</span><code>${esc(SYNC_PATH)}</code><button class="cp" title="Copy the folder path">Copy</button></div>
      <p class="note">Copy this path and paste it into the address bar of the folder window. If you moved the folder (OneDrive, Linux or Proton), choose the folder where your Journal files are.</p>
      <label class="ck"><input type="checkbox" class="agree"> I understand and agree</label>
      <label class="ck"><input type="checkbox" class="rem"> Remember my answer</label>
      <p class="warn" style="display:none"></p>
      <div class="act"><button class="pick" disabled>Choose Journal folder and start</button><button class="no">Cancel</button></div></div></div>`;
    document.body.appendChild(d);
    const close = () => { d.style.display = "none"; };
    d.querySelector(".x").onclick = close; d.querySelector(".no").onclick = close;
    d.addEventListener("click", e => { if (e.target === d) close(); });
    addEventListener("keydown", e => { if (e.key === "Escape" && d.style.display === "flex") close(); });
    d.querySelector(".agree").onchange = e => { d.querySelector(".pick").disabled = !e.target.checked; };
    d.querySelector(".cp").onclick = async () => { try { await navigator.clipboard.writeText(SYNC_PATH); toast("Folder path copied"); } catch (e) { prompt("Copy this path:", SYNC_PATH); } };
    d.querySelector(".pick").onclick = async () => {
      const warn = d.querySelector(".warn"); warn.style.display = "none";
      let h; try { h = await window.showDirectoryPicker({ id: "gravitas-journal", mode: "read", startIn: "documents" }); } catch (e) { return; }   // cancelled
      if (!await syncHasJournal(h)) { warn.textContent = "This folder has no Journal files. Choose the folder shown above, where files named Journal….log are."; warn.style.display = "block"; return; }
      syncLS("consent", d.querySelector(".rem").checked ? "1" : "0");
      close(); syncSaveDir(h); syncStart(h, true);
    };
  }
  d.querySelector(".agree").checked = syncLS("consent") === "1"; d.querySelector(".rem").checked = syncLS("consent") === "1";
  d.querySelector(".pick").disabled = !d.querySelector(".agree").checked; d.querySelector(".warn").style.display = "none";
  d.style.display = "flex";
}
async function syncHasJournal(h) {
  try { for await (const [name, e] of h.entries()) if (e.kind === "file" && /^Journal\..+\.log$/i.test(name)) return true; } catch (e) {}
  return false;
}
// the newest Journal file: today's names carry the date (Journal.2026-10-16T183605.01.log), older ones only digits
async function syncNewest(h) {
  let best = null, bestName = "", old = [];
  for await (const [name, e] of h.entries()) {
    if (e.kind !== "file") continue;
    if (/^Journal\.\d{4}-\d\d-\d\dT\d{6}\.\d\d\.log$/.test(name)) { if (name > bestName) { bestName = name; best = e; } }
    else if (/^Journal\..+\.log$/i.test(name)) old.push(e);
  }
  if (!best && old.length) {                                       // only old-style names: ask the files for their dates
    let t = -1; for (const e of old) { try { const f = await e.getFile(); if (f.lastModified > t) { t = f.lastModified; best = e; bestName = e.name; } } catch (x) {} }
  }
  return best;
}
// v0.78.6: Sync's one-second clock comes from a small worker (assets/tick.js). With the game in front, the browser counts
// the GRAVITAS tab as hidden, and after a few minutes it runs a hidden page's own timers only about once a minute: the
// Journal was read late, the phone heard nothing for a minute and the link was dropped and rebuilt again and again
// ("Last seen in…", "Connecting…"). A worker's clock keeps its pace. Without workers, a plain timer is the fallback
var TICK = (() => {
  const fns = new Set(); let w = null, iv = 0;
  const run = () => { for (const f of [...fns]) try { f(); } catch (e) {} };
  const fallback = () => { if (!iv) iv = setInterval(run, 1000); };
  try { w = new Worker("assets/tick.js"); w.onmessage = run; w.onerror = () => { try { w.terminate(); } catch (e) {} w = null; fallback(); }; } catch (e) { w = null; }
  if (!w) fallback();
  return { add: f => fns.add(f), del: f => fns.delete(f), get worker() { return !!w && !iv; } };
})();
async function syncStart(h, byClick) {
  SYNC.byClick = !!byClick; SYNC.ask = false; SYNC.closed = false; SYNC.dir = h; SYNC.on = true; SYNC.paused = false; SYNC.file = null; SYNC.fname = ""; SYNC.here = ""; SYNC.at = null; SYNC.jumping = ""; SYNC.pend = null; SYNC.miss = "";
  syncLS("on", "1"); syncShow();
  await syncScan(true);
  TICK.del(syncTick); TICK.add(syncTick);
}
function syncStop() { SYNC.on = false; TICK.del(syncTick); SYNC.jumping = ""; SYNC.pend = null; SYNC.miss = ""; syncShow(); }

// ---- reading the journal: only the new bytes, about once a second
async function syncScan(first) {
  SYNC.scanT = performance.now();
  let e; try { e = await syncNewest(SYNC.dir); } catch (x) { return syncLost(); }
  if (!e) return;
  if (e.name === SYNC.fname) return;
  const isNew = !!SYNC.fname; SYNC.file = e; SYNC.fname = e.name; SYNC.rest = "";
  if (isNew && !first && SYNC.closed) { SYNC.closed = false; syncShow(); }   // a new journal: the game has started again
  let f; try { f = await e.getFile(); } catch (x) { return; }
  if (isNew && !first) { SYNC.pos = 0; return; }                   // the game started a new journal: read it from the top
  // first look: the end of the newest journal tells where the ship is now. Read back in pieces until a location is found
  SYNC.pos = f.size; let end = f.size, size = 512 * 1024;
  while (end > 0) {
    const from = Math.max(0, end - size); let txt = "";
    try { txt = await f.slice(from, end).text(); } catch (x) { return; }
    const lines = txt.split("\n"); if (from > 0) { const cut = lines.shift(); end = from + new Blob([cut]).size; } else end = 0;
    const loc = lines.reduce((k, ln, i) => /"event":"(Location|FSDJump|CarrierJump)"/.test(ln) ? i : k, -1);
    if (loc >= 0) {
      const lo = lines.reduce((k, ln, i) => i < loc && /"event":"Loadout"/.test(ln) ? i : k, -1); if (lo >= 0) syncLine(lines[lo], true);   // v0.78: the jump range
      for (const ln of lines.slice(loc)) syncLine(ln, true); break;
    }
    size = Math.min(size * 4, 16 * 1024 * 1024);
  }
  syncArrive(true);
  syncRouteRead(true);
  fcScanFile(f);                                                     // v0.90.7: your carriers, from the whole file
}
function syncLost() { SYNC.err++; if (SYNC.err > 5) { syncStop(); SYNC.paused = true; syncShow(); toast("Sync paused: the Journal folder can no longer be read."); } }
async function syncTick() {
  if (!SYNC.on || SYNC.busy) return;
  if (SYNC.at && SYNC.at.arrived && !YAH.away && Date.now() - SYNC.at.arrived > SYNC_ARRIVE_MS) yahUpdate();   // v0.76: the arrival minute is over
  SYNC.busy = true;
  try {
    if (!SYNC.file || performance.now() - SYNC.scanT > 15000) await syncScan(false);
    if (!SYNC.file) return;
    let f; try { f = await SYNC.file.getFile(); } catch (x) { return syncLost(); }
    SYNC.err = 0;
    if (f.size < SYNC.pos) SYNC.pos = 0;
    if (f.size > SYNC.pos) {
      let txt; try { txt = await f.slice(SYNC.pos, Math.min(f.size, SYNC.pos + 1024 * 1024)).text(); } catch (x) { return; }   // the game was writing: next second
      const end = Math.min(f.size, SYNC.pos + 1024 * 1024); SYNC.pos = end;
      const lines = (SYNC.rest + txt).split("\n"); SYNC.rest = lines.pop();
      for (const ln of lines) syncLine(ln, false);
    }
    if (SYNC.miss && performance.now() > SYNC.missT) syncFollow(SYNC.miss, true);
    // v0.90.8: following the ship, the map must show the ship's system. If something else is on screen that the visitor did
    // not open themselves (a late answer, a reload from an old link), the ship's system is opened again
    else if (SYNC.auto && SYNC.here && !SYNC.loading && !SYNC.miss && S && !syncViewing() && LOAD.by !== "user") {
      if (!SYNC.driftT) SYNC.driftT = performance.now(); else if (performance.now() - SYNC.driftT > 3000) { SYNC.driftT = 0; syncFollow(SYNC.here, false); }
    } else SYNC.driftT = 0;
    await syncStatus();
    if (performance.now() - (SYNC.routeT || 0) > 10000) await syncRouteRead(false);   // v0.78: the plotted route (NavRoute.json)
  } finally { SYNC.busy = false; }
}
// v0.72: Status.json, which the game rewrites several times a second, holds the live latitude and longitude near a
// planet's surface (flying low, landed, in the SRV, on foot). Read once a second, kept nowhere
async function syncStatus() {
  try {
    if (!SYNC.stH) SYNC.stH = await SYNC.dir.getFileHandle("Status.json");
    syncStatusApply(JSON.parse(await (await SYNC.stH.getFile()).text()));
  } catch (e) { SYNC.stH = null; if (SYNC.live) { SYNC.live = null; SYNC.liveK = ""; yahUpdate(); } }
}
// v0.78: the route the player plotted in the galaxy map. The game writes it to NavRoute.json in the same folder:
// each stop's name, star class and position. Read again only when the file changed, kept nowhere
async function syncRouteRead(force) {
  SYNC.routeT = performance.now();
  if (!SYNC.dir) return;
  try {
    if (!SYNC.rtH) SYNC.rtH = await SYNC.dir.getFileHandle("NavRoute.json");
    const f = await SYNC.rtH.getFile(); if (!force && f.lastModified === SYNC.routeM) return;
    SYNC.routeM = f.lastModified;
    const j = JSON.parse(await f.text());
    SYNC.route = (Array.isArray(j.Route) ? j.Route : []).filter(r => r && r.StarSystem && Array.isArray(r.StarPos)).slice(0, 500)
      .map(r => ({ n: String(r.StarSystem).slice(0, 80), c: String(r.StarClass || "").slice(0, 6), p: r.StarPos.map(Number) }));
  } catch (e) { SYNC.rtH = null; if (SYNC.route && SYNC.route.length) { SYNC.route = []; syncShow(); } return; }
  syncShow();
}
// v0.75: shared by the browser's own reading and the GRAVITAS Overlay app, which sends Status.json itself
function syncStatusApply(j) {
  try { cbStatus(j); } catch (e) {}                                   // v0.91: pips, shields, heat for Combat Mode
  {
    const F = j.Flags || 0, F2 = j.Flags2 || 0;
    const live = j.Latitude != null && j.Longitude != null && j.BodyName ? { lat: j.Latitude, lon: j.Longitude, body: j.BodyName,
      foot: !!(F2 & 16), srv: !!(F & 67108864), landed: !!(F & 2), alt: j.Altitude } : null;
    const k = live ? [live.body, live.lat.toFixed(4), live.lon.toFixed(4), live.foot, live.srv, live.landed].join("|") : "";
    if (k !== SYNC.liveK) { SYNC.liveK = k; SYNC.live = live; SYNC.newsT = Date.now(); yahUpdate(); }
    const sc = !!(F & 16);                                           // v0.76: supercruise
    if (sc !== SYNC.sc) { SYNC.sc = sc; SYNC.newsT = Date.now(); yahUpdate(); syncShow(); }
    // v0.74: which game panel is open (GuiFocus: 2 is the left panel the 1 key opens) and the ship's current target
    const d = j.Destination ? Object.assign({}, j.Destination, { Name: jl(j.Destination, "Name") }) : null, dk = d ? `${d.System}|${d.Body}|${d.Name || ""}` : "";   // v0.91.7: readable names
    if (j.GuiFocus !== SYNC.gui || dk !== SYNC.destK) { const ch = dk !== SYNC.destK; SYNC.gui = j.GuiFocus ?? 0; SYNC.destK = dk; SYNC.dest = d || null; if (ch) { SYNC.newsT = Date.now(); tgtUpdate(); } }   // v0.82.4: the target marker
  }
}
// one journal line: only a few events matter, the rest is skipped without being parsed
// v0.91.7: the game's own codes for Operation places ("$Operations_Runner_Name:#index=1;") have a readable name beside them
// (StationName_Localised: "Frontline Runner"); a code with none is tidied rather than shown raw
function jl(j, k) {
  const v = j[k + "_Localised"] || j[k]; if (typeof v !== "string" || !/^\$/.test(v)) return v;
  return v.replace(/^\$/, "").replace(/:#.*$|;$/g, "").replace(/_Name$/, "").replace(/^Operations_/, "").replace(/_/g, " ").trim() || v;
}
function syncLine(ln, replay) {
  if (!SYNC_EV.test(ln)) return;
  let j; try { j = JSON.parse(ln); } catch (e) { return; }
  const ev = j.event;
  if (CB_EV.test(ev)) try { cbEvent(j, replay); } catch (e) {}           // v0.91: Combat Mode
  if (/^(Music|ShipTargeted|UnderAttack|Bounty|FactionKillBond|CapShipBond|HeatWarning|HeatDamage|ShieldState|HullDamage|Interdicted|Interdiction|EscapeInterdiction|Died|Resurrect|GameModeChange|WingJoin|WingAdd|WingLeave|SupercruiseDestinationDrop|FighterDestroyed|LaunchFighter|SupercruiseEntry|Missions|Statistics|ReceiveText|CommitCrime|Rank|Progress)$/.test(ev)) return;   // nothing else to do with these
  SYNC.newsT = replay ? Date.parse(j.timestamp) || SYNC.newsT || 0 : Date.now();   // v0.78: "updated … ago"
  if (/^Carrier(Location|JumpRequest|JumpCancelled|Stats)$/.test(ev)) { fcEvent(j, replay); return; }   // v0.90.7: your carriers
  if (ev === "CarrierJump" || ev === "Docked" || ev === "Location") fcEvent(j, replay);
  if (ev === "Loadout") { if (j.MaxJumpRange > 0) { SYNC.range = +j.MaxJumpRange; if (!replay) syncShow(); } return; }
  if (ev === "NavRoute") { syncRouteRead(true); return; }
  if (ev === "NavRouteClear") { SYNC.route = []; SYNC.routeM = 0; if (!replay) syncShow(); return; }
  // v0.75.7: the game writes Shutdown when it closes: the panel then says where the ship was last seen
  if (ev === "Shutdown") { SYNC.closed = true; if (!replay) syncShow(); return; }
  if (SYNC.closed) { SYNC.closed = false; if (!replay) syncShow(); }
  if (ev === "LoadGame") return;
  if (ev === "StartJump") {
    if (j.JumpType !== "Hyperspace" || !j.StarSystem) return;
    if (replay) return;
    SYNC.jumping = j.StarSystem; syncShow(); syncJumpFx();
    syncPrefetch(j.StarSystem);                                    // the jump tunnel takes ~15 s: ask Spansh now
    return;
  }
  if (ev === "Location" || ev === "FSDJump" || ev === "CarrierJump") {
    if (!j.StarSystem) return;
    const moved = j.StarSystem !== SYNC.here;
    SYNC.prev = SYNC.here; SYNC.here = j.StarSystem; SYNC.jumping = "";
    const onBody = j.BodyID != null && (j.BodyType === "Planet" || j.BodyType === "Star" || (ev !== "FSDJump" && !j.BodyType));
    SYNC.at = j.Docked && j.MarketID ? { market: j.MarketID, name: jl(j, "StationName"), docked: true, bodyId: onBody ? j.BodyID : undefined }
      : onBody ? { bodyId: j.BodyID, name: j.Body, landed: j.Latitude != null && !j.OnFoot, foot: !!j.OnFoot, lat: j.Latitude, lon: j.Longitude } : null;
    // v0.76: a jump names the arrival star, but the ship flies on in supercruise and the journal says nothing more until it
    // nears a body. The star is "where you are" only for the first moments after the jump
    if (ev === "FSDJump" && SYNC.at && !SYNC.at.docked) SYNC.at.arrived = replay ? Date.parse(j.timestamp) || Date.now() : Date.now();
    if (!replay && (moved || ev === "Location")) syncArrive(false);
    return;
  }
  if (j.StarSystem && SYNC.here && j.StarSystem !== SYNC.here) return;
  const a = SYNC.at || {};
  if (ev === "LeaveBody") SYNC.at = null;
  else if (ev === "ApproachBody") SYNC.at = { bodyId: j.BodyID, name: j.Body };
  else if (ev === "SupercruiseExit") {                     // dropped at a body, or at a station (then Body is the station's name)
    if (j.BodyType === "Station") SYNC.at = { market: j.MarketID, name: jl(j, "Body"), near: true, bodyId: a.bodyId };
    else if (j.BodyID != null) SYNC.at = { bodyId: j.BodyID, name: j.Body };
  }
  else if (ev === "ApproachSettlement") SYNC.at = { bodyId: j.BodyID, market: j.MarketID, name: jl(j, "Name"), near: true, lat: j.Latitude, lon: j.Longitude };
  else if (ev === "Touchdown") SYNC.at = { ...a, bodyId: j.BodyID ?? a.bodyId, landed: true, near: false, lat: j.Latitude, lon: j.Longitude };
  else if (ev === "Liftoff") SYNC.at = { ...a, landed: false };
  else if (ev === "Docked") SYNC.at = { market: j.MarketID, name: jl(j, "StationName"), docked: true, bodyId: a.bodyId };
  else if (ev === "Undocked") SYNC.at = { ...a, docked: false, near: true };
  else if (ev === "Disembark") SYNC.at = { ...a, foot: true, srv: false, bodyId: j.BodyID ?? a.bodyId, ...(j.OnStation && j.MarketID ? { market: j.MarketID, name: jl(j, "StationName") } : {}) };
  else if (ev === "Embark") SYNC.at = { ...a, foot: false, srv: !!j.SRV };
  else return;
  if (!replay) syncBody();
}
const syncSame = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const syncViewing = () => !!(S && syncSame(S.sys.name, SYNC.here));
// arrived in a system: follow when the visitor was looking at their own system (or at nothing yet), else tell them
function syncArrive(first) {
  if (!SYNC.here) return syncShow();
  if (syncViewing()) { SYNC.pend = null; if (S) { SYNC.shown = S.sys.name; syncLS("last", S.sys.name); } syncShow(); syncBody(); return; }
  // v0.75.6: resumed by itself on a page that no link pointed elsewhere: follow the ship, like a click on the switch
  const own = !S || (first && (SYNC.byClick || SYNC.resume)) || syncSame(S.sys.name, SYNC.prev) || syncSame(S.sys.name, SYNC.shown);   // turned on just now, or was looking at their own system
  if (SYNC.auto && own) syncFollow(SYNC.here, false);
  else { SYNC.pend = SYNC.here; syncShow(); if (!first) toast(`Jumped to ${SYNC.here}`); }
}
function syncPrefetch(name) {
  if (!API) return;
  SYNC.pre = { name, req: typeof sysFetch === "function" ? sysFetch(name) : fetch(`${API}/system?name=${encodeURIComponent(name)}`).then(apiJSON) };   // v0.80: shared with the journey's own early fetch
  SYNC.pre.req.catch(() => {});
}
async function syncFollow(name, retry) {
  if (SYNC.loading === name) return;
  SYNC.loading = name; SYNC.pend = null; SYNC.miss = ""; syncShow();
  const pre = SYNC.pre && syncSame(SYNC.pre.name, name) ? SYNC.pre.req : null; SYNC.pre = null;
  let ok = false;
  try { ok = await loadSystem(name, { pre, sync: true }); } catch (e) {}
  SYNC.loading = "";
  if (ok === null) return syncShow();                                 // v0.90.8: a newer load took over
  if (ok) { SYNC.shown = S.sys.name; syncLS("last", S.sys.name); SYNC.miss = ""; SYNC.missN = 0; syncShow(); syncBody(); return; }
  if (!syncSame(name, SYNC.here)) return syncShow();
  SYNC.missN = retry ? SYNC.missN + 1 : 1;
  if (SYNC.missN <= 10) { SYNC.miss = name; SYNC.missT = performance.now() + 60000; if (retry) status(""); }   // not in Spansh yet: try again each minute for ten minutes
  else { SYNC.miss = ""; SYNC.pend = name; }
  syncShow();
}
// the body or station the ship is at: select it, only while the visitor is looking at their own system
// the body the ship is at (or beside, for a station), in the system on screen
// v0.73: where the ship is: a station (in orbit, a carrier, a megaship, or on a surface) or a body
function syncTarget() {
  const a = SYNC.at; if (!a || !syncViewing()) return null;
  const hit = st => st && (st.id === a.market || syncSame(st.name, a.name));
  if (a.market || a.docked || a.near || (a.foot && a.name)) {
    const b = S.bodies.find(x => (x.stations || []).some(hit));
    if (b) { const st = b.stations.find(hit); return { b, st, site: (S.surfSites || []).find(q => q.st === st), kind: "surface" }; }
    const o = (S.orbitals || []).find(o => hit(o.st)); if (o) return { b: o.body, st: o.st, o, kind: "orbital" };
    const c = (S.carriers || []).find(c => hit(c.st)); if (c) return { b: c.body, st: c.st, o: c, kind: "carrier" };
  }
  if (a.bodyId != null) { const b = S.byId && S.byId.get(a.bodyId); if (b) return { b }; }
  return null;
}
function syncAtBody() { const t = syncTarget(); return t && t.b && t.b._obj ? t.b : null; }
function syncBody() {
  yahUpdate();
  const a = SYNC.at; if (!a || !SYNC.auto || !syncViewing()) return;
  const b = syncAtBody();
  if (!b || b === selected) return;
  const key = (a.bodyId ?? a.market) + "|" + S.sys.name; if (key === SYNC.lastSel) return; SYNC.lastSel = key;
  try { select(b, !MAPMODE); } catch (e) {}
}

// ---- "You are here": a tag on the body's name in 3D, a marker over it on the system map, a chip by the system name
const YAH = { b: null, el: null, pin: null, pinB: null };
// what the ship (or the commander) is doing there, in a few words
function yahWhat(atStation) {
  const a = SYNC.at || {}, L = SYNC.live, n = a.name ? ` ${a.name}` : "";
  if (atStation) return L && L.foot || a.foot ? "On foot here" : a.docked ? "Docked here" : "Nearby";   // the station's own name is right below
  if (a.arrived && !L && !a.docked) return "Arrived here";
  if (L && L.foot || a.foot) return a.market && !(L && L.foot) ? `On foot at${n}` : "On foot";
  if (L && L.srv || a.srv) return "In the SRV";
  if (a.docked) return `Docked at${n}`;
  if (L && L.landed || a.landed) return "Landed";
  if (a.near && a.name) return `Near${n}`;
  if (L) return "Near the surface";
  return "";
}
function yahUpdate() {
  if (PFULL) queueMicrotask(pfullTitle);                            // v0.77: "● here" on the top bar
  const sys = SYNC.on && syncViewing(), L = sys ? SYNC.live : null;
  let t = SYNC.on ? syncTarget() : null;
  const lb = L && S && S.bodies.find(o => syncSame(o.name, L.body));
  // the live position names its body: trust it, unless aboard a station in orbit, or (v0.75.7) docked at a surface port on
  // that same body (the tag then points at the port's pin on the map, not at the middle of the body)
  if (lb && !(t && (t.o || (t.kind === "surface" && t.st && t.b === lb && SYNC.at && SYNC.at.docked)))) t = { b: lb };
  // v0.76: after a jump the arrival star holds the tag for a minute ("Arrived here"); then, still out in the system with no
  // body named, there is no pin, only "In supercruise" (or "In this system") beside the system's name
  const arr = SYNC.on && !lb && SYNC.at && SYNC.at.arrived && t && !t.st ? SYNC.at.arrived : 0;
  YAH.away = arr && Date.now() - arr > SYNC_ARRIVE_MS ? (SYNC.sc ? "In supercruise" : "In this system") : "";
  if (YAH.away) t = null;
  const b = t && t.b && t.b._obj ? t.b : null, o = t && t.o && t.o.obj && t.o.label ? t.o : null;
  // v0.82.4: where the ship was last seen in this system; with no exact place (out in supercruise), the tag says so there
  if (b && S && S.bodies.includes(b)) { YAH.lastB = b; YAH.lastSys = S.sys.name; }
  const ab = !b && sys && S && YAH.lastB && YAH.lastSys === S.sys.name && S.bodies.includes(YAH.lastB) && YAH.lastB._obj && (SYNC.sc || YAH.away) ? YAH.lastB : null;
  YAH.ab = ab; YAH.away2 = ab ? (SYNC.sc ? "In supercruise" : YAH.away || "In this system") : "";
  const stChanged = (YAH.t && YAH.t.st) !== (t && t.st);
  YAH.b = b; YAH.t = t; YAH.o = o;
  if (stChanged && MAPMODE && S && SMAP.built === S) try { smapBuild(true); } catch (e) {}
  const chip = $("yahSys"); if (chip) { chip.style.display = sys ? "" : "none";
    const aw = YAH.away || YAH.away2;                                  // v0.82.4: out in supercruise with no exact place too
    const dn = aw && SYNC.dest && SYNC.dest.Name && !/^\$/.test(SYNC.dest.Name) ? ` · heading to ${syncBodyName(SYNC.dest.Name)}` : "";
    const ct = aw ? `● ${aw}${dn}` : "● You are here"; if (chip.textContent !== ct) { chip.textContent = ct; chip.title = aw ? ct.slice(2) : "Sync with the game: your ship is in this system"; chip.classList.toggle("long", !!aw); } }
  // the tag sits on the station's own name when it has one in 3D, else on the body's name
  const holder = o ? o.label.element : b ? b._div : ab ? ab._div : null;
  let what = holder && !ab ? yahWhat(!!o) : "";
  if (!o && t && t.kind === "surface" && SYNC.at && SYNC.at.docked) what = `Docked at ${t.st.name} (on the surface)`;
  if (!o && t && (t.kind === "orbital" || t.kind === "carrier")) what += " · its position is not reported";
  const abn = ab ? shortName(ab, S.sys.name) : "";
  const html = ab ? `▼ ${YAH.away2}<em>last seen near ${esc(abn)} · exact place unknown</em>` : `▼ You are here${what ? `<em>${esc(what)}</em>` : ""}`;
  if (YAH.holder !== holder) {
    if (YAH.holder) { YAH.holder.classList.remove("yah"); const x = YAH.holder.querySelector(".yahTag"); if (x) x.remove(); }
    YAH.holder = holder;
    if (holder) { holder.classList.add("yah"); const x = document.createElement("span"); x.className = "yahTag"; (holder.firstElementChild || holder).prepend(x); }
  }
  if (holder) { const x = holder.querySelector(".yahTag"); if (x && x.innerHTML !== html) x.innerHTML = html; if (x) x.classList.toggle("approx", !!ab); }
  if (!YAH.el) { YAH.el = document.createElement("div"); YAH.el.id = "yahMap"; document.body.appendChild(YAH.el); }
  const mWhat = t && t.st ? (SYNC.at && SYNC.at.docked ? "Docked here" : SYNC.at && SYNC.at.foot ? "On foot here" : "Nearby") : what;
  const mh = ab ? `${YAH.away2}<em>last seen near ${esc(abn)}</em><i>▼</i>` : `You are here${mWhat ? `<em>${esc(mWhat)}</em>` : ""}<i>▼</i>`; if (YAH.el.innerHTML !== mh) YAH.el.innerHTML = mh;
  YAH.el.classList.toggle("approx", !!ab);
  if (!b && !ab) YAH.el.style.display = "none";
  tgtUpdate();
  // pin: the live position on a planet, else the landing spot, else a surface port's own spot
  const st = t && t.kind === "surface" && t.st && t.st.latitude != null ? { lat: t.st.latitude, lon: t.st.longitude } : null;
  yahPin(lb && !(t && t.o) ? L : SYNC.at && b && SYNC.at.lat != null && SYNC.at.bodyId === b.bodyId && !o ? SYNC.at : st, b);
}
// a green pin on the body at the live latitude and longitude (same placement as the surface stations)
function yahPin(p, b) {
  if (!p || !b || !b._mesh || p.lat == null) { if (YAH.pin) YAH.pin.visible = false; return; }
  if (!YAH.pin) {
    YAH.pin = new THREE.Sprite(new THREE.SpriteMaterial({ map: beaconTex(), color: 0x3ddc84, transparent: true, depthWrite: false, sizeAttenuation: false, blending: THREE.AdditiveBlending }));
    YAH.pin.renderOrder = 6;
  }
  if (YAH.pinB !== b) { YAH.pin.removeFromParent(); b._mesh.add(YAH.pin); YAH.pinB = b; }
  const la = p.lat * DEG, lo = p.lon * DEG;
  YAH.pin.position.set(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)).multiplyScalar(1.006);
  YAH.pin.visible = true; yahPinTick();
}
const _yahS = new THREE.Vector3();
function yahPinTick() {                             // keeps the pin the same size on screen, whatever the body's display scale
  const q = YAH.pin; if (!q || !q.visible || !YAH.pinB) return;
  YAH.pinB._mesh.getWorldScale(_yahS); q.scale.setScalar((1.2 + 0.25 * Math.sin(performance.now() / 400)) * 0.024 / (_yahS.x || 1));
}
// on the map the marker follows the body's circle (pan, zoom, orbit). Cheap: one rectangle read per frame, only while shown
function yahMapEl(root = document, t = YAH.t, b = YAH.b) {   // the map element to point at: the station's icon when there is one
  if (!b) return null;
  if (t && t.st) {
    const i = (SMAP.ports || []).findIndex(q => q.p.all.some(p => p.st === t.st));
    if (i >= 0) { const e = root.querySelector(`#smapSvg .smp[data-p="${i}"]`); if (e) return e; }
    const j = (SMAP.surf || []).findIndex(q => q.all.some(p => p.st === t.st));
    if (j >= 0) { const e = root.querySelector(`#smapSvg .sfm[data-sf="${j}"] .hit`); if (e) return e; }
  }
  return root.querySelector(`#smapSvg .smo[data-id="${b.bodyId}"]`);
}
function yahMapTick() {
  const el = YAH.el;
  if (!el) return;
  const g = MAPMODE && (YAH.b ? yahMapEl() : YAH.ab ? yahMapEl(document, null, YAH.ab) : null);
  tgtMapTick();
  if (!g) { if (el.style.display !== "none") el.style.display = "none"; return; }
  const r = g.getBoundingClientRect(), box = $("smap").getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top;
  if (x < box.left || x > box.right || y < box.top || y > box.bottom) { el.style.display = "none"; return; }
  el.style.display = "block"; el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y - 4)}px) translate(-50%, -100%)`;
}

// v0.82.4: the ship's current target in the game (Status.json Destination), in orange: under its body or station, pointing
// up, so it never covers You are here (always above, pointing down). Only a target in the system on screen
const TGT = { el: null, holder: null, t: null };
function tgtResolve() {
  const d = SYNC.dest; if (!d || !S || !syncViewing()) return null;
  if (d.System != null && S.sys.id64 != null && String(d.System) !== String(S.sys.id64)) return null;   // a target in another system: the next jump
  const nm = d.Name && !/^\$/.test(d.Name) ? d.Name : "", hit = st => st && nm && syncSame(st.name, nm);
  if (nm) {
    const o = (S.orbitals || []).find(o => hit(o.st)); if (o) return { b: o.body, st: o.st, o: o.obj && o.label ? o : null, name: nm };
    const c = (S.carriers || []).find(c => hit(c.st) || fcNameHit(c.st, nm)); if (c && c.body) return { b: c.body, st: c.st, o: c.obj && c.label ? c : null, name: c.st.name || nm };   // v0.90.7: by callsign or name
    const sb = S.bodies.find(x => (x.stations || []).some(hit)); if (sb) return { b: sb, st: sb.stations.find(hit), name: nm };
  }
  const b = d.Body != null && S.byId ? S.byId.get(+d.Body) : null;
  if (b && b._obj) return { b, name: shortName(b, S.sys.name) };
  return null;
}
function tgtUpdate() {
  const t = TGT.t = tgtResolve(), holder = t ? (t.o ? t.o.label.element : t.b._div) : null;
  if (TGT.holder !== holder) {
    if (TGT.holder) { const x = TGT.holder.querySelector(".tgtTag"); if (x) x.remove(); TGT.holder.classList.remove("tgt"); }
    TGT.holder = holder;
    if (holder) { holder.classList.add("tgt"); const x = document.createElement("span"); x.className = "tgtTag"; (holder.firstElementChild || holder).append(x); }
  }
  const html = t ? `<i>▲</i>Target${t.st ? `<em>${esc(t.st.name)}${/carrier/i.test(t.st.type || "") && t.b ? ` · ${t.b.type === "Star" ? "orbiting" : "near"} ${esc(shortName(t.b, S.sys.name).replace(/^★\s*/, ""))}` : ""}</em>` : ""}` : "";   // v0.90.8: a carrier says which body it parks at
  if (holder) { const x = holder.querySelector(".tgtTag"); if (x && x.innerHTML !== html) x.innerHTML = html; }
  if (!TGT.el) { TGT.el = document.createElement("div"); TGT.el.id = "tgtMap"; document.body.appendChild(TGT.el); }
  if (TGT.el.innerHTML !== html) TGT.el.innerHTML = html;
  if (!t) TGT.el.style.display = "none";
}
function tgtMapTick() {
  const el = TGT.el, t = TGT.t; if (!el) return;
  const g = MAPMODE && t ? yahMapEl(document, t.st ? t : null, t.b) : null;
  if (!g) { if (el.style.display !== "none") el.style.display = "none"; return; }
  const r = g.getBoundingClientRect(), box = $("smap").getBoundingClientRect(), x = r.left + r.width / 2, y = r.bottom;
  if (x < box.left || x > box.right || y < box.top || y > box.bottom) { el.style.display = "none"; return; }
  el.style.display = "block"; el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y + 4)}px) translate(-50%, 0)`;
}

// ---- wiring
{
  const p = $("sync");
  if (p) {
    $("syncSw").onclick = syncToggle;
    $("syncSw").title = SYNC.ok ? "GRAVITAS follows your jumps in Elite Dangerous" : "Sync with the game needs Chrome or Edge on a computer";
    $("syncGo").onclick = () => { if (SYNC.pend) syncFollow(SYNC.pend, false); };
    $("syncAuto").onchange = e => { SYNC.auto = e.target.checked; syncLS("auto", SYNC.auto ? "1" : "0"); if (SYNC.auto && SYNC.pend && !S) syncFollow(SYNC.pend, false); };
    $("syncDir").onclick = () => syncDialog(true);
    $("syncPlug").onclick = () => openNews("GRAVITAS for EDMC", "plugin");   // v0.93: Show me is on the map (Find me); here: the plugin
    syncShow();
    // last visit had it on: resume quietly when the browser still allows reading the folder, else wait for a click
    if (SYNC.ok && syncLS("on") === "1") syncLoadDir().then(async h => {
      if (!h) return;
      SYNC.dir = h;
      let st = "prompt"; try { st = await h.queryPermission({ mode: "read" }); } catch (e) {}
      SYNC.resume = !SYNC_LINKED;
      if (st === "granted") syncStart(h); else { SYNC.paused = true; SYNC.ask = true; syncShow(); }
    });
  }
}
// v0.79.9 Find me (the target button beside the zoom buttons, on the map and in 3D): straight to your ship, like a
// navigation app. On the map it glides and zooms in; in 3D it flies there. It needs Sync, on this computer or followed
function findMe() {
  if (!SYNC.on && !SYNC.remote) { toast("Find me shows your ship: turn on Sync with the game first (left side, or the Sync tab on a phone)."); return; }
  if (!syncViewing()) { if (SYNC.here && !SYNC.remote) syncFollow(SYNC.here, false); else toast(SYNC.here ? "Opening your ship's system…" : "Waiting for your ship's position…"); return; }
  const b = YAH.b || YAH.ab || syncAtBody() || (S && S.main); if (!b) return;   // v0.82.4: or where it was last seen
  try { Sound.click(); } catch (e) {}
  if (MAPMODE) { smapTipHide(); smapFlyTo(b); return; }
  const t = typeof PFULL_TAP !== "undefined" ? PFULL_TAP : 0; PFULL_TAP = 0;           // on a phone: fly there, without opening the Body window
  try { select(b, true); } catch (e) {} finally { PFULL_TAP = t; }
}
const FIND_ME_SVG = '<svg viewBox="0 0 16 16" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="4.2"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><path d="M8 1v2.4M8 12.6V15M1 8h2.4M12.6 8H15"/></svg>';
function findMeUi() {                                                  // lit when your ship is known, dim otherwise
  const on = !!(SYNC.on || SYNC.remote) && !!SYNC.here;
  for (const b of document.querySelectorAll(".findme")) { b.classList.toggle("live", on); b.title = on ? "Find me: go to your ship" : "Find me: turn on Sync with the game to see your ship"; }
}
function findMeButton() { const b = document.createElement("button"); b.className = "findme"; b.setAttribute("aria-label", "Find me: go to your ship"); b.innerHTML = FIND_ME_SVG; b.onclick = e => { e.stopPropagation(); findMe(); }; return b; }
// v0.82.4 Follow (the lock beside Find me): while locked, the view keeps your ship in sight. The map glides to it whenever
// it moves on (another body, a station, a new system); 3D stays on it as it orbits. Dragging the map, or picking another
// body in 3D, unlocks it. A dashed ring turns around the button while it is locked
const FOLLOW = { on: false, key: "" };
try { FOLLOW.on = localStorage.getItem("gravitas.follow") === "1"; } catch (e) {}
const LOCK_SVG = on => `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><rect x="3.2" y="7.2" width="9.6" height="7" rx="1.6"/><path d="${on ? "M5.4 7.2V5.2a2.6 2.6 0 0 1 5.2 0v2" : "M5.4 7.2V5.2a2.6 2.6 0 0 1 5-1"}"/><circle cx="8" cy="10.7" r="1" fill="currentColor"/></svg>`;
function followUi() {
  for (const b of document.querySelectorAll(".followme")) { if (b.classList.contains("on") !== FOLLOW.on || !b.firstChild) b.innerHTML = LOCK_SVG(FOLLOW.on);
    b.classList.toggle("on", FOLLOW.on); b.setAttribute("aria-pressed", FOLLOW.on ? "true" : "false");
    b.title = FOLLOW.on ? "Following your ship. Click to unlock (dragging the map unlocks it too)" : "Lock on your ship: the view follows it"; }
}
function followSet(on) {
  FOLLOW.on = !!on; FOLLOW.key = ""; try { localStorage.setItem("gravitas.follow", FOLLOW.on ? "1" : "0"); } catch (e) {}
  followUi(); if (FOLLOW.on) { findMe(); FOLLOW.key = followKey(); FOLLOW.k3 = !MAPMODE ? FOLLOW.key : ""; }
}
function followButton() { const b = document.createElement("button"); b.className = "followme"; b.setAttribute("aria-label", "Lock on your ship"); b.innerHTML = LOCK_SVG(false); b.onclick = e => { e.stopPropagation(); try { Sound.click(); } catch (x) {} followSet(!FOLLOW.on); }; return b; }
const followBody = () => YAH.b || YAH.ab || null;
function followKey() { const b = followBody(); return S && b ? [MAPMODE, S.sys.name, b.bodyId, YAH.t && YAH.t.st && YAH.t.st.name, SMAP.built === S, MAPMODE && SMAP.v && SMAP.v.auto].join("|") : ""; }
function followTick() {
  if (!FOLLOW.on || !(SYNC.on || SYNC.remote) || !S || !syncViewing()) return;
  const b = followBody(); if (!b) return;
  const key = followKey(); if (key === FOLLOW.key && (MAPMODE || focus === b)) return;
  if (!MAPMODE && focus !== b && FOLLOW.k3 === key) { followSet(false); return; }   // 3D: the visitor picked another body
  FOLLOW.key = key; FOLLOW.k3 = MAPMODE ? "" : key;
  if (MAPMODE) { smapTipHide(); smapFlyTo(b); return; }
  const t = typeof PFULL_TAP !== "undefined" ? PFULL_TAP : 0; PFULL_TAP = 0;
  try { select(b, true); } catch (e) {} finally { PFULL_TAP = t; }
}
{
  const mz = document.querySelector("#smap .smz"); if (mz) { mz.insertBefore(followButton(), mz.firstChild); mz.insertBefore(findMeButton(), mz.firstChild); }   // the 3D buttons get theirs in 34-pfull.js
  findMeUi(); setInterval(findMeUi, 2000); followUi();
  TICK.add(followTick);
}

