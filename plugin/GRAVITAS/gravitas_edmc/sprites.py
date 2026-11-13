"""Each of GRAVITAS's windows as one picture that moves and fades without being drawn again (v0.10.0).

Windows: every window is a small window of its own with true see-through dots (a layered window, UpdateLayeredWindow,
as the overlays made with Qt or WinForms do): soft edges and a real glow over the game, no dark fringe. Moving it or
fading it only tells Windows where and how see-through, so it can follow the game's head turns smoothly, many times a
second. Elsewhere (tests on Linux), and on Windows when that fails, the pictures lie on the HUD's canvas.
"""
import sys
import threading

WIN = sys.platform == "win32"

if WIN:
    import ctypes
    from ctypes import wintypes
    _u = ctypes.WinDLL("user32", use_last_error=True)     # own function pointers: their types set here only
    _g = ctypes.WinDLL("gdi32", use_last_error=True)
    H = ctypes.c_void_p
    _u.GetDC.restype = H
    _u.GetDC.argtypes = [H]
    _u.ReleaseDC.argtypes = [H, H]
    _u.ShowWindow.argtypes = [H, ctypes.c_int]
    _u.SetWindowPos.argtypes = [H, H, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_uint]
    _g.CreateCompatibleDC.restype = H
    _g.CreateCompatibleDC.argtypes = [H]
    _g.CreateDIBSection.restype = H
    _g.CreateDIBSection.argtypes = [H, ctypes.c_void_p, ctypes.c_uint, ctypes.POINTER(ctypes.c_void_p), H, wintypes.DWORD]
    _g.SelectObject.restype = H
    _g.SelectObject.argtypes = [H, H]
    _g.DeleteObject.argtypes = [H]
    _g.DeleteDC.argtypes = [H]

    class BLEND(ctypes.Structure):
        _fields_ = [("op", ctypes.c_ubyte), ("flags", ctypes.c_ubyte), ("alpha", ctypes.c_ubyte), ("fmt", ctypes.c_ubyte)]

    class BMIH(ctypes.Structure):
        _fields_ = [("biSize", wintypes.DWORD), ("biWidth", wintypes.LONG), ("biHeight", wintypes.LONG),
                    ("biPlanes", wintypes.WORD), ("biBitCount", wintypes.WORD), ("biCompression", wintypes.DWORD),
                    ("biSizeImage", wintypes.DWORD), ("biXPelsPerMeter", wintypes.LONG), ("biYPelsPerMeter", wintypes.LONG),
                    ("biClrUsed", wintypes.DWORD), ("biClrImportant", wintypes.DWORD)]

    _u.UpdateLayeredWindow.argtypes = [H, H, ctypes.POINTER(wintypes.POINT), ctypes.POINTER(wintypes.SIZE), H,
                                       ctypes.POINTER(wintypes.POINT), wintypes.DWORD, ctypes.POINTER(BLEND), wintypes.DWORD]
    _u.UpdateLayeredWindow.restype = wintypes.BOOL
    _u.CreateWindowExW.restype = H
    _u.CreateWindowExW.argtypes = [wintypes.DWORD, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD, ctypes.c_int,
                                   ctypes.c_int, ctypes.c_int, ctypes.c_int, H, H, H, H]
    _u.DestroyWindow.argtypes = [H]
    _k = ctypes.WinDLL("kernel32", use_last_error=True)
    _k.GetModuleHandleW.restype = H
    _k.GetModuleHandleW.argtypes = [wintypes.LPCWSTR]

LAYERED, TRANSPARENT, TOOL, NOACT, TOPMOST, POPUP = 0x80000, 0x20, 0x80, 0x08000000, 0x8, 0x80000000
SW_HIDE, SW_SHOWNOACTIVATE = 0, 4
ULW_ALPHA = 2


def bgra(img):
    """A Pillow RGBA picture as Windows wants it: blue, green, red, alpha, the colours already times alpha."""
    from PIL import Image, ImageChops
    r, g, b, a = img.split()
    return Image.merge("RGBA", (ImageChops.multiply(b, a), ImageChops.multiply(g, a), ImageChops.multiply(r, a), a)).tobytes()


class Layered:
    """One of GRAVITAS's windows, as a window of its own: never takes a click or the focus, not in the taskbar. A plain
    Windows window (made hidden, shown without being activated): the game keeps the focus."""

    def __init__(self, root=None):
        self.hwnd = _u.CreateWindowExW(LAYERED | TRANSPARENT | TOOL | NOACT | TOPMOST, "STATIC", "GRAVITAS HUD", POPUP,
                                       -32000, -32000, 8, 8, None, None, _k.GetModuleHandleW(None), None)
        if not self.hwnd:
            raise OSError(f"CreateWindowEx failed ({ctypes.get_last_error()})")
        self.visible = False
        self.at = None
        self.size = (0, 0)
        self.lock = threading.Lock()         # v0.14.0: moved from the tracking thread too

    def picture(self, img, x, y, alpha):
        with self.lock:
            if self.hwnd:
                self._picture(img, x, y, alpha)
                if alpha > 0:
                    # v0.21.0: shown too (a hidden window's new picture stayed hidden: a panel's windows booted up
                    # unseen and then popped up at the end)
                    self._show(True)

    def _picture(self, img, x, y, alpha):
        """A new picture (and where, how see-through)."""
        w, h = img.size
        self.size = (w, h)
        data = bgra(img)
        screen = _u.GetDC(None)
        mem = _g.CreateCompatibleDC(screen)
        bits = ctypes.c_void_p()
        bmi = BMIH(ctypes.sizeof(BMIH), w, -h, 1, 32, 0, 0, 0, 0, 0, 0)       # top-down rows
        bmp = _g.CreateDIBSection(screen, ctypes.byref(bmi), 0, ctypes.byref(bits), None, 0)
        try:
            if not bmp or not bits.value:
                raise OSError("CreateDIBSection failed")
            ctypes.memmove(bits, data, len(data))
            old = _g.SelectObject(mem, bmp)
            pt, size, src = wintypes.POINT(round(x), round(y)), wintypes.SIZE(w, h), wintypes.POINT(0, 0)
            ok = _u.UpdateLayeredWindow(self.hwnd, screen, ctypes.byref(pt), ctypes.byref(size), mem, ctypes.byref(src), 0,
                                        ctypes.byref(BLEND(0, 0, self._a(alpha), 1)), ULW_ALPHA)
            _g.SelectObject(mem, old)
            if not ok:
                raise OSError(f"UpdateLayeredWindow failed ({ctypes.get_last_error()})")
            self.at = (round(x), round(y), self._a(alpha))
        finally:
            if bmp:
                _g.DeleteObject(bmp)
            _g.DeleteDC(mem)
            _u.ReleaseDC(None, screen)

    def alpha_now(self):
        return self.at[2] / 255 if self.visible and self.at else 0.0

    @staticmethod
    def _a(alpha):
        return max(0, min(255, round(alpha * 255)))

    def place(self, x, y, alpha):
        """Only where and how see-through: the picture stays as it is (cheap: many times a second)."""
        with self.lock:
            if not self.hwnd:
                return
            at = (round(x), round(y), self._a(alpha))
            if at[2] == 0:
                return self._show(False)
            if at != self.at:
                pt = wintypes.POINT(at[0], at[1])
                _u.UpdateLayeredWindow(self.hwnd, None, ctypes.byref(pt), None, None, None, 0, ctypes.byref(BLEND(0, 0, at[2], 1)), ULW_ALPHA)
                self.at = at
            self._show(True)

    def move_to(self, x, y):
        """Only where (the tracking thread, v0.14.0): shown windows only, as see-through as they are."""
        with self.lock:
            if not self.hwnd or not self.visible or self.at is None:
                return
            at = (round(x), round(y), self.at[2])
            if at != self.at:
                pt = wintypes.POINT(at[0], at[1])
                _u.UpdateLayeredWindow(self.hwnd, None, ctypes.byref(pt), None, None, None, 0, ctypes.byref(BLEND(0, 0, at[2], 1)), ULW_ALPHA)
                self.at = at

    def show(self, on):
        with self.lock:
            if self.hwnd:
                self._show(on)

    def _show(self, on):
        if on != self.visible:
            _u.ShowWindow(self.hwnd, SW_SHOWNOACTIVATE if on else SW_HIDE)
            if on:      # over the game (topmost, without taking the focus)
                _u.SetWindowPos(self.hwnd, ctypes.c_void_p(-1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010)
            self.visible = on

    def destroy(self):
        with self.lock:
            if self.hwnd:
                _u.DestroyWindow(self.hwnd)
                self.hwnd = None


class OnCanvas:
    """The same, as a picture on the HUD's canvas (tests on Linux; Windows without layered windows)."""

    def __init__(self, cv, cut=False):
        self.cv, self.cut = cv, cut
        self.item = None
        self.photo = None
        self.visible = False
        self.at = None

    def picture(self, img, x, y, alpha):
        from PIL import ImageTk
        if self.cut:            # a see-through colour key cannot mix: the soft edge is laid on the game's own dark (space,
            # the cockpit's shadow) instead, so it stays smooth; only the faintest dots go see-through (v0.11.0)
            from PIL import Image
            dark = Image.new("RGBA", img.size, (6, 5, 9, 255))
            a = img.getchannel("A")
            img = Image.alpha_composite(dark, img)
            img.putalpha(a.point(lambda v: 0 if v < 14 else 255))
        self.photo = ImageTk.PhotoImage(img)
        if self.item is None:
            self.item = self.cv.create_image(round(x), round(y), image=self.photo, anchor="nw", tags="sprite",
                                              state="hidden")
        else:
            self.cv.itemconfigure(self.item, image=self.photo)
        self.at = None
        self.place(x, y, alpha)

    def alpha_now(self):
        return 1.0 if self.visible else 0.0

    def move_to(self, x, y):
        pass                     # (Tk is not to be touched from another thread: the canvas follows at EDMC's turn)

    def place(self, x, y, alpha):
        at = (round(x), round(y))
        if alpha <= 0.02:
            return self.show(False)
        if at != self.at:
            self.cv.coords(self.item, *at)
            self.at = at
        self.show(True)

    def show(self, on):
        if self.item is not None and on != self.visible:
            self.cv.itemconfigure(self.item, state="normal" if on else "hidden")
            self.visible = on

    def destroy(self):
        if self.item is not None:
            self.cv.delete(self.item)
        self.item = self.photo = None
