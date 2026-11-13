// v0.99.3: a system without its markets. A station's market, outfitting and shipyard lists are most of a Spansh dump
// (Sol: 1851 KB, 93 KB without them) and only the Station window needs them: /api/system?...&lite=1 sends their
// values as null, and the Station window asks for the full system when it opens.
// The dump is never parsed: its bytes flow past a small state machine (strings, escapes and depth only), so a
// key or a value split between two chunks is handled. Workers cannot time themselves, so the CPU is bounded by
// bytes: after BUDGET bytes the filter stops at the next safe place and the rest flows past unchanged (still valid
// JSON, only less slimmed). Measured on a 9800X3D: about 2 ms per MB warm, 7 to 9 ms for a whole system cold (most of
// it the engine warming up, whatever the budget). The answer is cached (15 min), and the page asks for the full
// system if a lite one fails, so a slow first time costs a second request, never a broken view.
export const SLIM_BUDGET = 2048 * 1024;
export function slimmer(budget = SLIM_BUDGET) {
  const Q = 34, BS = 92, LB = 123, RB = 125, LS = 91, RS = 93, COLON = 58, COMMA = 44;
  const K = ["market", "outfitting", "shipyard"].map(k => Array.from(k, ch => ch.charCodeAt(0)));
  const N = 0, STR = 1, VAL = 2, SKIP = 3, SKIPSTR = 4, SCAL = 5;
  let st = N, esc = false, kb = [], keyOk = false, pend = false, depth = 0, back = SKIP, seen = 0, off = false;
  const isKey = () => {
    if (!keyOk) return false;
    for (const k of K) { if (k.length !== kb.length) continue; let ok = true; for (let j = 0; j < k.length; j++) if (k[j] !== kb[j]) { ok = false; break; } if (ok) return true; }
    return false;
  };
  return function (chunk) {
    if (off) return chunk;
    const n = chunk.length; let out = new Uint8Array(n + 64), o = 0, i = 0;
    const grow = () => { const b = new Uint8Array(out.length * 2); b.set(out); out = b; };
    while (i < n) {
      // the budget: stop where nothing has been dropped half way (not inside a dropped value), copy the rest
      if (seen + i >= budget && (st === N || st === STR || st === VAL)) {
        off = true;
        const rest = chunk.subarray(i), all = new Uint8Array(o + rest.length);
        all.set(out.subarray(0, o)); all.set(rest, o); return all;
      }
      if (st === SKIP) {                                     // inside a dropped value: only its depth counts
        for (; i < n; i++) {
          const c = chunk[i];
          if (c === Q) { st = SKIPSTR; back = SKIP; i++; break; }
          if (c === LB || c === LS) depth++;
          else if ((c === RB || c === RS) && --depth === 0) { st = N; i++; break; }
        }
      } else if (st === SKIPSTR) {
        for (; i < n; i++) {
          const c = chunk[i];
          if (esc) esc = false; else if (c === BS) esc = true; else if (c === Q) { st = back; i++; break; }
        }
      } else if (st === N) {
        for (; i < n; i++) {
          const c = chunk[i];
          if (o >= out.length) grow();
          out[o++] = c;
          if (c === Q) { st = STR; kb.length = 0; keyOk = true; pend = false; i++; break; }
          if (c === COLON && pend) { pend = false; st = VAL; i++; break; }
          if (c !== 32 && c !== 9 && c !== 10 && c !== 13) pend = false;
          if (seen + i + 1 >= budget) { i++; break; }       // (back to the budget check)
        }
      } else if (st === STR) {
        for (; i < n; i++) {
          const c = chunk[i];
          if (o >= out.length) grow();
          out[o++] = c;
          if (esc) { esc = false; keyOk = false; continue; }
          if (c === BS) { esc = true; continue; }
          if (c === Q) { st = N; pend = isKey(); i++; break; }
          if (keyOk) { if (kb.length < 12) kb.push(c); else keyOk = false; }
        }
      } else if (st === VAL) {                               // the dropped value starts after the spaces
        const c = chunk[i++];
        if (c === 32 || c === 9 || c === 10 || c === 13) continue;
        while (o + 4 > out.length) grow();
        out[o++] = 110; out[o++] = 117; out[o++] = 108; out[o++] = 108;   // null
        if (c === LB || c === LS) { st = SKIP; depth = 1; } else if (c === Q) { st = SKIPSTR; back = N; } else st = SCAL;
      } else {                                               // a number, true, false or null, up to , } or ]
        const c = chunk[i++];
        if (c === COMMA || c === RB || c === RS) { st = N; if (o >= out.length) grow(); out[o++] = c; }
      }
    }
    seen += n;
    return out.subarray(0, o);
  };
}
export function slimStream(body, budget) {
  const run = slimmer(budget);
  return body.pipeThrough(new TransformStream({ transform(chunk, ctl) { const r = run(chunk); if (r.length) ctl.enqueue(r); } }));
}
