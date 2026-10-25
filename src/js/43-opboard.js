// ------------------------------------------------------------ v0.92 team board: one link, everyone's fight on one screen
// One CMDR starts a board and shares its link. Everyone who opens it with Sync on can add their own fight to it (their
// CMDR name, ship, kills and credits: the same numbers their own combat screen shows). Anyone with the link can watch.
// The server keeps nothing: each CMDR's summary lives only on their open connection and is passed on to the board.
// When a CMDR closes GRAVITAS their row is gone from the server (the people watching keep what they saw until they close).
const OP = { id: "", role: "", key: "", hbT: 0, ws: null, me: "", rows: new Map(), retry: 0, timer: 0, sent: "", sentT: 0, el: null, pill: null, show: false, err: "" };
const OP_LS = "gravitas.op";
const opRid = () => { const B = "abcdefghijklmnopqrstuvwxyz234567", b = crypto.getRandomValues(new Uint8Array(20)); return [...b].map(x => B[x & 31]).join(""); };
const opLink = () => `${location.origin}/?op=${OP.id}`;
const opCan = () => typeof SYNC !== "undefined" && SYNC.on && !SYNC.remote;   // only your own game can add a row
const opCut = (v, n) => String(v || "").slice(0, n);
function opSave() { if (OP.id && !OP.key) OP.key = opRid().slice(0, 12); try { OP.id ? localStorage.setItem(OP_LS, JSON.stringify({ id: OP.id, role: OP.role, k: OP.key, t: Date.now() })) : localStorage.removeItem(OP_LS); } catch (e) {} }
// what this CMDR shares: the totals of their own fight, nothing else
function opSummary() {
  const V = typeof cbLiveView === "function" ? cbLiveView() : null, ep = V && V.ep, o = V && V.op;
  return { c: opCut(CB.cmdr || "CMDR", 40), sh: opCut(CB.ship && CB.ship.type, 30), on: V && V.on ? 1 : 0, n: ep ? ep.n : 0, cr: ep ? ep.cr : 0, t0: ep ? ep.t0 : 0, t1: ep ? ep.t1 : 0,
    ph: ep && ep.op ? ep.phase : 0, sd: ep ? ep.shDown : 0, d: ep && ep.died ? 1 : 0, seen: ep ? ep.seenN : 0,
    top: ep && ep.big ? { p: opCut(ep.big.pilot, 40), s: opCut(ep.big.ship, 30), cr: ep.big.cr } : null,
    op: o || ep ? { n: opCut(o && o.name, 60), site: opCut((o && o.site) || (ep && ep.site), 60), sys: opCut((o && o.sys) || (ep && ep.sys), 60) } : null };
}
function opOpen() {
  if (!OP.id || !API) return;
  try { OP.ws && OP.ws.close(); } catch (e) {}
  const u = new URL(`${API}/room`, location.href); u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.searchParams.set("room", OP.id); u.searchParams.set("kind", "op"); u.searchParams.set("role", OP.role === "crew" ? "crew" : "watch");
  if (OP.key) u.searchParams.set("k", OP.key);   // v0.92.4: the same short key on every connection, so you keep one row
  let ws; try { ws = new WebSocket(u); } catch (e) { return opRetry(); }
  OP.ws = ws; OP.err = "";
  ws.onopen = () => { OP.retry = 0; OP.sent = ""; opPush(true); opRender(); };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } opMsg(m); };
  ws.onclose = ev => { if (OP.ws !== ws) return; OP.ws = null;
    if (ev.code === 4001) { OP.err = "This board is open in another GRAVITAS tab or window. Close this one, or click Reconnect."; opRender(); return; }   // no tug of war between two tabs
    opRender(); if (OP.id) opRetry(); };
}
function opRetry() { clearTimeout(OP.timer); const wait = Math.min(30000, 2000 * Math.pow(2, OP.retry++)); OP.timer = setTimeout(() => { if (OP.id) opOpen(); }, wait); }
function opMsg(m) {
  if (m.t === "ophello") {   // v0.92.4: the server's list is the truth. Rows it no longer has are marked as left, never added twice
    OP.me = String(m.id || ""); const now = new Set();
    for (const r of m.all || []) if (r && r.s) { now.add(String(r.id)); OP.rows.set(String(r.id), Object.assign({}, r.s, { id: String(r.id), cn: r.c || "", gone: false })); }
    for (const [id, r] of OP.rows) if (!now.has(id) && id !== OP.me) r.gone = true;
    opRender(); return; }
  if (m.t === "op" && m.s && typeof m.s === "object") { OP.rows.set(String(m.id), Object.assign({}, m.s, { id: String(m.id), cn: m.c || "", gone: false, at: Date.now() })); opRender(); return; }
  if (m.t === "opleft") { const r = OP.rows.get(String(m.id)); if (r && (!m.c || !r.cn || m.c === r.cn)) { r.gone = true; opRender(); } }   // v0.92.4: only their current connection
}
function opPush(force) {
  if (OP.role !== "crew" || !OP.ws || OP.ws.readyState !== 1 || !opCan()) return;
  const s = opSummary(), k = JSON.stringify(s), now = Date.now();
  if (!force && (k === OP.sent || now - OP.sentT < 2000)) return;
  OP.sent = k; OP.sentT = now; try { OP.ws.send(JSON.stringify({ t: "op", s })); } catch (e) {}
}
// start a board (from the combat screen or the Sync card): you are on it, the link is copied
async function opStart() {
  if (!opCan()) { toast("Turn on Sync with the game first: the board shows your fight from your own game."); return; }
  if (!OP.id) { OP.id = opRid(); OP.role = "crew"; OP.key = ""; OP.rows.clear(); opSave(); opOpen(); }
  opShow();
  try { await navigator.clipboard.writeText(opLink()); toast("Board link copied: share it with your team"); } catch (e) {}
}
function opJoin(id, role) { if (OP.id !== id) OP.key = ""; OP.id = id; OP.role = role; OP.rows.clear(); opSave(); opOpen(); opRender();
  const go = () => typeof MODES !== "undefined" && MODES && MODES_TABS ? opShow() : setTimeout(go, 150); setTimeout(go, 0); }   // (once GRAVITAS MODES has loaded)
// v0.92.6: on wide screens the board opens in GRAVITAS MODES › Combat › Team board, a window. Phones keep the full screen
// (the same rule as the CSS that hides the panel on phones, so it holds while the page is still loading)
const opWin = () => typeof MODES !== "undefined" && !!MODES && !document.body.classList.contains("pfull") && !matchMedia("(max-width: 760px), (max-height: 520px) and (pointer: coarse)").matches;
function opShow() { if (opWin()) { OP.show = false; opRender(); modesOpen("board"); } else { OP.show = true; opRender(); } }
function opLeave() { const ws = OP.ws; OP.id = ""; OP.role = ""; OP.key = ""; OP.err = ""; OP.ws = null; OP.rows.clear(); OP.show = false; clearTimeout(OP.timer); opSave(); try { ws && ws.close(1000, "bye"); } catch (e) {} opRender(); }
// the board: CMDRs by kills, then credits. Live while anyone is still fighting, results when everyone is done
function opRows() { const all = [...OP.rows.values()], live = new Set(all.filter(r => !r.gone).map(r => r.c));
  return all.filter(r => !r.gone || !live.has(r.c)).sort((a, b) => (b.n || 0) - (a.n || 0) || (b.cr || 0) - (a.cr || 0)); }
function opState(L) { const any = L.some(r => r.n || r.on || r.t0); return !L.length ? "wait" : L.some(r => r.on && !r.gone) ? "live" : any ? "done" : "wait"; }
function opWhere(L) { const r = L.find(x => x.op && (x.op.n || x.op.sys)); return r ? [r.op.n, r.op.sys, r.op.site].filter(Boolean).join(" · ") : ""; }
function opText() {
  const L = opRows(), st = opState(L), tot = L.reduce((a, r) => a + (r.cr || 0), 0);
  return [`GRAVITAS team board${opWhere(L) ? " · " + opWhere(L) : ""}${st === "done" ? " · results" : ""}`,
    ...L.map((r, i) => `${i + 1}. CMDR ${r.c}${r.sh ? ` (${r.sh})` : ""}: ${r.n || 0} kills · ${cbNum(r.cr)} cr${r.d ? " · ship lost" : ""}`),
    `Team: ${cbNum(tot)} cr · a shared kill counts for everyone who hit it`, "gravitasmap.com"].join("\n");
}
function opHTML(inWin) {
  const L = opRows(), st = opState(L), mine = L.find(r => r.id === OP.me), tot = L.reduce((a, r) => a + (r.cr || 0), 0), kills = L.reduce((a, r) => a + (r.n || 0), 0);
  const lead = st === "done" && L[0] && L[0].n ? L[0].id : "";
  const rows = L.map((r, i) => `<li class="${r.id === OP.me ? "me" : ""}${r.gone ? " gone" : ""}${r.id === lead ? " lead" : ""}"><span class="or">${i + 1}</span>
    <span class="oc"><b>CMDR ${esc(r.c)}</b>${r.id === OP.me ? `<em class="cbMate">YOU</em>` : ""}<small>${esc(r.sh || "")}${r.ph > 1 ? ` · phase ${r.ph}` : ""}</small></span>
    <span class="ost ${r.gone ? "off" : r.on ? "on" : r.t0 ? "done" : "wait"}">${r.gone ? "left" : r.on ? "in combat" : r.t0 ? "done" : "waiting"}</span>
    <span class="okn"><b>${r.n || 0}</b><small>kills</small></span><span class="ocr"><b>${cbNum(r.cr)}</b><small>cr</small></span>
    <span class="otp">${r.top ? `Top: ${esc(r.top.p)} · ${esc(r.top.s)} · ${cbNum(r.top.cr)} cr` : ""}${r.d ? ` <i class="bad">ship lost</i>` : r.sd ? ` <i>shields fell ${r.sd}×</i>` : ""}</span></li>`).join("");
  const join = OP.role !== "crew" ? (opCan() ? `<div class="obJoin"><p>Add your own fight to this board? Everyone with the link will see your CMDR name, ship, kills and credits while GRAVITAS is open.</p><button data-ob="join">Add my fight</button></div>`
    : `<p class="cbNote">To add your own fight, open this link on the computer where you play, with Sync with the game on.</p>`) : "";
  const tools = `<button data-ob="link">Copy link</button>${L.length ? `<button data-ob="img">Copy image</button><button data-ob="text">Copy text</button>` : ""}<button data-ob="leave">Leave</button>`;
  if (inWin) return `<div class="mBar"><b class="obSt ${st}">${st === "live" ? "LIVE" : st === "done" ? "RESULTS" : "WAITING"}</b><span class="mWhere">${esc(opWhere(L))}</span>${tools}</div>
    <div class="obBody inWin">${L.length ? `<p class="obTot"><b>${L.length}</b> CMDR${L.length > 1 ? "s" : ""} · <b>${kills}</b> kills · <b>${cbNum(tot)}</b> cr</p><ol class="obRows">${rows}</ol>` : `<p class="obEmpty">${OP.err ? "Paused." : OP.ws ? "Nobody has added a fight yet. Copy the link and share it with your team: each CMDR opens it on the computer where they play, with Sync on." : "Connecting…"}</p>`}
    ${OP.err ? `<p class="obErr">${esc(OP.err)} <button data-ob="re">Reconnect</button></p>` : ""}${join}<p class="cbNote">Each row comes from that CMDR's own game. A kill shared by the team counts for everyone who hit it, as in the game, so the team total is not a sum of different ships. GRAVITAS's server keeps nothing: when a CMDR closes GRAVITAS, their row is gone from the server. Leave closes the board on this computer.</p></div>`;
  return `<div class="cbHead rep"><b class="cbTag">TEAM BOARD</b><span class="cbWhere">${esc(opWhere(L))}</span><b class="obSt ${st}">${st === "live" ? "LIVE" : st === "done" ? "RESULTS" : "WAITING"}</b>
    <button data-ob="link">Copy link</button>${L.length ? `<button data-ob="img">Copy image</button><button data-ob="text">Copy text</button>` : ""}<button data-ob="leave">Leave</button><button data-ob="min">Close</button></div>
    <div class="obBody">${L.length ? `<p class="obTot"><b>${L.length}</b> CMDR${L.length > 1 ? "s" : ""} · <b>${kills}</b> kills · <b>${cbNum(tot)}</b> cr</p><ol class="obRows">${rows}</ol>` : `<p class="obEmpty">${OP.err ? "Paused." : OP.ws ? "Nobody has added a fight yet. Share the link: each CMDR opens it on the computer where they play." : "Connecting…"}</p>`}
    ${OP.err ? `<p class="obErr">${esc(OP.err)} <button data-ob="re">Reconnect</button></p>` : ""}${join}<p class="cbNote">Each row comes from that CMDR's own game. A kill shared by the team counts for everyone who hit it, as in the game, so the team total is not a sum of different ships. GRAVITAS's server keeps nothing: when a CMDR closes GRAVITAS, their row is gone from the server. ${mine ? "You share only your totals, never your journal." : ""}</p></div>`;
}
function opInit() {
  if (OP.el) return;
  OP.el = document.createElement("div"); OP.el.id = "opBoard"; OP.el.setAttribute("role", "region"); OP.el.setAttribute("aria-label", "Team board");
  OP.pill = document.createElement("button"); OP.pill.id = "opPill"; OP.pill.type = "button";
  document.body.append(OP.el, OP.pill);
  OP.pill.onclick = () => opShow();
  OP.el.addEventListener("click", opClick);
  addEventListener("keydown", e => { if (e.key === "Escape" && OP.show) { OP.show = false; opRender(); } });
}
// the board's buttons, on the full screen (phones) and in GRAVITAS MODES
async function opClick(e) {
    const b = e.target.closest("[data-ob]"); if (!b) return; const a = b.dataset.ob;
    if (a === "min") { OP.show = false; opRender(); }
    else if (a === "leave") opLeave();
    else if (a === "re") { OP.err = ""; OP.retry = 0; opOpen(); opRender(); }
    else if (a === "join") { OP.role = "crew"; opSave(); opOpen(); }
    else if (a === "link") { try { await navigator.clipboard.writeText(opLink()); b.textContent = "Copied"; } catch (x) { prompt("Copy:", opLink()); } }
    else if (a === "text") { try { await navigator.clipboard.writeText(opText()); b.textContent = "Copied"; } catch (x) { prompt("Copy:", opText()); } }
    else if (a === "img") { const blob = await new Promise(r => opCard().toBlob(r, "image/png"));
      try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); b.textContent = "Copied: paste in Discord"; }
      catch (x) { const u = URL.createObjectURL(blob), l = document.createElement("a"); l.href = u; l.download = "gravitas-team-board.png"; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); } }
}
function opRender() {
  opInit();
  const show = !!OP.id && OP.show, L = opRows();
  OP.el.classList.toggle("show", show);
  const inPanel = opWin();   // v0.92.4: on wide screens the board lives in GRAVITAS MODES
  OP.pill.style.display = OP.id && !show && !inPanel ? "block" : "none";
  if (OP.id && !show) OP.pill.innerHTML = `<b>● TEAM BOARD</b> ${opCount()}`;
  if (show) { const h = opHTML(); if (h !== OP.html) { OP.html = h; OP.el.innerHTML = h; } } else OP.html = "";
  document.body.classList.toggle("opOn", !!OP.id);
  if (typeof modesRefresh === "function") modesRefresh();   // the board in the window follows too
}
// the results as an image card for Discord (drawn here, never uploaded anywhere)
function opCard() {
  const L = opRows().slice(0, 8), W = 1200, H = 675, c = document.createElement("canvas"); c.width = W * 2; c.height = H * 2; const g = c.getContext("2d"); g.scale(2, 2);
  const F = (w, px) => `${w} ${px}px "Segoe UI", system-ui, -apple-system, sans-serif`, st = opState(L);
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#2a0710"); bg.addColorStop(0.55, "#12040a"); bg.addColorStop(1, "#07020a"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(255,70,90,.16)"; g.lineWidth = 1; for (let x = 0; x < W; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.fillStyle = "#ff3b4e"; g.fillRect(0, 0, 8, H);
  g.fillStyle = "#ff5a6a"; g.font = F(700, 20); g.fillText("G R A V I T A S", 56, 64);
  g.fillStyle = "#fff"; g.font = F(800, 50); g.fillText(st === "done" ? "TEAM RESULTS" : "TEAM BOARD", 56, 124);
  g.fillStyle = "#ffc9cf"; g.font = F(500, 24); g.fillText(opWhere(L), 56, 164, W - 112);
  L.forEach((r, i) => { const y = 214 + i * 54; g.fillStyle = i === 0 && st === "done" ? "rgba(255,210,122,.14)" : i % 2 ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.06)"; g.beginPath(); g.roundRect(56, y - 34, W - 112, 46, 8); g.fill();
    g.fillStyle = "#ff7b88"; g.font = F(800, 22); g.fillText(String(i + 1), 76, y);
    g.fillStyle = "#fff"; g.font = F(700, 23); g.fillText("CMDR " + r.c, 116, y, 380); g.fillStyle = "#d9b3b8"; g.font = F(500, 18); g.fillText(r.sh || "", 510, y, 220);
    g.fillStyle = "#fff"; g.font = F(800, 24); g.textAlign = "right"; g.fillText(`${r.n || 0} kills`, 900, y); g.fillStyle = "#ffd27a"; g.fillText(cbNum(r.cr) + " cr", W - 76, y); g.textAlign = "left"; });
  g.fillStyle = "#b9939a"; g.font = F(500, 17); g.fillText("Each row from that CMDR's own game. A shared kill counts for everyone who hit it.", 56, H - 44, W - 360);
  g.fillStyle = "#ff5a6a"; g.font = F(700, 22); g.textAlign = "right"; g.fillText("gravitasmap.com", W - 56, H - 44); g.textAlign = "left";
  return c;
}
// the board's short line (the pill on phones, the GRAVITAS MODES panel): CMDRs on the board now, not everyone who ever joined
function opCount() { const L = opRows(), on = L.filter(r => !r.gone).length, st = opState(L);
  return !OP.ws ? (OP.err ? "paused" : "connecting…") : `${on} CMDR${on === 1 ? "" : "s"}${st === "done" ? " · results" : ""}`; }
addEventListener("resize", () => { if (OP.id) opRender(); });
TICK.add(() => { if (OP.id) { opPush(false); if (OP.show) opRender();
  const now = Date.now(); if (OP.ws && OP.ws.readyState === 1 && now - OP.hbT > 20000) { OP.hbT = now; try { OP.ws.send('{"t":"hb"}'); } catch (e) {} } } });   // the join offer appears once Sync is on. v0.92.4: a heartbeat, so an idle board is not cut
document.addEventListener("click", e => { if (e.target.closest && e.target.closest("[data-opnew]")) { e.preventDefault(); opStart(); } });   // the Team board buttons (combat screen, GRAVITAS MODES)
// a board link: ?op=ID (then the address is cleaned). With Sync on, this computer is asked before its fight is added
(function opBoot() {
  const P = new URLSearchParams(location.search), q = P.get("op");
  if (q && /^[a-z2-7]{20,32}$/.test(q)) { P.delete("op"); history.replaceState(null, "", location.pathname + (P.toString() ? "?" + P : "") + location.hash); opJoin(q, "watch"); return; }
  try { const o = JSON.parse(localStorage.getItem(OP_LS) || "null"); if (o && o.id && Date.now() - (o.t || 0) < 12 * 3600e3) { OP.id = o.id; OP.role = o.role === "crew" ? "crew" : "watch"; OP.key = /^[a-z2-7]{8,16}$/.test(o.k || "") ? o.k : "";
    if (!OP.key) { OP.key = opRid().slice(0, 12); try { localStorage.setItem(OP_LS, JSON.stringify(Object.assign(o, { k: OP.key }))); } catch (x) {} }
    OP.show = false; opOpen(); opRender(); } } catch (e) {}   // (the new key keeps the board's 12 hours from when it was joined)
})();
