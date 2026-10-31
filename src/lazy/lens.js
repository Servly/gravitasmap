// ------------------------------------------------------------ v0.97 GRAVITAS Lenses, v0.98 System Sonification (loaded only when their window opens)
// Sonification: the orbits of the system as music, a studio, and the patterns two orbits draw (Patterns).
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
// almost nothing. Bars and bells ring with their measured overtones, strings are plucked with the Karplus-Strong
// model, a pad is built from its harmonics. One shared hall, an echo, a chorus, a soft compressor and a limiter.
const A = { ctx: null, master: null, bus: null, send: null, drone: null, cache: new Map(), vol: 0.7, timer: 0, play: null, live: [] };
try { const v = localStorage.getItem("gravitas.lensVol"); if (v !== null) A.vol = clamp(+v, 0, 1); } catch (e) {}
function audio() {
  if (A.ctx) return A.ctx;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}   // an iPhone on silent still plays it (Safari 17+)
  return chain(new AC({ latencyHint: "playback" }));
}
const SIZES = { room: 1.3, hall: 3.4, cathedral: 6.5 };
function chain(ctx) {
  A.ctx = ctx;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
  const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.1;
  A.master = ctx.createGain(); A.master.gain.value = A.vol * A.vol;
  A.bus = ctx.createGain(); A.tone = ctx.createBiquadFilter(); A.tone.type = "lowpass"; A.tone.Q.value = 0.5;   // Warmth
  A.send = ctx.createGain(); A.verb = ctx.createConvolver(); A.verb.buffer = hall(ctx, SIZES[MIX.size] || 3.4); A.verbSize = MIX.size;
  const vhp = ctx.createBiquadFilter(); vhp.type = "highpass"; vhp.frequency.value = 160;
  A.dsend = ctx.createGain(); A.delay = ctx.createDelay(2); A.fb = ctx.createGain(); const dlp = ctx.createBiquadFilter(); dlp.type = "lowpass"; dlp.frequency.value = 3200;   // Echo: each repeat a little darker
  A.csend = ctx.createGain(); const cd = ctx.createDelay(0.05); cd.delayTime.value = 0.018;           // Chorus: a copy that drifts a few milliseconds
  const lfo = ctx.createOscillator(), ld = ctx.createGain(); lfo.frequency.value = 0.55; ld.gain.value = 0.0045; lfo.connect(ld); ld.connect(cd.delayTime); lfo.start();
  A.bus.connect(A.tone); A.bus.connect(A.send); A.send.connect(vhp); vhp.connect(A.verb); A.verb.connect(A.tone);
  A.bus.connect(A.dsend); A.dsend.connect(A.delay); A.delay.connect(dlp); dlp.connect(A.fb); A.fb.connect(A.delay); dlp.connect(A.tone);
  A.bus.connect(A.csend); A.csend.connect(cd); cd.connect(A.tone);
  A.tone.connect(comp); comp.connect(lim); lim.connect(A.master); A.master.connect(ctx.destination);
  A.an = ctx.createAnalyser(); A.an.fftSize = 1024; A.master.connect(A.an); A.anBuf = new Float32Array(1024);   // the master meter
  fx(true);
  return ctx;
}
// the Studio's effects, set at once (or smoothly while playing)
function fx(now) {
  if (!A.ctx) return; const t = A.ctx.currentTime, set = (p, v) => now ? p.setValueAtTime(v, t) : p.setTargetAtTime(v, t, 0.08);
  set(A.send.gain, MIX.rev * 0.95); set(A.dsend.gain, MIX.echo * 0.6); set(A.fb.gain, 0.12 + 0.6 * MIX.efb); set(A.csend.gain, MIX.chorus * 0.8);
  set(A.tone.frequency, 18000 * Math.pow(1400 / 18000, MIX.warm));
  set(A.delay.delayTime, echoTime());
  if (A.verbSize !== MIX.size && !A.offline) { A.verbSize = MIX.size; const c = A.ctx; setTimeout(() => { if (A.ctx === c) A.verb.buffer = hall(c, SIZES[MIX.size] || 3.4); }, 0); }
}
const ECHO = { "1/2": 0.5, "1/4": 0.25, "3/8": 0.375, "1/8": 0.125 };
function echoTime() { const P = A.play, part = P && P.part, fast = part ? part.v[0].sec : 1.2; return clamp(fast * (ECHO[MIX.etime] || 0.5) / MIX.rate, 0.06, 1.9); }
// a hall: early reflections, then a dense tail whose highs die first (each side its own, for width)
function hall(ctx, sec) {
  const sr = ctx.sampleRate, n = Math.floor(sr * sec), b = ctx.createBuffer(2, n, sr), pre = Math.floor(sr * 0.018);
  let seed = 12345; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2147483648 - 1);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c); let lp = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr, k = Math.exp(-t * 6.9 / (sec * 0.9)), cut = 0.92 * Math.exp(-t * 1.6 * 3.4 / sec) + 0.05;
      lp += cut * (rnd() - lp); d[i] = lp * k * (t < 0.08 ? 0.6 + 5 * t : 1);
    }
    for (let r = 0; r < 9; r++) { const at = pre + Math.floor(sr * (0.006 + 0.007 * r + 0.004 * ((r * 7 + c * 3) % 5)) * Math.sqrt(sec / 3.4)); if (at < n) d[at] += (c ? -1 : 1) * 0.5 * Math.pow(0.78, r); }
  }
  return b;
}
// v0.98.1: twelve instruments. modes: [overtone ratio, loudness, ring time in s at A4]; ks: a plucked string; pad: built from harmonics
const INST = {
  marimba: { label: "Marimba", modes: [[1, 1, 1.0], [3.93, 0.32, 0.17], [9.2, 0.1, 0.05]], hard: 0.35, len: 2.2, gain: 0.9 },
  vibes: { label: "Vibraphone", modes: [[1, 1, 3.2], [3.98, 0.22, 0.85], [9.95, 0.05, 0.22]], hard: 0.55, len: 3.6, gain: 0.75 },
  glass: { label: "Glass bars", modes: [[1, 1, 1.9], [2.756, 0.36, 0.75], [5.404, 0.16, 0.34], [8.933, 0.07, 0.17]], hard: 0.7, len: 3, gain: 0.7 },
  celesta: { label: "Celesta", modes: [[1, 1, 2.0], [2, 0.22, 0.8], [3, 0.07, 0.35], [4.16, 0.05, 0.18]], hard: 0.65, len: 3, gain: 0.8 },
  kalimba: { label: "Kalimba", modes: [[1, 1, 1.15], [5.4, 0.22, 0.11], [11.6, 0.07, 0.04]], hard: 0.8, len: 2.2, gain: 0.85 },
  handpan: { label: "Handpan", modes: [[1, 1, 2.6], [2, 0.42, 1.6], [3.0, 0.22, 1.0], [4.02, 0.07, 0.45]], hard: 0.28, len: 4, gain: 0.8, det: 0.0012 },
  epiano: { label: "Electric piano", modes: [[1, 1, 2.4], [2, 0.16, 1.2], [3, 0.05, 0.6], [14.1, 0.11, 0.035]], hard: 0.5, len: 3.6, gain: 0.8 },
  harp: { label: "Harp", ks: { bright: 0.55, pick: 0.13, t60: 1 }, len: 3.4, gain: 1.0 },
  nylon: { label: "Nylon guitar", ks: { bright: 0.3, pick: 0.21, t60: 0.65 }, len: 3, gain: 1.05 },
  bell: { label: "Bell", modes: [[0.5, 0.42, 4.2], [1, 1, 3.2], [1.19, 0.5, 2.6], [1.5, 0.3, 2.1], [2, 0.55, 1.7], [2.51, 0.22, 1.1], [3.01, 0.16, 0.8], [4.17, 0.08, 0.5]], hard: 0.6, len: 5, gain: 0.55 },
  bowl: { label: "Singing bowl", modes: [[1, 1, 6], [2.71, 0.45, 4], [5.1, 0.22, 2.4], [8.2, 0.08, 1.2]], hard: 0.4, len: 7, gain: 0.55, det: 0.0028 },
  pad: { label: "Soft pad", pad: true, len: 5, gain: 0.5 },
};
const GROUPS = [["Mallets", ["marimba", "vibes", "glass", "celesta", "kalimba", "handpan"]], ["Keys and strings", ["epiano", "harp", "nylon"]], ["Bells and pads", ["bell", "bowl", "pad"]]];
// the instrument a body gets: from its kind. Several bodies of one kind take turns among close instruments
function instOf(b) {
  const s = (b.subType || "").toLowerCase();
  if (b.type === "Barycentre") { const m = M.members(b.bodyId)[0]; return m ? instOf(m) : "vibes"; }
  if (b.type === "Star") return /black hole/.test(s) ? "bowl" : /neutron|white dwarf/.test(s) ? "glass" : "bell";
  if (/class i gas/.test(s)) return "marimba"; if (/class ii gas/.test(s)) return "handpan"; if (/class iii/.test(s)) return "vibes";
  if (/class iv/.test(s)) return "epiano"; if (/class v/.test(s)) return "bowl"; if (/life/.test(s)) return "kalimba";
  if (/helium/.test(s)) return "bowl"; if (/water giant/.test(s)) return "pad"; if (/giant/.test(s)) return "marimba";
  if (/earth/.test(s)) return "nylon"; if (/water world/.test(s)) return "harp"; if (/ammonia/.test(s)) return "kalimba";
  if (/rocky ice/.test(s)) return "celesta"; if (/icy/.test(s)) return "glass"; if (/high metal/.test(s)) return "vibes"; if (/metal/.test(s)) return "celesta";
  return "harp";
}
const KIN = { marimba: ["handpan", "kalimba"], vibes: ["celesta", "epiano"], glass: ["celesta", "kalimba"], celesta: ["glass", "vibes"], kalimba: ["marimba", "harp"],
  handpan: ["marimba", "bowl"], epiano: ["vibes", "celesta"], harp: ["nylon", "kalimba"], nylon: ["harp", "kalimba"], bell: ["bowl", "glass"], bowl: ["bell", "pad"], pad: ["bowl", "epiano"] };
function instsFor(keep) { const used = new Set(); return keep.map(b => { const want = chOf(b).inst; if (want) { used.add(want); return want; }
  const base = instOf(b), pick = [base, ...KIN[base]].find(i => !used.has(i)) || base; used.add(pick); return pick; }); }
// one note of an instrument, worked out once (mono)
// sus follows how slow the body is. A fast body plays a short, bright note. A slow one rings longer, softer
// and darker, and the slowest swell in like a held tone
function render(inst, f, sus = 1) {
  sus = Math.round(clamp(sus, 0.6, 3.2) * 10) / 10;
  const key = inst + "|" + f.toFixed(2) + "|" + sus; if (A.cache.has(key)) return A.cache.get(key);
  const ctx = A.ctx, sr = ctx.sampleRate, I = INST[inst], n = Math.floor(sr * Math.min(I.len * Math.max(1, sus * 0.9), 7.5)), buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  if (I.ks) {                                                         // a plucked string (Karplus-Strong, with a tuned delay)
    const K = I.ks, N = sr / f, Ni = Math.floor(N - 0.5), fr = N - 0.5 - Ni, ap = (1 - fr) / (1 + fr), line = new Float32Array(Ni + 1);
    const T60 = clamp(4.5 * Math.pow(220 / f, 0.6) * sus * K.t60, 0.4, 8), rho = Math.pow(10, -3 / (f * T60)), pick = Math.max(2, Math.floor(Ni * K.pick));
    let s = 99; const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2147483648 - 1);
    let lp = 0; for (let i = 0; i <= Ni; i++) { lp += K.bright * (rnd() - lp); line[i] = lp; }
    for (let i = Ni; i >= pick; i--) line[i] -= line[i - pick];          // where the string is plucked
    let w = 0, prev = 0, apx = 0, apy = 0, peak = 1e-9;
    for (let i = 0; i < n; i++) {
      const x = line[w], nx = line[(w + 1) % (Ni + 1)], y = rho * (0.5 * x + 0.5 * nx);
      const o = ap * (y - apy) + apx; apx = y; apy = o;                    // all-pass: the fine tuning
      line[w] = o; w = (w + 1) % (Ni + 1); prev += 0.6 * (x - prev); d[i] = prev; peak = Math.max(peak, Math.abs(prev));
    }
    for (let i = 0; i < n; i++) d[i] /= peak * 1.4;
    if (sus > 1.6) { let lp2 = 0; const k = 0.04 / sus; for (let i = 0; i < n; i++) { lp2 += k * (d[i] - lp2); d[i] = d[i] * (1 - 0.35 * (sus - 1.6) / 1.6) + lp2 * 0.6; } }   // a slow string: rounder
  } else if (I.pad) {                                                  // a pad: its harmonics, two slightly apart, a slow swell
    const ta = clamp(0.25 * sus, 0.15, 0.9), td = 1.6 * sus;
    for (let k = 1; k <= 8; k++) { const fk = f * k; if (fk > sr * 0.4) break; const a = Math.pow(k, -1.35) * (k % 2 ? 1 : 0.6);
      for (const det of [-0.0025, 0.0025]) { const w = TAU * fk * (1 + det) / sr, c = Math.cos(w), s0 = Math.sin(w); let re = Math.cos(k), im = Math.sin(k);
        for (let i = 0; i < n; i++) { d[i] += a * im; const r2 = re * c - im * s0; im = re * s0 + im * c; re = r2; } } }
    let peak = 1e-9; for (let i = 0; i < n; i++) { const t = i / sr; d[i] *= (1 - Math.exp(-t / ta)) * Math.exp(-t / td); peak = Math.max(peak, Math.abs(d[i])); }
    for (let i = 0; i < n; i++) d[i] /= peak * 1.2;
  } else {                                                             // a struck bar or bell: decaying overtones, a soft mallet
    const hard = I.hard * clamp(1.15 - 0.2 * sus, 0.45, 1.1), tScale = Math.pow(440 / f, 0.45) * sus, atk = 0.0015 + 0.004 * (1 - hard) + 0.012 * Math.max(0, sus - 1), dt = I.det || 0.0007;
    for (const [ratio, amp, tau] of I.modes) {
      const fk = f * ratio; if (fk > sr * 0.45) continue;
      const bright = Math.pow(ratio, -(1 - hard) * 0.9), a = amp * bright, T = tau * tScale, dec = Math.exp(-1 / (T * sr));
      for (const det of ratio === 1 && !I.det ? [0] : [-dt, dt]) {    // a mode is two close tones: a slow shimmer
        const w = TAU * fk * (1 + det) / sr, c = Math.cos(w), s0 = Math.sin(w); let re = 1, im = 0, g = a / (ratio === 1 && !I.det ? 1 : 2);
        for (let i = 0; i < n; i++) { d[i] += g * im; const r2 = re * c - im * s0; im = re * s0 + im * c; re = r2; g *= dec; if (g < 1e-5) break; }
      }
    }
    let s = 7; const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2147483648 - 1); let lp = 0;
    const nn = Math.floor(sr * 0.004);
    for (let i = 0; i < n; i++) { const e = 1 - Math.exp(-i / (atk * sr)); d[i] *= e; if (i < nn) { lp += (0.15 + 0.6 * hard) * (rnd() - lp); d[i] += lp * 0.12 * hard * (1 - i / nn); } }
    if (sus > 1.8) {                                                 // the slowest bodies: a held tone swells in under the strike
      const amp = Math.min(0.45, 0.3 * (sus - 1.8)), ta = 0.25 * sus, td = 1.1 * sus, w1 = TAU * f / sr;
      let re = 1, im = 0, re2 = 1, im2 = 0; const c1 = Math.cos(w1), s1 = Math.sin(w1), c2 = Math.cos(2 * w1 * 1.0007), s2 = Math.sin(2 * w1 * 1.0007);
      for (let i = 0; i < n; i++) { const t = i / sr, e = (1 - Math.exp(-t / ta)) * Math.exp(-t / td); d[i] += amp * e * (im + 0.28 * im2);
        let q = re * c1 - im * s1; im = re * s1 + im * c1; re = q; q = re2 * c2 - im2 * s2; im2 = re2 * s2 + im2 * c2; re2 = q; }
    }
    let peak = 1e-9; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i])); for (let i = 0; i < n; i++) d[i] /= peak * 1.2;
  }
  const fo = Math.floor(sr * 0.06); for (let i = 0; i < fo; i++) d[n - 1 - i] *= i / fo;
  A.cache.set(key, buf); if (A.cache.size > 96) A.cache.delete(A.cache.keys().next().value);
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
function hit(buf, at, vel, out) {
  const ctx = A.ctx, s = ctx.createBufferSource(); s.buffer = buf;
  const g = ctx.createGain(); g.gain.value = vel; s.connect(g); g.connect(out || A.bus);
  s.start(at); A.live.push({ s, g, at, end: at + buf.duration });
  const now = A.ctx.currentTime;                                    // too many notes still ringing: the oldest fades out (never a click)
  if (!A.offline && A.live.length > 40) { const o = A.live.find(q => q.at < now && !q.cut); if (o) { o.cut = 1; try { o.g.gain.setTargetAtTime(0, now, 0.04); o.s.stop(now + 0.3); } catch (e) {} } }
}
// a soft drum for two neighbours lining up with their centre: a low thump and a brush, made once
function drumBuf() {
  if (A.drum && A.drum.sampleRate === A.ctx.sampleRate) return A.drum;
  const sr = A.ctx.sampleRate, n = Math.floor(sr * 0.6), b = A.ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
  let ph = 0, s = 3, lp = 0; const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2147483648 - 1);
  for (let i = 0; i < n; i++) { const t = i / sr, f = 44 + 70 * Math.exp(-t * 28); ph += TAU * f / sr;
    lp += 0.25 * (rnd() - lp); d[i] = Math.sin(ph) * Math.exp(-t * 7) * Math.min(1, t * 900) * 0.9 + lp * Math.exp(-t * 45) * 0.35; }
  let pk = 1e-9; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i])); for (let i = 0; i < n; i++) d[i] /= pk * 1.3;
  return (A.drum = b);
}
// ------------------------------------------------------------ v0.98 GRAVITAS System Sonification
// A family of bodies becomes a short piece. The bodies come in one by one, from the fastest. Then the inner ones play
// alone, then the outer ones, then all together. Each body plays its note when it crosses the line below its centre
// (for moons: the line toward the star). The time is the real one, sped up: each part says how much.
// v0.98.1: everything in the Studio changes the music as it plays. Nothing starts again.
const MIX_DEF = { preset: "Space", rev: 0.45, size: "hall", echo: 0.12, efb: 0.35, etime: "1/2", chorus: 0, warm: 0.15, width: 0.8, drone: true, droneVol: 0.8, drum: true, drumVol: 0.6, ring: true, ringVol: 0.5, rate: 1, pitch: "auto", transpose: 0 };
const PRESETS = {
  "Space": {}, "Close": { rev: 0.14, size: "room", echo: 0, chorus: 0, warm: 0.05 }, "Cathedral": { rev: 0.72, size: "cathedral", echo: 0.08, chorus: 0.1, warm: 0.25 },
  "Dreamy": { rev: 0.55, size: "hall", echo: 0.35, efb: 0.5, etime: "3/8", chorus: 0.5, warm: 0.3 }, "Lo-fi": { rev: 0.22, size: "room", echo: 0.15, chorus: 0.35, warm: 0.68, width: 0.5 },
};
let MIX = Object.assign({}, MIX_DEF, { ch: {} });
try { const v = JSON.parse(localStorage.getItem("gravitas.sonMix") || "null"); if (v) { for (const k of Object.keys(MIX_DEF)) if (k in v) MIX[k] = v[k]; } } catch (e) {}
const mixSave = () => { try { const { ch, ...o } = MIX; localStorage.setItem("gravitas.sonMix", JSON.stringify(o)); } catch (e) {} };
const edited = () => Math.abs(MIX.rate - 1) > 0.005 || MIX.pitch === "scale";
const chOf = b => MIX.ch[b.bodyId] || (MIX.ch[b.bodyId] = { vol: 0.8, pan: 0, mute: false, solo: false, inst: null });
const SON = { fast: 0.6, slowMax: 16, tail: 2.6, intro: 2.6 };
// the pitch of each voice: true ratios when they fit the ear, else moved by whole octaves; "scale" also snaps to a pentatonic scale
function tuneOf(keep) {
  const fr = keep.map(b => 1 / b.orbitalPeriod), lo = Math.min(...fr), hi = Math.max(...fr), c = 330 / Math.sqrt(lo * hi), tr = Math.pow(2, MIX.transpose / 12);
  if (MIX.pitch === "auto" && hi / lo <= Math.pow(2, 3.5) && lo * c >= 80 && hi * c <= 1500) return { mode: "true", hz: fr.map(x => x * c * tr) };
  const n = fr.length, rank = fr.map(x => fr.filter(y => y > x).length);          // 0: the fastest
  let hz = fr.map((x, k) => { let h = x * c; while (h < 220) h *= 2; while (h >= 440) h /= 2; return h * Math.pow(2, n > 2 ? Math.round(1 - 2 * rank[k] / (n - 1)) : 0); });   // fast bodies an octave up, slow ones down
  if (MIX.pitch === "scale") { const PS = [0, 3, 5, 7, 10]; hz = hz.map(h => { const m = 12 * Math.log2(h / 220), o = Math.floor(m / 12), r = m - 12 * o;
    let best = PS[0], bd = 99; for (const p of [...PS, 12]) if (Math.abs(p - r) < bd) { bd = Math.abs(p - r); best = p; } return 220 * Math.pow(2, (12 * o + best) / 12); }); }
  return { mode: MIX.pitch === "scale" ? "scale" : "folded", hz: hz.map(h => h * tr) };
}
function refAngle(f, t) {                                          // the line a body plays on: fixed for the planets, toward the star for moons
  if (f.top) return -Math.PI / 2;
  const s = M.star(f.p); if (s == null) return -Math.PI / 2;
  const c = abs(f.p, t), st = abs(s, t); return Math.atan2(st[1] - c[1], st[0] - c[0]);
}
function partOf(f, full, dry) {
  let keep = f.v.slice(), silent = [];
  for (;;) {
    if (keep.length < 2 || new Set(keep.map(b => b.orbitalPeriod.toPrecision(4))).size < 2) return null;
    const s = SON.fast / keep[0].orbitalPeriod;                        // seconds of sound for one day (at the real tempo)
    if (keep[keep.length - 1].orbitalPeriod * s <= SON.slowMax) return dry ? true : build(f, keep, silent, s, full);
    silent.unshift(keep.pop());
  }
}
function build(f, keep, silent, s, full) {
  const tu = tuneOf(keep), n = keep.length, sec = keep.map(b => b.orbitalPeriod * s), inst = instsFor(keep);
  const rs = keep.map(b => Math.log10(Math.max(b.radius || 1, 1))), rlo = Math.min(...rs), rhi = Math.max(...rs);
  const amax = Math.max(...keep.map(b => b.semiMajorAxis)), amin = Math.min(...keep.map(b => b.semiMajorAxis)), gam = amax / amin > 8 ? Math.log(8) / Math.log(amax / amin) : 1;
  const v = keep.map((b, k) => ({ b, k, inst: inst[k], hz: tu.hz[k], sec: sec[k], vel: 0.6 + 0.4 * (rhi > rlo ? (rs[k] - rlo) / (rhi - rlo) : 0.5),
    pan: n > 1 ? -0.7 + 1.4 * k / (n - 1) : 0, col: COL[k % COL.length], sus: clamp(sec[k] / 1.2, 0.6, 3.2), r: Math.pow(b.semiMajorAxis / amax, gam), ring: !!(b.rings && b.rings.length) }));
  const sc = [], all = new Set(v.map(x => x.k)); let t = 0;
  for (let i = 0; i < n; i++) {                                      // the build: one more body at a time, from the fastest
    const w = i < n - 1 ? clamp(2 * sec[i], 2.4, 7) : clamp(2 * sec[n - 1], 6, 12);
    sc.push({ name: i ? `${M.nm(keep[i])} joins` : `${M.nm(keep[0])} begins`, on: new Set(v.slice(0, i + 1).map(x => x.k)), t0: t, t1: t + w, drone: true }); t += w;
  }
  if (full && n >= 4) {
    const h = Math.ceil(n / 2), inn = new Set(v.slice(0, h).map(x => x.k)), out = new Set(v.slice(h).map(x => x.k));
    let w = clamp(3 * sec[h - 1], 6, 10); sc.push({ name: "The inner bodies alone", on: inn, t0: t, t1: t + w, drone: false }); t += w;
    w = clamp(2 * sec[n - 1], 8, 14); sc.push({ name: "The outer bodies alone", on: out, t0: t, t1: t + w, drone: true }); t += w;
    w = clamp(2 * sec[n - 1], 8, 14); sc.push({ name: "All together", on: all, t0: t, t1: t + w, drone: true }); t += w;
  }
  const P = { f, keep, silent, s, tu, v, scenes: sc, dur: t };
  const at = x => { for (const q of sc) if (x >= q.t0 && x < q.t1) return q; return null; };
  P.sceneAt = at;
  P.hits = hitsOf(P, G.t).filter(h => { const q = at(h.at); return q && q.on.has(h.k); });
  P.ups = lineups(P, G.t).filter(h => { const q = at(h.at); return q && q.on.has(h.a) && q.on.has(h.b); });
  return P;
}
// when each body crosses its line: sampled finely, the crossing found between two samples
function hitsOf(P, t0) {
  const span = P.dur / P.s * DAY, out = [], RN = 400, ref = new Float64Array(RN + 1);
  for (let i = 0; i <= RN; i++) ref[i] = refAngle(P.f, t0 + span * i / RN);
  for (let i = 1; i <= RN; i++) { while (ref[i] - ref[i - 1] > Math.PI) ref[i] -= TAU; while (ref[i] - ref[i - 1] < -Math.PI) ref[i] += TAU; }
  const refAt = t => { const u = clamp((t - t0) / span * RN, 0, RN), i = Math.min(RN - 1, Math.floor(u)); return ref[i] + (ref[i + 1] - ref[i]) * (u - i); };
  P.refAt = refAt; P.t0 = t0; P.span = span;
  P.keep.forEach((b, k) => {
    const step = Math.min(b.orbitalPeriod * DAY / 160, span / 200), n = Math.ceil(span / step); let prev = null;
    for (let i = 0; i <= n; i++) {
      const t = t0 + i * step, p = rel(b, t); let d = Math.atan2(p[1], p[0]) - refAt(t); d = ((d + Math.PI) % TAU + TAU) % TAU - Math.PI;
      if (prev !== null && Math.abs(d - prev) < Math.PI / 2 && (prev < 0) !== (d < 0)) { const fr = Math.abs(prev) / (Math.abs(prev) + Math.abs(d)); out.push({ k, at: (i - 1 + fr) * step / DAY * P.s }); }
      prev = d;
    }
  });
  return out.sort((a, b) => a.at - b.at);
}
// neighbours lining up with their centre (a conjunction): when the angle between them passes zero
function lineups(P, t0) {
  const out = [];
  for (let k = 0; k + 1 < P.keep.length; k++) {
    const A1 = P.keep[k], B1 = P.keep[k + 1]; if (Math.abs(A1.orbitalPeriod / B1.orbitalPeriod - 1) < 2e-3) continue;
    const step = Math.min(A1.orbitalPeriod * DAY / 120, P.span / 200), n = Math.ceil(P.span / step); let prev = null;
    for (let i = 0; i <= n; i++) {
      const t = t0 + i * step, a = rel(A1, t), b = rel(B1, t); let d = Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]); d = ((d + Math.PI) % TAU + TAU) % TAU - Math.PI;
      if (prev !== null && Math.abs(d - prev) < Math.PI / 2 && (prev < 0) !== (d < 0)) { const fr = Math.abs(prev) / (Math.abs(prev) + Math.abs(d)); out.push({ a: k, b: k + 1, at: (i - 1 + fr) * step / DAY * P.s }); }
      prev = d;
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
// the parts of the piece: which families, in which order (each part is worked out only when its turn comes)
function sonPlan(onlyFam) {
  if (onlyFam) return partOf(onlyFam, true, true) ? [{ f: onlyFam, full: true }] : [];
  const fams = M.fams.slice().sort((a, b) => (b.top ? 1 : 0) - (a.top ? 1 : 0) || b.v.length - a.v.length), out = [];
  for (const f of fams) { if (partOf(f, !out.length, true)) out.push({ f, full: !out.length }); if (out.length >= 4) break; }
  return out;
}
const built = x => x.p || (x.p = partOf(x.f, x.full));
function sonParts(onlyFam) { return sonPlan(onlyFam).map(built); }
function sonCan() { return M.fams.some(f => partOf(f, false, true)) ? null : "No family here has two bodies with different orbits to play together."; }
function mainStar() { const r = M.byId.get(M.root); return r && r.type === "Star" ? r : [...M.byId.values()].find(b => b.type === "Star") || null; }
// the clock of the piece: piece seconds (sp) run at the Studio's tempo. A tempo change moves only what comes next
const spAt = (P, t) => P.clk.s + (t - P.clk.a) * P.clk.r, atOf = (P, sp) => P.clk.a + (sp - P.clk.s) / P.clk.r;
function setRate(r) {
  MIX.rate = r; mixSave(); const P = A.play;
  if (P) { const t = A.ctx.currentTime; P.clk = { a: t, s: spAt(P, t), r }; }
  fx();
}
// the mixer: one channel per body (volume, mute, solo, place left to right), the drum and the drone have their own
function anySolo() { const P = A.play; return !!P && P.parts.some(x => x.p && x.p.v.some(v => chOf(v.b).solo)); }
function chGain(b) { const c = chOf(b), so = anySolo(); return c.mute || (so && !c.solo) ? 0 : c.vol * c.vol * 1.4; }
function channels(P, part) {
  if (!P.ch) { P.ch = new Map(); P.dg = A.ctx.createGain(); P.dg.gain.value = MIX.drumVol * 1.4; P.dg.connect(A.bus); }
  for (const v of part.v) if (!P.ch.has(v.b.bodyId)) {
    const g = A.ctx.createGain(), p = A.ctx.createStereoPanner ? A.ctx.createStereoPanner() : null; g.gain.value = chGain(v.b);
    if (p) { p.pan.value = clamp(v.pan * MIX.width + chOf(v.b).pan, -1, 1); g.connect(p); p.connect(A.bus); } else g.connect(A.bus);
    P.ch.set(v.b.bodyId, { g, p, pan: v.pan, hit: -9 });
  }
}
function chUpdate() { const P = A.play; if (!P || !P.ch) return; const t = A.ctx.currentTime;
  for (const x of P.parts) if (x.p) for (const v of x.p.v) { const c = P.ch.get(v.b.bodyId); if (c) { c.g.gain.setTargetAtTime(chGain(v.b), t, 0.04); if (c.p) c.p.pan.setTargetAtTime(clamp(c.pan * MIX.width + chOf(v.b).pan, -1, 1), t, 0.04); } }
  P.dg.gain.setTargetAtTime(MIX.drumVol * 1.4, t, 0.04);
  if (P.drone) P.drone.g.gain.setTargetAtTime(P.droneOn && MIX.drone ? 0.16 * MIX.droneVol : 0.0001, t, 0.3); }
// a new instrument, pitch or scale: the notes to come are made again (one at a time) and used as soon as they are ready
function retune() {
  for (const P of [A.play].filter(Boolean)) for (const x of P.parts) if (x.p) { x.p.tu = tuneOf(x.p.keep); x.p.v.forEach(v => { v.hz = x.p.tu.hz[v.k]; }); }
  if (M && M.sonCache && M.sonCache.p && !(A.play && A.play.parts.some(x => x.p === M.sonCache.p))) { const p = M.sonCache.p; p.tu = tuneOf(p.keep); p.v.forEach(v => { v.hz = p.tu.hz[v.k]; }); }
  prerender();
}
function prerender() { const P = A.play; if (!P || !P.part) return; const part = P.part;
  (async () => { for (const v of part.v) { await new Promise(r => setTimeout(r, 0)); if (A.play !== P) return; render(v.inst, v.hz, v.sus); if (v.ring) render("glass", Math.min(v.hz * 4, 3200)); } })(); }
function setInst(b, inst) {
  chOf(b).inst = inst;
  for (const x of (A.play ? A.play.parts : [])) if (x.p) for (const v of x.p.v) if (v.b === b) v.inst = inst;
  if (M.sonCache && M.sonCache.p) for (const v of M.sonCache.p.v) if (v.b === b) v.inst = inst;
  prerender();
}
function note(P, part, h, at) {
  const v = part.v[h.k], c = P.ch.get(v.b.bodyId);
  hit(render(v.inst, v.hz, v.sus), at, v.vel * INST[v.inst].gain * 0.5, c && c.g);
  if (MIX.ring && v.ring) hit(render("glass", Math.min(v.hz * 4, 3200)), at + 0.012, v.vel * 0.2 * MIX.ringVol, c && c.g);   // a ringed body: a little shimmer on top
  if (c) c.hit = at;
}
async function play(onlyFam) {
  const ctx = audio(); if (!ctx) { G.toast("This browser cannot play sound"); return; }
  await ctx.resume(); stop(true);
  const parts = sonPlan(onlyFam); if (!parts.length) return;
  const star = mainStar(), t0 = ctx.currentTime + 0.15;
  const P = { parts, i: -1, spNext: SON.intro, clk: { a: t0, s: 0, r: MIX.rate }, t0, star, vq: [], droneOn: true };
  A.live = []; A.play = P;
  try { G.Sound.setAmbient(false); } catch (e) {}
  nextPart(P);
  (A.droneStar === star && A.droneBuf ? Promise.resolve(A.droneBuf) : droneBuf(star)).then(buf => {
    if (A.play !== P) return; A.droneBuf = buf; A.droneStar = star;
    P.drone = droneStart(star, buf, P.part ? Math.min(...P.part.v.map(v => v.hz)) : 55, Math.max(A.ctx.currentTime + 0.05, t0)); chUpdate(); });
  A.timer = setInterval(sched, 90); sched(); fx(); anim(); sonUi();
}
function nextPart(P) {
  P.i++; const at = atOf(P, P.spNext);
  if (P.i >= P.parts.length) { P.endSp = P.spNext + 3.2; P.droneOn = false; if (P.drone) P.drone.g.gain.setTargetAtTime(0.0001, at, 0.8); return; }
  const part = built(P.parts[P.i]); if (!part) { nextPart(P); return; }
  part.sp0 = P.spNext; part.hi = 0; part.ui = 0; part.si = 0; P.part = part; channels(P, part); prerender();
  if (P.i + 1 < P.parts.length) setTimeout(() => { if (A.play === P) built(P.parts[P.i + 1]); }, 1500);   // the next part, worked out early
  if (P.drone) { let r = Math.min(...part.v.map(v => v.hz)) / 55; while (r >= 2) r /= 2; while (r < 1) r *= 2; P.drone.s.playbackRate.setTargetAtTime(r, Math.max(at - 1, A.ctx.currentTime), 0.6); }
  A.delay.delayTime.setTargetAtTime(echoTime(), Math.max(at - 0.5, A.ctx.currentTime), 0.3);
}
function sched() {
  const P = A.play; if (!P) return;
  const ctx = A.ctx, now = ctx.currentTime, hz = spAt(P, now + 0.6);
  while (P.part && P.i < P.parts.length) {
    const part = P.part, b = part.sp0;
    while (part.si < part.scenes.length && b + part.scenes[part.si].t0 < hz) {   // the drone rests while the inner bodies play alone
      const q = part.scenes[part.si++], at = Math.max(now, atOf(P, b + q.t0)); P.droneOn = q.drone;
      if (P.drone) P.drone.g.gain.setTargetAtTime(q.drone && MIX.drone ? 0.16 * MIX.droneVol : 0.0001, at, 0.7); }
    while (part.hi < part.hits.length && b + part.hits[part.hi].at < hz) {
      const h = part.hits[part.hi++], at = atOf(P, b + h.at); if (at >= now) { note(P, part, h, at); P.vq.push({ at, i: P.i, k: h.k }); } }
    while (part.ui < part.ups.length && b + part.ups[part.ui].at < hz) {
      const h = part.ups[part.ui++], at = atOf(P, b + h.at); if (at >= now && MIX.drum) { hit(drumBuf(), at, 0.42, P.dg); P.vq.push({ at, i: P.i, up: h }); } }
    if (b + part.dur + SON.tail < hz) { P.spNext = b + part.dur + SON.tail; nextPart(P); } else break;
  }
  if (P.endSp && spAt(P, now) > P.endSp) stop();
  A.live = A.live.filter(o => o.end > now && !o.cut);
}
function stop(quiet) {
  clearInterval(A.timer); A.timer = 0;
  const P = A.play; A.play = null;
  if (A.ctx) { const t = A.ctx.currentTime; if (P) droneStop(P.drone, t); for (const o of A.live || []) { try { o.g.gain.setTargetAtTime(0, t, 0.03); o.s.stop(t + 0.2); } catch (e) {} } A.live = []; }
  if (!quiet) { try { G.Sound.setAmbient(!G.map); } catch (e) {} sonUi(); }
}
document.addEventListener("visibilitychange", () => { if (!A.ctx || A.offline) return; if (document.hidden) A.ctx.suspend(); else if (A.play) A.ctx.resume(); });
// ------------------------------------------------------------ drawing helpers
function canvas(el, w, h) {
  const c = el.querySelector("canvas") || el.appendChild(document.createElement("canvas")), dpr = Math.min(devicePixelRatio || 1, G.low ? 1.5 : 2);
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.width = w + "px"; c.style.height = h + "px";
  const x = c.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = BG; x.fillRect(0, 0, w, h); return x;
}
const sizeOf = el => { const w = Math.max(240, Math.floor(el.clientWidth || 300)); return w; };

// ------------------------------------------------------------ the window
// v0.98.1: two tabs. Sonification (Listen, Studio, Patterns) and Lenses (Landscape, Time)
let ROOT = null, ST = { view: "landscape", sub: "listen", pair: 0, seen: 0, land: 0, moonOf: 0, cen: 0, fam: "tour" }, RAF = 0, ARAF = 0, WATCH = 0;
export function mount(el, req) {
  ROOT = el; M = null;
  ST.tab = req && req.tab === "son" ? "son" : "lens"; if (ST.tab !== "son" && A.play) stop();
  if (ST.tab === "son") { ST.view = "sonify"; if (req && req.view === "rhythm") ST.sub = "patterns"; else if (req && req.view === "sonify") ST.sub = "listen"; }
  else ST.view = req && /^(landscape|time)$/.test(req.view) ? req.view : /^(landscape|time)$/.test(ST.view) ? ST.view : "landscape";
  if (req && req.lp && req.lp.length) ST.lp = req.lp;
  if (req && req.lf != null) ST.lf = req.lf;
  clearInterval(WATCH); WATCH = setInterval(() => { if (ROOT && G.S && (!M || M.S !== G.S)) { stop(true); draw(); } }, 1000);
  draw();
}
export function unmount() {
  stop(true); try { G.Sound.setAmbient(!G.map); } catch (e) {}
  cancelAnimationFrame(RAF); cancelAnimationFrame(ARAF); RAF = ARAF = 0; clearInterval(WATCH); WATCH = 0; ROOT = null;
  if (A.ctx) { const c = A.ctx; A.ctx = null; A.cache.clear(); A.droneBuf = null; A.droneStar = null; A.drum = null; c.close().catch(() => {}); }
}
function why() {                                                     // why a lens cannot work here
  if (!M) return { rhythm: "No system is open.", landscape: "No system is open.", time: "No system is open.", sonify: "No system is open." };
  const any = [...M.byId.values()].some(M.orbits);
  return {
    rhythm: !any ? "Nothing in this system orbits anything: there is no rhythm to show." : !pairs().length ? "No two bodies here circle the same centre with different periods." : null,
    landscape: !any ? "Nothing in this system orbits anything." : !landPairs().length ? "The masses needed are missing from the orbit data." : null,
    time: !any ? "Nothing in this system orbits anything: it looks the same at every moment." : !timeSet().cs.length && !timeSet().withMoons.length ? "No centre here has two bodies around it." : null,
    sonify: !any ? "Nothing in this system orbits anything: it has no rhythm to play." : sonCan(),
  };
}
function draw() {
  if (!ROOT) return;
  model();
  if (M && ST.sysS !== M.S) { ST.sysS = M.S; Object.assign(ST, { pair: 0, seen: 0, land: 0, moonOf: 0, cen: 0, fam: "tour" }); MIX.ch = {}; }
  if (M && ST.lf != null) { const i = M.fams.findIndex(f => f.p === ST.lf); if (i >= 0) ST.fam = String(i); ST.lf = null; }
  const W = why();
  if (ST.tab !== "son" && W[ST.view] && !ST.forced) { const ok = ["landscape", "time"].find(k => !W[k]); if (ok) ST.view = ok; }
  const nav = ["landscape", "time"].map(k => `<button type="button" data-lv="${k}" class="${ST.view === k ? "on" : ""}${W[k] ? " off" : ""}"${W[k] ? ` title="${G.esc(W[k])}"` : ""}>${{ landscape: "Landscape", time: "Time" }[k]}</button>`).join("");
  ROOT.innerHTML = `<div class="q">GRAVITAS: ${ST.tab === "son" ? "SYSTEM SONIFICATION" : "LENSES"}${M ? ` · ${G.esc(M.sys)}` : ""}</div>
    <div class="lnTop"><div class="mSub" role="tablist">${ST.tab === "son" ? "" : nav}</div><span class="lnAct"><button type="button" data-la="link" title="Copy a link to this view">Copy link</button></span></div>
    <div id="lnBody"></div><div id="lnText"></div>`;
  ROOT.querySelector(".lnTop").onclick = e => { const b = e.target.closest("[data-lv]"); if (b) { ST.view = b.dataset.lv; ST.forced = true; draw(); return; }
    const a = e.target.closest("[data-la]"); if (a && a.dataset.la === "link") copyLink(a); };
  const body = ROOT.querySelector("#lnBody");
  if (!M) { body.innerHTML = `<p class="note">Open a system first.</p>`; return; }
  if (W[ST.view]) { body.innerHTML = `<p class="lnWhy">${G.esc(W[ST.view])}</p>`; text(); return; }
  if (ST.view === "sonify") sonView(body); else if (ST.view === "landscape") landView(body); else timeView(body);
  text();
}
function text() {
  const t = ROOT && ROOT.querySelector("#lnText"); if (!t) return;
  const key = ST.view === "sonify" ? (ST.sub === "patterns" ? "rhythm" : ST.sub === "studio" ? "studio" : "sonify") : ST.view;
  const T = {
    rhythm: `<div class="q">WHAT PATTERNS SHOW</div><p>Two bodies around the same centre, joined by a line again and again. When one goes round almost exactly p times while the other goes round q times, the lines close into a pattern with p − q petals. That is a resonance: the two meet at the same places, over and over. In the music you hear it as a rhythm that comes back.</p>
      <p><b>Seen from</b> draws the path one body takes across the sky of the other. Each small loop is a time it seems to walk backwards.</p>
      <div class="q">IN THE GAME</div><p>Every crossing of two lines is a moment the two bodies line up. Use it to plan a picture, or to know when a moon will cross your sky.</p>`,
    sonify: `<div class="q">WHAT YOU HEAR</div><p>The orbits of the system, as music. The bodies around one centre come in one by one, from the fastest. Then the inner ones play alone, the outer ones alone, and all together. A system with many families plays them part by part: the planets first, then the moons.</p>
      <p>Each body plays its note when it crosses the line below its centre, marked with a small circle (for moons: the line toward the star, so the star is always below). The rhythm is the real one, sped up: each part says how much. Bodies too slow to play with the others are listed as silent.</p>
      <p>The pitch is each body's own orbit frequency, raised by the same amount for all, so the true ratios are kept. When they spread too far for the ear, each one moves by whole octaves, and the part says so. A soft drum plays when two neighbours line up with their centre: that is in the data too.</p>
      <div class="q">OURS, NOT THE DATA</div><p>The instruments (chosen by the kind of body: gas giants by their class, rocky, icy and metal-rich bodies, water and Earth-like worlds, stars), the star's drone (its colour follows the star's temperature), the shimmer of rings and the effects. Every sound is an instrument model made in your browser. There are no sound files.</p>
      <div class="q">IN THE GAME</div><p>The notes are real moments: a moon passing in front of its star from its planet, two planets lining up. A system that sounds simple and even has bodies in resonance.</p>`,
    studio: `<div class="q">THE STUDIO</div><p>Every change plays at once, while the music goes on. Each body has its own channel: instrument, place left or right, volume, mute (M) and solo (S). The light on each channel shows its notes. The drone, the drum and the ring shimmer have their own channels too.</p>
      <p>Effects: reverb (with the size of the room), echo (timed to the fastest body), chorus, warmth and width. A preset sets them all at once.</p>
      <div class="q">REAL OR EDITED</div><p>The mark next to Play says what you hear. <b>Real rhythm</b>: the system's own timing and the true ratios of its orbits. <b>Edited</b>: you changed the tempo, or put the notes on a musical scale. Instruments, effects and transpose do not change it: they leave the rhythm and the ratios as they are.</p>
      <div class="q">SAVE</div><p>Save the part as a sound file (WAV) with everything you set, or as notes (MIDI) to open in FL Studio, Ableton or any music program.</p>`,
    landscape: `<div class="q">WHAT LANDSCAPE SHOWS</div><p>The pull of two bodies, seen from a frame that turns with the smaller one. Dark is deep in the big body's well. The bright ring is a ridge, where the pull and the turning balance.</p>
      <p>The five Lagrange points are where a third, small body could ride along. L4 and L5 hold their bodies only when the smaller body is light enough (below about 1/26 of the pair): the window says so when they do not.</p>
      <p>The <b>Hill sphere</b> is the room a body rules: a moon inside it stays its moon. Moons are safe within about half of it.</p>
      <div class="q">IN THE GAME</div><p>Elite Dangerous does not pull ships or bodies this way: orbits in the game run on fixed paths, and supercruise slows near bodies by its own rules. This lens shows what the same masses would do in real physics. It tells you which body rules which part of the system, and why a system holds together.</p>`,
    time: `<div class="q">WHAT TIME SHOWS</div><p>Years of motion in one picture. Each trail fades with age. Bodies that share a centre braid around each other.</p>
      <p>On the right, a body and its moons moving through space. A moon only loops back when it goes round its body faster than the body goes round its star. The window marks which ones do.</p>
      <div class="q">IN THE GAME</div><p>The distance between two bodies of a system changes with the years. Here you see when two of them come close and when they are far apart: a shorter trip in supercruise.</p>`,
  };
  t.innerHTML = T[key] + `<p class="note">From the Spansh orbit data, drawn flat. Worked out and played in your browser. Nothing is sent anywhere.</p>`;
}
async function copyLink(btn) {
  let u = G.shareUrl(false) + "&lens=" + (ST.view === "sonify" && ST.sub === "patterns" ? "rhythm" : ST.view);
  if (ST.view === "sonify" && ST.sub !== "patterns" && ST.fam !== "tour" && M.fams[+ST.fam]) u += "&lf=" + M.fams[+ST.fam].p;
  const p = ST.view === "sonify" && ST.sub === "patterns" && pairs()[ST.pair]; if (p) u += "&lp=" + p.A.bodyId + "|" + p.B.bodyId;
  try { await navigator.clipboard.writeText(u); btn.textContent = "Copied"; setTimeout(() => (btn.textContent = "Copy link"), 1800); } catch (e) { prompt("Copy this link:", u); }
}
// ------------------------------------------------------------ Rhythm view
function rhythmView(body) {
  const P = pairs();
  if (ST.lp) { const i = P.findIndex(p => ST.lp.includes(p.A.bodyId) && ST.lp.includes(p.B.bodyId)); if (i >= 0) ST.pair = i; ST.lp = null; }
  if (ST.pair >= P.length) ST.pair = 0;
  const p = P[ST.pair], R = resonances();
  const pl = P.slice(0, 3).concat(ST.pair >= 3 ? [P[ST.pair]] : []);
  body.innerHTML = `<div class="lnGrid">
    <div class="lnFig" id="lnFig"></div>
    <div class="lnSide">
      ${p ? `<div class="q">PATTERNS</div><div class="lnPairs">${pl.map(x => { const i = P.indexOf(x); return `<button type="button" data-pi="${i}" class="${i === ST.pair ? "on" : ""}"><b>${G.esc(M.nm(x.A))} & ${G.esc(M.nm(x.B))}</b><span>${x.fr.p} : ${x.fr.q} · ${x.petals > 0 ? `${x.petals} petal${x.petals > 1 ? "s" : ""}` : "one loop"} · ${G.esc(x.f.label)}</span></button>`; }).join("")}</div>
        ${P.length > 3 ? `<select data-lp="more" aria-label="All pairs"><option value="">All ${P.length} pairs…</option>${P.map((x, i) => `<option value="${i}">${G.esc(M.nm(x.A))} & ${G.esc(M.nm(x.B))} · ${x.fr.p}:${x.fr.q}</option>`).join("")}</select>` : ""}
        <div class="lnSeen"><button type="button" data-lp="seen" class="${ST.seen ? "on" : ""}">${ST.seen ? `Back to the pattern` : `Seen from ${G.esc(M.nm(p.A))}`}</button>${ST.seen ? `<button type="button" data-lp="flip">Seen from ${G.esc(M.nm(ST.seen === 1 ? p.B : p.A))}</button>` : ""}</div>` : `<p class="note">No pattern: no two bodies here share a centre with different periods.</p>`}
      ${R.length ? `<div class="q">RESONANCES</div><div class="lnRes">${R.map(r => `<span class="lnBadge${r.k === "chain" ? " chain" : ""}" title="${r.k === "chain" ? "A chain: each pair is close to a simple ratio" : "Close to a simple ratio"}"><b>${r.ratio}</b> ${G.esc(r.txt)} <i>${fmtErr(r.err)}</i></span>`).join("")}</div>` : ""}
      <div class="lnBtns"><button type="button" data-lp="card">Melody card (picture)</button></div>
    </div></div>`;
  body.onclick = e => {
    const b = e.target.closest("[data-pi]"); if (b) { ST.pair = +b.dataset.pi; ST.seen = 0; pane(); return; }
    const a = e.target.closest("[data-lp]"); if (!a) return; const k = a.dataset.lp;
    if (k === "seen") { ST.seen = ST.seen ? 0 : 1; draw(); }
    else if (k === "flip") { ST.seen = ST.seen === 1 ? 2 : 1; draw(); }
    else if (k === "card") card(a);
  };
  body.onchange = e => { const a = e.target.closest("[data-lp]"); if (!a) return;
    if (a.dataset.lp === "more" && a.value !== "") { ST.pair = +a.value; ST.seen = 0; pane(); } };
  if (p) figRhythm(body.querySelector("#lnFig"), p);
}
const fmtErr = e => e < 1e-4 ? "within 0.01%" : `within ${(e * 100).toFixed(e < 1e-3 ? 2 : 1)}%`;
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
// the melody card: a picture to share, with the pattern, the resonances and where to listen
function card(btn) {
  const p = pairs()[ST.pair], W = 1200, H = 630, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const x = cv.getContext("2d"), gr = x.createRadialGradient(330, 315, 40, 330, 315, 700); gr.addColorStop(0, "#1a0f2e"); gr.addColorStop(1, "#06040c");
  x.fillStyle = gr; x.fillRect(0, 0, W, H);
  if (p) { x.save(); x.translate(40, 25); figRhythm(null, p, x, 580); x.restore(); }
  x.textAlign = "left"; x.fillStyle = "#ff6ad5"; x.font = "700 22px system-ui"; x.fillText("GRAVITAS · SYSTEM SONIFICATION", 660, 92);
  x.fillStyle = "#fff"; x.font = "700 34px system-ui"; wrap(x, `The melody of ${M.sys}`, 660, 142, 500, 40);
  let y = 230; x.font = "15px system-ui"; x.fillStyle = "#cbbfdc";
  if (p) { x.fillStyle = "#6ae8ff"; x.font = "600 17px system-ui"; x.fillText(`${M.nm(p.A)} & ${M.nm(p.B)}`, 660, y); y += 26; x.fillStyle = "#cbbfdc"; x.font = "15px system-ui"; x.fillText(`${p.fr.p} : ${p.fr.q} · ${p.petals > 0 ? p.petals + " petals" : "one loop"} · ratio ${p.r.toFixed(4)}`, 660, y); y += 40; }
  const R = resonances().slice(0, 4);
  if (R.length) { x.fillStyle = "#ffd27a"; x.font = "700 13px system-ui"; x.fillText("RESONANCES", 660, y); y += 26;
    for (const r of R) { x.fillStyle = "#fff"; x.font = "600 16px system-ui"; x.fillText(r.ratio, 660, y); x.fillStyle = "#cbbfdc"; x.font = "15px system-ui"; x.fillText(`${r.txt}  (${fmtErr(r.err)})`, 660 + 90, y); y += 26; } }
  x.fillStyle = "#9d8cc0"; x.font = "14px system-ui"; x.fillText("Listen: gravitasmap.com → Modes → Sonification", 660, H - 70);
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

// ------------------------------------------------------------ the Sonification window: Listen, Studio, Patterns
const STAR_COL = sub => { const s = (sub || "").toLowerCase(); return /black hole/.test(s) ? "#3a2a55" : /neutron|white dwarf|wolf|^o |^b |^a /.test(s) ? "#cfe3ff" : /^f /.test(s) ? "#fff4d8" : /^g /.test(s) ? "#ffe39a" : /^k /.test(s) ? "#ffbf6b" : "#ff9a5c"; };
const badgeHTML = () => `<span class="snBadge${edited() ? " ed" : ""}" title="${edited() ? "You changed the tempo or put the notes on a scale: not the system's own timing or ratios" : "The system's own rhythm (sped up) and the true ratios of its orbits"}">${edited() ? "Edited" : "Real rhythm"}</span>`;
function sonView(body) {
  const why = sonCan(), fams = M.fams.map((f, i) => partOf(f, false, true) ? `<option value="${i}"${ST.fam === String(i) ? " selected" : ""}>${G.esc(f.label)}</option>` : "").join("");
  const sub = (k, l) => `<button type="button" data-sub="${k}" class="${ST.sub === k ? "on" : ""}">${l}</button>`;
  body.innerHTML = `${why ? `<p class="lnWhy">${G.esc(why)}</p>` : `<div class="snTop"><button type="button" class="pri" data-sn="go">${A.play ? "■ Stop" : "▶ Play"}</button>
      <select data-sn="fam" aria-label="What to play"><option value="tour">The whole system, part by part</option>${fams}</select>
      <label class="lnVol">Volume <input type="range" min="0" max="1" step="0.01" value="${A.vol}" data-sn="vol" aria-label="Volume"></label><span id="snBadge">${badgeHTML()}</span></div>`}
    <div class="mSub snSub" role="tablist">${why ? "" : sub("listen", "Listen") + sub("studio", "Studio")}${sub("patterns", "Patterns")}</div><div id="snPane"></div>`;
  if (why && ST.sub !== "patterns") ST.sub = "patterns";
  body.onclick = e => {
    const s = e.target.closest("[data-sub]"); if (s) { ST.sub = s.dataset.sub; draw(); return; }
    const a = e.target.closest("[data-sn]"); if (!a) return; const k = a.dataset.sn, b = a.dataset.b != null ? M.byId.get(+a.dataset.b) : null;
    if (k === "go") { if (A.play) stop(); else play(famSel()); }
    else if (k === "mute" || k === "solo") { const c = chOf(b); c[k] = !c[k]; a.classList.toggle("on", c[k]); chUpdate(); }
    else if (k === "drone" || k === "drum" || k === "ring") { MIX[k] = !MIX[k]; a.classList.toggle("on", MIX[k]); a.textContent = MIX[k] ? "On" : "Off"; mixSave(); chUpdate(); }
    else if (k === "preset") { Object.assign(MIX, pick(MIX_DEF, FX_KEYS), PRESETS[a.dataset.p]); MIX.preset = a.dataset.p; mixSave(); fx(); chUpdate(); mixUi(); }
    else if (k === "reset") { Object.assign(MIX, MIX_DEF); MIX.ch = {}; MIX.preset = "Space"; mixSave(); setRate(1); for (const x of (A.play ? A.play.parts : [])) if (x.p) x.p.v.forEach((v, i) => { v.inst = instsFor(x.p.keep)[i]; }); if (M.sonCache && M.sonCache.p) M.sonCache.p.v.forEach((v, i) => { v.inst = instsFor(M.sonCache.p.keep)[i]; }); retune(); fx(); chUpdate(); badge(); mixUi(); }
    else if (k === "wav") exportWav(a); else if (k === "midi") exportMidi(a);
  };
  body.onchange = e => { const a = e.target.closest("[data-sn]"); if (!a) return; const k = a.dataset.sn;
    if (k === "fam") { ST.fam = a.value; const was = !!A.play; if (was) stop(true); M.sonCache = null; pane(); if (was) play(famSel()); }
    else if (k === "inst") setInst(M.byId.get(+a.dataset.b), a.value);
    else if (k === "pitch") { MIX.pitch = a.value; mixSave(); retune(); badge(); nowUi(); }
    else if (k === "size" || k === "etime") { MIX[k] = a.value; mixSave(); fx(); } };
  body.oninput = e => { const a = e.target.closest("[data-sn]"); if (!a || a.type !== "range") return; const k = a.dataset.sn, v = +a.value;
    if (k === "vol" || k === "mvol") { A.vol = v; if (A.master) A.master.gain.setTargetAtTime(A.vol * A.vol, A.ctx.currentTime, 0.05); try { localStorage.setItem("gravitas.lensVol", A.vol); } catch (x) {} ROOT.querySelectorAll('[data-sn="vol"],[data-sn="mvol"]').forEach(i => { if (i !== a) i.value = v; }); }
    else if (k === "cv") { chOf(M.byId.get(+a.dataset.b)).vol = v; chUpdate(); }
    else if (k === "pan") { chOf(M.byId.get(+a.dataset.b)).pan = v; chUpdate(); }
    else if (k === "rate") { setRate(v); const o = ROOT.querySelector("#stRate"); if (o) o.textContent = `×${v.toFixed(2)}`; badge(); }
    else if (k === "transpose") { MIX.transpose = v; mixSave(); const o = ROOT.querySelector("#stTr"); if (o) o.textContent = (v > 0 ? "+" : "") + v; clearTimeout(retune.t); retune.t = setTimeout(() => { retune(); nowUi(); }, 120); }
    else if (k in MIX) { MIX[k] = v; if (FX_KEYS.includes(k)) { MIX.preset = null; ROOT.querySelectorAll('[data-sn="preset"]').forEach(b => b.classList.remove("on")); } mixSave(); fx(); chUpdate(); } };
  pane();
}
const FX_KEYS = ["rev", "size", "echo", "efb", "etime", "chorus", "warm", "width"];
const pick = (o, ks) => Object.fromEntries(ks.map(k => [k, o[k]]));
const famSel = () => ST.fam === "tour" ? null : M.fams[+ST.fam];
function badge() { const b = ROOT && ROOT.querySelector("#snBadge"); if (b) b.innerHTML = badgeHTML(); const m = ROOT && ROOT.querySelector("#stMode"); if (m) m.innerHTML = modeLine(); }
const modeLine = () => edited() ? `<b class="ed">Edited</b>: ${[Math.abs(MIX.rate - 1) > 0.005 ? `tempo ×${MIX.rate.toFixed(2)}` : "", MIX.pitch === "scale" ? "notes on a scale" : ""].filter(Boolean).join(", ")}. Not the system's own timing or ratios.` : `<b class="ok">Real rhythm</b>: the system's own timing (sped up) and the true ratios of its orbits.`;
function pane() {
  const el = ROOT && ROOT.querySelector("#snPane"); if (!el) return;
  cancelAnimationFrame(RAF);
  if (ST.sub === "patterns") { rhythmView(el); text(); return; }
  if (ST.sub === "studio") el.innerHTML = `<div class="snFig mini" id="snFig"></div><div id="snNow" class="snNow"></div><div id="snMix" class="stu"></div>`;
  else el.innerHTML = `<div class="snFig" id="snFig"></div><div id="snNow" class="snNow"></div>`;
  if (ST.sub === "studio") mixUi();
  if (A.play) anim(); else poster();
  text();
}
// a part to show while nothing plays (the first part of what is chosen), kept until the choice changes
function shownPart() {
  if (A.play && A.play.part) return A.play.part;
  if (!M.sonCache || M.sonCache.key !== ST.fam) { const pl = sonPlan(famSel())[0]; M.sonCache = { key: ST.fam, p: pl ? built(pl) : null }; }
  return M.sonCache.p;
}
const instSel = v => `<select data-sn="inst" data-b="${v.b.bodyId}" aria-label="Instrument of ${G.esc(M.nm(v.b))}">${GROUPS.map(([g, ks]) => `<optgroup label="${g}">${ks.map(k => `<option value="${k}"${k === v.inst ? " selected" : ""}>${INST[k].label}</option>`).join("")}</optgroup>`).join("")}</select>`;
// the Studio: a mixer of channel strips, the effects, the tempo and the pitch. Built once per part, then only its lights move
function mixUi() {
  const el = ROOT && ROOT.querySelector("#snMix"); if (!el) return;
  const part = shownPart(); if (!part) { el.innerHTML = ""; return; }
  const sl = (k, l, v, min = 0, max = 1, st = 0.01) => `<label>${l}<input type="range" min="${min}" max="${max}" step="${st}" value="${v}" data-sn="${k}"></label>`;
  const anyRing = part.v.some(v => v.ring);
  const strip = v => { const c = chOf(v.b); return `<div class="strip" data-b="${v.b.bodyId}" style="--c:${v.col}"><div class="sNm" title="${G.esc(M.nm(v.b))}">${G.esc(M.nm(v.b))}</div><div class="sSub">${fmtP(v.b.orbitalPeriod)} · <span data-note="${v.k}">${noteName(v.hz)}</span></div>
    ${instSel(v)}<input type="range" class="pan" min="-1" max="1" step="0.05" value="${c.pan}" data-sn="pan" data-b="${v.b.bodyId}" aria-label="Left or right" title="Left or right">
    <div class="fad"><div class="meter"><i data-m="${v.b.bodyId}"></i></div><input type="range" class="vfad" min="0" max="1" step="0.01" value="${c.vol}" data-sn="cv" data-b="${v.b.bodyId}" aria-label="Volume of ${G.esc(M.nm(v.b))}"></div>
    <div class="ms"><button type="button" data-sn="mute" data-b="${v.b.bodyId}" class="${c.mute ? "on" : ""}" title="Mute">M</button><button type="button" data-sn="solo" data-b="${v.b.bodyId}" class="${c.solo ? "on" : ""}" title="Solo">S</button></div></div>`; };
  const acc = (k, l, vk, sub) => `<div class="strip acc" style="--c:#9d8cc0"><div class="sNm">${l}</div><div class="sSub">${sub}</div><button type="button" data-sn="${k}" class="tog${MIX[k] ? " on" : ""}">${MIX[k] ? "On" : "Off"}</button>
    <div class="fad"><div class="meter"><i data-m="${k}"></i></div><input type="range" class="vfad" min="0" max="1" step="0.01" value="${MIX[vk]}" data-sn="${vk}" aria-label="${l} volume"></div></div>`;
  el.innerHTML = `<div class="stHead"><div class="stPre"><span>Preset</span>${Object.keys(PRESETS).map(p => `<button type="button" data-sn="preset" data-p="${p}" class="${MIX.preset === p ? "on" : ""}">${p}</button>`).join("")}</div>
      <button type="button" data-sn="reset" class="stReset">Reset</button></div>
    <div class="stBar"><label>Tempo <input type="range" min="0.5" max="2" step="0.05" value="${MIX.rate}" data-sn="rate"> <b id="stRate">×${MIX.rate.toFixed(2)}</b></label>
      <label>Pitch <select data-sn="pitch"><option value="auto"${MIX.pitch === "auto" ? " selected" : ""}>True ratios when they fit</option><option value="octaves"${MIX.pitch === "octaves" ? " selected" : ""}>Octaves folded</option><option value="scale"${MIX.pitch === "scale" ? " selected" : ""}>On a scale (edited)</option></select></label>
      <label>Transpose <input type="range" min="-12" max="12" step="1" value="${MIX.transpose}" data-sn="transpose"> <b id="stTr">${MIX.transpose > 0 ? "+" : ""}${MIX.transpose}</b></label></div>
    <p class="note stMode" id="stMode">${modeLine()}</p>
    <div class="stMix">${part.v.map(strip).join("")}<span class="sep"></span>${acc("drone", "Star drone", "droneVol", "from the star")}${acc("drum", "Line-ups", "drumVol", "drum")}${anyRing ? acc("ring", "Rings", "ringVol", "shimmer") : ""}
      <div class="strip master" style="--c:#ff6ad5"><div class="sNm">Master</div><div class="sSub">all</div><div class="fad"><div class="meter"><i data-m="master"></i></div><input type="range" class="vfad" min="0" max="1" step="0.01" value="${A.vol}" data-sn="mvol" aria-label="Master volume"></div></div></div>
    <div class="stFx">
      <div class="fxc"><b>Reverb</b>${sl("rev", "Amount", MIX.rev)}<label>Room<select data-sn="size">${Object.keys(SIZES).map(z => `<option value="${z}"${z === MIX.size ? " selected" : ""}>${z[0].toUpperCase() + z.slice(1)}</option>`).join("")}</select></label></div>
      <div class="fxc"><b>Echo</b>${sl("echo", "Amount", MIX.echo)}${sl("efb", "Repeats", MIX.efb)}<label>Time<select data-sn="etime">${Object.keys(ECHO).map(z => `<option value="${z}"${z === MIX.etime ? " selected" : ""}>${z} of the fastest orbit</option>`).join("")}</select></label></div>
      <div class="fxc"><b>Chorus</b>${sl("chorus", "Amount", MIX.chorus)}</div>
      <div class="fxc"><b>Warmth</b>${sl("warm", "Amount", MIX.warm)}</div>
      <div class="fxc"><b>Width</b>${sl("width", "Amount", MIX.width)}</div></div>
    <div class="stSave"><button type="button" data-sn="wav">Save sound (WAV)</button><button type="button" data-sn="midi">Save notes (MIDI)</button>
      <span class="note">This part, with all you set. MIDI rounds each note to the nearest semitone.</span></div>`;
}
// the still picture before play: the family on its orbits, where each one plays
function poster() {
  const el = ROOT && ROOT.querySelector("#snFig"); if (!el) return;
  const part = shownPart(); cancelAnimationFrame(ARAF);
  const W = sizeOf(el), H = figH(el, W), x = canvas(el, W, H); x.fillStyle = "#05030a"; x.fillRect(0, 0, W, H);
  if (!part) return;
  drawFamily(x, W, H, part, part.v.map(() => 1), G.t, Math.min(W, H) * 0.42, part.v.map(() => -9), 0, [], [], 1);
  x.textAlign = "center"; x.fillStyle = "rgba(233,221,255,.85)"; x.font = "600 13px system-ui"; x.fillText(`Press play: the melody of ${M.sys}`, W / 2, 22);
  nowUi(null);
}
const figH = (el, W) => el.classList.contains("mini") ? Math.round(Math.min(W * (W < 520 ? 0.6 : 0.34), 300)) : Math.round(Math.min(W * (W < 520 ? 0.9 : 0.62), 480));
function drawFamily(x, W, H, part, lvl, tt, zoom, glow, t, rip, ups, alphaAll) {
  const c = [W / 2, H / 2], ref = part.refAt ? part.refAt(clamp(tt, part.t0, part.t0 + part.span)) : refAngle(part.f, tt);
  const cb = part.f.pb, isStar = cb && cb.type === "Star", sc = STAR_COL(isStar ? cb.subType : "");
  const g = x.createRadialGradient(c[0], c[1], 0, c[0], c[1], 26); g.addColorStop(0, isStar ? sc : "#e9e3f5"); g.addColorStop(0.25, isStar ? sc + "aa" : "#bcb3d0aa"); g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g; x.beginPath(); x.arc(c[0], c[1], 26, 0, TAU); x.fill();
  x.fillStyle = isStar ? sc : "#e9e3f5"; x.beginPath(); x.arc(c[0], c[1], isStar ? 5 : 4, 0, TAU); x.fill();
  for (const v of part.v) {
    const R = v.r * zoom, L = lvl[v.k], gl = Math.max(0, 1 - (t - glow[v.k]) / 0.5) * L;      // L: 0 resting, 1 playing (eased, so bodies fade in and out)
    x.strokeStyle = v.col; x.lineWidth = 1 + gl; x.globalAlpha = (0.07 + 0.33 * L + 0.5 * gl) * alphaAll; x.beginPath(); x.arc(c[0], c[1], R, 0, TAU); x.stroke();
    x.globalAlpha = (0.12 + 0.63 * L) * alphaAll; x.lineWidth = 1; x.beginPath(); x.arc(c[0], c[1] + R, 3.5, 0, TAU); x.stroke();      // where it plays
    const q = rel(v.b, tt), a = Math.atan2(q[1], q[0]) - ref - Math.PI / 2, px = c[0] + R * Math.cos(a), py = c[1] - R * Math.sin(a);
    x.globalAlpha = (0.18 + 0.82 * L) * alphaAll; x.fillStyle = v.col; x.beginPath(); x.arc(px, py, 2.6 + 2.4 * gl, 0, TAU); x.fill();
    if (gl > 0) { x.globalAlpha = 0.22 * gl; x.beginPath(); x.arc(px, py, 7 + 9 * gl, 0, TAU); x.fill(); }
    v._px = px; v._py = py;
  }
  x.globalAlpha = 1;
  for (const r of rip) { const age = (t - r.at) / 0.75; if (age < 0 || age > 1) continue; const v = part.v[r.k];
    x.strokeStyle = v.col; x.globalAlpha = 0.9 * (1 - age); x.lineWidth = 1.4; x.beginPath(); x.arc(c[0], c[1] + v.r * zoom, 3.5 + 20 * Math.sqrt(age), 0, TAU); x.stroke(); }
  for (const u of ups) { const age = (t - u.at) / 0.6; if (age < 0 || age > 1) continue; const b = part.v[u.up.b];
    x.strokeStyle = "#ffffff"; x.globalAlpha = 0.35 * (1 - age); x.lineWidth = 1; x.beginPath(); x.moveTo(c[0], c[1]); x.lineTo(b._px, b._py); x.stroke(); }
  x.globalAlpha = 1;
}
function anim() {
  cancelAnimationFrame(ARAF);
  const el = ROOT && ROOT.querySelector("#snFig"); if (!el || !A.play) return;
  const W = sizeOf(el), H = figH(el, W), x = canvas(el, W, H); let last = 0, lastT = 0, zoom = null, pi = -2, rip = [], ups = [], glow = [], lvl = [], ringT = -9; const lh = new Map();
  const meters = ST.sub === "studio" ? [...ROOT.querySelectorAll("[data-m]")].map(i => ({ i, k: i.dataset.m })) : [];
  const frame = now => {
    const P = A.play; if (!P || !ROOT || !el.isConnected) return;
    ARAF = requestAnimationFrame(frame); if (now - last < 33) return; last = now;
    const t = A.ctx.currentTime, sp = spAt(P, t); x.fillStyle = "#05030a"; x.fillRect(0, 0, W, H);
    const part = P.part;
    if (meters.length) {                                             // the Studio's lights: each channel flashes with its notes and fades
      let rms = 0; if (A.an) { A.an.getFloatTimeDomainData(A.anBuf); for (let i = 0; i < A.anBuf.length; i++) rms += A.anBuf[i] * A.anBuf[i]; rms = Math.sqrt(rms / A.anBuf.length); }
      for (const m of meters) { let v = 0;
        if (m.k === "master") v = clamp(1 + 20 * Math.log10(rms + 1e-6) / 48, 0, 1);
        else if (m.k === "drone") v = P.drone && P.droneOn && MIX.drone ? 0.35 * MIX.droneVol : 0;
        else if (m.k === "drum") { const u = ups[ups.length - 1]; v = u && MIX.drum ? Math.max(0, 1 - (t - u.at) / 0.5) * MIX.drumVol : 0; }
        else if (m.k === "ring") v = MIX.ring ? Math.max(0, 1 - (t - ringT) / 0.6) * MIX.ringVol : 0;
        else { const h = lh.get(+m.k); v = h != null ? Math.max(0, 1 - (t - h) / 0.6) * (chGain(M.byId.get(+m.k)) > 0 ? 1 : 0) : 0; }
        m.i.style.transform = `scaleY(${v.toFixed(3)})`; } }
    if (!part || sp < part.sp0 - 0.05) {
      const k = clamp((t - P.t0) / 1.2, 0, 1); x.globalAlpha = k; x.textAlign = "center";
      x.fillStyle = "#ff6ad5"; x.font = "600 13px system-ui"; x.fillText("GRAVITAS · SYSTEM SONIFICATION", W / 2, H / 2 - 16);
      x.fillStyle = "#fff"; x.font = "600 19px system-ui"; x.fillText(P.i >= P.parts.length ? "" : M.sys, W / 2, H / 2 + 12); x.globalAlpha = 1;
      return;
    }
    if (pi !== P.i) { pi = P.i; rip = []; ups = []; glow = part.v.map(() => -9); lvl = part.v.map(() => 0); zoom = null; lastT = t; nowUi(part); if (ST.sub === "studio") { mixUi(); meters.length = 0; meters.push(...[...ROOT.querySelectorAll("[data-m]")].map(i => ({ i, k: i.dataset.m }))); } }
    while (P.vq.length && P.vq[0].at <= t) { const q = P.vq.shift(); if (q.i !== P.i) continue; if (q.up) ups.push(q); else { glow[q.k] = q.at; rip.push(q); const v = part.v[q.k]; lh.set(v.b.bodyId, q.at); if (v.ring) ringT = q.at; } }
    rip = rip.filter(r => t - r.at < 0.8); ups = ups.filter(u => t - u.at < 0.7);
    const rel0 = sp - part.sp0, sc = part.sceneAt(Math.min(Math.max(rel0, 0), part.dur - 1e-6)) || part.scenes[part.scenes.length - 1], on = sc.on;
    const outR = Math.max(...part.v.filter(v => on.has(v.k)).map(v => v.r)), target = (Math.min(W, H) * 0.44) / outR;
    const dt = Math.max(0, t - lastT); lastT = t;
    zoom = zoom == null ? target : zoom + (target - zoom) * Math.min(1, dt * 2.2);   // the view glides out as bodies join, and in again
    for (const v of part.v) lvl[v.k] += ((on.has(v.k) ? 1 : 0) - lvl[v.k]) * Math.min(1, dt * 2.5);
    const fade = rel0 > part.dur ? clamp(1 - (rel0 - part.dur) / SON.tail, 0, 1) : 1;
    drawFamily(x, W, H, part, lvl, part.t0 + rel0 / part.s * DAY, zoom, glow, t, rip, ups, 0.25 + 0.75 * fade);
    const ti = clamp(1 - (rel0 - 1.2) / 1.6, 0, 1);                   // each part opens with its name, which fades
    if (ti > 0) { x.globalAlpha = ti; x.textAlign = "center"; x.fillStyle = "#fff"; x.font = "600 18px system-ui"; x.fillText(part.f.label, W / 2, H * 0.16); x.fillStyle = "#cbbfdc"; x.font = "12px system-ui"; x.fillText(`1 day = ${fmtS(part.s * MIX.rate)}`, W / 2, H * 0.16 + 20); x.globalAlpha = 1; }
    x.textAlign = "left"; x.fillStyle = "#e9ddff"; x.font = "600 12.5px system-ui"; x.fillText(part.f.label, 12, 20);
    x.fillStyle = "#cbbfdc"; x.font = "11.5px system-ui"; x.fillText(rel0 <= part.dur ? sc.name : "", 12, 37);
    x.textAlign = "right"; x.fillStyle = "#9d8cc0"; x.fillText(`day ${(Math.max(0, rel0) / part.s).toFixed(part.s > 0.05 ? 1 : 0)} · 1 day = ${fmtS(part.s / MIX.rate)}`, W - 12, 20);
    x.fillText(`part ${P.i + 1} of ${P.parts.length}`, W - 12, 37);
  };
  ARAF = requestAnimationFrame(frame);
}
const fmtS = s => s >= 1 ? `${s.toFixed(1)} s` : s >= 0.01 ? `${s.toFixed(2)} s` : `${(s * 1000).toFixed(1)} ms`;
function nowUi(part) {
  const el = ROOT && ROOT.querySelector("#snNow"); if (!el) return;
  part = part || shownPart(); if (!part) { el.innerHTML = ""; return; }
  el.innerHTML = `<div class="lnSec"><b>${G.esc(part.f.label)}</b> <span>1 day = ${fmtS(part.s / MIX.rate)} · ${part.tu.mode === "true" ? "true ratios" : part.tu.mode === "scale" ? "on a scale (edited)" : "octaves folded"}</span></div>
    ${ST.sub === "studio" ? "" : `<div class="lnVoices">${part.v.map(v => `<span><i style="background:${v.col}"></i>${G.esc(M.nm(v.b))} <em>${fmtP(v.b.orbitalPeriod)} · ${noteName(v.hz)} · ${INST[v.inst].label}${v.ring ? " · rings" : ""}</em></span>`).join("")}</div>`}
    ${part.silent.length ? `<p class="note">Too slow to play with the others, silent here: ${part.silent.map(b => G.esc(M.nm(b))).join(", ")}.</p>` : ""}`;
  if (ROOT) part.v.forEach(v => { const n = ROOT.querySelector(`[data-note="${v.k}"]`); if (n) n.textContent = noteName(v.hz); });
}
function sonUi() {
  if (!ROOT || ST.view !== "sonify") return;
  const b = ROOT.querySelector('[data-sn="go"]'); if (b) b.textContent = A.play ? "■ Stop" : "▶ Play";
  if (ST.sub === "patterns") return;
  if (A.play) anim(); else { poster(); if (ST.sub === "studio") mixUi(); }
}
// ------------------------------------------------------------ Save: the part as sound (WAV) or as notes (MIDI)
const dl = (blob, name) => { const u = URL.createObjectURL(blob), l = document.createElement("a"); l.href = u; l.download = name; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); };
const fname = (part, ext) => `GRAVITAS_${M.sys.replace(/[^\w-]+/g, "_")}_${part.f.label.replace(/[^\w-]+/g, "_")}.${ext}`;
async function renderPart(part) {                                     // the same notes, drone, drum and effects, made faster than real time
  const sr = 44100, r = MIX.rate, len = (part.dur + SON.tail) / r + 2, ctx = new OfflineAudioContext(2, Math.ceil(sr * len), sr), keep = { ...A };
  A.cache = new Map(); A.live = []; A.offline = true; A.drum = null; A.verbSize = MIX.size;
  const P = { parts: [{ p: part }], ch: null, part }; A.play = P; chain(ctx); A.master.gain.value = 0.55; channels(P, part); A.delay.delayTime.value = echoTime(); A.play = null;
  const star = mainStar(), dbuf = await droneBuf(star, true), d = droneStart(star, dbuf, Math.min(...part.v.map(v => v.hz)), 0.3), o = 0.6;
  d.g.gain.cancelScheduledValues(0); d.g.gain.setValueAtTime(0.0001, 0); d.g.gain.setTargetAtTime(0.16 * MIX.droneVol, 0.3, 0.8);
  for (const q of part.scenes) d.g.gain.setTargetAtTime(q.drone && MIX.drone ? 0.16 * MIX.droneVol : 0.0001, o + q.t0 / r, 0.7);
  d.g.gain.setTargetAtTime(0.0001, o + part.dur / r, 0.8);
  for (const h of part.hits) note(P, part, h, o + h.at / r);
  if (MIX.drum) for (const u of part.ups) hit(drumBuf(), o + u.at / r, 0.42, P.dg);
  try { return await ctx.startRendering(); } finally { Object.assign(A, keep); A.offline = false; }
}
async function exportWav(btn) {
  const part = shownPart(); if (!part) return; if (A.play) stop();
  btn.disabled = true; btn.textContent = "Making the sound…";
  try {
    const buf = await renderPart(part), L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length, out = new DataView(new ArrayBuffer(44 + n * 4));
    const w = (o, t) => { for (let i = 0; i < t.length; i++) out.setUint8(o + i, t.charCodeAt(i)); };
    w(0, "RIFF"); out.setUint32(4, 36 + n * 4, true); w(8, "WAVEfmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
    out.setUint32(24, 44100, true); out.setUint32(28, 44100 * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); w(36, "data"); out.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) { out.setInt16(44 + i * 4, clamp(L[i], -1, 1) * 32767, true); out.setInt16(46 + i * 4, clamp(R[i], -1, 1) * 32767, true); }
    dl(new Blob([out.buffer], { type: "audio/wav" }), fname(part, "wav")); btn.textContent = "Saved";
  } catch (e) { btn.textContent = "Could not make it here"; }
  setTimeout(() => { btn.disabled = false; btn.textContent = "Save sound (WAV)"; }, 2200);
}
// MIDI: one track per body (its instrument as the nearest General MIDI sound), the drum on channel 10, the drone held under it
const GM = { marimba: 12, vibes: 11, glass: 9, celesta: 8, kalimba: 108, handpan: 114, epiano: 4, harp: 46, nylon: 24, bell: 14, bowl: 112, pad: 89 };
function exportMidi(btn) {
  const part = shownPart(); if (!part) return;
  const r = MIX.rate, TPS = 960, vlq = n => { const b = [n & 127]; while ((n >>= 7)) b.unshift((n & 127) | 128); return b; }, midi = hz => clamp(Math.round(69 + 12 * Math.log2(hz / 440)), 0, 127);
  const track = (evs, name) => { evs.sort((a, b) => a.t - b.t || a.o - b.o); const d = [0, 0xff, 0x03, ...vlq(name.length), ...[...name].map(c => c.charCodeAt(0) & 127)]; let last = 0;
    for (const e of evs) { const tk = Math.max(0, Math.round(e.t / r * TPS)); d.push(...vlq(tk - last), ...e.b); last = tk; }
    d.push(0, 0xff, 0x2f, 0); return [0x4d, 0x54, 0x72, 0x6b, (d.length >>> 24) & 255, (d.length >>> 16) & 255, (d.length >>> 8) & 255, d.length & 255, ...d]; };
  const tracks = [track([{ t: 0, o: 0, b: [0xff, 0x51, 0x03, 0x07, 0xa1, 0x20] }], "GRAVITAS " + M.sys)];   // 120 beats a minute: 960 ticks a second
  const so = part.v.some(v => chOf(v.b).solo);
  part.v.forEach((v, k) => {
    const c = chOf(v.b); if (c.mute || (so && !c.solo)) return;
    const ch = k % 9, hs = part.hits.filter(h => h.k === k).map(h => h.at), evs = [{ t: 0, o: 0, b: [0xc0 | ch, GM[v.inst]] }], m = midi(v.hz), vel = clamp(Math.round((50 + 60 * v.vel) * (0.4 + 0.75 * c.vol)), 1, 127);
    hs.forEach((at, i) => { const end = Math.min(at + 2, i + 1 < hs.length ? hs[i + 1] - 0.01 : at + 2); evs.push({ t: at, o: 1, b: [0x90 | ch, m, vel] }, { t: Math.max(at + 0.08, end), o: 0, b: [0x80 | ch, m, 0] }); });
    tracks.push(track(evs, M.nm(v.b)));
  });
  if (MIX.drum && part.ups.length) tracks.push(track(part.ups.flatMap(u => [{ t: u.at, o: 1, b: [0x99, 36, 80] }, { t: u.at + 0.2, o: 0, b: [0x89, 36, 0] }]), "Line-ups"));
  if (MIX.drone) { const dm = midi(Math.min(...part.v.map(v => v.hz)) / 2), evs = [{ t: 0, o: 0, b: [0xca, 89] }]; let onAt = null;
    for (const q of part.scenes) { if (q.drone && onAt === null) { onAt = q.t0; evs.push({ t: q.t0, o: 1, b: [0x9a, dm, 60] }); } else if (!q.drone && onAt !== null) { evs.push({ t: q.t0, o: 0, b: [0x8a, dm, 0] }); onAt = null; } }
    if (onAt !== null) evs.push({ t: part.dur, o: 0, b: [0x8a, dm, 0] }); tracks.push(track(evs, "Star drone")); }
  const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tracks.length, (480 >> 8) & 255, 480 & 255];
  dl(new Blob([new Uint8Array([...head, ...tracks.flat()])], { type: "audio/midi" }), fname(part, "mid"));
  btn.textContent = "Saved"; setTimeout(() => (btn.textContent = "Save notes (MIDI)"), 1800);
}
// test hooks: one part rendered faster than real time, and the live sound as a stream (used to check the sound before a release)
export async function _offline(fi) {
  model(); const ps = sonParts(fi == null ? null : M.fams[fi]); if (!ps.length) return null;
  const buf = await renderPart(ps[0]), L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length, out = new Int16Array(n * 2); let peak = 0;
  for (let i = 0; i < n; i++) { peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); out[i * 2] = clamp(L[i], -1, 1) * 32767; out[i * 2 + 1] = clamp(R[i], -1, 1) * 32767; }
  return { pcm: new Uint8Array(out.buffer), sr: 44100, peak, part: ps[0].f.label, scenes: ps[0].scenes.map(q => `${q.t0.toFixed(1)} ${q.name}`), hits: ps[0].hits.length, ups: ps[0].ups.length };
}
export function _tap() { if (!A.ctx) return null; const d = A.ctx.createMediaStreamDestination(); A.master.connect(d); return d.stream; }
export function _state() { const P = A.play; return { playing: !!P, i: P && P.i, sp: P && A.ctx ? spAt(P, A.ctx.currentTime) : null, rate: MIX.rate, live: A.live.length, insts: P && P.part ? P.part.v.map(v => v.inst + ":" + v.hz.toFixed(1)) : null }; }
