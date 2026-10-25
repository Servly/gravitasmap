function bodyCharts(b) {
  const solid = b.type !== "Star";
  const em = o => o.earthMasses != null ? o.earthMasses : (o.solarMasses ? o.solarMasses * SUN_EM : null);
  const rkm = o => o.radius != null ? o.radius : (o.solarRadius ? o.solarRadius * 695700 : null);
  const overview = [
    solid ? logStrip("Gravity", "gravity", " g", 0.01, 10, [[0.01, "0.01"], [0.1, "0.1"], [1, "1 g Earth"], [10, "10"]], v => fmt(v, 2), { filter: o => o.type !== "Star" }) : "",
    logStrip("Surface temperature", "surfaceTemperature", "", 10, 50000, [[20, temp(20)], [273, temp(273)], [1000, temp(1000)], [10000, temp(10000)]], v => temp(v), { gradient: true }),
    logStrip("Radius", "radius", "", 100, 1e6, [[100, "100 km"], [6371, "Earth"], [69911, "Jupiter"], [695700, "Sun"]], v => `${fmt(v, 0)} km`, { get: rkm }),
    logStrip("Mass", "earthMasses", " M⊕", 1e-5, 1e6, [[1e-4, "1e-4"], [0.0123, "Moon"], [1, "Earth"], [317.8, "Jupiter"], [332946, "Sun"]], v => fmt(v, v < 0.01 ? 5 : 2), { get: em }),
    solid && b.surfacePressure ? logStrip("Surface pressure", "surfacePressure", " atm", 1e-5, 1e3, [[1e-4, "1e-4"], [0.01, "0.01"], [1, "1 atm"], [100, "100"]], v => fmt(v, v < 0.01 ? 5 : 3), { get: o => o.surfacePressure ? o.surfacePressure / 101325 : null, filter: o => o.surfacePressure > 0 }) : "",
  ].join("");
  const station = () => { const ps = bodyPorts(b).filter(p => !/^fc/.test(p.cls)); return ps.length ? chart("Stations & settlements", `<div class="chips">${ps.map(p =>
    `<span class="chip pc-${p.cls}"${tipAttr(p.tip)} ${stnSid(p.st)}>${stnGlyph(p.v || p.k, 12)} ${esc(p.name)} <i>${SURF_KINDS.includes(p.k) ? "surface" : "in orbit"}</i></span>`).join("")}</div>`,
    ps.some(p => !SURF_KINDS.includes(p.k)) ? "Stations in orbit are matched to this body from the distance last reported to Spansh. Where they sit around it is not in the data." : "") : ""; };
  const tabs = {                    // builders: re-run on every live refresh
    Overview: () => chart("Compared with the rest of this system", overview, "Each dot is a body in this system. Pink is the selected one. Log scales.") + rotationDial(b),
    Orbit: () => (phaseDiagram(b) || orbitDiagram(b)) + starlightChart(b) + distanceChart(b),
    Sky: () => skyPanorama(b) + skyView(b) + eclipseCalendar(b) + (b.type !== "Star" ? (dnSky(b) || sunriseNote()) : ""),   // v0.90: day and night at the settlements
    Physics: () => habitableChart(b) + atmosphereProfile(b) + derivedTiles(b),
    Composition: () => (b.solidComposition ? chart("Solid composition", stackedBar(Object.entries(b.solidComposition))) : "") +
      (b.atmosphereComposition && Object.keys(b.atmosphereComposition).length ? chart(`Atmosphere${b.atmosphereType ? " · " + esc(b.atmosphereType) : ""}`, stackedBar(Object.entries(b.atmosphereComposition))) : "") +
      (b.materials && Object.keys(b.materials).length ? chart("Surface materials", materialBars(b.materials)) : "") + materialHeatmap(),
    Signals: () => signalsChart(b) + ringProfile(b) + station(),
  };
  return tabs;
}

let tabBuilders = null, panelT = 0, panelSim = 0, lastMouse = null, panelGap = 330;
const LIVE_TABS = new Set(["Orbit", "Sky", "Physics"]);
function renderTab(name) {
  const el = $("infoBody").querySelector(`.tabp[data-p="${name}"]`);
  if (!el || !tabBuilders || !tabBuilders[name]) return;
  const sc = $("info").scrollTop, t0 = performance.now();
  let h; try { h = tabBuilders[name](); } catch (e) { console.warn(e); logErr(`${name} tab: ${e.message}`); h = `<div class="ev dim">This chart could not be drawn (${esc(e.message)}).</div>`; }
  if (!h.trim()) h = `<div class="ev dim">No ${name.toLowerCase()} data for this body.</div>`;
  el.innerHTML = h; $("info").scrollTop = sc;
  const ea = el.querySelector(".eclAll"); if (ea) ea.onclick = () => { eclAll = !eclAll; renderTab(name); };
  const cost = performance.now() - t0;
  panelGap = Math.min(800, Math.max(QUALITY.panel, cost * 5));      // refresh as often as the machine allows (~20 % of frame time)
  panelT = performance.now(); panelSim = simTime;
  if (lastMouse && tip.style.display === "block") {         // keep the tooltip alive across a refresh
    const t = document.elementFromPoint(lastMouse[0], lastMouse[1]);
    if (t) t.dispatchEvent(new MouseEvent("mousemove", { clientX: lastMouse[0], clientY: lastMouse[1], bubbles: true }));
  }
}
function select(b, doFocus) {
  if (typeof stwIsOpen === "function" && stwIsOpen() && !select.keepStn) stnClose();   // v0.79.7: picking a body puts the Body window back
  if (SURF && doFocus) exitSurface(false);
  beltUnselect(); ringUnselect();                         // v0.63/0.64: one selection at a time: a body, a belt or a ring
  if (selected) { selected._item && selected._item.classList.remove("sel"); selected._div.classList.remove("sel"); }
  if (b !== selected || doFocus) { doFocus ? Sound.focus(b) : Sound.click(); }
  selected = b; b._item && b._item.classList.add("sel"); b._div.classList.add("sel");
  if (MAPMODE) smapMarkSel();
  const rows = [], sec = t => rows.push(`<tr><td colspan="2"><div class="sec">${t}</div></td></tr>`);
  const row = (k, v) => v != null && v !== "" && !/^—/.test(String(v)) && rows.push(`<tr><td>${k}</td><td>${v}</td></tr>`);
  sec("Physical");
  if (b.type === "Star") {
    row("Class", `${b.spectralClass || ""} ${b.luminosity || ""}`.trim()); row("Mass", fmt(b.solarMasses, 4) + " M☉");
    row("Radius", `${fmt(b.solarRadius, 4)} R☉ (${fmt(b._r * 1000, 0)} km)`); row("Surface temp", temp(b.surfaceTemperature));
    row("Age", fmt(b.age, 0) + " My"); row("Absolute magnitude", fmt(b.absoluteMagnitude, 3)); row("Scoopable", /^[OBAFGKM]/.test(b.spectralClass || "") ? "Yes" : "No");
  } else {
    row("Mass", fmt(b.earthMasses, 4) + " M⊕"); row("Radius", fmt(b.radius, 0) + " km");
    row("Gravity", `<span style="color:${gColor(b.gravity || 0)}">${fmt(b.gravity, 3)} g</span>`);
    row("Surface temp", `<span style="color:${tColor(b.surfaceTemperature || 0)}">${temp(b.surfaceTemperature)}</span>`);
    row("Surface pressure", b.surfacePressure ? fmt(b.surfacePressure / 101325, 4) + " atm" : null);
    row("Landable", b.isLandable ? '<span style="color:var(--land)">Yes</span>' : "No");
    row("Atmosphere", b.atmosphereType || (hasAtm(b) ? "Present" : "None"));
    row("Volcanism", b.volcanismType); row("Terraforming", b.terraformingState); row("Reserves", b.reserveLevel);
  }
  row("Distance to arrival", fmt(b.distanceToArrival, 1) + " ls" + (b.timestamps && b.timestamps.distanceToArrival ? ` <span style="color:var(--dim)">(at scan, ${b.timestamps.distanceToArrival.slice(0, 10)})</span>` : ""));
  if (b.semiMajorAxis != null) {
    sec("Orbit");
    row("Semi-major axis", `${fmt(b.semiMajorAxis, 5)} AU (${fmt(b.semiMajorAxis * AU_LS, 2)} ls)`); row("Period", fmt(b.orbitalPeriod, 3) + " d");
    row("Eccentricity", fmt(b.orbitalEccentricity, 5)); row("Inclination", fmt(b.orbitalInclination, 3) + "°");
    row("Arg. of periapsis", fmt(b.argOfPeriapsis, 3) + "°"); row("Ascending node", b.ascendingNode != null ? fmt(b.ascendingNode, 3) + "°" : null);
    row("Mean anomaly (epoch)", b.meanAnomaly != null ? `${fmt(b.meanAnomaly, 3)}° @ ${new Date(b._t0).toISOString().slice(0, 16).replace("T", " ")}` : null);
  }
  sec("Rotation");
  if (b.rotationalPeriod != null) row("Period", fmt(Math.abs(b.rotationalPeriod), 3) + " d" + (b.rotationalPeriod < 0 ? " (retrograde)" : "") + (b.rotationalPeriodTidallyLocked ? " · tidally locked" : ""));
  if (b.axialTilt != null) row("Axial tilt", fmt(b.axialTilt / DEG, 2) + "°");
  if (b.type !== "Star") rows.push(`<tr><td colspan="2" class="warn">⚠ The pole direction follows from the orbit data (checked against the game), but the rotation phase is not in the data. That is which way the surface faces at a given moment. Day/night times at a particular spot are therefore not shown.</td></tr>`);
  const comp = (title, obj, unit = " %") => { if (obj && Object.keys(obj).length) { sec(title); Object.entries(obj).sort((a, c) => c[1] - a[1]).forEach(([k, v]) => row(k, fmt(v, 2) + unit)); } };
  comp("Atmosphere composition", b.atmosphereComposition); comp("Solid composition", b.solidComposition); comp("Materials", b.materials);
  if (b.rings && b.rings.length) { sec("Rings"); b.rings.forEach(r => row(r.name.split(" ").slice(-2).join(" "), `${r.type} · ${fmt(r.innerRadius / 1000, 0)}–${fmt(r.outerRadius / 1000, 0)} km`)); }
  if (b.belts && b.belts.length) { sec("Belts"); b.belts.forEach(r => rows.push(`<tr data-belt="${esc(r.name || "")}"><td>${esc(r.name.split(" ").slice(-2).join(" "))}</td><td>${esc(r.type || "")} asteroid belt<br>${fmt(r.innerRadius / 1000, 0)}–${fmt(r.outerRadius / 1000, 0)} km (${fmt(r.innerRadius / 299792458, 2)}–${fmt(r.outerRadius / 299792458, 2)} ls)${r.mass ? `<br>Mass ${fmt(r.mass, 0)} Mt` : ""}<br><span style="color:var(--dim)">Rocks in 3D are illustrative</span></td></tr>`)); }
  const sig = b.signals && (b.signals.signals || b.signals);
  if (sig && typeof sig === "object") {
    const names = { Biological: "Biological", Geological: "Geological", PlanetaryMiningLocation: "Mining sites", Human: "Human", Guardian: "Guardian", Thargoid: "Thargoid", Other: "Other" };
    const ent = Object.entries(sig).filter(([, v]) => typeof v === "number");
    if (ent.length) { sec("Signals"); ent.forEach(([k, v]) => { const n = Object.keys(names).find(x => k.includes(x)); row(n ? names[n] : k.replace(/[$;]/g, ""), v); }); }
    const gen = b.genuses || b.signals.genuses || [];
    if (gen.length) row("Genuses", gen.map(g => g.replace(/\$Codex_Ent_|_Genus_Name;|_Name;/g, "").replace(/_/g, " ")).join(", "));
  }
  const fcs = (S.carriers || []).filter(c => c.body === b || c.alt === b);
  if (fcs.length) { sec("Fleet carriers (last reported)"); fcs.forEach(c => row(esc(c.name), `${esc(c.code)} · ${c.seen ? ago(c.seen) : "time unknown"}${c.alt ? " · position uncertain" : ""}`)); }
  if (stationCount(b)) { sec("Stations / settlements"); b.stations.forEach(st => row(st.name, st.type || "")); }
  const live = [`<div class="lv"><span>To main star</span><b id="liveStar">—</b></div>`];
  if (S.parentOf.get(b.bodyId) !== undefined && S.parentOf.get(b.bodyId) !== 0) live.push(`<div class="lv"><span>To parent</span><b id="liveParent">—</b></div>`);
  live.push(`<div class="lv"><span>Mean anomaly</span><b id="liveAnom">—</b></div>`);
  if (b.type !== "Star") live.push(`<div class="lv"><span>Starlight</span><b id="liveEcl">—</b></div>`);
  let warn = "";
  if (b.meanAnomaly != null && b._epochHow !== "own") warn += `<div class="warn small">⚠ Spansh has no timestamp for this body's orbit position. GRAVITAS uses ${b._epochHow === "sibling" ? "a sibling's" : "the system's latest"} scan time, so its position may be off</div>`;
  const tabs = bodyCharts(b), dataHtml = `<table>${rows.join("")}</table>`; tabs.Data = () => dataHtml;
  tabBuilders = tabs; setTimeout(updateUrl, 0);
  if (!tabs[infoTab]) infoTab = "Overview";
  $("infoBody").innerHTML = `<h2>${shortName(b, S.sys.name)}</h2><div class="kind">${b.subType || b.type}${badges(b)}</div>
    <div class="livegrid">${live.join("")}</div>${warn}${b.type !== "Star" ? `<button id="surfGo" class="btn" title="Stand on this body and look at the sky at true scale">⛰ View from the surface (true scale)</button>` : ""}${b.type !== "Star" ? `<div class="illus">Surface details and spin angle in the 3D view are illustrative.${isGiant(b) ? ` Its colours follow the game's cloud layer model, as worked out by the <a href="https://ed-ggg.github.io/edggg/" target="_blank" rel="noopener">EDGGG</a> team.` : ""}${verifiedLook(b) ? " Its colour was checked against the game." : ""} Size, rings, axial tilt, position and lighting come from the data.</div>` : ""}
    <div class="tabs">${Object.keys(tabs).map(t => `<button data-tab="${t}" class="${t === infoTab ? "on" : ""}">${t}</button>`).join("")}</div>
    ${Object.keys(tabs).map(t => `<div class="tabp" data-p="${t}" style="display:${t === infoTab ? "block" : "none"}"></div>`).join("")}`;
  renderTab(infoTab);
  if ($("surfGo")) $("surfGo").onclick = () => enterSurface(b);
  $("infoBody").querySelectorAll(".tabs button").forEach(btn => btn.onclick = () => {
    infoTab = btn.dataset.tab;
    $("infoBody").querySelectorAll(".tabs button").forEach(x => x.classList.toggle("on", x === btn));
    $("infoBody").querySelectorAll(".tabp").forEach(p => p.style.display = p.dataset.p === infoTab ? "block" : "none");
    renderTab(infoTab); updateUrl();
  });
  { const el = $("info"), was = el.style.display === "none" || el.classList.contains("closing") || !el.style.display && getComputedStyle(el).display === "none";
    clearTimeout(infoHide.t); el.classList.remove("closing"); el.style.display = "block";
    if (el.classList.contains("collapsed")) setCollapsed("info", false);        // v0.53: choosing a body always shows its panel
    if (was && !isPhone()) { el.classList.remove("opening"); void el.offsetWidth; el.classList.add("opening"); } }
  if (isPhone() && (doFocus || document.body.dataset.sheet === "info" || !document.body.dataset.sheet) && !(PFULL && !pfullByHand())) setSheet("info");   // v0.76.2: a paired screen opens it only for a tap
  mnavState();
  if (doFocus) flyTo(b);
}
function updateLive(b) {
  const w = S.world.get(b.bodyId), m = S.main ? S.world.get(S.main.bodyId) : { x: 0, y: 0, z: 0 };
  $("liveStar").textContent = b === S.main ? "—" : fmtDist(dist(w, m));
  const par = S.parentOf.get(b.bodyId);
  if ($("liveParent") && S.world.has(par)) $("liveParent").textContent = fmtDist(dist(w, S.world.get(par)));
  if ($("liveEcl") && b._ecl) $("liveEcl").textContent = b._ecl.map((v, i) => `${S.stars.length > 1 ? shortName(S.stars[i], S.sys.name) + ": " : ""}${v >= 0.9995 ? "full" : fmt(v * 100, 1) + " %" + (b._eclWho && b._eclWho[i] ? ` (${shortName(b._eclWho[i], S.sys.name)} in front)` : "")}`).join(" · ");
  if (b.meanAnomaly != null && b.orbitalPeriod) $("liveAnom").textContent = fmt((((b.meanAnomaly + 360 * (simTime - b._t0) / (b.orbitalPeriod * 86400000)) % 360) + 360) % 360, 2) + "°";
}

