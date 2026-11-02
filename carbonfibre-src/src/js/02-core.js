/* ============================================================
   CarbonFibre - standalone, no dependencies. Built for Edge.
   Panes: each pane is an independent live editor instance.
   ============================================================ */

/* ---------------- utils ---------------- */

function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function escAttr(s) { return esc(s).replace(/"/g, "&quot;"); }
function isDelim(raw) { return /^```/.test(raw); }

function normalizeUrl(u) {
  u = (u || "").trim();
  if (!u) return "";
  if (/^(javascript|data|vbscript):/i.test(u)) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return u;
  if (u.charAt(0) === "#" || u.charAt(0) === "/") return u;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u)) return "mailto:" + u;
  return "https://" + u;
}

/* ---------------- inline scanner ---------------- */

var INLINE_RE =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(~~[^~\n]+~~)|(\[\[[^\]\n]+\]\])|(\[[^\]\n]+\]\([^)\n]*\))|(\*[^*\n]+\*)|(_[^_\n]+_)|(https?:\/\/[^\s<>()]+)|(<span style="color:\s*([#a-zA-Z0-9]+);?\s*">([^<\n]+)<\/span>)/g;

function scanInline(raw) {
  var tokens = [], map = [], last = 0, m;
  INLINE_RE.lastIndex = 0;
  function pushPlain(from, to) {
    if (to <= from) return;
    tokens.push({ kind: "text", text: raw.slice(from, to) });
    for (var k = from; k < to; k++) map.push(k);
  }
  /* marker is what the raw view shows around the token; bare marks a naked URL */
  function pushToken(kind, inner, rawStart, markerLen, extra, marker, bare) {
    tokens.push({ kind: kind, text: inner, extra: extra, marker: marker, bare: bare });
    for (var k = 0; k < inner.length; k++) map.push(rawStart + markerLen + k);
  }
  while ((m = INLINE_RE.exec(raw)) !== null) {
    pushPlain(last, m.index);
    var s = m[0], start = m.index;
    if (m[1]) pushToken("code", s.slice(1, -1), start, 1);
    else if (m[2] || m[3]) pushToken("bold", s.slice(2, -2), start, 2, null, m[2] ? "**" : "__");
    else if (m[4]) pushToken("strike", s.slice(2, -2), start, 2, null, "~~");
    else if (m[5]) pushToken("wikilink", s.slice(2, -2), start, 2);
    else if (m[6]) {
      var close = s.indexOf("]");
      pushToken("link", s.slice(1, close), start, 1, s.slice(close + 2, -1));
    } else if (m[9]) pushToken("link", s, start, 0, s, null, true);
    else if (m[10]) { var openLen = s.indexOf(">") + 1; pushToken("color", m[12], start, openLen, m[11].toLowerCase(), s.slice(0, openLen)); }   /* the tags are hidden markup, like ** */
    else pushToken("italic", s.slice(1, -1), start, 1, null, m[7] ? "*" : "_");
    last = m.index + s.length;
  }
  pushPlain(last, raw.length);
  map.push(raw.length);
  return { tokens: tokens, map: map };
}

/* how each token renders: [open, close] rendered, and the markers shown when the line is raw */
var TOK = {
  bold: ["<strong>", "</strong>"], italic: ["<em>", "</em>"],
  strike: ["<del>", "</del>"], code: ['<code class="ic">', "</code>"]
};
function mk(t) { return '<span class="mk">' + t + "</span>"; }

function tokenHtml(t, raw) {
  var x = esc(t.text), pair = TOK[t.kind];
  if (pair) {
    if (!raw) return pair[0] + x + pair[1];
    if (t.kind === "code") return mk("`") + '<span class="ic-hl">' + x + "</span>" + mk("`");
    return mk(t.marker) + pair[0] + x + pair[1] + mk(t.marker);
  }
  if (t.kind === "wikilink") {
    if (raw) return mk("[[") + '<span class="wl-hl">' + x + "</span>" + mk("]]");
    var known = !!noteByTitle(t.text);
    return '<span class="wl' + (known ? "" : " wl-missing") + '" data-wikilink="' + escAttr(t.text) +
      '" title="' + (known ? "Open" : "Create") + ' \u201c' + escAttr(t.text) + '\u201d">' + x + "</span>";
  }
  if (t.kind === "color") {
    if (raw) return mk(esc(t.marker)) + "<span" + colourAttr(t.extra) + ">" + x + "</span>" + mk("&lt;/span&gt;");
    return "<span" + colourAttr(t.extra) + ">" + x + "</span>";
  }
  if (t.kind === "link") {
    var u = t.extra || "";
    if (raw) return t.bare ? '<span class="xl">' + x + "</span>"
      : mk("[") + '<span class="xl">' + x + "</span>" + mk("](") + '<span class="mk-url">' + esc(u) + "</span>" + mk(")");
    return '<a class="xl" data-extlink="' + escAttr(u) + '" href="' + escAttr(normalizeUrl(u)) +
      '" title="' + escAttr(u) + '">' + x + "</a>";
  }
  return x;
}
/* ---- one colour palette for the whole app: text colour in notes and the sketch board's swatches
   both read from it, so "red" is the same red everywhere. Each colour has a shade for the dark
   theme and one for the light theme, both at least 4.5:1 against that theme's page.
   - notes: <span style="color:red"> shows .tc-red, whose colour comes from --tc-red per theme
   - sketches: swatches save the dark shade (what the dark board draws); on the light page
     INK_LIGHT maps it to the light shade, through the same skInk the board already used ---- */
var PALETTE = [
  { key: "ink",    name: "White",  dark: "#e2e3e5", light: "#0f2b3d", text: false },   /* the sketch's default ink; plain text in notes */
  { key: "grey",   name: "Grey",   dark: "#a8aab0", light: "#475569" },
  { key: "red",    name: "Red",    dark: "#f2877c", light: "#c81e3a" },
  { key: "pink",   name: "Pink",   dark: "#e894b8", light: "#c0186a" },
  { key: "orange", name: "Orange", dark: "#e8a06a", light: "#c2410c" },
  { key: "yellow", name: "Yellow", dark: "#e6c35c", light: "#a15c00" },
  { key: "green",  name: "Green",  dark: "#7fc08f", light: "#16823e" },
  { key: "teal",   name: "Teal",   dark: "#6cc4b8", light: "#0d7f78" },
  { key: "blue",   name: "Blue",   dark: "#8ab4e0", light: "#0369a1" },
  { key: "purple", name: "Purple", dark: "#b9a0e3", light: "#7c3aed" }
];
var PALETTE_BY = {};
PALETTE.forEach(function (c) { PALETTE_BY[c.key] = c; });
/* a palette colour by name, as the board stores it (its dark shade; skInk shows the light one on the light page) */
function pc(key) { return PALETTE_BY[key].dark; }
function pcA(key, alpha) { var h = pc(key); return "rgba(" + parseInt(h.slice(1, 3), 16) + "," + parseInt(h.slice(3, 5), 16) + "," + parseInt(h.slice(5, 7), 16) + "," + alpha + ")"; }
var TEXT_COLOURS = PALETTE.filter(function (c) { return c.text !== false; }).map(function (c) { return c.key; });
/* the text colours' theme variables and classes, written from the table */
(function () {
  var dark = "", light = "", cls = "";
  TEXT_COLOURS.forEach(function (k) {
    var c = PALETTE.filter(function (x) { return x.key === k; })[0];
    dark += "--tc-" + k + ":" + c.dark + ";"; light += "--tc-" + k + ":" + c.light + ";";
    cls += ".tc-" + k + "{color:var(--tc-" + k + ")}";
  });
  var st = document.createElement("style");
  st.id = "cf-palette";
  st.textContent = ":root{" + dark + "}:root[data-theme=\"light\"]{" + light + "}" + cls;
  document.head.appendChild(st);
})();
function colourAttr(c) {
  if (TEXT_COLOURS.indexOf(c) !== -1 || c === "gray") return ' class="tc tc-' + (c === "gray" ? "grey" : c) + '"';
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c)) return ' class="tc" style="color:' + c + '"';
  return ' class="tc"';
}
function tokensToHtml(tokens, raw) {
  var out = "";
  for (var i = 0; i < tokens.length; i++) out += tokenHtml(tokens[i], raw);
  return out;
}

function styledRawInline(raw) { return tokensToHtml(scanInline(raw).tokens, true); }

/* ---------------- line classification / fences ---------------- */

function classifyLine(raw) {
  var m;
  if ((m = raw.match(/^(#{1,6})\s+(.*)$/)))
    return { type: "heading", level: m[1].length, prefixLen: m[1].length + 1, prefix: m[1] + " ", text: m[2] };
  if ((m = raw.match(/^(\s*)- \[( |x|X)\](?:\s(.*))?$/)))
    return { type: "task", indent: m[1].length, done: m[2].toLowerCase() === "x", prefixLen: m[1].length + 6, prefix: raw.slice(0, m[1].length + 6), text: m[3] || "" };
  if ((m = raw.match(/^(\s*)([-*+])\s+(.*)$/)))
    return { type: "bullet", indent: m[1].length, prefixLen: m[1].length + 2, prefix: raw.slice(0, m[1].length + 2), text: m[3] };
  if ((m = raw.match(/^(\s*)(\d+)\.\s+(.*)$/)))
    return { type: "ordered", indent: m[1].length, num: m[2], prefixLen: m[1].length + m[2].length + 2, prefix: raw.slice(0, m[1].length + m[2].length + 2), text: m[3] };
  if ((m = raw.match(/^>\s?(.*)$/)))
    return { type: "quote", prefixLen: raw.length - m[1].length, prefix: raw.slice(0, raw.length - m[1].length), text: m[1] };
  if (/^(---+|\*\*\*+)\s*$/.test(raw)) return { type: "hr", prefixLen: 0, prefix: "", text: "" };
  if (raw.trim() === "") return { type: "blank", prefixLen: 0, prefix: "", text: "" };
  return { type: "para", prefixLen: 0, prefix: "", text: raw };
}

/* ---- tables ---- */

function isRow(raw) { return /^\s*\|/.test(raw); }

/* split a row into cells, remembering where each cell's trimmed text starts in the raw line */
function splitCells(raw) {
  var cells = [], n = raw.length, i = 0;
  while (i < n && raw.charAt(i) === " ") i++;
  if (raw.charAt(i) === "|") i++;
  var cellStart = i;
  for (; i <= n; i++) {
    var ch = raw.charAt(i);
    if (i === n || (ch === "|" && raw.charAt(i - 1) !== "\\")) {
      var text = raw.slice(cellStart, i);
      var ls = text.match(/^\s*/)[0].length, rs = text.match(/\s*$/)[0].length;
      var body = text.slice(ls, Math.max(ls, text.length - rs));
      cells.push({ text: body, start: cellStart + ls });
      cellStart = i + 1;
    }
  }
  if (cells.length && cells[cells.length - 1].text === "" && /\|\s*$/.test(raw)) cells.pop();
  return cells;
}

function isDelimRow(raw) {
  if (!isRow(raw)) return false;
  var cells = splitCells(raw);
  if (!cells.length) return false;
  for (var i = 0; i < cells.length; i++) if (!/^:?-+:?$/.test(cells[i].text)) return false;
  return true;
}

function computeTableMeta(ls, meta) {
  var i = 0;
  while (i < ls.length) {
    if (!meta[i].fence && isRow(ls[i]) && i + 1 < ls.length && !meta[i + 1].fence && isDelimRow(ls[i + 1])) {
      var start = i, end = i + 1;
      while (end + 1 < ls.length && !meta[end + 1].fence && isRow(ls[end + 1])) end++;
      var header = splitCells(ls[start]), delim = splitCells(ls[start + 1]);
      var cols = Math.max(header.length, delim.length, 1);
      var aligns = [];
      for (var c = 0; c < cols; c++) {
        var d = delim[c] ? delim[c].text : "";
        aligns.push(d.charAt(0) === ":" && d.charAt(d.length - 1) === ":" ? "center" : d.charAt(d.length - 1) === ":" ? "right" : "left");
      }
      var widths = [];
      for (c = 0; c < cols; c++) widths.push(3);
      for (var r = start; r <= end; r++) {
        if (r === start + 1) continue;
        var cells = splitCells(ls[r]);
        for (c = 0; c < cols && c < cells.length; c++) widths[c] = Math.max(widths[c], Math.min(40, cells[c].text.length));
      }
      var template = widths.map(function (w) { return "minmax(0, " + w + "fr)"; }).join(" ");
      for (r = start; r <= end; r++) {
        meta[r].table = {
          cols: cols, aligns: aligns, template: template,
          role: r === start ? "header" : r === start + 1 ? "delim" : "body",
          first: start, last: end, headRaw: ls[start]
        };
      }
      i = end + 1;
    } else i++;
  }
}

function computeFenceMeta(ls) {
  var meta = new Array(ls.length);
  var inFence = false, lang = "";
  for (var i = 0; i < ls.length; i++) {
    var d = isDelim(ls[i]);
    if (d && !inFence) { inFence = true; lang = ls[i].slice(3).trim(); meta[i] = { fence: "open", lang: lang }; }
    else if (d && inFence) { inFence = false; meta[i] = { fence: "close", lang: lang }; lang = ""; }
    else meta[i] = { fence: inFence ? "in" : null, lang: inFence ? lang : "" };
  }
  /* sketch boards: the open line becomes a card, the JSON inside is hidden */
  for (i = 0; i < ls.length; i++) {
    if (meta[i].fence !== "open" || meta[i].lang !== "excalidraw") continue;
    var j = i + 1, body = [];
    while (j < ls.length && meta[j].fence !== "close") { body.push(ls[j]); j++; }
    var count = 0;
    try { var doc = JSON.parse(body.join("\n")); count = Array.isArray(doc.elements) ? doc.elements.filter(function (e) { return !e.isDeleted; }).length : 0; } catch (e) {}
    meta[i].sketch = count;
    meta[i].skBody = body.join("\n");               /* drawn as a picture in the note */
  }
  computeTableMeta(ls, meta);
  return meta;
}

function tableRowHtml(raw, t) {
  var cells = splitCells(raw), html = "";
  for (var c = 0; c < t.cols; c++) {
    var text = cells[c] ? cells[c].text.replace(/\\\|/g, "|") : "";
    var inline = text ? tokensToHtml(scanInline(text).tokens) : '<span data-deco="1">&nbsp;</span>';
    var funnel = "";
    if (t.role === "header") {
      var tf = tableFilterFor(t), on = tf && tf[c];
      funnel = '<span class="tf-btn' + (on ? " tf-on" : "") + '" data-tf="' + c + '" data-deco="1" role="button" title="' + (on ? "Filtered - click to change" : "Sort and filter") + '" aria-label="Sort and filter column">' +
        (on ? '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3h11l-4.2 5v4.5l-2.6 1.2V8z"/></svg>'
            : '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>') + '</span>';
    }
    html += '<div class="tcell" style="text-align:' + t.aligns[c] + '">' + funnel + inline + "</div>";
  }
  return html;
}

function tableOverlay(raw) {
  var out = "", last = 0;
  for (var i = 0; i < raw.length; i++) {
    if (raw.charAt(i) === "|" && raw.charAt(i - 1) !== "\\") {
      out += styledRawInline(raw.slice(last, i)) + '<span class="mk-pipe">|</span>';
      last = i + 1;
    }
  }
  return out + styledRawInline(raw.slice(last));
}

