// ---------------------------------------------- procedural surface textures
// v0.60: surfaces are baked on the graphics card. Spansh has no surface maps, so every pattern is generated from the
// body's own data and its id (the same body always looks the same). What is set by data and what is illustrative:
//  · gas giants: the game's 7-layer cloud model (EDGGG explainer, verified on 39 of 39 green gas giants). Each layer
//    gets the colour of its class and temperature band, so the mix of colours follows the data. Swirls are illustrative.
//  · rings: colour from the ring type (verified on CMDR Hongark's screenshots). Fine structure is illustrative.
//  · solid bodies: base colour from type, composition and temperature. Craters, patches and cracks are illustrative.
// Textures are equirectangular (same layout as THREE.SphereGeometry), albedo + object-space normal map, baked in strips
// over several frames, at a resolution that follows the body's size on screen, capped by the quality setting.
const PAL = [                                   // flat colours for the system map, charts and before a bake is ready
  [/Class I gas/i, [[196, 172, 140], [226, 210, 182], [120, 110, 170], [238, 224, 200]]],
  [/Class II gas/i, [[226, 226, 228], [206, 204, 200], [240, 238, 234], [190, 188, 184]]],
  [/Class III gas/i, [[64, 84, 160], [92, 112, 182], [44, 60, 130], [120, 140, 196]]],
  [/Class IV gas/i, [[112, 56, 52], [138, 72, 60], [90, 42, 44], [130, 120, 120]]],
  [/Class V gas/i, [[128, 116, 94], [182, 170, 144], [92, 82, 66], [200, 190, 166]]],
  [/water-based life/i, [[206, 186, 156], [166, 136, 102], [140, 110, 80], [226, 212, 186]]],
  [/ammonia-based life/i, [[194, 166, 122], [196, 126, 58], [142, 62, 44], [222, 204, 168]]],
  [/Water giant/i, [[82, 132, 176], [110, 152, 190], [60, 100, 150], [150, 186, 210]]],
  [/Helium/i, [[216, 210, 226], [196, 190, 214], [232, 228, 242], [180, 174, 200]]],
  [/gas giant/i, [[200, 176, 140], [224, 204, 170], [170, 140, 104], [236, 222, 196]]],
  [/Earth-like/i, [[54, 92, 140], [70, 110, 70], [222, 226, 230], [150, 130, 96]]],
  [/Water world/i, [[60, 92, 140], [90, 120, 160], [220, 226, 232], [40, 70, 120]]],
  [/Ammonia world/i, [[110, 100, 102], [132, 112, 100], [118, 98, 112], [160, 140, 116]]],
  [/Rocky ice/i, [[168, 176, 190], [120, 126, 138], [214, 220, 228], [96, 100, 110]]],
  [/Icy/i, [[222, 222, 220], [200, 200, 198], [240, 240, 238], [170, 172, 176]]],
  [/Metal rich/i, [[106, 100, 96], [78, 74, 70], [138, 130, 122], [60, 56, 54]]],
  [/High metal/i, [[150, 126, 96], [112, 92, 74], [178, 152, 112], [90, 74, 60]]],
  [/Rocky/i, [[150, 140, 128], [112, 104, 96], [176, 164, 146], [84, 78, 72]]],
];
const palette = b => {
  if (isGiant(b)) { const g = giantLook(b); if (g) return g.flat; }
  return (PAL.find(([re]) => re.test(b.subType || "")) || [0, PAL[PAL.length - 1][1]])[1];
};
// ---- the game's gas giant cloud ladder (as published by EDGGG, densitydemo.html; checked against 39 catalogue GGGs)
const GG_CRACK_I = [115, 250, 270, 370, 700, 900, 1400], GG_CRACK_O = [114, 210, 270, 370, 700, 900, 1400];
function giantLadder(b) {
  const st = b.subType || "", f = Math.fround, T = f(b.surfaceTemperature || 0), M = b.earthMasses, R = b.radius;
  if (!T || !M || !R) return null;
  const cls = /Class I gas/i.test(st) ? 1 : /Class II gas/i.test(st) ? 2 : /Class III gas/i.test(st) ? 3 : /Class IV gas/i.test(st) ? 4
    : /Class V gas/i.test(st) ? 5 : /water-based/i.test(st) ? 10 : /ammonia-based/i.test(st) ? 11 : /Water giant/i.test(st) ? 17 : 0;
  const ceil = T < 75 ? 100 : T < 330 ? 340 : T < 680 ? 700 : T < 900 ? 1200 : T < 1400 ? 1500 : 5000;
  const rho = M * 5.97219e24 / (4 / 3 * Math.PI * Math.pow(R * 1e3, 3));
  const top = Math.pow(rho / 1300 * T, 1.2) * (1 / 180) * (130000 / rho) + T;
  let step = (Math.min(ceil, top) - T) / 7;
  const clamp = { 2: [5, 20], 3: [30, 100], 4: [50, 100], 5: [250, 1000] }[cls];
  if (clamp) step = Math.max(clamp[0], Math.min(clamp[1], step));
  const bottom = Math.min(ceil, T), cracks = cls === 1 || cls === 11 ? GG_CRACK_I : GG_CRACK_O;
  const rungs = Array.from({ length: 7 }, (_, k) => f(step * k + bottom));
  return { cls, rungs, band: rungs.map(r => cracks.filter(c => r >= c).length), green: rungs.map(r => cracks.includes(r)) };
}
// Layer colours by class and temperature band (sRGB). Measured from CMDR Hongark's in-game screenshots of 16 Oct 2026
// (Class I to V, water and ammonia life); bands not seen yet are interpolated and marked "guess".
const GG_COL = {
  1: [[[64, 60, 146], [94, 90, 170], [48, 46, 120]],                  // < 115 K: blue-violet (seen: VR-E 7, 8, 9)
      [[200, 184, 160], [168, 148, 124], [222, 212, 192]],             // 115–250 K: beige, tan, cream (seen: VR-E 1, 2, 6, UF-M c8-10 AB 11)
      [[232, 218, 194], [206, 186, 156]],                              // 250–270 K: light cream (seen: VU-M 3)
      [[196, 140, 92], [222, 196, 160]],                               // 270–370 K: guess
      [[160, 92, 66]]],                                                // hotter: guess
  2: [[[214, 220, 230]], [[232, 232, 234], [214, 214, 216]], [[214, 214, 216], [226, 218, 200]], [[214, 206, 192], [196, 192, 186]], [[190, 182, 172]]],
  3: [[[44, 56, 128]], [[44, 56, 128]], [[40, 52, 124], [62, 78, 150]], [[32, 42, 112], [56, 70, 140]], [[38, 50, 120], [66, 82, 152], [26, 34, 96]]],
  4: [[[120, 64, 52]], [[120, 64, 52]], [[120, 64, 52]], [[120, 64, 52]], [[124, 62, 52], [150, 84, 64]], [[112, 58, 50], [134, 80, 64]], [[98, 44, 42], [118, 60, 50], [86, 38, 38], [140, 94, 80]]],     // dark maroon, brown, a little rose-grey (seen: UF-M c8-5 1)
  5: [[[112, 100, 80]], [[112, 100, 80]], [[112, 100, 80]], [[112, 100, 80]], [[112, 100, 80]], [[112, 100, 80]], [[112, 100, 80]], [[112, 100, 80], [164, 152, 128], [80, 70, 56]]],
  10: [[[214, 200, 176]], [[214, 194, 164], [190, 170, 140]], [[170, 140, 104], [206, 186, 156]], [[146, 114, 82], [190, 166, 132]], [[130, 96, 70]]],
  11: [[[150, 144, 150]], [[196, 170, 128], [214, 192, 150], [176, 146, 104]], [[184, 124, 64], [214, 194, 158]], [[150, 92, 50], [176, 112, 58], [212, 192, 158]], [[130, 70, 44]]],
  17: [[[90, 130, 170], [120, 156, 186]], [[90, 130, 170]], [[90, 130, 170]], [[90, 130, 170]], [[90, 130, 170]]],
};
const GG_GREEN = [100, 178, 84];
function giantLook(b) {
  const L = giantLadder(b); if (!L) return null;
  const table = GG_COL[L.cls] || GG_COL[1], h = bodyHash(b);
  const cols = L.rungs.map((r, k) => {
    if (L.green[k]) return GG_GREEN;                         // a layer exactly on a band edge gets no colour: default green
    let set = table[Math.min(L.band[k], table.length - 1)];
    if (L.cls === 1 && L.band[k] === 0 && L.band.some(x => x > 0)) set = [[150, 146, 160], [128, 124, 136]];   // a few cold layers in a beige giant read as grey streaks (AB 11)
    return set[(k + (h >>> (k * 3))) % set.length];
  });
  const flat = [0, 2, 4, 6].map(i => cols[i]);
  return { ...L, cols, flat };
}
// colours measured from in-game screenshots (16 Oct 2026): [darker, lighter] sRGB of the lit disc centre.
// Used as the base colour of these bodies. Which icy bodies are red is not in the data, so only checked bodies get it.
const VERIFIED = {
  "col 285 sector vr-e b27-1 1 a": [[212, 198, 192], [236, 223, 217]],
  "col 285 sector vr-e b27-1 10": [[136, 128, 126], [181, 173, 169]],
  "col 285 sector vr-e b27-1 2 a": [[197, 182, 174], [223, 208, 200]],
  "col 285 sector vr-e b27-1 3 a": [[218, 203, 196], [239, 226, 220]],
  "col 285 sector vr-e b27-1 3 b": [[198, 183, 174], [222, 209, 201]],
  "col 285 sector vr-e b27-1 7 a": [[210, 195, 188], [232, 219, 212]],
  "col 285 sector vr-e b27-1 7 b": [[195, 182, 174], [221, 209, 202]],
  "col 285 sector vr-e b27-1 7 c": [[196, 179, 169], [226, 213, 205]],
  "col 285 sector vr-e b27-1 7 d": [[181, 161, 153], [227, 213, 207]],
  "col 285 sector vr-e b27-1 7 e": [[187, 171, 163], [221, 208, 200]],
  "col 285 sector vr-e b27-1 7 g": [[117, 83, 78], [152, 120, 113]],
  "col 285 sector vr-e b27-1 8 a": [[195, 179, 171], [225, 211, 204]],
  "col 285 sector vr-e b27-1 8 b": [[186, 170, 160], [222, 208, 200]],
  "col 285 sector vr-e b27-1 8 c": [[99, 85, 78], [139, 120, 111]],
  "col 285 sector vr-e b27-1 8 d": [[197, 182, 174], [223, 210, 203]],
  "col 285 sector vr-e b27-1 8 e": [[213, 198, 191], [235, 222, 216]],
  "col 285 sector vr-e b27-1 8 f": [[198, 184, 177], [222, 209, 202]],
  "col 285 sector vr-e b27-1 8 g": [[131, 102, 92], [155, 125, 113]],
  "col 285 sector vr-e b27-1 9 a": [[214, 199, 192], [236, 224, 217]],
  "col 285 sector vr-e b27-1 9 b": [[200, 185, 177], [224, 210, 203]],
  "col 285 sector vr-e b27-1 7 f": [[208, 192, 184], [235, 222, 216]],
  "col 285 sector vu-m c8-1 2 a": [[106, 88, 70], [130, 109, 88]],
  "col 285 sector vu-m c8-1 2 b": [[184, 160, 137], [210, 188, 167]],
  "col 285 sector vu-m c8-1 2 c": [[181, 158, 138], [210, 189, 169]],
  "col 285 sector vu-m c8-1 2 d": [[123, 94, 78], [151, 118, 99]],
  "col 285 sector vu-m c8-1 2 e": [[110, 90, 76], [135, 112, 96]],
  "col 285 sector vu-m c8-1 2 f": [[209, 192, 174], [235, 221, 205]],
  "col 285 sector vu-m c8-1 3 a": [[113, 97, 82], [154, 134, 115]],
  "col 285 sector vu-m c8-1 3 b a": [[228, 210, 190], [246, 233, 219]],
  "col 285 sector vu-m c8-1 3 b": [[157, 142, 122], [206, 190, 172]],
  "col 285 sector vu-m c8-1 3 c": [[137, 102, 88], [173, 135, 117]],
  "col 285 sector vu-m c8-1 3 d a": [[212, 197, 178], [235, 223, 207]],
  "col 285 sector vu-m c8-1 3 d": [[160, 141, 123], [203, 185, 167]],
  "col 285 sector vu-m c8-1 4 a": [[212, 192, 170], [234, 220, 203]],
  "col 285 sector vu-m c8-1 4 b": [[224, 207, 188], [245, 232, 217]],
  "col 285 sector vu-m c8-1 4 c": [[230, 213, 197], [248, 235, 221]]
};
const verifiedLook = b => VERIFIED[String(b.name || "").toLowerCase()] || null;
function bodyHash(b) { let h = 2166136261 >>> 0; const s = String(b.id64 || b.name || b.bodyId); for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h >>> 0; }
const srgb2lin = c => c.map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });

// ---- the bake shader: hash noise, gradient noise, crater fields; one material for every body kind
const BAKE_GLSL = `
precision highp float; precision highp int;
uniform int uKind, uMode; uniform uvec2 uSeed; uniform float uEps, uScale;
uniform vec3 uC[8]; uniform vec4 uP[6]; uniform vec3 uRung[7];
varying vec2 vUv;
uvec3 pcg3(uvec3 v) { v = v * 1664525u + 1013904223u; v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y; v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y; return v; }
vec3 rnd3(ivec3 c, uint s) { return vec3(pcg3(uvec3(c + ivec3(1 << 20)) + uvec3(uSeed.x, uSeed.y, s)) & 0xFFFFu) / 65535.0; }   // offset: no negative → uint
float gnoise(vec3 p, uint s) {                         // gradient noise, quintic fade, about -1..1
  ivec3 i = ivec3(floor(p)); vec3 f = fract(p), u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n[8];
  for (int k = 0; k < 8; k++) { ivec3 o = ivec3(k & 1, (k >> 1) & 1, k >> 2); vec3 g = rnd3(i + o, s) * 2.0 - 1.0; n[k] = dot(g, f - vec3(o)); }
  return 1.6 * mix(mix(mix(n[0], n[1], u.x), mix(n[2], n[3], u.x), u.y), mix(mix(n[4], n[5], u.x), mix(n[6], n[7], u.x), u.y), u.z);
}
const mat3 ROT = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
float fbm(vec3 p, int oct, uint s) { float a = 0.5, t = 0.0; for (int o = 0; o < 10; o++) { if (o >= oct) break; t += a * gnoise(p, s + uint(o)); p = ROT * p * 2.03; a *= 0.5; } return t; }
float ridged(vec3 p, int oct, uint s) { float a = 0.5, t = 0.0; for (int o = 0; o < 10; o++) { if (o >= oct) break; float n = 1.0 - abs(gnoise(p, s + uint(o))); t += a * n * n; p = ROT * p * 2.03; a *= 0.5; } return t; }
vec3 sph(vec2 uv) { float th = (1.0 - uv.y) * 3.14159265, ph = uv.x * 6.28318531; return vec3(-cos(ph) * sin(th), cos(th), sin(ph) * sin(th)); }
// craters on a sphere: jittered cells at several scales; returns height and a "fresh crater" brightness term
vec2 craters(vec3 d, float freq, float depth, float rays) {
  float h = 0.0, br = 0.0;
  for (int lv = 0; lv < 4; lv++) {
    float sc = freq * pow(2.3, float(lv)), dens = 0.9 - 0.12 * float(lv);
    vec3 p = d * sc; ivec3 c0 = ivec3(floor(p - 0.5));
    for (int k = 0; k < 8; k++) {
      ivec3 c = c0 + ivec3(k & 1, (k >> 1) & 1, k >> 2); vec3 r = rnd3(c, 900u + uint(lv));
      if (r.z > dens) continue;
      vec3 ctr = vec3(c) + 0.25 + 0.5 * r; float rad = 0.12 + 0.3 * pow(rnd3(c, 950u).x, 2.0);
      float u = length(p - ctr) / rad;
      if (u > 2.6) continue;
      float age = rnd3(c, 970u).y, dd = depth * rad / sc * 0.32;            // depth ~ 1/5 of the diameter
      h += (u < 1.0 ? (u * u - 1.0) * dd * 0.8 : 0.0) + dd * 0.35 * exp(-(u - 1.0) * (u - 1.0) / 0.03) * smoothstep(2.4, 1.0, u);
      if (u < 1.0 && rad > 0.3 && lv < 2) h += dd * 0.25 * exp(-u * u / 0.02);            // central peak in big craters
      br += (1.0 - age) * smoothstep(1.6, 0.9, u) * 0.35;                                    // young craters are brighter
      if (age < rays && lv < 2) { float a = atan(p.y - ctr.y, p.x - ctr.x) + (p.z - ctr.z);
        br += (1.0 - age / max(rays, 1e-3)) * smoothstep(5.0, 1.0, u) * pow(abs(sin(a * 11.0 + r.x * 30.0)), 18.0) * 0.45 * (0.5 + 0.5 * gnoise(p * 3.0, 975u)); }
    }
  }
  return vec2(h, br);
}
// ---- kinds: 0 gas giant · 1 solid (rocky, icy, metal, rocky ice, HMC) · 2 ocean world (ELW, water world) · 3 ammonia world
vec3 rotAx(vec3 v, vec3 k, float a) { return v * cos(a) + cross(k, v) * sin(a) + k * dot(k, v) * (1.0 - cos(a)); }
vec3 stormC(int i, out float sr) { vec3 r = rnd3(ivec3(i, 7, 3), 60u); float sl = (r.x - 0.5) * 1.6, slo = r.y * 6.2831853; sr = 0.025 + 0.07 * r.z * r.z;
  return vec3(-cos(slo) * cos(sl), sin(sl), sin(slo) * cos(sl)); }
vec3 giant(vec3 d) {
  // vortices first: they twist the coordinates, so bands curl around them
  vec3 dw = d;
  for (int i = 0; i < 10; i++) {
    if (float(i) >= uP[1].x) break;
    float sr; vec3 c = stormC(i, sr); float dl = acos(clamp(dot(d, c), -1.0, 1.0)) / sr;
    if (dl < 3.0) dw = rotAx(dw, c, (rnd3(ivec3(i, 2, 2), 63u).x < 0.5 ? -1.0 : 1.0) * 1.4 * exp(-dl * dl * 1.2));
  }
  // shear zones: a large slow warp plus a finer one, so band edges wave and curl instead of fraying
  float lat = asin(clamp(dw.y, -1.0, 1.0)), Z = uP[0].z;
  float wa = fbm(vec3(dw.x, dw.y * 4.0, dw.z) * 1.8 * uP[0].x + 3.1, 5, 10u);
  float wb = fbm(vec3(dw.x * 6.0, dw.y * 30.0, dw.z * 6.0) + wa * 1.5, 4, 20u);
  float y = lat + 0.05 * uP[0].y * wa + 0.014 * uP[0].y * wb;
  float zones = 0.5 + 0.5 * (0.55 * sin(y * Z + 1.3) + 0.3 * sin(y * Z * 2.37 + 0.4) + 0.15 * sin(y * Z * 5.1 + 2.0));
  float along = fbm(vec3(dw.x * 2.5, y * Z * 0.6, dw.z * 2.5), 4, 30u) * 0.5 + 0.5;     // each band changes slowly along its length
  float raw = zones * 0.82 + along * 0.18;
  float blot = fbm(vec3(dw.x, dw.y * 1.6, dw.z) * 3.2 + wa, 6, 35u) * 0.5 + 0.5;           // life giants: blotches over weak bands
  raw = mix(raw, blot, uP[0].w);
  float pol = smoothstep(0.95, 1.3, abs(lat) + 0.1 * wa);                                    // poles: no bands, mottled
  raw = mix(raw, fbm(dw * 5.0 + wa, 6, 50u) * 0.5 + 0.45, pol);
  raw = clamp(raw * 1.15 - 0.07, 0.0, 1.0);
  float layer = 6.999 * pow(raw, 0.62);
  vec3 col = vec3(0.0); float wsum = 0.0;                                                   // soft blend of neighbouring layers: painted, not cut
  for (int k = 0; k < 7; k++) { float e = layer - float(k) - 0.5, wk = exp(-e * e * 2.6); col += uRung[k] * wk; wsum += wk; }
  col /= wsum;
  col *= 0.9 + 0.2 * mix(fbm(vec3(dw.x * 8.0, y * 90.0, dw.z * 8.0) + wa, 3, 80u) * 0.5 + 0.5, 0.5, pol);   // fine streaks along the flow
  col *= 0.95 + 0.1 * (fbm(dw * 30.0 + wa * 3.0, 3, 85u) * 0.5 + 0.5);                                       // small eddies
  for (int i = 0; i < 10; i++) {                                                                       // storm cores take a layer colour
    if (float(i) >= uP[1].x) break;
    float sr; vec3 c = stormC(i, sr); vec3 e = d - c; e.y *= 1.7; float o = length(e) / (sr * 0.45);
    if (o > 1.2) continue;
    int pick = int(rnd3(ivec3(i, 4, 4), 62u).x * 6.99); vec3 sc = uRung[0];
    for (int k = 0; k < 7; k++) if (k == pick) sc = uRung[k];
    col = mix(col, sc * (0.92 + 0.12 * sin(o * 14.0)), smoothstep(1.0, 0.6, o) * 0.8);
  }
  return col;
}
float solidH(vec3 d) {
  float s = uScale, h = fbm(d * 1.6 * s, 6, 100u) * uP[0].x * 0.02 / s;                    // lowlands and highlands (relief ~1% of the radius)
  h += ridged(d * 3.2 * s + 4.0, 6, 120u) * uP[0].y * 0.012 / s;                            // mountains, ridges
  h += craters(d, 2.2 * s * (1.0 + uP[2].x), uP[0].z, uP[2].w).x;
  h -= uP[1].x * pow(max(ridged(d * 5.0 * s + 9.0, 4, 140u) - 0.6, 0.0), 2.0) * 0.02 / s;  // cracks (icy)
  return h;
}
vec4 solid(vec3 d) {                                       // rgb albedo, a = specular (none on solids)
  float s = uScale, h = solidH(d), m = fbm(d * 1.6 * s, 6, 100u);
  vec3 col = mix(uC[0], uC[1], smoothstep(-0.35, 0.45, m));                               // lowland → highland
  col = mix(col, uC[2], smoothstep(0.15, 0.5, fbm(d * 2.4 * s + 31.0, 5, 160u)) * uP[1].y);   // coloured patches
  float cr = uP[1].x * smoothstep(0.62, 0.9, ridged(d * 5.0 * s + 9.0, 4, 140u));
  col = mix(col, uC[3], cr);                                                               // crack lines
  vec2 c = craters(d, 2.2 * s * (1.0 + uP[2].x), uP[0].z, uP[2].w);
  col = mix(col, uC[4], clamp(c.y, 0.0, 1.0) * uP[2].z);                                  // fresh craters, rays
  col *= 0.88 + 0.24 * (fbm(d * 18.0 * s, 4, 180u) * 0.5 + 0.5);                          // grain
  float cap = smoothstep(uP[1].z - 0.06, uP[1].z + 0.04, abs(d.y) + 0.05 * fbm(d * 6.0, 4, 190u));
  col = mix(col, uC[5], cap * step(0.01, uP[1].w));                                       // polar frost
  return vec4(col, 0.0);
}
vec4 ocean(vec3 d) {
  float s = uScale, land = fbm(d * 1.4 * s, 8, 200u) + uP[0].x, hum = fbm(d * 2.0 * s + 5.0, 5, 210u);
  float lat = abs(d.y);
  vec3 sea = mix(uC[0], uC[1], smoothstep(-0.1, 0.12, land));                              // deep → shallow
  vec3 ground = mix(uC[2], uC[3], smoothstep(-0.2, 0.25, hum + lat * 0.6 - 0.2));          // green → dry
  ground = mix(ground, uC[4], smoothstep(0.25, 0.55, land) * 0.6);                          // mountains
  float isLand = smoothstep(0.0, 0.02, land) * step(0.5, uP[0].y);
  vec3 col = mix(sea, ground, isLand); float spec = 1.0 - isLand;
  float ice = smoothstep(uP[1].x - 0.05, uP[1].x + 0.05, lat + 0.12 * fbm(d * 4.0 + 3.0, 5, 220u));
  col = mix(col, uC[5], ice); spec *= 1.0 - ice;
  vec3 cq = d + 0.35 * vec3(fbm(d * 2.0, 4, 230u), fbm(d * 2.0 + 9.0, 4, 231u), fbm(d * 2.0 + 17.0, 4, 232u));
  float cl = smoothstep(uP[1].y, uP[1].y + 0.35, fbm(vec3(cq.x * 3.0, cq.y * 6.0, cq.z * 3.0), 7, 240u) * 0.5 + 0.5);
  col = mix(col, vec3(0.86), cl); spec *= 1.0 - cl;
  return vec4(col, spec);
}
vec4 ammonia(vec3 d) {                                     // seen: brown, grey and mauve mottled, tan patches
  float s = uScale, a = fbm(d * 2.2 * s, 7, 300u), b = fbm(d * 4.0 * s + 7.0, 6, 310u), m = fbm(d * 9.0 * s + 2.0, 5, 315u);
  vec3 col = mix(uC[0], uC[1], smoothstep(-0.25, 0.25, a + 0.25 * m));
  col = mix(col, uC[2], smoothstep(0.05, 0.4, b) * 0.75);
  col = mix(col, uC[3], smoothstep(0.2, 0.5, fbm(d * 3.0 * s + 3.0, 6, 320u) + 0.2 * m) * 0.85);
  return vec4(col * (0.88 + 0.24 * (fbm(d * 18.0, 4, 330u) * 0.5 + 0.5)), 0.0);
}
float heightAt(vec3 d) {
  if (uKind == 1) return solidH(d);
  if (uKind == 2) { float land = fbm(d * 1.4 * uScale, 8, 200u) + uP[0].x; return max(land, 0.0) * 0.6 * step(0.5, uP[0].y); }
  if (uKind == 3) return fbm(d * 1.5 * uScale, 7, 300u) * 0.15;
  return 0.0;
}
void main() {
  vec3 d = sph(vUv);
  if (uMode == 0) {
    vec4 c = uKind == 0 ? vec4(giant(d), 0.0) : uKind == 1 ? solid(d) : uKind == 2 ? ocean(d) : ammonia(d);
    gl_FragColor = vec4(pow(max(c.rgb, 0.0), vec3(1.0 / 2.2)), c.a);         // stored as sRGB-like 8 bit
  } else {                                                                     // object-space normal from the height field
    vec3 t1 = normalize(abs(d.y) < 0.99 ? cross(d, vec3(0.0, 1.0, 0.0)) : cross(d, vec3(1.0, 0.0, 0.0))), t2 = cross(d, t1);
    float h0 = heightAt(d), e = uEps;
    float hx = heightAt(normalize(d + t1 * e)), hy = heightAt(normalize(d + t2 * e));
    vec3 n = normalize(d - uP[3].x * ((hx - h0) / e * t1 + (hy - h0) / e * t2));
    float glow = uP[3].y * smoothstep(0.55, 0.9, ridged(d * 6.0 * uScale + 2.0, 5, 400u)) * smoothstep(0.004, -0.004, h0);
    gl_FragColor = vec4(n * 0.5 + 0.5, clamp(glow, 0.0, 1.0));               // a = glowing lava
  }
}`;
const BAKE = { mat: null, scene: null, cam: null, queue: [], live: new Set() };
function bakeInit() {
  if (BAKE.mat) return;
  BAKE.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); BAKE.scene = new THREE.Scene();
  BAKE.mat = new THREE.ShaderMaterial({
    uniforms: { uKind: { value: 0 }, uMode: { value: 0 }, uSeed: { value: new THREE.Vector2() }, uEps: { value: 0.002 }, uScale: { value: 1 },
      uC: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) }, uP: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) },
      uRung: { value: Array.from({ length: 7 }, () => new THREE.Vector3()) } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: BAKE_GLSL, depthTest: false, depthWrite: false,
  });
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), BAKE.mat); q.frustumCulled = false; BAKE.scene.add(q);
  warm("bake", BAKE.scene, BAKE.cam);                                  // v0.9: compiled in the background before the first surface
}
// what a body looks like: kind, colours and parameters for the bake shader
function surfaceRecipe(b) {
  const st = b.subType || "", h = bodyHash(b), r = i => ((Math.imul(h ^ (i * 0x9e3779b9), 2654435761) >>> 0) % 10007) / 10007;
  const T = b.surfaceTemperature || 0, Rkm = b.radius || 1000, comp = b.solidComposition || {}, ice = comp.Ice || 0, metal = comp.Metal || 0;
  const volc = b.volcanismType || "", C = [], P = Array.from({ length: 6 }, () => [0, 0, 0, 0]);
  const scale = Math.max(1, Math.min(5, Math.pow(Rkm / 500, 0.45)));
  const L = c => srgb2lin(c), mixc = (a, c, t) => a.map((v, i) => v + (c[i] - v) * t);
  if (isGiant(b)) {
    const g = giantLook(b), rung = g ? g.cols.map(L) : Array(7).fill(L((PAL.find(([re]) => re.test(st)) || [0, [[200, 180, 150]]])[1][0]));
    P[0] = [0.8 + r(1) * 0.8, 0.6 + r(2) * 0.9, 22 + r(3) * 20, g && g.cls === 10 ? 0.6 : 0]; P[1] = [3 + Math.floor(r(4) * 7), 0, 0, 0];
    if (g && g.band.every(x => x === g.band[0])) P[0][1] *= 0.8;          // one band only: a calmer planet
    return { kind: 0, rung, P, C: Array(8).fill([0, 0, 0]), scale: 1, normal: false, ls: 0 };
  }
  if (/Earth-like|Water world/i.test(st)) {
    const elw = /Earth-like/i.test(st), cold = Math.max(0, Math.min(1, (273 - T) / 45));
    const iceLat = elw ? 1.0 - 0.25 * cold - 0.05 : 1.1 - (0.35 + 0.65 * r(5)) * cold * 1.1;   // ice cover: colder → more, seeded
    C.push(L([10, 30, 66]), L([24, 66, 104]), L([58, 86, 44]), L([150, 128, 92]), L([110, 100, 92]), L([226, 232, 238]));
    P[0] = [elw ? -0.05 - r(6) * 0.08 : -1, elw ? 1 : 0, 0, 0]; P[1] = [Math.max(0.3, iceLat), (elw ? 0.47 : 0.56) + r(7) * 0.1, 0, 0];
    P[3] = [elw ? 0.03 : 0, 0, 0, 0];
    return { kind: 2, C, P, scale: 1, normal: elw, ls: 0.1 };
  }
  if (/Ammonia world/i.test(st)) {
    C.push(L([96, 80, 70]), L([124, 118, 120]), L([128, 96, 118]), L([180, 152, 108]));       // seen: brown, grey, mauve mottled with tan patches
    P[3] = [0.05, 0, 0, 0];
    return { kind: 3, C, P, scale: 1, normal: true, ls: 0.15 };
  }
  // solid bodies
  const icy = /Icy/i.test(st), rice = /Rocky ice/i.test(st), hmc = /High metal/i.test(st), mr = /Metal rich/i.test(st);
  let craterF = 0, lo, hi, patch = [0, 0, 0], crack = [0, 0, 0], fresh, cap = [235, 238, 242], craterD = 1, mount = 0.5, maria = 0.6, cracks = 0, patchAmt = 0, rays = 0;
  if (icy) {
    // Most icy bodies are white (19 of 22 at home). Which ones are red or dark is not in the data (refuted: temperature,
    // ruthenium, volcanism, atmosphere), so every icy body is white unless its colour was checked in the game (VERIFIED).
    lo = [214, 208, 202]; hi = [238, 234, 228];
    if (ice < 75) { lo = mixc(lo, [176, 170, 166], 0.35); hi = mixc(hi, [206, 202, 198], 0.3); }   // ~69% ice + 10% metal: greyer
    patch = [196, 190, 184]; patchAmt = r(12) < 0.3 ? 0.35 : 0;
    crack = [176, 168, 160]; cracks = 0.08 + r(15) * 0.15;
    fresh = [250, 250, 250]; craterD = 0.35; mount = 0.15; maria = 0.25; rays = r(16) < 0.25 ? 0.08 : 0; craterF = 1.6;
  } else if (rice) {
    lo = [120, 126, 138]; hi = [190, 198, 210]; fresh = [230, 236, 242]; crack = [90, 96, 108]; cracks = 0.3; craterD = 0.6; maria = 0.8;
  } else if (mr) {
    lo = [70, 68, 66]; hi = [120, 116, 110]; fresh = [170, 166, 160]; craterD = 1; mount = 0.8;
  } else if (hmc) {
    const v = r(20); [lo, hi] = v < 0.5 ? [[86, 80, 82], [150, 130, 100]] : [[96, 82, 70], [138, 118, 96]];
    if (hasAtm(b)) { lo = [150, 104, 64]; hi = [196, 148, 96]; patch = [86, 92, 108]; patchAmt = 0.6; }   // seen: ochre with blue-grey regions (UF-M c8-5 5)
    fresh = [190, 176, 150]; if (!hasAtm(b)) { patch = [120, 70, 50]; patchAmt = r(21) < 0.3 ? 0.4 : 0; }
  } else {                                                                     // rocky: grey to beige, brown and red-brown
    const looks = [[[104, 102, 100], [168, 164, 158]], [[150, 136, 118], [196, 182, 160]], [[110, 82, 66], [150, 112, 88]], [[96, 80, 68], [140, 120, 100]]];
    [lo, hi] = looks[Math.floor(r(22) * looks.length)]; fresh = [210, 206, 200]; rays = r(23) < 0.25 ? 0.07 : 0;
  }
  if (metal > 25 && !mr) { lo = mixc(lo, [80, 76, 72], 0.25); hi = mixc(hi, [120, 114, 108], 0.2); }
  const ver = verifiedLook(b);                                                // colour checked in the game: use it
  if (ver) { lo = ver[0]; hi = ver[1]; patchAmt = Math.min(patchAmt, 0.2); if (icy) patch = mixc(lo, [250, 250, 250], 0.5); }
  const capLat = (icy || T > 240) ? 2 : r(24) < 0.4 ? 0.82 + r(25) * 0.12 : 2;     // white polar caps on some cold rocky bodies
  const lava = /magma|lava/i.test(volc) && T > 500 ? Math.min(1, (T - 500) / 500) : 0;   // glowing only when hot
  C.push(L(lo), L(hi), L(patch), L(crack), L(fresh), L(cap));
  P[0] = [maria, mount, craterD * (hasAtm(b) && (b.surfacePressure || 0) > 0.1 ? 0.4 : 1), 0];
  P[1] = [cracks, patchAmt, capLat, capLat < 1.5 ? 1 : 0];
  P[2] = [craterF, 0, icy ? 0.18 : 0.4, rays];
  P[3] = [icy ? 0.8 : 1.0, lava, 0, 0];
  return { kind: 1, C, P, scale, normal: true, lava, ls: icy ? 0.3 : rice ? 0.4 : 0.6 };
}
function bakeRes(px) { const want = Math.pow(2, Math.ceil(Math.log2(Math.max(64, px * 2.2)))); return Math.min(QUALITY.tex, want); }
// queue a bake; it runs over several frames in strips and swaps in when complete
// v0.71: the texture library. On Low no surface is generated on the visitor's graphics card: each body gets a ready
// picture made once by GRAVITAS's own surface generator (src/assets/tex, ~190 KB in all, loaded only when needed).
// Patterns are shared by type, the colour is the body's own. Medium and up still generate every surface from its seed
const LIB_N = { gg: 2, icy: 2, rock: 2, hmc: 2, rice: 1, elw: 1, ww: 1, amm: 1 }, LIB_TEX = new Map();
function libKey(b) {
  const st = b.subType || "";
  if (isGiant(b)) return "gg"; if (/Earth-like/i.test(st)) return "elw"; if (/Water world/i.test(st)) return "ww";
  if (/Ammonia world/i.test(st)) return "amm"; if (/Rocky ice/i.test(st)) return "rice"; if (/Icy/i.test(st)) return "icy";
  if (/High metal|Metal rich/i.test(st)) return "hmc"; return "rock";
}
function libTex(name) {
  let t = LIB_TEX.get(name);
  if (!t) { t = new THREE.TextureLoader().load(`assets/tex/${name}.webp`); t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4; LIB_TEX.set(name, t); }
  return t;
}
function libApply(b) {
  if (!b._mesh || b.type === "Star" || b._lib) return;
  const k = libKey(b), name = `${k}-${bodyHash(b) % LIB_N[k]}`, u = b._mesh.material.uniforms, own = k === "elw" || k === "ww" || k === "amm";
  b._lib = name; u.map.value = libTex(name); u.nmap.value = flatTex; u.uHasN.value = 0;
  if (own) u.uTint.value.setRGB(1, 1, 1);                               // ocean and ammonia worlds keep the picture's own colours
  else { const p0 = palette(b)[0]; u.uTint.value.setRGB(2 * p0[0] / 255, 2 * p0[1] / 255, 2 * p0[2] / 255); }   // grey pattern, average 0.5: ×2 keeps the body's colour
  u.uDry.value = k === "elw" || k === "ww" ? 0 : 1; u.uKind.value = k === "gg" ? 0 : k === "amm" ? 3 : own ? 2 : 1;
}
function bakeRequest(b, res) {
  if (QUALITY === PRESETS.low) { libApply(b); return; }
  if (b._bakeRes >= res || (b._bakeJob && b._bakeJob.res >= res)) return;
  bakeInit();
  if (b._bakeJob) bakeCancel(b._bakeJob);
  const rec = surfaceRecipe(b), H = res / 2, mk = () => {
    // v0.75.7: no mipmaps while the strips are drawn (three.js would rebuild them for the whole texture after every strip,
    // dozens of times per bake); they are made once, when the bake is complete (bakeApply)
    const rt = new THREE.WebGLRenderTarget(res, H, { depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
    rt.texture.wrapS = THREE.RepeatWrapping; rt.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return rt;
  };
  const job = { b, res, rec, albedo: mk(), normal: rec.normal ? mk() : null, y: 0, pass: 0 };
  if (res >= 1024) WORK.scale = Math.min(WORK.scale, 0.25);          // v0.72.1: a big job starts with small slices and grows only if frames stay fast
  b._bakeJob = job; BAKE.queue.push(job);
}
function bakeCancel(job) { job.albedo.dispose(); job.normal && job.normal.dispose(); const i = BAKE.queue.indexOf(job); if (i >= 0) BAKE.queue.splice(i, 1); if (job.b._bakeJob === job) job.b._bakeJob = null; }
function bakeUniforms(b, rec, res, pass) {
  const u = BAKE.mat.uniforms;
  u.uKind.value = rec.kind; u.uMode.value = pass; const h = bodyHash(b); u.uSeed.value.set(h & 0xffff, h >>> 16);
  u.uEps.value = 2 * Math.PI / res; u.uScale.value = rec.scale;
  for (let i = 0; i < 8; i++) { const c = (rec.C || [])[i] || [0, 0, 0]; u.uC.value[i].set(c[0], c[1], c[2]); }
  for (let i = 0; i < 6; i++) { const p = rec.P[i]; u.uP.value[i].set(p[0], p[1], p[2], p[3]); }
  for (let i = 0; i < 7; i++) { const c = (rec.rung || [])[i] || [0, 0, 0]; u.uRung.value[i].set(c[0], c[1], c[2]); }
}
// ---- v0.61 thumbnails for the system map: the same surface, baked small, drawn as a lit sphere and read back as an image
const THUMB = { rt: null, out: null, scene: null, cam: null, mat: null, queue: [], busy: false, urls: [], enc: 0 };
function thumbForget() { for (const u of THUMB.urls) URL.revokeObjectURL(u); THUMB.urls = []; THUMB.queue = []; }   // a new system: free the old pictures
function thumbInit() {
  if (THUMB.mat) return;
  bakeInit();
  THUMB.rt = new THREE.WebGLRenderTarget(256, 128, { depthBuffer: false });
  THUMB.sheet = new THREE.WebGLRenderTarget(512, 512, { depthBuffer: false });
  THUMB.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); THUMB.scene = new THREE.Scene();
  THUMB.mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: THUMB.rt.texture }, uGiant: { value: 0 }, uVeil: { value: new THREE.Vector4() }, uTint: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform float uGiant; uniform vec4 uVeil; uniform vec3 uTint; varying vec2 vUv;
      void main() {
        vec2 q = vUv * 2.0 - 1.0; float rr = dot(q, q); if (rr > 1.0) { gl_FragColor = vec4(0.0); return; }
        vec3 n = vec3(q.x, q.y, sqrt(1.0 - rr));
        vec3 d = vec3(n.x * 0.94 + n.z * 0.34, n.y, -n.x * 0.34 + n.z * 0.94);            // turned a little, as the game's map shows them
        vec2 uv = vec2(atan(d.z, -d.x) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.1415927 + 0.5);
        vec3 alb = pow(texture2D(map, uv).rgb, vec3(2.2)) * uTint;
        float l = max(dot(n, normalize(vec3(-0.45, 0.35, 0.82))), 0.0), lit = mix(l, l * (0.72 + 0.28 * n.z), uGiant);
        vec3 c = mix(alb, uVeil.rgb, uVeil.a) * (0.06 + 1.05 * lit);                         // thick air veils the surface
        float edge = smoothstep(1.0, 0.97, sqrt(rr));
        gl_FragColor = vec4(pow(c, vec3(1.0 / 2.2)), edge);
      }`, depthTest: false, depthWrite: false, transparent: true,
  });
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), THUMB.mat); q.frustumCulled = false; THUMB.scene.add(q);
}
// v0.72: planet pictures are drawn into one 4×4 sheet and read back in one go: one wait for the graphics card per
// sixteen pictures instead of one per picture (each read-back makes the page wait until the card is done)
function thumbMake(b, cell) {                     // draws into the sheet: true, undefined (picture not loaded yet) or null
  try {
    thumbInit();
    { const lo = QUALITY === PRESETS.low, t = warm("thumb", THUMB.scene, THUMB.cam), k = lo || warm("bake", BAKE.scene, BAKE.cam); if (!t || !k) return undefined; }   // v0.9: shaders ready first
    const rec = surfaceRecipe(b), prev = renderer.getRenderTarget(), auto = renderer.autoClear;
    renderer.autoClear = true;
    if (QUALITY === PRESETS.low) {                       // v0.72: Low takes the ready picture, nothing is generated
      const k = libKey(b), t = libTex(`${k}-${bodyHash(b) % LIB_N[k]}`);
      if (!t.image || !t.image.complete) { renderer.autoClear = auto; return undefined; }   // not downloaded yet: try again shortly
      THUMB.mat.uniforms.map.value = t;
      if (k === "elw" || k === "ww" || k === "amm") THUMB.mat.uniforms.uTint.value.setRGB(1, 1, 1);
      else { const p0 = palette(b)[0]; THUMB.mat.uniforms.uTint.value.setRGB(2 * p0[0] / 255, 2 * p0[1] / 255, 2 * p0[2] / 255); }
    } else {
      bakeUniforms(b, rec, 256, 0); renderer.setRenderTarget(THUMB.rt); renderer.render(BAKE.scene, BAKE.cam);
      THUMB.mat.uniforms.map.value = THUMB.rt.texture; THUMB.mat.uniforms.uTint.value.setRGB(1, 1, 1);
    }
    THUMB.mat.uniforms.uGiant.value = rec.kind === 0 ? 1 : 0;
    const ar = typeof atmRecipe === "function" ? atmRecipe(b) : null;
    THUMB.mat.uniforms.uVeil.value.set(...(ar ? ar.alb : [0, 0, 0]), ar ? Math.min(0.6, ar.cap * Math.min(1, ar.ms * 2.5)) : 0);
    const A = THUMB.sheet, x = (cell % 4) * 128, y = Math.floor(cell / 4) * 128;
    A.viewport.set(x, y, 128, 128); A.scissor.set(x, y, 128, 128); A.scissorTest = true;
    renderer.setRenderTarget(A); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(THUMB.scene, THUMB.cam);
    A.scissorTest = false; A.viewport.set(0, 0, 512, 512);
    renderer.setRenderTarget(prev); renderer.autoClear = auto; renderer.setClearColor(0x000000, 1);
    return true;
  } catch (e) { return null; }
}
function thumbRead(done) {                        // [[body, cell], ...] -> a canvas per body
  const px = new Uint8Array(512 * 512 * 4); renderer.readRenderTargetPixels(THUMB.sheet, 0, 0, 512, 512, px);
  return done.map(([o, cell]) => {
    const cx = (cell % 4) * 128, cy = Math.floor(cell / 4) * 128;
    const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"), im = g.createImageData(128, 128);
    for (let r = 0; r < 128; r++) { const o0 = ((cy + 127 - r) * 512 + cx) * 4; im.data.set(px.subarray(o0, o0 + 512), r * 512); }
    g.putImageData(im, 0, 0); return [o, c];
  });
}
// stars: the same shader as in 3D, drawn on a sphere, then the same tone curve as the 3D view
const STHUMB = { rt: null, out: null, scene: null, cam: null, tone: null };
function thumbStar(b) {
  try {
    if (!STHUMB.rt) {
      STHUMB.rt = new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType, depthBuffer: true });
      STHUMB.out = new THREE.WebGLRenderTarget(256, 256, { depthBuffer: false });
      STHUMB.cam = new THREE.OrthographicCamera(-1.12, 1.12, 1.12, -1.12, 0.1, 10); STHUMB.cam.position.set(0, 0, 5);
      STHUMB.tone = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: { t: { value: STHUMB.rt.texture } }, depthTest: false, transparent: true,
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: `uniform sampler2D t; varying vec2 vUv; ${OUT_GLSL}
          void main() { vec4 c = texture2D(t, vUv); gl_FragColor = vec4(toSRGB(shoulder(c.rgb * ${0.8.toFixed(2)})), c.a); }` }));
      STHUMB.tone.frustumCulled = false; STHUMB.tscene = new THREE.Scene(); STHUMB.tscene.add(STHUMB.tone);
    }
    const K = starKind(b), color = b._color || new THREE.Color(starColor(b));
    if (K.kind === 3) return null;                                     // black holes keep their map symbol
    let sc = b._sthSc; if (!sc) { sc = b._sthSc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), starMaterial(b, color, K))); }
    const mesh = sc.children[0];
    { const a1 = warm("sth:" + mesh.material.uuid, sc, STHUMB.cam), a2 = warm("sthtone", STHUMB.tscene, STHUMB.cam); if (!a1 || !a2) return undefined; }   // v0.9: shaders ready first
    b._sthSc = null;
    const prev = renderer.getRenderTarget(), auto = renderer.autoClear; renderer.autoClear = true; renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(STHUMB.rt); renderer.render(sc, STHUMB.cam);
    renderer.setRenderTarget(STHUMB.out); renderer.render(STHUMB.tscene, THUMB.cam || STHUMB.cam);
    const px = new Uint8Array(256 * 256 * 4); renderer.readRenderTargetPixels(STHUMB.out, 0, 0, 256, 256, px);
    renderer.setRenderTarget(prev); renderer.autoClear = auto; renderer.setClearColor(0x000000, 1);
    mesh.geometry.dispose(); mesh.material.dispose();
    const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d"), im = g.createImageData(256, 256);
    for (let y = 0; y < 256; y++) im.data.set(px.subarray((255 - y) * 1024, (256 - y) * 1024), y * 1024);
    g.putImageData(im, 0, 0); return c;
  } catch (e) { return null; }
}
// v0.75: a hidden tab gets no animation frames,
// so the pictures are then made on a timer instead
function thumbNext(f) { if (!document.hidden) return requestAnimationFrame(f); setTimeout(f, 30); }
function thumbRequest(b, done) {                  // a few per frame, so the page never stalls
  if (b._thumb !== undefined) return;
  b._thumb = null; THUMB.queue.push(b);
  if (THUMB.busy) return; THUMB.busy = true;
  // v0.72: the picture is encoded by the browser in the background (toBlob) and kept as a short blob: link,
  // instead of a long PNG text written into the map: no encoding on the main thread, and a much lighter map to rebuild
  const show = () => { if (done && (!THUMB.queue.length && !THUMB.enc || performance.now() - (THUMB.shown || 0) > 700)) { THUMB.shown = performance.now(); done(); } };
  const step = () => {
    const t0 = performance.now(), wait = [], sheet = [], out = [];
    while (THUMB.queue.length && sheet.length < 16 && performance.now() - t0 < 12) {
      const o = THUMB.queue.shift();
      if (o.type === "Star") { const c = thumbStar(o); if (c === undefined) wait.push(o); else if (c) out.push([o, c]); else o._thumb = ""; continue; }
      const ok = thumbMake(o, sheet.length);
      if (ok === undefined) wait.push(o); else if (ok) sheet.push([o, sheet.length]); else o._thumb = "";
    }
    if (sheet.length) try { out.push(...thumbRead(sheet)); } catch (e) { for (const [o] of sheet) o._thumb = ""; }
    for (const [o, c] of out) {
      THUMB.enc++;
      c.toBlob(bl => { THUMB.enc--; o._thumb = bl ? URL.createObjectURL(bl) : ""; if (o._thumb) THUMB.urls.push(o._thumb); show();
      }, "image/png");
    }
    THUMB.queue.push(...wait);
    show();
    if (THUMB.queue.length) { if (wait.length === THUMB.queue.length) setTimeout(() => thumbNext(step), 150); else thumbNext(step); }
    else THUMB.busy = false;
  };
  thumbNext(step);
}
// v0.9: once the surface shader is compiled, one tiny trial draw (2×4 pixels): the driver's own first-draw work then
// happens right after the page opens, not when the visitor zooms in. Started a moment after a system is shown
function bakePrime() {
  if (BAKE.primed || !BAKE.mat || !warmed("bake")) return; BAKE.primed = true;
  try { const rt = new THREE.WebGLRenderTarget(4, 2, { depthBuffer: false, generateMipmaps: false }), prev = renderer.getRenderTarget(), auto = renderer.autoClear;
    renderer.autoClear = false; renderer.setRenderTarget(rt); renderer.render(BAKE.scene, BAKE.cam); renderer.setRenderTarget(prev); renderer.autoClear = auto; rt.dispose(); } catch (e) {}
}
setTimeout(() => TICK.add(() => { if (S && QUALITY !== PRESETS.low && performance.now() > 4000) { bakeInit(); bakePrime(); } }), 0);   // (TICK is made in a later part)
function bakeTick() {                             // called once per frame: a budget of pixels, then hand back to the frame
  if (!BAKE.queue.length) return;
  if (!warm("bake", BAKE.scene, BAKE.cam)) return;                    // v0.9: not before its shader is ready
  if (WORK.hold > performance.now()) return;                         // v0.70: let the first frames show before any heavy work
  const budget = Math.min(QUALITY.bakeBudget || 1e6, 0.5e6) * WORK.scale * GT.k /* v0.72.2: never more than 0.5 M pixels a frame, whatever the quality */, u = BAKE.mat.uniforms, prevRT = renderer.getRenderTarget(), auto = renderer.autoClear;
  let done = 0; renderer.autoClear = false;
  while (BAKE.queue.length && done < budget) {
    const job = BAKE.queue[0], { rec, res } = job, H = res / 2, rt = job.pass === 0 ? job.albedo : job.normal;
    bakeUniforms(job.b, rec, res, job.pass);
    const rows = Math.max(2, Math.min(H - job.y, Math.floor((budget - done) / res), Math.floor(131072 / res)));   // and at most 0.13 M pixels in one draw (v0.78.1: was 0.26 M; a slow card finishes each piece quickly)
    rt.scissorTest = true; rt.scissor.set(0, job.y, res, rows); rt.viewport.set(0, 0, res, H);
    renderer.setRenderTarget(rt); renderer.render(BAKE.scene, BAKE.cam);
    job.y += rows; done += rows * res;
    if (job.y >= H) {
      rt.scissorTest = false; job.y = 0;
      if (job.pass === 0 && job.normal) { job.pass = 1; continue; }
      BAKE.queue.shift(); bakeApply(job);
    }
  }
  renderer.setRenderTarget(prevRT); renderer.autoClear = auto;
}
const _mipScene = new THREE.Scene(), _mipCam = new THREE.Camera();
function bakeMips(rt) {                            // one mipmap build for a finished texture (an empty draw makes three.js do it)
  rt.texture.generateMipmaps = true;
  const prev = renderer.getRenderTarget(), auto = renderer.autoClear; renderer.autoClear = false;
  renderer.setRenderTarget(rt); renderer.render(_mipScene, _mipCam); renderer.setRenderTarget(prev); renderer.autoClear = auto;
  rt.texture.generateMipmaps = false;
}
function bakeApply(job) {
  const b = job.b; if (b._bakeJob !== job) return;
  if (b._bake) { b._bake.albedo.dispose(); b._bake.normal && b._bake.normal.dispose(); BAKE.live.delete(b); }
  bakeMips(job.albedo); if (job.normal) bakeMips(job.normal);
  b._bake = job; b._bakeJob = null; b._bakeRes = job.res; BAKE.live.add(b);
  const u = b._mesh.material.uniforms;
  u.map.value = job.albedo.texture; u.uTint.value.setRGB(1, 1, 1);
  u.nmap.value = job.normal ? job.normal.texture : flatTex; u.uHasN.value = job.normal ? 1 : 0;
  u.uGlow.value = job.rec.lava ? 1 : 0; u.uKind.value = job.rec.kind; u.uLS.value = job.rec.ls ?? 0.5; u.uDry.value = 0; b._lib = null;
  // keep video memory in check: only a few bodies may hold large textures; the rest drop back to a small one
  const big = [...BAKE.live].filter(o => o._bakeRes >= 2048 && o !== b && performance.now() - (o._bakeSeen || 0) > 3000).sort((x, y) => (x._bakeT || 0) - (y._bakeT || 0));
  b._bakeT = performance.now();
  while (big.length > (QUALITY.tex >= 4096 ? 1 : 3)) { const o = big.shift(); o._bakeRes = 0; bakeRequest(o, 512); }
}
function bakeDisposeAll() {
  for (const j of [...BAKE.queue]) bakeCancel(j);
  for (const b of BAKE.live) { if (b._bake) { b._bake.albedo.dispose(); b._bake.normal && b._bake.normal.dispose(); } b._bake = null; b._bakeRes = 0; }
  BAKE.live.clear();
}
// atmosphere tint by dominant gas, strength by thickness
function atmColor(b) {
  const a = (b.atmosphereType || "") + " " + Object.keys(b.atmosphereComposition || {}).sort((x, y) => b.atmosphereComposition[y] - b.atmosphereComposition[x])[0];
  const c = /Sulphur/i.test(a) ? 0xffe36a : /Carbon dioxide/i.test(a) ? 0xffc38a : /Argon/i.test(a) ? 0xb9a2ff : /Nitrogen/i.test(a) ? 0x7fb2ff
    : /Methane/i.test(a) ? 0x7fe8ff : /Ammonia/i.test(a) ? 0xe8d27a : /Water/i.test(a) ? 0xcfe8ff : /Neon/i.test(a) ? 0xff8a9a
    : /Helium/i.test(a) ? 0xf0e8ff : /Oxygen/i.test(a) ? 0xa8d0ff : /Silicate/i.test(a) ? 0xffa060 : /Metallic/i.test(a) ? 0xb0c8d0 : 0x8fc8ff;
  const strength = /Thick|Hot thick/i.test(a) ? 1.0 : /Thin/i.test(a) ? 0.6 : 0.8;
  return [new THREE.Color(c), strength];
}
const landTex = (() => {               // map pin with a boot print: "you can land here"
  const c = document.createElement("canvas"); c.width = 128; c.height = 176; const g = c.getContext("2d");
  g.beginPath(); g.moveTo(64, 172); g.bezierCurveTo(40, 130, 8, 100, 8, 62); g.arc(64, 62, 56, Math.PI, 0); g.bezierCurveTo(120, 100, 88, 130, 64, 172); g.closePath();
  g.fillStyle = "#3ddc7a"; g.fill(); g.lineWidth = 6; g.strokeStyle = "#0b2a16"; g.stroke();
  g.fillStyle = "#0b2a16";
  g.beginPath(); g.ellipse(64, 76, 15, 24, 0, 0, Math.PI * 2); g.fill();                     // sole
  [[44, 44, 7], [55, 34, 6], [66, 31, 5.5], [76, 34, 5], [84, 41, 4.5]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x + 1, y + 4, r, 0, Math.PI * 2); g.fill(); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
