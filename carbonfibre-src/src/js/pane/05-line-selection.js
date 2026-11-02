  /* ---- multi-line selection: whole lines, via Ctrl+A, Shift+arrows, Shift+click or drag ---- */
  /* A highlight can start and end mid-line (p.selCols: a = column on its first line, b = on its
     last). Lines between are highlighted whole; the caret's line shows its part in its own text
     box; the far end's line is shown raw (as Obsidian does for lines a selection touches) with
     exactly its part tinted, and drawn normally again when the highlight leaves it. */
  p.selCols = null; p.rawEnd = -1;
  function restoreRawEnd() {
    if (p.rawEnd >= 0 && p.rawEnd < p.lines.length && p.rawEnd !== p.activeLine && nodeAt(p.rawEnd) && nodeAt(p.rawEnd).classList.contains("ln-rawsel"))
      p.linesEl.replaceChild(makeRenderedNode(p.lines[p.rawEnd], p.fmeta[p.rawEnd], p.rawEnd), nodeAt(p.rawEnd));
    p.rawEnd = -1;
  }
  /* With the CSS Custom Highlight API (Edge has it), the far end's part is tinted in place: the line
     stays formatted, nothing redraws or reflows, and the tint ends exactly under the pointer.
     (Showing that line raw instead made it flash its markdown, and its characters shifted away
     from where the pointer was.) Without the API, the raw display below is the fallback. */
  var canTint = typeof CSS !== "undefined" && CSS.highlights && typeof Highlight === "function";
  function tintEnd(j, a, b) {
    var el = nodeAt(j);
    if (!el || el.classList.contains("ln-active")) return false;
    var va = visibleFromRaw(p.lines[j], p.fmeta[j], a), vb = visibleFromRaw(p.lines[j], p.fmeta[j], b);
    var whole = va === null || vb === null;
    var rg = whole ? null : rangeOfVisible(el, va, vb);
    paneTint(p, whole || !rg ? [] : [rg]);
    el.classList.toggle("ln-sel", whole);
    p.tintLine = j;
    return true;
  }
  function untint() { p.tintLine = -1; paneTint(p, []); }   /* paintRange resets each line's whole-line tint itself */
  p.tintLine = -1;
  function drawRawEnd(j, a, b) {
    if (canTint && tintEnd(j, a, b)) return;
    var raw = p.lines[j], el = document.createElement("div");
    el.className = "ln ln-rawsel";
    el.innerHTML = esc(raw.slice(0, a)) + '<span class="selpart">' + esc(raw.slice(a, b)) + (b >= raw.length && j < p.selTo ? " " : "") + "</span>" + esc(raw.slice(b)) + (raw ? "" : "\u200b");
    p.linesEl.replaceChild(el, nodeAt(j));
    p.rawEnd = j;
  }
  p.paintRange = function () {
    var kids = p.linesEl.children, pc = p.allSelected && p.selCols;
    for (var k = 0; k < kids.length; k++) {
      var whole = p.allSelected && k >= p.selFrom && k <= p.selTo && (!pc || (k > p.selFrom && k < p.selTo));
      kids[k].classList.toggle("ln-sel", whole);
    }
    if (!pc) { restoreRawEnd(); untint(); return; }
    var other = p.activeLine === p.selFrom ? p.selTo : p.selFrom;
    if (p.tintLine >= 0 && p.tintLine !== other) untint();
    if (p.rawEnd !== other) restoreRawEnd();
    drawRawEnd(other, other === p.selFrom ? pc.a : 0, other === p.selFrom ? p.lines[other].length : pc.b);
    if (p.ta && p.activeLine === p.selFrom) p.ta.setSelectionRange(Math.min(pc.a, p.ta.value.length), p.ta.value.length, "backward");
    else if (p.ta && p.activeLine === p.selTo) p.ta.setSelectionRange(0, Math.min(pc.b, p.ta.value.length), "forward");
  };
  /* a highlight from (aLine, aCol) - the caret's end - to (fLine, fCol) - the end that moves */
  p.setPartial = function (aLine, aCol, fLine, fCol) {
    if (!p.note()) return;
    fLine = Math.max(0, Math.min(p.lines.length - 1, fLine));
    fCol = Math.max(0, Math.min(p.lines[fLine].length, fCol));
    if (aLine === fLine) {                             /* back to one line: its own text box selection */
      p.clearSelectAll();
      if (p.activeLine !== aLine) p.setActive(aLine, aCol);
      if (p.ta) p.ta.setSelectionRange(Math.min(aCol, fCol), Math.max(aCol, fCol), fCol < aCol ? "backward" : "forward");
      return;
    }
    if (p.activeLine !== aLine) { p.clearSelectAll(); p.setActive(aLine, aCol); }
    var down = fLine > aLine;
    p.selAnchor = aLine; p.selFocus = fLine; p.selAnchorCol = aCol; p.selFocusCol = fCol;
    p.selFrom = down ? aLine : fLine; p.selTo = down ? fLine : aLine;
    p.selCols = { a: down ? aCol : fCol, b: down ? fCol : aCol };
    p.allSelected = true;
    p.paintRange();
  };
  /* where a highlight's ends are, whatever kind it is: whole lines count as start-of-first to end-of-last */
  p.selEnds = function () {
    if (!p.allSelected) return null;
    var aL = p.selAnchor, fL = p.selFocus;
    if (p.selCols) return { aL: aL, aC: p.selAnchorCol, fL: fL, fC: p.selFocusCol };
    var down = fL >= aL;
    return { aL: aL, aC: down ? 0 : p.lines[aL].length, fL: fL, fC: down ? p.lines[fL].length : 0 };
  };
  /* the text range a highlight covers; one ending at the start of a later line counts as whole
     lines (so pasting over lines replaces them instead of joining onto the next) */
  p.selRange = function () {
    var from = p.selFrom, to = p.selTo, a = 0, b = p.lines[to].length;
    if (p.selCols) {
      a = p.selCols.a; b = p.selCols.b;
      if (b === 0 && to > from && a === 0) { to--; b = p.lines[to].length; }   /* line-wise: start to start */
    }
    return { from: from, to: to, a: a, b: b };
  };
  /* Keep line i in view with room to see what comes next: the view moves only when the line gets
     within about three lines of the top or bottom edge (instantly, so held keys don't lag). */
  p.keepVisible = function (i) {
    var el = p.linesEl.children[i], sc = p.editorEl;
    if (!el || !sc) return;
    var r = el.getBoundingClientRect(), v = sc.getBoundingClientRect();
    var lineH = Math.min(r.height || 24, 40), margin = Math.min(lineH * 3, v.height / 4);
    if (r.top < v.top + margin) sc.scrollTop -= (v.top + margin) - r.top;
    else if (r.bottom > v.bottom - margin) sc.scrollTop += r.bottom - (v.bottom - margin);
  };
  p.setRange = function (a, b) {
    if (!p.note() || !p.lines.length) return;
    a = Math.max(0, Math.min(a, p.lines.length - 1)); b = Math.max(0, Math.min(b, p.lines.length - 1));
    var from = Math.min(a, b), to = Math.max(a, b);
    var changed = !p.allSelected || from !== p.selFrom || to !== p.selTo || !!p.selCols;
    p.selFrom = from; p.selTo = to; p.allSelected = true; p.selCols = null;   /* whole lines */
    p.paintRange();
    if (changed && p.ta) p.ta.setSelectionRange(0, p.ta.value.length);
  };
