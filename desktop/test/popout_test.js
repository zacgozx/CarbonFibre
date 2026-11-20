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

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let first = true;
app.on("browser-window-created", (_e, w) => {
  if (!first) return;
  first = false;
  w.webContents.once("did-finish-load", () => run(w).catch((e) => { check("ran without throwing", false, String(e && e.stack || e)); finish(); }));
});

async function run(w) {
  const js = (s) => w.webContents.executeJavaScript(s);
  /* a note to pop out, without a folder: straight into the page's state */
  await js(`state.notes.push({ id: 7, title: "Popped", path: "Popped", content: "# Popped\\n\\nline" }); openInPane(7, panes[0], { here: true }); true`);
  const made = new Promise((r) => app.once("browser-window-created", (_e, c) => r(c)));
  await js(`PopOut.open(panes[0]); true`);
  const child = await Promise.race([made, wait(5000).then(() => null)]);
  check("the note's window opens", !!child);
  if (!child) return finish();
  await new Promise((r) => child.webContents.once("did-finish-load", r));
  await wait(800);
  const cj = (s) => child.webContents.executeJavaScript(s);
  check("it shows just that note", await cj(`document.body.classList.contains("cf-popout") && panes[0].note() && panes[0].note().title === "Popped"`));
  const rows0 = Object.keys(db.pageAll().data).length;
  await cj(`(() => { const q = panes[0]; q.setActive(2, q.lines[2].length); q.ta.value += " more"; q.ta.dispatchEvent(new Event("input")); return true; })()`);
  await wait(800);
  check("an edit there reaches the main window", (await js(`findNote(7).content`)).endsWith("line more"));
  check("that window saved nothing to the database itself", Object.keys(db.pageAll().data).length >= rows0 && !(await cj(`!!window.cfDesktopStore`)));
  const opened = await cj(`(() => { try { return !!window.open("https://example.com"); } catch (e) { return "threw"; } })()`);
  check("it can't open other windows", BrowserWindow.getAllWindows().length === 2, String(opened));
  child.close();
  await wait(400);
  check("closing it leaves the app running", !w.isDestroyed());
  finish();
}
function finish() {
  let bad = 0;
  for (const x of results) { if (!x.ok) bad++; console.log((x.ok ? "PASS  " : "FAIL  ") + x.name + (x.ok || !x.detail ? "" : "\n      " + x.detail)); }
  console.log("\n" + (results.length - bad) + " of " + results.length + " passed");
  db.close();
  app.exit(bad ? 1 : 0);
}
