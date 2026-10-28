import { getJSON, getRaw, json, spanshError } from "../../lib/spansh.js";
// GET /api/system?name=Sol  or  ?id64=10477373803  ->  { system: { summary, ...Spansh dump... } }
// Only an exact name is loaded, never a "closest" system.
// v0.50: the dump is streamed straight through, never read as a whole, so a large system costs almost no CPU
// (Cloudflare's free plan allows 10 ms of CPU per request). Only its first bytes are looked at, to put the
// summary in front. Dumps are kept in Cloudflare's cache for 15 minutes. Positions are computed in the browser
// from the orbits, so a cached dump never shows old positions.
const CACHE_S = 900;                                                   // v0.94: 15 minutes (was an hour): new scans show sooner
export async function onRequestGet({ request, env, waitUntil }) {
  const u = new URL(request.url), name = (u.searchParams.get("name") || "").trim();
  let id64 = u.searchParams.get("id64"), summary = null;
  try {
    if (!id64) {
      if (!name) return json({ error: "No system name given." }, 400);
      if (name.length > 80) return json({ error: "System name too long." }, 400);
      // v0.75.5: which system a name means (and its summary) is kept in Cloudflare's cache too, like the dump
      const nk = new Request(`${u.origin}/api/_name/${encodeURIComponent(name.toLowerCase())}`);
      try { const c = await caches.default.match(nk); if (c) ({ id64, summary } = await c.json()); } catch (e) {}
    }
    if (!id64) {
      const d = await getJSON(env, `/search?q=${encodeURIComponent(name)}`, 2, 15000);
      const systems = (d.results || []).filter(r => r.type === "system").map(r => r.record);
      const hit = systems.find(s => s.name.toLowerCase() === name.toLowerCase());
      if (!hit) {
        const near = systems.slice(0, 5).map(s => s.name).join(", ");
        return json({ error: `System not found on Spansh: ${name}` + (near ? ` (did you mean: ${near}?)` : "") }, 404);
      }
      id64 = String(hit.id64);
      const { bodies, stations, ...rest } = hit; summary = rest;      // power, factions, economy: Spansh's search record
      try { const nk = new Request(`${u.origin}/api/_name/${encodeURIComponent(name.toLowerCase())}`);
        waitUntil(caches.default.put(nk, new Response(JSON.stringify({ id64, summary }), { headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${CACHE_S}` } }))); } catch (e) {}
    }
    if (!/^\d{1,20}$/.test(id64)) return json({ error: "Bad system id." }, 400);
    const cache = caches.default, key = new Request(`${u.origin}/api/_dump/${id64}`);
    let body = null;
    try { const c = await cache.match(key); if (c) body = c.body; } catch (e) {}
    if (!body) {
      const raw = await getRaw(env, `/dump/${id64}`, 30000);
      const [mine, keep] = raw.body.tee();
      body = mine;
      try { waitUntil(cache.put(key, new Response(keep, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_S}` } }))); }
      catch (e) { keep.cancel().catch(() => {}); }
    }
    return new Response(withSummary(body, summary), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_S}` } });
  } catch (e) {
    if (e && e.status === 404) return json({ error: "This system is not on Spansh." }, 404);
    return json({ error: spanshError(e) }, 502);
  }
}
// Put "summary" first inside {"system":{ ... }} while the bytes flow past. Only the first bytes are decoded.
function withSummary(body, summary) {
  if (!summary) return body;
  const enc = new TextEncoder(), dec = new TextDecoder();
  let head = new Uint8Array(0), done = false;
  const release = ctl => {
    const s = dec.decode(head.subarray(0, Math.min(head.length, 256)), { stream: true });
    const m = /^[ \t\r\n]*\{[ \t\r\n]*"system"[ \t\r\n]*:[ \t\r\n]*\{/.exec(s);       // ASCII whitespace only: chars = bytes
    if (m) {
      const empty = /^[ \t\r\n]*\}/.test(s.slice(m[0].length));              // {"system":{}} needs no comma after the summary
      ctl.enqueue(enc.encode(m[0] + `"summary":${JSON.stringify(summary)}` + (empty ? "" : ",")));
      ctl.enqueue(head.subarray(m[0].length));                         // the prefix is plain ASCII, so chars = bytes
    } else ctl.enqueue(head);
    done = true; head = null;
  };
  return body.pipeThrough(new TransformStream({
    transform(chunk, ctl) {
      if (done) return ctl.enqueue(chunk);
      const all = new Uint8Array(head.length + chunk.length); all.set(head); all.set(chunk, head.length); head = all;
      if (head.length >= 64) release(ctl);
    },
    flush(ctl) { if (!done && head) release(ctl); },
  }));
}
