//! Every sentence the HUD shows lives in lang_hud/<code>.json (the plugin's own files, byte for byte): i18n.py in Rust.
//! t() reads the active language and falls back to English, so a missing translation shows English, not a key.
use crate::pyval::py_str;
use serde_json::Value;
use std::collections::HashMap;

const FILES: [(&str, &str); 6] = [
    ("en", include_str!("../lang_hud/en.json")),
    ("de", include_str!("../lang_hud/de.json")),
    ("es", include_str!("../lang_hud/es.json")),
    ("fr", include_str!("../lang_hud/fr.json")),
    ("pt-br", include_str!("../lang_hud/pt-br.json")),
    ("ru", include_str!("../lang_hud/ru.json")),
];
pub const DEFAULT: &str = "en";

pub struct I18n {
    langs: HashMap<&'static str, Value>,
    active: String,
}

impl I18n {
    pub fn new(code: &str) -> I18n {
        let langs = FILES.iter().map(|(c, t)| (*c, serde_json::from_str(t).unwrap_or(Value::Null))).collect();
        let mut i = I18n { langs, active: DEFAULT.into() };
        i.set_language(code);
        i
    }

    pub fn set_language(&mut self, code: &str) {
        self.active = if self.langs.get(code).map(|v| v.is_object()).unwrap_or(false) { code.to_string() } else { DEFAULT.to_string() };
    }

    pub fn language(&self) -> &str {
        &self.active
    }

    /// True for a language that needs letters the game-style HUD font does not have.
    pub fn font_fallback(&self) -> bool {
        self.langs.get(self.active.as_str()).and_then(|v| v.get("_font")).and_then(Value::as_str) == Some("system")
    }

    fn raw(&self, code: &str, key: &str) -> Option<&str> {
        self.langs.get(code)?.get(key)?.as_str()
    }

    /// `t(key, **values)`; with no values the text is given as it stands (as Python does).
    pub fn t(&self, key: &str, vars: &[(&str, Value)]) -> String {
        let s = self.raw(&self.active, key).or_else(|| self.raw(DEFAULT, key)).unwrap_or(key);
        if vars.is_empty() {
            return s.to_string();
        }
        match format(s, vars) {
            Some(r) => r,
            None => format(self.raw(DEFAULT, key).unwrap_or(key), vars).unwrap_or_else(|| s.to_string()), // (a broken translation never breaks the HUD)
        }
    }

    pub fn t0(&self, key: &str) -> String {
        self.t(key, &[])
    }

    /// `t_n`: the .one form for a count of 1, else .other.
    pub fn t_n(&self, key: &str, n: i64) -> String {
        let k = format!("{key}.{}", if n == 1 { "one" } else { "other" });
        self.t(&k, &[("n", Value::from(n))])
    }
}

/// Python's str.format for `{name}` fields ({{ and }} are the braces themselves); None where Python would raise.
fn format(s: &str, vars: &[(&str, Value)]) -> Option<String> {
    let mut out = String::with_capacity(s.len() + 16);
    let mut it = s.chars().peekable();
    while let Some(c) = it.next() {
        match c {
            '{' => {
                if it.peek() == Some(&'{') {
                    it.next();
                    out.push('{');
                    continue;
                }
                let mut name = String::new();
                loop {
                    match it.next() {
                        Some('}') => break,
                        Some(ch) if ch.is_alphanumeric() || ch == '_' => name.push(ch),
                        _ => return None, // (a format spec or an unclosed field: not used by the language files)
                    }
                }
                let v = vars.iter().find(|(k, _)| *k == name)?;
                out.push_str(&py_str(&v.1));
            }
            '}' => {
                if it.peek() == Some(&'}') {
                    it.next();
                    out.push('}');
                } else {
                    return None;
                }
            }
            _ => out.push(c),
        }
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn plain_and_formatted() {
        let t = I18n::new("en");
        assert_eq!(t.t0("bounty.kills"), "KILLS");
        assert_eq!(t.t("bounty.more", &[("n", json!(3))]), "+3 more");
        assert_eq!(t.t_n("report.bond", 1), "1 bond");
        assert_eq!(t.t_n("report.bond", 2), "2 bonds");
        assert_eq!(t.t0("no.such.key"), "no.such.key");
        let de = I18n::new("de");
        assert_eq!(de.t0("bounty.kills"), "ABSCHÜSSE");
        assert!(I18n::new("ru").font_fallback() && !I18n::new("en").font_fallback());
        assert_eq!(I18n::new("xx").language(), "en");
    }
}
