"use strict";
/* BGS Watch, part 3: Today, Movers, Risk, Trends. Each view returns an HTML string. Every text is a key (bgs.*, tip.bgs.*). Names come from the player's own data and are always escaped. */
(function () {
  var BG = window.BG, S = BG.svg, C = BG.calc, V = BG.views = {}, esc = S.esc, t = function (k, v) { return BG.tr(k, v); };
  function card(title, body, o) {
    o = o || {};
    return '<section class="bg-card"><h3>' + title + (o.save ? '<button class="bg-mini" data-save="1" data-tip="' + esc(t("tip.bgs.save")) + '">' + t("bgs.save") + "</button>" : "") + "</h3>" +
      (o.q ? '<p class="bg-q">' + o.q + "</p>" : "") + body + (o.note ? '<p class="bg-note">' + o.note + "</p>" : "") + "</section>";
  }
  V.card = card;
  function need(msg) { return '<div class="bg-empty">' + msg + "</div>"; }
  V.need = need;
  var cur; V.setModel = function (M) { cur = M; };
  function zchip(s, M) { return '<span class="bg-chip ' + s.zone + '" data-tip="' + esc(t(s.zone === "low" ? "tip.bgs.z.low" : s.zone === "high" ? "tip.bgs.z.high" : "tip.bgs.z.in", { lo: M.st.lo, hi: M.st.hi })) + '">' + t(s.zone === "low" ? "bgs.z.low" : s.zone === "high" ? "bgs.z.high" : "bgs.z.in") + "</span>"; }
  V.zchip = zchip;
  function dtxt(s) {
    if (s.d == null) return '<span class="bg-fl" data-tip="' + esc(t("tip.bgs.na")) + '">' + t("bgs.na") + "</span>";
    var cls = s.tier === "flat" ? "bg-fl" : s.tier === "minor" ? (s.dir > 0 ? "bg-upm" : "bg-dnm") : s.dir > 0 ? "bg-up" : "bg-dn";
    return '<span class="' + cls + '" data-tip="' + esc(s.tier === "minor" ? t("tip.bgs.minor", { m: cur.st.minor }) : t("tip.bgs.chg")) + '">' + S.arrow(s.d, s.tier) + " " + (s.tier === "flat" ? "0.0" : S.sg(s.d)) + "</span>";
  }
  V.dtxt = dtxt;
  function nm(s) { return '<a class="bg-sn" data-sys="' + esc(s.n) + '">' + esc(s.n) + "</a>" + (s.warn ? ' <i class="bg-wf" data-tip="' + esc(t("tip.bgs.warncell")) + '">◌</i>' : "") + (s.stale ? ' <i class="bg-wf" data-tip="' + esc(t("tip.bgs.stale")) + '">' + t("bgs.old") + "</i>" : ""); }
  V.nm = nm;
  V.baseLabel = function (M) { return t("bgs.base." + M.st.base); };
  function tile(l, v, s, c, tipKey) { return '<div class="bg-tile ' + c + '"' + (tipKey ? ' data-tip="' + esc(t(tipKey)) + '"' : "") + '><div class="bg-tl">' + l + '</div><div class="bg-tv">' + v + '</div><div class="bg-ts">' + s + "</div></div>"; }
  function seg(name, cur, opts) { return '<div class="bg-seg" data-seg="' + name + '">' + opts.map(function (o) { return '<button data-v="' + o[0] + '" class="' + (cur === o[0] ? "on" : "") + '" data-tip="' + esc(t("tip.bgs.seg." + name + "." + o[0])) + '">' + o[1] + "</button>"; }).join("") + "</div>"; }
  V.seg = seg;

  V.today = function (M) {
    var n = M.sys.length, z = { low: 0, in: 0, high: 0 }, up = 0, dn = 0, fl = 0, upb = 0, dnb = 0, k = M.nS > 1, st = M.st;
    M.sys.forEach(function (s) { z[s.zone]++; if (s.dir > 0) { up++; if (s.tier === "big") upb++; } else if (s.dir < 0) { dn++; if (s.tier === "big") dnb++; } else if (s.d != null) fl++; });
    var tiles = '<div class="bg-tiles">' +
      tile(t("bgs.t.read"), n, M.snaps[M.K].complete ? t("bgs.t.complete") : t("bgs.t.incomplete", { n: M.snaps[M.K].missing }), "", "tip.bgs.t.read") +
      (k ? tile(t("bgs.t.up"), up, t("bgs.t.by", { n: upb, m: st.minor }), "up", "tip.bgs.t.up") + tile(t("bgs.t.dn"), dn, t("bgs.t.by", { n: dnb, m: st.minor }), "dn", "tip.bgs.t.dn") + tile(t("bgs.t.same"), fl, t("bgs.t.samesub"), "", "tip.bgs.t.same") : "") +
      tile(t("bgs.t.below", { lo: st.lo }), z.low, t("bgs.t.defend"), z.low ? "dn" : "", "tip.bgs.t.below") + tile(t("bgs.t.in"), z.in, st.lo + " - " + st.hi, "", "tip.bgs.t.in") + tile(t("bgs.t.above", { hi: st.hi }), z.high, t("bgs.t.toohigh"), z.high ? "warn" : "", "tip.bgs.t.above") + "</div>";
    var list = M.sys.filter(function (s) { return s.score > 0; }).sort(function (a, b) { return b.score - a.score; }).slice(0, 8);
    var att = list.length ? '<div class="bg-rows">' + list.map(function (s, i) {
      return '<div class="bg-row att" data-sys="' + esc(s.n) + '"><span class="bg-rk">' + (i + 1) + "</span><span>" + nm(s) + "</span>" + S.bullet(s, M, 190, 22) + '<b class="bg-val">' + S.f1(s.last) + "</b>" + dtxt(s) + '<span class="bg-why"><b class="' + (s.side === "high" ? "bg-wt" : "bg-dn") + '">' + t(s.side === "high" ? "bgs.side.high" : "bgs.side.low") + "</b> " + esc(s.why.join(", ")) + "</span></div>";
    }).join("") + "</div>" : need(t("bgs.att.none"));
    var out = tiles + card(t("bgs.att.h"), att, { q: t("bgs.att.q"), note: t("bgs.att.note", { lo: st.lo, hi: st.hi }) + " " + (k ? "" : "<b>" + t("bgs.first") + "</b> " + t("bgs.att.first")) });
    if (!k) return out + card(t("bgs.next.h"), need(t("bgs.next.t")));
    var ds = M.sys.filter(function (s) { return s.d != null; }), mx = Math.max(1, Math.max.apply(0, ds.map(function (s) { return Math.abs(s.d); })));
    var drops = ds.filter(function (s) { return s.d < 0; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 6), gains = ds.filter(function (s) { return s.d > 0; }).sort(function (a, b) { return b.d - a.d; }).slice(0, 6);
    function col(a) { return a.length ? '<div class="bg-rows">' + a.map(function (s) { return '<div class="bg-row mv" data-sys="' + esc(s.n) + '"><span>' + nm(s) + "</span>" + S.dbar(s.d, s.tier, 130, 20, mx, true) + '<b class="bg-val">' + S.f1(s.last) + "</b>" + dtxt(s) + "</div>"; }).join("") + "</div>" : need(t("bgs.none")); }
    out += '<div class="bg-two">' + card(t("bgs.drops.h"), col(drops), { q: t("bgs.drops.q", { b: V.baseLabel(M) }) }) + card(t("bgs.gains.h"), col(gains), { q: t("bgs.gains.q") }) + "</div>";
    out += '<div class="bg-two">' + card(t("bgs.tick.h"), V.tickMini(M), { q: t("bgs.tick.q") }) + card(t("bgs.fleet.mini.h"), V.fleetMini(M), { q: t("bgs.fleet.mini.q") }) + "</div>";
    return out;
  };

  V.movers = function (M, ui) {
    if (M.nS < 2) return card(t("bgs.mv.h"), need(t("bgs.mv.need")), { q: t("bgs.mv.q0") });
    var ds = M.sys.filter(function (s) { return s.d != null; }), mx = Math.max(1, Math.max.apply(0, ds.map(function (s) { return Math.abs(s.d); })));
    var so = ui.msort, a = ds.slice().sort(so === "gain" ? function (x, y) { return y.d - x.d; } : so === "name" ? function (x, y) { return x.n < y.n ? -1 : 1; } : function (x, y) { return x.d - y.d; });
    var sg = seg("msort", so, [["drop", t("bgs.s.drop")], ["gain", t("bgs.s.gain")], ["name", t("bgs.s.name")]]);
    var tb = '<div class="bg-scroll"><table class="bg-t"><thead><tr><th>' + t("bgs.c.system") + '</th><th class="r">' + t("bgs.c.before") + '</th><th class="r">' + t("bgs.c.now") + "</th><th>" + t("bgs.c.change", { b: V.baseLabel(M) }) + "</th><th></th><th>" + t("bgs.c.hist") + "</th></tr></thead><tbody>" + a.map(function (s) {
      return '<tr data-sys="' + esc(s.n) + '"><td class="n">' + nm(s) + '</td><td class="r bg-fl">' + S.f1(s.base) + '</td><td class="r"><b>' + S.f1(s.last) + "</b></td><td>" + S.dbar(s.d, s.tier, 170, 20, mx) + "</td><td>" + dtxt(s) + "</td><td>" + S.spark(s, M, 110, 24, { pad: 2 }) + "</td></tr>";
    }).join("") + "</tbody></table></div>";
    var dn = ds.filter(function (s) { return s.d < 0 && s.tier !== "minor"; }).sort(function (x, y) { return x.d - y.d; }).slice(0, 8), upl = ds.filter(function (s) { return s.d > 0 && s.tier !== "minor"; }).sort(function (x, y) { return y.d - x.d; }).slice(0, 8);
    var sl = dn.concat(upl), slopeCard = sl.length ? card(t("bgs.sl.h"), S.slope(sl, M, 560, 460), { save: 1, q: t("bgs.sl.q"), note: t("bgs.sl.note") }) : "";
    return '<div class="bg-split"><div>' + card(t("bgs.all.h"), sg + tb, { q: t("bgs.mv.q"), note: t("bgs.mv.note", { m: M.st.minor }) }) + "</div><div>" + slopeCard + "</div></div>";
  };

  V.risk = function (M, ui) {
    var f = ui.rfilter, lo = M.st.lo, hi = M.st.hi;
    function atRisk(s) { return s.zone === "in" && (s.last - lo < 5 || hi - s.last < 5 || (s.eta && s.eta.mid <= 6) || (s.etaH && s.etaH.mid <= 6)); }
    var edge = function (s) { return Math.min(Math.abs(s.last - lo), Math.abs(hi - s.last)) * (s.zone === "in" ? 1 : -1); };
    var a = M.sys.slice().sort(function (x, y) { return edge(x) - edge(y); });
    var cnt = { all: a.length, low: a.filter(function (s) { return s.zone === "low"; }).length, risk: a.filter(atRisk).length, high: a.filter(function (s) { return s.zone === "high"; }).length };
    a = a.filter(function (s) { return f === "all" ? true : f === "low" ? s.zone === "low" : f === "high" ? s.zone === "high" : atRisk(s); });
    var sg = seg("rfilter", f, [["all", t("bgs.f.all") + " " + cnt.all], ["low", t("bgs.f.low") + " " + cnt.low], ["risk", t("bgs.f.risk") + " " + cnt.risk], ["high", t("bgs.f.high") + " " + cnt.high]]);
    var tb = '<div class="bg-scroll"><table class="bg-t"><thead><tr><th>' + t("bgs.c.system") + "</th><th>" + t("bgs.c.vsband", { lo: lo, hi: hi }) + '</th><th class="r">' + t("bgs.c.now") + '</th><th class="r">' + t("bgs.c.room") + "</th><th>" + t("bgs.c.trend") + "</th><th>" + t("bgs.c.hist") + "</th></tr></thead><tbody>" + a.map(function (s) {
      var rl = s.last - lo, rh = hi - s.last, room;
      if (s.zone === "low") room = '<span class="bg-dn">' + S.f1(rl) + "</span>"; else if (s.zone === "high") room = '<span class="bg-wt">+' + S.f1(-rh) + "</span>";
      else room = '<span class="' + (Math.min(rl, rh) < 5 ? "bg-wt" : "bg-fl") + '" data-tip="' + esc(t("tip.bgs.room", { lo: lo, hi: hi })) + '">' + (rl <= rh ? "▼ +" + S.f1(rl) : "▲ " + S.f1(rh)) + "</span>";
      var tr;
      if (M.nS < 2) tr = '<span class="bg-fl">' + t("bgs.needmore") + "</span>";
      else if (!s.slope) tr = '<span class="bg-fl" data-tip="' + esc(t("tip.bgs.trendneed")) + '">' + t("bgs.needmore") + "</span>";
      else { var p = s.slope; tr = '<span class="' + (p.perDay < -0.15 ? "bg-dn" : p.perDay > 0.15 ? "bg-up" : "bg-fl") + '">' + S.arrow(p.perDay, Math.abs(p.perDay) < 0.15 ? "flat" : "x") + " " + S.sg(p.perDay) + t("bgs.perday") + "</span> <span class='bg-fl'>(" + S.sg(p.q25) + " / " + S.sg(p.q75) + ")</span>" +
        (s.eta ? ' <span class="bg-dn">' + esc(t(s.eta.slow ? "bgs.r.eta" : "bgs.r.eta1", { a: Math.max(1, Math.round(s.eta.fast)), b: Math.round(s.eta.slow || 0), edge: lo })) + "</span>" :
          s.etaH ? ' <span class="bg-wt">' + esc(t(s.etaH.slow ? "bgs.r.eta" : "bgs.r.eta1", { a: Math.max(1, Math.round(s.etaH.fast)), b: Math.round(s.etaH.slow || 0), edge: hi })) + "</span>" :
          s.rec != null ? ' <span class="bg-up">' + esc(t("bgs.r.back", { d: Math.round(s.rec) })) + "</span>" : s.recH != null ? ' <span class="bg-up">' + esc(t("bgs.r.back", { d: Math.round(s.recH) })) + "</span>" : ""); }
      return '<tr data-sys="' + esc(s.n) + '"><td class="n">' + nm(s) + "</td><td>" + S.bullet(s, M, 300, 22) + '</td><td class="r"><b>' + S.f1(s.last) + '</b></td><td class="r">' + room + "</td><td>" + tr + "</td><td>" + S.spark(s, M, 110, 24, { pad: 2 }) + "</td></tr>";
    }).join("") + "</tbody></table></div>";
    return card(t("bgs.risk.h"), sg + (a.length ? tb : need(t("bgs.none"))), { q: t("bgs.risk.q"), note: t("bgs.risk.note", { lo: lo, hi: hi }) });
  };

  V.trends = function (M, ui) {
    if (M.nS < 2) return card(t("bgs.tr.h"), need(t("bgs.tr.need")), { q: t("bgs.tr.q") });
    var q = (ui.q || "").toLowerCase(), so = ui.tsort;
    var a = M.sys.filter(function (s) { return !q || s.n.toLowerCase().indexOf(q) >= 0; });
    a.sort(so === "name" ? function (x, y) { return x.n < y.n ? -1 : 1; } : so === "move" ? function (x, y) { return (x.d == null ? 0 : x.d) - (y.d == null ? 0 : y.d); } : so === "vol" ? function (x, y) { return (y.vol || 0) - (x.vol || 0); } : function (x, y) { return x.last - y.last; });
    var sg = seg("tsort", so, [["low", t("bgs.s.low")], ["move", t("bgs.s.move")], ["vol", t("bgs.s.vol")], ["name", t("bgs.s.name")]]);
    var Y = S.dom(M);
    var g = '<div class="bg-tiles2">' + a.map(function (s) {
      return '<div class="bg-mt ' + s.zone + '" data-sys="' + esc(s.n) + '"><div class="bg-mh"><span class="bg-mn">' + esc(s.n) + '</span><b class="bg-val">' + S.f1(s.last) + "</b>" + dtxt(s) + "</div>" + S.spark(s, M, 176, 52, { y: Y }) + "</div>";
    }).join("") + "</div>";
    return card(t("bgs.tr.h2"), sg + '<input class="bg-in bg-srch" id="tq" data-tip="' + esc(t("tip.bgs.find")) + '" placeholder="' + esc(t("bgs.find")) + '" value="' + esc(ui.q || "") + '">' + g, { q: t("bgs.tr.q2"), note: t("bgs.tr.note", { a: Y[0], b: Y[1] }) });
  };
})();
