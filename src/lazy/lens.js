// ------------------------------------------------------------ v0.97 GRAVITAS Lenses (loaded only when the Lenses window opens)
// Rhythm: the patterns two orbits draw, and the melody of the system (a tour, family by family).
// Landscape: where each body's gravity rules (the two-body landscape, Lagrange points, Hill sphere).
// Time: years of motion in one picture, and moons drawn through space.
// Everything comes from the Spansh orbit data of the system on the screen. Drawn flat (the orbit planes are laid on
// one plane), drawn once (nothing is redrawn while nothing moves), and the sound is made here, in the browser:
// no sound files, nothing sent anywhere.
let G = null;
export function init(g) { G = g; }

const DEG = Math.PI / 180, TAU = 2 * Math.PI, DAY = 864e5, MSUN_EARTH = 3.003e-6, AU_LS = 499.005;
const NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const COL = ["#ff6ad5", "#6ae8ff", "#ffd27a", "#7ee2a8", "#a78bfa", "#ff8fb0", "#ffb84d", "#5aa9ff", "#c9b8ff", "#e8c36a"];
const BG = "#0b0716";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
const noteName = f => { const m = Math.round(69 + 12 * Math.log2(f / 440)); return NOTE[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); };

// ------------------------------------------------------------ the system, as the lenses see it
let M = null;
function model() {
  const S = G.S; if (!S) return null;
  if (M && M.S === S) return M;
  const byId = S.byId, par = S.parentOf, kids = S.children, sys = S.sys.name;
  const orbits = b => b && b.orbitalPeriod > 0 && b.semiMajorAxis > 0;
  const nm = b => b.type === "Barycentre" ? baryName(b.bodyId) : G.shortName(b, sys);
  const cName = id => { const b = byId.get(id); return b && b.type !== "Barycentre" ? nm(b) : `the centre of ${baryName(id)}`; };
  // the two (or more) bodies a barycentre is made of: its children that share one period
  function members(id) {
    const c = (kids.get(id) || []).map(i => byId.get(i)).filter(orbits);
    if (c.length < 2) return c;
    let best = [];
    for (const a of c) { const g = c.filter(o => Math.abs(o.orbitalPeriod / a.orbitalPeriod - 1) < 2e-3); if (g.length > best.length) best = g; }
    return best.length >= 2 ? best : c.slice(0, 2);
  }
  function baryName(id) { const m = members(id); return m.length ? m.map(b => b.type === "Barycentre" ? baryName(b.bodyId) : G.shortName(b, sys)).join(" + ") : "barycentre"; }
  const massMemo = new Map();
  function mass(id) {                                               // in suns; a barycentre weighs what its members weigh
    if (massMemo.has(id)) return massMemo.get(id);
    const b = byId.get(id); let m = null;
    if (b && b.type === "Barycentre") { const ms = members(id).map(x => mass(x.bodyId)); m = ms.length && ms.every(x => x > 0) ? ms.reduce((a, x) => a + x, 0) : null; }
    else if (b) m = b.solarMasses > 0 ? b.solarMasses : b.earthMasses > 0 ? b.earthMasses * MSUN_EARTH : null;
    massMemo.set(id, m); return m;
  }
  const root = [...byId.keys()].find(id => !par.has(id) && id === 0) ?? [...byId.keys()].find(id => !par.has(id));
  // families: the bodies around one centre
  const fams = [];
  for (const [p, list] of kids) {
    const pb = byId.get(p) || { bodyId: p, type: "Barycentre", name: "" };
    const v = list.map(i => byId.get(i)).filter(orbits); if (!v.length) continue;
    v.sort((a, b) => a.orbitalPeriod - b.orbitalPeriod);
    const top = !par.has(p), pn = nm(pb);
    const stars = v.some(b => b.type === "Star");
    const label = pb.type === "Barycentre" ? `Around ${pn}` : top ? (stars ? "The stars and planets" : "The planets") : pb.type === "Star" ? `${pn}'s planets` : `${pn}'s moons`;
    fams.push({ p, pb, top, label, v, depth: depthOf(p) });
  }
  function depthOf(id) { let d = 0; for (let n = id; par.has(n) && d < 20; n = par.get(n)) d++; return d; }
  fams.sort((a, b) => a.depth - b.depth || b.v.length - a.v.length);
  M = { S, byId, par, kids, sys, orbits, nm, cName, mass, members, fams, root, star: starOf };
  function starOf(id) { for (let n = par.get(id), d = 0; n !== undefined && d < 20; n = par.get(n), d++) { const b = byId.get(n); if (b && b.type === "Star") return n; } return null; }
  return M;
}
// flat Kepler: where a body is around its centre (AU), at a time (ms)
function rel(b, t) {
  const a = b.semiMajorAxis, e = Math.min(b.orbitalEccentricity || 0, 0.99), P = b.orbitalPeriod * DAY;
  const Mn = (b.meanAnomaly || 0) * DEG + TAU * (t - (b._t0 || 0)) / P;
  let E = e < 0.8 ? Mn : Math.PI; for (let k = 0; k < 20; k++) { const d = (E - e * Math.sin(E) - Mn) / (1 - e * Math.cos(E)); E -= d; if (Math.abs(d) < 1e-12) break; }
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2)), r = a * (1 - e * Math.cos(E));
  const w = ((b.argOfPeriapsis || 0) + (b.ascendingNode || 0)) * DEG;
  return [r * Math.cos(nu + w), r * Math.sin(nu + w)];
}
function abs(id, t) {
  let x = 0, y = 0;
  for (let n = id, d = 0; n !== undefined && d < 20; n = M.par.get(n), d++) { const b = M.byId.get(n); if (!b || !M.orbits(b)) break; const p = rel(b, t); x += p[0]; y += p[1]; }
  return [x, y];
}
// the simplest fraction near a ratio: p : q with q up to 13 (p turns of the faster while the slower makes q)
function frac(r) {
  let best = null;
  for (let q = 1; q <= 13; q++) { const p = Math.round(r * q); if (p < 1 || p + q > 21 || gcd(p, q) !== 1) continue;
    const err = Math.abs(r - p / q) / r, sc = err * Math.pow(p + q, 1.5);
    if (!best || sc < best.sc) best = { p, q, err, sc }; }
  return best;
}
// ------------------------------------------------------------ Rhythm: the best pairs and the resonances
function pairs() {
  if (M.pairs) return M.pairs;
  const out = [];
  for (const f of M.fams) for (let i = 0; i < f.v.length; i++) for (let j = i + 1; j < f.v.length; j++) {
    const A = f.v[i], B = f.v[j], r = B.orbitalPeriod / A.orbitalPeriod;
    if (r < 1.002 || r > 15) continue;                                // one period (a binary): no pattern. Too far apart: a thick ring
    const fr = frac(r); if (!fr || fr.p <= fr.q) continue; const petals = fr.p - fr.q;
    const score = -Math.log10(Math.max(fr.err, 1e-6)) - 0.15 * (fr.p + fr.q) + (petals >= 3 ? 0.25 : petals === 1 ? -0.3 : 0) - (r > 6 ? 0.15 * (r - 6) : 0);
    out.push({ f, A, B, r, fr, petals, score });
  }
  out.sort((a, b) => b.score - a.score);
  return (M.pairs = out);
}
function resonances() {
  if (M.reso) return M.reso;
  const out = [];
  for (const p of pairs()) if (p.fr.err < 0.002 && p.fr.p + p.fr.q <= 13) out.push({ k: "pair", txt: `${M.nm(p.A)} & ${M.nm(p.B)}`, ratio: `${p.fr.p} : ${p.fr.q}`, err: p.fr.err });
  for (const f of M.fams) for (let i = 0; i + 2 < f.v.length; i++) {     // a chain like Io, Europa and Ganymede (4 : 2 : 1)
    const [a, b, c] = [f.v[i], f.v[i + 1], f.v[i + 2]], f1 = frac(b.orbitalPeriod / a.orbitalPeriod), f2 = frac(c.orbitalPeriod / b.orbitalPeriod);
    if (!f1 || !f2 || f1.err > 0.004 || f2.err > 0.004 || f1.p > 5 || f2.p > 5) continue;
    let x = f1.p * f2.p, y = f1.q * f2.p, z = f1.q * f2.q; const g = gcd(gcd(x, y), z); x /= g; y /= g; z /= g;
    if (x > 12) continue;
    out.push({ k: "chain", txt: `${M.nm(a)}, ${M.nm(b)} & ${M.nm(c)}`, ratio: `${x} : ${y} : ${z}`, err: Math.max(f1.err, f2.err) });
  }
  out.sort((a, b) => (a.k === "chain" ? -1 : 0) - (b.k === "chain" ? -1 : 0) || a.err - b.err);
  return (M.reso = out.slice(0, 6));
}
// the lines between two bodies, for as long as their pattern takes to close
function spiroData(p) {
  const P1 = p.A.orbitalPeriod, P2 = p.B.orbitalPeriod, T = clamp(p.fr.q * P2, P2 * 2, P2 * 40) * DAY;
  let n = 720; if (T / n > P1 * DAY / 10) n = Math.min(2400, Math.ceil(T / (P1 * DAY / 10)));
  const t0 = G.t, L = new Float64Array(n * 4);
  for (let i = 0; i < n; i++) { const t = t0 + T * i / n, a = rel(p.A, t), b = rel(p.B, t); L[i * 4] = a[0]; L[i * 4 + 1] = a[1]; L[i * 4 + 2] = b[0]; L[i * 4 + 3] = b[1]; }
  return { L, n, T, ext: Math.max(p.A.semiMajorAxis * (1 + (p.A.orbitalEccentricity || 0)), p.B.semiMajorAxis * (1 + (p.B.orbitalEccentricity || 0))) };
}
function seenData(p, fromA) {
  const O = fromA ? p.A : p.B, X = fromA ? p.B : p.A, syn = 1 / Math.abs(1 / p.A.orbitalPeriod - 1 / p.B.orbitalPeriod);
  const T = clamp(Math.max(syn * 7, p.fr.q * p.B.orbitalPeriod), p.B.orbitalPeriod * 2, p.B.orbitalPeriod * 30) * DAY, n = 4000, t0 = G.t, P = new Float64Array(n * 2); let ext = 0;
  for (let i = 0; i < n; i++) { const t = t0 + T * i / n, a = rel(O, t), b = rel(X, t); P[i * 2] = b[0] - a[0]; P[i * 2 + 1] = b[1] - a[1]; ext = Math.max(ext, Math.abs(P[i * 2]), Math.abs(P[i * 2 + 1])); }
  return { P, n, T, ext, O, X };
}
// ------------------------------------------------------------ Landscape: two bodies and their gravity
function landPairs() {
  if (M.land) return M.land;
  const out = [];
  for (const [p, list] of M.kids) {
    const pb = M.byId.get(p) || { bodyId: p, type: "Barycentre" };
    if (pb.type === "Barycentre") {                                   // a binary: the two members around their common centre
      const m = M.members(p); if (m.length !== 2) continue;
      const m1 = M.mass(m[0].bodyId), m2 = M.mass(m[1].bodyId); if (!(m1 > 0 && m2 > 0)) continue;
      const [big, small] = m1 >= m2 ? [m[0], m[1]] : [m[1], m[0]], mb = Math.max(m1, m2), ms = Math.min(m1, m2);
      out.push({ k: "binary", big, small, mb, ms, mu: ms / (mb + ms), a: m[0].semiMajorAxis + m[1].semiMajorAxis, P: m[0].orbitalPeriod, stars: big.type === "Star" && small.type === "Star" });
      continue;
    }
    const mp = M.mass(p); if (!(mp > 0)) continue;
    for (const c of list) { const cb = M.byId.get(c); if (!M.orbits(cb) || cb.type === "Barycentre") continue; const mc = M.mass(c); if (!(mc > 0) || mc >= mp) continue;
      out.push({ k: "orbit", big: pb, small: cb, mb: mp, ms: mc, mu: mc / (mp + mc), a: cb.semiMajorAxis, P: cb.orbitalPeriod }); }
  }
  // first: a pair of stars, then the heaviest bodies around the main star
  const main = M.root;
  out.sort((x, y) => (y.stars ? 1 : 0) - (x.stars ? 1 : 0) || (y.big.bodyId === main ? 1 : 0) - (x.big.bodyId === main ? 1 : 0) || y.ms - x.ms);
  return (M.land = out);
}
function lagrange(mu) {
  const dphi = x => x - (1 - mu) * (x + mu) / Math.abs(x + mu) ** 3 - mu * (x - 1 + mu) / Math.abs(x - 1 + mu) ** 3;
  const root = (lo, hi) => { for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (dphi(lo) * dphi(m) <= 0) hi = m; else lo = m; } return (lo + hi) / 2; };
  const h = Math.cbrt(mu / 3), e = 1e-9;
  return { L1: root(Math.max(-mu + 1e-6, 1 - mu - 3 * h), 1 - mu - e), L2: root(1 - mu + e, 1 - mu + 3 * h + 0.5), L3: root(-1.8, -mu - 1e-3), L45: [0.5 - mu, Math.sqrt(3) / 2] };
}
// ------------------------------------------------------------ Time: who to draw, and for how long
function timeSet() {
  if (M.time) return M.time;
  // the bodies around a centre: its children, and the members of barycentres in between (a binary planet counts as two)
  const under = p => [...M.byId.values()].filter(b => {
    if (b.type === "Barycentre" || !M.orbits(b)) return false;
    for (let n = M.par.get(b.bodyId), d = 0; n !== undefined && d < 20; n = M.par.get(n), d++) { if (n === p) return true; const x = M.byId.get(n); if (x && x.type !== "Barycentre") return false; }
    return false; });
  const cs = [...M.kids.keys()].map(p => ({ p, b: M.byId.get(p), list: under(p) })).filter(c => c.list.length >= 2 && !(c.b && c.b.type === "Planet"));
  const dep = p => { let d = 0; for (let n = p; M.par.has(n) && d < 20; n = M.par.get(n)) d++; return d; };
  cs.sort((a, b) => b.list.length - a.list.length || dep(a.p) - dep(b.p));
  for (const c of cs) { const per = c.list.map(b => b.orbitalPeriod).sort((a, b) => a - b); c.years = clamp(per[per.length - 2] / 365.25, 0.02, 30); c.name = M.cName(c.p); }
  const withMoons = [...M.byId.values()].filter(b => b.type !== "Barycentre" && M.orbits(b) && (M.kids.get(b.bodyId) || []).some(i => M.orbits(M.byId.get(i)) && M.byId.get(i).type !== "Barycentre"))
    .sort((a, b) => (M.kids.get(b.bodyId) || []).length - (M.kids.get(a.bodyId) || []).length);
  return (M.time = { cs, withMoons });
}
// ------------------------------------------------------------ sound: an engine made for this window
// Every note is a real instrument model, worked out once into a short sound and then only played back, so a note costs
// almost nothing. Bars (marimba, vibraphone, glass) ring with their measured overtones, a string is plucked with
// the Karplus-Strong model, bells carry their hum, tierce and nominal. One shared hall reverb, a soft compressor.
const A = { ctx: null, master: null, bus: null, send: null, drone: null, cache: new Map(), vol: 0.7, timer: 0, play: null };
try { const v = localStorage.getItem("gravitas.lensVol"); if (v !== null) A.vol = clamp(+v, 0, 1); } catch (e) {}
function audio() {
  if (A.ctx) return A.ctx;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}   // an iPhone on silent still plays it (Safari 17+)
  return chain(new AC({ latencyHint: "playback" }));
}
function chain(ctx) {
  A.ctx = ctx;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
  const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.1;
  A.master = ctx.createGain(); A.master.gain.value = A.vol * A.vol;
  A.bus = ctx.createGain(); A.send = ctx.createGain(); A.send.gain.value = 0.42;
  const verb = ctx.createConvolver(); verb.buffer = hall(ctx, 3.4); const vhp = ctx.createBiquadFilter(); vhp.type = "highpass"; vhp.frequency.value = 160;
  A.bus.connect(comp); A.bus.connect(A.send); A.send.connect(vhp); vhp.connect(verb); verb.connect(comp);
  comp.connect(lim); lim.connect(A.master); A.master.connect(ctx.destination);
  return ctx;
}
// a hall: early reflections, then a dense tail whose highs die first (each side its own, for width)
function hall(ctx, sec) {
  const sr = ctx.sampleRate, n = Math.floor(sr * sec), b = ctx.createBuffer(2, n, sr), pre = Math.floor(sr * 0.018);
  let seed = 12345; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2147483648 - 1);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c); let lp = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr, k = Math.exp(-t * 6.9 / (sec * 0.9)), cut = 0.92 * Math.exp(-t * 1.6) + 0.05;
      lp += cut * (rnd() - lp); d[i] = lp * k * (t < 0.08 ? 0.6 + 5 * t : 1);
    }
    for (let r = 0; r < 9; r++) { const at = pre + Math.floor(sr * (0.006 + 0.007 * r + 0.004 * ((r * 7 + c * 3) % 5))); if (at < n) d[at] += (c ? -1 : 1) * 0.5 * Math.pow(0.78, r); }
  }
  return b;
}
const INST = {
  marimba: { label: "marimba", modes: [[1, 1, 1.0], [3.93, 0.32, 0.17], [9.2, 0.1, 0.05]], hard: 0.35, len: 2.2, gain: 0.9 },
  vibes: { label: "vibraphone", modes: [[1, 1, 3.2], [3.98, 0.22, 0.85], [9.95, 0.05, 0.22]], hard: 0.55, len: 3.6, gain: 0.75 },
  glass: { label: "glass bars", modes: [[1, 1, 1.9], [2.756, 0.36, 0.75], [5.404, 0.16, 0.34], [8.933, 0.07, 0.17]], hard: 0.7, len: 3, gain: 0.7 },
  bell: { label: "bell", modes: [[0.5, 0.42, 4.2], [1, 1, 3.2], [1.19, 0.5, 2.6], [1.5, 0.3, 2.1], [2, 0.55, 1.7], [2.51, 0.22, 1.1], [3.01, 0.16, 0.8], [4.17, 0.08, 0.5]], hard: 0.6, len: 5, gain: 0.55 },
  harp: { label: "harp", ks: true, len: 3.4, gain: 1.0 },
};
function instOf(b) {
  const s = (b.subType || "").toLowerCase();
  if (b.type === "Star") return "bell";
  if (b.type === "Barycentre") { const m = M.members(b.bodyId)[0]; return m ? instOf(m) : "vibes"; }
  if (/giant/.test(s)) return "marimba";
  if (/metal/.test(s)) return "vibes";
  if (/icy|ice/.test(s)) return "glass";
  return "harp";                                                     // rocky, earth-like, water and ammonia worlds
}
// one note of an instrument, worked out once (mono)
function render(inst, f) {
  const key = inst + "|" + f.toFixed(2); if (A.cache.has(key)) return A.cache.get(key);
  const ctx = A.ctx, sr = ctx.sampleRate, I = INST[inst], n = Math.floor(sr * I.len), buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  if (I.ks) {                                                         // a plucked string (Karplus-Strong, with a tuned delay)
    const N = sr / f, Ni = Math.floor(N - 0.5), fr = N - 0.5 - Ni, ap = (1 - fr) / (1 + fr), line = new Float32Array(Ni + 1);
    const T60 = clamp(4.5 * Math.pow(220 / f, 0.6), 0.8, 7), rho = Math.pow(10, -3 / (f * T60)), pick = Math.max(2, Math.floor(Ni * 0.13));
    let s = 99; const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2147483648 - 1);
    let lp = 0; for (let i = 0; i <= Ni; i++) { lp += 0.55 * (rnd() - lp); line[i] = lp; }
    for (let i = Ni; i >= pick; i--) line[i] -= line[i - pick];          // where the string is plucked
    let w = 0, prev = 0, apx = 0, apy = 0, peak = 1e-9;
    for (let i = 0; i < n; i++) {
      const x = line[w], nx = line[(w + 1) % (Ni + 1)], y = rho * (0.5 * x + 0.5 * nx);
      const o = ap * (y - apy) + apx; apx = y; apy = o;                    // all-pass: the fine tuning
      line[w] = o; w = (w + 1) % (Ni + 1); prev += 0.6 * (x - prev); d[i] = prev; peak = Math.max(peak, Math.abs(prev));
    }
    for (let i = 0; i < n; i++) d[i] /= peak * 1.4;
  } else {                                                             // a struck bar or bell: decaying overtones, a soft mallet
    const tScale = Math.pow(440 / f, 0.45), atk = 0.0015 + 0.004 * (1 - I.hard);
    for (const [ratio, amp, tau] of I.modes) {
      const fk = f * ratio; if (fk > sr * 0.45) continue;
      const bright = Math.pow(ratio, -(1 - I.hard) * 0.9), a = amp * bright, T = tau * tScale, dec = Math.exp(-1 / (T * sr));
      for (const det of ratio === 1 ? [0] : [-0.0007, 0.0007]) {    // a mode is two close tones: a slow shimmer
        const w = TAU * fk * (1 + det) / sr, c = Math.cos(w), s0 = Math.sin(w); let re = 1, im = 0, g = a / (ratio === 1 ? 1 : 2);
        for (let i = 0; i < n; i++) { d[i] += g * im; const r2 = re * c - im * s0; im = re * s0 + im * c; re = r2; g *= dec; if (g < 1e-5) break; }
      }
    }
    let s = 7; const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2147483648 - 1); let lp = 0;
    const nn = Math.floor(sr * 0.004);
    for (let i = 0; i < n; i++) { const e = 1 - Math.exp(-i / (atk * sr)); d[i] *= e; if (i < nn) { lp += (0.15 + 0.6 * I.hard) * (rnd() - lp); d[i] += lp * 0.12 * I.hard * (1 - i / nn); } }
    let peak = 1e-9; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i])); for (let i = 0; i < n; i++) d[i] /= peak * 1.2;
  }
  const fo = Math.floor(sr * 0.06); for (let i = 0; i < fo; i++) d[n - 1 - i] *= i / fo;
  A.cache.set(key, buf); if (A.cache.size > 64) A.cache.delete(A.cache.keys().next().value);
  return buf;
}
// the star under it all: a slow, seamless drone. Its colour follows the star (hot: bright, cool: dark, a black hole: deep)
async function droneBuf(star, sync) {
  const ctx = A.ctx, sr = ctx.sampleRate, L = 6, n = sr * L, b = ctx.createBuffer(2, n, sr), f0 = 55;
  const sub = (star && star.subType || "").toLowerCase(), T = star && star.surfaceTemperature || 3500;
  const tilt = /black hole/.test(sub) ? 2.6 : /neutron|white dwarf/.test(sub) ? 0.8 : clamp(2.2 - (Math.log10(T) - 3.3) * 1.1, 0.9, 2.2);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let k = 1; k <= 10; k++) {
      if (!sync) await new Promise(r => setTimeout(r, 0));            // a little at a time: the page never stalls
      const amp = Math.pow(k, -tilt) * (k === 1 && /black hole/.test(sub) ? 1.4 : 1);
      for (const det of [-1, 1]) {
        const f = Math.round(f0 * k * L + det * (k + c)) / L, w = TAU * f / sr, cw = Math.cos(w), sw = Math.sin(w);
        const lf = Math.round(1 + ((k * 3 + c) % 4)) / L, lw = TAU * lf / sr, lc = Math.cos(lw), ls = Math.sin(lw);
        let re = Math.cos(k + c), im = Math.sin(k + c), lr = 1, li = 0;
        for (let i = 0; i < n; i++) { d[i] += amp * im * (0.6 + 0.4 * li) * 0.5; const r2 = re * cw - im * sw; im = re * sw + im * cw; re = r2; const q = lr * lc - li * ls; li = lr * ls + li * lc; lr = q; }
      }
    }
    let peak = 1e-9; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i])); for (let i = 0; i < n; i++) d[i] /= peak;
  }
  return b;
}
function droneStart(star, buf, f, at) {
  const ctx = A.ctx, s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
  let r = f / 55; while (r >= 2) r /= 2; while (r < 1) r *= 2; s.playbackRate.value = r;
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900; lp.Q.value = 0.5;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.16, at + 2.5);
  s.connect(lp); lp.connect(g); g.connect(A.bus); s.start(at);
  return { s, g };
}
function droneStop(d, at) { if (!d) return; try { d.g.gain.cancelScheduledValues(at); d.g.gain.setTargetAtTime(0.0001, at, 0.8); d.s.stop(at + 5); } catch (e) {} }
function hit(buf, at, vel, pan) {
  const ctx = A.ctx, s = ctx.createBufferSource(); s.buffer = buf;
  const g = ctx.createGain(); g.gain.value = vel; const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  s.connect(g); if (p) { p.pan.value = pan; g.connect(p); p.connect(A.bus); } else g.connect(A.bus);
  s.start(at); A.live.push({ s, g, at, end: at + buf.duration });
  const now = A.ctx.currentTime;                                    // too many notes still ringing: the oldest fades out (never a click)
  if (!A.offline && A.live.length > 32) { const o = A.live.find(q => q.at < now && !q.cut); if (o) { o.cut = 1; try { o.g.gain.setTargetAtTime(0, now, 0.04); o.s.stop(now + 0.3); } catch (e) {} } }
}
// ------------------------------------------------------------ the tour: the system's melody, family by family
const MIN_GAP = 0.15, SEC_MIN = 12, SEC_MAX = 24;
function section(f) {
  let keep = f.v.slice(), silent = [];
  for (;;) {
    if (new Set(keep.map(b => b.orbitalPeriod.toPrecision(4))).size < 2) return null;
    const Pmin = keep[0].orbitalPeriod, Pmax = keep[keep.length - 1].orbitalPeriod, sLo = MIN_GAP / Pmin, sHi = SEC_MAX / (1.1 * Pmax);
    if (sLo <= sHi) { let s = sLo * 1.6; if (1.2 * Pmax * s > SEC_MAX) s = Math.max(sLo, SEC_MAX / (1.2 * Pmax));
      const dur = clamp(1.3 * Pmax * s, SEC_MIN, SEC_MAX);
      return { f, keep, silent, s, dur }; }
    silent.unshift(keep.pop());
  }
}
function tuning(sec) {                                              // the pitch of each voice
  const fr = sec.keep.map(b => 1 / b.orbitalPeriod), lo = Math.min(...fr), hi = Math.max(...fr);
  const geo = Math.sqrt(lo * hi), c = 330 / geo;
  if (hi / lo <= Math.pow(2, 3.5) && lo * c >= 80 && hi * c <= 1500) return { mode: "true", hz: fr.map(x => x * c) };
  return { mode: "folded", hz: fr.map(x => { let h = x * c; while (h < 220) h *= 2; while (h >= 440) h /= 2; return h; }) };
}
// when each voice plays: as it passes between its centre and the star (moons), or crosses the line above the centre
function refAngle(f, t) {
  if (f.top) return Math.PI / 2;
  const s = M.star(f.p); if (s == null) return Math.PI / 2;
  const c = abs(f.p, t), st = abs(s, t); return Math.atan2(st[1] - c[1], st[0] - c[0]);
}
function hitsOf(sec, t0) {
  const span = sec.dur / sec.s * DAY, out = [], RN = 400, ref = new Float64Array(RN + 1);
  for (let i = 0; i <= RN; i++) ref[i] = refAngle(sec.f, t0 + span * i / RN);
  for (let i = 1; i <= RN; i++) { while (ref[i] - ref[i - 1] > Math.PI) ref[i] -= TAU; while (ref[i] - ref[i - 1] < -Math.PI) ref[i] += TAU; }
  const refAt = t => { const u = clamp((t - t0) / span * RN, 0, RN), i = Math.min(RN - 1, Math.floor(u)); return ref[i] + (ref[i + 1] - ref[i]) * (u - i); };
  sec.keep.forEach((b, k) => {
    const step = Math.min(b.orbitalPeriod * DAY / 160, span / 200), n = Math.ceil(span / step);
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const t = t0 + i * step, p = rel(b, t); let d = Math.atan2(p[1], p[0]) - refAt(t);
      d = ((d + Math.PI) % TAU + TAU) % TAU - Math.PI;
      if (prev !== null && Math.abs(d - prev) < Math.PI / 2 && (prev < 0) !== (d < 0)) { const frac = Math.abs(prev) / (Math.abs(prev) + Math.abs(d)); out.push({ k, at: ((i - 1 + frac) * step) / DAY * sec.s }); }
      prev = d;
    }
  });
  return out.sort((a, b) => a.at - b.at);
}
function tourPlan(onlyFam) {
  const list = (onlyFam ? [onlyFam] : M.fams).map(section).filter(Boolean);
  if (!onlyFam) { list.sort((a, b) => (b.f.top ? 1 : 0) - (a.f.top ? 1 : 0) || b.keep.length - a.keep.length); list.splice(6); }
  return list;
}
function tourCan() { const l = tourPlan(); return l.length ? null : "No family here has two bodies whose orbits can be played together."; }
function voiceInfo(sec) {
  const tu = tuning(sec), rs = sec.keep.map(b => Math.log10(Math.max(b.radius || 1, 1))), lo = Math.min(...rs), hi = Math.max(...rs);
  return { tu, v: sec.keep.map((b, k) => ({ b, inst: instOf(b), hz: tu.hz[k], vel: 0.6 + 0.4 * (hi > lo ? (rs[k] - lo) / (hi - lo) : 0.5), pan: sec.keep.length > 1 ? -0.6 + 1.2 * k / (sec.keep.length - 1) : 0, col: COL[k % COL.length] })) };
}
async function play(onlyFam) {
  const ctx = audio(); if (!ctx) { G.toast("This browser cannot play sound"); return; }
  await ctx.resume();
  stop(true);
  const plan = tourPlan(onlyFam); if (!plan.length) return;
  const star = M.byId.get(M.root) && M.byId.get(M.root).type === "Star" ? M.byId.get(M.root) : [...M.byId.values()].find(b => b.type === "Star");
  const t0 = ctx.currentTime + 0.15, intro = onlyFam ? 1.2 : 3.2, P = { plan, star, i: -1, sec: null, at: t0 + intro, t0, simT0: G.t, drone: null, hits: [], hi: 0, voices: null, glow: [], intro, done: false };
  A.live = []; A.play = P;
  try { G.Sound.setAmbient(false); } catch (e) {}
  next(P);
  (A.droneStar === star && A.droneBuf ? Promise.resolve(A.droneBuf) : droneBuf(star)).then(buf => {
    if (A.play !== P) return; A.droneBuf = buf; A.droneStar = star;
    const low = P.voices ? Math.min(...P.voices.v.map(v => v.hz)) : 55; P.drone = droneStart(star, buf, low, Math.max(A.ctx.currentTime + 0.05, t0)); });
  A.timer = setInterval(sched, 90); sched();
  anim();
  ui();
}
function next(P) {
  P.i++; if (P.i >= P.plan.length) { P.end = P.at + 3.5; droneStop(P.drone, P.at + 0.5); return; }
  const sec = P.plan[P.i], vi = voiceInfo(sec), simStart = G.t;
  P.sec = sec; P.voices = vi; P.secAt = P.at; P.simStart = simStart; P.hits = hitsOf(sec, simStart); P.hi = 0; P.glow = sec.keep.map(() => -9);
  (async () => { for (const v of vi.v) { await new Promise(r => setTimeout(r, 0)); if (A.play !== P) return; render(v.inst, v.hz); } })();   // made ahead, one note at a time
  const low = Math.min(...vi.v.map(v => v.hz)), d = P.drone;            // the drone follows the lowest voice
  if (d) { let r = low / 55; while (r >= 2) r /= 2; while (r < 1) r *= 2; d.s.playbackRate.setTargetAtTime(r, Math.max(P.at - 1, A.ctx.currentTime), 0.6); }
}
function sched() {
  const P = A.play; if (!P) return;
  const ctx = A.ctx, horizon = ctx.currentTime + 0.6;
  while (P.sec && P.i < P.plan.length) {
    while (P.hi < P.hits.length && P.secAt + P.hits[P.hi].at < horizon) {
      const h = P.hits[P.hi++], v = P.voices.v[h.k], at = P.secAt + h.at;
      if (at >= ctx.currentTime) { hit(render(v.inst, v.hz), at, v.vel * INST[v.inst].gain * 0.5, v.pan); (P.queue || (P.queue = [])).push({ at, k: h.k, sec: P.i }); }
    }
    if (P.secAt + P.sec.dur < horizon) { P.at = P.secAt + P.sec.dur + 1.2; next(P); } else break;
  }
  if (P.end && ctx.currentTime > P.end) stop();
  A.live = A.live.filter(o => o.end > ctx.currentTime && !o.cut);
}
function stop(quiet) {
  clearInterval(A.timer); A.timer = 0;
  const P = A.play; A.play = null;
  if (A.ctx) { const t = A.ctx.currentTime; if (P) droneStop(P.drone, t); for (const o of A.live || []) { try { o.s.stop(t + 0.05); } catch (e) {} } A.live = []; }
  if (!quiet) { try { G.Sound.setAmbient(!G.map); } catch (e) {} ui(); }
}
document.addEventListener("visibilitychange", () => { if (!A.ctx) return; if (document.hidden) A.ctx.suspend(); else if (A.play) A.ctx.resume(); });

// ------------------------------------------------------------ drawing helpers
function canvas(el, w, h) {
  const c = el.querySelector("canvas") || el.appendChild(document.createElement("canvas")), dpr = Math.min(devicePixelRatio || 1, G.low ? 1.5 : 2);
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.width = w + "px"; c.style.height = h + "px";
  const x = c.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = BG; x.fillRect(0, 0, w, h); return x;
}
const sizeOf = el => { const w = Math.max(240, Math.floor(el.clientWidth || 300)); return w; };

// ------------------------------------------------------------ the window
let ROOT = null, ST = { view: "rhythm", pair: 0, seen: 0, land: 0, moonOf: 0, cen: 0, fam: "tour" }, RAF = 0, WATCH = 0;
export function mount(el, req) {
  ROOT = el; M = null;
  if (req && req.view) ST.view = req.view;
  if (req && req.lp && req.lp.length) ST.lp = req.lp;
  clearInterval(WATCH); WATCH = setInterval(() => { if (ROOT && G.S && (!M || M.S !== G.S)) { stop(true); draw(); } }, 1000);
  draw();
}
export function unmount() {
  stop(true); try { G.Sound.setAmbient(!G.map); } catch (e) {}
  cancelAnimationFrame(RAF); RAF = 0; clearInterval(WATCH); WATCH = 0; ROOT = null;
  if (A.ctx) { const c = A.ctx; A.ctx = null; A.cache.clear(); A.droneBuf = null; A.droneStar = null; c.close().catch(() => {}); }
}
function why() {                                                     // why a lens cannot work here
  if (!M) return { rhythm: "No system is open.", landscape: "No system is open.", time: "No system is open." };
  const any = [...M.byId.values()].some(M.orbits);
  return {
    rhythm: !any ? "Nothing in this system orbits anything: there is no rhythm to show." : !pairs().length && tourCan() ? "No two bodies here circle the same centre with different periods." : null,
    landscape: !any ? "Nothing in this system orbits anything." : !landPairs().length ? "The masses needed are missing from the orbit data." : null,
    time: !any ? "Nothing in this system orbits anything: it looks the same at every moment." : !timeSet().cs.length && !timeSet().withMoons.length ? "No centre here has two bodies around it." : null,
  };
}
function draw() {
  if (!ROOT) return;
  model();
  if (M && ST.sysS !== M.S) { ST.sysS = M.S; Object.assign(ST, { pair: 0, seen: 0, land: 0, moonOf: 0, cen: 0, fam: "tour" }); }
  const W = why();
  if (W[ST.view]) { const ok = ["rhythm", "landscape", "time"].find(k => !W[k]); if (ok && !ST.forced) ST.view = ok; }
  const nav = ["rhythm", "landscape", "time"].map(k => `<button type="button" data-lv="${k}" class="${ST.view === k ? "on" : ""}${W[k] ? " off" : ""}"${W[k] ? ` title="${G.esc(W[k])}"` : ""}>${{ rhythm: "Rhythm", landscape: "Landscape", time: "Time" }[k]}</button>`).join("");
  ROOT.innerHTML = `<div class="q">GRAVITAS: LENSES${M ? ` · ${G.esc(M.sys)}` : ""}</div>
    <div class="lnTop"><div class="mSub" role="tablist">${nav}</div><span class="lnAct"><button type="button" data-la="link" title="Copy a link to this lens">Copy link</button></span></div>
    <div id="lnBody"></div><div id="lnText"></div>`;
  ROOT.querySelector(".lnTop").onclick = e => { const b = e.target.closest("[data-lv]"); if (b) { ST.view = b.dataset.lv; ST.forced = true; stop(); draw(); return; }
    const a = e.target.closest("[data-la]"); if (a && a.dataset.la === "link") copyLink(a); };
  const body = ROOT.querySelector("#lnBody");
  if (!M) { body.innerHTML = `<p class="note">Open a system first.</p>`; return; }
  if (W[ST.view]) { body.innerHTML = `<p class="lnWhy">${G.esc(W[ST.view])}</p>`; text(); return; }
  if (ST.view === "rhythm") rhythmView(body); else if (ST.view === "landscape") landView(body); else timeView(body);
  text();
}
function text() {
  const t = ROOT.querySelector("#lnText"); if (!t) return;
  const T = {
    rhythm: `<div class="q">WHAT RHYTHM SHOWS</div><p>Two bodies around the same centre, joined by a line again and again. When one goes round almost exactly p times while the other goes round q times, the lines close into a pattern with p − q petals. That is a resonance: the two meet at the same places, over and over.</p>
      <p><b>Seen from</b> draws the path one body takes across the sky of the other. Each small loop is a time it seems to walk backwards.</p>
      <div class="q">THE MELODY</div><p><b>Play the system</b> plays it family by family: the planets, then each body's moons. Each body plays its note when it passes between its centre and the star (for the planets: when it crosses the line above the star). So the rhythm is the real one, sped up. Each part says how much.</p>
      <p>The pitch is each body's own orbit frequency, raised by the same amount for all, so their true ratios are kept. When they spread too far for the ear, each one is moved by whole octaves instead, and the part says <b>octaves folded</b>. The instrument follows the kind of body: gas giants a marimba, metal-rich bodies a vibraphone, icy bodies glass bars, rocky worlds a harp, stars a bell. That choice, and the star's drone under it, are ours: they are not in the data.</p>
      <div class="q">IN THE GAME</div><p>Every crossing of two lines is a moment the two bodies line up. Use it to plan a picture, or to know when a moon will cross your sky.</p>`,
    landscape: `<div class="q">WHAT LANDSCAPE SHOWS</div><p>The pull of two bodies, seen from a frame that turns with the smaller one. Dark is deep in the big body's well. The bright ring is a ridge, where the pull and the turning balance.</p>
      <p>The five Lagrange points are where a third, small body could ride along. L4 and L5 hold their bodies only when the smaller body is light enough (below about 1/26 of the pair): the window says so when they do not.</p>
      <p>The <b>Hill sphere</b> is the room a body rules: a moon inside it stays its moon. Moons are safe within about half of it.</p>
      <div class="q">IN THE GAME</div><p>Elite Dangerous does not pull ships or bodies this way: orbits in the game run on fixed paths, and supercruise slows near bodies by its own rules. This lens shows what the same masses would do in real physics. It tells you which body rules which part of the system, and why a system holds together.</p>`,
    time: `<div class="q">WHAT TIME SHOWS</div><p>Years of motion in one picture. Each trail fades with age. Bodies that share a centre braid around each other.</p>
      <p>On the right, a body and its moons moving through space. A moon only loops back when it goes round its body faster than the body goes round its star. The window marks which ones do.</p>
      <div class="q">IN THE GAME</div><p>The distance between two bodies of a system changes with the years. Here you see when two of them come close and when they are far apart: a shorter trip in supercruise.</p>`,
  };
  t.innerHTML = T[ST.view] + `<p class="note">From the Spansh orbit data, drawn flat. Worked out and played in your browser. Nothing is sent anywhere.</p>`;
}
async function copyLink(btn) {
  let u = G.shareUrl(false) + "&lens=" + ST.view;
  const p = ST.view === "rhythm" && pairs()[ST.pair]; if (p) u += "&lp=" + p.A.bodyId + "|" + p.B.bodyId;
  try { await navigator.clipboard.writeText(u); btn.textContent = "Copied"; setTimeout(() => (btn.textContent = "Copy link"), 1800); } catch (e) { prompt("Copy this link:", u); }
}

// ------------------------------------------------------------ Rhythm view
function rhythmView(body) {
  const P = pairs();
  if (ST.lp) { const i = P.findIndex(p => ST.lp.includes(p.A.bodyId) && ST.lp.includes(p.B.bodyId)); if (i >= 0) ST.pair = i; ST.lp = null; }
  if (ST.pair >= P.length) ST.pair = 0;
  const p = P[ST.pair], R = resonances(), tw = tourCan();
  const fams = M.fams.map((f, i) => section(f) ? `<option value="${i}"${ST.fam === String(i) ? " selected" : ""}>${G.esc(f.label)}</option>` : "").join("");
  const pl = P.slice(0, 3).concat(ST.pair >= 3 ? [P[ST.pair]] : []);
  body.innerHTML = `<div class="lnGrid">
    <div class="lnFig" id="lnFig"></div>
    <div class="lnSide">
      <div class="lnPlay">${tw ? `<p class="lnWhy">${G.esc(tw)}</p>` : `<button type="button" class="pri" data-lp="go">${A.play ? "■ Stop" : "▶ Play the system"}</button>
        <select data-lp="fam" aria-label="What to play"><option value="tour">The whole system, part by part</option>${fams}</select>
        <label class="lnVol">Volume <input type="range" min="0" max="1" step="0.01" value="${A.vol}" data-lp="vol" aria-label="Volume"></label>`}
        <div id="lnNow" class="lnNow"></div></div>
      ${p ? `<div class="q">PATTERNS</div><div class="lnPairs">${pl.map(x => { const i = P.indexOf(x); return `<button type="button" data-pi="${i}" class="${i === ST.pair ? "on" : ""}"><b>${G.esc(M.nm(x.A))} & ${G.esc(M.nm(x.B))}</b><span>${x.fr.p} : ${x.fr.q} · ${x.petals > 0 ? `${x.petals} petal${x.petals > 1 ? "s" : ""}` : "one loop"} · ${G.esc(x.f.label)}</span></button>`; }).join("")}</div>
        ${P.length > 3 ? `<select data-lp="more" aria-label="All pairs"><option value="">All ${P.length} pairs…</option>${P.map((x, i) => `<option value="${i}">${G.esc(M.nm(x.A))} & ${G.esc(M.nm(x.B))} · ${x.fr.p}:${x.fr.q}</option>`).join("")}</select>` : ""}
        <div class="lnSeen"><button type="button" data-lp="seen" class="${ST.seen ? "on" : ""}">${ST.seen ? `Back to the pattern` : `Seen from ${G.esc(M.nm(p.A))}`}</button>${ST.seen ? `<button type="button" data-lp="flip">Seen from ${G.esc(M.nm(ST.seen === 1 ? p.B : p.A))}</button>` : ""}</div>` : `<p class="note">No pattern: no two bodies here share a centre with different periods.</p>`}
      ${R.length ? `<div class="q">RESONANCES</div><div class="lnRes">${R.map(r => `<span class="lnBadge${r.k === "chain" ? " chain" : ""}" title="${r.k === "chain" ? "A chain: each pair is close to a simple ratio" : "Close to a simple ratio"}"><b>${r.ratio}</b> ${G.esc(r.txt)} <i>${fmtErr(r.err)}</i></span>`).join("")}</div>` : ""}
      <div class="lnBtns"><button type="button" data-lp="card">Melody card (picture)</button></div>
    </div></div>`;
  body.onclick = e => {
    const b = e.target.closest("[data-pi]"); if (b) { ST.pair = +b.dataset.pi; ST.seen = 0; draw(); return; }
    const a = e.target.closest("[data-lp]"); if (!a) return; const k = a.dataset.lp;
    if (k === "go") { if (A.play) stop(); else play(ST.fam === "tour" ? null : M.fams[+ST.fam]); }
    else if (k === "seen") { ST.seen = ST.seen ? 0 : 1; draw(); }
    else if (k === "flip") { ST.seen = ST.seen === 1 ? 2 : 1; draw(); }
    else if (k === "card") card(a);
  };
  body.onchange = e => { const a = e.target.closest("[data-lp]"); if (!a) return;
    if (a.dataset.lp === "fam") { ST.fam = a.value; if (A.play) { stop(); } }
    if (a.dataset.lp === "more" && a.value !== "") { ST.pair = +a.value; ST.seen = 0; draw(); } };
  body.oninput = e => { if (e.target.dataset.lp === "vol") { A.vol = +e.target.value; if (A.master) A.master.gain.setTargetAtTime(A.vol * A.vol, A.ctx.currentTime, 0.05); try { localStorage.setItem("gravitas.lensVol", A.vol); } catch (x) {} } };
  if (A.play) { anim(); return; }
  if (p) figRhythm(body.querySelector("#lnFig"), p); else figEmpty(body.querySelector("#lnFig"));
}
const fmtErr = e => e < 1e-4 ? "within 0.01%" : `within ${(e * 100).toFixed(e < 1e-3 ? 2 : 1)}%`;
function figEmpty(el) { const s = sizeOf(el), x = canvas(el, s, s); x.fillStyle = "#9d8cc0"; x.font = "13px system-ui"; x.textAlign = "center"; x.fillText("Press play to hear the system", s / 2, s / 2); }
function figRhythm(el, p, toCtx, box) {
  const s = box || sizeOf(el), x = toCtx || canvas(el, s, s), c = s / 2;
  if (!toCtx) cancelAnimationFrame(RAF);
  if (ST.seen && !toCtx) {
    const D = seenData(p, ST.seen === 1), k = (s * 0.44) / (D.ext || 1);
    x.strokeStyle = "rgba(255,210,122,.85)"; x.lineWidth = 0.8; x.beginPath();
    for (let i = 0; i < D.n; i++) { const X = c + D.P[i * 2] * k, Y = c - D.P[i * 2 + 1] * k; i ? x.lineTo(X, Y) : x.moveTo(X, Y); }
    x.stroke(); x.fillStyle = "#6ae8ff"; x.beginPath(); x.arc(c, c, 4, 0, TAU); x.fill();
    cap(x, s, `${M.nm(D.X)} seen from ${M.nm(D.O)} (centre)`, `${Math.round(D.T / DAY / 365.25 * 10) / 10 >= 1 ? (D.T / DAY / 365.25).toFixed(1) + " years" : Math.round(D.T / DAY) + " days"} · each loop: ${M.nm(D.X)} walks backwards in the sky`);
    return;
  }
  const D = spiroData(p), k = (s * 0.45) / D.ext, X = v => c + v * k, Y = v => c - v * k;
  x.strokeStyle = "rgba(255,255,255,.35)"; x.lineWidth = 0.7;
  for (const b of [p.A, p.B]) { x.beginPath(); for (let i = 0; i <= 240; i++) { const q = rel(b, G.t + b.orbitalPeriod * DAY * i / 240); i ? x.lineTo(X(q[0]), Y(q[1])) : x.moveTo(X(q[0]), Y(q[1])); } x.stroke(); }
  x.fillStyle = "#ffd27a"; x.beginPath(); x.arc(c, c, 4.5, 0, TAU); x.fill();
  const col = "rgba(255,106,213,", a = clamp(220 / D.n, 0.12, 0.45), L = D.L;
  const strokeTo = (i0, i1) => { x.strokeStyle = col + a + ")"; x.lineWidth = 0.55; x.beginPath(); for (let i = i0; i < i1; i++) { x.moveTo(X(L[i * 4]), Y(L[i * 4 + 1])); x.lineTo(X(L[i * 4 + 2]), Y(L[i * 4 + 3])); } x.stroke(); };
  const yrs = D.T / DAY / 365.25, span = yrs >= 1 ? `${yrs.toFixed(yrs < 10 ? 1 : 0)} years` : `${Math.round(D.T / DAY)} days`;
  const sub = `periods ${fmtP(p.A.orbitalPeriod)} and ${fmtP(p.B.orbitalPeriod)} · ratio ${p.r.toFixed(4)}, near ${p.fr.p} : ${p.fr.q}`;
  if (toCtx) { strokeTo(0, D.n); return; }
  let i = 0; const per = Math.max(8, Math.ceil(D.n / 90));
  const step = () => { if (!ROOT || el.isConnected === false) return; const j = Math.min(D.n, i + per); strokeTo(i, j); i = j; if (i < D.n) RAF = requestAnimationFrame(step); else cap(x, s, `${M.nm(p.A)} & ${M.nm(p.B)}`, `${sub} · ${span}`); };
  RAF = requestAnimationFrame(step);
}
const fmtP = d => d < 1 ? `${(d * 24).toFixed(1)} h` : d < 800 ? `${d.toFixed(d < 10 ? 2 : 1)} d` : `${(d / 365.25).toFixed(1)} y`;
function cap(x, s, a, b) {                                          // a caption at the foot of a figure, made smaller until it fits
  const H = x.canvas.height / (x.getTransform().d || 1), fit = (t, w, px) => { for (; px > 8; px -= 0.5) { x.font = w + px + "px system-ui"; if (x.measureText(t).width <= s - 12) break; } };
  x.fillStyle = "rgba(11,7,22,.75)"; x.fillRect(0, H - 40, s, 40); x.textAlign = "center";
  x.fillStyle = "#fff"; fit(a, "600 ", 12.5); x.fillText(a, s / 2, H - 23); x.fillStyle = "#cbbfdc"; fit(b, "", 11); x.fillText(b, s / 2, H - 8); }
// the tour on screen: the playing family, each body on its own ring, the line it plays on, and a glow on each note
function anim() {
  cancelAnimationFrame(RAF);
  const el = ROOT && ROOT.querySelector("#lnFig"); if (!el || !A.play) return;
  const s = sizeOf(el), x = canvas(el, s, s); let last = 0;
  const frame = now => {
    const P = A.play; if (!P || !ROOT || !el.isConnected) return;
    RAF = requestAnimationFrame(frame); if (now - last < 33) return; last = now;
    const ctx = A.ctx, t = ctx.currentTime, c = s / 2;
    x.fillStyle = BG; x.fillRect(0, 0, s, s);
    const nowEl = ROOT.querySelector("#lnNow");
    if (!P.sec || t < P.secAt) {
      x.textAlign = "center"; x.fillStyle = "#ff6ad5"; x.font = "600 13px system-ui"; x.fillText("GRAVITAS", c, c - 14);
      x.fillStyle = "#fff"; x.font = "600 17px system-ui"; x.fillText(P.i >= P.plan.length ? "The end" : `The melody of ${M.sys}`, c, c + 10);
      if (nowEl) nowEl.innerHTML = P.i >= P.plan.length ? "" : `<span>Starting…</span>`; return;
    }
    const sec = P.sec, vi = P.voices, el2 = t - P.secAt, days = el2 / sec.s, tt = P.simStart + days * DAY, ref = refAngle(sec.f, tt);
    while (P.queue && P.queue.length && P.queue[0].at <= t) { const q = P.queue.shift(); if (q.sec === P.i) P.glow[q.k] = q.at; }
    x.strokeStyle = "rgba(255,255,255,.3)"; x.lineWidth = 1; x.beginPath(); x.moveTo(c, c); x.lineTo(c, 8); x.stroke();
    x.fillStyle = "#cbbfdc"; x.font = "10.5px system-ui"; x.textAlign = "left"; x.fillText(sec.f.top ? "the line it plays on" : "toward the star", c + 6, 16);
    const n = vi.v.length;
    vi.v.forEach((v, k) => {
      const R = s * (0.12 + 0.33 * (n > 1 ? k / (n - 1) : 0.5)), q = rel(v.b, tt), a = Math.atan2(q[1], q[0]) - ref + Math.PI / 2, g = Math.max(0, 1 - (t - P.glow[k]) / 0.22);
      x.strokeStyle = v.col; x.globalAlpha = 0.25 + 0.5 * g; x.lineWidth = 1; x.beginPath(); x.arc(c, c, R, 0, TAU); x.stroke(); x.globalAlpha = 1;
      const px = c + R * Math.cos(a), py = c - R * Math.sin(a);
      if (g > 0) { x.fillStyle = v.col; x.globalAlpha = 0.25 * g; x.beginPath(); x.arc(px, py, 9 + 12 * g, 0, TAU); x.fill(); x.globalAlpha = 1; }
      x.fillStyle = v.col; x.beginPath(); x.arc(px, py, 3.5 + 3 * g, 0, TAU); x.fill();
    });
    x.fillStyle = "#fff"; x.beginPath(); x.arc(c, c, 5, 0, TAU); x.fill();
    if (nowEl && nowEl._k !== P.i) { nowEl._k = P.i;
      nowEl.innerHTML = `<div class="lnSec"><b>${G.esc(sec.f.label)}</b> <span>part ${P.i + 1} of ${P.plan.length} · 1 day = ${fmtS(sec.s)} · ${vi.tu.mode === "true" ? "true ratios" : "octaves folded"}</span></div>
        <div class="lnVoices">${vi.v.map(v => `<span><i style="background:${v.col}"></i>${G.esc(M.nm(v.b))} <em>${fmtP(v.b.orbitalPeriod)} · ${noteName(v.hz)} · ${INST[v.inst].label}</em></span>`).join("")}</div>
        ${sec.silent.length ? `<p class="note">Too slow for this tempo, silent here: ${sec.silent.map(b => G.esc(M.nm(b))).join(", ")}.</p>` : ""}`; }
  };
  RAF = requestAnimationFrame(frame);
}
const fmtS = s => s >= 1 ? `${s.toFixed(1)} s` : s >= 0.01 ? `${s.toFixed(2)} s` : `${(s * 1000).toFixed(1)} ms`;
function ui() { if (ROOT && ST.view === "rhythm") { const b = ROOT.querySelector('[data-lp="go"]'); if (b) b.textContent = A.play ? "■ Stop" : "▶ Play the system"; if (!A.play) { const p = pairs()[ST.pair], el = ROOT.querySelector("#lnFig"); const n = ROOT.querySelector("#lnNow"); if (n) { n.innerHTML = ""; n._k = null; } if (el) { if (p) figRhythm(el, p); else figEmpty(el); } } else anim(); } }
// the melody card: a picture to share, with the pattern, the resonances and where to listen
function card(btn) {
  const p = pairs()[ST.pair], W = 1200, H = 630, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const x = cv.getContext("2d"), gr = x.createRadialGradient(330, 315, 40, 330, 315, 700); gr.addColorStop(0, "#1a0f2e"); gr.addColorStop(1, "#06040c");
  x.fillStyle = gr; x.fillRect(0, 0, W, H);
  if (p) { x.save(); x.translate(40, 25); figRhythm(null, p, x, 580); x.restore(); }
  x.textAlign = "left"; x.fillStyle = "#ff6ad5"; x.font = "700 22px system-ui"; x.fillText("GRAVITAS · LENSES", 660, 92);
  x.fillStyle = "#fff"; x.font = "700 34px system-ui"; wrap(x, `The melody of ${M.sys}`, 660, 142, 500, 40);
  let y = 230; x.font = "15px system-ui"; x.fillStyle = "#cbbfdc";
  if (p) { x.fillStyle = "#6ae8ff"; x.font = "600 17px system-ui"; x.fillText(`${M.nm(p.A)} & ${M.nm(p.B)}`, 660, y); y += 26; x.fillStyle = "#cbbfdc"; x.font = "15px system-ui"; x.fillText(`${p.fr.p} : ${p.fr.q} · ${p.petals > 0 ? p.petals + " petals" : "one loop"} · ratio ${p.r.toFixed(4)}`, 660, y); y += 40; }
  const R = resonances().slice(0, 4);
  if (R.length) { x.fillStyle = "#ffd27a"; x.font = "700 13px system-ui"; x.fillText("RESONANCES", 660, y); y += 26;
    for (const r of R) { x.fillStyle = "#fff"; x.font = "600 16px system-ui"; x.fillText(r.ratio, 660, y); x.fillStyle = "#cbbfdc"; x.font = "15px system-ui"; x.fillText(`${r.txt}  (${fmtErr(r.err)})`, 660 + 90, y); y += 26; } }
  x.fillStyle = "#9d8cc0"; x.font = "14px system-ui"; x.fillText("Listen: gravitasmap.com → Modes → Lenses", 660, H - 70);
  x.fillText("From the Spansh orbit data.", 660, H - 46);
  cv.toBlob(b => { if (!b) return; const u = URL.createObjectURL(b), l = document.createElement("a"); l.href = u; l.download = `GRAVITAS_${M.sys.replace(/[^\w-]+/g, "_")}_melody.png`; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); btn.textContent = "Saved"; setTimeout(() => (btn.textContent = "Melody card (picture)"), 1800); }, "image/png");
}
function wrap(x, t, X, Y, w, lh) { const words = t.split(" "); let line = ""; for (const wd of words) { const tt = line ? line + " " + wd : wd; if (x.measureText(tt).width > w && line) { x.fillText(line, X, Y); Y += lh; line = wd; } else line = tt; } x.fillText(line, X, Y); }

// ------------------------------------------------------------ Landscape view
function landView(body) {
  const L = landPairs(); if (ST.land >= L.length) ST.land = 0;
  const p = L[ST.land];
  body.innerHTML = `<div class="lnBar"><select data-ll="pair" aria-label="Which pair">${L.map((q, i) => `<option value="${i}"${i === ST.land ? " selected" : ""}>${G.esc(M.nm(q.big))} and ${G.esc(M.nm(q.small))}${q.k === "binary" ? " (a pair around their common centre)" : ""}</option>`).join("")}</select></div>
    <div class="lnTwo"><div class="lnFig" id="lnL1"></div><div class="lnFig" id="lnL2"></div></div><div id="lnLnote"></div>`;
  body.onchange = e => { if (e.target.dataset.ll === "pair") { ST.land = +e.target.value; draw(); } };
  figLand(body.querySelector("#lnL1"), p); figHill(body.querySelector("#lnL2"), p);
  const note = [], unstable = p.mu > 0.0385;
  note.push(`μ = ${p.mu < 1e-3 ? p.mu.toExponential(2) : p.mu.toFixed(4)}: ${M.nm(p.small)} has ${(p.mu * 100 < 0.01 ? (p.mu * 100).toExponential(1) : (p.mu * 100).toFixed(p.mu < 0.01 ? 3 : 1))}% of the pair's mass.`);
  if (unstable) note.push(`Here L4 and L5 do not hold anything: ${M.nm(p.small)} is too heavy for that (above about 1/26 of the pair).`);
  body.querySelector("#lnLnote").innerHTML = `<p class="note">${note.join(" ")} Physics of two bodies: the other bodies are left out.</p>`;
}
const LAND_C = [[6, 3, 12], [27, 13, 51], [58, 26, 102], [106, 43, 138], [176, 74, 160], [255, 106, 213], [255, 210, 122]];
function figLand(el, p) {
  const s = sizeOf(el), x = canvas(el, s, s), mu = p.mu, Lg = lagrange(mu), ext = 1.55;
  const N = G.low ? 180 : 300, img = x.createImageData(N, N), d = img.data, Phi = new Float64Array(N * N);
  const Ph = (X, Y) => -(1 - mu) / Math.max(Math.hypot(X + mu, Y), 0.02) - mu / Math.max(Math.hypot(X - 1 + mu, Y), 1e-4) - 0.5 * (X * X + Y * Y);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) Phi[j * N + i] = Ph(-ext + 2 * ext * (i + 0.5) / N, ext - 2 * ext * (j + 0.5) / N);
  const vL1 = Ph(Lg.L1, 0), vL3 = Ph(Lg.L3, 0), lo = -2.2, hi = Math.max(vL3 + 0.05, -1.4), pix = 2 * ext / N;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const v = clamp((Phi[j * N + i] - lo) / (hi - lo), 0, 1), z = v * (LAND_C.length - 1), k0 = Math.floor(z), k1 = Math.min(k0 + 1, LAND_C.length - 1), f = z - k0, o = (j * N + i) * 4;
    for (let c = 0; c < 3; c++) d[o + c] = LAND_C[k0][c] + (LAND_C[k1][c] - LAND_C[k0][c]) * f;
    d[o + 3] = 255;
    if (i > 0 && j > 0 && i < N - 1 && j < N - 1) {                 // the line through L1: where the two wells meet
      const gx = (Phi[j * N + i + 1] - Phi[j * N + i - 1]) / (2 * pix), gy = (Phi[(j - 1) * N + i] - Phi[(j + 1) * N + i]) / (2 * pix), gm = Math.hypot(gx, gy) * pix;
      if (Math.abs(Phi[j * N + i] - vL1) < 0.5 * gm) { d[o] = 106; d[o + 1] = 232; d[o + 2] = 255; }
    }
  }
  const off = document.createElement("canvas"); off.width = N; off.height = N; off.getContext("2d").putImageData(img, 0, 0);
  x.imageSmoothingEnabled = true; x.drawImage(off, 0, 0, s, s);
  const P = (X, Y) => [s / 2 + X / ext * s / 2, s / 2 - Y / ext * s / 2];
  const dot = (X, Y, r, c) => { const [a, b] = P(X, Y); x.fillStyle = c; x.beginPath(); x.arc(a, b, r, 0, TAU); x.fill(); };
  dot(-mu, 0, 6, "#ffd27a"); dot(1 - mu, 0, 3.5, "#ffffff");
  const lab = (t, X, Y, dx, dy, c) => { const [a, b] = P(X, Y); x.strokeStyle = c; x.lineWidth = 2; x.beginPath(); x.moveTo(a - 4, b - 4); x.lineTo(a + 4, b + 4); x.moveTo(a + 4, b - 4); x.lineTo(a - 4, b + 4); x.stroke();
    x.font = "600 11px system-ui"; x.textAlign = "center"; const w = x.measureText(t).width + 6; x.fillStyle = "rgba(11,7,22,.8)"; x.fillRect(a + dx - w / 2, b + dy - 10, w, 14); x.fillStyle = c; x.fillText(t, a + dx, b + dy); };
  const st = p.mu > 0.0385 ? "#9d8cc0" : "#6ae8ff";
  lab("L1", Lg.L1, 0, -12, 22, "#6ae8ff"); lab("L2", Lg.L2, 0, 12, 22, "#6ae8ff"); lab("L3", Lg.L3, 0, 0, -12, "#6ae8ff");
  lab("L4", Lg.L45[0], Lg.L45[1], 0, -12, st); lab("L5", Lg.L45[0], -Lg.L45[1], 0, 22, st);
  x.textAlign = "center"; x.font = "11px system-ui"; x.fillStyle = "#ffd27a"; { const [a, b] = P(-mu, 0); x.fillText(M.nm(p.big), a, b + 20); }
  x.fillStyle = "#fff"; { const [a, b] = P(1 - mu, 0); x.fillText(M.nm(p.small), a, b - 14); }
  cap(x, s, `${M.nm(p.big)} and ${M.nm(p.small)}, turning with ${M.nm(p.small)}`, `dark: deep in the well · bright: the ridge · cyan: where the two wells meet`);
}
function figHill(el, p) {
  const s = sizeOf(el), x = canvas(el, s, s), c = s / 2;
  const rH = p.a * Math.cbrt(p.ms / (3 * p.mb)), k = s * 0.4 / rH;
  if (p.k === "binary") {
    x.fillStyle = "#cbbfdc"; x.font = "12.5px system-ui"; x.textAlign = "center";
    const lines = [`${M.nm(p.big)} and ${M.nm(p.small)} go round a common centre`, `every ${fmtP(p.P)}, ${(p.a * AU_LS).toFixed(p.a * AU_LS < 10 ? 2 : 0)} ls apart.`, "", "In this frame both stay still. The cyan line is", "the edge of each one's own room (its Roche lobe):", "matter that crosses it falls to the other."];
    lines.forEach((t, i) => x.fillText(t, c, c - 50 + i * 20)); return;
  }
  x.fillStyle = "rgba(255,106,213,.16)"; x.beginPath(); x.arc(c, c, rH * k, 0, TAU); x.fill();
  x.strokeStyle = "#ff6ad5"; x.lineWidth = 1.4; x.beginPath(); x.arc(c, c, rH * k, 0, TAU); x.stroke();
  x.setLineDash([4, 4]); x.lineWidth = 0.8; x.beginPath(); x.arc(c, c, rH * k / 2, 0, TAU); x.stroke(); x.setLineDash([]);
  x.fillStyle = "#ff6ad5"; x.font = "600 12px system-ui"; x.textAlign = "center"; x.fillText(`Hill sphere of ${M.nm(p.small)} · ${(rH * AU_LS).toFixed(rH * AU_LS < 10 ? 2 : 0)} ls`, c, c - rH * k - 8);
  const moons = (M.kids.get(p.small.bodyId) || []).map(i => M.byId.get(i)).filter(M.orbits).sort((a, b) => a.semiMajorAxis - b.semiMajorAxis);
  let far = 0;
  moons.forEach((m, i) => { const r = m.semiMajorAxis * k; far = Math.max(far, m.semiMajorAxis / rH);
    x.strokeStyle = "#6ae8ff"; x.globalAlpha = 0.8; x.lineWidth = 0.9; x.beginPath(); x.arc(c, c, Math.max(r, 2), 0, TAU); x.stroke(); x.globalAlpha = 1;
    const q = rel(m, G.t), a = Math.atan2(q[1], q[0]); x.fillStyle = "#fff"; x.beginPath(); x.arc(c + r * Math.cos(a), c - r * Math.sin(a), 2.5, 0, TAU); x.fill(); });
  x.fillStyle = "#fff"; x.beginPath(); x.arc(c, c, 4, 0, TAU); x.fill();
  cap(x, s, moons.length ? `${moons.length} moon${moons.length > 1 ? "s" : ""}: the farthest at ${Math.round(far * 100)}% of the Hill sphere` : `${M.nm(p.small)} has no moons`, moons.length ? (far < 0.5 ? "all inside the safe half (dashed)" : "some beyond the safe half (dashed)") : "dashed: the half where moons would stay for good");
}

// ------------------------------------------------------------ Time view
function timeView(body) {
  const T = timeSet(); if (ST.moonOf >= T.withMoons.length) ST.moonOf = 0; if (!(ST.cen < T.cs.length)) ST.cen = 0;
  const sel = (k, list, cur, f) => list.length > 1 ? `<select data-lt="${k}" aria-label="Which">${list.map((x, i) => `<option value="${i}"${i === cur ? " selected" : ""}>${G.esc(f(x))}</option>`).join("")}</select>` : "";
  body.innerHTML = `<div class="lnTwo"><div><div class="lnBar">${sel("c", T.cs, ST.cen, c => `Around ${c.name}`)}</div><div class="lnFig" id="lnT1"></div></div>
    <div><div class="lnBar">${sel("m", T.withMoons, ST.moonOf, b => `${M.nm(b)} and its moons`)}</div><div class="lnFig" id="lnT2"></div></div></div>`;
  body.onchange = e => { const k = e.target.dataset.lt;
    if (k === "m") { ST.moonOf = +e.target.value; figThrough(body.querySelector("#lnT2"), T.withMoons[ST.moonOf]); }
    if (k === "c") { ST.cen = +e.target.value; figTrails(body.querySelector("#lnT1"), T.cs[ST.cen]); } };
  const msg = (el, t) => { const s = sizeOf(el), x = canvas(el, s, Math.round(s * 0.6)); x.fillStyle = "#9d8cc0"; x.font = "12.5px system-ui"; x.textAlign = "center"; x.fillText(t, s / 2, s * 0.3); };
  if (T.cs.length) figTrails(body.querySelector("#lnT1"), T.cs[ST.cen]); else msg(body.querySelector("#lnT1"), "No centre here has two bodies around it.");
  if (T.withMoons.length) figThrough(body.querySelector("#lnT2"), T.withMoons[ST.moonOf]); else msg(body.querySelector("#lnT2"), "No body here has moons.");
}
function figTrails(el, C) {
  const s = sizeOf(el), x = canvas(el, s, s), c = s / 2, span = C.years * 365.25 * DAY, t0 = G.t - span;
  const paths = C.list.map(b => { const n = clamp(Math.round(C.years * 365.25 / b.orbitalPeriod * 300), 300, G.low ? 2500 : 5000), P = new Float64Array(n * 2);
    for (let i = 0; i < n; i++) { const t = t0 + span * i / (n - 1), q = abs(b.bodyId, t), o = abs(C.p, t); P[i * 2] = q[0] - o[0]; P[i * 2 + 1] = q[1] - o[1]; } return { b, P, n }; });
  let ext = 1e-9, mn = Infinity; for (const p of paths) for (let i = 0; i < p.n; i++) { const r = Math.hypot(p.P[i * 2], p.P[i * 2 + 1]); ext = Math.max(ext, r); if (r > 0) mn = Math.min(mn, r); }
  const sq = ext / Math.max(mn, 1e-9) > 30, f = r => sq ? Math.sqrt(r / ext) : r / ext, R = s * 0.44;
  const pt = (X, Y) => { const r = Math.hypot(X, Y), k = r > 0 ? f(r) / r * R : 0; return [c + X * k, c - Y * k]; };
  paths.forEach((p, j) => {
    const col = COL[j % COL.length], seg = Math.max(2, Math.floor(p.n / 40));
    x.lineWidth = 0.9; x.strokeStyle = col;
    for (let i0 = 0; i0 < p.n - 1; i0 += seg) { x.globalAlpha = 0.12 + 0.85 * i0 / p.n; x.beginPath(); for (let i = i0; i <= Math.min(p.n - 1, i0 + seg); i++) { const [a, b] = pt(p.P[i * 2], p.P[i * 2 + 1]); i === i0 ? x.moveTo(a, b) : x.lineTo(a, b); } x.stroke(); }
    x.globalAlpha = 1; const [a, b] = pt(p.P[p.n * 2 - 2], p.P[p.n * 2 - 1]); x.fillStyle = col; x.beginPath(); x.arc(a, b, 3, 0, TAU); x.fill();
    x.font = "600 10.5px system-ui"; x.textAlign = "left"; x.fillText(M.nm(p.b), a + 5, b - 4);
  });
  const cb = M.byId.get(C.p); x.fillStyle = cb && cb.type === "Star" ? "#ffd27a" : "rgba(255,255,255,.5)"; x.beginPath(); x.arc(c, c, cb && cb.type === "Star" ? 5 : 2.5, 0, TAU); x.fill();
  const y = C.years;
  cap(x, s, `Around ${C.name}: ${y >= 1 ? y.toFixed(y < 10 ? 1 : 0) + " years" : Math.round(y * 365.25) + " days"} up to now`, `trails fade with age${sq ? " · distance on a square-root scale" : ""}`);
}
function figThrough(el, pl) {
  const s = sizeOf(el), h = Math.round(s * 0.62), x = canvas(el, s, h);
  const moons = (M.kids.get(pl.bodyId) || []).map(i => M.byId.get(i)).filter(b => M.orbits(b) && b.type !== "Barycentre").sort((a, b) => a.orbitalPeriod - b.orbitalPeriod).slice(0, 8);
  const D = clamp(Math.max(...moons.map(m => m.orbitalPeriod)) * 1.3, 0.5, Math.max(pl.orbitalPeriod / 6, 1)) * DAY, n = 3000, t0 = G.t;
  const p0 = abs(pl.bodyId, t0), p1 = abs(pl.bodyId, t0 + D), ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]), ca = Math.cos(-ang), sa = Math.sin(-ang);
  const rot = q => { const X = q[0] - p0[0], Y = q[1] - p0[1]; return [X * ca - Y * sa, X * sa + Y * ca]; };
  const tracks = [pl, ...moons].map(b => { const P = new Float64Array(n * 2); for (let i = 0; i < n; i++) { const q = rot(abs(b.bodyId, t0 + D * i / (n - 1))); P[i * 2] = q[0]; P[i * 2 + 1] = q[1]; } return P; });
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const P of tracks) for (let i = 0; i < n; i++) { x0 = Math.min(x0, P[i * 2]); x1 = Math.max(x1, P[i * 2]); y0 = Math.min(y0, P[i * 2 + 1]); y1 = Math.max(y1, P[i * 2 + 1]); }
  const padX = 92, k = Math.min((s - padX - 16) / Math.max(x1 - x0, 1e-12), (h - 70) / Math.max(y1 - y0, 1e-12)), oy = h / 2 - 12 - (y0 + y1) / 2 * -k;
  const P = (X, Y) => [10 + (X - x0) * k, oy - Y * k];
  const vP = TAU * pl.semiMajorAxis / pl.orbitalPeriod, labs = [];
  tracks.forEach((T, j) => {
    const col = j ? COL[(j - 1) % COL.length] : "#ffffff"; x.strokeStyle = col; x.lineWidth = j ? 1 : 1.4; x.globalAlpha = j ? 0.95 : 0.7; x.beginPath();
    for (let i = 0; i < n; i++) { const [a, b] = P(T[i * 2], T[i * 2 + 1]); i ? x.lineTo(a, b) : x.moveTo(a, b); } x.stroke(); x.globalAlpha = 1;
    if (j) { const m = moons[j - 1]; labs.push({ t: M.nm(m) + (TAU * m.semiMajorAxis / m.orbitalPeriod / vP > 1 ? " · loops" : ""), y: P(T[n * 2 - 2], T[n * 2 - 1])[1], col }); }
  });
  labs.sort((a, b) => a.y - b.y); let ly = -1e9; const top0 = 14, need = 13;
  for (const l of labs) { l.y = Math.max(l.y, ly + need, top0); ly = l.y; }
  const over = ly - (h - 48); if (over > 0) for (const l of labs) l.y -= over;
  x.font = "600 10.5px system-ui"; x.textAlign = "left"; for (const l of labs) { x.fillStyle = l.col; x.fillText(l.t, s - padX + 4, l.y + 3); }
  { const [a, b] = P(tracks[0][n * 2 - 2], tracks[0][n * 2 - 1]); x.fillStyle = "#fff"; x.beginPath(); x.arc(a, b, 4, 0, TAU); x.fill(); }
  const dd = D / DAY;
  cap(x, s, `${M.nm(pl)} and its moons, ${dd >= 2 ? Math.round(dd) + " days" : (dd * 24).toFixed(0) + " hours"} through space`, `true proportions · ${M.nm(pl)} moves left to right`);
  x.canvas.style.height = h + "px";
}

// test hook: the same tour, rendered faster than real time into a WAV file (used to check the sound before a release)
export async function _offline(fi, secs = 40) {
  model(); const sr = 44100, ctx = new OfflineAudioContext(2, sr * secs, sr), keep = { ...A };
  A.cache = new Map(); A.live = []; A.droneBuf = null; A.offline = true; chain(ctx); A.master.gain.value = 0.49;
  const plan = tourPlan(fi == null ? null : M.fams[fi]), star = [...M.byId.values()].find(b => b.type === "Star"), d = droneStart(star, await droneBuf(star, true), 55, 0);
  let at = 2.5;
  for (const sec of plan) { if (at > secs) break; const vi = voiceInfo(sec), hs = hitsOf(sec, G.t);
    let r = Math.min(...vi.v.map(v => v.hz)) / 55; while (r >= 2) r /= 2; while (r < 1) r *= 2; d.s.playbackRate.setTargetAtTime(r, Math.max(0, at - 1), 0.6);
    for (const h of hs) { const v = vi.v[h.k]; if (at + h.at < secs) hit(render(v.inst, v.hz), at + h.at, v.vel * INST[v.inst].gain * 0.5, v.pan); }
    at += sec.dur + 1.2; }
  droneStop(d, Math.min(at, secs - 3));
  const buf = await ctx.startRendering();
  Object.assign(A, keep); A.offline = false;
  const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length, out = new DataView(new ArrayBuffer(44 + n * 4));
  const w = (o, t) => [...t].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); out.setUint32(4, 36 + n * 4, true); w(8, "WAVEfmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); w(36, "data"); out.setUint32(40, n * 4, true);
  let peak = 0; for (let i = 0; i < n; i++) { peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); out.setInt16(44 + i * 4, clamp(L[i], -1, 1) * 32767, true); out.setInt16(46 + i * 4, clamp(R[i], -1, 1) * 32767, true); }
  return { wav: new Uint8Array(out.buffer), peak, parts: plan.map(p => p.f.label) };
}
