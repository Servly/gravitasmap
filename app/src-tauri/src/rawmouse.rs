//! The mouse buttons seen through Windows' Raw Input (look.py RawMouse), so that the HUD can hide while you look around with the free-look
//! button. Nothing is blocked or changed: the game gets every click as before. The mouse is read on a thread of its own, with its own
//! invisible (message-only) window; the buttons come back as events (down or up, which button).
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::Mutex;
use windows::core::w;
use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::Input::{GetRawInputData, RegisterRawInputDevices, HRAWINPUT, RAWINPUT, RAWINPUTDEVICE, RAWINPUTHEADER, RIDEV_INPUTSINK, RID_INPUT, RIM_TYPEMOUSE};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, RegisterClassW, TranslateMessage, HWND_MESSAGE, MSG, WINDOW_EX_STYLE, WINDOW_STYLE, WM_INPUT, WNDCLASSW,
};

/// (down, up) button flags for Mouse 3, 4 and 5
const BUTTONS: [(u32, u32); 3] = [(0x0010, 0x0020), (0x0040, 0x0080), (0x0100, 0x0200)];

static EVENTS: Mutex<Vec<(bool, u32)>> = Mutex::new(Vec::new());

// the mouse's movement and wheel, added up while DEBRIEF is recording (nothing is added otherwise)
static MOTION_ON: AtomicBool = AtomicBool::new(false);
static MOVE_X: AtomicI64 = AtomicI64::new(0);
static MOVE_Y: AtomicI64 = AtomicI64::new(0);
static WHEEL: AtomicI64 = AtomicI64::new(0);

pub fn set_motion(on: bool) {
    MOTION_ON.store(on, Ordering::Relaxed);
    if !on { let _ = take_motion(); }
}

/// The movement since the last take: (along x, along y, wheel notches: up is positive). Relative movement only (a tablet or a remote desktop sends places, not movement).
pub fn take_motion() -> (i64, i64, i64) {
    (MOVE_X.swap(0, Ordering::Relaxed), MOVE_Y.swap(0, Ordering::Relaxed), WHEEL.swap(0, Ordering::Relaxed))
}
static OK: AtomicBool = AtomicBool::new(false);
static STARTED: AtomicBool = AtomicBool::new(false);

/// Starts reading (once). Whether it worked is `ok()` a moment later.
pub fn start() {
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::Builder::new().name("GRAVITAS raw mouse".into()).spawn(|| crate::guard::keep_running("raw mouse", run)).ok();
}

pub fn ok() -> bool {
    OK.load(Ordering::SeqCst)
}

/// The button events since the last take: (true: down, false: up, the DOWN flag of the button).
pub fn take() -> Vec<(bool, u32)> {
    EVENTS.lock().map(|mut e| std::mem::take(&mut *e)).unwrap_or_default()
}

unsafe extern "system" fn proc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    if msg == WM_INPUT {
        let mut size = std::mem::size_of::<RAWINPUT>() as u32;
        let mut buf: RAWINPUT = std::mem::zeroed();
        let got = GetRawInputData(HRAWINPUT(lp.0 as *mut _), RID_INPUT, Some(&mut buf as *mut _ as *mut _), &mut size, std::mem::size_of::<RAWINPUTHEADER>() as u32);
        if got != u32::MAX && buf.header.dwType == RIM_TYPEMOUSE.0 {
            let flags = buf.data.mouse.Anonymous.Anonymous.usButtonFlags as u32;
            if MOTION_ON.load(Ordering::Relaxed) {
                if (buf.data.mouse.usFlags.0 as u32) & 1 == 0 {
                    MOVE_X.fetch_add(buf.data.mouse.lLastX as i64, Ordering::Relaxed);
                    MOVE_Y.fetch_add(buf.data.mouse.lLastY as i64, Ordering::Relaxed);
                }
                if flags & 0x0400 != 0 {
                    let d = buf.data.mouse.Anonymous.Anonymous.usButtonData as i16;
                    WHEEL.fetch_add(if d > 0 { 1 } else if d < 0 { -1 } else { 0 }, Ordering::Relaxed);
                }
            }
            if flags != 0 {
                if let Ok(mut e) = EVENTS.lock() {
                    for (down, up) in BUTTONS {
                        if flags & down != 0 {
                            e.push((true, down));
                        }
                        if flags & up != 0 {
                            e.push((false, down));
                        }
                    }
                    if e.len() > 200 {
                        e.drain(..100); // (never left to pile up)
                    }
                }
            }
        }
    }
    DefWindowProcW(hwnd, msg, wp, lp)
}

fn run() {
    if cfg!(feature = "diag-noinput") { return; } // (diagnostic build only)
    unsafe {
        let hinst = GetModuleHandleW(None).map(|m| HINSTANCE(m.0)).unwrap_or_default();
        let wc = WNDCLASSW { lpfnWndProc: Some(proc), hInstance: hinst, lpszClassName: w!("GRAVITASRawMouse"), ..Default::default() };
        RegisterClassW(&wc);
        let Ok(hwnd) = CreateWindowExW(WINDOW_EX_STYLE(0), w!("GRAVITASRawMouse"), w!("GRAVITAS"), WINDOW_STYLE(0), 0, 0, 0, 0, Some(HWND_MESSAGE), None, Some(hinst), None) else { return };
        let dev = RAWINPUTDEVICE { usUsagePage: 1, usUsage: 2, dwFlags: RIDEV_INPUTSINK, hwndTarget: hwnd }; // the mouse, also while another program is in front
        if RegisterRawInputDevices(&[dev], std::mem::size_of::<RAWINPUTDEVICE>() as u32).is_err() {
            return;
        }
        OK.store(true, Ordering::SeqCst);
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
}
