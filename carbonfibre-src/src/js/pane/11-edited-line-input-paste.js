    ta.addEventListener("input", function () {
      var i = p.activeLine;
      histMark(p);
      /* Enter carries indentation forward inside a code block, so a closing ``` typed after
         an indented line came out as "    ```". Indented four spaces, markdown reads that as
         more code, not a fence: the block never closed and everything after it, headings
         included, was swallowed. Pull a closing fence back to the start of the line, the way
         an IDE dedents a closing brace. */
      var fmI = p.fmeta[i] || {};
      if (fmI.fence === "in" && /^[ \t]+```\s*$/.test(ta.value)) {
        var cut = ta.value.match(/^[ \t]+/)[0].length;
        var at = Math.max(0, ta.selectionStart - cut);
        ta.value = ta.value.slice(cut);
        ta.setSelectionRange(at, at);
      }
      var wasDelim = isDelim(p.lines[i]);
      var oldT = p.fmeta[i] && p.fmeta[i].table;
      var tableish = !!oldT || isRow(ta.value) || isRow(p.lines[i]);
      var wasText = p.lines[i];
      p.lines[i] = ta.value;
      /* a line becoming or stopping being a fence is structural; so is any edit to a fence
         line, because the text after the backticks is the block's language (editing
         "```rmaid" into "```mermaid" used to leave the old language showing) */
      var structural = wasDelim !== isDelim(ta.value) || (wasDelim && wasText !== ta.value);
      p.commit(structural || tableish);
      wrap.className = lineClass(ta.value, p.fmeta[i]) + " ln-active typing";
      hl.innerHTML = overlayHtml(ta.value, p.fmeta[i]);
      markTyping();
      if (structural) rerenderInactive();
      else if (tableish) refreshTableAround(i, oldT);
      acUpdate();
      /* mirror a single typed character to every extra caret */
      if (p.carets.length && ta.value.length === lastLen + 1) {
        var pos = ta.selectionStart - 1;
        var ch = ta.value.charAt(pos);
        if (ch && pos >= 0) {
          p.editCarets(function (raw2, col) { return [raw2.slice(0, col) + ch + raw2.slice(col), col + 1]; });
          p.commit(false);
          p.refreshCaretLines();
        }
      }
      lastLen = ta.value.length;
    });

    /* splice a block of markdown lines in at the caret */
    function pasteLines(parts) {
      histBreak(p);
      var i = p.activeLine;
      var raw = ta.value, s0 = ta.selectionStart, e0 = ta.selectionEnd;
      var before = raw.slice(0, s0), after = raw.slice(e0);
      var fresh = [before + parts[0]].concat(parts.slice(1));
      var lastIdx = fresh.length - 1;
      var caret = fresh[lastIdx].length;
      fresh[lastIdx] += after;
      Array.prototype.splice.apply(p.lines, [i, 1].concat(fresh));
      p.commit(true);
      p.activeLine = i + lastIdx;
      p.caret = caret;
      cancelBlur();
      renderAllLines();
      markTyping();
    }

    ta.addEventListener("paste", function (e) {
      var cd = e.clipboardData;
      if (!cd) return;
      var text = cd.getData("text/plain");

      /* an image goes to a file next to the note and comes back as an embed */
      var img = imageFromClipboard(cd);
      if (img) {
        e.preventDefault();
        if (state.backend !== "folder") { pasteLines(["<!-- paste images in folder mode to save them next to the note -->"]); return; }
        saveImageBeside(p, img).then(function (name) {
          pasteLines(["![](" + name + ")"]);
        }).catch(function (err) { alert("Couldn't save that image: " + err.message); });
        return;
      }

      /* Inside a code block the paste lands literally. On the opening ``` line itself,
         with the caret at the end, start the paste on the next line so the fence survives. */
      var fm = p.fmeta[p.activeLine] || {};
      var inFence = fm.fence === "in" || (fm.fence === "open" && ta.selectionStart === ta.value.length);
      if (fm.fence === "open" && inFence && text && !p.allSelected) {
        e.preventDefault();
        pasteLines([""].concat(text.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n")));
        return;
      }

      /* rich clipboard, spreadsheet block, or a URL over a selection */
      var conv = pasteToMarkdown(cd, ta.value.slice(ta.selectionStart, ta.selectionEnd), inFence);
      if (conv && conv.inline) {
        e.preventDefault();
        var rr = ta.value, ss = ta.selectionStart, ee = ta.selectionEnd;
        applyInline(rr.slice(0, ss) + conv.inline + rr.slice(ee), ss + conv.inline.length, ss + conv.inline.length);
        return;
      }
      if (conv && conv.lines) {
        e.preventDefault();
        if (p.allSelected) { p.replaceAll(conv.lines.join("\n")); return; }
        pasteLines(conv.lines);
        return;
      }

      if (p.allSelected) { e.preventDefault(); p.replaceAll((text || "").replace(/\r\n?/g, "\n")); return; }
      if (p.carets.length && text && text.indexOf("\n") === -1) {
        e.preventDefault();
        var here = ta.value, sa = ta.selectionStart, sb = ta.selectionEnd;
        applyInline(here.slice(0, sa) + text + here.slice(sb), sa + text.length, sa + text.length);
        p.editCarets(function (raw2, col) { return [raw2.slice(0, col) + text + raw2.slice(col), col + text.length]; });
        p.commit(false);
        p.refreshCaretLines();
        return;
      }
      if (!text || text.indexOf("\n") === -1 && text.indexOf("\r") === -1) return; /* single line: native */
      e.preventDefault();
      pasteLines(text.replace(/\r\n?/g, "\n").split("\n"));
    });

    ta.addEventListener("blur", function () {
      acClose();
      if (p.blurTimer) clearTimeout(p.blurTimer);
      p.blurTimer = setTimeout(function () { p.blurTimer = null; p.deactivate(); }, 0);
    });

