// v0.99.18: the "Get the Windows app" card on the main screen. Not shown inside the GRAVITAS app (its map windows) and not on a paired phone (CSS).
// Hiding it is remembered in this browser only (localStorage, in try/catch, no cookie, nothing sent anywhere) and lasts 90 days.
(function appPromoInit() {
  const el = $("apPromo"); if (!el) return;
  const inApp = (typeof APP_WINDOW !== "undefined" && APP_WINDOW) || /[?&](app|lab|selftest)=/.test(location.search);   // the app's map window and its System-map picture window
  if (inApp) { el.remove(); const r = $("apRow"); if (r) r.remove(); layoutLeft(); return; }
  const KEY = "gvAppPromo", DAYS90 = 90 * 864e5;
  let hiddenAt = 0; try { hiddenAt = +localStorage.getItem(KEY) || 0; } catch (e) {}
  if (hiddenAt && Date.now() - hiddenAt < DAYS90) { el.remove(); layoutLeft(); }
  else { el.hidden = false; layoutLeft(); }
  const hide = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {} if (el.parentNode) el.remove(); layoutLeft(); };
  const x = $("apPromoX"), go = $("apPromoGo"), rg = $("apRowGo");
  if (x) x.onclick = hide;
  if (go) go.onclick = () => { openNews("GRAVITAS APP", "plugin"); hide(); };      // opening the app page once counts as seen
  if (rg) rg.onclick = () => openNews("GRAVITAS APP", "plugin");
})();
