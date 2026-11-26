"use strict";
/* BGS Watch, part 4: Heat strip and Fleet (zones over time, median and spread, distribution). */
(function () {
  var BG = window.BG, S = BG.svg, C = BG.calc, COL = S.COL, V = BG.views, card = V.card, need = V.need, esc = S.esc, seg = V.seg, t = function (k, v) { return BG.tr(k, v); };
  var H = 36e5;

  V.heat = function (M, ui) {
    if (M.nS < 2) return card(t("bgs.heat.h"), need(t("bgs.heat.need")), { q: t("bgs.heat.q0") });
    var i, nameW = 140, rh = 15, top = 40, cw = Math.min(64, Math.floor(880 / (M.K - M.first + 1))), x = nameW, xs = {};
    for (i = M.first; i <= M.K; i++) { if (i > M.first && M.snaps[i].t - M.snaps[i - 1].t > 36 * H) x += 12; xs[i] = x; x += cw; }
    var W = x + 8, so = ui.hsort, mode = ui.hmode, lo = M.st.lo, hi = M.st.hi;
    var a = M.sys.slice().sort(so === "name" ? function (p, q) { return p.n < q.n ? -1 : 1; } : so === "move" ? function (p, q) { return (p.d == null ? 0 : p.d) - (q.d == null ? 0 : q.d); } : so === "vol" ? function (p, q) { return (q.vol || 0) - (p.vol || 0); } : so === "trend" ? function (p, q) { return (p.slope ? p.slope.perDay : 0) - (q.slope ? q.slope.perDay : 0); } : function (p, q) { return p.last - q.last; });
    var Hh = top + a.length * rh + 30, o = '<defs><pattern id="bghat" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="' + COL.ink + '"/><line x1="0" y1="0" x2="0" y2="5" stroke="' + COL.faint + '" stroke-width="2"/></pattern></defs>';
    for (i = M.first; i <= M.K; i++) {
      var sn = M.snaps[i];
      o += S.T(xs[i] + cw / 2, 14, C.dml(sn.t), { anchor: "middle", size: 10, fill: COL.dim }) + S.T(xs[i] + cw / 2, 27, C.hml(sn.t), { anchor: "middle", size: 10, fill: COL.faint });
      if (!sn.complete) o += '<text x="' + (xs[i] + cw / 2) + '" y="37" fill="' + COL.warn + '" font-size="11" text-anchor="middle" font-weight="700" data-tip="' + esc(t("tip.bgs.incomplete", { n: sn.missing })) + '">!</text>';
      if (i > M.first && M.snaps[i].t - M.snaps[i - 1].t > 36 * H) o += S.T(xs[i] - 8, 37, "≈" + C.ago(M.snaps[i].t - M.snaps[i - 1].t), { anchor: "middle", size: 9, fill: COL.faint });
    }
    a.forEach(function (s, r) {
      var y = top + r * rh, last = null;
      o += '<text x="' + (nameW - 8) + '" y="' + (y + 11) + '" fill="' + COL.dim + '" font-size="11" text-anchor="end" font-family="Segoe UI,sans-serif" data-sys="' + esc(s.n) + '" style="cursor:pointer">' + esc(s.n) + "</text>";
      for (i = M.first; i <= M.K; i++) {
        var v = s.v[i], tip, fill, txt = "", tc = "rgba(255,255,255,.85)";
        if (v == null) {
          if (i < s.fi) continue;                       // the system did not exist yet: nothing is drawn
          o += S.R(xs[i], y, cw - 1, rh - 1, "url(#bghat)", { rx: 2, extra: ' data-tip="' + esc(t("tip.bgs.notread", { n: s.n })) + '"' }); continue;
        }
        var dd = last == null ? null : S.f1(v - last.v) * 1, ad = dd == null ? 0 : Math.abs(dd);
        if (mode === "chg") {
          if (dd == null) { fill = "rgba(255,255,255,.07)"; txt = S.f1(v); tc = COL.faint; }
          else if (ad < 0.05) { fill = "rgba(255,255,255,.04)"; txt = "="; tc = COL.faint; }
          else { var al = ad < M.st.minor ? .22 : Math.min(1, .45 + ad / 5); fill = (dd > 0 ? COL.goodA : COL.badA)(al.toFixed(2)); txt = S.sg(dd); tc = ad < M.st.minor ? COL.dim : COL.ink; }
        } else {
          var z = v < lo ? "low" : v > hi ? "high" : "in";
          fill = z === "low" ? COL.badA(Math.min(.9, .35 + (lo - v) / 14).toFixed(2)) : z === "high" ? COL.warnA(Math.min(.8, .25 + (v - hi) / 14).toFixed(2)) : COL.viA((.12 + (v - lo) / (hi - lo) * .3).toFixed(2));
          txt = S.f1(v); tc = z === "low" ? COL.ink : "rgba(255,255,255,.85)";
        }
        tip = s.n + " | " + C.tm(M.snaps[i].t) + " | " + S.f1(v) + (dd == null ? "" : " (" + S.sg(dd) + (last.i < i - 1 ? ", " + t("bgs.heat.since") : "") + ")") + (s.f[i] ? " | " + t("bgs.accepted") : "");
        o += S.R(xs[i], y, cw - 1, rh - 1, fill, { rx: 2, stroke: s.f[i] ? COL.warn : null, dash: s.f[i] ? "2 2" : null, extra: ' data-sys="' + esc(s.n) + '" data-tip="' + esc(tip) + '"' });
        if (cw >= 34) o += '<text x="' + (xs[i] + (cw - 1) / 2) + '" y="' + (y + 10.5) + '" fill="' + tc + '" font-size="9.5" text-anchor="middle" font-family="Segoe UI,sans-serif" pointer-events="none">' + esc(txt) + "</text>";
        last = { v: v, i: i };
      }
    });
    var fy = top + a.length * rh + 14;
    for (i = M.first; i <= M.K; i++) {                     // column totals
      var u = 0, dn = 0, lw = 0; M.sys.forEach(function (s) { var p = null, j; for (j = i - 1; j >= 0; j--) if (s.v[j] != null) { p = s.v[j]; break; } if (s.v[i] != null) { if (p != null && Math.abs(s.v[i] - p) >= 0.05) { if (s.v[i] > p) u++; else dn++; } if (s.v[i] < lo || s.v[i] > hi) lw++; } });
      o += S.T(xs[i] + cw / 2, fy, mode === "chg" ? (i === M.first ? "" : "▲" + u + " ▼" + dn) : t("bgs.heat.out", { n: lw }), { anchor: "middle", size: 9.5, fill: COL.faint });
    }
    var sg = seg("hmode", mode, [["chg", t("bgs.heat.chg")], ["lvl", t("bgs.heat.lvl")]]) + ' <span class="bg-fl">' + t("bgs.sort") + "</span> " + seg("hsort", so, [["low", t("bgs.s.lowest")], ["move", t("bgs.s.latest")], ["trend", t("bgs.s.trend")], ["vol", t("bgs.s.vol")], ["name", t("bgs.s.name")]]);
    function sw(bg, lab, extra) { return '<span><i class="bg-sw" style="background:' + bg + (extra || "") + '"></i>' + lab + "</span>"; }
    var leg = '<div class="bg-legend">' + (mode === "chg" ? sw(COL.good, t("bgs.leg.up", { m: M.st.minor })) + sw(COL.goodA(.25), t("bgs.leg.upm")) + sw("rgba(255,255,255,.08)", t("bgs.leg.same")) + sw(COL.badA(.25), t("bgs.leg.dnm")) + sw(COL.bad, t("bgs.leg.dn")) :
      sw(COL.bad, t("bgs.leg.below", { lo: lo })) + sw(COL.viA(.3), t("bgs.t.in")) + sw(COL.warn, t("bgs.leg.above", { hi: hi })));
    leg += '<span><i class="bg-sw bg-hatch"></i>' + t("bgs.leg.notread") + '</span><span><i class="bg-sw" style="border:1.5px dashed var(--warn);background:none"></i>' + t("bgs.accepted") + "</span></div>";
    return card(t("bgs.heat.h2"), sg + '<div class="bg-scroll">' + S.svg(W, Hh, o, 'id="heatsvg"') + "</div>" + leg, { save: 1, q: t("bgs.heat.q"), note: t("bgs.heat.note") });
  };

  function prevIdx(M) { var k = M.K - 1; while (k > 0 && !M.snaps[k].complete) k--; return k; }
  V.fleetMini = function (M) {
    var f = M.fleet, o = "", w = 340, h = 60;
    if (M.nS < 2) return '<div class="bg-mt-t">' + t("bgs.fm.one", { m: S.f1(f[0].med) }) + "</div>";
    var Y = S.dom(M), X = function (k) { return 6 + (k - M.first) / Math.max(1, M.K - M.first) * (w - 12); }, Yp = function (v) { return h - 4 - (v - Y[0]) / (Y[1] - Y[0]) * (h - 8); };
    o += S.R(0, Yp(M.st.hi), w, Yp(M.st.lo) - Yp(M.st.hi), COL.band);
    o += '<polyline fill="none" stroke="' + COL.cyan + '" stroke-width="1.8" points="' + f.map(function (p, k) { return k < M.first ? "" : X(k).toFixed(1) + "," + Yp(p.med).toFixed(1); }).filter(Boolean).join(" ") + '"/>';
    var p0 = f[prevIdx(M)], p1 = f[M.K];
    return '<div class="bg-mt-t">' + t("bgs.fm.t", { m: S.f1(p1.med), d: S.sg(p1.med - p0.med), lo: p1.z.low, dl: S.sg(p1.z.low - p0.z.low).replace(".0", ""), hi: p1.z.high }) + "</div>" + S.svg(w, h, o);
  };
  V.fleet = function (M) {
    if (M.nS < 2) {
      var z0 = M.fleet[0].z; return card(t("bgs.fleet.h"), need(t("bgs.fleet.one", { lo: z0.low, i: z0.in, hi: z0.high })), { q: t("bgs.fleet.mini.q") }) + V.hist(M);
    }
    var w = 600, h = 190, bw = Math.min(34, (w - 50) / (M.K - M.first + 1) - 4), o = "", i, max = M.sys.length, lo = M.st.lo, hi = M.st.hi;
    var X = function (k) { return 36 + (k - M.first) * ((w - 50) / (M.K - M.first + 1)); }, Yp = function (v) { return 8 + (1 - v / max) * (h - 36); };
    for (i = M.first; i <= M.K; i++) {
      var z = M.fleet[i].z, x = X(i), acc = 0;
      [["low", COL.bad], ["in", COL.viA(.55)], ["high", COL.warn]].forEach(function (sgm) { var c = z[sgm[0]], yy = Yp(acc + c); o += S.R(x, yy, bw, Yp(acc) - yy, sgm[1], { extra: ' data-tip="' + esc(C.tm(M.snaps[i].t) + " | " + t("bgs.fl.tip", { lo: z.low, i: z.in, hi: z.high }) + (M.snaps[i].complete ? "" : " | " + t("bgs.fl.inc"))) + '"' }); acc += c; });
      o += S.T(x + bw / 2, h - 16, String(new Date(M.snaps[i].t).getDate()), { anchor: "middle", size: 10, fill: COL.faint }) + (M.snaps[i].complete ? "" : S.T(x + bw / 2, h - 3, "!", { anchor: "middle", size: 11, fill: COL.warn, w: 700 }));
      if (z.low) o += S.T(x + bw / 2, Yp(z.low) + 11, String(z.low), { anchor: "middle", size: 9, fill: COL.ink, w: 700 });
    }
    [0, Math.round(max / 4), Math.round(max / 2), Math.round(max * .75), max].forEach(function (g) { o += S.T(30, Yp(g) + 3, String(g), { anchor: "end", size: 9.5, fill: COL.faint }); o += S.L(34, Yp(g), w - 12, Yp(g), COL.grid); });
    var leg = '<div class="bg-legend"><span><i class="bg-sw" style="background:' + COL.bad + '"></i>' + t("bgs.leg.below", { lo: lo }) + '</span><span><i class="bg-sw" style="background:' + COL.viA(.55) + '"></i>' + t("bgs.t.in") + '</span><span><i class="bg-sw" style="background:' + COL.warn + '"></i>' + t("bgs.leg.above", { hi: hi }) + "</span></div>";
    var zc = card(t("bgs.zot.h"), S.svg(w, h, o, 'id="zsvg"') + leg, { save: 1, q: t("bgs.zot.q"), note: t("bgs.zot.note") });
    var w2 = 600, h2 = 170, Y = S.dom(M), o2 = "", Xp = function (k) { return 36 + (k - M.first) / Math.max(1, M.K - M.first) * (w2 - 52); }, Yq = function (v) { return h2 - 22 - (v - Y[0]) / (Y[1] - Y[0]) * (h2 - 34); };
    o2 += S.R(36, Yq(hi), w2 - 52, Yq(lo) - Yq(hi), COL.band);
    var up = [], dn = []; for (i = M.first; i <= M.K; i++) { up.push(Xp(i).toFixed(1) + "," + Yq(M.fleet[i].q3).toFixed(1)); dn.unshift(Xp(i).toFixed(1) + "," + Yq(M.fleet[i].q1).toFixed(1)); }
    o2 += '<polygon points="' + up.concat(dn).join(" ") + '" fill="' + COL.cyA(.15) + '"/>';
    var mp = []; for (i = M.first; i <= M.K; i++) mp.push(Xp(i).toFixed(1) + "," + Yq(M.fleet[i].med).toFixed(1));
    o2 += '<polyline points="' + mp.join(" ") + '" fill="none" stroke="' + COL.cyan + '" stroke-width="2"/>';
    for (i = M.first; i <= M.K; i++) o2 += '<circle cx="' + Xp(i).toFixed(1) + '" cy="' + Yq(M.fleet[i].med).toFixed(1) + '" r="3" fill="' + COL.cyan + '" data-tip="' + esc(C.tm(M.snaps[i].t) + " | " + t("bgs.fl.med", { m: S.f1(M.fleet[i].med), a: S.f1(M.fleet[i].q1), b: S.f1(M.fleet[i].q3) })) + '"/>' + S.T(Xp(i), h2 - 6, String(new Date(M.snaps[i].t).getDate()), { anchor: "middle", size: 10, fill: COL.faint });
    [Y[0], lo, hi, Y[1]].forEach(function (g) { o2 += S.T(30, Yq(g) + 3, String(g), { anchor: "end", size: 9.5, fill: COL.faint }); });
    var mc = card(t("bgs.med.h"), S.svg(w2, h2, o2, 'id="msvg"'), { save: 1, q: t("bgs.med.q"), note: t("bgs.med.note") });
    return '<div class="bg-two">' + zc + mc + "</div>" + V.hist(M);
  };
  V.hist = function (M) {
    var w = 600, h = 190, pk = M.nS > 1 ? prevIdx(M) : -1, Y = S.dom(M), nb = Math.ceil((Y[1] - Y[0]) / 2), i, o = "", lo = M.st.lo, hi = M.st.hi;
    function bin(idx) { var b = []; for (i = 0; i < nb; i++) b.push(0); M.sys.forEach(function (s) { var v = s.v[idx]; if (v != null) b[Math.min(nb - 1, Math.floor((v - Y[0]) / 2))]++; }); return b; }
    var now = bin(M.K), pv = pk >= 0 ? bin(pk) : null, mx = Math.max.apply(0, now.concat(pv || [])) + 1;
    var X = function (v) { return 30 + (v - Y[0]) / (Y[1] - Y[0]) * (w - 44); }, Yp = function (c) { return h - 24 - c / mx * (h - 40); };
    o += S.R(X(lo), 8, X(hi) - X(lo), h - 32, COL.band) + S.T(X(lo) + 4, 20, t("bgs.band"), { size: 10, fill: COL.faint });
    now.forEach(function (c, b) { o += S.R(X(Y[0] + b * 2) + 1, Yp(c), X(Y[0] + 2) - X(Y[0]) - 2, h - 24 - Yp(c), Y[0] + b * 2 + 1 < lo ? COL.bad : Y[0] + b * 2 > hi - 1 ? COL.warn : COL.vio, { extra: ' opacity=".85" data-tip="' + esc(t("bgs.hist.tip", { a: Y[0] + b * 2, b: Y[0] + b * 2 + 2, n: c })) + '"' }); });
    if (pv) o += '<polyline fill="none" stroke="' + COL.txt + '" stroke-width="1.4" stroke-dasharray="3 2" points="' + pv.map(function (c, b) { return X(Y[0] + b * 2).toFixed(1) + "," + Yp(c).toFixed(1) + " " + X(Y[0] + b * 2 + 2).toFixed(1) + "," + Yp(c).toFixed(1); }).join(" ") + '"/>';
    for (var g = Y[0]; g <= Y[1]; g += 10) o += S.T(X(g), h - 8, String(g), { anchor: "middle", size: 10, fill: COL.faint });
    return card(pv ? t("bgs.hist.h2") : t("bgs.hist.h"), S.svg(w, h, o, 'id="hsvg"'), { save: 1, q: t("bgs.hist.q"), note: pv ? t("bgs.hist.note") : t("bgs.hist.note1") });
  };
})();
