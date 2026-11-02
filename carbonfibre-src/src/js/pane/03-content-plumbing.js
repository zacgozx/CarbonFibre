  /* ---- content plumbing ---- */

  p.note = function () { return findNote(p.noteId); };

  p.sync = function () {
    if (!p.stale) return;
    var n = p.note();
    if (n) n.content = p.lines.join("\n");
    p.stale = false;
  };

  p.reload = function () {
    var n = p.note();
    p.lines = n ? n.content.split("\n") : [];
    p.fmeta = computeFenceMeta(p.lines);
    p.stale = false;
  };

  /* structural = line count changed or a ``` delimiter appeared/vanished */
  p.commit = function (structural) {
    var n = p.note();
    if (!n) return;
    p.stale = true;
    if (structural) p.fmeta = computeFenceMeta(p.lines);
    markDirty(n);
    refreshSearchIfActive();
    scheduleMirror(p, n.id);
  };

  p.open = function (id) {
    if (p.type === "sketch") skReleasePane(p);          /* otherwise the old drawing stays on screen */
    else if (p.type === "sheet") {
      flushSheets();
      p.type = "note"; p.sheetId = null;
      if (p.grid) p.grid.root.classList.remove("show");
    }
    else if (p.type === "taskboard") { p.type = "note"; if (p.tbRoot) p.tbRoot.classList.remove("show"); }
    p.sync();
    p.deactivate();
    if (id != null && !findNote(id)) id = null;
    if (id != null && !p.tabs.some(function (t) { return sameId(t, id); })) p.tabs.push(id);
    p.noteId = id;
    p.reload();
    p.render();
    markSidebar();
    scheduleSession();
  };

  p.closeTab = function (id) {
    var idx = -1;
    for (var k = 0; k < p.tabs.length; k++) if (sameId(p.tabs[k], id)) { idx = k; break; }
    if (idx === -1) return;
    p.sync();
    p.tabs.splice(idx, 1);
    if (sameId(p.noteId, id)) {
      var next = p.tabs.length ? p.tabs[Math.min(idx, p.tabs.length - 1)] : null;
      p.deactivate();
      p.noteId = next;
      p.reload();
    }
    if (!p.tabs.length && panes.length > 1) { closePane(p); return; }
    p.render();
    markSidebar();
    scheduleSession();
  };

  p.cycleTab = function (dir) {
    if (p.tabs.length < 2) return;
    var idx = 0;
    for (var k = 0; k < p.tabs.length; k++) if (sameId(p.tabs[k], p.noteId)) idx = k;
    p.open(p.tabs[(idx + dir + p.tabs.length) % p.tabs.length]);
  };

  var isTabDrag = function (e) { return Array.prototype.indexOf.call(e.dataTransfer.types, "text/x-cf-tab") !== -1; };
  /* where in this bar a tab would land: before the first tab whose middle is right of the pointer */
  var tabDropIndex = function (x) {
    var tabsHere = Array.prototype.filter.call(p.tabsEl.querySelectorAll(".tab[data-id]"), function (el) { return !el.classList.contains("dragging") || true; });
    for (var k = 0; k < tabsHere.length; k++) { var r = tabsHere[k].getBoundingClientRect(); if (x < r.left + r.width / 2) return { at: k, el: tabsHere[k], before: true }; }
    return { at: tabsHere.length, el: tabsHere[tabsHere.length - 1] || null, before: false };
  };
  p.tabsEl.addEventListener("dragover", function (e) {
    if (!isTabDrag(e)) return;
    e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move";
    clearTabDropMarks();
    var d = tabDropIndex(e.clientX);
    if (d.el) d.el.classList.add(d.before ? "drop-before" : "drop-after"); else p.tabsEl.classList.add("drop-into");
  });
  p.tabsEl.addEventListener("dragleave", function (e) { if (!p.tabsEl.contains(e.relatedTarget)) clearTabDropMarks(); });
  p.tabsEl.addEventListener("drop", function (e) {
    if (!isTabDrag(e)) return;
    e.preventDefault(); e.stopPropagation();
    var info = JSON.parse(e.dataTransfer.getData("text/x-cf-tab") || "{}"), d = tabDropIndex(e.clientX);
    clearTabDropMarks();
    var src = panes[info.pane];
    if (src) moveTab(src, info.id, p, d.at);
  });
  col.addEventListener("dragover", function (e) {
    if (!isTabDrag(e) || p.tabsEl.contains(e.target)) return;
    e.preventDefault(); e.dataTransfer.dropEffect = "move";
    clearTabDropMarks(); col.classList.add("tab-drop-on");
  });
  col.addEventListener("dragleave", function (e) { if (!col.contains(e.relatedTarget)) col.classList.remove("tab-drop-on"); });
  col.addEventListener("drop", function (e) {
    if (!isTabDrag(e) || p.tabsEl.contains(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    col.classList.remove("tab-drop-on");
    var info = JSON.parse(e.dataTransfer.getData("text/x-cf-tab") || "{}"), src = panes[info.pane];
    if (src && src !== p) moveTab(src, info.id, p, p.tabs.length);
  });
  p.renderTabs = function () {
    tabTreeSoon();
    p.tabsEl.innerHTML = "";
    if (p.type === "taskboard" || p.type === "sheet") {   /* the board's or sheet's own tab: closing it goes back to the note */
      var isSheet = p.type === "sheet", shObj = isSheet && findSheet(p.sheetId);
      var bt = document.createElement("div");
      bt.className = "tab on tab-board";
      var bl = document.createElement("span");
      bl.className = "tab-lbl";
      if (isSheet) bl.innerHTML = ico("table");
      bl.appendChild(document.createTextNode((isSheet ? " " + (shObj ? shObj.title : "Sheet") : tb.view === "notes" ? "Notes" : "Task board")));
      var bx = document.createElement("button");
      bx.className = "tab-x"; bx.innerHTML = ico("x"); bx.title = isSheet ? "Close the sheet" : "Close the task board";
      bx.addEventListener("mousedown", function (e) { e.stopPropagation(); });
      bx.addEventListener("click", function (e) { e.stopPropagation(); if (isSheet) closeSheetPane(p); else tbClosePane(p); });
      bt.appendChild(bl); bt.appendChild(bx);
      p.tabsEl.appendChild(bt);
    }
    if (!p.tabs.length) {
      var e = document.createElement("div");
      e.className = "tabs-empty";
      e.textContent = "No tabs \u2014 pick a note";
      p.tabsEl.appendChild(e);
      return;
    }
    p.tabs.forEach(function (id) {
      var n = findNote(id);
      if (!n) return;
      var t = document.createElement("div");
      t.className = "tab" + (sameId(id, p.noteId) && p.type === "note" ? " on" : "");
      var lbl = document.createElement("span");
      lbl.className = "tab-lbl";
      lbl.textContent = n.title;
      lbl.title = n.path || n.title;
      var x = document.createElement("button");
      x.className = "tab-x";
      x.innerHTML = ico("x");
      x.title = "Close tab";
      x.addEventListener("mousedown", function (e) { e.stopPropagation(); });
      x.addEventListener("click", function (e) { e.stopPropagation(); p.closeTab(id); });
      t.addEventListener("mousedown", function (e) {
        if (e.button === 1) { e.preventDefault(); p.closeTab(id); return; }
        if (e.button === 2) return;                       /* right-click: the tab's menu */
        focusThis();
        if (!sameId(id, p.noteId)) p.open(id);
      });
      /* drag a tab along its bar to reorder it, or onto another pane to move it there */
      t.draggable = true; t.dataset.id = String(id);
      t.addEventListener("dragstart", function (e) {
        e.dataTransfer.setData("text/x-cf-tab", JSON.stringify({ pane: panes.indexOf(p), id: String(id) }));
        e.dataTransfer.effectAllowed = "move";
        t.classList.add("dragging");
        document.body.classList.add("tab-dragging");
      });
      t.addEventListener("dragend", function () { t.classList.remove("dragging"); document.body.classList.remove("tab-dragging"); clearTabDropMarks(); });
      t.addEventListener("contextmenu", function (e) { e.preventDefault(); tabMenu(p, id, e.clientX, e.clientY); });
      t.appendChild(lbl); t.appendChild(x);
      p.tabsEl.appendChild(t);
    });
    /* scroll the strip itself, only when the active tab is out of sight: scrollIntoView
       could force a layout of the whole page, and scroll its parents too */
    var on = p.tabsEl.querySelector(".tab.on"), strip = p.tabsEl;
    if (on) {
      var sr = strip.getBoundingClientRect(), tr = on.getBoundingClientRect();
      var left = tr.left - sr.left + strip.scrollLeft, right = left + tr.width;
      if (left < strip.scrollLeft) strip.scrollLeft = left;
      else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth;
    }
  };

