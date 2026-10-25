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
$("speed").onchange = e => { speed = +e.target.value; LIVE = speed === 1 && Math.abs(simTime - Date.now()) < 60000; };
$("now").onclick = () => { simTime = Date.now(); speed = 1; $("speed").value = "1"; LIVE = true; };
$("jump").onchange = e => { const m = /^(\d+)-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(e.target.value); if (m) {
  const y = +m[1], real = y < 3000;                 // v0.61: a year like 2026 is a real-world date, 3312 is game time
  simTime = Date.UTC(real ? y : y - 1286, +m[2] - 1, +m[3], +m[4], +m[5]); LIVE = false;
  if (real) toast(`${y} read as a real-world year: game time ${y + 1286}`); } };

