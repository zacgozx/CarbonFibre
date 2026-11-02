  /* ---- extra cursors and column selection ----
     Extra carets are line + column pairs. Typing, Backspace and Delete are applied to
     every caret at once, from the bottom up so earlier edits don't shift later ones. */
  function charWidth() {
    return measureIn(p.ta || p.linesEl.querySelector(".ln") || p.editorEl, "M") || 8;
  }
  p.clearCarets = function () {
    if (!p.carets.length && !p.col) return;
    p.carets = []; p.col = null;
    var kids = p.linesEl.children;
    for (var i = 0; i < kids.length; i++) {
      kids[i].classList.remove("ln-ghost", "ln-colsel");
      kids[i].style.removeProperty("--ghost-x");
      kids[i].style.removeProperty("--col-x");
      kids[i].style.removeProperty("--col-w");
    }
  };
  p.paintCarets = function () {
    var kids = p.linesEl.children, cw = charWidth(), pad = 0;
    for (var i = 0; i < kids.length; i++) {
      kids[i].classList.remove("ln-ghost", "ln-colsel");
      kids[i].style.removeProperty("--ghost-x");
      kids[i].style.removeProperty("--col-x");
      kids[i].style.removeProperty("--col-w");
    }
    if (p.col) {
      var a = Math.min(p.col.c1, p.col.c2), b = Math.max(p.col.c1, p.col.c2);
      for (var r = Math.min(p.col.l1, p.col.l2); r <= Math.max(p.col.l1, p.col.l2); r++) {
        var nd = kids[r];
        if (!nd || r === p.activeLine) continue;
        nd.classList.add("ln-colsel");
        nd.style.setProperty("--col-x", (pad + a * cw) + "px");
        nd.style.setProperty("--col-w", Math.max(2, (b - a) * cw) + "px");
      }
      return;
    }
    p.carets.forEach(function (c) {
      var nd = kids[c.line];
      if (!nd || c.line === p.activeLine) return;
      nd.classList.add("ln-ghost");
      nd.style.setProperty("--ghost-x", (pad + Math.min(c.col, p.lines[c.line].length) * cw) + "px");
    });
  };
  p.addCaret = function (line, col) {
    if (line === p.activeLine) return;
    for (var i = 0; i < p.carets.length; i++) if (p.carets[i].line === line) { p.carets.splice(i, 1); p.paintCarets(); return; }
    p.carets.push({ line: line, col: col });
    p.carets.sort(function (a, b) { return a.line - b.line; });
    p.paintCarets();
  };
  /* build carets down a column, one per line in the block */
  p.setColumn = function (l1, c1, l2, c2) {
    p.col = { l1: l1, c1: c1, l2: l2, c2: c2 };
    p.carets = [];
    var from = Math.min(l1, l2), to = Math.max(l1, l2), a = Math.min(c1, c2);
    for (var r = from; r <= to; r++) if (r !== p.activeLine) p.carets.push({ line: r, col: Math.min(a, p.lines[r].length) });
    p.paintCarets();
  };
  /* apply an edit at every extra caret; fn(rawLine, col) -> [newLine, newCol] */
  p.editCarets = function (fn) {
    if (!p.carets.length) return;
    histBreak(p);
    var list = p.carets.slice().sort(function (a, b) { return b.line - a.line; });
    list.forEach(function (c) {
      var col = Math.min(c.col, p.lines[c.line].length);
      var res = fn(p.lines[c.line], col);
      if (!res) return;
      p.lines[c.line] = res[0];
      c.col = res[1];
    });
  };
  p.refreshCaretLines = function () {
    p.carets.forEach(function (c) {
      var nd = p.linesEl.children[c.line];
      if (nd && c.line !== p.activeLine) p.linesEl.replaceChild(makeRenderedNode(p.lines[c.line], p.fmeta[c.line], c.line), nd);
    });
    p.paintCarets();
  };

  p.selectAll = function () {
    if (!p.note()) return;
    if (p.mode !== "live") { p.srcEl.focus(); p.srcEl.select(); return; }
    if (p.activeLine === null) p.setActive(0, 0);
    p.selAnchor = 0; p.selFocus = p.lines.length - 1;
    p.setRange(0, p.lines.length - 1);
  };
  p.clearSelectAll = function () {
    p.clearCarets();
    if (!p.allSelected) return;
    p.allSelected = false; p.selCols = null;
    p.selFrom = p.selTo = p.selAnchor = p.selFocus = -1;
    p.paintRange();
  };
  /* replace the selected lines (typing/paste/delete over a multi-line selection) */
  p.replaceAll = function (text) {
    var n = p.note();
    if (!n) return;
    histBreak(p);
    var from = p.allSelected ? p.selFrom : 0, to = p.allSelected ? p.selTo : p.lines.length - 1, pre = "", post = "", caretAt = null;
    if (p.allSelected && p.selCols) {                  /* mid-line: keep what is outside the highlight */
      var R = p.selRange();
      from = R.from; to = R.to; pre = p.lines[from].slice(0, R.a); post = p.lines[to].slice(R.b);
    }
    p.clearSelectAll();
    cancelBlur();
    var fresh = String(text).split("\n");
    if (pre || post) { caretAt = (fresh.length === 1 ? pre.length : 0) + fresh[fresh.length - 1].length; fresh[0] = pre + fresh[0]; fresh[fresh.length - 1] += post; }
    Array.prototype.splice.apply(p.lines, [from, to - from + 1].concat(fresh));
    p.commit(true);
    p.activeLine = from + fresh.length - 1;
    p.caret = caretAt !== null ? caretAt : p.lines[p.activeLine].length;
    renderAllLines();
    markTyping();
  };
