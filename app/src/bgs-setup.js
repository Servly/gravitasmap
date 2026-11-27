"use strict";
/* BGS Watch, Setup tab (part 7a): the mode switch, the system names (Inara CSV or pasted), the reading settings, export and forget.
   BGS makes NO network call: the Inara page is opened in the player's own browser, the player picks the downloaded CSV file here.
   Built as a GVC section ("bgssetup") with the same helpers as the other pages (GVC.h). The confirm table is in bgs-confirm.js. */
(function () {
  var T = window.__TAURI__ || {}, invoke = T.core && T.core.invoke, BG = window.BG = window.BG || {};
  BG.tr = function (k, v) { return window.GVC ? GVC.h.tr(k, v) : k; };
  BG.pollers = BG.pollers || [];
  BG.lang = "en";
  // one timer for every BGS page: it runs only for pages that are on the screen (never in the background)
  BG.poll = function (el, fn, ms) {
    BG.pollers = BG.pollers.filter(function (p) { return p.el.isConnected; }); BG.pollers.push({ el: el, fn: fn, ms: ms || 2500, at: 0 });
    if (BG.timer) return;
    BG.timer = setInterval(function () {
      if (document.visibilityState === "hidden") return;
      var now = Date.now(); BG.pollers = BG.pollers.filter(function (p) { return p.el.isConnected; });
      BG.pollers.forEach(function (p) { if (p.el.offsetParent && now - p.at >= p.ms) { p.at = now; try { p.fn(); } catch (e) {} } });
    }, 500);
  };
  var en = null;                                            // the English texts, for the Discord report (always English)
  BG.trEn = function (k, v) {
    var s = en && en[k]; if (s == null) return BG.tr(k, v);
    return v ? s.replace(/\{(\w+)\}/g, function (m, x) { return v[x] != null ? v[x] : m; }) : s;
  };
  BG.loadEn = function () { if (en || BG._en) return; BG._en = 1; fetch("lang/en.json").then(function (r) { return r.json(); }).then(function (d) { en = d; if (BG.render) BG.render(); }).catch(function () {}); };
  BG.get = function () { return invoke ? invoke("bgs_get") : Promise.reject(); };
  BG.openUrl = function (u) { var o = T.opener && T.opener.openUrl; if (o) o(u); else window.open(u, "_blank"); };
  BG.errText = function (e) { var s = String(e || ""); return /BGS Watch is off/i.test(s) ? BG.tr("bgs.err.off") : s; };

  function section(parent, h) {
    var mk = h.mk, tr = h.tr, g = null, msgs = {};
    function msg(card, text, cls) { var m = card.querySelector(".bg-msg"); if (!m) { m = mk("p", "bg-msg"); card.appendChild(m); } m.className = "bg-msg " + (cls || ""); m.textContent = text || ""; }
    function names() {
      var n = g && g.names ? g.names.count : 0;
      return n ? tr("bgs.names.n", { n: n }) : tr("bgs.names.none");
    }
    // ----- card 1: mode switch -----
    var c1 = h.card("bgs.set.mode.h", parent); c1.classList.add("bg-mode");
    c1.appendChild(h.row(tr("bgs.on"), h.sw(function () { return !!(g && g.settings && g.settings.on); }, function (on) {
      invoke("bgs_settings_set", { key: "on", value: on }).then(function (r) { if (r && r.ok) (g || (g = {})).settings = r.settings; else msg(c1, BG.errText(r && r.error), "err"); });
    }), tr("bgs.on.d"), "tip.bgs.on"));
    c1.appendChild(mk("p", "note", tr("bgs.on.note")));
    // ----- card 2: system names -----
    var c2 = h.card("bgs.names.h", parent); c2.classList.add("bg-names"); var cnt = mk("p", "bg-msg ok"), idIn = mk("input", "txt bg-idin");
    c2.appendChild(mk("p", "note", tr("bgs.names.intro")));
    var pf = mk("div", "bg-prefix");
    idIn.type = "text"; idIn.maxLength = 200; idIn.placeholder = tr("bgs.inara.ph"); h.tip(idIn, "tip.bgs.inara_id");
    // the number is taken from a pasted page address (.../minorfaction-presence/123456/) or typed as it is
    function idOf(v) { var m = /minorfaction-presence\/(\d{1,12})/.exec(v) || /^\s*(\d{1,12})\s*$/.exec(v); return m ? m[1] : ""; }
    idIn.onchange = function () {
      var id = idOf(idIn.value);
      if (idIn.value.trim() && !id) { msg(c2, tr("bgs.inara.badid"), "err"); return; }
      idIn.value = id;
      invoke("bgs_settings_set", { key: "inara_id", value: id }).then(function (r) { if (r && r.ok) { (g || (g = {})).settings = r.settings; msg(c2, tr("bgs.saved"), "ok"); } }).catch(function () {});
    };
    pf.appendChild(idIn);
    var open = h.tip(mk("button", "btn", tr("bgs.inara.open")), "tip.bgs.inara_open"); open.type = "button";
    open.onclick = function () {
      var id = idOf(idIn.value);
      if (id) BG.openUrl("https://inara.cz/elite/minorfaction-presence/" + id + "/"); else BG.openUrl("https://inara.cz/");
    };
    pf.appendChild(open); c2.appendChild(pf);
    c2.appendChild(mk("p", "note", tr("bgs.inara.steps")));
    var file = document.createElement("input"); file.type = "file"; file.accept = ".csv,text/csv"; file.hidden = true;
    var pick = h.tip(mk("button", "btn go", tr("bgs.inara.pick")), "tip.bgs.names_csv"); pick.type = "button";
    pick.onclick = function () { file.value = ""; file.click(); };
    file.onchange = function () {
      var f = file.files && file.files[0]; if (!f) return;
      if (f.size > 5e6) { msg(c2, tr("bgs.csv.big"), "err"); return; }
      var rd = new FileReader();
      rd.onload = function () {
        invoke("bgs_names_import_csv", { text: String(rd.result || "") }).then(function (r) {
          if (r && r.ok) { msg(c2, tr("bgs.csv.ok", { n: r.count, a: r.added || 0 }), "ok"); refresh(); } else msg(c2, BG.errText(r && r.error) || tr("bgs.csv.fail"), "err");
        }).catch(function () { msg(c2, tr("bgs.csv.fail"), "err"); });
      };
      rd.onerror = function () { msg(c2, tr("bgs.csv.fail"), "err"); };
      rd.readAsText(f);
    };
    var pr = mk("div", "bg-btns"); pr.appendChild(pick); pr.appendChild(file); c2.appendChild(pr);
    c2.appendChild(mk("p", "note", tr("bgs.inara.why")));
    c2.appendChild(cnt);
    c2.appendChild(mk("p", "note", tr("bgs.paste.h")));
    var ta = mk("textarea", "bg-paste"); ta.placeholder = tr("bgs.paste.ph"); ta.spellcheck = false; h.tip(ta, "tip.bgs.paste");
    c2.appendChild(ta);
    var ps = h.tip(mk("button", "btn", tr("bgs.paste.save")), "tip.bgs.paste_save"); ps.type = "button"; ps.style.marginTop = "8px";
    ps.onclick = function () {
      var list = ta.value.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);
      invoke("bgs_names_set", { list: list }).then(function (r) {
        if (r && r.ok) { msg(c2, tr("bgs.csv.ok", { n: r.count, a: 0 }) + (r.rejected && r.rejected.length ? " " + tr("bgs.paste.rej", { n: r.rejected.length }) : ""), r.rejected && r.rejected.length ? "" : "ok"); ta.value = ""; refresh(); }
        else msg(c2, BG.errText(r && r.error), "err");
      });
    };
    c2.appendChild(ps);
    // ----- card 3: reading settings -----
    var c3 = h.card("bgs.read.h", parent); c3.classList.add("bg-read"); var form = mk("div", "bg-form"), inputs = {};
    function num(key, label, tipKey, min, max, step, small) {
      var l = mk("label"), i = document.createElement("input"); i.type = "number"; i.min = min; i.max = max; i.step = step; h.tip(l, tipKey); inputs[key] = i;
      l.appendChild(mk("span", null, label)); l.appendChild(i);
      if (small) l.appendChild(mk("small", "bg-fl", small));
      i.onchange = function () {
        var v = parseFloat(i.value); if (isNaN(v)) { show(); return; }
        var call = key === "low" || key === "high" ? { key: "band", value: [parseFloat(inputs.low.value), parseFloat(inputs.high.value)] } : { key: key, value: v };
        invoke("bgs_settings_set", call).then(function (r) { if (r && r.ok) { (g || (g = {})).settings = r.settings; msg(c3, tr("bgs.saved"), "ok"); BG.bandChanged && BG.bandChanged(); } else { msg(c3, BG.errText(r && r.error), "err"); } show(); });
      };
      form.appendChild(l);
    }
    num("n", tr("bgs.n"), "tip.bgs.n", 1, 64, 1, tr("bgs.n.d"));
    num("window_min", tr("bgs.win"), "tip.bgs.window", 1, 60, 1, tr("bgs.win.d"));
    num("low", tr("bgs.low"), "tip.bgs.band", 0, 100, 0.5); num("high", tr("bgs.high"), "tip.bgs.band", 0, 100, 0.5);
    num("jump", tr("bgs.jump"), "tip.bgs.jump", 0.1, 50, 0.1, tr("bgs.jump.d"));
    c3.appendChild(form);
    c3.appendChild(mk("p", "note", tr("bgs.band.risk")));
    var dl = mk("label"), dir = mk("input", "txt"); dir.type = "text"; dir.placeholder = tr("bgs.dir.ph"); h.tip(dl, "tip.bgs.dir");
    dl.style.cssText = "display:grid;gap:4px;font-size:12.5px;color:var(--dim);margin-top:8px"; dl.appendChild(mk("span", null, tr("bgs.dir"))); dl.appendChild(dir);
    dir.onchange = function () { invoke("bgs_settings_set", { key: "shots_dir", value: dir.value }).then(function (r) { if (r && r.ok) { (g || (g = {})).settings = r.settings; msg(c3, tr("bgs.saved"), "ok"); } else msg(c3, BG.errText(r && r.error), "err"); }); };
    c3.appendChild(dl);
    // population from Spansh: on by default, one switch
    var pl = mk("label", "bg-ck"), pc = document.createElement("input"); pc.type = "checkbox"; h.tip(pl, "tip.bgs.pop");
    pl.style.cssText = "display:flex;gap:8px;align-items:center;font-size:12.5px;margin-top:10px"; pl.appendChild(pc); pl.appendChild(mk("span", null, tr("bgs.pop.sw")));
    pc.onchange = function () { invoke("bgs_settings_set", { key: "population", value: pc.checked }).then(function (r) { if (r && r.ok) { (g || (g = {})).settings = r.settings; msg(c3, tr("bgs.saved"), "ok"); BG.dirty = true; } else msg(c3, BG.errText(r && r.error), "err"); show(); }); };
    c3.appendChild(pl); c3.appendChild(mk("p", "note", tr("bgs.pop.d")));
    // ----- card: data (export, forget) -----
    var c5 = h.card("bgs.data.h", parent); c5.classList.add("bg-data"); var bx = mk("div", "bg-btns");
    var ex = h.tip(mk("button", "btn", tr("bgs.export")), "tip.bgs.csv"); ex.type = "button";
    ex.onclick = function () {
      invoke("bgs_export_csv").then(function (r) {
        if (!r || !r.ok) { msg(c5, BG.errText(r && r.error), "err"); return; }
        invoke("save_text_file", { kind: "bgs", text: "\ufeff" + r.csv }).then(function (path) {
          msg(c5, tr("bgs.export.ok", { f: String(path).split(/[\\/]/).pop() }), "ok");
        }).catch(function () { msg(c5, tr("bgs.export.fail"), "err"); });
      }).catch(function () { msg(c5, tr("bgs.export.fail"), "err"); });
    };
    var fg = h.tip(mk("button", "btn", tr("bgs.forget")), "tip.bgs.forget"), ft = 0; fg.type = "button";
    fg.onclick = function () {
      if (!ft) { fg.textContent = tr("bgs.forget2"); fg.classList.add("bg-danger"); ft = setTimeout(function () { ft = 0; fg.textContent = tr("bgs.forget"); fg.classList.remove("bg-danger"); }, 6000); return; }
      clearTimeout(ft); ft = 0; fg.textContent = tr("bgs.forget"); fg.classList.remove("bg-danger");
      invoke("bgs_forget").then(function (r) { if (r && r.ok) { msg(c5, tr("bgs.forget.done", { n: r.files_removed || 0 }), "ok"); BG.dirty = true; refresh(); } else msg(c5, BG.errText(r && r.error), "err"); });
    };
    // Import CSV: the file Export CSV wrote (for example from a friend). First it is only read and reported, nothing is saved until the player confirms.
    var impFile = document.createElement("input"); impFile.type = "file"; impFile.accept = ".csv,text/csv"; impFile.multiple = true; impFile.hidden = true;
    var impBtn = h.tip(mk("button", "btn", tr("bgs.imp.btn")), "tip.bgs.imp"); impBtn.type = "button";
    var impBox = mk("div", "bg-imp");
    impBtn.onclick = function () { impFile.value = ""; impFile.click(); };
    function impShow(text, r) {
      impBox.textContent = "";
      var gs = r.groups || [], skipped = r.to_skip || 0;
      impBox.appendChild(mk("p", "bg-msg", tr("bgs.imp.sum", { n: r.snapshots, a: r.to_add, s: skipped, b: r.bad_rows || 0 })));
      var list = mk("ul", "bg-issues");
      gs.forEach(function (x) {
        var when = BG.calc ? BG.calc.tmc(Date.parse(x.data_utc), Date.parse(x.taken_utc)) : x.data_utc;
        list.appendChild(mk("li", x.action === "add" ? "" : "blk", when + ": " + x.rows + " " + tr("bgs.imp.rows") + (x.action === "add" ? "" : " (" + tr("bgs.imp.have") + ")") + (x.unchecked_rows ? ", " + tr("bgs.imp.unchecked", { n: x.unchecked_rows }) : "") + (x.not_in_list_count ? ", " + tr("bgs.imp.names", { n: x.not_in_list_count, list: (x.not_in_list || []).slice(0, 6).join(", ") }) : "")));
      });
      impBox.appendChild(list);
      if (!r.to_add) { impBox.appendChild(mk("p", "note", tr("bgs.imp.none"))); return; }
      var go = h.tip(mk("button", "btn go", tr(r.to_add === 1 ? "bgs.imp.go1" : "bgs.imp.go", { a: r.to_add })), "tip.bgs.imp_go"); go.type = "button";
      var no = h.tip(mk("button", "btn", tr("bgs.imp.cancel")), "tip.bgs.imp_cancel"); no.type = "button";
      go.onclick = function () {
        go.disabled = true;
        invoke("bgs_import_csv", { text: text, apply: true }).then(function (r2) {
          if (r2 && r2.ok && r2.applied) { impBox.textContent = ""; msg(c5, tr((r2.ids || []).length === 1 ? "bgs.imp.done1" : "bgs.imp.done", { a: (r2.ids || []).length }), "ok"); BG.dirty = true; refresh(); }
          else { impBox.appendChild(mk("p", "bg-msg err", BG.errText(r2 && r2.error) || tr("bgs.imp.fail"))); go.disabled = false; }
        }).catch(function () { impBox.appendChild(mk("p", "bg-msg err", tr("bgs.imp.fail"))); go.disabled = false; });
      };
      no.onclick = function () { impBox.textContent = ""; };
      var bb = mk("div", "bg-btns"); bb.appendChild(go); bb.appendChild(no); impBox.appendChild(bb);
    }
    impFile.onchange = function () {
      var files = Array.prototype.slice.call(impFile.files || []); if (!files.length) return;
      if (files.length > 40) { msg(c5, tr("bgs.csv.big"), "err"); return; }
      // several files are joined into one text (each has the same header, only the first one is kept) so one summary covers them all
      Promise.all(files.map(function (f) {
        return new Promise(function (ok, bad) {
          if (f.size > 20e6) { bad(); return; }
          var rd = new FileReader(); rd.onload = function () { ok(String(rd.result || "")); }; rd.onerror = function () { bad(); }; rd.readAsText(f);
        });
      })).then(function (texts) {
        var text = texts.map(function (t, i) { t = t.replace(/^\ufeff/, ""); if (i === 0) return t; var k = t.indexOf("\n"); return k < 0 ? "" : t.slice(k + 1); }).map(function (t) { return t.replace(/\s+$/, ""); }).join("\n") + "\n";
        return invoke("bgs_import_csv", { text: text, apply: false }).then(function (r) {
          if (r && r.ok) impShow(text, r); else { impBox.textContent = ""; impBox.appendChild(mk("p", "bg-msg err", BG.errText(r && r.error) || tr("bgs.imp.fail"))); }
        });
      }).catch(function () { impBox.textContent = ""; impBox.appendChild(mk("p", "bg-msg err", tr("bgs.imp.fail"))); });
    };
    bx.appendChild(ex); bx.appendChild(impBtn); bx.appendChild(impFile); bx.appendChild(fg); c5.appendChild(bx); c5.appendChild(impBox); c5.appendChild(mk("p", "note", tr("bgs.imp.note"))); c5.appendChild(mk("p", "note", tr("bgs.data.note")));
    function show() {
      if (!g || !g.settings) return; var s = g.settings;
      Object.keys(inputs).forEach(function (k) { if (document.activeElement !== inputs[k] && s[k] != null) inputs[k].value = s[k]; });
      if (document.activeElement !== idIn && s.inara_id != null) idIn.value = s.inara_id;
      if (document.activeElement !== dir) dir.value = s.shots_dir || "";
      if (document.activeElement !== pc) pc.checked = s.population !== false;
      cnt.textContent = names(); cnt.className = "bg-msg " + (g.names && g.names.count ? "ok" : "");
    }
    function refresh() { BG.get().then(function (r) { g = r; BG.g = r; show(); if (window.GVC) GVC.poll(); }).catch(function () {}); }
    refresh(); BG.poll(parent, refresh, 3000);
    return c1;
  }
  if (window.GVC) GVC.add("bgssetup", function (parent) { section(parent, GVC.h); });
})();
