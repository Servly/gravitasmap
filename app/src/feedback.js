/* Feedback window (About > Send feedback). Nothing leaves the PC until Send is pressed: the text, the kind, the optional name and mail,
   the screenshots (made smaller here, at most 3) and, only when ticked, the diagnostic report. The Rust side (feedback.rs) adds the app and Windows versions. */
(function () {
  "use strict";
  var H = function () { return GVC.h; }, tr = function (k, v) { return H().tr(k, v); };
  var MAX_SHOTS = 3, box = null, shots = [], kind = "problem", busy = false;

  function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function tipped(el, key) { el.title = tr(key); return el; }

  /* a picture file or blob -> a JPEG data URL at most 1600 px wide (a data: URL, so the page's own security rules stay as they are) */
  function shrink(file) {
    return new Promise(function (ok, no) {
      var fr = new FileReader();
      fr.onerror = no;
      fr.onload = function () {
        var img = new Image();
        img.onerror = no;
        img.onload = function () {
          var k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          ok({ name: (file.name || "screenshot").slice(0, 60), data: c.toDataURL("image/jpeg", 0.82) });
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  function say(msg, cls) { var s = box.querySelector(".fb-msg"); s.textContent = msg || ""; s.className = "fb-msg" + (cls ? " " + cls : ""); }

  function drawShots() {
    var w = box.querySelector(".fb-thumbs"); w.innerHTML = "";
    shots.forEach(function (s, i) {
      var t = mk("div", "fb-th"), im = mk("img"); im.src = s.data; im.alt = "";
      var x = tipped(mk("button", "fb-x", "×"), "tip.fb.remove"); x.type = "button"; x.setAttribute("aria-label", tr("fb.shot.remove"));
      x.onclick = function () { shots.splice(i, 1); drawShots(); };
      t.appendChild(im); t.appendChild(x); w.appendChild(t);
    });
    box.querySelector(".fb-add").disabled = shots.length >= MAX_SHOTS;
  }
  function addFiles(list) {
    var arr = Array.prototype.slice.call(list || []).filter(function (f) { return /^image\//.test(f.type); });
    var room = MAX_SHOTS - shots.length;
    arr.slice(0, room).reduce(function (p, f) { return p.then(function () { return shrink(f).then(function (s) { shots.push(s); drawShots(); }); }).catch(function () {}); }, Promise.resolve());
  }

  function close() {
    if (!box) return;
    document.removeEventListener("keydown", onKey, true); document.removeEventListener("paste", onPaste, true);
    box.remove(); box = null; shots = []; busy = false;
  }
  function onKey(e) { if (e.key === "Escape" && !busy) { e.stopPropagation(); close(); } }
  function onPaste(e) {
    var items = (e.clipboardData && e.clipboardData.items) || [], files = [];
    for (var i = 0; i < items.length; i++) if (items[i].kind === "file" && /^image\//.test(items[i].type)) files.push(items[i].getAsFile());
    if (files.length) { e.preventDefault(); addFiles(files); }
  }

  function send() {
    if (busy) return;
    var text = box.querySelector(".fb-text").value.trim();
    if (text.length < 3) { say(tr("fb.fail.empty"), "err"); return; }
    busy = true; box.querySelector(".fb-send").disabled = true; say(tr("fb.sending"));
    H().invoke("send_feedback", { args: {
      text: text, kind: kind, cmdr: box.querySelector(".fb-cmdr").value.trim(), mail: box.querySelector(".fb-mail").value.trim(),
      diag: box.querySelector(".fb-diag").checked, images: shots
    } }).then(function () {
      say(tr("fb.sent"), "ok"); box.querySelector(".fb-send").hidden = true;
      var c = box.querySelector(".fb-cancel"); c.textContent = "OK"; c.title = "";
      busy = false;
    }).catch(function (err) {
      busy = false; box.querySelector(".fb-send").disabled = false;
      var m = String(err || "");
      say(m === "offline" ? tr("fb.fail.offline") : m === "empty" ? tr("fb.fail.empty") : m === "images too large" ? tr("fb.fail.big") : tr("fb.fail.other", { err: m }), "err");
    });
  }

  function open() {
    if (box) return;
    shots = []; kind = "problem"; busy = false;
    box = mk("div", "fb-back"); box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", tr("fb.title"));
    var card = mk("div", "fb-card"); box.appendChild(card);
    var hd = mk("div", "fb-hd"); hd.appendChild(mk("h2", null, tr("fb.title")));
    var xx = tipped(mk("button", "fb-close", "✕"), "tip.fb.cancel"); xx.type = "button"; xx.onclick = function () { if (!busy) close(); }; hd.appendChild(xx); card.appendChild(hd);
    card.appendChild(mk("p", "fb-sub", tr("fb.sub")));

    var kinds = mk("div", "fb-kinds"); kinds.setAttribute("role", "radiogroup");
    ["problem", "idea", "question"].forEach(function (k) {
      var b = tipped(mk("button", "fb-kind" + (k === kind ? " on" : ""), tr("fb.kind." + k)), "tip.fb.kind"); b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", k === kind ? "true" : "false");
      b.onclick = function () { kind = k; Array.prototype.forEach.call(kinds.children, function (o, i) { var on = ["problem", "idea", "question"][i] === k; o.classList.toggle("on", on); o.setAttribute("aria-checked", on ? "true" : "false"); }); };
      kinds.appendChild(b);
    });
    card.appendChild(kinds);

    var l1 = mk("label", "fb-l", tr("fb.text")); var ta = tipped(mk("textarea", "fb-text"), "tip.fb.text"); ta.maxLength = 4000; ta.rows = 6; ta.placeholder = tr("fb.text.ph"); l1.appendChild(ta); card.appendChild(l1);

    var sh = mk("div", "fb-shots"); sh.appendChild(mk("div", "fb-l", tr("fb.shots")));
    var row = mk("div", "fb-shrow");
    var add = tipped(mk("button", "btn fb-add", tr("fb.shots.add")), "tip.fb.add"); add.type = "button";
    var file = mk("input"); file.type = "file"; file.accept = "image/*"; file.multiple = true; file.hidden = true;
    add.onclick = function () { file.click(); }; file.onchange = function () { addFiles(file.files); file.value = ""; };
    row.appendChild(add); row.appendChild(mk("span", "fb-hint", tr("fb.shots.hint"))); row.appendChild(file); sh.appendChild(row);
    sh.appendChild(mk("div", "fb-thumbs")); card.appendChild(sh);

    var two = mk("div", "fb-two");
    var l2 = mk("label", "fb-l", tr("fb.cmdr")); var i2 = tipped(mk("input", "txt fb-cmdr"), "tip.fb.cmdr"); i2.maxLength = 60; l2.appendChild(i2);
    var l3 = mk("label", "fb-l", tr("fb.mail")); var i3 = tipped(mk("input", "txt fb-mail"), "tip.fb.mail"); i3.type = "email"; i3.maxLength = 120; l3.appendChild(i3);
    two.appendChild(l2); two.appendChild(l3); card.appendChild(two);

    var dl = mk("label", "fb-chk"); var ck = tipped(mk("input", "fb-diag"), "tip.fb.diag"); ck.type = "checkbox"; ck.checked = true; dl.appendChild(ck); dl.appendChild(mk("span", null, tr("fb.diag"))); card.appendChild(dl);
    var det = mk("details", "fb-det"); det.appendChild(mk("summary", null, tr("fb.diag.show"))); var pre = mk("pre", "fb-pre", "..."); det.appendChild(pre);
    det.addEventListener("toggle", function () { if (det.open && pre.dataset.done !== "1") H().invoke("diagnostic_report").then(function (t) { pre.textContent = t || "-"; pre.dataset.done = "1"; }).catch(function () { pre.textContent = "-"; }); });
    card.appendChild(det);
    card.appendChild(mk("p", "fb-also", tr("fb.also")));

    var bar = mk("div", "fb-bar"); bar.appendChild(mk("span", "fb-msg"));
    var cancel = tipped(mk("button", "btn fb-cancel", tr("fb.cancel")), "tip.fb.cancel"); cancel.type = "button"; cancel.onclick = function () { if (!busy) close(); };
    var go = tipped(mk("button", "btn go fb-send", tr("fb.send")), "tip.fb.send"); go.type = "button"; go.onclick = send;
    bar.appendChild(cancel); bar.appendChild(go); card.appendChild(bar);

    box.addEventListener("mousedown", function (e) { if (e.target === box && !busy) close(); });
    document.addEventListener("keydown", onKey, true); document.addEventListener("paste", onPaste, true);
    document.body.appendChild(box); ta.focus();
  }
  window.GVFeedback = { open: open };
})();
