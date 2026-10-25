import { json } from "../../lib/spansh.js";
// v0.76 Sync with GRAVITAS: pairing a computer that runs Sync with phones and tablets.
//   POST /api/room                      -> { room, code, exp }   a new pairing (the computer asks)
//   GET  /api/room?code=123456          -> { room }              a phone that typed the code
//   GET  /api/room?room=…&role=host|view  (WebSocket)            the live link, held by a Durable Object
//   GET  /api/room?room=…&kind=op&role=crew|watch (WebSocket)    v0.92: a team board (nothing kept, see worker/src/room.js)
// The objects live in the gravitas-rooms Worker (worker/). Without the ROOMS binding this answers 503 and the rest of
// the site is unaffected.
const B32 = "abcdefghijklmnopqrstuvwxyz234567";
const roomId = () => { const b = crypto.getRandomValues(new Uint8Array(20)); return [...b].map(x => B32[x & 31]).join(""); };   // 100 bits
const codeNum = () => String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
const sameSite = req => { const o = req.headers.get("Origin"); if (!o) return true; try { const a = new URL(o), b = new URL(req.url); return a.host === b.host || a.hostname === "localhost" || a.hostname === "127.0.0.1"; } catch (e) { return false; } };

export async function onRequest({ request, env }) {
  if (!env.ROOMS) return json({ error: "Pairing is not set up on this server yet." }, 503);
  if (!sameSite(request)) return json({ error: "Only GRAVITAS itself can pair devices." }, 403);
  const u = new URL(request.url), NS = env.ROOMS;
  if (request.method === "POST") {
    // one new pairing every few seconds from the same address (the address is kept only as a one-way code, briefly)
    try {
      const ip = request.headers.get("CF-Connecting-IP") || "";
      if (ip) { const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("gravitas-room|" + ip)));
        const key = new Request(`${u.origin}/api/_rl/room/${[...h.slice(0, 16)].map(x => x.toString(16).padStart(2, "0")).join("")}`);
        if (await caches.default.match(key)) return json({ error: "Please wait a few seconds before pairing again." }, 429);
        await caches.default.put(key, new Response("1", { headers: { "Cache-Control": "max-age=5" } })); }
    } catch (e) {}
    const keep = u.searchParams.get("room"), room = keep && /^[a-z2-7]{20,32}$/.test(keep) ? keep : roomId();   // a new code for the same pairing
    for (let i = 0; i < 5; i++) {                                     // a free code (a clash is very rare)
      const code = codeNum(), r = await NS.get(NS.idFromName("code:" + code)).fetch(`https://room/claim?room=${room}`);
      if (r.ok) { const j = await r.json(); return json({ room, code, exp: j.exp }, 200, { "Cache-Control": "no-store" }); }
    }
    return json({ error: "No free code right now. Please try again." }, 503);
  }
  if (request.method !== "GET") return json({ error: "Not allowed." }, 405);
  const code = u.searchParams.get("code");
  if (code != null) {
    if (!/^\d{6}$/.test(code)) return json({ error: "The code has 6 digits." }, 400);
    const r = await NS.get(NS.idFromName("code:" + code)).fetch("https://room/get");
    return new Response(r.body, { status: r.status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }
  const room = u.searchParams.get("room") || "";
  if (!/^[a-z2-7]{20,32}$/.test(room)) return json({ error: "Bad pairing." }, 400);
  if (request.headers.get("Upgrade") !== "websocket") return json({ error: "expected a WebSocket" }, 426);
  return NS.get(NS.idFromName((u.searchParams.get("kind") === "op" ? "op:" : "room:") + room)).fetch(request);   // v0.92: team boards are rooms of their own
}
