// ------------------------------------------------------------ v0.95 Collisions lab (only with ?lab=coll in the address, linked from nowhere)
// For GRAVITAS's own work, in our own browser:
//  1. works out the next passes of every pair in the list, one system at a time, slowly (one Spansh request, then a pause),
//     and gives coll-next.json to put in src/assets, so the Collisions window opens with the times ready;
//  2. with our private file of Canonn's own times (coll-canonn-private.json, from tools/canonn_import.py, never on the site)
//     it compares them with ours and with the Observatory sightings, and gives a report to download. Nothing is shown on the site.
if (new URLSearchParams(location.search).get("lab") === "coll") (() => {
  const L = { run: false, i: 0, sys: [], res: new Map(), priv: null, cmp: new Map(), obs: [], log: [], t0: 0, all: false, gap: 1500 };
  const lim = +new URLSearchParams(location.search).get("n") || 0;
  const el = document.createElement("div"); el.id = "cxLab";
  el.innerHTML = `<b>COLLISIONS LAB</b> <small>private, not linked anywhere</small><div id="cxLs">Loading the list…</div>
    <label><input type="checkbox" id="cxLall"> also pairs without phase data (much longer)</label>
    <label>Canonn's times (private file): <input type="file" id="cxLf" accept=".json"></label>
    <div class="cxLb"><button id="cxLgo">Start</button><button id="cxLnext" disabled>Download coll-next.json</button><button id="cxLrep" disabled>Download report</button><button id="cxLx">Close</button></div><pre id="cxLlog"></pre>`;
  document.body.appendChild(el);
  const st = $("cxLs"), log = m => { L.log.push(m); $("cxLlog").textContent = L.log.slice(-8).join("\n"); };
  const save = (name, text) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "application/json" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  const key = (s, a, b) => [s, a, b].map(x => String(x).replace(/\s+/g, "").toLowerCase()).join("|");
  function plan() {
    const by = new Map();
    for (const p of CX.pairs) if (L.all || (p.f & CX.meta.flags.mean)) { if (!by.has(p.id)) by.set(p.id, []); by.get(p.id).push(p); }
    L.sys = [...by.entries()]; if (lim) L.sys = L.sys.slice(0, lim);
    st.textContent = `${L.sys.length} systems, ${L.sys.reduce((s, x) => s + x[1].length, 0)} pairs. About ${Math.round(L.sys.length * (L.gap + 900) / 60000)} minutes.`;
  }
  cxLoad().then(() => { if (CX.pairs) plan(); });
  $("cxLall").onchange = e => { L.all = e.target.checked; if (CX.pairs && !L.run) { L.i = 0; plan(); } };
  $("cxLx").onclick = () => { L.run = false; el.remove(); };
  $("cxLf").onchange = async e => { try { L.priv = JSON.parse(await e.target.files[0].text()); log(`Canonn's file: ${L.priv.pairs.length} pairs, ${L.priv.observatory.length} sightings`); } catch (x) { log("That file could not be read"); } };
  function one(M, p) {                            // our next passes, and (with the private file) ours near Canonn's time
    const P = cxPair(M, cxFind(M, p.a), cxFind(M, p.b));
    let r = { why: P.why && P.why !== "epoch" ? P.why : null, ev: [] };
    if (P.gap && P.why !== "phase") { const n = cxNext(P, Date.now() - 6 * 3600e3, cxDays(P, CX_YEARS), 3); r = { why: n.events.length ? P.why || null : P.why || "none", ev: n.events, how: n.how, map: P.map }; }
    L.res.set(cxKey(p.id, p.a, p.b), r);
    const c = L.priv && L.privMap.get(key(p.sys, p.a, p.b));
    if (c) {
      const o = { sys: p.sys, a: p.a, b: p.b, canonn: c.verdict, canonnNext: c.next, ours: r.ev.length ? "collides" : r.why, oursNext: r.ev[0] ? new Date(r.ev[0].start).toISOString() : null, epoch: P.ep ? new Date(P.ep).toISOString() : null };
      if (c.next && P.gap && P.why !== "phase") {
        const t = Date.parse(c.next), w = Math.max(2 * 86400e3, (P.syn && isFinite(P.syn) ? Math.min(P.syn * 0.3, 30 * 86400e3) : 0));
        const n = cxNext(P, t - w, (2 * w) / 86400e3, 6).events.sort((x, y) => Math.abs(x.start - t) - Math.abs(y.start - t))[0];
        if (n) { o.oursNear = new Date(n.start).toISOString(); o.diffMin = Math.round((n.start - t) / 6e4); } else o.oursNear = null;
      }
      L.cmp.set(key(p.sys, p.a, p.b), o);
    }
  }
  async function step() {
    if (!L.run) return;
    if (L.i >= L.sys.length) { L.run = false; $("cxLgo").textContent = "Done"; log(`Done in ${Math.round((Date.now() - L.t0) / 60000)} min`); if (L.priv) await sightings(); return; }
    const [id, ps] = L.sys[L.i];
    try { const M = cxPrep(await fetch(`${API}/system?id64=${id}`).then(apiJSON)); for (const p of ps) one(M, p); }
    catch (e) { log(`${ps[0].sys}: ${e.message}, trying again in 20 s`); await new Promise(r => setTimeout(r, 20000));
      try { const M = cxPrep(await fetch(`${API}/system?id64=${id}`).then(apiJSON)); for (const p of ps) one(M, p); } catch (x) { for (const p of ps) L.res.set(cxKey(p.id, p.a, p.b), { why: "fail", ev: [] }); } }
    L.i++; st.textContent = `${L.i} / ${L.sys.length} systems · ${[...L.res.values()].filter(r => r.ev.length).length} pairs with a pass`;
    $("cxLnext").disabled = false; $("cxLrep").disabled = !L.priv;
    setTimeout(step, L.gap);
  }
  async function sightings() {                     // the Observatory: Canonn's estimate, what was seen, and ours
    const off = s => { s = String(s || "").toLowerCase(); if (/spot on/.test(s)) return 0; const m = /(\d+)\s*(minute|min|hour|day|year)s?\s*(early|late)/.exec(s);
      if (!m) return null; const u = { minute: 1, min: 1, hour: 60, day: 1440, year: 525960 }[m[2]]; const v = (m[3] === "early" ? -1 : 1) * m[1] * u; return Math.abs(v) > 1440 ? null : v; };   // "2 Years early" was another pass: not a timing
    for (const o of L.priv.observatory) {
      const r = { ...o, seenOffsetMin: off(o.observed) };
      try {
        const p = CX.pairs.find(x => key(x.sys, x.a, x.b) === key(o.sys, o.a, o.b));
        const j = await fetch(p ? `${API}/system?id64=${p.id}` : `${API}/system?name=${encodeURIComponent(o.sys)}`).then(apiJSON);
        const M = cxPrep(j), P = cxPair(M, cxFind(M, o.a), cxFind(M, o.b)), t = Date.parse(o.estimate);
        r.why = P.why; r.epoch = P.ep ? new Date(P.ep).toISOString() : null;
        if (P.gap && P.why !== "phase") {
          const n = cxNext(P, t - 3 * 86400e3, 6, 8).events.sort((x, y) => Math.abs(x.start - t) - Math.abs(y.start - t))[0];
          if (n) { r.ours = new Date(n.start).toISOString(); r.oursMinusEstimate = Math.round((n.start - t) / 6e4);
            if (r.seenOffsetMin != null) r.oursMinusSeen = r.oursMinusEstimate - r.seenOffsetMin; }
        }
      } catch (e) { r.error = e.message; }
      L.obs.push(r); log(`Sighting ${o.sys} ${o.a}/${o.b}: ours ${r.oursMinusEstimate ?? "?"} min from Canonn's estimate, seen ${r.seenOffsetMin ?? "?"}`);
      await new Promise(res => setTimeout(res, L.gap));
    }
    $("cxLrep").disabled = false;
  }
  $("cxLgo").onclick = () => {
    if (!CX.pairs) return;
    if (L.priv && !L.privMap) L.privMap = new Map(L.priv.pairs.map(p => [key(p.sys, p.a, p.b), p]));
    L.run = !L.run; $("cxLgo").textContent = L.run ? "Pause" : "Go on"; if (L.run) { if (!L.t0) L.t0 = Date.now(); step(); }
  };
  $("cxLnext").onclick = () => {
    const rows = [];
    for (const p of CX.pairs) { const r = L.res.get(cxKey(p.id, p.a, p.b)); if (r && r.why !== "fail") rows.push([p.id, p.a, p.b, r.why || 0, r.ev.map(e => [Math.round(e.start / 1000), e.end ? Math.round(e.end / 1000) : 0, Math.round(e.depth)]), r.map === false ? 0 : 1]); }
    save("coll-next.json", JSON.stringify({ made: new Date().toISOString(), years: CX_YEARS, by: "GRAVITAS", pairs: rows }));
  };
  $("cxLrep").onclick = () => {
    const C = [...L.cmp.values()], n = f => C.filter(f).length;
    const d = C.filter(c => c.diffMin != null).map(c => Math.abs(c.diffMin)).sort((a, b) => a - b), med = d.length ? d[d.length >> 1] : null;
    const summary = {
      pairs_compared: C.length,
      both_collide: n(c => c.canonn === "Y" && c.ours === "collides"),
      canonn_yes_ours_no: n(c => c.canonn === "Y" && c.ours !== "collides"),
      canonn_no_ours_yes: n(c => c.canonn === "N" && c.ours === "collides"),
      canonn_unknown_ours_yes: n(c => c.canonn !== "Y" && c.canonn !== "N" && c.ours === "collides"),
      times_compared: d.length, median_minutes_apart: med, within_5_min: d.filter(x => x <= 5).length, over_60_min: d.filter(x => x > 60).length,
      sightings: L.obs.length, sightings_ours_minus_seen_min: L.obs.filter(o => o.oursMinusSeen != null).map(o => `${o.sys} ${o.a}/${o.b}: ${o.oursMinusSeen}`),
    };
    save(`gravitas-collisions-report-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ made: new Date().toISOString(), summary, sightings: L.obs,
      new_from_us: C.filter(c => c.canonn !== "Y" && c.ours === "collides"), canonn_yes_ours_no: C.filter(c => c.canonn === "Y" && c.ours !== "collides"),
      far_apart: C.filter(c => c.diffMin != null && Math.abs(c.diffMin) > 60), all: C }, null, 1));
  };
})();
