/* ============================================================
   boot
   ============================================================ */


(function boot() {
  const first = createPane(0);
  panes.push(first);
  layoutPanes();
  focusedPane = first;
  first.root.classList.add("focused");
  if (PopOut.sat) { PopOut.boot(first); return; }        /* a popped-out note: its text comes from the main window */
  updateStorageUI();
  NarrowLayout.settle();                               /* before anything loads, so a phone never flashes the panel */
  PluginManager.init();                                /* the Plugins button; plugins themselves run only in the desktop app */
  PluginHost.start();

  function bootLocal() {
    loadLocalNotes();
    loadLocalSheets();
    updateStorageUI();
    renderSidebar();
    renderPanes();
    restoreSession();
    tbLaunchPin();
    NarrowLayout.settle();
    PluginHost.notesReady();
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
