/* ============================================================
   Task board: tickets in four lanes (open, running, held, cleared today). It owns no clock:
   starting a task starts CarbonFibre's timer, and stopping, holding or clearing it finishes
   the timer, which writes the Today log. Elapsed time comes from the timer's wall clock, so
   it survives reloads and background tabs. Task names are only ever set as text.
   ============================================================ */
const TB_KEY = "carbonfibre-taskboard";
let tb = { tasks: [], filter: "all", pinned: false, pinnedPane: 0, seq: 1, snowBase: "" };                      /* no ServiceNow address until you set one (board menu) */
try { const tbStored = JSON.parse(localStorage.getItem(TB_KEY) || "null"); if (tbStored && Array.isArray(tbStored.tasks)) tb = Object.assign(tb, tbStored); } catch (e) {}
let tbSaveTimer = null; const tbPending = {};
function tbSave() {                                  /* on every change, debounced; never on clock ticks */
  if (tbSaveTimer) clearTimeout(tbSaveTimer);
  tb.savedAt = Date.now();
  tbSaveTimer = setTimeout(function () { tbSaveTimer = null; storeSet(TB_KEY, JSON.stringify(tb)); tbWriteVault(); }, 500);
}
/* With a vault folder open, the board is also kept in it (.carbonfibre/taskboard.json), so it
   lives with your notes and survives clearing the browser's data. Browser storage stays as the
   quick local copy. The note reader skips folders starting with a dot. */
const TB_VAULT_DIR = ".carbonfibre", TB_VAULT_FILE = "taskboard.json";
function tbWriteVault() {
  if (state.backend !== "folder" || !state.dirHandle) return Promise.resolve(false);
  return state.dirHandle.getDirectoryHandle(TB_VAULT_DIR, { create: true })
    .then(function (d) { return writeFile(d, TB_VAULT_FILE, JSON.stringify(tb, null, 1)); })
    .then(function () { return true; }, function (e) { console.error("task board: vault save failed", e); return false; });
}
/* on opening a vault: whichever copy was saved last wins */
function tbLoadVault() {
  if (state.backend !== "folder" || !state.dirHandle) return Promise.resolve();
  return state.dirHandle.getDirectoryHandle(TB_VAULT_DIR)
    .then(function (d) { return d.getFileHandle(TB_VAULT_FILE); })
    .then(function (fh) { return fh.getFile(); })
    .then(function (f) { return f.text(); })
    .then(function (txt) {
      const v = JSON.parse(txt);
      if (v && Array.isArray(v.tasks) && (v.savedAt || 0) > (tb.savedAt || 0)) {
        Object.keys(v).forEach(function (k) { tb[k] = v[k]; });
        storeSet(TB_KEY, JSON.stringify(tb));
        if (typeof tbRenderAll === "function") tbRenderAll();
      } else if (tb.tasks.length) tbWriteVault();
    })
    .catch(function () { if (tb.tasks.length) tbWriteVault(); });   /* no copy in the vault yet: put this one there */
}
function tbDay(t) { const d = t ? new Date(t) : new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
/* ticket type from its number prefix; longer prefixes are tried first (SCTASK before others) */
const TB_PREFIXES = ["SCTASK", "PTASK", "CTASK", "STSK", "STRY", "RITM", "INC", "CHG", "PRB"];
function tbType(id) {
  const u = String(id || "").toUpperCase();
  for (let i = 0; i < TB_PREFIXES.length; i++) if (u.indexOf(TB_PREFIXES[i]) === 0) return TB_PREFIXES[i].toLowerCase();
  return "other";
}
/* A ticket link uses no API: it opens the record in ServiceNow in a new tab, through the
   login you already have. Next Experience shows classic records under /now/nav/ui/classic. */
const TB_TABLES = { inc: "incident", chg: "change_request", ctask: "change_task", prb: "problem", ptask: "problem_task",
                  sctask: "sc_task", ritm: "sc_req_item", stry: "rm_story", stsk: "rm_scrum_task" };
/* Three ways to open a ticket by its number. "search" is ServiceNow's own exact-number search
   (what global search does with a ticket number): it jumps straight to the record whatever its
   table. "form" opens the classic form through nav_to.do; "next" is the Next Experience path. */
const TB_LINK_STYLES = { direct: "table form: <table>.do?sysparm_query=number=<ticket>", search: "exact-number search", next: "Next Experience path" };
function tbTicketUrl(t) {
  const base = String(tb.snowBase || "").replace(/\/+$/, "");
  if (!base || !t || !t.id || t.id === "TASK") return "";
  const table = TB_TABLES[t.type], style = TB_LINK_STYLES[tb.snowStyle] ? tb.snowStyle : "direct", num = encodeURIComponent(t.id);
  /* an unknown prefix has no table to name, so it always uses the exact-number search */
  if (style === "search" || !table) return base + "/text_search_exact_match.do?sysparm_search=" + num;
  if (style === "direct") return base + "/" + table + ".do?sysparm_query=number=" + num;     /* the classic form URL */
  return base + "/now/nav/ui/classic/params/target/" + encodeURIComponent(table + ".do?sysparm_query=number=" + t.id);
}
function tbSetSnowStyle() {
  const keys = Object.keys(TB_LINK_STYLES), cur = TB_LINK_STYLES[tb.snowStyle] ? tb.snowStyle : "direct";
  Dialogs.prompt("How ticket links open (type 1, 2 or 3):\n" + keys.map(function (k, i) { return (i + 1) + "  " + TB_LINK_STYLES[k] + (k === cur ? "   (current)" : ""); }).join("\n"), String(keys.indexOf(cur) + 1)).then(function (v) { tbSetSnowStyleTo(keys, v); });
}
function tbSetSnowStyleTo(keys, v) {
  if (v === null) return;
  const k = keys[parseInt(v, 10) - 1];
  if (!k) { pushToastLike("Pick 1, 2 or 3."); return; }
  tb.snowStyle = k; tbSave(); tbRenderAll();
  pushToastLike("Ticket links now use " + TB_LINK_STYLES[k] + ".");
}
function tbSetSnowBase() {
  Dialogs.prompt("ServiceNow address (the start of a ticket URL), for example https://yourcompany.service-now.com:", tb.snowBase || "https://").then(tbSetSnowBaseTo);
}
function tbSetSnowBaseTo(v) {
  if (v === null) return;
  v = v.trim().replace(/\/+$/, "");
  if (v && !/^https:\/\/[^\s/]+$/i.test(v)) {
    const m = /^(https:\/\/[^\s/]+)/i.exec(v);           /* a full ticket URL was pasted: keep just the address */
    if (!m) { pushToastLike("That doesn't look like an https address."); return; }
    v = m[1];
  }
  tb.snowBase = v; tbSave(); tbRenderAll();
  pushToastLike(v ? "Ticket links open on " + v.replace(/^https:\/\//, "") + "." : "Ticket links turned off.");
}
function tbFind(uid) { return tb.tasks.filter(function (t) { return t.uid === uid; })[0] || null; }
/* cleared tasks drop off the board at midnight; history older than 30 days is let go */
(function () {
  const cutoff = Date.now() - 30 * 864e5;
  tb.tasks = tb.tasks.filter(function (t) { return t.state !== "done" || !t.clearedAt || new Date(t.clearedAt + "T00:00").getTime() >= cutoff; });
})();
function tbRunning() { return timer && timer.boardUid ? tbFind(timer.boardUid) : null; }
/* minutes on a task: earlier sessions plus the one running now */
function tbMinutes(t) { return t.mins + (timer && timer.boardUid === t.uid ? timerElapsed() / 60000 : 0); }
/* the timer finished (from the board or the status bar): its time goes onto the task */
function tbTimerEnded(uid, actualMs, keep) {
  const t = tbFind(uid);
  if (!t) return;
  if (keep) t.mins += Math.round(actualMs / 60000);
  const next = tbPending[uid] || "open";
  tbEvent(t, next === "done" ? "done" : next === "held" ? "waiting" : "paused");
  delete tbPending[uid];
  if (t.state === "run") {
    t.state = next;
    if (next === "done") t.clearedAt = tbDay();
  }
  tbSave(); tbRenderAll();
}
function tbStart(t) {
  if (!t || t.state === "done") return;
  if (timer && timer.boardUid === t.uid) { if (timer.pausedAt) timerPause(); return; }
  if (timer) {                                       /* park whatever is running, logging it */
    if (timer.boardUid) tbPending[timer.boardUid] = "open";
    timerFinish(true);
  }
  tbEvent(t, "started");
  const left = t.est > 0 ? Math.max(5, Math.round(t.est - t.mins)) : timePrefs.minutes;
  timerStart(t.id + " " + t.name, left, t.noteId);
  timer.boardUid = t.uid; timerSave();
  t.state = "run";
  tbSave(); tbRenderAll();
}
function tbStopAs(state) {                           /* stop the running task, into a lane */
  const t = tbRunning();
  if (!t) { if (timer) timerFinish(true); return; }
  tbPending[t.uid] = state;
  timerFinish(true);
}
function tbAdd(id, name, est, noteId) {
  id = String(id || "").trim().toUpperCase(); name = String(name || "").trim();
  if (!id && !name) return null;
  const t = { uid: "t" + Date.now().toString(36) + (tb.seq++), id: id || "TASK", type: tbType(id), name: name || id,
            noteId: noteId == null ? null : noteId, mins: 0, est: Math.max(0, parseInt(est, 10) || 0), state: "open", clearedAt: null };
  if (t.noteId == null) {                            /* link a note that already mentions the ticket */
    const hit = id && state.notes.filter(function (n) { return (n.title + "\n" + n.content.slice(0, 400)).toUpperCase().indexOf(id) !== -1; })[0];
    if (hit) t.noteId = hit.id;
  }
  tb.tasks.push(t);
  tbEvent(t, "added");
  tbSave(); tbRenderAll();
  return t;
}
function tbRemove(t) {
  if (!t) return;
  if (timer && timer.boardUid === t.uid) { tbPending[t.uid] = "open"; timerFinish(true); }
  tb.tasks = tb.tasks.filter(function (x) { return x !== t; });
  tbSave(); tbRenderAll();
}
/* the note for a task: the linked one, or a new one named after the ticket */
function tbOpenNote(t, fromPane) {
  if (!t) return;
  let n = t.noteId != null ? findNote(t.noteId) : null;
  if (!n) {
    const title = (t.id + " " + t.name).replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
    const body = "# " + title + "\n\n";
    if (state.backend === "folder") {
      const base = uniqueBasename(title, "");
      n = { id: base, path: base, title: base.replace(/\.md$/i, ""), content: body, handle: null, parent: folderHandle(""), mtime: 0 };
      state.notes.push(n); sortNotes();
      writeNoteFile(n).catch(function (e) { console.error(e); setSaveState("error"); });
    } else {
      n = { id: noteSeq++, title: title, content: body, path: null, handle: null, parent: null };
      state.notes.push(n); schedulePersist();
    }
    t.noteId = n.id; tbSave(); renderSidebar();
  }
  const target = panes.filter(function (q) { return q !== fromPane && q.type === "note"; })[0] || fromPane || focusedPane || panes[0];
  target.open(n.id);
  target.focusThis();
}

/* ---- the board as a pane ---- */
function tbEl(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
const TB_KIND = { inc: "Incident", chg: "Change", ctask: "Change task", prb: "Problem", ptask: "Problem task",
                sctask: "Catalog task", ritm: "Request item", stry: "Story", stsk: "Story task", other: "Task" };
const TB_LANES = [["open", "To do", "Nothing to do. Add a task above."],
                ["run", "Working on", "Press Start on a card when you begin. The clock runs from there."],
                ["held", "Waiting", "Drag a card here while you wait on someone."],
                ["done", "Done today", "Finished tasks land here and clear at midnight."]];
/* "38m", "1h 05m": the compact form, for cards, tables and figures (tbMin is the long form) */
function tbMinShort(m) { m = Math.round(m); return m >= 60 ? Math.floor(m / 60) + "h " + String(m % 60).padStart(2, "0") + "m" : m + "m"; }
function tbMin(m) {                                  /* "38 min", "1 h 05 min" */
  m = Math.max(0, Math.round(m));
  return m >= 60 ? Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0") + " min" : m + " min";
}
/* one line in, a task out: "INC0012345 Splunk HEC down 30m" -> ticket, name, estimate */
function tbParseQuick(text) {
  let s = String(text || "").trim();
  if (!s) return null;
  const idm = /\b(SCTASK|PTASK|CTASK|STSK|STRY|RITM|INC|CHG|PRB)\d+\b/i.exec(s), id = idm ? idm[0].toUpperCase() : "";
  if (idm) s = (s.slice(0, idm.index) + " " + s.slice(idm.index + idm[0].length)).trim();
  let est = 30; const em = /(?:^|\s)(\d+(?:\.\d+)?)\s*(m|min|mins|minutes|h|hr|hrs|hour|hours)\s*$/i.exec(s);
  if (em) { est = Math.round(parseFloat(em[1]) * (/^h/i.test(em[2]) ? 60 : 1)); s = s.slice(0, em.index).trim(); }
  const name = s.replace(/^[\s\-:\u2013\u2014|]+|[\s\-:\u2013\u2014|]+$/g, "");
  if (!id && !name) return null;
  return { id: id || "TASK", name: name || id, est: est };
}
/* move a card to a lane; into Working on starts its clock, out of it stops the clock */
function tbMove(t, lane) {
  if (!t || t.state === lane) return;
  if (lane === "run") { if (t.state === "done") { t.state = "open"; t.clearedAt = null; } tbStart(t); return; }
  if (timer && timer.boardUid === t.uid) { tbStopAs(lane); return; }
  tbEvent(t, lane === "done" ? "done" : lane === "held" ? "waiting" : t.state === "done" ? "reopened" : "moved");
  t.state = lane;
  t.clearedAt = lane === "done" ? tbDay() : null;
  tbSave(); tbRenderAll();
}
/* removing is undoable for a few seconds instead of asking first */
let tbUndo = null;
function tbRemoveWithUndo(t) {
  if (!t) return;
  const at = tb.tasks.indexOf(t);
  tbRemove(t);
  if (tbUndo && tbUndo.timer) clearTimeout(tbUndo.timer);
  tbUndo = { task: t, at: at, timer: setTimeout(function () { tbUndo = null; tbRenderAll(); }, 8000) };
  tbRenderAll();
}
function tbUndoRemove() {
  if (!tbUndo) return;
  const u = tbUndo; tbUndo = null; clearTimeout(u.timer);
  if (u.task.state === "run") u.task.state = "open";
  tb.tasks.splice(Math.min(u.at, tb.tasks.length), 0, u.task);
  tbSave(); tbRenderAll();
}
let tbEditing = null; /* the card being edited in place */ // eslint-disable-line prefer-const -- reassigned in 36-taskboard-all-notes-every-note-i.js

/* ---- task board events: what happened when, for the dashboard's activity panel (7 days kept) ---- */
function tbEvent(t, what) {
  if (!t) return;
  tb.events = (tb.events || []).filter(function (e) { return e.at > Date.now() - 7 * 864e5; });
  tb.events.push({ at: Date.now(), uid: t.uid, id: t.id, name: t.name, type: t.type, what: what });
  if (tb.events.length > 400) tb.events = tb.events.slice(-400);
}
/* ---- the dashboard: panels that summarise the day, as a team board does ---- */
const TB_TYPE_COLOR = { inc: "var(--tb-flare)", chg: "var(--tb-blu)", ctask: "var(--tb-blu)", prb: "var(--tb-flare)", ptask: "var(--tb-flare)",
                      sctask: "var(--tb-ora)", ritm: "var(--tb-ok)", stry: "var(--tb-vio)", stsk: "var(--tb-vio)", other: "var(--tb-mute)" };
const TB_TYPE_HEX_DARK = { inc: "#e5534b", chg: "#8ea7b8", ctask: "#6f8da3", prb: "#c46a64", ptask: "#f08a80", sctask: "#d4917c", ritm: "#5cb87a", stry: "#b08ae6", stsk: "#9070c8", other: "#9a9ca2" };
const TB_TYPE_HEX_LIGHT = { inc: "#b4323f", chg: "#1f6f94", ctask: "#5ba3c9", prb: "#d0606a", ptask: "#e08890", sctask: "#b45309", ritm: "#2e7d4f", stry: "#6b4fa8", stsk: "#9d86cf", other: "#46606f" };
function tbTypeHex(type) { return (isLight() ? TB_TYPE_HEX_LIGHT : TB_TYPE_HEX_DARK)[type] || "#9a9ca2"; }
/* minutes of work per ticket type on a given day, from the time log (and the clock now running) */
function tbMinutesByType(dayStart, dayEnd) {
  const out = {};
  timeLog.forEach(function (e) {
    if (e.start < dayStart || e.start >= dayEnd) return;
    const tk = /\b(SCTASK|PTASK|CTASK|STSK|STRY|RITM|INC|CHG|PRB)\d+/i.exec(e.task || ""), ty = tk ? tbType(tk[0]) : "other";
    out[ty] = (out[ty] || 0) + (e.actual || (e.end - e.start)) / 60000;
  });
  if (timer && timer.startedAt >= dayStart && timer.startedAt < dayEnd) {
    const run = tbRunning(), ty2 = run ? run.type : "other";
    out[ty2] = (out[ty2] || 0) + timerElapsed() / 60000;
  }
  return out;
}
function tbDayBounds(offset) {
  const s = new Date(); s.setHours(0, 0, 0, 0); s.setDate(s.getDate() - offset);
  const e = new Date(s); e.setDate(e.getDate() + 1);
  return [s.getTime(), e.getTime(), s];
}
function tbDonut(parts, total) {
  const R = 56, C = 2 * Math.PI * R; let off = 0, segs = "";
  if (total <= 0) return '<svg viewBox="0 0 140 140" class="tbd-donut" aria-hidden="true"><circle cx="70" cy="70" r="' + R + '" fill="none" stroke="var(--tb-line)" stroke-width="16"/></svg>';
  parts.forEach(function (p) {
    const len = C * p.v / total;
    segs += '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="' + p.color + '" stroke-width="16" stroke-dasharray="' + len.toFixed(2) + " " + (C - len).toFixed(2) +
      '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 70 70)" stroke-linecap="butt"><title>' + esc(p.label) + ": " + tbMin(p.v) + "</title></circle>";
    off += len;
  });
  return '<svg viewBox="0 0 140 140" class="tbd-donut" role="img" aria-label="Time by ticket type">' + segs +
    '<text x="70" y="76" text-anchor="middle" class="tbd-donut-n">' + (total >= 60 ? Math.floor(total / 60) + "h" + String(Math.round(total % 60)).padStart(2, "0") : Math.round(total) + "m") + "</text></svg>";
}
function tbRenderDash(p) {
  const root = p.tbRoot, dash = root.querySelector(".tb-dash");
  if (!dash) return;
  const today = tbDay(), b0 = tbDayBounds(0), b1 = tbDayBounds(1), yday = tbDay(b1[0]);
  const open = tb.tasks.filter(function (t) { return t.state !== "done"; });
  const todo = open.filter(function (t) { return t.state === "open" || t.state === "run"; });
  const waiting = tb.tasks.filter(function (t) { return t.state === "held"; });
  const doneT = tb.tasks.filter(function (t) { return t.state === "done" && t.clearedAt === today; }).length;
  const doneY = tb.tasks.filter(function (t) { return t.state === "done" && t.clearedAt === yday; }).length;
  const over = open.filter(function (t) { return t.est > 0 && tbMinutes(t) > t.est; });
  const byType = tbMinutesByType(b0[0], b0[1]), minsT = Object.keys(byType).reduce(function (s, k) { return s + byType[k]; }, 0);
  const byY = tbMinutesByType(b1[0], b1[1]), minsY = Object.keys(byY).reduce(function (s, k) { return s + byY[k]; }, 0);
  const short = tbMinShort;
  /* change since yesterday: time logged is neither good nor bad, so it stays neutral; more done is green */
  const delta = function (d, unit) {
    if (!d) return '<span class="tbd-delta flat">same as yesterday</span>';
    const cls = unit === "m" ? "flat" : d > 0 ? "up" : "flat";
    return '<span class="tbd-delta ' + cls + '">' + (d > 0 ? "\u2191 " : "\u2193 ") + (unit === "m" ? short(Math.abs(d)) : Math.abs(d)) + " vs yesterday</span>";
  };
  /* ---- figures ---- */
  const kpi = function (cls, label, value, foot) { return '<div class="tbd-kpi ' + cls + '"><span class="tbd-kpi-l"><i></i>' + label + '</span><b>' + value + "</b>" + (foot || "") + "</div>"; };
  const kpis = '<div class="tbd-kpis">' +
    kpi("acc", "Logged today", short(minsT), delta(Math.round(minsT - minsY), "m")) +
    kpi("ok", "Done today", doneT, delta(doneT - doneY)) +
    kpi("blu", "To do", todo.length, '<span class="tbd-delta flat">' + (todo.length ? short(todo.reduce(function (s, t) { return s + Math.max(0, t.est - tbMinutes(t)); }, 0)) + " estimated left" : "all clear") + "</span>") +
    kpi("ora", "Waiting", waiting.length, '<span class="tbd-delta flat">' + (waiting.length ? "on someone else" : "nothing blocked") + "</span>") +
    kpi(over.length ? "bad" : "mute", "Over estimate", over.length, '<span class="tbd-delta ' + (over.length ? "down" : "flat") + '">' + (over.length ? over.map(function (t) { return t.id; }).slice(0, 2).join(", ") : "on track") + "</span>") +
    "</div>";
  const panel = function (cls, title, body, side) { return '<section class="tbd-panel ' + cls + '"><header class="tbd-head"><h3><i></i>' + esc(title) + "</h3>" + (side || "") + "</header>" + body + "</section>"; };
  /* ---- my tickets: dense rows, start straight from here ---- */
  const laneName = { run: "Working on", open: "To do", held: "Waiting" }, laneOrd = { run: 0, open: 1, held: 2 };
  const rows = open.slice().sort(function (a, c) { return laneOrd[a.state] - laneOrd[c.state]; }).map(function (t) {
    const m = tbMinutes(t), url = tbTicketUrl(t), n = t.noteId != null ? findNote(t.noteId) : null, o = t.est > 0 && m > t.est, running = t.state === "run";
    return '<tr data-uid="' + t.uid + '"' + (running ? ' class="running"' : "") + ">" +
      '<td class="tbd-k"><span class="tbd-type" style="background:' + tbTypeHex(t.type) + '" title="' + esc(TB_KIND[t.type] || "Task") + '"></span>' +
        (url ? '<a class="tbd-key" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" title="Open in ServiceNow">' + esc(t.id) + "</a>" : '<span class="tbd-key">' + esc(t.id) + "</span>") + "</td>" +
      '<td class="tbd-sum"><span class="tbd-name">' + esc(t.name) + "</span>" + (n ? '<button type="button" class="tbd-note" data-note="' + esc(String(n.id)) + '" title="Open the linked note">' + esc(n.title) + "</button>" : "") + "</td>" +
      '<td><span class="tbd-lane tbd-lane--' + t.state + '"><i></i>' + laneName[t.state] + "</span></td>" +
      '<td class="tbd-time' + (o ? " over" : "") + '">' + (m >= 1 ? short(m) : "\u2013") + (t.est ? "<span> / " + short(t.est) + "</span>" : "") + "</td>" +
      '<td class="tbd-go">' + (running ? '<button type="button" class="tbd-btn" data-done="' + t.uid + '" title="Done">\u2713</button>' : '<button type="button" class="tbd-btn" data-start="' + t.uid + '" title="Start the clock">\u25b6</button>') + "</td></tr>";
  }).join("");
  const tickets = panel("tbd-tickets blu", "My tickets", open.length ?
      '<div class="tbd-tablewrap"><table class="tbd-table"><thead><tr><th>Key</th><th>Summary</th><th>Lane</th><th>Time</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>" :
      '<p class="tbd-empty">No open tickets. Use <b>+ Task</b> above, or drag a note onto the board.</p>', '<span class="tbd-count">' + open.length + "</span>");
  /* ---- last 7 days: a slim strip ---- */
  const days = []; let maxM = 1, any = false;
  for (let k = 6; k >= 0; k--) {
    const bd = tbDayBounds(k), mt = tbMinutesByType(bd[0], bd[1]), mins = Object.keys(mt).reduce(function (s, x) { return s + mt[x]; }, 0), dk = tbDay(bd[0]);
    const dn = tb.tasks.filter(function (t) { return t.state === "done" && t.clearedAt === dk; }).length;
    days.push({ label: k === 0 ? "Today" : bd[2].toLocaleDateString(undefined, { weekday: "short" }), mins: mins, done: dn });
    maxM = Math.max(maxM, mins); if (mins >= 1 || dn) any = true;
  }
  const weekTotal = days.reduce(function (s, d) { return s + d.mins; }, 0), weekDone = days.reduce(function (s, d) { return s + d.done; }, 0);
  const week = panel("tbd-week ok", "Last 7 days", any ? '<div class="tbd-days">' + days.map(function (d) {
      return '<div class="tbd-day" title="' + esc(d.label + ": " + short(d.mins) + ", " + d.done + " done") + '"><div class="tbd-bar"><i style="height:' + Math.max(d.mins >= 1 ? 4 : 0, Math.round(d.mins / maxM * 100)) + '%"></i></div>' +
        "<b>" + (d.mins >= 1 ? short(d.mins) : "\u2013") + "</b><span>" + esc(d.label) + (d.done ? " \u00b7 " + d.done + "\u2713" : "") + "</span></div>";
    }).join("") + "</div>" : '<p class="tbd-empty">No time logged this week yet.</p>',
    any ? '<span class="tbd-side">' + short(weekTotal) + " \u00b7 " + weekDone + " done</span>" : "");
  /* ---- time by type: hidden ring when there's nothing to show ---- */
  const parts = Object.keys(byType).filter(function (x) { return byType[x] >= 0.5; }).sort(function (a, c) { return byType[c] - byType[a]; })
    .map(function (x) { return { label: TB_KIND[x] || "Task", v: byType[x], color: tbTypeHex(x) }; });
  const types = panel("tbd-types ora", "Time by type", parts.length ? '<div class="tbd-donutwrap">' + tbDonut(parts, parts.reduce(function (s, q) { return s + q.v; }, 0)) +
      '<ul class="tbd-legend">' + parts.map(function (q) { return '<li><span style="background:' + q.color + '"></span>' + esc(q.label) + "<b>" + short(q.v) + "</b></li>"; }).join("") + "</ul></div>"
    : '<p class="tbd-empty">Nothing logged yet today.</p>');
  /* ---- activity ---- */
  const verbs = { added: "added", started: "started", paused: "back to To do", waiting: "waiting", done: "finished", reopened: "reopened", moved: "to To do" };
  const evs = (tb.events || []).filter(function (e) { return e.at >= b0[0]; }).sort(function (a, c) { return c.at - a.at; }).slice(0, 8);
  const act = panel("tbd-activity vio", "Activity", evs.length ? '<ol class="tbd-acts">' + evs.map(function (e) {
      const d = new Date(e.at), hh = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
      return '<li class="tbd-act tbd-act--' + e.what + '"><time>' + hh + '</time><span class="dot" style="background:' + tbTypeHex(e.type) + '"></span><span class="tbd-act-t"><b>' + esc(e.id) + "</b> " + esc(verbs[e.what] || e.what) + "</span></li>";
    }).join("") + "</ol>" : '<p class="tbd-empty">Nothing yet today.</p>');
  dash.innerHTML = kpis + '<div class="tbd-main">' + tickets + week + '</div><div class="tbd-sidecol">' + types + act + "</div>";
}
/* ---- the Notes view: pinned notes as cards, a panel per pinned folder, and recent notes ---- */
function tbnPreview(n) {
  const lines = String(n.content || "").split("\n"); let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i].trim();
    if (/^```/.test(l)) { inFence = !inFence; continue; }
    if (inFence || !l || /^#{1,6}\s/.test(l) || /^\|/.test(l) || /^-{3,}$/.test(l) || /^---$/.test(l)) continue;
    l = l.replace(/^[-*+]\s+\[[ xX]\]\s+/, "").replace(/^[-*+>]\s+|^\d+[.)]\s+/, "").replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, "$1")
         .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`~=]{1,3}/g, "");
    if (l) return l.length > 120 ? l.slice(0, 117) + "\u2026" : l;
  }
  return "";
}
function tbnOpenTasks(n) { const m = String(n.content || "").match(/^\s*(?:[-*+]|\d+[.)])\s+\[ \]/gm); return m ? m.length : 0; }
function tbnAgo(ms) {
  if (!ms) return "";
  const d = Date.now() - ms, m = Math.round(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + "h ago";
  const days = Math.round(h / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return days + " days ago";
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
function tbnFolderOf(n) { const p = n.path || ""; return p.indexOf("/") === -1 ? "" : p.slice(0, p.lastIndexOf("/")); }
function tbnLinked(n) { return tb.tasks.filter(function (t) { return t.state !== "done" && t.noteId != null && sameId(t.noteId, n.id); })[0] || null; }
