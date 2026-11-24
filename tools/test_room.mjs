// node tools/test_room.mjs : the v0.99.9 hardening of pairing, team boards and reports, with Cloudflare pretended (no network).
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { codeLookup, codeTaken, CODE_GRACE_MS, validHostKey, hashKey, sameHash, cleanState, cleanCb, cleanOp, deepClean } from "../worker/src/guard.js";
import { limitStep, rateLimit, ipKey, WINDOW_MS } from "../lib/room-limit.js";
import { imageKind, readCapped } from "../lib/report-guard.js";
import { Room } from "../worker/src/room.js";
import { onRequest } from "../functions/api/room.js";

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log("FAIL:", m); } else console.log("ok:  ", m); };

// ---- single-use codes with a 90 s grace for the same address
{
  const cur = { room: "r", exp: 1e6 };
  let r = codeLookup(cur, "A", 1000);
  ok(r.status === 200 && r.room === "r" && r.next.used.ip === "A", "first lookup works and uses the code up");
  const used = r.next;
  r = codeLookup(used, "A", 1000 + 60e3); ok(r.status === 200 && r.next === null, "same address again within 90 s: still answered");
  r = codeLookup(used, "B", 1000 + 5e3); ok(r.status === 404, "another address right after: not valid");
  r = codeLookup(used, "A", 1000 + CODE_GRACE_MS + 1); ok(r.status === 404 && r.next === "del", "same address after the grace: not valid, record deleted");
  ok(codeLookup({ room: "r", exp: 500 }, "A", 1000).status === 404, "an expired code is not valid");
  ok(codeLookup(null, "A", 1000).status === 404, "an unknown code is not valid");
  ok(codeTaken(used, 1000 + CODE_GRACE_MS + 1) === false && codeTaken(used, 1000 + 1) === true, "a used code frees its number after the grace");
}
// ---- host key
{
  const k = "0123456789abcdef0123456789abcdef", h = await hashKey(k);
  ok(validHostKey(k) && !validHostKey("xyz") && !validHostKey(k + "0") && !validHostKey(null), "host key format: 32 hex digits");
  ok(sameHash(h, await hashKey(k)) && !sameHash(h, await hashKey(k.replace("0", "1"))) && !sameHash(h, "short"), "key check: right key yes, wrong key no");
}
// ---- limiter
{
  let rec = null, n = 0;
  for (let i = 0; i < 12; i++) { const r = limitStep(rec, 1000 + i, 12); if (r.ok) n++; rec = r.rec; }
  ok(n === 12, "12 lookups pass");
  let r = limitStep(rec, 2000, 12); ok(!r.ok && r.retry > 500 && r.retry <= 600, "the 13th is refused with a retry time (" + r.retry + " s)");
  r = limitStep(rec, 1000 + WINDOW_MS + 1, 12); ok(r.ok && r.rec.n === 1, "a new window starts after 10 minutes");
  const m = new Map(), cache = { match: async q => m.has(q.url) ? new Response(m.get(q.url)) : null, put: async (q, rs) => { m.set(q.url, await rs.text()); } };
  const ik = await ipKey("1.2.3.4"), ik2 = await ipKey("5.6.7.8"); let pass = 0;
  for (let i = 0; i < 15; i++) if ((await rateLimit(cache, "https://x", "code", ik, 12, WINDOW_MS, 5000)).ok) pass++;
  ok(pass === 12, "through the cache: 12 pass, the rest refused");
  ok((await rateLimit(cache, "https://x", "code", ik2, 12, WINDOW_MS, 5000)).ok, "another address is not affected");
  ok((await rateLimit({ match: async () => { throw new Error("x"); }, put: async () => {} }, "https://x", "c", ik, 1)).ok, "a broken cache lets the request through");
}
// ---- the room objects and the Pages function together (fake storage, fake binding)
// a pretend WebSocket (the object keeps its sockets, like Cloudflare's hibernation API: a closed one may still be listed for a moment)
class FWS { constructor() { this.sent = []; this.closed = null; this.att = null; this.tags = []; } accept() {} send(m) { this.sent.push(JSON.parse(m)); } close(c, r) { this.closed = { c, r }; }
  serializeAttachment(a) { this.att = JSON.parse(JSON.stringify(a)); } deserializeAttachment() { return this.att; } }
globalThis.WebSocketPair = class { constructor() { this[0] = new FWS(); this[1] = new FWS(); FWS.last = this[1]; } };
const R0 = Response;   // Node cannot build a status 101: the pretend one keeps the socket and reports 101
globalThis.Response = class extends R0 { constructor(b, i) { if (i && i.status === 101) { super(null, { status: 200, headers: i.headers }); this.webSocket = i.webSocket; Object.defineProperty(this, "status", { value: 101 }); } else super(b, i); } };
function fakeNS() {
  const objs = new Map();
  const mk = () => { const mem = new Map(), socks = [];
    const ctx = { storage: { get: async k => mem.get(k), put: async (k, v) => { mem.set(k, v); }, delete: async k => { mem.delete(k); }, deleteAll: async () => mem.clear(), setAlarm: async () => {} },
      getWebSockets: tag => socks.filter(s => !s.dropped && (!tag || s.tags.includes(tag))), acceptWebSocket: (s, tags) => { s.tags = tags; socks.push(s); }, setWebSocketAutoResponse() {} };
    const r = new Room(ctx, {}); r.ctx = ctx; return r; };
  return { idFromName: n => n, raw: n => { if (!objs.has(n)) objs.set(n, mk()); return objs.get(n); }, get: n => { const o = NSraw(objs, n, mk); return { fetch: (u, init) => o.fetch(typeof u === "string" ? new Request(u, init) : u) }; } };
}
function NSraw(objs, n, mk) { if (!objs.has(n)) objs.set(n, mk()); return objs.get(n); }
const cacheMem = new Map();
globalThis.caches = { default: { match: async q => cacheMem.has(q.url) ? new Response(cacheMem.get(q.url)) : null, put: async (q, rs) => { cacheMem.set(q.url, await rs.text()); } } };
const origin = "https://gravitasmap.com";
const call = (NS, path, o = {}) => onRequest({ request: new Request(origin + path, { method: o.method || "GET", headers: Object.assign({ "CF-Connecting-IP": o.ip || "9.9.9.9" }, o.origin === false ? {} : { Origin: origin }, o.headers || {}) }), env: { ROOMS: NS } });
const clearRl = () => { for (const k of [...cacheMem.keys()]) if (k.includes("/api/_rl/room/")) cacheMem.delete(k); };   // the 5 s spacing is Cloudflare's own max-age, not under test here
{
  const NS = fakeNS();
  let r = await call(NS, "/api/room", { method: "POST" }), j = await r.json();
  ok(r.status === 200 && /^[a-z2-7]{20}$/.test(j.room) && /^\d{6}$/.test(j.code) && /^[0-9a-f]{32}$/.test(j.hostKey), "create returns room, 6-digit code and a 16-byte host key");
  const first = j; clearRl();
  r = await call(NS, "/api/room?code=" + first.code, { ip: "1.1.1.1" }); j = await r.json(); ok(r.status === 200 && j.room === first.room, "a phone's lookup works");
  r = await call(NS, "/api/room?code=" + first.code, { ip: "1.1.1.1" }); j = await r.json(); ok(r.status === 200 && j.room === first.room, "the same phone reloading within 90 s works");
  r = await call(NS, "/api/room?code=" + first.code, { ip: "2.2.2.2" }); ok(r.status === 404, "another address cannot reuse the code");
  clearRl();
  r = await call(NS, "/api/room?room=" + first.room, { method: "POST", headers: { "X-Host-Key": first.hostKey } }); j = await r.json();
  ok(r.status === 200 && j.room === first.room && !j.hostKey && /^\d{6}$/.test(j.code), "a new code for the same pairing with the right key: same room, no new key");
  clearRl();
  r = await call(NS, "/api/room?room=" + first.room, { method: "POST", headers: { "X-Host-Key": "f".repeat(32) } }); j = await r.json();
  ok(r.status === 200 && j.room !== first.room && j.hostKey, "with a wrong key the room is NOT reused: a fresh pairing is made");
  clearRl();
  r = await call(NS, "/api/room?room=" + first.room, { method: "POST" }); j = await r.json();
  ok(j.room !== first.room, "without a key the room is not reused either");
  r = await call(NS, `/api/room?room=${first.room}&role=host`, { headers: { Upgrade: "websocket" } }); ok(r.status === 403, "role=host without a key: 403");
  r = await call(NS, `/api/room?room=${first.room}&role=host&hk=${first.hostKey}`, { origin: false, headers: { Upgrade: "websocket" } }); ok(r.status === 403, "a websocket without an Origin is refused");
  r = await call(NS, `/api/room?code=123456`, { origin: false, ip: "8.8.8.8" }); ok(r.status === 404, "a plain GET of a code without Origin still goes through the limiter (unknown code: 404)");
  r = await call(NS, "/api/room", { method: "POST", origin: false }); ok(r.status === 403, "POST without an Origin is refused");
  const room = NS.get("room:" + first.room);
  ok((await (await room.fetch(`https://room/auth?hk=${first.hostKey}`)).json()).ok === true && (await (await room.fetch(`https://room/auth?hk=${"0".repeat(32)}`)).json()).ok === false, "the room checks the key (only its hash is stored)");
  r = await room.fetch(`https://room/init?hk=${"0".repeat(32)}`); ok(r.status === 409, "the key of a room cannot be replaced");
  const NS2 = fakeNS(); const st = [];
  for (let i = 0; i < 14; i++) st.push((await call(NS2, "/api/room?code=" + (100000 + i), { ip: "3.3.3.3" })).status);
  ok(st.slice(0, 12).every(x => x === 404) && st[12] === 429 && st[13] === 429, "13th code lookup in 10 minutes: 429");
  r = await call(NS2, "/api/room?code=100000", { ip: "3.3.3.3" }); j = await r.json(); ok(r.status === 429 && j.error && j.retry > 0 && r.headers.get("Retry-After"), "the 429 has {error, retry} and Retry-After");
  ok((await call(NS2, "/api/room?code=100000", { ip: "4.4.4.4" })).status === 404, "another address is not limited");
  const NS3 = fakeNS(); const cs = [];
  for (let i = 0; i < 22; i++) { clearRl(); cs.push((await call(NS3, "/api/room", { method: "POST", ip: "6.6.6.6" })).status); }
  ok(cs.slice(0, 20).every(x => x === 200) && cs[20] === 429, "create: 20 per 10 minutes, then 429");
}
// ---- v0.99.10 the device list: every place that holds the pairing sees and manages the same list
{
  const NS = fakeNS(); clearRl();
  let r = await call(NS, "/api/room", { method: "POST", ip: "20.0.0.1" }); const P = await r.json(), hk = P.hostKey, room = P.room, obj = NS.raw("room:" + room);
  const st = (h, o = {}) => call(NS, `/api/room?room=${room}&do=status`, Object.assign({ origin: false, ip: "20.0.0.2", headers: h === null ? {} : { "X-Host-Key": h || hk } }, o));
  const up = (role, key) => obj.fetch(new Request(`https://room/?room=${room}&role=${role}${key ? "&hk=" + key : ""}`, { headers: { Upgrade: "websocket" } }));
  const sock = async (role, key) => { await up(role, key); return FWS.last; };   // (the object talks through the server end of the pair)
  const msg = (ws, m) => obj.webSocketMessage(ws, JSON.stringify(m));
  // auth and shape
  ok((await st(null)).status === 400, "status without a key: 400");
  ok((await st("f".repeat(32))).status === 403, "status with a wrong key: 403");
  ok((await call(NS, `/api/room?room=${room}&do=status`, { origin: false, ip: "20.0.0.2", method: "POST", headers: { "X-Host-Key": hk } })).status === 405, "status by POST: 405");
  ok((await call(NS, `/api/room?room=${room}&do=status`, { ip: "20.0.0.2", headers: { "X-Host-Key": hk, Origin: "https://evil.example" } })).status === 403, "a foreign Origin is refused even with the key");
  r = await st(); let j = await r.json();
  ok(r.status === 200 && j.ok && j.hostOn === false && Array.isArray(j.devices) && j.devices.length === 0 && j.max === 4, "status with the key: no host, no devices, max 4");
  ok(r.headers.get("Cache-Control") === "no-store", "status is never cached");
  // two phones join; one says what it is
  const v1 = await sock("view"), v2 = await sock("view");
  const host = await sock("host", hk);
  ok(host.sent[0].t === "hello" && host.sent[0].devs.length === 2, "a host that connects is handed the device list at once");
  await msg(v1, { t: "hi", n: "Android phone · Chrome<b>" }); await msg(v2, { t: "hi", n: "iPad · Safari" });
  const text = await (await st()).text(); j = JSON.parse(text);
  ok(j.devices.length === 2 && j.devices[0].n === "Android phone · Chromeb" && j.devices.every(d => d.awake && /^[0-9a-f]{8}$/.test(d.id) && d.since > 0), "status lists both devices with name (markup stripped), awake, since");
  ok(!text.includes(hk) && !/hk|hash|hostKey/i.test(text), "the list never carries the key or its hash");
  ok(host.sent.some(m => m.t === "devs" && m.d.length === 2 && m.d.some(d => d.n === "iPad · Safari")), "the connected computer is told about the devices as they come");
  await msg(v1, { t: "sig", to: "host", d: { mode: "direct" } });
  j = await (await st()).json(); ok(j.devices.find(d => d.id === v1.att.id).mode === "direct" && j.devices.find(d => d.id === v2.att.id).mode === "server", "the way a device is linked (direct / server) is part of its row");
  // a device that went quiet is asleep
  v2.att.seen = Date.now() - 41000; j = await (await st()).json(); ok(j.devices.find(d => d.id === v2.att.id).awake === false && j.devices.find(d => d.id === v1.att.id).awake === true, "quiet for 40 s = asleep");
  await msg(v2, { t: "ping", to: "host", d: { n: 1 } }); j = await (await st()).json(); ok(j.devices.find(d => d.id === v2.att.id).awake, "a check-in wakes it in the list");
  // remove one: by HTTP, from a place that has no socket at all
  const bad = await call(NS, `/api/room?room=${room}&do=kick&to=zz`, { method: "POST", origin: false, ip: "20.0.0.2", headers: { "X-Host-Key": hk } }); ok(bad.status === 400, "kick with a bad device id: 400");
  const wrong = await call(NS, `/api/room?room=${room}&do=kick&to=${v1.att.id}`, { method: "POST", origin: false, ip: "20.0.0.3", headers: { "X-Host-Key": "e".repeat(32) } }); ok(wrong.status === 403 && !v1.closed, "kick with a wrong key: 403, nothing removed");
  r = await call(NS, `/api/room?room=${room}&do=kick&to=${v1.att.id}`, { method: "POST", origin: false, ip: "20.0.0.2", headers: { "X-Host-Key": hk } }); j = await r.json();
  ok(r.status === 200 && j.devices.length === 1 && j.devices[0].id === v2.att.id, "kick removes that device from the list at once (even while its socket lingers)");
  ok(v1.sent.some(m => m.t === "kicked") && v1.closed.c === 4003 && !v2.closed, "the removed device is told and closed (4003), the other is untouched");
  ok(host.sent.at(-1).t === "devs" && host.sent.at(-1).d.length === 1, "the connected computer hears the removal");
  // a device leaving by itself
  v2.dropped = true; await obj.webSocketClose(v2, 1001); j = await (await st()).json(); ok(j.devices.length === 0, "a device that leaves disappears from the list");
  // two holders: only one pushes, the other manages, nobody flaps
  const hostB = await sock("host", hk);
  ok(host.closed && host.closed.c === 4000 && !hostB.closed, "a second computer with the key replaces the first one (4000): only one pushes");
  const v3 = await sock("view"); v3.sent.length = 0;
  await obj.webSocketClose(host, 4000);
  ok(!v3.sent.some(m => m.t === "host" && m.on === false), "the replaced computer's goodbye does not tell the phones the host is gone");
  j = await (await st()).json(); ok(j.hostOn === true, "status says a host is on");
  const intruder = await sock("host", "d".repeat(32)); ok(intruder.closed && intruder.closed.c === 4001 && !hostB.closed, "a host with a wrong key is closed (4001) and the real host is not touched");
  // stop
  ok((await call(NS, `/api/room?room=${room}&do=stop`, { method: "POST", origin: false, ip: "20.0.0.4", headers: { "X-Host-Key": "e".repeat(32) } })).status === 403 && !v3.closed, "stop with a wrong key: 403, nothing happens");
  r = await call(NS, `/api/room?room=${room}&do=stop`, { method: "POST", origin: false, ip: "20.0.0.2", headers: { "X-Host-Key": hk } }); j = await r.json();
  ok(r.status === 200 && j.stopped && v3.closed.c === 4003 && hostB.closed.c === 4004 && hostB.sent.some(m => m.t === "stopped"), "stop: devices removed (4003), the computer is told (4004)");
  ok((await st()).status === 410, "after stop the key opens nothing: status 410 (gone)");
  const late = await sock("view"); ok(late.closed && late.closed.c === 4003, "nobody can join a stopped pairing: an old link is told it was removed");
  const lateHost = await sock("host", hk); ok(lateHost.closed && lateHost.closed.c === 4004, "the old key as a host: closed with 4004 (stopped), not a retry loop");
  ok((await obj.ctx.storage.get("s")) === undefined && (await obj.ctx.storage.get("hk")) === undefined, "stop wiped the key and the last summary");
  // limits
  const NS2 = fakeNS(); clearRl();
  r = await call(NS2, "/api/room", { method: "POST", ip: "21.0.0.1" }); const Q = await r.json(); const s2 = ip => call(NS2, `/api/room?room=${Q.room}&do=status`, { origin: false, ip, headers: { "X-Host-Key": ip === "21.0.0.9" ? "c".repeat(32) : Q.hostKey } });
  const codes = []; for (let i = 0; i < 22; i++) codes.push((await s2("21.0.0.9")).status);
  ok(codes.slice(0, 20).every(x => x === 403) && codes[20] === 429 && codes[21] === 429, "20 wrong keys from one address, then 429");
  ok((await s2("21.0.0.8")).status === 200, "another address is not affected by that");
  let last = 0, n = 0; for (let i = 0; i < 905; i++) { last = (await s2("21.0.0.7")).status; if (last === 200) n++; }
  ok(n === 900 && last === 429, "900 status calls in 10 minutes are fine (three places polling every 5 s), then 429: " + n);
}
// the host key as a WebSocket sub-protocol (never in the address)
{
  const NS = fakeNS(); clearRl();
  const P = await (await call(NS, "/api/room", { method: "POST", ip: "22.0.0.1" })).json(), obj = NS.raw("room:" + P.room);
  const ws = (key, headers) => call(NS, `/api/room?room=${P.room}&role=host`, { ip: "22.0.0.2", headers: Object.assign({ Upgrade: "websocket" }, headers || (key ? { "Sec-WebSocket-Protocol": "gravitas.hk." + key } : {})) });
  let r = await ws(P.hostKey); const s1 = FWS.last;
  ok(r.status === 101 && r.headers.get("Sec-WebSocket-Protocol") === "gravitas.hk." + P.hostKey && !s1.closed && s1.sent[0].t === "hello", "host link with the key as sub-protocol: accepted, the sub-protocol is echoed, no key in the address");
  r = await ws("a".repeat(32)); const s2 = FWS.last;
  ok(r.status === 101 && s2.closed && s2.closed.c === 4001 && r.headers.get("Sec-WebSocket-Protocol") === "gravitas.hk." + "a".repeat(32) && !s1.closed, "a wrong key as sub-protocol: closed 4001 (and echoed, so the browser sees the code), the real host untouched");
  r = await ws(null, { "Sec-WebSocket-Protocol": "chat, gravitas.hk.zz" }); ok(r.status === 403, "a malformed key in the sub-protocol: 403 before the room is asked");
  r = await ws(P.hostKey, { "Sec-WebSocket-Protocol": "other, gravitas.hk." + P.hostKey }); ok(r.status === 101 && r.headers.get("Sec-WebSocket-Protocol") === "gravitas.hk." + P.hostKey, "other sub-protocols in the list are ignored");
  const src = readFileSync(new URL("../src/js/33-pair.js", import.meta.url), "utf8");
  ok(/new WebSocket\(u, \["gravitas\.hk\." \+ PAIR\.hk\]\)/.test(src), "the page opens the host link with the key as sub-protocol");
}
{
  const { devicesOf, AWAKE_MS } = await import("../worker/src/guard.js");
  const d = devicesOf([{ id: "b", n: "B", t0: 5, seen: 100, mode: "direct" }, { id: "a", n: "A<x>", t0: 1, seen: 100 }, { id: "gone", out: 1 }, null, { n: "noid" }], 100 + AWAKE_MS - 1);
  ok(d.length === 2 && d[0].id === "a" && d[0].n === "Ax" && d[0].mode === "server" && d[1].mode === "direct" && d.every(x => x.awake), "devicesOf: oldest first, cleaned names, removed and broken entries dropped");
  ok(devicesOf([{ id: "a", seen: 100 }], 100 + AWAKE_MS)[0].awake === false, "devicesOf: 40 s quiet is asleep");
  ok(devicesOf([{ id: "a", seen: 100 }], 100 + 7000)[0].ago === 7000, "devicesOf: says how long ago the device checked in");
}
// ---- v0.99.11 the link code: a browser takes up the app's pairing
{
  const { linkNorm, linkShow, linkMake, LINK_ALPHABET, LINK_RE, linkTake, linkLive } = await import("../worker/src/guard.js");
  ok(LINK_ALPHABET.length === 32 && new Set(LINK_ALPHABET).size === 32 && !/[IO01]/.test(LINK_ALPHABET), "link alphabet: 32 different characters, no I O 0 1 (40 bits in 8 characters)");
  const A = LINK_ALPHABET;
  ok(linkMake(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])) === "ABCDEFGH" && linkMake(new Uint8Array([255, 224, 32, 63, 31, 0, 95, 128])) === [A[31], A[0], A[0], A[31], A[31], A[0], A[31], A[0]].join(""), "link code: a byte maps by its low 5 bits (256 / 32: no bias)");
  ok(linkNorm("abcd-efgh") === "ABCDEFGH" && linkNorm(" ABCD EFGH ") === "ABCDEFGH" && linkNorm("ABCD-EFG") === "" && linkNorm("ABCD-EFGO") === "" && linkNorm("ABCD-EFG1") === "" && linkNorm(null) === "" && linkNorm("ABCD-EFGHJ") === "", "typed codes: case, spaces and the dash do not matter; wrong length or O 0 1 I are not codes");
  ok(linkShow("ABCDEFGH") === "ABCD-EFGH" && LINK_RE.test("ABCDEFGH"), "a code is shown as ABCD-EFGH");
  ok(linkTake({ room: "r", hk: "k", exp: 1000 }, 999).status === 200 && linkTake({ room: "r", hk: "k", exp: 1000 }, 1000).status === 404 && linkTake(null, 1).status === 404 && linkTake({ room: "r", exp: 5000 }, 1).status === 404, "linkTake: live once, nothing at or after its end, nothing without room and key");
  ok(linkLive({ room: "r", hk: "k", exp: 10 }, 9) && !linkLive({ room: "r", hk: "k", exp: 10 }, 10), "linkLive: until exp");

  const realNow = Date.now; let T = realNow(); Date.now = () => T;   // a fake clock (the objects and the limiter read Date.now)
  const mkPair = async ip => { clearRl(); const NS = fakeNS(); const P = await (await call(NS, "/api/room", { method: "POST", ip })).json(); return { NS, ...P, obj: NS.raw("room:" + P.room) }; };
  const mkCode = (X, key, ip) => call(X.NS, `/api/room?room=${X.room}&do=linkcode`, { method: "POST", origin: false, ip: ip || "30.0.0.2", headers: key === null ? {} : { "X-Host-Key": key || X.hostKey } });
  const redeem = (X, code, ip, o = {}) => call(X.NS, `/api/room?do=link`, Object.assign({ method: "POST", ip: ip || "30.1.0.1", headers: { "X-Link-Code": code } }, o));
  const rec = (X, code) => X.NS.raw("link:" + code.replace("-", "")).ctx.storage.get("link");
  {
    const X = await mkPair("30.0.0.1");
    ok((await mkCode(X, null)).status === 400, "linkcode without a key: 400");
    let r = await mkCode(X, "f".repeat(32)); ok(r.status === 403, "linkcode with a wrong key: 403");
    r = await call(X.NS, `/api/room?room=${X.room}&do=linkcode`, { origin: false, ip: "30.0.0.2", headers: { "X-Host-Key": X.hostKey } }); ok(r.status === 405, "linkcode by GET: 405");
    r = await call(X.NS, `/api/room?room=${X.room}&do=linkcode`, { method: "POST", ip: "30.0.0.2", headers: { "X-Host-Key": X.hostKey, Origin: "https://evil.example" } }); ok(r.status === 403, "linkcode with a foreign Origin: 403");
    r = await mkCode(X); const text = await r.text(), j = JSON.parse(text);
    ok(r.status === 200 && /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(j.code) && j.ttl === 120 && r.headers.get("Cache-Control") === "no-store", "linkcode with the key: ABCD-EFGH, 120 s, no-store");
    ok(!text.includes(X.hostKey) && !text.includes(X.room), "the linkcode answer carries neither the key nor the room");
    ok((await rec(X, j.code)).hk === X.hostKey, "(while the code lives, the code object holds the key: that is how it can hand it out)");
    const st = await (await call(X.NS, `/api/room?room=${X.room}&do=status`, { origin: false, ip: "30.0.0.2", headers: { "X-Host-Key": X.hostKey } })).text();
    ok(!st.includes(j.code.replace("-", "")) && !/hostKey|"hk"/.test(st), "the device list shows neither a code nor a key");
    // redeem: typed in lower case with a space instead of the dash
    r = await redeem(X, j.code.toLowerCase().replace("-", " "), "30.1.0.1");
    const got = await r.json();
    ok(r.status === 200 && got.room === X.room && got.hostKey === X.hostKey && r.headers.get("Cache-Control") === "no-store", "redeem: the pairing's room and key, once, no-store (any case, a space instead of the dash)");
    const sts = await call(X.NS, `/api/room?room=${got.room}&do=status`, { origin: false, ip: "30.0.0.3", headers: { "X-Host-Key": got.hostKey } }); ok(sts.status === 200, "the key that was handed out opens the pairing's list");
    const again = await redeem(X, j.code, "30.1.0.1"), againT = await again.text();
    ok(again.status === 404 && !againT.includes(X.hostKey), "the code works once: the second look is 404, from the same address too (no grace for link codes)");
    ok((await rec(X, j.code)) === undefined, "the used code's record (and the key in it) is gone from storage");
    ok(!JSON.stringify(await Promise.all(["hk", "s", "code", "link"].map(k => X.obj.ctx.storage.get(k)))).includes(X.hostKey), "the room itself still holds only the key's hash");
    // same answer for wrong, used, expired
    const wrong = await redeem(X, "ZZZZ-ZZZZ", "30.1.0.2"), wt = await wrong.text();
    const c2 = (await (await mkCode(X)).json()).code; T += 121e3;
    const exp = await redeem(X, c2, "30.1.0.3"), et = await exp.text();
    ok(wrong.status === 404 && again.status === 404 && exp.status === 404 && wt === againT && wt === et, "wrong, used and expired codes: the same 404 and the same words");
    ok((await rec(X, c2)) === undefined, "(an expired code is wiped by the look itself)");
    const c2b = (await (await mkCode(X)).json()).code; T += 121e3; await X.NS.raw("link:" + c2b.replace("-", "")).alarm();
    ok((await rec(X, c2b)) === undefined, "an expired code nobody looked at is wiped by the object's alarm, key and all");
    const c2c = (await (await mkCode(X)).json()).code; T += 30e3; await X.NS.raw("link:" + c2c.replace("-", "")).alarm();
    ok((await rec(X, c2c)) !== undefined, "an alarm that comes early does not wipe a live code");
    T += 91e3;
    // expiry edge
    const c3 = (await (await mkCode(X)).json()).code; T += 119e3;
    ok((await redeem(X, c3, "30.1.0.4")).status === 200, "a code still works at 119 s");
    const c4 = (await (await mkCode(X)).json()).code; T += 120e3 - 1;
    ok((await redeem(X, c4, "30.1.0.5")).status === 200, "a code works up to its last millisecond");
    const c5 = (await (await mkCode(X)).json()).code; T += 120e3;
    ok((await redeem(X, c5, "30.1.0.6")).status === 404, "a code is dead at 120 s");
  }
  {
    // the attempt limit
    const X = await mkPair("31.0.0.1"), good = (await (await mkCode(X, X.hostKey, "31.0.0.2")).json()).code;
    const st = []; for (let i = 0; i < 7; i++) st.push((await redeem(X, "AAAA-AAA" + "BCDEFGH"[i], "31.1.0.1")).status);
    ok(st.slice(0, 5).every(s => s === 404) && st[5] === 429 && st[6] === 429, "5 wrong codes from one address, then 429 (" + st.join(",") + ")");
    const blocked = await redeem(X, good, "31.1.0.1"); ok(blocked.status === 429 && blocked.headers.get("Retry-After"), "the RIGHT code from a blocked address is refused too (429, Retry-After)");
    ok((await rec(X, good)) !== undefined, "a refused try does not burn the code");
    const other = await redeem(X, good, "31.1.0.2"); ok(other.status === 200, "another address redeems the right code");
    T += 601e3; const X2 = await mkPair("31.0.0.9"), g2 = (await (await mkCode(X2, X2.hostKey, "31.0.0.8")).json()).code;
    ok((await redeem(X2, g2, "31.1.0.1")).status === 200, "after the ten minutes the address is free again");
    // a malformed code is not a try and gets its own calm 400
    const bad = []; for (let i = 0; i < 8; i++) bad.push((await redeem(X2, i % 2 ? "short" : "OOOO-0000", "31.1.0.7")).status);
    ok(bad.every(s => s === 400), "a malformed code: 400 and it does not count as a wrong try");
    ok((await redeem(X2, "ABCD-EFGH", "31.1.0.7", { origin: false })).status === 403 && (await redeem(X2, "ABCD-EFGH", "31.1.0.7", { headers: { "X-Link-Code": "ABCD-EFGH", Origin: "https://evil.example" } })).status === 403, "redeem needs a same-site Origin: none or a foreign one is 403");
    ok((await call(X2.NS, `/api/room?do=link`, { ip: "31.1.0.7", headers: { "X-Link-Code": "ABCD-EFGH" } })).status === 405, "redeem by GET: 405");
  }
  {
    // a stopped pairing's code is dead
    const X = await mkPair("32.0.0.1"), c = (await (await mkCode(X)).json()).code;
    const stop = await call(X.NS, `/api/room?room=${X.room}&do=stop`, { method: "POST", origin: false, ip: "32.0.0.2", headers: { "X-Host-Key": X.hostKey } }); ok(stop.status === 200, "(the pairing is stopped)");
    const r = await redeem(X, c, "32.1.0.1"), t = await r.text(); ok(r.status === 404 && !t.includes(X.hostKey), "a stopped pairing's code is dead: the same 404");
    ok((await rec(X, c)) === undefined, "and the key is not left in the code object");
    ok((await mkCode(X)).status === 410, "no new code for a stopped pairing: 410");
    // the code objects, and the limit of new codes
    const Y = await mkPair("32.0.0.3"); const codes = []; for (let i = 0; i < 12; i++) codes.push((await mkCode(Y, Y.hostKey, "32.0.0.4")).status);
    ok(codes.slice(0, 10).every(s => s === 200) && codes[10] === 429 && codes[11] === 429, "10 new link codes per address per 10 minutes, then 429");
    const o = Y.NS.raw("link:AAAAAAAA"), mk = () => o.fetch(new Request(`https://room/linkmake?room=${Y.room}`, { headers: { "X-Host-Key": Y.hostKey } }));
    ok((await mk()).status === 200, "a code object takes a pairing"); ok((await mk()).status === 409, "a live number is not handed out twice (the function picks another)");
    ok((await Y.NS.raw("link:CCCCCCCC").fetch(new Request(`https://room/linkmake?room=bad`, { headers: { "X-Host-Key": "x" } }))).status === 400, "a code object refuses a bad room or key");
    ok((await Y.NS.raw("link:BBBBBBBB").fetch(new Request("https://room/linktake"))).status === 404, "an empty code object: 404");
    // nothing logs the code or the key
    const src = ["../functions/api/room.js", "../worker/src/room.js", "../worker/src/guard.js", "../lib/room-limit.js"].map(f => readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");
    ok(!/console\.(log|info|warn|error|debug)/.test(src), "no console logging anywhere in the pairing server code");
    ok(/headers\.get\("X-Link-Code"\)/.test(src) && !/searchParams\.get\("link/.test(src), "the link code travels in a header, not in an address");
  }
  Date.now = realNow;
}
// ---- what a host may relay
{
  const s = cleanState({ v: 1, here: "Sol<script>", at: { a: "x\"y" }, evil: "no", fc: [{ id: 1 }], n: "7", t: 5 });
  ok(!("evil" in s) && s.here === "Solscript" && s.at.a === "xy" && s.fc[0].id === 1 && s.v === 1, "state: unknown keys dropped, markup stripped");
  ok(cleanState("x") === null && cleanState([1]) === null, "state: not an object is dropped");
  const c = cleanCb({ on: true, ep: { n: 5, cr: 1e30, kills: Array.from({ length: 500 }, (_, i) => ({ pilot: "<img src=x onerror=1>" + i })) } });
  ok(c.ep.cr === 1e15 && c.ep.kills.length === 200 && !/[<>]/.test(c.ep.kills[0].pilot), "cb: numbers clamped, lists cut, markup stripped");
  const deep = JSON.parse('{"a":'.repeat(20) + "1" + "}".repeat(20)); ok(JSON.stringify(deepClean(deep)).length < 200, "deep nesting is cut");
  const p = cleanCb(JSON.parse('{"__proto__":{"x":1},"ok":1}')); ok(Object.keys(p).join() === "ok", "the __proto__ key is dropped");
  const o = cleanOp({ c: "A<b>", sh: "x".repeat(99), on: 5, n: "9", cr: "1e99", ph: "<i>", top: { p: "\"><svg>", s: 3, cr: 4 }, op: { n: "<", site: 1, sys: "s" }, extra: 1 });
  ok(o.c === "Ab" && o.sh.length === 30 && o.on === 1 && o.n === 9 && o.cr === 1e15 && o.ph === 0 && o.top.p === "svg" && !("extra" in o), "op row: typed fields only, coerced");
}
// ---- the client's own cleaners, read out of the source files
{
  const grab = (file, from, to) => { const t = readFileSync(new URL("../src/js/" + file, import.meta.url), "utf8"); const i = t.indexOf(from), j = t.indexOf(to, i); if (i < 0 || j < 0) throw new Error("marker " + from); return t.slice(i, j); };
  const ctx = vm.createContext({}); vm.runInContext(grab("33-pair.js", "function remoteClean", "// END remoteClean") + ";this.remoteClean=remoteClean;", ctx);
  const rc = ctx.remoteClean;
  const out = rc({ a: "<img onerror=1>\"`x\u0001", n: 1e99, nn: -Infinity, arr: new Array(300).fill(1), "<k>": 1, ok: [true, null] });
  ok(out.a === "img onerror=1x" && out.n === 1e15 && out.nn === 0 && out.arr.length === 200 && !("<k>" in out) && out.ok[0] === true, "client remoteClean: strips, clamps, cuts, drops odd keys");
  ok(Object.keys(rc(JSON.parse('{"__proto__":{"p":1},"q":2}'))).join() === "q", "client remoteClean: __proto__ key dropped");
  const op = readFileSync(new URL("../src/js/43-opboard.js", import.meta.url), "utf8");
  const src = op.slice(op.indexOf("const opNum"), op.indexOf("function opOpen")); const c2 = vm.createContext({}); vm.runInContext(src + ";this.opClean=opClean;this.opId=opId;", c2);
  const row = c2.opClean({ c: "<b>x", sh: "s", n: "<script>", cr: 5, ph: "1);alert(1", sd: {}, top: { p: "<", s: ">", cr: "z" } });
  ok(row.c === "bx" && row.n === 0 && row.ph === 0 && row.sd === 0 && row.top.cr === 0, "client opClean: every field a plain number or clean text");
  ok(c2.opId("abc12-3") === "abc12-3" && c2.opId("<x>") === "" && c2.opId("a".repeat(30)) === "", "client opId: short safe ids only");
  const html = op.slice(op.indexOf("function opHTML"), op.indexOf("function opInit"));
  ok(!/\$\{r\.(ph|sd)\}/.test(html) && !/\$\{r\.n \|\| 0\}/.test(html), "opHTML no longer prints r.ph, r.sd or r.n raw");
}
// ---- reports
{
  const b64 = bytes => Buffer.from(bytes).toString("base64");
  ok(imageKind(b64([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])) === "jpg", "report: JPEG magic bytes");
  ok(imageKind(b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])) === "png", "report: PNG magic bytes");
  ok(imageKind(b64([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")])) === "webp", "report: WebP magic bytes");
  ok(imageKind(b64(Buffer.from("<svg onload=alert(1)>  "))) === null && imageKind(b64(Buffer.from("MZ" + "x".repeat(20)))) === null && imageKind("") === null, "report: SVG, EXE and empty are refused");
  const big = new Request("https://x/", { method: "POST", body: "a".repeat(2000) });
  ok((await readCapped(big, 1000)) === null && (await readCapped(new Request("https://x/", { method: "POST", body: "hello" }), 1000)) === "hello", "report: a body over the cap is refused while reading");
  const { onRequestPost } = await import("../functions/api/report.js");
  const sent = []; globalThis.fetch = async (u, init) => { sent.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); };
  const png = "data:image/png;base64," + b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6]), fake = "data:image/png;base64," + b64(Buffer.from("not an image at all"));
  const mk = body => new Request(origin + "/api/report", { method: "POST", headers: { Origin: origin }, body: JSON.stringify(body) });
  const r = await onRequestPost({ request: mk({ text: "something broke", context: { system: "Sol\r\nBcc: evil@x.y\tz", version: "0.99\n9" }, images: [{ data: png }, { data: fake }, { data: png }, { data: png }, { data: png }] }), env: { RESEND_API_KEY: "k", REPORT_TO: "t@x.y" } });
  const m = sent[0];
  ok(r.status === 200 && m && !/[\r\n\t]/.test(m.subject) && /Sol Bcc: evil@x.y z/.test(m.subject), "report: CR, LF and TAB are gone from the subject");
  ok(m.attachments.length === 2 && m.attachments.every(a => /\.png$/.test(a.filename)), "report: only real images (at most 3 looked at), named by their real type");
  const huge = await onRequestPost({ request: new Request(origin + "/api/report", { method: "POST", headers: { Origin: origin, "Content-Length": String(9 * 1024 * 1024) }, body: "{}" }), env: {} });
  ok(huge.status === 413, "report: an announced size over 8 MB is refused at once");
}
// ---- the CSP still allows the pairing sockets
{
  const h = readFileSync(new URL("./_headers", import.meta.url), "utf8"), csp = (h.match(/Content-Security-Policy:[^\n]*/) || [""])[0];
  ok(/connect-src[^;]*'self'[^;]*wss:\/\/gravitasmap\.com/.test(csp), "CSP connect-src allows wss://gravitasmap.com");
}
console.log(fail ? `${fail} FAILED` : "all passed");
process.exit(fail ? 1 : 0);
