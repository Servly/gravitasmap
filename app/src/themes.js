"use strict";
/* GRAVITAS colour themes. Loaded first in <head> (index.html and menu.html), so the saved theme is on the page before the first paint.
   The default theme ("gravitas") is exactly the colours of style.css: nothing is set on the page and canvas colours are returned unchanged.
   Every other theme is the default palette turned to another hue (HSL maths), with the accent colour set by hand, then checked for contrast:
   body text and the dim text 4.5:1 (7:1 in Graphite), the accent and cyan text colours 4.5:1 on a card, the dark text on the gradient buttons 4.5:1.
   Saved: settings.json key "theme" through theme_get / theme_set (appprefs.rs, so it is exported and imported with the other settings) and
   a copy in localStorage "gv_theme" that this file reads synchronously at start (no flash). The overlay windows in the game are not touched. */
(function () {
  var LS = "gv_theme";
  var T = window.__TAURI__ || {}, invoke = T.core && T.core.invoke;
  var root = document.documentElement;

  /* ---------- the default palette (style.css :root): css variable, default value ---------- */
  var BASE = {
    bg: "#04030a", text: "#e9ddff", dim: "#9d8cc0", faint: "#6f6190", cyan: "#6ae8ff", violet: "#a77bff", vi2: "#b46bff",
    "line-rgb": "190,120,255", "glass-rgb": "22,14,40", win1: "#150d28", win2: "#070511", "win1-rgb": "21,13,40", "win2-rgb": "7,5,17",
    "tab-rgb": "14,9,32", tab: "#0e0920", opt: "#1a1030", toast: "#221440", ico1: "#2a1748", ico2: "#0b0716", "vs-rgb": "14,9,28", "vs-bg": "#07050f",
    fb1: "#1d1236", fb2: "#150c2b"
  };
  var ACC = "#ff6ad5", NAMES = ["gravitas", "game", "cold", "green", "red", "graphite"];
  /* the themes: acc = accent colour, hue = the hue of the dark tones and lines (the default's is 270), sat = how colourful they are (1 = as the default),
     sec = the hue the cyan family (links, key names, highlights) moves to, hc = high contrast */
  var PRESETS = {
    game:     { acc: "#ff7100", hue: 27,  sat: .85, sec: 205 },    // the orange of the game's own interface (the overlays' default window colour)
    cold:     { acc: "#4fb6ff", hue: 212, sat: .9,  sec: 150 },
    green:    { acc: "#5ff0a0", hue: 150, sat: .7,  sec: 45 },
    red:      { acc: "#ff4a3a", hue: 3,   sat: .85, sec: 38 },
    graphite: { acc: "#ffffff", hue: 0,   sat: 0,   sec: 0, hc: true }
  };

  /* ---------- colour maths ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex2rgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function rgb2hex(c) { return "#" + c.map(function (v) { var s = Math.round(clamp(v, 0, 255)).toString(16); return s.length < 2 ? "0" + s : s; }).join(""); }
  function rgb2hsl(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
    if (d) {
      s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
    }
    return [h, s, l];
  }
  function hsl2rgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    if (!s) return [l * 255, l * 255, l * 255];
    var q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    function f(t) { t = (t + 1) % 1; return 255 * (t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p); }
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
  }
  function lum(c) { var a = c.map(function (v) { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * a[0] + .7152 * a[1] + .0722 * a[2]; }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
  function mixRGB(top, a, bottom) { return [0, 1, 2].map(function (i) { return top[i] * a + bottom[i] * (1 - a); }); }

  /* a theme spec -> the numbers the colour transform needs */
  function spec(th) {
    if (!th || th.id === "gravitas") return null;
    var p = PRESETS[th.id], o;
    if (p) o = { acc: p.acc, d: p.hue - 270, sat: p.sat, sec: p.sec, hc: !!p.hc, id: th.id };
    else if (th.id === "custom" && /^#[0-9a-fA-F]{6}$/.test(th.c || "")) {
      var hsl = rgb2hsl(hex2rgb(th.c)), sm = Math.min(1, hsl[1] * 1.1);
      o = { acc: th.c.toLowerCase(), d: hsl[0] - 270, sat: sm < .25 ? sm : Math.max(.6, sm), sec: (hsl[0] + 160) % 360, hc: false, id: "custom" };
    } else return null;
    return o;
  }
  /* one colour of the default palette turned into the theme's: neutrals keep their hue, the cyan family goes to the theme's secondary hue, the rest turns with the theme */
  function turn(c, o) {
    var hsl = rgb2hsl(c), h = hsl[0], s = hsl[1], l = hsl[2];
    if (s > .05) h = (h >= 165 && h <= 215) ? o.sec + (h - 190) : h + o.d;
    return hsl2rgb(h, s * o.sat, l);
  }

  /* ---------- the tokens of a theme ---------- */
  var cache = null;      // { key, vars, adjusted }
  function build(th) {
    var o = spec(th); if (!o) return null;
    var v = {}, rgb = {}, k;
    for (k in BASE) { var src = BASE[k].indexOf(",") >= 0 ? BASE[k].split(",").map(Number) : hex2rgb(BASE[k]); rgb[k] = turn(src, o); }
    var card = mixRGB(rgb["glass-rgb"], .72, rgb.win1), dark = hex2rgb("#0b0618"), adj = false;
    function fix(c, bg, min, up) {          // lighten (up) until the contrast on bg is enough
      var h = rgb2hsl(c), n = 0, out = c;
      while (contrast(out, bg) < min && n++ < 60) { h[2] = clamp(h[2] + (up ? .015 : -.015), 0, 1); out = hsl2rgb(h[0], h[1], h[2]); }
      if (out !== c) adj = true; return out;
    }
    var min = o.hc ? 7 : 4.5;
    var text = o.hc ? [255, 255, 255] : rgb.text;
    text = fix(text, card, min, true);
    var dim = fix(rgb.dim, card, min, true), faint = fix(rgb.faint, card, 3, true);
    var acc = fix(hex2rgb(o.acc), card, 4.5, true), cy = fix(rgb.cyan, card, 4.5, true);
    var vi = fix(rgb.violet, card, 3, true), vi2 = fix(rgb.vi2, card, 3, true);
    // the gradient buttons (cyan to violet) carry dark text: it must read on both ends
    cy = fix(cy, dark, 4.5, true); vi = fix(vi, dark, 4.5, true); vi2 = fix(vi2, dark, 4.5, true);
    function trip(c) { return Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]); }
    v["--bg"] = rgb2hex(rgb.bg); v["--text"] = rgb2hex(text); v["--dim"] = rgb2hex(dim); v["--faint"] = rgb2hex(faint);
    v["--accent"] = rgb2hex(acc); v["--acc-rgb"] = trip(acc); v["--cyan"] = rgb2hex(cy); v["--cy-rgb"] = trip(cy);
    v["--violet"] = rgb2hex(vi); v["--vi-rgb"] = trip(vi); v["--vi2"] = rgb2hex(vi2);
    ["glass-rgb", "win1-rgb", "win2-rgb", "tab-rgb", "vs-rgb", "line-rgb"].forEach(function (n) { v["--" + n] = trip(rgb[n]); });
    ["win1", "win2", "tab", "opt", "toast", "ico1", "ico2", "vs-bg", "fb1", "fb2"].forEach(function (n) { v["--" + n] = rgb2hex(rgb[n]); });
    if (o.hc) { v["--line"] = "rgba(" + trip(text) + ",.42)"; v["--line-2"] = "rgba(" + trip(text) + ",.7)"; }
    return { vars: v, adjusted: adj, ratio: Math.round(contrast(text, card) * 10) / 10, o: o };
  }

  /* ---------- apply ---------- */
  var cur = { id: "gravitas" }, built = null, rev = 0, tintMemo = {};
  var NAMES_ALL = null;
  function allVarNames() {
    if (!NAMES_ALL) { var n = ["--line", "--line-2"]; var b = build({ id: "game" }); for (var k in b.vars) n.push(k); NAMES_ALL = n; }
    return NAMES_ALL;
  }
  function clean(th) {
    if (!th || typeof th !== "object") return { id: "gravitas" };
    if (th.id === "custom") return /^#[0-9a-fA-F]{6}$/.test(th.c || "") ? { id: "custom", c: th.c.toLowerCase() } : { id: "gravitas" };
    return NAMES.indexOf(th.id) >= 0 ? { id: th.id } : { id: "gravitas" };
  }
  function apply(th, quiet) {
    cur = clean(th); built = build(cur); rev++; tintMemo = {};
    var st = root.style;
    if (NAMES_ALL || built) allVarNames().forEach(function (n) { st.removeProperty(n); });
    if (built) for (var k in built.vars) st.setProperty(k, built.vars[k]);
    root.setAttribute("data-theme", cur.id);
    if (!quiet) { try { window.dispatchEvent(new Event("gv-theme")); } catch (e) {} }
  }
  function same(a, b) { return JSON.stringify(clean(a)) === JSON.stringify(clean(b)); }
  function remember(th) { try { localStorage.setItem(LS, JSON.stringify(clean(th))); } catch (e) {} }

  /* a colour string of the default look ("#rrggbb" or "rgba(r,g,b,a)") as the current theme shows it; the default returns it unchanged */
  function tint(s) {
    if (!built) return s;
    var m = tintMemo[s]; if (m) return m;
    var out = s, o = built.o, a = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s);
    if (a) { var c = turn([+a[1], +a[2], +a[3]], o); out = "rgba(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + "," + (a[4] == null ? 1 : a[4]) + ")"; }
    else if (/^#[0-9a-fA-F]{6}$/.test(s)) out = rgb2hex(turn(hex2rgb(s), o));
    return tintMemo[s] = out;
  }

  /* ---------- start: the copy in localStorage, synchronously ---------- */
  var first = null; try { first = JSON.parse(localStorage.getItem(LS) || "null"); } catch (e) {}
  apply(first, true);

  /* the same theme in the other window (the menu over the game and the app window share localStorage) */
  addEventListener("storage", function (e) {
    if (e.key !== LS) return; var n = null; try { n = JSON.parse(e.newValue || "null"); } catch (x) {}
    if (!same(n, cur)) apply(n);
  });
  /* and the saved one from settings.json (an import, or another copy of the app data): it wins when it differs */
  if (invoke) {
    var sync = function () { invoke("theme_get").then(function (t) { if (t && !same(t, cur)) { apply(t); remember(t); } }).catch(function () {}); };
    setTimeout(sync, 0); addEventListener("focus", sync);
  }

  window.GVTH = {
    PRESETS: PRESETS, NAMES: NAMES,
    get: function () { return cur; },
    rev: function () { return rev; },
    info: function () { return built ? { adjusted: built.adjusted, ratio: built.ratio } : { adjusted: false, ratio: 0 }; },
    tint: tint,
    /** a preview of a theme's main tones, without applying it: { bg1, bg2, text, accent, cyan, card } (the default's are the style.css ones) */
    preview: function (th) {
      var b = build(clean(th));
      if (!b) return { bg1: BASE.win1, bg2: BASE.win2, text: BASE.text, accent: ACC, cyan: BASE.cyan, card: "rgba(22,14,40,.72)" };
      var v = b.vars; return { bg1: v["--win1"], bg2: v["--win2"], text: v["--text"], accent: v["--accent"], cyan: v["--cyan"], card: "rgba(" + v["--glass-rgb"] + ",.72)" };
    },
    /** choose a theme: applies it at once (all windows), keeps it in settings.json */
    set: function (th, save) {
      th = clean(th); apply(th); remember(th);
      if (save !== false && invoke) invoke("theme_set", { value: th }).catch(function () {});
    },
    /** apply while a colour picker is dragged: no saving */
    live: function (th) { apply(th); remember(th); }
  };
})();
