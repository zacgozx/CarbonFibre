/* Desktop tests: npm test (builds the page first). Opens the app with a throwaway data folder,
   installs fixture-plugin/, and checks the plugin API end to end; then opens the page without the
   desktop bridge, as the website runs, and checks plugins stay off there. The only network used is a
   small server on this machine, for the per-plugin internet permission. */
"use strict";
const { app, BrowserWindow, dialog } = require("electron");
const path = require("node:path"), fs = require("node:fs"), os = require("node:os");
const ud = fs.mkdtempSync(path.join(os.tmpdir(), "cf-test-"));
app.setPath("userData", ud);
let answers = [];                                     /* the app's dialogs: answered from here, Allow (0) when empty */
const asked = [];
dialog.showMessageBox = async (_w, o) => { asked.push((o || _w || {}).message || ""); return { response: answers.length ? answers.shift() : 0 }; };
require("../main.js");
const store = require("../plugins/store.js");
const compat = require("../plugins/compat.js");

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };
let first = true;

app.on("browser-window-created", (_e, w) => {
  if (!first) return;
  first = false;
  w.webContents.once("did-finish-load", async () => {
    try {
      const dir = path.join(__dirname, "fixture-plugin");
      const placed = await store.place("cf-fixture", { manifest: fs.readFileSync(path.join(dir, "manifest.json"), "utf8"), main: fs.readFileSync(path.join(dir, "main.js"), "utf8"), styles: null });
      check("fixture is rated as working", placed.compat.level === "ok", JSON.stringify(placed.compat));
      const r = await w.webContents.executeJavaScript(`(async () => {
        const out = {};
        const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]').content;
        out.cspPlugins = csp.includes("app://carbonfibre/plugin-code/") && csp.includes("connect-src 'none'");
        out.supported = ${JSON.stringify(compat.SUPPORTED)}.filter(n => !(n in PluginApi.build()));
        const m = PluginApi.build();
        out.moment = [m.moment("2026-11-14").format("YYYY-MM-DD dddd [w]ww WW Do MMM"), m.moment("14/11/2026", "DD/MM/YYYY", true).format("YYYY-MM-DD"),
          m.moment("2026-01-31").add(1, "month").format("YYYY-MM-DD"), m.moment("2026-11-14").startOf("isoWeek").format("YYYY-MM-DD"),
          m.moment("2026-11-14").diff(m.moment("2026-11-01"), "days"), m.moment("2027-01-01").format("gggg-[W]ww"), m.moment("2026-12-31").format("GGGG-[W]WW")];
        out.yaml = m.parseYaml("title: Hello\\ntags:\\n  - a\\n  - b\\nn: 3\\nok: true\\nnested:\\n  k: v\\nlist: [x, 'y z']\\n");
        out.yamlBack = m.stringifyYaml({ title: "Hi: there", tags: ["a", "b"], n: 3, empty: null });
        await PluginApp.app.vault.create("Alpha.md", "# Alpha\\n\\nSee [[Beta]] #tag\\n\\n\`\`\`fixture\\nhello\\n\`\`\`\\n");
        await PluginApp.app.vault.create("Beta.md", "---\\naliases: [B]\\ntags: demo\\n---\\nBack to [[Alpha]]\\n");
        await PluginHost.enable("cf-fixture");
        const f = window.cfFixture;
        out.loaded = !!f && PluginHost.instances.has("cf-fixture");
        out.error = PluginHost.errors.get("cf-fixture") || "";
        out.layoutReady = !!(f && f.layoutReady) || PluginApp.app.workspace.layoutReady;
        out.ribbon = !!document.querySelector('#activity .cfp-ribbon[aria-label="Fixture ribbon"]');
        document.querySelector('#activity .cfp-ribbon[aria-label="Fixture ribbon"]').click();
        out.ribbonClicked = !!f.ribbonClicked;
        out.status = [...document.querySelectorAll("#statusbar .status-bar-item")].some(e => e.textContent === "fixture status");
        const alpha = state.notes.find(n => n.title === "Alpha");
        openInPane(alpha.id, panes[0]);
        for (let i = 0; i < 50 && !document.querySelector(".fixture-block"); i++) await new Promise(r => setTimeout(r, 100));   /* up to 5 s: CI machines are slow */
        out.block = (document.querySelector(".fixture-block") || {}).textContent || "";
        out.palette = palCommands().map(c => c.label).filter(l => l.startsWith("CarbonFibre test plugin:"));
        const ed = PluginApp.app.workspace.activeEditor.editor;
        ed.setCursor(0, 7);
        PluginApp.app.commands.executeCommandById("cf-fixture:insert-greeting");
        out.afterCommand = ed.getLine(0);
        ed.replaceRange("!", { line: 0, ch: ed.getLine(0).length });
        out.afterReplace = (await PluginApp.app.vault.read(PluginApp.app.vault.getFileByPath("Alpha.md"))).split("\\n")[0];
        const cache = PluginApp.app.metadataCache.getFileCache(PluginApp.app.vault.getFileByPath("Beta.md"));
        out.cache = { fm: cache.frontmatter, links: (cache.links || []).map(l => l.link) };
        out.tags = m.getAllTags(PluginApp.app.metadataCache.getFileCache(PluginApp.app.vault.getFileByPath("Alpha.md")));
        out.resolved = PluginApp.app.metadataCache.resolvedLinks["Alpha.md"];
        out.dest = (PluginApp.app.metadataCache.getFirstLinkpathDest("beta", "Alpha.md") || {}).path;
        await PluginApp.app.fileManager.processFrontMatter(PluginApp.app.vault.getFileByPath("Beta.md"), fm => { fm.status = "done"; });
        out.frontmatter = state.notes.find(n => n.title === "Beta").content.split("\\n").slice(0, 5).join("|");
        const leaf = PluginApp.app.workspace.getRightLeaf(false);
        await leaf.setViewState({ type: "cf-fixture-view", active: true });
        out.view = !!document.querySelector(".cfp-dock:not([hidden]) .fixture-view-text");
        PluginManager.open("installed");
        out.managerRow = !!document.querySelector('.cfp-row[data-id="cf-fixture"] input[data-cfpact="toggle"]:checked');
        PluginManager.openSettings("cf-fixture");
        out.settings = [...document.querySelectorAll(".cfp-settings .setting-item-name")].map(e => e.textContent);
        PluginManager.close();
        await new Promise(r => setTimeout(r, 500));
        out.events = f.events.slice();
        await PluginHost.disable("cf-fixture");
        await new Promise(r => setTimeout(r, 100));
        out.off = { onunload: !!window.cfFixtureUnloaded, ribbon: !document.querySelector("#activity .cfp-ribbon"), dock: !document.querySelector(".cfp-dock:not([hidden])"),
          block: !document.querySelector(".fixture-block"), status: ![...document.querySelectorAll("#statusbar .status-bar-item")].some(e => e.textContent === "fixture status"),
          commands: !palCommands().some(c => c.label.startsWith("CarbonFibre test plugin:")) };
        out.saved = await cfDesktop.plugins.loadData("cf-fixture");
        return out;
      })()`);
      check("page widens the script lock for plugin code only, network still blocked", r.cspPlugins);
      check("every name compat.js calls supported exists in the obsidian module", r.supported.length === 0, r.supported.join(", "));
      check("moment formats, parses and does date maths", JSON.stringify(r.moment) === JSON.stringify(["2026-11-14 Saturday w46 46 14th Nov", "2026-11-14", "2026-02-28", "2026-11-09", 13, "2027-W01", "2026-W53"]), JSON.stringify(r.moment));
      check("YAML parses front matter", JSON.stringify(r.yaml) === JSON.stringify({ title: "Hello", tags: ["a", "b"], n: 3, ok: true, nested: { k: "v" }, list: ["x", "y z"] }), JSON.stringify(r.yaml));
      check("YAML writes front matter", r.yamlBack === 'title: "Hi: there"\ntags:\n  - a\n  - b\nn: 3\nempty:\n', JSON.stringify(r.yamlBack));
      check("plugin loads and starts", r.loaded, r.error);
      check("onLayoutReady fires", r.layoutReady);
      check("ribbon button appears and runs", r.ribbon && r.ribbonClicked);
      check("status bar item appears", r.status);
      check("code block processor renders", r.block === "rendered: hello", r.block);
      check("commands show in the palette", r.palette.length === 2, JSON.stringify(r.palette));
      check("editor command inserts at the cursor", r.afterCommand === "# Alphahi", r.afterCommand);
      check("editor.replaceRange edits the note", r.afterReplace === "# Alphahi!", r.afterReplace);
      check("metadata cache reads front matter and links", JSON.stringify(r.cache) === JSON.stringify({ fm: { aliases: ["B"], tags: "demo" }, links: ["Alpha"] }), JSON.stringify(r.cache));
      check("getAllTags", JSON.stringify(r.tags) === JSON.stringify(["#tag"]), JSON.stringify(r.tags));
      check("resolvedLinks", JSON.stringify(r.resolved) === JSON.stringify({ "Beta.md": 1 }), JSON.stringify(r.resolved));
      check("getFirstLinkpathDest", r.dest === "Beta.md", r.dest);
      check("processFrontMatter writes the note", r.frontmatter === "---|aliases:|  - B|tags: demo|status: done", r.frontmatter);
      check("plugin view opens in the side panel", r.view);
      check("Plugins window lists it switched on", r.managerRow);
      check("plugin settings page renders", JSON.stringify(r.settings) === JSON.stringify(["Greeting", "Loud"]), JSON.stringify(r.settings));
      check("vault and workspace events reach the plugin", r.events.includes("open:Alpha.md") && r.events.includes("modify:Alpha.md"), JSON.stringify(r.events));
      check("turning it off removes everything it added", Object.values(r.off).every(Boolean), JSON.stringify(r.off));
    } catch (e) { check("desktop run", false, e.stack); }
    try { await netCheck(w); } catch (e) { check("internet run", false, e.stack); }
    webCheck();
  });
});

/* the internet, per plugin: asked when switched on, only the app's dialog grants it, the page can take it
   away, requests go through the main process, and the page itself still can't reach the network */
async function netCheck(w) {
  const http = require("node:http");
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ method: req.method, path: req.url, body, agent: req.headers["x-test"] || "" })); });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + server.address().port;
  const code = "\"use strict\";\nvar obsidian = require(\"obsidian\");\nclass P extends obsidian.Plugin { onload() { window.cfNetFix = {" +
    " ru: (u) => obsidian.requestUrl({ url: u, method: \"POST\", body: \"hi\", headers: { \"x-test\": \"yes\" } }).json," +
    " f: (u) => fetch(u + \"/f\").then((r) => r.json()) }; } }\nmodule.exports = P;\n";
  const placed = await store.place("cf-netfix", { manifest: JSON.stringify({ id: "cf-netfix", name: "Net fixture", version: "1.0.0" }), main: code, styles: null });
  check("internet: a plugin using requestUrl and fetch is rated working, marked as using the internet", placed.compat.level === "ok" && placed.compat.net === true, JSON.stringify(placed.compat));
  asked.length = 0;
  answers = [0];                                         /* Allow */
  const r = await w.webContents.executeJavaScript(`(async () => {
    const out = {}, U = ${JSON.stringify(url)};
    const err = (p) => p.then(() => "no error", (e) => String(e.message || e));
    out.before = await err(cfDesktop.plugins.request("cf-netfix", { url: U }));
    out.pageNoGrant = typeof cfDesktop.plugins.setNetwork === "undefined";
    await PluginHost.enable("cf-netfix");
    out.listed = (await cfDesktop.plugins.list()).find(p => p.id === "cf-netfix").network;
    out.ru = await window.cfNetFix.ru(U + "/ru");
    out.f = await window.cfNetFix.f(U);
    out.pageFetch = await err(fetch(U + "/page"));
    PluginManager.open("installed");
    out.row = (document.querySelector('.cfp-row[data-id="cf-netfix"] .cfp-net') || {}).textContent || "";
    PluginManager.close();
    await cfDesktop.plugins.revokeNetwork("cf-netfix");
    out.after = await err(window.cfNetFix.f(U));
    await PluginHost.disable("cf-netfix");
    return out;
  })()`);
  check("internet: refused before it's allowed", /isn't allowed/.test(r.before), r.before);
  check("internet: the page has no way to grant it", r.pageNoGrant);
  check("internet: switching it on asks once, in the app's dialog", asked.length === 1 && /Net fixture/.test(asked[0]) && r.listed === true, JSON.stringify(asked) + " " + r.listed);
  check("internet: requestUrl sends method, body and headers, and reads JSON", r.ru && r.ru.method === "POST" && r.ru.body === "hi" && r.ru.agent === "yes" && r.ru.path === "/ru", JSON.stringify(r.ru));
  check("internet: the plugin's fetch() works", r.f && r.f.path === "/f", JSON.stringify(r.f));
  check("internet: the page's own fetch is still blocked", r.pageFetch !== "no error", r.pageFetch);
  check("internet: Installed lists it with a way to take it away", /Can use the internet/.test(r.row) && /Take away/.test(r.row), r.row);
  check("internet: taking it away stops its requests", /isn't allowed|Failed to fetch/.test(r.after), r.after);
  server.close();
}

/* the page as the website runs it: no desktop bridge, so plugins must stay off and greyed out */
function webCheck() {
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
  const errors = [];
  w.webContents.on("console-message", (e) => { const lv = e.level !== undefined ? e.level : e; if (lv === "error" || lv === 3) errors.push(e.message); });
  w.webContents.once("did-finish-load", async () => {
    try {
      const r = await w.webContents.executeJavaScript(`(async () => {
        await new Promise(r => setTimeout(r, 300));
        const before = typeof HTMLElement.prototype.createEl;
        PluginManager.open("browse");
        return { running: PluginHost.running, button: !!document.getElementById("actPlugins"), greyed: !!document.querySelector(".cfp-win.cfp-web .cfp-greyed"),
          lede: document.querySelector(".cfp-lede").textContent, protoUntouched: before === "undefined", palette: palCommands().filter(c => c.label.startsWith("Plugins:")).length };
      })()`);
      check("web: plugins never start", r.running === false);
      check("web: Plugins button is there and the window is greyed out with the reason", r.button && r.greyed && /desktop app/.test(r.lede), r.lede);
      check("web: element prototypes untouched", r.protoUntouched);
      check("web: no errors on load", errors.length === 0, errors.join(" | "));
    } catch (e) { check("web run", false, e.stack); }
    finish();
  });
  w.loadFile(path.join(__dirname, "..", "page", "index.html"));
}

function finish() {
  let bad = 0;
  for (const r of results) { if (!r.ok) bad++; console.log((r.ok ? "PASS  " : "FAIL  ") + r.name + (r.ok || !r.detail ? "" : "\n      " + r.detail)); }
  console.log("\n" + (results.length - bad) + " of " + results.length + " passed");
  fs.rmSync(ud, { recursive: true, force: true });
  app.exit(bad ? 1 : 0);
}
