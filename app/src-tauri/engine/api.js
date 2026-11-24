
var SYNC = { here: "", on: true };
function __feed(s, replay) { var j = JSON.parse(s); if (j.StarSystem) SYNC.here = String(j.StarSystem); if (CB_EV.test(j.event)) cbEvent(j, !!replay);
  // the plugin only: while Hostiles near is up, each new wanted ship you scan keeps it up (the site gives it 20 s in all)
  if (!replay && CB.on && CB.soft && j.event === "ShipTargeted" && j.TargetLocked && (+j.Bounty > 0 || /wanted|enemy|hunter/i.test(String(j.LegalStatus || "")))) CB.softT = Date.now();
  // the plugin only (v0.16.0): a lock lost and no other ship locked within LOST_MS: it blew up, flew off or was let go,
  // so it leaves Targets by value (a lock on another ship at once is a switch: both stay)
  if (!replay && j.event === "ShipTargeted") { var now = Date.now();
    if (!j.TargetLocked) { if (CB.target && CB.target.pilot) PEND = { k: CB.target.pilot + "|" + CB.target.ship, t: now }; }
    else PEND = null; }
  return CB.rev; }
var PEND = null, GONE = {}, CLEARED = 0, LOST_MS = 2000;
function __gone() { var now = Date.now();
  if (PEND && now - PEND.t >= LOST_MS) { GONE[PEND.k] = PEND.t; PEND = null; }
  return JSON.stringify({ gone: GONE, cleared: CLEARED }); }
function __clear() { CLEARED = Date.now(); GONE = {}; PEND = null; return 1; }
function __status(s) { cbStatus(JSON.parse(s)); return CB.rev; }
function __tick() { cbEngineTick(); return CB.rev; }
// the plugin only (v0.26.0): the game says a fight is over as soon as it is (its combat music ends, "in danger" goes);
// the site's engine waits 45 s of that calm. Here: ms of it are enough, unless in an Operation (its lulls are part of it)
function __calm(ms) {
  if (!CB.on || CB.soft || CB.remote || (CB.ep && CB.ep.op && CB.op)) return CB.rev;
  if (/^Combat/i.test(CB.music) || (CB.st && CB.st.danger && CB.st.hp)) return CB.rev;
  if (Date.now() - CB.lastHot > ms) cbEnd(0, "calm");
  return CB.rev; }
// the plugin only (v0.36.0): EDMC is closing: a fight still on is ended now, so it can be kept in Past combats
function __end() { if (CB.on && !CB.soft) cbEnd(0, "stop"); return CB.rev; }
function __view() { var v = cbLiveView(); return v ? JSON.stringify(v) : ""; }
function __here(s) { if (s) SYNC.here = String(s); return 1; }
// the plugin only (v0.4.0): the ships you scanned in the last 10 minutes, in or out of a fight (the engine keeps them in
// CB.scan and forgets them in supercruise or a jump), less the ones destroyed, and your locked target: for Targets by
// value before any shooting
function __scan() {
  var now = Date.now(), dead = {}, eps = [CB.ep, CB.report];
  for (var e = 0; e < eps.length; e++) if (eps[e]) eps[e].kills.forEach(function (k) { if (k.pilot) dead[k.pilot] = 1; });
  var L = [];
  CB.scan.forEach(function (o) { if (now - o.t < 10 * 60000 && !dead[o.pilot]) L.push({ p: o.pilot, s: o.ship, r: o.rank, b: o.bounty || 0, c: o.cmdr ? 1 : 0,
    sh: o.sh == null ? null : o.sh, h: o.h == null ? null : o.h, t: o.t, q: (o.stage || 0) >= 3 ? 1 : 0, x: CB.crit.has(o.pilot) ? 1 : 0, l: o.legal === "Clean" ? 1 : 0 }); });
  var g = CB.target && !CB.target.lost ? CB.target : null;
  return JSON.stringify({ pri: L, tg: g && { t: g.t, ship: g.ship, pilot: g.pilot, rank: g.rank, cmdr: g.cmdr, lost: 0, sub: g.sub, subH: g.subH, sh: g.sh, hull: g.hull, d: g.delta || null,
    bounty: g.bounty || 0, legal: g.legal || "" } });
}
