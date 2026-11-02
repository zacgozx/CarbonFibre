  function defineSorting() {
    /* header click sorts the rows below the header by what the cells show, cycling asc, desc, off */
    g.sortBy = function (c) {
      var rs = rows();
      if (rs.length < 3) return;
      g.sortState = g.sortState && g.sortState.c === c ? g.sortState : { c: c, dir: 0, original: null };
      g.snapshot();
      if (g.sortState.dir === 0) g.sortState.original = JSON.parse(JSON.stringify(rs));
      g.sortState.dir = g.sortState.dir === 0 ? 1 : g.sortState.dir === 1 ? -1 : 0;
      if (g.sortState.dir === 0) {
        g.sheet.rows = g.sortState.original;
      } else {
        /* summary rows at the bottom (a formula over a range in this column: a total, average, count)
           stay at the bottom; only the data above them is sorted */
        var tailN = 0;
        while (rs.length - 1 - tailN > 1 && /:/.test(shFormulaOf(rs[rs.length - 1 - tailN][c] || "") || "")) tailN++;
        var tail = tailN ? rs.slice(rs.length - tailN) : [];
        var head = rs[0], keyed = rs.slice(1, rs.length - tailN).map(function (row, i) { return { row: row, k: shown(i + 1, c), i: i }; });
        keyed.sort(function (a, b) {
          var x = a.k, y = b.k;
          if (x === "" || y === "") return (x === "" ? 1 : 0) - (y === "" ? 1 : 0) || a.i - b.i;   /* blanks last */
          var cmp = SH_NUM_RE.test(x) && SH_NUM_RE.test(y) ? parseFloat(x) - parseFloat(y) : x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" });
          return cmp * g.sortState.dir || a.i - b.i;
        });
        /* a moved row's references to its own row follow it (=A5*B5 on row 5 stays its own); references
           elsewhere - a total over the rows above - stay where they point (moving them broke into #REF!) */
        var sorted = keyed.map(function (x, k) {
          var from = x.i + 1, to = k + 1;
          if (from === to) return x.row;
          return x.row.map(function (v) {
            if (shFormulaOf(v) === null) return v;
            return shMapRefs(v, function (ref) { return !ref.sheet && ref.r === from && !ref.absR ? { r: to, c: ref.c } : { r: ref.r, c: ref.c }; });
          });
        });
        g.sheet.rows = [head].concat(sorted, tail);
      }
      g.changed(); g.render();
    };
  }

