// ==================================================================== warp
// Jumping to another system: frame-shift countdown (recorded voice), witch-space tunnel (WebGL shader),
// then drop-out flash and a glide into the new system. Self-contained: own canvas, own audio files.
const Warp = (() => {
  const FILES = ["charge", "engage", "witchspace", "dropout", "blip", "v_charging", "v_4", "v_3", "v_2", "v_1", "v_engage"];
  const buf = {}; let loading = null;
  function preload() {
    if (loading) return loading;
    if (!Sound.ready) return Promise.resolve();
    loading = Promise.all(FILES.map(async f => {
      try { const r = await fetch(`assets/audio/${f}.mp3`); buf[f] = await Sound.ctx.decodeAudioData(await r.arrayBuffer()); } catch (e) { console.warn("warp audio", f, e); }
    }));
    return loading;
  }
  const play = (f, o = {}) => Sound.playBuffer(buf[f], o);
  // ------------------------------------------------------------- visuals
  const cv = document.createElement("canvas"); cv.id = "warp"; document.body.appendChild(cv);
  const txt = document.createElement("div"); txt.id = "warpText"; document.body.appendChild(txt);
  const gl = cv.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false });
  let prog = null, U = {};
  if (gl) {
    const vs = "attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }";
    const fs = `precision highp float;
uniform vec2 uRes; uniform float uT, uZ, uWarp, uFlash, uGlow;
float h1(float n){ return fract(sin(n) * 43758.5453); }
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.02 + 7.3; a *= 0.5; } return s; }
void main(){
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float r = length(p), a = atan(p.y, p.x);
  float depth = 0.35 / max(r, 0.015);
  vec3 q = vec3(cos(a) * 1.6, sin(a) * 1.6, depth * 0.9 + uZ * 0.6);
  float c = fbm(q * 1.3 + vec3(0.0, 0.0, uT * 0.05)), c2 = fbm(q * 3.1 - vec3(0.0, 0.0, uT * 0.1));
  float clouds = smoothstep(0.35, 0.95, c) * (0.6 + 0.6 * c2);
  vec3 tun = mix(vec3(0.015, 0.02, 0.09), vec3(0.16, 0.28, 0.9), clouds) + vec3(0.55, 0.35, 1.0) * pow(clouds, 3.0) * 0.8;
  tun *= smoothstep(0.0, 0.25, r);
  float fil = pow(1.0 - abs(fbm(vec3(cos(a) * 2.2, sin(a) * 2.2, depth * 0.6 + uZ * 1.2 + uT * 0.3)) * 2.0 - 1.0), 18.0);
  tun += vec3(0.6, 0.75, 1.0) * fil * 0.7;
  vec3 st = vec3(0.0);
  for (int L = 0; L < 2; L++) {
    float N = L == 0 ? 140.0 : 260.0, fl = float(L);
    float ang = (a + 3.14159265) / 6.2831853 * N, bin = floor(ang), fa = fract(ang) - 0.5;
    float h = h1(bin * 1.37 + fl * 17.0), h2 = h1(bin * 7.13 + fl * 3.1);
    float zs = fract(h2 - uZ * (0.25 + 0.5 * h) * (L == 0 ? 1.0 : 0.7));
    float rs = 0.05 / (zs + 0.03);
    float len = rs * clamp(uWarp * 1.2 + 0.015, 0.015, 1.2) * (0.4 + h);
    float along = pow(smoothstep(rs - len, rs, r), 1.6) * (1.0 - smoothstep(rs, rs + 0.004 + 0.01 * rs, r));
    float w = (0.0011 + 0.0034 * (1.0 - zs)) / max(r, 0.05) * N / 6.2831853;
    float across = 1.0 - smoothstep(w * 0.4, w, abs(fa));
    st += along * across * (1.0 - zs) * step(L == 0 ? 0.35 : 0.55, h) * mix(vec3(0.7, 0.82, 1.0), vec3(1.0, 0.92, 0.85), h2) * (1.2 + 1.5 * uWarp);
  }
  vec3 col = tun * uWarp + st;
  col += vec3(0.7, 0.8, 1.0) * exp(-r * 8.0) * (uGlow + 1.4 * uWarp);
  col *= 1.0 - 0.35 * smoothstep(0.6, 1.4, r);
  col = mix(col, vec3(1.0), uFlash);
  gl_FragColor = vec4(col, 1.0);
}`;
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s)); return s; };
    prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(prog)); prog = null; }
    else {
      gl.useProgram(prog);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      for (const n of ["uRes", "uT", "uZ", "uWarp", "uFlash", "uGlow"]) U[n] = gl.getUniformLocation(prog, n);
    }
  }
  const S_ = { speed: 0, speedT: 0, warp: 0, warpT: 0, z: 0, flash: 0, op: 0, opT: 0, glow: 0.1, raf: 0, last: 0 };
  function resize() { const k = Math.min(devicePixelRatio, 1.5) * (QUALITY.pr < 1 ? 0.6 : 1); cv.width = innerWidth * k; cv.height = innerHeight * k; }
  addEventListener("resize", resize);
  function frame(now) {
    const dt = Math.min(0.5, S_.last ? (now - S_.last) / 1000 : 0.016); S_.last = now;
    const ease = (v, t, tau) => v + (t - v) * (1 - Math.exp(-dt / tau));
    S_.speed = ease(S_.speed, S_.speedT, 0.45); S_.warp = ease(S_.warp, S_.warpT, 0.5); S_.op = ease(S_.op, S_.opT, 0.25);
    S_.z += S_.speed * dt; S_.flash *= Math.exp(-dt / 0.18);
    cv.style.opacity = S_.op; txt.style.opacity = Math.min(1, S_.op * 1.4);
    if (S_.opT === 0 && S_.op < 0.01) { cv.style.display = txt.style.display = "none"; S_.raf = 0; S_.last = 0; return; }
    if (prog) {
      gl.viewport(0, 0, cv.width, cv.height);
      gl.uniform2f(U.uRes, cv.width, cv.height); gl.uniform1f(U.uT, now / 1000); gl.uniform1f(U.uZ, S_.z);
      gl.uniform1f(U.uWarp, S_.warp); gl.uniform1f(U.uFlash, Math.min(1, S_.flash)); gl.uniform1f(U.uGlow, S_.glow);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    S_.raf = requestAnimationFrame(frame);
  }
  function show() { resize(); cv.style.display = txt.style.display = "block"; if (!S_.raf) S_.raf = requestAnimationFrame(frame); }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  let current = null;
  function start(name) {
    if (current) current.abort();                                   // a new jump replaces one still in progress
    const ctl = { cancelled: false, loop: null }; current = ctl;
    const mine = () => current === ctl;                             // a superseded jump must not touch the screen
    Sound.unlock();
    const ready = Promise.race([preload(), wait(1500)]);
    Object.assign(S_, { speed: 0.02, speedT: 0.05, warp: 0, warpT: 0, z: Math.random() * 100, flash: 0, op: 0, opT: 0.35, glow: 0.08 });
    show();
    ctl.counting = true;                                            // Esc works from the first moment until "Engage"
    const onKey = e => { if (e.key === "Escape" && ctl.counting && !ctl.cancelled && mine()) { ctl.cancelled = true; Sound.stopAll(0.3); S_.opT = 0; txt.innerHTML = ""; current = null; } };
    addEventListener("keydown", onKey);
    txt.innerHTML = `<div class="wl">Frame shift drive charging</div><div class="wn">${esc(name)}</div><div class="wc">&nbsp;</div><div class="wh">Esc to cancel</div>`;
    ctl.done = (async () => {
      await ready;
      if (ctl.cancelled) { removeEventListener("keydown", onKey); return; }
      play("charge", { gain: 1.25 }); play("v_charging", { voice: true });
      const t0 = performance.now(), at = ms => wait(Math.max(0, t0 + ms - performance.now()));
      for (const [i, n] of [[0, 4], [1, 3], [2, 2], [3, 1]]) {
        await at(2400 + i * 1000);                                   // "charging" ends at ~1.7 s, then a breath
        if (ctl.cancelled) break;
        const el = txt.querySelector(".wc"); if (!el) break; el.textContent = n; el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
        play("v_" + n, { voice: true }); play("blip", { gain: 0.5 });
        S_.opT = 0.35 + 0.15 * (i + 1); S_.speedT = 0.05 + 0.04 * (i + 1); S_.glow = 0.08 + 0.05 * (i + 1);
      }
      ctl.counting = false;
      if (ctl.cancelled) { removeEventListener("keydown", onKey); if (mine()) { Sound.stopAll(0.4); S_.opT = 0; txt.innerHTML = ""; } return; }
      await at(6450);
      if (ctl.cancelled) { removeEventListener("keydown", onKey); return; }
      play("v_engage", { voice: true }); play("engage", { gain: 1.3 });
      ctl.loop = play("witchspace", { gain: 1.0, loop: true, fadeIn: 1.2 });
      txt.innerHTML = `<div class="wl">Witch space</div><div class="wn">${esc(name)}</div>`;
      S_.opT = 1; S_.speedT = 1.9; S_.warpT = 1; S_.glow = 0.3;
      await wait(2600);
      removeEventListener("keydown", onKey);
    })();
    ctl.exit = () => {
      if (ctl.loop) ctl.loop.stop(0.8);
      play("dropout", { gain: 1.3 });
      setTimeout(() => { S_.flash = 1.2; S_.opT = 0; S_.speedT = 0; S_.warpT = 0; txt.innerHTML = ""; }, 600);   // flash lands on the impact
    };
    ctl.abort = () => { const m = mine(); ctl.cancelled = true; if (ctl.loop) ctl.loop.stop(0.4); if (m) { Sound.stopAll(0.4); S_.opT = 0; txt.innerHTML = ""; current = null; } };
    return ctl;
  }
  return { start, preload };
})();
function sndUi() { $("sndBtn").textContent = Sound.on ? "🔊" : "🔇"; $("sndVol").value = Math.round(Sound.vol * 100); $("sndVol").disabled = !Sound.on; }
$("sndBtn").onclick = () => { Sound.unlock(); Sound.setOn(!Sound.on); sndUi(); };
$("sndVol").oninput = e => { Sound.unlock(); Sound.setVol(e.target.value / 100); };
["pointerdown", "keydown"].forEach(ev => addEventListener(ev, () => { Sound.unlock(); Warp.preload(); }, { once: true }));
const _vz = $("sndViz").getContext("2d"), _fq = new Uint8Array(256);
let _vzFlat = false;
function drawViz() {
  const W = 96, H = 26;
  if (!Sound.ready || !Sound.on) {                                   // v0.75.7: sound off: draw the flat line once, not every frame
    if (_vzFlat) return; _vzFlat = true; _vz.clearRect(0, 0, W, H); _vz.fillStyle = "rgba(157,140,192,.35)"; _vz.fillRect(0, H / 2, W, 1); return;
  }
  _vzFlat = false; _vz.clearRect(0, 0, W, H);
  Sound.analyser.getByteFrequencyData(_fq);
  const n = 32;
  for (let i = 0; i < n; i++) {
    const lo = Math.floor(Math.pow(i / n, 2) * 120), hi = Math.max(lo + 1, Math.floor(Math.pow((i + 1) / n, 2) * 120));
    let v = 0; for (let k = lo; k < hi; k++) v = Math.max(v, _fq[k]);
    const h = Math.max(1, (v / 255) * H), g = _vz.createLinearGradient(0, H, 0, 0);
    g.addColorStop(0, "#6ae8ff"); g.addColorStop(1, "#ff6ad5");
    _vz.fillStyle = g; _vz.fillRect(i * 3, H - h, 2, h);
  }
}
sndUi();
function modeTagText() {
  if (MAPMODE) { $("modeTag").textContent = "System map: true size ratios, compressed · shadows and eclipse times are live"; return; }
  if (mode === "true" && SURF) { $("modeTag").textContent = "Surface view: real sizes and real distances (nothing enlarged or compressed) · light, shadows, rings and eclipses are true"; return; }
  if (mode === "true") { $("modeTag").textContent = "True scale: real sizes and distances · light, shadows and eclipses are true · only stations and carriers are drawn enlarged, beside their body"; return; }
  $("modeTag").textContent = TILT ? "True tilt: real directions in 3D, distances √-compressed, sizes enlarged · light, shadows and eclipse times are true"
    : "Flat: orbits, rings and spin axes laid on one plane (directions in the plane only) · eclipse times are true, on-screen light direction is approximate";
}
function setTilt(on, save = true) {
  modeTagText && $("modeTag") && setTimeout(modeTagText, 0);
  TILT = on;
  $("vFlat").checked = !on;                       // v0.50: Flat lives in the View panel; the big button switches to the system map
  if (S) { rebuildStylOrbits(); computeDisp(simTime); }
  if (save) try { localStorage.setItem("gravitas.tilt2", on ? "1" : "0"); } catch (e) {}
}
$("vFlat").addEventListener("change", () => { fadeFlash(); setTilt(!$("vFlat").checked); });
{ let v = null; try { v = localStorage.getItem("gravitas.tilt2"); } catch (e) {}   // default: true tilt (the accurate view)
  setTilt(v !== "0", false); }
