// v0.99.18, v0.99.19: the "Get the Windows app" card on the main screen. It stays: it is not dismissed and nothing is remembered.
// Not shown inside the GRAVITAS app (its map windows) and not on a paired phone (CSS); small screens have an About-sheet row instead.
(function appPromoInit() {
  const el = $("apPromo"); if (!el) return;
  const inApp = (typeof APP_WINDOW !== "undefined" && APP_WINDOW) || /[?&](app|lab|selftest)=/.test(location.search);   // the app's map window and its System-map picture window
  if (inApp) { el.remove(); const r = $("apRow"); if (r) r.remove(); layoutLeft(); return; }
  el.hidden = false; layoutLeft();
  const go = $("apPromoGo"), rg = $("apRowGo");
  if (go) go.onclick = () => openNews("GRAVITAS APP", "plugin");
  if (rg) rg.onclick = () => openNews("GRAVITAS APP", "plugin");
})();
