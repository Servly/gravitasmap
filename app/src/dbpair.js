/* PVP: two fights of the same fight (yours and the other commander's) on one clock. Drawn from what pvp_pair_get hands over: both sides'
   records, the shift that puts the second side on the first side's clock, the lines the rules found. Every name comes from a file that may
   have come from somewhere else, so every text goes in as text, never as HTML. */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function mmss(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }

  window.GVP = {
    draw: function (view, t) {
      var A = view.a, B = view.b, base = view.base, end = Math.max(10, view.end - base), root = el("div", "dbg dbp");
      var pc = function (s) { return (Math.max(0, Math.min(end, s - base)) / end * 100).toFixed(2) + "%"; };
      var tip = function (e, s, x) { e.setAttribute("data-tip", mmss(s - base) + "  " + x); return e; };
      // ---- head
      var head = el("div", "dbg-head");
      [[t("db.g.me"), A.me, "ga"], [t("db.g.opp"), B.me, "gb"], [t("db.g.no"), "#" + A.no + " / #" + B.no], [t("db.g.length"), mmss(end)]].forEach(function (x) {
        var s = el("span", x[2] || ""); s.appendChild(el("b", null, x[0])); s.appendChild(document.createTextNode(x[1])); head.appendChild(s);
      });
      root.appendChild(head);
      // ---- the lines the rules found (when switched on)
      if (view.rules && view.obs.length) {
        var ob = el("div", "dbg-obs"); ob.appendChild(el("h4", null, t("db.g.obs")));
        view.obs.forEach(function (o) { var d = el("div"); d.appendChild(el("span", "tm", "•")); d.appendChild(el("span", null, o.text)); ob.appendChild(d); });
        root.appendChild(ob);
      }
      var lanes = el("div", "dbg-lanes");
      function lane(label, cls, grp) { var l = el("div", "dbg-lane " + (cls || "") + " " + (grp || "")), lb = el("div", "lb", label), tr = el("div", "track"); l.appendChild(lb); l.appendChild(tr); lanes.appendChild(l); return tr; }
      function add(tr, cls, left, width, fn) { var d = el("div", cls); d.style.left = pc(left); if (width != null) d.style.width = (Math.min(end, left + width - base) - Math.max(0, left - base)) / end * 100 + "%"; if (fn) fn(d); tr.appendChild(d); return d; }
      // one side: its shields, hull steps, attacks and heat, Flight Assist and the scans it made of the other
      function side(S, shift, grp, title, otherName) {
        var r = S.rec, T = r.len;
        var h = el("div", "dbg-grp " + grp, title); lanes.appendChild(h);
        var sh = lane(t("db.g.shields"), "s", grp), st = r.sh || [];
        st.forEach(function (e, i) { var e1 = i + 1 < st.length ? st[i + 1][0] : T; add(sh, "sh " + (e[1] ? "up" : "dn"), e[0] + shift, e1 - e[0], function (d) { tip(d, e[0] + shift, e[1] ? t("db.g.sh_up") : t("db.g.sh_dn") + " " + Math.round(e1 - e[0]) + " s"); }); });
        var hl = lane(t("db.g.hull"), "t2 hull", grp), svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "0 0 " + end + " 24"); svg.setAttribute("preserveAspectRatio", "none"); svg.setAttribute("class", "th");
        var pts = [(0 - 0) + ",3"], lv = 3, x0 = Math.max(0, shift - base);
        pts = [x0 + ",3"];
        (r.hull || []).forEach(function (hh) { var x = hh[0] + shift - base, y = 3 + (1 - hh[1]) / 0.8 * 18; pts.push(x + "," + lv, x + "," + y.toFixed(1)); lv = y; });
        pts.push((T + shift - base) + "," + lv.toFixed(1));
        var pl = document.createElementNS(NS, "polyline"); pl.setAttribute("points", pts.join(" ")); pl.setAttribute("class", "ln"); svg.appendChild(pl); hl.appendChild(svg);
        (r.hull || []).forEach(function (hh) { var tx = add(hl, "hv", hh[0] + shift, null); tx.textContent = Math.round(hh[1] * 100); tip(tx, hh[0] + shift, t("db.g.hull_step") + " " + Math.round(hh[1] * 100) + " %"); });
        var dg = lane(t("db.g.attacks"), "t2 dg", grp), waves = [], last = null;
        (r.atk || []).forEach(function (a) { if (last && a - last.end <= 5) { last.end = a; last.n++; } else { last = { start: a, end: a, n: 1 }; waves.push(last); } });
        waves.forEach(function (w) { add(dg, "wave", w.start + shift, null, function (d) { d.style.height = (6 + Math.min(w.n, 30)) + "px"; tip(d, w.start + shift, t("db.g.attack") + ", " + w.n + " UnderAttack"); }); });
        (r.over || []).forEach(function (o) { add(dg, "heat", o[0] + shift, o[1] - o[0], function (d) { tip(d, o[0] + shift, t("db.g.over") + " " + Math.round(o[1] - o[0]) + " s"); }); });
        (r.warn || []).forEach(function (w) { add(dg, "hw", w + shift, null, function (d) { tip(d, w + shift, t("db.g.warn")); }); });
        var fa = lane(t("db.g.fa"), "s", grp), fs = r.fa || [];
        fs.forEach(function (e, i) { var e1 = i + 1 < fs.length ? fs[i + 1][0] : T; add(fa, "seg " + (e[1] ? "off" : "on"), e[0] + shift, e1 - e[0], function (d) { tip(d, e[0] + shift, e[1] ? t("db.fa.off") + " " + Math.round(e1 - e[0]) + " s" : t("db.fa.on")); }); });
        // what this side's scans showed of the other's health (steps at each scan, nothing in between)
        var snaps = (r.tg || []).filter(function (g) { return g[4] && g[4].length; });
        if (snaps.length) {
          var en = lane(t("db.g.enemy") + " → " + otherName, "t2", grp), sv = document.createElementNS(NS, "svg");
          sv.setAttribute("viewBox", "0 0 " + end + " 22"); sv.setAttribute("preserveAspectRatio", "none"); sv.setAttribute("class", "th");
          var step = function (g, idx, cls) {
            var p = [], prev = null;
            g[4].forEach(function (s) { var v = s[idx]; if (v < 0) return; var y = (2 + (1 - v / 100) * 18).toFixed(1), x = s[0] + shift - base; if (prev !== null) p.push(x + "," + prev); p.push(x + "," + y); prev = y; });
            if (prev !== null) p.push((Math.max(g[1], g[4][g[4].length - 1][0]) + shift - base) + "," + prev);
            if (p.length > 1) { var q = document.createElementNS(NS, "polyline"); q.setAttribute("points", p.join(" ")); q.setAttribute("class", cls); sv.appendChild(q); }
          };
          snaps.forEach(function (g) { step(g, 1, "ln sh"); step(g, 2, "ln"); });
          en.appendChild(sv);
        }
        // a death on this side
        if (r.died != null) { var ev = lane(t("pvp.g.death"), "s", grp); var d = add(ev, "kill dead", r.died + shift, null, function (x) { tip(x, r.died + shift, t("pvp.g.death")); }); d.textContent = "✕"; }
      }
      side(A, 0, "ga", t("db.g.me") + " · " + A.me, B.me);
      side(B, view.bshift, "gb", B.me, A.me);
      root.appendChild(lanes);
      var ax = el("div", "dbg-axis"); ax.appendChild(el("span")); var ticks = el("div");
      for (var i = 0; i <= 4; i++) ticks.appendChild(el("span", null, mmss(end * i / 4)));
      ax.appendChild(ticks); root.appendChild(ax);
      // ---- the two builds side by side (when a file carries one)
      if (A.build || B.build) {
        var tb = el("table", "dbp-build"), hd = el("tr"); ["", A.me, B.me].forEach(function (x) { hd.appendChild(el("th", null, x)); }); tb.appendChild(hd);
        var slots = [], seen = {};
        [A.build, B.build].forEach(function (b) { ((b && b.modules) || []).forEach(function (m) { if (!seen[m.slot]) { seen[m.slot] = 1; slots.push(m.slot); } }); });
        var cell = function (b, slot) {
          var m = ((b && b.modules) || []).filter(function (x) { return x.slot === slot; })[0], td = el("td");
          if (!m) return td;
          td.appendChild(el("div", "it", m.item));
          if (m.eng && m.eng.blueprint) td.appendChild(el("div", "en", m.eng.blueprint + (m.eng.level != null ? " " + m.eng.level : "") + (m.eng.experimental ? " · " + m.eng.experimental : "")));
          return td;
        };
        slots.forEach(function (s) { var tr = el("tr"); tr.appendChild(el("td", "sl", s)); tr.appendChild(cell(A.build, s)); tr.appendChild(cell(B.build, s)); tb.appendChild(tr); });
        root.appendChild(el("h4", "dbp-h", t("pvp.g.builds"))); root.appendChild(tb);
      }
      root.appendChild(el("p", "dbg-note", t("db.g.limits")));
      root.appendChild(el("p", "dbg-note", t("db.g.notproof")));
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
