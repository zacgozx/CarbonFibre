/* Live plugin run (not part of npm test): installs each plugin from a survey folder for real,
   switches it on, opens its settings, runs its commands' checks, and records what broke.
   electron test/live.js <survey p folder> <out.json> [from] [count]
   Internet questions are answered "Don't allow"; nothing leaves this machine.
   CF_LIVE_NODE=1: the window runs with Node.js and every plugin is allowed it (as in Obsidian). */
"use strict";
const { app, BrowserWindow, dialog } = require("electron");
const path = require("node:path"), fs = require("node:fs"), os = require("node:os");
const ud = fs.mkdtempSync(path.join(os.tmpdir(), "cf-live-"));
app.setPath("userData", ud);
process.env.CARBONFIBRE_NO_UPDATES = "1";
dialog.showMessageBox = async () => ({ response: 1 });
dialog.showMessageBoxSync = () => 1;
const NODE = process.env.CF_LIVE_NODE === "1";
if (NODE) {
  fs.mkdirSync(path.join(ud, "plugins", "cf-live-dummy"), { recursive: true });
  fs.writeFileSync(path.join(ud, "plugins", "enabled.json"), JSON.stringify(["cf-live-dummy"]));
  fs.writeFileSync(path.join(ud, "plugins", "node.json"), JSON.stringify({ grants: { "cf-live-dummy": true } }));
}
require("../main.js");
const store = require("../plugins/store.js");
const compat = require("../plugins/compat.js");

const [SRC, OUT, FROM, COUNT] = process.argv.slice(process.argv.findIndex((a) => /live\.js$/.test(a)) + 1).filter((a) => !a.startsWith("--"));
const files = fs.readdirSync(SRC).filter((f) => f.endsWith(".json")).sort().slice(+FROM || 0, (+FROM || 0) + (+COUNT || 1e9));
const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const timeout = (p, ms, what) => Promise.race([p, wait(ms).then(() => { throw new Error("timeout: " + what); })]);

let win = null, current = null, logs = [];
app.on("browser-window-created", (_e, w) => {
  if (win) return;
  win = w;
  w.webContents.on("console-message", (e) => {
    const lvl = e.level, msg = e.message;
    if (current && (lvl === "error" || lvl === 3 || lvl === "warning" || lvl === 2)) logs.push(String(msg).slice(0, 900));
  });
  w.webContents.on("render-process-gone", (_e, d) => { if (current) logs.push("RENDERER GONE " + d.reason); });
  w.webContents.once("did-finish-load", () => run().catch((e) => { console.log("crashed", e.stack); app.exit(1); }));
});

const SETUP = `(async () => {
  if (!window.__live) {
    window.__live = { missing: new Set(), unknown: new Set() };
    const miss = PluginNode.missing;
    PluginNode.missing = function (n) { window.__live.missing.add(n); return miss(n); };
    const ce = console.error.bind(console);
    console.error = function () { ce(Array.from(arguments).map(a => a instanceof Error ? (a.stack || a.message) : typeof a === "object" ? (() => { try { return JSON.stringify(a); } catch (e) { return String(a); } })() : String(a)).join(" ")); };
    window.addEventListener("error", (e) => console.error("PAGEERROR " + ((e.error && e.error.stack) || e.message)));
    window.addEventListener("unhandledrejection", (e) => console.error("REJECTION " + ((e.reason && (e.reason.stack || e.reason.message)) || e.reason)));
    if (!PluginApp.app.vault.getFileByPath("Alpha.md")) {
      await PluginApp.app.vault.create("Alpha.md", "---\\ntags: [demo]\\ndate: 2026-11-14\\n---\\n# Alpha\\n\\nSee [[Beta]] #tag\\n\\n- [ ] a task 📅 2026-11-20\\n\\n\`\`\`dataview\\nlist\\n\`\`\`\\n\\n![[pic.png]]\\n");
      await PluginApp.app.vault.create("Beta.md", "---\\naliases: [B]\\n---\\nBack to [[Alpha]]\\n\\n| a | b |\\n|---|---|\\n| 1 | 2 |\\n");
    }
    const alpha = state.notes.find(n => n.title === "Alpha");
    if (alpha) openInPane(alpha.id, panes[0]);
  }
  return true;
})()`;

const TRY = (id) => `(async () => {
  const id = ${JSON.stringify(id)}, L = window.__live, r = { };
  const seen0 = new Set(PluginUnknown.seen), miss0 = new Set(L.missing);
  const t0 = performance.now();
  try { await Promise.race([PluginHost.enable(id), new Promise((_, j) => setTimeout(() => j(new Error("load timeout")), 8000))]); r.loaded = PluginHost.instances.has(id); }
  catch (e) { r.loaded = false; r.loadError = String((e && e.message) || e).slice(0, 300); r.loadStack = String((e && e.stack) || "").slice(0, 700); }
  r.ms = Math.round(performance.now() - t0);
  await new Promise(res => setTimeout(res, 1200));
  const inst = PluginHost.instances.get(id);
  r.alive = !!inst;
  if (inst) {
    r.commands = [...PluginHost.commands.keys()].filter(k => k.startsWith(id + ":")).length;
    let bad = 0;
    PluginHost.commands.forEach((c, k) => { if (!k.startsWith(id + ":")) return; try { PluginHost.runCommand(c.cmd, true); } catch (e) { bad++; console.error("COMMANDCHECK " + k + ": " + e.message); } });
    r.commandCheckErrors = bad;
    try { PluginManager.open("installed"); PluginManager.openSettings(id); await new Promise(res => setTimeout(res, 500));
      const box = document.querySelector(".cfp-settings");
      r.settingsItems = box ? box.querySelectorAll(".setting-item").length : -1;
      r.settingsText = box ? box.textContent.trim().length : 0;
    } catch (e) { r.settingsError = String(e.message || e).slice(0, 300); }
    try { PluginManager.close(); } catch (e) {}
  }
  r.hostError = PluginHost.errors.get(id) || "";
  r.unknown = [...PluginUnknown.seen].filter(n => !seen0.has(n));
  r.missing = [...L.missing].filter(n => !miss0.has(n));
  try { await PluginHost.disable(id); } catch (e) { r.disableError = String(e.message || e).slice(0, 200); }
  return r;
})()`;

async function run() {
  await wait(1500);
  await win.webContents.executeJavaScript(SETUP);
  let n = 0;
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(path.join(SRC, f), "utf8"));
    let man = {};
    try { man = JSON.parse(d.man || "{}"); } catch (e) { /* bad manifest */ }
    const id = String(man.id || f.replace(/\.json$/, "")).replace(/[^\w.-]/g, "-");
    if (out[id] && !process.argv.includes("--redo")) continue;
    const rec = { id, name: d.info && d.info.name, static: compat.analyze(d.code || "", man, d.info).level };
    current = id; logs = [];
    try {
      if (NODE) await store.setNode(id, true);
      await store.place(id, { manifest: JSON.stringify(Object.assign({}, man, { id })), main: d.code || "", styles: d.styles || null });
      await timeout(win.webContents.executeJavaScript(`PluginHost.installed = null; cfDesktopPlugins().list().then(l => { PluginHost.installed = l; return true; })`), 5000, "list");
      Object.assign(rec, await timeout(win.webContents.executeJavaScript(TRY(id)), 20000, "plugin run"));
    } catch (e) { rec.harnessError = String(e.message || e).slice(0, 300); }
    current = null;
    rec.logs = [...new Set(logs)].slice(0, 25);
    try { await store.uninstall(id); } catch (e) { /* already gone */ }
    out[id] = rec;
    fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
    console.log((++n) + "/" + files.length, id, rec.loaded ? "loaded" : "FAILED", rec.loadError || rec.harnessError || "", "logs:" + rec.logs.length);
    if (rec.harnessError || n % 20 === 0 || rec.logs.some((l) => /RENDERER GONE/.test(l))) {
      win.webContents.reload();
      await new Promise((r) => win.webContents.once("did-finish-load", r));
      await wait(1500);
      await win.webContents.executeJavaScript(SETUP).catch(() => {});
    }
  }
  app.exit(0);
}
