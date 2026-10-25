// ------------------------------------------------------------ v0.76.4: a look of its own for every kind of structure
// Spansh says what a station is (its type) and what it does (its main economy, its government). From these we pick one of
// many small original models, in the same simple style as the starports. The model shows the kind only: its real layout,
// size and turn are not in the data. Built once when a system loads, from a few shared materials. Nothing runs per frame.
//
// Orbital outposts by economy, orbital installations, surface outposts, Odyssey settlements by economy, and surface hubs.
// Installations and hubs have no landing pads, so Spansh may not list them. They show when it does (matched by their type).

// ---- which look a station gets (variant). k stays the broad kind the rest of GRAVITAS uses
var STRUCT_NAMES = {
  "o-civ": "Outpost", "o-ind": "Industrial outpost", "o-sci": "Scientific outpost", "o-mil": "Military outpost", "o-pir": "Pirate outpost",
  "o-ext": "Outpost", "o-tour": "Outpost", "o-agri": "Outpost",
  "i-sat": "Satellite installation", "i-comm": "Communication installation", "i-farm": "Space farm", "i-pir": "Pirate base installation",
  "i-mine": "Mining installation", "i-relay": "Relay installation", "i-mil": "Military installation", "i-sec": "Security installation",
  "i-gov": "Government installation", "i-med": "Medical installation", "i-res": "Research installation", "i-tour": "Tourist installation", "i-bar": "Space bar",
};
function econOf(st) { return String((st && st.primaryEconomy) || "").toLowerCase(); }
function stnVariant(st, k) {                          // an orbital station: its look
  const t = String(st.type || "").toLowerCase(), e = econOf(st), g = String(st.government || "").toLowerCase();
  if (/installation|space farm|space bar|relay|satellite/.test(t)) {
    const I = [[/satellite/, "i-sat"], [/communication/, "i-comm"], [/farm/, "i-farm"], [/pirate/, "i-pir"], [/mining|industrial/, "i-mine"], [/relay/, "i-relay"],
      [/military/, "i-mil"], [/security/, "i-sec"], [/government/, "i-gov"], [/medical/, "i-med"], [/research/, "i-res"], [/tourist/, "i-tour"], [/bar/, "i-bar"]];
    for (const [re, v] of I) if (re.test(t)) return v;
    return "i-sat";
  }
  if (k !== "outpost") return k;
  if (g === "anarchy") return "o-pir";
  return { colony: "o-civ", industrial: "o-ind", "high tech": "o-sci", military: "o-mil", extraction: "o-ext", refinery: "o-ext", tourism: "o-tour", agriculture: "o-agri", service: "o-pir" }[e] || "outpost";
}
function surfVariant(st, k) {                         // a station on a surface: its look
  if (k === "sbuild") return k;
  const t = String(st.type || "").toLowerCase(), e = econOf(st);
  if (/hub/.test(t)) {
    const H = [[/extraction/, "h-ext"], [/civilian/, "h-civ"], [/exploration/, "h-exp"], [/outpost/, "h-out"], [/scientific/, "h-sci"], [/military/, "h-mil"], [/refinery/, "h-ref"], [/high ?tech/, "h-ht"], [/industrial/, "h-ind"]];
    for (const [re, v] of H) if (re.test(t)) return v;
    return "h-out";
  }
  if (/planetary port/.test(t)) return "port";
  if (/outpost/.test(t)) return { industrial: "so-ind", refinery: "so-ind", "high tech": "so-sci", military: "so-mil", extraction: "so-ext" }[e] || "so-civ";
  if (k === "settle") return { agriculture: "st-agri", extraction: "st-mine", industrial: "st-ind", refinery: "st-ind", military: "st-mil", "high tech": "st-bio", tourism: "st-tour" }[e] || "settle";
  return k;
}
// the name shown with it: the type Spansh gives, plus the economy where the type alone says little
function stnKindName(st, n, v) {
  const e = st.primaryEconomy || "";
  if (STRUCT_NAMES[v] && v[0] === "i") return st.type || STRUCT_NAMES[v];
  if (v === "o-pir") return "Outpost · anarchy";
  if (/^o-/.test(v) && e) return `Outpost · ${e.toLowerCase()} economy`;
  if (/^(so|st)-/.test(v) && e) return `${n} · ${e.toLowerCase()} economy`;
  return n;
}

// ---- small glyphs (16 × 16, drawn with the text colour), one per look
var STRUCT_GLYPH = {
  // orbital outposts: one clear picture for what the outpost does
  "o-civ": '<path d="M2.4 7.6 8 2.8l5.6 4.8M4 6.4v7h8v-7M6.8 13.4V10h2.4v3.4"/>',
  "o-ind": '<rect x="2.5" y="3" width="4" height="10" rx="2"/><rect x="9.5" y="5.5" width="4" height="7.5" rx="2"/><path d="M6.5 8h3"/>',
  "o-sci": '<path d="M3 4.5a6.2 6.2 0 0 0 8.5 8.5Z"/><path d="M7.2 8.8 12.6 3.4"/><path d="M12.8 3.2h.01"/>',
  "o-mil": '<path d="M8 1.8 13.4 4v4c0 3.2-2.4 5.3-5.4 6.2C5 13.3 2.6 11.2 2.6 8V4Z"/><path d="M5.4 7.2 8 9.2l2.6-2"/>',
  "o-pir": '<path d="M3.2 3.2l8.6 8.6M12.8 3.2l-8.6 8.6M9.6 12.6l3-3M3.4 9.6l3 3M12.4 12.4l1.4 1.4M3.6 12.4l-1.4 1.4"/>',
  "o-ext": '<path d="M3 13.4 9.8 5.2"/><path d="M4.8 3.8C8.4 2.2 12.2 3.8 13.2 7.6"/>',
  "o-tour": '<path d="M8 1.8l1.7 4.5L14.2 8l-4.5 1.7L8 14.2l-1.7-4.5L1.8 8l4.5-1.7Z"/>',
  "o-agri": '<path d="M8 14V7.5"/><path d="M8 9.8C8 6.4 5.6 4.8 2.6 4.8c0 3.4 2.4 5 5.4 5ZM8 7.6c0-3 2-4.6 5.4-4.6 0 3-2 4.6-5.4 4.6Z"/>',
  // installations (no pads): the thing itself
  "i-sat": '<path d="M8 5.2 10.8 8 8 10.8 5.2 8Z"/><path d="M2 4.6 4.6 2 7 4.4 4.4 7ZM9 11.6 11.6 9 14 11.4 11.4 14Z"/><path d="M6.6 6.6 5.6 5.6M9.4 9.4l1 1"/>',
  "i-comm": '<path d="M2.8 6a5.4 5.4 0 0 0 7.2 7.2Z"/><path d="M6.4 9.6 3.6 14.2h5.6"/><path d="M9.8 3.4a3 3 0 0 1 2.8 2.8M9.8 1.2a5.2 5.2 0 0 1 5 5"/>',
  "i-farm": '<rect x="1.8" y="4.4" width="12.4" height="7.2" rx="3.6"/><path d="M8 11.6V8.2"/><path d="M8 8.8c0-2 1.5-3 3.4-3 0 2-1.5 3-3.4 3ZM8 9.8c0-1.6-1.2-2.6-2.9-2.6 0 1.6 1.2 2.6 2.9 2.6Z"/>',
  "i-pir": '<path d="M4 14.2V1.8"/><path d="M4 2.4h9.2l-2.2 3.1 2.2 3.1H4"/><path d="M8.2 5.5h.01"/>',
  "i-mine": '<path d="M2.4 10.2 3.8 6 8 4.8l3.2 2.6.4 4.2-3.6 2.6-4.4-1.2Z"/><path d="M6.6 8.6h.01M9 10.4h.01"/><path d="M10.4 4.6 13.8 1.8l.4 2.6-2.4 1.8Z"/>',
  "i-relay": '<circle cx="8" cy="8" r="1.6"/><path d="M5 5a4.3 4.3 0 0 0 0 6M11 5a4.3 4.3 0 0 1 0 6M2.8 2.8a7.4 7.4 0 0 0 0 10.4M13.2 2.8a7.4 7.4 0 0 1 0 10.4"/>',
  "i-mil": '<path d="M8 1.6 13.6 4.8v6.4L8 14.4 2.4 11.2V4.8Z"/><circle cx="8" cy="8" r="2.2"/><path d="M8 4.2v1.6M8 10.2v1.6M4.2 8h1.6M10.2 8h1.6"/>',
  "i-sec": '<rect x="3.4" y="7" width="9.2" height="7.2" rx="1.6"/><path d="M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0V7M8 9.6v2"/>',
  "i-gov": '<path d="M2 14.2h12M3 12.6h10M2.4 6h11.2L8 2.4Z"/><path d="M4.6 6.6v5.4M8 6.6v5.4M11.4 6.6v5.4"/>',
  "i-med": '<path d="M6.2 2.2h3.6v4h4v3.6h-4v4H6.2v-4h-4V6.2h4Z"/>',
  "i-res": '<path d="M5.8 2h4.4M6.6 2v4.2L3 13.1c-.4.7.1 1.3.9 1.3h8.2c.8 0 1.3-.6.9-1.3L9.4 6.2V2"/><path d="M4.6 10.4h6.8"/>',
  "i-tour": '<rect x="1.8" y="5" width="12.4" height="8.6" rx="1.6"/><circle cx="8" cy="9.2" r="2.4"/><path d="M5.4 5l1.1-2.2h3l1.1 2.2"/>',
  "i-bar": '<path d="M2.4 2.8h11.2L8 9.2ZM8 9.2v4.8M5 14h6"/><path d="M10.6 2.8 12.6.9"/>',
  // outposts on a surface: buildings on the ground
  "so-civ": '<path d="M1.4 14h13.2M2.6 14v-3a2.4 2.4 0 0 1 4.8 0v3M8.6 14V8.6L11.3 6.2 14 8.6V14"/>',
  "so-ind": '<path d="M1.4 14h13.2M2.4 14V9l3.4-2.4V9l3.4-2.4V14M10.8 14V3.4h2.6V14"/>',
  "so-sci": '<path d="M1.4 14h13.2M8.6 14v-3.2"/><path d="M3 4.4a5.8 5.8 0 0 0 9.2 6.2Z"/><path d="M7.4 7.6l4.2-4.2"/>',
  "so-mil": '<path d="M1.4 14h13.2M2.4 14v-3.6L5 8h6l2.6 2.4V14"/><path d="M8 8V2.4l3.6 1.6L8 5.6"/>',
  "so-ext": '<path d="M1.4 14h13.2M3.8 14 7.2 2.4h1.6L12.2 14M5.2 9.6h5.6M6.2 6h3.6"/>',
  // Odyssey settlements: the same pictures as the outposts, standing on the ground
  "st-agri": '<path d="M1.4 14h13.2M8 14V8.6"/><path d="M8 10.4c0-3-2.1-4.4-4.9-4.4 0 3 2.1 4.4 4.9 4.4ZM8 8.6c0-2.7 1.9-4.1 4.9-4.1 0 2.7-1.9 4.1-4.9 4.1Z"/>',
  "st-mine": '<path d="M1.4 14h13.2M3.4 12 9.4 4.8"/><path d="M5 3.4C8.2 2 11.6 3.4 12.6 6.8"/>',
  "st-ind": '<path d="M1.4 14h13.2"/><circle cx="8" cy="7.6" r="2"/><path d="M8 3.2v1.6M8 10.4V12M3.6 7.6h1.6M10.8 7.6h1.6M4.9 4.5l1.1 1.1M10 9.6l1.1 1.1M11.1 4.5 10 5.6M6 9.6l-1.1 1.1"/>',
  "st-mil": '<path d="M1.4 14h13.2"/><path d="M8 2.2 12.4 4v3.2c0 2.7-1.9 4.4-4.4 5.2-2.5-.8-4.4-2.5-4.4-5.2V4Z"/>',
  "st-bio": '<path d="M1.4 14h13.2M2.4 14a5.6 5.6 0 0 1 11.2 0"/><path d="M8 14v-2.6"/><path d="M8 12c0-1.6 1.2-2.6 2.7-2.6 0 1.6-1.2 2.6-2.7 2.6Z"/>',
  "st-tour": '<path d="M1.4 14h13.2M3 14V3.2h4.6V14M5.3 5.8h.01M5.3 8.4h.01M5.3 11h.01M8.8 14a2.9 2.9 0 0 1 5.8 0"/>',
};
{                                                     // surface hubs: a six-sided badge with what the hub does inside
  const hex = '<path d="M8 1.4 13.7 4.7v6.6L8 14.6 2.3 11.3V4.7Z"/>';
  const T = { "h-ext": '<path d="M5 7.6c1.6-2 4.4-2 6 0M8 6.3v5"/>', "h-civ": '<path d="M5 8.6 8 6l3 2.6V11H5Z"/>',
    "h-exp": '<circle cx="8" cy="8" r="2.8"/><path d="M8 6.2 9.1 9 6.9 9Z"/>', "h-out": '<path d="M8 11.6V7.4M6.2 8.4a2.6 2.6 0 0 1 3.6 0M5 6.8a4.2 4.2 0 0 1 6 0"/>',
    "h-sci": '<path d="M6.8 5h2.4M7.2 5v2L5.2 10.8h5.6L8.8 7V5"/>', "h-mil": '<path d="M5.4 6.6 8 8.4l2.6-1.8M5.4 9.2 8 11l2.6-1.8"/>',
    "h-ref": '<path d="M8 4.8c1.6 2.1 2.6 3.3 2.6 4.5a2.6 2.6 0 0 1-5.2 0c0-1.2 1-2.4 2.6-4.5Z"/>', "h-ht": '<rect x="5.7" y="5.7" width="4.6" height="4.6" rx=".6"/><path d="M7 4.4v1.3M9 4.4v1.3M7 10.3v1.3M9 10.3v1.3M4.4 7h1.3M4.4 9h1.3M10.3 7h1.3M10.3 9h1.3"/>',
    "h-ind": '<circle cx="8" cy="8" r="1.5"/><path d="M8 4.6v1.4M8 10v1.4M4.6 8H6M10 8h1.4M5.6 5.6l1 1M9.4 9.4l1 1M10.4 5.6l-1 1M6.6 9.4l-1 1"/>' };
  for (const k in T) STRUCT_GLYPH[k] = hex + T[k];
}
// a surface look on the system map: the same glyph, standing on the body (ground at 0, up is −y)
function structMapMark(v) { const p = STRUCT_GLYPH[v]; return p ? `<g class="gl" transform="translate(-6.4 -11.4) scale(.8)"><g class="gl0">${p}</g><g class="gl1">${p}</g></g>` : ""; }

// ---- the 3D models (about 1 unit across). Orbital ones turn slowly around y; surface ones stand on y = 0
var _SMAT = null;
function structMats() {
  if (_SMAT) return _SMAT;
  const L = (c, e) => new THREE.MeshLambertMaterial({ color: c, emissive: e || 0x1a1d24, flatShading: true }), B = c => new THREE.MeshBasicMaterial({ color: c });
  _SMAT = { hull: L(0xc4c7cf, 0x2c2f38), dark: L(0x4a4e5a, 0x15171c), pad: L(0x30333c), rock: L(0x7a6c5d, 0x1a1510), gold: L(0xd9b45a, 0x3a2c10),
    white: L(0xeceef4, 0x34363e), soil: L(0x8a6a4a, 0x201810), panel: L(0x2b4f8a, 0x0e1d38), rust: L(0x8a5a44, 0x24140c),
    glass: new THREE.MeshLambertMaterial({ color: 0x9fe8ff, emissive: 0x1a4a5a, transparent: true, opacity: 0.45, depthWrite: false }),
    glow: B(0x9fd8ff), amber: B(0xffc46a), green: B(0x8fe3a0), red: B(0xff5a5a), pink: B(0xff9ad8), cyan: B(0x7fe8ff), orange: B(0xffa25c), violet: B(0xc9a0ff), leaf: B(0x9be37a) };
  return _SMAT;
}
function structModel(v) {
  if (!STRUCT_GLYPH[v]) return null;
  const M = structMats(), G = new THREE.Group();
  const add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); G.add(o); return o; };
  const box = (w, h, d, m, x, y, z) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z);
  const cyl = (r1, r2, h, m, x, y, z, s = 10) => add(new THREE.CylinderGeometry(r1, r2, h, s), m, x, y, z);
  const sph = (r, m, x, y, z, s = 10) => add(new THREE.SphereGeometry(r, s, Math.max(6, s >> 1)), m, x, y, z);
  const dome = (r, m, x, y, z) => add(new THREE.SphereGeometry(r, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), m, x, y, z);
  const tor = (R, r, m, x, y, z, rx = Math.PI / 2) => { const o = add(new THREE.TorusGeometry(R, r, 6, 28), m, x, y, z); o.rotation.x = rx; return o; };
  const light = (m, x, y, z, r = 0.03) => sph(r, m, x, y, z, 6);
  const truss = () => { cyl(0.035, 0.035, 0.9, M.dark); box(0.3, 0.015, 0.3, M.pad, 0.24, 0.12, 0); light(M.amber, 0, 0.47, 0); };
  const ground = (w = 0.75, d = 0.55) => box(w, 0.04, d, M.dark, 0, 0.02, 0);
  const hexBase = () => cyl(0.5, 0.55, 0.07, M.dark, 0, 0.035, 0, 6);
  switch (v) {
    // ---- outposts in orbit, by economy
    case "o-civ": truss(); tor(0.3, 0.05, M.hull, 0, 0.05, 0); box(0.2, 0.12, 0.2, M.hull, 0, 0.32, 0); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; light(M.amber, Math.cos(a) * 0.3, 0.1, Math.sin(a) * 0.3); } break;
    case "o-ind": truss(); cyl(0.11, 0.11, 0.42, M.hull, -0.17, 0, 0); cyl(0.11, 0.11, 0.42, M.hull, 0.17, -0.1, 0); box(0.5, 0.06, 0.06, M.dark, 0, 0.22, 0); light(M.orange, -0.17, -0.24, 0, 0.045); light(M.orange, 0.17, -0.34, 0, 0.045); break;
    case "o-sci": { truss(); const d = add(new THREE.SphereGeometry(0.26, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3.2), M.white, 0, 0.12, 0.05); d.rotation.x = Math.PI * 0.85; cyl(0.012, 0.012, 0.22, M.dark, 0, 0.3, -0.05); light(M.cyan, 0, 0.42, -0.05, 0.04); box(0.18, 0.14, 0.18, M.hull, 0, -0.26, 0); } break;
    case "o-mil": { truss(); const a = box(0.5, 0.14, 0.24, M.dark, 0, 0.02, 0); a.rotation.z = 0.08; box(0.38, 0.1, 0.3, M.hull, 0, -0.25, 0); for (const z of [-0.07, 0.07]) { const g = cyl(0.015, 0.015, 0.3, M.dark, 0.32, 0.06, z, 6); g.rotation.z = Math.PI / 2; } light(M.red, 0, 0.47, 0, 0.04); } break;
    case "o-pir": { const t = cyl(0.035, 0.035, 0.9, M.dark); t.rotation.z = 0.25; for (const [x, y, z, w, r] of [[-0.18, 0.2, 0.05, 0.26, 0.4], [0.12, -0.05, -0.06, 0.3, -0.3], [-0.05, -0.28, 0.08, 0.22, 0.9]]) { const b = box(w, 0.12, 0.16, M.rust, x, y, z); b.rotation.set(r * 0.5, r, r * 0.3); } light(M.red, 0.1, 0.42, 0, 0.04); light(M.pink, -0.25, 0.28, 0.12); } break;
    case "o-ext": { truss(); const h = cyl(0.24, 0.06, 0.26, M.hull, 0, 0.18, 0); h.rotation.x = Math.PI; for (const x of [-0.16, 0.16]) box(0.14, 0.12, 0.14, M.soil, x, -0.25, 0); sph(0.07, M.rock, 0, 0.36, 0, 6); } break;
    case "o-tour": truss(); dome(0.26, M.glass, 0, 0.02, 0); cyl(0.27, 0.27, 0.03, M.hull, 0, 0.02, 0, 20); for (let i = 0; i < 5; i++) { const a = i * 1.257; light(M.pink, Math.cos(a) * 0.27, 0.04, Math.sin(a) * 0.27); } box(0.16, 0.16, 0.16, M.hull, 0, -0.3, 0); break;
    case "o-agri": truss(); for (const x of [-0.2, 0.2]) { box(0.16, 0.5, 0.2, M.glass, x, 0, 0); box(0.04, 0.42, 0.12, M.leaf, x, 0, 0); } break;
    // ---- installations in orbit (no landing pads)
    case "i-sat": box(0.18, 0.18, 0.18, M.hull); for (const s of [-1, 1]) { box(0.36, 0.01, 0.2, M.panel, s * 0.33, 0, 0); box(0.1, 0.02, 0.02, M.dark, s * 0.13, 0, 0); } cyl(0.01, 0.01, 0.2, M.dark, 0, 0.19, 0, 6); light(M.glow, 0, 0.3, 0); break;
    case "i-comm": cyl(0.03, 0.03, 0.8, M.dark); box(0.16, 0.12, 0.16, M.hull, 0, -0.3, 0); for (const [y, a] of [[0.28, 0], [0.06, 2.1], [-0.14, 4.2]]) {   // three dishes on short arms, facing out
        const x = Math.cos(a), z = Math.sin(a); box(0.16, 0.02, 0.02, M.dark, x * 0.08, y, z * 0.08).rotation.y = -a;
        const d = cyl(0.13, 0.03, 0.05, M.white, x * 0.18, y, z * 0.18, 16); d.rotation.set(0, -a, -Math.PI / 2); light(M.glow, x * 0.23, y, z * 0.23, 0.02); }
      light(M.glow, 0, 0.42, 0); break;
    case "i-farm": cyl(0.03, 0.03, 0.95, M.dark).rotation.z = Math.PI / 2; for (const x of [-0.33, -0.11, 0.11, 0.33]) { cyl(0.08, 0.08, 0.34, M.glass, x, 0, 0, 10); cyl(0.05, 0.05, 0.3, M.leaf, x, 0, 0, 8); } break;
    case "i-pir": for (const [x, y, z, r] of [[-0.18, 0.08, 0, 0.5], [0.15, 0.15, 0.08, -0.7], [0.05, -0.14, -0.06, 1.2], [-0.1, -0.2, 0.15, 2]]) { const b = box(0.22, 0.12, 0.14, M.rust, x, y, z); b.rotation.set(r, r * 0.6, r * 0.3); } light(M.red, 0.15, 0.3, 0.08, 0.04); break;
    case "i-mine": { sph(0.14, M.hull); for (let i = 0; i < 3; i++) { const a = i * 2.094, x = Math.cos(a), z = Math.sin(a); const arm = cyl(0.025, 0.025, 0.34, M.dark, x * 0.22, 0, z * 0.22, 6); arm.rotation.set(0, -a, Math.PI / 2); const c = cyl(0, 0.07, 0.14, M.orange, x * 0.44, 0, z * 0.44, 8); c.rotation.set(0, -a, Math.PI / 2); } } break;
    case "i-relay": tor(0.38, 0.03, M.hull, 0, 0, 0); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; box(0.36, 0.015, 0.015, M.dark, Math.cos(a) * 0.19, 0, Math.sin(a) * 0.19).rotation.y = -a; } add(new THREE.OctahedronGeometry(0.11, 0), M.violet); break;
    case "i-mil": cyl(0.32, 0.32, 0.2, M.dark, 0, 0, 0, 6); cyl(0.2, 0.26, 0.12, M.hull, 0, 0.16, 0, 6); for (let i = 0; i < 3; i++) { const a = i * 2.094; const g = cyl(0.012, 0.012, 0.22, M.dark, Math.cos(a) * 0.2, 0.26, Math.sin(a) * 0.2, 6); g.rotation.set(0, -a, Math.PI / 2.4); } light(M.red, 0, 0.26, 0, 0.04); break;
    case "i-sec": sph(0.16, M.hull, 0, 0, 0, 12); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; const p = box(0.04, 0.3, 0.2, M.panel, Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32); p.rotation.y = -a; light(M.glow, Math.cos(a) * 0.36, 0.18, Math.sin(a) * 0.36); } break;
    case "i-gov": box(0.5, 0.12, 0.36, M.white, 0, -0.12, 0); for (const x of [-0.18, -0.06, 0.06, 0.18]) cyl(0.025, 0.025, 0.2, M.white, x, 0.04, 0.15, 6); box(0.5, 0.04, 0.36, M.white, 0, 0.15, 0); dome(0.14, M.gold, 0, 0.17, 0); light(M.amber, 0, 0.33, 0); break;
    case "i-med": box(0.5, 0.15, 0.15, M.white); box(0.15, 0.5, 0.15, M.white); box(0.16, 0.16, 0.16, M.hull, 0, 0, 0); for (const [x, y] of [[0.26, 0], [-0.26, 0], [0, 0.26], [0, -0.26]]) light(M.red, x, y, 0.08); break;
    case "i-res": { sph(0.2, M.hull, 0, 0, 0, 14); const r = tor(0.36, 0.015, M.dark, 0, 0, 0); r.rotation.set(1.1, 0, 0.5); light(M.cyan, 0.3, 0.16, 0.1, 0.045); box(0.08, 0.08, 0.24, M.dark, 0, 0, 0.22); } break;
    case "i-tour": sph(0.3, M.glass, 0, 0.05, 0, 16); cyl(0.14, 0.18, 0.12, M.hull, 0, -0.08, 0, 14); tor(0.32, 0.02, M.pink, 0, -0.02, 0); cyl(0.03, 0.03, 0.26, M.dark, 0, -0.32, 0, 6); break;
    case "i-bar": { const s = cyl(0.4, 0.34, 0.08, M.hull, 0, 0, 0, 24); dome(0.18, M.glass, 0, 0.04, 0); tor(0.37, 0.018, M.pink, 0, 0.0, 0); tor(0.3, 0.012, M.amber, 0, -0.04, 0); s.rotation.y = 0.3; } break;
    // ---- outposts on a surface
    case "so-civ": ground(0.9, 0.7); for (const [x, z, r] of [[-0.24, -0.12, 0.13], [0.04, 0.16, 0.11], [0.26, -0.1, 0.1]]) dome(r, M.hull, x, 0.04, z); cyl(0.022, 0.022, 0.5, M.hull, 0.02, 0.29, -0.15, 6); light(M.green, 0.02, 0.56, -0.15, 0.04); box(0.18, 0.012, 0.18, M.green, -0.3, 0.05, 0.2); break;
    case "so-ind": ground(0.9, 0.7); box(0.42, 0.2, 0.3, M.hull, -0.1, 0.14, 0); for (const x of [0.2, 0.32]) cyl(0.04, 0.05, 0.5, M.dark, x, 0.29, -0.1, 8); light(M.orange, 0.2, 0.56, -0.1); light(M.orange, 0.32, 0.56, -0.1); box(0.18, 0.012, 0.18, M.green, -0.3, 0.05, 0.22); break;
    case "so-sci": { ground(0.9, 0.7); dome(0.16, M.white, -0.2, 0.04, 0.08); cyl(0.025, 0.025, 0.36, M.dark, 0.18, 0.22, -0.08, 6); const d = add(new THREE.SphereGeometry(0.17, 14, 7, 0, Math.PI * 2, 0, Math.PI / 3), M.white, 0.18, 0.4, -0.08); d.rotation.x = Math.PI * 0.8; light(M.cyan, 0.18, 0.5, -0.02, 0.035); box(0.18, 0.012, 0.18, M.green, -0.28, 0.05, -0.2); } break;
    case "so-mil": { ground(0.9, 0.7); box(0.5, 0.14, 0.34, M.dark, -0.06, 0.11, 0); box(0.14, 0.1, 0.14, M.hull, 0.1, 0.23, 0); const g = cyl(0.015, 0.015, 0.24, M.dark, 0.24, 0.24, 0, 6); g.rotation.z = Math.PI / 2; cyl(0.02, 0.02, 0.4, M.hull, -0.3, 0.24, -0.2, 6); light(M.red, -0.3, 0.46, -0.2, 0.04); box(0.18, 0.012, 0.18, M.green, 0.28, 0.05, 0.24); } break;
    case "so-ext": { ground(0.9, 0.7); for (const [x, z] of [[-0.1, -0.1], [0.1, -0.1], [0, 0.1]]) { const l = cyl(0.015, 0.015, 0.62, M.dark, x * 0.6, 0.33, z * 0.6, 6); l.rotation.set(z * 0.5, 0, -x * 0.5); } light(M.amber, 0, 0.64, 0); cyl(0.09, 0.09, 0.3, M.soil, 0.3, 0.19, 0.1, 10); add(new THREE.ConeGeometry(0.14, 0.14, 8), M.rock, -0.28, 0.11, 0.18); box(0.18, 0.012, 0.18, M.green, -0.28, 0.05, -0.22); } break;
    // ---- Odyssey settlements, by economy
    case "st-agri": ground(); for (const z of [-0.14, 0.04]) { const h = add(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 10, 1, false, 0, Math.PI), M.glass, -0.05, 0.04, z); h.rotation.set(0, 0, Math.PI / 2); box(0.46, 0.03, 0.1, M.leaf, -0.05, 0.06, z); } cyl(0.06, 0.06, 0.32, M.hull, 0.27, 0.2, 0.15, 10); dome(0.06, M.hull, 0.27, 0.36, 0.15); break;
    case "st-mine": ground(); cyl(0.02, 0.06, 0.52, M.dark, -0.18, 0.3, 0, 6); box(0.16, 0.06, 0.06, M.hull, -0.18, 0.52, 0); light(M.amber, -0.18, 0.58, 0); add(new THREE.ConeGeometry(0.14, 0.16, 8), M.rock, 0.2, 0.12, 0.08); { const c = box(0.36, 0.025, 0.05, M.dark, 0.02, 0.2, -0.12); c.rotation.z = -0.4; } break;
    case "st-ind": ground(); box(0.34, 0.2, 0.26, M.hull, -0.12, 0.14, 0); box(0.16, 0.12, 0.16, M.dark, 0.2, 0.1, 0.12); cyl(0.035, 0.045, 0.44, M.dark, 0.18, 0.26, -0.12, 8); light(M.orange, 0.18, 0.5, -0.12); break;
    case "st-mil": ground(); box(0.36, 0.12, 0.24, M.dark, -0.1, 0.1, 0); box(0.7, 0.08, 0.03, M.hull, 0, 0.08, 0.25); cyl(0.02, 0.02, 0.46, M.hull, 0.26, 0.27, -0.12, 6); box(0.1, 0.06, 0.1, M.hull, 0.26, 0.5, -0.12); light(M.red, 0.26, 0.57, -0.12, 0.035); break;
    case "st-bio": ground(); dome(0.16, M.glass, -0.14, 0.04, 0); dome(0.12, M.glass, 0.18, 0.04, 0.06); sph(0.07, M.leaf, -0.14, 0.08, 0, 8); sph(0.05, M.leaf, 0.18, 0.07, 0.06, 8); box(0.12, 0.1, 0.12, M.white, 0.1, 0.09, -0.16); light(M.cyan, 0.1, 0.17, -0.16); break;
    case "st-tour": ground(); box(0.16, 0.56, 0.16, M.white, -0.18, 0.32, 0); for (const y of [0.18, 0.32, 0.46]) box(0.17, 0.02, 0.17, M.pink, -0.18, y, 0); dome(0.15, M.glass, 0.18, 0.04, 0.04); light(M.pink, -0.18, 0.63, 0); break;
  }
  if (v[0] === "h") {                                   // ---- surface hubs: a six-sided base with a centre that tells the kind
    hexBase(); cyl(0.14, 0.18, 0.16, M.hull, 0, 0.15, 0, 6);
    const top = { "h-ext": () => { cyl(0.02, 0.05, 0.42, M.dark, 0, 0.44, 0, 6); light(M.amber, 0, 0.66, 0); },
      "h-civ": () => { dome(0.13, M.hull, 0, 0.23, 0); for (let i = 0; i < 3; i++) { const a = i * 2.094; dome(0.07, M.hull, Math.cos(a) * 0.32, 0.07, Math.sin(a) * 0.32); } },
      "h-exp": () => { const t = cyl(0.04, 0.06, 0.34, M.white, 0, 0.36, 0, 10); t.rotation.z = 0.6; light(M.glow, -0.1, 0.5, 0); },
      "h-out": () => { cyl(0.015, 0.015, 0.5, M.dark, 0, 0.48, 0, 6); light(M.green, 0, 0.74, 0); },
      "h-sci": () => { const d = add(new THREE.SphereGeometry(0.16, 14, 7, 0, Math.PI * 2, 0, Math.PI / 3), M.white, 0, 0.36, 0); d.rotation.x = Math.PI * 0.8; light(M.cyan, 0, 0.46, 0.06, 0.035); },
      "h-mil": () => { box(0.16, 0.08, 0.16, M.dark, 0, 0.27, 0); const g = cyl(0.014, 0.014, 0.22, M.dark, 0.14, 0.28, 0, 6); g.rotation.z = Math.PI / 2; light(M.red, 0, 0.34, 0, 0.03); },
      "h-ref": () => { cyl(0.07, 0.07, 0.3, M.hull, -0.08, 0.38, 0, 10); cyl(0.06, 0.06, 0.22, M.hull, 0.1, 0.34, 0.04, 10); light(M.orange, -0.08, 0.55, 0); },
      "h-ht": () => { const o = add(new THREE.OctahedronGeometry(0.12, 0), M.violet, 0, 0.38, 0); o.scale.y = 1.5; },
      "h-ind": () => { box(0.18, 0.1, 0.14, M.dark, -0.04, 0.28, 0); cyl(0.03, 0.04, 0.32, M.dark, 0.1, 0.38, 0, 8); light(M.orange, 0.1, 0.56, 0); } }[v];
    if (top) top();
  }
  return G;
}
