"use strict";
// GRAVITAS Visits, the archive chip: "Archive: 2018" with an x that drops the old period again, a calm "Loading 2018..." card on the map while it
// loads (a bar that follows the months that arrived: no endless animation), and a short note for things like "pick a shorter period".
(function () {
  var G = window.GVV, st = G.store;
  G.attachArch = function (s) {
    var e = s.e, ui = s.ui = s.ui || {}, f = s.f, tr = s.tr, noteT = 0;
    function label() { return s.arch ? s.arch.label || "" : ""; }
    ui.note = function (txt) {
      e.an.textContent = txt || ""; e.an.hidden = !txt; clearTimeout(noteT); ui.arch();
      if (txt) noteT = setTimeout(function () { if (!s.dead) { e.an.hidden = true; e.an.textContent = ""; ui.arch(); } }, 6000);
    };
    s.clearTimers.push(function () { clearTimeout(noteT); });
    ui.arch = function () {
      var a = s.arch, loading = !!a && !a.ready, p = label(), failing = loading && Date.now() < (s.failUntil || 0);
      e.ach.hidden = !a; e.arch.hidden = !a && e.an.hidden;
      if (a) {
        var txt = loading ? tr(failing ? "vis.arch.err" : "vis.arch.loading", { p: p }) : tr("vis.arch.chip", { p: p });
        if (e.al.textContent !== txt) e.al.textContent = txt; e.ach.classList.toggle("ld", loading);
      }
      e.ldv.hidden = !loading;
      if (loading) {
        var done = 0; a.mon.forEach(function () { done++; }); var w = Math.max(6, Math.round(100 * done / Math.max(1, a.ms.length))) + "%";
        var t2 = tr(failing ? "vis.arch.err" : "vis.arch.loading", { p: p }); if (e.ldb.textContent !== t2) e.ldb.textContent = t2; if (e.ldp.style.width !== w) e.ldp.style.width = w;
      }
    };
  };
})();
