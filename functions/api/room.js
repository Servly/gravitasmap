import { json } from "../../lib/spansh.js";
import { ipKey, rateLimit, rateFull, CODE_LIMIT, CREATE_LIMIT, MANAGE_LIMIT, MANAGE_BAD_LIMIT, LINK_MAKE_LIMIT, LINK_BAD_LIMIT } from "../../lib/room-limit.js";
import { linkNorm, linkMake, linkShow } from "../../worker/src/guard.js";
// v0.76 Sync with GRAVITAS: pairing a computer that runs Sync with phones and tablets.
//   POST /api/room                      -> { room, code, exp, hostKey? }   a new pairing (the computer asks)
//   GET  /api/room?code=123456          -> { room }              a phone that typed the code (single-use, see worker/src/guard.js)
//   GET  /api/room?room=…&role=host|view  (WebSocket)            the live link, held by a Durable Object
//   GET  /api/room?room=…&kind=op&role=crew|watch (WebSocket)    v0.92: a team board (nothing kept, see worker/src/room.js)
// v0.99.9: the computer that creates a pairing gets a random hostKey (returned once, only its hash is kept by the room).
// role=host needs it (?hk=…), and so does asking for a new code for the same pairing (header X-Host-Key). Code lookups and
// creations are limited per address (12 lookups and 20 creations per 10 minutes).
// v0.99.10: every place that holds a pairing (the site in a browser, the app's map window, the app itself) sees and manages the same list of devices.
//   GET  /api/room?room=…&do=status          -> { hostOn, devices:[{id,n,awake,since,mode}], max }
//   POST /api/room?room=…&do=kick&to=ID|*    -> the same list, after the device (or all of them) was removed
//   POST /api/room?room=…&do=stop            -> { stopped:true }: the pairing ends for everyone (devices removed, key wiped)
// All three need the host key in the X-Host-Key header (never in the address), answer 403 for a wrong key and 410 for a pairing that is gone,
// and are limited per address (900 calls and, counted apart, 20 wrong keys per 10 minutes). They need no Origin (the app has none) but refuse a foreign one.
// v0.99.11: a normal browser takes up the pairing the app holds, with a one-time LINK CODE (8 characters, "ABCD-EFGH", 2 minutes, works once):
//   POST /api/room?room=…&do=linkcode  (X-Host-Key)  -> { code, ttl }      the app (or any holder of the key) asks for a code
//   POST /api/room?do=link             (X-Link-Code) -> { room, hostKey }  the browser types it: the key is handed out ONCE and the code is gone (Cache-Control: no-store)
// A wrong, used, expired or stopped code all give the same 404. 5 wrong codes per address per 10 minutes, then 429 (the right code too). The browser must send a same-site Origin.
// The code is kept only by its own Durable Object ("link:<CODE>", worker/src/room.js) together with the pairing's key, for 2 minutes at most. Nothing about it is logged.
// The objects live in the gravitas-rooms Worker (worker/). Without the ROOMS binding this answers 503 and the rest of
// the site is unaffected.
const B32 = "abcdefghijklmnopqrstuvwxyz234567";
const roomId = () => { const b = crypto.getRandomValues(new Uint8Array(20)); return [...b].map(x => B32[x & 31]).join(""); };   // 100 bits
const hostKey = () => [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, "0")).join("");     // 16 bytes
const HK = /^[0-9a-f]{32}$/;
const codeNum = () => String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
const sameSite = (req, need) => { const o = req.headers.get("Origin"); if (!o) return !need; try { const a = new URL(o), b = new URL(req.url); return a.host === b.host || a.hostname === "localhost" || a.hostname === "127.0.0.1"; } catch (e) { return false; } };
const tooMany = (retry, msg) => json({ error: msg, retry }, 429, { "Retry-After": String(retry), "Cache-Control": "no-store" });

export async function onRequest({ request, env }) {
  if (!env.ROOMS) return json({ error: "Pairing is not set up on this server yet." }, 503);
  const u = new URL(request.url), NS = env.ROOMS, ws = request.headers.get("Upgrade") === "websocket";
  // a browser always sends Origin on a POST and on a WebSocket: those must be same-site. A plain GET of a code may come without
  // (same-origin fetches leave it out), the limiter below is what guards that one.
  const doing = u.searchParams.get("do");
  if (!sameSite(request, ((request.method === "POST" || ws) && !doing) || doing === "link")) return json({ error: "Only GRAVITAS itself can pair devices." }, 403);
  let ipk = "";
  try { const ip = request.headers.get("CF-Connecting-IP") || ""; if (ip) ipk = await ipKey(ip); } catch (e) {}
  if (doing) return manage(request, u, NS, ipk, doing);
  if (request.method === "POST") {
    if (ipk) {
      try {                                                         // one new pairing every few seconds from the same address
        const key = new Request(`${u.origin}/api/_rl/room/${ipk}`);
        if (await caches.default.match(key)) return json({ error: "Please wait a few seconds before pairing again." }, 429);
        await caches.default.put(key, new Response("1", { headers: { "Cache-Control": "max-age=5" } }));
      } catch (e) {}
      const rl = await rateLimit(caches.default, u.origin, "create", ipk, CREATE_LIMIT);
      if (!rl.ok) return tooMany(rl.retry, "Too many new pairings from this address. Please try again later.");
    }
    // a new code for the same pairing: only the computer that holds its key may ask
    const keep = u.searchParams.get("room"), mine = request.headers.get("X-Host-Key") || "";
    let room = null, key = "";
    if (keep && /^[a-z2-7]{20,32}$/.test(keep) && HK.test(mine)) {
      try { const a = await NS.get(NS.idFromName("room:" + keep)).fetch(`https://room/auth?hk=${mine}`); if (a.ok && (await a.json()).ok) room = keep; } catch (e) {}
    }
    if (!room) {                                                     // a fresh pairing with a fresh key
      room = roomId(); key = hostKey();
      const r = await NS.get(NS.idFromName("room:" + room)).fetch(`https://room/init?hk=${key}`);
      if (!r.ok) return json({ error: "No free code right now. Please try again." }, 503);
    }
    for (let i = 0; i < 5; i++) {                                     // a free code (a clash is very rare)
      const code = codeNum(), r = await NS.get(NS.idFromName("code:" + code)).fetch(`https://room/claim?room=${room}`);
      if (r.ok) { const j = await r.json(); return json(key ? { room, code, exp: j.exp, hostKey: key } : { room, code, exp: j.exp }, 200, { "Cache-Control": "no-store" }); }
    }
    return json({ error: "No free code right now. Please try again." }, 503);
  }
  if (request.method !== "GET") return json({ error: "Not allowed." }, 405);
  const code = u.searchParams.get("code");
  if (code != null) {
    if (!/^\d{6}$/.test(code)) return json({ error: "The code has 6 digits." }, 400);
    if (ipk) { const rl = await rateLimit(caches.default, u.origin, "code", ipk, CODE_LIMIT); if (!rl.ok) return tooMany(rl.retry, "Too many tries from this address. Please wait a few minutes and try again."); }
    const r = await NS.get(NS.idFromName("code:" + code)).fetch(`https://room/get?ip=${ipk || "-"}`);
    return new Response(r.body, { status: r.status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }
  const room = u.searchParams.get("room") || "";
  if (!/^[a-z2-7]{20,32}$/.test(room)) return json({ error: "Bad pairing." }, 400);
  if (!ws) return json({ error: "expected a WebSocket" }, 426);
  const op = u.searchParams.get("kind") === "op";
  const sub = (request.headers.get("Sec-WebSocket-Protocol") || "").split(",").map(s => s.trim()).find(s => s.startsWith("gravitas.hk.")) || "";   // v0.99.10: the key as a sub-protocol, not in the address
  if (!op && u.searchParams.get("role") === "host" && !HK.test(sub.slice(12) || u.searchParams.get("hk") || request.headers.get("X-Host-Key") || "")) return json({ error: "This pairing needs its host key. Start sharing again from the computer." }, 403);
  return NS.get(NS.idFromName((op ? "op:" : "room:") + room)).fetch(request);   // v0.92: team boards are rooms of their own
}

// the device list and its two actions (see the top of this file)
async function manage(request, u, NS, ipk, what) {
  const no = { "Cache-Control": "no-store" }, room = u.searchParams.get("room") || "", hk = request.headers.get("X-Host-Key") || "";
  if (what === "link") return redeem(request, u, NS, ipk);
  if (!["status", "kick", "stop", "linkcode"].includes(what) || request.method !== (what === "status" ? "GET" : "POST")) return json({ error: "Not allowed." }, 405, no);
  if (!/^[a-z2-7]{20,32}$/.test(room) || !HK.test(hk)) return json({ error: "Bad pairing." }, 400, no);
  if (ipk) {
    if (await rateFull(caches.default, u.origin, "mbad", ipk, MANAGE_BAD_LIMIT)) return tooMany(600, "Too many wrong keys from this address. Please wait a few minutes.");
    const rl = await rateLimit(caches.default, u.origin, "manage", ipk, MANAGE_LIMIT);
    if (!rl.ok) return tooMany(rl.retry, "Too many calls from this address. Please wait a moment.");
  }
  if (what === "linkcode") {                                           // v0.99.11: a one-time code for this pairing (the key must be right: the room says so)
    if (ipk) { const rl = await rateLimit(caches.default, u.origin, "linkmake", ipk, LINK_MAKE_LIMIT); if (!rl.ok) return tooMany(rl.retry, "Too many codes from this address. Please wait a few minutes."); }
    const v = await NS.get(NS.idFromName("room:" + room)).fetch("https://room/verify", { headers: { "X-Host-Key": hk } });
    if (!v.ok) { if (v.status === 403 && ipk) await rateLimit(caches.default, u.origin, "mbad", ipk, MANAGE_BAD_LIMIT); return new Response(v.body, { status: v.status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }
    for (let i = 0; i < 5; i++) {                                       // a free number (a clash is very rare: 2^40)
      const code = linkMake(crypto.getRandomValues(new Uint8Array(8))), r = await NS.get(NS.idFromName("link:" + code)).fetch(`https://room/linkmake?room=${room}`, { headers: { "X-Host-Key": hk } });
      if (r.ok) { const j = await r.json(); return json({ code: linkShow(code), ttl: j.ttl }, 200, no); }
    }
    return json({ error: "No free code right now. Please try again." }, 503, no);
  }
  let to = ""; if (what === "kick") { to = u.searchParams.get("to") || ""; if (to !== "*" && !/^[0-9a-f]{8}$/.test(to)) return json({ error: "Bad device." }, 400, no); }
  const r = await NS.get(NS.idFromName("room:" + room)).fetch(`https://room/${what}${what === "kick" ? "?to=" + encodeURIComponent(to) : ""}`, { headers: { "X-Host-Key": hk } });
  if (r.status === 403 && ipk) await rateLimit(caches.default, u.origin, "mbad", ipk, MANAGE_BAD_LIMIT);
  return new Response(r.body, { status: r.status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

// v0.99.11: a browser types the link code. Same answer for a code that is wrong, used, expired or of a pairing that was stopped.
async function redeem(request, u, NS, ipk) {
  const no = { "Cache-Control": "no-store" }, bad = () => json({ error: "This code is not valid (any more). Ask the GRAVITAS app for a new one." }, 404, no);
  if (request.method !== "POST") return json({ error: "Not allowed." }, 405, no);
  const code = linkNorm(request.headers.get("X-Link-Code") || "");
  if (!code) return json({ error: "The code has 8 letters and digits, like ABCD-EFGH." }, 400, no);
  if (ipk && await rateFull(caches.default, u.origin, "lbad", ipk, LINK_BAD_LIMIT)) return tooMany(600, "Too many wrong codes from this address. Please wait a few minutes.");
  let ok = null;
  try {
    const r = await NS.get(NS.idFromName("link:" + code)).fetch("https://room/linktake");   // burns the code (one look)
    if (r.ok) { const j = await r.json(); if (j && /^[a-z2-7]{20,32}$/.test(j.room || "") && HK.test(j.hostKey || "")) {
      const v = await NS.get(NS.idFromName("room:" + j.room)).fetch("https://room/verify", { headers: { "X-Host-Key": j.hostKey } });   // a pairing that was stopped since has no live code
      if (v.ok) ok = { room: j.room, hostKey: j.hostKey }; } }
  } catch (e) {}
  if (!ok) { if (ipk) await rateLimit(caches.default, u.origin, "lbad", ipk, LINK_BAD_LIMIT); return bad(); }
  return json(ok, 200, no);
}
