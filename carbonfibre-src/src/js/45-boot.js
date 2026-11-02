/* ============================================================
   boot
   ============================================================ */


(function boot() {
  const first = createPane(0);
  panes.push(first);
  layoutPanes();
  focusedPane = first;
  first.root.classList.add("focused");
  updateStorageUI();
  NarrowLayout.settle();                               /* before anything loads, so a phone never flashes the panel */

  function bootLocal() {
    loadLocalNotes();
    loadLocalSheets();
    updateStorageUI();
    renderSidebar();
    renderPanes();
    restoreSession();
    tbLaunchPin();
    NarrowLayout.settle();
  }

  /* inside VS Code: the notes folder is the one the extension hands over (no browser folder handles) */
  if (HostBridge.active) {
    HostBridge.vault().then(function (h) {
      if (!h) { bootLocal(); return; }
      state.dirHandle = h;
      state.backend = "folder";
      return loadFolder().then(NarrowLayout.settle);
    }).catch(function (e) { console.error(e); bootLocal(); });
    return;
  }

  idbGet("sketchHandle").then(function (h) {
    if (!h) return;
    return h.queryPermission({ mode: "readwrite" }).then(function (perm) {
      if (perm === "granted") { state.sketchHandle = h; return sketchScan(); }
      state.sketchPending = h;                          /* the library offers Reconnect */
    });
  }).catch(function () {});
  idbGet("dirHandle").then(function (h) {
    if (!h) { bootLocal(); NotesStorage.welcomeIfNew(); return; }   /* a first visit asks where notes should live */
    return h.queryPermission({ mode: "readwrite" }).then(function (perm) {
      if (perm === "granted") {
        state.dirHandle = h;
        state.backend = "folder";
        return loadFolder().then(NarrowLayout.settle);
      }
      showReconnect(h.name);
      bootLocal();
    });
  }).catch(function () { bootLocal(); NotesStorage.welcomeIfNew(); });
})();
