// v0.99.9 problem reports: the pure checks (used by functions/api/report.js, tested by tools/test_room.mjs)
export function imageKind(b64) {                                              // "jpg" | "png" | "webp" | null, from the first 12 decoded bytes
  const head = String(b64 || "").slice(0, 16); if (head.length < 16 || !/^[A-Za-z0-9+/]{16}$/.test(head)) return null;
  let b; try { b = atob(head); } catch (e) { return null; }
  const c = i => b.charCodeAt(i);
  if (c(0) === 0xff && c(1) === 0xd8 && c(2) === 0xff) return "jpg";
  if (c(0) === 0x89 && b.slice(1, 4) === "PNG" && c(4) === 0x0d && c(5) === 0x0a && c(6) === 0x1a && c(7) === 0x0a) return "png";
  if (b.slice(0, 4) === "RIFF" && b.slice(8, 12) === "WEBP") return "webp";
  return null;
}
export async function readCapped(request, max) {                             // the body as text, or null when it is larger than max bytes
  if (!request.body) return "";
  const rd = request.body.getReader(), parts = []; let n = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; n += value.length; if (n > max) { try { await rd.cancel(); } catch (e) {} return null; } parts.push(value); }
  const all = new Uint8Array(n); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
  return new TextDecoder().decode(all);
}
