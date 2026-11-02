
/* ---- narrow screens (phones, tablets, a narrow window): the side panel floats over the editor ----
   It starts closed so the note is what you see first, and it gets out of the way once you've used it:
   opening a note from it, or tapping the editor, closes it. Wider than BREAK, nothing here applies. */
const NarrowLayout = {
  BREAK: 900,                                          /* matches the @media rules in css/24-responsive.css */
  query: null,
  isNarrow() { return NarrowLayout.query ? NarrowLayout.query.matches : window.innerWidth <= NarrowLayout.BREAK; },
  isOpen() { return !sideEl.classList.contains("side-closed"); },
  closeSide() { if (NarrowLayout.isOpen()) showView(currentView, true); },
  /* at startup and after a session or folder restore, which may have opened the panel */
  settle() { if (NarrowLayout.isNarrow()) NarrowLayout.closeSide(); },
  init() {
    NarrowLayout.query = window.matchMedia("(max-width: " + NarrowLayout.BREAK + "px)");
    const onChange = function () { if (NarrowLayout.query.matches) NarrowLayout.closeSide(); };
    if (NarrowLayout.query.addEventListener) NarrowLayout.query.addEventListener("change", onChange);
    /* a note picked from the list: show it */
    sideEl.addEventListener("click", function (e) {
      if (!NarrowLayout.isNarrow() || !e.target.closest(".side-item[data-nid], .tt-tab") || e.target.closest(".tt-x")) return;
      setTimeout(NarrowLayout.closeSide, 0);           /* after the list has opened the note */
    });
    /* a tap outside the panel (not on the buttons that toggle it) closes it */
    document.addEventListener("pointerdown", function (e) {
      if (!NarrowLayout.isNarrow() || !NarrowLayout.isOpen()) return;
      if (e.target.closest("#side, #activity, #btnSidebar, .menu, .cmdpal, .nsw-win")) return;
      NarrowLayout.closeSide();
    }, true);
  }
};
NarrowLayout.init();
