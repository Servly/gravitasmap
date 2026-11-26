"use strict";
/* BGS Watch in the GRAVITAS menu over the game: the mode switch, how many screenshots to read, one button and the summary of the last result.
   The confirm table lives in the GRAVITAS window (it needs room): the menu only says how the reading went. */
(function () {
  var T = window.__TAURI__ || {}, invoke = T.core && T.core.invoke, BG = window.BG = window.BG || {};
  BG.tr = BG.tr || function (k, v) { return window.GVC ? GVC.h.tr(k, v) : k; };
  function section(parent, h) {
    var mk = h.mk, tr = h.tr, g = null, busy = false, last = null, err = "";
    var c = h.card("bgs.menu.h", parent), sum = mk("p", "bg-msg"), nIn = document.createElement("input");
    c.appendChild(h.row(tr("bgs.on"), h.sw(function () { return !!(g && g.settings && g.settings.on); }, function (on) {
      invoke("bgs_settings_set", { key: "on", value: on }).then(function (r) { if (r && r.ok) (g || (g = {})).settings = r.settings; else { err = BG.errText ? BG.errText(r && r.error) : ""; draw(); } });
    }), tr("bgs.on.d"), "tip.bgs.on"));
    nIn.type = "number"; nIn.min = 1; nIn.max = 64; nIn.className = "txt"; nIn.style.width = "80px"; h.tip(nIn, "tip.bgs.n");
    nIn.onchange = function () { var v = parseInt(nIn.value, 10); if (!(v >= 1 && v <= 64)) { show(); return; } invoke("bgs_settings_set", { key: "n", value: v }).then(function (r) { if (r && r.ok) (g || (g = {})).settings = r.settings; show(); }); };
    c.appendChild(h.row(tr("bgs.n"), nIn, tr("bgs.n.d"), "tip.bgs.n"));
    var go = h.tip(mk("button", "btn go", tr("bgs.scan.btn")), "tip.bgs.scan"); go.type = "button";
    go.onclick = function () {
      if (busy) return; busy = true; err = ""; last = null; draw();
      invoke("bgs_scan").then(function (r) { busy = false; if (!r || !r.ok) err = (BG.errText ? BG.errText(r && r.error) : "") || tr("bgs.scan.fail"); else last = r; draw(); }).catch(function (e) { busy = false; err = String(e); draw(); });
    };
    var bx = mk("div", "bg-btns"); bx.style.marginTop = "8px"; bx.appendChild(go); c.appendChild(bx); c.appendChild(sum);
    c.appendChild(mk("p", "note", tr("bgs.menu.note")));
    function show() { if (g && g.settings && document.activeElement !== nIn) nIn.value = g.settings.n; }
    function draw() {
      var on = g && g.settings && g.settings.on; go.disabled = busy || !on; sum.className = "bg-msg"; var txt = "";
      if (!on) txt = tr("bgs.scan.off"); else if (busy) txt = tr("bgs.scan.run", { n: g.settings.n }); else if (err) { txt = err; sum.className = "bg-msg err"; }
      else if (last) {
        var ps = last.proposals || [], p = ps[0];
        if (!last.files || !last.files.length) txt = last.pictures_dir ? tr("bgs.scan.nofiles") : tr("bgs.scan.nodir");
        else if (!p) txt = tr("bgs.scan.noprop");
        else { var u = p.uncertain_rows || 0; txt = tr("bgs.menu.sum", { p: (p.pages_found || []).length, q: p.pages_total, s: p.systems_read, a: (p.rows || []).length - u, u: u }) + " " + tr(u || !p.can_save ? "bgs.menu.open" : "bgs.menu.open2"); sum.className = "bg-msg " + (u ? "" : "ok"); }
      } else if (g && g.last_scan) txt = tr("bgs.menu.last", { f: g.last_scan.files, p: g.last_scan.proposals });
      sum.textContent = txt;
    }
    function refresh() { invoke("bgs_get").then(function (r) { g = r; show(); draw(); if (window.GVC) GVC.poll(); }).catch(function () {}); }
    refresh(); if (BG.poll) BG.poll(parent, refresh, 3000);
  }
  if (window.GVC) GVC.add("bgsmenu", function (parent) { section(parent, GVC.h); });
})();
