  function defineView() {
    /* what each column holds, from its values below the header: N number, D date, T text */
    g.colTypes = function () {
      if (g.types) return g.types;
      var rs = rows(), n = cols(), out = [];
      for (var c = 0; c < n; c++) {
        var num = 0, date = 0, filled = 0;
        for (var r = 1; r < rs.length && filled < 400; r++) {
          var v = shown(r, c);
          if (v === "") continue;
          filled++;
          if (SH_NUM_RE.test(v)) num++;
          else if (/^\d{4}-\d{2}-\d{2}/.test(v) || /^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}$/.test(v)) date++;
        }
        out.push(!filled ? "" : num === filled ? "N" : date === filled ? "D" : "T");
      }
      return (g.types = out);
    };
    /* each column's index: value -> the rows holding it, so an exact filter is a lookup */
    g.colIdx = {};
    g.indexOf = function (c) {
      if (g.colIdx[c]) return g.colIdx[c];
      var map = new Map(), rs = rows();
      for (var r = 1; r < rs.length; r++) {
        var k = shown(r, c).toLowerCase(), list = map.get(k);
        if (list) list.push(r); else map.set(k, [r]);
      }
      return (g.colIdx[c] = map);
    };
    g.computeView = function () {
      var rs = rows(), tests = [];
      g.filters.forEach(function (q, c) { var t = shFilterTest(q); if (t && c < cols()) tests.push({ c: c, t: t }); });
      var view = [0];
      if (!tests.length) { for (var r = 1; r < rs.length; r++) view.push(r); }
      else {
        /* start from the narrowest exact filter's index, then check the rest */
        var cand = null;
        tests.forEach(function (x) {
          if (x.t.exact == null || SH_NUM_RE.test(x.t.exact)) return;
          var hits = g.indexOf(x.c).get(x.t.exact) || [];
          if (!cand || hits.length < cand.length) cand = hits;
        });
        var check = function (r) { return tests.every(function (x) { return x.t.test(shown(r, x.c)); }); };
        if (cand) cand.forEach(function (r) { if (check(r)) view.push(r); });
        else for (var r2 = 1; r2 < rs.length; r2++) if (check(r2)) view.push(r2);
      }
      g.view = view;
      g.viewPos = new Map();
      view.forEach(function (r, i) { g.viewPos.set(r, i); });
      if (!g.viewPos.has(g.r)) { g.r = g.ar = view[Math.min(view.length - 1, 1)] || 0; }
    };
  }

