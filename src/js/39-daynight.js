// ------------------------------------------------------------ v0.90 day and night at settlements
// A body that is tidally locked keeps the same face to what it orbits, so where a spot on its surface faces at any
// moment follows from the orbits (which the data gives). For those bodies GRAVITAS works out, for every settlement and
// port on the surface: day or night now, how high the star is, the next sunrise and sunset, how long a day lasts, and
// whether the planet it orbits hangs in its sky. Bodies that spin freely: the data has no rotation phase, so no times.
// How the game numbers longitude on a locked body (which meridian faces the parent, which way is east, which pole is
// north) is our assumption below until it is checked in the game: the panel says so.
const DN = { L0: 0, east: 1, north: 1, checked: false };     // 0° longitude faces the parent; east by the right-hand rule
const DN_SCAN = 480;
const dnLocked = b => !!(b && b.type !== "Star" && b.rotationalPeriodTidallyLocked && b._F && S.parentOf.get(b.bodyId) !== undefined);
// the star that lights the body: the nearest one
function dnStar(b, W) {
  const pb = W.get(b.bodyId); let best = null, bd = Infinity;
  for (const s of S.stars) { const p = W.get(s.bodyId); if (!p) continue; const d = Math.hypot(p.x - pb.x, p.y - pb.y, p.z - pb.z); if (d < bd) { bd = d; best = s; } }
  return best;
}
const _n3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const _dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const _cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// the local up direction at (lat, lon) on a locked body, world frame
function dnUp(b, lat, lon, W) {
  const F = b._F, P = _n3([F[0][2] * DN.north, F[1][2] * DN.north, F[2][2] * DN.north]);
  const pb = W.get(b.bodyId), pp = W.get(S.parentOf.get(b.bodyId)); if (!pb || !pp) return null;
  let e1 = [pp.x - pb.x, pp.y - pb.y, pp.z - pb.z]; const k = _dot(e1, P); e1 = _n3([e1[0] - k * P[0], e1[1] - k * P[1], e1[2] - k * P[2]]);
  const e2 = _cross(P, e1).map(v => v * DN.east), la = lat * DEG, lo = (lon - DN.L0) * DEG;
  return [0, 1, 2].map(i => Math.cos(la) * (Math.cos(lo) * e1[i] + Math.sin(lo) * e2[i]) + Math.sin(la) * P[i]);
}
// height of a body above the horizon at the spot, degrees (the star: its centre; sunrise is when the top edge shows)
function dnAlt(b, up, W, o) {
  const pb = W.get(b.bodyId), po = W.get(o.bodyId); const d = _n3([po.x - pb.x, po.y - pb.y, po.z - pb.z]);
  return Math.asin(Math.max(-1, Math.min(1, _dot(up, d)))) / DEG;
}
// the state at one moment: star height, its half-width, light reaching the body (eclipses), the parent's height
function dnAt(b, st, t, light) {
  const W = worldAt(t), star = dnStar(b, W), up = dnUp(b, st.latitude, st.longitude, W); if (!star || !up) return null;
  const ps = W.get(star.bodyId), pb = W.get(b.bodyId), dS = Math.hypot(ps.x - pb.x, ps.y - pb.y, ps.z - pb.z);
  const half = Math.asin(Math.min(1, star._r / dS)) / DEG, alt = dnAlt(b, up, W, star), lit = light ? starlightWho(b, star, W).vis : 1;
  const par = S.byId.get(S.parentOf.get(b.bodyId)), pAlt = par && par.type !== "Barycentre" && par.type !== "Star" ? dnAlt(b, up, W, par) : null;
  return { t, alt, half, up: alt > -half, lit, star, par, pAlt };
}
// how long one day lasts at the spot: one turn relative to the star (the moon's orbit, seen from the star)
function dnDayLen(b) {
  const par = S.byId.get(S.parentOf.get(b.bodyId)), P1 = Math.abs(b.orbitalPeriod || b.rotationalPeriod || 0);
  let P2 = 0; for (let p = par; p; p = S.byId.get(S.parentOf.get(p.bodyId))) { if (p.type === "Star") break; if (p.orbitalPeriod && p.orbitalPeriod > P1 * 1.01) { P2 = p.orbitalPeriod; break; } }
  if (!P1) return 0; if (!P2 || (par && par.type === "Star")) return P1;   // locked to a star: no sunrise at all (handled below)
  return 1 / Math.abs(1 / P1 - 1 / P2);
}
// the next moment the star's top edge crosses the horizon (rise or set), searched then refined
function dnNext(b, st, t0, span, rising) {
  const N = DN_SCAN, step = span / N; let prev = dnAt(b, st, t0); if (!prev) return null;
  for (let i = 1; i <= N; i++) {
    const t = t0 + i * step, cur = dnAt(b, st, t); if (!cur) return null;
    const a = prev.alt + prev.half, c = cur.alt + cur.half;
    if ((rising ? a <= 0 && c > 0 : a > 0 && c <= 0)) {
      let lo = t - step, hi = t;
      for (let k = 0; k < 22; k++) { const m = (lo + hi) / 2, s = dnAt(b, st, m); const v = s.alt + s.half; if ((v > 0) === rising) hi = m; else lo = m; }
      return hi;
    }
    prev = cur;
  }
  return null;
}
// everything the panels show for one settlement, cached for a minute of game time
function dnInfo(b, st) {
  if (!dnLocked(b) || st.latitude == null || st.longitude == null) return null;
  const key = `${b.bodyId}|${st.latitude}|${st.longitude}|${Math.floor(simTime / 60000)}|${DN.L0}${DN.east}${DN.north}`;
  st._dn = st._dn || {}; if (st._dn.key === key) return st._dn.v;
  const now = dnAt(b, st, simTime, true); if (!now) return null;
  const par = S.byId.get(S.parentOf.get(b.bodyId)), toStar = par && par.type === "Star";
  const day = dnDayLen(b), span = toStar ? 0 : day * 86400000 * 1.05;
  const rise = span ? dnNext(b, st, simTime, span, true) : null, set = span ? dnNext(b, st, simTime, span, false) : null;
  const v = { now, day, toStar, rise, set, always: toStar ? (now.up ? "day" : "night") : (!rise && !set ? (now.up ? "day" : "night") : "") };
  st._dn.key = key; st._dn.v = v; return v;
}
const dnDur = d => d >= 2 ? `${fmt(d, 1)} days` : `${fmt(d * 24, 1)} hours`;
const dnIn = ms => { const m = Math.max(0, Math.round(ms / 60000)); if (m < 90) return untilText(ms); const h = Math.floor(m / 60); return h < 48 ? `in ${h} h ${m % 60} min` : `in ${Math.floor(h / 24)} days ${h % 24} h`; };
const dnWhen = t => `${gameTime(t).slice(0, 16)} game time · ${dnIn(t - simTime)}`;
// the block in the station window and in the Body window's Sky tab
function dnBlock(b, st, compact) {
  if (!b || st.latitude == null) return "";
  if (!dnLocked(b)) return compact ? "" : `<div class="dnb dim"><b>Day and night</b><span>${esc(shortName(b, S.sys.name))} spins freely: the data does not say which way its surface faces at a given moment, so sunrise times here cannot be known.${b.rotationalPeriod ? ` One turn takes ${dnDur(Math.abs(b.rotationalPeriod))}.` : ""}</span></div>`;
  const d = dnInfo(b, st); if (!d) return "";
  const n = d.now, dark = n.up && n.lit < 0.5, state = !n.up ? "Night" : dark ? "Eclipse" : "Day";
  const ico = state === "Day" ? "☀" : state === "Night" ? "☾" : "◐";
  const sun = n.up ? `the star ${fmt(Math.max(0, n.alt), 1)}° above the horizon` : `the star ${fmt(-n.alt, 1)}° below the horizon`;
  const ecl = dark ? ` · ${n.lit < 0.02 ? "fully" : "partly"} hidden by another body` : "";
  const nextEv = d.always ? `<span>Always ${d.always} here: ${d.toStar ? "this side never turns away from the star" : "the star never crosses the horizon"}.</span>`
    : [d.rise && `<span class="dnr" data-ev="rise" data-t="${d.rise}">Sunrise ${esc(dnWhen(d.rise))}</span>`, d.set && `<span class="dnr" data-ev="set" data-t="${d.set}">Sunset ${esc(dnWhen(d.set))}</span>`].filter(Boolean).sort((a, z) => +a.match(/data-t="(\d+)/)[1] - +z.match(/data-t="(\d+)/)[1]).join("");
  const pl = n.par && n.pAlt != null ? `<span>${esc(shortName(n.par, S.sys.name))} in the sky: ${n.pAlt > 0 ? `yes, always ${fmt(n.pAlt, 0)}° high` : "no, it stays below the horizon"}</span>` : "";
  const dl = d.day && !d.toStar ? `<span>One day here lasts ${dnDur(d.day)}</span>` : "";
  return `<div class="dnb ${state.toLowerCase()}"><b>${ico} ${state} now</b><span>${sun}${ecl}</span>${nextEv}${dl}${pl}${DN.checked ? "" : `<em title="How the game numbers longitude on a locked moon (which side faces its planet, which way is east) is assumed here and still to be checked in the game">assumed facing · being checked</em>`}</div>`;
}
// the Sky tab: every settlement on the body
function dnSky(b) {
  const sts = (b.stations || []).filter(st => st.latitude != null);
  if (!sts.length || b.type === "Star") return "";
  if (!dnLocked(b)) return chart("Day and night at the settlements", dnBlock(b, sts[0]));
  return chart("Day and night at the settlements", sts.slice(0, 12).map(st => `<div class="dns" data-st="${esc(st.name)}" data-b="${b.bodyId}"><i>${esc(st.name)}</i>${dnBlock(b, st, true)}</div>`).join(""),
    `Tidally locked: ${esc(shortName(b, S.sys.name))} keeps one face to what it orbits, so the sky at each spot follows from the orbits. Sunrise is when the top edge of the star clears a flat horizon. Eclipses by other bodies are included.`);
}
