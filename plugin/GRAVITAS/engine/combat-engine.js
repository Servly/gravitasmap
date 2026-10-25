// ------------------------------------------------------------ v0.93 GRAVITAS combat engine
// The part of Combat Mode that understands the fight: Journal lines and Status.json in, the combat view out.
// No screen, no page: the same file runs on the site and, unchanged, inside the GRAVITAS plugin for EDMC (in QuickJS).
// The screen hooks into it through CBH (42-combat.js sets them on the site; the plugin sets its own).
// The host gives SYNC ({ here, on }) and calls: cbEvent(line, replay), cbStatus(status), cbEngineTick() once a second,
// cbLiveView() for what to show.
var CBH = { render() {}, open() {}, ended() {}, after() {} };
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
  if (!replay) { CB.rev++; CBH.render(); }
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
    CB.rev++; CBH.render(); }
  CB.pulling = s.pull;
  // v0.91.1: shields, pips and heat are on the cockpit already: not shown, so no redraw
}
function cbStart(t, why, soft) {
  CB.on = true; CB.soft = !!soft; CB.softT = Date.now(); if (soft) CB.full = false; CB.ep = cbEp(t); CB.ep.why = why; CB.ep.p0 = CB.rank ? CB.rank.p : null; CB.lastHot = Math.max(CB.lastHot, Date.now());
  if (CB.target && Date.now() - CB.target.t < 60000) CB.ep.locks = 1;
  for (const o of CB.scan.values()) if (t - o.t < 10 * 60000 && CB.ep.tgts.length < 30) { CB.ep.tgts.push({ pilot: o.pilot, ship: o.ship, rank: o.rank, bounty: o.bounty, cmdr: o.cmdr, t: o.t, first: o.first, killed: 0, sh: o.sh, h: o.h, legal: o.legal, stage: o.stage, snap: o.sh != null && o.h != null ? [{ t: o.t, sh: o.sh, h: o.h }] : [] }); if (o.legal !== "Clean") cbFoe(o.pilot); }   // v0.92: the ships you scanned just before
  if (!soft) cbOpen(); else { CB.rev++; CBH.render(); }                 // v0.92.3: a weak start only lights the chip
}
// the fight is real: the screen, the intro and the sound (at once, or when a weak start turns into a fight)
function cbOpen() {
  CB.hist = false; CB.past = null; CB.full = true; CB.report = null; CBH.open();   // a new fight takes the screen (the site: intro, red, sound)
  CB.rev++; CBH.render(); CBH.after();
}
function cbHarden(t) { if (!CB.soft) return; CB.soft = false; if (CB.ep) { CB.ep.t0 = Math.max(CB.ep.t0, t || CB.ep.t0); CB.ep.t1 = Math.max(CB.ep.t1, CB.ep.t0); } cbOpen(); }
function cbEnd(t, why) {
  if (!CB.on) return;
  const soft = CB.soft; CB.on = false; CB.soft = false; const ep = CB.ep; CBH.ended();
  if (ep) { if (why === "died") ep.t1 = Math.max(ep.t1, t || ep.t1); ep.end = why;   // v0.92: the time ends at the last hot moment, not when the calm was noticed
    ep.opInfo = CB.op && { ...CB.op }; ep.teamAt = CB.team.slice(0, 6); if (!soft && (ep.kills.length || ep.bondN || ep.shDown || ep.died || (ep.attacks && ep.t1 - ep.t0 >= 60000))) { CB.report = ep; cbSave(cbViewOf(ep, false)); } }   // v0.92.3: no report for a fight with nothing in it
  CB.ep = null; CB.target = null; if (soft) { CB.rev++; CBH.render(); return; } CB.full = !!CB.report; CB.rev++; CBH.render(); CBH.after();
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

// once a second: calm for long enough ends the fight (the site's cbTick then updates its clocks)
function cbEngineTick() {
  const now = Date.now();
  if (CB.on && !CB.remote) {
    if (CB.soft) { if (now - CB.softT > CB_SOFT) cbEnd(0, "soft"); return; }   // v0.92.3: no fire in 20 s: it was only a look
    if (/^Combat/i.test(CB.music) || (CB.st && CB.st.danger && CB.st.hp)) { CB.lastHot = Math.max(CB.lastHot, now); if (CB.ep) CB.ep.t1 = Math.max(CB.ep.t1, now); }
    if (now - CB.lastHot > (CB.ep && CB.ep.op && CB.op ? CB_OP_CALM : CB_CALM)) cbEnd(0, "calm");   // v0.91.2: in an Operation the lulls between phases are part of it
  }
}
