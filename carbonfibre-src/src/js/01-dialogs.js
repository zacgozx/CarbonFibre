/* ============================================================
   Asking before doing something. Each returns a promise: in the desktop app (desktop/) the
   questions are the system's own dialogs, which answer later; Electron has no window.prompt.
   In a browser they are the browser's confirm and prompt.
   ============================================================ */
const Dialogs = {
  desktop: typeof window.cfDesktop === "object" && window.cfDesktop ? window.cfDesktop : null,
  confirm(message) {
    if (Dialogs.desktop) return Dialogs.desktop.confirm(String(message)).then(Boolean);
    return Promise.resolve(window.confirm(message));
  },
  prompt(message, value) {
    if (Dialogs.desktop) return Dialogs.desktop.prompt(String(message), value == null ? "" : String(value)).then(function (v) { return v == null ? null : String(v); });
    return Promise.resolve(window.prompt(message, value == null ? "" : value));
  },
  /* one of a few answers: buttons in the desktop app; in a browser, typed into a prompt */
  choose(message, choices, fallback) {
    if (Dialogs.desktop) return Dialogs.desktop.choose(String(message), choices.map(String)).then(function (v) { return v || fallback; });
    const typed = window.prompt(message + "\n\nType " + choices.join(", ") + ":", fallback);
    const v = String(typed || fallback).trim().toLowerCase();
    return Promise.resolve(choices.indexOf(v) !== -1 ? v : fallback);
  }
};
