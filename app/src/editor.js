"use strict";
// The on-screen editor: a transparent layer over the game while the GRAVITAS menu is open. Every window that is on shows with a thin bar
// (Lock / Unlock, colour, a small panel for size, opacity and dark ground). Unlocked, it is dragged with the mouse; Lock keeps it in the profile.
(function () {
  var T = window.__TAURI__ || {}, invoke = T.core && T.core.invoke;
  var lang = "en", dict = {}, en = {};
  try { var v = localStorage.getItem("gv_lang"); if (v) lang = JSON.parse(v); } catch (e) {}
  var NAMES = { status: "Status", alert: "Interdiction", targets: "Targets by value", feed: "Kill feed", fight: "Current fight", speed: "Time to kill", bounty: "Bounty counter", report: "Combat report", banner: "COMBAT banner", shortcuts: "Keys (10 s)" };
  var BAND = 0.08, MARGIN = 0.015, DEFAULT = "#ff7100";
  var stage = document.getElementById("stage"), guides = document.getElementById("guides"), hint = document.getElementById("hint");
  var rects = null, S = {}, free = {}, pending = {}, drag = null, pause = 0, built = "", popFor = null;
  // CSS pixels per game pixel: this layer is the size of the game's window, so the ratio is read from the two sizes, not guessed from the screen's scale
  function K() { return rects && rects.gw ? innerWidth / rects.gw : 1 / (window.devicePixelRatio || 1); }
  function raise() { if (invoke) invoke("menu_raise").catch(function () {}); }
  var lastSend = 0, down = false, downT = 0, lastRaise = 0;
  // the bars (and the cog panels) live in their own layer ABOVE every box: a window that lies over another must never hide the other one's buttons
  var bars = document.createElement("div"); bars.id = "bars"; document.body.insertBefore(bars, document.getElementById("hint"));

  function load(code) { return fetch("lang/" + code + ".json").then(function (r) { return r.json(); }).catch(function () { return {}; }); }
  function t(k) { var s = dict[k]; if (s == null) s = en[k]; return s == null ? k : s; }
  function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function op(name, value) { if (invoke) invoke("combat_op", { name: name, value: value }); }
  function setting(key, value) { if (invoke) invoke("combat_setting", { key: key, value: value }); S[key] = value; }

  function guideLayer(active) {
    guides.innerHTML = "";
    if (!rects) return;
    var W = rects.gw * K(), H = rects.gh * K();
    [["left", 0, W / 2 - W * BAND], ["mid", W / 2 - W * BAND, W / 2 + W * BAND], ["right", W / 2 + W * BAND, W]].forEach(function (z) {
      var d = mk("div", "zone" + (active === z[0] ? " on" : "")); d.style.left = z[1] + "px"; d.style.width = (z[2] - z[1]) + "px"; guides.appendChild(d);
    });
    var cl = mk("div", "g line"); cl.style.cssText = "left:" + (W / 2) + "px;top:0;bottom:0"; guides.appendChild(cl);
    // the places a window snaps to: the edges (a little in)
    [[W * MARGIN, 0, 2, H], [W - W * MARGIN - 2, 0, 2, H], [0, H * MARGIN, W, 2], [0, H - H * MARGIN - 2, W, 2]].forEach(function (g) {
      var d = mk("div", "g"); d.style.cssText = "left:" + g[0] + "px;top:" + g[1] + "px;width:" + g[2] + "px;height:" + g[3] + "px;background:rgba(255,106,213,.25)"; guides.appendChild(d);
    });
  }

  function persOn(k) { var w = S.win && S.win[k]; return !w || w.persp !== false; }

  function popup() {
    var p = mk("div", "pop");
    function range(label, k, lo, hi, unit) {
      var l = mk("label"), i = document.createElement("input"), val = mk("span");
      i.type = "range"; i.min = lo; i.max = hi; i.value = S[k] != null ? S[k] : lo; val.textContent = i.value + unit;
      i.oninput = function () { val.textContent = i.value + unit; }; i.onchange = function () { setting(k, parseInt(i.value, 10)); };
      l.appendChild(mk("span", null, label)); l.appendChild(i); l.appendChild(val); p.appendChild(l);
    }
    // size, opacity and dark ground are this window's own (-1 follows the settings for all windows until one is set)
    var ow = S.win && S.win[popFor], own = function (k) { return ow && ow[k] != null && ow[k] > 0 ? ow[k] : -1; };
    function rangeOwn(label, k, lo, hi, globalVal) {
      var l = mk("label"), i = document.createElement("input"), val = mk("span"), pk0 = popFor;
      i.type = "range"; i.min = lo; i.max = hi; i.value = own(k) > 0 ? own(k) : globalVal; val.textContent = i.value + "%";
      var tm = 0;
      i.oninput = function () { val.textContent = i.value + "%"; if (!tm) tm = setTimeout(function () { tm = 0; setting("win." + pk0 + "." + k, parseInt(i.value, 10)); }, 90); };
      i.onchange = function () { clearTimeout(tm); tm = 0; setting("win." + pk0 + "." + k, parseInt(i.value, 10)); };
      l.appendChild(mk("span", null, label)); l.appendChild(i); l.appendChild(val); p.appendChild(l);
    }
    rangeOwn(t("menu.k.size"), "size", 30, 200, S.size_pct != null ? S.size_pct : 90);
    rangeOwn(t("menu.k.opacity"), "opacity", 10, 100, S.opacity != null ? S.opacity : 92);
    // this window's own dark ground: 0 is off (a window not set yet follows the global switch)
    var gw = S.win && S.win[popFor], gl = gw && gw.ground != null ? gw.ground : -1, gk = popFor;
    var gi = document.createElement("input"), gv = mk("span"), gl2 = mk("label");
    gi.type = "range"; gi.min = 0; gi.max = 100; gi.value = gl >= 0 ? gl : (S.bg ? 75 : 0); gv.textContent = gi.value + "%";
    gi.oninput = function () { gv.textContent = gi.value + "%"; }; gi.onchange = function () { setting("win." + gk + ".ground", parseInt(gi.value, 10)); };
    gl2.appendChild(mk("span", null, t("menu.k.bg"))); gl2.appendChild(gi); gl2.appendChild(gv); p.appendChild(gl2);
    var pg = mk("label"), pb = mk("button", persOn(popFor) ? "on" : "", t("ed.ground")), pk = popFor;
    pb.onclick = function () { var on = !persOn(pk); setting("win." + pk + ".persp", on); S.win = S.win || {}; S.win[pk] = S.win[pk] || {}; S.win[pk].persp = on; pb.classList.toggle("on", on); };
    pg.appendChild(mk("span", null, t("ed.persp"))); pg.appendChild(pb); p.appendChild(pg);
    var same = mk("button", "same", t("ed.same")), pk2 = popFor; same.title = t("tip.ed.same");
    same.onclick = function () { ["size", "opacity", "ground"].forEach(function (k) { setting("win." + pk2 + "." + k, -1); }); };
    p.appendChild(same);
    p.appendChild(mk("small", null, t("ed.all")));
    return p;
  }

  // where each box is drawn: where the window is, except for a window that was just dropped: its box stays where it was dropped until the window's
  // new place has been reported (the window is repainted a moment after the drop, a grab in that moment must not start from the old place)
  function placeOf(w) {
    var x = w.x * K(), y = w.y * K(), p = pending[w.key];
    if (p) {
      if (w.x !== p.px || w.y !== p.py || Date.now() - p.t > 4000) delete pending[w.key]; else { x = p.x; y = p.y; }
    }
    return [x, y];
  }

  function build() {
    if (!rects) return;
    var key = JSON.stringify(rects.wins.map(function (w) { var q = placeOf(w); return [w.key, q[0], q[1], w.w, w.h, w.colour, !!free[w.key]]; })) + (popFor || "") + K();
    if (key === built) return;
    built = key; stage.innerHTML = ""; bars.innerHTML = ""; guideLayer(null);
    // overlapping windows: the boxes are stacked in the same order as the windows on the game (the app sends them bottom to top: the player's To front /
    // To back first, then the smaller one on top), so what you see is what you grab; a box being dragged is raised
    var zOf = {};
    rects.wins.forEach(function (w, i) { zOf[w.key] = 10 + i; });
    rects.wins.forEach(function (w, wi) {
      var q = placeOf(w);
      var box = mk("div", "box" + (free[w.key] ? " free" : "")), x = q[0], y = q[1], bw = w.w * K(), bh = w.h * K();
      var above = y > 42;
      box.style.cssText = "left:" + x + "px;top:" + y + "px;width:" + bw + "px;height:" + bh + "px;z-index:" + (zOf[w.key] || 10);
      var bar = mk("div", "bar");
      bar.style.left = x + "px"; bar.style.zIndex = 1000 + wi;
      if (above) bar.style.bottom = (innerHeight - y + 6) + "px"; else bar.style.top = (y + bh + 6) + "px";
      bar.appendChild(mk("b", null, NAMES[w.key] || w.key));
      var lk = mk("button", free[w.key] ? "on" : "", free[w.key] ? t("ed.unlocked") : t("ed.locked")); // (the button says the state the window is in now)
      lk.onclick = function (e) { e.stopPropagation(); free[w.key] = !free[w.key]; if (!free[w.key]) op("editor.lock", { key: w.key }); built = ""; build(); raise(); };
      bar.appendChild(lk);
      var col = document.createElement("input"); col.type = "color"; col.value = w.colour || DEFAULT; col.title = t("ed.colour");
      var ok = mk("button", null, t("col.apply")), df = mk("button", null, t("col.default")); ok.hidden = true;
      col.oninput = function () { ok.hidden = false; pause = Date.now() + 8000; };
      ok.onclick = function () { setting("win." + w.key + ".colour", col.value); ok.hidden = true; pause = 0; };
      df.onclick = function () { col.value = DEFAULT; setting("win." + w.key + ".colour", DEFAULT); ok.hidden = true; pause = 0; };
      bar.appendChild(col); bar.appendChild(ok); bar.appendChild(df);
      var cog = mk("button", popFor === w.key ? "on" : "", "⚙");
      cog.title = t("ed.more"); cog.onclick = function (e) { e.stopPropagation(); popFor = popFor === w.key ? null : w.key; built = ""; build(); raise(); };
      bar.appendChild(cog);
      bars.appendChild(bar);
      var p = null;
      if (popFor === w.key) { p = popup(); p.style.left = x + "px"; p.style.zIndex = 3000; if (above) p.style.bottom = (innerHeight - y + 48) + "px"; else p.style.top = (y + bh + 48) + "px"; bars.appendChild(p); }
      function send(d, last) {
        // only the dashed box follows the mouse; the window itself takes its new place when the mouse is let go (one repaint, no cost while dragging)
        var now = Date.now(); if (!last && now - lastSend < 50) return; lastSend = now;
        op("drag_to", { key: d.key, dx: d.dx / K(), dy: d.dy / K(), gw: rects.gw, gh: rects.gh });
      }
      function finish(e) {
        if (!drag || drag.box !== box) return;
        var d = drag; drag = null; box.classList.remove("drag"); hint.textContent = t("ed.hint");
        try { box.releasePointerCapture(e.pointerId); } catch (x) {}
        // snapping: a window that ends near the edge guides or the centre line settles on them
        var W = rects.gw * K(), H = rects.gh * K(), L = d.x + d.dx, T = d.y + d.dy, R = L + d.w, B = T + d.h, sx = 0, sy = 0, TH = 16;
        [[L, W * MARGIN], [R, W - W * MARGIN], [L + d.w / 2, W / 2]].forEach(function (c) { var diff = c[1] - c[0]; if (Math.abs(diff) < TH && (!sx || Math.abs(diff) < Math.abs(sx))) sx = diff; });
        [[T, H * MARGIN], [B, H - H * MARGIN]].forEach(function (c) { var diff = c[1] - c[0]; if (Math.abs(diff) < TH && (!sy || Math.abs(diff) < Math.abs(sy))) sy = diff; });
        d.dx += sx; d.dy += sy;
        // the box now STAYS where it was dropped: its own place is moved there and the drag's transform dropped, so a grab straight after starts from here
        // (the transform used to be overwritten by the next grab, which sent the box back to where it was before the first move)
        x = d.x + d.dx; y = d.y + d.dy; box.style.left = x + "px"; box.style.top = y + "px"; box.style.transform = "";
        if (d.dx || d.dy) {
          send(d, true);
          var cur = rects && rects.wins.filter(function (r) { return r.key === d.key; })[0];
          if (cur) pending[d.key] = { px: cur.x, py: cur.y, x: d.x + d.dx, y: d.y + d.dy, t: Date.now() };
        }
        pause = Date.now() + 500; built = ""; guideLayer(null); raise();
      }
      box.onpointerdown = function (e) {
        if (!free[w.key] || e.target.closest(".bar,.pop")) return;
        drag = { key: w.key, box: box, sx: e.clientX, sy: e.clientY, x: x, y: y, w: bw, h: bh, dx: 0, dy: 0 }; box.classList.add("drag"); box.style.zIndex = 500; box.setPointerCapture(e.pointerId);
        drag.along = [bar, p].filter(Boolean);
        op("drag_begin", { key: w.key });
      };
      box.onpointermove = function (e) {
        if (!drag || drag.box !== box) return;
        var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy; box.style.transform = "translate(" + dx + "px," + dy + "px)";
        drag.along.forEach(function (a) { a.style.transform = "translate(" + dx + "px," + dy + "px)"; });
        var W = rects.gw * K(), cx = drag.x + dx + drag.w / 2, mid = Math.abs(cx - W / 2) < W * BAND; drag.dx = dx; drag.dy = dy;
        guideLayer(mid ? "mid" : cx < W / 2 ? "left" : "right");
        hint.textContent = t(mid ? "ed.flat" : cx < W / 2 ? "ed.left" : "ed.right");
      };
      box.onpointerup = finish; box.onpointercancel = finish; box.onlostpointercapture = finish;
      stage.appendChild(box);
    });
  }

  function poll() {
    // (nothing is rebuilt while a mouse button is down: a box rebuilt between the press and the release ate the click)
    if (!invoke || drag || document.visibilityState === "hidden" || Date.now() < pause || (down && Date.now() - downT < 15000)) return;
    Promise.all([invoke("editor_rects"), invoke("combat_settings")]).then(function (r) { if (r[0] && r[0].wins) { rects = r[0]; } S = r[1] || S; build(); }).catch(function () {});
  }
  // any click on the layer puts the menu back on top of it (before, only some buttons did), and no rebuild happens under the mouse
  addEventListener("pointerdown", function () { down = true; downT = Date.now(); if (Date.now() - lastRaise > 150) { lastRaise = Date.now(); raise(); } }, true);
  addEventListener("pointerup", function () { down = false; }, true);
  addEventListener("pointercancel", function () { down = false; }, true);
  bars.addEventListener("input", function () { pause = Math.max(pause, Date.now() + 1500); }); // (a slider or the colour square is in use)
  // a sign of life for the watchdog in the app (it closes Edit HUD when this stops), also while a box is being dragged
  function ping() { if (invoke) invoke("editor_ping").catch(function () {}); }
  setInterval(ping, 1000); ping();
  addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); invoke && invoke("menu_close"); } });
  addEventListener("contextmenu", function (e) { e.preventDefault(); });
  load("en").then(function (d) { en = d; return lang === "en" ? {} : load(lang); }).then(function (d) { dict = d; hint.textContent = t("ed.hint"); setInterval(poll, 200); poll(); });
})();
