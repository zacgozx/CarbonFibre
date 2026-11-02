/* ---- the chime: two soft tones, made with Web Audio so there is no sound file ---- */
function timerChime() {
  if (!timePrefs.sound) return;
  try {
    if (!timerAudio) timerAudio = new (window.AudioContext || window.webkitAudioContext)();
    var ctx = timerAudio, now = ctx.currentTime;
    [[660, 0], [880, 0.22]].forEach(function (n) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = n[0];
      g.gain.setValueAtTime(0.0001, now + n[1]);
      g.gain.exponentialRampToValueAtTime(0.18, now + n[1] + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + n[1] + 0.5);
      o.connect(g); g.connect(ctx.destination);
      o.start(now + n[1]); o.stop(now + n[1] + 0.55);
    });
  } catch (e) {}
}
function timerNotify(title, body) {
  try {
    if (window.Notification && Notification.permission === "granted") new Notification(title, { body: body, silent: true });
  } catch (e) {}
}

/* ---- start, pause, extend, finish ---- */
function timerStart(task, minutes, noteId) {
  if (timer && timer.boardUid) { tbPending[timer.boardUid] = "open"; timerFinish(true); }   /* a board task in progress is logged, not lost */
  timer = { task: task || "Focus", noteId: noteId == null ? null : noteId, planned: minutes * 60000,
            startedAt: Date.now(), pausedMs: 0, pausedAt: null, alerted: false };
  timePrefs.minutes = minutes; timePrefsSave();
  timerSave();
  /* audio and notifications both need a user gesture to be allowed later, and Start is one */
  try { if (!timerAudio) timerAudio = new (window.AudioContext || window.webkitAudioContext)(); timerAudio.resume(); } catch (e) {}
  try { if (window.Notification && Notification.permission === "default") Notification.requestPermission(); } catch (e) {}
  timerRun();
  timerRender();
}
function timerPause() {
  if (!timer) return;
  if (timer.pausedAt) { timer.pausedMs += Date.now() - timer.pausedAt; timer.pausedAt = null; }
  else timer.pausedAt = Date.now();
  timerSave(); timerRender();
}
function timerExtend(minutes) {
  if (!timer) return;
  timer.planned += minutes * 60000;
  if (timerElapsed() < timer.planned) timer.alerted = false;     /* back under: alert again at the new end */
  timerSave(); timerHideAlert(); timerRender();
}
/* Done logs the block; discard throws it away. Either way the timer stops. */
function timerFinish(keep) {
  if (!timer) return;
  var actual = timerElapsed(), boardUid = timer.boardUid;
  if (keep && actual >= 30000) {                     /* under half a minute is a mis-click, not a block */
    var entry = { task: timer.task, noteId: timer.noteId, start: timer.startedAt, end: Date.now(),
                  planned: timer.planned, actual: actual };
    timeLog.push(entry);
    timeLogSave();
    if (timePrefs.logToNote) timerLogToNote(entry);
  }
  timer = null;
  timerSave(); timerHideAlert();
  if (timerTick) { clearInterval(timerTick); timerTick = null; }
  timerRender();
  if (boardUid) tbTimerEnded(boardUid, actual, keep);     /* the task board gets the time */
}

/* one line at the end of the task's note: when, how long, and how that compared to the plan */
function timerLogToNote(e) {
  var n = e.noteId == null ? null : findNote(e.noteId);
  if (!n) return;
  var over = e.actual - e.planned;
  var line = "- Time block " + new Date(e.start).toISOString().slice(0, 10) + " " + hhmm(e.start) + "-" + hhmm(e.end) +
    ": " + fmtMins(e.actual) + " (planned " + fmtMins(e.planned) +
    (Math.abs(over) >= 60000 ? ", " + (over > 0 ? "+" : "-") + fmtMins(Math.abs(over)) + (over > 0 ? " over" : " under") : "") + ")";
  var host = null;
  panes.forEach(function (q) { if (!host && q.type === "note" && sameId(q.noteId, n.id)) host = q; });
  if (host) {
    host.sync();
    histBreak(host);
    if (host.lines.length && host.lines[host.lines.length - 1].trim() !== "") host.lines.push("");
    host.lines.push(line);
    host.commit(true);
    if (host.activeLine === null) host.render();
  } else {
    n.content = n.content.replace(/\s*$/, "") + "\n\n" + line + "\n";
    markDirty(n);
  }
}

/* ---- the clock: redraw every second, fire the alert once when the block runs out ---- */
function timerRun() {
  if (timerTick) clearInterval(timerTick);
  timerTick = setInterval(function () {
    if (!timer) return;
    if (!timer.pausedAt && !timer.alerted && timerElapsed() >= timer.planned) {
      timer.alerted = true; timerSave();
      timerChime();
      timerNotify("Time's up: " + timer.task, "Planned " + fmtMins(timer.planned) + ". Wrap up or extend.");
      timerShowAlert();
    }
    timerRender();
  }, 1000);
}

var BASE_TITLE = document.title;
function timerRender() {
  if (typeof tbTickAll === "function") tbTickAll();
  var pill = document.getElementById("btnTimer"), bar = document.getElementById("timerBar");
  if (!pill) return;
  var label = pill.querySelector(".tm-label");
  pill.classList.remove("running", "warn", "over", "paused");
  if (!timer) {
    label.textContent = "Timer";
    pill.title = "Time-block a task (Alt+T)";
    bar.style.transform = "scaleX(0)"; bar.className = "timer-bar";
    document.title = BASE_TITLE;
  } else {
    var el = timerElapsed(), left = timer.planned - el, over = left < 0;
    var frac = Math.min(1, el / timer.planned);
    pill.classList.add("running");
    if (timer.pausedAt) pill.classList.add("paused");
    else if (over) pill.classList.add("over");
    else if (left <= Math.min(120000, timer.planned * 0.2)) pill.classList.add("warn");   /* last 2 min, or last fifth */
    label.textContent = (over ? "+" : "") + fmtClock(left) + "  " + timer.task;
    pill.title = timer.task + " - " + (over ? fmtClock(left) + " over" : fmtClock(left) + " left") + " of " + fmtMins(timer.planned);
    bar.style.transform = "scaleX(" + Math.min(1, frac) + ")";
    bar.className = "timer-bar" + (over ? " over" : left <= Math.min(120000, timer.planned * 0.2) ? " warn" : "") + (timer.pausedAt ? " paused" : "");
    /* the tab title carries the clock, so it is visible from other apps too */
    document.title = (timer.pausedAt ? "Paused " : over ? "+" : "") + fmtClock(left) + " " + timer.task + " - " + BASE_TITLE;
  }
  if (document.getElementById("timerPop").classList.contains("show")) timerRenderPop();
}

/* ---- the time's-up banner ---- */
function timerShowAlert() {
  var a = document.getElementById("timerAlert");
  a.querySelector(".ta-text").textContent = "Time's up: " + timer.task + " (planned " + fmtMins(timer.planned) + ")";
  a.classList.add("show");
}
function timerHideAlert() { document.getElementById("timerAlert").classList.remove("show"); }

/* ---- the panel ---- */
function timerToday() {
  var start = new Date(); start.setHours(0, 0, 0, 0);
  return timeLog.filter(function (e) { return e.start >= start.getTime(); });
}
function timerRenderPop() {
  var idle = document.getElementById("tmIdle"), run = document.getElementById("tmRun");
  idle.style.display = timer ? "none" : "";
  run.style.display = timer ? "" : "none";
  if (timer) {
    var el = timerElapsed(), left = timer.planned - el;
    document.getElementById("tmTask").textContent = timer.task;
    var big = document.getElementById("tmBig");
    big.textContent = (left < 0 ? "+" : "") + fmtClock(left);
    big.className = "tm-big" + (left < 0 ? " over" : "");
    document.getElementById("tmSub").textContent = timer.pausedAt ? "Paused"
      : left < 0 ? "Over by " + fmtClock(left) + " - planned " + fmtMins(timer.planned)
      : "of " + fmtMins(timer.planned) + " - started " + hhmm(timer.startedAt);
    document.getElementById("tmPause").textContent = timer.pausedAt ? "Resume" : "Pause";
  }
  var list = document.getElementById("tmLog"), today = timerToday();
  if (!today.length) { list.innerHTML = '<div class="tm-empty">No blocks logged today.</div>'; }
  else {
    list.innerHTML = today.slice().reverse().map(function (e) {
      var over = e.actual - e.planned;
      var cls = over > 60000 ? "over" : over < -60000 ? "under" : "";
      return '<div class="tm-row"><span class="tm-when">' + hhmm(e.start) + '</span><span class="tm-what">' + esc(e.task) +
        '</span><span class="tm-act ' + cls + '">' + fmtMins(e.actual) + '</span><span class="tm-plan">/ ' + fmtMins(e.planned) + "</span></div>";
    }).join("");
  }
  var tp = today.reduce(function (n, e) { return n + e.planned; }, 0);
  var ta = today.reduce(function (n, e) { return n + e.actual; }, 0);
  var overs = today.filter(function (e) { return e.actual - e.planned > 60000; }).length;
  document.getElementById("tmTotals").textContent = today.length
    ? today.length + (today.length === 1 ? " block" : " blocks") + " - " + fmtMins(ta) + " spent against " + fmtMins(tp) + " planned" +
      (overs ? " - " + overs + " ran over" : "")
    : "";
}
function timerOpenPop() {
  var pop = document.getElementById("timerPop");
  var fp = focusedPane || panes[0], n = fp && fp.note ? fp.note() : null;
  if (!timer) {
    var inp = document.getElementById("tmTaskIn");
    if (!inp.value || inp.dataset.auto === "1") { inp.value = n ? n.title : ""; inp.dataset.auto = "1"; }
    document.getElementById("tmMins").value = timePrefs.minutes;
    Array.prototype.forEach.call(document.querySelectorAll("[data-mins]"), function (b) {
      b.classList.toggle("on", +b.dataset.mins === timePrefs.minutes);
    });
    document.getElementById("tmLogNote").checked = !!timePrefs.logToNote;
    document.getElementById("tmSound").checked = !!timePrefs.sound;
  }
  pop.classList.add("show");
  document.getElementById("timerAlert").classList.add("behind");
  timerRenderPop();
  if (!timer) setTimeout(function () { document.getElementById("tmTaskIn").focus(); }, 0);
}
function timerClosePop() {
  document.getElementById("timerPop").classList.remove("show");
  document.getElementById("timerAlert").classList.remove("behind");
}

function timerWire() {
  var pop = document.getElementById("timerPop");
  document.getElementById("btnTimer").addEventListener("click", function (e) {
    e.stopPropagation();
    if (pop.classList.contains("show")) timerClosePop(); else timerOpenPop();
  });
  pop.addEventListener("click", function (e) { e.stopPropagation(); });
  document.addEventListener("click", timerClosePop);
  document.getElementById("tmTaskIn").addEventListener("input", function () { this.dataset.auto = "0"; });
  Array.prototype.forEach.call(document.querySelectorAll("[data-mins]"), function (b) {
    b.addEventListener("click", function () {
      document.getElementById("tmMins").value = b.dataset.mins;
      Array.prototype.forEach.call(document.querySelectorAll("[data-mins]"), function (x) { x.classList.toggle("on", x === b); });
    });
  });
  function go() {
    var mins = Math.max(1, Math.min(480, parseInt(document.getElementById("tmMins").value, 10) || 25));
    var fp = focusedPane || panes[0], n = fp && fp.note ? fp.note() : null;
    timePrefs.logToNote = document.getElementById("tmLogNote").checked;
    timePrefs.sound = document.getElementById("tmSound").checked;
    timePrefsSave();
    var task = document.getElementById("tmTaskIn").value.trim() || (n ? n.title : "Focus");
    timerStart(task, mins, n ? n.id : null);
    document.getElementById("tmTaskIn").dataset.auto = "1";
    timerClosePop();
  }
  document.getElementById("tmStart").addEventListener("click", go);
  ["tmTaskIn", "tmMins"].forEach(function (id) {
    document.getElementById(id).addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); go(); }
      if (e.key === "Escape") { e.preventDefault(); timerClosePop(); }
    });
  });
  document.getElementById("tmPause").addEventListener("click", timerPause);
  document.getElementById("tmPlus5").addEventListener("click", function () { timerExtend(5); });
  document.getElementById("tmPlus15").addEventListener("click", function () { timerExtend(15); });
  document.getElementById("tmDone").addEventListener("click", function () { timerFinish(true); });
  document.getElementById("tmDiscard").addEventListener("click", function () {
    if (window.confirm("Discard this block without logging it?")) timerFinish(false);
  });
  document.getElementById("tmClear").addEventListener("click", function () {
    var today = timerToday();
    if (!today.length || !window.confirm("Clear today's " + today.length + " logged block(s)?")) return;
    var cut = new Date(); cut.setHours(0, 0, 0, 0);
    timeLog = timeLog.filter(function (e) { return e.start < cut.getTime(); });
    timeLogSave(); timerRenderPop();
  });
  /* the banner */
  document.getElementById("taDone").addEventListener("click", function () { timerFinish(true); });
  document.getElementById("taPlus5").addEventListener("click", function () { timerExtend(5); });
  document.getElementById("taKeep").addEventListener("click", timerHideAlert);

  if (timer) {                                       /* a block was running before the refresh */
    timerRun();
    if (!timer.pausedAt && timer.alerted && timerElapsed() >= timer.planned) timerShowAlert();
  }
  timerRender();
}

