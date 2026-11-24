import { getJSON, getRaw, json, spanshDown, validId64, cacheSeconds, NOT_FOUND_CACHE_S, SOL_ID64 } from "../../lib/spansh.js";
import { slimStream } from "../../lib/slim.js";
// GET /api/system?name=Sol  or  ?id64=10477373803  ->  { system: { summary, ...Spansh dump... } }
// v0.99.3: &lite=1 -> the same without the stations' market, outfitting and shipyard lists (lib/slim.js); without it,
// the answer is exactly as before (the Station window asks for that one).
// Only an exact name is loaded, never a "closest" system.
// v0.50: the dump is streamed straight through, never read as a whole, so a large system costs almost no CPU
// (Cloudflare's free plan allows 10 ms of CPU per request). Only its first bytes are looked at, to put the
// summary in front. Dumps are kept in Cloudflare's cache for 15 minutes. Positions are computed in the browser
// from the orbits, so a cached dump never shows old positions.
// v0.99.6: Sol only: when Spansh does not answer, a saved copy (saved/sol.lite.json and sol.full.json, made by tools/refresh_sol.py)
// is sent instead, so the site can always be tried. The copy says so (its own "stale" line, shown by the page) and has its date.
const SOL = SOL_ID64;
async function savedSol(env, origin, lite) {
  try {
    if (!env || !env.ASSETS) return null;
    const r = await env.ASSETS.fetch(new Request(`${origin}/saved/sol.${lite ? "lite" : "full"}.json`));
    if (!r.ok) { try { await r.body?.cancel(); } catch (e) {} return null; }
    return new Response(r.body, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) { return null; }
}
// v0.99.9: dumps are kept an hour (Sol: 15 minutes, lib/spansh.js cacheSeconds), a name Spansh does not know is remembered for 2 minutes
// (the Spansh search is the expensive part, and a typo is often tried again at once). A 503 "Spansh is not answering" is never cached.
export async function onRequestGet({ request, env, waitUntil }) {
  const u = new URL(request.url), name = (u.searchParams.get("name") || "").trim();
  let id64 = u.searchParams.get("id64"), summary = null;
  if (id64 != null) { id64 = validId64(id64); if (!id64) return json({ error: "Bad system id." }, 400); }
  const lite = u.searchParams.get("lite") === "1";
  try {
    if (!id64) {
      if (!name) return json({ error: "No system name given." }, 400);
      if (name.length > 80) return json({ error: "System name too long." }, 400);
      // v0.75.5: which system a name means (and its summary) is kept in Cloudflare's cache too, like the dump
      const nk = new Request(`${u.origin}/api/_name/${encodeURIComponent(name.toLowerCase())}`), nf = new Request(`${u.origin}/api/_nf/${encodeURIComponent(name.toLowerCase())}`);
      try { const c = await caches.default.match(nf); if (c) return json(await c.json(), 404); } catch (e) {}
      try { const c = await caches.default.match(nk); if (c) { const j = await c.json(); id64 = validId64(String(j.id64)); summary = id64 ? j.summary : null; } } catch (e) {}
    }
    if (!id64) {
      let d;
      try { d = await getJSON(env, `/search?q=${encodeURIComponent(name)}`, 2, 15000); }
      catch (e) { if (name.toLowerCase() === "sol") { id64 = SOL; } else throw e; }      // (Sol needs no search: its number is fixed)
      if (!d) { /* Sol by its number: no summary, the dump comes next */ } else {
      const systems = (d.results || []).filter(r => r.type === "system").map(r => r.record);
      const hit = systems.find(s => s.name.toLowerCase() === name.toLowerCase());
      if (!hit) {
        const near = systems.slice(0, 5).map(s => s.name).join(", ");
        const nfBody = { error: `System not found on Spansh: ${name}` + (near ? ` (did you mean: ${near}?)` : "") };
        try { waitUntil(caches.default.put(new Request(`${u.origin}/api/_nf/${encodeURIComponent(name.toLowerCase())}`), new Response(JSON.stringify(nfBody), { headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${NOT_FOUND_CACHE_S}` } }))); } catch (e) {}
        return json(nfBody, 404);
      }
      id64 = validId64(String(hit.id64));
      if (!id64) return json({ error: "Bad system id." }, 400);
      const { bodies, stations, ...rest } = hit; summary = rest;      // power, factions, economy: Spansh's search record
      try { const nk = new Request(`${u.origin}/api/_name/${encodeURIComponent(name.toLowerCase())}`);
        waitUntil(caches.default.put(nk, new Response(JSON.stringify({ id64, summary }), { headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${cacheSeconds(id64)}` } }))); } catch (e) {}
      }
    }
    if (!validId64(id64)) return json({ error: "Bad system id." }, 400);
    const cache = caches.default, key = new Request(`${u.origin}/api/_dump/${id64}`);
    const CACHE_S = cacheSeconds(id64), hdr = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_S}` };
    let body = null;
    if (lite) {                                                         // v0.99.3: the lite answer has a cache of its own
      const lkey = new Request(`${u.origin}/api/_lite/${id64}`);
      try { const c = await cache.match(lkey); if (c) return new Response(withSummary(c.body, summary), { headers: hdr }); } catch (e) {}
    }
    try { const c = await cache.match(key); if (c) body = c.body; } catch (e) {}
    if (!body) {
      const raw = await getRaw(env, `/dump/${id64}`, 30000);
      const [mine, keep] = raw.body.tee();
      body = mine;
      try { waitUntil(cache.put(key, new Response(keep, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_S}` } }))); }
      catch (e) { keep.cancel().catch(() => {}); }
    }
    if (lite) {
      const [mine, keep] = slimStream(body).tee();
      body = mine;
      try { waitUntil(cache.put(new Request(`${u.origin}/api/_lite/${id64}`), new Response(keep, { headers: hdr }))); }
      catch (e) { keep.cancel().catch(() => {}); }
    }
    return new Response(withSummary(body, summary), { headers: hdr });
  } catch (e) {
    if (e && e.status === 404) return json({ error: "This system is not on Spansh." }, 404);
    if (String(id64) === SOL) { const saved = await savedSol(env, u.origin, lite); if (saved) return saved; }
    return spanshDown(e);
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
