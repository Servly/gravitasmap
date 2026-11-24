//! Overlay windows, the same way as the EDMC plugin's sprites.py (and its game_rect in hud.py), now in Rust (GRAVITAS v0.2).
//!
//! An overlay is NOT a web page. It is a plain Win32 window of the system class "STATIC", made with the styles
//! LAYERED | TRANSPARENT | TOOLWINDOW | NOACTIVATE | TOPMOST (so: see-through pixels, every click and every mouse move goes
//! through it to the game, no taskbar button, it is never activated, so the game keeps the focus and the keyboard), shown with
//! SW_SHOWNOACTIVATE, and its picture is a premultiplied BGRA bitmap handed over with UpdateLayeredWindow. Moving it or fading it
//! only tells Windows where and how see-through, which costs nothing.
//!
//! One rule on top of that, from Burak: an overlay is not to be seen while the mouse is over it. A click-through window gets no mouse
//! events, so while it is showing the cursor is looked at about 30 times a second (GetCursorPos) and the overlay fades out as the
//! cursor comes near, and back in once it has left. With nothing showing there is no timer: the thread sleeps in GetMessage.
use serde::Serialize;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use windows::core::w;
use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, POINT, RECT, SIZE, WPARAM, COLORREF};
use windows::Win32::Graphics::Gdi::{
    ClientToScreen, CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, ReleaseDC, SelectObject, AC_SRC_ALPHA, AC_SRC_OVER,
    BITMAPINFO, BITMAPINFOHEADER, BI_RGB, BLENDFUNCTION, DIB_RGB_COLORS, HGDIOBJ,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DestroyWindow, DispatchMessageW, FindWindowW, GetClientRect, GetCursorPos, GetForegroundWindow,
    GetMessageW, GetSystemMetrics, IsIconic, KillTimer, PeekMessageW, PostThreadMessageW, SetTimer, SetWindowPos, ShowWindow,
    UpdateLayeredWindow, HWND_TOPMOST, MSG, PM_NOREMOVE, SM_CXSCREEN, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SW_HIDE,
    SW_SHOWNOACTIVATE, ULW_ALPHA, WINDOW_EX_STYLE, WM_APP, WM_TIMER, WM_USER, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    WS_EX_TOPMOST, WS_EX_TRANSPARENT, WS_POPUP,
};

const TICK_MS: u32 = 33; // about 30 looks a second, only while something is showing
pub(crate) const FADE_MS: f32 = 120.0;
pub(crate) const NEAR: i32 = 8; // the overlay is hidden a few pixels before the cursor is really over it
const MARGIN: i32 = 24;
const TIMER_ID: usize = 1;

/// The game window's title (GRAVITAS_GAME_TITLE names another window for the tests, so they never meet a running game).
pub fn game_title() -> String {
    crate::devenv::var("GRAVITAS_GAME_TITLE").filter(|t| !t.is_empty()).unwrap_or_else(|| "Elite - Dangerous (CLIENT)".to_string())
}

/// What the window of the game is doing: (x, y, w, h) of its drawing area on screen and whether it is the window in front.
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Game {
    NotRunning,
    Minimized,
    Window { x: i32, y: i32, w: i32, h: i32, front: bool },
}

/// hud.py's game_rect(): found by its title, client area to screen, too small a window is no window.
/// Whether Windows shows the mouse cursor now. In flight and over the cockpit panels the game keeps it hidden (it draws its own), in its Esc menu,
/// Options and the like it shows it: measured in the game (17 Nov), the one sign of those menus that no game file gives.
pub fn cursor_showing() -> bool {
    if crate::devenv::var_os("GRAVITAS_IGNORE_CURSOR").is_some() { return false; } // (a developer test with a fake game window: its cursor always shows)
    use windows::Win32::UI::WindowsAndMessaging::{GetCursorInfo, CURSORINFO, CURSOR_SHOWING};
    unsafe {
        let mut c = CURSORINFO { cbSize: std::mem::size_of::<CURSORINFO>() as u32, ..Default::default() };
        GetCursorInfo(&mut c).is_ok() && (c.flags.0 & CURSOR_SHOWING.0) != 0
    }
}

pub fn game_rect() -> Game {
    unsafe {
        let h = match FindWindowW(None, &windows::core::HSTRING::from(game_title())) {
            Ok(h) if !h.0.is_null() => h,
            _ => return Game::NotRunning,
        };
        if IsIconic(h).as_bool() {
            return Game::Minimized;
        }
        let mut r = RECT::default();
        let mut p = POINT { x: 0, y: 0 };
        if GetClientRect(h, &mut r).is_err() || !ClientToScreen(h, &mut p).as_bool() {
            return Game::Minimized;
        }
        let (w, hh) = (r.right - r.left, r.bottom - r.top);
        if w < 200 || hh < 200 {
            return Game::Minimized;
        }
        Game::Window { x: p.x, y: p.y, w, h: hh, front: GetForegroundWindow() == h }
    }
}

#[derive(Serialize, Clone, Default)]
pub struct Info {
    pub test_on: bool,
    pub hover_hide: bool,
    pub shown: bool,
    pub alpha: u8,
    pub placed: String, // "game" (inside the game's window), "screen" (the game is not there), "off"
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
    pub hwnd: isize,
    pub game: String, // "not running", "minimized", "WxH in front", "WxH in the background"
}

enum Cmd {
    Test(bool),
    Hover(bool),
}

pub struct Overlay {
    tx: Sender<Cmd>,
    thread: Arc<AtomicU32>,
    pub info: Arc<Mutex<Info>>,
}

impl Overlay {
    pub fn start(hover_hide: bool) -> Overlay {
        let (tx, rx) = channel();
        let thread = Arc::new(AtomicU32::new(0));
        let info = Arc::new(Mutex::new(Info { hover_hide, placed: "off".into(), game: "not running".into(), ..Default::default() }));
        let (t2, i2) = (thread.clone(), info.clone());
        std::thread::Builder::new().name("GRAVITAS overlay".into()).spawn(move || run(rx, t2, i2, hover_hide)).ok();
        let t0 = Instant::now();
        while thread.load(Ordering::SeqCst) == 0 && t0.elapsed() < Duration::from_secs(2) {
            std::thread::sleep(Duration::from_millis(5));
        }
        Overlay { tx, thread, info }
    }

    fn send(&self, c: Cmd) {
        let _ = self.tx.send(c);
        let id = self.thread.load(Ordering::SeqCst);
        if id != 0 {
            unsafe {
                let _ = PostThreadMessageW(id, WM_APP, WPARAM(0), LPARAM(0));
            }
        }
    }
    pub fn set_test(&self, on: bool) {
        self.send(Cmd::Test(on));
    }
    pub fn set_hover_hide(&self, on: bool) {
        self.send(Cmd::Hover(on));
    }
    pub fn info(&self) -> Info {
        self.info.lock().map(|i| i.clone()).unwrap_or_default()
    }
}

/// One overlay window and what it is doing now.
pub(crate) struct Win {
    pub hwnd: HWND,
    pub bgra: Vec<u8>,
    pub w: i32,
    pub h: i32,
    pub alpha: f32,
    pub shown: bool,
    pub has_picture: bool,
    pub at: (i32, i32, u8),
}

/// A new overlay window: see-through, click-through, never active (the styles of the test panel, see the top of this file).
pub(crate) unsafe fn create_hwnd() -> Option<HWND> {
    let hinst = GetModuleHandleW(None).map(|m| HINSTANCE(m.0)).ok();
    let ex = WINDOW_EX_STYLE(WS_EX_LAYERED.0 | WS_EX_TRANSPARENT.0 | WS_EX_TOOLWINDOW.0 | WS_EX_NOACTIVATE.0 | WS_EX_TOPMOST.0);
    CreateWindowExW(ex, w!("STATIC"), w!("GRAVITAS HUD"), WS_POPUP, -32000, -32000, 8, 8, None, None, hinst, None).ok()
}

fn run(rx: Receiver<Cmd>, thread: Arc<AtomicU32>, info: Arc<Mutex<Info>>, hover_hide: bool) {
    unsafe {
        let mut msg = MSG::default();
        let _ = PeekMessageW(&mut msg, None, WM_USER, WM_USER, PM_NOREMOVE); // the thread's message queue exists from here
        thread.store(GetCurrentThreadId(), Ordering::SeqCst);
        let hinst = GetModuleHandleW(None).map(|m| HINSTANCE(m.0)).ok();
        let ex = WINDOW_EX_STYLE(WS_EX_LAYERED.0 | WS_EX_TRANSPARENT.0 | WS_EX_TOOLWINDOW.0 | WS_EX_NOACTIVATE.0 | WS_EX_TOPMOST.0);
        let hwnd = match CreateWindowExW(ex, w!("STATIC"), w!("GRAVITAS HUD"), WS_POPUP, -32000, -32000, 8, 8, None, None, hinst, None) {
            Ok(h) => h,
            Err(_) => return,
        };
        let (w, h, bgra) = crate::card::test_card();
        let mut win = Win { hwnd, bgra, w, h, alpha: 0.0, shown: false, has_picture: false, at: (-32000, -32000, 0) };
        let (mut test_on, mut hover, mut timer) = (false, hover_hide, false);
        if let Ok(mut i) = info.lock() {
            i.hwnd = hwnd.0 as isize;
            i.w = w;
            i.h = h;
        }
        let mut last = Instant::now();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            if msg.message == WM_APP {
                while let Ok(c) = rx.try_recv() {
                    match c {
                        Cmd::Test(on) => test_on = on,
                        Cmd::Hover(on) => hover = on,
                    }
                }
                if (test_on || win.alpha > 0.0) && !timer {
                    SetTimer(Some(hwnd), TIMER_ID, TICK_MS, None);
                    timer = true;
                    last = Instant::now();
                }
            } else if msg.message == WM_TIMER {
                let dt = last.elapsed().as_secs_f32() * 1000.0;
                last = Instant::now();
                tick(&mut win, test_on, hover, dt, &info);
                if !test_on && win.alpha <= 0.0 && timer {
                    let _ = KillTimer(Some(hwnd), TIMER_ID);
                    timer = false; // nothing showing: no timer, the thread sleeps
                }
            } else {
                DispatchMessageW(&msg);
            }
            if let Ok(mut i) = info.lock() {
                i.test_on = test_on;
                i.hover_hide = hover;
            }
        }
        let _ = DestroyWindow(hwnd);
    }
}

unsafe fn tick(win: &mut Win, test_on: bool, hover: bool, dt: f32, info: &Arc<Mutex<Info>>) {
    let game = game_rect();
    // where: inside the game's window (top right of it), else on the screen (the test panel is a tool: it shows with or without the game)
    let (x, y, placed) = match game {
        Game::Window { x, y, w, .. } => (x + w - win.w - MARGIN, y + MARGIN, "game"),
        _ => (GetSystemMetrics(SM_CXSCREEN) - win.w - MARGIN, MARGIN, "screen"),
    };
    let mut cur = POINT::default();
    let _ = GetCursorPos(&mut cur);
    let inside = cur.x >= x - NEAR && cur.x < x + win.w + NEAR && cur.y >= y - NEAR && cur.y < y + win.h + NEAR;
    let target = if test_on && !(hover && inside) { 255.0 } else { 0.0 };
    let step = 255.0 * dt.max(1.0) / FADE_MS;
    win.alpha = if win.alpha < target { (win.alpha + step).min(target) } else { (win.alpha - step).max(target) };
    let a = win.alpha.round().clamp(0.0, 255.0) as u8;
    if a == 0 {
        if win.shown {
            let _ = ShowWindow(win.hwnd, SW_HIDE);
            win.shown = false;
        }
    } else {
        if !win.has_picture {
            picture(win, x, y, a);
        } else if win.at != (x, y, a) {
            place(win, x, y, a);
        }
        if !win.shown {
            let _ = ShowWindow(win.hwnd, SW_SHOWNOACTIVATE);
            // over the game, on top, without taking the focus
            let _ = SetWindowPos(win.hwnd, Some(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE);
            win.shown = true;
        }
    }
    if let Ok(mut i) = info.lock() {
        i.shown = win.shown;
        i.alpha = a;
        i.placed = if test_on { placed.into() } else { "off".into() };
        i.x = x;
        i.y = y;
        i.game = match game {
            Game::NotRunning => "not running".into(),
            Game::Minimized => "minimized".into(),
            Game::Window { w, h, front, .. } => format!("{w}x{h} {}", if front { "in front" } else { "in the background" }),
        };
    }
}

/// A new picture (and where, how see-through): sprites.py's _picture.
pub(crate) unsafe fn picture(win: &mut Win, x: i32, y: i32, alpha: u8) {
    let screen = GetDC(None);
    let mem = CreateCompatibleDC(Some(screen));
    let mut bmi = BITMAPINFO::default();
    bmi.bmiHeader = BITMAPINFOHEADER {
        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: win.w,
        biHeight: -win.h, // top-down rows
        biPlanes: 1,
        biBitCount: 32,
        biCompression: BI_RGB.0,
        ..Default::default()
    };
    let mut bits: *mut std::ffi::c_void = std::ptr::null_mut();
    if let Ok(bmp) = CreateDIBSection(Some(screen), &bmi, DIB_RGB_COLORS, &mut bits, None, 0) {
        if !bits.is_null() {
            std::ptr::copy_nonoverlapping(win.bgra.as_ptr(), bits as *mut u8, win.bgra.len());
            let old = SelectObject(mem, HGDIOBJ(bmp.0));
            let pt = POINT { x, y };
            let size = SIZE { cx: win.w, cy: win.h };
            let src = POINT { x: 0, y: 0 };
            let blend = BLENDFUNCTION { BlendOp: AC_SRC_OVER as u8, BlendFlags: 0, SourceConstantAlpha: alpha, AlphaFormat: AC_SRC_ALPHA as u8 };
            if UpdateLayeredWindow(win.hwnd, Some(screen), Some(&pt), Some(&size), Some(mem), Some(&src), COLORREF(0), Some(&blend), ULW_ALPHA).is_ok() {
                win.has_picture = true;
                win.at = (x, y, alpha);
            }
            SelectObject(mem, old);
        }
        let _ = DeleteObject(HGDIOBJ(bmp.0));
    }
    let _ = DeleteDC(mem);
    ReleaseDC(None, screen);
}

/// Only where and how see-through, the picture stays as it is (cheap): sprites.py's place.
pub(crate) unsafe fn place(win: &mut Win, x: i32, y: i32, alpha: u8) {
    let pt = POINT { x, y };
    let blend = BLENDFUNCTION { BlendOp: AC_SRC_OVER as u8, BlendFlags: 0, SourceConstantAlpha: alpha, AlphaFormat: AC_SRC_ALPHA as u8 };
    if UpdateLayeredWindow(win.hwnd, None, Some(&pt), None, None, None, COLORREF(0), Some(&blend), ULW_ALPHA).is_ok() {
        win.at = (x, y, alpha);
    }
}


#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicBool;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::LRESULT;
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEINPUT,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        DefWindowProcW, GetWindowLongW, RegisterClassW, SetCursorPos, TranslateMessage, GWL_EXSTYLE, MA_NOACTIVATE, PM_REMOVE,
        WINDOW_STYLE, WM_LBUTTONDOWN, WM_MOUSEACTIVATE, WNDCLASSW, WS_VISIBLE,
    };

    static CLICKS: AtomicU32 = AtomicU32::new(0);
    static STOP: AtomicBool = AtomicBool::new(false);

    unsafe extern "system" fn target_proc(h: HWND, m: u32, w: WPARAM, l: LPARAM) -> LRESULT {
        if m == WM_LBUTTONDOWN {
            CLICKS.fetch_add(1, Ordering::SeqCst);
        }
        if m == WM_MOUSEACTIVATE {
            return LRESULT(MA_NOACTIVATE as isize); // a test window that never takes the focus either
        }
        DefWindowProcW(h, m, w, l)
    }

    /// A plain window under the overlay, standing in for the game: it counts the clicks it gets.
    fn spawn_target(x: i32, y: i32, w: i32, h: i32) {
        let ready = Arc::new(AtomicU32::new(0));
        let r2 = ready.clone();
        STOP.store(false, Ordering::SeqCst);
        std::thread::spawn(move || unsafe {
            let hinst = GetModuleHandleW(None).map(|m| HINSTANCE(m.0)).unwrap_or_default();
            let wc = WNDCLASSW { lpfnWndProc: Some(target_proc), hInstance: hinst, lpszClassName: PCWSTR(w!("GravitasTestTarget").0), ..Default::default() };
            RegisterClassW(&wc);
            // topmost like the overlay, so nothing else (the game, other programs) can come between them; the overlay is shown after it
            let ex = WINDOW_EX_STYLE(WS_EX_TOOLWINDOW.0 | WS_EX_NOACTIVATE.0 | WS_EX_TOPMOST.0);
            let style = WINDOW_STYLE(WS_POPUP.0 | WS_VISIBLE.0);
            let hw = CreateWindowExW(ex, w!("GravitasTestTarget"), w!("target"), style, x, y, w, h, None, None, Some(hinst), None).unwrap();
            r2.store(1, Ordering::SeqCst);
            let mut msg = MSG::default();
            while !STOP.load(Ordering::SeqCst) {
                if PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                } else {
                    std::thread::sleep(Duration::from_millis(5));
                }
            }
            let _ = DestroyWindow(hw);
        });
        while ready.load(Ordering::SeqCst) == 0 {
            std::thread::sleep(Duration::from_millis(5));
        }
    }

    fn click() {
        let mk = |f| INPUT { r#type: INPUT_MOUSE, Anonymous: INPUT_0 { mi: MOUSEINPUT { dwFlags: f, ..Default::default() } } };
        unsafe {
            SendInput(&[mk(MOUSEEVENTF_LEFTDOWN), mk(MOUSEEVENTF_LEFTUP)], std::mem::size_of::<INPUT>() as i32);
        }
    }

    fn game_front() -> bool {
        matches!(game_rect(), Game::Window { front: true, .. })
    }

    /// Run by hand (it moves the real cursor for about three seconds and clicks once, on its own test window):
    /// cargo test live_overlay -- --ignored --nocapture
    #[test]
    #[ignore]
    fn live_overlay_is_click_through_never_takes_focus_and_hides_under_the_mouse() {
        if let Game::Window { front: true, .. } = game_rect() {
            println!("SKIPPED: Elite Dangerous is the window in front. Run this with another window in front, so no click lands in the game.");
            return;
        }
        let ov = Overlay::start(true);
        ov.set_test(true);
        std::thread::sleep(Duration::from_millis(900));
        let i = ov.info();
        println!("overlay: shown {} alpha {} placed {} at {},{} size {}x{} | game: {}", i.shown, i.alpha, i.placed, i.x, i.y, i.w, i.h, i.game);
        assert!(i.shown && i.alpha == 255, "the test panel shows");

        // 1. the window styles are the Python ones
        let ex = unsafe { GetWindowLongW(HWND(i.hwnd as *mut _), GWL_EXSTYLE) } as u32;
        for (name, bit) in [("LAYERED", WS_EX_LAYERED.0), ("TRANSPARENT", WS_EX_TRANSPARENT.0), ("TOOLWINDOW", WS_EX_TOOLWINDOW.0), ("NOACTIVATE", WS_EX_NOACTIVATE.0), ("TOPMOST", WS_EX_TOPMOST.0)] {
            assert!(ex & bit != 0, "extended style {name} is set");
        }
        println!("styles ok: LAYERED | TRANSPARENT | TOOLWINDOW | NOACTIVATE | TOPMOST");

        // 2. a real click on the overlay goes THROUGH it to the window under it, and the focus stays where it was
        let (cx, cy) = (i.x + i.w / 2, i.y + i.h / 2);
        spawn_target(i.x, i.y, i.w, i.h);
        ov.set_test(false); // hidden and shown again: the overlay is the window on top of the target
        std::thread::sleep(Duration::from_millis(400));
        ov.set_test(true);
        std::thread::sleep(Duration::from_millis(500));
        let mut orig = POINT::default();
        unsafe {
            let _ = GetCursorPos(&mut orig);
        }
        let fg_before = unsafe { GetForegroundWindow() };
        ov.set_hover_hide(false); // (the click test needs the panel to stay while the cursor is on it)
        std::thread::sleep(Duration::from_millis(300));
        unsafe {
            let _ = SetCursorPos(cx, cy);
        }
        std::thread::sleep(Duration::from_millis(400));
        if game_front() {
            // the game came to the front meanwhile (it also takes the cursor): no click may land in it, the test is void
            STOP.store(true, Ordering::SeqCst);
            println!("INCONCLUSIVE: Elite Dangerous came to the front during the test, no click was sent.");
            return;
        }
        let still = ov.info();
        assert!(still.shown && still.alpha == 255, "with hide-on-hover off the panel stays under the mouse");
        unsafe {
            // who is really under the cursor? (the overlay answers HTTRANSPARENT, so the window under it should be found)
            let at = windows::Win32::UI::WindowsAndMessaging::WindowFromPoint(POINT { x: cx, y: cy });
            let mut buf = [0u16; 64];
            let n = windows::Win32::UI::WindowsAndMessaging::GetClassNameW(at, &mut buf);
            println!("window at the click point: class [{}], is the overlay itself: {}", String::from_utf16_lossy(&buf[..n as usize]), at.0 as isize == i.hwnd);
        }
        CLICKS.store(0, Ordering::SeqCst);
        click();
        std::thread::sleep(Duration::from_millis(300));
        let got = CLICKS.load(Ordering::SeqCst);
        let fg_after = unsafe { GetForegroundWindow() };
        println!("click through the overlay reached the window under it: {got} click(s); foreground unchanged: {}", fg_before == fg_after);
        assert_eq!(got, 1, "the click went through the overlay to the window under it");
        assert!(fg_before == fg_after, "the overlay and the click took no focus");

        // 3. hidden while the mouse is over it, back once it has left
        ov.set_hover_hide(true);
        std::thread::sleep(Duration::from_millis(500));
        let hidden = ov.info();
        let mut now = POINT::default();
        unsafe {
            let _ = GetCursorPos(&mut now);
        }
        if game_front() || (now.x, now.y) != (cx, cy) {
            STOP.store(true, Ordering::SeqCst);
            println!("INCONCLUSIVE: the cursor was moved by something else (the game in front takes it), hover-hide not judged.");
            return;
        }
        println!("mouse over it, hide-on-hover on: shown {} alpha {}", hidden.shown, hidden.alpha);
        assert!(!hidden.shown && hidden.alpha == 0, "under the mouse the overlay is gone");
        unsafe {
            let _ = SetCursorPos(i.x - 300, i.y + i.h + 300);
        }
        std::thread::sleep(Duration::from_millis(500));
        let back = ov.info();
        println!("mouse away: shown {} alpha {}", back.shown, back.alpha);
        assert!(back.shown && back.alpha == 255, "back once the mouse has left");

        // 4. off: nothing showing, and no timer running (the thread sleeps in GetMessage)
        ov.set_test(false);
        std::thread::sleep(Duration::from_millis(500));
        let off = ov.info();
        assert!(!off.shown && off.alpha == 0);
        STOP.store(true, Ordering::SeqCst);
        unsafe {
            let _ = SetCursorPos(orig.x, orig.y);
        }
        println!("ALL OVERLAY CHECKS PASSED");
    }
}
