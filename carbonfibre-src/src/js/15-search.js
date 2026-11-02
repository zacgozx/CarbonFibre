/* ============================================================
   search
   ============================================================ */

var HIT_CAP = 4;
var notesListEl = document.getElementById("notesList");
var searchListEl = document.getElementById("searchList");

function searchMatches(n, q) {
  var titleHit = n.title.toLowerCase().indexOf(q) !== -1;
  var hits = [], total = 0;
  var ls = n.content.split("\n");
  for (var i = 0; i < ls.length; i++) {
    var low = ls[i].toLowerCase(), from = 0, idx;
    while ((idx = low.indexOf(q, from)) !== -1) {
      total++;
      if (hits.length < HIT_CAP) hits.push({ line: i, col: idx, text: ls[i] });
      from = idx + q.length;
    }
  }
  return { titleHit: titleHit, hits: hits, total: total };
}

function snippetHtml(text, col, qlen) {
  var start = Math.max(0, col - 26), end = Math.min(text.length, col + qlen + 46);
  return (start > 0 ? "\u2026" : "") + esc(text.slice(start, col)) +
    "<mark>" + esc(text.slice(col, col + qlen)) + "</mark>" +
    esc(text.slice(col + qlen, end)) + (end < text.length ? "\u2026" : "");
}

function highlightTitle(title, q) {
  var idx = title.toLowerCase().indexOf(q);
  if (idx === -1) return esc(title);
  return esc(title.slice(0, idx)) + "<mark>" + esc(title.slice(idx, idx + q.length)) + "</mark>" +
    esc(title.slice(idx + q.length));
}

function jumpTo(noteId, lineIdx, col, qlen, pane) {
  var p = pane || focusedPane || panes[0];
  if (String(noteId) !== String(p.noteId)) p.open(noteId);
  if (p.mode === "live") {
    if (lineIdx >= p.lines.length) return;
    p.setActive(lineIdx, col);
    if (p.ta && qlen) p.ta.setSelectionRange(col, col + qlen);
    var node = p.nodeAt(lineIdx);
    if (node && node.scrollIntoView) node.scrollIntoView({ block: "center" });
  } else {
    var pos = 0;
    for (var i = 0; i < lineIdx && i < p.lines.length; i++) pos += p.lines[i].length + 1;
    p.srcEl.focus();
    p.srcEl.setSelectionRange(pos + col, pos + col + qlen);
    var frac = p.lines.length > 1 ? lineIdx / p.lines.length : 0;
    p.srcEl.scrollTop = frac * (p.srcEl.scrollHeight - p.srcEl.clientHeight);
    var pn = p.prevEl.children[lineIdx];
    if (pn) {
      if (pn.scrollIntoView) pn.scrollIntoView({ block: "center" });
      pn.classList.add("flash");
      setTimeout(function () { pn.classList.remove("flash"); }, 900);
    }
  }
}

/* click the Sheets heading to fold the list away; remembered */
(function () {
  var head = document.getElementById("sheetHead"), list = document.getElementById("sheetList");
  var apply = function (folded) { head.classList.toggle("folded", folded); list.classList.toggle("folded", folded); head.setAttribute("aria-expanded", String(!folded)); };
  try { apply(localStorage.getItem("carbonfibre-sheets-folded") === "1"); } catch (e) {}
  head.addEventListener("click", function (e) {
    if (e.target.closest("button")) return;            /* the New sheet button is its own */
    var folded = !list.classList.contains("folded");
    apply(folded);
    storeSet("carbonfibre-sheets-folded", folded ? "1" : "0");
  });
})();
function renderSheetList() {
  var cntEl = document.getElementById("sheetCount");
  if (cntEl) cntEl.textContent = sheets.length ? sheets.length : "";
  var head = document.getElementById("sheetHead");
  var list = document.getElementById("sheetList");
  if (!head || !list) return;
  head.classList.toggle("show", true);
  list.innerHTML = "";
  if (!sheets.length) {
    var e0 = document.createElement("div");
    e0.className = "side-empty";
    e0.style.padding = "6px 12px";
    e0.textContent = state.backend === "folder"
      ? "No .csv files in sheets/ yet." : "No sheets yet.";
    list.appendChild(e0);
    return;
  }
  var openIds = panes.filter(function (p) { return p.type === "sheet"; }).map(function (p) { return String(p.sheetId); });
  sheets.slice().sort(function (a, b) { return a.title.localeCompare(b.title); }).forEach(function (sh) {
    var it = document.createElement("div");
    it.className = "sheet-item" + (openIds.indexOf(String(sh.id)) !== -1 ? " on" : "");
    it.innerHTML = '<span class="grid-icon">' + ico("table") + '</span><span class="nm"></span>';
    it.querySelector(".nm").textContent = sh.title;
    it.title = sh.path || sh.title;
    var del = document.createElement("button");
    del.className = "del-btn";
    del.innerHTML = ico("x");
    del.title = "Delete sheet";
    del.addEventListener("click", function (e) { e.stopPropagation(); deleteSheet(sh.id); });
    it.appendChild(del);
    it.addEventListener("click", function (e) {
      var fp = focusedPane || panes[0];
      if (e.shiftKey) openSheetSplit(fp, sh.id); else openSheetInPane(fp, sh.id);
    });
    list.appendChild(it);
  });
}

/* Switching notes changes only which rows are highlighted, so the rows are re-marked in
   place. Rebuilding all of them (and the layout that forced) was most of the time a switch
   took. Anything that changes the list itself still does the full render below. */
function markSidebar() {
  if (state.renamingId != null) { renderSidebar(); return; }
  var fp = focusedPane || panes[0], focusedId = fp ? String(fp.noteId) : "", open = {};
  panes.forEach(function (p) { p.tabs.forEach(function (t) { open[String(t)] = 1; }); });
  [notesListEl, searchListEl].forEach(function (listEl) {
    if (!listEl) return;
    Array.prototype.forEach.call(listEl.querySelectorAll(".side-item[data-nid]"), function (item) {
      var id = item.dataset.nid, on = id === focusedId, on2 = !on && !!open[id];
      if (item.classList.contains("on") !== on) item.classList.toggle("on", on);
      if (item.classList.contains("on2") !== on2) item.classList.toggle("on2", on2);
    });
  });
}
function renderSidebar() {
  syncAllPanes();
  renderList(notesListEl, "");
  renderSheetList();
  if (currentView === "search" || (state.query || "").trim()) renderList(searchListEl, (state.query || "").trim().toLowerCase());
}

function renderList(listEl, q) {
  listEl.innerHTML = "";
  var countEl = document.getElementById("searchCount");
  var isSearch = listEl === searchListEl;
  var fp = focusedPane || panes[0];
  var focusedId = fp ? String(fp.noteId) : "";
  var openIds = [];
  panes.forEach(function (p) { p.tabs.forEach(function (t) { openIds.push(String(t)); }); });

  if (state.notes.length === 0) {
    if (isSearch) countEl.style.display = "none";
    var d = document.createElement("div");
    d.className = "side-empty";
    d.textContent = state.backend === "folder"
      ? "No .md files in this folder yet. Create one above."
      : "No notes yet. Create your first one.";
    listEl.appendChild(d);
    return;
  }

  var rows = [], totalHits = 0;
  var ordered = state.notes;
  if (sortMode === "recent") {
    ordered = state.notes.slice().sort(function (a, b) {
      var d = noteStamp(b) - noteStamp(a);
      return d || (a.path || a.title).localeCompare(b.path || b.title);
    });
  }
  ordered.forEach(function (n) {
    if (!q) { rows.push({ note: n, res: null }); return; }
    var res = searchMatches(n, q);
    if (res.titleHit || res.total > 0) { rows.push({ note: n, res: res }); totalHits += res.total; }
  });

  if (isSearch) {
    if (q) {
      countEl.style.display = "";
      countEl.textContent = rows.length === 0 ? "No matches"
        : totalHits + (totalHits === 1 ? " match in " : " matches in ") +
          rows.length + (rows.length === 1 ? " note" : " notes");
    } else countEl.style.display = "none";
    if (!q) {
      var hint = document.createElement("div");
      hint.className = "side-empty";
      hint.textContent = "Type to search titles and content across every note.";
      listEl.appendChild(hint);
      return;
    }
  }

  if (rows.length === 0) {
    var e0 = document.createElement("div");
    e0.className = "side-empty";
    e0.textContent = "Nothing matches that search.";
    listEl.appendChild(e0);
    return;
  }

  var tree = !q && state.backend === "folder" && sortMode === "name";

  function buildItem(row) {
    var n = row.note, res = row.res;
    var item = document.createElement("div");
    var isFocused = String(n.id) === focusedId;
    var isOpen = openIds.indexOf(String(n.id)) !== -1;
    item.className = "side-item" + (isFocused ? " on" : isOpen ? " on2" : "");
    item.dataset.nid = String(n.id);

    if (state.renamingId === n.id) {
      var input = document.createElement("input");
      input.className = "rename-input";
      input.value = n.title;
      item.appendChild(input);
      setTimeout(function () { input.focus(); input.select(); }, 0);
      input.addEventListener("blur", function () { commitRename(n, input.value); });
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") input.blur();
        if (e.key === "Escape") { state.renamingId = null; renderSidebar(); }
      });
      input.addEventListener("click", function (e) { e.stopPropagation(); });
      return item;
    }

    var rowEl = document.createElement("div");
    rowEl.className = "side-item-row";
    var title = document.createElement("span");
    title.className = "side-item-title";
    if (q) title.innerHTML = highlightTitle(n.title, q);
    else title.textContent = n.title;
    var pin = document.createElement("button");
    pin.className = "pin-btn" + (isPinned(n) ? " on" : "");
    pin.innerHTML = isPinned(n) ? ico("starFill") : ico("star");
    pin.title = isPinned(n) ? "Unpin" : "Pin to the top";
    pin.addEventListener("click", function (e) { e.stopPropagation(); togglePin(n); });
    var del = document.createElement("button");
    del.className = "del-btn";
    del.innerHTML = ico("x");
    del.title = 'Delete "' + n.title + '"';
    del.addEventListener("click", function (e) { e.stopPropagation(); deleteNote(n.id); });
    rowEl.appendChild(pin); rowEl.appendChild(title); rowEl.appendChild(del);
    item.appendChild(rowEl);

    if (!tree && n.path && n.path.indexOf("/") !== -1) {
      var pth = document.createElement("div");
      pth.className = "side-item-path";
      pth.textContent = n.path.slice(0, n.path.lastIndexOf("/"));
      item.appendChild(pth);
    }

    if (res && res.hits.length) {
      var hl = document.createElement("div");
      hl.className = "hit-list";
      res.hits.forEach(function (h) {
        var hit = document.createElement("div");
        hit.className = "hit";
        var no = document.createElement("span");
        no.className = "hit-no";
        no.textContent = h.line + 1;
        var tx = document.createElement("span");
        tx.className = "hit-txt";
        tx.innerHTML = snippetHtml(h.text, h.col, q.length);
        hit.appendChild(no); hit.appendChild(tx);
        hit.addEventListener("mousedown", function (e) {
          e.preventDefault(); e.stopPropagation();
          jumpTo(n.id, h.line, h.col, q.length, e.shiftKey ? paneForShift(focusedPane || panes[0]) : null);
        });
        hit.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); });
        hl.appendChild(hit);
      });
      if (res.total > res.hits.length) {
        var more = document.createElement("div");
        more.className = "hit-more";
        more.textContent = "+" + (res.total - res.hits.length) + " more in this note";
        hl.appendChild(more);
      }
      item.appendChild(hl);
    }

    item.addEventListener("click", function (e) {
      var fp = focusedPane || panes[0];
      if (e.shiftKey) {
        if (panes.length < 2) addPane(fp, n.id);
        else openInPane(n.id, nextPane(fp));
      } else {
        openInPane(n.id, fp);
      }
      panes.forEach(function (p) { p.renderBacklinks(); });
    });
    item.addEventListener("dblclick", function () { state.renamingId = n.id; renderSidebar(); });

    item.draggable = true;                     /* onto the task board: a task for this note */
    item.addEventListener("dragstart", function (e) { e.dataTransfer.setData("text/x-cf-note", String(n.id)); e.dataTransfer.effectAllowed = "copyMove"; });
    if (state.backend === "folder") {          /* drag a note onto a folder to move it */
      item.addEventListener("dragstart", function (e) {
        e.dataTransfer.setData("text/plain", String(n.id));
        e.dataTransfer.effectAllowed = "copyMove";
        item.classList.add("dragging");
      });
      item.addEventListener("dragend", function () { item.classList.remove("dragging"); });
    }
    return item;
  }

  /* pinned notes ride at the top, in both the flat list and the tree; pinned folders (tree only)
     join them there with everything inside them */
  var pins = rows.filter(function (r) { return isPinned(r.note); });
  var pinnedDirs = tree && !q ? Object.keys(pinned).filter(function (k) { return k.indexOf("folder:") === 0; }).map(function (k) { return k.slice(7); })
    .filter(function (d) { return state.folders.some(function (f) { return f.path === d; }) || rows.some(function (r) { return (r.note.path || "").indexOf(d + "/") === 0; }); })
    .filter(function (d, i, all) { return !all.some(function (o) { return o !== d && d.indexOf(o + "/") === 0; }); })    /* inside another pinned folder: shown there */
    .sort(function (a, b) { return a.localeCompare(b); }) : [];
  if ((pins.length || pinnedDirs.length) && !q) {
    var ph = document.createElement("div");
    ph.className = "pin-head";
    ph.textContent = "Pinned";
    listEl.appendChild(ph);
    pins.forEach(function (row) { listEl.appendChild(buildItem(row)); });
    var pinHolder = document.createElement("div");
    pinHolder.className = "pin-folders";
    listEl.appendChild(pinHolder);
    var sep = document.createElement("div");
    sep.className = "pin-sep";
    listEl.appendChild(sep);
    rows = rows.filter(function (r) { return !isPinned(r.note); });
  }

  if (!tree) {
    rows.forEach(function (row) { listEl.appendChild(buildItem(row)); });
    return;
  }

  /* folder tree: folders first (alphabetical), then the notes in that folder */
  var byDir = {}, dirs = {};
  rows.forEach(function (row) {
    var d = folderOf(row.note.path || "");
    (byDir[d] = byDir[d] || []).push(row);
    while (d) { dirs[d] = 1; d = folderOf(d); }
  });
  state.folders.forEach(function (f) { dirs[f.path] = 1; });

  function childDirs(dir) {
    return Object.keys(dirs).filter(function (d) { return d && folderOf(d) === dir; }).sort(function (a, b) { return a.localeCompare(b); });
  }
  function emit(dir, container, inPin) {
    childDirs(dir).filter(function (sub) { return inPin || pinnedDirs.indexOf(sub) === -1; }).forEach(function (sub) { emitFolder(sub, container, false); });
  }
  function emitFolder(sub, container, asPin) {
    (function () {
      var isCollapsed = !!collapsedFolders[sub];
      var head = document.createElement("div");
      head.className = "fold-head" + (isCollapsed ? " collapsed" : "");
      var chev = document.createElement("span");
      chev.className = "fold-chev"; chev.innerHTML = ico("chevronDown");
      var nm = document.createElement("span");
      nm.className = "fold-name"; nm.textContent = asPin ? sub : sub.slice(sub.lastIndexOf("/") + 1);   /* pinned: the full path */
      nm.title = sub;
      var fpin = document.createElement("button");
      fpin.className = "fold-add fold-pin" + (isFolderPinned(sub) ? " on" : "");
      fpin.innerHTML = isFolderPinned(sub) ? ico("starFill") : ico("star");
      fpin.title = isFolderPinned(sub) ? "Unpin " + sub : "Pin " + sub + " to the top";
      fpin.setAttribute("aria-label", fpin.title);
      fpin.addEventListener("click", function (e) { e.stopPropagation(); toggleFolderPin(sub); });
      var add = document.createElement("button");
      add.className = "fold-add"; add.innerHTML = "+"; add.title = "New note in " + sub;
      add.addEventListener("click", function (e) { e.stopPropagation(); collapsedFolders[sub] = false; createNote(sub); });
      var ren = document.createElement("button");
      ren.className = "fold-add"; ren.innerHTML = "\u270E"; ren.title = "Rename " + sub;
      ren.addEventListener("click", function (e) { e.stopPropagation(); renameFolder(sub); });
      var rm = document.createElement("button");
      rm.className = "fold-add"; rm.innerHTML = ico("x"); rm.title = "Delete " + sub;
      rm.addEventListener("click", function (e) { e.stopPropagation(); deleteFolder(sub); });
      head.appendChild(chev); head.appendChild(nm); head.appendChild(fpin); head.appendChild(add); head.appendChild(ren); head.appendChild(rm);
      head.addEventListener("click", function () { collapsedFolders[sub] = !collapsedFolders[sub]; renderSidebar(); });
      head.addEventListener("dblclick", function (e) { e.stopPropagation(); renameFolder(sub); });
      head.addEventListener("dragover", function (e) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; head.classList.add("drop"); });
      head.addEventListener("dragleave", function () { head.classList.remove("drop"); });
      head.addEventListener("drop", function (e) {
        e.preventDefault(); e.stopPropagation();
        clearDropMarks();
        var id = e.dataTransfer.getData("text/plain");
        if (id) moveNote(id, sub);
      });
      container.appendChild(head);
      var body = document.createElement("div");
      body.className = "fold-body";
      if (isCollapsed) body.style.display = "none";
      emit(sub, body, true);
      (byDir[sub] || []).forEach(function (row) { body.appendChild(buildItem(row)); });
      container.appendChild(body);
    })();
  }
  var pinHolderEl = listEl.querySelector(".pin-folders");
  if (pinHolderEl) pinnedDirs.forEach(function (d) { emitFolder(d, pinHolderEl, true); });
  emit("", listEl);
  (byDir[""] || []).forEach(function (row) { listEl.appendChild(buildItem(row)); });

  if (!listEl.dataset.rootDrop) {            /* dropping outside a folder moves to the vault root */
    listEl.dataset.rootDrop = "1";
    listEl.addEventListener("dragover", function (e) {
      if (state.backend !== "folder") return;
      e.preventDefault(); e.dataTransfer.dropEffect = "move";
      /* over a folder, that folder is the target: the whole list isn't */
      listEl.classList.toggle("drop-root", !(e.target.closest && e.target.closest(".fold-head")));
    });
    listEl.addEventListener("dragleave", function (e) { if (e.target === listEl) listEl.classList.remove("drop-root"); });
    listEl.addEventListener("drop", function (e) {
      listEl.classList.remove("drop-root");
      if (state.backend !== "folder") return;
      e.preventDefault();
      var id = e.dataTransfer.getData("text/plain");
      if (id) moveNote(id, "");
    });
  }
}

/* every drop highlight in the sidebar goes when a drag ends, wherever it was dropped (a drop on
   a folder used to leave the whole list highlighted until the page was reloaded) */
function clearDropMarks() {
  Array.prototype.forEach.call(document.querySelectorAll(".side-list.drop-root, .fold-head.drop"), function (el) { el.classList.remove("drop-root", "drop"); });
}
document.addEventListener("drop", function () { setTimeout(clearDropMarks, 0); }, true);
document.addEventListener("dragend", clearDropMarks, true);

/* ---------------- activity bar / side views ---------------- */

var currentView = "notes";
var sortMode = "name";       /* "name" keeps the folder tree; "recent" is a flat list, newest first */
function setSort(m) {
  sortMode = m;
  var b = document.getElementById("btnSort");
  b.innerHTML = ico("sort") + (m === "recent" ? "Recent" : "A\u2013Z");
  b.title = (m === "recent" ? "Sorted by most recently changed" : "Sorted by name") + ". Click to switch.";
  b.classList.toggle("on", m === "recent");
  renderSidebar();
  scheduleSession();
}

function showView(name, toggle) {
  var wasClosed = sideEl.classList.contains("side-closed");
  if (toggle && name === currentView && !wasClosed) {
    sideEl.classList.add("side-closed");
    Array.prototype.forEach.call(document.querySelectorAll(".act-btn[data-view]"), function (b) { b.classList.remove("on"); });
    scheduleSession();
    return;
  }
  currentView = name;
  sideEl.classList.remove("side-closed");
  Array.prototype.forEach.call(document.querySelectorAll(".side-view"), function (v) {
    v.classList.toggle("show", v.id === "view" + name.charAt(0).toUpperCase() + name.slice(1));
  });
  Array.prototype.forEach.call(document.querySelectorAll(".act-btn[data-view]"), function (b) {
    b.classList.toggle("on", b.dataset.view === name);
  });
  if (name === "search") { renderList(searchListEl, (state.query || "").trim().toLowerCase()); searchEl.focus(); searchEl.select(); }
  if (name === "tabs") { renderTabTree(); var tf = document.getElementById("tabFilter"); tf.focus(); tf.select(); }
  scheduleSession();
}

Array.prototype.forEach.call(document.querySelectorAll(".act-btn[data-view]"), function (b) {
  b.addEventListener("click", function () { showView(b.dataset.view, true); });
});
document.getElementById("actLibrary").addEventListener("click", function () { openLibrary("all"); });
document.getElementById("actBoard").addEventListener("click", function () { tbToggle(); });
document.getElementById("actGraph").addEventListener("click", function () {
  state.graphOpen ? closeGraph() : openGraph();
});

/* ---------------- search input ---------------- */

var searchEl = document.getElementById("search");
/* Replace all across notes: counts first and asks, then changes every note's text (saved to the
   vault when one is open) and refreshes open panes. Matching is as the search box: any case. */
document.getElementById("searchRepAll").addEventListener("click", function () {
  var q = searchEl.value, rtext = document.getElementById("searchRep").value;
  if (!q.trim()) { pushToastLike("Type what to find in the search box first."); return; }
  var re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), hits = 0, notes = [];
  state.notes.forEach(function (n) { var m = (n.content || "").match(re); if (m) { hits += m.length; notes.push(n); } });
  if (!hits) { pushToastLike("No matches for \u201c" + q + "\u201d."); return; }
  if (!window.confirm("Replace " + hits + " match" + (hits === 1 ? "" : "es") + " of \u201c" + q + "\u201d with \u201c" + rtext + "\u201d in " + notes.length + " note" + (notes.length === 1 ? "" : "s") + "?\n\nThis can't be undone in one step.")) return;
  panes.forEach(function (p) { if (p.sync) p.sync(); });
  notes.forEach(function (n) { n.content = n.content.replace(re, function () { return rtext; }); markDirty(n); });
  syncAllPanes();
  /* panes showing a changed note reload its text */
  panes.forEach(function (p) { if (p.type === "note" && notes.some(function (n) { return sameId(n.id, p.noteId); })) p.open(p.noteId); });
  searchEl.dispatchEvent(new Event("input"));
  pushToastLike("Replaced " + hits + " in " + notes.length + " note" + (notes.length === 1 ? "" : "s") + ".");
});
var searchClearEl = document.getElementById("searchClear");

function applySearch() {
  state.query = searchEl.value;
  searchClearEl.style.display = state.query ? "block" : "none";
  renderSidebar();
}
searchEl.addEventListener("input", function () {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(function () { searchTimer = null; applySearch(); }, 110);
});
searchEl.addEventListener("keydown", function (e) {
  if (e.key === "Escape") { e.preventDefault(); searchEl.value = ""; applySearch(); searchEl.blur(); }
  if (e.key === "Enter") {
    e.preventDefault();
    var first = searchListEl.querySelector(".hit");
    if (first) first.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  }
});
searchClearEl.addEventListener("click", function () { searchEl.value = ""; applySearch(); searchEl.focus(); });

function refreshSearchIfActive() {
  if (!state.query.trim()) return;
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(function () { searchTimer = null; renderSidebar(); }, 300);
}

