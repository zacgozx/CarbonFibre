  function defineFill() {
    var handle = wrap.querySelector(".sh-handle"), box = wrap.querySelector(".sh-fillbox");
    g.sel = function () { return { lo: Math.min(g.r, g.ar), hi: Math.max(g.r, g.ar), cl: Math.min(g.c, g.ac), ch: Math.max(g.c, g.ac) }; };
    /* the rows on show inside a span of sheet rows */
    g.viewRowsIn = function (lo, hi) { return g.view.filter(function (r) { return r >= lo && r <= hi; }); };
    /* the small square at the bottom-right corner of the selection */
    g.placeHandle = function () {
      if (g.editing || !g.sheet) { handle.style.display = "none"; return; }
      var s = g.sel(), rowsIn = g.viewRowsIn(s.lo, s.hi), last = rowsIn[rowsIn.length - 1];
      var td = last !== undefined && g.td(last, s.ch);
      if (!td) { handle.style.display = "none"; return; }
      handle.style.display = "block";
      handle.style.left = (td.offsetLeft + td.offsetWidth - 7) + "px";     /* just inside the corner, so the last column's handle isn't cut off */
      handle.style.top = (td.offsetTop + td.offsetHeight - 7) + "px";
    };
    /* one line of the source (a column's cells when filling down) continued into the targets */
    function fillLine(srcCells, targets, along) {
      var raws = srcCells.map(function (x) { return cellAt(x.r, x.c); });
      var hasFx = raws.some(function (v) { return shFormulaOf(v) !== null; });
      var series = hasFx ? null : shSeries(raws, targets.length);
      targets.forEach(function (t, k) {
        if (series) { rows()[t.r][t.c] = series[k]; return; }
        var from = srcCells[k % srcCells.length], raw = cellAt(from.r, from.c);
        rows()[t.r][t.c] = shFormulaOf(raw) !== null ? shShiftFormula(raw, t.r - from.r, t.c - from.c) : raw;
      });
    }
    /* fill from the selection outward: "down", "up", "right" or "left", count rows or columns */
    g.fill = function (dir, count) {
      var s = g.sel(), rs = rows();
      if (count <= 0) return;
      g.snapshot();
      if (dir === "down" || dir === "up") {
        var srcRows = g.viewRowsIn(s.lo, s.hi), targetRows = [];
        if (dir === "down") {
          var i = g.viewPos.get(srcRows[srcRows.length - 1]) + 1;
          while (targetRows.length < count && i < g.view.length) targetRows.push(g.view[i++]);
          var filtered = g.view.length < rs.length;
          while (targetRows.length < count && !filtered) { rs.push(blankRows(1, cols())[0]); targetRows.push(rs.length - 1); }
        } else {
          var j = g.viewPos.get(srcRows[0]) - 1;
          while (targetRows.length < count && j >= 1) targetRows.push(g.view[j--]);   /* never over the header row */
        }
        for (var c = s.cl; c <= s.ch; c++) {
          var src = srcRows.map(function (r) { return { r: r, c: c }; });
          if (dir === "up") src.reverse();
          fillLine(src, targetRows.map(function (r) { return { r: r, c: c }; }));
        }
        if (targetRows.length) {
          var ends = targetRows.concat(srcRows);
          g.r = Math.min.apply(null, ends); g.ar = Math.max.apply(null, ends);
        }
      } else {
        var srcCols = [], tcols = [];
        for (var c2 = s.cl; c2 <= s.ch; c2++) srcCols.push(c2);
        if (dir === "right") { for (var k = 1; k <= count; k++) tcols.push(s.ch + k); while (s.ch + count >= cols()) rs.forEach(function (x) { x.push(""); }); }
        else { for (var k2 = 1; k2 <= count && s.cl - k2 >= 0; k2++) tcols.push(s.cl - k2); }
        g.viewRowsIn(s.lo, s.hi).forEach(function (r) {
          var src = srcCols.map(function (c) { return { r: r, c: c }; });
          if (dir === "left") src.reverse();
          fillLine(src, tcols.map(function (c) { return { r: r, c: c }; }));
        });
        if (tcols.length) { var ce = tcols.concat(srcCols); g.c = Math.min.apply(null, ce); g.ac = Math.max.apply(null, ce); }
      }
      g.changed(); g.render();
    };
    /* Ctrl+D: the selection's top row copied down through it; Ctrl+R: its left column across */
    g.fillWithin = function (down) {
      var s = g.sel(), rowsIn = g.viewRowsIn(s.lo, s.hi);
      if (down ? rowsIn.length < 2 : s.cl === s.ch) return;
      g.snapshot();
      if (down) {
        var top = rowsIn[0];
        rowsIn.slice(1).forEach(function (r) { for (var c = s.cl; c <= s.ch; c++) { var raw = cellAt(top, c); rows()[r][c] = shFormulaOf(raw) !== null ? shShiftFormula(raw, r - top, 0) : raw; } });
      } else {
        rowsIn.forEach(function (r) { var raw = cellAt(r, s.cl); for (var c = s.cl + 1; c <= s.ch; c++) rows()[r][c] = shFormulaOf(raw) !== null ? shShiftFormula(raw, 0, c - s.cl) : raw; });
      }
      g.changed(); g.render();
    };
    /* Ctrl+Enter while typing: the same entry in every selected cell, references adjusted for each */
    g.commitToSelection = function () {
      var v = g.input.value, s = g.sel(), baseR = g.r, baseC = g.c;
      g.editing = false; g.input.classList.remove("show");
      g.snapshot();
      g.viewRowsIn(s.lo, s.hi).forEach(function (r) {
        for (var c = s.cl; c <= s.ch; c++) rows()[r][c] = shFormulaOf(v) !== null ? shShiftFormula(v, r - baseR, c - baseC) : v;
      });
      g.changed(); g.render(); g.root.focus();
    };
    /* dragging the handle: which way and how far, previewed as a dashed box */
    var drag = null, autoTimer = 0;
    function targetFrom(e) {
      var el = document.elementFromPoint(e.clientX, e.clientY), td = el && el.closest && el.closest("td[data-r]");
      if (!td || !g.body.contains(td)) return null;
      var s = drag.s, r = +td.dataset.r, c = +td.dataset.c, vi = g.viewPos.get(r);
      var loI = g.viewPos.get(g.viewRowsIn(s.lo, s.hi)[0]), hiI = g.viewPos.get(g.viewRowsIn(s.lo, s.hi).slice(-1)[0]);
      var down = vi - hiI, up = loI - vi, right = c - s.ch, left = s.cl - c, best = Math.max(down, up, right, left);
      if (best <= 0) return { dir: null, count: 0 };
      if (best === down) return { dir: "down", count: down, to: r };
      if (best === up) return { dir: "up", count: up, to: r };
      if (best === right) return { dir: "right", count: right, toC: c };
      return { dir: "left", count: left, toC: c };
    }
    function showBox(t) {
      var s = drag.s, rowsIn = g.viewRowsIn(s.lo, s.hi);
      var r1 = rowsIn[0], r2 = rowsIn[rowsIn.length - 1], c1 = s.cl, c2 = s.ch;
      if (t && t.dir === "down") r2 = t.to; else if (t && t.dir === "up") r1 = t.to;
      else if (t && t.dir === "right") c2 = t.toC; else if (t && t.dir === "left") c1 = t.toC;
      var a = g.td(r1, c1), b = g.td(r2, c2);
      if (!a || !b) { box.style.display = "none"; return; }
      box.style.display = "block";
      box.style.left = a.offsetLeft + "px"; box.style.top = a.offsetTop + "px";
      box.style.width = (b.offsetLeft + b.offsetWidth - a.offsetLeft) + "px";
      box.style.height = (b.offsetTop + b.offsetHeight - a.offsetTop) + "px";
    }
    handle.addEventListener("mousedown", function (e) {
      e.preventDefault(); e.stopPropagation();
      drag = { s: g.sel(), t: null };
      handle.classList.add("dragging");
      showBox(null);
    });
    document.addEventListener("mousemove", function (e) {
      if (!drag) return;
      var t = targetFrom(e);
      if (t) { drag.t = t; showBox(t); }
      /* past the bottom or right edge: keep scrolling so long fills are one drag */
      var rr = g.scroll.getBoundingClientRect();
      clearInterval(autoTimer);
      var dy = e.clientY > rr.bottom - 24 ? 24 : e.clientY < rr.top + 60 ? -24 : 0, dx = e.clientX > rr.right - 24 ? 24 : 0;
      if (dy || dx) autoTimer = setInterval(function () { g.scroll.scrollTop += dy; g.scroll.scrollLeft += dx; g.renderWindow(false); }, 40);
    });
    document.addEventListener("mouseup", function () {
      if (!drag) return;
      clearInterval(autoTimer);
      var t = drag.t; drag = null;
      handle.classList.remove("dragging"); box.style.display = "none";
      if (t && t.dir) g.fill(t.dir, t.count);
      g.root.focus();
    });
    /* double-click: fill down as far as the column beside the selection has data */
    handle.addEventListener("dblclick", function (e) {
      e.preventDefault();
      var s = g.sel(), side = s.cl > 0 ? s.cl - 1 : s.ch + 1, startI = g.viewPos.get(g.viewRowsIn(s.lo, s.hi).slice(-1)[0]) + 1, n = 0;
      if (side >= cols()) return;
      if (s.cl > 0 && startI < g.view.length && cellAt(g.view[startI], side) === "" && s.ch + 1 < cols()) side = s.ch + 1;
      for (var i = startI; i < g.view.length && cellAt(g.view[i], side) !== ""; i++) n++;
      if (n) g.fill("down", n);
    });
  }

  /* the cheatsheet: grouped functions; clicking one starts it in the formula bar */
  function renderHelp(q) {
    var body = wrap.querySelector(".sh-help-body"), ql = String(q || "").trim().toLowerCase(), html = "";
    var hit = function (arr) { return !ql || arr.join(" ").toLowerCase().indexOf(ql) !== -1; };
    SH_HELP.forEach(function (grp) {
      var items = ql && grp[0].toLowerCase().indexOf(ql) !== -1 ? grp[1] : grp[1].filter(hit);
      if (!items.length) return;
      html += "<h4>" + esc(grp[0]) + "</h4>";
      items.forEach(function (f) {
        html += "<button class='sh-fn' data-fn='" + f[0] + "' title='Insert " + f[0] + " into the formula bar'>" +
          "<span class='sh-fn-sig'>" + esc(f[1]) + "</span><span class='sh-fn-desc'>" + esc(f[2]) + "</span>" +
          "<span class='sh-fn-ex'><code>" + esc(f[3]) + "</code> <span class='sh-fn-res'>\u2192 " + esc(f[4]) + "</span></span></button>";
      });
    });
    var basics = SH_HELP_BASICS.filter(hit), errors = SH_HELP_ERRORS.filter(hit);
    if (basics.length) {
      html += "<h4>Writing formulas</h4><p class='sh-help-note'>Start a cell with <code>=</code>. <code>SUM=(10+12)</code> also works.</p>" +
        "<p class='sh-help-note'><b>Fill:</b> drag the small square at the corner of a selection, or double-click it to fill down beside your data. " +
        "<code>Ctrl+D</code> fills down, <code>Ctrl+R</code> fills right, <code>Ctrl+Enter</code> puts what you typed into every selected cell. " +
        "References move with the fill unless fixed with <code>$</code>; 2, 4 continues 6, 8; Jan continues Feb.</p><dl class='sh-help-dl'>";
      basics.forEach(function (x) { html += "<dt><code>" + esc(x[0]) + "</code></dt><dd><b>" + esc(x[1]) + "</b> \u00b7 " + esc(x[2]) + "</dd>"; });
      html += "</dl>";
    }
    if (errors.length) {
      html += "<h4>Errors</h4><dl class='sh-help-dl'>";
      errors.forEach(function (x) { html += "<dt><code class='sh-err-code'>" + esc(x[0]) + "</code></dt><dd>" + esc(x[1]) + "</dd>"; });
      html += "</dl>";
    }
    body.innerHTML = html || "<p class='sh-help-note'>Nothing matches \u201c" + esc(q) + "\u201d.</p>";
  }
  g.toggleHelp = function (on) {
    var aside = wrap.querySelector(".sh-help"), btn = wrap.querySelector(".sh-helpbtn");
    on = on === undefined ? aside.hidden : on;
    aside.hidden = !on;
    btn.setAttribute("aria-pressed", String(on));
    storeSet("carbonfibre-sheet-help", on ? "1" : "0");
    if (on && !wrap.querySelector(".sh-help-body").childNodes.length) renderHelp("");
    if (g.sheet) g.renderWindow(true);
  };
  /* start NAME( in the formula bar: added to a formula already there, otherwise a new one */
  g.insertFn = function (name) {
    if (!g.sheet) return;
    if (g.editing) g.commitEdit(0, 0);
    var cur = g.fxIn.value, start;
    if (shFormulaOf(cur) !== null && cur.charAt(0) === "=") { start = cur + (/[(,+\-*\/^&=<> ]$/.test(cur) ? "" : "+") + name + "("; }
    else start = "=" + name + "(";
    g.fxIn.value = start + ")";
    g.fxIn.focus();
    g.fxIn.setSelectionRange(start.length, start.length);
  };

  function wireEvents() {
    g.root.tabIndex = 0;
    wrap.querySelector(".sh-helpbtn").addEventListener("click", function () { g.toggleHelp(); });
    wrap.querySelector(".sh-help-x").addEventListener("click", function () { g.toggleHelp(false); g.root.focus(); });
    wrap.querySelector(".sh-help-in").addEventListener("input", function () { renderHelp(this.value); });
    wrap.querySelector(".sh-help-in").addEventListener("keydown", function (e) { e.stopPropagation(); if (e.key === "Escape") { this.value = ""; renderHelp(""); } });
    wrap.querySelector(".sh-help-body").addEventListener("mousedown", function (e) {
      var b = e.target.closest(".sh-fn");
      if (!b) return;
      e.preventDefault();                              /* keep the formula bar's text; focus moves there */
      g.insertFn(b.dataset.fn);
    });

    g.scroll.addEventListener("scroll", function () {
      if (g.scrollRaf) return;
      g.scrollRaf = requestAnimationFrame(function () { g.scrollRaf = 0; g.renderWindow(false); });
    });
    g.body.addEventListener("mousedown", function (e) {
      var td = e.target.closest("td[data-r]");
      if (td) {
        if (g.editing) g.commitEdit(0, 0);
        if (e.button === 2 && g.selKind) return;          /* right-click keeps a row/column selection for its menu */
        if (!e.shiftKey) g.selKind = null;
        g.goto(+td.dataset.r, +td.dataset.c, e.shiftKey);
        g.drag = true;
        g.root.focus();
        return;
      }
      var rn = e.target.closest(".sh-rownum");
      if (rn && e.button === 0) {
        e.preventDefault();
        var r = +rn.dataset.row, spr = g.selSpan();
        if (!e.shiftKey && g.selKind === "rows" && r >= spr.r1 && r <= spr.r2) {   /* a selected row: dragging moves it */
          g.hmove = { axis: "r", a: spr.r1, b: spr.r2, to: null, x: e.clientX, y: e.clientY, at: r }; g.root.focus(); return;
        }
        if (e.shiftKey && g.selKind === "rows") g.selectRows(g.ar, r); else g.selectRows(r, r);
        g.hdrag = "rows"; g.root.focus();
      }
    });
    g.body.addEventListener("mousemove", function (e) {
      if (g.hmove && g.hmove.axis === "r" && (e.buttons & 1)) {
        var cell = e.target.closest(".sh-rownum, td[data-r]");
        if (cell && Math.abs(e.clientY - g.hmove.y) > 4) {
          var rr = cell.getBoundingClientRect(), row = +(cell.dataset.row !== undefined ? cell.dataset.row : cell.dataset.r);
          g.hmove.to = row + (e.clientY > rr.top + rr.height / 2 ? 1 : 0); g.dropLine("r", g.hmove.to);
        }
        return;
      }
      if (g.hdrag !== "rows" || !(e.buttons & 1)) return;
      var rn = e.target.closest(".sh-rownum, td[data-r]");
      var r = rn ? +(rn.dataset.row !== undefined ? rn.dataset.row : rn.dataset.r) : null;
      if (r !== null && r !== g.r) g.selectRows(g.ar, r);
    });
    /* where a moved row / column would land: a line between two */
    g.dropLine = function (axis, to) {
      var ln = g.scroll.querySelector(".sh-dropline");
      if (!ln) { ln = document.createElement("div"); ln.className = "sh-dropline"; g.scroll.appendChild(ln); }
      var host = g.scroll.getBoundingClientRect(), r;
      if (axis === "c") {
        var ths = g.head.querySelectorAll("tr:first-child th[data-col]"), th = ths[Math.min(to, ths.length - 1)];
        if (!th) return; r = th.getBoundingClientRect();
        var x = (to >= ths.length ? r.right : r.left) - host.left + g.scroll.scrollLeft;
        ln.style.cssText = "left:" + (x - 1) + "px;top:" + g.scroll.scrollTop + "px;width:3px;height:" + g.scroll.clientHeight + "px";
      } else {
        var tr = g.rowEl && (g.rowEl[Math.min(to, rows().length - 1)]);
        if (!tr) return; r = tr.getBoundingClientRect();
        var y = (to >= rows().length ? r.bottom : r.top) - host.top + g.scroll.scrollTop;
        ln.style.cssText = "top:" + (y - 1) + "px;left:" + g.scroll.scrollLeft + "px;height:3px;width:" + g.scroll.clientWidth + "px";
      }
    };
    window.addEventListener("mouseup", function () {
      var mv = g.hmove; g.hmove = null; g.hdrag = null;
      var ln = g.scroll.querySelector(".sh-dropline"); if (ln) ln.remove();
      if (!mv) return;
      if (mv.to === null) { if (mv.axis === "c") g.selectCols(mv.at, mv.at); else g.selectRows(mv.at, mv.at); return; }   /* a click, not a drag */
      g.moveBlock(mv.axis, mv.a, mv.b, mv.to);
    });
    g.scroll.addEventListener("contextmenu", function (e) {
      var th = e.target.closest("thead th[data-col]"), rn = e.target.closest(".sh-rownum"), td = e.target.closest("td[data-r]");
      if (!th && !rn && !td) return;
      e.preventDefault();
      if (th) { var c = +th.dataset.col, sp = g.selSpan(); if (g.selKind !== "cols" || c < sp.c1 || c > sp.c2) g.selectCols(c, c); g.menu("cols", e.clientX, e.clientY); }
      else if (rn) { var r = +rn.dataset.row, sq = g.selSpan(); if (g.selKind !== "rows" || r < sq.r1 || r > sq.r2) g.selectRows(r, r); g.menu("rows", e.clientX, e.clientY); }
      else {
        var tr = +td.dataset.r, tc = +td.dataset.c, s3 = g.selSpan();
        if (tr < s3.r1 || tr > s3.r2 || tc < s3.c1 || tc > s3.c2) { g.selKind = null; g.goto(tr, tc, false); }
        g.menu(g.selKind === "cols" ? "cols" : g.selKind === "rows" ? "rows" : "cells", e.clientX, e.clientY);
      }
    });
    g.body.addEventListener("mousemove", function (e) {
      if (!g.drag || !(e.buttons & 1)) return;
      var td = e.target.closest("td[data-r]");
      if (td) { g.r = +td.dataset.r; g.c = +td.dataset.c; g.paint(); }
    });
    window.addEventListener("mouseup", function () { g.drag = false; });
    g.body.addEventListener("dblclick", function (e) { if (e.target.closest("td[data-r]")) g.beginEdit(); });
    g.head.addEventListener("click", function (e) {
      var clr = e.target.closest(".sh-fclear");
      if (clr) { g.filters[+clr.dataset.fc] = ""; g.render(); return; }
      var sb = e.target.closest(".sh-sortbtn");
      if (sb) { e.stopPropagation(); g.sortBy(+sb.dataset.sort); return; }
    });
    /* column letters: click selects the column; drag across or Shift+click selects several; the corner selects everything */
    g.head.addEventListener("mousedown", function (e) {
      if (e.button !== 0 || e.target.closest(".sh-filters, .sh-sortbtn")) return;
      if (e.target.closest(".sh-all")) { e.preventDefault(); g.selectAll(); g.root.focus(); return; }
      var th = e.target.closest("th[data-col]");
      if (!th) return;
      e.preventDefault();
      var c = +th.dataset.col, spc = g.selSpan();
      if (!e.shiftKey && g.selKind === "cols" && c >= spc.c1 && c <= spc.c2) {   /* a selected column: dragging moves it */
        g.hmove = { axis: "c", a: spc.c1, b: spc.c2, to: null, x: e.clientX, y: e.clientY, at: c }; g.root.focus(); return;
      }
      if (e.shiftKey && g.selKind === "cols") g.selectCols(g.ac, c); else g.selectCols(c, c);
      g.hdrag = "cols"; g.root.focus();
    });
    g.head.addEventListener("mousemove", function (e) {
      if (g.hmove && g.hmove.axis === "c" && (e.buttons & 1)) {
        var ths = Array.prototype.slice.call(g.head.querySelectorAll("tr:first-child th[data-col]")), to = ths.length;
        for (var k = 0; k < ths.length; k++) { var rr = ths[k].getBoundingClientRect(); if (e.clientX < rr.left + rr.width / 2) { to = +ths[k].dataset.col; break; } }
        if (Math.abs(e.clientX - g.hmove.x) > 4) { g.hmove.to = to; g.dropLine("c", to); }
        return;
      }
      if (g.hdrag !== "cols" || !(e.buttons & 1)) return;
      var th = e.target.closest("th[data-col]");
      if (th && +th.dataset.col !== g.c) g.selectCols(g.ac, +th.dataset.col);
    });
    /* filter boxes: the rows update as you type */
    g.head.addEventListener("input", function (e) {
      var f = e.target.closest(".sh-filter");
      if (!f) return;
      g.filters[+f.dataset.fc] = f.value;
      /* the box updates in place (its clear button, its marker): rebuilding the header row
         would swap out the box you are typing in */
      var th = f.closest("th"), clr = th.querySelector(".sh-fclear");
      th.classList.toggle("on", !!f.value);
      if (f.value && !clr) {
        clr = document.createElement("button");
        clr.className = "sh-fclear"; clr.dataset.fc = f.dataset.fc; clr.textContent = "\u00d7";
        clr.title = "Clear"; clr.setAttribute("aria-label", "Clear filter");
        th.appendChild(clr);
      } else if (!f.value && clr) clr.remove();
      clearTimeout(g.filterTimer);
      g.filterTimer = setTimeout(function () {
        g.computeView(); g.drawn = null; g.renderWindow(true);
        if (g.find.q) g.runFind();
      }, rows().length > 5000 ? 200 : 90);              /* big sheets: filter once you pause, not mid-word */
    });
    g.head.addEventListener("keydown", function (e) {
      var f = e.target.closest(".sh-filter");
      if (!f) return;
      e.stopPropagation();
      if (e.key === "Escape") { f.value = ""; g.filters[+f.dataset.fc] = ""; g.render(); g.root.focus(); }
      else if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); g.render(); g.root.focus(); }
    });

    g.input.addEventListener("keydown", function (e) {
      e.stopPropagation();
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); g.commitToSelection(); return; }   /* into every selected cell */
      if (e.key === "Enter") { e.preventDefault(); g.commitEdit(e.shiftKey ? -1 : 1, 0); }
      else if (e.key === "Tab") { e.preventDefault(); g.commitEdit(0, e.shiftKey ? -1 : 1); }
      else if (e.key === "Escape") { e.preventDefault(); g.cancelEdit(); }
    });
    g.input.addEventListener("input", function () { g.fxIn.value = g.input.value; });
    g.input.addEventListener("blur", function () { if (g.editing) g.commitEdit(0, 0); });

    /* the formula bar edits the cell under the cursor */
    g.fxIn.addEventListener("keydown", function (e) {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); var v = g.fxIn.value; g.root.focus(); g.setCell(g.r, g.c, v); g.move(1, 0, false); }
      else if (e.key === "Escape") { e.preventDefault(); g.fxIn.value = cellAt(g.r, g.c); g.root.focus(); }
      else if (e.key === "Tab") { e.preventDefault(); var v2 = g.fxIn.value; g.root.focus(); g.setCell(g.r, g.c, v2); g.move(0, e.shiftKey ? -1 : 1, false); }
    });
    g.fxIn.addEventListener("blur", function () { if (g.fxIn.value !== cellAt(g.r, g.c) && g.sheet) g.setCell(g.r, g.c, g.fxIn.value); });

    /* find box */
    g.findIn.addEventListener("input", function () {
      g.find.q = g.findIn.value;
      clearTimeout(g.findTimer);
      g.findTimer = setTimeout(g.runFind, 120);
    });
    g.findIn.addEventListener("keydown", function (e) {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); clearTimeout(g.findTimer); if (g.find.q !== g.findIn.value) { g.find.q = g.findIn.value; g.runFind(); } else g.findStep(e.shiftKey ? -1 : 1); }
      else if (e.key === "Escape") { e.preventDefault(); g.findIn.value = ""; g.find.q = ""; g.runFind(); g.root.focus(); }
    });
    wrap.querySelector(".sh-fuzzy").addEventListener("click", function () {
      g.find.fuzzy = !g.find.fuzzy;
      this.setAttribute("aria-pressed", String(g.find.fuzzy));
      g.runFind(); g.findIn.focus();
    });
    Array.prototype.forEach.call(wrap.querySelectorAll(".sh-find-nav"), function (b) {
      b.addEventListener("click", function () { g.findStep(+b.dataset.dir); });
    });

    g.root.addEventListener("keydown", function (e) {
      if (!g.sheet || g.editing) return;
      if (e.target !== g.root) return;                  /* typing in the bar's boxes is theirs */
      var mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); e.stopPropagation(); g.findIn.focus(); g.findIn.select(); return; }
      if (mod && e.key.toLowerCase() === "c") { e.preventDefault(); g.copy(); return; }
      if (mod && e.key.toLowerCase() === "x") { e.preventDefault(); g.copy(); g.clearRange(); return; }
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        g.r = 0; g.c = 0; g.ar = rows().length - 1; g.ac = cols() - 1; g.paint();
        return;
      }
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) g.redoStep(); else g.undoStep(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); g.redoStep(); return; }
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); flushSheets(); return; }
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); g.fillWithin(true); return; }    /* fill down */
      if (e.altKey && !mod && !e.shiftKey && /^Arrow/.test(e.key) && !g.editing) {   /* move the selected rows / columns */
        e.preventDefault(); e.stopPropagation();
        var vert = e.key === "ArrowUp" || e.key === "ArrowDown";
        if (vert && g.selKind !== "rows") { var sq = g.selSpan(); g.selectRows(sq.r1, sq.r2); }
        if (!vert && g.selKind !== "cols") { var sc = g.selSpan(); g.selectCols(sc.c1, sc.c2); }
        g.nudge(vert ? "r" : "c", e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 1);
        return;
      }
      if (e.key === " " && mod && !e.shiftKey) { e.preventDefault(); var s1 = g.selSpan(); g.selectCols(s1.c1, s1.c2); return; }   /* Excel: whole columns */
      if (e.key === " " && e.shiftKey && !mod) { e.preventDefault(); var s2 = g.selSpan(); g.selectRows(s2.r1, s2.r2); return; }  /* Excel: whole rows */
      if (mod && (e.key === "-" || e.key === "_")) {
        e.preventDefault(); var s4 = g.selSpan();
        if (g.selKind === "cols") g.deleteCols(s4.c1, s4.c2); else if (g.selKind === "rows" || g.selKind === "all") g.deleteRows(s4.r1, s4.r2);
        return;
      }
      if (mod && e.shiftKey && (e.key === "+" || e.key === "=")) {
        e.preventDefault(); var s5 = g.selSpan();
        if (g.selKind === "cols") g.insertCols(s5.c1, s5.c2 - s5.c1 + 1); else g.insertRows(s5.r1, g.selKind === "rows" ? s5.r2 - s5.r1 + 1 : 1);
        return;
      }
      if (mod && e.key.toLowerCase() === "r") { e.preventDefault(); g.fillWithin(false); return; }   /* fill right */
      if (e.key === "F2" || e.key === "Enter") { e.preventDefault(); g.beginEdit(); return; }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); g.clearRange(); return; }
      if (e.key === "Tab") { e.preventDefault(); g.move(0, e.shiftKey ? -1 : 1, false); return; }
      if (e.key === "Home") { e.preventDefault(); g.goto(g.r, 0, e.shiftKey); return; }
      if (e.key === "End") { e.preventDefault(); g.goto(g.r, cols() - 1, e.shiftKey); return; }
      if (e.key === "PageDown" || e.key === "PageUp") { e.preventDefault(); g.move((e.key === "PageDown" ? 1 : -1) * Math.max(1, Math.floor(g.scroll.clientHeight / ROW_H) - 2), 0, e.shiftKey); return; }
      var arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (arrows[e.key]) {
        e.preventDefault();
        var d = arrows[e.key];
        if (mod) {                                     /* Ctrl+arrow jumps to the edge */
          g.goto(d[0] < 0 ? g.view[0] : d[0] > 0 ? g.view[g.view.length - 1] : g.r,
                 d[1] < 0 ? 0 : d[1] > 0 ? cols() - 1 : g.c, e.shiftKey);
        } else g.move(d[0], d[1], e.shiftKey);
        return;
      }
      if (!mod && !e.altKey && e.key.length === 1) { e.preventDefault(); g.beginEdit(e.key); }
    });

    g.root.addEventListener("paste", function (e) {
      /* the browser aims a paste at the cell clicked, not the sheet: take it from anywhere in the
         grid, except a box being typed in (cell editor, formula bar, filter, find) */
      if (g.editing || (e.target.closest && e.target.closest("input, textarea"))) return;
      var cd = e.clipboardData;
      if (!cd) return;
      e.preventDefault();
      var tsv = shTableToTsv(cd.getData("text/plain") || "", cd.getData("text/html") || "");
      g.pasteText(tsv);
    });

    Array.prototype.forEach.call(wrap.querySelectorAll("[data-sh]"), function (b) {
      b.addEventListener("click", function () {
        var a = b.dataset.sh;
        if (a === "row+") g.addRow();
        else if (a === "row-") g.delSelectedRows();
        else if (a === "col+") g.addCol();
        else if (a === "col-") g.delSelectedCols();
        else if (a === "md") sheetIntoNote(g);
        else if (a === "csv") {                        /* values, as Excel exports them */
          saveBytes(new TextEncoder().encode(csvSerialise(g.displayRows(), CSV_GUARD)),
            sanitizeName(g.sheet.title) + ".csv", "text/csv");
        }
        g.root.focus();
      });
    });

    g.open = function (sh) {
      g.sheet = sh;
      g.r = g.c = g.ar = g.ac = 0;
      g.undo = []; g.redo = []; g.sortState = null; g.filters = [];
      g.find = { q: "", fuzzy: g.find.fuzzy, hits: [], at: -1, set: null }; g.findIn.value = ""; g.findCount();
      g.calc.reset(); g.types = null; g.colIdx = {};
      g.scroll.scrollTop = 0; g.scroll.scrollLeft = 0;
      g.render();
    };
  }

  /* the cheatsheet opens as you left it (after everything above is defined) */
  try { if (localStorage.getItem("carbonfibre-sheet-help") === "1") g.toggleHelp(true); } catch (e) {}
  return g;
}