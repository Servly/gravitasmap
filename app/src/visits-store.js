"use strict";
// GRAVITAS Visits, the store: what is held in memory and when it is loaded. Rust sends a small INDEX of the whole history (one entry per month with its
// summary), the stops come one month at a time (visits_month). Held at any moment: the ACTIVE window (the newest 12 calendar months of the index, kept
// fresh) and at most ONE archive period (an older month, year or custom range, capped at G.CAP stops, replaced when another old period is opened).
// The rest of the page keeps working on ONE sorted list: archive stops first, then the active ones, so ranges and pages stay index ranges of that list.
(function () {
  var G = window.GVV, st = G.store = {};
  G.CAP = 150000; G.ACTIVE_MONTHS = 12;
  G.tms = function (v) { return typeof v === "number" ? v : (Date.parse(v) || 0); };             // a time may arrive as an ISO string or as milliseconds

  /* ---------- the index ---------- */
  st.norm = function (resp) {
    var months = [], i, sum = 0, cr = 0, ly = 0, sy = 0, list = (resp && resp.months) || [];
    for (i = 0; i < list.length; i++) {
      var m = list[i], key = String(m.m || ""), y = +key.slice(0, 4), mo = +key.slice(5, 7); if (!(y > 1900 && mo >= 1 && mo <= 12) || !(m.n > 0)) continue;
      var a = Date.UTC(y, mo - 1, 1), b = Date.UTC(y, mo, 1), t0 = G.tms(m.t0) || a, t1 = G.tms(m.t1);
      if (!t1 || t1 < t0) t1 = Math.max(t0, b - 1);
      months.push({ m: key, k: y * 12 + mo - 1, n: m.n | 0, t0: t0, t1: t1, a: a, b: b, r: m.r, cr: +m.cr || 0, ly: +m.ly || 0, sys: +m.sys || 0, sell: m.sell || [], buy: m.buy || [], dock: m.dock || [], grid: m.grid || [] });
    }
    months.sort(function (p, q) { return p.k - q.k; });
    var by = new Map(); months.forEach(function (x) { by.set(x.m, x); sum += x.n; cr += x.cr; ly += x.ly; sy += x.sys; });
    var last = months[months.length - 1];
    return { rev: resp && resp.rev, months: months, by: by, nTot: sum, crTot: cr, lyTot: ly, sysTot: resp && resp.systems != null ? +resp.systems : sy, sysExact: !!(resp && resp.systems != null),
      lo: months.length ? months[0].t0 : 0, hi: last ? last.t1 : 0, newestK: last ? last.k : 0 };
  };
  st.isActive = function (ix, mo) { return mo.k > ix.newestK - G.ACTIVE_MONTHS; };
  st.loaded = function (s, m) { return s.mon.has(m) || !!(s.arch && s.arch.ready && s.arch.mon.has(m)); };
  st.monthsFor = function (ix, pa, pb) { return ix.months.filter(function (mo) { return mo.t1 >= pa && mo.t0 < pb; }); };
  st.hasOlder = function (s) { var ix = s.idx; return !!ix && ix.months.some(function (mo) { return !st.isActive(ix, mo); }); };
  st.olderAt = function (s, t) { var ix = s.idx; if (!ix || !ix.months.length || !st.hasOlder(s)) return false; var act = ix.months.filter(function (mo) { return st.isActive(ix, mo); }); return !!act.length && t < act[0].t0; };
  st.held = function (s) { var n = 0; s.mon.forEach(function (e) { n += e.stops.length; }); if (s.arch) s.arch.mon.forEach(function (e) { n += e.stops.length; }); return n; };
  st.months = function (s) { var a = 0, b = 0; s.mon.forEach(function () { a++; }); if (s.arch) s.arch.mon.forEach(function () { b++; }); return { active: a, archive: b }; };

  /* ---------- the one combined list ---------- */
  function combine(s) {
    var out = [], ix = s.idx, arch = s.arch && s.arch.ready ? s.arch : null; if (!ix) return out;
    ix.months.forEach(function (mo) { var e = st.isActive(ix, mo) ? s.mon.get(mo.m) : (arch && arch.mon.get(mo.m)); if (e) for (var i = 0; i < e.stops.length; i++) out.push(e.stops[i]); });
    return out;
  }
  function buildD(s) { var l = combine(s); s.D = l.length ? G.prep(l) : null; }
  function findStop(D, t, sys) { var i = G.lb(D.T, t, D.n); for (; i < D.n && D.T[i] === t; i++) if (D.v[i].sys === sys) return i; return -1; }
  G.findStop = findStop;

  function rebindRange(s, R, oldD) {          // the list changed: keep the page the player was looking at (by time, never by index)
    var D = s.D, b = G.bounds(s); s.restoring = !!s.pendLast;
    if (R.unit === "all") G.setRange(s, 0, D.n, "all", b[0], b[1] + 1);
    else if (R.unit === "last" && oldD && R.i1 >= oldD.n) G.setUnit(s, "last");
    else if (R.unit === "session") { var anchor = oldD && R.i0 < oldD.n ? G.lb(D.T, oldD.T[R.i0], D.n) : D.n - 1; G.setUnit(s, "session", G.clamp(anchor, 0, D.n - 1)); }
    else G.setRange(s, G.lb(D.T, R.ta, D.n), G.lb(D.T, R.tb, D.n), R.unit, R.ta, R.tb);
    s.restoring = false;
  }
  st.rebuild = function (s) {
    if (s.dead) return; s.rbDirty = false; s.lastRb = Date.now();
    var oldD = s.D, oldR = s.R, x = s.x, selKey = oldD && s.sel >= 0 && s.sel < oldD.n ? G.keyOf(oldD.v[s.sel]) : null, first = !oldD || oldD.n === 0;
    buildD(s); s.hist = null; s.histDirty = true; s.cache.clear(); s.lvCur = null; s.hov = -1; s.hovC = -1; G.buildIdxDust(s);
    if (!s.D) { s.sel = -1; s.M = null; s.R = { i0: 0, i1: 0, unit: "all", ta: 0, tb: 0 }; G.showState(s); s.ui.stats(); s.ui.arch(); s.invalidate(); G.invalidateDock(s); return; }
    G.resize(s);
    if (first) {
      s.sel = -1; s.mask = 0; s.query = ""; s.M = null; s.restoring = true;
      var want = parseInt(G.lsGet("gvVisitsLast") || "0", 10); if (want >= 1 && want <= s.D.n) { s.lastN = want; G.setUnit(s, "last"); } else { if (want >= 1) s.pendLast = want; G.setUnit(s, "all"); }
      s.restoring = false; x.layout(s);
      if (!s.panelInit) { s.panelInit = true; s.panelOpen = false; x.applyPanel(s); }
      G.fit(s, true);
    } else {
      s.sel = selKey ? G.indexOfKey(s.D, selKey) : -1; rebindRange(s, oldR, oldD); G.recomputeMatch(s);
      if (!s.touched && s.R.unit === "all") G.fit(s, false);
    }
    G.showState(s); s.ui.stats(); s.ui.unit(); s.ui.panel(); s.ui.arch(); s.invalidate(); G.invalidateDock(s); x.slow(s);
  };

  /* ---------- loading months, one call at a time, the newest first ---------- */
  function nextNeeded(s) {
    var ix = s.idx; if (!ix || Date.now() < (s.failUntil || 0)) return null; var i, mo, e;
    for (i = ix.months.length - 1; i >= 0; i--) { mo = ix.months[i]; if (!st.isActive(ix, mo)) break; e = s.mon.get(mo.m); if (!e || e.ir !== mo.r) return { kind: "a", mo: mo }; }
    if (s.arch) for (i = ix.months.length - 1; i >= 0; i--) { mo = ix.months[i]; if (s.arch.ms.indexOf(mo.m) < 0) continue; e = s.arch.mon.get(mo.m); if (!e || e.ir !== mo.r) return { kind: "h", mo: mo, gen: s.arch.gen }; }
    return null;
  }
  st.reconcile = function (s) {                // after a new index answer: months that left the active window are dropped, an archive month that became active is not archive any more
    var ix = s.idx, drop = [], ch = false; if (!ix) return false;
    s.mon.forEach(function (e, m) { var mo = ix.by.get(m); if (!mo || !st.isActive(ix, mo)) drop.push(m); }); drop.forEach(function (m) { s.mon.delete(m); ch = true; });
    if (s.arch) {
      s.arch.ms = s.arch.ms.filter(function (m) { var mo = ix.by.get(m); return mo && !st.isActive(ix, mo); });
      s.arch.mon.forEach(function (e, m) { if (s.arch.ms.indexOf(m) < 0) { s.arch.mon.delete(m); ch = true; } });
      if (!s.arch.ms.length) { s.gen++; s.arch = null; ch = true; }
    }
    return ch;
  };
  st.pump = function (s) {
    if (s.pumping || s.dead || !s.on) return; var need = nextNeeded(s);
    if (!need) { idle(s); return; }
    s.pumping = true; s.ui.arch(); var p; try { p = s.h.invoke("visits_month", { m: need.mo.m }); } catch (_) { p = Promise.reject(); }
    p.then(function (ans) {
      s.pumping = false; if (s.dead) return;
      var ok = need.kind === "a" ? st.isActive(s.idx, need.mo) && s.idx.by.get(need.mo.m) : (s.arch && s.arch.gen === need.gen && s.arch.ms.indexOf(need.mo.m) >= 0);   // a stale answer never brings back a dropped period
      if (!ans || !ans.stops) { s.failUntil = Date.now() + 3000; s.ui.arch(); return; }
      if (ok) {
        var e = { r: ans.r, ir: need.mo.r, stops: ans.stops };
        if (need.kind === "a") { s.mon.set(need.mo.m, e); s.rbDirty = true; if (!s.D || Date.now() - (s.lastRb || 0) > 400) st.rebuild(s); }
        else { s.arch.mon.set(need.mo.m, e); archStep(s); }
      }
      st.pump(s);
    }).catch(function () { s.pumping = false; if (!s.dead) { s.failUntil = Date.now() + 3000; s.ui.arch(); } });
  };
  function archStep(s) {
    var a = s.arch, done = a.ms.every(function (m) { return a.mon.has(m); });
    if (!a.ready && !done) { s.ui.arch(); return; }
    var was = a.ready; a.ready = true; st.rebuild(s);
    if (!was) { var p = a.pending; a.pending = null; if (p) { finishPage(s, p.unit, p.pa, p.pb, p.o); if (!(p.o && p.o.sel)) s.x.pageChanged(s); } }
  }
  function idle(s) {
    if (s.rbDirty) st.rebuild(s); s.ui.arch(); if (!s.D) return;
    if (s.pendLast) { if (!s.touched && s.R.unit === "all" && s.pendLast <= s.D.n) { s.lastN = s.pendLast; s.pendLast = 0; G.setUnit(s, "last"); s.x.pageChanged(s); } else s.pendLast = 0; }
    if (!s.scanning && !G.introDone && !s.touched) { G.introDone = true; s.x.startReplay(s); }
    if (s.pendSel) { var p = s.pendSel, i = findStop(s.D, p.t, p.sys); s.pendSel = null; if (i >= 0) s.x.goTo(s, i); }
  }

  /* ---------- pages that may need an older period ---------- */
  function finishPage(s, unit, pa, pb, o) {
    var D = s.D; if (!D) return; o = o || {};
    if (o.anchor) { var a = o.anchor, i = G.lb(D.T, a.t, D.n); if (i >= D.n || (a.dir < 0 && D.T[i] !== a.t)) i--; i = G.clamp(i, 0, D.n - 1); G.setUnit(s, a.unit, i); }
    else G.setRange(s, G.lb(D.T, pa, D.n), G.lb(D.T, pb, D.n), unit, pa, pb);
    if (o.sel) { var j = findStop(D, o.sel.t, o.sel.sys); if (j >= 0) s.x.select(s, j, true); else s.pendSel = o.sel; }
  }
  function pageLabel(s, unit, pa, pb, need) {          // what the chip says: the page the player asked for, not the UTC months it needed
    var f = s.f, mid = pa + (pb - pa) / 2;
    if (unit === "year") return f.yr(mid); if (unit === "month") return f.my(mid);
    return need.length === 1 ? f.myu(need[0].a) : f.myu(need[0].a) + " – " + f.myu(need[need.length - 1].a);
  }
  /** show the page [pa,pb): at once when its months are held, else load them as the archive slot and show it when they are there */
  st.openRange = function (s, unit, pa, pb, o) {
    o = o || {}; var ix = s.idx; if (!ix || !ix.months.length) { finishPage(s, unit, pa, pb, o); return true; }
    var ms = st.monthsFor(ix, pa, pb), need = ms.filter(function (mo) { return !st.isActive(ix, mo); });
    if (!need.length) { finishPage(s, unit, pa, pb, o); return true; }
    var lab = pageLabel(s, unit, pa, pb, need);
    if (s.arch && s.arch.ready && need.every(function (mo) { return s.arch.mon.has(mo.m); })) { s.arch.label = lab; s.ui.arch(); finishPage(s, unit, pa, pb, o); return true; }
    var total = need.reduce(function (a, mo) { return a + mo.n; }, 0);
    if (total > G.CAP) { s.ui.note(s.tr("vis.arch.big", { n: s.f.n(total) })); return false; }
    var old = s.arch; s.gen = (s.gen || 0) + 1;
    s.arch = { ms: need.map(function (mo) { return mo.m; }), mon: new Map(), ready: false, gen: s.gen, label: lab, pending: { unit: unit, pa: pa, pb: pb, o: o } };
    if (old) st.rebuild(s);                    // the old period leaves memory now
    s.ui.arch(); st.pump(s); return false;
  };
  st.closeArchive = function (s, silent) { if (!s.arch) return; s.gen = (s.gen || 0) + 1; s.arch = null; if (silent) { buildD(s); s.hist = null; s.histDirty = true; s.cache.clear(); s.lvCur = null; G.buildIdxDust(s); s.ui.arch(); } else st.rebuild(s); };

  /** the nearest time with data before (dir < 0) or after the page, looked up in the index when that month is not held */
  st.neighbour = function (s, dir) {
    var D = s.D, R = s.R, ix = s.idx, i, cand = null, mo, k; if (!D) return null;
    if (dir < 0) {
      i = G.lb(D.T, R.ta, D.n) - 1; if (i >= 0) cand = D.T[i];
      if (ix) { for (k = ix.months.length - 1; k >= 0; k--) { mo = ix.months[k]; if (mo.t0 < R.ta) break; mo = null; } if (mo && !st.loaded(s, mo.m)) { var c = Math.min(mo.t1, R.ta - 1); if (cand == null || c > cand) cand = c; } }
    } else {
      i = G.lb(D.T, R.tb, D.n); if (i < D.n) cand = D.T[i];
      if (ix) { for (k = 0; k < ix.months.length; k++) { mo = ix.months[k]; if (mo.t1 >= R.tb) break; mo = null; } if (mo && !st.loaded(s, mo.m)) { var c2 = Math.max(mo.t0, R.tb); if (cand == null || c2 < cand) cand = c2; } }
    }
    return cand;
  };
  st.goAnchor = function (s, u, t, dir) {
    var D = s.D, i = G.lb(D.T, t, D.n);
    if (i < D.n && D.T[i] === t) { G.setUnit(s, u, i); return; }
    var p = u === "session" ? G.periodOf(t, "month") : G.periodOf(t, u);
    st.openRange(s, u === "session" ? "month" : u, p[0], p[1], { anchor: { t: t, dir: dir, unit: u } });
  };
  st.goMonth = function (s, mo) { var p = G.periodOf(mo.t0 + (mo.t1 - mo.t0) / 2, "month"); st.openRange(s, "month", p[0], p[1]); };
  st.monthAt = function (s, t) { var ix = s.idx; if (!ix) return null; var best = null, bd = 1e18; ix.months.forEach(function (mo) { var d = t < mo.t0 ? mo.t0 - t : t > mo.t1 ? t - mo.t1 : 0; if (d < bd) { bd = d; best = mo; } }); return best; };
})();
