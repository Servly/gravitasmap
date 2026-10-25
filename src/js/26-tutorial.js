// ------------------------------------------------------------- guided tour (v0.40)
// Warps to the reference system and walks through the page one highlighted element at a time.
// Everything outside the highlighted element is blurred and cannot be clicked until the step is done.
const TOUR_SYS = "Col 285 Sector VR-E b27-1";
const tourBody = n => S && S.bodies.find(b => b.name.toLowerCase().endsWith(" " + n));
const tourChart = title => [...document.querySelectorAll("#infoBody .chart")].find(c => c.querySelector(".ct") && c.querySelector(".ct").textContent.startsWith(title));
const TOUR = [
  { el: () => $("search"), title: "Search any system",
    text: "Type a system name here and pick it from the list. GRAVITAS loads it live from Spansh and warps you there. For this tour you are already in our reference system." },
  { el: () => $("list"), title: "Bodies", text: "Every star, planet and moon of the system, in orbit order. The small badges show what each body offers." },
  { el: () => { const b = tourBody("7 e"); if (b && b._item) b._item.scrollIntoView({ block: "nearest" }); return b && b._item; }, title: "Pick a body",
    text: "Click <b>7 e</b>.", done: () => selected && selected === tourBody("7 e") },
  { el: () => $("info"), title: "The body panel", text: "Everything about the selected body. The numbers at the top are live: distance to the star and to its parent, where it is on its orbit, and how much starlight reaches it right now." },
  { el: () => $("infoBody") && $("infoBody").querySelector(".kind"), title: "What you can do there",
    text: "Badges tell you at a glance: <b>green pin</b> = you can land, <b>A</b> = it has an atmosphere, <b>S</b> = stations, <b>B</b> = biological and <b>G</b> = geological signals (the number is how many)." },
  { el: () => $("surfGo"), title: "View from the surface", text: "Stand on this body and see its sky at true scale: real sizes, real distances, real light. Click the button.",
    done: () => !!SURF },
  { el: () => $("surf"), wait: () => $("surf").classList.contains("hidden"), title: "Your sky, at true scale",
    text: "Choose what to look at, how high it stands above your horizon and where you stand around it, to match what you see in the game. Drag the view to look around. Click <b>Exit</b> when you are done.", done: () => !SURF },
  { el: () => $("infoBody") && $("infoBody").querySelector(".tabs"), title: "Tabs",
    text: "<b>Overview</b>: how the body compares with the rest of the system. <b>Orbit</b>: its path and light over one orbit. <b>Sky</b>: what you see from it, and eclipses. <b>Physics</b>, <b>Composition</b>, <b>Signals</b> and <b>Data</b>: the numbers behind it. Click <b>Sky</b>.",
    done: () => infoTab === "Sky" },
  { el: () => { const c = tourChart("Eclipse calendar"); if (c) c.scrollIntoView({ block: "nearest" }); return c; }, title: "Eclipse calendar",
    text: "Each row is a body, each bar a time its star is hidden. Hover a bar for the exact start and end, in game time and in your own time. These times have been checked against the game to within a minute or two." },
  { el: () => $("time"), title: "Time controls",
    text: "The map opens <b>live</b>, on the game clock. Change the speed to watch orbits and eclipses unfold, type a date and time to jump to a moment (for example the start of an eclipse), and press <b>Now</b> to come back to live." },
  { el: () => $("mapMode"), title: "System map", text: "This switches between the 3D orrery and a flat <b>system map</b>, laid out like the game's. The view you are in is lit, the other one is faded. Click <b>System map</b>.",
    done: () => MAPMODE },
  { el: () => $("smap"), title: "The system map", text: "Laid out like the game's System Map: each star with its planets on a line, moons below, brackets over bodies that circle each other. Stations in orbit and fleet carriers hang off a body on a line, stations on a surface stand on the body itself. A coloured haze means an atmosphere. A small badge shows when the next eclipse starts or how long a shadow lasts. Drag to move the map, scroll or pinch to zoom, and hover a body for its details. The buttons on top highlight landable bodies, signals, stations, carriers or eclipses within a day. Click <b>3D orrery</b> on the switch to go back.", text: "Every star with its planets in orbit order and the moons below. Lines join each body to what it orbits, and brackets join bodies that circle each other, as in the game. Small icons under a body show its stations, settlements and fleet carriers. Under each body you see its distance from the star and, live, whether it is in shadow and when its next eclipse starts. The buttons on top highlight landable bodies, signals, rings or eclipses within a day. Click <b>3D orrery</b> on the switch to go back.",
    extra: () => $("mapMode"), done: () => !MAPMODE },
  { el: () => $("resetBig"), title: "Reset view", text: "Lost in space? This brings the camera back to the whole system. Click it to finish the tour.",
    done: () => tour && tour.resetClicked },
];
let tour = null;
function tourAsk() {
  if (tour) return;
  const box = document.createElement("div"); box.id = "tourAsk";
  box.innerHTML = `<div class="box"><h3>GUIDED TOUR</h3><p>We will take you to our reference system, <b>${TOUR_SYS}</b>, with a warp jump, and show you around the map step by step. It takes about two minutes.</p>
    <div class="btns"><button id="tourYes">Yes, take the tour<small>recommended</small></button><button id="tourNo">No, thanks</button></div></div>`;
  document.body.appendChild(box);
  const close = () => box.remove();
  $("tourNo").onclick = close;
  box.addEventListener("mousedown", e => { if (e.target === box) close(); });
  $("tourYes").onclick = async () => {
    close(); Sound.unlock();
    if (SURF) exitSurface(false);
    if (MAPMODE) setMap(false, false);                  // the tour starts in the 3D orrery (the saved choice stays)
    $("news").style.display = "none";
    const here = S && S.sys && S.sys.name && S.sys.name.toLowerCase() === TOUR_SYS.toLowerCase();
    if (!here) { const ok = await loadSystem(TOUR_SYS, { countdown: true }); if (!ok) return; await new Promise(r => setTimeout(r, 3400)); }
    tourStart();
  };
}
function tourStart() {
  const root = document.createElement("div"); root.id = "tour";
  root.innerHTML = `<div class="sh t"></div><div class="sh b"></div><div class="sh l"></div><div class="sh r"></div><div class="ring"></div>
    <div class="arrow">➜</div><div class="card"><div class="ttl"></div><div class="txt"></div><div class="nav"><span class="cnt"></span><button class="skip">End tour</button><button class="next">Next ›</button></div></div>`;
  document.body.appendChild(root);
  tour = { root, i: -1, resetClicked: false };
  root.querySelector(".skip").onclick = () => tourEnd(false);
  root.querySelector(".next").onclick = () => tourGo(tour.i + 1);
  tour.onReset = () => { if (tour) tour.resetClicked = true; };
  $("resetBig").addEventListener("click", tour.onReset);
  document.body.classList.add("touring");
  tourGo(0);
  requestAnimationFrame(tourFrame);
}
function tourGo(i) {
  if (!tour) return;
  if (i >= TOUR.length) return tourEnd(true);
  tour.i = i; const st = TOUR[i], r = tour.root;
  r.querySelector(".ttl").textContent = st.title;
  r.querySelector(".txt").innerHTML = st.text;
  r.querySelector(".cnt").textContent = `${i + 1} / ${TOUR.length}`;
  r.querySelector(".next").style.display = st.done ? "none" : "";
  if ($("info").classList.contains("collapsed") && /info|Body|Tabs|Eclipse/.test(st.title + st.text)) $("info").classList.remove("collapsed");
}
function tourEnd(finished) {
  if (!tour) return;
  $("resetBig").removeEventListener("click", tour.onReset);
  tour.root.remove(); tour = null; document.body.classList.remove("touring");
  if (finished) toast("Tour complete. Enjoy GRAVITAS, commander!");
}
function tourFrame() {
  if (!tour) return;
  try { tourDraw(); }
  catch (e) { if (tour.errStep !== tour.i) { tour.errStep = tour.i; logErr(`tour step ${tour.i + 1}: ${e.message}`); } requestAnimationFrame(tourFrame); }   // one bad frame must not end the tour
}
function tourDraw() {
  const st = TOUR[tour.i], el = st.el(), r = tour.root, card = r.querySelector(".card"), ar = r.querySelector(".arrow");
  if (st.done && st.done()) { tourGo(tour.i + 1); requestAnimationFrame(tourFrame); return; }
  const waiting = !!(st.wait && st.wait());           // e.g. still landing: show nothing but the scene
  for (const q of [".card", ".arrow", ".ring"]) r.querySelector(q).style.visibility = waiting ? "hidden" : "";
  if (SURF) tour.lastSurf = performance.now();     // landing, the sky and take-off are shown without blur
  r.classList.toggle("clear", performance.now() - (tour.lastSurf || -1e9) < 1200);
  let x = innerWidth / 2 - 1, y = innerHeight / 2 - 1, w = 2, h = 2;
  if (el && el.getClientRects().length) { const b = el.getBoundingClientRect(), p = 6; x = b.left - p; y = b.top - p; w = b.width + 2 * p; h = b.height + 2 * p;
    const ex = st.extra && st.extra();                // a second element that must stay clickable (e.g. the switch back)
    if (ex && ex.getClientRects().length) { const e2 = ex.getBoundingClientRect(), x2 = Math.max(x + w, e2.right + p), y2 = Math.max(y + h, e2.bottom + p); x = Math.min(x, e2.left - p); y = Math.min(y, e2.top - p); w = x2 - x; h = y2 - y; } }
  x = Math.max(0, x); y = Math.max(0, y); w = Math.min(w, innerWidth - x); h = Math.min(h, innerHeight - y);
  const set = (q, L, T, W, H) => Object.assign(r.querySelector(q).style, { left: L + "px", top: T + "px", width: Math.max(0, W) + "px", height: Math.max(0, H) + "px" });
  set(".sh.t", 0, 0, innerWidth, y); set(".sh.b", 0, y + h, innerWidth, innerHeight - y - h);
  set(".sh.l", 0, y, x, h); set(".sh.r", x + w, y, innerWidth - x - w, h); set(".ring", x, y, w, h);
  // the card sits beside the target, on the side with the most room; the arrow points from the card to the target
  const cw = Math.min(340, innerWidth - 24), chh = card.offsetHeight || 150, room = { r: innerWidth - (x + w), l: x, b: innerHeight - (y + h), t: y };
  const side = room.r >= cw + 60 ? "r" : room.l >= cw + 60 ? "l" : room.b >= chh + 60 ? "b" : "t";
  let cx, cy;
  if (side === "r") { cx = x + w + 52; cy = y + h / 2 - chh / 2; } else if (side === "l") { cx = x - cw - 52; cy = y + h / 2 - chh / 2; }
  else if (side === "b") { cx = x + w / 2 - cw / 2; cy = y + h + 48; } else { cx = x + w / 2 - cw / 2; cy = y - chh - 48; }
  cx = Math.max(12, Math.min(innerWidth - cw - 12, cx)); cy = Math.max(12, Math.min(innerHeight - chh - 12, cy));
  Object.assign(card.style, { left: cx + "px", top: cy + "px", width: cw + "px" });
  const rot = { r: 180, l: 0, b: -90, t: 90 }[side];
  const ax = side === "r" ? x + w + 10 : side === "l" ? x - 40 : x + w / 2 - 15, ay = side === "b" ? y + h + 8 : side === "t" ? y - 38 : y + h / 2 - 15;
  Object.assign(ar.style, { left: ax + "px", top: ay + "px", transform: `rotate(${rot}deg)` });
  ar.dataset.side = side;
  requestAnimationFrame(tourFrame);
}
$("tutBtn").onclick = () => { Sound.unlock(); tourAsk(); };
$("tutBtn").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("tutBtn").click(); } });
addEventListener("keydown", e => { if (tour && e.key === "Escape") tourEnd(false); }, true);
