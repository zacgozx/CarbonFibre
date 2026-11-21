/* ============================================================
   Timeline: in a note with a "## Timeline" heading (the Incident and Change templates have one),
   ticking a step writes the time at its end ("- [x] Restart forwarder 10:47"), unticking takes it off,
   and the Timeline section lists the stamped steps by time, with any notes of your own kept among them.
   Alt+Enter (or /log) adds a note of your own; "Copy timeline" puts it on the clipboard as plain lines
   for a ticket. Notes without the heading are never changed. It's all plain markdown.
   ============================================================ */
const Timeline = {
  HEAD: /^(#{1,6})\s+timeline\s*$/i,
  TASK: /^(\s*(?:[-*+]|\d+[.)])\s+\[( |x|X)\]\s+)(.*)$/,
  STAMP: /\s(\d{1,2}:\d{2})$/,
  ENTRY: /^\s*[-*+]\s+(\d{1,2}:\d{2})\s+(.*)$/,

  now() { const d = new Date(); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); },
  /* the section: heading line, and where it ends (the next heading as big or bigger, or the end) */
  section(lines) {
    const h = lines.findIndex(function (l) { return Timeline.HEAD.test(l); });
    if (h < 0) return null;
    const level = Timeline.HEAD.exec(lines[h])[1].length;
    let end = h + 1;
    for (; end < lines.length; end++) { const m = /^(#{1,6})\s/.exec(lines[end]); if (m && m[1].length <= level) break; }
    return { h: h, end: end };
  },

  /* lines after ticking or unticking the lines at `changed`: their stamps, then the section rebuilt.
     null when the note has no Timeline heading or nothing changes. */
  apply(lines, changed) {
    const sec = Timeline.section(lines);
    if (!sec) return null;
    const out = lines.slice(), T = Timeline, key = function (t, x) { return t + "|" + x.trim().toLowerCase(); };
    const drop = new Set();                                 /* entries of steps just unticked */
    (changed || []).forEach(function (i) {
      if (i >= sec.h && i < sec.end) return;               /* a checkbox inside the timeline itself */
      const m = T.TASK.exec(out[i] || "");
      if (!m) return;
      const done = m[2] !== " ", s = T.STAMP.exec(m[3]);
      if (done && !s) out[i] = out[i].replace(/\s+$/, "") + " " + T.now();
      else if (!done && s) { drop.add(key(s[1], m[3].replace(T.STAMP, ""))); out[i] = out[i].replace(T.STAMP, ""); }
    });
    const steps = [], made = new Set();
    out.forEach(function (l, i) {
      if (i >= sec.h && i < sec.end) return;
      const m = T.TASK.exec(l);
      if (!m) return;
      const text = m[3].replace(T.STAMP, "").trim(), s = T.STAMP.exec(m[3]);
      if (m[2] !== " " && s && text) { steps.push({ time: s[1], text: text }); made.add(key(s[1], text)); }
    });
    /* the section's own lines: entries for ticked steps are rebuilt (never twice), those of steps just
       unticked go, and your own entries and any other text stay */
    const own = [], other = [];
    for (let i = sec.h + 1; i < sec.end; i++) {
      const m = T.ENTRY.exec(out[i]);
      if (m) { const k = key(m[1], m[2]); if (!made.has(k) && !drop.has(k)) own.push({ time: m[1], text: m[2].trim() }); }
      else if (out[i].trim() && !/^\s*[-*+]\s*$/.test(out[i])) other.push(out[i]);
    }
    const mins = function (e) { const p = e.time.split(":"); return +p[0] * 60 + +p[1]; };
    /* shortcut: sorted by time of day, so an incident running past midnight sorts wrong; add dates when that bites */
    const entries = steps.concat(own).map(function (e, k) { return { e: e, k: k }; })
      .sort(function (a, b) { return mins(a.e) - mins(b.e) || a.k - b.k; })
      .map(function (o) { return "- " + o.e.time + " " + o.e.text; });
    const body = entries.concat(other);
    const next = out.slice(0, sec.h + 1).concat(body.length ? body : ["- "], sec.end < out.length ? [""] : [], out.slice(sec.end));
    return next.join("\n") === lines.join("\n") ? null : next;
  },
  /* your own entry: the time and text, into the section (made at the end of the note if there's none) */
  withEntry(lines, text) {
    let out = lines.slice(), sec = Timeline.section(out);
    if (!sec) { while (out.length && !out[out.length - 1].trim()) out.pop(); out = out.concat(["", "## Timeline"]); sec = Timeline.section(out); }
    out.splice(sec.end, 0, "- " + Timeline.now() + " " + String(text).replace(/\s+/g, " ").trim());
    return Timeline.apply(out, []) || out;
  },

  /* the pane's lines replaced as one undo step; the caret stays on its line when a line is being edited */
  write(p, next) {
    if (!next) return false;
    if (p.activeLine !== null && p.activeLine !== undefined && p.ta) {
      const line = Math.min(p.activeLine, next.length - 1), col = p.ta.selectionStart;
      p.applyLines(0, p.lines.length - 1, next, { line: line, col: col });
      return true;
    }
    histBreak(p);
    Array.prototype.splice.apply(p.lines, [0, p.lines.length].concat(next));
    p.commit(true);
    p.render();
    return true;
  },
  /* Alt+Enter and /log: the current line's text, or ask when it's empty */
  add(p, text) {
    if (!p || !p.note()) return;
    const go = function (t) { if (t && t.trim()) { Timeline.write(p, Timeline.withEntry(p.lines, t)); pushToastLike("Added to the timeline."); } };
    if (text && text.trim()) go(text); else Dialogs.prompt("Add to the timeline:", "").then(go);
  },
  lineText(raw) { return String(raw || "").replace(/^\s*(?:#{1,6}\s+|>\s*|(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)?/, "").replace(Timeline.STAMP, "").trim(); },

  /* "Copy timeline": a line naming the note and the day, then one line per entry */
  text(p) {
    const sec = Timeline.section(p.lines);
    if (!sec) return "";
    const rows = [];
    for (let i = sec.h + 1; i < sec.end; i++) { const m = Timeline.ENTRY.exec(p.lines[i]); if (m) rows.push(m[1] + " " + m[2].trim()); }
    const n = p.note(), d = new Date();
    return (n ? n.title + ", " : "") + d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) + "\n" + rows.join("\n");
  },
  copy(p, btn) {
    const t = Timeline.text(p);
    if (!t) { pushToastLike("This note has no ## Timeline section."); return; }
    copyText(t);
    if (btn) { btn.textContent = "Copied"; btn.classList.add("done"); setTimeout(function () { if (btn.isConnected) { btn.textContent = "Copy timeline"; btn.classList.remove("done"); } }, 1500); }
    else pushToastLike("Timeline copied.");
  }
};
/* the button on the Timeline heading: copies without putting the heading into editing */
document.addEventListener("mousedown", function (e) {
  const b = e.target.closest && e.target.closest(".tl-copy");
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const p = panes.filter(function (q) { return q.root.contains(b); })[0];
  if (p) Timeline.copy(p, b);
}, true);
