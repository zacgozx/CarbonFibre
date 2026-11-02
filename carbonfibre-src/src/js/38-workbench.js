/* ============================================================
   Workbench: breadcrumbs, the status bar and the command palette,
   the parts of VS Code's shell that tell you where you are and put
   every action one keystroke away.
   ============================================================ */

/* ---- breadcrumbs: folder, note, and the heading the cursor is under ---- */
function crumbHeading(p) {
  var i = p.activeLine;
  if (i === null || i === undefined) return "";
  for (; i >= 0; i--) {
    var m = p.fmeta[i] || {};
    if (m.fence) continue;                              /* a "#" inside code is not a heading */
    var h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(p.lines[i] || "");
    if (h) return h[2];
  }
  return "";
}
function renderCrumbs(p) {
  if (!p || !p.crumbEl) return;
  var n = p.type === "note" ? p.note() : null;
  if (!n) { p.crumbEl.innerHTML = ""; return; }
  var parts = n.path ? n.path.split("/").slice(0, -1) : [];
  var sep = ico("chevronRight", "crumb-sep");
  var html = parts.map(function (f) { return '<span class="crumb">' + esc(f) + "</span>" + sep; }).join("");
  var head = crumbHeading(p);
  html += '<span class="crumb' + (head ? "" : " crumb-cur") + '">' + ico("file") + esc(n.title) + "</span>";
  if (head) html += sep + '<button class="crumb crumb-cur crumb-btn" data-crumb="heads" title="Go to a heading in this note">' + ico("hash") + esc(head) + "</button>";
  else if (p.lines.some(function (l) { return /^#{1,6}\s/.test(l); }))
    html += sep + '<button class="crumb crumb-btn" data-crumb="heads" title="Go to a heading in this note">' + ico("hash") + "Headings</button>";
  if (p.crumbEl.innerHTML !== html) p.crumbEl.innerHTML = html;
}

/* ---- status bar: line and column, word count ---- */
function countWords(text) { return (text.match(/[\p{L}\p{N}][\p{L}\p{N}'\u2019_-]*/gu) || []).length; }
function updateStatus() {
  var pos = document.getElementById("sbPos"), wd = document.getElementById("sbWords");
  if (!pos) return;
  if (typeof sk !== "undefined" && sk) {
    var live = sk.elements.filter(function (e) { return !e.isDeleted; }).length;
    pos.textContent = sk.sels && sk.sels.length ? sk.sels.length + " selected" : "";
    wd.textContent = live + (live === 1 ? " shape" : " shapes");
    return;
  }
  var p = focusedPane || panes[0];
  var n = p && p.type === "note" ? p.note() : null;
  if (!n) { pos.textContent = ""; wd.textContent = ""; return; }
  var ln = null, col = null;
  if (p.srcEl && document.activeElement === p.srcEl) {
    var before = p.srcEl.value.slice(0, p.srcEl.selectionStart).split("\n");
    ln = before.length; col = before[before.length - 1].length + 1;
  } else if (p.activeLine !== null && p.ta) {
    ln = p.activeLine + 1; col = p.ta.selectionStart + 1;
  }
  pos.textContent = ln ? "Ln " + ln + ", Col " + col : "";
  /* sketches are stored as JSON inside fences; they are drawings, not words */
  var prose = [], inSketch = false;
  p.lines.forEach(function (l) {
    if (isDelim(l)) { inSketch = !inSketch && /^```\s*excalidraw/i.test(l); return; }
    if (!inSketch) prose.push(l);
  });
  var w = countWords(prose.join("\n"));
  wd.textContent = w + (w === 1 ? " word" : " words");
}
var chromeQueued = false;
function scheduleChrome() {
  if (chromeQueued) return;
  chromeQueued = true;
  requestAnimationFrame(function () {
    chromeQueued = false;
    updateStatus();
    renderCrumbs(focusedPane || panes[0]);
  });
}
["keyup", "mouseup", "input", "focusin"].forEach(function (t) { document.addEventListener(t, scheduleChrome, true); });

/* ---- command palette: notes by name, or ">" for commands ---- */
var pal = { open: false, rows: [], sel: 0, back: null };
function palCommands() {
  var fp = function () { return focusedPane || panes[0]; };
  var click = function (sel) { return function () { var b = document.querySelector(sel); if (b) b.click(); }; };
  var list = [
    { label: "New note", run: click("#btnNew") },
    { label: "New sheet", run: click("#btnNewSheet") },
    { label: "Insert sketch", key: "Ctrl+Shift+D", run: function () { insertSketch(); } },
    { label: "Time-block a task", key: "Alt+T", run: click("#btnTimer") },
    { label: "Toggle light and dark theme", key: "Alt+L", run: function () { toggleTheme(); } },
    { label: "Toggle live preview and source", run: function () {
        var p = fp(); if (p && p.type === "note") p.root.querySelector(p.mode === "live" ? ".md-split" : ".md-live").click(); } },
    { label: "Split editor", key: "Ctrl+\\", run: click("#btnDual") },
    { label: "Show notes", key: "Ctrl+Shift+E", run: function () { showView("notes"); } },
    { label: "Show open tabs", key: "Alt+O", run: function () { showView("tabs"); } },
    { label: "Sketch library (drawings in the sketch folder)", key: "Alt+K", run: function () { openSketchLibrary(); } },
    { label: "New sketch file", run: function () { newSketchFile(skLib.dir || ""); } },
    { label: "Choose sketch folder\u2026 (where your sketches are)", run: function () { chooseSketchFolder(); } },
    { label: "Move sketches inside notes into the sketch folder", run: function () { migrateSketchesToFiles(); } },
    { label: "All notes (library: every note, by type, folder, tag)", key: "Alt+N", run: function () { openLibrary("all"); } },
    { label: "Find in this note", key: "Ctrl+F", run: function () { findOpen(); } },
  ].concat(TEXT_COLOURS.map(function (c) {
    return { label: "Text colour: " + c.charAt(0).toUpperCase() + c.slice(1), key: c === "red" ? "Alt+C" : "", run: function () { var q = pal.spot && pal.spot.pane || focusedPane || panes[0]; if (q && q.colourText) colourAfterPalette(q, c); } };
  })).concat([
    { label: "Text colour: remove", run: function () { var q = pal.spot && pal.spot.pane || focusedPane || panes[0]; if (q && q.colourText) colourAfterPalette(q, null); } },
    { label: "Move this tab to the next pane", key: "Ctrl+Alt+\u2192", run: function () { moveCurrentTab(1); } },
    { label: "Move this tab to the previous pane", key: "Ctrl+Alt+\u2190", run: function () { moveCurrentTab(-1); } },
    { label: "New note from template\u2026", key: "Ctrl+Alt+N", run: function () { setTimeout(function () { palOpen("/", "new"); }, 0); } },
    { label: "Insert template here\u2026", run: function () { var sp = pal.spot; setTimeout(function () { palOpen("/", "insert"); pal.spot = sp; }, 0); } },
    { label: "Open today\u2019s daily note", key: "Ctrl+Alt+D", run: function () { openDailyNote(); } },
    { label: "Replace in this note", key: "Ctrl+H", run: function () { findOpen(true); } },
    { label: "Replace in every note", key: "Ctrl+Shift+H", run: function () { showView("search"); } },
    { label: "Cursor trail: " + (NINJA.on ? "on (turn off)" : "off (turn on)"), run: function () {
        ninjaSet(!NINJA.on);
        pushToastLike(NINJA.on ? "Cursor trail on: the caret leaves a streak when it moves." : "Cursor trail off.");
      } },
    { label: "Copy note as formatted text (Teams, Outlook)", run: function () {
        var p = fp(); if (!p || !p.note()) return;
        p.sync();
        copyRich(p.lines.slice()).then(function (ok) { pushToastLike(ok ? "Copied with formatting. Paste into Teams or Outlook." : "Copied as plain text (formatting was blocked)."); });
      } },
    { label: "Copy selection as formatted text (Teams, Outlook)", run: function () {
        var p = fp(); if (!p || !p.note()) return;
        var txt = p.allSelected ? p.selectedText() : (p.ta && p.ta.selectionStart !== p.ta.selectionEnd ? p.ta.value.slice(p.ta.selectionStart, p.ta.selectionEnd) : "");
        if (!txt) { pushToastLike("Highlight some lines first."); return; }
        copyRich(txt.split("\n")).then(function (ok) { pushToastLike(ok ? "Copied with formatting." : "Copied as plain text."); });
      } },
    { label: "Task board: show", run: function () { tbShow(); } },
    { label: "Task board: start task", run: function () {
        var p = tbShow(), first = p && p.tbRoot && p.tbRoot.querySelector('[data-lane="open"] .tb-card .tb-start');
        if (first) first.focus(); else pushToastLike("Nothing to do yet. Type a task into the box at the top of To do.");
      } },
    { label: "Task board: stop timer", run: function () { if (tbRunning()) tbStopAs("open"); else pushToastLike("Nothing running on the board."); } },
    { label: "Task board: add this note as a task", run: function () { tbAddCurrentNote(); } },
    { label: "Open notes dashboard (pinned notes and folders)", run: function () { tb.view = "notes"; tb.notesMode = "overview"; tbSave(); var q = tbShow(); tbRenderAll(); if (q && q.renderTabs) q.renderTabs(); } },
    { label: "All notes (find, sort and tidy every note)", run: function () { tb.view = "notes"; tb.notesMode = "all"; tbSave(); var q = tbShow(); tbRenderAll(); if (q && q.renderTabs) q.renderTabs(); } },
    { label: "Task board: link this note to a task\u2026", run: function () {
        var q = focusedPane || panes[0], n = q && q.type === "note" ? q.note() : null;
        if (!n) { pushToastLike("Open a note first."); return; }
        if (!tb.tasks.length) { pushToastLike("The task board has no tasks yet."); return; }
        setTimeout(function () { palPick("task", function (t) { tbLinkNote(t, n); }, "Link \u201c" + n.title + "\u201d to which task? Type to search"); }, 0);
      } },
    { label: "Task board: set ServiceNow address", run: function () { tbSetSnowBase(); } },
    { label: "Task board: ServiceNow link style", run: function () { tbSetSnowStyle(); } },
    { label: "Search all notes", key: "Ctrl+Shift+F", run: function () { showView("search"); } },
    { label: "Open graph", key: "Ctrl+G", run: function () { openGraph(); } },
    { label: "Toggle sidebar", run: click("#btnSidebar") },
    { label: "Export note to Word", run: click('[data-export="docx"]') },
    { label: "Export note to PDF", run: click('[data-export="pdf"]') },
    { label: "Save now", key: "Ctrl+S", run: function () { flushPersist(); } },
    { label: "Go to a heading in this note", run: function () { setTimeout(function () { palOpen("@"); }, 0); } },
    { label: "Pin or unpin this note", run: function () { var n = fp() && fp().note(); if (n) togglePin(n); } },
    { label: "Rename this note", run: function () { var n = fp() && fp().note(); if (n) { showView("notes"); state.renamingId = n.id; renderSidebar(); } } },
    { label: "Close this tab", run: function () { var p = fp(); if (p && p.noteId != null) p.closeTab(p.noteId); } },
    { label: "Insert table", key: "Ctrl+Shift+T", run: function () { palEditorKey("t"); } },
    { label: "Convert Mermaid flowchart to sketch", run: function () {
        var p = (pal.spot && pal.spot.pane) || fp(); if (!p || p.type !== "note") return;
        if (pal.spot) p.activeLine = pal.spot.line;
        var at = mermaidBlockFor(p);
        if (at < 0) pushToastLike("This note has no Mermaid block."); else convertMermaid(p, at); } },
    { label: "Edit the table under the cursor as a sheet", key: "Ctrl+Shift+S", run: function () {
        var p = fp(); if (p && !editTableAsSheet(p)) pushToastLike("Put the cursor inside a table first."); } }
  ]);
  if (state.backend === "folder") list.push({ label: "New folder", run: function () { createFolder(); } },
                                            { label: "Reload folder from disk", run: click("#btnReload") });
  else list.push({ label: "Open a folder to store notes as files", run: click("#btnFolder") });
  return list;
}
/* run an editor shortcut through the editor itself, so the command and the key stay one behaviour */
function palEditorKey(key) {
  var p = (pal.spot && pal.spot.pane) || focusedPane || panes[0];
  if (!p || p.type !== "note" || !p.note()) return;
  var line = pal.spot ? pal.spot.line : Math.max(0, p.lines.length - 1);
  p.setActive(Math.min(line, p.lines.length - 1), pal.spot ? pal.spot.col : 0);
  if (p.ta) p.ta.dispatchEvent(new KeyboardEvent("keydown", { key: key.toUpperCase(), ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
}
/* subsequence match: every typed letter in order; runs and word starts score higher */
function palMatch(text, q) {
  if (!q) return { score: 0, hits: [] };
  var t = text.toLowerCase(), hits = [], score = 0, at = 0, prev = -2;
  for (var i = 0; i < q.length; i++) {
    var k = t.indexOf(q[i], at);
    if (k === -1) return null;
    score += (k === prev + 1 ? 5 : 1) + (k === 0 || /[\s\/_.-]/.test(t[k - 1]) ? 4 : 0);
    hits.push(k); prev = k; at = k + 1;
  }
  return { score: score - t.length * 0.01, hits: hits };
}
function palMark(text, hits) {
  var out = "", set = {};
  hits.forEach(function (h) { set[h] = 1; });
  for (var i = 0; i < text.length; i++) out += set[i] ? "<mark>" + esc(text[i]) + "</mark>" : esc(text[i]);
  return out;
}
function palRender() {
  var raw = document.getElementById("cmdIn").value, list = document.getElementById("cmdList");
  var cmdMode = raw.charAt(0) === ">", headMode = raw.charAt(0) === "@", tplMode = raw.charAt(0) === "/";
  var q = (cmdMode || headMode || tplMode ? raw.slice(1) : raw).trim().toLowerCase();
  var rows = [];
  if (pal.pick && pal.pick.kind === "task" && !cmdMode) {
    /* open tasks first, then today's finished ones */
    var order = { run: 0, open: 1, held: 2, done: 3 }, today = tbDay();
    tb.tasks.filter(function (t) { return t.state !== "done" || t.clearedAt === today; })
      .sort(function (a, b) { return order[a.state] - order[b.state]; })
      .forEach(function (t) { var m = palMatch(t.id + " " + t.name, q); if (m) rows.push({ kind: "tbtask", t: t, m: m }); });
  } else if (tplMode) {
    templateList().forEach(function (t) { var m = palMatch(t.name, q); if (m) rows.push({ kind: "tpl", t: t, m: m }); });
  } else if (headMode) {
    var hp = (pal.spot && pal.spot.pane) || focusedPane || panes[0];
    if (hp && hp.type === "note") hp.lines.forEach(function (l, i) {
      if ((hp.fmeta[i] || {}).fence) return;
      var h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(l);
      if (!h) return;
      var m = palMatch(h[2], q); if (m) rows.push({ kind: "head", pane: hp, line: i, level: h[1].length, text: h[2], m: m });
    });
  } else if (cmdMode) {
    var qc = q.replace(/colou?r/g, "colour");          /* "color" finds the colour commands too */
    palCommands().forEach(function (c) {
      var m = palMatch(c.label, qc); if (m) rows.push({ kind: "cmd", c: c, m: m });
    });
  } else {
    syncAllPanes();
    state.notes.forEach(function (n) {
      var m = palMatch(n.title, q); if (m) rows.push({ kind: "note", n: n, m: m });
    });
    if (!q) rows.sort(function (a, b) { return (b.n.mtime || 0) - (a.n.mtime || 0); });
    /* commands that match come after the notes, so "text colour" works without typing > first */
    if (q.length >= 3 && !pal.pick) {
      rows.sort(function (a, b) { return b.m.score - a.m.score; });
      var qn = q.replace(/colou?r/g, "colour"), cmds = [];
      palCommands().forEach(function (c) { var m = palMatch(c.label, qn); if (m && m.score > 0) cmds.push({ kind: "cmd", c: c, m: m }); });
      cmds.sort(function (a, b) { return b.m.score - a.m.score; });
      rows = rows.concat(cmds.slice(0, 6));
      q = "";                                           /* already ordered: notes first, then commands */
    }
  }
  if (q && !headMode) rows.sort(function (a, b) { return b.m.score - a.m.score; });
  pal.rows = rows.slice(0, 60);
  pal.sel = Math.min(pal.sel, Math.max(0, pal.rows.length - 1));
  if (!pal.rows.length) {
    list.innerHTML = '<div class="cmd-empty">' + (tplMode ? "No template matches. Make one: a note titled \u201cTemplate: name\u201d." : cmdMode ? "No command matches." : headMode ? "This note has no matching headings." :
      "No note matches. Type &gt; for commands, @ for headings in this note.") + "</div>";
    return;
  }
  list.innerHTML = pal.rows.map(function (r, i) {
    var label = r.kind === "cmd" ? r.c.label : r.kind === "head" ? r.text : r.kind === "tpl" ? r.t.name : r.kind === "tbtask" ? r.t.id + "  " + r.t.name : r.n.title;
    var meta = r.kind === "tbtask" ? ({ run: "Working on", open: "To do", held: "Waiting", done: "Done today" }[r.t.state] + (r.t.noteId != null && findNote(r.t.noteId) ? " \u00b7 linked to " + findNote(r.t.noteId).title : "")) :
      r.kind === "tpl" ? (r.t.own ? "your template" : "built in") : r.kind === "cmd" ? (r.c.key ? "<kbd>" + esc(r.c.key) + "</kbd>" : "")
             : r.kind === "head" ? "H" + r.level + "  line " + (r.line + 1)
             : (r.n.path && r.n.path.indexOf("/") > 0 ? esc(r.n.path.split("/").slice(0, -1).join("/")) : "");
    return '<div class="cmd-row' + (i === pal.sel ? " sel" : "") + '" role="option" data-i="' + i + '"' +
      (i === pal.sel ? ' aria-selected="true"' : "") + (r.kind === "head" ? ' style="padding-left:' + (10 + (r.level - 1) * 14) + 'px"' : "") + ">" +
      ico(r.kind === "cmd" ? "command" : r.kind === "head" ? "hash" : r.kind === "tpl" ? "pencil" : r.kind === "tbtask" ? "check" : "file") +
      '<span class="cmd-label">' + palMark(label, r.m.hits) + '</span><span class="cmd-meta">' + meta + "</span></div>";
  }).join("");
  var cur = list.querySelector(".cmd-row.sel");
  if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest" });
}
