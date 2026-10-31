// ------------------------------------------------------------------ loop
let last = performance.now(), frameN = 0, dcN = 0;
// labels that would overlap on screen: keep the most important one (selected, stars, big planets), hide the rest
const _dv = new THREE.Vector3();
function declutter() {
  if (!S) return;
  const W = innerWidth, H = innerHeight, items = [];
  for (const B of S.belts || []) { B._label = B.label; B._obj = B.label; B._div = B.div; B._r = 0; B._isMoon = true; }   // v0.62: belt names give way to body names
  for (const b of [...S.bodies, ...(S.belts || [])]) {
    const show = b._label.visible && !document.body.classList.contains("nonames");
    if (!show) { if (b._dc) { b._dc = false; b._div.classList.remove("dc"); } continue; }
    b._obj.getWorldPosition(_dv).project(camera);
    if (_dv.z > 1 || _dv.z < -1) continue;
    if (!b._lw || b === selected || b._div.classList.contains("sel") || dcN % 60 === 0) { const r = b._div.firstElementChild.getBoundingClientRect(); if (r.width) { b._lw = r.width; b._lh = r.height; } }
    const x = (_dv.x + 1) / 2 * W - 5, y = (1 - _dv.y) / 2 * H - 6;
    const pr = b.bl ? -1 : b === YAH.b ? 2e9 : b === selected ? 1e9 : b === focus ? 1e8 : b.type === "Star" ? 1e6 + b._r : (b._isMoon ? 0 : 1e4) + (b.radius || 0);
    items.push({ b, x, y, w: b._lw || 60, h: b._lh || 16, pr });
  }
  items.sort((a, c) => c.pr - a.pr);
  const kept = [];
  for (const it of items) {
    const hit = kept.some(k => it.x < k.x + k.w && it.x + it.w > k.x && it.y < k.y + k.h && it.y + it.h > k.y);
    if (!hit) kept.push(it);
    if (it.b._dc !== hit) { it.b._dc = hit; it.b._div.classList.toggle("dc", hit); }
  }
}
lensPass = new ShaderPass(LensShader); lensPass.enabled = false;
composer.insertPass(lensPass, 1);
const _lv = new THREE.Vector3(), _lv2 = new THREE.Vector3(), _lr = new THREE.Vector3();
function updateLens() {
  const u = lensPass.uniforms; let n = 0;
  if (S) {
    camera.updateMatrixWorld(); _lr.setFromMatrixColumn(camera.matrixWorld, 0);
    for (const b of S.stars) {
      if (!b._bh || n >= 4) continue;
      b._obj.getWorldPosition(_lv); _lv2.copy(_lv).addScaledVector(_lr, b._r * k(b));
      _lv.project(camera); _lv2.project(camera);
      if (_lv.z < -1 || _lv.z > 1) continue;
      const R = Math.hypot((_lv2.x - _lv.x) * camera.aspect, _lv2.y - _lv.y) / 2;
      if (R < 0.002) continue;
      u.uBH.value[n++].set((_lv.x + 1) / 2, (_lv.y + 1) / 2, R, 1);
    }
  }
  u.uN.value = n; u.uAspect.value = camera.aspect; lensPass.enabled = n > 0;
}
// v0.70 frame pacing: never more than ~60 frames a second (144 Hz screens drew 2.4× the work for nothing).
// When nothing moves on screen it draws 30 a second at normal speed and 10 when paused, so a quiet tab barely uses the GPU.
const PACE = { act: performance.now() + 4000, held: new Set(), cam: new THREE.Matrix4(), idleAny: false, slow: 0 };
const _paceAct = () => { PACE.act = performance.now() + 1500; };
for (const ev of ["pointerdown", "pointermove", "wheel", "touchstart", "resize"]) addEventListener(ev, _paceAct, { passive: true });
addEventListener("keydown", e => { PACE.held.add(e.code); _paceAct(); });
addEventListener("keyup", e => { PACE.held.delete(e.code); _paceAct(); });
addEventListener("blur", () => PACE.held.clear());
var TOUCH_SCREEN = matchMedia("(pointer: coarse)").matches;
function paceGap(now) {
  if (typeof LENS !== "undefined" && LENS.open) return 250;      // v0.97: the Lenses window covers the map: 4 frames a second behind it
  const e1 = PACE.cam.elements, e2 = camera.matrixWorld.elements; let moving = false;
  for (let i = 0; i < 16 && !moving; i++) moving = Math.abs(e1[i] - e2[i]) > 1e-5 * (1 + Math.abs(e2[i]));   // a body crawling along at 1× is not "moving"
  PACE.cam.copy(camera.matrixWorld);
  // v0.75.7: the Milky Way is drawn in strips only in the 3D view, so it keeps the pace up only there (on the map it kept
  // the page at 60 frames a second for as long as the visitor stayed on the map)
  const busy = now < PACE.act || moving || fly || PACE.held.size || BAKE.queue.length || (!MAPMODE && SKY.rt && SKY.y >= 0 && SKY.y < SKY.W / 2)
    || (QAUTO.on && !QAUTO.tried && now - QAUTO.t < 30000) || !(speed === 0 || speed === 1 || LIVE) || !S;
  if (busy) return 1000 / 60;
  // v0.71: quieter still. Bodies crawl at 1×, so 15 frames a second look the same. With the game in front
  // (this window not focused) 3 a second is plenty, and a paused, still screen needs only 4
  if (!document.hasFocus() && !TOUCH_SCREEN) return 1000 / 3;    // v0.76.3: a phone or tablet is itself the screen (iPad Safari often reports no focus)
  if (STAR_ANIM.on && QUALITY !== PRESETS.low && (speed !== 0 || LIVE)) return 1000 / 30;   // v0.75.7: flames on screen move smoothly
  return speed === 0 && !LIVE ? 250 : 1000 / 15;
}
// v0.70: write a text only when it changed (a rewrite repaints the panel every frame)
function setText(id, t) { const e = $(id); if (e._t !== t) { e._t = t; e.textContent = t; } }
// v0.75.7: the LIVE mark is written only when it changes
function liveFlag() { const on = speed === 1 && Math.abs(simTime - Date.now()) < 5000; if (liveFlag.on !== on) { liveFlag.on = on; $("liveflag").style.display = on ? "inline" : "none"; } }
// v0.75.7: the 3D names are placed again when the view moved, and otherwise a few times a second (at 1× the bodies
// crawl less than a pixel between frames): each placing rewrites the style of every name on the page
const _lblCam = new THREE.Matrix4();
function labelsTick(now) {
  const moved = !_lblCam.equals(camera.matrixWorld) || !(speed === 0 || speed === 1 || LIVE) || now - (labelsTick.t || 0) > 250 || labelsTick.force;
  if (!moved) return;
  _lblCam.copy(camera.matrixWorld); labelsTick.t = now; labelsTick.force = false; labels.render(scene, camera);
}
function frame(now) {
  if (CB.full && CB.el && CB.el.classList.contains("show")) { requestAnimationFrame(frame); return; }   // v0.91: the combat screen covers everything: nothing else is drawn
  const gap = paceGap(now);
  if (!REDRAW && now - last < gap - 3) { requestAnimationFrame(frame); return; }
  const lag = fenceLag(now);                                         // v0.78.1: the graphics card is still on earlier frames: wait for it
  if (!REDRAW && FENCE.n >= 3 && lag > 50) { requestAnimationFrame(frame); return; }
  if (gap > 20) PACE.idleAny = true;
  STAR_ANIM.on = false;                                              // set again below while such a star is drawn
  { const ft = now - last;                                          // v0.70: background work follows how long frames really take
    if (gap < 20 && (!MAPMODE || MAPL.on)) dynTick(ft, now);
    if (gap < 20) { if (ft > 45) WORK.scale = Math.max(0.05, WORK.scale * 0.5); else if (ft < 24) WORK.scale = Math.min(1, WORK.scale * 1.06); } }
  fpsTick(now);
  const dt = Math.min((now - last) / 1000, 0.1); last = now;
  { const sp = LIVE ? 1 : speed, a = Math.abs(sp);                 // v0.62: star surfaces and flares follow the clock: pause stops them,
    if (QUALITY !== PRESETS.low) STAR_T.value += dt * Math.sign(sp) * Math.min(6, a <= 1 ? a : 1 + 1.25 * Math.log10(a)); }   // v0.71: Low keeps stars still   // reverse runs them back, fast play only feels faster
  if (LIVE) simTime = Date.now(); else simTime += dt * 1000 * speed;   // live never drifts (background tabs, slow frames)
  if (S && MAPMODE && SURF) { SMAP.back = true; setMap(false, false); }    // the surface view starts from the 3D orrery…
  else if (S && SMAP.back && !SURF) { SMAP.back = false; setMap(true, false); }   // …and leads back to the map it came from
  try { ofiltFrame(now); } catch (e) {}
  if (MAPL.on && !MAPMODE) { try { maplTick(); } catch (e) {} }
  if (S && MAPMODE) {                         // system map: no 3D drawing at all, only the clock, the panel and the map
    try {
      computeWorld(simTime);
      if (selected && selected.type !== "Star") {                // the panel's starlight readout (in 3D this comes from updateScene)
        const ww = S.stars.map(st => starlightWho(selected, st, S.world)); selected._ecl = ww.map(w => w.vis); selected._eclWho = ww.map(w => w.by);
      }
      if (selected && $("liveStar")) updateLive(selected);
      if (selected && LIVE_TABS.has(infoTab) && now - panelT > panelGap && Math.abs(simTime - panelSim) > 200 && $("info").style.display !== "none") renderTab(infoTab);
      smapTick(false);
      yahMapTick();
      try { maplTick(); REDRAW = false; if (MAPL.on) fencePush(now); } catch (e) { if (!frame._mlErr) { frame._mlErr = true; logErr(`live map: ${e.message}`); } }
      setText("gametime", gameTime(simTime)); setText("localtime", localTime(simTime)); if (PFULL) pfullClock();
      liveFlag();
      drawViz();
    } catch (e) { if (!frame._mapErr) { frame._mapErr = true; logErr(`system map: ${e.message}`); } }   // never freeze the page
    finally { requestAnimationFrame(frame); }
    return;
  }
  if (S) {
    if (SURF) { updateScene(); surfPose(); }
    else {
    stepFly(now); keyboardMove(dt); controls.update();
    if (!focus && controls.target.length() > 1e4) setOrigin(sceneToWorld(controls.target));   // keep numbers small in free flight
    updateScene(); followFocus();
    }
    if (selected && $("liveStar")) updateLive(selected);
    // panel charts follow the clock: refresh the open tab ~3×/s while simulated time moves
    if (selected && LIVE_TABS.has(infoTab) && now - panelT > panelGap && Math.abs(simTime - panelSim) > 200 && $("info").style.display !== "none") renderTab(infoTab);
  }
  sky.position.copy(camera.position);
  setText("gametime", gameTime(simTime)); setText("localtime", localTime(simTime)); if (PFULL) pfullClock();
  liveFlag();
  if (dcN % 3 === 0) try { sphereLod(); } catch (e) {}
  gtPoll(); gtBegin();
  // v0.78.1: extra work only while the card keeps up. A card that is always a little behind (a slow computer that still
  // runs) gets one small piece four times a second, so its surfaces and Milky Way still arrive, slowly
  const slow = lag >= 40, ws = WORK.scale;
  if (!slow || now - (frame._bk || 0) > 250) {
    if (slow) { frame._bk = now; WORK.scale = Math.min(ws, 0.1); }
    try { skyTick(); } catch (e) { SKY.y = -1; }
    try { bakeTick(); } catch (e) { if (!frame._bakeErr) { frame._bakeErr = true; logErr(`surface bake: ${e.message}`); } }
    if (slow) WORK.scale = ws;
  }
  if (S && !SURF && !S._ready3d) prep3D();                           // v0.78.1: the loading screen (v0.9: before the first draw)
  // v0.9: no 3D drawing until its shaders (the scene's and the glow's) are compiled: using one earlier would make the
  // browser wait for the driver, and on Windows every Chrome tab with it
  if (!PREP.compiled && warmed(PREP.key)) PREP.compiled = true;        // (also when the loading screen was skipped)
  if (warmPost() && PREP.compiled) { updateLens(); composer.render(); REDRAW = false; gtEnd(); fencePush(now); } else gtEnd();
  labelsTick(now); drawViz();
  if (S && !SURF && PREP.on) prepTick(now);
  if ((dcN = (dcN + 1) % 1e6) % 6 === 0) declutter();
  if ((YAH.el && YAH.el.style.display !== "none") || (TGT.el && TGT.el.style.display !== "none")) yahMapTick();   // v0.82.4: the target marker too
  if (YAH.pin && YAH.pin.visible) yahPinTick();          // leaving the map hides its marker
  if (S && Sound.ready && (frameN = (frameN + 1) % 6) === 0) {        // ambience volume from the largest apparent body size
    let a = 0; for (const b of S.bodies) a = Math.max(a, b._r * k(b) / Math.max(camera.position.distanceTo(b._obj.position), 1e-6));
    Sound.setProximity(Math.min(1, Math.max(0, (Math.log10(a) + 2.2) / 1.9)));
  }
  requestAnimationFrame(frame);
}
applyView();
$("appVer").textContent = APP_VERSION;
function __look(name, dR = 3, az = 35, el = 12) {        // test hook: true scale, camera beside a body on its lit side
  const b = S && S.bodies.find(x => shortName(x, S.sys.name) === name || x.name === name); if (!b) return "no body";
  setTrueScale(true); focus = b; updateScene();
  const hs = (b.type !== "Star" && hostStar(b)) || S.main, p = b._obj.position, up = new THREE.Vector3(0, 1, 0);
  const s = hs && hs !== b ? hs._obj.position.clone().sub(p).normalize() : new THREE.Vector3(1, 0, 0);
  const dir = s.applyAxisAngle(up, az * DEG).addScaledVector(up, Math.tan(el * DEG)).normalize();
  fly = null; controls.target.copy(p); camera.position.copy(p).addScaledVector(dir, b._r * Math.max(1, b.type === "Star" ? 1 : 1) * dR); return "ok";
}
window.__gv = { get CB() { return CB; }, get speed() { return speed; }, get OP() { return OP; }, cbView: () => cbView(), cbRemote: v => cbRemote(v), warm, warmed, syncRouteInfo: () => syncRouteInfo(), JRN_CACHE: () => JRN.cache.keys(), get TICK() { return TICK; }, get FENCE() { return FENCE; }, get PREP() { return PREP; }, QAUTO, setQuality, fenceHit, autoCap, look: __look, computeWorld, get S() { return S; }, get SURF() { return SURF; }, get MAPMODE() { return MAPMODE; }, get SMAP() { return SMAP; }, setMap: (on) => setMap(on, false), LS_MM, dist, shortName, relPos, camera, controls, bloom, outPass, LIN, SKY, renderer, beltFly, setTrueScale, get HOVR() { return HOVR; }, get SELR() { return SELR; }, get QUALITY() { return QUALITY; }, PRESETS, QAUTO, WORK, PACE, paceGap, scene, composer, sky, loadSystem, get selected() { return selected; }, select, Sound, structModel, get STRUCT_GLYPH() { return STRUCT_GLYPH; }, THREE, get SYNC() { return SYNC; }, get YAH() { return YAH; }, get PAIR() { return PAIR; }, bakeRequest, DYN, dynTick, prApply, GT, get FPS() { return FPS; }, BAKE };          // test hooks (read-only use)
{ let q0 = null; try { q0 = localStorage.getItem("gravitas.quality"); } catch (e) {}
  setQuality(PRESETS[q0] ? q0 : SOFT_GL || TOUCH_SCREEN ? "low" : "auto", false);          // v0.77.2: phones and tablets start on Low (View can raise it)
  //          // v0.70: no saved choice: Auto, which starts at Low
  if (SOFT_GL) gpuNote("soft");
  // v0.71: without a graphics card the gravity well grid starts off (it can be turned on in View)
  let hadView = null; try { hadView = localStorage.getItem("gravitas.view"); } catch (e) {}
  if (SOFT_GL && !hadView) { $("vGrid").checked = false; applyView(); } }
$("vQuality").addEventListener("change", e => { setQuality(e.target.value, true); toast(`Quality: ${e.target.value} · ${QUALITY.note}`); });

// ---- v0.72.1: when the graphics card resets or the tab dies
// A small note of what was on screen is kept in this browser every 2 s. If the last visit ended without closing
// normally, the next visit says so once, starts on Low, and the problem report window carries that note.
const CRUMB_K = "gravitas.crumb";
let CRUMB_LAST = null, CRASH_LAST = null;
try { CRUMB_LAST = JSON.parse(localStorage.getItem(CRUMB_K) || "null"); } catch (e) {}
// v0.75.7: an unexpected stop is kept apart for a week (until a report carries it), so a later normal visit or a reload
// does not wipe it before the visitor gets to the Report button
try {
  if (CRUMB_LAST && !CRUMB_LAST.clean) localStorage.setItem("gravitas.lastCrash", JSON.stringify(CRUMB_LAST));
  CRASH_LAST = JSON.parse(localStorage.getItem("gravitas.lastCrash") || "null");
  if (CRASH_LAST && Date.now() - CRASH_LAST.t > 7 * 86400e3) { CRASH_LAST = null; localStorage.removeItem("gravitas.lastCrash"); }
} catch (e) {}
function crumbWrite(clean) {
  try {
    const f = focus || selected, d = f && f._obj ? camera.position.distanceTo(f._obj.position) : null;
    const jobs = BAKE.queue.map(j => j.res).join("/");
    localStorage.setItem(CRUMB_K, JSON.stringify({ t: Date.now(), clean: !!clean, v: APP_VERSION, sys: S && S.sys.name,
      view: MAPMODE ? "map" : SURF ? "surface" : TRUESCALE ? "true scale" : "overview", q: Object.keys(PRESETS).find(k => PRESETS[k] === QUALITY),
      near: f ? f.name : null, dist: d != null ? +d.toPrecision(3) : null, size: f ? +(f._r * k(f)).toPrecision(3) : null,
      bakes: jobs || null, k: +DYN.k.toFixed(2), fps: FPS, lost: !!crumbWrite.lost }));
  } catch (e) {}
}
// v0.76.3: phones and tablets (iPad Safari, Android Chrome) close a page in the background without a goodbye, so a hidden
// page counts as stopped cleanly. Only a page that stops while on screen is reported as an unexpected stop.
setInterval(() => { if (document.visibilityState === "visible") crumbWrite(false); }, 2000);
addEventListener("pagehide", () => crumbWrite(true));
document.addEventListener("visibilitychange", () => crumbWrite(document.visibilityState !== "visible"));
document.addEventListener("freeze", () => crumbWrite(true));
if (CRUMB_LAST && !CRUMB_LAST.clean && Date.now() - CRUMB_LAST.t < 6 * 3600e3) {
  const was = CRUMB_LAST.q;
  if (was && was !== "low") setQuality("low", false);   // v0.78.2: Low for this visit only (it was saved, and a strong card stayed on Low)
  gpuNote("crash");
}
renderer.domElement.addEventListener("webglcontextlost", e => {
  e.preventDefault(); crumbWrite.lost = true; crumbWrite(false);
  try { localStorage.setItem("gravitas.quality", "low"); } catch (x) {}
  status("Your graphics card reset while drawing GRAVITAS. It will reload on Low quality.", true);
  setTimeout(() => location.reload(), 2500);            // a fresh start is the only safe way back for every texture
}, false);
