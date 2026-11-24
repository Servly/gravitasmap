// Shared helpers for the Cloudflare Pages Functions (the online version of tools/serve.py).
export const spanshBase = env => (env.SPANSH_BASE || "https://spansh.co.uk/api").replace(/\/$/, "");
const UA = { "User-Agent": "GRAVITAS/1.0 (+https://gravitasmap.com; free fan-made Elite Dangerous system map)", "Accept": "application/json" };

const tooSlow = e => e && e.name === "AbortError" ? new Error("Spansh took too long to answer") : e;
// GET JSON with retries and a time limit (ms) that covers the whole answer, body included. It waits only between
// tries, never after the last one (v0.50: suggestions were slowed by this).
export async function getJSON(env, path, tries = 3, timeout = 20000) {
  let last;
  for (let k = 0; k < tries; k++) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch(spanshBase(env) + path, { headers: UA, signal: ctl.signal });
      if (r.ok) return await r.json();
      try { await r.body?.cancel(); } catch (e) {}                 // free the connection before trying again
      last = new Error(`Spansh answered ${r.status}`); last.status = r.status;
      if (r.status < 500 && r.status !== 429) break;
    } catch (e) { last = tooSlow(e); }
    finally { clearTimeout(timer); }
    if (k < tries - 1) await new Promise(res => setTimeout(res, 1200 * (k + 1)));
  }
  throw last;
}
// the raw response (body not read), so a large dump can be streamed through without spending CPU on it.
// The time limit covers the wait for the first bytes. The stream itself is passed on as it arrives.
export async function getRaw(env, path, timeout = 30000) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeout);
  let r;
  try { r = await fetch(spanshBase(env) + path, { headers: UA, signal: ctl.signal }); }
  catch (e) { throw tooSlow(e); }
  finally { clearTimeout(timer); }
  if (!r.ok) { try { await r.body?.cancel(); } catch (e) {} const e = new Error(`Spansh answered ${r.status}`); e.status = r.status; throw e; }
  return r;
}
export const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", ...extra } });
// v0.99.6: Spansh not answering is told as news, not as a failure. 503, not 502: Cloudflare replaces a 502 from a Function with its own
// text page ("error code: 502"), so the visitor never saw this message. `soft` tells the page to show it calmly (no red).
export const SPANSH_DOWN = "Spansh, where the data comes from, is not answering right now. It may be updating.";
export const spanshDown = e => json({ error: SPANSH_DOWN, soft: true, upstream: e && e.status || null }, 503, { "Cache-Control": "no-store" });
// a short, honest message for errors that come from Spansh's side
export const spanshError = e => e && e.status === 429
  ? "Spansh has had too many requests for now. Please try again in a few minutes."
  : `Spansh could not be reached right now (${e && e.message}). Please try again in a minute.`;
// v0.99.9: a system number is digits only, 1 to 20 of them, not 0 and not above 2^63 (Elite's id64 is a 64-bit number that fits in 63 bits).
// Returns the plain decimal text (no leading zeros) or null.
export function validId64(v) {
  if (typeof v !== "string" || !/^\d{1,20}$/.test(v)) return null;
  const n = BigInt(v); return n >= 1n && n <= 9223372036854775808n ? n.toString() : null;
}
// how long a dump is kept in Cloudflare's cache: an hour for every system, 15 minutes for Sol (its saved copy logic lives in system.js)
export const SOL_ID64 = "10477373803", DUMP_CACHE_S = 3600, SOL_CACHE_S = 900, NOT_FOUND_CACHE_S = 120;
export const cacheSeconds = id64 => String(id64) === SOL_ID64 ? SOL_CACHE_S : DUMP_CACHE_S;
