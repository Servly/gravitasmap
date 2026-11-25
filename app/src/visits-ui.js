"use strict";
// GRAVITAS Visits, part 4 of 4: the page itself. mount() builds the elements, wires the mouse and the keys, and keeps the data fresh:
// visits_get is asked every ~6 s (every 1.5 s while the Rust side is still scanning the Journals), ONLY while the Visits tab is on screen and the
// window is visible. New stops are merged without touching the camera, the selection or the page. Nothing runs when the tab or the window is hidden.
(function () {
  var G = window.GVV, esc = G.esc, clamp = G.clamp, cur = null;
  G.last = null;                                       // the last answer of visits_get: a language change builds the page again and starts from it
  G.slowShown = false;

  var SVG = {
    search: '<svg viewBox="0 0 20 20"><circle cx="9" cy="9" r="6"/><path d="M14 14l4 4"/></svg>',
    fit: '<svg viewBox="0 0 20 20"><path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/></svg>',
    replay: '<svg viewBox="0 0 20 20"><path d="M6 4l10 6-10 6z"/></svg>',
    tilt: '<svg viewBox="0 0 20 20"><path d="M2 12l8-5 8 5-8 5zM10 7V2"/></svg>',
    panel: '<svg viewBox="0 0 20 20"><rect x="3" y="3" width="14" height="14" rx="3"/><path d="M12 3v14"/></svg>',
    help: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.5"/><path d="M8 8a2 2 0 114 0c0 1.5-2 1.6-2 3.2M10 14.2v.1"/></svg>',
    old: '<svg viewBox="0 0 16 16"><path d="M10 3L5 8l5 5"/></svg>', nw: '<svg viewBox="0 0 16 16"><path d="M6 3l5 5-5 5"/></svg>',
    globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-24 12 12)"/></svg>'
  };
  var HELP = [["pan", "arrows"], ["zoom", "wheel"], ["fit", "f"], ["stop", "stop"], ["page", "page"], ["replay", "r"], ["tilt", "t"], ["search", "slash"], ["fx", "e"], ["back", "esc"], ["group", "click"]];

  G.mount = function (parent, h) {
    if (cur) cur.destroy();
    var s = cur = makeState(h); build(s, parent); G.attachLoop(s); G.attachPanel(s); wire(s); start(s);
    return s;
  };

  function makeState(h) {
    var lang = h.lang ? h.lang() : (document.documentElement.lang || "en");
    var s = {
      h: h, dead: false, on: false, tr: function (k, v) { return h.tr(k, v); }, f: G.makeFmt(lang),
      D: null, R: { i0: 0, i1: 0, unit: "all", ta: 0, tb: 0 }, M: null, mask: 0, query: "", matchId: 0, sel: -1, hov: -1, hovC: -1, resp: null, sig: "",
      cam: { cx: 0, cz: 0, cy: 0, ls: Math.log(.05), ox: 0, oy: 0, pitch: 0 }, tgt: null, accPan: [0, 0], cache: new Map(), lvCur: null, indiv: false, replay: null, raf: 0, dockQ: 0, lastTs: 0,
      W: 600, H: 400, dpr: 1, tlW: 600, histDirty: true, hist: null, tlHover: -1, staticBg: false, panelOpen: true, panelInit: false, topInset: 84, touched: false,
      perf: { ring: new Float32Array(240), n: 0, nodes: 0, segs: 0, renders: 0 }, perfOn: /perf=1/.test(location.search),
      hit: { x: new Float32Array(4096), y: new Float32Array(4096), r: new Float32Array(4096), id: new Int32Array(4096), n: 0 },
      e: {}, ui: {}, clearTimers: [], offs: [], pt: 0, busy: false, drag: null, tlDrag: null, forgetT: 0, scanning: false
    };
    s.tgt = Object.assign({}, s.cam);
    s.FX = !(G.lsGet("gvVisitsLite") === "1" || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches));
    s.destroy = function () {
      s.dead = true; s.on = false; cancelAnimationFrame(s.raf); cancelAnimationFrame(s.dockQ); clearTimeout(s.pt); clearTimeout(s.forgetT);
      s.clearTimers.forEach(function (f) { f(); }); s.offs.forEach(function (f) { f(); });
      if (s.root && s.root.parentNode) s.root.parentNode.removeChild(s.root); if (s.off && s.off.parentNode) s.off.parentNode.removeChild(s.off); if (cur === s) cur = null;
    };
    return s;
  }

  /* ---------- the elements ---------- */
  function build(s, parent) {
    var tr = s.tr, root = document.createElement("div"); root.className = "vs" + (s.FX ? "" : " vs-lite"); s.root = root;
    var t = function (k) { return esc(tr(k)); };
    var tools = [["fit", "bFit"], ["replay", "bReplay"], ["tilt", "bTilt"], ["panel", "bPanel"], ["help", "bHelp"]].map(function (a) {
      return '<button class="vs-tb vs-gl" data-r="' + a[1] + '" title="' + t("tip.vis." + a[0]) + '" aria-label="' + t("tip.vis." + a[0]) + '">' + SVG[a[0]] + "</button>"; }).join("");
    var units = ["session", "day", "week", "month", "all"].map(function (u) { return '<button data-u="' + u + '" title="' + t("tip.vis.u." + u) + '">' + t("vis.u." + u) + "</button>"; }).join("");
    var help = HELP.map(function (r) { return "<div>" + t("vis.help." + r[0]) + "<kbd>" + t("vis.help." + r[0] + ".k") + "</kbd></div>"; }).join("");
    root.innerHTML =
      '<div class="vs-top"><div class="vs-stats" aria-live="polite"></div><span class="vs-last" data-r="lastBox"><span>' + t("vis.last.l1") + '</span><input type="text" inputmode="numeric" maxlength="7" data-r="lastIn" placeholder="' + t("vis.u.all") + '" title="' + t("tip.vis.last") + '" aria-label="' + t("tip.vis.last") + '"><span>' + t("vis.last.l2") + '</span><button class="vs-btn" data-r="lastGo" title="' + t("tip.vis.last.apply") + '">' + t("vis.last.apply") + '</button>' + [10, 50, 100, 500].map(function (n) { return '<button class="vs-pre" data-n="' + n + '" title="' + esc(tr("tip.vis.last.preset", { n: n })) + '">' + n + "</button>"; }).join("") + '<span class="vs-bad" data-r="lastBad" role="alert"></span></span></div>' +
      '<section class="vs-stage po" tabindex="0" aria-label="' + t("vis.aria.map") + '">' +
      '<canvas class="vs-bg"></canvas><canvas class="vs-fg"></canvas><div class="vs-vig"></div>' +
      '<div class="vs-tl"><div class="vs-search vs-gl">' + SVG.search + '<input type="text" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" placeholder="' + t("vis.search.ph") + '" title="' + t("tip.vis.search") + '" aria-label="' + t("tip.vis.search") + '"><kbd>/</kbd><button class="vs-x" data-r="qx" title="' + t("tip.vis.search.clear") + '" aria-label="' + t("tip.vis.search.clear") + '">&times;</button><div class="vs-res vs-gl" role="listbox"></div></div><div class="vs-chips"></div></div>' +
      '<div class="vs-tools">' + tools + "</div>" +
      '<aside class="vs-panel vs-gl"><div class="vs-pbody"></div></aside>' +
      '<div class="vs-help vs-gl"><h4>' + t("vis.help.h") + "</h4>" + help + "</div>" +
      '<div class="vs-hud"><div class="vs-scale"><i></i><span></span></div><div class="vs-lod"></div></div><div class="vs-perf"' + (s.perfOn ? "" : " hidden") + "></div>" +
      '<div class="vs-dock vs-gl"><div class="vs-pg"><button class="vs-pgb" data-r="pOld" title="' + t("tip.vis.older") + '" aria-label="' + t("tip.vis.older") + '">' + SVG.old + '</button><button class="vs-pgb" data-r="pNew" title="' + t("tip.vis.newer") + '" aria-label="' + t("tip.vis.newer") + '">' + SVG.nw + '</button><span class="vs-seg" data-r="unitSeg">' + units + '</span><span class="vs-pgl"></span></div><canvas class="vs-tlc" title="' + t("tip.vis.timeline") + '"></canvas></div>' +
      '<div class="vs-toast vs-gl" role="status"><span>' + t("vis.toast.slow") + '</span><button class="vs-btn go" data-r="toastBtn" title="' + t("tip.vis.toast.reduce") + '">' + t("vis.toast.reduce") + '</button><button class="vs-btn" data-r="toastX" title="' + t("tip.vis.toast.no") + '">' + t("vis.toast.no") + "</button></div>" +
      '<div class="vs-tip vs-gl"></div>' +
      '<div class="vs-none"><div class="vs-nc vs-gl"><div class="ico">' + SVG.globe + '</div><h3></h3><p></p></div></div></section>' +
      '<div class="vs-foot"><div class="vs-st" aria-live="polite"></div>' + '<span class="vs-fxr" data-r="fxr" title="' + t("tip.vis.fx") + '"><button class="sw" role="switch" aria-checked="false" data-r="fx" aria-label="' + t("vis.fx") + '"></button><span>' + t("vis.fx") + '</span></span><span class="vs-keep" data-r="keepr" title="' + t("tip.vis.keep") + '"><button class="sw" role="switch" aria-checked="true" data-r="keep" aria-label="' + t("vis.keep.h") + '"></button><span>' + t("vis.keep.h") + '</span></span>' +
      '<span class="vs-forget"><button class="vs-btn" data-r="forget" title="' + t("tip.vis.forget") + '">' + t("vis.forget") + '</button><span data-r="fconf" hidden>' + t("vis.forget.ask") + ' <button class="vs-btn warn" data-r="fyes" title="' + t("tip.vis.forget.yes") + '">' + t("vis.forget.yes") + '</button> <button class="vs-btn" data-r="fno" title="' + t("tip.vis.forget.no") + '">' + t("vis.forget.no") + "</button></span></span></div>";
    parent.appendChild(root);
    // the card shown instead of the map while the history is switched off
    var off = document.createElement("div"); off.className = "card vs-off"; off.hidden = true; s.off = off;
    off.innerHTML = "<h2>" + t("vis.keep.h") + '</h2><p class="note" style="margin-top:0">' + t("vis.keep.off") + '</p><div class="opt"><div><div>' + t("vis.keep.h") + '</div></div><button class="sw" role="switch" aria-checked="false" data-r="keep2" title="' + t("tip.vis.keep") + '" aria-label="' + t("vis.keep.h") + '"></button></div>';
    parent.appendChild(off);
    var q = function (sel) { return root.querySelector(sel); }, e = s.e;
    e.main = root; e.stage = q(".vs-stage"); e.bg = q(".vs-bg"); e.fg = q(".vs-fg"); e.tlc = q(".vs-tlc"); e.tl = q(".vs-tl"); e.stats = q(".vs-stats"); e.q = q(".vs-search input"); e.search = q(".vs-search");
    e.res = q(".vs-res"); e.chips = q(".vs-chips"); e.tools = q(".vs-tools"); e.panel = q(".vs-panel"); e.pbody = q(".vs-pbody"); e.help = q(".vs-help"); e.dock = q(".vs-dock"); e.pgl = q(".vs-pgl");
    e.tip = q(".vs-tip"); e.toast = q(".vs-toast"); e.perf = q(".vs-perf"); e.lod = q(".vs-lod"); e.scBar = q(".vs-scale i"); e.scTxt = q(".vs-scale span"); e.st = q(".vs-st");
    e.none = q(".vs-none"); e.noneH = q(".vs-nc h3"); e.noneP = q(".vs-nc p"); e.hud = q(".vs-hud");
    ["bFit", "bReplay", "bTilt", "bPanel", "bHelp", "pOld", "pNew", "unitSeg", "fx", "fxr", "keep", "keepr", "forget", "fconf", "fyes", "fno", "toastBtn", "toastX", "qx", "lastBox", "lastIn", "lastGo", "lastBad"].forEach(function (r) { e[r] = q('[data-r="' + r + '"]'); });
    e.keep2 = off.querySelector('[data-r="keep2"]');
    s.bg = e.bg.getContext("2d", { alpha: false }); s.fg = e.fg.getContext("2d"); s.tl = e.tlc.getContext("2d");
    e.fx.setAttribute("aria-checked", s.FX ? "false" : "true");
  }

  /* ---------- state helpers ---------- */
  function layout(s) {            // the space under the search box and the chips is free for the map
    s.topInset = s.e.tl.offsetTop + s.e.tl.offsetHeight + 8;
  }
  function applyPanel(s) {
    var e = s.e, po = s.panelOpen;
    e.panel.classList.toggle("hide", !po); e.stage.classList.toggle("po", po); e.tools.style.right = po ? "328px" : "14px"; e.dock.style.right = po ? "328px" : "14px"; e.help.style.right = po ? "376px" : "62px"; e.bPanel.classList.toggle("on", po);
    e.bPanel.setAttribute("aria-pressed", po ? "true" : "false"); layout(s);
    var fr = G.freeRect(s); s.tgt.ox = (fr.l + fr.r) / 2; s.tgt.oy = (fr.t + fr.b) / 2; s.invalidate();
  }
  function startReplay(s, dur) {
    var nr = s.R.i1 - s.R.i0; if (!s.FX || !s.D || nr < 2) { s.replay = null; s.invalidate(); return; }
    s.replay = { t0: performance.now(), dur: (dur || clamp(1.5 + Math.log10(nr + 1) * .7, 1.7, 4.2)) * 1000, p: 0 }; s.invalidate();
  }
  function cancelReplay(s) { if (s.replay) { s.replay = null; s.ui.unit(); s.invalidate(); } }
  function select(s, i, fly) {
    var D = s.D, R = s.R; s.sel = i; s.ui.panel(); s.invalidate();
    if (i >= 0 && fly) {
      if (!s.panelOpen) { s.panelOpen = true; applyPanel(s); }
      var z = Math.max(Math.exp(s.tgt.ls), .05), fr = G.freeRect(s), cp = Math.cos(s.tgt.pitch);       // zoom in until this stop stands on its own, never zoom out
      for (var it = 0; it < 16; it++) {
        var hw = (fr.r - fr.l) / 2 / z, hh = (fr.b - fr.t) / 2 / (z * cp), c = 0;
        for (var k = R.i0; k < R.i1 && c <= 200; k++) if (Math.abs(D.X[k] - D.X[i]) < hw && Math.abs(D.Z[k] - D.Z[i]) < hh) c++;
        if (c <= 200 || z >= 2.5) break; z *= 1.5;
      }
      var t = s.tgt; t.cx = D.X[i]; t.cz = D.Z[i]; t.cy = D.Y[i]; t.ls = Math.log(z); t.ox = (fr.l + fr.r) / 2; t.oy = (fr.t + fr.b) / 2;
    }
  }
  function goTo(s, i) {           // select a stop anywhere, bring its page into view, fly there
    if (i < s.R.i0 || i >= s.R.i1) { if (s.R.unit === "all") G.setRange(s, 0, s.D.n, "all"); else G.setUnit(s, s.R.unit, i); }
    select(s, i, true);
  }
  function setFX(s, on) {
    s.FX = on; G.lsSet("gvVisitsLite", on ? "0" : "1"); s.root.classList.toggle("vs-lite", !on); s.e.fx.setAttribute("aria-checked", on ? "false" : "true");
    G.resize(s); if (!on) { cancelReplay(s); Object.assign(s.cam, s.tgt); } s.invalidate();
  }
  function toggleTilt(s) { s.tgt.pitch = s.tgt.pitch > .1 ? 0 : .95; s.e.bTilt.classList.toggle("on", s.tgt.pitch > .1); if (!s.FX) s.cam.pitch = s.tgt.pitch; s.invalidate(); }
  function pageChanged(s) { G.fit(s, false); startReplay(s, .9); }

  /* ---------- the mouse, the keys, the buttons ---------- */
  function wire(s) {
    var e = s.e, D0 = function () { return s.D; }, qT = 0;
    function on(el, ev, fn, opt) { el.addEventListener(ev, fn, opt); }
    function onDoc(ev, fn) { document.addEventListener(ev, fn); s.offs.push(function () { document.removeEventListener(ev, fn); }); }
    function touch() { s.touched = true; }
    // filters and search
    on(e.chips, "click", function (ev) { var b = ev.target.closest(".vs-fc"); if (!b || !s.D) return; touch(); s.mask ^= 1 << (+b.dataset.k); G.recomputeMatch(s); s.ui.summaryLater(); });
    on(e.q, "input", function (ev) {
      clearTimeout(qT); qT = setTimeout(function () { if (s.dead) return; var v = ev.target.value.trim().toLowerCase(); s.query = v.length < 2 ? "" : v; e.search.classList.toggle("has", !!ev.target.value); G.recomputeMatch(s); s.ui.showRes(); }, 80);
    });
    s.clearTimers.push(function () { clearTimeout(qT); });
    on(e.qx, "click", function () { e.q.value = ""; s.query = ""; e.search.classList.remove("has"); G.recomputeMatch(s); s.ui.closeRes(); s.ui.summaryLater(); });
    on(e.res, "click", function (ev) { var b = ev.target.closest("button"); if (!b) return; var o = s.resItems[+b.dataset.j]; s.ui.closeRes(); if (o) { touch(); goTo(s, o.i); } });
    on(e.q, "keydown", function (ev) {
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); if (!s.resItems.length) return; s.resAct = clamp(s.resAct + (ev.key === "ArrowDown" ? 1 : -1), 0, s.resItems.length - 1); Array.prototype.forEach.call(e.res.querySelectorAll("button"), function (b, j) { b.classList.toggle("act", j === s.resAct); }); }
      else if (ev.key === "Enter") { var o = s.resItems[s.resAct >= 0 ? s.resAct : 0]; if (o) { s.ui.closeRes(); touch(); goTo(s, o.i); } }
      else if (ev.key === "Escape") { ev.stopPropagation(); s.ui.closeRes(); e.q.blur(); e.stage.focus(); }
    });
    onDoc("pointerdown", function (ev) { if (!ev.target.closest || !ev.target.closest(".vs-search")) s.ui.closeRes(); });
    // details panel
    on(e.pbody, "click", function (ev) {
      var D = s.D, g = ev.target.closest("[data-go]"); if (g) { touch(); goTo(s, +g.dataset.go); return; }
      var q = ev.target.closest("[data-q]"); if (q) { e.q.value = q.dataset.q; s.query = q.dataset.q.toLowerCase(); e.search.classList.add("has"); G.recomputeMatch(s); s.ui.showRes(); return; }
      var ss = ev.target.closest("[data-ses]"); if (ss) { touch(); s.sel = -1; G.setUnit(s, "session", +ss.dataset.ses); pageChanged(s); return; }
      var d = ev.target.closest("[data-do]"); if (!d || !D || s.sel < 0) return; var name = D.v[s.sel].sys;
      if (d.dataset.do === "back") select(s, -1);
      else if (d.dataset.do === "show") { s.h.invoke("map_open_site", { mode: null, system: name }).catch(function () { }); }      // the same call the old Visits list made
      else if (d.dataset.do === "copy") {
        try { navigator.clipboard.writeText(name).catch(function () { }); } catch (_) { }
        d.textContent = s.tr("vis.btn.copied"); var tm = setTimeout(function () { if (!s.dead) d.textContent = s.tr("vis.btn.copy"); }, 1200); s.clearTimers.push(function () { clearTimeout(tm); });
      }
    });
    // map: drag, click, hover, wheel
    var fg = e.fg;
    on(fg, "pointerdown", function (ev) { touch(); cancelReplay(s); e.tip.classList.remove("on"); e.stage.focus({ preventScroll: true }); fg.setPointerCapture(ev.pointerId); s.drag = { x: ev.clientX, y: ev.clientY, moved: 0, cx: s.tgt.cx, cz: s.tgt.cz }; fg.classList.add("drag"); });
    on(fg, "pointermove", function (ev) {
      var r = fg.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top, dr = s.drag;
      if (dr) { var dx = ev.clientX - dr.x, dy = ev.clientY - dr.y; dr.moved = Math.max(dr.moved, Math.abs(dx) + Math.abs(dy)); if (dr.moved > 3) { var sc = Math.exp(s.tgt.ls), cp = Math.cos(s.tgt.pitch); s.tgt.cx = dr.cx - dx / sc; s.tgt.cz = dr.cz - dy / (sc * cp); s.cam.cx = s.tgt.cx; s.cam.cz = s.tgt.cz; e.tip.classList.remove("on"); s.invalidate(); } return; }
      if (!s.D) return; var q = hitAt(s, mx, my); if (q !== s.hovC) { s.hovC = q; s.invalidate(); } fg.classList.toggle("pt", q >= 0); s.ui.hover(q, mx, my);
    });
    on(fg, "pointerup", function (ev) {
      fg.classList.remove("drag"); var dr = s.drag; if (!dr) return; s.drag = null; if (dr.moved > 3 || !s.D) return;
      var r = fg.getBoundingClientRect(), q = hitAt(s, ev.clientX - r.left, ev.clientY - r.top);
      if (q < 0) { if (s.sel >= 0) select(s, -1); return; }
      var lv = s.lvCur; if (lv.n[q] === 1) select(s, s.R.i0 + lv.first[q], false); else zoomToGroup(s, q);
    });
    on(fg, "pointerleave", function () { if (s.hovC !== -1) { s.hovC = -1; s.invalidate(); } e.tip.classList.remove("on"); });
    on(fg, "dblclick", function (ev) { if (!s.D) return; var r = fg.getBoundingClientRect(); if (hitAt(s, ev.clientX - r.left, ev.clientY - r.top) < 0) G.zoomAt(s, ev.clientX - r.left, ev.clientY - r.top, 2.2); });
    on(fg, "wheel", function (ev) { ev.preventDefault(); touch(); cancelReplay(s); var r = fg.getBoundingClientRect(); G.zoomAt(s, ev.clientX - r.left, ev.clientY - r.top, Math.exp(-ev.deltaY * (ev.deltaMode ? .05 : .0016))); }, { passive: false });
    // timeline
    var tlc = e.tlc, wT = 0;
    on(tlc, "pointerdown", function (ev) {
      if (!s.D) return; touch(); cancelReplay(s); var x = ev.offsetX, x0 = G.tlX(s, s.R.ta), x1 = G.tlX(s, s.R.tb); tlc.setPointerCapture(ev.pointerId);
      var mode = "new"; if (Math.abs(x - x0) < 8) mode = "l"; else if (Math.abs(x - x1) < 8) mode = "r"; else if (x > x0 && x < x1) mode = "m";
      s.tlDrag = { mode: mode, x: x, ta: s.R.ta, tb: s.R.tb }; if (mode === "new") { var w = Math.max(s.R.tb - s.R.ta, 864e5); G.setBrush(s, G.tlT(s, x) - w / 2, G.tlT(s, x) + w / 2); }
    });
    on(tlc, "pointermove", function (ev) {
      var x = ev.offsetX, d = s.tlDrag; s.tlHover = d ? -1 : x;
      if (d) { var dt = G.tlT(s, x) - G.tlT(s, d.x);
        if (d.mode === "m") G.setBrush(s, d.ta + dt, d.tb + dt); else if (d.mode === "l") G.setBrush(s, Math.min(d.ta + dt, d.tb - 36e5), d.tb); else if (d.mode === "r") G.setBrush(s, d.ta, Math.max(d.tb + dt, d.ta + 36e5));
        else { var w = d.tb - d.ta; G.setBrush(s, G.tlT(s, x) - w / 2, G.tlT(s, x) + w / 2); } }
      else if (s.D) { var a = G.tlX(s, s.R.ta), b = G.tlX(s, s.R.tb); tlc.style.cursor = (Math.abs(x - a) < 8 || Math.abs(x - b) < 8) ? "ew-resize" : (x > a && x < b) ? "grab" : "pointer"; }
      G.invalidateDock(s);
    });
    on(tlc, "pointerup", function () { if (s.tlDrag) { s.tlDrag = null; G.fit(s, false); } });
    on(tlc, "pointerleave", function () { s.tlHover = -1; G.invalidateDock(s); });
    on(tlc, "wheel", function (ev) {
      ev.preventDefault(); if (!s.D) return; touch(); cancelReplay(s); var f = Math.exp(ev.deltaY * .0015), t = G.tlT(s, ev.offsetX), a = t - (t - s.R.ta) * f, b = t + (s.R.tb - t) * f; if (b - a < 36e5) return;
      G.setBrush(s, a, b); clearTimeout(wT); wT = setTimeout(function () { if (!s.dead && s.on) G.fit(s, false); }, 250);
    }, { passive: false });
    s.clearTimers.push(function () { clearTimeout(wT); });
    // "Show my last N visits": one more kind of page
    function applyLast(txt) {
      var v = String(txt == null ? e.lastIn.value : txt).trim(), D = s.D; e.lastBad.textContent = ""; if (!D) return;
      if (v === "") { s.lastN = 0; touch(); G.setUnit(s, "all"); pageChanged(s); return; }
      var n = /^[0-9]+$/.test(v) ? parseInt(v, 10) : 0;
      if (n < 1 || n > D.n) { e.lastBad.textContent = s.tr("vis.last.bad", { max: s.f.n(D.n) }); e.lastIn.setAttribute("aria-invalid", "true"); return; }
      e.lastIn.removeAttribute("aria-invalid"); s.lastN = n; touch(); s.sel = -1; G.setUnit(s, "last"); pageChanged(s);
    }
    on(e.lastGo, "click", function () { applyLast(); });
    on(e.lastIn, "keydown", function (ev) { if (ev.key === "Enter") { ev.preventDefault(); applyLast(); } else if (ev.key === "Escape") { ev.stopPropagation(); e.lastIn.blur(); e.stage.focus(); } });
    on(e.lastIn, "input", function () { e.lastBad.textContent = ""; e.lastIn.removeAttribute("aria-invalid"); });
    on(e.lastBox, "click", function (ev) { var b = ev.target.closest(".vs-pre"); if (!b) return; e.lastIn.value = b.dataset.n; applyLast(b.dataset.n); });
    // buttons
    on(e.bFit, "click", function () { touch(); G.fit(s, false); });
    on(e.bReplay, "click", function () { startReplay(s); });
    on(e.bTilt, "click", function () { toggleTilt(s); });
    on(e.bPanel, "click", function () { s.panelOpen = !s.panelOpen; applyPanel(s); });
    on(e.bHelp, "click", function () { e.help.classList.toggle("on"); });
    on(e.pOld, "click", function () { touch(); if (G.stepPage(s, -1)) pageChanged(s); });
    on(e.pNew, "click", function () { touch(); if (G.stepPage(s, 1)) pageChanged(s); });
    on(e.unitSeg, "click", function (ev) { var b = ev.target.closest("button"); if (!b || !s.D) return; touch(); var u = b.dataset.u; e.lastBad.textContent = ""; G.setUnit(s, u, u === "all" ? null : (s.sel >= 0 ? s.sel : null)); pageChanged(s); });
    on(e.fxr, "click", function () { setFX(s, !s.FX); });
    on(e.toastBtn, "click", function () { setFX(s, false); e.toast.classList.remove("on"); }); on(e.toastX, "click", function () { e.toast.classList.remove("on"); });
    // keys: only while the focus is inside this page
    on(s.root, "keydown", function (ev) {
      if (ev.target === e.q || ev.ctrlKey || ev.metaKey || ev.altKey || !s.D) return; var k = ev.key, t = s.tgt, pan = 70 / Math.exp(t.ls), used = true;
      if (k === "Escape") { e.help.classList.remove("on"); if (s.sel >= 0) select(s, -1); ev.preventDefault(); return; }
      if (ev.target.tagName === "BUTTON" && (k === " " || k === "Enter")) return;
      cancelReplay(s); s.touched = true;
      if (k === "ArrowLeft") t.cx -= pan; else if (k === "ArrowRight") t.cx += pan; else if (k === "ArrowUp") t.cz -= pan / Math.cos(t.pitch); else if (k === "ArrowDown") t.cz += pan / Math.cos(t.pitch);
      else if (k === "+" || k === "=") G.zoomAt(s, t.ox, t.oy, 1.4); else if (k === "-" || k === "_") G.zoomAt(s, t.ox, t.oy, 1 / 1.4);
      else if (k === "f" || k === "F" || k === "0") G.fit(s, false); else if (k === "r" || k === "R") startReplay(s);
      else if (k === "t" || k === "T") toggleTilt(s); else if (k === "d" || k === "D") { s.panelOpen = !s.panelOpen; applyPanel(s); }
      else if (k === "e" || k === "E") setFX(s, !s.FX); else if (k === "?") e.help.classList.toggle("on");
      else if (k === "/") { e.q.focus(); } else if (k === "[") { if (G.stepPage(s, -1)) pageChanged(s); } else if (k === "]") { if (G.stepPage(s, 1)) pageChanged(s); }
      else if (k === "." || k === ",") { var d = k === "." ? 1 : -1, i = s.sel < 0 ? (d > 0 ? s.R.i0 : s.R.i1 - 1) : s.sel + d; if (i >= 0 && i < s.D.n) goTo(s, i); }
      else used = false;
      if (used) { ev.preventDefault(); s.invalidate(); }
    });
    // footer: the history switch and forgetting it
    function keepSet(on) { s.h.invoke("visits_keep_set", { on: on }).then(function () { poll(s); }).catch(function () { }); setKeep(s, on); }
    on(e.keepr, "click", function () { keepSet(e.keep.getAttribute("aria-checked") !== "true"); }); on(e.keep2, "click", function () { keepSet(true); });
    on(e.forget, "click", function () { e.forget.hidden = true; e.fconf.hidden = false; e.fno.focus(); clearTimeout(s.forgetT); s.forgetT = setTimeout(endForget, 8000); });
    function endForget() { clearTimeout(s.forgetT); e.fconf.hidden = true; e.forget.hidden = false; }
    on(e.fno, "click", endForget);
    on(e.fyes, "click", function () {
      endForget(); s.h.invoke("visits_forget").then(function () { G.last = null; s.sig = ""; s.rev = null; apply(s, { stops: [], total: 0, scanning: false, keep: true }); if (s.h.toast) s.h.toast(s.tr("vis.forgot")); poll(s); }).catch(function () { });
    });
    s.clearTimers.push(function () { clearTimeout(s.forgetT); });
  }
  function hitAt(s, mx, my) { var h = s.hit, best = -1, bd = 1e9; for (var k = 0; k < h.n; k++) { var dx = h.x[k] - mx, dy = h.y[k] - my, d = dx * dx + dy * dy, r = h.r[k] + 5; if (d < r * r && d < bd) { bd = d; best = h.id[k]; } } return best; }
  function zoomToGroup(s, q) {
    var D = s.D, R = s.R, lv = s.lvCur, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (var k = 0; k < R.i1 - R.i0; k++) { if (lv.cid[k] !== q) continue; var i = R.i0 + k; x0 = Math.min(x0, D.X[i]); x1 = Math.max(x1, D.X[i]); z0 = Math.min(z0, D.Z[i]); z1 = Math.max(z1, D.Z[i]); }
    var fr = G.freeRect(s), bw = Math.max(x1 - x0, 6), bh = Math.max(z1 - z0, 6), cp = Math.cos(s.tgt.pitch), t = s.tgt;
    var sc = clamp(Math.min((fr.r - fr.l) / bw, (fr.b - fr.t) / (bh * cp)) * .7, Math.exp(s.cam.ls) * 1.6, 45);
    t.cx = (x0 + x1) / 2; t.cz = (z0 + z1) / 2; t.ls = Math.log(sc); t.ox = (fr.l + fr.r) / 2; t.oy = (fr.t + fr.b) / 2; s.invalidate();
  }
  function setKeep(s, on) { s.e.keep.setAttribute("aria-checked", on ? "true" : "false"); s.e.keep2.setAttribute("aria-checked", on ? "true" : "false"); }

  /* ---------- the data: first answer, merging, polling ---------- */
  function showState(s) {
    var e = s.e, r = s.resp, D = s.D, tr = s.tr, f = s.f, none = !D || D.n === 0;
    e.stage.classList.toggle("none", none); s.root.classList.toggle("vs-zero", none);
    if (none) {
      if (r && r.scanning) { e.noneH.textContent = tr("vis.loading"); e.noneP.textContent = tr("vis.scan", { n: f.n(r.scanned || 0), m: f.n(r.files || 0) }); }
      else if (r) { e.noneH.textContent = tr("vis.empty.h"); e.noneP.textContent = tr("vis.empty.p"); }
      else { e.noneH.textContent = tr("vis.loading"); e.noneP.textContent = ""; }
    }
    var st = "";
    if (r && r.scanning) st = tr("vis.scan", { n: f.n(r.scanned || 0), m: f.n(r.files || 0) });
    else if (r && r.since) { var t = typeof r.since === "number" ? r.since : Date.parse(r.since); if (t) st = tr("vis.since", { d: f.dy(t) }); }
    if (e.st.textContent !== st) e.st.textContent = st;
    e.forget.disabled = !D || D.n === 0;
  }
  function rebindRange(s, old, oldD) {       // the new data is a longer list: keep the page the player was looking at
    var D = s.D, R = old;
    if (R.unit === "all") G.setRange(s, 0, D.n, "all", D.tmin, D.tmax + 1);
    else if (R.unit === "last" && oldD && R.i1 >= oldD.n) G.setUnit(s, "last");
    else if (R.unit === "session") { var anchor = oldD && R.i0 < oldD.n ? G.lb(D.T, oldD.T[R.i0], D.n) : D.n - 1; G.setUnit(s, "session", clamp(anchor, 0, D.n - 1)); }
    else G.setRange(s, G.lb(D.T, R.ta, D.n), G.lb(D.T, R.tb, D.n), R.unit, R.ta, R.tb);
  }
  function apply(s, resp) {
    if (s.dead || !resp) return;
    var stops = resp.stops || [], n = stops.length, sig = n + "|" + (n ? stops[0].t + stops[n - 1].t + stops[n - 1].sys : "") + "|" + resp.scanning + "|" + resp.scanned + "|" + resp.total + "|" + resp.keep + "|" + resp.since;
    if (resp.rev != null) s.rev = resp.rev;
    if (sig === s.sig) return; s.sig = sig; s.resp = resp; G.last = resp; s.scanning = !!resp.scanning;
    var keep = resp.keep !== false; setKeep(s, keep); s.root.hidden = !keep; s.off.hidden = keep;
    if (!keep) return;
    var oldD = s.D, oldR = s.R, selKey = oldD && s.sel >= 0 ? G.keyOf(oldD.v[s.sel]) : null, first = !oldD || oldD.n === 0;
    if (!n) { s.D = null; s.sel = -1; s.M = null; s.hist = null; s.cache.clear(); s.lvCur = null; showState(s); s.ui.stats(); s.invalidate(); return; }
    s.D = G.prep(stops); s.histDirty = true; s.hist = null;
    if (!G.resize(s)) { /* hidden: the size is taken when the tab shows */ }
    if (first) {
      s.sel = -1; s.mask = 0; s.query = ""; s.M = null; s.restoring = true;
      var want = parseInt(G.lsGet("gvVisitsLast") || "0", 10); if (want >= 1 && want <= s.D.n) { s.lastN = want; G.setUnit(s, "last"); } else G.setUnit(s, "all");
      s.restoring = false; layout(s);
      if (!s.panelInit) { s.panelInit = true; s.panelOpen = s.e.stage.clientWidth >= 900; applyPanel(s); }
      G.fit(s, true);
      if (!s.scanning && !G.introDone) { G.introDone = true; startReplay(s); }
    } else {
      s.sel = selKey ? G.indexOfKey(s.D, selKey) : -1; rebindRange(s, oldR, oldD); G.recomputeMatch(s);
      if (!s.touched && s.R.unit === "all") G.fit(s, false);
      if (!s.scanning && !G.introDone && !s.touched) { G.introDone = true; startReplay(s); }
    }
    showState(s); s.ui.stats(); s.ui.unit(); s.ui.panel(); s.invalidate();
    if (!s.slowTimer) { s.slowTimer = setTimeout(function () { s.slowTimer = 0; checkSlow(s); }, 2500); s.clearTimers.push(function () { clearTimeout(s.slowTimer); }); }
  }
  function checkSlow(s) {
    if (s.dead || !s.on || G.slowShown || !s.FX || s.perf.n < 40) return; G.slowShown = true;
    var a = Array.prototype.slice.call(s.perf.ring, 0, 40).sort(function (x, y) { return x - y; }); if (a[20] > 14) s.e.toast.classList.add("on");
  }
  function poll(s) {
    if (s.dead || !s.on || s.busy) return; s.busy = true; clearTimeout(s.pt);
    var p; try { p = s.h.invoke("visits_get", s.rev != null && !s.scanning ? { rev: s.rev } : {}); } catch (_) { p = Promise.reject(); }
    p.then(function (r) { s.busy = false; if (s.dead) return; if (r && r.same) { schedule(s); return; } apply(s, r); schedule(s); }).catch(function () { s.busy = false; if (!s.dead) { if (!s.resp) { s.resp = { stops: [], keep: true }; showState(s); } schedule(s, 6000); } });
  }
  function schedule(s, ms) { clearTimeout(s.pt); if (s.dead || !s.on) return; s.pt = setTimeout(function () { poll(s); }, ms || (s.resp && s.resp.scanning ? 1500 : 6000)); }

  /* ---------- when the tab is on screen ---------- */
  function viewVisible(s) {
    var v = s.root.closest(".view"), p = s.root.closest(".pane");
    return !document.hidden && s.root.isConnected && (!v || v.classList.contains("on")) && (!p || p.classList.contains("on"));
  }
  function sync(s) {
    if (s.dead) return; var on = viewVisible(s); if (on === s.on) return; s.on = on;
    if (on) {
      G.resize(s); layout(s); if (s.D && !s.touched) G.fit(s, true); s.invalidate(); G.invalidateDock(s); poll(s);
    } else {                                           // hidden: no frame, no request, no timer
      cancelAnimationFrame(s.raf); s.raf = 0; cancelAnimationFrame(s.dockQ); s.dockQ = 0; clearTimeout(s.pt);
    }
  }
  function start(s) {
    var e = s.e; e.fx.setAttribute("aria-checked", s.FX ? "false" : "true");
    if (G.last) { s.resp = null; } showState(s);
    var ro = new ResizeObserver(function () {
      if (s.dead || !G.resize(s)) return; layout(s);
      if (s.D) { if (!s.touched) G.fit(s, true); else applyPanel(s); } s.invalidate(); G.invalidateDock(s);
    });
    ro.observe(e.stage); s.offs.push(function () { ro.disconnect(); });
    var mo = new MutationObserver(function () { sync(s); });
    [s.root.closest(".view"), s.root.closest(".pane")].forEach(function (el) { if (el) mo.observe(el, { attributes: true, attributeFilter: ["class"] }); });
    s.offs.push(function () { mo.disconnect(); });
    var vc = function () { sync(s); }; document.addEventListener("visibilitychange", vc); s.offs.push(function () { document.removeEventListener("visibilitychange", vc); });
    s.ui.chips();
    if (G.last) apply(s, G.last);                      // a language change: show what we had at once, the next poll refreshes it
    sync(s);
    window.__visits = { state: function () { return cur; }, raf: function () { return G.raf; }, bench: function (a, b, c) { return G.bench(cur, a, b, c); } };
  }
})();
