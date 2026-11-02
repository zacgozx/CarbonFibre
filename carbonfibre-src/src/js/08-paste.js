/* ============================================================
   Paste conversion - HTML to markdown, spreadsheet blocks to
   tables, images to files, a URL over a selection to a link.
   ============================================================ */

/* ---- HTML -> markdown -------------------------------------------------- */

function mdInlineFromNode(node) {
  if (node.nodeType === 3) return node.nodeValue.replace(/\s+/g, " ");
  if (node.nodeType !== 1) return "";
  var tag = node.tagName.toLowerCase(), inner = mdChildren(node);
  switch (tag) {
    case "br": return "\n";
    case "strong": case "b": return inner.trim() ? "**" + inner.trim() + "**" : "";
    case "em": case "i": return inner.trim() ? "*" + inner.trim() + "*" : "";
    case "del": case "s": case "strike": return inner.trim() ? "~~" + inner.trim() + "~~" : "";
    case "code": return inner.trim() ? "`" + inner.trim() + "`" : "";
    case "a":
      var href = node.getAttribute("href") || "";
      if (!href || href.charAt(0) === "#") return inner;
      return inner.trim() ? "[" + inner.trim() + "](" + href + ")" : href;
    case "img":
      var src = node.getAttribute("src") || "";
      return src && src.slice(0, 5) !== "data:" ? "![" + (node.getAttribute("alt") || "image") + "](" + src + ")" : "";
    default: return inner;
  }
}
function mdChildren(node) {
  var out = "";
  for (var i = 0; i < node.childNodes.length; i++) out += mdInlineFromNode(node.childNodes[i]);
  return out;
}

function mdTableFromNode(table) {
  var rows = [], trs = table.querySelectorAll("tr");
  for (var r = 0; r < trs.length; r++) {
    var cells = trs[r].querySelectorAll("th,td"), row = [];
    for (var c = 0; c < cells.length; c++) row.push(mdChildren(cells[c]).trim().replace(/\|/g, "\\|") || " ");
    if (row.length) rows.push(row);
  }
  if (!rows.length) return [];
  var cols = Math.max.apply(null, rows.map(function (x) { return x.length; }));
  var out = [];
  rows.forEach(function (row, i) {
    while (row.length < cols) row.push(" ");
    out.push("| " + row.join(" | ") + " |");
    if (i === 0) out.push("| " + new Array(cols + 1).join("--- |").replace(/\|$/, "|"));
  });
  /* the delimiter row above joins awkwardly; rebuild it plainly */
  out[1] = "|" + new Array(cols + 1).join(" --- |");
  return out;
}

/* walk block-level nodes, emitting markdown lines */
function mdBlocks(node, lines, indent, listType, listNo) {
  for (var i = 0; i < node.childNodes.length; i++) {
    var ch = node.childNodes[i];
    if (ch.nodeType === 3) {
      var t = ch.nodeValue.replace(/\s+/g, " ");
      if (t.trim()) lines.push(indent + t.trim());
      continue;
    }
    if (ch.nodeType !== 1) continue;
    var tag = ch.tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "head") continue;

    if (/^h[1-6]$/.test(tag)) {
      var txt = mdChildren(ch).trim();
      if (txt) { lines.push(""); lines.push(new Array(+tag.charAt(1) + 1).join("#") + " " + txt); lines.push(""); }
    } else if (tag === "p" || tag === "div" || tag === "section" || tag === "article") {
      /* a wrapper with block children is a container, not a paragraph */
      if (ch.querySelector("p,div,ul,ol,table,h1,h2,h3,h4,h5,h6,pre,blockquote")) {
        mdBlocks(ch, lines, indent, listType, listNo);
      } else {
        var s = mdChildren(ch).trim();
        if (s) { s.split("\n").forEach(function (l) { lines.push(indent + l.trim()); }); lines.push(""); }
      }
    } else if (tag === "ul" || tag === "ol") {
      var n = 1;
      for (var k = 0; k < ch.children.length; k++) {
        var li = ch.children[k];
        if (li.tagName.toLowerCase() !== "li") continue;
        var nested = li.querySelector("ul,ol");
        var head = mdChildren(li).trim();
        if (nested) {
          var clone = li.cloneNode(true);
          var sub = clone.querySelectorAll("ul,ol");
          for (var q = 0; q < sub.length; q++) sub[q].parentNode.removeChild(sub[q]);
          head = mdChildren(clone).trim();
        }
        var bullet = tag === "ol" ? (n++) + ". " : "- ";
        if (head) lines.push(indent + bullet + head);
        /* recurse into the nested lists only, or the item's own text repeats */
        for (var q2 = 0; q2 < li.children.length; q2++) {
          var t2 = li.children[q2].tagName.toLowerCase();
          if (t2 !== "ul" && t2 !== "ol") continue;
          var holder = li.ownerDocument.createElement("div");
          holder.appendChild(li.children[q2].cloneNode(true));
          mdBlocks(holder, lines, indent + "  ", null, 1);
        }
      }
      if (!indent) lines.push("");   /* a blank line closes a top-level list only */
    } else if (tag === "li") {
      mdBlocks(ch, lines, indent, listType, listNo);
    } else if (tag === "table") {
      lines.push("");
      mdTableFromNode(ch).forEach(function (l) { lines.push(l); });
      lines.push("");
    } else if (tag === "pre") {
      lines.push("");
      lines.push("```");
      (ch.textContent || "").replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n").forEach(function (l) { lines.push(l); });
      lines.push("```");
      lines.push("");
    } else if (tag === "blockquote") {
      var qs = [];
      mdBlocks(ch, qs, "", null, 1);
      qs.forEach(function (l) { if (l.trim()) lines.push(indent + "> " + l); });
      lines.push("");
    } else if (tag === "hr") {
      lines.push(""); lines.push("---"); lines.push("");
    } else if (tag === "br") {
      lines.push("");
    } else {
      var inline = mdInlineFromNode(ch);
      if (inline.trim()) lines.push(indent + inline.trim());
    }
  }
}

function htmlToMarkdown(html) {
  var doc = new DOMParser().parseFromString(html, "text/html");
  var lines = [];
  mdBlocks(doc.body, lines, "", null, 1);
  /* squeeze blank runs, trim the ends */
  var out = [];
  lines.forEach(function (l) {
    if (l.trim() === "" && (!out.length || out[out.length - 1].trim() === "")) return;
    out.push(l.replace(/\s+$/, ""));
  });
  while (out.length && out[out.length - 1].trim() === "") out.pop();
  return out.join("\n");
}

/* ---- spreadsheet block -> markdown table ------------------------------- */

function looksLikeTsv(text) {
  var rows = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
  if (rows.length < 2) return false;
  var cols = rows[0].split("\t").length;
  if (cols < 2) return false;
  return rows.every(function (r) { return r.split("\t").length === cols; });
}
function tsvToTable(text) {
  var rows = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n")
    .map(function (r) { return r.split("\t").map(function (c) { return c.trim().replace(/\|/g, "\\|") || " "; }); });
  var cols = rows[0].length, out = [];
  out.push("| " + rows[0].join(" | ") + " |");
  out.push("|" + new Array(cols + 1).join(" --- |"));
  for (var i = 1; i < rows.length; i++) out.push("| " + rows[i].join(" | ") + " |");
  return out;
}

/* ---- pasted image -> a file beside the note ---------------------------- */

function imageFromClipboard(cd) {
  if (!cd.items) return null;
  for (var i = 0; i < cd.items.length; i++) {
    var it = cd.items[i];
    if (it.kind === "file" && /^image\//.test(it.type)) return it.getAsFile();
  }
  return null;
}
function saveImageBeside(pane, file) {
  var n = pane.note();
  if (!n || state.backend !== "folder") return Promise.reject(new Error("Images can only be saved in folder mode."));
  var dir = folderOf(n.path || "");
  var ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
  var stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
  var base = "img-" + stamp + "." + ext;
  return file.arrayBuffer().then(function (buf) {
    return writeFile(folderHandle(dir), base, new Blob([buf], { type: file.type }));
  }).then(function () { return base; });
}

/* ---- the paste handler used by both editors ---------------------------- */

/* Returns markdown lines for a paste, or null to let the browser handle it.
   selection is the text being replaced, used for the URL-over-selection case. */
/* Code on the clipboard, recognised by how editors and web pages put it there:
   IDEs (VS Code, Visual Studio, JetBrains) wrap their HTML in white-space:pre, and web
   pages put a code block in a lone <pre>. Returns { lang } for code, or null. */
function clipboardCode(html) {
  if (!html) return null;
  var lang = "";
  var m = html.match(/class=["'][^"']*\b(?:language|lang)-([\w+#.-]+)/i) || html.match(/data-lang(?:uage)?=["']([\w+#.-]+)/i) ||
          html.match(/\bhighlight-source-([\w+#.-]+)/i);            /* GitHub */
  if (m) lang = m[1].toLowerCase();
  if (/white-space\s*:\s*pre/i.test(html)) return { lang: lang };
  var doc = new DOMParser().parseFromString(html, "text/html");
  var kids = Array.prototype.filter.call(doc.body.childNodes, function (n) {
    return n.nodeType === 1 ? !/^(meta|style|link|script)$/i.test(n.tagName) : n.nodeValue.trim() !== "";
  });
  if (kids.length === 1 && kids[0].nodeType === 1 &&
      (kids[0].tagName === "PRE" || (kids[0].querySelector && kids[0].children.length === 1 && kids[0].children[0].tagName === "PRE"))) {
    return { lang: lang };
  }
  return null;
}
/* the exact text of a code block, taken from the plain-text flavour, which keeps
   indentation and line breaks; falls back to the <pre> text if there is none */
function clipboardCodeText(cd, html) {
  var text = cd.getData("text/plain");
  if (!text && html) {
    var pre = new DOMParser().parseFromString(html, "text/html").querySelector("pre");
    text = pre ? pre.textContent : "";
  }
  return String(text || "").replace(/\r\n?/g, "\n").replace(/\n+$/, "");
}

/* Is the caret inside a ``` block? For the Source view, which has no fence metadata. */
function caretInFence(text, pos) {
  var before = text.slice(0, pos).split("\n");
  before.pop();                                    /* the caret's own line is not a boundary */
  var open = false;
  for (var i = 0; i < before.length; i++) if (isDelim(before[i])) open = !open;
  return open;
}

/* inFence: the caret is inside a code block, so the paste must land exactly as it is */
function pasteToMarkdown(cd, selection, inFence) {
  /* copied from CarbonFibre itself: the plain text is the exact markdown, so use that */
  try { if (/data-cf-md="1"/.test(cd.getData("text/html") || "")) return null; } catch (e) {}
  var text = cd.getData("text/plain") || "";
  var url = text.trim();
  var html = cd.getData("text/html");

  /* Inside a code block, never convert anything. Converting is what split fences apart
     (a pasted <pre> brought its own ``` fences) and stripped indentation from code. */
  if (inFence) return null;

  /* Code from an editor or a web page becomes a fenced block with its text untouched,
     rather than being read as markdown, where "# comment" turns into a heading. */
  var code = clipboardCode(html);
  if (code) {
    var body = clipboardCodeText(cd, html);
    if (body) {
      var bl = body.replace(/\s+$/, "").split("\n");
      /* chat apps put the fences in the plain text already: keep those, do not add a second pair */
      if (bl.length > 1 && isDelim(bl[0].trim()) && isDelim(bl[bl.length - 1].trim())) return { lines: bl };
      return { lines: ["```" + code.lang].concat(body.split("\n"), ["```"]) };
    }
  }

  /* a URL dropped over a selection becomes a link around it */
  if (selection && /^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(url) && url.indexOf("\n") === -1)
    return { inline: "[" + selection + "](" + url + ")" };

  if (html && html.replace(/<[^>]*>/g, "").trim()) {
    var md = htmlToMarkdown(html);
    if (md && md !== text.trim()) return { lines: md.split("\n") };
  }
  if (looksLikeTsv(text)) return { lines: tsvToTable(text) };
  return null;
}

