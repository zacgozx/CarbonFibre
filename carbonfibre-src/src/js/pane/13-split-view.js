  /* ---- split view ---- */

  function renderPreview() {
    var html = "";
    for (var i = 0; i < p.lines.length; i++)
      html += makeRenderedNode(p.lines[i], p.fmeta[i], i).outerHTML;
    p.prevEl.innerHTML = html;
  }
  p.renderPreview = renderPreview;

  p.srcEl.addEventListener("input", function () {
    var n = p.note();
    if (!n) return;
    histMark(p);
    n.content = p.srcEl.value;
    p.stale = false;
    p.lines = n.content.split("\n");
    p.fmeta = computeFenceMeta(p.lines);
    markDirty(n);
    refreshSearchIfActive();
    scheduleMirror(p, n.id);
    if (p.previewTimer) clearTimeout(p.previewTimer);
    p.previewTimer = setTimeout(function () { p.previewTimer = null; renderPreview(); }, 90);
  });

  p.srcEl.addEventListener("paste", function (e) {
    var cd = e.clipboardData;
    if (!cd) return;
    var el = p.srcEl, sa = el.selectionStart, sb = el.selectionEnd;
    var img = imageFromClipboard(cd);
    if (img && state.backend === "folder") {
      e.preventDefault();
      saveImageBeside(p, img).then(function (name) {
        var ins = "![](" + name + ")";
        el.value = el.value.slice(0, sa) + ins + el.value.slice(sb);
        el.setSelectionRange(sa + ins.length, sa + ins.length);
        el.dispatchEvent(new Event("input"));
      }).catch(function (err) { alert("Couldn't save that image: " + err.message); });
      return;
    }
    var inCode = caretInFence(el.value, sa);
    if (inCode) {
      var plain = (cd.getData("text/plain") || "").replace(/\r\n?/g, "\n");
      if (!plain) return;
      e.preventDefault();
      el.value = el.value.slice(0, sa) + plain + el.value.slice(sb);
      el.setSelectionRange(sa + plain.length, sa + plain.length);
      el.dispatchEvent(new Event("input"));
      return;
    }
    var conv = pasteToMarkdown(cd, el.value.slice(sa, sb), false);
    if (!conv) return;
    e.preventDefault();
    var ins2 = conv.inline || conv.lines.join("\n");
    el.value = el.value.slice(0, sa) + ins2 + el.value.slice(sb);
    el.setSelectionRange(sa + ins2.length, sa + ins2.length);
    el.dispatchEvent(new Event("input"));
  });

  p.srcEl.addEventListener("keydown", function (e) {
    var mod = e.ctrlKey || e.metaKey;
    var el = p.srcEl;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) histRedo(p); else histUndo(p);
      return;
    }
    if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); histRedo(p); return; }
    if (mod && e.key.toLowerCase() === "b") {
      e.preventDefault();
      var rb = wrapSelection(el, "**", "**", "bold");
      el.value = rb.next; el.setSelectionRange(rb.ns, rb.ne);
      el.dispatchEvent(new Event("input"));
    } else if (mod && e.key.toLowerCase() === "i") {
      e.preventDefault();
      var ri = wrapSelection(el, "*", "*", "italic");
      el.value = ri.next; el.setSelectionRange(ri.ns, ri.ne);
      el.dispatchEvent(new Event("input"));
    } else if (mod && e.key.toLowerCase() === "k") {
      e.preventDefault();
      var v = el.value, s = el.selectionStart, se = el.selectionEnd, sel = v.slice(s, se);
      if (looksLikeUrl(sel)) {
        el.value = v.slice(0, s) + "[](" + sel + ")" + v.slice(se);
        el.setSelectionRange(s + 1, s + 1);
      } else {
        var label = sel || "link";
        el.value = v.slice(0, s) + "[" + label + "](url)" + v.slice(se);
        var us = s + label.length + 3;
        el.setSelectionRange(us, us + 3);
      }
      el.dispatchEvent(new Event("input"));
    } else if (mod && e.key.toLowerCase() === "s") {
      e.preventDefault(); flushPersist();
    } else if (e.key === "Tab") {
      e.preventDefault();
      var v2 = el.value, a = el.selectionStart, b = el.selectionEnd;
      el.value = v2.slice(0, a) + "  " + v2.slice(b);
      el.setSelectionRange(a + 2, a + 2);
      el.dispatchEvent(new Event("input"));
    }
  });

  var syncing = false;
  p.srcEl.addEventListener("scroll", function () {
    if (syncing) return;
    syncing = true;
    var sm = p.srcEl.scrollHeight - p.srcEl.clientHeight;
    var pm = p.prevEl.scrollHeight - p.prevEl.clientHeight;
    if (sm > 0 && pm > 0) p.prevEl.scrollTop = (p.srcEl.scrollTop / sm) * pm;
    requestAnimationFrame(function () { syncing = false; });
  });

  p.prevEl.addEventListener("click", function (e) {
    var a = e.target.closest("a[data-extlink]");
    if (a) e.preventDefault();
  });

  p.prevEl.addEventListener("mousedown", function (e) {
    focusThis();
    if (linkClick(e, p)) return;
    var skf = e.target.closest("[data-skfile]");
    if (skf && !e.altKey) { e.preventDefault(); openSketchFile(skf.dataset.skfile); return; }
    var skc = e.target.closest("[data-sketch]");
    var mmc2 = e.target.closest("[data-mermaid]");
    if (mmc2) { e.preventDefault(); convertMermaid(p, parseInt(mmc2.dataset.mermaid, 10)); return; }
    var sks2 = e.target.closest("[data-sketch-split]");
    if (sks2) { e.preventDefault(); openSketchSplit(p, parseInt(sks2.dataset.sketchSplit, 10)); return; }
    if (skc) { e.preventDefault(); openSketch(p, parseInt(skc.dataset.sketch, 10)); return; }
    var cb = e.target.closest("[data-check]");
    if (cb) {
      e.preventDefault();
      var ci = parseInt(cb.dataset.check, 10);
      p.lines[ci] = toggleTask(p.lines[ci]);
      var n = p.note();
      if (n) { n.content = p.lines.join("\n"); p.stale = false; markDirty(n); }
      var st = p.srcEl.scrollTop, ss = p.srcEl.selectionStart, sp = p.srcEl.selectionEnd;
      p.srcEl.value = p.lines.join("\n");
      p.srcEl.setSelectionRange(ss, sp);
      p.srcEl.scrollTop = st;
      renderPreview();
    }
  });

