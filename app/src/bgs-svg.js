"use strict";
/* BGS Watch, part 2: chart pieces. Every function returns an SVG string. Colours are theme variables (var(--x)); "Save picture" turns them into real colours first. */
(function () {
  var BG = window.BG, C = BG.calc;
  var COL = { good: "var(--good)", bad: "var(--bad)", warn: "var(--warn)", dim: "var(--dim)", faint: "var(--faint)", txt: "var(--text)", vio: "var(--violet)", cyan: "var(--cyan)", acc: "var(--accent)",
    line: "rgba(var(--vi-rgb),.28)", grid: "rgba(var(--vi-rgb),.12)", band: "rgba(var(--vi-rgb),.10)", back: "var(--win1)", ink: "var(--win2)",
    goodA: function (a) { return "rgba(var(--good-rgb)," + a + ")"; }, badA: function (a) { return "rgba(var(--bad-rgb)," + a + ")"; }, warnA: function (a) { return "rgba(var(--warn-rgb)," + a + ")"; }, viA: function (a) { return "rgba(var(--vi-rgb)," + a + ")"; }, accA: function (a) { return "rgba(var(--acc-rgb)," + a + ")"; }, cyA: function (a) { return "rgba(var(--cy-rgb)," + a + ")"; } };
  var FONT = "Segoe UI,system-ui,sans-serif";
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  // 0.9.52: "(Pop: 316,782)" next to a system's name, from Spansh (BG.popMap is filled by bgs-ui.js from the app's saved answer; empty = nothing is shown)
  BG.popMap = BG.popMap || {};
  BG.popHtml = function (n) {
    var v = BG.popMap[String(n).toLowerCase()];
    if (v == null) return "";
    var txt; try { txt = Number(v).toLocaleString(BG.lang || "en"); } catch (e) { txt = String(v); }
    return ' <span class="bg-pop">(' + BG.tr("bgs.pop", { n: txt }) + ")</span>";
  };
  function f1(x) { return x == null ? "" : (Math.round(x * 10) / 10).toFixed(1); }
  function sg(x) { return x == null ? "" : (x > 0 ? "+" : x < 0 ? "-" : "") + Math.abs(Math.round(x * 10) / 10).toFixed(1); }
  function arrow(d, tier) { return tier === "flat" || d == null ? "=" : d > 0 ? "▲" : "▼"; }
  function dcol(s) { return s.tier === "flat" || s.tier === "na" ? COL.faint : s.dir > 0 ? COL.good : COL.bad; }
  function T(x, y, txt, o) {
    o = o || {};
    return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" fill="' + (o.fill || COL.dim) + '" font-size="' + (o.size || 11) + '" font-family="' + FONT + '"' +
      (o.anchor ? ' text-anchor="' + o.anchor + '"' : "") + (o.w ? ' font-weight="' + o.w + '"' : "") + (o.mid ? ' dominant-baseline="middle"' : "") + '>' + esc(txt) + '</text>';
  }
  function svg(w, h, inner, attrs) { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '" ' + (attrs || "") + '>' + inner + '</svg>'; }
  function R(x, y, w, h, fill, o) { o = o || {}; return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + Math.max(0, w).toFixed(1) + '" height="' + Math.max(0, h).toFixed(1) + '" fill="' + fill + '"' + (o.rx ? ' rx="' + o.rx + '"' : "") + (o.stroke ? ' stroke="' + o.stroke + '" stroke-width="' + (o.sw || 1) + '"' + (o.dash ? ' stroke-dasharray="' + o.dash + '"' : "") : "") + (o.extra || "") + '/>'; }
  function L(x1, y1, x2, y2, col, o) { o = o || {}; return '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="' + col + '" stroke-width="' + (o.w || 1) + '"' + (o.dash ? ' stroke-dasharray="' + o.dash + '"' : "") + '/>'; }
  function dom(M) {                                     // one y range for every small chart, so tiles can be compared
    var lo = M.st.lo - 5, hi = M.st.hi + 5;
    M.sys.forEach(function (s) { s.v.forEach(function (x) { if (x != null) { lo = Math.min(lo, x); hi = Math.max(hi, x); } }); });
    return [Math.floor(lo / 5) * 5, Math.ceil(hi / 5) * 5];
  }
  // a tiny history: true time on x, shared y, the band behind, dots are the real readings, hollow dot = accepted after a warning or typed
  function spark(s, M, w, h, o) {
    o = o || {}; var Y = o.y || dom(M), pad = o.pad == null ? 3 : o.pad, i0 = M.first, t0 = M.snaps[i0].t, t1 = M.snaps[M.K].t, sp = Math.max(1, t1 - t0);
    var X = function (t) { return pad + (t - t0) / sp * (w - 2 * pad); }, Yp = function (v) { return h - pad - (v - Y[0]) / (Y[1] - Y[0]) * (h - 2 * pad); };
    var out = R(0, Yp(M.st.hi), w, Yp(M.st.lo) - Yp(M.st.hi), COL.band);
    out += L(0, Yp(M.st.lo), w, Yp(M.st.lo), COL.badA(.35), { dash: "2 3" }) + L(0, Yp(M.st.hi), w, Yp(M.st.hi), COL.warnA(.35), { dash: "2 3" });
    var seg = [], cur = [], i;
    for (i = i0; i <= M.K; i++) { if (s.v[i] == null) { if (cur.length) seg.push(cur); cur = []; } else cur.push([X(M.snaps[i].t), Yp(s.v[i]), i]); }
    if (cur.length) seg.push(cur);
    seg.forEach(function (c) { if (c.length > 1) out += '<polyline points="' + c.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") + '" fill="none" stroke="' + (o.line || COL.vio) + '" stroke-width="1.5" stroke-linejoin="round"/>'; });
    seg.forEach(function (c) { c.forEach(function (p) {
      var last = p[2] === s.li, fl = s.f[p[2]], big = last ? 3 : 1.6;
      out += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + big + '" fill="' + (fl ? COL.back : last ? dcol(s) : COL.vio) + '"' + (fl ? ' stroke="' + COL.warn + '" stroke-width="1.4"' : "") + '/>';
    }); });
    return svg(w, h, out, 'class="sp"');
  }
  // bullet: where the value sits against the band, with the earlier reading as a tick
  function bullet(s, M, w, h) {
    var Y = dom(M), X = function (v) { return 2 + (v - Y[0]) / (Y[1] - Y[0]) * (w - 4); }, m = h / 2, bh = Math.round(h * .42);
    var zc = s.zone === "low" ? COL.bad : s.zone === "high" ? COL.warn : COL.cyan;
    var o = R(2, m - h * .36, w - 4, h * .72, "rgba(255,255,255,.04)", { rx: 3 }) + R(X(M.st.lo), m - h * .36, X(M.st.hi) - X(M.st.lo), h * .72, COL.viA(.16));
    o += R(2, m - bh / 2, X(s.last) - 2, bh, zc, { rx: 2, extra: ' opacity=".85"' });
    if (s.base != null) o += L(X(s.base), m - h * .4, X(s.base), m + h * .4, COL.txt, { w: 2 });
    var ax = Math.min(w - 6, X(s.last) + 5);
    if (s.slope && s.eta) o += T(ax, m + 3.5, "↘", { fill: COL.bad, size: 11 });
    else if (s.slope && s.etaH) o += T(ax, m + 3.5, "↗", { fill: COL.warn, size: 11 });
    else if (s.slope && s.rec != null) o += T(ax, m + 3.5, "↗", { fill: COL.good, size: 11 });
    else if (s.slope && s.recH != null) o += T(ax, m + 3.5, "↘", { fill: COL.good, size: 11 });
    return svg(w, h, o, 'class="bl"');
  }
  // diverging bars for the change, one shared scale, zero in the middle
  function dbar(d, tier, w, h, mx, one) {
    var m = one ? 0 : w / 2, len = d == null ? 0 : Math.abs(d) / mx * (one ? w - 2 : m - 2), col = tier === "minor" ? (d > 0 ? COL.goodA(.45) : COL.badA(.45)) : d > 0 ? COL.good : COL.bad;
    var o = L(m, 0, m, h, "rgba(255,255,255,.18)");
    if (d != null && tier !== "flat") o += R(d > 0 || one ? m : m - len, 3, Math.max(2, len), h - 6, col, { rx: 2 });
    return svg(w, h, o);
  }
  // before and after: one line per system from its earlier value to its latest value
  function slope(list, M, w, h) {
    var Y = [Math.floor(Math.min.apply(0, list.map(function (s) { return Math.min(s.base, s.last); })) - 1), Math.ceil(Math.max.apply(0, list.map(function (s) { return Math.max(s.base, s.last); })) + 1)];
    Y[0] = Math.min(Y[0], M.st.lo - 2); Y[1] = Math.max(Y[1], M.st.hi + 2);
    var xl = 150, xr = w - 150, Yp = function (v) { return 28 + (Y[1] - v) / (Y[1] - Y[0]) * (h - 44); }, o = "";
    o += R(xl - 10, Yp(M.st.hi), xr - xl + 20, Yp(M.st.lo) - Yp(M.st.hi), COL.band) + T(xr + 14, Yp(M.st.hi) + 4, BG.tr("bgs.band.label", { lo: M.st.lo, hi: M.st.hi }), { fill: COL.faint, size: 10, anchor: "start" });
    o += T(xl, 14, BG.tr("bgs.sl.before"), { anchor: "middle", fill: COL.faint }) + T(xr, 14, BG.tr("bgs.sl.now"), { anchor: "middle", fill: COL.faint });
    function place(side) {                       // push labels apart so none overlap
      var a = list.map(function (s) { return { s: s, y: Yp(side ? s.last : s.base) }; }).sort(function (p, q) { return p.y - q.y; }), i;
      for (i = 1; i < a.length; i++) if (a[i].y - a[i - 1].y < 12) a[i].y = a[i - 1].y + 12;
      return a;
    }
    list.forEach(function (s) { o += '<line x1="' + xl + '" y1="' + Yp(s.base).toFixed(1) + '" x2="' + xr + '" y2="' + Yp(s.last).toFixed(1) + '" stroke="' + dcol(s) + '" stroke-width="' + (s.tier === "minor" ? 1.2 : 2.2) + '" data-sys="' + esc(s.n) + '" style="cursor:pointer"/>'; });
    place(0).forEach(function (p) { o += T(xl - 10, p.y + 4, p.s.n + "  " + f1(p.s.base), { anchor: "end", size: 11, fill: COL.dim }); });
    place(1).forEach(function (p) { o += T(xr + 10, p.y + 4, f1(p.s.last) + "  " + sg(p.s.d), { anchor: "start", size: 11, fill: dcol(p.s), w: 700 }); });
    return svg(w, h, o, 'class="sl"');
  }
  BG.svg = { COL: COL, esc: esc, f1: f1, sg: sg, arrow: arrow, dcol: dcol, T: T, svg: svg, R: R, L: L, dom: dom, spark: spark, bullet: bullet, dbar: dbar, slope: slope };
})();
