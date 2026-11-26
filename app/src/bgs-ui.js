"use strict";
/* BGS Watch, part 8: the chart pages. One store (the saved snapshots from bgs_snapshots), one model (bgs-calc.js), one pane per tab.
   Panes redraw only while they are on the screen and only when the snapshots or the settings changed. Times: UTC on the page, this PC's time in tips. */
(function () {
  var T = window.__TAURI__ || {}, invoke = T.core && T.core.invoke, BG = window.BG = window.BG || {}, S = BG.svg, V = BG.views, C = BG.calc, esc = S.esc;
  var t = function (k, v) { return BG.tr(k, v); };
  var ui = BG.ui = { tmode: "top", base: "24h", minor: 0.3, tickPct: 20, days: 0, msort: "drop", rfilter: "all", tsort: "low", hsort: "low", hmode: "chg", q: "", sel: null, faction: "", rep: { att: 1, drops: 1, gains: 1, cross: 1, tick: 1 } };
  var store = BG.store = { sig: "", data: null, M: null, rev: 0, last: 0, busy: false, g: null };
  var panes = [];

  // snapshots (newest first, from the backend) -> the shape bgs-calc.js wants
  function toData(list) {
    var a = list.slice().reverse(), by = {}, order = [], N = 0;
    a.forEach(function (sn) { N = Math.max(N, sn.rows.length); });
    var snaps = a.map(function (sn, i) {
      var got = 0;
      sn.rows.forEach(function (r) { var o = by[r.system]; if (!o) { o = by[r.system] = { n: r.system, v: [], f: [] }; order.push(o); } if (r.inf_x10 != null) got++; });
      return { t: Date.parse(sn.data_utc || sn.taken_utc), complete: !!sn.complete, missing: Math.max(0, N - got), minOld: sn.minutes_old == null ? 0 : sn.minutes_old, id: sn.id };
    });
    a.forEach(function (sn, i) {
      order.forEach(function (o) { o.v[i] = null; o.f[i] = ""; });
      sn.rows.forEach(function (r) { var o = by[r.system]; if (r.inf_x10 != null) { o.v[i] = r.inf_x10 / 10; o.f[i] = (r.confirmed && r.conf != null && r.conf < 0.6) || r.accepted_unchecked ? "w" : ""; } });
    });
    return { squad: "", snaps: snaps, sys: order };
  }
  // Daily view: one column per UTC day, its value is the day's LAST snapshot. Every raw snapshot stays stored; the steps inside a day (with the two readings
  // between which each change happened) are kept for the tips, so the tick can still be followed.
  function daily(d) {
    var days = [], idx = {};
    d.snaps.forEach(function (sn, i) { var k = new Date(sn.t).toISOString().slice(0, 10); if (!(k in idx)) { idx[k] = days.length; days.push({ k: k, last: i, n: 0 }); } var g = days[idx[k]]; g.last = i; g.n++; });
    var dayOf = d.snaps.map(function (sn) { return idx[new Date(sn.t).toISOString().slice(0, 10)]; });
    var snaps = days.map(function (g) { var sn = d.snaps[g.last]; return { t: sn.t, complete: sn.complete, missing: sn.missing, minOld: sn.minOld, id: sn.id, n: g.n, day: g.k }; });
    var sys = d.sys.map(function (o) {
      var v = [], f = [], steps = [], pv = null, pt = null, i;
      days.forEach(function (g, di) { v[di] = null; f[di] = ""; steps[di] = []; });
      for (i = 0; i < d.snaps.length; i++) {
        if (o.v[i] == null) continue;
        var di = dayOf[i];
        if (pv != null && o.v[i] !== pv) steps[di].push({ a: pt, b: d.snaps[i].t, d: Math.round((o.v[i] - pv) * 10) / 10 });
        pv = o.v[i]; pt = d.snaps[i].t; v[di] = o.v[i]; f[di] = o.f[i];
      }
      return { n: o.n, v: v, f: f, steps: steps };
    });
    return { squad: d.squad, snaps: snaps, sys: sys };
  }
  function build() {
    var g = store.g, s = (g && g.settings) || {};
    if (!ui.setSeen && s.minor != null) { ui.minor = Math.round(s.minor * 10) / 10; ui.tickPct = s.tick_pct == null ? 20 : Math.round(s.tick_pct); ui.setSeen = true; } // (kept from the last session)
    if (!store.data || !store.data.snaps.length) { store.M = null; return; }
    var nDays = {}; store.data.snaps.forEach(function (x) { nDays[new Date(x.t).toISOString().slice(0, 10)] = 1; });
    var dataIn = ui.res !== "snap" && Object.keys(nDays).length >= 2 ? daily(store.data) : store.data;
    store.M = C.model(dataIn, { lo: s.low == null ? 50 : s.low, hi: s.high == null ? 65 : s.high, minor: ui.minor, base: ui.base, days: ui.days, tickPct: ui.tickPct });
    V.setModel(store.M); BG.M = store.M;
  }
  function load(force) {
    if (store.busy || !invoke) return Promise.resolve();
    store.busy = true;
    return invoke("bgs_get").then(function (g) {
      var sig = JSON.stringify([g.snapshots.map(function (x) { return x.id; }), g.settings && [g.settings.low, g.settings.high, g.settings.on]]);
      var changedSnaps = JSON.stringify(g.snapshots.map(function (x) { return x.id; })) !== store.snapIds;
      store.g = g;
      if (!changedSnaps && !force && !BG.dirty) { if (sig !== store.sig) { store.sig = sig; build(); store.rev++; } return; }
      BG.dirty = false; store.snapIds = JSON.stringify(g.snapshots.map(function (x) { return x.id; })); store.sig = sig;
      if (!g.snapshots.length) { store.data = null; build(); store.rev++; return; }
      return invoke("bgs_snapshots", { n: 500 }).then(function (r) { store.data = r && r.ok ? toData(r.snapshots) : null; build(); store.rev++; });
    }).catch(function () {}).then(function () { store.busy = false; store.last = Date.now(); });
  }
  BG.bandChanged = function () { load(true); };

  // ---------- tips (one for the whole window), save picture, downloads ----------
  var tip;
  function tipInit() {
    if (tip) return; tip = document.createElement("div"); tip.className = "bg-tip"; document.body.appendChild(tip);
    document.addEventListener("mouseover", function (e) { var x = e.target.closest && e.target.closest("[data-tip]"); if (!x || !x.closest(".bg-wrap,.bg-drawer")) { tip.style.display = "none"; return; } tip.textContent = x.getAttribute("data-tip"); tip.style.display = "block"; });
    document.addEventListener("mousemove", function (e) { if (tip.style.display === "block") { tip.style.left = Math.max(8, Math.min(innerWidth - 350, e.clientX + 14)) + "px"; tip.style.top = Math.min(innerHeight - 60, e.clientY + 16) + "px"; } });
  }
  function dl(name, blob) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800); }
  function savePng(svgEl) {
    var cs = getComputedStyle(document.documentElement), x = new XMLSerializer().serializeToString(svgEl).replace(/var\(--([\w-]+)\)/g, function (m, k) { return cs.getPropertyValue("--" + k).trim() || "#888"; });
    var w = svgEl.viewBox.baseVal.width, h = svgEl.viewBox.baseVal.height, im = new Image();
    im.onload = function () { var c = document.createElement("canvas"); c.width = w * 2; c.height = h * 2; var g = c.getContext("2d"); g.fillStyle = cs.getPropertyValue("--tab").trim() || "#0e0920"; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height); c.toBlob(function (b) { b && dl("bgs-chart.png", b); }); };
    im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(x);
  }
  // the drawer (one for all panes)
  var drawer;
  function openSys(n) {
    if (!store.M) return; if (!drawer) { drawer = document.createElement("aside"); drawer.className = "bg-drawer"; document.body.appendChild(drawer); wire(drawer); }
    ui.sel = n; drawer.innerHTML = V.detail(store.M, n); drawer.classList.add("on");
  }
  function closeSys() { ui.sel = null; if (drawer) drawer.classList.remove("on"); }

  function bar(M) {
    var s = (store.g && store.g.settings) || {};
    function lab(tipk, txt, ctl) { return '<label data-tip="' + esc(t(tipk)) + '">' + txt + " " + ctl + "</label>"; }
    function sel(id, cur, opts) { return '<select class="bg-in" id="' + id + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(cur) === String(o[0]) ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>"; }
    return lab("tip.bgs.band", t("bgs.bar.band"), '<input type="number" id="blo" value="' + (s.low == null ? 50 : s.low) + '" min="0" max="100" step="0.5"> ' + t("bgs.bar.to") + ' <input type="number" id="bhi" value="' + (s.high == null ? 65 : s.high) + '" min="0" max="100" step="0.5">') +
      lab("tip.bgs.bar.minor", t("bgs.bar.minor"), '<input type="number" step="0.1" min="0.1" max="5" id="bmin" value="' + ui.minor + '">') +
      lab("tip.bgs.bar.tick", t("bgs.bar.tick"), '<input type="number" step="1" min="2" max="90" id="btick" value="' + ui.tickPct + '">') +
      lab("tip.bgs.bar.base", t("bgs.bar.base"), sel("bbase", ui.base, [["prev", t("bgs.base.prev")], ["24h", t("bgs.base.24h")], ["7d", t("bgs.base.7d")]])) +
      lab("tip.bgs.bar.show", t("bgs.bar.show"), sel("bdays", ui.days, [[0, t("bgs.show.all")], [3, t("bgs.show.3")], [7, t("bgs.show.7")]]));
  }
  function head(M) {
    var sn = M.snaps[M.K], fw = M.sys.reduce(function (a, s) { return a + (s.f[M.K] ? 1 : 0); }, 0), tot = M.sys.length;
    return '<span>' + t("bgs.dq.newest") + ' <b data-tip="' + esc(C.dtl(sn.t)) + '">' + C.dt(sn.t) + " UTC</b> <span class='bg-fl'>(" + t("bgs.dq.old", { n: sn.minOld }) + ")</span></span><span>" + (sn.complete ? t("bgs.dq.complete") + " <b>" + M.fleet[M.K].n + " / " + tot + "</b>" : "<b class='w'>" + t("bgs.dq.incomplete", { n: sn.missing }) + "</b>") + "</span><span><b>" + M.nS + "</b> " + t("bgs.dq.snaps") + (M.nS > 1 ? " " + t("bgs.dq.over", { s: C.ago(sn.t - M.snaps[0].t) }) : "") + "</span>" +
      (fw ? "<span class='w'>" + t("bgs.dq.warn", { n: fw }) + "</span>" : "") + (M.nS > 1 ? "<span>" + t("bgs.dq.inc", { n: M.snaps.filter(function (x) { return !x.complete; }).length }) + "</span>" : "") + "<span class='bg-fl'>" + t("bgs.dq.utc") + "</span>";
  }
  // the slim bar: one quality chip, the three filters that matter, everything else under "more"
  function pin(M) {
    var sn = M.snaps[M.K], chip = M.fleet[M.K].n + "/" + M.sys.length + " · " + C.dt(sn.t) + " UTC";
    var s = (store.g && store.g.settings) || {};
    function lab(tipk, txt, ctl) { return '<label data-tip="' + esc(t(tipk)) + '">' + txt + " " + ctl + "</label>"; }
    function sel(id, cur, opts) { return '<select class="bg-in" id="' + id + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(cur) === String(o[0]) ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>"; }
    var main = lab("tip.bgs.band", t("bgs.bar.band"), '<input type="number" id="blo" value="' + (s.low == null ? 50 : s.low) + '" min="0" max="100" step="0.5"> ' + t("bgs.bar.to") + ' <input type="number" id="bhi" value="' + (s.high == null ? 65 : s.high) + '" min="0" max="100" step="0.5">') +
      lab("tip.bgs.bar.base", t("bgs.bar.base"), sel("bbase", ui.base, [["prev", t("bgs.base.prev")], ["24h", t("bgs.base.24h")], ["7d", t("bgs.base.7d")]])) +
      lab("tip.bgs.res", t("bgs.res"), sel("bres", ui.res === "snap" ? "snap" : "daily", [["daily", t("bgs.res.daily")], ["snap", t("bgs.res.snap")]])) +
      lab("tip.bgs.bar.show", t("bgs.bar.show"), sel("bdays", ui.days, [[0, t("bgs.show.all")], [3, t("bgs.show.3")], [7, t("bgs.show.7")]]));
    var more = lab("tip.bgs.bar.minor", t("bgs.bar.minor"), '<input type="number" step="0.1" min="0.1" max="5" id="bmin" value="' + ui.minor + '">') +
      lab("tip.bgs.bar.tick", t("bgs.bar.tick"), '<input type="number" step="1" min="2" max="90" id="btick" value="' + ui.tickPct + '">');
    var names = M.sys.map(function (x) { return x.n; }).sort();
    var srch = '<input type="search" id="bgq" class="bg-search" list="bgnames" autocomplete="off" spellcheck="false" placeholder="' + esc(t("bgs.search.ph")) + '" value="' + esc(ui.sq || "") + '" data-tip="' + esc(t("tip.bgs.search")) + '"><datalist id="bgnames">' + names.map(function (n) { return '<option value="' + esc(n) + '">'; }).join("") + "</datalist>";
    return '<div class="bg-pin">' + srch + '<span class="bg-qchip" data-tip="' + esc(t("tip.bgs.qchip")) + '">' + esc(chip) + "</span>" + main +
      '<details class="bg-more"><summary data-tip="' + esc(t("tip.bgs.more")) + '">' + t("bgs.more") + '</summary><div class="bg-moreb"><div class="bg-dq">' + head(M) + '</div><div class="bg-bar">' + more + "</div></div></details></div>";
  }
  function empty() {
    var g = store.g, off = g && g.settings && !g.settings.on;
    return '<div class="bg-empty">' + (g ? (off ? t("bgs.e.off") : t("bgs.e.none")) : t("bgs.e.load")) + '<div style="margin-top:12px"><button class="btn go" data-gosetup="1" data-tip="' + esc(t("tip.bgs.gosetup")) + '">' + t("bgs.e.go") + "</button></div></div>";
  }
  function renderPane(p) {
    var M = store.M; p.rev = store.rev;
    var keep = p.el.querySelector(".bg-scroll"), sx = keep ? keep.scrollLeft : 0, sy = p.sc ? p.sc.scrollTop : 0;
    if (!M) { p.el.innerHTML = empty(); return; }
    p.el.innerHTML = pin(M) + '<div class="bg-view">' + (V[p.tab] || V.defend)(M, ui) + "</div>";
    var k2 = p.el.querySelector(".bg-scroll"); if (k2) k2.scrollLeft = sx;
    if (ui.sel && drawer && drawer.classList.contains("on")) drawer.innerHTML = V.detail(M, ui.sel);
  }
  function renderAll() { panes.forEach(function (p) { if (!p.el.isConnected) return; if (p.el.offsetParent) renderPane(p); else p.rev = -1; }); }
  BG.render = renderAll;

  function wire(el) {
    el.addEventListener("click", function (e) {
      var x = e.target, b;
      if ((b = x.closest("[data-gosetup]"))) { var tb = document.querySelector('.tabs[data-scope="bgs"] .tab[data-tab="setup"]'); if (tb) tb.click(); return; }
      if ((b = x.closest("[data-seg] button"))) { ui[b.parentNode.dataset.seg] = b.dataset.v; renderAll(); return; }
      if (x.closest("[data-close]")) { closeSys(); return; }
      if ((b = x.closest("[data-save]"))) { var sv = b.closest(".bg-card").querySelector("svg"); if (sv) savePng(sv); return; }
      if ((b = x.closest("[data-csv]"))) { if (store.M) dl("bgs-" + b.dataset.csv + ".csv", new Blob([V.csv(store.M, b.dataset.csv)], { type: "text/csv;charset=utf-8" })); return; }
      if (x.closest("[data-copy]")) { var txt = V.reportText(store.M, ui), bt = x.closest("[data-copy]"); try { navigator.clipboard.writeText(txt).then(function () { bt.textContent = t("bgs.rep.copied"); }); } catch (er) {} return; }
      if ((b = x.closest("[data-sys]"))) { openSys(b.dataset.sys); return; }
    });
    el.addEventListener("change", function (e) {
      var x = e.target, id = x.id;
      if (id === "bgq") {
        var q = x.value.trim().toLowerCase(), ns = store.M ? store.M.sys.map(function (s) { return s.n; }) : [];
        var hit = ns.filter(function (n) { return n.toLowerCase() === q; })[0] || ns.filter(function (n) { return n.toLowerCase().indexOf(q) === 0; })[0] || ns.filter(function (n) { return n.toLowerCase().indexOf(q) >= 0; })[0];
        ui.sq = x.value;
        if (q && hit) { openSys(hit); ui.sq = hit; x.value = hit; } else if (q && BG.toast) BG.toast(t("bgs.search.none", { q: x.value }));
        return;
      }
      if (id === "blo" || id === "bhi") {
        var lo = parseFloat(document.getElementById("blo").value), hi = parseFloat(document.getElementById("bhi").value);
        (id === "blo" ? invoke("bgs_settings_set", { key: "low", value: lo }) : invoke("bgs_settings_set", { key: "high", value: hi })).then(function (r) { if (r && r.ok) load(true); else { BG.toast && BG.toast(BG.errText(r && r.error)); load(true); } });
        return;
      }
      if (id === "bmin") { ui.minor = Math.max(0.1, +x.value || 0.3); invoke("bgs_settings_set", { key: "minor", value: ui.minor }); } else if (id === "btick") { ui.tickPct = Math.max(2, Math.min(90, +x.value || 20)); invoke("bgs_settings_set", { key: "tick_pct", value: ui.tickPct }); } else if (id === "bbase") ui.base = x.value; else if (id === "bdays") ui.days = +x.value; else if (id === "bres") ui.res = x.value;
      else if (x.dataset.rep) ui.rep[x.dataset.rep] = x.checked ? 1 : 0; else return;
      build(); store.rev++; renderAll();
    });
    el.addEventListener("input", function (e) {
      var x = e.target;
      if (x.id === "tq") { ui.q = x.value; renderAll(); var i = document.getElementById("tq"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
      else if (x.id === "rfac") { ui.faction = x.value.replace(/[`\r\n]/g, ""); var pre = document.getElementById("reptxt"); if (pre) { pre.textContent = V.reportText(store.M, ui); } }
    });
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && ui.sel) closeSys(); });

  function mount(parent, tab, h) {
    tipInit(); BG.toast = h.toast; BG.lang = h.lang(); BG.loadEn();
    var el = document.createElement("div"); el.className = "bg-wrap"; parent.appendChild(el);
    var p = { el: el, tab: tab, rev: -1, sc: null }; panes.push(p); wire(el);
    panes = panes.filter(function (q) { return q.el.isConnected; });
    el.innerHTML = '<div class="bg-empty">' + t("bgs.e.load") + "</div>";
    function tick() { var stale = Date.now() - store.last > 6000; (stale ? load() : Promise.resolve()).then(function () { if (p.rev !== store.rev) renderPane(p); }); }
    tick(); BG.poll(el, tick, 2000);
  }
  if (window.GVC) GVC.add("bgsview", function (parent, tab) { mount(parent, tab, GVC.h); });
})();
