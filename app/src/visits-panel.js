"use strict";
// GRAVITAS Visits, part 3 of 4: everything made of text and buttons around the map: the numbers line, the chips, the pager label,
// the search list, the hover card and the details panel (a stop, or the summary of the page). Every visible word goes through s.tr("vis.*"),
// every name that comes from the game goes through esc() (never HTML).
(function () {
  var G = window.GVV, esc = G.esc, clamp = G.clamp, KIND = G.KIND, KCOL = G.KCOL;

  /** "3 stops" with the number in bold: the number is wrapped after the text is escaped */
  function bold(s, key, num, extra) {
    var v = { n: "\u0001" + num + "\u0002" }; if (extra) for (var k in extra) v[k] = extra[k];
    return esc(s.tr(key, v)).replace("\u0001", "<b>").replace("\u0002", "</b>");
  }
  function kv(l, v) { return "<div><small>" + esc(l) + "</small><b>" + esc(v) + "</b></div>"; }
  function setTip(s, el, key, vars) { var t = s.tr(key, vars); if (t !== key) el.title = t; return el; }

  G.attachPanel = function (s) {
    var e = s.e, f = s.f, tr = s.tr, ui = s.ui = s.ui || {};

    ui.stats = function () {
      var D = s.D, r = s.resp || {}; if (!D) { e.stats.textContent = ""; return; }
      var h = "<span>" + bold(s, "vis.stat.stops", f.n(D.n)) + "</span><span>" + bold(s, "vis.stat.systems", f.n(D.systems)) + "</span><span>" + bold(s, "vis.stat.ly", f.n(D.dist)) + "</span><span>" + bold(s, "vis.stat.cr", f.c(D.PE[D.n])) + "</span>";
      h += "<span>" + esc(f.dy(D.tmin)) + " &ndash; " + esc(f.dy(D.tmax)) + "</span>";
      if (r.total > D.n) h += "<span>" + esc(tr("vis.stat.newest", { n: f.n(D.n), t: f.n(r.total) })) + "</span>";
      e.stats.innerHTML = h;
    };
    ui.chips = function () {
      var D = s.D; if (!D) return; var R = s.R, h = "";
      for (var k = 0; k < 6; k++) {
        var c = D.PK[R.i1 * 6 + k] - D.PK[R.i0 * 6 + k], nm = tr("vis.k." + KIND[k]);
        h += '<button class="vs-fc' + (s.mask >> k & 1 ? " on" : "") + '" data-k="' + k + '" style="--c:' + KCOL[KIND[k]] + '" aria-pressed="' + (s.mask >> k & 1 ? "true" : "false") + '" title="' + esc(tr("tip.vis.chip", { name: nm })) + '"><span class="d"></span>' + esc(nm) + "<small>" + esc(f.k(c)) + "</small></button>";
      }
      e.chips.innerHTML = h;
    };
    ui.unit = function () {
      var D = s.D, R = s.R; if (!D) return;
      Array.prototype.forEach.call(e.unitSeg.querySelectorAll("button"), function (b) { var on = b.dataset.u === R.unit; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
      var n = R.i1 - R.i0, lab;
      if (R.unit === "all") lab = f.dy(D.tmin) + " – " + f.dy(D.tmax);
      else if (R.unit === "session") lab = tr("vis.pg.session", { a: f.n(G.sessionOf(D, R.i0) + 1), b: f.n(D.ses.length), d: f.full(D.T[R.i0]) });
      else if (R.unit === "last") lab = R.i1 >= D.n ? tr("vis.pg.last", { n: f.n(n) }) : f.d(R.ta) + " – " + f.d(R.tb);
      else if (R.unit === "day") lab = f.dy(R.ta);
      else if (R.unit === "week") lab = tr("vis.pg.week", { d: f.d(R.ta) });
      else if (R.unit === "month") lab = f.month(R.ta);
      else lab = f.d(R.ta) + " – " + f.d(R.tb);
      e.pgl.innerHTML = esc(lab) + "<small>" + esc(tr("vis.pg.stops", { n: f.n(n) })) + "</small>";
      if (R.unit === "last") { e.lastIn.value = String(s.lastN); } else if (document.activeElement !== e.lastIn) e.lastIn.value = "";
      e.lastBox.classList.toggle("on", R.unit === "last");
      if (R.unit === "last") G.lsSet("gvVisitsLast", String(s.lastN)); else if (!s.restoring) { try { localStorage.removeItem("gvVisitsLast"); } catch (_) { } }
      e.pOld.disabled = R.unit === "all" ? D.n < 2 : R.i0 <= 0; e.pNew.disabled = R.unit === "all" || R.i1 >= D.n;
      ui.chips();
    };
    ui.caption = function (i) { var D = s.D; e.pgl.innerHTML = esc(tr("vis.pg.replay", { d: f.full(D.T[i]) })) + "<small>" + esc(D.v[i].sys) + "</small>"; };
    ui.perf = function () {
      var p = s.perf, a = Array.prototype.slice.call(p.ring, 0, Math.min(p.n, 240)).sort(function (x, y) { return x - y; });
      e.perf.textContent = "draw " + (a[a.length >> 1] || 0).toFixed(1) + " ms med  " + (a[Math.floor(a.length * .95)] || 0).toFixed(1) + " p95\ngroups " + p.nodes + "  segments " + p.segs + "  renders " + p.renders + "  rAF " + G.raf;
    };

    /* ---------- search ---------- */
    s.resItems = []; s.resAct = -1;
    ui.closeRes = function () { e.res.classList.remove("on"); e.q.setAttribute("aria-expanded", "false"); s.resItems = []; s.resAct = -1; };
    ui.showRes = function () {
      var D = s.D; if (!D || !s.query) { ui.closeRes(); return; }
      var out = [], q = s.query;
      for (var i = D.n - 1; i >= 0 && out.length < 7; i--) {
        if (s.mask && !(D.F[i] & s.mask)) continue; if (D.S[i].indexOf(q) < 0) continue;
        var acts = D.v[i].acts || [], hit = null;
        for (var j = 0; j < acts.length; j++) { var c = acts[j]; if (String(c.what || "").toLowerCase().indexOf(q) >= 0 || String(c.st || "").toLowerCase().indexOf(q) >= 0) { hit = c; break; } }
        out.push({ i: i, c: hit });
      }
      s.resItems = out; s.resAct = -1;
      e.res.innerHTML = out.length ? out.map(function (o, j) {
        var v = D.v[o.i], c = o.c, col = c ? KCOL[c.k] : "#9d8cc0", title;
        if (!c) title = v.sys; else if (c.k === "sell") title = tr("vis.r.sold", { n: c.n || "", what: c.what || "" }); else if (c.k === "buy") title = tr("vis.r.bought", { n: c.n || "", what: c.what || "" });
        else if (c.k === "dock") title = tr("vis.r.docked", { st: c.st || "" }); else title = tr("vis.k." + c.k);
        return '<button role="option" data-j="' + j + '"><span class="d" style="background:' + col + ";box-shadow:0 0 8px " + col + '"></span><span class="t"><b>' + esc(title.replace(/\s+/g, " ").trim()) + "</b><small>" + esc(v.sys) + (c && c.st && c.k !== "dock" ? " · " + esc(c.st) : "") + '</small></span><span class="w">' + esc(f.ago(D.T[o.i])) + "</span></button>";
      }).join("") : '<div class="none">' + esc(tr("vis.search.none")) + "</div>";
      e.res.classList.add("on"); e.q.setAttribute("aria-expanded", "true");
    };

    /* ---------- hover card ---------- */
    ui.hover = function (q, tx, ty) {
      var tip = e.tip, lv = s.lvCur, D = s.D, R = s.R; if (q < 0 || !lv) { tip.classList.remove("on"); return; }
      var n = lv.n[q], h = "";
      function legend() { var out = ""; for (var k = 0; k < 6; k++) { var v = lv.kc[q * 6 + k]; if (v) out += '<span style="--c:' + KCOL[KIND[k]] + '"><i></i>' + esc(tr("vis.k." + KIND[k])) + " " + esc(f.n(v)) + "</span>"; } return out ? '<div class="l">' + out + "</div>" : ""; }
      if (n === 1) {
        var i = R.i0 + lv.first[q];
        h = "<b>" + esc(D.v[i].sys) + '</b><div class="s">' + esc(f.full(D.T[i])) + " · " + esc(f.ago(D.T[i])) + "</div>" + legend() + (lv.earn[q] ? '<div class="s" style="margin-top:5px">' + esc(tr("vis.h.earned", { cr: f.c(lv.earn[q]) })) + "</div>" : "");
      } else {
        var a = R.i0 + lv.first[q], b = R.i0 + lv.last[q];
        h = "<b>" + esc(tr("vis.h.grouped", { n: f.n(n) })) + '</b><div class="s">' + esc(f.d(D.T[a])) + " – " + esc(f.d(D.T[b])) + (lv.m[q] !== n ? " · " + esc(tr("vis.h.match", { n: f.n(lv.m[q]) })) : "") + "</div>" + legend() + '<div class="s" style="margin-top:5px">' + esc(tr("vis.h.zoom")) + "</div>";
      }
      tip.innerHTML = h; var w = tip.offsetWidth, hh = tip.offsetHeight, x = tx + 16, y = ty + 16;
      if (x + w > s.W - 8) x = tx - w - 14; if (y + hh > s.H - 8) y = ty - hh - 14; tip.style.transform = "translate(" + (x | 0) + "px," + (y | 0) + "px)"; tip.classList.add("on");
    };

    /* ---------- details panel ---------- */
    var sumT = 0;
    ui.summaryLater = function () { clearTimeout(sumT); sumT = setTimeout(function () { if (s.sel < 0 && !s.dead && s.on) ui.panel(); }, 120); };
    s.clearTimers.push(function () { clearTimeout(sumT); });
    ui.panel = function () {
      var D = s.D, R = s.R, el = e.pbody; if (!D) return;
      if (s.sel >= 0) {
        var i = s.sel, v = D.v[i], how = D.how[i] === 2 ? tr("vis.how.carrier") : D.how[i] === 1 ? tr("vis.how.start") : tr("vis.how.jump"), d0 = Math.hypot(D.X[i], D.Y[i], D.Z[i]), acts = "", earn = 0, spend = 0, list = v.acts || [];
        for (var j = 0; j < list.length; j++) {
          var a = list[j], col = KCOL[a.k] || "#fff", ttl = "", sub = a.st ? esc(a.st) : "", cr = "";
          if (a.k === "dock") ttl = "<b>" + esc(tr("vis.a.dock")) + "</b>";
          else if (a.k === "sell") { ttl = esc(tr("vis.a.sold")) + " <b>" + esc(f.n(a.n || 0)) + "× " + esc(a.what || "") + "</b>"; cr = "+" + f.c(a.cr || 0); earn += a.cr || 0; }
          else if (a.k === "buy") { ttl = esc(tr("vis.a.bought")) + " <b>" + esc(f.n(a.n || 0)) + "× " + esc(a.what || "") + "</b>"; cr = "−" + f.c(a.cr || 0); spend += a.cr || 0; }
          else if (a.k === "explore") { ttl = esc(tr(a.org ? "vis.a.explore.org" : "vis.a.explore")); cr = "+" + f.c(a.cr || 0); earn += a.cr || 0; }
          else if (a.k === "voucher") { ttl = esc(tr("vis.a.voucher")); cr = "+" + f.c(a.cr || 0); earn += a.cr || 0; }
          else if (a.k === "mission") { ttl = esc(a.n > 1 ? tr("vis.a.missions", { n: f.n(a.n) }) : tr("vis.a.mission")); cr = a.cr ? "+" + f.c(a.cr) : ""; earn += a.cr || 0; }
          else continue;
          acts += '<div class="vs-act" style="--c:' + col + '"><span class="ic"><i></i></span><div class="m">' + ttl + "<small>" + sub + '</small></div><span class="cr">' + esc(cr) + "</span></div>";
        }
        var pv = i > 0 ? D.v[i - 1] : null, nx = i < D.n - 1 ? D.v[i + 1] : null, net = earn - spend;
        el.innerHTML = '<div class="vs-badges"><span class="vs-badge' + (D.how[i] === 2 ? " hot" : "") + '">' + esc(how) + '</span><span class="vs-badge">' + esc(tr("vis.stopn", { i: f.n(i + 1), n: f.n(D.n) })) + "</span>" + (v.fl === "taxi" || v.fl === "crew" ? '<span class="vs-badge">' + esc(tr("vis.fl." + v.fl)) + "</span>" : "") + "</div>" +
          "<h3>" + esc(v.sys) + '</h3><div class="vs-sub">' + esc(f.full(D.T[i])) + " · " + esc(f.ago(D.T[i])) + "</div>" +
          '<div class="vs-kv">' + kv(tr("vis.kv.sol"), f.n(d0) + " ly") + kv(tr("vis.kv.jump"), D.DIST[i] ? f.n(Math.round(D.DIST[i] * 10) / 10) + " ly" : "–") + kv(tr("vis.kv.net"), (net >= 0 ? "+" : "−") + f.c(net)) + "</div>" +
          '<div class="vs-row2" style="margin:0 0 4px"><button class="vs-btn go" data-do="show">' + esc(tr("vis.btn.show")) + '</button><button class="vs-btn" data-do="copy">' + esc(tr("vis.btn.copy")) + '</button><button class="vs-btn" data-do="back">' + esc(tr("vis.btn.summary")) + "</button></div>" +
          '<div class="vs-sec"><span>' + esc(tr("vis.sec.did")) + "</span><span>" + list.length + "</span></div>" + (acts || '<div class="vs-empty">' + esc(tr("vis.act.none")) + "</div>") +
          '<div class="vs-sec"><span>' + esc(tr("vis.sec.route")) + "</span></div>" +
          (pv ? '<button class="vs-lnk" data-go="' + (i - 1) + '"><span>' + esc(tr("vis.route.from")) + "</span><b>" + esc(pv.sys) + "</b><span>" + (D.DIST[i] ? esc(f.n(D.DIST[i]) + " ly") : "") + "</span></button>" : "") +
          (nx ? '<button class="vs-lnk" data-go="' + (i + 1) + '"><span>' + esc(tr("vis.route.to")) + "</span><b>" + esc(nx.sys) + "</b><span>" + (D.DIST[i + 1] ? esc(f.n(D.DIST[i + 1]) + " ly") : "") + "</span></button>" : "");
        var bs = el.querySelectorAll("[data-do]"); setTip(s, bs[0], "tip.vis.show"); setTip(s, bs[1], "tip.vis.copy"); setTip(s, bs[2], "tip.vis.summary");
        return;
      }
      var n = R.i1 - R.i0, sold = new Map(), bought = new Map(), st = new Map(), systems = new Set(), x, y;
      for (x = R.i0; x < R.i1; x++) {
        systems.add(D.v[x].sys); var as = D.v[x].acts || [];
        for (y = 0; y < as.length; y++) { var c = as[y];
          if (c.k === "sell" || c.k === "buy") { var m = c.k === "sell" ? sold : bought, o = m.get(c.what) || { cr: 0, n: 0 }; o.cr += c.cr || 0; o.n += c.n || 0; m.set(c.what, o); }
          if (c.k === "dock" && c.st) st.set(c.st, (st.get(c.st) || 0) + 1); }
      }
      function top(m) { return Array.from(m.entries()).sort(function (a, b) { return b[1].cr - a[1].cr; }).slice(0, 5); }
      function chip(arr, col) { return arr.length ? '<div class="vs-tags" style="--c:' + col + '">' + arr.map(function (p) { return '<button data-q="' + esc(p[0]) + '" title="' + esc(tr("tip.vis.tag", { name: p[0] })) + '">' + esc(p[0]) + ' <span style="color:' + col + '">' + esc(f.c(p[1].cr)) + "</span></button>"; }).join("") + "</div>" : '<div class="vs-empty">' + esc(tr("vis.none.page")) + "</div>"; }
      var sts = Array.from(st.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 4), sh = "", s1 = G.sessionOf(D, Math.max(R.i0, 0)), s2 = G.sessionOf(D, Math.max(R.i1 - 1, 0)), cnt = 0;
      for (var k = s2; k >= s1 && cnt < 6; k--, cnt++) {
        var ia = Math.max(D.ses[k], R.i0), ib = Math.min(D.ses[k + 1] != null ? D.ses[k + 1] : D.n, R.i1); if (ib <= ia) continue;
        sh += '<button class="vs-ses" data-ses="' + D.ses[k] + '" title="' + esc(tr("tip.vis.ses")) + '">' + esc(f.full(D.T[D.ses[k]])) + "<span>" + esc(tr("vis.ses.row", { n: f.n(ib - ia), cr: f.c(D.PE[ib] - D.PE[ia]) })) + "</span></button>";
      }
      var dist = D.PD[R.i1] - D.PD[R.i0] - (R.i0 < D.n ? D.DIST[R.i0] : 0);
      el.innerHTML = "<h2>" + esc(tr("vis.sum.h")) + "</h2><h3>" + esc(tr("vis.pg.stops", { n: f.n(n) })) + '</h3><div class="vs-sub">' + esc(f.dy(R.ta)) + " – " + esc(f.dy(Math.max(R.ta, R.tb - 1))) + "</div>" +
        '<div class="vs-kv">' + kv(tr("vis.kv.systems"), f.n(systems.size)) + kv(tr("vis.kv.flown"), f.ly(Math.max(0, dist)) + " ly") + kv(tr("vis.kv.earned"), f.c(D.PE[R.i1] - D.PE[R.i0])) + "</div>" +
        '<div class="vs-sec"><span>' + esc(tr("vis.sec.sold")) + "</span></div>" + chip(top(sold), KCOL.sell) +
        '<div class="vs-sec"><span>' + esc(tr("vis.sec.bought")) + "</span></div>" + chip(top(bought), KCOL.buy) +
        '<div class="vs-sec"><span>' + esc(tr("vis.sec.docked")) + "</span></div>" + (sts.length ? sts.map(function (p) { return '<div class="vs-act thin" style="--c:' + KCOL.dock + '"><span class="m"><b>' + esc(p[0]) + '</b></span><span class="cr">' + esc(tr("vis.dockx", { n: f.n(p[1]) })) + "</span></div>"; }).join("") : '<div class="vs-empty">' + esc(tr("vis.none.dock")) + "</div>") +
        '<div class="vs-sec"><span>' + esc(tr("vis.sec.sessions")) + "</span><span>" + esc(tr("vis.sec.sessions.h")) + "</span></div>" + (sh || '<div class="vs-empty">' + esc(tr("vis.none.ses")) + "</div>");
    };
  };
})();
