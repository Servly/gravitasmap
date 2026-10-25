// v0.77: the touch screen layout, for every phone and tablet (v0.76.2 started it for a paired screen).
// The view (system map or 3D) fills the screen. A slim bar on top: the system (tap it to search) and Map | 3D.
// Windows wait on the edges as named tabs: Bodies, System, View, About on the left, Body and Filters on the right.
// The clock waits at the bottom: a tap opens the time controls. Tap a tab or pull it inwards; tap beside a window,
// push it back, or press Esc to close it. Following a computer (Sync with GRAVITAS) keeps the map on the whole screen.
// Only CSS moves the windows. Nothing here runs per frame: the handlers wake up on a touch and sleep again.
var PFULL, PFULL_LAST, PFULL_EAT = 0, PFULL_TAP;               // no starting values: an earlier part may already use them
function pfullFits() { return matchMedia("(pointer: coarse)").matches; }   // a touch screen, not a mouse (var and function: the pairing can start before this part runs)
function pfLeft(sh) { return sh === "list" || sh === "sys" || sh === "view" || sh === "sync" || sh === "about"; }
function pfRight(sh) { return sh === "info" || sh === "stn"; }   // v0.79: the station window too               // v0.77.2: Filters are a small card, not a window
// the Body window opens for the visitor's own tap, not when Sync or a link picks a body
function pfullByHand() { return performance.now() - (PFULL_TAP || -1e9) < 1500; }
addEventListener("pointerdown", () => { PFULL_TAP = performance.now(); }, { capture: true, passive: true });
function pfullSet(on) {
  on = !!on && pfullFits();
  if (on === !!PFULL) return;
  PFULL = on; document.body.classList.toggle("pfull", on);
  setSheet(""); pfullHandles(); layoutLeft();
}
// following a computer: the map is the whole screen
function pfullMap() {
  if (!PFULL) return;
  if (S) { if (SURF) exitSurface(false); setMap(true, false); requestAnimationFrame(() => { try { smapFit(); } catch (e) {} }); } else SMAP_WANT = true;
}
function pfullHandles() {
  if (!PFULL) return;
  const sh = document.body.dataset.sheet || "", B = document.body.classList;
  B.toggle("pfL", pfLeft(sh)); B.toggle("pfR", pfRight(sh)); B.toggle("pfB", sh === "time");
  B.toggle("pfSel", !!selected); B.toggle("pfHasF", !!S);
  if (sh === "list") { const t = $("top"); if (t) document.documentElement.style.setProperty("--pTopH", t.offsetHeight + "px"); }
  const fb = document.querySelector('#pTabsR button[data-sheet="filt"]'), n = typeof SMAP !== "undefined" && SMAP.filters ? SMAP.filters.size : 0, ft = n ? `Filters · ${n}` : "Filters";
  if (fb && fb.textContent !== ft) fb.textContent = ft;
}
// v0.78.5: following a computer, the route sits on the main screen too, under the Sync pill (in 3D under Overview | True scale): jumps left, light years,
// the next stop with its star class. A tap opens the Sync window with every jump
function pfullRoute() {
  const el = $("pRoute"); if (!el) return;
  const ri = PFULL && SYNC.remote ? syncRouteInfo() : null, n = ri && ri.hops && ri.hops[0];
  const fmtLy = v => v >= 100 ? v.toFixed(0) : v.toFixed(1);
  const h = n ? `${syncIc("route")}<b>${ri.left} jump${ri.left > 1 ? "s" : ""}</b><span class="rly">${fmtLy(ri.ly)} ly</span><span class="rnx">next</span><em title="${esc(n[0])}">${esc(n[0])}</em>${starChip(n[1])}` : "";
  if (el._h !== h) { el._h = h; el.innerHTML = h; el.setAttribute("aria-label", n ? `Route: ${ri.left} jumps, ${fmtLy(ri.ly)} light years, next ${n[0]}. Open the Sync window` : ""); }
  document.body.classList.toggle("pRt", !!n);
}
// v0.77.2: the Sync window: how it stands, and how to start
function pfullSync() {
  const w = $("psync"); if (!w || !PAIR_ON) return;
  const [k, word, why] = syncK(), card = SYNC.remote ? syncCardHTML() : "";
  const head = SYNC.remote ? `<div class="pk" data-k="${k}"><span class="sdot" aria-hidden="true"></span><b>${esc(word)}</b><span>${esc(why || (PAIR.mode ? pairHow() : ""))}</span></div>`
    : `<div class="pk" data-k="off"><span class="sdot" aria-hidden="true"></span><b>NOT FOLLOWING</b><span>Pair this device with the steps below.</span></div>`;
  const h = head + card, el = w.querySelector(".pst");
  if (el._h !== h) { el._h = h; el.innerHTML = h; syncRouteHook(el); }
}
function pfullOpen(side) {
  if (side === "R") { if (selected) setSheet("info"); else if (S) setSheet(document.body.dataset.sheet === "filt" ? "" : "filt"); return; }
  setSheet(PFULL_LAST && pfLeft(PFULL_LAST) ? PFULL_LAST : "list");
}
const pfBuzz = () => { try { navigator.vibrate && navigator.vibrate(8); } catch (e) {} };   // a tiny tick on phones that have it
// the top bar's system name, and the clock at the bottom
function pfullTitle() {
  const t = $("pTitle"); if (!t) return;
  t.querySelector("b").textContent = S ? S.sys.name : "Search a system";
  t.querySelector("i").textContent = S && YAH && YAH.b ? "● here" : "";
  pfullHandles();
}
function pfullClock() {
  const c = $("pClock"); if (!c || !PFULL) return;
  const g = ($("gametime") && $("gametime").textContent) || "", hm = g.slice(-8), live = typeof liveFlag === "function" && liveFlag.on;
  const st = live ? "LIVE" : speed === 0 ? "PAUSED" : (speed > 0 ? "▶ " : "◀ ") + Math.abs(speed) + "×";
  if (c._t !== hm + st) { c._t = hm + st; c.innerHTML = `<span>${esc(hm)}</span><em class="${live ? "" : "off"}">${esc(st)}</em>`; }
}
{
  // ---- the slim top bar and the clock
  const ti = document.createElement("button"); ti.id = "pTitle"; ti.setAttribute("aria-label", "Search a system or a body");
  ti.innerHTML = `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="7" cy="7" r="4.6"/><path d="M10.4 10.4 14 14"/></svg><b></b><i></i>`;
  ti.onclick = () => { pfBuzz(); setSheet("list"); setTimeout(() => { const s = document.querySelector("#search input"); if (s) s.focus(); }, 320); };
  document.body.appendChild(ti);
  const ck = document.createElement("button"); ck.id = "pClock"; ck.setAttribute("aria-label", "Time: game time, speed, date");
  ck.onclick = () => { pfBuzz(); setSheet("time"); };
  document.body.appendChild(ck);
  const sn = $("sysname"); if (sn && window.MutationObserver) new MutationObserver(pfullTitle).observe(sn, { childList: true, characterData: true, subtree: true });
  // ---- named tabs on the two edges (v0.76.3). Each opens its own window: tap it or pull it inwards
  const pull = (el, side, open) => {
    let st = null;
    el.addEventListener("pointerdown", e => { e.stopPropagation(); st = { x: e.clientX, y: e.clientY }; try { el.setPointerCapture(e.pointerId); } catch (x) {} });
    el.addEventListener("pointerup", e => {
      if (!st) return; const dx = (e.clientX - st.x) * (side === "L" ? 1 : -1), dy = Math.abs(e.clientY - st.y); st = null;
      if (dx > 18 || (Math.abs(dx) < 12 && dy < 12)) { PFULL_EAT = performance.now(); pfBuzz(); open(); }   // pulled inwards, or tapped
    });
    el.addEventListener("pointercancel", () => { st = null; });
  };
  const box = (id, side, tabs) => {
    const d = document.createElement("nav"); d.id = id; d.className = "ptabs " + side; d.setAttribute("aria-label", side === "L" ? "Windows" : "Body and filters");
    for (const [sh, txt] of tabs) {
      const b = document.createElement("button"); b.dataset.sheet = sh; b.textContent = txt;
      b.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSheet(sh); } });
      pull(b, side, () => setSheet(sh === "filt" && document.body.dataset.sheet === "filt" ? "" : sh));   // Filters: the same tab closes them
      d.appendChild(b);
    }
    document.body.appendChild(d);
  };
  box("pTabsL", "L", [["list", "Bodies"], ["sys", "System"], ["view", "View"], ["sync", "Sync"], ["about", "About"]]);
  // ---- the Sync window (v0.77.2): status, the code box, and short steps
  const sy = document.createElement("div"); sy.id = "psync"; sy.className = "panel"; sy.setAttribute("role", "region"); sy.setAttribute("aria-label", "Sync with GRAVITAS");
  sy.innerHTML = `<h3>SYNC WITH GRAVITAS</h3><div class="pst"></div><button class="pstop">Stop following</button><div class="pjh"></div>
    <div class="q">HOW TO START</div>
    <ol><li>On your computer, open <b>gravitasmap.com</b> in Chrome or Edge.</li><li>Turn on <b>Sync with the game</b> (left side) and choose your Elite Dangerous Journal folder.</li>
      <li>Click <b>📱 Phone</b> next to it.</li><li>Scan the QR code with this device's camera, or type the 6-digit code above.</li></ol>
    <div class="q">GOOD TO KNOW</div>
    <ul><li>This device then follows your ship: jumps, You are here, your target.</li><li>Only that small summary is shared. Your Journal stays on your computer.</li>
      <li>Keep the GRAVITAS tab open on the computer. It keeps working behind the game.</li><li>On the same Wi-Fi it links directly when that is faster, otherwise through the GRAVITAS server.</li>
      <li>For 12 hours this device joins again by itself after a reload.</li></ul>`;
  document.body.appendChild(sy);
  sy.querySelector(".pstop").onclick = () => { if (SYNC.remote) pairLeave(); pfullSync(); };
  pairJoinBox(sy.querySelector(".pjh"));
  const nb = document.createElement("button"); nb.dataset.sheet = "sync"; nb.textContent = "⇄ Sync";
  nb.onclick = () => setSheet(document.body.dataset.sheet === "sync" ? "" : "sync");
  const mn = $("mnav"), ab = mn && mn.querySelector('button[data-sheet="about"]'); if (mn) mn.insertBefore(nb, ab);
  // the surface view's long note: a tap on its title
  const sh = document.querySelector("#surf .sh b"); if (sh) sh.addEventListener("click", () => { if (PFULL) $("surf").classList.toggle("more"); });
  box("pTabsR", "R", [["info", "Body"], ["filt", "Filters"]]);
  for (const side of ["L", "R"]) {
    const s = document.createElement("div"); s.id = "pStrip" + side; s.className = "pstrip"; document.body.appendChild(s);
    pull(s, side, () => pfullOpen(side));
  }
  // the click that follows the tap would land on the window that just opened under the finger (a body row): drop it
  addEventListener("click", e => { if (performance.now() - PFULL_EAT < 450) { PFULL_EAT = 0; e.stopPropagation(); e.preventDefault(); } }, { capture: true });
  const sc = document.createElement("div"); sc.id = "pScrim"; document.body.appendChild(sc);
  sc.addEventListener("click", () => setSheet(""));
  // push a window back out to its edge to close it (a sideways swipe; scrolling inside stays free). The clock: down
  let sw = null;
  addEventListener("touchstart", e => {
    if (!PFULL || !document.body.dataset.sheet || e.touches.length !== 1) { sw = null; return; }
    const t = e.touches[0]; sw = { x: t.clientX, y: t.clientY, el: e.target };
  }, { passive: true });
  addEventListener("touchend", e => {
    if (!sw || !PFULL) return; const t = e.changedTouches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y, el = sw.el; sw = null;
    const sh = document.body.dataset.sheet;
    if (!el.closest || el.closest(".smf, .tabs, input, select, textarea, [type=range]")) return;   // sideways lists scroll, sliders slide
    if (sh === "time" && dy > 60 && dy > Math.abs(dx) * 1.6 && el.closest("#time, #pScrim")) { setSheet(""); return; }
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    if (pfLeft(sh) && dx < 0 && el.closest("#list, #sys, #view, #psync, #credits, #mnav, #top, #pScrim")) setSheet("");
    else if (pfRight(sh) && dx > 0 && el.closest("#info, #ofilt, #stw")) setSheet("");
  }, { passive: true });
  addEventListener("keydown", e => { if (PFULL && e.key === "Escape" && document.body.dataset.sheet) setSheet(""); });
  // ---- v0.78.5: the route strip (shown only while following a computer that has a route plotted)
  const rt = document.createElement("button"); rt.id = "pRoute"; rt.type = "button";
  rt.onclick = () => { pfBuzz(); SYNC.rOpen = true; setSheet("sync"); pfullSync(); };
  document.body.appendChild(rt);
  // ---- v0.78.4: in 3D too, the map's buttons: zoom in, zoom out, Reset view, names (phones and tablets)
  const z3 = document.createElement("div"); z3.id = "pZoom3"; z3.className = "smz"; z3.setAttribute("role", "group"); z3.setAttribute("aria-label", "3D view");
  z3.innerHTML = `<button data-z="in" title="Zoom in" aria-label="Zoom in">+</button><button data-z="out" title="Zoom out" aria-label="Zoom out">−</button>`
    + `<button data-z="home" title="Reset view" aria-label="Reset view">⤢</button><button data-z="names" title="Show or hide names" aria-label="Show or hide names">Aa</button>`;
  z3.insertBefore(followButton(), z3.firstChild); z3.insertBefore(findMeButton(), z3.firstChild); followUi();   // v0.82.4: and the lock beside it                    // v0.79.9: Find me, as on the map
  document.body.appendChild(z3);
  let zt = 0;
  const zoom3 = f => {                                    // a short smooth step toward (or away from) the point the view turns around
    const T = controls.target, from = camera.position.clone().sub(T), d0 = from.length();
    const d1 = Math.max(controls.minDistance * 1.05, Math.min(controls.maxDistance, d0 * f)), t0 = performance.now(), my = ++zt;
    const step = now => { if (my !== zt) return; const k = Math.min(1, (now - t0) / 260), e = 1 - Math.pow(1 - k, 3);
      camera.position.copy(T).add(from.clone().setLength(d0 + (d1 - d0) * e)); controls.update(); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  const z3names = () => { const n = $("vNames"); z3.querySelector('[data-z="names"]').classList.toggle("on", !!(n && n.checked)); };
  z3.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b || !S || MAPMODE) return; pfBuzz();
    const k = b.dataset.z;
    if (k === "in") zoom3(1 / 1.45); else if (k === "out") zoom3(1.45);
    else if (k === "home") { zt++; resetView(); }
    else if (k === "names") { const n = $("vNames"); if (n) { n.checked = !n.checked; n.dispatchEvent(new Event("input", { bubbles: true })); n.dispatchEvent(new Event("change", { bubbles: true })); } z3names(); }
  });
  { const n = $("vNames"); if (n) n.addEventListener("change", z3names); z3names(); }
  // v0.82.5: on a computer too, the 3D view gets the same buttons (Find me, Follow, zoom, Reset view, names): top right,
  // under the view switch, beside the open window on the right
  const z3place = () => {
    if (PFULL || MAPMODE || SURF || !S) return;
    const shown = e => e && e.getClientRects().length > 0, inf = typeof rightPanel === "function" ? rightPanel() : $("info");
    const right = shown(inf) && !inf.classList.contains("closing") ? innerWidth - inf.offsetLeft + 12 : 12;
    const sc = $("scaleMode"), hn = $("tsHint"), top = Math.max(shown(sc) ? sc.getBoundingClientRect().bottom + 10 : 60, shown(hn) ? hn.getBoundingClientRect().bottom + 8 : 0);   // clear of the "Click for true scale" hint
    const v = [Math.round(right) + "px", Math.round(top) + "px"];
    if (z3.style.right !== v[0] || z3.style.top !== v[1]) { z3.style.right = v[0]; z3.style.top = v[1]; }
  };
  setInterval(z3place, 250); addEventListener("resize", z3place); z3place();
  // ---- v0.78.4: Filters close with a tap anywhere outside them (that tap only closes, it does not pick a body)
  let fEat = null;
  addEventListener("pointerdown", e => {
    if (!PFULL || document.body.dataset.sheet !== "filt" || !e.isPrimary) return;
    if (e.target.closest && e.target.closest('#ofilt, #pTabsR button[data-sheet="filt"]')) return;
    setSheet(""); fEat = e.pointerId; PFULL_EAT = performance.now(); e.stopPropagation(); e.preventDefault();
  }, { capture: true });
  for (const t of ["pointerup", "pointermove"]) addEventListener(t, e => { if (fEat === e.pointerId) { e.stopPropagation(); if (t === "pointerup") fEat = null; } }, { capture: true });
  addEventListener("pointercancel", e => { if (fEat === e.pointerId) fEat = null; }, { capture: true });
  // a phone or tablet: the touch layout from the start (and again if a mouse is plugged in or out)
  pfullSet(pfullFits()); pfullTitle(); pfullClock(); pfullSync();
  try { matchMedia("(pointer: coarse)").addEventListener("change", () => { pfullSet(pfullFits()); if (PFULL && SYNC.remote) pfullMap(); }); } catch (e) {}
}
