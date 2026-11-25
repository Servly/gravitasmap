// GRAVITAS APP hooks. The app opens the site in two ways: the whole site in its own window, and ?app=smap = ONLY the System map, see-through, as an overlay
// over the game. The app never gets any power from the page: it only calls these functions (webview eval) and the page answers nothing back.
//   __gravitasApp.setSystem(name)  load that system (from the Journal: where the player is)
//   __gravitasApp.pan(dx, dy)      move the map by pixels,  .zoom(f) zoom by a factor around the middle,  .fit() show the whole system
const APP_SMAP = /[?&]app=smap(&|$)/.test(location.search);
if (APP_SMAP) document.documentElement.classList.add("appsmap");
window.__gravitasApp = {
  setSystem(name) { if (!name || (typeof S !== "undefined" && S && S.sys && S.sys.name === name)) return false; loadSystem(name); _paceAct(); return true; },
  pan(dx, dy) { if (!SMAP.plan) return false; SMAP.v = { ...SMAP.v, tx: SMAP.v.tx + dx, ty: SMAP.v.ty + dy, auto: false }; smapApply(); _paceAct(); return true; },
  zoom(f) { const V = $("smapView"); if (!V || !SMAP.plan) return false; smapZoomAt(V.clientWidth / 2, V.clientHeight / 2, f); _paceAct(); return true; },
  fit() { smapFit(); _paceAct(); return true; },
  system() { return typeof S !== "undefined" && S && S.sys ? S.sys.name : ""; },
};
// ---- the app's own map window (?app=window): the app is the Journal folder. It hands over the lines Sync needs (mapfeed.rs), this file makes them look like a
// folder the site's own Sync reads, so the browser's folder question never comes. The lines stay in this window, nothing is sent anywhere.
//   __gravitasApp.journal(name, text, reset)  Journal lines (reset: replace what is there, else add)   .file(name, text)  Status.json / NavRoute.json
//   __gravitasApp.openTool("Sonification"|"Lenses"|"Collisions")  open that tool of the map window
const APPF = { j: { name: "", blob: new Blob([]), m: 0 }, files: {} };
const appHandle = n => ({ kind: "file", name: n, getFile: async () => {
  const f = n === APPF.j.name ? APPF.j : APPF.files[n]; if (!f) throw new Error("not found");
  return new File([f.blob], n, { lastModified: f.m }); } });
const appDir = () => ({ kind: "directory", name: "Elite Dangerous", queryPermission: async () => "granted", requestPermission: async () => "granted",
  async *entries() { if (APPF.j.name) yield [APPF.j.name, appHandle(APPF.j.name)]; },
  async getFileHandle(n) { if (n !== APPF.j.name && !APPF.files[n]) throw new Error("not found"); return appHandle(n); } });
function appSyncStart() {   // the first hand-over starts Sync by itself, unless the player switched it off on purpose
  if (!APP_WINDOW || SYNC.on || SYNC.remote || SYNC.appTried || syncLS("on") === "0") return;
  SYNC.appTried = true; syncStart(appDir(), false);
}
Object.assign(window.__gravitasApp, {
  dir: appDir, ready: () => !!APPF.j.name,
  journal(name, text, reset) {
    if (!APP_WINDOW || typeof name !== "string" || typeof text !== "string") return false;
    const J = APPF.j;
    if (reset || name !== J.name) {
      const b = new Blob([text]);
      if (name === J.name && b.size === J.blob.size) { appSyncStart(); return true; }   // the same again (the app repeats itself): nothing to read twice
      J.name = name; J.blob = b;
    } else if (text) J.blob = new Blob([J.blob, text]);
    J.m = Date.now(); appSyncStart(); return true;
  },
  file(name, text) {
    if (!APP_WINDOW || !/^(Status|NavRoute)\.json$/.test(name) || typeof text !== "string") return false;
    APPF.files[name] = { blob: new Blob([text]), m: Date.now() }; return true;
  },
  openSystem(name) { if (typeof name !== "string" || !name.trim() || name.length > 80) return false; SYNC.pin = true; loadSystem(name.trim(), { user: true }); return true; },   // from the app's Visits list: opened by you, so Sync does not take it back
  openTool(tab) { if (tab === "Devices") return pairShow(); if (/^(Sonification|Lenses|Collisions)$/.test(tab)) { openNews(tab, "modes"); return true; } return false; },
  // the phones and tablets that follow (33-pair-manage.js): the app keeps the pairing, this window holds it in memory only.
  //   pairIn(room, key)   the app hands over its copy (null, null = it has none)      pairClear(room)  that pairing ended: drop it here
  //   pairPeek()          what this window holds, as a JSON text: the app LOOKS at it (WebView2 ExecuteScript), this page calls nothing in the app
  pairIn(room, hk) { if (!APP_WINDOW) return false; APPPAIR.ready = true; return room ? pairAdopt(room, hk) : true; },
  pairClear(room) { if (!APP_WINDOW || PAIR.role !== "host" || PAIR.room !== room) return false; pairHostStop(true); toast("Sharing was stopped from the GRAVITAS app."); return true; },
  pairPeek() { if (!APP_WINDOW) return null; const h = PAIR.role === "host" && PAIR.hk ? { room: PAIR.room, hk: PAIR.hk } : { room: null, hk: null }; return JSON.stringify({ ready: APPPAIR.ready, room: h.room, hk: h.hk }); },
});
// the app opened the window straight on a tool: ?app=window&open=sono|lenses|coll
if (APP_WINDOW) { const o = (new URLSearchParams(location.search).get("open") || ""), tab = { sono: "Sonification", lenses: "Lenses", coll: "Collisions" }[o];
  if (o === "pair") { const until = Date.now() + 20e3, go = () => { if (APPPAIR.ready || Date.now() > until) pairShow(); else setTimeout(go, 400); }; setTimeout(go, 1500); }   // (the app's Devices button: the dialog opens after the app handed its pairing over)
  if (tab) { const until = Date.now() + 60e3; const go = () => { if (S && S.bodies && S.bodies.length) { setTimeout(() => openNews(tab, "modes"), 900); return; } if (Date.now() < until) setTimeout(go, 500); }; setTimeout(go, 1000); } }
// the app resizes this window to fit its card: the whole system is shown again after every resize (the player's own moves come later, with the keys)
if (APP_SMAP) { let rt = 0; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (typeof SMAP !== "undefined" && SMAP.plan) { smapFit(); _paceAct(); } }, 250); }); }
// the see-through map is a still picture: the page's frame loop wakes about 2 times a second unless it was just asked to move (this window is never seen, only photographed)
if (APP_SMAP) { const raf0 = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = cb => (performance.now() < PACE.act ? raf0(cb) : setTimeout(() => raf0(cb), 400)); }
