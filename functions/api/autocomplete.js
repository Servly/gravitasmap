import { getJSON, json } from "../../lib/spansh.js";
// GET /api/autocomplete?q=Sol  ->  { values: [names] }
// v0.50: answers are kept in Cloudflare's cache for a day (system names do not change), each Spansh call has a short
// time limit, and nothing waits after a failed call. The first source is the one Spansh's own search boxes use.
const CACHE_S = 86400;
export async function onRequestGet({ request, env, waitUntil }) {
  const u = new URL(request.url), q = (u.searchParams.get("q") || "").trim();
  if (q.length < 2) return json({ values: [] });
  const cache = caches.default, key = new Request(`${u.origin}/api/_ac/${encodeURIComponent(q.toLowerCase())}`);
  try { const c = await cache.match(key); if (c) return c; } catch (e) {}
  let vals = null;
  try {
    const d = await getJSON(env, `/systems/field_values/system_names?q=${encodeURIComponent(q)}`, 1, 3500);
    const v = Array.isArray(d) ? d : d && d.values;
    if (v && v.length) vals = v.map(x => typeof x === "string" ? x : x.name).filter(Boolean).slice(0, 12);
  } catch (e) {}
  if (!vals) {
    try {
      const d = await getJSON(env, `/search?q=${encodeURIComponent(q)}`, 1, 5000);
      vals = (d.results || []).filter(r => r.type === "system").map(r => r.record.name).slice(0, 12);
    } catch (e) { return json({ values: [] }, 200, { "Cache-Control": "no-store" }); }      // never cache a failure
  }
  const res = json({ values: vals }, 200, { "Cache-Control": `public, max-age=${vals.length ? CACHE_S : 3600}` });   // "no match" only for an hour: a new system may be added
  try { waitUntil(cache.put(key, res.clone())); } catch (e) {}
  return res;
}
