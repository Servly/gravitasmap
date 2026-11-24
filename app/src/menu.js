"use strict";
// The GRAVITAS menu over the game (Ctrl+Shift+G): a quick-access page to the SAME controls as the app's window (combatui.js builds both).
(function () {
  var T = window.__TAURI__ || {};
  var invoke = T.core && T.core.invoke;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var lang = "en", dict = {}, en = {};
  try { var v = localStorage.getItem("gv_lang"); if (v) lang = JSON.parse(v); } catch (e) {}

  function load(code) { return fetch("lang/" + code + ".json").then(function (r) { return r.json(); }).catch(function () { return {}; }); }
  function t(key, vars) {
    var s = dict[key]; if (s == null) s = en[key]; if (s == null) s = key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return s;
  }
  function fill(id, names) { var el = document.getElementById(id); el.innerHTML = ""; GVC.mount(el, names); }
  function build() {
    GVC.init({ t: t, lang: function () { return lang; } });
    GVC.reset();
    fill("p-main", ["modes", "profiles", "tests"]);
    fill("p-map", ["mapopen", "mapov"]);
    fill("p-combat", ["actions", "wing", "windows", "profiles", "look", "targets", "behave", "claims"]);
    fill("p-debrief", ["dbmode", "dbwin"]);
    fill("p-pvp", ["pvpmode", "pvpwin"]);
    fill("p-thargoid", ["thwin", "threc"]); fill("p-foot", [["soon", "nav.foot"]]);
    fill("p-keys", ["kbmain", "kbmap", "kbcombat"]);
  }
  var menuKey = "";
  function applyLang() {
    document.documentElement.lang = lang.slice(0, 2);
    $$("[data-i18n]").forEach(function (e) { e.textContent = t(e.dataset.i18n, { key: menuKey || "…" }); });
    $$("[data-i18n-title]").forEach(function (e) { e.title = t(e.dataset.i18nTitle); });
    build();
    if (invoke && !menuKey) invoke("hotkeys_get").then(function (a) { (a || []).forEach(function (k) { if (k[0] === "menu") { menuKey = k[1]; $$("[data-i18n='menu.hint']").forEach(function (e) { e.textContent = t("menu.hint", { key: menuKey }); }); } }); });
  }

  // the real logo, still (no animation: the menu is over a game)
  fetch("assets/gravitas-logo.svg").then(function (r) { return r.text(); }).then(function (svg) {
    $("#lg").innerHTML = svg.replace(/<animateMotion[\s\S]*?<\/animateMotion>/, "").replace('<circle r="3" fill="#ff6ad5">', '<circle cx="49" cy="19" r="3" fill="#ff6ad5">');
  }).catch(function () {});

  // collapse: only the title bar stays (the game is seen), open again with the same button
  $("#mMin").onclick = function () { var on = !$("#win").classList.contains("mini"); $("#win").classList.toggle("mini", on); invoke && invoke("menu_collapse", { on: on }); };
  $("#mClose").onclick = function () { invoke && invoke("menu_close"); };
  $$(".tab").forEach(function (b) {
    b.onclick = function () { $$(".tab").forEach(function (x) { x.classList.toggle("on", x === b); }); $$(".pane").forEach(function (p) { p.classList.toggle("on", p.id === "p-" + b.dataset.tab); }); };
  });
  addEventListener("keydown", function (e) {
    var k = (e.key || "").toLowerCase();
    if (e.key === "Escape") { e.preventDefault(); invoke && invoke("menu_close"); }
  });
  addEventListener("contextmenu", function (e) { e.preventDefault(); });
  // Edit HUD: the bars on the windows, over the game
  var me = $("#mEdit"); function meSet(on) { me.classList.toggle("on", !!on); }
  me.onclick = function () { var on = !me.classList.contains("on"); meSet(on); invoke && invoke("edit_hud", { on: on }); };
  // the button follows the real state (the menu turns Edit HUD off by itself when it closes)
  function syncEdit() { if (invoke && !document.hidden) invoke("edit_hud_state").then(meSet).catch(function () {}); }
  syncEdit(); setInterval(syncEdit, 400); document.addEventListener("visibilitychange", syncEdit);
  // how see-through the menu is: its own slider in the title bar, kept
  function ma(v) { document.documentElement.style.setProperty("--ma", (v / 100).toFixed(2)); }
  var mv = 100; try { mv = parseInt(localStorage.getItem("gv_menu_alpha") || "100", 10) || 100; } catch (e) {}
  ma(mv); $("#mAlpha").value = mv;
  $("#mAlpha").oninput = function () { ma(this.value); try { localStorage.setItem("gv_menu_alpha", this.value); } catch (e) {} };

  load("en").then(function (d) { en = d; return lang === "en" ? {} : load(lang); }).then(function (d) { dict = d; applyLang(); });
})();
