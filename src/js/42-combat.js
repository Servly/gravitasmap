// ------------------------------------------------------------ v0.91 Combat Mode
// When the ship is in a fight, GRAVITAS turns red and becomes a combat screen: the locked target (ship, pilot, rank,
// faction, bounty, shield and hull as last scanned), a kill feed, the fight's tally, your own ship (shields, pips, heat,
// hull and ammo at launch) and, in an Operation, the site, the team and the time. When the fight is over it leaves a
// combat report that can be copied for Discord. All of it comes from the Journal and Status.json, in this browser
// only (and your own paired tablet). While the combat screen is up, the map and 3D view are not drawn at all, so the
// graphics card is the game's.
// What the Journal gives (checked on a real Operation, 24 Oct 2026): Music (Combat_Dogfight, Combat_LargeDogFight:
// the moment a fight starts), ShipTargeted (scan stage 3 at once; shield and hull % only when a lock is made),
// UnderAttack, Bounty (one per kill, SharedWithOthers), FactionKillBond, HeatWarning, ShieldState, HullDamage,
// GameModeChange (Operation), WingJoin/WingAdd (team), SupercruiseDestinationDrop (the site). No positions in space.
const CB_EV = /^(Music|ShipTargeted|UnderAttack|Bounty|FactionKillBond|CapShipBond|HeatWarning|HeatDamage|ShieldState|HullDamage|Interdicted|Interdiction|EscapeInterdiction|Died|Resurrect|GameModeChange|WingJoin|WingAdd|WingLeave|SupercruiseDestinationDrop|FighterDestroyed|LaunchFighter|LoadGame|Loadout|FSDJump|Docked|Undocked|Location|SupercruiseEntry|StartJump|Missions|Statistics|ReceiveText|CommitCrime|Rank|Progress)$/;
const CB_SOFT = 20000, CB_CALM = 45000, CB_FRESH = 90000, CB_OP_CALM = 15 * 60000, CB_PHASE_GAP = 3000;   // v0.91.2: an Operation's lulls between phases are not the end; between phases the music drops to Exploration for 4 to 48 s (three real Operations)
const CB_RANKS = ["Harmless", "Mostly Harmless", "Novice", "Competent", "Expert", "Master", "Dangerous", "Deadly", "Elite", "Elite I", "Elite II", "Elite III", "Elite IV", "Elite V"];
const CB = { scan: new Map(), sort: (() => { try { return localStorage.getItem("gravitas.cbSort") === "s" ? "s" : "v"; } catch (e) { return "v"; } })(), order: (() => { try { const a = JSON.parse(localStorage.getItem("gravitas.cbOrder")); if (Array.isArray(a)) return a.map(String).slice(0, 12); } catch (e) {} return ["Fer-de-Lance", "Corsair", "Python Mk II"]; })(), teamInfo: new Map(), words: new Map(), crit: new Set(), on: false, full: true, ep: null, report: null, target: null, music: "", lastHot: 0, cmdr: "", ship: null, load: null, st: null, op: null, team: [], ranks: new Map(), el: null, pill: null, remote: null, rev: 0 };
const CB_SHIPS = { anaconda: "Anaconda", anacondamkii: "Anaconda Mk II", corsair: "Corsair", federation_corvette: "Federal Corvette", ferdelance: "Fer-de-Lance", python: "Python", python_nx: "Python Mk II",
  viper: "Viper Mk III", viper_mkiv: "Viper Mk IV", cobramkiii: "Cobra Mk III", cobramkiv: "Cobra Mk IV", cobramkv: "Cobra Mk V", smallcombat01_nx: "Kestrel Mk II", krait_mkii: "Krait Mk II",
  krait_light: "Krait Phantom", mamba: "Mamba", type9_military: "Type-10 Defender", vulture: "Vulture", federation_dropship: "Federal Dropship", federation_dropship_mkii: "Federal Assault Ship",
  federation_gunship: "Federal Gunship", empire_eagle: "Imperial Eagle", empire_courier: "Imperial Courier", empire_trader: "Imperial Clipper", cutter: "Imperial Cutter", eagle: "Eagle",
  sidewinder: "Sidewinder", asp: "Asp Explorer", asp_scout: "Asp Scout", typex: "Alliance Chieftain", typex_2: "Alliance Crusader", typex_3: "Alliance Challenger", diamondbackxl: "Diamondback Explorer",
  diamondback: "Diamondback Scout", dolphin: "Dolphin", orca: "Orca", belugaliner: "Beluga Liner", adder: "Adder", hauler: "Hauler", independant_trader: "Keelback", type6: "Type-6 Transporter",
  type7: "Type-7 Transporter", type9: "Type-9 Heavy", type8: "Type-8 Transporter", mandalay: "Mandalay", explorer_nx: "Caspian Explorer", panthermkii: "Panther Clipper Mk II" };
const cbShip = (id, loc) => loc || CB_SHIPS[String(id || "").toLowerCase()] || String(id || "Unknown ship").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
function cbPilot(raw, loc) {
  if (loc) return String(loc).slice(0, 60);
  const s = String(raw || ""); let m = /#name=([^;]+);/.exec(s); if (m) return (/cmdr/i.test(s) ? "CMDR " : "") + m[1];
  m = /^\$ShipName_([A-Za-z]+);\s*(.*)$/.exec(s); if (m) return `${m[1]} ${m[2]}`.trim();
  return s.replace(/^\$/, "").slice(0, 60) || "Unknown pilot";
}
const cbNum = n => Math.round(+n || 0).toLocaleString("en-US");
const cbDur = ms => { const s = Math.max(0, Math.round(ms / 1000)), m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m}:${String(s % 60).padStart(2, "0")}`; };
const cbAgo = t => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? `${s} s ago` : `${Math.floor(s / 60)} min ago`; };
function cbEp(t) { return { t0: t, t1: t, kills: [], tgts: [], bonds: 0, bondN: 0, attacks: 0, hits: 0, atkT: 0, heat: 0, shDown: 0, minHull: null, locks: 0, sys: (SYNC && SYNC.here) || "", site: CB.op ? CB.op.site : "", op: !!CB.op, phase: 1, phases: [], rates: { sh: [0, 0], h: [0, 0] }, ttk: [], ev: [], intd: null, seen: new Set(), friend: {}, chat: {}, ff: 0 }; }
// v0.91.6: an enemy "seen": a ship you locked, a pilot who spoke to you in the fight (their threats and their cries when hit
// carry their name), or one you helped destroy. The game lists no ships around you, so this is what can be counted
const cbFoe = n => { const ep = CB.ep; n = String(n || "").trim(); if (!ep || !n || n.length > 60 || CB.team.some(m => m && n.toLowerCase().includes(m.toLowerCase()))) return; ep.seen.add(n); };
// v0.91.3: every moment of the fight, for the timeline in the report (kills, waves of fire, heat, phases, interdiction)
function cbMark(k, t, x) { const ep = CB.ep; if (!ep || ep.ev.length >= 400) return; ep.ev.push([t, k, x || 0]); }
// one Journal line (replayed lines too: they set the scene, but only fresh ones start a fight)
function cbEvent(j, replay) {
  const ev = j.event, t = Date.parse(j.timestamp) || Date.now(), fresh = !replay || Date.now() - t < CB_FRESH;
  // v0.92.3: nothing starts a fight while docked or in the menus (the game writes a few late lines there after an
  // Operation). A lock alone is a weak sign: it only wakes the small chip; real fire, a kill or the fight music opens the screen
  const hot = why => { if (!fresh || CB.docked || /mainmenu/i.test(CB.music)) return;
    if (why === "lock") { if (!CB.on) cbStart(t, why, true); return; }
    CB.lastHot = Math.max(CB.lastHot, replay ? t : Date.now()); if (!CB.on) cbStart(t, why); else if (CB.soft) cbHarden(t); if (CB.ep) CB.ep.t1 = Math.max(CB.ep.t1, t); };   // v0.92: the fight lasts until its last hot moment
  switch (ev) {
    case "LoadGame": CB.cmdr = String(j.Commander || ""); CB.ship = { type: cbShip(j.Ship, j.Ship_Localised), name: String(j.ShipName || ""), ident: String(j.ShipIdent || "") }; break;
    case "GameModeChange":
      if (j.GameMode === "Operation") CB.op = { t0: t, site: "", threat: null, sys: "" };
      else { if (CB.on && fresh) cbEnd(t, "op"); CB.op = null; }
      break;
    case "Missions": { const m = (j.Active || []).find(x => x && x.Name && !x.Expires); if (CB.op && m) CB.op.name = String(m.Name).slice(0, 60); break; }   // v0.91.3: the Operation's name
    case "Statistics": if (j.Combat) CB.career = { b: +j.Combat.Bounties_Claimed || 0, bcr: +j.Combat.Bounty_Hunting_Profit || 0, cb: +j.Combat.Combat_Bonds || 0, cbcr: +j.Combat.Combat_Bond_Profits || 0, top: +j.Combat.Highest_Single_Reward || 0 }; break;
    case "ReceiveText":
      if (j.Channel === "wing" && CB.ep) { const w = String(j.From_Localised || j.From || "").slice(0, 40); if (w) CB.ep.chat[w] = (CB.ep.chat[w] || 0) + 1; }   // v0.91.7: how many lines each teammate wrote (only the count)
      if (j.Channel === "npc" && CB.ep && /\$(Pirate_|BadKarma)/.test(String(j.Message || ""))) { const who = String(j.From_Localised || cbPilot(j.From)).slice(0, 60);   // v0.91.7: an enemy's last words, and who was critically hit
        CB.words.set(who, String(j.Message_Localised || "").slice(0, 80)); if (/BadKarma/.test(j.Message)) CB.crit.add(who); }
      if (CB.ep && j.Channel === "npc" && /\$(Pirate_|BadKarma|.*Attack|.*Combat)/.test(String(j.Message || "")) && !/^\$(Operations_|COMMS|STATION)/.test(String(j.From || ""))) cbFoe(j.From_Localised || cbPilot(j.From)); break;
    case "CommitCrime": if (CB.ep && j.Victim && CB.team.some(m => String(j.Victim_Localised || j.Victim).toLowerCase().includes(m.toLowerCase()))) { CB.ep.ff++; cbMark("ff", t); } break;   // v0.91.7: fire on a teammate, when the game records it
    case "Rank": if (j.Combat != null) CB.rank = Object.assign(CB.rank || {}, { r: +j.Combat }); break;
    case "Progress": if (j.Combat != null) CB.rank = Object.assign(CB.rank || {}, { p: +j.Combat }); break;
    case "WingJoin": CB.team = (j.Others || []).map(String).filter(n => n && n !== CB.cmdr).slice(0, 8); break;
    case "WingAdd": { const n = String(j.Name || ""); if (n && n !== CB.cmdr && !CB.team.includes(n)) CB.team.push(n); break; }
    case "WingLeave": CB.team = []; break;
    case "SupercruiseDestinationDrop": if (CB.op) { CB.op.site = String(j.Type_Localised || "").slice(0, 60) || CB.op.site; CB.op.threat = j.Threat ?? CB.op.threat; } break;
    case "Location": CB.docked = !!j.Docked; if (CB.op && j.StarSystem) CB.op.sys = String(j.StarSystem); break;
    case "SupercruiseEntry": CB.docked = false; if (CB.op && j.StarSystem) CB.op.sys = String(j.StarSystem); CB.scan.clear(); if (CB.on && fresh && !CB.op) cbEnd(t, "supercruise"); break;   // v0.92: leaving the fight for supercruise ends it
    case "Undocked": CB.docked = false; break;
    case "FSDJump": CB.docked = false; CB.scan.clear(); if (CB.op && j.StarSystem) CB.op.sys = String(j.StarSystem); if (CB.on && fresh) cbEnd(t, "jump"); break;
    case "StartJump": if (j.JumpType === "Hyperspace" && CB.on && fresh) cbEnd(t, "jump"); break;
    case "Docked": CB.docked = true; if (CB.on && fresh) cbEnd(t, "docked"); break;
    case "Music": {                                                     // v0.91.2: phases, and no fight while docked (the game plays combat music in the menus too)
      const was = /combat/i.test(CB.music), now = /combat/i.test(String(j.MusicTrack || "")); CB.music = String(j.MusicTrack || "");
      if (!now) { if (was) CB.calmT = t; if (CB.ep && CB.ep.bigOn) { CB.ep.bigOn = false; cbMark("big", t, 0); } break; }
      if (CB.docked || /mainmenu/i.test(CB.music)) break;
      if (CB.ep) { const big = /large/i.test(CB.music); if (big !== !!CB.ep.bigOn) { CB.ep.bigOn = big; cbMark("big", t, big ? 1 : 0); } }   // v0.91.7: the game's own "large fight" music
      if (CB.on && CB.ep && CB.ep.op && !was && CB.calmT && t - CB.calmT >= CB_PHASE_GAP) { CB.ep.phase++; CB.ep.phases.push({ t, n: CB.ep.phase }); cbMark("phase", t, CB.ep.phase); }
      hot("music"); break; }
    case "ShipTargeted":
      if (!j.TargetLocked) { if (CB.target) CB.target.lost = t; break; }
      { const g = { t, ship: cbShip(j.Ship, j.Ship_Localised), pilot: j.PilotName != null ? cbPilot(j.PilotName, j.PilotName_Localised) : "", rank: String(j.PilotRank || ""), stage: +j.ScanStage || 0,
          sh: j.ShieldHealth != null ? +j.ShieldHealth : null, hull: j.HullHealth != null ? +j.HullHealth : null, fac: String(j.Faction || ""), legal: String(j.LegalStatus || ""), bounty: +j.Bounty || 0,
          sub: j.Subsystem_Localised || j.Subsystem || "", subH: j.SubsystemHealth != null ? +j.SubsystemHealth : null, cmdr: /\$cmdr_decorate/i.test(String(j.PilotName || "")) };
        if (g.pilot && g.rank) CB.ranks.set(g.pilot, g.rank);
        const same = CB.target && !CB.target.lost && CB.target.pilot === g.pilot && CB.target.ship === g.ship;
        { const p = CB.target && CB.target.pilot === g.pilot && CB.target.ship === g.ship ? CB.target : null;   // v0.91.3: locked again: how much came off since the last lock
          if (p && p.sh != null && g.sh != null && t - p.t >= 1000) g.delta = { dt: t - p.t, sh: p.sh - g.sh, h: p.hull - g.hull }; }
        CB.target = g; if (CB.ep && !same) CB.ep.locks++;
        { const mate = CB.team.find(m => m && g.pilot.toLowerCase().includes(m.toLowerCase()));   // v0.91.7: a teammate in your sights: their ship, rank, squadron, shields
          if (mate) { const crew = !g.pilot.toLowerCase().startsWith("cmdr " + mate.toLowerCase()); const ti = CB.teamInfo.get(mate) || {};
            if (!crew) Object.assign(ti, { ship: g.ship, rank: g.rank, sq: String(j.SquadronID || ""), sh: g.sh, hull: g.hull, t }); else ti.fighter = g.ship; CB.teamInfo.set(mate, ti);
            if (CB.ep) { const fr = CB.ep.friend[mate] || (CB.ep.friend[mate] = { n: 0 }); fr.n++; fr.t = t; fr.what = crew ? g.ship + " (crew)" : g.ship; cbMark("friend", t); } } }
        if (g.pilot && !CB.team.some(m => m && g.pilot.toLowerCase().includes(m.toLowerCase()))) {   // v0.92: every ship scanned, before the fight too (cycling "next hostile" at the start)
          const k = g.pilot + "|" + g.ship, o = CB.scan.get(k) || { pilot: g.pilot, ship: g.ship, first: t };
          Object.assign(o, { rank: g.rank || o.rank || "", cmdr: g.cmdr, t, bounty: g.bounty || o.bounty || 0, sh: g.sh ?? o.sh, h: g.hull ?? o.h, legal: g.legal || o.legal || "", stage: Math.max(o.stage || 0, g.stage) }); CB.scan.delete(k); CB.scan.set(k, o);
          while (CB.scan.size > 40) CB.scan.delete(CB.scan.keys().next().value); }
        if (CB.ep && g.pilot && !CB.team.some(m => m && g.pilot.toLowerCase().includes(m.toLowerCase()))) {   // v0.91.5: a teammate, or a teammate's crew or fighter ("Crew CMDR Zipa313"), is not a foe   // a teammate locked by mistake is not a foe                                          // v0.91.1: every ship locked this fight, and what became of it
          let r = CB.ep.tgts.find(x => x.pilot === g.pilot && x.ship === g.ship);
          if (!r) { r = { pilot: g.pilot, ship: g.ship, rank: g.rank, bounty: g.bounty, cmdr: g.cmdr, t, first: t, killed: 0, snap: [] }; CB.ep.tgts.push(r); if (CB.ep.tgts.length > 30) CB.ep.tgts.shift(); }
          r.t = t; if (g.bounty) r.bounty = g.bounty; if (g.sh != null) r.sh = g.sh; if (g.hull != null) r.h = g.hull; if (g.legal) r.legal = g.legal; r.stage = Math.max(r.stage || 0, g.stage); if (r.legal !== "Clean") cbFoe(g.pilot); else if (CB.ep) CB.ep.seen.delete(g.pilot);   // v0.92: a clean ship (security, traders) is no enemy
          if (g.sh != null && g.hull != null && r.snap.length < 12) r.snap.push({ t, sh: g.sh, h: g.hull }); }
        if (!CB.on && (g.bounty > 0 || /wanted|enemy|hunter/i.test(g.legal)) && CB.st && CB.st.hp) hot("lock"); }   // v0.92.3: cycling targets no longer keeps a fight going
      break;
    case "UnderAttack": if (j.Target && j.Target !== "You") break; hot("attack");
      if (CB.ep) { CB.ep.hits++; if (t - CB.ep.atkT > 5000) { CB.ep.attacks++; cbMark("fire", t); } CB.ep.atkT = t; } break;   // v0.91.1: a burst of hits (12 in 2 s) is one wave
    case "Bounty": hot("kill"); if (CB.ep) { const p = cbPilot(j.PilotName, j.PilotName_Localised);
      const r = CB.ep.tgts.find(x => x.pilot === p && !x.killed); let ttk = 0;
      if (r) { r.killed = t; ttk = t - r.first <= 15 * 60000 ? t - r.first : 0; if (ttk > 1000) CB.ep.ttk.push(ttk);
        // v0.91.2: how fast shields and hull came down, from the scans you made of it and its end (your team's fire included)
        const pts = [...r.snap, { t, sh: 0, h: 0 }];
        for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], dt = (b.t - a.t) / 1000; if (dt < 1 || dt > 600) continue;
          if (a.sh > 0.5 && Math.abs(a.h - b.h) < 0.5 && a.sh > b.sh) { CB.ep.rates.sh[0] += a.sh - b.sh; CB.ep.rates.sh[1] += dt; }
          else if (a.sh <= 0.5 && a.h > b.h) { CB.ep.rates.h[0] += a.h - b.h; CB.ep.rates.h[1] += dt; } } }
      cbMark("kill", t, +j.TotalReward || 0); cbFoe(p);
      CB.ep.kills.push({ t, ph: CB.ep.phase, ttk, q: CB.words.get(p) || "", pilot: p, ship: cbShip(j.Target, j.Target_Localised), cr: +j.TotalReward || (j.Rewards || []).reduce((a, r) => a + (+r.Reward || 0), 0) || +j.Reward || 0, shared: +j.SharedWithOthers || 0, rank: CB.ranks.get(p) || "", fac: String(j.VictimFaction_Localised || j.VictimFaction || "") }); } break;
    case "FactionKillBond": case "CapShipBond": hot("kill"); if (CB.ep) { CB.ep.bonds += +j.Reward || 0; CB.ep.bondN++;
      CB.ep.kills.push({ t, pilot: "", ship: ev === "CapShipBond" ? "Capital ship" : "Combat bond", ph: CB.ep.phase, cr: +j.Reward || 0, shared: 0, rank: "", fac: String(j.VictimFaction_Localised || j.VictimFaction || ""), bond: true }); } break;
    case "HeatWarning": if (CB.ep && fresh) { CB.ep.heat++; cbMark("heat", t); } CB.heatT = t; break;
    case "ShieldState": CB.shields = !!j.ShieldsUp; if (!j.ShieldsUp) { hot("shields"); if (CB.ep) CB.ep.shDown++; } break;
    case "HullDamage": if (j.PlayerPilot === false || j.Fighter) break; hot("hull"); if (CB.ep) CB.ep.minHull = Math.min(CB.ep.minHull ?? 1, +j.Health || 0); break;
    // v0.91.3: interdiction in its stages: pulled (Status flag), then dropped, submitted or escaped
    case "Interdicted": case "EscapeInterdiction": case "Interdiction": {
      const who = cbPilot(j.Interdictor || j.Interdicted, j.Interdictor_Localised || j.Interdicted_Localised), st = ev === "EscapeInterdiction" ? "escaped" : ev === "Interdiction" ? "you interdicted" : j.Submitted ? "submitted" : "dropped";
      if (ev !== "EscapeInterdiction") hot("interdiction"); else if (!CB.on) break;
      if (CB.ep) { CB.ep.intd = { t, st, who, player: !!j.IsPlayer }; cbMark("int", t, st); if (st === "escaped") CB.lastHot = Math.min(CB.lastHot, Date.now() - CB_CALM + 12000); }   // escaped: the screen goes after 12 s unless more happens
      break; }
    case "Died": if (CB.on && fresh) { if (CB.ep) CB.ep.died = true; cbEnd(t, "died"); } break;
    case "Loadout": {
      const mods = (j.Modules || []).filter(m => m && m.Health != null), weap = (j.Modules || []).filter(m => m && m.AmmoInHopper != null);
      CB.load = { t, hull: j.HullHealth != null ? +j.HullHealth : null, minMod: mods.length ? Math.min(...mods.map(m => +m.Health)) : null, dmg: mods.filter(m => +m.Health < 0.999).length,
        ammo: weap.length ? Math.round(100 * weap.reduce((a, m) => a + (+m.AmmoInClip || 0) + (+m.AmmoInHopper || 0), 0) / weap.reduce((a, m) => a + Math.max(1, (+m.AmmoInClip || 0) + (+m.AmmoInHopper || 0)), 0)) : null,
        guns: weap.length, rebuy: +j.Rebuy || 0 };
      if (j.Ship) CB.ship = Object.assign(CB.ship || {}, { type: cbShip(j.Ship, j.Ship_Localised) || (CB.ship && CB.ship.type), name: String(j.ShipName || (CB.ship && CB.ship.name) || ""), ident: String(j.ShipIdent || (CB.ship && CB.ship.ident) || "") });
      break; }
    default: return;
  }
  if (!replay) { CB.rev++; cbRender(); }
}
// Status.json, a few times a second: pips, flags, fuel. Only a change redraws
function cbStatus(j) {
  const F = j.Flags || 0, s = { pips: Array.isArray(j.Pips) ? j.Pips.slice(0, 3) : null, fg: j.FireGroup, fuel: j.Fuel ? +j.Fuel.FuelMain : null, legal: j.LegalState || "",
    sh: !!(F & 8), hp: !!(F & 64), mass: !!(F & 65536), heat: !!(F & 1048576), danger: !!(F & 4194304), silent: !!(F & 1024), sc: !!(F & 16), docked: !!(F & 1), pull: !!(F & 8388608) };
  const k = JSON.stringify(s); if (k === CB.stK) return; CB.stK = k; CB.st = s;
  if (CB.shields === undefined || s.sh !== CB.shields) CB.shields = s.sh;
  if (s.danger && s.hp && !s.sc && !s.docked && !CB.docked) {        // v0.92.3: "in danger" (pirates scanning you, too) is a weak sign
    if (!CB.on) cbStart(Date.now(), "danger", true); else if (!CB.soft) { CB.lastHot = Date.now(); if (CB.ep) CB.ep.t1 = Math.max(CB.ep.t1, Date.now()); } }
  if (s.pull && !CB.pulling) {                                          // v0.91.3: the interdiction tether is on you: the fight starts here
    const now = Date.now(); CB.lastHot = now; if (!CB.on) cbStart(now, "interdiction"); else if (CB.soft) cbHarden(now);
    if (CB.ep && !(CB.ep.intd && now - CB.ep.intd.t < 30000)) { CB.ep.intd = { t: now, st: "pulling", who: "", player: false }; cbMark("int", now, "pulling"); }
    CB.rev++; cbRender(); }
  CB.pulling = s.pull;
  // v0.91.1: shields, pips and heat are on the cockpit already: not shown, so no redraw
}
// v0.91.7: the switch into Combat Mode, like a screen cutting over: a bright line, the title in the middle, then the screen
function cbIntro() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let e = CB.tv; if (!e) { e = CB.tv = document.createElement("div"); e.id = "cbTv"; e.setAttribute("aria-hidden", "true"); document.body.appendChild(e); }
  e.innerHTML = `<i class="ln"></i><div class="tt"><b>COMBAT MODE</b><span>${esc(CB.op && CB.op.name ? CB.op.name : "Hostiles engaged")}</span></div>`;
  e.classList.remove("go"); void e.offsetWidth; e.classList.add("go");
  clearTimeout(CB.tvT); CB.tvT = setTimeout(() => e.classList.remove("go"), 2000);
}
function cbStart(t, why, soft) {
  CB.on = true; CB.soft = !!soft; CB.softT = Date.now(); if (soft) CB.full = false; CB.ep = cbEp(t); CB.ep.why = why; CB.ep.p0 = CB.rank ? CB.rank.p : null; CB.lastHot = Math.max(CB.lastHot, Date.now());
  if (CB.target && Date.now() - CB.target.t < 60000) CB.ep.locks = 1;
  for (const o of CB.scan.values()) if (t - o.t < 10 * 60000 && CB.ep.tgts.length < 30) { CB.ep.tgts.push({ pilot: o.pilot, ship: o.ship, rank: o.rank, bounty: o.bounty, cmdr: o.cmdr, t: o.t, first: o.first, killed: 0, sh: o.sh, h: o.h, legal: o.legal, stage: o.stage, snap: o.sh != null && o.h != null ? [{ t: o.t, sh: o.sh, h: o.h }] : [] }); if (o.legal !== "Clean") cbFoe(o.pilot); }   // v0.92: the ships you scanned just before
  if (!soft) cbOpen(); else { CB.rev++; cbRender(); }                 // v0.92.3: a weak start only lights the chip
}
// the fight is real: the screen, the intro and the sound (at once, or when a weak start turns into a fight)
function cbOpen() {
  CB.hist = false; CB.past = null; CB.full = true; CB.report = null; cbIntro();   // a new fight takes the screen
  document.body.classList.add("combat");
  try { Sound.unlock && Sound.unlock(); Sound.alarm && Sound.alarm(); } catch (e) {}
  CB.rev++; cbRender(); try { syncShow(); } catch (e) {}
}
function cbHarden(t) { if (!CB.soft) return; CB.soft = false; if (CB.ep) { CB.ep.t0 = Math.max(CB.ep.t0, t || CB.ep.t0); CB.ep.t1 = Math.max(CB.ep.t1, CB.ep.t0); } cbOpen(); }
function cbEnd(t, why) {
  if (!CB.on) return;
  const soft = CB.soft; CB.on = false; CB.soft = false; const ep = CB.ep; document.body.classList.remove("combat");
  if (ep) { if (why === "died") ep.t1 = Math.max(ep.t1, t || ep.t1); ep.end = why;   // v0.92: the time ends at the last hot moment, not when the calm was noticed
    ep.opInfo = CB.op && { ...CB.op }; ep.teamAt = CB.team.slice(0, 6); if (!soft && (ep.kills.length || ep.bondN || ep.shDown || ep.died || (ep.attacks && ep.t1 - ep.t0 >= 60000))) { CB.report = ep; cbSave(cbViewOf(ep, false)); } }   // v0.92.3: no report for a fight with nothing in it
  CB.ep = null; CB.target = null; if (soft) { CB.rev++; cbRender(); return; } CB.full = !!CB.report; CB.rev++; cbRender(); try { syncShow(); } catch (e) {}
}
// the view: everything the screen shows, small enough to send to the paired tablet
function cbView() {
  if (CB.past) return CB.past;                                         // v0.91.2: a past combat opened from the list
  if (CB.remote) return CB.remote;
  return cbLiveView();
}
function cbLiveView() { return CB.on || CB.report ? cbViewOf(CB.on ? CB.ep : CB.report, CB.on) : null; }
// ---- v0.91.2 past combats: every report is kept in this browser (the last 30), and can be opened again from Sync
const CB_HIST_KEY = "gravitas.combats";
function cbHistory() { try { const a = JSON.parse(localStorage.getItem(CB_HIST_KEY) || "[]"); return Array.isArray(a) ? a.filter(v => v && v.ep && v.ep.t0) : []; } catch (e) { return []; } }
function cbSave(v) {
  if (!v || !v.ep) return; const r = JSON.parse(JSON.stringify(Object.assign({}, v, { on: false, rev: 0, tg: null, closed: false })));
  const a = cbHistory().filter(x => x.ep.t0 !== r.ep.t0); a.unshift(r); while (a.length > 30) a.pop();
  try { localStorage.setItem(CB_HIST_KEY, JSON.stringify(a)); } catch (e) { try { localStorage.setItem(CB_HIST_KEY, JSON.stringify(a.slice(0, 10))); } catch (x) {} }
}
function cbHistOpen() { CB.hist = true; CB.past = null; CB.full = true; cbRender(); }
function cbHistHTML() {
  const a = cbHistory();
  const tot = a.reduce((o, v) => { o.n += v.ep.n || 0; o.cr += v.ep.cr || 0; o.ms += Math.max(0, v.ep.t1 - v.ep.t0); return o; }, { n: 0, cr: 0, ms: 0 });
  const rows = a.map((v, i) => { const ep = v.ep, d = new Date(ep.t1 || ep.t0);
    return `<li data-cbh="${i}" role="button" tabindex="0"><span class="hd">${d.toISOString().slice(0, 10)} <small>${d.toISOString().slice(11, 16)} UTC</small></span><span class="hw">${esc(cbWhere(v) || "Unknown place")}${ep.phases > 1 ? ` <em>${ep.phases} phases</em>` : ""}${ep.op ? ` <em>Operation</em>` : ""}</span>
      <span class="hn"><b>${ep.n || 0}</b>${ep.seenN ? `<small>/${Math.max(ep.seenN, ep.n || 0)}</small>` : ""} kills</span><span class="hc">${cbNum(ep.cr)} cr</span><span class="ht">${cbDurLong(ep.t1 - ep.t0)}</span><span class="hr ${ep.died ? "bad" : ""}">${ep.died ? "ship lost" : ep.shDown ? "shields fell" : "shields held"}</span></li>`; }).join("");
  const c = CB.career, car = c ? `<p class="cbCareer">Your career, from the game: <b>${cbNum(c.b)}</b> bounties claimed (${cbNum(c.bcr)} cr) · <b>${cbNum(c.cb)}</b> combat bonds (${cbNum(c.cbcr)} cr) · highest single reward ${cbNum(c.top)} cr</p>` : "";
  return `<div class="cbHead rep"><b class="cbTag">PAST COMBATS</b><span class="cbWhere">${a.length ? `${a.length} kept in this browser · ${tot.n} kills · ${cbNum(tot.cr)} cr · ${cbDurLong(tot.ms)}` : ""}</span><button data-cb="hclose">Close</button></div>
    <div class="cbHist">${car}${a.length ? `<ol>${rows}</ol>` : `<p class="cbNote">No combats yet. With Sync on, every fight leaves its report here.</p>`}</div>`;
}
function cbViewOf(ep, on) {
  const tg = on ? CB.target : null, rate = a => a[1] >= 3 ? +(a[0] / a[1]).toFixed(2) : null, tt = ep ? ep.ttk.slice().sort((a, b) => a - b) : [];
  const fast = ep && ep.kills.filter(k => k.ttk > 1000).sort((a, b) => a.ttk - b.ttk)[0];
  return { v: 1, on, rev: CB.rev,
    ep: ep && { phase: ep.phase, phases: ep.op ? ep.phase : 0, ttkAvg: tt.length ? Math.round(tt.reduce((a, b) => a + b, 0) / tt.length) : 0, ttkFast: fast ? { ms: fast.ttk, pilot: fast.pilot, ship: fast.ship } : null,
      shRate: rate(ep.rates.sh), hRate: rate(ep.rates.h), intd: ep.intd, seenN: ep.seen.size, ff: ep.ff, friend: ep.friend, chat: ep.chat,
      sharedBy: [0, 1, 2, 3].map(k => ep.kills.filter(x => !x.bond && Math.min(3, x.shared || 0) === k).length),
      ev: on ? null : ep.ev.slice(0, 300).map(e => [Math.round((e[0] - ep.t0) / 1000), e[1], e[2]]),   // the report's timeline (seconds from the start)
      t0: ep.t0, t1: ep.t1, n: ep.kills.filter(k => !k.bond).length, cr: ep.kills.reduce((a, k) => a + k.cr, 0), bonds: ep.bonds, attacks: ep.attacks, heat: ep.heat, shDown: ep.shDown,
      minHull: ep.minHull, died: !!ep.died, sys: ep.sys, site: ep.site, op: ep.op, kills: ep.kills.slice(on ? -8 : -40).reverse(),   // the report lists them all (up to 40)
      big: ep.kills.filter(k => !k.bond).sort((a, b) => b.cr - a.cr)[0] || null, hits: ep.hits,
      shN: ep.kills.filter(k => !k.bond && k.shared).length, shCr: ep.kills.filter(k => !k.bond && k.shared).reduce((a, k) => a + k.cr, 0),
      pri: ep.tgts.filter(x => !x.killed).sort((a, b) => (b.bounty || 0) - (a.bounty || 0)).slice(0, on ? 15 : 20).map(x => ({ p: x.pilot, s: x.ship, r: x.rank, b: x.bounty || 0, c: x.cmdr ? 1 : 0, sh: x.sh ?? null, h: x.h ?? null, t: x.t, q: (x.stage || 0) >= 3 ? 1 : 0, x: CB.crit.has(x.pilot) ? 1 : 0, l: x.legal === "Clean" ? 1 : 0 })),   // v0.92: the targets by value (live), and the ones that got away (report)
      tgts: ep.tgts.slice(-10).reverse().map(x => ({ p: x.pilot, s: x.ship, r: x.rank, b: x.bounty, k: x.killed, c: x.cmdr ? 1 : 0, x: CB.crit.has(x.pilot) ? 1 : 0 })) },
    tg: tg && { t: tg.t, ship: tg.ship, pilot: tg.pilot, rank: tg.rank, cmdr: tg.cmdr, lost: tg.lost || 0, sub: tg.sub, subH: tg.subH, sh: tg.sh, hull: tg.hull, d: tg.delta || null },
    soft: on && CB.soft ? 1 : 0, op: on ? CB.op && { ...CB.op } : ep && ep.opInfo || (CB.op && { ...CB.op }), team: on || !ep ? CB.team.slice(0, 6) : (ep.teamAt || []), live: !!SYNC.on, cmdr: CB.cmdr, rank: CB.rank ? { r: CB.rank.r, p: CB.rank.p, p0: ep ? ep.p0 : null } : null, mates: Object.fromEntries([...CB.teamInfo].filter(([m]) => CB.team.includes(m) || (ep && ep.teamAt && ep.teamAt.includes(m)))) };
}
// ---- the screen (v0.91.1: only what the cockpit does not already show. Shields, pips, heat and the target's own shield
// and hull are in front of you in the game; here: the module you are shooting at, every ship you fought, the kills,
// the fight and the team)
const cbBar = (v, cls, label) => v == null ? `<div class="cbBar ${cls} na"><span>${label}</span><i style="width:0"></i><b>—</b></div>`
  : `<div class="cbBar ${cls}${v <= 0.5 ? " zero" : v < 25 ? " low" : ""}"><span>${label}</span><i style="width:${Math.max(0, Math.min(100, v)).toFixed(1)}%"></i><b>${Math.round(v)}%</b></div>`;
const cbRank = r => r ? `<em class="cbRank r-${String(r).toLowerCase()}">${esc(r)}</em>` : "";
const cbDurLong = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ""}`; };
function cbWhere(V) { const ep = V.ep || {}; return [V.op && V.op.name, V.op && V.op.sys || ep.sys, V.op && V.op.site || ep.site].filter(Boolean).join(" · "); }
const CB_INT = { pulling: ["INTERDICTION", "being pulled out of supercruise"], dropped: ["INTERDICTED", "you were pulled out"], submitted: ["SUBMITTED", "you dropped out"], escaped: ["ESCAPED", "you got away"], "you interdicted": ["YOU INTERDICTED", "you pulled them out"] };
function cbIntHTML(ep) {
  const i = ep && ep.intd; if (!i) return ""; const [a, b] = CB_INT[i.st] || ["INTERDICTION", ""];
  return `<div class="cbInt st-${esc(i.st.replace(/\s+/g, "-"))}"><b>${a}</b>${i.who ? `<span>${i.st === "you interdicted" ? "" : i.st === "escaped" ? "from " : "by "}${esc(i.who)}${i.player ? " · a player" : ""}</span>` : ""}<em>${b}</em><span class="kt" data-cba="${i.t}">${cbAgo(i.t)}</span></div>`;
}
// v0.91.3: the fight on one line: phases, kills (bigger dots for bigger bounties), waves of fire, heat, interdiction
function cbTimeline(ep) {
  // v0.91.5: laid out in % with plain elements, so dots stay round and lines thin at any width (the stretched SVG made ovals)
  const ev = ep.ev || [], T = Math.max(10, Math.round((ep.t1 - ep.t0) / 1000)); if (!ev.length) return "";
  const X = s => (100 * Math.min(1, Math.max(0, s / T))).toFixed(2) + "%", maxCr = Math.max(1, ...ev.filter(e => e[1] === "kill").map(e => e[2]));
  const ph = [[0, 1], ...ev.filter(e => e[1] === "phase").map(e => [e[0], e[2]])];
  const bands = ph.map(([s, n], i) => { const e = i + 1 < ph.length ? ph[i + 1][0] : T; return `<div class="tb b${n % 2}" style="left:${X(s)};width:${(100 * (e - s) / T).toFixed(2)}%">${ph.length > 1 ? `<b>PHASE ${n}</b>` : ""}</div>`; }).join("");
  let marks = "", bigS = null;
  for (const [s, k, x] of ev) if (k === "big") { if (x && bigS == null) bigS = s; else if (!x && bigS != null) { marks += `<div class="tbig" style="left:${X(bigS)};width:${(100 * (s - bigS) / T).toFixed(2)}%"></div>`; bigS = null; } }
  if (bigS != null) marks += `<div class="tbig" style="left:${X(bigS)};width:${(100 * (T - bigS) / T).toFixed(2)}%"></div>`;
  for (const [s, k, x] of ev) {
    if (k === "kill") { const d = Math.round(10 + 12 * Math.sqrt(x / maxCr)); marks += `<i class="tk" style="left:${X(s)};width:${d}px;height:${d}px" title="kill +${cbNum(x)} cr at ${cbDurLong(s * 1000)}"></i>`; }
    else if (k === "fire") marks += `<i class="tf" style="left:${X(s)}"></i>`;
    else if (k === "heat") marks += `<i class="th" style="left:${X(s)}"></i>`;
    else if (k === "int") marks += `<i class="ti" style="left:${X(s)}"></i>`;
    else if (k === "friend" || k === "ff") marks += `<i class="tfr" style="left:${X(s)}" title="${k === "ff" ? "fire on a teammate" : "a teammate in your sights"}"></i>`;
  }
  return `<section class="cbBox cbTl"><h4>Timeline</h4><div class="tlw" role="img" aria-label="The fight over time"><div class="tli">${bands}<div class="tax"></div>${marks}</div></div>
    <div class="cbTlK"><span><i class="k"></i>kill (size: bounty)</span><span><i class="f"></i>wave of fire</span><span><i class="h"></i>heat warning</span>${ev.some(e => e[1] === "int") ? `<span><i class="i"></i>interdiction</span>` : ""}${ev.some(e => e[1] === "big") ? `<span><i class="bg"></i>large fight</span>` : ""}${ev.some(e => e[1] === "friend" || e[1] === "ff") ? `<span><i class="fr"></i>teammate in your sights</span>` : ""}<span class="r">${cbDurLong(T * 1000)}</span></div></section>`;
}
function cbFeedHTML(kills, phased) {
  let prev = null;
  return kills.length ? kills.map(k => { const head = phased && k.ph && k.ph !== prev ? `<li class="ph">PHASE ${k.ph}</li>` : ""; prev = k.ph; return head + `<li class="${k.bond ? "bond" : ""}"><span class="kx">✕</span><span class="kn">${k.pilot ? esc(k.pilot) : esc(k.fac || "Bond")}${cbRank(k.rank)}</span><span class="ks">${esc(k.ship)}</span><b class="kc">+${cbNum(k.cr)}</b>${k.shared ? `<span class="kh">with ${k.shared} of the team</span>` : `<span class="kh solo">solo</span>`}${k.ttk > 1000 ? `<span class="kk">down in ${cbDurLong(k.ttk)}</span>` : ""}${k.q ? `<q class="kq">${esc(k.q)}</q>` : ""}<span class="kt" data-cba="${k.t}">${cbAgo(k.t)}</span></li>`; }).join("")
    : `<li class="none">No kills yet</li>`;
}
function cbGauge(a, b, size = 64) {                                   // v0.91.6: "12 / 21" as a ring
  const r = size / 2 - 5, C = 2 * Math.PI * r, f = b ? Math.min(1, a / b) : 0;
  return `<svg class="cbGauge" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="gb"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="gf" stroke-dasharray="${(C * f).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/><text x="50%" y="50%" dy=".35em" text-anchor="middle">${a}/${b}</text></svg>`;
}
function cbSeenHTML(ep) {
  const s = ep.seenN || 0, n = ep.n || 0; if (!s) return "";
  return `<div class="cbSeen">${cbGauge(n, Math.max(s, n))}<div><b>~${Math.max(s, n)} enemies seen · ${n} you helped destroy</b><span>Seen: ships you locked or that spoke to you. The game lists no ships around you, and a kill counts when you damaged it.</span></div></div>`;
}
function cbTallyHTML(V, team) {
  const ep = V.ep || {}, now = Date.now(), dur = (V.on ? now : ep.t1) - ep.t0, n = ep.n || 0;
  if (team) return cbTeamHTML(V);
  return `<div class="cbTally"><div><b>${n}</b><span>kills</span></div><div><b>${cbNum(ep.cr)}</b><span>credits</span></div><div><b data-cbd="${V.on ? ep.t0 : ""}">${cbDur(dur)}</b><span>time</span></div>
    <div><b>${dur > 60000 ? (n / (dur / 60000)).toFixed(1) : "—"}</b><span>kills / min</span></div><div><b>${ep.attacks || 0}</b><span>wave${ep.attacks === 1 ? "" : "s"} of fire</span></div><div><b>${ep.heat || 0}</b><span>heat warning${ep.heat === 1 ? "" : "s"}</span></div></div>
    ${cbSeenHTML(ep)}${ep.big ? `<div class="cbBig">Biggest: <b>${esc(ep.big.pilot)}</b> · ${esc(ep.big.ship)} · ${cbNum(ep.big.cr)} cr</div>` : ""}${cbTkHTML(ep)}`;
}
// v0.91.7: the Team tab: each teammate as far as your journal knows them (their ship, rank and squadron when you have
// scanned them, how often they were in your sights, how many lines they wrote in team chat), how your kills were shared,
// any fire on a teammate the game recorded, and your own combat rank
function cbTeamHTML(V) {
  const ep = V.ep || {}, n = ep.n || 0, sb = ep.sharedBy || [0, 0, 0, 0], mx = Math.max(1, ...sb), M = V.mates || {}, F = ep.friend || {}, C = ep.chat || {};
  const cards = V.team.map(m => { const i = M[m] || {}, f = F[m];
    return `<div class="cbMateC"><b>${esc(m)}</b>${i.ship ? `<span>${esc(i.ship)}${i.rank ? ` · ${esc(i.rank)}` : ""}${i.sq ? ` · [${esc(i.sq)}]` : ""}</span>` : `<span class="dim">ship unknown: lock them once to see it</span>`}${i.fighter ? `<span class="dim">fighter: ${esc(i.fighter)}</span>` : ""}
      ${i.sh != null ? `<span class="dim">shields ${Math.round(i.sh)}% · hull ${Math.round(i.hull)}% when you locked them</span>` : ""}<em>${f ? `in your sights ${f.n}×` : ""}${f && C[m] ? " · " : ""}${C[m] ? `${C[m]} line${C[m] > 1 ? "s" : ""} in team chat` : ""}</em></div>`; }).join("");
  const r = V.rank, rk = r && r.r != null ? `<div class="cbRk">Your combat rank: <b>${esc(CB_RANKS[r.r] || r.r)}</b>${r.p != null ? ` · ${r.p}%${r.p0 != null && r.p > r.p0 ? ` (+${r.p - r.p0}% this fight)` : ""}` : ""}</div>` : "";
  return `<div class="cbMates">${cards || `<span class="none">No team</span>`}</div>
    <h4>Your kills, shared</h4><div class="cbShare">${["solo", "with 1", "with 2", "with 3"].map((l, k) => `<div><i style="height:${Math.round(56 * sb[k] / mx)}px"></i><b>${sb[k]}</b><span>${l}</span></div>`).join("")}</div>
    ${ep.ff ? `<div class="cbFF">Friendly fire recorded by the game: ${ep.ff}×</div>` : ""}${rk}
    <p class="cbNote">Your journal holds your own kills and how many teammates shared each one, not your teammates' own kills. Fire on a teammate shows only when the game records it; a teammate in your sights is counted from your locks.</p>`;
}
// v0.91.2: takedown speed. The journal has no damage numbers (no DPS), but it has each target's shield and hull % when you
// lock it and the moment it dies: from those, how long a kill took and how fast shields and hull came down
function cbTkHTML(ep) {
  if (!ep.ttkAvg && ep.shRate == null && ep.hRate == null) return "";
  return `<h4>Takedown speed</h4><div class="cbTk">${ep.ttkAvg ? `<div><b>${cbDurLong(ep.ttkAvg)}</b><span>average kill, from your first lock</span></div>` : ""}${ep.ttkFast ? `<div><b>${cbDurLong(ep.ttkFast.ms)}</b><span>fastest: ${esc(ep.ttkFast.pilot)} · ${esc(ep.ttkFast.ship)}</span></div>` : ""}
    ${ep.shRate != null ? `<div><b>${ep.shRate.toFixed(1)} %/s</b><span>shields coming down</span></div>` : ""}${ep.hRate != null ? `<div><b>${ep.hRate.toFixed(1)} %/s</b><span>hull coming down</span></div>` : ""}</div>
    <p class="cbNote">From the shield and hull % at each lock and the moment of each kill. Your team's fire counts too. The game writes no damage numbers, so true DPS cannot be known.</p>`;
}
function cbHTML(V) {
  const ep = V.ep || {}, now = Date.now(), where = esc(cbWhere(V.on && V.op ? Object.assign({}, V, { op: Object.assign({}, V.op, { name: "" }) }) : V)), team = CB.tab === "team" && V.team.length;
  const opStrip = V.op ? `<div class="cbOp"><b>OPERATION</b>${V.op.name ? `<span class="cbOpN">${esc(V.op.name)}</span>` : ""}${V.op.threat > 0 ? `<span>threat ${esc(V.op.threat)}</span>` : ""}<span data-cbt="${V.op.t0}">${cbDur(now - V.op.t0)}</span>${V.on && ep.op ? `<b class="cbPh">PHASE ${ep.phase || 1}</b>` : ""}</div>` : "";
  const tabs = V.team.length ? `<div class="cbTabs" role="tablist"><button data-cb="solo" class="${team ? "" : "on"}">Solo</button><button data-cb="team" class="${team ? "on" : ""}">Team · ${V.team.length + 1}</button></div>` : "";
  if (!V.on) {                                                         // the report: an image card to copy for Discord
    return `<div class="cbHead rep"><b class="cbTag">COMBAT REPORT</b><span class="cbWhere">${where}</span><button data-cb="img">Copy image</button><button data-cb="save">Save image</button><button data-cb="copy">Copy text</button>${CB.past ? "" : `<button data-cb="hist">Past combats</button>`}${CB.past || CB.remote ? "" : `<button data-opnew>Team board</button>`}<button data-cb="close">${CB.past ? "Back" : "Close"}</button></div>
      <div class="cbRep"><div><img class="cbCard" alt="Combat report card" src="${cbCardURL(V)}">${cbSeenHTML(ep) ? `<section class="cbBox cbSeenBox">${cbSeenHTML(ep)}</section>` : ""}${cbTimeline(ep)}${cbTkHTML(ep) ? `<section class="cbBox cbTkBox">${cbTkHTML(ep)}</section>` : ""}</div><div class="cbRepR"><section class="cbBox cbFeed"><h4>Kills</h4><ol>${cbFeedHTML(ep.kills || [], ep.phases > 1)}</ol></section>${V.team.length ? `<section class="cbBox cbTeamBox"><h4>The team</h4>${cbTeamHTML(V)}</section>` : ""}${cbAwayHTML(ep) ? `<section class="cbBox cbAwayBox">${cbAwayHTML(ep)}</section>` : ""}</div></div>`;   // v0.91.7: the team in the report too
  }
  const t = V.tg;
  const sub = t && t.sub ? `<div class="cbSub"><div class="cbSubN">${esc(t.sub)}</div>${cbBar(t.subH, "sub", "MODULE")}<div class="cbTA">scanned <span data-cba="${t.t}">${cbAgo(t.t)}</span> · updates when you target it again</div></div>`
    : `<div class="cbSub none"><div class="cbSubN">No module targeted</div><div class="cbTA">Target a module of your target (FSD, drives, power plant…) and its health shows here: knock out the FSD first and it cannot run</div></div>`;
  const pct = v => `${v > 0 ? "−" : v < 0 ? "+" : ""}${Math.abs(Math.round(v))}%`;
  const dl = t && t.d ? `<div class="cbDelta">Since your last lock ${cbDurLong(t.d.dt)} ago: shield <b>${pct(t.d.sh)}</b> · hull <b>${pct(t.d.h)}</b> · <b>${((Math.max(0, t.d.sh) + Math.max(0, t.d.h)) / (t.d.dt / 1000)).toFixed(1)} %/s</b></div>`
    : t && !t.lost ? `<div class="cbDelta dim">Lock it again in a while and this shows how fast it is coming down</div>` : "";
  const cur = t ? `<div class="cbCur${t.lost ? " lost" : ""}"><b>${esc(t.pilot || t.ship)}</b>${cbRank(t.rank)}<span>${esc(t.ship)}${t.cmdr ? " · CMDR" : ""}</span></div>${dl}` : "";
  const fr = Object.entries(ep.friend || {}).map(([m, f]) => `<li class="ff"><span class="tn">${esc(m)}<em class="cbMate">TEAMMATE</em></span><span class="tsh">${esc(f.what || "")}</span><span class="tb">in your sights ${f.n}×</span></li>`).join("");
  const tl = fr + ((ep.tgts || []).filter(x => x.k).map(x => `<li class="${x.k ? "dead" : ""}"><span class="tn">${esc(x.p)}${cbRank(x.r)}${x.c ? `<em class="cbCmdr">CMDR</em>` : ""}</span><span class="tsh">${esc(x.s)}</span><span class="tb">${x.k ? "destroyed" : x.x ? "critically hit" : x.b ? cbNum(x.b) + " cr" : ""}</span></li>`).join("") || (fr ? "" : `<li class="none">None destroyed yet</li>`));
  return `<div class="cbHead"><b class="cbTag">COMBAT</b><span class="cbWhere">${where}</span>${opStrip}${tabs}${CB.remote ? "" : `<button data-opnew title="Team board: one link, everyone's fight on one screen">Team board</button>`}<button data-cb="min" title="Back to the map (the combat chip stays at the top)">Map</button></div>
    ${V.ep && V.ep.intd && now - V.ep.intd.t < 120000 ? cbIntHTML(V.ep) : ""}<div class="cbGrid"><section class="cbBox">${cbPriHTML(V)}<h4>Target module</h4>${cur}${sub}<h4>Ships this fight</h4><ol class="cbTgts">${tl}</ol></section>
    <section class="cbBox cbFeed"><h4>Kill feed</h4><ol>${cbFeedHTML(ep.kills || [], ep.op)}</ol></section>
    <section class="cbBox"><h4>${team ? "The team" : "This fight"}</h4>${cbTallyHTML(V, team)}</section></div>`;
}
// v0.92: the targets by value. Cycle "next hostile" at the start and every scanned ship lands here, the most valuable first
// (or in your own ship order). The value is the bounty the game shows on a full scan, the same that is paid on the kill
function cbPriSort(L) {
  const a = L.slice();
  if (CB.sort === "s") { const ix = s => { const i = CB.order.indexOf(s); return i < 0 ? 99 : i; }; a.sort((x, y) => ix(x.s) - ix(y.s) || y.b - x.b); }
  else a.sort((x, y) => y.b - x.b);
  return a;
}
function cbPriHTML(V) {
  const L = cbPriSort((V.ep && V.ep.pri) || []), sum = L.reduce((a, x) => a + x.b, 0), top = L.find(x => x.b > 0);
  const ord = CB.sort === "s" ? `<div class="cbOrd">${CB.order.map((n, i) => `<span>${i + 1}. ${esc(n)}<button data-cbox="${i}" aria-label="Remove ${esc(n)}">×</button></span>`).join("")}<small>${CB.order.length ? "Others follow by value. " : ""}Tap a ship below to add its type</small></div>` : "";
  const rows = L.map((x, i) => `<li class="${x === top ? "best" : ""}"${CB.sort === "s" ? ` data-cboa="${esc(x.s)}" role="button" tabindex="0"` : ""}><span class="pn"><b>${i + 1}</b>${esc(x.p)}${cbRank(x.r)}${x.c ? `<em class="cbCmdr">CMDR</em>` : ""}</span><span class="ps">${esc(x.s)}</span>
    <span class="pv">${x.b ? cbNum(x.b) + " cr" : x.q ? "no bounty" : "scanning"}${x.x ? `<small>critically hit</small>` : ""}${x.l ? `<small class="cl">clean: firing is a crime</small>` : ""}</span>${x.sh != null ? `<span class="pb" title="Shields and hull at your last lock"><span><i class="s" style="width:${Math.round(x.sh)}%"></i></span><span><i class="h" style="width:${Math.round(x.h ?? 0)}%"></i></span></span>` : ""}</li>`).join("");
  return `<div class="cbPriH"><h4>Targets by value</h4><div class="cbSortB"><button data-cbs="v" class="${CB.sort === "v" ? "on" : ""}">Value</button><button data-cbs="s" class="${CB.sort === "s" ? "on" : ""}">Ship order</button></div></div>${ord}
    ${L.length ? `<p class="cbPriS">${L.length} alive · ${cbNum(sum)} cr on the field${top ? ` · best: <b>${esc(top.p)}</b>` : ""}</p><ol class="cbPri">${rows}</ol>` : `<p class="cbNote">Cycle "next hostile" in the game: every ship you scan lands here, the most valuable first.</p>`}`;
}
// v0.92: in the report, the ships you locked that are not among your kills: they got away, or someone else finished them
function cbAwayHTML(ep) {
  const L = (ep.pri || []).filter(x => !x.l); if (!L.length) return "";
  return `<h4>Not in your kills</h4><ol class="cbAway">${L.map(x => `<li><span class="pn">${esc(x.p)}${cbRank(x.r)}</span><span class="ps">${esc(x.s)}</span><span class="pv">${x.b ? cbNum(x.b) + " cr" : ""}</span></li>`).join("")}</ol>
    <p class="cbNote">Ships you locked that you did not help destroy: they escaped, or someone else finished them. The game does not say which.</p>`;
}
function cbReportText(V) {
  const ep = V.ep || {}, k = ep.big, where = cbWhere(V);
  return [`GRAVITAS combat report${where ? " · " + where : ""}`,
    `${cbDurLong(ep.t1 - ep.t0)}${ep.phases > 1 ? ` · ${ep.phases} phases` : ""} · ${ep.n || 0} kills${ep.seenN ? ` of ~${Math.max(ep.seenN, ep.n || 0)} enemies seen` : ""} · ${cbNum(ep.cr)} cr${ep.bonds ? ` (bonds ${cbNum(ep.bonds)})` : ""} · ${ep.died ? "ship lost" : ep.shDown ? `shields fell ${ep.shDown}x` : "shields held"}`,
    k ? `Top: ${k.pilot} (${k.ship}${k.rank ? ", " + k.rank : ""}) ${cbNum(k.cr)} cr` : "",
    ep.ttkAvg ? `Average takedown ${cbDurLong(ep.ttkAvg)}${ep.ttkFast ? `, fastest ${cbDurLong(ep.ttkFast.ms)}` : ""}` : "", "gravitasmap.com"].filter(Boolean).join("\n");
}
// the report as an image card (1200 × 675, Discord's own preview shape), drawn here, never uploaded anywhere
function cbCard(V) {
  // v0.91.5: drawn at twice the size (2400 × 1350): sharp on large and high-density screens, and in Discord
  const W = 1200, H = 675, c = document.createElement("canvas"); c.width = W * 2; c.height = H * 2; const g = c.getContext("2d"), ep = V.ep || {}; g.scale(2, 2);
  const F = (w, px) => `${w} ${px}px "Segoe UI", system-ui, -apple-system, sans-serif`;
  let bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#2a0710"); bg.addColorStop(0.55, "#12040a"); bg.addColorStop(1, "#07020a"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W * 0.18, -40, 20, W * 0.18, -40, 700); glow.addColorStop(0, "rgba(255,50,70,.35)"); glow.addColorStop(1, "rgba(255,50,70,0)"); g.fillStyle = glow; g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(255,70,90,.18)"; g.lineWidth = 1; for (let x = 0; x < W; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }   // a faint grid, like the game's map
  for (let y = 0; y < H; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.fillStyle = "#ff3b4e"; g.fillRect(0, 0, 8, H);
  g.fillStyle = "#ff5a6a"; g.font = F(700, 20); g.fillText("G R A V I T A S", 56, 64);
  g.fillStyle = "#ffffff"; g.font = F(800, 54); g.fillText("COMBAT REPORT", 56, 128);
  const where = [cbWhere(V), ep.phases > 1 ? `${ep.phases} phases` : ""].filter(Boolean).join(" · "); g.fillStyle = "#ffc9cf"; g.font = F(500, 26); g.fillText(where || "", 56, 172, W - 112);
  const res = ep.died ? "SHIP LOST" : ep.shDown ? `SHIELDS FELL ${ep.shDown}×` : "SHIELDS HELD", rw = g.measureText(res).width;
  g.font = F(700, 20); const rW = g.measureText(res).width + 36; g.fillStyle = ep.died ? "#8f0f1c" : "#0f5132"; g.beginPath(); g.roundRect(W - 56 - rW, 44, rW, 40, 8); g.fill();
  g.fillStyle = "#fff"; g.fillText(res, W - 56 - rW + 18, 71); void rw;
  const n = ep.n || 0, dur = ep.t1 - ep.t0, seen = Math.max(ep.seenN || 0, n), stats = [[String(n), "KILLS"], [cbNum(ep.cr), "CREDITS"], [cbDurLong(dur), "TIME"], seen ? [`${n}/${seen}`, "OF ~" + seen + " SEEN"] : [dur > 60000 ? (n / (dur / 60000)).toFixed(1) : "—", "KILLS / MIN"]];
  stats.forEach(([v, l], i) => { const x = 56 + i * 272, y = 214; g.fillStyle = "rgba(255,255,255,.06)"; g.beginPath(); g.roundRect(x, y, 256, 118, 12); g.fill();
    if (/ SEEN$/.test(l)) { const cx = x + 218, cy = y + 59, rr = 24, f = seen ? Math.min(1, n / seen) : 0;   // the same ring as on the screen
      g.lineWidth = 7; g.strokeStyle = "rgba(255,255,255,.12)"; g.beginPath(); g.arc(cx, cy, rr, 0, 2 * Math.PI); g.stroke();
      g.strokeStyle = "#ffd27a"; g.lineCap = "round"; g.beginPath(); g.arc(cx, cy, rr, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * f); g.stroke(); g.lineCap = "butt"; }
    g.fillStyle = "#fff"; g.font = F(800, / SEEN$/.test(l) ? 40 : v.length > 9 ? 36 : 46); g.fillText(v, x + 22, y + 66, / SEEN$/.test(l) ? 158 : 220); g.fillStyle = "#ff8f9a"; g.font = F(700, 16); g.fillText(l, x + 22, y + 98, 220); });
  const ks = (ep.kills || []).filter(k => !k.bond).slice().sort((a, b) => b.cr - a.cr).slice(0, 5);
  g.fillStyle = "#ff8f9a"; g.font = F(700, 16); g.fillText("TOP KILLS", 56, 378);
  ks.forEach((k, i) => { const y = 414 + i * 44; g.fillStyle = i % 2 ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.06)"; g.fillRect(56, y - 28, 700, 40);
    g.fillStyle = "#ff3b4e"; g.font = F(800, 20); g.fillText("✕", 70, y);
    g.fillStyle = "#fff"; g.font = F(600, 21); g.fillText(k.pilot, 100, y, 300); g.fillStyle = "#d9b3b8"; g.font = F(500, 19); g.fillText(k.ship + (k.rank ? " · " + k.rank : ""), 410, y, 200);
    g.fillStyle = "#ffd27a"; g.font = F(700, 20); g.textAlign = "right"; g.fillText("+" + cbNum(k.cr), 744, y); g.textAlign = "left"; });
  if (!ks.length) { g.fillStyle = "#d9b3b8"; g.font = F(500, 22); g.fillText("No kills this time", 56, 420); }
  const sx = 796; g.fillStyle = "#ff8f9a"; g.font = F(700, 16); g.fillText(V.team && V.team.length ? "TEAM" : "PILOT", sx, 378);
  const names = [V.cmdr ? "CMDR " + V.cmdr : "", ...(V.team || [])].filter(Boolean).slice(0, 5);
  names.forEach((m, i) => { g.fillStyle = i ? "#ffd7db" : "#fff"; g.font = F(i ? 500 : 700, 21); g.fillText(m, sx, 414 + i * 36, W - sx - 56); });
  if (V.team && V.team.length) { g.fillStyle = "#d9b3b8"; g.font = F(500, 17); g.fillText(`${ep.shN || 0} of ${n} kills shared with the team`, sx, 414 + names.length * 36 + 6, W - sx - 56); }
  g.fillStyle = "rgba(255,255,255,.45)"; g.font = F(500, 17); g.fillText(`${new Date(ep.t1 || Date.now()).toISOString().slice(0, 16).replace("T", " ")} UTC${seen && dur > 60000 ? ` · ${(n / (dur / 60000)).toFixed(1)} kills/min` : ""}${ep.ttkAvg ? ` · avg takedown ${cbDurLong(ep.ttkAvg)}` : ""} · ${ep.attacks || 0} wave${ep.attacks === 1 ? "" : "s"} of fire · ${ep.heat || 0} heat warning${ep.heat === 1 ? "" : "s"}`, 56, H - 34);
  g.textAlign = "right"; g.fillStyle = "#ff5a6a"; g.font = F(700, 19); g.fillText("gravitasmap.com", W - 56, H - 34); g.textAlign = "left";
  return c;
}
function cbCardURL(V) { const k = (V.ep && V.ep.t0) + "|" + (V.ep && V.ep.t1) + "|" + (V.ep && V.ep.n) + "|" + (V.ep && V.ep.phases); if (CB.cardK !== k) { CB.cardK = k; try { CB.cardU = cbCard(V).toDataURL("image/png"); } catch (e) { CB.cardU = ""; } } return CB.cardU; }
function cbOrderSave() { try { localStorage.setItem("gravitas.cbOrder", JSON.stringify(CB.order)); } catch (e) {} CB.html = ""; cbRender(); }
function cbInit() {
  if (CB.el) return;
  CB.el = document.createElement("div"); CB.el.id = "combat"; CB.el.setAttribute("role", "region"); CB.el.setAttribute("aria-label", "Combat");
  CB.pill = document.createElement("button"); CB.pill.id = "cbPill"; CB.pill.type = "button";
  document.body.append(CB.el, CB.pill);
  CB.pill.onclick = () => { CB.full = true; cbRender(); };
  CB.el.addEventListener("click", async e => {
    const h = e.target.closest("[data-cbh]"); if (h) { const v = cbHistory()[+h.dataset.cbh]; if (v) { CB.past = v; cbRender(); } return; }
    const so = e.target.closest("[data-cbs]"); if (so) { CB.sort = so.dataset.cbs === "s" ? "s" : "v"; try { localStorage.setItem("gravitas.cbSort", CB.sort); } catch (x) {} CB.html = ""; cbRender(); return; }   // v0.92: value or your ship order
    const ox = e.target.closest("[data-cbox]"); if (ox) { CB.order.splice(+ox.dataset.cbox, 1); cbOrderSave(); return; }
    const oa = e.target.closest("[data-cboa]"); if (oa) { const n = oa.dataset.cboa; if (n && !CB.order.includes(n) && CB.order.length < 12) { CB.order.push(n); cbOrderSave(); } return; }
    const b = e.target.closest("[data-cb]"); if (!b) return;
    if (b.dataset.cb === "min") { CB.full = false; cbRender(); }
    else if (b.dataset.cb === "hist") { cbHistOpen(); }
    else if (b.dataset.cb === "hclose") { CB.hist = false; CB.past = null; CB.full = false; cbRender(); }
    else if (b.dataset.cb === "close" && CB.past) { CB.past = null; cbRender(); }
    else if (b.dataset.cb === "close") { if (CB.remote) CB.remote = Object.assign({}, CB.remote, { closed: true }); else { CB.report = null; CB.rev++; } CB.full = false; cbRender(); try { syncShow(); } catch (x) {} }
    else if (b.dataset.cb === "copy") { const V = cbView(); try { await navigator.clipboard.writeText(cbReportText(V)); b.textContent = "Copied"; } catch (x) { prompt("Copy:", cbReportText(V)); } }
    else if (b.dataset.cb === "solo" || b.dataset.cb === "team") { CB.tab = b.dataset.cb; cbRender(); }
    else if (b.dataset.cb === "img" || b.dataset.cb === "save") {           // v0.91.1: the card as a picture, pasted straight into Discord
      const V = cbView(), blob = await new Promise(r => cbCard(V).toBlob(r, "image/png")), name = `gravitas-combat-${new Date(V.ep.t1 || Date.now()).toISOString().slice(0, 16).replace(/[:T]/g, "-")}.png`;
      if (b.dataset.cb === "img") { try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); b.textContent = "Copied: paste in Discord"; return; } catch (x) { b.textContent = "Saved instead"; } }
      const u = URL.createObjectURL(blob), l = document.createElement("a"); l.href = u; l.download = name; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
  });
  addEventListener("keydown", e => { if (e.key === "Escape" && CB.full && CB.el.classList.contains("show")) { CB.full = false; cbRender(); } });
}
function cbRender(part) {
  cbInit();
  const list = CB.hist && !CB.past, V = list ? null : cbView(), live = CB.remote || cbLiveView();
  const show = list || (!!V && !V.closed && CB.full), pill = !show && !!live && live.on && !live.closed;
  CB.el.classList.toggle("show", show); CB.el.classList.toggle("report", list || (!!V && !V.on));
  document.body.classList.toggle("cbFull", show);
  CB.pill.style.display = pill ? "block" : "none";
  if (pill) CB.pill.innerHTML = live.soft ? `<b>● HOSTILES NEAR</b> no fire yet` : `<b>● COMBAT</b> ${live.ep ? `${live.ep.n} kills · ${cbNum(live.ep.cr)} cr` : ""}`;
  CB.pill.classList.toggle("soft", !!(pill && live.soft));
  if (show) { const h = list ? cbHistHTML() : cbHTML(V); if (h !== CB.html) { CB.html = h; CB.el.innerHTML = h; } }
  else CB.html = "";
}
// once a second: calm for long enough ends the fight; the clocks tick
function cbTick() {
  const now = Date.now();
  if (CB.on && !CB.remote) {
    if (CB.soft) { if (now - CB.softT > CB_SOFT) cbEnd(0, "soft"); return; }   // v0.92.3: no fire in 20 s: it was only a look
    if (/^Combat/i.test(CB.music) || (CB.st && CB.st.danger && CB.st.hp)) { CB.lastHot = Math.max(CB.lastHot, now); if (CB.ep) CB.ep.t1 = Math.max(CB.ep.t1, now); }
    if (now - CB.lastHot > (CB.ep && CB.ep.op && CB.op ? CB_OP_CALM : CB_CALM)) cbEnd(0, "calm");   // v0.91.2: in an Operation the lulls between phases are part of it
  }
  if (!CB.el || !CB.el.classList.contains("show")) return;
  for (const e of CB.el.querySelectorAll("[data-cba]")) { const t = cbAgo(+e.dataset.cba); if (e.textContent !== t) e.textContent = t; }
  for (const e of CB.el.querySelectorAll("[data-cbd]")) if (e.dataset.cbd) { const t = cbDur(now - +e.dataset.cbd); if (e.textContent !== t) e.textContent = t; }
  for (const e of CB.el.querySelectorAll("[data-cbt]")) { const t = cbDur(now - +e.dataset.cbt); if (e.textContent !== t) e.textContent = t; }
}
TICK.add(cbTick);
document.addEventListener("click", e => { if (e.target.closest && e.target.closest("[data-cbhist]")) { e.preventDefault(); cbHistOpen(); } });   // v0.91.4: the Past combats link in the Sync card
// the paired tablet: the computer's combat screen
function cbRemote(v) {
  const was = CB.remote, on = !!(v && v.on);
  if (!v) { if (was) { CB.remote = null; document.body.classList.remove("combat"); cbRender(); } return; }
  if (was && was.closed && was.ep && v.ep && was.ep.t0 === v.ep.t0 && !on) return;   // a report this device already closed
  const real = on && !v.soft, wasReal = !!(was && was.on && !was.soft);   // v0.92.3: a weak start lights only the chip here too
  if (real && !wasReal) { CB.full = true; CB.hist = false; CB.past = null; cbIntro(); try { Sound.alarm && Sound.alarm(); } catch (e) {} }
  if (on && v.soft && !wasReal) CB.full = false;
  if (!on && wasReal) { CB.full = true; cbSave(v); }
  CB.remote = v; document.body.classList.toggle("combat", on); cbRender();
}
