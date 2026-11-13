"""How late EDMC hands over each Journal line, against GRAVITAS reading the Journal itself (v0.32.0, a measurement).

GRAVITAS reads the newest Journal every 15 ms (load.journal_tail); EDMC hands the same lines over through
journal_entry. Each line is matched by its time and event, and the gap is kept: positive when EDMC came later. Every
two minutes, and when EDMC closes, the log gets one line: how late, in the middle and at worst, and by event. This is
to decide whether GRAVITAS should read the whole Journal itself (CMDR Hongark). Only times are kept, in memory.
"""
import collections
import time

EVERY_S = 120
KEEP_S = 30          # a line seen by one side only is forgotten after this long


class Lag:
    def __init__(self, log):
        self.log = log
        self.ours = collections.defaultdict(collections.deque)    # (timestamp, event): when GRAVITAS read it
        self.theirs = collections.defaultdict(collections.deque)  # ... when EDMC handed it over first
        self.gaps = []                                            # (event, ms: EDMC later than GRAVITAS)
        self.t_sum = time.perf_counter()

    def ours_saw(self, ts, ev, t):
        k = (ts, ev)
        if self.theirs.get(k):
            self.gaps.append((ev, (self.theirs[k].popleft() - t) * 1000))
        else:
            self.ours[k].append(t)

    def edmc_gave(self, ts, ev, t):
        k = (ts, ev)
        if self.ours.get(k):
            self.gaps.append((ev, (t - self.ours[k].popleft()) * 1000))
        else:
            self.theirs[k].append(t)

    def tick(self, t, final=False):
        if not final and t - self.t_sum < EVERY_S:
            return
        self.t_sum = t
        for d in (self.ours, self.theirs):            # unmatched lines (one side only: before the start, a skip)
            for k in [k for k, q in d.items() if not q or t - q[-1] > KEEP_S]:
                del d[k]
        if not self.gaps:
            return
        ms = sorted(g for _, g in self.gaps)
        pick = lambda p: ms[min(len(ms) - 1, int(p * len(ms)))]
        by = collections.defaultdict(list)
        for ev, g in self.gaps:
            by[ev].append(g)
        top = sorted(by.items(), key=lambda kv: -len(kv[1]))[:8]
        each = ", ".join(f"{ev} {sorted(v)[len(v) // 2]:.0f} ms (n {len(v)})" for ev, v in top)
        self.log.info(f"GRAVITAS timing: EDMC hands a Journal line over {pick(0.5):.0f} ms after GRAVITAS reads it "
                      f"(middle), 90 % under {pick(0.9):.0f} ms, worst {ms[-1]:.0f} ms, {len(ms)} lines; by event: {each}")
        self.gaps = []
