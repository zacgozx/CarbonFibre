/* ============================================================
   Find in note (Ctrl+F): matches in what you see are highlighted, Enter and Shift+Enter
   step through them, Escape closes and leaves the caret at the current match.
   Searching every note moved to Ctrl+Shift+F.
   ============================================================ */
var findEl = null, findSt = { pane: null, marks: [], cur: -1, opt: { cs: false, ww: false, re: false }, replaceOn: false };
/* the pattern the find box describes: Aa = match case, ab = whole word, .* = regular expression */
function findPattern(q, global) {
  if (!q) return null;
  var src = findSt.opt.re ? q : q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (findSt.opt.ww) src = "\\b(?:" + src + ")\\b";
  try { return new RegExp(src, (global === false ? "" : "g") + (findSt.opt.cs ? "" : "i")); } catch (e) { return undefined; }
}
function findBar() {
  if (findEl) return findEl;
  findEl = document.createElement("div");
  findEl.className = "find-bar"; findEl.setAttribute("role", "search");
  var arrow = function (d) { return '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="' + d + '"/></svg>'; };
  findEl.innerHTML = '<div class="find-row"><button type="button" class="find-tog" title="Toggle replace (Ctrl+H)" aria-label="Toggle replace" aria-expanded="false">' + arrow("M6 4l4 4-4 4") + '</button>' +
    '<input type="text" class="find-in" placeholder="Find in note" aria-label="Find in note" spellcheck="false">' +
    '<button type="button" class="find-opt" data-opt="cs" title="Match case" aria-pressed="false">Aa</button>' +
    '<button type="button" class="find-opt" data-opt="ww" title="Whole word" aria-pressed="false"><u>ab</u></button>' +
    '<button type="button" class="find-opt" data-opt="re" title="Regular expression" aria-pressed="false">.*</button>' +
    '<span class="find-count" aria-live="polite"></span>' +
    '<button type="button" class="find-prev" title="Previous (Shift+Enter)" aria-label="Previous match">' + arrow("M4 10l4-4 4 4") + '</button>' +
    '<button type="button" class="find-next" title="Next (Enter)" aria-label="Next match">' + arrow("M4 6l4 4 4-4") + '</button>' +
    '<button type="button" class="find-close" title="Close (Esc)" aria-label="Close find">' + arrow("M4 4l8 8M12 4l-8 8") + '</button></div>' +
    '<div class="find-row find-rrow"><input type="text" class="find-rep" placeholder="Replace" aria-label="Replace with" spellcheck="false">' +
    '<button type="button" class="find-r1" title="Replace this one (Enter)">Replace</button>' +
    '<button type="button" class="find-rall" title="Replace all in this note (Ctrl+Alt+Enter)">All</button></div>';
  document.body.appendChild(findEl);
  var inp = findEl.querySelector(".find-in"), rep = findEl.querySelector(".find-rep");
  findEl.querySelector(".find-tog").addEventListener("click", function () { findShowReplace(!findSt.replaceOn); (findSt.replaceOn ? rep : inp).focus(); });
  Array.prototype.forEach.call(findEl.querySelectorAll(".find-opt"), function (b) {
    b.addEventListener("click", function () { findSt.opt[b.dataset.opt] = !findSt.opt[b.dataset.opt]; b.setAttribute("aria-pressed", String(findSt.opt[b.dataset.opt])); findRun(inp.value); inp.focus(); });
  });
  rep.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.altKey) { e.preventDefault(); findReplaceAll(); }
    else if (e.key === "Enter") { e.preventDefault(); findReplaceOne(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); findClose(true); }
  });
  findEl.querySelector(".find-r1").addEventListener("click", function () { findReplaceOne(); rep.focus(); });
  findEl.querySelector(".find-rall").addEventListener("click", function () { findReplaceAll(); rep.focus(); });
  inp.addEventListener("input", function () { findRun(inp.value); });
  inp.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.altKey) { e.preventDefault(); findReplaceAll(); }
    else if (e.key === "Enter") { e.preventDefault(); findStep(e.shiftKey ? -1 : 1); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); findClose(true); }
  });
  findEl.querySelector(".find-prev").addEventListener("click", function () { findStep(-1); inp.focus(); });
  findEl.querySelector(".find-next").addEventListener("click", function () { findStep(1); inp.focus(); });
  findEl.querySelector(".find-close").addEventListener("click", function () { findClose(false); });
  return findEl;
}
function findClear() {
  findSt.marks.forEach(function (m) {
    var par = m.parentNode;
    if (!par) return;
    par.replaceChild(document.createTextNode(m.textContent), m);
    par.normalize();
  });
  findSt.marks = []; findSt.cur = -1;
}
function findRun(q) {
  findClear();
  var p = findSt.pane, bar = findBar(), count = bar.querySelector(".find-count");
  if (!p || !q) { count.textContent = ""; return; }
  var re = findPattern(q);
  if (!re) { count.textContent = "Invalid pattern"; return; }
  Array.prototype.forEach.call(p.linesEl.children, function (node) {
    if (node.classList.contains("ln-tfhide")) return;
    var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode: function (t) { return t.parentNode.closest("[data-deco], .tf-btn, svg, canvas") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; }
    });
    var texts = [], tn;
    while ((tn = walker.nextNode())) texts.push(tn);
    texts.forEach(function (t) {
      var at = [], lens = [], mm;
      re.lastIndex = 0;
      while ((mm = re.exec(t.data))) { if (!mm[0].length) { re.lastIndex++; continue; } at.push(mm.index); lens.push(mm[0].length); }
      var made = [];
      for (var j = at.length - 1; j >= 0; j--) {
        t.splitText(at[j] + lens[j]);
        var mid = t.splitText(at[j]), mk = document.createElement("mark");
        mk.className = "fnd"; mid.parentNode.replaceChild(mk, mid); mk.appendChild(mid);
        made.unshift(mk);
      }
      findSt.marks = findSt.marks.concat(made);
    });
  });
  if (!findSt.marks.length) { count.textContent = "No results"; return; }
  findSt.cur = -1; findStep(1);
}
function findShowReplace(on) {
  findSt.replaceOn = on;
  var bar = findBar();
  bar.classList.toggle("replacing", on);
  bar.querySelector(".find-tog").setAttribute("aria-expanded", String(on));
}
/* Replace the current match. Matches are shown on the rendered text, but the change is made to
   the line's raw markdown: the current match is the nth highlight on its line, so the nth raw
   match on that line is replaced (or the next one, if markup split it). */
function findReplaceOne() {
  var p = findSt.pane, bar = findBar(), q = bar.querySelector(".find-in").value, rtext = bar.querySelector(".find-rep").value;
  var re = findPattern(q, false), reG = findPattern(q);
  if (!p || !re || findSt.cur < 0) return;
  var m = findSt.marks[findSt.cur], node = m.closest(".ln"), line = Array.prototype.indexOf.call(p.linesEl.children, node);
  if (line < 0) return;
  var nth = findSt.marks.filter(function (x, k) { return k < findSt.cur && x.closest(".ln") === node; }).length;
  var raw = p.lines[line], hits = [], mm;
  reG.lastIndex = 0;
  while ((mm = reG.exec(raw))) { if (!mm[0].length) { reG.lastIndex++; continue; } hits.push(mm); }
  var hit = hits[Math.min(nth, hits.length - 1)];
  if (!hit) { findStep(1); return; }
  var rep1 = hit[0].replace(re, findSt.opt.re ? rtext : rtext.replace(/\$/g, "$$$$"));
  histBreak(p);
  p.lines[line] = raw.slice(0, hit.index) + rep1 + raw.slice(hit.index + hit[0].length);
  p.commit(true); p.rerenderLines(); histBreak(p);
  var keep = findSt.cur;
  findRun(q);
  if (findSt.marks.length) { findSt.marks.forEach(function (x) { x.classList.remove("fnd-cur"); }); findSt.cur = (Math.min(keep, findSt.marks.length - 1) - 1 + findSt.marks.length) % findSt.marks.length; findStep(1); }
}
function findReplaceAll() {
  var p = findSt.pane, bar = findBar(), q = bar.querySelector(".find-in").value, rtext = bar.querySelector(".find-rep").value;
  var reG = findPattern(q);
  if (!p || !reG) return;
  var n = 0, out = p.lines.map(function (raw) {
    return raw.replace(reG, function () { n++; return findSt.opt.re ? arguments[0].replace(findPattern(q, false), rtext) : rtext; });
  });
  if (!n) { bar.querySelector(".find-count").textContent = "No results"; return; }
  histBreak(p);
  p.lines.splice.apply(p.lines, [0, p.lines.length].concat(out));
  p.commit(true); p.rerenderLines(); histBreak(p);
  findRun(q);
  bar.querySelector(".find-count").textContent = "Replaced " + n;
}
function findStep(d) {
  var n = findSt.marks.length, count = findBar().querySelector(".find-count");
  if (!n) return;
  if (findSt.cur >= 0) findSt.marks[findSt.cur].classList.remove("fnd-cur");
  findSt.cur = (findSt.cur + d + n) % n;
  var m = findSt.marks[findSt.cur];
  m.classList.add("fnd-cur");
  m.scrollIntoView({ block: "center", inline: "nearest" });
  count.textContent = (findSt.cur + 1) + " of " + n;
}
function findOpen(withReplace) {
  var p = focusedPane || panes[0];
  if (!p || !p.linesEl || (typeof sk !== "undefined" && sk)) return false;
  var pre = "";
  if (p.ta && document.activeElement === p.ta && p.ta.selectionStart !== p.ta.selectionEnd) pre = p.ta.value.slice(p.ta.selectionStart, p.ta.selectionEnd);
  if (findSt.pane && findSt.pane !== p) findClear();
  findSt.pane = p;
  if (p.deactivate) p.deactivate();               /* show every line rendered, so matches are marked in what you see */
  var bar = findBar(), host = p.linesEl.parentNode.getBoundingClientRect(), inp = bar.querySelector(".find-in");
  bar.style.top = (host.top + 8) + "px";
  bar.classList.add("show");
  /* sit at the editor's top right, by the bar's real width, never past the window's edge */
  bar.style.left = Math.max(host.left + 8, Math.min(host.right, window.innerWidth) - bar.offsetWidth - 12) + "px";
  if (pre && pre.indexOf("\n") === -1) inp.value = pre;
  findShowReplace(!!withReplace || (findSt.replaceOn && withReplace !== false));
  inp.focus(); inp.select();
  setTimeout(function () { findRun(inp.value); }, 40);   /* after the editing line has re-rendered */
  return true;
}
function findClose(gotoMatch) {
  var p = findSt.pane, m = findSt.cur >= 0 ? findSt.marks[findSt.cur] : null, line = -1, q = findBar().querySelector(".find-in").value;
  if (m && p) { var node = m.closest(".ln"); line = Array.prototype.indexOf.call(p.linesEl.children, node); }
  var reF = findPattern(q, false);
  findClear();
  findBar().classList.remove("show");
  if (p && gotoMatch && line >= 0) {
    var mf = reF ? reF.exec(p.lines[line]) : null, at = mf ? mf.index : -1;
    p.setActive(line, Math.max(0, at));
    if (at >= 0 && p.ta) p.ta.setSelectionRange(at, at + mf[0].length);
  }
}

/* ---------------- code highlighter ---------------- */

var CODE_RE =
  /(\/\/[^\n]*|#[^\n]*)|("[^"\n]*"|'[^'\n]*'|`[^`\n]*`)|\b(\d+\.?\d*)\b|\b(const|let|var|function|return|if|else|elif|for|while|import|from|export|class|def|async|await|try|except|catch|finally|lambda|print|True|False|None|null|undefined|true|false|new|this|self|in|of|not|and|or|pass|break|continue|switch|case|type|interface)\b/g;

function highlightCode(line) {
  var e = esc(line), out = "", last = 0, m;
  CODE_RE.lastIndex = 0;
  while ((m = CODE_RE.exec(e)) !== null) {
    if (m.index > last) out += e.slice(last, m.index);
    var cls = m[1] ? "tk-com" : m[2] ? "tk-str" : m[3] ? "tk-num" : "tk-kw";
    out += '<span class="' + cls + '">' + m[0] + "</span>";
    last = m.index + m[0].length;
  }
  if (last < e.length) out += e.slice(last);
  return out;
}

/* ---------------- rendering primitives ---------------- */

function lineClass(raw, fenceInfo) {
  if (fenceInfo && fenceInfo.fence && fenceInfo.lang === "excalidraw")
    return fenceInfo.fence === "open" ? "ln ln-sketch" : "ln ln-hidden";
  if (fenceInfo && fenceInfo.fence)
    return "ln ln-codefence" + (fenceInfo.fence !== "in" ? " ln-fencedelim" : "");
  if (fenceInfo && fenceInfo.table) {
    var t = fenceInfo.table;
    if (t.role === "delim") return "ln ln-tdelim";
    return "ln ln-trow " + (t.role === "header" ? "ln-thead" : "ln-tbody");
  }
  var c = classifyLine(raw);
  switch (c.type) {
    case "heading": return "ln ln-h ln-h" + Math.min(c.level, 6);   /* every level gets its own colour */
    case "quote": return "ln ln-quote";
    case "hr": return "ln ln-hrline";
    case "blank": return "ln ln-blank";
    default: return "ln";
  }
}

function lineInnerHtml(raw, fenceInfo, idx) {
  var emb = !(fenceInfo && fenceInfo.fence) && /^!\[\[([^\]|]+?\.excalidraw)(?:\|[^\]]*)?\]\]\s*$/i.exec(raw);
  if (emb) {                                            /* a sketch file shown in the note */
    var ep = sketchPathOf(emb[1]), ef = sketchFileOf(ep), eurl = ef ? sketchPreviewUrl(ef.text) : "", en = ef ? sketchCount(ef) : 0;
    if (!ef) return '<span data-deco="1" class="skp skp-missing">' + (sketchCanWrite() ? "Missing sketch: " + esc(ep)
      : "Sketch folder not connected (" + esc(ep) + "). Open the Sketch library (Alt+K) to choose or reconnect it.") + "</span>";
    return '<span data-deco="1" class="skp skp-file" data-skfile="' + esc(ep) + '" title="Click to edit ' + esc(ep) + '">' +
      (eurl ? '<img class="skp-img" src="' + eurl + '" alt="Sketch: ' + esc(ep) + '" draggable="false">' : '<span class="skp-empty">Empty sketch. Click to draw.</span>') +
      '<span class="skp-bar"><span class="skp-btn" data-skfile="' + esc(ep) + '">' + ico("pencil") + " Edit</span></span>" +
      '<span class="skp-count">' + esc(ep) + " \u00b7 " + en + (en === 1 ? " shape" : " shapes") + "</span></span>";
  }
  if (fenceInfo && fenceInfo.fence && fenceInfo.lang === "excalidraw") {
    if (fenceInfo.fence !== "open") return "";
    var cnt = fenceInfo.sketch || 0, url = cnt ? sketchPreviewUrl(fenceInfo.skBody || "") : "";
    return '<span data-deco="1" class="skp" data-sketch="' + idx + '" title="Click to open the sketch">' +
      (url ? '<img class="skp-img" src="' + url + '" alt="Sketch: ' + cnt + ' shapes" draggable="false">' : '<span class="skp-empty">' + (cnt ? "This sketch can't be previewed. Click to open it." : "Empty sketch. Click to draw.") + "</span>") +
      '<span class="skp-bar"><span class="skp-btn" data-sketch="' + idx + '" title="Open the sketch here">' + ico("pencil") + " Sketch</span>" +
      '<span class="skp-btn sk-open-split" data-sketch-split="' + idx + '" title="Open this drawing in a pane beside the note">Open in split</span></span>' +
      '<span class="skp-count">' + cnt + (cnt === 1 ? " shape" : " shapes") + "</span></span>";
  }
  if (fenceInfo && fenceInfo.table) {
    if (fenceInfo.table.role === "delim") return "";
    return tableRowHtml(raw, fenceInfo.table);
  }
  if (fenceInfo && (fenceInfo.fence === "open" || fenceInfo.fence === "close")) {
    return '<span data-deco="1" class="fence-tick">```</span>' +
      (fenceInfo.fence === "open" && fenceInfo.lang
        ? '<span data-deco="1" class="fence-lang">' + esc(fenceInfo.lang) + "</span>" : "") +
      (fenceInfo.fence === "open" && idx >= 0
        ? '<span data-deco="1" class="code-copy" data-copy="' + idx + '" role="button" tabindex="-1" title="Copy the code in this block">Copy</span>' : "") +
      (fenceInfo.fence === "open" && /^mermaid$/i.test(fenceInfo.lang || "")
        ? '<span data-deco="1" class="sk-open-split mm-convert" data-mermaid="' + idx + '" title="Add an editable sketch of this flowchart below it">convert to sketch</span>' : "");
  }
  if (fenceInfo && fenceInfo.fence === "in") return raw === "" ? "&nbsp;" : highlightCode(raw);

  var c = classifyLine(raw);
  if (c.type === "blank") return "&nbsp;";
  if (c.type === "hr") return '<span data-deco="1" class="hr-rule"></span>';

  var inline = tokensToHtml(scanInline(c.text).tokens);
  if (c.type === "heading") return inline;
  if (c.type === "task") {
    return '<span data-deco="1" class="cb' + (c.done ? " cb-done" : "") + '"' + (idx >= 0 ? ' data-check="' + idx + '"' : "") +
      ' role="checkbox" aria-checked="' + c.done + '">' + (c.done ? ico("check", "cb-tick") : "") + "</span>" +
      '<span class="' + (c.done ? "task-done" : "") + '">' + inline + "</span>";
  }
  if (c.type === "bullet") return '<span data-deco="1" class="bullet"></span><span>' + inline + "</span>";
  if (c.type === "ordered") return '<span data-deco="1" class="onum">' + c.num + ".</span><span>" + inline + "</span>";
  return inline;
}

/* flip a task checkbox on one line, in place */
function toggleTask(line) {
  return line.replace(/\[( |x|X)\]/, function (m0, g) { return g === " " ? "[x]" : "[ ]"; });
}

function makeRenderedNode(raw, fenceInfo, idx) {
  var div = document.createElement("div");
  div.className = lineClass(raw, fenceInfo);
  var c = classifyLine(raw);
  if (!fenceInfo || !fenceInfo.fence) {
    if (c.type === "task" || c.type === "bullet" || c.type === "ordered") {
      div.classList.add("ln-li");
      div.style.paddingLeft = (8 + c.indent * 10) + "px";
    } else if (c.type === "para") {
      /* HTML collapses leading spaces, so an indented paragraph used to look unindented
         once you left it. Draw the indentation instead, one character width per space,
         so the line sits in the same place whether or not you are editing it. */
      var lead = raw.match(/^ */)[0].length;
      if (lead) div.style.paddingLeft = lead + "ch";
    }
  }
  if (fenceInfo && fenceInfo.table && fenceInfo.table.role !== "delim") {
    div.style.gridTemplateColumns = fenceInfo.table.template;
    if (fenceInfo.table.role === "body" && !rowPassesFilter(raw, fenceInfo.table)) div.classList.add("ln-tfhide");
    if (idx === fenceInfo.table.last) div.classList.add("ln-tlast");
  }
  div.innerHTML = lineInnerHtml(raw, fenceInfo, idx);
  return div;
}

function overlayHtml(raw, fenceInfo) {
  if (raw === "") return "&nbsp;";
  if (fenceInfo && fenceInfo.table) {
    if (fenceInfo.table.role === "delim") return '<span class="mk">' + esc(raw) + "</span>";
    return tableOverlay(raw);
  }
  if (fenceInfo && (fenceInfo.fence === "open" || fenceInfo.fence === "close"))
    return '<span class="mk">```</span><span class="fence-lang">' + esc(raw.slice(3)) + "</span>";
  if (fenceInfo && fenceInfo.fence === "in") return highlightCode(raw);
  var c = classifyLine(raw);
  if (c.type === "hr") return '<span class="mk">' + esc(raw) + "</span>";
  if (c.type === "blank") return esc(raw) || "&nbsp;";
  var head = c.prefix ? '<span class="mk">' + esc(c.prefix) + "</span>" : "";
  return head + styledRawInline(raw.slice(c.prefixLen));
}

/* ---------------- click -> caret mapping ---------------- */

/* width of text as it would render inside el, using a shared offscreen context */
function measureIn(el, text) {
  var cv = measureIn.cv || (measureIn.cv = document.createElement("canvas").getContext("2d"));
  var cs = getComputedStyle(el);
  cv.font = cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
  return cv.measureText(text).width;
}

function visibleOffsetFromPoint(lineEl, x, y) {
  var r = document.caretRangeFromPoint(x, y);
  if (!r) return null;
  var container = r.startContainer, offset = r.startOffset;
  var walker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT, {
    acceptNode: function (node) {
      var el = node.parentElement;
      while (el && el !== lineEl) {
        if (el.dataset && el.dataset.deco) return NodeFilter.FILTER_REJECT;
        el = el.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  var total = 0, node;
  /* the point can fall between elements rather than inside text (on a bullet, in the indent, past
     the end): then count only the text that comes before it - this used to count everything, so
     a click left of a bullet's text put the caret at the end of the line */
  var at = null;
  var inDeco = false;
  for (var pe = container.nodeType === 3 ? container.parentElement : container; pe && pe !== lineEl; pe = pe.parentElement) if (pe.dataset && pe.dataset.deco) inDeco = true;
  if (container.nodeType !== 3 || inDeco) { at = document.createRange(); at.setStart(container, offset); at.collapse(true); }   /* e.g. on a list's "1." */
  while ((node = walker.nextNode())) {
    if (node === container) return total + offset;
    if (at && at.comparePoint(node, 0) >= 0) return total;
    total += node.textContent.length;
  }
  return total;
}

/* Where raw column `col` falls in a line's formatted text (counting only the text you see, not
   decoration such as bullets): the inverse of rawCaretFromClick. null when the line has no simple
   mapping (table rows), so a highlight there covers the whole line. */
function visibleFromRaw(raw, fenceInfo, col) {
  if (fenceInfo && fenceInfo.fence) return fenceInfo.fence === "in" ? Math.min(col, raw.length) : null;
  if (fenceInfo && fenceInfo.table) return null;
  var c = classifyLine(raw);
  if (c.type === "blank" || c.type === "hr") return 0;
  if (col <= c.prefixLen) return 0;
  var map = scanInline(c.text).map, rel = col - c.prefixLen;
  for (var v = 0; v < map.length; v++) if (map[v] >= rel) return v;
  return map.length - 1;
}
/* a DOM Range over visible characters [a, b) of a rendered line (decoration skipped) */
function rangeOfVisible(lineEl, a, b) {
  var walk = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT, { acceptNode: function (n) {
    for (var e = n.parentElement; e && e !== lineEl; e = e.parentElement) if (e.dataset && e.dataset.deco) return NodeFilter.FILTER_REJECT;
    return NodeFilter.FILTER_ACCEPT; } });
  var r = document.createRange(), pos = 0, n, started = false, last = null;
  while ((n = walk.nextNode())) {
    var len = n.textContent.length;
    if (!started && a <= pos + len) { r.setStart(n, Math.max(0, a - pos)); started = true; }
    if (started && b <= pos + len) { r.setEnd(n, Math.max(0, b - pos)); return r; }
    pos += len; last = n;
  }
  if (!started) return null;
  r.setEnd(last, last.textContent.length);
  return r;
}
var PANE_TINTS = new Map();
function paneTint(p, ranges) {
  if (typeof CSS === "undefined" || !CSS.highlights) return;
  if (ranges.length) PANE_TINTS.set(p, ranges); else PANE_TINTS.delete(p);
  var all = []; PANE_TINTS.forEach(function (rs) { all = all.concat(rs); });
  if (all.length) CSS.highlights.set("cf-sel", new Highlight(...all)); else CSS.highlights.delete("cf-sel");   /* ranges as separate arguments */
}
function rawCaretFromClick(raw, fenceInfo, lineEl, x, y) {
  var vis = visibleOffsetFromPoint(lineEl, x, y);
  if (vis === null) return raw.length;
  if (fenceInfo && fenceInfo.fence) return Math.min(vis, raw.length);
  if (fenceInfo && fenceInfo.table) {
    if (fenceInfo.table.role === "delim") return raw.length;
    var cells = splitCells(raw), acc = 0;
    for (var c = 0; c < fenceInfo.table.cols; c++) {
      if (!cells[c]) continue;
      var cm = scanInline(cells[c].text).map, len = cm.length - 1;
      if (vis <= acc + len) return cells[c].start + cm[Math.max(0, vis - acc)];
      acc += len;
    }
    return raw.length;
  }
  c = classifyLine(raw);
  if (c.type === "blank" || c.type === "hr") return raw.length;
  var map = scanInline(c.text).map;
  var clamped = Math.max(0, Math.min(vis, map.length - 1));
  return c.prefixLen + map[clamped];
}

/* ---------------- format helper ---------------- */

function wrapSelection(el, before, after, placeholder) {
  var v = el.value, s = el.selectionStart, e = el.selectionEnd;
  var sel = v.slice(s, e) || placeholder || "";
  var wrappedAlready = v.slice(s - before.length, s) === before && v.slice(e, e + after.length) === after;
  var next, ns, ne;
  if (wrappedAlready) {
    next = v.slice(0, s - before.length) + sel + v.slice(e + after.length);
    ns = s - before.length; ne = ns + sel.length;
  } else if (sel.indexOf(before) === 0 && sel.slice(-after.length) === after && sel.length >= before.length + after.length) {
    var inner = sel.slice(before.length, sel.length - after.length);
    next = v.slice(0, s) + inner + v.slice(e);
    ns = s; ne = s + inner.length;
  } else {
    next = v.slice(0, s) + before + sel + after + v.slice(e);
    ns = s + before.length; ne = ns + sel.length;
  }
  return { next: next, ns: ns, ne: ne };
}

function looksLikeUrl(sel) {
  return /^(https?:\/\/|www\.|[^\s@]+@[^\s@]+\.)/i.test(sel) ||
    /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(sel);
}

