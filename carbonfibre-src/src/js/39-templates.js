/* ============================================================
   Templates and daily notes. Built-in templates for incident, change / downtime, handover,
   meeting and daily notes, plus any note titled "Template: ..." (its text below the heading).
   Placeholders: {{date}} {{time}} {{weekday}} {{title}} {{ticket}} (the ticket number in the
   title), and {{cursor}} where the caret lands.
   ============================================================ */
const TEMPLATES = [
  { name: "Incident", ask: "Incident note title (ticket number first, e.g. INC0012345 Splunk HEC down)",
    body: "# {{title}}\n\n**Ticket:** {{ticket}}\n**Opened:** {{date}} {{time}}\n**Status:** In progress\n\n## Summary\n{{cursor}}\n\n## Impact\n- \n\n## Timeline\n- {{time}} Picked up\n\n## Actions taken\n- [ ] \n\n## Follow-up\n- [ ] " },
  { name: "Change / downtime", ask: "Change note title (e.g. CHG0031204 Payroll batch window)",
    body: "# {{title}}\n\n**Change:** {{ticket}}\n**Window:** {{date}} start to end\n**Requested by:** \n\n## Hosts and services\n- \n\n## Monitoring\n- [ ] Downtime scheduled in monitoring\n- [ ] Alerts suppressed for the window\n- [ ] Downtime removed after the change\n\n## Steps\n1. {{cursor}}\n\n## Rollback\n- \n\n## Checks after\n- [ ] " },
  { name: "Shift handover", title: "Shift handover {{date}}",
    body: "# Shift handover {{date}}\n\n## Open incidents\n- {{cursor}}\n\n## In progress\n- \n\n## Watch items\n- \n\n## Notes for next shift\n- " },
  { name: "Meeting", ask: "Meeting note title",
    body: "# {{title}}\n\n**Date:** {{date}} {{time}}\n**Attendees:** \n\n## Agenda\n- {{cursor}}\n\n## Decisions\n- \n\n## Actions\n- [ ] " },
  { name: "Daily note", title: "{{date}}",
    body: "# {{date}} {{weekday}}\n\n## Tasks\n- [ ] {{cursor}}\n\n## Tickets\n- \n\n## Log\n- {{time}} " }
];
/* built-ins, then your own: notes titled "Template: ..." */
function templateList() {
  const own = state.notes.filter(function (n) { return /^template\s*:/i.test(n.title || ""); }).map(function (n) {
    const name = n.title.replace(/^template\s*:\s*/i, ""), body = (n.content || "").replace(/^#[^\n]*\n+/, "");
    return { name: name, ask: "Title for the new \u201c" + name + "\u201d note", body: body, own: true };
  });
  return TEMPLATES.concat(own);
}
function tplDate(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function tplFill(text, title) {
  const d = new Date(), tk = /\b(SCTASK|PTASK|CTASK|STSK|STRY|RITM|INC|CHG|PRB)\d+\b/i.exec(title || "");
  return text.replace(/\{\{date\}\}/g, tplDate(d))
    .replace(/\{\{time\}\}/g, String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"))
    .replace(/\{\{weekday\}\}/g, d.toLocaleDateString(undefined, { weekday: "long" }))
    .replace(/\{\{title\}\}/g, title || "")
    .replace(/\{\{ticket\}\}/g, tk ? tk[0].toUpperCase() : "");
}
/* split out {{cursor}}: the text without it, and where it was (line, column) */
function tplCursor(text) {
  const at = text.indexOf("{{cursor}}");
  if (at < 0) return { text: text, line: -1, col: 0 };
  const before = text.slice(0, at).split("\n");
  return { text: text.replace("{{cursor}}", ""), line: before.length - 1, col: before[before.length - 1].length };
}
/* a new note with this text (or the existing one of that title, untouched), caret at {{cursor}} */
function createNoteWithText(title, text, pane, line, col) {
  pane = pane || focusedPane || panes[0];
  const existing = noteByTitle(title);
  if (existing) { openInPane(existing.id, pane); return existing; }
  let n;
  if (state.backend === "folder") {
    const base = uniqueBasename(sanitizeName(title), "");
    n = { id: base, path: base, title: base.replace(/\.md$/i, ""), content: text, handle: null, parent: state.dirHandle };
    state.notes.push(n); sortNotes();
    writeNoteFile(n).catch(function (e) { console.error(e); });
  } else {
    n = { id: noteSeq++, title: title, content: text, path: null, handle: null, parent: null };
    state.notes.push(n); schedulePersist();
  }
  openInPane(n.id, pane);
  renderSidebar();
  if (line >= 0) setTimeout(function () { const q = panes.filter(function (x) { return sameId(x.noteId, n.id); })[0] || pane; if (q.setActive) { q.setActive(Math.min(line, q.lines.length - 1), col); q.keepVisible(line); } }, 30);
  return n;
}
function newFromTemplate(t) {
  (t.title ? Promise.resolve(tplFill(t.title, "")) : Dialogs.prompt(t.ask || "Title for the new note", ""))
    .then(function (title) { newFromTemplateTitled(t, title); });
}
function newFromTemplateTitled(t, title) {
  if (!title || !title.trim()) return;
  title = title.trim();
  const c = tplCursor(tplFill(t.body, title));
  createNoteWithText(title, c.text, null, c.line, c.col);
}
/* insert at the caret: on an empty line it takes that line, otherwise it goes below */
function insertTemplate(t, spot) {
  const p = (spot && spot.pane) || focusedPane || panes[0];
  if (!p || p.type !== "note" || !p.note()) { pushToastLike("Open a note to insert into."); return; }
  const title = p.note().title, c = tplCursor(tplFill(t.body, title)); let add = c.text.split("\n");
  const at = spot ? spot.line : (p.activeLine !== null ? p.activeLine : p.lines.length - 1);
  const replaceLine = !p.lines[at] || !p.lines[at].trim();
  if (add[0].indexOf("# ") === 0 && at > 0) add = add.slice(add[1] === "" ? 2 : 1);          /* inserting into a note: drop the template's own title */
  const cut = c.line >= 0 ? c.line - (c.text.split("\n").length - add.length) : -1;
  histBreak(p);
  p.lines.splice.apply(p.lines, [replaceLine ? at : at + 1, replaceLine ? 1 : 0].concat(add));
  p.commit(true); p.rerenderLines(); histBreak(p);
  const first = replaceLine ? at : at + 1;
  if (cut >= 0) { p.setActive(first + cut, c.col); p.keepVisible(first + cut); }
}
function openDailyNote() {
  const t = templateList().filter(function (x) { return /^daily/i.test(x.name); }).pop() || TEMPLATES[4];
  const title = tplDate(new Date()), existing = noteByTitle(title);
  if (existing) { openInPane(existing.id, focusedPane || panes[0]); return; }
  const c = tplCursor(tplFill(t.body, title));
  createNoteWithText(title, c.text, null, c.line, c.col);
}
/* open the palette to pick a note ("note") or an open task ("task"); fn gets the choice */
let PAL_PLACEHOLDER = null;
function palPick(kind, fn, hint) {
  palOpen("");
  pal.pick = { kind: kind, fn: fn };
  const inp = document.getElementById("cmdIn");
  if (PAL_PLACEHOLDER === null) PAL_PLACEHOLDER = inp.placeholder;
  inp.placeholder = hint || (kind === "task" ? "Pick a task" : "Pick a note");
  palRender();
}
/* colour from the palette: opening it took focus from the note, so the caret and selection it had
   (captured when the palette opened) go back first, then the colour is applied to them */
function colourAfterPalette(q, colour) {
  const sel = pal.textSel;                               /* (pal.sel is the palette's highlighted row) */
  if (sel && sel.pane === q && q.lines) {
    if (sel.hl) q.setPartial(sel.hl.aL, sel.hl.aC, sel.hl.fL, sel.hl.fC);      /* a multi-line highlight comes back whole */
    else if (sel.line < q.lines.length) {
      if (q.activeLine !== sel.line) q.setActive(sel.line, sel.start);
      if (q.ta) q.ta.setSelectionRange(sel.start, sel.end);
    }
  }
  q.colourText(colour);
}
function palOpen(prefix, tplAction) {
  const fpS = focusedPane || panes[0];
  pal.textSel = fpS && fpS.allSelected && fpS.selEnds ? { pane: fpS, hl: fpS.selEnds() }
    : fpS && fpS.ta && fpS.activeLine !== null ? { pane: fpS, line: fpS.activeLine, start: fpS.ta.selectionStart, end: fpS.ta.selectionEnd } : null;
  pal.pick = null;
  if (PAL_PLACEHOLDER !== null) document.getElementById("cmdIn").placeholder = PAL_PLACEHOLDER;
  pal.tplAction = tplAction || null;
  pal.back = document.activeElement;
  const fp0 = focusedPane || panes[0];
  /* the live editor's typing box is removed when focus leaves it, so remember the
     line and caret rather than the element */
  pal.spot = fp0 && fp0.type === "note" && fp0.activeLine !== null && fp0.ta
    ? { pane: fp0, line: fp0.activeLine, col: fp0.ta.selectionStart } : null;
  pal.open = true; pal.sel = 0;
  const el = document.getElementById("cmdPal"), inp = document.getElementById("cmdIn");
  el.classList.add("show");
  inp.value = prefix || "";
  palRender();
  inp.focus();
  inp.setSelectionRange(inp.value.length, inp.value.length);
}
function palClose(restore) {
  pal.open = false;
  document.getElementById("cmdPal").classList.remove("show");
  if (!restore) return;
  if (pal.spot && panes.indexOf(pal.spot.pane) !== -1) {
    const sp = pal.spot;
    sp.pane.setActive(Math.min(sp.line, sp.pane.lines.length - 1), sp.col);
  } else if (pal.back && pal.back.isConnected && pal.back.focus) pal.back.focus();
}
function palRun(i, newPane) {
  const r = pal.rows[i]; if (!r) return;
  const pick = pal.pick; pal.pick = null;
  palClose(false);
  if (pick && r.kind === "note" && pick.kind === "note") { pick.fn(r.n); return; }
  if (pick && r.kind === "tbtask") { pick.fn(r.t); return; }
  if (r.kind === "cmd") { r.c.run(); return; }
  if (r.kind === "tpl") { const act = pal.tplAction || "new", spot = pal.spot; pal.tplAction = null; if (act === "insert") insertTemplate(r.t, spot); else newFromTemplate(r.t); return; }
  if (r.kind === "head") {
    r.pane.setActive(r.line, 0);
    const el = r.pane.linesEl && r.pane.linesEl.children[r.line];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "center" });
    return;
  }
  const fp = focusedPane || panes[0];
  if (newPane) { if (panes.length < MAX_PANES) addPane(fp, r.n.id); else openInPane(r.n.id, nextPane(fp)); }
  else openInPane(r.n.id, fp);
}
document.getElementById("btnCmd").addEventListener("click", function () { palOpen(""); });
document.addEventListener("click", function (e) {
  const c = e.target.closest && e.target.closest('[data-crumb="heads"]');
  if (c) { e.preventDefault(); palOpen("@"); }
});
document.getElementById("cmdIn").addEventListener("input", function () { pal.sel = 0; palRender(); });
document.getElementById("cmdIn").addEventListener("keydown", function (e) {
  e.stopPropagation();
  if (e.key === "ArrowDown") { e.preventDefault(); pal.sel = Math.min(pal.rows.length - 1, pal.sel + 1); palRender(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); pal.sel = Math.max(0, pal.sel - 1); palRender(); }
  else if (e.key === "Enter") { e.preventDefault(); palRun(pal.sel, e.shiftKey); }
  else if (e.key === "Escape") { e.preventDefault(); palClose(true); }
});
document.getElementById("cmdList").addEventListener("mousemove", function (e) {
  const row = e.target.closest(".cmd-row"); if (!row) return;
  const i = +row.dataset.i; if (i !== pal.sel) { pal.sel = i; palRender(); }
});
document.getElementById("cmdList").addEventListener("mousedown", function (e) {
  const row = e.target.closest(".cmd-row"); if (!row) return;
  e.preventDefault(); palRun(+row.dataset.i);
});
document.getElementById("cmdPal").addEventListener("mousedown", function (e) {
  if (e.target === this) palClose(true);
});

