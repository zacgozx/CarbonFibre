/* ============================================================
   Word (.docx)
   ============================================================ */

function xe(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function wRuns(runs) {
  return runs.map(function (r) {
    var props = "";
    if (r.b) props += "<w:b/>";
    if (r.i) props += "<w:i/>";
    if (r.strike) props += "<w:strike/>";
    if (r.code) props += '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:shd w:val="clear" w:fill="F2F2F2"/>';
    if (r.href) props += '<w:color w:val="1F5FA9"/><w:u w:val="single"/>';
    return "<w:r>" + (props ? "<w:rPr>" + props + "</w:rPr>" : "") +
      '<w:t xml:space="preserve">' + xe(r.text) + "</w:t></w:r>";
  }).join("");
}
function wPara(runs, style, extra) {
  var pr = "";
  if (style) pr += '<w:pStyle w:val="' + style + '"/>';
  if (extra) pr += extra;
  return "<w:p>" + (pr ? "<w:pPr>" + pr + "</w:pPr>" : "") + wRuns(runs) + "</w:p>";
}

function docxBody(blocks, media) {
  var out = [];
  blocks.forEach(function (bl) {
    if (bl.t === "h") { out.push(wPara(bl.runs, "Heading" + bl.level)); return; }
    if (bl.t === "p") { out.push(wPara(bl.runs)); return; }
    if (bl.t === "hr") {
      out.push('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:color="BBBBBB"/></w:pBdr></w:pPr></w:p>');
      return;
    }
    if (bl.t === "quote") { out.push(wPara(bl.runs, "Quote")); return; }
    if (bl.t === "list") {
      bl.items.forEach(function (it) {
        var runs = it.check ? [{ text: (it.check === "done" ? "\u2612 " : "\u2610 ") }].concat(it.runs) : it.runs;
        out.push(wPara(runs, "ListParagraph",
          '<w:numPr><w:ilvl w:val="' + it.indent + '"/><w:numId w:val="' + (bl.ordered ? 2 : 1) + '"/></w:numPr>'));
      });
      return;
    }
    if (bl.t === "code") {
      bl.lines.forEach(function (l) {
        out.push(wPara([{ text: l || " ", code: true }], "CodeBlock"));
      });
      return;
    }
    if (bl.t === "table") {
      var width = Math.floor(9360 / Math.max(1, bl.cols));
      var grid = "";
      for (var c = 0; c < bl.cols; c++) grid += '<w:gridCol w:w="' + width + '"/>';
      var rows = bl.rows.map(function (row, ri) {
        var cells = "";
        for (var ci = 0; ci < bl.cols; ci++) {
          var txt = row[ci] || "";
          var runs = inlineRuns(txt);
          if (ri === 0) runs = runs.map(function (r) { return { text: r.text, b: true, i: r.i, code: r.code, href: r.href }; });
          if (!runs.length) runs = [{ text: "" }];
          var shd = ri === 0 ? '<w:shd w:val="clear" w:fill="EFEFEF"/>' : "";
          cells += '<w:tc><w:tcPr><w:tcW w:w="' + width + '" w:type="dxa"/>' + shd + "</w:tcPr>" + wPara(runs, "TableText") + "</w:tc>";
        }
        return "<w:tr>" + cells + "</w:tr>";
      }).join("");
      out.push('<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/>' +
        '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="AAAAAA"/><w:left w:val="single" w:sz="4" w:color="AAAAAA"/>' +
        '<w:bottom w:val="single" w:sz="4" w:color="AAAAAA"/><w:right w:val="single" w:sz="4" w:color="AAAAAA"/>' +
        '<w:insideH w:val="single" w:sz="4" w:color="CCCCCC"/><w:insideV w:val="single" w:sz="4" w:color="CCCCCC"/></w:tblBorders>' +
        "</w:tblPr><w:tblGrid>" + grid + "</w:tblGrid>" + rows + "</w:tbl><w:p/>");
      return;
    }
    if (bl.t === "sketch") {
      var png = sketchPng(bl.elements, 900);
      if (!png) return;
      var id = media.length + 1;
      media.push({ id: id, dataUrl: png.dataUrl });
      var cx = Math.round(png.inchW * 914400), cy = Math.round(png.inchH * 914400);
      out.push('<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
        '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:docPr id="' + id + '" name="Sketch ' + id + '"/>' +
        '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
        '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr>' +
        '<pic:cNvPr id="' + id + '" name="Sketch ' + id + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
        '<pic:blipFill><a:blip r:embed="rId' + (100 + id) + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
        '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>');
    }
  });
  return out.join("");
}

var DOCX_STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
'<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI"/><w:sz w:val="21"/></w:rPr></w:rPrDefault></w:docDefaults>' +
'<w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:style>' +
[1, 2, 3, 4, 5, 6].map(function (n) {
  var sz = [32, 26, 23, 21, 21, 21][n - 1];
  return '<w:style w:type="paragraph" w:styleId="Heading' + n + '"><w:name w:val="heading ' + n + '"/><w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:outlineLvl w:val="' + (n - 1) + '"/><w:keepNext/><w:spacing w:before="240" w:after="80"/></w:pPr>' +
    '<w:rPr><w:b/><w:sz w:val="' + sz + '"/><w:color w:val="1A1A1A"/></w:rPr></w:style>';
}).join("") +
'<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="40"/></w:pPr></w:style>' +
'<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/>' +
'<w:pPr><w:ind w:left="360"/><w:pBdr><w:left w:val="single" w:sz="18" w:color="C0C0C0"/></w:pBdr></w:pPr><w:rPr><w:i/><w:color w:val="444444"/></w:rPr></w:style>' +
'<w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:basedOn w:val="Normal"/>' +
'<w:pPr><w:spacing w:after="0"/><w:shd w:val="clear" w:fill="F5F5F5"/><w:ind w:left="180"/></w:pPr>' +
'<w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="18"/></w:rPr></w:style>' +
'<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0"/></w:pPr></w:style>' +
'<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style>' +
'</w:styles>';

var DOCX_NUMBERING = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
[1, 2].map(function (id) {
  var levels = "";
  for (var l = 0; l < 5; l++) {
    var fmt = id === 1 ? "bullet" : "decimal";
    var txt = id === 1 ? ["\u2022", "\u25E6", "\u25AA", "\u2022", "\u25E6"][l] : "%" + (l + 1) + ".";
    levels += '<w:lvl w:ilvl="' + l + '"><w:start w:val="1"/><w:numFmt w:val="' + fmt + '"/>' +
      '<w:lvlText w:val="' + txt + '"/><w:lvlJc w:val="left"/>' +
      '<w:pPr><w:ind w:left="' + (360 + l * 360) + '" w:hanging="360"/></w:pPr>' +
      (id === 1 ? '<w:rPr><w:rFonts w:ascii="Segoe UI Symbol" w:hAnsi="Segoe UI Symbol"/></w:rPr>' : "") +
      "</w:lvl>";
  }
  return '<w:abstractNum w:abstractNumId="' + id + '">' + levels + "</w:abstractNum>";
}).join("") +
'<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num>' +
"</w:numbering>";

function dataUrlToBytes(dataUrl) {
  var b64 = dataUrl.split(",")[1], bin = atob(b64), out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function buildDocx(title, blocks) {
  var media = [];
  var body = docxBody(blocks, media);
  var enc = new TextEncoder();

  var doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">' +
    "<w:body>" + body +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1021" w:right="907" w:bottom="1021" w:left="907"/></w:sectPr>' +
    "</w:body></w:document>";

  var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' +
    media.map(function (m) {
      return '<Relationship Id="rId' + (100 + m.id) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/sketch' + m.id + '.png"/>';
    }).join("") +
    "</Relationships>";

  var types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="png" ContentType="image/png"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
    "</Types>";

  var root = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    "</Relationships>";

  var files = [
    { name: "[Content_Types].xml", bytes: enc.encode(types) },
    { name: "_rels/.rels", bytes: enc.encode(root) },
    { name: "word/document.xml", bytes: enc.encode(doc) },
    { name: "word/styles.xml", bytes: enc.encode(DOCX_STYLES) },
    { name: "word/numbering.xml", bytes: enc.encode(DOCX_NUMBERING) },
    { name: "word/_rels/document.xml.rels", bytes: enc.encode(rels) }
  ];
  media.forEach(function (m) {
    files.push({ name: "word/media/sketch" + m.id + ".png", bytes: dataUrlToBytes(m.dataUrl) });
  });
  return zipStore(files);
}

