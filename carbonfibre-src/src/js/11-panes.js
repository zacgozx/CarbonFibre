/* ============================================================
   workarea / panes management
   ============================================================ */

const MAX_PANES = 6;
const workarea = document.getElementById("workarea");
const graphEl = document.getElementById("graph");

/* The layout: panes in reading order. A pane with .down sits under the one before it, in the same
   column; the others start a column. Column widths are the first pane's .width, heights in a column
   each pane's .height (both flex weights). A pane with .floating ({ x, y, w, h }) floats over the work
   area instead. Keeping one flat list means every "panes[i]" in the app keeps working. */
function paneColumns() {
  const cols = [];
  panes.forEach(function (p) {
    if (p.floating) return;
    if (p.down && cols.length) cols[cols.length - 1].push(p); else cols.push([p]);
  });
  return cols;
}
function layoutPanes() {
  /* moving an element resets its scroll position: every pane's is put back afterwards */
  const scrolls = panes.map(function (p) { return [p.editorEl, p.srcEl, p.prevEl].map(function (el) { return el ? el.scrollTop : 0; }); });
  Array.prototype.slice.call(workarea.querySelectorAll(".pane-gutter, .pane-stack")).forEach(function (g) {
    if (g.classList.contains("pane-stack")) while (g.firstChild) workarea.appendChild(g.firstChild);
    g.remove();
  });
  const cols = paneColumns();
  cols.forEach(function (col, ci) {
    col[0].down = false;
    const stack = document.createElement("div");
    stack.className = "pane-stack";
    stack.style.flex = (col[0].width || 1) + " 1 0px";
    col.forEach(function (p, ri) {
      stack.appendChild(p.root);
      p.root.style.flex = (p.height || 1) + " 1 0px";
      p.root.classList.remove("floating");
      p.root.style.left = p.root.style.top = p.root.style.width = p.root.style.height = "";
      if (ri < col.length - 1) {
        const g = document.createElement("div");
        g.className = "gutter pane-gutter row-gutter";
        g.title = "Drag to resize";
        wirePaneGutter(g, p, col[ri + 1], "y");
        stack.appendChild(g);
      }
    });
    workarea.appendChild(stack);
    if (ci < cols.length - 1) {
      const g = document.createElement("div");
      g.className = "gutter pane-gutter";
      g.title = "Drag to resize";
      wirePaneGutter(g, col[0], cols[ci + 1][0], "x");
      workarea.appendChild(g);
    }
  });
  panes.forEach(function (p) {
    if (!p.floating) return;
    const f = p.floating, r = p.root, W = workarea.getBoundingClientRect();
    if (W.width) { f.x = Math.max(0, Math.min(f.x, W.width - Math.min(f.w, W.width) - 8)); f.y = Math.max(0, Math.min(f.y, W.height - 60)); }   /* kept inside the window */
    r.classList.add("floating");
    r.style.flex = "";
    r.style.left = f.x + "px"; r.style.top = f.y + "px"; r.style.width = f.w + "px"; r.style.height = f.h + "px";
    workarea.appendChild(r);
  });
  panes.forEach(function (p, i) { [p.editorEl, p.srcEl, p.prevEl].forEach(function (el, k) { if (el && scrolls[i][k]) el.scrollTop = scrolls[i][k]; }); });
  const dual = document.getElementById("btnDual");                 /* Split only adds (toggleDual): no on/off look */
  dual.title = panes.length >= MAX_PANES ? "Already " + MAX_PANES + " panes: close one with its × first" : "Split: another pane beside this one (Ctrl+\\). Alt+click splits down";
}

/* drag between two columns (x: their widths) or two panes in a column (y: their heights) */
function wirePaneGutter(g, a, b, axis) {
  g.addEventListener("mousedown", function (e) {
    e.preventDefault();
    const key = axis === "x" ? "width" : "height";
    const boxA = (axis === "x" ? a.root.parentNode : a.root).getBoundingClientRect(), boxB = (axis === "x" ? b.root.parentNode : b.root).getBoundingClientRect();
    const sa = axis === "x" ? boxA.width : boxA.height, sb = axis === "x" ? boxB.width : boxB.height, min = axis === "x" ? 220 : 120;
    const start = axis === "x" ? e.clientX : e.clientY;
    g.classList.add("drag");
    document.body.classList.add("resizing");
    function move(ev) {
      const d = Math.max(min - sa, Math.min(sb - min, (axis === "x" ? ev.clientX : ev.clientY) - start));
      a[key] = sa + d; b[key] = sb - d;
      (axis === "x" ? a.root.parentNode : a.root).style.flex = a[key] + " 1 0px";
      (axis === "x" ? b.root.parentNode : b.root).style.flex = b[key] + " 1 0px";
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

/* a new pane beside `target`: side "right", "left", "down" or "up". Returns it, or null at the most. */
function splitPane(target, side, noteId) {
  if (panes.length >= MAX_PANES) { pushToastLike(MAX_PANES + " panes is the most. Close one with the × at its top right."); return null; }
  target = target || focusedPane || panes[panes.length - 1];
  if (target.floating) { target.floating = null; target.down = false; }
  /* no room for another column: below instead, rather than squeezing every pane under its minimum */
  if ((side === "right" || side === "left") && workarea.clientWidth && workarea.clientWidth / (paneColumns().length + 1) < 220) side = "down";
  const p = createPane(panes.length);
  const col = paneColumns().filter(function (c) { return c.indexOf(target) !== -1; })[0] || [target];
  if (side === "right" || side === "left") {
    const w = col[0].root.parentNode && col[0].root.parentNode.getBoundingClientRect ? col[0].root.parentNode.getBoundingClientRect().width || 1 : 1;
    col[0].width = w / 2; p.width = w / 2; p.down = false;
    panes.splice(side === "right" ? panes.indexOf(col[col.length - 1]) + 1 : panes.indexOf(col[0]), 0, p);
  } else {
    const h = target.root.getBoundingClientRect().height || 1;
    target.height = h / 2; p.height = h / 2;
    if (side === "down") { p.down = true; panes.splice(panes.indexOf(target) + 1, 0, p); }
    else { p.down = target.down; target.down = true; p.width = target.width; panes.splice(panes.indexOf(target), 0, p); }
  }
  layoutPanes();
  p.open(noteId != null ? noteId : target.noteId);
  renderPanes();
  p.focusThis();
  scheduleSession();
  return p;
}
function addPane(after, noteId) { return splitPane(after, "right", noteId) || panes[panes.length - 1]; }

/* float a pane over the work area, or put it back as a column at the right (double-click its bar) */
function floatPane(p, on) {
  if (on && !p.floating) {
    const w = workarea.getBoundingClientRect(), r = p.root.getBoundingClientRect(), fw = Math.min(560, w.width * 0.6), fh = Math.min(460, w.height * 0.7);
    if (paneColumns().length === 1 && paneColumns()[0].length === 1) { pushToastLike("Split first: the last docked pane can't float."); return; }
    p.floating = { x: Math.round(r.left - w.left + 40), y: Math.round(r.top - w.top + 40), w: Math.round(fw), h: Math.round(fh) };
  } else if (!on && p.floating) {
    p.floating = null; p.down = false; p.width = p.width || 400;
    panes.splice(panes.indexOf(p), 1); panes.push(p);
  } else return;
  layoutPanes();
  p.focusThis();
  scheduleSession();
}
/* a floating pane moves by its bar and is sized by its corner (CSS resize); both are remembered */
function wireFloating(p) {
  const bar = p.root.querySelector(".pane-bar");
  bar.addEventListener("mousedown", function (e) {
    if (!p.floating || e.button !== 0 || e.target.closest(".tab, button")) return;
    e.preventDefault();
    const f = p.floating, sx = e.clientX, sy = e.clientY, ox = f.x, oy = f.y, W = workarea.getBoundingClientRect();
    const move = function (ev) {
      f.x = Math.max(0, Math.min(W.width - 80, ox + ev.clientX - sx)); f.y = Math.max(0, Math.min(W.height - 36, oy + ev.clientY - sy));
      p.root.style.left = f.x + "px"; p.root.style.top = f.y + "px";
    };
    const up = function () { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); scheduleSession(); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  });
  bar.addEventListener("dblclick", function (e) { if (p.floating && !e.target.closest(".tab, button")) floatPane(p, false); });
  new ResizeObserver(function () {
    if (!p.floating) return;
    p.floating.w = p.root.offsetWidth; p.floating.h = p.root.offsetHeight;
    scheduleSession();
  }).observe(p.root);
  /* right-click the empty part of the tab bar */
  bar.addEventListener("contextmenu", function (e) {
    if (e.target.closest(".tab")) return;
    e.preventDefault();
    const full = panes.length >= MAX_PANES;
    floatMenu([
      { label: "Split right", fn: function () { splitPane(p, "right"); }, off: full },
      { label: "Split down", fn: function () { splitPane(p, "down"); }, off: full },
      { label: p.floating ? "Dock" : "Float", fn: function () { floatPane(p, !p.floating); } },
      { label: "Pop out into a new window", fn: function () { PopOut.open(p); }, off: !(p.type === "note" && p.noteId != null) }
    ], e.clientX, e.clientY);
  });
}

/* drag a tab onto a pane: near an edge (held there a moment) it splits that way; elsewhere it moves */
const TabSplit = {
  HOLD: 350, side: null, at: 0, pane: null, hint: null,
  zone(col, x, y) {
    const r = col.getBoundingClientRect(), fx = (x - r.left) / r.width, fy = (y - r.top) / r.height;
    const d = Math.min(fx, 1 - fx, fy, 1 - fy);
    if (d > 0.25) return null;
    return d === fx ? "left" : d === 1 - fx ? "right" : d === fy ? "up" : "down";
  },
  over(p, e) {
    const s = panes.length < MAX_PANES ? TabSplit.zone(p.root, e.clientX, e.clientY) : null;
    if (s !== TabSplit.side || p !== TabSplit.pane) { TabSplit.side = s; TabSplit.pane = p; TabSplit.at = performance.now(); TabSplit.show(null); }
    if (s && performance.now() - TabSplit.at >= TabSplit.HOLD) TabSplit.show(p, s);
    return TabSplit.armed();
  },
  armed() { return !!(TabSplit.hint && TabSplit.hint.dataset.side); },
  show(p, side) {
    if (!p) { if (TabSplit.hint) TabSplit.hint.remove(); TabSplit.hint = null; return; }
    if (!TabSplit.hint) { TabSplit.hint = document.createElement("div"); TabSplit.hint.className = "split-hint"; }
    TabSplit.hint.dataset.side = side;
    if (TabSplit.hint.parentNode !== p.root) p.root.appendChild(TabSplit.hint);
  },
  end() { TabSplit.side = TabSplit.pane = null; TabSplit.show(null); },
  drop(src, id, dst) {
    const side = TabSplit.armed() ? TabSplit.hint.dataset.side : null;
    TabSplit.end();
    if (!side) return false;
    if (src === dst && src.tabs.length < 2) return true;
    src.sync();
    if (splitPane(dst, side, id)) src.closeTab(id);
    return true;
  }
};
document.addEventListener("dragend", function () { TabSplit.end(); });

/* Move note tab `id` from pane src to pane dst at position `at` (same pane: reorder). The note
   opens in dst; src shows its neighbouring tab, or closes if it has none left (as VS Code does). */
function moveTab(src, id, dst, at) {
  if (!src || !dst || id == null) return;
  let from = -1;
  for (let k = 0; k < src.tabs.length; k++) if (sameId(src.tabs[k], id)) { from = k; break; }
  if (from === -1) return;
  const realId = src.tabs[from];
  if (src === dst) {
    src.tabs.splice(from, 1);
    if (at > from) at--;
    src.tabs.splice(Math.max(0, Math.min(at, src.tabs.length)), 0, realId);
    src.renderTabs(); scheduleSession();
    return;
  }
  src.sync();
  const already = dst.tabs.some(function (x) { return sameId(x, realId); });
  if (!already) dst.tabs.splice(Math.max(0, Math.min(at, dst.tabs.length)), 0, realId);
  if (dst.type !== "note") { if (dst.type === "taskboard") tbClosePane(dst); else if (dst.type === "sheet") closeSheetPane(dst); }
  dst.open(realId);
  dst.focusThis();
  src.closeTab(realId);                                 /* may close src if that was its last tab */
  renderPanes();
  scheduleSession();
}
function moveTabToNewSplit(src, id, side) {
  if (panes.length >= MAX_PANES || src.tabs.length < 2) return;
  const dst = splitPane(src, side || "right", id);
  if (!dst) return;
  src.closeTab(id);
  dst.focusThis();
}
function clearTabDropMarks() {
  Array.prototype.forEach.call(document.querySelectorAll(".tab.drop-before, .tab.drop-after, .tabs.drop-into, .pane-col.tab-drop-on, .drop-into"), function (el) {
    el.classList.remove("drop-before", "drop-after", "drop-into", "tab-drop-on");
  });
}
/* ---- Open tabs: every pane's tabs as a tree (pane, then folder, then tab), filterable ---- */
const ttFolded = {};
function tabTreeVisible() { return currentView === "tabs" && !sideEl.classList.contains("side-closed"); }
let ttQueued = false;
function tabTreeSoon() { if (ttQueued || !tabTreeVisible()) return; ttQueued = true; requestAnimationFrame(function () { ttQueued = false; renderTabTree(); }); }
function renderTabTree() {
  const box = document.getElementById("tabTree");
  if (!box) return;
  const q = (document.getElementById("tabFilter").value || "").trim().toLowerCase();
  let total = 0, shownN = 0, html = "";
  panes.forEach(function (p, pi) {
    const name = panes.length === 1 ? "Pane" : panes.length === 2 ? (pi === 0 ? "Left pane" : "Right pane") : "Pane " + (pi + 1);
    const focused = p === focusedPane;
    const extra = p.type === "taskboard" ? "Notes" : p.type === "sheet" ? "Sheet" : "";
    /* tabs grouped by folder, folders in name order, tabs in tab order */
    const groups = {}, order = [];
    p.tabs.forEach(function (id) {
      const n = findNote(id); if (!n) return;
      total++;
      const dir = typeof tbnFolderOf === "function" ? tbnFolderOf(n) : "";
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
      const key = pi + "|" + dir, folded = !q && ttFolded[key];
      if (dir) html += '<div class="tt-folder' + (folded ? " folded" : "") + '" data-fold="' + esc(key) + '"><span class="tt-caret">\u25be</span>' + ico("folder") + '<span class="tt-fname">' + esc(dir) + '</span><span class="tt-n">' + groups[dir].length + "</span></div>";
      if (folded) return;
      groups[dir].forEach(function (n) {
        const active = sameId(n.id, p.noteId) && p.type === "note";
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
  const box = document.getElementById("tabTree"), filt = document.getElementById("tabFilter");
  if (!box) return;
  const paneOf = function (el) { return panes[+el.dataset.pane]; };
  filt.addEventListener("input", renderTabTree);
  filt.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { const first = box.querySelector(".tt-tab"); if (first) { e.preventDefault(); first.click(); } }
    else if (e.key === "ArrowDown") { const f = box.querySelector(".tt-tab"); if (f) { e.preventDefault(); f.focus(); } }
    else if (e.key === "Escape") { if (filt.value) { filt.value = ""; renderTabTree(); } }
  });
  box.addEventListener("click", function (e) {
    const fold = e.target.closest(".tt-folder");
    if (fold) { ttFolded[fold.dataset.fold] = !ttFolded[fold.dataset.fold]; renderTabTree(); return; }
    const head = e.target.closest(".tt-phead");
    if (head) { const hp = paneOf(head); if (hp) hp.focusThis(); renderTabTree(); return; }
    const row = e.target.closest(".tt-tab");
    if (!row) return;
    const p = paneOf(row), id = row.dataset.id, n = state.notes.filter(function (x) { return String(x.id) === id; })[0];
    if (!p || !n) return;
    if (e.target.closest("[data-close]")) { p.closeTab(n.id); return; }
    p.focusThis();
    if (p.type !== "note") { if (p.type === "taskboard") tbClosePane(p); else if (p.type === "sheet") closeSheetPane(p); }
    if (!sameId(n.id, p.noteId) || p.type !== "note") p.open(n.id);
    renderTabTree();
  });
  box.addEventListener("keydown", function (e) {
    const row = e.target.closest(".tt-tab");
    if (!row) return;
    const rows = Array.prototype.slice.call(box.querySelectorAll(".tt-tab")), i = rows.indexOf(row);
    if (e.key === "Enter") { e.preventDefault(); row.click(); }
    else if (e.key === "ArrowDown" && rows[i + 1]) { e.preventDefault(); rows[i + 1].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (rows[i - 1]) rows[i - 1].focus(); else filt.focus(); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); const p = paneOf(row), n = state.notes.filter(function (x) { return String(x.id) === row.dataset.id; })[0]; if (p && n) p.closeTab(n.id); }
  });
  box.addEventListener("contextmenu", function (e) {
    const row = e.target.closest(".tt-tab");
    if (!row) return;
    e.preventDefault();
    const p = paneOf(row), n = state.notes.filter(function (x) { return String(x.id) === row.dataset.id; })[0];
    if (p && n) tabMenu(p, n.id, e.clientX, e.clientY);
  });
  /* drag a tab: onto another pane's group in the tree (or a pane itself) to move it there */
  box.addEventListener("dragstart", function (e) {
    const row = e.target.closest(".tt-tab");
    if (!row) return;
    e.dataTransfer.setData("text/x-cf-tab", JSON.stringify({ pane: +row.dataset.pane, id: row.dataset.id }));
    e.dataTransfer.effectAllowed = "move";
    row.classList.add("dragging");
  });
  box.addEventListener("dragend", function () { clearTabDropMarks(); Array.prototype.forEach.call(box.querySelectorAll(".dragging, .drop-on"), function (el) { el.classList.remove("dragging", "drop-on"); }); });
  box.addEventListener("dragover", function (e) {
    if (Array.prototype.indexOf.call(e.dataTransfer.types, "text/x-cf-tab") === -1) return;
    const grp = e.target.closest(".tt-pane");
    if (!grp) return;
    e.preventDefault(); e.dataTransfer.dropEffect = "move";
    Array.prototype.forEach.call(box.querySelectorAll(".drop-on"), function (el) { if (el !== grp) el.classList.remove("drop-on"); });
    grp.classList.add("drop-on");
  });
  box.addEventListener("drop", function (e) {
    const grp = e.target.closest(".tt-pane");
    if (!grp) return;
    e.preventDefault();
    grp.classList.remove("drop-on");
    const info = JSON.parse(e.dataTransfer.getData("text/x-cf-tab") || "{}"), src = panes[info.pane], dst = panes[+grp.dataset.pane];
    if (!src || !dst) return;
    const before = e.target.closest(".tt-tab");
    let at = dst.tabs.length;
    if (before) { let bi = -1; dst.tabs.forEach(function (x, k) { if (String(x) === before.dataset.id) bi = k; }); if (bi !== -1) at = bi; }
    moveTab(src, info.id, dst, at);
    renderTabTree();
  });
})();
/* a floating menu at (x, y): items are { label, fn, hint, off } or null for a divider */
function floatMenu(items, x, y, after) {
  tabMenuClose();
  const m = document.createElement("div");
  m.className = "tab-menu"; m.setAttribute("role", "menu");
  items.forEach(function (it) {
    if (!it) { const sep = document.createElement("div"); sep.className = "tab-menu-sep"; m.appendChild(sep); return; }
    const b = document.createElement("button");
    b.type = "button"; b.className = "tab-menu-item"; b.setAttribute("role", "menuitem"); b.disabled = !!it.off;
    b.innerHTML = "<span>" + esc(it.label) + "</span>" + (it.hint ? "<kbd>" + esc(it.hint) + "</kbd>" : "");
    b.addEventListener("click", function () { tabMenuClose(); it.fn(); if (after) after(); });
    m.appendChild(b);
  });
  document.body.appendChild(m);
  tabMenuEl = m;
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + "px";
  m.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + "px";
  const first = m.querySelector("button:not(:disabled)"); if (first) first.focus();
}
/* right-click a tab: move it to another pane, to a new split, or close it */
let tabMenuEl = null;
function tabMenuClose() { if (tabMenuEl) { tabMenuEl.remove(); tabMenuEl = null; } }
function tabMenu(p, id, x, y) {
  const me = panes.indexOf(p), full = panes.length >= MAX_PANES || p.tabs.length < 2, items = [];
  panes.forEach(function (q, k) {
    if (q === p) return;
    const n = q.type === "note" && q.note ? q.note() : null;
    const name = panes.length === 2 ? (k > me ? "the right pane" : "the left pane") : "pane " + (k + 1) + (n ? " (" + n.title + ")" : "");
    items.push({ label: "Move to " + name, fn: function () { moveTab(p, id, q, q.tabs.length); }, hint: panes.length === 2 ? (k > me ? "Ctrl+Alt+\u2192" : "Ctrl+Alt+\u2190") : "" });
  });
  items.push({ label: "Move to a new split", fn: function () { moveTabToNewSplit(p, id); }, off: full },
    { label: "Move to a split below", fn: function () { moveTabToNewSplit(p, id, "down"); }, off: full },
    { label: "Move into a new window", fn: function () { PopOut.open(p, id); } },
    null,
    { label: "Close", fn: function () { p.closeTab(id); } });
  floatMenu(items, x, y);
}
document.addEventListener("mousedown", function (e) { if (tabMenuEl && !tabMenuEl.contains(e.target)) tabMenuClose(); }, true);
document.addEventListener("keydown", function (e) { if (tabMenuEl && e.key === "Escape") { e.preventDefault(); tabMenuClose(); } }, true);
/* Ctrl+Alt+Right / Left: the current tab to the next / previous pane (a new split if there is none to the right) */
function moveCurrentTab(dir) {
  const p = focusedPane || panes[0];
  if (!p || p.type !== "note" || p.noteId == null) return;
  const k = panes.indexOf(p) + dir;
  if (k >= 0 && k < panes.length) moveTab(p, p.noteId, panes[k], panes[k].tabs.length);
  else if (dir > 0) moveTabToNewSplit(p, p.noteId);
}
/* switching a pane away from whatever isn't a note (a sheet, the board, a docked sketch, the graph),
   before it shows something else. One place, so every way of opening something handles all of them. */
function leavePaneContent(p) {
  if (p.type === "sketch" && typeof skReleasePane === "function") skReleasePane(p);
  else if (p.type === "sheet") { flushSheets(); p.sheetId = null; if (p.grid) p.grid.root.classList.remove("show"); }
  else if (p.type === "taskboard") { if (p.tbRoot) p.tbRoot.classList.remove("show"); }
  else if (p.type === "graph") hideGraph();
  if (p.type !== "note" && p.type !== "sketch") p.type = "note";
}

function closePane(p) {
  if (panes.filter(function (q) { return !q.floating; }).length < 2 && !p.floating) return;
  if (p === graphPane) closeGraph();                       /* the graph goes with its pane */
  if (sk && sk.dockedIn === p) { closeSketch(); return; }   /* closeSketch comes back here */
  if (p.type === "sheet") flushSheets();
  p.sync();
  const i = panes.indexOf(p);
  /* the freed room goes to a neighbour: the pane above or below in its column, else the column beside */
  const col = paneColumns().filter(function (c) { return c.indexOf(p) !== -1; })[0] || [];
  const k = col.indexOf(p);
  let neighbour = null;
  if (col.length > 1) {
    neighbour = col[k > 0 ? k - 1 : 1];
    neighbour.height = (neighbour.height || 1) + (p.height || 1);
    if (k === 0) { neighbour.down = false; neighbour.width = p.width; }
  }
  panes = panes.filter(function (q) { return q !== p; });
  if (p.root.parentNode) p.root.parentNode.removeChild(p.root);
  if (!neighbour) {
    const docked = panes.filter(function (q) { return !q.floating; });
    neighbour = docked[Math.max(0, Math.min(docked.length - 1, i - 1))] || panes[0];
    if (!p.floating && col.length === 1) {
      const cols = paneColumns(), nc = cols.filter(function (c) { return c.indexOf(neighbour) !== -1; })[0];
      if (nc) nc[0].width = (nc[0].width || 1) + (p.width || 1);
    }
  }
  layoutPanes();
  if (focusedPane === p) focusedPane = neighbour;
  renderPanes();
  neighbour.focusThis();
  renderSidebar();
  scheduleSession();
}

/* Split (the button, Ctrl+\): another pane beside the one you're in (Alt: below it). It never
   closes one: each pane has its own close button. */
function toggleDual(down) {
  splitPane(focusedPane || panes[0], down ? "down" : "right");
}

/* everything back where it started: one pane, the sidebar on the left at its usual width */
function resetLayout() {
  panes.slice().forEach(function (p) { p.floating = null; });
  while (panes.length > 1) closePane(panes[panes.length - 1]);
  panes[0].down = false; panes[0].width = panes[0].height = 1;
  SideDock.set(false);
  sideWidth = 300; sideEl.style.setProperty("--side-w", "300px");
  layoutPanes();
  scheduleSession();
}

/* sidebar drag */
const sideEl = document.getElementById("side");
let sideWidth = 300;
document.getElementById("sideGutter").addEventListener("mousedown", function (e) {
  e.preventDefault();
  const g = e.currentTarget;
  const startX = e.clientX, startW = sideWidth;
  g.classList.add("drag");
  document.body.classList.add("resizing");
  function move(ev) {
    sideWidth = Math.max(220, Math.min(680, startW + (ev.clientX - startX) * (SideDock.right ? -1 : 1)));
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


/* the sidebar on the right: drag its title past the middle of the window (the activity bar goes too) */
const SideDock = {
  right: false,
  set(on) {
    SideDock.right = !!on;
    document.body.classList.toggle("side-right", SideDock.right);
    scheduleSession();
  },
  init() {
    sideEl.addEventListener("mousedown", function (e) {
      if (e.button !== 0 || !e.target.closest(".side-head") || e.target.closest("button, input, a, [role=button]")) return;
      const sx = e.clientX;
      let moved = false;
      const move = function (ev) { if (Math.abs(ev.clientX - sx) > 8) { moved = true; document.body.classList.add("side-moving"); } };
      const up = function (ev) {
        window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up);
        document.body.classList.remove("side-moving");
        if (moved) SideDock.set(ev.clientX > window.innerWidth / 2);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    });
  }
};
SideDock.init();
