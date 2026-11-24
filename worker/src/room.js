// v0.76 Sync with GRAVITAS: one Durable Object per pairing ("room"), and one per 6-digit code (a short pointer to a room).
// What passes through: only the small "where am I" summary the computer's Sync already shows (system, body, station,
// docked or landed, the ship's target, game closed). The Journal itself never leaves the computer.
// A room keeps only its latest summary, and forgets everything 12 hours after the last connection closed.
// v0.92: the combat screen (message "cb") is only passed on to the paired devices. It is never stored.
// The site's Pages Functions (functions/api/room.js) reach these objects through the ROOMS binding.
import { codeTaken, codeLookup, linkLive, linkTake, LINK_MS, validHostKey, hashKey, sameHash, cleanState, cleanCb, cleanOp, cleanStr, devicesOf, DEV_MODES } from "./guard.js";
// v0.99.10: a browser cannot put a header on a WebSocket, and an address ends up in logs: the host key comes as the sub-protocol "gravitas.hk.<key>" (echoed back as it must be)
const HK_PROTO = "gravitas.hk.";
const protoOf = req => (req.headers.get("Sec-WebSocket-Protocol") || "").split(",").map(s => s.trim()).find(s => s.startsWith(HK_PROTO)) || "";
const IDLE_MS = 12 * 3600e3, CODE_MS = 5 * 60e3, MAX_VIEW = 4, MAX_MSG = 8192;
// v0.92 team boards (?kind=op): each CMDR who joins with their own GRAVITAS sends a small summary of their own fight
// (name, ship, kills, credits). It lives only on that CMDR's open connection and is passed on to everyone on the board.
// Nothing is written to storage: when a CMDR's connection closes, their summary is gone from the server.
const OP_CREW = 8, OP_WATCH = 24, OP_MSG = 1800;

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    // keep-alive pings are answered here without waking the object (they cost nothing)
    try { ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"hb"}', '{"t":"hb"}')); } catch (e) {}
  }
  async fetch(req) {
    const u = new URL(req.url), path = u.pathname;
    // ---- a 6-digit code: a pointer to a room for five minutes
    if (path.endsWith("/claim")) {
      const now = Date.now(), cur = await this.ctx.storage.get("code");
      if (codeTaken(cur, now)) return json({ ok: false }, 409);
      const room = u.searchParams.get("room") || "";
      if (!/^[a-z2-7]{20,32}$/.test(room)) return json({ ok: false }, 400);
      await this.ctx.storage.put("code", { room, exp: now + CODE_MS }); await this.ctx.storage.setAlarm(now + CODE_MS + 1000);
      return json({ ok: true, exp: now + CODE_MS });
    }
    if (path.endsWith("/get")) {
      // v0.99.9: a code is single-use. The first lookup uses it up; the same address may repeat it for 90 s (a phone that reloads)
      const now = Date.now(), r = codeLookup(await this.ctx.storage.get("code"), u.searchParams.get("ip"), now);
      if (r.next === "del") await this.ctx.storage.delete("code"); else if (r.next) { await this.ctx.storage.put("code", r.next); await this.ctx.storage.setAlarm(Math.min(r.next.exp, now + 90e3) + 1000); }
      return r.status === 200 ? json({ room: r.room }) : json({ error: "This code is not valid (any more)." }, 404);
    }
    // v0.99.11: a link code (this object is named "link:<CODE>"): a browser takes up the app's pairing with it. It keeps {room, hk, exp} for 2 minutes at most,
    // hands the pairing out ONCE and is gone (also when it expires: the alarm). Nothing here is logged. The key comes in a header, never in an address.
    if (path.endsWith("/linkmake")) {
      const hk = req.headers.get("X-Host-Key") || "", room = u.searchParams.get("room") || "", now = Date.now();
      if (!validHostKey(hk) || !/^[a-z2-7]{20,32}$/.test(room)) return json({ ok: false }, 400);
      if (linkLive(await this.ctx.storage.get("link"), now)) return json({ ok: false }, 409);   // the number is taken: another one
      await this.ctx.storage.put("link", { room, hk, exp: now + LINK_MS }); await this.ctx.storage.setAlarm(now + LINK_MS + 1000);
      return json({ ok: true, ttl: LINK_MS / 1000 });
    }
    if (path.endsWith("/linktake")) {
      const now = Date.now(), r = linkTake(await this.ctx.storage.get("link"), now);
      if (r.next === "del") await this.ctx.storage.delete("link");
      return r.status === 200 ? json({ room: r.room, hostKey: r.hk }) : json({ error: "This code is not valid (any more)." }, 404);
    }
    // v0.99.9: the host key. Made by the site's function when the pairing is created: only its hash is kept here
    if (path.endsWith("/init")) {
      const hk = u.searchParams.get("hk") || "", h = validHostKey(hk) ? await hashKey(hk) : "", cur = await this.ctx.storage.get("hk");
      if (!h || (cur && !sameHash(cur, h))) return json({ ok: false }, cur ? 409 : 400);
      if (!cur) { await this.ctx.storage.put("hk", h); await this.ctx.storage.setAlarm(Date.now() + IDLE_MS); }
      return json({ ok: true });
    }
    // v0.99.10: the device list for every place that holds the pairing (the Pages function checks the address limits, this checks the key).
    // The key comes in a header, never in the address. status = who follows, kick = stop one device (or "*" = all), stop = end the pairing for everyone.
    if (path.endsWith("/status") || path.endsWith("/kick") || path.endsWith("/stop") || path.endsWith("/verify")) {
      const hk = req.headers.get("X-Host-Key") || "", cur = await this.ctx.storage.get("hk");
      if (!cur) return json({ ok: false, gone: true }, 410);
      if (!(validHostKey(hk) && sameHash(cur, await hashKey(hk)))) return json({ ok: false }, 403);
      if (path.endsWith("/verify")) return json({ ok: true });   // v0.99.11: only "this key is the key of a live pairing" (a link code is made on it)
      if (path.endsWith("/stop")) { await this.stopRoom(); return json({ ok: true, stopped: true }); }
      if (path.endsWith("/kick")) { const to = u.searchParams.get("to") || ""; if (to === "*" || /^[0-9a-f]{8}$/.test(to)) this.kickViews(to); this.tellHosts(null, true); }
      return json(Object.assign({ ok: true }, this.list()));
    }
    if (path.endsWith("/auth")) {
      const hk = u.searchParams.get("hk") || "", cur = await this.ctx.storage.get("hk");
      return json({ ok: !!(cur && validHostKey(hk) && sameHash(cur, await hashKey(hk))) });
    }
    // ---- a room: WebSocket connections from the computer (host) and from phones or tablets (view)
    if (req.headers.get("Upgrade") !== "websocket") return json({ error: "expected a WebSocket" }, 426);
    if (u.searchParams.get("kind") === "op") return this.opJoin(u);
    const role = u.searchParams.get("role") === "host" ? "host" : "view", socks = this.ctx.getWebSockets();
    if (role === "host") {                                              // v0.99.9: only the computer that made the pairing may be its host
      const hk = protoOf(req).slice(HK_PROTO.length) || u.searchParams.get("hk") || req.headers.get("X-Host-Key") || "", cur = await this.ctx.storage.get("hk");
      if (!(cur && validHostKey(hk) && sameHash(cur, await hashKey(hk)))) {
        const gone = await this.ctx.storage.get("gone");                 // v0.99.10: 4004 = this pairing was stopped (calm), 4001 = the key is not known
        const bad = new WebSocketPair(), [bc, bs] = Object.values(bad); bs.accept(); bs.close(gone ? 4004 : 4001, gone ? "stopped" : "host key"); return new Response(null, { status: 101, webSocket: bc, headers: protoOf(req) ? { "Sec-WebSocket-Protocol": protoOf(req) } : {} }); }   // a clear 4001, the real host is not touched
    } else if (!(await this.ctx.storage.get("hk"))) {                  // v0.99.10: nobody joins a stopped pairing (a phone with an old link is told it was removed)
      const bad = new WebSocketPair(), [bc, bs] = Object.values(bad); bs.accept(); bs.close(4003, "stopped"); return new Response(null, { status: 101, webSocket: bc });
    }
    const views = socks.filter(w => (w.deserializeAttachment() || {}).role === "view");
    if (role === "view" && views.length >= MAX_VIEW) return json({ error: "This pairing already has the most devices it allows." }, 429);
    if (role === "host") for (const w of socks) if ((w.deserializeAttachment() || {}).role === "host") { try { w.close(4000, "replaced"); } catch (e) {} }
    const pair = new WebSocketPair(), [client, server] = Object.values(pair), id = crypto.randomUUID().slice(0, 8);
    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment(role === "view" ? { role, id, n: "", t0: Date.now(), seen: Date.now(), mode: "server" } : { role, id });
    const last = (await this.ctx.storage.get("s")) || null;
    const hostOn = role === "host" || socks.some(w => (w.deserializeAttachment() || {}).role === "host");
    server.send(JSON.stringify({ t: "hello", id, role, host: hostOn, s: role === "view" ? last : null, devs: role === "host" ? this.list().devices : undefined }));
    this.toRole(role === "host" ? "view" : "host", { t: role === "host" ? "host" : "join", on: true, id });
    if (role === "view") this.tellHosts(null, true);
    await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
    return new Response(null, { status: 101, webSocket: client, headers: role === "host" && protoOf(req) ? { "Sec-WebSocket-Protocol": protoOf(req) } : {} });
  }
  // ---- v0.92 a team board: crew (a CMDR's GRAVITAS with Sync on) and watchers (anyone with the link)
  opJoin(u) {
    const role = u.searchParams.get("role") === "crew" ? "crew" : "watch", n = this.ctx.getWebSockets(role).length;
    if (n >= (role === "crew" ? OP_CREW : OP_WATCH)) return json({ error: "This board is full." }, 429);
    // v0.92.4: a CMDR keeps one row. Their GRAVITAS sends the same short key each time it connects (k), so a new
    // connection takes over the old one instead of adding a second row (before, the board counted 1, 2, 3... while one CMDR sat idle)
    const k = u.searchParams.get("k") || "", id = role === "crew" && /^[a-z2-7]{8,16}$/.test(k) ? k : crypto.randomUUID().slice(0, 8);
    if (role === "crew") for (const w of this.ctx.getWebSockets("crew")) { const a = w.deserializeAttachment() || {}; if (a.id === id) { try { w.serializeAttachment(Object.assign({}, a, { s: null, rep: 1 })); w.close(4001, "replaced"); } catch (e) {} } }
    const pair = new WebSocketPair(), [client, server] = Object.values(pair);
    const c = crypto.randomUUID().slice(0, 6);   // this connection's own number: a late "left" from an old connection is then ignored
    this.ctx.acceptWebSocket(server, [role]); server.serializeAttachment({ role, id, c, op: 1, s: null });
    server.send(JSON.stringify({ t: "ophello", id, role, all: this.opAll() }));
    return new Response(null, { status: 101, webSocket: client });
  }
  opAll() { return this.ctx.getWebSockets("crew").map(w => { const a = w.deserializeAttachment() || {}; return a.s ? { id: a.id, c: a.c, s: a.s } : null; }).filter(Boolean); }
  opSend(m) { const s = JSON.stringify(m); for (const w of this.ctx.getWebSockets()) { try { w.send(s); } catch (e) {} } }
  async webSocketMessage(ws, msg) {
    if (typeof msg !== "string" || msg.length > MAX_MSG) return;
    let m; try { m = JSON.parse(msg); } catch (e) { return; }
    const me = ws.deserializeAttachment() || {};
    if (me.op) {                                                        // a team board: kept on the connection only, passed on
      if (m.t === "op" && me.role === "crew" && m.s && typeof m.s === "object" && msg.length <= OP_MSG) { const s = cleanOp(m.s); ws.serializeAttachment(Object.assign({}, me, { s })); this.opSend({ t: "op", id: me.id, c: me.c, s }); }
      return;
    }
    if (m.t === "state" && me.role === "host" && m.s && typeof m.s === "object") {
      const s = cleanState(m.s); if (!s) return;                         // v0.99.9: only the summary's own keys, typed and cut
      await this.ctx.storage.put("s", s);
      this.toRole("view", { t: "state", s });
    } else if (m.t === "cb" && me.role === "host") {
      // v0.92: the combat screen: passed on to the paired devices as it comes, never written to storage
      this.toRole("view", { t: "cb", c: cleanCb(m.c), at: Math.max(0, Math.min(8e15, +m.at || 0)) });
    } else if (m.t === "hi" && me.role === "view") {
      // v0.94: a device says what kind it is ("Android phone · Chrome"), so the computer can list its devices. Passed on, not kept
      // v0.99.10: the room keeps it with this device's open connection (gone when the device leaves), so every place that holds the pairing can list it
      const n = cleanStr(m.n, 40); ws.serializeAttachment(Object.assign({}, me, { n, seen: Date.now() }));
      this.toRole("host", { t: "hi", id: me.id, n }); this.tellHosts(null, true);
    } else if (m.t === "kick" && me.role === "host" && typeof m.to === "string") {
      // v0.94: the computer stops a device following (or all of them, "*", before it makes a new link)
      this.kickViews(m.to); this.tellHosts(null, true);
    } else if ((m.t === "sig" || m.t === "ping" || m.t === "pong") && typeof m.to === "string") {
      if (me.role === "view") {                                           // v0.99.10: a device that checks in is awake; how it is linked is part of its row
        const mode = m.t === "sig" && m.d && DEV_MODES.includes(m.d.mode) ? m.d.mode : me.mode;
        ws.serializeAttachment(Object.assign({}, me, m.t === "ping" ? { seen: Date.now(), mode } : { mode })); this.tellHosts(null, m.t === "sig");
      }
      // WebRTC set-up messages and the timing pings between the two ends, passed on to the one they are for
      const to = m.to === "host" ? this.ctx.getWebSockets("host")[0] : this.ctx.getWebSockets("view").find(w => (w.deserializeAttachment() || {}).id === m.to);
      if (to) try { to.send(JSON.stringify({ t: m.t, from: me.role === "host" ? "host" : me.id, d: m.d })); } catch (e) {}
    }
  }
  // v0.78.3: answer the other side's close, as Cloudflare's own examples do, so the link ends cleanly on both sides
  // (only 1000 and 3000-4999 may be sent: any other code is answered with a normal close)
  async webSocketClose(ws, code) { try { ws.close(code >= 3000 && code <= 4999 ? code : 1000, "bye"); } catch (e) {}
    { const me = ws.deserializeAttachment() || {}; if (me.op) { this.opGone(ws, me); return; } }
    this.left(ws); if (this.ctx.getWebSockets().length <= 1) await this.ctx.storage.setAlarm(Date.now() + IDLE_MS); }
  async webSocketError(ws) { const me = ws.deserializeAttachment() || {}; if (me.op) { this.opGone(ws, me); return; } this.left(ws); }
  // a CMDR's row leaves the board only when they have no other open connection (a replaced one says nothing)
  opGone(ws, me) { if (me.role !== "crew" || me.rep) return; if (this.ctx.getWebSockets("crew").some(w => w !== ws && (w.deserializeAttachment() || {}).id === me.id)) return; this.opSend({ t: "opleft", id: me.id, c: me.c }); }
  left(ws) {
    const me = ws.deserializeAttachment() || {};
    if (me.role === "host") { if (!this.ctx.getWebSockets("host").some(w => w !== ws)) this.toRole("view", { t: "host", on: false }); }   // v0.99.10: a replaced host says nothing while the new one is there
    else this.toRole("host", { t: "join", on: false, id: me.id });
    this.tellHosts(ws, true);                                            // v0.99.10: the list again, without the one that just left
  }
  // ---- v0.99.10 the device list
  list(except) {
    const views = this.ctx.getWebSockets("view").filter(w => w !== except).map(w => w.deserializeAttachment() || {});
    return { hostOn: this.ctx.getWebSockets("host").filter(w => w !== except).length > 0, devices: devicesOf(views, Date.now()), max: MAX_VIEW };
  }
  // the computers hear the list when it changes (a device joins, leaves, says what it is, is removed, wakes up); a burst of check-ins is sent at most every 3 s
  tellHosts(except, force) {
    const now = Date.now(); if (!force && now - (this.devT || 0) < 3000) return; this.devT = now;
    const l = this.list(except); this.toRole("host", { t: "devs", on: l.hostOn, d: l.devices });
  }
  kickViews(to) {
    for (const w of this.ctx.getWebSockets("view")) { const a = w.deserializeAttachment() || {};
      if (to === "*" || a.id === to) { try { w.serializeAttachment(Object.assign({}, a, { out: 1 })); w.send(JSON.stringify({ t: "kicked" })); w.close(4003, "removed"); } catch (e) {} } }
  }
  // the pairing ends for everybody: devices are removed, computers are told, the key and the last summary are wiped (a tombstone stays until the room is forgotten)
  async stopRoom() {
    this.kickViews("*");
    for (const w of this.ctx.getWebSockets("host")) { try { w.send(JSON.stringify({ t: "stopped" })); w.close(4004, "stopped"); } catch (e) {} }
    await this.ctx.storage.deleteAll(); await this.ctx.storage.put("gone", 1); await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
  }
  toRole(role, m) { const s = JSON.stringify(m); for (const w of this.ctx.getWebSockets(role)) { try { w.send(s); } catch (e) {} } }
  async alarm() {
    const live = this.ctx.getWebSockets().length;
    const link = await this.ctx.storage.get("link");
    if (link && linkLive(link, Date.now())) { await this.ctx.storage.setAlarm(link.exp + 1000); return; }   // (not over yet)
    if (link) { await this.ctx.storage.deleteAll(); return; }                                              // v0.99.11: a link code that ran out is wiped, key and all
    const code = await this.ctx.storage.get("code");
    if (code && !codeTaken(code, Date.now())) { await this.ctx.storage.deleteAll(); return; }
    if (live) await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
    else if (!code) await this.ctx.storage.deleteAll();                // nobody for 12 hours: the room forgets everything
  }
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" } });

// the Worker itself answers nothing on its own (it has no public address); the site talks to the objects
export default { async fetch() { return new Response("GRAVITAS rooms", { status: 404 }); } };
