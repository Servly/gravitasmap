// v0.99.9 pairing hardening: the pure rules of the room objects, kept apart so node can test them (tools/test_room.mjs).
// Nothing here touches Cloudflare: plain functions on plain values.
export const CODE_GRACE_MS = 90e3;          // a used code still answers the SAME address this long (a phone that reloads)
const HEX32 = /^[0-9a-f]{32}$/;

export const validHostKey = k => typeof k === "string" && HEX32.test(k);
export async function hashKey(k) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("gravitas-host|" + k)));
  return [...h].map(x => x.toString(16).padStart(2, "0")).join("");
}
export function sameHash(a, b) {            // constant time for equal lengths
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
// a code record is { room, exp, used?: { ip, at } }. Is the code still taken (not free to hand out again)?
export function codeTaken(cur, now) {
  if (!cur || cur.exp <= now) return false;
  if (cur.used && now - cur.used.at > CODE_GRACE_MS) return false;
  return true;
}
// a lookup: the first success uses the code up. The same address may repeat it for 90 s, anyone else gets "not valid".
// Returns { status, room?, next } where next is the record to store (null = leave it as it is, "del" = delete it).
export function codeLookup(cur, ip, now) {
  if (!codeTaken(cur, now)) return { status: 404, next: cur ? "del" : null };
  if (!cur.used) return { status: 200, room: cur.room, next: Object.assign({}, cur, { used: { ip: String(ip || "-"), at: now } }) };
  if (cur.used.ip === String(ip || "-")) return { status: 200, room: cur.room, next: null };
  return { status: 404, next: null };
}

// ---- what a host may relay: small, typed, nothing that can carry markup
const DANGER = new Set(["__proto__", "constructor", "prototype"]);
export const cleanStr = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f<>"`]/g, "").slice(0, n);
const cleanNum = v => { v = +v; return Number.isFinite(v) ? Math.max(-1e15, Math.min(1e15, v)) : 0; };
// a generic deep copy: numbers clamped, strings cut and stripped of < > " `, keys checked, depth/width limited
export function deepClean(v, depth = 0) {
  if (v == null) return null;
  if (typeof v === "number") return cleanNum(v);
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return cleanStr(v, 240);
  if (depth >= 8) return null;
  if (Array.isArray(v)) return v.slice(0, 200).map(x => deepClean(x, depth + 1));
  if (typeof v === "object") {
    const o = {}; let n = 0;
    for (const k of Object.keys(v)) { if (DANGER.has(k) || /[<>"`]/.test(k) || k.length > 60) continue; if (++n > 80) break; o[k] = deepClean(v[k], depth + 1); }
    return o;
  }
  return null;
}
const STATE_KEYS = ["v", "here", "at", "live", "dest", "closed", "sc", "jumping", "rt", "n", "fc", "t"];
// "where am I": only the keys Sync's summary has (the combat screen "cb" travels apart)
export function cleanState(s) {
  if (!s || typeof s !== "object" || Array.isArray(s)) return null;
  const o = {}; for (const k of STATE_KEYS) if (k in s) o[k] = deepClean(s[k]);
  return o;
}
export function cleanCb(c) { return c && typeof c === "object" && !Array.isArray(c) ? deepClean(c) : null; }
// a team board row: the exact fields the board shows
export function cleanOp(s) {
  if (!s || typeof s !== "object" || Array.isArray(s)) return null;
  const top = s.top && typeof s.top === "object" ? { p: cleanStr(s.top.p, 40), s: cleanStr(s.top.s, 30), cr: cleanNum(s.top.cr) } : null;
  const op = s.op && typeof s.op === "object" ? { n: cleanStr(s.op.n, 60), site: cleanStr(s.op.site, 60), sys: cleanStr(s.op.sys, 60) } : null;
  return { c: cleanStr(s.c, 40), sh: cleanStr(s.sh, 30), on: s.on ? 1 : 0, n: cleanNum(s.n), cr: cleanNum(s.cr), t0: cleanNum(s.t0), t1: cleanNum(s.t1),
    ph: cleanNum(s.ph), sd: cleanNum(s.sd), d: s.d ? 1 : 0, seen: cleanNum(s.seen), top, op };
}

// ---- v0.99.10 the device list: the room is the one place that knows who follows (shared by every place that holds the pairing)
export const AWAKE_MS = 40e3;               // a device that checked in within this time is awake (the same rule the computer's page used)
export const DEV_MODES = ["direct", "server"];
// views = the attachments of the viewer connections: { id, n, t0, seen, mode }. Returns what may be shown: never a key, never more than this.
// (ago = how long ago it last checked in: a page that holds an older copy of the list works out asleep by itself)
export function devicesOf(views, now) {
  return views.filter(a => a && typeof a.id === "string" && !a.out).map(a => ({ id: a.id, n: cleanStr(a.n, 40), awake: now - (+a.seen || 0) < AWAKE_MS, ago: Math.max(0, Math.min(1e9, now - (+a.seen || 0))), since: +a.t0 || 0, mode: DEV_MODES.includes(a.mode) ? a.mode : "server" }))
    .sort((x, y) => x.since - y.since);
}

// ---- v0.99.11 the link code: how a normal browser takes up the GRAVITAS app's pairing (see functions/api/room.js, do=linkcode and do=link)
// The code is 8 characters from a 32-character alphabet (no I, no O, no 0, no 1: they are read wrongly), written "ABCD-EFGH".
// 32^8 = 2^40, about 1.1e12 codes. Why this much and no more: a code lives 2 minutes and works once, and a guess costs the guesser one request.
// A single address gets 5 wrong tries per 10 minutes. Even a crowd of 100,000 addresses trying 5 each would hit a live code with a chance
// of about 5e5 / 1.1e12 (under one in two million) per code. Longer would only be harder to type from one screen to the other.
export const LINK_MS = 120e3;                 // a link code lives 2 minutes
export const LINK_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const LINK_RE = /^[A-HJ-NP-Z2-9]{8}$/;
// what a person typed -> the code, or "" when it cannot be one (case, spaces and dashes do not matter)
export const linkNorm = s => { const c = String(s == null ? "" : s).toUpperCase().replace(/[\s-]/g, ""); return LINK_RE.test(c) ? c : ""; };
export const linkShow = c => c.slice(0, 4) + "-" + c.slice(4);
// 8 uniform characters out of random bytes (256 / 32 = 8: no bias)
export function linkMake(bytes) { let s = ""; for (let i = 0; i < 8; i++) s += LINK_ALPHABET[bytes[i] & 31]; return s; }
// the record a code object keeps: { room, hk, exp }. The key is kept here in plain form, because the room only has its hash, and it is
// handed out once: the record is deleted at the first successful take, at its end, and by the object's alarm.
// make: is the number free (no live record)? take: the first right look gets the pairing and burns the code. Everything else is the same "no".
export const linkLive = (cur, now) => !!(cur && typeof cur.exp === "number" && cur.exp > now && cur.room && cur.hk);
export function linkTake(cur, now) {
  if (!linkLive(cur, now)) return { status: 404, next: cur ? "del" : null };
  return { status: 200, room: cur.room, hk: cur.hk, next: "del" };
}
