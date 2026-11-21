/* ============================================================
   The Notes panel (opened in a pane): Overview (pinned notes, pinned folders, recent notes) and All
   notes. This keeps its few settings; js/36-all-notes.js draws it. (The task board, its dashboard and
   its ServiceNow links were removed; old saved board data is ignored and dropped on the next save.
   The pane type is still called "taskboard" inside, so layouts saved before keep opening it.)
   ============================================================ */
const TB_KEY = "carbonfibre-taskboard";
let tb = { pinned: false, pinnedPane: 0, notesMode: "overview", libGroup: "none" };
/* settings read from storage are checked field by field */
function tbClean(v) {
  const out = {};
  if (typeof v.pinned === "boolean") out.pinned = v.pinned;
  if (isFinite(Number(v.pinnedPane)) && Number(v.pinnedPane) >= 0) out.pinnedPane = Math.floor(Number(v.pinnedPane));
  if (v.notesMode === "all" || v.notesMode === "overview") out.notesMode = v.notesMode;
  if (["none", "type", "folder", "month"].indexOf(v.libGroup) !== -1) out.libGroup = v.libGroup;
  return out;
}
let tbSaveTimer = null;
function tbSave() {
  if (tbSaveTimer) clearTimeout(tbSaveTimer);
  tbSaveTimer = setTimeout(function () { tbSaveTimer = null; storeSet(TB_KEY, JSON.stringify(tb)); }, 300);
}
try { const st = JSON.parse(localStorage.getItem(TB_KEY) || "null"); if (st && typeof st === "object") tb = Object.assign(tb, tbClean(st)); } catch (e) { /* storage off */ }
function tbEl(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
/* ---- the Notes view: pinned notes as cards, a panel per pinned folder, and recent notes ---- */
function tbnPreview(n) {
  const lines = String(n.content || "").split("\n"); let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i].trim();
    if (/^```/.test(l)) { inFence = !inFence; continue; }
    if (inFence || !l || /^#{1,6}\s/.test(l) || /^\|/.test(l) || /^-{3,}$/.test(l) || /^---$/.test(l)) continue;
    l = l.replace(/^[-*+]\s+\[[ xX]\]\s+/, "").replace(/^[-*+>]\s+|^\d+[.)]\s+/, "").replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, "$1")
         .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`~=]{1,3}/g, "");
    if (l) return l.length > 120 ? l.slice(0, 117) + "\u2026" : l;
  }
  return "";
}
function tbnOpenTasks(n) { const m = String(n.content || "").match(/^\s*(?:[-*+]|\d+[.)])\s+\[ \]/gm); return m ? m.length : 0; }
function tbnAgo(ms) {
  if (!ms) return "";
  const d = Date.now() - ms, m = Math.round(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + "h ago";
  const days = Math.round(h / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return days + " days ago";
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
function tbnFolderOf(n) { const p = n.path || ""; return p.indexOf("/") === -1 ? "" : p.slice(0, p.lastIndexOf("/")); }
