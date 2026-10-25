// ------------------------------------------------------------ v0.78: Sync at a glance
// One light, the same everywhere (the computer's Sync panel, the phone's top bar, its Sync tab and window):
//   live     green dot that breathes    everything is linked and news arrives
//   wait     amber half disc            linked, but the game is closed or the computer is not sharing
//   lost     red cross that blinks      the link is gone, it is being rebuilt by itself
//   off      grey ring                  Sync is not on
// Colour and shape both carry the meaning. Under it a small card: the system, where the ship is, the plotted route
// (from the game's NavRoute.json) with each jump's length against the ship's jump range, and how fresh the news is.
// Everything here is drawn when something changes, and the age text once a second. Nothing runs per frame.
const SYNC_IC = {
  dock: '<path d="M2.5 8h11M8 2.5v11"/><rect x="5.2" y="5.2" width="5.6" height="5.6" rx="1"/>',
  land: '<path d="M1.5 13.5h13M4 11l4-6 4 6"/><path d="M8 5V2.5"/>',
  foot: '<circle cx="8" cy="3.4" r="1.4"/><path d="M8 5.4v4.2M8 9.6 5.8 14M8 9.6l2.2 4.4M5.2 7.4h5.6"/>',
  srv: '<rect x="2.5" y="6.5" width="11" height="4" rx="1.2"/><circle cx="5" cy="12" r="1.3"/><circle cx="11" cy="12" r="1.3"/><path d="M6 6.5 7 4.5h3l1 2"/>',
  sc: '<path d="M3 4.5 7 8l-4 3.5M8.5 4.5 12.5 8l-4 3.5"/>',
  jump: '<circle cx="8" cy="8" r="5.6"/><path d="M8 8m-2.6 0a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0"/><path d="M8 2.4v2.2M8 11.4v2.2"/>',
  near: '<circle cx="8" cy="8" r="3.2"/><path d="M8 1.6v2M8 12.4v2M1.6 8h2M12.4 8h2"/>',
  star: '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v2.2M8 12.3v2.2M1.5 8h2.2M12.3 8h2.2M3.4 3.4l1.5 1.5M11.1 11.1l1.5 1.5M12.6 3.4l-1.5 1.5M4.9 11.1l-1.5 1.5"/>',
  fly: '<path d="M2 12.5 14 3.5 9.5 14 8 9.2Z"/>',
  off: '<path d="M8 2v5.5"/><path d="M4.4 4.4a5 5 0 1 0 7.2 0"/>',
  route: '<circle cx="3.2" cy="12.4" r="1.4"/><circle cx="12.8" cy="3.6" r="1.4"/><path d="M4.4 11.4C8 10.4 5 6.6 8.4 5.6c1.4-.4 2.4-.8 3.2-1.2"/>',
  fuel: '<path d="M3.5 14V3.2c0-.7.5-1.2 1.2-1.2h4.6c.7 0 1.2.5 1.2 1.2V14M2.5 14h9M5.4 4.6h3.2v2.8H5.4ZM10.5 6.5h1.6c.6 0 1 .4 1 1v3.6c0 .6.4 1 .9 1"/>',
  phone: '<rect x="4.4" y="1.6" width="7.2" height="12.8" rx="1.6"/><path d="M7 12.2h2"/>',
};
const syncIc = (k, c = "") => `<svg class="sic ${c}" viewBox="0 0 16 16" aria-hidden="true">${SYNC_IC[k] || ""}</svg>`;
// the light: [kind, short word, why]
function syncK() {
  const now = Date.now();
  if (SYNC.remote) {
    if (!PAIR.ws || PAIR.ws.readyState !== 1) return ["lost", "RECONNECTING", "The link to your computer dropped. Trying again…"];
    if (!PAIR.hostOn) return ["wait", "WAITING", "Your computer is not sharing right now."];
    if (SYNC.closed) return ["wait", "GAME CLOSED", "The game is closed on your computer."];
    if (now - (PAIR.hostT || now) > 45000) return ["wait", "QUIET", "No news from your computer for a while."];
    if (!SYNC.here) return ["wait", "WAITING", "Waiting for your computer…"];
    return ["live", "LIVE", ""];
  }
  if (!SYNC.on) return SYNC.paused ? ["lost", "PAUSED", "Sync is paused: click the switch to go on."] : ["off", "OFF", ""];
  if (SYNC.err > 0) return ["lost", "NO FOLDER", "The Journal folder cannot be read right now."];
  if (SYNC.closed) return ["wait", "GAME CLOSED", "The game is closed. Your last place is kept."];
  if (!SYNC.here) return ["wait", "WAITING", "Waiting for the game…"];
  return ["live", "LIVE", ""];
}
const syncBodyName = n => { n = String(n || ""); const s = SYNC.here || ""; return s && n.toLowerCase().startsWith(s.toLowerCase()) ? (n.slice(s.length).trim() || n) : n; };
// where the ship is, in a few words, with its own small picture
function syncWhere() {
  const a = SYNC.at || {};
  if (SYNC.jumping) return ["jump", `Jumping to ${SYNC.jumping}`];
  if (SYNC.closed) return ["off", "Game closed"];
  if (a.docked) return ["dock", `Docked at ${a.name || "a station"}`];
  if (a.foot) return ["foot", "On foot" + (a.name && !a.market ? ` on ${syncBodyName(a.name)}` : "")];
  if (a.srv) return ["srv", "In the SRV"];
  if (a.landed) return ["land", `Landed${a.name ? ` on ${syncBodyName(a.name)}` : ""}`];
  if (SYNC.sc) return ["sc", "In supercruise" + (SYNC.dest && SYNC.dest.Name ? ` · heading to ${syncBodyName(SYNC.dest.Name)}` : "")];
  if (a.near && a.name) return ["near", `Near ${syncBodyName(a.name)}`];
  if (a.bodyId != null && a.name) return [a.arrived ? "star" : "near", a.arrived ? "Arrived at the main star" : `Near ${syncBodyName(a.name)}`];
  return ["fly", "In flight"];
}
const syncAgo = t => { if (!t) return ""; const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 5 ? "updated just now" : s < 60 ? `updated ${s} s ago` : s < 3600 ? `updated ${Math.floor(s / 60)} min ago` : `updated ${Math.floor(s / 3600)} h ago`; };
// ---- the route: the stops still ahead, each jump's length, the ship's range
const SCOOP = /^[OBAFGKM]$/;                                         // stars a fuel scoop can use
function syncRouteInfo(max = 500) {
  if (SYNC.remote) return SYNC.rt || null;
  const R = SYNC.route; if (!R || R.length < 2) return null;
  let i = R.findIndex(r => syncSame(r.n, SYNC.here));
  if (i < 0 && SYNC.jumping) i = R.findIndex(r => syncSame(r.n, SYNC.jumping)) - 1;
  // v0.90.4: the ship is not on this route at all (an old route file, and the ship moved without it, e.g. on a fleet
  // carrier): it is not the ship's route, so no route is shown. It used to count from the start and show the old route again
  if (i < 0) return null;
  const hops = [];
  for (let k = i + 1; k < R.length && hops.length < max; k++) {
    const a = R[k - 1].p, b = R[k].p, d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    hops.push([R[k].n, R[k].c, Math.round(d * 100) / 100]);
  }
  if (!hops.length) return null;
  let ly = 0; for (let k = i + 1; k < R.length; k++) { const a = R[k - 1].p, b = R[k].p; ly += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); }
  return { left: R.length - 1 - i, ly: Math.round(ly * 10) / 10, range: SYNC.range ? Math.round(SYNC.range * 100) / 100 : 0, hops, at: i, tot: R.length - 1 };   // v0.81: where we are in the route (jump i of tot done)
}
const starChip = c => { c = c || "?"; const sc = SCOOP.test(c), cls = sc ? "sc" : /^(N|D)/.test(c) ? "boost" : /^(H|SupermassiveBlackHole)/i.test(c) ? "bh" : "no";
  const t = sc ? `Class ${c}: you can scoop fuel here` : /^N/.test(c) ? "Neutron star: no fuel, but a jet cone boost" : /^D/.test(c) ? "White dwarf: no fuel, a small jet cone boost" : `Class ${c}: no fuel here`;
  return `<i class="schip ${cls}" title="${esc(t)}">${esc(c.length > 3 ? c.slice(0, 3) : c)}</i>`; };
function syncRouteHTML(ri) {
  if (!ri || !ri.hops || !ri.hops.length) return "";
  const top = Math.max(ri.range || 0, ...ri.hops.map(h => h[2]), 1), n = ri.hops[0];
  const fmtLy = v => v >= 100 ? v.toFixed(0) : v.toFixed(1);
  const rows = ri.hops.map((h, k) => { const w = Math.max(3, Math.min(100, (h[2] / top) * 100)), near = ri.range && h[2] > ri.range * 0.92;
    return `<li><span class="rk">${k + 1}</span><span class="rn" title="${esc(h[0])}">${esc(h[0])}</span>${starChip(h[1])}<span class="rbar${near ? " near" : ""}"><i style="width:${w.toFixed(0)}%"></i></span><span class="rd">${fmtLy(h[2])}</span></li>`; }).join("");
  const more = ri.left > ri.hops.length ? `<li class="rmore">… and ${ri.left - ri.hops.length} more</li>` : "";
  return `<div class="rhead">${syncIc("route")}<b>ROUTE</b><span>${ri.left} jump${ri.left > 1 ? "s" : ""} · ${fmtLy(ri.ly)} ly</span>${ri.range ? `<em title="Your ship's jump range, from the Journal">range ${fmtLy(ri.range)} ly</em>` : ""}</div>
    <div class="rnext"><span>Next</span><b title="${esc(n[0])}">${esc(n[0])}</b>${starChip(n[1])}<span class="rd">${fmtLy(n[2])} ly</span></div>
    <details class="rlist"${SYNC.rOpen ? " open" : ""}><summary>All jumps</summary><ol>${rows}${more}</ol></details>`;
}
// the card under the switch (computer) and in the Sync window (phone)
function syncCardHTML() {
  if (!SYNC.on || !SYNC.here) return "";
  const [ic, txt] = syncWhere();
  return `<div class="ssys" title="${esc(SYNC.here)}">${esc(SYNC.here)}</div><div class="swhere">${syncIc(ic)}<span>${esc(txt)}</span></div>
    <div class="sroute">${syncRouteHTML(syncRouteInfo())}</div>${typeof fcCardHTML === "function" ? fcCardHTML() : ""}<div class="sfoot"><span class="sage">${syncAgo(SYNC.newsT)}</span></div>`;   // v0.92.4: Past combats and Team board moved to GRAVITAS MODES
}
function syncUi() {
  const p = $("sync"); if (!p || !PAIR_ON) return;                      // runs once the pairing part is there (it starts right after)
  const [k, word, why] = syncK();
  p.dataset.k = k; SYNC.k = k;
  $("syncSt").textContent = SYNC.on || SYNC.remote ? word : !SYNC.ok ? "needs Chrome or Edge" : "off";
  p.title = why || "";
  const c = $("syncCard"), h = syncCardHTML(); if (c && c._h !== h) { c._h = h; c.innerHTML = h; syncRouteHook(c); }
  if (typeof layoutLeft === "function") layoutLeft();
  document.body.dataset.sk = SYNC.remote || SYNC.on ? k : "off";       // the phone's Sync tab carries the light too
  syncPhoneRow();
  if (typeof pfullRoute === "function") pfullRoute();                 // v0.78.5: the route on the phone's main screen
}
function syncRouteHook(root) { const d = root.querySelector(".rlist"); if (d) d.addEventListener("toggle", () => { SYNC.rOpen = d.open; }); }
// the computer that shares: one line for the phones and tablets that follow it
function syncPhoneRow() {
  const r = $("syncPhone"); if (!r || !PAIR_ON) return;                // (the pairing part may not have started yet)
  let h = "", k = "";
  if (PAIR.role === "host" && !SYNC.remote) {
    const c = pairCounts(), n = c.a, direct = [...PAIR.peers.values()].filter(p => pairAwake(p) && p.mode === "direct").length;
    if (!PAIR.ws || PAIR.ws.readyState !== 1) { k = "lost"; h = "Devices: reconnecting to the server…"; }
    else if (!c.n) { k = "wait"; h = `Devices: waiting for a phone or tablet (up to ${PAIR_MAX})`; }
    else if (!n) { k = "wait"; h = `${c.s} device${c.s > 1 ? "s" : ""} asleep · catches up when it wakes`; }   // v0.91.4: linked but quiet
    else { k = "live"; h = `${n} device${n > 1 ? "s" : ""} following · ${direct === n ? "direct" : direct ? `${direct} direct` : "via server"}${c.s ? ` · ${c.s} asleep` : ""}`; }
  }
  r.dataset.k = k;
  const html = h ? `<span class="sdot" aria-hidden="true"></span>${syncIc("phone")}<span>${esc(h)}</span>` : "";
  if (r._h !== html) { r._h = html; r.innerHTML = html; if (typeof layoutLeft === "function") layoutLeft(); }
}
// the panels above follow the Sync panel's height (the route list opens and closes)
try { new ResizeObserver(() => { if (typeof layoutLeft === "function") layoutLeft(); }).observe($("sync")); } catch (e) {}
// once a second: the age text, and the light when a link went quiet
setInterval(() => {
  if (!SYNC.on && !SYNC.remote) return;
  const k = syncK()[0];
  if (k !== SYNC.k) { syncShow(); return; }
  for (const el of document.querySelectorAll("#syncCard .sage, #psync .sage")) { const t = syncAgo(SYNC.newsT); if (el.textContent !== t) el.textContent = t; }
}, 1000);

// ---- the jump: a short sound when the jump starts, a card when the ship arrives
function syncJumpFx() { try { const c = $("vJumpSnd"); if (!c || c.checked) Sound.jump(); } catch (e) {} }
function arriveCardCheck() {
  if (!(SYNC.on || SYNC.remote) || !S || !syncSame(S.sys.name, SYNC.here) || SYNC.cardSys === SYNC.here) return;
  const a = SYNC.at; if (!a || !a.arrived || Date.now() - a.arrived > 90000) return;
  SYNC.cardSys = SYNC.here;
  const B = S.bodies.filter(b => b.type !== "Star" && !b.belt), cnt = f => S.bodies.filter(f).length;
  const land = cnt(b => !!b.isLandable), bio = cnt(b => sigCount(b, /Biological/) > 0), st = (S.sys.stations || []).filter(x => !/carrier/i.test(x.type || "")).length;
  const facts = [`${B.length} bod${B.length === 1 ? "y" : "ies"}`, land ? `${land} landable` : "", bio ? `${bio} with life` : "", st ? `${st} station${st > 1 ? "s" : ""}` : ""].filter(Boolean);
  const ri = syncRouteInfo(1);
  let el = $("arrCard"); if (el) el.remove();
  el = document.createElement("div"); el.id = "arrCard"; el.setAttribute("role", "status");
  el.innerHTML = `<div class="al">ARRIVED</div><div class="an">${esc(S.sys.name)}</div><div class="as">${esc((S.main && S.main.subType) || "")}</div>
    <div class="af">${facts.map(f => `<span>${esc(f)}</span>`).join("")}</div>${ri && ri.left ? `<div class="ar">${syncIc("route")}${ri.left} jump${ri.left > 1 ? "s" : ""} to go · next ${esc(ri.hops[0][0])}</div>` : ""}`;
  document.body.appendChild(el);
  el.addEventListener("animationend", () => el.remove());
}
