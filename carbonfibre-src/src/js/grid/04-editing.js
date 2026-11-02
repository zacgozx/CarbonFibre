  function defineEditing() {
    g.syncFx = function () {
      if (document.activeElement === g.fxIn) return;
      g.addrEl.textContent = colName(g.c) + (g.r + 1);
      g.fxIn.value = cellAt(g.r, g.c);
    };
    g.beginEdit = function (seed) {
      if (!g.sheet) return;
      /* with a range selected, the entry belongs to the cell the selection started from (Excel's
         active cell): the cursor moves there and the range stays, ready for Ctrl+Enter */
      if (g.r !== g.ar || g.c !== g.ac) { var er = g.ar, ec = g.ac; g.ar = g.r; g.ac = g.c; g.r = er; g.c = ec; g.paint(); }
      g.editing = true;
      g.reveal(g.r);
      g.placeInput();
      g.input.classList.add("show");
      g.input.value = seed !== undefined ? seed : cellAt(g.r, g.c);
      g.fxIn.value = g.input.value;
      g.input.focus();
      if (seed === undefined) g.input.select();
    };
    /* one place that writes a cell: undo step, recalculate, redraw (formulas elsewhere may change) */
    g.setCell = function (r, c, v) {
      if (v === cellAt(r, c)) return false;
      g.snapshot();
      rows()[r][c] = v;
      g.changed();
      g.render();
      return true;
    };
    g.commitEdit = function (dr, dc) {
      if (!g.editing) return;
      g.editing = false;
      var v = g.input.value;
      g.input.classList.remove("show");
      g.setCell(g.r, g.c, v);
      if (dr || dc) g.move(dr, dc, false); else g.paint();
      g.root.focus();
    };
    g.cancelEdit = function () {
      g.editing = false;
      g.input.classList.remove("show");
      g.syncFx();
      g.root.focus();
    };
    /* clearing a range only touches the rows on show, as Excel does with a filter on */
    g.clearRange = function () {
      var lo = Math.min(g.r, g.ar), hi = Math.max(g.r, g.ar);
      var cl = Math.min(g.c, g.ac), ch = Math.max(g.c, g.ac);
      g.snapshot();
      g.view.forEach(function (r) { if (r >= lo && r <= hi) for (var c = cl; c <= ch; c++) rows()[r][c] = ""; });
      g.changed(); g.render();
    };
  }

