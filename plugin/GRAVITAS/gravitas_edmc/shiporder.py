"""v0.35.0: "My ship order first" picked from a menu, not typed: a ship's name typed by hand (its spelling, "Mk II" or
"MkII", looked up on the internet) did not always match the game's, and the order then did nothing (players' feedback).

The names are the combat engine's own (CB_SHIPS in engine/combat-engine.js: the names the game itself shows), read
once from that file, so the menu and the list always agree.
"""
import os
import re
import tkinter as tk

import myNotebook as nb    # EDMC's themed widgets

ENGINE_JS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "engine", "combat-engine.js")
MAX = 12
_names = None


def ship_names():
    """Every ship type the engine knows, A to Z."""
    global _names
    if _names is None:
        try:
            with open(ENGINE_JS, encoding="utf-8") as f:
                js = f.read()
            block = re.search(r"const CB_SHIPS = \{(.*?)\};", js, re.S)
            _names = sorted(set(re.findall(r':\s*"([^"]+)"', block.group(1)))) if block else []
        except OSError:
            _names = []
    return _names


class OrderBox:
    """The order as a row of names (not typed in), an Add menu with every ship, a Remove menu with the chosen ones, and
    Clear. on_change(list) is called after each change."""

    def __init__(self, parent, order, on_change):
        self.order = list(order)[:MAX]
        self.on_change = on_change
        self.f = nb.Frame(parent)
        self.text = tk.StringVar()
        tk.Entry(self.f, textvariable=self.text, width=44, state="readonly").grid(row=0, column=0, columnspan=4, sticky=tk.W)
        self.add_btn = tk.Menubutton(self.f, text="Add a ship ▾", relief=tk.RAISED)
        self.add_btn.grid(row=1, column=0, sticky=tk.W, pady=(4, 0))
        self.add_btn["menu"] = self.add_menu = tk.Menu(self.add_btn, tearoff=0)
        self.del_btn = tk.Menubutton(self.f, text="Remove ▾", relief=tk.RAISED)
        self.del_btn.grid(row=1, column=1, sticky=tk.W, padx=(6, 0), pady=(4, 0))
        self.del_btn["menu"] = self.del_menu = tk.Menu(self.del_btn, tearoff=0)
        nb.Button(self.f, text="Clear", command=self.clear).grid(row=1, column=2, sticky=tk.W, padx=(6, 0), pady=(4, 0))
        self.fill()

    def grid(self, **kw):
        self.f.grid(**kw)

    def fill(self):
        self.text.set(", ".join(f"{i}. {n}" for i, n in enumerate(self.order, start=1)) or "(none chosen yet)")
        self.add_menu.delete(0, "end")
        for n in ship_names():
            if n not in self.order:
                self.add_menu.add_command(label=n, command=lambda n=n: self.add(n))
        self.del_menu.delete(0, "end")
        for n in self.order:
            self.del_menu.add_command(label=n, command=lambda n=n: self.remove(n))
        self.add_btn.configure(state=tk.NORMAL if len(self.order) < MAX else tk.DISABLED)
        self.del_btn.configure(state=tk.NORMAL if self.order else tk.DISABLED)

    def set(self, order):
        self.order = list(order)[:MAX]
        self.fill()

    def add(self, n):
        if n not in self.order and len(self.order) < MAX:
            self.order.append(n)
            self.changed()

    def remove(self, n):
        if n in self.order:
            self.order.remove(n)
            self.changed()

    def clear(self):
        self.order = []
        self.changed()

    def changed(self):
        self.fill()
        self.on_change(list(self.order))
