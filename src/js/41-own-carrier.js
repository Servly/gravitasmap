// ------------------------------------------------------------ v0.90.7 your own carriers, from the Journal
// Spansh only knows where a carrier was last reported, often days ago. The Journal says where yours is now:
// CarrierLocation (at login and when a jump lands, for your fleet carrier and your squadron's), CarrierJumpRequest (the
// planned jump: system, body, departure time), CarrierJumpCancelled, CarrierJump (aboard while it jumps) and CarrierStats
// (its name and callsign). GRAVITAS places these carriers where the Journal says, counts down a planned jump, and shows
// a carrier on its way in the system it is jumping to. Kept only in this browser (to survive a reload), never sent anywhere
// except to your own paired phone or tablet.
const FC = { recs: new Map(), sig: "", applied: "" };
try { for (const r of JSON.parse(localStorage.getItem("gravitas.fc") || "[]")) if (r && r.id) FC.recs.set(+r.id, r); } catch (e) {}
function fcSave() { try { localStorage.setItem("gravitas.fc", JSON.stringify([...FC.recs.values()])); } catch (e) {} }
function fcRec(id, type) {
  id = +id; if (!id) return null;
  let r = FC.recs.get(id); if (!r) { r = { id, type: type || "", t: 0, sys: "", addr: "", body: null, name: "", code: "", jump: null }; FC.recs.set(id, r); }
  if (type) r.type = type; return r;
}
// one Journal line about a carrier (replayed lines come in file order)
function fcEvent(j, replay) {
  const ev = j.event, t = Date.parse(j.timestamp) || Date.now();
  if (ev === "CarrierStats") { const r = fcRec(j.CarrierID, j.CarrierType || "FleetCarrier"); if (!r) return; r.name = String(j.Name || "").slice(0, 60); r.code = String(j.Callsign || "").slice(0, 12); }
  else if (ev === "CarrierLocation") { const r = fcRec(j.CarrierID, j.CarrierType); if (!r || t < r.t) return;
    Object.assign(r, { t, sys: String(j.StarSystem || ""), addr: String(j.SystemAddress ?? ""), body: j.BodyID ?? null });
    if (r.jump && (r.jump.addr === r.addr || t >= r.jump.dep)) r.jump = null; }
  else if (ev === "CarrierJumpRequest") { const r = fcRec(j.CarrierID, j.CarrierType || "FleetCarrier"); if (!r) return;
    r.jump = { t, sys: String(j.SystemName || ""), addr: String(j.SystemAddress ?? ""), body: j.BodyID ?? null, bodyName: String(j.Body || ""), dep: Date.parse(j.DepartureTime) || t + 15 * 60000 }; }
  else if (ev === "CarrierJumpCancelled") { const r = fcRec(j.CarrierID, j.CarrierType); if (r && r.jump && t >= r.jump.t) r.jump = null; }
  else if (ev === "CarrierJump") { if (j.StationType !== "FleetCarrier" && !/carrier/i.test(j.StationType || "")) return;
    const r = fcRec(j.MarketID); if (!r || t < r.t) return;
    Object.assign(r, { t, sys: String(j.StarSystem || ""), addr: String(j.SystemAddress ?? ""), body: j.BodyID ?? null }); if (!r.code) r.code = String(j.StationName || "").slice(0, 12); r.jump = null; }
  else if (ev === "Docked" || ev === "Location") {      // v0.90.8: docked aboard: the game gives its distance from the arrival star
    if (!/carrier/i.test(j.StationType || "") || !j.MarketID || j.DistFromStarLS == null || (ev === "Location" && !j.Docked)) return;
    const r = FC.recs.get(+j.MarketID); if (!r) return;
    Object.assign(r, { dist: +j.DistFromStarLS, distT: t, distAddr: String(j.SystemAddress ?? "") }); }
  else return;
  fcSave(); if (!replay) { fcTick(); try { syncShow(); } catch (e) {} }
}
// where a carrier is at a moment: a planned jump counts as done once its departure time has passed
function fcWhere(r, now = Date.now()) {
  if (r.jump && now >= r.jump.dep) return { sys: r.jump.sys, addr: r.jump.addr, body: r.jump.body, t: r.jump.dep };
  return r.sys ? { sys: r.sys, addr: r.addr, body: r.body, t: r.t } : null;
}
const fcHereIs = w => !!(w && S && ((w.addr && S.sys.id64 != null && String(S.sys.id64) === w.addr) || syncSame(w.sys, S.sys.name)));
const fcSq = r => /squadron/i.test(r.type || "");
const fcTitle = r => r.name || (fcSq(r) ? "Squadron carrier" : "Your fleet carrier");
// the countdown: "in 12 min 30 s"
function fcIn(ms) { const s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
  return s <= 0 ? "now" : h ? `in ${h} h ${m} min` : m ? `in ${m} min ${String(x).padStart(2, "0")} s` : `in ${x} s`; }
const fcCd = dep => `<span class="fccd" data-dep="${dep}">${fcIn(dep - Date.now())}</span>`;
// called by locateCarriers: the Journal's carriers for the system on screen, and the ids it knows to be elsewhere
function fcSig(now = Date.now()) {
  return (S ? S.sys.name : "") + "|" + [...FC.recs.values()].map(r => { const w = fcWhere(r, now); return `${r.id}:${w ? w.addr + "/" + w.sys + "/" + w.body : ""}:${r.jump && now < r.jump.dep ? r.jump.dep : 0}:${r.code}:${r.dist != null ? Math.round(r.dist) + "@" + r.distAddr : ""}`; }).join(",");
}
function fcForSystem() {
  const now = Date.now(), here = [], away = new Set(); FC.applied = fcSig(now);      // what the carriers on screen were placed from
  for (const r of FC.recs.values()) { const w = fcWhere(r, now); if (!w) continue; if (fcHereIs(w)) here.push({ r, w }); else away.add(r.id); }
  return { here, away };
}
function fcStation(r, w) {                            // the Spansh entry for this carrier, or one made from the Journal
  let st = (S.sys.stations || []).find(x => +x.id === r.id);
  if (!st) { S.sys.stations = S.sys.stations || []; st = { id: r.id, name: r.code || "Carrier", carrierName: fcTitle(r), type: fcSq(r) ? "Squadron Carrier" : "Drake-Class Carrier", _fc: true }; S.sys.stations.push(st); }
  if (r.code && !st.name) st.name = r.code; if (r.name && !st.carrierName) st.carrierName = r.name;
  return st;
}
// carriers jumping into the system on screen, not there yet
function fcIncoming() {
  const now = Date.now(), out = [];
  for (const r of FC.recs.values()) if (r.jump && now < r.jump.dep && fcHereIs({ sys: r.jump.sys, addr: r.jump.addr })) out.push(r);
  return out;
}
function fcIncomingRows() {
  const L = fcIncoming(); if (!L.length) return "";
  return `<div class="fcl">${L.map(r => { const b = S.byId && S.byId.get(+r.jump.body), bn = b ? shortName(b, S.sys.name) : r.jump.bodyName;
    return `<div class="fcr mine inc"><span class="fn">⛴ ${esc(fcTitle(r))} <span class="fc2">${esc(r.code)}</span></span><span class="fw">jumping here, to ${esc(bn || "this system")} · arrives ${fcCd(r.jump.dep)} · from your journal</span></div>`; }).join("")}</div>`;
}
// a line for the Sync card: your carriers' planned jumps
function fcCardHTML() {
  const now = Date.now(), L = [...FC.recs.values()].filter(r => r.jump && now < r.jump.dep + 60000);
  return L.map(r => `<div class="sfc">⛴ <b>${esc(r.code || fcTitle(r))}</b> → ${esc(r.jump.sys)} · ${now < r.jump.dep ? `departs ${fcCd(r.jump.dep)}` : "jumping"}</div>`).join("");
}
// the carrier list again, when a carrier moved (a jump landed, a new location came in)
function fcApply() {
  if (!S || typeof locateCarriers !== "function") return;
  for (const c of S.carriers || []) { if (c.obj) S.group.remove(c.obj); if (c.label && c.label.element) c.label.element.remove(); }
  try { locateCarriers(); } catch (e) { S.carriers = []; }
  const per = new Map();                                                // stations in orbit make room for the carriers again
  for (const c of S.carriers || []) if (c.body) per.set(c.body, Math.max(per.get(c.body) || 0, c.idx + 1));
  for (const o of S.orbitals || []) if (o.body) { o.idx = per.get(o.body) || 0; per.set(o.body, o.idx + 1); }
  try { if (typeof renderSystemInfo === "function" && !selected) renderSystemInfo(); } catch (e) {}
  try { if (MAPMODE && SMAP.built === S) smapBuild(true); } catch (e) {}
  try { yahUpdate(); } catch (e) {}
}
// every second: a jump that just departed moves its carrier; the countdowns tick
function fcTick() {
  if (!FC.recs.size) return;
  const now = Date.now();
  if (S && S.carriers && fcSig(now) !== FC.applied) fcApply();
  for (const e of document.querySelectorAll(".fccd[data-dep]")) { const t = fcIn(+e.dataset.dep - now); if (e.textContent !== t) e.textContent = t; }
}
TICK.add(fcTick);
// the first look at the Journal reads back only to the last jump: carrier lines can be earlier in the file
async function fcScanFile(f) {
  try {
    const from = Math.max(0, f.size - 16 * 1024 * 1024), txt = await f.slice(from, f.size).text();
    for (const ln of txt.split("\n")) if (/"event":"(LoadGame|Loadout|GameModeChange|WingJoin|WingAdd|WingLeave|SupercruiseDestinationDrop|Missions|Statistics|Rank|Progress)"/.test(ln)) { try { cbEvent(JSON.parse(ln), true); } catch (e) {} }   // v0.91: the ship, an Operation, the team
    else if (/"event":"Carrier(Location|JumpRequest|JumpCancelled|Stats|Jump)"/.test(ln) || (/"event":"(Docked|Location)"/.test(ln) && /"StationType":"FleetCarrier"/.test(ln))) { try { fcEvent(JSON.parse(ln), true); } catch (e) {} }
    fcTick();
  } catch (e) {}
}
// the target in the game is a carrier: the Status file names it by callsign or name (or both)
function fcNameHit(st, nm) {
  if (!st || !nm || !/carrier/i.test(st.type || "")) return false;
  const N = nm.toUpperCase();
  return syncSame(st.carrierName || "", nm) || (/^[A-Z0-9]{3}-[A-Z0-9]{3}$/i.test(st.name || "") && N.includes(String(st.name).toUpperCase()));
}
