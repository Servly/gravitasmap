"use strict";
/* BGS Watch, part 9: the two main views. ATTENTION answers "which systems do I act on first?", CHANGES answers "what moved since the last snapshot?".
   Each view returns an HTML string with the finding as its title. Names come from the player's own data and are always escaped. The score and the
   reasons are worked out in bgs-calc.js (s.score2, s.E, s.R, s.edge, s.toward, s.base); here they are only drawn. */
(function () {
  var BG = window.BG, S = BG.svg, V = BG.views, esc = S.esc, t = function (k, v) { return BG.tr(k, v); };
  var f1 = function (x) { return (Math.round(x * 10) / 10).toFixed(1); };

  // the reason of one row in plain words (a drop counts as much as a low value)
  function reason(s, st) {
    var dm = s.d == null ? 0 : (s.edge === "low" ? -s.d : s.d);
    var v = { lo: st.lo, hi: st.hi, e: f1(s.E), r: f1(s.R), v: f1(s.last), d: f1(Math.abs(s.d || 0)), x: f1(Math.abs(s.toward || 0)) };
    if (s.last >= 75) return t("bgs.r2.expand", v); // the game's own line: above 75 an expansion may start
    if (s.E > 0) return t(s.edge === "low" ? (dm >= 0.1 ? "bgs.r2.low_d" : "bgs.r2.low") : (dm >= 0.1 ? "bgs.r2.high_d" : "bgs.r2.high"), v);
    if (s.edge === "low") return t(dm >= 1 ? "bgs.r2.fall" : s.toward >= 0.15 ? "bgs.r2.trend_low" : "bgs.r2.near_low", v);
    return t(dm >= 1 ? "bgs.r2.rise" : s.toward >= 0.15 ? "bgs.r2.trend_high" : "bgs.r2.near_high", v);
  }

  function axis(lo, hi, st, W, pad) {
    var x = function (v) { return pad + (v - lo) / (hi - lo) * (W - 2 * pad); }, out = "", g;
    for (g = Math.ceil(lo / 5) * 5; g <= hi; g += 5) out += '<line x1="' + x(g) + '" x2="' + x(g) + '" y1="0" y2="6" style="stroke:var(--faint);stroke-width:1"/><text x="' + x(g) + '" y="20" text-anchor="middle" style="fill:var(--faint);font-size:11px">' + g + "</text>";
    return { x: x, svg: '<svg class="bg-axis" viewBox="0 0 ' + W + ' 26" role="img" aria-label="">' + out + "</svg>" };
  }

  V.defend = function (M) {
    var st = M.st, W = 360, pad = 10;
    var rows = M.sys.filter(function (s) { return s.score2 >= 40; }).sort(function (a, b) { return b.score2 - a.score2 || a.last - b.last; }).slice(0, 10);
    var nAll = M.sys.length;
    if (!rows.length) {
      return '<section class="bg-card"><h3>' + t("bgs.d.h") + '</h3><p class="bg-find">' + t("bgs.d.none", { n: nAll, lo: st.lo, hi: st.hi }) + '</p><p class="bg-how">' + t("bgs.d.how") + "</p></section>";
    }
    var lo = 100, hi = 0;
    rows.forEach(function (s) { [s.last, s.base].forEach(function (v) { if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }); });
    lo = Math.floor(Math.min(lo - 2, st.lo - 5) / 5) * 5; hi = Math.ceil(Math.max(hi + 2, st.hi + 5) / 5) * 5;
    var ax = axis(lo, hi, st, W, pad), x = ax.x;
    var below = rows.filter(function (s) { return s.E > 0 && s.edge === "low"; }).length;
    var above = rows.filter(function (s) { return s.E > 0 && s.edge === "high"; }).length;
    var toward = rows.length - below - above;
    var html = '<section class="bg-card"><h3>' + t("bgs.d.h") + '<button class="bg-mini" data-save="1" data-tip="' + esc(t("tip.bgs.save")) + '">' + t("bgs.save") + "</button></h3>" +
      '<p class="bg-find">' + t("bgs.d.title", { n: rows.length }) + '</p><p class="bg-sub">' + t("bgs.d.sub", { lo: st.lo, hi: st.hi, a: below, b: toward, c: above }) + '</p><p class="bg-how">' + t("bgs.d.how") + "</p>" +
      '<div class="bg-dp"><div class="bg-dr bg-dh"><span></span>' + ax.svg + "<span></span></div>";
    rows.forEach(function (s) {
      var col = s.edge === "low" ? "var(--warn)" : "var(--cyan)";
      var prev = s.base != null && s.d != null && Math.abs(s.d) >= 0.05;
      var svg = '<svg viewBox="0 0 ' + W + ' 28" role="img" aria-label="' + esc(s.n + " " + f1(s.last)) + '">' +
        '<rect x="' + x(st.lo) + '" y="2" width="' + (x(st.hi) - x(st.lo)) + '" height="24" rx="3" style="fill:rgba(var(--acc-rgb),.10)"/>' +
        '<line x1="' + x(st.lo) + '" x2="' + x(st.lo) + '" y1="2" y2="26" style="stroke:var(--faint);stroke-width:1;stroke-dasharray:3 3"/><line x1="' + x(st.hi) + '" x2="' + x(st.hi) + '" y1="2" y2="26" style="stroke:var(--faint);stroke-width:1;stroke-dasharray:3 3"/>' +
        (prev ? '<line x1="' + x(s.base) + '" x2="' + x(s.last) + '" y1="14" y2="14" style="stroke:' + col + ';stroke-width:2"/><circle cx="' + x(s.base) + '" cy="14" r="4" style="fill:none;stroke:' + col + ';stroke-width:1.5"/>' : "") +
        '<circle cx="' + x(s.last) + '" cy="14" r="5.5" style="fill:' + col + '"/></svg>';
      html += '<div class="bg-dr"><span class="bg-nm"><a class="bg-sn" data-sys="' + esc(s.n) + '">' + esc(s.n) + '</a> <b class="bg-val">' + f1(s.last) + '</b></span>' + svg + '<span class="bg-why">' + esc(reason(s, st)) + "</span></div>";
    });
    return html + "</div></section>";
  };

  // CHANGES: a slope plot (before and after) of the systems that moved by a point or more, labels pushed apart
  V.changes = function (M) {
    var st = M.st, LIM = 1.0;
    var mv = M.sys.filter(function (s) { return s.d != null && Math.abs(s.d) >= LIM; });
    var dn = mv.filter(function (s) { return s.d < 0; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 8);
    var up = mv.filter(function (s) { return s.d > 0; }).sort(function (a, b) { return b.d - a.d; }).slice(0, 6);
    var all = dn.concat(up), base = V.baseLabel(M);
    if (!all.length) {
      return '<section class="bg-card"><h3>' + t("bgs.c.h") + '</h3><p class="bg-find">' + t("bgs.c.none", { x: f1(LIM), b: base }) + '</p><p class="bg-how">' + t("bgs.c.how") + "</p></section>";
    }
    var lo = 100, hi = 0;
    all.forEach(function (s) { [s.last, s.base].forEach(function (v) { lo = Math.min(lo, v); hi = Math.max(hi, v); }); });
    lo = Math.floor(Math.min(lo - 1, st.lo - 2)); hi = Math.ceil(Math.max(hi + 1, st.hi + 2));
    var H = 360, W = 900, X0 = 300, X1 = 560, top = 14, bot = 14;
    var y = function (v) { return top + (hi - v) / (hi - lo) * (H - top - bot); };
    // push the labels of one side apart (at least 14 px between two names)
    function spread(items, key) {
      var a = items.map(function (s) { return { s: s, y: y(s[key]) }; }).sort(function (p, q) { return p.y - q.y; }), i;
      for (i = 1; i < a.length; i++) if (a[i].y - a[i - 1].y < 14) a[i].y = a[i - 1].y + 14;
      return a;
    }
    var L = spread(all, "base"), R = spread(all, "last"), ly = {}, ry = {};
    L.forEach(function (o) { ly[o.s.n] = o.y; }); R.forEach(function (o) { ry[o.s.n] = o.y; });
    var out = '<rect x="' + X0 + '" y="' + y(st.hi) + '" width="' + (X1 - X0) + '" height="' + (y(st.lo) - y(st.hi)) + '" style="fill:rgba(var(--acc-rgb),.08)"/>' +
      '<text x="' + (X0 + 4) + '" y="' + (y(st.hi) + 12) + '" style="fill:var(--faint);font-size:11px">' + st.hi + '</text><text x="' + (X0 + 4) + '" y="' + (y(st.lo) - 4) + '" style="fill:var(--faint);font-size:11px">' + st.lo + "</text>" +
      '<text x="' + X0 + '" y="10" text-anchor="middle" style="fill:var(--faint);font-size:11px">' + esc(base) + '</text><text x="' + X1 + '" y="10" text-anchor="middle" style="fill:var(--faint);font-size:11px">' + t("bgs.c.now") + "</text>";
    all.forEach(function (s) {
      var col = s.d < 0 ? "var(--warn)" : "var(--cyan)";
      out += '<line x1="' + X0 + '" y1="' + y(s.base) + '" x2="' + X1 + '" y2="' + y(s.last) + '" style="stroke:' + col + ';stroke-width:2"/>' +
        '<circle cx="' + X0 + '" cy="' + y(s.base) + '" r="3.5" style="fill:' + col + '"/><circle cx="' + X1 + '" cy="' + y(s.last) + '" r="3.5" style="fill:' + col + '"/>' +
        '<text x="' + (X0 - 8) + '" y="' + (ly[s.n] + 4) + '" text-anchor="end" style="fill:var(--text);font-size:12px">' + esc(s.n) + " " + f1(s.base) + '</text>' +
        '<text x="' + (X1 + 8) + '" y="' + (ry[s.n] + 4) + '" style="fill:' + col + ';font-size:12px;font-weight:600">' + f1(s.last) + " " + (s.d < 0 ? "▼ " : "▲ ") + f1(Math.abs(s.d)) + " " + esc(s.n) + "</text>";
    });
    var nd = mv.filter(function (s) { return s.d < 0; }).length, nu = mv.length - nd;
    return '<section class="bg-card"><h3>' + t("bgs.c.h") + '<button class="bg-mini" data-save="1" data-tip="' + esc(t("tip.bgs.save")) + '">' + t("bgs.save") + "</button></h3>" +
      '<p class="bg-find">' + t("bgs.c.title", { n: nd, m: nu, x: f1(LIM), b: base }) + '</p><p class="bg-how">' + t("bgs.c.how") + "</p>" +
      '<svg class="bg-slope" viewBox="0 0 ' + W + " " + (H + 24) + '" role="img" aria-label="">' + out + "</svg></section>";
  };
  V.overview = function (M, ui) { return V.heat(M, ui); };
})();
