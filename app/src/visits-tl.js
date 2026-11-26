"use strict";
// GRAVITAS Visits, the timeline at the bottom: the WHOLE history from the index. Months that are not held as stops are drawn as quiet bars from the
// month totals, the held stops (active window and archive) as fine bars; the page is the lit window. Nothing here needs a stop that is not in memory.
(function () {
  var G = window.GVV, clamp = G.clamp, st = G.store;
  var TH = window.GVTH ? GVTH.tint : function (c) { return c; };   // colour theme: the default theme returns the colour unchanged (themes.js)
  /** [from, to] of the whole history: the index when there is one, else the held stops */
  G.bounds = function (s) { var ix = s.idx, D = s.D; if (ix && ix.months.length) return [ix.lo, ix.hi]; return D && D.n ? [D.tmin, D.tmax] : [0, 1]; };
  function tlRange(s) { var b = G.bounds(s), sp = Math.max(b[1] - b[0], 36e5); return [b[0] - sp * .02 - 3.6e6, b[1] + sp * .02 + 3.6e6]; }
  G.tlX = function (s, t) { var r = tlRange(s); return (t - r[0]) / (r[1] - r[0]) * s.tlW; };
  G.tlT = function (s, x) { var r = tlRange(s); return r[0] + x / s.tlW * (r[1] - r[0]); };
  function buildHist(s) {
    var D = s.D, M = s.M, ix = s.idx, nb = Math.max(20, (s.tlW / 3) | 0), h = { nb: nb, c: new Float32Array(nb), q: new Float32Array(nb), m: new Float32Array(nb), mx: 1 }, a = G.tlT(s, 0), b = G.tlT(s, s.tlW), i, k;
    for (i = 0; i < D.n; i++) { k = Math.min(nb - 1, Math.max(0, ((D.T[i] - a) / (b - a) * nb) | 0)); h.c[k]++; if (M && M[i]) h.m[k]++; else if (!M && D.F[i]) h.m[k]++; }
    if (ix) ix.months.forEach(function (mo) {      // a month that is not held: its stop count spread over the bins of its span
      if (st.loaded(s, mo.m)) return; var t0 = mo.t0, t1 = Math.max(mo.t1, t0 + 36e5), k0 = clamp(((t0 - a) / (b - a) * nb) | 0, 0, nb - 1), k1 = clamp(((t1 - a) / (b - a) * nb) | 0, k0, nb - 1), per = mo.n / (k1 - k0 + 1);
      for (var j = k0; j <= k1; j++) h.q[j] += per;
    });
    for (var j = 0; j < nb; j++) h.mx = Math.max(h.mx, h.c[j] + h.q[j]); s.hist = h; s.histDirty = false;
  }
  G.dockDraw = function (s) {
    var D = s.D, R = s.R; if (!D) return; if (s.histDirty || !s.hist) buildHist(s);
    var c = s.tl, hist = s.hist, tlW = s.tlW, f = s.f, ix = s.idx; c.setTransform(s.dpr, 0, 0, s.dpr, 0, 0); var h = 54; c.clearRect(0, 0, tlW, h);
    var bw = tlW / hist.nb, base = h - 14, bh = base - 4, x0 = G.tlX(s, R.ta), x1 = G.tlX(s, R.tb), k;
    if (ix && st.hasOlder(s)) {                    // the active window (the last 12 months) sits on a faint band
      var act = ix.months.filter(function (mo) { return st.isActive(ix, mo); }); if (act.length) { var ax = Math.max(0, G.tlX(s, act[0].t0)); c.fillStyle = TH("rgba(106,232,255,.06)"); c.fillRect(ax, 1, tlW - ax, base - 1); }
    }
    for (k = 0; k < hist.nb; k++) {
      var v = hist.c[k], qv = hist.q[k], x = k * bw, inR = x + bw > x0 && x < x1, col = G.ramp(k / hist.nb);
      if (qv) { var qh = Math.max(1.5, Math.sqrt((qv) / hist.mx) * bh); c.fillStyle = "rgba(" + col[0] + "," + col[1] + "," + col[2] + "," + (inR ? .55 : .2) + ")"; c.fillRect(x, base - qh, Math.max(1, bw - .6), qh); }
      if (!v) continue; var hh = Math.max(1.5, Math.sqrt(v / hist.mx) * bh);
      c.fillStyle = "rgba(" + col[0] + "," + col[1] + "," + col[2] + "," + (inR ? .9 : .32) + ")"; c.fillRect(x, base - hh, Math.max(1, bw - .6), hh);
      var mv = hist.m[k]; if (mv) { var mh = Math.max(1.5, Math.sqrt(mv / hist.mx) * bh); c.fillStyle = inR ? "rgba(125,255,155,.95)" : "rgba(125,255,155,.45)"; c.fillRect(x, base - mh, Math.max(1, bw - .6), Math.min(mh, hh)); }
    }
    c.strokeStyle = TH("rgba(190,120,255,.3)"); c.lineWidth = 1; c.beginPath(); c.moveTo(0, base + .5); c.lineTo(tlW, base + .5); c.stroke();
    c.fillStyle = TH("rgba(157,140,192,.9)"); c.font = '10px "Segoe UI",system-ui,sans-serif'; c.textBaseline = "top";
    var span = G.tlT(s, tlW) - G.tlT(s, 0), pxPerDay = tlW / (span / 864e5), unit = pxPerDay > 60 ? 1 : pxPerDay > 12 ? 7 : pxPerDay > 4 ? 30 : pxPerDay > 1.2 ? 91 : 365;
    var t = new Date(G.tlT(s, 0)); t = unit === 1 ? new Date(t.getFullYear(), t.getMonth(), t.getDate()) : new Date(t.getFullYear(), unit >= 365 ? 0 : t.getMonth(), 1);
    var lastLabel = -99;
    for (var g = 0; g < 400; g++) {
      var tx = G.tlX(s, +t); if (tx > tlW) break;
      if (tx >= 0 && tx - lastLabel > 54) { c.fillRect(tx, base, 1, 3); c.fillText(unit === 365 || (t.getMonth() === 0 && unit >= 30) ? String(t.getFullYear()) : unit >= 30 ? f.mon(+t) : f.d(+t), tx + 3, base + 2); lastLabel = tx; }
      t = unit === 1 ? new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1) : unit === 7 ? new Date(t.getFullYear(), t.getMonth(), t.getDate() + 7) : unit === 30 ? new Date(t.getFullYear(), t.getMonth() + 1, 1) : unit === 91 ? new Date(t.getFullYear(), t.getMonth() + 3, 1) : new Date(t.getFullYear() + 1, 0, 1);
    }
    if (D.ses.length <= 500 && pxPerDay > 1.2) { c.fillStyle = TH("rgba(106,232,255,.55)"); for (k = 0; k < D.ses.length; k++) c.fillRect(G.tlX(s, D.T[D.ses[k]]), base - 3, 1, 3); }
    c.fillStyle = TH("rgba(167,123,255,.16)"); c.strokeStyle = TH("rgba(106,232,255,.85)"); c.lineWidth = 1.3; var bx = Math.max(0, x0), bx2 = Math.min(tlW, Math.max(x1, x0 + 3));
    c.beginPath(); c.roundRect(bx + .5, 1.5, bx2 - bx - 1, base - 1, 5); c.fill(); c.stroke();
    c.fillStyle = TH("#6ae8ff"); c.beginPath(); c.roundRect(bx - 1, base / 2 - 9, 4, 18, 2); c.fill(); c.beginPath(); c.roundRect(bx2 - 3, base / 2 - 9, 4, 18, 2); c.fill();
    if (s.replay && R.i1 > R.i0) { var rx = G.tlX(s, D.T[R.i0 + Math.min(R.i1 - R.i0 - 1, Math.floor(s.replay.p * (R.i1 - R.i0)))]); c.fillStyle = "#fff"; c.fillRect(rx - .5, 0, 1.5, base); }
    if (s.tlHover >= 0) {
      c.fillStyle = "rgba(255,255,255,.35)"; c.fillRect(s.tlHover, 0, 1, base); var tt = f.dy(G.tlT(s, s.tlHover)); c.font = '600 10.5px "Segoe UI",system-ui,sans-serif';
      var w = c.measureText(tt).width + 10, lx = clamp(s.tlHover - w / 2, 0, tlW - w); c.fillStyle = TH("rgba(10,6,22,.92)"); c.fillRect(lx, 1, w, 15); c.fillStyle = TH("#e9ddff"); c.fillText(tt, lx + 5, 3);
    }
  };
  G.invalidateDock = function (s) { if (s.dockQ || !s.on) return; s.dockQ = requestAnimationFrame(function () { s.dockQ = 0; G.raf++; G.dockDraw(s); }); };
})();
