// ------------------------------------------------------------ appearance
// the star's class letter. v0.77.1: a T Tauri star (class TTS) is a young sun-like star, not a T brown dwarf
function starLetter(b) { return /T Tauri/i.test(b.subType || "") || /^TTS/i.test(b.spectralClass || "") ? "K" : (b.spectralClass || b.subType || "M")[0].toUpperCase(); }
function starColor(b) {
  const s = (b.subType || "") + " " + (b.spectralClass || "");
  if (/Black Hole/i.test(s)) return 0x301048;
  if (/Neutron/i.test(s)) return 0xaff4ff;
  if (/White Dwarf/i.test(s)) return 0xdcefff;
  if (/Wolf-Rayet/i.test(s)) return 0xa4bcff;
  const c = starLetter(b);
  return { O: 0x9bbcff, B: 0xaac8ff, A: 0xe4ecff, F: 0xfff6e8, G: 0xfff1c8, K: 0xffcf92, M: 0xffa070, L: 0xe06040, T: 0xb04060, Y: 0x803050, C: 0xff6a40, S: 0xff9060 }[c] || 0xffd0a0;
}
const isGiant = b => /gas giant|Water giant|Helium/i.test(b.subType || "");
const hasAtm = b => b.type === "Planet" && !isGiant(b) && ((b.atmosphereType && !/^No atmosphere$/i.test(b.atmosphereType)) || (b.atmosphereComposition && Object.keys(b.atmosphereComposition).length));
const sigCount = (b, re) => { const s = b.signals && (b.signals.signals || b.signals); if (!s || typeof s !== "object") return 0; return Object.entries(s).filter(([k]) => re.test(k)).reduce((t, [, v]) => t + (+v || 0), 0); };
const stationCount = b => (b.stations || []).length;
function badges(b) {
  let h = "";
  if (b.isLandable) h += '<span class="bdg l" title="Landable"><svg viewBox="0 0 10 14" width="8" height="11" style="vertical-align:-2px"><path fill="currentColor" d="M5.2 0C7.6 0 9 2.4 8.6 5.1 8.2 7.6 6.6 9 4.8 9 2.8 9 1.6 7.4 1.6 5 1.6 2.4 3 0 5.2 0zM4.6 10c1.3 0 2.2.8 2.2 1.9S5.9 14 4.6 14 2.4 13.1 2.4 12 3.3 10 4.6 10z"/></svg></span>';
  if (hasAtm(b)) h += '<span class="bdg a">A</span>';
  const nS = stationCount(b) + orbitalCount(b);                       // v0.52: stations in orbit count too
  if (nS) h += `<span class="bdg s" title="Stations and settlements">S${nS > 1 ? nS : ""}</span>`;
  const bio = sigCount(b, /Biological/), geo = sigCount(b, /Geological/);
  if (bio) h += `<span class="bdg b">B${bio}</span>`;
  if (geo) h += `<span class="bdg g">G${geo}</span>`;
  return h;
}
const gColor = g => g < 0.5 ? "#7dff9b" : g < 1.2 ? "#d8ff7a" : g < 2 ? "#ffcc66" : "#ff6a7a";
const tColor = t => t < 150 ? "#8fc8ff" : t < 260 ? "#bfe8ff" : t < 330 ? "#d8ff7a" : t < 800 ? "#ffcc66" : "#ff6a7a";
const temp = k => k == null ? "—" : ($("vTemp").value === "C" ? `${fmt(k - 273.15, 0)} °C` : `${fmt(k, 0)} K`);
function detailLine(b) {
  if (b.type === "Star") return `<span style="color:#ffd9a8">${fmt(b.solarMasses, 3)} M☉ · ${temp(b.surfaceTemperature)}</span>`;
  return `<span style="color:${gColor(b.gravity || 0)}">▼ ${fmt(b.gravity, 2)} g</span> · <span style="color:${tColor(b.surfaceTemperature || 0)}">🌡 ${temp(b.surfaceTemperature)}</span>`;
}

