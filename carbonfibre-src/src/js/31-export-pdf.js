/* ============================================================
   PDF - the same blocks as print-ready HTML in a hidden iframe
   ============================================================ */

function htmlRuns(runs) {
  return runs.map(function (r) {
    var t = esc(r.text);
    if (r.code) t = "<code>" + t + "</code>";
    if (r.b) t = "<strong>" + t + "</strong>";
    if (r.i) t = "<em>" + t + "</em>";
    if (r.strike) t = "<del>" + t + "</del>";
    if (r.href) t = '<a href="' + escAttr(r.href) + '">' + t + "</a>";
    return t;
  }).join("");
}
function blocksToHtml(blocks) {
  var out = [];
  blocks.forEach(function (bl) {
    if (bl.t === "h") { out.push("<h" + bl.level + ">" + htmlRuns(bl.runs) + "</h" + bl.level + ">"); return; }
    if (bl.t === "p") { out.push("<p>" + htmlRuns(bl.runs) + "</p>"); return; }
    if (bl.t === "hr") { out.push("<hr/>"); return; }
    if (bl.t === "quote") { out.push("<blockquote>" + htmlRuns(bl.runs) + "</blockquote>"); return; }
    if (bl.t === "code") { out.push("<pre>" + esc(bl.lines.join("\n")) + "</pre>"); return; }
    if (bl.t === "list") {
      /* a nested list belongs inside the li above it, so the li stays open until we come back up */
      var tag = bl.ordered ? "ol" : "ul", depth = 0, liOpen = false, html = "<" + tag + ">";
      bl.items.forEach(function (it) {
        if (it.indent > depth) {
          while (it.indent > depth) { html += "<" + tag + ">"; depth++; }
        } else {
          if (liOpen) { html += "</li>"; liOpen = false; }
          while (it.indent < depth) { html += "</" + tag + "></li>"; depth--; }
        }
        var mark = it.check ? (it.check === "done" ? "\u2612 " : "\u2610 ") : "";
        html += "<li>" + mark + htmlRuns(it.runs);
        liOpen = true;
      });
      if (liOpen) html += "</li>";
      while (depth-- > 0) html += "</" + tag + "></li>";
      out.push(html + "</" + tag + ">");
      return;
    }
    if (bl.t === "table") {
      var rows = bl.rows.map(function (row, ri) {
        var cells = "";
        for (var c = 0; c < bl.cols; c++) {
          var al = bl.aligns && bl.aligns[c] ? ' style="text-align:' + bl.aligns[c] + '"' : "";
          cells += ri === 0 ? "<th" + al + ">" + htmlRuns(inlineRuns(row[c] || "")) + "</th>"
                            : "<td" + al + ">" + htmlRuns(inlineRuns(row[c] || "")) + "</td>";
        }
        return "<tr>" + cells + "</tr>";
      }).join("");
      out.push("<table>" + rows + "</table>");
      return;
    }
    if (bl.t === "sketch") {
      var png = sketchPng(bl.elements, 1400);
      if (png) out.push('<p class="sketch"><img src="' + png.dataUrl + '" style="width:' + png.inchW.toFixed(2) + 'in"/></p>');
    }
  });
  return out.join("\n");
}

/* page numbers, and the note's title, in the bottom margin of every printed page */
function printPageCss(title) {
  var t = String(title || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ").slice(0, 90);
  return "@page { size: A4; margin: 18mm 16mm 20mm;\n" +
    "  @bottom-center { content: \"Page \" counter(page) \" of \" counter(pages); font: 8.5pt 'Segoe UI', Arial, sans-serif; color: #666; }\n" +
    "  @bottom-left { content: \"" + t + "\"; font: 8.5pt 'Segoe UI', Arial, sans-serif; color: #888; }\n}\n";
}
var PRINT_CSS =
"@page { size: A4; margin: 18mm 16mm; }\n" +
"body { background:#fff; color:#111; font:10.5pt/1.5 'Segoe UI',Arial,sans-serif; margin:0; }\n" +
"h1,h2,h3,h4 { break-after:avoid; page-break-after:avoid; color:#111; margin:1.1em 0 .4em; }\n" +
"h1{font-size:19pt} h2{font-size:15pt} h3{font-size:12.5pt} h4{font-size:11pt}\n" +
"p,li { orphans:2; widows:2; }\n" +
"pre,table,img,blockquote { break-inside:avoid; page-break-inside:avoid; }\n" +
"pre { white-space:pre-wrap; word-wrap:break-word; background:#f6f6f6; border:1px solid #ccc; padding:6pt 8pt; font:9pt/1.4 Consolas,monospace; }\n" +
"code { font:9.5pt Consolas,monospace; background:#f2f2f2; padding:0 2pt; }\n" +
"blockquote { margin:0 0 .8em; padding-left:10pt; border-left:3pt solid #ccc; color:#444; font-style:italic; }\n" +
"table { border-collapse:collapse; width:100%; margin:.6em 0; font-size:9.5pt; }\n" +
"th,td { border:1px solid #bbb; padding:4pt 6pt; text-align:left; vertical-align:top; }\n" +
"th { background:#eee; }\n" +
"img { max-width:100%; }\n" +
"hr { border:0; border-top:1px solid #bbb; margin:1em 0; }\n" +
"a { color:#1f5fa9; text-decoration:none; }\n" +
'a[href^="http"]::after { content:" (" attr(href) ")"; font-size:8pt; color:#666; }\n' +
".doc-title { font-size:20pt; font-weight:600; margin:0 0 2pt; }\n" +
".doc-meta { font-size:8.5pt; color:#666; margin:0 0 14pt; border-bottom:1px solid #ddd; padding-bottom:6pt; }\n";

function exportPdf(note, blocks) {
  var frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;";
  document.body.appendChild(frame);
  var d = frame.contentDocument;
  d.open();
  d.write("<!DOCTYPE html><html><head><meta charset='utf-8'><title>" + esc(note.title) + "</title><style>" + PRINT_CSS + printPageCss(note.title) + "</style></head><body>" +
    '<div class="doc-title">' + esc(note.title) + "</div>" +
    '<div class="doc-meta">' + esc(note.path || "") + (note.path ? " \u00b7 " : "") + new Date().toLocaleDateString() + "</div>" +
    blocksToHtml(blocks) + "</body></html>");
  d.close();
  var go = function () {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(function () { frame.remove(); }, 1500);
  };
  var imgs = d.images ? Array.prototype.slice.call(d.images) : [];
  var pending = imgs.filter(function (im) { return !im.complete; }).length;
  if (!pending) setTimeout(go, 60);
  else imgs.forEach(function (im) {
    im.addEventListener("load", function () { if (--pending <= 0) setTimeout(go, 60); });
    im.addEventListener("error", function () { if (--pending <= 0) setTimeout(go, 60); });
  });
}

/* ---- saving ---- */
function saveBytes(bytes, filename, mime) {
  var blob = new Blob([bytes], { type: mime });
  if (window.showSaveFilePicker) {
    var ext = filename.slice(filename.lastIndexOf("."));
    var accept = {}; accept[mime] = [ext];
    window.showSaveFilePicker({ suggestedName: filename, types: [{ description: ext.slice(1).toUpperCase(), accept: accept }] })
      .then(function (h) { return h.createWritable(); })
      .then(function (w) { return w.write(blob).then(function () { return w.close(); }); })
      .catch(function (e) { if (e.name !== "AbortError") console.error(e); });
    return;
  }
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
}

function exportNote(kind) {
  var p = focusedPane || panes[0], n = p && p.note();
  if (!n) return;
  p.sync();
  var lines = n.content.split("\n");
  var blocks = noteBlocks(lines, computeFenceMeta(lines));
  if (kind === "pdf") { exportPdf(n, blocks); return; }
  var bytes = buildDocx(n.title, blocks);
  saveBytes(bytes, sanitizeName(n.title) + ".docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
}

