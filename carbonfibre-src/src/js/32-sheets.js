/* ============================================================
   Sheets - CSV files edited as a grid. Stored as .csv in a
   sheets/ folder, kept out of the note list and note search.
   ============================================================ */

/* ---- RFC 4180 parsing, plus the mess real exports produce ---- */

function csvDelimiter(text) {
  var head = text.split(/\r?\n/).slice(0, 5).join("\n");
  var counts = [[",", 0], [";", 0], ["\t", 0], ["|", 0]];
  var inQ = false;
  for (var i = 0; i < head.length; i++) {
    var c = head.charAt(i);
    if (c === '"') inQ = !inQ;
    if (inQ) continue;
    for (var k = 0; k < counts.length; k++) if (c === counts[k][0]) counts[k][1]++;
  }
  counts.sort(function (a, b) { return b[1] - a[1]; });
  return counts[0][1] ? counts[0][0] : ",";
}

function csvParse(text, delim) {
  text = String(text).replace(/^\uFEFF/, "");          /* Excel's BOM */
  delim = delim || csvDelimiter(text);
  var rows = [], row = [], field = "", i = 0, inQ = false;
  while (i < text.length) {
    var c = text.charAt(i);
    if (inQ) {
      if (c === '"') {
        if (text.charAt(i + 1) === '"') { field += '"'; i += 2; continue; }   /* "" is an escaped quote */
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === delim) { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  /* pad ragged rows out to the widest one so the grid is rectangular */
  var cols = rows.reduce(function (n, r) { return Math.max(n, r.length); }, 0) || 1;
  rows.forEach(function (r) { while (r.length < cols) r.push(""); });
  return rows.length ? rows : [[""]];
}

/* Excel reads a leading = + - @ as a formula, so neutralise it on the way out */
function csvSafeCell(v, guard) {
  v = v === undefined || v === null ? "" : String(v);
  if (guard && /^[=+\-@]/.test(v)) v = "'" + v;
  if (/["\n\r,;\t]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
  return v;
}
function csvSerialise(rows, guard) {
  return "\uFEFF" + rows.map(function (r) {
    return r.map(function (c) { return csvSafeCell(c, guard); }).join(",");
  }).join("\r\n") + "\r\n";
}

/* ---- markdown table <-> grid ---- */

function rowsToMarkdown(rows, aligns) {
  if (!rows.length) return [];
  var cols = rows[0].length;
  var widths = [];
  for (var c = 0; c < cols; c++) {
    var w = 3;
    rows.forEach(function (r) { w = Math.max(w, String(r[c] || "").length); });
    widths.push(Math.min(48, w));
  }
  function pad(v, c) {
    v = String(v || "").replace(/\|/g, "\\|");
    while (v.length < widths[c]) v += " ";
    return v;
  }
  var out = ["| " + rows[0].map(pad).join(" | ") + " |"];
  out.push("|" + widths.map(function (w, c) {
    var a = aligns && aligns[c];
    var bar = new Array(Math.max(3, w) + 1).join("-");
    return a === "center" ? " :" + bar.slice(2) + ": " : a === "right" ? " " + bar.slice(1) + ": " : " " + bar + " ";
  }).join("|") + "|");
  for (var r = 1; r < rows.length; r++) out.push("| " + rows[r].map(pad).join(" | ") + " |");
  return out;
}

/* pull a markdown table out of a note's lines, given any line inside it */
function tableRowsAt(lines, fmeta, idx) {
  var t = fmeta[idx] && fmeta[idx].table;
  if (!t) return null;
  var rows = [];
  for (var r = t.first; r <= t.last; r++) {
    if (r === t.first + 1) continue;
    rows.push(splitCells(lines[r]).map(function (c) { return c.text.replace(/\\\|/g, "|"); }));
  }
  var cols = t.cols;
  rows.forEach(function (row) { while (row.length < cols) row.push(""); });
  return { rows: rows, first: t.first, last: t.last, aligns: t.aligns };
}

/* ---- the sheet model ---- */

var sheets = [];            /* { id, path, title, rows, handle, parent, dirty, mtime } */
var SHEET_DIR = "sheets";
var SHEET_KEY = "carbonfibre-sheets";

function findSheet(id) {
  for (var i = 0; i < sheets.length; i++) if (String(sheets[i].id) === String(id)) return sheets[i];
  return null;
}
function blankRows(r, c) {
  var out = [];
  for (var i = 0; i < r; i++) {
    var row = [];
    for (var j = 0; j < c; j++) row.push("");
    out.push(row);
  }
  return out;
}
function loadLocalSheets() {
  try {
    var raw = localStorage.getItem(SHEET_KEY);
    if (raw) sheets = (JSON.parse(raw) || []).map(function (s) {
      return { id: s.id, path: s.path || null, title: s.title, rows: s.rows, handle: null, parent: null };
    });
  } catch (e) { sheets = []; }
}
function saveLocalSheets() {
  if (state.backend === "folder") return;
  try {
    storeSet(SHEET_KEY, JSON.stringify(sheets.map(function (s) {
      return { id: s.id, path: s.path, title: s.title, rows: s.rows };
    })));
  } catch (e) {}
}
function sheetDirty(sh) {
  sh.dirty = true;
  setSaveState("saving");
  if (sheetTimer) clearTimeout(sheetTimer);
  sheetTimer = setTimeout(flushSheets, 500);
}
var sheetTimer = null;
function flushSheets() {
  sheetTimer = null;
  var pending = sheets.filter(function (s) { return s.dirty; });
  if (!pending.length) return;
  if (state.backend !== "folder") {
    pending.forEach(function (s) { s.dirty = false; });
    saveLocalSheets();
    flashSaved();
    return;
  }
  /* one flush at a time: a second save starting mid-write would see the first as a change on disk */
  sheetChain = sheetChain.then(function () {
    var chain = Promise.resolve();
    pending.forEach(function (s) {
      chain = chain.then(function () {
        return sheetParent(s).then(function (dir) {
          s.dirty = false;                               /* edits from here on mark it again */
          return writeGuarded({ parent: dir, base: s.path.split("/").pop(), handle: s.handle, mtime: s.mtime, text: csvSerialise(s.rows, CSV_GUARD), label: s.path,
            onTake: function (theirs, m) {
              s.rows = csvParse(theirs); s.mtime = m; s.dirty = false;
              panes.forEach(function (q) { if (q.grid && q.grid.sheet === s) { q.grid.changed(); q.grid.render(); } });
            },
            onWritten: function (fh, m) { s.handle = fh; s.parent = dir; s.mtime = m; } });
        });
      });
    });
    return chain.then(flashSaved);
  }).catch(function (e) { console.error(e); setSaveState("error"); });
}
var sheetChain = Promise.resolve();
function sheetParent(s) {
  if (s.parent) return Promise.resolve(s.parent);
  return state.dirHandle.getDirectoryHandle(SHEET_DIR, { create: true });
}
var CSV_GUARD = true;      /* prefix = + - @ with ' on export, so Excel treats them as text */

var sheetSeq = 0;
function createSheet(title, rows) {
  title = sanitizeName(title || "Sheet");
  var sh;
  if (state.backend === "folder") {
    var name = title + ".csv", k = 2;
    while (sheets.some(function (s) { return s.path === SHEET_DIR + "/" + name; })) { name = title + " " + k + ".csv"; k++; }
    sh = { id: SHEET_DIR + "/" + name, path: SHEET_DIR + "/" + name, title: name.replace(/\.csv$/i, ""),
           rows: rows || blankRows(12, 5), handle: null, parent: null };
  } else {
    /* unique even for sheets made in the same millisecond (an import of several CSVs): two
       sheets sharing an id were saved over each other, and formulas read the wrong one */
    var sid;
    do { sid = "sheet-" + Date.now().toString(36) + "-" + (++sheetSeq).toString(36) + Math.random().toString(36).slice(2, 6); }
    while (sheets.some(function (x) { return x.id === sid; }));
    sh = { id: sid, path: null, title: title,
           rows: rows || blankRows(12, 5), handle: null, parent: null };
  }
  sheets.push(sh);
  sheetDirty(sh);
  renderSidebar();
  return sh;
}
function deleteSheet(id) {
  var sh = findSheet(id);
  if (!sh) return;
  if (!window.confirm('Delete sheet "' + sh.title + '"?')) return;
  if (state.backend === "folder" && sh.parent) {
    sh.parent.removeEntry(sh.path.split("/").pop()).catch(function (e) { console.error(e); });
  }
  sheets = sheets.filter(function (s) { return String(s.id) !== String(id); });
  panes.forEach(function (p) {
    if (p.type === "sheet" && sameId(p.sheetId, id)) { p.type = "note"; p.sheetId = null; p.render(); }
  });
  saveLocalSheets();
  renderSidebar();
}

/* ---- the grid: one table, one floating input over the active cell ---- */

function colName(i) {
  var s = "";
  i++;
  while (i > 0) { var r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

