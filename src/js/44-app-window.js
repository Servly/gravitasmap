// ------------------------------------------------------------ v0.99.13 GRAVITAS APP window (the App button in the Sync card)
// One page: hero, what it does, where to get it, SmartScreen steps, what it does not do.
// The latest installer comes from /gravitas-app/version.json (the same signed file the app reads). Only a link on this site is accepted.
const APPW_IC = {
  map: '<path d="M2 3.5 6 2l4 1.5L14 2v10.5L10 14l-4-1.5L2 14z"/><path d="M6 2v10.5M10 3.5V14"/>',
  combat: '<circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="1.6"/><path d="M8 .8v3M8 12.2v3M.8 8h3M12.2 8h3"/>',
  thargoid: '<path d="M8 1.8c3 0 5.2 2.2 5.2 4.9 0 1.5-.7 2.5-1.6 3.2V12H4.4V9.9C3.5 9.2 2.8 8.2 2.8 6.7 2.8 4 5 1.8 8 1.8z"/><path d="M6 14.2v-2M10 14.2v-2M6 6.8h.01M10 6.8h.01"/>',
  debrief: '<path d="M2 13.5h12"/><path d="M3 13.5V8M6.5 13.5V4M10 13.5V9.5M13 13.5V2.5"/>',
  pvp: '<path d="m3 3 6.5 6.5M13 3 6.5 9.5M2.5 13.5l2-2M13.5 13.5l-2-2"/>',
  pair: '<rect x="1.8" y="3" width="8.5" height="6.5" rx="1"/><rect x="10.8" y="6" width="3.4" height="7" rx=".8"/><path d="M4.5 12h3"/>',
  dl: '<path d="M8 2v8M4.8 7 8 10.2 11.2 7M2.5 13h11"/>',
  shield: '<path d="M8 1.8 13 3.6v4c0 3-2 5.3-5 6.6-3-1.3-5-3.6-5-6.6v-4z"/><path d="m5.6 8 1.7 1.7 3-3.4"/>',
  eye: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/><path d="M2.5 13.5l11-11"/>',
  gh: '<path d="M6 12.5c-3 1-3-1.5-4.2-1.8M10 14v-2.2c0-.8.1-1.2-.4-1.7 1.9-.2 3.9-.9 3.9-4.2 0-.9-.3-1.700-.9-2.300.1-.6.1-1.500-.2-2.200 0 0-.7-.2-2.300.9a8 8 0 0 0-4.200 0C4.300 1.200 3.600 1.400 3.600 1.400c-.3.700-.3 1.600-.2 2.200-.6.600-.9 1.400-.9 2.300 0 3.300 2 4 3.900 4.200-.5.400-.5 1-.4 1.700V14"/>',
  win: '<rect x="2" y="2" width="5.4" height="5.4" rx=".6"/><rect x="8.6" y="2" width="5.4" height="5.4" rx=".6"/><rect x="2" y="8.6" width="5.4" height="5.4" rx=".6"/><rect x="8.6" y="8.6" width="5.4" height="5.4" rx=".6"/>',
  copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.4"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/>',
};
const appIc = n => `<svg class="apIc" viewBox="0 0 16 16" aria-hidden="true">${APPW_IC[n]}</svg>`;

function appWindowHtml() {
  const inApp = typeof APP_WINDOW !== "undefined" && APP_WINDOW;
  setTimeout(appInfoFill, 0);
  const feat = [
    ["map", "Map window", "This map in a window of its own that follows you in the game by itself. No folder to choose.", "The GRAVITAS map in its own window, synced with the game"],
    ["combat", "Combat windows", "Targets, bounties and a fight report over your game.", "Combat windows drawn over the game"],
    ["thargoid", "Thargoid hunts", "A hunt card and a report after the wave.", "Thargoid hunt card and report"],
    ["debrief", "Debrief", "See which ship keys you pressed in a fight.", "Debrief: a timeline of a fight from your own files"],
    ["pvp", "PVP <i>Preview</i>", "Two friends record their own fight and compare.", "PVP: still a preview"],
    ["pair", "Phone and tablet", "Pair a second screen to follow the map.", "Pair a phone or tablet as a second screen"],
  ].map(f => `<li class="apF" title="${f[3]}">${appIc(f[0])}<div><b>${f[1]}</b><span>${f[2]}</span></div></li>`).join("");
  const copyBtn = (id, tip, label) => `<button type="button" class="apCopy" data-copy="${id}" title="${tip}">${appIc("copy")}<span>${label}</span></button>`;
  return `<div class="apW">
  <section class="apHero">
    <img class="apLogo" src="assets/gravitas-app-icon.png" width="88" height="88" alt="GRAVITAS app icon">
    <div class="apHeroT">
      <h2>GRAVITAS</h2>
      <p class="apTag">${inApp ? "You are in the GRAVITAS app. It updates itself." : "A free Windows app for Elite Dangerous CMDRs. The map, and your combat, over the game."}</p>
      <div class="apBadges"><span class="apBd" title="No price, no ads">Free</span><span class="apBd" title="The source code is public under the MIT licence">Open source (MIT)</span><span class="apBd" title="Runs on 64-bit Windows">Windows 64-bit</span><span class="apBd ver" id="appVer" title="The latest version">v...</span></div>
    </div>
  </section>
  <div class="q">WHAT IT DOES</div>
  <ul class="apFeat">${feat}</ul>
  <div class="q">${inApp ? "SHARE IT OR GET IT ON ANOTHER PC" : "GET IT"}</div>
  <div class="apGet">
    <div class="apCard off" title="The Microsoft Store version is not published yet">
      <div class="apCh">${appIc("win")}<b>Microsoft Store</b><span class="apPill">Coming soon</span></div>
      <p>The Store version is on its way. Nothing to click yet.</p>
      <span class="apBtn dis" role="button" aria-disabled="true" tabindex="-1">Not available yet</span>
    </div>
    <div class="apCard main">
      <div class="apCh">${appIc("dl")}<b>${inApp ? "Share with a friend" : "Installer"}</b><span class="apPill ok" id="appMeta">loading</span></div>
      <p>${inApp ? "Send this link to a friend who plays Elite Dangerous. It is the same installer you are using." : "A free installer for Windows. It sets itself up for your user only."}</p>
      <a id="appDl" class="apBtn go off" href="/gravitas-app/" target="_blank" rel="noopener" title="${inApp ? "The link to the latest installer, to send to a friend" : "Download the latest GRAVITAS installer for Windows"}">${appIc("dl")}<span id="appDlT">${inApp ? "Download link to share" : "Download for Windows"}</span></a>
      <div class="apErr" id="appErr" hidden>Could not load the latest version right now. Try again in a minute.</div>
    </div>
  </div>
  <div class="apHashW" id="appHashW" hidden>
    <div class="apHashH"><span>SHA-256</span>${copyBtn("appHash", "Copy the SHA-256 code", "Copy")}</div>
    <code class="apHash" id="appHash" tabindex="0" title="The SHA-256 code of the installer"></code>
    <div class="note">Compare this code with your downloaded file to check that it is the one we published. In PowerShell, run Get-FileHash on the file.</div>
  </div>
  <div class="apScan" id="appScan" hidden>${appIc("shield")}<span id="appScanT"></span> <a id="appVt" href="https://www.virustotal.com/" target="_blank" rel="noopener" title="Open the public VirusTotal report of this exact file" hidden>Open the VirusTotal report</a></div>
  <p class="note apNote" id="appScanNote" hidden>Why does a scanner flag it? The installer is not signed yet, and automatic engines are often more cautious with new, unsigned files. We do not know their exact reason. Signing comes with the Microsoft Store version and should help.</p>
  <div class="q">WINDOWS MAY WARN YOU</div>
  <ol class="apSteps">
    <li title="Open the file you downloaded"><i>1</i><span>Run the installer</span></li>
    <li title="SmartScreen shows a blue window. Click More info"><i>2</i><span>If Windows warns, click <b>More info</b></span></li>
    <li title="The Run anyway button appears after More info"><i>3</i><span>Click <b>Run anyway</b></span></li>
  </ol>
  <p class="note apNote">The installer is not signed yet. That is why SmartScreen asks. Signing comes with the Store version.</p>
  <ul class="apTrust">
    <li title="GRAVITAS reads the Journal and Status files the game writes on your PC">${appIc("shield")}<span>Reads only the game's own files on your PC</span></li>
    <li title="No ads and no tracking in the site or the app">${appIc("eye")}<span>No ads, no tracking</span></li>
    <li>${appIc("gh")}<span>Open source: <a href="https://github.com/Servly/gravitasmap" target="_blank" rel="noopener" title="The source code on GitHub (MIT)">github.com/Servly/gravitasmap</a></span></li>
  </ul>
</div>`;
}

function appCopy(el, btn) {
  const txt = (el.textContent || "").replace(/^SHA-256:\s*/, ""), lab = btn.querySelector("span");
  const done = () => { if (lab) { const o = lab.dataset.o || lab.textContent; lab.dataset.o = o; lab.textContent = "Copied"; clearTimeout(btn._t); btn._t = setTimeout(() => (lab.textContent = o), 1600); } };
  const old = () => { try { const t = document.createElement("textarea"); t.value = txt; t.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); done(); } catch (e) { toast("Could not copy. Select the text and copy it by hand."); } };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, old); else old();
}

function appInfoFill() {
  const a = $("appDl"); if (!a) return;
  $("newsBody").querySelectorAll(".apCopy").forEach(b => b.onclick = () => appCopy($(b.dataset.copy), b));
  fetch("/gravitas-app/version.json", { cache: "no-store" }).then(r => r.ok ? r.json() : Promise.reject()).then(v => {
    const ok = v && typeof v.url === "string" && (v.url.startsWith("https://gravitasmap.com/gravitas-app/") || v.url.startsWith(location.origin + "/gravitas-app/")) && /^[0-9.]{3,12}$/.test(v.latest || "");
    if (!ok) throw 0;
    a.href = v.url; a.classList.remove("off");
    $("appVer").textContent = "v" + v.latest;
    const mb = typeof v.size === "number" && v.size > 0 ? (v.size / 1048576).toFixed(1) + " MB" : "", dt = /^\d{4}-\d{2}-\d{2}$/.test(v.published || "") ? v.published : "";
    $("appMeta").textContent = ["v" + v.latest, mb, dt].filter(Boolean).join(" · ");
    if (/^[0-9a-f]{64}$/.test(v.sha256 || "")) { $("appHash").textContent = v.sha256; $("appHashW").hidden = false; appScanFill(v.sha256); }
  }).catch(() => { const m = $("appMeta"); if (!m) return; m.textContent = "unavailable"; m.classList.remove("ok"); m.classList.add("bad"); $("appErr").hidden = false; $("appVer").textContent = "version unknown"; a.removeAttribute("href"); a.setAttribute("aria-disabled", "true"); });
}

// v0.99.14 scan note: /gravitas-app/scan.json is written by tools/scan_note.py after a release has been scanned. It is shown ONLY when its sha256 is the sha256 of the
// installer offered above, so a version that was not scanned never carries the claim. The VirusTotal link only when the file was uploaded there (virustotal: true).
function appScanFill(sha) {
  let kas = "", flaggedNow = 0;
  const vtOk = n => n && Number.isInteger(n.flagged) && Number.isInteger(n.total) && n.total > 0 && n.flagged >= 0 && n.flagged <= n.total;
  const vtText = (n, checked) => { const by = Array.isArray(n.by) ? n.by.filter(z => typeof z === "string" && /^[\w .+-]{1,30}$/.test(z)).slice(0, 10) : [];
    return "VirusTotal: " + n.flagged + " of " + n.total + " engines flagged this file" + (n.flagged && by.length ? " (" + by.join(", ") + ")" : "") + (/^\d{4}-\d{2}-\d{2}$/.test(checked || "") ? ", checked " + checked : "") + "."; };
  const show = vt => {
    const parts = []; if (kas) parts.push(kas); if (vt) parts.push(vt);
    if (!parts.length) return;
    $("appScanT").textContent = parts.join(" "); $("appScan").hidden = false;
    if (vt) { const l = $("appVt"); l.href = "https://www.virustotal.com/gui/file/" + sha; l.hidden = false; }
    $("appScanNote").hidden = !(vt && flaggedNow > 0);
  };
  fetch("/gravitas-app/scan.json", { cache: "no-store" }).then(r => r.ok ? r.json() : Promise.reject()).then(x => {
    if (!x || x.sha256 !== sha) return;
    if (x.kaspersky === "clean" && /^\d{4}-\d{2}-\d{2}$/.test(x.date || "")) kas = "Scanned with Kaspersky Premium on " + x.date + ": no threat found.";
    if (x.virustotal === true && vtOk(x.vt)) flaggedNow = x.vt.flagged;
    show(x.virustotal === true && vtOk(x.vt) ? vtText(x.vt, "") : "");
  }).catch(() => {}).then(() => {
    // v0.99.16: the live numbers, kept for 6 hours by our server (/api/scan). If it does not answer, what scan.json said stays.
    fetch("/api/scan", { cache: "no-store" }).then(r => r.ok ? r.json() : Promise.reject()).then(n => { if (n && n.sha256 === sha && vtOk(n)) { flaggedNow = n.flagged; show(vtText(n, n.checked)); } }).catch(() => {});
  });
}
