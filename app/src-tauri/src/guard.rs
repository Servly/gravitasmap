//! A panic in one of the app's threads must never be silent or final. The panic hook writes it into gravitas.log (thread, place, message), and
//! `keep_running` starts a thread's work again after a short pause instead of letting that feature die for the rest of the session
//! (the overlay windows, the map, the update check). A loop that panics again and again is slowed down, so it can never eat the CPU.
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::time::{Duration, Instant};

/// Writes every panic of every thread into gravitas.log. Called once at start.
pub fn install_panic_log() {
    std::panic::set_hook(Box::new(|info| {
        let t = std::thread::current();
        let place = info.location().map(|l| format!("{}:{}", l.file(), l.line())).unwrap_or_default();
        let msg = info.payload().downcast_ref::<&str>().map(|s| s.to_string()).or_else(|| info.payload().downcast_ref::<String>().cloned()).unwrap_or_default();
        crate::store::log(&format!("PANIC in thread '{}' at {}: {}", t.name().unwrap_or("?"), place, msg.chars().take(300).collect::<String>()));
    }));
}

/// Runs `f` (a thread's whole work). If it panics, it is run again after a pause: 1 s the first times, up to 30 s when it keeps failing.
/// It returns when `f` returns normally.
pub fn keep_running(name: &str, f: impl Fn()) {
    let mut fails = 0u32;
    loop {
        let started = Instant::now();
        match catch_unwind(AssertUnwindSafe(&f)) {
            Ok(()) => return,
            Err(_) => {
                // (a run that lasted a minute was healthy: the next failure starts the count again)
                fails = if started.elapsed() > Duration::from_secs(60) { 1 } else { fails + 1 };
                let wait = Duration::from_secs((1u64 << (fails.min(6) - 1)).min(30));
                crate::store::log(&format!("thread '{name}' stopped by a panic: starting it again in {} s (failure {fails})", wait.as_secs()));
                std::thread::sleep(wait);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    #[test]
    fn a_thread_that_panics_is_started_again_and_a_normal_end_stops() {
        let n = AtomicU32::new(0);
        std::panic::set_hook(Box::new(|_| {})); // (quiet in the test output)
        keep_running("test", || {
            if n.fetch_add(1, Ordering::SeqCst) < 2 { panic!("boom"); }
        });
        let _ = std::panic::take_hook();
        assert_eq!(n.load(Ordering::SeqCst), 3, "two panics, then a clean run");
    }
}
