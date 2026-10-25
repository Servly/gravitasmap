// v0.80 the journey. While Sync knows a plotted route, the system map becomes a column: the system you just left as a thin
// bar above the map (scroll up for the ones before it), the map of where you are now, and your next three jumps as thin
// bars below it. When the ship jumps, the map rises into the bar above and the next system grows up from below.
// Only the map. Only three systems are ever kept in memory as data (the one behind, the one you are in, the next one);
// the rest are names until you tap them. Tap a bar to open that system; a button then takes you back to your ship.
// v0.81: jumps are numbered by their place in the route (7 of 50), a column on the left lists the whole route and scrolls,
// a short message says when the map enters and leaves route mode, the jump has a clear drawer motion, and the next three
// bars show a small summary of each system (only the summary is kept, the data itself is dropped).
var JRN = { past: [], cls: {}, last: "", cache: new Map(), sum: new Map(), on: false, up: null, dn: null, col: null, msg: null, back: null, anim: false, sig: "",
  rOn: null, rDest: "", keep: null, hold: 0, fin: null, leaving: false, leaveT: 0, ghost: null, ahead: false, colW: 0 };
const JRN_BAR = 40, JRN_GAP = 6, JRN_COL = 214;
try { JRN.past = JSON.parse(localStorage.getItem("gravitas.journey") || "[]").slice(-30); } catch (e) {}
// v0.82.3: where this journey started. Stops left before it are earlier trips: they stay, above a line, one scroll up
const JRN_GAP_MS = 3600e3;                                             // an hour without a jump: the next jump starts a new journey
try { const j = JSON.parse(localStorage.getItem("gravitas.journeyStart") || "null"); if (j) { JRN.jStart = +j.t || 0; JRN.jDest = j.d || ""; } } catch (e) {}
function jrnNewJourney(dest, t) {
  JRN.jStart = t || Date.now(); JRN.jDest = dest || ""; if (JRN.up) JRN.up._h = "";
  try { localStorage.setItem("gravitas.journeyStart", JSON.stringify({ t: JRN.jStart, d: JRN.jDest })); } catch (e) {}
}

// the raw data of a system, kept as text so a fresh copy is built each time (building marks the data it is given)
function sysFetch(name) {
  if (typeof JRN === "undefined" || !JRN) return fetch(`${API}/system?name=${encodeURIComponent(name)}`).then(apiJSON);   // the first system loads before this part runs
  const k = String(name || "").toLowerCase(); if (!k) return Promise.reject(new Error("no name"));
  if (!JRN.cache.has(k)) {
    const p = fetch(`${API}/system?name=${encodeURIComponent(name)}`).then(async r => {
      const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) { throw new Error("the data arrived incomplete. Please try again in a minute."); }
      if (!r.ok || j.error) throw new Error(j.error || r.statusText); return t; });
    p.then(t => { p._v = t; try { jrnSumOf(k, JSON.parse(t)); } catch (e) {} }, () => { if (JRN.cache.get(k) === p) JRN.cache.delete(k); });   // a failed answer is not kept: next time asks again
    JRN.cache.set(k, p);
  }
  return JRN.cache.get(k).then(t => JSON.parse(t));
}
// keep only the one behind, the one here and the next one (the browser's memory stays small)
function jrnPrune() {
  const keep = new Set([JRN.last, (JRN.past[JRN.past.length - 1] || {}).n, jrnHops()[0] && jrnHops()[0][0], S && S.sys.name].filter(Boolean).map(x => x.toLowerCase()));
  for (const k of [...JRN.cache.keys()]) if (!keep.has(k)) JRN.cache.delete(k);
}
function jrnHops() { const ri = typeof syncRouteInfo === "function" ? syncRouteInfo() : null; return ri && ri.hops ? ri.hops : []; }
const jrnAt = () => SYNC.here || "";
const jrnViewingOther = () => !!(S && jrnAt() && !syncSame(S.sys.name, jrnAt()));
// v0.81: a small summary of a system: kept after its data is dropped (a few numbers per system, the last 80 systems)
function jrnSumOf(k, j) {
  const s = (j && j.system) || {}, b = s.bodies || [], land = b.filter(x => x.isLandable).length;
  const st = (s.stations || []).filter(x => !/carrier/i.test(x.type || "")).length + b.reduce((a, x) => a + (x.stations || []).filter(y => !/carrier/i.test(y.type || "")).length, 0);
  const kind = t => b.filter(x => x.subType === t).length;
  const sum = { bodies: Math.max(b.length, +s.bodyCount || 0), land, st, pop: s.population || 0, econ: s.primaryEconomy && s.primaryEconomy !== "None" ? s.primaryEconomy : "",
    sec: s.security && s.population ? s.security : "", elw: kind("Earth-like world"), ww: kind("Water world"), aw: kind("Ammonia world") };
  sum.w = watchState(s, watchHits(b, s.name || ""));                  // v0.82.5: what the Watch list looks for (v0.90: and the factions' states)
  JRN.sum.delete(k); JRN.sum.set(k, sum); while (JRN.sum.size > 80) JRN.sum.delete(JRN.sum.keys().next().value);
  return sum;
}
const jrnInfo = name => JRN.sum.get(String(name || "").toLowerCase()) || null;
function jrnInfoText(inf) {
  if (!inf) return "";
  const w = [inf.elw && `${inf.elw} Earth-like`, inf.ww && `${inf.ww} water world${inf.ww > 1 ? "s" : ""}`, inf.aw && `${inf.aw} ammonia`].filter(Boolean);
  return [`${inf.bodies} bodies`, `${inf.land} landable`, inf.st && `${inf.st} station${inf.st > 1 ? "s" : ""}`, inf.pop && `${jrnPop(inf.pop)} people`, inf.econ, inf.sec && `${inf.sec} security`, ...w].filter(Boolean).join(" · ");
}
const jrnPop = p => p >= 1e9 ? (p / 1e9).toFixed(p >= 1e10 ? 0 : 1) + " billion" : p >= 1e6 ? (p / 1e6).toFixed(p >= 1e7 ? 0 : 1) + " million" : p >= 1e3 ? Math.round(p / 1e3) + " thousand" : String(p);
// what the star means for the pilot, shown until the summary is here
function jrnStarText(c) {
  if (!c) return ""; if (SCOOP.test(c)) return `Class ${c} star · fuel scoop`;
  if (/^N/.test(c)) return "Neutron star · jet cone boost"; if (/^D/.test(c)) return "White dwarf · small boost";
  if (/^(H|Supermassive)/i.test(c)) return "Black hole · no fuel"; return `Class ${c} · no fuel`;
}
// v0.81: the next three systems, fetched one after another; only their summaries stay (the next one keeps its data too)
async function jrnAhead() {
  if (JRN.ahead) return; JRN.ahead = true;
  try {
    const hs = jrnHops().slice(0, 3);                                   // v0.82.5: the next three (only their summaries stay)
    for (const h of hs) { if (!JRN.on) break; const k = h[0].toLowerCase(); if (JRN.sum.has(k) && (h !== hs[0] || JRN.cache.has(k))) continue;
      try { await sysFetch(h[0]); } catch (e) {} JRN.sig = ""; }
  } finally { JRN.ahead = false; jrnPrune(); }
}
// v0.82.5 Watch: what to look out for on the way. Only the system you are in and the next three are checked (their data is
// fetched for the bars anyway; only a few numbers per system are kept). The list follows what explorers, exobiologists and
// miners go after: the valuable worlds, life and geology on the surface, ring hotspots, rare stars and rare gas giants
const WATCH = [
  ["Worlds", [["elw", "ELW", "Earth-like world"], ["ww", "WW", "Water world"], ["aw", "AW", "Ammonia world"], ["tf", "TF", "Terraformable"]]],
  ["On the surface", [["bio", "BIO", "Biological signals"], ["geo", "GEO", "Geological signals"], ["atm", "ATM", "Landable with an atmosphere"]]],
  ["Mining", [["hot", "HOT", "Ring hotspots"]]],
  ["Rare stars", [["ns", "NS", "Neutron star"], ["bh", "BH", "Black hole"], ["wd", "WD", "White dwarf"], ["wr", "WR", "Wolf-Rayet star"], ["cs", "C★", "Carbon or S-type star"], ["gi", "GIANT", "Giant or supergiant star"]]],
  ["Rare gas giants", [["wg", "WG", "Water giant"], ["he", "HE", "Helium-rich gas giant"], ["lg", "LIFE", "Gas giant with life"]]],
  ["System state", [["boom", "BOOM", "Boom"], ["war", "WAR", "War"], ["cwar", "CIVIL WAR", "Civil war"]]],   // v0.90
];
const WATCH_DEF = ["elw", "ww", "aw", "tf", "bio", "geo", "hot", "ns", "bh", "wr", "wg", "he", "boom", "war", "cwar"];
let WATCH_ON = new Set(WATCH_DEF), WATCH_SOUND = true;
try { const v = JSON.parse(localStorage.getItem("gravitas.watch") || "null"); if (Array.isArray(v)) WATCH_ON = new Set(v); WATCH_SOUND = localStorage.getItem("gravitas.watchSound") !== "0"; } catch (e) {}
const watchSig = (b, key) => { const g = b.signals && b.signals.signals; if (!g) return 0; let n = 0; for (const k in g) if (k.includes(key)) n += +g[k] || 0; return n; };
function watchHits(bodies, sys) {
  const w = {}, add = (k, b, n = 1) => { const e = w[k] || (w[k] = { n: 0, at: [] }); e.n += n; if (e.at.length < 4) e.at.push(b.bodyId); };
  for (const b of bodies || []) {
    const st = String(b.subType || ""), star = b.type === "Star";
    if (st === "Earth-like world") add("elw", b); else if (st === "Water world") add("ww", b); else if (st === "Ammonia world") add("aw", b);
    if (/terraform/i.test(b.terraformingState || "") && !/^not/i.test(b.terraformingState || "")) add("tf", b);
    const bio = watchSig(b, "Biological"), geo = watchSig(b, "Geological"); if (bio) add("bio", b, bio); if (geo) add("geo", b, geo);
    if (b.isLandable && b.atmosphereType && !/^no atmosphere/i.test(b.atmosphereType)) add("atm", b);
    for (const r of b.rings || []) { const g = r.signals && r.signals.signals; if (!g) continue; let n = 0; for (const k in g) if (!k.startsWith("$")) n += +g[k] || 0;
      if (n) { add("hot", b, n); const e = w.hot; e.what = e.what || {}; for (const k in g) if (!k.startsWith("$")) e.what[k] = (e.what[k] || 0) + (+g[k] || 0); } }
    if (star) {
      if (/neutron/i.test(st)) add("ns", b); else if (/black hole/i.test(st)) add("bh", b); else if (/white dwarf/i.test(st)) add("wd", b);
      else if (/wolf-rayet/i.test(st)) add("wr", b); else if (/^(C|CN|CJ|CH|CHd|MS|S)[ -]/.test(st) || /^(MS|S)-type/i.test(st)) add("cs", b);
      if (/giant/i.test(st)) add("gi", b);
    } else if (/^water giant/i.test(st)) add("wg", b); else if (/^helium/i.test(st)) add("he", b); else if (/gas giant with .*life/i.test(st)) add("lg", b);
  }
  return w;
}
// v0.90: the factions' states (Boom, War, Civil War), with the faction and the date of the report
function watchState(sys, w) {
  const date = sys.date || (sys.timestamps && sys.timestamps.factions) || "";
  for (const f of sys.factions || []) {
    const st = new Set([f.state, ...(f.activeStates || []).map(x => x && x.state)].filter(Boolean).map(x => String(x).toLowerCase()));
    for (const [k, s] of [["boom", "boom"], ["war", "war"], ["cwar", "civil war"], ["cwar", "civilwar"]]) if (st.has(s)) {
      const e = w[k] || (w[k] = { n: 0, at: [], who: [], date }); if (!e.who.includes(f.name)) { e.n++; e.who.push(f.name); } }
  }
  return w;
}
// the Watch hits of a system: the one on screen from its own data, the next ones from their summaries
function watchOf(name) {
  if (S && syncSame(S.sys.name, name)) { if (S._watch === undefined) S._watch = watchState(S.sys, watchHits(S.bodies, S.sys.name)); return S._watch; }
  const inf = jrnInfo(name); return inf ? inf.w || null : null;
}
const WATCH_NAME = Object.fromEntries(WATCH.flatMap(g => g[1]).map(x => [x[0], x]));
const watchOn = () => WATCH.flatMap(g => g[1].map(x => x[0])).filter(k => WATCH_ON.has(k));   // in the list's order
const hotName = k => k.replace(/([a-z])([A-Z])/g, "$1 $2");
function watchBadges(w) {
  if (!w) return "";
  return watchOn().filter(k => w[k] && w[k].n && WATCH_NAME[k]).map(k => { const [id, short, long] = WATCH_NAME[k], n = w[k].n;
    const extra = k === "hot" && w.hot.what ? ": " + Object.entries(w.hot.what).sort((a, b) => b[1] - a[1]).map(([a, c]) => `${hotName(a)} ${c}`).join(", ") : "";
    if (w[k].who) return `<i class="wb wb-${id}" title="${esc(`${long}: ${w[k].who.join(", ")}${w[k].date ? ` · reported ${stwAgo(w[k].date)}` : ""}`)}">${short}</i>`;   // v0.90: a faction state
    return `<i class="wb wb-${id}" title="${esc(`${n} × ${long}${extra}`)}">${short}${n > 1 || /bio|geo|hot/.test(id) ? ` ${n}` : ""}</i>`; }).join("");
}
function watchText(w) {
  return watchOn().filter(k => w && w[k] && w[k].n && WATCH_NAME[k]).map(k => { const n = w[k].n, l = WATCH_NAME[k][2];
    if (w[k].who) return `${l} (${w[k].who.join(", ")})`;
    return /bio|geo|hot/.test(k) ? `${n} ${l.toLowerCase()}` : `${n} ${l}${n > 1 && !/s$/.test(l) ? "s" : ""}`; }).join(" · ");
}
// the Watch menu: tick what to look out for
function watchMenu(anchor) {
  let m = $("jrnWatch");
  if (m && m.style.display === "block") { m.style.display = "none"; return; }
  if (!m) { m = document.createElement("div"); m.id = "jrnWatch"; m.className = "panel"; m.setAttribute("role", "dialog"); m.setAttribute("aria-label", "Watch for"); document.body.appendChild(m);
    m.addEventListener("change", e => { const c = e.target; if (c.dataset.w) { c.checked ? WATCH_ON.add(c.dataset.w) : WATCH_ON.delete(c.dataset.w); try { localStorage.setItem("gravitas.watch", JSON.stringify([...WATCH_ON])); } catch (x) {} }
      if (c.dataset.snd != null) { WATCH_SOUND = c.checked; try { localStorage.setItem("gravitas.watchSound", WATCH_SOUND ? "1" : "0"); } catch (x) {} if (WATCH_SOUND) try { Sound.unlock(); Sound.chime(); } catch (x) {} }
      JRN.sig = ""; JRN.wKey = ""; jrnRender(); });
    addEventListener("pointerdown", e => { if (m.style.display === "block" && !m.contains(e.target) && !e.target.closest("[data-watch]")) m.style.display = "none"; }, true);
    addEventListener("keydown", e => { if (e.key === "Escape") m.style.display = "none"; }); }
  m.innerHTML = `<div class="jwh"><b>WATCH FOR</b><span>in the system you are in and your next three jumps</span></div>`
    + WATCH.map(([g, xs]) => `<div class="jwg"><em>${g}</em>${xs.map(([id, short, long]) => `<label><input type="checkbox" data-w="${id}"${WATCH_ON.has(id) ? " checked" : ""}><i class="wb wb-${id}">${short}</i>${long}</label>`).join("")}</div>`).join("")
    + `<label class="jws"><input type="checkbox" data-snd${WATCH_SOUND ? " checked" : ""}>A soft chime when you arrive at a match</label>`;
  const r = anchor.getBoundingClientRect(); m.style.display = "block";
  const w = m.offsetWidth, h = m.offsetHeight;
  Object.assign(m.style, { left: Math.round(Math.max(8, Math.min(innerWidth - w - 8, r.left))) + "px", top: Math.round(Math.max(8, Math.min(innerHeight - h - 8, r.bottom + 6))) + "px" });
}
// on the map, the matching bodies of the system on screen glow
function watchMark() {
  const w = JRN.on && S ? watchOf(S.sys.name) : null, ids = new Set();
  if (w) for (const k of WATCH_ON) if (w[k]) for (const id of w[k].at) ids.add(id);
  const key = (S ? S.sys.name : "") + "|" + [...ids].join(",") + "|" + (SMAP.built === S);
  if (key === JRN.wKey) return; JRN.wKey = key;
  for (const e of document.querySelectorAll("#smapSvg .smo.watch")) e.classList.remove("watch");
  for (const id of ids) { const e = document.querySelector(`#smapSvg .smo[data-id="${id}"]`); if (e) e.classList.add("watch"); }
}
// arriving at a system with a match: a short note and, if wanted, one soft chime
function watchArrive() {
  if (!JRN.on || !S || !syncSame(S.sys.name, jrnAt())) return;
  const t = watchText(watchOf(S.sys.name)); if (!t) return;
  setTimeout(() => { jrnSay("WATCH", `${S.sys.name}: ${t}`, "watch"); if (WATCH_SOUND) try { Sound.chime(); } catch (e) {} }, 1400);
}
const FUEL_SVG = '<svg class="jfuel" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M3 14V3.5A1.5 1.5 0 0 1 4.5 2h4A1.5 1.5 0 0 1 10 3.5V14M2 14h9M4.5 5h4"/><path d="M10 7h1.5a1 1 0 0 1 1 1v3.5a1 1 0 0 0 2 0V6l-2-2"/></svg>';
// v0.81: the jump number of a stop in the route: 1 is the first jump after the start
function jrnNum(ri, k) { return ri && ri.at != null ? ri.at + k + 1 : k + 1; }
function jrnInit() {
  if (JRN.up) return;
  const mk = (id, label, cls) => { const e = document.createElement(cls === "button" ? "button" : "div"); e.id = id; if (label) e.setAttribute("aria-label", label); return e; };
  const up = JRN.up = mk("jrnUp", "Systems you came through"), dn = JRN.dn = mk("jrnDn", "Your next jumps"), col = JRN.col = mk("jrnCol", "Your route");
  const msg = JRN.msg = mk("jrnMsg"); msg.setAttribute("role", "status"); msg.setAttribute("aria-live", "polite");
  const bk = JRN.back = mk("jrnBack", "", "button"); bk.className = "panel";
  document.body.append(up, dn, col, msg, bk);
  const open = e => { if (e.target.closest("[data-back]")) { e.stopPropagation(); bk.onclick(); return; }
    { const wbt = e.target.closest("[data-watch]"); if (wbt) { e.stopPropagation(); try { Sound.click(); } catch (x) {} watchMenu(wbt); return; } }   // v0.82.5
    const r = e.target.closest("[data-sys]"); if (!r) return; const n = r.dataset.sys; if (S && syncSame(S.sys.name, n)) return;
    if (syncSame(n, jrnAt())) { bk.onclick(); return; }
    JRN.anim = false; try { Sound.click(); } catch (x) {} loadSystem(n, { user: true }).then(() => jrnRender()); };
  up.addEventListener("click", open); dn.addEventListener("click", open); col.addEventListener("click", open);
  // v0.81: back to the ship's system, shown whole (not zoomed on the ship)
  bk.onclick = () => { JRN.anim = false; const h = jrnAt(); if (h) loadSystem(h).then(() => { jrnRender(); setTimeout(() => { try { smapFit(); } catch (e) {} }, 60); }); };
}
const jrnStar = c => c ? starChip(c) : "";
const jrnLy = v => v >= 100 ? v.toFixed(0) : v.toFixed(1);
function jrnRender() {
  jrnInit();
  const st = jrnState(), { hops, ri } = st, on = !!(MAPMODE && st.mode !== "off");
  jrnMode(st);
  document.body.classList.toggle("jrnWait", st.mode === "hold");      // v0.82: the route went away for a moment: waiting for the new one
  if (on !== JRN.on) { jrnSetOn(on); if (on) jrnAhead(); }
  JRN.back.style.display = "none";                                   // v0.80: the way back sits at the right end of the bar you are looking at
  const backBtn = `<span class="jback" data-back role="button" tabindex="0" title="Back to the system your ship is in, shown whole">⟲ Back to ${esc(jrnAt())}</span>`;
  if (!on) { if (!JRN.leaving) jrnColClass(false); return; }
  const viewing = S ? S.sys.name : "";
  const js = JRN.jStart || 0, old = JRN.past.filter(p => (p.t || 0) < js), now = JRN.past.filter(p => (p.t || 0) >= js);
  const bar = (p, k, last) => `<button class="jb past${k === "Earlier" && last === false ? " old" : ""}${syncSame(p.n, viewing) ? " cur" : ""}" data-sys="${esc(p.n)}"><span class="jk">${k}</span><b>${esc(p.n)}</b>${jrnStar(p.c)}<span class="jx">${p.t ? `left ${esc(stwAgo(new Date(p.t).toISOString()))}` : ""}</span>${syncSame(p.n, viewing) && jrnViewingOther() ? backBtn : ""}</button>`;
  const lo = old[old.length - 1];
  // v0.82.3: earlier trips (dim), a line, then this journey; with nothing left behind yet, the start bar says where you were last
  const up = old.map(p => bar(p, "Earlier", false)).join("") + (old.length ? `<div class="jb sep" aria-hidden="true"><span>Earlier trips above · this journey below</span></div>` : "")
    + (now.length ? now.map((p, i) => bar(p, i === now.length - 1 ? "Previous" : "Earlier", true)).join("")
      : `<div class="jb none${lo ? " start" : ""}"${lo ? ` data-sys="${esc(lo.n)}" role="button" tabindex="0" title="Open ${esc(lo.n)}"` : ""}><span class="jk">Start</span><span class="jx">Your journey starts here${lo ? ` · last time you left <b>${esc(lo.n)}</b> ${esc(stwAgo(new Date(lo.t).toISOString()))}` : ""}</span>${lo && syncSame(lo.n, viewing) && jrnViewingOther() ? backBtn : ""}</div>`);
  if (JRN.up._h !== up) { JRN.up._h = up; JRN.up.innerHTML = up; JRN.up._stick = true; }
  if (JRN.up._stick) requestAnimationFrame(() => { const u = JRN.up; if (u.clientHeight) { u.scrollTop = u.scrollHeight; u._stick = false; } });   // v0.83: the last one shows (also when the bar was still hidden)
  const tot = ri && ri.tot, nOf = k => `Jump ${jrnNum(ri, k)}${tot ? `<i>/${tot}</i>` : ""}`;
  const dn = hops.slice(0, 3).map((h, i) => { const inf = jrnInfo(h[0]), near = ri && ri.range && h[2] > ri.range * 0.92;
    const info = inf ? jrnInfoText(inf) : `${jrnStarText(h[1])}${" · <em>looking ahead…</em>"}`;
    return `<button class="jb next${syncSame(h[0], viewing) ? " cur" : ""}" data-sys="${esc(h[0])}" title="${esc(h[0])}: ${esc(inf ? jrnInfoText(inf) : jrnStarText(h[1]))}"><span class="jk">${nOf(i)}</span><b>${esc(h[0])}</b>${jrnStar(h[1])}<span class="jd${near ? " near" : ""}"${near ? ` title="Close to your jump range (${jrnLy(ri.range)} ly)"` : ""}>${jrnLy(h[2])} ly</span>${(wbB => wbB ? `<span class="jw">${wbB}</span>` : "")(watchBadges(watchOf(h[0])))}`
      + `<span class="jx">${info}</span>${syncSame(h[0], viewing) ? backBtn : i === 2 && ri.left > 3 ? `<span class="jmore">+${ri.left - 3} more · ${jrnLy(ri.ly)} ly to go</span>` : ""}</button>`; }).join("");
  const fin = st.mode === "fin" ? `<div class="jb next fin"><span class="jk">Arrived</span><b>${esc(st.dest)}</b>${jrnStar(JRN.cls[st.dest.toLowerCase()])}<span class="jx">Route complete: ${ri.tot} jump${ri.tot > 1 ? "s" : ""}. Leaving route mode…</span></div>` : "";
  if (JRN.dn._h !== (dn || fin)) { JRN.dn._h = dn || fin; JRN.dn.innerHTML = dn || fin; }
  JRN.dn.dataset.n = fin ? 1 : Math.min(3, hops.length);
  jrnColRender(ri, hops, viewing);
  watchMark();
}
// v0.81: the whole route in a column on the left: done, here, every jump ahead; it scrolls
function jrnColRender(ri, hops, viewing) {
  const at = ri && ri.at != null ? ri.at : null, here = jrnAt();
  let cum = 0;
  const rows = hops.map((h, k) => { cum += h[2]; const n = jrnNum(ri, k), inf = jrnInfo(h[0]), near = ri.range && h[2] > ri.range * 0.92;
    const fuel = SCOOP.test(h[1] || ""), wb = k < 3 ? watchBadges(watchOf(h[0])) : "";   // v0.82.5: fuel stars, Watch matches
    return `<button class="jr${k < 3 ? " soon" : ""}${fuel ? " fuel" : ""}${syncSame(h[0], viewing) ? " cur" : ""}" data-sys="${esc(h[0])}" title="${esc(h[0])}${inf ? `: ${esc(jrnInfoText(inf))}` : ""}${fuel ? " · fuel star" : ""}"><span class="jn">${n}</span><span class="jt"><b>${esc(h[0])}</b><small><span class="${near ? "near" : ""}">${jrnLy(h[2])} ly</span> · ${jrnLy(cum)} ly in</small>${wb ? `<span class="jw">${wb}</span>` : ""}</span>${fuel ? FUEL_SVG : ""}${jrnStar(h[1])}</button>`; }).join("");
  const more = ri.left > hops.length ? `<div class="jr more">+${ri.left - hops.length} more jumps</div>` : "";
  const done = at ? `<div class="jr done">✓ ${at} jump${at > 1 ? "s" : ""} done</div>` : "";
  const fin = !hops.length;                                            // v0.82: the last stop reached
  const hc = JRN.cls[here.toLowerCase()] || "", hfuel = SCOOP.test(hc), hwb = watchBadges(watchOf(here));
  const cur = `<button class="jr here${hfuel ? " fuel" : ""}${syncSame(here, viewing) ? " cur" : ""}" data-sys="${esc(here)}" title="Your ship is here${hfuel ? " · fuel star" : ""}"><span class="jn">${at != null ? at : "•"}</span><span class="jt"><b>${esc(here)}</b><small>${fin ? "Arrived · route complete" : "Your ship is here"}</small>${hwb ? `<span class="jw">${hwb}</span>` : ""}</span>${hfuel ? FUEL_SVG : ""}${jrnStar(hc)}</button>`;
  const dest = hops[hops.length - 1];
  const html = `<div class="jrh"><b>ROUTE</b><button class="jwBtn" data-watch title="What to look out for on the way" aria-haspopup="dialog">Watch ▾</button><span>${fin ? "complete" : `${ri.left} jump${ri.left > 1 ? "s" : ""} · ${jrnLy(ri.ly)} ly to go`}</span>${ri.left <= hops.length && dest ? `<em title="${esc(dest[0])}">to ${esc(dest[0])}</em>` : ""}</div><div class="jrl">${done}${cur}${rows}${more}</div>`;
  if (JRN.col._h !== html) {
    const l = JRN.col.querySelector(".jrl"), keep = l ? l.scrollTop : 0, moved = JRN.col._here !== here; JRN.col._h = html; JRN.col._here = here; JRN.col.innerHTML = html;
    const nl = JRN.col.querySelector(".jrl"), h = nl.querySelector(".jr.here");
    nl.scrollTop = keep; if (moved && h) requestAnimationFrame(() => nl.scrollTo({ top: Math.max(0, h.offsetTop - nl.offsetTop - 4 - (done ? 30 : 0)), behavior: keep ? "smooth" : "auto" }));   // the ship's row at the top after each jump
  }
}
function jrnColClass(on) { if (document.body.classList.contains("jrnCol") !== on) { document.body.classList.toggle("jrnCol", on); requestAnimationFrame(() => { try { smapFit(); } catch (e) {} }); } }
// how much room the bars and the column take around the map (called by smapLayout); also places them
function jrnReserve(L, Rt, T, B) {
  if (!(JRN.on || JRN.leaving) || !JRN.up) return [L, T, B];
  if (PFULL) { jrnColClass(innerWidth >= 900 && innerWidth > innerHeight); return [L, T, B]; }   // the touch layout places them with its own rules
  const n = +JRN.dn.dataset.n || 0, upH = JRN_BAR, dnH = n * JRN_BAR + Math.max(0, n - 1) * 4;
  const col = innerWidth - L - Rt >= 600; jrnColClass(col);   // the map keeps at least about 380 px
  if (col) { const w = Math.round(Math.max(JRN_COL, Math.min(300, (innerWidth - L - Rt) * 0.2)));   // v0.83: wider on a wide screen
    Object.assign(JRN.col.style, { left: L + "px", top: T + "px", bottom: B + "px", width: w + "px" }); L += w + JRN_GAP; }
  Object.assign(JRN.up.style, { left: L + "px", right: Rt + "px", top: T + "px", height: upH + "px" });
  Object.assign(JRN.dn.style, { left: L + "px", right: Rt + "px", bottom: B + "px", height: dnH + "px" });
  return [L, T + upH + JRN_GAP, B + dnH + JRN_GAP];
}
// v0.82: which state route mode is in. "on": a route; "hold": the route went away a moment ago (the game may be
// plotting a new one: the old one stays, faded, for a few seconds); "fin": the ship reached the last stop (route mode
// stays until that system is drawn and a moment after, then leaves with a message); "off"
const JRN_HOLD = 3500, JRN_FIN = 2600;
function jrnState() {
  const hops = jrnHops(), ri = syncRouteInfo(), live = !!((SYNC.on || SYNC.remote) && jrnAt()), now = Date.now();
  if (!live) { JRN.keep = null; JRN.hold = 0; JRN.fin = null; return { mode: "off", hops: [], ri: null }; }
  if (hops.length) { JRN.hold = 0; JRN.fin = null; JRN.keep = { ri, hops }; return { mode: "on", hops, ri }; }
  const k = JRN.keep; if (!k) return { mode: "off", hops: [], ri: null };
  const dest = k.hops[k.hops.length - 1][0];
  if (syncSame(dest, jrnAt())) {
    if (!JRN.fin) JRN.fin = { dest, t: now, built: S && syncSame(S.sys.name, dest) && !JRN.anim ? now : 0 };
    const f = JRN.fin, done = !MAPMODE || (f.built ? now - f.built > JRN_FIN : now - f.t > 9000);
    if (!done) return { mode: "fin", dest, hops: [], ri: { left: 0, ly: 0, at: k.ri.tot || k.ri.left, tot: k.ri.tot || k.ri.left, range: k.ri.range } };
    JRN.keep = null; JRN.fin = null; return { mode: "off", done: dest, hops: [], ri: null };
  }
  // v0.82.2: the game clears the route as the last jump starts (or the route file empties during a jump): while the ship is
  // in hyperspace towards a stop of this route, route mode stays as it was, and the arrival decides (the last stop: route complete)
  if (SYNC.jumping && k.hops.some(h => syncSame(h[0], SYNC.jumping))) { JRN.hold = 0; return { mode: "on", hops: k.hops, ri: k.ri, kept: true }; }
  if (!JRN.hold) JRN.hold = now;
  if (now - JRN.hold < JRN_HOLD) return { mode: "hold", hops: k.hops, ri: k.ri };
  JRN.keep = null; JRN.hold = 0; return { mode: "off", hops: [], ri: null };
}
// v0.81: a short message when the map enters or leaves route mode; v0.82: also when the route is recalculated
function jrnMode(st) {
  const was = JRN.rOn, dest = st.hops.length ? st.hops[st.hops.length - 1][0] : "";
  JRN.rOn = st.mode;
  const before = JRN.rDest; if (st.mode === "on") JRN.rDest = dest;
  if (st.mode === "on" && was !== "on" && was !== "hold" && dest && !syncSame(dest, JRN.jDest || "")) jrnNewJourney(dest);   // v0.82.3: a new route, a new journey (a reload keeps it)
  else if (st.mode === "on" && dest && !syncSame(dest, JRN.jDest || "")) { JRN.jDest = dest; try { localStorage.setItem("gravitas.journeyStart", JSON.stringify({ t: JRN.jStart || 0, d: dest })); } catch (e) {} }   // recalculated: the same journey
  if (was === null || !MAPMODE) return;
  if (st.mode === "on" && (was === "off")) { const ri = st.ri;
    jrnSay("ROUTE MODE", `The system map now follows your route: ${ri.left} jump${ri.left > 1 ? "s" : ""}${ri.left <= st.hops.length && dest ? ` to ${dest}` : ""}`, "in"); return; }
  if (st.mode === "on" && before && !syncSame(before, dest)) { const ri = st.ri;
    jrnSay("ROUTE RECALCULATED", `New destination: ${dest} · ${ri.left} jump${ri.left > 1 ? "s" : ""}, ${jrnLy(ri.ly)} ly`, "re"); jrnSwap(); return; }
  if (st.mode === "off" && was !== "off") {
    if (!(SYNC.on || SYNC.remote)) return;                            // Sync closed: nothing to say
    if (st.done) jrnSay("ROUTE COMPLETE", `You arrived at ${st.done}. Leaving route mode`, "done");
    else jrnSay("ROUTE CLEARED", "Leaving route mode: back to the normal system map", "out");
  }
}
// v0.82: the route changed: the column and the bars below refresh with a short motion
function jrnSwap() {
  if (jrnStill() || !JRN.col) return;
  for (const e of [JRN.col.querySelector(".jrl"), JRN.dn]) if (e) e.animate([{ opacity: 0.2, transform: "translateY(18px)" }, { opacity: 1, transform: "none" }], { duration: 600, easing: "cubic-bezier(.2,.9,.25,1)" });
}
// v0.82: route mode comes and goes with motion: the map's edges glide to their new place, the column and bars slide in or out
function jrnFlip(change) {                                             // the map's edges glide by themselves (#smap's transition)
  change(); clearTimeout(JRN.fitT); JRN.fitT = setTimeout(() => { try { smapFit(); } catch (e) {} }, 380);   // fitted again once they have arrived
}
function jrnSetOn(on) {
  JRN.on = on; clearTimeout(JRN.leaveT); if (on && JRN.up) JRN.up._stick = true;
  const fit = () => { try { smapLayout(); smapFit(); } catch (e) {} };
  if (!MAPMODE || jrnStill()) { JRN.leaving = false; document.body.classList.remove("jrnLeave", "jrnEnter"); document.body.classList.toggle("jrn", on); if (!on) jrnColClass(false); requestAnimationFrame(fit); return; }
  if (on) { JRN.leaving = false; document.body.classList.remove("jrnLeave"); document.body.classList.add("jrnEnter");
    requestAnimationFrame(() => { jrnFlip(() => { document.body.classList.add("jrn"); fit(); }); });
    JRN.leaveT = setTimeout(() => document.body.classList.remove("jrnEnter"), 800); return; }
  JRN.leaving = true; document.body.classList.add("jrnLeave");          // the column and the bars go first, then the map takes the room
  JRN.leaveT = setTimeout(() => { JRN.leaving = false; document.body.classList.remove("jrnLeave");
    jrnFlip(() => { document.body.classList.remove("jrn"); jrnColClass(false); fit(); }); }, 420);
}
function jrnSay(title, text, kind) {
  jrnInit(); const m = JRN.msg, sm = $("smap"), r = sm && sm.getBoundingClientRect();
  m.className = ""; m.innerHTML = `<b>${esc(title)}</b><span>${esc(text)}</span>`;
  if (r && r.width) Object.assign(m.style, { left: Math.round(r.left + r.width / 2) + "px", top: Math.round(r.top + (PFULL ? 52 : 40)) + "px" });
  void m.offsetWidth; m.className = "show " + kind;
  if (sm && !jrnStill()) { sm.classList.remove("jrnGlowIn", "jrnGlowOut"); void sm.offsetWidth; sm.classList.add(kind === "in" || kind === "re" || kind === "watch" ? "jrnGlowIn" : "jrnGlowOut"); setTimeout(() => sm.classList.remove("jrnGlowIn", "jrnGlowOut"), 1600); }
  clearTimeout(m._t); m._t = setTimeout(() => { m.className = "hide " + kind; }, 3600);
}
const jrnStill = () => { try { return localStorage.getItem("gravitas.jrnAnim") === "0" || matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
// v0.81: just before the new system is drawn: the old map is lifted out so it can slide up into the bar above
function jrnBefore() {
  jrnArrive();
  if (!JRN.anim || !MAPMODE || !JRN.on || jrnStill() || JRN.ghost) return;
  const svg = $("smapSvg"), v = $("smapView"); if (!svg || !v) return; const r = v.getBoundingClientRect(); if (!r.width) return;
  const g = JRN.ghost = document.createElement("div"); g.className = "jrnGhost";
  Object.assign(g.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
  g.appendChild(svg); document.body.appendChild(g);                  // the same picture, moved out: no copy is made
  g._t = setTimeout(() => { if (JRN.ghost === g) { g.remove(); JRN.ghost = null; } }, 4000);
}
// the moment of the jump: the old map rises into the bar above, the new one grows up from the next bar
function jrnBuilt() {
  jrnArrive();                                                         // the new system may be built before the clock noticed the jump
  if (JRN.fin && S && syncSame(S.sys.name, JRN.fin.dest)) JRN.fin.built = Date.now();   // v0.82: the last stop is drawn: route mode ends a moment later
  jrnRender(); jrnPrune(); jrnAhead();
  if (JRN.anim && S) watchArrive();                                    // v0.82.5: a match where you just arrived
  const g = JRN.ghost; JRN.ghost = null;
  if (!JRN.anim || !MAPMODE || !JRN.on || jrnStill()) { JRN.anim = false; if (g) g.remove(); return; } JRN.anim = false;
  const m = $("smap"); m.classList.add("jrnIn"); setTimeout(() => m.classList.remove("jrnIn"), 1500); m.style.opacity = "0";   // hidden for the frame before the motion starts
  requestAnimationFrame(() => {                                        // measure after the panels have settled (the body panel may reopen)
    try { smapLayout(); } catch (e) {} m.style.opacity = "";
    const mr = m.getBoundingClientRect(), u = JRN.up.lastElementChild, ur = u && u.getBoundingClientRect(), d0 = JRN.dn.firstElementChild, dr = d0 && d0.getBoundingClientRect();
    const ease = "cubic-bezier(.55,0,.2,1)";
    if (g && ur) { clearTimeout(g._t); const gr = { left: parseFloat(g.style.left), top: parseFloat(g.style.top), width: parseFloat(g.style.width), height: parseFloat(g.style.height) };
      g.animate([{ transform: "none", opacity: 1 }, { transform: `translate(${ur.left - gr.left}px,${ur.top - gr.top}px) scale(${ur.width / gr.width},${ur.height / gr.height})`, opacity: 0.15 }],
        { duration: 900, easing: ease, fill: "forwards" }).finished.then(() => g.remove(), () => g.remove()); }
    else if (g) g.remove();
    const dy = dr ? Math.max(40, dr.top + dr.height / 2 - mr.top) : mr.height * 0.6;
    m.animate([{ transform: `translateY(${dy}px) scale(.9, .06)`, opacity: 0.1, transformOrigin: "50% 0" }, { transform: `translateY(${dy * 0.12}px) scale(.99, .9)`, opacity: 0.9, offset: 0.7, transformOrigin: "50% 0" }, { transform: "none", opacity: 1, transformOrigin: "50% 0" }],
      { duration: 1000, delay: 150, easing: ease, fill: "backwards" });
    [...JRN.dn.children].forEach((b, i) => b.animate([{ transform: "translateY(46px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 650, delay: 350 + i * 90, easing: ease, fill: "backwards" }));
    if (u) { u.classList.add("jrnNew"); setTimeout(() => u.classList.remove("jrnNew"), 1800); }
    const h = JRN.col && JRN.col.querySelector(".jr.here"); if (h) { h.classList.add("jrnNew"); setTimeout(() => h.classList.remove("jrnNew"), 1800); }
  });
}
// the ship moved: the system it left goes into the past (kept for a while in this browser)
function jrnArrive() {
  const h = jrnAt();
  if (h && !syncSame(h, JRN.last)) {
    if (JRN.last) { const prev = JRN.past[JRN.past.length - 1]; if (!prev || Date.now() - (prev.t || 0) > JRN_GAP_MS) { if ((JRN.jStart || 0) < Date.now() - 5000) jrnNewJourney(JRN.jDest, Date.now() - 1); }   // v0.82.3: a jump after a long break starts a new journey here
      JRN.past.push({ n: JRN.last, c: JRN.cls[JRN.last.toLowerCase()] || "", t: Date.now() }); JRN.past = JRN.past.slice(-30); JRN.anim = true;
      try { localStorage.setItem("gravitas.journey", JSON.stringify(JRN.past)); } catch (e) {} }
    JRN.last = h;
  }
}
TICK.add(() => {
  const h = jrnAt(); jrnArrive();
  for (const x of jrnHops()) JRN.cls[x[0].toLowerCase()] = x[1];             // remember each stop's star for when it is behind us
  for (const r of SYNC.route || []) if (r && r.n) JRN.cls[r.n.toLowerCase()] = r.c;   // (the whole plotted route, the start too)
  const sig = [MAPMODE, SYNC.on, SYNC.remote, h, S && S.sys.name, JSON.stringify(jrnHops().slice(0, 60)), JRN.past.length, innerWidth > innerHeight].join("|");
  if (sig !== JRN.sig || JRN.hold || JRN.fin || JRN.rOn === "hold" || JRN.rOn === "fin") { JRN.sig = sig; jrnRender(); jrnPrune(); if (JRN.on) jrnAhead(); }   // v0.82: the waiting states end by the clock
});
