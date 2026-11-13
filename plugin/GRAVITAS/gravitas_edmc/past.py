"""The Past combats window, opened from GRAVITAS's line in EDMC's main window: the site's Past combats, on this computer.

The list of fights (newest first), the chosen report in full, and: Copy for Discord (the site's Copy text),
Show in the game (the report card on the HUD for 20 seconds), Delete (with Undo).
"""
import time
import tkinter as tk
from datetime import datetime

from .modes import combat


def when(ms):
    try:
        return datetime.fromtimestamp(ms / 1000).strftime("%d %b %H:%M")
    except (OverflowError, OSError, ValueError, TypeError):
        return "?"


class PastWindow:
    def __init__(self, root, history, on_show):
        self.h, self.on_show = history, on_show
        self.undo = None
        w = self.top = tk.Toplevel(root)
        w.title("GRAVITAS · Past combats")
        w.geometry("880x520")
        w.minsize(640, 360)
        left = tk.Frame(w); left.pack(side=tk.LEFT, fill=tk.Y, padx=(10, 4), pady=10)
        tk.Label(left, text="Your last fights (up to 30), kept on this computer only", anchor=tk.W).pack(fill=tk.X)
        self.list = tk.Listbox(left, width=46, activestyle="none", exportselection=False)
        self.list.pack(fill=tk.Y, expand=True, pady=(4, 0))
        self.list.bind("<<ListboxSelect>>", lambda e: self.show())
        right = tk.Frame(w); right.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(4, 10), pady=10)
        bar = tk.Frame(right); bar.pack(fill=tk.X)
        self.b_copy = tk.Button(bar, text="Copy for Discord", command=self.copy)
        self.b_show = tk.Button(bar, text="Show in the game for 20 s", command=self.show_in_game)
        self.b_del = tk.Button(bar, text="Delete", command=self.delete)
        self.b_undo = tk.Button(bar, text="Undo", command=self.put_back)
        for b in (self.b_copy, self.b_show, self.b_del):
            b.pack(side=tk.LEFT, padx=(0, 6))
        self.msg = tk.Label(bar, text="", anchor=tk.W)
        self.msg.pack(side=tk.LEFT, padx=6)
        self.text = tk.Text(right, wrap=tk.WORD, height=20)
        self.text.pack(fill=tk.BOTH, expand=True, pady=(6, 0))
        self.fill()

    def alive(self):
        try:
            return bool(self.top.winfo_exists())
        except tk.TclError:
            return False

    def fill(self, pick=0):
        self.list.delete(0, tk.END)
        for v in self.h.items:
            ep = v.get("ep") or {}
            self.list.insert(tk.END, f"{when(ep.get('t0'))}  {combat.where(v) or ep.get('sys') or ''}  ·  {ep.get('n', 0)} kills  ·  {combat.num(ep.get('cr'))} cr")
        if self.h.items:
            self.list.selection_set(min(pick, len(self.h.items) - 1))
        self.show()

    def chosen(self):
        s = self.list.curselection()
        return self.h.items[s[0]] if s and s[0] < len(self.h.items) else None

    def show(self):
        v = self.chosen()
        self.text.configure(state=tk.NORMAL)
        self.text.delete("1.0", tk.END)
        self.text.insert("1.0", combat.report_details(v) if v else "No fights yet. After a fight, its report is kept here (the last 30).")
        self.text.configure(state=tk.DISABLED)
        for b in (self.b_copy, self.b_show, self.b_del):
            b.configure(state=tk.NORMAL if v else tk.DISABLED)

    def say(self, s):
        self.msg.configure(text=s)
        self.top.after(4000, lambda: self.alive() and self.msg.cget("text") == s and self.msg.configure(text=""))

    def copy(self):
        v = self.chosen()
        if v:
            self.top.clipboard_clear()
            self.top.clipboard_append(combat.report_text(v))
            self.say("Copied: paste it in Discord")

    def show_in_game(self):
        v = self.chosen()
        if v:
            self.on_show(v)
            self.say("On the game for 20 s: switch to the game")

    def delete(self):
        v = self.chosen()
        if not v:
            return
        s = self.list.curselection()[0]
        self.undo = self.h.delete(v["ep"]["t0"])
        self.fill(s)
        self.b_undo.pack(side=tk.LEFT, padx=(0, 6), before=self.msg)
        self.say("Deleted")
        t = time.time()
        self.undo_t = t
        self.top.after(8000, lambda: self.alive() and self.undo_t == t and self.b_undo.pack_forget())

    def put_back(self):
        if self.undo:
            i, v = self.undo
            self.h.put_back(i, v)
            self.undo = None
            self.b_undo.pack_forget()
            self.fill(i)
