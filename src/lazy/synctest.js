// ------------------------------------------------------------ v0.99.3 ?selftest=sync: Sync with the game, checked without the game
// Loaded only by that link (25-self-test.js). Sync's states are put on screen through the app's own code (yahUpdate,
// syncStWord, syncWouldReturn), with the SYNC fields the Journal would set, then put back. It checks what broke
// before only with Sync on (v0.99.1): a long name squeezed beside You are here, the Sync title cut by a long state,
// and auto-jump taking back a system the visitor opened. Nothing is read from the game and nothing is sent.
const NAMES = ["Col 285 Sector VR-E b27-1", "Swoilz FR-W b31-0", "Sol"];
const WORDS = ["OFF", "LIVE", "WAITING", "QUIET", "PAUSED", "NO FOLDER", "GAME CLOSED", "RECONNECTING", "needs Chrome or Edge"];
const KEEP = ["on", "here", "at", "sc", "dest", "auto", "loading", "miss", "live"];
export async function run(g) {
  const rep = [], add = (sys, check, ok, detail = "") => rep.push({ sys, check, ok, detail });
  const wait = ms => new Promise(r => setTimeout(r, ms)), $ = g.$, SYNC = g.SYNC;
  const saved = Object.fromEntries(KEEP.map(k => [k, SYNC[k]])), word = ($("syncSt") || {}).textContent;
  const box = el => el.getBoundingClientRect();
  // the title row: the name is never squeezed (a word per line), and nothing leaves the panel
  const title = () => {
    const h = $("sysname"), ph = h.parentElement, top = box($("top")), r = box(h), lh = parseFloat(getComputedStyle(h).fontSize) * 1.45;
    const roomy = r.width >= ph.clientWidth * 0.6 || r.height <= lh * 1.5;
    const out = [...ph.children].filter(c => c.getClientRects().length && (box(c).right > top.right + 1 || box(c).left < top.left - 1)).map(c => c.id || c.tagName);
    return [roomy && !out.length, `name ${Math.round(r.width)}×${Math.round(r.height)} px in ${ph.clientWidth} px${out.length ? `, outside: ${out.join(", ")}` : ""}`];
  };
  try {
    for (const name of NAMES) {
      const ok = await g.loadSystem(name, { user: true }); await wait(900);
      if (!ok || !g.S || g.S.sys.name.toLowerCase() !== name.toLowerCase()) { add(name, "loads", false, "could not load"); continue; }
      const sys = g.S.sys.name;
      SYNC.on = false; g.yahUpdate(); await wait(60);
      let [t, d] = title(); add(sys, "title, Sync off", t, d);
      SYNC.on = true; SYNC.here = sys; SYNC.at = null; SYNC.sc = false; SYNC.live = null; g.yahUpdate(); await wait(60);
      const chip = $("yahSys");
      [t, d] = title(); add(sys, "title with You are here", t && chip.style.display !== "none", d + (chip.style.display === "none" ? ", You are here not shown" : ""));
      // in supercruise, heading to a body: the long "In supercruise · heading to …" under the name
      SYNC.at = { arrived: Date.now() - g.SYNC_ARRIVE_MS - 1000, bodyId: g.S.bodies[0].bodyId }; SYNC.sc = true;   // (arrived at the star a while ago)
      SYNC.dest = { Name: g.S.bodies[g.S.bodies.length - 1].name }; g.yahUpdate(); await wait(60);
      [t, d] = title(); const cr = box(chip), tr = box($("top"));
      add(sys, "title in supercruise", t && chip.classList.contains("long") && cr.right <= tr.right + 1, d + ` · "${chip.textContent}"${chip.classList.contains("long") ? "" : " (not the long form)"}`);
    }
    // the Sync title with every state word: never cut, the state inside the panel
    const p = $("sync"), b = p && p.querySelector(".srow b");
    if (p && b) for (const w of WORDS) {
      g.syncStWord(w); await wait(30);
      const s = box($("syncSt")), pr = box(p);
      add("Sync", `title with "${w}"`, b.scrollWidth <= b.clientWidth + 1 && s.right <= pr.right + 1 && s.width > 0, `title ${b.clientWidth}/${b.scrollWidth} px${p.classList.contains("stDown") ? ", state under it" : ""}`);
    }
    // auto-jump: a system the visitor opened stays; one opened by nobody (a late answer) goes back to the ship's
    const ship = "Sol", other = NAMES[0];
    SYNC.auto = true; SYNC.loading = false; SYNC.miss = ""; SYNC.on = true;
    await g.loadSystem(other, { user: true }); SYNC.here = ship; await wait(300);
    add(other, "auto-jump: opened by you, it stays", !g.syncWouldReturn(), `LOAD.by = ${g.LOAD.by}`);
    await g.loadSystem(other); SYNC.here = ship; await wait(300);
    add(other, "auto-jump: opened by nobody, back to the ship", g.syncWouldReturn(), `LOAD.by = ${g.LOAD.by}`);
  } catch (e) { add("Sync", "ran to the end", false, e.message); }
  Object.assign(SYNC, saved); g.yahUpdate(); if (word != null) g.syncStWord(word);
  return rep;
}
