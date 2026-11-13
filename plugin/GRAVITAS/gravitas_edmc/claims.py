"""v0.37.0: the bounties you can claim, from every Journal since your last death, whether EDMC ran or not.

Up to v0.36 the Bounty counter's "unclaimed" counted only while EDMC ran, from the day's Journal (CMDR Hongark: 28.5M
shown, 38.9M in the game's Claims). The game keeps bounty vouchers from one session to the next and drops them all when
you die. So: the Journals are read from the newest back to the last death (Died), every Bounty adds to the faction that
pays it, every RedeemVoucher (bounty) takes off what was cashed in.

"At least": measured against the game's Claims panel, the Journal gives the right sum for some factions to the credit,
while for others the game paid about 7.5 % more than its Bounty lines say (mostly bounties shared with a wing). The game
writes that bonus nowhere, so it is not guessed: the sum shown is what the Journal proves.

Read only, on this computer. The older Journals are read once, on a thread of their own as GRAVITAS starts (only their
Bounty, RedeemVoucher and Died lines are parsed); the newest Journal and every new line come from load.py.
"""
import collections
import glob
import json
import os
import threading

def _events(path):
    """The Bounty, RedeemVoucher and Died lines of one Journal, in order, and whose they are: (CMDR, legacy game)."""
    out = []
    who = [None, None]
    try:
        with open(path, "rb") as f:
            for ln in f:
                head = who[1] is None and b'"Fileheader"' in ln
                cmdr = who[0] is None and (b'"Commander"' in ln or b'"LoadGame"' in ln)
                if head or cmdr or b'"Bounty"' in ln or b'"RedeemVoucher"' in ln or b'"Died"' in ln:
                    try:
                        e = json.loads(ln)
                    except ValueError:
                        continue
                    ev = e.get("event")
                    if ev in ("Bounty", "RedeemVoucher", "Died"):
                        out.append(e)
                    elif ev == "Fileheader" and who[1] is None:      # (Legacy is 3.8: its vouchers are its own)
                        who[1] = str(e.get("gameversion") or "").split(".")[0] in ("1", "2", "3")
                    elif ev in ("Commander", "LoadGame") and who[0] is None and e.get("Name"):
                        who[0] = str(e.get("Name"))
    except OSError:
        pass
    return out, tuple(who)


def since_death(folder, skip=None):
    """What every Journal in folder (but skip) owes you since the last death: {faction: cr}, and whether a death was
    found (else: everything ever written)."""
    files = sorted(glob.glob(os.path.join(folder, "Journal.*.log")), key=os.path.getmtime, reverse=True)
    kept = []
    found = False
    mine = None                                    # (CMDR, legacy) of the newest Journal: another CMDR's are left out
    for p in files:                                # newest first, back to the last death
        same = skip and os.path.normcase(os.path.abspath(p)) == os.path.normcase(os.path.abspath(skip))
        ev, who = _events(p)
        if mine is None and who[0]:
            mine = who
        if same:
            continue
        if mine and who[0] and who != mine:
            continue
        died = [i for i, e in enumerate(ev) if e.get("event") == "Died"]
        if died:
            kept.append(ev[died[-1] + 1:])
            found = True
            break
        kept.append(ev)
    owed = Owed()
    for ev in reversed(kept):
        for e in ev:
            owed.feed(e)
    return owed, found


class Owed:
    """Bounty vouchers held, by the faction that pays them."""

    def __init__(self):
        self.by = collections.Counter()
        self.loose = 0                             # cashed in with no faction named: off the whole sum

    def feed(self, e):
        ev = e.get("event")
        if ev == "Died":
            self.by.clear()
            self.loose = 0
            return True
        if ev == "Bounty":
            rewards = e.get("Rewards") or []
            for r in rewards:
                self.by[str(r.get("Faction") or "")] += int(r.get("Reward") or 0)
            if not rewards and e.get("Reward"):
                self.by[str(e.get("Faction") or "")] += int(e.get("Reward") or 0)
            return True
        if ev == "RedeemVoucher" and str(e.get("Type", "")).lower() == "bounty":
            cut = float(e.get("BrokerPercentage") or 0)       # (Interstellar Factors keep a share: what was owed)
            for r in e.get("Factions") or []:
                a = int(r.get("Amount") or 0)
                a = round(a / (1 - cut / 100)) if 0 < cut < 100 else a
                fac = str(r.get("Faction") or "")
                if fac:                                       # (below 0 here: paid out of an older Journal's)
                    self.by[fac] -= a
                else:
                    self.loose += a
            return True
        return False

    def add(self, other):
        for k, v in other.by.items():
            self.by[k] += v
        self.loose += other.loose

    def total(self):
        return max(0, sum(max(0, v) for v in self.by.values()) - self.loose)

    def factions(self):
        return [(k, v) for k, v in sorted(self.by.items(), key=lambda kv: -kv[1]) if v > 0]


class Claims:
    """The older Journals (read once, on a thread) and everything since: the newest Journal from its first line, then
    every new line. A death since GRAVITAS started leaves the older Journals out."""

    def __init__(self):
        self.old = None                            # Owed of the older Journals, once read
        self.now = Owed()                          # the newest Journal and every line since
        self.died_now = False
        self.rev = 0
        self._t = None

    def start(self, folder, newest):
        if self._t is not None:
            return
        if not folder:                             # (no game folder: only what comes from now on)
            if self.old is None:
                self.old = Owed()
                self.rev += 1
            return
        def work():
            try:
                owed, _ = since_death(folder, skip=newest)
            except Exception:
                owed = Owed()
            self.old = owed
            self.rev += 1
        self._t = threading.Thread(target=work, name="GRAVITAS claims", daemon=True)
        self._t.start()

    def feed(self, e):
        if self.now.feed(e):
            if e.get("event") == "Died":
                self.died_now = True
            self.rev += 1

    def view(self):
        """(cr, [(faction, cr)]), or None while the older Journals are still read."""
        if self.old is None and not self.died_now:
            return None
        o = Owed()
        if not self.died_now:
            o.add(self.old)
        o.add(self.now)
        return o.total(), o.factions()
