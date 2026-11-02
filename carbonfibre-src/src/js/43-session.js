/* ============================================================
   session - what was open, restored after a refresh
   ============================================================ */

var SESSION_KEY = "carbonfibre-session";
var sessionTimer = null, restoringSession = false;

function saveSession() {
  if (restoringSession) return;
  try {
    storeSet(SESSION_KEY, JSON.stringify({
      backend: state.backend,
      folder: state.dirHandle ? state.dirHandle.name : null,
      panes: panes.map(function (p) {
        return { tabs: p.tabs, noteId: p.noteId, mode: p.mode, width: p.width, type: p.type,
          sketchOpen: p.parked ? p.parked.open : p.sketchOpen, sheetId: p.type === "sheet" ? p.sheetId : null,
          scroll: p.type === "note" ? (p.mode === "live" ? p.editorEl.scrollTop : p.srcEl.scrollTop) : 0 };
      }),
      focused: panes.indexOf(focusedPane),
      view: currentView, sideClosed: sideEl.classList.contains("side-closed"), sideWidth: sideWidth,
      collapsed: collapsedFolders, sort: sortMode
    }));
  } catch (e) {}
}
function scheduleSession() {
  if (sessionTimer) clearTimeout(sessionTimer);
  sessionTimer = setTimeout(function () { sessionTimer = null; saveSession(); }, 300);
}
function restoreSession() {
  var ss = null;
  try { ss = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (e) {}
  if (!ss || ss.backend !== state.backend || !Array.isArray(ss.panes)) return false;
  if (state.backend === "folder" && ss.folder && state.dirHandle && ss.folder !== state.dirHandle.name) return false;
  var wanted = ss.panes.map(function (sp) {
    return { tabs: (sp.tabs || []).filter(function (t) { return findNote(t); }), noteId: sp.noteId,
      mode: sp.mode || "live", width: sp.width || 1, scroll: sp.scroll || 0,
      type: sp.type === "sketch" || sp.type === "sheet" || sp.type === "taskboard" ? sp.type : "note",
      sketchOpen: sp.sketchOpen, sheetId: sp.sheetId };
  }).filter(function (sp) { return sp.tabs.length; }).slice(0, MAX_PANES);
  if (!wanted.length) return false;

  restoringSession = true;
  while (panes.length > 1) closePane(panes[panes.length - 1]);
  wanted.forEach(function (sp, i) {
    var p = i === 0 ? panes[0] : addPane(panes[panes.length - 1]);
    p.tabs = sp.tabs.slice();
    p.mode = sp.mode;
    p.width = sp.width;
    p.open(findNote(sp.noteId) ? sp.noteId : sp.tabs[0]);
  });
  layoutPanes();
  renderPanes();
  var fp = panes[Math.max(0, Math.min(panes.length - 1, ss.focused || 0))];
  fp.focusThis();
  if (ss.collapsed) collapsedFolders = ss.collapsed;
  if (ss.sideWidth) { sideWidth = ss.sideWidth; sideEl.style.setProperty("--side-w", sideWidth + "px"); }
  if (ss.sort) setSort(ss.sort);
  if (ss.view === "notes" || ss.view === "search") showView(ss.view);
  if (ss.sideClosed) showView(currentView, true);
  renderSidebar();
  setTimeout(function () {
    wanted.forEach(function (sp, i) {
      var p = panes[i]; if (!p) return;
      if (p.mode === "live") p.editorEl.scrollTop = sp.scroll; else p.srcEl.scrollTop = sp.scroll;
    });
    wanted.forEach(function (sp, i) { if (sp.type === "taskboard" && panes[i]) tbOpenInPane(panes[i]); });
    wanted.forEach(function (sp, i) {                  /* sheets come back by id */
      if (sp.type !== "sheet" || !sp.sheetId || !panes[i]) return;
      if (findSheet(sp.sheetId)) openSheetInPane(panes[i], sp.sheetId);
    });
    /* reopen a docked drawing, if that fence is still where it was */
    /* every docked drawing comes back; opening each one parks the one before it,
       so the last to open is the live board and the rest show as snapshots */
    wanted.forEach(function (sp, i) {
      if (sp.type !== "sketch" || !(sp.sketchOpen >= 0) || !panes[i]) return;
      var host = panes[i];
      var src = skSourcePane(sp.noteId != null ? sp.noteId : host.noteId, host);
      var idx = skFenceFind(src, sp.sketchOpen, null);
      if (idx >= 0) openSketch(src, idx, host);
    });
    restoringSession = false;
  }, 0);
  return true;
}

