//! Developer switches read from the environment (GRAVITAS_MAP_URL, GRAVITAS_DATA_DIR, GRAVITAS_JOURNAL_DIR, GRAVITAS_GAME_TITLE, GRAVITAS_IGNORE_CURSOR,
//! GRAVITAS_MULTI, GRAVITAS_TRACE, GRAVITAS_BACKUP_DIR, GRAVITAS_MAP_DEBUG). In a Store build (cargo feature `store`) none of them exist: nothing in the
//! environment can move the app's folders, point the map window somewhere else or switch a test mode on. Without the feature this is std::env, unchanged.
use std::ffi::OsString;

#[cfg(not(feature = "store"))]
pub fn var_os(name: &str) -> Option<OsString> { std::env::var_os(name) }
#[cfg(feature = "store")]
pub fn var_os(_name: &str) -> Option<OsString> { None }

/// Like std::env::var(..).ok(): None when the variable is missing, not valid text, or in a Store build.
pub fn var(name: &str) -> Option<String> { var_os(name).and_then(|v| v.into_string().ok()) }
