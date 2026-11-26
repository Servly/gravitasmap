"use strict";
// The "press a key" window of the Key Bindings: shows "Press the key you want to use", reads the REAL key press
// (the modifiers held and one key) and hands the text back ("Ctrl+Shift+Num7"). It stores nothing itself.
// Used by keybind.js for every job in the app window and in the menu over the game.
(function () {
  var open = null;

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
  function mods(e) {
    var a = [];
    if (e.ctrlKey) a.push("Ctrl");
    if (e.shiftKey) a.push("Shift");
    if (e.altKey) a.push("Alt");
    if (e.metaKey) a.push("Win");
    return a;
  }

  /** Opens the window. o = { name: "what the key is for", done(text), cancel() }. Returns { close() }. */
  function capture(o) {
    if (open) open.close(true);
    var tr = GVC.h.tr, mk = GVC.h.mk;
    var ov = mk("div", "kbcap"), box = mk("div", "kbcap-box"), live = mk("div", "kbcap-live", tr("kb.cap.wait")), err = mk("p", "kbcap-err"), cancel = mk("button", "btn sm", tr("kb.cap.cancel"));
    ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true");
    box.appendChild(mk("div", "kbcap-h", tr("kb.cap.title")));
    if (o.name) box.appendChild(mk("div", "kbcap-for", o.name));
    box.appendChild(live);
    box.appendChild(mk("p", "kbcap-hint", tr("kb.cap.hint")));
    err.hidden = true; box.appendChild(err); box.appendChild(cancel); ov.appendChild(box);
    GVC.h.tip(cancel, "tip.kb.cancel");
    var finished = false, timer = 0;
    function show(list) { live.textContent = list.length ? list.join(" + ") + " + ..." : tr("kb.cap.wait"); live.classList.toggle("on", list.length > 0); }
    function close(silent) {
      if (finished) return; finished = true;
      window.removeEventListener("keydown", kd, true); window.removeEventListener("keyup", ku, true);
      clearTimeout(timer); ov.remove(); if (open === api) open = null;
      if (!silent && o.cancel) o.cancel();
    }
    function kd(e) {
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Escape" && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) { close(false); return; }
      if (e.key === "Control" || e.key === "Shift" || e.key === "Alt" || e.key === "Meta") { show(mods(e)); err.hidden = true; return; }
      var k = codeKey(e), m = mods(e);
      if (!k) { err.textContent = tr("kb.need.key"); err.hidden = false; return; }
      if (!m.length) { err.textContent = tr("kb.need"); err.hidden = false; return; }
      if (m.length > 2) { err.textContent = tr("kb.max"); err.hidden = false; return; }
      var text = m.concat([k]).join("+");
      finished = true; window.removeEventListener("keydown", kd, true); window.removeEventListener("keyup", ku, true);
      clearTimeout(timer); ov.remove(); if (open === api) open = null;
      o.done(text);
    }
    function ku(e) { e.preventDefault(); show(mods(e)); }
    window.addEventListener("keydown", kd, true); window.addEventListener("keyup", ku, true);
    cancel.onclick = function () { close(false); };
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(false); });
    timer = setTimeout(function () { close(false); }, 30000); // (never waits for ever)
    document.body.appendChild(ov);
    var api = { close: close }; open = api;
    return api;
  }
  window.GVCapture = capture;
})();
