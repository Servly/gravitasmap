// ---------------------------------------------------- stylised overview
// Display-only lens for the overview: directions and order are true,
// distances are compressed and bodies enlarged so the system is readable.
// All numbers in panels and all lighting maths use the true positions.
const ST_C = 1.25, ST_FAR = 3000, ST_H = 26;
function extentOf(b) {                   // display radius incl. rings; a barycentre takes its widest child
  if (!b) return 0;
  if (b._vis) return b._vis * bodyScale * Math.max(1, b._ringRatio || 1);
  return Math.max(0, ...(S.children.get(b.bodyId) || []).map(c => extentOf(S.byId.get(c))));
}
const coreOf = ls => ls < ST_FAR ? Math.sqrt(ls) : Math.sqrt(ST_FAR) + 12 * Math.log(ls / ST_FAR);
// Moons sharing a parent are spaced so their discs (and rings) can never touch, whatever their orbital angles:
// each is pushed out just enough to clear the sibling inside it. Directions and order stay true.
function computeSpacing() {
  for (const o of S.byId.values()) { o._sOff = 0; o._sD = 0; o._sApo = 0; o._sExt = null; }
  // the whole moon system of a body (its disc, rings and moons) as drawn, so neighbours keep clear of all of it
  const sysExt = o => {
    if (!o) return 0; if (o._sExt != null) return o._sExt;
    let e = extentOf(o);
    for (const id of S.children.get(o.bodyId) || []) { const c = S.byId.get(id); if (c && c.semiMajorAxis != null) e = Math.max(e, c._sApo + sysExt(c)); }
    return (o._sExt = e);
  };
  const layout = pid => {
    const kids = (S.children.get(pid) || []).map(id => S.byId.get(id)).filter(o => o && o.semiMajorAxis != null).sort((a, c) => a.semiMajorAxis - c.semiMajorAxis);
    for (const o of kids) layout(o.bodyId);                       // inner systems first
    const par = S.byId.get(pid), bary = par && par.type === "Barycentre";
    const base = (o, au) => (par && par._vis ? extentOf(par) * 1.35 : 0) + extentOf(o) * 1.35 + 0.2 + ST_C * coreOf(au * AU_LS);
    let prev = null;
    for (const o of kids) {
      const e = Math.min(o.orbitalEccentricity || 0, 0.99), a = o.semiMajorAxis;
      let off = 0;
      if (prev && !bary) {                                         // barycentre partners sit on opposite sides already
        const pe = Math.min(prev.orbitalEccentricity || 0, 0.99), gap = (sysExt(prev) + sysExt(o)) * 1.2 + 0.1;
        if (prev.semiMajorAxis * (1 + pe) < a * (1 - e)) {
          // the true orbits never cross: keep this orbit's closest point clear of the neighbour's farthest point
          off = Math.max(0, prev._sApo + gap - (base(o, a * (1 - e))));
        } else {
          // the true orbits cross (like Pluto and Neptune): the bodies can meet in reality too, so only keep the average distances apart
          off = Math.max(0, prev._sD + gap - base(o, a));
        }
      }
      o._sOff = off; o._sD = base(o, a) + off; o._sApo = base(o, a * (1 + e)) + off;
      prev = o;
    }
    if (bary && kids.length >= 2) {                                // partners face each other across the barycentre: keep their systems apart
      const ext = kids.map(o => sysExt(o)), sumE = ext.reduce((x, y) => x + y, 0) || 1;
      const need = sumE * 1.2 + 0.1, have = kids.reduce((x, o) => x + o._sD * (1 - Math.min(o.orbitalEccentricity || 0, 0.99)), 0);
      if (have < need) kids.forEach((o, i) => { const add = (need - have) * ext[i] / sumE; o._sOff += add; o._sD += add; o._sApo += add; });
    }
  };
  for (const b of S.byId.values()) if (!S.parentOf.has(b.bodyId)) layout(b.bodyId);
  layout(0);
}
let TILT = false;                         // "true tilt" view mode: orbits keep their real inclination
function stylise(rel, parent, self) {    // rel in Mm (true) -> stylised units
  const r = Math.hypot(rel.x, rel.y, rel.z);
  if (r === 0) return { x: 0, y: 0, z: 0 };
  const ls = r / LS_MM, core = ls < ST_FAR ? Math.sqrt(ls) : Math.sqrt(ST_FAR) + 12 * Math.log(ls / ST_FAR);
  // keep clear of the parent's disc/rings AND of the body's own disc/rings, so binary pairs never touch
  const clear = (parent && parent._vis ? extentOf(parent) * 1.35 : 0) + extentOf(self) * 1.35 + 0.2;
  const s = clear + ST_C * core + ((self && self._sOff) || 0), rp = Math.hypot(rel.x, rel.y) || 1;
  if (TILT) return { x: rel.x / r * s, y: rel.y / r * s, z: rel.z / r * s };      // true inclinations: keep the direction in 3D
  return { x: rel.x / rp * s, y: rel.y / rp * s, z: 0 };
}
function surfaceY(G, x, z) {
  let y = 0;
  for (let i = 0; i < G.mat.uniforms.uCount.value; i++) { const w = G.wells[i], dx = x - w.x, dz = z - w.y; y -= w.z / Math.sqrt(1 + (dx * dx + dz * dz) / (w.w * w.w)); }
  return y;
}
function computeDisp(t) {
  const D = S.disp; D.clear();
  const get = id => {
    if (D.has(id)) return D.get(id);
    const par = S.parentOf.get(id); let p;
    if (id === 0 || par === undefined) p = { x: 0, y: 0, z: 0 };
    else { const pp = get(par), r = stylise(relPos(S.byId.get(id), t), S.byId.get(par), S.byId.get(id)); p = { x: pp.x + r.x, y: pp.y + r.y, z: pp.z + r.z }; }
    D.set(id, p); return p;
  };
  for (const b of S.bodies) get(b.bodyId);
  for (const o of S.orbits) get(o.parent);
}

