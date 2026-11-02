    ta.addEventListener("keydown", function (e) {
      var raw = ta.value;
      var s = ta.selectionStart, se = ta.selectionEnd;
      var mod = e.ctrlKey || e.metaKey;
      var i = p.activeLine;

      if (ac.el) {
        if (e.key === "ArrowDown") { e.preventDefault(); ac.idx = (ac.idx + 1) % ac.items.length; acRender(); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); ac.idx = (ac.idx - 1 + ac.items.length) % ac.items.length; acRender(); return; }
        if (e.key === "Tab" || e.key === "Enter") { e.preventDefault(); acAccept(); return; }
        if (e.key === "Escape") { e.preventDefault(); acClose(); return; }
      }

      if (e.key === "Escape" && p.carets.length) { e.preventDefault(); p.clearCarets(); return; }
      if (mod && e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        var step = e.key === "ArrowUp" ? -1 : 1;
        var edge = p.activeLine;
        p.carets.forEach(function (c) { edge = step < 0 ? Math.min(edge, c.line) : Math.max(edge, c.line); });
        var nl = edge + step;
        if (nl >= 0 && nl < p.lines.length) { p.col = null; p.addCaret(nl, s); }
        return;
      }
      if (p.carets.length && !mod && !e.altKey) {
        if (e.key === "Backspace" && s === se) {
          p.editCarets(function (raw2, col) { return col > 0 ? [raw2.slice(0, col - 1) + raw2.slice(col), col - 1] : null; });
          p.commit(false);
          setTimeout(function () { p.refreshCaretLines(); }, 0);
        } else if (e.key === "Delete" && s === se) {
          p.editCarets(function (raw2, col) { return col < raw2.length ? [raw2.slice(0, col) + raw2.slice(col + 1), col] : null; });
          p.commit(false);
          setTimeout(function () { p.refreshCaretLines(); }, 0);
        } else if (e.key === "Enter" || e.key === "Tab") {
          p.clearCarets();   /* line-structure changes would invalidate the caret lines */
        }
      }

      if (mod && e.key.toLowerCase() === "z") {   /* ours, not the textarea's line-local undo */
        e.preventDefault();
        if (e.shiftKey) histRedo(p); else histUndo(p);
        return;
      }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); histRedo(p); return; }
      if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); p.selectAll(); return; }
      /* line operations, VS Code / Obsidian keys: on the highlight, or the caret's line */
      if (e.altKey && !mod && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        if (e.shiftKey) p.dupLines(e.key === "ArrowUp" ? -1 : 1); else p.moveLines(e.key === "ArrowUp" ? -1 : 1);
        return;
      }
      if (mod && e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); p.deleteLines(); return; }
      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "l") { e.preventDefault(); p.selectLineStep(); return; }
      if (mod && !e.shiftKey && !e.altKey && e.key === "Enter") { e.preventDefault(); p.toggleTasks(); return; }
      if (mod && !e.altKey && (e.key === "]" || e.key === "[")) {
        e.preventDefault();
        if (p.allSelected) p.indentRange(e.key === "[");
        else ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: e.key === "[", bubbles: true, cancelable: true }));
        return;
      }
      if (p.allSelected && mod && !e.shiftKey && !e.altKey && (e.key.toLowerCase() === "b" || e.key.toLowerCase() === "i")) {
        e.preventDefault(); p.wrapLines(e.key.toLowerCase() === "b" ? "**" : "*"); return;
      }
      /* Shift+arrows extend from where the caret is, by line keeping the column, or by character
         across line ends; Shift+Home / Shift+End take the moving end to its line's edge */
      var ends = p.selEnds();
      var caretPos = ta.selectionDirection === "backward" ? s : se, anchorPos = ta.selectionDirection === "backward" ? se : s;
      if (e.shiftKey && !mod && !e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && p.lines.length > 1) {
        e.preventDefault();
        var E2 = ends || { aL: i, aC: anchorPos, fL: i, fC: caretPos };
        if (p.goalCol === null || !ends) p.goalCol = E2.fC;
        var toLine = E2.fL + (e.key === "ArrowUp" ? -1 : 1), toCol;
        if (toLine < 0) { toLine = 0; toCol = 0; } else if (toLine >= p.lines.length) { toLine = p.lines.length - 1; toCol = p.lines[toLine].length; }
        else toCol = Math.min(p.goalCol, p.lines[toLine].length);
        p.setPartial(E2.aL, E2.aC, toLine, toCol);
        p.keepVisible(toLine);                         /* the end you are moving stays on screen */
        return;
      }
      if (e.shiftKey && !mod && !e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        var left = e.key === "ArrowLeft";
        if (ends || (left && caretPos === 0 && i > 0) || (!left && caretPos === raw.length && i < p.lines.length - 1)) {
          e.preventDefault();
          var E3 = ends || { aL: i, aC: anchorPos, fL: i, fC: caretPos }, fl = E3.fL, fc = E3.fC + (left ? -1 : 1);
          if (fc < 0) { if (fl > 0) { fl--; fc = p.lines[fl].length; } else fc = 0; }
          else if (fc > p.lines[fl].length) { if (fl < p.lines.length - 1) { fl++; fc = 0; } else fc = p.lines[fl].length; }
          p.goalCol = null;
          p.setPartial(E3.aL, E3.aC, fl, fc);
          p.keepVisible(fl);
          return;
        }
      }
      if (ends && e.shiftKey && !mod && !e.altKey && (e.key === "Home" || e.key === "End")) {
        e.preventDefault();
        p.setPartial(ends.aL, ends.aC, ends.fL, e.key === "Home" ? 0 : p.lines[ends.fL].length);
        return;
      }
      if (p.allSelected) {
        var k = e.key.toLowerCase();
        if (mod && k === "c") { e.preventDefault(); copyRich(p.selectedText().split("\n")); return; }      /* formatted for Teams too */
        if (mod && k === "x") { e.preventDefault(); copyRich(p.selectedText().split("\n")); p.replaceAll(""); return; }
        if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); p.replaceAll(""); return; }
        if (e.key === "Enter") { e.preventDefault(); p.replaceAll("\n"); return; }
        if (!mod && !e.altKey && e.key.length === 1) { e.preventDefault(); p.replaceAll(e.key); return; }
        if (e.key === "Shift" || e.key === "Control" || e.key === "Meta" || e.key === "Alt") return;
        if (e.key === "Tab" && !mod && !e.altKey) { e.preventDefault(); p.indentRange(e.shiftKey); return; }   /* every highlighted line */
        /* paste keeps the highlight: the paste event that follows replaces the highlighted lines */
        if ((mod && k === "v") || (e.shiftKey && e.key === "Insert")) return;
        /* the app's own shortcuts (Alt+C, Ctrl+P, Ctrl+Alt+D...) keep the highlight for what they do with it */
        if (e.altKey || (mod && !/^(arrow|home|end|page)/i.test(e.key))) return;
        p.clearSelectAll(); /* any other key: drop the selection and handle normally */
      }

      /* autocorrect: fix the word just finished; the typed space/punctuation still lands after it */
      if (AUTOCORRECT_ON && !mod && !e.altKey && s === se && /^[ .,;:!?]$/.test(e.key) && !(p.fmeta[i] && p.fmeta[i].fence)) {
        var head = raw.slice(0, s);
        var wm = head.match(/(^|[^A-Za-z'])([A-Za-z']+)$/);
        if (wm && (head.split("`").length - 1) % 2 === 0) {   /* not inside `inline code` */
          var word = wm[2], fix = AUTOCORRECT[word.toLowerCase()];
          if (fix && fix !== word) {
            if (word.charAt(0) !== word.charAt(0).toLowerCase() && word.length > 1) fix = fix.charAt(0).toUpperCase() + fix.slice(1);
            var ws0 = s - word.length;
            applyInline(raw.slice(0, ws0) + fix + raw.slice(s), ws0 + fix.length, ws0 + fix.length);
            raw = ta.value; s = se = ta.selectionStart;
          }
        }
      }

      if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        var rb = wrapSelection(ta, "**", "**", "bold");
        applyInline(rb.next, rb.ns, rb.ne); return;
      }
      if (mod && e.key.toLowerCase() === "i") {
        e.preventDefault();
        var ri = wrapSelection(ta, "*", "*", "italic");
        applyInline(ri.next, ri.ns, ri.ne); return;
      }
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        var sel = raw.slice(s, se), nk, a, b;
        if (looksLikeUrl(sel)) {
          nk = raw.slice(0, s) + "[](" + sel + ")" + raw.slice(se);
          a = b = s + 1;
        } else {
          var label = sel || "link";
          nk = raw.slice(0, s) + "[" + label + "](url)" + raw.slice(se);
          a = s + label.length + 3; b = a + 3;
        }
        applyInline(nk, a, b); return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "s") {   /* table under the cursor -> sheet */
        e.preventDefault();
        if (!editTableAsSheet(p)) pushToastLike("Put the cursor inside a table first.");
        return;
      }
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); flushPersist(); return; }
      if (mod && e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        histBreak(p);
        var tbl = ["| Column | Column |", "| --- | --- |", "|  |  |"];
        var at = raw.trim() === "" ? i : i + 1;
        if (raw.trim() === "") p.lines.splice(i, 1);
        Array.prototype.splice.apply(p.lines, [at, 0].concat(tbl));
        p.commit(true);
        p.activeLine = at; p.caret = 2;
        cancelBlur();
        renderAllLines();
        if (p.ta) p.ta.setSelectionRange(2, 8);
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); ta.blur(); return; }

      var tmeta = p.fmeta[i] && p.fmeta[i].table;
      if (tmeta && e.key === "Tab") {
        e.preventDefault();
        var cellsT = splitCells(raw), ci = -1;
        for (var q = 0; q < cellsT.length; q++) {
          if (s >= cellsT[q].start && s <= cellsT[q].start + cellsT[q].text.length) { ci = q; }
        }
        if (ci === -1) ci = s < (cellsT[0] ? cellsT[0].start : 0) ? -1 : cellsT.length - 1;
        var target = ci + (e.shiftKey ? -1 : 1);
        if (target >= 0 && target < cellsT.length) {
          var cs = cellsT[target].start, ce = cs + cellsT[target].text.length;
          ta.setSelectionRange(cs, ce);
        } else if (!e.shiftKey && i < p.lines.length - 1 && p.fmeta[i + 1] && p.fmeta[i + 1].table) {
          var skip = p.fmeta[i + 1].table.role === "delim" ? 2 : 1;
          var ti = i + skip;
          if (ti < p.lines.length && p.fmeta[ti] && p.fmeta[ti].table) {
            var nc = splitCells(p.lines[ti]);
            p.setActive(ti, nc[0] ? nc[0].start : 2);
          }
        } else if (e.shiftKey && i > 0 && p.fmeta[i - 1] && p.fmeta[i - 1].table) {
          var pi = p.fmeta[i - 1].table.role === "delim" ? i - 2 : i - 1;
          if (pi >= 0) {
            var pc = splitCells(p.lines[pi]);
            var lastc = pc[pc.length - 1];
            p.setActive(pi, lastc ? lastc.start + lastc.text.length : p.lines[pi].length);
          }
        }
        return;
      }
      if (tmeta && tmeta.role !== "delim" && e.key === "Enter") {
        e.preventDefault();
        var emptyRow = splitCells(raw).every(function (c) { return c.text === ""; });
        if (emptyRow && tmeta.role === "body" && i === tmeta.last) {
          /* Enter on a trailing empty row leaves the table */
          p.lines[i] = "";
          p.lines.splice(i + 1, 0, "");
          p.commit(true);
          unmountActive();
          var ph0 = document.createElement("div");
          p.linesEl.insertBefore(ph0, nodeAt(i).nextSibling);
          p.activeLine = i + 1; p.caret = 0;
          mountActive(i + 1);
          rerenderInactive();
          return;
        }
        var blank = "|" + new Array(tmeta.cols + 1).join("  |");
        var insertAt = tmeta.role === "header" ? i + 2 : i + 1; /* header: skip past the delimiter row */
        if (insertAt > p.lines.length) insertAt = p.lines.length;
        p.lines.splice(insertAt, 0, blank);
        p.commit(true);
        unmountActive();
        var ph = document.createElement("div");
        p.linesEl.insertBefore(ph, nodeAt(insertAt - 1).nextSibling);
        p.activeLine = insertAt; p.caret = 2;
        mountActive(insertAt);
        reindexChecks();
        rerenderRange(p.fmeta[insertAt].table ? p.fmeta[insertAt].table.first : insertAt, p.fmeta[insertAt].table ? p.fmeta[insertAt].table.last : insertAt);
        markTyping();
        return;
      }

      /* Tab indents the whole line, wherever the caret is, and the caret keeps its place in
         the text; Shift+Tab takes one level off. One level is 4 spaces in code and 2 elsewhere:
         4 would turn an indented paragraph into a code block in markdown, Obsidian included.
         Fence lines are left alone, because an indented ``` stops being a fence. */
      if (e.key === "Tab") {
        e.preventDefault();
        if (isDelim(raw)) return;
        var unit = indentUnit(i);
        if (e.shiftKey) {
          var lead = raw.match(/^ */)[0].length;
          var removed = raw.charAt(0) === "\t" ? 1 : lead ? (lead % unit.length || unit.length) : 0;
          if (removed) applyInline(raw.slice(removed), Math.max(0, s - removed), Math.max(0, se - removed));
        } else {
          applyInline(unit + raw, s + unit.length, se + unit.length);
        }
        return;
      }
      /* Backspace inside the indentation removes a whole level, not one space */
      if (e.key === "Backspace" && s === se && s > 0 && /^ +$/.test(raw.slice(0, s))) {
        var u = indentUnit(i).length, back = s % u || u;
        e.preventDefault();
        applyInline(raw.slice(0, s - back) + raw.slice(s), s - back, s - back);
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        histBreak(p);
        var before = raw.slice(0, s), after = raw.slice(se), prefix = "";
        var inFenceE = p.fmeta[i] && p.fmeta[i].fence === "in";
        var lm = inFenceE ? null : raw.match(/^(\s*)([-*+]\s(?:\[( |x|X)\]\s)?|\d+\.\s)/);
        if (!lm) {
          /* code or indented text: carry the leading whitespace forward */
          var ws = raw.match(/^[ \t]*/)[0];
          if (s >= ws.length) {
            prefix = ws;
            /* opening brace / colon: one extra level, like an IDE */
            if (inFenceE && /[{(\[:]\s*$/.test(before)) prefix += "    ";
          }
        }
        if (lm) {
          var rest = raw.slice(lm[0].length).trim();
          if (rest === "" && after === "") { applyInline("", 0, 0); return; }
          if (/\d+\./.test(lm[2])) prefix = lm[1] + (parseInt(lm[2], 10) + 1) + ". ";
          else if (lm[3] !== undefined) prefix = lm[1] + "- [ ] ";
          else prefix = lm[0];
        }
        var touched = isDelim(raw) || isDelim(before) || isDelim(prefix + after) || isRow(raw) || isRow(before) || isRow(prefix + after);
        p.lines.splice(i, 1, before, prefix + after);
        p.commit(true);
        unmountActive();
        var placeholder = document.createElement("div");
        p.linesEl.insertBefore(placeholder, nodeAt(i).nextSibling);
        p.activeLine = i + 1;
        p.caret = prefix.length;
        mountActive(i + 1);
        reindexChecks();
        if (touched) rerenderInactive();
        markTyping();
        return;
      }

      if (e.key === "Backspace" && s === 0 && se === 0 && i > 0) {
        e.preventDefault();
        histBreak(p);
        var prevRaw = p.lines[i - 1];
        var touchedB = isDelim(raw) || isDelim(prevRaw) || isRow(raw) || isRow(prevRaw);
        p.lines.splice(i - 1, 2, prevRaw + raw);
        p.commit(true);
        unmountActive();
        p.linesEl.removeChild(nodeAt(i));
        p.activeLine = i - 1;
        p.caret = prevRaw.length;
        mountActive(i - 1);
        reindexChecks();
        if (touchedB) rerenderInactive();
        markTyping();
        return;
      }

      if (e.key === "Delete" && s === raw.length && se === raw.length && i < p.lines.length - 1) {
        e.preventDefault();
        histBreak(p);
        var nextRaw = p.lines[i + 1];
        var touchedD = isDelim(raw) || isDelim(nextRaw) || isRow(raw) || isRow(nextRaw);
        p.lines.splice(i, 2, raw + nextRaw);
        p.commit(true);
        p.linesEl.removeChild(nodeAt(i + 1));
        ta.value = p.lines[i];
        ta.setSelectionRange(raw.length, raw.length);
        wrap.className = lineClass(p.lines[i], p.fmeta[i]) + " ln-active typing";
        hl.innerHTML = overlayHtml(p.lines[i], p.fmeta[i]);
        reindexChecks();
        if (touchedD) rerenderInactive();
        markTyping();
        return;
      }

      if (e.key === "ArrowUp" && i > 0) {
        e.preventDefault();
        if (p.goalCol === null) p.goalCol = s;
        p.setActive(i - 1, Math.min(p.goalCol, p.lines[i - 1].length)); p.keepVisible(i - 1); return;
      }
      if (e.key === "ArrowDown" && i < p.lines.length - 1) {
        e.preventDefault();
        if (p.goalCol === null) p.goalCol = s;
        p.setActive(i + 1, Math.min(p.goalCol, p.lines[i + 1].length)); p.keepVisible(i + 1); return;
      }
      if (e.key === "ArrowLeft" && s === 0 && se === 0 && i > 0) {
        e.preventDefault(); p.goalCol = null;
        p.setActive(i - 1, p.lines[i - 1].length); p.keepVisible(i - 1); return;
      }
      if (e.key === "ArrowRight" && s === raw.length && se === raw.length && i < p.lines.length - 1) {
        e.preventDefault(); p.goalCol = null;
        p.setActive(i + 1, 0); p.keepVisible(i + 1); return;
      }
      /* Page Up / Page Down: a screen at a time, keeping the column, the view following
         (with Shift, the highlight grows by a screen) */
      if ((e.key === "PageDown" || e.key === "PageUp") && !mod) {
        e.preventDefault();
        var sc = p.editorEl, lh = (wrap.getBoundingClientRect().height || 24), screen = Math.max(1, Math.floor((sc ? sc.clientHeight : 600) / lh) - 3);
        var dir = e.key === "PageDown" ? 1 : -1;
        if (e.shiftKey) {
          if (!p.allSelected) { p.selAnchor = i; p.selFocus = i; }
          p.selFocus = Math.max(0, Math.min(p.lines.length - 1, p.selFocus + dir * screen));
          if (p.selFocus === p.selAnchor) p.clearSelectAll(); else p.setRange(p.selAnchor, p.selFocus);
          p.keepVisible(p.selFocus);
          return;
        }
        if (p.goalCol === null) p.goalCol = s;
        var to = Math.max(0, Math.min(p.lines.length - 1, i + dir * screen));
        if (sc) sc.scrollTop += dir * screen * lh;
        p.setActive(to, Math.min(p.goalCol, p.lines[to].length)); p.keepVisible(to);
        return;
      }
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "PageUp" && e.key !== "PageDown") p.goalCol = null;
    });
  }

