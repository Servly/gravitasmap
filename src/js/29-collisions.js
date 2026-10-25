// ------------------------------------------------------------ collisions (v0.58)
// Elite Dangerous has no collisions between bodies: when two orbits cross, the bodies pass through each other,
// and commanders go to watch. Here the next such moments are found from true positions and true radii
// (the same relPos as everything else), and "Watch" shows one in True scale.
const COLL_DAYS = 90, COLL_MAX_PAIRS = 40;
let COLL = { sys: null, status: "idle", events: [], job: 0 };

function collChain(id) {                      // ancestors of a body, nearest first
  const out = []; let p = S.parentOf.get(id);
  while (p !== undefined && p !== null) { out.push(p); p = S.parentOf.get(p); }
  return out;
}
function collRange(b, top) {                  // closest and farthest the body can be from ancestor `top`, in Mm
  let lo = 0, hi = 0, n = b, first = true;
  const pieces = [];
  while (n && n.bodyId !== top) {
    const a = (n.semiMajorAxis || 0) * AU_LS * LS_MM, e = Math.min(n.orbitalEccentricity || 0, 0.99);
    pieces.push([a * (1 - e), a * (1 + e)]);
    n = S.byId.get(S.parentOf.get(n.bodyId));
  }
  if (!pieces.length) return null;
  const [tLo, tHi] = pieces[pieces.length - 1], rest = pieces.slice(0, -1).reduce((s, p) => s + p[1], 0);
  lo = Math.max(0, tLo - rest); hi = tHi + rest;
  return [lo, hi];
}
function collPos(b, top, t) {                 // position of b relative to ancestor `top` at time t
  let x = 0, y = 0, z = 0, n = b;
  while (n && n.bodyId !== top) { const r = relPos(n, t); x += r.x; y += r.y; z += r.z; n = S.byId.get(S.parentOf.get(n.bodyId)); }
  return { x, y, z };
}
function collSure(b, top) { for (let n = b; n && n.bodyId !== top; n = S.byId.get(S.parentOf.get(n.bodyId))) if (n._epochHow !== "own" || n.meanAnomaly == null || !(n.orbitalPeriod > 0)) return false; return true; }
function collPairs() {
  const bs = S.bodies.filter(b => b.type !== "Barycentre" && b._r > 0 && b.semiMajorAxis != null && b.orbitalPeriod > 0);
  const pairs = [];
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const A = bs[i], B = bs[j], ca = collChain(A.bodyId), cb = collChain(B.bodyId);
    if (ca.includes(B.bodyId) || cb.includes(A.bodyId)) continue;            // a moon never meets its own planet here
    const top = ca.find(x => cb.includes(x)); if (top === undefined) continue;
    if (!collSure(A, top) || !collSure(B, top)) continue;                     // an orbit without its own timestamp has no reliable phase
    const ra = collRange(A, top), rb = collRange(B, top); if (!ra || !rb) continue;
    if (Math.max(ra[0] - A._r, rb[0] - B._r) > Math.min(ra[1] + A._r, rb[1] + B._r)) continue;   // their distance ranges never meet
    const per = [A, B].flatMap(b => { const o = []; let n = b; while (n && n.bodyId !== top) { if (n.orbitalPeriod > 0) o.push(n.orbitalPeriod); n = S.byId.get(S.parentOf.get(n.bodyId)); } return o; });
    pairs.push({ A, B, top, dt: Math.min(7200e3, Math.max(20e3, Math.min(...per) * 86400e3 / 240)) });
  }
  return pairs.sort((p, q) => p.dt - q.dt).slice(0, COLL_MAX_PAIRS);
}
function collGap(P, t) { const a = collPos(P.A, P.top, t), b = collPos(P.B, P.top, t); return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) - P.A._r - P.B._r; }
function collEdge(P, a, b) {                  // gap changes sign between a and b: find the crossing to the second
  let ga = collGap(P, a);
  for (let k = 0; k < 40 && b - a > 1000; k++) { const m = (a + b) / 2, gm = collGap(P, m); if ((gm < 0) === (ga < 0)) { a = m; ga = gm; } else b = m; }
  return (a + b) / 2;
}
function collDeepest(P, a, b) {               // golden-section search for the smallest gap
  const g = 0.381966; let x1 = a + g * (b - a), x2 = b - g * (b - a), f1 = collGap(P, x1), f2 = collGap(P, x2);
  for (let k = 0; k < 60 && b - a > 1000; k++) {
    if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = a + g * (b - a); f1 = collGap(P, x1); }
    else { a = x1; x1 = x2; f1 = f2; x2 = b - g * (b - a); f2 = collGap(P, x2); }
  }
  const t = (a + b) / 2; return { t, gap: collGap(P, t) };
}
function collScanPair(P, t0, t1, out, budget) {     // resumable: P.t is where the scan got to
  if (P.t === undefined) { P.t = t0; P.g = collGap(P, t0); P.gp = null; P.inside = P.g < 0 ? t0 : null; }
  let n = 0;
  while (P.t < t1 && n++ < budget) {
    const t = P.t + P.dt, g = collGap(P, t);
    if (g < 0 && P.g >= 0) P.inside = collEdge(P, P.t, t);
    else if (g >= 0 && P.g < 0 && P.inside !== null) { const end = collEdge(P, P.t, t); out.push(collEvent(P, P.inside, end)); P.inside = null; }
    else if (g >= 0 && P.g >= 0 && P.gp !== null && P.g < P.gp && P.g <= g && P.g < P.A._r + P.B._r) {   // a close pass between samples may dip below zero
      const d = collDeepest(P, P.t - P.dt, t);
      if (d.gap < 0) out.push(collEvent(P, collEdge(P, P.t - P.dt, d.t), collEdge(P, t, d.t)));
    }
    P.gp = P.g; P.g = g; P.t = t;
  }
  if (P.t >= t1 && P.inside !== null) { out.push(collEvent(P, P.inside, null)); P.inside = null; }
  return P.t >= t1;
}
function collEvent(P, a, b) {
  const d = collDeepest(P, a, b === null ? a + P.dt * 4 : b);
  const old = [P.A, P.B].some(x => x._t0 && Date.now() - x._t0 > 60 * 86400e3);
  return { A: P.A, B: P.B, top: P.top, start: a, end: b, deep: d.t, depth: -d.gap * 1000, old };
}
function collStart() {                         // called when a system is built
  const job = ++COLL.job; const from = Math.min(simTime, Date.now()); COLL = { sys: S.sys.name, status: "scan", events: [], job, from, t0: from - 2 * 3600e3 };
  let pairs;
  try { pairs = collPairs(); } catch (e) { console.warn("collisions", e); COLL.status = "done"; return; }
  if (!pairs.length) { COLL.status = "none"; return; }
  COLL.n = pairs.length; const t1 = COLL.t0 + COLL_DAYS * 86400e3, out = [];
  let i = 0;
  const step = () => {
    if (job !== COLL.job || !S || S.sys.name !== COLL.sys) return;            // a new system was loaded
    const t = performance.now();
    try {
      while (i < pairs.length && performance.now() - t < 12) { if (collScanPair(pairs[i], COLL.t0, t1, out, 400)) i++; }
    } catch (e) { console.warn("collisions", e); i = pairs.length; }
    if (i < pairs.length) { setTimeout(step, 0); return; }
    COLL.events = out.sort((x, y) => x.start - y.start); COLL.status = "done";
    if ($("collBox")) $("collBox").innerHTML = collHtml();
  };
  setTimeout(step, 400);
}
function collGroups(ev) {                     // events that overlap in time and share a body become one row ("all three at once")
  const gs = [];
  for (const e of ev) {
    const g = gs.find(g => (g.end === null || e.start <= g.end) && (e.A === g.A || e.A === g.B || e.B === g.A || e.B === g.B || g.bodies.has(e.A) || g.bodies.has(e.B)));
    if (g) { g.list.push(e); g.bodies.add(e.A); g.bodies.add(e.B); g.end = e.end === null || g.end === null ? null : Math.max(g.end, e.end); }
    else gs.push({ list: [e], A: e.A, B: e.B, start: e.start, end: e.end, bodies: new Set([e.A, e.B]) });
  }
  for (const g of gs) {                      // the window when every pair of the group is touching
    const s = Math.max(...g.list.map(e => e.start)), en = Math.min(...g.list.map(e => e.end ?? Infinity));
    g.all = g.bodies.size > 2 && g.list.length >= g.bodies.size - 1 && s < en ? [s, en] : null;
    g.deep = g.list.reduce((a, e) => e.A._r + e.B._r > a.A._r + a.B._r ? e : a, g.list[0]).deep;     // the biggest pair is the main event
  }
  return gs;
}
function collHtml() {
  if (!COLL.sys || !S || COLL.sys !== S.sys.name || COLL.status === "none") return "";
  const head = `<div class="sec">Bodies passing through each other <span style="color:var(--dim);font-weight:400">· next ${COLL_DAYS} days</span></div>`;
  if (COLL.status === "scan") return head + `<div class="ev dim">Searching the orbits…</div>`;
  const ev = COLL.events.filter(e => (e.end ?? e.deep) > COLL.from - 3600e3);     // v0.58.1: the list stays the same when Watch moves the clock
  if (!ev.length) return "";
  const sys = S.sys.name, nm = b => esc(shortName(b, sys)), hm = t => gameTime(t).slice(11, 16);
  const list = b => { const a = [...b].sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true })).map(nm); return a.length > 2 ? a.slice(0, -1).map(x => `<b>${x}</b>`).join(", ") + ` and <b>${a[a.length - 1]}</b>` : `<b>${a[0]}</b> and <b>${a[1]}</b>`; };
  COLL.groups = collGroups(ev);
  const rows = COLL.groups.slice(0, 8).map((g, i) => {
    const now = g.start <= simTime && (g.end === null || g.end >= simTime), old = g.list.some(e => e.old);
    const day = new Date(g.start).toISOString().slice(5, 10).split("-").reverse().join(".");
    const all = g.all ? ` · <em>all ${g.bodies.size === 3 ? "three" : g.bodies.size} at once ${hm(g.all[0])}–${hm(g.all[1])}</em>` : "";
    return `<div class="coll-r${now ? " now" : ""}${g.all ? " multi" : ""}"><div>${list(g.bodies)}${old ? ` <span class="old" title="The orbit data of these bodies is from ${collDataDate(g)}, more than two months old, so the time is less certain">older data</span>` : ""}<br>
      <span>${now ? "happening now · " : ""}${day} · ${hm(g.start)}–${g.end ? hm(g.end) : "…"} UTC${all || ` · deepest ${hm(g.deep)}`}</span>${g.list.length > 1 ?
        `<br><span class="pairs">${g.list.map(e => `${nm(e.A)} & ${nm(e.B)} ${hm(e.start)}–${e.end ? hm(e.end) : "…"}`).join(" · ")}</span>` : ""}</div>
      <button class="collW" data-g="${i}" title="Jump to this moment and watch it in True scale">Watch</button></div>`;
  }).join("");
  return head + rows + (COLL.groups.length > 8 ? `<div class="ev dim">and ${COLL.groups.length - 8} more</div>` : "") +
    `<div class="ev dim" style="margin-top:4px">The game lets bodies pass through each other. Times use true positions and radii from the Spansh orbit data and are not yet checked against the game.</div>`;
}
function collDataDate(g) {                       // v0.61: the oldest orbit data in the row, for the "older data" tooltip
  const ts = [...g.bodies].map(b => Date.parse((b.timestamps && b.timestamps.meanAnomaly) || b.updateTime || "")).filter(isFinite);
  return ts.length ? new Date(Math.min(...ts)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "an unknown date";
}
function collWatch(g) {
  if (!g || !S) return;
  if (MAPMODE) setMap(false, false);
  if (SURF) exitSurface(false);
  const from = g.all ? g.all[0] : g.start;
  simTime = from - 3 * 60e3; speed = 60; $("speed").value = "60"; LIVE = false;
  setTrueScale(true);
  const bodies = [...g.bodies], cnt = new Map();
  for (const e of g.list) for (const b of [e.A, e.B]) cnt.set(b, (cnt.get(b) || 0) + 1);
  const A = bodies.reduce((a, b) => (cnt.get(b) > cnt.get(a) || (cnt.get(b) === cnt.get(a) && b._r > a._r)) ? b : a, bodies[0]);
  setOrigin(S.world.get(A.bodyId)); focus = A; updateScene();
  const pa = A._obj.position, others = bodies.filter(b => b !== A), st = hostStar(A);
  const pb = others.reduce((c, b) => c.add(b._obj.position), new THREE.Vector3()).multiplyScalar(1 / others.length);
  const toStar = st && st._obj ? st._obj.position.clone().sub(pa).normalize() : new THREE.Vector3(1, 0, 0);
  const axis = pb.clone().sub(pa); if (axis.lengthSq() < 1e-12) axis.set(0, 0, 1); axis.normalize();
  const side = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 1, 0)); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
  if (side.dot(toStar) < 0) side.negate();                          // look from the lit side
  const dir = side.multiplyScalar(0.8).add(toStar.multiplyScalar(0.5)).add(new THREE.Vector3(0, 0.35, 0)).normalize();
  const R = bodies.reduce((s, b) => s + b._r, 0), D = R * 3 + Math.min(pb.distanceTo(pa), R * 5);
  fly = null; focusPrev = pa.clone(); controls.target.copy(pa); camera.position.copy(pa).add(dir.multiplyScalar(D));
  toast(`Watching ${bodies.map(b => shortName(b, S.sys.name)).join(", ")} · 1 min/s · true size`);
  if ($("collBox")) $("collBox").innerHTML = collHtml();
}
setInterval(() => {                                // v0.61: "happening now" follows the clock within seconds; only redrawn when it changes
  const box = $("collBox"); if (COLL.status !== "done" || !box) return;
  const h = collHtml(); if (h !== box._h) { box._h = h; box.innerHTML = h; }
}, 4000);
document.addEventListener("click", ev => {
  const b = ev.target.closest && ev.target.closest(".collW"); if (!b) return;
  ev.preventDefault(); Sound.click(); collWatch((COLL.groups || [])[+b.dataset.g]);
});
