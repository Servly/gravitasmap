// =====================================================================
// Physics charts: everything here is derived from the catalogue values
// with textbook formulas; the source of each model is named on the chart.
// =====================================================================
const G_SI = 6.674e-11, EARTH_KG = 5.9722e24, AU_MM = AU_LS * LS_MM, L_SUN_FLUX = 1361;
const hex = c => "#" + c.toString(16).padStart(6, "0");
const starLum = st => Math.pow(st.solarRadius || 0, 2) * Math.pow((st.surfaceTemperature || 5772) / 5772, 4);   // L/L☉ from R and Teff
function hostStar(b) {                       // nearest star up the parent chain (falls back to the main star)
  for (let id = S.parentOf.get(b.bodyId); id !== undefined; id = S.parentOf.get(id)) { const o = S.byId.get(id); if (o && o.type === "Star") return o; }
  return S.main;
}
function yearAncestor(b, st) {              // the body (or barycentre) in b's chain that orbits the host star directly
  let cur = b;
  for (let id = S.parentOf.get(b.bodyId); id !== undefined; id = S.parentOf.get(id)) {
    if (id === st.bodyId || id === 0) return cur;
    const o = S.byId.get(id); if (o && o.orbitalPeriod) cur = o;
  }
  return cur;
}
const tiles = items => `<div class="tiles">${items.filter(Boolean).map(([k, v, sub, tipTxt]) => `<div class="tile"${tipTxt ? tipAttr(tipTxt) : ""}><span>${k}</span><b>${v}</b>${sub ? `<i>${sub}</i>` : ""}</div>`).join("")}</div>`;

// --- Kopparapu et al. (2014) habitable zone + insolation over one year
const HZ = { rv: [1.776, 2.136e-4, 2.533e-8, -1.332e-11, -3.097e-15], rg: [1.107, 1.332e-4, 1.58e-8, -8.308e-12, -1.931e-15],
             mg: [0.356, 6.171e-5, 1.698e-9, -3.198e-12, -5.575e-16], em: [0.32, 5.547e-5, 1.526e-9, -2.874e-12, -5.011e-16] };
const hzDist = (k, T, L) => { const t = T - 5780, c = HZ[k], s = c[0] + c[1] * t + c[2] * t * t + c[3] * t ** 3 + c[4] * t ** 4; return Math.sqrt(L / s); };
function habitableChart(b) {
  const st = hostStar(b);
  if (!st || b.type === "Star" || !st.solarRadius || !st.surfaceTemperature) return "";
  const T = st.surfaceTemperature, L = starLum(st), valid = T >= 2600 && T <= 7200;
  const pw = S.world.get(b.bodyId), ps = S.world.get(st.bodyId), d = dist(pw, ps) / AU_MM;
  const others = S.bodies.filter(o => o.type !== "Star" && o !== b && hostStar(o) === st && !o._isMoon).map(o => [o, dist(S.world.get(o.bodyId), ps) / AU_MM]);
  const z = valid ? { rv: hzDist("rv", T, L), rg: hzDist("rg", T, L), mg: hzDist("mg", T, L), em: hzDist("em", T, L) } : null;
  const all = [d, ...others.map(x => x[1]), ...(z ? [z.rv, z.em] : [])].filter(v => v > 0);
  const lo = Math.min(...all) / 2.2, hi = Math.max(...all) * 2.2;
  const W = 360, H = 74, x0 = 8, x1 = W - 8, y = 30, sx = v => x0 + (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)) * (x1 - x0);
  let s = svgOpen(W, H);
  if (z) {
    s += `<rect x="${sx(z.rv)}" y="${y - 14}" width="${sx(z.em) - sx(z.rv)}" height="28" rx="4" fill="${SER[2]}" opacity=".18"${tipAttr(`Optimistic habitable zone (Recent Venus → Early Mars): ${fmt(z.rv, 3)}–${fmt(z.em, 3)} AU`)}/>`;
    s += `<rect x="${sx(z.rg)}" y="${y - 14}" width="${sx(z.mg) - sx(z.rg)}" height="28" rx="4" fill="${SER[2]}" opacity=".45"${tipAttr(`Conservative habitable zone (Runaway → Maximum greenhouse): ${fmt(z.rg, 3)}–${fmt(z.mg, 3)} AU`)}/>`;
  }
  const dE = Math.sqrt(L);              // where a body would get exactly Earth's insolation
  s += `<line x1="${sx(dE)}" y1="${y - 18}" x2="${sx(dE)}" y2="${y + 18}" stroke="#ffcf7a" stroke-dasharray="3 3"${tipAttr(`Earth-equivalent insolation at ${fmt(dE, 3)} AU`)}/><text x="${sx(dE)}" y="${y - 21}" fill="#ffcf7a" font-size="9" text-anchor="middle">1 S⊕</text>`;
  s += `<circle cx="${x0 - 2}" cy="${y}" r="5" fill="${hex(starColor(st))}"${tipAttr(`${shortName(st, S.sys.name)} · ${fmt(T, 0)} K · ${fmt(L, 4)} L☉`)}/>`;
  for (const [o, dd] of others) s += `<circle cx="${sx(dd)}" cy="${y}" r="3.5" fill="${C_DIM}" opacity=".7"${tipAttr(`${shortName(o, S.sys.name)}: ${fmt(dd, 3)} AU · ${fmt(L / dd / dd, 4)} S⊕`)}/>`;
  s += `<circle cx="${sx(d)}" cy="${y}" r="6.5" fill="${C_SEL}" stroke="${C_SURF}" stroke-width="2"${tipAttr(`${shortName(b, S.sys.name)}: ${fmt(d, 4)} AU now`)}/>`;
  for (const t of [0.001, 0.01, 0.1, 1, 10, 100, 1000]) if (t > lo && t < hi) s += `<text x="${sx(t)}" y="${H - 4}" fill="${C_DIM}" font-size="9" text-anchor="middle">${t} AU</text>`;
  s += "</svg>";
  const S_now = L / (d * d), Teq = 278.6 * Math.pow(S_now, 0.25), Teq03 = Teq * Math.pow(0.7, 0.25);
  const legend = `<div class="legend2"><span class="lg"><i style="background:${SER[2]};opacity:.75"></i>conservative HZ</span><span class="lg"><i style="background:${SER[2]};opacity:.3"></i>optimistic HZ</span><span class="lg"><i style="background:${C_SEL}"></i>this body</span><span class="lg"><i style="background:${C_DIM}"></i>other planets</span></div>`;
  // insolation over one year (eclipses included)
  const anc = yearAncestor(b, st), P = anc.orbitalPeriod || b.orbitalPeriod || 1, N = 300, xs = [], ys = [];
  for (let i = 0; i < N; i++) {
    const t = simTime + (i / (N - 1)) * P * 86400000, Wt = worldAt(t), dd = dist(Wt.get(b.bodyId), Wt.get(st.bodyId)) / AU_MM;
    xs.push(i / (N - 1) * P); ys.push(L / (dd * dd) * L_SUN_FLUX);
  }
  const mx = Math.max(...ys), mn = Math.min(...ys);
  const curve = lineChart("insol", xs, ys, { yMin: 0, yMax: mx * 1.1 || 1, yFmt: v => fmt(v, v < 10 ? 2 : 0), xFmt: v => v === 0 ? "now" : `+${fmt(v, P < 3 ? 2 : 0)} d`, area: true, color: "#ffcf7a" });
  const body = s + legend + tiles([
    ["Insolation now", `${fmt(S_now * L_SUN_FLUX, S_now < 0.01 ? 3 : 1)} W/m²`, `${fmt(S_now, 4)} × Earth`, "Stellar flux at the body: L / (4πd²), with L = R²·(T/5772 K)⁴ L☉"],
    ["Equilibrium temp.", temp(Teq03), `albedo 0.3 · ${temp(Teq)} if black`, "Teq = 278.6 K · S^¼ · (1−A)^¼ (fast rotator, no greenhouse)"],
    b.surfaceTemperature ? ["Catalogue surface temp.", temp(b.surfaceTemperature), b.surfaceTemperature - Teq03 > 15 ? `${fmt(b.surfaceTemperature - Teq03, 0)} K warmer than Teq` : "", "From the game's scan data"] : null,
    ["Star luminosity", `${fmt(L, L < 0.01 ? 5 : 3)} L☉`, `${fmt(T, 0)} K · ${fmt(st.solarRadius, 3)} R☉`, "Stefan–Boltzmann from catalogue radius and temperature"],
  ]) + (mx > 0 && (mx - mn) / mx > 0.03
      ? `<div class="ct" style="margin-top:8px">Insolation over one ${anc === b ? "orbit" : "year (" + esc(shortName(anc, S.sys.name)) + " around the star)"} · W/m²</div>` + curve
        + `<div class="cn">Varies ${fmt(mn, 2)}–${fmt(mx, 2)} W/m² as the distance to the star changes (eclipses are in the Orbit tab).</div>`
      : `<div class="cn">Over a full year the starlight here changes by less than 3 %: the orbit around the star is nearly circular, so there are no seasons from distance.</div>`);
  const intro = `<div class="cn" style="margin:0 0 6px">The green band is where a rocky planet around ${nm(st)} could keep liquid water. It belongs to the star, so it looks the same for every body here. What changes is the pink dot (where <b>${nm(b)}</b> is now) and the numbers below.</div>`;
  return chart(`Is ${nm(b)} in the habitable zone?`, intro + body,
    valid ? "Habitable-zone limits: Kopparapu et al. (2014), 1 M⊕ planet. Moons are shown through their parent." : `Star at ${fmt(T, 0)} K is outside the HZ model's 2600–7200 K range, so no zone is drawn.`);
}

// --- mass–radius diagram with constant-density lines and Solar System references
const SOLREF = [["Mercury", 0.0553, 2440], ["Venus", 0.815, 6052], ["Earth", 1, 6371], ["Moon", 0.0123, 1737], ["Mars", 0.107, 3390], ["Io", 0.015, 1822],
  ["Europa", 0.008, 1561], ["Ganymede", 0.0248, 2634], ["Callisto", 0.018, 2410], ["Titan", 0.0225, 2575], ["Pluto", 0.0022, 1188], ["Ceres", 1.57e-4, 470],
  ["Enceladus", 1.8e-5, 252], ["Jupiter", 317.8, 69911], ["Saturn", 95.2, 58232], ["Uranus", 14.5, 25362], ["Neptune", 17.1, 24622]];
const density = (em, rkm) => em * EARTH_KG / (4 / 3 * Math.PI * Math.pow(rkm * 1000, 3)) / 1000;    // g/cm³
function massRadius(b) {
  if (b.type === "Star" || !b.earthMasses || !b.radius) return "";
  const W = 360, H = 250, l = 40, r = 10, t = 10, bt = 26, mlo = 1e-6, mhi = 1e4, rlo = 100, rhi = 1.2e5;
  const sx = m => l + (Math.log10(m) - Math.log10(mlo)) / (Math.log10(mhi) - Math.log10(mlo)) * (W - l - r);
  const sy = k => t + (1 - (Math.log10(k) - Math.log10(rlo)) / (Math.log10(rhi) - Math.log10(rlo))) * (H - t - bt);
  let s = svgOpen(W, H) + `<defs><clipPath id="mrc"><rect x="${l}" y="${t}" width="${W - l - r}" height="${H - t - bt}"/></clipPath></defs>`;
  for (const m of [1e-6, 1e-4, 1e-2, 1, 1e2, 1e4]) s += `<line x1="${sx(m)}" y1="${t}" x2="${sx(m)}" y2="${H - bt}" stroke="${C_GRID}"/><text x="${sx(m)}" y="${H - bt + 12}" fill="${C_DIM}" font-size="9" text-anchor="middle">${m >= 1 ? fmt(m, 0) : "1e" + Math.log10(m)}</text>`;
  for (const k of [100, 1000, 10000, 100000]) s += `<line x1="${l}" y1="${sy(k)}" x2="${W - r}" y2="${sy(k)}" stroke="${C_GRID}"/><text x="${l - 4}" y="${sy(k) + 3}" fill="${C_DIM}" font-size="9" text-anchor="end">${k >= 1000 ? fmt(k / 1000, 0) + "k" : k}</text>`;
  s += `<text x="${(W + l) / 2}" y="${H - 2}" fill="${C_DIM}" font-size="9.5" text-anchor="middle">Mass (Earth masses, log)</text><text transform="translate(9,${(H - bt) / 2}) rotate(-90)" fill="${C_DIM}" font-size="9.5" text-anchor="middle">Radius (km, log)</text>`;
  // constant bulk density: R = (3M / 4πρ)^(1/3)
  s += `<g clip-path="url(#mrc)">`;
  for (const [rho, name] of [[0.7, "0.7 g/cm³ (Saturn)"], [1, "1 (water ice)"], [3, "3 (rock)"], [5.5, "5.5 (Earth)"], [8, "8 (iron)"]]) {
    const R = m => Math.pow(3 * m * EARTH_KG / (4 * Math.PI * rho * 1000), 1 / 3) / 1000;
    s += `<line x1="${sx(mlo)}" y1="${sy(R(mlo))}" x2="${sx(mhi)}" y2="${sy(R(mhi))}" stroke="${C_DIM}" stroke-dasharray="3 4" stroke-opacity=".6"${tipAttr(`Constant density ${name}`)}/>`;
    const mLab = rho < 2 ? 3e2 : rho < 6 ? 1e-1 : 3e1;
    s += `<text x="${sx(mLab) + 3}" y="${sy(R(mLab)) + (rho > 4 ? 11 : -4)}" fill="${C_DIM}" font-size="8.5">${fmt(rho, 1)}</text>`;
  }
  s += "</g>";
  const lab = new Set(["Earth", "Moon", "Mars", "Jupiter", "Saturn", "Neptune", "Pluto", "Mercury", "Enceladus", "Ceres"]);
  for (const [n, m, k] of SOLREF) s += `<circle cx="${sx(m)}" cy="${sy(k)}" r="3.2" fill="none" stroke="${C_TXT}" stroke-opacity=".7"${tipAttr(`${n} (Solar System): ${fmt(m, 4)} M⊕ · ${fmt(k, 0)} km · ${fmt(density(m, k), 2)} g/cm³`)}/>`
    + (lab.has(n) ? `<text x="${sx(m) + 5}" y="${sy(k) + 3}" fill="${C_TXT}" fill-opacity=".6" font-size="8.5">${n}</text>` : "");
  for (const o of S.bodies) if (o !== b && o.type !== "Star" && o.earthMasses && o.radius)
    s += `<circle cx="${sx(o.earthMasses)}" cy="${sy(o.radius)}" r="3.6" fill="${SER[0]}" stroke="${C_SURF}" stroke-width="1"${tipAttr(`${shortName(o, S.sys.name)}: ${fmt(o.earthMasses, 4)} M⊕ · ${fmt(o.radius, 0)} km · ${fmt(density(o.earthMasses, o.radius), 2)} g/cm³`)}/>`;
  s += `<circle cx="${sx(b.earthMasses)}" cy="${sy(b.radius)}" r="6.5" fill="${C_SEL}" stroke="${C_SURF}" stroke-width="2"${tipAttr(`${shortName(b, S.sys.name)}: ${fmt(density(b.earthMasses, b.radius), 2)} g/cm³`)}/></svg>`;
  const legend = `<div class="legend2"><span class="lg"><i style="background:${C_SEL}"></i>this body</span><span class="lg"><i style="background:${SER[0]}"></i>this system</span><span class="lg"><i style="border:1.5px solid ${C_TXT};background:none;border-radius:50%"></i>Solar System</span><span class="lg">- - constant density</span></div>`;
  return chart("Mass–radius diagram", s + legend, `Bulk density ${fmt(density(b.earthMasses, b.radius), 2)} g/cm³. Lines of equal density: below the 5.5 line a body is denser than Earth (iron-rich), above 1 it must be mostly ice or gas.`);
}

// --- what the sky looks like from the surface (true angular sizes, now)
function skyView(b) {
  if (b.type === "Star") return "";
  const pb = S.world.get(b.bodyId), st = hostStar(b), psS = S.world.get(st.bodyId);
  const items = [];
  for (const o of S.bodies) {
    if (o === b) continue;
    const po = S.world.get(o.bodyId), d = dist(po, pb), ang = 2 * Math.asin(Math.min(1, o._r / d)) / DEG;
    let lit = 1;
    if (o.type !== "Star") {          // phase of o as seen from b
      const L = { x: psS.x - po.x, y: psS.y - po.y, z: psS.z - po.z }, V = { x: pb.x - po.x, y: pb.y - po.y, z: pb.z - po.z };
      lit = (1 + (L.x * V.x + L.y * V.y + L.z * V.z) / (Math.hypot(L.x, L.y, L.z) * Math.hypot(V.x, V.y, V.z))) / 2;
    }
    const toStar = { x: psS.x - pb.x, y: psS.y - pb.y, z: psS.z - pb.z }, toO = { x: po.x - pb.x, y: po.y - pb.y, z: po.z - pb.z };
    const elong = Math.acos(Math.max(-1, Math.min(1, (toStar.x * toO.x + toStar.y * toO.y + toStar.z * toO.z) / (Math.hypot(toStar.x, toStar.y, toStar.z) * Math.hypot(toO.x, toO.y, toO.z))))) / DEG;
    items.push({ o, ang, lit, d, elong });
  }
  items.sort((a, c) => (c.o.type === "Star") - (a.o.type === "Star") || c.ang - a.ang);
  const show = [...items.filter(x => x.o.type === "Star"), ...items.filter(x => x.o.type !== "Star").slice(0, 4)];
  const W = 360, H = 120, maxA = Math.max(...show.map(x => x.ang)), pxPerDeg = Math.min(46 / maxA, 2000), slot = W / show.length;
  let s = svgOpen(W, H) + `<defs><radialGradient id="skyg"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>`;
  show.forEach((x, i) => {
    const cx = slot * (i + 0.5), cy = 54, r = x.ang * pxPerDeg / 2, rr = Math.max(r, 1.3);
    const fmtA = a => a >= 1 ? `${fmt(a, 2)}°` : a * 60 >= 1 ? `${fmt(a * 60, 1)}′` : `${fmt(a * 3600, 1)}″`;
    const o = x.o, name = esc(shortName(o, S.sys.name)), tipT = `${shortName(o, S.sys.name)}: ${fmtA(x.ang)} wide · ${fmtDist(x.d)} away${o.type === "Star" ? "" : ` · ${fmt(x.lit * 100, 0)}% lit · ${fmt(x.elong, 0)}° from the star`}`;
    if (o.type === "Star") s += `<circle cx="${cx}" cy="${cy}" r="${Math.max(rr * 2.6, 6)}" fill="url(#skyg)" opacity=".5"/><circle cx="${cx}" cy="${cy}" r="${rr}" fill="${hex(starColor(o))}"${tipAttr(tipT)}/>`;
    else {
      const pc = palette(o)[0];
      s += `<g${tipAttr(tipT)}><circle cx="${cx}" cy="${cy}" r="${rr}" fill="rgb(${pc.map(v => v * 0.22 | 0)})" stroke="rgba(255,255,255,.15)"/>`;
      if (x.lit > 0.01 && rr > 2) s += `<path d="${litPath(cx, cy, rr, Math.PI, Math.acos(2 * x.lit - 1))}" fill="rgb(${pc.join(",")})"/>`;
      s += "</g>";
    }
    s += `<text x="${cx}" y="${H - 16}" fill="${C_TXT}" font-size="9.5" text-anchor="middle">${name.slice(0, 12)}</text><text x="${cx}" y="${H - 4}" fill="${C_DIM}" font-size="9.5" text-anchor="middle">${fmtA(x.ang)}</text>`;
  });
  { const bar = [10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05].find(v => v * pxPerDeg <= 80) || 0.05;
    s += `<line x1="${W - 8 - bar * pxPerDeg}" y1="10" x2="${W - 8}" y2="10" stroke="${C_DIM}" stroke-width="1.5"/><text x="${W - 8}" y="22" fill="${C_DIM}" font-size="9" text-anchor="end">${bar}° of sky</text>`; }
  s += "</svg>";
  return chart(`Sky from ${esc(shortName(b, S.sys.name))}, now (true angular sizes)`, s,
    "All discs share one scale (see the bar at top right). Phases show how much of each body is lit as seen from here (light drawn from the left). Hover for distance and angle from the star.");
}

// --- atmosphere: isothermal pressure profile from the composition
const GAS_M = { "Nitrogen": 28.014, "Oxygen": 31.998, "Carbon dioxide": 44.01, "CarbonDioxide": 44.01, "Argon": 39.948, "Methane": 16.043, "Ammonia": 17.031,
  "Water": 18.015, "Helium": 4.003, "Hydrogen": 2.016, "Neon": 20.18, "Sulphur dioxide": 64.066, "SulphurDioxide": 64.066, "Iron": 55.845, "Silicates": 60.08 };
function atmosphereProfile(b) {
  const comp = b.atmosphereComposition, P0 = (b.surfacePressure || 0) / 101325, T = b.surfaceTemperature, g = (b.gravity || 0) * 9.80665;
  if (!comp || !Object.keys(comp).length || !(P0 > 0) || !T || !g) return "";
  let tot = 0, mu = 0; for (const [k, v] of Object.entries(comp)) { const m = GAS_M[k]; if (m) { mu += v * m; tot += v; } }
  if (!tot) return "";
  mu /= tot;
  const Hm = 8.314462 * T / (mu / 1000 * g), Hkm = Hm / 1000, top = 5 * Hkm;
  const W = 360, Hh = 170, l = 44, r = 10, t = 10, bt = 24, pLo = P0 * Math.exp(-5), pHi = Math.max(P0, 1) * 1.5;
  const sx = p => l + (Math.log10(p) - Math.log10(pLo)) / (Math.log10(pHi) - Math.log10(pLo)) * (W - l - r), sy = h => t + (1 - h / top) * (Hh - t - bt);
  let s = svgOpen(W, Hh);
  for (let k = 0; k <= 5; k++) s += `<line x1="${l}" y1="${sy(k * Hkm)}" x2="${W - r}" y2="${sy(k * Hkm)}" stroke="${C_GRID}"/><text x="${l - 4}" y="${sy(k * Hkm) + 3}" fill="${C_DIM}" font-size="9" text-anchor="end">${fmt(k * Hkm, Hkm < 2 ? 1 : 0)} km</text>`;
  for (let e = Math.ceil(Math.log10(pLo)); e <= Math.log10(pHi); e++) s += `<text x="${sx(10 ** e)}" y="${Hh - 10}" fill="${C_DIM}" font-size="9" text-anchor="middle">${e === 0 ? "1 atm" : "1e" + e}</text>`;
  s += `<text x="${(W + l) / 2}" y="${Hh}" fill="${C_DIM}" font-size="9.5" text-anchor="middle">Pressure (atm, log)</text>`;
  const pts = []; for (let i = 0; i <= 60; i++) { const h = i / 60 * top; pts.push(`${sx(P0 * Math.exp(-h / Hkm)).toFixed(1)},${sy(h).toFixed(1)}`); }
  s += `<polyline points="${pts.join(" ")}" fill="none" stroke="${SER[0]}" stroke-width="2"/>`;
  if (1 > pLo && 1 < pHi) {                      // Earth for reference (H ≈ 8.5 km)
    const e = []; for (let i = 0; i <= 60; i++) { const h = i / 60 * top, p = Math.exp(-h / 8.5); if (p >= pLo) e.push(`${sx(p).toFixed(1)},${sy(h).toFixed(1)}`); }
    s += `<polyline points="${e.join(" ")}" fill="none" stroke="${C_DIM}" stroke-width="1.5" stroke-dasharray="4 3"${tipAttr("Earth's atmosphere, scale height ≈ 8.5 km")}/>`;
  }
  s += `<line x1="${l}" y1="${sy(Hkm)}" x2="${sx(P0 / Math.E)}" y2="${sy(Hkm)}" stroke="${SER[1]}" stroke-width="1" stroke-dasharray="3 3"/><line x1="${sx(P0 / Math.E)}" y1="${sy(Hkm)}" x2="${sx(P0 / Math.E)}" y2="${sy(0)}" stroke="${SER[1]}" stroke-width="1" stroke-dasharray="3 3"/><circle cx="${sx(P0 / Math.E)}" cy="${sy(Hkm)}" r="3.5" fill="${SER[1]}"${tipAttr(`One scale height: ${fmt(Hkm, 2)} km, pressure falls to 1/e (37%)`)}/>`;
  s += `<line class="xh" x1="0" y1="0" x2="0" y2="0" opacity="0"/></svg>`;
  const legend = `<div class="legend2"><span class="lg"><i style="background:${SER[0]}"></i>this atmosphere</span><span class="lg"><i style="background:${C_DIM}"></i>Earth (dashed)</span><span class="lg"><i style="background:${SER[1]}"></i>one scale height</span></div>`;
  return chart("Atmosphere: pressure with altitude", s + legend + tiles([
    ["Mean molecular mass", `${fmt(mu, 2)} g/mol`, "from the composition", "μ = Σ xᵢ·mᵢ over the listed gases"],
    ["Scale height", `${fmt(Hkm, 2)} km`, `Earth ≈ 8.5 km`, "H = R·T / (μ·g)"],
    ["Surface pressure", `${fmt(P0, P0 < 0.01 ? 5 : 3)} atm`, `${fmt(b.surfacePressure / 1000, 2)} kPa`],
  ]), "Isothermal approximation at the surface temperature. Real atmospheres cool with height, so this is only a first-order profile.");
}

// --- derived quantities
function derivedTiles(b) {
  if (b.type === "Star" || !b.earthMasses || !b.radius) return "";
  const M = b.earthMasses * EARTH_KG, R = b.radius * 1000, vesc = Math.sqrt(2 * G_SI * M / R) / 1000;
  const par = S.byId.get(S.parentOf.get(b.bodyId));
  let hill = null, roche = null;
  if (par && par.type !== "Barycentre" && b.semiMajorAxis) {
    const Mp = par._mass, a = b.semiMajorAxis * AU_MM * 1e6;             // Earth masses, m
    hill = a * (1 - (b.orbitalEccentricity || 0)) * Math.cbrt(b.earthMasses / (3 * Mp));      // m
    if (par.type !== "Star") roche = 2.44 * par._r * 1e6 * Math.cbrt(density(par.earthMasses || 0, par.radius || 1) / density(b.earthMasses, b.radius));
  }
  const day = Math.abs(b.rotationalPeriod || 0) * 86400, vRot = day ? 2 * Math.PI * R / day : 0;
  return chart("Derived physics", tiles([
    ["Bulk density", `${fmt(density(b.earthMasses, b.radius), 2)} g/cm³`, "Earth 5.51", "ρ = M / (4/3 π R³)"],
    ["Escape velocity", `${fmt(vesc, 2)} km/s`, "Earth 11.19", "v = √(2GM/R)"],
    ["Surface gravity", `${fmt(b.gravity, 3)} g`, `${fmt(b.gravity * 9.80665, 2)} m/s²`],
    vRot ? ["Equator spin speed", `${fmt(vRot, vRot < 10 ? 2 : 0)} m/s`, `${fmt(vRot * 3.6, 0)} km/h`, "2πR / rotation period"] : null,
    hill ? ["Hill sphere", fmtDist(hill / 1e6), `around ${esc(shortName(par, S.sys.name))}`, "r_H ≈ a(1−e)·∛(m / 3M): moons inside it can stay bound"] : null,
    roche ? ["Roche limit", fmtDist(roche / 1e6), `orbit is ${fmt(b.semiMajorAxis * AU_MM * 1e6 / roche, 1)}× that`, "d ≈ 2.44 R_parent ∛(ρ_parent/ρ_body), fluid body"] : null,
  ]), "Computed from the catalogue mass, radius and orbit with standard formulas (hover a tile for the formula).");
}

// --- which body causes the dimming (the one covering most of the star's disc)
// first moment after now when the star is (almost) fully back, as seen from the body's centre; null if not within 3 days
