"""Free look: the free-look button (Mouse 3, 4 or 5), seen through Windows' Raw Input, so that the HUD can hide while
you look around. (v0.5.0 also turned the cards with the mouse; since v0.6.0 the cockpit is watched on screen instead:
track.py.) Nothing is blocked or changed: the game gets every click and movement as before, and its process is never
touched.

Windows only (ctypes, part of Python). The mouse is read on a thread of its own with its own invisible window.
"""
import ctypes
import sys
import threading

WIN = sys.platform == "win32"

# raw mouse button events (RAWMOUSE.usButtonFlags): (down, up) for Mouse 3, 4 and 5
BUTTONS = {"m3": (0x0010, 0x0020), "m4": (0x0040, 0x0080), "m5": (0x0100, 0x0200)}

if WIN:
    from ctypes import wintypes

    LRESULT = ctypes.c_ssize_t
    WNDPROC = ctypes.WINFUNCTYPE(LRESULT, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM)

    class WNDCLASSW(ctypes.Structure):
        _fields_ = [("style", wintypes.UINT), ("lpfnWndProc", WNDPROC), ("cbClsExtra", ctypes.c_int), ("cbWndExtra", ctypes.c_int),
                    ("hInstance", wintypes.HINSTANCE), ("hIcon", wintypes.HICON), ("hCursor", wintypes.HANDLE),
                    ("hbrBackground", wintypes.HBRUSH), ("lpszMenuName", wintypes.LPCWSTR), ("lpszClassName", wintypes.LPCWSTR)]

    class RAWINPUTDEVICE(ctypes.Structure):
        _fields_ = [("usUsagePage", wintypes.USHORT), ("usUsage", wintypes.USHORT), ("dwFlags", wintypes.DWORD), ("hwndTarget", wintypes.HWND)]

    class RAWINPUTHEADER(ctypes.Structure):
        _fields_ = [("dwType", wintypes.DWORD), ("dwSize", wintypes.DWORD), ("hDevice", wintypes.HANDLE), ("wParam", wintypes.WPARAM)]

    class RAWMOUSE(ctypes.Structure):
        # usFlags, then a union that starts on 4 bytes (ULONG ulButtons): 2 bytes of padding before the button flags
        _fields_ = [("usFlags", wintypes.USHORT), ("_pad", wintypes.USHORT), ("usButtonFlags", wintypes.USHORT), ("usButtonData", wintypes.USHORT),
                    ("ulRawButtons", wintypes.ULONG), ("lLastX", wintypes.LONG), ("lLastY", wintypes.LONG), ("ulExtraInformation", wintypes.ULONG)]

    class RAWINPUT(ctypes.Structure):
        _fields_ = [("header", RAWINPUTHEADER), ("mouse", RAWMOUSE)]

    WM_INPUT, WM_CLOSE, WM_DESTROY = 0x00FF, 0x0010, 0x0002
    RID_INPUT, RIDEV_INPUTSINK, RIM_TYPEMOUSE, MOUSE_MOVE_ABSOLUTE = 0x10000003, 0x00000100, 0, 0x01
    HWND_MESSAGE = wintypes.HWND(-3)


class RawMouse:
    """Adds up how the mouse moves, and sees the free-look button go down and up, from any program in front."""

    def __init__(self, logger):
        self.log = logger
        self.lock = threading.Lock()
        self.dx = self.dy = 0
        self.events = []           # ("down" | "up", button flag), in order
        self.ok = False
        self.hwnd = None
        if WIN:
            self.t = threading.Thread(target=self._run, name="GRAVITAS-mouse", daemon=True)
            self.t.start()

    def take(self):
        """The movement since the last call, and the button events."""
        with self.lock:
            d = (self.dx, self.dy, self.events)
            self.dx = self.dy = 0
            self.events = []
        return d

    def _run(self):
        try:
            # user32 of our own: ctypes.windll.user32 is shared with EDMC, which sets its own types on the same
            # functions (RegisterClassW with its WNDCLASS: "expected LP_WNDCLASS", v0.11.1)
            u32 = self.u32 = ctypes.WinDLL("user32", use_last_error=True)
            k32 = ctypes.WinDLL("kernel32", use_last_error=True)
            k32.GetModuleHandleW.restype = wintypes.HMODULE
            u32.RegisterClassW.argtypes = [ctypes.POINTER(WNDCLASSW)]
            u32.DefWindowProcW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
            u32.DefWindowProcW.restype = LRESULT
            u32.GetRawInputData.argtypes = [wintypes.HANDLE, wintypes.UINT, ctypes.c_void_p, ctypes.POINTER(wintypes.UINT), wintypes.UINT]
            u32.CreateWindowExW.restype = wintypes.HWND
            u32.CreateWindowExW.argtypes = [wintypes.DWORD, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD, ctypes.c_int, ctypes.c_int,
                                            ctypes.c_int, ctypes.c_int, wintypes.HWND, wintypes.HMENU, wintypes.HINSTANCE, wintypes.LPVOID]
            buf = RAWINPUT()
            size = wintypes.UINT(ctypes.sizeof(buf))
            hdr = ctypes.sizeof(RAWINPUTHEADER)

            def proc(hwnd, msg, wp, lp):
                if msg == WM_INPUT:
                    n = wintypes.UINT(ctypes.sizeof(buf))
                    if u32.GetRawInputData(lp, RID_INPUT, ctypes.byref(buf), ctypes.byref(n), hdr) != 0xFFFFFFFF and buf.header.dwType == RIM_TYPEMOUSE:
                        m = buf.mouse
                        with self.lock:
                            if not m.usFlags & MOUSE_MOVE_ABSOLUTE:
                                self.dx += m.lLastX
                                self.dy += m.lLastY
                            if m.usButtonFlags:
                                for down, up in BUTTONS.values():
                                    if m.usButtonFlags & down:
                                        self.events.append(("down", down))
                                    if m.usButtonFlags & up:
                                        self.events.append(("up", down))
                elif msg == WM_CLOSE:
                    u32.DestroyWindow(hwnd)
                    return 0
                elif msg == WM_DESTROY:
                    u32.PostQuitMessage(0)
                    return 0
                return u32.DefWindowProcW(hwnd, msg, wp, lp)

            self._proc = WNDPROC(proc)                 # kept, or Python would free it while Windows still calls it
            hinst = k32.GetModuleHandleW(None)
            wc = WNDCLASSW(lpfnWndProc=self._proc, hInstance=hinst, lpszClassName="GRAVITASRawMouse")
            u32.RegisterClassW(ctypes.byref(wc))
            self.hwnd = u32.CreateWindowExW(0, "GRAVITASRawMouse", "GRAVITAS", 0, 0, 0, 0, 0, HWND_MESSAGE, None, hinst, None)
            if not self.hwnd:
                raise OSError(f"no window ({ctypes.get_last_error()})")
            dev = RAWINPUTDEVICE(1, 2, RIDEV_INPUTSINK, self.hwnd)    # the mouse, also while another program is in front
            if not u32.RegisterRawInputDevices(ctypes.byref(dev), 1, ctypes.sizeof(dev)):
                raise OSError(f"Raw Input refused ({ctypes.get_last_error()})")
            self.ok = True
            msg = wintypes.MSG()
            while u32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
                u32.TranslateMessage(ctypes.byref(msg))
                u32.DispatchMessageW(ctypes.byref(msg))
        except Exception as e:
            self.ok = False
            self.log.warning(f"GRAVITAS free look: the mouse cannot be read: {e}")

    def stop(self):
        if WIN and self.hwnd:
            try:
                (getattr(self, "u32", None) or ctypes.windll.user32).PostMessageW(self.hwnd, WM_CLOSE, 0, 0)
            except Exception:
                pass
