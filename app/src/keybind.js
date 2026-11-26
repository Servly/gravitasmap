"use strict";
// Key Bindings: every shortcut of GRAVITAS in one place, in the app's window and in the menu over the game.
// Each job offers its default (and, for the menu, an alternative), a Custom choice built from two modifiers and one key, and None.
(function () {
  var H = function () { return GVC.h; };
  var MODS = [["", "kb.nomod"], ["Ctrl", "Ctrl"], ["Shift", "Shift"], ["Alt", "Alt"], ["Win", "Windows"]];
  // the plugin's own keys (the default choice of each combat job)
  var PLUGIN = { flip: "Ctrl+Shift+F7", report: "Ctrl+Shift+F8", reset: "Ctrl+Shift+F9", clear: "Ctrl+Shift+F10", hide: "Ctrl+Shift+F11", claims: "Ctrl+Shift+F12",
    // (not the plugin's: the next free one in its row, offered like the others, bound only when chosen; the game's own use of it is shown by the conflict note)
    report_clear: "Ctrl+Shift+F6" };
  var DEFAULTS = { menu: "Ctrl+Shift+K", app: "", map_up: "Ctrl+Shift+Num8", map_left: "Ctrl+Shift+Num4", map_down: "Ctrl+Shift+Num5", map_right: "Ctrl+Shift+Num6", map_zin: "Ctrl+Shift+NumAdd", map_zout: "Ctrl+Shift+NumSub", map_fit: "Ctrl+Shift+Num0", map_show: "", map_site: "" };
  var ALTS = {};
  var current = {};

  function split(text) {
    var m = ["", ""], key = "";
    (text || "").split("+").forEach(function (p) {
      p = p.trim(); var l = p.toLowerCase();
      var hit = l === "ctrl" || l === "control" ? "Ctrl" : l === "shift" ? "Shift" : l === "alt" ? "Alt" : (l === "win" || l === "windows" || l === "meta" || l === "super") ? "Win" : "";
      if (hit) { if (!m[0]) m[0] = hit; else if (!m[1]) m[1] = hit; } else key = p;
    });
    return { m1: m[0], m2: m[1], key: key };
  }

  function control(job, hostRow) {
    var h = H(), tr = h.tr, mk = h.mk;
    var def = job in PLUGIN ? PLUGIN[job] : DEFAULTS[job] || "", alt = ALTS[job] || "";
    var sel = mk("select", "sel"), customOpt = null, shown = "none", nowText = "";
    function build() {
      sel.innerHTML = "";
      var opts = [["none", tr("kb.p.none")]];
      if (def) opts.push(["def", tr("kb.p.def", { k: def })]);
      if (alt) opts.push(["alt", tr("kb.p.alt", { k: alt })]);
      var isCustom = nowText && nowText !== def && nowText !== alt;
      opts.push(["custom", isCustom ? tr("kb.p.customnow", { k: nowText }) : tr("kb.p.custom")]);
      opts.forEach(function (o) { var e = mk("option", null, o[1]); e.value = o[0]; sel.appendChild(e); if (o[0] === "custom") customOpt = e; });
    }
    build();
    h.tip(sel, "tip.kb.job");
    // Custom: a small window asks for the key press (the modifiers held and one key) and applies it at once
    var change = h.tip(mk("button", "btn sm", tr("kb.change")), "tip.kb.change"); change.hidden = true;
    function send(text) { h.op("hotkey", { job: job, text: text }); current[job] = text; nowText = text; }
    function ask() {
      wrap._open = true;
      try { h.invoke("hotkeys_capture", { on: true }); } catch (e) {}
      var done = function () { wrap._open = false; try { h.invoke("hotkeys_capture", { on: false }); } catch (e) {} };
      window.GVCapture({
        name: tr("menu.act." + job),
        done: function (t) { done(); send(t); build(); sel.value = "custom"; shown = "custom"; change.hidden = false; hostRow.dataset.saved = "1"; },
        cancel: function () { done(); sel.value = shown; }
      });
    }
    sel.onchange = function () {
      if (sel.value === "custom") { ask(); return; }
      shown = sel.value; change.hidden = true;
      if (sel.value === "none") send(""); else if (sel.value === "def") send(def); else if (sel.value === "alt") send(alt);
      build(); sel.value = shown;
    };
    change.onclick = ask;
    function show(textNow) {
      if (wrap._open) return; // (the "press a key" window is open: the 2.5 s refresh must not change anything under it)
      var t = textNow || "";
      nowText = t;
      if (!t) shown = "none"; else if (t === def) shown = "def"; else if (t === alt) shown = "alt"; else shown = "custom";
      build(); sel.value = shown; change.hidden = shown !== "custom";
    }
    var wrap = mk("div", "kbctl"); wrap._open = false;
    var line = mk("div", "kbline"); line.appendChild(sel); line.appendChild(change);
    wrap.appendChild(line);
    wrap._show = show;
    return wrap;
  }

  function section(jobs, titleKey, extra) {
    return function (p) {
      var h = H(), tr = h.tr, mk = h.mk, c = h.card(titleKey, p);
      c.appendChild(mk("p", "note", tr("menu.keys.note")));
      if (extra) c.appendChild(h.row(tr("menu.keys.on"), h.sw(function () { return h.S().keys; }, function (n) { h.set("keys", n); }), undefined, "tip.kb.on"));
      var rows = {};
      jobs.forEach(function (job) {
        var r = h.tip(mk("div", "opt"), "tip.kb.job"), l = mk("div"); l.appendChild(mk("div", null, tr("menu.act." + job))); r.appendChild(l);
        var ctl = control(job, r); r.appendChild(ctl); c.appendChild(r); rows[job] = { r: r, l: l, ctl: ctl };
      });
      c.appendChild(mk("p", "note", tr("kb.note")));
      // what each key is now (and the game's own use of it)
      var loaded = false;
      function load() {
        h.invoke("hotkeys_get").then(function (a) {
          (a || []).forEach(function (k) { current[k[0]] = k[1]; if (rows[k[0]]) rows[k[0]].ctl._show(k[1]); });
          h.invoke("hotkey_conflicts").then(function (cf) {
            cf = cf || {};
            jobs.forEach(function (job) {
              var old = rows[job].l.querySelector(".warn"); if (old) old.remove();
              if (cf[job]) rows[job].l.appendChild(mk("small", "warn", tr("menu.keys.conflict", { what: cf[job] })));
            });
          }).catch(function () {});
        }).catch(function () {});
      }
      load(); setInterval(function () { if (document.visibilityState !== "hidden" && !c.contains(document.activeElement)) load(); }, 2500);
      loaded = true;
    };
  }

  GVC.add("kbmain", section(["menu", "app"], "kb.main.h", true));
  GVC.add("kbcombat", section(["reset", "clear", "report", "report_clear", "hide", "claims", "claims_restore", "claims_show", "flip"], "kb.combat.h", false));
  GVC.add("kbmap", section(["map_up", "map_left", "map_down", "map_right", "map_zin", "map_zout", "map_fit", "map_show", "map_site"], "kb.map.h", false));
  GVC.add("kbsoon", function (p) { var h = H(), c = h.card(null, p); c.appendChild(h.mk("p", "note", h.tr("kb.soon"))); });
})();
