// ------------------------------------------------------------ v0.97 GRAVITAS MODES: Lenses (v0.98: and System Sonification)
// Three new ways to look at a system, from its own orbit data: Rhythm (the patterns two orbits draw, and the melody of
// the system), Landscape (where each body's gravity rules) and Time (years of motion in one picture).
// The lenses live in their own file (src/lazy/lens.js). It loads only when this window opens, so a visitor who never
// opens it pays nothing. Everything is worked out and played in the browser: nothing is sent anywhere.
var LENS = { mod: null, loading: null, err: "", req: null, open: false };
function lensShown() { return typeof modesShown === "function" && modesShown() && (MODES.tab === "Lenses" || MODES.tab === "Sonification"); }
function lensLoad() {
  if (LENS.mod) return Promise.resolve(LENS.mod);
  if (!LENS.loading) LENS.loading = import("./__LAZY_LENS__").then(m => {
    m.init({ get S() { return S; }, get t() { return simTime; }, get sel() { return selected; }, get map() { return MAPMODE; },
      get low() { return QUALITY === PRESETS.low || (typeof isPhone === "function" && isPhone()); },
      shareUrl, toast, esc, fmt, shortName, Sound, phone: () => typeof isPhone === "function" && isPhone(), openTab: t => openNews(t, "modes") });
    LENS.mod = m; return m;
  }).catch(e => { LENS.loading = null; LENS.err = "The Lenses could not be loaded. Check your connection and open this tab again."; throw e; });
  return LENS.loading;
}
function lensMount(tab) {
  const el = $("lensRoot"); if (!el) return;
  LENS.open = true;
  lensLoad().then(m => { if ($("lensRoot") === el) m.mount(el, Object.assign({ tab }, LENS.req || {})); LENS.req = null; })
    .catch(() => { if ($("lensRoot") === el) el.innerHTML = `<p class="note">${LENS.err}</p>`; });
}
function lensTabHTML() {
  setTimeout(() => lensMount("lens"), 0);
  return `<div id="lensRoot" class="lens"><p class="note">Loading the Lenses…</p></div>`;
}
// v0.98 GRAVITAS System Sonification: the system's orbits as music, and a small studio to make it your own
function sonTabHTML() {
  setTimeout(() => lensMount("son"), 0);
  return `<div id="lensRoot" class="lens son"><p class="note">Loading the Sonification…</p></div>`;
}
// the window closed or another tab opened: the music stops and the lens lets go of what it holds
function lensCheck() {
  if (!LENS.open || lensShown() && $("lensRoot")) return;
  LENS.open = false; if (LENS.mod) LENS.mod.unmount();
}
new MutationObserver(lensCheck).observe($("news"), { attributes: true, attributeFilter: ["style"] });
new MutationObserver(lensCheck).observe($("newsBody"), { childList: true });
MODES_TABS = Object.assign({ "Combat": MODES_TABS["Combat"], "Collisions": MODES_TABS["Collisions"], "Sonification": sonTabHTML, "Lenses": lensTabHTML }, MODES_TABS);
// a link to a lens: ?system=…&lens=rhythm|landscape|time|sonify[&lp=<body>|<body>][&lf=<centre>]
{ const q = new URLSearchParams(location.search), v = q.get("lens");
  if (v && /^(rhythm|landscape|time|sonify)$/.test(v)) { const until = Date.now() + 60e3;
    LENS.req = { view: v, lp: (q.get("lp") || "").split("|").filter(Boolean).map(Number), lf: q.get("lf") != null && q.get("lf") !== "" ? +q.get("lf") : null };
    const go = () => { if (S && S.bodies && S.bodies.length) { setTimeout(() => openNews(v === "sonify" ? "Sonification" : "Lenses", "modes"), 900); return; } if (Date.now() < until) setTimeout(go, 500); };
    setTimeout(go, 1000); } }
