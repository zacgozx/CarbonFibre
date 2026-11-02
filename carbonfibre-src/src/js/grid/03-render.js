  function defineRender() {
    g.render = function () {
      if (!g.sheet) { g.head.innerHTML = ""; g.body.innerHTML = ""; return; }
      g.titleEl.textContent = g.sheet.title + (g.sheet.note ? "  (table in " + g.sheet.note.title + ")" : "");
      g.computeView();
      g.renderHead();
      g.drawn = null;
      g.renderWindow(true);
    };
    /* the column letters (with the column's type), and a filter box under each */
    g.renderHead = function () {
      var n = cols(), types = g.colTypes(), names = { N: "numbers", D: "dates", T: "text" };
      var h = "<tr><th class='sh-corner sh-all' title='Select everything'></th>";
      for (var c = 0; c < n; c++) {
        var sd = g.sortState && g.sortState.c === c ? g.sortState.dir : 0;
        h += "<th data-col='" + c + "' title='Click to select the column (drag or Shift+click for more) \u00b7 right-click for more" + (types[c] ? " \u00b7 holds " + names[types[c]] : "") + "'>" +
          (types[c] ? "<span class='sh-type sh-type--" + types[c] + "'>" + types[c] + "</span>" : "") + colName(c) +
          "<button type='button' class='sh-sortbtn" + (sd ? " on" : "") + "' data-sort='" + c + "' tabindex='-1' title='Sort by this column (A \u2192 Z, Z \u2192 A, off)' aria-label='Sort by column " + colName(c) + "'>" + (sd > 0 ? "\u2191" : sd < 0 ? "\u2193" : "\u2195") + "</button></th>";
      }
      h += "</tr><tr class='sh-filters'><th class='sh-corner sh-corner2' title='Filters: test (the whole word), test* (words starting test), %test% (anywhere), %org (ends org), org% (starts org), >10, =Male (exact cell), !test (not the word), ~fuzzy'>\u25bf</th>";
      for (var c2 = 0; c2 < n; c2++) {
        var fv = g.filters[c2] || "";
        h += "<th class='sh-fcell" + (fv ? " on" : "") + "'><input class='sh-filter' data-fc='" + c2 + "' spellcheck='false' value='" + esc(fv).replace(/'/g, "&#39;") +
          "' placeholder='filter' aria-label='Filter column " + colName(c2) + "'>" + (fv ? "<button class='sh-fclear' data-fc='" + c2 + "' aria-label='Clear filter' title='Clear'>\u00d7</button>" : "") + "</th>";
      }
      g.head.innerHTML = h + "</tr>";
    };
    /* draw only the rows on screen (plus a margin); spacers keep the scrollbar honest */
    g.renderWindow = function (force) {
      var view = g.view, n = cols();
      var headH = g.head.offsetHeight || 60;
      var top = Math.max(0, g.scroll.scrollTop - headH), vis = Math.ceil((g.scroll.clientHeight || 600) / ROW_H);
      var start = Math.max(0, Math.floor(top / ROW_H) - BUFFER), end = Math.min(view.length, start + vis + BUFFER * 2);
      if (!force && g.drawn && start >= g.drawn[0] && end <= g.drawn[1]) return;
      if (!force && g.drawn && view.length <= g.drawn[1] && g.drawn[0] === 0 && end <= g.drawn[1]) return;
      var types = g.colTypes(), out = "";
      if (start > 0) out += "<tr class='sh-spacer' style='height:" + (start * ROW_H) + "px'><td colspan='" + (n + 1) + "'></td></tr>";
      g.rowEl = new Map();
      for (var i = start; i < end; i++) {
        var r = view[i];
        out += "<tr data-row='" + r + "'><th class='sh-rownum" + (r === 0 ? " sh-hrow" : "") + "' data-row='" + r + "'>" + (r + 1) + "</th>";
        for (var c = 0; c < n; c++) {
          var raw = cellAt(r, c), txt = shown(r, c), cls = [];
          if (r > 0 && types[c] === "N") cls.push("num");
          if (g.calc.isFormula(r, c)) { cls.push("fx"); if (/^#[A-Z\/0!?]+$/.test(txt) && shIsErr(g.calc.value(r, c))) cls.push("err"); }
          if (r === 0) cls.push("hcell");
          if (g.find.set && g.find.set.has(r * 16384 + c)) cls.push("hit");
          out += "<td data-r='" + r + "' data-c='" + c + "'" + (cls.length ? " class='" + cls.join(" ") + "'" : "") +
            (raw !== txt ? " title='" + esc(raw).replace(/'/g, "&#39;") + "'" : "") + ">" + esc(txt) + "</td>";
        }
        out += "</tr>";
      }
      if (end < view.length) out += "<tr class='sh-spacer' style='height:" + ((view.length - end) * ROW_H) + "px'><td colspan='" + (n + 1) + "'></td></tr>";
      g.body.innerHTML = out;
      Array.prototype.forEach.call(g.body.rows, function (tr) { if (tr.dataset.row !== undefined) g.rowEl.set(+tr.dataset.row, tr); });
      g.drawn = [start, end];
      g.painted = [];
      g.paint();
    };
    g.td = function (r, c) { var tr = g.rowEl && g.rowEl.get(r); return tr ? tr.cells[c + 1] : null; };
    /* scroll a row into view, drawing it first if it was off screen */
    g.reveal = function (r) {
      var i = g.viewPos.get(r);
      if (i === undefined) return;
      var headH = g.head.offsetHeight || 60, y = headH + i * ROW_H;
      if (y < g.scroll.scrollTop + headH) g.scroll.scrollTop = Math.max(0, y - headH);
      else if (y + ROW_H > g.scroll.scrollTop + g.scroll.clientHeight) g.scroll.scrollTop = y + ROW_H - g.scroll.clientHeight;
      g.renderWindow(false);
    };
    g.painted = [];
    g.paint = function () {
      var lo = Math.min(g.r, g.ar), hi = Math.max(g.r, g.ar);
      var cl = Math.min(g.c, g.ac), ch = Math.max(g.c, g.ac);
      for (var i = 0; i < g.painted.length; i++) g.painted[i].classList.remove("in-range", "is-cur", "hit-cur");
      g.painted = [];
      g.rowEl && g.rowEl.forEach(function (tr, r) {
        if (r < lo || r > hi) return;
        for (var c = cl; c <= ch; c++) { var td = tr.cells[c + 1]; if (td) { td.classList.add("in-range"); g.painted.push(td); } }
      });
      var cur = g.td(g.r, g.c);
      if (cur) { cur.classList.add("is-cur"); if (g.painted.indexOf(cur) === -1) g.painted.push(cur); }
      var spn = g.selSpan(), wholeCols = g.selKind === "cols" || g.selKind === "all", wholeRows = g.selKind === "rows" || g.selKind === "all";
      Array.prototype.forEach.call(g.head.querySelectorAll("th[data-col]"), function (th) { var c = +th.dataset.col; th.classList.toggle("sel", wholeCols && c >= spn.c1 && c <= spn.c2); th.classList.toggle("in", c >= spn.c1 && c <= spn.c2); });
      g.rowEl && g.rowEl.forEach(function (tr, r) { var rh = tr.cells[0]; if (rh) { rh.classList.toggle("sel", wholeRows && r >= spn.r1 && r <= spn.r2); rh.classList.toggle("in", r >= spn.r1 && r <= spn.r2); } });
      var fh = g.find.at >= 0 && g.find.hits[g.find.at], fcell = fh && g.td(fh[0], fh[1]);
      if (fcell) { fcell.classList.add("hit-cur"); g.painted.push(fcell); }
      g.status();
      g.placeHandle();
      if (!g.editing) { g.placeInput(); g.syncFx(); }
    };
    /* bottom bar: size and filtering on the left; the cell and the selection's sum on the right */
    g.status = function () {
      var total = rows().length, showing = g.view.length;
      g.countsEl.textContent = "Rows: " + total + (showing < total ? " (showing " + showing + ")" : "") + "  \u00b7  Columns: " + cols();
      var lo = Math.min(g.r, g.ar), hi = Math.max(g.r, g.ar), cl = Math.min(g.c, g.ac), ch = Math.max(g.c, g.ac);
      var sum = 0, cnt = 0, filled = 0;
      if ((hi - lo + 1) * (ch - cl + 1) > 1) {
        g.view.forEach(function (r) {
          if (r < lo || r > hi) return;
          for (var c = cl; c <= ch; c++) {
            var v = g.calc.value(r, c);
            if (v !== "" && !shIsErr(v)) filled++;
            if (typeof v === "number") { sum += v; cnt++; }
          }
        });
      }
      g.infoEl.textContent = colName(g.c) + (g.r + 1) +
        (cnt > 0 ? "  \u00b7  Sum " + shFmt(sum) + "  \u00b7  Average " + shFmt(sum / cnt) + "  \u00b7  Count " + filled : filled > 1 ? "  \u00b7  Count " + filled : "");
    };
    g.placeInput = function () {
      var td = g.td(g.r, g.c);
      if (!td) return;
      g.input.style.left = td.offsetLeft + "px";
      g.input.style.top = td.offsetTop + "px";
      g.input.style.width = td.offsetWidth + "px";
      g.input.style.height = td.offsetHeight + "px";
    };
    /* moving goes through the rows on show, so filtered-out rows are skipped */
    g.move = function (dr, dc, extend) {
      var i = g.viewPos.get(g.r) || 0;
      i = Math.max(0, Math.min(g.view.length - 1, i + dr));
      g.r = g.view[i];
      g.c = Math.max(0, Math.min(cols() - 1, g.c + dc));
      if (!extend) { g.ar = g.r; g.ac = g.c; }
      g.reveal(g.r); g.paint(); g.revealCol();
    };
    g.goto = function (r, c, extend) {
      g.r = r; g.c = c;
      if (!extend) { g.ar = r; g.ac = c; }
      g.reveal(r); g.paint(); g.revealCol();
    };
    g.revealCol = function () {
      var td = g.td(g.r, g.c), rn = 48;
      if (!td) return;
      if (td.offsetLeft - rn < g.scroll.scrollLeft) g.scroll.scrollLeft = Math.max(0, td.offsetLeft - rn);
      else if (td.offsetLeft + td.offsetWidth > g.scroll.scrollLeft + g.scroll.clientWidth) g.scroll.scrollLeft = td.offsetLeft + td.offsetWidth - g.scroll.clientWidth;
    };
  }

