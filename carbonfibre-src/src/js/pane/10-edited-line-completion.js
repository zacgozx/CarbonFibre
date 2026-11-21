  function wireTextarea(ta, hl, wrap) {
    /* apply a new value for the active line and refresh its overlay */
    function applyInline(next, ns, ne) {
      const i = p.activeLine;
      const wasD = isDelim(p.lines[i]);
      const oldT = p.fmeta[i] && p.fmeta[i].table;
      const tableish = !!oldT || isRow(next) || isRow(p.lines[i]);
      p.lines[i] = next;
      p.commit(wasD !== isDelim(next) || tableish);
      ta.value = next;
      ta.setSelectionRange(ns, ne);
      wrap.className = lineClass(next, p.fmeta[i]) + " ln-active typing";
      hl.innerHTML = overlayHtml(next, p.fmeta[i]);
      markTyping();
      if (tableish) refreshTableAround(i, oldT);
    }

    /* ---- completion popup ----
       [[ offers note titles, a word of 3+ letters offers words from the vault (Complete.rank), "/" at
       the start of a word offers snippets. Tab picks; Enter picks only a [[link]] or a choice you moved
       to with the arrow keys, otherwise it starts a new line as usual. The best word also shows faintly
       after the caret (at the end of the line). */
    const ac = { el: null, items: [], idx: 0, start: 0, kind: "", nav: false, typed: "" };
    const acId = "ac" + Math.random().toString(36).slice(2, 8);
    function acGhostOff() { const g = hl.querySelector(".ac-ghost"); if (g) g.remove(); }
    function acClose() {
      if (ac.el) { ac.el.remove(); ac.el = null; }
      ac.items = []; ac.nav = false;
      acGhostOff();
      ta.removeAttribute("aria-activedescendant"); ta.removeAttribute("aria-controls");
    }
    function acCandidates() {
      const raw = ta.value, s = ta.selectionStart;
      if (s !== ta.selectionEnd) return null;
      const before = raw.slice(0, s);
      let m = before.match(/\[\[([^\[\]]*)$/);
      if (m) {
        const q = m[1];
        const titles = q
          ? Complete.rank(q, state.notes.map(function (n) { return n.title; }), 8, true)
          : state.notes.toSorted(function (a, b) { return noteStamp(b) - noteStamp(a); }).slice(0, 8).map(function (n) { return { word: n.title, hits: [] }; });
        return titles.length ? { kind: "link", start: s - q.length, typed: q, items: titles } : null;
      }
      if (p.fmeta[p.activeLine] && p.fmeta[p.activeLine].fence) return null;
      if ((before.split("`").length - 1) % 2 === 1) return null;            /* inside `inline code` */
      m = before.match(/(^|\s)\/([a-z0-9]*)$/i);
      if (m) {
        const atStart = /^\s*$/.test(before.slice(0, before.length - m[2].length - 1));
        const sn = Complete.snippets(m[2]).filter(function (x) { return atStart || !x.lineStart; });
        return sn.length ? { kind: "snippet", start: s - m[2].length - 1, typed: m[2], items: sn.map(function (x) { return { word: "/" + x.key, snip: x, hits: [] }; }) } : null;
      }
      m = before.match(/(^|[^A-Za-z0-9_-])([A-Za-z][A-Za-z0-9_-]{2,})$/);
      if (!m) return null;
      const w = m[2];
      const words = Complete.rank(w, vocabulary(), 6);
      return words.length ? { kind: "word", start: s - w.length, typed: w, items: words } : null;
    }
    /* the matched letters in bold */
    function acLabel(it) {
      if (!it.hits.length) return esc(it.word);
      const on = new Set(it.hits);
      let h = "";
      for (let k = 0; k < it.word.length; k++) h += on.has(k) ? "<b>" + esc(it.word.charAt(k)) + "</b>" : esc(it.word.charAt(k));
      return h;
    }
    function acRender() {
      ac.el.innerHTML = ac.items.map(function (it, k) {
        const extra = it.snip ? '<span class="ac-sub">' + esc(it.snip.label) + " · " + esc(it.snip.text().trim() || it.snip.text()) + "</span>" : "";
        return '<div class="ac-item' + (k === ac.idx ? " on" : "") + '" role="option" id="' + acId + "-" + k + '" aria-selected="' + (k === ac.idx) + '" data-i="' + k + '">' +
          '<span class="ac-word">' + acLabel(it) + "</span>" + extra + "</div>";
      }).join("") + '<div class="ac-hint" aria-hidden="true"><kbd>Tab</kbd> pick' + (ac.kind === "link" ? " · <kbd>Enter</kbd> pick" : "") + " · <kbd>Esc</kbd> close</div>";
      ta.setAttribute("aria-activedescendant", acId + "-" + ac.idx);
      acGhost();
    }
    /* the rest of the highlighted word, faintly after the caret, when the caret is at the end of the line */
    function acGhost() {
      acGhostOff();
      const it = ac.items[ac.idx];
      if (!it || ac.kind === "snippet" || ta.selectionStart !== ta.value.length) return;
      if (it.word.toLowerCase().indexOf(ac.typed.toLowerCase()) !== 0) return;
      const rest = it.word.slice(ac.typed.length);
      if (!rest) return;
      const g = document.createElement("span");
      g.className = "ac-ghost"; g.setAttribute("aria-hidden", "true");
      g.textContent = rest;
      hl.appendChild(g);
    }
    function acCaretX() {
      return Math.max(0, Math.min(measureIn(ta, ta.value.slice(0, ac.start)), wrap.clientWidth - 200));
    }
    function acUpdate() {
      if (!COMPLETE_ON) return;
      const c = acCandidates();
      if (!c) { acClose(); return; }
      ac.items = c.items; ac.start = c.start; ac.kind = c.kind; ac.typed = c.typed; ac.idx = 0; ac.nav = false;
      if (!ac.el) {
        ac.el = document.createElement("div");
        ac.el.className = "ac"; ac.el.id = acId; ac.el.setAttribute("role", "listbox");
        ac.el.addEventListener("mousedown", function (e) {
          e.preventDefault();
          const it = e.target.closest(".ac-item");
          if (it) { ac.idx = parseInt(it.dataset.i, 10); acAccept(); }
        });
        wrap.appendChild(ac.el);
      }
      ta.setAttribute("aria-controls", acId);
      ac.el.style.left = acCaretX() + "px";
      acRender();
      acPlace();
    }
    /* below the line, or above it when the editor has no room below (the panel under the editor
       would cover it); a long list scrolls */
    function acPlace() {
      const box = (p.editorEl || wrap).getBoundingClientRect(), line = wrap.getBoundingClientRect();
      ac.el.classList.remove("ac-up");
      ac.el.style.maxHeight = "";
      const below = box.bottom - line.bottom - 8, above = line.top - box.top - 8, h = ac.el.offsetHeight;
      if (h > below && above > below) { ac.el.classList.add("ac-up"); ac.el.style.maxHeight = Math.max(80, above) + "px"; }
      else if (h > below) ac.el.style.maxHeight = Math.max(80, below) + "px";
    }
    function acMove(step) {
      ac.idx = (ac.idx + step + ac.items.length) % ac.items.length;
      ac.nav = true;
      acRender();
      const on = ac.el.querySelector(".ac-item.on");
      if (on) on.scrollIntoView({ block: "nearest" });
    }
    function acAccept() {
      if (!ac.el) return;
      const raw = ta.value, s = ta.selectionStart, it = ac.items[ac.idx];
      const after = raw.slice(s);
      let ins;
      if (ac.kind === "link") ins = it.word + (after.indexOf("]]") === 0 ? "" : "]]");
      else if (ac.kind === "snippet") ins = it.snip.text();
      else { ins = it.word; Complete.remember(it.word); }
      const from = ac.start;
      const next = raw.slice(0, from) + ins + after, pos = from + ins.length;
      acClose();
      applyInline(next, pos, pos);
      if (ac.kind === "snippet" && it.snip.run) it.snip.run(p);
    }
    ta.addEventListener("mousedown", function () { acClose(); });   /* the caret moves: the popup was for where it was */

    let lastLen = ta.value.length;
