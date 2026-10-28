// ============================================================== self-test
// Open  http://localhost:8765/?selftest  (or ?selftest=Sol,Colonia) to load a set of systems and check:
// data loads, every position is finite, no discs overlap at any body size, starlight stays within 0–100 %,
// and every tab of every body draws without errors, NaN or "undefined".
const SELFTEST_DEFAULT = ["Sol", "Col 285 Sector VR-E b27-1", "Jackson's Lighthouse", "Colonia", "Sagittarius A*"];
async function runSelfTest(names) {
  const rep = [], add = (sys, check, ok, detail = "") => rep.push({ sys, check, ok, detail });
  const errs = []; const onErr = e => errs.push(String(e.message || e.reason || e)); addEventListener("error", onErr); addEventListener("unhandledrejection", onErr);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const panel = document.createElement("div"); panel.id = "selftest"; panel.className = "panel"; document.body.appendChild(panel);
  const show = done => {
    const bad = rep.filter(r => !r.ok).length;
    panel.innerHTML = `<div class="ph"><span class="ttl">Self-test ${done ? (bad ? `· ${bad} problem${bad > 1 ? "s" : ""}` : "· all passed") : "· running…"}</span><button class="coll">×</button></div>
      <table>${rep.map(r => `<tr><td>${r.ok ? "✅" : "❌"}</td><td>${esc(r.sys)}</td><td>${esc(r.check)}</td><td style="color:var(--dim)">${esc(r.detail)}</td></tr>`).join("")}</table>`;
    panel.querySelector(".coll").onclick = () => panel.remove();          // no inline handlers: the page runs under a strict CSP
  };
  const scale0 = bodyScale;
  const crossing = (x, y) => {                                      // siblings whose true distance ranges overlap
    if (S.parentOf.get(x.bodyId) !== S.parentOf.get(y.bodyId) || x.semiMajorAxis == null || y.semiMajorAxis == null) return false;
    const [i, o] = x.semiMajorAxis < y.semiMajorAxis ? [x, y] : [y, x];
    return i.semiMajorAxis * (1 + (i.orbitalEccentricity || 0)) >= o.semiMajorAxis * (1 - (o.orbitalEccentricity || 0));
  };
  for (const name of names) {
    show(false);
    const e0 = errs.length, ok = await loadSystem(name);
    add(name, "loads from Spansh", ok, ok ? `${S.bodies.length} bodies` : $("status").textContent.slice(0, 120));
    if (!ok) continue;
    await wait(1500);
    const sys = S.sys.name;
    // finite positions
    const fin = p => p && isFinite(p.x) && isFinite(p.y) && isFinite(p.z);
    const badPos = S.bodies.filter(b => !fin(S.world.get(b.bodyId)) || !fin(S.disp.get(b.bodyId)));
    add(sys, "all positions finite", !badPos.length, badPos.map(b => shortName(b, sys)).join(", "));
    // no overlapping discs, at default and largest body size, over 30 days
    for (const sc of [1, 3]) {
      bodyScale = sc; rebuildStylOrbits();
      const hits = new Set();
      for (let k = 0; k < 24; k++) {
        computeDisp(simTime + k * 1.25 * 86400000);
        for (let i = 0; i < S.bodies.length; i++) for (let j = i + 1; j < S.bodies.length; j++) {
          const a = S.bodies[i], c = S.bodies[j], pa = S.disp.get(a.bodyId), pc = S.disp.get(c.bodyId);
          if (crossing(a, c)) continue;                               // orbits that cross in reality may meet on the map too
          if (dist(pa, pc) < (a._vis + c._vis) * bodyScale * 0.98) hits.add(`${shortName(a, sys)} & ${shortName(c, sys)}`);
        }
      }
      add(sys, `no overlaps (body size ×${sc})`, !hits.size, [...hits].slice(0, 6).join(", "));
    }
    bodyScale = scale0; rebuildStylOrbits(); computeDisp(simTime);
    // starlight within range
    const badL = []; for (const b of S.bodies) if (b.type !== "Star") for (const st of S.stars) { const v = starlight(b, st); if (!(v >= 0 && v <= 1)) badL.push(shortName(b, sys)); }
    add(sys, "starlight 0–100 %", !badL.length, [...new Set(badL)].join(", "));
    if (S.sys.id64 === 2871051888129) {                              // in-game reference: nav-panel distances, 2026-10-02 12:23 UTC
      const NAV = {"2":343,"2 a":343,"1":347,"1 a":347,"3":566,"3 b":566,"3 a":567,"4":591,"5":592,"6":611,"7":1015,"7 e":1012,"7 a":1016,"7 b":1016,"7 d":1016,"7 c":1018,"7 g":1018,"7 f":1019,
        "8":1192,"8 g":1183,"8 f":1189,"8 c":1189,"8 d":1190,"8 e":1190,"8 b":1193,"8 a":1193,"10":1910,"9":1916,"9 a":1915,"9 b":1917};
      computeWorld(Date.parse("2026-10-02T12:23:00Z"));
      const ship = { x: 0.909 * LS_MM, y: 0.531 * LS_MM, z: 1.136 * LS_MM }, d = [];
      for (const b of S.bodies) { const n = shortName(b, sys); if (NAV[n] != null && b.meanAnomaly != null) d.push([n, dist(S.world.get(b.bodyId), ship) / LS_MM - NAV[n]]); }
      const worst = d.reduce((m, x) => Math.abs(x[1]) > Math.abs(m[1]) ? x : m, ["", 0]);
      if (d.length >= 25) add(sys, "matches the game (30 nav-panel distances)", Math.abs(worst[1]) < 2.5, `${d.length} bodies, worst ${worst[0]} ${worst[1].toFixed(1)} ls`);
      computeWorld(simTime);
    }
    // every tab of every body
    const sel0 = selected, badT = [];
    for (const b of S.bodies.slice(0, 40)) {
      selected = b;
      let tabs; try { tabs = bodyCharts(b); } catch (e) { badT.push(`${shortName(b, sys)}: ${e.message}`); continue; }
      for (const [t, fn] of Object.entries(tabs)) {
        try { const h = fn(); if (/NaN|undefined/.test(h.replace(/data-tip="[^"]*"/g, ""))) badT.push(`${shortName(b, sys)}/${t}: NaN or undefined in output`); }
        catch (e) { badT.push(`${shortName(b, sys)}/${t}: ${e.message}`); }
      }
    }
    selected = sel0;
    add(sys, "all body tabs draw cleanly", !badT.length, badT.slice(0, 4).join(" | "));
    // v0.50: the system map lists every placed body exactly once and draws without NaN or "undefined"
    try {
      const rows = smapModel(), seen = new Map();
      for (const r of rows) { if (r.star) seen.set(r.star.bodyId, (seen.get(r.star.bodyId) || 0) + 1);
        for (const c of r.cols) for (const o of [c.a, ...c.moons.map(m => m.b)]) seen.set(o.bodyId, (seen.get(o.bodyId) || 0) + 1); }
      const miss = S.bodies.filter(b => seen.get(b.bodyId) !== 1).map(b => `${shortName(b, sys)}×${seen.get(b.bodyId) || 0}`);
      add(sys, "system map lists every body once", !miss.length, miss.slice(0, 6).join(", "));
      const was = MAPMODE; setMap(true, false); await wait(400);
      const html = $("smapBody").innerHTML.replace(/data-tip="[^"]*"/g, "").replace(/href="data:[^"]*"/g, "");   // v0.62: pictures are base64, which can spell NaN
      add(sys, "system map draws cleanly", $("smapBody").querySelectorAll(".smo").length === S.bodies.length && !/NaN|undefined/.test(html), `${$("smapBody").querySelectorAll(".smo").length} bodies drawn`);
      if (!was) setMap(false, false);
    } catch (e) { add(sys, "system map", false, e.message); }
    await wait(800);
    add(sys, "no script errors", errs.length === e0, errs.slice(e0, e0 + 3).join(" | "));
  }
  removeEventListener("error", onErr); removeEventListener("unhandledrejection", onErr);
  show(true); console.table(rep); window.__selftest = rep;
  return rep;
}

{ const P = new URLSearchParams(location.search);
  if (P.has("selftest")) runSelfTest(P.get("selftest") ? P.get("selftest").split(",").map(x => x.trim()).filter(Boolean) : SELFTEST_DEFAULT);
  else {
    // v0.75.6: with Sync on last time, open the system the ship was last seen in (not Sol), when no link names one
    let last = ""; try { if (localStorage.getItem("gravitas.sync.on") === "1") last = localStorage.getItem("gravitas.sync.last") || ""; } catch (e) {}
    // v0.90.8: a link someone opened is the visitor's choice; a reload (or Chrome restoring a tab it put to sleep) is not
    let nav = ""; try { nav = (performance.getEntriesByType("navigation")[0] || {}).type || ""; } catch (e) {}
    const id = /^\d{1,20}$/.test(P.get("id64") || "") ? P.get("id64") : "";   // v0.94: ?id64=… opens a system by Spansh's number
    loadSystem(P.get("system") || (id ? `system ${id}` : "") || last || "Sol", { id64: id || undefined, idLink: !!id, user: !!(P.get("system") || id) && !document.wasDiscarded && nav !== "reload" && nav !== "back_forward" });
  } }
requestAnimationFrame(frame);
