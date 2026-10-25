// ------------------------------------------------------------ per-frame
const _q = new THREE.Quaternion(), WHITE = new THREE.Color(1, 1, 1);
let SURF = null;                       // surface view state (null = off)
let mode = null;                       // "styl" overview or "true" scale
let bodyScale = 1;
function rebuildStylOrbits() {             // stylised orbit shapes depend on body scale (moon clearance)
  computeSpacing();
  for (const o of S.orbits) {
    const par = S.byId.get(o.parent), arr = o.geoS.attributes.position.array;
    for (let i = 0; i <= 360; i++) { const q = stylise(relPos(o.b, 0, (i / 360) * 2 * Math.PI), par, o.b); arr[i * 3] = q.x; arr[i * 3 + 1] = q.z; arr[i * 3 + 2] = -q.y; }
    o.baseS = Float32Array.from(arr); o.geoS.attributes.position.needsUpdate = true;
  }
  for (const B of S.belts || []) beltStylLayout(B);
}
const _bcam = new THREE.Vector3();
let WELL_ON = true;                                                     // v0.75.7: the checkbox is read once a frame, not per point
const wellY = (G, x, z) => WELL_ON ? surfaceY(G, x, z) : 0;   // v0.61: bodies can stay on one flat plane (Canonn feedback)
// v0.75.7: orbit lines lie on the well surface. Re-laying every point of every orbit each frame was the largest piece of
// script work in 3D, while at 1× nothing moves visibly. They are re-laid only when a well, their parent or a setting moved
const WELL_SIG = { v: 0, a: null };
function wellSigTick(G, eps) {
  const n = G.mat.uniforms.uCount.value, a = WELL_SIG.a; let moved = !a || a.length !== n * 4;
  if (!moved) for (let i = 0; i < n && !moved; i++) { const w = G.wells[i]; moved = Math.abs(w.x - a[i * 4]) > eps || Math.abs(w.y - a[i * 4 + 1]) > eps || Math.abs(w.z - a[i * 4 + 2]) > eps * 0.1 || Math.abs(w.w - a[i * 4 + 3]) > eps; }
  if (moved) { WELL_SIG.a = new Float64Array(n * 4); for (let i = 0; i < n; i++) { const w = G.wells[i]; WELL_SIG.a.set([w.x, w.y, w.z, w.w], i * 4); } WELL_SIG.v++; }
}
const k = b => mode === "styl" ? b._vis * bodyScale / b._r : 1;   // display radius factor
function setMode(m) {
  if (mode === m) return;
  mode = m;
  if (m === "styl") { O.x = O.y = O.z = 0; }
  for (const b of S.bodies) {
    b._tilt.scale.setScalar(k(b));
    if (b._halo) b._halo.scale.setScalar(b._r * k(b) * (b._haloK ?? 6));
    (b._ex.belts || []).forEach(x => (x.visible = x.userData.mode === m && $("vRings").checked));
  }
  for (const o of S.orbits) o.line.geometry = m === "styl" ? o.geoS : o.geoT;
  S.gridT.mesh.visible = m === "true" && $("vGrid").checked;
  S.gridS.mesh.visible = m === "styl" && $("vGrid").checked;
  modeTagText();
}
let _lastScene = performance.now();
const _rn = new THREE.Vector3(), _rc = new THREE.Vector3(), _rq = new THREE.Quaternion(), _rq2 = new THREE.Vector3();
function moonAnchor(b) {   // the planet a moon system hangs from (a body that is not a moon is its own anchor)
  let a = b; for (let n = b; ;) {               // climb through planets and moon-pair barycentres; stop at a star
    const p = S.byId.get(S.parentOf.get(n.bodyId)); if (!p || p.type === "Star") return a;
    if (p.type === "Planet" && p._obj) a = p; n = p; }
}
function updateScene() {
  const nowMs = performance.now(), eclA = 1 - Math.exp(-Math.min(nowMs - _lastScene, 250) / 150); _lastScene = nowMs;
  computeWorld(simTime);
  const styl = mode === "styl", P = styl ? S.disp : S.world;
  pipeMode(styl);
  if (styl) computeDisp(simTime);
  if (focus && !styl) setOrigin(S.world.get(focus.bodyId), !SURF);     // followFocus then moves the camera with the body
  for (const b of S.bodies) toScene(P.get(b.bodyId), b._obj.position);
  for (const o of S.orbits) toScene(P.get(o.parent) || { x: 0, y: 0, z: 0 }, o.line.position);
  WELL_ON = $("vWell").checked;
  const lay = styl && $("vOrbits").checked, eps = (S.extentS || 1) * 2e-5;
  if (lay) wellSigTick(S.gridS, eps);
  if (lay) for (const o of S.orbits) {      // lay stylised orbits onto the well surface
    const base = o.baseS || (o.baseS = Float32Array.from(o.geoS.attributes.position.array)), arr = o.geoS.attributes.position.array, px = o.line.position.x, pz = o.line.position.z;
    const py = TILT ? o.line.position.y : 0;                        // parent's height above the plane (true tilt)
    o.line.position.y = 0;
    const L = o._lay;                                                 // nothing that shapes this line moved: keep it as it is
    if (L && L.v === WELL_SIG.v && L.t === TILT && L.w === WELL_ON && Math.abs(L.px - px) < eps && Math.abs(L.pz - pz) < eps && Math.abs(L.py - py) < eps) continue;
    o._lay = { v: WELL_SIG.v, t: TILT, w: WELL_ON, px, pz, py };
    const pb = S.byId.get(o.parent);
    const a = pb && (pb.type === "Planet" || pb.type === "Barycentre") ? moonAnchor(o.b) : null;
    if (a && a !== o.b) {                                            // a moon's orbit (also around a moon-pair barycentre) stays level with its planet
      const y0 = wellY(S.gridS, a._obj.position.x, a._obj.position.z) + (a._vis - (o.b._vis || 0)) * bodyScale * 0.6 + 0.04;
      for (let i = 0; i < base.length; i += 3) arr[i + 1] = y0 + (TILT ? base[i + 1] + py : 0);
    } else
    for (let i = 0; i < base.length; i += 3) arr[i + 1] = wellY(S.gridS, base[i] + px, base[i + 2] + pz) + 0.04 + (TILT ? base[i + 1] + py : 0);
    o.geoS.attributes.position.needsUpdate = true;
  }
  const G = styl ? S.gridS : S.gridT, ext = styl ? S.extentS : S.extent;
  toScene({ x: 0, y: 0, z: 0 }, G.mesh.position); G.mesh.position.y -= styl ? 0 : ext * 0.004;
  const ws = [...S.bodies].sort((a, b) => b._h - a._h).slice(0, MAX_WELLS);
  ws.forEach((b, i) => { const w = P.get(b.bodyId); G.wells[i].set(w.x, -w.y, styl ? b._hS : b._h, styl ? b._wS : b._w); });
  G.mat.uniforms.uCount.value = ws.length;
  G.mat.uniforms.uAlpha.value = styl ? 1 : THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) / (ext * 0.05), 0, 1);
  for (const b of S.bodies) {
    b._tilt.scale.setScalar(k(b));
    if (b._qF) b._tilt.quaternion.copy(!styl || TILT ? b._qF : b._qFlat);
    if (b._ex.ringEdge) {                                            // thin line when the rings are seen (nearly) edge-on
      b._tilt.updateMatrixWorld(); _rn.set(0, 1, 0).applyQuaternion(b._tilt.getWorldQuaternion(_rq));
      _rc.copy(camera.position).sub(b._obj.position).normalize();
      // how thick the ring band looks on screen: width × sin(view angle above the ring plane). Exactly edge-on it is
      // invisible (as in the game seen from a moon in the ring plane); below ~1.5 px the flat mesh drops out, so the line takes over
      const dist = Math.max(camera.position.distanceTo(b._obj.position), 1e-9), pxPerRad = innerHeight / (2 * Math.tan(camera.fov * DEG / 2));
      const tPx = (b._ringOut - b._ringIn) * k(b) * Math.abs(_rn.dot(_rc)) / dist * pxPerRad;
      const hs = hostStar(b), sameSide = !hs || !hs._obj || _rn.dot(_rc) * _rn.dot(_rq2.copy(hs._obj.position).sub(b._obj.position)) >= 0;
      const op = (tPx < 1.5 ? Math.min(1, tPx) * 0.85 : 0) * (sameSide ? 1 : 0.25), on = op > 0.02 && $("vRings").checked;
      b._ex.rings.forEach(r => r.material.uniforms && r.material.uniforms.uRN.value.copy(_rn));
      b._ex.ringEdgeMat.opacity = op; for (const l of b._ex.ringEdge) l.visible = on;
    }
    if (b._halo) { b._halo.scale.setScalar(b._r * k(b) * (b._haloK ?? 6)); }   // true scale: bloom makes most of the glow
    if (b._landRing) { b._landRing.position.y = b._r * k(b) * 1.08; b._landRing.visible = $("vLand").checked && !b._dc && !(SURF && SURF.b === b); }
  }
  if (styl) {   // each planet floats on the well surface; its moons keep the planet's level, so a moon system stays rigid
    const lift = new Map();     // (otherwise moons climb the well slope and the ring/equator geometry seen from a moon is wrong)
    for (const b of S.bodies) lift.set(b.bodyId, wellY(G, b._obj.position.x + O.x, b._obj.position.z) + b._vis * bodyScale * 0.6);
    for (const b of S.bodies) b._obj.position.y += lift.get(moonAnchor(b).bodyId);
  }
  placeCarriers(styl); placeStations(styl); placeSurfaceSites(styl);
  for (const b of S.stars) if (b._prom) { b._prom.visible = !b._bh && $("vGlow").checked; b._prom.lookAt(camera.position);
    if (b._prom.visible && !STAR_ANIM.on) { const d = camera.position.distanceTo(b._obj.position), px = b._r * k(b) / Math.max(d, 1e-9) * innerHeight / (2 * Math.tan(camera.fov * DEG / 2));
      if (px > 12 && px < innerHeight * 4) { _bcam.copy(b._obj.position).project(camera); if (Math.abs(_bcam.x) < 1.3 && Math.abs(_bcam.y) < 1.3 && _bcam.z < 1) STAR_ANIM.on = true; } } }
  for (const b of S.stars) if (b._halo) b._halo.material.opacity = (b._haloOp ?? 1) * 0.18 * THREE.MathUtils.smoothstep(camera.position.distanceTo(b._obj.position) / (b._r * k(b) * (b._haloK ?? 6)), 0.9, 2.2);   // fades when the camera is inside the glow (after the well lift)
  if (S.dropGeo) {                                                    // true tilt: a thin line from each body down (or up) to the grid
    const arr = S.dropGeo.attributes.position.array; let n = 0;
    if (styl && TILT && $("vGrid").checked) for (const b of S.bodies) {
      const p = b._obj.position, gy = wellY(G, p.x + O.x, p.z) + b._vis * bodyScale * 0.6;
      if (Math.abs(p.y - gy) > 0.15 && n < 256) { arr.set([p.x, p.y, p.z, p.x, gy - b._vis * bodyScale * 0.6, p.z], n * 6); n++; }
    }
    S.dropGeo.setDrawRange(0, n * 2); S.dropGeo.attributes.position.needsUpdate = true;
  }
  const stars = S.stars.slice(0, MAX_STARS), shadows = $("vShadows").checked, night = Math.pow($("vNight").value / 30, 2) * 0.25;
  for (const B of S.belts || []) beltFrame(B, styl, G, stars, night);   // v0.63 belts: label, guides, rock field, starlight
  const occAll = S.bodies.filter(b => b.type !== "Star");
  for (const b of S.bodies) {
    if (b.type === "Star") continue;
    const mats = [b._mesh.material, ...b._ex.rings.filter(r => r.material.uniforms).map(r => r.material)];
    if (b._atm) {                                                       // v0.60: the atmosphere shell gets the same starlight
      mats.push(b._atm.material);
      const inside = camera.position.distanceTo(b._obj.position) < b._r * k(b) * (1 + b._atmRec.hf);
      const side = inside ? THREE.BackSide : THREE.FrontSide;           // from inside (surface view) the far side of the shell is the sky
      if (b._atm.material.side !== side) { if (b._atmMats) b._atm.material = b._atmMats[inside ? 1 : 0]; else { b._atm.material.side = side; b._atm.material.needsUpdate = true; } }   // v0.90: two ready materials, no recompile
    }
    let occ = [];
    // eclipses between bodies only where geometry is true; the stylised lens would cast false shadows
    if (shadows && !styl) { const wb = S.world.get(b.bodyId); occ = occAll.filter(o => o !== b).map(o => [o, dist(S.world.get(o.bodyId), wb)]).sort((a, c) => a[1] - c[1]).slice(0, MAX_OCC); }
    const ww = stars.map(st => starlightWho(b, st, S.world));
    b._ecl = ww.map(w => w.vis); b._eclWho = ww.map(w => w.by);                                          // true value (panel readout)
    const deep = ww.reduce((m, w) => (w.vis < m.vis ? w : m), { vis: 1, by: null });
    b._eclBy = deep.vis < 0.98 ? deep.by : null;
    if (!b._eclS || b._eclS.length !== b._ecl.length) b._eclS = b._ecl.slice();
    b._eclS = b._eclS.map((v, i) => v + (b._ecl[i] - v) * eclA);        // eased value (~0.35 s) for the picture
    mats.forEach((m, mi) => {
      const u = m.uniforms, list = mi === 0 ? occ : [[b, 0], ...occ].slice(0, MAX_OCC);   // rings are also shadowed by their own planet
      stars.forEach((s, i) => {
        if (styl && TILT) {                                           // true tilt: light comes from the star's real 3D direction
          const wb = S.world.get(b.bodyId), ws = S.world.get(s.bodyId), dx = ws.x - wb.x, dy = ws.y - wb.y, dz = ws.z - wb.z, n = Math.hypot(dx, dy, dz) || 1;
          const D2 = b._obj.position.distanceTo(s._obj.position) || 1, p = b._obj.position;
          u.uStars.value[i].set(p.x + dx / n * D2, p.y + dz / n * D2, p.z - dy / n * D2, s._r * k(s));
        } else u.uStars.value[i].set(s._obj.position.x, styl ? b._obj.position.y : s._obj.position.y, s._obj.position.z, s._r * k(s)); u.uStarCol.value[i].copy(s._color).lerp(WHITE, $("vWB").checked ? 0.97 : 0.8).multiplyScalar(1.1); });   // v0.60: the game white-balances strongly; a hint of the star's colour stays
      u.uNStars.value = stars.length;
      list.forEach(([o], i) => u.uOcc.value[i].set(o._obj.position.x, o._obj.position.y, o._obj.position.z, o._r * k(o)));
      u.uNOcc.value = shadows ? list.length : 0; u.uNight.value = night;
      for (let i = 0; i < MAX_STARS; i++) u.uEcl.value[i] = shadows ? (b._eclS[i] ?? 1) : 1;
    });
    if (b._ex.rings.length) b._mesh.material.uniforms.uRing.value.w = shadows && $("vRings").checked ? 1 : 0;   // no shadow from hidden rings
    if (b._ex.rings.length && b._mesh.material.uniforms.uRing.value.w > 0) {
      b._mesh.material.uniforms.uRingC.value.copy(b._obj.position);
      b._mesh.material.uniforms.uRing.value.x = b._ringIn * k(b); b._mesh.material.uniforms.uRing.value.y = b._ringOut * k(b);
      b._tilt.getWorldQuaternion(_q); b._mesh.material.uniforms.uRingN.value.set(0, 1, 0).applyQuaternion(_q);
    }
  }
  // a line from the body casting the shadow to the body in its shadow, and a tag on the label
  try { const arr = S.shadowGeo.attributes.position.array; let n = 0;
    for (const b of S.bodies) {
      const by = shadows ? b._eclBy : null;
      if (by && by._obj && n < 32 && !SURF) { const p = by._obj.position, q = b._obj.position; arr.set([p.x, p.y, p.z, q.x, q.y, q.z], n * 6); n++; }
      let tag = by ? `in shadow of ${shortName(by, S.sys.name)}` : "";
      if (by) {                                  // when does it end? true positions, searched forward in time (refreshed ~1×/s)
        const nowMs = performance.now();
        if (!b._eclEnd || b._eclEnd.by !== by || nowMs - b._eclEnd.at > 1000 || simTime > b._eclEnd.t) b._eclEnd = { by, at: nowMs, t: eclipseEnd(b, hostStar(b), 0.98), t1: eclipseEnd(b, hostStar(b), 0.01) };
        const E = b._eclEnd, hm = t => gameTime(t).slice(11, 16), vNow = b._ecl ? Math.min(...b._ecl) : 0;
        if (E.t && E.t1 && vNow < 0.01 && E.t - E.t1 > 60000) tag += ` (star returns ${hm(E.t1)}–${hm(E.t)} UTC, ${untilText(E.t1 - simTime)})`;
        else if (E.t) tag = (vNow >= 0.01 ? `partly in shadow of ${shortName(by, S.sys.name)}, ${fmt(vNow * 100, 0)}% starlight` : tag) + ` (ends ${hm(E.t)} UTC, ${untilText(E.t - simTime)})`;
      } else b._eclEnd = null;
      if (b._shTag !== tag) { b._shTag = tag; b._sh.textContent = tag ? "◐ " + tag : ""; b._sh.style.display = tag ? "block" : "none";
        b._sh.title = tag ? "Times are for the centre of the body: the first is when the star's edge appears from behind, the second when it is fully clear. A spot on the surface can see this a few minutes earlier or later." : ""; }
    }
    S.shadowGeo.setDrawRange(0, n * 2); S.shadowGeo.attributes.position.needsUpdate = true; } catch (e) { console.warn("shadow lines:", e); }
  if ($("vSpin").checked) for (const b of S.bodies) { const P = b.rotationalPeriod; if (P) b._mesh.rotation.y = ((simTime / 86400000) / P % 1) * 2 * Math.PI; }
  const showM = $("vMoonLabels").checked;
  for (const b of S.bodies) {
    let vis = true;
    if (b._isMoon && b !== selected) {
      const par = S.byId.get(S.parentOf.get(b.bodyId)), a = (b.semiMajorAxis || 0.001) * AU_LS * LS_MM;
      vis = showM && !!par && !!par._obj && camera.position.distanceTo(par._obj.position) < (styl ? 30 : a * 60);
    }
    if (typeof YAH !== "undefined" && YAH.b === b) vis = true;  // v0.72.2: You are here is always shown, even on a far moon
    if (SURF && SURF.b === b) vis = false;            // standing on it: no marker for our own body
    b._label.visible = vis;
  }
  const pxPerUnit = innerHeight / (2 * Math.tan(camera.fov * DEG / 2));
  for (const b of S.bodies) {        // v0.60: surfaces are baked on the GPU at a resolution that follows the size on screen
    if (b.type === "Star") continue;
    const px = 2 * b._r * k(b) / Math.max(camera.position.distanceTo(b._obj.position), 1e-9) * pxPerUnit;
    if (px > (QUALITY === PRESETS.low ? 3 : 12)) { const r = bakeRes(px); /* v0.71: on Low the ready pictures are free, so even small bodies get one */ if (r >= 2048) b._bakeSeen = performance.now();
      // v0.72.1: while zooming, the wanted size changes every moment: a big surface (1024 px and up) is started only
      // once the size has stayed the same for half a second, so zooming no longer starts and drops one big job after another
      const now = performance.now(); if (b._wantRes !== r) { b._wantRes = r; b._wantT = now; }
      if (r <= 512 || now - b._wantT > 500) bakeRequest(b, r); }
  }
  // v0.92.1: the camera never goes inside the body it looks at (in the overview too: inside, the screen went black), and
  // never further out than a few times the whole system: from 5 billion units out, a hundred wheel turns were needed to
  // come back and the view seemed stuck. Beyond the limit, the next update brings the camera back in at once
  controls.minDistance = focus ? (styl ? (focus._vis ? focus._vis * bodyScale * 1.05 : 1e-3) : focus._r * 1.02) : 1e-3;
  controls.maxDistance = styl ? Math.max(S.extentS || 0, S.fitR || 0, 50) * 12 : Math.max(S.extent || 0, 1) * 12;
}

