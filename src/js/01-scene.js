// ------------------------------------------------------------------- scene
const host = $("scene");
const renderer = new THREE.WebGLRenderer({ antialias: false, logarithmicDepthBuffer: true, powerPreference: "high-performance" });   // v0.70: the composer does its own anti-aliasing; prefer the laptop's real graphics card
// v0.75.7: three.js asks the driver for every shader's error log right after compiling it. That makes each compile finish
// at once (a stall, on some laptops long enough to freeze the browser). Visitors never read that log: only tests and
// ?debug=1 keep the check, so a broken shader still shows up there
renderer.debug.checkShaderErrors = !!navigator.webdriver || /[?&]debug=1/.test(location.search);
// v0.9: a shader is never used before the graphics driver has finished compiling it. Using it earlier makes the browser
// wait for the compile on the spot; on Windows the compile runs in the browser's one graphics process, so a long one
// freezes every Chrome tab (the "whole browser froze" reports). Each offscreen job (surfaces, Milky Way, map pictures,
// glow) compiles its shaders in the background first (KHR_parallel_shader_compile through three.js compileAsync) and
// waits until they are ready. Compiled twice: for drawing into a texture and onto the screen (three.js keeps a separate
// version of each shader for the two)
const WARM = { ready: new Set(), busy: new Set(), rt: null };
// v0.90.3: a resized canvas is blank until drawn again, so the next frame is drawn at once (no pacing or waiting)
var REDRAW = false;
// a material whose shader is compiled and ready to draw without a stall
const matReady = m => { try { const pr = renderer.properties.get(m).currentProgram; return !!pr && pr.isReady(); } catch (e) { return false; } };
function warm(key, sc, cam, targets = [true]) {
  if (WARM.ready.has(key)) return true; if (WARM.busy.has(key)) return false;
  WARM.busy.add(key);
  let fin = false; const done = () => { if (fin) return; fin = true; WARM.busy.delete(key); WARM.ready.add(key); }, prev = renderer.getRenderTarget(), mats = new Set();
  if (!WARM.rt) WARM.rt = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: true });
  try { for (const t of targets) { renderer.setRenderTarget(t ? WARM.rt : null); for (const m of renderer.compile(sc, cam)) mats.add(m); } } catch (e) {}
  renderer.setRenderTarget(prev);
  // v0.90.1: our own wait (three.js's compileAsync threw when a material was thrown away while it compiled, as the live
  // map does when its pictures are rebuilt). A material that is gone, or that cannot say, counts as ready
  const ready = m => { try { const pr = renderer.properties.get(m).currentProgram; return !pr || pr.isReady(); } catch (e) { return true; } };
  const poll = () => { if (fin) return; for (const m of mats) if (ready(m)) mats.delete(m); if (!mats.size) done(); else setTimeout(poll, 16); };
  poll(); setTimeout(done, 30000);                                       // never wait for ever
  return WARM.ready.has(key);
}
const warmed = key => WARM.ready.has(key);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
host.appendChild(renderer.domElement);
const labels = new CSS2DRenderer();
labels.setSize(innerWidth, innerHeight);
Object.assign(labels.domElement.style, { position: "fixed", inset: "0", pointerEvents: "none" });
host.appendChild(labels.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04030a);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 1e-4, 1e10);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.zoomSpeed = 1.6; controls.maxDistance = 5e9;
// v0.78.2: the 3D names (bodies, stations, carriers) take clicks, so the wheel and a drag that started on one never reached
// the 3D view: in a crowded system the view seemed stuck. The wheel over a name now zooms, and a drag that starts on a
// name turns the view (a plain click still selects). Nothing runs until the pointer is on a name
{
  const L = labels.domElement, cv = renderer.domElement;
  const onName = e => e.target !== L && !!(e.target.closest && e.target.closest(".label"));
  L.addEventListener("wheel", e => {
    if (!onName(e)) return; e.preventDefault();
    cv.dispatchEvent(new WheelEvent("wheel", { deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ, deltaMode: e.deltaMode, clientX: e.clientX, clientY: e.clientY,
      screenX: e.screenX, screenY: e.screenY, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey, bubbles: true, cancelable: true }));
  }, { passive: false });
  // v0.78.3: a finger stays bound to the name it touched, so its later moves and its lift never reached the 3D view, which
  // then waited for ever for a finger that was gone: no turning or pinching at all afterwards (tablets). Now the finger is
  // let go by the name and handed to the view, and every later move, lift or cancel of it reaches the view
  let st = null, fwd = null, drag = false, eat = 0;
  const pe = (type, e, o = {}) => new PointerEvent(type, Object.assign({ pointerId: e.pointerId, pointerType: e.pointerType, isPrimary: e.isPrimary, button: e.button, buttons: e.buttons,
    clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY, width: e.width, height: e.height, pressure: e.pressure,
    ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey, bubbles: true, cancelable: true }, o));
  L.addEventListener("pointerdown", e => { st = onName(e) && e.isPrimary && fwd === null ? e : null; });
  L.addEventListener("pointermove", e => {
    if (fwd === e.pointerId) { cv.dispatchEvent(pe("pointermove", e)); return; }    // the view could not take the finger over: pass each move on
    if (!st || e.pointerId !== st.pointerId || Math.hypot(e.clientX - st.clientX, e.clientY - st.clientY) < 5) return;
    const d = st; st = null; drag = true; fwd = e.pointerId;           // a drag, not a click: hand it to the 3D view from where it began
    try { if (e.target.hasPointerCapture && e.target.hasPointerCapture(e.pointerId)) e.target.releasePointerCapture(e.pointerId); } catch (x) {}
    cv.dispatchEvent(pe("pointerdown", d, { buttons: d.buttons || 1 }));
    cv.dispatchEvent(pe("pointermove", e));
  });
  const end = e => {
    st = null; if (fwd !== e.pointerId) return;
    fwd = null; if (drag) { drag = false; eat = performance.now() + 300; }
    if (e.target !== cv) cv.dispatchEvent(pe(e.type, e));              // the lift must reach the view, wherever it happened
  };
  addEventListener("pointerup", end, true);
  addEventListener("pointercancel", end, true);
  L.addEventListener("click", e => { if (performance.now() < eat) { eat = 0; e.stopPropagation(); e.preventDefault(); } }, true);   // the end of a drag is no click
}
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
let lensPass = null;                      // created once the lens shader is defined (below)
// v0.60: true scale is drawn in linear HDR light. Only real light sources (stars) are brighter than white, so only they
// bloom, and a last pass rolls off highlights and converts to screen colours. The overview keeps the pre-v0.60 picture
// exactly: there the last pass is switched off, so the bloom pass is last and draws to the screen as it always did.
const OUT_GLSL = `
    vec3 shoulder(vec3 c) {                 // identity below the knee, smooth roll-off above, very bright light turns white
      float m = max(c.r, max(c.g, c.b)), knee = 0.8;
      if (m <= knee) return c;
      float mm = knee + (1.0 - knee) * (1.0 - exp(-(m - knee) / (1.0 - knee)));
      return mix(c * (mm / m), vec3(mm), clamp((m - 1.0) / 5.0, 0.0, 1.0) * 0.8);
    }
    vec3 toSRGB(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }`;
// v0.70: how much background work (surfaces, Milky Way) a frame may do; shrinks at once when frames get slow, grows back slowly
const WORK = { scale: 0.25, hold: performance.now() + 2500 };
const LIN = { value: 1 };                       // HDR light everywhere since v0.62 (0 was the pre-v0.60 overview picture)
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.6, 1.0);
composer.addPass(bloom);
// v0.75.7: on Medium the glow is worked out at half the usual resolution (it is a soft blur anyway): about half its
// graphics card cost, the look barely changes. High and Ultra keep the full glow
{ const bs = bloom.setSize.bind(bloom); bloom.setSize = (w, h) => { const f = typeof QUALITY !== "undefined" && QUALITY === PRESETS.medium ? 0.5 : 1; bs(Math.max(2, Math.round(w * f)), Math.max(2, Math.round(h * f))); }; }
const outPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uExposure: { value: 0.8 } },   // v0.60: exposure tuned to CMDR Hongark's in-game screenshots
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uExposure; varying vec2 vUv; ${OUT_GLSL}
    void main() {
      vec3 c = toSRGB(shoulder(max(texture2D(tDiffuse, vUv).rgb * uExposure, 0.0)));
      float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;   // dither: no banding in dark gradients
      gl_FragColor = vec4(c + n / 255.0, 1.0);
    }`,
});
composer.addPass(outPass);
function pipeMode(styl) {                       // v0.62: one picture for every view: HDR light, the tone curve, the same glow
  LIN.value = 1; outPass.enabled = true; skyMode(false);
  bloom.threshold = 1.0; bloom.strength = 0.35; bloom.radius = 0.35;
}
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  REDRAW = true; renderer.setSize(innerWidth, innerHeight); labels.setSize(innerWidth, innerHeight); if (typeof prApply === "function") prApply(false); composer.setSize(innerWidth, innerHeight);
});
const sky = new THREE.Group(); scene.add(sky);   // background stars follow the camera
{
  const g = new THREE.BufferGeometry(), n = 3000, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(1e8); p.set([v.x, v.y, v.z], i * 3); }
  g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  sky.add(SKY_OLD = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xa89ad8, size: 1.6, sizeAttenuation: false })));
}
// ---- v0.60 galactic sky: the Milky Way as seen from the system's real position in the galaxy.
// A simple galaxy model (exponential disc, bulge, four spiral arms, a thin dusty layer) is ray-marched once per
// system into an equirectangular texture. Orientation: calibrated from CMDR Hongark's screenshots on 9 a's surface in
// Col 285 Sector VR-E b27-1 (galactic plane normal and core side), so it is approximate. Background stars are illustrative.
var SKY_OLD;
const SKY_N = new THREE.Vector3(-0.2796, -0.9533, -0.1142).normalize();                 // galactic north in world axes (calibrated, sign assumed)
const SKY_C = new THREE.Vector3(0, 0, -1).addScaledVector(SKY_N, SKY_N.z).normalize();   // towards galactic +z (the core side from near Sol)
const SKY_X = new THREE.Vector3().crossVectors(SKY_N, SKY_C).normalize();
const SKY = { rt: null, y: 0, W: 0, coords: null, mesh: null, stars: null, bake: null };
const SKY_GLSL_NOISE = `
  float hh(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
  float vn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hh(i), hh(i + vec3(1, 0, 0)), f.x), mix(hh(i + vec3(0, 1, 0)), hh(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hh(i + vec3(0, 0, 1)), hh(i + vec3(1, 0, 1)), f.x), mix(hh(i + vec3(0, 1, 1)), hh(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
  float fb(vec3 p) { float a = 0.5, t = 0.0; for (int o = 0; o < 4; o++) { t += a * vn(p); p = p * 2.07 + 17.1; a *= 0.5; } return t / 0.9375; }`;
function skyInit() {
  if (SKY.mesh) return;
  SKY.bake = new THREE.ShaderMaterial({
    uniforms: { uP0: { value: new THREE.Vector3() }, uX: { value: SKY_X }, uN: { value: SKY_N }, uC: { value: SKY_C } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `precision highp float; uniform vec3 uP0, uX, uN, uC; varying vec2 vUv; ${SKY_GLSL_NOISE}
      const vec3 CORE = vec3(25.21875, -20.90625, 25899.96875);                     // Sagittarius A* (ly, galactic)
      void main() {
        float lon = (vUv.x - 0.5) * 6.2831853, lat = (vUv.y - 0.5) * 3.1415927;
        vec3 w = vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));          // world direction (z = system pole)
        vec3 g = vec3(dot(w, uX), dot(w, uN), dot(w, uC));                         // galactic direction
        vec3 L = vec3(0.0), T = vec3(1.0); float t = 8.0 * (1.0 + 0.1 * hh(vec3(gl_FragCoord.xy * 0.731, 7.13)));   // jittered start: no step bands
        for (int i = 0; i < 100; i++) {
          float t2 = t * 1.17, ds = t2 - t;   /* v0.70: ~60 steps instead of ~100 */ vec3 p = uP0 + g * (t + 0.5 * ds); t = t2;
          vec3 q = p - CORE; float R = length(q.xz), h = q.y, ah = abs(h);
          float th = atan(q.z, q.x), arm = pow(0.5 + 0.5 * cos(4.0 * (th - log(max(R, 2000.0) / 4000.0) / 0.21)), 3.0);
          float cl = fb(p / 2600.0), cs = fb(p / 520.0 + 9.0), cd = fb(p / 900.0 + 5.0);
          float disc = exp(-R / 11000.0) * (exp(-ah / 950.0) + 0.12 * exp(-ah / 3000.0)) * (0.35 + 1.3 * arm) * (0.2 + 1.6 * cl * cs);
          float bulge = 1.4 * exp(-(R * R + h * h * 2.6) / (2.0 * 2600.0 * 2600.0));
          vec3 e = disc * mix(vec3(1.0, 0.9, 0.78), vec3(0.78, 0.86, 1.0), arm) + bulge * vec3(1.0, 0.82, 0.6);
          e += vec3(1.0, 0.32, 0.42) * 0.6 * disc * arm * smoothstep(0.62, 0.85, cs) * exp(-ah / 400.0);   // glowing gas in the arms
          float dust = 4.0e-4 * exp(-R / 14000.0) * exp(-ah / 320.0) * (0.3 + 1.4 * arm) * (0.05 + 3.5 * cd * cd * cd * smoothstep(0.2, 0.7, cs));
          L += T * e * ds * 2.4e-4; T *= exp(-dust * ds * vec3(0.62, 0.82, 1.15));
          if (t > 95000.0) break;
        }
        // angular detail: star clouds and dark lanes along the plane (seeded by position, so it changes slowly from system to system)
        vec3 o = uP0 / 4000.0, gs = vec3(g.x, g.y * 3.5, g.z);
        float mott = 0.45 + 1.1 * fb(g * 5.0 + o) * (0.6 + 0.8 * fb(g * 16.0 + o + 3.0));
        float lane = smoothstep(0.42, 0.72, fb(gs * 9.0 + o + 1.0)) * (0.6 + 0.4 * fb(gs * 30.0 + o));
        float band = exp(-abs(g.y) / 0.11);
        L *= mix(1.0, mott, band) * (1.0 - 0.85 * lane * band * vec3(0.85, 0.93, 1.0));
        L = L / (1.0 + L);                                                             // stored compressed, unpacked in the sky shader
        gl_FragColor = vec4(pow(L, vec3(1.0 / 2.2)), 1.0);
      }`, depthTest: false, depthWrite: false,
  });
  SKY.scene = new THREE.Scene(); SKY.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), SKY.bake); q.frustumCulled = false; SKY.scene.add(q);
  SKY.mesh = new THREE.Mesh(new THREE.SphereGeometry(9e7, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: { map: { value: null }, uI: { value: 0 } },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vD; void main() { vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D map; uniform float uI; varying vec3 vD;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 s = normalize(vD), w = vec3(s.x, -s.z, s.y);                               // scene → world axes
        vec2 uv = vec2(atan(w.y, w.x) / 6.2831853 + 0.5, asin(clamp(w.z, -1.0, 1.0)) / 3.1415927 + 0.5);
        vec3 c = pow(texture2D(map, uv).rgb, vec3(2.2)); c = c / max(1.0 - c, 0.02);
        gl_FragColor = vec4(c * uI, 1.0);
      }`,
  }));
  SKY.mesh.renderOrder = -10; SKY.mesh.frustumCulled = false; SKY.mesh.visible = false; sky.add(SKY.mesh);
  // background stars: many faint, a few bright, more of them along the galactic plane; colours from blue-white to orange
  const n = 9000, P = new Float32Array(n * 3), C = new Float32Array(n * 3), Z = new Float32Array(n), v = new THREE.Vector3();
  let rs = 12345; const rnd = () => ((rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < n; i++) {
    const lon = rnd() * Math.PI * 2;
    const lat = i % 5 < 2 ? Math.asin(rnd() * 2 - 1) : (rnd() < 0.5 ? -1 : 1) * -Math.log(1 - rnd() * 0.999) * 0.14;
    const sx = Math.cos(lat) * Math.cos(lon), sy = Math.sin(lat), sz = Math.cos(lat) * Math.sin(lon);
    v.set(0, 0, 0).addScaledVector(SKY_X, sx).addScaledVector(SKY_N, sy).addScaledVector(SKY_C, sz);   // world
    P.set([v.x * 8e7, v.z * 8e7, -v.y * 8e7], i * 3);                                                  // world → scene
    const tK = rnd(), m = Math.pow(rnd(), 5);
    const col = tK < 0.15 ? [0.72, 0.82, 1] : tK < 0.55 ? [1, 0.97, 0.92] : tK < 0.85 ? [1, 0.86, 0.66] : [1, 0.7, 0.5];
    const br = 0.25 + 3.2 * m; C.set(col.map(x => x * br), i * 3); Z[i] = 1.1 + 2.2 * m;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(P, 3)); g.setAttribute("color", new THREE.BufferAttribute(C, 3)); g.setAttribute("size", new THREE.BufferAttribute(Z, 1));
  SKY.stars = new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uPR: { value: 1 }, uI: { value: 1 } },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float size; attribute vec3 color; uniform float uPR; varying vec3 vC;
      void main() { vC = color; gl_PointSize = size * uPR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uI; varying vec3 vC;
      void main() {
        #include <logdepthbuf_fragment>
        float r = length(gl_PointCoord - 0.5) * 2.0, a = exp(-r * r * 3.5) * step(r, 1.0);
        gl_FragColor = vec4(vC * a * uI, a);
      }`,
  }));
  SKY.stars.renderOrder = -9; SKY.stars.frustumCulled = false; SKY.stars.visible = false; sky.add(SKY.stars);
}
function skyBuild(coords) {                       // a new system: bake its Milky Way (over several frames)
  try {
    skyInit(); SKY.coords = coords && isFinite(coords.x) ? coords : { x: 0, y: 0, z: 0 };
    const want = (typeof QUALITY !== "undefined" && QUALITY.sky) || 0;
    if (!want) { SKY.y = -1; SKY.ready = false; return; }                    // v0.70: Low draws no Milky Way (plain stars only)
    const W = Math.max(512, Math.min(4096, want));
    if (!SKY.rt || SKY.W !== W) {
      if (SKY.rt) SKY.rt.dispose();
      SKY.rt = new THREE.WebGLRenderTarget(W, W / 2, { depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      SKY.rt.texture.wrapS = THREE.RepeatWrapping; SKY.W = W;
    }
    SKY.bake.uniforms.uP0.value.set(SKY.coords.x, SKY.coords.y, SKY.coords.z); SKY.y = 0; SKY.ready = false;
    SKY.mesh.material.uniforms.map.value = SKY.rt.texture;
  } catch (e) { SKY.y = -1; }
}
function skyTick() {                              // a few rows per frame until the sky texture is complete
  if (!SKY.rt || SKY.ready || SKY.y < 0) return;
  if (!warm("sky", SKY.scene, SKY.cam)) return;                        // v0.9: not before its shader is ready
  if (WORK.hold > performance.now()) return;
  const W = SKY.W, H = W / 2, rows = Math.max(2, Math.floor(((typeof QUALITY !== "undefined" && QUALITY.bakeBudget) || 1e6) * 0.12 * WORK.scale / W));   // v0.70: small slices, smaller still on a slow machine
  const prev = renderer.getRenderTarget(), auto = renderer.autoClear; renderer.autoClear = false;
  SKY.rt.scissorTest = true; SKY.rt.scissor.set(0, SKY.y, W, Math.min(rows, H - SKY.y)); SKY.rt.viewport.set(0, 0, W, H);
  renderer.setRenderTarget(SKY.rt); renderer.render(SKY.scene, SKY.cam);
  renderer.setRenderTarget(prev); renderer.autoClear = auto;
  SKY.y += rows; if (SKY.y >= H) { SKY.rt.scissorTest = false; SKY.ready = true; }
}
function skyMode(styl) {
  if (!SKY.mesh) return;
  const on = !!SKY.ready && !!(typeof $ === "function" && $("vSky") ? $("vSky").checked : true);
  SKY.mesh.visible = on; SKY.stars.visible = !styl; SKY_OLD.visible = styl;
  SKY.mesh.material.uniforms.uI.value = styl ? 0.05 : 0.12;
  SKY.stars.material.uniforms.uPR.value = renderer.getPixelRatio(); SKY.stars.material.uniforms.uI.value = 0.55;
}

// floating origin
const O = { x: 0, y: 0, z: 0 };                                  // world point at scene (0,0,0)
const toScene = (w, v = new THREE.Vector3()) => v.set(w.x - O.x, w.z - O.z, -(w.y - O.y));
function setOrigin(w, keepCam) {        // keepCam (v0.57): the origin rides on the followed body, so the camera rides with it
  const d = new THREE.Vector3(O.x - w.x, O.z - w.z, -(O.y - w.y));
  O.x = w.x; O.y = w.y; O.z = w.z;
  if (keepCam) return;
  camera.position.add(d); controls.target.add(d);
  if (fly) { fly.fromT && fly.fromT.add(d); fly.fromP && fly.fromP.add(d); }
}
const sceneToWorld = v => ({ x: v.x + O.x, y: -v.z + O.y, z: v.y + O.z });

