//! The first thing main() does: is the Microsoft WebView2 Runtime there and usable? The installer brings it (its small bootstrapper is inside our installer),
//! but a PC where that failed, or where the runtime was removed later, must not see a window that never opens. One API call when it is present (WebView2's own
//! GetAvailableCoreWebView2BrowserVersionString), no thread. When it is missing: one message box in the Windows language, Yes opens Microsoft's free download
//! (only after the user clicks Yes), then the app leaves with exit code 1. GRAVITAS_FAKE_NO_WEBVIEW2=1 forces the missing path (not in a Store build).

pub const DOWNLOAD_URL: &str = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";

/// (language code, text) for the six languages of the app. Order: en, de, es, fr, pt-br, ru.
pub const TEXTS: [(&str, &str); 6] = [
    ("en", "GRAVITAS needs the Microsoft WebView2 Runtime, which this PC does not have (or it cannot be used).\n\nChoose Yes to open the download page (free, from Microsoft), install it, then start GRAVITAS again."),
    ("de", "GRAVITAS benötigt die Microsoft WebView2 Runtime, die auf diesem PC fehlt (oder nicht verwendet werden kann).\n\nWähle Ja, um die Download-Seite zu öffnen (kostenlos, von Microsoft), installiere sie und starte GRAVITAS danach erneut."),
    ("es", "GRAVITAS necesita el Microsoft WebView2 Runtime, que este PC no tiene (o no se puede usar).\n\nElige Sí para abrir la página de descarga (gratis, de Microsoft), instálalo y vuelve a iniciar GRAVITAS."),
    ("fr", "GRAVITAS a besoin du Microsoft WebView2 Runtime, que ce PC n'a pas (ou qui ne peut pas être utilisé).\n\nChoisissez Oui pour ouvrir la page de téléchargement (gratuit, chez Microsoft), installez-le, puis relancez GRAVITAS."),
    ("pt-br", "O GRAVITAS precisa do Microsoft WebView2 Runtime, que este PC não tem (ou não pode ser usado).\n\nEscolha Sim para abrir a página de download (grátis, da Microsoft), instale-o e inicie o GRAVITAS novamente."),
    ("ru", "Для GRAVITAS нужен Microsoft WebView2 Runtime, которого нет на этом ПК (или его нельзя использовать).\n\nНажмите «Да», чтобы открыть страницу загрузки (бесплатно, от Microsoft), установите его и снова запустите GRAVITAS."),
];

/// The app language for a Windows UI language id (only the primary language id, the low 10 bits, counts). Anything else is English.
pub fn choose_lang(lang_id: u16) -> &'static str {
    match lang_id & 0x3ff {
        0x07 => "de",
        0x0a => "es",
        0x0c => "fr",
        0x16 => "pt-br",
        0x19 => "ru",
        _ => "en",
    }
}

pub fn text_for(code: &str) -> &'static str {
    TEXTS.iter().find(|(c, _)| *c == code).map(|(_, t)| *t).unwrap_or(TEXTS[0].1)
}

/// True when the runtime answers with a version. Costs one call.
#[cfg(windows)]
fn runtime_ok() -> bool {
    if crate::devenv::var("GRAVITAS_FAKE_NO_WEBVIEW2").is_some() { return false; }
    use windows::core::{PCWSTR, PWSTR};
    let mut v = PWSTR::null();
    let r = unsafe { webview2_com::Microsoft::Web::WebView2::Win32::GetAvailableCoreWebView2BrowserVersionString(PCWSTR::null(), &mut v) };
    if v.is_null() { return false; }
    let s = webview2_com::take_pwstr(v); // (frees the answer)
    r.is_ok() && !s.trim().is_empty()
}

/// Call first thing in main(). Returns normally when WebView2 is usable, otherwise shows the box and ends the process (exit code 1).
#[cfg(windows)]
pub fn require() {
    if runtime_ok() { return; }
    use windows::core::{w, HSTRING};
    use windows::Win32::Globalization::GetUserDefaultUILanguage;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, IDYES, MB_ICONINFORMATION, MB_YESNO, SW_SHOWNORMAL};
    let code = choose_lang(unsafe { GetUserDefaultUILanguage() });
    let text = HSTRING::from(text_for(code));
    // (the data folder is not known this early: no gravitas.log line, on purpose)
    let answer = unsafe { MessageBoxW(None, &text, w!("GRAVITAS"), MB_YESNO | MB_ICONINFORMATION) };
    if answer == IDYES {
        unsafe { ShellExecuteW(None, w!("open"), &HSTRING::from(DOWNLOAD_URL), None, None, SW_SHOWNORMAL); }
    }
    std::process::exit(1);
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn six_languages_and_fallback() {
        assert_eq!(choose_lang(0x0409), "en");
        assert_eq!(choose_lang(0x0407), "de");
        assert_eq!(choose_lang(0x0c0a), "es");
        assert_eq!(choose_lang(0x040c), "fr");
        assert_eq!(choose_lang(0x0416), "pt-br");
        assert_eq!(choose_lang(0x0816), "pt-br");
        assert_eq!(choose_lang(0x0419), "ru");
        assert_eq!(choose_lang(0x0411), "en");
        assert_eq!(choose_lang(0), "en");
        assert_eq!(choose_lang(0x1f), "en"); // Turkish primary id: never Turkish, English
        assert_eq!(choose_lang(0x041f), "en");
    }
    #[test]
    fn every_other_language_gets_english() {
        for id in [0x1fu16, 0x041f, 0x10, 0x11, 0x15, 0x04, 0x01, 0xffff, 0x0c04, 0x0804, 0x0401] {
            assert_eq!(choose_lang(id), "en", "{id:#x}");
        }
        assert_eq!(choose_lang(0x0407), "de");
        assert_eq!(choose_lang(0x0c0a), "es");
        assert_eq!(choose_lang(0x040c), "fr");
        assert_eq!(choose_lang(0x0416), "pt-br");
        assert_eq!(choose_lang(0x0419), "ru");
    }
    #[test]
    fn texts_name_the_app_and_the_runtime() {
        assert_eq!(TEXTS.len(), 6);
        for (c, t) in TEXTS.iter() {
            assert!(t.contains("GRAVITAS"), "{c}");
            assert!(t.contains("WebView2"), "{c}");
            assert_eq!(text_for(c), *t);
        }
        assert_eq!(text_for("xx"), TEXTS[0].1);
    }
    #[test]
    fn the_link_is_https_microsoft() {
        assert!(DOWNLOAD_URL.starts_with("https://go.microsoft.com/"));
    }
}
