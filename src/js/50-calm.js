// ------------------------------------------------------------------ calm (v0.99.24)
// The page has two endless little animations (the logo's orbiting dot, the Sync dot breathing). Each one makes the browser's GPU process
// compose the page again and again, even when nothing else moves: measured in the GRAVITAS app's map window it held the GPU process at
// about one full core (a tester's PC showed 14 % GPU and 17 % in all). They are paused in the app's map window, and in any browser
// while this page is not the one in front (second monitor, the game in front). Nothing else changes.
// v0.99.35: only the ENDLESS animations are paused. Before, a CSS rule paused every animation, which also froze the one-shot ones (a panel opening or closing,
// the route messages and bars): in the app's map window a panel stayed half open and 'ROUTE RECALCULATED' never went away.
(function () {
  let calm = false, timer = 0; const mine = new Set();
  function endless(a) { try { const t = a.effect && a.effect.getComputedTiming(); return !!t && t.iterations === Infinity; } catch (e) { return false; } }
  function pauseEndless() { try { for (const a of document.getAnimations()) if (a.playState === "running" && endless(a)) { a.pause(); mine.add(a); } } catch (e) {} }
  function setCalm(on) {
    if (on === calm) return;
    calm = on;
    document.documentElement.classList.toggle("calm", on);
    document.querySelectorAll("svg").forEach(s => { try { if (on) s.pauseAnimations(); else s.unpauseAnimations(); } catch (e) {} });
    if (on) { pauseEndless(); timer = setInterval(pauseEndless, 1000); }                  // an endless animation that starts later is caught within a second
    else { clearInterval(timer); timer = 0; for (const a of mine) { try { a.play(); } catch (e) {} } mine.clear(); }
  }
  const want = () => APP_WINDOW || APP_SMAP || document.hidden || !document.hasFocus();
  const check = () => setCalm(want());
  addEventListener("focus", check); addEventListener("blur", check); document.addEventListener("visibilitychange", check);
  check(); setTimeout(check, 1500);   // (the first look can come before the page's own pictures exist)
})();
