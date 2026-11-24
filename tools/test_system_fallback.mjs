// node tools/test_system_fallback.mjs : /api/system when Spansh does not answer (v0.99.6), with Spansh and the cache pretended.
import { readFileSync } from "node:fs";
import { onRequestGet } from "../functions/api/system.js";

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log("FAIL:", m); } else console.log("ok:  ", m); };
const saved = n => readFileSync(new URL(`../saved/${n}`, import.meta.url));
let mode = {};
globalThis.caches = { default: { match: async () => null, put: async () => {} } };
globalThis.fetch = async (url) => {
  url = String(url);
  if (url.includes("/search?q=")) {
    if (mode.searchDown) return new Response("down", { status: 500 });
    const q = decodeURIComponent(url.split("q=")[1] || "");
    const known = { asterope: 216054883492, sol: 10477373803 }[q.toLowerCase()];
    return new Response(JSON.stringify({ results: known ? [{ type: "system", record: { name: q, id64: known, power: "X" } }] : [] }), { status: 200 });
  }
  if (url.includes("/dump/")) {
    if (mode.dump === 404) return new Response("{}", { status: 404 });
    if (mode.dump === 500) return new Response("{}", { status: 500 });
    return new Response(JSON.stringify({ system: { name: "Live", id64: 1, bodies: [] } }), { status: 200 });
  }
  return new Response("?", { status: 404 });
};
const ASSETS = { fetch: async (req) => { const p = new URL(req.url).pathname.replace("/saved/", ""); try { return new Response(saved(p)); } catch (e) { return new Response("", { status: 404 }); } } };
const call = async (q, env = {}) => onRequestGet({ request: new Request("https://gravitasmap.com/api/system?" + q), env, waitUntil: () => {} });
const body = async r => { const t = await r.text(); try { return JSON.parse(t); } catch (e) { return t; } };

// 1. another system, Spansh's dump fails: 503, calm message, never a 502
mode = { dump: 500 };
let r = await call("name=Asterope&lite=1"), j = await body(r);
ok(r.status === 503 && j.soft === true && /not answering/.test(j.error) && /updating/.test(j.error), "a system Spansh cannot give: 503 with a calm message (" + r.status + ")");
ok(r.headers.get("cache-control") === "no-store", "that answer is not cached");
ok(j.upstream === 500, "the real Spansh status is in it");

// 2. Sol by name, Spansh's search AND dump are down: the saved copy, lite and full
mode = { searchDown: true, dump: 500 };
r = await call("name=Sol&lite=1", { ASSETS }); j = await body(r);
ok(r.status === 200 && j.stale && /saved copy of Sol from/.test(j.stale) && j.system && j.system.name === "Sol", "Sol lite: the saved copy, with its date");
const liteBytes = (await (await call("name=Sol&lite=1", { ASSETS })).text()).length;
r = await call("name=Sol", { ASSETS }); j = await body(r);
ok(r.status === 200 && j.stale && j.system.name === "Sol", "Sol full: the saved copy");
ok(JSON.stringify(j).length > liteBytes * 5, "the full copy is the big one, the lite copy the small one");
ok(r.headers.get("cache-control") === "no-store", "the saved copy is not cached by the edge");

// 3. Sol by its number, no saved files at hand: still the calm 503
r = await call("id64=10477373803&lite=1", {}); j = await body(r);
ok(r.status === 503 && j.soft === true, "Sol without a saved copy: 503, calm");

// 4. another system is never answered with Sol's copy
r = await call("id64=216054883492&lite=1", { ASSETS }); j = await body(r);
ok(r.status === 503 && !j.system, "another system never gets Sol's copy");

// 5. Spansh is fine: live data, and no stale line
mode = {};
r = await call("name=Sol&lite=1", { ASSETS }); j = await body(r);
ok(r.status === 200 && !j.stale && j.system.name === "Live", "Spansh answers: live data, no saved copy");
mode = { searchDown: true };
r = await call("name=Sol&lite=1", { ASSETS }); j = await body(r);
ok(r.status === 200 && !j.stale && j.system.name === "Live", "Sol with Spansh's search down but the dump up: live data");

// 6. a system that is not there is still a clear 404
mode = { dump: 404 };
r = await call("id64=5&lite=1", { ASSETS }); j = await body(r);
ok(r.status === 404 && /not on Spansh/.test(j.error), "not on Spansh: still a 404");

// 7. v0.99.9: cache lifetimes, the short memory for unknown names, id64 limits (an in-memory cache that keeps max-age)
const store = new Map(), puts = [];
globalThis.caches = { default: {
  match: async rq => { const e = store.get(rq.url); return e ? new Response(e.body, { headers: e.h }) : null; },
  put: async (rq, rs) => { const body = await rs.text(); const h = Object.fromEntries(rs.headers); store.set(rq.url, { body, h }); puts.push([rq.url, h["cache-control"]]); } } };
let waits = []; const call2 = async (q, env = {}) => { const r = await onRequestGet({ request: new Request("https://gravitasmap.com/api/system?" + q), env, waitUntil: p => waits.push(p) }); await Promise.all(waits); waits = []; return r; };
let searches = 0; const baseFetch = globalThis.fetch; globalThis.fetch = async u => { if (String(u).includes("/search?q=")) searches++; return baseFetch(u); };
mode = {};
r = await call2("name=Asterope&lite=1"); await r.text();
const cc = id => puts.find(p => p[0].endsWith("/api/_dump/" + id));
ok(cc("216054883492") && cc("216054883492")[1] === "public, max-age=3600", "a normal system: dump cached for 3600 s");
r = await call2("name=Sol&lite=1"); await r.text();
ok(cc("10477373803") && cc("10477373803")[1] === "public, max-age=900", "Sol: dump cached for 900 s as before");
ok(r.headers.get("cache-control") === "public, max-age=900", "Sol answer header keeps 900 s");
r = await call2("name=Asterope&lite=1"); ok(r.headers.get("cache-control") === "public, max-age=3600", "a normal system answer header: 3600 s");
searches = 0; r = await call2("name=Nowhereville"); j = await body(r);
ok(r.status === 404 && /not found on Spansh/.test(j.error) && searches === 1, "unknown name: 404 after one search");
const nf = puts.find(p => p[0].includes("/api/_nf/")); ok(nf && nf[1] === "public, max-age=120", "the 404 is remembered for 120 s");
r = await call2("name=Nowhereville"); const j2 = await body(r);
ok(r.status === 404 && j2.error === j.error && searches === 1 && !r.headers.get("cache-control"), "the same unknown name again: same 404, no second search, no browser caching");
mode = { dump: 500 }; puts.length = 0;
r = await call2("name=Asterope2"); r = await call2("id64=999999&lite=1"); j = await body(r);
ok(r.status === 503 && !puts.some(p => p[0].includes("/api/_dump/999999")) && r.headers.get("cache-control") === "no-store", "a 503 is never cached");
mode = {};
for (const bad of ["0", "00", "9223372036854775809", "99999999999999999999", "12a", "-5", "1e5", " 7"]) { r = await call2("id64=" + encodeURIComponent(bad)); ok(r.status === 400, "id64 '" + bad + "' is refused (" + r.status + ")"); }
r = await call2("id64=9223372036854775808&lite=1"); ok(r.status === 200, "2^63 itself is still accepted");
r = await call2("id64=0010477373803&lite=1"); ok(r.status === 200 && ![...store.keys()].some(k => k.includes("/0010477373803")), "leading zeros are folded into one cache key");

console.log(fail ? `${fail} FAILED` : "all passed");
process.exit(fail ? 1 : 0);
