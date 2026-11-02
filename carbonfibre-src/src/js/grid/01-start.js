function makeGrid(p) {
  var g = {
    pane: p, sheet: null, r: 0, c: 0, ar: 0, ac: 0,   /* cursor (sheet rows and columns), and the anchor of a range */
    editing: false, undo: [], redo: [], drag: false,
    filters: [], view: [], viewPos: null, find: { q: "", fuzzy: false, hits: [], at: -1, set: null }
  };
  var ROW_H = 27, BUFFER = 30;                       /* rows are a fixed height so only those on screen are drawn */

  var wrap = document.createElement("div");
  wrap.className = "sheet-wrap";
  wrap.innerHTML =
    '<div class="sh-bar">' +
      '<span class="sh-title"></span>' +
      '<span class="sh-sep"></span>' +
      '<button class="mini-pill" data-sh="row+" title="Add a row below">Row +</button>' +
      '<button class="mini-pill" data-sh="row-" title="Remove this row">Row &minus;</button>' +
      '<button class="mini-pill" data-sh="col+" title="Add a column to the right">Col +</button>' +
      '<button class="mini-pill" data-sh="col-" title="Remove this column">Col &minus;</button>' +
      '<span class="sh-sep"></span>' +
      '<button class="mini-pill" data-sh="md" title="Put the selection (or the whole sheet) into a note as a table">Insert as table</button>' +
      '<button class="mini-pill" data-sh="csv">Export CSV</button>' +
      '<button class="mini-pill sh-helpbtn" aria-pressed="false" title="Show or hide the function cheatsheet">\u0192x Functions</button>' +
      '<span class="sh-find">' + ico("search") +
        '<input class="sh-find-in" spellcheck="false" placeholder="Find (Ctrl+F)" aria-label="Find in sheet">' +
        '<button class="sh-fuzzy" aria-pressed="false" title="Fuzzy: letters in order, e.g. clnt finds Clinton">Fuzzy</button>' +
        '<span class="sh-find-count"></span>' +
        '<button class="sh-find-nav" data-dir="-1" title="Previous (Shift+Enter)" aria-label="Previous match">' + ico("chevronUp") + '</button>' +
        '<button class="sh-find-nav" data-dir="1" title="Next (Enter)" aria-label="Next match">' + ico("chevronDown") + '</button>' +
      '</span>' +
    "</div>" +
    '<div class="sh-fx"><span class="sh-addr">A1</span><span class="sh-fxlbl" title="The cell\'s contents: a formula starts with =">fx</span>' +
      '<input class="sh-fxin" spellcheck="false" aria-label="Cell contents"></div>' +
    '<div class="sh-main"><div class="sh-scroll"><table class="sh-table"><thead></thead><tbody></tbody></table>' +
    '<input class="sh-input" spellcheck="false" /><div class="sh-handle" title="Drag to fill; double-click to fill down beside the data"></div><div class="sh-fillbox"></div></div>' +
    '<aside class="sh-help" hidden aria-label="Function cheatsheet"><div class="sh-help-head"><b>Functions</b>' +
      '<button class="sh-help-x" title="Hide" aria-label="Hide the cheatsheet">\u00d7</button></div>' +
      '<input class="sh-help-in" spellcheck="false" placeholder="Search functions" aria-label="Search functions">' +
      '<div class="sh-help-body"></div></aside></div>' +
    '<div class="sh-status"><span class="sh-counts"></span><span class="sh-info"></span></div>';

  g.root = wrap;
  g.head = wrap.querySelector("thead");
  g.body = wrap.querySelector("tbody");
  g.scroll = wrap.querySelector(".sh-scroll");
  g.input = wrap.querySelector(".sh-input");
  g.titleEl = wrap.querySelector(".sh-title");
  g.infoEl = wrap.querySelector(".sh-info");
  g.countsEl = wrap.querySelector(".sh-counts");
  g.fxIn = wrap.querySelector(".sh-fxin");
  g.addrEl = wrap.querySelector(".sh-addr");
  g.findIn = wrap.querySelector(".sh-find-in");

  function rows() { return g.sheet ? g.sheet.rows : [[""]]; }
  function cols() { return rows()[0] ? rows()[0].length : 1; }
  function cellAt(r, c) { var rw = rows()[r]; return rw && rw[c] !== undefined ? rw[c] : ""; }
  g.calc = makeSheetCalc(rows, null);
  g.calc = (function () {                              /* the sheet's own name means this sheet */
    var c = makeSheetCalc(rows, "\u0000");
    var titled = null, titledFor = null;
    var cur = function () { if (!g.sheet) return c; if (titledFor !== g.sheet) { titled = makeSheetCalc(rows, g.sheet.title); titledFor = g.sheet; } return titled; };
    return { value: function (r, k) { return cur().value(r, k); }, text: function (r, k) { return cur().text(r, k); }, isFormula: function (r, k) { return cur().isFormula(r, k); },
             inside: function (r, k) { return cur().inside(r, k); }, reset: function () { c.reset(); if (titled) titled.reset(); } };
  })();
  function shown(r, c) { return g.calc.text(r, c); }

  g.snapshot = function () {
    g.undo.push(JSON.stringify(rows()));
    if (g.undo.length > 60) g.undo.shift();
    g.redo = [];
  };
  /* another sheet is about to be rewritten by this step (a moved / inserted / deleted row or column
     it refers to): its rows join the step, so one undo puts both back */
  g.snapshotOther = function (o) {
    var top = g.undo[g.undo.length - 1];
    if (top === undefined) return;
    if (typeof top === "string") top = g.undo[g.undo.length - 1] = { rows: top, others: [] };
    if (!top.others.some(function (x) { return x.id === o.id; })) top.others.push({ id: o.id, rows: JSON.stringify(o.rows) });
  };
  /* swap the sheets of a step with their current state: returns the step to push the other way */
  var swapStep = function (step) {
    var back = JSON.stringify(rows());
    if (typeof step === "string") { g.sheet.rows = JSON.parse(step); return back; }
    var out = { rows: back, others: [] };
    g.sheet.rows = JSON.parse(step.rows);
    step.others.forEach(function (x) {
      var o = sheets.filter(function (q) { return q.id === x.id; })[0]; if (!o) return;
      out.others.push({ id: o.id, rows: JSON.stringify(o.rows) });
      o.rows = JSON.parse(x.rows);
      if (o.note) noteTableWriteBack(o); else sheetDirty(o);
    });
    return out;
  };
  g.changed = function () {
    g.calc.reset(); resetSheetCalcs(); g.types = null; g.colIdx = {};
    if (!g.sheet) return;
    if (g.sheet.note) noteTableWriteBack(g.sheet);   /* bound to a table inside a note */
    else sheetDirty(g.sheet);
  };

  /* the stages, in order */
  defineView();          /* which rows show: the header row, then rows passing every filter */
  defineRender();        /* drawing the rows on screen, highlights and the floating input */
  defineEditing();       /* typing into cells and the formula bar */
  defineStructure();     /* adding and removing rows and columns */
  defineSorting();       /* header clicks sort */
  defineClipboard();     /* copy and paste as tab-separated text */
  defineFind();          /* search and fuzzy search */
  defineFill();          /* the fill handle, Ctrl+D / Ctrl+R and Ctrl+Enter */
  wireEvents();          /* mouse and keyboard */

