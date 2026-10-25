// ------------------------------------------------------------ v0.75.7 measuring panel (?perf=1)
// Open the site with ?perf=1 to see what each frame costs on this computer: script time, and graphics card time split
// into the parts of a frame (surface bakes, Milky Way, the 3D scene, glow, final pass, live map). Nothing is sent
// anywhere. The Copy button puts the numbers on the clipboard, to paste into a problem report.
// While it is open, the graphics card watchdog's own timer is paused (a card can time only one thing at once).
const PERF = { on: /[?&]perf=(1|sync)/.test(location.search), sync: /[?&]perf=sync/.test(location.search), ext: null, gl: null, pend: [], acc: {}, frames: 0, js: 0, t0: 0, el: null, last: "" };
// v0.9: ?perf=sync times each part by waiting for the card before and after it (slow, distorts the frame rate, but works
// with any card or software renderer that has no GPU timer). For finding the heavy parts, not for everyday use
const _px = new Uint8Array(4), perfWait = gl => { try { const cur = gl.getParameter(gl.FRAMEBUFFER_BINDING); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, _px); gl.bindFramebuffer(gl.FRAMEBUFFER, cur); } catch (e) {} };   // the screen's own pixels: a read there waits for all work sent so far
if (PERF.on) {
  try { PERF.gl = renderer.getContext(); PERF.ext = PERF.sync ? null : PERF.gl.getExtension("EXT_disjoint_timer_query_webgl2"); } catch (e) {}
  window.__perf = PERF;                                              // read by the load bench
  GT.ext = null;                                                     // the watchdog's timer would collide with ours
  renderer.info.autoReset = false;
  // time one part of the frame on the graphics card (queries are read back a few frames later, never waited for)
  const seg = (name, fn) => function (...a) {
    const gl = PERF.gl, ext = PERF.ext; let q = null;
    if (PERF.sync) { perfWait(gl); const t = performance.now();
      try { return fn.apply(this, a); } finally { perfWait(gl); const d = performance.now() - t; PERF.acc[name] = (PERF.acc[name] || 0) + d; PERF.mx = PERF.mx || {}; PERF.mx[name] = Math.max(PERF.mx[name] || 0, d); } }
    if (ext) { try { q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); } catch (e) { q = null; } }
    try { return fn.apply(this, a); }
    finally { if (q) { try { gl.endQuery(ext.TIME_ELAPSED_EXT); PERF.pend.push([name, q]); } catch (e) {} } }
  };
  bakeTick = seg("surface bakes", bakeTick);
  skyTick = seg("Milky Way", skyTick);
  maplTick = seg("live map", maplTick);
  composer.passes.forEach((p, i) => { p.render = seg(p === bloom ? "glow" : p === outPass ? "final pass" : p === lensPass ? "lens" : i === 0 ? "3D scene" : "pass " + i, p.render); });
  const inner = frame;
  frame = function (now) {
    const l0 = last, t = performance.now(); inner(now);
    if (last !== l0) {                                               // a frame was drawn (not skipped by the pacing)
      PERF.js += performance.now() - t; PERF.frames++;
      PERF.draws = renderer.info.render.calls; PERF.tris = renderer.info.render.triangles;   // v0.78: 0 on a map without the 3D layer (no stale numbers)
      renderer.info.reset();
    }
    perfPoll(); perfShow(now);
  };
}
function perfPoll() {
  const gl = PERF.gl, ext = PERF.ext; if (!ext) return;
  while (PERF.pend.length) {
    const [name, q] = PERF.pend[0];
    if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
    PERF.pend.shift();
    const bad = gl.getParameter(ext.GPU_DISJOINT_EXT), ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; gl.deleteQuery(q);
    if (!bad) PERF.acc[name] = (PERF.acc[name] || 0) + ms;
  }
  if (PERF.pend.length > 400) { for (const [, q] of PERF.pend.splice(0)) gl.deleteQuery(q); }   // never pile up
}
function perfShow(now) {
  if (PERF.closed || now - PERF.t0 < 1000) return;                     // v0.92.1: closed with its Close button
  const n = Math.max(1, PERF.frames), f = v => (v / n).toFixed(2);
  if (!PERF.el) {
    PERF.el = document.createElement("div"); PERF.el.id = "perfBox";
    Object.assign(PERF.el.style, { position: "fixed", right: "10px", top: "60px", zIndex: 50, padding: "8px 10px", background: "rgba(5,3,10,.88)", border: "1px solid #6ae8ff66", borderRadius: "8px", font: "11px/1.45 ui-monospace, Consolas, monospace", color: "#cfe9ff", whiteSpace: "pre", pointerEvents: "auto" });
    document.body.appendChild(PERF.el);
  }
  const gpu = Object.values(PERF.acc).reduce((a, b) => a + b, 0), q = Object.keys(PRESETS).find(k => PRESETS[k] === QUALITY);
  const cv = renderer.domElement, rows = [
    `GRAVITAS ${APP_VERSION} · measuring`,
    `view        ${MAPMODE ? "system map" : SURF ? "surface" : "3D"} · quality ${q} · sharpness ${Math.round(DYN.k * 100)} %`,
    `frames      ${FPS} fps · pace ${Math.round(1000 / Math.max(1, paceGap(performance.now() + 1e7)))} fps when idle`,
    PERF.draws ? `drawing     ${cv.width}×${cv.height} px · ${PERF.draws} draws · ${Math.round((PERF.tris || 0) / 1000)} k triangles` : `drawing     no 3D drawing (the map alone)`,
    `script      ${f(PERF.js)} ms a frame`,
    PERF.ext || PERF.sync ? `graphics    ${f(gpu)} ms a frame${PERF.sync ? " (sync timing)" : ""}` : `graphics    no GPU timer in this browser`,
    ...Object.entries(PERF.acc).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k.padEnd(14)}${f(v)} ms`),
    `memory      ${renderer.info.memory.textures} textures · ${renderer.info.memory.geometries} meshes`,
    GPU,
  ];
  PERF.last = rows.join("\n");
  PERF.el.textContent = PERF.last;
  const b = document.createElement("button"); b.textContent = "Copy"; Object.assign(b.style, { display: "block", marginTop: "6px", font: "inherit" });
  b.onclick = () => { try { navigator.clipboard.writeText(PERF.last); b.textContent = "Copied"; } catch (e) {} };
  PERF.el.appendChild(b);
  const x = document.createElement("button"); x.textContent = "Close"; x.title = "Close the measuring box (it opens again with ?perf=1 in the address)";
  Object.assign(x.style, { display: "inline-block", marginTop: "6px", marginLeft: "6px", font: "inherit" }); b.style.display = "inline-block";
  x.onclick = () => { PERF.closed = true; PERF.el.remove(); PERF.el = null; };
  PERF.el.appendChild(x);
  PERF.js = 0; PERF.frames = 0; PERF.acc = {}; PERF.t0 = now;
}

// v0.75.8/v0.76: the little moon in the GRAVITAS logo. Its endless motion made the browser redo that part of the page
// 60 times a second, also while the map sat still or the game was in front. It now circles for a few turns when the
// page opens and whenever the pointer is over the logo, and rests the rest of the time
{
  const lg = document.querySelector("svg.glogo");
  if (lg && lg.pauseAnimations) {
    let t = 0; const rest = () => { clearTimeout(t); t = setTimeout(() => { try { lg.pauseAnimations(); } catch (e) {} }, 14000); };
    const go = () => { clearTimeout(t); try { lg.unpauseAnimations(); } catch (e) {} };
    lg.addEventListener("pointerenter", go); lg.addEventListener("pointerleave", rest);
    rest();
  }
}
