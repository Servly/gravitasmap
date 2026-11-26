"use strict";
/* BGS Watch, part 9: the chart views the owner chose from the demos (26 Nov 2026).
   ATTENTION (V.defend): three groups with the reason of each system.  CHANGES: diverging bars since the comparison snapshot.
   OVERVIEW: a heat map of the change since the snapshot before, systems by snapshots.  TRENDS: small multiples.  SQUAD: systems below, inside and above your range.
   Falls are red, rises are green, always with an arrow and a sign. Every mark has a tip with the system, the time (UTC, to the minute) and the value.
   The score and the numbers come from bgs-calc.js (s.score2, s.E, s.R, s.edge, s.toward, s.d, s.lastChg). Names are the player's own data and are always escaped. */
(function () {
  var BG = window.BG, C = BG.calc, V = BG.views, S = BG.svg, esc = S.esc, t = function (k, v) { return BG.tr(k, v); };
  var RED = "var(--bad)", GREEN = "var(--good)", AMBER = "var(--warn)", FAINT = "var(--faint)";
  var f1 = function (x) { return (Math.round(x * 10) / 10).toFixed(1); };
  var sg = function (x) { return (x > 0.04 ? "+" : x < -0.04 ? "−" : "") + f1(Math.abs(x)); };
  var arrow = function (x) { return x > 0.04 ? "▲" : x < -0.04 ? "▼" : "•"; };
  var cls = function (x) { return x > 0.04 ? "bg-rise" : x < -0.04 ? "bg-fall" : ""; };
  var col = function (x) { return x > 0.04 ? GREEN : x < -0.04 ? RED : FAINT; };
  var tip = function (s) { return ' data-tip="' + esc(s) + '"'; };
  var when = function (ms) { return C.dt(ms) + " UTC"; };
  function need2(M) { return M.nS < 2; }
  function needMsg() { return '<section class="bg-card"><p class="bg-find">' + t("bgs.need2") + "</p></section>"; }

  // the reason of one system in plain words (a fall counts as much as a low value)
  function reason(s, st) {
    var dm = s.d == null ? 0 : (s.edge === "low" ? -s.d : s.d);
    var v = { lo: st.lo, hi: st.hi, e: f1(s.E), r: f1(s.R), v: f1(s.last), d: f1(Math.abs(s.d || 0)), x: f1(Math.abs(s.toward || 0)) };
    if (s.last >= 75) return t("bgs.r2.expand", v);
    if (s.E > 0) return t(s.edge === "low" ? (dm >= 0.1 ? "bgs.r2.low_d" : "bgs.r2.low") : (dm >= 0.1 ? "bgs.r2.high_d" : "bgs.r2.high"), v);
    if (s.edge === "low") return t(dm >= 1 ? "bgs.r2.fall" : s.toward >= 0.15 ? "bgs.r2.trend_low" : "bgs.r2.near_low", v);
    return t(dm >= 1 ? "bgs.r2.rise" : s.toward >= 0.15 ? "bgs.r2.trend_high" : "bgs.r2.near_high", v);
  }
  // the steps inside one column (daily view): when each change happened, as the two readings it fell between
  function stepsText(s, k) {
    var st = s.steps && s.steps[k]; if (!st || !st.length) return "";
    return "\n" + st.map(function (x) { return t("bgs.tp.step", { a: when(x.a), b: when(x.b), d: sg(x.d) }); }).join("\n");
  }
  function lastChg(M, s) { return s.lastChg ? t("bgs.tp.lastchg", { a: when(s.lastChg.a), b: when(s.lastChg.b) }) : t("bgs.tp.nochg"); }
  V.reason = reason;

  // ---------- ATTENTION: three groups ----------
  V.defend = function (M) {
    var st = M.st, all = M.sys.filter(function (s) { return s.score2 >= 48; }).sort(function (a, b) { return b.score2 - a.score2 || a.last - b.last; }).slice(0, 30);
    var low = all.filter(function (s) { return s.E > 0 && s.edge === "low"; }), high = all.filter(function (s) { return s.E > 0 && s.edge === "high"; }), close = all.filter(function (s) { return s.E === 0; });
    var base = V.baseLabel(M);
    if (!all.length) return '<section class="bg-card"><h3>' + t("bgs.d.h") + '</h3><p class="bg-find">' + t("bgs.d.none", { n: M.sys.length, lo: st.lo, hi: st.hi }) + "</p></section>";
    function group(title, tone, list, tipKey) {
      if (!list.length) return "";
      var h = '<div class="bg-grp"><b><span class="bg-tag ' + tone + '"' + tip(t(tipKey, { lo: st.lo, hi: st.hi })) + ">" + title + " · " + list.length + '</span></b><table class="bg-tbl"><tr><th>' + t("bgs.c.system") + "</th><th>" + t("bgs.dt.now") + "</th><th>" + t("bgs.g.change", { b: base }) + "</th><th>" + t("bgs.g.why") + "</th></tr>";
      list.slice(0, 15).forEach(function (s) {
        var tp = s.n + " · " + f1(s.last) + (s.d == null ? "" : " (" + sg(s.d) + " " + t("bgs.g.since", { b: base }) + ")") + "\n" + lastChg(M, s) + (s.slope ? "\n" + t("bgs.g.perday", { x: sg(s.slope.perDay) }) : "");
        h += "<tr" + tip(tp) + '><td><a class="bg-sn" data-sys="' + esc(s.n) + '">' + esc(s.n) + '</a></td><td class="n"><b>' + f1(s.last) + '</b></td><td class="n ' + cls(s.d || 0) + '">' + (s.d == null ? "–" : arrow(s.d) + " " + sg(s.d)) + '</td><td class="bg-why">' + esc(reason(s, st)) + "</td></tr>";
      });
      return h + "</table></div>";
    }
    return '<section class="bg-card"><h3>' + t("bgs.d.h") + '</h3><p class="bg-find">' + t("bgs.d.title", { n: all.length }) + '</p><p class="bg-sub">' + t("bgs.d.sub", { lo: st.lo, hi: st.hi, a: low.length, b: close.length, c: high.length }) + '</p><p class="bg-how">' + t("bgs.d.how2", { b: base }) + "</p>" +
      group(t("bgs.g.low"), "r", low, "tip.bgs.z.low") + group(t("bgs.g.close"), "a", close, "tip.bgs.g.close") + group(t("bgs.g.high"), "a", high, "tip.bgs.z.high") + "</section>";
  };

  // ---------- CHANGES: diverging bars ----------
  V.changes = function (M) {
    if (need2(M)) return needMsg();
    var st = M.st, LIM = Math.max(0.5, st.minor || 0.3), base = V.baseLabel(M);
    var mv = M.sys.filter(function (s) { return s.d != null && Math.abs(s.d) >= LIM; }).sort(function (a, b) { return a.d - b.d; });
    var dn = mv.filter(function (s) { return s.d < 0; }), up = mv.filter(function (s) { return s.d > 0; });
    var rows = dn.slice(0, 15).concat(up.slice(-15));
    if (!rows.length) return '<section class="bg-card"><h3>' + t("bgs.c.h") + '</h3><p class="bg-find">' + t("bgs.c.none", { x: f1(LIM), b: base }) + "</p></section>";
    var W = 760, RH = 24, top = 34, H = top + rows.length * RH + 26, mx = Math.max.apply(null, rows.map(function (s) { return Math.abs(s.d); })) + 0.4, X0 = 400, sc = 220 / mx, o = "", g;
    for (g = -Math.floor(mx); g <= Math.floor(mx); g++) o += '<line x1="' + (X0 + g * sc) + '" x2="' + (X0 + g * sc) + '" y1="' + (top - 8) + '" y2="' + (H - 20) + '" style="stroke:' + (g === 0 ? "var(--faint)" : "var(--line)") + '"/><text class="bg-ax" x="' + (X0 + g * sc) + '" y="' + (H - 6) + '" text-anchor="middle">' + (g > 0 ? "+" : g < 0 ? "−" : "") + Math.abs(g) + "</text>";
    o += '<text class="bg-ax" x="' + X0 + '" y="16" text-anchor="middle">' + t("bgs.c.axis", { b: base }) + "</text>";
    rows.forEach(function (s, i) {
      var y = top + i * RH + 12, c = col(s.d), x2 = X0 + s.d * sc, bt = M.snaps[s.bi] ? M.snaps[s.bi].t : null;
      var tp = s.n + "\n" + f1(s.base) + " → " + f1(s.last) + " (" + sg(s.d) + ")\n" + (bt ? when(bt) + " → " : "") + when(M.snaps[s.li].t) + "\n" + lastChg(M, s);
      o += '<g data-sys="' + esc(s.n) + '"' + tip(tp) + ' class="bg-hit"><rect x="0" y="' + (y - 11) + '" width="' + W + '" height="22" fill="transparent"/><text x="10" y="' + (y + 4) + '">' + esc(s.n) + "</text>" +
        '<rect x="' + Math.min(X0, x2) + '" y="' + (y - 8) + '" width="' + Math.max(1, Math.abs(x2 - X0)) + '" height="16" rx="3" style="fill:' + c + ';opacity:.9"/>' +
        '<text x="' + (s.d < 0 ? x2 - 8 : x2 + 8) + '" y="' + (y + 4) + '" text-anchor="' + (s.d < 0 ? "end" : "start") + '" style="fill:' + c + ';font-weight:600">' + arrow(s.d) + " " + sg(s.d) + "</text>" +
        '<text class="bg-ax" x="' + (W - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + f1(s.base) + " → " + f1(s.last) + "</text></g>";
    });
    return '<section class="bg-card"><h3>' + t("bgs.c.h") + '<button class="bg-mini" data-save="1"' + tip(t("tip.bgs.save")) + ">" + t("bgs.save") + "</button></h3>" +
      '<p class="bg-find">' + t("bgs.c.title2", { n: dn.length, m: up.length, x: f1(LIM), b: base }) + '</p><p class="bg-how">' + t("bgs.c.how2") + '</p><svg class="bg-chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="">' + o + "</svg></section>";
  };

  // ---------- OVERVIEW: change heat map ----------
  V.overview = function (M) {
    if (need2(M)) return needMsg();
    var st = M.st, minor = Math.max(0.3, st.minor || 0.3), ord = M.sys.slice().sort(function (a, b) { return a.last - b.last; });
    var n = M.K - M.first + 1, L = 200, RH = 13, CH = 86, W = 900, cw = Math.max(6, Math.min(24, Math.floor((W - L - 10) / n))), H = CH + ord.length * RH + 6, o = "", k;
    var every = Math.max(1, Math.ceil(13 / cw));   // a vertical label needs about 13 px of width
    for (k = M.first; k <= M.K; k++) {
      if ((k - M.first) % every && k !== M.K) continue;
      var lx = L + (k - M.first) * cw + cw / 2 + 4;
      o += '<text class="bg-ax" transform="rotate(-90 ' + lx + " " + (CH - 6) + ')" x="' + lx + '" y="' + (CH - 6) + '"' + tip(when(M.snaps[k].t)) + ">" + esc(C.dt(M.snaps[k].t)) + (M.snaps[k].n > 1 ? " ×" + M.snaps[k].n : "") + "</text>";
    }
    ord.forEach(function (s, ri) {
      var y = CH + ri * RH;
      o += '<text class="bg-ax" x="' + (L - 8) + '" y="' + (y + 10) + '" text-anchor="end" style="fill:var(--text)" data-sys="' + esc(s.n) + '">' + esc(s.n) + "</text>";
      for (k = M.first; k <= M.K; k++) {
        var v = s.v[k], pv = null, j; for (j = k - 1; j >= M.first; j--) if (s.v[j] != null) { pv = s.v[j]; break; }
        var dd = v != null && pv != null ? Math.round((v - pv) * 10) / 10 : null, c, x = L + (k - M.first) * cw;
        if (v == null) c = "transparent"; else if (dd == null || Math.abs(dd) < minor) c = "rgba(255,255,255,.07)"; else c = (dd > 0 ? "rgba(var(--good-rgb)," : "rgba(var(--bad-rgb),") + Math.min(1, 0.3 + Math.abs(dd) / 3).toFixed(2) + ")";
        var tp = s.n + "\n" + when(M.snaps[k].t) + (M.snaps[k].n > 1 ? "\n" + t("bgs.tp.snaps", { n: M.snaps[k].n }) : "") + "\n" + (v == null ? t("bgs.tp.noread") : f1(v) + (dd == null ? "" : " (" + sg(dd) + ")")) + stepsText(s, k);
        o += '<rect x="' + x + '" y="' + y + '" width="' + (cw - 1) + '" height="' + (RH - 1) + '" style="fill:' + c + '" data-sys="' + esc(s.n) + '"' + tip(tp) + "/>";
      }
    });
    var outN = M.sys.filter(function (s) { return s.zone !== "in"; }).length;
    return '<section class="bg-card"><h3>' + t("bgs.o.h") + '<button class="bg-mini" data-save="1"' + tip(t("tip.bgs.save")) + ">" + t("bgs.save") + "</button></h3>" +
      '<p class="bg-find">' + t("bgs.o.title", { n: outN, t: M.sys.length }) + '</p><p class="bg-how">' + t("bgs.o.how", { m: f1(minor) }) + "</p>" +
      '<div class="bg-scroll"><svg class="bg-chart fixed" style="width:' + W + 'px;max-width:none" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="">' + o + "</svg></div>" +
      '<div class="bg-legend"><span><i class="bg-sw" style="background:rgba(var(--good-rgb),.8)"></i>' + t("bgs.o.rose") + '</span><span><i class="bg-sw" style="background:rgba(var(--bad-rgb),.8)"></i>' + t("bgs.o.fell") + '</span><span><i class="bg-sw" style="background:rgba(255,255,255,.12)"></i>' + t("bgs.o.same") + "</span></div></section>";
  };

  // ---------- TRENDS: small multiples ----------
  V.trends = function (M, ui) {
    if (need2(M)) return needMsg();
    var st = M.st, all = ui.tmode === "all", list = (all ? M.sys.slice().sort(function (a, b) { return a.last - b.last; }) : M.sys.slice().sort(function (a, b) { return b.score2 - a.score2; }).slice(0, 12));
    var t0 = M.snaps[M.first].t, t1 = M.snaps[M.K].t, lo = 35, hi = 80, w = 250, h = 112, o = "";
    var seg = '<div class="bg-seg" data-seg="tmode"><button data-v="top" class="' + (all ? "" : "on") + '"' + tip(t("tip.bgs.t.top")) + ">" + t("bgs.t.top") + '</button><button data-v="all" class="' + (all ? "on" : "") + '"' + tip(t("tip.bgs.t.all")) + ">" + t("bgs.t.all") + "</button></div>";
    list.forEach(function (s) {
      var X = function (tt) { return 6 + (tt - t0) / Math.max(1, t1 - t0) * (w - 12); }, Y = function (v) { return h - 18 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo) * (h - 32); }, pts = [], dots = "", k, c = col(s.d);
      for (k = M.first; k <= M.K; k++) if (s.v[k] != null) {
        pts.push(X(M.snaps[k].t).toFixed(1) + "," + Y(s.v[k]).toFixed(1));
        var pv = null, j; for (j = k - 1; j >= M.first; j--) if (s.v[j] != null) { pv = s.v[j]; break; }
        dots += '<circle cx="' + X(M.snaps[k].t).toFixed(1) + '" cy="' + Y(s.v[k]).toFixed(1) + '" r="' + (k === s.li ? 4 : 3) + '" style="fill:' + (k === s.li ? c : "var(--blue,#8aa4ff)") + ";opacity:" + (k === s.li ? 1 : 0.55) + '"' + tip(s.n + "\n" + when(M.snaps[k].t) + "\n" + f1(s.v[k]) + (pv == null ? "" : " (" + sg(s.v[k] - pv) + ")")) + "/>";
      }
      o += '<div class="bg-mt"><div class="bg-mt-h"><a class="bg-sn" data-sys="' + esc(s.n) + '">' + esc(s.n) + '</a> <b class="' + cls(s.d || 0) + '">' + f1(s.last) + (s.d == null ? "" : " " + arrow(s.d) + " " + sg(s.d)) + '</b></div><svg viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="">' +
        '<rect x="0" y="' + Y(st.hi) + '" width="' + w + '" height="' + (Y(st.lo) - Y(st.hi)) + '" style="fill:rgba(var(--acc-rgb),.10)"/><line x1="0" x2="' + w + '" y1="' + Y(75) + '" y2="' + Y(75) + '" style="stroke:' + AMBER + ';stroke-dasharray:2 4;opacity:.7"/>' +
        '<polyline points="' + pts.join(" ") + '" fill="none" style="stroke:var(--blue,#8aa4ff);stroke-width:1.8"/>' + dots + '<text class="bg-ax" x="2" y="' + (h - 3) + '">' + C.dmy(t0) + '</text><text class="bg-ax" x="' + (w - 2) + '" y="' + (h - 3) + '" text-anchor="end">' + C.dmy(t1) + "</text></svg></div>";
    });
    return '<section class="bg-card"><h3>' + t("bgs.t.h") + "</h3>" + seg + '<p class="bg-find">' + t("bgs.t.find", { n: list.length, d: Math.max(1, Math.round((t1 - t0) / 864e5)) }) + '</p><p class="bg-how">' + t("bgs.t.how") + '</p><div class="bg-mtg">' + o + "</div></section>";
  };

  // ---------- SQUAD: systems below, inside and above the range over time ----------
  V.squad = function (M) {
    if (need2(M)) return needMsg();
    var t0 = M.snaps[M.first].t, t1 = M.snaps[M.K].t, W = 760, H = 240, Lp = 40, R = 10, T = 14, B = 28, N = M.sys.length, cnt = [], k;
    var X = function (tt) { return Lp + (tt - t0) / Math.max(1, t1 - t0) * (W - Lp - R); }, Y = function (c) { return T + (1 - c / N) * (H - T - B); };
    for (k = M.first; k <= M.K; k++) cnt.push({ k: k, t: M.snaps[k].t, z: M.fleet[k].z, n: M.fleet[k].n });
    function area(f0, f1_, c) { var a = [], b = []; cnt.forEach(function (p) { a.push(X(p.t).toFixed(1) + "," + Y(f1_(p.z)).toFixed(1)); b.unshift(X(p.t).toFixed(1) + "," + Y(f0(p.z)).toFixed(1)); }); return '<polygon points="' + a.concat(b).join(" ") + '" style="fill:' + c + '"/>'; }
    var o = area(function () { return 0; }, function (z) { return z.low; }, "rgba(var(--bad-rgb),.75)") + area(function (z) { return z.low; }, function (z) { return z.low + z.in; }, "rgba(var(--acc-rgb),.22)") + area(function (z) { return z.low + z.in; }, function () { return N; }, "rgba(var(--warn-rgb),.7)"), g;
    for (g = 0; g <= N; g += 20) o += '<text class="bg-ax" x="' + (Lp - 6) + '" y="' + (Y(g) + 4) + '" text-anchor="end">' + g + '</text><line x1="' + Lp + '" x2="' + (W - R) + '" y1="' + Y(g) + '" y2="' + Y(g) + '" style="stroke:var(--line)"/>';
    cnt.forEach(function (p, i) {
      var x0 = i ? (X(cnt[i - 1].t) + X(p.t)) / 2 : X(p.t) - 4, x1 = i < cnt.length - 1 ? (X(p.t) + X(cnt[i + 1].t)) / 2 : X(p.t) + 4;
      o += '<rect x="' + x0.toFixed(1) + '" y="' + T + '" width="' + Math.max(2, x1 - x0).toFixed(1) + '" height="' + (H - T - B) + '" fill="transparent"' + tip(when(p.t) + "\n" + t("bgs.s.tip", { a: p.z.low, b: p.z.in, c: p.z.high })) + "/>";
    });
    o += '<text class="bg-ax" x="' + Lp + '" y="' + (H - 8) + '">' + C.dmy(t0) + '</text><text class="bg-ax" x="' + (W - R) + '" y="' + (H - 8) + '" text-anchor="end">' + C.dmy(t1) + "</text>";
    var now = cnt[cnt.length - 1].z, first = cnt[0].z;
    return '<section class="bg-card"><h3>' + t("bgs.s.h") + '<button class="bg-mini" data-save="1"' + tip(t("tip.bgs.save")) + ">" + t("bgs.save") + "</button></h3>" +
      '<p class="bg-find">' + t("bgs.s.find", { a: now.low, b: now.in, c: now.high, fa: first.low, fb: first.in, fc: first.high }) + '</p><p class="bg-how">' + t("bgs.s.how") + '</p><svg class="bg-chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="">' + o + "</svg>" +
      '<div class="bg-legend"><span><i class="bg-sw" style="background:rgba(var(--bad-rgb),.75)"></i>' + t("bgs.s.low") + '</span><span><i class="bg-sw" style="background:rgba(var(--acc-rgb),.4)"></i>' + t("bgs.s.in") + '</span><span><i class="bg-sw" style="background:rgba(var(--warn-rgb),.7)"></i>' + t("bgs.s.high") + "</span></div></section>";
  };
})();
