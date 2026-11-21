  /* ---- split view ---- */

  function renderPreview() {
    let html = "";
    for (let i = 0; i < p.lines.length; i++)
      html += makeRenderedNode(p.lines[i], p.fmeta[i], i).outerHTML;
    p.prevEl.innerHTML = html;
  }
  p.renderPreview = renderPreview;

  p.srcEl.addEventListener("input", function () {
    const n = p.note();
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
    const cd = e.clipboardData;
    if (!cd) return;
    const el = p.srcEl, sa = el.selectionStart, sb = el.selectionEnd;
    const img = imageFromClipboard(cd);
    if (img && state.backend === "folder") {
      e.preventDefault();
      saveImageBeside(p, img).then(function (name) {
        const ins = "![](" + name + ")";
        el.value = el.value.slice(0, sa) + ins + el.value.slice(sb);
        el.setSelectionRange(sa + ins.length, sa + ins.length);
        el.dispatchEvent(new Event("input"));
      }).catch(function (err) { alert("Couldn't save that image: " + err.message); });
      return;
    }
    const inCode = caretInFence(el.value, sa);
    if (inCode) {
      const plain = (cd.getData("text/plain") || "").replace(/\r\n?/g, "\n");
      if (!plain) return;
      e.preventDefault();
      el.value = el.value.slice(0, sa) + plain + el.value.slice(sb);
      el.setSelectionRange(sa + plain.length, sa + plain.length);
      el.dispatchEvent(new Event("input"));
      return;
    }
    const conv = pasteToMarkdown(cd, el.value.slice(sa, sb), false);
    if (!conv) return;
    e.preventDefault();
    const ins2 = conv.inline || conv.lines.join("\n");
    el.value = el.value.slice(0, sa) + ins2 + el.value.slice(sb);
    el.setSelectionRange(sa + ins2.length, sa + ins2.length);
    el.dispatchEvent(new Event("input"));
  });

  p.srcEl.addEventListener("keydown", function (e) {
    const mod = e.ctrlKey || e.metaKey;
    const el = p.srcEl;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) histRedo(p); else histUndo(p);
      return;
    }
    if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); histRedo(p); return; }
    if (mod && e.key.toLowerCase() === "b") {
      e.preventDefault();
      const rb = wrapSelection(el, "**", "**", "bold");
      el.value = rb.next; el.setSelectionRange(rb.ns, rb.ne);
      el.dispatchEvent(new Event("input"));
    } else if (mod && e.key.toLowerCase() === "i") {
      e.preventDefault();
      const ri = wrapSelection(el, "*", "*", "italic");
      el.value = ri.next; el.setSelectionRange(ri.ns, ri.ne);
      el.dispatchEvent(new Event("input"));
    } else if (mod && e.key.toLowerCase() === "k") {
      e.preventDefault();
      const v = el.value, s = el.selectionStart, se = el.selectionEnd, sel = v.slice(s, se);
      if (looksLikeUrl(sel)) {
        el.value = v.slice(0, s) + "[](" + sel + ")" + v.slice(se);
        el.setSelectionRange(s + 1, s + 1);
      } else {
        const label = sel || "link";
        el.value = v.slice(0, s) + "[" + label + "](url)" + v.slice(se);
        const us = s + label.length + 3;
        el.setSelectionRange(us, us + 3);
      }
      el.dispatchEvent(new Event("input"));
    } else if (mod && e.key.toLowerCase() === "s") {
      e.preventDefault(); flushPersist();
    } else if (e.key === "Tab") {
      e.preventDefault();
      const v2 = el.value, a = el.selectionStart, b = el.selectionEnd;
      el.value = v2.slice(0, a) + "  " + v2.slice(b);
      el.setSelectionRange(a + 2, a + 2);
      el.dispatchEvent(new Event("input"));
    }
  });

  let syncing = false;
  p.srcEl.addEventListener("scroll", function () {
    if (syncing) return;
    syncing = true;
    const sm = p.srcEl.scrollHeight - p.srcEl.clientHeight;
    const pm = p.prevEl.scrollHeight - p.prevEl.clientHeight;
    if (sm > 0 && pm > 0) p.prevEl.scrollTop = (p.srcEl.scrollTop / sm) * pm;
    requestAnimationFrame(function () { syncing = false; });
  });

  p.prevEl.addEventListener("click", function (e) {
    const a = e.target.closest("a[data-extlink]");
    if (a) e.preventDefault();
  });

  p.prevEl.addEventListener("mousedown", function (e) {
    focusThis();
    if (linkClick(e, p)) return;
    const skf = e.target.closest("[data-skfile]");
    if (skf && !e.altKey) { e.preventDefault(); openSketchFile(skf.dataset.skfile); return; }
    const skc = e.target.closest("[data-sketch]");
    const mmc2 = e.target.closest("[data-mermaid]");
    if (mmc2) { e.preventDefault(); convertMermaid(p, parseInt(mmc2.dataset.mermaid, 10)); return; }
    const sks2 = e.target.closest("[data-sketch-split]");
    if (sks2) { e.preventDefault(); openSketchSplit(p, parseInt(sks2.dataset.sketchSplit, 10)); return; }
    if (skc) { e.preventDefault(); openSketch(p, parseInt(skc.dataset.sketch, 10)); return; }
    const cb = e.target.closest("[data-check]");
    if (cb) {
      e.preventDefault();
      const ci = parseInt(cb.dataset.check, 10);
      p.lines[ci] = toggleTask(p.lines[ci]);
      const tl = Timeline.apply(p.lines, [ci]);
      if (tl) Array.prototype.splice.apply(p.lines, [0, p.lines.length].concat(tl));
      const n = p.note();
      if (n) { n.content = p.lines.join("\n"); p.stale = false; markDirty(n); }
      const st = p.srcEl.scrollTop, ss = p.srcEl.selectionStart, sp = p.srcEl.selectionEnd;
      p.srcEl.value = p.lines.join("\n");
      p.srcEl.setSelectionRange(ss, sp);
      p.srcEl.scrollTop = st;
      renderPreview();
    }
  });

