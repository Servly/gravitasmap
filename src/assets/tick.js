// v0.78.6 GRAVITAS: a one-second clock for Sync. A browser slows the timers of a page that is hidden (the game in front
// of it) down to about once a minute; a small worker like this one keeps its own pace, and its tick wakes the page.
setInterval(() => postMessage(0), 1000);
