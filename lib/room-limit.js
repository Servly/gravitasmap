// v0.99.9 pairing hardening, Pages side: a per-address attempt limiter on the Cache API.
// The address is kept only as a one-way code (first 16 bytes of a salted SHA-256) and only for the window itself.
export const WINDOW_MS = 10 * 60e3, CODE_LIMIT = 12, CREATE_LIMIT = 20;
export async function ipKey(ip) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("gravitas-room|" + ip)));
  return [...h.slice(0, 16)].map(x => x.toString(16).padStart(2, "0")).join("");
}
// pure step: rec = { n, t0 } or null. Returns { ok, rec, retry } (retry in seconds when refused)
export function limitStep(rec, now, limit = CODE_LIMIT, windowMs = WINDOW_MS) {
  if (!rec || typeof rec.t0 !== "number" || now - rec.t0 >= windowMs || rec.t0 > now) rec = { n: 0, t0: now };
  if (rec.n >= limit) return { ok: false, rec, retry: Math.max(1, Math.ceil((rec.t0 + windowMs - now) / 1000)) };
  return { ok: true, rec: { n: rec.n + 1, t0: rec.t0 }, retry: 0 };
}
// cache = anything with match(req) / put(req, res) (caches.default on Cloudflare). Never throws: a cache failure lets the request through.
export async function rateLimit(cache, origin, bucket, ipk, limit, windowMs = WINDOW_MS, now = Date.now()) {
  try {
    const key = new Request(`${origin}/api/_rl/${bucket}/${ipk}`), hit = await cache.match(key);
    let rec = null; if (hit) { try { rec = await hit.json(); } catch (e) {} }
    const r = limitStep(rec, now, limit, windowMs);
    if (r.ok) { const left = Math.max(1, Math.ceil((r.rec.t0 + windowMs - now) / 1000));
      await cache.put(key, new Response(JSON.stringify(r.rec), { headers: { "Cache-Control": `max-age=${left}`, "Content-Type": "application/json" } })); }
    return r;
  } catch (e) { return { ok: true, rec: null, retry: 0 }; }
}

// v0.99.10 the pairing's device list (status, remove one, stop): called by every place that holds a pairing, so the budget is higher
// than for codes (three places polling every 5 s are about 360 calls in 10 minutes). Wrong keys are counted apart and stop much sooner.
export const MANAGE_LIMIT = 900, MANAGE_BAD_LIMIT = 20;
// has this address already used up the bucket? (a look only: nothing is counted)
export async function rateFull(cache, origin, bucket, ipk, limit, windowMs = WINDOW_MS, now = Date.now()) {
  try {
    const hit = await cache.match(new Request(`${origin}/api/_rl/${bucket}/${ipk}`)); if (!hit) return false;
    const rec = await hit.json(); return !!rec && typeof rec.t0 === "number" && now - rec.t0 < windowMs && rec.n >= limit;
  } catch (e) { return false; }
}

// v0.99.11 the link code: a browser asks the app's pairing for a one-time code (10 new codes per address per 10 minutes) and types it on the site:
// 5 wrong codes per address per 10 minutes, counted apart. After that, even the right code is refused from that address until the window ends.
export const LINK_MAKE_LIMIT = 10, LINK_BAD_LIMIT = 5;
