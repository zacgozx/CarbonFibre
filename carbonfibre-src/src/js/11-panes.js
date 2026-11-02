/* ============================================================
   workarea / panes management
   ============================================================ */

var MAX_PANES = 4;
var workarea = document.getElementById("workarea");
var graphEl = document.getElementById("graph");

/* rebuild the [pane, gutter, pane, gutter, pane] sequence and apply widths */
function layoutPanes() {
  Array.prototype.slice.call(workarea.querySelectorAll(".pane-gutter")).forEach(function (g) { g.parentNode.removeChild(g); });
  panes.forEach(function (p, i) {
    workarea.insertBefore(p.root, graphEl);
    p.root.style.flex = p.width + " 1 0px";
    if (i < panes.length - 1) {
      var g = document.createElement("div");
      g.className = "gutter pane-gutter";
      g.title = "Drag to resize";
      wirePaneGutter(g, i);
      workarea.insertBefore(g, graphEl);
    }
  });
  document.getElementById("btnDual").classList.toggle("pill-on", panes.length > 1);
}

function wirePaneGutter(g, leftIndex) {
  g.addEventListener("mousedown", function (e) {
    e.preventDefault();
    var left = panes[leftIndex], right = panes[leftIndex + 1];
    if (!left || !right) return;
    var lw = left.root.getBoundingClientRect().width;
    var rw = right.root.getBoundingClientRect().width;
    var startX = e.clientX;
    g.classList.add("drag");
    document.body.classList.add("resizing");
    function move(ev) {
      var d = ev.clientX - startX;
      var nl = Math.max(220, lw + d), nr = Math.max(220, rw - d);
      if (lw + d < 220) nr = lw + rw - 220;
      if (rw - d < 220) nl = lw + rw - 220;
      left.width = nl; right.width = nr;
      left.root.style.flex = nl + " 1 0px";
      right.root.style.flex = nr + " 1 0px";
    }
    function up() {
      g.classList.remove("drag");
      document.body.classList.remove("resizing");
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      scheduleSession();
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  });
}

/* Move note tab `id` from pane src to pane dst at position `at` (same pane: reorder). The note
   opens in dst; src shows its neighbouring tab, or closes if it has none left (as VS Code does). */
function moveTab(src, id, dst, at) {
  if (!src || !dst || id == null) return;
  var from = -1;
  for (var k = 0; k < src.tabs.length; k++) if (sameId(src.tabs[k], id)) { from = k; break; }
  if (from === -1) return;
  var realId = src.tabs[from];
  if (src === dst) {
    src.tabs.splice(from, 1);
    if (at > from) at--;
    src.tabs.splice(Math.max(0, Math.min(at, src.tabs.length)), 0, realId);
    src.renderTabs(); scheduleSession();
    return;
  }
  src.sync();
  var already = dst.tabs.some(function (x) { return sameId(x, realId); });
  if (!already) dst.tabs.splice(Math.max(0, Math.min(at, dst.tabs.length)), 0, realId);
  if (dst.type !== "note") { if (dst.type === "taskboard") tbClosePane(dst); else if (dst.type === "sheet") closeSheetPane(dst); }
  dst.open(realId);
  dst.focusThis();
  src.closeTab(realId);                                 /* may close src if that was its last tab */
  renderPanes();
  scheduleSession();
}
function moveTabToNewSplit(src, id) {
  if (panes.length >= MAX_PANES || src.tabs.length < 2) return;
  var dst = addPane(src, id);
  src.closeTab(id);
  dst.focusThis();
}
function clearTabDropMarks() {
  Array.prototype.forEach.call(document.querySelectorAll(".tab.drop-before, .tab.drop-after, .tabs.drop-into, .pane-col.tab-drop-on, .drop-into"), function (el) {
    el.classList.remove("drop-before", "drop-after", "drop-into", "tab-drop-on");
  });
}
/* ---- Open tabs: every pane's tabs as a tree (pane, then folder, then tab), filterable ---- */
var ttFolded = {};
function tabTreeVisible() { return currentView === "tabs" && !sideEl.classList.contains("side-closed"); }
var ttQueued = false;
function tabTreeSoon() { if (ttQueued || !tabTreeVisible()) return; ttQueued = true; requestAnimationFrame(function () { ttQueued = false; renderTabTree(); }); }
function renderTabTree() {
  var box = document.getElementById("tabTree");
  if (!box) return;
  var q = (document.getElementById("tabFilter").value || "").trim().toLowerCase(), total = 0, shownN = 0, html = "";
  panes.forEach(function (p, pi) {
    var name = panes.length === 1 ? "Pane" : panes.length === 2 ? (pi === 0 ? "Left pane" : "Right pane") : "Pane " + (pi + 1);
    var focused = p === focusedPane;
    var extra = p.type === "taskboard" ? "Task board" : p.type === "sheet" ? "Sheet" : "";
    /* tabs grouped by folder, folders in name order, tabs in tab order */
    var groups = {}, order = [];
    p.tabs.forEach(function (id) {
      var n = findNote(id); if (!n) return;
      total++;
      var dir = typeof tbnFolderOf === "function" ? tbnFolderOf(n) : "";
      if (q && n.title.toLowerCase().indexOf(q) === -1 && dir.toLowerCase().indexOf(q) === -1) return;
      shownN++;
      if (!groups[dir]) { groups[dir] = []; order.push(dir); }
      groups[dir].push(n);
    });
    if (q && !order.length) return;
    order.sort(function (a, b) { return a === "" ? -1 : b === "" ? 1 : a.localeCompare(b); });
    html += '<div class="tt-pane' + (focused ? " focused" : "") + '" data-pane="' + pi + '" role="treeitem" aria-expanded="true">' +
      '<div class="tt-phead" data-pane="' + pi + '"><span class="tt-pdot"></span>' + esc(name) + (extra ? '<span class="tt-extra">' + esc(extra) + "</span>" : "") +
      '<span class="tt-n">' + p.tabs.length + "</span></div>";
    order.forEach(function (dir) {
      var key = pi + "|" + dir, folded = !q && ttFolded[key];
      if (dir) html += '<div class="tt-folder' + (folded ? " folded" : "") + '" data-fold="' + esc(key) + '"><span class="tt-caret">\u25be</span>' + ico("folder") + '<span class="tt-fname">' + esc(dir) + '</span><span class="tt-n">' + groups[dir].length + "</span></div>";
      if (folded) return;
      groups[dir].forEach(function (n) {
        var active = sameId(n.id, p.noteId) && p.type === "note";
        html += '<div class="tt-tab' + (active ? " active" : "") + (dir ? " nested" : "") + '" draggable="true" data-pane="' + pi + '" data-id="' + esc(String(n.id)) + '" role="treeitem" tabindex="0" title="' + esc(n.path || n.title) + '">' +
          ico("file") + '<span class="tt-title">' + esc(n.title) + '</span><button type="button" class="tt-x" data-close="1" aria-label="Close ' + esc(n.title) + '" title="Close">\u00d7</button></div>';
      });
    });
    if (!p.tabs.length) html += '<div class="tt-empty">No tabs</div>';
    html += "</div>";
  });
  box.innerHTML = html || '<div class="tt-empty">No open tabs match \u201c' + esc(q) + '\u201d.</div>';
  document.getElementById("ttCount").textContent = q ? shownN + " of " + total : total ? String(total) : "";
}
(function () {
  var box = document.getElementById("tabTree"), filt = document.getElementById("tabFilter");
  if (!box) return;
  var paneOf = function (el) { return panes[+el.dataset.pane]; };
  filt.addEventListener("input", renderTabTree);
  filt.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { var first = box.querySelector(".tt-tab"); if (first) { e.preventDefault(); first.click(); } }
    else if (e.key === "ArrowDown") { var f = box.querySelector(".tt-tab"); if (f) { e.preventDefault(); f.focus(); } }
    else if (e.key === "Escape") { if (filt.value) { filt.value = ""; renderTabTree(); } }
  });
  box.addEventListener("click", function (e) {
    var fold = e.target.closest(".tt-folder");
    if (fold) { ttFolded[fold.dataset.fold] = !ttFolded[fold.dataset.fold]; renderTabTree(); return; }
    var head = e.target.closest(".tt-phead");
    if (head) { var hp = paneOf(head); if (hp) hp.focusThis(); renderTabTree(); return; }
    var row = e.target.closest(".tt-tab");
    if (!row) return;
    var p = paneOf(row), id = row.dataset.id, n = state.notes.filter(function (x) { return String(x.id) === id; })[0];
    if (!p || !n) return;
    if (e.target.closest("[data-close]")) { p.closeTab(n.id); return; }
    p.focusThis();
    if (p.type !== "note") { if (p.type === "taskboard") tbClosePane(p); else if (p.type === "sheet") closeSheetPane(p); }
    if (!sameId(n.id, p.noteId) || p.type !== "note") p.open(n.id);
    renderTabTree();
  });
  box.addEventListener("keydown", function (e) {
    var row = e.target.closest(".tt-tab");
    if (!row) return;
    var rows = Array.prototype.slice.call(box.querySelectorAll(".tt-tab")), i = rows.indexOf(row);
    if (e.key === "Enter") { e.preventDefault(); row.click(); }
    else if (e.key === "ArrowDown" && rows[i + 1]) { e.preventDefault(); rows[i + 1].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (rows[i - 1]) rows[i - 1].focus(); else filt.focus(); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); var p = paneOf(row), n = state.notes.filter(function (x) { return String(x.id) === row.dataset.id; })[0]; if (p && n) p.closeTab(n.id); }
  });
  box.addEventListener("contextmenu", function (e) {
    var row = e.target.closest(".tt-tab");
    if (!row) return;
    e.preventDefault();
    var p = paneOf(row), n = state.notes.filter(function (x) { return String(x.id) === row.dataset.id; })[0];
    if (p && n) tabMenu(p, n.id, e.clientX, e.clientY);
  });
  /* drag a tab: onto another pane's group in the tree (or a pane itself) to move it there */
  box.addEventListener("dragstart", function (e) {
    var row = e.target.closest(".tt-tab");
    if (!row) return;
    e.dataTransfer.setData("text/x-cf-tab", JSON.stringify({ pane: +row.dataset.pane, id: row.dataset.id }));
    e.dataTransfer.effectAllowed = "move";
    row.classList.add("dragging");
  });
  box.addEventListener("dragend", function () { clearTabDropMarks(); Array.prototype.forEach.call(box.querySelectorAll(".dragging, .drop-on"), function (el) { el.classList.remove("dragging", "drop-on"); }); });
  box.addEventListener("dragover", function (e) {
    if (Array.prototype.indexOf.call(e.dataTransfer.types, "text/x-cf-tab") === -1) return;
    var grp = e.target.closest(".tt-pane");
    if (!grp) return;
    e.preventDefault(); e.dataTransfer.dropEffect = "move";
    Array.prototype.forEach.call(box.querySelectorAll(".drop-on"), function (el) { if (el !== grp) el.classList.remove("drop-on"); });
    grp.classList.add("drop-on");
  });
  box.addEventListener("drop", function (e) {
    var grp = e.target.closest(".tt-pane");
    if (!grp) return;
    e.preventDefault();
    grp.classList.remove("drop-on");
    var info = JSON.parse(e.dataTransfer.getData("text/x-cf-tab") || "{}"), src = panes[info.pane], dst = panes[+grp.dataset.pane];
    if (!src || !dst) return;
    var before = e.target.closest(".tt-tab"), at = dst.tabs.length;
    if (before) { var bi = -1; dst.tabs.forEach(function (x, k) { if (String(x) === before.dataset.id) bi = k; }); if (bi !== -1) at = bi; }
    moveTab(src, info.id, dst, at);
    renderTabTree();
  });
})();
/* a floating menu at (x, y): items are { label, fn, hint, off } or null for a divider */
function floatMenu(items, x, y, after) {
  tabMenuClose();
  var m = document.createElement("div");
  m.className = "tab-menu"; m.setAttribute("role", "menu");
  items.forEach(function (it) {
    if (!it) { var sep = document.createElement("div"); sep.className = "tab-menu-sep"; m.appendChild(sep); return; }
    var b = document.createElement("button");
    b.type = "button"; b.className = "tab-menu-item"; b.setAttribute("role", "menuitem"); b.disabled = !!it.off;
    b.innerHTML = "<span>" + esc(it.label) + "</span>" + (it.hint ? "<kbd>" + esc(it.hint) + "</kbd>" : "");
    b.addEventListener("click", function () { tabMenuClose(); it.fn(); if (after) after(); });
    m.appendChild(b);
  });
  document.body.appendChild(m);
  tabMenuEl = m;
  var r = m.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + "px";
  m.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + "px";
  var first = m.querySelector("button:not(:disabled)"); if (first) first.focus();
}
/* right-click a tab: move it to another pane, to a new split, or close it */
var tabMenuEl = null;
function tabMenuClose() { if (tabMenuEl) { tabMenuEl.remove(); tabMenuEl = null; } }
function tabMenu(p, id, x, y) {
  tabMenuClose();
  var m = document.createElement("div");
  m.className = "tab-menu"; m.setAttribute("role", "menu");
  var add = function (label, fn, disabled, hint) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "tab-menu-item"; b.setAttribute("role", "menuitem"); b.disabled = !!disabled;
    b.innerHTML = '<span>' + esc(label) + "</span>" + (hint ? "<kbd>" + esc(hint) + "</kbd>" : "");
    b.addEventListener("click", function () { tabMenuClose(); fn(); });
    m.appendChild(b);
  };
  var me = panes.indexOf(p);
  panes.forEach(function (q, k) {
    if (q === p) return;
    var n = q.type === "note" && q.note ? q.note() : null;
    var name = panes.length === 2 ? (k > me ? "the right pane" : "the left pane") : "pane " + (k + 1) + (n ? " (" + n.title + ")" : "");
    add("Move to " + name, function () { moveTab(p, id, q, q.tabs.length); }, false, panes.length === 2 ? (k > me ? "Ctrl+Alt+\u2192" : "Ctrl+Alt+\u2190") : "");
  });
  add("Move to a new split", function () { moveTabToNewSplit(p, id); }, panes.length >= MAX_PANES || p.tabs.length < 2);
  var sep = document.createElement("div"); sep.className = "tab-menu-sep"; m.appendChild(sep);
  add("Close", function () { p.closeTab(id); }, false, "");
  document.body.appendChild(m);
  tabMenuEl = m;
  var r = m.getBoundingClientRect();
  m.style.left = Math.min(x, window.innerWidth - r.width - 8) + "px";
  m.style.top = Math.min(y, window.innerHeight - r.height - 8) + "px";
  var first = m.querySelector("button:not(:disabled)"); if (first) first.focus();
}
document.addEventListener("mousedown", function (e) { if (tabMenuEl && !tabMenuEl.contains(e.target)) tabMenuClose(); }, true);
document.addEventListener("keydown", function (e) { if (tabMenuEl && e.key === "Escape") { e.preventDefault(); tabMenuClose(); } }, true);
/* Ctrl+Alt+Right / Left: the current tab to the next / previous pane (a new split if there is none to the right) */
function moveCurrentTab(dir) {
  var p = focusedPane || panes[0];
  if (!p || p.type !== "note" || p.noteId == null) return;
  var k = panes.indexOf(p) + dir;
  if (k >= 0 && k < panes.length) moveTab(p, p.noteId, panes[k], panes[k].tabs.length);
  else if (dir > 0) moveTabToNewSplit(p, p.noteId);
}
function addPane(after, noteId) {
  if (panes.length >= MAX_PANES) return panes[panes.length - 1];
  var src = after || focusedPane || panes[panes.length - 1];
  var p = createPane(panes.length);
  var at = panes.indexOf(src) + 1;
  panes.splice(at, 0, p);
  /* new pane takes half of the source pane's width */
  var w = src.root.getBoundingClientRect().width || 1;
  src.width = w / 2; p.width = w / 2;
  layoutPanes();
  p.open(noteId != null ? noteId : src.noteId);
  renderPanes();
  p.focusThis();
  scheduleSession();
  return p;
}

function closePane(p) {
  if (panes.length < 2) return;
  if (sk && sk.dockedIn === p) { closeSketch(); return; }   /* closeSketch comes back here */
  if (p.type === "sheet") flushSheets();
  p.sync();
  var i = panes.indexOf(p);
  panes = panes.filter(function (q) { return q !== p; });
  if (p.root.parentNode) p.root.parentNode.removeChild(p.root);
  /* hand the freed width to the neighbour */
  var neighbour = panes[Math.max(0, i - 1)];
  neighbour.width += p.width;
  layoutPanes();
  if (focusedPane === p) focusedPane = neighbour;
  renderPanes();
  neighbour.focusThis();
  renderSidebar();
  scheduleSession();
}

function toggleDual() {
  if (panes.length > 1) closePane(focusedPane && panes.indexOf(focusedPane) > 0 ? focusedPane : panes[panes.length - 1]);
  else addPane(panes[0]);
}

/* sidebar drag */
var sideEl = document.getElementById("side");
var sideWidth = 300;
document.getElementById("sideGutter").addEventListener("mousedown", function (e) {
  e.preventDefault();
  var g = e.currentTarget;
  var startX = e.clientX, startW = sideWidth;
  g.classList.add("drag");
  document.body.classList.add("resizing");
  function move(ev) {
    sideWidth = Math.max(220, Math.min(680, startW + (ev.clientX - startX)));
    sideEl.style.setProperty("--side-w", sideWidth + "px");
  }
  function up() {
    g.classList.remove("drag");
    document.body.classList.remove("resizing");
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
    scheduleSession();
  }
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
});

