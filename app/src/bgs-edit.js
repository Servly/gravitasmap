"use strict";
/* BGS Watch, part 10: the Edit table. A spreadsheet of every saved snapshot: columns A, B, C ... are snapshots (the time is written under the letter),
   rows 0, 1, 2 ... are systems. Click a cell and type to correct a value, Enter goes down, Tab goes right, Esc cancels, Delete clears, a block copied from
   Excel can be pasted. The time under a letter can be corrected too, and a snapshot can be deleted. Nothing is saved until Save (bgs_edit), then every chart updates.
   Names and values are shown as text, never as HTML. */
(function () {
  var T = window.__TAURI__ || {}, invoke = T.core && T.core.invoke, BG = window.BG = window.BG || {};
  var t = function (k, v) { return BG.tr(k, v); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function colName(i) { var s = ""; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  // times are shown and typed in THIS PC's time (0.9.51); stored as UTC
  function fmtT(iso) { var d = new Date(iso); return isNaN(d) ? iso : d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function parseT(s) { var m = /^\s*(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/.exec(s); if (!m) return null; var d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)); return isNaN(d) ? null : d.toISOString().replace(/\.\d+Z$/, "Z"); }
  function tmx(iso) { var ms = new Date(iso).getTime(); return BG.calc && !isNaN(ms) ? BG.calc.tm(ms) : fmtT(iso); }
  function parseV(s) { s = String(s).trim().replace(",", "."); if (!s) return null; var m = /^(\d{1,3})(?:\.(\d))?$/.exec(s.replace("%", "")); if (!m) return undefined; var v = +m[1] * 10 + (m[2] ? +m[2] : 0); return v >= 0 && v <= 1000 ? v : undefined; }
  var fv = function (x) { return x == null ? "" : (x / 10).toFixed(1); };

  function section(parent, h) {
    var mk = h.mk, tr = h.tr;
    var c = h.card("bgs.ed.h", parent), msg = mk("p", "bg-msg"), top = mk("div", "bg-btns"), wrap = mk("div", "bg-grid"), body = mk("div");
    c.appendChild(mk("p", "note", tr("bgs.ed.how")));
    c.appendChild(mk("p", "note bg-edlegend", tr("bgs.ed.legend")));
    var save = h.tip(mk("button", "btn go", tr("bgs.ed.save")), "tip.bgs.ed.save"), undo = h.tip(mk("button", "btn", tr("bgs.ed.discard")), "tip.bgs.ed.discard"), find = h.tip(mk("input", "txt bg-edfind"), "tip.bgs.ed.find");
    save.type = "button"; undo.type = "button"; find.type = "search"; find.placeholder = tr("bgs.ed.findph");
    top.appendChild(save); top.appendChild(undo); top.appendChild(find); c.appendChild(top); c.appendChild(msg); c.appendChild(wrap); c.appendChild(body);
    var st = { cols: [], rows: [], cell: {}, orig: {}, flags: {}, pend: {}, pendT: {}, sel: { r: 0, c: 0 }, sig: "", editing: null, busy: false };

    function say(text, kind) { msg.textContent = text || ""; msg.className = "bg-msg " + (kind || ""); }
    function nChanges() { var n = 0; Object.keys(st.pend).forEach(function (k) { n++; }); return n + Object.keys(st.pendT).length; }
    function updBtns() { var n = nChanges(); save.disabled = !n || st.busy; undo.disabled = !n; save.textContent = tr("bgs.ed.save") + (n ? " (" + n + ")" : ""); }
    function key(ci, name) { return ci + "\u0001" + name; }
    function valueAt(ci, name) { var k = key(ci, name); return k in st.pend ? st.pend[k] : st.cell[k]; }

    function load() {
      if (!invoke || st.busy) return Promise.resolve();
      return invoke("bgs_snapshots", { n: 500 }).then(function (r) {
        if (!r || !r.ok) { say(BG.errText ? BG.errText(r && r.error) : "", "err"); return; }
        var list = r.snapshots.slice().reverse();                 // oldest first = columns A, B, C ...
        var sig = JSON.stringify(list.map(function (s) { return [s.id, s.data_utc, s.rows.length, s.rows.reduce(function (a, x) { return a + (x.inf_x10 || 0); }, 0)]; }));
        if (sig === st.sig && !st.force) return;
        if (nChanges() && !st.force) return;                      // never replace the table under unsaved typing
        st.sig = sig; st.force = false;
        st.cols = list.map(function (s) { return { id: s.id, t: s.data_utc, imported: !!s.imported, complete: !!s.complete }; });
        st.cell = {}; st.flags = {}; var names = {};
        list.forEach(function (s, ci) { s.rows.forEach(function (x) { names[x.system] = 1; st.cell[key(ci, x.system)] = x.inf_x10; st.flags[key(ci, x.system)] = x.edited ? "c" : (x.accepted_unchecked || (x.conf != null && x.conf < 0.6 && !x.confirmed)) ? "w" : ""; }); });
        st.rows = Object.keys(names).sort(function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; });
        st.pend = {}; st.pendT = {}; draw(); updBtns();
      }).catch(function () { say(tr("bgs.ed.fail"), "err"); });
    }

    function draw() {
      var q = find.value.trim().toLowerCase(), rows = st.rows.map(function (n, i) { return { n: n, i: i }; }).filter(function (x) { return !q || x.n.toLowerCase().indexOf(q) >= 0; });
      if (!st.cols.length) { wrap.innerHTML = ""; body.textContent = tr("bgs.ed.none"); body.className = "bg-empty"; return; }
      body.textContent = ""; body.className = "";
      var o = '<table class="bg-ed"><thead><tr><th class="bg-corner"></th><th class="bg-sysh"></th>';
      st.cols.forEach(function (col, ci) { o += '<th class="bg-colh">' + colName(ci) + "</th>"; });
      o += '</tr><tr><th class="bg-corner"></th><th class="bg-sysh">' + esc(tr("bgs.ed.system")) + "</th>";
      st.cols.forEach(function (col, ci) {
        var tt = st.pendT[col.id] ? fmtT(st.pendT[col.id]) : fmtT(col.t);
        o += '<th class="bg-timeh' + (st.pendT[col.id] ? " chg" : "") + '" data-ci="' + ci + '" data-tip="' + esc(tr("tip.bgs.ed.time") + (col.imported ? "\n" + tr("bgs.ed.imported") : "")) + '">' + esc(tt) + (col.imported ? ' <i class="bg-imp">⇩</i>' : "") + ' <button class="bg-x" data-del="' + ci + '" data-tip="' + esc(tr("tip.bgs.ed.del")) + '">×</button></th>';
      });
      o += "</tr></thead><tbody>";
      rows.forEach(function (rw) {
        o += '<tr><th class="bg-rowh">' + rw.i + '</th><th class="bg-sysn" data-sys="' + esc(rw.n) + '">' + esc(rw.n) + (BG.popHtml ? BG.popHtml(rw.n) : "") + "</th>";
        st.cols.forEach(function (col, ci) {
          var k = key(ci, rw.n), ch = k in st.pend, v = valueAt(ci, rw.n), fl = st.flags[k] || "";
          var tp = rw.n + "\n" + tmx(col.t) + (ch ? "\n" + tr("bgs.ed.was", { v: fv(st.cell[k]) || "–" }) : fl === "w" ? "\n" + tr("bgs.ed.unsure") : fl === "c" ? "\n" + tr("bgs.ed.corrected") : "");
          o += '<td class="bg-c' + (ch ? " chg" : "") + (fl && !ch ? " f" + fl : "") + (st.sel.r === rw.i && st.sel.c === ci ? " sel" : "") + '" data-r="' + rw.i + '" data-c="' + ci + '" data-tip="' + esc(tp) + '">' + esc(fv(v)) + "</td>";
        });
        o += "</tr>";
      });
      wrap.innerHTML = o + "</tbody></table>";
    }

    // ----- editing -----
    function cellEl(r, ci) { return wrap.querySelector('td[data-r="' + r + '"][data-c="' + ci + '"]'); }
    function select(r, ci) { var old = wrap.querySelector("td.sel"); if (old) old.classList.remove("sel"); st.sel = { r: Math.max(0, Math.min(st.rows.length - 1, r)), c: Math.max(0, Math.min(st.cols.length - 1, ci)) }; var e = cellEl(st.sel.r, st.sel.c); if (e) { e.classList.add("sel"); e.scrollIntoView({ block: "nearest", inline: "nearest" }); } }
    function setVal(r, ci, v) { var name = st.rows[r], k = key(ci, name); if (v === st.cell[k] || (v == null && st.cell[k] == null)) delete st.pend[k]; else st.pend[k] = v; }
    function startEdit(r, ci, first) {
      var td = cellEl(r, ci); if (!td || st.editing) return; var name = st.rows[r], i = document.createElement("input");
      i.type = "text"; i.className = "bg-edin"; i.value = first != null ? first : fv(valueAt(ci, name)); st.editing = { r: r, c: ci }; td.textContent = ""; td.appendChild(i); i.focus(); if (first == null) i.select();
      function fin(commit, dr, dc) {
        if (!st.editing) return; var val = parseV(i.value);
        if (commit && val === undefined) { i.classList.add("bad"); say(tr("bgs.ed.badval"), "err"); return; }
        st.editing = null; if (commit) { setVal(r, ci, val); say("", ""); }
        td.textContent = fv(valueAt(ci, name)); var k = key(ci, name); td.classList.toggle("chg", k in st.pend); td.classList.remove("ff"); updBtns(); select(r + dr, ci + dc);
        if (commit) { td.setAttribute("data-tip", name + "\n" + tmx(st.cols[ci].t) + (k in st.pend ? "\n" + tr("bgs.ed.was", { v: fv(st.cell[k]) || "–" }) : "")); }
      }
      i.onkeydown = function (e) {
        if (e.key === "Enter") { e.preventDefault(); fin(true, e.shiftKey ? -1 : 1, 0); }
        else if (e.key === "Tab") { e.preventDefault(); fin(true, 0, e.shiftKey ? -1 : 1); }
        else if (e.key === "Escape") { e.preventDefault(); fin(false, 0, 0); }
        e.stopPropagation();
      };
      i.onblur = function () { if (st.editing && parseV(i.value) !== undefined) fin(true, 0, 0); else if (st.editing) fin(false, 0, 0); };
    }
    wrap.addEventListener("click", function (e) {
      var x = e.target, td = x.closest && x.closest("td.bg-c"), th = x.closest && x.closest("th.bg-timeh"), del = x.closest && x.closest("[data-del]");
      if (del) { delCol(+del.dataset.del, del); return; }
      if (td) { select(+td.dataset.r, +td.dataset.c); return; }
      if (th && !x.closest("input")) editTime(+th.dataset.ci, th);
    });
    wrap.addEventListener("dblclick", function (e) { var td = e.target.closest && e.target.closest("td.bg-c"); if (td) startEdit(+td.dataset.r, +td.dataset.c, null); });
    wrap.tabIndex = 0;
    wrap.addEventListener("keydown", function (e) {
      if (st.editing || e.target.tagName === "INPUT") return;
      var s = st.sel, k = e.key;
      if (k === "ArrowDown") { select(s.r + 1, s.c); e.preventDefault(); } else if (k === "ArrowUp") { select(s.r - 1, s.c); e.preventDefault(); }
      else if (k === "ArrowLeft") { select(s.r, s.c - 1); e.preventDefault(); } else if (k === "ArrowRight" || k === "Tab") { select(s.r, s.c + (e.shiftKey && k === "Tab" ? -1 : 1)); e.preventDefault(); }
      else if (k === "Enter" || k === "F2") { startEdit(s.r, s.c, null); e.preventDefault(); }
      else if (k === "Delete" || k === "Backspace") { setVal(s.r, s.c, null); var td = cellEl(s.r, s.c); if (td) { td.textContent = ""; td.classList.toggle("chg", key(s.c, st.rows[s.r]) in st.pend); } updBtns(); e.preventDefault(); }
      else if (/^[0-9.,]$/.test(k) && !e.ctrlKey && !e.metaKey) { startEdit(s.r, s.c, k); e.preventDefault(); }
    });
    wrap.addEventListener("paste", function (e) {
      if (e.target.tagName === "INPUT" || !e.clipboardData) return;
      var text = e.clipboardData.getData("text"); if (!text) return; e.preventDefault();
      var lines = text.replace(/\r/g, "").split("\n").filter(function (l, i, a) { return l.length || i < a.length - 1; }), bad = 0, n = 0;
      lines.forEach(function (ln, dr) { ln.split("\t").forEach(function (cellTxt, dc) {
        var r = st.sel.r + dr, ci = st.sel.c + dc; if (r >= st.rows.length || ci >= st.cols.length) return;
        var v = parseV(cellTxt); if (v === undefined) { bad++; return; } setVal(r, ci, v); n++;
      }); });
      draw(); updBtns(); say(bad ? tr("bgs.ed.pasted_bad", { n: n, b: bad }) : tr("bgs.ed.pasted", { n: n }), bad ? "err" : "ok");
    });
    function editTime(ci, th) {
      if (st.editing) return; var col = st.cols[ci], i = document.createElement("input"); i.type = "text"; i.className = "bg-edin wide"; i.value = fmtT(st.pendT[col.id] || col.t);
      th.textContent = ""; th.appendChild(i); i.focus(); i.select();
      function fin(commit) {
        if (commit) { var iso = parseT(i.value); if (!iso) { i.classList.add("bad"); say(tr("bgs.ed.badtime"), "err"); return; } if (iso === col.t) delete st.pendT[col.id]; else st.pendT[col.id] = iso; say("", ""); }
        draw(); updBtns();
      }
      i.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); fin(true); } else if (e.key === "Escape") { e.preventDefault(); fin(false); } e.stopPropagation(); };
      i.onblur = function () { if (parseT(i.value)) fin(true); else fin(false); };
    }
    var delArm = { ci: -1, timer: 0 };
    function delCol(ci, btn) {
      if (delArm.ci !== ci) { delArm.ci = ci; btn.textContent = tr("bgs.ed.sure"); btn.classList.add("arm"); clearTimeout(delArm.timer); delArm.timer = setTimeout(function () { delArm.ci = -1; draw(); }, 4000); return; }
      clearTimeout(delArm.timer); delArm.ci = -1; var col = st.cols[ci];
      invoke("bgs_delete_snapshot", { id: col.id }).then(function (r) {
        if (r && r.ok) { say(tr("bgs.ed.deleted", { n: colName(ci) }), "ok"); st.force = true; BG.dirty = true; load().then(function () { if (BG.bandChanged) BG.bandChanged(); }); } else say((BG.errText && BG.errText(r && r.error)) || tr("bgs.ed.fail"), "err");
      }).catch(function () { say(tr("bgs.ed.fail"), "err"); });
    }
    save.onclick = function () {
      var by = {};
      Object.keys(st.pend).forEach(function (k) { var p = k.split("\u0001"), ci = +p[0], col = st.cols[ci]; (by[col.id] = by[col.id] || { id: col.id, cells: [] }).cells.push({ system: p[1], inf_x10: st.pend[k] }); });
      Object.keys(st.pendT).forEach(function (id) { (by[id] = by[id] || { id: id, cells: [] }).data_utc = st.pendT[id]; });
      var edits = Object.keys(by).map(function (k) { return by[k]; }); if (!edits.length) return;
      st.busy = true; updBtns();
      invoke("bgs_edit", { edits: edits }).then(function (r) {
        st.busy = false;
        if (r && r.ok) { var n = nChanges(); say(tr("bgs.ed.saved", { n: n }), "ok"); st.pend = {}; st.pendT = {}; st.force = true; BG.dirty = true; load().then(function () { if (BG.bandChanged) BG.bandChanged(); }); if (BG.toast) BG.toast(tr("bgs.ed.saved", { n: n })); }
        else { say((BG.errText && BG.errText(r && r.error)) || tr("bgs.ed.fail"), "err"); updBtns(); }
      }).catch(function () { st.busy = false; say(tr("bgs.ed.fail"), "err"); updBtns(); });
    };
    undo.onclick = function () { st.pend = {}; st.pendT = {}; say("", ""); draw(); updBtns(); };
    find.oninput = function () { draw(); };
    updBtns(); load(); BG.poll(c, function () { if (!st.editing) load(); }, 3000);
    return c;
  }
  if (window.GVC) GVC.add("bgsedit", function (parent) { section(parent, GVC.h); });
})();
