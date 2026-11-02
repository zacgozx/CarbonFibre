/* ============================================================
   Table filters: a funnel on each header cell. Rows that do not match every column's
   filter are hidden while you look; the markdown is never changed. Filters live for the
   session and follow the table's header line.
   ============================================================ */
var TABLE_FILTERS = {};                      /* header line -> { column: { vals: [allowed values] } } */
function tableFilterFor(t) { return t && t.headRaw && TABLE_FILTERS[t.headRaw]; }
function tfCellText(raw, c) { var cells = splitCells(raw); return cells[c] ? cells[c].text.trim() : ""; }
function rowPassesFilter(raw, t, skipCol) {
  var f = tableFilterFor(t);
  if (!f) return true;
  return Object.keys(f).every(function (c) {
    if (+c === skipCol) return true;
    var rule = f[c], v = tfCellText(raw, +c);
    if (rule && rule.vals) return rule.vals.indexOf(v) !== -1;
    if (typeof rule === "string") return v.toLowerCase().indexOf(rule) !== -1;
    return true;
  });
}
var TF_CMP = function (a, b) {                /* numbers as numbers, text alphabetically, blanks last */
  if (a === "" && b !== "") return 1;
  if (b === "" && a !== "") return -1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
};
var tfPopEl = null, tfCtx = null;
function tfPop() {
  if (tfPopEl) return tfPopEl;
  tfPopEl = document.createElement("div");
  tfPopEl.className = "tf-pop"; tfPopEl.setAttribute("role", "dialog"); tfPopEl.setAttribute("aria-label", "Sort and filter column");
  var ic = function (d) { return '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="' + d + '"/></svg>'; };
  tfPopEl.innerHTML =
    '<div class="tf-title"></div>' +
    '<button type="button" class="tf-row tf-asc">' + ic("M4 3v10M2 11l2 2 2-2M9 4h5M9 8h4M9 12h3") + 'Sort A to Z</button>' +
    '<button type="button" class="tf-row tf-desc">' + ic("M4 3v10M2 11l2 2 2-2M9 4h3M9 8h4M9 12h5") + 'Sort Z to A</button>' +
    '<button type="button" class="tf-row tf-clear">' + ic("M2.5 3h11l-4.2 5v4.5l-2.6 1.2V8zM11 11l3 3M14 11l-3 3") + '<span class="tf-clear-label">Clear filter</span></button>' +
    '<div class="tf-sep"></div>' +
    '<input type="text" class="tf-in" spellcheck="false" placeholder="Search" aria-label="Search values">' +
    '<div class="tf-list" role="group" aria-label="Values"></div>' +
    '<div class="tf-foot"><span class="tf-count"></span><button type="button" class="tf-cancel">Cancel</button><button type="button" class="tf-ok">OK</button></div>';
  document.body.appendChild(tfPopEl);
  var inp = tfPopEl.querySelector(".tf-in");
  inp.addEventListener("input", function () { tfRenderList(); });
  tfPopEl.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); tfClose(); }
    else if (e.key === "Enter" && e.target.tagName !== "BUTTON") { e.preventDefault(); tfOk(); }
  });
  tfPopEl.querySelector(".tf-asc").addEventListener("click", function () { tfSort(1); });
  tfPopEl.querySelector(".tf-desc").addEventListener("click", function () { tfSort(-1); });
  tfPopEl.querySelector(".tf-clear").addEventListener("click", function () {
    if (!tfCtx) return;
    var f = TABLE_FILTERS[tfCtx.head];
    if (f) { delete f[tfCtx.col]; if (!Object.keys(f).length) delete TABLE_FILTERS[tfCtx.head]; }
    tfRefresh(); tfClose();
  });
  tfPopEl.querySelector(".tf-cancel").addEventListener("click", tfClose);
  tfPopEl.querySelector(".tf-ok").addEventListener("click", tfOk);
  tfPopEl.querySelector(".tf-list").addEventListener("change", function (e) {
    var box = e.target;
    if (!tfCtx || box.type !== "checkbox") return;
    var shown = tfShownValues();
    if (box.dataset.all) shown.forEach(function (v) { tfCtx.checked[v] = box.checked; });
    else tfCtx.checked[box.dataset.v] = box.checked;
    tfRenderList(true);
  });
  document.addEventListener("mousedown", function (e) {
    if (tfPopEl.classList.contains("show") && !tfPopEl.contains(e.target) && !e.target.closest(".tf-btn")) tfClose();
  });
  return tfPopEl;
}
function tfTable() {                          /* the table the popup is about, as it is now */
  if (!tfCtx) return null;
  var p = tfCtx.pane;
  for (var i = 0; i < p.lines.length; i++) if (p.fmeta[i] && p.fmeta[i].table && p.fmeta[i].table.headRaw === tfCtx.head) return p.fmeta[i].table;
  return null;
}
function tfShownValues() {
  var q = tfPopEl.querySelector(".tf-in").value.trim().toLowerCase();
  return tfCtx.values.filter(function (v) { return !q || (v === "" ? "(blanks)" : v.toLowerCase()).indexOf(q) !== -1; });
}
function tfRenderList(keepScroll) {
  var list = tfPopEl.querySelector(".tf-list"), top = list.scrollTop, shown = tfShownValues();
  var all = shown.length && shown.every(function (v) { return tfCtx.checked[v]; });
  var some = shown.some(function (v) { return tfCtx.checked[v]; });
  var row = function (v, label, attr, on) {
    return '<label class="tf-item"><input type="checkbox" ' + attr + (on ? " checked" : "") + '><span class="tf-v">' + esc(label) + "</span>" +
      (v !== null ? '<span class="tf-n">' + tfCtx.counts[v] + "</span>" : "") + "</label>";
  };
  var html = row(null, "(Select all" + (tfPopEl.querySelector(".tf-in").value.trim() ? " search results)" : ")"), 'data-all="1"', all);
  shown.forEach(function (v) { html += row(v, v === "" ? "(Blanks)" : v, 'data-v="' + esc(v) + '"', !!tfCtx.checked[v]); });
  if (!shown.length) html += '<div class="tf-none">No matches</div>';
  list.innerHTML = html;
  var allBox = list.querySelector("[data-all]");
  if (allBox) allBox.indeterminate = some && !all;
  if (keepScroll) list.scrollTop = top;
  tfPopEl.querySelector(".tf-ok").disabled = !shown.some(function (v) { return tfCtx.checked[v]; });
}
function tfOpen(btn) {
  var node = btn.closest(".ln"), pane = null;
  panes.forEach(function (p) { if (p.linesEl && p.linesEl.contains(node)) pane = p; });
  if (!pane) return;
  var idx = Array.prototype.indexOf.call(pane.linesEl.children, node), t = pane.fmeta[idx] && pane.fmeta[idx].table;
  if (!t) return;
  var col = +btn.dataset.tf, name = tfCellText(pane.lines[idx], col) || "Column " + (col + 1);
  /* values from rows the other columns' filters let through, as in Excel */
  var counts = {}, values = [];
  for (var r = t.first + 2; r <= t.last; r++) {
    if (!rowPassesFilter(pane.lines[r], t, col)) continue;
    var v = tfCellText(pane.lines[r], col);
    if (counts[v] === undefined) { counts[v] = 0; values.push(v); }
    counts[v]++;
  }
  values.sort(TF_CMP);
  var f = TABLE_FILTERS[t.headRaw], rule = f && f[col], checked = {};
  values.forEach(function (v) { checked[v] = !rule || !rule.vals || rule.vals.indexOf(v) !== -1; });
  tfCtx = { pane: pane, head: t.headRaw, col: col, values: values, counts: counts, checked: checked };
  var pop = tfPop(), r0 = btn.closest(".tcell").getBoundingClientRect();
  pop.querySelector(".tf-title").textContent = name;
  pop.querySelector(".tf-in").value = "";
  pop.querySelector(".tf-clear").disabled = !rule;
  pop.querySelector(".tf-clear-label").textContent = 'Clear filter from "' + name + '"';
  tfRenderList();
  pop.classList.add("show");
  var w = pop.offsetWidth, h = pop.offsetHeight;
  pop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r0.right - w)) + "px";
  pop.style.top = (r0.bottom + 4 + h > window.innerHeight - 8 ? Math.max(8, r0.top - h - 4) : r0.bottom + 4) + "px";
  tfCount();
  pop.querySelector(".tf-in").focus();
}
function tfCount() {
  var t = tfTable(), p = tfCtx && tfCtx.pane;
  if (!t) return;
  var shown = 0, total = 0;
  for (var r = t.first + 2; r <= t.last; r++) { total++; if (rowPassesFilter(p.lines[r], t)) shown++; }
  tfPopEl.querySelector(".tf-count").textContent = shown === total ? total + " rows" : shown + " of " + total + " rows";
}
function tfOk() {
  if (!tfCtx) return;
  var shown = tfShownValues(), searching = !!tfPopEl.querySelector(".tf-in").value.trim();
  /* searching filters to the ticked matches; otherwise to everything ticked */
  var keep = (searching ? shown : tfCtx.values).filter(function (v) { return tfCtx.checked[v]; });
  if (!keep.length) return;
  var f = TABLE_FILTERS[tfCtx.head] || (TABLE_FILTERS[tfCtx.head] = {});
  if (!searching && keep.length === tfCtx.values.length) delete f[tfCtx.col];
  else f[tfCtx.col] = { vals: keep };
  if (!Object.keys(f).length) delete TABLE_FILTERS[tfCtx.head];
  tfRefresh(); tfClose();
}
/* sorting reorders the rows in the note itself, as Excel does - one undo step */
function tfSort(dirn) {
  var t = tfTable(), p = tfCtx && tfCtx.pane, col = tfCtx && tfCtx.col;
  if (!t) return;
  var first = t.first + 2, body = p.lines.slice(first, t.last + 1);
  var keyed = body.map(function (raw, k) { return { raw: raw, v: tfCellText(raw, col), k: k }; });
  keyed.sort(function (a, b) {
    if (a.v === "" || b.v === "") return TF_CMP(a.v, b.v) || a.k - b.k;   /* blanks stay last either way */
    return dirn * TF_CMP(a.v, b.v) || a.k - b.k;
  });
  var sorted = keyed.map(function (x) { return x.raw; });
  if (sorted.join("\n") === body.join("\n")) { tfClose(); return; }
  p.deactivate();
  histBreak(p);
  Array.prototype.splice.apply(p.lines, [first, sorted.length].concat(sorted));
  p.commit(true);
  histBreak(p);
  tfRefresh(); tfClose();
}
function tfRefresh() { panes.forEach(function (p) { if (p.rerenderLines && p.lines) p.rerenderLines(); }); }
function tfClose() { if (tfPopEl) tfPopEl.classList.remove("show"); tfCtx = null; }
/* ---- cursor trail (after the Ninja cursor plugin for Obsidian, itself after Neovide) ----
   When the caret moves, a block flies from where it was to where it is in 75 ms, overshooting
   slightly, trailing a fading streak back toward where it came from, so a jump is easy to follow.
   The caret lives in each line's text box, which can't report where the caret is on screen; the
   line's coloured copy underneath matches it character for character, so it is measured there. */
var NINJA = { on: true, last: null, wrap: null, cur: null, trail: null, raf: 0 };
(function () {
  var saved = null;
  try { saved = localStorage.getItem("carbonfibre-cursor-trail"); } catch (e) {}
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  NINJA.on = saved === null ? !reduced : saved === "1";
})();
function ninjaSet(on) {
  NINJA.on = on; NINJA.last = null;
  storeSet("carbonfibre-cursor-trail", on ? "1" : "0");
}
/* where the caret is on screen: the line's coloured copy holds the same characters */
function ninjaCaret() {
  var ta = document.activeElement;
  if (!ta || !ta.classList || !ta.classList.contains("line-ta")) return null;
  var hl = ta.parentNode && ta.parentNode.querySelector(".ta-hl");
  if (!hl) return null;
  var at = ta.selectionDirection === "backward" ? ta.selectionStart : ta.selectionEnd;
  var lineH = parseFloat(getComputedStyle(ta).lineHeight) || 22, rect = null;
  var walk = document.createTreeWalker(hl, NodeFilter.SHOW_TEXT), node, left = at;
  while ((node = walk.nextNode())) {
    if (left <= node.length) { var r = document.createRange(); r.setStart(node, left); r.setEnd(node, left); rect = r.getBoundingClientRect(); break; }
    left -= node.length;
  }
  var scroller = ta.closest(".editor") || null;
  if (!rect || (!rect.height && !rect.left && !rect.top)) {      /* an empty line: its start */
    var hr = hl.getBoundingClientRect();
    return { x: hr.left, y: hr.top, h: lineH, sc: scroller, st: scroller ? scroller.scrollTop : 0 };
  }
  return { x: rect.left, y: rect.top, h: rect.height || lineH, sc: scroller, st: scroller ? scroller.scrollTop : 0 };
}
function ninjaCheck() {
  NINJA.raf = 0;
  if (!NINJA.on) return;
  var now = ninjaCaret();
  if (!now) { NINJA.last = null; return; }
  var was = NINJA.last;
  NINJA.last = now;
  if (!was) return;
  /* the note scrolled since: where the old caret is on screen now */
  var oy = was.y - (was.sc && was.sc === now.sc ? now.st - was.st : 0);
  if (Math.abs(was.x - now.x) < 0.5 && Math.abs(oy - now.y) < 0.5) return;
  ninjaFly(was.x, oy, now.x, now.y, now.h);
}
function ninjaFly(x1, y1, x2, y2, h) {
  if (!NINJA.wrap) {
    NINJA.wrap = document.createElement("div"); NINJA.wrap.className = "ninja-wrap"; NINJA.wrap.setAttribute("aria-hidden", "true");
    NINJA.cur = document.createElement("span"); NINJA.cur.className = "ninja-cur";
    NINJA.trail = document.createElement("span"); NINJA.trail.className = "ninja-trail";
    NINJA.cur.appendChild(NINJA.trail); NINJA.wrap.appendChild(NINJA.cur); document.body.appendChild(NINJA.wrap);
  }
  var W = 4, dx = x1 - x2, dy = y1 - y2, dist = Math.sqrt(dx * dx + dy * dy), ang = Math.atan2(dy, dx);
  /* the streak is as thick as the caret when it moves sideways, as thin as the caret is wide when it moves up or down */
  var thick = Math.abs(Math.sin(ang)) * W + Math.abs(Math.cos(ang)) * h;
  var cur = NINJA.cur, tr = NINJA.trail;
  cur.style.height = h + "px";
  tr.style.width = dist + "px"; tr.style.height = thick + "px"; tr.style.top = (h - thick) / 2 + "px";
  tr.style.transform = "rotate(" + ang + "rad)";
  cur.getAnimations().forEach(function (a) { a.cancel(); });
  var from = "translate3d(" + x1 + "px," + y1 + "px,0)", to = "translate3d(" + x2 + "px," + y2 + "px,0)";
  cur.animate([
    { transform: from, opacity: 0 },
    { opacity: 1, offset: 0.04 },
    { opacity: 0.95, offset: 0.8 },
    { transform: to, opacity: 0.9, offset: 0.9 },
    { transform: to, opacity: 0 }
  ], { duration: 75, easing: "cubic-bezier(0.34, 1.26, 0.84, 1)", fill: "both" });
}
["keydown", "keyup", "mousedown", "mouseup", "input", "focusin"].forEach(function (ev) {
  document.addEventListener(ev, function () {
    if (!NINJA.on || NINJA.raf) return;
    NINJA.raf = requestAnimationFrame(function () { NINJA.raf = requestAnimationFrame(ninjaCheck); });   /* after the editor has moved the caret */
  }, true);
});
document.addEventListener("selectionchange", function () {
  if (!NINJA.on || NINJA.raf) return;
  NINJA.raf = requestAnimationFrame(ninjaCheck);
});

/* the Copy button on a code block copies the code inside it (not the ``` lines), without
   putting the line into editing */
document.addEventListener("mousedown", function (e) {
  var b = e.target.closest && e.target.closest(".code-copy");
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  var pane = null;
  panes.forEach(function (q) { if (q.linesEl && q.linesEl.contains(b)) pane = q; });
  if (!pane) return;
  var at = +b.dataset.copy, out = [];
  for (var i = at + 1; i < pane.lines.length && !(pane.fmeta[i] && pane.fmeta[i].fence === "close"); i++) out.push(pane.lines[i]);
  copyText(out.join("\n"));
  b.textContent = "Copied"; b.classList.add("done");
  setTimeout(function () { if (b.isConnected) { b.textContent = "Copy"; b.classList.remove("done"); } }, 1500);
}, true);
/* a funnel press opens the filter and never puts the header line into editing */
document.addEventListener("mousedown", function (e) {
  var b = e.target.closest && e.target.closest(".tf-btn");
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  tfOpen(b);
}, true);

