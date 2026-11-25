/* Settings page extras: start with Windows, tray behaviour, where the data lives, the settings file (export and import).
   Built with the same helpers as the other pages (combatui.js GVC.h). The Rust side is appprefs.rs; nothing here runs unless the player presses something. */
(function () {
  "use strict";
  var H = function () { return GVC.h; };

  function build(p) {
    var h = H(), mk = h.mk, tr = h.tr, tip = h.tip, inv = h.invoke;
    var state = null, swEls = {};
    function msg(box, text, bad) { box.textContent = text || ""; box.className = "note prefx-msg" + (bad ? " bad" : ""); }

    function mkSwitch(key, on, send) {
      var b = mk("button", "sw"); b.type = "button"; b.setAttribute("role", "switch"); b.setAttribute("aria-checked", on ? "true" : "false");
      b.onclick = function () { var n = b.getAttribute("aria-checked") !== "true"; send(n, function (ok) { b.setAttribute("aria-checked", ok ? String(n) : String(!n)); }); };
      swEls[key] = b; return b;
    }

    /* ---- starting and closing ---- */
    var c1 = h.card("prefs.x.start.h", p), st = mk("p", "note prefx-msg");
    var rows = mk("div"); c1.appendChild(rows); c1.appendChild(st);

    /* ---- where the data is ---- */
    var c2 = h.card("prefs.data.h", p); c2.appendChild(mk("p", "note", tr("prefs.data.note")));
    var dataRows = mk("div"); c2.appendChild(dataRows);

    /* ---- the settings file ---- */
    var c3 = h.card("prefs.xfer.h", p); c3.appendChild(mk("p", "note", tr("prefs.xfer.note")));
    var bar = mk("div", "opt prefx-bar"), xm = mk("p", "note prefx-msg");
    var bExp = tip(mk("button", "btn", tr("prefs.xfer.export")), "tip.prefs.export"); bExp.type = "button";
    var bImp = tip(mk("button", "btn", tr("prefs.xfer.import")), "tip.prefs.import"); bImp.type = "button";
    var file = mk("input"); file.type = "file"; file.accept = ".json,application/json"; file.hidden = true;
    bExp.onclick = function () {
      inv("settings_export").then(function (path) { msg(xm, tr("prefs.xfer.saved", { path: path })); }).catch(function () { msg(xm, tr("prefs.xfer.fail"), true); });
    };
    bImp.onclick = function () { file.click(); };
    file.onchange = function () {
      var f = file.files && file.files[0]; file.value = "";
      if (!f) return;
      if (f.size > 2 * 1024 * 1024) { msg(xm, tr("prefs.xfer.bad"), true); return; }
      f.text().then(function (text) { return inv("settings_import", { text: text }); })
        .then(function (n) { msg(xm, tr("prefs.xfer.loaded", { n: n })); })
        .catch(function () { msg(xm, tr("prefs.xfer.bad"), true); });
    };
    bar.appendChild(bExp); bar.appendChild(bImp); bar.appendChild(file); c3.appendChild(bar); c3.appendChild(xm);

    function show(s) {
      state = s; rows.innerHTML = ""; dataRows.innerHTML = "";
      if (s.autostart && s.autostart.supported) {
        rows.appendChild(h.row(tr("prefs.autostart"), mkSwitch("autostart", s.autostart.on, function (n, done) {
          inv("autostart_set", { on: n }).then(function (ok) { done(!!ok); msg(st, ok ? "" : tr("prefs.autostart.fail"), !ok); }).catch(function () { done(false); msg(st, tr("prefs.autostart.fail"), true); });
        }), tr("prefs.autostart.d"), "tip.prefs.autostart"));
      }
      [["minimize_to_tray", "prefs.mintray"], ["close_to_tray", "prefs.closetray"]].forEach(function (r) {
        rows.appendChild(h.row(tr(r[1]), mkSwitch(r[0], s[r[0]], function (n, done) {
          inv("tray_pref_set", { name: r[0], on: n }).then(function (ok) { done(!!ok); }).catch(function () { done(false); });
        }), tr(r[1] + ".d"), "tip." + r[1]));
      });
      [["data", "prefs.data.data"], ["backup", "prefs.data.backup"], ["journal", "prefs.data.journal"]].forEach(function (r) {
        var path = s.folders && s.folders[r[0]];
        if (!path && r[0] === "backup") return;   // (the Store build keeps no backup copy)
        var b = tip(mk("button", "btn", tr("prefs.data.open")), "tip.prefs.open"); b.type = "button";
        b.onclick = function () { inv("folder_open", { which: r[0] }).then(function (ok) { if (!ok) h.toast(tr("prefs.data.none")); }).catch(function () {}); };
        var small = mk("code", "prefx-path", path || tr("prefs.data.none"));
        var row = h.row(tr(r[1]), path ? b : null, null, null); row.firstChild.appendChild(small);
        dataRows.appendChild(row);
      });
    }
    if (inv) inv("prefs_get").then(show).catch(function () {});
  }

  GVC.add("prefsx", build);
})();
