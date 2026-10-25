// -------------------------------------------------------------- view panel
// =================================================================== sound
// Everything is synthesised live with the Web Audio API (no sample files):
// a quiet space ambience, a whoosh for camera moves, and a short signature
// for each kind of body, varied per body by its bodyId.
const Sound = (() => {
  let ctx = null, master, wet, dry, analyser, ambient = null, on = true, vol = 0.5, ambG = null, ambLP = null, prox = -1, ambOn = true;   // v0.78: the hum plays in 3D only
  const playing = new Set();
  try { const v = localStorage.getItem("gravitas.sound"); if (v) { const o = JSON.parse(v); on = !!o.on; vol = o.vol == null ? 0.5 : +o.vol; } } catch (e) {}
  const save = () => { try { localStorage.setItem("gravitas.sound", JSON.stringify({ on, vol })); } catch (e) {} };
  function impulse(sec, decay) {
    const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }
  function noiseBuf(sec) { const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); let l = 0;
    for (let i = 0; i < n; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } return b; }   // brown noise
  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = on ? vol : 0;
    analyser = ctx.createAnalyser(); analyser.fftSize = 512; analyser.smoothingTimeConstant = 0.85;
    const verb = ctx.createConvolver(); verb.buffer = impulse(3.2, 2.6);
    wet = ctx.createGain(); wet.gain.value = 0.55; dry = ctx.createGain(); dry.gain.value = 1;
    wet.connect(verb); verb.connect(master); dry.connect(master); master.connect(analyser); analyser.connect(ctx.destination);
    startAmbient();
    return true;
  }
  const out = (node, wetAmt = 0.5) => { const g = ctx.createGain(); g.gain.value = wetAmt; node.connect(dry); node.connect(g); g.connect(wet); };
  function startAmbient() {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf(8); src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 260; lp.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = 0.16;
    ambG = ctx.createGain(); ambG.gain.value = ambOn ? 0.3 : 0; ambLP = lp;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.035; lg.gain.value = 140; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    src.connect(lp); lp.connect(g); g.connect(ambG); out(ambG, 0.6); src.start();
    const drones = [41.2, 61.7, 82.4].map((f, i) => {           // a low, slowly beating chord
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = "sine"; o.frequency.value = f; o.detune.value = (i - 1) * 6; og.gain.value = 0.035 / (i + 1);
      const t = ctx.createOscillator(), tg = ctx.createGain(); t.frequency.value = 0.05 + i * 0.03; tg.gain.value = og.gain.value * 0.6; t.connect(tg); tg.connect(og.gain); t.start();
      o.connect(og); og.connect(ambG); o.start(); return o;
    });
    ambient = { src, drones };
  }
  const env = (g, t0, a, peak, d) => { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); };
  function tone(freq, t0, a, d, peak, type = "sine", wetAmt = 0.5) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = freq; env(g, t0, a, peak, d);
    o.connect(g); out(g, wetAmt); o.start(t0); o.stop(t0 + a + d + 0.05); return o;
  }
  function noise(t0, dur, f0, f1, peak, q = 1.2, type = "bandpass") {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf(dur + 0.1);
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ctx.createGain(); env(g, t0, dur * 0.35, peak, dur * 0.65);
    s.connect(f); f.connect(g); out(g, 0.6); s.start(t0); s.stop(t0 + dur + 0.1);
  }
  const rnd = seed => { let x = (seed * 2654435761) >>> 0 || 1; return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296); };
  function signature(b, t0) {                                     // one shared signature for every body: a low thud and grit
    tone(70, t0, 0.005, 0.7, 0.25, "sine", 0.4);
    noise(t0, 0.5, 900, 200, 0.12, 0.8, "lowpass");
  }
  return {
    get on() { return on; }, get vol() { return vol; }, get analyser() { return analyser; }, get ready() { return !!ctx; },
    unlock() { if (init() && ctx.state === "suspended") ctx.resume(); },
    setOn(v) { on = v; save(); if (ctx) master.gain.setTargetAtTime(on ? vol : 0, ctx.currentTime, 0.15); },
    setVol(v) { vol = v; save(); if (ctx && on) master.gain.setTargetAtTime(vol, ctx.currentTime, 0.05); },
    whoosh(dir = 1) { if (!ctx || !on) return; const t = ctx.currentTime; noise(t, 0.9, dir > 0 ? 250 : 2200, dir > 0 ? 2600 : 220, 0.18, 1.4); },
    click() { if (!ctx || !on) return; tone(1320, ctx.currentTime, 0.002, 0.12, 0.04, "sine", 0.4); },
    // v0.82.5: Watch: one voice only, two soft notes one after the other (never a chord)
    chime() { if (!ctx || !on) return; const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine";
      o.frequency.setValueAtTime(784, t); o.frequency.setValueAtTime(1047, t + 0.16);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.02); g.gain.setValueAtTime(0.06, t + 0.15);
      g.gain.exponentialRampToValueAtTime(0.03, t + 0.18); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g); out(g, 0.15); o.start(t); o.stop(t + 0.95); },
    // v0.92: Combat Mode: a cinematic "battle begins" cue (assets/audio/combat-intro.mp3, made for GRAVITAS from scratch:
    // a rising swell, two huge low brass blasts over war drums, in a big hall), through the same volume and mute
    alarm() { if (!ctx || !on) return;
      const play = b => { if (!b) return Sound.alarmSynth(); const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = b; g.gain.value = 0.55; s.connect(g); out(g, 0.05); s.start(); };
      if (Sound._alarmBuf) return play(Sound._alarmBuf);
      fetch("assets/audio/combat-intro.mp3").then(r => r.arrayBuffer()).then(a => ctx.decodeAudioData(a)).then(b => { Sound._alarmBuf = b; play(b); }).catch(() => play(null)); },
    alarmSynth() { if (!ctx || !on) return; const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(); o.type = "triangle";
      o.frequency.setValueAtTime(660, t); o.frequency.setValueAtTime(440, t + 0.14); o.frequency.setValueAtTime(660, t + 0.32); o.frequency.setValueAtTime(440, t + 0.46);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.02); g.gain.setValueAtTime(0.07, t + 0.58); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      o.connect(g); out(g, 0.1); o.start(t); o.stop(t + 0.85); },
    get ctx() { return ctx; },
    playBuffer(b, { gain = 1, loop = false, voice = false, fadeIn = 0 } = {}) {   // recorded sounds (warp effects, voice)
      if (!ctx || !on || !b) return { stop() {} };
      const s = ctx.createBufferSource(); s.buffer = b; s.loop = loop;
      if (loop) { s.loopStart = 0.06; s.loopEnd = b.duration - 0.06; }
      const g = ctx.createGain(), t = ctx.currentTime;
      if (fadeIn) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + fadeIn); } else g.gain.value = gain;
      let node = s;
      if (voice) {                                                  // a touch of presence, like a ship's voice
        const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 110;
        const pk = ctx.createBiquadFilter(); pk.type = "peaking"; pk.frequency.value = 3200; pk.gain.value = 2.5; pk.Q.value = 0.9;
        s.connect(hp); hp.connect(pk); node = pk;
      }
      if (voice) g.gain.value = gain * 0.6;                         // voice sits inside the mix, not on top of it
      node.connect(g); out(g, voice ? 0.16 : 0.05); s.start();
      const h = { stop(f = 0.3) { const t2 = ctx.currentTime; g.gain.cancelScheduledValues(t2); g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t2); g.gain.exponentialRampToValueAtTime(0.0001, t2 + f); try { s.stop(t2 + f + 0.05); } catch (e) {} } };
      playing.add(h); s.onended = () => playing.delete(h); return h;
    },
    stopAll(f = 0.3) { for (const h of [...playing]) h.stop(f); },
    setProximity(p) {                                               // 0 = far out in the system, 1 = right next to a body
      if (!ctx || !ambG || Math.abs(p - prox) < 0.01) return; prox = p; if (!ambOn) return;
      ambG.gain.setTargetAtTime(0.22 + 0.9 * p, ctx.currentTime, 0.6);
      ambLP.frequency.setTargetAtTime(180 + 520 * p, ctx.currentTime, 0.6);
    },
    // v0.78: the background hum belongs to the 3D view: silent on the system map, back with the visitor's own setting in 3D
    setAmbient(v) { ambOn = !!v; if (ctx && ambG) ambG.gain.setTargetAtTime(ambOn ? 0.22 + 0.9 * Math.max(prox, 0) : 0, ctx.currentTime, 0.5); },
    // v0.78: the jump. A deep swell, air rushing past, and a faint high shimmer at the end. About two seconds, soft edges
    jump() {
      if (!ctx || !on) return; const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine";
      o.frequency.setValueAtTime(34, t); o.frequency.exponentialRampToValueAtTime(62, t + 1.2);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
      o.connect(g); out(g, 0.25); o.start(t); o.stop(t + 2);
      noise(t + 0.05, 1.5, 240, 3400, 0.15, 0.8, "lowpass");
      tone(1318.5, t + 0.8, 0.3, 1.2, 0.016, "sine", 0.9); tone(1975.5, t + 0.95, 0.3, 1.1, 0.011, "sine", 0.92);
    },
    focus(b) { if (!ctx || !on) return; const t = ctx.currentTime; noise(t, 0.85, 250, 2600, 0.16, 1.4); signature(b, t + 0.75); },
  };
})();

