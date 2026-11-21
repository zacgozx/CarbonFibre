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
      tasks: tbnOpenTasks(n), pinned: !!pinned[String(n.id)],
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
  const body = rows.slice(0, CAP).map(function (f) {
    const id = esc(String(f.n.id)), flags = (f.untitled ? '<span class="tbn-flag">untitled</span>' : "") + (f.empty ? '<span class="tbn-flag">empty</span>' : "");
    let ghead = "";
    if (groupOf) { const g = groupOf(f); if (g !== lastG) { ghead = '<tr class="tbn-grp"><td colspan="8">' + esc(g) + "<span>" + gCount[g] + "</span></td></tr>"; lastG = g; } }
    return ghead + '<tr data-open="' + id + '"' + (st.sel[String(f.n.id)] ? ' class="sel"' : "") + '><td class="tbn-cb"><input type="checkbox" data-sel="' + id + '"' + (st.sel[String(f.n.id)] ? " checked" : "") + ' aria-label="Select ' + esc(f.n.title) + '"></td>' +
      '<td class="tbn-t"><span class="tbn-tt">' + (f.pinned ? '<span class="tbn-pin" title="Pinned">' + ico("starFill") + "</span>" : "") + esc(f.n.title) + flags +
        f.tags.slice(0, 3).map(function (t) { return '<span class="tbn-tag">#' + esc(t) + "</span>"; }).join("") + "</span>" +
        (f.preview ? '<span class="tbn-pv2">' + esc(f.preview) + "</span>" : "") + "</td>" +
      '<td class="tbn-ty"><span class="tbn-type"><i class="tbn-tdot tc-' + noteTypeColour(f.type) + '"></i>' + f.type + "</span></td>" +
      '<td class="tbn-d">' + esc(f.dir || "\u2013") + "</td>" +
      '<td class="tbn-e' + (f.stale ? " stale" : "") + '">' + esc(tbnAgo(f.stamp)) + "</td>" +
      '<td class="tbn-w">' + f.words + "</td>" +
      '<td class="tbn-l" title="' + f.inN + " linking here, " + f.outN + ' links out">' + (f.inN || f.outN ? f.inN + " / " + f.outN : "\u2013") + "</td>" +
      '<td class="tbn-k">' + (f.tasks || "") + "</td></tr>";
  }).join("");
  const bulk = nSel ? '<div class="tbn-bulk"><b>' + nSel + " selected</b>" +
    '<button type="button" data-bulk="pin">Pin</button><button type="button" data-bulk="unpin">Unpin</button>' +
    (state.backend === "folder" ? '<button type="button" data-bulk="move">Move to folder\u2026</button>' : "") +
    '<button type="button" data-bulk="delete" class="danger">' + (state.backend === "folder" ? "Move to .trash" : "Delete") + '</button><button type="button" data-bulk="clear">Clear selection</button></div>' : "";
  box.innerHTML = bulk + (total ? '<div class="tbn-tablewrap"><table class="tbn-table"><thead><tr><th class="tbn-cb"><input type="checkbox" data-selall="1"' + (allOn ? " checked" : "") + ' aria-label="Select all shown"></th>' +
    head("title", "Note") + head("type", "Type") + head("folder", "Folder") + head("edited", "Edited") + head("words", "Words") + head("links", "Links in / out") + head("tasks", "Tasks") + "</tr></thead><tbody>" + body + "</tbody></table></div>" +
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
  if (other) openInPane(n.id, other); else openInPane(n.id, p);
}
/* the library, from anywhere: the Notes panel's All notes */
function openLibrary(mode) {
  tb.notesMode = mode || "all"; tbSave();
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
  const pinnedNotes = Object.keys(pinned).filter(function (k) { return k.indexOf("folder:") !== 0; })
    .map(function (k) { return state.notes.filter(function (n) { return String(n.id) === k; })[0]; }).filter(Boolean)
    .sort(function (a, b) { return noteStamp(b) - noteStamp(a); });
  const pinnedDirs = Object.keys(pinned).filter(function (k) { return k.indexOf("folder:") === 0; }).map(function (k) { return k.slice(7); }).sort(function (a, b) { return a.localeCompare(b); });
  const badge = function (n) {
    const k = tbnOpenTasks(n); let out = "";
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
      const sub = tbnFolderOf(n).slice(dir.length + 1), k = tbnOpenTasks(n);
      return '<li class="tbn-row" data-open="' + esc(String(n.id)) + '" tabindex="0" role="button"><span class="tbn-row-t">' + (sub ? '<span class="tbn-sub">' + esc(sub) + "/</span>" : "") + esc(n.title) + "</span>" +
        (k ? '<span class="tbn-todo">' + k + "</span>" : "") +
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
      '<div class="tb-titlerow"><h2>Notes</h2>' +
        '<button type="button" class="tb-pin" aria-pressed="false" aria-label="Pin the Notes panel" title="Pin: open the Notes panel whenever CarbonFibre starts"><svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M9.6 1.9l4.5 4.5-1.6.6-2.4 2.4-.4 3-1.2 1.2-2.6-2.6-3.3 3.3M4.3 7.6l1.2-1.2 3-.4 2.4-2.4.6-1.6"/></svg></button>' +
        '<span class="tb-date"></span>' +
        '<span class="tb-actions">' +
          '<span class="tb-qa-group" role="group" aria-label="New note"><span class="tb-qa-lbl">New note</span>' +
          '<button type="button" class="tb-qa" data-qa="inc" title="New note from the Incident template"><span class="tb-long">Incident note</span><span class="tb-short">Incident</span></button>' +
          '<button type="button" class="tb-qa" data-qa="chg" title="New note from the Change / downtime template"><span class="tb-long">Change note</span><span class="tb-short">Change</span></button>' +
          '<button type="button" class="tb-qa" data-qa="daily" title="Today\u2019s daily note (Ctrl+Alt+D)"><span class="tb-long">Daily note</span><span class="tb-short">Daily</span></button></span>' +
        '</span></div>' +
    '</header>' +
    '<main class="tb-notes"></main>';
  const $ = function (s) { return root.querySelector(s); };
  $(".tb-pin").addEventListener("click", function () { tb.pinned = !tb.pinned; tb.pinnedPane = Math.max(0, panes.indexOf(p)); tbSave(); tbRenderAll(); });
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
    if (a === "inc") newFromTemplate(TEMPLATES[0]);
    else if (a === "chg") newFromTemplate(TEMPLATES[1]);
    else if (a === "daily") openDailyNote();
  });
  p.root.appendChild(root);
  return root;
}
function tbRender(p) {
  const root = p.tbRoot;
  if (!root) return;
  tbRenderNotes(p);
  const pin = root.querySelector(".tb-pin");
  pin.setAttribute("aria-pressed", String(!!tb.pinned));
  pin.title = tb.pinned ? "Pinned: the Notes panel opens whenever CarbonFibre starts (click to unpin)" : "Pin: open the Notes panel whenever CarbonFibre starts";
  root.querySelector(".tb-date").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}
/* pinned: the Notes panel opens on launch, in the pane it last occupied (after the session is back) */
function tbLaunchPin() {
  if (!tb.pinned) return;
  setTimeout(function () {
    if (panes.some(function (q) { return q.type === "taskboard"; })) return;
    tbOpenInPane(panes[Math.max(0, Math.min(tb.pinnedPane || 0, panes.length - 1))]);
  }, 150);
}
function tbRenderAll() { panes.forEach(function (q) { if (q.type === "taskboard") tbRender(q); }); }
function tbOpenInPane(p) {
  if (!p) return;
  if (p.type === "note") { p.sync(); p.deactivate(); }
  leavePaneContent(p);
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
/* show the Notes panel: switch to it if it is open somewhere, otherwise open it in the focused pane */
function tbShow() {
  const open = panes.filter(function (q) { return q.type === "taskboard"; })[0];
  if (open) { open.focusThis(); return open; }
  const p = focusedPane || panes[0];
  tbOpenInPane(p);
  return p;
}
const TIMER_KEY = "carbonfibre-timer", TIMELOG_KEY = "carbonfibre-timelog", TIMEPREF_KEY = "carbonfibre-timeprefs";
let timer = null;             /* { task, noteId, planned, startedAt, pausedMs, pausedAt, alerted } */
let timeLog = [];
const timePrefs = { minutes: 25, logToNote: false, sound: true };
let timerTick = null, timerAudio = null; // eslint-disable-line prefer-const -- reassigned in 37-timer-chime.js

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

