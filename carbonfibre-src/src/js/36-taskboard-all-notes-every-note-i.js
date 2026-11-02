/* ---- All notes: every note in one table, with filters that surface what to tidy ---- */
/* what kind of note this is, from its name and folder: ticket numbers, dates, the usual words */
const NOTE_TYPES = [
  { key: "Incident", c: "red" }, { key: "Change", c: "blue" }, { key: "Request", c: "green" }, { key: "Problem", c: "pink" },
  { key: "Task", c: "orange" }, { key: "Daily", c: "teal" }, { key: "Meeting", c: "purple" }, { key: "Handover", c: "yellow" },
  { key: "Runbook", c: "grey" }, { key: "Note", c: "grey" }
];
const TICKET_TYPE = { INC: "Incident", CHG: "Change", RITM: "Request", PRB: "Problem" };
function noteType(n) {
  const t = n.title || "", dir = tbnFolderOf(n).toLowerCase(); let m;
  if ((m = /\b(SCTASK|CTASK|PTASK|STSK|STRY|RITM|INC|CHG|PRB)\d{4,}/i.exec(t))) return TICKET_TYPE[m[1].toUpperCase()] || "Task";
  if (/^\d{4}-\d{2}-\d{2}\b/.test(t) || /(^|\/)dail/.test(dir)) return "Daily";
  if (/meeting/i.test(t) || /meeting/.test(dir)) return "Meeting";
  if (/handover/i.test(t) || /handover/.test(dir)) return "Handover";
  if (/runbook|how ?to|procedure/i.test(t) || /runbook/.test(dir)) return "Runbook";
  return "Note";
}
function noteTypeColour(type) { const t = NOTE_TYPES.filter(function (x) { return x.key === type; })[0]; return t ? t.c : "grey"; }
/* #tags in a note's text (not headings, which have a space after #; not inside code blocks) */
function noteTagsOf(n) {
  const out = {}, re = /(^|[\s(])#([A-Za-z][\w/-]*)/g; let m, inFence = false;
  String(n.content || "").split("\n").forEach(function (l) {
    if (/^\s*```/.test(l)) { inFence = !inFence; return; }
    if (inFence) return;
    re.lastIndex = 0;
    while ((m = re.exec(l))) out[m[2].toLowerCase()] = 1;
  });
  return Object.keys(out).sort();
}
function tbnFacts() {
  syncAllPanes();
  const sig = notesSignature();
  if (blCache.sig !== sig) { blCache.index = buildBacklinkIndex(); blCache.sig = sig; }
  const now = Date.now();
  return state.notes.filter(function (n) { return !/^template\s*:/i.test(n.title || ""); }).map(function (n) {
    const c = String(n.content || ""), t = n.title.toLowerCase();
    const body = c.replace(/^\s*#\s+[^\n]*\n?/, "").trim();
    const inN = (blCache.index[t] || []).filter(function (r) { return r.note.title.toLowerCase() !== t; }).length;
    const outN = (c.match(/\[\[[^\]\n]+\]\]/g) || []).length;
    const stamp = noteStamp(n);
    return { n: n, dir: tbnFolderOf(n), stamp: stamp, words: body ? body.split(/\s+/).length : 0, inN: inN, outN: outN,
      tasks: tbnOpenTasks(n), ticket: tbnLinked(n), pinned: !!pinned[String(n.id)],
      untitled: /^untitled(\s*\d+)?$/i.test(n.title.trim()), empty: body.replace(/[#>*\-\s]/g, "").length < 3,
      stale: stamp && now - stamp > 30 * 864e5, type: noteType(n), tags: noteTagsOf(n), preview: tbnPreview(n) };
  });
}
const TBN_CHIPS = [
  ["all", "All", function () { return true; }],
  ["tidy", "Untitled or empty", function (f) { return f.untitled || f.empty; }],
  ["orphan", "Not linked", function (f) { return !f.inN && !f.outN; }],
  ["stale", "Not edited in 30+ days", function (f) { return f.stale; }],
  ["tasks", "Open tasks", function (f) { return f.tasks > 0; }],
  ["ticket", "On the board", function (f) { return !!f.ticket; }],
  ["pinned", "Pinned", function (f) { return f.pinned; }]
];
function tbnState(p) { return p.tbnAll || (p.tbnAll = { chip: "all", type: "", group: tb.libGroup || "none", q: "", text: false, sort: "edited", dir: -1, sel: {} }); }
function tbnAllHtml(p) {
  const st = tbnState(p), facts = tbnFacts(), dirs = {};
  facts.forEach(function (f) { if (f.dir) dirs[f.dir.split("/")[0]] = 1; });
  const cnt = function (key) { const fn = TBN_CHIPS.filter(function (c) { return c[0] === key; })[0][2]; return facts.filter(fn).length; };
  const sum = '<p class="tbn-sum"><b>' + facts.length + "</b> notes" + (Object.keys(dirs).length ? " in <b>" + Object.keys(dirs).length + "</b> folders" : "") +
    " \u00b7 <b>" + cnt("tidy") + "</b> untitled or empty \u00b7 <b>" + cnt("orphan") + "</b> not linked \u00b7 <b>" + cnt("stale") + "</b> not edited in 30+ days</p>";
  const chips = '<div class="tbn-chips">' + TBN_CHIPS.map(function (c) {
    return '<button type="button" class="tbn-chip' + (st.chip === c[0] ? " on" : "") + '" data-chip="' + c[0] + '">' + c[1] + "<span>" + cnt(c[0]) + "</span></button>";
  }).join("") + "</div>";
  const tcount = {}; facts.forEach(function (f) { tcount[f.type] = (tcount[f.type] || 0) + 1; });
  const types = '<div class="tbn-chips tbn-types"><span class="tbn-chiplbl">Type</span><button type="button" class="tbn-chip' + (!st.type ? " on" : "") + '" data-ntype="">Any</button>' +
    NOTE_TYPES.filter(function (t) { return tcount[t.key]; }).map(function (t) {
      return '<button type="button" class="tbn-chip' + (st.type === t.key ? " on" : "") + '" data-ntype="' + t.key + '"><i class="tbn-tdot tc-' + t.c + '"></i>' + t.key + "<span>" + tcount[t.key] + "</span></button>";
    }).join("") + "</div>";
  const bar = '<div class="tbn-tools"><input class="tbn-search" type="search" placeholder="Find by name, folder, #tag" value="' + esc(st.q) + '" aria-label="Find notes">' +
    '<label class="tbn-textq"><input type="checkbox" class="tbn-textcb"' + (st.text ? " checked" : "") + "> search text too</label>" +
    '<select class="tbn-group" aria-label="Group by">' + [["none", "No grouping"], ["type", "Group by type"], ["folder", "Group by folder"], ["month", "Group by month"]].map(function (g) {
      return '<option value="' + g[0] + '"' + (st.group === g[0] ? " selected" : "") + ">" + g[1] + "</option>"; }).join("") + "</select></div>";
  return '<section class="tbd-panel tbn-all blu"><header class="tbd-head"><h3><i></i>All notes</h3></header>' + sum + chips + types + bar + '<div class="tbn-results"></div></section>';
}
function tbnRenderResults(p) {
  const box = p.tbRoot.querySelector(".tbn-results");
  if (!box) return;
  const st = tbnState(p), q = st.q.trim().toLowerCase(), chip = TBN_CHIPS.filter(function (c) { return c[0] === st.chip; })[0][2];
  let rows = tbnFacts().filter(chip).filter(function (f) {
    if (st.type && f.type !== st.type) return false;
    if (!q) return true;
    const hay = (f.n.title + " " + f.dir + " " + f.type + " " + f.tags.map(function (t) { return "#" + t; }).join(" ") + " " + f.preview).toLowerCase();
    const text = st.text ? String(f.n.content || "").toLowerCase() : "";
    return q.split(/\s+/).every(function (w) { return hay.indexOf(w) !== -1 || (st.text && text.indexOf(w) !== -1); });   /* every word somewhere */
  });
  const key = { title: function (f) { return f.n.title.toLowerCase(); }, folder: function (f) { return f.dir.toLowerCase() + "\u0000" + f.n.title.toLowerCase(); },
    edited: function (f) { return f.stamp || 0; }, words: function (f) { return f.words; }, links: function (f) { return f.inN + f.outN; }, tasks: function (f) { return f.tasks; },
    type: function (f) { return f.type + "\u0000" + f.n.title.toLowerCase(); } }[st.sort];
  rows.sort(function (a, b) { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * st.dir; });
  /* grouped: groups in a sensible order (types as listed, folders by name, months newest first), rows sorted within */
  const groupOf = st.group === "type" ? function (f) { return f.type; } : st.group === "folder" ? function (f) { return f.dir || "(top level)"; }
    : st.group === "month" ? function (f) { return f.stamp ? new Date(f.stamp).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "Unknown"; } : null;
  if (groupOf) {
    const gOrder = st.group === "type" ? function (f) { return NOTE_TYPES.map(function (t) { return t.key; }).indexOf(f.type); }
      : st.group === "month" ? function (f) { const d = new Date(f.stamp || 0); return -(d.getFullYear() * 12 + d.getMonth()); } : function (f) { return (f.dir || "\uffff").toLowerCase(); };
    rows = rows.map(function (f, i) { return { f: f, i: i }; }).sort(function (a, b) { const x = gOrder(a.f), y = gOrder(b.f); return (x < y ? -1 : x > y ? 1 : 0) || a.i - b.i; }).map(function (o) { return o.f; });
  }
  const gCount = {}; if (groupOf) rows.forEach(function (f) { const g = groupOf(f); gCount[g] = (gCount[g] || 0) + 1; });
  let lastG = null;
  Object.keys(st.sel).forEach(function (id) { if (!findNote(id)) delete st.sel[id]; });
  const nSel = Object.keys(st.sel).length, total = rows.length, CAP = 400;
  const head = function (k, label) { return '<th data-sort="' + k + '"' + (st.sort === k ? ' class="on"' : "") + ">" + label + (st.sort === k ? (st.dir > 0 ? " \u2191" : " \u2193") : "") + "</th>"; };
  const allOn = rows.length && rows.slice(0, CAP).every(function (f) { return st.sel[String(f.n.id)]; });
  const laneName = { run: "Working on", open: "To do", held: "Waiting" };
  const body = rows.slice(0, CAP).map(function (f) {
    const id = esc(String(f.n.id)), flags = (f.untitled ? '<span class="tbn-flag">untitled</span>' : "") + (f.empty ? '<span class="tbn-flag">empty</span>' : "");
    let ghead = "";
    if (groupOf) { const g = groupOf(f); if (g !== lastG) { ghead = '<tr class="tbn-grp"><td colspan="9">' + esc(g) + "<span>" + gCount[g] + "</span></td></tr>"; lastG = g; } }
    return ghead + '<tr data-open="' + id + '"' + (st.sel[String(f.n.id)] ? ' class="sel"' : "") + '><td class="tbn-cb"><input type="checkbox" data-sel="' + id + '"' + (st.sel[String(f.n.id)] ? " checked" : "") + ' aria-label="Select ' + esc(f.n.title) + '"></td>' +
      '<td class="tbn-t"><span class="tbn-tt">' + (f.pinned ? '<span class="tbn-pin" title="Pinned">' + ico("starFill") + "</span>" : "") + esc(f.n.title) + flags +
        f.tags.slice(0, 3).map(function (t) { return '<span class="tbn-tag">#' + esc(t) + "</span>"; }).join("") + "</span>" +
        (f.preview ? '<span class="tbn-pv2">' + esc(f.preview) + "</span>" : "") + "</td>" +
      '<td class="tbn-ty"><span class="tbn-type"><i class="tbn-tdot tc-' + noteTypeColour(f.type) + '"></i>' + f.type + "</span></td>" +
      '<td class="tbn-d">' + esc(f.dir || "\u2013") + "</td>" +
      '<td class="tbn-e' + (f.stale ? " stale" : "") + '">' + esc(tbnAgo(f.stamp)) + "</td>" +
      '<td class="tbn-w">' + f.words + "</td>" +
      '<td class="tbn-l" title="' + f.inN + " linking here, " + f.outN + ' links out">' + (f.inN || f.outN ? f.inN + " / " + f.outN : "\u2013") + "</td>" +
      '<td class="tbn-k">' + (f.tasks || "") + "</td>" +
      '<td class="tbn-tk">' + (f.ticket ? '<span class="tbn-ticket tbn-ticket--' + f.ticket.state + '" title="' + esc(laneName[f.ticket.state]) + '"><i></i>' + esc(f.ticket.id) + "</span>" : "") + "</td></tr>";
  }).join("");
  const bulk = nSel ? '<div class="tbn-bulk"><b>' + nSel + " selected</b>" +
    '<button type="button" data-bulk="pin">Pin</button><button type="button" data-bulk="unpin">Unpin</button>' +
    (state.backend === "folder" ? '<button type="button" data-bulk="move">Move to folder\u2026</button>' : "") +
    '<button type="button" data-bulk="delete" class="danger">' + (state.backend === "folder" ? "Move to .trash" : "Delete") + '</button><button type="button" data-bulk="clear">Clear selection</button></div>' : "";
  box.innerHTML = bulk + (total ? '<div class="tbn-tablewrap"><table class="tbn-table"><thead><tr><th class="tbn-cb"><input type="checkbox" data-selall="1"' + (allOn ? " checked" : "") + ' aria-label="Select all shown"></th>' +
    head("title", "Note") + head("type", "Type") + head("folder", "Folder") + head("edited", "Edited") + head("words", "Words") + head("links", "Links in / out") + head("tasks", "Tasks") + "<th>Ticket</th></tr></thead><tbody>" + body + "</tbody></table></div>" +
    (total > CAP ? '<p class="tbd-empty">Showing ' + CAP + " of " + total + ". Narrow it with a filter or search.</p>" : "")
    : '<p class="tbd-empty">No notes match.</p>');
}
function tbnBulk(p, act, btn) {
  const st = tbnState(p), ids = Object.keys(st.sel), notes = ids.map(findNote).filter(Boolean);
  if (!notes.length) return;
  if (act === "clear") { st.sel = {}; tbnRenderResults(p); return; }
  if (act === "pin" || act === "unpin") {
    notes.forEach(function (n) { if (act === "pin") pinned[String(n.id)] = 1; else delete pinned[String(n.id)]; });
    savePins(); renderSidebar(); tbRenderNotes(p); return;
  }
  if (act === "delete") {
    Dialogs.confirm((state.backend === "folder" ? "Move " + notes.length + " note" + (notes.length === 1 ? "" : "s") + " to .trash?" : "Delete " + notes.length + " note" + (notes.length === 1 ? "" : "s") + "?") +
      "\n\n" + notes.slice(0, 8).map(function (n) { return "\u2022 " + (n.path || n.title); }).join("\n") + (notes.length > 8 ? "\n\u2026and " + (notes.length - 8) + " more" : "")).then(function (ok) {
      if (!ok) return;
      notes.forEach(function (n) { removeNoteNow(n.id); });
      st.sel = {}; tbRenderNotes(p);
    });
    return;
  }
  if (act === "move") {
    const dirs = (state.folders || []).map(function (f) { return f.path; }).sort(function (a, b) { return a.localeCompare(b); });
    const r = btn.getBoundingClientRect();
    floatMenu([{ label: "Top level", fn: function () { notes.forEach(function (n) { moveNote(n.id, ""); }); st.sel = {}; setTimeout(function () { tbRenderNotes(p); }, 300); } }, null].concat(dirs.map(function (d) {
      return { label: d, fn: function () { notes.forEach(function (n) { moveNote(n.id, d); }); st.sel = {}; setTimeout(function () { tbRenderNotes(p); }, 300); } };
    })), r.left, r.bottom + 4);
  }
}
/* notes open beside the Notes view (in another pane), so it stays in view while you browse;
   Shift+click opens a new split; with no other pane, the note opens here */
function tbnOpenBeside(p, n, split) {
  const other = panes.filter(function (q) { return q !== p && q.type === "note"; })[0];
  if (split && panes.length < MAX_PANES) { addPane(p, n.id); return; }
  if (other) { other.open(n.id); other.focusThis(); } else openInPane(n.id, p);
}
/* the library, from anywhere: the Notes view's All notes, in the board's pane */
function openLibrary(mode) {
  tb.view = "notes"; tb.notesMode = mode || "all"; tbSave();
  const q = tbShow(); tbRenderAll(); if (q && q.renderTabs) q.renderTabs();
  setTimeout(function () { const i = q && q.tbRoot && q.tbRoot.querySelector(".tbn-search"); if (i) i.focus(); }, 0);
}
function tbRenderNotes(p) {
  const root = p.tbRoot, box = root.querySelector(".tb-notes");
  if (!box) return;
  const mode = tb.notesMode === "all" ? "all" : "overview";
  const modes = '<div class="tbn-modes" role="tablist"><button type="button" role="tab" data-nmode="overview"' + (mode === "overview" ? ' class="on"' : "") + ">Overview</button>" +
    '<button type="button" role="tab" data-nmode="all"' + (mode === "all" ? ' class="on"' : "") + ">All notes <span>" + state.notes.length + "</span></button></div>";
  if (mode === "all") { box.innerHTML = modes + tbnAllHtml(p); tbnRenderResults(p); return; }
  p.tbnOpen = p.tbnOpen || {};
  const laneName = { run: "Working on", open: "To do", held: "Waiting" };
  const pinnedNotes = Object.keys(pinned).filter(function (k) { return k.indexOf("folder:") !== 0; })
    .map(function (k) { return state.notes.filter(function (n) { return String(n.id) === k; })[0]; }).filter(Boolean)
    .sort(function (a, b) { return noteStamp(b) - noteStamp(a); });
  const pinnedDirs = Object.keys(pinned).filter(function (k) { return k.indexOf("folder:") === 0; }).map(function (k) { return k.slice(7); }).sort(function (a, b) { return a.localeCompare(b); });
  const badge = function (n) {
    const t = tbnLinked(n), k = tbnOpenTasks(n); let out = "";
    if (t) out += '<span class="tbn-ticket tbn-ticket--' + t.state + '" title="On the task board: ' + esc(laneName[t.state]) + '"><i></i>' + esc(t.id) + "</span>";
    if (k) out += '<span class="tbn-todo" title="Unticked checkboxes in this note">' + k + " open task" + (k === 1 ? "" : "s") + "</span>";
    return out;
  };
  /* ---- pinned notes ---- */
  const cards = pinnedNotes.map(function (n) {
    const dir = tbnFolderOf(n), pv = tbnPreview(n), b = badge(n);
    return '<article class="tbn-card" data-open="' + esc(String(n.id)) + '" tabindex="0" role="button" aria-label="Open ' + esc(n.title) + '">' +
      '<div class="tbn-card-top"><h4>' + esc(n.title) + '</h4><button type="button" class="tbn-unpin" data-unpin="' + esc(String(n.id)) + '" title="Unpin" aria-label="Unpin ' + esc(n.title) + '">' + ico("starFill") + "</button></div>" +
      (pv ? '<p class="tbn-pv">' + esc(pv) + "</p>" : '<p class="tbn-pv tbn-pv--empty">Empty note</p>') +
      '<div class="tbn-card-foot">' + b + '<span class="tbn-when">' + (dir ? '<span class="tbn-dir">' + esc(dir) + "</span> \u00b7 " : "") + esc(tbnAgo(noteStamp(n))) + "</span></div></article>";
  }).join("");
  const pinnedP = '<section class="tbd-panel tbn-pinned blu"><header class="tbd-head"><h3><i></i>Pinned notes</h3><span class="tbd-count">' + pinnedNotes.length + "</span></header>" +
    (pinnedNotes.length ? '<div class="tbn-cards">' + cards + "</div>"
      : '<p class="tbd-empty">No pinned notes yet. Hover a note in the sidebar and click its <b>\u2606</b> to pin it here.</p>') + "</section>";
  /* ---- a panel per pinned folder ---- */
  const folderPanels = pinnedDirs.map(function (dir) {
    const inside = state.notes.filter(function (n) { return (n.path || "").indexOf(dir + "/") === 0; }).sort(function (a, b) { return noteStamp(b) - noteStamp(a); });
    const showAll = !!p.tbnOpen[dir], list = showAll ? inside : inside.slice(0, 8);
    const rows = list.map(function (n) {
      const sub = tbnFolderOf(n).slice(dir.length + 1), t = tbnLinked(n), k = tbnOpenTasks(n);
      return '<li class="tbn-row" data-open="' + esc(String(n.id)) + '" tabindex="0" role="button"><span class="tbn-row-t">' + (sub ? '<span class="tbn-sub">' + esc(sub) + "/</span>" : "") + esc(n.title) + "</span>" +
        (t ? '<span class="tbn-ticket tbn-ticket--' + t.state + '"><i></i>' + esc(t.id) + "</span>" : "") + (k ? '<span class="tbn-todo">' + k + "</span>" : "") +
        '<span class="tbn-when">' + esc(tbnAgo(noteStamp(n))) + "</span></li>";
    }).join("");
    const more = inside.length > 8 ? '<button type="button" class="tbn-more" data-more="' + esc(dir) + '">' + (showAll ? "Show fewer" : "Show all " + inside.length) + "</button>" : "";
    return '<section class="tbd-panel tbn-folder ora"><header class="tbd-head"><h3><i></i><span class="tbn-fname" title="' + esc(dir) + '">' + esc(dir) + "</span></h3>" +
      '<span class="tbd-count">' + inside.length + "</span>" +
      '<button type="button" class="tbn-act" data-newin="' + esc(dir) + '" title="New note in ' + esc(dir) + '">+ New note</button>' +
      '<button type="button" class="tbn-act tbn-unpinf" data-unpin-folder="' + esc(dir) + '" title="Unpin ' + esc(dir) + '" aria-label="Unpin ' + esc(dir) + '">' + ico("starFill") + "</button></header>" +
      (inside.length ? '<ol class="tbn-rows">' + rows + "</ol>" + more : '<p class="tbd-empty">No notes in this folder yet.</p>') + "</section>";
  }).join("");
  const foldersP = folderPanels ? '<div class="tbn-folders">' + folderPanels + "</div>" :
    '<section class="tbd-panel tbn-nofolders ora"><header class="tbd-head"><h3><i></i>Pinned folders</h3></header><p class="tbd-empty">' +
    (state.backend === "folder" ? "No pinned folders yet. Hover a folder in the sidebar and click its <b>\u2606</b> to give it a panel here."
      : "Folders come with a vault folder: open one (Open folder, bottom left) and pinned folders get a panel here.") + "</p></section>";
  /* ---- recent ---- */
  const recent = state.notes.filter(function (n) { return !pinned[String(n.id)] && !/^template\s*:/i.test(n.title || ""); })
    .sort(function (a, b) { return noteStamp(b) - noteStamp(a); }).slice(0, 6);
  const recentP = '<section class="tbd-panel tbn-recent vio"><header class="tbd-head"><h3><i></i>Recent notes</h3></header>' +
    (recent.length ? '<ol class="tbn-rows">' + recent.map(function (n) {
      const dir = tbnFolderOf(n);
      return '<li class="tbn-row" data-open="' + esc(String(n.id)) + '" tabindex="0" role="button"><span class="tbn-row-t">' + (dir ? '<span class="tbn-sub">' + esc(dir) + "/</span>" : "") + esc(n.title) + "</span>" +
        '<button type="button" class="tbn-pinme" data-pin="' + esc(String(n.id)) + '" title="Pin" aria-label="Pin ' + esc(n.title) + '">' + ico("star") + "</button>" +
        '<span class="tbn-when">' + esc(tbnAgo(noteStamp(n))) + "</span></li>";
    }).join("") + "</ol>" : '<p class="tbd-empty">No notes yet.</p>') + "</section>";
  box.innerHTML = modes + pinnedP + foldersP + recentP;
}
function tbBuild(p) {
  const root = tbEl("div", "tb");
  root.tabIndex = -1;
  root.innerHTML =
    '<header class="tb-top">' +
      '<div class="tb-titlerow"><h2>Task board</h2><span class="tb-date"></span>' +
        '<span class="tb-summary"><b class="tb-sTime">0 min</b> logged today \u00b7 <b class="tb-sDone">0</b> done \u00b7 <b class="tb-sOpen">0</b> to do</span>' +
        '<span class="tb-actions">' +
        '<span class="tb-qa-row"><button type="button" class="tb-qa tb-qa--primary" data-qa="task" title="Add a task">+ Task</button>' +
          '<span class="tb-qa-group" role="group" aria-label="New note"><span class="tb-qa-lbl">New note</span>' +
          '<button type="button" class="tb-qa" data-qa="inc" title="New note from the Incident template"><span class="tb-long">Incident note</span><span class="tb-short">Incident</span></button>' +
          '<button type="button" class="tb-qa" data-qa="chg" title="New note from the Change / downtime template"><span class="tb-long">Change note</span><span class="tb-short">Change</span></button>' +
          '<button type="button" class="tb-qa" data-qa="daily" title="Today\u2019s daily note (Ctrl+Alt+D)"><span class="tb-long">Daily note</span><span class="tb-short">Daily</span></button></span></span>' +
        '<span class="tb-views" role="tablist" aria-label="View"><button type="button" class="tb-view" data-view="dash" role="tab">Dashboard</button><button type="button" class="tb-view" data-view="notes" role="tab">Notes</button><button type="button" class="tb-view" data-view="board" role="tab">Board</button></span>' +
        '<button type="button" class="tb-ghost tb-pin" aria-pressed="false" title="Open the board whenever CarbonFibre starts">Pin</button></span></div>' +
      '<div class="tb-now">' +
        '<div class="tb-now-main"><div class="tb-lbl">Working on</div><h3 class="tb-runname"></h3><div class="tb-meta"></div></div>' +
        '<div class="tb-now-clock"><span class="tb-clock">0:00:00</span><span class="tb-est"></span><div class="tb-bar"><i></i></div></div>' +
        '<div class="tb-ctl">' +
          '<button type="button" class="tb-btn tb-btn--primary tb-done">Done</button>' +
          '<button type="button" class="tb-btn tb-pause">Pause</button>' +
          '<button type="button" class="tb-btn tb-hold">Waiting</button>' +
          '<button type="button" class="tb-btn tb-stop" title="Back to To do, keeping the time so far">Stop for now</button>' +
          '<button type="button" class="tb-btn tb-note">Open note</button>' +
          '<button type="button" class="tb-btn tb-ticket">Open ticket</button>' +
        '</div>' +
      '</div>' +
      '<div class="tb-undo" hidden><span class="tb-undo-msg"></span><button type="button" class="tb-ghost tb-undo-btn">Undo</button></div>' +
      '<div class="tb-filters" role="group" aria-label="Show">' + [["all", "Everything"], ["inc", "Incidents"], ["ptask", "Problem tasks"], ["chg", "Changes"],
        ["ctask", "Change tasks"], ["sctask", "Catalog tasks"], ["ritm", "Requests"], ["stsk", "Story tasks"]].map(function (f) {
        return '<button type="button" class="tb-chip" data-f="' + f[0] + '" aria-pressed="false">' + f[1] + "</button>"; }).join("") + '</div>' +
    '</header>' +
    '<main class="tb-board">' + TB_LANES.map(function (l) {
      return '<section class="tb-lane tb-lane--' + l[0] + '" data-drop="' + l[0] + '"><div class="tb-lane__head"><span class="dot"></span><h4>' + l[1] +
        '</h4><span class="tb-count" data-count="' + l[0] + '"></span></div>' +
        (l[0] === "open" ? '<form class="tb-quick"><input class="tb-quick-in" name="quick" autocomplete="off" spellcheck="false" ' +
          'placeholder="Add a task\u2026" title="Type the ticket, what it is and a time, then Enter. For example: INC0012345 Splunk HEC down 30m" aria-label="Add a task: ticket number, what it is, and an estimate"></form>' : "") +
        '<div class="tb-cards" data-lane="' + l[0] + '"></div></section>'; }).join("") +
    '</main>' +
    '<main class="tb-dash" hidden></main>' +
    '<main class="tb-notes" hidden></main>' +
    '<div class="tb-menu" hidden role="menu"></div>';
  const $ = function (s) { return root.querySelector(s); };
  $(".tb-quick").addEventListener("submit", function (e) {
    e.preventDefault();
    const inp = $(".tb-quick-in"), q = tbParseQuick(inp.value);
    if (!q) return;
    tbAdd(q.id, q.name, q.est);
    inp.value = ""; inp.focus();
  });
  $(".tb-pin").addEventListener("click", function () { tb.pinned = !tb.pinned; tb.pinnedPane = Math.max(0, panes.indexOf(p)); tbSave(); tbRenderAll(); });
  $(".tb-pause").addEventListener("click", function () { if (timer && timer.boardUid) { timerPause(); tbRenderAll(); } });
  $(".tb-stop").addEventListener("click", function () { tbStopAs("open"); });
  $(".tb-hold").addEventListener("click", function () { tbStopAs("held"); });
  $(".tb-done").addEventListener("click", function () { tbStopAs("done"); });
  $(".tb-note").addEventListener("click", function () { tbOpenNote(tbRunning(), p); });
  $(".tb-ticket").addEventListener("click", function () { const u = tbTicketUrl(tbRunning()); if (u) window.open(u, "_blank", "noopener"); else tbSetSnowBase(); });
  $(".tb-undo-btn").addEventListener("click", tbUndoRemove);
  root.querySelectorAll(".tb-chip").forEach(function (c) { c.addEventListener("click", function () { tb.filter = c.dataset.f; tbSave(); tbRenderAll(); }); });
  root.querySelectorAll(".tb-view").forEach(function (v) { v.addEventListener("click", function () { tb.view = v.dataset.view; tbSave(); tbRenderAll(); p.renderTabs(); }); });
  /* dashboard clicks: a ticket row opens its card on the board, a note link the note, quick actions */
  const notesBox = root.querySelector(".tb-notes");
  const findN = function (id) { return state.notes.filter(function (x) { return String(x.id) === id; })[0]; };
  notesBox.addEventListener("input", function (e) {
    if (e.target.classList.contains("tbn-search")) { tbnState(p).q = e.target.value; tbnRenderResults(p); }
  });
  notesBox.addEventListener("change", function (e) {
    const st = tbnState(p);
    if (e.target.classList.contains("tbn-textcb")) { st.text = e.target.checked; tbnRenderResults(p); return; }
    if (e.target.classList.contains("tbn-group")) { st.group = tb.libGroup = e.target.value; tbSave(); tbnRenderResults(p); return; }
    if (e.target.dataset.sel) { if (e.target.checked) st.sel[e.target.dataset.sel] = 1; else delete st.sel[e.target.dataset.sel]; tbnRenderResults(p); return; }
    if (e.target.dataset.selall) {
      const on = e.target.checked;
      Array.prototype.forEach.call(notesBox.querySelectorAll("[data-sel]"), function (cb) { if (on) st.sel[cb.dataset.sel] = 1; else delete st.sel[cb.dataset.sel]; });
      tbnRenderResults(p);
    }
  });
  notesBox.addEventListener("click", function (e) {
    let el;
    if ((el = e.target.closest("[data-nmode]"))) { tb.notesMode = el.dataset.nmode; tbSave(); tbRenderNotes(p); return; }
    if ((el = e.target.closest("[data-chip]"))) { tbnState(p).chip = el.dataset.chip; tbRenderNotes(p); return; }
    if ((el = e.target.closest("[data-ntype]"))) { tbnState(p).type = el.dataset.ntype; tbRenderNotes(p); return; }
    if ((el = e.target.closest("th[data-sort]"))) { const st0 = tbnState(p), k = el.dataset.sort; st0.dir = st0.sort === k ? -st0.dir : (k === "title" || k === "folder" ? 1 : -1); st0.sort = k; tbnRenderResults(p); return; }
    if ((el = e.target.closest("[data-bulk]"))) { tbnBulk(p, el.dataset.bulk, el); return; }
    if (e.target.closest(".tbn-cb, .tbn-tools, .tbn-chips")) return;
    if ((el = e.target.closest("[data-unpin]"))) { e.stopPropagation(); const un = findN(el.dataset.unpin); if (un) togglePin(un); return; }
    if ((el = e.target.closest("[data-pin]"))) { e.stopPropagation(); const pn = findN(el.dataset.pin); if (pn) togglePin(pn); return; }
    if ((el = e.target.closest("[data-unpin-folder]"))) { toggleFolderPin(el.dataset.unpinFolder); return; }
    if ((el = e.target.closest("[data-newin]"))) { createNote(el.dataset.newin); return; }
    if ((el = e.target.closest("[data-more]"))) { p.tbnOpen = p.tbnOpen || {}; p.tbnOpen[el.dataset.more] = !p.tbnOpen[el.dataset.more]; tbRenderNotes(p); return; }
    if ((el = e.target.closest("[data-open]"))) { const on = findN(el.dataset.open); if (on) tbnOpenBeside(p, on, e.shiftKey); }
  });
  notesBox.addEventListener("keydown", function (e) {
    const el = e.target.closest("[data-open]");
    if (el && (e.key === "Enter" || e.key === " ") && e.target === el) { e.preventDefault(); el.click(); }
  });
  root.querySelector(".tb-top").addEventListener("click", function (e) {
    const q = e.target.closest("[data-qa]");
    if (!q) return;
    const a = q.dataset.qa;
    if (a === "task") { tb.view = "board"; tbSave(); tbRenderAll(); setTimeout(function () { const i = root.querySelector(".tb-quick-in"); if (i) i.focus(); }, 0); }
    else if (a === "inc") newFromTemplate(TEMPLATES[0]);
    else if (a === "chg") newFromTemplate(TEMPLATES[1]);
    else if (a === "daily") openDailyNote();
  });
  root.querySelector(".tb-dash").addEventListener("click", function (e) {
    const go = e.target.closest("[data-start], [data-done]");
    if (go) { const tt = tbFind(go.dataset.start || go.dataset.done); if (go.dataset.start) tbStart(tt); else tbMove(tt, "done"); return; }
    const nb = e.target.closest(".tbd-note");
    if (nb) { const nn = state.notes.filter(function (x) { return String(x.id) === nb.dataset.note; })[0]; if (nn) openInPane(nn.id, p); return; }
    if (e.target.closest("a")) return;
    const q = e.target.closest("[data-qa]");
    if (q) {
      const a = q.dataset.qa;
      if (a === "task" || a === "board") { tb.view = "board"; tbSave(); tbRenderAll(); if (a === "task") setTimeout(function () { const i = root.querySelector(".tb-quick-in"); if (i) i.focus(); }, 0); }
      else if (a === "inc") newFromTemplate(TEMPLATES[0]);
      else if (a === "chg") newFromTemplate(TEMPLATES[1]);
      else if (a === "daily") openDailyNote();
      return;
    }
    const row = e.target.closest("tr[data-uid]");
    if (row) {
      tb.view = "board"; tbSave(); tbRenderAll();
      const c = root.querySelector('.tb-card[data-uid="' + row.dataset.uid + '"]');
      if (c) { c.scrollIntoView({ block: "center" }); c.focus(); c.classList.add("flash"); setTimeout(function () { c.classList.remove("flash"); }, 1200); }
    }
  });
  /* drag cards between lanes */
  root.querySelectorAll("[data-drop]").forEach(function (lane) {
    lane.addEventListener("dragover", function (e) {
      const ty = e.dataTransfer.types, isTask = Array.prototype.indexOf.call(ty, "text/x-cf-task") !== -1, isNote = Array.prototype.indexOf.call(ty, "text/x-cf-note") !== -1;
      if (!isTask && !isNote) return;
      e.preventDefault(); e.dataTransfer.dropEffect = isNote ? "copy" : "move"; lane.classList.add("drop-on");
    });
    lane.addEventListener("dragleave", function (e) { if (!lane.contains(e.relatedTarget)) lane.classList.remove("drop-on"); });
    lane.addEventListener("drop", function (e) {
      lane.classList.remove("drop-on");
      const noteId = e.dataTransfer.getData("text/x-cf-note");
      if (noteId) {                                   /* a note from the sidebar */
        e.preventDefault();
        const nn = state.notes.filter(function (x) { return String(x.id) === noteId; })[0];
        if (nn) tbAddNoteTask(nn, lane.dataset.drop);
        return;
      }
      const uid = e.dataTransfer.getData("text/x-cf-task");
      if (!uid) return;
      e.preventDefault();
      tbMove(tbFind(uid), lane.dataset.drop);
    });
  });
  /* keyboard on a focused card: Enter starts it, Delete removes it (undoable) */
  root.addEventListener("keydown", function (e) {
    if (e.target.closest(".tb-edit, .tb-quick")) return;
    const card = e.target.closest && e.target.closest(".tb-card");
    if (!card) { if (e.key === "Escape") tbMenuClose(root); return; }
    const t = tbFind(card.dataset.uid);
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); tbRemoveWithUndo(t); }
    else if (e.key === "Enter" && e.target === card) { e.preventDefault(); tbStart(t); }
  });
  document.addEventListener("mousedown", function (e) { if (!root.querySelector(".tb-menu").hidden && !e.target.closest(".tb-menu, .tb-more")) tbMenuClose(root); });
  p.root.appendChild(root);
  return root;
}
function tbMenuClose(root) { const m = root.querySelector(".tb-menu"); m.hidden = true; m.replaceChildren(); }
function tbMenuOpen(p, t, anchor) {
  const root = p.tbRoot, m = root.querySelector(".tb-menu");
  m.replaceChildren();
  const item = function (label, fn, cls) {
    const b = tbEl("button", "tb-menu-item" + (cls ? " " + cls : ""), label);
    b.type = "button"; b.setAttribute("role", "menuitem");
    b.addEventListener("click", function () { tbMenuClose(root); fn(); });
    m.appendChild(b);
  };
  item("Edit", function () { tbEditing = t.uid; tbRenderAll(); });
  if (t.noteId != null && findNote(t.noteId)) {
    item("Open note", function () { tbOpenNote(t, p); });
    item("Change linked note\u2026", function () { tbPickNoteFor(t); });
    item("Unlink note", function () { tbUnlinkNote(t); });
  } else {
    item("Link to a note\u2026", function () { tbPickNoteFor(t); });
    item("Create a note for it", function () { tbOpenNote(t, p); });
  }
  if (tbTicketUrl(t)) item("Open in ServiceNow", function () { window.open(tbTicketUrl(t), "_blank", "noopener"); });
  if (t.state !== "open") item("Move to To do", function () { tbMove(t, "open"); });
  if (t.state !== "held" && t.state !== "done") item("Move to Waiting", function () { tbMove(t, "held"); });
  item("Remove", function () { tbRemoveWithUndo(t); }, "tb-menu-danger");
  const r = anchor.getBoundingClientRect(), rr = root.getBoundingClientRect();
  m.hidden = false;
  m.style.top = (r.bottom - rr.top + 4) + "px";
  m.style.left = Math.max(8, Math.min(rr.width - m.offsetWidth - 8, r.right - rr.left - m.offsetWidth)) + "px";
  m.firstChild.focus();
}
function tbCard(t, p) {
  const card = tbEl("div", "tb-card tb-card--" + t.state);
  card.dataset.uid = t.uid; card.tabIndex = 0; card.draggable = tbEditing !== t.uid;
  card.setAttribute("aria-label", t.id + ", " + t.name);
  card.addEventListener("dragstart", function (e) { e.dataTransfer.setData("text/x-cf-task", t.uid); e.dataTransfer.effectAllowed = "move"; card.classList.add("dragging"); });
  card.addEventListener("dragend", function () { card.classList.remove("dragging"); });
  /* double-click anywhere on a card (not its buttons or links) to edit it: on a narrow card the hover
     buttons cover part of the name */
  card.addEventListener("dblclick", function (e) {
    if (tbEditing === t.uid || e.target.closest(".tb-acts, a, button, input, .tb-edit")) return;
    tbEditing = t.uid; tbRenderAll();
  });
  card.addEventListener("dragover", function (e) {
    if (Array.prototype.indexOf.call(e.dataTransfer.types, "text/x-cf-note") === -1) return;
    e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "link";
    card.classList.add("link-on");
    const lane = card.closest("[data-drop]"); if (lane) lane.classList.remove("drop-on");
  });
  card.addEventListener("dragleave", function (e) { if (!card.contains(e.relatedTarget)) card.classList.remove("link-on"); });
  card.addEventListener("drop", function (e) {
    const noteId = e.dataTransfer.getData("text/x-cf-note");
    card.classList.remove("link-on");
    if (!noteId) return;
    e.preventDefault(); e.stopPropagation();
    const n = state.notes.filter(function (x) { return String(x.id) === noteId; })[0];
    if (n) tbLinkNote(t, n);
  });
  const body = tbEl("div", "tb-cardbody");
  /* top: ticket and kind on the left, time on the right */
  const top = tbEl("div", "tb-cardtop"), url = tbTicketUrl(t); let idEl;
  if (url) { idEl = tbEl("a", "id", t.id); idEl.href = url; idEl.target = "_blank"; idEl.rel = "noopener noreferrer"; idEl.title = "Open " + t.id + " in ServiceNow"; idEl.draggable = false; }
  else idEl = tbEl("span", "id", t.id);
  const mins = tbMinutes(t), over = t.est > 0 && mins > t.est;
  const sm = tbMinShort;
  const timeTxt = t.state === "done" ? sm(mins) : mins >= 1 ? (over ? sm(mins - t.est) + " over" : sm(mins) + " / " + sm(t.est)) : t.est ? "~" + sm(t.est) : "";
  const sq = tbEl("span", "tb-typesq"); sq.style.background = tbTypeHex(t.type); sq.title = TB_KIND[t.type] || "Task";
  top.append(sq, idEl, tbEl("span", "kind", TB_KIND[t.type] || "Task"), tbEl("span", "t" + (over && t.state !== "done" ? " over" : ""), timeTxt));
  body.appendChild(top);
  if (tbEditing === t.uid) {
    /* edit in place: name and estimate */
    const f = tbEl("form", "tb-edit");
    const nIn = tbEl("input", "tb-edit-name"); nIn.value = t.name; nIn.setAttribute("aria-label", "Task name");
    const eIn = tbEl("input", "tb-edit-est"); eIn.type = "number"; eIn.min = "0"; eIn.step = "5"; eIn.value = t.est; eIn.setAttribute("aria-label", "Estimate in minutes");
    const save = tbEl("button", "tb-btn tb-btn--primary", "Save"); save.type = "submit";
    const cancel = tbEl("button", "tb-btn", "Cancel"); cancel.type = "button";
    f.append(nIn, tbEl("span", "tb-edit-unit", "min"), eIn, save, cancel);
    f.addEventListener("submit", function (e) { e.preventDefault(); t.name = nIn.value.trim() || t.name; t.est = Math.max(0, parseInt(eIn.value, 10) || 0); tbEditing = null; tbSave(); tbRenderAll(); });
    cancel.addEventListener("click", function () { tbEditing = null; tbRenderAll(); });
    f.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.stopPropagation(); tbEditing = null; tbRenderAll(); } });
    body.appendChild(f);
    setTimeout(function () { nIn.focus(); nIn.select(); }, 0);
  } else {
    const name = tbEl("div", "name", t.name);
    name.title = "Double-click to edit";
    name.addEventListener("dblclick", function () { tbEditing = t.uid; tbRenderAll(); });
    body.appendChild(name);
  }
  if (t.est > 0 && mins >= 1 && t.state !== "done") {
    const bar = tbEl("div", "tb-cardbar" + (over ? " over" : "")), fill = tbEl("i");
    fill.style.width = Math.min(100, mins / t.est * 100) + "%";
    bar.appendChild(fill); body.appendChild(bar);
  }
  /* bottom: the note, and what you can do with the card */
  const foot = tbEl("div", "tb-cardfoot"), n = t.noteId != null ? findNote(t.noteId) : null;
  const noteBtn = tbEl("button", "tb-notelink" + (n ? "" : " none"), n ? n.title : "Link a note\u2026");
  noteBtn.type = "button"; noteBtn.title = n ? "Open the note" : "Link an existing note to this task (or drag one onto the card)";
  noteBtn.addEventListener("click", function () { if (n) tbOpenNote(t, p); else tbPickNoteFor(t); });
  /* small icon buttons beside the name; the word is the label (hover, screen readers) */
  const acts = tbEl("div", "tb-acts");
  const act = function (icon, label, cls, fn, hint) {
    const b = tbEl("button", "tb-act " + cls, icon); b.type = "button";
    b.setAttribute("aria-label", label + " " + t.id); b.title = hint || label; b.dataset.label = label;
    b.addEventListener("click", fn); acts.appendChild(b); return b;
  };
  if (t.state === "open" || t.state === "held") {
    act("\u25b6", "Start", "tb-start", function () { tbStart(t); }, "Start the clock");
    act("\u2713", "Done", "tb-todone", function () { tbMove(t, "done"); });
  } else if (t.state === "run") {
    const paused = timer && timer.pausedAt;
    act(paused ? "\u25b6" : "\u275a\u275a", paused ? "Resume" : "Pause", "tb-cardpause", function () { timerPause(); tbRenderAll(); });
    act("\u2713", "Done", "tb-todone", function () { tbMove(t, "done"); });
  } else act("\u21ba", "Reopen", "tb-reopen", function () { tbMove(t, "open"); }, "Back to To do");
  if (!n && t.state !== "done") act("\u21b3", "Link a note", "tb-linknote", function () { tbPickNoteFor(t); }, "Link an existing note (or drag one onto the card)");
  const more = act("\u22ef", "More", "tb-more", function (e) { e.stopPropagation(); tbMenuOpen(p, t, more); }, "More");
  more.setAttribute("aria-label", "More actions for " + t.id); more.setAttribute("aria-haspopup", "menu");
  /* two rows: ticket and time, then the name with the buttons beside it; a linked note adds a slim
     line (an unlinked card offers "Link a note..." only on hover) */
  const nameEl = body.querySelector(".name");
  if (nameEl) { const mid = tbEl("div", "tb-cardmid"); body.insertBefore(mid, nameEl); mid.append(nameEl, acts); }
  else body.appendChild(acts);
  foot.appendChild(noteBtn);
  body.appendChild(foot);
  card.appendChild(body);
  return card;
}
function tbRender(p) {
  const root = p.tbRoot;
  if (!root) return;
  tb.tasks.forEach(function (t) { if (t.state === "run" && !(timer && timer.boardUid === t.uid)) t.state = "open"; });
  const today = tbDay(), $ = function (s) { return root.querySelector(s); };
  const view = tb.view === "board" ? "board" : tb.view === "notes" ? "notes" : "dash";
  root.querySelectorAll(".tb-view").forEach(function (v) { const on = v.dataset.view === view; v.setAttribute("aria-selected", String(on)); v.classList.toggle("on", on); });
  $(".tb-board").hidden = view !== "board"; $(".tb-dash").hidden = view !== "dash"; $(".tb-notes").hidden = view !== "notes";
  root.classList.toggle("tb-on-dash", view !== "board");             /* the summary line repeats the figure cards there */
  if (view === "notes") tbRenderNotes(p);
  $(".tb-titlerow h2").textContent = view === "notes" ? "Notes" : "Task board";
  $(".tb-filters").style.display = view === "board" ? "" : "none";
  if (view === "dash") tbRenderDash(p);
  const visible = function (t) { return t.state !== "done" || t.clearedAt === today; };
  const fam = { prb: "inc", stry: "stsk" };
  TB_LANES.forEach(function (l) {
    const lane = l[0];
    const rows = tb.tasks.filter(function (t) { return t.state === lane && visible(t) && (tb.filter === "all" || t.type === tb.filter || fam[t.type] === tb.filter); });
    const box = root.querySelector('[data-lane="' + lane + '"]');
    box.replaceChildren.apply(box, rows.map(function (t) { return tbCard(t, p); }));
    if (!rows.length) box.appendChild(tbEl("div", "tb-empty", l[2]));
    root.querySelector('[data-count="' + lane + '"]').textContent = rows.length || "";
  });
  root.querySelectorAll(".tb-chip").forEach(function (c) { c.setAttribute("aria-pressed", String(c.dataset.f === tb.filter)); });
  const pin = $(".tb-pin");
  pin.setAttribute("aria-pressed", String(!!tb.pinned)); pin.textContent = tb.pinned ? "Pinned" : "Pin";
  $(".tb-date").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  $(".tb-sOpen").textContent = tb.tasks.filter(function (t) { return t.state === "open"; }).length;
  $(".tb-sDone").textContent = tb.tasks.filter(function (t) { return t.state === "done" && t.clearedAt === today; }).length;
  const run = tbRunning();
  root.querySelector(".tb-now").classList.toggle("idle", !run);
  $(".tb-runname").textContent = run ? run.name : "Nothing on the go";
  const meta = $(".tb-meta");
  meta.replaceChildren();
  if (run) {
    meta.append(tbEl("span", "id", run.id), tbEl("span", "", " \u00b7 " + (TB_KIND[run.type] || "Task")));
    const rn = run.noteId != null && findNote(run.noteId);
    if (rn) meta.append(tbEl("span", "", " \u00b7 " + rn.title));
  } else meta.textContent = "Press Start on a card when you begin. The clock runs from there.";
  root.querySelectorAll(".tb-ctl button").forEach(function (bt) { bt.disabled = !run; });
  $(".tb-ticket").disabled = !run;                          /* with no ServiceNow address set, it asks for one */
  $(".tb-ticket").title = run && !tbTicketUrl(run) ? "Set your ServiceNow address to open tickets" : "Open the ticket in ServiceNow";
  const ub = $(".tb-undo");
  ub.hidden = !tbUndo;
  if (tbUndo) $(".tb-undo-msg").textContent = "Removed " + tbUndo.task.id + " \u201c" + tbUndo.task.name + "\u201d.";
  tbTick(p);
}
/* the clock: only the text and bars change each second */
function tbTick(p) {
  const root = p.tbRoot;
  if (!root) return;
  const run = tbRunning(), $ = function (s) { return root.querySelector(s); };
  const secs = run ? Math.floor(tbMinutes(run) * 60) : 0, est = run ? run.est * 60 : 0, over = run && est > 0 && secs > est;
  const clock = $(".tb-clock"), bar = $(".tb-bar");
  clock.textContent = Math.floor(secs / 3600) + ":" + String(Math.floor(secs % 3600 / 60)).padStart(2, "0") + ":" + String(secs % 60).padStart(2, "0");
  clock.classList.toggle("over", !!over); bar.classList.toggle("over", !!over);
  bar.firstElementChild.style.width = (run && est > 0 ? Math.min(100, secs / est * 100) : 0) + "%";
  $(".tb-est").textContent = !run ? "" : over ? tbMin((secs - est) / 60) + " over the estimate" : run.est ? "of about " + tbMin(run.est) : "";
  $(".tb-pause").textContent = timer && timer.pausedAt ? "Resume" : "Pause";
  const logged = timerToday().reduce(function (s, e) { return s + e.actual; }, 0) + (timer ? timerElapsed() : 0);
  if (tb.view !== "board" && run && (!p.tbDashAt || Date.now() - p.tbDashAt > 30000)) { p.tbDashAt = Date.now(); tbRenderDash(p); }
  $(".tb-sTime").textContent = tbMin(logged / 60000);
  if (run) {
    const card = root.querySelector('.tb-card[data-uid="' + run.uid + '"]');
    if (card) {
      const m = tbMinutes(run), o = run.est > 0 && m > run.est, t = card.querySelector(".t");
      if (t) { t.textContent = m >= 1 ? (o ? tbMinShort(m - run.est) + " over" : tbMinShort(m) + " / " + tbMinShort(run.est)) : "just started"; t.classList.toggle("over", o); }
      const cb = card.querySelector(".tb-cardbar i");
      if (cb && run.est > 0) { cb.style.width = Math.min(100, m / run.est * 100) + "%"; cb.parentNode.classList.toggle("over", o); }
    }
  }
}
/* pinned: the board opens on launch, in the pane it last occupied (after the session is back) */
function tbLaunchPin() {
  if (!tb.pinned) return;
  setTimeout(function () {
    if (panes.some(function (q) { return q.type === "taskboard"; })) return;
    tbOpenInPane(panes[Math.max(0, Math.min(tb.pinnedPane || 0, panes.length - 1))]);
  }, 150);
}
function tbRenderAll() { panes.forEach(function (q) { if (q.type === "taskboard") tbRender(q); }); }
function tbTickAll() { panes.forEach(function (q) { if (q.type === "taskboard") tbTick(q); }); }
function tbOpenInPane(p) {
  if (!p) return;
  if (p.type === "sheet") { flushSheets(); if (p.grid) p.grid.root.classList.remove("show"); }
  if (p.type === "sketch" && typeof skReleasePane === "function") skReleasePane(p);
  if (p.type === "note") { p.sync(); p.deactivate(); }
  if (!p.tbRoot) p.tbRoot = tbBuild(p);
  p.type = "taskboard";
  p.render();
  p.focusThis();
  tbRender(p);
  scheduleSession();
}
function tbClosePane(p) {
  if (p.tbRoot) p.tbRoot.classList.remove("show");
  p.type = "note";
  p.open(p.noteId != null && findNote(p.noteId) ? p.noteId : p.tabs[0]);
}
/* show the board: switch to it if it is open somewhere, otherwise open it in the focused pane */
function tbShow() {
  const open = panes.filter(function (q) { return q.type === "taskboard"; })[0];
  if (open) { open.focusThis(); return open; }
  const p = focusedPane || panes[0];
  tbOpenInPane(p);
  return p;
}
function tbToggle() {
  const p = focusedPane || panes[0];
  if (p.type === "taskboard") tbClosePane(p); else tbShow();
}
/* add the note in front of you as a task: the ticket number from its title or first lines */
function tbAddCurrentNote() {
  const p = focusedPane || panes[0], n = p && p.type === "note" ? p.note() : null;
  if (!n) { pushToastLike("Open a note first."); return; }
  tbAddNoteTask(n);
}
/* link an existing task to an existing note (any name); the card's note link then opens it */
function tbLinkNote(t, n) {
  if (!t || !n) return;
  t.noteId = n.id;
  tbSave(); tbRenderAll();
  pushToastLike("Linked " + t.id + " to \u201c" + n.title + "\u201d.");
}
function tbUnlinkNote(t) {
  if (!t) return;
  t.noteId = null;
  tbSave(); tbRenderAll();
  pushToastLike("Unlinked the note from " + t.id + ".");
}
function tbPickNoteFor(t) {
  palPick("note", function (n) { tbLinkNote(t, n); }, "Link " + t.id + " to which note? Type to search");
}
/* a task for note n: ticket and name from its title (or the top of the note), linked to it; dropped
   on a lane it starts there (Working on starts the clock) */
function tbAddNoteTask(n, lane) {
  const existing = tb.tasks.filter(function (t) { return sameId(t.noteId, n.id) && t.state !== "done"; })[0];
  if (existing) { if (lane && lane !== existing.state) tbMove(existing, lane); pushToastLike("That note is already on the board."); return existing; }
  const m = /\b(SCTASK|PTASK|CTASK|STSK|STRY|RITM|INC|CHG|PRB)\d+\b/i.exec(n.title + "\n" + n.content.slice(0, 600));
  const id = m ? m[0].toUpperCase() : "";
  const name = n.title.replace(id ? new RegExp("\\b" + id + "\\b", "i") : /$^/, "").replace(/^[\s\-:\u2014]+|[\s\-:\u2014]+$/g, "") || n.title;
  const t = tbAdd(id || "TASK", name, timePrefs.minutes, n.id) || tb.tasks[tb.tasks.length - 1];
  if (t && lane && lane !== "open") tbMove(t, lane);
  pushToastLike("Added " + (id || n.title) + " to the task board.");
  return t;
}

const TIMER_KEY = "carbonfibre-timer", TIMELOG_KEY = "carbonfibre-timelog", TIMEPREF_KEY = "carbonfibre-timeprefs";
let timer = null;             /* { task, noteId, planned, startedAt, pausedMs, pausedAt, alerted } */
let timeLog = [];
const timePrefs = { minutes: 25, logToNote: false, sound: true };
let timerTick = null, timerAudio = null; // eslint-disable-line prefer-const -- reassigned in 37-taskboard-the-chime-two-soft-ton.js

try { timer = JSON.parse(localStorage.getItem(TIMER_KEY) || "null"); } catch (e) { timer = null; }
try { timeLog = JSON.parse(localStorage.getItem(TIMELOG_KEY) || "[]") || []; } catch (e) { timeLog = []; }
try { const tp = JSON.parse(localStorage.getItem(TIMEPREF_KEY) || "null"); if (tp) for (const k in tp) timePrefs[k] = tp[k]; } catch (e) {}

function timerSave() { storeSet(TIMER_KEY, JSON.stringify(timer)); }
function timeLogSave() { storeSet(TIMELOG_KEY, JSON.stringify(timeLog.slice(-500))); }
function timePrefsSave() { storeSet(TIMEPREF_KEY, JSON.stringify(timePrefs)); }

/* Elapsed time comes from the wall clock, not from counting ticks: browsers slow timers in
   background tabs, so a tick counter drifts, but Date.now() stays right. It also means a
   running block survives a refresh. */
function timerElapsed() {
  if (!timer) return 0;
  const paused = timer.pausedMs + (timer.pausedAt ? Date.now() - timer.pausedAt : 0);
  return Math.max(0, Date.now() - timer.startedAt - paused);
}
function fmtClock(ms) {
  const t = Math.floor(Math.abs(ms) / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const mm = (h ? String(m).padStart(2, "0") : String(m)), ss = String(s).padStart(2, "0");
  return (h ? h + ":" : "") + mm + ":" + ss;
}
function fmtMins(ms) { return Math.round(ms / 60000) + " min"; }
function hhmm(t) { const d = new Date(t); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }

