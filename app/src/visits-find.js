"use strict";
// GRAVITAS Visits, the search list: asks Rust (visits_find) so it searches the WHOLE history, not only what is held. Picking a result opens its month
// (as the archive when it is an old one) and flies to the stop. The held stops are still dimmed by the same text on the map (G.recomputeMatch).
(function () {
  var G = window.GVV, esc = G.esc, KCOL = G.KCOL, KIND = G.KIND;
  G.attachFind = function (s) {
    var e = s.e, f = s.f, tr = s.tr, ui = s.ui = s.ui || {}, T = 0, gen = 0;
    s.resItems = []; s.resAct = -1;
    s.clearTimers.push(function () { clearTimeout(T); });
    ui.closeRes = function () { clearTimeout(T); gen++; e.res.classList.remove("on"); e.q.setAttribute("aria-expanded", "false"); s.resItems = []; s.resAct = -1; };
    function show(items) {
      var out = items.filter(function (o) { if (!s.mask) return true; var k = KIND.indexOf(o.k); return k >= 0 && (s.mask >> k & 1); });
      s.resItems = out; s.resAct = -1;
      e.res.innerHTML = out.length ? out.map(function (o, j) {
        var col = KCOL[o.k] || "#9d8cc0", title, t = G.tms(o.t), what = o.what || "";
        if (o.k === "sell") title = tr("vis.r.sold", { n: o.n || "", what: what }); else if (o.k === "buy") title = tr("vis.r.bought", { n: o.n || "", what: what });
        else if (o.k === "dock") title = tr("vis.r.docked", { st: o.st || "" }); else if (o.k === "sys") title = o.sys; else title = tr("vis.k." + o.k);
        return '<button role="option" data-j="' + j + '"><span class="d" style="background:' + col + ";box-shadow:0 0 8px " + col + '"></span><span class="t"><b>' + esc(String(title).replace(/\s+/g, " ").trim()) + "</b><small>" + esc(o.sys) + (o.st && o.k !== "dock" ? " · " + esc(o.st) : "") + '</small></span><span class="w">' + esc(f.my(t)) + "</span></button>";
      }).join("") : '<div class="none">' + esc(tr("vis.search.none")) + "</div>";
    }
    ui.showRes = function () {
      clearTimeout(T); var q = s.query; if (!q) { ui.closeRes(); return; }
      var my = ++gen; if (!e.res.classList.contains("on")) { e.res.innerHTML = '<div class="none">' + esc(tr("vis.search.busy")) + "</div>"; e.res.classList.add("on"); e.q.setAttribute("aria-expanded", "true"); }
      T = setTimeout(function () {
        var p; try { p = s.h.invoke("visits_find", { q: q, limit: 30 }); } catch (_) { p = Promise.reject(); }
        p.then(function (r) { if (s.dead || my !== gen) return; show((r && r.items) || []); }).catch(function () { if (!s.dead && my === gen) show([]); });
      }, 100);
    };
    ui.pick = function (o) {
      var t = G.tms(o.t), i = s.D ? G.findStop(s.D, t, o.sys) : -1;
      if (i >= 0) { s.x.goTo(s, i); return; }
      var p = G.periodOf(t, "month"); G.store.openRange(s, "month", p[0], p[1], { sel: { t: t, sys: o.sys } });
    };
  };
})();
