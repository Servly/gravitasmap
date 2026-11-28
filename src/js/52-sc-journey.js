// v0.99.31: JOURNEY PREVIEW. While the route arrows show on the System map, a button "Watch the journey" (top left of the map) opens the 3D map, puts a small ship
// (a box with a canopy and a seat) at the start of the arrows and the camera beside it. "Start the journey" runs a short show (about 10 s, a little longer for a
// longer way): 2 s from outside into the cockpit, the way along the arc seen from inside with a head that looks around, 2 s back outside at the target, then a
// line of text. It is a show, NOT the real position of the ship: nothing in the game's files tells that. Esc leaves at any time.
const JNY = { arc: null, focus: null, hud: null, ph: "idle", T: 10, t0: 0, ship: null, btn: null, ov: null, saved: null };
const JNY_LINES = [
  "Preview complete. No fuel was burned and no space was crossed.",
  "You have arrived, in the most economical way: zero fuel, zero risk.",
  "Journey preview finished. The real ship is still waiting for you.",
  "Landed softly. Even the seat is still warm.",
  "Arrived! Please keep your hands inside the cockpit."
];
const jnySm = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const jnyOK = () => !APP_SMAP && !(typeof PFULL !== "undefined" && PFULL) && !SURF;

function jnyShip() {                                       // a neon box ship: x forward, y up, z right. Only MeshBasic (the scene has no lights for it)
  const g = new THREE.Group(), edge = new THREE.LineBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.9 }); edge.userData.b = 0.9;
  const add = (geo, mat, x, y, z, line = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); if (line) { const l = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edge); l.position.copy(m.position); g.add(l); } return m; };
  const dark = new THREE.MeshBasicMaterial({ color: 0x1c2a33 }), glass = new THREE.MeshBasicMaterial({ color: 0x66ffcc, transparent: true, opacity: 0.28, depthWrite: false });
  add(new THREE.BoxGeometry(1.7, 0.26, 0.9), dark, 0, 0, 0);                                           // the hull
  add(new THREE.BoxGeometry(0.7, 0.05, 0.9), dark, -0.35, 0, 0.78).rotation.y = -0.35;                // wings
  add(new THREE.BoxGeometry(0.7, 0.05, 0.9), dark, -0.35, 0, -0.78).rotation.y = 0.35;
  add(new THREE.BoxGeometry(0.62, 0.24, 0.62), glass, 0.35, 0.22, 0);                                 // the canopy
  const seatM = new THREE.MeshBasicMaterial({ color: 0x4a5c66 });
  add(new THREE.BoxGeometry(0.2, 0.2, 0.22), seatM, 0.18, 0.2, 0, false);                             // the seat
  add(new THREE.BoxGeometry(0.05, 0.22, 0.22), seatM, 0.08, 0.3, 0, false);                           // its back
  const glow = new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const z of [-0.25, 0.25]) add(new THREE.BoxGeometry(0.12, 0.1, 0.14), glow, -0.9, 0, z, false);   // the engines
  glass.userData.b = 0.28; g.userData.fade = [dark, edge, seatM, glass];
  g.traverse(o => { o.renderOrder = 9; if (o.material) o.material.depthTest = true; });
  return g;
}
function jnyUi() {
  if (JNY.btn) return;
  const b = document.createElement("button"); b.id = "jnyBtn"; b.type = "button"; b.style.display = "none"; b.textContent = "▶ Watch the journey";
  b.title = "A short preview flight along the arrows, seen from the ship's cockpit. It is a show: it is not your real position."; b.onclick = () => { if (JNY.ph === "idle") { JNY.ph = "wait"; JNY.fromMap = true; setMap(false); } };
  document.body.appendChild(b); JNY.btn = b;
  const o = document.createElement("div"); o.id = "jnyOv"; o.style.display = "none"; o.innerHTML = '<div class="jt"></div><div class="js"></div><button type="button" class="jb1"></button>'; document.body.appendChild(o); JNY.ov = o;
  o.querySelector(".jb1").onclick = () => { if (JNY.ph === "ready") jnyRun(); else jnyStop(); };
  addEventListener("keydown", e => { if (e.key === "Escape" && JNY.ph !== "idle") { jnyStop(); e.preventDefault(); } }, true);
}
function jnyOv(t, s, b) { const o = JNY.ov; o.querySelector(".jt").textContent = t; o.querySelector(".js").textContent = s; o.querySelector(".jb1").textContent = b; o.style.display = "flex"; }
function jnyStop() {
  if (JNY.ph === "idle") return;
  JNY.ph = "idle";
  if (JNY.ship) { JNY.ship.removeFromParent(); JNY.ship = null; }
  if (JNY.focus !== null || focus === null) { focus = JNY.focus; focusPrev = focus && focus._obj ? focus._obj.position.clone() : null; JNY.focus = null; }
  if (JNY.hud) JNY.hud.style.display = "none";
  if (JNY.saved) { camera.position.copy(JNY.saved.pos); controls.target.copy(JNY.saved.tgt); camera.fov = JNY.saved.fov; camera.updateProjectionMatrix(); controls.enabled = true; try { controls.update(); } catch (e) {} JNY.saved = null; }
  if (JNY.ov) JNY.ov.style.display = "none";
  document.body.classList.remove("jnyOn");
  if (JNY.fromMap) { JNY.fromMap = false; if (!MAPMODE) try { setMap(true); } catch (e) {} }        // back to the System map the show started from
}
function jnyRun() {
  JNY.ph = "run"; JNY.t0 = performance.now(); JNY.ov.style.display = "none";
  if (!JNY.hud) { const h = document.createElement("div"); h.id = "jnyHud"; h.innerHTML = '<span class="hk">Journey preview</span><b></b><i><u></u></i>'; document.body.appendChild(h); JNY.hud = h; }
  JNY.hud.querySelector("b").textContent = "to " + (JNY.to || "the target"); JNY.hud.style.display = "flex";
}
function jnyBegin() {                                      // the 3D map is up and the arc is drawn: the ship at its start, the camera beside it
  const E = SCF.E; if (!E) return jnyStop();
  const Tb = SCF.arc3, tn = E.b.t && E.b.t.name ? E.b.t.name : shortName(E.b.body, S.sys.name); JNY.to = tn;
  const ch = Math.hypot(Tb.P[Tb.P.length - 1][0] - Tb.P[0][0], Tb.P[Tb.P.length - 1][1] - Tb.P[0][1], Tb.P[Tb.P.length - 1][2] - Tb.P[0][2]);
  let dls = 500; try { const W = worldAt(Date.now()), p = W.get(E.a.body.bodyId), q = W.get(E.b.body.bodyId); dls = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) / LS_MM; } catch (e) {}
  JNY.T = Math.max(7, Math.min(14, 7 + 2.2 * Math.log10(Math.max(10, dls) / 10)));                       // about 10 s, a little longer for a longer way
  JNY.size = ch * 0.012;
  JNY.arc = { P: Tb.P.map(p => p.slice()), cum: Tb.cum.slice(), L: Tb.L };                      // the way, frozen for the whole show
  JNY.focus = focus; focus = null; fly = null; focusPrev = null;                                // nothing may move the camera but the show
  JNY.saved = { pos: camera.position.clone(), tgt: controls.target.clone(), fov: camera.fov };
  JNY.ship = jnyShip(); JNY.ship.scale.setScalar(JNY.size); scene.add(JNY.ship); controls.enabled = false; document.body.classList.add("jnyOn");
  JNY.ph = "ready"; jnyOv("Journey preview", "A show along the arrows. It is not your real position. Esc leaves.", "Start the journey");
}
const _jv = new THREE.Vector3(), _jm = new THREE.Matrix4(), _jqE = new THREE.Quaternion(), _jqC = new THREE.Quaternion();
function jnyPose(t) {                                      // the ship and the camera at time t (seconds into the show)
  const T = JNY.T, Tb = JNY.arc, u = Math.max(0, Math.min(1, t / T)), s = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  const at = scfAt(Tb, s), P = new THREE.Vector3(at.p[0], at.p[1], at.p[2]), fwd = new THREE.Vector3(at.t[0], at.t[1], at.t[2]).normalize();
  let up = new THREE.Vector3(0, 1, 0); up.addScaledVector(fwd, -up.dot(fwd)); if (up.lengthSq() < 1e-6) up.set(0, 0, 1); up.normalize();
  const right = new THREE.Vector3().crossVectors(fwd, up).normalize(), z = JNY.size;
  _jm.makeBasis(fwd, up, right); JNY.ship.quaternion.setFromRotationMatrix(_jm); JNY.ship.position.copy(P);
  const ext = t <= 0 ? 1 : Math.max(1 - jnySm(Math.min(t, 2) / 2), 1 - jnySm(Math.min(T - t, 2) / 2)), inside = 1 - ext;
  const eyeE = P.clone().addScaledVector(fwd, -9 * z).addScaledVector(up, 3.6 * z).addScaledVector(right, 4.6 * z);
  const eyeC = P.clone().addScaledVector(fwd, 0.2 * z).addScaledVector(up, 0.24 * z);
  const calm = SCF_RM.matches ? 0 : 1, yaw = calm * inside * (0.32 * Math.sin(t * 0.8) + 0.12 * Math.sin(t * 0.43 + 1)), pitch = calm * inside * 0.06 * Math.sin(t * 0.7 + 0.6);   // a head that looks around, gently
  const dir = fwd.clone().applyAxisAngle(up, yaw).applyAxisAngle(right, pitch);
  _jm.lookAt(eyeE, P, up); _jqE.setFromRotationMatrix(_jm);
  _jm.lookAt(eyeC, _jv.copy(eyeC).add(dir), up); _jqC.setFromRotationMatrix(_jm);
  for (const m of JNY.ship.userData.fade) { m.transparent = true; m.opacity = (m.userData.b || 1) * (1 - 0.9 * inside); }
  camera.position.lerpVectors(eyeE, eyeC, inside); camera.quaternion.copy(_jqE).slerp(_jqC, inside);
  camera.fov = 50 + 22 * inside; camera.updateProjectionMatrix(); controls.target.copy(P);
}
function jnyTick(mapMode) {
  if (!JNY.btn) { if (!SCF.E) return; jnyUi(); }
  const route = !!(SCF.E && SCF.key), can = route && jnyOK();
  if (JNY.ph === "idle") {                                 // the button on the System map, at the top left of the picture
    const show = mapMode && can && SYNC.on;
    if (show) { const v = $("smapView"); if (v) { const r = v.getBoundingClientRect(); JNY.btn.style.left = Math.round(r.left + 12) + "px"; JNY.btn.style.top = Math.round(r.top + 12) + "px"; } }
    const d = show ? "block" : "none"; if (JNY.btn.style.display !== d) JNY.btn.style.display = d; return;
  }
  if (JNY.btn.style.display !== "none") JNY.btn.style.display = "none";
  if (JNY.ph !== "wait") { fly = null; focus = null; focusPrev = null; }                         // nothing may move the camera but the show
  if (!jnyOK() || (JNY.ph !== "wait" && (mapMode || !route) && JNY.ph !== "done") || (JNY.ph === "done" && mapMode)) { jnyStop(); return; }
  if (JNY.ph === "wait") { if (!mapMode && SCF.arc3 && SCF.mesh && SCF.mesh.visible && route && !(typeof PREP !== "undefined" && PREP.on)) jnyBegin(); return; }
  if (!SCF.arc3 || !JNY.ship) return;
  if (JNY.ph === "ready") jnyPose(0);
  else if (JNY.ph === "run") {
    const t = (performance.now() - JNY.t0) / 1000;
    if (t >= JNY.T) { JNY.ph = "done"; if (JNY.hud) JNY.hud.style.display = "none"; jnyOv("Journey preview complete", JNY_LINES[Math.floor(Math.random() * JNY_LINES.length)], "Back to the map"); jnyPose(JNY.T); }
    else { jnyPose(t); if (JNY.hud) JNY.hud.querySelector("u").style.width = (100 * t / JNY.T).toFixed(1) + "%"; }
  } else if (JNY.ph === "done") jnyPose(JNY.T);
}
