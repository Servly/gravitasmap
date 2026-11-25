"use strict";
// GRAVITAS Visits, the feed: asks Rust for the index (visits_index) every ~6 s (every ~1.5 s while Rust still scans the Journals), ONLY while the Visits tab
// is on screen and the window is visible. A month is fetched again only when its revision r changed (visits-store.js does that). Also the loading screen,
// and the faint "dust" of the older history, built ONCE from the month grids (500 ly cells), never from single stops.
(function () {
  var G = window.GVV, st = G.store;
  G.last = null;                                       // { resp, mon }: a language change builds the page again and starts from it (the archive is not kept)

  G.onIndex = function (s, resp) {
    if (s.dead || !resp) return;
    if (resp.rev != null) s.rev = resp.rev;
    s.resp = resp; s.scanning = !!resp.scanning;
    var keep = resp.keep !== false; s.ui.setKeep(keep); s.root.hidden = !keep; s.off.hidden = keep; if (!keep) return;
    s.idx = st.norm(resp); G.last = { resp: resp, mon: s.mon };
    var ch = st.reconcile(s);
    if (!s.idx.months.length) { s.mon.clear(); if (s.arch) { s.arch = null; s.gen++; } st.rebuild(s); return; }
    if (ch || (!s.D && s.mon.size)) s.rbDirty = true;                    // months already held (a language change builds the page again): show them at once
    G.showState(s); s.ui.stats(); s.ui.unit(); G.invalidateDock(s); s.histDirty = true;
    if (s.rbDirty) st.rebuild(s);
    st.pump(s);
  };
  G.poll = function (s) {
    if (s.dead || !s.on || s.busy) return; s.busy = true; clearTimeout(s.pt);
    var p; try { p = s.h.invoke("visits_index", s.rev != null && !s.scanning ? { rev: s.rev } : {}); } catch (_) { p = Promise.reject(); }
    p.then(function (r) { s.busy = false; if (s.dead) return; if (r && r.same) st.pump(s); else G.onIndex(s, r); G.schedule(s); })
      .catch(function () { s.busy = false; if (!s.dead) { if (!s.resp) { s.resp = { months: [], keep: true }; G.showState(s); } G.schedule(s, 6000); } });
  };
  G.schedule = function (s, ms) { clearTimeout(s.pt); if (s.dead || !s.on) return; s.pt = setTimeout(function () { G.poll(s); }, ms || (s.scanning || s.pumping || (s.arch && !s.arch.ready) ? 1500 : 6000)); };

  G.showState = function (s) {
    var e = s.e, r = s.resp, D = s.D, tr = s.tr, f = s.f, none = !D || D.n === 0, ix = s.idx;
    e.stage.classList.toggle("none", none); s.root.classList.toggle("vs-zero", none);
    if (none) {
      var ld = !r || !!r.scanning || !!(ix && ix.months.length);
      e.none.classList.toggle("ld", ld);
      if (r && r.scanning) { e.noneH.textContent = tr("vis.loading"); e.noneP.textContent = tr("vis.loading.sub"); e.plog.textContent = tr("vis.scan", { n: f.n(r.scanned || 0), m: f.n(r.files || 0) }); e.prog.style.width = Math.max(4, Math.min(100, Math.round(100 * (r.scanned || 0) / Math.max(1, r.files || 1)))) + "%"; }
      else if (ix && ix.months.length) {              // the index is here, the first months are on their way
        var act = ix.months.filter(function (mo) { return st.isActive(ix, mo); }), got = act.filter(function (mo) { return s.mon.has(mo.m); }).length;
        e.noneH.textContent = tr("vis.loading"); e.noneP.textContent = tr("vis.loading.sub"); e.plog.textContent = ""; e.prog.style.width = Math.max(6, Math.round(100 * got / Math.max(1, act.length))) + "%";
      }
      else if (r) { e.noneH.textContent = tr("vis.empty.h"); e.noneP.textContent = tr("vis.empty.p"); }
      else { e.noneH.textContent = tr("vis.loading"); e.noneP.textContent = tr("vis.loading.sub"); e.plog.textContent = ""; e.prog.style.width = "4%"; }
    }
    var line = "";
    if (r && r.scanning) line = tr("vis.scan", { n: f.n(r.scanned || 0), m: f.n(r.files || 0) });
    else if (r && r.since) { var t = G.tms(r.since); if (t) line = tr("vis.since", { d: f.dy(t) }); }
    if (e.st.textContent !== line) e.st.textContent = line;
    e.forget.disabled = !ix || !ix.months.length;
  };

  /* ---------- the older history as dust: one soft point per 500 ly grid cell that is not held as stops ---------- */
  G.buildIdxDust = function (s) {
    var ix = s.idx, map = new Map(), xs = [], zs = [], ns = []; s.idxDust = null; if (!ix) return;
    ix.months.forEach(function (mo) {
      if (st.loaded(s, mo.m)) return;
      for (var i = 0; i < mo.grid.length; i++) { var g = mo.grid[i], k = (g[0] + 4096) * 16384 + (g[1] + 4096), c = map.get(k); if (c === undefined) { c = xs.length; map.set(k, c); xs.push(-(g[0] + .5) * 500); zs.push((g[1] + .5) * 500); ns.push(0); } ns[c] += g[2]; }
    });
    if (xs.length) s.idxDust = { x: Float32Array.from(xs), z: Float32Array.from(zs), n: Float32Array.from(ns) };
  };
  G.drawIdxDust = function (s, c, sc, cp) {
    var du = s.idxDust; if (!du || sc > .12) return; var cam = s.cam, W = s.W, H = s.H, fade = sc > .06 ? (.12 - sc) / .06 : 1;
    c.fillStyle = "rgba(143,123,216,1)";
    for (var q = 0; q < du.x.length; q++) {
      var X = cam.ox + (du.x[q] - cam.cx) * sc, Y = cam.oy + (du.z[q] - cam.cz) * cp * sc; if (X < -4 || X > W + 4 || Y < -4 || Y > H + 4) continue;
      var lg = Math.log10(du.n[q] + 1), r = .8 + Math.min(1.5, lg * .6); c.globalAlpha = (.12 + .2 * Math.min(1, lg / 3)) * fade; c.fillRect(X - r, Y - r, r * 2, r * 2);
    }
    c.globalAlpha = 1;
  };
})();
