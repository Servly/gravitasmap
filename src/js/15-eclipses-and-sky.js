function eclipseEnd(b, star, level = 0.98) {
  const lit = t => starlightWho(b, star, worldAt(t)).vis >= level;
  const P = (b.orbitalPeriod || 1) * 86400000, step = Math.min(Math.max(P / 720, 20000), 600000), lim = simTime + 3 * 86400000;
  let a = simTime, t = simTime + step;
  for (; t <= lim; a = t, t += step) if (lit(t)) break;
  if (t > lim) return null;
  for (let i = 0; i < 20 && t - a > 2000; i++) { const m = (a + t) / 2; if (lit(m)) t = m; else a = m; }
  return t;
}
function untilText(ms) { const m = Math.max(0, Math.round(ms / 60000)); return m < 1 ? "in under a minute" : m < 90 ? `in ${m} min` : `in ${Math.floor(m / 60)} h ${m % 60} min`; }
function starlightWho(b, star, W) {
  const pb = W.get(b.bodyId), ps = W.get(star.bodyId);
  const L = { x: ps.x - pb.x, y: ps.y - pb.y, z: ps.z - pb.z }, dL = Math.hypot(L.x, L.y, L.z), aS = Math.asin(Math.min(star._r / dL, 1));
  let vis = 1, by = null, best = 0, bSep = 0, bAO = 0;
  for (const o of S.bodies) {
    if (o === b || o === star) continue;
    const po = W.get(o.bodyId), v = { x: po.x - pb.x, y: po.y - pb.y, z: po.z - pb.z }, dO = Math.hypot(v.x, v.y, v.z);
    const dp = v.x * L.x + v.y * L.y + v.z * L.z;
    if (dO >= dL || dp <= 0) continue;
    const aO = Math.asin(Math.min(o._r / dO, 1));
    const sep = Math.atan2(Math.hypot(v.y * L.z - v.z * L.y, v.z * L.x - v.x * L.z, v.x * L.y - v.y * L.x), dp);
    const c = discCoverJS(aS, aO, sep);
    if (c > best) { best = c; by = o; bSep = sep; bAO = aO; }
    vis *= 1 - c;
  }
  return { vis, by, aS, aO: bAO, sep: bSep };
}
// sample starlight over a window and cut it into eclipse events (with the occluding body)
function eclipseScan(b, star, spanDays, N) {
  const xs = [], ys = [], who = [];
  for (let i = 0; i < N; i++) {
    const t = simTime + (i / (N - 1)) * spanDays * 86400000, w = starlightWho(b, star, worldAt(t));
    xs.push(i / (N - 1) * spanDays); ys.push(w.vis * 100); who.push(w);
  }
  const events = []; let a = -1;
  for (let i = 0; i < N; i++) {
    if (ys[i] < 99.5 && a < 0) a = i;
    if (a >= 0 && (ys[i] >= 99.5 || i === N - 1)) {
      let m = a; for (let j = a; j <= i; j++) if (ys[j] < ys[m]) m = j;
      events.push({ a, z: i, m, minV: ys[m], w: who[m], t: simTime + xs[m] * 86400000, dur: (xs[i] - xs[a]) * 24 });
      a = -1;
    }
  }
  return { xs, ys, who, events };
}
const gt16 = ms => gameTime(ms).slice(0, 16);
const nm = o => o ? esc(shortName(o, S.sys.name)) : "?";
const fmtAng = a => a >= 1 ? `${fmt(a, 2)}°` : a * 60 >= 1 ? `${fmt(a * 60, 1)}′` : `${fmt(a * 3600, 1)}″`;

// --- what an eclipse looks like from the body, at maximum (true angular sizes and offset)
function eclipsePreview(b) {
  if (b.type === "Star") return "";
  const st = hostStar(b), P = b.orbitalPeriod || 1, span = Math.min(Math.max(P * 2, 2), 45);
  const sc = eclipseScan(b, st, span, Math.round(Math.min(2500, Math.max(400, span * 24 * 3))));
  if (!sc.events.length) return chart("Next eclipse, as seen from the surface", `<div class="ev dim">No eclipse of ${nm(st)} in the next ${fmt(span, 0)} days.</div>`);
  const cards = sc.events.slice(0, 3).map((e, k) => {
    const { aS, aO, sep, by } = e.w, W = 110, H = 110, cx = W / 2, cy = H / 2;
    const unit = Math.max(aS, Math.min(aO, aS * 6)) * 1.15, px = (W / 2 - 4) / unit;     // star kept readable; a huge occluder shows its limb
    const rS = aS * px, rO = aO * px, ox = cx + sep * px, gid = `ep${b.bodyId}_${k}`;
    const oc = by && by.type !== "Star" ? palette(by)[0] : [40, 40, 40];
    const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;border-radius:8px;background:#05030b">
      <defs><radialGradient id="${gid}"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><clipPath id="${gid}c"><rect width="${W}" height="${H}"/></clipPath></defs>
      <g clip-path="url(#${gid}c)"><circle cx="${cx}" cy="${cy}" r="${rS * 2.2}" fill="url(#${gid})" opacity="${(0.25 + 0.5 * e.minV / 100).toFixed(2)}"/>
      <circle cx="${cx}" cy="${cy}" r="${rS}" fill="${hex(starColor(st))}"/>
      <circle cx="${ox}" cy="${cy}" r="${rO}" fill="rgb(${oc.map(v => v * 0.12 | 0)})" stroke="rgba(255,255,255,.12)"/>${e.minV < 2 ? `<circle cx="${cx}" cy="${cy}" r="${rS}" fill="none" stroke="#ffcf7a" stroke-opacity=".6" stroke-dasharray="2 2"/><text x="${cx}" y="${cy + rS + 11}" fill="#ffcf7a" fill-opacity=".7" font-size="8" text-anchor="middle">star hidden</text>` : ""}</g></svg>`;
    return `<div class="ecard"${tipAttr(`${nm(by)} covers ${fmt(100 - e.minV, 0)}% of ${nm(st)} · star ${fmtAng(aS * 2 / DEG)} wide, ${nm(by)} ${fmtAng(aO * 2 / DEG)} wide`)}>${svg}
      <b>${gt16(e.t)}</b><span>by ${nm(by)} · ${fmt(e.dur, 1)} h</span><span>${e.minV < 0.5 ? "total" : fmt(100 - e.minV, 0) + "% covered"}</span></div>`;
  }).join("");
  return chart(`Next eclipses of ${nm(st)}, seen from ${nm(b)}`, `<div class="ecards">${cards}</div>`,
    "Each picture is the sky at the deepest moment: star and occluding body at their true angular sizes and true offset. Times are game time (UTC) at mid-eclipse." +
    "");
}

// --- angle of each object from the star, as seen from the body (photo planning)
function skyTimeline(b) {
  if (b.type === "Star") return "";
  const st = hostStar(b), P = b.orbitalPeriod || 1, span = Math.min(Math.max(P * 2, 2), 30), N = 360;
  const pb0 = S.world.get(b.bodyId);
  const cand = S.bodies.filter(o => o !== b && o.type !== "Star").map(o => [o, o._r / dist(S.world.get(o.bodyId), pb0)]).sort((x, y) => y[1] - x[1]).slice(0, 4).map(x => x[0]);
  if (!cand.length) return "";
  const ang = (W, p, q) => { const a = W.get(b.bodyId), u = W.get(p.bodyId), v = W.get(q.bodyId);
    const x = { x: u.x - a.x, y: u.y - a.y, z: u.z - a.z }, y = { x: v.x - a.x, y: v.y - a.y, z: v.z - a.z };
    return Math.acos(Math.max(-1, Math.min(1, (x.x * y.x + x.y * y.y + x.z * y.z) / (Math.hypot(x.x, x.y, x.z) * Math.hypot(y.x, y.y, y.z))))) / DEG; };
  const xs = [], series = cand.map(() => []), lits = cand.map(() => []), pairs = [];
  for (let i = 0; i < N; i++) {
    const t = simTime + (i / (N - 1)) * span * 86400000, W = worldAt(t);
    xs.push(i / (N - 1) * span);
    cand.forEach((o, k) => { const e = ang(W, o, st); series[k].push(e); lits[k].push((1 - Math.cos(e * DEG)) / 2 * 100); });
    const rad = o => Math.asin(Math.min(1, o._r / dist(W.get(o.bodyId), W.get(b.bodyId)))) / DEG;
    const row = []; for (let p = 0; p < cand.length; p++) for (let q = p + 1; q < cand.length; q++) row.push([ang(W, cand[p], cand[q]), rad(cand[p]) + rad(cand[q])]); pairs.push(row);
  }
  // single axis: degrees from the star (0° = in front of / behind the star, 180° = opposite, fully lit)
  const CW = 360, CH = 150, l = 34, r = 8, t = 10, bt = 20, sx = i => l + (i / (N - 1)) * (CW - l - r), sy = v => t + (1 - v / 180) * (CH - t - bt);
  let c = svgOpen(CW, CH);
  [0, 90, 180].forEach(v => c += `<line x1="${l}" y1="${sy(v)}" x2="${CW - r}" y2="${sy(v)}" stroke="${C_GRID}"/><text x="${l - 4}" y="${sy(v) + 3}" fill="${C_DIM}" font-size="9" text-anchor="end">${v}°</text>`);
  c += `<rect x="${l}" y="${sy(30)}" width="${CW - l - r}" height="${sy(0) - sy(30)}" fill="#ffcf7a" opacity=".07"${tipAttr("Within 30° of the star: thin crescents, backlit shots")}/>`;
  [0, 0.5, 1].forEach((f, k2) => { const i = Math.round(f * (N - 1)); c += `<text x="${sx(i)}" y="${CH - 5}" fill="${C_DIM}" font-size="9" text-anchor="${["start", "middle", "end"][k2]}">${i === 0 ? "now" : "+" + fmt(xs[i], 1) + " d"}</text>`; });
  series.forEach((ys, k) => c += `<path d="${ys.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join("")}" fill="none" stroke="${SER[k]}" stroke-width="2" stroke-linejoin="round"/>`);
  c += `<line class="xh" x1="0" y1="${t}" x2="0" y2="${CH - bt}" stroke="${C_TXT}" stroke-width="1" opacity="0"/><rect x="${l}" y="${t}" width="${CW - l - r}" height="${CH - t - bt}" fill="transparent" data-line="skyang"/></svg>`;
  LINES.skyang = { xs, ys: series[0], l, r, W: CW, xFmt: d => d === 0 ? "now" : `+${fmt(d, 2)} d`, yFmt: v => fmt(v, 0) + "°",
    at: i => cand.map((o, k) => `${shortName(o, S.sys.name)} ${fmt(series[k][i], 0)}° (${fmt(lits[k][i], 0)}% lit)`).join(" · ") };
  const legend = `<div class="legend2">${cand.map((o, k) => `<span class="lg"><i style="background:${SER[k]}"></i>${nm(o)}</span>`).join("")}</div>`;
  // close approaches between objects (local minima of separation under 5°)
  const close = []; let pi = 0;
  for (let p = 0; p < cand.length; p++) for (let q = p + 1; q < cand.length; q++, pi++) {
    for (let i = 1; i < N - 1; i++) { const [v, rr] = pairs[i][pi]; if (v < 5 && v <= pairs[i - 1][pi][0] && v <= pairs[i + 1][pi][0]) close.push([i, cand[p], cand[q], v, v < rr]); }
  }
  close.sort((x, y) => x[0] - y[0]);
  const list = close.slice(0, 6).map(([i, p, q, v, over]) => { const [near, far] = dist(S.world.get(p.bodyId), pb0) < dist(S.world.get(q.bodyId), pb0) ? [p, q] : [q, p];
    return `<div class="ev"><b>${gt16(simTime + xs[i] * 86400000)}</b> · ${over ? `${nm(near)} passes in front of ${nm(far)}` : `${nm(p)} and ${nm(q)} ${fmtAng(v)} apart`}</div>`; }).join("");
  return chart(`Angle from ${nm(st)} in the sky of ${nm(b)}, next ${fmt(span, 0)} days`, c + legend +
    `<div class="ct" style="margin-top:8px">Close pairings in the sky (under 5°)</div>` + (list || `<div class="ev dim">None in this window.</div>`),
    "0° means the object is in line with the star (thin crescent or crossing it), 180° means opposite the star (fully lit). Hover the chart for each object's angle and lit share at that moment.");
}
// --- eclipse calendar: every body of the system on one timeline, dark bars = in shadow
const ECL_DAYS = 7;
// exact start/end of a calendar run (the 15-minute grid only finds it): the same search the label uses, cached
const _eclCache = new Map();
function exactEdges(o, star, r, t0, step, N) {
  const dark = t => starlightWho(o, star, worldAt(t)).vis < 0.95;
  const bis = (lo, hi, wantDarkAtHi) => { for (let i = 0; i < 18 && hi - lo > 2000; i++) { const m = (lo + hi) / 2; if (dark(m) === wantDarkAtHi) hi = m; else lo = m; } return hi; };
  const kA = o.bodyId + ":a:" + (t0 + r.a * step), kZ = o.bodyId + ":z:" + (t0 + r.z * step);
  if (!_eclCache.has(kA)) {
    let lo = t0 + (r.a - 1) * step, hi = t0 + r.a * step;
    if (r.a === 0) { for (let i = 0; i < 200 && dark(lo); i++) { hi = lo; lo -= step; } }   // already dark at the left edge: look back
    _eclCache.set(kA, bis(lo, hi, true));
  }
  if (!_eclCache.has(kZ)) {
    const lit = !dark(t0 + r.z * step);
    _eclCache.set(kZ, lit ? bis(t0 + (r.z - 1) * step, t0 + r.z * step, false) : null);
  }
  if (_eclCache.size > 4000) _eclCache.clear();
  r.ta = _eclCache.get(kA); r.tz = _eclCache.get(kZ) ?? (t0 + r.z * step);
}
const hhmm = ms => gameTime(ms).slice(11, 16);
function eclSpan(r) { const a = gameTime(r.ta), z = gameTime(r.tz); return `${a.slice(0, 16)} → ${a.slice(0, 10) === z.slice(0, 10) ? z.slice(11, 16) : z.slice(5, 16)}`; }
function localSpan(r) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: tzSel.value, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return `${f.format(r.ta)} → ${f.format(r.tz)}`;
}
let eclAll = false;                              // calendar: the selected body's own family, or every body
function eclFamily(b) {
  if (b.type === "Star") return S.bodies.filter(o => o.type !== "Star" && moonAnchor(o) === o && hostStar(o) === b);   // its planets
  const a = moonAnchor(b);                         // the planet this body belongs to (itself if it is a planet)
  return [b, ...S.bodies.filter(o => o !== b && o.type !== "Star" && (o === a || moonAnchor(o) === a))];
}
function eclipseCalendar(b) {
  const fam = eclFamily(b), all = [...(b.type === "Star" ? [] : [b]), ...S.bodies.filter(o => o !== b && o.type !== "Star")];
  const rows = eclAll ? all : fam;
  if (!rows.length) return "";
  const N = ECL_DAYS * 24 * 4 + 1, step = ECL_DAYS * 86400000 / (N - 1), t0 = Math.floor(simTime / step) * step;   // grid fixed to the clock, so bars don't jump
  const hosts = rows.map(o => hostStar(o));
  const runs = rows.map(() => []), open = rows.map(() => null);
  for (let i = 0; i < N; i++) {
    const t = t0 + i * step, W = worldAt(t);
    rows.forEach((o, k) => {
      const w = starlightWho(o, hosts[k], W), dark = w.vis < 0.95;
      if (dark && !open[k]) open[k] = { a: i, min: w.vis, by: w.by };
      if (dark && open[k] && w.vis < open[k].min) { open[k].min = w.vis; open[k].by = w.by; }
      if ((!dark || i === N - 1) && open[k]) { open[k].z = i; runs[k].push(open[k]); open[k] = null; }
    });
  }
  // colour by relationship (never by cycling hues): the parent, a sibling sharing the parent, or anything else
  const relOf = (o, by) => !by ? 2 : S.parentOf.get(o.bodyId) === by.bodyId ? 0 : S.parentOf.get(o.bodyId) === S.parentOf.get(by.bodyId) ? 1 : 2;
  const REL = [["its parent", SER[1]], ["a neighbour with the same parent", SER[0]], ["another body", SER[3]]];
  rows.forEach((o, k) => runs[k].forEach(r => { r.rel = relOf(o, r.by); exactEdges(o, hosts[k], r, t0, step, N); }));
  const usedRel = [...new Set(runs.flat().map(r => r.rel))].sort();
  const W = 360, lw = 58, rh = 15, top = 16, H = top + rows.length * rh + 6, sx = i => lw + (i / (N - 1)) * (W - lw - 4);
  let s = svgOpen(W, H);
  // day boundaries at 00:00 game time (UTC)
  const dayMs = 86400000, first = Math.ceil(t0 / dayMs) * dayMs;
  for (let d = first; d <= t0 + ECL_DAYS * dayMs; d += dayMs) {
    const x = sx((d - t0) / step);
    s += `<line x1="${x}" y1="${top - 4}" x2="${x}" y2="${H - 4}" stroke="${C_GRID}"/><text x="${x + 2}" y="${top - 6}" fill="${C_DIM}" font-size="8.5">${gameTime(d).slice(5, 10)}</text>`;
  }
  rows.forEach((o, k) => {
    const y = top + k * rh, sel = o === b;
    if (sel) s += `<rect x="0" y="${y}" width="${W}" height="${rh}" fill="${C_SEL}" opacity=".08" rx="3"/>`;
    s += `<text x="${lw - 5}" y="${y + 10.5}" fill="${sel ? C_SEL : C_TXT}" font-size="9.5" text-anchor="end" font-weight="${sel ? 700 : 400}">${nm(o).slice(0, 10)}</text>`;
    s += `<line x1="${lw}" y1="${y + rh / 2}" x2="${W - 4}" y2="${y + rh / 2}" stroke="${C_GRID}"/>`;
    for (const r of runs[k]) {
      const x0 = sx(r.a), x1 = Math.max(sx(r.z), x0 + 2.5), hrs = (r.z - r.a) * step / 3600000;
      s += `<rect x="${x0}" y="${y + 2.5}" width="${x1 - x0}" height="${rh - 5}" rx="2" fill="${REL[r.rel][1]}" opacity="${r.min < 0.05 ? 1 : 0.5}"${tipAttr(`${shortName(o, S.sys.name)} in the shadow of ${r.by ? shortName(r.by, S.sys.name) : "?"} · game time (UTC) ${eclSpan(r)} · your time ${localSpan(r)} (${fmt((r.tz - r.ta) / 3600000, 1)} h) · ${r.min < 0.05 ? "total" : "deepest " + fmt(100 - r.min * 100, 0) + "% of the star covered"}`)}/>`;
    }
  });
  s += `<line x1="${lw}" y1="${top - 4}" x2="${lw}" y2="${H - 4}" stroke="${C_SEL}" stroke-width="1.5"/></svg>`;
  const legend = usedRel.length ? `<div class="legend2"><span class="lg">Shadow cast by</span>${usedRel.map(k => `<span class="lg"><i style="background:${REL[k][1]}"></i>${REL[k][0]}</span>`).join("")}<span class="lg">· pale = partial</span></div>` : "";
  const mine = runs[0] && rows[0] === b ? runs[0] : [];
  const next = mine.find(r => r.ta > simTime) || mine[0];
  const headline = b.type === "Star" ? "" : next
    ? `<div class="ev" style="margin-bottom:6px">${next.ta <= simTime ? "In darkness now" : "Next darkness"} on <b style="color:${C_SEL}">${nm(b)}</b>: <b>${eclSpan(next)}</b> game time (UTC) · your time ${localSpan(next)} · ${fmt((next.tz - next.ta) / 3600000, 1)} h, shadow of ${nm(next.by)} <button class="evBtn" data-evcard="eclipse" data-b="${b.bodyId}" data-ta="${Math.round(next.ta)}" data-tz="${Math.round(next.tz)}" data-by="${esc(next.by ? shortName(next.by, S.sys.name) : "")}" title="A card with a countdown, a link to share and a calendar file">⏰ Event card</button></div>`
    : `<div class="ev dim" style="margin-bottom:6px">${nm(b)} stays in full starlight for the next ${ECL_DAYS} days.</div>`;
  return chart(`Eclipse calendar · next ${ECL_DAYS} days (game time)`, headline + s + legend,
    "Each row is a body. A bar means its star is blocked. Hover a bar for the exact times and the name of the body casting the shadow. Computed from true positions and radii." +
    (all.length > fam.length ? ` <button class="eclAll">${eclAll ? `Show only ${b.type === "Star" ? "its planets" : "this family"}` : `Show all ${all.length} bodies`}</button>` : ""));
}

// --- the whole sky around the body, unrolled; the star in the middle, dotted lines = where things go next
function skyPanorama(b) {
  if (b.type === "Star") return "";
  const st = hostStar(b), P = b.orbitalPeriod || 1, span = Math.min(Math.max(P, 1), 30), M = 120;
  const dirOf = (W, o) => { const a = W.get(b.bodyId), p = W.get(o.bodyId), d = { x: p.x - a.x, y: p.y - a.y, z: p.z - a.z }, n = Math.hypot(d.x, d.y, d.z); return [Math.atan2(d.y, d.x), Math.asin(d.z / n), n]; };
  const wrap = a => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  const Wn = S.world, [lamS] = dirOf(Wn, st);
  const pb0 = Wn.get(b.bodyId);
  const objs = S.bodies.filter(o => o !== b).map(o => ({ o, ang: 2 * Math.asin(Math.min(1, o._r / dist(Wn.get(o.bodyId), pb0))) / DEG }))
    .sort((x, y) => (y.o.type === "Star") - (x.o.type === "Star") || y.ang - x.ang).slice(0, 7);
  const now = objs.map(({ o, ang }) => { const [l, be] = dirOf(Wn, o); return { o, ang, lam: wrap(l - lamS) / DEG, bet: be / DEG }; });
  const tracks = objs.map(() => []);
  for (let i = 0; i < M; i++) { const W = worldAt(simTime + (i / (M - 1)) * span * 86400000), [ls] = dirOf(W, st);
    objs.forEach(({ o }, k) => { const [l, be] = dirOf(W, o); tracks[k].push([wrap(l - ls) / DEG, be / DEG]); }); }
  const bmax = Math.min(90, Math.max(20, ...tracks.flat().map(p => Math.abs(p[1]) + 8)));
  const Wd = 360, Hd = 150, l = 6, r = 6, t = 14, bt = 18, sx = v => l + (v + 180) / 360 * (Wd - l - r), sy = v => t + (1 - (v + bmax) / (2 * bmax)) * (Hd - t - bt);
  let s = svgOpen(Wd, Hd) + `<defs><radialGradient id="pang"><stop offset="0" stop-color="#ffd27a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient></defs>`;
  s += `<rect x="${l}" y="${t}" width="${Wd - l - r}" height="${Hd - t - bt}" fill="#07040e" stroke="${C_GRID}" rx="4"/>`;
  s += `<line x1="${l}" y1="${sy(0)}" x2="${Wd - r}" y2="${sy(0)}" stroke="${C_DIM}" stroke-opacity=".35"${tipAttr("The system's orbital plane")}/>`;
  [[-90, "half lit"], [90, "half lit"], [-180, ""], [180, "full"]].forEach(([v, lb]) => { s += `<line x1="${sx(v)}" y1="${t}" x2="${sx(v)}" y2="${Hd - bt}" stroke="${C_GRID}" stroke-dasharray="2 3"/>`; if (lb) s += `<text x="${sx(v) - 3}" y="${Hd - 6}" fill="${C_DIM}" font-size="8.5" text-anchor="end">${v}° ${lb}</text>`; });
  s += `<text x="${sx(0)}" y="${Hd - 6}" fill="#ffcf7a" font-size="8.5" text-anchor="middle">0° star</text>`;
  tracks.forEach((tr, k) => {
    if (now[k].o.type === "Star" && now[k].o === st) return;
    let d = "", prev = null;
    for (const [la, be] of tr) { d += `${prev !== null && Math.abs(la - prev) < 180 ? "L" : "M"}${sx(la).toFixed(1)},${sy(be).toFixed(1)}`; prev = la; }
    s += `<path d="${d}" fill="none" stroke="${SER[k % SER.length]}" stroke-width="1.2" stroke-dasharray="1.5 3" opacity=".8"/>`;
  });
  now.forEach(({ o, ang, lam, bet }, k) => {
    const x = sx(lam), y = sy(bet), isStar = o.type === "Star", rr = Math.max(isStar ? 5 : 3.5, Math.min(18, ang / 2 * (Wd - l - r) / 360 * 3));
    const elong = Math.acos(Math.cos(lam * DEG) * Math.cos(bet * DEG)) / DEG, lit = (1 - Math.cos(elong * DEG)) / 2;
    const tipT = `${shortName(o, S.sys.name)}: ${fmtAng(ang)} wide · ${fmt(elong, 0)}° from the star${isStar ? "" : ` · ${fmt(lit * 100, 0)}% lit as seen from here`}`;
    if (isStar) s += `<circle cx="${x}" cy="${y}" r="${rr * 3}" fill="url(#pang)"/><circle cx="${x}" cy="${y}" r="${rr}" fill="${hex(starColor(o))}"${tipAttr(tipT)}/>`;
    else { const pc = palette(o)[0];
      s += `<g${tipAttr(tipT)}><circle cx="${x}" cy="${y}" r="${rr}" fill="rgb(${pc.map(v => v * 0.22 | 0)})" stroke="${SER[k % SER.length]}" stroke-width="1.2"/>`;
      if (lit > 0.01) s += `<path d="${litPath(x, y, rr, lam > 0 ? Math.PI : 0, Math.acos(2 * lit - 1))}" fill="rgb(${pc.join(",")})"/>`;
      s += `</g>`; }
    s += `<text x="${x}" y="${y - rr - 3}" fill="${isStar ? "#ffcf7a" : C_TXT}" font-size="9" text-anchor="middle">${nm(o)}</text>`;
  });
  s += "</svg>";
  return chart(`The sky around ${nm(b)}, unrolled`, s,
    `Every direction from ${nm(b)} laid flat, like a world map of the sky. The star is in the middle. Left–right is the angle from the star around the orbital plane, up–down is height above it. Objects near ±180° are opposite the star and fully lit. Near 0° they are thin crescents or cross the star. Dotted lines show where each object moves over the next ${fmt(span, span < 3 ? 1 : 0)} days. Body sizes are exaggerated ×3 so small moons stay visible.`);
}

const sunriseNote = () => chart("Sunrise and sunset times",
  `<div class="ev dim">Spansh publishes each body's day length and axial tilt, and the pole direction follows from the orbit data (we checked it against the game). What is missing is the rotation phase: which way the surface is facing at a given moment. Without it, sunrise and sunset times at a landing spot cannot be computed honestly for a body that spins freely, so they are not shown. Tidally locked bodies are the exception: they keep one face to what they orbit, so their settlements get day and night times. Everything on this tab is position geometry, which the data does give.</div>`);

