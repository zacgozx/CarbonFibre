  /* ---- line operations: on the highlighted lines, or the caret's line ----
     Each is one undo step and leaves the same lines highlighted (or the caret where it was). */
  p.lineSpan = function () {
    if (!p.allSelected) return { from: p.activeLine, to: p.activeLine, range: false };
    var to = p.selTo;
    if (p.selCols && p.selCols.b === 0 && to > p.selFrom) to--;   /* a highlight ending at a line's start leaves that line out, as in VS Code */
    return { from: p.selFrom, to: to, range: true };
  };
  /* write lines [from..to] as `fresh`, then highlight [a..b] (range) or put the caret at (line, col) */
  p.applyLines = function (from, to, fresh, after) {
    histBreak(p);
    Array.prototype.splice.apply(p.lines, [from, to - from + 1].concat(fresh));
    if (!p.lines.length) p.lines.push("");
    p.commit(true);
    p.clearSelectAll();
    p.activeLine = null;
    renderAllLines();
    /* the caret's line is mounted first so the keyboard keeps a target (the next key press went
       nowhere when only the highlight was restored), then the highlight goes back on */
    if (after.range && after.b >= after.a) { p.setActive(after.a, 0); p.selAnchor = after.a; p.selFocus = after.b; p.setRange(after.a, after.b); p.keepVisible(after.b); }
    else { var L = Math.max(0, Math.min(p.lines.length - 1, after.line)); p.setActive(L, Math.min(after.col || 0, p.lines[L].length)); p.keepVisible(L); }
    histBreak(p);
    markTyping();
  };
  var caretCol = function () { return p.ta ? p.ta.selectionStart : 0; };
  p.moveLines = function (dir) {
    var sp = p.lineSpan(), col = caretCol();
    if ((dir < 0 && sp.from === 0) || (dir > 0 && sp.to >= p.lines.length - 1)) return;
    var block = p.lines.slice(sp.from, sp.to + 1);
    if (dir < 0) p.applyLines(sp.from - 1, sp.to, block.concat([p.lines[sp.from - 1]]), { range: sp.range, a: sp.from - 1, b: sp.to - 1, line: sp.from - 1, col: col });
    else p.applyLines(sp.from, sp.to + 1, [p.lines[sp.to + 1]].concat(block), { range: sp.range, a: sp.from + 1, b: sp.to + 1, line: sp.from + 1, col: col });
  };
  p.dupLines = function (dir) {
    var sp = p.lineSpan(), col = caretCol(), block = p.lines.slice(sp.from, sp.to + 1), n = block.length;
    /* down: the copy goes below and is the one highlighted; up: the copy goes above, the highlight stays put */
    var at = dir > 0 ? sp.from + n : sp.from;
    p.applyLines(sp.from, sp.to, block.concat(block), { range: sp.range, a: at, b: at + n - 1, line: at, col: col });
  };
  p.deleteLines = function () {
    var sp = p.lineSpan(), col = caretCol();
    p.applyLines(sp.from, sp.to, [], { range: false, line: sp.from, col: col });
  };
  /* Ctrl+L: highlight the caret's line; again, and the highlight grows a line down */
  p.selectLineStep = function () {
    if (!p.allSelected) { var i = p.activeLine; p.selAnchor = p.selFocus = i; p.setRange(i, i); }
    else { p.selAnchor = p.selFrom; p.selFocus = Math.min(p.lines.length - 1, p.selTo + 1); p.setRange(p.selFrom, p.selFocus); }
    p.keepVisible(p.selTo);
  };
  /* Ctrl+Enter: checkboxes, as in Obsidian. Lines that aren't tasks become tasks; when they all
     are, they are ticked - or unticked if every one is ticked already. */
  p.toggleTasks = function () {
    var sp = p.lineSpan(), col = caretCol(), block = p.lines.slice(sp.from, sp.to + 1);
    var isTask = function (l) { return /^\s*([-*+]|\d+[.)])\s+\[( |x|X)\]/.test(l); };
    var filled = block.filter(function (l) { return l.trim() !== "" && !isDelim(l); });
    if (!filled.length) return;
    var out, colShift = 0;
    if (filled.some(function (l) { return !isTask(l); })) {
      out = block.map(function (l) {
        if (l.trim() === "" || isDelim(l) || isTask(l)) return l;
        var m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(l);
        if (m) { colShift = 4; return m[1] + m[2] + " [ ] " + m[3]; }
        var ind = /^\s*/.exec(l)[0]; colShift = 6;
        return ind + "- [ ] " + l.slice(ind.length);
      });
    } else {
      var allDone = filled.every(function (l) { return /\[(x|X)\]/.test(l); });
      out = block.map(function (l) { return isTask(l) ? l.replace(/\[( |x|X)\]/, allDone ? "[ ]" : "[x]") : l; });
    }
    p.applyLines(sp.from, sp.to, out, { range: sp.range, a: sp.from, b: sp.to, line: sp.from, col: col + colShift });
  };
  /* Ctrl+B / Ctrl+I on highlighted lines: each line's text (after #, -, - [ ], > or 1.) is wrapped,
     or unwrapped if every line already is */
  p.wrapLines = function (mark) {
    var sp = p.lineSpan(), block = p.lines.slice(sp.from, sp.to + 1);
    var split = function (l) { var m = /^(\s*(?:#{1,6}\s+|>\s*|(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)?)(.*?)(\s*)$/.exec(l); return [m[1], m[2], m[3]]; };
    var wrapped = function (t) {
      if (mark === "**") return t.length > 4 && t.slice(0, 2) === "**" && t.slice(-2) === "**";
      return t.length > 2 && t.charAt(0) === "*" && t.slice(-1) === "*" && (t.slice(0, 2) !== "**" || t.slice(0, 3) === "***");
    };
    var parts = block.map(split), live = parts.filter(function (q, j) { return q[1] !== "" && !isDelim(block[j]); });
    if (!live.length) return;
    var undo = live.every(function (q) { return wrapped(q[1]); });
    var out = block.map(function (l, j) {
      var q = parts[j];
      if (q[1] === "" || isDelim(l)) return l;
      if (undo) return q[0] + q[1].slice(mark.length, q[1].length - mark.length) + q[2];
      return wrapped(q[1]) ? l : q[0] + mark + q[1] + mark + q[2];
    });
    p.applyLines(sp.from, sp.to, out, { range: true, a: sp.from, b: sp.to, line: sp.from, col: 0 });
  };
  /* Colour text: the selection, each line of a highlight, or (nothing selected) the line's text.
     Written as <span style="color:NAME">, which Obsidian also shows. Colouring coloured text
     switches its colour; name null removes colour. One undo step. */
  var COLOUR_SPAN = /<span style="color:\s*[#a-zA-Z0-9]+;?\s*">([^<\n]*)<\/span>/g;
  var colourWrap = function (text, name) {
    var plain = text.replace(COLOUR_SPAN, "$1");
    return name ? '<span style="color:' + name + '">' + plain + "</span>" : plain;
  };
  p.colourText = function (name) {
    if (!p.note()) return;
    var split = function (l) { var m = /^(\s*(?:#{1,6}\s+|>\s*|(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)?)(.*?)(\s*)$/.exec(l); return [m[1], m[2], m[3]]; };
    if (p.allSelected) {
      var sp = p.lineSpan(), block = p.lines.slice(sp.from, sp.to + 1);
      var out = block.map(function (l) { if (!l.trim() || isDelim(l)) return l; var q = split(l); return q[1] ? q[0] + colourWrap(q[1], name) + q[2] : l; });
      p.applyLines(sp.from, sp.to, out, { range: true, a: sp.from, b: sp.to, line: sp.from, col: 0 });
      return;
    }
    var i = p.activeLine;
    if (i === null || !p.ta) return;
    var raw = p.lines[i], s0 = p.ta.selectionStart, s1 = p.ta.selectionEnd, next, caret;
    if (s0 !== s1) {
      /* widen to whole colour spans the selection touches, so recolouring doesn't nest them */
      COLOUR_SPAN.lastIndex = 0; var mm;
      while ((mm = COLOUR_SPAN.exec(raw))) { var a = mm.index, z = a + mm[0].length; if (a < s1 && z > s0) { s0 = Math.min(s0, a); s1 = Math.max(s1, z); } }
      var mid = colourWrap(raw.slice(s0, s1), name);
      next = raw.slice(0, s0) + mid + raw.slice(s1); caret = s0 + mid.length;
    } else {
      var q = split(raw);
      if (!q[1]) return;
      var w = colourWrap(q[1], name);
      next = q[0] + w + q[2]; caret = q[0].length + w.length;
    }
    if (next === raw) return;
    histBreak(p);
    p.lines[i] = next;
    p.commit(true); p.rerenderLines(); p.setActive(i, caret); histBreak(p);
    markTyping();
  };
  /* Tab / Shift+Tab with lines highlighted: every highlighted line moves a level, as in VS Code.
     Tab skips blank lines; Shift+Tab takes off one tab character, or steps back to the previous
     indent stop; the same lines stay highlighted, and it is one undo step. */
  p.indentRange = function (out) {
    if (!p.allSelected || !p.note()) return;
    histBreak(p);
    var span0 = p.lineSpan(), from = span0.from, to = span0.to, changed = false;
    for (var j = from; j <= to; j++) {
      var raw = p.lines[j], unit = indentUnit(j), next = raw;
      if (out) {
        if (raw.charAt(0) === "\t") next = raw.slice(1);
        else { var lead = raw.match(/^ */)[0].length; if (lead) next = raw.slice(lead % unit.length || unit.length); }
      } else if (raw.trim() !== "" && !isDelim(raw)) next = unit + raw;
      if (next !== raw) { p.lines[j] = next; changed = true; }
    }
    if (!changed) return;
    p.commit(true);
    var keepA = p.selAnchor, keepF = p.selFocus;
    renderAllLines();
    p.selAnchor = keepA; p.selFocus = keepF;
    p.setRange(from, to);
    markTyping();
  };
  p.selectedText = function () {
    if (p.allSelected && p.selCols) {
      var R = p.selRange();
      if (R.from === R.to) return p.lines[R.from].slice(R.a, R.b);
      return [p.lines[R.from].slice(R.a)].concat(p.lines.slice(R.from + 1, R.to), [p.lines[R.to].slice(0, R.b)]).join("\n");
    }
    return p.allSelected ? p.lines.slice(p.selFrom, p.selTo + 1).join("\n") : "";
  };

  p.setActive = function (i, caret) {
    p.clearSelectAll();
    cancelBlur();
    if (p.activeLine === i && p.ta) {
      p.ta.setSelectionRange(caret, caret);
      p.ta.focus();
      return;
    }
    unmountActive();
    p.activeLine = i;
    p.caret = caret;
    mountActive(i);
  };

  p.deactivate = function () {
    p.clearCarets();
    if (p.activeLine === null) return;
    /* still focused? then this blur was caused by our own DOM swap - ignore it */
    if (p.ta && document.activeElement === p.ta) return;
    unmountActive();
  };

