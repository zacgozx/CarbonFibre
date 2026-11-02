  function defineFind() {
    /* every cell on show whose text contains the query (or, fuzzy, has its letters in order) */
    g.runFind = function () {
      var q = g.find.q, n = cols(), hits = [], set = new Set();
      if (q) {
        var ql = q.toLowerCase();
        g.view.forEach(function (r) {
          for (var c = 0; c < n; c++) {
            var t = shown(r, c);
            if (t && (g.find.fuzzy ? shFuzzy(q, t) : t.toLowerCase().indexOf(ql) !== -1)) { hits.push([r, c]); set.add(r * 16384 + c); }
          }
        });
      }
      g.find.hits = hits; g.find.set = q ? set : null;
      var from = g.viewPos.get(g.r) || 0;
      g.find.at = hits.length ? Math.max(0, hits.findIndex(function (h) { return (g.viewPos.get(h[0]) || 0) > from || (h[0] === g.r && h[1] >= g.c); })) : -1;
      if (g.find.at < 0 && hits.length) g.find.at = 0;
      g.renderWindow(true);
      g.findCount();
      if (hits.length) { var h = hits[g.find.at]; g.goto(h[0], h[1], false); }
    };
    g.findStep = function (d) {
      var n = g.find.hits.length;
      if (!n) return;
      g.find.at = (g.find.at + d + n) % n;
      var h = g.find.hits[g.find.at];
      g.goto(h[0], h[1], false);
      g.findCount();
    };
    g.findCount = function () {
      var el = wrap.querySelector(".sh-find-count"), n = g.find.hits.length;
      el.textContent = !g.find.q ? "" : n ? (g.find.at + 1) + " of " + n : "No matches";
    };
  }

