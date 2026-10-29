// ------------------------------------------------------------ v0.95 GRAVITAS MODES: Collisions
// Bodies whose orbits cross pass through each other in Elite Dangerous. The list of such pairs across the galaxy is
// Canonn Research's open list (credited here). Every time on this page is GRAVITAS's own: worked out from the Spansh
// orbit data with the collision engine (29-coll-engine.js). The list loads only when this window is opened.
// v0.96: close passes, the age of the orbit data, Upcoming in time groups with the next pass on top, a card for
// Discord (picture, text, link, calendar), "near you" from Sync, and your own scans.
var CX = { pairs: null, next: null, live: new Map(), busy: new Set(), sub: "up", q: "", load: null, nload: null, meta: null, err: "", soon: null };
const CX_YEARS = 3, CX_SHOW = 60;
const cxKey = (id, a, b) => `${id}|${a}|${b}`;
// coll-next.json: [id64, body, body, why, [[start s, end s, depth km]], on the map 1/0, [[close pass s, miss km]], oldest orbit data s]
function cxLoadNext() {
  if (CX.nload) return CX.nload;
  CX.nload = fetch("assets/coll-next.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : null).catch(() => null).then(n => {
    CX.next = new Map(); if (n && n.pairs) { CX.made = n.made;
      for (const r of n.pairs) CX.next.set(cxKey(r[0], r[1], r[2]), { why: r[3] || null, map: r[5] === 0 ? false : r[5] === 1 ? true : undefined,
        ev: (r[4] || []).map(e => ({ start: e[0] * 1000, end: e[1] ? e[1] * 1000 : null, depth: e[2] })),
        close: (r[6] || []).map(e => ({ close: true, start: e[0] * 1000, end: null, miss: e[1] })), ep0: r[7] ? r[7] * 1000 : null, at: n.made }); }
    cxSoon(); return CX.next;
  });
  return CX.nload;
}
function cxLoad() {
  if (CX.load) return CX.load;
  CX.load = Promise.all([fetch("assets/coll-pairs.json", { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }), cxLoadNext()]).then(([p]) => {
    CX.meta = p; CX.pairs = p.pairs.filter(r => r[2] !== r[3]).map(r => ({ id: String(r[0]), sys: r[1], a: r[2], b: r[3], x: r[4], y: r[5], z: r[6], ta: p.types[r[7]], tb: p.types[r[8]], f: r[9] }));   // v0.96.1: two rows name the same body twice (a star and its planet, both called like the system): not a pair
    CX.byKey = new Map(CX.pairs.map(p => [cxKey(p.id, p.a, p.b), p]));
    cxRefresh(); cxSoon();
  }).catch(e => { CX.err = "The list could not be loaded. Try again later."; CX.load = null; cxRefresh(); });
  return CX.load;
}
function cxResult(p) { return CX.live.get(cxKey(p.id, p.a, p.b)) || (CX.next && CX.next.get(cxKey(p.id, p.a, p.b))) || null; }
function cxUpcoming(r) { const now = Date.now(); return r && r.ev ? r.ev.find(e => (e.end || e.start + 3600e3) > now) || null : null; }
function cxClose(r) { const now = Date.now(), e = cxUpcoming(r); return r && r.close ? r.close.find(c => c.start > now - 3600e3 && (!e || c.start < e.start)) || null : null; }
const cxDay = t => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const cxHM = t => new Date(t).toISOString().slice(11, 16);
function cxIn(t) { const left = t - Date.now(); return left > 2 * 86400e3 ? `in ${Math.round(left / 86400e3)} days` : left > 3600e3 ? `in ${Math.round(left / 3600e3)} h` : left > 0 ? `in ${Math.max(1, Math.round(left / 60e3))} min` : ""; }
function cxLasts(e) { const span = e.end ? e.end - e.start : 0; return !span ? "" : span >= 2 * 86400e3 ? `lasts ${Math.round(span / 86400e3)} days` : span >= 3600e3 ? `lasts ${Math.round(span / 3600e3)} h` : `lasts ${Math.max(1, Math.round(span / 60e3))} min`; }
function cxWhen(e) {
  const now = Date.now(), on = e.start <= now && (e.end === null || e.end > now), day = cxDay(e.start), inT = cxIn(e.start);
  const long = e.end && e.end - e.start > 86400e3;      // v0.95.2: a pass of days or weeks says its end date and how long it lasts
  const to = !e.end ? "…" : cxDay(e.end) !== day ? `${cxDay(e.end)} ${cxHM(e.end)}` : cxHM(e.end), lasts = cxLasts(e);
  return `${on ? `<b class="cxNow">happening now</b> · ` : ""}${day} ${cxHM(e.start)} ${long ? "→" : "–"} ${to} UTC${lasts ? ` · ${lasts}` : ""}${inT && !on ? ` · <span class="cxIn">${inT}</span>` : ""}`;
}
// v0.96: how old the orbit data is. Old data still gives a time, but the error grows with every orbit since the scan
function cxAge(r) {
  if (!r || !r.ep0) return null;
  const d = (Date.now() - r.ep0) / 86400e3, when = new Date(r.ep0).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
  if (r.mine) return { k: "mine", t: "from your scan", tip: "Where the bodies are on their orbits comes from your own scan today" };
  return d < 60 ? null : d < 365 ? { k: "older", t: "older data", tip: `The orbit data is from ${when}. The time can be off by minutes: be there early` }
    : { k: "old", t: "old data · be there early", tip: `The orbit data is from ${when}. After so many orbits the time can be off by an hour or more` };
}
const CX_WHY = { phase: "Spansh does not know where these bodies are on their orbits yet",
  epoch: "the orbit data has no time of its own, so the time cannot be trusted", missing: "a body or its orbit is missing on Spansh",
  apart: "with the current orbit data these orbits never come close enough", moon: "one of them orbits the other", none: "no pass found in the years ahead", fail: "Spansh did not answer. Try again" };
function cxNeeds(p) { const r = cxResult(p); return r ? r.why === "phase" || r.why === "epoch" : !(p.f & 1); }
// "near you": where you are in the game (Sync), else the system on the screen
function cxHere() {
  if (typeof SYNC !== "undefined" && SYNC.on && SYNC.starPos) return SYNC.starPos;
  return typeof S !== "undefined" && S && S.sys && S.sys.coords ? Object.assign({ n: S.sys.name }, S.sys.coords) : null;
}
function cxNextT(p) { const r = cxResult(p), e = cxUpcoming(r), c = cxClose(r); return e ? e.start : c ? c.start : Infinity; }
function cxList() {
  if (!CX.pairs) return [];
  const q = CX.q.trim().toLowerCase(), F = CX.meta.flags;
  let L = CX.pairs.filter(p => !q || p.sys.toLowerCase().includes(q));
  if (CX.sub === "up") L = L.filter(p => isFinite(cxNextT(p))).sort((p, o) => cxNextT(p) - cxNextT(o));
  else if (CX.sub === "hab") L = L.filter(p => p.f & (F.habitable | F.water_earth_ammonia | F.colony));
  else if (CX.sub === "need") L = L.filter(cxNeeds);
  const h = cxHere();
  for (const p of L) p._d = h ? Math.hypot(p.x - h.x, p.y - h.y, p.z - h.z) : null;
  if (h && CX.sub !== "up") L.sort((a, b) => a._d - b._d);
  return L;
}
function cxRow(p, top) {
  const r = cxResult(p), e = cxUpcoming(r), c = cxClose(r), F = CX.meta.flags, k = cxKey(p.id, p.a, p.b), busy = CX.busy.has(k), age = cxAge(r);
  const tags = [p.f & F.habitable ? "habitable" : "", p.f & F.water_earth_ammonia ? "water, earth-like or ammonia" : "", p.f & F.colony ? "colonisation target" : "", p.f & F.landable ? "landable" : "", p.f & F.atmosphere ? "atmosphere" : "", p.f & F.populated ? "populated" : ""].filter(Boolean);
  const cl = c ? `<span class="cxClose" title="Their closest approach misses by only ${fmt(c.miss, 0)} km. Newer orbit data may show them touching">close pass</span> ${cxDay(c.start)} ${cxHM(c.start)} UTC · misses by ${fmt(c.miss, 0)} km${cxIn(c.start) ? ` · <span class="cxIn">${cxIn(c.start)}</span>` : ""}` : "";
  const st = busy ? `<span class="cxDim">Working it out…</span>`
    : (c && (!e || c.start < e.start) ? cl + (e ? "<br>" : "") : "") + (e ? cxWhen(e) + (e.depth > 0 ? ` · ${fmt(e.depth, 0)} km deep` : "") + (r.why === "epoch" ? ` · <span class="cxDim" title="${esc(CX_WHY.epoch)}">less sure</span>` : "") : "")
      || (r ? `<span class="cxDim">${esc(CX_WHY[r.why] || CX_WHY.none)}</span>` : `<span class="cxDim">not worked out yet</span>`);
  const off = r && r.map === false;                                    // v0.95.2: part of what they orbit is not on Spansh: the map cannot draw them
  const ev = e || c, ly = v => `${fmt(v, v < 100 ? 1 : 0)} ly`, sol = Math.hypot(p.x, p.y, p.z), h = cxHere();   // v0.96.2: how far from you and from Sol
  const dist = `<br><span class="cxLy">${p._d != null && h ? (p._d < 1 ? `here, in ${esc(h.n || "this system")} · ` : `${ly(p._d)} from ${esc(h.n || "you")} · `) : ""}${sol < 1 ? "in Sol" : ly(sol) + " from Sol"}</span>`;
  return `<div class="cxR${top ? " cxTop" : ""}" data-cx="${esc(k)}"><div class="cxT">${top ? `<span class="cxNx">NEXT</span> ` : ""}<b>${esc(p.sys)}</b> <span class="cxB">${esc(p.a)} &amp; ${esc(p.b)}</span>${age ? ` <span class="cxAge ${age.k}" title="${esc(age.tip)}">${age.t}</span>` : ""}<br>
    <span class="cxTy">${esc(p.ta)} &amp; ${esc(p.tb)}${tags.length ? " · " + tags.join(" · ") : ""}</span><br><span class="cxSt">${st}</span>${off ? `<br><span class="cxOff" title="The map places a body only when everything it orbits is on Spansh: its planet, and the centre of a pair of planets if there is one. Scanning the bodies around them (the FSS is enough) usually adds what is missing.">not on the map yet: part of what they orbit is missing on Spansh</span>` : ""}${dist}</div>
    <div class="cxA">${busy ? "" : `<button type="button" data-cxgo="calc" title="Work out the next times now, from the latest Spansh data">${r && !CX.live.has(k) ? "Update" : r ? "Again" : "Work it out"}</button>`}${ev && !busy ? `<button type="button" data-cxgo="card" title="A card for Discord: picture, text, link and calendar">Card</button>` : ""}<button type="button" data-cxgo="open" class="${ev && !off ? "pri" : ""}" title="${ev && !off ? "Open the system at this moment, in true size" : "Open the system"}">${ev && !off ? "Watch" : "Open"}</button></div></div>`;
}
function cxNavHTML() {
  const b = (k, l) => `<button type="button" data-cxsub="${k}" class="${CX.sub === k ? "on" : ""}">${l}</button>`;
  return b("up", "Upcoming") + b("hab", "Habitable worlds") + b("near", "Near you") + b("need", "Needs data") + b("all", "All pairs");
}
// v0.96: Upcoming in groups by how soon, the next pass on top
function cxUpHTML(L) {
  const now = Date.now(), G = [["now", "Happening now"], ["d", "Next 24 hours"], ["w", "Next 7 days"], ["m", "Next 30 days"], ["l", "Later"]];
  const grp = p => { const r = cxResult(p), e = cxUpcoming(r), t = cxNextT(p); if (e && e.start <= now) return "now"; const d = t - now; return d < 86400e3 ? "d" : d < 7 * 86400e3 ? "w" : d < 30 * 86400e3 ? "m" : "l"; };
  const nx = L.find(p => cxNextT(p) > now && cxResult(p).map !== false) || L.find(p => cxNextT(p) > now);
  let out = nx ? cxRow(nx, true) : "", n = 0, last = "";
  for (const p of L) { if (n >= CX_SHOW) break; const g = grp(p); if (g !== last) { last = g; out += `<div class="cxG">${G.find(x => x[0] === g)[1]}</div>`; } out += cxRow(p); n++; }
  return out;
}
function cxBodyHTML() {
  if (CX.err) return `<p class="note">${esc(CX.err)}</p>`;
  if (!CX.pairs) return `<p class="cxDim">Loading the list…</p>`;
  const L = cxList(), shown = L.slice(0, CX_SHOW), h = cxHere();
  const head = CX.sub === "up" ? (L.length ? `<p class="cxDim">The next passes GRAVITAS has worked out, soonest first.${CX.made ? ` Worked out on ${new Date(CX.made).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}: use <b>Update</b> for the latest Spansh data.` : ""}</p>`
      : `<p class="cxDim">No times worked out yet. Pick a pair under <b>All pairs</b> or <b>Near you</b> and press <b>Work it out</b>.</p>`)
    : CX.sub === "near" ? (h ? `<p class="cxDim">Nearest to ${esc(h.n || "you")} first${typeof SYNC !== "undefined" && SYNC.on && SYNC.starPos ? " (where you are in the game)" : ""}.</p>` : `<p class="cxDim">Open a system or turn on Sync: the pairs nearest to you come first.</p>`)
    : CX.sub === "need" ? `<p class="cxDim">For these pairs Spansh does not know yet where the bodies are on their orbits, so no time can be worked out. Scan both bodies in the game (the FSS is enough) with a tool that shares scans, such as EDMC, and the next time can be worked out here. With Sync on, your own scan works at once.</p>` : "";
  const rows = CX.sub === "up" ? cxUpHTML(L) : shown.map(p => cxRow(p)).join("");
  return head + (rows || (CX.sub === "up" ? "" : `<p class="cxDim">No pairs here${CX.q ? " for this name" : ""}.</p>`)) +
    (L.length > CX_SHOW ? `<p class="cxDim">${fmt(L.length - CX_SHOW, 0)} more. Type a system name to find one.</p>` : "");
}
const CX_TEXT = () => `<div class="q">HOW IT WORKS</div><p>In Elite Dangerous bodies whose orbits cross do not crash: they pass through each other, and commanders go to watch. For each pair GRAVITAS finds the moments the bodies meet from the latest orbit data on Spansh: first where the two can line up (once every synodic period), then the true positions and true sizes of both bodies decide when they touch, how deep they go and when they part. <b>Watch</b> opens the system at that moment in true size. <b>Card</b> makes a picture and a text for Discord, with a link to the moment and a calendar entry.</p>
  <p>Times are as good as the orbit data. The newer the scan of both bodies, the closer the time: <b>older data</b> means be there early. A <b>close pass</b> misses by only a few hundred km with the current data, so newer data may show the bodies touching. With <b>Sync</b> on, your own scans of the bodies are used at once.</p>
  <div class="q">THE LIST</div><p>The ${CX.pairs ? fmt(CX.pairs.length, 0) : ""} pairs come from <a href="https://canonn.science" target="_blank" rel="noopener">Canonn Research</a>, who found them and share them openly. Thank you, Canonn. The times are GRAVITAS's own.</p>`;
function cxTabHTML() {
  cxLoad();
  return `<div class="q">GRAVITAS: COLLISIONS</div><p class="cxSrc">Bodies passing through each other. List of pairs: <a href="https://canonn.science" target="_blank" rel="noopener">Canonn Research</a>. Times: GRAVITAS.</p>
    <div class="cxBar"><div class="mSub" id="cxNav" role="tablist">${cxNavHTML()}</div><input id="cxQ" type="search" placeholder="Find a system" value="${esc(CX.q)}" autocomplete="off" spellcheck="false" aria-label="Find a system"></div>
    <div id="cxBody">${cxBodyHTML()}</div><div id="cxText">${CX_TEXT()}</div>`;
}
function cxShown() { return typeof modesShown === "function" && modesShown() && MODES.tab === "Collisions"; }
function cxRefresh() {
  if (!cxShown()) return;
  const nav = $("cxNav"), body = $("cxBody"); if (!nav || !body) return;
  const n = cxNavHTML(); if (n !== nav._h) { nav._h = n; nav.innerHTML = n; }
  const h = cxBodyHTML(); if (h !== body._h) { body._h = h; body.innerHTML = h; }
  const t = $("cxText"); if (t && CX.pairs && !t._ok) { t._ok = 1; t.innerHTML = CX_TEXT(); }
}
async function cxFetch(p) { return fetch(`${API}/system?id64=${encodeURIComponent(p.id)}`).then(apiJSON); }
// one pair, now, from the latest Spansh data (and your own scans): the same engine as the list
function cxSolve(j, p) {
  const M = cxPrep(j), P = cxPair(M, cxFind(M, p.a), cxFind(M, p.b));
  let res = { why: P.why && P.why !== "epoch" ? P.why : null, ev: [], close: [] };
  if (P.gap && P.why !== "phase") { const r = cxNext(P, Date.now() - 6 * 3600e3, cxDays(P, CX_YEARS), 3);
    res = { why: r.events.length || r.close.length ? (P.why || null) : P.why || "none", ev: r.events, close: r.close, map: P.map, ep0: P.ep0, mine: P.mine, rA: P.A._r * 1000, rB: P.B._r * 1000 }; }
  return res;
}
async function cxCalc(p, keep) {
  const k = cxKey(p.id, p.a, p.b); if (CX.busy.has(k)) return null;
  CX.busy.add(k); cxRefresh();
  try { const j = await cxFetch(p), res = cxSolve(j, p); CX.live.set(k, res); if (keep) keep.j = j; cxSoon(); return res; }
  catch (e) { CX.live.set(k, { why: "fail", ev: [] }); return null; }
  finally { CX.busy.delete(k); cxRefresh(); }
}
function cxWatchAt(p, e) {                         // the pair on the map, at the start of the pass (or the closest moment of a close pass)
  const nm = l => String(l).replace(/\s+/g, "").toLowerCase(), A = S.bodies.find(b => nm(shortName(b, S.sys.name)) === nm(p.a)), B = S.bodies.find(b => nm(shortName(b, S.sys.name)) === nm(p.b));
  if (!A || !B) { toast("These two cannot be shown yet: part of what they orbit is missing on Spansh"); return false; }
  const s = e.close ? e.start - 30 * 60e3 : e.start;
  collWatch({ bodies: new Set([A, B]), list: [{ A, B, start: s, end: e.end }], start: s, end: e.end, all: null });
  return true;
}
async function cxWatch(p) {
  const keep = {}; let r = cxResult(p);
  if (!CX.live.has(cxKey(p.id, p.a, p.b))) r = await cxCalc(p, keep);        // fresh data for the moment that is shown
  const e = cxUpcoming(r) || cxClose(r);
  if (r && r.map === false && e) { toast("These two cannot be shown yet: part of what they orbit is missing on Spansh"); cxRefresh(); return; }   // nothing to watch: say so, do not open an empty view
  $("news").style.display = "none";
  const ok = await loadSystem(p.sys, keep.j ? { pre: Promise.resolve(keep.j), id64: p.id } : { id64: p.id });
  if (ok && S && e) cxWatchAt(p, e);
}
// ------------------------------------------------------------ v0.96 the card: a picture, a text, a link and a calendar entry
const CX_COL = [[/water world/i, "#3f7fd0"], [/earth/i, "#3fa06a"], [/ammonia/i, "#b9a35a"], [/gas giant|GG/i, "#d8a86c"], [/rocky ice/i, "#a9b6c6"], [/icy/i, "#d7e0ec"],
  [/HMC|high metal/i, "#7a6d62"], [/metal/i, "#6b6560"], [/rocky/i, "#9a8571"], [/star|dwarf|black hole/i, "#ffcf7a"]];
const cxColour = t => (CX_COL.find(c => c[0].test(t || "")) || [0, "#a99"])[1];
function cxLink(p, e) {
  const u = new URL(location.origin + "/"); u.searchParams.set("system", p.sys); u.searchParams.set("id64", p.id);
  u.searchParams.set("t", gameTime(e.close ? e.start - 30 * 60e3 : e.start).replace(" ", "T").slice(0, 16)); u.searchParams.set("view", "3d");
  const r = cxResult(p); if (!r || r.map !== false) u.searchParams.set("cw", `${p.a}|${p.b}`);
  return u.toString();
}
function cxText(p, e) {
  const r = cxResult(p), age = cxAge(r);
  return [`${e.close ? "Close pass" : "Collision"}: ${p.sys} · ${p.a} & ${p.b} (${p.ta} & ${p.tb}) · ${fmt(Math.hypot(p.x, p.y, p.z), 0)} ly from Sol`,
    e.close ? `${cxDay(e.start)} ${cxHM(e.start)} UTC · they miss by ${fmt(e.miss, 0)} km with the current data`
      : `${cxDay(e.start)} ${cxHM(e.start)}${e.end ? ` to ${cxDay(e.end) !== cxDay(e.start) ? cxDay(e.end) + " " : ""}${cxHM(e.end)}` : ""} UTC${cxLasts(e) ? ` · ${cxLasts(e)}` : ""}${e.depth > 0 ? ` · ${fmt(e.depth, 0)} km deep` : ""}`,
    age ? `Orbit data: ${age.k === "mine" ? "your own scan" : age.tip.replace(/^The orbit data is from /, "").replace(/\. .*$/, "")}${age.k !== "mine" ? ", be there early" : ""}` : "",
    `Watch it: ${cxLink(p, e)}`, "Worked out by GRAVITAS · list of pairs: Canonn Research"].filter(Boolean).join("\n");
}
function cxICS(p, e) {
  const z = t => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"), x = s => String(s).replace(/[\\,;]/g, m => "\\" + m).replace(/\n/g, "\\n");
  const end = e.end || e.start + 3600e3;
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GRAVITAS//Collisions//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:${p.id}-${p.a.replace(/\s/g, "")}-${p.b.replace(/\s/g, "")}-${Math.round(e.start / 1000)}@gravitasmap.com`, `DTSTAMP:${z(Date.now())}`, `DTSTART:${z(e.start - (e.close ? 30 * 60e3 : 0))}`, `DTEND:${z(e.close ? e.start + 30 * 60e3 : end)}`,
    `SUMMARY:${x(`${e.close ? "Close pass" : "Collision"}: ${p.sys} ${p.a} & ${p.b}`)}`, `DESCRIPTION:${x(cxText(p, e))}`, `URL:${cxLink(p, e)}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Collision in one hour", "TRIGGER:-PT1H", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}
function cxCard(p, e) {
  const W = 1200, H = 675, c = document.createElement("canvas"); c.width = W * 2; c.height = H * 2; const g = c.getContext("2d"); g.scale(2, 2);
  const F = (w, px) => `${w} ${px}px "Segoe UI", system-ui, -apple-system, sans-serif`, r = cxResult(p), age = cxAge(r);
  let bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#241336"); bg.addColorStop(0.6, "#120a1f"); bg.addColorStop(1, "#07040d"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W * 0.78, H * 0.5, 20, W * 0.78, H * 0.5, 420); glow.addColorStop(0, "rgba(255,190,90,.18)"); glow.addColorStop(1, "rgba(255,190,90,0)"); g.fillStyle = glow; g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(106,232,255,.07)"; g.lineWidth = 1; for (let x = 0; x < W; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.fillStyle = "#ffb84d"; g.fillRect(0, 0, 8, H);
  g.fillStyle = "#ffb84d"; g.font = F(700, 20); g.fillText("G R A V I T A S", 56, 64);
  g.fillStyle = "#fff"; g.font = F(800, 54); g.fillText(e.close ? "CLOSE PASS" : "COLLISION", 56, 128);
  g.fillStyle = "#ffe1b0"; g.font = F(700, 30); g.fillText(p.sys, 56, 178, 640);
  g.fillStyle = "#ffd27a"; g.font = F(600, 24); g.fillText(`${p.a}  &  ${p.b}`, 56, 216, 640);
  g.fillStyle = "#cbbfdc"; g.font = F(500, 19); g.fillText(`${p.ta} & ${p.tb} · ${fmt(Math.hypot(p.x, p.y, p.z), 0)} ly from Sol`, 56, 246, 640);
  const boxes = e.close ? [[`${cxDay(e.start)}`, "DATE (UTC)"], [cxHM(e.start), "CLOSEST (UTC)"], [`${fmt(e.miss, 0)} km`, "MISSES BY"]]
    : [[cxDay(e.start), "DATE (UTC)"], [`${cxHM(e.start)}${e.end && e.end - e.start < 86400e3 ? "–" + cxHM(e.end) : ""}`, "TIME (UTC)"], [cxLasts(e).replace("lasts ", "") || "—", "LASTS"], [e.depth > 0 ? `${fmt(e.depth, 0)} km` : "—", "DEEPEST"]];
  const bw = e.close ? 205 : 152; boxes.forEach(([v, l], i) => { const x = 56 + i * (bw + 10), y = 280; g.fillStyle = "rgba(255,255,255,.06)"; g.beginPath(); g.roundRect(x, y, bw, 100, 12); g.fill();
    g.fillStyle = "#fff"; g.font = F(800, v.length > 9 ? 22 : 30); g.fillText(v, x + 16, y + 52, bw - 28); g.fillStyle = "#ffb84d"; g.font = F(700, 13); g.fillText(l, x + 16, y + 80, bw - 28); });
  g.fillStyle = "#cbbfdc"; g.font = F(500, 18); g.fillText(`Game time ${gameTime(e.start).slice(0, 16)}${!e.close && e.end && e.end - e.start >= 86400e3 ? `, until ${cxDay(e.end)} ${cxHM(e.end)} UTC` : ""}`, 56, 418, 640);
  if (age) { g.fillStyle = age.k === "mine" ? "#7ee2a8" : age.k === "old" ? "#ffb84d" : "#ffd27a"; g.font = F(600, 18); g.fillText(age.k === "mine" ? "Orbit data from your own scan" : `${age.tip.split(". ")[0]}: be there early`, 56, 448, 640); }
  if (e.close) { g.fillStyle = "#cbbfdc"; g.font = F(500, 18); g.fillText("With the current orbit data they just miss. Newer data may show them touching.", 56, 478, 640); }
  // the two bodies at their deepest moment, true to size
  const RA = (r && r.rA) || 1000, RB = (r && r.rB) || 1000;
  const dist = e.close ? RA + RB + e.miss : Math.max(Math.abs(RA - RB) * 0.2, RA + RB - (e.depth || 0)), span = RA + dist + RB, sc = 360 / Math.max(span, 2 * Math.max(RA, RB) * 1.15);
  const cy = 310, ax = 945 - (span * sc) / 2 + RA * sc, bx = ax + dist * sc;
  const disc = (x, rr, col) => { const gr = g.createRadialGradient(x - rr * 0.35, cy - rr * 0.35, rr * 0.1, x, cy, rr); gr.addColorStop(0, "rgba(255,255,255,.55)"); gr.addColorStop(0.08, col); gr.addColorStop(0.75, col); gr.addColorStop(1, "#140c1c"); g.fillStyle = gr; g.beginPath(); g.arc(x, cy, rr, 0, 2 * Math.PI); g.fill(); };
  disc(ax, RA * sc, cxColour(p.ta)); g.globalAlpha = 0.86; disc(bx, RB * sc, cxColour(p.tb)); g.globalAlpha = 1;
  if (!e.close) { g.save(); g.beginPath(); g.arc(ax, cy, RA * sc, 0, 2 * Math.PI); g.clip(); g.strokeStyle = "#ffb84d"; g.lineWidth = 3; g.beginPath(); g.arc(bx, cy, RB * sc, 0, 2 * Math.PI); g.stroke(); g.restore(); }
  g.fillStyle = "#fff"; g.font = F(700, 18); g.textAlign = "center"; g.fillText(p.a, ax, cy + RA * sc + 30); g.fillText(p.b, bx, cy + RB * sc + 30); g.textAlign = "left";
  g.fillStyle = "rgba(255,255,255,.08)"; g.fillRect(0, H - 64, W, 64);
  g.fillStyle = "#fff"; g.font = F(700, 18); g.fillText("gravitasmap.com", 56, H - 26);
  g.fillStyle = "#cbbfdc"; g.font = F(500, 16); g.textAlign = "right"; g.fillText("Worked out by GRAVITAS · list of pairs: Canonn Research", W - 56, H - 26); g.textAlign = "left";
  return c;
}
async function cxCardOpen(p) {
  let r = cxResult(p);
  if (!r || !(r.rA > 0)) r = await cxCalc(p) || r;            // the sizes for the picture come with a fresh look at the data
  const e = cxUpcoming(r) || cxClose(r); if (!e) { toast("No pass to put on a card"); return; }
  let el = $("cxCard"); if (!el) { el = document.createElement("div"); el.id = "cxCard"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Collision card"); document.body.appendChild(el); }
  const cv = cxCard(p, e);
  el.innerHTML = `<div class="cxCw"><img alt="Collision card" src="${cv.toDataURL("image/png")}"><div class="cxCb">
    <button type="button" class="pri" data-cc="img">Copy image</button><button type="button" data-cc="save">Save image</button><button type="button" data-cc="text">Copy text</button>
    <button type="button" data-cc="link">Copy link</button><button type="button" data-cc="ics">Add to calendar</button><button type="button" data-cc="x">Close</button></div></div>`;
  el.style.display = "flex"; el._p = p; el._e = e; el._c = cv;
}
document.addEventListener("click", async ev => {
  const el = $("cxCard"); if (!el || el.style.display !== "flex") return;
  if (ev.target === el) { el.style.display = "none"; return; }
  const b = ev.target.closest("[data-cc]"); if (!b) return;
  const p = el._p, e = el._e, a = b.dataset.cc, name = `gravitas-collision-${p.sys.replace(/[^\w-]+/g, "-")}-${new Date(e.start).toISOString().slice(0, 10)}`;
  const save = (blob, n) => { const u = URL.createObjectURL(blob), l = document.createElement("a"); l.href = u; l.download = n; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); };
  if (a === "x") { el.style.display = "none"; return; }
  if (a === "img" || a === "save") { const blob = await new Promise(r => el._c.toBlob(r, "image/png"));
    if (a === "img") { try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); b.textContent = "Copied: paste in Discord"; return; } catch (x) { b.textContent = "Saved instead"; } }
    save(blob, name + ".png"); return; }
  if (a === "text" || a === "link") { const t = a === "text" ? cxText(p, e) : cxLink(p, e); try { await navigator.clipboard.writeText(t); b.textContent = "Copied"; } catch (x) { prompt("Copy:", t); } return; }
  if (a === "ics") { save(new Blob([cxICS(p, e)], { type: "text/calendar" }), name + ".ics"); b.textContent = "Saved: open it to add"; }
});
addEventListener("keydown", e => { const el = $("cxCard"); if (e.key === "Escape" && el && el.style.display === "flex") el.style.display = "none"; });
// ------------------------------------------------------------ v0.96 the next pass, on the Collisions button (the times load a while after the page)
function cxSoon() {
  if (!CX.next) return;
  const now = Date.now(); let best = null;
  const look = (k, r) => { const e = cxUpcoming(r); if (e && e.start > now && (!best || e.start < best.t) && r.map !== false) best = { k, t: e.start }; };
  for (const [k, r] of CX.next) if (!CX.live.has(k)) look(k, r);
  for (const [k, r] of CX.live) look(k, r);
  CX.soon = best; cxPanel();
}
function cxPanel() {
  const b = document.querySelector('#modes [data-mode="Collisions"]'); if (!b) return;
  const s = CX.soon, left = s ? s.t - Date.now() : Infinity, hot = left > 0 && left < 3600e3;
  b.classList.toggle("soon", hot);
  const p = s && CX.byKey ? CX.byKey.get(s.k) : null, [id, a, bb] = s ? s.k.split("|") : [];
  b.title = s && left > 0 ? `Next collision ${cxIn(s.t)}: ${p ? p.sys : "system " + id} ${a} & ${bb}` : "GRAVITAS: Collisions, bodies passing through each other";
}
if (!(typeof isPhone === "function" && isPhone())) setTimeout(() => { try { cxLoadNext(); } catch (e) {} }, 20000);
setInterval(() => { if (CX.next) cxPanel(); }, 30000);
// ------------------------------------------------------------ a link to a moment: ?system=…&id64=…&t=…&view=3d&cw=<body>|<body>
{ const q = new URLSearchParams(location.search), cw = q.get("cw"), id = q.get("id64"), t0 = parseGameTime(q.get("t"));
  if (cw && cw.includes("|") && t0 != null && id) { const [a, b] = cw.split("|"), until = Date.now() + 120e3;
    const go = () => { if (S && S.sys && String(S.sys.id64) === id && S.bodies && S.bodies.length) { setTimeout(() => { try { cxWatchAt({ a, b }, { start: t0, end: null }); } catch (e) {} }, 1200); return; }
      if (Date.now() < until) setTimeout(go, 500); };
    setTimeout(go, 1000); } }
$("newsBody").addEventListener("click", e => {
  if (NEWS_SET !== "modes" || MODES.tab !== "Collisions") return;
  const s = e.target.closest("[data-cxsub]"); if (s) { CX.sub = s.dataset.cxsub; cxRefresh(); return; }
  const g = e.target.closest("[data-cxgo]"); if (!g) return;
  const k = g.closest("[data-cx]").dataset.cx, p = CX.byKey && CX.byKey.get(k); if (!p) return;
  if (g.dataset.cxgo === "calc") cxCalc(p); else if (g.dataset.cxgo === "card") cxCardOpen(p); else cxWatch(p);
});
$("newsBody").addEventListener("input", e => { if (e.target.id === "cxQ") { CX.q = e.target.value; cxRefresh(); } });
MODES_TABS = Object.assign({ "Combat": MODES_TABS["Combat"], "Collisions": cxTabHTML }, MODES_TABS);
setInterval(() => { if (cxShown() && CX.pairs) cxRefresh(); }, 30000);       // "in 3 h" and "happening now" follow the clock
