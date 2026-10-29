// ----------------------------------------------------------------- model
let LIVE = true;                       // follow the real clock until the user picks another speed or moment
let S = null, simTime = Date.now(), speed = 1, selected = null, focus = null, fly = null;
const BODY_GEO = new THREE.SphereGeometry(1, 192, 96);      // v0.60: one shared unit sphere, scaled per body (smooth limbs up close)
// v0.71: the same sphere with fewer triangles for bodies that are small on screen (most of them, most of the time)
const BODY_GEO_M = new THREE.SphereGeometry(1, 64, 32), BODY_GEO_L = new THREE.SphereGeometry(1, 24, 12);
const _lodV = new THREE.Vector3();
function sphereLod() {
  if (!S || MAPMODE) return;
  const pxK = innerHeight / 2 / Math.tan(camera.fov * DEG / 2), low = QUALITY === PRESETS.low;
  for (const b of S.bodies) {
    const m = b._mesh; if (!m || b.type === "Star" || !m.visible && !b._atm) continue;
    _lodV.setFromMatrixPosition(m.matrixWorld);
    const r = m.matrixWorld.getMaxScaleOnAxis() / Math.max(_lodV.distanceTo(camera.position), 1e-9) * pxK;   // radius on screen, px
    const g = r < 12 ? BODY_GEO_L : r < 90 || low && r < 400 ? BODY_GEO_M : BODY_GEO;
    if (m.geometry !== g) { m.geometry = g; if (b._atm) b._atm.geometry = g; }
  }
}
function bodyFlat(b, mesh = b._mesh) {                         // the body's base colour, shown until its surface is baked
  const p0 = palette(b)[0], u = mesh.material.uniforms;
  u.map.value = flatTex; u.nmap.value = flatTex; u.uHasN.value = 0; u.uTint.value.setRGB(p0[0] / 255, p0[1] / 255, p0[2] / 255);
  u.uKind.value = isGiant(b) ? 0 : 1; u.uLS.value = /Icy/i.test(b.subType || "") ? 0.3 : 0.55;
  u.uDry.value = /Earth-like|Water world/i.test(b.subType || "") ? 0 : 1; b._lib = null;
}
function shortName(b, sys) { return b.name.toLowerCase().startsWith(sys.toLowerCase()) ? (b.name.slice(sys.length).trim() || "★ Primary") : b.name; }

function build(data) {
  const sys = data.system || data, list = sys.bodies || [];
  if (typeof stwSystem === "function") stwSystem();                 // v0.79: a station window of the old system closes
  if (S) { S.group.traverse(o => { if (o.isCSS2DObject) o.element.remove(); }); S.group.removeFromParent(); bakeDisposeAll(); thumbForget();
    S.group.traverse(o => { if (o.material && o.material.uniforms) { const u = o.material.uniforms; for (const k of ["uTex", "uRingTex"]) if (u[k] && u[k].value && u[k].value.isDataTexture) u[k].value.dispose(); } }); }
  selected = null; focus = null; fly = null; $("info").style.display = "none";
  const byId = new Map(), parentOf = new Map(), children = new Map();
  for (const b of list) byId.set(b.bodyId, b);
  for (const b of list) {
    const chain = (b.parents || []).map(p => Object.values(p)[0]);
    if (chain.length && !parentOf.has(b.bodyId)) parentOf.set(b.bodyId, chain[0]);
    for (let k = 0; k + 1 < chain.length; k++) if (!parentOf.has(chain[k])) parentOf.set(chain[k], chain[k + 1]);
  }
  for (const [c, p] of parentOf) { if (!children.has(p)) children.set(p, []); children.get(p).push(c); }
  // epoch of each meanAnomaly. If a body has no timestamp of its own, borrow one from its siblings or the system
  // (never "now": that would make positions drift with the time the page was opened)
  const ts = b => b.timestamps && b.timestamps.meanAnomaly;
  const allTs = list.map(ts).filter(Boolean).sort();
  for (const b of list) {
    let t = ts(b), how = "own";
    if (!t) { const par = parentOf.get(b.bodyId), sib = list.find(o => o !== b && ts(o) && parentOf.get(o.bodyId) === par); if (sib) { t = ts(sib); how = "sibling"; } }
    if (!t && b.updateTime) { t = b.updateTime; how = "update"; }
    if (!t && allTs.length) { t = allTs[allTs.length - 1]; how = "system"; }
    if (!t) { t = sys.date || sys.updateTime || new Date().toISOString(); how = "none"; }
    b._t0 = Date.parse(t); b._epochHow = how;
  }
  try { if (typeof scanFix === "function") scanFix(sys.id64, list); } catch (e) {}   // v0.96: where your own scans put the bodies on their orbits
  orbitFrames(byId, parentOf);
  const placeable = id => { for (let n = id; ;) { if (n === 0) return true; if (!byId.has(n)) return false; const p = parentOf.get(n); if (p === undefined) return !!byId.get(n).mainStar; n = p; } };

  const group = new THREE.Group(); scene.add(group);
  const bodies = [], unplaced = [];
  for (const b of list) {
    if (b.type === "Barycentre") continue;
    if (!placeable(b.bodyId)) { unplaced.push(b); continue; }
    const isStar = b.type === "Star";
    b._r = isStar ? (b.solarRadius || 0.5) * SUN_R_MM : (b.radius || 1000) / 1000;
    b._mass = isStar ? (b.solarMasses || 0.1) * SUN_EM : (b.earthMasses || 0.001);
    b._vis = isStar ? 1.2 + 0.8 * Math.log10(1 + (b.solarRadius || 0.5) * 10) : 0.12 + 0.28 * Math.log10(1 + (b.radius || 1000) / 1000);
    b._ringRatio = b.rings && b.rings.length ? Math.max(...b.rings.map(r => r.outerRadius)) / 1e6 / ((b.radius || 1000) / 1000) : 1;
    const obj = new THREE.Group(), tilt = new THREE.Group(); tilt.rotation.z = b.axialTilt || 0; obj.add(tilt);
    // spin axis & ring plane: the body's true equatorial frame (same validated frame its moons orbit in);
    // scene = (x, z, -y) of the world, so R_scene = S·F·Sᵀ. FLAT lays everything in the shared plane.
    if (b._F && b.bodyId !== 0 && b.type !== "Barycentre") {
      const F = b._F, Sm = [[1, 0, 0], [0, 0, 1], [0, -1, 0]], R = M3(M3(Sm, F), [[1, 0, 0], [0, 0, -1], [0, 1, 0]]);
      b._qF = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().set(R[0][0], R[0][1], R[0][2], 0, R[1][0], R[1][1], R[1][2], 0, R[2][0], R[2][1], R[2][2], 0, 0, 0, 0, 1));
      b._qFlat = new THREE.Quaternion();
    }
    const ex = { rings: [], glow: [] };
    let mesh;
    if (isStar) {
      const color = new THREE.Color(starColor(b)), K = starKind(b);
      mesh = new THREE.Mesh(new THREE.SphereGeometry(b._r, 96, 48), K.kind === 3 ? new THREE.MeshBasicMaterial({ color: 0x000000 }) : starMaterial(b, color, K));
      b._haloK = K.halo; b._bh = K.kind === 3;
      if (b._bh) mesh.visible = false;              // drawn by the lensing pass; the hidden mesh still catches clicks
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: K.halo ? coronaTex(K.halo) : glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: K.kind === 5 ? 0.45 : 1 }));
      halo.scale.setScalar(b._r * (K.halo || 0.001)); b._haloOp = halo.material.opacity; halo.visible = !b._bh; obj.add(halo); if (!b._bh) ex.glow.push(halo); b._halo = halo;
      if (!b._bh) {
        const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, sizeAttenuation: false, opacity: K.kind === 5 ? 0.4 : 1 }));
        flare.scale.setScalar(K.kind === 1 || K.kind === 2 ? 0.045 : 0.035); obj.add(flare); ex.glow.push(flare);
      }
      if (K.kind === 0 || K.kind === 4) {                // ordinary stars: prominences and flares at the limb
        const prom = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), promMaterial(color)); prom.material.uniforms.uSeed.value = (bodyHash(b) % 5000) / 100; prom.scale.setScalar(b._r); prom.renderOrder = 1;
        tilt.add(prom); b._prom = prom;
      }
      if (K.kind === 2) ex.jets = addJets(tilt, b._r, color);
      if (K.kind === 4) {                           // Wolf-Rayet: a wide, faint wind nebula
        const wind = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: color.clone().lerp(new THREE.Color(0.7, 0.5, 1), 0.4), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.25 }));
        wind.scale.setScalar(b._r * 22); tilt.add(wind); ex.glow.push(wind);
      }
      b._color = color;
    } else {
      mesh = new THREE.Mesh(BODY_GEO, bodyMaterial(flatTex)); mesh.scale.setScalar(b._r);
      bodyFlat(b, mesh);                                                                     // flat colour until the surface is baked
      if (b.isLandable) {
        const lr = new THREE.Sprite(new THREE.SpriteMaterial({ map: landTex, depthWrite: false, transparent: true, sizeAttenuation: false }));
        lr.center.set(0.5, 0); lr.scale.set(0.022, 0.03, 1); lr.renderOrder = 5; obj.add(lr); b._landRing = lr;
      }
      const ar = atmRecipe(b);
      if (ar) {                                                    // v0.60: a scattering shell instead of a glow sprite
        const [ac, as] = atmColor(b); b._atmCol = ac.clone().multiplyScalar(as);
        const shell = new THREE.Mesh(BODY_GEO, atmMaterial(ar)); shell.scale.setScalar(b._r * (1 + ar.hf)); shell.renderOrder = 2;
        tilt.add(shell); b._atm = shell; b._atmRec = ar;
        // v0.90: the same shell seen from inside (surface view, or a close zoom) needs the shader drawn for back faces. Switching
        // the side on the fly made the driver compile a new shader in the middle of the zoom (a freeze on some computers).
        // A second material, sharing the same uniforms, is made now and compiled with the rest; the shell swaps between them
        { const f = shell.material, bk = f.clone(); bk.uniforms = f.uniforms; bk.defines = f.defines; bk.side = THREE.BackSide; f.side = THREE.FrontSide;
          b._atmMats = [f, bk]; const ghost = new THREE.Mesh(shell.geometry, bk); ghost.visible = false; ghost.userData.atmGhost = true; shell.add(ghost); }
      }
      if (b.rings && b.rings.length) {
        const strip = ringStrip(b), inner = strip.rin, outer = strip.rout;
        for (const r of b.rings) {
          const ring = new THREE.Mesh(new THREE.RingGeometry(r.innerRadius / 1e6, r.outerRadius / 1e6, 512, 1), ringMaterial(b, strip));
          ring.rotation.x = -Math.PI / 2; ring.renderOrder = 3; tilt.add(ring); ex.rings.push(ring);
          ring.userData.ring = r; ring.material.uniforms.uA.value = r.innerRadius / 1e6; ring.material.uniforms.uB.value = r.outerRadius / 1e6;   // v0.64.1: own edges for its mark
        }
        mesh.material.uniforms.uRingTex.value = strip.tex; b._ringStrip = strip;
        // seen exactly edge-on a flat ring has no area and vanishes; in the game it still shows as a thin line.
        // A few faint circles in the ring plane draw that line; they only fade in within ~3° of edge-on.
        const edgeMat = new THREE.LineBasicMaterial({ color: 0xe6d6bd, transparent: true, opacity: 0, depthWrite: false });
        ex.ringEdge = [];
        for (const r of b.rings) for (let j = 0; j <= 4; j++) {
          const rad = (r.innerRadius + (r.outerRadius - r.innerRadius) * j / 4) / 1e6, pts = [];
          for (let a = 0; a < 192; a++) pts.push(new THREE.Vector3(Math.cos(a / 192 * 2 * Math.PI) * rad, 0, Math.sin(a / 192 * 2 * Math.PI) * rad));
          const loop = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), edgeMat); loop.visible = false; tilt.add(loop); ex.ringEdge.push(loop);
        }
        ex.ringEdgeMat = edgeMat;
        mesh.material.uniforms.uRing.value.set(inner, outer, 0.92, 1); b._ringIn = inner; b._ringOut = outer;
      }
    }
    mesh.userData.body = b; tilt.add(mesh);
    const div = document.createElement("div");
    div.className = "label" + (isStar ? " star" : "") + (b.isLandable ? " land" : "") + (hasAtm(b) ? " atm" : "");
    div.innerHTML = `<div class="in"><div class="row"><span class="dot"></span><span class="nm">${shortName(b, sys.name)}</span>${badges(b)}</div><div class="det">${detailLine(b)}</div><div class="sh"></div></div>`;
    div.addEventListener("click", e => { e.stopPropagation(); select(b, false); });
    div.addEventListener("dblclick", e => { e.stopPropagation(); select(b, true); });
    const label = new CSS2DObject(div); obj.add(label);
    group.add(obj);
    Object.assign(b, { _obj: obj, _tilt: tilt, _mesh: mesh, _label: label, _div: div, _det: div.querySelector(".det"), _sh: div.querySelector(".sh"), _ex: ex, _texDone: isStar,
      _isMoon: !isStar && (b.parents || []).some(p => p.Planet !== undefined) });
    bodies.push(b);
  }
  const belts = [];
  for (const b of bodies) if (b.type === "Star") for (const bl of (b.belts || [])) {   // v0.62: belts around stars (rings of giants are separate)
    const B = beltBuild(b, bl, sys.name); b._obj.add(B.styl, B.mark, B.label); group.add(B.near);
    B.div.addEventListener("click", e => { e.stopPropagation(); beltSelect(B); });
    B.div.addEventListener("dblclick", e => { e.stopPropagation(); beltFly(B); });
    B.div.addEventListener("mouseenter", e => { if (MAPMODE || SURF) return; OT.for = { belt: B, x: e.clientX, y: e.clientY }; otipShow(beltTip(B), e.clientX, e.clientY); });
    B.div.addEventListener("mouseleave", () => otipHide());
    (b._ex.belts = b._ex.belts || []).push(B.styl, B.mark); belts.push(B);
  }
  const orbits = [];
  for (const [id] of parentOf) {
    const b = byId.get(id);
    if (!b || b.semiMajorAxis == null || !placeable(id)) continue;
    const pts = [], spts = [], par = byId.get(parentOf.get(id));
    for (let k = 0; k <= 360; k++) {
      const p = relPos(b, 0, (k / 360) * 2 * Math.PI);
      pts.push(p.x, p.z, -p.y); spts.push(0, 0, 0);       // stylised shape filled by rebuildStylOrbits once S exists
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const geoS = new THREE.BufferGeometry(); geoS.setAttribute("position", new THREE.Float32BufferAttribute(spts, 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: b.type === "Barycentre" ? 0x6a5aa0 : 0x6ae8ff, transparent: true, opacity: b.type === "Barycentre" ? 0.25 : 0.4 }));
    line.frustumCulled = false; group.add(line);
    orbits.push({ b, line, geoT: geo, geoS, parent: parentOf.get(id) });
  }
  if (S) { [S.gridT, S.gridS].forEach(g => { scene.remove(g.mesh); g.mesh.geometry.dispose(); }); }
  const shadowGeo = new THREE.BufferGeometry(); shadowGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(32 * 6), 3)); shadowGeo.setDrawRange(0, 0);
  const shadowLines = new THREE.LineSegments(shadowGeo, new THREE.LineBasicMaterial({ color: 0xd95926, transparent: true, opacity: 0.85, depthTest: false }));
  shadowLines.frustumCulled = false; shadowLines.renderOrder = 6; group.add(shadowLines);
  const dropGeo = new THREE.BufferGeometry(); dropGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(256 * 6), 3)); dropGeo.setDrawRange(0, 0);
  const dropLines = new THREE.LineSegments(dropGeo, new THREE.LineBasicMaterial({ color: 0x6ae8ff, transparent: true, opacity: 0.35 }));
  dropLines.frustumCulled = false; group.add(dropLines);
  skyBuild(sys.coords);
  S = { belts, dropGeo, sys, byId, parentOf, children, bodies, orbits, group, unplaced, stars: bodies.filter(b => b.type === "Star"), world: new Map(), disp: new Map(), shadowGeo };
  S.main = S.stars.find(s => s.mainStar) || S.stars[0];
  rebuildStylOrbits();
  computeWorld(simTime);
  let maxR = 1;
  for (const b of bodies) { const w = S.world.get(b.bodyId); maxR = Math.max(maxR, Math.hypot(w.x, w.y, w.z)); }
  S.extent = maxR * 1.2;
  const mMax = Math.max(...S.stars.map(s => s._mass), 1);
  computeDisp(simTime);
  let maxS = 10;
  for (const b of bodies) { const d = S.disp.get(b.bodyId); maxS = Math.max(maxS, Math.hypot(d.x, d.y, d.z)); }
  S.extentS = maxS * 1.3 + 12;
  S.fitR = Math.max(maxS, ...[...S.byId.values()].map(o => o._sApo || 0)) + 2;      // radius that holds every orbit, for framing
  for (const b of bodies) {
    const f = Math.pow(Math.min(b._mass / mMax, 1), 0.22);
    b._h = S.extent * 0.07 * f; b._w = S.extent * (0.004 + 0.05 * f);   // true-scale layer
    b._hS = ST_H * f; b._wS = 0.5 + 5 * f;                               // stylised layer
  }
  S.gridT = makeGrid(S.extent, S.extent * 0.07); S.gridS = makeGrid(S.extentS, ST_H);
  scene.add(S.gridT.mesh); scene.add(S.gridS.mesh);
  mode = null; renderList(); renderSystemInfo(); applyView();
  $("sysname").textContent = sys.name || "Unknown system";
  $("sysmeta").textContent = `${S.stars.length} star(s) · ${bodies.length - S.stars.length} planets/moons` +
    (sys.bodyCount && sys.bodyCount > bodies.length ? ` · ${sys.bodyCount - bodies.length} not yet scanned` : "") + (unplaced.length ? ` · ${unplaced.length} unplaced` : "");
  try { sysAgeShow(); } catch (e) { console.warn("data age", e); }
  try { locateCarriers(); } catch (e) { console.warn("carriers", e); S.carriers = []; }
  try { locateStations(); } catch (e) { console.warn("stations", e); S.orbitals = []; }
  try { buildSurfaceSites(); } catch (e) { console.warn("surface sites", e); S.surfSites = []; }
  try { filtersRender(); ofiltApply(); labelTips(); otipHide(); } catch (e) { console.warn("filters", e); }
  try { collStart(); } catch (e) { console.warn("collisions", e); }
  renderList(); renderSystemInfo();
  resetView(true);
  if (MAPMODE) smapBuild();                      // the system map follows a newly loaded system
  else if (SMAP_WANT) { SMAP_WANT = false; setMap(true, false); }
  try { yahUpdate(); } catch (e) {}                 // v0.71: You are here, when this is the ship's system
  try { arriveCardCheck(); } catch (e) {}           // v0.78: the arrival card after a jump
}
function computeWorld(t) {
  const W = S.world; W.clear();
  const get = id => {
    if (W.has(id)) return W.get(id);
    const par = S.parentOf.get(id); let p;
    if (id === 0 || par === undefined) p = { x: 0, y: 0, z: 0 };
    else { const pp = get(par), r = relPos(S.byId.get(id), t); p = { x: pp.x + r.x, y: pp.y + r.y, z: pp.z + r.z }; }
    W.set(id, p); return p;
  };
  for (const b of S.bodies) get(b.bodyId);
  for (const o of S.orbits) get(o.parent);
}

