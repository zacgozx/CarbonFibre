/* ============================================================
   global state
   ============================================================ */

var LOCAL_KEY = "carbonfibre-v1";
var LEGACY_KEY = "myobsidian-v5";   /* notes saved under the old name are picked up automatically */

var state = {
  backend: "local",
  dirHandle: null,
  notes: [],
  folders: [],
  renamingId: null,
  query: "",
  graphOpen: false
};
var noteSeq = 1;
var saveTimer = null;
var dirty = {};
var searchTimer = null;
var lastSaveState = null;

function sameId(a, b) { return String(a) === String(b); }

function findNote(id) {
  for (var i = 0; i < state.notes.length; i++)
    if (String(state.notes[i].id) === String(id)) return state.notes[i];
  return null;
}
function noteByTitle(title) {
  var t = String(title).toLowerCase();
  for (var i = 0; i < state.notes.length; i++)
    if (state.notes[i].title.toLowerCase() === t) return state.notes[i];
  return null;
}
function sanitizeName(s) {
  return (s || "Untitled").replace(/[\\/:*?"<>|]/g, "-").trim().slice(0, 120) || "Untitled";
}

/* ---------------- persistence ---------------- */

function flashSaved() {
  setSaveState("saved");
  setTimeout(function () { setSaveState(""); }, 1200);
}
function setSaveState(s) {
  if (s === lastSaveState) return;
  lastSaveState = s;
  var el = document.getElementById("saveState");
  el.className = s;
  el.textContent = s === "saving" ? "Saving" : s === "saved" ? "Saved" : s === "error" ? "Save failed" : "";
}

function syncAllPanes() {
  for (var i = 0; i < panes.length; i++) panes[i].sync();
}

function schedulePersist() {
  setSaveState("saving");
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushPersist, 450);
}

function flushPersist() {
  saveTimer = null;
  syncAllPanes();
  if (state.backend === "local") {
    try {
      if (storeSet(LOCAL_KEY, JSON.stringify({
        notes: state.notes.map(function (n) { return { id: n.id, title: n.title, content: n.content }; }),
        seq: noteSeq
      }))) flashSaved(); else setSaveState("error");
    } catch (e) { setSaveState("error"); }
    return;
  }
  var ids = Object.keys(dirty);
  dirty = {};
  if (!ids.length) return;
  writesInFlight++;                                     /* in progress from now: the writes below start a moment later */
  var chain = Promise.resolve();
  ids.forEach(function (id) {
    var n = findNote(id);
    if (n) chain = chain.then(function () { return writeNoteFile(n); });
  });
  chain.then(flashSaved).catch(function (e) { console.error(e); setSaveState("error"); }).then(function () { writesInFlight--; });
}

function markDirty(n) {
  n.touched = Date.now();          /* drives the "recent" sort in the sidebar */
  if (state.backend === "folder") dirty[n.id] = true;
  schedulePersist();
}
function noteStamp(n) { return n.touched || n.mtime || 0; }

/* ---------------- folder backend ---------------- */

/* write text into <parent>/<base>, creating the file; resolves with the handle */
/* Browser storage writes go through here. It can fill up (about 5 million characters for the whole
   app); a failed write is reported once per session instead of vanishing. True when it saved. */
var storeFullWarned = false;
function storeSet(key, value) {
  try { localStorage.setItem(key, value); return true; }
  catch (e) {
    console.warn("CarbonFibre: couldn't save \"" + key + "\" to browser storage", e);
    if (!storeFullWarned) {
      storeFullWarned = true;
      try { pushToastLike("Browser storage is full, so some changes aren't being saved. Open a vault folder (bottom left) to keep notes and sheets on disk."); } catch (e2) {}
    }
    return false;
  }
}
var writesInFlight = 0;
function writeFile(parent, base, text) {
  writesInFlight++;
  var done = function (v) { writesInFlight--; return v; }, fail = function (e) { writesInFlight--; throw e; };
  return parent.getFileHandle(base, { create: true }).then(function (fh) {
    return fh.createWritable().then(function (w) {
      return w.write(text).then(function () { return w.close(); });
    }).then(function () { return fh; });
  }).then(done, fail);
}
/* Write a file only if it hasn't changed on disk since we read it. If it has, ask: keep mine
   (overwrite), take theirs (discard mine), or copy (save mine alongside, take theirs).
   o: { parent, base, handle, mtime, text, label, altName(), onTake(theirs, mtime), onWritten(handle, mtime) }.
   Notes, sheets and sketch files all save through this. */
function writeGuarded(o) {
  writesInFlight++;                                     /* counted from the start: the check comes before the write */
  var settle = function (v) { writesInFlight--; return v; }, settleFail = function (e) { writesInFlight--; throw e; };
  var check = o.handle && o.mtime
    ? o.handle.getFile().then(function (f) { return f.lastModified > o.mtime + 1500 ? f : null; }).catch(function () { return null; })
    : Promise.resolve(null);
  return check.then(function (changed) {
    if (!changed) return null;
    return changed.text().then(function (theirs) {
      if (theirs === o.text) return null;              /* same bytes: nothing to resolve */
      var choice = window.prompt(
        '"' + o.label + '" changed on disk since CarbonFibre read it.\n\n' +
        "  keep   - overwrite the file with your version\n" +
        "  take   - discard your changes and use the file's\n" +
        "  copy   - save yours as a separate conflict file\n\n" +
        "Type keep, take or copy:", "copy");
      choice = (choice || "copy").trim().toLowerCase();
      if (choice === "take") { o.onTake(theirs, changed.lastModified); return "done"; }
      if (choice === "keep") return null;
      var alt = o.altName ? o.altName() : o.base.replace(/(\.[^.]+)$/, " (conflict " + stampNow() + ")$1");
      return writeFile(o.parent, alt, o.text).then(function () {
        o.onTake(theirs, changed.lastModified);
        alert("Your version was saved as " + alt + " and the file's version is now shown.");
        return "done";
      });
    });
  }).then(function (done) {
    if (done) return;
    return writeFile(o.parent, o.base, o.text).then(function (fh) {
      return fh.getFile().then(function (f) { o.onWritten(fh, f.lastModified); }, function () { o.onWritten(fh, Date.now()); });
    });
  }).then(settle, settleFail);
}
function writeNoteFile(n) {
  var base = n.path.split("/").pop();
  return writeGuarded({ parent: n.parent || state.dirHandle, base: base, handle: n.handle, mtime: n.mtime, text: n.content, label: n.path,
    altName: function () { return uniqueBasename(base.replace(/\.md$/i, "") + " (conflict " + stampNow() + ")", n.path.indexOf("/") !== -1 ? n.path.slice(0, n.path.lastIndexOf("/") + 1) : ""); },
    onTake: function (theirs, m) { n.content = theirs; n.mtime = m; renderPanes(); },
    onWritten: function (fh, m) { n.handle = fh; n.mtime = m; } });
}

/* ---- sketch files: drawings kept as files in the vault's sketch/ folder (any depth of subfolders).
   A drawing's name is its path inside sketch/: "network/splunk/cluster" is
   sketch/network/splunk/cluster.excalidraw (Excalidraw JSON, so Obsidian's plugin opens it too).
   In browser storage they are kept under one key instead, with the same names. ---- */
var SKETCH_DIR = "sketch", SKETCH_KEY = "carbonfibre-sketches", sketchFiles = [];
function sketchFileOf(path) {
  var k = String(path || "").toLowerCase();
  return sketchFiles.filter(function (f) { return f.path.toLowerCase() === k; })[0] || null;
}
function sketchCount(f) { try { return (JSON.parse(f.text).elements || []).filter(function (e) { return !e.isDeleted; }).length; } catch (e) { return 0; } }
/* "sketch/network/cluster.excalidraw", "network/cluster.excalidraw" or "network/cluster" -> "network/cluster" */
function sketchPathOf(ref) { return String(ref || "").trim().replace(/^\/+/, "").replace(/^sketch\//i, "").replace(/\.excalidraw$/i, ""); }
function sketchEmbed(path) { return "![[" + SKETCH_DIR + "/" + path + ".excalidraw]]"; }
/* Where sketches live: a folder you chose on your computer (remembered, any depth of subfolders),
   otherwise the open vault's sketch/ folder. Never browser storage: with neither, the library asks
   you to choose a folder. */
function sketchCanWrite() { return !!state.sketchHandle || (state.backend === "folder" && !!state.dirHandle); }
function sketchWhere() { return state.sketchHandle ? state.sketchHandle.name : state.backend === "folder" && state.dirHandle ? state.dirHandle.name + "/" + SKETCH_DIR : ""; }
function sketchRoot(create) {
  if (state.sketchHandle) return Promise.resolve(state.sketchHandle);
  if (state.backend === "folder" && state.dirHandle) return state.dirHandle.getDirectoryHandle(SKETCH_DIR, { create: !!create });
  return Promise.reject(new Error("no sketch folder"));
}
/* every drawing under the chosen folder (dot-folders such as .trash skipped) */
function sketchScan() {
  sketchFiles = [];
  function walk(dir, prefix) {
    var entries = [];
    return (async function () { for await (var en of dir.values()) entries.push(en); })().then(function () {
      return Promise.all(entries.map(function (en) {
        if (en.kind === "file" && /\.excalidraw$/i.test(en.name)) {
          return en.getFile().then(function (f) { return f.text().then(function (t) { sketchFiles.push({ path: prefix + en.name.replace(/\.excalidraw$/i, ""), text: t, mtime: f.lastModified, diskTime: f.lastModified }); }); });
        }
        if (en.kind === "directory" && en.name.charAt(0) !== ".") return walk(en, prefix + en.name + "/");
        return null;
      }));
    });
  }
  return walk(state.sketchHandle, "").then(sketchChanged, function (e) { console.error(e); pushToastLike("Couldn't read the sketch folder: " + e.message); });
}
function chooseSketchFolder() {
  if (!window.showDirectoryPicker) { pushToastLike("This browser can't open folders."); return; }
  window.showDirectoryPicker({ mode: "readwrite", id: "cf-sketches" }).then(function (h) {
    state.sketchHandle = h; state.sketchPending = null;
    idbSet("sketchHandle", h).catch(function () {});
    return sketchScan().then(sketchImportLegacy);
  }).catch(function () {});
}
function reconnectSketchFolder() {
  var h = state.sketchPending; if (!h) return chooseSketchFolder();
  h.requestPermission({ mode: "readwrite" }).then(function (perm) {
    if (perm !== "granted") return;
    state.sketchHandle = h; state.sketchPending = null;
    return sketchScan();
  }).catch(function () {});
}
function forgetSketchFolder() {
  state.sketchHandle = null; state.sketchPending = null;
  idbDel("sketchHandle").catch(function () {});
  if (state.backend === "folder" && state.dirHandle) loadFolder(); else { sketchFiles = []; sketchChanged(); }
}
/* drawings an earlier version kept in browser storage: offered once, moved into the folder, then cleared */
function sketchImportLegacy() {
  var all = null; try { all = JSON.parse(localStorage.getItem(SKETCH_KEY) || "null"); } catch (e) {}
  var names = all ? Object.keys(all) : [];
  if (!names.length) return;
  if (!window.confirm("Move " + names.length + " drawing" + (names.length === 1 ? "" : "s") + " saved in the browser into " + sketchWhere() + "?")) return;
  Promise.all(names.map(function (n) { return sketchSave(sketchFileOf(n) ? sketchUnique(n) : n, all[n].text); })).then(function () {
    try { localStorage.removeItem(SKETCH_KEY); } catch (e) {}
    pushToastLike("Moved " + names.length + " drawings into " + sketchWhere() + ".");
  });
}
/* the folder for a path's directory part, made if asked */
function sketchDir(parts, create) {
  var h = sketchRoot(create);
  parts.forEach(function (part) { h = h.then(function (d) { return d.getDirectoryHandle(part, { create: !!create }); }); });
  return h;
}
function sketchSplit(path) { var parts = path.split("/"); return { dirs: parts.slice(0, -1), base: parts[parts.length - 1] + ".excalidraw" }; }
/* write a drawing (made if new); notes that embed it redraw */
function sketchSave(path, text) {
  var f = sketchFileOf(path);
  if (!f) { f = { path: path, text: text, mtime: Date.now() }; sketchFiles.push(f); }
  f.text = text; f.mtime = Date.now();
  var done;
  if (sketchCanWrite()) {
    var sp = sketchSplit(f.path);
    /* one save at a time per drawing (a save mid-write would see the first as a change on disk) */
    done = f.saving = (f.saving || Promise.resolve()).then(function () {
      if (f.text !== text) return;                       /* a newer save is queued behind this one */
      return sketchDir(sp.dirs, true).then(function (d) {
        return d.getFileHandle(sp.base).then(function (h) { return [d, h]; }, function () { return [d, null]; });
      }).then(function (dh) {
        return writeGuarded({ parent: dh[0], base: sp.base, handle: dh[1], mtime: f.diskTime, text: text, label: SKETCH_DIR + "/" + f.path + ".excalidraw",
          onTake: function (theirs, m) {
            f.text = theirs; f.diskTime = m;
            if (sk && sk.file && sk.file.toLowerCase() === f.path.toLowerCase()) { sk.elements = skParse(theirs); sk.lastJson = theirs; sk.dirty = false; skDraw(); }
            sketchChanged();
          },
          onWritten: function (fh, m) { f.diskTime = m; } });
      });
    }).catch(function (e) { console.error(e); pushToastLike("Couldn't save " + f.path + ": " + e.message); });
  } else { pushToastLike("Choose a sketch folder first (Sketch library \u2192 Choose folder)."); done = Promise.resolve(); }
  sketchChanged();
  return done;
}
function sketchRemoveFile(path) {
  if (!sketchCanWrite()) return Promise.resolve();
  var sp = sketchSplit(path);
  return sketchDir(sp.dirs, false).then(function (d) { return d.removeEntry(sp.base); }).catch(function () {});
}
/* delete: a copy goes to .trash/sketch/ first, as notes do */
function sketchDelete(path) {
  var f = sketchFileOf(path); if (!f) return Promise.resolve();
  sketchFiles = sketchFiles.filter(function (x) { return x !== f; });
  var gone = Promise.resolve();
  if (sketchCanWrite()) {                                /* a copy into .trash in the sketch folder first */
    var sp = sketchSplit(f.path);
    gone = sketchRoot(true).then(function (r) { return r.getDirectoryHandle(".trash", { create: true }); })
      .then(function (t) { return writeFile(t, sp.dirs.concat([sp.base]).join(" - "), f.text); })
      .then(function () { return sketchRemoveFile(f.path); });
  }
  sketchChanged();
  return gone;
}
function sketchUnique(path) {
  var p = path, k = 2;
  while (sketchFileOf(p)) { p = path + " " + k; k++; }
  return p;
}
/* rename or move (a file, or a whole folder when isDir): the files move, and every embed pointing
   at them is rewritten in every note */
function sketchRename(from, to, isDir) {
  from = sketchPathOf(from); to = sketchPathOf(to);
  if (!to || from === to) return Promise.resolve();
  var moving = sketchFiles.filter(function (f) { return isDir ? f.path.indexOf(from + "/") === 0 : f.path === from; });
  if (!moving.length) return Promise.resolve();
  var map = {};
  moving.forEach(function (f) { map[f.path] = isDir ? to + f.path.slice(from.length) : to; });
  if (Object.keys(map).some(function (a) { var b = map[a]; return sketchFileOf(b) && moving.indexOf(sketchFileOf(b)) === -1; })) {
    pushToastLike("There is already a sketch called " + to + "."); return Promise.resolve();
  }
  var chain = Promise.resolve();
  moving.forEach(function (f) {
    var old = f.path, nu = map[old];
    chain = chain.then(function () { f.path = nu; return sketchSave(nu, f.text); }).then(function () { return sketchRemoveFile(old); });
  });
  return chain.then(function () {
    var re = /!\[\[([^\]|]+?\.excalidraw)((?:\|[^\]]*)?)\]\]/gi;
    syncAllPanes();
    state.notes.forEach(function (n) {
      var c = String(n.content || "");
      var out = c.replace(re, function (all, ref, alias) { var p = sketchPathOf(ref); return map[p] ? "![[" + SKETCH_DIR + "/" + map[p] + ".excalidraw" + alias + "]]" : all; });
      if (out !== c) { n.content = out; markDirty(n); panes.forEach(function (q) { if (q.type === "note" && sameId(q.noteId, n.id)) q.open(n.id); }); }
    });
    sketchChanged();
  });
}
/* a sketch changed: notes that embed sketches redraw, and the library refreshes */
var sketchChangedT = null;
function sketchChanged() {
  clearTimeout(sketchChangedT);
  sketchChangedT = setTimeout(function () {
    panes.forEach(function (q) { if (q.type === "note" && q.activeLine === null && q.lines && q.lines.some(function (l) { return /\.excalidraw\]\]/i.test(l); })) q.render(); });
    sketchLibRefresh();
  }, 60);
}
/* open a sketch file in the board (over the app; the board saves straight back to the file) */
function openSketchFile(path) {
  var f = sketchFileOf(sketchPathOf(path));
  if (!f) { pushToastLike("There's no sketch called " + sketchPathOf(path) + "."); return; }
  sketchLibClose();
  openSketch(focusedPane || panes[0], -1, null, f);
}
function newSketchFile(dir) {
  if (!sketchCanWrite()) { openSketchLibrary(); return; }      /* the library asks for a folder first */
  var base = (dir ? dir + "/" : "") + "Untitled sketch";
  var path = sketchUnique(base);
  sketchSave(path, JSON.stringify(skDoc([]))).then(function () { openSketchFile(path); });
}
/* a copy of a drawing into the open board, centred at (wx, wy): fresh ids (links inside the copy
   point at the copies), selected so it moves as one piece; one undo step */
function skInsertDrawing(elements, wx, wy) {
  if (!sk || !elements || !elements.length) return [];
  var json = JSON.stringify(elements);
  elements.forEach(function (el) { if (el.id) json = json.split('"' + el.id + '"').join('"' + skId() + '"'); });
  var copy = JSON.parse(json).map(skFullEl), b = null;
  copy.forEach(function (el) {
    var bb = skBox(el);
    if (!b) b = { x: bb.x, y: bb.y, x2: bb.x + bb.w, y2: bb.y + bb.h };
    else { b.x = Math.min(b.x, bb.x); b.y = Math.min(b.y, bb.y); b.x2 = Math.max(b.x2, bb.x + bb.w); b.y2 = Math.max(b.y2, bb.y + bb.h); }
  });
  var dx = wx - (b.x + b.x2) / 2, dy = wy - (b.y + b.y2) / 2;
  sk.undo.push(JSON.stringify(sk.elements));
  copy.forEach(function (el) { skMoveEl(el, dx, dy); });
  sk.elements = sk.elements.concat(copy);
  skSelect(copy); skChanged(); skDraw();
  return copy;
}
function skInsertSketchFile(path, wx, wy) {
  var f = sketchFileOf(path); if (!f || !sk) return;
  if (sk.file && sk.file.toLowerCase() === f.path.toLowerCase()) { pushToastLike("That's the sketch you're editing."); return; }
  var els = []; try { els = (JSON.parse(f.text).elements || []).filter(function (e) { return !e.isDeleted; }); } catch (e) {}
  if (wx === undefined) { var c = skToWorld(skViewW() / 2, skViewH() / 2); wx = c[0]; wy = c[1]; }
  skInsertDrawing(els, wx, wy);
}
/* an embed of a sketch file into a note, on its own line after line `after` */
function noteInsertSketchEmbed(p, path, after) {
  if (!p || p.type !== "note" || !p.note()) return;
  p.sync();
  var at = Math.max(0, Math.min(after === undefined || after === null ? (p.activeLine !== null ? p.activeLine : p.lines.length - 1) : after, p.lines.length - 1));
  histBreak(p);
  p.lines.splice(at + 1, 0, sketchEmbed(path));
  p.commit(true); p.render(); histBreak(p);
}
/* ---- the sketch library: a folder tree and thumbnails of every drawing in sketch/ ---- */
var skLib = { dir: "", q: "", where: null };
function sketchFolders() {
  var set = {};
  sketchFiles.forEach(function (f) { var parts = f.path.split("/"); for (var i = 1; i < parts.length; i++) set[parts.slice(0, i).join("/")] = 1; });
  return Object.keys(set).sort(function (a, b) { return a.localeCompare(b); });
}
function sketchLibHtml() {
  var q = skLib.q.trim().toLowerCase(), dir = skLib.dir;
  var folders = sketchFolders();
  if (dir && folders.indexOf(dir) === -1) dir = skLib.dir = "";
  var count = function (d) { return sketchFiles.filter(function (f) { return f.path.indexOf(d + "/") === 0; }).length; };
  var tree = '<div class="skl-node' + (!dir ? " on" : "") + '" data-skdir="">' + ico("folder") + "<span>sketch</span><b>" + sketchFiles.length + "</b></div>" +
    folders.map(function (d) {
      var depth = d.split("/").length;
      return '<div class="skl-node' + (dir === d ? " on" : "") + '" data-skdir="' + esc(d) + '" style="padding-left:' + (8 + depth * 14) + 'px" title="' + esc(d) + '">' + ico("folder") + "<span>" + esc(d.split("/").pop()) + "</span><b>" + count(d) + "</b></div>";
    }).join("");
  /* the folder's own drawings; a search looks through every folder */
  var files = sketchFiles.filter(function (f) {
    if (q) return f.path.toLowerCase().indexOf(q) !== -1;
    var parent = f.path.indexOf("/") === -1 ? "" : f.path.slice(0, f.path.lastIndexOf("/"));
    return parent === dir;
  }).sort(function (a, b) { return a.path.localeCompare(b.path); });
  var subs = q ? [] : folders.filter(function (d) { return (dir ? d.indexOf(dir + "/") === 0 : true) && d.split("/").length === (dir ? dir.split("/").length + 1 : 1); });
  var crumbs = '<span class="skl-crumb" data-skdir="">sketch</span>' + (dir ? dir.split("/").map(function (part, i, arr) {
    return ' \u203a <span class="skl-crumb" data-skdir="' + esc(arr.slice(0, i + 1).join("/")) + '">' + esc(part) + "</span>"; }).join("") : "");
  var cards = subs.map(function (d) {
    return '<div class="skl-card skl-folder" data-skdir="' + esc(d) + '" tabindex="0">' + ico("folder") + '<span class="skl-name">' + esc(d.split("/").pop()) + '</span><span class="skl-sub">' + count(d) + " drawings</span></div>";
  }).join("") + files.map(function (f) {
    var name = f.path.split("/").pop(), where = f.path.indexOf("/") === -1 ? "" : f.path.slice(0, f.path.lastIndexOf("/"));
    return '<div class="skl-card" draggable="true" data-skfile="' + esc(f.path) + '" tabindex="0" title="' + esc(f.path) + ' \u00b7 click to add, double-click to edit, drag into a sketch or a note">' +
      '<span class="skl-thumb" data-thumb="' + esc(f.path) + '"></span><span class="skl-name">' + esc(name) + "</span>" +
      '<span class="skl-sub">' + (q && where ? esc(where) + " \u00b7 " : "") + sketchCount(f) + " shapes</span></div>";
  }).join("");
  var target = sk ? "the open sketch" : "the note";
  if (!sketchCanWrite()) {
    return '<div class="skl-top"><span class="skl-where">No sketch folder</span>' + (skLib.where === "win" ? '<button type="button" class="skl-x" data-skclose="1" aria-label="Close">\u00d7</button>' : "") + "</div>" +
      '<div class="skl-pick"><p>Choose the folder on your computer where your sketches are. Its subfolders show here as a tree, and new drawings are saved into it.</p>' +
      (state.sketchPending ? '<button type="button" class="skl-btn" data-skreconnect="1">Reconnect \u201c' + esc(state.sketchPending.name) + '\u201d</button> ' : "") +
      '<button type="button" class="skl-btn" data-skchoose="1">Choose folder\u2026</button></div>';
  }
  return '<div class="skl-where-row"><span class="skl-where" title="Where your sketches are">' + ico("folder") + esc(sketchWhere()) + "</span>" +
      '<button type="button" class="skl-link" data-skchoose="1">Change folder\u2026</button>' + (state.sketchHandle ? '<button type="button" class="skl-link" data-skforget="1" title="Stop using this folder">Forget</button>' : "") + "</div>" +
    '<div class="skl-top"><input class="skl-q" type="search" placeholder="Find a drawing in every folder" value="' + esc(skLib.q) + '" aria-label="Find a drawing">' +
      '<button type="button" class="skl-btn" data-sknew="1">+ New drawing</button>' + (skLib.where === "win" ? '<button type="button" class="skl-x" data-skclose="1" aria-label="Close">\u00d7</button>' : "") + "</div>" +
    '<div class="skl-body"><nav class="skl-tree" aria-label="Folders">' + tree + "</nav>" +
    '<div class="skl-main"><div class="skl-crumbs">' + (q ? (files.length + " found") : crumbs) + '</div><div class="skl-grid">' +
      (cards || '<p class="skl-empty">' + (sketchFiles.length ? "Nothing here." : "No drawings yet. Use <b>+ New drawing</b>, or save a sketch to the folder from its note.") + "</p>") +
    '</div><div class="skl-hint">Click to add to ' + target + " \u00b7 double-click to edit \u00b7 drag into a sketch or a note \u00b7 right-click for more</div></div></div>";
}
/* thumbnails are drawn only once they scroll into view */
var sklObs = typeof IntersectionObserver === "function" ? new IntersectionObserver(function (ents) {
  ents.forEach(function (en) {
    if (!en.isIntersecting) return;
    var el = en.target, f = sketchFileOf(el.dataset.thumb);
    sklObs.unobserve(el);
    var url = f ? sketchPreviewUrl(f.text) : "";
    el.innerHTML = url ? '<img src="' + url + '" alt="" draggable="false">' : '<i>empty</i>';
  });
}) : null;
function sketchLibRender(box) {
  if (!box) return;
  var keepQ = document.activeElement && document.activeElement.classList.contains("skl-q") && box.contains(document.activeElement);
  box.innerHTML = sketchLibHtml();
  Array.prototype.forEach.call(box.querySelectorAll("[data-thumb]"), function (t) {
    if (sklObs) sklObs.observe(t); else { var f = sketchFileOf(t.dataset.thumb); t.innerHTML = f ? '<img src="' + sketchPreviewUrl(f.text) + '" alt="">' : ""; }
  });
  if (keepQ) { var qi = box.querySelector(".skl-q"); qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); }
}
function sketchLibBoxes() { return Array.prototype.slice.call(document.querySelectorAll(".skl-host")); }
function sketchLibRefresh() { sketchLibBoxes().forEach(function (b) { if (b.offsetParent || b.closest(".skl-win:not([hidden])")) sketchLibRender(b); }); }
/* the window: over the app; the board's Files tab shows the same browser */
function openSketchLibrary() {
  var w = document.getElementById("sklWin");
  if (!w) {
    w = document.createElement("div"); w.id = "sklWin"; w.className = "skl-win"; w.hidden = true;
    w.innerHTML = '<div class="skl-dialog" role="dialog" aria-label="Sketch library"><div class="skl-host" data-where="win"></div></div>';
    document.body.appendChild(w);
    w.addEventListener("mousedown", function (e) { if (e.target === w) sketchLibClose(); });
    sketchLibWire(w.querySelector(".skl-host"));
  }
  skLib.where = "win";
  w.hidden = false;
  sketchLibRender(w.querySelector(".skl-host"));
  var q = w.querySelector(".skl-q"); if (q) q.focus();
}
function sketchLibClose() { var w = document.getElementById("sklWin"); if (w) w.hidden = true; }
function sketchLibWire(box) {
  box.addEventListener("input", function (e) { if (e.target.classList.contains("skl-q")) { skLib.q = e.target.value; sketchLibRender(box); } });
  box.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { if (skLib.q) { skLib.q = ""; sketchLibRender(box); } else sketchLibClose(); e.stopPropagation(); return; }
    var card = e.target.closest && e.target.closest("[data-skfile]");
    if (card && e.key === "Enter") { e.preventDefault(); sketchLibUse(card.dataset.skfile); }
  });
  box.addEventListener("click", function (e) {
    var el;
    if ((el = e.target.closest("[data-skclose]"))) { sketchLibClose(); return; }
    if ((el = e.target.closest("[data-sknew]"))) { newSketchFile(skLib.dir); return; }
    if ((el = e.target.closest("[data-skchoose]"))) { chooseSketchFolder(); return; }
    if ((el = e.target.closest("[data-skreconnect]"))) { reconnectSketchFolder(); return; }
    if ((el = e.target.closest("[data-skforget]"))) { if (window.confirm("Stop using " + sketchWhere() + " for sketches? The files stay where they are.")) forgetSketchFolder(); return; }
    if ((el = e.target.closest("[data-skdir]"))) { skLib.dir = el.dataset.skdir; skLib.q = ""; sketchLibRender(box); return; }
    if ((el = e.target.closest("[data-skfile]"))) { if (e.detail > 1) return; sketchLibUse(el.dataset.skfile); }
  });
  box.addEventListener("dblclick", function (e) { var el = e.target.closest("[data-skfile]"); if (el) openSketchFile(el.dataset.skfile); });
  box.addEventListener("dragstart", function (e) {
    var el = e.target.closest("[data-skfile]"); if (!el) return;
    e.dataTransfer.setData("text/x-cf-sketch", el.dataset.skfile); e.dataTransfer.effectAllowed = "copy";
    if (skLib.where === "win") setTimeout(sketchLibClose, 0);   /* get out of the way of the drop */
  });
  box.addEventListener("contextmenu", function (e) {
    var el = e.target.closest("[data-skfile], .skl-folder, .skl-node[data-skdir]:not([data-skdir=''])");
    if (!el) return;
    e.preventDefault();
    if (el.dataset.skfile) {
      var path = el.dataset.skfile;
      floatMenu([
        { label: "Edit", fn: function () { openSketchFile(path); } },
        { label: sk ? "Add to the open sketch" : "Add to the note", fn: function () { sketchLibUse(path); } }, null,
        { label: "Rename or move\u2026", fn: function () { var to = window.prompt("New name (folders with /):", path); if (to) sketchRename(path, to); } },
        { label: "Duplicate", fn: function () { var f = sketchFileOf(path); sketchSave(sketchUnique(path + " copy"), f.text); } },
        { label: "Delete", fn: function () { if (window.confirm("Delete " + path + "? A copy goes to .trash.")) sketchDelete(path); } }
      ], e.clientX, e.clientY);
    } else {
      var d = el.dataset.skdir;
      floatMenu([{ label: "Rename or move folder\u2026", fn: function () { var to = window.prompt("New folder path:", d); if (to) sketchRename(d, to, true); } },
                 { label: "New drawing here", fn: function () { newSketchFile(d); } }], e.clientX, e.clientY);
    }
  });
}
/* click in the library: into the open sketch as a copy, or into the note as an embed */
function sketchLibUse(path) {
  if (sk) { skInsertSketchFile(path); sketchLibClose(); return; }
  var p = focusedPane && focusedPane.type === "note" ? focusedPane : panes.filter(function (q) { return q.type === "note"; })[0];
  if (p) { noteInsertSketchEmbed(p, path); sketchLibClose(); }
}
/* ---- moving the drawings inside notes out to sketch files ---- */
function migrateSketchesToFiles() {
  if (!sketchCanWrite()) { pushToastLike("Choose a sketch folder first (Sketch library \u2192 Choose folder)."); openSketchLibrary(); return; }
  syncAllPanes();
  var found = [];
  state.notes.forEach(function (n) {
    var ls = String(n.content || "").split("\n"), fm = computeFenceMeta(ls);
    fm.forEach(function (m, i) { if (m && m.fence === "open" && m.lang === "excalidraw") found.push({ n: n, line: i }); });
  });
  if (!found.length) { pushToastLike("No sketches inside notes to move."); return; }
  var notesN = found.reduce(function (s, f) { s[f.n.id] = 1; return s; }, {});
  if (!window.confirm("Move " + found.length + " sketches in " + Object.keys(notesN).length + " notes into sketch/ files?\nEach is replaced by an embed; the notes are copied to .trash first.")) return;
  var chain = Promise.resolve(), moved = 0;
  Object.keys(notesN).forEach(function (nid) {
    var n = state.notes.filter(function (x) { return String(x.id) === nid; })[0];
    chain = chain.then(function () {
      var ls = String(n.content || "").split("\n"), fm = computeFenceMeta(ls), out = [], k = 0, saves = [];
      var backup = state.dirHandle.getDirectoryHandle(".trash", { create: true }).then(function (t) { return writeFile(t, (n.path || n.title).replace(/\//g, " - ").replace(/\.md$/i, "") + " (before sketch files).md", n.content); });
      for (var i = 0; i < ls.length; i++) {
        if (fm[i] && fm[i].fence === "open" && fm[i].lang === "excalidraw") {
          var close = i + 1; while (close < ls.length && !(fm[close] && fm[close].fence === "close")) close++;
          k++;
          var path = sketchUnique(sanitizeName(n.title) + "/" + k);
          sketchFiles.push({ path: path, text: ls.slice(i + 1, close).join("\n"), mtime: Date.now() });   /* claim the name now */
          saves.push([path, ls.slice(i + 1, close).join("\n")]);
          out.push(sketchEmbed(path)); i = close; moved++;
        } else out.push(ls[i]);
      }
      return backup.then(function () { return Promise.all(saves.map(function (s) { return sketchSave(s[0], s[1]); })); }).then(function () {
        n.content = out.join("\n"); markDirty(n);
        panes.forEach(function (q) { if (q.type === "note" && sameId(q.noteId, n.id)) q.open(n.id); });
      });
    });
  });
  chain.then(function () { pushToastLike("Moved " + moved + " sketches into sketch/."); renderSidebar(); });
}
function walkDir(dir, prefix, out, folders) {
  var entries = [];
  return (async function () {
    for await (var entry of dir.values()) entries.push(entry);
  })().then(function () {
    var chain = Promise.resolve();
    entries.forEach(function (entry) {
      if (entry.kind === "file" && /\.csv$/i.test(entry.name)) {
        chain = chain.then(function () {
          return entry.getFile().then(function (file) {
            return file.text().then(function (body) {
              sheets.push({
                id: prefix + entry.name, path: prefix + entry.name,
                title: entry.name.replace(/\.csv$/i, ""),
                rows: csvParse(body), handle: entry, parent: dir, mtime: file.lastModified
              });
            });
          });
        });
      } else if (entry.kind === "file" && /\.excalidraw$/i.test(entry.name) && /^sketch\//i.test(prefix) && !state.sketchHandle) {
        chain = chain.then(function () {                /* a drawing in sketch/: named by its path inside it */
          return entry.getFile().then(function (file) {
            return file.text().then(function (body) {
              sketchFiles.push({ path: (prefix + entry.name).replace(/^sketch\//i, "").replace(/\.excalidraw$/i, ""), text: body, mtime: file.lastModified, diskTime: file.lastModified });
            });
          });
        });
      } else if (entry.kind === "file" && /\.md$/i.test(entry.name)) {
        chain = chain.then(function () {
          return entry.getFile().then(function (file) {
            return file.text().then(function (body) {
              out.push({
                id: prefix + entry.name, path: prefix + entry.name,
                title: entry.name.replace(/\.md$/i, ""),
                content: body, handle: entry, parent: dir, mtime: file.lastModified
              });
            });
          });
        });
      } else if (entry.kind === "directory" && entry.name.charAt(0) !== ".") {
        folders.push({ path: prefix + entry.name, handle: entry, parent: dir });
        chain = chain.then(function () { return walkDir(entry, prefix + entry.name + "/", out, folders); });
      }
    });
    return chain;
  });
}

function loadFolder() {
  var out = [], folders = [];
  sheets = []; sketchFiles = [];
  return walkDir(state.dirHandle, "", out, folders).then(function () {
    out.sort(function (a, b) { return a.path.localeCompare(b.path); });
    state.notes = out;
    state.folders = folders;
    dirty = {};
    panes.forEach(function (p, i) {
      p.tabs = [];
      p.open(out.length ? out[Math.min(i, out.length - 1)].id : null);
    });
    updateStorageUI();
    renderSidebar();
    restoreSession();
    if (state.sketchHandle) sketchScan();                /* a chosen sketch folder wins over the vault's sketch/ */
    return tbLoadVault().then(function () { tbLaunchPin(); });
  }).catch(function (e) {
    console.error(e);
    alert("Couldn't read that folder: " + e.message);
  });
}

function pickFolder() {
  window.showDirectoryPicker({ mode: "readwrite" }).then(function (h) {
    state.dirHandle = h;
    state.backend = "folder";
    hideReconnect();
    idbSet("dirHandle", h).catch(function () {});
    return loadFolder();
  }).catch(function () {});
}

function switchToLocal() {
  state.backend = "local";
  state.dirHandle = null;
  state.folders = [];
  idbDel("dirHandle").catch(function () {});
  loadLocalNotes();
  hideReconnect();
  updateStorageUI();
  renderSidebar();
}

function uniqueBasename(base, prefix) {
  var name = base + ".md", k = 2;
  function taken(nm) {
    var p = prefix + nm;
    return state.notes.some(function (n) { return n.path && n.path.toLowerCase() === p.toLowerCase(); });
  }
  while (taken(name)) { name = base + " " + k + ".md"; k++; }
  return name;
}

function loadLocalNotes() {
  if (!state.sketchHandle) sketchFiles = [];
  var stored = null;
  try {
    var raw = localStorage.getItem(LOCAL_KEY) || localStorage.getItem(LEGACY_KEY);
    if (raw) stored = JSON.parse(raw);
  } catch (e) {}
  if (stored && Array.isArray(stored.notes) && stored.notes.length) {
    state.notes = stored.notes.map(function (n) {
      return { id: n.id, title: n.title, content: n.content, path: null, handle: null, parent: null };
    });
    noteSeq = stored.seq || 1;
  } else {
    state.notes = [];          /* fresh start: an empty vault, New makes the first note */
  }
  panes.forEach(function (p, i) {
    p.tabs = [];
    p.open(state.notes.length ? state.notes[Math.min(i, state.notes.length - 1)].id : null);
  });
}

