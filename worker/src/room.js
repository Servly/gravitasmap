// v0.76 Sync with GRAVITAS: one Durable Object per pairing ("room"), and one per 6-digit code (a short pointer to a room).
// What passes through: only the small "where am I" summary the computer's Sync already shows (system, body, station,
// docked or landed, the ship's target, game closed). The Journal itself never leaves the computer.
// A room keeps only its latest summary, and forgets everything 12 hours after the last connection closed.
// v0.92: the combat screen (message "cb") is only passed on to the paired devices. It is never stored.
// The site's Pages Functions (functions/api/room.js) reach these objects through the ROOMS binding.
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
      if (cur && cur.exp > now) return json({ ok: false }, 409);
      const room = u.searchParams.get("room") || "";
      if (!/^[a-z2-7]{20,32}$/.test(room)) return json({ ok: false }, 400);
      await this.ctx.storage.put("code", { room, exp: now + CODE_MS }); await this.ctx.storage.setAlarm(now + CODE_MS + 1000);
      return json({ ok: true, exp: now + CODE_MS });
    }
    if (path.endsWith("/get")) {
      const cur = await this.ctx.storage.get("code");
      return cur && cur.exp > Date.now() ? json({ room: cur.room }) : json({ error: "This code is not valid (any more)." }, 404);
    }
    // ---- a room: WebSocket connections from the computer (host) and from phones or tablets (view)
    if (req.headers.get("Upgrade") !== "websocket") return json({ error: "expected a WebSocket" }, 426);
    if (u.searchParams.get("kind") === "op") return this.opJoin(u);
    const role = u.searchParams.get("role") === "host" ? "host" : "view", socks = this.ctx.getWebSockets();
    const views = socks.filter(w => (w.deserializeAttachment() || {}).role === "view");
    if (role === "view" && views.length >= MAX_VIEW) return json({ error: "This pairing already has the most devices it allows." }, 429);
    if (role === "host") for (const w of socks) if ((w.deserializeAttachment() || {}).role === "host") { try { w.close(4000, "replaced"); } catch (e) {} }
    const pair = new WebSocketPair(), [client, server] = Object.values(pair), id = crypto.randomUUID().slice(0, 8);
    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment({ role, id });
    const last = (await this.ctx.storage.get("s")) || null;
    const hostOn = role === "host" || socks.some(w => (w.deserializeAttachment() || {}).role === "host");
    server.send(JSON.stringify({ t: "hello", id, role, host: hostOn, s: role === "view" ? last : null }));
    this.toRole(role === "host" ? "view" : "host", { t: role === "host" ? "host" : "join", on: true, id });
    await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
    return new Response(null, { status: 101, webSocket: client });
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
      if (m.t === "op" && me.role === "crew" && m.s && typeof m.s === "object" && msg.length <= OP_MSG) { ws.serializeAttachment(Object.assign({}, me, { s: m.s })); this.opSend({ t: "op", id: me.id, c: me.c, s: m.s }); }
      return;
    }
    if (m.t === "state" && me.role === "host" && m.s && typeof m.s === "object") {
      await this.ctx.storage.put("s", m.s);
      this.toRole("view", { t: "state", s: m.s });
    } else if (m.t === "cb" && me.role === "host") {
      // v0.92: the combat screen: passed on to the paired devices as it comes, never written to storage
      this.toRole("view", { t: "cb", c: m.c && typeof m.c === "object" ? m.c : null, at: +m.at || 0 });
    } else if (m.t === "hi" && me.role === "view") {
      // v0.94: a device says what kind it is ("Android phone · Chrome"), so the computer can list its devices. Passed on, not kept
      this.toRole("host", { t: "hi", id: me.id, n: String(m.n || "").slice(0, 40) });
    } else if (m.t === "kick" && me.role === "host" && typeof m.to === "string") {
      // v0.94: the computer stops a device following (or all of them, "*", before it makes a new link)
      for (const w of this.ctx.getWebSockets("view")) { const a = w.deserializeAttachment() || {};
        if (m.to === "*" || a.id === m.to) { try { w.send(JSON.stringify({ t: "kicked" })); w.close(4003, "removed"); } catch (e) {} } }
    } else if ((m.t === "sig" || m.t === "ping" || m.t === "pong") && typeof m.to === "string") {
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
    if (me.role === "host") this.toRole("view", { t: "host", on: false });
    else this.toRole("host", { t: "join", on: false, id: me.id });
  }
  toRole(role, m) { const s = JSON.stringify(m); for (const w of this.ctx.getWebSockets(role)) { try { w.send(s); } catch (e) {} } }
  async alarm() {
    const live = this.ctx.getWebSockets().length;
    const code = await this.ctx.storage.get("code");
    if (code && code.exp <= Date.now()) { await this.ctx.storage.deleteAll(); return; }
    if (live) await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
    else if (!code) await this.ctx.storage.deleteAll();                // nobody for 12 hours: the room forgets everything
  }
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" } });

// the Worker itself answers nothing on its own (it has no public address); the site talks to the objects
export default { async fetch() { return new Response("GRAVITAS rooms", { status: 404 }); } };
