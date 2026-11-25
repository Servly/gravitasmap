"use strict";
// The Combat controls, ONE set of them for the app's window and for the GRAVITAS menu over the game (Ctrl+Shift+G): both build their pages from
// this file, so they are the same things in the same state. The Rust side keeps the state (settings.json); this file shows it and sends changes.
(function () {
  var T = window.__TAURI__ || {};
  var invoke = T.core && T.core.invoke;
  var tr = function (k, v) { return k; };       // set by init
  var getLang = function () { return "en"; };
  var toast = function () {};
  var S = {}, info = {}, ov = {}, extra = {}, roots = [], timer = null;
  var renders = [];                              // every control's own "show the state" function

  function $$w(el, sel) { return Array.prototype.slice.call(el.querySelectorAll(sel)); }
  function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function card(titleKey, parent) { var c = mk("div", "card"); if (titleKey) c.appendChild(mk("h2", null, tr(titleKey))); parent.appendChild(c); return c; }
  // a short hover tip (the tooltip habit: every control gets one, as "tip.<name>" in all six language files; no tip key in the language = no tooltip)
  function tip(el, key) { if (el && key) { var s = tr(key); if (s !== key) el.title = s; } return el; }
  function row(label, ctl, small, tipKey) {
    var d = mk("div", "opt"), l = mk("div"); tip(d, tipKey); l.appendChild(mk("div", null, label)); if (small) l.appendChild(mk("small", null, small));
    d.appendChild(l); if (ctl) d.appendChild(ctl); return d;
  }
  // a small control group: its label right next to its control (On, Perspective, Shows with, Colour): used by the multi-control rows (.rw, rows.css)
  function cg(label, ctl, tipKey) { var s = mk("span", "cg"); tip(s, tipKey); s.appendChild(mk("small", null, label)); s.appendChild(ctl); return s; }
  function sw(getter, send) {
    var b = mk("button", "sw"); b.setAttribute("role", "switch"); b.setAttribute("aria-checked", "false");
    b.onclick = function () { var n = b.getAttribute("aria-checked") !== "true"; b.setAttribute("aria-checked", n); send(n); };
    renders.push(function () { b.setAttribute("aria-checked", !!getter()); });
    return b;
  }
  function op(name, value) { if (invoke) invoke("combat_op", { name: name, value: value }); }
  var WHEN = [["always", "Main panel"], ["main_l", "Main panel left"], ["main_r", "Main panel right"], ["main_t", "Main panel top"], ["ext", "Left panel (1)"], ["comms", "Comms panel (2)"],
              ["role", "Role panel (3)"], ["int", "Right panel (4)"], ["role_l", "Role panel (3) left"], ["role_t", "Role panel (3) top"], ["int_t", "Right panel (4) top"]];
  var SNAPS = [["left", "menu.w.snap.left"], ["centre", "menu.w.snap.centre"], ["right", "menu.w.snap.right"], ["top", "menu.w.snap.top"], ["bottom", "menu.w.snap.bottom"]];
  function set(key, value) { if (invoke) invoke("combat_setting", { key: key, value: value }); var p = key.split("."), o = S; for (var i = 0; i < p.length - 1; i++) { o = o[p[i]] = o[p[i]] || {}; } o[p[p.length - 1]] = value; }
  function rng(key, lo, hi, unit) {
    var d = mk("div", "rng"), i = document.createElement("input"), b = mk("b");
    i.type = "range"; i.min = lo; i.max = hi;
    i.oninput = function () { b.textContent = i.value + unit; };
    i.onchange = function () { set(key, parseInt(i.value, 10)); };
    d.appendChild(i); d.appendChild(b);
    renders.push(function () { if (document.activeElement !== i && S[key] != null) { i.value = S[key]; b.textContent = S[key] + unit; } });
    return d;
  }

  var WINS = [["status", "Status"], ["alert", "Interdiction"], ["targets", "Targets by value"], ["feed", "Kill feed"], ["fight", "Current fight"],
              ["speed", "Time to kill"], ["bounty", "Bounty counter"], ["sysmap", "System map"], ["report", "Combat report"], ["banner", "COMBAT banner"], ["shortcuts", "Keys (10 s)"], ["modecard", "Mode card"]];
  // the Thargoid page's own windows
  var TWINS = [["thargoid", "Thargoid (Xeno Hunt)"], ["xenoreport", "Xeno Hunt report"]];
  // the Debrief page's own windows
  var DWINS = [["inputs", "Input display"], ["debrief", "Debrief report"]];
  // the PVP page's own window
  var PWINS = [["pvp", "PVP mode chip"]];
  // the keys' jobs that are worth a button (flip free look is not: the game's own button does that)
  var ACTS = [["reset", "menu.act.reset"], ["clear", "menu.act.clear"], ["report", "menu.act.report"], ["hide", "menu.act.hide"], ["claims", "menu.act.claims"], ["report_clear", "menu.act.report_clear"]];
  // behaviour switches (the wing ones, the dark ground and the Bounty counter's brief mode have their own places)
  var FLAGS = [["always", "menu.k.always"], ["hide_maps", "menu.k.maps"], ["look_hide", "menu.k.look"], ["bonds", "menu.k.bonds"], ["front", "menu.k.front"],
               ["drop_lost", "menu.k.droplost"], ["sc_ends", "menu.k.scends"]];
  var DEFAULT_COLOUR = "#ff7100";

  /** A kept list (fights or hunts): pick one, read it, copy it, show it on the game, delete it (with undo), star it. */
  function pastList(p, o) {
    var c = card(o.h, p), pre = o.pre;
    c.appendChild(mk("p", "note", tr(o.note)));
    var sel = mk("select", "sel"); sel.size = 8; sel.style.cssText = "width:100%;margin:8px 0"; c.appendChild(sel);
    var bar = mk("div", "opt"), b1 = mk("button", "btn", tr("past.copy")), b2 = mk("button", "btn", tr("past.show")), b5 = tip(mk("button", "btn", tr("past.fav")), "tip.past.fav"), b3 = mk("button", "btn", tr("past.del")), b4 = mk("button", "btn", tr("past.undo"));
    tip(sel, o.tip); tip(b1, "tip.past.copy"); tip(b2, "tip.past.show"); tip(b3, "tip.past.del"); tip(b4, "tip.past.undo"); b4.hidden = true;
    [b1, b2, b5, b3, b4].forEach(function (b) { bar.appendChild(b); }); c.appendChild(bar);
    var pre_ = mk("pre", "note"); pre_.style.cssText = "white-space:pre-wrap;user-select:text;max-height:260px;overflow:auto"; c.appendChild(pre_);
    var items = [], sig = null;
    function chosen() { var i = sel.selectedIndex; return i >= 0 ? items[i] : null; }
    function text() {
      var x = chosen(); [b1, b2, b3, b5].forEach(function (b) { b.disabled = !x; });
      b5.textContent = tr(x && x.fav ? "past.unfav" : "past.fav"); tip(b5, x && x.fav ? "tip.past.unfav" : "tip.past.fav");
      if (!x) { pre_.textContent = tr(o.none); return; }
      invoke(pre + "_report", { t0: x.t0, lang: getLang() }).then(function (r) { pre_.textContent = r ? r.details : ""; });
    }
    function fill(pick, keep) {
      if (!invoke) return;
      invoke(pre + "_list", { lang: getLang() }).then(function (a) {
        items = a; sel.innerHTML = ""; sig = JSON.stringify(a.map(function (x) { return [x.t0, x.fav]; }));
        a.forEach(function (it, i) { var o2 = mk("option", null, (it.fav ? "\u2605 " : "") + (it.t0 ? new Date(it.t0).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "?") + "  " + it.line); o2.value = i; sel.appendChild(o2); });
        var at = Math.min(pick || 0, a.length - 1);
        if (keep != null) a.forEach(function (it, i) { if (it.t0 === keep) at = i; });
        if (a.length) sel.selectedIndex = at;
        text();
      }).catch(function () {});
    }
    sel.onchange = text;
    b1.onclick = function () { var x = chosen(); if (x) invoke(pre + "_report", { t0: x.t0, lang: getLang() }).then(function (r) { if (r && navigator.clipboard) navigator.clipboard.writeText(r.text).then(function () { toast(tr("past.copied")); }); }); };
    b2.onclick = function () { var x = chosen(); if (x) { invoke(pre + "_show", { t0: x.t0 }); toast(tr("past.shown")); } };
    b5.onclick = function () { var x = chosen(); if (x) invoke(pre + "_fav", { t0: x.t0, on: !x.fav }).then(function () { fill(0, x.t0); }); };
    b3.onclick = function () { var x = chosen(), i = sel.selectedIndex; if (!x) return; invoke(pre + "_delete", { t0: x.t0 }).then(function () { fill(i); b4.hidden = false; setTimeout(function () { b4.hidden = true; }, 8000); }); };
    b4.onclick = function () { invoke(pre + "_undo").then(function () { b4.hidden = true; fill(0); }); };
    p._pastFill = fill; fill(0);
    setInterval(function () {
      if (!invoke || !c.offsetParent) return; // (only while the page is on the screen)
      invoke(pre + "_list", { lang: getLang() }).then(function (a) {
        if (JSON.stringify(a.map(function (x) { return [x.t0, x.fav]; })) !== sig) { var x = chosen(); fill(sel.selectedIndex, x ? x.t0 : null); }
      }).catch(function () {});
    }, 3000);
  }

  var SEC = {
    /** the mode switch */
    modes: function (p) {
      var c = card("menu.main.modes", p);
      c.appendChild(mk("p", "note", tr("menu.mode.auto")));
      c.appendChild(row(tr("menu.mode.combat"), sw(function () { return info.on; }, function (n) { if (invoke) invoke("combat_set", { on: n }); }), tr("menu.mode.combat.d"), "tip.combat.on"));
      c.appendChild(row(tr("menu.mode.thargoid"), sw(function () { return info.thargoid !== false; }, function (n) { if (invoke) invoke("mode_set", { name: "thargoid", on: n }); }), tr("menu.mode.thargoid.d"), "tip.mode.thargoid.on"));
      c.appendChild(row(tr("menu.mode.foot"), sw(function () { return info.foot !== false; }, function (n) { if (invoke) invoke("mode_set", { name: "foot", on: n }); }), tr("menu.mode.foot.d"), "tip.mode.foot.on"));
      var st = mk("p", "note"); c.appendChild(st);
      renders.push(function () { st.textContent = !info.on ? tr("combat.state.off") : info.error ? info.error : tr("combat.state.on", { shown: info.shown || 0, windows: info.windows || 0 }); });
    },
    /** the few jobs the keys do, as buttons */
    actions: function (p) {
      var c = card("menu.combat.actions", p), a = mk("div", "acts");
      ACTS.forEach(function (x) { var b = tip(mk("button", "btn", tr(x[1])), "tip.act." + x[0]); b.onclick = function () { if (invoke) invoke("combat_action", { name: x[0] }); }; a.appendChild(b); });
      c.appendChild(a);
    },
    windows: function (p, which) {
      var pv = which === "pvp", db = which === "db" || pv, th = which === "th" || db, list = pv ? PWINS : which === "db" ? DWINS : th ? TWINS : WINS;
      var c = card(pv ? "menu.pvp.windows" : db ? "menu.db.windows" : th ? "menu.th.windows" : "menu.combat.windows", p);
      var need = mk("p", "note"); c.appendChild(need);
      renders.push(function () { need.textContent = pv ? tr("menu.pvp.wnote") : db ? tr("menu.db.wnote") : th ? tr("menu.th.wnote") : info.on ? tr("menu.w.edit") : tr("menu.w.needon"); });
      if (!th) {
        c.appendChild(row(tr("menu.w.auto"), sw(function () { return S.auto; }, function (n) { set("auto", n); }), tr("menu.w.auto.d"), "tip.w.auto"));
        c.appendChild(row(tr("menu.k.bg"), sw(function () { return S.bg; }, function (n) { set("bg", n); }), tr("menu.k.bg.d"), "tip.w.bg"));
        var top = mk("div", "opt"), def = mk("button", "btn", tr("menu.w.defaults")); tip(def, "tip.w.defaults"); def.onclick = function () { op("defaults", {}); };
        top.appendChild(mk("div", null, tr("menu.w.defaults.d"))); top.appendChild(def); c.appendChild(top);
      }
      // each window is one row (rows.css): its name on the left, its controls grouped on the right in a fixed order:
      // On, Perspective, Shows with, Colour (Apply, Default), Default position (no arrows: windows are dragged in Edit HUD)
      var GROUPS = [["menu.w.g.main", ["always", "main_l", "main_r", "main_t"]], ["menu.w.g.left", ["ext"]], ["menu.w.g.comms", ["comms"]], ["menu.w.g.role", ["role", "role_l", "role_t"]], ["menu.w.g.right", ["int", "int_t"]]];
      list.forEach(function (x) {
        var key = x[0], r = mk("div", "rw"), tt = mk("div", "rw-t"), cs = mk("div", "rw-c");
        tt.appendChild(mk("div", "wname", x[1]));
        cs.appendChild(cg(tr("win.on"), sw(function () { return S.win && S.win[key] && S.win[key].on; }, function (n) { set("win." + key + ".on", n); }), "tip.win.on"));
        cs.appendChild(cg(tr("win.persp"), sw(function () { var w = S.win && S.win[key]; return !w || w.persp !== false; }, function (n) { set("win." + key + ".persp", n); }), "tip.win.persp"));
        var sel = mk("select", "sel");
        if (!th) GROUPS.forEach(function (g) {
          var og = document.createElement("optgroup"); og.label = tr(g[0]);
          g[1].forEach(function (k) { var w = WHEN.filter(function (z) { return z[0] === k; })[0]; var o = mk("option", null, w[1]); o.value = k; og.appendChild(o); });
          sel.appendChild(og);
        });
        sel.onchange = function () { set("win." + key + ".when", sel.value); };
        renders.push(function () { var w = S.win && S.win[key]; if (w && document.activeElement !== sel) sel.value = w.when; });
        if (!th) cs.appendChild(cg(tr("win.where"), sel, "tip.win.where"));
        var col = document.createElement("input"), pend = false; col.type = "color"; col.className = "swatch";
        var okb = mk("button", "btn sm", tr("col.apply")), dfb = mk("button", "btn sm ghost", tr("col.default")); okb.hidden = true;
        col.oninput = function () { pend = true; okb.hidden = false; };
        okb.onclick = function () { set("win." + key + ".colour", col.value); pend = false; okb.hidden = true; };
        dfb.onclick = function () { col.value = DEFAULT_COLOUR; set("win." + key + ".colour", DEFAULT_COLOUR); pend = false; okb.hidden = true; };
        var cw = cg(tr("win.colour"), col, "tip.win.colour"); cw.appendChild(okb); cw.appendChild(dfb); tip(okb, "tip.col.apply"); tip(dfb, "tip.col.default"); cs.appendChild(cw);
        renders.push(function () { var w = S.win && S.win[key]; if (w && !pend && document.activeElement !== col) col.value = w.colour; });
        var rs = mk("button", "btn sm ghost", tr("menu.w.defpos")); rs.title = tr("menu.w.defpos.d"); rs.onclick = function () { op("reset", { key: key }); }; cs.appendChild(rs);
        r.appendChild(tt); r.appendChild(cs); c.appendChild(r);
      });
    },
    /** profiles: the windows set up for a ship, kept under a name; switched by itself when you board that ship */
    profiles: function (p) {
      var c = card("menu.prof.h", p);
      c.appendChild(mk("p", "note", tr("menu.prof.note")));
      var sel = mk("select", "sel"), name = document.createElement("input"); name.className = "txt"; name.placeholder = tr("menu.prof.name");
      var bar = mk("div", "opt"), save = mk("button", "btn", tr("menu.prof.save")), del = mk("button", "btn", tr("menu.prof.delete")), add = mk("button", "btn", tr("menu.prof.new"));
      sel.onchange = function () { if (sel.value) { op("profile.load", sel.value); name.value = sel.value; } };
      save.onclick = function () { if (name.value.trim()) op("profile.save", name.value.trim()); };
      del.onclick = function () { if (sel.value) { op("profile.delete", sel.value); name.value = ""; } };
      add.onclick = function () { name.value = ""; sel.value = ""; name.focus(); };
      c.appendChild(row(tr("menu.prof.active"), sel, undefined, "tip.prof.active")); c.appendChild(row(tr("menu.prof.as"), name, undefined, "tip.prof.as"));
      tip(save, "tip.prof.save"); tip(add, "tip.prof.new"); tip(del, "tip.prof.delete");
      [save, add, del].forEach(function (b) { bar.appendChild(b); }); c.appendChild(bar);
      renders.push(function () {
        var pr = extra.profiles || { names: [], active: "" };
        if (document.activeElement === sel) return;
        var key = pr.names.join("|") + "#" + pr.active;
        if (sel._k !== key) { sel._k = key; sel.innerHTML = ""; var o0 = mk("option", null, pr.names.length ? "" : tr("menu.prof.none")); o0.value = ""; sel.appendChild(o0); pr.names.forEach(function (n) { var o = mk("option", null, n); o.value = n; sel.appendChild(o); }); sel.value = pr.active || ""; if (pr.active && document.activeElement !== name && !name.value) name.value = pr.active; }
      });
    },
    /** the one-button profile picker: choose the ship from the list, save the windows for it, or load / delete a saved profile */
    shipprof: function (p) {
      var c = mk("div", "pp"); p.appendChild(c);
      c.appendChild(mk("p", "note", tr("prof.note")));
      var ship = mk("select", "sel"), save = mk("button", "btn", tr("prof.save")), sv = mk("select", "sel"), del = mk("button", "btn", tr("menu.prof.delete"));
      var custom = document.createElement("input"); custom.className = "txt"; custom.placeholder = tr("prof.custom");
      var cs = mk("button", "btn sm", tr("menu.prof.save"));
      var o0 = mk("option", null, tr("prof.pick")); o0.value = ""; ship.appendChild(o0);
      if (invoke) invoke("ship_names_list").then(function (a) { a.forEach(function (n) { var o = mk("option", null, n); o.value = n; ship.appendChild(o); }); });
      save.onclick = function () { if (ship.value) { op("profile.save", ship.value); ship.value = ""; } };
      sv.onchange = function () { if (sv.value) op("profile.load", sv.value); };
      del.onclick = function () { if (sv.value) op("profile.delete", sv.value); };
      cs.onclick = function () { if (custom.value.trim()) { op("profile.save", custom.value.trim()); custom.value = ""; } };
      c.appendChild(row(tr("prof.ship"), ship, undefined, "tip.prof.ship")); tip(save, "tip.prof.saveship"); c.appendChild(save);
      c.appendChild(row(tr("menu.prof.active"), sv, undefined, "tip.prof.active")); tip(del, "tip.prof.delete"); c.appendChild(del);
      tip(custom, "tip.prof.custom"); tip(cs, "tip.prof.as"); var cr = mk("div", "opt"); cr.appendChild(custom); cr.appendChild(cs); c.appendChild(cr);
      renders.push(function () {
        var pr = extra.profiles || { names: [], active: "" };
        var lab = document.getElementById("profLabel"); if (lab) lab.textContent = pr.active ? tr("prof.btn") + ": " + pr.active : tr("prof.btn");
        if (document.activeElement === sv) return;
        var key = pr.names.join("|") + "#" + pr.active;
        if (sv._k !== key) { sv._k = key; sv.innerHTML = ""; var e0 = mk("option", null, pr.names.length ? "" : tr("menu.prof.none")); e0.value = ""; sv.appendChild(e0); pr.names.forEach(function (n) { var o = mk("option", null, n); o.value = n; sv.appendChild(o); }); sv.value = pr.active || ""; }
      });
    },
    /** ship order: your ships first in Targets by value */
    order: function (p, _x, inner) {
      var c = inner ? p : card("menu.ord.h", p), list = mk("div", "chips"), sel = mk("select", "sel");
      c.appendChild(mk("p", "note", tr("menu.ord.note"))); c.appendChild(list);
      c.appendChild(row(tr("menu.ord.add"), sel, undefined, "tip.ord.add"));
      var names = null;
      function sendOrder(a) { set("order", a); }
      sel.onchange = function () { if (sel.value && (S.order || []).length < 12 && (S.order || []).indexOf(sel.value) < 0) sendOrder((S.order || []).concat([sel.value])); sel.value = ""; };
      renders.push(function () {
        if (!names && invoke) { names = []; invoke("ship_names_list").then(function (a) { names = a; sel.innerHTML = ""; var o0 = mk("option", null, tr("menu.ord.pick")); o0.value = ""; sel.appendChild(o0); a.forEach(function (n) { var o = mk("option", null, n); o.value = n; sel.appendChild(o); }); }); }
        var key = (S.order || []).join("|"); if (list._k === key) return; list._k = key; list.innerHTML = "";
        (S.order || []).forEach(function (n, i) { var ch = mk("span", "chip2", (i + 1) + ". " + n), x = tip(mk("button", "x", "\u2715"), "tip.ord.remove"); x.onclick = function () { var a = (S.order || []).slice(); a.splice(i, 1); sendOrder(a); }; ch.appendChild(x); list.appendChild(ch); });
        if (!(S.order || []).length) list.appendChild(mk("span", "note", tr("menu.ord.none")));
      });
    },
    /** the Claims reset line */
    claims: function (p) {
      var c = card("menu.claims.h", p), st = mk("p", "note"), b = mk("button", "btn", tr("menu.claims.undo"));
      tip(b, "tip.claims.undo"); b.onclick = function () { op("claims.undo", {}); };
      c.appendChild(row(tr("menu.claims.bonds"), sw(function () { return S.claim_bonds !== false; }, function (n) { set("claim_bonds", n); }), tr("menu.claims.bonds.d"), "tip.claims.bonds"));
      c.appendChild(row(tr("menu.claims.note"), sw(function () { return S.claims_note !== false; }, function (n) { set("claims_note", n); }), tr("menu.claims.note.d"), "tip.claims.note"));
      c.appendChild(st); c.appendChild(b);
      renders.push(function () { var at = extra.claims_reset; st.textContent = at ? tr("menu.claims.at", { at: at }) : tr("menu.claims.none"); b.disabled = !at; });
    },
    /** how the windows look */
    look: function (p) {
      var c = card("menu.combat.look", p);
      c.appendChild(row(tr("menu.k.opacity"), rng("opacity", 40, 100, "%"), undefined, "tip.k.opacity"));
      c.appendChild(row(tr("menu.k.sizeauto"), sw(function () { return S.size_auto; }, function (n) { set("size_auto", n); }), undefined, "tip.k.sizeauto"));
      c.appendChild(row(tr("menu.k.size"), rng("size_pct", 50, 200, "%"), undefined, "tip.k.size"));
      c.appendChild(row(tr("menu.k.boot"), sw(function () { return S.boot; }, function (n) { set("boot", n); }), undefined, "tip.k.boot"));
    },
    /** Targets by value: what is in the list, in which order, and your ships */
    targets: function (p) {
      var c = card("tg.h", p);
      c.appendChild(mk("p", "note", tr("tg.note")));
      c.appendChild(row(tr("menu.k.rows"), rng("rows", 1, 20, ""), undefined, "tip.k.rows"));
      var sel = mk("select", "sel");
      [["v", tr("tg.sort.v")], ["s", tr("tg.sort.s")]].forEach(function (o) { var e = mk("option", null, o[1]); e.value = o[0]; sel.appendChild(e); });
      sel.onchange = function () { set("sort", sel.value); };
      renders.push(function () { if (S.sort && document.activeElement !== sel) sel.value = S.sort; });
      c.appendChild(row(tr("tg.sort"), sel, undefined, "tip.tg.sort"));
      c.appendChild(row(tr("menu.k.gone"), sw(function () { return S.show_gone; }, function (n) { set("show_gone", n); }), undefined, "tip.k.gone"));
      c.appendChild(mk("h3", "sub2", tr("tg.ships")));
      SEC.order(c, null, true);
    },
    /** the wing bonus */
    wing: function (p) {
      var c = card("beh.wing.h", p);
      c.appendChild(mk("p", "note", tr("beh.wing.note")));
      c.appendChild(row(tr("menu.k.wing"), sw(function () { return S.wing_bonus_on; }, function (n) { set("wing_bonus_on", n); }), undefined, "tip.k.wing"));
      c.appendChild(row(tr("menu.k.wingop"), sw(function () { return S.wing_bonus_op; }, function (n) { set("wing_bonus_op", n); }), undefined, "tip.k.wingop"));
    },
    /** how the windows behave */
    behave: function (p) {
      var c = card("beh.h", p);
      c.appendChild(row(tr("menu.k.feedrows"), rng("feed_rows", 1, 10, ""), tr("menu.k.feedrows.d"), "tip.k.feedrows"));
      c.appendChild(row(tr("menu.k.brief"), sw(function () { return S.brief; }, function (n) { set("brief", n); }), tr("menu.k.brief.d"), "tip.k.brief"));
      c.appendChild(row(tr("menu.k.calm"), rng("calm_s", 3, 60, " s"), tr("menu.k.calm.d"), "tip.k.calm"));
      c.appendChild(row(tr("menu.k.report"), rng("report_s", 5, 600, " s"), undefined, "tip.k.report"));
      FLAGS.forEach(function (f) { c.appendChild(row(tr(f[1]), sw(function () { return S[f[0]]; }, function (n) { set(f[0], n); }), f[0] === "always" ? tr("menu.k.always.d") : undefined, "tip.k." + f[0])); });
      var lb = mk("select", "sel"); [["m3", "Mouse 3 (middle)"], ["m4", "Mouse 4"], ["m5", "Mouse 5"]].forEach(function (o) { var e = mk("option", null, o[1]); e.value = o[0]; lb.appendChild(e); });
      lb.onchange = function () { set("look_btn", lb.value); };
      renders.push(function () { if (S.look_btn && document.activeElement !== lb) lb.value = S.look_btn; });
      c.appendChild(row(tr("menu.k.lookbtn"), lb, tr("menu.k.lookbtn.d"), "tip.k.lookbtn"));
      c.appendChild(row(tr("menu.k.lookhold"), sw(function () { return S.look_hold; }, function (n) { set("look_hold", n); }), undefined, "tip.k.lookhold"));
      var li = mk("p", "note"); li.style.cssText = "font-size:11.5px;margin-top:10px"; c.appendChild(li);
      renders.push(function () { li.textContent = info.look || ""; });
    },
    /** tests: the test panel, made-up fights */
    tests: function (p) {
      var c = card("menu.tests", p);
      c.appendChild(row(tr("combat.preview"), sw(function () { return info.preview; }, function (n) { if (invoke) invoke("combat_preview", { on: n }); }), tr("combat.preview.desc"), "tip.preview"));
    },
    /** Past combats and Past Thargoid: one list builder (o.pre = the command family, "past" or "th") */
    past: function (p) { pastList(p, { pre: "past", h: "past.h", note: "past.note", none: "past.none", tip: "tip.past.list" }); },
    thpast: function (p) { pastList(p, { pre: "th", h: "th.past.h", note: "th.past.note", none: "th.past.none", tip: "tip.th.past.list" }); },
    /** the System map over the game (mapwin.rs): on or off, how big, where */
    mapov: function (p) {
      var c = card("map.ov.h", p), M = {};
      c.appendChild(mk("p", "note", tr("map.ov.note")));
      function put(k, v) { M[k] = v; if (invoke) invoke("map_set", { key: k, value: v }); }
      c.appendChild(row(tr("map.ov.on"), sw(function () { return !!(S.win && S.win.sysmap && S.win.sysmap.on); }, function (n) { set("win.sysmap.on", n); }), undefined, "tip.map.on"));
      [["w", "map.ov.w", 300, 1100, "tip.map.w"], ["h", "map.ov.hh", 160, 800, "tip.map.hh"]].forEach(function (r) {
        var d = mk("div", "rng"), i = document.createElement("input"), b = mk("b");
        i.type = "range"; i.min = r[2]; i.max = r[3];
        var tm = 0;
        i.oninput = function () { b.textContent = i.value; if (!tm) tm = setTimeout(function () { tm = 0; put(r[0], parseInt(i.value, 10)); }, 90); }; // (the card follows the slider while it moves)
        i.onchange = function () { clearTimeout(tm); tm = 0; put(r[0], parseInt(i.value, 10)); };
        i.setAttribute("aria-label", tr(r[1])); tip(i, r[4]); d.appendChild(i); d.appendChild(b); c.appendChild(row(tr(r[1]), d, undefined, r[4]));
        renders.push(function () { if (document.activeElement !== i && M[r[0]] != null) { i.value = M[r[0]]; b.textContent = Math.round(M[r[0]]); } });
      });
      renders.push(function () { if (invoke) invoke("map_get").then(function (m) { if (m && !(c.contains(document.activeElement) && document.activeElement.type === "range")) M = m; }).catch(function () {}); });
    },
    /** the GRAVITAS MAP: the main button of the Map page and of the menu's Map tab */
    mapopen: function (p) {
      var c = card(null, p), l = mk("div", "hd-l"), h = mk("div", "hdrow");
      l.appendChild(mk("h2", null, tr("map.open.h"))); l.appendChild(mk("p", "note", tr("map.open.note")));
      var b = tip(mk("button", "btn go map", tr("map.open.btn")), "tip.map.site"); b.onclick = function () { if (invoke) invoke("map_open_site", { mode: null }); };
      h.appendChild(l); h.appendChild(b); c.appendChild(h);
    },
    /** the same map also runs in a browser */
    mapsite: function (p) {
      var c = card(null, p), l = mk("div", "hd-l"), h = mk("div", "hdrow");
      l.appendChild(mk("h2", null, tr("map.site.h"))); l.appendChild(mk("p", "note", tr("map.site.note")));
      var a = mk("a", "btn", "gravitasmap.com"); a.href = "https://gravitasmap.com"; a.setAttribute("data-ext", ""); tip(a, "tip.map.link");
      h.appendChild(l); h.appendChild(a); c.appendChild(h);
    },
    /** Visits: the retrospective travel map (visits*.js builds it, the Rust side sends the stops with visits_get) */
    visits: function (p) { if (window.GVV) GVV.mount(p, window.GVC.h); },
    /** the Debrief page: its mode switch and the one for its observations */
    dbmode: function (p) {
      var c = card("db.mode.h", p);
      c.appendChild(mk("p", "note", tr("db.privacy")));
      c.appendChild(row(tr("db.mode.on"), sw(function () { return !!info.debrief; }, function (n) { if (invoke) invoke("mode_set", { name: "debrief", on: n }); }), tr("db.mode.on.d"), "tip.db.on"));
      c.appendChild(row(tr("db.rules.on"), sw(function () { return !!info.debrief_rules; }, function (n) { if (invoke) invoke("mode_set", { name: "debrief_rules", on: n }); }), tr("db.rules.on.d"), "tip.db.rules"));
    },
    dbwin: function (p) { SEC.windows(p, "db"); },
    /** which of the game's ship keys Debrief follows (from the Bindings file), and which it cannot */
    dbbinds: function (p) {
      var c = card("db.binds.h", p), box = mk("div", "note");
      c.appendChild(mk("p", "note", tr("db.binds.note"))); c.appendChild(box);
      function load() {
        if (!invoke) return;
        invoke("db_binds").then(function (b) {
          box.innerHTML = "";
          if (!b || !(b.followed || []).length) { box.textContent = tr("db.binds.none"); return; }
          var axn = function (k) { return { Bindings_MouseRoll: "roll", Bindings_MousePitch: "pitch", Bindings_MouseYaw: "yaw", Bindings_MousePitchInverted: "pitch" }[k]; };
          var ul = mk("div"); ul.style.cssText = "columns:2;column-gap:24px;font-size:12px;line-height:1.7";
          b.followed.forEach(function (x) { ul.appendChild(mk("div", null, x.key + "  \u2192  " + x.acts.join(" / "))); });
          if ((b.wheel.up || []).length) ul.appendChild(mk("div", null, tr("db.binds.wheelup") + "  \u2192  " + b.wheel.up.join(" / ")));
          if ((b.wheel.down || []).length) ul.appendChild(mk("div", null, tr("db.binds.wheeldown") + "  \u2192  " + b.wheel.down.join(" / ")));
          box.appendChild(ul);
          if (b.untracked.length) box.appendChild(mk("p", "note", tr("db.binds.untracked") + " " + b.untracked.map(function (x) { return x.key + " (" + x.acts.join(" / ") + ")"; }).join(", ")));
          if (b.elsewhere.length) box.appendChild(mk("p", "note", tr("db.binds.else") + " " + b.elsewhere.join(", ")));
          var m = b.mouse || {};
          box.appendChild(mk("p", "note", tr("db.binds.mouse", { x: tr("db.ax." + (axn(m.x) || "x")), y: tr("db.ax." + (axn(m.y) || "x")), decay: m.decay ? tr("db.binds.decay") : "" })));
        }).catch(function () {});
      }
      load(); setInterval(function () { if (c.offsetParent) load(); }, 6000);
    },
    /** Past debriefs: the list, and the graph of the one picked */
    dbpast: function (p) {
      var c = card("db.past.h", p);
      c.appendChild(mk("p", "note", tr("db.past.note")));
      var sel = mk("select", "sel"); sel.size = 8; sel.style.cssText = "width:100%;margin:8px 0"; c.appendChild(sel); tip(sel, "tip.db.past.list");
      var bar = mk("div", "opt"), b2 = mk("button", "btn", tr("past.show")), b5 = tip(mk("button", "btn", tr("past.fav")), "tip.past.fav"), b3 = mk("button", "btn", tr("past.del")), b4 = mk("button", "btn", tr("past.undo"));
      tip(b2, "tip.db.past.show"); tip(b3, "tip.past.del"); tip(b4, "tip.past.undo"); b4.hidden = true;
      [b2, b5, b3, b4].forEach(function (b) { bar.appendChild(b); }); c.appendChild(bar);
      var view = mk("div"); c.appendChild(view);
      var items = [], sig = null;
      function chosen() { var i = sel.selectedIndex; return i >= 0 ? items[i] : null; }
      function show() {
        var x = chosen(); [b2, b3, b5].forEach(function (b) { b.disabled = !x; });
        b5.textContent = tr(x && x.fav ? "past.unfav" : "past.fav"); tip(b5, x && x.fav ? "tip.past.unfav" : "tip.past.fav");
        view.innerHTML = "";
        if (!x) { view.appendChild(mk("p", "note", tr("db.past.none"))); return; }
        invoke("db_get", { t0: x.t0, lang: getLang() }).then(function (v) { view.innerHTML = ""; if (v && window.GVG) view.appendChild(GVG.draw(v, tr)); }).catch(function () {});
      }
      function fill(pick, keep) {
        if (!invoke) return;
        invoke("db_list", { lang: getLang() }).then(function (a) {
          items = a; sel.innerHTML = ""; sig = JSON.stringify(a.map(function (x) { return [x.t0, x.fav]; }));
          a.forEach(function (it, i) { var o2 = mk("option", null, (it.fav ? "\u2605 " : "") + (it.t0 ? new Date(it.t0).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "?") + "  " + it.line); o2.value = i; sel.appendChild(o2); });
          var at = Math.min(pick || 0, a.length - 1);
          if (keep != null) a.forEach(function (it, i) { if (it.t0 === keep) at = i; });
          if (a.length) sel.selectedIndex = at;
          show();
        }).catch(function () {});
      }
      sel.onchange = show;
      b2.onclick = function () { var x = chosen(); if (x) { invoke("db_show", { t0: x.t0 }); toast(tr("past.shown")); } };
      b5.onclick = function () { var x = chosen(); if (x) invoke("db_fav", { t0: x.t0, on: !x.fav }).then(function () { fill(0, x.t0); }); };
      b3.onclick = function () { var x = chosen(), i = sel.selectedIndex; if (!x) return; invoke("db_delete", { t0: x.t0 }).then(function () { fill(i); b4.hidden = false; setTimeout(function () { b4.hidden = true; }, 8000); }); };
      b4.onclick = function () { invoke("db_undo").then(function () { b4.hidden = true; fill(0); }); };
      fill(0);
      setInterval(function () {
        if (!invoke || !c.offsetParent) return;
        invoke("db_list", { lang: getLang() }).then(function (a) {
          if (JSON.stringify(a.map(function (x) { return [x.t0, x.fav]; })) !== sig) { var x = chosen(); fill(sel.selectedIndex, x ? x.t0 : null); }
        }).catch(function () {});
      }, 3000);
    },
    /** the PVP page: the mode switch, the two options, where the files are */
    pvpmode: function (p) {
      var c = card("pvp.mode.h", p);
      c.appendChild(mk("p", "note", tr("pvp.privacy")));
      c.appendChild(row(tr("pvp.on"), sw(function () { return !!info.pvp; }, function (n) { if (invoke) invoke("mode_set", { name: "pvp", on: n }); }), tr("pvp.on.d"), "tip.pvp.on"));
      c.appendChild(row(tr("pvp.shield"), sw(function () { return !!info.pvp_shield; }, function (n) { if (invoke) invoke("mode_set", { name: "pvp_shield", on: n }); }), tr("pvp.shield.d"), "tip.pvp.shield"));
      c.appendChild(row(tr("pvp.build"), sw(function () { return info.pvp_build !== false; }, function (n) { if (invoke) invoke("mode_set", { name: "pvp_build", on: n }); }), tr("pvp.build.d"), "tip.pvp.build"));
      var b = tip(mk("button", "btn", tr("pvp.folder")), "tip.pvp.folder"); b.onclick = function () { if (invoke) invoke("pvp_folder"); };
      c.appendChild(b); c.appendChild(mk("p", "note", tr("pvp.where")));
    },
    pvpwin: function (p) { SEC.windows(p, "pvp"); },
    /** the PVP fights kept as files: the list, and the graph of the one picked */
    pvpfights: function (p) {
      var c = card("pvp.list.h", p);
      c.appendChild(mk("p", "note", tr("pvp.list.note")));
      var sel = mk("select", "sel"); sel.size = 8; sel.style.cssText = "width:100%;margin:8px 0"; c.appendChild(sel); tip(sel, "tip.pvp.list");
      c.appendChild(mk("p", "note", tr("pvp.next")));
      var view = mk("div"); c.appendChild(view);
      var items = [], sig = null;
      function chosen() { var i = sel.selectedIndex; return i >= 0 ? items[i] : null; }
      function show() {
        var x = chosen(); view.innerHTML = "";
        if (!x) { view.appendChild(mk("p", "note", tr("pvp.list.none"))); return; }
        invoke("pvp_get", { name: x.name, lang: getLang() }).then(function (v) { view.innerHTML = ""; if (v && window.GVG) view.appendChild(GVG.draw(v, tr)); }).catch(function () {});
      }
      function fill(keep) {
        if (!invoke) return;
        invoke("pvp_list").then(function (a) {
          items = a; sel.innerHTML = ""; sig = JSON.stringify(a.map(function (x) { return x.name; }));
          a.forEach(function (it, i) {
            var o2 = mk("option", null, (it.t0 ? new Date(it.t0).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "?") + "  \u00b7  " + tr("pvp.vs", { opp: it.opp }) + "  #" + it.no + "  \u00b7  " + tr("pvp.res." + (it.result || "unknown")) + "  \u00b7  " + Math.floor((it.len || 0) / 60) + ":" + String(Math.round(it.len || 0) % 60).padStart(2, "0"));
            o2.value = i; sel.appendChild(o2);
          });
          var at = 0; if (keep) a.forEach(function (it, i) { if (it.name === keep) at = i; });
          if (a.length) sel.selectedIndex = at;
          show();
        }).catch(function () {});
      }
      sel.onchange = show;
      fill();
      setInterval(function () {
        if (!invoke || !c.offsetParent) return;
        invoke("pvp_list").then(function (a) { if (JSON.stringify(a.map(function (x) { return x.name; })) !== sig) { var x = chosen(); fill(x ? x.name : null); } }).catch(function () {});
      }, 3000);
    },
    /** PVP: your fight files and the other commander's, matched by who fought whom and when, put on one clock and read together */
    pvpcompare: function (p) {
      var c = card("pvp.cmp.h", p);
      c.appendChild(mk("p", "note", tr("pvp.cmp.note")));
      var mine = [], theirs = [], pairs = null, nudge = 0, shown = null;
      function pick(multi, cb) {
        var i = document.createElement("input"); i.type = "file"; i.multiple = !!multi; i.accept = ".gravitas,.json,application/json";
        i.onchange = function () {
          var fs = Array.prototype.slice.call(i.files || []).filter(function (f) { return f.size <= 4000000; });
          Promise.all(fs.map(function (f) { return f.text().then(function (t) { return { name: f.name, text: t }; }); })).then(cb);
        };
        i.click();
      }
      var box = mk("div", "pvp-cmp"); box.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:10px 0";
      function col(titleKey, list, extra) {
        var d = mk("div"); d.appendChild(mk("h3", null, tr(titleKey))); d.style.cssText = "font-size:12.5px";
        var bar = mk("div", "opt"); extra.forEach(function (b) { bar.appendChild(b); }); d.appendChild(bar);
        var ul = mk("div", "note"); d.appendChild(ul); d._ul = ul; return d;
      }
      var bMine = tip(mk("button", "btn", tr("pvp.cmp.mine")), "tip.pvp.cmp.mine"), bMineF = tip(mk("button", "btn", tr("pvp.cmp.files")), "tip.pvp.cmp.files");
      var bThe = tip(mk("button", "btn", tr("pvp.cmp.files")), "tip.pvp.cmp.files"), bClear = tip(mk("button", "btn", tr("pvp.cmp.clear")), "tip.pvp.cmp.clear");
      var cMine = col("pvp.cmp.you", mine, [bMine, bMineF]), cThe = col("pvp.cmp.them", theirs, [bThe, bClear]);
      box.appendChild(cMine); box.appendChild(cThe); c.appendChild(box);
      var sel = mk("select", "sel"); sel.size = 4; sel.style.cssText = "width:100%;margin:8px 0"; tip(sel, "tip.pvp.cmp.list"); c.appendChild(sel);
      var info = mk("p", "note"); c.appendChild(info);
      var nud = mk("div", "rng"), ni = document.createElement("input"), nb = mk("b"); ni.type = "range"; ni.min = -30; ni.max = 30; ni.step = 0.5; ni.value = 0; nb.textContent = "0 s";
      nud.appendChild(ni); nud.appendChild(nb); var nrow = row(tr("pvp.cmp.nudge"), nud, tr("pvp.cmp.nudge.d"), "tip.pvp.cmp.nudge"); c.appendChild(nrow); nrow.hidden = true;
      var view = mk("div"); c.appendChild(view);
      function names(list, ul) { ul.textContent = list.length ? list.map(function (x) { return x.name; }).join(", ") : tr("pvp.cmp.none"); }
      function render() {
        names(mine, cMine._ul); names(theirs, cThe._ul);
        sel.innerHTML = ""; sel.hidden = true; view.innerHTML = ""; info.textContent = ""; nrow.hidden = true; pairs = null; shown = null;
        if (!mine.length || !theirs.length || !invoke) return;
        invoke("pvp_pairs", { mine: mine.map(function (x) { return x.text; }), theirs: theirs.map(function (x) { return x.text; }) }).then(function (r) {
          pairs = r;
          var bad = r.mine.concat(r.theirs).filter(function (x) { return !x; }).length;
          r.pairs.forEach(function (p, i) {
            var a = r.mine[p.ai], b = r.theirs[p.bi];
            var o = mk("option", null, tr("pvp.vs", { opp: a.opp }) + "  \u00b7  #" + a.no + " \u2194 #" + b.no + "  \u00b7  " + tr("pvp.res." + (a.result || "unknown")) + "  \u00b7  " + tr("pvp.sync." + p.kind + ".s") + "  \u00b7  " + Math.floor(p.overlap / 60) + ":" + String(Math.round(p.overlap) % 60).padStart(2, "0"));
            o.value = i; sel.appendChild(o);
          });
          info.textContent = (r.pairs.length ? "" : tr("pvp.cmp.nopair")) + (bad ? " " + tr("pvp.cmp.bad", { n: bad }) : "");
          if (r.pairs.length) { sel.hidden = false; sel.selectedIndex = 0; open(); }
        }).catch(function () {});
      }
      function open() {
        var i = sel.selectedIndex; if (i < 0 || !pairs) return;
        var p = pairs.pairs[i]; shown = p;
        invoke("pvp_pair_get", { a: mine[p.ai].text, b: theirs[p.bi].text, nudge: nudge, lang: getLang() }).then(function (v) {
          view.innerHTML = ""; if (!v) return;
          nrow.hidden = false;
          info.textContent = tr("pvp.sync." + v.sync.kind, { s: Math.abs(v.sync.off).toFixed(1) }) + (nudge ? "  " + tr("pvp.cmp.moved", { s: nudge }) : "");
          if (window.GVP) view.appendChild(GVP.draw(v, tr));
        }).catch(function () {});
      }
      sel.onchange = function () { nudge = 0; ni.value = 0; nb.textContent = "0 s"; open(); };
      var tm = 0;
      ni.oninput = function () { nb.textContent = ni.value + " s"; clearTimeout(tm); tm = setTimeout(function () { nudge = parseFloat(ni.value); open(); }, 160); };
      bMineF.onclick = function () { pick(true, function (a) { mine = mine.concat(a).slice(0, 40); render(); }); };
      bThe.onclick = function () { pick(true, function (a) { theirs = theirs.concat(a).slice(0, 40); render(); }); };
      bMine.onclick = function () {
        if (!invoke) return;
        invoke("pvp_list").then(function (l) { return Promise.all(l.map(function (x) { return invoke("pvp_text", { name: x.name }).then(function (t) { return t ? { name: x.name, text: t } : null; }); })); }).then(function (a) {
          mine = a.filter(function (x) { return x; }); render();
        }).catch(function () {});
      };
      bClear.onclick = function () { mine = []; theirs = []; nudge = 0; ni.value = 0; render(); };
      render();
    },
    /** the Thargoid page's windows (same blocks as the Combat windows, only its own three) */
    thwin: function (p) { SEC.windows(p, "th"); },
    /** a planned mode */
    /** the Thargoid page: what is recorded for now (the mode itself is being built) */
    threc: function (p) {
      var c = card("menu.th.h", p);
      c.appendChild(mk("p", "note", tr("menu.th.rec")));
      c.appendChild(mk("p", "note", tr("menu.th.path")));
    },
    soon: function (p, key) { var c = card(null, p); c.appendChild(mk("h2", null, tr(key || "menu.soon"))); c.appendChild(mk("p", "note", tr("menu.mode.soon.d"))); }
  };

  var lastPoll = 0;
  function poll() {
    if (!invoke || document.visibilityState === "hidden") return;
    // a page nobody is working in (another program has the focus, the game for example) looks at the app only every 3 s instead of twice a second
    var now = Date.now();
    if (!document.hasFocus() && now - lastPoll < 3000) return;
    lastPoll = now;
    Promise.all([invoke("combat_info"), invoke("combat_settings"), invoke("overlay_info"), invoke("combat_extra")]).then(function (r) {
      info = r[0] || {}; S = r[1] || {}; ov = r[2] || {}; extra = r[3] || {}; renders.forEach(function (f) { f(); });
    }).catch(function () {});
  }

  window.GVC = {
    tip: function (el, k) { return tip(el, k); },
    /** t: the page's translate function, lang: () => code, toast */
    init: function (o) { tr = o.t; getLang = o.lang; if (o.toast) toast = o.toast; },
    /** fills `el` with the named sections (each is a card); the same call in the window and in the menu */
    mount: function (el, names) {
      names.forEach(function (n) { var s = typeof n === "string" ? n : n[0]; if (SEC[s]) SEC[s](el, typeof n === "string" ? undefined : n[1]); });
      if (!timer) { timer = setInterval(poll, 500); }
      poll();
    },
    /** the page was translated again: the controls are built again by the caller */
    reset: function () { renders = []; },
    /** what keybind.js needs to build its cards the same way */
    h: { lang: function () { return getLang(); }, toast: function (m) { toast(m); }, mk: mk, card: card, row: row, tip: tip, sw: sw, op: op, set: set, tr: function (k, v) { return tr(k, v); }, invoke: function (n, a) { return invoke ? invoke(n, a) : Promise.reject(); }, S: function () { return S; } },
    /** another file adds a section */
    add: function (name, fn) { SEC[name] = fn; },
    poll: poll,
    info: function () { return info; }
  };
})();
