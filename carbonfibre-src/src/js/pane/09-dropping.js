  /* Dropping text: over a highlighted range it replaces the range (one undo step), as typing
     and pasting do; otherwise it goes in where it is dropped. Web or Office content is turned
     into markdown the same way a paste is. Files keep their usual handling. */
  var hasText = function (dt) { return dt && Array.prototype.indexOf.call(dt.types || [], "text/plain") !== -1 || dt && Array.prototype.indexOf.call(dt.types || [], "text/html") !== -1; };
  p.editorEl.addEventListener("dragover", function (e) {
    if (p.mode !== "live" || !p.note() || !hasText(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, true);
  p.editorEl.addEventListener("dragover", function (e) {
    if (Array.prototype.indexOf.call(e.dataTransfer.types, "text/x-cf-sketch") !== -1) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }
  });
  p.editorEl.addEventListener("drop", function (e) {
    var skPath = e.dataTransfer && e.dataTransfer.getData("text/x-cf-sketch");
    if (skPath) {                                        /* a drawing from the sketch library: embed it here */
      e.preventDefault(); e.stopPropagation();
      var atPt = document.elementFromPoint(e.clientX, e.clientY), ln = atPt && atPt.closest(".editor-inner > div");
      noteInsertSketchEmbed(p, skPath, ln && ln.parentNode === p.linesEl ? indexOfNode(ln) : null);
      return;
    }
    var dt = e.dataTransfer;
    if (p.mode !== "live" || !p.note() || !hasText(dt)) return;
    e.preventDefault(); e.stopPropagation();
    var conv = null;
    try { conv = pasteToMarkdown(dt, "", false); } catch (err) { conv = null; }
    var text = conv && conv.lines ? conv.lines.join("\n") : conv && conv.inline ? conv.inline : (dt.getData("text/plain") || "").replace(/\r\n?/g, "\n");
    if (!text) return;
    if (p.allSelected) { p.replaceAll(text); return; }
    /* where it was dropped: the line under the pointer and the spot in it */
    var under = document.elementFromPoint(e.clientX, e.clientY);
    var el = under && under.closest(".editor-inner > div"), idx, col;
    if (el && el.parentNode === p.linesEl) {
      idx = indexOfNode(el);
      col = idx === p.activeLine && p.ta && p.ta.contains(under) ? p.ta.selectionStart : rawCaretFromClick(p.lines[idx], p.fmeta[idx], el, e.clientX, e.clientY);
    } else { idx = p.lines.length - 1; col = p.lines[idx].length; }
    p.sync();
    histBreak(p);
    var line = p.lines[idx], parts = text.split("\n");
    var last = parts.length - 1, tail = line.slice(col);
    parts[0] = line.slice(0, col) + parts[0];
    var caretCol = parts[last].length;
    parts[last] = parts[last] + tail;
    Array.prototype.splice.apply(p.lines, [idx, 1].concat(parts));
    p.commit(true);
    p.activeLine = null;
    renderAllLines();
    p.setActive(idx + last, caretCol);
    histBreak(p);
    markTyping();
  }, true);

