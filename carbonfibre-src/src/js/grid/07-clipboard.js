  function defineClipboard() {
    /* what is copied is what the cells show (a formula's result), over the rows on show */
    g.rangeRows = function () {
      var lo = Math.min(g.r, g.ar), hi = Math.max(g.r, g.ar);
      var cl = Math.min(g.c, g.ac), ch = Math.max(g.c, g.ac);
      var out = [];
      g.view.forEach(function (r) {
        if (r < lo || r > hi) return;
        var row = [];
        for (var c = cl; c <= ch; c++) row.push(shown(r, c));
        out.push(row);
      });
      return out;
    };
    g.displayRows = function () { return rows().map(function (row, r) { return row.map(function (v, c) { return shown(r, c); }); }); };
    g.copy = function () { copyText(g.rangeRows().map(function (r) { return r.join("\t"); }).join("\n")); };
    g.pasteText = function (text) {
      var grid = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").map(function (l) { return l.split("\t"); });
      if (!grid.length) return;
      g.snapshot();
      var rs = rows();
      grid.forEach(function (row, dr) {
        while (g.r + dr >= rs.length) rs.push(blankRows(1, cols())[0]);
        row.forEach(function (v, dc) {
          while (g.c + dc >= cols()) rs.forEach(function (x) { x.push(""); });
          rs[g.r + dr][g.c + dc] = v;
        });
      });
      g.ar = g.r + grid.length - 1;
      g.ac = g.c + grid[0].length - 1;
      g.changed(); g.render();
    };
    g.undoStep = function () {
      if (!g.undo.length) return;
      g.sortState = null;                               /* the data changed under any sort: start afresh */
      g.redo.push(swapStep(g.undo.pop()));
      g.changed(); g.render();
    };
    g.redoStep = function () {
      if (!g.redo.length) return;
      g.sortState = null;
      g.undo.push(swapStep(g.redo.pop()));
      g.changed(); g.render();
    };
  }

