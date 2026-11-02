

/* ---- opening sheets in panes ---- */

function pushToastLike(msg) {
  var el = document.getElementById("saveState");
  if (!el) return;
  el.className = "saving";
  el.textContent = msg;
  setTimeout(function () { setSaveState(""); el.textContent = ""; }, 2200);
}

/* closing a sheet's tab: save it and show the pane's note again */
function closeSheetPane(p) {
  flushSheets();
  if (p.grid) p.grid.root.classList.remove("show");
  p.type = "note"; p.sheetId = null;
  p.open(p.noteId != null && findNote(p.noteId) ? p.noteId : p.tabs[0]);
  renderSidebar();
  scheduleSession();
}
function openSheetInPane(p, sheetId) {
  var sh = findSheet(sheetId);
  if (!sh) return;
  p.sync();
  p.deactivate();
  if (!p.grid) { p.grid = makeGrid(p); p.root.appendChild(p.grid.root); }
  p.type = "sheet";
  p.sheetId = sheetId;
  p.grid.open(sh);
  p.render();
  p.focusThis();
  p.grid.root.focus();
  renderSidebar();
  scheduleSession();
}
function openSheetSplit(from, sheetId) {
  var target = panes.length < MAX_PANES ? addPane(from) : nextPane(from);
  openSheetInPane(target, sheetId);
}

/* ---- Phase 6: a markdown table in a note, edited as a sheet ---- */

function noteTableToSheet(p) {
  var n = p.note();
  if (!n || p.activeLine === null) return null;
  var t = tableRowsAt(p.lines, p.fmeta, p.activeLine);
  if (!t) return null;
  return {
    id: "tbl:" + n.id + ":" + t.first,
    title: "Table",
    rows: t.rows,
    aligns: t.aligns,
    note: n,                 /* marks this as a view onto a note, not a file */
    notePane: p,
    first: t.first,
    last: t.last
  };
}
/* write the grid back into the note's lines, replacing the original table block */
function noteTableWriteBack(sh) {
  var p = sh.notePane;
  if (!p || !sameId(p.noteId, sh.note.id)) return;
  var md = rowsToMarkdown(sh.rows, sh.aligns);
  histBreak(p);
  Array.prototype.splice.apply(p.lines, [sh.first, sh.last - sh.first + 1].concat(md));
  sh.last = sh.first + md.length - 1;
  p.commit(true);
  p.activeLine = null;
  p.render();
}
function editTableAsSheet(p) {
  var sh = noteTableToSheet(p);
  if (!sh) { return false; }
  var target = panes.length < MAX_PANES ? addPane(p) : nextPane(p);
  if (!target.grid) { target.grid = makeGrid(target); target.root.appendChild(target.grid.root); }
  target.type = "sheet";
  target.sheetId = null;
  target.grid.open(sh);
  target.render();
  target.grid.root.focus();
  return true;
}

/* sheet selection -> a markdown table at the cursor in a note pane */
function sheetIntoNote(g) {
  var target = null;
  panes.forEach(function (q) { if (!target && q.type === "note" && q.note()) target = q; });
  if (!target) { alert("Open a note in another pane first."); return; }
  var rows = g.rangeRows();                                              /* what the cells show */
  if (rows.length === 1 && rows[0].length === 1) rows = g.displayRows ? g.displayRows() : g.sheet.rows;   /* nothing selected: the lot */
  target.insertBlock(rowsToMarkdown(rows, g.sheet.aligns).join("\n"));
  target.focusThis();
}

/* ============================================================
   Time blocks - a countdown for the task in hand. It does not
   stop at zero: it keeps counting into overtime in red, so an
   overrun is visible rather than silent, and every block is
   logged as planned against actual.
   ============================================================ */

