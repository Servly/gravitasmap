// ------------------------------------------------------------------ calm (v0.99.24)
// The page has two endless little animations (the logo's orbiting dot, the Sync dot breathing). Each one makes the browser's GPU process
// compose the page again and again, even when nothing else moves: measured in the GRAVITAS app's map window it held the GPU process at
// about one full core (a tester's PC showed 14 % GPU and 17 % in all). They are paused in the app's map window, and in any browser
// while this page is not the one in front (second monitor, the game in front). Nothing else changes.
(function () {
  let calm = false;
  function setCalm(on) {
    if (on === calm) return;
    calm = on;
    document.documentElement.classList.toggle("calm", on);
    document.querySelectorAll("svg").forEach(s => { try { if (on) s.pauseAnimations(); else s.unpauseAnimations(); } catch (e) {} });
  }
  const want = () => APP_WINDOW || APP_SMAP || document.hidden || !document.hasFocus();
  const check = () => setCalm(want());
  addEventListener("focus", check); addEventListener("blur", check); document.addEventListener("visibilitychange", check);
  check(); setTimeout(check, 1500);   // (the first look can come before the page's own pictures exist)
})();
