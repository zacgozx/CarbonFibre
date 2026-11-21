/* The app's SQLite file (db.js): the page's storage goes there instead of the browser's, what the
   browser had is copied in once, the plugin and theme settings that were JSON files move in, and it
   all survives a restart of the page. Run: electron test/db_test.js */
"use strict";
const { app, BrowserWindow, dialog } = require("electron");
const path = require("node:path"), fs = require("node:fs"), os = require("node:os");
const ud = fs.mkdtempSync(path.join(os.tmpdir(), "cf-db-"));
app.setPath("userData", ud);
/* settings as an older version of the app left them, as JSON files */
fs.mkdirSync(path.join(ud, "plugins"), { recursive: true });
fs.mkdirSync(path.join(ud, "themes"), { recursive: true });
fs.mkdirSync(path.join(ud, "plugins", "old-plugin"), { recursive: true });
fs.writeFileSync(path.join(ud, "plugins", "network.json"), JSON.stringify({ "old-plugin": true }));
fs.writeFileSync(path.join(ud, "plugins", "enabled.json"), JSON.stringify(["old-plugin"]));
fs.writeFileSync(path.join(ud, "plugins", "old-plugin", "data.json"), JSON.stringify({ greeting: "kept" }));
fs.writeFileSync(path.join(ud, "themes", "active.json"), JSON.stringify({ name: "Old Theme" }));
dialog.showMessageBox = async () => ({ response: 0 });
require("../main.js");
const db = require("../db.js");
const store = require("../plugins/store.js");
const themes = require("../plugins/themes.js");

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const loaded = (w) => new Promise((r) => w.webContents.once("did-finish-load", r));
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
  check("the page's storage is the app's database", await js("window.cfDesktopStore === true"));
  check("the file is carbonfibre.db in the app's data folder", fs.existsSync(path.join(ud, "carbonfibre.db")), db.where());

  await js(`localStorage.setItem("carbonfibre-theme", "light"); localStorage.setItem("cf-test", "one"); localStorage.removeItem("cf-gone"); true`);
  await wait(150);
  const rows = db.pageAll().data;
  check("a setting the page saves lands in the database", rows["carbonfibre-theme"] === "light" && rows["cf-test"] === "one", JSON.stringify(rows).slice(0, 200));
  const big = 8 * 1024 * 1024;
  const bigOk = await js(`(() => { try { localStorage.setItem("cf-big", "x".repeat(${big})); return true; } catch (e) { return String(e); } })()`);
  await wait(400);
  check("no browser quota: 8 MB saves (the browser stops at about 5)", bigOk === true && (db.pageAll().data["cf-big"] || "").length === big, String(bigOk));
  await js(`localStorage.removeItem("cf-big"); true`);
  await wait(150);
  check("removing it removes it from the database", !("cf-big" in db.pageAll().data));

  print("PLUGIN AND THEME SETTINGS");
  check("plugins switched on: moved in from enabled.json", await store.anyEnabled() && JSON.parse(db.get("plugins", "enabled")).includes("old-plugin"));
  check("internet grants: moved in from network.json", await store.networkAllowed("old-plugin"));
  check("a plugin's saved settings: moved in from its data.json", JSON.parse(await store.loadData("old-plugin")).greeting === "kept");
  await store.saveData("old-plugin", JSON.stringify({ greeting: "changed" }));
  check("saving them writes the database, not the file", JSON.parse(db.get("plugin-data", "old-plugin")).greeting === "changed" && JSON.parse(fs.readFileSync(path.join(ud, "plugins", "old-plugin", "data.json"), "utf8")).greeting === "kept");
  check("a plugin reading its data.json gets the saved settings", JSON.parse(await store.pluginFs.read("old-plugin", "data.json")).greeting === "changed");
  check("the theme in use: moved in from active.json", (await themes.activeName()) === "Old Theme");
  await store.setNetwork("old-plugin", false);
  check("a change after the move isn't undone by the old file", !(await store.networkAllowed("old-plugin")));

  print("COPYING BROWSER STORAGE IN, ONCE");
  /* as if the app had only ever used browser storage: empty the table, then save something the
     browser's own way, in a window on the same address with no desktop bridge */
  db.tx((d) => { d.exec("DELETE FROM page"); d.exec("DELETE FROM meta WHERE key = 'page-copied'"); });
  const plain = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
  const pl = loaded(plain);
  plain.loadURL("app://carbonfibre/index.html");
  await pl;
  const plainSaw = await plain.webContents.executeJavaScript(`window.cfDesktopStore === true ? "bridge" : (localStorage.setItem("cf-from-browser", "copied"), "plain")`);
  plain.destroy();
  check("(a window without the bridge uses browser storage)", plainSaw === "plain", plainSaw);
  const rl = loaded(w);
  w.webContents.reload();
  await rl;
  await wait(200);
  check("the next start copies browser storage into the database", await js(`localStorage.getItem("cf-from-browser")`) === "copied" && db.pageAll().data["cf-from-browser"] === "copied" && db.pageAll().copied);
  await js(`localStorage.setItem("cf-from-browser", "changed here"); localStorage.setItem("cf-test", "two"); true`);
  await wait(150);
  const rl2 = loaded(w);
  w.webContents.reload();
  await rl2;
  check("after that the database wins: a later start doesn't copy it again", await js(`localStorage.getItem("cf-from-browser")`) === "changed here");
  check("and values survive the page restarting", await js(`localStorage.getItem("cf-test")`) === "two");

  print("THE PAGE");
  await js(`localStorage.setItem("carbonfibre-v1", JSON.stringify({ notes: [{ id: 1, title: "Kept", content: "# Kept" }], seq: 2 })); localStorage.setItem("carbonfibre-welcomed", "1"); true`);
  await wait(150);
  const rl3 = loaded(w);
  w.webContents.reload();
  await rl3;
  await wait(400);
  check("the page reads its data back from the database after a restart", await js(`state.notes.some(n => n.title === "Kept")`));
  check("the database file is sound", db.open().prepare("PRAGMA integrity_check").get().integrity_check === "ok");
  finish();
}

function print(s) { results.push({ name: s, section: true }); }
function finish() {
  if (ended) return;
  ended = true;
  let bad = 0, n = 0;
  for (const x of results) {
    if (x.section) { console.log(x.name); continue; }
    n++; if (!x.ok) bad++;
    console.log((x.ok ? "PASS  " : "FAIL  ") + x.name + (x.ok || !x.detail ? "" : "\n      " + x.detail));
  }
  console.log("\n" + (n - bad) + " of " + n + " passed");
  db.close();
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) { /* in use */ }
  app.exit(bad ? 1 : 0);
}
