/* ============================================================
   Pop out: a note in its own window, as VS Code's "Move into new window". The window runs this same
   app (index.html#popout=<id>) showing just that note. It never saves anything itself: its storage is
   a read-only copy (html/02-body.html), and every edit goes back to this window, which saves it as
   usual. Edits made here go to it, so both show the same text. Works in every browser that opens
   pop-ups, and in the desktop app (desktop/main.js lets these windows open).
   ============================================================ */
const PopOut = {
  sat: /^#popout=/.test(location.hash) && !!window.opener,   /* this window is a popped-out note */
  satId: null,
  wins: new Map(),                                  /* main window: note id -> its window */
  applying: null,
  timers: new Map(),

  /* main window: pop the note out (the pane's current one, or `id`), moving it out of the pane */
  open(p, id, sx, sy) {
    if (id == null) id = p && p.type === "note" ? p.noteId : null;
    const n = id != null ? findNote(id) : null;
    if (!n) { pushToastLike("Open a note first."); return; }
    const key = String(n.id), had = PopOut.wins.get(key);
    if (had && !had.closed) { had.focus(); return; }
    syncAllPanes();
    const at = sx != null ? ",left=" + Math.max(0, Math.round(sx - 120)) + ",top=" + Math.max(0, Math.round(sy - 20)) : "";   /* where a dragged tab was let go */
    const w = window.open(location.href.split("#")[0] + "#popout=" + encodeURIComponent(key), "cfpop" + key.replace(/\W/g, "_"), "popup,width=760,height=860" + at);
    if (!w) { pushToastLike("The browser blocked the new window. Allow pop-ups for this page, then try again."); return; }
    PopOut.wins.set(key, w);
    if (p && p.tabs.some(function (t) { return sameId(t, n.id); })) p.closeTab(n.id);
  },
  /* a drag that ended outside this window (screen coordinates; 0,0 is what some systems report when they don't know) */
  outside(e) {
    const x = e.screenX, y = e.screenY;
    if (!x && !y) return false;
    return x < window.screenX || y < window.screenY || x > window.screenX + window.outerWidth || y > window.screenY + window.outerHeight;
  },
  /* main window: a popped-out note is shown by focusing its window instead of opening it again */
  reveal(id) {
    const w = PopOut.wins.get(String(id));
    if (!w || w.closed) { PopOut.wins.delete(String(id)); return false; }
    w.focus();
    return true;
  },
  winOf(source) {
    let key = null;
    PopOut.wins.forEach(function (w, k) { if (w === source) key = k; });
    return key;
  },
  post(w, msg) { try { w.postMessage(msg, "*"); } catch (e) { /* closed */ } },

  /* markDirty calls this: the edit goes to the other window, a moment later (typing stays smooth) */
  changed(n) {
    const key = String(n.id);
    if (PopOut.applying === key) return;
    const target = PopOut.sat ? (key === PopOut.satId ? window.opener : null) : PopOut.wins.get(key);
    if (!target || target.closed) return;
    clearTimeout(PopOut.timers.get(key));
    PopOut.timers.set(key, setTimeout(function () { PopOut.flush(key); }, 150));
  },
  flush(key) {
    clearTimeout(PopOut.timers.get(key)); PopOut.timers.delete(key);
    syncAllPanes();
    const n = findNote(key), target = PopOut.sat ? window.opener : PopOut.wins.get(key);
    if (PopOut.sat) PopOut.dirty = true;                       /* until the main window says it has it */
    if (n && target && !target.closed) PopOut.post(target, { cf: PopOut.sat ? "pop-edit" : "pop-update", id: key, content: n.content });
  },
  /* text from the other window: taken, and panes showing it are redrawn unless you're typing in one */
  take(key, content) {
    const n = findNote(key);
    if (!n || typeof content !== "string" || n.content === content) return;
    syncAllPanes();
    PopOut.applying = key;
    n.content = content;
    if (!PopOut.sat) markDirty(n);
    PopOut.applying = null;
    panes.forEach(function (q) {
      if (q.type !== "note" || !sameId(q.noteId, n.id)) return;
      if (q.activeLine !== null && document.hasFocus()) return;
      q.deactivate(); q.reload(); q.render();
    });
  },

  /* the popped-out window starts here instead of loading notes (45-boot.js) */
  boot(first) {
    PopOut.satId = decodeURIComponent(location.hash.slice("#popout=".length));
    document.body.classList.add("cf-popout");
    PopOut.post(window.opener, { cf: "pop-ready", id: PopOut.satId });
    window.addEventListener("pagehide", function () {
      if (PopOut.timers.has(PopOut.satId)) PopOut.flush(PopOut.satId);
      PopOut.post(window.opener, { cf: "pop-closed", id: PopOut.satId });
    });
    PopOut.first = first;
    /* Staying in touch: every 1.5 s this window says hello, with its text if the main window hasn't
       confirmed the last edit. No answer (the main window was reloaded and is still loading, or closed):
       a bar says changes aren't being saved. When it answers again, the unsaved text goes over. */
    PopOut.lastAck = Date.now();
    setInterval(function () {
      const gone = !window.opener || window.opener.closed;
      if (!gone) {
        const n = findNote(PopOut.satId);
        if (PopOut.timers.has(PopOut.satId)) PopOut.flush(PopOut.satId);
        PopOut.post(window.opener, { cf: "pop-hello", id: PopOut.satId, content: PopOut.dirty && n ? n.content : null });
      }
      PopOut.offline(gone ? "closed" : Date.now() - PopOut.lastAck > 4000 ? "lost" : null);
    }, 1500);
  },
  /* the bar shown while edits here can't reach the main window */
  offline(why) {
    let bar = document.getElementById("popOffline");
    if (!why) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "popOffline"; bar.className = "pop-offline"; bar.setAttribute("role", "alert");
      bar.innerHTML = '<span class="pop-offline-text"></span><button type="button" class="btn-mini">Copy this note</button>';
      bar.querySelector("button").addEventListener("click", function () {
        syncAllPanes();
        const n = findNote(PopOut.satId);
        if (n && navigator.clipboard) navigator.clipboard.writeText(n.content).then(function () { pushToastLike("Copied. Paste it into the note in the main window."); }, function () { pushToastLike("Couldn't copy: select the text and copy it yourself."); });
      });
      document.body.insertBefore(bar, document.body.firstChild);
    }
    bar.querySelector(".pop-offline-text").textContent = why === "closed"
      ? "The main CarbonFibre window is closed, so changes here aren't saved. Copy this note before you close this window."
      : "Lost touch with the main CarbonFibre window, so changes here aren't being saved yet. They'll be saved when it's back.";
  },
  start(d) {
    if (!d.note) { document.title = "Note not found"; return; }
    if (d.theme === "light") document.documentElement.setAttribute("data-theme", "light"); else document.documentElement.removeAttribute("data-theme");
    /* other notes are known by name only, so [[links]] show as links; opening one asks the main window */
    state.notes = (d.titles || []).filter(function (t) { return String(t.id) !== String(d.note.id); })
      .map(function (t) { return { id: t.id, title: t.title, path: t.path || t.title, content: "" }; })
      .concat([{ id: d.note.id, title: d.note.title, path: d.note.path || d.note.title, content: d.note.content }]);
    document.title = d.note.title + " — CarbonFibre";
    PopOut.first.tabs = [];
    PopOut.first.open(d.note.id);
    renderPanes();
  },

  init() {
    window.addEventListener("message", function (e) {
      const d = e.data;
      if (!d || typeof d.cf !== "string" || d.cf.indexOf("pop-") !== 0) return;
      if (PopOut.sat) {
        if (e.source !== window.opener) return;                 /* only the window that opened this one */
        if (d.cf === "pop-ack") { PopOut.lastAck = Date.now(); if (d.saved) PopOut.dirty = false; PopOut.offline(null); }
        else if (d.cf === "pop-note") PopOut.start(d);
        else if (d.cf === "pop-update" && String(d.id) === PopOut.satId) PopOut.take(PopOut.satId, d.content);
        return;
      }
      let key = PopOut.winOf(e.source);
      /* after a reload this window has forgotten its popped-out notes: one it opened says hello again */
      if (key === null) { try { if (e.source && e.source.opener === window) { key = String(d.id); PopOut.wins.set(key, e.source); } } catch (err) { /* not ours */ } }
      if (key === null || String(d.id) !== key) return;       /* only windows this one opened, about their own note */
      const n = findNote(key);
      if (d.cf === "pop-ready") {
        syncAllPanes();
        PopOut.post(e.source, { cf: "pop-note", theme: document.documentElement.getAttribute("data-theme") || "",
          note: n ? { id: n.id, title: n.title, path: n.path, content: n.content } : null,
          titles: state.notes.map(function (x) { return { id: x.id, title: x.title, path: x.path }; }) });
      } else if (d.cf === "pop-edit" || d.cf === "pop-hello") {
        if (n && typeof d.content === "string") PopOut.take(key, d.content);
        /* saved: true only once the note is here to take it (a folder may still be loading) */
        PopOut.post(e.source, { cf: "pop-ack", id: key, saved: !!n && typeof d.content === "string" });
      }
      else if (d.cf === "pop-open" && findNote(d.to)) { window.focus(); openInPane(findNote(d.to).id); }
      else if (d.cf === "pop-closed") setTimeout(function () { if (e.source.closed) PopOut.wins.delete(key); }, 500);   /* a reload says it too */
    });
  }
};
PopOut.init();
