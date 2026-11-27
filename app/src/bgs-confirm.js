"use strict";
/* BGS Watch, Setup tab (part 7b): "Check the screenshots and read the values" and the CONFIRM TABLE.
   bgs_scan reads the newest F10 screenshots (only on this click). Every row is shown, unsure cells are amber with the other readings as one-click chips,
   a click on a cell types a fix. Nothing is saved until "Save this snapshot" (bgs_commit). All names and values are shown as text, never as HTML. */
(function () {
  var T = window.__TAURI__ || {}, invoke = T.core && T.core.invoke, BG = window.BG = window.BG || {};
  function issueText(tr, i) { var k = "bgs.issue." + i.code, s = tr(k); return (s === k ? (i.msg || i.code) : s) + (i.page ? " (" + tr("bgs.page", { p: i.page }) + ")" : ""); }
  function rowsOf(p) {
    return (p.rows || []).map(function (c) {
      return { page: c.page, pos: c.pos, name: c.system || c.read_name || "", read: c.read_name, nstate: c.name_state, nalts: (c.name_alts || []).slice(0, 4), x10: c.inf_x10 == null ? null : c.inf_x10, inf: c.inf, ialts: (c.inf_alts || []).slice(0, 4),
        iunsure: !!c.inf_unsure, star: c.star || null, conf: Math.min(c.name_conf == null ? 1 : c.name_conf, c.inf_conf == null ? 1 : c.inf_conf), state: c.state, prev: c.prev_x10, unc: !!c.uncertain, ok: false, nfix: false, vfix: false, ncrop: c.name_crop || c.crop || null, icrop: c.inf_crop || null, nbad: (c.name_state === "snapped" && !!c.uncertain) || c.name_state === "not_in_list" || c.name_state === "unsure" };
    });
  }
  function parseVal(s) { var m = String(s).replace(",", ".").match(/^\s*(\d{1,3}(?:\.\d)?)\s*%?\s*$/); if (!m) return null; var v = Math.round(parseFloat(m[1]) * 10); return v >= 0 && v <= 1000 ? v : null; }
  function fmt(x10) { return x10 == null ? "-" : (x10 / 10).toFixed(1) + "%"; }

  function section(parent, h) {
    var mk = h.mk, tr = h.tr, g = null, sc = { busy: false, res: null, sel: 0, rows: null, note: "", err: "" };
    var c = h.card("bgs.scan.h", parent); c.classList.add("bg-scan"); var top = mk("div", "bg-btns"), go = h.tip(mk("button", "btn go", tr("bgs.scan.btn")), "tip.bgs.scan"), body = mk("div");
    go.type = "button"; top.appendChild(go); c.appendChild(top); c.appendChild(body);
    function state() { return g && g.settings && g.settings.on; }
    go.onclick = function () {
      if (sc.busy) return; sc.busy = true; sc.err = ""; sc.res = null; sc.rows = null; draw();
      invoke("bgs_scan").then(function (r) { sc.busy = false; if (!r || !r.ok) { sc.err = BG.errText(r && r.error) || tr("bgs.scan.fail"); } else { sc.res = r; sc.sel = 0; setRows(); } draw(); })
        .catch(function (e) { sc.busy = false; sc.err = String(e || tr("bgs.scan.fail")); draw(); });
    };
    function prop() { return sc.res && sc.res.proposals ? sc.res.proposals[sc.sel] : null; }
    function setRows() { var p = prop(); sc.rows = p ? rowsOf(p) : null; sc.note = ""; }
    function pending() { return sc.rows ? sc.rows.filter(function (r) { return r.unc && !r.ok; }).length : 0; }
    function edit(cell, r, kind) {
      var i = document.createElement("input"); i.type = "text"; i.value = kind === "n" ? r.name : (r.x10 == null ? "" : (r.x10 / 10).toFixed(1)); i.maxLength = 60;
      cell.textContent = ""; cell.appendChild(i); i.focus(); i.select();
      var done = false;
      function fin(ok) {
        if (done) return; done = true;
        if (ok) {
          if (kind === "n") { var nm = i.value.trim(); if (nm && nm !== r.name) { r.name = nm; r.nfix = true; r.nbad = false; r.ok = true; } }
          else { var v = parseVal(i.value); if (v == null) sc.note = tr("bgs.cf.badval"); else if (v !== r.x10) { r.x10 = v; r.vfix = true; r.iunsure = false; r.ok = true; sc.note = ""; } }
        }
        draw();
      }
      i.onkeydown = function (e) { if (e.key === "Enter") fin(true); else if (e.key === "Escape") fin(false); e.stopPropagation(); };
      i.onblur = function () { fin(true); };
    }
    function cellEl(r, kind) {
      var amber = kind === "n" ? r.nbad : r.iunsure, fixed = kind === "n" ? r.nfix : r.vfix;
      var wrap = mk("span"), s = mk("span", "bg-cell" + (amber && !fixed ? " amber" : fixed ? " fixed" : ""), kind === "n" ? r.name : fmt(r.x10));
      h.tip(s, kind === "n" ? "tip.bgs.cf.name" : "tip.bgs.cf.val");
      var crop = kind === "n" ? r.ncrop : r.icrop;
      if (amber && !fixed && typeof crop === "string" && crop.indexOf("data:image/") === 0) { var im = document.createElement("img"); im.className = "bg-crop"; im.src = crop; im.alt = ""; h.tip(im, "tip.bgs.cf.crop"); wrap.appendChild(im); }
      s.onclick = function () { edit(s, r, kind); };
      wrap.appendChild(s);
      var alts = kind === "n" ? r.nalts : r.ialts;
      if (amber && !fixed && alts.length) {
        var al = mk("span", "bg-alts");
        alts.forEach(function (a) {
          var b = mk("button", "bg-alt", a); b.type = "button"; h.tip(b, "tip.bgs.cf.alt");
          b.onclick = function () { if (kind === "n") { r.name = a; r.nfix = true; r.nbad = false; } else { var v = parseVal(a); if (v == null) return; r.x10 = v; r.vfix = true; r.iunsure = false; } r.ok = true; draw(); };
          al.appendChild(b);
        });
        wrap.appendChild(al);
      }
      return wrap;
    }
    // every value equals the same system's value in the last saved snapshot (and no system is new)
    function unchanged() { return !!sc.rows && sc.rows.length > 0 && sc.rows.every(function (r) { return r.prev != null && r.x10 != null && r.prev === r.x10; }); }
    function save(force) {
      var p = prop(); if (!p || !sc.rows) return;
      if (force !== true && unchanged()) { sc.same = true; draw(); return; }
      sc.same = false;
      var snap = { taken_utc: p.taken_utc, data_utc: p.data_utc, minutes_old: p.minutes_old == null ? null : p.minutes_old, resolution: p.resolution, sources: (p.files || []).map(function (f) { return typeof f === "string" ? f : f.name; }),
        pages: (p.pages_found || []).length, complete: !!p.complete, rows: sc.rows.map(function (r) { return { system: r.name, inf_x10: r.x10, star: r.star, conf: r.conf, confirmed: !!r.ok, pos: r.pos, flagged: !!r.unc }; }), proposal_id: p.id };
      sc.busy = true; draw();
      invoke("bgs_commit", { snapshot: snap }).then(function (r) {
        sc.busy = false;
        if (r && r.ok) { sc.res = null; sc.rows = null; sc.saved = tr("bgs.cf.saved", { id: r.id, n: r.rows }); BG.dirty = true; h.toast(sc.saved); }
        else sc.err = BG.errText(r && r.error) || tr("bgs.scan.fail");
        draw();
      }).catch(function (e) { sc.busy = false; sc.err = String(e); draw(); });
    }
    function draw() {
      // the table is rebuilt on every click: keep where the page and the table were scrolled
      var saved = [], e = body;
      while (e && e !== document.documentElement) { if (e.scrollTop > 0) saved.push([e, e.scrollTop]); e = e.parentNode; }
      var cs = body.querySelector(".bg-confscroll"), cst = cs ? cs.scrollTop : 0;
      draw0();
      saved.forEach(function (p) { p[0].scrollTop = p[1]; });
      var cs2 = body.querySelector(".bg-confscroll"); if (cs2) cs2.scrollTop = cst;
    }
    function draw0() {
      body.textContent = ""; go.disabled = sc.busy || !state();
      if (!state()) body.appendChild(mk("p", "bg-msg", tr("bgs.scan.off")));
      if (sc.busy) { var pg = mk("div", "bg-prog"); pg.appendChild(mk("i")); body.appendChild(pg); body.appendChild(mk("p", "bg-msg", sc.rows ? tr("bgs.cf.saving") : tr("bgs.scan.run", { n: g && g.settings ? g.settings.n : 8 }))); }
      if (sc.err) body.appendChild(mk("p", "bg-msg err", sc.err));
      if (sc.saved && !sc.res) body.appendChild(mk("p", "bg-msg ok", sc.saved));
      if (g && !g.snapshots.length && !sc.res && state()) body.appendChild(mk("p", "note", tr("bgs.scan.first")));
      if (g && !(g.names && g.names.count) && state()) body.appendChild(mk("p", "note", tr("bgs.scan.nonames")));
      var r = sc.res; if (!r) return;
      if (!r.files || !r.files.length) { body.appendChild(mk("div", "bg-empty", r.pictures_dir ? tr("bgs.scan.nofiles") : tr("bgs.scan.nodir"))); }
      if (r.skipped && r.skipped.length) { var ul = mk("ul", "bg-issues"); r.skipped.forEach(function (s) { ul.appendChild(mk("li", null, tr("bgs.scan.skip", { f: s.file, w: s.why }))); }); body.appendChild(ul); }
      var ps = r.proposals || [];
      if (r.files && r.files.length && !ps.length) body.appendChild(mk("div", "bg-empty", tr("bgs.scan.noprop")));
      if (!ps.length) return;
      if (ps.length > 1) {
        var sel = mk("select", "sel"); h.tip(sel, "tip.bgs.cf.pick");
        ps.forEach(function (p, i) { var o = mk("option", null, tr("bgs.cf.opt", { t: BG.calc ? BG.calc.dl(Date.parse(p.taken_utc)) : p.taken_utc, p: (p.pages_found || []).length, q: p.pages_total, s: p.systems_read })); o.value = i; sel.appendChild(o); });
        sel.value = sc.sel; sel.onchange = function () { sc.sel = +sel.value; setRows(); draw(); }; body.appendChild(sel);
      }
      var p = ps[sc.sel], rows = sc.rows || [], unsure = rows.filter(function (x) { return x.unc; }).length, pend = pending();
      var sm = mk("div", "bg-sum");
      [[tr("bgs.cf.taken"), BG.calc ? BG.calc.tm(Date.parse(p.taken_utc)) : p.taken_utc], [tr("bgs.cf.pages"), (p.pages_found || []).length + " / " + p.pages_total], [tr("bgs.cf.sys"), p.systems_read],
        [tr("bgs.cf.sure"), rows.length - unsure], [tr("bgs.cf.unsure"), unsure], [tr("bgs.cf.age"), p.minutes_old == null ? "?" : p.minutes_old + " " + tr("bgs.u.min")], [tr("bgs.cf.res"), p.resolution]].forEach(function (x) {
        var s = mk("span"); s.appendChild(document.createTextNode(x[0] + " ")); s.appendChild(mk("b", null, String(x[1]))); sm.appendChild(s);
      });
      body.appendChild(sm);
      if (p.issues && p.issues.length) { var il = mk("ul", "bg-issues"); p.issues.forEach(function (i) { il.appendChild(mk("li", i.blocking ? "blk" : "", issueText(tr, i))); }); body.appendChild(il); }
      if (p.already_saved) body.appendChild(mk("p", "bg-msg err", tr("bgs.cf.already")));
      var acc = h.tip(mk("button", "btn", tr("bgs.cf.acc", { n: rows.filter(function (x) { return !x.unc && !x.ok; }).length })), "tip.bgs.cf.acc"); acc.type = "button";
      acc.onclick = function () { rows.forEach(function (x) { if (!x.unc) x.ok = true; }); draw(); };
      var bar = mk("div", "bg-btns"); bar.style.margin = "8px 0"; bar.appendChild(acc); body.appendChild(bar);
      if (sc.note) body.appendChild(mk("p", "bg-msg err", sc.note));
      var sc2 = mk("div", "bg-confscroll"), tb = mk("table", "bg-conf"), th = mk("thead"), tr0 = mk("tr");
      ["#", tr("bgs.c.system"), tr("bgs.cf.inf"), tr("bgs.c.before"), "", tr("bgs.cf.status")].forEach(function (x) { tr0.appendChild(mk("th", null, x)); });
      th.appendChild(tr0); tb.appendChild(th);
      var tbd = mk("tbody");
      rows.forEach(function (rw) {
        var t = mk("tr", rw.unc && !rw.ok ? "unsure" : ""), td;
        t.appendChild(mk("td", "bg-fl", rw.page + "." + rw.pos));
        td = mk("td"); td.appendChild(cellEl(rw, "n")); t.appendChild(td);
        td = mk("td"); td.appendChild(cellEl(rw, "v")); t.appendChild(td);
        t.appendChild(mk("td", "bg-fl", rw.prev == null ? "" : fmt(rw.prev)));
        t.appendChild(mk("td", "bg-fl", rw.star ? "★" : ""));
        td = mk("td");
        var skey = "bgs.state." + (rw.state === "snapped" && !rw.unc ? "snapped_ok" : (rw.state || "sure")), st = tr(skey);
        td.appendChild(mk("span", rw.unc && !rw.ok ? "bg-wt" : "bg-fl", st === skey ? (rw.state || "") : st));
        if (rw.unc) { var ok = mk("button", "bg-ok" + (rw.ok ? " done" : ""), rw.ok ? tr("bgs.cf.done") : tr("bgs.cf.ok")); ok.type = "button"; h.tip(ok, "tip.bgs.cf.ok"); ok.style.marginLeft = "8px"; ok.onclick = function () { rw.ok = !rw.ok; draw(); }; td.appendChild(ok); }
        t.appendChild(td); tbd.appendChild(t);
      });
      tb.appendChild(tbd); sc2.appendChild(tb); body.appendChild(sc2);
      var can = p.can_save && !p.already_saved && !pend && !sc.busy;
      var sv = h.tip(mk("button", "btn go", tr("bgs.cf.save")), "tip.bgs.cf.save"); sv.type = "button"; sv.disabled = !can; sv.onclick = function () { save(); }; sv.style.marginTop = "10px";
      body.appendChild(sv);
      if (sc.same && can) {
        var sm = mk("p", "bg-msg", tr("bgs.cf.same")); sm.style.marginTop = "8px"; body.appendChild(sm);
        var sg = h.tip(mk("button", "btn", tr("bgs.cf.same_go")), "tip.bgs.cf.same_go"); sg.type = "button"; sg.onclick = function () { save(true); }; body.appendChild(sg);
      }
      if (!can) body.appendChild(mk("p", "bg-msg", !p.can_save ? tr("bgs.cf.blocked") : pend ? tr("bgs.cf.pend", { n: pend }) : ""));
      else body.appendChild(mk("p", "note", tr("bgs.cf.note")));
    }
    function takeHandoff() {
      invoke("bgs_handoff_take").then(function (r) { if (r && r.ok && r.proposals && r.proposals.length) { sc.res = r; sc.sel = 0; sc.err = ""; setRows(); draw(); } }).catch(function () {});
    }
    function refresh() { BG.get().then(function (r) { var was = state(); g = r; BG.g = r; if (r && r.handoff && !sc.busy) takeHandoff(); if (was !== state()) draw(); }).catch(function () {}); }
    refresh(); draw(); BG.poll(parent, refresh, 3000);
  }
  if (window.GVC) GVC.add("bgsscan", function (parent) { section(parent, GVC.h); });
})();
