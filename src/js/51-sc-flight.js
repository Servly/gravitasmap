// v0.99.30: SC FLIGHT (experimental). While the game says supercruise and Sync is on, the map shows the ROUTE from the start to the target:
// ONE ARC (never a straight line) lined with a corridor of neon green ">" chevrons, dim at the start and brighter toward the target; they drift slowly toward the target (a light, calm flow).
// The ship's own position is NOT shown: no file tells it. A small report keeps the estimated total time next to the real supercruise time (Entry to Exit).
// Words on screen are the game's own: ship, start, target, route. Everything modelled is called an estimate.
// Arc: 3D, in the plane of the start, the target and the primary star, bulging AWAY from the star (15 % of the chord), deeper when a body's keepout clearance
// (kacinma bolgesi) is in the way. 2D (the System map is a schematic): the same arc, bulging toward the EMPTY side, clear of every body and name.
// Time model (research/sc-route/video/model_eq2.py): without SCO (a range) and with a short SCO burst at the start; used only for the report.
const SCF_P = {
  K: [0.22, 0.13, 0.094], G: 0.0145, R0: 8.1, VMAX: 2001, VMAXS: 3300, KA: 0.094, DEND: 10, D0: 1,
  SCO: [[0, 8], [0.6, 26], [1, 70], [1.4, 109], [2, 184], [2.6, 277], [3.8, 300], [3000, 300]],
  SAG: 0.15, MAXC: 44, NMAX: 40, SP3: 46, COL: [0.22, 1, 0.53]
};
const SCF = { fl: null, reps: [], hidden: false, el: null, mesh: null, sq: null, err: false, rt: 0, lastSig: "", arc: null, arcT: 0, arcKey: "", arc2: null, arcT2: 0, arcKey2: "", paths: [] };
try { SCF.reps = JSON.parse(localStorage.getItem("gvScf") || "[]").slice(-30); } catch (e) { SCF.reps = []; }
const scfSave = () => { try { localStorage.setItem("gvScf", JSON.stringify(SCF.reps.slice(-30))); } catch (e) {} };
const scfDur = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const scfLs = v => v >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1);

// ---- the time model (for the report only) -----------------------------------------------------------------------------------
function scfCurve(t) {
  const c = SCF_P.SCO; if (t <= 0) return c[0][1];
  for (let i = 1; i < c.length; i++) if (t <= c[i][0]) return c[i - 1][1] + (c[i][1] - c[i - 1][1]) * (t - c[i - 1][0]) / (c[i][0] - c[i - 1][0]);
  return c[c.length - 1][1];
}
function scfSim(D, kind, o) {                                  // seconds to cover D ls (1 c = 1 ls per s): A without SCO, B with a burst of o.Tb seconds
  const P = SCF_P, dt = 0.05; let s = 0, t = 0;
  if (!(D > P.DEND * 1.5)) return 0;
  while (D - s > P.DEND && t < 4000) {
    const v = kind === "B" ? (t <= o.Tb ? scfCurve(t) : Math.min(P.K[1] * (P.D0 + s), P.KA * (D - s), P.VMAXS))
      : Math.min(P.R0 * Math.exp(P.G * t), P.VMAX, o.K * (P.D0 + s), o.K * (D - s));
    s += Math.max(v, 1e-4) * dt; t += dt;
  }
  return t;
}
const scfEst = D => ({ a: scfSim(D, "A", { K: SCF_P.K[1] }), lo: scfSim(D, "A", { K: SCF_P.K[0] }), hi: scfSim(D, "A", { K: SCF_P.K[2] }), b3: scfSim(D, "B", { Tb: 3 }), b4: scfSim(D, "B", { Tb: 4 }), b5: scfSim(D, "B", { Tb: 5 }) });

// ---- events from the journal (called by syncLine) ----------------------------------------------------------------------
function scfEvent(j, replay) {
  const ev = j.event;
  if (ev === "SupercruiseEntry") {
    if (APP_SMAP) return;
    const a = SYNC.at || {};
    SCF.fl = { t0: Date.parse(j.timestamp) || Date.now(), sys: j.StarSystem || SYNC.here, from: a.bodyId != null ? a.bodyId : YAH && YAH.lastB ? YAH.lastB.bodyId : null, bt: null, sig: "", shown: 0 };
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
  const R = { sys: fl.sys, t0: fl.t0, t1: tEnd, actual: (tEnd - fl.t0) / 1000, from: shortName(b.from, S.sys.name), to: eb ? shortName(eb, S.sys.name) : String(j.Body || "?"), station: j.BodyType === "Station" ? jl(j, "Body") : "", dist: D, est: scfEst(D) };
  SCF.reps.push(R); SCF.reps = SCF.reps.slice(-30); scfSave(); scfRepDraw(true);
}
// the start and the target, once the map knows them (the target comes from the game's own Destination)
function scfBuild(fl) {
  if (!S || !syncViewing() || String(S.sys.name).toLowerCase() !== String(fl.sys || "").toLowerCase()) return null;
  const from = fl.from != null ? S.byId.get(+fl.from) : null, tg = typeof tgtResolve === "function" ? tgtResolve() : null, to = tg && tg.b ? tg.b : null;
  if (!from || !to || from === to) return null;
  const sig = `${from.bodyId}>${to.bodyId}`; if (fl.bt && fl.sig === sig) { fl.bt.tg = tg; return fl.bt; }
  const W = worldAt(Date.now()), p = W.get(from.bodyId), q = W.get(to.bodyId), D = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) / LS_MM;
  fl.sig = sig; fl.shown = performance.now(); fl.bt = { tg, from, to, toName: tg.name || shortName(to, S.sys.name), D, est: scfEst(D) };
  return fl.bt;
}

// ---- the arc ----------------------------------------------------------------------------------------------------------------------
// a quadratic arc A-C-B: the control point C pushes the middle of the chord sideways, the arc's top is half way to C
const scfBez = (a, c, b, t) => { const u = 1 - t; return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1], u * u * a[2] + 2 * u * t * c[2] + t * t * b[2]]; };
function scfTable(a, c, b, n) {                          // points, cumulative length, total
  const P = [], cum = [0]; for (let i = 0; i <= n; i++) P.push(scfBez(a, c, b, i / n));
  for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2]));
  return { P, cum, L: cum[n] };
}
function scfAt(T, f) {                                    // the point and the direction at a fraction f of the arc's length
  const x = Math.max(0, Math.min(1, f)) * T.L; let j = 1; while (j < T.cum.length - 1 && T.cum[j] < x) j++;
  const s = T.cum[j] - T.cum[j - 1], t = s ? (x - T.cum[j - 1]) / s : 0, p = T.P[j - 1], q = T.P[j];
  const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], n = Math.hypot(...d) || 1;
  return { p: [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t], t: [d[0] / n, d[1] / n, d[2] / n] };
}
// the side away from 'away' (the star) and the sag: the first clean one among a few, else the least bad. pen(points) = how much of the arc is inside what it must avoid
function scfPick(a, b, away, pen, firstSide) {
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], c = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...c) || 1, u = c.map(x => x / L);
  let w = [m[0] - away[0], m[1] - away[1], m[2] - away[2]]; const wu = w[0] * u[0] + w[1] * u[1] + w[2] * u[2]; w = [w[0] - u[0] * wu, w[1] - u[1] * wu, w[2] - u[2] * wu];
  let wn = Math.hypot(...w);
  if (wn < 1e-9) { w = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; const d = w[0] * u[0] + w[1] * u[1] + w[2] * u[2]; w = [w[0] - u[0] * d, w[1] - u[1] * d, w[2] - u[2] * d]; wn = Math.hypot(...w); }
  const n = w.map(x => x / wn), side = firstSide || 1; let best = null;
  for (const f of [SCF_P.SAG, 0.22, 0.3, 0.4, 0.5, 0.65]) for (const sg of [side, -side]) {
    const sag = f * L * sg, ctrl = [m[0] + n[0] * 2 * sag, m[1] + n[1] * 2 * sag, m[2] + n[2] * 2 * sag], T = scfTable(a, ctrl, b, 24), p = pen(T.P);
    if (!best || p < best.p - 1e-9) best = { p, ctrl, T };
    if (p <= 0) return best;
  }
  return best;
}

// ---- 3D: the chevron corridor ------------------------------------------------------------------------------------------------------
function scfV3(b) { const v = new THREE.Vector3(); b._obj.getWorldPosition(v); return v; }
const SCF_SH = [[0, 1], [0.45, 1], [1, 0], [0.45, -1], [0, -1], [0.55, 0]];        // the outline of one ">" (x forward, y sideways)
function scfMesh3() {
  if (SCF.mesh) return SCF.mesh;
  const n = SCF_P.MAXC * 48, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), idx = new Uint16Array(SCF_P.MAXC * 72);
  for (let q = 0; q < SCF_P.MAXC * 12; q++) { const v = q * 4; idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], q * 6); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute("color", new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage)); g.setIndex(new THREE.BufferAttribute(idx, 1));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthTest: true, depthWrite: false, side: THREE.DoubleSide }));
  m.frustumCulled = false; m.renderOrder = 8; m.visible = false; scene.add(m); SCF.mesh = m; return m;
}
function scfObst3(bt) {                                   // the keepout spheres on the way: every other body (2 radii, a star 3), the start and the target and their parents left out
  const skip = new Set([bt.from.bodyId, bt.to.bodyId]);
  for (const b of [bt.from, bt.to]) { let id = S.parentOf.get(b.bodyId); while (id != null) { skip.add(id); id = S.parentOf.get(id); } }
  const out = []; for (const b of S.bodies) if (!skip.has(b.bodyId) && b._obj && b._r) { const c = scfV3(b); out.push({ c: [c.x, c.y, c.z], r: b._r * k(b) * (b.type === "Star" ? 3 : 2) }); }
  return out;
}
function scfArc3(bt, now) {
  const key = `${bt.from.bodyId}>${bt.to.bodyId}`;
  if (SCF.arc && SCF.arcKey === key && now - SCF.arcT < 250) return SCF.arc;
  const tgo = bt.tg && bt.tg.o && bt.tg.o.obj, a = scfV3(bt.from), b = tgo ? tgo.getWorldPosition(new THREE.Vector3()) : scfV3(bt.to), s = scfV3(S.main), obs = scfObst3(bt);
  const pen = P => { let t = 0; for (const p of P) for (const o of obs) { const d = Math.hypot(p[0] - o.c[0], p[1] - o.c[1], p[2] - o.c[2]); if (d < o.r) t += o.r - d; } return t; };
  const r = scfPick([a.x, a.y, a.z], [b.x, b.y, b.z], [s.x, s.y, s.z], pen, 1);
  SCF.arc = r.T; SCF.arcKey = key; SCF.arcT = now; return r.T;
}
const scfSm = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const scfLook = (f, low) => (0.3 + 0.7 * Math.pow(f, 1.2)) * (low ? 1 : scfSm(f / 0.1) * scfSm((1 - f) / 0.08));      // dim at the start, brighter toward the target, fading in and out at the two ends
function scfDraw3(bt, fade, time) {
  const T = scfArc3(bt, performance.now()), m = scfMesh3(), low = QUALITY === PRESETS.low, cam = camera.position, g = m.geometry, pos = g.attributes.position.array, col = g.attributes.color.array;
  const cv = new THREE.Vector3(); let px = 0, prev = null;                       // the arc's length on the screen, to choose how many chevrons
  for (let i = 0; i <= 12; i++) { const f = scfAt(T, i / 12).p; cv.set(f[0], f[1], f[2]).project(camera); const q = [(cv.x * 0.5 + 0.5) * innerWidth, (0.5 - cv.y * 0.5) * innerHeight]; if (prev) px += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; }
  const N = Math.max(3, Math.min(SCF_P.NMAX, Math.round(px / SCF_P.SP3))), tf = Math.tan(camera.fov * DEG / 2) * 2 / innerHeight, C = SCF_P.COL;
  let v = 0; const ph = low ? 0 : (time / 2.4) % 1, cnt = low ? N : N + 1;        // the chevrons slide toward the target by one gap every 2.4 s
  for (let i = 0; i < cnt; i++) {
    const f = low ? (i + 0.5) / N : (i + ph) / N; if (f >= 1) continue;
    const at = scfAt(T, f), P = at.p, d = Math.hypot(cam.x - P[0], cam.y - P[1], cam.z - P[2]) || 1, wpp = d * tf, sz = 15 * wpp;
    const vw = [(cam.x - P[0]) / d, (cam.y - P[1]) / d, (cam.z - P[2]) / d], t = at.t;
    let ux = t[1] * vw[2] - t[2] * vw[1], uy = t[2] * vw[0] - t[0] * vw[2], uz = t[0] * vw[1] - t[1] * vw[0]; const un = Math.hypot(ux, uy, uz) || 1; ux /= un; uy /= un; uz /= un;
    const br = scfLook(f, low) * fade;
    for (let layer = 0; layer < 2; layer++) {
      const th = (layer ? 7 : 2.4) * wpp * 0.5, mul = layer ? 0.3 : 1;
      for (let e = 0; e < 6; e++) {
        const A = SCF_SH[e], B = SCF_SH[(e + 1) % 6], ax = (A[0] - 0.5) * sz * 1.2, ay = A[1] * sz, bx = (B[0] - 0.5) * sz * 1.2, by = B[1] * sz, dx = bx - ax, dy = by - ay, dl = Math.hypot(dx, dy) || 1, ox = -dy / dl * th, oy = dx / dl * th;
        const q4 = [[ax + ox, ay + oy], [ax - ox, ay - oy], [bx + ox, by + oy], [bx - ox, by - oy]];
        for (const q of q4) {
          pos[v * 3] = P[0] + t[0] * q[0] + ux * q[1]; pos[v * 3 + 1] = P[1] + t[1] * q[0] + uy * q[1]; pos[v * 3 + 2] = P[2] + t[2] * q[0] + uz * q[1];
          col[v * 3] = C[0] * br * mul; col[v * 3 + 1] = C[1] * br * mul; col[v * 3 + 2] = C[2] * br * mul; v++;
        }
      }
    }
  }
  g.setDrawRange(0, Math.round(v * 1.5)); g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; m.visible = true;
}

// ---- 2D: the same corridor on the System map, in the empty space ---------------------------------------------------------------------
function scfElPos(b) {
  const g = document.querySelector(`#smapSvg .smo[data-id="${b.bodyId}"]`); if (!g) return null;
  const r = g.getBoundingClientRect(); return r.width || r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
}
function scfElPos2(bt) {                                   // the target: the station's own icon when it has one, else its body
  try { const tg = bt.tg; if (tg && tg.st && typeof yahMapEl === "function") { const e = yahMapEl(document, tg, tg.b); if (e) { const r = e.getBoundingClientRect(); if (r.width || r.height) return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; } } } catch (e) {}
  return scfElPos(bt.to);
}
function scfSq() {
  if (SCF.sq) return SCF.sq;
  const d = document.createElement("div"); d.id = "scfSq"; d.setAttribute("aria-hidden", "true");
  d.innerHTML = '<svg width="100%" height="100%"><g id="scfG"></g></svg>'; document.body.appendChild(d); SCF.sq = d;
  const g = $("scfG"); for (let i = 0; i < SCF_P.MAXC; i++) { const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", "M-.6 -1 L-.15 -1 L.4 0 L-.15 1 L-.6 1 L-.05 0 Z"); g.appendChild(p); SCF.paths.push(p); }
  return d;
}
function scfObst2(bt) {                                    // what the arc must keep out of: every body icon and every name on the map, but not the start or the target
  const a = scfElPos(bt.from), b = scfElPos(bt.to), out = [];
  for (const e of document.querySelectorAll("#smapSvg .smo, #smapSvg text, #smapSvg .smp, #smapSvg .sfm")) {
    const r = e.getBoundingClientRect(); if (!r.width && !r.height) continue;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if ((a && Math.hypot(cx - a.x, cy - a.y) < 46) || (b && Math.hypot(cx - b.x, cy - b.y) < 46)) continue;
    out.push([r.left - 7, r.top - 7, r.right + 7, r.bottom + 7]);
  }
  return out;
}
function scfDraw2(bt, fade, time) {
  const a = scfElPos(bt.from), b = scfElPos2(bt); if (!a || !b) { scfHideMarks(); return; }
  const d = scfSq(), now = performance.now(), A = [a.x, a.y, 0], B = [b.x, b.y, 0], key = `${bt.from.bodyId}>${bt.to.bodyId}`;
  if (!SCF.arc2 || SCF.arcKey2 !== key || now - SCF.arcT2 > 250) {
    const obs = scfObst2(bt), pen = P => { let t = 0; for (const p of P) for (const o of obs) if (p[0] > o[0] && p[0] < o[2] && p[1] > o[1] && p[1] < o[3]) t += 1; return t; };
    const S0 = scfElPos(S.main) || { x: a.x, y: a.y - 100 };
    const up = scfPick(A, B, [S0.x, S0.y, 0], pen, 1), dn = scfPick(A, B, [S0.x, S0.y, 0], pen, -1);       // either side: the emptier one wins, a tie goes below
    const r = up.p < dn.p ? up : dn.p < up.p ? dn : (up.ctrl[1] > dn.ctrl[1] ? up : dn);
    SCF.arc2 = { ctrl: r.ctrl }; SCF.arcKey2 = key; SCF.arcT2 = now;
  }
  const T = scfTable(A, SCF.arc2.ctrl, B, 24), chord = Math.hypot(B[0] - A[0], B[1] - A[1]), s = Math.max(9, Math.min(19, chord / 38)), N = Math.max(3, Math.min(SCF_P.NMAX, Math.round(T.L / (s * 2.7)))), low = QUALITY === PRESETS.low;
  d.classList.toggle("lowq", low);
  const ph = low ? 0 : (time / 2.4) % 1, cnt = low ? N : N + 1;
  for (let i = 0; i < SCF.paths.length; i++) {
    const p = SCF.paths[i], f = low ? (i + 0.5) / N : (i + ph) / N;
    if (i >= cnt || f >= 1) { p.style.display = "none"; continue; }
    const at = scfAt(T, f), br = scfLook(f, low) * fade;
    p.style.display = ""; p.setAttribute("transform", `translate(${at.p[0].toFixed(1)} ${at.p[1].toFixed(1)}) rotate(${(Math.atan2(at.t[1], at.t[0]) * 180 / Math.PI).toFixed(1)}) scale(${s.toFixed(2)})`); p.style.opacity = br.toFixed(2);
  }
  d.style.display = "block";
}
function scfHideMarks() {
  if (SCF.mesh) SCF.mesh.visible = false;
  if (SCF.sq) SCF.sq.style.display = "none";
  SCF.arc = null; SCF.arc2 = null;
}
function scfTick(mapMode) {
  const fl = SCF.fl;
  if (!fl) { scfRepTick(); return; }
  try {
    const vr = $("vRoute"); if (vr && !vr.checked) { scfHideMarks(); scfRepTick(); return; }                    // switched off in the View menu
    const bt = scfBuild(fl);
    if (!bt) { scfHideMarks(); scfRepTick(); return; }
    const time = performance.now() / 1000, fade = Math.min(1, (performance.now() - fl.shown) / 900);
    if (mapMode) { if (SCF.mesh) SCF.mesh.visible = false; scfDraw2(bt, fade, time); }
    else { if (SCF.sq) SCF.sq.style.display = "none"; scfDraw3(bt, fade, time); }
    scfRepTick();
  } catch (e) { if (!SCF.err) { SCF.err = true; logErr(`sc flight: ${e.message}`); } scfHideMarks(); }
}

// ---- the report ----------------------------------------------------------------------------------------------------------------
function scfRepEl() {
  if (SCF.el) return SCF.el;
  const d = document.createElement("div"); d.id = "scfRep"; d.style.display = "none";
  d.innerHTML = '<div class="sh"><b title="Supercruise flights: the route is drawn from the start to the target, the times are estimates">SC FLIGHT</b><span>estimated</span><button id="scfX" title="Hide this report until the next flight" aria-label="Hide the flight report">×</button></div><div id="scfBody"></div>' +
    '<div class="sf"><button id="scfCopy" title="Copy the flights as text, to compare them with your own times">Copy</button><button id="scfClr" title="Forget the saved flights (they are only in this browser)">Clear</button></div>';
  document.body.appendChild(d); SCF.el = d;
  $("scfX").onclick = () => { SCF.hidden = true; scfRepDraw(true); };
  $("scfCopy").onclick = () => { const t = scfText(); try { navigator.clipboard.writeText(t); toast("Flights copied"); } catch (e) { toast("Could not copy"); } };
  $("scfClr").onclick = () => { SCF.reps = []; scfSave(); scfRepDraw(true); };
  return d;
}
const scfTimes = e => `${scfDur(e.a)} (${scfDur(e.lo)} to ${scfDur(e.hi)})`;
function scfRepHtml() {
  const fl = SCF.fl, bt = fl && fl.bt; let h = "";
  if (fl) {
    if (bt) {
      const e = bt.est;
      h += `<div class="sr"><b>${esc(shortName(bt.from, S.sys.name))} → ${esc(bt.toName)}</b></div>` +
        `<div class="sr">Distance <b>${scfLs(bt.D)} ls</b> · elapsed <b>${scfDur((Date.now() - fl.t0) / 1000)}</b></div>` +
        `<div class="sr">Estimated total <b>${scfTimes(e)}</b></div>` +
        `<div class="sr">With a short SCO burst (3, 4, 5 s): <b>${scfDur(e.b3)} · ${scfDur(e.b4)} · ${scfDur(e.b5)}</b></div>`;
    } else h += `<div class="sr"><b>In supercruise</b> · elapsed ${scfDur((Date.now() - fl.t0) / 1000)}</div><div class="sr dim">Set a target in the game to see the route.</div>`;
  }
  const L = SCF.reps.slice(-4).reverse();
  if (L.length) h += `<div class="sl">${fl ? "Last flights" : "Flights"}</div>` + L.map(r => {
    const df = r.actual ? Math.round(100 * (r.est.a - r.actual) / r.actual) : 0;
    return `<div class="sr"><b>${esc(r.from)} → ${esc(r.station || r.to)}</b> · ${scfLs(r.dist)} ls<br>SC time <b>${scfDur(r.actual)}</b> · estimate ${scfDur(r.est.a)} (${df > 0 ? "+" : ""}${df} %)</div>`;
  }).join("");
  return h;
}
function scfText() {
  return "GRAVITAS SC flights (estimated)\n" + SCF.reps.map(r => {
    const t = ts => new Date(ts).toISOString().slice(11, 19);
    return `${r.sys} | start ${r.from} | target ${r.station || r.to} | ${r.dist.toFixed(1)} ls | SC ${t(r.t0)} to ${t(r.t1)} UTC = ${scfDur(r.actual)} (${Math.round(r.actual)} s) | estimate no SCO ${Math.round(r.est.a)} s (${Math.round(r.est.lo)} to ${Math.round(r.est.hi)}) | SCO 3/4/5 s: ${Math.round(r.est.b3)}/${Math.round(r.est.b4)}/${Math.round(r.est.b5)} s`;
  }).join("\n");
}
function scfRepDraw(force) {
  if (APP_SMAP || (typeof PFULL !== "undefined" && PFULL)) return;
  const el = scfRepEl(), on = SYNC.on && !SCF.hidden && (SCF.fl || SCF.reps.length);
  if (!on) { el.style.display = "none"; return; }
  const html = scfRepHtml(); if (force || SCF.lastSig !== html) { SCF.lastSig = html; $("scfBody").innerHTML = html; }
  el.style.display = "block";
}
function scfRepTick() { const n = performance.now(); if (n - SCF.rt < 500) return; SCF.rt = n; scfRepDraw(false); }
// the test door: only with ?scftest=1 in the address (nothing else ever sees it)
if (/[?&]scftest=1(&|$)/.test(location.search)) window.__scf = { SCF, SYNC, scfEvent, scfBuild, scfRepDraw, scfEst, S: () => S, tgtResolve: () => tgtResolve(), YAH, camera, controls, scfV3 };
