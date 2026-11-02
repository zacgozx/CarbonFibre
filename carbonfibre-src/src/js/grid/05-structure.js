  function defineStructure() {
    var lastRow = function () { return g.view.length ? g.view[g.view.length - 1] : 0; };
    /* whole columns / rows / everything: the anchor (ar, ac) stays where the selection began */
    g.selectCols = function (from, to) {
      g.ac = from; g.c = to; g.ar = lastRow(); g.r = g.view[0] || 0; g.selKind = "cols";
      g.paint(); g.revealCol();
    };
    g.selectRows = function (from, to) {
      g.ar = from; g.r = to; g.ac = cols() - 1; g.c = 0; g.selKind = "rows";
      g.reveal(to); g.paint();
    };
    g.selectAll = function () { g.r = 0; g.c = 0; g.ar = lastRow(); g.ac = cols() - 1; g.selKind = "all"; g.paint(); };
    /* the rows and columns the selection covers */
    g.selSpan = function () {
      return { r1: Math.min(g.r, g.ar), r2: Math.max(g.r, g.ar), c1: Math.min(g.c, g.ac), c2: Math.max(g.c, g.ac) };
    };
    /* insert n rows at `at` (or columns), each one moving formulas along; one undo step */
    g.insertRows = function (at, n) {
      g.snapshot();
      for (var k = 0; k < n; k++) { rows().splice(at, 0, blankRows(1, cols())[0]); g.refsMoved("r", at, 1); }
      g.changed(); g.render(); g.selectRows(at, at + n - 1);
    };
    g.insertCols = function (at, n) {
      g.snapshot();
      for (var k = 0; k < n; k++) { rows().forEach(function (r) { r.splice(at, 0, ""); }); g.filters.splice(at, 0, ""); g.refsMoved("c", at, 1); }
      g.changed(); g.render(); g.selectCols(at, at + n - 1);
    };
    /* delete rows r1..r2 (or columns), last first so the indexes stay true; always keeps one */
    g.deleteRows = function (r1, r2) {
      r2 = Math.min(r2, rows().length - 1);
      if (r2 - r1 + 1 >= rows().length) r1 = Math.min(r1 + 1, r2 + 1);
      if (r1 > r2) return;
      g.snapshot();
      for (var r = r2; r >= r1; r--) { rows().splice(r, 1); g.refsMoved("r", r, -1); }
      g.r = g.ar = Math.min(r1, rows().length - 1); g.ac = g.c; g.selKind = null;
      g.changed(); g.render();
    };
    g.deleteCols = function (c1, c2) {
      c2 = Math.min(c2, cols() - 1);
      if (c2 - c1 + 1 >= cols()) c1 = Math.min(c1 + 1, c2 + 1);
      if (c1 > c2) return;
      g.snapshot();
      for (var c = c2; c >= c1; c--) { rows().forEach(function (r) { r.splice(c, 1); }); g.filters.splice(c, 1); g.refsMoved("c", c, -1); }
      g.c = g.ac = Math.min(c1, cols() - 1); g.ar = g.r; g.selKind = null;
      g.changed(); g.render();
    };
    /* move rows (axis "r") or columns ("c") from1..from2 to sit before index `to` (old numbering);
       formulas follow the cells, here and in sheets that name this one; one undo step */
    g.refsPermuted = function (axis, perm) {
      var me = g.sheet.title.toLowerCase();
      var fix = function (rowsList, local) {
        rowsList.forEach(function (row) { row.forEach(function (v, k) {
          if (shFormulaOf(v) === null) return;
          row[k] = shMapRefs(v, function (ref) {
            var mine = ref.sheet ? ref.sheet.toLowerCase() === me : local;
            var o = { r: ref.r, c: ref.c };
            if (mine && perm[ref[axis]] !== undefined) o[axis] = perm[ref[axis]];
            return o;
          }, true);
        }); });
      };
      fix(rows(), true);
      sheets.forEach(function (o) { if (o !== g.sheet && o.rows && o.rows.some(function (r) { return r.some(function (v) { return typeof v === "string" && v.indexOf("!") !== -1; }); })) { var was = JSON.stringify(o.rows); g.snapshotOther(o); fix(o.rows, false); if (JSON.stringify(o.rows) !== was) { if (o.note) noteTableWriteBack(o); else sheetDirty(o); } } });
    };
    g.moveBlock = function (axis, from1, from2, to) {
      var n = axis === "r" ? rows().length : cols();
      if (from1 < 0 || from2 >= n || (to >= from1 && to <= from2 + 1)) return false;
      if (axis === "r" && g.view.length !== rows().length) { pushToastLike("Clear the filter to move rows (hidden rows make \u201cup\u201d and \u201cdown\u201d unclear)."); return false; }
      var idx = []; for (var i = 0; i < n; i++) idx.push(i);
      var block = idx.splice(from1, from2 - from1 + 1), at = to > from2 ? to - block.length : to;
      Array.prototype.splice.apply(idx, [at, 0].concat(block));
      var perm = []; idx.forEach(function (old, nu) { perm[old] = nu; });
      g.snapshot();
      if (axis === "r") { var old = rows(); g.sheet.rows = idx.map(function (k) { return old[k]; }); }
      else { rows().forEach(function (r, k) { var copy = r.slice(); rows()[k] = idx.map(function (j) { return copy[j] !== undefined ? copy[j] : ""; }); }); var f = g.filters.slice(); g.filters = idx.map(function (j) { return f[j] || ""; }); }
      g.refsPermuted(axis, perm);
      g.sortState = null; g.changed(); g.render();
      if (axis === "r") g.selectRows(at, at + block.length - 1); else g.selectCols(at, at + block.length - 1);
      return true;
    };
    /* by one step: the rows / columns the selection covers (Alt+arrows, the menu) */
    g.nudge = function (axis, dir) {
      var sp = g.selSpan(), a = axis === "r" ? sp.r1 : sp.c1, b = axis === "r" ? sp.r2 : sp.c2;
      var n = axis === "r" ? rows().length : cols();
      if (dir < 0 ? a === 0 : b === n - 1) return;
      g.moveBlock(axis, a, b, dir < 0 ? a - 1 : b + 2);
    };
    g.sortDir = function (c, dir) {                    /* A -> Z (1) or Z -> A (-1) from the menu */
      g.sortState = { c: c, dir: 0, original: null };
      g.sortBy(c);
      if (dir < 0) g.sortBy(c);
    };
    /* right-click: what fits the target (a column letter, a row number, or cells) */
    g.menu = function (kind, x, y) {
      var sp = g.selSpan(), nr = sp.r2 - sp.r1 + 1, nc = sp.c2 - sp.c1 + 1;
      var items = [];
      var it = function (label, fn, hint, off) { items.push({ label: label, fn: fn, hint: hint, off: off }); };
      var sep = function () { items.push(null); };
      var cs = nc > 1 ? nc + " columns" : "column", rs = nr > 1 ? nr + " rows" : "row";
      if (kind === "cols") {
        it("Move " + cs + " left", function () { g.nudge("c", -1); }, "Alt+\u2190", sp.c1 === 0);
        it("Move " + cs + " right", function () { g.nudge("c", 1); }, "Alt+\u2192", sp.c2 >= cols() - 1); sep();
        it("Insert " + cs + " left", function () { g.insertCols(sp.c1, nc); });
        it("Insert " + cs + " right", function () { g.insertCols(sp.c2 + 1, nc); });
        it("Delete " + cs, function () { g.deleteCols(sp.c1, sp.c2); }, "Ctrl+\u2212", nc >= cols());
        it("Clear " + cs, function () { g.clearRange(); }, "Delete"); sep();
        it("Sort A \u2192 Z", function () { g.sortDir(sp.c1, 1); }); it("Sort Z \u2192 A", function () { g.sortDir(sp.c1, -1); }); sep();
      } else if (kind === "rows") {
        it("Move " + rs + " up", function () { g.nudge("r", -1); }, "Alt+\u2191", sp.r1 === 0);
        it("Move " + rs + " down", function () { g.nudge("r", 1); }, "Alt+\u2193", sp.r2 >= rows().length - 1); sep();
        it("Insert " + rs + " above", function () { g.insertRows(sp.r1, nr); });
        it("Insert " + rs + " below", function () { g.insertRows(sp.r2 + 1, nr); });
        it("Delete " + rs, function () { g.deleteRows(sp.r1, sp.r2); }, "Ctrl+\u2212", nr >= rows().length);
        it("Clear " + rs, function () { g.clearRange(); }, "Delete"); sep();
      } else {
        it("Clear contents", function () { g.clearRange(); }, "Delete"); sep();
        it("Insert row above", function () { g.insertRows(sp.r1, 1); }); it("Insert row below", function () { g.insertRows(sp.r2 + 1, 1); });
        it("Insert column left", function () { g.insertCols(sp.c1, 1); }); it("Insert column right", function () { g.insertCols(sp.c2 + 1, 1); }); sep();
        it("Delete " + rs, function () { g.deleteRows(sp.r1, sp.r2); }, "", nr >= rows().length);
        it("Delete " + (nc > 1 ? nc + " columns" : "column"), function () { g.deleteCols(sp.c1, sp.c2); }, "", nc >= cols()); sep();
      }
      it("Copy", function () { g.copy(); }, "Ctrl+C");
      floatMenu(items, x, y, function () { g.root.focus(); });
    };
    /* after a row or column goes in or out, formulas follow the cells they point at - here, and
       in other sheets that name this one */
    g.refsMoved = function (axis, at, delta) {
      var me = g.sheet.title.toLowerCase();
      var fix = function (rowsList, local) {
        rowsList.forEach(function (row) { row.forEach(function (v, k) {
          if (shFormulaOf(v) !== null) row[k] = shShiftRefs(v, axis, at, delta, function (sh) { return sh ? sh.toLowerCase() === me : local; });
        }); });
      };
      fix(rows(), true);
      sheets.forEach(function (o) { if (o !== g.sheet && o.rows && o.rows.some(function (r) { return r.some(function (v) { return typeof v === "string" && v.indexOf("!") !== -1; }); })) { var was = JSON.stringify(o.rows); g.snapshotOther(o); fix(o.rows, false); if (JSON.stringify(o.rows) !== was) { if (o.note) noteTableWriteBack(o); else sheetDirty(o); } } });
    };
    g.addRow = function () { g.snapshot(); rows().splice(g.r + 1, 0, blankRows(1, cols())[0]); g.refsMoved("r", g.r + 1, 1); g.changed(); g.render(); g.move(1, 0, false); };
    /* the toolbar's Row - / Col - remove every selected row or column */
    g.delSelectedRows = function () { var sp = g.selSpan(); g.deleteRows(sp.r1, sp.r2); };
    g.delSelectedCols = function () { var sp = g.selSpan(); g.deleteCols(sp.c1, sp.c2); };
    g.delRow = function () {
      if (rows().length < 2) return;
      g.snapshot(); rows().splice(g.r, 1); g.refsMoved("r", g.r, -1);
      g.r = Math.min(g.r, rows().length - 1); g.ar = g.r;
      g.changed(); g.render();
    };
    g.addCol = function () {
      g.snapshot();
      rows().forEach(function (r) { r.splice(g.c + 1, 0, ""); });
      g.refsMoved("c", g.c + 1, 1);
      g.filters.splice(g.c + 1, 0, "");
      g.changed(); g.render();
    };
    g.delCol = function () {
      if (cols() < 2) return;
      g.snapshot();
      rows().forEach(function (r) { r.splice(g.c, 1); });
      g.refsMoved("c", g.c, -1);
      g.filters.splice(g.c, 1);
      g.c = Math.min(g.c, cols() - 1); g.ac = g.c;
      g.changed(); g.render();
    };
  }

