"use strict";
/* BGS Watch, part 1: all the numbers, worked out from the saved snapshots only. No drawing here.
   DATA shape (made from bgs_snapshots by bgs-ui.js): { squad, snaps:[{t (ms), complete, missing, minOld}], sys:[{n, v:[per snapshot or null], f:[per snapshot flag]}] }
   flag: "" = read and sure, "w" = the player accepted an unsure reading, "e" = typed by the player. Both band edges are risks: LOW (defend) and HIGH (too high). */
(function () {
  var BG = window.BG = window.BG || {}, H = 36e5, DAY = 864e5;
  var DEF = { lo: 50, hi: 65, minor: 0.3, base: "prev", days: 0, tickPct: 20, quietPct: 5 };
  var tr = function (k, v) { return BG.tr ? BG.tr(k, v) : k; };
  function r1(x) { return Math.round(x * 10) / 10; }
  function median(a) { var b = a.slice().sort(function (x, y) { return x - y; }), n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : null; }
  function quant(a, q) { var b = a.slice().sort(function (x, y) { return x - y; }); return b.length ? b[Math.min(b.length - 1, Math.floor(q * (b.length - 1) + .5))] : null; }
  function tod(t) { var d = new Date(t); return d.getUTCHours() * 60 + d.getUTCMinutes(); }
  function hhmm(m) { m = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); }
  function dmy(t) { try { return new Date(t).toLocaleDateString(BG.lang || "en", { day: "numeric", month: "short", timeZone: "UTC" }); } catch (e) { return new Date(t).toISOString().slice(5, 10); } }
  function dt(t) { return dmy(t) + " " + hhmm(tod(t)); }                       // UTC (the game's clock)
  function dtl(t) { try { return new Date(t).toLocaleString(BG.lang || "en", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { return new Date(t).toString(); } }   // this PC's time, for tips
  function ago(ms) { var h = ms / H; return h < 36 ? Math.round(h) + " " + tr("bgs.u.h") : (h / 24).toFixed(1).replace(".0", "") + " " + tr("bgs.u.d"); }

  // which earlier reading a system is compared with: the one before, about 24 h ago, or about 7 days ago
  function baseIdx(snaps, s, li, mode) {
    var j;
    if (mode === "prev") { for (j = li - 1; j >= 0; j--) if (s.v[j] != null) return j; return -1; }
    var want = snaps[li].t - (mode === "24h" ? DAY : 7 * DAY), tol = mode === "24h" ? 18 * H : 48 * H, best = -1, bd = 1e18;
    for (j = 0; j < li; j++) if (s.v[j] != null && Math.abs(snaps[j].t - want) < bd) { bd = Math.abs(snaps[j].t - want); best = j; }
    return bd <= tol ? best : -1;
  }
  // median slope over pairs of readings at least 20 h apart, in points per day (Theil-Sen: one odd reading cannot drag it)
  function theilSen(pts) {
    var sl = [], i, j;
    for (i = 0; i < pts.length; i++) for (j = i + 1; j < pts.length; j++) if (pts[j].t - pts[i].t >= 20 * H) sl.push((pts[j].v - pts[i].v) / ((pts[j].t - pts[i].t) / DAY));
    if (sl.length < 6) return null;
    return { perDay: median(sl), q25: quant(sl, .25), q75: quant(sl, .75), n: sl.length };
  }
  function etaVars(e, edge) { return { a: Math.max(1, Math.round(e.fast)), b: Math.round(e.slow || 0), edge: edge }; }
  function model(data, st) {
    st = Object.assign({}, DEF, st || {});
    var nS = Math.max(1, Math.min(data.snaps.length, st.snaps || 9999)), snaps = data.snaps.slice(0, nS), K = nS - 1;
    var first = 0;
    if (st.days > 0) { while (first < K && snaps[K].t - snaps[first].t > st.days * DAY) first++; }
    var sys = data.sys.map(function (o) {
      var v = o.v.slice(0, nS), f = o.f.slice(0, nS), li = -1, j;
      for (j = K; j >= 0; j--) if (v[j] != null) { li = j; break; }
      if (li < 0) return null;
      var s = { n: o.n, steps: o.steps, v: v, f: f, li: li, stale: li < K, last: v[li], fi: v.findIndex(function (x) { return x != null; }) };
      s.zone = s.last < st.lo ? "low" : s.last > st.hi ? "high" : "in";
      s.bi = baseIdx(snaps, s, li, st.base); s.base = s.bi >= 0 ? v[s.bi] : null;
      s.d = s.base == null ? null : r1(s.last - s.base);
      s.tier = s.d == null ? "na" : Math.abs(s.d) < 0.05 ? "flat" : Math.abs(s.d) < st.minor ? "minor" : "big";
      s.dir = s.d == null || Math.abs(s.d) < 0.05 ? 0 : s.d > 0 ? 1 : -1;
      // run of changes in the same direction (a snapshot with no tick in between does not break it)
      var dist = [], i; for (i = 0; i <= li; i++) if (v[i] != null && (!dist.length || v[i] !== dist[dist.length - 1])) dist.push(v[i]);
      var run = 0, tot = 0, sg = 0;
      for (i = dist.length - 1; i > 0; i--) { var dd = dist[i] - dist[i - 1], g = dd > 0 ? 1 : -1; if (sg && g !== sg) break; sg = g; run++; tot += dd; }
      s.run = sg ? { n: run, sign: sg, tot: r1(tot) } : null;
      // trend: median slope of the last 7 days, only with 4+ readings over 3+ days
      var pts = []; for (i = 0; i <= li; i++) if (v[i] != null && snaps[li].t - snaps[i].t <= 7 * DAY) pts.push({ t: snaps[i].t, v: v[i] });
      s.slope = pts.length >= 4 && pts[pts.length - 1].t - pts[0].t >= 3 * DAY ? theilSen(pts) : null;
      // days to the NEAREST edge in the direction of the trend (a range, never one number)
      s.eta = null; s.etaH = null; s.rec = null; s.recH = null;
      var sl = s.slope;
      if (sl && sl.perDay <= -0.15 && s.last >= st.lo) { var head = s.last - st.lo; s.eta = { mid: head / -sl.perDay, fast: Math.max(0, head / -Math.min(sl.q25, sl.perDay)), slow: sl.q75 < -0.05 ? head / -sl.q75 : null }; }
      if (sl && sl.perDay >= 0.15 && s.last <= st.hi) { var headH = st.hi - s.last; s.etaH = { mid: headH / sl.perDay, fast: Math.max(0, headH / Math.max(sl.q75, sl.perDay)), slow: sl.q25 > 0.05 ? headH / sl.q25 : null }; }
      if (sl && sl.perDay >= 0.15 && s.last < st.lo) s.rec = (st.lo - s.last) / sl.perDay;
      if (sl && sl.perDay <= -0.15 && s.last > st.hi) s.recH = (s.last - st.hi) / -sl.perDay;
      var ch = []; for (i = 1; i <= li; i++) if (v[i] != null && v[i - 1] != null && v[i] !== v[i - 1]) ch.push(v[i] - v[i - 1]);
      s.vol = ch.length > 1 ? Math.sqrt(ch.reduce(function (a, x) { return a + x * x; }, 0) / ch.length) : null;
      s.warn = f.some(function (x) { return x; });
      // priority for the "needs attention" list, with the reasons in plain words. side: which edge is the worry
      var sc = 0, why = [], whyK = [], side = null;
      function W(k, v) { why.push(tr(k, v)); whyK.push([k, v]); }
      if (s.zone === "low") { sc = 100 + (st.lo - s.last); side = "low"; W("bgs.why.below", { lo: st.lo, d: r1(st.lo - s.last) }); }
      else if (s.zone === "high") { sc = 100 + (s.last - st.hi); side = "high"; W("bgs.why.above", { hi: st.hi, d: r1(s.last - st.hi) }); }
      if (s.eta && s.eta.mid <= 6) { var a1 = 80 - s.eta.mid * 4; if (a1 > sc) { sc = a1; side = side || "low"; } W(s.eta.slow ? "bgs.why.eta" : "bgs.why.eta1", etaVars(s.eta, st.lo)); }
      if (s.etaH && s.etaH.mid <= 6) { var a2 = 80 - s.etaH.mid * 4; if (a2 > sc) { sc = a2; side = side || "high"; } W(s.etaH.slow ? "bgs.why.eta" : "bgs.why.eta1", etaVars(s.etaH, st.hi)); }
      if (s.run && s.run.sign < 0 && s.run.n >= 3 && s.zone !== "high") { sc += 8; side = side || "low"; W("bgs.why.run", { n: s.run.n, tot: s.run.tot }); }
      if (s.run && s.run.sign > 0 && s.run.n >= 3 && s.zone !== "low") { sc += 8; side = side || "high"; W("bgs.why.runup", { n: s.run.n, tot: s.run.tot }); }
      if (s.tier === "big" && s.dir < 0 && s.last - st.lo < 6 && s.zone !== "low") { sc = Math.max(sc, 50 + Math.abs(s.d)); side = side || "low"; W("bgs.why.lost", { d: Math.abs(s.d), r: r1(s.last - st.lo), lo: st.lo }); }
      if (s.tier === "big" && s.dir > 0 && st.hi - s.last < 6 && s.zone !== "high") { sc = Math.max(sc, 50 + Math.abs(s.d)); side = side || "high"; W("bgs.why.gained", { d: Math.abs(s.d), r: r1(st.hi - s.last), hi: st.hi }); }
      s.score = sc; s.why = why; s.whyK = whyK; s.side = side;
      // Defend list (0.9.41): how far outside the band, room to the nearest edge, movement toward it, one simple score. Falls count too.
      var E = s.zone === "low" ? st.lo - s.last : s.zone === "high" ? s.last - st.hi : 0;
      var edge = E ? s.zone : (s.last - st.lo <= st.hi - s.last ? "low" : "high");
      var R = E ? 0 : Math.min(s.last - st.lo, st.hi - s.last);
      var tw = s.slope ? (edge === "low" ? -s.slope.perDay : s.slope.perDay) : 0;
      var dm = s.d == null ? 0 : (edge === "low" ? -s.d : s.d);
      var s2 = E ? 100 + 3 * E : Math.max(0, 60 - 4 * R);
      if (dm > 0) s2 += Math.min(40, 8 * dm);
      if (tw > 0) s2 += Math.min(30, 10 * tw);
      if (s.run && s.run.n >= 3 && s.run.sign === (edge === "low" ? -1 : 1)) s2 += 8;
      if (s.d != null && s.d <= -2 && s.zone !== "high") s2 = Math.max(s2, 55);
      s.E = r1(E); s.R = r1(R); s.edge = edge; s.toward = tw; s.score2 = s2;
      // each system ticks at its own time: the last change was seen between these two readings
      s.lastChg = null;
      for (var qi = li; qi > 0 && !s.lastChg; qi--) {
        if (v[qi] == null) continue;
        var qj = qi - 1; while (qj >= 0 && v[qj] == null) qj--;
        if (qj < 0) break;
        if (v[qi] !== v[qj]) s.lastChg = { a: snaps[qj].t, b: snaps[qi].t };
      }
      return s;
    }).filter(Boolean);
    var M = { st: st, snaps: snaps, K: K, first: first, sys: sys, nS: nS, squad: data.squad };
    // per snapshot: zone counts, mean, median, quartiles over the systems that were read
    M.fleet = snaps.map(function (sn, i) {
      var a = [], z = { low: 0, in: 0, high: 0 }; sys.forEach(function (s) { var x = s.v[i]; if (x != null) { a.push(x); z[x < st.lo ? "low" : x > st.hi ? "high" : "in"]++; } });
      return { n: a.length, z: z, mean: a.reduce(function (p, x) { return p + x; }, 0) / (a.length || 1), med: median(a), q1: quant(a, .25), q3: quant(a, .75) };
    });
    M.ticks = tickModel(M);
    return M;
  }
  // tick estimate: a tick is when many systems change between two snapshots. Quiet intervals say where it is NOT.
  function tickModel(M) {
    var st = M.st, iv = [], i;
    for (i = 1; i <= M.K; i++) {
      var A = M.snaps[i - 1], B = M.snaps[i], n = 0, c = 0;
      M.sys.forEach(function (s) { if (s.v[i] != null && s.v[i - 1] != null) { n++; if (Math.abs(s.v[i] - s.v[i - 1]) >= 0.1) c++; } });
      var pct = n ? c * 100 / n : 0, hrs = (B.t - A.t) / H;
      iv.push({ i: i, a: A.t, b: B.t, n: n, c: c, pct: pct, hrs: hrs, kind: n < 20 ? "few" : pct >= st.tickPct ? "tick" : pct <= st.quietPct ? "quiet" : "unclear", multi: hrs > 26 });
    }
    var out = { iv: iv, win: null, text: "", level: 0 };
    var ticks = iv.filter(function (x) { return x.kind === "tick" && !x.multi; });
    out.nTicks = iv.filter(function (x) { return x.kind === "tick"; }).length;
    if (M.nS < 2) { out.text = tr("bgs.tick.need"); return out; }
    function rng(x) { var a = tod(x.a); if (a < 360) a += 1440; return [a, a + (x.b - x.a) / 6e4]; }
    var tight = ticks.filter(function (x) { return x.hrs <= 14; }).slice(-6);
    if (!out.nTicks) { out.text = tr("bgs.tick.none", { pct: st.tickPct }); return out; }
    if (!tight.length) { out.text = tr("bgs.tick.wide"); out.level = 1; return out; }
    var lo = -1e9, hi = 1e9; tight.forEach(function (x) { var r = rng(x); lo = Math.max(lo, r[0]); hi = Math.min(hi, r[1]); });
    out.agree = lo <= hi;
    if (out.agree) {                                   // quiet intervals of the last 7 days cut the edges
      iv.filter(function (x) { return x.kind === "quiet" && M.snaps[M.K].t - x.b <= 7 * DAY && x.hrs <= 26; }).forEach(function (x) {
        var r = rng(x); if (r[0] <= lo && lo < r[1]) lo = Math.min(r[1], hi); if (r[0] < hi && hi <= r[1]) hi = Math.max(r[0], lo);
      });
      out.win = [lo, hi]; out.level = tight.length >= 3 ? 3 : 2;
      out.text = tr("bgs.tick.win", { a: hhmm(lo), b: hhmm(hi), n: tight.length });
    } else {
      var mids = tight.map(function (x) { var r = rng(x); return (r[0] + r[1]) / 2; });
      out.win = [Math.min.apply(0, mids), Math.max.apply(0, mids)]; out.level = 1;
      out.text = tr("bgs.tick.rough", { a: hhmm(out.win[0]), b: hhmm(out.win[1]) });
    }
    out.tight = tight; out.drift = tr("bgs.tick.drift");
    return out;
  }
  BG.calc = { DEF: DEF, model: model, hhmm: hhmm, dmy: dmy, dt: dt, dtl: dtl, tod: tod, ago: ago, r1: r1, median: median, quant: quant };
})();
