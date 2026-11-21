/* A note popped out into its own window (js/44-popout.js) in the desktop app: the window opens (and
   nothing else does), shows the note, keeps both windows in step, and saves nothing itself.
   Run: electron test/popout_test.js */
"use strict";
const { app, BrowserWindow, dialog } = require("electron");
const path = require("node:path"), fs = require("node:fs"), os = require("node:os");
const ud = fs.mkdtempSync(path.join(os.tmpdir(), "cf-pop-"));
app.setPath("userData", ud);
dialog.showMessageBox = async () => ({ response: 0 });
require("../main.js");
const db = require("../db.js");
app.removeAllListeners("window-all-closed");          /* the test ends the app itself, after its last checks */

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/* a test that hangs (a dialog nobody answers, a page that crashed) fails with where it stopped, rather
   than running until the CI job is cancelled */
let at = "starting", ended = false;
dialog.showMessageBoxSync = () => 1;
setTimeout(() => { if (!ended) { check("finished within 90 s (stuck at: " + at + ")", false); finish(); } }, 90000);
app.on("render-process-gone", (_e, _wc, d) => { if (!ended) { check("no page crashed (stuck at: " + at + ")", false, d && d.reason); finish(); } });
let first = true;
app.on("browser-window-created", (_e, w) => {
  if (!first) return;
  first = false;
  w.webContents.once("did-finish-load", () => run(w).catch((e) => { check("ran without throwing", false, String(e && e.stack || e)); finish(); }));
});

async function run(w) {
  const js = (s) => { at = s.slice(0, 70); return w.webContents.executeJavaScript(s); };
  /* a note to pop out, without a folder: straight into the page's state */
  await js(`state.notes.push({ id: 7, title: "Popped", path: "Popped", content: "# Popped\\n\\nline" }); openInPane(7, panes[0], { here: true }); true`);
  const made = new Promise((r) => app.once("browser-window-created", (_e, c) => r(c)));
  await js(`PopOut.open(panes[0], 7, 400, 300); true`);   /* as when a tab is let go at (400, 300) on screen */
  const child = await Promise.race([made, wait(5000).then(() => null)]);
  check("the note's window opens", !!child);
  if (!child) return finish();
  await new Promise((r) => child.webContents.once("did-finish-load", r));
  await wait(800);
  const cj = (s) => { at = "note window: " + s.slice(0, 60); return child.webContents.executeJavaScript(s); };
  const bx = child.getBounds();
  check("it opens where the tab was let go", Math.abs(bx.x - 280) < 40 && Math.abs(bx.y - 280) < 60, JSON.stringify(bx));
  check("it shows just that note", await cj(`document.body.classList.contains("cf-popout") && panes[0].note() && panes[0].note().title === "Popped"`));
  const rows0 = Object.keys(db.pageAll().data).length;
  await cj(`(() => { const q = panes[0]; q.setActive(2, q.lines[2].length); q.ta.value += " more"; q.ta.dispatchEvent(new Event("input")); return true; })()`);
  await wait(800);
  check("an edit there reaches the main window", (await js(`findNote(7).content`)).endsWith("line more"));
  check("that window saved nothing to the database itself", Object.keys(db.pageAll().data).length >= rows0 && !(await cj(`!!window.cfDesktopStore`)));
  const opened = await cj(`(() => { try { return !!window.open("https://example.com"); } catch (e) { return "threw"; } })()`);
  check("it can't open other windows", BrowserWindow.getAllWindows().length === 2, String(opened));
  /* the main window reloads: the note's window carries on, and its edits arrive once the page is back.
     (No folder in this test, so the page's notes come back from the database; the note is put back first.) */
  await js(`flushPersist(); true`);
  const back = new Promise((r) => w.webContents.once("did-finish-load", r));
  w.webContents.reload();
  await back;
  await js(`if (!findNote(7)) state.notes.push({ id: 7, title: "Popped", path: "Popped", content: "" }); true`);
  await cj(`(() => { const q = panes[0]; q.ta.value += " after"; q.ta.dispatchEvent(new Event("input")); return true; })()`);
  await wait(3500);
  check("after the main window reloads, edits there still arrive", (await js(`findNote(7).content`)).endsWith("more after"), await js(`findNote(7).content`));
  check("...with no warning bar", await cj(`!document.getElementById("popOffline")`));
  /* typed, then the main window closed at once: those keystrokes are saved anyway */
  await cj(`(() => { const q = panes[0]; q.ta.value += " last"; q.ta.dispatchEvent(new Event("input")); return true; })()`);
  const gone = new Promise((r) => child.once("closed", r));
  w.close();
  await Promise.race([gone, wait(3000)]);
  await wait(300);
  check("closing the main window closes the note's window too", child.isDestroyed());
  const saved = JSON.parse(db.pageAll().data["carbonfibre-v1"] || "{}"), note = (saved.notes || []).find((x) => x.id === 7);
  check("keys typed there just before the main window closed are saved", note && note.content.endsWith("after last"), note && note.content.slice(-40));
  finish();
}
function finish() {
  if (ended) return;
  ended = true;
  let bad = 0;
  for (const x of results) { if (!x.ok) bad++; console.log((x.ok ? "PASS  " : "FAIL  ") + x.name + (x.ok || !x.detail ? "" : "\n      " + x.detail)); }
  console.log("\n" + (results.length - bad) + " of " + results.length + " passed");
  db.close();
  app.exit(bad ? 1 : 0);
}
