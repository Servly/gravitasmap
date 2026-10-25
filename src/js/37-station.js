// v0.79 the station window. A tap or click on a station, a settlement, a construction site or a fleet carrier (on the
// system map, in 3D, in the System panel or in a body's panel) opens what Spansh knows about it: where it is, its
// landing pads, its services, and its market, outfitting and shipyard as last reported by players' tools (EDDN).
// Everything comes with the system data the page already has: nothing extra is loaded, nothing is sent anywhere.
// When several stations share one mark on the map, the window first lists them.
var STW = { el: null, st: null, list: null, tab: "market", q: "", side: "all", sort: { k: "name", d: 1 }, back: null, tog: new Map(), all: {} };

// what we know about a station besides its own record: its look, its kind in words, where it is
function stnCtx(st) {
  if (!S || !st) return null;
  const o = (S.orbitals || []).find(x => x.st === st);
  if (o) return { st, v: o.v || o.kind, kind: o.kindName, name: o.name, build: o.build, body: o.body,
    where: o.belt ? `in the ${beltName(o.belt.bl)}` : o.body ? (o.alt ? `in orbit near ${shortName(o.body, S.sys.name)} or ${shortName(o.alt, S.sys.name)}: both were at its reported distance` : `in orbit around ${shortName(o.body, S.sys.name)}`) : o.why || "" };
  const c = (S.carriers || []).find(x => x.st === st);
  if (c) return { st, v: "carrier", kind: "Fleet carrier", name: `${c.name} ${c.code !== c.name ? c.code : ""}`.trim(), carrier: true, body: c.body,
    where: c.body ? `parked near ${shortName(c.body, S.sys.name)}${c.alt ? ` or ${shortName(c.alt, S.sys.name)}` : ""}` : c.why || "" };
  for (const b of S.bodies) if ((b.stations || []).includes(st)) {
    const k = surfKind(st), v = surfVariant(st, k.k);
    return { st, v: v || k.k, kind: stnKindName(st, k.n, v), name: stnName(st) || "Unnamed", build: k.k === "sbuild", body: b,
      where: `on the surface of ${shortName(b, S.sys.name)}${st.latitude != null && st.longitude != null ? ` at ${fmt(st.latitude, 2)}°, ${fmt(st.longitude, 2)}°` : ""}` };
  }
  return { st, v: "outpost", kind: st.type || "Station", name: stnName(st) || st.name || "Unnamed", where: "" };
}
const stwAgo = t => { const ms = Date.parse(t || ""); if (!ms) return "time unknown"; const h = (Date.now() - ms) / 3600e3;
  return h < 1 ? "under an hour ago" : h < 48 ? `${Math.round(h)} h ago` : h < 24 * 60 ? `${Math.round(h / 24)} days ago` : `${Math.round(h / 24 / 30)} months ago`; };
const stwOld = t => { const ms = Date.parse(t || ""); return ms && Date.now() - ms > 30 * 864e5; };   // a month or more: may be out of date
const cr = v => `${fmt(v, 0)} cr`;
// the services worth seeing first, in the game's words, and the rest after them
const STW_KEY = ["Refuel", "Repair", "Restock", "Market", "Black Market", "Outfitting", "Shipyard", "Universal Cartographics", "Interstellar Factors Contact",
  "Material Trader", "Technology Broker", "Search and Rescue", "Vista Genomics", "Pioneer Supplies", "Frontline Solutions", "Apex Interstellar", "Bartender", "Crew Lounge", "Redemption Office"];
const STW_SKIP = /^(Dock|Autodock|Contacts|Missions|Missions Generated|Station Operations|Station Menu|Flight Controller|Workshop|Social Space|On Dock Mission|Engineer|Powerplay|Tuning|Livery|Shop|Facilitator|Fleet Carrier (Management|Administration)|Carrier ?Fuel|Fleet Carrier Fuel|Fleet Carrier Vendor|Registration Services|Squadron Bank)$/i;

function stnOpen(st, keepBack) { if (!keepBack) STW.back = null; STW.list = null; STW.sort = { k: "name", d: 1 }; STW.st = st; STW.q = ""; STW.side = "all"; stwInit(); stwRender(true); stwShow(); }
// several stations behind one mark: a short list first
function stnPick(list) { if (list.length === 1) return stnOpen(list[0]); STW.back = null; STW.list = list; STW.st = null; stwInit(); stwRender(true); stwShow(); }
function stnClose() { if (!STW.el) return; STW.el.style.display = "none"; STW.st = null; STW.list = null; document.body.classList.remove("stnopen"); if (PFULL && document.body.dataset.sheet === "stn") setSheet(""); stwMark(); stwRoom(); }
// v0.79.8: like the Body window, the station window has its own room: the map and the 3D filters move aside for it
function stwRoom() { try { if (MAPMODE) requestAnimationFrame(() => smapLayout()); else ofiltLayout(); } catch (e) {} }
// …and its station is marked: its box on the map, its name in 3D
function stwMark() {
  const st = STW.st, list = STW.list;
  const has = all => !!all && all.some(p => p.st === st || (list && list.includes(p.st)));
  (SMAP.pels || []).forEach((e, i) => { const q = SMAP.ports[i]; e.classList.toggle("stsel", !!(q && (st || list) && has(q.p.all))); });
  (SMAP.sels || []).forEach((e, i) => { const q = SMAP.surf && SMAP.surf[i]; e.classList.toggle("stsel", !!(q && (st || list) && has(q.all))); });
  if (S) for (const o of [...(S.orbitals || []), ...(S.carriers || [])]) if (o.label && o.label.element) o.label.element.classList.toggle("sel", !!st && o.st === st);
}
const stwIsOpen = () => !!(STW.el && STW.el.style.display === "block");
function stwShow() {
  STW.el.style.display = "block"; STW.el.classList.remove("collapsed"); document.body.classList.add("stnopen");   // the Body window steps aside while it is open
  stwMark(); stwRoom();
  if (PFULL) setSheet("stn");
  try { Sound.click(); } catch (e) {}
}
function stwInit() {
  if (STW.el) return;
  const el = STW.el = document.createElement("div"); el.id = "stw"; el.className = "panel"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Station");
  // v0.79.7: the same frame as the Body window: its title bar with Collapse and Close, in the same place
  el.innerHTML = `<div class="ph"><span class="ttl">Station</span><span><button class="coll stmin" title="Collapse" aria-label="Collapse">–</button> <button class="coll stx" title="Close" aria-label="Close">×</button></span></div><div class="pb"></div>`;
  document.body.appendChild(el);
  el.addEventListener("click", e => {
    const t = e.target;
    if (t.closest(".stx")) { stnClose(); return; }
    if (t.closest(".stmin")) { el.classList.toggle("collapsed"); stwRoom(); return; }
    if (t.closest(".stback")) { const l = STW.back; STW.back = null; if (l) stnPick(l); return; }
    const pick = t.closest("[data-pick]"); if (pick && STW.list) { const l = STW.list; STW.back = l; stnOpen(l[+pick.dataset.pick], true); return; }
    const ea = t.closest("[data-all]"); if (ea) { const k = ea.dataset.all; STW.all[k] = !STW.all[k]; for (const g of [...STW.tog.keys()]) if (g[0] === k) STW.tog.delete(g); stwRender(false); return; }
    const gh = t.closest("[data-grp]"); if (gh) { const k = gh.dataset.grp; STW.tog.set(k, gh.getAttribute("aria-expanded") !== "true"); stwRender(false); return; }
    const tb = t.closest("[data-tab]"); if (tb) { STW.tab = tb.dataset.tab; stwRender(false); return; }
    const sd = t.closest("[data-side]"); if (sd) { STW.side = sd.dataset.side; stwRender(false); return; }
    const so = t.closest("[data-sort]"); if (so) { const k = so.dataset.sort; STW.sort = { k, d: STW.sort.k === k ? -STW.sort.d : (k === "name" ? 1 : -1) }; stwRender(false); return; }
    const go = t.closest("[data-go]"); if (go) { const st = stwAll()[+go.dataset.go]; if (st) stnOpen(st); return; }
    const bd = t.closest(".stbody"); if (bd) { const c = stnCtx(STW.st); if (c && c.body && c.body._obj) { stnClose(); select(c.body, !MAPMODE); } return; }
  });
  el.addEventListener("input", e => { if (e.target.matches(".stq")) { STW.q = e.target.value; stwRender(false, true); } });
  addEventListener("keydown", e => { if (e.key === "Escape" && STW.el && STW.el.style.display === "block" && !PFULL) stnClose(); });
}
// every station of the system that has a market, for "elsewhere in this system"
function stwAll() { return S ? [...(S.sys.stations || []), ...S.bodies.flatMap(b => b.stations || [])] : []; }

function stwRender(top, keepFocus) {
  const el = STW.el; if (!el) return;
  let h = "";
  const pb = el.querySelector(".pb");
  if (STW.list) {
    h += `<div class="sth"><div class="stt"><b>${STW.list.length} stations here</b><span>Pick one</span></div></div><div class="stpick">${STW.list.map((st, i) => { const c = stnCtx(st);
      return `<button data-pick="${i}"><span class="sti">${stnGlyph(c.v, 16)}</span><span><b>${esc(c.name)}</b><i>${esc(c.kind)}</i></span><em>${stwPads(st, true)}</em></button>`; }).join("")}</div>`;
    pb.innerHTML = h; if (top) el.scrollTop = 0; return;
  }
  const st = STW.st, c = stnCtx(st); if (!c) return;
  const m = st.market, o = st.outfitting, y = st.shipyard;
  const mk = m && m.commodities ? m.commodities : [], mods = o && o.modules ? o.modules : [], ships = y && y.ships ? y.ships : [];
  const tabs = [["market", "Market", mk.length], ["outfit", "Outfitting", mods.length], ["ships", "Shipyard", ships.length]].filter(t => t[2]);
  if (tabs.length && !tabs.some(t => t[0] === STW.tab)) STW.tab = tabs[0][0];
  // Spansh gives each economy a weight, not a share: shown as a share of the whole
  const ee = st.economies ? Object.entries(st.economies).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]) : [], et = ee.reduce((a, e) => a + e[1], 0) || 1;
  const econ = ee.length ? ee.map(([k, v]) => `${k}${ee.length > 1 ? ` ${fmt(v / et * 100, 0)}%` : ""}`).join(" · ") : st.primaryEconomy || "";
  const sv = (st.services || []).filter(s => !STW_SKIP.test(s)), key = STW_KEY.filter(k => sv.includes(k)), rest = sv.filter(s => !STW_KEY.includes(s));
  h += `${STW.back ? `<button class="stback">‹ ${STW.back.length} stations here</button>` : ""}
    <div class="sth"><span class="sti big${c.build ? " build" : c.carrier ? " fc" : ""}">${stnGlyph(c.v, 26)}</span><div class="stt"><b>${esc(c.name)}</b><span>${esc(c.kind)}</span></div></div>
    <div class="stwhere">${c.body && c.body._obj ? `<button class="stbody" title="Show this body">${esc(c.where)}</button>` : esc(c.where)}${st.distanceToArrival ? ` · ${fmt(st.distanceToArrival, 0)} ls from the arrival star` : ""}</div>
    <div class="stpads">${stwPads(st)}</div>
    <dl class="stfacts">${econ ? `<dt>Economy</dt><dd>${esc(econ)}</dd>` : ""}${st.government ? `<dt>Government</dt><dd>${esc(st.government)}</dd>` : ""}${st.allegiance ? `<dt>Allegiance</dt><dd>${esc(st.allegiance)}</dd>` : ""}
      ${st.controllingFaction && st.controllingFaction !== "FleetCarrier" ? `<dt>Faction</dt><dd>${esc(st.controllingFaction)}${st.controllingFactionState && st.controllingFactionState !== "None" ? ` <i>${esc(st.controllingFactionState)}</i>` : ""}</dd>` : ""}
      ${st.carrierDockingAccess ? `<dt>Docking</dt><dd>${esc(st.carrierDockingAccess)}</dd>` : ""}<dt>Reported</dt><dd>${esc(stwAgo(st.updateTime))}</dd></dl>
    ${key.length || rest.length ? `<div class="stsv">${key.map(s => `<span class="on">${esc(s.replace(" Contact", ""))}</span>`).join("")}${rest.map(s => `<span>${esc(s)}</span>`).join("")}</div>` : ""}
    ${c.body && st.latitude != null && typeof dnBlock === "function" ? `<div class="stdn" data-st="${esc(c.name)}" data-b="${c.body.bodyId}">${dnBlock(c.body, st)}</div>` : ""}`;
  if (!tabs.length) h += `<p class="stnone">${c.build ? "A construction site: what it still needs is not in Spansh's data for this one." : "No market, outfitting or shipyard has been reported for this station yet."}</p>`;
  else {
    h += `<div class="sttabs" role="tablist">${tabs.map(t => `<button role="tab" data-tab="${t[0]}" aria-selected="${STW.tab === t[0]}"${STW.tab === t[0] ? ' class="on"' : ""}>${t[1]} <i>${t[2]}</i></button>`).join("")}</div>`;
    const ak = STW.tab === "market" ? "m" : STW.tab === "outfit" ? "o" : "s", grouped = !(STW.tab === "market" && STW.sort.k !== "name");
    h += `<div class="stqr"><input class="stq" type="search" placeholder="${STW.tab === "market" ? "Find a commodity" : STW.tab === "outfit" ? "Find a module" : "Find a ship"}" value="${esc(STW.q)}" aria-label="Search" autocomplete="off">${grouped ? `<button class="stall" data-all="${ak}">${STW.all[ak] ? "Collapse all" : "Expand all"}</button>` : ""}</div>`;
    h += `<div class="stbody2">${STW.tab === "market" ? stwMarket(st, mk, c) : STW.tab === "outfit" ? stwOutfit(mods) : stwShips(ships)}</div>`;
    const ut = STW.tab === "market" ? m && m.updateTime : STW.tab === "outfit" ? o && o.updateTime : y && y.updateTime;
    if (ut) h += `<div class="stage${stwOld(ut) ? " old" : ""}">${STW.tab === "market" ? "Prices" : "This list"} reported ${esc(stwAgo(ut))}${stwOld(ut) ? ": it may have changed since" : ""}. From Spansh (players' tools, EDDN).</div>`;
  }
  const f = keepFocus && document.activeElement && document.activeElement.matches(".stq") ? document.activeElement.selectionStart : null;
  pb.innerHTML = h;
  if (f != null) { const i = el.querySelector(".stq"); if (i) { i.focus(); try { i.setSelectionRange(f, f); } catch (e) {} } }
  if (top) el.scrollTop = 0;
}
// three pad squares, the largest one first: what can dock here
function stwPads(st, mini) {
  const p = st.landingPads; if (!p) return mini ? "" : `<span class="pdn">Landing pads not reported</span>`;
  const one = (k, L) => `<span class="pd pd${L}${p[k] ? "" : " no"}" title="${p[k] || 0} ${k} pad${p[k] === 1 ? "" : "s"}"><b>${L}</b>${mini ? "" : `<i>${p[k] || 0}</i>`}</span>`;
  return one("large", "L") + one("medium", "M") + one("small", "S") + (mini ? "" : `<span class="pdn">${p.large ? "Large ships can dock" : p.medium ? "Medium ships at most" : p.small ? "Small ships only" : "No landing pads"}</span>`);
}
// v0.79.1: groups that open and close (market categories, kinds of module, ship makers). Open by default while a list is
// short; a long one starts closed. A search opens every group that has a match. What the visitor opened or closed is kept
// v0.79.4: every group starts closed (CMDR Hongark); Expand all / Collapse all opens or closes a whole tab at once
function stwOpen(key) { const t = STW.tog.get(key); return STW.q.trim() ? true : t != null ? t : !!STW.all[key[0]]; }
const stwHead = (key, open, label, count, extra = "") => `<button class="stgh${open ? " on" : ""}" data-grp="${esc(key)}" aria-expanded="${open}"><i class="car">▸</i>${esc(label)} <em>${count}</em>${extra}</button>`;
function stwMarket(st, mk, c) {
  const q = STW.q.trim().toLowerCase(), hit = r => !q || r.name.toLowerCase().includes(q) || (r.category || "").toLowerCase().includes(q);
  const sells = r => r.supply > 0 && r.buyPrice > 0, buys = r => r.demand > 0 && r.sellPrice > 0;
  let rows = mk.filter(hit).filter(r => STW.side === "sell" ? sells(r) : STW.side === "buy" ? buys(r) : sells(r) || buys(r) || q);
  const s = STW.sort, val = r => s.k === "name" ? r.name : s.k === "buy" ? (sells(r) ? r.buyPrice : -1) : s.k === "sell" ? (buys(r) ? r.sellPrice : -1) : s.k === "sup" ? r.supply || 0 : r.demand || 0;
  rows.sort((a, b) => { const x = val(a), y = val(b); return (typeof x === "string" ? x.localeCompare(y) : x - y) * s.d; });
  const nS = mk.filter(sells).length, nB = mk.filter(buys).length, ar = k => s.k === k ? (s.d > 0 ? " ▲" : " ▼") : "";
  const flat = s.k !== "name";                                         // sorted by a number: one list across the categories
  let h = `<div class="stside">${[["all", "All"], ["sell", `It sells ${nS}`], ["buy", `It buys ${nB}`]].map(([k, t]) => `<button data-side="${k}"${STW.side === k ? ' class="on"' : ""}>${t}</button>`).join("")}</div>`;
  if (c.build && mk.some(buys)) h += `<p class="stnote">A construction site buys what it still needs: the "Wanted" numbers are what is left to deliver, as last reported.</p>`;
  if (flat && rows.length) h += `<p class="stnote">Sorted across all categories. Sort by Commodity to see them by category again.</p>`;
  const row = r => `<tr><td><b>${esc(r.name)}</b>${flat ? `<i>${esc(r.category || "")}</i>` : ""}</td><td>${sells(r) ? fmt(r.buyPrice, 0) : "—"}</td><td>${sells(r) ? fmt(r.supply, 0) : ""}</td><td>${buys(r) ? fmt(r.sellPrice, 0) : "—"}</td><td>${buys(r) ? fmt(r.demand, 0) : ""}</td></tr>`;
  h += `<table class="stm"><colgroup><col class="c0"><col><col><col><col></colgroup><thead><tr><th data-sort="name">Commodity${ar("name")}</th><th data-sort="buy" title="What you pay here">Buy${ar("buy")}</th><th data-sort="sup">Stock${ar("sup")}</th><th data-sort="sell" title="What you get here">Sell${ar("sell")}</th><th data-sort="dem">${c.build ? "Wanted" : "Demand"}${ar("dem")}</th></tr></thead><tbody>`;
  if (flat) h += rows.map(row).join("");
  else {
    const g = new Map(); for (const r of rows) { const k = r.category || "Other"; if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
    h += [...g].sort((a, b) => a[0].localeCompare(b[0])).map(([k, l]) => { const key = "m:" + k, op = stwOpen(key, rows.length);
      return `<tr class="stgr"><td colspan="5">${stwHead(key, op, k, l.length)}</td></tr>${op ? l.map(row).join("") : ""}`; }).join("");
  }
  if (!rows.length) h += `<tr><td colspan="5" class="stempty">${q ? "Nothing here matches." : "Nothing to show."}</td></tr>`;
  h += `</tbody></table>`;
  // v0.79: the same commodity elsewhere in this system: where it is cheapest to buy and where it pays most to sell
  if (q.length >= 3) {
    const all = stwAll(), best = (want, better) => { let b = null; all.forEach((x, i) => { if (x === st || !x.market || !x.market.commodities) return;
      for (const r of x.market.commodities) if (r.name.toLowerCase().includes(q) && want(r) && (!b || better(r, b.r))) b = { r, i, x }; }); return b; };
    const bb = best(sells, (a, b) => a.buyPrice < b.buyPrice), bs = best(buys, (a, b) => a.sellPrice > b.sellPrice);
    if (bb || bs) h += `<div class="stelse"><b>Elsewhere in this system</b>${bb ? `<button data-go="${bb.i}">Buy ${esc(bb.r.name)} for ${cr(bb.r.buyPrice)} at <u>${esc(stnName(bb.x) || bb.x.name)}</u> <i>${fmt(bb.r.supply, 0)} in stock</i></button>` : ""}${bs ? `<button data-go="${bs.i}">Sell ${esc(bs.r.name)} for ${cr(bs.r.sellPrice)} at <u>${esc(stnName(bs.x) || bs.x.name)}</u></button>` : ""}</div>`;
  }
  const pro = st.market && st.market.prohibitedCommodities || [];
  if (pro.length) h += `<div class="stpro"><b>Illegal here</b> ${pro.map(esc).join(" · ")}</div>`;
  return h;
}
// outfitting: the game's four kinds, then each module once, with its sizes and grades as small chips.
// Weapons and utility modules come fixed, gimballed or as a turret: Spansh says which only in the module's code name
const OUT_CAT = [["hardpoint", "Hardpoints"], ["utility", "Utility mounts"], ["standard", "Core internals"], ["internal", "Optional internals"]];
const outMount = m => { const y = m.symbol || ""; return /_Fixed_/i.test(y) ? "Fixed" : /_Gimbal/i.test(y) ? "Gimballed" : /_Turret/i.test(y) ? "Turret" : ""; };
// v0.79.1: a module's sizes and grades, one chip per size: "8 ABCDE" (the same size and grade twice is shown once)
// v0.79.5: what sizes and grades are sold, said plainly. One size and grade: a chip "3E" (v0.79.6: only then).
// Otherwise one line, "Sizes 2–8 · grades A–E · all", and a tap opens a small table: a dot for each size and grade sold
const rng = l => { const n = [...l]; if (n.length > 1 && n.every((x, i) => !i || Math.abs(x.charCodeAt ? x.charCodeAt(0) - n[i - 1].charCodeAt(0) : x - n[i - 1]) === 1)) return `${n[0]}–${n[n.length - 1]}`; return n.join(n.every(x => typeof x === "number") ? ", " : " "); };
function stwSizes(v, key) {
  const m = new Map(); for (const x of v) { const c = x.class != null ? +x.class : 0; if (!m.has(c)) m.set(c, new Set()); if (x.rating) m.get(c).add(String(x.rating)); }
  const sizes = [...m.keys()].sort((a, b) => b - a), grades = [...new Set(v.map(x => String(x.rating || "")).filter(Boolean))].sort();
  if (sizes.length === 1 && m.get(sizes[0]).size <= 1)                  // v0.79.6: a single size and grade: just that
    return `<span class="stcl">${sizes.map(c => `<em title="Size ${c}${m.get(c).size ? `, grade ${[...m.get(c)][0]}` : ""}"><b>${c}</b>${esc([...m.get(c)].join(""))}</em>`).join("")}</span>`;
  const all = sizes.every(c => m.get(c).size === grades.length), op = stwOpen(key);
  const sum = `Size${sizes.length > 1 ? "s" : ""} ${rng([...sizes].reverse())} · grade${grades.length > 1 ? "s" : ""} ${rng(grades)}${grades.length > 1 ? ` · <i>${all ? "every grade" : "not every grade"}</i>` : ""}`;
  return `<button class="stsum${op ? " on" : ""}" data-grp="${esc(key)}" aria-expanded="${op}" title="Show which size and grade">${sum}<b class="car">▸</b></button>` + (op ? `<div class="stgw"><table class="stgrid"><thead><tr><th>Size</th>${grades.map(g => `<th>${esc(g)}</th>`).join("")}</tr></thead><tbody>${sizes.map(c =>
    `<tr><th>${c}</th>${grades.map(g => `<td>${m.get(c).has(g) ? "●" : "·"}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : "");
}
// v0.79.3: a second level, close to the game's own outfitting menu: kinds of weapon, of defence, of drive and so on.
// Each rule is [subgroup, test on the module's name]; the first that matches wins, the rest go to "Other modules"
const OUT_SUB = {
  hardpoint: [["Guardian weapons", /^Guardian/i], ["Anti-xeno weapons", /^AX |Enzyme|Xeno/i],
    ["Mining tools", /Mining|Abrasion|Sub-?surface|Seismic|Displacement/i], ["Lasers", /Laser/i], ["Cannons", /Cannon/i],
    ["Missiles and torpedoes", /Missile|Torpedo|Dumbfire|Seeker|Pack-?Hound|Rocket/i], ["Mines", /Mine Launcher/i],
    ["Plasma and rail", /Plasma|Rail ?Gun/i], ["Other weapons", /./]],
  utility: [["Shield boosters", /Shield Booster/i], ["Countermeasures", /Chaff|Heat Sink|Point Defen|Electronic Counter|ECM|Caustic|Neutrali/i],
    ["Scanners", /Scanner|Pulse Wave|Analy[sz]er/i], ["Other utility", /./]],
  standard: [["Armour", /Alloy|Composite|Armour/i], ["Frame shift drives", /Frame Shift Drive/i], ["Thrusters", /Thrusters/i], ["Power plants", /Power Plant/i],
    ["Power distributors", /Power Distributor/i], ["Life support", /Life Support/i], ["Sensors", /Sensors/i], ["Fuel tanks", /Fuel Tank/i], ["Other core", /./]],
  internal: [["Shields", /Shield Generator|Shield Cell|Bi-?Weave|Prismatic/i], ["Hull and module protection", /Reinforcement|Hull Reinforcement|Module Reinforcement|Meta Alloy/i],
    ["Limpet controllers", /Limpet/i], ["Cargo, fuel and refinery", /Cargo Rack|Fuel Scoop|Fuel Tank|Refinery|Corrosion/i],
    ["Hangars and cabins", /Hangar|Passenger|Cabin/i], ["Docking and flight", /Docking Computer|Supercruise Assist|Approach Suite/i],
    ["Exploration", /Surface Scanner|Scanner|Detailed/i], ["Repair", /Field-?Maintenance/i], ["Frame shift add-ons", /Interdictor|FSD Booster|Frame Shift/i],
    ["Other optional", /./]],
};
// armour comes per ship: the ship is in the code name ("Anaconda_Armour_Grade1")
const outShip = m => { const x = /^(.+?)_Armour_/i.exec(m.symbol || ""); if (!x) return ""; const i = SHIP_INFO({ name: x[1].replace(/_/g, " "), symbol: x[1] }); return i ? i.nm : x[1].replace(/_/g, " "); };
const outGrade = n => String(n || "").replace(/^Mk II Ablative /i, "Mk II ").replace(/ (Alloys?|Composite)$/i, "");
function stwOutfit(mods) {
  const q = STW.q.trim().toLowerCase();
  const rows = mods.filter(m => !q || (m.name || "").toLowerCase().includes(q) || (m.category || "").toLowerCase().includes(q) || outMount(m).toLowerCase().includes(q) || outShip(m).toLowerCase().includes(q));
  if (!rows.length) return `<p class="stempty">${q ? "No module here matches." : "No modules reported."}</p>`;
  const legend = `<p class="stnote stlg">Size: 1 is the smallest, 8 the largest. Grade: A is the best, E the most basic (weapons use their own letters).</p>`;
  const cats = [...OUT_CAT, ...[...new Set(rows.map(m => m.category))].filter(k => !OUT_CAT.some(c => c[0] === k)).map(k => [k, (k || "Other").replace(/^./, c => c.toUpperCase())])];
  return legend + cats.map(([ck, cl]) => {
    const l = rows.filter(m => m.category === ck); if (!l.length) return "";
    const key = "o:" + ck, op = stwOpen(key, rows.length);
    let body = "";
    if (op) {
      const rules = OUT_SUB[ck] || [["", /./]], sub = new Map(rules.map(r => [r[0], []]));
      for (const m of l) { const r = rules.find(r => r[1].test(m.name || m.symbol || "")) || rules[rules.length - 1]; sub.get(r[0]).push(m); }
      const one = sub.size === 1 || [...sub.values()].filter(v => v.length).length === 1;
      const SHOW = ["Lasers", "Cannons", "Missiles and torpedoes", "Mines", "Plasma and rail", "Mining tools", "Guardian weapons", "Anti-xeno weapons"];   // matching order is not showing order
      const pos = n => { const i = SHOW.indexOf(n); return i < 0 ? 100 + rules.findIndex(r => r[0] === n) : i; };
      body = [...sub].filter(([, v]) => v.length).sort((a, b) => pos(a[0]) - pos(b[0])).map(([sn, v]) => {
        const inner = sn === "Armour" ? stwArmour(v) : stwMods(v, ck === "hardpoint");
        if (one) return inner;
        const sk = key + ":" + sn, so = stwOpen(sk, v.length <= 30 ? 0 : 99);
        return `<div class="stsub">${stwHead(sk, so, sn, v.length)}${so ? inner : ""}</div>`;
      }).join("");
    }
    return `<div class="stgrp">${stwHead(key, op, cl, l.length)}${op ? `<div class="stgl">${body}</div>` : ""}</div>`;
  }).join("");
}
// modules of one kind: each once; weapons and utility mounts with one line per mount (fixed, gimballed, turret)
function stwMods(v, mounts) {
  const g = new Map(); for (const m of v) { const k = m.name || m.symbol || ""; if (!g.has(k)) g.set(k, []); g.get(k).push(m); }
  return [...g].sort((a, b) => a[0].localeCompare(b[0])).map(([k, l]) => {
    const ms = mounts ? [...new Set(l.map(outMount))].filter(Boolean) : [], key = "x:" + (l[0].category || "") + ":" + k;
    return `<div class="stmod"><span class="stn">${esc(k)}</span>${ms.length ? stwMountGrid(l, key) : stwSizes(l, key)}</div>`;
  }).join("");
}
// v0.79.6: a weapon in one table: its sizes down the side, fixed, gimballed and turret across, the grade in each cell
function stwMountGrid(l, key) {
  const order = ["Fixed", "Gimballed", "Turret", ""], cols = order.filter(o => l.some(m => outMount(m) === o));
  const sizes = [...new Set(l.map(m => +m.class || 0))].sort((a, b) => b - a);
  const cell = (c, o) => [...new Set(l.filter(m => (+m.class || 0) === c && outMount(m) === o).map(m => String(m.rating || "")))].sort().join("");
  if (sizes.length === 1 && cols.length === 1) { const r = cell(sizes[0], cols[0]); return `<span class="stcl"><em title="${cols[0] || "Size"} ${sizes[0]}${r ? `, grade ${r}` : ""}"><b>${sizes[0]}</b>${esc(r)}</em>${cols[0] ? `<i class="stmo">${cols[0]}</i>` : ""}</span>`; }
  const op = stwOpen(key), sum = `Size${sizes.length > 1 ? "s" : ""} ${rng([...sizes].reverse())} · ${cols.map(o => o || "other").join(", ").toLowerCase()}`;
  return `<button class="stsum${op ? " on" : ""}" data-grp="${esc(key)}" aria-expanded="${op}">${sum}<b class="car">▸</b></button>` + (op ? `<div class="stgw"><table class="stgrid stgm"><thead><tr><th>Size</th>${cols.map(o => `<th>${o || "Other"}</th>`).join("")}</tr></thead><tbody>${sizes.map(c =>
    `<tr><th>${c}</th>${cols.map(o => { const r = cell(c, o); return `<td class="${r ? "g" : ""}">${r ? esc(r) : "·"}</td>`; }).join("")}</tr>`).join("")}</tbody></table><p class="stgn">The letter is the grade sold in that size and mount.</p></div>` : "");
}
// armour: one row per ship, its armour grades as chips
// v0.79.6: armour in one table: ships down the side, the five kinds across. ● the usual armour, ◆ the Mk II ablative kind
const ARM = [["Lightweight", "Light"], ["Reinforced", "Reinf."], ["Military Grade", "Military"], ["Mirrored Surface", "Mirrored"], ["Reactive Surface", "Reactive"]];
function stwArmour(v) {
  const g = new Map();
  for (const m of v) { const k = outShip(m) || "Any ship", n = String(m.name || ""), mk2 = /^Mk II/i.test(n), t = ARM.findIndex(a => n.replace(/^Mk II Ablative /i, "").startsWith(a[0].split(" ")[0]));
    if (!g.has(k)) g.set(k, ARM.map(() => ({ a: false, b: false }))); if (t >= 0) g.get(k)[t][mk2 ? "b" : "a"] = true; }
  const any2 = [...g.values()].some(r => r.some(c => c.b));
  return `<div class="stgw"><table class="stgrid starm"><thead><tr><th>Ship</th>${ARM.map(a => `<th title="${a[0]}">${a[1]}</th>`).join("")}</tr></thead><tbody>${[...g].sort((a, b) => a[0].localeCompare(b[0])).map(([k, r]) =>
    `<tr><th>${esc(k)}</th>${r.map(c => `<td class="${c.a || c.b ? "g" : ""}">${c.a ? "●" : ""}${c.b ? "◆" : ""}${c.a || c.b ? "" : "·"}</td>`).join("")}</tr>`).join("")}</tbody></table>
    <p class="stgn">● the ship's usual armour of that kind${any2 ? " · ◆ the Mk II ablative version" : ""}.</p></div>`;
}
// shipyard: by maker, each ship with the landing pad it needs. Spansh gives only the name, so maker and pad come from
// this table (the game's own; the 2025-26 ships checked on elitedangerous.com). The Type-11 Prospector's pad is not stated
// there, so it shows "?". A ship not in the table at all (a newer one) is listed last, without a maker or a pad
const SHIP_INFO = (() => {
  const T = {
    "Faulcon DeLacy": [["Sidewinder", "S"], ["Viper Mk III", "S"], ["Viper Mk IV", "S"], ["Cobra Mk III", "S"], ["Cobra Mk IV", "S"], ["Cobra Mk V", "S"], ["Krait Mk II", "M"], ["Krait Phantom", "M"], ["Python", "M"], ["Python Mk II", "M"], ["Anaconda", "L"]],
    "Lakon Spaceways": [["Diamondback Scout", "S"], ["Diamondback Explorer", "S"], ["Asp Scout", "M"], ["Asp Explorer", "M"], ["Keelback", "M"], ["Type-6 Transporter", "M"], ["Type-8 Transporter", "M"], ["Type-7 Transporter", "L"],
      ["Type-9 Heavy", "L"], ["Type-10 Defender", "L"], ["Alliance Chieftain", "M"], ["Alliance Challenger", "M"], ["Alliance Crusader", "M"], ["Type-11 Prospector", ""]],
    "Core Dynamics": [["Eagle", "S"], ["Vulture", "S"], ["Kestrel Mk II", "S"], ["Federal Dropship", "M"], ["Federal Assault Ship", "M"], ["Federal Gunship", "M"], ["Federal Corvette", "L"]],
    "Gutamaya": [["Imperial Eagle", "S"], ["Imperial Courier", "S"], ["Corsair", "M"], ["Imperial Clipper", "L"], ["Imperial Cutter", "L"]],
    "Zorgon Peterson": [["Hauler", "S"], ["Adder", "S"], ["Fer-de-Lance", "M"], ["Mamba", "M"], ["Mandalay", "M"], ["Lynx Highliner", "M"], ["Caspian Explorer", "L"], ["Panther Clipper Mk II", "L"]],
    "Saud Kruger": [["Dolphin", "S"], ["Orca", "L"], ["Beluga Liner", "L"]],
  };
  const m = new Map(), n = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [mk, l] of Object.entries(T)) for (const [nm, pad] of l) m.set(n(nm), { mk, pad, nm });
  // the names some tools use instead
  for (const [a, b] of [["Viper", "Viper Mk III"], ["Cobra", "Cobra Mk III"], ["Asp", "Asp Explorer"], ["Type-9 Heavy Transporter", "Type-9 Heavy"], ["Beluga", "Beluga Liner"], ["Federal Corvette", "Federal Corvette"],
    ["Diamondback", "Diamondback Scout"], ["Empire Eagle", "Imperial Eagle"], ["Empire Courier", "Imperial Courier"], ["Empire Trader", "Imperial Clipper"], ["Cutter", "Imperial Cutter"], ["Federation Corvette", "Federal Corvette"],
    ["Independant Trader", "Keelback"], ["Type6", "Type-6 Transporter"], ["Type7", "Type-7 Transporter"], ["Type8", "Type-8 Transporter"], ["Type9", "Type-9 Heavy"], ["Type9 Military", "Type-10 Defender"],
    ["Ferdelance", "Fer-de-Lance"], ["SmallCombat01 NX", "Kestrel Mk II"], ["MediumTransport01", "Lynx Highliner"], ["Explorer NX", "Caspian Explorer"], ["DiamondbackXL", "Diamondback Explorer"], ["Federation Dropship", "Federal Dropship"], ["Federation Dropship MkII", "Federal Assault Ship"], ["Federation Gunship", "Federal Gunship"], ["TypeX", "Alliance Chieftain"], ["TypeX 2", "Alliance Crusader"], ["TypeX 3", "Alliance Challenger"], ["Krait MkII", "Krait Mk II"], ["Krait Light", "Krait Phantom"], ["Python NX", "Python Mk II"], ["Panther Clipper", "Panther Clipper Mk II"]]) {
    const t = m.get(n(b)); if (t && !m.has(n(a))) m.set(n(a), t);
  }
  return s => m.get(n(s.name)) || m.get(n(s.symbol)) || null;
})();
function stwShips(ships) {
  const q = STW.q.trim().toLowerCase(), l = ships.filter(s => !q || (s.name || "").toLowerCase().includes(q));
  if (!l.length) return `<p class="stempty">${q ? "No ship here matches." : "No ships reported."}</p>`;
  const g = new Map(); for (const s of l) { const i = SHIP_INFO(s), k = i ? i.mk : "\u0000"; if (!g.has(k)) g.set(k, []); g.get(k).push({ s, i }); }
  const ord = { S: 0, M: 1, L: 2 }, n = [...g].sort((a, b) => (a[0] === "\u0000") - (b[0] === "\u0000") || a[0].localeCompare(b[0]));
  const pad = i => i && i.pad;
  const item = ({ s, i }) => `<div class="stship"><span class="pd pd${pad(i) || "x"}${pad(i) ? "" : " no"}" title="${pad(i) ? `A ${{ S: "small", M: "medium", L: "large" }[i.pad]} ship` : "Size not known to GRAVITAS"}"><b>${pad(i) || "?"}</b></span><span>${esc(s.name || s.symbol || "")}</span></div>`;
  const srt = v => v.sort((a, b) => (pad(a.i) ? ord[a.i.pad] : 9) - (pad(b.i) ? ord[b.i.pad] : 9) || (a.s.name || "").localeCompare(b.s.name || ""));
  return n.map(([mk, v]) => { if (mk === "\u0000") return `<div class="stgrp"><p class="stnote">Not in GRAVITAS's list yet (maker and pad unknown here):</p><div class="stgl">${srt(v).map(item).join("")}</div></div>`;
    const key = "s:" + mk, op = stwOpen(key, l.length);
    return `<div class="stgrp">${stwHead(key, op, mk, v.length)}${op ? `<div class="stgl">${srt(v).map(item).join("")}</div>` : ""}</div>`; }).join("")
    + `<p class="stnote">S, M, L: small, medium or large ship.</p>`;
}
// a new system: the old window goes
function stwSystem() { if (STW.el && STW.el.style.display === "block") stnClose(); }
// a row, chip or mark that opens the window: data-sid is the station's place in the system's list
function stnSid(st) { const i = stwAll().indexOf(st); return i >= 0 ? `data-sid="${i}" role="button" tabindex="0"` : ""; }
document.addEventListener("click", e => {
  const r = e.target.closest && e.target.closest("[data-sid]"); if (!r || r.closest("#stw")) return;
  const st = stwAll()[+r.dataset.sid]; if (st) { e.stopPropagation(); stnOpen(st); }
});
document.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("[data-sid]")) { e.preventDefault(); e.target.click(); } });
