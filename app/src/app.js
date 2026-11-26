"use strict";
// GRAVITAS app v0.1: the window. The Rust side reads the Journal and sends "journal-state"; this file only shows it.
(function () {
  var T = window.__TAURI__ || {};
  var invoke = T.core && T.core.invoke;
  var listen = T.event && T.event.listen;
  var win = T.window && T.window.getCurrentWindow ? T.window.getCurrentWindow() : null;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion:reduce)").matches;
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem("gv_" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("gv_" + k, JSON.stringify(v)); } catch (e) {} }
  };
  var CODES = ["en", "de", "es", "fr", "pt-br", "ru"];
  var dict = {}, en = {}, lang = store.get("lang", "en"), state = null, cur = "hub", version = "0.1.0";

  /* ---------- languages: lang/<code>.json, English fills any gap ---------- */
  function load(code) {
    return fetch("lang/" + code + ".json").then(function (r) { return r.json(); }).catch(function () { return {}; });
  }
  function t(key, vars) {
    var s = dict[key]; if (s == null) s = en[key]; if (s == null) s = key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return s;
  }
  function applyLang() {
    document.documentElement.lang = lang.slice(0, 2);
    $$("[data-i18n]").forEach(function (e) { e.textContent = t(e.dataset.i18n); });
    $$("[data-i18n-title]").forEach(function (e) { e.title = t(e.dataset.i18nTitle); });
    $("#ribbon").textContent = t("ribbon") + " \u00b7 v" + version;
    $("#ver").textContent = t("about.version", { v: version });
    renderHello(); renderModes(); renderLangs(); renderLog(); renderChip(); renderSyncCard(); renderAbout(); buildPages(); var uc = $("#updCard"); if (uc) { uc._built = false; renderUpdates(); }
    requestAnimationFrame(moveInd);
  }
  function setLang(code) {
    lang = code; store.set("lang", code); if (invoke) invoke("set_hud_language", { code: code });
    return (code === "en" ? Promise.resolve({}) : load(code)).then(function (d) { dict = d; applyLang(); });
  }

  /* ---------- logo (the real file, with its orbiting dot) ---------- */
  fetch("assets/gravitas-logo.svg").then(function (r) { return r.text(); }).then(function (svg) {
    ["lg", "lgBig"].forEach(function (id, i) {
      var e = document.getElementById(id);
      // the site's logo has a dot that orbits (SVG animateMotion). Measured on the real app: that alone kept the GPU process at one
      // full core, so here the dot stands still (v0.1: performance first, the app runs next to a game)
      if (e) e.innerHTML = svg.replace(/<animateMotion[\s\S]*?<\/animateMotion>/, "").replace('<circle r="3" fill="#ff6ad5">', '<circle cx="49" cy="19" r="3" fill="#ff6ad5">').replace(/id="(gl\w+)"/g, 'id="$1' + i + '"').replace(/url\(#(gl\w+)\)/g, 'url(#$1' + i + ')').replace(/href="#(glorb)"/g, 'href="#$1' + i + '"');
    });
  }).catch(function () {});

  var TH = window.GVTH ? GVTH.tint : function (c) { return c; };   // colour themes (themes.js)
  /* ---------- starfield: drawn once, never animated (the app runs next to a game) ---------- */
  function stars() {
    // painted once into ONE opaque background image of the window: a second full-window layer that has to be blended again on every
    // frame kept the GPU process busy (measured), this costs nothing after the first paint
    var cv = document.createElement("canvas"), cx = cv.getContext("2d"), d = 1, W = innerWidth, H = innerHeight;
    cv.width = W * d; cv.height = H * d; cx.setTransform(d, 0, 0, d, 0, 0);
    var n = Math.round(W * H / 9000);
    for (var i = 0; i < n; i++) {
      var c = Math.random(); cx.globalAlpha = Math.random() * .55 + .12;
      cx.fillStyle = c < .16 ? TH("#ff9ae6") : c < .3 ? TH("#9eeeff") : "#fff";
      cx.beginPath(); cx.arc(Math.random() * W, Math.random() * H, Math.random() * 1.1 + .2, 0, 6.283); cx.fill();
    }
    var cs = getComputedStyle(document.documentElement);   // the theme's tones (themes.js); the default gives the same colours as before
    $("#win").style.backgroundImage = "url(" + cv.toDataURL("image/png") + "), linear-gradient(160deg," + (cs.getPropertyValue("--win1").trim() || "#150d28") + "," + (cs.getPropertyValue("--win2").trim() || "#070511") + ")";
  }
  addEventListener("gv-theme", function () { stars(); });
  stars(); var rz; addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(function () { stars(); moveInd(); }, 150); });

  /* ---------- nothing moves while the window is hidden or minimized ---------- */
  document.addEventListener("visibilitychange", function () { document.body.classList.toggle("idle", document.hidden); });

  /* ---------- window buttons ---------- */
  if (win) {
    $("#wMin").onclick = function () { if (invoke) invoke("hide_to_tray"); else win.minimize(); };
    $("#wMax").onclick = function () { win.toggleMaximize(); };
    $("#wClose").onclick = function () { win.close(); };
  }
  function openUrl(u) {
    var o = T.opener && T.opener.openUrl;
    if (o) o(u); else window.open(u, "_blank");
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest("a[data-ext]");
    if (a) { e.preventDefault(); openUrl(a.href); }
  });

  /* ---------- toast ---------- */
  function toast(msg) {
    var x = document.createElement("div"); x.className = "toast"; x.textContent = msg;
    $("#toasts").appendChild(x); setTimeout(function () { x.remove(); }, 3700);
  }

  /* ---------- navigation ---------- */
  var VIEWS = ["hub", "map", "combat", "thargoid", "debrief", "pvp", "foot", "bgs", "keys", "updates", "prefs", "about"];
  function moveInd() {
    var b = $(".nav.on"), r = $("#rail"), p = $("#pill"); if (!b) return;
    var br = b.getBoundingClientRect(), rr = r.getBoundingClientRect();
    p.style.width = br.width + "px"; p.style.height = br.height + "px";
    p.style.transform = "translate(" + (br.left - rr.left) + "px," + (br.top - rr.top) + "px)";
  }
  function go(v) {
    if (v === "keys") { v = "prefs"; var kt = document.querySelector('.tabs[data-scope="prefs"] .tab[data-tab="keys"]'); if (kt) kt.click(); } // (Key Bindings live in Settings now)
    if (VIEWS.indexOf(v) < 0) v = "hub"; cur = v;
    $$(".nav").forEach(function (b) { var on = b.dataset.view === v; b.classList.toggle("on", on); if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    $$(".view").forEach(function (s) { s.classList.toggle("on", s.id === "v-" + v); });
    moveInd();
    if (v === "hub") devPoll(true);
  }
  $$(".nav").forEach(function (b) { b.addEventListener("click", function () { go(b.dataset.view); }); });
  // any button with data-go jumps to that page (the Key Bindings button on the mode pages)
  document.addEventListener("click", function (e) { var g = e.target.closest && e.target.closest("[data-go]"); if (g) go(g.dataset.go); });

  /* ---------- modes ---------- */
  var ICON = {
    combat: '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="1.2"/>',
    map: '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-24 12 12)"/>',
    collisions: '<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/>',
    sono: '<path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4"/>',
    lenses: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.4-4.4"/>',
    thargoid: '<path d="M12 2l9 5v10l-9 5-9-5V7z"/><circle cx="12" cy="12" r="3"/>',
    debrief: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6 15l3-4 3 3 3-5 3 4"/>',
    pvp: '<path d="M4 20L14 10M14 4h6v6M20 20L10 10M10 4H4v6"/>',
    foot: '<ellipse cx="8" cy="8" rx="2.6" ry="4.2"/><ellipse cx="16" cy="16" rx="2.6" ry="4.2"/>',
    bgs: '<path d="M3 20V9M9 20V4M15 20v-8M21 20V7"/><path d="M2 20h20"/>'
  };
  // what each one is today: "next" (the very next mode to come to the app), "ready" (works in the app now: the map and its tools open in the GRAVITAS MAP window), "planned"
  var MODES = [["map", "ready"], ["combat", "plain"], ["thargoid", "plain"], ["debrief", "plain"], ["pvp", "preview"], ["foot", "planned"], ["bgs", "preview"], ["collisions", "ready"], ["sono", "ready"], ["lenses", "ready"]];
  var TOOL = { collisions: "coll", sono: "sono", lenses: "lenses" };   // the tools of the GRAVITAS MAP window
  var PAGE = { combat: "combat", map: "map", thargoid: "thargoid", debrief: "debrief", pvp: "pvp", foot: "foot", bgs: "bgs" };
  function renderModes() {
    var g = $("#modes"); g.innerHTML = "";
    MODES.forEach(function (m, i) {
      var id = m[0], kind = m[1], name = t("mode." + id + ".name");
      var a = document.createElement("article");
      a.className = "mode rise" + (kind === "planned" ? " planned" : ""); a.style.setProperty("--i", i + 1); a.tabIndex = 0; a.title = t("tip.mode." + id);
      a.innerHTML = '<div class="row"><div class="ico"><svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[id] + '</svg></div>' + (kind === "plain" ? "" : '<span class="tag ' + (kind === "preview" ? "next" : kind) + '">' + t("tag." + kind) + "</span>") + '</div>' +
        '<div><h3></h3><p></p></div>';
      $("h3", a).textContent = name; $("p", a).textContent = t("mode." + id + ".desc");
      a.addEventListener("pointermove", function (e) { var r = a.getBoundingClientRect(); a.style.setProperty("--mx", (e.clientX - r.left) + "px"); a.style.setProperty("--my", (e.clientY - r.top) + "px"); });
      function act() {
        if (PAGE[id]) go(PAGE[id]);                      // Combat, Map, Thargoid and On Foot have their own pages
        else if (kind === "ready") { toast(t("toast.tool", { name: name })); if (invoke) invoke("map_open_site", { mode: TOOL[id] || null }); }
        else if (kind === "next") toast(t("toast.next", { name: name }));
        else toast(t("toast.planned", { name: name }));
      }
      a.addEventListener("click", act);
      a.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } });
      g.appendChild(a);
    });
  }

  /* ---------- hub header, chip, Journal list, Live ---------- */
  function renderHello() {
    var n = state && state.commander;
    $("#hello").textContent = n ? t("hub.hello", { name: n }) : t("hub.hello.anon");
  }
  function renderChip() {
    var on = state && state.game_running, none = state && !state.folder, parts = [];
    parts.push(none ? t("status.nofolder") : on ? t("status.running") : t("status.idle"));
    if (state && state.system) parts.push(t("status.in", { system: state.system }));
    $("#chipText").textContent = parts.join(" · ");
    $("#dot").className = "dot" + (on ? " on" : "");
    renderSyncCard();
  }
  /* ---------- the Sync with the game card (Modes page): the map follows the jumps by itself, the app hands it the Journal ---------- */
  function renderSyncCard() {
    var box = $("#hub-sync"); if (!box) return;
    var on = !!(state && state.game_running), sys = state && state.system;
    var msg = on ? (sys ? t("hub.sync.on", { system: sys }) : t("hub.sync.on2")) : t("hub.sync.off");
    if (!box._built) {
      box._built = true; box.innerHTML = "";
      var c = document.createElement("div"); c.className = "card sync rise"; c.style.setProperty("--i", 8);
      c.innerHTML = '<div class="syncrow"><span class="dot" id="syncDot"></span><div class="syncbody"><h2></h2><p class="note" id="syncNote"></p><p class="syncst" id="syncSt"></p></div><button class="btn go map" id="syncBtn"></button></div><div class="devbox" id="devBox"></div>';
      box.appendChild(c);
      $("#syncBtn").onclick = function () { if (invoke) invoke("map_open_site", { mode: null }); };
    }
    $("h2", box).textContent = t("hub.sync.h"); $("#syncNote").textContent = t("hub.sync.note"); $("#syncSt").textContent = msg;
    $("#syncDot").className = "dot" + (on ? " on" : ""); $("#syncBtn").textContent = t("map.open.btn"); $("#syncBtn").title = t("tip.hub.sync");
    renderDevices();
  }
  /* ---------- Phones and tablets: the same list as in the GRAVITAS MAP window and on the site. The server holds it, the app asks (pair_status), only while this page shows ---------- */
  var dev = { st: null, busy: false, goneAt: 0, link: null, linkT: 0 };
  function devBtn(label, tip, cls, fn) { var b = document.createElement("button"); b.className = "btn " + cls; b.textContent = label; b.title = t(tip); b.onclick = fn; return b; }
  function renderDevices() {
    var box = $("#devBox"); if (!box) return;
    var s = dev.st || { state: "none" }, ok = s.state === "ok", list = ok ? s.devices || [] : [];
    box.textContent = "";
    var h = document.createElement("h3"); h.textContent = t("dev.h"); box.appendChild(h);
    var p = document.createElement("p"); p.className = "note"; p.textContent = t("dev.note"); box.appendChild(p);
    var line = document.createElement("p"); line.className = "syncst";
    var a = list.filter(function (d) { return d.awake; }).length;
    line.textContent = ok ? (list.length ? t("dev.count", { a: a, s: list.length - a, max: s.max || 4 }) : t("dev.count0", { max: s.max || 4 })) :
      s.state === "error" || s.state === "busy" ? t("dev.err") : s.state === "gone" || Date.now() - dev.goneAt < 20000 ? t("dev.gone") : t("dev.none");
    box.appendChild(line);
    if (ok && !s.hostOn) { var nh = document.createElement("p"); nh.className = "note"; nh.textContent = t("dev.nohost"); box.appendChild(nh); }
    if (list.length) {
      var ul = document.createElement("ul"); ul.className = "devlist"; ul.title = t("tip.dev.list");
      list.forEach(function (d) {
        var li = document.createElement("li"); li.className = d.awake ? "" : "zz";
        var n = document.createElement("span"); n.className = "dn"; n.textContent = d.n || "?"; li.appendChild(n);   // (text only: a device's name is never HTML)
        var m = document.createElement("span"); m.className = "dm"; m.textContent = (d.awake ? t("dev.awake") + " \u00b7 " + (d.mode === "direct" ? t("dev.direct") : t("dev.server")) : t("dev.asleep")); li.appendChild(m);
        li.appendChild(devBtn(t("dev.remove"), "tip.dev.remove", "sm", function () { devAct("pair_kick", { id: d.id }); }));
        ul.appendChild(li);
      });
      box.appendChild(ul);
      var lim = document.createElement("p"); lim.className = "note"; lim.textContent = t("dev.limit"); box.appendChild(lim);
    }
    var lk = dev.link;
    if (ok && lk) {   // the one-time link code: shown here only, never kept, gone when its time is up
      var lb = document.createElement("div"); lb.className = "linkbox";
      if (lk.code && lk.until > Date.now()) {
        var lc = document.createElement("b"); lc.className = "linkcode"; lc.id = "linkCode"; lc.textContent = lk.code; lc.title = t("tip.dev.linkcode"); lb.appendChild(lc);
        var lh = document.createElement("p"); lh.className = "note"; lh.id = "linkHow"; lh.textContent = t("dev.link.how", { time: linkLeft() }); lb.appendChild(lh);
      } else { var le = document.createElement("p"); le.className = "note"; le.textContent = lk.err || t("dev.link.expired"); lb.appendChild(le); }
      box.appendChild(lb);
    }
    var bar = document.createElement("div"); bar.className = "opt";
    bar.appendChild(devBtn(t("dev.setup"), "tip.dev.setup", "go map", function () { if (invoke) invoke("map_open_site", { mode: "pair" }); }));
    if (ok) {
      bar.appendChild(devBtn(t("dev.browser"), "tip.dev.browser", "", function () { if (invoke) invoke("pair_open_browser"); }));
      bar.appendChild(devBtn(t("dev.link"), "tip.dev.link", "", devLink));
      bar.appendChild(devBtn(t("dev.stop"), "tip.dev.stop", "", function () { devAct("pair_stop"); }));
    }
    box.appendChild(bar);
  }
  function linkLeft() { var s = Math.max(0, Math.ceil((dev.link.until - Date.now()) / 1000)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  function devLink() {   // asks the server (through the app) for a code: HK-authenticated, 2 minutes, once
    if (!invoke || dev.busy) return; dev.busy = true;
    invoke("pair_link_code").then(function (r) {
      if (r.state === "ok") { dev.link = { code: r.code, until: Date.now() + r.ttl * 1000 }; clearInterval(dev.linkT); dev.linkT = setInterval(linkTick, 1000); }
      else if (r.state === "gone") { dev.st = r; dev.goneAt = Date.now(); dev.link = null; }
      else if (r.state === "none") dev.link = null;
      else dev.link = { err: t("dev.link.err") };
      renderDevices();
    }).catch(function () { dev.link = { err: t("dev.link.err") }; renderDevices(); }).then(function () { dev.busy = false; });
  }
  function linkTick() {   // runs only while a code is showing: the countdown, then the code goes away
    if (!dev.link || !dev.link.until || dev.link.until <= Date.now()) { clearInterval(dev.linkT); dev.linkT = 0; if (dev.link) dev.link = { code: "" }; renderDevices(); return; }
    var h = document.getElementById("linkHow"); if (h) h.textContent = t("dev.link.how", { time: linkLeft() });
  }
  function devAct(cmd, args) {
    if (!invoke || dev.busy) return; dev.busy = true;
    invoke(cmd, args || {}).then(function (r) { dev.st = r; if (r.state !== "ok") dev.link = null; if (r.state === "gone") dev.goneAt = Date.now(); renderDevices(); }).catch(function () {}).then(function () { dev.busy = false; });
  }
  function devPoll(force) {
    if (!invoke || dev.busy || (!force && (cur !== "hub" || document.hidden))) return;
    dev.busy = true;
    invoke("pair_status").then(function (r) { if (r.state === "gone") dev.goneAt = Date.now(); dev.st = r; renderDevices(); }).catch(function () {}).then(function () { dev.busy = false; });
  }
  setInterval(devPoll, 5000);   // (only while the Modes page shows and the window is visible: no call to the server otherwise)
  /* ---------- About: thanks and the tools we support (names stay as they are, the sentences are translated) ---------- */
  var THANKS = [["TRGE: Turkish Galactic Empire Squadron", "", "thanks.trge"], ["CMDR Cyanidex", "", "thanks.cyanidex"], ["Taha Koçer", "", "thanks.taha"], ["CMDR Nermesos", "", "thanks.nermesos"], ["CMDR War Khan", "", "thanks.warkhan"],
    ["Spansh, Gareth Harper", "https://spansh.co.uk/", "thanks.spansh"], ["Canonn Science", "https://science.canonn.tech/", "thanks.canonn"],
    ["Frontier Developments, Elite Dangerous", "https://www.elitedangerous.com/", "thanks.frontier"], ["Anthropic, Claude", "https://www.anthropic.com/claude", "thanks.claude"]];
  var APPS = [["Inara", "https://inara.cz/", "apps.inara"], ["EDSY", "https://edsy.org/", "apps.edsy"], ["SRV Survey", "https://github.com/njthomson/SrvSurvey", "apps.srv"],
    ["EDOMH", "https://github.com/jixxed/ed-odyssey-materials-helper", "apps.edomh"], ["ED-UP", "https://github.com/characterecho-sean/ed-unofficial-patch", "apps.edup"]];
  function renderAbout() {
    [["#thanks", THANKS], ["#apps", APPS]].forEach(function (g) {
      var ul = $(g[0]); if (!ul) return; ul.innerHTML = "";
      g[1].forEach(function (r) {
        var li = document.createElement("li"), n, d = document.createElement("span");
        if (r[1]) { n = document.createElement("a"); n.href = r[1]; n.setAttribute("data-ext", ""); n.title = t("tip.about.link"); } else n = document.createElement("b");
        n.textContent = r[0]; d.className = "ab-d"; d.textContent = t(r[2]); li.appendChild(n); li.appendChild(d); ul.appendChild(li);
      });
    });
  }
  var shown = "";
  // the Journal stamps UTC ("2026-11-16T09:45:30Z"): shown in this PC's own time
  function localTime(ts) {
    var d = new Date(ts);
    if (isNaN(d)) return String(ts).slice(11, 19);
    return d.toLocaleTimeString([], { hour12: false });
  }
  function renderLog() {
    var u = $("#log"), rec = (state && state.recent) || [], key = rec.map(function (r) { return r.time + r.event; }).join("|");
    if (key === shown && u.children.length) return; shown = key;
    u.innerHTML = "";
    if (!rec.length) { var e = document.createElement("li"); e.innerHTML = '<span class="empty"></span>'; $("span", e).textContent = t("journal.empty"); u.appendChild(e); return; }
    rec.forEach(function (r) {
      var li = document.createElement("li");
      li.innerHTML = '<time></time><span><em></em></span><span></span>';
      $("time", li).textContent = localTime(r.time); $("em", li).textContent = r.event; li.lastChild.textContent = r.text;
      u.appendChild(li);
    });
  }
  /* ---------- the pages: Combat, Map, Thargoid, On Foot and Settings are built from combatui.js (the GRAVITAS menu uses the same file) ---------- */
  function fillPane(id, names) { var el = document.getElementById(id); if (!el) return; el.innerHTML = ""; if (window.GVC) GVC.mount(el, names); }
  function buildPages() {
    if (!window.GVC) return;
    GVC.init({ t: t, lang: function () { return lang; }, toast: toast });
    GVC.reset();
    fillPane("profPop", ["shipprof"]);
    (function () { var b = $("#profBtn"), p = $("#profPop"); b.onclick = function (e) {
      e.stopPropagation(); p.hidden = !p.hidden;
      if (!p.hidden) { // the pop-up is placed on the window itself, under the button, so no parent can cut it
        var r = b.getBoundingClientRect(), w = Math.min(340, innerWidth - 24);
        p.style.position = "fixed"; p.style.width = w + "px"; p.style.top = (r.bottom + 8) + "px";
        p.style.left = Math.max(12, Math.min(r.right - w, innerWidth - w - 12)) + "px"; p.style.right = "auto";
        p.style.maxHeight = Math.max(160, innerHeight - r.bottom - 24) + "px";
      }
    };
      document.addEventListener("click", function (e) { if (!p.hidden && !p.contains(e.target) && e.target !== b) p.hidden = true; }); })();
    fillPane("combat-overview", ["modes", "actions"]);
    fillPane("combat-windows", ["windows", "profiles"]);
    fillPane("combat-look", ["look", "targets"]);
    fillPane("combat-behaviour", ["wing", "behave", "claims"]);
    fillPane("keys-main", ["kbmain"]);   fillPane("keys-map", ["kbmap"]);
    fillPane("keys-combat", ["kbcombat"]); fillPane("keys-thargoid", ["kbsoon"]); fillPane("keys-foot", ["kbsoon"]);
    fillPane("combat-past", ["past"]);
    fillPane("prefs-x", ["themes", "prefsx"]);
    fillPane("map-overview", ["mapopen", "mapov", "mapsite"]);          fillPane("map-past", ["visits"]);
    fillPane("thargoid-overview", ["thwin", "threc"]); fillPane("thargoid-past", ["thpast"]);
    fillPane("debrief-overview", ["dbmode", "dbwin", "dbbinds"]);   // (the Past debriefs list is not reachable from the UI for now: SEC.dbpast and the db_* commands stay)
    fillPane("pvp-overview", ["pvpmode", "pvpwin"]); fillPane("pvp-past", ["pvpfights"]); fillPane("pvp-cmp", ["pvpcompare"]);
    fillPane("bgs-setup", ["bgssetup", "bgsscan"]);
    ["today", "movers", "risk", "heat", "trends", "fleet", "tick", "report"].forEach(function (k) { fillPane("bgs-" + k, [["bgsview", k]]); });
    fillPane("foot-overview", [["soon", "nav.foot"]]);         fillPane("foot-past", [["soon", "tab.past.foot"]]);
  }
  /* ---------- updates: only "a newer version exists" ever comes from the server (updater.rs) ---------- */
  var upd = {};
  function renderUpdates() {
    var u = upd || {}, b = $("#upd"), txt = $("#updText"), btn = $("#updBtn");
    var show = u.status === "available" || u.status === "required" || u.status === "downloading" || u.status === "installing";
    b.hidden = !show; b.className = "upd" + (u.status === "required" ? " req" : "");
    if (show) {
      txt.textContent = u.status === "downloading" ? t("upd.down", { p: u.progress || 0 }) : u.status === "installing" ? t("upd.inst", { v: u.latest }) : u.status === "required" ? t("upd.required", { v: u.latest }) : t("upd.new", { v: u.latest });
      btn.textContent = t("upd.btn"); btn.hidden = u.status === "downloading" || u.status === "installing";
    }
    var c = $("#updCard"); if (!c) return;
    if (!c._built) {
      c._built = true; c.innerHTML = "";
            var s1 = document.createElement("p"); s1.className = "note"; s1.id = "updCur"; c.appendChild(s1);
      var s2 = document.createElement("p"); s2.className = "note"; s2.id = "updSt"; c.appendChild(s2);
      var bar = document.createElement("div"); bar.className = "opt";
      var ck = document.createElement("button"); ck.className = "btn go thargoid"; ck.id = "updCheck"; ck.onclick = function () { invoke && invoke("update_check"); }; bar.appendChild(ck); c.appendChild(bar);
      var row = document.createElement("div"); row.className = "opt";
      var l = document.createElement("div"); l.innerHTML = '<div id="updAutoT"></div><small id="updAutoD"></small>'; row.appendChild(l);
      var sw = document.createElement("button"); sw.className = "sw"; sw.id = "updAuto"; sw.setAttribute("role", "switch");
      sw.onclick = function () { var n = sw.getAttribute("aria-checked") !== "true"; sw.setAttribute("aria-checked", n); invoke && invoke("set_auto_update", { on: n }); };
      row.appendChild(sw); c.appendChild(row);
    }
    $("#updCur").textContent = t("upd.cur", { v: u.current || version });
    var st = u.status === "checking" ? t("upd.checking") : u.status === "error" ? (String(u.error).indexOf("blocked:") === 0 ? t("upd.blocked") : t("upd.err", { e: u.error })) : u.status === "uptodate" ? t("upd.uptodate") : (u.status === "available" || u.status === "required") ? t("upd.new", { v: u.latest }) : "";
    if (u.checked && u.status !== "error") st += (st ? " · " : "") + t("upd.last", { t: new Date(u.checked * 1000).toLocaleString() });
    $("#updSt").textContent = st;
    $("#updCheck").title = t("tip.upd.check"); $("#updAuto").parentNode.title = t("tip.upd.auto"); $("#updBtn").title = t("tip.upd.btn"); $("#updCheck").textContent = t("upd.check"); $("#updAutoT").textContent = t("upd.auto"); $("#updAutoD").textContent = t("upd.auto.d");
    $("#updAuto").setAttribute("aria-checked", u.auto !== false);
  }
  /* the Microsoft Store build has no updater (the Store updates the app): no Updates page, no banner, no polling */
  var storeBuild = false;
  if (invoke) invoke("store_build").then(function (on) {
    if (!on) return;
    storeBuild = true;
    var nb = document.querySelector('.nav[data-view="updates"]'); if (nb) nb.style.display = "none";
    var ub = $("#upd"); if (ub) ub.hidden = true;
  }).catch(function () {});
  function pollUpdates() { if (invoke && !storeBuild && !document.hidden) invoke("update_status").then(function (u) { upd = u; renderUpdates(); }).catch(function () {}); }
  $("#updBtn").onclick = function () { invoke && invoke("update_install"); };
  setInterval(pollUpdates, 2000); document.addEventListener("visibilitychange", function () { if (!document.hidden) pollUpdates(); });   // (not while the window is hidden: it asks once when it is shown again) setTimeout(pollUpdates, 1500);

  /* ---------- What's new: shown once after an update; its notes are in the app itself (whatsnew.json), never from the server ---------- */
  function vnum(v) { return String(v || "0").split(".").map(function (x) { return parseInt(x, 10) || 0; }); }
  function vnewer(a, b) { var x = vnum(a), y = vnum(b); for (var i = 0; i < Math.max(x.length, y.length); i++) { var p = x[i] || 0, q = y[i] || 0; if (p !== q) return p > q; } return false; }
  function showWhatsNew(state, force) {
    fetch("whatsnew.json").then(function (r) { return r.json(); }).then(function (all) {
      var cur = state.current, list = (all.versions || []).filter(function (e) { return force ? e.v === cur : (vnewer(e.v, state.seen || "0") && !vnewer(e.v, cur)); });
      if (!list.length) { if (!force && invoke) invoke("whatsnew_seen"); return; }
      $("#wnT").textContent = t("wn.title", { v: cur });
      var body = $("#wnBody"); body.innerHTML = "";
      list.forEach(function (e) {
        if (list.length > 1) { var h = document.createElement("h3"); h.textContent = e.v; body.appendChild(h); }
        var ul = document.createElement("ul"); (e[lang] || e.en || []).forEach(function (s) { var li = document.createElement("li"); li.textContent = s; ul.appendChild(li); }); body.appendChild(ul);
      });
      $("#wnOk").textContent = t("wn.ok"); $("#wn").hidden = false;
    }).catch(function () {});
  }
  $("#wnOk").onclick = function () { $("#wn").hidden = true; if (invoke) invoke("whatsnew_seen"); };
  /* ---------- diagnostic report (About): counts kept in memory by the app, copied only when the player clicks; the licences file ---------- */
  function copyText(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(txt);
    return new Promise(function (ok, no) {
      var a = document.createElement("textarea"); a.value = txt; a.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(a); a.select();
      var r = false; try { r = document.execCommand("copy"); } catch (e) {} a.remove(); r ? ok() : no();
    });
  }
  if ($("#diagCopy")) $("#diagCopy").onclick = function () {
    if (!invoke) return;
    invoke("diagnostic_report").then(copyText).then(function () { toast(t("toast.diag.copied")); }).catch(function () { toast(t("toast.diag.fail")); });
  };
  if ($("#fbOpen")) $("#fbOpen").onclick = function () { if (window.GVFeedback) GVFeedback.open(); };
  if ($("#licOpen")) $("#licOpen").onclick = function () {
    if (invoke) invoke("open_licences").catch(function (e) { toast(t("toast.lic.fail", { err: String(e) })); });
  };
  /* the one-line note above the Sync card: shown only when the game wrote something this version does not know (asked at most every 10 s, only while the Modes page shows) */
  function pollDrift() {
    var hub = $("#v-hub");
    if (!invoke || document.hidden || !hub || !hub.classList.contains("on")) return;
    invoke("drift_flag").then(function (on) { var n = $("#driftNote"); if (n) n.hidden = !on; }).catch(function () {});
  }
  setInterval(pollDrift, 10000); setTimeout(pollDrift, 4000);
  if ($("#wnOpen")) $("#wnOpen").onclick = function () { invoke && invoke("whatsnew_state").then(function (s) { showWhatsNew(s, true); }); };
  function checkWhatsNew() {
    if (!invoke) return;
    invoke("whatsnew_state").then(function (s) {
      if (s.fresh || !s.seen && !s.current) { invoke("whatsnew_seen"); return; }   // a first install has nothing to say
      if (s.seen !== s.current) showWhatsNew(s, false);
    }).catch(function () {});
  }

  $$(".tabs[data-scope]").forEach(function (nav) {
    var scope = nav.dataset.scope;
    $$(".tab", nav).forEach(function (b) {
      b.addEventListener("click", function () {
        $$(".tab", nav).forEach(function (x) { x.classList.toggle("on", x === b); });
        $$(".pane", nav.parentNode).forEach(function (p) { if (p.parentNode !== nav.parentNode) return; p.classList.toggle("on", p.id === scope + "-" + b.dataset.tab); });
      });
    });
  });

  /* ---------- settings: language ---------- */
  var NAMES = {};
  function renderLangs() {
    var l = $("#langs"); l.innerHTML = "";
    CODES.forEach(function (c) {
      var b = document.createElement("button"); b.className = "li"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", c === lang);
      var nm = NAMES[c] || c, draft = / \((draft|Entwurf|brouillon|borrador|rascunho|черновик)\)$/.test(nm);
      var base = nm.replace(/ \((draft|Entwurf|brouillon|borrador|rascunho|черновик)\)$/, "");
      b.innerHTML = '<span><span class="nm"></span></span><span class="check"></span>';
      $(".nm", b).textContent = base;
      if (draft) { var d = document.createElement("span"); d.className = "draft"; d.textContent = t("prefs.draft"); $(".nm", b).parentNode.appendChild(d); }
      b.title = t("tip.lang"); b.addEventListener("click", function () { setLang(c).then(function () { toast(t("toast.lang", { name: base })); }); });
      l.appendChild(b);
    });
  }

  /* ---------- state from the Rust side ---------- */
  function onState(s) { state = s; renderHello(); renderChip(); renderLog(); }
  if (listen) listen("journal-state", function (e) { onState(e.payload); });
  if (invoke) invoke("get_state").then(onState).catch(function () {});
  if (T.app && T.app.getVersion) T.app.getVersion().then(function (v) { version = v; $("#ver").textContent = t("about.version", { v: version }); $("#ribbon").textContent = t("ribbon") + " \u00b7 v" + version; }).catch(function () {});

  /* ---------- start: English first, the saved language on top ---------- */
  Promise.all(CODES.map(load)).then(function (all) {
    en = all[0]; CODES.forEach(function (c, i) { NAMES[c] = (all[i] && all[i]._name) || c; });
    return setLang(CODES.indexOf(lang) >= 0 ? lang : "en");
  }).then(function () { go("hub"); setTimeout(moveInd, 120); setTimeout(checkWhatsNew, 600); });
})();
