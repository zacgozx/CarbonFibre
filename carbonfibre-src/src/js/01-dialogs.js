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
  /* one of a few answers, as buttons: the system's dialog in the desktop app, the browser's own
     modal dialog otherwise (it keeps focus inside, Esc closes it, and focus returns afterwards).
     labels: what each button says ({ value: "Button text" }). Esc or Cancel gives fallback, the
     safe answer, which also has the focus first. */
  choose(message, choices, fallback, labels) {
    const text = function (c) { return (labels && labels[c]) || String(c); }, shown = choices.map(text);
    if (Dialogs.desktop) return Dialogs.desktop.choose(String(message), shown).then(function (v) { const i = shown.indexOf(v); return i === -1 ? fallback : choices[i]; });
    return new Promise(function (resolve) {
      const d = document.createElement("dialog");
      d.className = "cf-ask";
      d.setAttribute("aria-labelledby", "cfAskText");
      const lines = String(message).split("\n");
      d.innerHTML = '<form method="dialog"><p id="cfAskText" class="cf-ask-title"></p><p class="cf-ask-more"></p><div class="cf-ask-btns"></div></form>';
      d.querySelector(".cf-ask-title").textContent = lines[0];
      d.querySelector(".cf-ask-more").textContent = lines.slice(1).join("\n").trim();
      const row = d.querySelector(".cf-ask-btns");
      choices.forEach(function (c) {
        const b = document.createElement("button");
        b.value = c; b.textContent = text(c); b.className = "cf-ask-btn" + (c === fallback ? " cf-ask-safe" : "");
        if (c === fallback) b.autofocus = true;
        row.appendChild(b);
      });
      d.addEventListener("keydown", function (e) { e.stopPropagation(); });   /* the app's shortcuts wait */
      d.addEventListener("close", function () {
        const v = d.returnValue;
        d.remove();
        resolve(choices.indexOf(v) !== -1 ? v : fallback);
      });
      document.body.appendChild(d);
      d.showModal();
    });
  }
};
