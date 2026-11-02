

/* target for Shift+click: the next pane, creating one if there is only one */
function paneForShift(p) {
  if (panes.length < 2) return addPane(p);
  return nextPane(p);
}

function nextPane(p) {
  var i = panes.indexOf(p);
  if (panes.length < 2) return p;
  return panes[(i + 1) % panes.length];
}

/* mirror edits into any other pane showing the same note */
var mirrorTimer = null;
function scheduleMirror(source, noteId) {
  if (panes.length < 2) return;
  if (mirrorTimer) clearTimeout(mirrorTimer);
  mirrorTimer = setTimeout(function () {
    mirrorTimer = null;
    source.sync();
    panes.forEach(function (other) {
      if (other === source || !sameId(other.noteId, noteId)) return;
      if (other.activeLine !== null || document.activeElement === other.srcEl) return;
      other.reload();
      other.render();
    });
  }, 400);
}

