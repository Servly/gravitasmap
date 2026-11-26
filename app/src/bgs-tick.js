"use strict";
/* BGS Watch, part 5: Tick estimate, Report (Discord block, always English) and the CSV files. */
(function () {
  var BG = window.BG, S = BG.svg, C = BG.calc, COL = S.COL, V = BG.views, card = V.card, need = V.need, esc = S.esc, t = function (k, v) { return BG.tr(k, v); };
  var LV = ["none", "low", "medium", "higher"];
  function lvName(n) { return t("bgs.lv." + LV[n]); }

  V.tickMini = function (M) {
    var k = M.ticks; return '<div class="bg-mt-t">' + esc(k.text) + "</div>" + (k.win ? '<div class="bg-lv" data-tip="' + esc(t("tip.bgs.lv")) + '">' + t("bgs.conf") + ": " + lvName(k.level) + "</div>" : "") + '<div class="bg-note">' + t("bgs.tick.mini") + "</div>";
  };
  V.tickCharts = function (M) {
    var k = M.ticks;
    if (M.nS < 2) return card(t("bgs.tick.h2"), need(esc(k.text) + " " + t("bgs.tick.one")), { q: t("bgs.tick.q2") });
    var iv = k.iv, w = 640, h = 200, n = iv.length, bw = Math.max(8, Math.min(40, (w - 60) / n - 6)), o = "", X = function (i) { return 40 + i * ((w - 56) / n); }, Yp = function (p) { return 12 + (1 - p / 100) * (h - 56); };
    [0, 20, 50, 100].forEach(function (g) { o += S.T(34, Yp(g) + 3, g + "%", { anchor: "end", size: 9.5, fill: COL.faint }) + S.L(38, Yp(g), w - 10, Yp(g), g === M.st.tickPct ? COL.accA(.6) : COL.grid, { dash: g === M.st.tickPct ? "4 3" : null }); });
    o += S.T(44, Yp(M.st.tickPct) - 4, t("bgs.tick.line", { p: M.st.tickPct }), { anchor: "start", size: 10, fill: COL.acc });
    iv.forEach(function (x, i) {
      var col = x.kind === "tick" ? COL.vio : x.kind === "quiet" ? COL.faint : x.kind === "unclear" ? COL.warn : COL.line;
      o += S.R(X(i), Yp(Math.max(x.pct, 1.5)), bw, h - 44 - Yp(Math.max(x.pct, 1.5)), col, { rx: 2, extra: ' data-tip="' + esc(C.dt(x.a) + " - " + C.dt(x.b) + " UTC (" + C.dtl(x.a) + " - " + C.dtl(x.b) + ", " + x.hrs.toFixed(1) + " " + t("bgs.u.h") + ") | " + t("bgs.tick.chgd", { c: x.c, n: x.n, p: x.pct.toFixed(0) }) + (x.multi ? " | " + t("bgs.tick.multi") : "")) + '"' });
      o += S.T(X(i) + bw / 2, h - 28, C.dmy(x.b), { anchor: "middle", size: 9.5, fill: COL.dim }) + S.T(X(i) + bw / 2, h - 16, x.hrs < 36 ? Math.round(x.hrs) + t("bgs.u.hs") : (x.hrs / 24).toFixed(0) + t("bgs.u.ds"), { anchor: "middle", size: 9, fill: x.multi ? COL.warn : COL.faint });
    });
    function sw(bg, lab) { return '<span><i class="bg-sw" style="background:' + bg + '"></i>' + lab + "</span>"; }
    var c1 = card(t("bgs.tick.h3"), S.svg(w, h, o, 'id="tsvg"') + '<div class="bg-legend">' + sw(COL.vio, t("bgs.tick.l1")) + sw(COL.faint, t("bgs.tick.l2")) + sw(COL.warn, t("bgs.tick.l3")) + '<span class="bg-fl">' + t("bgs.tick.l4") + "</span></div>", { save: 1, q: t("bgs.tick.q3"), note: t("bgs.tick.note1") });
    var w2 = 640, rows = iv.filter(function (x) { return x.kind === "tick" || x.kind === "quiet"; }).slice().reverse().slice(0, 14), rh = 18, h2 = 30 + rows.length * rh + 24, o2 = "", X2 = function (m) { return 80 + m / 1440 * (w2 - 96); };
    for (var hh = 0; hh <= 24; hh += 3) o2 += S.L(X2(hh * 60), 22, X2(hh * 60), h2 - 22, COL.grid) + S.T(X2(hh * 60), 15, String(hh).padStart(2, "0") + ":00", { anchor: "middle", size: 9.5, fill: COL.faint });
    if (k.win) { var a0 = ((k.win[0] % 1440) + 1440) % 1440, b0 = a0 + (k.win[1] - k.win[0]); o2 += S.R(X2(a0), 20, X2(Math.min(b0, 1440)) - X2(a0), h2 - 42, COL.accA(.16), { stroke: COL.acc, dash: "4 3" }); }
    rows.forEach(function (x, r) {
      var a = C.tod(x.a), len = (x.b - x.a) / 6e4, y = 26 + r * rh, parts = a + len > 1440 ? [[a, 1440], [0, a + len - 1440]] : [[a, a + len]];
      o2 += S.T(74, y + 11, C.dmy(x.b), { anchor: "end", size: 10, fill: COL.dim });
      parts.forEach(function (p) { o2 += x.kind === "tick" ? S.R(X2(p[0]), y + 2, Math.max(2, X2(p[1]) - X2(p[0])), rh - 6, x.multi ? "none" : COL.viA(.8), { rx: 3, stroke: x.multi ? COL.warn : null, dash: x.multi ? "3 2" : null, extra: ' data-tip="' + esc(t(x.multi ? "bgs.tick.in2" : "bgs.tick.in1") + ": " + C.hhmm(a) + " - " + C.hhmm(a + len) + " UTC") + '"' }) : S.R(X2(p[0]), y + 5, Math.max(2, X2(p[1]) - X2(p[0])), rh - 12, COL.faint, { rx: 2, extra: ' data-tip="' + esc(t("bgs.tick.qt") + ": " + C.hhmm(a) + " - " + C.hhmm(a + len) + " UTC") + '"' }); });
    });
    var c2 = card(t("bgs.tick.h4"), S.svg(w2, h2, o2, 'id="tsvg2"') + '<div class="bg-est"><b>' + esc(k.text) + "</b>" + (k.win ? '<div class="bg-lv">' + t("bgs.conf") + ": " + lvName(k.level) + "</div>" : "") + '<div class="bg-note">' + esc(k.drift || "") + " " + t("bgs.tick.note2") + "</div></div>", { save: 1, q: t("bgs.tick.q4"), note: t("bgs.tick.note3") });
    return '<div class="bg-two">' + c1 + c2 + "</div>";
  };

  function mod(m) { return ((Math.round(m) % 1440) + 1440) % 1440; }
  function loc(m) { var d = new Date(); d.setUTCHours(0, 0, 0, 0); d = new Date(d.getTime() + mod(m) * 6e4); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }
  function rangeTxt(w) { return C.hhmm(w[0]) + " - " + C.hhmm(w[1]) + " UTC (" + loc(w[0]) + " - " + loc(w[1]) + " " + t("bgs.tick.local") + ")"; }
  V.tick = function (M) {
    var R = M.raw || M, T = C.tickSys(R), by = {}, lv = [0, 0, 0, 0];
    T.forEach(function (x, i) { by[R.sys[i].n] = x; lv[x.level]++; });
    var rows = T.map(function (x, i) { return { n: R.sys[i].n, x: x }; });
    rows.sort(function (a, b) { var A = a.x.win ? a.x.win[0] : 9999, Bw = b.x.win ? b.x.win[0] : 9999; return (b.x.level - a.x.level) || (A - Bw) || (a.n < b.n ? -1 : 1); });   // the surest first
    var head = '<div class="bg-note">' + esc(t("bgs.tick.sys.sum", { a: lv[3], b: lv[2], c: lv[1], d: lv[0] })) + "</div>";
    var tb = '<div class="bg-rows"><div class="bg-trow bg-th"><span>' + esc(t("bgs.tick.sys.c1")) + "</span><span>" + esc(t("bgs.tick.sys.c2")) + "</span><span>" + esc(t("bgs.tick.sys.c3")) + "</span></div>" + rows.map(function (r) {
      var x = r.x, txt = x.win ? esc(rangeTxt(x.win)) : '<span class="bg-fl">' + esc(t("bgs.tick.sys.none")) + "</span>";
      var tip = x.win ? t("bgs.tick.sys.tip", { n: x.used, c: x.changes }) + (x.wide ? " " + t("bgs.tick.sys.wide") : "") : t("bgs.tick.sys.none");
      return '<div class="bg-trow" data-sys="' + esc(r.n) + '" data-tip="' + esc(tip) + '"><span>' + esc(r.n) + "</span><span>" + txt + '</span><span class="bg-fl">' + (x.win ? esc(lvName(x.level)) + " (" + x.changes + ")" : "") + "</span></div>";
    }).join("") + "</div>";
    return V.tickCharts(M) + card(t("bgs.tick.sys.h"), head + tb, { q: t("bgs.tick.sys.q"), note: t("bgs.tick.sys.note") });
  };

  // ---------- Report: always English, a fixed-width Discord block under 2,000 characters ----------
  V.reportText = function (M, ui) {
    var o = ui.rep, st = M.st, L = [], k = M.nS > 1, K = M.K, sn = M.snaps[K], f1 = S.f1, sgn = S.sg;
    var d0 = M.sys.filter(function (s) { return s.bi >= 0; })[0], bi = d0 ? d0.bi : -1, z = M.fleet[K].z;
    var ds = M.sys.filter(function (s) { return s.d != null; }), up = ds.filter(function (s) { return s.dir > 0; }).length, dn = ds.filter(function (s) { return s.dir < 0; }).length, fl = ds.length - up - dn;
    var dstr = function (x) { return new Date(x).toISOString().slice(0, 10); }, tstr = function (x) { return dstr(x) + " " + C.hhmm(C.tod(x)); };
    L.push("BGS DAILY" + (ui.faction ? " | " + ui.faction : "") + " | " + dstr(sn.t));
    L.push("Snapshot " + tstr(sn.t) + " UTC" + (k && bi >= 0 ? ", compared with " + tstr(M.snaps[bi].t) + " (" + Math.round((sn.t - M.snaps[bi].t) / 36e5) + " h earlier)" : ""));
    L.push(M.sys.length + " systems read" + (k ? " | up " + up + " | down " + dn + " | same " + fl : "") + " | median " + f1(M.fleet[K].med));
    L.push("Band " + st.lo + "-" + st.hi + ": below " + z.low + " | in " + z.in + " | above " + z.high);
    function row(s, extra) { return f1(s.last).padStart(5) + (s.d == null ? "      " : sgn(s.d).padStart(6)) + "  " + s.n + (extra ? "  " + extra : ""); }
    var list = M.sys.filter(function (s) { return s.score > 0; }).sort(function (a, b) { return b.score - a.score; });
    var dl = list.filter(function (s) { return s.side !== "high"; }).slice(0, 8), th = list.filter(function (s) { return s.side === "high"; }).slice(0, 5);
    function plain(s) { return s.whyK[0] ? BG.trEn(s.whyK[0][0], s.whyK[0][1]).replace(/[<>]/g, "") : ""; }
    if (o.att && dl.length) { L.push(""); L.push("BOOST FIRST (value, change, system)"); dl.forEach(function (s) { L.push(row(s, plain(s))); }); }
    if (o.att && th.length) { L.push(""); L.push("ABOVE YOUR RANGE (value, change, system)"); th.forEach(function (s) { L.push(row(s, plain(s))); }); }
    if (k && o.drops) { L.push(""); L.push("BIGGEST DROPS"); ds.filter(function (s) { return s.d < 0 && s.tier === "big"; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 5).forEach(function (s) { L.push(row(s)); }); }
    if (k && o.gains) { L.push(""); L.push("BIGGEST GAINS"); ds.filter(function (s) { return s.d > 0 && s.tier === "big"; }).sort(function (a, b) { return b.d - a.d; }).slice(0, 5).forEach(function (s) { L.push(row(s)); }); }
    if (k && o.cross) {
      var mv = function (a) { return a.map(function (s) { return s.n + " " + f1(s.base) + ">" + f1(s.last); }).join(", "); };
      var e1 = ds.filter(function (s) { return s.base >= st.lo && s.last < st.lo; }), r1 = ds.filter(function (s) { return s.base < st.lo && s.last >= st.lo; }),
        e2 = ds.filter(function (s) { return s.base <= st.hi && s.last > st.hi; }), r2 = ds.filter(function (s) { return s.base > st.hi && s.last <= st.hi; });
      if (e1.length || r1.length || e2.length || r2.length) { L.push(""); if (e1.length) L.push("FELL BELOW " + st.lo + ": " + mv(e1)); if (r1.length) L.push("BACK ABOVE " + st.lo + ": " + mv(r1)); if (e2.length) L.push("ROSE ABOVE " + st.hi + ": " + mv(e2)); if (r2.length) L.push("BACK UNDER " + st.hi + ": " + mv(r2)); }
    }
    if (o.tick) { L.push(""); L.push("TICK (est.): " + (M.ticks.win ? C.hhmm(M.ticks.win[0]) + "-" + C.hhmm(M.ticks.win[1]) + " UTC, " + ["", "rough", "medium confidence", "higher confidence"][M.ticks.level] : "needs more data")); }
    var fw = M.sys.filter(function (s) { return s.f[K]; }).length;
    L.push(""); L.push("Own readings in 0.1 steps" + (sn.complete ? "" : ". INCOMPLETE: " + sn.missing + " rows missing") + (fw ? ". " + fw + " cells accepted after a warning" : "") + ".");
    var txt = L.join("\n");
    while (txt.length > 1900 && L.length > 8) { L.splice(L.length - 3, 1); txt = L.join("\n"); }
    return "```\n" + txt + "\n```";
  };
  V.report = function (M, ui) {
    var o = ui.rep, txt = V.reportText(M, ui), ck = function (k) { return '<label class="bg-ck" data-tip="' + esc(t("tip.bgs.rep." + k)) + '"><input type="checkbox" data-rep="' + k + '"' + (o[k] ? " checked" : "") + "> " + t("bgs.rep." + k) + "</label>"; };
    var ex = '<div class="bg-btns"><button class="btn go" data-copy="1" data-tip="' + esc(t("tip.bgs.copy")) + '">' + t("bgs.rep.copy") + '</button><button class="btn" data-csv="long" data-tip="' + esc(t("tip.bgs.csvlong")) + '">' + t("bgs.rep.csvl") + '</button><button class="btn" data-csv="wide" data-tip="' + esc(t("tip.bgs.csvwide")) + '">' + t("bgs.rep.csvw") + "</button></div>";
    var fac = '<label class="bg-ck" data-tip="' + esc(t("tip.bgs.faction")) + '">' + t("bgs.rep.faction") + ' <input class="bg-in" id="rfac" maxlength="60" value="' + esc(ui.faction || "") + '"></label>';
    var fields = [["hdr"], ["snap"], ["cnt"], ["band"], ["def"], ["thi"], ["dg"], ["cross"], ["tick"], ["foot"]];
    return '<div class="bg-split"><div>' + card(t("bgs.rep.h"), ck("att") + ck("drops") + ck("gains") + ck("cross") + ck("tick") + " " + fac + '<pre class="bg-rep" id="reptxt">' + esc(txt) + '</pre><div class="bg-cnt ' + (txt.length > 2000 ? "bg-dn" : "") + '">' + t("bgs.rep.cnt", { n: txt.length }) + "</div>" + ex, { q: t("bgs.rep.q"), note: t("bgs.rep.note") }) +
      "</div><div>" + card(t("bgs.rep.fields"), '<table class="bg-t wr"><tbody>' + fields.map(function (r) { return "<tr><td><b>" + t("bgs.fd." + r[0]) + '</b></td><td class="bg-fl">' + t("bgs.fd." + r[0] + ".d", { m: M.st.minor }) + "</td></tr>"; }).join("") + "</tbody></table>") + "</div></div>";
  };
  V.csv = function (M, kind) {
    var q = function (s) { return '"' + String(s).replace(/"/g, '""') + '"'; }, L = [];
    if (kind === "wide") {
      L.push(["system"].concat(M.snaps.map(function (s) { return new Date(s.t).toISOString(); })).join(","));
      M.sys.forEach(function (s) { L.push([q(s.n)].concat(s.v.map(function (v) { return v == null ? "" : v.toFixed(1); })).join(",")); });
    } else {
      L.push("snapshot_utc,system,influence,change_vs_previous_reading,flag");
      M.sys.forEach(function (s) { var p = null; s.v.forEach(function (v, i) { if (v == null) return; L.push([new Date(M.snaps[i].t).toISOString(), q(s.n), v.toFixed(1), p == null ? "" : (v - p).toFixed(1), s.f[i] === "w" ? "accepted_after_warning" : s.f[i] === "e" ? "typed" : ""].join(",")); p = v; }); });
    }
    return "﻿" + L.join("\r\n");
  };
})();
