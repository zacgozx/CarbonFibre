  /* ---- content plumbing ---- */

  p.note = function () { return findNote(p.noteId); };

  p.sync = function () {
    if (!p.stale) return;
    const n = p.note();
    if (n) n.content = p.lines.join("\n");
    p.stale = false;
  };

  p.reload = function () {
    const n = p.note();
    p.lines = n ? n.content.split("\n") : [];
    p.fmeta = computeFenceMeta(p.lines);
    p.stale = false;
  };

  /* structural = line count changed or a ``` delimiter appeared/vanished */
  p.commit = function (structural) {
    const n = p.note();
    if (!n) return;
    p.stale = true;
    if (structural) p.fmeta = computeFenceMeta(p.lines);
    markDirty(n);
    refreshSearchIfActive();
    scheduleMirror(p, n.id);
  };

  p.open = function (id) {
    leavePaneContent(p);                                /* a sheet, the board, a drawing or the graph: put away first */
    p.sync();
    p.deactivate();
    if (id != null && !findNote(id)) id = null;
    if (id != null && !p.tabs.some(function (t) { return sameId(t, id); })) p.tabs.push(id);
    p.noteId = id;
    p.reload();
    p.render();
    markSidebar();
    scheduleSession();
    PluginHost.fileOpened(p);
  };

  p.closeTab = function (id) {
    let idx = -1;
    for (let k = 0; k < p.tabs.length; k++) if (sameId(p.tabs[k], id)) { idx = k; break; }
    if (idx === -1) return;
    p.sync();
    p.tabs.splice(idx, 1);
    if (sameId(p.noteId, id)) {
      const next = p.tabs.length ? p.tabs[Math.min(idx, p.tabs.length - 1)] : null;
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
    let idx = 0;
    for (let k = 0; k < p.tabs.length; k++) if (sameId(p.tabs[k], p.noteId)) idx = k;
    p.open(p.tabs[(idx + dir + p.tabs.length) % p.tabs.length]);
  };

  const isTabDrag = function (e) { return Array.prototype.indexOf.call(e.dataTransfer.types, "text/x-cf-tab") !== -1; };
  /* where in this bar a tab would land: before the first tab whose middle is right of the pointer */
  const tabDropIndex = function (x) {
    const tabsHere = Array.prototype.filter.call(p.tabsEl.querySelectorAll(".tab[data-id]"), function (el) { return !el.classList.contains("dragging") || true; });
    for (let k = 0; k < tabsHere.length; k++) { const r = tabsHere[k].getBoundingClientRect(); if (x < r.left + r.width / 2) return { at: k, el: tabsHere[k], before: true }; }
    return { at: tabsHere.length, el: tabsHere[tabsHere.length - 1] || null, before: false };
  };
  p.tabsEl.addEventListener("dragover", function (e) {
    if (!isTabDrag(e)) return;
    e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move";
    clearTabDropMarks();
    const d = tabDropIndex(e.clientX);
    if (d.el) d.el.classList.add(d.before ? "drop-before" : "drop-after"); else p.tabsEl.classList.add("drop-into");
  });
  p.tabsEl.addEventListener("dragleave", function (e) { if (!p.tabsEl.contains(e.relatedTarget)) clearTabDropMarks(); });
  p.tabsEl.addEventListener("drop", function (e) {
    if (!isTabDrag(e)) return;
    e.preventDefault(); e.stopPropagation();
    const info = JSON.parse(e.dataTransfer.getData("text/x-cf-tab") || "{}"), d = tabDropIndex(e.clientX);
    clearTabDropMarks();
    const src = panes[info.pane];
    if (src) moveTab(src, info.id, p, d.at);
  });
  /* the middle of a pane: move the tab here; near an edge, held a moment: split that way (TabSplit) */
  col.addEventListener("dragover", function (e) {
    if (!isTabDrag(e) || p.tabsEl.contains(e.target)) return;
    e.preventDefault(); e.dataTransfer.dropEffect = "move";
    clearTabDropMarks();
    col.classList.toggle("tab-drop-on", !TabSplit.over(p, e));
  });
  col.addEventListener("dragleave", function (e) { if (!col.contains(e.relatedTarget)) { col.classList.remove("tab-drop-on"); TabSplit.end(); } });
  col.addEventListener("drop", function (e) {
    if (!isTabDrag(e) || p.tabsEl.contains(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    col.classList.remove("tab-drop-on");
    const info = JSON.parse(e.dataTransfer.getData("text/x-cf-tab") || "{}"), src = panes[info.pane];
    if (!src) return;
    if (TabSplit.drop(src, info.id, p)) return;
    if (src !== p) moveTab(src, info.id, p, p.tabs.length);
  });
  p.renderTabs = function () {
    tabTreeSoon();
    p.tabsEl.innerHTML = "";
    if (p.type === "taskboard" || p.type === "sheet") {   /* the Notes panel's or sheet's own tab: closing it goes back to the note */
      const isSheet = p.type === "sheet", shObj = isSheet && findSheet(p.sheetId);
      const bt = document.createElement("div");
      bt.className = "tab on tab-board";
      const bl = document.createElement("span");
      bl.className = "tab-lbl";
      if (isSheet) bl.innerHTML = ico("table");
      bl.appendChild(document.createTextNode((isSheet ? " " + (shObj ? shObj.title : "Sheet") : "Notes")));
      const bx = document.createElement("button");
      bx.className = "tab-x"; bx.innerHTML = ico("x"); bx.title = isSheet ? "Close the sheet" : "Close the Notes panel";
      bx.addEventListener("mousedown", function (e) { e.stopPropagation(); });
      bx.addEventListener("click", function (e) { e.stopPropagation(); if (isSheet) closeSheetPane(p); else tbClosePane(p); });
      bt.appendChild(bl); bt.appendChild(bx);
      p.tabsEl.appendChild(bt);
    }
    if (p.graphTab) {                                   /* the graph: a tab that stays while you switch to a note and back */
      const gt = document.createElement("div");
      gt.className = "tab tab-graph" + (p.type === "graph" ? " on" : "");
      gt.innerHTML = '<span class="tab-lbl">' + ico("graph") + " Graph</span>";
      const gx = document.createElement("button");
      gx.className = "tab-x"; gx.innerHTML = ico("x"); gx.title = "Close the graph";
      gx.addEventListener("mousedown", function (e) { e.stopPropagation(); });
      gx.addEventListener("click", function (e) { e.stopPropagation(); closeGraph(); });
      gt.appendChild(gx);
      gt.addEventListener("mousedown", function (e) {
        if (e.button === 1) { e.preventDefault(); closeGraph(); return; }
        if (e.button !== 0) return;
        focusThis();
        if (p.type !== "graph") showGraphIn(p);
      });
      p.tabsEl.appendChild(gt);
    }
    if (!p.tabs.length) {
      const e = document.createElement("div");
      e.className = "tabs-empty";
      e.textContent = "No tabs \u2014 pick a note";
      p.tabsEl.appendChild(e);
      return;
    }
    p.tabs.forEach(function (id) {
      const n = findNote(id);
      if (!n) return;
      const t = document.createElement("div");
      t.className = "tab" + (sameId(id, p.noteId) && p.type === "note" ? " on" : "");
      const lbl = document.createElement("span");
      lbl.className = "tab-lbl";
      lbl.textContent = n.title;
      lbl.title = n.path || n.title;
      const x = document.createElement("button");
      x.className = "tab-x";
      x.innerHTML = ico("x");
      x.title = "Close tab";
      x.addEventListener("mousedown", function (e) { e.stopPropagation(); });
      x.addEventListener("click", function (e) { e.stopPropagation(); p.closeTab(id); });
      t.addEventListener("mousedown", function (e) {
        if (e.button === 1) { e.preventDefault(); p.closeTab(id); return; }
        if (e.button === 2) return;                       /* right-click: the tab's menu */
        focusThis();
        if (!sameId(id, p.noteId) || p.type !== "note") p.open(id);   /* the note under the board or graph comes back too */
      });
      /* drag a tab along its bar to reorder it, or onto another pane to move it there */
      t.draggable = true; t.dataset.id = String(id);
      t.addEventListener("dragstart", function (e) {
        e.dataTransfer.setData("text/x-cf-tab", JSON.stringify({ pane: panes.indexOf(p), id: String(id) }));
        e.dataTransfer.effectAllowed = "move";
        t.classList.add("dragging");
        document.body.classList.add("tab-dragging");
      });
      t.addEventListener("dragend", function (e) {
        t.classList.remove("dragging"); document.body.classList.remove("tab-dragging"); clearTabDropMarks();
        /* dropped outside the window, onto nothing: the note comes out into a window of its own (VS Code's way) */
        if (e.dataTransfer && e.dataTransfer.dropEffect === "none" && PopOut.outside(e)) PopOut.open(p, id, e.screenX, e.screenY);
      });
      t.addEventListener("contextmenu", function (e) { e.preventDefault(); tabMenu(p, id, e.clientX, e.clientY); });
      t.appendChild(lbl); t.appendChild(x);
      p.tabsEl.appendChild(t);
    });
    /* scroll the strip itself, only when the active tab is out of sight: scrollIntoView
       could force a layout of the whole page, and scroll its parents too */
    const on = p.tabsEl.querySelector(".tab.on"), strip = p.tabsEl;
    if (on) {
      const sr = strip.getBoundingClientRect(), tr = on.getBoundingClientRect();
      const left = tr.left - sr.left + strip.scrollLeft, right = left + tr.width;
      if (left < strip.scrollLeft) strip.scrollLeft = left;
      else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth;
    }
  };

