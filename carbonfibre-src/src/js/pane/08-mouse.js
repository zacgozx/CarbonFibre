  /* ---- live view events ---- */

  p.editorEl.addEventListener("click", function (e) {
    var a = e.target.closest("a[data-extlink]");
    if (a) e.preventDefault();
  });
  p.editorEl.addEventListener("scroll", scheduleSession);

  p.editorEl.addEventListener("mousedown", function (e) {
    focusThis();
    var lineAlt = e.target.closest(".editor-inner > div");
    if ((e.altKey || (e.ctrlKey && !e.shiftKey && e.button === 0 && p.carets.length)) && lineAlt && p.mode === "live") {
      var li = indexOfNode(lineAlt);
      var cc = rawCaretFromClick(p.lines[li], p.fmeta[li], lineAlt, e.clientX, e.clientY);
      e.preventDefault();
      if (p.activeLine === null) { p.setActive(li, cc); colDrag = { line: li, col: cc }; return; }
      if (li === p.activeLine) { p.ta.setSelectionRange(cc, cc); colDrag = { line: li, col: cc }; return; }
      p.col = null;
      p.addCaret(li, cc);
      colDrag = { line: p.activeLine, col: p.ta ? p.ta.selectionStart : cc };
      return;
    }
    if (!e.shiftKey) p.clearSelectAll();
    if (!e.altKey && linkClick(e, p)) { e.stopPropagation(); return; }

    var skf = e.target.closest("[data-skfile]");
    if (skf && !e.altKey) { e.preventDefault(); openSketchFile(skf.dataset.skfile); return; }
    var skc = e.target.closest("[data-sketch]");
    var mmc = e.target.closest("[data-mermaid]");
    if (mmc && !e.altKey) { e.preventDefault(); e.stopPropagation(); convertMermaid(p, parseInt(mmc.dataset.mermaid, 10)); return; }
    var sks = e.target.closest("[data-sketch-split]");
    if (sks && !e.altKey) { e.preventDefault(); e.stopPropagation(); openSketchSplit(p, parseInt(sks.dataset.sketchSplit, 10)); return; }
    if (skc && !e.altKey) { e.preventDefault(); openSketch(p, parseInt(skc.dataset.sketch, 10)); return; }

    var cb = e.target.closest("[data-check]");
    if (cb) {
      e.preventDefault();
      var ci = parseInt(cb.dataset.check, 10);
      histBreak(p);
      p.lines[ci] = toggleTask(p.lines[ci]);
      p.commit(false);
      p.linesEl.replaceChild(makeRenderedNode(p.lines[ci], p.fmeta[ci], ci), nodeAt(ci));
      return;
    }

    var lineEl = e.target.closest(".editor-inner > div");
    if (lineEl) {
      var idx = indexOfNode(lineEl);
      if (e.shiftKey && p.activeLine !== null && idx !== p.activeLine) {
        e.preventDefault();
        var se0 = p.selEnds(), aCol = se0 ? se0.aC : (p.ta ? (p.ta.selectionDirection === "backward" ? p.ta.selectionEnd : p.ta.selectionStart) : 0);
        p.setPartial(se0 ? se0.aL : p.activeLine, aCol, idx, colAtPoint(lineEl, idx, e.clientX, e.clientY));
        return;
      }
      if (idx === p.activeLine) { dragFrom = idx; setTimeout(function () { dragCol = p.ta ? p.ta.selectionStart : 0; }, 0); if (p.allSelected) p.clearSelectAll(); return; }
      e.preventDefault();
      p.goalCol = null;
      var clickCol = rawCaretFromClick(p.lines[idx], p.fmeta[idx], lineEl, e.clientX, e.clientY);
      /* a drag that starts left of the text (on a bullet, in the margin) starts at the very start
         of the line, markup included, as dragging in VS Code's gutter does; a plain click there
         still puts the caret where the text starts */
      dragCol = e.clientX < firstTextLeft(lineEl) ? 0 : clickCol;
      /* nothing changes yet: switching the line to its raw text now would move the words under the
         pointer as a drag starts. A click (no movement) puts the caret here on release; a drag is
         drawn on the formatted lines and becomes the selection on release. */
      p.pend = { idx: idx, col: clickCol, x: e.clientX, y: e.clientY, dragged: false, fL: idx, fC: dragCol };
      dragFrom = idx;
      return;
    }

    if (p.lines.length && (e.target === p.editorEl || e.target === p.tailEl || e.target === p.linesEl)) {
      e.preventDefault();
      p.setActive(p.lines.length - 1, p.lines[p.lines.length - 1].length);
    }
  });

  /* dragging past the active line turns the native in-line selection into a line range.
     Chromium targets drag events at the mousedown node, so look up what is under the pointer. */
  p.editorEl.addEventListener("mousemove", function (e) {
    if (colDrag && e.altKey && (e.buttons & 1)) {
      var under = document.elementFromPoint(e.clientX, e.clientY);
      var el2 = under && under.closest(".editor-inner > div");
      if (!el2 || el2.parentNode !== p.linesEl) return;
      var li2 = indexOfNode(el2);
      var c2 = rawCaretFromClick(p.lines[li2], p.fmeta[li2], el2, e.clientX, e.clientY);
      p.setColumn(colDrag.line, colDrag.col, li2, c2);
      return;
    }
    if (dragFrom < 0 || !(e.buttons & 1)) { stopEdgeScroll(); return; }
    edgeScroll(e.clientY);
    under = document.elementFromPoint(e.clientX, e.clientY);
    var el = under && under.closest(".editor-inner > div");
    if (!el || el.parentNode !== p.linesEl) return;
    var idx = indexOfNode(el);
    if (p.pend) {                                       /* a drag from a formatted line: drawn, not yet selected */
      if (!p.pend.dragged && idx === dragFrom && Math.abs(e.clientX - p.pend.x) + Math.abs(e.clientY - p.pend.y) < 4) return;
      p.pend.dragged = true;
      p.pend.fL = idx; p.pend.fC = colAtPoint(el, idx, e.clientX, e.clientY);
      dragPaint(dragFrom, dragCol, p.pend.fL, p.pend.fC);
      return;
    }
    if (idx === dragFrom) { if (p.allSelected) p.setPartial(dragFrom, dragCol, dragFrom, dragCol); return; }
    p.setPartial(dragFrom, dragCol, idx, colAtPoint(el, idx, e.clientX, e.clientY));
  });
  /* the column under the pointer on line idx: from its raw text when it is shown raw (the far end
     of a highlight), otherwise from the rendered line */
  var dragCol = 0;
  function firstTextLeft(el) {
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: function (n) { return n.textContent.trim() && !(n.parentElement && n.parentElement.closest("[data-deco]")) ? 1 : 3; } });
    var t = w.nextNode();
    if (!t) return -Infinity;
    var r = document.createRange(); r.setStart(t, 0); r.setEnd(t, Math.min(1, t.length));
    return r.getBoundingClientRect().left;
  }
  function colAtPoint(el, idx, x, y) {
    if (el.classList.contains("ln-rawsel") && document.caretRangeFromPoint) {
      var rg = document.caretRangeFromPoint(x, y);
      if (rg && el.contains(rg.startContainer)) {
        var walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), n2, off = 0;
        while ((n2 = walk.nextNode())) { if (n2 === rg.startContainer) return Math.min(p.lines[idx].length, off + rg.startOffset); off += n2.length; }
      }
      return x < el.getBoundingClientRect().left + 4 ? 0 : p.lines[idx].length;
    }
    if (el.classList.contains("ln-active") && p.ta) return p.pend ? rawColAtPoint(el, x, y) : p.ta.selectionStart;
    return rawCaretFromClick(p.lines[idx], p.fmeta[idx], el, x, y);
  }
  /* the line being edited shows its raw text (the copy under its text box): the column of the
     character under the pointer there, not wherever its own caret happens to be */
  function rawColAtPoint(el, x, y) {
    var hl = el.querySelector(".ta-hl"); if (!hl) return p.ta ? p.ta.selectionStart : 0;
    var w = document.createTreeWalker(hl, NodeFilter.SHOW_TEXT), n, off = 0, best = null, bestD = 1e9, r = document.createRange();
    while ((n = w.nextNode())) {
      for (var k = 0; k < n.length; k++) {
        r.setStart(n, k); r.setEnd(n, k + 1);
        var b = r.getBoundingClientRect(); if (!b.width && !b.height) continue;
        var dy = y < b.top ? b.top - y : y > b.bottom ? y - b.bottom : 0, dx = x < b.left ? b.left - x : x > b.right ? x - b.right : 0;
        var d = dy * 1000 + dx;
        if (d < bestD) { bestD = d; best = off + k + (x > b.left + b.width / 2 ? 1 : 0); }
      }
      off += n.length;
    }
    return best === null ? 0 : Math.min(best, p.lines[indexOfNode(el)].length);
  }
  /* dragging a highlight near (or past) the top or bottom edge scrolls the note and keeps
     growing the highlight to the line now under the pointer */
  var edgeTimer = 0, edgeY = 0;
  function stopEdgeScroll() { if (edgeTimer) { clearInterval(edgeTimer); edgeTimer = 0; } }
  function edgeScroll(y) {
    edgeY = y;
    var v = p.editorEl.getBoundingClientRect(), zone = 36;
    var speed = y < v.top + zone ? -Math.ceil((v.top + zone - y) / 2) : y > v.bottom - zone ? Math.ceil((y - (v.bottom - zone)) / 2) : 0;
    stopEdgeScroll();
    if (!speed) return;
    edgeTimer = setInterval(function () {
      if (dragFrom < 0) { stopEdgeScroll(); return; }
      p.editorEl.scrollTop += Math.max(-40, Math.min(40, speed));
      var vv = p.editorEl.getBoundingClientRect(), probe = Math.max(vv.top + 4, Math.min(vv.bottom - 4, edgeY));
      var under2 = document.elementFromPoint(vv.left + 60, probe), el3 = under2 && under2.closest(".editor-inner > div");
      if (el3 && el3.parentNode === p.linesEl) {
        var j = indexOfNode(el3), cj = colAtPoint(el3, j, vv.left + 60, probe);
        if (p.pend) { p.pend.dragged = true; p.pend.fL = j; p.pend.fC = cj; dragPaint(dragFrom, dragCol, j, cj); }
        else if (j !== dragFrom) p.setPartial(dragFrom, dragCol, j, cj);
      }
    }, 30);
  }
  /* while dragging from a formatted line: whole lines in between, and the exact part of each end,
     tinted in place (nothing switches to raw text, so nothing moves under the pointer) */
  function dragPaint(aL, aC, fL, fC) {
    var lo = Math.min(aL, fL), hi = Math.max(aL, fL), kids = p.linesEl.children, ranges = [];
    var forward = aL < fL || (aL === fL && aC <= fC);
    var c1 = forward ? aC : fC, c2 = forward ? fC : aC;     /* the top end starts at c1, the bottom end stops at c2 */
    for (var k = 0; k < kids.length; k++) kids[k].classList.toggle("ln-sel", k > lo && k < hi);
    var part = function (j, a, b) {
      var el = kids[j]; if (!el) return;
      var hl = el.classList.contains("ln-active") && el.querySelector(".ta-hl");
      if (hl) { var rr = rangeOfVisible(hl, a, b === null ? 1e9 : b); if (rr) ranges.push(rr); return; }   /* raw copy: raw columns */
      var va = visibleFromRaw(p.lines[j], p.fmeta[j], a), vb = b === null ? 1e9 : visibleFromRaw(p.lines[j], p.fmeta[j], b);
      var rg = va === null || vb === null ? null : rangeOfVisible(el, va, vb);
      if (rg) ranges.push(rg); else el.classList.add("ln-sel");
    };
    if (lo === hi) part(lo, Math.min(c1, c2), Math.max(c1, c2));
    else { part(lo, c1, null); part(hi, 0, c2); }
    paneTint(p, ranges);
  }
  function dragUnpaint() {
    Array.prototype.forEach.call(p.linesEl.querySelectorAll(".ln-sel"), function (el) { el.classList.remove("ln-sel"); });
    paneTint(p, []);
  }
  window.addEventListener("mouseup", function () {
    var pd = p.pend;
    if (pd) {
      p.pend = null;
      if (!pd.dragged || (pd.fL === pd.idx && pd.fC === dragCol)) { dragUnpaint(); p.setActive(pd.idx, pd.col); }   /* a click */
      else { dragUnpaint(); p.setPartial(pd.idx, dragCol, pd.fL, pd.fC); }                                       /* the drag becomes the selection */
    }
    dragFrom = -1; colDrag = null; stopEdgeScroll();
  });

