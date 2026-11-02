/* ============================================================
   storage UI
   ============================================================ */

function updateStorageUI() {
  const label = document.getElementById("storageLabel");
  const bF = document.getElementById("btnFolder");
  const bL = document.getElementById("btnLocal");
  const bR = document.getElementById("btnReload");
  const bNF = document.getElementById("btnNewFolder");
  bNF.style.display = state.backend === "folder" ? "" : "none";
  if (state.backend === "folder") {
    label.innerHTML = 'Folder: <span class="loc">' + esc(state.dirHandle.name) + "</span>";
    bF.textContent = "Change";
    bL.style.display = ""; bR.style.display = "";
  } else {
    label.textContent = "Browser storage";
    bF.textContent = "Open folder";
    if (!NotesStorage.canUseFolders()) bF.title = "This browser can\u2019t open folders: click for details";
    bL.style.display = "none"; bR.style.display = "none";
  }
}

/* ---- where notes live: the first-run choice, and the "Open folder" button ----
   A folder needs the File System Access API (Edge, Chrome and other Chromium browsers on a desktop).
   Elsewhere the button explains that instead of failing. */
const NotesStorage = {
  SEEN_KEY: "carbonfibre-welcomed",
  el: null,
  back: null,                                         /* what had focus before the dialog opened */
  canUseFolders() { return typeof window.showDirectoryPicker === "function"; },
  /* the status bar's Open folder / Change */
  pick() {
    if (NotesStorage.canUseFolders()) pickFolder();
    else NotesStorage.open();
  },
  /* a first visit: nothing stored in this browser and no folder chosen before */
  welcomeIfNew() {
    let seen = false;
    try { seen = !!localStorage.getItem(NotesStorage.SEEN_KEY) || !!localStorage.getItem(LOCAL_KEY) || !!localStorage.getItem(LEGACY_KEY); } catch (e) { seen = true; }
    if (!seen && state.backend !== "folder" && !state.notes.length) NotesStorage.open();
  },
  build() {
    const win = document.createElement("div");
    win.className = "nsw-win";
    win.hidden = true;
    const folders = NotesStorage.canUseFolders();
    win.innerHTML =
      '<div class="nsw-dialog" role="dialog" aria-modal="true" aria-labelledby="nswTitle">' +
        '<h2 id="nswTitle">Where should your notes live?</h2>' +
        '<p class="nsw-lede">Either way they stay on this computer. CarbonFibre makes no network requests, so nothing you write is uploaded.</p>' +
        '<div class="nsw-opts">' +
          '<section class="nsw-opt' + (folders ? "" : " nsw-off") + '">' +
            "<h3>A folder you choose</h3>" +
            "<p>Each note is a <code>.md</code> file. Open them in any editor, back them up, or sync the folder with your own tools. " +
            "The browser asks you to allow access to that one folder, and nothing outside it.</p>" +
            (folders ? "" : '<p class="nsw-why">This browser can’t open folders. Use Microsoft Edge or Google Chrome on a desktop or laptop.</p>') +
            '<button type="button" class="nsw-btn nsw-primary" data-nsw="folder"' + (folders ? "" : " disabled") + ">Choose a folder…</button>" +
          "</section>" +
          '<section class="nsw-opt">' +
            "<h3>This browser</h3>" +
            "<p>Notes are kept in this browser’s storage on this device. Clearing site data removes them, so export a copy now and then.</p>" +
            '<button type="button" class="nsw-btn" data-nsw="local">Use browser storage</button>' +
          "</section>" +
        "</div>" +
        '<p class="nsw-foot">You can change this any time from the bottom-left of the window.</p>' +
      "</div>";
    win.addEventListener("click", function (e) {
      const b = e.target.closest("[data-nsw]");
      if (b) NotesStorage.choose(b.dataset.nsw);
      else if (e.target === win) NotesStorage.close();
    });
    win.addEventListener("keydown", function (e) {
      e.stopPropagation();                             /* the app's own shortcuts wait until this closes */
      if (e.key === "Escape") { e.preventDefault(); NotesStorage.close(); }
      else if (e.key === "Tab") {                      /* keep focus inside the dialog */
        const bs = Array.prototype.filter.call(win.querySelectorAll("button"), function (x) { return !x.disabled; });
        const i = bs.indexOf(document.activeElement);
        if (e.shiftKey ? i <= 0 : i === bs.length - 1) { e.preventDefault(); bs[e.shiftKey ? bs.length - 1 : 0].focus(); }
      }
    });
    document.body.appendChild(win);
    return win;
  },
  open() {
    if (!NotesStorage.el) NotesStorage.el = NotesStorage.build();
    NotesStorage.back = document.activeElement;
    NotesStorage.el.hidden = false;
    const first = NotesStorage.el.querySelector("[data-nsw]:not([disabled])");
    if (first) first.focus();
  },
  close() {
    if (!NotesStorage.el || NotesStorage.el.hidden) return;
    NotesStorage.el.hidden = true;
    storeSet(NotesStorage.SEEN_KEY, "1");
    if (NotesStorage.back && NotesStorage.back.focus) NotesStorage.back.focus();
  },
  choose(kind) {
    NotesStorage.close();
    if (kind === "folder") pickFolder();
    else if (state.backend === "folder") Dialogs.confirm("Switch to browser storage? Your folder files stay on disk untouched.").then(function (ok) { if (ok) switchToLocal(); });
  }
};

function showReconnect(name) {
  document.getElementById("reconnectText").textContent = 'Notes folder "' + name + '" needs permission again.';
  document.getElementById("reconnectBanner").classList.add("show");
}
function hideReconnect() { document.getElementById("reconnectBanner").classList.remove("show"); }

/* copy text to the clipboard, with a fallback for browsers that refuse the async API */
/* ---- formatted copy: the clipboard gets the markdown as plain text and the same content as
   HTML. Teams, Outlook and Word paste the HTML (real bold, lists, tables, code blocks); plain
   text editors paste the markdown. Inline styles only: Teams drops style sheets. ---- */
function richHtml(lines) {
  const html = blocksToHtml(noteBlocks(lines, computeFenceMeta(lines)))
    .replace(/<table>/g, '<table style="border-collapse:collapse;margin:6px 0">')
    .replace(/<th( style="text-align:[a-z]+")?>/g, function (m, al) { return '<th style="border:1px solid #9aa0a8;padding:4px 8px;background:#eef0f3;text-align:' + (al ? al.match(/:([a-z]+)/)[1] : "left") + '">'; })
    .replace(/<td( style="text-align:[a-z]+")?>/g, function (m, al) { return '<td style="border:1px solid #9aa0a8;padding:4px 8px;text-align:' + (al ? al.match(/:([a-z]+)/)[1] : "left") + '">'; })
    .replace(/<pre>/g, '<pre style="font-family:Consolas,monospace;font-size:13px;background:#f4f5f7;border:1px solid #d9dce1;padding:8px;white-space:pre-wrap">')
    .replace(/<code>/g, '<code style="font-family:Consolas,monospace;background:#f1f2f4;padding:0 3px">')
    .replace(/<blockquote>/g, '<blockquote style="margin:4px 0;padding-left:10px;border-left:3px solid #c5c9d0;color:#444">');
  return '<div data-cf-md="1" style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:14px">' + html + "</div>";
}
function copyRich(lines) {
  const text = lines.join("\n"), html = richHtml(lines);
  let done = false;
  const onCopy = function (e) { e.preventDefault(); e.clipboardData.setData("text/plain", text); e.clipboardData.setData("text/html", html); done = true; };
  document.addEventListener("copy", onCopy, true);
  try { document.execCommand("copy"); } catch (e) {}
  document.removeEventListener("copy", onCopy, true);
  if (done) return Promise.resolve(true);
  /* no copy event allowed here: try the async clipboard, then plain text */
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      return navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([text], { type: "text/plain" }), "text/html": new Blob([html], { type: "text/html" }) })])
        .then(function () { return true; }, function () { copyText(text); return false; });
    }
  } catch (e) {}
  copyText(text);
  return Promise.resolve(false);
}
function copyText(text) {
  function fallback() {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(fallback);
  else fallback();
}

