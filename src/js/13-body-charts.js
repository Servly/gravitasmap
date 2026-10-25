// =====================================================================
// Body panel charts (inline SVG, no libraries). Palette validated on the
// panel surface (#130c22): blue, orange, aqua, yellow, magenta.
// =====================================================================
const SER = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
const C_TXT = "#e9ddff", C_DIM = "#9d8cc0", C_GRID = "rgba(255,255,255,.09)", C_SURF = "#130c22", C_SEL = "#ff6ad5";
const GRADE = { Carbon: 1, Iron: 1, Lead: 1, Nickel: 1, Phosphorus: 1, Rhenium: 1, Sulphur: 1,
  Arsenic: 2, Chromium: 2, Germanium: 2, Manganese: 2, Vanadium: 2, Zinc: 2, Zirconium: 2,
  Boron: 3, Cadmium: 3, Mercury: 3, Molybdenum: 3, Niobium: 3, Tin: 3, Tungsten: 3,
  Antimony: 4, Polonium: 4, Ruthenium: 4, Selenium: 4, Technetium: 4, Tellurium: 4, Yttrium: 4 };
const ELEM = { Carbon: "C", Iron: "Fe", Lead: "Pb", Nickel: "Ni", Phosphorus: "P", Rhenium: "Re", Sulphur: "S", Arsenic: "As", Chromium: "Cr", Germanium: "Ge",
  Manganese: "Mn", Vanadium: "V", Zinc: "Zn", Zirconium: "Zr", Boron: "B", Cadmium: "Cd", Mercury: "Hg", Molybdenum: "Mo", Niobium: "Nb", Tin: "Sn", Tungsten: "W",
  Antimony: "Sb", Polonium: "Po", Ruthenium: "Ru", Selenium: "Se", Technetium: "Tc", Tellurium: "Te", Yttrium: "Y" };
const GRADE_NAME = ["", "Very common", "Common", "Standard", "Rare", "Very rare"];
const GRADE_COL = ["", "#1c4a86", "#2f6fc0", "#5598e7", "#9cc4f3", "#e0ecfb"];        // ordinal ramp, rarer = brighter
const SEQ = ["#1a1530", "#104281", "#1c5cab", "#2a78d6", "#5598e7", "#86b6ef", "#b7d3f6"]; // heat: near-zero recedes to surface
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const tipAttr = t => ` data-tip="${esc(t)}"`;
const svgOpen = (w, h) => `<svg viewBox="0 0 ${w} ${h}" width="100%" style="display:block;overflow:visible" font-family="Segoe UI,system-ui,sans-serif">`;
const chart = (title, body, note) => `<div class="chart"><div class="ct">${title}</div>${body}${note ? `<div class="cn">${note}</div>` : ""}</div>`;

// --- log strip: one track, every body of the system as a faint dot, the selected one highlighted
function logStrip(title, key, unit, lo, hi, ticks, fmtv, opts = {}) {
  const W = 360, H = opts.gradient ? 46 : 40, x0 = 6, x1 = W - 6, y = 16;
  const sx = v => x0 + (Math.log10(Math.max(v, lo)) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)) * (x1 - x0);
  const cur = opts.get ? opts.get(selected) : selected[key];
  if (cur == null || isNaN(cur)) return "";
  let s = svgOpen(W, H);
  if (opts.gradient) {
    s += `<defs><linearGradient id="g_${key}" x1="0" x2="1"><stop offset="0" stop-color="#5a8cff"/><stop offset=".45" stop-color="#9ad0ff"/><stop offset=".62" stop-color="#d8ff7a"/><stop offset=".8" stop-color="#ffb24a"/><stop offset="1" stop-color="#ff5a5a"/></linearGradient></defs>`;
    s += `<rect x="${x0}" y="${y - 3}" width="${x1 - x0}" height="6" rx="3" fill="url(#g_${key})" opacity=".55"/>`;
  } else s += `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${C_GRID}" stroke-width="2" stroke-linecap="round"/>`;
  for (const [v, lbl] of ticks) {
    const x = sx(v);
    s += `<line x1="${x}" y1="${y + 5}" x2="${x}" y2="${y + 9}" stroke="${C_DIM}" stroke-width="1"/><text x="${x}" y="${y + 20}" fill="${C_DIM}" font-size="9" text-anchor="middle">${lbl}</text>`;
  }
  for (const o of S.bodies) {
    if (o === selected || (opts.filter && !opts.filter(o))) continue;
    const v = opts.get ? opts.get(o) : o[key];
    if (v == null || isNaN(v)) continue;
    s += `<circle cx="${sx(v)}" cy="${y}" r="3" fill="${C_DIM}" opacity=".55"${tipAttr(`${shortName(o, S.sys.name)}: ${fmtv(v)}`)}/>`;
  }
  s += `<circle cx="${sx(cur)}" cy="${y}" r="6" fill="${C_SEL}" stroke="${C_SURF}" stroke-width="2"${tipAttr(`${shortName(selected, S.sys.name)}: ${fmtv(cur)}`)}/></svg>`;
  return `<div class="strip"><div class="sl"><span>${title}</span><b>${fmtv(cur)}${unit}</b></div>${s}</div>`;
}

// --- 100 % stacked bar with legend
function stackedBar(entries, unitLabel = "%") {
  entries = entries.filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return "";
  if (entries.length > 5) { const rest = entries.slice(4).reduce((t, e) => t + e[1], 0); entries = [...entries.slice(0, 4), ["Other", rest]]; }
  const W = 360, H = 18, tot = entries.reduce((t, e) => t + e[1], 0);
  let x = 0, s = svgOpen(W, H);
  entries.forEach(([k, v], i) => {
    const w = (v / tot) * W, gap = i < entries.length - 1 ? 2 : 0;
    s += `<rect x="${x}" y="0" width="${Math.max(w - gap, 0.5)}" height="${H}" rx="${i === 0 || i === entries.length - 1 ? 4 : 0}" fill="${SER[i]}"${tipAttr(`${k}: ${fmt(v, 2)} ${unitLabel}`)}/>`;
    x += w;
  });
  s += "</svg>";
  const legend = entries.map(([k, v], i) => `<span class="lg"><i style="background:${SER[i]}"></i>${k} <b>${fmt(v, 1)}%</b></span>`).join("");
  return s + `<div class="legend2">${legend}</div>`;
}

// --- horizontal bars (materials) coloured by grade
function materialBars(mats) {
  const ent = Object.entries(mats).sort((a, b) => b[1] - a[1]);
  const W = 360, rowH = 16, lw = 82, H = ent.length * rowH + 4, max = ent[0][1];
  let s = svgOpen(W, H);
  ent.forEach(([k, v], i) => {
    const g = GRADE[k] || 3, y = i * rowH + 2, w = (v / max) * (W - lw - 44);
    s += `<text x="${lw - 6}" y="${y + 11}" fill="${C_TXT}" font-size="10.5" text-anchor="end">${k}</text>`;
    s += `<rect x="${lw}" y="${y + 2}" width="${Math.max(w, 2)}" height="11" rx="3" fill="${GRADE_COL[g]}"${tipAttr(`${k}: ${fmt(v, 2)} % · grade ${g} (${GRADE_NAME[g]})`)}/>`;
    s += `<text x="${lw + w + 5}" y="${y + 11}" fill="${C_DIM}" font-size="10">${fmt(v, 1)}%</text>`;
  });
  s += "</svg>";
  const used = [...new Set(ent.map(([k]) => GRADE[k] || 3))].sort();
  return s + `<div class="legend2">${used.map(g => `<span class="lg"><i style="background:${GRADE_COL[g]}"></i>G${g} ${GRADE_NAME[g]}</span>`).join("")}</div>`;
}

// --- materials heat map across the system's bodies that have material data
function materialHeatmap() {
  const rows = S.bodies.filter(b => b.materials && Object.keys(b.materials).length);
  if (rows.length < 2) return "";
  const cols = [...new Set(rows.flatMap(b => Object.keys(b.materials)))].sort((a, b) => (GRADE[a] || 3) - (GRADE[b] || 3) || a.localeCompare(b));
  const lw = 58, cw = Math.min(22, (360 - lw) / cols.length), ch = 16, stag = cw < 16, top = stag ? 34 : 20, W = lw + cw * cols.length, H = top + rows.length * ch + 4;
  const max = Math.max(...rows.flatMap(b => Object.values(b.materials)));
  const shade = v => v <= 0 ? "rgba(255,255,255,.03)" : SEQ[Math.min(SEQ.length - 1, 1 + Math.floor((v / max) * (SEQ.length - 1.001)))];
  let s = svgOpen(W, H);
  cols.forEach((c, j) => {                                         // narrow columns: symbols alternate between two lines so none overlap
    const yy = stag && j % 2 ? top - 4 : stag ? top - 17 : top - 6, x = lw + j * cw + cw / 2;
    if (stag) s += `<line x1="${x}" y1="${yy + 2}" x2="${x}" y2="${top - 1}" stroke="${C_GRID}"/>`;
    s += `<text x="${x}" y="${yy}" fill="${C_TXT}" font-size="11" font-weight="600" text-anchor="middle"${tipAttr(c)}>${ELEM[c] || c.slice(0, 2)}</text>`;
  });
  rows.forEach((b, i) => {
    const y = top + i * ch, sel = b === selected;
    s += `<text x="${lw - 4}" y="${y + 12}" fill="${sel ? C_SEL : C_TXT}" font-size="11" text-anchor="end" font-weight="${sel ? 700 : 400}">${esc(shortName(b, S.sys.name)).slice(0, 9)}</text>`;
    cols.forEach((c, j) => {
      const v = b.materials[c] || 0;
      s += `<rect x="${lw + j * cw + 1}" y="${y + 1}" width="${cw - 2}" height="${ch - 2}" rx="2" fill="${shade(v)}"${tipAttr(`${shortName(b, S.sys.name)} · ${c}: ${v ? fmt(v, 2) + " %" : "none"}`)}/>`;
    });
    if (sel) s += `<rect x="${lw - 1}" y="${y}" width="${cw * cols.length + 2}" height="${ch}" fill="none" stroke="${C_SEL}" stroke-width="1.5" rx="3"/>`;
  });
  s += "</svg>";
  const scale = `<div class="legend2"><span class="lg">0 %</span>${SEQ.slice(1).map(c => `<i class="sq" style="background:${c}"></i>`).join("")}<span class="lg">${fmt(max, 0)} %</span></div>`;
  return chart("Materials across this system", s + scale, "Columns are the chemical symbols, ordered common → rare (hover a symbol or cell for the full name). Highlighted row = selected body.");
}

// --- tilt & rotation dial
function rotationDial(b) {
  if (b.axialTilt == null && b.rotationalPeriod == null) return "";
  const W = 360, H = 110, cx = 64, cy = 55, R = 34, t = b.axialTilt || 0, retro = (b.rotationalPeriod || 0) < 0;
  const ax = Math.sin(t), ay = -Math.cos(t);
  let s = svgOpen(W, H);
  s += `<line x1="${cx - 56}" y1="${cy}" x2="${cx + 56}" y2="${cy}" stroke="${C_GRID}" stroke-width="1.5"/>`;
  s += `<text x="${cx + 58}" y="${cy + 3}" fill="${C_DIM}" font-size="9">orbit plane</text>`;
  s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#2a2140" stroke="${C_DIM}" stroke-width="1"/>`;
  s += `<line x1="${cx - ay * R}" y1="${cy + ax * R}" x2="${cx + ay * R}" y2="${cy - ax * R}" stroke="${C_DIM}" stroke-width="1" stroke-opacity=".6"/>`;
  s += `<line x1="${cx - ax * (R + 14)}" y1="${cy - ay * (R + 14)}" x2="${cx + ax * (R + 14)}" y2="${cy + ay * (R + 14)}" stroke="${SER[0]}" stroke-width="2" stroke-linecap="round"${tipAttr(`Axial tilt ${fmt(t / DEG, 2)}°`)}/>`;
  const px = cx + ax * (R + 16), py = cy + ay * (R + 16);
  s += `<path d="M ${px - 7} ${py} a 7 3 0 1 ${retro ? 0 : 1} 14 0" fill="none" stroke="${SER[1]}" stroke-width="1.6"/><text x="${px + 9}" y="${py - 4}" fill="${SER[1]}" font-size="9">${retro ? "retrograde" : "prograde"}</text>`;
  const day = Math.abs(b.rotationalPeriod || 0), yr = b.orbitalPeriod || 0;
  const lines = [
    ["Axial tilt", `${fmt(t / DEG, 1)}°`],
    ["Day length", day ? (day < 2 ? `${fmt(day * 24, 1)} h` : `${fmt(day, 2)} d`) : "—"],
    ["Year length", yr ? (yr < 2 ? `${fmt(yr * 24, 1)} h` : `${fmt(yr, 1)} d`) : "—"],
    ["Days per year", day && yr ? fmt(yr / day, 1) : "—"],
    ["Locked", b.rotationalPeriodTidallyLocked ? "tidally locked" : "no"],
  ];
  lines.forEach(([k, v], i) => s += `<text x="190" y="${20 + i * 17}" fill="${C_DIM}" font-size="10.5">${k}</text><text x="282" y="${20 + i * 17}" fill="${C_TXT}" font-size="10.5" font-weight="600">${v}</text>`);
  return chart("Rotation & tilt", s + "</svg>", "Spin speed and direction come from the data. The current spin phase does not.");
}

// --- true world positions at an arbitrary time (does not touch S.world)
function worldAt(t) {
  const W = new Map();
  const get = id => {
    if (W.has(id)) return W.get(id);
    const par = S.parentOf.get(id); let p;
    if (id === 0 || par === undefined) p = { x: 0, y: 0, z: 0 };
    else { const pp = get(par), r = relPos(S.byId.get(id), t); p = { x: pp.x + r.x, y: pp.y + r.y, z: pp.z + r.z }; }
    W.set(id, p); return p;
  };
  for (const b of S.bodies) get(b.bodyId);
  return W;
}
function starlightAt(b, star, W) {
  const pb = W.get(b.bodyId), ps = W.get(star.bodyId);
  const L = { x: ps.x - pb.x, y: ps.y - pb.y, z: ps.z - pb.z }, dL = Math.hypot(L.x, L.y, L.z), aS = Math.asin(Math.min(star._r / dL, 1));
  let vis = 1;
  for (const o of S.bodies) {
    if (o === b || o === star) continue;
    const po = W.get(o.bodyId), v = { x: po.x - pb.x, y: po.y - pb.y, z: po.z - pb.z }, dO = Math.hypot(v.x, v.y, v.z);
    const dp = v.x * L.x + v.y * L.y + v.z * L.z;
    if (dO >= dL || dp <= 0) continue;
    const aO = Math.asin(Math.min(o._r / dO, 1));
    const sep = Math.atan2(Math.hypot(v.y * L.z - v.z * L.y, v.z * L.x - v.x * L.z, v.x * L.y - v.y * L.x), dp);
    vis *= 1 - discCoverJS(aS, aO, sep);
  }
  return vis;
}

// --- orbit diagram (top-down, true shape), with light direction and the parent's shadow
function orbitDiagram(b) {
  const par = S.parentOf.get(b.bodyId);
  if (b.semiMajorAxis == null || par === undefined) return "";
  const W = 360, H = 220, cx = W / 2, cy = H / 2;
  const pts = []; for (let i = 0; i <= 180; i++) pts.push(relPos(b, 0, (i / 180) * 2 * Math.PI));
  const now = relPos(b, simTime), pe = relPos(b, 0, 0), ap = relPos(b, 0, Math.PI);
  const ext = Math.max(...pts.map(p => Math.max(Math.abs(p.x), Math.abs(p.y)))) || 1, sc = (Math.min(W, H) / 2 - 22) / ext;
  const P = p => [cx + p.x * sc, cy - p.y * sc];
  let s = svgOpen(W, H);
  // light direction from the star(s)
  const Wd = S.world, pw = Wd.get(par);
  const parentBody = S.byId.get(par), star = S.main && S.main !== parentBody ? S.main : null;
  if (star && pw) {
    const sw = Wd.get(star.bodyId), dx = sw.x - pw.x, dy = sw.y - pw.y, dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl;
    if (parentBody && parentBody.type !== "Barycentre") {   // shadow cone of the parent (eclipse zone)
      const r = Math.max(parentBody._r * sc, 2), L = ext * sc * 1.15, nx = -uy, ny = ux;
      s += `<polygon points="${cx + nx * r},${cy - ny * r} ${cx - nx * r},${cy + ny * r} ${cx - nx * r - ux * L},${cy + ny * r + uy * L} ${cx + nx * r - ux * L},${cy - ny * r + uy * L}" fill="#000" opacity=".45"${tipAttr("Parent's shadow: the body is eclipsed when it crosses this band")}/>`;
    }
    const ex = cx + ux * (Math.min(W, H) / 2 - 6), ey = cy - uy * (Math.min(W, H) / 2 - 6);
    s += `<line x1="${ex - ux * 26}" y1="${ey + uy * 26}" x2="${ex}" y2="${ey}" stroke="#ffcf7a" stroke-width="2" marker-end="url(#ar)"/>`;
    s += `<defs><marker id="ar" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#ffcf7a"/></marker></defs>`;
    s += `<text x="${ex - ux * 34}" y="${ey + uy * 34 - 4}" fill="#ffcf7a" font-size="9.5" text-anchor="middle">to ${esc(shortName(star, S.sys.name))}</text>`;
  }
  s += `<polyline points="${pts.map(p => P(p).join(",")).join(" ")}" fill="none" stroke="${SER[0]}" stroke-width="1.6"/>`;
  const pr = parentBody && parentBody.type !== "Barycentre" ? Math.max(parentBody._r * sc, 3) : 3;
  s += `<circle cx="${cx}" cy="${cy}" r="${Math.min(pr, 40)}" fill="${parentBody && parentBody.type === "Barycentre" ? "none" : "#5a4a80"}" stroke="${C_DIM}"${tipAttr(parentBody ? shortName(parentBody, S.sys.name) : "Barycentre")}/>`;
  const [pex, pey] = P(pe), [apx, apy] = P(ap), [nx2, ny2] = P(now);
  const a = (b.semiMajorAxis || 0) * AU_LS * LS_MM, e = b.orbitalEccentricity || 0;
  s += `<circle cx="${pex}" cy="${pey}" r="3" fill="${SER[2]}"${tipAttr(`Periapsis ${fmtDist(a * (1 - e))}`)}/><text x="${pex + 5}" y="${pey - 5}" fill="${SER[2]}" font-size="9">Pe</text>`;
  s += `<circle cx="${apx}" cy="${apy}" r="3" fill="${SER[3]}"${tipAttr(`Apoapsis ${fmtDist(a * (1 + e))}`)}/><text x="${apx + 5}" y="${apy - 5}" fill="${SER[3]}" font-size="9">Ap</text>`;
  s += `<circle cx="${nx2}" cy="${ny2}" r="6" fill="${C_SEL}" stroke="${C_SURF}" stroke-width="2"${tipAttr(`${shortName(b, S.sys.name)} now`)}/>`;
  s += "</svg>";
  const legend = `<div class="legend2"><span class="lg"><i style="background:${SER[0]}"></i>orbit</span><span class="lg"><i style="background:${C_SEL}"></i>now</span><span class="lg"><i style="background:${SER[2]}"></i>periapsis ${fmtDist(a * (1 - e))}</span><span class="lg"><i style="background:${SER[3]}"></i>apoapsis ${fmtDist(a * (1 + e))}</span></div>`;
  return chart(`Orbit around ${parentBody ? esc(shortName(parentBody, S.sys.name)) : "barycentre"} (top view, true shape)`, s + legend);
}

// --- generic small line chart with crosshair tooltip
function lineChart(id, xs, ys, { yMin, yMax, yFmt, xFmt, area = false, color = SER[0], marks = [] }) {
  const W = 360, H = 120, l = 40, r = 8, t = 8, bt = 20;
  const sx = i => l + (xs[i] - xs[0]) / (xs[xs.length - 1] - xs[0]) * (W - l - r), sy = v => t + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - t - bt);
  let s = svgOpen(W, H);
  for (let k = 0; k <= 2; k++) { const v = yMin + (yMax - yMin) * k / 2, y = sy(v); s += `<line x1="${l}" y1="${y}" x2="${W - r}" y2="${y}" stroke="${C_GRID}"/><text x="${l - 4}" y="${y + 3}" fill="${C_DIM}" font-size="9" text-anchor="end">${yFmt(v)}</text>`; }
  for (let k = 0; k <= 3; k++) { const i = Math.round((xs.length - 1) * k / 3); s += `<text x="${sx(i)}" y="${H - 5}" fill="${C_DIM}" font-size="9" text-anchor="${k === 0 ? "start" : k === 3 ? "end" : "middle"}">${xFmt(xs[i])}</text>`; }
  const d = ys.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join("");
  if (area) s += `<path d="${d}L${sx(ys.length - 1)},${sy(yMin)}L${sx(0)},${sy(yMin)}Z" fill="${color}" opacity=".18"/>`;
  s += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
  for (const m of marks) s += `<line x1="${sx(m.i)}" y1="${t}" x2="${sx(m.i)}" y2="${H - bt}" stroke="${m.color || C_SEL}" stroke-width="1.2"/><text x="${sx(m.i) + 3}" y="${t + 9}" fill="${m.color || C_SEL}" font-size="9">${m.label}</text>`;
  s += `<line class="xh" x1="0" y1="${t}" x2="0" y2="${H - bt}" stroke="${C_TXT}" stroke-width="1" opacity="0"/>`;
  s += `<rect x="${l}" y="${t}" width="${W - l - r}" height="${H - t - bt}" fill="transparent" data-line="${id}"/></svg>`;
  LINES[id] = { xs, ys, l, r, W, xFmt, yFmt };
  return s;
}
const LINES = {};

// --- starlight over the coming days, with eclipse list
function starlightChart(b) {
  if (b.type === "Star" || !S.main) return "";
  const st = hostStar(b), P = b.orbitalPeriod || 1, span = Math.min(Math.max(P * 3, 3), 60);
  const sc = eclipseScan(b, st, span, Math.round(Math.min(3000, Math.max(480, span * 24 * 3))));
  let s = lineChart("light", sc.xs, sc.ys, { yMin: 0, yMax: 100, yFmt: v => fmt(v, 0) + "%", xFmt: d => d === 0 ? "now" : `+${fmt(d, 1)} d`, area: true, color: "#ffcf7a",
    marks: sc.events.slice(0, 6).map(e => ({ i: e.m, label: nm(e.w.by), color: "#ffcf7a" })) });
  return chart(`Starlight from ${nm(st)}, next ${fmt(span, 0)} days`, s + (sc.events.length ? "" : `<div class="ev dim">No eclipses in this window.</div>`),
"The name on each dip is the body blocking the star. Hover the curve for exact times. The Sky tab has the full eclipse calendar.");
}

// --- distance to parent over one orbit
function distanceChart(b) {
  const par = S.parentOf.get(b.bodyId);
  if (b.semiMajorAxis == null || par === undefined || !b.orbitalPeriod) return "";
  const P = b.orbitalPeriod, N = 240, xs = [], ys = [];
  for (let i = 0; i < N; i++) { const t = simTime + (i / (N - 1)) * P * 86400000, r = relPos(b, t); xs.push(i / (N - 1) * P); ys.push(Math.hypot(r.x, r.y, r.z)); }
  const mn = Math.min(...ys), mx = Math.max(...ys), pad = (mx - mn) * 0.15 || mx * 0.01;
  const iMin = ys.indexOf(mn);
  const s = lineChart("dist", xs, ys, { yMin: mn - pad, yMax: mx + pad, yFmt: (mx - mn) / mx < 0.05 ? (v => `${fmt(v * 1000, 0)} km`) : fmtDist, xFmt: d => d === 0 ? "now" : `+${fmt(d, P < 3 ? 2 : 0)} d`, color: SER[0], marks: [{ i: iMin, label: "Pe", color: SER[2] }] });
  const parentBody = S.byId.get(par);
  return chart(`Distance to ${parentBody ? esc(shortName(parentBody, S.sys.name)) : "barycentre"} over one orbit`, s);
}

// --- signals bar
function signalsChart(b) {
  const sig = b.signals && (b.signals.signals || b.signals);
  if (!sig || typeof sig !== "object") return "";
  const names = { Biological: "Biological", Geological: "Geological", PlanetaryMiningLocation: "Mining sites", Human: "Human", Guardian: "Guardian", Thargoid: "Thargoid", Other: "Other" };
  const ent = Object.entries(sig).filter(([, v]) => typeof v === "number").map(([k, v]) => [Object.keys(names).find(x => k.includes(x)) ? names[Object.keys(names).find(x => k.includes(x))] : k.replace(/[$;_]/g, " ").trim(), v, k]).sort((a, c) => c[1] - a[1]);
  if (!ent.length) return "";
  const W = 360, rowH = 20, lw = 86, max = Math.max(...ent.map(e => e[1])), H = ent.length * rowH;
  let s = svgOpen(W, H);
  ent.forEach(([k, v, raw], i) => {
    const y = i * rowH, w = (v / max) * (W - lw - 30);
    s += `<text x="${lw - 6}" y="${y + 13}" fill="${C_TXT}" font-size="10.5" text-anchor="end">${k}</text><rect x="${lw}" y="${y + 4}" width="${Math.max(w, 3)}" height="12" rx="3" fill="${SER[0]}"${tipAttr(`${k}: ${v} · Spansh field "${raw}"`)}/><text x="${lw + w + 5}" y="${y + 14}" fill="${C_DIM}" font-size="10">${v}</text>`;
  });
  const gen = (b.genuses || b.signals.genuses || []).map(g => g.replace(/\$Codex_Ent_|_Genus_Name;|_Name;/g, "").replace(/_/g, " "));
  const src = `Counts and genus names come straight from Spansh (players' scan data)${(b.signals && b.signals.updateTime ? " · updated " + esc(String(b.signals.updateTime).slice(0, 10)) : "")}. Hover a bar for the raw field name.`;
  return chart("Signals", s + "</svg>" + (gen.length ? `<div class="chips">${gen.map(g => `<span class="chip">🧬 ${esc(g)}</span>`).join("")}</div>` : ""), src);
}

// --- ring cross-section to scale
function ringProfile(b) {
  if (!b.rings || !b.rings.length) return "";
  const W = 360, H = 64, R = (b.radius || 1000), maxR = Math.max(...b.rings.map(r => r.outerRadius / 1000)) * 1.04, sx = v => 6 + (v / maxR) * (W - 12);
  const col = t => /Icy/i.test(t) ? "#b7d3f6" : /Metal Rich/i.test(t) ? "#8a7a70" : /Metallic/i.test(t) ? "#b0a89c" : "#c9a87a";
  let s = svgOpen(W, H).replace("overflow:visible", "overflow:hidden");
  s += `<circle cx="6" cy="${H / 2}" r="${sx(R) - 6}" fill="#5a4a80"${tipAttr(`Planet radius ${fmt(R, 0)} km`)}/>`;
  b.rings.forEach((r, i) => {
    const x0 = sx(r.innerRadius / 1000), x1 = sx(r.outerRadius / 1000);
    s += `<rect x="${x0}" y="${H / 2 - 5}" width="${Math.max(x1 - x0 - 2, 1)}" height="10" rx="2" fill="${col(r.type)}"${tipAttr(`${r.name.split(" ").slice(-2).join(" ")} · ${r.type} · ${fmt(r.innerRadius / 1000, 0)}–${fmt(r.outerRadius / 1000, 0)} km · ${fmt(r.mass, 0)} Mt`)}/>`;
    s += `<text x="${(x0 + x1) / 2}" y="${H / 2 - 9}" fill="${C_DIM}" font-size="9" text-anchor="middle">${r.name.split(" ").slice(-2, -1)[0]} · ${r.type}</text>`;
  });
  s += `<text x="${W - 6}" y="${H - 2}" fill="${C_DIM}" font-size="9" text-anchor="end">${fmt(maxR / R, 1)} × planet radius</text></svg>`;
  return chart("Rings, to scale", s);
}

// tooltips & crosshair (one shared tooltip element)
const tip = document.createElement("div"); tip.id = "tip"; document.body.appendChild(tip);
document.addEventListener("mousemove", e => {
  lastMouse = [e.clientX, e.clientY];
  const t = e.target.closest && e.target.closest("[data-tip],[data-line]");
  if (!t || !$("info").contains(t)) { tip.style.display = "none"; document.querySelectorAll(".xh").forEach(x => x.setAttribute("opacity", 0)); return; }
  let text = t.dataset.tip;
  if (t.dataset.line) {
    const L = LINES[t.dataset.line], svg = t.ownerSVGElement, pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const f = Math.max(0, Math.min(1, (p.x - L.l) / (L.W - L.l - L.r))), i = Math.round(f * (L.xs.length - 1));
    const xh = svg.querySelector(".xh"); xh.setAttribute("x1", p.x); xh.setAttribute("x2", p.x); xh.setAttribute("opacity", 0.5);
    text = `${L.xFmt(L.xs[i])} · ${L.at ? L.at(i) : L.yFmt(L.ys[i])}`;
  }
  tip.textContent = text; tip.style.display = "block";
  tip.style.left = Math.min(e.clientX + 12, innerWidth - tip.offsetWidth - 8) + "px"; tip.style.top = (e.clientY + 14) + "px";
});

// --- phase & light diagram (after the classic exoplanet phase-curve figure):
// an oblique view of the orbit with the body drawn at several moments, each lit
// on the side facing the star, and below it the light curve over one orbit.
function litPath(cx, cy, r, th, alpha) {      // th: screen angle of the light (svg, y down); alpha: phase angle
  const a1 = th + Math.PI / 2, a2 = th - Math.PI / 2, rx = r * Math.abs(Math.cos(alpha));
  const A = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)], B = [cx + r * Math.cos(a2), cy + r * Math.sin(a2)];
  return `M${A[0].toFixed(2)},${A[1].toFixed(2)} A${r},${r} 0 0 0 ${B[0].toFixed(2)},${B[1].toFixed(2)} A${rx.toFixed(2)},${r} ${(th * 180 / Math.PI).toFixed(1)} 0 ${alpha < Math.PI / 2 ? 0 : 1} ${A[0].toFixed(2)},${A[1].toFixed(2)}Z`;
}
function phaseDiagram(b) {
  const parId = S.parentOf.get(b.bodyId), par = S.byId.get(parId), star = S.main;
  if (b.type === "Star" || b.semiMajorAxis == null || parId === undefined || !b.orbitalPeriod || !star) return "";
  const P = b.orbitalPeriod, E = 20 * DEG, sE = Math.sin(E), cE = Math.cos(E);
  const starCentre = par === star;
  // rotate the frame so the star sits to the left (or at the centre when it is the parent)
  let phi = 0;
  if (!starCentre) { const w = S.world, sp = w.get(star.bodyId), pp = w.get(parId); phi = Math.PI - Math.atan2(sp.y - pp.y, sp.x - pp.x); }
  const cphi = Math.cos(phi), sphi = Math.sin(phi);
  const rot = v => ({ x: v.x * cphi - v.y * sphi, y: v.x * sphi + v.y * cphi, z: v.z });
  const W = 360, H = 176, cx = W / 2, cy = 92;
  const ring = []; for (let i = 0; i <= 180; i++) ring.push(rot(relPos(b, 0, (i / 180) * 2 * Math.PI)));
  const partners = par && par.type === "Barycentre" ? (S.children.get(parId) || []).map(id => S.byId.get(id)).filter(o => o && o !== b && o.semiMajorAxis != null && o.type !== "Barycentre") : [];
  const pNow = partners.map(o => rot(relPos(o, simTime)));
  const ext = Math.max(...ring.map(p => Math.abs(p.x)), ...ring.map(p => Math.abs(p.y) * 1.0), ...pNow.map(p => Math.hypot(p.x, p.y))) || 1, sc = (W / 2 - 26) / ext;
  const proj = p => [cx + p.x * sc, cy - (p.y * sE + p.z * cE) * sc];
  const depth = p => p.y * cE - p.z * sE;
  const V = { x: 0, y: -cE, z: sE }, U = { x: 0, y: sE, z: cE };
  const fromParent = (L, rel) => {    // lit fraction of the face seen from the parent (like our Moon from Earth)
    const n1 = Math.hypot(L.x, L.y, L.z) || 1, n2 = Math.hypot(rel.x, rel.y, rel.z) || 1;
    return (1 - (L.x * rel.x + L.y * rel.y + L.z * rel.z) / (n1 * n2)) / 2;
  };
  const phaseOf = L => {          // returns [screen angle of light, phase angle, visible lit fraction]
    const n = Math.hypot(L.x, L.y, L.z) || 1, l = { x: L.x / n, y: L.y / n, z: L.z / n };
    const alpha = Math.acos(Math.max(-1, Math.min(1, l.x * V.x + l.y * V.y + l.z * V.z)));
    return [Math.atan2(-(l.x * U.x + l.y * U.y + l.z * U.z), l.x), alpha, (1 + Math.cos(alpha)) / 2];
  };
  // light curve samples over one orbit
  const N = 600, xs = [], light = [], lit = [], whoBy = [], arcP = [];
  for (let i = 0; i < N; i++) {
    const t = simTime + (i / (N - 1)) * P * 86400000, Wt = worldAt(t), pb = Wt.get(b.bodyId), ps = Wt.get(star.bodyId);
    xs.push(i / (N - 1) * P);
    const wq = starlightWho(b, star, Wt), sl = wq.vis; light.push(sl * 100); whoBy.push(wq.by);
    const Lw = { x: ps.x - pb.x, y: ps.y - pb.y, z: ps.z - pb.z };
    const relT = relPos(b, t); arcP.push(rot(relT));
    lit.push((starCentre ? phaseOf(rot(Lw))[2] : fromParent(Lw, relT)) * sl * 100);
  }
  // the body at 12 moments
  const K = 12, snaps = [];
  for (let i = 0; i < K; i++) {
    const t = simTime + (i / K) * P * 86400000, Wt = worldAt(t), pb = Wt.get(b.bodyId), ps = Wt.get(star.bodyId);
    const rel = relPos(b, t), Lw = { x: ps.x - pb.x, y: ps.y - pb.y, z: ps.z - pb.z }, p = rot(rel), [th, alpha, f0] = phaseOf(rot(Lw));
    const f = starCentre ? f0 : fromParent(Lw, rel);
    const wq = starlightWho(b, star, Wt);
    snaps.push({ i, p, th, alpha, f, sl: wq.vis, by: wq.by, d: i / K * P });
  }
  const pc = palette(b)[0], litCol = `rgb(${pc.map(v => Math.min(255, v * 1.15 + 20) | 0)})`, darkCol = `rgb(${pc.map(v => v * 0.28 | 0)})`;
  const gid = "pd" + b.bodyId;
  let s = svgOpen(W, H) + `<defs><radialGradient id="${gid}s"><stop offset="0" stop-color="#fff6d8"/><stop offset=".55" stop-color="#ffd27a"/><stop offset="1" stop-color="#ff9a3a" stop-opacity="0"/></radialGradient>
    <linearGradient id="${gid}h" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".85"/><stop offset=".7" stop-color="#000" stop-opacity=".45"/><stop offset="1" stop-color="#000" stop-opacity=".1"/></linearGradient></defs>`;
  // parent
  const pR = starCentre ? 24 : par && par.type !== "Barycentre" ? Math.min(40, Math.max(3, par._r * sc)) : 0;   // parent drawn to the same scale as the orbit
  if (!starCentre && pR) s += `<rect x="${cx}" y="${cy - pR}" width="${W - cx}" height="${2 * pR}" fill="url(#${gid}h)"${tipAttr(`Shadow of ${shortName(par, S.sys.name)}, at true size. The orange arc on the orbit marks exactly where the body is inside a shadow.`)}/>`
    + `<text x="${W - 4}" y="${cy + pR + 10}" fill="${SER[1]}" font-size="9" text-anchor="end">shadow of ${nm(par)}</text>`;
  const ringPts = ring.map(proj);
  const half = (front) => { let d = ""; ring.forEach((p, i) => { if ((depth(p) <= 0) === front) d += `${d && (depth(ring[i - 1] || p) <= 0) === front ? "L" : "M"}${ringPts[i][0].toFixed(1)},${ringPts[i][1].toFixed(1)}`; }); return d; };
  s += `<path d="${half(false)}" fill="none" stroke="${C_TXT}" stroke-opacity=".45" stroke-width="1.2" stroke-dasharray="4 4"/>`;
  const drawSnap = o => {
    const [x, y] = proj(o.p), r = 8.5, ecl = o.sl < 0.98;
    let g = `<g${tipAttr(`${o.i === 0 ? "Now" : "+" + fmt(o.d, o.d < 3 ? 2 : 1) + " d"} · ${fmt(o.f * o.sl * 100, 0)}% lit as seen from ${starCentre ? "this viewpoint" : par && par.type !== "Barycentre" ? esc(shortName(par, S.sys.name)) : "the barycentre"} · starlight ${fmt(o.sl * 100, 0)}%${o.sl < 0.98 && o.by ? ` · eclipsed by ${shortName(o.by, S.sys.name)}` : ""}`)}>`;
    g += `<circle cx="${x}" cy="${y}" r="${r}" fill="${darkCol}" stroke="${C_SURF}" stroke-width="1.5"/>`;
    if (o.sl > 0.02) g += `<path d="${litPath(x, y, r, o.th, o.alpha)}" fill="${litCol}" opacity="${Math.max(0.15, o.sl)}"/>`;
    if (ecl) g += `<circle cx="${x}" cy="${y}" r="${r + 2.5}" fill="none" stroke="${SER[1]}" stroke-width="1.2" stroke-dasharray="2 2"/>`;
    if (o.i === 0) g += `<circle cx="${x}" cy="${y}" r="${r + 3.5}" fill="none" stroke="${C_SEL}" stroke-width="2"/><text x="${x > W - 90 ? x + r + 3 : x}" y="${y - r - 7}" fill="${C_SEL}" font-size="9.5" text-anchor="${x > W - 90 ? "end" : "middle"}" font-weight="700">${ecl ? `now · ${fmt(o.sl * 100, 0)}% light` : "now"}</text>`;
    return g + "</g>";
  };
  const back = snaps.filter(o => depth(o.p) > 0).sort((a, c) => depth(c.p) - depth(a.p)), front = snaps.filter(o => depth(o.p) <= 0).sort((a, c) => depth(c.p) - depth(a.p));
  back.forEach(o => s += drawSnap(o));
  if (starCentre) s += `<circle cx="${cx}" cy="${cy}" r="${pR * 1.9}" fill="url(#${gid}s)"/><circle cx="${cx}" cy="${cy}" r="${pR}" fill="#fff2c8"${tipAttr(shortName(star, S.sys.name))}/>`;
  else if (pR) {
    const Wn = S.world, ps = Wn.get(star.bodyId), pp = Wn.get(parId), [th, al] = phaseOf(rot({ x: ps.x - pp.x, y: ps.y - pp.y, z: ps.z - pp.z }));
    const ppc = palette(par)[0];
    s += `<g${tipAttr(`${shortName(par, S.sys.name)} (the parent this body orbits), lit from the left by ${shortName(star, S.sys.name)}`)}><circle cx="${cx}" cy="${cy}" r="${pR}" fill="rgb(${ppc.map(v => v * 0.28 | 0)})"/><path d="${litPath(cx, cy, pR, th, al)}" fill="rgb(${ppc.join(",")})"/></g><text x="${cx}" y="${cy + pR + 11}" fill="${C_TXT}" font-size="9.5" text-anchor="middle">${nm(par)}</text>`;
  } else {
    s += `<path d="M${cx - 5},${cy}h10M${cx},${cy - 5}v10" stroke="${C_DIM}" stroke-width="1.5"${tipAttr("Barycentre (centre of mass)")}/>`;
    partners.forEach((o, j) => {                               // the partner(s), where they are now
      const [x, y] = proj(pNow[j]), oc = palette(o)[0];
      s += `<g opacity=".75"${tipAttr(`${shortName(o, S.sys.name)} (partner), now`)}><circle cx="${x}" cy="${y}" r="7" fill="rgb(${oc.join(",")})"/><text x="${x}" y="${y + 18}" fill="${C_DIM}" font-size="9" text-anchor="middle">${esc(shortName(o, S.sys.name))} now</text></g>`;
    });
  }
  s += `<path d="${half(true)}" fill="none" stroke="${C_TXT}" stroke-opacity=".45" stroke-width="1.2" stroke-dasharray="4 4"/>`;
  // the part of the orbit spent in shadow, from the same calculation as the light curve below
  for (let i = 0; i < N; i++) {
    if (light[i] >= 99.5 || (i > 0 && light[i - 1] < 99.5)) continue;
    let j = i; while (j + 1 < N && light[j + 1] < 99.5) j++;
    let m = i; for (let q = i; q <= j; q++) if (light[q] < light[m]) m = q;
    const pts = arcP.slice(Math.max(0, i - 1), j + 2).map(proj);
    s += `<polyline points="${pts.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ")}" fill="none" stroke="${SER[1]}" stroke-width="4" stroke-linecap="round"${tipAttr(`In shadow here: ${shortName(b, S.sys.name)} is eclipsed by ${whoBy[m] ? shortName(whoBy[m], S.sys.name) : "?"} (${fmt((j - i + 1) / N * P * 24, 1)} h, min ${fmt(light[m], 0)}% light)`)}/>`;
    const [lx, ly] = proj(arcP[m]);
    if (whoBy[m] !== par) s += `<text x="${lx}" y="${ly + 16}" fill="${SER[1]}" font-size="9" text-anchor="middle" font-weight="600">shadow of ${nm(whoBy[m])}</text>`;
  }
  [[0, "Pe", SER[2], "Periapsis: closest to the parent"], [Math.PI, "Ap", SER[3], "Apoapsis: farthest from the parent"]].forEach(([M, lb, col, tt]) => {
    if ((b.orbitalEccentricity || 0) < 0.002) return;
    const [x, y] = proj(rot(relPos(b, 0, M)));
    s += `<g${tipAttr(tt)}><circle cx="${x}" cy="${y}" r="2.5" fill="${col}"/><text x="${x}" y="${y + 13}" fill="${col}" font-size="9" text-anchor="middle">${lb}</text></g>`;
  });
  front.forEach(o => s += drawSnap(o));
  if (!starCentre) s += `<g><line x1="40" y1="12" x2="6" y2="12" stroke="#ffcf7a" stroke-width="2" marker-end="url(#ar${gid})"/><defs><marker id="ar${gid}" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#ffcf7a"/></marker></defs><text x="46" y="15" fill="#ffcf7a" font-size="9.5">to ${esc(shortName(star, S.sys.name))}</text></g>`;
  else s += `<text x="${cx}" y="${H - 4}" fill="${C_DIM}" font-size="9" text-anchor="middle">front: transit across the star · back: hidden behind it</text>`;
  s += "</svg>";

  // light curve: two series on one 0–100 % axis
  const CW = 360, CH = 130, l = 34, r = 8, t = 10, bt = 20;
  const sx = i => l + (i / (N - 1)) * (CW - l - r), sy = v => t + (1 - v / 100) * (CH - t - bt);
  let c = svgOpen(CW, CH);
  [0, 50, 100].forEach(v => c += `<line x1="${l}" y1="${sy(v)}" x2="${CW - r}" y2="${sy(v)}" stroke="${C_GRID}"/><text x="${l - 4}" y="${sy(v) + 3}" fill="${C_DIM}" font-size="9" text-anchor="end">${v}%</text>`);
  [0, 0.25, 0.5, 0.75, 1].forEach((f, k2) => { const i = Math.round(f * (N - 1)); c += `<text x="${sx(i)}" y="${CH - 5}" fill="${C_DIM}" font-size="9" text-anchor="${k2 === 0 ? "start" : k2 === 4 ? "end" : "middle"}">${i === 0 ? "now" : "+" + fmt(xs[i], P < 3 ? 2 : 0) + " d"}</text>`; });
  const line = (ys, col, w) => `<path d="${ys.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join("")}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="round"/>`;
  c += line(lit, SER[0], 2) + line(light, "#ffcf7a", 2);
  // annotate eclipse dips
  let inE = false, a0 = 0;
  light.forEach((v, i) => {
    if (v < 99.5 && !inE) { inE = true; a0 = i; }
    if (inE && (v >= 99.5 || i === N - 1)) { inE = false; const seg = light.slice(a0, i + 1), m = a0 + seg.indexOf(Math.min(...seg));
      c += `<text x="${sx(m)}" y="${sy(light[m]) + 12}" fill="#ffcf7a" font-size="9.5" text-anchor="middle" font-weight="600">Eclipse · ${nm(whoBy[m])}</text>`; }
  });
  snaps.forEach(o => { const i = Math.round(o.i / K * (N - 1)); c += `<circle cx="${sx(i)}" cy="${sy(lit[i])}" r="2.6" fill="${SER[0]}" stroke="${C_SURF}" stroke-width="1"/>`; });
  c += `<line class="xh" x1="0" y1="${t}" x2="0" y2="${CH - bt}" stroke="${C_TXT}" stroke-width="1" opacity="0"/><rect x="${l}" y="${t}" width="${CW - l - r}" height="${CH - t - bt}" fill="transparent" data-line="phase"/></svg>`;
  LINES.phase = { xs, ys: light, l, r, W: CW, xFmt: d => d === 0 ? "now" : `+${fmt(d, P < 3 ? 2 : 1)} d`, yFmt: v => fmt(v, 0) + "%",
    at: i => `starlight ${fmt(light[i], 0)}% · phase ${fmt(lit[i], 0)}% lit` };
  const legend = `<div class="legend2"><span class="lg"><i style="background:#ffcf7a"></i>Starlight reaching the body</span><span class="lg"><i style="background:${SER[0]}"></i>${starCentre ? "Lit share seen from this viewpoint" : "Phase seen from " + (par && par.type !== "Barycentre" ? esc(shortName(par, S.sys.name)) : "the barycentre")}</span><span class="lg"><i style="background:${SER[1]}"></i>orbit arc in shadow</span></div>`;
  const where = starCentre ? `around ${esc(shortName(star, S.sys.name))}` : par && par.type !== "Barycentre" ? `around ${esc(shortName(par, S.sys.name))}` : "around its barycentre";
  return chart(`One orbit ${where}: phases & light`, s + c + legend,
    `Orbit shape, the parent's size and lighting are true. The small moon discs are enlarged. Viewed from 20° above the orbit plane${starCentre ? "" : ", turned so the star is on the left. The lit half always faces the star"}. One orbit = ${P < 2 ? fmt(P * 24, 1) + " h" : fmt(P, 2) + " d"}.`);
}

