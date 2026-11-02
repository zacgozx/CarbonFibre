/* ============================================================
   Export - one pass turns a note into blocks, then Word or PDF
   render those blocks. Reads lines + fence meta, not the preview
   DOM, because the preview is one flat div per line.
   ============================================================ */

/* ---- inline runs: token stream -> [{ text, b, i, code, href }] ---- */
function inlineRuns(text) {
  var toks = scanInline(text).tokens, out = [];
  toks.forEach(function (t) {
    if (t.kind === "wikilink") { out.push({ text: t.text, b: false, i: false }); return; }
    if (t.kind === "link") { out.push({ text: t.text, href: normalizeUrl(t.extra || t.text) }); return; }
    out.push({
      text: t.text,
      b: t.kind === "bold",
      i: t.kind === "italic",
      strike: t.kind === "strike",
      code: t.kind === "code"
    });
  });
  return out.filter(function (r) { return r.text !== ""; });
}

/* ---- lines + fmeta -> blocks ---- */
function noteBlocks(lines, fmeta) {
  var blocks = [], i = 0;

  function flushList(list) { if (list && list.items.length) blocks.push(list); }

  while (i < lines.length) {
    var raw = lines[i], m = fmeta[i] || {};

    if (m.fence && m.lang === "excalidraw") {          /* a drawing: collect its JSON */
      if (m.fence === "open") {
        var j = i + 1, body = [];
        while (j < lines.length && !(fmeta[j] && fmeta[j].fence === "close")) { body.push(lines[j]); j++; }
        var els = [];
        els = skParse(body.join("\n"));
        blocks.push({ t: "sketch", elements: els });
        i = j + 1;
        continue;
      }
      i++; continue;
    }
    if (m.fence) {                                      /* a code fence */
      if (m.fence === "open") {
        var k = i + 1, code = [];
        while (k < lines.length && !(fmeta[k] && fmeta[k].fence === "close")) { code.push(lines[k]); k++; }
        blocks.push({ t: "code", lang: m.lang || "", lines: code });
        i = k + 1;
        continue;
      }
      i++; continue;
    }
    if (m.table) {                                      /* a table: take the whole run at once */
      var tm = m.table, rows = [];
      for (var r = tm.first; r <= tm.last; r++) {
        if (r === tm.first + 1) continue;               /* the delimiter row is not data */
        rows.push(splitCells(lines[r]).map(function (c) { return c.text.replace(/\\\|/g, "|"); }));
      }
      blocks.push({ t: "table", rows: rows, cols: tm.cols, aligns: tm.aligns });
      i = tm.last + 1;
      continue;
    }

    var c = classifyLine(raw);
    if (c.type === "heading") { blocks.push({ t: "h", level: Math.min(c.level, 6), runs: inlineRuns(c.text) }); i++; continue; }
    if (c.type === "hr") { blocks.push({ t: "hr" }); i++; continue; }
    if (c.type === "blank") { i++; continue; }
    if (c.type === "quote") {
      var qr = [];
      while (i < lines.length && classifyLine(lines[i]).type === "quote" && !(fmeta[i] && fmeta[i].fence)) {
        qr.push(classifyLine(lines[i]).text); i++;
      }
      blocks.push({ t: "quote", runs: inlineRuns(qr.join(" ")) });
      continue;
    }
    if (c.type === "bullet" || c.type === "ordered" || c.type === "task") {
      var ordered = c.type === "ordered";
      var list = { t: "list", ordered: ordered, items: [] };
      while (i < lines.length) {
        var lm = fmeta[i] || {};
        if (lm.fence || lm.table) break;
        var lc = classifyLine(lines[i]);
        if (lc.type !== "bullet" && lc.type !== "ordered" && lc.type !== "task") break;
        if ((lc.type === "ordered") !== ordered) break;
        list.items.push({
          indent: Math.min(4, Math.floor((lc.indent || 0) / 2)),
          runs: inlineRuns(lc.text),
          check: lc.type === "task" ? (lc.done ? "done" : "open") : null
        });
        i++;
      }
      flushList(list);
      continue;
    }
    /* a paragraph runs until a blank line or anything structural */
    var para = [];
    while (i < lines.length) {
      var pm = fmeta[i] || {};
      if (pm.fence || pm.table) break;
      var pc = classifyLine(lines[i]);
      if (pc.type !== "para") break;
      para.push(lines[i]);
      i++;
    }
    if (para.length) blocks.push({ t: "p", runs: inlineRuns(para.join(" ")) });
    else i++;
  }
  return blocks;
}

/* ---- sketch -> PNG, by driving the board's own renderer into a spare canvas ---- */
/* A sketch in a note is shown as a picture of the drawing, in the current theme's colours on a
   clear background, drawn once per drawing and theme and then reused. */
var SK_PREVIEW = new Map();
function sketchPreviewUrl(json) {
  var light = isLight(), key = (light ? "L" : "D") + json.length + ":" + json.slice(0, 64) + json.slice(-256);
  if (SK_PREVIEW.has(key)) return SK_PREVIEW.get(key);
  var url = "";
  try {
    var doc = JSON.parse(json), els = (doc.elements || []).filter(function (e) { return !e.isDeleted; }).map(skFullEl);
    if (els.length) {
      var oldSk = sk, oldCtx = skctx, oldInk = skLightInk;
      /* measuring links routes them, and routing reads the board: stand one in first */
      sk = { elements: els, cam: { x: 0, y: 0, k: 1 }, viewW: 1, viewH: 1, sel: null, sels: [], hoverTarget: null, routes: null, anchorCache: {} };
      try {
      var pad = 18, b = null;
      els.forEach(function (el) {
        var box = skBox(el), lab = el.type === "stencil" && el.label ? skLabelSize(el) * 2.2 : 0;
        var x2 = box.x + box.w, y2 = box.y + box.h + lab;
        if (!b) b = { x: box.x, y: box.y, x2: x2, y2: y2 };
        else { b.x = Math.min(b.x, box.x); b.y = Math.min(b.y, box.y); b.x2 = Math.max(b.x2, x2); b.y2 = Math.max(b.y2, y2); }
      });
      var w = Math.max(1, b.x2 - b.x) + pad * 2, h = Math.max(1, b.y2 - b.y) + pad * 2;
      var scale = Math.max(0.3, Math.min(2, 1500 / w));
      var cv = document.createElement("canvas");
      cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
      var ctx = cv.getContext("2d");
      skLightInk = light;
      sk.cam = { x: (b.x + b.x2) / 2, y: (b.y + b.y2) / 2, k: scale }; sk.viewW = cv.width; sk.viewH = cv.height;
      skctx = ctx;
      els.forEach(function (el) { skDrawEl(el, false); });
      url = cv.toDataURL("image/png");
      } finally { sk = oldSk; skctx = oldCtx; skLightInk = oldInk; }
    }
  } catch (e) { url = ""; }
  if (SK_PREVIEW.size > 40) SK_PREVIEW.delete(SK_PREVIEW.keys().next().value);
  SK_PREVIEW.set(key, url);
  return url;
}
function sketchPng(elements, maxW) {
  if (!elements.length) return null;
  var pad = 16, b = null;
  var outerSk = sk;
  if (!sk) sk = { elements: elements, cam: { x: 0, y: 0, k: 1 }, viewW: 1, viewH: 1, sel: null, sels: [], hoverTarget: null, routes: null, anchorCache: {} };   /* link routing reads the board */
  try {
  elements.forEach(function (el) {
    var box = skBox(el);
    if (!b) b = { x: box.x, y: box.y, x2: box.x + box.w, y2: box.y + box.h };
    else {
      b.x = Math.min(b.x, box.x); b.y = Math.min(b.y, box.y);
      b.x2 = Math.max(b.x2, box.x + box.w); b.y2 = Math.max(b.y2, box.y + box.h);
    }
  });
  } finally { sk = outerSk; }
  var w = Math.max(1, b.x2 - b.x) + pad * 2, h = Math.max(1, b.y2 - b.y) + pad * 2;
  var scale = Math.min(2.5, Math.max(1, (maxW || 900) / w));
  var cv = document.createElement("canvas");
  cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
  var ctx = cv.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cv.width, cv.height);

  /* skDrawEl reads the module globals, so stand in for them briefly */
  var oldSk = sk, oldCtx = skctx, oldInk = skLightInk;
  skLightInk = true;
  sk = { elements: elements, cam: { x: (b.x + b.x2) / 2, y: (b.y + b.y2) / 2, k: scale },
         viewW: cv.width, viewH: cv.height, sel: null, sels: [], hoverTarget: null };
  skctx = ctx;
  try { elements.forEach(function (el) { skDrawEl(el, false); }); }
  finally { sk = oldSk; skctx = oldCtx; skLightInk = oldInk; }

  return { dataUrl: cv.toDataURL("image/png"), w: cv.width, h: cv.height,
           inchW: Math.min(6.3, w / 96), inchH: Math.min(6.3, w / 96) * (h / w) };
}

