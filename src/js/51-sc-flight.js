// v0.99.31: ROUTE ARROWS. When the game's target is a place in this system and the map knows where your ship is (docked, beside a body, or in supercruise
// after leaving it), the map draws ONE ARC from the start to the target, lined with neon green ">" chevrons: dim at the start, brighter toward the target,
// drifting slowly toward it. The ship's own position, speed and times are NOT shown: no file tells them. The arc is a fixed, simple curve (15 % of the chord):
// in 3D it bulges away from the primary star, on the System map (a schematic) it bulges down. It may pass over things.
// A second small thing: while a jump route is plotted, a flat ">>>" with the next system's name at the top of the System map.
// Words on screen are the game's own: ship, start, target, route.
const SCF_P = { SAG: 0.15, MAXC: 44, NMAX: 40, SP3: 46, SZ2: 11, COL: [0.22, 1, 0.53] };
const SCF_RM = matchMedia("(prefers-reduced-motion: reduce)");                     // a person who asks for less motion gets still arrows, no flow and no head turning
const SCF = { tg: null, stk: null, E: null, mesh: null, sq: null, jb: null, err: false, paths: [], jpaths: [], t0: 0, key: "", last: null, arc3: null };
try { localStorage.removeItem("gvScf"); } catch (e) {}                          // 0.99.29 and 0.99.30 kept flight reports here: gone

// ---- the start and the target ---------------------------------------------------------------------------------------------------
const scfSm = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const scfLook = (f, low) => (0.3 + 0.7 * Math.pow(f, 1.2)) * (low ? 1 : scfSm(f / 0.1) * scfSm((1 - f) / 0.08));      // dim at the start, brighter toward the target, fading in and out at the two ends
function scfEnds() {                                       // { a, b }: each { body, o (a station's 3D object), st, t (the map's own pick) } or null
  if (!SYNC.on || !S || !syncViewing()) return null;
  const tg = TGT && TGT.t; if (!tg || !tg.b) return null;
  let st = YAH.b ? { body: YAH.b, t: YAH.t } : YAH.ab ? { body: YAH.ab, t: null } : null;
  const now = performance.now(), stk = SCF.stk;
  if (st && st.t && st.t.o && st.t.o.obj) SCF.stk = { body: st.body, t: st.t, at: now };
  else if (st && stk && stk.body === st.body && now - stk.at < 6000) st = { body: stk.body, t: stk.t };      // the station's own place flickers away for a moment as the game's file updates: keep it
  if (st) SCF.last = st; else st = SCF.last && S.bodies.includes(SCF.last.body) ? SCF.last : null;    // in supercruise the last place stays the start
  if (!st) return null;
  const a = { body: st.body, o: st.t && st.t.o && st.t.o.obj ? st.t.o : null, st: st.t && st.t.st ? st.t.st : null, t: st.t };
  const b = { body: tg.b, o: tg.o && tg.o.obj ? tg.o : null, st: tg.st || null, t: tg };
  if (a.body === b.body && (a.st || null) === (b.st || null) && (a.o || null) === (b.o || null)) return null;      // already there
  return { a, b };
}

// ---- the arc ----------------------------------------------------------------------------------------------------------------------
// a quadratic arc A-C-B: its top is SAG x chord off the chord, on the side n
const scfBez = (a, c, b, t) => { const u = 1 - t; return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1], u * u * a[2] + 2 * u * t * c[2] + t * t * b[2]]; };
function scfTable(a, c, b, n) {                            // points, cumulative length, total
  const P = [], cum = [0]; for (let i = 0; i <= n; i++) P.push(scfBez(a, c, b, i / n));
  for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2]));
  return { P, cum, L: cum[n] };
}
function scfAt(T, f) {                                     // the point and the direction at a fraction f of the arc's length
  const x = Math.max(0, Math.min(1, f)) * T.L; let j = 1; while (j < T.cum.length - 1 && T.cum[j] < x) j++;
  const s = T.cum[j] - T.cum[j - 1], t = s ? (x - T.cum[j - 1]) / s : 0, p = T.P[j - 1], q = T.P[j];
  const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], n = Math.hypot(...d) || 1;
  return { p: [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t], t: [d[0] / n, d[1] / n, d[2] / n] };
}
// the control point: the chord's middle pushed sideways, away from 'away' (3D: the star), or down (2D: away = null)
function scfCtrl(a, b, away) {
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], c = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...c) || 1, u = c.map(x => x / L);
  let w = away ? [m[0] - away[0], m[1] - away[1], m[2] - away[2]] : [0, 1, 0];
  const wu = w[0] * u[0] + w[1] * u[1] + w[2] * u[2]; w = [w[0] - u[0] * wu, w[1] - u[1] * wu, w[2] - u[2] * wu];
  let wn = Math.hypot(...w);
  if (wn < 1e-6 * L) { w = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; const d = w[0] * u[0] + w[1] * u[1] + w[2] * u[2]; w = [w[0] - u[0] * d, w[1] - u[1] * d, w[2] - u[2] * d]; wn = Math.hypot(...w); }
  const sag = SCF_P.SAG * L;
  return [m[0] + w[0] / wn * 2 * sag, m[1] + w[1] / wn * 2 * sag, m[2] + w[2] / wn * 2 * sag];
}

// ---- 3D: the chevron corridor ------------------------------------------------------------------------------------------------------
const SCF_SH = [[0, 1], [0.45, 1], [1, 0], [0.45, -1], [0, -1], [0.55, 0]];        // the outline of one ">" (x forward, y sideways)
function scfV3(b) { const v = new THREE.Vector3(); b._obj.getWorldPosition(v); return v; }
function scfPos3(e) { const v = new THREE.Vector3(); (e.o ? e.o.obj : e.body._obj).getWorldPosition(v); return [v.x, v.y, v.z]; }
function scfMesh3() {
  if (SCF.mesh) return SCF.mesh;
  const n = SCF_P.MAXC * 48, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), idx = new Uint16Array(SCF_P.MAXC * 72);
  for (let q = 0; q < SCF_P.MAXC * 12; q++) { const v = q * 4; idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], q * 6); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute("color", new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage)); g.setIndex(new THREE.BufferAttribute(idx, 1));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthTest: true, depthWrite: false, side: THREE.DoubleSide }));
  m.frustumCulled = false; m.renderOrder = 8; m.visible = false; scene.add(m); SCF.mesh = m; return m;
}
function scfDraw3(E, fade, time) {
  const a = scfPos3(E.a), b = scfPos3(E.b), s = scfV3(S.main), T = scfTable(a, scfCtrl(a, b, [s.x, s.y, s.z]), b, 24);
  SCF.arc3 = T;
  const m = scfMesh3(), low = (QUALITY === PRESETS.low || SCF_RM.matches), cam = camera.position, g = m.geometry, pos = g.attributes.position.array, col = g.attributes.color.array;
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
        for (let k = 0; k < 4; k++) {                                                    // the four corners of this edge's strip, written straight into the buffer
          const lx = (k < 2 ? ax : bx) + (k % 2 ? -ox : ox), ly = (k < 2 ? ay : by) + (k % 2 ? -oy : oy), o = v * 3;
          pos[o] = P[0] + t[0] * lx + ux * ly; pos[o + 1] = P[1] + t[1] * lx + uy * ly; pos[o + 2] = P[2] + t[2] * lx + uz * ly;
          col[o] = C[0] * br * mul; col[o + 1] = C[1] * br * mul; col[o + 2] = C[2] * br * mul; v++;
        }
      }
    }
  }
  scfTgTag(E, T);
  g.setDrawRange(0, Math.round(v * 1.5)); g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; m.visible = true;
}

// the target's name at the end of the arc, in the same orange as the System map's Target tag (the map's own tag hides when a moon's marker is small)
function scfTgTag(E, T) {
  if (!SCF.tg) { const d = document.createElement("div"); d.id = "scfTg"; d.setAttribute("aria-hidden", "true"); document.body.appendChild(d); SCF.tg = d; }
  const e = T.P[T.P.length - 1], v = new THREE.Vector3(e[0], e[1], e[2]).project(camera), d = SCF.tg;
  if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) { d.style.display = "none"; return; }
  const nm = E.b.t && E.b.t.name ? E.b.t.name : shortName(E.b.body, S.sys.name);
  if (d.dataset.n !== nm) { d.dataset.n = nm; d.innerHTML = `<i>▲</i>Target<em></em>`; d.querySelector("em").textContent = nm; }
  d.style.display = "block"; d.style.left = Math.round((v.x * 0.5 + 0.5) * innerWidth) + "px"; d.style.top = Math.round((0.5 - v.y * 0.5) * innerHeight + 8) + "px";
}
// ---- 2D: the same corridor on the System map -----------------------------------------------------------------------------------------
function scfElPos(e) {                                      // the centre of a place's icon on the map: a station's own icon, else its body
  let g = null;
  try { if (e.st && typeof yahMapEl === "function") g = yahMapEl(document, e.t, e.body); } catch (x) {}
  if (!g) g = document.querySelector(`#smapSvg .smo[data-id="${e.body.bodyId}"]`);
  if (!g) return null; const r = g.getBoundingClientRect(); return r.width || r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
}
const SCF_SHAPE = "M-.6 -1 L-.15 -1 L.4 0 L-.15 1 L-.6 1 L-.05 0 Z";
function scfSq() {
  if (SCF.sq) return SCF.sq;
  const d = document.createElement("div"); d.id = "scfSq"; d.setAttribute("aria-hidden", "true");
  d.innerHTML = '<svg width="100%" height="100%"><g id="scfG"></g></svg>'; document.body.appendChild(d); SCF.sq = d;
  const g = $("scfG"); for (let i = 0; i < SCF_P.MAXC; i++) { const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", SCF_SHAPE); g.appendChild(p); SCF.paths.push(p); }
  return d;
}
function scfDraw2(E, fade, time) {
  const a = scfElPos(E.a), b = scfElPos(E.b); if (!a || !b) { scfHide(); return; }
  const d = scfSq(), A = [a.x, a.y, 0], B = [b.x, b.y, 0], T = scfTable(A, scfCtrl(A, B, null), B, 24), s = SCF_P.SZ2, low = (QUALITY === PRESETS.low || SCF_RM.matches);
  const N = Math.max(3, Math.min(SCF_P.NMAX, Math.round(T.L / (s * 2.9)))), ph = low ? 0 : (time / 2.4) % 1, cnt = low ? N : N + 1;
  d.classList.toggle("lowq", low);
  for (let i = 0; i < SCF.paths.length; i++) {                                 // a fixed size: the arrows do not grow or shrink with the map's zoom
    const p = SCF.paths[i], f = low ? (i + 0.5) / N : (i + ph) / N;
    if (i >= cnt || f >= 1) { p.style.display = "none"; continue; }
    const at = scfAt(T, f);
    p.style.display = ""; p.setAttribute("transform", `translate(${at.p[0].toFixed(1)} ${at.p[1].toFixed(1)}) rotate(${(Math.atan2(at.t[1], at.t[0]) * 180 / Math.PI).toFixed(1)}) scale(${s})`); p.style.opacity = (scfLook(f, low) * fade).toFixed(2);
  }
  d.style.display = "block";
}
function scfHide() {
  if (SCF.tg) SCF.tg.style.display = "none";
  if (SCF.mesh) SCF.mesh.visible = false;
  if (SCF.sq) SCF.sq.style.display = "none";
}

// ---- the jump banner: a flat ">>>" and the next system's name, at the top of the System map while a jump route is plotted -------------------------------
function scfJump(on, time) {
  const hops = on && typeof JRN !== "undefined" && JRN.rOn === "on" ? jrnHops() : [], next = hops.length ? hops[0][0] : "";        // only while the map is really in route mode: it goes with the 'route cleared' message
  if (!next || !MAPMODE) { if (SCF.jb) SCF.jb.style.display = "none"; return; }
  if (!SCF.jb) {
    const d = document.createElement("div"); d.id = "scfJb"; d.innerHTML = '<svg width="54" height="16" viewBox="0 0 54 16"><g id="scfJg"></g></svg><span class="jk">Next jump</span><b id="scfJn"></b>'; document.body.appendChild(d); SCF.jb = d;
    const g = $("scfJg"); for (let i = 0; i < 3; i++) { const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", SCF_SHAPE); p.setAttribute("transform", `translate(${11 + i * 16} 8) scale(6.5)`); g.appendChild(p); SCF.jpaths.push(p); }
  }
  if ($("scfJn").textContent !== next) $("scfJn").textContent = next;
  const low = (QUALITY === PRESETS.low || SCF_RM.matches);
  const v = $("smapView") || $("smap"), r = v.getBoundingClientRect();
  const msg = $("jrnMsg"), busy = !!(msg && /(^|\s)show(\s|$)/.test(msg.className));            // the map's own route messages come first: the strip waits a moment
  SCF.jb.style.opacity = busy ? "0" : "1";
  SCF.jb.style.display = "flex"; SCF.jb.style.right = "auto"; SCF.jb.style.left = Math.round(r.left + r.width / 2) + "px"; SCF.jb.style.top = Math.round(r.top + 8) + "px";      // the top middle of the map picture
  SCF.jpaths.forEach((p, i) => { p.style.opacity = (low ? 0.4 + 0.3 * i : 0.25 + 0.75 * Math.max(0, Math.cos(2 * Math.PI * (i / 3 - time / 1.6)))).toFixed(2); });      // a gentle left-to-right run
}

// ---- once per frame ----------------------------------------------------------------------------------------------------------------
function scfTick(mapMode) {
  try {
    const vr = $("vRoute"), on = !(vr && !vr.checked), time = performance.now() / 1000;
    if (mapMode) scfJump(on && SYNC.on, time); else if (SCF.jb) SCF.jb.style.display = "none";
    const E = on ? scfEnds() : null; SCF.E = E;
    if (!E) { if (SCF.key) { SCF.key = ""; scfHide(); } return; }
    const key = `${E.a.body.bodyId}${E.a.st ? E.a.st.name : ""}>${E.b.body.bodyId}${E.b.st ? E.b.st.name : ""}`;
    if (key !== SCF.key) { SCF.key = key; SCF.t0 = performance.now(); }
    const fade = Math.min(1, (performance.now() - SCF.t0) / 900);
    if (mapMode) { if (SCF.mesh) SCF.mesh.visible = false; scfDraw2(E, fade, time); }
    else {
      if (SCF.sq) SCF.sq.style.display = "none";
      if (typeof PREP !== "undefined" && (PREP.on || !PREP.compiled)) { scfHide(); return; }       // the 3D map prepares itself first (its shaders): nothing of ours is added to the scene until that is done
      scfDraw3(E, fade, time);
    }
  } catch (e) { if (!SCF.err) { SCF.err = true; logErr(`route arrows: ${e.message}`); } scfHide(); }
}
// the test door: only with ?scftest=1 in the address (nothing else ever sees it)
if (/[?&]scftest=1(&|$)/.test(location.search)) window.__scf = { SCF, SYNC, S: () => S, YAH, TGT, camera, controls, scfV3, scfEnds, yahUpdate, tgtUpdate, jrnHops };
