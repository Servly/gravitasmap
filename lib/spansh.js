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
// a short, honest message for errors that come from Spansh's side
export const spanshError = e => e && e.status === 429
  ? "Spansh has had too many requests for now. Please try again in a few minutes."
  : `Spansh could not be reached right now (${e && e.message}). Please try again in a minute.`;
