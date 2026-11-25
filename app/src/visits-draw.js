"use strict";
// GRAVITAS Visits, part 2 of 4: the picture. Canvas 2D, no libraries, nothing loaded from the network.
// Level of detail (exact rules, see research/ui-mock/visits/DESIGN.md): a page with up to 300 stops (or up to ~250 on screen) draws every stop,
// otherwise the stops fall into world-fixed grid cells (groups), stops outside the page are quiet dust. Idle cost is zero:
// requestAnimationFrame is asked for only by invalidate() and only while the page is on screen and the window is visible.
(function () {
  var G = window.GVV, clamp = G.clamp, KIND = G.KIND, KCOL = G.KCOL, PRI = G.PRI;
  G.raf = 0;                                          // frames drawn (all pages), for the idle measurement
  var SPR = {}, TILE = 512, tiles = null, disc = null, seed = 7, fontFam = null;
  function rnd() { return (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296; }
  function sprite(col) {
    if (SPR[col]) return SPR[col];
    var c = document.createElement("canvas"); c.width = c.height = 64; var x = c.getContext("2d");
    var g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, col + "ff"); g.addColorStop(.25, col + "88"); g.addColorStop(.6, col + "22"); g.addColorStop(1, col + "00");
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); return SPR[col] = c;
  }
  function makeTiles() {                              // three star layers, baked once, moved at 5, 11 and 22 % of the pan (parallax)
    if (tiles) return; tiles = [];
    [{ n: 70, a: .35, r: .7, f: .05 }, { n: 45, a: .55, r: 1, f: .11 }, { n: 22, a: .85, r: 1.4, f: .22 }].forEach(function (l) {
      var c = document.createElement("canvas"); c.width = c.height = TILE; var x = c.getContext("2d");
      for (var i = 0; i < l.n; i++) {
        var px = rnd() * TILE, py = rnd() * TILE, t = rnd(), col = t < .2 ? "#ffd2f0" : t < .5 ? "#cfe8ff" : "#e9ddff";
        x.globalAlpha = l.a * (.5 + rnd() * .5); x.fillStyle = col; x.beginPath(); x.arc(px, py, l.r * (.6 + rnd() * .7), 0, 6.283); x.fill();
        if (l.r > 1 && rnd() < .5) { x.globalAlpha = .12; x.beginPath(); x.arc(px, py, l.r * 3.2, 0, 6.283); x.fill(); }
      }
      tiles.push({ c: c, f: l.f });
    });
  }
  function makeDisc() {                               // soft galaxy disc, 1024 px = 96,000 ly (an illustration, not a star map)
    var S = 1024, c = document.createElement("canvas"); c.width = c.height = S; var x = c.getContext("2d");
    var g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); g.addColorStop(0, "rgba(255,170,230,.55)"); g.addColorStop(.06, "rgba(210,140,255,.32)"); g.addColorStop(.25, "rgba(120,80,220,.16)"); g.addColorStop(.6, "rgba(70,50,170,.07)"); g.addColorStop(1, "rgba(40,30,120,0)");
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    var sd = 99, r2 = function () { return (sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296; };
    for (var a = 0; a < 4; a++) for (var i = 0; i < 5200; i++) {
      var t = Math.pow(r2(), .75), th = t * 5.4 + a * Math.PI / 2 + (r2() - .5) * .55 * (1 - t * .5), rad = (.06 + t * .9) * S / 2;
      x.globalAlpha = .04 + .1 * (1 - t); x.fillStyle = r2() < .3 ? "#ff9be3" : r2() < .5 ? "#8fd8ff" : "#c9a8ff";
      x.beginPath(); x.arc(S / 2 + Math.cos(th) * rad, S / 2 + Math.sin(th) * rad, .45 + r2() * 1.1 * (1 - t * .5), 0, 6.283); x.fill();
    }
    x.globalAlpha = 1; return disc = c;
  }
  function hexRGB(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  var RAMP = ["#4fb6ff", "#7f8cff", "#a77bff", "#d36fe8", "#ff6ad5"].map(hexRGB);
  function ramp(t) { t = clamp(t, 0, 1) * (RAMP.length - 1); var i = Math.min(RAMP.length - 2, t | 0), f = t - i, a = RAMP[i], b = RAMP[i + 1]; return [a[0] + (b[0] - a[0]) * f | 0, a[1] + (b[1] - a[1]) * f | 0, a[2] + (b[2] - a[2]) * f | 0]; }
  var NB = 12, BUCKET_COL = []; for (var bi = 0; bi < NB; bi++) BUCKET_COL.push(ramp(bi / (NB - 1)));
  G.ramp = ramp;

  /* ---------- canvas size ---------- */
  G.resize = function (s) {
    var sw = s.e.stage.clientWidth, sh = s.e.stage.clientHeight; if (sw < 50 || sh < 50) return false;   // the tab is hidden: keep the old size (layout size: the page-in animation must not change it)
    s.W = Math.max(300, sw); s.H = Math.max(300, sh);
    s.dpr = s.FX ? Math.min(2, devicePixelRatio || 1) : 1;
    [s.e.bg, s.e.fg].forEach(function (c) { c.width = Math.round(s.W * s.dpr); c.height = Math.round(s.H * s.dpr); });
    var tw = s.e.tlc.clientWidth | 0; if (tw < 50) tw = s.tlW || 600; s.tlW = tw;
    s.e.tlc.width = Math.round(tw * s.dpr); s.e.tlc.height = Math.round(54 * s.dpr);
    s.histDirty = true; s.staticBg = false; return true;
  };

  /* ---------- camera ---------- */
  G.freeRect = function (s) { var po = s.panelOpen; return { l: 16, r: s.W - (po ? 330 : 16) - (po ? 0 : 52), t: Math.max(64, s.topInset || 84), b: s.H - 118 }; };
  G.fit = function (s, instant) {
    var D = s.D, R = s.R; if (!D || R.i1 <= R.i0) return;
    var x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, ys = [], step = Math.max(1, ((R.i1 - R.i0) / 400) | 0), i;
    for (i = R.i0; i < R.i1; i++) { if (D.X[i] < x0) x0 = D.X[i]; if (D.X[i] > x1) x1 = D.X[i]; if (D.Z[i] < z0) z0 = D.Z[i]; if (D.Z[i] > z1) z1 = D.Z[i]; if ((i - R.i0) % step === 0) ys.push(D.Y[i]); }
    ys.sort(function (a, b) { return a - b; });
    var fr = G.freeRect(s), bw = Math.max(x1 - x0, 8), bh = Math.max(z1 - z0, 8), cp = Math.cos(s.tgt.pitch), t = s.tgt;
    var sc = clamp(Math.min((fr.r - fr.l) / bw, (fr.b - fr.t) / (bh * cp)) * .86, .004, 2.5);
    t.cx = (x0 + x1) / 2; t.cz = (z0 + z1) / 2; t.cy = ys[ys.length >> 1] || 0; t.ls = Math.log(sc); t.ox = (fr.l + fr.r) / 2; t.oy = (fr.t + fr.b) / 2;
    if (instant) Object.assign(s.cam, t); s.invalidate();
  };
  function stepCam(s, dt) {
    var k = 1 - Math.exp(-dt * 11), more = false, cam = s.cam, tgt = s.tgt;
    ["cx", "cz", "cy", "ls", "ox", "oy", "pitch"].forEach(function (p) {
      var d = tgt[p] - cam[p], eps = p === "ls" ? .0008 : p === "pitch" ? .002 : p === "cy" ? .2 : p === "ox" || p === "oy" ? .3 : .15 / Math.exp(cam.ls);
      if (Math.abs(d) < eps) cam[p] = tgt[p]; else { cam[p] += d * k; more = true; }
    });
    return more;
  }
  function camDiffers(s) { for (var p in s.tgt) if (Math.abs(s.tgt[p] - s.cam[p]) > 1e-6) return true; return false; }
  G.unproj = function (mx, my, c) { var sc = Math.exp(c.ls), cp = Math.cos(c.pitch); return [c.cx + (mx - c.ox) / sc, c.cz + (my - c.oy) / (sc * cp)]; };
  G.zoomAt = function (s, mx, my, f) {
    var t = s.tgt, w = G.unproj(mx, my, t), ls = clamp(t.ls + Math.log(f), Math.log(.003), Math.log(45)), sc = Math.exp(ls), cp = Math.cos(t.pitch);
    t.ls = ls; t.cx = w[0] - (mx - t.ox) / sc; t.cz = w[1] - (my - t.oy) / (sc * cp); s.invalidate();
  };

  /* ---------- level of detail ---------- */
  function chooseLevel(s) {
    var D = s.D, R = s.R, cam = s.cam, sc = Math.exp(cam.ls), nr = R.i1 - R.i0, cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    if (nr <= 300) { s.indiv = true; return null; }
    var cnt = 0, lim = s.indiv ? 350 : 250, ox = cam.ox, oy = cam.oy;
    for (var i = R.i0; i < R.i1 && cnt <= lim; i++) { var x = ox + (D.X[i] - cam.cx) * sc, y = oy + ((D.Z[i] - cam.cz) * cp - (D.Y[i] - cam.cy) * sp) * sc; if (x > -10 && x < s.W + 10 && y > -10 && y < s.H + 10) cnt++; }
    s.indiv = cnt <= lim; if (s.indiv) return null;
    return Math.ceil(Math.log2((s.FX ? 38 : 52) / sc));      // cell = 2^L light years, world-aligned: groups do not move while panning
  }
  function buildLevel(s, L) {
    var key = "L" + L, lv = s.cache.get(key); if (lv) return lv;
    var D = s.D, R = s.R, M = s.M, i0 = R.i0, nr = R.i1 - R.i0, cid = new Int32Array(nr), nc = 0, k, q;
    if (L === null) { for (k = 0; k < nr; k++) cid[k] = k; nc = nr; }
    else { var cell = Math.pow(2, L), map = new Map(); for (k = 0; k < nr; k++) { var i = i0 + k, k2 = Math.floor(D.X[i] / cell) * 4194304 + Math.floor(D.Z[i] / cell), c = map.get(k2); if (c === undefined) { c = nc++; map.set(k2, c); } cid[k] = c; } }
    lv = { L: L, nc: nc, cid: cid, cx: new Float32Array(nc), cy: new Float32Array(nc), cz: new Float32Array(nc), n: new Int32Array(nc), m: new Int32Array(nc), f: new Uint8Array(nc), kc: new Uint32Array(nc * 6),
      first: new Int32Array(nc).fill(-1), last: new Int32Array(nc), earn: new Float64Array(nc), px: new Float32Array(nc), py: new Float32Array(nc) };
    for (k = 0; k < nr; k++) {
      var j = i0 + k, g = cid[k]; lv.cx[g] += D.X[j]; lv.cy[g] += D.Y[j]; lv.cz[g] += D.Z[j]; lv.n[g]++; if (!M || M[j]) lv.m[g]++; lv.f[g] |= D.F[j]; lv.earn[g] += D.EARN[j];
      for (q = 0; q < 6; q++) lv.kc[g * 6 + q] += D.F[j] >> q & 1; if (lv.first[g] < 0) lv.first[g] = k; lv.last[g] = k;
    }
    for (var h = 0; h < nc; h++) { var n = lv.n[h]; lv.cx[h] /= n; lv.cy[h] /= n; lv.cz[h] /= n; }
    if (s.cache.size > 5) s.cache.clear(); s.cache.set(key, lv); return lv;
  }
  function buildDust(s, L) {                            // everything OUTSIDE the page, one grid level coarser
    var key = "D" + L, d = s.cache.get(key); if (d) return d;
    var D = s.D, R = s.R, cell = Math.pow(2, L + 1), map = new Map(), xs = [], zs = [], ys = [], ns = [];
    function add(i) { var k = Math.floor(D.X[i] / cell) * 4194304 + Math.floor(D.Z[i] / cell), c = map.get(k); if (c === undefined) { c = xs.length; map.set(k, c); xs.push(0); zs.push(0); ys.push(0); ns.push(0); } xs[c] += D.X[i]; zs[c] += D.Z[i]; ys[c] += D.Y[i]; ns[c]++; }
    var i; for (i = 0; i < R.i0; i++) add(i); for (i = R.i1; i < D.n; i++) add(i);
    for (var c = 0; c < xs.length; c++) { xs[c] /= ns[c]; zs[c] /= ns[c]; ys[c] /= ns[c]; }
    d = { x: Float32Array.from(xs), y: Float32Array.from(ys), z: Float32Array.from(zs), n: Int32Array.from(ns) }; s.cache.set(key, d); return d;
  }

  /* ---------- drawing ---------- */
  function renderBg(s) {
    var bg = s.bg, W = s.W, H = s.H, cam = s.cam, sc = Math.exp(cam.ls), cp = Math.cos(cam.pitch), g;
    if (!s.FX) {                                        // Reduced effects: one static background, drawn once
      if (!s.staticBg) { bg.setTransform(1, 0, 0, 1, 0, 0); g = bg.createRadialGradient(W * .5, H * .45, 20, W * .5, H * .45, Math.max(W, H) * .7); g.addColorStop(0, "#150d2a"); g.addColorStop(1, "#05030c"); bg.fillStyle = g; bg.fillRect(0, 0, W, H); s.staticBg = true; }
      return;
    }
    bg.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    g = bg.createRadialGradient(W * .5, H * .45, 20, W * .5, H * .45, Math.max(W, H) * .75); g.addColorStop(0, "#160e2c"); g.addColorStop(.6, "#0a0618"); g.addColorStop(1, "#04030a"); bg.fillStyle = g; bg.fillRect(0, 0, W, H);
    if (!disc) makeDisc();
    var da = clamp((0.3 - sc) / 0.28, 0, 1) * .9;
    if (da > 0.02) { bg.save(); bg.globalAlpha = da; bg.translate(cam.ox + (25 - cam.cx) * sc, cam.oy + (25899 - cam.cz) * cp * sc); bg.scale(sc, sc * cp); bg.drawImage(disc, -48000, -48000, 96000, 96000); bg.restore(); }
    for (var ti = 0; ti < tiles.length; ti++) { var t = tiles[ti], ox = ((s.accPan[0] * t.f) % TILE + TILE) % TILE, oy = ((s.accPan[1] * t.f) % TILE + TILE) % TILE; for (var x = ox - TILE; x < W; x += TILE) for (var y = oy - TILE; y < H; y += TILE) bg.drawImage(t.c, x | 0, y | 0); }
  }
  function pickKind(kc, q) { for (var i = 0; i < PRI.length; i++) if (kc[q * 6 + PRI[i]] > 0) return PRI[i]; return 0; }
  function radiusOf(lv, q, r0) { var n = lv.n[q]; return n === 1 ? (lv.f[q] ? r0 + 2.2 : Math.max(1.8, r0 * .5)) : Math.min(20, 6 + 2.3 * Math.log2(n)); }
  function ringAt(c, x, y, r, col, w) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.stroke(); }
  function ring(c, x, y, r, kc, q, w) {
    var tot = 0, k, v; for (k = 0; k < 6; k++) tot += kc[q * 6 + k] > 0 ? Math.sqrt(kc[q * 6 + k]) : 0; if (!tot) return; var a = -1.5708; c.lineWidth = w;
    for (k = 0; k < 6; k++) { v = kc[q * 6 + k] > 0 ? Math.sqrt(kc[q * 6 + k]) : 0; if (!v) continue; var da = v / tot * 6.283; c.strokeStyle = KCOL[KIND[k]]; c.beginPath(); c.arc(x, y, r, a + .05, a + da - .05); c.stroke(); a += da; }
  }
  function marker(s, c, lv, px, py, k, txt, col) {
    var q = lv.cid[k], X = px[q], Y = py[q]; if (X < 0 || X > s.W || Y < 0 || Y > s.H) return;
    c.font = '700 9.5px "Segoe UI",system-ui,sans-serif'; var w = c.measureText(txt).width + 12, yy = Y - radiusOf(lv, q, 3) - 16;
    c.fillStyle = "rgba(10,6,22,.9)"; c.strokeStyle = col; c.lineWidth = 1; c.beginPath(); c.roundRect(X - w / 2, yy - 8, w, 16, 8); c.fill(); c.stroke();
    c.fillStyle = col; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(txt, X, yy + .5); c.textAlign = "left";
  }
  function labels(s, c, lv, px, py, order) {
    var D = s.D, R = s.R, cand = [], j, q;
    for (j = 0; j < order.length; j += 4) { q = order[j]; if (lv.n[q] !== 1) continue; var X = px[q], Y = py[q]; if (X < 10 || X > s.W - 10 || Y < (s.topInset || 84) - 20 || Y > s.H - 120) continue; cand.push([q, (lv.f[q] ? 2 : 0) + (R.i0 + lv.first[q] === s.sel ? 5 : 0) + lv.first[q] / R.i1]); }
    cand.sort(function (a, b) { return b[1] - a[1]; }); var boxes = [], shown = 0; c.font = '600 11px "Segoe UI",system-ui,sans-serif'; c.textBaseline = "middle";
    for (var ci = 0; ci < cand.length && shown < 34; ci++) {
      q = cand[ci][0]; var name = D.v[R.i0 + lv.first[q]].sys || "", w = c.measureText(name).width, x = px[q] + 10, y = py[q] - 1, bx = x - 3, by = y - 8, bw = w + 6, bh = 16;
      if (bx + bw > s.W - 8) continue; var ok = true; for (var b = 0; b < boxes.length; b++) { var o = boxes[b]; if (bx < o[0] + o[2] && bx + bw > o[0] && by < o[1] + o[3] && by + bh > o[1]) { ok = false; break; } }
      if (!ok) continue; boxes.push([bx, by, bw, bh]); shown++;
      c.lineWidth = 3; c.strokeStyle = "rgba(4,3,10,.85)"; c.strokeText(name, x, y); c.fillStyle = "rgba(233,221,255,.92)"; c.fillText(name, x, y);
    }
  }
  function drawGrid(s, c, sc, cp) {
    var steps = [100, 250, 500, 1000, 2500, 5000, 10000, 25000], g = steps[steps.length - 1], i; for (i = 0; i < steps.length; i++) if (steps[i] * sc >= 80) { g = steps[i]; break; }
    var cam = s.cam, ox = cam.ox, oy = cam.oy, W = s.W, H = s.H, wx0 = cam.cx - ox / sc, wx1 = cam.cx + (W - ox) / sc, wz0 = cam.cz - oy / (sc * cp), wz1 = cam.cz + (H - oy) / (sc * cp);
    if ((wx1 - wx0) / g > 60 || (wz1 - wz0) / g > 60) return;
    c.strokeStyle = "rgba(190,120,255,.075)"; c.lineWidth = 1; c.beginPath();
    for (var x = Math.ceil(wx0 / g) * g; x <= wx1; x += g) { var X = Math.round(ox + (x - cam.cx) * sc) + .5; c.moveTo(X, 0); c.lineTo(X, H); }
    for (var z = Math.ceil(wz0 / g) * g; z <= wz1; z += g) { var Y = Math.round(oy + ((z - cam.cz) * cp + cam.cy * Math.sin(cam.pitch)) * sc) + .5; c.moveTo(0, Y); c.lineTo(W, Y); }
    c.stroke();
  }
  function scaleBar(s, sc) {
    var steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000], v = steps[0]; for (var i = 0; i < steps.length; i++) if (steps[i] * sc <= 130) v = steps[i];
    var w = Math.round(v * sc) + "px", t = s.tr("vis.ly", { n: s.f.n(v) }); if (s.e.scBar.style.width !== w) s.e.scBar.style.width = w; if (s.e.scTxt.textContent !== t) s.e.scTxt.textContent = t;
  }
  G.render = function (s) {
    var t0 = performance.now(), D = s.D, R = s.R, cam = s.cam, f = s.f;
    var sc = Math.exp(cam.ls), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), ox = cam.ox, oy = cam.oy, W = s.W, H = s.H;
    makeTiles(); renderBg(s);
    var c = s.fg; c.setTransform(s.dpr, 0, 0, s.dpr, 0, 0); c.clearRect(0, 0, W, H); c.lineCap = "round"; c.lineJoin = "round";
    if (!D || R.i1 <= R.i0) return;
    var L = chooseLevel(s), lv = buildLevel(s, L); s.lvCur = lv;
    var lodInfo = L === null ? s.tr("vis.lod.ind", { n: f.n(R.i1 - R.i0) }) : s.tr("vis.lod.grp", { c: f.n(Math.pow(2, L)), g: f.n(lv.nc), n: f.n(R.i1 - R.i0) });
    var nr = R.i1 - R.i0, nc = lv.nc, filtered = !!s.M, q, k, b;
    var px = lv.px, py = lv.py, cx = lv.cx, cy = lv.cy, cz = lv.cz;
    for (q = 0; q < nc; q++) { px[q] = ox + (cx[q] - cam.cx) * sc; py[q] = oy + ((cz[q] - cam.cz) * cp - (cy[q] - cam.cy) * sp) * sc; }
    drawGrid(s, c, sc, cp);
    if (R.i0 > 0 || R.i1 < D.n) {                       // dust: the stops outside the page
      var du = buildDust(s, L === null ? Math.ceil(Math.log2(38 / sc)) : L); c.fillStyle = "rgba(167,123,255,.5)";
      for (q = 0; q < du.x.length; q++) { var X = ox + (du.x[q] - cam.cx) * sc, Y = oy + ((du.z[q] - cam.cz) * cp - (du.y[q] - cam.cy) * sp) * sc; if (X < -4 || X > W + 4 || Y < -4 || Y > H + 4) continue; var r = .9 + Math.min(1.6, Math.log10(du.n[q] + 1) * .9); c.globalAlpha = .25 + .3 * Math.min(1, Math.log10(du.n[q] + 1) / 2); c.fillRect(X - r, Y - r, r * 2, r * 2); }
      c.globalAlpha = 1;
    }
    c.font = "600 10.5px " + (fontFam || (fontFam = getComputedStyle(document.body).fontFamily)); c.textBaseline = "middle";
    G.LANDMARKS.forEach(function (m) {
      var X = ox + (m.x - cam.cx) * sc, Y = oy + ((m.z - cam.cz) * cp - (m.y - cam.cy) * sp) * sc; if (X < -40 || X > W + 40 || Y < -20 || Y > H + 20) return;
      c.strokeStyle = "rgba(233,221,255,.45)"; c.lineWidth = 1; c.beginPath(); c.moveTo(X, Y - 5); c.lineTo(X + 5, Y); c.lineTo(X, Y + 5); c.lineTo(X - 5, Y); c.closePath(); c.stroke();
      c.fillStyle = "rgba(233,221,255,.55)"; c.fillText(m.n, X + 9, Y);
    });
    // route: one polyline through the groups in the order you visited them, 12 colour buckets by age
    var replay = s.replay, kmax = replay ? Math.min(nr - 1, Math.floor(replay.p * nr)) : nr - 1, segs = 0, cid = lv.cid, trail = Math.max(12, nr * .04), paths = new Array(NB);
    for (b = 0; b < NB; b++) paths[b] = null;
    var prev = cid[0];
    for (k = 1; k <= kmax; k++) {
      q = cid[k]; if (q === prev) continue; var ax = px[prev], ay = py[prev], bx = px[q], by = py[q]; prev = q;
      if ((ax < -30 && bx < -30) || (ax > W + 30 && bx > W + 30) || (ay < -30 && by < -30) || (ay > H + 30 && by > H + 30)) continue;
      if (Math.abs(ax - bx) < .5 && Math.abs(ay - by) < .5) continue;
      b = replay ? Math.min(NB - 1, Math.max(0, NB - 1 - Math.floor((kmax - k) / trail * NB))) : Math.min(NB - 1, Math.floor(k / nr * NB));
      (paths[b] || (paths[b] = new Path2D())).moveTo(ax, ay); paths[b].lineTo(bx, by); segs++;
    }
    var dim = filtered ? .4 : 1, gdim = clamp(260 / Math.max(segs, 1), .3, 1); s.perf.segs = segs;
    if (s.FX) c.globalCompositeOperation = "lighter";
    for (b = 0; b < NB; b++) {
      var p = paths[b]; if (!p) continue; var col = BUCKET_COL[b], a = replay ? (.15 + .85 * b / (NB - 1)) : (.55 + .45 * b / (NB - 1));
      if (s.FX) { c.strokeStyle = "rgba(" + col[0] + "," + col[1] + "," + col[2] + "," + (.07 * a * dim * 1.6 * gdim) + ")"; c.lineWidth = 7; c.stroke(p); c.strokeStyle = "rgba(" + col[0] + "," + col[1] + "," + col[2] + "," + (.2 * a * dim * 1.4 * gdim) + ")"; c.lineWidth = 3; c.stroke(p); }
      c.strokeStyle = "rgba(" + Math.min(255, col[0] + 40) + "," + Math.min(255, col[1] + 40) + "," + Math.min(255, col[2] + 40) + "," + ((s.FX ? .85 : .7) * a * dim) + ")"; c.lineWidth = s.FX ? 1.1 : 1.2; c.stroke(p);
    }
    c.globalCompositeOperation = "source-over";
    // groups and stops: pass 1 glow, pass 2 cores
    var r0 = clamp(2 + Math.log2(sc * 200) * .9, 1.8, 9), hn = 0, showAll = !replay, hit = s.hit, gScale = clamp(140 / Math.max(s.perf.nodes, 1), .18, 1), order = [];
    if (s.FX) c.globalCompositeOperation = "lighter";
    for (q = 0; q < nc; q++) {
      var X2 = px[q], Y2 = py[q]; if (X2 < -30 || X2 > W + 30 || Y2 < -30 || Y2 > H + 30) continue; if (!showAll && lv.first[q] > kmax) continue;
      var n = lv.n[q], active = lv.f[q] !== 0, R_, col2;
      if (n === 1) { R_ = active ? r0 + 2.2 : Math.max(1.8, r0 * .5); col2 = active ? KCOL[KIND[pickKind(lv.kc, q)]] : "#9aa8ff"; } else { R_ = Math.min(20, 6 + 2.3 * Math.log2(n)); col2 = active ? KCOL[KIND[pickKind(lv.kc, q)]] : "#a77bff"; }
      if (replay) { var age = kmax - lv.first[q]; R_ *= 1 + .9 * Math.exp(-age / (nr * .025)); }
      var mm = filtered ? (lv.m[q] > 0 ? 1 : .18) : 1;
      if (hn < 4096) { hit.x[hn] = X2; hit.y[hn] = Y2; hit.r[hn] = R_; hit.id[hn] = q; hn++; }
      order.push(q, R_, mm, col2);
      if (s.FX && mm > .5) { var gr = R_ * (n === 1 ? (active ? 3.4 : 2.4) : 2.2); c.globalAlpha = (active ? .75 : .4) * mm * gScale; c.drawImage(sprite(col2), X2 - gr, Y2 - gr, gr * 2, gr * 2); }
    }
    hit.n = hn; c.globalCompositeOperation = "source-over"; c.globalAlpha = 1;
    var ringOK = s.indiv && r0 >= 5.5;
    for (var j = 0; j < order.length; j += 4) {
      q = order[j]; var Rr = order[j + 1], m2 = order[j + 2], cl = order[j + 3], X3 = px[q], Y3 = py[q], n3 = lv.n[q], act = lv.f[q] !== 0;
      c.globalAlpha = m2;
      if (n3 === 1) {
        var i = R.i0 + lv.first[q]; c.fillStyle = act ? "#0b0618" : cl; c.strokeStyle = cl; c.lineWidth = 1.6; c.beginPath();
        if (D.how[i] === 2) { c.moveTo(X3, Y3 - Rr * 1.2); c.lineTo(X3 + Rr * 1.2, Y3); c.lineTo(X3, Y3 + Rr * 1.2); c.lineTo(X3 - Rr * 1.2, Y3); c.closePath(); } else c.arc(X3, Y3, Rr, 0, 6.283);
        c.fill(); if (act) c.stroke();
        if (act) { c.fillStyle = cl; c.beginPath(); c.arc(X3, Y3, Math.max(1.2, Rr * .45), 0, 6.283); c.fill(); }
        if (ringOK && act) ring(c, X3, Y3, Rr + 3, lv.kc, q, 2);
      } else {
        c.fillStyle = "rgba(16,9,32,.9)"; c.strokeStyle = "rgba(167,123,255,.8)"; c.lineWidth = 1.3; c.beginPath(); c.arc(X3, Y3, Rr, 0, 6.283); c.fill(); c.stroke();
        if (act) ring(c, X3, Y3, Rr + 3, lv.kc, q, 2.4);
        c.fillStyle = "#f1e8ff"; c.font = "700 " + (Rr > 14 ? 11.5 : 10) + 'px "Segoe UI",system-ui,sans-serif'; c.textAlign = "center"; c.fillText(f.k(n3), X3, Y3 + .5); c.textAlign = "left";
      }
    }
    c.globalAlpha = 1;
    if (cam.pitch > .15 && s.indiv) {                   // depth drop lines when tilted
      c.strokeStyle = "rgba(167,123,255,.22)"; c.lineWidth = 1; c.beginPath();
      for (q = 0; q < nc && q < 400; q++) { var X4 = px[q], Y4 = py[q]; if (X4 < 0 || X4 > W || Y4 < 0 || Y4 > H) continue; var Y0 = oy + ((cz[q] - cam.cz) * cp + cam.cy * sp) * sc; if (Math.abs(Y0 - Y4) > 4) { c.moveTo(X4, Y4); c.lineTo(X4, Y0); } }
      c.stroke();
    }
    marker(s, c, lv, px, py, 0, s.tr("vis.m.start"), "#7dff9b"); if (!replay) marker(s, c, lv, px, py, nr - 1, s.tr("vis.m.latest"), "#ff6ad5");
    if (replay && kmax >= 0) {                          // replay head: a comet
      var hq = cid[kmax]; if (s.FX) { c.globalCompositeOperation = "lighter"; c.drawImage(sprite("#ffd6f6"), px[hq] - 34, py[hq] - 34, 68, 68); c.globalCompositeOperation = "source-over"; }
      c.fillStyle = "#fff"; c.beginPath(); c.arc(px[hq], py[hq], 3, 0, 6.283); c.fill(); s.ui.caption(R.i0 + kmax);
    }
    if (s.indiv && hn <= 200 && !replay) labels(s, c, lv, px, py, order);
    if (s.hovC >= 0 && s.hovC < nc) ringAt(c, px[s.hovC], py[s.hovC], radiusOf(lv, s.hovC, r0) + 5, "rgba(255,255,255,.9)", 1.5);
    if (s.sel >= R.i0 && s.sel < R.i1) { var sq = cid[s.sel - R.i0], rr = radiusOf(lv, sq, r0) + 6; ringAt(c, px[sq], py[sq], rr, "#6ae8ff", 2); ringAt(c, px[sq], py[sq], rr + 7, "rgba(106,232,255,.35)", 1); }
    scaleBar(s, sc);
    if (s.e.lod.textContent !== lodInfo) s.e.lod.textContent = lodInfo;
    s.perf.ring[s.perf.n++ % 240] = performance.now() - t0; s.perf.nodes = hn; s.perf.renders++;
    if (s.perfOn) s.ui.perf();
    G.dockDraw(s);
  };

  /* ---------- timeline: a histogram of all stops, the page is the lit window ---------- */
  function tlRange(s) { var D = s.D, sp = D.tmax - D.tmin; return [D.tmin - sp * .02 - 3.6e6, D.tmax + sp * .02 + 3.6e6]; }
  G.tlX = function (s, t) { var r = tlRange(s); return (t - r[0]) / (r[1] - r[0]) * s.tlW; };
  G.tlT = function (s, x) { var r = tlRange(s); return r[0] + x / s.tlW * (r[1] - r[0]); };
  function buildHist(s) {
    var D = s.D, M = s.M, nb = Math.max(20, (s.tlW / 3) | 0), h = { nb: nb, c: new Float32Array(nb), m: new Float32Array(nb), mx: 1 }, a = G.tlT(s, 0), b = G.tlT(s, s.tlW);
    for (var i = 0; i < D.n; i++) { var k = Math.min(nb - 1, Math.max(0, ((D.T[i] - a) / (b - a) * nb) | 0)); h.c[k]++; if (M && M[i]) h.m[k]++; else if (!M && D.F[i]) h.m[k]++; }
    for (var j = 0; j < nb; j++) h.mx = Math.max(h.mx, h.c[j]); s.hist = h; s.histDirty = false;
  }
  G.dockDraw = function (s) {
    var D = s.D, R = s.R; if (!D) return; if (s.histDirty || !s.hist) buildHist(s);
    var c = s.tl, hist = s.hist, tlW = s.tlW, f = s.f; c.setTransform(s.dpr, 0, 0, s.dpr, 0, 0); var h = 54; c.clearRect(0, 0, tlW, h);
    var bw = tlW / hist.nb, base = h - 14, bh = base - 4, x0 = G.tlX(s, R.ta), x1 = G.tlX(s, R.tb), k;
    for (k = 0; k < hist.nb; k++) {
      var v = hist.c[k]; if (!v) continue; var x = k * bw, inR = x + bw > x0 && x < x1, hh = Math.max(1.5, Math.sqrt(v / hist.mx) * bh), col = G.ramp(k / hist.nb);
      c.fillStyle = "rgba(" + col[0] + "," + col[1] + "," + col[2] + "," + (inR ? .9 : .32) + ")"; c.fillRect(x, base - hh, Math.max(1, bw - .6), hh);
      var mv = hist.m[k]; if (mv) { var mh = Math.max(1.5, Math.sqrt(mv / hist.mx) * bh); c.fillStyle = inR ? "rgba(125,255,155,.95)" : "rgba(125,255,155,.45)"; c.fillRect(x, base - mh, Math.max(1, bw - .6), Math.min(mh, hh)); }
    }
    c.strokeStyle = "rgba(190,120,255,.3)"; c.lineWidth = 1; c.beginPath(); c.moveTo(0, base + .5); c.lineTo(tlW, base + .5); c.stroke();
    c.fillStyle = "rgba(157,140,192,.9)"; c.font = '10px "Segoe UI",system-ui,sans-serif'; c.textBaseline = "top";
    var span = G.tlT(s, tlW) - G.tlT(s, 0), pxPerDay = tlW / (span / 864e5), unit = pxPerDay > 60 ? 1 : pxPerDay > 12 ? 7 : pxPerDay > 4 ? 30 : pxPerDay > 1.2 ? 91 : 365;
    var t = new Date(G.tlT(s, 0)); t = unit === 1 ? new Date(t.getFullYear(), t.getMonth(), t.getDate()) : new Date(t.getFullYear(), unit >= 365 ? 0 : t.getMonth(), 1);
    var lastLabel = -99;
    for (var g = 0; g < 400; g++) {
      var tx = G.tlX(s, +t); if (tx > tlW) break;
      if (tx >= 0 && tx - lastLabel > 54) { c.fillRect(tx, base, 1, 3); c.fillText(unit === 365 || (t.getMonth() === 0 && unit >= 30) ? String(t.getFullYear()) : unit >= 30 ? f.mon(+t) : f.d(+t), tx + 3, base + 2); lastLabel = tx; }
      t = unit === 1 ? new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1) : unit === 7 ? new Date(t.getFullYear(), t.getMonth(), t.getDate() + 7) : unit === 30 ? new Date(t.getFullYear(), t.getMonth() + 1, 1) : unit === 91 ? new Date(t.getFullYear(), t.getMonth() + 3, 1) : new Date(t.getFullYear() + 1, 0, 1);
    }
    if (D.ses.length <= 500) { c.fillStyle = "rgba(106,232,255,.55)"; for (k = 0; k < D.ses.length; k++) c.fillRect(G.tlX(s, D.T[D.ses[k]]), base - 3, 1, 3); }
    c.fillStyle = "rgba(167,123,255,.16)"; c.strokeStyle = "rgba(106,232,255,.85)"; c.lineWidth = 1.3; var bx = Math.max(0, x0), bx2 = Math.min(tlW, Math.max(x1, x0 + 3));
    c.beginPath(); c.roundRect(bx + .5, 1.5, bx2 - bx - 1, base - 1, 5); c.fill(); c.stroke();
    c.fillStyle = "#6ae8ff"; c.beginPath(); c.roundRect(bx - 1, base / 2 - 9, 4, 18, 2); c.fill(); c.beginPath(); c.roundRect(bx2 - 3, base / 2 - 9, 4, 18, 2); c.fill();
    if (s.replay) { var rx = G.tlX(s, D.T[R.i0 + Math.min(R.i1 - R.i0 - 1, Math.floor(s.replay.p * (R.i1 - R.i0)))]); c.fillStyle = "#fff"; c.fillRect(rx - .5, 0, 1.5, base); }
    if (s.tlHover >= 0) {
      c.fillStyle = "rgba(255,255,255,.35)"; c.fillRect(s.tlHover, 0, 1, base); var tt = f.dy(G.tlT(s, s.tlHover)); c.font = '600 10.5px "Segoe UI",system-ui,sans-serif';
      var w = c.measureText(tt).width + 10, lx = clamp(s.tlHover - w / 2, 0, tlW - w); c.fillStyle = "rgba(10,6,22,.92)"; c.fillRect(lx, 1, w, 15); c.fillStyle = "#e9ddff"; c.fillText(tt, lx + 5, 3);
    }
  };
  G.invalidateDock = function (s) { if (s.dockQ || !s.on) return; s.dockQ = requestAnimationFrame(function () { s.dockQ = 0; G.raf++; G.dockDraw(s); }); };

  /* ---------- the loop: a frame is asked for only when something changes ---------- */
  G.attachLoop = function (s) {
    s.invalidate = function () { if (!s.raf && s.on && !s.dead) s.raf = requestAnimationFrame(s.frame); };
    s.frame = function (ts) {
      s.raf = 0; if (!s.on || s.dead) return; G.raf++;
      var dt = Math.min(.1, (ts - s.lastTs) / 1000 || .016), more = false, cam = s.cam; s.lastTs = ts;
      var pcx = cam.cx, pcz = cam.cz, ps = Math.exp(cam.ls);
      if (!s.FX) Object.assign(cam, s.tgt); else if (camDiffers(s)) more = stepCam(s, dt);
      if (more && s.hovC >= 0) { s.hovC = -1; s.e.tip.classList.remove("on"); }
      s.accPan[0] -= (cam.cx - pcx) * ps; s.accPan[1] -= (cam.cz - pcz) * ps;      // the parallax follows the screen motion of the map
      if (s.replay) { s.replay.p = (performance.now() - s.replay.t0) / s.replay.dur; if (s.replay.p >= 1) { s.replay = null; s.ui.unit(); } else more = true; }
      G.render(s); if (more) s.invalidate();
    };
  };
  /** scripted pan + zoom with real renders, for the measurement (window.__visitsBench from the console or the test page) */
  G.bench = function (s, frames, off, amp) {
    frames = frames || 240; off = off || 0; amp = amp == null ? 1.4 : amp;
    return new Promise(function (res) {
      s.replay = null; G.fit(s, true); var base = { cx: s.cam.cx, cz: s.cam.cz, ls: s.cam.ls }, times = [], ints = [], i = 0, last = performance.now();
      function step() {
        var t = performance.now(); ints.push(t - last); last = t; var ph = i / frames, z = base.ls + off + Math.sin(ph * 6.283 * 2) * amp;
        Object.assign(s.tgt, { cx: base.cx + Math.sin(ph * 6.283) * (.5 / Math.exp(z)) * 400, cz: base.cz + Math.cos(ph * 6.283) * (.5 / Math.exp(z)) * 300, ls: z }); Object.assign(s.cam, s.tgt);
        var a = performance.now(); G.render(s); times.push(performance.now() - a); if (++i < frames) requestAnimationFrame(step); else done();
      }
      function done() { var q = function (arr, p) { return arr.slice().sort(function (x, y) { return x - y; })[Math.floor(arr.length * p)]; };
        res({ n: s.D.n, frames: frames, drawMedian: +q(times, .5).toFixed(2), drawP95: +q(times, .95).toFixed(2), drawMax: +Math.max.apply(null, times).toFixed(2), intervalMedian: +q(ints.slice(1), .5).toFixed(2), groupsDrawn: s.perf.nodes, segments: s.perf.segs }); }
      requestAnimationFrame(step);
    });
  };
})();
