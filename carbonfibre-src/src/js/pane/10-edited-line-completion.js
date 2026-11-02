  function wireTextarea(ta, hl, wrap) {
    /* apply a new value for the active line and refresh its overlay */
    function applyInline(next, ns, ne) {
      var i = p.activeLine;
      var wasD = isDelim(p.lines[i]);
      var oldT = p.fmeta[i] && p.fmeta[i].table;
      var tableish = !!oldT || isRow(next) || isRow(p.lines[i]);
      p.lines[i] = next;
      p.commit(wasD !== isDelim(next) || tableish);
      ta.value = next;
      ta.setSelectionRange(ns, ne);
      wrap.className = lineClass(next, p.fmeta[i]) + " ln-active typing";
      hl.innerHTML = overlayHtml(next, p.fmeta[i]);
      markTyping();
      if (tableish) refreshTableAround(i, oldT);
    }

    /* ---- completion popup ---- */
    var ac = { el: null, items: [], idx: 0, start: 0, kind: "" };
    function acClose() { if (ac.el) { ac.el.remove(); ac.el = null; } ac.items = []; }
    function acCandidates() {
      var raw = ta.value, s = ta.selectionStart;
      if (s !== ta.selectionEnd) return null;
      var before = raw.slice(0, s);
      var m = before.match(/\[\[([^\[\]]*)$/);
      if (m) {
        var q = m[1].toLowerCase();
        var titles = state.notes.map(function (n) { return n.title; })
          .filter(function (t) { return t.toLowerCase().indexOf(q) !== -1; })
          .sort(function (a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); });
        return titles.length ? { kind: "link", start: s - m[1].length, items: titles.slice(0, 8) } : null;
      }
      if (p.fmeta[p.activeLine] && p.fmeta[p.activeLine].fence) return null;
      m = before.match(/[A-Za-z][A-Za-z0-9_-]{2,}$/);
      if (!m) return null;
      var w = m[0], wl = w.toLowerCase();
      var words = vocabulary().filter(function (v) { return v.length > w.length && v.toLowerCase().indexOf(wl) === 0; }).slice(0, 6);
      return words.length ? { kind: "word", start: s - w.length, items: words } : null;
    }
    function acRender() {
      ac.el.innerHTML = ac.items.map(function (t, k) {
        return '<div class="ac-item' + (k === ac.idx ? " on" : "") + '" data-i="' + k + '">' + esc(t) + "</div>";
      }).join("");
    }
    function acCaretX() {
      return Math.max(0, Math.min(measureIn(ta, ta.value.slice(0, ac.start)), wrap.clientWidth - 200));
    }
    function acUpdate() {
      if (!COMPLETE_ON) return;
      var c = acCandidates();
      if (!c) { acClose(); return; }
      ac.items = c.items; ac.start = c.start; ac.kind = c.kind; ac.idx = 0;
      if (!ac.el) {
        ac.el = document.createElement("div");
        ac.el.className = "ac";
        ac.el.addEventListener("mousedown", function (e) {
          e.preventDefault();
          var it = e.target.closest(".ac-item");
          if (it) { ac.idx = parseInt(it.dataset.i, 10); acAccept(); }
        });
        wrap.appendChild(ac.el);
      }
      ac.el.style.left = acCaretX() + "px";
      acRender();
    }
    function acAccept() {
      if (!ac.el) return;
      var raw = ta.value, s = ta.selectionStart, pick = ac.items[ac.idx];
      var after = raw.slice(s);
      var ins = ac.kind === "link" ? pick + (after.indexOf("]]") === 0 ? "" : "]]") : pick;
      var next = raw.slice(0, ac.start) + ins + after, pos = ac.start + ins.length;
      acClose();
      applyInline(next, pos, pos);
    }

    var lastLen = ta.value.length;
