// ------------------------------------------------------- star appearance
// Each stellar class gets its own look: limb darkening and boiling granulation
// for ordinary stars (larger cells on giants, spots on cool K/M and carbon stars),
// a hot featureless disc for white dwarfs, turbulent winds for Wolf-Rayet stars,
// cloud bands for brown dwarfs (L/T/Y), polar jet cones for neutron stars and
// gravitational lensing (screen-space, Einstein-ring mapping) for black holes.
const STAR_T = { value: 0 };
const STAR_ANIM = { on: false };          // v0.75.7: a star with moving flames is on screen, big enough to see them
const _corona = new Map();
function coronaTex(k) {                   // glow that starts at the disc's edge, so the surface stays visible
  if (_corona.has(k)) return _corona.get(k);
  const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
  const e = Math.min(0.95, 2 / k), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(Math.max(0, e - 0.04), "rgba(255,255,255,0)");
  gr.addColorStop(e, "rgba(255,255,255,0.9)"); gr.addColorStop(Math.min(1, e + (1 - e) * 0.25), "rgba(255,255,255,0.35)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256); const t = new THREE.CanvasTexture(c); _corona.set(k, t); return t;
}
function starKind(b) {
  const s = (b.subType || "") + " " + (b.spectralClass || ""), c = starLetter(b);
  const giant = /giant/i.test(b.subType || "") || /^(I|II|III)\b/.test(b.luminosity || "");
  if (/Black Hole/i.test(s)) return { kind: 3, halo: 0 };
  if (/Neutron/i.test(s)) return { kind: 2, halo: 3.2, scale: 0, spots: 0 };
  if (/White Dwarf/i.test(s) || c === "D") return { kind: 1, halo: 4.5, scale: 0, spots: 0 };
  if (/Wolf-Rayet/i.test(s) || c === "W") return { kind: 4, halo: 9, scale: 6, spots: 0 };
  if ("LTY".includes(c)) return { kind: 5, halo: 2.4, scale: 0, spots: 0 };
  if ("CS".includes(c) || /^MS/.test(b.spectralClass || "")) return { kind: 0, halo: 6, scale: giant ? 3 : 7, spots: 0.35 };
  return { kind: 0, halo: 6, scale: giant ? 3.5 : 9, spots: "KM".includes(c) ? 0.5 : 0 };
}
const STAR_NOISE = `
  float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
  float fbm3l(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++) { s += a * n3(p); p = p * 2.03 + 11.7; a *= 0.5; } return s * 1.143; }`;   // v0.75.7: 3 layers, for the flames
function starMaterial(b, color, K) {
  const m = new THREE.ShaderMaterial({
    defines: { STAR_LITE: QUALITY === PRESETS.low ? 1 : 0 },   // v0.71: Low draws a lighter star surface
    uniforms: { uCol: { value: color.clone() }, uTime: STAR_T, uKind: { value: K.kind }, uSeed: { value: (b.bodyId * 7.31) % 50 },
      uScale: { value: K.scale || 0 }, uSpots: { value: K.spots || 0 }, uLin: LIN, uWarm: { value: Math.max(0, Math.min(1, (5600 - (b.surfaceTemperature || 5600)) / 2400)) }, uBoost: { value: K.kind === 5 ? 1.3 : K.kind === 1 || K.kind === 2 ? 3 : 1.25 } },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vP; varying vec3 vN; varying vec3 vW;
      void main() { vP = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uCol; uniform float uTime; uniform int uKind; uniform float uSeed; uniform float uScale; uniform float uSpots, uLin, uBoost, uWarm;
      varying vec3 vP; varying vec3 vN; varying vec3 vW;
      ${STAR_NOISE}
      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vN), v = normalize(cameraPosition - vW), u = normalize(vP);
        float mu = clamp(dot(n, v), 0.0, 1.0);
        vec3 p = u + uSeed, c;
        if (uKind == 5) {                         // brown dwarf: cloud bands, dim
          float w = fbm3(p * 3.0 + vec3(0.0, 0.0, uTime * 0.01));
          float band = sin((u.y + (w - 0.5) * 0.18) * 16.0) * 0.5 + 0.5;
          c = mix(uCol * 0.45, uCol * 1.1, band) * mix(0.45, 1.0, sqrt(mu));
        } else if (uKind == 1 || uKind == 2) {    // white dwarf / neutron star: tiny, hot, almost featureless
          c = uCol * (2.4 - 0.5 * (1.0 - mu));
        } else {
          // boiling surface: warped cells, bright hot patches, dark cool lanes (seen in game: orange disc, yellow-white patches)
          vec3 q = p * uScale * 1.1 + vec3(uTime * 0.012, uTime * 0.009, 0.0);
          #if STAR_LITE
          float g = fbm3(q * 1.3 + 3.1), f = 0.5;                                  /* v0.71 Low: one noise instead of five, still cells */
          #else
          vec3 wq = q + 1.6 * vec3(fbm3(q + 3.1), fbm3(q + 7.3), fbm3(q + 11.9)) + vec3(0.0, 0.0, uTime * 0.02);
          float g = fbm3(wq), f = fbm3(wq * 3.1 + vec3(uTime * 0.05));
          #endif
          float heat = clamp((g - 0.5) * 2.2 + 0.5 + (f - 0.5) * 0.6, 0.0, 1.0);
          vec3 mid = mix(uCol, vec3(1.0, 0.55, 0.16), uWarm), cool = mid * vec3(0.8, 0.45, 0.25), hot = mix(mid, vec3(1.0, 0.92, 0.6), 0.8);   // cool stars: game-like orange
          vec3 base = mix(mix(cool, mid, smoothstep(0.0, 0.5, heat)), hot, smoothstep(0.6, 0.92, heat));
          float limb = 1.0 - 0.55 * (1.0 - mu) - 0.2 * (1.0 - mu * mu);
          vec3 rim = mix(vec3(1.0, 0.45, 0.2), vec3(1.0), 0.25) * uCol;             // edges turn deeper and redder
          c = mix(rim * 0.8, base, smoothstep(0.0, 0.6, mu)) * limb * 1.15;
          if (uSpots > 0.0) c *= 1.0 - uSpots * smoothstep(0.62, 0.7, fbm3(u * 2.3 + uSeed * 3.0 + 17.0)) * 0.4;
          if (uKind == 4) c *= 0.75 + 0.6 * fbm3(p * 4.0 + vec3(uTime * 0.12));
        }
        c *= mix(1.0, uBoost, uLin);              // true scale: a star is far brighter than anything it lights (HDR, the tone curve rolls it to white)
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return m;
}
function jetMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uCol: { value: color.clone().lerp(new THREE.Color(0.75, 0.9, 1), 0.5) }, uTime: STAR_T },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      uniform float uLen; varying float vT; varying vec3 vP;
      void main() { vT = -position.y; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uCol; uniform float uTime; varying float vT; varying vec3 vP;
      ${STAR_NOISE}
      void main() {
        #include <logdepthbuf_fragment>
        float t = clamp(vT, 0.0, 1.0);
        float flick = 0.65 + 0.35 * n3(vec3(atan(vP.x, vP.z) * 3.0, t * 6.0 - uTime * 3.0, 0.0));
        float a = pow(1.0 - t, 1.6) * flick * 0.85;
        gl_FragColor = vec4(uCol * a * 2.0, a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}
function addJets(tilt, r, color) {           // two cones along the spin axis, apex at the star
  const g = new THREE.ConeGeometry(1, 1, 48, 1, true); g.translate(0, -0.5, 0);   // apex at 0, base at y = -1
  const m = jetMaterial(color), out = [];
  for (const sgn of [1, -1]) { const j = new THREE.Mesh(g, m); j.scale.set(r * 1.4, r * 11, r * 1.4); j.rotation.x = sgn > 0 ? Math.PI : 0; j.renderOrder = 4; tilt.add(j); out.push(j); }
  return out;
}
// screen-space gravitational lensing: point-lens mapping β = θ − θE²/θ around each black hole
const LensShader = {
  uniforms: { tDiffuse: { value: null }, uBH: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) }, uN: { value: 0 }, uAspect: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec4 uBH[4]; uniform int uN; uniform float uAspect; varying vec2 vUv;
    void main() {
      vec2 uv = vUv; float dark = 0.0; float ring = 0.0;
      for (int i = 0; i < 4; i++) {
        if (i >= uN) break;
        vec2 c = uBH[i].xy; float R = uBH[i].z, E = R * 1.75;
        vec2 d = uv - c; d.x *= uAspect; float r = max(length(d), 1e-6);
        float fall = 1.0 - smoothstep(E * 4.0, E * 10.0, r);
        float beta = r - E * E / r * fall;
        vec2 nd = d / r * beta; nd.x /= uAspect; uv = c + nd;
        dark = max(dark, 1.0 - smoothstep(R * 0.97, R * 1.04, r));
        ring += exp(-pow((r - R * 1.07) / (R * 0.045), 2.0));
      }
      vec3 col = texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).rgb;
      col = col * (1.0 - dark) + vec3(1.0, 0.86, 0.68) * ring * 0.7 * (1.0 - dark);
      gl_FragColor = vec4(col, 1.0);
    }`,
};
const flatTex = (() => { const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); t.needsUpdate = true; return t; })();
const glowTex = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.2, "rgba(255,255,255,.5)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
})();


// prominences and flares: a camera-facing quad behind the star; flame tongues and loops rise from the limb (illustrative,
// seen in game around red dwarfs and other ordinary stars). The star's own disc hides the middle of the quad.
function promMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, extensions: { derivatives: true },
    uniforms: { uCol: { value: color.clone() }, uTime: STAR_T, uSeed: { value: 0 }, uLin: LIN },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uCol; uniform float uTime, uSeed, uLin; varying vec2 vP;
      ${STAR_NOISE}
      void main() {
        #include <logdepthbuf_fragment>
        float r = length(vP), a = atan(vP.y, vP.x), h = r - 1.0;
        if (h < -0.02 || r > 1.4) discard;
        float glow = exp(-max(h, 0.0) / 0.045) * 0.55 + exp(-max(h, 0.0) / 0.18) * 0.18;     // the thin bright layer at the edge
        vec2 pc = vec2(cos(a), sin(a)) * 3.0;
        // v0.75.7: lighter and calmer. Fewer noise layers, the fine noise only where a flame or an arch actually is,
        // slower motion, and line widths of at least ~1.5 pixels so the arches do not flicker from pixel to pixel
        float tongue = fbm3l(vec3(pc * 1.7 + uSeed, uTime * 0.05)), reach = 0.025 + 0.9 * pow(tongue, 3.0);
        float flame = 0.0;
        if (tongue > 0.5 && h < reach) flame = smoothstep(0.5, 0.68, tongue) * smoothstep(reach, 0.0, h) * smoothstep(0.3, 0.7, fbm3l(vec3(pc * 6.0, h * 18.0 - uTime * 0.25) + uSeed));
        float loops = 0.0, lw = max(0.02, fwidth(h) * 1.5);                            // a few arches standing on the limb
        for (int i = 0; i < 3; i++) {
          float c0 = fract(sin(uSeed * 3.7 + float(i) * 12.9) * 43758.5) * 6.2831853 + uTime * 0.004 * float(i + 1);
          float da = atan(sin(a - c0), cos(a - c0)), w = 0.18 + 0.1 * float(i);
          if (abs(da) > w) continue;
          float arch = (1.0 - (da * da) / (w * w)) * (0.14 + 0.05 * float(i)) * (0.85 + 0.15 * sin(uTime * 0.2 + float(i)));
          float d = abs(h - arch); if (d > lw) continue;
          loops += smoothstep(lw, 0.0, d) * (0.02 / lw) * (0.6 + 0.4 * fbm3l(vec3(da * 20.0, h * 30.0, uTime * 0.25)));
        }
        vec3 col = mix(uCol, vec3(1.0, 0.5, 0.15), 0.6);
        float I = glow + flame * 1.5 + loops * 1.3;
        I *= mix(0.6, 1.4, uLin) * smoothstep(-0.02, 0.0, h) * smoothstep(1.4, 1.15, r);
        gl_FragColor = vec4(col * I, 1.0);
      }`,
  });
}
