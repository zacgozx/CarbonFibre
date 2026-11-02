  /* ---- focus tracking ---- */
  function focusThis() {
    if (focusedPane === p) return;
    focusedPane = p;
    panes.forEach(function (q) { q.root.classList.toggle("focused", q === p); });
    markSidebar();                                   /* the highlighted note follows focus */
  }
  p.focusThis = focusThis;
  col.addEventListener("mousedown", focusThis, true);
  col.addEventListener("focusin", focusThis);

  /* ---- typing indicator: solid while typing, pulsing when idle ---- */
  function markTyping() {
    if (!p.wrap) return;
    p.wrap.classList.add("typing");
    if (p.typingTimer) clearTimeout(p.typingTimer);
    p.typingTimer = setTimeout(function () {
      p.typingTimer = null;
      if (p.wrap) p.wrap.classList.remove("typing");
    }, 650);
  }

  /* ---- live view: incremental node management ---- */

  function nodeAt(i) { return p.linesEl.children[i]; }
  function indexOfNode(el) { return Array.prototype.indexOf.call(p.linesEl.children, el); }
  p.nodeAt = nodeAt;

  function cancelBlur() {
    if (p.blurTimer) { clearTimeout(p.blurTimer); p.blurTimer = null; }
  }

  function renderAllLines() {
    p.linesEl.innerHTML = "";
    var frag = document.createDocumentFragment();
    for (var j = 0; j < p.lines.length; j++) frag.appendChild(makeRenderedNode(p.lines[j], p.fmeta[j], j));
    p.linesEl.appendChild(frag);
    if (p.activeLine !== null && p.activeLine < p.lines.length) mountActive(p.activeLine);
    p.rawEnd = -1; p.tintLine = -1; paneTint(p, []);
    if (p.allSelected && p.selCols && p.selTo < p.lines.length) p.paintRange();
  }

  function indentUnit(i) { return p.fmeta[i] && p.fmeta[i].fence === "in" ? "    " : "  "; }

  function rerenderInactive() {
    for (var i = 0; i < p.lines.length; i++) {
      if (i === p.activeLine) continue;
      p.linesEl.replaceChild(makeRenderedNode(p.lines[i], p.fmeta[i], i), nodeAt(i));
    }
  }

  p.rerenderLines = function () { renderAllLines(); };
  function rerenderRange(a, b) {
    a = Math.max(0, a); b = Math.min(p.lines.length - 1, b);
    for (var j = a; j <= b; j++) {
      if (j === p.activeLine) continue;
      var nd = nodeAt(j);
      if (nd) p.linesEl.replaceChild(makeRenderedNode(p.lines[j], p.fmeta[j], j), nd);
    }
  }
  /* after a change on line i, refresh whichever table rows it did or now does belong to */
  function refreshTableAround(i, oldT) {
    var newT = p.fmeta[i] && p.fmeta[i].table;
    if (!oldT && !newT) return;
    var a = i - 1, b = i + 1;
    if (oldT) { a = Math.min(a, oldT.first); b = Math.max(b, oldT.last); }
    if (newT) { a = Math.min(a, newT.first); b = Math.max(b, newT.last); }
    rerenderRange(a, b);
  }

  function reindexChecks() {
    for (var i = 0; i < p.linesEl.children.length; i++) {
      var cb = p.linesEl.children[i].querySelector("[data-check]");
      if (cb) cb.dataset.check = i;
    }
  }

  function buildActiveNode(raw, fenceInfo) {
    var wrap = document.createElement("div");
    wrap.className = lineClass(raw, fenceInfo) + " ln-active";
    var stack = document.createElement("div");
    stack.className = "ta-stack";
    var hl = document.createElement("div");
    hl.className = "ta-hl";
    hl.setAttribute("aria-hidden", "true");
    hl.innerHTML = overlayHtml(raw, fenceInfo);
    var ta = document.createElement("textarea");
    ta.className = "line-ta";
    ta.rows = 1;
    ta.spellcheck = SPELLCHECK && !(fenceInfo && fenceInfo.fence);
    ta.value = raw;
    stack.appendChild(hl); stack.appendChild(ta);
    wrap.appendChild(stack);
    p.ta = ta; p.hl = hl; p.wrap = wrap;
    wireTextarea(ta, hl, wrap);
    return wrap;
  }

  function mountActive(i) {
    /* Replacing a focused node fires blur; cancel any pending deactivate so the
       newly mounted line is not torn down a tick later. */
    cancelBlur();
    var node = buildActiveNode(p.lines[i], p.fmeta[i]);
    p.linesEl.replaceChild(node, nodeAt(i));
    p.ta.focus();
    var pos = Math.min(p.caret, p.ta.value.length);
    p.ta.setSelectionRange(pos, pos);
    cancelBlur();
  }

  function unmountActive() {
    p.clearSelectAll();
    if (p.activeLine === null) return;
    var i = p.activeLine;
    if (i < p.linesEl.children.length && i < p.lines.length) {
      p.linesEl.replaceChild(makeRenderedNode(p.lines[i], p.fmeta[i], i), nodeAt(i));
    }
    p.activeLine = null;
    p.ta = p.hl = p.wrap = null;
  }

