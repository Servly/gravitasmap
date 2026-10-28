// ------------------------------------------------------------------ data
// v0.50: read an API answer. When Cloudflare itself answers (for example after the free daily limit), the reply is
// an HTML page, not JSON. Say so plainly instead of showing a parser error.
async function apiJSON(r) {
  const type = r.headers.get("content-type") || "";
  if (!type.includes("json")) {
    if (r.status === 429) throw new Error("GRAVITAS has reached today's free limit of its host. It resets at 00:00 UTC. Please try again later.");
    throw new Error(`the server answered unexpectedly (status ${r.status}). Please try again in a minute.`);
  }
  let j; try { j = await r.json(); } catch (e) { throw new Error("the data arrived incomplete. Please try again in a minute."); }
  if (!r.ok || j.error) throw new Error(j.error || r.statusText);
  return j;
}
const acCache = new Map();                                        // suggestions already fetched in this visit
async function fetchSuggestions(text) {
  const k = text.trim().toLowerCase();
  if (acCache.has(k)) return acCache.get(k);
  const v = (await apiJSON(await fetch(`${API}/autocomplete?q=${encodeURIComponent(text.trim())}`))).values || [];
  if (v.length) acCache.set(k, v);
  return v;
}
function status(msg, err) { const s = $("status"); s.textContent = msg; s.className = "panel" + (err ? " err" : ""); s.style.display = msg ? "block" : "none"; }
{ const nj = $("noJump"); try { nj.checked = localStorage.getItem("gravitas.noJump") === "1"; } catch (e) {}
  nj.addEventListener("change", () => { try { localStorage.setItem("gravitas.noJump", nj.checked ? "1" : "0"); } catch (e) {} }); }
// v0.90.8: only the newest request may draw its system: an older one that answers later (a slow link, a background tab)
// used to replace the system on screen with the one asked for before. LOAD.by: who asked for what is on screen
const LOAD = { gen: 0, by: "auto" };
async function loadSystem(name, opts = {}) {
  const my = ++LOAD.gen;
  if (!API) { status("Live data needs the local server: run  python tools\\serve.py  and open http://localhost:8765", true); return false; }
  const skip = $("noJump") && $("noJump").checked;                  // v0.55: the visitor can turn the jump off, and we remember it
  const warp = opts.countdown && !skip ? Warp.start(name) : null;   // only jumps the user starts get the countdown
  if (warp) status("");
  if (!warp) status(`Loading ${name} from Spansh…`);
  try {
    const req = opts.pre || (opts.id64 ? fetch(`${API}/system?id64=${encodeURIComponent(opts.id64)}`).then(apiJSON)   // v0.94: by Spansh's number (a system Spansh's search does not know yet)
      : typeof sysFetch === "function" ? sysFetch(name) : fetch(`${API}/system?name=${encodeURIComponent(name)}`).then(apiJSON));   // v0.80: the next stop may be here already   // v0.70: Sync may have asked already, during the jump
    // a target that cannot be reached stops the countdown at once instead of after the jump
    if (warp) { await Promise.race([warp.done, req.then(() => warp.done)]); if (warp.cancelled) return false; }
    const j = await req;
    if (my !== LOAD.gen) { if (warp) warp.abort(); return null; }     // a newer request came since: this answer is dropped
    try { if (typeof jrnBefore === "function") jrnBefore(); } catch (e) {}    // v0.81: the old map is lifted out for the jump motion
    build(j); LOAD.by = opts.sync ? "sync" : opts.countdown || opts.user ? "user" : "auto"; status(j.stale || "", !!j.stale); if (j.stale) setTimeout(() => status(""), 9000);
    S.byId64 = opts.idLink && opts.id64 ? String(opts.id64) : "";     // v0.94: opened by its number: a link to it says the number too
    try { recentAdd(S.sys.name); sysIdKeep(S.sys.name, S.sys.id64); bmUi(); } catch (e) {}
    try { if (typeof jrnBuilt === "function") jrnBuilt(); } catch (e) {}     // v0.80: the journey bars
    applyLinkState(); updateUrl();
    if (skip && opts.countdown) fadeFlash();
    if (warp) {                                                     // drop out of witch space and glide in
      warp.exit();
      const toP = camera.position.clone(), toT = controls.target.clone();
      const fromP = toP.clone().multiplyScalar(4).add(new THREE.Vector3(0, toP.length() * 0.5, 0));
      camera.position.copy(fromP); controls.target.copy(toT);
      setTimeout(() => { fly = { t0: performance.now(), dur: 2600, fromT: toT.clone(), fromP: fromP.clone(), toT, toP }; }, 550);
    }
    return true;
  } catch (e) { if (warp) warp.abort(); if (my !== LOAD.gen) return null; status(`Could not load "${name}": ${e.message}`, true); return false; }
}
// shareable links:  ?system=Name&body=<bodyId>&t=<game time>&tab=Orbit
let linkState = null;
{ const p = new URLSearchParams(location.search);
  if (p.get("body") || p.get("t") || p.get("tab") || p.get("view")) linkState = { body: p.get("body"), t: p.get("t"), tab: p.get("tab"), view: p.get("view"), belt: p.get("belt") }; }
function parseGameTime(v) {               // "3312-10-08T04:20" or "3312-10-08 04:20[:ss]" (game year) -> ms
  const m = /^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)(?::(\d\d))?/.exec(v || ""); if (!m) return null;
  return Date.UTC(+m[1] - 1286, +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
}
function applyLinkState() {
  const L = linkState; linkState = null; if (!L || !S) return;
  const t = parseGameTime(L.t);
  if (t != null) { simTime = t; speed = 0; $("speed").value = "0"; LIVE = false; }          // a shared moment opens paused
  if (L.tab) infoTab = L.tab;
  const b = L.body != null ? S.byId.get(+L.body) : null;
  if (L.view === "3d") { if (MAPMODE) setMap(false, false); }      // v0.50: a link opens the view it was made in
  else if (L.view === "map" || L.view == null) setMap(true, false);
  const bt = L.belt ? (S.belts || []).find(x => (x.bl.name || "") === L.belt) : null;
  if (bt) setTimeout(() => beltSelect(bt), 300);
  else if (b && b._obj) setTimeout(() => select(b, !MAPMODE), 300);
}
function shareUrl(withTime) {
  const p = new URLSearchParams(); p.set("system", S ? S.sys.name : "Sol"); if (S && S.byId64) p.set("id64", S.byId64);
  if (selected) { p.set("body", selected.bodyId); p.set("tab", infoTab); }
  else if (typeof SELB !== "undefined" && SELB) { p.set("body", SELB.b.bodyId); p.set("belt", SELB.bl.name || ""); }   // v0.63: a link can open a belt
  p.set("view", MAPMODE ? "map" : "3d");                            // v0.71: the map is the default now, so a 3D link says so
  if (withTime) p.set("t", gameTime(simTime).slice(0, 16).replace(" ", "T"));
  return location.origin + location.pathname + "?" + p.toString().replace(/%20/g, "+").replace(/%3A/g, ":");
}
function updateUrl() { if (S) history.replaceState(null, "", shareUrl(false).slice(location.origin.length)); }
function toast(msg) { const t = $("toast"); t.textContent = msg; t.style.display = "block"; clearTimeout(toast._t); toast._t = setTimeout(() => (t.style.display = "none"), 2600); }
$("shareBtn").onclick = async () => {
  const url = shareUrl(true);
  try { await navigator.clipboard.writeText(url); toast("Link copied: this system, body, tab and moment"); }
  catch (e) { prompt("Copy this link:", url); }
};
// v0.94: copy the system's name, exactly as the game writes it (for the galaxy map, a route, a message)
$("copyName").onclick = async () => { if (!S) return; const n = S.sys.name;
  try { await navigator.clipboard.writeText(n); toast(`Copied: ${n}`); } catch (e) { prompt("Copy the system name:", n); } };
const q = $("q"), sugg = $("sugg"); let acTimer = null, acItems = [], acIdx = -1, acSeq = 0;
// v0.56: recent searches, kept only in this browser (never sent anywhere)
const RECENT_KEY = "gravitas.recent", RECENT_MAX = 8;
function recentGet() { try { const a = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(a) ? a.filter(x => typeof x === "string" && x).slice(0, RECENT_MAX) : []; } catch (e) { return []; } }
function recentAdd(name) { if (!name) return; const a = recentGet().filter(x => x.toLowerCase() !== name.toLowerCase()); a.unshift(name); try { localStorage.setItem(RECENT_KEY, JSON.stringify(a.slice(0, RECENT_MAX))); } catch (e) {} }
function recentDel(name) { const a = recentGet().filter(x => x !== name); try { localStorage.setItem(RECENT_KEY, JSON.stringify(a)); } catch (e) {} }
// v0.94: bookmarks, in this browser only (the last 30). The star beside the search box keeps the system you are looking at
const BM_KEY = "gravitas.bookmarks", BM_MAX = 30;
function bmGet() { try { const a = JSON.parse(localStorage.getItem(BM_KEY) || "[]"); return Array.isArray(a) ? a.filter(x => typeof x === "string" && x).slice(0, BM_MAX) : []; } catch (e) { return []; } }
function bmSet(a) { try { localStorage.setItem(BM_KEY, JSON.stringify(a.slice(0, BM_MAX))); } catch (e) {} bmUi(); }
const bmHas = n => !!n && bmGet().some(x => x.toLowerCase() === n.toLowerCase());
function bmToggle() { if (!S) return; const n = S.sys.name;
  if (bmHas(n)) { bmSet(bmGet().filter(x => x.toLowerCase() !== n.toLowerCase())); toast(`Bookmark removed: ${n}`); }
  else { if (bmGet().length >= BM_MAX) { toast(`Up to ${BM_MAX} bookmarks: remove one first (×)`); return; } bmSet([n, ...bmGet()]); toast(`Bookmarked: ${n}. Find it in the search box`); } }
function bmUi() { const b = $("bmBtn"), on = !!S && bmHas(S.sys.name); if (!b) return; b.textContent = on ? "★" : "☆"; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false");
  b.title = on ? "Bookmarked: click to remove" : "Bookmark this system"; }
$("bmBtn").onclick = e => { e.preventDefault(); bmToggle(); };
// v0.94: each system's number on Spansh, so a bookmark or a recent one opens even before Spansh's search knows it
const IDS_KEY = "gravitas.sysIds";
function sysIds() { try { return JSON.parse(localStorage.getItem(IDS_KEY) || "{}") || {}; } catch (e) { return {}; } }
function sysIdKeep(name, id) { if (!name || !/^\d{1,20}$/.test(String(id || ""))) return; const o = sysIds(), k = name.toLowerCase(); if (o[k] === String(id)) return; delete o[k]; o[k] = String(id);
  const ks = Object.keys(o); for (const x of ks.slice(0, Math.max(0, ks.length - 80))) delete o[x]; try { localStorage.setItem(IDS_KEY, JSON.stringify(o)); } catch (e) {} }
const sysIdOf = name => sysIds()[String(name || "").toLowerCase()] || "";
function showRecent() {
  const r = recentGet(), bm = bmGet(); if ((!r.length && !bm.length) || document.activeElement !== q) return showSugg([]);
  acItems = [...bm, ...r]; acIdx = -1;
  const row = (v, i, kind) => `<div data-i="${i}"><span>${kind === "b" ? "★ " : ""}${esc(v)}</span><b class="rx" data-x="${kind}" data-n="${esc(v)}" title="${kind === "b" ? "Remove this bookmark" : "Remove from recent"}" role="button" aria-label="Remove">×</b></div>`;
  sugg.innerHTML = (bm.length ? `<p class="note rc">Bookmarks</p>` + bm.map((v, i) => row(v, i, "b")).join("") : "")
    + (r.length ? `<p class="note rc">Recent systems</p>` + r.map((v, i) => row(v, bm.length + i, "r")).join("") + `<button class="rclr" data-clear="1" title="Forget the recent systems in this browser">Clear recent</button>` : "");
  sugg.style.display = "block";
}
function showSugg(vals, note) { if (document.activeElement !== q) { vals = []; note = ""; } acItems = vals; acIdx = -1;
  sugg.innerHTML = (note ? `<p class="note">${esc(note)}</p>` : "") + vals.map((v, i) => `<div data-i="${i}">${v.replace(/</g, "&lt;")}</div>`).join(""); sugg.style.display = vals.length || note ? "block" : "none"; }
function goSystem(v) { q.value = v; showSugg([]); q.blur(); loadSystem(v, { countdown: true, id64: sysIdOf(v) || undefined }); }
// v0.94: a Spansh link (spansh.co.uk/system/123…) or a system's number pasted in the search box opens that system
const spanshId = t => { const m = /spansh\.co\.uk\/(?:system|dumps?)\/(\d{1,20})/i.exec(t) || /^(\d{6,20})$/.exec(t); return m ? m[1] : ""; };
async function submitSearch() {            // only an exact system name is loaded; anything else gets suggestions, never a jump
  clearTimeout(acTimer); acSeq++; const t = q.value.trim(); if (!t) return;
  const sid = spanshId(t); if (sid) { q.value = ""; showSugg([]); q.blur(); return loadSystem(`system ${sid}`, { id64: sid, idLink: true, user: true }); }
  const same = list => list.find(v => v.toLowerCase() === t.toLowerCase());
  if (same(acItems)) return goSystem(same(acItems));
  let vals = []; try { vals = await fetchSuggestions(t); } catch (e) {}
  if (same(vals)) return goSystem(same(vals));
  showSugg(vals.slice(0, 8), vals.length ? `No system is called “${t}”. Did you mean one of these?` : `No system is called “${t}” on Spansh. Check the spelling.`);
}
sugg.addEventListener("mousedown", e => {
  if (e.target.dataset.clear) { e.preventDefault(); try { localStorage.removeItem(RECENT_KEY); } catch (er) {} return showRecent(); }
  const x = e.target.closest("[data-x]"); if (x) { e.preventDefault(); if (x.dataset.x === "b") bmSet(bmGet().filter(v => v !== x.dataset.n)); else recentDel(x.dataset.n); return showRecent(); }   // v0.94: × removes one
  const d = e.target.closest("[data-i]"), i = d && d.dataset.i; if (i != null) goSystem(acItems[i]); else e.preventDefault(); });
q.addEventListener("focus", () => { const v = q.value.trim(); if (v.length < 2 || (S && S.sys && v === S.sys.name)) showRecent(); });
q.addEventListener("input", () => {
  clearTimeout(acTimer); acSeq++; if (q.value.trim().length < 2) return showRecent(); if (!API) return showSugg([]);
  acTimer = setTimeout(async () => { const my = ++acSeq; try { const v = await fetchSuggestions(q.value); if (my === acSeq) showSugg(v); } catch { if (my === acSeq) showSugg([]); } }, 220);
});
q.addEventListener("keydown", e => {
  const items = sugg.querySelectorAll("div");
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); acIdx = Math.max(-1, Math.min(items.length - 1, acIdx + (e.key === "ArrowDown" ? 1 : -1))); items.forEach((d, i) => d.classList.toggle("act", i === acIdx)); }
  if (e.key === "Enter") { if (acIdx >= 0) goSystem(acItems[acIdx]); else submitSearch(); }
  if (e.key === "Escape") showSugg([]);
});
q.addEventListener("blur", () => setTimeout(() => showSugg([]), 150));
// v0.54: loading a system by dropping a Spansh file was removed. Moving the system map could set it off by mistake.

