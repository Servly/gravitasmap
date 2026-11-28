// v0.99.29: SC FLIGHT (experimental). While the game says supercruise, the map shows an ESTIMATED ship (a cube on the 3D map, a square on the system map)
// moving along the route from the start to the target, and a small report compares the estimate with the real flight (Entry to Exit).
// Words on screen are the game's own: ship, start, target, route. Everything modelled here is an estimate and is called one.
// The route follows the road logic of research/sc-route: the centre is the primary star, a ROUNDABOUT (kavsak) ring of one gate per province (a planet)
// sits on the star's keepout clearance (kacinma bolgesi), districts (moons) hang on their province, and a flight takes the shortest road.
// Time model (two equations, research/sc-route/video/model_eq2.py): without SCO and with a short SCO burst at the start.
const SCF_P = {
  K: [0.22, 0.13, 0.094], G: 0.0145, R0: 8.1, VMAX: 2001, VMAXS: 3300, KA: 0.094, DEND: 10, D0: 1,
  SCO: [[0, 8], [0.6, 26], [1, 70], [1.4, 109], [2, 184], [2.6, 277], [3.8, 300], [3000, 300]],
  EXPRESS: 600
};
const SCF = { fl: null, reps: [], sco: 0, hidden: false, el: null, cube: null, line: null, lineN: 0, err: false, rt: 0, lastSig: "" };
try { SCF.reps = JSON.parse(localStorage.getItem("gvScf") || "[]").slice(-30); } catch (e) { SCF.reps = []; }
const scfSave = () => { try { localStorage.setItem("gvScf", JSON.stringify(SCF.reps.slice(-30))); } catch (e) {} };
const scfDur = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const scfLs = v => v >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1);

// ---- the model: distance covered by the ship, second by second, in ls (1 c = 1 ls per s) -------------------------------
function scfSim(D, kind, o) {
  const P = SCF_P, dt = 0.05, t0 = o && o.t0 || 0, s0 = o && o.s0 || 0, arr = [s0];
  let s = s0, t = t0, n = 0;
  if (!(D > P.DEND * 1.5)) return { T: 0, D, arr, at: () => 0, v: () => 0 };
  while (D - s > P.DEND && t < 4000) {
    let v;
    if (kind === "B" && t <= o.Tb) v = scfCurve(t);
    else if (kind === "B") v = Math.min(P.K[1] * (P.D0 + s), P.KA * (D - s), P.VMAXS);
    else v = Math.min(P.R0 * o.r * Math.exp(P.G * t), P.VMAX, o.K * ((o.dd0 != null ? o.dd0 : P.D0) + s - s0), o.K * (D - s));
    s += Math.max(v, 1e-4) * dt; t += dt; n++;
    if (n % 5 === 0) arr.push(s);
  }
  arr.push(s);
  const at = x => { const q = Math.max(0, x - t0) / 0.25, i = Math.floor(q); if (i >= arr.length - 1) return arr[arr.length - 1]; return arr[i] + (arr[i + 1] - arr[i]) * (q - i); };
  return { T: t, D, arr, at, v: x => (at(x + 0.5) - at(Math.max(t0, x - 0.5))) / (x - t0 < 0.5 ? x - t0 + 0.5 : 1) };
}
function scfCurve(t) {
  const c = SCF_P.SCO; if (t <= 0) return c[0][1];
  for (let i = 1; i < c.length; i++) if (t <= c[i][0]) return c[i - 1][1] + (c[i][1] - c[i - 1][1]) * (t - c[i - 1][0]) / (c[i][0] - c[i - 1][0]);
  return c[c.length - 1][1];
}
// all the equations for one distance: A is without SCO (K 0.13, and the fast and slow ends), B is with a burst of 3, 4 or 5 s
function scfModels(D, r = 1) {
  const K = SCF_P.K;
  return { a: scfSim(D, "A", { K: K[1], r }), lo: scfSim(D, "A", { K: K[0], r }), hi: scfSim(D, "A", { K: K[2], r }), b3: scfSim(D, "B", { Tb: 3 }), b4: scfSim(D, "B", { Tb: 4 }), b5: scfSim(D, "B", { Tb: 5 }) };
}
const scfEst = m => ({ a: m.a.T, lo: m.lo.T, hi: m.hi.T, b3: m.b3.T, b4: m.b4.T, b5: m.b5.T });

// ---- the roads (true positions, ls) ---------------------------------------------------------------------------------
function scfPlanetOf(b) {                              // the province (planet) a district (moon) hangs on, or null for a province itself
  let id = S.parentOf.get(b.bodyId);
  while (id !== undefined && id !== null) { const q = S.byId.get(id); if (q && q.type === "Planet") return q.bodyId; id = S.parentOf.get(id); }
  return null;
}
function scfGraph(tMs) {
  if (!S || !S.main || S.stars.length !== 1) return null;                          // one primary star only: more stars, no roads (a straight route)
  const W = worldAt(tMs), pos = id => { const p = W.get(id); return p ? [p.x / LS_MM, p.y / LS_MM, p.z / LS_MM] : null; };
  const N = new Map(), E = [], star = S.main, sp = pos(star.bodyId);
  const belt = (star.belts || []).reduce((m, x) => Math.max(m, x.outerRadius / 1e6), 0);
  const RING = Math.max(3 * star._r, belt) / LS_MM;
  N.set("S", { id: "S", kind: "hub", pos: sp, body: star });
  const provinces = [], districts = [];
  for (const b of S.bodies) {
    if (b.type !== "Planet" || !pos(b.bodyId)) continue;
    const par = scfPlanetOf(b), nd = { id: "p" + b.bodyId, kind: par == null ? "province" : "district", pos: pos(b.bodyId), body: b, parent: par };
    N.set(nd.id, nd); (par == null ? provinces : districts).push(nd);
  }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const edge = (a, b, len, kind) => E.push({ a, b, len, kind });
  for (const p of provinces) {                                                     // the roundabout: a gate on the ring in the direction of each province
    const v = [p.pos[0] - sp[0], p.pos[1] - sp[1], p.pos[2] - sp[2]], n = Math.hypot(...v) || 1, u = v.map(x => x / n);
    const g = { id: "g" + p.body.bodyId, kind: "gate", pos: [sp[0] + u[0] * RING, sp[1] + u[1] * RING, sp[2] + u[2] * RING], dir: u, of: p };
    N.set(g.id, g); p.gate = g; edge(g.id, p.id, dist(g.pos, p.pos), "spoke");
  }
  for (let i = 0; i < provinces.length; i++) for (let j = i + 1; j < provinces.length; j++) {
    const a = provinces[i], b = provinces[j], ga = a.gate, gb = b.gate;
    const c = Math.max(-1, Math.min(1, ga.dir[0] * gb.dir[0] + ga.dir[1] * gb.dir[1] + ga.dir[2] * gb.dir[2]));
    edge(ga.id, gb.id, RING * Math.acos(c), "ring");
    const d = dist(a.pos, b.pos); if (d <= SCF_P.EXPRESS) edge(a.id, b.id, d, "express");   // optional shortcuts between close provinces
  }
  for (const m of districts) {
    const host = N.get("p" + m.parent); if (!host) continue;
    edge(host.id, m.id, dist(host.pos, m.pos), "local");
    for (const o of districts) if (o.parent === m.parent && o.id > m.id) edge(m.id, o.id, dist(m.pos, o.pos), "local");
  }
  return { N, E, RING, sp };
}
function scfRoad(G, fromBody, toBody) {                                           // shortest road, node ids from start to target, or null
  const a = fromBody.bodyId === S.main.bodyId ? "S" : "p" + fromBody.bodyId, z = toBody.bodyId === S.main.bodyId ? "S" : "p" + toBody.bodyId;
  if (!G.N.has(a) || !G.N.has(z) || a === z) return null;
  const adj = new Map();                                                           // the centre (the star) is a place only when it is the start or the target: never a way through
  const edges = a === "S" || z === "S" ? G.E.concat([...G.N.values()].filter(n => n.kind === "gate").map(g => ({ a: "S", b: g.id, len: G.RING, kind: "centre" }))) : G.E;
  for (const e of edges) { (adj.get(e.a) || adj.set(e.a, []).get(e.a)).push([e.b, e.len]); (adj.get(e.b) || adj.set(e.b, []).get(e.b)).push([e.a, e.len]); }
  const dist = new Map([[a, 0]]), prev = new Map(), done = new Set();
  for (;;) {
    let u = null, du = Infinity; for (const [k, v] of dist) if (!done.has(k) && v < du) { u = k; du = v; }
    if (u === null) return null; if (u === z) break; done.add(u);
    for (const [w, l] of adj.get(u) || []) if (!(dist.has(w) && dist.get(w) <= du + l)) { dist.set(w, du + l); prev.set(w, u); }
  }
  const path = [z]; while (path[0] !== a) path.unshift(prev.get(path[0]));
  return path;
}

// ---- events from the journal (called by syncLine) ----------------------------------------------------------------------
function scfEvent(j, replay) {
  const ev = j.event;
  if (ev === "SupercruiseEntry") {
    if (APP_SMAP) return;
    const a = SYNC.at || {};
    SCF.fl = { t0: Date.parse(j.timestamp) || Date.now(), sys: j.StarSystem || SYNC.here, from: a.bodyId != null ? a.bodyId : YAH && YAH.lastB ? YAH.lastB.bodyId : null, live: !replay, bt: null, sig: "", fixes: [] };
    SCF.hidden = false; return;
  }
  if (!SCF.fl) return;
  if (ev === "StartJump" && j.JumpType !== "Hyperspace") return;
  if (ev === "StartJump" || ev === "FSDJump" || ev === "CarrierJump" || ev === "Location") { SCF.fl = null; scfHideMarks(); scfRepDraw(true); return; }
  if (ev === "SupercruiseExit") scfEnd(j, replay);
}
function scfEnd(j, replay) {
  const fl = SCF.fl; SCF.fl = null; scfHideMarks();
  if (!fl || replay || !S || !fl.bt) { scfRepDraw(true); return; }
  const tEnd = Date.parse(j.timestamp) || Date.now(), b = fl.bt;
  const eb = j.BodyType === "Station" ? b.to : S.byId.get(+j.BodyID) || null;
  let D = b.D;
  try { if (eb && eb !== b.to) { const W = worldAt(fl.t0), p = W.get(b.from.bodyId), q = W.get(eb.bodyId); D = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) / LS_MM; } } catch (e) {}
  const R = { sys: fl.sys, t0: fl.t0, t1: tEnd, actual: (tEnd - fl.t0) / 1000, from: shortName(b.from, S.sys.name), to: eb ? shortName(eb, S.sys.name) : String(j.Body || "?"), station: j.BodyType === "Station" ? jl(j, "Body") : "", dist: D, est: scfEst(scfModels(D)), fix: fl.fixes.slice(), sco: SCF.sco };
  SCF.reps.push(R); SCF.reps = SCF.reps.slice(-30); scfSave(); scfRepDraw(true);
}

// ---- building the flight once the map knows the start and the target ---------------------------------------------------------
function scfBuild(fl) {
  if (!S || !syncViewing() || String(S.sys.name).toLowerCase() !== String(fl.sys || "").toLowerCase()) return null;
  const from = fl.from != null ? S.byId.get(+fl.from) : null, tg = typeof tgtResolve === "function" ? tgtResolve() : null, to = tg && tg.b ? tg.b : null;
  if (!from || !to || from === to) return null;
  const sig = `${from.bodyId}>${to.bodyId}`; if (fl.bt && fl.sig === sig) return fl.bt;
  const now = Date.now(), W = worldAt(now), p = W.get(from.bodyId), q = W.get(to.bodyId);
  const D = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) / LS_MM;
  let path = null; try { const G = scfGraph(now); path = G ? scfRoad(G, from, to) : null; fl.G = G; } catch (e) { path = null; }
  fl.sig = sig; fl.bt = { from, to, toName: tg.name || shortName(to, S.sys.name), D, m: scfModels(D), path, G: fl.G || null };
  fl.fixes = []; return fl.bt;
}
// the latitude and longitude the game gives near a body: a real position. At the target the ship is there; beside another body the route bends through it
function scfFixCheck(fl, bt) {
  const L = SYNC.live; if (!L || !L.body) return;
  const x = S.bodies.find(o => syncSame(o.name, L.body)); if (!x) return;
  const age = (Date.now() - fl.t0) / 1000;
  if (x === bt.from && age < 120) return;
  if (fl.fixes.some(f => f.id === x.bodyId)) return;
  fl.fixes.push({ id: x.bodyId, name: shortName(x, S.sys.name), at: Math.round(age), est: Math.round(100 * Math.min(1, bt.m.a.at(age) / bt.D)) });
  if (x === bt.to) { bt.arrived = true; return; }
  if (x === bt.from) return;
  const W = worldAt(Date.now()), p = W.get(x.bodyId), q = W.get(bt.to.bodyId), D2 = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) / LS_MM;
  const s0 = Math.max(0, bt.D - D2);
  bt.leg2 = { via: x, t: age, D: D2, s0, m: scfSim(s0 + D2, "A", { K: SCF_P.K[1], r: 1, s0, t0: age, dd0: 10 }), path: null };
  try { const G = bt.G || scfGraph(Date.now()); bt.leg2.path = G ? scfRoad(G, x, bt.to) : null; if (G && !bt.path1) bt.path1 = scfRoad(G, bt.from, x); } catch (e) {}
}
// where along the route the ship is estimated to be: 0..1, and the model that tells it
function scfProgress(fl, bt) {
  const age = (Date.now() - fl.t0) / 1000;
  if (bt.arrived) return { f: 1, age, v: 0, T: bt.m.a.T, left: 0, model: "a" };
  const M = [bt.m.a, bt.m.b3, bt.m.b4, bt.m.b5][SCF.sco === 3 ? 1 : SCF.sco === 4 ? 2 : SCF.sco === 5 ? 3 : 0];
  if (bt.leg2) {
    const l = bt.leg2, m = l.m, f2 = Math.min(1, Math.max(0, (m.at(age) - l.s0) / Math.max(l.D, 1e-6)));
    return { f: f2, pos: f2, age, v: m.v(age), T: m.T, left: Math.max(0, m.T - age), leg2: true };
  }
  return { f: Math.min(1, M.at(age) / bt.D), age, v: M.v(age), T: M.T, left: Math.max(0, M.T - age) };
}

// ---- display ------------------------------------------------------------------------------------------------------------------
function scfV3(b) { const v = new THREE.Vector3(); b._obj.getWorldPosition(v); return v; }
// 3D: the route through the bodies' own places in the view; a gate sits on a ring around the star, between the star and its province
function scfPoints3(bt, path, G) {
  const out = []; if (!path || !G) { out.push(scfV3(bt.from), scfV3(bt.to)); return out; }
  const sd = scfV3(S.main); let rg = Infinity;
  for (const nd of G.N.values()) if (nd.kind === "province" && nd.body._obj) rg = Math.min(rg, scfV3(nd.body).distanceTo(sd));
  rg = isFinite(rg) ? rg * 0.5 : 1;
  const disp = id => {
    const nd = G.N.get(id);
    if (nd.kind === "hub") return sd.clone();
    if (nd.kind === "gate") return scfV3(nd.of.body).sub(sd).normalize().multiplyScalar(rg).add(sd);
    return scfV3(nd.body);
  };
  for (let i = 0; i < path.length; i++) {
    const nd = G.N.get(path[i]), p = disp(path[i]);
    if (i > 0 && nd.kind === "gate" && G.N.get(path[i - 1]).kind === "gate") {      // a stretch of the ring: an arc around the star
      const a = out[out.length - 1].clone().sub(sd), b = p.clone().sub(sd), ang = a.angleTo(b);
      for (let k = 1; k < 8; k++) { const t = k / 8, q = a.clone().multiplyScalar(Math.sin((1 - t) * ang) / Math.sin(ang || 1)).add(b.clone().multiplyScalar(Math.sin(t * ang) / Math.sin(ang || 1))); out.push(q.add(sd)); }
    }
    out.push(p);
  }
  return out;
}
function scfAlong(pts, f) {
  let L = 0; const seg = []; for (let i = 1; i < pts.length; i++) { const d = pts[i].distanceTo(pts[i - 1]); seg.push(d); L += d; }
  let r = Math.max(0, Math.min(1, f)) * L; for (let i = 0; i < seg.length; i++) { if (r <= seg[i] || i === seg.length - 1) return pts[i].clone().lerp(pts[i + 1], seg[i] ? Math.min(1, r / seg[i]) : 0); r -= seg[i]; }
  return pts[0].clone();
}
function scfMarks3() {
  if (!SCF.cube) {
    SCF.cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffd166, depthTest: false, transparent: true, opacity: 0.95 }));
    SCF.cube.renderOrder = 9; SCF.cube.frustumCulled = false; scene.add(SCF.cube);
    SCF.line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x4cc9f0, depthTest: false, transparent: true, opacity: 0.8 }));
    SCF.line.renderOrder = 8; SCF.line.frustumCulled = false; scene.add(SCF.line);
    SCF.dots = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0x4cc9f0, size: 4, sizeAttenuation: false, depthTest: false, transparent: true, opacity: 0.9 }));
    SCF.dots.renderOrder = 8; SCF.dots.frustumCulled = false; scene.add(SCF.dots);
  }
}
function scfHideMarks() {
  if (SCF.cube) { SCF.cube.visible = false; SCF.line.visible = false; SCF.dots.visible = false; }
  if (SCF.sq) SCF.sq.style.display = "none";
}
function scfElPos(b) {
  const g = document.querySelector(`#smapSvg .smo[data-id="${b.bodyId}"]`); if (!g) return null;
  const r = g.getBoundingClientRect(); return r.width || r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
}
// the bodies the route passes, for the system map: a gate or the centre is the star's place (the map has no ring)
function scfSeq2(from, to, path, G) {
  const seq = [from];
  if (path && G) for (const id of path) { const nd = G.N.get(id), b = nd.kind === "hub" || nd.kind === "gate" ? S.main : nd.body; if (seq[seq.length - 1] !== b) seq.push(b); }
  if (seq[seq.length - 1] !== to) seq.push(to);
  return seq;
}
const scfLen = pts => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return L; };
function scfMark2(bt, pr) {
  if (!SCF.sq) {
    SCF.sq = document.createElement("div"); SCF.sq.id = "scfSq"; SCF.sq.title = "Estimated ship (supercruise)";
    SCF.sq.innerHTML = '<svg id="scfSvg" width="100%" height="100%"><polyline id="scfPl" fill="none"/></svg><i id="scfBox"></i>'; document.body.appendChild(SCF.sq);
  }
  const l2 = bt.leg2, legs = l2 ? [[bt.from, l2.via, bt.path1], [l2.via, bt.to, l2.path]] : [[bt.from, bt.to, bt.path]];
  const parts = legs.map(([a, z, p]) => scfSeq2(a, z, p, bt.G).map(scfElPos).filter(Boolean));
  if (parts.some(q => q.length < 2)) { SCF.sq.style.display = "none"; return; }
  const want = parts[0].concat(parts[1] ? parts[1].slice(1) : []), L = scfLen(want), x1 = parts[1] ? scfLen(parts[0]) / (L || 1) : 0;
  const seg = []; for (let i = 1; i < want.length; i++) seg.push(Math.hypot(want[i].x - want[i - 1].x, want[i].y - want[i - 1].y));
  let r = Math.max(0, Math.min(1, x1 + (1 - x1) * pr.f)) * L, pt = want[want.length - 1];
  for (let i = 0; i < seg.length; i++) { if (r <= seg[i] || i === seg.length - 1) { const t = seg[i] ? Math.min(1, r / seg[i]) : 0; pt = { x: want[i].x + (want[i + 1].x - want[i].x) * t, y: want[i].y + (want[i + 1].y - want[i].y) * t }; break; } r -= seg[i]; }
  SCF.sq.style.display = "block";
  $("scfPl").setAttribute("points", want.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "));
  $("scfBox").style.transform = `translate(${Math.round(pt.x)}px, ${Math.round(pt.y)}px) translate(-50%, -50%)`;
}
function scfTick(mapMode) {
  const fl = SCF.fl;
  if (!fl) { scfRepTick(); return; }
  try {
    const bt = scfBuild(fl);
    if (!bt) { scfHideMarks(); scfRepTick(); return; }
    scfFixCheck(fl, bt);
    const pr = scfProgress(fl, bt), l2 = bt.leg2;
    if (mapMode) {
      if (SCF.cube) { SCF.cube.visible = false; SCF.line.visible = false; SCF.dots.visible = false; }
      scfMark2(bt, pr);
    } else {
      if (SCF.sq) SCF.sq.style.display = "none";
      scfMarks3();
      let pts = scfPoints3(l2 ? { from: bt.from, to: l2.via } : bt, l2 ? bt.path1 : bt.path, bt.G), x1 = 0;
      if (l2) { const L1 = scfLen3(pts), q = scfPoints3({ from: l2.via, to: bt.to }, l2.path, bt.G); pts = pts.concat(q.slice(1)); x1 = L1 / (scfLen3(pts) || 1); }
      const pos = scfAlong(pts, x1 + (1 - x1) * pr.f);
      SCF.line.geometry.setFromPoints(pts); SCF.line.visible = true;
      const dense = []; for (let i = 1; i < pts.length; i++) for (let k = 0; k < 14; k++) dense.push(pts[i - 1].clone().lerp(pts[i], k / 14));
      dense.push(pts[pts.length - 1]); SCF.dots.geometry.setFromPoints(dense); SCF.dots.visible = true;
      SCF.cube.position.copy(pos); SCF.cube.visible = true;
      SCF.cube.scale.setScalar(Math.max(1e-6, camera.position.distanceTo(pos) * 0.012));
    }
    scfRepTick();
  } catch (e) { if (!SCF.err) { SCF.err = true; logErr(`sc flight: ${e.message}`); } scfHideMarks(); }
}
const scfLen3 = pts => { let L = 0; for (let i = 1; i < pts.length; i++) L += pts[i].distanceTo(pts[i - 1]); return L; };

// ---- the report ----------------------------------------------------------------------------------------------------------------
function scfRepEl() {
  if (SCF.el) return SCF.el;
  const d = document.createElement("div"); d.id = "scfRep"; d.style.display = "none";
  d.innerHTML = '<div class="sh"><b title="Supercruise flights: the ship is estimated, not read from the game">SC FLIGHT</b><span>estimated</span><button id="scfX" title="Hide this report until the next flight" aria-label="Hide the flight report">×</button></div><div id="scfBody"></div>' +
    '<div class="sf"><label title="Which equation moves the ship: no SCO, or a short SCO burst at the start. The game does not tell, so you say it.">SCO <select id="scfSco"><option value="0">off</option><option value="3">3 s</option><option value="4">4 s</option><option value="5">5 s</option></select></label>' +
    '<button id="scfCopy" title="Copy the flights as text, to compare them with your own times">Copy</button><button id="scfClr" title="Forget the saved flights (they are only in this browser)">Clear</button></div>';
  document.body.appendChild(d); SCF.el = d;
  $("scfX").onclick = () => { SCF.hidden = true; scfRepDraw(true); };
  $("scfSco").onchange = e => { SCF.sco = +e.target.value; scfRepDraw(true); };
  $("scfCopy").onclick = () => { const t = scfText(); try { navigator.clipboard.writeText(t); toast("Flights copied"); } catch (e) { toast("Could not copy"); } };
  $("scfClr").onclick = () => { SCF.reps = []; scfSave(); scfRepDraw(true); };
  return d;
}
function scfTimes(e) { return `${scfDur(e.a)} (${scfDur(e.lo)} to ${scfDur(e.hi)})`; }
function scfRepHtml() {
  const fl = SCF.fl, bt = fl && fl.bt; let h = "";
  if (fl) {
    if (bt) {
      const pr = scfProgress(fl, bt), e = scfEst(bt.m);
      h += `<div class="sr"><b>${esc(shortName(bt.from, S.sys.name))} → ${esc(bt.toName)}</b></div>` +
        `<div class="sr">Distance <b>${scfLs(bt.D)} ls</b> · elapsed <b>${scfDur(pr.age)}</b></div>` +
        `<div class="sr">Estimated total <b>${scfTimes(e)}</b></div>` +
        `<div class="sr">With a short SCO burst (3, 4, 5 s): <b>${scfDur(e.b3)} · ${scfDur(e.b4)} · ${scfDur(e.b5)}</b></div>` +
        `<div class="sr">Estimated now: <b>${Math.round(100 * (pr.leg2 ? pr.pos : pr.f))} %</b> · about <b>${scfLs(pr.v)} c</b> · arrival in about <b>${scfDur(pr.left)}</b>${SCF.sco ? ` (SCO ${SCF.sco} s)` : ""}</div>`;
      if (fl.fixes.length) h += `<div class="sr fx">Fix: ${fl.fixes.map(f => `${esc(f.name)} at ${scfDur(f.at)} (estimate said ${f.est} %)`).join(", ")}</div>`;
    } else h += `<div class="sr"><b>In supercruise</b> · elapsed ${scfDur((Date.now() - fl.t0) / 1000)}</div><div class="sr dim">Set a target in the game to see the estimate.</div>`;
  }
  const L = SCF.reps.slice(-4).reverse();
  if (L.length) h += `<div class="sl">${fl ? "Last flights" : "Flights"}</div>` + L.map(r => {
    const m = [r.est.a, r.est.b3, r.est.b4, r.est.b5][r.sco === 3 ? 1 : r.sco === 4 ? 2 : r.sco === 5 ? 3 : 0], df = r.actual ? Math.round(100 * (m - r.actual) / r.actual) : 0;
    return `<div class="sr"><b>${esc(r.from)} → ${esc(r.station || r.to)}</b> · ${scfLs(r.dist)} ls<br>SC time <b>${scfDur(r.actual)}</b> · estimate ${scfDur(m)} (${df > 0 ? "+" : ""}${df} %)${r.sco ? ` · SCO ${r.sco} s` : ""}</div>`;
  }).join("");
  return h;
}
function scfText() {
  return "GRAVITAS SC flights (estimated)\n" + SCF.reps.map(r => {
    const t = ts => new Date(ts).toISOString().slice(11, 19);
    return `${r.sys} | start ${r.from} | target ${r.station || r.to} | ${r.dist.toFixed(1)} ls | SC ${t(r.t0)} to ${t(r.t1)} UTC = ${scfDur(r.actual)} (${Math.round(r.actual)} s) | estimate no SCO ${Math.round(r.est.a)} s (${Math.round(r.est.lo)} to ${Math.round(r.est.hi)}) | SCO 3/4/5 s: ${Math.round(r.est.b3)}/${Math.round(r.est.b4)}/${Math.round(r.est.b5)} s${r.sco ? ` | SCO marked ${r.sco} s` : ""}${r.fix && r.fix.length ? ` | fix ${r.fix.map(f => `${f.name}@${f.at}s`).join(",")}` : ""}`;
  }).join("\n");
}
function scfRepDraw(force) {
  if (APP_SMAP || (typeof PFULL !== "undefined" && PFULL)) return;
  const el = scfRepEl(), on = SYNC.on && !SCF.hidden && (SCF.fl || SCF.reps.length);
  if (!on) { el.style.display = "none"; return; }
  const html = scfRepHtml(); if (force || SCF.lastSig !== html) { SCF.lastSig = html; $("scfBody").innerHTML = html; }
  if ($("scfSco").value !== String(SCF.sco)) $("scfSco").value = String(SCF.sco);
  el.style.display = "block";
}
function scfRepTick() { const n = performance.now(); if (n - SCF.rt < 500) return; SCF.rt = n; scfRepDraw(false); }
// the test door: only with ?scftest=1 in the address (nothing else ever sees it)
if (/[?&]scftest=1(&|$)/.test(location.search)) window.__scf = { SCF, SYNC, scfEvent, scfModels, scfGraph, scfRoad, scfBuild, scfRepDraw, S: () => S, tgtResolve: () => tgtResolve(), YAH };
