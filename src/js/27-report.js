// ------------------------------------------------------------- report a problem (v0.46)
// A window where a player describes a problem and attaches in-game screenshots. The page adds the context needed
// to reproduce it (link to the exact view, version, FPS, graphics, recent errors). The server saves it and mails it
// on; the receiving address lives only on the server.
function reportContext() {
  const ctx = {
    version: APP_VERSION,
    link: S ? shareUrl(true) : location.href,
    system: S && S.sys ? S.sys.name : null,
    body: selected ? selected.name : null,
    tab: selected ? infoTab : null,
    gameTime: gameTime(simTime) + (LIVE ? " (live)" : ""),
    surfaceView: SURF ? `on ${SURF.b.name}, looking at ${SURF.t.name}, height ${SURF.el}°, spot ${SURF.az}°, field of view ${SURF.fov}°` : null,
    view: MAPMODE ? "system map" : SURF ? "surface view" : "3D orrery",
    orbitPlanes: TILT ? "true tilt" : "flat",
    fps: FPS,
    quality: $("vQuality").value,
    graphics: GPU + (SOFT_GL ? " (no graphics card)" : ""),
    browser: navigator.userAgent,
    screen: `${innerWidth}×${innerHeight} @${devicePixelRatio}`,
    errors: ERRLOG.length ? ERRLOG.map(e => `${e.t} ${e.m}`).join(" | ") : "none",
    lastStop: CRASH_LAST ? JSON.stringify(CRASH_LAST) : null,     // v0.72.1: what was on screen when a visit stopped unexpectedly (v0.75.7: kept a week)
  };
  for (const k of Object.keys(ctx)) if (ctx[k] == null) delete ctx[k];
  return ctx;
}
const ctxText = ctx => Object.entries(ctx).map(([k, v]) => `${k}: ${v}`).join("\n");
let repImgs = [];
function shrinkImage(file) {                     // in-game screenshots are large: send at most 1600 px wide, as JPEG
  return new Promise((ok, bad) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      ok({ name: file.name, data: c.toDataURL("image/jpeg", 0.82) });
    };
    img.onerror = () => { URL.revokeObjectURL(url); bad(new Error("not an image")); };
    img.src = url;
  });
}
function openReport() {
  let box = $("rep");
  if (!box) {
    box = document.createElement("div"); box.id = "rep"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Report a problem");
    box.innerHTML = `<div class="box"><div class="hd"><h3>REPORT A PROBLEM</h3><button class="x" title="Close (Esc)">✕</button></div><div class="bd">
      <p class="note">Your report goes straight to the GRAVITAS developers. It helps most when it says what GRAVITAS showed and what the game showed. <a href="#" class="privRep">How reports are handled</a></p>
      <label>What happened?<textarea id="repTxt" maxlength="4000" rows="5" placeholder="Example: seen from the surface of moon 3 a, the rings of planet 3 tilt the other way than in the game."></textarea></label>
      <label>In-game screenshots (F10), up to 3<input type="file" id="repImg" accept="image/*" multiple></label>
      <div id="repThumbs"></div>
      <div class="two"><label>CMDR name (optional)<input id="repCmdr" maxlength="60"></label><label>E-mail, if you would like a reply (optional)<input id="repMail" type="email" maxlength="120"></label></div>
      <input id="repWeb" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <details><summary>Sent automatically with your report</summary><pre id="repCtx"></pre></details>
      <div class="btns"><span id="repMsg"></span><button id="repCopy">Copy as text</button><button id="repSend" class="pri">Send report</button></div>
    </div></div>`;
    document.body.appendChild(box);
    const close = closeReport;
    box.querySelector(".x").onclick = close;
    box.addEventListener("mousedown", e => { if (e.target === box) close(); });
    $("repImg").onchange = async () => {
      const files = [...$("repImg").files].slice(0, 3 - repImgs.length);
      for (const f of files) { try { repImgs.push(await shrinkImage(f)); } catch (e) { $("repMsg").textContent = `${f.name} is not an image.`; } }
      $("repImg").value = ""; drawThumbs();
    };
    $("repCopy").onclick = async () => {
      const t = `${$("repTxt").value.trim()}\n\n${ctxText(reportContext())}`;
      try { await navigator.clipboard.writeText(t); $("repMsg").textContent = "Copied. Screenshots are not included in the text."; } catch (e) { $("repMsg").textContent = "Copy failed."; }
    };
    $("repSend").onclick = sendReport;
    box.querySelector(".privRep").onclick = e => { e.preventDefault(); closeReport(); openNews("Privacy"); };
  }
  $("repCtx").textContent = ctxText(reportContext());
  $("repMsg").textContent = ""; $("repSend").disabled = false;
  keys.clear();                                  // a key held down when the window opens must not keep moving the map
  box.style.display = "flex";
  setTimeout(() => $("repTxt").focus(), 50);
}
function closeReport() {                          // hand the keyboard back to the map: a hidden text box must not keep the focus
  if (!$("rep")) return;
  $("rep").style.display = "none";
  if ($("rep").contains(document.activeElement)) document.activeElement.blur();
}
function drawThumbs() {
  $("repThumbs").innerHTML = repImgs.map((im, i) => `<span><img src="${im.data}" alt=""><button data-i="${i}" title="Remove">✕</button></span>`).join("");
  $("repThumbs").querySelectorAll("button").forEach(b => b.onclick = () => { repImgs.splice(+b.dataset.i, 1); drawThumbs(); });
}
async function sendReport() {
  const text = $("repTxt").value.trim();
  if (text.length < 3) { $("repMsg").textContent = "Please describe what happened."; $("repTxt").focus(); return; }
  $("repSend").disabled = true; $("repMsg").textContent = "Sending…";
  try {
    const r = await fetch("api/report", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, cmdr: $("repCmdr").value.trim(), mail: $("repMail").value.trim(), website: $("repWeb").value, context: reportContext(), images: repImgs }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || `server answered ${r.status}`);
    try { localStorage.removeItem("gravitas.lastCrash"); } catch (e) {}           // v0.75.7: that stop has been reported
    $("repMsg").textContent = "Thank you, commander. Your report was sent.";
    $("repTxt").value = ""; repImgs = []; drawThumbs();
    setTimeout(closeReport, 2200);
  } catch (e) {
    $("repSend").disabled = false;
    $("repMsg").textContent = `Could not send. ${/[.!?]$/.test(e.message) ? e.message : e.message + "."} You can also use Copy as text.`;
  }
}
// the first error of a visit offers a report (once)
let errShown = false;
function errNotice() {
  if (errShown || !document.body) return; errShown = true;
  const d = document.createElement("div"); d.id = "errNote"; d.className = "panel";
  d.innerHTML = `Something went wrong in GRAVITAS. <button class="go">⚑ Report it</button> <button class="x" title="Hide">✕</button>`;
  d.querySelector(".go").onclick = () => { d.remove(); openReport(); };
  d.querySelector(".x").onclick = () => d.remove();
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 15000);
}
$("repBtn").onclick = () => openReport();
document.querySelector("#credits .repIn").onclick = () => openReport();
document.querySelector("#credits .privIn").onclick = e => { e.preventDefault(); openNews("Privacy"); };
addEventListener("keydown", e => { if (e.key === "Escape" && $("rep") && $("rep").style.display === "flex") closeReport(); });
