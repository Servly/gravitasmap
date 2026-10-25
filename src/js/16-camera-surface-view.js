// ------------------------------------------------------------------ camera
function fadeFlash() {                 // a short dip to black; the reflows make sure the fade-out really starts (v0.50)
  const f = $("fade"); f.style.transition = "none"; f.style.opacity = 1; void f.offsetWidth;
  requestAnimationFrame(() => { f.style.transition = "opacity .45s"; void f.offsetWidth; f.style.opacity = 0; });
  const tok = fadeFlash.n = (fadeFlash.n || 0) + 1;
  setTimeout(() => { if (tok === fadeFlash.n && +getComputedStyle(f).opacity > 0.5) { f.style.transition = "none"; f.style.opacity = 0; } }, 1500);   // never leave the screen black
}
let focusPrev = null;
// ------------------------------------------------------------ surface view (true scale)
// (SURF is declared next to `mode`)
const SURF_ALT = 0.002;                         // 2 km above the surface, in Mm
const _sv = { q0: new THREE.Quaternion(), q1: new THREE.Quaternion(), t: new THREE.Vector3(), u: new THREE.Vector3(), n: new THREE.Vector3(), h: new THREE.Vector3(), q: new THREE.Quaternion(), d: new THREE.Vector3() };
function surfTargets(b) {                       // what can be looked at, biggest in the sky first
  const pb = S.world.get(b.bodyId);
  return S.bodies.filter(o => o !== b && S.world.has(o.bodyId))
    .map(o => ({ o, ang: 2 * Math.asin(Math.min(1, o._r / Math.max(dist(S.world.get(o.bodyId), pb), 1e-9))) / DEG }))
    .sort((x, y) => (y.o.type === "Star") - (x.o.type === "Star") || y.ang - x.ang).slice(0, 14);
}
const surfAng = a => a >= 1 ? fmt(a, 2) + "°" : a * 60 >= 1 ? fmt(a * 60, 1) + "′" : fmt(a * 3600, 1) + "″";
function enterSurface(b) {
  if (!S || b.type === "Star") return;
  const list = surfTargets(b), par = S.byId.get(S.parentOf.get(b.bodyId));
  const pick = (par && par.type !== "Barycentre" && list.find(x => x.o === par)) || list.find(x => x.o.type !== "Star") || list[0];
  if (!pick) return;
  Sound.whoosh(1); fadeFlash();
  SURF = { b, t: pick.o, el: +$("surfEl").value, az: +$("surfAz").value, fov: +$("surfFov").value, yaw: 0, pitch: null, fov0: camera.fov,
           anim: { dir: "in", t0: performance.now(), dur: 4200 } };          // descend from orbit to the surface
  $("surfT").innerHTML = list.map((x, i) => `<option value="${x.o.bodyId}"${x.o === pick.o ? " selected" : ""}>${esc(shortName(x.o, S.sys.name))} · ${surfAng(x.ang)} wide</option>`).join("");
  $("surf").style.display = "block"; $("surf").classList.add("hidden"); document.body.classList.add("surfing");
  if (isPhone()) setSheet("");                     // phones: close the sheet so the sky is visible
  focus = b; fly = null; controls.enabled = false;
  setMode("true"); setOrigin(S.world.get(b.bodyId)); applyView(); modeTagText();     // v0.57: already "true" when True scale is on
}
function exitSurface(fly_ = true, animate = false) {
  if (!SURF) return;
  if (animate) {                                    // climb back to orbit first, then return to the map
    if (!SURF.anim) { SURF.anim = { dir: "out", t0: performance.now(), dur: 2600, fly: fly_ }; Sound.whoosh(-1); $("surf").classList.add("hidden"); }
    return;
  }
  const b = SURF.b; camera.fov = SURF.fov0; camera.updateProjectionMatrix(); camera.up.set(0, 1, 0);
  SURF = null; $("surf").style.display = "none"; document.body.classList.remove("surfing");
  controls.enabled = true; fadeFlash(); setMode(TRUESCALE ? "true" : "styl"); applyView();
  if (TRUESCALE) { focus = b; updateScene(); placeNear(b); trueScaleUI(); return; }     // v0.57: back to the true-scale orrery, beside the body
  updateScene();
  camera.position.set(b._obj.position.x + 10, b._obj.position.y + 8, b._obj.position.z + 10); controls.target.copy(b._obj.position);
  if (fly_) flyTo(b);
}
function surfPose() {                           // place the camera on the surface every frame (bodies keep moving)
  const b = SURF.b, pb = b._obj.position, pt = SURF.t._obj.position;
  const t = _sv.t.copy(pt).sub(pb).normalize();
  if (b._qF) _sv.n.set(0, 1, 0).applyQuaternion(b._qF); else _sv.n.set(0, 1, 0);   // the observer's own pole picks the meridian
  let side = _sv.h.copy(_sv.n).addScaledVector(t, -_sv.n.dot(t));
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0).addScaledVector(t, -t.x);
  side.normalize().applyAxisAngle(t, (SURF.az || 0) * DEG);           // walk around the point under the target
  const el = SURF.el * DEG, u = _sv.u.copy(t).multiplyScalar(Math.sin(el)).addScaledVector(side, Math.cos(el)).normalize();   // local zenith
  camera.position.copy(pb).addScaledVector(u, b._r + SURF_ALT);
  const f0 = _sv.d.copy(t).addScaledVector(u, -t.dot(u)); if (f0.lengthSq() < 1e-9) f0.copy(side).multiplyScalar(-1); f0.normalize();
  if (SURF.pitch === null) SURF.pitch = SURF.el;
  const fwd = f0.applyAxisAngle(u, SURF.yaw * DEG).multiplyScalar(Math.cos(SURF.pitch * DEG)).addScaledVector(u, Math.sin(SURF.pitch * DEG));
  camera.up.copy(u); camera.lookAt(camera.position.clone().add(fwd));
  let fov = SURF.fov;
  if (SURF.anim) {                                  // landing / take-off: fly along the local vertical, nose down high up, level at the end
    const A = SURF.anim, k = Math.min(1, (performance.now() - A.t0) / A.dur), sm = (a, z, x) => { const q = Math.min(1, Math.max(0, (x - a) / (z - a))); return q * q * (3 - 2 * q); };
    const s = A.dir === "in" ? k : 1 - k;          // 0 = high orbit, 1 = standing on the ground
    const R = b._r, far = R * 14, near = R + SURF_ALT, d = Math.exp(Math.log(far) + (Math.log(near) - Math.log(far)) * sm(0, 0.82, s));
    _sv.q1.copy(camera.quaternion);
    camera.position.copy(pb).addScaledVector(u, d);
    camera.up.copy(f0); camera.lookAt(pb); _sv.q0.copy(camera.quaternion);
    camera.quaternion.slerpQuaternions(_sv.q0, _sv.q1, sm(0.5, 1, s));
    fov = 50 + (SURF.fov - 50) * sm(0.6, 1, s);
    if (k >= 1) {
      SURF.anim = null;
      if (A.dir === "in") $("surf").classList.remove("hidden");
      else { exitSurface(A.fly, false); return; }
    }
  }
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
}
$("surfX").onclick = () => exitSurface(true, true);
$("surfT").onchange = () => { if (SURF) { SURF.t = S.byId.get(+$("surfT").value); SURF.yaw = 0; SURF.pitch = SURF.el; } };
$("surfEl").oninput = () => { $("surfElV").textContent = $("surfEl").value + "°"; if (SURF) { SURF.el = +$("surfEl").value; SURF.yaw = 0; SURF.pitch = SURF.el; } };
$("surfAz").oninput = () => { $("surfAzV").textContent = $("surfAz").value + "°"; if (SURF) { SURF.az = +$("surfAz").value; SURF.yaw = 0; SURF.pitch = SURF.el; } };
$("surfFov").oninput = () => { $("surfFovV").textContent = $("surfFov").value + "°"; if (SURF) SURF.fov = +$("surfFov").value; };
$("surfBelts").onchange = () => applyView();
$("surfDef").onclick = () => { for (const [id, v] of [["surfEl", 15], ["surfAz", 0], ["surfFov", 60]]) { $(id).value = v; $(id).dispatchEvent(new Event("input")); } };
{ let drag = null;
  renderer.domElement.addEventListener("pointerdown", e => { if (SURF) drag = [e.clientX, e.clientY]; });
  addEventListener("pointerup", () => (drag = null));
  addEventListener("pointermove", e => { if (!SURF || !drag) return; const s = SURF.fov / innerHeight;
    SURF.yaw -= (e.clientX - drag[0]) * s; SURF.pitch = Math.max(-89, Math.min(89, SURF.pitch + (e.clientY - drag[1]) * s)); drag = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener("wheel", e => { if (!SURF) return; e.preventDefault();
    SURF.fov = Math.max(1, Math.min(100, SURF.fov * Math.exp(e.deltaY * 0.001))); $("surfFov").value = Math.min(100, Math.max(10, SURF.fov)); $("surfFovV").textContent = fmt(SURF.fov, 1) + "°"; }, { passive: false });
}
// v0.57: True scale. Real sizes and real distances in the orrery (the surface view always was). Body size does not apply there.
let TRUESCALE = false;
function flyDist(b) {
  if (mode === "true") return b._r * Math.max(1, b._ringRatio || 1) * (b.type === "Star" ? 7 : 4.5);
  return b.type === "Star" ? Math.max(40, b._vis * 20) : Math.max(6, b._vis * 14);
}
function flyDir() {
  const dir = camera.position.clone().sub(controls.target);
  if (dir.lengthSq() < 1e-12) dir.set(1, 0.5, 1);
  dir.y = Math.max(Math.abs(dir.y), 0.6 * Math.hypot(dir.x, dir.z)); return dir.normalize();
}
function placeNear(b) {                         // put the camera beside a body at once (no flight)
  const t = b._obj.position.clone(); fly = null; focus = b; focusPrev = t.clone();
  const dir = flyDir(); controls.target.copy(t); camera.position.copy(t).add(dir.multiplyScalar(flyDist(b)));
}
function trueScaleUI() {
  const v = $("vBody"); if (v) { v.disabled = TRUESCALE; v.parentElement.title = TRUESCALE ? "True scale shows real sizes, so Body size does not apply" : ""; v.parentElement.classList.toggle("off", TRUESCALE); }
  if ($("vTrue")) $("vTrue").checked = TRUESCALE;
  document.querySelectorAll("button[data-true]").forEach(x => { x.classList.toggle("on", TRUESCALE); x.setAttribute("aria-pressed", TRUESCALE); });
  const sg = document.querySelector("#scaleMode .seg"); if (sg) { sg.classList.toggle("true", TRUESCALE); sg.querySelectorAll(".opt").forEach(o => o.setAttribute("aria-checked", String((o.dataset.sc === "1") === TRUESCALE))); }
  modeTagText();
}
function setTrueScale(on, save) {
  on = !!on;
  if (save) { try { localStorage.setItem("gravitas.scale", on ? "true" : "overview"); } catch (e) {} }
  if (on) tsHintDone();   // v0.61: the visitor's own choice is remembered
  if (!S || on === TRUESCALE) { TRUESCALE = on; trueScaleUI(); return; }
  if (SURF) exitSurface(false);
  TRUESCALE = on; fadeFlash();
  const keep = focus || selected;
  setMode(on ? "true" : "styl");
  if (on) setOrigin(keep ? S.world.get(keep.bodyId) : S.main ? S.world.get(S.main.bodyId) : { x: 0, y: 0, z: 0 });
  focus = keep || null; updateScene();
  if (keep && keep._obj) placeNear(keep); else resetView(true);
  trueScaleUI();
}
function flyTo(b) {
  const dir = flyDir();
  const d = flyDist(b);
  const target = b._obj.position.clone();
  focus = b; focusPrev = target.clone();
  fly = { t0: performance.now(), dur: 1000, fromT: controls.target.clone(), fromP: camera.position.clone(), toT: target, toP: target.clone().add(dir.multiplyScalar(d)) };
}
function followFocus() {               // keep the camera locked on a moving body
  if (!focus) { focusPrev = null; return; }
  const p = focus._obj.position;
  if (focusPrev) {
    const d = p.clone().sub(focusPrev);
    if (fly) { fly.fromT.add(d); fly.fromP.add(d); fly.toT.add(d); fly.toP.add(d); }
    else { camera.position.add(d); controls.target.add(d); }
  }
  focusPrev = p.clone();
}
function resetView(instant) {
  if (SURF) exitSurface(false);
  if (!instant) Sound.whoosh(-1);
  focus = null;
  const trueView = TRUESCALE;      // v0.57: the overview, or true scale when it is switched on
  if (S && mode !== (trueView ? "true" : "styl")) { if (!instant) fadeFlash(); setMode(trueView ? "true" : "styl"); instant = true; }
  if (trueView) setOrigin(S && S.main ? S.world.get(S.main.bodyId) : { x: 0, y: 0, z: 0 });
  const e = S ? (trueView ? S.extent : S.extentS) : 1000;
  let toP = trueView ? new THREE.Vector3(e * 0.35, e * 0.55, e * 0.9) : new THREE.Vector3(e * 0.55, e * 0.5, e * 0.85);
  if (!trueView && S && S.fitR) {                                   // back off until every orbit fits the narrower side of the view
    const vf = camera.fov * DEG, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect), half = Math.min(vf, hf) / 2;
    toP = toP.normalize().multiplyScalar(Math.max(S.fitR / Math.sin(half) * 0.92, 30));
  }
  const toT = trueView ? new THREE.Vector3() : new THREE.Vector3(0, -ST_H * 0.3, 0);
  if (instant) { camera.position.copy(toP); controls.target.copy(toT); fly = null; return; }
  fly = { t0: performance.now(), dur: 1200, fromT: controls.target.clone(), fromP: camera.position.clone(), toT, toP };
}
function stepFly(now) {
  if (!fly) return;
  const k = Math.min(1, (now - fly.t0) / fly.dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  controls.target.lerpVectors(fly.fromT, fly.toT, e);
  const fromOff = fly.fromP.clone().sub(fly.fromT), toOff = fly.toP.clone().sub(fly.toT);   // log-distance interpolation
  const d0 = Math.max(fromOff.length(), 1e-9), d1 = Math.max(toOff.length(), 1e-9), dd = Math.exp(Math.log(d0) + (Math.log(d1) - Math.log(d0)) * e);
  camera.position.copy(controls.target).add(fromOff.normalize().lerp(toOff.normalize(), e).normalize().multiplyScalar(dd));
  if (k >= 1) fly = null;
}
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
function pickAt(ev) {
  if (!S) return null;
  mouse.set((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1); ray.setFromCamera(mouse, camera);
  const hits = ray.intersectObjects(S.bodies.map(b => b._mesh), false); return hits.length ? hits[0].object.userData.body : null;
}
let down = null;
renderer.domElement.addEventListener("pointerdown", e => (down = [e.clientX, e.clientY]));
renderer.domElement.addEventListener("pointerup", e => { if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return; const b = pickAt(e);
  if (b) select(b, false); else { const bh = S && !SURF ? beltHit(ray) : null, rh = S && !SURF && !bh ? ringHit(ray) : null;
    if (bh) beltSelect(bh.B); else if (rh) ringSelect(rh.b, rh.ri); else { if (e.button === 0 && typeof stwIsOpen === "function" && stwIsOpen()) stnClose(); if ((selected || SELB || SELR) && !SURF && e.button === 0) $("infoClose").onclick(); } } });   // v0.54: a click on empty space lets go, as on the map
renderer.domElement.addEventListener("dblclick", e => { const b = pickAt(e); if (b) select(b, true); else { const bh = S && !SURF ? beltHit(ray) : null; if (bh) beltFly(bh.B); } });
controls.addEventListener("start", () => { fly = null; });

const keys = new Set();                // WASD move, Q/E rotate, R/F up/down, Home reset
const typing = t => t && (t.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName));   // v0.49: never steer the map while typing
const modalOpen = () => $("rep") && $("rep").style.display === "flex";
addEventListener("keydown", e => {
  if (typing(e.target) || modalOpen() || e.ctrlKey || e.metaKey || e.altKey || MAPMODE) { keys.clear(); return; }   // the map has no camera to steer
  const k = (e.key || "").toLowerCase();         // browser autofill sends key events without a key
  if (k === "home") { resetView(); return; }
  if (k.length === 1 && "wasdqerf".includes(k)) { keys.add(k); fly = null; if ("wasdrf".includes(k)) focus = null; }
});
addEventListener("keyup", e => keys.delete((e.key || "").toLowerCase()));
addEventListener("blur", () => keys.clear());
function keyboardMove(dt) {
  if (!keys.size) return;
  const step = Math.max(camera.position.distanceTo(controls.target), 1e-3) * 0.9 * dt;
  const fwd = controls.target.clone().sub(camera.position); fwd.y = 0; fwd.normalize();
  const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize(), mv = new THREE.Vector3();
  if (keys.has("w")) mv.add(fwd); if (keys.has("s")) mv.sub(fwd); if (keys.has("d")) mv.add(right); if (keys.has("a")) mv.sub(right);
  if (keys.has("r")) mv.y += 1; if (keys.has("f")) mv.y -= 1;
  if (mv.lengthSq()) { mv.normalize().multiplyScalar(step); camera.position.add(mv); controls.target.add(mv); }
  const rot = (keys.has("q") ? 1 : 0) - (keys.has("e") ? 1 : 0);
  if (rot) { const off = camera.position.clone().sub(controls.target).applyAxisAngle(camera.up, rot * 1.4 * dt); camera.position.copy(controls.target).add(off); }
}


// v0.71: a quiet hint under TRUE SCALE when the 3D orrery opens in Overview. It fades by itself, and stops for good
// once the visitor has tried True scale (or after it has been shown five times)
function tsHint() {
  let n = 0; try { n = +(localStorage.getItem("gravitas.tsHint") || 0); } catch (e) {}
  if (TRUESCALE || MAPMODE || SURF || n >= 5 || isPhone()) return;
  try { localStorage.setItem("gravitas.tsHint", String(n + 1)); } catch (e) {}
  let h = $("tsHint");
  if (!h) { h = document.createElement("div"); h.id = "tsHint"; h.innerHTML = `<i>↑</i> Click for true scale`; $("scaleMode").appendChild(h); }
  h.classList.remove("on"); void h.offsetWidth; h.classList.add("on");
  clearTimeout(tsHint._t); tsHint._t = setTimeout(() => h.classList.remove("on"), 7000);
}
function tsHintDone() { try { localStorage.setItem("gravitas.tsHint", "9"); } catch (e) {} const h = $("tsHint"); if (h) h.classList.remove("on"); }
