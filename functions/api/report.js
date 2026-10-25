import { json } from "../../lib/spansh.js";
// POST /api/report  ->  e-mails the report through Resend (https://resend.com).
// Secrets, set in the Cloudflare dashboard, never in this file:
//   RESEND_API_KEY   the Resend API key
//   REPORT_TO        the address that receives reports (only ever stored here, on the server side)
//   REPORT_FROM      optional sender, for example "GRAVITAS <reports@your-domain>" once the domain is verified in Resend
const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, n);
const MAX = 12 * 1024 * 1024, WAIT_S = 60;
// v0.75.5: one report a minute from the same address. The address is kept only as a one-way code (a hash), only for a
// minute, and only in Cloudflare's cache at the data centre that took the report. It is never stored anywhere else.
async function seenKey(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (!ip) return null;
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("gravitas-report|" + ip)));
  return new Request(`${new URL(request.url).origin}/api/_rl/report/${[...h.slice(0, 16)].map(x => x.toString(16).padStart(2, "0")).join("")}`);
}
export async function onRequestPost({ request, env }) {
  // only this site's own page may send a report (a browser on another site may not)
  const origin = request.headers.get("Origin");
  if (origin) { let ok = false; try { const o = new URL(origin), u = new URL(request.url); ok = o.host === u.host || o.hostname === "localhost" || o.hostname === "127.0.0.1"; } catch (e) {} if (!ok) return json({ error: "Reports can only be sent from GRAVITAS itself." }, 403); }
  const len = +(request.headers.get("Content-Length") || 0);
  if (len > MAX) return json({ error: "Report too large." }, 413);
  let raw; try { raw = await request.text(); } catch (e) { return json({ error: "Bad report." }, 400); }
  if (raw.length > MAX) return json({ error: "Report too large." }, 413);      // also when no size was announced
  let d; try { d = JSON.parse(raw); } catch (e) { return json({ error: "Bad report." }, 400); }
  if (!d || typeof d !== "object") return json({ error: "Bad report." }, 400);
  if (d.website) return json({ ok: true });                                   // hidden field: only bots fill it in
  const text = clean(d.text, 4000).trim();
  if (text.length < 3) return json({ error: "Please describe what happened." }, 400);
  if (!env.RESEND_API_KEY || !env.REPORT_TO) return json({ error: "Reports are not set up on this server yet." }, 503);
  let key = null; try { key = await seenKey(request); if (key && await caches.default.match(key)) return json({ error: "A report was just sent from here. Please wait a minute before sending another." }, 429, { "Retry-After": String(WAIT_S) }); } catch (e) { key = null; }
  const ctx = d.context && typeof d.context === "object" ? d.context : {};
  const rid = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14) + "-" + crypto.randomUUID().slice(0, 6);
  const attachments = [];
  (Array.isArray(d.images) ? d.images : []).slice(0, 3).forEach((im, i) => {
    const m = /^data:image\/(?:jpeg|jpg|png|webp);base64,(.+)$/s.exec(String(im && im.data || ""));
    if (m) attachments.push({ filename: `screenshot-${i + 1}.jpg`, content: m[1] });
  });
  const body = [`GRAVITAS problem report ${rid}`, "", "What happened:", text, "",
    `CMDR: ${clean(d.cmdr, 60) || "-"}`, `Reply to: ${clean(d.mail, 120) || "-"}`, "", "Context:",
    ...Object.entries(ctx).map(([k, v]) => `  ${clean(k, 40)}: ${clean(typeof v === "string" ? v : JSON.stringify(v), 600)}`)].join("\n");
  let r;
  try {
  r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.REPORT_FROM || "GRAVITAS <onboarding@resend.dev>", to: [env.REPORT_TO],
      subject: `GRAVITAS report · ${clean(ctx.system, 60) || "no system"} · ${clean(ctx.version, 12)}`, text: body, attachments }),
  });
  } catch (e) { return json({ error: "The mail service could not be reached. Please try again later." }, 502); }
  if (!r.ok) return json({ error: `The report could not be sent (mail service answered ${r.status}).` }, 502);
  if (key) { try { await caches.default.put(key, new Response("1", { headers: { "Cache-Control": `max-age=${WAIT_S}` } })); } catch (e) {} }   // only a sent report counts
  return json({ ok: true, id: rid });
}
