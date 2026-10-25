// ------------------------------------------------------------ v0.90 event cards
// An eclipse, a sunrise or a sunset at a settlement becomes a small card: what happens, where, when (game time and the
// visitor's own time), a live countdown, a link that opens the same card for a friend, and a calendar file (.ics) with a
// reminder 15 minutes before. The link carries only the system, the body, the kind and the two times.
const EVK = { eclipse: ["ECLIPSE", "◐"], rise: ["SUNRISE", "☀"], set: ["SUNSET", "☾"] };
let EVC = null;
function evLink(ev) {
  const p = new URLSearchParams(); p.set("system", ev.sys); p.set("body", ev.body); p.set("tab", "Sky");
  p.set("ev", [ev.kind, Math.round(ev.ta), Math.round(ev.tz || ev.ta)].join(".")); if (ev.st) p.set("evs", ev.st); if (ev.by) p.set("evb", ev.by);
  return location.origin + location.pathname + "?" + p.toString().replace(/%20/g, "+");
}
const evLocalEnd = (a, z) => { const d = o => new Intl.DateTimeFormat("en-GB", Object.assign({ timeZone: tzSel.value }, o)), day = { day: "numeric", month: "short" };   // the end: the time only on the same day
  return d(day).format(a) === d(day).format(z) ? d({ hour: "2-digit", minute: "2-digit" }).format(z) : evLocal(z); };
const evLocal = ms => new Intl.DateTimeFormat("en-GB", { timeZone: tzSel.value, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(ms);
function evCount(ev) {                                 // the countdown, against real time (the game clock is UTC)
  const now = Date.now(), f = ms => { const s = Math.max(0, Math.round(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60, x = s % 60;
    return d ? `${d} d ${h} h ${m} min` : h ? `${h} h ${String(m).padStart(2, "0")} min ${String(x).padStart(2, "0")} s` : `${m} min ${String(x).padStart(2, "0")} s`; };
  if (now < ev.ta) return ["soon", `starts in ${f(ev.ta - now)}`];
  if (ev.tz && now < ev.tz) return ["now", `happening now · ends in ${f(ev.tz - now)}`];
  return ["past", `was ${f(now - (ev.tz || ev.ta))} ago`];
}
function evTitle(ev) {
  const b = S && syncSame(S.sys.name, ev.sys) ? S.byId.get(+ev.body) : null, bn = b ? shortName(b, S.sys.name) : `body ${ev.body}`;
  if (ev.kind === "eclipse") return `Eclipse on ${bn}${ev.by ? `, in the shadow of ${ev.by}` : ""}`;
  return `${ev.kind === "rise" ? "Sunrise" : "Sunset"} at ${ev.st || bn}${ev.st ? ` (${bn})` : ""}`;
}
function evIcs(ev) {
  const z = ms => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, ""), t = s => String(s).replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const end = ev.tz && ev.tz > ev.ta ? ev.tz : ev.ta + 15 * 60000, title = `${evTitle(ev)} · ${ev.sys}`, link = evLink(ev);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GRAVITAS//gravitasmap.com//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:${ev.kind}-${ev.body}-${Math.round(ev.ta)}-${String(ev.sys).replace(/\W+/g, "")}@gravitasmap.com`, `DTSTAMP:${z(Date.now())}`, `DTSTART:${z(ev.ta)}`, `DTEND:${z(end)}`,
    `SUMMARY:${t(title)}`, `DESCRIPTION:${t(`Elite Dangerous, ${ev.sys}. Game time ${gameTime(ev.ta).slice(0, 16)} (UTC). Computed by GRAVITAS from Spansh data: ${link}`)}`,
    `URL:${link}`, "BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", `DESCRIPTION:${t(title)}`, "END:VALARM", "END:VEVENT", "END:VCALENDAR"];
  return lines.join("\r\n") + "\r\n";
}
function evCard(ev) {
  if (!EVC) {
    EVC = document.createElement("div"); EVC.id = "evCard"; EVC.className = "panel"; EVC.setAttribute("role", "dialog"); EVC.setAttribute("aria-label", "Event");
    document.body.appendChild(EVC);
    EVC.addEventListener("click", async e => {
      const a = e.target.closest("[data-a]"); if (!a) return; const v = EVC._ev;
      if (a.dataset.a === "x") { EVC.style.display = "none"; return; }
      if (a.dataset.a === "link") { try { await navigator.clipboard.writeText(evLink(v)); a.textContent = "Link copied"; } catch (x) { prompt("Copy this link:", evLink(v)); } return; }
      if (a.dataset.a === "ics") { const u = URL.createObjectURL(new Blob([evIcs(v)], { type: "text/calendar" })), l = document.createElement("a");
        l.href = u; l.download = `gravitas-${String(evTitle(v)).replace(/\W+/g, "-").toLowerCase().slice(0, 48)}.ics`; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); return; }
      if (a.dataset.a === "go") { const b = S && S.byId.get(+v.body); if (b) try { infoTab = "Sky"; select(b, !MAPMODE); } catch (x) {} EVC.style.display = "none"; }   // v0.90.6: straight to its Sky tab
    });
    addEventListener("keydown", e => { if (e.key === "Escape" && EVC.style.display === "block") EVC.style.display = "none"; });
    TICK.add(evTick);
  }
  EVC._ev = ev; const [k, ic] = EVK[ev.kind] || ["EVENT", "•"];
  EVC.innerHTML = `<div class="evh"><b>${ic} ${k}</b><button data-a="x" title="Close (Esc)">✕</button></div>
    <div class="evt">${esc(evTitle(ev))}</div><div class="evs">${esc(ev.sys)}</div>
    <div class="evw"><span>Game time (UTC)</span><b>${esc(gameTime(ev.ta).slice(0, 16))}${ev.tz && ev.tz > ev.ta ? ` → ${esc(gameTime(ev.tz).slice(gameTime(ev.ta).slice(0, 10) === gameTime(ev.tz).slice(0, 10) ? 11 : 5, 16))}` : ""}</b>
      <span>Your time</span><b>${esc(evLocal(ev.ta))}${ev.tz && ev.tz > ev.ta ? ` → ${esc(evLocalEnd(ev.ta, ev.tz))}` : ""}</b></div>
    <div class="evc"></div>
    <div class="eva"><button data-a="ics">Add to calendar</button><button data-a="link">Copy link</button>${S && syncSame(S.sys.name, ev.sys) && !(selected && selected.bodyId === +ev.body) ? `<button data-a="go">Show the body</button>` : ""}</div>
    <div class="evn">Computed from the orbits in Spansh's data${ev.kind !== "eclipse" ? ", with the facing still being checked in the game" : ""}. The calendar file reminds you 15 minutes before.</div>`;
  EVC.style.display = "block"; evTick();
}
function evTick() { if (!EVC || EVC.style.display !== "block") return; const [c, t] = evCount(EVC._ev), e = EVC.querySelector(".evc"); e.className = "evc " + c; if (e.textContent !== t) e.textContent = t; }
// the buttons that open a card: the eclipse calendar's headline, sunrise and sunset at a settlement
// v0.90.5: the panels around these buttons are redrawn several times a second (live times), and a button replaced between
// press and release gets no click: it took 3 to 5 presses. The card now opens on the release, matched to what was pressed
function evFrom(el) {
  const a = el.closest && el.closest("[data-evcard]"); if (a) return { kind: a.dataset.evcard, sys: S.sys.name, body: +a.dataset.b, ta: +a.dataset.ta, tz: +a.dataset.tz || 0, by: a.dataset.by || "" };
  const r = el.closest && el.closest(".dnr[data-ev]"); if (!r) return null;
  const box = r.closest(".dns, .stdn"), stn = box && box.dataset.st, bid = box && +box.dataset.b;
  return { kind: r.dataset.ev, sys: S.sys.name, body: bid || (selected && selected.bodyId), ta: +r.dataset.t, tz: 0, st: stn || "" };
}
const EVP = { down: null, t: 0 };
document.addEventListener("pointerdown", e => { EVP.down = e.button === 0 && S && e.target.closest ? (evFrom(e.target) ? { x: e.clientX, y: e.clientY, kind: evFrom(e.target).kind } : null) : null; }, true);
document.addEventListener("pointerup", e => {
  const d = EVP.down; EVP.down = null; if (!d || !S || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) return;
  const ev = evFrom(document.elementFromPoint(e.clientX, e.clientY) || e.target); if (!ev || ev.kind !== d.kind) return;
  EVP.t = performance.now(); evCard(ev);
}, true);
document.addEventListener("click", e => {
  if (!S || !e.target.closest || !evFrom(e.target)) return;
  e.stopPropagation(); if (performance.now() - EVP.t < 800) return;   // already opened on the release
  const ev = evFrom(e.target); if (ev) evCard(ev);                     // a keyboard press (Enter) still works
}, true);
// a shared card: ?ev=kind.start.end opens it once the system is shown
{
  const P = new URLSearchParams(location.search), v = P.get("ev");
  if (v && /^(eclipse|rise|set)\.\d{12,14}\.\d{12,14}$/.test(v)) {
    const [kind, ta, tz] = v.split("."), want = { kind, ta: +ta, tz: +tz !== +ta ? +tz : 0, body: +P.get("body"), sys: P.get("system") || "", st: (P.get("evs") || "").slice(0, 80), by: (P.get("evb") || "").slice(0, 40) };
    let n = 0; const wait = () => { if (S && syncSame(S.sys.name, want.sys)) evCard(want); else if (++n < 120) setTimeout(wait, 500); };
    setTimeout(wait, 1200);
  }
}
