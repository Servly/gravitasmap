// node tools/test_scan.mjs : /api/scan (v0.99.16) with VirusTotal, the assets and the cache pretended.
import { onRequestGet, scanOf } from "../functions/api/scan.js";
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log("FAIL:", m); } else console.log("ok:  ", m); };
const SHA = "a".repeat(64);
const store = new Map();
globalThis.caches = { default: { match: async r => { const v = store.get(r.url); return v ? new Response(v) : null; }, put: async (r, res) => { store.set(r.url, await res.text()); } } };
let vtCalls = 0, vtStatus = 200, seenKey = "", seenUrl = "";
globalThis.fetch = async (url, init) => {
  url = String(url);
  if (url.startsWith("https://www.virustotal.com/api/v3/files/")) {
    vtCalls++; seenUrl = url; seenKey = (init && init.headers && init.headers["x-apikey"]) || "";
    if (vtStatus !== 200) return new Response("{}", { status: vtStatus });
    const results = {}; for (let i = 0; i < 67; i++) results["E" + i] = { category: "undetected" };
    results.APEX = { category: "malicious" }; results.DeepInstinct = { category: "malicious" };
    return new Response(JSON.stringify({ data: { attributes: { last_analysis_stats: { malicious: 2, suspicious: 0, undetected: 67, harmless: 0, timeout: 1 }, last_analysis_results: results, last_analysis_date: 1795536660 } } }), { status: 200 });
  }
  return new Response("?", { status: 404 });
};
let verBody = JSON.stringify({ latest: "0.9.27", sha256: SHA });
const ASSETS = { fetch: async () => new Response(verBody, { status: verBody ? 200 : 404 }) };
const call = (env) => onRequestGet({ request: new Request("https://gravitasmap.com/api/scan?sha256=" + "b".repeat(64)), env });

// 1. no key: calm 503, VirusTotal never called
let r = await call({ ASSETS }); ok(r.status === 503 && vtCalls === 0, "no VT_KEY: 503 and no call to VirusTotal");
// 2. first call: fresh, numbers right, the hash comes from version.json and not from the request
r = await call({ ASSETS, VT_KEY: "k1" }); let j = await r.json();
ok(r.status === 200 && j.sha256 === SHA && j.flagged === 2 && j.total === 69 && j.by.join() === "APEX,DeepInstinct" && j.checked === "2026-11-24", "fresh answer: 2 of 69, APEX and DeepInstinct, date " + j.checked);
ok(seenUrl.endsWith("/" + SHA) && seenKey === "k1", "VirusTotal was asked about the hash of version.json with the key in the header");
ok(r.headers.get("cache-control") === "no-store" && !JSON.stringify(j).includes("k1"), "answer is no-store and carries no key");
// 3. second call: cached, no new VirusTotal call
const n = vtCalls; r = await call({ ASSETS, VT_KEY: "k1" }); j = await r.json();
ok(r.status === 200 && vtCalls === n && r.headers.get("x-scan") === "cached" && j.total === 69, "second call comes from the cache, no new VirusTotal call");
// 4. a new installer (new hash) is a cache miss and is asked again
const SHA2 = "c".repeat(64); verBody = JSON.stringify({ latest: "0.9.28", sha256: SHA2 });
r = await call({ ASSETS, VT_KEY: "k1" }); j = await r.json();
ok(r.status === 200 && j.sha256 === SHA2 && vtCalls === n + 1, "a new version is looked up on its own hash");
// 5. VirusTotal down or file unknown: 503 soft, not cached
verBody = JSON.stringify({ latest: "0.9.29", sha256: "d".repeat(64) }); vtStatus = 404;
r = await call({ ASSETS, VT_KEY: "k1" }); j = await r.json(); ok(r.status === 503 && j.soft === true, "VirusTotal does not know the file: 503 soft");
vtStatus = 429; r = await call({ ASSETS, VT_KEY: "k1" }); ok(r.status === 503, "VirusTotal limit: 503 soft");
vtStatus = 200; r = await call({ ASSETS, VT_KEY: "k1" }); ok(r.status === 200, "VirusTotal back: answered again (nothing bad was cached)");
// 6. broken version.json
verBody = "not json"; r = await call({ ASSETS, VT_KEY: "k1" }); ok(r.status === 503, "broken version.json: 503");
verBody = JSON.stringify({ sha256: "xyz" }); r = await call({ ASSETS, VT_KEY: "k1" }); ok(r.status === 503, "a bad hash in version.json: 503");
// 7. pure numbers
const s = scanOf({ last_analysis_stats: { malicious: 1, suspicious: 1, undetected: 8, harmless: 0 }, last_analysis_results: { B: { category: "suspicious" }, A: { category: "malicious" } } });
ok(s.flagged === 2 && s.total === 10 && s.by.join() === "A,B" && s.checked === "", "scanOf: flagged, total and sorted names");
if (fail) { console.log(fail + " FAILED"); process.exit(1); } else console.log("all passed");
