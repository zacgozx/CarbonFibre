function createPane(index) {
  var p = {
    index: index,
    noteId: null,
    lines: [],
    fmeta: [],
    stale: false,
    mode: "live",
    activeLine: null,
    caret: 0,
    goalCol: null,
    ta: null, hl: null, wrap: null,
    blurTimer: null,
    typingTimer: null,
    previewTimer: null,
    blCollapsed: false,
    tabs: [],
    width: 1,
    type: "note",        /* "note" or "sketch" - what this pane is showing */
    sketchOpen: -1,      /* for a sketch pane: the fence line it is bound to */
    sheetId: null,       /* for a sheet pane: which sheet it shows */
    grid: null,
    allSelected: false, selFrom: -1, selTo: -1, selAnchor: -1, selFocus: -1,
    carets: [], col: null
  };
  var dragFrom = -1;   /* line index where a mouse drag started */
  var colDrag = null;  /* anchor for an Alt+drag column selection */

