/* ============================================================
   boot
   ============================================================ */


(function boot() {
  var first = createPane(0);
  panes.push(first);
  layoutPanes();
  focusedPane = first;
  first.root.classList.add("focused");
  updateStorageUI();

  function bootLocal() {
    loadLocalNotes();
    loadLocalSheets();
    updateStorageUI();
    renderSidebar();
    renderPanes();
    restoreSession();
    tbLaunchPin();
  }

  idbGet("sketchHandle").then(function (h) {
    if (!h) return;
    return h.queryPermission({ mode: "readwrite" }).then(function (perm) {
      if (perm === "granted") { state.sketchHandle = h; return sketchScan(); }
      state.sketchPending = h;                          /* the library offers Reconnect */
    });
  }).catch(function () {});
  idbGet("dirHandle").then(function (h) {
    if (!h) { bootLocal(); return; }
    return h.queryPermission({ mode: "readwrite" }).then(function (perm) {
      if (perm === "granted") {
        state.dirHandle = h;
        state.backend = "folder";
        return loadFolder();
      }
      showReconnect(h.name);
      bootLocal();
    });
  }).catch(bootLocal);
})();
