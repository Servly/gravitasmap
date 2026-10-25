// ------------------------------------------------------------- system map (v0.50, drawn like the game's since v0.53)
// A flat map of the system, laid out like the game's System Map: each star with its planets in orbit order and the
// moons under their planet, drawn at their true size ratios on a compressed scale. On top of that it shows what the
// game's map does not: which bodies are in shadow right now and when the next eclipse starts, live with the clock.
// It only reads S. It never changes the 3D scene, so switching back always finds the 3D view as it was left.
var MAPMODE = false;                                   // var: other parts may ask before this part has run
// open the map at the first system if the visitor left it open last time, or, on a first visit, if the browser draws
// 3D without a graphics card (the map runs smoothly anywhere)
var SMAP_WANT = !/[?&]view=3d/.test(location.search);           // v0.71: GRAVITAS always opens on the system map (the lightest view). A link made in 3D opens 3D
const SMAP = { items: [], ports: [], scan: null, job: 0, tick: 0, filters: new Set(), sub: new Set(), sysCollapsedBefore: null, built: null, back: false,
  v: { k: 1, tx: 0, ty: 0, auto: true }, W: 0, H: 0, build: false, surf: [], names: (() => { try { return localStorage.getItem("gravitas.mapNames") !== "0"; } catch (e) { return true; } })(), tipFor: null };
const SMAP_SCAN_H = 48, SMAP_STEP = 5 * 60000, SMAP_DARK = 0.95;     // same darkness threshold as the eclipse calendar

// ---- model: rows (one per star, plus planets that circle more than one star), columns (planets), stacks (moons)
function smapStarAbove(b) {
  for (let id = S.parentOf.get(b.bodyId); id !== undefined; id = S.parentOf.get(id)) { const o = S.byId.get(id); if (o && o.type === "Star") return o; }
  return null;
}
function smapStarsUnder(id) {                         // stars that orbit inside barycentre 'id' (not through another star)
  const out = [], seen = new Set();
  const walk = i => { if (seen.has(i)) return; seen.add(i);
    for (const k of S.children.get(i) || []) { const o = S.byId.get(k); if (!o) continue; if (o.type === "Star") { if (o._obj) out.push(o); } else if (o.type === "Barycentre") walk(k); } };
  walk(id); return out;
}
function smapBranch(b, hostId) {                      // the ancestor of b that orbits hostId directly (b itself if it does)
  let cur = b;
  for (let id = S.parentOf.get(b.bodyId); id !== undefined; id = S.parentOf.get(id)) { if (id === hostId) return cur; cur = S.byId.get(id) || cur; }
  return b;
}
const smapSma = o => (o && o.semiMajorAxis != null ? o.semiMajorAxis : Infinity);
function smapModel() {
  const rows = new Map(), add = (key, r) => rows.has(key) ? rows.get(key) : (rows.set(key, r), r);
  for (const s of S.stars) add("s" + s.bodyId, { key: "s" + s.bodyId, star: s, hostId: s.bodyId, anchors: [] });
  for (const b of S.bodies) {
    if (b.type === "Star" || moonAnchor(b) !== b) continue;
    const st = smapStarAbove(b);
    if (st) { rows.get("s" + st.bodyId).anchors.push(b); continue; }
    let host = 0;                                       // circles several stars: find the barycentre that holds them
    for (let id = S.parentOf.get(b.bodyId); id !== undefined; id = S.parentOf.get(id)) if (smapStarsUnder(id).length) { host = id; break; }
    add("c" + host, { key: "c" + host, star: null, hostId: host, stars: smapStarsUnder(host), anchors: [] }).anchors.push(b);
  }
  for (const r of rows.values()) {
    // v0.51: sort by the whole chain of barycentres, so bodies that circle each other always stand side by side
    const keys = new Map(r.anchors.map(a => [a, smapPath(a, r.hostId).map(o => [smapSma(o), o.bodyId])]));
    r.anchors.sort((a, c) => { const x = keys.get(a), y = keys.get(c);
      for (let i = 0; i < Math.min(x.length, y.length); i++) { const d = x[i][0] - y[i][0] || x[i][1] - y[i][1]; if (d) return d; }
      return x.length - y.length; });
    r.cols = r.anchors.map(a => ({ a, branch: smapBranch(a, r.hostId), moons: smapMoons(a) }));
    r.tree = smapTree(r);
  }
  const main = S.main, list = [...rows.values()];
  const rank = r => r.star === main ? 0 : r.star ? 2 : 1;            // main star, then planets around several stars, then other stars
  list.sort((a, c) => rank(a) - rank(c) || (a.star ? a.star.bodyId : a.hostId) - (c.star ? c.star.bodyId : c.hostId));
  return list;
}
function smapMoons(a) {                             // moons in order, with the barycentre a moon pair shares (bc)
  const out = [];
  const walk = (id, depth, bc) => {
    const kids = (S.children.get(id) || []).map(k => S.byId.get(k)).filter(o => o && o.type !== "Star").sort((x, y) => smapSma(x) - smapSma(y) || x.bodyId - y.bodyId);
    for (const o of kids) {
      if (o.type === "Barycentre") walk(o.bodyId, depth, o.bodyId);
      else if (o._obj) { out.push({ b: o, depth, bc }); walk(o.bodyId, depth + 1, null); }
    }
  };
  walk(a.bodyId, 1, null);
  return out;
}
function smapPath(b, hostId) {                         // the chain from just below hostId down to b
  const path = [b];
  for (let id = S.parentOf.get(b.bodyId); id !== undefined && id !== hostId; id = S.parentOf.get(id)) { const o = S.byId.get(id); if (o) path.unshift(o); }
  return path;
}
// barycentres inside a row as a tree, for the brackets over bodies that circle each other. A barycentre with only one
// member drawn in this row (the other is a star, or has no orbit yet) gets no bracket of its own.
function smapTree(r) {
  const nodes = new Map(), roots = [];
  const node = id => nodes.get(id) || (nodes.set(id, { id, members: [] }), nodes.get(id));
  r.cols.forEach((c, i) => {
    const p = smapPath(c.a, r.hostId);
    for (let k = 0; k < p.length - 1; k++) {
      if (p[k].type !== "Barycentre") continue;
      const n = node(p[k].bodyId), m = k + 1 < p.length - 1 ? node(p[k + 1].bodyId) : { col: i };
      if (!n.members.includes(m) && !(m.col !== undefined && n.members.some(x => x.col === i))) n.members.push(m);
      if (k === 0 && !roots.includes(n)) roots.push(n);
    }
  });
  const height = n => { if (n.col !== undefined) return 0; const hs = n.members.map(height); n.h = n.members.length > 1 ? 1 + Math.max(...hs) : hs[0]; return n.h; };
  roots.forEach(height);
  return { roots, h: Math.max(0, ...roots.map(n => n.h)) };
}

// ---- drawing (v0.53): one picture laid out like the game's System Map. Each star starts a row, its planets sit on a line
// to the right, moons hang below their planet, a moon's own moons and every station branch off to the right, brackets
// join bodies that circle each other. No text under the bodies: hover (or tap) a body or an icon for its details.
// Drag to move, scroll or pinch to zoom. Sizes are true ratios on a compressed scale.
const SM_GAP = 34, SM_ICON = 22, SM_X0 = 70;
const smapRgb = b => b.type === "Star" ? hex(starColor(b)) : `rgb(${palette(b)[0].map(v => v | 0)})`;
const smapRing = b => b.type !== "Star" && b.rings && b.rings.length > 0;
function smapR(b, rMax, moon) {
  if (b.type === "Star") return Math.round(34 + 42 * Math.min(1, Math.pow((b.solarRadius || 0.1) / 1.5, 0.45)));
  if (moon) return Math.round(7 + 10 * Math.sqrt(Math.min(1, (b.radius || 300) / SMAP.rMoon)));   // moons on their own scale, as in the game
  return Math.round(12 + 36 * Math.pow(Math.min(1, (b.radius || 300) / rMax), 0.55));
}
const smapHalf = (b, r) => smapRing(b) ? r * 2.05 : r;
function smapTip(b) {
  const L = [`<b>${esc(shortName(b, S.sys.name))}</b> <span>${esc((b.subType || b.type || "").trim())}</span>`], f = [];
  if (b.type === "Star") { if (b.solarMasses != null) f.push(`${fmt(b.solarMasses, 3)} M☉`); if (b.surfaceTemperature != null) f.push(temp(b.surfaceTemperature)); }
  else {
    f.push(b.isLandable ? `<i class="l">Landable</i>` : "Not landable");
    if (b.gravity != null) f.push(`${fmt(b.gravity, 2)} g`);
    if (b.surfaceTemperature != null) f.push(temp(b.surfaceTemperature));
  }
  L.push(`<div>${f.join(" · ")}</div>`);
  if (b.type !== "Star") {
    const d = [];
    d.push(hasAtm(b) ? `<i class="a">A</i> ${esc(b.atmosphereType || "atmosphere")}` : `<i class="a">A</i> no atmosphere`);
    const ps = bodyPorts(b), real = ps.filter(p => p.cls !== "build"), nO = real.filter(p => p.orbit && p.k !== "carrier").length, nS = real.filter(p => !p.orbit).length,
      nC = ps.filter(p => p.k === "carrier").length, nB = ps.filter(p => p.cls === "build").length;
    d.push(`<i class="s">S</i> ${nO + nS ? [nO && `${nO} in orbit`, nS && `${nS} on the surface`].filter(Boolean).join(", ") : "no stations"}${nC ? ` · ${nC} carrier${nC > 1 ? "s" : ""}` : ""}${nB ? ` · ${nB} construction site${nB > 1 ? "s" : ""}` : ""}`);
    const bio = sigCount(b, /Biological/), geo = sigCount(b, /Geological/);
    d.push(`<i class="b">B</i> ${bio ? `${bio} biological signal${bio > 1 ? "s" : ""}` : "no biological signals"}`);
    d.push(`<i class="g">G</i> ${geo ? `${geo} geological signal${geo > 1 ? "s" : ""}` : "no geological signals"}`);
    if (smapRing(b)) d.push(`${b.rings.length} ring${b.rings.length > 1 ? "s" : ""}`);
    if (b.terraformingState && !/^not/i.test(b.terraformingState) && /terraform/i.test(b.terraformingState)) d.push(esc(b.terraformingState));
    L.push(d.map(x => `<div>${x}</div>`).join(""));
  }
  const live = smapLive(b);
  if (live.txt) L.push(`<div class="lv ${live.cls}">${live.txt}</div>`);
  L.push(`<div class="hint">${MAPMODE ? "Click for details · double-click for 3D" : "Click for details · double-click to fly there"}</div>`);
  return L.join("");
}
function smapLive(b) {                                  // distance and light, now
  const m = S.main ? S.world.get(S.main.bodyId) : null, w = S.world.get(b.bodyId);
  const dLs = b === S.main || !w || !m ? null : dist(w, m) / LS_MM;
  let st = "", cls = "";
  if (b.type !== "Star" && S.main) {
    const vis = starlight(b, hostStar(b)), e = smapEvent(b);
    if (vis < SMAP_DARK) {
      const by = starlightWho(b, hostStar(b), S.world).by;
      cls = "dark"; st = (vis < 0.05 ? "In shadow" : `${fmt(100 - vis * 100, 0)}% covered`) + (by ? ` of ${esc(shortName(by, S.sys.name))}` : "");
      if (e && e.ta <= simTime) st += e.tz === Infinity ? " · for over a day" : ` · ends in ${smapDur(e.tz - simTime)}`;
    } else if (e && e.ta > simTime) { cls = e.ta - simTime < 86400000 ? "soon" : ""; st = `Lit · eclipse in ${smapDur(e.ta - simTime)}`; }
    else st = "Lit";
  }
  return { cls, txt: [dLs == null ? "" : `${fmt(dLs, dLs < 10 ? 2 : 0)} ls from the main star`, st].filter(Boolean).join(" · "), vis: b.type === "Star" ? 1 : null };
}
const SMAP_FILTERS = [
  ["land", "Landable", b => !!b.isLandable],
  ["atm", "Atmosphere", b => hasAtm(b)],
  ["bio", "Biological", b => sigCount(b, /Biological/) > 0],
  ["geo", "Geological", b => sigCount(b, /Geological/) > 0],
  ["ring", "Rings", b => smapRing(b)],
  ["stn", "Stations", b => smapShown(b).some(p => p.k !== "carrier" && smapPortHit(p))],
  ["fc", "Carriers", b => carrierCount(b) > 0],
  ["ecl", "Eclipse within 24 h", b => { const e = smapEvent(b); return !!e && e.ta < simTime + 86400000; }],
];
const SMAP_SUB = [["orb", "In orbit", p => p.orbit], ["surf", "On the surface", p => !p.orbit], ["L", "Large landing pad", p => p.large === true]];
const smapPortHit = p => [...SMAP.sub].every(k => SMAP_SUB.find(x => x[0] === k)[2](p));
// v0.54: construction sites only when asked for (the switch at the right of the filters). Stations in orbit hang off the
// body on lines, stations on the surface stand on the body itself: nothing on a surface is drawn as if it were in orbit.
const smapShown = b => smapPortsOf(b).filter(p => SMAP.build || p.cls !== "build" || (YAH.t && YAH.t.st === p.st));   // v0.73: the station you are at always shows
const smapOrb = b => smapShown(b).filter(p => p.orbit), smapSurf = b => smapShown(b).filter(p => !p.orbit);
// v0.76.1: stations placed in a belt (asteroid bases)
function smapBeltPorts(bl) {
  return (S.orbitals || []).filter(o => o.belt && o.belt.bl === bl && (SMAP.build || !o.build || (YAH.t && YAH.t.st === o.st))).map(o => { const pads = padTxt(o.st);
    return { st: o.st, k: o.kind, v: o.v, cls: o.build ? "build" : "orb", orbit: true, large: padLarge(o.st), name: o.name, kind: o.kindName,
      tip: `${o.name} · ${o.kindName} · in the ${beltName(o.belt.bl)}, matched from its reported distance${pads ? ` · pads ${pads}` : ""}` }; });
}
function smapPortsOf(b) { if (!SMAP.portCache || SMAP.portCache.S !== S) SMAP.portCache = { S, m: new Map() }; const c = SMAP.portCache.m; if (!c.has(b)) c.set(b, bodyPorts(b)); return c.get(b); }

const smapTW = (b, px) => shortName(b, S.sys.name).replace(/^★\s*/, "").length * px;       // rough width of a name at 100 %
// three or more of the same kind on one body (settlements, mostly) share one icon with a count
function smapGroup(ps) {
  const out = [], seen = new Map();
  for (const p of ps) { const key = p.k + "|" + p.cls, n = ps.filter(q => q.k + "|" + q.cls === key).length;
    if (n < 3) { out.push({ p, all: [p] }); continue; }
    if (seen.has(key)) { seen.get(key).all.push(p); continue; }
    const g = { p, all: [p], n }; seen.set(key, g); out.push(g); }
  return out;
}
// layout: every position in picture units (1 unit = 1 px at 100 %)
function smapPlan() {
  const rows = smapModel(), planets = S.bodies.filter(b => b.type !== "Star");
  const rMax = Math.max(69911, ...planets.map(b => b.radius || 0));
  SMAP.rMoon = Math.max(1500, ...planets.filter(b => moonAnchor(b) !== b).map(b => b.radius || 0));
  const P = { bodies: [], ports: [], lines: [], brk: [], marks: [], belts: [], labels: [], W: 0, H: 0 };
  const seg = (x1, y1, x2, y2) => { if (Math.hypot(x2 - x1, y2 - y1) > 2) P.lines.push(`M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`); };
  // a column: a planet (or anything on a row's line) with what hangs below it, in coordinates around its centre
  const column = a => {
    const ra = smapR(a, rMax, false), C = { a, r: ra, left: smapHalf(a, ra), right: smapHalf(a, ra), items: [], chains: [], pairs: [], bottom: ra };
    C.right = Math.max(C.right, (smapRing(a) ? ra * 0.45 : ra * 0.72) + 4 + smapTW(a, 7.2));      // room for the name
    let y = ra + 30, prevBottom = ra;
    for (const p of smapGroup(smapOrb(a))) { C.items.push({ p, of: a, x: 0, y: y + SM_ICON / 2 }); C.chains.push([0, prevBottom, 0, y]); prevBottom = y + SM_ICON; y += SM_ICON + 18; }
    const lines = [];
    for (const m of smapMoons(a)) if (m.depth === 1 || !lines.length) lines.push([m]); else lines[lines.length - 1].push(m);
    let run = null;
    for (const L of lines) {
      const rm = smapR(L[0].b, rMax, true), cy = y + Math.max(rm, SM_ICON / 2);
      C.items.push({ b: L[0].b, x: 0, y: cy, r: rm, moon: 1 }); C.chains.push([0, prevBottom, 0, cy - rm]);
      // to the right: this moon's stations, then its own moons, each followed by their stations
      let x = rm, px = rm;
      const add = (it, half) => { const cx = x + 18 + half; C.items.push({ ...it, x: cx, y: cy }); C.chains.push([px, cy, cx - half, cy]); x = cx + half; px = cx + half; };
      for (const p of smapGroup(smapOrb(L[0].b))) add({ p, of: L[0].b }, SM_ICON / 2);
      for (const m of L.slice(1)) { const r2 = Math.max(4, Math.round(smapR(m.b, rMax, true) * 0.85)); add({ b: m.b, r: r2, moon: m.depth }, r2); for (const p of smapGroup(smapOrb(m.b))) add({ p, of: m.b }, SM_ICON / 2); }
      C.right = Math.max(C.right, x + 4, rm * 0.72 + 3 + smapTW(L[0].b, 6.4));
      const bc = L[0].bc;
      if (bc != null && run && run.bc === bc) run.ys.push([cy, rm]); else { run = bc != null ? { bc, ys: [[cy, rm]] } : null; if (run) C.pairs.push(run); }
      prevBottom = cy + rm; y = cy + Math.max(rm, SM_ICON / 2) + 34;
      C.bottom = cy + Math.max(rm, SM_ICON / 2);
    }
    if (C.pairs.some(r => r.ys.length > 1)) C.left = Math.max(C.left, Math.max(...lines.map(L => smapR(L[0].b, rMax, true))) + 14);
    if (C.items.length && !lines.length) C.bottom = Math.max(C.bottom, prevBottom);
    return C;
  };
  let top = 30;
  const starYs = [];
  for (const r of rows) {
    const cols = r.cols.map(c => ({ ...column(c.a), branch: c.branch }));
    const starR = r.star ? smapR(r.star, rMax, false) : 0, maxA = Math.max(0, ...cols.map(c => c.r)), brkH = r.tree.h ? r.tree.h * 12 + 12 : 0;
    const rowY = top + Math.max(starR, maxA + brkH, 20);
    let x;
    if (r.star) {
      const cx = SM_X0 + starR;
      P.bodies.push({ b: r.star, x: cx, y: rowY, r: starR, star: 1 }); starYs.push([rowY, cx - starR]);
      x = cx + starR;
    } else { P.marks.push({ x: SM_X0 + 20, y: rowY }); x = SM_X0 + 26; }
    let prevEdge = x;
    const belts = r.star ? (r.star.belts || []).map(bl => ({ bl, au: ((bl.innerRadius || 0) + (bl.outerRadius || 0)) / 2 / 1.495978707e11 })).sort((p, q) => p.au - q.au) : [];
    let bi = 0;
    let beltBot = 0;
    const belt = bl => { const cx = x + 34; seg(prevEdge, rowY, cx - 9, rowY); P.belts.push({ bl, star: r.star, x: cx, y: rowY }); x = cx + 10; prevEdge = cx + 9;
      // v0.76.1: stations in the belt (asteroid bases) hang below it, like the game's map
      let yy = 30;
      for (const g of smapGroup(smapBeltPorts(bl))) { const py = yy + 18 + SM_ICON / 2; seg(cx, rowY + yy, cx, rowY + py - SM_ICON / 2); P.ports.push({ p: g, x: cx, y: rowY + py, of: r.star }); yy = py + SM_ICON / 2; beltBot = Math.max(beltBot, yy); }
    };
    const xs = [];
    // v0.90.8: your carrier orbiting the star itself sits on the star's line, in order of distance like the game's map
    // (the distance is known once you docked aboard; until then it comes first), not hung on the star
    const fcs = r.star ? (S.carriers || []).filter(c => c.jrn && c.body === r.star).map(c => ({ c, au: r.star === S.main && c.dist != null ? c.dist / 499.005 : 0 })).sort((p, q) => p.au - q.au) : [];
    let fi = 0;
    const fcSlot = c => { const cx = x + 26 + SM_ICON / 2; seg(prevEdge, rowY, cx - SM_ICON / 2, rowY);
      const pp = { st: c.st, k: "carrier", cls: /\[TRGE\]/i.test(c.name) ? "fc trge" : "fc", orbit: true, large: padLarge(c.st), name: c.name, kind: "Fleet carrier",
        tip: `${c.name} ${c.code} · fleet carrier · from your journal · orbiting ${shortName(r.star, S.sys.name)}${c.dist != null ? ` at ${fmt(c.dist, 0)} ls` : ""}` };
      P.ports.push({ p: { p: pp, all: [pp] }, x: cx, y: rowY, of: r.star }); x = cx + SM_ICON / 2; prevEdge = x; };
    cols.forEach((c, i) => {
      while (bi < belts.length && belts[bi].au < smapSma(c.branch)) belt(belts[bi++].bl);
      while (fi < fcs.length && fcs[fi].au < smapSma(c.branch)) fcSlot(fcs[fi++].c);
      const cx = x + SM_GAP + c.left; xs.push(cx);
      seg(prevEdge, rowY, cx - c.r, rowY); prevEdge = cx + c.r; x = cx + c.right;
      P.bodies.push({ b: c.a, x: cx, y: rowY, r: c.r });
      for (const it of c.items) { if (it.p) P.ports.push({ p: it.p, x: cx + it.x, y: rowY + it.y, of: it.of }); else P.bodies.push({ b: it.b, x: cx + it.x, y: rowY + it.y, r: it.r, moon: it.moon }); }
      for (const [x1, y1, x2, y2] of c.chains) seg(cx + x1, rowY + y1, cx + x2, rowY + y2);
      for (const run of c.pairs) if (run.ys.length > 1) {
        const bx = cx - Math.max(...run.ys.map(q => q[1])) - 12;
        for (const [yy, rm] of run.ys) seg(cx - rm - 2, rowY + yy, bx, rowY + yy);
        seg(bx, rowY + run.ys[0][0], bx, rowY + run.ys[run.ys.length - 1][0]);
      }
      c.cx = cx;
    });
    while (bi < belts.length) belt(belts[bi++].bl);
    while (fi < fcs.length) fcSlot(fcs[fi++].c);
    // brackets over bodies that circle each other (nested like the game's)
    const place = n => {
      if (n.col !== undefined) { const c = cols[n.col]; return { x: c.cx, y: rowY - c.r }; }
      const ms = n.members.map(place); if (ms.length === 1) return ms[0];
      const yb = rowY - maxA - 10 - (n.h - 1) * 12, xa = Math.min(...ms.map(m => m.x)), xz = Math.max(...ms.map(m => m.x));
      for (const m of ms) P.brk.push(`M${m.x.toFixed(1)} ${(m.y - 2).toFixed(1)}V${yb.toFixed(1)}`);
      P.brk.push(`M${xa.toFixed(1)} ${yb.toFixed(1)}H${xz.toFixed(1)}`);
      return { x: (xa + xz) / 2, y: yb };
    };
    r.tree.roots.forEach(place);
    if (!r.cols.length && !belts.length && r.star) P.labels.push({ x: x + 30, y: rowY + 4, t: "No planets of this star are known to Spansh yet.", c: "note" });
    const bottom = Math.max(rowY + starR + 30, rowY + beltBot + 26, ...cols.map(c => rowY + c.bottom + 26));
    P.W = Math.max(P.W, x + 40); top = bottom + 34;
  }
  if (starYs.length > 1 || P.marks.length) {                         // several stars: one line down the left joins them, as in the game
    const ys = starYs.map(s => s[0]), sx = 26;
    if (ys.length > 1) { seg(sx, Math.min(...ys), sx, Math.max(...ys)); for (const [yy, l] of starYs) seg(sx, yy, l - 2, yy); }
  }
  P.H = top;
  return P;
}
function smapBodySvg(n) {
  const b = n.b, r = n.r, id = "smg" + b.bodyId, col = smapRgb(b);
  let d = "", s = "";
  if (b.type === "Star") {
    d += `<radialGradient id="${id}"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="${col}"/><stop offset="1" stop-color="${col}" stop-opacity=".85"/></radialGradient>`
       + `<radialGradient id="${id}h"><stop offset=".6" stop-color="${col}" stop-opacity=".45"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>`;
    if (b._thumb === undefined) thumbRequest(b, () => { if (MAPMODE && S) smapBuild(true); });        // v0.62: the same star as in 3D
    s += `<circle r="${r * 1.35}" fill="url(#${id}h)"/><g class="dsk">` + (b._thumb ? `<image href="${b._thumb}" x="${-r * 1.12}" y="${-r * 1.12}" width="${2.24 * r}" height="${2.24 * r}"/>` : `<circle r="${r}" fill="url(#${id})"/>`) + `</g>`;
  } else {
    const c2 = palette(b)[1] ? `rgb(${palette(b)[1].map(v => v | 0)})` : col;
    d += `<radialGradient id="${id}" cx=".36" cy=".34" r=".78"><stop offset="0" stop-color="${col}"/><stop offset=".55" stop-color="${c2}"/><stop offset=".92" stop-color="#140d1c"/><stop offset="1" stop-color="#05030a"/></radialGradient>`;
    // v0.64.1: every ring is its own band, coloured by its type, with its own hover and selection (two-tone rings read at a glance)
    const ring = smapRing(b), rs = ring ? ringRows(b) : [];
    if (ring) d += `<mask id="${id}m" maskUnits="userSpaceOnUse" x="${-4 * r}" y="${-4 * r}" width="${8 * r}" height="${8 * r}"><rect x="${-4 * r}" y="${-4 * r}" width="${8 * r}" height="${8 * r}" fill="#fff"/><circle r="${r}" fill="#000"/></mask>`;
    let back = "", front = "";
    if (rs.length) {
      // v0.64.2: bands (clickable) first, then thin edge lines that light up on hover (white) and selection (pink).
      // The back and front halves overlap a little at the sides, so no seam line shows where they meet.
      const A = r * 1.45, Bd = r * 2.6, tot = rs[rs.length - 1].outerRadius - rs[0].innerRadius;
      const wts = rs.map(x => Math.max(x.outerRadius - x.innerRadius, tot * 0.32 / rs.length)), sw = wts.reduce((a, c) => a + c, 0);
      const ep = 0.035, cs = Math.cos(ep), sn = Math.sin(ep);
      const arc = (R, top) => `M${(-R * cs).toFixed(2)} ${(top ? R * sn : -R * sn).toFixed(2)}A${R.toFixed(2)} ${R.toFixed(2)} 0 1 ${top ? 1 : 0} ${(R * cs).toFixed(2)} ${(top ? R * sn : -R * sn).toFixed(2)}`;
      const ew = Math.max(0.8, r * 0.03);
      let at = A, bB = "", bF = "", eB = "", eF = "";
      rs.forEach((x, ri) => {
        const w = (Bd - A) * wts[ri] / sw, a0 = at, a1 = at + w, mid = at + w / 2; at = a1;
        const rc = RING_COL[Object.keys(RING_COL).find(k => k.toLowerCase() === String(x.type).toLowerCase()) || "Rocky"];
        const same = ri > 0 && rs[ri - 1].type === x.type, f = same && ri % 2 ? 0.82 : 1;      // two rings of one type: the outer one a shade darker
        const col = `rgb(${rc.map(v => Math.round(v * f)).join(",")})`;
        const cls = (typeof SELR !== "undefined" && SELR && SELR.b === b && SELR.ri === ri ? " sel" : "") + (typeof HOVR !== "undefined" && HOVR && HOVR.b === b && HOVR.ri === ri ? " hov" : "");   // kept when the map redraws
        const at2 = `data-id="${b.bodyId}" data-ri="${ri}"`, swd = (w + 0.4).toFixed(2);
        bB += `<g class="smring${cls}" ${at2}><path d="${arc(mid, true)}" fill="none" stroke="${col}" stroke-opacity=".55" stroke-width="${swd}"/><path class="tn" d="${arc(mid, true)}" fill="none" stroke-width="${swd}"/></g>`;
        bF += `<g class="smring${cls}" ${at2}><path d="${arc(mid, false)}" fill="none" stroke="${col}" stroke-opacity=".86" stroke-width="${swd}"/><path class="tn" d="${arc(mid, false)}" fill="none" stroke-width="${swd}"/></g>`;
        eB += `<g class="smredge${cls}" ${at2}><path d="${arc(a0 + ew / 2, true)}"/><path d="${arc(a1 - ew / 2, true)}"/></g>`;
        eF += `<g class="smredge${cls}" ${at2}><path d="${arc(a0 + ew / 2, false)}"/><path d="${arc(a1 - ew / 2, false)}"/></g>`;
      });
      const wrap = (h, ew2) => `<g transform="rotate(-14) scale(1 0.205)" style="--ew:${ew2.toFixed(2)}px">${h}</g>`;
      back = `<g mask="url(#${id}m)">${wrap(bB + eB, ew)}</g>`; front = wrap(bF + eF, ew);
    }
    let bands = "";
    if (/gas giant/i.test(b.subType || "") && r >= 14) {
      d += `<clipPath id="${id}c"><circle r="${r}"/></clipPath>`;
      for (let k = 0; k < 6; k++) { const yy = -r + (k + 0.6) * r / 3.2; bands += `<rect x="${-r}" y="${yy.toFixed(1)}" width="${2 * r}" height="${(r * (0.08 + 0.05 * (k % 3))).toFixed(1)}" fill="#000" opacity="${k % 2 ? 0.12 : 0.07}"/>`; }
      bands = `<g clip-path="url(#${id}c)">${bands}</g>`;
    }
    let haze = "", rim = "";
    if (hasAtm(b)) {                                    // v0.54: an atmosphere shows as a haze in its own colour, as in the 3D view
      const [ac, as] = atmColor(b), hx = "#" + ac.getHexString();
      // v0.55: stronger, so even a thin atmosphere reads at a glance
      const pk = Math.min(1, 0.95 * Math.max(as, 0.8)).toFixed(2);
      d += `<radialGradient id="${id}a"><stop offset=".6" stop-color="${hx}" stop-opacity="0"/><stop offset=".655" stop-color="${hx}" stop-opacity="${pk}"/><stop offset=".8" stop-color="${hx}" stop-opacity="${(pk * 0.35).toFixed(2)}"/><stop offset="1" stop-color="${hx}" stop-opacity="0"/></radialGradient>`;
      haze = `<circle r="${(r * 1.55).toFixed(1)}" fill="url(#${id}a)"/>`;
      rim = `<circle r="${r}" fill="none" stroke="${hx}" stroke-opacity="1" stroke-width="${Math.max(1.6, r * 0.13).toFixed(1)}"/><circle r="${(r * 0.9).toFixed(1)}" fill="none" stroke="${hx}" stroke-opacity=".25" stroke-width="${Math.max(1, r * 0.1).toFixed(1)}"/>`;
    }
    // v0.61: the body's own surface (the same one as in 3D) once its thumbnail is ready; the gradient until then
    if (b._thumb === undefined) thumbRequest(b, () => { if (MAPMODE && S) smapBuild(true); });
    const disc = b._thumb ? `<image href="${b._thumb}" x="${-r}" y="${-r}" width="${2 * r}" height="${2 * r}"/>` : `<circle r="${r}" fill="url(#${id})"/>${bands}`;
    s += back + haze + `<g class="dsk">${disc}</g>` + `<circle class="shd" r="${r}" fill="#000" opacity="0"/>${rim}`; n._front = front;   // the front arcs go on top of the body's hit area
  }
  s += `<circle class="hl" r="${(smapRing(b) ? r * 1.15 : r) + 4}"/><circle class="hit" r="${Math.max(r, 11) + 3}"/>` + (n._front || "");
  return { d, g: `<g class="smo${n.star ? " star" : ""}${n.moon ? " moon" : ""}" data-id="${b.bodyId}" data-r="${r}" transform="translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})">${s}</g>` };
}
function smapBuild(keepView) {
  const el = $("smap"); if (!el || !S) return;
  const P = smapPlan(); SMAP.plan = P;
  let defs = "", bodies = "", ports = "", labels = "";
  for (const n of P.bodies) { const o = smapBodySvg(n); defs += o.d; bodies += o.g;
    const nm = esc(shortName(n.b, S.sys.name).replace(/^★\s*/, ""));
    if (n.star) labels += `<text class="ls" x="${n.x}" y="${n.y + n.r + 22}" text-anchor="middle">${nm}</text>`;
    else if (n.moon) labels += `<text class="lm" x="${(n.x + n.r * 0.72 + 3).toFixed(1)}" y="${(n.y - n.r * 0.72 - 3).toFixed(1)}">${nm}</text>`;
    else labels += `<text class="lp" x="${(n.x + (smapRing(n.b) ? n.r * 0.45 : n.r * 0.72) + 4).toFixed(1)}" y="${(n.y - n.r * 0.72 - 4).toFixed(1)}">${nm}</text>`;
  }
  SMAP.ports = P.ports;
  P.ports.forEach((q, i) => {
    const g = q.p, pp = g.p;
    ports += `<g class="smp pc-${pp.cls.replace(" ", " pc-")}" data-p="${i}" transform="translate(${q.x.toFixed(1)} ${q.y.toFixed(1)})"><rect class="phit" x="-17" y="-17" width="34" height="34"/><rect class="pbx" x="-11" y="-11" width="22" height="22" rx="3"/><svg x="-8" y="-8" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round">${stnPaths(pp.v || pp.k)}</svg>${g.n ? `<circle class="pnb" cx="10" cy="-10" r="7"/><text class="pnt" x="10" y="-6.5" text-anchor="middle">${g.n}</text>` : ""}</g>`; });
  const belts = P.belts.map(q => { let dots = ""; for (let k = 0; k < 26; k++) { const a = Math.sin(k * 91.7) * 0.5 + 0.5, bb = Math.sin(k * 37.3) * 0.5 + 0.5;
      dots += `<circle cx="${((a - 0.5) * 12).toFixed(1)}" cy="${((k / 25 - 0.5) * 52).toFixed(1)}" r="${(0.8 + bb * 1.6).toFixed(1)}"/>`; }
    const on = typeof SELB !== "undefined" && SELB && SELB.b === q.star && (SELB.bl.name || "") === (q.bl.name || "");
    return `<g class="smbelt${on ? " sel" : ""}" data-belt="${esc(q.bl.name || "")}" transform="translate(${q.x} ${q.y})"><rect class="bhl" x="-11" y="-33" width="22" height="66" rx="11"/><rect x="-10" y="-30" width="20" height="60" fill="transparent"/>${dots}</g>`; }).join("");
  // stations on a surface stand on the body's edge, one marker per kind, with a count
  SMAP.surf = []; let surf = "", ecb = "";
  const SF = {
    port: '<path d="M-6 0A6 6 0 0 1 6 0Z"/><path class="ln" d="M0 -6V-10"/><circle cx="0" cy="-10.5" r="1.4"/>',
    settle: '<rect x="-6.5" y="-5" width="3.6" height="5"/><rect x="-2" y="-8.5" width="4" height="8.5"/><rect x="2.9" y="-4" width="3.6" height="4"/>',
    sbuild: '<rect x="-6" y="-2.6" width="7" height="2.6" rx=".6"/><rect x="-3.9" y="-12.5" width="1.8" height="10"/><rect x="-6.4" y="-13.2" width="13" height="1.4" rx=".5"/><path class="ln" d="M5.3 -11.8V-7.2M-3.9 -10.4L-2.1 -8.6M-2.1 -10.4L-3.9 -8.6M-3.9 -7L-2.1 -5.2M-2.1 -7L-3.9 -5.2"/><rect x="4.3" y="-7.4" width="2" height="1.8" rx=".4"/>',
  };
  const ANG = [145, -145, 118];
  for (const n of P.bodies) {
    if (n.b.type === "Star") continue;
    const groups = [];
    for (const p of smapSurf(n.b)) { let g = groups.find(q => q.k === p.k); if (!g) groups.push(g = { k: p.k, all: [] }); g.all.push(p); }
    groups.slice(0, 3).forEach((g, j) => {
      const th = ANG[j] * Math.PI / 180, R0 = n.r + 0.5, x = n.x + Math.cos(th) * R0, y = n.y + Math.sin(th) * R0, i = SMAP.surf.length;
      SMAP.surf.push({ b: n.b, all: g.all, k: g.k });
      surf += `<g class="sfm pc-${g.k === "sbuild" ? "build" : "surf"}" data-sf="${i}"><g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${ANG[j] + 90}) scale(${n.moon ? 1.25 : 1.4})">${(g.all.every(q => q.v === g.all[0].v) && structMapMark(g.all[0].v)) || SF[g.k] || SF.settle}<circle class="hit" cx="0" cy="-5" r="8"/></g>` +
        (g.all.length > 1 ? `<text class="sfn" x="${(n.x + Math.cos(th) * (n.r + 17)).toFixed(1)}" y="${(n.y + Math.sin(th) * (n.r + 17) + 3).toFixed(1)}" text-anchor="middle">${g.all.length}</text>` : "") + `</g>`;
    });
    ecb += `<g class="ecb" data-e="${n.b.bodyId}" transform="translate(${(n.x + 4).toFixed(1)} ${(n.y + n.r + 4).toFixed(1)})"><rect x="0" y="0" height="14" rx="7" width="40"/><g class="ei" transform="translate(8 7)"><circle r="4.2" class="e1"/><circle cx="2.2" cy="-1.2" r="3.4" class="e2"/></g><text x="16" y="10.4"></text></g>`;
  }
  const marks = P.marks.map(m => `<path class="smx" d="M${m.x - 5} ${m.y - 5}l10 10M${m.x + 5} ${m.y - 5}l-10 10"/>`).join("");
  $("smapBody").innerHTML = `<svg id="smapSvg" aria-label="System map of ${esc(S.sys.name)}"><defs>${defs}</defs><g id="smapG">
    <path class="sml" d="${P.lines.join("")}"/><path class="smbk" d="${P.brk.join("")}"/>${marks}${belts}<g class="smbs">${bodies}</g><g class="smsf">${surf}</g><g class="smps">${ports}</g><g class="smes">${ecb}</g><g class="smls">${labels}</g></g></svg>`;
  SMAP.items = [...$("smapBody").querySelectorAll(".smo")].map(e => ({ el: e, b: S.byId.get(+e.dataset.id), shd: e.querySelector(".shd") }));
  SMAP.pels = [...$("smapBody").querySelectorAll(".smp")];
  SMAP.sels = [...$("smapBody").querySelectorAll(".sfm")];
  if (typeof stwMark === "function") stwMark();                     // v0.79.8: the open station stays marked
  if (typeof watchMark === "function" && typeof JRN !== "undefined" && JRN) { JRN.wKey = ""; try { watchMark(); } catch (e) {} }   // v0.82.5: Watch matches glow
  for (const it of SMAP.items) it.ecb = $("smapBody").querySelector(`.ecb[data-e="${it.el.dataset.id}"]`);
  filtersRender();
  $("smapNote").innerHTML = S.unplaced && S.unplaced.length ? `Not on the map: ${S.unplaced.map(b => esc(shortName(b, S.sys.name))).join(", ")} (Spansh has no orbit yet).` : "";
  SMAP.built = S; SMAP.tipFor = null; smapTipHide();
  smapLayout(); if (keepView && SMAP.v) smapApply(); else smapFit(); smapNames();
  smapMarkSel(); smapFilter(); smapScan(true); smapTick(true);
}
// v0.55: one set of filters for both views. The same buttons sit on the system map and over the 3D orrery, and what you
// choose in one is kept in the other.
function filtersRender() {
  if (!S) return;
  const counts = Object.fromEntries(SMAP_FILTERS.map(([k, , f]) => [k, k === "stn" ? S.bodies.filter(b => smapShown(b).some(p => p.k !== "carrier")).length : S.bodies.filter(f).length]));
  const nBuild = S.bodies.reduce((a, b) => a + smapPortsOf(b).filter(p => p.cls === "build").length, 0);
  const html = SMAP_FILTERS.filter(([k]) => k === "ecl" || counts[k]).map(([k, n]) =>
    `<button data-f="${k}" class="${SMAP.filters.has(k) ? "on" : ""}" aria-pressed="${SMAP.filters.has(k)}">${n}<b>${k === "ecl" ? "" : counts[k]}</b>${k === "stn" ? `<span class="car">▾</span>` : ""}</button>`).join("") +
    `<span class="fcount"></span>` +
    (nBuild ? `<button data-build="1" class="sw${SMAP.build ? " on" : ""}" aria-pressed="${SMAP.build}" title="Construction sites are hidden unless you ask for them. They may already be finished in the game."><i></i>Construction sites<b>${nBuild}</b></button>` : "");
  const on = SMAP.filters.has("stn"), sub = on ? `<span>Stations:</span>` + SMAP_SUB.map(([k, n]) => `<button data-s="${k}" class="${SMAP.sub.has(k) ? "on" : ""}" aria-pressed="${SMAP.sub.has(k)}">${n}</button>`).join("") : "";
  for (const [a, b] of [["smapF", "smapF2"], ["ofiltF", "ofiltF2"]]) {
    if (!$(a)) continue;
    $(a).innerHTML = html; $(b).innerHTML = sub; $(b).style.display = on ? "flex" : "none";
  }
  if (PFULL) pfullHandles();                                       // v0.77.2: the count on the Filters tab
  filtersCount();
}
function filtersCount() {
  const on = SMAP_FILTERS.filter(([k]) => SMAP.filters.has(k)), n = on.length && S ? S.bodies.filter(b => on.every(([, , f]) => f(b))).length : 0;
  document.querySelectorAll(".fcount").forEach(e => e.textContent = on.length ? `${n} match${n === 1 ? "" : "es"}` : "");
}
function filtersChanged() { filtersRender(); smapFilter(); ofiltApply(); Sound.click(); }

// ---- view: pan and zoom
function smapApply() {
  const g = $("smapG"); if (!g) return;
  const v = SMAP.v; g.setAttribute("transform", `translate(${v.tx.toFixed(1)} ${v.ty.toFixed(1)}) scale(${v.k.toFixed(4)})`);
  const svg = $("smapSvg"), fs = 12 / Math.max(v.k, 0.8);
  svg.style.setProperty("--fs", fs.toFixed(2) + "px");
  svg.classList.toggle("far", v.k < 0.5); svg.classList.toggle("vfar", v.k < 0.3);
  smapTipHide();
}
function smapFit() {
  const P = SMAP.plan, V = $("smapView"); if (!P || !V) return;
  const W = V.clientWidth, H = V.clientHeight; if (!W || !H) return;
  let k = Math.max(0.12, Math.min(1.15, (W - 30) / P.W, (H - 30) / P.H)), tx = Math.max(10, (W - P.W * k) / 2);
  let ty = Math.max(8, (H - P.H * k) / 2);
  if (PFULL) {                                                     // v0.77: the touch layout: clear of the top bar, the clock and the edge tabs
    const jn = document.body.classList.contains("jrn") && document.getElementById("jrnDn") ? +document.getElementById("jrnDn").dataset.n || 0 : 0;
    const L = 36 + (jn && document.body.classList.contains("jrnCol") ? 188 : 0), T = jn ? 96 : document.body.classList.contains("pRt") ? 90 : 54, Bm = jn ? 64 + Math.min(jn, innerWidth < 600 ? 2 : 3) * 40 : 54,   /* v0.78.5: the route strip; v0.80: the journey bars; v0.81: the route column */ w = W - L - 36, h = H - T - Bm;
    k = Math.max(0.12, Math.min(1.15, w / P.W, h / P.H)); if (k < 0.5) k = Math.max(k, Math.min(0.6, W > H ? w / P.W : h / P.H));   // sideways: fill the width, swipe down for long moon chains
    tx = P.W * k <= w ? L + (w - P.W * k) / 2 : L; ty = T + Math.max(0, (h - P.H * k) / 2);
  } else if (k < 0.5 && isPhone()) { k = Math.max(k, Math.min(0.6, (H - 30) / P.H)); tx = 4; ty = 12; }   // a narrow phone: readable size from the top, swipe for the rest
  SMAP.v = { k, tx, ty, auto: true }; SMAP.fitT = performance.now();
  smapApply();
}
function smapZoomAt(px, py, f) {
  const v = SMAP.v, k = Math.max(0.12, Math.min(5, v.k * f)), wx = (px - v.tx) / v.k, wy = (py - v.ty) / v.k;
  SMAP.v = { k, tx: px - wx * k, ty: py - wy * k, auto: false }; smapApply();
}
// v0.79.9: Find me: the map glides to a body and zooms in on it, like a navigation app
function smapFlyTo(b) {
  const n = SMAP.plan && SMAP.plan.bodies.find(q => q.b === b), V = $("smapView"); if (!n || !V) return;
  const v0 = { ...SMAP.v }, W = V.clientWidth, H = V.clientHeight, k = Math.max(v0.k, Math.min(5, 46 / Math.max(n.r || 10, 4)));
  const v1 = { k, tx: W / 2 - n.x * k, ty: H / 2 - n.y * k }, t0 = performance.now(), my = (smapFlyTo.n = (smapFlyTo.n || 0) + 1);
  const step = now => { if (my !== smapFlyTo.n) return; const a = Math.min(1, (now - t0) / 420), e = 1 - Math.pow(1 - a, 3);
    SMAP.v = { k: v0.k + (v1.k - v0.k) * e, tx: v0.tx + (v1.tx - v0.tx) * e, ty: v0.ty + (v1.ty - v0.ty) * e, auto: false }; smapApply(); if (a < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function smapReveal(b) {
  const n = SMAP.plan && SMAP.plan.bodies.find(q => q.b === b), V = $("smapView"); if (!n || !V) return;
  const v = SMAP.v, x = v.tx + n.x * v.k, y = v.ty + n.y * v.k, W = V.clientWidth, H = V.clientHeight, m = 50;
  let dx = 0, dy = 0;
  if (x > W - m) dx = W - m - x; else if (x < m) dx = m - x;
  if (y > H - m) dy = H - m - y; else if (y < m) dy = m - y;
  if (dx || dy) { SMAP.v = { ...v, tx: v.tx + dx, ty: v.ty + dy, auto: false }; smapApply(); }   // moved for the user: no refit later
}
function smapNames() {
  const svg = $("smapSvg"); if (svg) svg.classList.toggle("nonames", !SMAP.names);
  const b = $("smNames"); if (b) { b.classList.toggle("on", SMAP.names); b.setAttribute("aria-pressed", SMAP.names); }
}
// ---- tooltip
function smapTipShow(html, x, y) {
  const t = $("smapTip"), V = $("smapView"); if (!t || !V) return;
  t.innerHTML = html; t.style.display = "block";
  const W = V.clientWidth, H = V.clientHeight, w = t.offsetWidth, h = t.offsetHeight;
  let lx = x + 16, ly = y + 14;
  if (lx + w > W - 6) lx = Math.max(6, x - w - 14);
  if (ly + h > H - 6) ly = Math.max(6, y - h - 12);
  t.style.left = lx + "px"; t.style.top = ly + "px";
}
function smapTipHide() { const t = $("smapTip"); if (t) t.style.display = "none"; SMAP.tipFor = null; }
function smapTipFor(target, x, y) {
  const sf = target && target.closest ? target.closest(".sfm") : null;
  if (sf) { const q = SMAP.surf[+sf.dataset.sf]; if (!q) return; SMAP.tipFor = { q, x, y }; const on = esc(shortName(q.b, S.sys.name));
    smapTipShow(`<b>${q.all.length > 1 ? `${q.all.length} × ` : ""}${esc(q.all[0].kind)}</b> <span>on the surface of ${on}</span>${q.all.slice(0, 12).map(p => `<div>${esc(p.name)}${p.st && p.st.latitude != null ? ` <span class="dim">${fmt(p.st.latitude, 1)}°, ${fmt(p.st.longitude, 1)}°</span>` : ""}</div>`).join("")}${q.all.length > 12 ? `<div>and ${q.all.length - 12} more</div>` : ""}<div class="hint">Click for ${q.all.length > 1 ? "their" : "its"} market, pads and services</div>`, x, y); return; }
  const rgEl = target && target.closest ? target.closest(".smring") : null;
  if (rgEl) { const rb = S.byId.get(+rgEl.dataset.id); if (rb) { SMAP.tipFor = null; ringHover(rb, +rgEl.dataset.ri); smapTipShow(ringTip(rb, ringRows(rb)[+rgEl.dataset.ri]), x, y); } return; }
  ringHover(null);
  const bt = target && target.closest ? target.closest(".smbelt") : null;
  if (bt) { const B = (S.belts || []).find(x => (x.bl.name || "") === bt.dataset.belt); if (B) { SMAP.tipFor = null; smapTipShow(beltTip(B) + `<div class="hint">Click for details · double-click to see it in 3D</div>`, x, y); } return; }
  const o = target && target.closest ? target.closest(".smo, .smp") : null;
  if (!o) { smapTipHide(); return; }
  if (o.classList.contains("smo")) { const b = S.byId.get(+o.dataset.id); if (!b) return; SMAP.tipFor = { b, x, y }; smapTipShow(smapTip(b), x, y); }
  else { const q = SMAP.ports[+o.dataset.p]; if (!q) return; SMAP.tipFor = { q, x, y };
    const all = q.p.all, on = esc(shortName(q.of, S.sys.name));
    smapTipShow(all.length > 1 ? `<b>${all.length} × ${esc(all[0].kind)}</b> <span>on ${on}</span>${all.slice(0, 12).map(p => `<div>${esc(p.name)}</div>`).join("")}${all.length > 12 ? `<div>and ${all.length - 12} more</div>` : ""}<div class="hint">Click to pick one: market, pads, services</div>`
      : `<b>${esc(all[0].name)}</b> <span>${esc(all[0].kind)}</span><div>${esc(all[0].tip.split(" · ").slice(2).join(" · "))}</div><div class="hint">Click for its market, pads and services</div>`, x, y); }
}
// ---- live layer: in shadow now, and the next eclipse (scanned ahead, refined to the second)
function smapScan(force) {
  if (!S || !S.main) return;
  const sc = SMAP.scan, t = simTime;
  if (!force && sc && sc.S === S && t >= sc.t0 + 3600000 && t <= sc.t0 + 18 * 3600000) return;   // still covers the next 30 h
  if (!force && sc && Math.abs(speed) > 3600) return;               // fast playback: show live light only, rescan when it slows down
  const job = ++SMAP.job, bodies = S.bodies.filter(b => b.type !== "Star"), hosts = new Map(bodies.map(b => [b.bodyId, hostStar(b)]));
  const N = SMAP_SCAN_H * 3600000 / SMAP_STEP + 1, t0 = Math.floor((t - 6 * 3600000) / SMAP_STEP) * SMAP_STEP, sysS = S;   // 6 h back, 42 h ahead
  const dark = new Map(bodies.map(b => [b.bodyId, []]));
  let i = 0;
  const step = () => {
    if (job !== SMAP.job || S !== sysS) return;                      // a newer scan or another system took over
    const until = performance.now() + 12;
    for (; i < N && performance.now() < until; i++) {
      const W = worldAt(t0 + i * SMAP_STEP);
      for (const b of bodies) dark.get(b.bodyId).push(starlightWho(b, hosts.get(b.bodyId), W).vis < SMAP_DARK);
    }
    if (i < N) return setTimeout(step, 0);
    const ev = new Map(), isDark = (b, tt) => starlightWho(b, hosts.get(b.bodyId), worldAt(tt)).vis < SMAP_DARK;
    // edges to about 2 s, as in the eclipse calendar
    const edge = (b, a, z, want) => { for (let k = 0; k < 18 && z - a > 2000; k++) { const m = (a + z) / 2; if (isDark(b, m) === want) z = m; else a = m; } return z; };
    for (const b of bodies) {                                        // every eclipse in the window, so the countdown rolls on
      const d = dark.get(b.bodyId), list = [];
      for (let s = d.indexOf(true); s >= 0; ) {
        const e = d.indexOf(false, s);
        list.push({ ta: s === 0 ? -Infinity : edge(b, t0 + (s - 1) * SMAP_STEP, t0 + s * SMAP_STEP, true),
                    tz: e < 0 ? Infinity : edge(b, t0 + (e - 1) * SMAP_STEP, t0 + e * SMAP_STEP, false) });
        if (e < 0) break;
        s = d.indexOf(true, e);
      }
      if (list.length) ev.set(b.bodyId, list);
    }
    SMAP.scan = { S: sysS, t0, t1: t0 + (N - 1) * SMAP_STEP, ev };
    smapFilter(); smapTick(true);
  };
  SMAP.scan = sc && sc.S === S ? sc : null;                          // keep showing the old result while the new one runs
  setTimeout(step, 0);
}
function smapEvent(b) {                               // the eclipse going on now, or the next one, if the scan covers this moment
  const sc = SMAP.scan; if (!sc || sc.S !== S || simTime < sc.t0 || simTime > sc.t1) return null;
  return (sc.ev.get(b.bodyId) || []).find(e => e.tz > simTime) || null;
}
const smapShort = ms => { const m = Math.max(1, Math.round(ms / 60000)); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`; };
const smapDur = ms => { const m = Math.max(1, Math.round(ms / 60000)); return m < 90 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
function smapTick(force) {
  if (!MAPMODE || !S || SMAP.built !== S) return;
  const now = performance.now();
  if (!force && now - SMAP.tick < 500) return;
  SMAP.tick = now;
  smapLayout(); smapScan(false);
  if (SMAP.filters.has("ecl")) smapFilter();                        // the 24 h window moves with the clock
  for (const it of SMAP.items) {
    const b = it.b; if (!b || b.type === "Star" || !S.main) continue;
    const vis = starlight(b, hostStar(b));
    const op = (0.82 * (1 - vis)).toFixed(2); if (it.shd && it._op !== op) { it.shd.setAttribute("opacity", op); it._op = op; }
    const e = smapEvent(b), cls = vis < SMAP_DARK ? "dark" : e && e.ta > simTime && e.ta - simTime < 86400000 ? "soon" : "";
    if (it._c !== cls) { it.el.classList.toggle("dark", cls === "dark"); it.el.classList.toggle("soon", cls === "soon"); it._c = cls; }
    // v0.54: a small eclipse badge with the time, instead of a ring that looked like an atmosphere
    if (it.ecb) {
      const txt = cls === "dark" ? (e && e.ta <= simTime && e.tz !== Infinity ? `${smapShort(e.tz - simTime)} left` : "in shadow") : cls === "soon" ? `in ${smapShort(e.ta - simTime)}` : "";
      if (it._t !== txt) { it._t = txt; it.ecb.classList.toggle("on", !!txt); it.ecb.classList.toggle("dk", cls === "dark");
        if (txt) { it.ecb.querySelector("text").textContent = txt; it.ecb.querySelector("rect").setAttribute("width", (22 + txt.length * 5.7).toFixed(0)); } }
    }
  }
  const tf = SMAP.tipFor; if (tf && tf.b) smapTipShow(smapTip(tf.b), tf.x, tf.y);
}
function smapFilter() {
  const on = SMAP_FILTERS.filter(([k]) => SMAP.filters.has(k));
  let n = 0;
  for (const it of SMAP.items) {
    const hit = !on.length || (it.b && on.every(([, , f]) => f(it.b)));
    it.el.classList.toggle("dim", !hit); it.el.classList.toggle("hit", on.length > 0 && hit);
    if (on.length && hit) n++;
  }
  const stn = SMAP.filters.has("stn");
  (SMAP.pels || []).forEach((e, i) => { const all = SMAP.ports[i].p.all;
    const hit = stn ? all.some(p => p.k !== "carrier" && smapPortHit(p)) : SMAP.filters.has("fc") ? all.some(p => p.k === "carrier") : !on.length;
    e.classList.toggle("dim", on.length > 0 && !hit); e.classList.toggle("hit", on.length > 0 && hit); });
  (SMAP.sels || []).forEach((e, i) => { const all = SMAP.surf[i].all;
    const hit = stn ? all.some(p => smapPortHit(p)) : !on.length;
    e.classList.toggle("dim", on.length > 0 && !hit); e.classList.toggle("hit", on.length > 0 && hit); });
  filtersCount();
}
function smapMarkSel() {
  for (const it of SMAP.items) it.el.classList.toggle("sel", it.b === selected);
  if (MAPMODE) requestAnimationFrame(() => smapLayout());
}
// v0.79.8: the window on the right that the map and the 3D filters make room for: the station window when it is open
function rightPanel() { return typeof stwIsOpen === "function" && stwIsOpen() && !PFULL ? $("stw") : $("info"); }
function smapLayout() {
  const el = $("smap"); if (!el || !MAPMODE) return;
  const shown = e => e && e.getClientRects().length > 0, R = e => e.getBoundingClientRect();
  let L = 8, Rt = 8, T = 8, B = 8;
  if (isPhone()) {
    T = R($("top")).bottom + 8;
    const tops = ["time", "mnav"].map($).filter(shown).map(e => R(e).top); if (tops.length) B = innerHeight - Math.min(...tops) + 8;
  } else {
    L = shown($("list")) ? R($("list")).right + 12 : 324;
    const sys = $("sys"), sysOpen = shown(sys) && !sys.classList.contains("collapsed");
    // v0.52: an open System panel pushes the map to the right, a closed one sits above it
    if (sysOpen) { L = Math.max(L, R(sys).right + 12); T = R(sys).top; }
    else T = shown(sys) ? R(sys).bottom + 10 : 12;
    const inf = rightPanel(); Rt = shown(inf) && !inf.classList.contains("closing") ? innerWidth - inf.offsetLeft + 12 : 12;   // offsetLeft ignores the slide-in
    const tops = ["time", "mapMode"].map($).filter(shown).map(e => R(e).top); if (tops.length) B = innerHeight - Math.min(...tops) + 10;
  }
  if (typeof jrnReserve === "function") [L, T, B] = jrnReserve(L, Rt, T, B);   // v0.80: the journey bars above and below the map; v0.81: the route column on the left
  const s = el.style, v = [L, Rt, T, B].map(x => Math.round(x) + "px");
  if (s.left !== v[0] || s.right !== v[1] || s.top !== v[2] || s.bottom !== v[3]) Object.assign(s, { left: v[0], right: v[1], top: v[2], bottom: v[3] });
}
document.addEventListener("click", e => { if (MAPMODE && e.target.closest && e.target.closest(".coll")) requestAnimationFrame(() => smapLayout()); });
function setCollapsed(id, on) {
  const p = $(id), btn = p && p.querySelector(".coll[data-target]"); if (!p) return;
  p.classList.toggle("collapsed", on); if (btn) btn.textContent = on ? "+" : "–";
}
function setMap(on, save = true) {
  on = !!on && !!S;
  if (on && SURF) exitSurface(false);
  if (on === MAPMODE) { mapModeUi(); return; }
  MAPMODE = on; keys.clear(); otipHide(); Sound.setAmbient(!on); if (on) prepEnd();        // v0.78: no hum on the map                                        // a key held while switching must not move the hidden camera
  document.body.classList.toggle("mapping", on);
  $("smap").style.display = on ? "flex" : "none";
  $("scene").style.visibility = on ? "hidden" : "";
  // v0.75.6: the page's main part is the view on screen (screen readers, and tests that skip hidden parts)
  if (on) { $("scene").removeAttribute("role"); $("smap").setAttribute("role", "main"); } else { $("smap").removeAttribute("role"); $("scene").setAttribute("role", "main"); }
  if (on) {
    SMAP.sysCollapsedBefore = $("sys").classList.contains("collapsed");
    if (!isPhone()) setCollapsed("sys", true);
    computeWorld(simTime);
    smapBuild();
  } else {
    if (SMAP.sysCollapsedBefore === false) setCollapsed("sys", false);
    SMAP.sysCollapsedBefore = null;
    SMAP.job++;                                                      // stop a scan that is still running
  }
  mapModeUi(); modeTagText(); layoutLeft();
  if (!on) { prep3D(); setTimeout(tsHint, 900); }
  if (save) try { localStorage.setItem("gravitas.map", on ? "1" : "0"); } catch (e) {}
  updateUrl();
}
function mapModeUi() {
  const m = $("mapMode"); if (!m) return;
  m.classList.toggle("on", MAPMODE); $("mmSeg").classList.toggle("map", MAPMODE);
  m.setAttribute("aria-checked", MAPMODE ? "true" : "false");
}
// two views only, so a click anywhere on the switch goes to the other one (the faded one)
$("mapMode").onclick = () => { Sound.unlock(); if (!S) return; Sound.whoosh(MAPMODE ? 1 : -1); fadeFlash(); setMap(!MAPMODE); };
$("mapMode").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("mapMode").click(); } });

// ---- input: drag to pan, wheel or pinch to zoom, click to select, double-click for 3D, empty click to deselect
{
  const V = $("smapView"), pts = new Map();
  let drag = null, pinch = null, lastTap = { t: 0, id: null };
  const rel = e => { const r = V.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  V.addEventListener("pointerdown", e => {
    if (e.target.closest(".smz")) return;
    if (e.pointerType === "mouse") { e.preventDefault(); V.focus({ preventScroll: true }); }   // no text selection or browser drag while moving the map
    try { V.setPointerCapture(e.pointerId); } catch (err) {} pts.set(e.pointerId, rel(e));
    if (pts.size === 1) drag = { p: rel(e), tx: SMAP.v.tx, ty: SMAP.v.ty, moved: false, target: e.target, type: e.pointerType };
    else if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, k: SMAP.v.k, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], tx: SMAP.v.tx, ty: SMAP.v.ty }; if (drag) drag.moved = true; }
  });
  V.addEventListener("pointermove", e => {
    const p = rel(e);
    if (!pts.has(e.pointerId)) { if (e.pointerType === "mouse") smapTipFor(e.target, p[0], p[1]); return; }
    pts.set(e.pointerId, p);
    if (pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const k = Math.max(0.12, Math.min(5, pinch.k * d / pinch.d)), wx = (pinch.m[0] - pinch.tx) / pinch.k, wy = (pinch.m[1] - pinch.ty) / pinch.k;
      SMAP.v = { k, tx: m[0] - wx * k, ty: m[1] - wy * k, auto: false }; smapApply();
    } else if (drag) {
      const dx = p[0] - drag.p[0], dy = p[1] - drag.p[1];
      if (!drag.moved && Math.hypot(dx, dy) > 5) { drag.moved = true; V.classList.add("grab"); smapTipHide(); if (typeof FOLLOW !== "undefined" && FOLLOW.on) followSet(false); }   // v0.82.4: moving the map unlocks Follow
      if (drag.moved) { SMAP.v = { ...SMAP.v, tx: drag.tx + dx, ty: drag.ty + dy, auto: false }; smapApply(); }
    }
  });
  const end = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId); if (pts.size < 2) pinch = null;
    if (pts.size || !drag) return;
    const d = drag; drag = null; V.classList.remove("grab");
    if (d.moved || e.type === "pointercancel") return;
    const p = rel(e), sf = d.target.closest ? d.target.closest(".sfm") : null;
    if (sf) { const q = SMAP.surf[+sf.dataset.sf]; if (q) { smapTipHide(); stnPick(q.all.map(p => p.st)); } return; }   // v0.79: the station window
    const rgEl = d.target.closest ? d.target.closest(".smring") : null;   // v0.64: a click on a ring selects the rings
    if (rgEl) { const rb = S.byId.get(+rgEl.dataset.id); if (rb) { const now = performance.now();
      if (lastTap.id === "ring" + rb.bodyId && now - lastTap.t < 380) { lastTap = { t: 0, id: null }; smapTipHide(); if (!(PFULL && SYNC.remote)) setMap(false); select(rb, true); return; }
      lastTap = { t: now, id: "ring" + rb.bodyId }; ringSelect(rb, +rgEl.dataset.ri); } return; }
    const bt = d.target.closest ? d.target.closest(".smbelt") : null;     // v0.62: a belt opens its star's panel at the Belts section
    if (bt) { const B = (S.belts || []).find(x => (x.bl.name || "") === bt.dataset.belt); if (B) { const now = performance.now();
      if (lastTap.id === "belt" && now - lastTap.t < 380) { lastTap = { t: 0, id: null }; smapTipHide(); beltFly(B); return; }
      lastTap = { t: now, id: "belt" }; beltSelect(B); } return; }
    const o = d.target.closest ? d.target.closest(".smo, .smp") : null;
    if (!o) { if (stwIsOpen()) stnClose(); if (selected || SELB || SELR) $("infoClose").onclick(); smapTipHide(); return; }   // v0.79.7: the station window too        // empty space: let go of the selection (a belt too)
    if (o.classList.contains("smp")) { const q = SMAP.ports[+o.dataset.p]; if (q) { smapTipHide(); stnPick(q.p.all.map(p => p.st)); } return; }   // v0.79: a station opens its own window
    const b = S.byId.get(+o.dataset.id);
    if (!b || !b._obj) return;
    const now = performance.now();
    if (o.classList.contains("smo") && lastTap.id === b.bodyId && now - lastTap.t < 380) { lastTap = { t: 0, id: null }; smapTipHide(); if (!(PFULL && SYNC.remote)) setMap(false); select(b, true); return; }
    lastTap = { t: now, id: b.bodyId };
    select(b, false);                                  // a tap opens the body panel, which holds everything the tooltip would
  };
  V.addEventListener("dragstart", e => e.preventDefault());
  V.addEventListener("pointerup", end); V.addEventListener("pointercancel", end);
  V.addEventListener("pointerleave", e => { if (e.pointerType === "mouse" && !pts.size) smapTipHide(); });
  V.addEventListener("wheel", e => { e.preventDefault(); const p = rel(e); smapZoomAt(p[0], p[1], Math.exp(-Math.max(-60, Math.min(60, e.deltaY)) * 0.0035)); }, { passive: false });
  const zc = f => { smapZoomAt(V.clientWidth / 2, V.clientHeight / 2, f); };
  $("smZin").onclick = () => zc(1.35); $("smZout").onclick = () => zc(1 / 1.35); $("smZfit").onclick = () => smapFit();
  $("smNames").onclick = () => { SMAP.names = !SMAP.names; try { localStorage.setItem("gravitas.mapNames", SMAP.names ? "1" : "0"); } catch (e) {} smapNames(); };
  V.addEventListener("keydown", e => {
    if (e.target !== V) return;
    const step = 60, k = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (k) { e.preventDefault(); if (typeof FOLLOW !== "undefined" && FOLLOW.on) followSet(false); SMAP.v = { ...SMAP.v, tx: SMAP.v.tx + k[0], ty: SMAP.v.ty + k[1], auto: false }; smapApply(); }
    else if (e.key === "+" || e.key === "=") zc(1.25); else if (e.key === "-") zc(0.8); else if (e.key === "0") smapFit();
  });
  // when the panels around it move, the picture stays where it is (a click must never make it jump), and a chosen body
  // that would end up hidden is brought back into view
  // v0.63.4: only a change of the window itself refits the whole system; a panel opening or closing (a click) never
  // re-zooms, so the picture does not swing back and forth while the panel slides
  let winWH = innerWidth + "x" + innerHeight;
  if (window.ResizeObserver) new ResizeObserver(() => { if (!MAPMODE || !SMAP.plan) return;
    const wh = innerWidth + "x" + innerHeight, win = wh !== winWH; winWH = wh;
    if (SMAP.v.auto && !selected && (win || performance.now() - (SMAP.fitT || 0) < 700)) smapFit();   // (panels settling right after a fit still count)
    else { smapApply(); if (selected) smapReveal(selected); } }).observe(V);
}
for (const id of ["smapF", "ofiltF"]) $(id).addEventListener("click", e => {
  if (e.target.closest("button[data-true]")) { setTrueScale(!TRUESCALE, true); Sound.click(); return; }     // v0.57
  if (e.target.closest("button[data-build]")) {        // construction sites: off unless asked for, the map is redrawn where it is
    SMAP.build = !SMAP.build; if (MAPMODE) smapBuild(true); filtersChanged(); return;
  }
  const b = e.target.closest("button[data-f]"); if (!b) return;
  const k = b.dataset.f; SMAP.filters.has(k) ? SMAP.filters.delete(k) : SMAP.filters.add(k);
  if (k === "stn" && !SMAP.filters.has("stn")) SMAP.sub.clear();
  if (k === "ecl" && SMAP.filters.has("ecl")) smapScan(false);
  filtersChanged();
});
for (const id of ["smapF2", "ofiltF2"]) $(id).addEventListener("click", e => {
  const b = e.target.closest("button[data-s]"); if (!b) return;
  const k = b.dataset.s; SMAP.sub.has(k) ? SMAP.sub.delete(k) : SMAP.sub.add(k);
  if (k === "orb" && SMAP.sub.has("orb")) SMAP.sub.delete("surf"); if (k === "surf" && SMAP.sub.has("surf")) SMAP.sub.delete("orb");
  filtersChanged();
});

// ---- the 3D orrery: the same filters and the same tooltips (v0.55)
// A match gets a soft pulsing ring that keeps its size on screen, so it can be found from anywhere in the system;
// everything else fades back. Stations on a surface that match glow brighter.
let _ringTex = null;
function ringTex() {
  if (_ringTex) return _ringTex;
  const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
  const gr = g.createRadialGradient(64, 64, 34, 64, 64, 62); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.45, "rgba(255,255,255,.95)"); gr.addColorStop(0.6, "rgba(255,255,255,.5)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); _ringTex = new THREE.CanvasTexture(c); return _ringTex;
}
const OF = { t: 0 };
function ofiltApply() {
  if (!S) return;
  const on = SMAP_FILTERS.filter(([k]) => SMAP.filters.has(k)), stn = SMAP.filters.has("stn");
  for (const b of S.bodies) {
    const hit = on.length > 0 && on.every(([, , f]) => f(b));
    if (b._div) { b._div.classList.toggle("fhit", hit); b._div.classList.toggle("fdim", on.length > 0 && !hit); }
    if (hit && !b._fring) { b._fring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex(), color: 0x6ae8ff, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false, blending: THREE.AdditiveBlending })); b._fring.renderOrder = 6; b._obj.add(b._fring); }
    if (b._fring) b._fring.visible = hit;
  }
  for (const q of S.surfSites || []) { const p = { orbit: false, large: padLarge(q.st) };
    q.hit = stn && smapPortHit(p); q.dim = on.length > 0 && !q.hit; }
  filtersCount();
}
function ofiltFrame(now) {                              // called by the 3D loop
  const el = $("ofilt"); if (!el) return;
  const show = !!S && !MAPMODE && !SURF;
  if (el._show !== show) { el.style.display = show ? "block" : "none"; el._show = show; if ($("scaleMode")) $("scaleMode").style.display = show ? "block" : "none"; }
  if (!show) return;
  const pulse = 1 + 0.12 * Math.sin(now / 320);
  for (const b of S.bodies) if (b._fring && b._fring.visible) b._fring.scale.setScalar(0.052 * pulse);
  if (now - OF.t < 500) return; OF.t = now;
  ofiltLayout();
  if (SMAP.filters.has("ecl")) { smapScan(false); ofiltApply(); }
  const tf = OT.for; if (tf && tf.b) otipShow(smapTip(tf.b), tf.x, tf.y);
}
function ofiltLayout() {
  const el = $("ofilt"); if (!el || isPhone()) { if (el) Object.assign(el.style, { left: "", right: "", top: "" }); if ($("scaleMode")) Object.assign($("scaleMode").style, { right: "", height: "" }); return; }
  const shown = e => e && e.getClientRects().length > 0, R = e => e.getBoundingClientRect();
  const sys = $("sys"), inf = rightPanel();
  const L = shown(sys) ? R(sys).right + 12 : shown($("list")) ? R($("list")).right + 12 : 324;
  const Rt = shown(inf) && !inf.classList.contains("closing") ? innerWidth - inf.offsetLeft + 12 : 12;
  const sm = $("scaleMode"), sw = sm ? sm.offsetWidth + 10 : 0;
  const v = [L + "px", (Rt + sw) + "px"];
  if (el.style.left !== v[0] || el.style.right !== v[1]) Object.assign(el.style, { left: v[0], right: v[1] });
  if (sm) { const h = el.offsetHeight + "px", r = Rt + "px"; sm.classList.toggle("tall", el.offsetHeight > 60); if (sm.style.right !== r || sm.style.height !== h) Object.assign(sm.style, { right: r, height: h }); }
}
// tooltips over the 3D view: bodies (mesh or label), stations on a surface, stations in orbit and carriers
const OT = { for: null, q: 0 }, _otP = new THREE.Vector3(), _otB = new THREE.Vector3(), _otC = new THREE.Vector3();
function otipShow(html, x, y) {
  const t = $("otip"); if (!t) return;
  t.innerHTML = html; t.style.display = "block";
  const w = t.offsetWidth, h = t.offsetHeight; let lx = x + 16, ly = y + 14;
  if (lx + w > innerWidth - 6) lx = Math.max(6, x - w - 14); if (ly + h > innerHeight - 6) ly = Math.max(6, y - h - 12);
  t.style.left = lx + "px"; t.style.top = ly + "px";
}
function otipHide() { const t = $("otip"); if (t) t.style.display = "none"; OT.for = null; if (typeof ringHover === "function" && HOVR) ringHover(null); }
function siteTip(q) {
  const on = esc(shortName(q.b, S.sys.name));
  return `<b>${esc(q.name)}</b> <span>${esc(q.kind)}</span><div>On the surface of ${on}</div>` +
    (q.known ? `<div>${fmt(q.st.latitude, 2)}°, ${fmt(q.st.longitude, 2)}° (from Spansh)</div><div class="dim">Which way ${on} faces right now is not in the data, so the spot turns with an illustrative spin.</div>`
      : `<div class="dim">Spansh has no position for it. Placed for the picture only.</div>`) + (padTxt(q.st) ? `<div>Pads ${padTxt(q.st)}</div>` : "");
}
function otipAt(e) {
  if (!S || SURF || MAPMODE) { otipHide(); return; }
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(mouse, camera);
  const bh = ray.intersectObjects(S.bodies.map(b => b._mesh), false);
  // stations on a surface: found on screen (within 12 px of the pointer), only on the side of the body that faces us
  let best = null, bd = 144;
  for (const q of S.surfSites || []) {
    if (!q.beacon.visible) continue;
    q.beacon.getWorldPosition(_otP); q.b._mesh.getWorldPosition(_otB);
    if (_otP.clone().sub(_otB).dot(_otC.copy(camera.position).sub(_otP)) <= 0) continue;
    _otP.project(camera); const sx = (_otP.x + 1) / 2 * innerWidth, sy = (1 - _otP.y) / 2 * innerHeight, d2 = (sx - e.clientX) ** 2 + (sy - e.clientY) ** 2;
    if (d2 < bd) { bd = d2; best = q; }
  }
  if (best) { OT.for = { q: best, x: e.clientX, y: e.clientY }; otipShow(siteTip(best), e.clientX, e.clientY); return; }
  const objs = [...(S.orbitals || []), ...(S.carriers || [])].filter(o => o.obj && o.obj.visible);
  const oh = objs.length ? ray.intersectObjects(objs.map(o => o.obj), true) : [];
  if (oh.length && (!bh.length || oh[0].distance < bh[0].distance)) {
    let n = oh[0].object; while (n && !objs.some(o => o.obj === n)) n = n.parent;
    const o = objs.find(x => x.obj === n);
    if (o) { const isC = !!o.code; OT.for = { o, x: e.clientX, y: e.clientY };
      otipShow(`<b>${esc(o.name)}</b> <span>${isC ? "Fleet carrier " + esc(o.code) : esc(o.kindName)}</span><div>Near ${esc(shortName(o.body, S.sys.name))}${o.alt ? ` or ${esc(shortName(o.alt, S.sys.name))}` : ""}, matched from its reported distance</div><div class="dim">${isC ? (o.seen ? ago(o.seen) : "") : "Where it sits around the body is not in the data. The model is placed beside it."}</div>`, e.clientX, e.clientY); return; }
  }
  const rg = ringHit(ray);                                                 // v0.64: rings have a tooltip in 3D, nearer than the body behind
  const rgOn = rg && (!bh.length || rg.d < bh[0].distance);
  ringHover(rgOn ? rg.b : null, rgOn ? rg.ri : -1);
  if (rgOn) { OT.for = { ring: rg, x: e.clientX, y: e.clientY }; otipShow(ringTip(rg.b, rg.r), e.clientX, e.clientY); return; }
  const rk = beltHit(ray);
  if (rk && (!bh.length || rk.d < bh[0].distance)) { OT.for = { belt: rk.B, x: e.clientX, y: e.clientY }; otipShow(beltTip(rk.B), e.clientX, e.clientY); return; }
  if (bh.length) { const b = bh[0].object.userData.body; if (b) { OT.for = { b, x: e.clientX, y: e.clientY }; if (b.type !== "Star") smapScan(false); otipShow(smapTip(b), e.clientX, e.clientY); return; } }
  otipHide();
}
renderer.domElement.addEventListener("pointermove", e => {
  if (e.pointerType !== "mouse" || e.buttons) { otipHide(); return; }
  if (OT.q) return; OT.q = requestAnimationFrame(() => { OT.q = 0; otipAt(e); });
});
renderer.domElement.addEventListener("pointerleave", otipHide);
renderer.domElement.addEventListener("pointerdown", otipHide);
// labels are the easiest thing to point at from far away
function labelTips() {
  for (const b of S.bodies) if (b._div && !b._div._tip) {
    b._div._tip = 1;
    b._div.addEventListener("mouseenter", e => { if (MAPMODE || SURF) return; OT.for = { b, x: e.clientX, y: e.clientY }; if (b.type !== "Star") smapScan(false); otipShow(smapTip(b), e.clientX, e.clientY); });
    b._div.addEventListener("mousemove", e => { if (OT.for && OT.for.b === b) { OT.for.x = e.clientX; OT.for.y = e.clientY; otipShow(smapTip(b), e.clientX, e.clientY); } });
    b._div.addEventListener("mouseleave", otipHide);
  }
}
addEventListener("resize", () => { if (MAPMODE) smapLayout(); });
// ---- v0.63 live system map: the bodies and stars are drawn by the 3D renderer under the map's lines and labels,
// with the same surfaces, star shader and flares as the 3D view. Bodies turn with their real rotation period
// (Spansh), on the app's clock; which way they face at a given moment is illustrative, as in 3D. Low quality keeps
// the still pictures.
const MAPL = { scene: null, cam: null, rt: null, out: null, items: new Map(), on: false };
const MAPL_GLSL = `
  uniform sampler2D map; uniform vec3 uTint; uniform float uSpin, uGiant; uniform vec4 uVeil; varying vec2 vUv;
  void main() {
    vec2 q = vUv * 2.0 - 1.0; float rr = dot(q, q); if (rr > 1.0) discard;
    vec3 n = vec3(q.x, q.y, sqrt(1.0 - rr));
    float c = cos(uSpin), s = sin(uSpin); vec3 d = vec3(n.x * c + n.z * s, n.y, -n.x * s + n.z * c);
    vec2 uv = vec2(atan(d.z, -d.x) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.1415927 + 0.5);
    vec3 alb = pow(texture2D(map, uv).rgb, vec3(2.2)) * uTint;
    float l = max(dot(n, normalize(vec3(-0.45, 0.35, 0.82))), 0.0), lit = mix(l, l * (0.72 + 0.28 * n.z), uGiant);
    float bands = 0.5 + 0.5 * sin(d.y * 9.0 + 2.0 * sin(atan(d.z, d.x) * 3.0 + d.y * 4.0)) * sin(d.y * 23.0 + 1.3);   // a thick cloud deck is banded, not flat
    vec3 veil = uVeil.rgb * (0.86 + 0.24 * bands);
    vec3 col = mix(alb, veil, uVeil.a) * (0.05 + 1.15 * lit);
    gl_FragColor = vec4(col, smoothstep(1.0, 0.97, sqrt(rr)));
  }`;
function maplInit() {
  if (MAPL.scene) return;
  MAPL.scene = new THREE.Scene(); MAPL.cam = new THREE.OrthographicCamera(0, 1, 1, 0, 1, 4e6); MAPL.cam.position.z = 2e6;   // far away: every sphere is seen straight on, at any zoom
  MAPL.tone = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: { t: { value: null } }, depthTest: false, depthWrite: false,
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `uniform sampler2D t; varying vec2 vUv; ${OUT_GLSL}
      void main() { vec3 c = texture2D(t, vUv).rgb; gl_FragColor = vec4(toSRGB(shoulder(c * 0.8)) + vec3(0.0196, 0.0118, 0.0392) * 0.0, 1.0); }` }));
  MAPL.tone.frustumCulled = false; MAPL.tscene = new THREE.Scene(); MAPL.tscene.add(MAPL.tone); MAPL.tcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
}
function maplItem(b) {
  let it = MAPL.items.get(b); if (it && it.S === S) return it;
  if (it) maplDrop(it);
  const g = new THREE.Group(); it = { b, g, S };
  if (b.type === "Star") {
    const K = starKind(b), col = b._color || new THREE.Color(starColor(b));
    if (K.kind === 3) return null;
    it.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), starMaterial(b, col, K)); g.add(it.mesh);
    if (K.kind === 0 || K.kind === 4) { it.prom = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), promMaterial(col)); it.prom.material.uniforms.uSeed.value = (bodyHash(b) % 5000) / 100; it.prom.position.z = -1.01; g.add(it.prom); }
  } else {
    const ar = typeof atmRecipe === "function" ? atmRecipe(b) : null;
    it.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fragmentShader: MAPL_GLSL,
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      uniforms: { map: { value: null }, uTint: { value: new THREE.Color(1, 1, 1) }, uSpin: { value: 0 }, uGiant: { value: isGiant(b) ? 1 : 0 },
        uVeil: { value: new THREE.Vector4(...(ar ? ar.alb : [0, 0, 0]), ar ? Math.min(0.6, ar.cap * Math.min(1, ar.ms * 2.5)) : 0) } } }));   // thick air veils, but the surface still shows
    g.add(it.mesh);
  }
  MAPL.scene.add(g); MAPL.items.set(b, it); MAPL.gen = (MAPL.gen || 0) + 1; return it;   // v0.9: a new picture: its shaders are compiled before the next live draw (v0.90.2: only when one is really added)
}
function maplDrop(it) { MAPL.scene.remove(it.g); it.g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); MAPL.items.delete(it.b); }
function maplWanted() { return MAPMODE && S && QUALITY !== PRESETS.low && !SOFT_GL_MAP; }
const SOFT_GL_MAP = typeof SOFT_GL !== "undefined" && SOFT_GL && !/[?&]maplive=1/.test(location.search);   // no graphics card: keep the still pictures
function maplTick() {
  const want = maplWanted(), svg = $("smapSvg");
  if (want !== MAPL.on) {
    MAPL.on = want; document.body.classList.toggle("maplive", want);
    $("scene").style.visibility = want || !MAPMODE ? "" : "hidden";
    labels.domElement.style.visibility = "";                                  // the 3D names belong to the 3D view only
    if (!want) { MAPL.shown = false; if (svg) svg.classList.remove("live"); for (const it of [...MAPL.items.values()]) maplDrop(it); return; }
  }
  if (!want || !svg) return;
  // every frame: the map's SVG is rebuilt when pictures arrive, so its "live" mark and the hidden 3D names are re-checked here
  if (labels.domElement.style.visibility !== "hidden") labels.domElement.style.visibility = "hidden";
  maplInit();
  if (MAPL.shownS !== S) { MAPL.shownS = S; MAPL.shown = false; }       // a new system: its pictures may wait once
  for (const it of [...MAPL.items.values()]) if (it.S !== S) maplDrop(it);
  const W = renderer.domElement.clientWidth, H = renderer.domElement.clientHeight;
  MAPL.cam.left = 0; MAPL.cam.right = W; MAPL.cam.top = H; MAPL.cam.bottom = 0; MAPL.cam.updateProjectionMatrix();
  const spinOn = $("vSpin").checked, seen = new Set();
  for (const e of SMAP.items || []) {
    const b = e.b; if (!b) continue;
    const m = e.el.getScreenCTM(); if (!m) continue;
    const r = +e.el.dataset.r * m.a, x = m.e, y = H - m.f;
    const it = maplItem(b); if (!it) continue; seen.add(b);
    it.g.position.set(x, y, 0); it.g.scale.setScalar(Math.max(r, 0.5)); it.g.visible = r > 0.6 && x > -r && x < W + r && y > -r && y < H + r;
    if (b.type === "Star" && it.prom && it.g.visible && r > 12) STAR_ANIM.on = true;
    if (b.type !== "Star") {
      const u = it.mesh.material.uniforms, bu = b._mesh.material.uniforms;
      if (bu.map.value !== u.map.value) u.map.value = bu.map.value; u.uTint.value.copy(bu.uTint.value);
      const P = b.rotationalPeriod; u.uSpin.value = spinOn && P ? ((simTime / 86400000) / P % 1) * 2 * Math.PI : 0;
      if (it.g.visible && r > 6) {                       // a sharper surface when zoomed in; a body on screen is never evicted
        const res = Math.min(2048, bakeRes(r * 2.4)); b._bakeSeen = performance.now();
        if (!BAKE.queue.length || res > (b._bakeRes || 0) * 1.9) bakeRequest(b, res);   // one at a time while panning, no churn
      }
    }
  }
  for (const [b, it] of MAPL.items) if (!seen.has(b)) it.g.visible = false;
  // v0.9: the live pictures wait until their shaders are compiled (the still pictures show meanwhile)
  { const key = "mapl:" + (MAPL.gen || 0), off = [];
    if (!warmed(key)) for (const it of MAPL.items.values()) if (!it.g.visible) { it.g.visible = true; off.push(it); }   // v0.90.3: the pictures off screen are compiled too (compile skips hidden ones)
    const a = warm(key, MAPL.scene, MAPL.cam), t = warm("maplt", MAPL.tscene, MAPL.tcam, [false]); for (const it of off) it.g.visible = false;
    // v0.90.2: only before the first live picture of a system is the live layer held back (the still pictures show).
    // Once shown it stays
    if (!a || !t) { if (!MAPL.shown || !t) { if (!MAPL.shown) { if (svg.classList.contains("live")) svg.classList.remove("live"); if (!$("scene").style.visibility) $("scene").style.visibility = "hidden"; } return; }
      // v0.90.3: once shown, the map is drawn every frame (a skipped draw after a resize left the canvas blank: the map went
      // dark for a moment while zooming). A picture whose shader is still compiling is left out until it is ready
      for (const it of MAPL.items.values()) if (it.g.visible && !(matReady(it.mesh.material) && (!it.prom || matReady(it.prom.material)))) it.g.visible = false; } }
  MAPL.shown = true;
  if (!svg.classList.contains("live")) svg.classList.add("live");
  if ($("scene").style.visibility) $("scene").style.visibility = "";
  if (FENCE.lag < 40) try { bakeTick(); } catch (e) {}   // v0.78.2: the live map's surfaces wait while the graphics card is behind, like 3D
  const pr = renderer.getPixelRatio(), dw = Math.round(W * pr), dh = Math.round(H * pr);
  if (!MAPL.rt || MAPL.rt.width !== dw || MAPL.rt.height !== dh) { if (MAPL.rt) MAPL.rt.dispose(); MAPL.rt = new THREE.WebGLRenderTarget(dw, dh, { type: THREE.HalfFloatType }); }
  const auto = renderer.autoClear; renderer.autoClear = true;
  renderer.setRenderTarget(MAPL.rt); renderer.setClearColor(0x000000, 1); renderer.render(MAPL.scene, MAPL.cam);
  renderer.setRenderTarget(null); MAPL.tone.material.uniforms.t.value = MAPL.rt.texture;
  const v = svg.getBoundingClientRect();                                   // only inside the map's own area
  renderer.setClearColor(0x05030a, 1); renderer.clear();
  renderer.setScissorTest(true); renderer.setScissor(v.left, H - v.bottom, v.width, v.height);
  renderer.render(MAPL.tscene, MAPL.tcam);
  renderer.setScissorTest(false); renderer.setClearColor(0x000000, 1); renderer.autoClear = auto; REDRAW = false;
}

// v0.72: the first switch to 3D for a system gets its shaders ready in the background (compileAsync) and shows a small
// "Preparing" card if that takes more than a moment, instead of a frozen frame
// v0.78.1: the 3D view opens behind a loading screen (the first time for each system, and again after a quality
// change). It stays until the 3D view can move smoothly: shaders compiled, the Milky Way drawn, the surfaces in view
// painted, and the graphics card caught up. Never longer than 8 seconds. Skip (or Esc) ends it at once
var PREP = { on: false, t0: 0, frames: 0, px0: 1, compiled: true, el: null, key: "", n: 0 };
// v0.9: the glow and final passes' shaders, compiled in the background once (for a texture and for the screen)
function warmPost() {
  if (warmed("post")) return true;
  if (!warmPost.sc) {
    const sc = warmPost.sc = new THREE.Scene(), seen = new Set(), add = m => { if (m && m.isMaterial && !seen.has(m)) { seen.add(m); const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); q.frustumCulled = false; sc.add(q); } };
    for (const p of composer.passes) for (const k of Object.keys(p)) { const v = p[k]; if (Array.isArray(v)) v.forEach(add); else add(v); if (v && v.material) add(v.material); }
  }
  return warm("post", warmPost.sc, camera, [true, false]);
}
function prep3D() {
  if (!S || S._ready3d || MAPMODE) return; S._ready3d = true;
  let ov = PREP.el;
  if (!ov) {
    ov = PREP.el = document.createElement("div"); ov.id = "prep3d"; ov.setAttribute("role", "status");
    ov.innerHTML = `<div class="box"><div class="orb"><i></i></div><b>Preparing the 3D orrery</b><span></span><div class="bar"><i></i></div><em>Compiling shaders</em><button class="btn">Skip</button></div>`;
    ov.querySelector("button").onclick = () => prepEnd();
    document.body.appendChild(ov);
  }
  ov.querySelector("span").textContent = S.sys.name || "";
  const now = performance.now();
  Object.assign(PREP, { on: true, t0: now, frames: 0, px0: 1, compiled: false });
  FENCE.calm = Math.max(FENCE.calm || 0, now + 10000); WORK.hold = 0; WORK.scale = Math.max(WORK.scale, 0.5);
  ov.querySelector(".bar i").style.width = "4%"; ov.querySelector("em").textContent = "Compiling shaders";
  ov.classList.add("on");
  PREP.compiled = false; PREP.key = "scene:" + (++PREP.n);              // v0.9: compiled as the composer draws it (into a texture)
  warm(PREP.key, scene, camera, [true]); warmPost();
}
function prepPixels() {                                     // surface pixels still to paint
  let n = 0; for (const j of BAKE.queue) n += (j.res / 2 - j.y) * j.res * (j.normal && j.pass === 0 ? 2 : 1); return n;
}
function prepTick(now) {                                    // called for each drawn 3D frame while the screen is up
  if (!PREP.on) return;
  if (!PREP.compiled && warmed(PREP.key) && warmPost()) PREP.compiled = true;
  PREP.frames++;
  const skyLeft = SKY.rt && !SKY.ready && SKY.y >= 0, sky = skyLeft ? SKY.y / (SKY.W / 2) : 1;
  const px = prepPixels(); PREP.px0 = Math.max(PREP.px0, px); const surf = 1 - px / PREP.px0;
  const ready = PREP.compiled && !skyLeft && !BAKE.queue.length && PREP.frames >= 8 && FENCE.n <= 1;
  const f = Math.min(1, (PREP.compiled ? 0.25 : 0.05) + 0.3 * sky + 0.35 * surf + 0.1 * Math.min(1, PREP.frames / 8));
  const ov = PREP.el; ov.querySelector(".bar i").style.width = Math.round(f * 100) + "%";
  ov.querySelector("em").textContent = !PREP.compiled ? "Compiling shaders" : skyLeft ? "Drawing the Milky Way" : BAKE.queue.length ? "Painting surfaces" : "Almost ready";
  if (ready || (now - PREP.t0 > 8000 && PREP.compiled) || now - PREP.t0 > 40000) prepEnd();   // v0.9: never shown away while shaders still compile
}
function prepEnd() {
  if (!PREP.on) return; PREP.on = false; FENCE.calm = Math.max(FENCE.calm || 0, performance.now() + 1500);
  if (PREP.el) PREP.el.classList.remove("on");
}
addEventListener("keydown", e => { if (PREP.on && e.key === "Escape") prepEnd(); });
