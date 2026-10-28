// ------------------------------------------------------------ side panels
function renderList() {
  const el = $("listBody"); el.innerHTML = ""; const seen = new Set();
  const walk = (id, depth) => {
    const b = S.byId.get(id);
    if (b && b.type !== "Barycentre" && b._obj && !seen.has(id)) {
      seen.add(id);
      const d = document.createElement("div");
      d.className = "item"; d.style.paddingLeft = 6 + depth * 12 + "px";
      d.innerHTML = `${shortName(b, S.sys.name)}${badges(b)}<span class="t">${(b.subType || b.type || "").replace(" Star", "").replace("gas giant", "GG")}</span>`;
      d.onclick = () => select(b, true); b._item = d; el.appendChild(d);
      for (const B of (S.belts || []).filter(x => x.b === b)) {           // v0.62: a star's asteroid belts get their own row
        const e = document.createElement("div"); e.className = "item beltItem"; e.style.paddingLeft = 6 + (depth + 1) * 12 + "px";
        e.innerHTML = `${esc(shortName({ name: B.bl.name || "Belt" }, S.sys.name))}<span class="bic">⁘</span><span class="t">${esc(B.bl.type || "")} belt</span>`;
        e.onclick = () => beltFly(B); B.item = e; if (B.sel) e.classList.add("sel"); el.appendChild(e);                      // like a body row: fly there
      }
    }
    for (const k of (S.children.get(id) || []).sort((a, c) => a - c)) walk(k, b && b.type !== "Barycentre" ? depth + 1 : depth);
  };
  walk(0, 0);
  for (const b of S.bodies) if (!seen.has(b.bodyId)) walk(b.bodyId, 0);
}
// Powerplay 2.0 powers, grouped by the superpower they align with (badge colour); initials only, no game artwork
const POWER_SIDE = { "Aisling Duval": "Empire", "Arissa Lavigny-Duval": "Empire", "Denton Patreus": "Empire", "Zemina Torval": "Empire",
  "Felicia Winters": "Federation", "Jerome Archer": "Federation", "Zachary Hudson": "Federation", "Edmund Mahon": "Alliance", "Nakato Kaine": "Alliance",
  "Archon Delaine": "Independent", "Li Yong-Rui": "Independent", "Pranav Antal": "Independent", "Yuri Grom": "Independent" };
const SIDE_COL = { Empire: "#3987e5", Federation: "#d95926", Alliance: "#199e70", Independent: "#c98500" };
const POWER_STATE = { Stronghold: "the power's strongest hold: the system projects control far around it",
  Fortified: "firmly held and supporting nearby systems", Exploited: "under this power's influence, supplied by a nearby fortified or stronghold system",
  Unoccupied: "no power controls this system yet" };
function powerBadge(name, size = 40) {
  const side = POWER_SIDE[name] || "Independent", c = SIDE_COL[side], ini = name.split(/[\s-]+/).map(w => w[0]).join("").slice(0, 3);
  const r = size / 2, pts = [0, 1, 2, 3, 4, 5].map(k => { const a = Math.PI / 3 * k - Math.PI / 2; return `${(r + r * 0.92 * Math.cos(a)).toFixed(1)},${(r + r * 0.92 * Math.sin(a)).toFixed(1)}`; }).join(" ");
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"${tipAttr(`${name} · aligned with the ${side}`)}><polygon points="${pts}" fill="${c}" fill-opacity=".22" stroke="${c}" stroke-width="2"/>
    <text x="${r}" y="${r + size * 0.13}" text-anchor="middle" font-size="${size * 0.34}" font-weight="700" fill="#fff" font-family="Segoe UI,system-ui,sans-serif">${ini}</text></svg>`;
}
// v0.56: when the Spansh data was last updated, always visible under the system name (also when the System panel is folded)
// v0.94: the newest of Spansh's dates. Its search record (updated_at) can be days behind the system's own data
function sysUpdated() { const s = S && S.sys; if (!s) return null; const m = s.summary || {};
  const ts = [m.updated_at, s.date, s.updateTime, ...(s.bodies || []).map(b => b && b.updateTime), ...(s.stations || []).map(x => x && x.updateTime)].map(v => v ? Date.parse(v) : NaN).filter(x => isFinite(x) && x <= Date.now() + 864e5);   // v0.94.1: a wrong date in the future (one station said 2198) is not news
  return ts.length ? Math.max(...ts) : null; }
function agoText(ms) {
  if (ms < 0) ms = 0; const m = Math.round(ms / 60000), h = Math.round(ms / 3600000), d = Math.round(ms / 86400000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : h < 48 ? `${h} h ago` : d < 60 ? `${d} days ago` : `${Math.round(d / 30.4)} months ago`;
}
function sysAgeShow() {
  const el = $("sysmeta"); if (!el) return; let a = $("sysAge");
  const t = sysUpdated(); if (!t) { if (a) a.remove(); return; }
  if (!a) { a = document.createElement("span"); a.id = "sysAge"; }
  el.appendChild(document.createTextNode(" · ")); el.appendChild(a);
  a.textContent = `data updated ${new Date(t).toISOString().slice(0, 16).replace("T", " ")} UTC · ${agoText(Date.now() - t)}`;
  a.title = "When this system's data was last updated on Spansh. Positions are computed from the orbits, so they are always current. Stations, carriers and scans are as last reported.";
}
setInterval(() => { const a = $("sysAge"), t = sysUpdated(); if (a && t) a.textContent = a.textContent.replace(/ · [^·]*$/, ` · ${agoText(Date.now() - t)}`); }, 60000);
function renderSystemInfo() {
  const s = S.sys, m = s.summary || {}, rows = [], row = (k, v) => v != null && v !== "" && rows.push(`<tr><td>${k}</td><td>${v}</td></tr>`);
  let h = "";
  const ctl = m.controlling_power || s.controllingPower, state = m.power_state || s.powerState, present = (m.power || s.powers || []).filter(p => p !== ctl);
  if (ctl) h += `<div class="pw">${powerBadge(ctl)}<div><div class="pn" style="color:${SIDE_COL[POWER_SIDE[ctl] || "Independent"]}">${esc(ctl)}</div>
      <div class="ps"${state && POWER_STATE[state] ? tipAttr(POWER_STATE[state]) : ""}>${state ? `<b>${esc(state)}</b> · ` : ""}controlling power</div></div></div>`;
  else if (state || present.length) h += `<div class="pw"><div class="ps"><b>${esc(state || "Unoccupied")}</b> · no controlling power</div></div>`;
  if (present.length) h += `<div class="ps" style="color:var(--dim);font-size:10.5px;margin:-2px 0 3px">Also active here</div><div class="pwc">${present.map(p => `<span>${powerBadge(p, 18)}${esc(p)}</span>`).join("")}</div>`;
  row("Allegiance", m.allegiance || s.allegiance); row("Government", m.government || s.government);
  row("Economy", [m.primary_economy || s.primaryEconomy, m.secondary_economy || s.secondaryEconomy].filter(x => x && x !== "None").join(" / "));
  row("Security", m.security || s.security);
  const pop = m.population ?? s.population; row("Population", pop ? fmt(pop, 0) : null);
  const cf = m.controlling_minor_faction || (s.controllingFaction && (s.controllingFaction.name || s.controllingFaction));
  if (cf) row("Controlling faction", esc(cf) + (m.controlling_minor_faction_state && m.controlling_minor_faction_state !== "None" ? ` <span style="color:var(--dim)">· ${esc(m.controlling_minor_faction_state)}</span>` : ""));
  row("Region", m.region);
  row("Permit", m.needs_permit ? "Required" : null);
  row("Colonisation", m.is_colonised ? "Colonised" : m.is_being_colonised ? "Being colonised" : null);
  { const nO = (S.orbitals || []).length, nC = (S.carriers || []).length, nS = S.bodies.reduce((a, b) => a + stationCount(b), 0);
    row("Stations", nO + nC + nS ? [nO && `${nO} in orbit`, nS && `${nS} on surfaces`, nC && `${nC} carrier${nC > 1 ? "s" : ""}`].filter(Boolean).join(" · ") : null); }
  row("Scan value (est.)", m.estimated_scan_value ? fmt(m.estimated_scan_value, 0) + " cr" : null);
  row("Mapping value (est.)", m.estimated_mapping_value ? fmt(m.estimated_mapping_value, 0) + " cr" : null);
  row("Coordinates", s.coords ? `${fmt(s.coords.x, 2)}, ${fmt(s.coords.y, 2)}, ${fmt(s.coords.z, 2)}` : null);
  { const u = sysUpdated(); row("Data updated", u ? new Date(u).toISOString().slice(0, 16).replace("T", " ") + " UTC" : null); }
  h += `<table>${rows.join("")}</table>`;
  h += `<div id="collBox">${typeof collHtml === "function" ? collHtml() : ""}</div>`;     // v0.58
  if (S.orbitals && S.orbitals.length) h += `<div class="sec">Stations in orbit <span style="color:var(--dim);font-weight:400">· last reported to Spansh</span></div>` + stationRows(S.orbitals);
  { const inc = typeof fcIncomingRows === "function" ? fcIncomingRows() : "";   // v0.90.7: and your carriers on their way here
    if ((S.carriers && S.carriers.length) || inc) h += `<div class="sec">Fleet carriers <span style="color:var(--dim);font-weight:400">· last reported to Spansh${(S.carriers || []).some(c => c.jrn) || inc ? ", yours from your journal" : ""}</span></div>` + inc + ((S.carriers || []).length ? carrierRows(S.carriers) : ""); }
  const fac = (m.minor_faction_presences || []).filter(f => f && f.name);
  if (fac.length) {
    const inf = f => { const v = f.influence ?? f.Influence; return v == null ? null : v <= 1 ? v * 100 : v; };
    fac.sort((a, b) => (inf(b) || 0) - (inf(a) || 0));
    h += `<div class="sec">Factions</div><div class="fac">${fac.map(f => { const v = inf(f), ctlF = f.name === m.controlling_minor_faction;
      return `<div class="fr${ctlF ? " ctl" : ""}"><span>${esc(f.name)}${f.state && f.state !== "None" ? ` <span class="st">· ${esc(f.state)}</span>` : ""}</span><b>${v == null ? "" : fmt(v, 1) + "%"}</b>${v == null ? "" : `<div class="bar"><i style="width:${Math.min(100, v)}%"></i></div>`}</div>`; }).join("")}</div>`;
  }
  if (!ctl && !rows.length) h = `<div class="ps" style="color:var(--dim)">No political data: an uninhabited system.</div>` + h;
  $("sysBody").innerHTML = h; $("sys").style.display = "block";
  layoutLeft();
}
function layoutLeft() {
  requestAnimationFrame(() => {
    // on wide screens the VIEW button and the time panel stand equally tall, as tall as the taller one
    const row = [$("time"), $("mapMode")]; row.forEach(e => e.style.minHeight = "");
    if (innerWidth >= 1300 && !isPhone()) { const H = Math.max(...row.map(e => e.offsetHeight)); row.forEach(e => e.style.minHeight = H + "px"); } const r = document.documentElement.style; r.setProperty("--timeH", $("time").offsetHeight + "px");
    r.setProperty("--listTop", ($("top").offsetHeight + 20) + "px"); r.setProperty("--newsH", $("newsBtn").offsetHeight + "px"); r.setProperty("--tiltH", $("mapMode").offsetHeight + "px"); r.setProperty("--credH", $("credits").offsetHeight + "px"); const sy = $("sync") && $("sync").offsetHeight, mo = $("modes") && $("modes").offsetHeight;
    // v0.92.4: Bodies, then GRAVITAS MODES, then Sync, then the credits and About at the bottom
    const base = $("credits").offsetHeight + $("newsBtn").offsetHeight + 28 + (sy ? sy + 8 : 0); r.setProperty("--modesB", base + "px");
    r.setProperty("--listBottom", (base + (mo ? mo + 8 : 0)) + "px"); });
}
addEventListener("resize", layoutLeft);
if (window.ResizeObserver) new ResizeObserver(layoutLeft).observe($("time"));      // v0.52: the buttons beside it follow its height
// phones: one panel at a time, opened from the bar at the bottom
const PHONE_MQ = "(max-width: 760px), (max-height: 520px) and (pointer: coarse)";          // v0.53: a phone held sideways counts as a phone
const isPhone = () => PFULL || matchMedia(PHONE_MQ).matches;           // v0.76.2: a paired touch screen too
function setSheet(name) {
  document.body.dataset.sheet = name || "";
  document.querySelectorAll("#mnav button").forEach(b => b.classList.toggle("on", b.dataset.sheet === name));
  if (name === "view") $("view").open = true;
  if (PFULL) { if (pfLeft(name)) PFULL_LAST = name; pfullHandles(); }
  layoutLeft();
}
document.querySelectorAll("#mnav button").forEach(b => b.onclick = () => setSheet(document.body.dataset.sheet === b.dataset.sheet ? "" : b.dataset.sheet));
function mnavState() { const bb = document.querySelector('#mnav button[data-sheet="info"]'); if (bb) bb.disabled = !selected; if (PFULL) pfullHandles(); }
let infoTab = "Overview";
