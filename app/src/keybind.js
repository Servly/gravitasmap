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
    var opts = [["none", tr("kb.p.none")]];
    if (def) opts.push(["def", tr("kb.p.def", { k: def })]);
    if (alt) opts.push(["alt", tr("kb.p.alt", { k: alt })]);
    opts.push(["custom", tr("kb.p.custom")]);
    var sel = mk("select", "sel");
    opts.forEach(function (o) { var e = mk("option", null, o[1]); e.value = o[0]; sel.appendChild(e); });
    h.tip(sel, "tip.kb.job"); var box = mk("div", "kbcustom"); box.hidden = true;
    function modSel() { var s = h.tip(mk("select", "sel sm"), "tip.kb.mod"); MODS.forEach(function (m) { var e = mk("option", null, m[1].indexOf("kb.") === 0 ? tr(m[1]) : m[1]); e.value = m[0]; s.appendChild(e); }); return s; }
    var m1 = modSel(), m2 = modSel(), key = document.createElement("input"); key.className = "txt key"; key.maxLength = 6; key.placeholder = tr("kb.key"); h.tip(key, "tip.kb.key");
    var ap = h.tip(mk("button", "btn sm", tr("kb.apply")), "tip.kb.apply"), err = mk("small", "warn"); err.hidden = true;
    box.appendChild(m1); box.appendChild(m2); box.appendChild(key); box.appendChild(ap);
    function send(text) { h.op("hotkey", { job: job, text: text }); current[job] = text; }
    function text() {
      var k = key.value.trim(); if (!k) return "";
      var nm = /^num(\d|add|sub)$/i.exec(k);
      if (nm) k = "Num" + (/^\d$/.test(nm[1]) ? nm[1] : nm[1][0].toUpperCase() + nm[1].slice(1).toLowerCase()); else if (/^f\d{1,2}$/i.test(k)) k = k.toUpperCase(); else k = k.slice(0, 1).toUpperCase();
      var parts = []; [m1.value, m2.value].forEach(function (m) { if (m && parts.indexOf(m) < 0) parts.push(m); });
      parts.push(k); return parts.join("+");
    }
    // press the keys instead of typing them: the modifiers and the key are read from the real key press and applied at once
    function codeKey(e) {
      var c = e.code || "", m;
      if ((m = /^F(\d{1,2})$/.exec(c))) return "F" + m[1];
      if ((m = /^Numpad(\d)$/.exec(c))) return "Num" + m[1];
      if (c === "NumpadAdd") return "NumAdd";
      if (c === "NumpadSubtract") return "NumSub";
      if ((m = /^Key([A-Z])$/.exec(c))) return m[1];
      if ((m = /^Digit(\d)$/.exec(c))) return m[1];
      return "";
    }
    key.onkeydown = function (e) {
      if (e.key === "Tab") return;
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Control" || e.key === "Shift" || e.key === "Alt" || e.key === "Meta") return;
      var k = codeKey(e);
      if (!k) { err.textContent = tr("kb.need"); err.hidden = false; return; }
      var mods = []; if (e.ctrlKey) mods.push("Ctrl"); if (e.shiftKey) mods.push("Shift"); if (e.altKey) mods.push("Alt"); if (e.metaKey) mods.push("Win");
      m1.value = mods[0] || ""; m2.value = mods[1] || ""; key.value = k;
      ap.onclick();
    };
    sel.onchange = function () {
      wrap._open = sel.value === "custom";
      box.hidden = sel.value !== "custom";
      if (sel.value === "none") send(""); else if (sel.value === "def") send(def); else if (sel.value === "alt") send(alt);
    };
    ap.onclick = function () {
      var t = text();
      if (!t || !/\+/.test(t)) { err.textContent = tr("kb.need"); err.hidden = false; return; }
      err.hidden = true; send(t); hostRow.dataset.saved = "1"; wrap._open = false;
    };
    function show(textNow) {
      if (wrap._open) return; // (Custom was just chosen and not applied yet: the 2.5 s refresh must not take the box away)
      var t = textNow || "";
      if (!t) sel.value = "none"; else if (t === def) sel.value = "def"; else if (t === alt) sel.value = "alt"; else {
        sel.value = "custom"; var p = split(t); m1.value = p.m1; m2.value = p.m2; key.value = p.key;
      }
      box.hidden = sel.value !== "custom";
    }
    var wrap = mk("div", "kbctl"); wrap._open = false; wrap.appendChild(sel); wrap.appendChild(box); wrap.appendChild(err);
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
  GVC.add("kbcombat", section(["reset", "clear", "report", "report_clear", "hide", "claims", "flip"], "kb.combat.h", false));
  GVC.add("kbmap", section(["map_up", "map_left", "map_down", "map_right", "map_zin", "map_zout", "map_fit", "map_show", "map_site"], "kb.map.h", false));
  GVC.add("kbsoon", function (p) { var h = H(), c = h.card(null, p); c.appendChild(h.mk("p", "note", h.tr("kb.soon"))); });
})();
