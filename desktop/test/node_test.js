/* Node.js for plugins, per plugin (like Obsidian, but only for plugins you allow): the window starts
   sandboxed; switching on a plugin that uses Node.js asks in the app's dialog; allowing reopens the
   window with Node.js; that plugin gets fs, os, process and Buffer, and another plugin that wasn't
   allowed still doesn't. Run with Electron: electron test/node_test.js (npm test runs it too). */
"use strict";
const { app, dialog } = require("electron");
const path = require("node:path"), fs = require("node:fs"), os = require("node:os");
const ud = fs.mkdtempSync(path.join(os.tmpdir(), "cf-node-"));
app.setPath("userData", ud);
process.env.CARBONFIBRE_NO_UPDATES = "1";
const asked = [];
dialog.showMessageBox = async (_w, o) => { asked.push((o || _w || {}).message || ""); return { response: 0 }; };   /* Allow */
require("../main.js");
const store = require("../plugins/store.js");

const results = [];
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const marker = path.join(ud, "written-by-plugin.txt");
const windows = [];
const loaded = (w) => new Promise((r) => w.webContents.once("did-finish-load", r));

app.on("browser-window-created", (_e, w) => {
  windows.push({ w, ready: loaded(w) });
  if (windows.length === 1) run().catch((e) => { check("test run", false, e.stack); finish(); });
});

async function run() {
  const first = windows[0];
  await first.ready;
  await wait(800);
  const nodeCode = `"use strict";
const obsidian = require("obsidian"), fs = require("fs"), os = require("os"), path = require("path");
module.exports = class extends obsidian.Plugin {
  onload() {
    fs.writeFileSync(${JSON.stringify(marker)}, "hello from " + os.platform());
    const back = fs.readFileSync(${JSON.stringify(marker)});
    window.cfNodeFix = { node: process.versions.node || "", buffer: Buffer.isBuffer(back), text: back.toString("utf8"), join: path.join("a", "b"),
      desktopApp: obsidian.Platform.isDesktopApp, adapter: this.app.vault.adapter instanceof obsidian.FileSystemAdapter };
  }
};`;
  const plainCode = `"use strict";
const obsidian = require("obsidian"), fs = require("fs");
module.exports = class extends obsidian.Plugin {
  onload() { let r; try { fs.readFileSync("/etc/hostname"); r = "read it"; } catch (e) { r = e.message; } window.cfNoNode = r; }
};`;
  const placed = await store.place("cf-nodefix", { manifest: JSON.stringify({ id: "cf-nodefix", name: "Node fixture", version: "1.0.0", isDesktopOnly: true }), main: nodeCode, styles: null });
  await store.place("cf-nonode", { manifest: JSON.stringify({ id: "cf-nonode", name: "No-node fixture", version: "1.0.0" }), main: plainCode, styles: null });
  await store.setNode("cf-nonode", false);
  check("a plugin using fs is rated as asking for Node.js, not as unable to run", placed.compat.node === true && placed.compat.level !== "no", JSON.stringify(placed.compat));

  const before = await first.w.webContents.executeJavaScript(`(async () => {
    const out = { node: !!(window.cfDesktop && window.cfDesktop.node), process: typeof process, require: typeof require };
    PluginHost.enable("cf-nodefix");                 /* asks; Allow reopens the window */
    return out;
  })()`);
  check("the window starts without Node.js", !before.node && before.process === "undefined" && before.require === "undefined", JSON.stringify(before));

  for (let i = 0; i < 100 && windows.length < 2; i++) await wait(100);
  check("switching it on asks in the app's dialog", asked.some((m) => /Node fixture.*Node\.js/.test(m)), JSON.stringify(asked));
  check("allowing it reopens the window", windows.length === 2 && first.w.isDestroyed(), "windows: " + windows.length);
  if (windows.length < 2) { finish(); return; }
  const second = windows[1];
  await second.ready;
  let r = null;
  for (let i = 0; i < 80; i++) {
    r = await second.w.webContents.executeJavaScript(`({ on: PluginHost.instances.has("cf-nodefix"), fix: window.cfNodeFix || null, err: PluginHost.errors.get("cf-nodefix") || "" })`);
    if (r.on || r.err) break;
    await wait(100);
  }
  check("after reopening, the plugin is on", r.on, JSON.stringify(r));
  check("it has Node.js: fs writes and reads a real file, os, path, process", fs.existsSync(marker) && /^hello from /.test(fs.readFileSync(marker, "utf8")) && r.fix && r.fix.node && r.fix.text === fs.readFileSync(marker, "utf8") && r.fix.join === path.join("a", "b"), JSON.stringify(r.fix));
  check("...and Node's Buffer, Platform.isDesktopApp, FileSystemAdapter", r.fix && r.fix.buffer && r.fix.desktopApp && r.fix.adapter, JSON.stringify(r.fix));

  const after = await second.w.webContents.executeJavaScript(`(async () => {
    const out = {};
    await PluginHost.enable("cf-nonode");
    out.noNode = window.cfNoNode;
    out.appFiles = (() => { try { window.cfDesktop.node.require("../main.js"); return "loaded"; } catch (e) { return e.message; } })();
    out.frozen = (() => { try { window.cfDesktop = null; } catch (e) {} return !!window.cfDesktop; })();
    PluginManager.open("installed");
    out.row = (document.querySelector('.cfp-row[data-id="cf-nodefix"] .cfp-node') || {}).textContent || "";
    PluginManager.close();
    await cfDesktop.plugins.revokeNode("cf-nodefix");
    await PluginHost.disable("cf-nodefix");
    window.cfNodeFix = null;
    const errs = [], ce = console.error;
    console.error = function () { errs.push(Array.from(arguments).map(String).join(" ")); ce.apply(console, arguments); };
    await PluginHost.enable("cf-nodefix");
    console.error = ce;
    out.revoked = window.cfNodeFix === null && errs.some((m) => /isn't available to this plugin/.test(m));
    out.errs = errs.join(" | ").slice(0, 300);
    return out;
  })()`);
  check("a plugin that wasn't allowed Node.js still doesn't get it", /isn't available to this plugin/.test(after.noNode), after.noNode);
  check("only Node's own modules: not the app's files", /Not a Node\.js module/.test(after.appFiles), after.appFiles);
  check("the page can't swap out the app's bridge", after.frozen);
  check("Installed shows it can use Node.js, with a way to take it away", /Can use Node\.js/.test(after.row) && /Take away/.test(after.row), after.row);
  check("taken away: next start it has no Node.js", after.revoked, after.errs);
  finish();
}

function finish() {
  let bad = 0;
  for (const x of results) { if (!x.ok) bad++; console.log((x.ok ? "PASS  " : "FAIL  ") + x.name + (x.ok || !x.detail ? "" : "\n      " + x.detail)); }
  console.log("\n" + (results.length - bad) + " of " + results.length + " passed");
  app.exit(bad ? 1 : 0);
}
