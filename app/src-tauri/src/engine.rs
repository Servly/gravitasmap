//! The GRAVITAS combat engine, run inside the app: the Rust side of the plugin's engine.py.
//!
//! The engine is the site's own Combat Mode code (engine/combat-engine.js, byte for byte the site's 42-combat-engine.js) plus the
//! plugin's own glue (engine/api.js, taken verbatim from engine.py), run in QuickJS (rquickjs bundles quickjs-ng, the same family the
//! plugin's Python module used). QuickJS must always be called from the one thread that made it: make an Engine on the thread that
//! uses it. Nothing here touches the network.
use rquickjs::{CatchResultExt, Context, Function, Runtime};

const ENGINE_JS: &str = include_str!("../engine/combat-engine.js");
const API_JS: &str = include_str!("../engine/api.js");
/// Tests only: the JavaScript clock is the one the test sets (Date.now()), so a run can be replayed to the millisecond.
const CLOCK_SHIM: &str = "\nvar __NOW=0;Date.now=function(){return __NOW};function __setnow(n){__NOW=n;return 1}\n";

pub struct Engine {
    ctx: Context,
    _rt: Runtime,
    pub version: String,
    pub error: String,
}

impl Engine {
    pub fn new(fake_clock: bool) -> Result<Engine, String> {
        let rt = Runtime::new().map_err(|e| e.to_string())?;
        rt.set_memory_limit(64 * 1024 * 1024);
        rt.set_max_stack_size(1024 * 1024);
        let ctx = Context::full(&rt).map_err(|e| e.to_string())?;
        let mut src = String::with_capacity(ENGINE_JS.len() + API_JS.len() + 200);
        src.push_str(ENGINE_JS);
        src.push('\n');
        src.push_str(API_JS);
        if fake_clock {
            src.push_str(CLOCK_SHIM);
        }
        ctx.with(|c| c.eval::<(), _>(src.as_str()).catch(&c).map_err(|e| e.to_string()))?;
        let version = include_str!("../engine/VERSION").trim().to_string();
        Ok(Engine { ctx, _rt: rt, version, error: String::new() })
    }

    /// Calls a function of the engine; whatever it answers as text ("" for nothing), None if the call threw.
    fn call_text(&self, name: &str, run: impl for<'js> FnOnce(&Function<'js>) -> rquickjs::Result<rquickjs::Value<'js>>) -> Option<String> {
        self.ctx
            .with(|c| {
                let f: Function = c.globals().get(name).ok()?;
                match run(&f).catch(&c) {
                    Ok(v) => Some(if let Some(s) = v.as_string() { s.to_string().unwrap_or_default() } else { String::new() }),
                    Err(e) => {
                        // (the error is still ignored: it is only counted, with its first line, for the diagnostic report)
                        crate::drift::engine_error(&e.to_string());
                        None
                    }
                }
            })
    }

    /// Tests: any JavaScript, its result as text.
    #[cfg(test)]
    pub fn eval_text(&self, js: &str) -> String {
        self.ctx.with(|c| match c.eval::<rquickjs::Value, _>(js).catch(&c) {
            Ok(v) => v.as_string().and_then(|s| s.to_string().ok()).unwrap_or_else(|| "<not a string>".into()),
            Err(e) => format!("<error {e}>"),
        })
    }

    pub fn set_now(&self, ms: i64) {
        let _ = self.call_text("__setnow", |f| f.call((ms as f64,)));
    }
    pub fn feed(&self, entry_json: &str, replay: bool) {
        let _ = self.call_text("__feed", |f| f.call((entry_json, replay)));
    }
    pub fn status(&self, entry_json: &str) {
        let _ = self.call_text("__status", |f| f.call((entry_json,)));
    }
    pub fn tick(&self) {
        let _ = self.call_text("__tick", |f| f.call(()));
    }
    pub fn end(&self) {
        let _ = self.call_text("__end", |f| f.call(()));
    }
    pub fn calm(&self, ms: i64) {
        let _ = self.call_text("__calm", |f| f.call((ms as f64,)));
    }
    pub fn here(&self, system: &str) {
        let _ = self.call_text("__here", |f| f.call((system,)));
    }
    pub fn clear(&self) {
        let _ = self.call_text("__clear", |f| f.call(()));
    }
    /// The fight as it is now (JSON), or None out of a fight with no report.
    pub fn view(&self) -> Option<serde_json::Value> {
        self.json("__view")
    }
    /// Out of a fight too: {"pri": [the ships scanned], "tg": the locked target or null} ({} when the engine says nothing, as engine.py).
    pub fn scan(&self) -> serde_json::Value {
        self.json("__scan").unwrap_or_else(|| serde_json::json!({}))
    }
    /// The ships whose lock was lost ({"pilot|ship": when, ms}) and when the list was last cleared (ms) ({} when nothing, as engine.py).
    pub fn gone(&self) -> serde_json::Value {
        self.json("__gone").unwrap_or_else(|| serde_json::json!({}))
    }
    fn json(&self, name: &str) -> Option<serde_json::Value> {
        let s = self.call_text(name, |f| f.call(()))?;
        if s.is_empty() {
            return None;
        }
        serde_json::from_str(&s).ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The JavaScript the engine leans on, answered by this QuickJS: the same list is put to the plugin's QuickJS (Python) by
    /// research/app-golden/js_runtime_check.py and the two answers must be equal.
    pub const PROBES: &[&str] = &[
        "(1234567.4).toLocaleString('en-US')",
        "(1234567).toLocaleString()",
        "String(Math.round(-2.5)) + ',' + Math.round(2.5) + ',' + Math.round(-0.5) + ',' + Math.round(0.49999999999999994)",
        "String(Date.parse('2026-11-06T19:23:19Z')) + ',' + new Date('2026-11-06T19:23:19Z').getTime() + ',' + Date.parse('2026-11-06T19:23:19.500Z')",
        "[{k:1,i:0},{k:1,i:1},{k:0,i:2},{k:1,i:3},{k:0,i:4},{k:2,i:5},{k:1,i:6}].sort(function(a,b){return a.k-b.k}).map(function(x){return x.i}).join()",
        "(0.5).toFixed(0) + ',' + (1.5).toFixed(0) + ',' + (2.5).toFixed(0) + ',' + (1.005).toFixed(2) + ',' + (0.1+0.2).toFixed(1)",
        "JSON.stringify({a:1.0,b:1e21,c:0.1+0.2,d:-0,e:123456789012345680000,f:1.5e-7})",
        "String(1e21) + ',' + String(123456789.123456789) + ',' + (25).toString(16) + ',' + parseInt('0x1f') + ',' + Number('1e3')",
        "'Ünïcödé Ship'.toUpperCase() + ',' + 'abc'.localeCompare('abd') + ',' + ['b','a','C','ä'].sort().join('')",
        "new Date(0).toISOString() + ',' + new Date(1794819131000).toISOString()",
        "typeof Intl + ',' + typeof Symbol + ',' + typeof structuredClone + ',' + typeof globalThis",
        "[3,1,2].sort().join() + ',' + [10,9,1].sort().join() + ',' + [-1,-2,0].sort().join()",
        "String(Math.max.apply(null,[1,5,3])) + ',' + Math.min() + ',' + (5/0) + ',' + (0/0)",
    ];

    #[test]
    fn probes_for_the_runtime_comparison() {
        let e = Engine::new(true).expect("the engine starts");
        let mut out = String::new();
        for (i, p) in PROBES.iter().enumerate() {
            out.push_str(&format!("{i}	{}
", e.eval_text(p)));
        }
        std::fs::write(std::env::temp_dir().join("gravitas_rust_probes.txt"), &out).unwrap();
        println!("{out}");
    }

    #[test]
    fn the_engine_starts_and_answers() {
        let e = Engine::new(true).expect("the engine starts");
        assert_eq!(e.version, "v0.93.1 a5daee0bc7");
        e.set_now(1_800_000_000_000);
        e.tick();
        assert!(e.view().is_none(), "no fight yet: no view");
        let scan = e.scan();
        assert!(scan.get("pri").is_some());
    }
}
