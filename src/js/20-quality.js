// ---------------------------------------------------------------- quality
const APP_VERSION = "v0.92.5";
const PRESETS = {
  // v0.70: Low is truly light (works on any computer and browser): small surfaces, no Milky Way, no glow, no live map
  low:    { pr: 0.75, msaa: 0, bloom: false, tex: 256,  sky: 0,    bakeBudget: 0.12e6, panel: 600, note: "light: works on any computer" },
  // v0.78.1: Medium bakes surfaces in smaller pieces per frame (0.25 M pixels, was 0.4 M)
  medium: { pr: 1,    msaa: 0, bloom: true,  tex: 1024, sky: 1024, bakeBudget: 0.25e6,  panel: 300, note: "balanced" },
  high:   { pr: 1.5,  msaa: 4, bloom: true,  tex: 2048, sky: 2048, bakeBudget: 0.8e6,  panel: 120, note: "sharp, anti-aliased, 2048 px surfaces" },
  ultra:  { pr: 2,    msaa: 8, bloom: true,  tex: 4096, sky: 4096, bakeBudget: 1.4e6,  panel: 90,  note: "full resolution, 8× MSAA, 4096 px surfaces" },
};
let QUALITY = PRESETS.high;
// is the browser drawing with the graphics card? Without it (hardware acceleration off) 3D runs on the CPU and is slow
const GPU = (() => { try { const gl = renderer.getContext(), x = gl.getExtension("WEBGL_debug_renderer_info"); return String(x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); } catch (e) { return "unknown"; } })();
const SOFT_GL = /SwiftShader|llvmpipe|softpipe|software|Basic Render/i.test(GPU);
function gpuNote(kind) {
  const key = "gravitas.gpuNote." + kind;
  try { if (kind !== "crash" && localStorage.getItem(key)) return; } catch (e) {}
  if ($("gpuNote")) { if (kind !== "crash") return; $("gpuNote").remove(); }   // the crash note matters more than any other
  const d = document.createElement("div"); d.id = "gpuNote"; d.className = "panel";
  d.innerHTML = (kind === "soft"
    ? "Your browser is not using the graphics card, so GRAVITAS may run slowly. Turn on hardware acceleration in your browser settings for smooth motion. Quality was set to Low, and the flat system map opens first because it runs smoothly anywhere."
    : kind === "crash" ? "Last time GRAVITAS stopped unexpectedly, maybe while zooming in. It runs on Low for this visit (View can raise it). If it happened again, the Report button sends us what was on screen, which helps us find it."
    : kind === "lowered" ? "GRAVITAS lowered its quality to keep running smoothly on this computer. For sharper 3D, use Chrome or Edge with hardware acceleration on, then pick a higher Quality in View."
    : "GRAVITAS is running slowly here. Try Quality: Low in View, or turn on hardware acceleration in your browser settings.") + ` <button title="Hide">✕</button>`;
  d.querySelector("button").onclick = () => { d.remove(); try { localStorage.setItem(key, "1"); } catch (e) {} };
  document.body.appendChild(d);
}
// frames per second, shown next to the View button (and sent with problem reports)
let FPS = 0, _fpsN = 0, _fpsT = 0, _slowN = 0;
const _fpsStart = performance.now();
function fpsTick(now) {
  _fpsN++;
  if (now - _fpsT < 500) return;
  if (now - _fpsT > 2000) { _fpsN = 0; _fpsT = now; return; }          // tab was in the background: skip this reading
  FPS = Math.round(_fpsN * 1000 / (now - _fpsT)); _fpsN = 0; _fpsT = now;
  const idle = typeof PACE !== "undefined" && PACE.idleAny; if (idle) PACE.idleAny = false;
  const el = $("fpsV"); if (el) { el.textContent = FPS; $("fps").dataset.lvl = FPS >= 50 ? "ok" : FPS >= 25 ? "mid" : "low"; }
  if (idle) { _slowN = 0; return; }                                   // a quiet screen draws slowly on purpose: not a slow computer
  _slowN = FPS < 20 && S && now - _fpsStart > 15000 ? _slowN + 1 : 0;
  if (_slowN === 12 && QUALITY !== PRESETS.low && !QAUTO.on) gpuNote("slow");    // six seconds below 20 fps
  qautoTick(now);
}
function guessQuality() {
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  if (mobile) return "low";
  // v0.50: strong graphics cards start at High (an RTX 5080 ran at 240 FPS on Medium)
  // v0.75.7: laptop versions of these cards share power and heat with the processor: they start at Medium (Auto can climb)
  if (/Laptop|Mobile|Max-Q|\bMQ\b/i.test(GPU)) return "medium";
  if (/RTX\s?[2-9]0[6-9]0|RTX\s?(?:A|PRO)?\s?[4-6]000|Radeon RX\s?(?:[67][6-9]\d0|9\d{3})|Apple M\d (?:Pro|Max|Ultra)/i.test(GPU)) return "high";
  return "medium";
}
// v0.72 dynamic resolution: when 3D frames take longer than ~45 fps allows, the 3D view is drawn with fewer pixels
// (panels and text stay sharp), and sharper again once there is room. Never below half the chosen sharpness
// v0.72.2: only three steps (100 %, 75 %, 50 %) and long pauses between them: every change re-creates the drawing
// buffers, which is itself a hitch, so it must happen rarely
const DYN = { k: 1, t: 0, ema: 17, down: 0, steps: [1, 0.75, 0.5] };
// video memory guard: the 3D view never uses more than a 4K screen's worth of pixels, and anti-aliasing samples are
// halved until the drawing buffers fit in about 200 MB (High/Ultra at 2× sharpness could ask for close to 1 GB)
function prApply(resize = true) {
  const area = Math.max(1, innerWidth * innerHeight), cap = Math.sqrt(8.3e6 / area);
  const pr = Math.max(0.5, Math.min(devicePixelRatio, QUALITY.pr, cap) * DYN.k);
  let ms = QUALITY.msaa; while (ms > 0 && area * pr * pr * 8 * ms > 200e6) ms = ms > 2 ? ms / 2 : 0;
  for (const rt of [composer.renderTarget1, composer.renderTarget2]) if (rt.samples !== ms) { rt.samples = ms; rt.dispose(); }
  DYN.ms = ms; DYN.pr = pr;
  if (renderer.getPixelRatio() !== pr) REDRAW = true;
  renderer.setPixelRatio(pr); composer.setPixelRatio && composer.setPixelRatio(pr);
  if (resize) composer.setSize(innerWidth, innerHeight);
}
function dynTick(ft, now) {                         // called for frames drawn at full pace (the visitor is moving things)
  if (ft > 250) return;                                              // a tab switch or a hitch, not a trend
  DYN.ema += (ft - DYN.ema) * 0.1;
  if (now - DYN.t < 4000) return;
  const i = DYN.steps.indexOf(DYN.k);
  if (DYN.ema > 24 && i < DYN.steps.length - 1) { DYN.k = DYN.steps[i + 1]; DYN.t = DYN.down = now; prApply(); }
  else if (DYN.ema < 17.5 && i > 0 && now - DYN.down > 20000) { DYN.k = DYN.steps[i - 1]; DYN.t = now; prApply(); }
}
// v0.72.2 graphics card watchdog. Where the browser allows it (EXT_disjoint_timer_query_webgl2), GRAVITAS measures
// how long the graphics card really spends on each 3D frame. Too long: background work stops at once and the 3D view
// gets fewer pixels. Far too long, again and again: quality steps down one level, so the card is never pushed to a reset
const GT = { gl: null, ext: null, q: null, on: false, k: 1, bad: [], ms: 0 };
try { GT.gl = renderer.getContext(); GT.ext = GT.gl.getExtension("EXT_disjoint_timer_query_webgl2"); } catch (e) {}
function gtBegin() { if (!GT.ext || GT.q || GT.on) return; try { GT.q = GT.gl.createQuery(); GT.gl.beginQuery(GT.ext.TIME_ELAPSED_EXT, GT.q); GT.on = true; } catch (e) { GT.ext = null; } }
function gtEnd() { if (!GT.on) return; GT.on = false; try { GT.gl.endQuery(GT.ext.TIME_ELAPSED_EXT); } catch (e) { GT.ext = null; } }
function gtPoll() {
  const gl = GT.gl, q = GT.q; if (!q || GT.on) return;
  if (!GT.ext) { GT.q = null; return; }
  if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) return;
  const bad = gl.getParameter(GT.ext.GPU_DISJOINT_EXT), ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
  gl.deleteQuery(q); GT.q = null; if (bad) return;
  GT.ms = ms; const now = performance.now();
  GT.k = ms > 30 ? Math.max(0.1, GT.k * 0.5) : Math.min(1, GT.k * 1.05);         // background work follows the card's real load
  if (ms > 45) { WORK.scale = 0.05; const i = DYN.steps.indexOf(DYN.k); if (i < DYN.steps.length - 1 && now - DYN.t > 1000) { DYN.k = DYN.steps[i + 1]; DYN.t = DYN.down = now; prApply(); } }
  if (ms > 150) {
    GT.bad = GT.bad.filter(t => now - t < 10000); GT.bad.push(now);
    const order = ["low", "medium", "high", "ultra"], cur = order.find(k => PRESETS[k] === QUALITY);
    if (GT.bad.length >= 3 && cur !== "low" && now >= (FENCE.calm || 0) /* v0.78.1: not while the 3D view is loading */) { GT.bad = []; setQuality(order[order.indexOf(cur) - 1], !QAUTO.on, QAUTO.on); gpuNote("lowered"); }
  }
}
// v0.78.1 graphics card backlog brake. It works in every WebGL2 browser, also where the card's timer above is missing
// (and while ?perf=1 has it). After each drawn frame a marker (a fence) is placed in the card's work list. If markers
// stay unfinished, the card is behind: no extra work (surfaces, Milky Way) is given to it, and while three frames are
// still waiting no new frame is drawn at all. So the card's list never piles up, and the browser itself (tabs,
// bookmarks, other windows, which the same card draws) stays responsive. Long waits again and again lower the quality
const FENCE = { gl: null, q: [], lag: 0, n: 0, hits: [], maxLag: 0 };
try { const g = renderer.getContext(); if (g.fenceSync && g.getSyncParameter) FENCE.gl = g; } catch (e) {}
function fenceLag(now) {                            // how long the oldest unfinished frame has waited, ms (0: the card is idle)
  const gl = FENCE.gl; if (!gl) return 0;
  try {
    while (FENCE.q.length && gl.getSyncParameter(FENCE.q[0].s, gl.SYNC_STATUS) === gl.SIGNALED) { gl.deleteSync(FENCE.q.shift().s); }
  } catch (e) { FENCE.gl = null; FENCE.q.length = 0; return 0; }
  // a long wait counts only when this page kept asking all along: after the page itself was busy (a long script, a
  // background tab) the markers simply were not read yet, which says nothing about the graphics card
  const steady = now - (FENCE.polled || 0) < 100; FENCE.polled = now;
  if (FENCE.q.length && now - FENCE.q[0].t > 4000) { for (const f of FENCE.q.splice(0)) try { gl.deleteSync(f.s); } catch (e) {} if (steady) fenceHit(now, 4000); }   // never wait for ever
  FENCE.n = FENCE.q.length; FENCE.lag = FENCE.n ? now - FENCE.q[0].t : 0;
  if (steady) FENCE.maxLag = Math.max(FENCE.maxLag, FENCE.lag);
  if (FENCE.lag > 400 && steady && !FENCE.hitNow) { FENCE.hitNow = true; fenceHit(now, FENCE.lag); }
  if (!FENCE.n) FENCE.hitNow = false;
  return FENCE.lag;
}
function fencePush(now) {
  const gl = FENCE.gl; if (!gl || FENCE.q.length > 8) return;
  try { const s = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); if (s) FENCE.q.push({ s, t: now }); } catch (e) { FENCE.gl = null; }
}
// the card needed more than 0.4 s for one frame: background work stops, the 3D view gets fewer pixels, and when it
// happens three times in 15 seconds the quality steps down. Auto goes straight back to Low and stays there on this computer
function fenceHit(now, ms) {
  WORK.scale = 0.05; WORK.hold = Math.max(WORK.hold, now + 1500);
  if (typeof S === "undefined" || !S || now < (FENCE.calm || 0)) return;   // loading a system or the 3D view is allowed a long frame
  const i = DYN.steps.indexOf(DYN.k); if (!MAPMODE && i < DYN.steps.length - 1 && now - DYN.t > 1000) { DYN.k = DYN.steps[i + 1]; DYN.t = DYN.down = now; prApply(); }
  FENCE.hits = FENCE.hits.filter(t => now - t < 15000); FENCE.hits.push(now);
  const order = ["low", "medium", "high", "ultra"], cur = order.find(k => PRESETS[k] === QUALITY);
  if (cur === "low") return;
  if (QAUTO.on) { QAUTO.tried = true; QAUTO.t = now; autoCap(ms > 1000 || FENCE.hits.length >= 2); FENCE.hits = []; setQuality("low", false, true); gpuNote("lowered"); }
  else if (FENCE.hits.length >= 3) { FENCE.hits = []; setQuality(order[order.indexOf(cur) - 1], true); gpuNote("lowered"); }
}
// Auto remembers (for two weeks) that Medium was too much for this computer, so the next visit does not try it again
function autoCap(set) {
  try {
    if (set) { localStorage.setItem("gravitas.autoCap", String(Date.now())); return true; }
    const t = +localStorage.getItem("gravitas.autoCap") || 0; return Date.now() - t < 14 * 864e5;
  } catch (e) { return false; }
}
// v0.70 Auto (the default): every visit starts at Low, which works anywhere. When the frames stay smooth it steps up to
// Medium; when a step makes it slow it steps back down. High and Ultra are only ever chosen by the visitor.
const QAUTO = { on: false, t: 0, good: 0, bad: 0, tried: false };
function qautoTick(now) {
  if (!QAUTO.on || !S || MAPMODE || document.hidden || now - QAUTO.t < 4000) return;
  const atLow = QUALITY === PRESETS.low;
  if (atLow && !QAUTO.tried && !SOFT_GL && !/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) && !autoCap(false)) {
    // v0.78.1: Medium is tried only when the card had room to spare all along (no frame waited on it), never during a load
    const room = FENCE.maxLag < 40 && !document.getElementById("prep3d")?.classList.contains("on"); FENCE.maxLag = 0;
    QAUTO.good = FPS >= 45 && room ? QAUTO.good + 1 : 0;
    if (QAUTO.good >= 4) { QAUTO.tried = true; QAUTO.t = now; QAUTO.good = 0; setQuality("medium", false, true); }
  } else if (!atLow) {
    QAUTO.bad = FPS < 30 ? QAUTO.bad + 1 : 0;                        // v0.78.1: Medium must keep 30 fps, and 3 checks are enough
    if (QAUTO.bad >= 3) { QAUTO.t = now; QAUTO.bad = 0; setQuality("low", false, true); gpuNote("lowered"); }
  }
}
function setQuality(name, save, fromAuto) {
  if (name === "auto") { QAUTO.on = true; QAUTO.tried = false; QAUTO.t = performance.now(); name = "low"; }
  else if (!fromAuto) QAUTO.on = false;
  QUALITY = PRESETS[name] || PRESETS.low; $("vQuality").value = QAUTO.on ? "auto" : name;
  document.body.classList.toggle("lowfx", QUALITY === PRESETS.low || QUALITY === PRESETS.medium);   // no blurred panels over the 3D view
  const qa = $("vQuality").querySelector('option[value="auto"]'); if (qa) qa.textContent = QAUTO.on ? `Auto (${name[0].toUpperCase() + name.slice(1)})` : "Auto (recommended)";
  WORK.scale = Math.min(WORK.scale, 0.25); WORK.hold = Math.max(WORK.hold, performance.now() + 800);
  prApply(false);
  composer.setSize(innerWidth, innerHeight);
  if (S) { bakeDisposeAll(); for (const b of S.bodies) if (b.type !== "Star") bodyFlat(b); skyBuild(S.sys.coords);
    if (!fromAuto && QUALITY !== PRESETS.low) { S._ready3d = false; if (!MAPMODE) prep3D(); } }   // v0.78.1: a higher quality opens with the loading screen again   // surfaces are baked again at the new size, lazily
  panelGap = Math.max(panelGap, QUALITY.panel);
  if (save) try { localStorage.setItem("gravitas.quality", QAUTO.on ? "auto" : name); } catch (e) {}
  applyView();
}
// v0.71: what the quality setting changes in a loaded system: grid density, star surfaces, belt rocks in Overview
function qualityScene() {
  const low = QUALITY === PRESETS.low;
  if (!S) return;
  for (const b of S.bodies) if (b.type !== "Star" && b._mesh) {
    const m = b._mesh.material; if (m.defines && m.defines.LITE !== (low ? 1 : 0)) { m.defines.LITE = low ? 1 : 0; m.needsUpdate = true; }
    const a = b._atm && b._atm.material; if (a && a.defines && a.defines.ATM_N !== (low ? 4 : 10)) { a.defines.ATM_N = low ? 4 : 10; for (const m of b._atmMats || [a]) m.needsUpdate = true; }   // v0.90: both sides (they share the defines)
  }
  for (const b of S.stars) { const m = b._mesh && b._mesh.material; if (m && m.defines && m.defines.STAR_LITE !== (low ? 1 : 0)) { m.defines.STAR_LITE = low ? 1 : 0; m.needsUpdate = true; } }
  for (const g of [S.gridT, S.gridS]) { const q = Object.keys(PRESETS).find(k => PRESETS[k] === QUALITY); if (g.mesh.geometry.userData.q !== q) { g.mesh.geometry.dispose(); g.mesh.geometry = gridGeo(g.extent); } }
  for (const b of S.stars) if (b._prom) b._prom.visible = !low;                    // Low: no prominences at the limb
  for (const B of S.belts || []) if (B.styl) B.styl.traverse(o => { if (!o.isInstancedMesh) return; if (o.userData.n0 == null) o.userData.n0 = o.count; o.count = low ? Math.ceil(o.userData.n0 / 3) : o.userData.n0; });
}
function applyView() {
  document.body.classList.toggle("nobdg", !$("vBadges").checked);
  document.body.classList.toggle("nonames", !$("vNames").checked);
  document.body.classList.toggle("alldet", $("vDetails").checked);
  document.documentElement.style.setProperty("--lbl", $("vLblSize").value + "px");
  bloom.enabled = $("vGlow").checked && QUALITY.bloom;
  qualityScene();
  if (!S) return;
  S.gridT.mesh.visible = mode === "true" && $("vGrid").checked;
  S.gridS.mesh.visible = mode === "styl" && $("vGrid").checked;
  for (const o of S.orbits) o.line.visible = $("vOrbits").checked && !SURF;
  if (SURF) S.gridT.mesh.visible = false;
  for (const b of S.bodies) {
    if (b._label) b._label.visible = !(SURF && SURF.b === b);
    b._ex.rings.forEach(m => (m.visible = $("vRings").checked));
    (b._ex.belts || []).forEach(m => (m.visible = m.userData.mode === (mode === "styl" ? "styl" : "true") && $("vRings").checked && (!SURF || $("surfBelts").checked)));   // surface view: belts only on request
    b._ex.glow.forEach(m => (m.visible = $("vGlow").checked));
    if (b.type !== "Star") {
      const on = !!b._atm && $("vAtm").checked;
      b._mesh.material.uniforms.uAtm.value.copy(on ? b._atmCol : new THREE.Color(0, 0, 0));
      if (b._atm) b._atm.visible = on;
    }
  }
}
document.querySelectorAll("#view input, #view select").forEach(i => i.addEventListener("input", applyView));
