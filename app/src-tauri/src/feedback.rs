//! Feedback (About page): one message from the player to the GRAVITAS developers, sent ONLY when the player presses Send.
//! It goes to the same place as the site's "Report a problem" (https://gravitasmap.com/api/report, see functions/api/report.js).
//! What is sent: the typed text, the kind, the optional name and mail, the screenshots the player attached (at most 3), the app version and
//! the Windows version, and the diagnostic report text only when the box for it is ticked. Nothing else, nothing in the background.
use serde_json::{json, Value};
use std::time::Duration;

const URL: &str = "https://gravitasmap.com/api/report";
/// the server takes at most 6 MB of image text in all and 3 pictures
const MAX_IMAGES: usize = 3;
const MAX_IMG_B64: usize = 6 * 1024 * 1024;

fn clip(s: &str, n: usize) -> String {
    s.chars().filter(|c| !c.is_control() || *c == '\n').take(n).collect()
}

/// The body for the server. `args`: {text, kind, cmdr, mail, diag: bool, images: [{name, data}]}.
pub fn body(args: &Value, version: &str, diag_text: Option<String>) -> Result<Value, String> {
    let text = clip(args.get("text").and_then(Value::as_str).unwrap_or(""), 4000);
    if text.trim().chars().count() < 3 { return Err("empty".into()); }
    let kind = match args.get("kind").and_then(Value::as_str) { Some("idea") => "Idea", Some("question") => "Question", _ => "Problem" };
    let mut images = Vec::new();
    let mut total = 0usize;
    for im in args.get("images").and_then(Value::as_array).map(|a| a.as_slice()).unwrap_or(&[]).iter().take(MAX_IMAGES) {
        let data = im.get("data").and_then(Value::as_str).unwrap_or("");
        if !data.starts_with("data:image/") { continue; }
        total += data.len();
        if total > MAX_IMG_B64 { return Err("images too large".into()); }
        images.push(json!({ "name": clip(im.get("name").and_then(Value::as_str).unwrap_or("screenshot"), 60), "data": data }));
    }
    let mut ctx = serde_json::Map::new();
    ctx.insert("system".into(), json!(format!("app {kind}")));
    ctx.insert("version".into(), json!(version));
    ctx.insert("from".into(), json!("GRAVITAS app"));
    ctx.insert("kind".into(), json!(kind));
    ctx.insert("windows".into(), json!(sysinfo::System::long_os_version().unwrap_or_default()));
    if let Some(d) = diag_text {
        // the server keeps 600 characters per field: one field per line
        for (i, l) in d.lines().filter(|l| !l.trim().is_empty()).take(60).enumerate() {
            ctx.insert(format!("diag {:02}", i + 1), json!(clip(l, 590)));
        }
    }
    Ok(json!({
        "text": text,
        "cmdr": clip(args.get("cmdr").and_then(Value::as_str).unwrap_or(""), 60),
        "mail": clip(args.get("mail").and_then(Value::as_str).unwrap_or(""), 120),
        "website": "",
        "images": images,
        "context": Value::Object(ctx),
    }))
}

/// Sends it. Returns Ok(report id) or Err(short reason the page can show).
pub fn send(body: &Value, version: &str) -> Result<String, String> {
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(60)).user_agent(&format!("GRAVITAS-app/{version}")).build();
    match agent.post(URL).set("Content-Type", "application/json").send_string(&body.to_string()) {
        Ok(r) => Ok(r.into_string().ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()).and_then(|j| j.get("id").and_then(Value::as_str).map(str::to_string)).unwrap_or_default()),
        Err(ureq::Error::Status(code, r)) => {
            let msg = r.into_string().ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()).and_then(|j| j.get("error").and_then(Value::as_str).map(str::to_string));
            Err(msg.unwrap_or_else(|| format!("The server answered {code}.")))
        }
        Err(_) => Err("offline".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_body_has_only_what_the_player_gave_and_the_versions() {
        let a = json!({ "text": "It does not open", "kind": "idea", "cmdr": "CMDR X", "mail": "", "images": [{ "name": "a.jpg", "data": "data:image/jpeg;base64,AAAA" }, { "name": "bad", "data": "javascript:1" }] });
        let b = body(&a, "0.9.32", Some("line one\n\nline two".into())).unwrap();
        assert_eq!(b["text"], "It does not open");
        assert_eq!(b["context"]["kind"], "Idea");
        assert_eq!(b["context"]["version"], "0.9.32");
        assert_eq!(b["context"]["diag 02"], "line two");
        assert_eq!(b["images"].as_array().unwrap().len(), 1);
        assert_eq!(b["website"], "");
        assert!(b["context"].get("diag 03").is_none());
    }

    #[test]
    fn an_empty_message_or_too_many_pictures_is_refused() {
        assert!(body(&json!({ "text": "  " }), "1", None).is_err());
        let big = format!("data:image/jpeg;base64,{}", "A".repeat(4 * 1024 * 1024));
        let a = json!({ "text": "hello", "images": [{ "data": big.clone() }, { "data": big }] });
        assert!(body(&a, "1", None).is_err());
    }

    #[test]
    fn the_diagnostic_is_left_out_when_not_asked_for() {
        let b = body(&json!({ "text": "hello" }), "1", None).unwrap();
        assert!(b["context"].as_object().unwrap().keys().all(|k| !k.starts_with("diag")));
    }
}
