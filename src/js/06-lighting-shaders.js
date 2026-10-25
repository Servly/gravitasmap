// ------------------------------------------------------ lighting shaders
// Direct light from every star, analytic eclipses (fraction of the stellar
// disc covered by each nearby body, with penumbra) and ring shadows.
// v0.60: physically based shading in linear light. Surfaces get normal maps and a reflectance model per kind (the
// lunar-Lambert law for airless ground, limb darkening for gas giants, a sun glint on open water). Atmospheres are a
// shell that scatters starlight (Rayleigh + haze), so limbs glow, day sides haze over and thick ones hide the ground.
const LIGHT_GLSL = `
uniform vec4 uStars[${MAX_STARS}];   // xyz = position, w = radius
uniform vec3 uStarCol[${MAX_STARS}];
uniform int uNStars;
uniform vec4 uOcc[${MAX_OCC}];       // occluding spheres
uniform int uNOcc;
uniform float uEcl[${MAX_STARS}];    // fraction of each star's disc visible, computed in TRUE geometry
float angBetween(vec3 a, vec3 b) { return atan(length(cross(a, b)), dot(a, b)); }
float discCover(float aS, float aO, float sep) {
  if (sep >= aS + aO) return 0.0;
  float full = min(1.0, (aO * aO) / (aS * aS));
  if (sep <= abs(aO - aS)) return full;
  return full * clamp((aS + aO - sep) / (2.0 * min(aS, aO)), 0.0, 1.0);
}
float starVisibility(vec3 p, vec3 sp, float sr) {
  vec3 L = sp - p; float dL = length(L); vec3 l = L / dL;
  float aS = asin(min(sr / dL, 1.0)), vis = 1.0;
  for (int k = 0; k < ${MAX_OCC}; k++) {
    if (k >= uNOcc) break;
    vec3 o = uOcc[k].xyz - p; float dO = length(o);
    if (dO >= dL || dot(o, l) <= 0.0 || dO < uOcc[k].w * 1.0001) continue;
    float aO = asin(min(uOcc[k].w / dO, 1.0));
    vis *= 1.0 - discCover(aS, aO, angBetween(o, L));
  }
  return vis;
}`;
const lightUniforms = () => ({
  uStars: { value: Array.from({ length: MAX_STARS }, () => new THREE.Vector4()) },
  uStarCol: { value: Array.from({ length: MAX_STARS }, () => new THREE.Color()) }, uNStars: { value: 0 },
  uOcc: { value: Array.from({ length: MAX_OCC }, () => new THREE.Vector4()) }, uNOcc: { value: 0 }, uNight: { value: 0.003 },
  uEcl: { value: new Array(MAX_STARS).fill(1) },
});
// kinds: 0 gas giant · 1 solid ground · 2 ocean world · 3 ammonia world (set when the surface is baked)
function bodyMaterial(map) {
  return new THREE.ShaderMaterial({
    defines: { LITE: QUALITY === PRESETS.low ? 1 : 0 },             // v0.72: Low draws the ring shadow with one sample
    uniforms: { ...lightUniforms(), map: { value: map }, nmap: { value: map }, uHasN: { value: 0 }, uGlow: { value: 0 }, uKind: { value: 1 }, uLS: { value: 0.5 }, uDry: { value: 0 },
      uTint: { value: new THREE.Color(1, 1, 1) }, uLin: LIN, uRingTex: { value: map },
      uRing: { value: new THREE.Vector4() }, uRingN: { value: new THREE.Vector3(0, 1, 0) }, uRingC: { value: new THREE.Vector3() }, uAtm: { value: new THREE.Color(0, 0, 0) } },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying vec3 vM0; varying vec3 vM1; varying vec3 vM2;
      void main() {
        vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
        vM0 = normalize(modelMatrix[0].xyz); vM1 = normalize(modelMatrix[1].xyz); vM2 = normalize(modelMatrix[2].xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${LIGHT_GLSL}
      uniform sampler2D map, nmap, uRingTex; uniform vec3 uTint; uniform float uDry; uniform vec4 uRing; uniform vec3 uRingN; uniform vec3 uRingC; uniform float uNight;
      uniform float uHasN, uGlow, uKind, uLS, uLin; uniform vec3 uAtm;
      varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying vec3 vM0; varying vec3 vM1; varying vec3 vM2;
      void main() {
        #include <logdepthbuf_fragment>
        vec4 tx = texture2D(map, vUv);
        vec3 alb = pow(tx.rgb, vec3(2.2)) * uTint; float water = tx.a * (1.0 - uDry);   // v0.71: dry ground never glints
        vec3 ng = normalize(vN), n = ng, v = normalize(cameraPosition - vW); float glow = 0.0;
        if (uHasN > 0.5) { vec4 nt = texture2D(nmap, vUv); vec3 no = nt.xyz * 2.0 - 1.0; n = normalize(vM0 * no.x + vM1 * no.y + vM2 * no.z); glow = nt.a * uGlow; }
        float ndv = max(dot(n, v), 0.0), ndvG = max(dot(ng, v), 0.0);
        vec3 lit = vec3(0.0), spec = vec3(0.0);
        for (int s = 0; s < ${MAX_STARS}; s++) {
          if (s >= uNStars) break;
          vec3 l = normalize(uStars[s].xyz - vW);
          float ndlG = dot(ng, l), ndl = dot(n, l), vis = 1.0;
          if (ndlG > -0.05) {
            vis = starVisibility(vW, uStars[s].xyz, uStars[s].w);
            if (uRing.w > 0.0) {                       // the rings' shadow, banded like the rings themselves
              float dn = dot(l, uRingN);
              if (abs(dn) > 1e-5) {
                float t = dot(uRingC - vW, uRingN) / dn;
                if (t > 0.0) { float r = length(vW + l * t - uRingC), u = (r - uRing.x) / (uRing.y - uRing.x);
                  if (u > 0.0 && u < 1.0) { float sh = 0.0;      // v0.63.5: averaged over ~6 % of the ring width, so fine ringlets don't alias into stripes
                    #if LITE
                    sh = texture2D(uRingTex, vec2(u, 0.5), 6.0).a * 9.0;
                    #else
                    for (int q = -4; q <= 4; q++) sh += texture2D(uRingTex, vec2(clamp(u + float(q) * 0.008, 0.0, 1.0), 0.5), 4.0).a;
                    #endif
                    vis *= 1.0 - sh / 9.0 * uRing.z; } }
              }
            }
          }
          float term = smoothstep(-0.02, 0.1, ndlG);    // the terminator follows the sphere; bumps never light the night side
          float d = max(ndl, 0.0);
          if (uKind < 0.5) d = max(ndlG, 0.0) * (0.72 + 0.28 * sqrt(ndvG));               // gas giant: soft limb darkening
          else d = mix(d, 2.0 * d / (d + ndv + 1e-3) * 0.5, uLS);                          // lunar-Lambert: flat, bright full disc
          vec3 Li = uStarCol[s] * vis * uEcl[s] * term;
          lit += Li * d;
          if (water > 0.01) {                             // sun glint on open water (GGX, Schlick Fresnel)
            vec3 hv = normalize(l + v); float nh = max(dot(ng, hv), 0.0), a2 = 0.012, dd = nh * nh * (a2 - 1.0) + 1.0;
            float F = 0.02 + 0.98 * pow(1.0 - max(dot(hv, v), 0.0), 5.0);
            spec += Li * water * (a2 / (3.14159 * dd * dd)) * F * max(ndlG, 0.0) * 0.25;
          }
        }
        vec3 col = alb * (lit + uNight) + spec + vec3(1.0, 0.36, 0.08) * glow * 1.6;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
// ---- atmosphere: a shell that scatters starlight. Rayleigh (blue) + haze (tinted by the dominant gas).
// Zenith optical depth from surface pressure; thick atmospheres veil the ground (seen in game: UF-M c8-10 AB 12,
// PF-M c8-3 1 and 2). Single scattering, 10 samples along the view ray, the planet's own shadow included.
function atmRecipe(b) {
  const st = b.subType || "", always = /Earth-like|Water world|Ammonia world/i.test(st);
  if (!hasAtm(b) && !always) return null;
  let P = b.surfacePressure; if (!(P > 0)) P = always ? 1 : 0.05;
  const [tint] = atmColor(b), lin = [tint.r, tint.g, tint.b];
  const tau = Math.min(40, 0.22 * Math.pow(P, 0.45)) * (/Ammonia world/i.test(st) ? 0.35 : 1);
  const haze = Math.min(0.92, 0.18 + 0.2 * Math.log10(1 + P)) * (/Earth-like/i.test(st) ? 0.5 : 1);
  const ray = [0.30, 0.55, 1.0].map(x => x * tau * (1 - haze));
  const hz = lin.map(x => (0.55 + 0.45 * x) * tau * haze);
  const hf = Math.max(0.012, Math.min(0.06, 0.012 + 0.01 * Math.log10(1 + P)));
  let alb = lin.map(x => 0.5 + 0.4 * x);                                    // what the cloud and haze deck reflects
  let cap = P > 1500 ? 0.97 : Math.min(0.68, 0.12 + 0.17 * Math.log10(1 + P));
  if (/Ammonia world/i.test(st)) cap = Math.min(cap, 0.35);                  // seen: AW at 644 atm still shows its mottled surface (PF-M c8-3 3)
  if (/Earth-like/i.test(st)) alb = [0.42, 0.6, 0.95];                     // thin air: a blue sky, as on Earth
  if (/Water world/i.test(st)) { cap = Math.min(cap, 0.55); alb = [0.6, 0.68, 0.8]; }   // seen: WW at 856 atm hazy blue-grey, cloud mass visible (PF-M c8-3 1)
  return { ray, hz, hf, alb, cap, si: /Ammonia world/i.test(st) ? 0.45 : 1, ms: Math.min(1, 0.12 * Math.log10(1 + P) + (always ? 0.1 : 0)), veil: P > 1500 };
}
function atmMaterial(rec) {
  return new THREE.ShaderMaterial({
    defines: { ATM_N: QUALITY === PRESETS.low ? 4 : 10 },            // v0.72: Low takes 4 steps through the air instead of 10
    transparent: true, depthWrite: false, side: THREE.FrontSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
    uniforms: { ...lightUniforms(), uRatio: { value: 1 / (1 + rec.hf) }, uHk: { value: 4 }, uRay: { value: new THREE.Vector3(...rec.ray) }, uHz: { value: new THREE.Vector3(...rec.hz) },
      uI: { value: 0.35 * (rec.si || 1) }, uLin: LIN, uOn: { value: 1 }, uAlb: { value: new THREE.Vector3(...rec.alb) }, uCap: { value: rec.cap }, uMs: { value: rec.ms } },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vW; varying vec3 vC; varying float vRa;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vC = modelMatrix[3].xyz; vRa = length(modelMatrix[0].xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${LIGHT_GLSL}
      uniform float uRatio, uHk, uI, uOn, uCap, uMs; uniform vec3 uRay, uHz, uAlb; varying vec3 vW; varying vec3 vC; varying float vRa;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 c = vC; float Ra = vRa, R = Ra * uRatio, Hs = (Ra - R) / uHk;
        vec3 ro = cameraPosition, rd = normalize(vW - ro), oc = ro - c;
        float b = dot(oc, rd), disc = b * b - (dot(oc, oc) - Ra * Ra);
        if (disc <= 0.0 || uOn < 0.5) discard;
        float sq = sqrt(disc), t0 = max(-b - sq, 0.0), t1 = -b + sq;
        float dp = b * b - (dot(oc, oc) - R * R);
        if (dp > 0.0) { float tp = -b - sqrt(dp); if (tp > 0.0) t1 = min(t1, tp); }
        if (t1 <= t0) discard;
        const int N = ATM_N; float ds = (t1 - t0) / float(N);
        vec3 tau = vec3(0.0), sum = vec3(0.0);
        for (int i = 0; i < N; i++) {
          vec3 p = ro + rd * (t0 + (float(i) + 0.5) * ds), up = p - c; float rr = length(up); up /= rr;
          float rho = exp(-max(rr - R, 0.0) / Hs) / Hs;           // density normalised so the zenith column is 1
          vec3 dtau = (uRay + uHz) * rho * ds; tau += dtau * 0.5;
          for (int s = 0; s < ${MAX_STARS}; s++) {
            if (s >= uNStars) break;
            vec3 l = normalize(uStars[s].xyz - p); float mu = dot(up, l);
            float pr = dot(c - p, l), dist = length(c - p - l * pr);           // the planet's own shadow
            float lightOk = pr < 0.0 ? 1.0 : smoothstep(R * 0.985, R * 1.01, dist);
            vec3 tSun = (uRay + uHz) * exp(-max(rr - R, 0.0) / Hs) / max(mu + 0.12, 0.04) * 0.9;  // path to the star, Chapman-like
            float ct = dot(rd, l), g = 0.72, pR = 0.0597 * (1.0 + ct * ct), pM = 0.0796 * (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * ct, 1.5);
            sum += uStarCol[s] * uEcl[s] * lightOk * exp(-(tau + tSun)) * rho * ds * (uRay * pR + uHz * pM) * 12.566;
          }
          tau += dtau * 0.5;
        }
        vec3 T = exp(-tau);
        // multiple scattering, cheap form: an optically thick haze glows like a soft cloud deck lit from above
        vec3 n0 = normalize(ro + rd * t0 - c), ms = vec3(0.0);
        for (int s = 0; s < ${MAX_STARS}; s++) {
          if (s >= uNStars) break;
          vec3 l = normalize(uStars[s].xyz - c); float mu = dot(n0, l);
          ms += uStarCol[s] * uEcl[s] * smoothstep(-0.12, 0.25, mu) * (0.25 + 0.75 * max(mu, 0.0));
        }
        float a = min(1.0 - dot(T, vec3(0.3333)), uCap);
        gl_FragColor = vec4(sum * uI + ms * uAlb * uMs * a, a);
      }`,
  });
}
// ---- rings: one strip texture per planet (colour + density across all its rings); the type sets the colour
// (Rocky beige-brown, Icy white-blue, Metal Rich pale, Metallic grey; verified on CMDR Hongark's screenshots). Planet shadow
// and the unlit face are physical; the fine ringlets are illustrative.
const RING_COL = { Icy: [214, 222, 232], Rocky: [168, 138, 108], "Metal Rich": [214, 198, 186], Metallic: [176, 176, 180] };
function ringStrip(b) {
  const rings = (b.rings || []).slice().sort((x, y) => x.innerRadius - y.innerRadius);
  const rin = rings[0].innerRadius, rout = Math.max(...rings.map(r => r.outerRadius)), W = 2048;
  const data = new Uint8Array(W * 4), h = bodyHash(b);
  let rs = h || 1; const rnd = () => ((rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0) / 4294967296);
  const waves = Array.from({ length: 24 }, () => [rnd() * 480 + 30, rnd() * 6.28, rnd() * 0.5]);
  const gaps = Array.from({ length: 3 + Math.floor(rnd() * 5) }, () => [rnd(), 0.002 + rnd() * 0.01]);
  for (let i = 0; i < W; i++) {
    const r = rin + (rout - rin) * (i + 0.5) / W, ring = rings.find(x => r >= x.innerRadius && r <= x.outerRadius);
    if (!ring) continue;
    const t = (r - ring.innerRadius) / (ring.outerRadius - ring.innerRadius), tg = i / W;
    let d = 0.58; for (const [f, p, a] of waves) d += a * (f > 400 ? 0.12 : 0.22) * Math.sin(tg * f + p);   // broad zones plus faint ringlets
    for (const [g, w] of gaps) if (Math.abs(tg - g) < w) d *= 0.15;
    d *= Math.min(1, t / 0.015) * Math.min(1, (1 - t) / 0.02);                  // soft inner and outer edges
    const type = Object.keys(RING_COL).find(k => k.toLowerCase() === String(ring.type).toLowerCase()) || "Rocky";
    const base = RING_COL[type], shade = 0.9 + 0.18 * (Math.sin(tg * 157 + 1.3) * 0.5 + 0.5) * (type === "Rocky" ? 1 : 0.6);
    data.set([Math.min(255, base[0] * shade), Math.min(255, base[1] * shade), Math.min(255, base[2] * shade), Math.max(0, Math.min(1, d)) * 255], i * 4);
  }
  const tex = new THREE.DataTexture(data, W, 1, THREE.RGBAFormat); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true; tex.needsUpdate = true;
  return { tex, rin: rin / 1e6, rout: rout / 1e6 };
}
const RING_LIT = "0.62";
function ringMaterial(b, strip) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { ...lightUniforms(), uIn: { value: strip.rin }, uOut: { value: strip.rout }, uTex: { value: strip.tex }, uRN: { value: new THREE.Vector3(0, 1, 0) }, uLin: LIN, uSel: { value: 0 }, uA: { value: strip.rin }, uB: { value: strip.rout } },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vW; varying float vR;
      void main() { vR = length(position.xy); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${LIGHT_GLSL}
      uniform float uIn, uOut, uNight, uLin, uSel, uA, uB; uniform vec3 uRN; uniform sampler2D uTex; varying vec3 vW; varying float vR;
      void main() {
        #include <logdepthbuf_fragment>
        float t = (vR - uIn) / (uOut - uIn);
        if (t < 0.0 || t > 1.0) discard;
        vec4 rt = texture2D(uTex, vec2(t, 0.5)); float dens = rt.a;
        if (dens < 0.004) discard;
        vec3 alb = pow(rt.rgb / 1.0, vec3(2.2)), v = normalize(cameraPosition - vW), lit = vec3(0.0);
        float camSide = dot(cameraPosition - vW, uRN);
        for (int s = 0; s < ${MAX_STARS}; s++) { if (s >= uNStars) break;
          vec3 l = normalize(uStars[s].xyz - vW); float ld = dot(l, uRN), ct = dot(-v, l);
          float sameFace = camSide * ld >= 0.0 ? 1.0 : 0.0;
          float vis = starVisibility(vW, uStars[s].xyz, uStars[s].w) * uEcl[s];
          // lit face: reflected light; unlit face: light that gets through the ring, stronger looking towards the star
          float fwd = 0.08 + 0.9 * pow(max(ct, 0.0), 6.0);
          float k = sameFace > 0.5 ? (0.45 + 0.55 * abs(ld)) * (1.0 + 0.6 * uLin) : 0.2 * dens + (1.0 - dens) * fwd * 1.6;   // unlit face: diffuse light that got through, plus forward scatter
          lit += uStarCol[s] * vis * k; }
        vec3 rc = alb * (lit * ${RING_LIT} + uNight); float ra = mix(dens * 0.92, min(1.0, dens * 1.35) * 0.96, uLin);   // true scale: dense rings are nearly opaque
        if (uSel > 0.0) {                                  // v0.64.2: hover = thin white edges; selected = pink edges and a soft pink tint
          float sel = step(0.75, uSel), px = fwidth(vR) * mix(1.6, 2.8, sel);
          float e = max(1.0 - smoothstep(0.0, px, vR - uA), 1.0 - smoothstep(0.0, px, uB - vR)) * step(uA, vR) * step(vR, uB);
          vec3 ec = mix(vec3(1.0), vec3(1.0, 0.42, 0.84), sel);
          rc = mix(rc, rc * vec3(1.15, 0.85, 1.1) + vec3(0.06, 0.0, 0.04), 0.6 * sel);
          rc = mix(rc, ec * max(1.0, max(rc.r, rc.g)), e); ra = max(ra, e);
        }
        gl_FragColor = vec4(rc, ra);
      }`,
  });
}

// ---- v0.62 asteroid belts (around stars): seven rock models, as in the game's belt view. The band's edges, mass and type
// are data (Spansh); where each rock sits and how big it is are illustrative.
// Overview: a ring of enlarged rocks at the compressed distance. True scale: real-sized rocks (up to a few km), so the
// belt is only seen up close; a field of rocks is laid out around the camera when it is inside the band.
const BELT_MODELS = Array.from({ length: 7 }, (_, m) => {
  const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position, v = new THREE.Vector3();
  let rs = 977 + m * 7919; const rnd = () => ((rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0) / 4294967296);
  const bumps = Array.from({ length: 9 }, () => [new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), 0.08 + rnd() * 0.25, rnd() < 0.4 ? -1 : 1]);
  const sx = 0.7 + rnd() * 0.7, sy = 0.55 + rnd() * 0.4, sz = 0.8 + rnd() * 0.5, f = [2 + rnd() * 3, 3 + rnd() * 4, 6 + rnd() * 6];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let h = 0.12 * Math.sin(v.x * f[0] + m) * Math.sin(v.y * f[1] + 2 * m) + 0.06 * Math.sin(v.z * f[2] - v.x * f[1]) + 0.03 * Math.sin(v.y * 17 + v.z * 13);
    for (const [c, w, sg] of bumps) { const d = v.distanceTo(c); if (d < w * 2) h += sg * (sg < 0 ? 0.09 : 0.14) * Math.exp(-(d * d) / (w * w)); }   // lumps and crater-like dents
    v.multiplyScalar(1 + h); v.set(v.x * sx, v.y * sy, v.z * sz); p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const n = g.attributes.normal, acc = new Map(), key = i => `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;   // smooth: share normals
  for (let i = 0; i < p.count; i++) { const k = key(i), a = acc.get(k) || [0, 0, 0]; a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i); acc.set(k, a); }
  for (let i = 0; i < p.count; i++) { const a = acc.get(key(i)), l = Math.hypot(...a) || 1; n.setXYZ(i, a[0] / l, a[1] / l, a[2] / l); }
  return g;
});
// v0.63: metal belts are dark grey with glints (the game's metal rocks), not white
const BELT_TINT = { Icy: [0.6, 0.64, 0.7], "Metal Rich": [0.1, 0.092, 0.086], Metallic: [0.09, 0.09, 0.097] };
const beltMetal = bl => /metal/i.test(bl.type || "");
function beltMaterial(bl) {
  const col = BELT_TINT[bl.type] || [0.42, 0.33, 0.24];                     // Rocky: tan-brown, as in the game's belt view
  return new THREE.ShaderMaterial({
    uniforms: { ...lightUniforms(), uCol: { value: new THREE.Color(...col) }, uT: STAR_T, uMetal: { value: beltMetal(bl) ? 1 : 0 } },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      uniform float uT; attribute float aSeed; varying vec3 vN; varying vec3 vW; varying vec3 vC;
      vec3 rotA(vec3 v, vec3 k, float a) { return v * cos(a) + cross(k, v) * sin(a) + k * dot(k, v) * (1.0 - cos(a)); }
      void main() {
        float h1 = fract(aSeed * 7.137), h2 = fract(aSeed * 13.71 + 0.3);   // the rock's own seed: the same tumble whenever the field is rebuilt
        vec3 ax = normalize(vec3(h1 - 0.5, 1.0, h2 - 0.5)); float ang = uT * (0.02 + 0.12 * h1) * (h2 < 0.5 ? -1.0 : 1.0);   // a slow tumble that follows the clock
        vec3 pos = rotA(position, ax, ang), nrm = rotA(normal, ax, ang);
        vec4 w = modelMatrix * instanceMatrix * vec4(pos, 1.0); vW = w.xyz;
        #ifdef USE_INSTANCING_COLOR
        vC = instanceColor;
        #else
        vC = vec3(1.0);
        #endif
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * nrm); gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${LIGHT_GLSL}
      uniform vec3 uCol; uniform float uNight, uMetal; varying vec3 vN; varying vec3 vW; varying vec3 vC;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vN), v = normalize(cameraPosition - vW), lit = vec3(0.0), sp = vec3(0.0);
        for (int s = 0; s < ${MAX_STARS}; s++) { if (s >= uNStars) break;
          vec3 l = normalize(uStars[s].xyz - vW), Li = uStarCol[s] * uEcl[s];
          float d = max(dot(n, l), 0.0); lit += Li * d;
          sp += Li * uMetal * pow(max(dot(n, normalize(l + v)), 0.0), 60.0) * 0.5 * step(0.0, dot(n, l)); }
        gl_FragColor = vec4(uCol * vC * (lit * 1.15 + 0.015 + uNight) + sp, 1.0);
      }`,
  });
}
const BELT_CAP = { styl: 150, near: 260 };
function beltBuild(b, bl, sysName) {
  const mat = beltMaterial(bl);
  const mkIms = (g, cap) => BELT_MODELS.map(geo0 => { const geo = geo0.clone(); geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(new Float32Array(cap), 1));
    const m = new THREE.InstancedMesh(geo, mat, cap); m.count = 0; m.frustumCulled = false;
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3); g.add(m); return m; });
  const styl = new THREE.Group(); styl.userData.mode = "styl"; styl.userData.ims = mkIms(styl, BELT_CAP.styl);
  const near = new THREE.Group(); near.userData.ims = mkIms(near, BELT_CAP.near); near.visible = false;   // lives in the system group, near the camera
  // far rocks (smaller than a pixel) as faint points, the way stars are drawn: nothing is enlarged
  const NP = 2400, pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(NP * 3), 3)); pg.setDrawRange(0, 0);
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: beltMetal(bl) ? 0x9a9aa4 : 0xb59a7a, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false }));
  pts.frustumCulled = false; near.add(pts);
  // True scale marker: the band's two edges (dashed) and a very faint fill, like an orbit line: a guide, not an object
  const mark = new THREE.Group(); mark.userData.mode = "true";
  const rin = bl.innerRadius / 1e6, rout = bl.outerRadius / 1e6, lineMat = new THREE.LineDashedMaterial({ color: 0xe2b98a, transparent: true, opacity: 0.6, dashSize: rout * 0.02, gapSize: rout * 0.015, depthWrite: false });
  for (const R of [rin, rout]) {
    const a = new Float32Array(257 * 3); for (let i = 0; i <= 256; i++) { const t = i / 256 * Math.PI * 2; a.set([Math.cos(t) * R, 0, -Math.sin(t) * R], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(a, 3));
    const L = new THREE.Line(g, lineMat); L.computeLineDistances(); L.frustumCulled = false; mark.add(L);
  }
  const fill = new THREE.Mesh(new THREE.RingGeometry(rin, rout, 256, 1), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { opacity: { value: 0.04 } },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float opacity;
      void main() {
        #include <logdepthbuf_fragment>
        gl_FragColor = vec4(vec3(0.9, 0.68, 0.42) * opacity, 1.0);
      }` }));
  fill.rotation.x = -Math.PI / 2; fill.frustumCulled = false; mark.add(fill);
  const B = { b, bl, mat, styl, near, pts, mark, lineMat, fill, cell: null, sel: false };
  const div = document.createElement("div"); div.className = "label belt dc";   // hidden until the label sorting has looked at it
  div.innerHTML = `<div class="in"><div class="row"><span class="ic">⁘</span><span class="nm">${esc(beltName(bl, sysName))}</span></div></div>`;
  B.label = new CSS2DObject(div); B.div = div; B._dc = true;
  return B;
}
const beltName = (bl, sysName) => shortName({ name: bl.name || "Belt" }, sysName || (S ? S.sys.name : ""));
let _brs = 1; const _brnd = () => ((_brs = (Math.imul(_brs, 1664525) + 1013904223) >>> 0) / 4294967296);
const _bm4 = new THREE.Matrix4(), _bq4 = new THREE.Quaternion(), _be4 = new THREE.Euler(), _bp4 = new THREE.Vector3(), _bs4 = new THREE.Vector3();
function beltPut(ims, x, y, z, size, q) {             // one rock: model, turn, tumble and shade, always the same draws from the
  const mi = Math.floor(_brnd() * ims.length), e0 = _brnd() * 6.28, e1 = _brnd() * 6.28, e2 = _brnd() * 6.28;   // random stream, so a
  const seed = _brnd(), sh = 0.75 + _brnd() * 0.5, g = 0.96 + _brnd() * 0.06, bb = 0.92 + _brnd() * 0.1;      // rock looks the same
  const m = ims[mi]; if (m.count >= m.instanceMatrix.count) return;                                           // every time (v0.63.5)
  _bq4.setFromEuler(_be4.set(e0, e1, e2)); if (q) q.copy(_bq4);
  _bp4.set(x, y, z); _bs4.setScalar(size);
  m.setMatrixAt(m.count, _bm4.compose(_bp4, _bq4, _bs4)); m.geometry.attributes.aSeed.setX(m.count, seed); m.instanceColor.setXYZ(m.count, sh, sh * g, sh * bb); m.count++;
  return [m, m.count - 1];
}
function beltDone(ims) { for (const m of ims) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; m.geometry.attributes.aSeed.needsUpdate = true; } }
// rock count from the belt's mass per area (Spansh mass): dense belts look crowded, thin ones sparse (log scale)
function beltCount(bl) {
  const a = Math.PI * ((bl.outerRadius / 1e3) ** 2 - (bl.innerRadius / 1e3) ** 2), dens = bl.mass && a > 0 ? bl.mass / a : 1;
  return Math.round(Math.max(380, Math.min(7 * BELT_CAP.styl, 420 + 90 * (Math.log10(dens) + 5))));
}
function beltStylLayout(B) {                          // overview: a flat ring of small rocks between the compressed edges
  const b = B.b, bl = B.bl, map = r => Math.hypot(...Object.values(stylise({ x: r, y: 0, z: 0 }, b, null)));
  const ext = extentOf(b), a = Math.max(map(bl.innerRadius / 1e6), ext * 2.2), c = Math.max(map(bl.outerRadius / 1e6), a * 1.6);
  // rocks stay smaller than the smallest planet on screen (and far smaller than the star)
  const planets = S.bodies.filter(o => o.type === "Planet" && o._vis && !o._isMoon).map(o => o._vis * bodyScale);
  planets.sort((x, y) => x - y);
  const unit = Math.min(Math.max(planets.length ? planets[Math.floor(planets.length / 2)] * 0.6 : ext * 0.3, (c - a) * 0.006, (a + c) * 0.0022), Math.max(ext, planets.length ? planets[planets.length - 1] : 0) * 0.3);   // about half a typical planet, seen in wide belts too, never near the star's size
  const ims = B.styl.userData.ims; ims.forEach(m => (m.count = 0)); _brs = bodyHash({ name: bl.name || b.name }) || 7;
  const rocks = [], n = beltCount(bl);
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt(a * a + _brnd() * (c * c - a * a)), ang = _brnd() * 6.2831853, y0 = (_brnd() + _brnd() - 1) * unit * 0.6;
    const size = unit * (0.22 + 0.8 * Math.pow(_brnd(), 3)), x = Math.cos(ang) * r, z = -Math.sin(ang) * r, q = new THREE.Quaternion();
    const at = beltPut(ims, x, y0, z, size, q); if (at) rocks.push({ x, z, y0, size, q, m: at[0], i: at[1] });
  }
  beltDone(ims); B.styl.userData.rocks = rocks; B.styl.userData.mid = (a + c) / 2; B.styl.userData.out = c * 1.04; B.liftT = 0;
}
function beltLift(B, G, styl) {                       // overview: the rocks sit on the well surface, like the orbits
  const rocks = B.styl.userData.rocks; if (!rocks) return;
  const sp = B.b._obj.position;
  for (const k of rocks) {
    const y = (styl && $("vWell").checked ? surfaceY(G, sp.x + k.x, sp.z + k.z) + 0.04 : 0) - sp.y + k.y0;
    _bp4.set(k.x, y, k.z); _bs4.setScalar(k.size); k.m.setMatrixAt(k.i, _bm4.compose(_bp4, k.q, _bs4));
  }
  for (const m of B.styl.userData.ims) m.instanceMatrix.needsUpdate = true;
}
const BELT_CELL = 0.008;                              // Mm: 8 km cells around the camera (true scale)
function beltNear(B, camLocal) {                     // true scale: real-sized rocks near the camera, from a hash per cell (stable)
  const bl = B.bl, rin = bl.innerRadius / 1e6, rout = bl.outerRadius / 1e6, H = Math.min((rout - rin) * 0.05, 5), M = 0.4;
  const r = Math.hypot(camLocal.x, camLocal.z), inside = r > rin - M && r < rout + M && Math.abs(camLocal.y) < H + M;
  const cx = Math.floor(camLocal.x / BELT_CELL), cy = Math.floor(camLocal.y / BELT_CELL), cz = Math.floor(camLocal.z / BELT_CELL);
  const key = inside ? [cx, cy, cz].join() : "out";
  B.near.visible = inside;
  if (!inside) { B.cell = key; return; }
  // the group sits at the camera's cell; rock positions are small numbers relative to it (no float32 trouble far from the star)
  B.C = B.C || new THREE.Vector3(); B.C.set((cx + 0.5) * BELT_CELL, (cy + 0.5) * BELT_CELL, (cz + 0.5) * BELT_CELL);
  if (key === B.cell) return; B.cell = key;
  const ims = B.near.userData.ims; ims.forEach(m => (m.count = 0));
  const seed = bodyHash({ name: bl.name || "belt" }), inBand = (x, y, z) => { const rr = Math.hypot(x, z); return rr > rin && rr < rout && Math.abs(y) < H; };
  for (let i = -5; i <= 5; i++) for (let j = -3; j <= 3; j++) for (let k = -5; k <= 5; k++) {
    const X = cx + i, Y = cy + j, Z = cz + k, px = (X + 0.5) * BELT_CELL, py = (Y + 0.5) * BELT_CELL, pz = (Z + 0.5) * BELT_CELL;
    if (!inBand(px, py, pz)) continue;
    _brs = (Math.imul(X, 73856093) ^ Math.imul(Y, 19349663) ^ Math.imul(Z, 83492791) ^ seed) >>> 0 || 1;
    const n = Math.floor(_brnd() * 3);
    for (let q = 0; q < n; q++) { const big = _brnd() < 0.03;
      beltPut(ims, px - B.C.x + (_brnd() - 0.5) * BELT_CELL, py - B.C.y + (_brnd() - 0.5) * BELT_CELL, pz - B.C.z + (_brnd() - 0.5) * BELT_CELL,
        big ? 0.0015 + 0.0015 * _brnd() : 0.00003 + 0.0011 * Math.pow(_brnd(), 3)); }       // 30 m to 1.1 km, a few of 1.5–3 km
  }
  beltDone(ims);
  // farther out, up to ~±300 km: rocks too small to see as shapes, drawn as faint points
  const P = B.pts.geometry.attributes.position.array, FC = 0.06; let n = 0;
  const fx = Math.floor(camLocal.x / FC), fy = Math.floor(camLocal.y / FC), fz = Math.floor(camLocal.z / FC);
  for (let i = -5; i <= 5 && n < 2400; i++) for (let j = -2; j <= 2 && n < 2400; j++) for (let k = -5; k <= 5 && n < 2400; k++) {
    if (Math.abs(i) < 1 && Math.abs(k) < 1 && Math.abs(j) < 1) continue;
    const X = fx + i, Y = fy + j, Z = fz + k;
    _brs = (Math.imul(X, 92837111) ^ Math.imul(Y, 689287499) ^ Math.imul(Z, 283923481) ^ seed) >>> 0 || 1;
    for (let q = 0; q < 5 && n < 2400; q++) { const x = (X + _brnd()) * FC, y = (Y + _brnd()) * FC, z = (Z + _brnd()) * FC;
      if (inBand(x, y, z)) { P[n * 3] = x - B.C.x; P[n * 3 + 1] = y - B.C.y; P[n * 3 + 2] = z - B.C.z; n++; } }
  }
  B.pts.geometry.setDrawRange(0, n); B.pts.geometry.attributes.position.needsUpdate = true;
}
function beltFrame(B, styl, G, stars, night) {        // per frame: label spot, markers, the rock field, starlight
  const sp = B.b._obj.position, cam = camera.position, cl = _bcl.copy(cam).sub(sp);
  const tl = _bct.copy(controls.target).sub(sp), ang = tl.lengthSq() > 1e-12 ? Math.atan2(-tl.z, tl.x) : Math.atan2(-cl.z, cl.x);   // the name stands on the outer edge, where the view is centred
  const R = styl ? (B.styl.userData.mid || B.bl.outerRadius / 1e6) : (B.near.visible ? B.bl.outerRadius / 1e6 : (B.bl.innerRadius + B.bl.outerRadius) / 2e6);   // mid-band, at the outer edge from inside
  B.label.position.set(Math.cos(ang) * R, styl ? (B.styl.userData.rocks && $("vWell").checked ? surfaceY(G, sp.x + Math.cos(ang) * R, sp.z - Math.sin(ang) * R) + 0.04 - sp.y : 0) : 0, -Math.sin(ang) * R);
  const on = $("vRings").checked && !(SURF && !$("surfBelts").checked);
  B.label.visible = on;
  if (styl) { B.near.visible = false; if (((B.liftT = (B.liftT || 0) + 1) % 4) === 1) beltLift(B, G, true); }
  else {
    if (on) beltNear(B, cl); else B.near.visible = false;
    if (B.near.visible && B.C) B.near.position.copy(sp).add(B.C);
    const rin = B.bl.innerRadius / 1e6, rout = B.bl.outerRadius / 1e6, r = Math.hypot(cl.x, cl.z);
    const dBand = Math.hypot(Math.max(0, rin - r, r - rout), Math.abs(cl.y));          // how far the camera is from the band
    const f = THREE.MathUtils.smoothstep(dBand, 0.5, 30);                               // guides fade out as the rocks come in
    B.lineMat.opacity = 0.6 * f * (B.sel ? 1.4 : 1); B.fill.material.uniforms.opacity.value = 0.012 * f * (B.sel ? 1.8 : 1); B.mark.visible = on && f > 0.01;
  }
  const u = B.mat.uniforms;
  stars.forEach((s, i) => { u.uStars.value[i].set(s._obj.position.x, s._obj.position.y, s._obj.position.z, s._r * k(s)); u.uStarCol.value[i].copy(s._color).lerp(WHITE, $("vWB").checked ? 0.97 : 0.8).multiplyScalar(1.1); u.uEcl.value[i] = 1; });
  u.uNStars.value = stars.length; u.uNOcc.value = 0; u.uNight.value = night;
}
const _bcl = new THREE.Vector3(), _bct = new THREE.Vector3();
function beltTip(B) {
  const bl = B.bl, km = v => fmt(v / 1000, 0) + " km", ls = v => fmt(v / 299792458, 2) + " ls";
  return `<b>${esc(beltName(bl))}</b> <span>${esc(bl.type || "")} asteroid belt</span>` +
    `<div>Around ${esc(shortName(B.b, S.sys.name))}: ${km(bl.innerRadius)} to ${km(bl.outerRadius)} (${ls(bl.innerRadius)} to ${ls(bl.outerRadius)})</div>` +
    (bl.mass ? `<div>Mass ${fmt(bl.mass, 0)} Mt</div>` : "") +
    `<div class="dim">The band is from Spansh. The rocks are illustrative${TRUESCALE ? ", at their real size: you see them only up close. Double-click to fly in among them" : ""}.</div>`;
}
// ---- a belt is selected like a body: its own panel, and the same mark in 3D, the list and the map
let SELB = null;
function beltUnselect() {
  if (!SELB) return; const B = SELB; SELB = null; B.sel = false;
  B.div.classList.remove("sel"); if (B.item) B.item.classList.remove("sel");
  document.querySelectorAll(".smbelt.sel").forEach(e => e.classList.remove("sel"));
}
function beltSelect(B) {
  if (selected) { selected._item && selected._item.classList.remove("sel"); selected._div.classList.remove("sel"); selected = null; }
  beltUnselect(); if (typeof ringUnselect === "function") ringUnselect(); SELB = B; B.sel = true; Sound.click();
  B.div.classList.add("sel"); if (B.item) B.item.classList.add("sel");
  document.querySelectorAll(".smbelt").forEach(e => e.classList.toggle("sel", e.dataset.belt === (B.bl.name || "")));
  if (MAPMODE) smapMarkSel();
  const bl = B.bl, km = v => fmt(v / 1000, 0) + " km", ls = v => fmt(v / 299792458, 2) + " ls", rows = [];
  const row = (k, v) => v != null && v !== "" && rows.push(`<tr><td>${k}</td><td>${v}</td></tr>`);
  row("Type", esc(bl.type || "—")); row("Around", `<a href="#" id="beltStar">${esc(shortName(B.b, S.sys.name))}</a>`);
  row("Inner edge", `${km(bl.innerRadius)} (${ls(bl.innerRadius)})`); row("Outer edge", `${km(bl.outerRadius)} (${ls(bl.outerRadius)})`);
  row("Width", km(bl.outerRadius - bl.innerRadius)); row("Mass", bl.mass ? fmt(bl.mass, 0) + " Mt" : null);
  $("infoBody").innerHTML = `<h2>${esc(beltName(bl))}</h2><div class="kind">${esc(bl.type || "")} asteroid belt</div>
    <table>${rows.join("")}</table>
    <div class="illus">The band (edges, type and mass) is from Spansh. The rocks in 3D are illustrative: in True scale they have real sizes (tens of metres to a few km), so they show only when you are among them; in the Overview they are enlarged like everything else.</div>
    <button id="beltGo" class="btn">⤢ Fly in among the rocks</button>`;
  $("beltStar").onclick = e => { e.preventDefault(); select(B.b, false); };
  $("beltGo").onclick = () => beltFly(B);
  const el = $("info"); clearTimeout(infoHide.t); el.classList.remove("closing"); el.style.display = "block";
  if (el.classList.contains("collapsed")) setCollapsed("info", false);
  if (isPhone()) setSheet("info");
  mnavState(); updateUrl();
}
function beltFly(B) {                                // fly to the belt; in True scale right in among the rocks
  if (MAPMODE) setMap(false, false);
  if (SURF) exitSurface(false);
  const sp = B.b._obj.position, cl = camera.position.clone().sub(sp), ang = Math.atan2(-cl.z, cl.x);
  if (TRUESCALE) {
    const rm = (B.bl.innerRadius + B.bl.outerRadius) / 2e6, p = new THREE.Vector3(Math.cos(ang) * rm, 0, -Math.sin(ang) * rm).add(sp);
    focus = null; fly = null; fadeFlash();
    setOrigin(sceneToWorld(p)); updateScene();                              // the origin moves to the belt: small numbers, exact rocks
    const t = B.b._obj.position.clone().add(new THREE.Vector3(Math.cos(ang) * rm, 0, -Math.sin(ang) * rm));
    const out = new THREE.Vector3(Math.cos(ang), 0, -Math.sin(ang)), side = new THREE.Vector3(-out.z, 0, out.x);
    controls.target.copy(t); camera.position.copy(t).addScaledVector(side, 0.006).addScaledVector(out, 0.002).add(new THREE.Vector3(0, 0.0012, 0));
  } else {
    const R = B.styl.userData.mid || 1, p = new THREE.Vector3(Math.cos(ang) * R, 0, -Math.sin(ang) * R).add(sp), d = Math.max(R, 1) * 0.35;
    p.y = $("vWell").checked ? surfaceY(S.gridS, p.x, p.z) : 0;                 // the rocks lie on the well surface
    const out = p.clone().sub(sp).normalize(), toP = p.clone().addScaledVector(out, d * 0.6).add(new THREE.Vector3(0, d * 0.35, 0)).addScaledVector(new THREE.Vector3(-out.z, 0, out.x), d * 0.7);
    focus = null; fly = { t0: performance.now(), dur: 1200, fromT: controls.target.clone(), fromP: camera.position.clone(), toT: p, toP };
  }
  beltSelect(B);
}
function beltHit(ray) {                              // the rock under the pointer, if any (only drawn rocks count)
  let best = null;
  for (const B of (S && S.belts) || []) for (const g of [B.styl, B.near]) if (g.visible) {
    const h = ray.intersectObjects(g.userData.ims.filter(m => m.count), false);
    if (h.length && (!best || h[0].distance < best.d)) best = { B, d: h[0].distance };
  }
  return best;
}

// ---- v0.64 planetary rings are selected like a body: tooltip, panel, pink mark in 3D and on the map, empty click lets go
let SELR = null, HOVR = null;                         // SELR / HOVR: { b, ri } — one ring of one planet
function ringRows(b) { return (b.rings || []).slice().sort((x, y) => x.innerRadius - y.innerRadius); }
function ringMeshOf(b, ri) { const r = ringRows(b)[ri]; return r && (b._ex.rings || []).find(m => m.userData.ring === r); }
function ringMark() {                                // 3D tint and map class follow the hovered and the selected ring
  for (const o of (S && S.bodies) || []) for (const m of (o._ex && o._ex.rings) || []) if (m.material.uniforms && m.material.uniforms.uSel) {
    const r = m.userData.ring, on = x => x && x.b === o && ringRows(o)[x.ri] === r;
    m.material.uniforms.uSel.value = on(SELR) ? 1 : on(HOVR) ? 0.5 : 0;
  }
  document.querySelectorAll(".smring, .smredge").forEach(e => { const id = +e.dataset.id, ri = +e.dataset.ri;
    e.classList.toggle("sel", !!SELR && SELR.b.bodyId === id && SELR.ri === ri); e.classList.toggle("hov", !!HOVR && HOVR.b.bodyId === id && HOVR.ri === ri); });
}
function ringHover(b, ri) { const n = b ? { b, ri } : null; if ((n && HOVR && n.b === HOVR.b && n.ri === HOVR.ri) || (!n && !HOVR)) return; HOVR = n; ringMark(); }
function ringTip(b, r) {
  const km = v => fmt(v / 1000, 0) + " km", rs = ringRows(b), n = rs.length;
  if (!r) r = rs[0];
  return `<b>${esc(shortName({ name: r.name || "Ring" }, S.sys.name))}</b> <span>${esc(r.type || "")} ring${n > 1 ? ` · ${rs.indexOf(r) + 1} of ${n}` : ""}</span>` +
    `<div>${km(r.innerRadius)} to ${km(r.outerRadius)} · ${km(r.outerRadius - r.innerRadius)} wide</div>` +
    (r.mass ? `<div>Mass ${fmt(r.mass, 0)} Mt</div>` : "") + `<div class="dim">Around ${esc(shortName(b, S.sys.name))} · from Spansh. Click for details</div>`;
}
function ringUnselect() { if (!SELR) return; SELR = null; ringMark(); }
function ringSelect(b, ri = 0) {
  if (selected) { selected._item && selected._item.classList.remove("sel"); selected._div.classList.remove("sel"); selected = null; }
  beltUnselect(); SELR = { b, ri }; ringMark(); Sound.click();
  if (MAPMODE) smapMarkSel();
  const km = v => fmt(v / 1000, 0) + " km", ls = v => fmt(v / 299792458, 3) + " ls", R = (b.radius || 1) * 1000, rs = ringRows(b);
  const rows = rs.map((r, i) => `<tr class="${i === ri ? "rsel" : ""}"><td colspan="2"><div class="sec">${esc(shortName({ name: r.name || "Ring" }, S.sys.name))}${i === ri ? " · selected" : ""}</div></td></tr>` +
    `<tr class="${i === ri ? "rsel" : ""}"><td>Type</td><td>${esc(r.type || "—")}</td></tr><tr class="${i === ri ? "rsel" : ""}"><td>Inner edge</td><td>${km(r.innerRadius)} (${fmt(r.innerRadius / R, 2)} × the planet's radius)</td></tr>` +
    `<tr class="${i === ri ? "rsel" : ""}"><td>Outer edge</td><td>${km(r.outerRadius)} (${ls(r.outerRadius)})</td></tr><tr class="${i === ri ? "rsel" : ""}"><td>Width</td><td>${km(r.outerRadius - r.innerRadius)}</td></tr>` +
    (r.mass ? `<tr class="${i === ri ? "rsel" : ""}"><td>Mass</td><td>${fmt(r.mass, 0)} Mt</td></tr>` : "")).join("");
  $("infoBody").innerHTML = `<h2>${esc(shortName({ name: rs[ri].name || "Ring" }, S.sys.name))}</h2><div class="kind">${esc(rs[ri].type || "")} ring · ${rs.length > 1 ? `${ri + 1} of ${rs.length} rings ` : ""}around <a href="#" id="ringBody">${esc(shortName(b, S.sys.name))}</a></div>
    <table>${rows}</table>
    <div class="illus">Edges, type and mass are from Spansh. The fine ringlets and gaps in the picture are illustrative; the colour follows the ring type.</div>`;
  $("ringBody").onclick = e => { e.preventDefault(); select(b, false); };
  const el = $("info"); clearTimeout(infoHide.t); el.classList.remove("closing"); el.style.display = "block";
  if (el.classList.contains("collapsed")) setCollapsed("info", false);
  if (isPhone()) setSheet("info");
  mnavState(); updateUrl();
}
const _rhP = new THREE.Vector3();
function ringHit(ray) {                              // the ring under the pointer in 3D (only where the ring has material)
  let best = null;
  for (const b of (S && S.bodies) || []) for (const m of (b._ex && b._ex.rings) || []) {
    if (!m.visible) continue;
    const h = ray.intersectObject(m, false); if (!h.length) continue;
    m.worldToLocal(_rhP.copy(h[0].point)); const rad = Math.hypot(_rhP.x, _rhP.y) * 1e6;   // RingGeometry lies in its local xy plane
    const r = ringRows(b).find(x => rad >= x.innerRadius && rad <= x.outerRadius);
    if (r && (!best || h[0].distance < best.d)) best = { b, r, ri: ringRows(b).indexOf(r), d: h[0].distance };
  }
  return best;
}
