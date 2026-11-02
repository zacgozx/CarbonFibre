/* ============================================================
   note ops
   ============================================================ */

function followLink(url) {
  const href = normalizeUrl(url);
  if (!href) return;
  window.open(href, "_blank", "noopener");
}

function openInPane(id, pane) {
  (pane || focusedPane || panes[0]).open(id);
}

/* render markdown text as rendered line nodes inside el */
function renderMarkdownInto(el, text) {
  const ls = String(text).split("\n"), fm = computeFenceMeta(ls);
  for (let i = 0; i < ls.length; i++) el.appendChild(makeRenderedNode(ls[i], fm[i], -1));
  return el;
}

/* a wikilink or external link was clicked somewhere that renders markdown.
   Returns true if it handled the event, so callers can stop there. */
function linkClick(e, pane) {
  const wl = e.target.closest("[data-wikilink]");
  if (wl) {
    e.preventDefault();
    openOrCreateByTitle(wl.dataset.wikilink, e.shiftKey && pane ? paneForShift(pane) : pane || focusedPane || panes[0]);
    return true;
  }
  const xl = e.target.closest("[data-extlink]");
  if (xl) { e.preventDefault(); followLink(xl.dataset.extlink); return true; }
  return false;
}

/* ---- pinned notes ---- */

const PIN_KEY = "carbonfibre-pins";
let pinned = {};
try { pinned = JSON.parse(localStorage.getItem(PIN_KEY) || "{}") || {}; } catch (e) {}
function savePins() { storeSet(PIN_KEY, JSON.stringify(pinned)); }
function isPinned(n) { return !!pinned[String(n.id)]; }
/* folders can be pinned too: they ride at the top with their notes, under the same Pinned heading */
function isFolderPinned(path) { return !!pinned["folder:" + path]; }
function toggleFolderPin(path) {
  const k = "folder:" + path;
  if (pinned[k]) delete pinned[k]; else pinned[k] = 1;
  savePins(); renderSidebar();
  if (typeof tbRenderAll === "function") tbRenderAll();
}
function togglePin(n) {
  const k = String(n.id);
  if (pinned[k]) delete pinned[k]; else pinned[k] = 1;
  savePins();
  renderSidebar();
  if (typeof tbRenderAll === "function") tbRenderAll();      /* the Notes view follows */
}
function repin(oldId, newId) {   /* keep a pin through a rename or a move */
  if (!pinned[String(oldId)]) return;
  delete pinned[String(oldId)];
  pinned[String(newId)] = 1;
  savePins();
}
/* a note's id is its path, so renaming or moving it rewrites every reference to it */
function retargetNote(oldId, newId) {
  repin(oldId, newId);
  panes.forEach(function (p) {
    if (sameId(p.noteId, oldId)) p.noteId = newId;
    p.tabs = p.tabs.map(function (t) { return sameId(t, oldId) ? newId : t; });
  });
  delete dirty[oldId];
}
function renderPanes() { panes.forEach(function (p) { p.render(); }); }
function sortNotes() { state.notes.sort(function (a, b) { return a.path.localeCompare(b.path); }); }

/* ---- folders (folder backend only) ---- */

let collapsedFolders = {}; // eslint-disable-line prefer-const -- reassigned in 43-session.js

function folderOf(path) {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}
function folderHandle(path) {
  if (!path) return state.dirHandle;
  for (let i = 0; i < state.folders.length; i++) if (state.folders[i].path === path) return state.folders[i].handle;
  return state.dirHandle;
}

function createFolder() {
  if (state.backend !== "folder") return;
  Dialogs.prompt("Folder name (use / to nest, e.g. Projects/2026)", "").then(createFolderNamed);
}
function createFolderNamed(name) {
  if (!name) return;
  const parts = name.split("/").map(function (seg) {
    return seg.replace(/[\\/:*?"<>|]/g, "-").trim();
  }).filter(Boolean);
  if (!parts.length) return;
  let dir = state.dirHandle, path = "";
  let chain = Promise.resolve();
  parts.forEach(function (seg) {
    chain = chain.then(function () {
      const parentH = dir;
      path = path ? path + "/" + seg : seg;
      return parentH.getDirectoryHandle(seg, { create: true }).then(function (h) {
        dir = h;
        if (!state.folders.some(function (f) { return f.path === path; })) {
          state.folders.push({ path: path, handle: h, parent: parentH });
        }
        collapsedFolders[path] = false;
      });
    });
  });
  chain.then(renderSidebar).catch(function (e) {
    console.error(e);
    alert("Couldn't create folder: " + e.message);
  });
}

/* move a note into another folder: write the file in the new parent, remove the old one */
function moveNote(id, dirPath) {
  const n = findNote(id);
  if (!n || state.backend !== "folder") return;
  if (folderOf(n.path) === dirPath) return;
  syncAllPanes();
  const prefix = dirPath ? dirPath + "/" : "";
  const oldBase = n.path.split("/").pop();
  const oldParent = n.parent || state.dirHandle;
  const newParent = folderHandle(dirPath);
  const newBase = uniqueBasename(oldBase.replace(/\.md$/i, ""), prefix);
  writeFile(newParent, newBase, n.content).then(function (fh) {
    n.handle = fh;
    return oldParent.removeEntry(oldBase).catch(function () {});
  }).then(function () {
    const oldId = n.id;
    n.path = prefix + newBase;
    n.id = n.path;
    n.title = newBase.replace(/\.md$/i, "");
    n.parent = newParent;
    retargetNote(oldId, n.id);
    sortNotes();
    collapsedFolders[dirPath] = false;
    renderSidebar();
    renderPanes();
  }).catch(function (e) {
    console.error(e); setSaveState("error");
    alert("Couldn't move that note: " + e.message);
  });
}

/* rename a folder: make the new directory, move every file under it, drop the old one */
function renameFolder(path) {
  if (state.backend !== "folder") return;
  const current = path.slice(path.lastIndexOf("/") + 1);
  Dialogs.prompt("Rename folder", current).then(function (name) { renameFolderTo(path, current, name); });
}
function renameFolderTo(path, current, name) {
  if (!name) return;
  name = name.replace(/[\\/:*?"<>|]/g, "-").trim();
  if (!name || name === current) return;
  const parentPath = folderOf(path);
  const newPath = parentPath ? parentPath + "/" + name : name;
  if (state.folders.some(function (f) { return f.path.toLowerCase() === newPath.toLowerCase(); })) {
    alert('A folder called "' + name + '" is already there.');
    return;
  }
  syncAllPanes();
  Object.keys(pinned).forEach(function (k) {             /* pins on this folder and those inside it follow the rename */
    if (k === "folder:" + path || k.indexOf("folder:" + path + "/") === 0) { pinned["folder:" + newPath + k.slice(7 + path.length)] = 1; delete pinned[k]; }
  });
  savePins();
  const moving = state.notes.filter(function (n) { return n.path === path || n.path.indexOf(path + "/") === 0; });
  const parentH = parentPath ? folderHandle(parentPath) : state.dirHandle;
  let chain = parentH.getDirectoryHandle(name, { create: true }).then(function (h) {
    state.folders.push({ path: newPath, handle: h, parent: parentH });
    /* recreate the subfolder tree under the new name */
    const subs = state.folders.filter(function (f) { return f.path.indexOf(path + "/") === 0; })
      .sort(function (a, b) { return a.path.length - b.path.length; });
    let c = Promise.resolve();
    subs.forEach(function (f) {
      const rel = f.path.slice(path.length + 1);
      c = c.then(function () {
        const segs = rel.split("/"); let dir = h, np = newPath, cc = Promise.resolve();
        segs.forEach(function (seg) {
          cc = cc.then(function () {
            const par = dir;
            np = np + "/" + seg;
            return par.getDirectoryHandle(seg, { create: true }).then(function (dh) {
              dir = dh;
              if (!state.folders.some(function (x) { return x.path === np; })) state.folders.push({ path: np, handle: dh, parent: par });
            });
          });
        });
        return cc;
      });
    });
    return c;
  });
  moving.forEach(function (n) {
    chain = chain.then(function () {
      const rest = n.path.slice(path.length + 1);
      const destDir = rest.indexOf("/") === -1 ? newPath : newPath + "/" + rest.slice(0, rest.lastIndexOf("/"));
      const base = n.path.split("/").pop();
      const oldParent = n.parent || state.dirHandle;
      return folderHandle(destDir).getFileHandle(base, { create: true }).then(function (fh) {
        return fh.createWritable().then(function (w) {
          return w.write(n.content).then(function () { return w.close(); });
        }).then(function () {
          const oldId = n.id;
          n.handle = fh;
          n.parent = folderHandle(destDir);
          n.path = destDir + "/" + base;
          n.id = n.path;
          retargetNote(oldId, n.id);
          return oldParent.removeEntry(base).catch(function () {});
        });
      });
    });
  });
  chain.then(function () {
    return parentH.removeEntry(path.slice(path.lastIndexOf("/") + 1), { recursive: true }).catch(function () {});
  }).then(function () {
    state.folders = state.folders.filter(function (f) { return f.path !== path && f.path.indexOf(path + "/") !== 0; });
    Object.keys(collapsedFolders).forEach(function (k) {
      if (k === path || k.indexOf(path + "/") === 0) delete collapsedFolders[k];
    });
    sortNotes();
    renderSidebar();
    renderPanes();
  }).catch(function (e) {
    console.error(e); setSaveState("error");
    alert("Couldn't rename that folder: " + e.message);
    loadFolder();
  });
}

function deleteFolder(path) {
  if (state.backend !== "folder") return;
  const inside = state.notes.filter(function (n) { return n.path.indexOf(path + "/") === 0; });
  Dialogs.confirm('Delete "' + path + '"' + (inside.length ? " and move the " + inside.length + " note(s) inside it to .trash" : "") + "?").then(function (ok) { if (ok) deleteFolderNow(path, inside); });
}
function deleteFolderNow(path, inside) {
  const parentPath = folderOf(path);
  const parentH = parentPath ? folderHandle(parentPath) : state.dirHandle;
  let chain = Promise.resolve();
  inside.forEach(function (n) { chain = chain.then(function () { return trashNote(n).catch(function () {}); }); });
  chain.then(function () {
    return parentH.removeEntry(path.slice(path.lastIndexOf("/") + 1), { recursive: true });
  }).then(function () {
    Object.keys(pinned).forEach(function (k) { if (k === "folder:" + path || k.indexOf("folder:" + path + "/") === 0) delete pinned[k]; });
    inside.forEach(function (n) {
      delete pinned[String(n.id)];
      panes.forEach(function (p) {
        p.tabs = p.tabs.filter(function (t) { return !sameId(t, n.id); });
        if (sameId(p.noteId, n.id)) { p.deactivate(); p.noteId = p.tabs.length ? p.tabs[0] : null; p.reload(); }
      });
    });
    savePins();
    state.notes = state.notes.filter(function (n) { return n.path.indexOf(path + "/") !== 0; });
    state.folders = state.folders.filter(function (f) { return f.path !== path && f.path.indexOf(path + "/") !== 0; });
    renderSidebar();
    renderPanes();
  }).catch(function (e) { console.error(e); alert("Couldn't delete that folder: " + e.message); });
}

function createNote(dirPath) {
  dirPath = typeof dirPath === "string" ? dirPath : "";
  const target = focusedPane || panes[0];
  let id;
  if (state.backend === "folder") {
    const prefix = dirPath ? dirPath + "/" : "";
    const base = uniqueBasename("Untitled", prefix);
    const n = { id: prefix + base, path: prefix + base, title: base.replace(/\.md$/i, ""), content: "", handle: null, parent: folderHandle(dirPath), mtime: 0 };
    state.notes.push(n);
    sortNotes();
    writeNoteFile(n).catch(function (e) { console.error(e); setSaveState("error"); });
    id = n.id;
  } else {
    const ln = { id: noteSeq++, title: "Untitled", content: "", path: null, handle: null, parent: null };
    state.notes.push(ln);
    schedulePersist();
    id = ln.id;
  }
  target.open(id);
  target.caret = 0;
  state.renamingId = id;
  renderSidebar();
  panes.forEach(function (q) { q.renderBacklinks(); });
}

/* Deleted notes go to .trash/ so a mis-click is recoverable. The folder walker
   skips dot-directories, so they vanish from the sidebar but stay on disk. */
function stampNow() { return new Date().toISOString().slice(0, 16).replace(/[-:T]/g, ""); }

function trashNote(n) {
  const base = n.path.split("/").pop();
  const stamp = stampNow();
  return state.dirHandle.getDirectoryHandle(".trash", { create: true }).then(function (tdir) {
    return writeFile(tdir, base.replace(/\.md$/i, "") + " " + stamp + ".md", n.content);
  }).then(function () {
    return (n.parent || state.dirHandle).removeEntry(base);
  });
}

function deleteNote(id) {
  const n = findNote(id);
  if (!n) return;
  const msg = state.backend === "folder"
    ? 'Move "' + n.path + '" to .trash?'
    : 'Delete "' + n.title + '"?';
  Dialogs.confirm(msg).then(function (ok) { if (ok) removeNoteNow(id); });
}
/* remove a note without asking (deleteNote asks; bulk delete asks once for all) */
function removeNoteNow(id) {
  const n = findNote(id);
  if (!n) return;
  if (state.backend === "folder" && n.parent) {
    trashNote(n).catch(function (e) { console.error(e); setSaveState("error"); });
  }
  state.notes = state.notes.filter(function (x) { return String(x.id) !== String(id); });
  delete dirty[id];
  if (pinned[String(id)]) { delete pinned[String(id)]; savePins(); }
  delete noteHistory[String(id)];
  panes.forEach(function (p) {
    p.tabs = p.tabs.filter(function (t) { return !sameId(t, id); });
    if (sameId(p.noteId, id)) {
      p.deactivate();
      p.noteId = p.tabs.length ? p.tabs[0] : null;
      p.reload();
      p.render();
    }
  });
  if (state.backend === "local") schedulePersist();
  renderSidebar();
  panes.forEach(function (p) { p.renderBacklinks(); });
}

function commitRename(n, title) {
  syncAllPanes();
  state.renamingId = null;
  const clean = sanitizeName(title);
  if (state.backend === "local") {
    n.title = clean;
    schedulePersist();
    renderSidebar();
    renderPanes();
    return;
  }
  if (clean === n.title) { renderSidebar(); return; }
  const dirPrefix = n.path.indexOf("/") !== -1 ? n.path.slice(0, n.path.lastIndexOf("/") + 1) : "";
  const oldBase = n.path.split("/").pop();
  const newBase = uniqueBasename(clean, dirPrefix);
  const parent = n.parent || state.dirHandle;
  writeFile(parent, newBase, n.content).then(function (fh) {
    n.handle = fh;
    return parent.removeEntry(oldBase).catch(function () {});
  }).then(function () {
    const oldId = n.id;
    n.path = dirPrefix + newBase;
    n.id = n.path;
    n.title = newBase.replace(/\.md$/i, "");
    retargetNote(oldId, n.id);
    sortNotes();
    renderSidebar();
    renderPanes();
  }).catch(function (e) {
    console.error(e); setSaveState("error"); renderSidebar();
  });
}

function openOrCreateByTitle(title, pane) {
  const existing = noteByTitle(title);
  if (existing) { openInPane(existing.id, pane); return; }
  if (state.backend === "folder") {
    const base = uniqueBasename(sanitizeName(title), "");
    const n = { id: base, path: base, title: base.replace(/\.md$/i, ""), content: "# " + title + "\n\n", handle: null, parent: state.dirHandle };
    state.notes.push(n);
    sortNotes();
    writeNoteFile(n).catch(function (e) { console.error(e); });
    openInPane(n.id, pane);
  } else {
    const ln = { id: noteSeq++, title: title, content: "# " + title + "\n\n", path: null, handle: null, parent: null };
    state.notes.push(ln);
    schedulePersist();
    openInPane(ln.id, pane);
  }
  renderSidebar();
  panes.forEach(function (q) { q.renderBacklinks(); });
}

