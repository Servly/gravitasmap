// ------------------------------------------------------------ fleet carriers
// Spansh gives each carrier's name, its distance from the arrival star and when it was last reported, but not the
// body it is parked at. Bodies move, so we ask which body was at exactly that distance at that moment.
function ago(ms) {
  const h = (Date.now() - ms) / 3600000;
  return h < 1 ? "last seen under an hour ago" : h < 48 ? `last seen ${Math.round(h)} h ago` : h < 24 * 60 ? `last seen ${Math.round(h / 24)} days ago` : `last seen ${Math.round(h / 24 / 30)} months ago`;
}
function carrierRows(list) {
  return `<div class="fcl">${list.map(c => {
    const where = c.body ? `near ${esc(shortName(c.body, S.sys.name))}${c.alt ? ` or ${esc(shortName(c.alt, S.sys.name))}` : ""}` : esc(c.why);
    if (c.jrn) { const j = c.jrn.jump && Date.now() < c.jrn.jump.dep ? c.jrn.jump : null;   // v0.90.7: from your own journal
      return `<div class="fcr mine${/\[TRGE\]/i.test(c.name) ? " trge" : ""}" ${stnSid(c.st)}><span class="fn">⛴ ${esc(c.name)} <span class="fc2">${esc(c.code)}</span></span>
      <span class="fw">${where} · from your journal${j ? ` · jumps to ${esc(j.sys)} ${fcCd(j.dep)}` : ""}</span></div>`; }
    return `<div class="fcr${/\[TRGE\]/i.test(c.name) ? " trge" : ""}" ${stnSid(c.st)}><span class="fn">⛴ ${esc(c.name)} <span class="fc2">${esc(c.code)}</span></span>
      <span class="fw">${where} · ${c.seen ? ago(c.seen) + ` (${new Date(c.seen).toISOString().slice(0, 16).replace("T", " ")} UTC)` : "time unknown"}${c.st.carrierDockingAccess ? ` · docking: ${esc(c.st.carrierDockingAccess)}` : ""}</span></div>`; }).join("")}
    <div class="fcn">A carrier may have jumped away since it was last reported. Where it sits around the body is not in the data. The model is placed beside it, not to scale.</div></div>`;
}
function stationRows(list) {
  return `<div class="fcl">${list.map(o => {
    const where = o.belt ? `in the ${esc(beltName(o.belt.bl))}` : o.body ? `near ${esc(shortName(o.body, S.sys.name))}${o.alt ? ` or ${esc(shortName(o.alt, S.sys.name))}` : ""}` : esc(o.why);
    return `<div class="fcr stn${o.build ? " build" : ""}" ${stnSid(o.st)}><span class="fn">${stnGlyph(o.v || o.kind, 12)} ${esc(o.name)} <span class="fc2">${esc(o.kindName)}</span></span>
      <span class="fw">${where} · reported ${o.seen ? new Date(o.seen).toISOString().slice(0, 10) : "at an unknown time"}</span></div>`; }).join("")}
    <div class="fcn">Spansh gives a station's distance from the arrival star, not the body it circles. The body is the one that was at that distance when it was reported. The 3D models are simple shapes for the type, placed beside the body, not to scale. Construction sites may already be finished in the game.</div></div>`;
}
function locateCarriers() {
  S.carriers = [];
  // v0.90.7: your own carriers from the Journal: placed where it says, and left out where it says they are not
  const J = typeof fcForSystem === "function" ? fcForSystem() : { here: [], away: new Set() };
  for (const { r, w } of J.here) {
    const st = fcStation(r, w); let b = w.body != null && S.byId ? S.byId.get(+w.body) : null;
    if (b && !b._obj) b = null; if (!b && S.main && (w.body == null || +w.body === 0 || !S.byId.get(+w.body))) b = S.main;
    const dist = r.dist != null && r.distAddr === w.addr && r.distT >= w.t ? r.dist : null;   // v0.90.8: known when you docked aboard
    S.carriers.push({ st, name: st.carrierName || r.name || st.name, code: st.name, seen: w.t, body: b, alt: null, why: b ? "" : "body not in the data", jrn: r, dist });
  }
  const list = (S.sys.stations || []).filter(st => /carrier/i.test(st.type || "") && !J.away.has(+st.id) && !S.carriers.some(c => c.st === st));
  for (const st of list) {
    const c = { st, name: st.carrierName || st.name, code: st.name, seen: Date.parse(st.updateTime || "") || null, body: null, alt: null, why: "" };
    const d = st.distanceToArrival;
    if (!(d > 0) || !c.seen || !S.main) { c.why = "position not reported"; S.carriers.push(c); continue; }
    const W = worldAt(c.seen), m = W.get(S.main.bodyId);
    const cand = S.bodies.filter(o => o !== S.main && W.has(o.bodyId)).map(o => ({ o, e: Math.abs(dist(W.get(o.bodyId), m) / LS_MM - d) })).sort((a, b) => a.e - b.e);
    if (!cand.length || cand[0].e > Math.max(2, d * 0.002)) { c.why = "no body at the reported distance"; S.carriers.push(c); continue; }
    c.body = cand[0].o; c.err = cand[0].e;
    if (cand[1] && cand[1].e - cand[0].e < 1) c.alt = cand[1].o;
    S.carriers.push(c);
  }
  S.carriers.sort((a, b) => (b.jrn ? 1 : 0) - (a.jrn ? 1 : 0) || (b.seen || 0) - (a.seen || 0));
  const per = new Map();
  for (const c of S.carriers) {
    if (!c.body) continue;
    c.idx = per.get(c.body) || 0; per.set(c.body, c.idx + 1);
    c.obj = carrierModel(/\[TRGE\]/i.test(c.name)); S.group.add(c.obj);
    const div = document.createElement("div");
    div.className = "label fc" + (/\[TRGE\]/i.test(c.name) ? " trge" : "") + (c.jrn ? " mine" : "");
    div.innerHTML = `<div class="in"><div class="row"><span class="ic">⛴</span><span class="nm">${esc(c.name)}</span></div><div class="det">${esc(c.code)} · ${c.jrn ? `from your journal${c.jrn.jump && Date.now() < c.jrn.jump.dep ? ` · jumps to ${esc(c.jrn.jump.sys)} ${fcCd(c.jrn.jump.dep)}` : ""}` : ago(c.seen)}${c.alt ? " · position uncertain" : ""}</div></div>`;
    div.addEventListener("click", e => { e.stopPropagation(); stnOpen(c.st); });   // v0.79: the station window
    c.label = new CSS2DObject(div); c.label.position.set(0, 0.25, 0); c.obj.add(c.label);
  }
  if (!S.fcLight) { S.fcLight = new THREE.PointLight(0xfff3e6, 2.4, 0, 0); S.fcAmb = new THREE.AmbientLight(0x8890a8, 0.55); }
  S.group.add(S.fcLight); S.group.add(S.fcAmb);
}
let _deckTex = null;
function deckTexture() {
  if (_deckTex) return _deckTex;
  const c = document.createElement("canvas"); c.width = 512; c.height = 192; const g = c.getContext("2d");
  g.fillStyle = "#24262d"; g.fillRect(0, 0, 512, 192);
  g.strokeStyle = "#3a3d47"; g.lineWidth = 2; for (let x = 0; x < 512; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 192); g.stroke(); }
  for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) {                 // landing pads
    const x = 40 + i * 112, y = 18 + r * 88; g.fillStyle = "#30333c"; g.fillRect(x, y, 92, 68);
    g.strokeStyle = "#8fa3b8"; g.lineWidth = 2; g.strokeRect(x + 4, y + 4, 84, 60);
    g.beginPath(); g.arc(x + 46, y + 34, 20, 0, 2 * Math.PI); g.stroke();
    g.fillStyle = "#e8b24a"; g.fillRect(x + 42, y + 30, 8, 8);
  }
  g.fillStyle = "#e8b24a"; for (let y = 8; y < 192; y += 44) g.fillRect(8, y, 14, 6);
  _deckTex = new THREE.CanvasTexture(c); _deckTex.colorSpace = THREE.SRGBColorSpace; return _deckTex;
}
function carrierModel(trge) {        // an original long-hull carrier with a flight deck; length 1 along +x
  const G = new THREE.Group(), hull = new THREE.MeshLambertMaterial({ color: 0xb9bcc4 }), dark = new THREE.MeshLambertMaterial({ color: 0x3b3e47 }),
    acc = new THREE.MeshLambertMaterial({ color: trge ? 0xc8202c : 0x2f7fa8 }), glow = new THREE.MeshBasicMaterial({ color: 0x9fd8ff });
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); G.add(o); return o; };
  box(0.92, 0.07, 0.11, dark, 0, 0, 0);                                              // keel
  const deck = box(0.6, 0.014, 0.25, new THREE.MeshLambertMaterial({ map: deckTexture() }), 0.02, 0.045, 0);   // flight deck
  box(0.6, 0.02, 0.012, acc, 0.02, 0.05, 0.131); box(0.6, 0.02, 0.012, acc, 0.02, 0.05, -0.131);   // deck edge stripes
  for (const z of [0.155, -0.155]) { box(0.42, 0.075, 0.055, hull, -0.04, -0.005, z); box(0.18, 0.05, 0.05, acc, 0.24, -0.01, z * 0.92); }   // side bays
  const bow = new THREE.Mesh(new THREE.CylinderGeometry(0.0, 0.055, 0.2, 6), hull); bow.rotation.z = -Math.PI / 2; bow.position.set(0.55, 0, 0); G.add(bow);
  box(0.06, 0.1, 0.05, hull, -0.27, 0.1, 0.07); box(0.02, 0.06, 0.02, dark, -0.27, 0.18, 0.07);   // bridge tower + mast
  for (const z of [0.07, 0, -0.07]) { const e = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.09, 12), dark); e.rotation.z = Math.PI / 2; e.position.set(-0.5, 0, z); G.add(e);
    const f = new THREE.Mesh(new THREE.CircleGeometry(0.026, 16), glow); f.rotation.y = -Math.PI / 2; f.position.set(-0.546, 0, z); G.add(f); }
  for (const s of [1, -1]) { const fin = box(0.12, 0.012, 0.09, hull, -0.4, 0.0, s * 0.19); fin.rotation.x = s * 0.25; }
  return G;
}
// ------------------------------------------------------------ stations in orbit (v0.52)
// Spansh lists orbital stations for the system with their distance from the arrival star and when that was reported,
// not the body they circle. As for carriers, we ask which body was at that distance at that moment. Where a station
// sits around its body is not in the data: the model is placed beside the body, not to scale, in a simple original
// shape for its type. Stations on a surface come with their body and a latitude and longitude.
const STN_KINDS = [
  [/coriolis/i, "coriolis", "Coriolis starport"], [/orbis/i, "orbis", "Orbis starport"], [/ocellus/i, "ocellus", "Ocellus starport"],
  [/dodec/i, "dodec", "Dodec starport"], [/asteroid/i, "asteroid", "Asteroid base"], [/mega ?ship/i, "mega", "Megaship"],
  [/construction/i, "build", "Construction site"], [/outpost/i, "outpost", "Outpost"],
];
// v0.77.2: Spansh keeps the type "Construction Depot" after a colony building is finished. Only a name that still starts
// with "Orbital/Planetary Construction Site" is a building site; any other name is the finished structure
const stnBuilding = st => /construction/i.test(st.type || "") && /^(orbital|planetary) construction site/i.test(st.name || "");
const stnFinished = st => /construction/i.test(st.type || "") && !stnBuilding(st);
function stnKind(st) { const t = st.type || ""; if (stnFinished(st)) return { k: "outpost", n: "Outpost" }; for (const [re, k, n] of STN_KINDS) if (re.test(t)) return { k, n }; return { k: "outpost", n: t || "Station" }; }
const stnName = st => String(st.name || "").replace(/^(Orbital|Planetary) Construction Site:\s*/i, "");
const SURF_KINDS = ["port", "settle", "sbuild"];
function surfKind(st) {                                // stations on a surface (Spansh lists them under their body)
  const t = st.type || "", n = st.name || "";
  if (stnFinished(st)) return { k: "settle", n: "Settlement" };    // v0.77.2: a finished colony building
  if (/construction/i.test(t) || /construction site/i.test(n)) return { k: "sbuild", n: "Construction site on the surface" };
  if (/port|outpost/i.test(t)) return { k: "port", n: t };
  return { k: "settle", n: t || "Settlement" };
}
// the belt (around any star) whose band of rocks reaches the reported distance from the main star (light seconds)
function stnBelt(d, W, m) {
  let best = null; const tol = Math.max(2, d * 0.002);
  for (const B of S.belts || []) {
    const hp = W.get(B.b.bodyId); if (!hp) continue;
    const dh = B.b === S.main ? 0 : dist(hp, m) / LS_MM, ri = (B.bl.innerRadius || 0) / 1e6 / LS_MM, ro = (B.bl.outerRadius || 0) / 1e6 / LS_MM;
    const lo = dh === 0 ? ri : Math.max(0, dh - ro), hi = dh + ro;
    if (d < lo - tol || d > hi + tol) continue;
    const e = Math.abs(d - (dh === 0 ? (ri + ro) / 2 : dh)); if (!best || e < best.e) best = { B, e };
  }
  return best && best.B;
}
function locateStations() {
  S.orbitals = [];
  for (const st of S.sys.stations || []) {
    if (/carrier/i.test(st.type || "")) continue;
    const kd = stnKind(st), v = stnVariant(st, kd.k), o = { st, name: stnName(st), kind: kd.k, v, kindName: stnKindName(st, kd.n, v), build: kd.k === "build", seen: Date.parse(st.updateTime || "") || null, body: null, alt: null, why: "" };
    const d = st.distanceToArrival;
    if (!(d > 0) || !o.seen || !S.main) { o.why = "position not reported"; S.orbitals.push(o); continue; }
    const W = worldAt(o.seen), m = W.get(S.main.bodyId);
    // v0.76.1: an asteroid base sits in a belt, not beside a planet: the belt whose band covers the reported distance
    if (kd.k === "asteroid") { const B = stnBelt(d, W, m); if (B) { o.belt = B; o.body = B.b; S.orbitals.push(o); continue; } }
    const cand = S.bodies.filter(x => x !== S.main && W.has(x.bodyId) && x.type !== "Star").map(x => ({ x, e: Math.abs(dist(W.get(x.bodyId), m) / LS_MM - d) })).sort((a, b) => a.e - b.e);
    o.cand = cand.slice(0, 3).map(c => [c.x, c.e]);                 // v0.79.7: the nearest matches, kept for the station window
    if (!cand.length || cand[0].e > Math.max(2, d * 0.002)) { o.why = "no body at the reported distance"; S.orbitals.push(o); continue; }
    o.body = cand[0].x;
    // v0.79.7: a second body is named only when it was nearly as close (within 0.1 ls, 30,000 km: a station orbits its body
    // much closer than that). Before, anything within 1 ls counted, so two moons of one planet were often both named
    if (cand[1] && cand[1].e - cand[0].e < 0.1) o.alt = cand[1].x;
    S.orbitals.push(o);
  }
  const rank = o => o.build ? 1 : 0;
  S.orbitals.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  const per = new Map();
  for (const c of S.carriers || []) if (c.body) per.set(c.body, Math.max(per.get(c.body) || 0, c.idx + 1));
  for (const o of S.orbitals) {
    if (!o.body) continue;
    o.idx = per.get(o.body) || 0; per.set(o.body, o.idx + 1);
    o.obj = stationModel(o.v || o.kind); S.group.add(o.obj);
    const div = document.createElement("div");
    div.className = "label stn" + (o.build ? " build" : "");
    div.innerHTML = `<div class="in"><div class="row"><span class="ic">${stnGlyph(o.v || o.kind)}</span><span class="nm">${esc(o.name)}</span></div><div class="det">${esc(o.kindName)}${o.alt ? " · position uncertain" : ""}</div></div>`;
    div.addEventListener("click", e => { e.stopPropagation(); stnOpen(o.st); });   // v0.79: the station window
    o.label = new CSS2DObject(div); o.label.position.set(0, 0.7, 0); o.obj.add(o.label);
  }
}
// what hangs off a body on the system map and in its panel: stations on the surface, stations in orbit, carriers.
// large: true or false from the landing pads Spansh reports, null when Spansh has no pad data for it.
const padTxt = st => { const p = st && st.landingPads; return p ? ["large", "medium", "small"].filter(k => p[k]).map(k => `${k[0].toUpperCase()} ${p[k]}`).join(" · ") || "no pads" : ""; };
const padLarge = st => { const p = st && st.landingPads; return p ? (p.large || 0) > 0 : null; };
function bodyPorts(b) {
  const out = [];
  for (const st of b.stations || []) { const k = surfKind(st), v = surfVariant(st, k.k), kn = stnKindName(st, k.n, v), nm = stnName(st) || "Unnamed", pads = padTxt(st);
    out.push({ st, k: k.k, v, cls: k.k === "sbuild" ? "build" : "surf", orbit: false, large: padLarge(st), name: nm, kind: kn,
      tip: `${nm} · ${kn} · on the surface${st.latitude != null && st.longitude != null ? ` at ${fmt(st.latitude, 2)}°, ${fmt(st.longitude, 2)}°` : ""}${pads ? ` · pads ${pads}` : ""}` }); }
  for (const o of S.orbitals || []) if (o.body === b && !o.belt) { const pads = padTxt(o.st);
    out.push({ st: o.st, k: o.kind, v: o.v, cls: o.build ? "build" : "orb", orbit: true, large: padLarge(o.st), name: o.name, kind: o.kindName,
      tip: `${o.name} · ${o.kindName} · in orbit, matched to this body from its reported distance${o.alt ? ` (or ${shortName(o.alt, S.sys.name)})` : ""}${pads ? ` · pads ${pads}` : ""}` }); }
  for (const c of S.carriers || []) if (c.body === b)
    out.push({ st: c.st, k: "carrier", cls: /\[TRGE\]/i.test(c.name) ? "fc trge" : "fc", orbit: true, large: padLarge(c.st), name: c.name, kind: "Fleet carrier",
      tip: `${c.name} ${c.code} · fleet carrier · ${c.jrn ? "from your journal" : c.seen ? ago(c.seen) : "time unknown"}${c.alt ? " · position uncertain" : ""}${c.st.carrierDockingAccess ? ` · docking: ${c.st.carrierDockingAccess}` : ""}` });
  return out;
}
const orbitalCount = b => ((S && S.orbitals) || []).filter(o => o.body === b).length;
const carrierCount = b => ((S && S.carriers) || []).filter(c => c.body === b).length;
// small original glyphs, one per kind, drawn with the current text colour
function stnGlyph(k, size = 14) {
  return `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${stnPaths(k)}</svg>`;
}
function stnPaths(k) {
  if (STRUCT_GLYPH[k]) return STRUCT_GLYPH[k];                      // v0.76.4: a glyph for every look
  const P = {
    coriolis: '<path d="M8 1.6 14.4 8 8 14.4 1.6 8Z"/><path d="M6.2 8h3.6"/>',
    orbis: '<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="1.6"/><path d="M8 2v4.4M8 9.6V14M2.8 11l3.8-2.2M13.2 11 9.4 8.8"/>',
    ocellus: '<circle cx="8" cy="8" r="3.6"/><ellipse cx="8" cy="8" rx="6.6" ry="2.2"/>',
    dodec: '<path d="M8 1.8 14 6.2 11.7 13.4H4.3L2 6.2Z"/><path d="M6.4 8.6h3.2"/>',
    outpost: '<path d="M8 2v12M4 5h8M3 11h10"/><rect x="6" y="6.5" width="4" height="3"/>',
    asteroid: '<path d="M4 3.5 9.5 2l4 3.5L14 11l-4.5 3L3.5 12.5 2 7Z"/><circle cx="8" cy="8" r="1.1"/>',
    mega: '<path d="M1.5 8.8h10.5l2.5-1.6-2.5-1.6H1.5Z"/><path d="M4 5.6V4h3"/>',
    build: '<path d="M10.6 3.2A5.6 5.6 0 1 0 12.8 9.6"/><circle cx="7.6" cy="8" r="1.8"/><path d="M11.2 9.6h3.4v3.4h-3.4zM11.2 9.6l3.4 3.4M14.6 9.6l-3.4 3.4M12.9 9.6V5.2l-2.3 0"/>',
    carrier: '<path d="M1.5 9.5h11l2-2.5h-3.5l-1-2H7v2H1.5Z"/>',
    port: '<path d="M1.5 13.5h13M4 13.5 8 5l4 8.5"/><circle cx="8" cy="4" r="1.2"/>',
    settle: '<path d="M1.5 13.5h13"/><rect x="2.5" y="9" width="3.5" height="4.5"/><rect x="7" y="6.5" width="3" height="7"/><rect x="11" y="10" width="2.5" height="3.5"/>',
    sbuild: '<path d="M1.5 13.5h13M5 13.5V3M3 3h10M12 3v4M5 5.5l2 2M7 5.5l-2 2M5 9l2 2M7 9l-2 2"/><rect x="11" y="7" width="2" height="1.6"/>',
  };
  return P[k] || P.outpost;
}
let _cubo = null;
function stationModel(k) {          // simple original shapes, about 1 unit across, lit like the carriers
  const sv = structModel(k); if (sv) return sv;                    // v0.76.4: the outposts and installations by kind
  const G = new THREE.Group(), hull = new THREE.MeshLambertMaterial({ color: 0xc4c7cf, emissive: 0x2c2f38, flatShading: true }), dark = new THREE.MeshLambertMaterial({ color: 0x4a4e5a, emissive: 0x15171c, flatShading: true }),
    glow = new THREE.MeshBasicMaterial({ color: 0x9fd8ff }), amber = new THREE.MeshBasicMaterial({ color: 0xffc46a });
  const add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); G.add(o); return o; };
  const slot = (z) => { add(new THREE.BoxGeometry(0.06, 0.16, 0.03), dark, 0, 0, z); add(new THREE.BoxGeometry(0.075, 0.012, 0.02), glow, 0, -0.09, z + 0.01); };
  if (k === "coriolis") {
    if (!_cubo) _cubo = new THREE.PolyhedronGeometry([1,1,0,1,-1,0,-1,1,0,-1,-1,0,1,0,1,1,0,-1,-1,0,1,-1,0,-1,0,1,1,0,1,-1,0,-1,1,0,-1,-1],
      [9,0,5,11,5,1,7,2,9,7,11,3,8,4,0,8,2,6,10,1,4,10,6,3,4,1,5,4,5,0,7,5,11,7,9,5,6,7,3,6,2,7,8,0,9,8,9,2,10,8,6,10,4,8,10,3,11,10,11,1], 0.42, 0);
    add(_cubo, hull); slot(0.42 * 0.71);
  } else if (k === "orbis") {
    const ring = add(new THREE.TorusGeometry(0.42, 0.06, 8, 32), hull); ring.rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 12), hull);
    for (let i = 0; i < 3; i++) { const a = i * 2 * Math.PI / 3, sp = add(new THREE.BoxGeometry(0.42, 0.025, 0.025), dark, Math.cos(a) * 0.21, 0, Math.sin(a) * 0.21); sp.rotation.y = -a; }
    add(new THREE.SphereGeometry(0.035, 8, 6), amber, 0, 0.27, 0);
  } else if (k === "ocellus") {
    add(new THREE.IcosahedronGeometry(0.3, 1), hull);
    const ring = add(new THREE.TorusGeometry(0.45, 0.025, 6, 32), dark); ring.rotation.x = Math.PI / 2 + 0.25;
    slot(0.29);
  } else if (k === "dodec") {
    add(new THREE.DodecahedronGeometry(0.38, 0), hull); slot(0.33);
  } else if (k === "asteroid") {
    const g = new THREE.IcosahedronGeometry(0.36, 1), a = g.attributes.position;
    for (let i = 0; i < a.count; i++) { const f = 0.8 + 0.4 * Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1); a.setXYZ(i, a.getX(i) * f, a.getY(i) * f, a.getZ(i) * f); }
    g.computeVertexNormals(); add(g, new THREE.MeshLambertMaterial({ color: 0x7a6c5d, flatShading: true }));
    for (const [x, y, z] of [[0.2, 0.15, 0.25], [-0.25, 0.05, 0.22], [0.05, -0.2, 0.3]]) add(new THREE.BoxGeometry(0.04, 0.04, 0.04), amber, x, y, z);
  } else if (k === "mega") {
    add(new THREE.BoxGeometry(0.9, 0.12, 0.16), hull); add(new THREE.BoxGeometry(0.3, 0.1, 0.24), dark, -0.15, 0.08, 0);
    const bow = add(new THREE.CylinderGeometry(0, 0.08, 0.18, 6), hull, 0.54, 0, 0); bow.rotation.z = -Math.PI / 2;
    add(new THREE.CircleGeometry(0.05, 12), glow, -0.452, 0, 0).rotation.y = -Math.PI / 2;
  } else if (k === "build") {
    const fr = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.6, 0.6, 0.6)), new THREE.LineBasicMaterial({ color: 0xffc46a }));
    G.add(fr); const fr2 = fr.clone(); fr2.scale.setScalar(0.6); fr2.rotation.y = 0.6; G.add(fr2);
    add(new THREE.BoxGeometry(0.22, 0.22, 0.22), dark);
  } else {                           // outpost: a truss with modules and a pad
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6), dark);
    for (const [y, w] of [[0.28, 0.32], [0, 0.22], [-0.28, 0.36]]) add(new THREE.BoxGeometry(w, 0.1, 0.16), hull, 0, y, 0);
    add(new THREE.BoxGeometry(0.3, 0.015, 0.3), new THREE.MeshLambertMaterial({ color: 0x30333c }), 0.24, 0.12, 0);
    add(new THREE.SphereGeometry(0.03, 8, 6), amber, 0, 0.47, 0);
  }
  return G;
}
function placeStations(styl) {
  if (!S.orbitals) return;
  const on = !SURF && $("vStations") && $("vStations").checked, spin = performance.now() / 9000;   // v0.61: in True scale too
  for (const o of S.orbitals) {
    if (!o.obj) continue;
    const vis = on && (!o.build || SMAP.build || YAH.o === o);   // v0.54: construction sites follow the system map's switch (v0.73: yours always shows)
    o.obj.visible = vis; o.label.visible = false;
    const b = o.body;
    if (o.belt) {                                                     // v0.76.1: in the belt, among its rocks (a fixed spot of our own: Spansh has no angle)
      const B = o.belt, R = styl ? (B.styl.userData.mid || 1) : ((B.bl.innerRadius || 0) + (B.bl.outerRadius || 0)) / 2e6, a = (bodyHash({ bodyId: 0, name: o.name }) % 628) / 100;
      const L = styl ? 0.12 : Math.max(R * 0.004, 1e-4);
      if (styl) {                                                   // the rocks sit in the star's own frame: go through it
        const q = o.obj.position.set(Math.cos(a) * R, 0, -Math.sin(a) * R); B.styl.localToWorld(q); if (o.obj.parent) o.obj.parent.worldToLocal(q);
        if (WELL_ON) q.y = surfaceY(S.gridS, q.x, q.z) + 0.04;
      } else o.obj.position.set(b._obj.position.x + Math.cos(a) * R, b._obj.position.y, b._obj.position.z - Math.sin(a) * R);
      o.obj.scale.setScalar(L); o.obj.rotation.set(0, spin + o.idx, 0);
      o.label.visible = vis && (camera.position.distanceTo(o.obj.position) < L * 100 || YAH.o === o);
      continue;
    }
    const L = styl ? Math.max(0.15, b._vis * bodyScale * 1.4) * 0.22 : trueSize(b) * 0.3, ext = styl ? extentOf(b) : trueExt(b);
    const a = 0.7 + o.idx * 0.95; _fcd.set(Math.cos(a), 0.3, Math.sin(a)).normalize();
    o.obj.position.copy(b._obj.position).addScaledVector(_fcd, ext + L * 0.9);
    o.obj.scale.setScalar(L); o.obj.rotation.set(0, spin + o.idx, 0);       // a slow turn, only for looks
    o.label.visible = vis && (camera.position.distanceTo(o.obj.position) < L * 100 || YAH.o === o);   // v0.73: your station's name always shows
  }
}

// ------------------------------------------------------------ stations on a surface in 3D (v0.55)
// Spansh gives each one a latitude and longitude, so the model stands at that spot on its body, upright on the ground.
// Which way the body faces right now (its spin angle) is not in the data, so the spot turns with the body's illustrative
// spin. A small glowing dot keeps it findable from far away; it hides behind the body like the spot itself.
let _beaconTex = null;
function beaconTex() {
  if (_beaconTex) return _beaconTex;
  const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,.9)"); gr.addColorStop(0.5, "rgba(255,255,255,.25)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); _beaconTex = new THREE.CanvasTexture(c); return _beaconTex;
}
function surfaceModel(k) {           // about 1 unit across, +y pointing away from the ground
  const sv = structModel(k); if (sv) return sv;                    // v0.76.4: outposts, settlements and hubs by kind
  const G = new THREE.Group(), lit = (c, e) => new THREE.MeshLambertMaterial({ color: c, emissive: e || 0x1a1d24 });
  const grey = lit(0xc9cdd6, 0x2a2e38), dark = lit(0x4a4e5a), green = new THREE.MeshBasicMaterial({ color: 0x8fe3a0 }), lilac = new THREE.MeshBasicMaterial({ color: 0xc9b6ea });
  const add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); G.add(o); return o; };
  if (k === "port") {
    add(new THREE.CylinderGeometry(0.5, 0.55, 0.06, 24), dark, 0, 0.03, 0);
    const dome = add(new THREE.SphereGeometry(0.3, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), grey, 0, 0.06, 0);
    add(new THREE.CylinderGeometry(0.025, 0.025, 0.35, 6), grey, 0, 0.5, 0); add(new THREE.SphereGeometry(0.05, 8, 6), green, 0, 0.7, 0);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; add(new THREE.BoxGeometry(0.16, 0.012, 0.16), green, Math.cos(a) * 0.42, 0.07, Math.sin(a) * 0.42); }
  } else if (k === "sbuild") {
    add(new THREE.BoxGeometry(0.5, 0.05, 0.5), dark, 0, 0.025, 0);
    add(new THREE.BoxGeometry(0.06, 0.8, 0.06), lilac, -0.15, 0.45, 0);                       // mast
    add(new THREE.BoxGeometry(0.62, 0.04, 0.04), lilac, 0.08, 0.85, 0);                       // jib
    add(new THREE.BoxGeometry(0.01, 0.35, 0.01), lilac, 0.33, 0.67, 0); add(new THREE.BoxGeometry(0.08, 0.06, 0.08), lilac, 0.33, 0.48, 0);
    add(new THREE.BoxGeometry(0.22, 0.18, 0.22), grey, 0.15, 0.14, 0.1);
  } else {                           // settlement: a few blocks on a pad
    add(new THREE.BoxGeometry(0.75, 0.04, 0.55), dark, 0, 0.02, 0);
    for (const [x, z, h, w] of [[-0.22, -0.08, 0.28, 0.2], [0.02, 0.1, 0.46, 0.18], [0.24, -0.1, 0.2, 0.22], [-0.05, -0.18, 0.14, 0.14]]) add(new THREE.BoxGeometry(w, h, w), grey, x, 0.04 + h / 2, z);
    add(new THREE.SphereGeometry(0.035, 8, 6), green, 0.02, 0.55, 0.1);
  }
  return G;
}
function buildSurfaceSites() {
  S.surfSites = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (const b of S.bodies) {
    if (!b._mesh || b.type === "Star") continue;
    (b.stations || []).forEach((st, i) => {
      const k = surfKind(st), known = st.latitude != null && st.longitude != null;
      const lat = (known ? st.latitude : ((i * 37 + b.bodyId * 13) % 120) - 60) * DEG, lon = (known ? st.longitude : (i * 83 + 20) % 360) * DEG;
      const n = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon));
      const v = surfVariant(st, k.k), m = surfaceModel(v); m.quaternion.setFromUnitVectors(up, n); m.position.copy(n).multiplyScalar(0.998); m.scale.setScalar(0.035);   // v0.62: the mesh is a unit sphere scaled by the radius, so these are in radii
      const bc = new THREE.Sprite(new THREE.SpriteMaterial({ map: beaconTex(), color: k.k === "sbuild" ? 0xc9b6ea : 0x8fe3a0, transparent: true, depthWrite: false, sizeAttenuation: false, blending: THREE.AdditiveBlending }));
      bc.scale.setScalar(0.014); bc.position.copy(n).multiplyScalar(1.004); bc.renderOrder = 4;
      b._mesh.add(m); b._mesh.add(bc);
      const site = { b, st, k: k.k, v, kind: stnKindName(st, k.n, v), name: stnName(st) || "Unnamed", known, build: k.k === "sbuild", model: m, beacon: bc };
      bc.userData.site = site; S.surfSites.push(site);
    });
  }
}
const _sws = new THREE.Vector3();
function placeSurfaceSites(styl) {
  if (!S.surfSites) return;
  const on = !SURF && $("vStations") && $("vStations").checked, t = performance.now() / 600;
  for (const q of S.surfSites) {
    const vis = on && (!q.build || SMAP.build);
    q.model.visible = vis; q.beacon.visible = vis;             // v0.61: the model shows in True scale too (enlarged, like the stations in orbit)
    if (vis) {                                     // the dot keeps the same size on screen, whatever the body's display scale
      q.b._mesh.getWorldScale(_sws); const f = (q.hit ? 1.35 + 0.25 * Math.sin(t) : 1) * 0.024 / (_sws.x || 1);
      q.beacon.scale.setScalar(f); q.beacon.material.opacity = q.dim ? 0.18 : 1; }
  }
}
const _fcd = new THREE.Vector3();
// True scale: stations and carriers are kilometres across, invisible next to a planet. They are drawn enlarged (a quarter
// of a small body, capped for giants) beside the body, at a spot that is not in the data, so their tooltips say so.
const trueSize = b => Math.min(b._r, 6);                       // Mm: 6000 km cap so a gas giant's stations stay modest
const trueExt = b => b._r * Math.max(1, b._ringRatio || 1);
function placeCarriers(styl) {
  if (!S.carriers) return;
  const on = !SURF && $("vCarriers") && $("vCarriers").checked;                                       // v0.61: in True scale too
  if (S.fcLight && S.main) S.fcLight.position.copy(S.main._obj.position);
  for (const c of S.carriers) {
    if (!c.obj) continue;
    c.obj.visible = on; c.label.visible = false;      // a CSS label ignores its parent's visibility, so hide it explicitly
    const b = c.body, L = styl ? Math.max(0.15, b._vis * bodyScale * 1.4) * 0.25 : trueSize(b) * 0.34, ext = styl ? extentOf(b) : trueExt(b);
    const a = 0.7 + c.idx * 0.95; _fcd.set(Math.cos(a), 0.3, Math.sin(a)).normalize();
    c.obj.position.copy(b._obj.position).addScaledVector(_fcd, ext + L * 0.75);
    c.obj.scale.setScalar(L); c.obj.rotation.set(0, -a + Math.PI / 2, 0);
    c.label.visible = on && (camera.position.distanceTo(c.obj.position) < L * 100 || YAH.o === c);   // name only when zoomed in (keeps the overview clean), or when you are aboard
  }
}

// Fraction of a star's disc visible from a body's centre, using TRUE positions and radii.
function discCoverJS(aS, aO, sep) {
  if (sep >= aS + aO) return 0;
  const full = Math.min(1, (aO * aO) / (aS * aS));
  if (sep <= Math.abs(aO - aS)) return full;
  return full * Math.min(1, Math.max(0, (aS + aO - sep) / (2 * Math.min(aS, aO))));
}
function starlight(b, star) {
  const W = S.world, pb = W.get(b.bodyId), ps = W.get(star.bodyId);
  const L = { x: ps.x - pb.x, y: ps.y - pb.y, z: ps.z - pb.z }, dL = Math.hypot(L.x, L.y, L.z);
  const aS = Math.asin(Math.min(star._r / dL, 1));
  let vis = 1;
  for (const o of S.bodies) {
    if (o === b || o === star) continue;
    const po = W.get(o.bodyId), v = { x: po.x - pb.x, y: po.y - pb.y, z: po.z - pb.z }, dO = Math.hypot(v.x, v.y, v.z);
    if (dO >= dL || v.x * L.x + v.y * L.y + v.z * L.z <= 0) continue;
    const aO = Math.asin(Math.min(o._r / dO, 1));
    const cx = v.y * L.z - v.z * L.y, cy = v.z * L.x - v.x * L.z, cz = v.x * L.y - v.y * L.x;
    const sep = Math.atan2(Math.hypot(cx, cy, cz), v.x * L.x + v.y * L.y + v.z * L.z);
    vis *= 1 - discCoverJS(aS, aO, sep);
    if (vis <= 0) return 0;
  }
  return vis;
}
