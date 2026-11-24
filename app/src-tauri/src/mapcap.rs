//! The System map as a picture: the site draws it in a window nobody sees, WebView2 hands back what that window shows (CapturePreview, PNG),
//! and the picture goes to the HUD like any other window's drawing. The page gets no power over the app: only the app asks (eval, capture).
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::WebviewWindow;

/// One captured picture: premultiplied RGBA, width, height, and when it arrived.
#[derive(Clone)]
pub struct Shot {
    /// 0 until it is published (see `publish`)
    pub id: u64,
    pub system: String,
    pub w: u32,
    pub h: u32,
    pub rgba: Vec<u8>,
    pub at: std::time::Instant,
    pub ms: u128,
}

pub type Sink = Arc<Mutex<Option<Shot>>>;

static CURRENT: Mutex<Option<Arc<Shot>>> = Mutex::new(None);
static NEXT: AtomicU64 = AtomicU64::new(1);

/// Makes this the picture the HUD draws (the System map window): a new id tells the painter it changed.
pub fn publish(mut s: Shot, system: &str) {
    s.id = NEXT.fetch_add(1, Ordering::Relaxed);
    s.system = system.to_string();
    if let Ok(mut c) = CURRENT.lock() { *c = Some(Arc::new(s)); }
}

pub fn current() -> Option<Arc<Shot>> {
    CURRENT.lock().ok().and_then(|c| c.clone())
}

/// Asks the window's page for a picture of itself; the answer arrives later in `sink` (decoded). Must be called from any thread: the work is moved
/// to the window's own thread by with_webview, and nothing here waits for it.
pub fn capture(win: &WebviewWindow, sink: Sink) {
    let t0 = std::time::Instant::now();
    let _ = win.with_webview(move |wv| unsafe {
        use webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG;
        use webview2_com::CapturePreviewCompletedHandler;
        use windows::Win32::System::Com::{IStream, STREAM_SEEK_SET};
        use windows::Win32::UI::Shell::SHCreateMemStream;
        let Ok(core) = wv.controller().CoreWebView2() else { return };
        let Some(stream) = SHCreateMemStream(None) else { return };
        let s2: IStream = stream.clone();
        let handler = CapturePreviewCompletedHandler::create(Box::new(move |res| {
            if res.is_ok() {
                let _ = s2.Seek(0, STREAM_SEEK_SET, None);
                let mut bytes: Vec<u8> = Vec::new();
                let mut buf = vec![0u8; 65536];
                loop {
                    let mut got = 0u32;
                    let hr = s2.Read(buf.as_mut_ptr() as *mut _, buf.len() as u32, Some(&mut got));
                    if hr.is_err() || got == 0 { break; }
                    bytes.extend_from_slice(&buf[..got as usize]);
                }
                if let Ok(pm) = tiny_skia::Pixmap::decode_png(&bytes) {
                    if let Ok(mut g) = sink.lock() {
                        *g = Some(Shot { id: 0, system: String::new(), w: pm.width(), h: pm.height(), rgba: pm.data().to_vec(), at: std::time::Instant::now(), ms: t0.elapsed().as_millis() });
                    }
                }
            }
            Ok(())
        }));
        let _ = core.CapturePreview(COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG, &stream, &handler);
    });
}
