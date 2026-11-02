/* ============================================================
   chrome + shortcuts
   ============================================================ */

document.getElementById("btnNew").addEventListener("click", function () { createNote(""); });
document.getElementById("btnNewFolder").addEventListener("click", createFolder);

/* Switch theme. CSS follows the attribute by itself; canvases have to be repainted, and the
   palette and template strips are drawn once, so they are rebuilt next time they open. */
/* Windows' light/dark setting, as Edge reports it */
function systemTheme() {
  try { return window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"; }
  catch (e) { return "dark"; }
}
function savedTheme() {
  try { var t = localStorage.getItem("carbonfibre-theme"); return t === "light" || t === "dark" ? t : null; }
  catch (e) { return null; }
}
/* The button: picking the theme Windows already uses clears the override, so you go back
   to following Windows. Picking the other one saves it as your choice. */
function toggleTheme() {
  var next = isLight() ? "dark" : "light";
  try {
    if (next === systemTheme()) localStorage.removeItem("carbonfibre-theme");
    else storeSet("carbonfibre-theme", next);
  } catch (e) {}
  setTheme(next);
}
/* ---- the app icon: an origami butterfly resting on a sheet of note paper ----
   Drawn in the current theme's colours for the tab's favicon and the logo in the top bar,
   and redrawn whenever the theme changes. The wings are folded facets in light, mid and
   dark tones with crease lines; the sheet is tilted, ruled, with a folded corner. */
var APP_ICON_PALETTE = {
  dark:  { tile: "#1a1a1f", paper: "#ece4e1", paperEdge: "#3a1f26", fold: "#fbf6f4", foldShade: 0.30, rule: "#ddd0cc",
           hi: "#e8b3a3", lite: "#d4917c", mid: "#b56a52", deep: "#9b3d4b", body: "#2a1418", shadow: 0.24, crease: "#fff2ee" },
  light: { tile: "#eef6fb", paper: "#ffffff", paperEdge: "#a9cde1", fold: "#aed4e8", foldShade: 0.14, rule: "#e3eff6",
           hi: "#aed4e8", lite: "#8ec3df", mid: "#2e86ab", deep: "#1a6585", body: "#0f2b3d", shadow: 0.16, crease: "#ffffff" }
};
function appIconSvg(pal) {
  var P = function (pts, fill, extra) { return '<polygon points="' + pts + '" fill="' + fill + '"' + (extra || "") + '/>'; };
  /* right half of the butterfly (local coordinates, body on x = 0); the left half mirrors it */
  var half = function (sx, tones) {
    var m = function (pts) { return pts.split(" ").map(function (p) { var q = p.split(","); return (sx * +q[0]) + "," + q[1]; }).join(" "); };
    return [
      /* upper wing: four folded facets */
      P(m("6,-24 124,-84 62,-14"), tones[0]),
      P(m("6,-24 62,-14 6,6"), tones[1]),
      P(m("62,-14 124,-84 108,4"), tones[2]),
      P(m("6,6 62,-14 108,4"), tones[3]),
      /* lower wing: two facets, smaller, dropping down and in */
      P(m("6,10 86,22 64,88"), tones[1]),
      P(m("6,10 64,88 22,72"), tones[2]),
      /* the creases: where the paper was folded */
      '<path d="M' + m("6,-24 124,-84").replace(" ", " L") + ' M' + m("62,-14 6,6").replace(" ", " L") + ' M' + m("62,-14 108,4").replace(" ", " L") +
        ' M' + m("6,10 64,88").replace(" ", " L") + '" fill="none" stroke="' + tones[4] + '" stroke-opacity="0.55" stroke-width="2.4" stroke-linecap="round"/>'
    ].join("");
  };
  var silhouette = "0,-56 124,-84 108,4 86,22 64,88 22,72 0,66 -22,72 -64,88 -86,22 -108,4 -124,-84";
  var page = "M-160 -184 L86 -184 L160 -110 L160 184 L-160 184 Z";
  var rules = "";
  for (var y = -128; y <= 150; y += 40) rules += '<rect x="-126" y="' + y + '" width="' + (y < -95 ? 176 : 252) + '" height="6" rx="3" fill="' + pal.rule + '"/>';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">' +
    '<rect width="512" height="512" rx="112" fill="' + pal.tile + '"/>' +
    /* the sheet: tilted, ruled, with a folded corner */
    '<g transform="translate(256 258) rotate(-6)">' +
      '<path d="' + page + '" fill="' + pal.paperEdge + '" transform="translate(7 10)"/>' +
      '<path d="' + page + '" fill="' + pal.paper + '"/>' + rules +
      '<path d="M86 -184 L86 -110 L160 -110 Z" fill="#000" opacity="' + pal.foldShade + '" transform="translate(-6 6)"/>' +
      '<path d="M86 -184 L86 -110 L160 -110 Z" fill="' + pal.fold + '"/>' +
    '</g>' +
    /* the butterfly, resting on the sheet, with its shadow on the paper */
    '<g transform="translate(250 276) rotate(-10) scale(1.38)">' +
      P(silhouette, "#000", ' opacity="' + pal.shadow + '" transform="translate(7 11)"') +
      half(1, [pal.hi, pal.lite, pal.mid, pal.deep, pal.crease]) +
      half(-1, [pal.lite, pal.hi, pal.deep, pal.mid, pal.crease]) +
      /* body and antennae */
      P("0,-56 9,-2 0,68 -9,-2", pal.body) +
      '<path d="M-2 -52 C-8 -72 -18 -84 -30 -90 M2 -52 C8 -72 18 -84 30 -90" fill="none" stroke="' + pal.body + '" stroke-width="5.5" stroke-linecap="round"/>' +
      '<circle cx="-30" cy="-90" r="6.5" fill="' + pal.body + '"/><circle cx="30" cy="-90" r="6.5" fill="' + pal.body + '"/>' +
    '</g></svg>';
}
function appIconApply() {
  var light = document.documentElement.getAttribute("data-theme") === "light";
  var uri = "data:image/svg+xml," + encodeURIComponent(appIconSvg(APP_ICON_PALETTE[light ? "light" : "dark"]));
  var fav = document.getElementById("appFavicon");
  if (fav) fav.href = uri;
  var logo = document.getElementById("appLogo");
  if (logo) logo.src = uri;
}
appIconApply();                                  /* drawn once at start, in the theme the page opened in */
function themeTitle() {
  var b = document.getElementById("btnTheme");
  if (!b) return;
  var saved = savedTheme();
  b.title = (saved ? "Using " + saved + " (your choice)" : "Following Windows (" + systemTheme() + ")") +
            " - click to switch, Alt+L";
}

function setTheme(t) {
  if (t === "light") document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
  themeTitle();
  appIconApply();                                /* the icon follows the theme */
  ["skPalette", "skTemplates"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el && el.dataset.built) { var open = el.classList.contains("show"); el.innerHTML = ""; delete el.dataset.built;
      if (open) { if (id === "skPalette") skBuildPalette(); else sketchLibRender(document.getElementById("skTemplates")); } }
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-ink]"), function (b) { b.style.background = skInk(b.dataset.ink); });
  if (sk) { skColorUI(); skWidthUI(); skDraw(); }
  panes.forEach(function (q) { if (q.parked && typeof skRenderParked === "function") skRenderParked(q); });
  panes.forEach(function (q) { if (q.type === "note" && q.rerenderLines && q.lines && q.lines.some(function (l) { return /^```excalidraw/.test(l); })) q.rerenderLines(); });   /* sketch pictures in the new colours */
}
timerWire();
document.getElementById("btnTheme").addEventListener("click", toggleTheme);
/* when nothing is saved, follow Windows live - e.g. an automatic evening switch */
try {
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", function () {
    if (!savedTheme()) setTheme(systemTheme());
  });
} catch (e) {}
themeTitle();
document.getElementById("btnNewSheet").addEventListener("click", function () {
  var name = window.prompt("Sheet name", "Sheet");
  if (!name) return;
  var sh = createSheet(name);
  openSheetInPane(focusedPane || panes[0], sh.id);
});
var exportMenu = document.getElementById("exportMenu");
document.getElementById("btnExport").addEventListener("click", function (e) {
  e.stopPropagation();
  exportMenu.classList.toggle("show");
});
document.addEventListener("click", function () { exportMenu.classList.remove("show"); });
Array.prototype.forEach.call(exportMenu.querySelectorAll("[data-export]"), function (b) {
  b.addEventListener("click", function () { exportMenu.classList.remove("show"); exportNote(b.dataset.export); });
});
document.getElementById("btnSort").addEventListener("click", function () { setSort(sortMode === "name" ? "recent" : "name"); });
document.getElementById("btnSidebar").addEventListener("click", function () {
  if (sideEl.classList.contains("side-closed")) showView(currentView);
  else showView(currentView, true);
});
document.getElementById("btnFolder").addEventListener("click", pickFolder);
document.getElementById("btnLocal").addEventListener("click", function () {
  if (window.confirm("Switch to browser storage? Your folder files stay on disk untouched.")) switchToLocal();
});
document.getElementById("btnReload").addEventListener("click", function () {
  if (state.backend === "folder") { flushPersist(); loadFolder(); }
});
document.getElementById("btnReconnect").addEventListener("click", function () {
  idbGet("dirHandle").then(function (h) {
    if (!h) { hideReconnect(); return; }
    return h.requestPermission({ mode: "readwrite" }).then(function (perm) {
      if (perm === "granted") {
        state.dirHandle = h; state.backend = "folder";
        hideReconnect();
        return loadFolder();
      }
    });
  }).catch(function (e) { console.error(e); });
});
document.getElementById("btnDual").addEventListener("click", toggleDual);
document.getElementById("btnSketch").addEventListener("click", insertSketch);

window.addEventListener("keydown", function (e) {
  var mod = e.ctrlKey || e.metaKey;
  /* VS Code's keys: Ctrl+P finds a note, Ctrl+Shift+P or F1 runs a command */
  if (mod && !e.altKey && e.key.toLowerCase() === "p") { e.preventDefault(); palOpen(e.shiftKey ? ">" : ""); return; }
  if (e.altKey && !mod && !e.shiftKey && e.code === "KeyC") { e.preventDefault(); palOpen(">Text colour"); return; }   /* colour the selection (by key position: Option+C on a Mac types "ç") */
  if (mod && e.altKey && !e.shiftKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) { e.preventDefault(); moveCurrentTab(e.key === "ArrowRight" ? 1 : -1); return; }   /* tab to the next / previous pane */
  if (mod && e.altKey && !e.shiftKey && e.key.toLowerCase() === "n") { e.preventDefault(); palOpen("/", "new"); return; }        /* new from template */
  if (mod && e.altKey && !e.shiftKey && e.key.toLowerCase() === "d") { e.preventDefault(); openDailyNote(); return; }           /* today's daily note */
  if (e.key === "F1") { e.preventDefault(); palOpen(">"); return; }
  if (pal.open) return;
  var fp = focusedPane || panes[0];
  if (sk) {   /* sketch board owns the keyboard while open */
    /* ...unless a field has focus. Typing in the rename dialog must never reach the board:
       Backspace belongs to the text box, not to the selected shapes. */
    var tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable)) {
      if (e.key === "Escape") { e.preventDefault(); skRenameClose(); }
      return;
    }
    /* the rename dialog sits over the board: while it is open, copy, paste and select-all
       work on its text, not on the shapes underneath (dragging across its preview moved
       focus off the text boxes, and Ctrl+C then copied the whole drawing) */
    if (document.getElementById("skRename").classList.contains("show")) {
      if (e.key === "Escape") { e.preventDefault(); skRenameClose(); }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      var kb = document.getElementById("skKeys");
      if (kb && kb.classList.contains("show")) { kb.classList.remove("show"); return; }
      if (document.getElementById("skLibrary").classList.contains("show")) { skLibOpen(false); return; }
      if (sk.sels.length) { skSelect([]); skDraw(); return; }
      if (sk.tool !== "select") { skSetTool("select"); return; }   /* put the tool down before leaving */
      closeSketch(); return;
    }
    if (mod && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) { e.preventDefault(); skRedo(); return; }
    if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); skZoomBy(1.2); return; }
    if (mod && e.key === "-") { e.preventDefault(); skZoomBy(1 / 1.2); return; }
    if (!mod && e.shiftKey && (e.key === "!" || e.code === "Digit1")) { e.preventDefault(); document.getElementById("skFit").click(); return; }
    /* text selected on the page means the copy is for that text */
    if (mod && (e.key.toLowerCase() === "c" || e.key.toLowerCase() === "x")) {
      var tsel = window.getSelection && window.getSelection();
      if (tsel && !tsel.isCollapsed && String(tsel).trim()) return;
    }
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); skUndo(); return; }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); skDeleteSel(); return; }
    if (mod && e.key.toLowerCase() === "a") {                 /* select everything */
      e.preventDefault();
      skSelect(sk.elements.slice());
      skDraw();
      return;
    }
    if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); skDuplicate(); return; }
    if (mod && e.key.toLowerCase() === "c") { e.preventDefault(); skCopy(); return; }
    if (mod && e.key.toLowerCase() === "x") { e.preventDefault(); skCut(); return; }
    if (mod && e.key.toLowerCase() === "v") { e.preventDefault(); skPaste(true); return; }
    if (mod && e.key.toLowerCase() === "r") { e.preventDefault(); skRenameOpen(); return; }
    if (e.key === "Escape" && document.getElementById("skRename").classList.contains("show")) {
      e.preventDefault(); skRenameClose(); return;
    }
    if (e.key === "Escape" && sk.sels.length) { e.preventDefault(); skSelect([]); skDraw(); return; }
    var oneSeg = sk.sels.length === 1 && skIsConnector(sk.sels[0]) && skIsOrthoStyle(sk.sels[0]) ? sk.sels[0] : null;
    if (!mod && oneSeg && e.key.indexOf("Arrow") === 0) {   /* move a run of the selected elbow link */
      e.preventDefault();
      var kax = e.key === "ArrowLeft" || e.key === "ArrowRight" ? 0 : 1;
      var ksign = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1, kstep = e.shiftKey ? 10 : 4;
      var rp3 = skLinkRoute(oneSeg), pick = -1;
      if (sk.segActive && sk.segActive.id === oneSeg.id && sk.segActive.ax === kax && skSegMovable(rp3, sk.segActive.i) === kax) pick = sk.segActive.i;
      else {
        var bestLen = -1;
        for (var ki = 1; ki < rp3.length - 2; ki++) if (skSegMovable(rp3, ki) === kax) {
          var kl = Math.hypot(rp3[ki + 1][0] - rp3[ki][0], rp3[ki + 1][1] - rp3[ki][1]);
          if (kl > bestLen) { bestLen = kl; pick = ki; }
        }
      }
      if (pick < 0) { pushToastLike(kax === 0 ? "This link has no upright run to move left or right." : "This link has no level run to move up or down."); return; }
      skSnapshot();
      oneSeg.segs = oneSeg.segs || {};
      var prevOff = oneSeg.segs[pick] && oneSeg.segs[pick][0] === kax ? oneSeg.segs[pick][1] : 0;
      oneSeg.segs[pick] = [kax, prevOff + ksign * kstep];
      sk.segActive = { id: oneSeg.id, i: pick, ax: kax };
      skChanged(); skDraw();
      return;
    }
    if (!mod && sk.sels.length && e.key.indexOf("Arrow") === 0) {   /* nudge, Shift for a bigger step */
      e.preventDefault();
      var step = e.shiftKey ? 10 : 1;
      var dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      var dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      skSnapshot();
      sk.sels.forEach(function (el) { skMoveEl(el, dx, dy); });
      skChanged(); skDraw();
      return;
    }
    if (!mod && !e.altKey && e.key.toLowerCase() === "s") {   /* S opens the library */
      e.preventDefault(); skLibOpen(); return;
    }
    if (!mod && !e.altKey && !e.shiftKey && /^[1-4]$/.test(e.key) && sk.sels.some(skIsSystem)) {   /* 1-4 set status */
      e.preventDefault(); skSetStatus(SK_STATUS[+e.key - 1].id); return;
    }
    if (!mod && !e.altKey && e.shiftKey && e.key.toLowerCase() === "t") { e.preventDefault(); skArrange("tidy", skBoardFlow()); return; }
    if (!mod && !e.altKey && e.key.toLowerCase() === "q") {   /* Q keeps the tool after drawing */
      e.preventDefault(); document.getElementById("skSticky").click(); return;
    }
    if (!mod && (e.key === "[" || e.key === "]")) {            /* thinner / thicker, like Paint */
      e.preventDefault();
      sk.width = Math.max(1, Math.min(20, sk.width + (e.key === "]" ? 1 : -1)));
      skWidthUI();
      if (sk.sels.length) { skSnapshot(); sk.sels.forEach(function (el) { el.strokeWidth = sk.width; }); skChanged(); skDraw(); }
      return;
    }
    if (e.key === "F2" && sk.sel) { e.preventDefault(); skRename(sk.sel); return; }
    var tools = { v: "select", h: "hand", p: "pen", r: "rectangle", o: "ellipse", d: "diamond", l: "line", a: "arrow", t: "text", c: "connect", e: "eraser", j: "splitter" };
    if (!mod && !e.altKey && tools[e.key.toLowerCase()]) { e.preventDefault(); skSetTool(tools[e.key.toLowerCase()]); }
    return;
  }
  if (mod && e.shiftKey && e.key.toLowerCase() === "d") { e.preventDefault(); insertSketch(); return; }
  if (mod && e.key.toLowerCase() === "a") {
    var tg = e.target;
    var inField = tg && (tg.tagName === "TEXTAREA" || tg.tagName === "INPUT" || tg.isContentEditable);
    if (!inField && fp && fp.note() && fp.mode === "live") { e.preventDefault(); fp.selectAll(); return; }
  }
  if (mod && e.key.toLowerCase() === "z" && fp && fp.note()) {
    var tg0 = e.target;
    if (!tg0 || (tg0.tagName !== "TEXTAREA" && tg0.tagName !== "INPUT")) {
      e.preventDefault();
      if (e.shiftKey) histRedo(fp); else histUndo(fp);
      return;
    }
  }
  if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); flushPersist(); }
  if (mod && e.key.toLowerCase() === "f" && !e.altKey && !(typeof sk !== "undefined" && sk)) {
    e.preventDefault();
    if (e.shiftKey || currentView !== "notes" && !panes.some(function (q) { return q.linesEl; })) showView("search");   /* all notes */
    else if (!findOpen()) showView("search");                                                                          /* this note */
  }
  if (mod && e.key.toLowerCase() === "h" && !e.altKey && !(typeof sk !== "undefined" && sk)) {
    e.preventDefault();
    if (e.shiftKey) { showView("search"); var srr = document.getElementById("searchRep"); if (srr) setTimeout(function () { document.getElementById("search").focus(); }, 0); }
    else if (!findOpen(true)) showView("search");
  }
  if (mod && e.shiftKey && e.key.toLowerCase() === "e") { e.preventDefault(); showView("notes"); }
  if (mod && e.key.toLowerCase() === "e") {
    e.preventDefault();
    fp.setMode(fp.mode === "live" ? "split" : "live");
  }
  if (mod && e.key.toLowerCase() === "g") { e.preventDefault(); state.graphOpen ? closeGraph() : openGraph(); }
  if (mod && e.key === "\\") { e.preventDefault(); addPane(fp); }
  if (e.altKey && !mod) {
    /* by key position: Option+L on a Mac types "¬", so e.key is never "l" there */
    if (e.code === "KeyO") { e.preventDefault(); showView("tabs", true); return; }
    if (e.code === "KeyK") { e.preventDefault(); openSketchLibrary(); return; }
    if (e.code === "KeyN") { e.preventDefault(); openLibrary("all"); return; }
    if (e.code === "KeyL") { e.preventDefault(); toggleTheme(); return; }
    if (e.code === "KeyT") {
      e.preventDefault();
      if (document.getElementById("timerPop").classList.contains("show")) timerClosePop(); else timerOpenPop();
      return;
    }
    if (e.code === "KeyW") { e.preventDefault(); if (fp.noteId != null) fp.closeTab(fp.noteId); }
    else if (e.key === "ArrowRight") { e.preventDefault(); fp.cycleTab(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); fp.cycleTab(-1); }
    else if (/^[1-9]$/.test(e.key)) {
      e.preventDefault();
      var t = fp.tabs[parseInt(e.key, 10) - 1];
      if (t != null) fp.open(t);
    }
  }
  if (e.key === "Escape" && state.graphOpen) { e.preventDefault(); if (graphSel) graphSelect(null); else closeGraph(); }
});

window.addEventListener("beforeunload", function (e) {
  if (sheetTimer) { clearTimeout(sheetTimer); flushSheets(); }
  if (sk) skPersist();
  if (saveTimer) { clearTimeout(saveTimer); flushPersist(); }
  else syncAllPanes();
  saveSession();
  /* in a vault, saving is asynchronous and the browser won't wait for it: while anything is
     unsaved or still writing, ask before leaving (the browser shows its own "Leave site?") */
  if (unsavedOnDisk()) { e.preventDefault(); e.returnValue = ""; return ""; }
});
function unsavedOnDisk() {
  if (state.backend !== "folder" && !state.sketchHandle) return false;   /* browser storage ("local") saves at once */
  return writesInFlight > 0 || Object.keys(dirty).length > 0 || sheets.some(function (x) { return x.dirty; }) || !!(sk && sk.dirty);
}

