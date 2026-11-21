/* ============================================================
   Timeline: in a note with a "## Timeline" heading (the Incident and Change templates have one),
   ticking a step writes the time at its end ("- [x] Restart forwarder 10:47"), unticking takes it off,
   and the Timeline section lists the stamped steps by time, with any notes of your own kept among them.
   Alt+Enter (or /log) adds a note of your own; "Copy timeline" puts it on the clipboard as plain lines
   for a ticket. Notes without the heading are never changed. It's all plain markdown.
   The day: the heading carries it ("## Timeline 2026-11-21", set with the date picker on the heading, or
   today's date on the first entry). Entries on a later day carry their own date ("- 2026-11-22 00:10
   Restart"), so an incident running past midnight still sorts and draws in order.
   ============================================================ */
const Timeline = {
  HEAD: /^(#{1,6})\s+timeline(?:\s+(\d{4}-\d{2}-\d{2}))?\s*$/i,
  TASK: /^(\s*(?:[-*+]|\d+[.)])\s+\[( |x|X)\]\s+)(.*)$/,
  STAMP: /\s(?:(\d{4}-\d{2}-\d{2})\s)?(\d{1,2}:\d{2})$/,             /* [1] the day when not the heading's, [2] the time */
  ENTRY: /^\s*[-*+]\s+(?:(\d{4}-\d{2}-\d{2})\s+)?(\d{1,2}:\d{2})\s+(.*)$/,   /* [1] day, [2] time, [3] text */

  now() { const d = new Date(); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); },
  today() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); },
  /* whole days from day a to day b: both read as UTC midnights, so a daylight-saving hour can't make 23 or 25 */
  days(a, b) {
    const u = function (s) { return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); };
    return a && b ? Math.round((u(b) - u(a)) / 864e5) : 0;
  },
  /* a stamp for now: the time, with the day in front when it isn't the timeline's day */
  stamp(day) { const t = Timeline.today(); return (day && t !== day ? t + " " : "") + Timeline.now(); },
  /* the heading's day, adding today's when it has none (called only when an entry is about to be made) */
  ensureDay(out, sec) {
    if (sec.day) return sec.day;
    sec.day = Timeline.today();
    out[sec.h] = out[sec.h].replace(/\s*$/, " " + sec.day);
    return sec.day;
  },
  /* the section: heading line, and where it ends (the next heading as big or bigger, or the end) */
  section(lines) {
    const h = lines.findIndex(function (l) { return Timeline.HEAD.test(l); });
    if (h < 0) return null;
    const level = Timeline.HEAD.exec(lines[h])[1].length;
    let end = h + 1;
    for (; end < lines.length; end++) { const m = /^(#{1,6})\s/.exec(lines[end]); if (m && m[1].length <= level) break; }
    return { h: h, end: end, day: Timeline.HEAD.exec(lines[h])[2] || null };
  },

  /* lines after ticking or unticking the lines at `changed`: their stamps, then the section rebuilt.
     null when the note has no Timeline heading or nothing changes. */
  apply(lines, changed) {
    const sec = Timeline.section(lines);
    if (!sec) return null;
    const out = lines.slice(), T = Timeline;
    const key = function (d, t, x) { return (d || sec.day) + " " + t + "|" + x.trim().toLowerCase(); };
    const drop = new Set();                                 /* entries of steps just unticked */
    (changed || []).forEach(function (i) {
      if (i >= sec.h && i < sec.end) return;               /* a checkbox inside the timeline itself */
      const m = T.TASK.exec(out[i] || "");
      if (!m) return;
      const done = m[2] !== " ", s = T.STAMP.exec(m[3]);
      if (done && !s) out[i] = out[i].replace(/\s+$/, "") + " " + T.stamp(T.ensureDay(out, sec));
      else if (!done && s) { drop.add(key(s[1], s[2], m[3].replace(T.STAMP, ""))); out[i] = out[i].replace(T.STAMP, ""); }
    });
    const steps = [], made = new Set();
    out.forEach(function (l, i) {
      if (i >= sec.h && i < sec.end) return;
      const m = T.TASK.exec(l);
      if (!m) return;
      const text = m[3].replace(T.STAMP, "").trim(), s = T.STAMP.exec(m[3]);
      if (m[2] !== " " && s && text) { steps.push({ day: s[1] || null, time: s[2], text: text }); made.add(key(s[1], s[2], text)); }
    });
    /* the section's own lines: entries for ticked steps are rebuilt (never twice), those of steps just
       unticked go, and your own entries and any other text stay */
    const own = [], other = [];
    for (let i = sec.h + 1; i < sec.end; i++) {
      const m = T.ENTRY.exec(out[i]);
      if (m) { const k = key(m[1], m[2], m[3]); if (!made.has(k) && !drop.has(k)) own.push({ day: m[1] || null, time: m[2], text: m[3].trim() }); }
      else if (out[i].trim() && !/^\s*[-*+]\s*$/.test(out[i])) other.push(out[i]);
    }
    const at = function (e) { return T.days(sec.day, e.day || sec.day) * 1440 + T.mins(e.time); };
    const entries = steps.concat(own).map(function (e, k) { return { e: e, k: k }; })
      .sort(function (a, b) { return at(a.e) - at(b.e) || a.k - b.k; })
      .map(function (o) { return "- " + (o.e.day && o.e.day !== sec.day ? o.e.day + " " : "") + o.e.time + " " + o.e.text; });
    const body = entries.concat(other);
    const next = out.slice(0, sec.h + 1).concat(body.length ? body : ["- "], sec.end < out.length ? [""] : [], out.slice(sec.end));
    return next.join("\n") === lines.join("\n") ? null : next;
  },
  /* your own entry: the time and text, into the section (made at the end of the note if there's none) */
  withEntry(lines, text) {
    let out = lines.slice(), sec = Timeline.section(out);
    if (!sec) { while (out.length && !out[out.length - 1].trim()) out.pop(); out = out.concat(["", "## Timeline"]); sec = Timeline.section(out); }
    out.splice(sec.end, 0, "- " + Timeline.stamp(Timeline.ensureDay(out, sec)) + " " + String(text).replace(/\s+/g, " ").trim());
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
    for (let i = sec.h + 1; i < sec.end; i++) { const m = Timeline.ENTRY.exec(p.lines[i]); if (m) rows.push((m[1] ? m[1] + " " : "") + m[2] + " " + m[3].trim()); }
    const n = p.note(), day = sec.day || Timeline.today();
    const d = new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)));
    return (n ? n.title + ", " : "") + d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) + "\n" + rows.join("\n");
  },
  copy(p, btn) {
    const t = Timeline.text(p);
    if (!t) { pushToastLike("This note has no ## Timeline section."); return; }
    copyText(t);
    if (btn) { btn.textContent = "Copied"; btn.classList.add("done"); setTimeout(function () { if (btn.isConnected) { btn.textContent = "Copy timeline"; btn.classList.remove("done"); } }, 1500); }
    else pushToastLike("Timeline copied.");
  }
};
/* ---- the strip: the Timeline drawn on a time axis under its heading ----
   Each entry is a dot (filled: a ticked step; hollow: an entry of your own) with its label in the first
   row where it fits; the stretches between entries are shaded, a long wait is marked with its length,
   and "now" shows while the work is still going. Hover a dot for its detail, click it (or Enter) to go to
   the step, drag to pan, Ctrl+scroll or the buttons to zoom, Fit to see it all. */
Object.assign(Timeline, {
  mins(t) { const p = String(t).split(":"); return +p[0] * 60 + +p[1]; },
  hm(m) { m = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); },
  dur(m) { m = Math.round(m); return m >= 60 ? Math.floor(m / 60) + " h" + (m % 60 ? " " + String(m % 60).padStart(2, "0") + " min" : "") : m + " min"; },
  /* the section's entries, each with the line a click goes to: its ticked step, or the entry itself */
  data(lines) {
    const sec = Timeline.section(lines);
    if (!sec) return null;
    const steps = {};
    lines.forEach(function (l, i) {
      if (i >= sec.h && i < sec.end) return;
      const m = Timeline.TASK.exec(l), s = m && Timeline.STAMP.exec(m[3]);
      if (m && m[2] !== " " && s) steps[(s[1] || sec.day) + " " + s[2] + "|" + m[3].replace(Timeline.STAMP, "").trim().toLowerCase()] = i;
    });
    const out = [];
    for (let i = sec.h + 1; i < sec.end; i++) {
      const m = Timeline.ENTRY.exec(lines[i]);
      if (!m) continue;
      const k = (m[1] || sec.day) + " " + m[2] + "|" + m[3].trim().toLowerCase(), step = Object.prototype.hasOwnProperty.call(steps, k);
      out.push({ t: Timeline.days(sec.day, m[1] || sec.day) * 1440 + Timeline.mins(m[2]), time: (m[1] ? m[1].slice(5) + " " : "") + m[2], text: m[3].trim(), line: step ? steps[k] : i, step: step, day: sec.day });
    }
    out.sort(function (x, y) { return x.t - y.t; });     /* a hand-edited section can be out of order */
    return out.length ? out : null;
  },
  fit(d) {
    const a = d[0].t, b = d[d.length - 1].t, pad = Math.max(5, (b - a) * 0.06);
    return b - a < 10 ? { a: a - 15, b: b + 15 } : { a: a - pad, b: b + pad };
  },
  /* the strip's inside for the window of time v ({ a, b } in minutes) at width w px */
  inner(d, v, w) {
    const span = Math.max(1, v.b - v.a), X = function (m) { return (m - v.a) / span * 100; }, E = esc;
    const total = d[d.length - 1].t - d[0].t;
    let gapMax = 0;
    for (let i = 1; i < d.length; i++) gapMax = Math.max(gapMax, d[i].t - d[i - 1].t);
    const h = '<span class="tl-bar"><span class="tl-sum">' + d.length + (d.length === 1 ? " entry" : " entries") +
      (total ? " · " + Timeline.dur(total) + " from first to last" : "") + (gapMax >= 15 && d.length > 2 ? " · longest wait " + Timeline.dur(gapMax) : "") + "</span>" +
      '<button type="button" class="tl-btn" data-tl-act="out" title="Zoom out" aria-label="Zoom out">−</button>' +
      '<button type="button" class="tl-btn" data-tl-act="in" title="Zoom in (Ctrl+scroll)" aria-label="Zoom in">+</button>' +
      '<button type="button" class="tl-btn" data-tl-act="fit" title="Show all of it">Fit</button></span>';
    /* ticks at a round step: about one per 90px */
    const steps = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360], want = span / Math.max(2, w / 90);
    const st = steps.find(function (x) { return x >= want; }) || 720;
    let track = "";
    for (let m = Math.ceil(v.a / st) * st; m <= v.b; m += st) track += '<span class="tl-tick" style="left:' + X(m).toFixed(2) + '%"><b>' + Timeline.hm(m) + "</b></span>";
    /* the stretches between entries; a long wait is marked */
    for (let i = 1; i < d.length; i++) {
      const dt = d[i].t - d[i - 1].t, long = dt >= 15 && dt >= total * 0.25 && d.length > 2;
      track += '<span class="tl-seg' + (long ? " tl-gap" : "") + '" style="left:' + X(d[i - 1].t).toFixed(2) + "%;width:" + (dt / span * 100).toFixed(2) + '%">' +
        (long ? "<em>" + Timeline.dur(dt) + "</em>" : "") + "</span>";
    }
    const nowM = Timeline.days(d[0].day, Timeline.today()) * 1440 + Timeline.mins(Timeline.now()), last = d[d.length - 1].t, since = nowM - last;
    if (since >= 0 && since < 360 && nowM <= v.b) track += '<span class="tl-now" style="left:' + X(nowM).toFixed(2) + '%"><b>now</b></span>';
    /* labels: each in the first row it fits in (rows below the axis); near the right edge a label
       reads leftwards from its dot so it isn't cut off */
    let lastPx = -1e9;                                       /* dots in the same minute sit side by side, not on top of each other */
    const rows = [], cw = 6.4, fits = function (row, a2, b2) { return row.every(function (s2) { return b2 <= s2[0] || a2 >= s2[1]; }); };
    d.forEach(function (e, i) {
      const x = X(e.t), lw = ((e.time.length + e.text.length + 1) * cw + 14) / Math.max(1, w) * 100, right = x + lw > 100 && x - lw >= 0;
      const a2 = right ? x - lw : x, b2 = right ? x : x + lw;
      let r = 0;
      while (rows[r] && !fits(rows[r], a2, b2)) r++;
      (rows[r] = rows[r] || []).push([a2, b2]);
      const px = x / 100 * w, nudge = px - lastPx < 13 ? lastPx + 13 - px : 0;
      lastPx = px + nudge;
      const prev = i ? Math.round(e.t - d[i - 1].t) : null;
      const tip = e.time + " " + e.text + " — " + (e.step ? "a ticked step" : "your entry") + (prev !== null ? ", " + Timeline.dur(prev) + " after the one before" : ", the first") + ". Click to go to it.";
      track += '<button type="button" class="tl-dot' + (e.step ? "" : " tl-own") + (right ? " tl-right" : "") + (x < -1 || x > 101 ? " tl-off" : "") + '" style="left:calc(' + x.toFixed(2) + "% + " + Math.round(nudge) + "px);--row:" + r +
        '" data-line="' + e.line + '" title="' + E(tip) + '"><i></i><span class="tl-lbl"><b>' + E(e.time) + "</b> " + E(e.text) + "</span></button>";
    });
    return h + '<span class="tl-track" style="--rows:' + Math.max(1, rows.length) + '">' + '<span class="tl-axis"></span>' + track + "</span>";
  },
  strip(d) {
    const v = Timeline.fit(d);
    return '<span data-deco="1" class="tl-strip" data-tl="' + esc(JSON.stringify(d)) + '" data-a="' + v.a + '" data-b="' + v.b + '" aria-label="Timeline, drawn on a time axis">' +
      Timeline.inner(d, v, 640) + "</span>";
  },
  redraw(el, v) {
    const d = JSON.parse(el.dataset.tl);
    el.dataset.a = v.a; el.dataset.b = v.b;
    el.innerHTML = Timeline.inner(d, v, el.clientWidth || 640);
  },
  zoom(el, f, at) {
    const a = +el.dataset.a, b = +el.dataset.b, c = at == null ? (a + b) / 2 : at, span = Math.max(4, Math.min(1440, (b - a) / f));
    const k = (c - a) / (b - a || 1);
    Timeline.redraw(el, { a: c - span * k, b: c - span * k + span });
  },
  go(el, line) {
    const p = panes.filter(function (q) { return q.root.contains(el); })[0];
    if (!p || !(line >= 0) || line >= p.lines.length) return;
    p.setActive(line, p.lines[line].length);
    p.keepVisible(line);
    const node = p.linesEl.children[line];
    if (node) { node.classList.add("tl-flash"); setTimeout(function () { node.classList.remove("tl-flash"); }, 900); }
  }
});
/* the strip's mouse: never puts the heading into editing; drag pans, a click on a dot goes to it */
document.addEventListener("mousedown", function (e) {
  const el = e.target.closest && e.target.closest(".tl-strip");
  if (!el || e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  const act = e.target.closest("[data-tl-act]");
  if (act) {
    if (act.dataset.tlAct === "fit") Timeline.redraw(el, Timeline.fit(JSON.parse(el.dataset.tl)));
    else Timeline.zoom(el, act.dataset.tlAct === "in" ? 1.6 : 1 / 1.6);
    return;
  }
  const dot = e.target.closest(".tl-dot"), sx = e.clientX, a0 = +el.dataset.a, b0 = +el.dataset.b, w = el.clientWidth || 640;
  let moved = false;
  const move = function (ev) {
    const dx = ev.clientX - sx;
    if (!moved && Math.abs(dx) < 4) return;
    moved = true; el.classList.add("tl-panning");
    const dm = -dx / w * (b0 - a0);
    Timeline.redraw(el, { a: a0 + dm, b: b0 + dm });
  };
  const up = function () {
    window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up);
    el.classList.remove("tl-panning");
    if (!moved && dot) Timeline.go(el, +dot.dataset.line);
  };
  window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
}, true);
document.addEventListener("wheel", function (e) {
  const el = (e.ctrlKey || e.metaKey) && e.target.closest && e.target.closest(".tl-strip");
  if (!el) return;
  e.preventDefault();
  const r = el.getBoundingClientRect(), a = +el.dataset.a, b = +el.dataset.b;
  Timeline.zoom(el, e.deltaY < 0 ? 1.25 : 0.8, a + (e.clientX - r.left) / (r.width || 1) * (b - a));
}, { passive: false, capture: true });
document.addEventListener("keydown", function (e) {
  const dot = e.target.closest && e.target.closest(".tl-dot");
  if (!dot || (e.key !== "Enter" && e.key !== " ")) return;
  e.preventDefault(); e.stopPropagation();
  Timeline.go(dot.closest(".tl-strip"), +dot.dataset.line);
}, true);
/* the date picker on the Timeline heading: opens the browser's own calendar without putting the heading
   into editing; a picked day goes into the heading (cleared: taken out) */
document.addEventListener("mousedown", function (e) {
  const b = e.target.closest && e.target.closest(".tl-date");
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  try { b.showPicker(); } catch (err) { b.focus(); }
}, true);
document.addEventListener("change", function (e) {
  const b = e.target.closest && e.target.closest(".tl-date");
  const p = b && panes.filter(function (q) { return q.root.contains(b); })[0];
  if (!p) return;
  const lines = p.lines.slice(), sec = Timeline.section(lines);
  if (!sec || (b.value || null) === sec.day) return;
  lines[sec.h] = lines[sec.h].replace(/\s+\d{4}-\d{2}-\d{2}\s*$/, "").replace(/\s*$/, b.value ? " " + b.value : "");
  Timeline.write(p, Timeline.apply(lines, []) || lines);
});
/* the button on the Timeline heading: copies without putting the heading into editing */
document.addEventListener("mousedown", function (e) {
  const b = e.target.closest && e.target.closest(".tl-copy");
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const p = panes.filter(function (q) { return q.root.contains(b); })[0];
  if (p) Timeline.copy(p, b);
}, true);
