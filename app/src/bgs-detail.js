"use strict";
/* BGS Watch, part 6: the system drawer (opens from any system name): line chart with both band edges and the tick gaps, numbers, snapshot table. */
(function () {
  var BG = window.BG, S = BG.svg, C = BG.calc, COL = S.COL, V = BG.views, esc = S.esc, t = function (k, v) { return BG.tr(k, v); };
  V.detail = function (M, name) {
    var s = M.sys.filter(function (x) { return x.n === name; })[0]; if (!s) return "";
    var w = 440, h = 200, i, o = "", Y = [Infinity, -Infinity], t0 = M.snaps[M.first].t, t1 = M.snaps[M.K].t, lo = M.st.lo, hi = M.st.hi;
    s.v.forEach(function (v, k) { if (v != null && k >= M.first) { Y[0] = Math.min(Y[0], v); Y[1] = Math.max(Y[1], v); } });
    Y[0] = Math.floor(Math.min(Y[0], lo) - 2); Y[1] = Math.ceil(Math.max(Y[1], hi) + 2);
    var X = function (tt) { return 34 + (tt - t0) / Math.max(1, t1 - t0) * (w - 46); }, Yp = function (v) { return h - 26 - (v - Y[0]) / (Y[1] - Y[0]) * (h - 40); };
    o += S.R(34, Yp(hi), w - 46, Yp(lo) - Yp(hi), COL.band);
    M.ticks.iv.forEach(function (x) { if (x.kind === "tick" && x.a >= t0) o += S.R(X(x.a), 8, Math.max(2, X(x.b) - X(x.a)), h - 34, COL.accA(.08), { extra: ' data-tip="' + esc(t("bgs.dt.tick", { p: x.pct.toFixed(0) })) + '"' }); });
    [lo, hi].forEach(function (g) { o += S.L(34, Yp(g), w - 12, Yp(g), g === lo ? COL.badA(.5) : COL.warnA(.4), { dash: "3 3" }) + S.T(30, Yp(g) + 3, String(g), { anchor: "end", size: 9.5, fill: COL.faint }); });
    var pts = [], seg = [];
    for (i = M.first; i <= M.K; i++) { if (s.v[i] == null) { if (seg.length) pts.push(seg); seg = []; } else seg.push([X(M.snaps[i].t), Yp(s.v[i]), i]); }
    if (seg.length) pts.push(seg);
    pts.forEach(function (sg) {
      if (sg.length > 1) o += '<polyline fill="none" stroke="' + COL.vio + '" stroke-width="1.8" points="' + sg.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") + '"/>';
      sg.forEach(function (p) { var fl = s.f[p[2]]; o += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.4" fill="' + (fl ? COL.back : p[2] === s.li ? S.dcol(s) : COL.vio) + '"' + (fl ? ' stroke="' + COL.warn + '" stroke-width="1.5"' : "") + ' data-tip="' + esc(C.dt(M.snaps[p[2]].t) + " UTC (" + C.dtl(M.snaps[p[2]].t) + ") | " + S.f1(s.v[p[2]]) + (fl ? " | " + t("bgs.accepted") : "")) + '"/>'; });
    });
    var days = Math.max(1, Math.round((t1 - t0) / 864e5)), stp = Math.max(1, Math.ceil(days / 6));
    for (var dd = 0; dd <= days; dd += stp) { var tt = t0 + dd * 864e5; o += S.T(X(tt), h - 8, C.dmy(tt), { anchor: "middle", size: 9.5, fill: COL.faint }); }
    var edgeSince = null, edgeZone = s.zone; for (i = s.li; i >= 0; i--) { var vv = s.v[i]; if (vv != null && (edgeZone === "low" ? vv < lo : edgeZone === "high" ? vv > hi : false)) edgeSince = i; else if (vv != null) break; }
    var vs = s.v.filter(function (v) { return v != null; });
    var stat = [[t("bgs.dt.now"), S.f1(s.last)], [t("bgs.dt.change"), s.d == null ? t("bgs.dt.none") : S.sg(s.d)], [t("bgs.dt.run"), s.run ? t(s.run.sign > 0 ? "bgs.dt.runup" : "bgs.dt.rundn", { n: s.run.n, tot: S.sg(s.run.tot) }) : t("bgs.dt.none")],
      [t("bgs.dt.trend"), s.slope ? S.sg(s.slope.perDay) + t("bgs.perday") + " (" + t("bgs.est") + ")" : t("bgs.needmore")], [t("bgs.dt.room", { lo: lo }), S.sg(s.last - lo)], [t("bgs.dt.room", { lo: hi }), S.sg(hi - s.last)],
      [t("bgs.dt.lowhigh"), S.f1(Math.min.apply(0, vs)) + " / " + S.f1(Math.max.apply(0, vs))], [t("bgs.dt.step"), s.vol == null ? t("bgs.needmore") : "+/-" + s.vol.toFixed(1)],
      [t(edgeZone === "high" ? "bgs.dt.abovesince" : "bgs.dt.belowsince"), edgeSince == null ? t("bgs.no") : t("bgs.dt.since", { d: C.dt(M.snaps[edgeSince].t) })]];
    var tb = '<table class="bg-t sm"><thead><tr><th>' + t("bgs.dt.snap") + '</th><th class="r">' + t("bgs.dt.val") + '</th><th class="r">' + t("bgs.c.chg") + "</th><th></th></tr></thead><tbody>" + s.v.map(function (v, k) { return [v, k]; }).filter(function (p) { return p[1] >= M.first; }).reverse().map(function (p) {
      var v = p[0], k = p[1], prev = null, j; for (j = k - 1; j >= 0; j--) if (s.v[j] != null) { prev = s.v[j]; break; }
      var d = v == null || prev == null ? null : Math.round((v - prev) * 10) / 10, cls = d == null || Math.abs(d) < .05 ? "bg-fl" : Math.abs(d) < M.st.minor ? (d > 0 ? "bg-upm" : "bg-dnm") : d > 0 ? "bg-up" : "bg-dn";
      return "<tr><td title=\"" + esc(C.dtl(M.snaps[k].t)) + "\">" + C.dt(M.snaps[k].t) + (M.snaps[k].complete ? "" : ' <i class="bg-wf" data-tip="' + esc(t("tip.bgs.incomplete", { n: M.snaps[k].missing })) + '">!</i>') + '</td><td class="r">' + (v == null ? '<span class="bg-fl">' + t("bgs.dt.notread") + "</span>" : "<b>" + S.f1(v) + "</b>") + '</td><td class="r ' + cls + '">' + (d == null ? "" : Math.abs(d) < .05 ? "0.0" : S.sg(d)) + '</td><td class="bg-fl">' + (s.f[k] === "w" ? t("bgs.dt.acc") : s.f[k] === "e" ? t("bgs.dt.typed") : "") + "</td></tr>";
    }).join("") + "</tbody></table>";
    return '<div class="bg-dh"><div><div class="bg-eye">' + t("bgs.dt.system") + "</div><h2>" + esc(s.n) + '</h2></div><button class="bg-mini" data-close="1" data-tip="' + esc(t("tip.bgs.close")) + '">' + t("bgs.close") + "</button></div>" +
      '<div class="bg-dv"><b>' + S.f1(s.last) + "</b> " + (s.d == null ? "" : '<span class="' + (s.dir > 0 ? "bg-up" : s.dir < 0 ? "bg-dn" : "bg-fl") + '">' + S.arrow(s.d, s.tier) + " " + S.sg(s.d) + "</span>") + " " + V.zchip(s, M) + "</div>" +
      (M.nS < 2 ? V.need(t("bgs.dt.one")) : S.svg(w, h, o, 'id="dsvg"')) + (M.nS < 2 ? "" : '<div class="bg-note">' + t("bgs.dt.note") + "</div>") +
      '<div class="bg-stat">' + stat.map(function (r) { return "<div><span>" + r[0] + "</span><b>" + r[1] + "</b></div>"; }).join("") + "</div>" + (s.why.length ? '<div class="bg-why2">' + esc(s.why.join(", ")) + "</div>" : "") + tb;
  };
})();
