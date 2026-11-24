import { json } from "../../lib/spansh.js";
// v0.99.16 GET /api/scan: the public VirusTotal result of the installer that /gravitas-app/version.json offers, kept fresh.
// - Input: none. The SHA-256 is read from our own version.json (never from the request), so nobody can make this look up another file.
// - The answer is cached for 6 hours per data centre (Cache API). Only a cache miss calls VirusTotal, once, with the key in the secret VT_KEY
//   (set with: wrangler pages secret put VT_KEY). Nothing about the visitor is sent to VirusTotal: the request comes from our server and carries a file hash.
// - Failures answer 503 {soft:true}: the page then uses the scan.json written at release time.
// - Answer: { sha256, flagged, malicious, total, by:[engine names], checked:"YYYY-MM-DD" } (the date VirusTotal last analysed the file).
const TTL = 6 * 3600, HEX = /^[0-9a-f]{64}$/;
const no = { "Cache-Control": "no-store" };

export function scanOf(attr) {
  const s = (attr && attr.last_analysis_stats) || {}, res = (attr && attr.last_analysis_results) || {};
  const flagged = (s.malicious | 0) + (s.suspicious | 0), total = flagged + (s.undetected | 0) + (s.harmless | 0);
  const by = Object.keys(res).filter(k => res[k] && (res[k].category === "malicious" || res[k].category === "suspicious")).sort().slice(0, 10);
  const t = attr && Number.isFinite(attr.last_analysis_date) ? new Date(attr.last_analysis_date * 1000).toISOString().slice(0, 10) : "";
  return { flagged, malicious: s.malicious | 0, total, by, checked: t };
}

export async function onRequestGet({ request, env }) {
  const key = env.VT_KEY;
  if (!key) return json({ soft: true, error: "not set up" }, 503, no);
  const origin = new URL(request.url).origin;
  let ver;
  try {
    const r = await (env.ASSETS ? env.ASSETS.fetch(new Request(origin + "/gravitas-app/version.json")) : fetch(origin + "/gravitas-app/version.json"));
    ver = await r.json();
  } catch (e) { return json({ soft: true, error: "no version" }, 503, no); }
  const sha = ver && ver.sha256;
  if (typeof sha !== "string" || !HEX.test(sha)) return json({ soft: true, error: "no version" }, 503, no);
  const ck = new Request(`${origin}/api/_scan/${sha}`);
  try { const hit = await caches.default.match(ck); if (hit) return new Response(hit.body, { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Scan": "cached" } }); } catch (e) {}
  let attr;
  try {
    const r = await fetch("https://www.virustotal.com/api/v3/files/" + sha, { headers: { "x-apikey": key, accept: "application/json", "User-Agent": "gravitasmap.com" } });
    if (r.status !== 200) return json({ soft: true, error: "virustotal " + r.status }, 503, no);
    attr = (await r.json()).data.attributes;
  } catch (e) { return json({ soft: true, error: "virustotal unreachable" }, 503, no); }
  const out = scanOf(attr);
  if (out.total < 10) return json({ soft: true, error: "too few engines" }, 503, no);
  const body = JSON.stringify({ sha256: sha, ...out });
  try { await caches.default.put(ck, new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${TTL}` } })); } catch (e) {}
  return new Response(body, { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Scan": "fresh" } });
}
