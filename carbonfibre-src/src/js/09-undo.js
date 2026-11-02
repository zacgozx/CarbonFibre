/* ============================================================
   Undo - one history per note, so switching tabs keeps it.
   A step is pushed on a burst boundary: after a pause in typing,
   or right before anything that changes the shape of the note.
   ============================================================ */

var HIST_STEPS = 80;          /* steps kept per note */
var HIST_BYTES = 4e6;         /* and a ceiling on total text held */
var HIST_IDLE = 550;          /* ms of quiet that ends a typing burst */
var noteHistory = {};         /* noteId -> { undo: [], redo: [], timer, pending }. Not "history": that name is taken by window.history. */

function histFor(id) {
  var k = String(id);
  if (!noteHistory[k]) noteHistory[k] = { undo: [], redo: [], timer: null, pending: null };
  return noteHistory[k];
}
function histTrim(h) {
  var bytes = 0;
  for (var i = h.undo.length - 1; i >= 0; i--) {
    bytes += h.undo[i].text.length;
    if (h.undo.length - i > HIST_STEPS || bytes > HIST_BYTES) { h.undo.splice(0, i + 1); break; }
  }
}
/* Record the state as it was BEFORE the edit about to happen.
   Call with the pane's current lines; repeated calls inside one burst are ignored. */
function histMark(p, immediate) {
  var n = p.note();
  if (!n) return;
  var h = histFor(n.id);
  var snap = { text: p.lines.join("\n"), line: p.activeLine, caret: p.caret };
  if (h.timer) clearTimeout(h.timer);
  if (h.pending === null) h.pending = snap;        /* first edit of this burst */
  var commit = function () {
    h.timer = null;
    if (h.pending === null) return;
    var last = h.undo[h.undo.length - 1];
    if (!last || last.text !== h.pending.text) {
      h.undo.push(h.pending);
      h.redo = [];
      histTrim(h);
    }
    h.pending = null;
  };
  if (immediate) commit();
  else h.timer = setTimeout(commit, HIST_IDLE);
}
/* Structural edits end the burst immediately, so one Ctrl+Z undoes one of them. */
function histBreak(p) { histMark(p, true); }

function histApply(p, snap) {
  p.clearCarets();
  p.clearSelectAll();
  p.deactivate();
  p.lines = snap.text.split("\n");
  p.commit(true);
  if (p.mode === "live") {
    p.activeLine = null;
    p.render();
    var line = Math.max(0, Math.min(snap.line === null ? 0 : snap.line, p.lines.length - 1));
    p.setActive(line, Math.min(snap.caret || 0, p.lines[line].length));
  } else {
    p.srcEl.value = snap.text;
    p.render();
  }
}
function histUndo(p) {
  var n = p.note();
  if (!n) return;
  var h = histFor(n.id);
  if (h.timer) { clearTimeout(h.timer); h.timer = null; }
  if (h.pending !== null) {                 /* an unfinished burst is itself a step */
    var last0 = h.undo[h.undo.length - 1];
    if (!last0 || last0.text !== h.pending.text) h.undo.push(h.pending);
    h.pending = null;
  }
  if (!h.undo.length) return;
  var now = { text: p.lines.join("\n"), line: p.activeLine, caret: p.caret };
  var prev = h.undo.pop();
  if (prev.text === now.text && h.undo.length) prev = h.undo.pop();
  h.redo.push(now);
  histApply(p, prev);
}
function histRedo(p) {
  var n = p.note();
  if (!n) return;
  var h = histFor(n.id);
  if (!h.redo.length) return;
  var next = h.redo.pop();
  h.undo.push({ text: p.lines.join("\n"), line: p.activeLine, caret: p.caret });
  histApply(p, next);
}

/* ============================================================
   PANE - an independent live editor
   ============================================================ */

var panes = [];
var focusedPane = null;

