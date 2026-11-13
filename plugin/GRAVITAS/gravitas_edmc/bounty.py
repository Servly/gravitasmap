"""The Bounty counter and the HUD's keys (v0.16.0, from the squadron's Bounty Counter script).

Counter: every bounty paid for a ship you destroyed (Journal "Bounty", whoever pays it, all factions), and the combat
bonds too if you ask for them, added up from the start of the game session (the Journal's Fileheader), or from when
EDMC started if that was later. Ctrl+Shift+F9 sets it back to 0. Nothing is kept on disk.

v0.35.0 (players' feedback): what you carry and have not cashed in yet, apart from this fight's count: every bounty
(and bond) adds to it, a RedeemVoucher at a station takes it off ("cashed in"), and Died loses it ("lost at death":
the game drops unclaimed vouchers when you die). Kept while EDMC runs, across game sessions (vouchers are too); as it
starts, GRAVITAS takes it from the newest Journal (feed_past), so it covers this game session at least.

Keys: the state of four keys is read with GetAsyncKeyState, a few times a second, as the free-look button's fallback
does (look.py). Nothing is hooked, blocked or changed: the game gets every key as before, and its process is never
touched.
  Ctrl+Shift+F9   the Bounty counter back to 0
  Ctrl+Shift+F10  Targets by value cleared (a ship comes back when you scan it again)
  Ctrl+Shift+F11  the HUD hidden or shown (the fight is still followed)
  (v0.35.0: Ctrl+Shift+F12, "HUD off or on", is gone: it did the same as F11)
"""
import sys

WIN = sys.platform == "win32"
VK_CTRL, VK_SHIFT = 0x11, 0x10
KEYS = {"flip": 0x76, "report": 0x77, "reset": 0x78, "clear": 0x79, "hide": 0x7A}   # F7 to F11 (with Ctrl+Shift)
KEY_NAMES = {"flip": "Ctrl+Shift+F7", "report": "Ctrl+Shift+F8", "reset": "Ctrl+Shift+F9", "clear": "Ctrl+Shift+F10", "hide": "Ctrl+Shift+F11"}


class Counter:
    """The bounties of this game session, from the Journal lines (read by GRAVITAS itself since v0.33.0)."""

    def __init__(self):
        self.cr = 0          # bounties (cr)
        self.n = 0           # kills with a bounty
        self.bonds = 0       # combat bonds (cr), counted always, shown only if asked for
        self.bond_n = 0
        self.rev = 0         # changes when anything above does: the window is drawn again only then
        self.unclaimed = 0   # v0.35.0: bounties not cashed in yet (not set back to 0 by a fight or Ctrl+Shift+F9)
        self.unclaimed_bonds = 0
        self.cashed = 0      # cashed in at a station (RedeemVoucher), bounties and bonds
        self.lost = 0        # lost at death (Died)

    def reset(self):
        self.cr = self.n = self.bonds = self.bond_n = 0
        self.rev += 1

    def feed(self, entry):
        ev = entry.get("event")
        if ev == "Fileheader":                   # a new game session: a new Journal file
            self.reset()
        elif ev == "Bounty":
            self.cr += reward_of(entry)
            self.n += 1
            self.rev += 1
        elif ev in ("FactionKillBond", "CapShipBond"):
            self.bonds += int(entry.get("Reward") or 0)
            self.bond_n += 1
            self.rev += 1
        self.feed_past(entry)

    def feed_past(self, entry):
        """What you carry: the bounties and bonds not cashed in yet, cashed in, lost at death (also from the Journal's
        past, as GRAVITAS starts)."""
        ev = entry.get("event")
        if ev == "Bounty":
            self.unclaimed += reward_of(entry)
        elif ev in ("FactionKillBond", "CapShipBond"):
            self.unclaimed_bonds += int(entry.get("Reward") or 0)
        elif ev == "RedeemVoucher" and str(entry.get("Type", "")).lower() in ("bounty", "combatbond"):
            paid = int(entry.get("Amount") or 0)
            cut = float(entry.get("BrokerPercentage") or 0)        # (Interstellar Factors keep a share: what was owed)
            owed = round(paid / (1 - cut / 100)) if 0 < cut < 100 else paid
            if str(entry.get("Type")).lower() == "bounty":
                self.unclaimed = max(0, self.unclaimed - owed)
            else:
                self.unclaimed_bonds = max(0, self.unclaimed_bonds - owed)
            self.cashed += paid
        elif ev == "Died":
            self.lost += self.unclaimed + self.unclaimed_bonds
            self.unclaimed = self.unclaimed_bonds = 0
        else:
            return
        self.rev += 1

    def view(self, with_bonds):
        return {"cr": self.cr + (self.bonds if with_bonds else 0), "n": self.n + (self.bond_n if with_bonds else 0),
                "bounties": self.cr, "kills": self.n, "bonds": self.bonds if with_bonds else None, "bond_n": self.bond_n,
                "unclaimed": self.unclaimed + (self.unclaimed_bonds if with_bonds else 0), "cashed": self.cashed, "lost": self.lost}


def reward_of(entry):
    """A Bounty line's whole reward (every faction that pays it)."""
    reward = entry.get("TotalReward")
    if reward is None:
        reward = sum(int(r.get("Reward") or 0) for r in entry.get("Rewards") or []) or entry.get("Reward") or 0
    return int(reward or 0)


class Keys:
    """Ctrl+Shift+F9 to F12: each press seen once (on the way down), whichever window is in front."""

    def __init__(self):
        self.held = {k: False for k in KEYS}
        self.ok = WIN
        if WIN:
            import ctypes
            self._state = ctypes.windll.user32.GetAsyncKeyState

    def _down(self, vk):
        return bool(self._state(vk) & 0x8000)

    def pressed(self):
        """The keys pressed since the last look, by name."""
        if not self.ok:
            return []
        mods = self._down(VK_CTRL) and self._down(VK_SHIFT)
        out = []
        for name, vk in KEYS.items():
            down = mods and self._down(vk)
            if down and not self.held[name]:
                out.append(name)
            self.held[name] = down
        return out
