// ------------------------------------------------------------------- time
const tzSel = $("tz"), localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
[...new Set([localTz, "UTC", "Europe/Istanbul", "Europe/London", "Europe/Berlin", "Europe/Moscow", "America/New_York", "America/Chicago", "America/Los_Angeles", "America/Sao_Paulo", "Asia/Tokyo", "Asia/Shanghai", "Asia/Kolkata", "Australia/Sydney"])]
  .forEach(z => tzSel.add(new Option(z === localTz ? `${z} (yours)` : z, z)));
const pad = n => String(n).padStart(2, "0");
const gameTime = ms => { const d = new Date(ms); return `${d.getUTCFullYear() + 1286}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`; };
// v0.75.7: one formatter per time zone (building a new one every frame cost more than the rest of the clock)
let _ltZ = null, _ltF = null;
const localTime = ms => { if (_ltZ !== tzSel.value) { _ltZ = tzSel.value; _ltF = new Intl.DateTimeFormat("en-GB", { timeZone: _ltZ, dateStyle: "medium", timeStyle: "medium" }); } return _ltF.format(ms); };
function tzLabel() {
  const z = tzSel.value, parts = new Intl.DateTimeFormat("en-GB", { timeZone: z, timeZoneName: "shortOffset" }).formatToParts(Date.now());
  const off = (parts.find(p => p.type === "timeZoneName") || {}).value || "";
  $("tzName").textContent = `${z === "UTC" ? "UTC" : z.split("/").pop().replace(/_/g, " ")} (${off.replace("GMT", "UTC") || "UTC"})${z === localTz ? "" : " ✎"}`;
}
tzSel.value = localTz; tzLabel();
$("tzName").onclick = () => { $("tzName").style.display = "none"; tzSel.style.display = "inline-block"; tzSel.focus(); };
tzSel.onchange = tzSel.onblur = () => { tzLabel(); tzSel.style.display = "none"; $("tzName").style.display = "inline"; };
$("speed").onchange = e => { setSpeed(+e.target.value, true); e.target.blur(); };   // v0.94: then Space and the arrows work at once
$("time").addEventListener("click", e => { const b = e.target.closest && e.target.closest("button"); if (b) setTimeout(() => b.blur(), 0); });
// ---- v0.94: any speed, and the keyboard like a media player
const SPEED_STEPS = [-86400, -3600, -1800, -900, -60, 0, 1, 60, 900, 1800, 3600, 86400];
function speedLabel(v) {
  if (v === 0) return "❚❚ Paused"; if (v === 1) return "▶ Real time";
  const a = Math.abs(v), d = v < 0 ? "◀" : "▶", u = a % 86400 === 0 ? `${a / 86400} day` + (a > 86400 ? "s" : "") : a % 3600 === 0 ? `${a / 3600} hour` + (a > 3600 ? "s" : "") : a % 60 === 0 ? `${a / 60} min` : `${a}×`;
  return `${a >= 1800 ? d + d : d} ${u}${a % 60 === 0 ? "/s" : ""}`;
}
// one place sets the speed: the list shows it (a speed of your own gets its own line), and LIVE follows
function setSpeed(v, quiet) {
  v = Math.round(+v || 0); const sel = $("speed");
  sel.querySelectorAll("option[data-c]").forEach(o => { if (+o.value !== v) o.remove(); });
  if (![...sel.options].some(o => +o.value === v)) { const o = new Option(speedLabel(v), String(v)); o.dataset.c = "1";
    const after = [...sel.options].find(x => +x.value > v); sel.insertBefore(o, after || null); }
  sel.value = String(v); speed = v; LIVE = v === 1 && Math.abs(simTime - Date.now()) < 60000;
  if (v !== 0) TK.last = v;
  if (!quiet) toast(speedLabel(v));
}
const spMin = () => { const n = Math.round(+$("spMin").value || 0); const m = Math.max(1, Math.min(99999, n || 5)); $("spMin").value = m; return m; };
$("spFw").onclick = () => setSpeed(spMin() * 60);
$("spBk").onclick = () => setSpeed(-spMin() * 60);
$("spMin").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); setSpeed((e.shiftKey ? -1 : 1) * spMin() * 60); } });
$("keysBtn").onclick = () => toast("Space: play or pause · ← →: slower or faster · hold ← or →: wind back or forward");
// Space plays and pauses. ← and → step through the speeds. Held down, they wind fast (a day a second, then a week),
// and the speed you had comes back when you let go. Never while typing, on a button, or with a window open
const TK = { last: 1, key: "", t0: 0, timer: 0, wind: false, saved: 0 };
function timeKeysOk(e) {
  const t = e.target;
  if (e.ctrlKey || e.metaKey || e.altKey || typing(t)) return false;
  if (t && t !== document.body && t.closest) {
    if (t.id === "smapView") { if (!t.dataset.mouse) return false; }   // reached with Tab: the arrows move the map
    else if (t.closest("button, select, a, summary, label, [role=switch], [role=button], [tabindex]")) return false;
  }
  if (document.querySelector('#news[style*="flex"], #rep[style*="flex"], #pairDlg[style*="flex"], #syncDlg[style*="flex"]')) return false;
  if (document.body.classList.contains("cbFull") || ($("opBoard") && $("opBoard").classList.contains("show")) || (typeof tour !== "undefined" && tour)) return false;
  return !!S;
}
function speedStep(dir) {
  const i = SPEED_STEPS.findIndex(s => s >= speed), at = SPEED_STEPS[i] === speed ? i : dir > 0 ? i - 1 : i;
  setSpeed(SPEED_STEPS[Math.max(0, Math.min(SPEED_STEPS.length - 1, at + dir))]);
}
function windStart() {
  if (!TK.key) return; const dir = TK.key === "ArrowRight" ? 1 : -1;
  TK.wind = true; TK.saved = speed; setSpeed(dir * 86400, true); toast(dir > 0 ? "▶▶ winding forward: 1 day/s" : "◀◀ winding back: 1 day/s");
  TK.timer = setTimeout(() => { if (TK.wind) { setSpeed(dir * 604800, true); toast(dir > 0 ? "▶▶ winding forward: 1 week/s" : "◀◀ winding back: 1 week/s"); } }, 1500);
}
addEventListener("keydown", e => {
  if (e.key !== " " && e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  if (!timeKeysOk(e)) return;
  e.preventDefault();
  if (e.repeat) return;
  if (e.key === " ") { setSpeed(speed === 0 ? (TK.last || 1) : 0); return; }
  TK.key = e.key; TK.t0 = performance.now(); clearTimeout(TK.timer); TK.timer = setTimeout(windStart, 380);
});
addEventListener("keyup", e => {
  if (e.key !== TK.key) return;
  clearTimeout(TK.timer); const dir = TK.key === "ArrowRight" ? 1 : -1; TK.key = "";
  if (TK.wind) { TK.wind = false; setSpeed(TK.saved, true); toast(`${speedLabel(TK.saved)}`); } else speedStep(dir);
});
addEventListener("blur", () => { clearTimeout(TK.timer); if (TK.wind) { TK.wind = false; setSpeed(TK.saved, true); } TK.key = ""; });
$("now").onclick = () => { simTime = Date.now(); setSpeed(1, true); LIVE = true; };
$("jump").onchange = e => { const m = /^(\d+)-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(e.target.value); if (m) {
  const y = +m[1], real = y < 3000;                 // v0.61: a year like 2026 is a real-world date, 3312 is game time
  simTime = Date.UTC(real ? y : y - 1286, +m[2] - 1, +m[3], +m[4], +m[5]); LIVE = false;
  if (real) toast(`${y} read as a real-world year: game time ${y + 1286}`); } };

