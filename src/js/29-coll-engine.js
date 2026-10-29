// ------------------------------------------------------------ v0.95 the collision engine for any system, without the 3D scene
// Two ideas together:
//  - where to look: two bodies around the same parent meet near a conjunction, and conjunctions repeat every synodic
//    period P1·P2/|P1−P2| (the method Canonn's list was made with). So the years ahead are not stepped through,
//    only a window around each conjunction;
//  - what happens there: inside each window GRAVITAS's own true positions and true radii decide (relPos, the same
//    orbit code as the map), so the start, the end and the depth come from the real 3D orbits, eccentric and tilted.
// The first conjunction is found from the true positions too, not from the mean longitudes, so a tilted or
// retrograde orbit cannot shift it. No DOM here: it runs on a raw Spansh dump.
function cxPrep(data) {                         // a light version of build(): bodies, parents, epochs, radii, frames
  const sys = data.system || data, list = (sys.bodies || []).filter(b => b && b.bodyId != null);
  const byId = new Map(), parentOf = new Map(), byName = new Map();
  for (const b of list) byId.set(b.bodyId, b);
  for (const b of list) {
    const chain = (b.parents || []).map(p => Object.values(p)[0]);
    if (chain.length && !parentOf.has(b.bodyId)) parentOf.set(b.bodyId, chain[0]);
    for (let k = 0; k + 1 < chain.length; k++) if (!parentOf.has(chain[k])) parentOf.set(chain[k], chain[k + 1]);
  }
  const ts = b => b.timestamps && b.timestamps.meanAnomaly, allTs = list.map(ts).filter(Boolean).sort();
  for (const b of list) {                       // the same epoch rule as the map (09-model.js)
    let t = ts(b), how = "own";
    if (!t) { const par = parentOf.get(b.bodyId), sib = list.find(o => o !== b && ts(o) && parentOf.get(o.bodyId) === par); if (sib) { t = ts(sib); how = "sibling"; } }
    if (!t && b.updateTime) { t = b.updateTime; how = "update"; }
    if (!t && allTs.length) { t = allTs[allTs.length - 1]; how = "system"; }
    if (!t) { t = sys.date || sys.updateTime || "2014-12-16T00:00:00Z"; how = "none"; }
    b._t0 = Date.parse(t); b._epochHow = how;
    if (b.type !== "Barycentre") b._r = b.type === "Star" ? (b.solarRadius || 0.5) * SUN_R_MM : (b.radius || 1000) / 1000;
    const nm = String(b.name || "");
    byName.set((nm.toLowerCase().startsWith(String(sys.name || "").toLowerCase()) ? nm.slice(String(sys.name).length) : nm).replace(/\s+/g, "").toLowerCase(), b);
  }
  orbitFrames(byId, parentOf);
  return { name: sys.name, id64: sys.id64, byId, parentOf, byName, bodies: list };
}
function cxFind(M, label) { return M.byName.get(String(label).replace(/\s+/g, "").toLowerCase()) || null; }
function cxChain(M, id) { const o = []; let p = M.parentOf.get(id); while (p !== undefined && p !== null) { o.push(p); p = M.parentOf.get(p); } return o; }
function cxPos(M, b, top, t) {
  let x = 0, y = 0, z = 0, n = b;
  while (n && n.bodyId !== top) { const r = relPos(n, t); x += r.x; y += r.y; z += r.z; n = M.byId.get(M.parentOf.get(n.bodyId)); }
  return { x, y, z };
}
// a pair, ready to scan. Why it cannot be timed, if it cannot: "missing" (a body or its orbit is not on Spansh),
// "phase" (no mean anomaly), "epoch" (the mean anomaly has no time of its own), "moon" (one orbits the other),
// "apart" (their orbits never come close enough: they can never meet)
function cxPair(M, A, B) {
  if (!A || !B || A === B || !(A._r > 0) || !(B._r > 0)) return { why: "missing" };
  const ca = cxChain(M, A.bodyId), cb = cxChain(M, B.bodyId);
  if (ca.includes(B.bodyId) || cb.includes(A.bodyId)) return { why: "moon" };
  const top = ca.find(x => cb.includes(x)); if (top === undefined) return { why: "missing" };
  const path = b => { const o = []; for (let n = b; n && n.bodyId !== top; n = M.byId.get(M.parentOf.get(n.bodyId))) o.push(n); return o; };
  const pa = path(A), pb = path(B), all = pa.concat(pb);
  if (all.some(n => n.semiMajorAxis == null || !(n.orbitalPeriod > 0))) return { why: "missing" };
  const rng = ps => { const pc = ps.map(n => { const a = n.semiMajorAxis * AU_LS * LS_MM, e = Math.min(n.orbitalEccentricity || 0, 0.99); return [a * (1 - e), a * (1 + e)]; });
    const [lo, hi] = pc[pc.length - 1], rest = pc.slice(0, -1).reduce((s, p) => s + p[1], 0); return [Math.max(0, lo - rest), hi + rest]; };
  const ra = rng(pa), rb = rng(pb);
  if (Math.max(ra[0] - A._r, rb[0] - B._r) > Math.min(ra[1] + A._r, rb[1] + B._r)) return { why: "apart" };   // their distances from the parent never overlap
  const why = all.some(n => n.meanAnomaly == null) ? "phase" : all.some(n => n._epochHow !== "own") ? "epoch" : null;
  const per = all.map(n => n.orbitalPeriod * 86400e3);
  const P = { M, A, B, top, why, sure: !why, same: pa.length === 1 && pb.length === 1,
    dt: Math.min(7200e3, Math.max(20e3, Math.min(...per) / 240)), ep: Math.max(...all.map(n => n._t0)) };
  P.gap = t => { const a = cxPos(M, A, top, t), b = cxPos(M, B, top, t); return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) - A._r - B._r; };
  P.ang = t => { const a = cxPos(M, A, top, t), b = cxPos(M, B, top, t);                     // angle between the two, seen from the parent
    return Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y + a.z * b.z) / (Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z) || 1)))); };
  if (P.same) {
    const pA = A.orbitalPeriod * 86400e3, pB = B.orbitalPeriod * 86400e3, d = Math.abs(1 / pA - 1 / pB);
    P.syn = d > 0 ? 1 / d : Infinity;
    P.half = Math.min(0.5, (4 * ((A.orbitalEccentricity || 0) + (B.orbitalEccentricity || 0)) + 0.1) / (2 * Math.PI));   // how far a true conjunction can fall from the first one found, one synodic period on (v0.95.1: was half as wide, too narrow for eccentric orbits)
  }
  return P;
}
function cxEdge(P, a, b) { let ga = P.gap(a); for (let k = 0; k < 44 && b - a > 1000; k++) { const m = (a + b) / 2, gm = P.gap(m); if ((gm < 0) === (ga < 0)) { a = m; ga = gm; } else b = m; } return (a + b) / 2; }
function cxMin(P, f, a, b, eps) {               // golden section: where f is smallest between a and b
  const g = 0.381966; let x1 = a + g * (b - a), x2 = b - g * (b - a), f1 = f(x1), f2 = f(x2);
  for (let k = 0; k < 80 && b - a > (eps || 1000); k++) {
    if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = a + g * (b - a); f1 = f(x1); } else { a = x1; x1 = x2; f1 = f2; x2 = b - g * (b - a); f2 = f(x2); }
  }
  const t = (a + b) / 2; return { t, v: f(t) };
}
// step through [t0, t1]; a pass that is already on at t0 is followed back to where it began
function cxScan(P, t0, t1, out) {
  let t = t0, g = P.gap(t0), gp = null, inside = null;
  if (g < 0) { let s = t0, k = 0; while (P.gap(s - P.dt) < 0 && k++ < 20000) s -= P.dt; inside = k > 20000 ? s : cxEdge(P, s - P.dt, s); }
  while (t < t1) {
    const u = t + P.dt, h = P.gap(u);
    if (h < 0 && g >= 0) inside = cxEdge(P, t, u);
    else if (h >= 0 && g < 0 && inside !== null) { out.push(cxEvent(P, inside, cxEdge(P, t, u))); inside = null; }
    else if (h >= 0 && g >= 0 && gp !== null && g < gp && g <= h && g < P.A._r + P.B._r) {   // a short pass between two samples
      const d = cxMin(P, P.gap, t - P.dt, u);
      if (d.v < 0) out.push(cxEvent(P, cxEdge(P, t - P.dt, d.t), cxEdge(P, u, d.t)));
    }
    gp = g; g = h; t = u;
  }
  if (inside !== null) {                          // still on at the end of the window: follow it to its end
    let e = t, k = 0; while (P.gap(e) < 0 && k++ < 20000) e += P.dt;
    out.push(cxEvent(P, inside, k > 20000 ? null : cxEdge(P, e - P.dt, e)));
  }
}
function cxEvent(P, a, b) { const d = cxMin(P, P.gap, a, b === null ? a + P.dt * 4 : b); return { start: a, end: b, deep: d.t, depth: -d.v * 1000 }; }
// the next passes from `from`, up to `max` of them within `days`. Returns { events, how } where how is
// "synodic" (windows around each conjunction), "locked" (the same period: they stay as they are) or "step" (every step)
function cxNext(P, from, days, max) {
  max = max || 3; const t1 = from + days * 86400e3, out = [];
  const done = () => out.filter(e => (e.end === null ? e.start + 1 : e.end) > from).length >= max;
  if (P.same && P.syn > 2e5 * 86400e3) {          // the same period: the gap only repeats each orbit
    const pr = Math.min(P.A.orbitalPeriod, P.B.orbitalPeriod) * 86400e3;
    cxScan(P, from, from + pr * 1.02, out);
    return { events: cxKeep(out, from, max), how: "locked" };
  }
  if (!P.same || P.half >= 0.5 || P.syn < P.dt * 400) {     // nested orbits, very eccentric, or conjunctions every few steps: step through all of it
    const cap = Math.min(t1, from + 1.5e5 * P.dt);
    for (let a = from; a < cap && !done(); a += 2e4 * P.dt) cxScan(P, a, Math.min(cap, a + 2e4 * P.dt), out);
    return { events: cxKeep(out, from, max), how: "step" };
  }
  // the first true conjunction after `from - half a synodic period`: the smallest angle, from the real positions
  const s0 = from - P.syn / 2, n = 720, st = P.syn / n;
  let best = s0, bv = Infinity;
  for (let k = 0; k <= n; k++) { const t = s0 + k * st, v = P.ang(t); if (v < bv) { bv = v; best = t; } }
  let c = cxMin(P, P.ang, best - st, best + st, 1000).t;
  const W = P.syn * P.half, nx = cxMin(P, P.ang, c + P.syn - W, c + P.syn + W, 1000);
  if (nx.v > P.ang(c) + 0.35) {                   // the next conjunction is not one synodic period later (a retrograde orbit): step through
    const cap = Math.min(t1, from + 1.5e5 * P.dt);
    for (let a = from; a < cap && !done(); a += 2e4 * P.dt) cxScan(P, a, Math.min(cap, a + 2e4 * P.dt), out);
    return { events: cxKeep(out, from, max), how: "step" };
  }
  for (let k = 0; c - W < t1 && k < 5000 && !done(); k++, c += P.syn) {
    const a = c - W, b = c + W;
    const loc = cxMin(P, P.ang, a, b, 1000).t;     // this conjunction's true time, so the window follows the eccentric orbits
    cxScan(P, Math.min(a, loc - P.dt * 40), Math.max(b, loc + P.dt * 40), out);
  }
  return { events: cxKeep(out, from, max), how: "synodic" };
}
function cxKeep(ev, from, max) {                  // one event per pass, in time order, not yet over
  ev.sort((x, y) => x.start - y.start);
  const o = [];
  for (const e of ev) { const l = o[o.length - 1]; if (l && Math.abs(l.start - e.start) < 60e3) continue; if ((e.end === null ? e.start + 1 : e.end) > from) o.push(e); }
  return o.slice(0, max);
}
// v0.95.1: how far ahead to look: at least `years`, and two synodic periods for a slow pair (up to 15 years), so a pair that
// meets once every few years is not called "none"
function cxDays(P, years) { const y = years * 365.25, s = P.syn && isFinite(P.syn) ? P.syn / 86400e3 : 0; return Math.max(y, Math.min(15 * 365.25, 2.2 * s)); }
