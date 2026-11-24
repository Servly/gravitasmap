/* DEBRIEF: the graph of one kept record, drawn from what db_get hands over (the record, the words for its actions, the figures and the lines
   the rules found). Nothing here is worked out again: the report's figures come from Rust; this only draws. */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function mmss(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  function money(v) { return v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1000 ? Math.round(v / 1000) + "k" : String(v); }
  var TAP_MAX = 0.30;
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  window.GVG = {
    /** a node with the whole report: tiles, lines, graph, legend. `t` translates a key of the app's language file. */
    draw: function (view, t) {
      var r = view.rec, T = Math.max(10, r.len || 10), root = el("div", "dbg");
      var pc = function (s) { return (Math.max(0, Math.min(T, s)) / T * 100).toFixed(2) + "%"; };
      var tip = function (e, s, x) { e.setAttribute("data-tip", mmss(s) + "  " + x); return e; };
      // ---- head: ship, place, kind
      var head = el("div", "dbg-head");
      var pv = view.pvp, head0 = [[t("db.g.ship"), r.ship], [t("db.g.place"), r.sys], [t("db.g.wing"), r.wing ? String(r.wing) : ""], [t("db.g.length"), mmss(r.len)]];
      if (pv) head0 = [[t("db.g.opp"), pv.opp], [t("db.g.no"), "#" + pv.no], [t("db.g.result"), t("pvp.res." + (pv.result || "unknown"))], [t("db.g.me"), pv.me]].concat(head0);
      head0.forEach(function (x) {
        if (!x[1]) return; var s = el("span"); s.appendChild(el("b", null, x[0])); s.appendChild(document.createTextNode(x[1])); head.appendChild(s);
      });
      root.appendChild(head);
      // ---- tiles
      var S = view.sum, tiles = el("div", "dbg-tiles");
      [[t("db.t.kills"), r.kills.length + " · " + money(S.value)], [t("db.t.attacks"), String(view.waves.length)], [t("db.t.shields"), mmss(S.shields_down)], [t("db.t.fa"), mmss(S.fa_off)], [t("db.t.heat"), mmss(S.over)], [t("db.t.fasw"), String(S.fa_sw)]].forEach(function (x) {
        var d = el("div", "dbg-tile"); d.appendChild(el("small", null, x[0])); d.appendChild(el("b", null, x[1])); tiles.appendChild(d);
      });
      root.appendChild(tiles);
      // ---- what the rules found (only when switched on)
      if (view.rules && view.obs.length) {
        var ob = el("div", "dbg-obs"); ob.appendChild(el("h4", null, t("db.g.obs")));
        view.obs.forEach(function (o) { var d = el("div"); d.appendChild(el("span", "tm", mmss(o.t))); d.appendChild(el("span", null, o.text)); ob.appendChild(d); });
        root.appendChild(ob);
      }
      // ---- lanes
      var lanes = el("div", "dbg-lanes");
      function lane(label, cls) { var l = el("div", "dbg-lane " + (cls || "")), lb = el("div", "lb"), tr = el("div", "track"); lb.innerHTML = label; l.appendChild(lb); l.appendChild(tr); lanes.appendChild(l); return tr; }
      function add(tr, cls, left, width, extra) { var d = el("div", cls); d.style.left = pc(left); if (width != null) d.style.width = (Math.min(T, left + width) - left) / T * 100 + "%"; if (extra) extra(d); tr.appendChild(d); return d; }
      // shields
      var sh = lane(t("db.g.shields"), "s"), st = r.sh || [];
      st.forEach(function (e, i) { var end = i + 1 < st.length ? st[i + 1][0] : T; add(sh, "sh " + (e[1] ? "up" : "dn"), e[0], end - e[0], function (d) { tip(d, e[0], e[1] ? t("db.g.sh_up") : t("db.g.sh_dn") + " " + Math.round(end - e[0]) + " s"); }); });
      // hull in 20 % steps: the game writes it only when a line is crossed
      var hl = lane(t("db.g.hull"), "t2 hull"), svg = document.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", "0 0 " + T + " 24"); svg.setAttribute("preserveAspectRatio", "none"); svg.setAttribute("class", "th");
      var pts = ["0,3"], lv = 3;
      r.hull.forEach(function (h) { var y = 3 + (1 - h[1]) / 0.8 * 18; pts.push(h[0] + "," + lv, h[0] + "," + y.toFixed(1)); lv = y; });
      pts.push(T + "," + lv.toFixed(1));
      var pl = document.createElementNS(NS, "polyline"); pl.setAttribute("points", pts.join(" ")); pl.setAttribute("class", "ln"); svg.appendChild(pl); hl.appendChild(svg);
      r.hull.forEach(function (h) { var tx = add(hl, "hv", h[0], null); tx.textContent = Math.round(h[1] * 100); tip(tx, h[0], t("db.g.hull_step") + " " + Math.round(h[1] * 100) + " %"); });
      // attacks and heat
      var dg = lane(t("db.g.attacks"), "t2 dg");
      view.waves.forEach(function (w) { add(dg, "wave", w[0], null, function (d) { d.style.height = (6 + Math.min(w[2], 30) * 1.0) + "px"; tip(d, w[0], t("db.g.attack") + ", " + w[2] + " UnderAttack"); }); });
      (r.over || []).forEach(function (o) { add(dg, "heat", o[0], o[1] - o[0], function (d) { tip(d, o[0], t("db.g.over") + " " + Math.round(o[1] - o[0]) + " s"); }); });
      (r.warn || []).forEach(function (w) { add(dg, "hw", w, null, function (d) { tip(d, w, t("db.g.warn")); }); });
      // kills
      var kl = lane(t("db.g.kills"), "s");
      r.kills.forEach(function (k) { var d = add(kl, "kill", k[0], null, function (d) { tip(d, k[0], t("db.g.kill") + " " + money(k[1])); }); d.textContent = "◆ " + money(k[1]); });
      // locked target, and the enemy's health where the scan showed it
      var tg = lane(t("db.g.target"), "s");
      r.tg.forEach(function (g, i) { add(tg, "tg" + (i % 2 ? " alt" : ""), g[0], Math.max(1, g[1] - g[0]), function (d) { d.textContent = g[2] + (g[3] ? " · " + g[3] : ""); tip(d, g[0], t("db.g.locked") + " " + g[2]); }); });
      var withSnap = r.tg.filter(function (g) { return g[4] && g[4].length; });
      if (withSnap.length) {
        var en = lane(t("db.g.enemy") + "<br><b>" + t("db.g.enemy_b") + "</b>", "t2"), sv = document.createElementNS(NS, "svg");
        sv.setAttribute("viewBox", "0 0 " + T + " 22"); sv.setAttribute("preserveAspectRatio", "none"); sv.setAttribute("class", "th");
        function stepLine(g, idx, cls) { // (a step at each time the scan showed a value: nothing is drawn in between)
          var p = [], prev = null;
          g[4].forEach(function (s) { var v = s[idx]; if (v < 0) return; var y = (2 + (1 - v / 100) * 18).toFixed(1); if (prev !== null) p.push(s[0] + "," + prev); p.push(s[0] + "," + y); prev = y; });
          if (prev !== null) p.push(Math.max(g[1], g[4][g[4].length - 1][0]) + "," + prev);
          if (p.length > 1) { var q = document.createElementNS(NS, "polyline"); q.setAttribute("points", p.join(" ")); q.setAttribute("class", cls); sv.appendChild(q); }
        }
        withSnap.forEach(function (g) { stepLine(g, 1, "ln sh"); stepLine(g, 2, "ln"); });
        en.appendChild(sv);
      }
      // flight assist
      var fa = lane(t("db.g.fa"), "s g"), fs = r.fa || [];
      fs.forEach(function (e, i) { var end = i + 1 < fs.length ? fs[i + 1][0] : T; add(fa, "seg " + (e[1] ? "off" : "on"), e[0], end - e[0], function (d) { tip(d, e[0], e[1] ? t("db.fa.off") + " " + Math.round(end - e[0]) + " s" : t("db.fa.on")); }); });
      // where the keys were followed (a gap means: no key data there)
      if ((r.cov || []).length) {
        var cv = lane(t("db.g.cov"), "s");
        (r.cov || []).forEach(function (c) { add(cv, "cov", c[0], c[1] - c[0], function (d) { tip(d, c[0], t("db.g.cov_on")); }); });
      }
      // one thin row for each action
      var rows = {}, order = [];
      r.keys.forEach(function (p) {
        var id = p[1].join("|") + "#" + p[0];
        if (!rows[id]) { rows[id] = { acts: p[1], key: p[0], list: [] }; order.push(id); }
        rows[id].list.push(p);
      });
      order.slice(0, 14).forEach(function (id) {
        var x = rows[id], names = x.acts.map(function (a) { return view.names[a] || a; }).join(" / "), kn = view.keys[x.key] || x.key;
        var toggle = x.acts.some(function (a) { return view.toggles.indexOf(a) >= 0; });
        var tr = lane("<b>" + esc(names.toUpperCase()) + "</b> (" + esc(kn) + ")", "s");
        x.list.forEach(function (p) {
          var d0 = p[2], d1 = p[3] < 0 ? T : p[3], len = d1 - d0;
          if (toggle || len < TAP_MAX) add(tr, "tap", d0, null, function (d) { tip(d, d0, names + " (" + kn + ") " + t("db.g.tap")); });
          else add(tr, "hold", d0, len, function (d) { tip(d, d0, names + " (" + kn + ") " + t("db.g.hold") + " " + len.toFixed(1) + " s"); });
        });
      });
      // the mouse: two lines, above the centre line is right (x) and up (y)
      var scale = (function () { var a = []; (r.mouse || []).forEach(function (m) { a.push(Math.abs(m[1]), Math.abs(m[2])); }); a.sort(function (p, q) { return p - q; }); return Math.max(150, a.length ? a[Math.floor(a.length * 0.95)] : 150); })();
      var axn = function (k) { return t("db.ax." + ({ Bindings_MouseRoll: "roll", Bindings_MousePitch: "pitch", Bindings_MouseYaw: "yaw", Bindings_MousePitchInverted: "pitch" }[k] || "x")); };
      [["x", 1, 1, view.ax.x], ["y", 2, -1, view.ax.y]].filter(function () { return (r.mouse || []).length; }).forEach(function (ax) {
        var tr = lane(t("db.g.mouse") + " " + ax[0].toUpperCase() + (ax[3] ? " (" + axn(ax[3]) + ")" : "") + "<br><b>" + t(ax[0] === "x" ? "db.g.above_r" : "db.g.above_u") + "</b>", "t2 ms");
        (r.mouse || []).forEach(function (m) {
          var v = m[ax[1]] * ax[2], h = Math.min(20, Math.abs(v) / scale * 20);
          if (h < 0.5) return;
          var d = add(tr, v >= 0 ? "mu" : "md", m[0], null); d.style.height = h.toFixed(1) + "px";
        });
      });
      root.appendChild(lanes);
      // ---- time axis
      var ax = el("div", "dbg-axis"); ax.appendChild(el("span")); var ticks = el("div");
      for (var i = 0; i <= 4; i++) ticks.appendChild(el("span", null, mmss(T * i / 4)));
      ax.appendChild(ticks); root.appendChild(ax);
      // ---- legend and limits
      var lg = el("div", "dbg-legend");
      [t("db.g.l.tap"), t("db.g.l.hold"), t("db.g.l.atk"), t("db.g.l.over"), t("db.g.l.kill")].forEach(function (s) { lg.appendChild(el("span", null, s)); });
      root.appendChild(lg);
      root.appendChild(el("p", "dbg-note", t("db.g.limits")));
      if (pv) root.appendChild(el("p", "dbg-note", t("db.g.notproof")));
      // ---- the hover tip
      var tp = el("div", "dbg-tip"); root.appendChild(tp);
      root.addEventListener("mousemove", function (e) {
        var n = e.target.closest ? e.target.closest("[data-tip]") : null;
        if (!n) { tp.style.display = "none"; return; }
        var b = root.getBoundingClientRect(); tp.textContent = n.getAttribute("data-tip"); tp.style.display = "block";
        tp.style.left = Math.min(e.clientX - b.left + 12, b.width - 220) + "px"; tp.style.top = (e.clientY - b.top + 14) + "px";
      });
      root.addEventListener("mouseleave", function () { tp.style.display = "none"; });
      return root;
    }
  };
})();
