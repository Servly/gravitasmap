// ------------------------------------------------------------ v0.99.10 Devices: the same list everywhere
// A pairing (room + host key) can be held by more than one place: this site in a browser tab, the GRAVITAS app's map window, the GRAVITAS app itself.
// The room on the server is the one place that knows who follows. Every holder asks it (HTTPS, the host key in a header) and every holder
// can remove one device or stop the pairing, so what one place does, the others show within seconds. A holder that has an open link to the room
// is told about changes at once; one without a link (this tab has no Sync, or another place pushes the news) looks every 15 s, every 5 s while the dialog is open.
// Only one place at a time pushes "where am I" (the room keeps one pushing computer: a second one replaces the first). The replaced place
// does not fight for it: it keeps the pairing, shows the list and only takes over again when the room has had no computer for two looks in a row.
// (This file comes before 33-pair.js in the joined module: it only defines things, nothing here runs until the pairing part has started.)
const PM = { devs: null, t: 0, busy: false, off: 0, wait: false };
const APPPAIR = { rec: null, ready: false };       // the app's map window: the app hands the pairing over (48-app-hook.js), it is never written to this window's web storage
const PAIR_ROOM_RE = /^[a-z2-7]{20,32}$/, PAIR_HK_RE = /^[0-9a-f]{32}$/;

// one call to the room's list (see functions/api/room.js): { st: HTTP status, j: the answer }
function pairApiRaw(room, hk, what, extra) {
  return fetch(`${API}/room?room=${room}&do=${what}${extra || ""}`, { method: what === "status" ? "GET" : "POST", headers: { "X-Host-Key": hk }, cache: "no-store" })
    .then(async r => { let j = null; try { j = await r.json(); } catch (e) {} return { st: r.status, j }; });
}
const pairApi = (what, extra) => pairApiRaw(PAIR.room, PAIR.hk, what, extra);

// the list as this page holds it (from the room: a push over the link, or the last look). Untrusted text: cut and typed.
function pairDevs(list, hostOn) {
  if (!Array.isArray(list)) return;
  PM.devs = { at: Date.now(), hostOn: !!hostOn, list: list.slice(0, 8).filter(d => d && /^[0-9a-f]{8}$/.test(d.id)).map(d => ({
    id: d.id, n: String(d.n || "").replace(/[\x00-\x1f\x7f<>"`]/g, "").slice(0, 40), ago: Math.max(0, +d.ago || (d.awake === false ? 41000 : 0)), since: +d.since || 0, mode: d.mode === "direct" ? "direct" : "server" })) };
  PAIR.awakeK = ""; pairUi();
}
const pairFresh = () => !!(PAIR.hk && PM.devs && Date.now() - PM.devs.at < 120e3);
// what the panels show: the room's list when this page holds the key, else the links this page itself sees (a phone's own computer page before the list came)
function pairList() {
  if (pairFresh()) { const el = Date.now() - PM.devs.at; return PM.devs.list.map(d => ({ id: d.id, n: d.n, awake: d.ago + el < 40000, mode: d.mode, t0: d.since })); }
  return [...PAIR.peers.entries()].map(([id, p]) => ({ id, n: p.n, awake: pairAwake(p), mode: p.mode, t0: p.t0 }));
}

// ---- looking at the room, and what to do with the answer
async function pairPoll() {
  if (PM.busy || PAIR.role !== "host" || !PAIR.hk) return;
  PM.busy = true; PM.t = Date.now();
  const room = PAIR.room, hk = PAIR.hk;
  try {
    const r = await pairApi("status");
    if (PAIR.room !== room || PAIR.hk !== hk) return;                   // changed meanwhile
    if (r.st === 410 || r.st === 403) { pairGone("Sharing was stopped, or this link has expired. Tap Devices to start again."); return; }
    if (r.st === 200 && r.j && Array.isArray(r.j.devices)) {
      pairDevs(r.j.devices, r.j.hostOn);
      // evicted by another place that pushes: take over again only when the room has had no computer for two looks in a row
      if (PAIR.evicted && !PAIR.ws) { if (!r.j.hostOn) { if (++PM.off >= 2) { PM.off = 0; PAIR.evicted = false; PM.wait = true; } } else PM.off = 0; }
    }
  } catch (e) {} finally { PM.busy = false; }
}
// the pairing ended somewhere else (or expired): forget it here, calmly
function pairGone(msg) {
  if (PAIR.role !== "host") return;
  if (PAIR.linked) msg = PAIR_LINK_ENDED;                                // v0.99.11: a pairing this browser took from the app: say how to take the next one
  pairHostStop(true); if (msg) toast(msg);
}
const PAIR_LINK_ENDED = "The pairing was ended. Link again with the GRAVITAS app.";
function pairManageTick() {
  if (PAIR.role !== "host" || !PAIR.hk) return;
  const now = Date.now(), d = $("pairDlg"), open = !!d && d.style.display === "flex";
  if (PM.wait && SYNC.on && !SYNC.remote && !PAIR.ws && !PAIR.evicted) { PM.wait = false; pairOpen(); }   // the pairing was taken up while Sync was off: link once it is on
  const every = document.hidden ? 60e3 : open ? 5e3 : PAIR.ws && PAIR.ws.readyState === 1 ? 60e3 : 15e3;
  if (now - PM.t >= every) pairPoll();
}
TICK.add(pairManageTick);

// ---- take a pairing up in this page (from the app, from a link, or from this browser's own memory)
function pairAdopt(room, hk, linked) {
  if (!PAIR_ROOM_RE.test(room || "") || !PAIR_HK_RE.test(hk || "")) return false;
  if (PAIR.role === "view") return false;                               // this page follows another computer
  if (PAIR.role === "host" && PAIR.room === room && PAIR.hk === hk) { if (linked && !PAIR.linked) { PAIR.linked = true; pairSet(PAIR_LS.host, { room, hk, t: Date.now(), linked: 1 }); } return true; }
  if (PAIR.role === "host") { pairHostStop(true); }                     // another pairing here: this one replaces it (the old one stays on the server for its other holders)
  PAIR.role = "host"; PAIR.room = room; PAIR.hk = hk; PAIR.code = ""; PAIR.exp = 0; PAIR.evicted = false; PM.devs = null; PM.off = 0; PM.t = 0;
  PAIR.linked = !!linked;                                               // v0.99.11: taken up with a link code from the app (a stopped pairing is then reported with the "link again" words)
  pairSet(PAIR_LS.host, linked ? { room, hk, t: Date.now(), linked: 1 } : { room, hk, t: Date.now() });
  PM.wait = true; pairUi(); return true;
}
// the Devices dialog, or the start of a pairing (the app's menu opens it: the map window has Sync by itself)
function pairShow() {
  if (PAIR.role === "host") { pairDialog(); return true; }
  if (!SYNC.on) { const until = Date.now() + 30e3, go = () => { if (SYNC.on) pairHostStart(false); else if (Date.now() < until) setTimeout(go, 700); else toast("Turn on Sync with the game first."); }; go(); return true; }
  pairHostStart(false); return true;
}

// ---- v0.99.11 link with the GRAVITAS app: the app shows a one-time code (8 characters, 2 minutes), this browser types it and takes up the app's pairing
// The server answers { room, hostKey } once (Cache-Control: no-store, the code is burned). The key goes into this browser's storage exactly like a key from a #host= link.
// The code travels in a header (not in the address) and is never kept here. Only a normal browser asks: the app's map window already holds the pairing.
const PAIR_LINK_RE = /^[A-HJ-NP-Z2-9]{8}$/;
const pairLinkNorm = v => { const c = String(v || "").toUpperCase().replace(/[\s-]/g, ""); return PAIR_LINK_RE.test(c) ? c : ""; };
async function pairLinkWith(raw) {
  if (APP_WINDOW) return false;
  const code = pairLinkNorm(raw);
  if (!code) { toast("The code has 8 letters and digits, like ABCD-EFGH."); return false; }
  if (PAIR.role === "view") { toast("This page follows another computer. Stop following it first."); return false; }
  let r, j = null;
  try { r = await fetch(`${API}/room?do=link`, { method: "POST", headers: { "X-Link-Code": code }, cache: "no-store" }); try { j = await r.json(); } catch (e) {} } catch (e) { r = null; }
  if (!r) { toast("The GRAVITAS server did not answer. Please try again."); return false; }
  if (r.status === 429) { toast((j && j.error) || "Too many wrong codes from this address. Please wait a few minutes."); return false; }
  if (!r.ok || !j || !PAIR_ROOM_RE.test(j.room || "") || !PAIR_HK_RE.test(j.hostKey || "")) { toast("That code did not work. It is valid for 2 minutes and once: ask the GRAVITAS app for a new one."); return false; }
  if (!pairAdopt(j.room, j.hostKey, true)) { toast("This page could not take up the pairing."); return false; }
  toast("Linked with the GRAVITAS app. This page now shows its devices.");
  setTimeout(() => pairDialog(), 100); return true;
}
// the small dialog (opened from the Sync card and from the Devices dialog)
function pairLinkDialog() {
  if (APP_WINDOW) return;
  let d = $("pairLinkDlg");
  if (!d) {
    d = document.createElement("div"); d.id = "pairLinkDlg"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-label", "Link with the GRAVITAS app");
    d.innerHTML = `<div class="box"><div class="hd"><h3>LINK WITH THE GRAVITAS APP</h3><button class="x" title="Close (Esc)">\u2715</button></div><form class="bd">
      <p>In the GRAVITAS app, open <b>Modes</b>, go to <b>Phones and tablets</b> and press <b>Link a browser</b>. Type the code it shows here. This browser then shows and manages the same devices as the app.</p>
      <div class="lrow"><input class="lc" type="text" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" placeholder="ABCD-EFGH" aria-label="Link code from the GRAVITAS app" title="The code the app shows. It works once and for 2 minutes."><button class="go" type="submit" title="Take up the app's pairing in this browser">Link</button></div>
      <p class="note">The code is used up the moment it works. Nothing is shared with other people: the server hands the pairing only to whoever types the code.</p>
      <div class="act"><button type="button" class="no">Close</button></div></form></div>`;
    document.body.appendChild(d);
    const close = () => { d.style.display = "none"; }, inp = d.querySelector(".lc");
    d.querySelector(".x").onclick = close; d.querySelector(".no").onclick = close;
    d.addEventListener("click", e => { if (e.target === d) close(); });
    addEventListener("keydown", e => { if (e.key === "Escape" && d.style.display === "flex") close(); });
    d.querySelector("form").onsubmit = async e => { e.preventDefault(); const b = d.querySelector(".go"); b.disabled = true; const ok = await pairLinkWith(inp.value); b.disabled = false; if (ok) { inp.value = ""; close(); } };
  }
  d.style.display = "flex"; d.querySelector(".lc").focus();
}
