"use strict";
/* Settings > Appearance: the theme cards and the colour picker. The maths and the saving are in themes.js (GVTH); this file only draws the card.
   English texts are the fallback when a language file has no key yet (the keys are theme.* and tip.theme.*). */
(function () {
  var FB = {
    "theme.h": "Appearance",
    "theme.note": "Choose the colours of the GRAVITAS window and of the menu over the game. The windows drawn over the game keep their own colours.",
    "theme.gravitas": "GRAVITAS", "theme.game": "Game orange", "theme.cold": "Cold blue", "theme.green": "Green", "theme.red": "Red alert", "theme.graphite": "Graphite",
    "theme.custom": "Your own colour", "theme.custom.d": "Pick any colour. The other tones follow it and the text stays easy to read.",
    "theme.reset": "Reset to default", "theme.adjusted": "Some tones were brightened so that the text stays easy to read.",
    "tip.theme.set": "Use the {name} colours in this window and in the menu.", "tip.theme.custom": "Pick a colour of your own. It changes at once and is saved when you let go.",
    "tip.theme.reset": "Go back to the GRAVITAS colours."
  };
  function build(p) {
    var h = GVC.h, mk = h.mk, tip = h.tip;
    function tr(k, v) { var s = h.tr(k, v); if (s !== k) return s; s = FB[k] || k; return v ? s.replace(/\{(\w+)\}/g, function (m, n) { return v[n] != null ? v[n] : m; }) : s; }
    function tipx(el, k, v) { el.title = tr(k, v); return el; }
    var TH = window.GVTH; if (!TH) return;
    var c = mk("div", "card"); c.appendChild(mk("h2", null, tr("theme.h"))); p.appendChild(c);
    c.appendChild(mk("p", "note", tr("theme.note")));
    var grid = mk("div", "th-grid"); grid.setAttribute("role", "radiogroup"); c.appendChild(grid);
    var sws = {};
    function swatch(id, th) {
      var b = mk("button", "th-sw"); b.type = "button"; b.setAttribute("role", "radio"); sws[id] = b;
      var pv = mk("span", "th-prev"), t = mk("i", "t", "Aa"), card = mk("i", "c"), a = mk("i", "a"), d = mk("i", "d"); [t, card, a, d].forEach(function (e) { pv.appendChild(e); });
      var nm = mk("span", "th-nm"); nm.appendChild(mk("span", null, tr("theme." + id))); nm.appendChild(mk("span", "check"));
      b.appendChild(pv); b.appendChild(nm);
      b.paint = function (spec) {
        var x = TH.preview(spec || th);
        pv.style.background = "linear-gradient(160deg," + x.bg1 + "," + x.bg2 + ")"; card.style.background = x.card; t.style.color = x.accent; a.style.background = x.accent; d.style.background = x.cyan;
      };
      b.paint();
      tipx(b, "tip.theme.set", { name: tr("theme." + id) });
      b.onclick = function () { TH.set(th); };
      grid.appendChild(b); return b;
    }
    TH.NAMES.forEach(function (id) { swatch(id, { id: id }); });
    var inp = mk("input"); inp.type = "color"; inp.value = "#ff6ad5";
    var hex = mk("code", "th-hex", "");
    var cust = swatch("custom", { id: "custom", c: inp.value });
    cust.onclick = function () { TH.set({ id: "custom", c: inp.value }); };
    var pick = mk("span", "th-pick"); pick.appendChild(hex); pick.appendChild(inp);
    tipx(inp, "tip.theme.custom");
    var rowc = h.row(tr("theme.custom"), pick, tr("theme.custom.d"), null); c.appendChild(rowc);
    var bar = mk("div", "th-bar"), reset = mk("button", "btn ghost", tr("theme.reset")); reset.type = "button"; tipx(reset, "tip.theme.reset");
    reset.onclick = function () { TH.set({ id: "gravitas" }); }; bar.appendChild(reset); c.appendChild(bar);
    var msg = mk("p", "note th-msg"); c.appendChild(msg);

    function show() {
      var cur = TH.get(), id = cur.id;
      Object.keys(sws).forEach(function (k) { sws[k].setAttribute("aria-checked", k === id ? "true" : "false"); });
      if (id === "custom") inp.value = cur.c;
      hex.textContent = inp.value; sws.custom.paint({ id: "custom", c: inp.value });
      var i = TH.info(); msg.textContent = i.adjusted ? tr("theme.adjusted") : "";
    }
    inp.oninput = function () { TH.live({ id: "custom", c: inp.value }); show(); };       // live while the picker moves
    inp.onchange = function () { TH.set({ id: "custom", c: inp.value }); show(); };      // saved when it is let go
    addEventListener("gv-theme", show); show();
  }
  GVC.add("themes", build);
})();
