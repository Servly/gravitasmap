"""The game's panel keys, seen the moment they go down (v0.18.0): the windows ahead go at once when you open a panel.

Status.json says which panel is open (GuiFocus), but the game writes it only after the panel has begun to open: the
windows ahead left a moment late (CMDR Hongark: "1 pressed, Targets by value still there"). The keys come first. They
are read from the game's own Bindings file (read only): the left, comms, role and right panels (1, 2, 3 and 4 by
default), and UI Back to close one. Their state is only looked at (GetAsyncKeyState, as bounty.py does): the game gets
every key as before. Status.json still has the last word: a guess it does not confirm is taken back.
"""
import os
import re
import sys

WIN = sys.platform == "win32"
BINDS = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Frontier Developments", "Elite Dangerous", "Options", "Bindings")
# the game's panel actions and the GuiFocus each opens (Status.json)
PANELS = {"FocusLeftPanel": 2, "FocusCommsPanel": 3, "FocusRadarPanel": 4, "FocusRightPanel": 1,
          # v0.28.0: the maps and the FSS too (the HUD hides the moment they are asked for, not once they have loaded)
          "GalaxyMapOpen": 6, "SystemMapOpen": 7, "ExplorationFSSEnter": 9}
VK = {"Tab": 0x09, "Enter": 0x0D, "Space": 0x20, "Backspace": 0x08, "Delete": 0x2E, "Insert": 0x2D, "Home": 0x24,
      "End": 0x23, "PageUp": 0x21, "PageDown": 0x22, "LeftArrow": 0x25, "UpArrow": 0x26, "RightArrow": 0x27,
      "DownArrow": 0x28, "Escape": 0x1B}
VK.update({c: ord(c) for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"})
VK.update({f"Numpad_{i}": 0x60 + i for i in range(10)})
VK.update({f"F{i}": 0x6F + i for i in range(1, 13)})
MOUSE = {"Mouse_2": 0x02, "Mouse_3": 0x04, "Mouse_4": 0x05, "Mouse_5": 0x06}


def binds_file():
    """The ship controls' Bindings file the game uses (StartPreset's second line), or None for a built-in preset."""
    try:
        with open(os.path.join(BINDS, "StartPreset.4.start"), encoding="utf-8") as f:
            lines = [ln.strip() for ln in f if ln.strip()]
        name = lines[1] if len(lines) > 1 else lines[0]
        got = [os.path.join(BINDS, n) for n in os.listdir(BINDS) if n.startswith(name + ".") and n.endswith(".binds")]
        return max(got, key=os.path.getmtime) if got else None
    except (OSError, IndexError):
        return None


def keys_of(text, action):
    """The keys bound to an action (one key alone, no modifier): their virtual keys."""
    m = re.search(rf"<{action}>(.*?)</{action}>", text, re.S)
    out = []
    for dev, key, body in re.findall(r'<(?:Primary|Secondary) Device="([^"]*)" Key="([^"]+)"\s*(/>|>.*?</(?:Primary|Secondary)>)',
                                     m.group(1) if m else "", re.S):
        if "Modifier" in body:
            continue                                 # (Ctrl+1 and the like: not guessed)
        vk = VK.get(key[4:]) if dev == "Keyboard" and key.startswith("Key_") else MOUSE.get(key) if dev == "Mouse" else None
        if vk:
            out.append(vk)
    return out


class PanelKeys:
    def __init__(self):
        self.ok = False
        self.open, self.back, self.held = {}, [], set()
        if not WIN:
            return
        path = binds_file()
        try:
            with open(path, encoding="utf-8", errors="replace") as f:
                text = f.read()
        except (OSError, TypeError):
            return
        for action, gui in PANELS.items():
            for vk in keys_of(text, action):
                self.open[vk] = gui
        self.back = keys_of(text, "UI_Back")
        import ctypes
        self._state = ctypes.WinDLL("user32").GetAsyncKeyState
        self.ok = bool(self.open)

    def guess(self, gui):
        """The panel the game is about to show, from a key just pressed (gui: the one open now), or None."""
        if not self.ok:
            return None
        down = {vk for vk in list(self.open) + self.back if self._state(vk) & 0x8000}
        new = down - self.held
        self.held = down
        for vk in new:
            if vk in self.open:
                p = self.open[vk]
                return 0 if p == gui else p          # its key again closes it
            if gui and vk in self.back:
                return 0
        return None


def headlook():
    """v0.22.0: the game's own free look (head look), read from its Bindings file: {"mouse": "m3" (or None), "vk": a
    keyboard key (or None), "toggle": pressed once to look and again to stop, "label": as said in the settings}, or None.
    GRAVITAS hides its HUD the same way the game looks around: the two can no longer disagree (up to 0.21 the plugin's
    own "held" against the game's "toggle" hid the HUD at the wrong times)."""
    path = binds_file()
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            text = f.read()
    except (OSError, TypeError):
        return None
    m = re.search(r"<HeadLookToggle>(.*?)</HeadLookToggle>", text, re.S)
    if not m:
        return None
    toggle = bool(re.search(r'<ToggleOn Value="1"', m.group(1)))
    for dev, key in re.findall(r'<(?:Primary|Secondary) Device="([^"]*)" Key="([^"]+)"', m.group(1)):
        how = "press to look, again to stop" if toggle else "hold to look"
        if dev == "Mouse" and key in ("Mouse_3", "Mouse_4", "Mouse_5"):
            return {"mouse": "m" + key[-1], "vk": None, "toggle": toggle, "label": f"Mouse {key[-1]}, {how}"}
        if dev == "Keyboard" and key.startswith("Key_") and VK.get(key[4:]):
            return {"mouse": None, "vk": VK[key[4:]], "toggle": toggle, "label": f"{key[4:]}, {how}"}
    return None

