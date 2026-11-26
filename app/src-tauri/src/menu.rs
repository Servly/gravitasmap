//! The GRAVITAS menu over the game (Ctrl+Shift+G): a small window with tabs, opened and closed without leaving the game. While it is open it takes
//! the keyboard and the mouse (Burak's choice: the game stays in view, is not sent to the background, and gets no keys meanwhile); closed, the focus
//! goes back to the game. It shows the same settings as the app's window: one settings file, one state.
use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU64, Ordering};
use std::sync::OnceLock;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use windows::core::w;
use windows::Win32::Foundation::HWND;
use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
use windows::Win32::UI::WindowsAndMessaging::{GetAncestor, GetWindow, IsWindow, ShowWindowAsync, GA_ROOTOWNER, GW_HWNDPREV, SWP_ASYNCWINDOWPOS, FindWindowW, ClipCursor, GetForegroundWindow, IsWindowVisible, GetWindowLongPtrW, SetCursorPos, GetWindowThreadProcessId, SetForegroundWindow, SetWindowLongPtrW, SetWindowPos, ShowWindow, GWL_EXSTYLE, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SW_HIDE, SW_SHOWNOACTIVATE, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW};

pub static APP: OnceLock<AppHandle> = OnceLock::new();
/// A toggle asked for from the Combat overlay's thread (the hotkey): done on the main thread.
static OPEN: AtomicBool = AtomicBool::new(false);
/// "Edit HUD" in the menu: the on-screen editor (bars on the windows) shows only while this is on and the menu is open.
static EDIT_HUD: AtomicBool = AtomicBool::new(false);
pub fn edit_hud() -> bool { EDIT_HUD.load(Ordering::SeqCst) }
pub fn store_edit_hud(on: bool) { EDIT_HUD.store(on, Ordering::SeqCst); }

/// The window handles of the menu and the editor layer, kept when they are made (on the main thread / the editor's own thread). The Combat thread
/// looks at them about every 15 ms: asking Tauri for a handle from another thread is a round trip to the main thread's event loop that WAITS for
/// the answer, so a busy main thread stopped the Combat thread (drawing, keys) with it. A raw handle needs no round trip.
static MENU_H: AtomicIsize = AtomicIsize::new(0);
static EDITOR_H: AtomicIsize = AtomicIsize::new(0);
/// The editor page's last sign of life and the time the layer was shown (milliseconds since 1970): the watchdog in guard().
static EDITOR_PING: AtomicU64 = AtomicU64::new(0);
static EDITOR_SHOWN: AtomicU64 = AtomicU64::new(0);

fn now_ms() -> u64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0) }

fn cached(h: &AtomicIsize) -> Option<HWND> {
    let v = h.load(Ordering::Relaxed);
    if v == 0 { return None; }
    let hw = HWND(v as *mut _);
    if unsafe { IsWindow(Some(hw)).as_bool() } { Some(hw) } else { None }
}

/// The editor page is alive (its poll, or its own once-a-second ping).
pub fn editor_ping() { EDITOR_PING.store(now_ms(), Ordering::Relaxed); }

const W: f64 = 860.0;
const H: f64 = 580.0;

/// Brings a window to the front even when another program is in front and nobody pressed a key to us: the thread is joined to the
/// foreground window's own for a moment (the usual way round Windows' focus rule).
pub fn force_foreground(hwnd: HWND) {
    unsafe {
        let fg = GetForegroundWindow();
        let fg_thread = GetWindowThreadProcessId(fg, None);
        let me = GetCurrentThreadId();
        let joined = !cfg!(feature = "diag-noinput") && fg_thread != 0 && fg_thread != me && AttachThreadInput(me, fg_thread, true).as_bool();
        let _ = SetForegroundWindow(hwnd);
        if joined {
            let _ = AttachThreadInput(me, fg_thread, false);
        }
    }
}

fn game_hwnd() -> Option<HWND> {
    unsafe { FindWindowW(None, &windows::core::HSTRING::from(crate::overlay::game_title())).ok().filter(|h| !h.0.is_null()) }
}

/// The app's own window back from the tray: shown, not minimised, in front (even over the game).
/// Tells the window's WebView2 that it is shown or hidden. A window hidden with hide() (the menu, the editor, the app in the tray) is otherwise still "visible" to its page,
/// which keeps running its timers and polls for nothing; once it knows it is hidden the page stops by itself (document.visibilityState becomes "hidden").
pub fn set_visible(w: &tauri::WebviewWindow, on: bool) {
    let _ = w.with_webview(move |wv| unsafe {
        let _ = wv.controller().SetIsVisible(on);
    });
}

pub fn show_main(app: &AppHandle) {
    match app.get_webview_window("main") {
        Some(w) => {
            set_visible(&w, true);
            let r = (w.show(), w.unminimize(), w.set_always_on_top(true), w.set_always_on_top(false));
            if let Ok(h) = w.hwnd() {
                force_foreground(HWND(h.0 as *mut _));
            }
            let f = w.set_focus();
            crate::store::log(&format!("show_main: show {:?} unminimize {:?} top {:?}/{:?} focus {:?} visible {:?}", r.0.is_ok(), r.1.is_ok(), r.2.is_ok(), r.3.is_ok(), f.is_ok(), w.is_visible()));
        }
        None => crate::store::log("show_main: there is no main window"),
    }
}

pub fn focus_game() {
    if let Some(g) = game_hwnd() {
        force_foreground(g);
    }
    // the keys that were pressed to open (Ctrl, Shift) or to close (Esc) the menu had their "up" go to the menu, not the game: the game could be left
    // believing Ctrl+Shift (or Esc) is still held, and Esc then does nothing. Once the game has the focus again, tell it they are up (only keys that are
    // really up now).
    std::thread::spawn(|| {
        std::thread::sleep(std::time::Duration::from_millis(150));
        release_keys();
        std::thread::sleep(std::time::Duration::from_millis(350));
        release_keys();
    });
}

/// A key-up (by scan code, as the game reads its keys) for the modifiers and Esc that are not held down.
fn release_keys() {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, MapVirtualKeyW, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, KEYEVENTF_SCANCODE, MAPVK_VK_TO_VSC};
    // Ctrl, Shift, Alt (left and right), the Windows keys, Esc
    const KEYS: [u16; 9] = [0xA2, 0xA3, 0xA0, 0xA1, 0xA4, 0xA5, 0x5B, 0x5C, 0x1B];
    if cfg!(feature = "diag-noinput") { return; } // (diagnostic build only)
    let mut sent = Vec::new();
    for vk in KEYS {
        unsafe {
            if (GetAsyncKeyState(vk as i32) as u16) & 0x8000 != 0 {
                continue; // really down: leave it
            }
            let sc = MapVirtualKeyW(vk as u32, MAPVK_VK_TO_VSC) as u16;
            if sc == 0 {
                continue;
            }
            let extended = matches!(vk, 0xA3 | 0xA5 | 0x5B | 0x5C);
            let flags = KEYEVENTF_KEYUP | KEYEVENTF_SCANCODE | if extended { windows::Win32::UI::Input::KeyboardAndMouse::KEYEVENTF_EXTENDEDKEY } else { Default::default() };
            sent.push(INPUT { r#type: INPUT_KEYBOARD, Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: Default::default(), wScan: sc, dwFlags: flags, time: 0, dwExtraInfo: 0 } } });
        }
    }
    if !sent.is_empty() {
        unsafe { SendInput(&sent, std::mem::size_of::<INPUT>() as i32); }
        crate::store::log(&format!("menu closed: {} key-up(s) sent to the game (Ctrl, Shift, Alt, Windows, Esc)", sent.len()));
    }
}

pub fn is_open() -> bool {
    OPEN.load(Ordering::SeqCst)
}

/// The menu window is really on screen (the flag alone can be stale: the tray, a minimise, a close some other way).
pub fn window_visible() -> bool {
    cached(&MENU_H).map(|h| unsafe { IsWindowVisible(h).as_bool() }).unwrap_or(false)
}

/// Opens the menu if it is closed, closes it if it is open. Called from any thread.
pub fn request_toggle() {
    if let Some(app) = APP.get() {
        let a = app.clone();
        let _ = app.run_on_main_thread(move || toggle(&a));
    }
}

/// The app's own window, from a key (also while the game is in front).
pub fn request_show_main() {
    if let Some(app) = APP.get() {
        let a = app.clone();
        let _ = app.run_on_main_thread(move || show_main(&a));
    }
}

pub fn close() { close_with(true); }

/// The menu closed because another program took the focus: the focus stays where it went (it is not pulled back to the game).
pub fn close_quiet() { close_with(false); }

fn close_with(back_to_game: bool) {
    if let Some(app) = APP.get() {
        let a = app.clone();
        let _ = app.run_on_main_thread(move || {
            if let Some(w) = a.get_webview_window("menu") {
                let _ = w.hide();
                set_visible(&w, false);
            }
            editor_hide(&a);
            OPEN.store(false, Ordering::SeqCst);
            EDIT_HUD.store(false, Ordering::SeqCst); // (the menu opens again with Edit HUD off)
            if back_to_game { focus_game(); }
        });
    }
}

/// The on-screen editor: a transparent layer over the game's window, shown while the menu is open. Windows are moved on it with the mouse.
fn editor_show(app: &AppHandle) {
    // built on a thread of its own: a window built on the main thread, from a command's call, never finishes loading (the app froze: 0.7.0-0.7.4)
    let a = app.clone();
    std::thread::spawn(move || editor_show_now(&a));
}

fn editor_show_now(app: &AppHandle) {
    let crate::overlay::Game::Window { x, y, w, h, .. } = crate::overlay::game_rect() else { return };
    let win = match app.get_webview_window("editor") {
        Some(w) => w,
        None => match WebviewWindowBuilder::new(app, "editor", WebviewUrl::App("editor.html".into()))
            .title("GRAVITAS editor")
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .visible(false)
            .transparent(true)
            .shadow(false)
            .focused(false)
            .build()
        {
            Ok(w) => w,
            Err(e) => { crate::store::log(&format!("editor window: {e}")); return; }
        },
    };
    let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
    let _ = win.set_size(tauri::PhysicalSize::new(w.max(1) as u32, h.max(1) as u32));
    if !OPEN.load(Ordering::SeqCst) || !EDIT_HUD.load(Ordering::SeqCst) { return; } // (the menu was closed, or Edit HUD turned off, while it was being built)
    // never takes the focus: a click on it must not bring it over the menu or take the keyboard from it
    if let Ok(h) = win.hwnd() {
        let hw = HWND(h.0 as *mut _);
        EDITOR_H.store(h.0 as isize, Ordering::Relaxed);
        EDITOR_SHOWN.store(now_ms(), Ordering::Relaxed); // (the watchdog waits for the page's first sign of life from now)
        unsafe {
            let ex = GetWindowLongPtrW(hw, GWL_EXSTYLE);
            SetWindowLongPtrW(hw, GWL_EXSTYLE, ex | (WS_EX_NOACTIVATE.0 | WS_EX_TOOLWINDOW.0) as isize);
            let _ = ShowWindow(hw, SW_SHOWNOACTIVATE);
            let _ = SetWindowPos(hw, Some(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE);
        }
    }
    set_visible(&win, true);
    raise_over_overlays();
}

/// Looked at about 4 times a second (from the Combat thread): the menu belongs to the game. When another program has the focus (alt-tab, a click
/// elsewhere) for more than a moment the menu closes, and the editor layer is never visible without the menu and Edit HUD.
pub fn guard() {
    use std::sync::atomic::AtomicU64;
    static LAST: AtomicU64 = AtomicU64::new(0);
    static AWAY: AtomicU64 = AtomicU64::new(0);
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
    if now.saturating_sub(LAST.load(Ordering::Relaxed)) < 250 { return; }
    LAST.store(now, Ordering::Relaxed);
    if APP.get().is_none() { return; }
    let open = OPEN.load(Ordering::SeqCst);
    let editing = EDIT_HUD.load(Ordering::SeqCst);
    // (ShowWindowAsync and the cached handles: nothing here may wait for the main thread, which is what might be stuck)
    if !open || !editing {
        if let Some(e) = cached(&EDITOR_H) {
            unsafe { if IsWindowVisible(e).as_bool() { let _ = ShowWindowAsync(e, SW_HIDE); } }
        }
    }
    if open && editing {
        if let Some(e) = cached(&EDITOR_H) {
            if unsafe { IsWindowVisible(e).as_bool() } {
                // WATCHDOG: the editor page answers at least once a second. When it stops for 6 s (the page or the main thread is stuck) Edit HUD is
                // switched off and the layer hidden, so a full-screen layer can never stay over the game and the menu
                let (p, s) = (EDITOR_PING.load(Ordering::Relaxed), EDITOR_SHOWN.load(Ordering::Relaxed));
                let (last, limit) = if p >= s { (p, 6000) } else { (s, 20000) }; // (the page's first load can be slow: 20 s before its first sign)
                if now.saturating_sub(last) > limit {
                    crate::store::log("Edit HUD closed: the editor layer stopped answering");
                    EDIT_HUD.store(false, Ordering::SeqCst);
                    unsafe { let _ = ShowWindowAsync(e, SW_HIDE); }
                    return;
                }
                // the menu must always be above the editor layer, or its buttons (Edit HUD off) cannot be reached: when the layer got above it, the menu goes back on top
                if let Some(m) = cached(&MENU_H) {
                    let mut w = m;
                    let mut above = false;
                    for _ in 0..300 {
                        match unsafe { GetWindow(w, GW_HWNDPREV) } { Ok(p) if !p.0.is_null() => { if p == e { above = true; break; } w = p; } _ => break }
                    }
                    if above {
                        crate::store::log("menu put back above the editor layer");
                        unsafe { let _ = SetWindowPos(m, Some(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS); }
                    }
                }
            }
        }
    }
    if !open { AWAY.store(0, Ordering::Relaxed); return; }
    // "open" but the menu window itself is not on screen (hidden by the tray, minimised, closed some other way): the flag must not stay
    // true, it keeps every window showing made-up Edit HUD data (found from a Windows 10 tester's report, 25 Nov)
    static GONE: AtomicU64 = AtomicU64::new(0);
    let shown = cached(&MENU_H).map(|h| unsafe { IsWindowVisible(h).as_bool() }).unwrap_or(false);
    if shown { GONE.store(0, Ordering::Relaxed); } else if GONE.fetch_add(1, Ordering::Relaxed) + 1 >= 3 {
        GONE.store(0, Ordering::Relaxed);
        crate::store::log("menu flag cleared: the menu window is not visible");
        close_quiet();
        return;
    }
    // who has the focus: this program or the game are fine
    let pid_of = |h: HWND| { let mut pid = 0u32; unsafe { GetWindowThreadProcessId(h, Some(&mut pid)); } pid };
    let fg = unsafe { GetForegroundWindow() };
    if fg.0.is_null() { return; }
    let (fp, me) = (pid_of(fg), std::process::id());
    let gp = game_hwnd().map(pid_of).unwrap_or(0);
    // (a dialog of our own page's browser process, such as the colour chooser behind a colour square, has another process id but belongs to one of our windows)
    let owner = unsafe { GetAncestor(fg, GA_ROOTOWNER) };
    let owned = !owner.0.is_null() && pid_of(owner) == me;
    if fp == me || owned || (gp != 0 && fp == gp) {
        AWAY.store(0, Ordering::Relaxed);
    } else {
        let n = AWAY.fetch_add(1, Ordering::Relaxed) + 1;
        if n >= 2 { AWAY.store(0, Ordering::Relaxed); crate::store::log("menu closed: another program has the focus"); close_quiet(); }
    }
}

/// The menu above the editor layer (both are topmost: the menu is put back on top, without taking the focus).
pub fn raise_menu(app: &AppHandle) {
    if !OPEN.load(Ordering::SeqCst) { return; }
    if let Some(m) = app.get_webview_window("menu") {
        if let Ok(h) = m.hwnd() {
            unsafe { let _ = SetWindowPos(HWND(h.0 as *mut _), Some(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE); }
        }
    }
}

/// After the overlay windows were put in a new stacking order (all topmost): the editor layer and the menu go back above them. Any thread, no focus.
pub fn raise_over_overlays() {
    if !OPEN.load(Ordering::SeqCst) { return; }
    // (asynchronous and by cached handle: a window of the main thread is moved by a message to that thread, and this thread must never wait for it)
    let up = |h: Option<HWND>| {
        if let Some(h) = h {
            unsafe { let _ = SetWindowPos(h, Some(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS); }
        }
    };
    if EDIT_HUD.load(Ordering::SeqCst) { up(cached(&EDITOR_H)); }
    up(cached(&MENU_H));
}

/// The menu folded to its title bar (or open again): the game shows through.
pub fn collapse(app: &AppHandle, on: bool) {
    if let Some(w) = app.get_webview_window("menu") {
        let _ = w.set_size(tauri::LogicalSize::new(W, if on { 46.0 } else { H }));
    }
}

/// Edit HUD on or off (the menu's button).
pub fn set_edit_hud(app: &AppHandle, on: bool) {
    EDIT_HUD.store(on, Ordering::SeqCst);
    if OPEN.load(Ordering::SeqCst) {
        if on { editor_show(app); } else { editor_hide(app); }
    }
}

fn editor_hide(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("editor") {
        // the layer is shown with a raw ShowWindow (no activation), so the window library does not know it is visible and its own hide() does nothing:
        // hidden the same raw way (this was why the guide lines stayed on the screen in 0.7.0 to 0.7.5)
        if let Ok(h) = w.hwnd() {
            unsafe { let _ = ShowWindow(HWND(h.0 as *mut _), SW_HIDE); }
        }
        let _ = w.hide();
        set_visible(&w, false);
    }
}

fn toggle(app: &AppHandle) {
    let win = match app.get_webview_window("menu") {
        Some(w) => w,
        None => match WebviewWindowBuilder::new(app, "menu", WebviewUrl::App("menu.html".into()))
            .title("GRAVITAS menu")
            .inner_size(W, H)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .visible(false)
            .transparent(true) // (its see-through slider shows the game behind it)
            .shadow(false)
            .build()
        {
            Ok(w) => w,
            Err(_) => return,
        },
    };
    if let Ok(h) = win.hwnd() { MENU_H.store(h.0 as isize, Ordering::Relaxed); }
    // the page's own browser keys off (Ctrl+G and Ctrl+F opened WebView2's find bar over the menu, F5 reloads, Ctrl+P prints)
    let _ = win.with_webview(|wv| unsafe {
        use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
        use windows::core::Interface;
        if let Ok(core) = wv.controller().CoreWebView2() {
            if let Ok(settings) = core.Settings() {
                if let Ok(s3) = settings.cast::<ICoreWebView2Settings3>() {
                    let _ = s3.SetAreBrowserAcceleratorKeysEnabled(false);
                }
            }
        }
    });
    if OPEN.load(Ordering::SeqCst) && win.is_visible().unwrap_or(false) {
        let _ = win.hide();
        set_visible(&win, false);
        editor_hide(app);
        OPEN.store(false, Ordering::SeqCst);
        EDIT_HUD.store(false, Ordering::SeqCst);
        focus_game();
        return;
    }
    // over the middle of the game's window (or the screen), whole
    if let crate::overlay::Game::Window { x, y, w, h, .. } = crate::overlay::game_rect() {
        let scale = win.scale_factor().unwrap_or(1.0);
        let (mw, mh) = (W * scale, H * scale);
        let px = x as f64 + (w as f64 - mw) / 2.0;
        let py = y as f64 + (h as f64 - mh) / 2.0;
        let _ = win.set_position(tauri::PhysicalPosition::new(px.max(0.0) as i32, py.max(0.0) as i32));
    } else {
        let _ = win.center();
    }
    set_visible(&win, true);
    let _ = win.show();
    let _ = win.set_always_on_top(true);
    if let Ok(h) = win.hwnd() {
        force_foreground(HWND(h.0 as *mut _));
    }
    let _ = win.set_focus();
    OPEN.store(true, Ordering::SeqCst);
    if EDIT_HUD.load(Ordering::SeqCst) { editor_show(app); }
    // the game hides (and holds) the mouse cursor: it is brought to the middle of the menu, free, so it is never lost
    if let (Ok(p), Ok(sz)) = (win.outer_position(), win.outer_size()) {
        unsafe {
            let _ = ClipCursor(None);
            let _ = SetCursorPos(p.x + sz.width as i32 / 2, p.y + sz.height as i32 / 2);
        }
    }
}
