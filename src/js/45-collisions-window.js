// ------------------------------------------------------------ v0.95 GRAVITAS MODES: Collisions
// Bodies whose orbits cross pass through each other in Elite Dangerous. The list of such pairs across the galaxy is
// Canonn Research's open list (credited here). Every time on this page is GRAVITAS's own: worked out from the Spansh
// orbit data with the collision engine (29-coll-engine.js). The list loads only when this window is opened.
var CX = { pairs: null, next: null, live: new Map(), busy: new Set(), sub: "up", q: "", load: null, meta: null, err: "" };
const CX_YEARS = 3, CX_SHOW = 60;
const cxKey = (id, a, b) => `${id}|${a}|${b}`;
function cxLoad() {
  if (CX.load) return CX.load;
  CX.load = Promise.all([
    fetch("assets/coll-pairs.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
    fetch("assets/coll-next.json").then(r => r.ok ? r.json() : null).catch(() => null),   // GRAVITAS's own times, worked out ahead
  ]).then(([p, n]) => {
    CX.meta = p; CX.pairs = p.pairs.map(r => ({ id: String(r[0]), sys: r[1], a: r[2], b: r[3], x: r[4], y: r[5], z: r[6], ta: p.types[r[7]], tb: p.types[r[8]], f: r[9] }));
    CX.next = new Map(); if (n && n.pairs) { CX.made = n.made; for (const r of n.pairs) CX.next.set(cxKey(r[0], r[1], r[2]), { why: r[3] || null, ev: (r[4] || []).map(e => ({ start: e[0] * 1000, end: e[1] ? e[1] * 1000 : null, depth: e[2] })), at: n.made }); }
    cxRefresh();
  }).catch(e => { CX.err = "The list could not be loaded. Try again later."; CX.load = null; cxRefresh(); });
  return CX.load;
}
function cxResult(p) { return CX.live.get(cxKey(p.id, p.a, p.b)) || (CX.next && CX.next.get(cxKey(p.id, p.a, p.b))) || null; }
function cxUpcoming(r) { const now = Date.now(); return r && r.ev ? r.ev.find(e => (e.end || e.start + 3600e3) > now) || null : null; }
function cxWhen(e) {
  const now = Date.now(), d = new Date(e.start), on = e.start <= now && (e.end === null || e.end > now);
  const day = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }), hm = t => new Date(t).toISOString().slice(11, 16);
  const left = e.start - now, inT = left > 2 * 86400e3 ? `in ${Math.round(left / 86400e3)} days` : left > 3600e3 ? `in ${Math.round(left / 3600e3)} h` : left > 0 ? `in ${Math.max(1, Math.round(left / 60e3))} min` : "";
  return `${on ? `<b class="cxNow">happening now</b> · ` : ""}${day} · ${hm(e.start)}–${e.end ? hm(e.end) : "…"} UTC${inT && !on ? ` · <span class="cxIn">${inT}</span>` : ""}`;
}
const CX_WHY = { phase: "Spansh does not know where these bodies are on their orbits yet",
  epoch: "the orbit data has no time of its own, so the time cannot be trusted", missing: "a body or its orbit is missing on Spansh",
  apart: "with the current orbit data these orbits never come close enough", moon: "one of them orbits the other", none: `none in the next ${CX_YEARS} years`, fail: "Spansh did not answer. Try again" };
function cxNeeds(p) { const r = cxResult(p); return r ? r.why === "phase" || r.why === "epoch" : !(p.f & 1); }
function cxList() {
  if (!CX.pairs) return [];
  const q = CX.q.trim().toLowerCase(), F = CX.meta.flags;
  let L = CX.pairs.filter(p => !q || p.sys.toLowerCase().includes(q));
  if (CX.sub === "up") L = L.filter(p => cxUpcoming(cxResult(p))).sort((p, o) => cxUpcoming(cxResult(p)).start - cxUpcoming(cxResult(o)).start);
  else if (CX.sub === "hab") L = L.filter(p => p.f & (F.habitable | F.water_earth_ammonia | F.colony));
  else if (CX.sub === "need") L = L.filter(cxNeeds);
  if (CX.sub === "near" || (CX.sub !== "up" && cxHere())) { const h = cxHere(); if (h) L = L.map(p => [p, Math.hypot(p.x - h.x, p.y - h.y, p.z - h.z)]).sort((a, b) => a[1] - b[1]).map(a => (a[0]._d = a[1], a[0])); }
  return L;
}
function cxHere() { return typeof S !== "undefined" && S && S.sys && S.sys.coords ? S.sys.coords : null; }
function cxRow(p) {
  const r = cxResult(p), e = cxUpcoming(r), F = CX.meta.flags, k = cxKey(p.id, p.a, p.b), busy = CX.busy.has(k);
  const tags = [p.f & F.habitable ? "habitable" : "", p.f & F.water_earth_ammonia ? "water, earth-like or ammonia" : "", p.f & F.colony ? "colonisation target" : "", p.f & F.landable ? "landable" : "", p.f & F.atmosphere ? "atmosphere" : "", p.f & F.populated ? "populated" : ""].filter(Boolean);
  const st = busy ? `<span class="cxDim">Working it out…</span>` : e ? cxWhen(e) + (e.depth > 0 ? ` · ${fmt(e.depth, 0)} km deep` : "") + (r.why === "epoch" ? ` · <span class="cxDim" title="${esc(CX_WHY.epoch)}">less sure</span>` : "")
    : r ? `<span class="cxDim">${esc(CX_WHY[r.why] || CX_WHY.none)}</span>` : `<span class="cxDim">not worked out yet</span>`;
  const d = p._d != null && cxHere() ? ` · ${fmt(p._d, p._d < 100 ? 1 : 0)} ly` : "";
  return `<div class="cxR" data-cx="${esc(k)}"><div class="cxT"><b>${esc(p.sys)}</b> <span class="cxB">${esc(p.a)} &amp; ${esc(p.b)}</span><span class="cxDim">${d}</span><br>
    <span class="cxTy">${esc(p.ta)} &amp; ${esc(p.tb)}${tags.length ? " · " + tags.join(" · ") : ""}</span><br><span class="cxSt">${st}</span></div>
    <div class="cxA">${busy ? "" : `<button type="button" data-cxgo="calc" title="Work out the next times now, from the latest Spansh data">${r && !CX.live.has(k) ? "Update" : r ? "Again" : "Work it out"}</button>`}<button type="button" data-cxgo="open" class="pri" title="${e ? "Open the system at this moment, in true size" : "Open the system"}">${e ? "Watch" : "Open"}</button></div></div>`;
}
function cxNavHTML() {
  const b = (k, l) => `<button type="button" data-cxsub="${k}" class="${CX.sub === k ? "on" : ""}">${l}</button>`;
  return b("up", "Upcoming") + b("hab", "Habitable worlds") + b("near", "Near you") + b("need", "Needs data") + b("all", "All pairs");
}
function cxBodyHTML() {
  if (CX.err) return `<p class="note">${esc(CX.err)}</p>`;
  if (!CX.pairs) return `<p class="cxDim">Loading the list…</p>`;
  const L = cxList(), shown = L.slice(0, CX_SHOW);
  const head = CX.sub === "up" ? (L.length ? `<p class="cxDim">The next passes GRAVITAS has worked out, soonest first.${CX.made ? ` Worked out on ${new Date(CX.made).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}: use <b>Update</b> for the latest Spansh data.` : ""}</p>`
      : `<p class="cxDim">No times worked out yet. Pick a pair under <b>All pairs</b> or <b>Near you</b> and press <b>Work it out</b>.</p>`)
    : CX.sub === "near" && !cxHere() ? `<p class="cxDim">Open a system first: the pairs nearest to it come first.</p>`
    : CX.sub === "need" ? `<p class="cxDim">For these pairs Spansh does not know yet where the bodies are on their orbits, so no time can be worked out. Scan both bodies in the game (the FSS is enough) with a tool that shares scans, such as EDMC, and the next time can be worked out here.</p>` : "";
  return head + (shown.length ? shown.map(cxRow).join("") : CX.sub === "up" ? "" : `<p class="cxDim">No pairs here${CX.q ? " for this name" : ""}.</p>`) +
    (L.length > CX_SHOW ? `<p class="cxDim">${fmt(L.length - CX_SHOW, 0)} more. Type a system name to find one.</p>` : "");
}
const CX_TEXT = () => `<div class="q">HOW IT WORKS</div><p>In Elite Dangerous bodies whose orbits cross do not crash: they pass through each other, and commanders go to watch. For each pair GRAVITAS finds the moments the bodies meet from the latest orbit data on Spansh: first where the two can line up (once every synodic period), then the true positions and true sizes of both bodies decide when they touch, how deep they go and when they part. <b>Watch</b> opens the system at that moment in true size.</p>
  <p>Times are as good as the orbit data. The newer the scan of both bodies, the closer the time. A time a few minutes off is possible, so be there early.</p>
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
// one pair, now, from the latest Spansh data: the same engine as the list
async function cxCalc(p, keep) {
  const k = cxKey(p.id, p.a, p.b); if (CX.busy.has(k)) return null;
  CX.busy.add(k); cxRefresh();
  try {
    const j = await cxFetch(p), M = cxPrep(j), P = cxPair(M, cxFind(M, p.a), cxFind(M, p.b));
    let res = { why: P.why && P.why !== "epoch" ? P.why : null, ev: [] };
    if (P.gap && P.why !== "phase") { const r = cxNext(P, Date.now() - 6 * 3600e3, CX_YEARS * 365.25, 3); res = { why: r.events.length ? (P.why || null) : P.why || "none", ev: r.events }; }
    CX.live.set(k, res); if (keep) keep.j = j;
    return res;
  } catch (e) { CX.live.set(k, { why: "fail", ev: [] }); return null; }
  finally { CX.busy.delete(k); cxRefresh(); }
}
async function cxWatch(p) {
  const keep = {}; let r = cxResult(p);
  if (!CX.live.has(cxKey(p.id, p.a, p.b))) r = await cxCalc(p, keep);        // fresh data for the moment that is shown
  const e = cxUpcoming(r);
  $("news").style.display = "none";
  const ok = await loadSystem(p.sys, keep.j ? { pre: Promise.resolve(keep.j), id64: p.id } : { id64: p.id });
  if (!ok || !S || !e) return;
  const nm = l => String(l).replace(/\s+/g, "").toLowerCase(), A = S.bodies.find(b => nm(shortName(b, S.sys.name)) === nm(p.a)), B = S.bodies.find(b => nm(shortName(b, S.sys.name)) === nm(p.b));
  if (A && B) collWatch({ bodies: new Set([A, B]), list: [{ A, B, start: e.start, end: e.end }], start: e.start, end: e.end, all: null });
}
$("newsBody").addEventListener("click", e => {
  if (NEWS_SET !== "modes" || MODES.tab !== "Collisions") return;
  const s = e.target.closest("[data-cxsub]"); if (s) { CX.sub = s.dataset.cxsub; cxRefresh(); return; }
  const g = e.target.closest("[data-cxgo]"); if (!g) return;
  const k = g.closest("[data-cx]").dataset.cx, p = CX.pairs && CX.pairs.find(x => cxKey(x.id, x.a, x.b) === k); if (!p) return;
  if (g.dataset.cxgo === "calc") cxCalc(p); else cxWatch(p);
});
$("newsBody").addEventListener("input", e => { if (e.target.id === "cxQ") { CX.q = e.target.value; cxRefresh(); } });
MODES_TABS = Object.assign({ "Combat": MODES_TABS["Combat"], "Collisions": cxTabHTML }, MODES_TABS);
setInterval(() => { if (cxShown() && CX.pairs) cxRefresh(); }, 30000);       // "in 3 h" and "happening now" follow the clock
