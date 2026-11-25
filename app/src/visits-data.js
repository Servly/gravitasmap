"use strict";
// GRAVITAS Visits, part 1 of 4: the data and the pages (paging). No drawing and no page elements in here.
// A visit = one stop of the commander (a jump, a carrier jump or a game start) with what was done there. The Rust side (visits_get) sends them,
// prep() puts them into typed arrays and prefix sums, so every total of a page costs O(1) however many stops there are.
// Every function takes `s`, the state of one mounted page (visits-ui.js makes it).
(function () {
  var G = window.GVV = window.GVV || {};
  G.KIND = ["dock", "sell", "buy", "explore", "voucher", "mission"];
  G.KCOL = { dock: "#c9b6ff", sell: "#7dff9b", buy: "#6ae8ff", explore: "#a77bff", voucher: "#ffcc66", mission: "#ff6ad5" };
  G.PRI = [1, 2, 3, 4, 5, 0];                        // colour priority of a stop: sell, buy, explore, voucher, mission, dock
  G.SESSION_GAP = 3 * 3600e3;                        // a gap of more than 3 h between two stops starts a new play session
  G.LANDMARKS = [{ n: "Sol", x: 0, y: 0, z: 0 }, { n: "Colonia", x: -9530, y: -910, z: 19808 }, { n: "Sagittarius A*", x: 25, y: -21, z: 25899 }];
  G.esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  G.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var clamp = G.clamp;
  G.lsGet = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  G.lsSet = function (k, v) { try { localStorage.setItem(k, v); } catch (e) { } };
  // first index whose value is not below t
  G.lb = function (arr, t, n) { var lo = 0, hi = n; while (lo < hi) { var m = (lo + hi) >> 1; if (arr[m] < t) lo = m + 1; else hi = m; } return lo; };

  /** the app's language, never the PC's: a Turkish PC must not show Turkish dates in an English app */
  G.locale = function (code) { code = String(code || "en").toLowerCase(); if (code === "pt-br" || code === "pt") return "pt-BR"; code = code.slice(0, 2); return code === "de" || code === "es" || code === "fr" || code === "ru" ? code : "en"; };   // only the app's six languages, never the PC's
  G.makeFmt = function (code) {
    var loc = G.locale(code), f = { loc: loc };
    try { new Intl.NumberFormat(loc); } catch (e) { loc = f.loc = "en"; }
    var nf = new Intl.NumberFormat(loc, { maximumFractionDigits: 0 }), n1 = new Intl.NumberFormat(loc, { maximumFractionDigits: 1 });
    var cf = new Intl.NumberFormat(loc, { notation: "compact", maximumFractionDigits: 1 });
    var d1 = new Intl.DateTimeFormat(loc, { month: "short", day: "numeric" });
    var d2 = new Intl.DateTimeFormat(loc, { month: "short", day: "numeric", year: "numeric" });
    var d3 = new Intl.DateTimeFormat(loc, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    var d4 = new Intl.DateTimeFormat(loc, { month: "long", year: "numeric" });
    var d5 = new Intl.DateTimeFormat(loc, { month: "short" });
    var d6 = new Intl.DateTimeFormat(loc, { month: "short", year: "numeric" }), d7 = new Intl.DateTimeFormat(loc, { year: "numeric" });
    var d8 = new Intl.DateTimeFormat(loc, { month: "short", year: "numeric", timeZone: "UTC" }), d9 = new Intl.DateTimeFormat(loc, { year: "numeric", timeZone: "UTC" });
    var rtf; try { rtf = new Intl.RelativeTimeFormat(loc, { numeric: "auto" }); } catch (e) { rtf = null; }
    f.n = function (n) { return nf.format(Math.round(n)); };
    f.c = function (n) { n = Math.abs(n); return n >= 1e3 ? cf.format(n) : nf.format(n); };            // credits: 1.2M
    f.ly = function (n) { return n >= 1e5 ? nf.format(n / 1e3) + "K" : nf.format(n); };
    f.k = function (n) { return n >= 1e4 ? nf.format(n / 1e3) + "k" : n >= 1e3 ? n1.format(n / 1e3) + "k" : String(n); };   // counts inside a bubble
    f.d = function (t) { return d1.format(t); };
    f.dy = function (t) { return d2.format(t); };
    f.full = function (t) { return d3.format(t); };
    f.month = function (t) { return d4.format(t); };
    f.mon = function (t) { return d5.format(t); };
    f.my = function (t) { return d6.format(t); };       // Mar 2018 (local)
    f.yr = function (t) { return d7.format(t); };
    f.myu = function (t) { return d8.format(t); };      // the same for a month key (UTC)
    f.yu = function (t) { return d9.format(t); };
    f.ago = function (t) {
      var d = (Date.now() - t) / 864e5;
      if (!rtf || d >= 700) return d2.format(t);
      return d < 1 ? rtf.format(0, "day") : d < 2 ? rtf.format(-1, "day") : d < 60 ? rtf.format(-Math.floor(d), "day") : rtf.format(-Math.floor(d / 30), "month");
    };
    return f;
  };

  /** raw stops -> typed arrays. Sorted by time here too, the Rust side sends them in order already. */
  G.prep = function (raw) {
    var a = raw.slice().sort(function (p, q) { return p.t < q.t ? -1 : p.t > q.t ? 1 : 0; }), n = a.length, K = G.KIND;
    var d = { n: n, v: a, T: new Float64Array(n), X: new Float32Array(n), Y: new Float32Array(n), Z: new Float32Array(n), F: new Uint8Array(n), KC: new Uint16Array(n * 6),
      EARN: new Float64Array(n), SPEND: new Float64Array(n), DIST: new Float32Array(n), S: new Array(n), how: new Uint8Array(n) };
    var sysSet = new Set(), dist = 0, i, k;
    for (i = 0; i < n; i++) {
      var v = a[i]; d.T[i] = Date.parse(v.t) || 0; d.X[i] = +v.x || 0; d.Y[i] = +v.y || 0; d.Z[i] = +v.z || 0;
      d.how[i] = v.how === "carrier" ? 2 : v.how === "start" ? 1 : 0;
      var s = String(v.sys || "").toLowerCase(), f = 0, e = 0, sp = 0, acts = v.acts || [];
      for (var j = 0; j < acts.length; j++) {
        var c = acts[j]; k = K.indexOf(c.k); if (k < 0) continue; f |= 1 << k; d.KC[i * 6 + k]++;
        if (c.k === "sell" || c.k === "explore" || c.k === "voucher" || c.k === "mission") e += c.cr || 0; else if (c.k === "buy") sp += c.cr || 0;
        s += "|" + String(c.st || "").toLowerCase() + "|" + String(c.what || "").toLowerCase();
      }
      d.F[i] = f; d.EARN[i] = e; d.SPEND[i] = sp; d.S[i] = s; sysSet.add(v.sys);
      if (i > 0 && d.how[i] !== 2) { var dx = d.X[i] - d.X[i - 1], dy = d.Y[i] - d.Y[i - 1], dz = d.Z[i] - d.Z[i - 1]; d.DIST[i] = Math.hypot(dx, dy, dz); }
      dist += d.DIST[i];
    }
    d.PK = new Uint32Array((n + 1) * 6); d.PE = new Float64Array(n + 1); d.PS = new Float64Array(n + 1); d.PD = new Float64Array(n + 1);
    for (i = 0; i < n; i++) {
      for (k = 0; k < 6; k++) d.PK[(i + 1) * 6 + k] = d.PK[i * 6 + k] + (d.F[i] >> k & 1);
      d.PE[i + 1] = d.PE[i] + d.EARN[i]; d.PS[i + 1] = d.PS[i] + d.SPEND[i]; d.PD[i + 1] = d.PD[i] + d.DIST[i];
    }
    var ses = [0]; for (i = 1; i < n; i++) if (d.T[i] - d.T[i - 1] > G.SESSION_GAP) ses.push(i);
    d.ses = ses; d.systems = sysSet.size; d.dist = dist; d.tmin = d.T[0]; d.tmax = d.T[n - 1];
    return d;
  };
  G.sessionOf = function (D, i) { var s = D.ses, lo = 0, hi = s.length - 1; while (lo < hi) { var m = (lo + hi + 1) >> 1; if (s[m] <= i) lo = m; else hi = m - 1; } return lo; };
  G.keyOf = function (v) { return v.t + "|" + v.sys; };
  G.indexOfKey = function (D, key) {
    var t = Date.parse(key.split("|")[0]) || 0, i = G.lb(D.T, t, D.n);
    for (; i < D.n && D.T[i] === t; i++) if (G.keyOf(D.v[i]) === key) return i;
    return -1;
  };

  /* ---------- the page: an index range [i0,i1) of the time-sorted stops ---------- */
  G.setRange = function (s, i0, i1, unit, ta, tb) {
    var D = s.D; i0 = clamp(i0, 0, D.n); i1 = clamp(i1, i0, D.n);
    s.R = { i0: i0, i1: i1, unit: unit, ta: ta != null ? ta : D.T[i0], tb: tb != null ? tb : (i1 > 0 ? D.T[i1 - 1] + 1 : D.T[i0] + 1) };
    s.cache.clear(); s.lvCur = null; s.hov = -1; s.hovC = -1; s.e.tip.classList.remove("on");
    s.ui.unit(); s.ui.summaryLater(); s.invalidate();
  };
  G.periodOf = function (t, unit) {
    var d = new Date(t);
    if (unit === "day") { var a = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return [+a, +new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)]; }
    if (unit === "week") { var dow = (d.getDay() + 6) % 7, w = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow); return [+w, +new Date(w.getFullYear(), w.getMonth(), w.getDate() + 7)]; }
    if (unit === "year") return [+new Date(d.getFullYear(), 0, 1), +new Date(d.getFullYear() + 1, 0, 1)];
    var m = new Date(d.getFullYear(), d.getMonth(), 1); return [+m, +new Date(d.getFullYear(), d.getMonth() + 1, 1)];
  };
  /** page by unit. Day, Week, Month and Year may live in an older period: G.store.openRange loads it as the archive and shows it when it is there */
  G.setUnit = function (s, u, anchor) {
    var D = s.D, R = s.R; if (!D) return;
    if (u === "all") { G.store.closeArchive(s, true); D = s.D; var b = G.bounds(s); G.setRange(s, 0, D.n, "all", b[0], b[1] + 1); return; }   // All = the active window (the last 12 months) and the older history as dust
    if (u === "last") { var N = clamp(s.lastN | 0, 1, D.n); G.setRange(s, D.n - N, D.n, "last"); return; }
    if (anchor == null) anchor = (R.unit === "all" || R.i1 <= R.i0) ? D.n - 1 : clamp(R.i1 - 1, 0, D.n - 1);
    if (u === "session") { var k = G.sessionOf(D, anchor); G.setRange(s, D.ses[k], D.ses[k + 1] != null ? D.ses[k + 1] : D.n, "session"); return; }
    var p = G.periodOf(D.T[anchor], u); G.store.openRange(s, u, p[0], p[1]);
  };
  G.canStep = function (s, dir) {
    var D = s.D, R = s.R; if (!D) return false; var u = R.unit;
    if (u === "all") return dir < 0 && D.n >= 2;
    if (u === "last") return dir < 0 ? R.i0 > 0 : R.i1 < D.n;
    if (u === "custom") { var b = G.bounds(s); return dir < 0 ? R.ta > b[0] : R.tb <= b[1]; }
    return G.store.neighbour(s, dir) != null;
  };
  G.stepPage = function (s, dir) {
    var D = s.D, R = s.R; if (!D) return false; var u = R.unit;
    if (u === "all") { if (dir < 0) G.setUnit(s, "week", D.n - 1); else return false; return true; }
    if (u === "last") { var N = clamp(s.lastN | 0, 1, D.n); if (dir < 0) { if (R.i0 <= 0) return false; G.setRange(s, Math.max(0, R.i0 - N), R.i0, "last"); } else { if (R.i1 >= D.n) return false; G.setRange(s, R.i1, Math.min(D.n, R.i1 + N), "last"); } return true; }
    if (u === "custom") { var w = R.tb - R.ta; if (!G.canStep(s, dir)) return false; G.setBrush(s, R.ta + dir * w, R.tb + dir * w, true); return true; }
    var t = G.store.neighbour(s, dir); if (t == null) return false;      // the nearest stop before or after, so empty weeks are skipped (looked up in the index when that month is not held)
    G.store.goAnchor(s, u, t, dir); return true;
  };
  /** the timeline window (a custom page). While it is dragged only the held stops are shown, settle = true loads an older period at once */
  G.setBrush = function (s, a, b, settle) {
    var D = s.D; if (!D) return; var w = b - a, bd = G.bounds(s), lo = bd[0], hi = bd[1] + 1;
    if (a < lo) { a = lo; if (b < a + w) b = Math.min(hi, a + w); } if (b > hi) { b = hi; if (a > b - w) a = Math.max(lo, b - w); }
    a = Math.max(a, lo); b = Math.min(b, hi); if (b - a < 36e5) return;
    var sameAll = a <= lo && b >= hi; if (sameAll) { G.setUnit(s, "all"); return; }
    G.setRange(s, G.lb(D.T, a, D.n), G.lb(D.T, b, D.n), "custom", a, b); if (settle) G.store.openRange(s, "custom", a, b);
  };

  /* ---------- filters and search: M[i] = 1 when stop i matches (null = no filter) ---------- */
  G.recomputeMatch = function (s) {
    var D = s.D; if (!D) return; s.matchId++;
    if (!s.mask && !s.query) s.M = null;
    else { var M = new Uint8Array(D.n), q = s.query, mask = s.mask; for (var i = 0; i < D.n; i++) { if (mask && !(D.F[i] & mask)) continue; if (q && D.S[i].indexOf(q) < 0) continue; M[i] = 1; } s.M = M; }
    s.cache.clear(); s.lvCur = null; s.histDirty = true; s.ui.chips(); s.invalidate();
  };
})();
