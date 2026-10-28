// ------------------------------------------------------------ v0.76 Sync with GRAVITAS: a phone or tablet as a second screen
// The computer that runs Sync with the game ("host") shares where the ship is with phones and tablets ("viewers").
// What is shared: only the small summary Sync already shows (system, body, station, docked or landed, the ship's target,
// game closed). The Journal never leaves the computer. The link goes through GRAVITAS's server (a Cloudflare Durable
// Object, see worker/), and, when the two devices are on the same network and that is clearly faster, directly between
// them (WebRTC). Which way is used is decided once per pairing and remembered.
// v0.92: in a fight the combat screen goes too. Through the server it is a message of its own that is passed on and never kept.
const PAIR = {
  role: "", room: "", code: "", exp: 0, ws: null, retry: 0, timer: 0, beat: null, sent: "", lastT: 0,
  peers: new Map(),            // host: viewer id -> { pc, dc, mode }
  pc: null, dc: null, mode: "", got: false, hostOn: false, sig: "", chk: null, chkN: 0, miss: 0, nextChk: 0, okT: 0,   // viewer (v0.82: sig, the check)
};
var PAIR_ON = true;                    // a plain flag (var, no wait for this file): earlier files may call pairUi() once it is set
const PAIR_LS = { host: "gravitas.pair.host", view: "gravitas.pair.view" };
const pairGet = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
const pairSet = (k, v) => { try { v ? localStorage.setItem(k, JSON.stringify(v)) : localStorage.removeItem(k); } catch (e) {} };
const PAIR_RTC = typeof RTCPeerConnection === "function";

// ---- the connection to the room (both sides)
function pairOpen() {
  if (!PAIR.room || !API) return;
  try { PAIR.ws && PAIR.ws.close(); } catch (e) {}
  const u = new URL(`${API}/room`, location.href); u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.searchParams.set("room", PAIR.room); u.searchParams.set("role", PAIR.role);
  let ws; try { ws = new WebSocket(u); } catch (e) { return pairRetry(); }
  PAIR.ws = ws;
  ws.onopen = () => { PAIR.retry = 0; PAIR.wsT = Date.now(); pairUi(); syncShow(); if (PAIR.role === "host") { PAIR.sent = ""; pairPush(true); } };
  ws.onmessage = e => { PAIR.wsT = Date.now(); let m; try { m = JSON.parse(e.data); } catch (x) { return; } pairMsg(m); };
  ws.onclose = ev => { if (PAIR.ws !== ws) return; PAIR.ws = null; pairUi(); syncShow(); if (ev.code === 4000) return;
    if (ev.code === 4003) { if (PAIR.role === "view") pairRemoved(); return; }   // v0.94: the computer stopped this device following
    if (PAIR.role) pairRetry(); };
}
// v0.78: give up on a socket without waiting for its goodbye, and build a new one
function pairDropWs() {
  const ws = PAIR.ws; if (!ws) return; PAIR.ws = null; PAIR.badT = 0;
  ws.onclose = ws.onmessage = ws.onopen = null; try { ws.close(); } catch (e) {}
  pairUi(); syncShow(); if (PAIR.role) pairRetry();
}
function pairRetry() {
  clearTimeout(PAIR.timer);
  const wait = Math.min(30000, 2000 * Math.pow(2, PAIR.retry++));
  PAIR.timer = setTimeout(() => { if (PAIR.role) pairOpen(); }, wait);
}
const pairSend = m => { try { if (PAIR.ws && PAIR.ws.readyState === 1) { PAIR.ws.send(JSON.stringify(m)); return true; } } catch (e) {} return false; };
function pairMsg(m) {
  if (m.t === "hb") return;
  if (PAIR.role === "host") {
    if (m.t === "hi") { const p = PAIR.peers.get(m.id) || { mode: "server", seenT: Date.now() }; p.n = String(m.n || "").slice(0, 40); p.t0 = p.t0 || Date.now(); PAIR.peers.set(m.id, p); pairUi(); return; }   // v0.94
    if (m.t === "join") { if (m.on) { const p = PAIR.peers.get(m.id) || { mode: "server" }; p.seenT = Date.now(); p.t0 = p.t0 || Date.now(); PAIR.peers.set(m.id, p); } else pairDropPeer(m.id); pairUi(); if (m.on) pairPush(true); return; }
    if (m.t === "ping") {
      { const p = PAIR.peers.get(m.from); if (p) { const was = pairAwake(p); p.seenT = Date.now(); if (!was) pairUi(); } }   // v0.91.4: a device that checks in is awake
      const d = m.d || {};
      if (d.chk != null) {                                             // v0.82: a device asks "am I up to date?": it says what it has
        const ok = String(d.chk) === pairSig(JSON.stringify(Object.assign(pairState(), { cb: undefined })));   // v0.92: the combat screen is not part of the check
        if (!ok) { PAIR.sent = ""; pairPush(true); }                   // it is behind: the news again, at once
        pairSend({ t: "pong", to: m.from, d: { chk: 1, ok, n: d.n } }); return; }
      pairSend({ t: "pong", to: m.from, d: m.d }); return; }
    if (m.t === "sig") { pairHostSig(m.from, m.d || {}); return; }
    return;
  }
  // viewer
  if (m.t === "kicked") { pairRemoved(); return; }
  if (m.t === "hello") { pairSend({ t: "hi", n: pairDevName() }); PAIR.hostOn = !!m.host; if (m.s) pairApply(m.s); pairUi(); pairRtcStart(); PAIR.chk = null; PAIR.nextChk = Date.now() + 1500; return; }   // v0.82: check soon after (re)joining
  if (m.t === "host") { PAIR.hostOn = !!m.on; pairUi(); syncShow(); if (m.on && PAIR.mode !== "server") pairRtcStart(); if (m.on) { PAIR.chk = null; PAIR.miss = 0; PAIR.nextChk = Date.now() + 1500; } return; }
  if (m.t === "state") { pairApply(m.s); return; }
  if (m.t === "cb") { if (PAIR.role === "view" && !(m.at && m.at < (PAIR.cbT || 0))) { PAIR.cbT = m.at || Date.now(); try { cbRemote(m.c && typeof m.c === "object" ? m.c : null); } catch (e) {} } return; }   // v0.92: passed on by the server, never kept there
  if (m.t === "pong") { if (m.d && m.d.chk) { pairChecked(m.d); return; } pairPong(m.d, "server"); return; }
  if (m.t === "sig") { pairViewSig(m.d || {}); return; }
}

// ---- host: share what Sync knows, when it changes
function pairState() {
  return { v: 1, here: SYNC.here || "", at: SYNC.at || null, live: SYNC.live || null, dest: SYNC.dest || null,
    closed: !!SYNC.closed, sc: !!SYNC.sc, jumping: SYNC.jumping || "", rt: syncRouteInfo(60), n: SYNC.newsT || 0, fc: [...FC.recs.values()].slice(0, 4), cb: typeof cbLiveView === "function" ? cbLiveView() : null };   // v0.91: the combat screen   // v0.90.7: your carriers   // v0.78: the route, when the news is from
}
function pairPush(force) {
  if (PAIR.role !== "host" || !SYNC.on || SYNC.remote) return;
  const s = pairState(); let k = JSON.stringify(s);
  // v0.91: the room passes at most 8 KB a message: a long route and a fight together are trimmed to fit (the route's far end first)
  if (k.length > 7400 && s.rt && s.rt.hops && s.rt.hops.length > 12) { s.rt = Object.assign({}, s.rt, { hops: s.rt.hops.slice(0, 12) }); k = JSON.stringify(s); }
  if (k.length > 7400 && s.cb && s.cb.ep && s.cb.ep.kills) { s.cb = Object.assign({}, s.cb, { ep: Object.assign({}, s.cb.ep, { kills: s.cb.ep.kills.slice(0, 5) }) }); k = JSON.stringify(s); }
  if (!force && k === PAIR.sent) return;
  PAIR.sent = k; s.t = Date.now(); PAIR.pushT = Date.now();
  const msg = JSON.stringify({ t: "state", s });
  // v0.92: through the server, the combat screen goes as its own message that the server only passes on and never keeps.
  // The server keeps only the "where am I" summary (for a device that joins later). The direct links get it all in one
  const keep = Object.assign({}, s); delete keep.cb;
  pairSend({ t: "state", s: keep });
  const ck = JSON.stringify(s.cb || null); if (force || ck !== PAIR.cbSent) { PAIR.cbSent = ck; pairSend({ t: "cb", c: s.cb || null, at: s.t }); }
  for (const p of PAIR.peers.values()) if (p.dc && p.dc.readyState === "open") { try { p.dc.send(msg); } catch (e) {} }
}
async function pairHostStart(again) {
  if (!SYNC.ok || !SYNC.on) { toast("Turn on Sync with the game first."); return; }
  let r, j;
  try { r = await fetch(`${API}/room${again && PAIR.room ? `?room=${PAIR.room}` : ""}`, { method: "POST" }); j = await r.json(); } catch (e) { j = null; }
  if (!r || !r.ok || !j || !j.room) { toast((j && j.error) || "Pairing is not available right now."); return; }
  const fresh = PAIR.room !== j.room;
  PAIR.role = "host"; PAIR.room = j.room; PAIR.code = j.code; PAIR.exp = j.exp;
  pairSet(PAIR_LS.host, { room: j.room, t: Date.now() });
  if (fresh || !PAIR.ws) pairOpen();
  pairBeat(true); pairDialog(); pairUi();
}
function pairHostStop() {
  pairSet(PAIR_LS.host, null);
  for (const id of [...PAIR.peers.keys()]) pairDropPeer(id);
  PAIR.role = ""; const ws = PAIR.ws; PAIR.ws = null; try { ws && ws.close(); } catch (e) {}
  PAIR.room = ""; PAIR.code = ""; clearTimeout(PAIR.timer); pairBeat(false); pairUi();
  const d = $("pairDlg"); if (d) d.style.display = "none";
}
// v0.76 kept only the Journal reading and the sending on a worker's beat while devices followed; v0.78's heartbeat, the
// 15 s repeat and the silence check ran on a page timer, which the browser slows to once a minute behind the game, so the
// computer dropped its own link. v0.78.6: everything runs on TICK (30-sync.js), one worker clock for all of Sync
function pairBeat(on) {}
// host side of a direct link: answer the viewer's offer
async function pairHostSig(from, d) {
  if (!PAIR_RTC) return;
  let p = PAIR.peers.get(from); if (!p) { p = { mode: "server" }; PAIR.peers.set(from, p); }
  if (d.mode) { p.mode = d.mode; if (d.mode === "server") pairDropRtc(p); pairUi(); return; }
  try {
    if (d.sdp && d.sdp.type === "offer") {
      pairDropRtc(p);
      const pc = p.pc = new RTCPeerConnection({ iceServers: [] });     // same network only: no outside servers are asked
      pc.onicecandidate = e => { if (e.candidate) pairSend({ t: "sig", to: from, d: { c: e.candidate } }); };
      pc.ondatachannel = e => { p.dc = e.channel; p.dc.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (x) { return; } if (m.t === "ping") { p.seenT = Date.now(); try { p.dc.send(JSON.stringify({ t: "pong", d: m.d })); } catch (x) {} } };
        p.dc.onopen = () => { PAIR.sent = ""; pairPush(true); }; };
      await pc.setRemoteDescription(d.sdp); const ans = await pc.createAnswer(); await pc.setLocalDescription(ans);
      pairSend({ t: "sig", to: from, d: { sdp: pc.localDescription } });
    } else if (d.c && p.pc) await p.pc.addIceCandidate(d.c);
  } catch (e) {}
}
function pairDropRtc(p) { try { p.dc && p.dc.close(); } catch (e) {} try { p.pc && p.pc.close(); } catch (e) {} p.dc = null; p.pc = null; }
// v0.91.4: a following device checks in every 10 s while its screen is on; quiet for 40 s means it is asleep (screen off,
// app in the background) even though its link is still open. The computer shows that instead of a green "following"
const PAIR_MAX = 4;                                                    // the room server takes up to 4 devices per computer
const pairAwake = p => !!p && Date.now() - (p.seenT || 0) < 40000;
function pairCounts() { let a = 0, s = 0; for (const p of PAIR.peers.values()) pairAwake(p) ? a++ : s++; return { a, s, n: a + s }; }
function pairDropPeer(id) { const p = PAIR.peers.get(id); if (p) pairDropRtc(p); PAIR.peers.delete(id); }

// ---- viewer: follow the computer
async function pairJoin(room) {
  if (!room) return;
  if (SYNC.on && !SYNC.remote) { toast("This computer already syncs with the game itself."); return; }
  PAIR.role = "view"; PAIR.room = room; PAIR.got = false;
  const saved = pairGet(PAIR_LS.view); PAIR.mode = saved && saved.room === room ? saved.mode || "" : "";
  pairSet(PAIR_LS.view, { room, mode: PAIR.mode, t: Date.now() });
  SYNC.remote = true; SYNC.on = true; SYNC.byClick = true; document.body.classList.add("paired"); pfullSet(true); pfullMap();
  pairOpen(); pairUi(); syncShow();
}
async function pairJoinCode(code) {
  code = String(code || "").replace(/\D/g, "");
  if (code.length !== 6) { toast("The code has 6 digits."); return; }
  let r, j; try { r = await fetch(`${API}/room?code=${code}`); j = await r.json(); } catch (e) { j = null; }
  if (!r || !r.ok || !j || !j.room) { toast((j && j.error) || "That code did not work. Check it on your computer."); return; }
  pairJoin(j.room);
}
// v0.94: what kind of device this is, so the computer can tell its devices apart (only the kind, never a name or an id)
function pairDevName() {
  const u = navigator.userAgent || "";
  const os = /iPhone/.test(u) ? "iPhone" : /iPad/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1) ? "iPad" : /Android/.test(u) ? (/Mobile/.test(u) ? "Android phone" : "Android tablet")
    : /Windows/.test(u) ? "Windows PC" : /Mac/.test(u) ? "Mac" : /CrOS/.test(u) ? "Chromebook" : /Linux/.test(u) ? "Linux" : "Device";
  const br = /Edg\//.test(u) ? "Edge" : /SamsungBrowser/.test(u) ? "Samsung Internet" : /Firefox|FxiOS/.test(u) ? "Firefox" : /CriOS|Chrome/.test(u) ? "Chrome" : /Safari/.test(u) ? "Safari" : "";
  return br ? `${os} · ${br}` : os;
}
// this device was removed by the computer it followed: it leaves and forgets the link (opening it again starts over)
function pairRemoved() {
  if (PAIR.role !== "view") return;
  PAIR.retry = 0; clearTimeout(PAIR.timer); pairLeave();
  status("The computer you followed stopped sharing with this device.", true); setTimeout(() => status(""), 8000);
}
// the computer: stop one device following (×), or every device and a fresh link, so the old link no longer works
function pairKick(id) { pairSend({ t: "kick", to: id }); pairDropPeer(id); pairUi(); }
async function pairNewLink() {
  pairSend({ t: "kick", to: "*" });
  for (const id of [...PAIR.peers.keys()]) pairDropPeer(id);
  const ws = PAIR.ws; PAIR.ws = null; setTimeout(() => { try { ws && ws.close(1000, "new link"); } catch (e) {} }, 400);
  PAIR.room = ""; PAIR.code = ""; pairSet(PAIR_LS.host, null);
  await pairHostStart(false);
  toast("New link and code: the old ones no longer work");
}
function pairLeave() {
  pairSet(PAIR_LS.view, null);
  PAIR.role = ""; const ws = PAIR.ws; PAIR.ws = null; try { ws && ws.close(); } catch (e) {}
  pairViewDropRtc(); clearTimeout(PAIR.timer);
  SYNC.remote = false; SYNC.on = false; SYNC.here = ""; SYNC.at = null; SYNC.live = null; SYNC.dest = null; SYNC.closed = false; SYNC.sc = false; PAIR.mode = "";
  document.body.classList.remove("paired"); yahUpdate(); syncShow(); pairUi();
}
function pairApply(s) {
  if (!s || typeof s !== "object" || PAIR.role !== "view") return;
  PAIR.hostT = Date.now();                                             // v0.78: the computer is there (it also says so every 15 s)
  if (s.t && s.t <= PAIR.lastT) return;                                // the same news by the other way: already seen
  PAIR.lastT = s.t || Date.now();
  { const r = Object.assign({}, s); delete r.t; delete r.cb; PAIR.sig = pairSig(JSON.stringify(r)); }   // v0.82: what this device has, to compare with the computer
  const first = !PAIR.got; PAIR.got = true;
  const here = typeof s.here === "string" ? s.here.slice(0, 120) : "", moved = here !== SYNC.here;
  if (moved) { SYNC.prev = SYNC.here; SYNC.here = here; }
  SYNC.at = s.at && typeof s.at === "object" ? s.at : null; SYNC.live = s.live && typeof s.live === "object" ? s.live : null;
  SYNC.dest = s.dest && typeof s.dest === "object" ? s.dest : null; SYNC.closed = !!s.closed; SYNC.sc = !!s.sc;
  const wasJ = SYNC.jumping;
  SYNC.jumping = typeof s.jumping === "string" ? s.jumping.slice(0, 120) : "";
  if (SYNC.jumping && SYNC.jumping !== wasJ && !first) syncJumpFx();     // v0.78: the jump sound on the phone too
  SYNC.rt = s.rt && typeof s.rt === "object" ? s.rt : null; SYNC.newsT = +s.n || 0;
  if ("cb" in s) try { cbRemote(s.cb && typeof s.cb === "object" ? s.cb : null); } catch (e) {}   // v0.91: the computer's combat screen (v0.92: only when it came along)
  if (Array.isArray(s.fc)) { FC.recs.clear(); for (const r of s.fc.slice(0, 4)) if (r && +r.id) FC.recs.set(+r.id, r); fcTick(); }   // v0.90.7: the computer's carriers
  if (SYNC.jumping) syncPrefetch(SYNC.jumping);
  if (moved || first) syncArrive(first); else { yahUpdate(); syncShow(); }
}
// v0.82: "am I in step with the computer?" A phone or tablet asks every 10 s, and at once when it wakes up or comes back
// online. It sends a short fingerprint of what it shows; the computer compares it with its own and sends the news again
// when they differ. Two questions without an answer: the link is rebuilt (the server then hands over the latest news).
function pairSig(t) { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0; return h.toString(36); }
function pairCheck() {
  if (PAIR.role !== "view" || !PAIR.hostOn || !PAIR.ws || PAIR.ws.readyState !== 1) return;
  const now = Date.now();
  if (PAIR.chk) { if (now - PAIR.chk.t < 7000) return; PAIR.chk = null; PAIR.miss++; syncShow();   // no answer
    if (PAIR.miss >= 2) { PAIR.miss = 0; PAIR.lastT = 0; PAIR.retry = 0; pairDropWs(); clearTimeout(PAIR.timer); pairOpen(); return; } }
  PAIR.chk = { t: now, n: ++PAIR.chkN }; PAIR.nextChk = now + 10000;
  pairSend({ t: "ping", to: "host", d: { chk: PAIR.sig || "-", n: PAIR.chk.n } });
}
function pairChecked(d) {
  if (!PAIR.chk || d.n !== PAIR.chk.n) return;
  const was = PAIR.miss; PAIR.chk = null; PAIR.miss = 0; PAIR.okT = Date.now(); PAIR.inStep = !!d.ok;
  if (d.ok === undefined) { PAIR.nextChk = Date.now() + 60000; return; }   // a computer still on an older GRAVITAS only echoes: it is there, nothing more to ask
  if (!d.ok) PAIR.nextChk = Date.now() + 2500;                        // the news is on its way: check once more shortly
  if (was) syncShow();
}
function pairWake() {                                                  // the page is shown again, or the network is back
  if (PAIR.role !== "view") return;
  const stale = !PAIR.ws || PAIR.ws.readyState > 1 || Date.now() - (PAIR.wsT || 0) > 20000;
  if (stale) { PAIR.retry = 0; clearTimeout(PAIR.timer); if (PAIR.ws) pairDropWs(); clearTimeout(PAIR.timer); pairOpen(); return; }   // asleep too long: a fresh link at once
  PAIR.chk = null; pairCheck();
}
// direct link: the viewer asks, a few quick tries, then compares the two ways once and keeps the faster
async function pairRtcStart() {
  if (!PAIR_RTC || PAIR.role !== "view" || !PAIR.hostOn || PAIR.mode === "server" || PAIR.pc) return;
  for (let n = 0; n < 2 && PAIR.role === "view"; n++) {
    if (await pairRtcTry()) { await pairDecide(); return; }
  }
  pairSetMode("server");
}
function pairRtcTry() {
  return new Promise(async ok => {
    pairViewDropRtc();
    let done = false; const fin = v => { if (done) return; done = true; clearTimeout(to); if (!v) pairViewDropRtc(); ok(v); };
    const to = setTimeout(() => fin(false), 3500);
    try {
      const pc = PAIR.pc = new RTCPeerConnection({ iceServers: [] });
      const dc = PAIR.dc = pc.createDataChannel("g", { ordered: true });
      dc.onopen = () => fin(true);
      dc.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } if (m.t === "state") pairApply(m.s); else if (m.t === "pong") pairPong(m.d, "direct"); };
      dc.onclose = () => { if (PAIR.dc === dc && PAIR.mode === "direct") { PAIR.mode = ""; pairUi(); syncShow(); setTimeout(pairRtcStart, 2000); } };
      pc.onicecandidate = e => { if (e.candidate) pairSend({ t: "sig", to: "host", d: { c: e.candidate } }); };
      const off = await pc.createOffer(); await pc.setLocalDescription(off);
      pairSend({ t: "sig", to: "host", d: { sdp: pc.localDescription } });
    } catch (e) { fin(false); }
  });
}
async function pairViewSig(d) { try { if (!PAIR.pc) return; if (d.sdp) await PAIR.pc.setRemoteDescription(d.sdp); else if (d.c) await PAIR.pc.addIceCandidate(d.c); } catch (e) {} }
function pairViewDropRtc() { try { PAIR.dc && PAIR.dc.close(); } catch (e) {} try { PAIR.pc && PAIR.pc.close(); } catch (e) {} PAIR.dc = null; PAIR.pc = null; }
// five timing pings each way; the direct link wins only when clearly faster (otherwise the server way is simpler)
const PING = { wait: new Map() };
function pairPong(d, way) { const w = d && PING.wait.get(d.n); if (w && w.way === way) { PING.wait.delete(d.n); w.ok(performance.now() - w.t0); } }
function pairPing(way, n) {
  return new Promise(ok => {
    PING.wait.set(n, { way, t0: performance.now(), ok });
    const d = { n };
    if (way === "direct") { try { PAIR.dc.send(JSON.stringify({ t: "ping", d })); } catch (e) {} } else pairSend({ t: "ping", to: "host", d });
    setTimeout(() => { if (PING.wait.has(n)) { PING.wait.delete(n); ok(2000); } }, 2000);
  });
}
async function pairDecide() {
  const med = a => a.sort((x, y) => x - y)[a.length >> 1], A = [], B = [];
  for (let i = 0; i < 5; i++) { A.push(await pairPing("direct", 1e6 + i)); B.push(await pairPing("server", 2e6 + i)); }
  const direct = med(A), server = med(B);
  pairSetMode(direct < server * 0.7 && server - direct > 10 ? "direct" : "server", { direct: Math.round(direct), server: Math.round(server) });
}
function pairSetMode(mode, ms) {
  PAIR.mode = mode; if (mode === "server") pairViewDropRtc();
  pairSet(PAIR_LS.view, { room: PAIR.room, mode, t: Date.now(), ms });
  pairSend({ t: "sig", to: "host", d: { mode } });
  pairUi(); syncShow();
}

// ---- what the panels show
function pairUi() {
  const b = $("syncPair"); if (b) { const c = pairCounts(); b.style.display = SYNC.ok && SYNC.on && !SYNC.remote && !isPhone() ? "" : "none";
    b.classList.toggle("on", PAIR.role === "host" && c.a > 0); b.classList.toggle("wait", PAIR.role === "host" && !c.a);   // v0.91.4: green only while a device really follows
    b.title = PAIR.role === "host" ? (c.a ? `${c.a} device${c.a > 1 ? "s" : ""} following${c.s ? `, ${c.s} asleep` : ""}` : c.s ? `${c.s} device${c.s > 1 ? "s" : ""} asleep` : "Sharing: no device follows yet") : `Show this on a phone or tablet (up to ${PAIR_MAX} devices): it follows your ship too`; }
  const d = $("pairDlg"); if (d && d.style.display === "flex") pairDialogFill();
  syncPhoneRow();                                                     // v0.78: the phone line under the Sync card
}
const pairHow = () => PAIR.mode === "direct" ? "direct over your network" : PAIR.mode === "server" ? "through the GRAVITAS server" : "connecting…";
function pairDialog() {
  let d = $("pairDlg");
  if (!d) {
    d = document.createElement("div"); d.id = "pairDlg"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-label", "Show on a phone or tablet");
    d.innerHTML = `<div class="box"><div class="hd"><h3>SHOW ON A PHONE OR TABLET <small>· up to ${PAIR_MAX} devices</small></h3><button class="x" title="Close (Esc)">✕</button></div><div class="bd">
      <p>Your phone or tablet becomes a second screen: it follows your ship like this computer does. Up to ${PAIR_MAX} devices can follow at once.</p>
      <div class="pq"><div class="qr" aria-label="QR code for the pairing link"></div><div class="pc"><span>Scan with the phone's camera, or open <b>gravitasmap.com</b> on it, tap <b>About</b> and type this code:</span><b class="code"></b><em class="exp"></em><button class="new">New code</button></div></div>
      <p class="who"></p><ul class="devs"></ul>
      <p class="note">Shared: only the summary Sync shows here (system, body, station, landed or docked, your target, game closed). Your Journal stays on this computer. Keep this tab open: it keeps reading the Journal even behind the game.</p>
      <div class="act"><button class="newlink" title="Every device stops following, and the old link and code no longer work">New link</button><button class="stop">Stop sharing</button><button class="no">Close</button></div></div></div>`;
    document.body.appendChild(d);
    const close = () => { d.style.display = "none"; };
    d.querySelector(".x").onclick = close; d.querySelector(".no").onclick = close;
    d.addEventListener("click", e => { if (e.target === d) close(); const k = e.target.closest && e.target.closest("[data-kick]"); if (k) pairKick(k.dataset.kick); });
    d.querySelector(".newlink").onclick = pairNewLink;
    addEventListener("keydown", e => { if (e.key === "Escape" && d.style.display === "flex") close(); });
    d.querySelector(".stop").onclick = pairHostStop;
    d.querySelector(".new").onclick = () => pairHostStart(true);
  }
  d.style.display = "flex"; pairDialogFill(); pairQr();
}
function pairDialogFill() {
  const d = $("pairDlg"); if (!d) return;
  d.querySelector(".code").textContent = PAIR.code ? PAIR.code.replace(/(\d{3})(\d{3})/, "$1 $2") : "—";
  const left = PAIR.exp - Date.now();
  d.querySelector(".exp").textContent = PAIR.code ? (left > 0 ? `valid for ${Math.ceil(left / 60000)} more min (the QR code keeps working)` : "this code has expired · the QR code still works") : "";
  const c = pairCounts(), ways = [...PAIR.peers.values()].filter(pairAwake).map(p => p.mode === "direct" ? "direct" : "via server");
  d.querySelector(".who").textContent = !PAIR.ws ? "Connecting to the GRAVITAS server…" : c.n ? `${c.a ? `Following now: ${c.a} of ${PAIR_MAX} device${c.a > 1 ? "s" : ""} (${ways.join(", ")})` : "No device is awake"}${c.s ? `. Asleep: ${c.s} (screen off or app in the background: it catches up when it wakes)` : ""}` : `No device follows yet (up to ${PAIR_MAX}).`;
  // v0.94: each device, with × to stop it following
  const hm = t => { const x = new Date(t); return `${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`; };
  const list = [...PAIR.peers.entries()].map(([id, p]) => `<li class="${pairAwake(p) ? "" : "zz"}"><span class="dn">${esc(p.n || "A device")}</span><span class="dm">${pairAwake(p) ? (p.mode === "direct" ? "direct" : "via server") : "asleep"}${p.t0 ? ` · since ${hm(p.t0)}` : ""}</span><button type="button" data-kick="${esc(id)}" title="Stop this device following" aria-label="Stop this device following">×</button></li>`).join("");
  const ul = d.querySelector(".devs"); if (ul.innerHTML !== list) ul.innerHTML = list;
}
function pairLink() { return `${location.origin}/?pair=${PAIR.room}`; }
let _qrLoad = null;
function pairQr() {
  const box = $("pairDlg") && $("pairDlg").querySelector(".qr"); if (!box || !PAIR.room) return;
  const draw = () => {
    try { const q = window.qrcode(0, "M"); q.addData(pairLink()); q.make();
      const n = q.getModuleCount(), cs = 4; let p = "";
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) p += `M${c + cs} ${r + cs}h1v1h-1z`;
      box.innerHTML = `<svg viewBox="0 0 ${n + 2 * cs} ${n + 2 * cs}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${p}" fill="#000"/></svg>`;
    } catch (e) { box.textContent = pairLink(); }
  };
  if (window.qrcode) return draw();
  if (!_qrLoad) _qrLoad = new Promise((ok, no) => { const s = document.createElement("script"); s.src = "/vendor/qrcode-generator@1.4.4/qrcode.js"; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  _qrLoad.then(draw, () => { box.textContent = pairLink(); });
}
// the "join with a code" box, for phones (About sheet) and browsers without Sync (the Sync panel)
function pairJoinBox(host) {
  if (!host || host.querySelector(".pjoin")) return;
  const f = document.createElement("form"); f.className = "pjoin";
  f.innerHTML = `<span>Follow a computer running GRAVITAS with Sync: type the code it shows under <b>Devices</b>.</span><input inputmode="numeric" maxlength="7" placeholder="6-digit code" aria-label="Pairing code"><button>Follow</button>`;
  f.onsubmit = e => { e.preventDefault(); pairJoinCode(f.querySelector("input").value); };
  host.appendChild(f);
}

// ---- wiring
{
  const so = document.querySelector("#sync .so");
  if (so && !$("syncPair")) { const b = document.createElement("button"); b.id = "syncPair"; b.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4.4" y="1.6" width="7.2" height="12.8" rx="1.6"/><path d="M7 12.2h2"/></svg>Devices'; b.title = "Show this on a phone or tablet (up to 4 devices): it follows your ship too"; b.onclick = () => (PAIR.role === "host" ? pairDialog() : pairHostStart(false)); so.insertBefore(b, $("syncDir")); }
  pairJoinBox($("credits")); pairJoinBox($("sync"));
  TICK.add(() => {                                                     // v0.78.6: the worker's clock (see 30-sync.js), not a page timer
    // v0.78: a quiet link is noticed. Both sides say "still here" to the server every 15 s (answered by the server itself,
    // without waking the room), the computer repeats its news every 15 s, and a link silent for 45 s is rebuilt
    const now = Date.now();
    if (PAIR.role && PAIR.ws && PAIR.ws.readyState === 1) {
      PAIR.badT = 0;
      if (now - (PAIR.hbT || 0) > 15000) { PAIR.hbT = now; try { PAIR.ws.send('{"t":"hb"}'); } catch (e) {} }
      if (now - (PAIR.wsT || now) > (document.hidden ? 120000 : 45000)) pairDropWs();   // v0.78.6: a hidden computer tab may still be slowed: more patience
    } else if (PAIR.role && PAIR.ws) {                                   // stuck while closing (a dead network never finishes the goodbye)
      if (!PAIR.badT) PAIR.badT = now; else if (now - PAIR.badT > 4000) pairDropWs();
    }
    if (PAIR.role === "host" && now - (PAIR.pushT || 0) > 15000) pairPush(true);
    if (PAIR.role === "view" && (now >= PAIR.nextChk || PAIR.chk)) pairCheck();   // v0.82: in step with the computer?
    pairPush(false); const d = $("pairDlg"); if (d && d.style.display === "flex") pairDialogFill();
    if (PAIR.role === "host") { const c = pairCounts(), k = c.a + "/" + c.s; if (k !== PAIR.awakeK) { PAIR.awakeK = k; pairUi(); } }   // v0.91.4: a device fell asleep or woke
    if (SYNC.remote && SYNC.at && SYNC.at.arrived && !YAH.away && Date.now() - SYNC.at.arrived > SYNC_ARRIVE_MS) yahUpdate();   // the arrival minute is over
  });
  for (const [t, ev] of [[document, "visibilitychange"], [window, "pageshow"], [window, "online"], [window, "focus"]])   // v0.82
    t.addEventListener(ev, () => { if (!document.hidden) pairWake(); });
  // a QR link: ?pair=ROOM (then the address is cleaned, so a shared link of the view never carries the pairing)
  const P = new URLSearchParams(location.search), q = P.get("pair");
  if (q && /^[a-z2-7]{20,32}$/.test(q)) { P.delete("pair"); history.replaceState(null, "", location.pathname + (P.toString() ? "?" + P : "") + location.hash); pairJoin(q); }
  else {
    const v = pairGet(PAIR_LS.view), h = pairGet(PAIR_LS.host), fresh = o => o && o.room && Date.now() - (o.t || 0) < 12 * 3600e3;
    if (fresh(v)) pairJoin(v.room);
    else if (fresh(h)) {                                               // this computer was sharing: share again once Sync is back on
      const wait = setInterval(() => { if (SYNC.on && !SYNC.remote) { clearInterval(wait); PAIR.role = "host"; PAIR.room = h.room; pairOpen(); pairBeat(true); pairUi(); } }, 1000);
      setTimeout(() => clearInterval(wait), 120000);
    }
  }
  pairUi();
}
