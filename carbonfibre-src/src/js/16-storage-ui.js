/* ============================================================
   storage UI
   ============================================================ */

function updateStorageUI() {
  var label = document.getElementById("storageLabel");
  var bF = document.getElementById("btnFolder");
  var bL = document.getElementById("btnLocal");
  var bR = document.getElementById("btnReload");
  var bNF = document.getElementById("btnNewFolder");
  bNF.style.display = state.backend === "folder" ? "" : "none";
  if (state.backend === "folder") {
    label.innerHTML = 'Folder: <span class="loc">' + esc(state.dirHandle.name) + "</span>";
    bF.textContent = "Change";
    bL.style.display = ""; bR.style.display = "";
  } else {
    label.textContent = "Browser storage";
    bF.textContent = "Open folder";
    bL.style.display = "none"; bR.style.display = "none";
  }
}

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
  var html = blocksToHtml(noteBlocks(lines, computeFenceMeta(lines)))
    .replace(/<table>/g, '<table style="border-collapse:collapse;margin:6px 0">')
    .replace(/<th( style="text-align:[a-z]+")?>/g, function (m, al) { return '<th style="border:1px solid #9aa0a8;padding:4px 8px;background:#eef0f3;text-align:' + (al ? al.match(/:([a-z]+)/)[1] : "left") + '">'; })
    .replace(/<td( style="text-align:[a-z]+")?>/g, function (m, al) { return '<td style="border:1px solid #9aa0a8;padding:4px 8px;text-align:' + (al ? al.match(/:([a-z]+)/)[1] : "left") + '">'; })
    .replace(/<pre>/g, '<pre style="font-family:Consolas,monospace;font-size:13px;background:#f4f5f7;border:1px solid #d9dce1;padding:8px;white-space:pre-wrap">')
    .replace(/<code>/g, '<code style="font-family:Consolas,monospace;background:#f1f2f4;padding:0 3px">')
    .replace(/<blockquote>/g, '<blockquote style="margin:4px 0;padding-left:10px;border-left:3px solid #c5c9d0;color:#444">');
  return '<div data-cf-md="1" style="font-family:\'Segoe UI\',Arial,sans-serif;font-size:14px">' + html + "</div>";
}
function copyRich(lines) {
  var text = lines.join("\n"), html = richHtml(lines), done = false;
  var onCopy = function (e) { e.preventDefault(); e.clipboardData.setData("text/plain", text); e.clipboardData.setData("text/html", html); done = true; };
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
    var ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(fallback);
  else fallback();
}

