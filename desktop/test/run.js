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
    try { await defsCheck(w); } catch (e) { check("1.13 settings run", false, e.stack); }
    try { await extrasCheck(w); } catch (e) { check("Obsidian extras run", false, e.stack); }
    try { await themeCheck(w); } catch (e) { check("themes run", false, e.stack); }
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
    req.on("end", () => {
      if (req.url === "/to-metadata") { res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }); res.end(); return; }
      if (req.url === "/to-local") { res.writeHead(302, { location: "/landed" }); res.end(); return; }
      res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ method: req.method, path: req.url, body, agent: req.headers["x-test"] || "" }));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + server.address().port;
  const code = "\"use strict\";\nvar obsidian = require(\"obsidian\");\nclass P extends obsidian.Plugin { onload() { window.cfNetFix = {" +
    " ru: (u) => obsidian.requestUrl({ url: u, method: \"POST\", body: \"hi\", headers: { \"x-test\": \"yes\" } }).json," +
    " f: (u) => fetch(u + \"/f\").then((r) => r.json())," +
    " x: (u) => new Promise((ok, bad) => { const q = new XMLHttpRequest(); q.open(\"PUT\", u + \"/x\"); q.setRequestHeader(\"x-test\", \"xhr\"); q.responseType = \"json\"; q.onload = () => ok(q.response); q.onerror = () => bad(new Error(\"xhr failed\")); q.send(\"yo\"); }) }; } }\nmodule.exports = P;\n";
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
    out.x = await window.cfNetFix.x(U).catch((e) => String(e.message));
    out.pageFetch = await err(fetch(U + "/page"));
    out.metadata = await err(window.cfNetFix.f("http://169.254.169.254"));
    out.viaRedirect = await err(cfDesktop.plugins.request("cf-netfix", { url: U + "/to-metadata" }));
    out.okRedirect = await cfDesktop.plugins.request("cf-netfix", { url: U + "/to-local" }).then((r) => JSON.parse(new TextDecoder().decode(r.body)).path, (e) => "ERR " + e.message);
    out.writeCode = await err(cfDesktop.plugins.fs("write", "cf-netfix", "main.js", "evil()"));
    out.writeOther = await err(cfDesktop.plugins.fs("write", "cf-netfix", "cache/notes.json", "{}"));
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
  check("internet: the plugin's XMLHttpRequest works", r.x && r.x.path === "/x" && r.x.method === "PUT" && r.x.body === "yo" && r.x.agent === "xhr", JSON.stringify(r.x));
  check("internet: the page's own fetch is still blocked", r.pageFetch !== "no error", r.pageFetch);
  check("internet: link-local addresses (cloud metadata) are refused", /Blocked address/.test(r.metadata), r.metadata);
  check("internet: ...also when a redirect points there", /Blocked address/.test(r.viaRedirect), r.viaRedirect);
  check("internet: ordinary redirects are still followed", r.okRedirect === "/landed", r.okRedirect);
  check("plugins can't rewrite plugin code from the page", /can't change main\.js/.test(r.writeCode), r.writeCode);
  check("...but can still write their own files", r.writeOther === "no error", r.writeOther);
  check("internet: Installed lists it with a way to take it away", /Can use the internet/.test(r.row) && /Take away/.test(r.row), r.row);
  check("internet: taking it away stops its requests", /isn't allowed|Failed to fetch/.test(r.after), r.after);
  server.close();
}

/* what popular plugins reach for beyond the documented API: old compiled classes, Obsidian's globals,
   registries, the file explorer, vault images, secrets */
async function extrasCheck(w) {
  const code = `"use strict";
var obsidian = require("obsidian");
var __extends = function (d, b) { function __() { this.constructor = d; } __.prototype = b.prototype; d.prototype = new __(); Object.setPrototypeOf(d, b); };
var M = (function (_super) { __extends(M, _super); function M(app) { var _this = _super.call(this, app) || this; _this.mine = 1; return _this; } return M; })(obsidian.Modal);
var P = (function (_super) {
  __extends(P, _super);
  function P() { var _this = _super !== null && _super.apply(this, arguments) || this; _this.es5 = true; return _this; }
  P.prototype.onload = function () {
    var m = new M(this.app);
    window.cfES5 = { ok: this.es5 === true, app: !!this.app, id: this.manifest.id, modal: m instanceof obsidian.Modal && m.mine === 1 && !!m.contentEl, plugin: this instanceof obsidian.Plugin };
    this.registerHoverLinkSource("cf-extras", { display: "Extras", defaultMod: true });
    this.registerExtensions(["cfx"], "cf-extras-view");
    this.registerCodeMirror(function () {});
  };
  return P;
})(obsidian.Plugin);
module.exports = P;
`;
  await store.place("cf-extras", { manifest: JSON.stringify({ id: "cf-extras", name: "Extras fixture", version: "1.0.0" }), main: code, styles: null });
  const r = await w.webContents.executeJavaScript(`(async () => {
    const out = {}, wait = (ms) => new Promise((x) => setTimeout(x, ms)), app = PluginApp.app;
    await PluginHost.enable("cf-extras");
    out.err = PluginHost.errors.get("cf-extras") || "";
    out.es5 = window.cfES5;
    out.hover = !!(app.workspace.hoverLinkSources && app.workspace.hoverLinkSources["cf-extras"]);
    out.ext = app.viewRegistry.getTypeByExtension("cfx");
    out.moment = [typeof window.moment.version, window.moment.locale(), window.moment.localeData().weekdays().length, window.moment("2026-11-14").format("dddd, Do MMMM YYYY")];
    out.buffer = [Buffer.from("hi").toString("base64"), Buffer.from("aGk=", "base64").toString(), Buffer.from("hi").toString("hex"), Buffer.concat([Buffer.from("a"), Buffer.from("b")]).toString()];
    out.i18n = window.i18next.t("x.y");
    out.cm = await (async () => { try { const st = PluginHost.require("@codemirror/state"), v = PluginHost.require("@codemirror/view"); const E = st.StateEffect.define(); class W extends v.WidgetType { toDOM() { return document.createElement("span"); } } return typeof E.of === "function" && typeof new W().toDOM === "function" && st.EditorState.create({ doc: "abc" }).doc.length === 3; } catch (e) { return String(e.message); } })();
    out.secret = (app.secretStorage.setSecret("cf-test-key", "s3"), app.secretStorage.getSecret("cf-test-key"));
    const dot = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,0,0,0,13,73,68,65,84,120,156,99,248,15,4,0,9,251,3,253,227,85,242,156,0,0,0,0,73,69,78,68,174,66,96,130]);
    await app.vault.adapter.writeBinary("dot.png", dot.buffer);
    out.url = app.vault.adapter.getResourcePath("dot.png");
    out.img = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i.naturalWidth); i.onerror = () => ok("error"); i.src = out.url; });
    out.outside = await new Promise((ok) => { const i = new Image(); i.onload = () => ok("loaded"); i.onerror = () => ok("refused"); i.src = "app://carbonfibre/vault/..%2Fplugins%2Fenabled.json.png"; });
    renderSidebar(); await wait(50);
    const ex = app.workspace.getLeavesOfType("file-explorer")[0];
    out.explorer = !!ex && ex.view.getViewType() === "file-explorer" && !!ex.view.fileItems["Alpha.md"] && ex.view.fileItems["Alpha.md"].titleEl instanceof HTMLElement;
    await PluginHost.disable("cf-extras");
    out.extGone = app.viewRegistry.getTypeByExtension("cfx") === undefined && !app.workspace.hoverLinkSources["cf-extras"];
    return out;
  })()`);
  check("old compiled (ES5) plugins load, and their subclasses of Obsidian classes work", !r.err && r.es5 && r.es5.ok && r.es5.app && r.es5.modal && r.es5.plugin, r.err + " " + JSON.stringify(r.es5));
  check("hover sources and file extensions register, and go away with the plugin", r.hover && r.ext === "cf-extras-view" && r.extGone, JSON.stringify([r.hover, r.ext, r.extGone]));
  check("the real moment.js, with locale data", r.moment[0] === "string" && r.moment[1] === "en" && r.moment[2] === 7 && r.moment[3] === "Saturday, 14th November 2026", JSON.stringify(r.moment));
  check("Buffer for plugins without Node.js", JSON.stringify(r.buffer) === JSON.stringify(["aGk=", "hi", "6869", "ab"]), JSON.stringify(r.buffer));
  check("i18next answers with the key", r.i18n === "x.y", r.i18n);
  check("the real CodeMirror 6 modules (plugins build editor extensions from them)", r.cm === true, String(r.cm));
  check("app.secretStorage keeps a secret", r.secret === "s3", r.secret);
  check("vault images show (getResourcePath)", /^app:\/\/carbonfibre\/vault\/dot\.png\?/.test(r.url) && r.img === 1, r.url + " " + r.img);
  check("...and nothing outside the notes folder is served", r.outside === "refused", r.outside);
  check("the file explorer is there for plugins, with its items", r.explorer);
}

/* Obsidian themes: CSS installed from files, Obsidian's classes on CarbonFibre's parts, Obsidian's
   variables reaching CarbonFibre's colours, and app.customCss for theme-settings plugins */
async function themeCheck(w) {
  const css = ".theme-dark { --color-base-00: rgb(10, 20, 30); --accent-h: 120; --accent-s: 50%; --accent-l: 40%; --h1-color: rgb(200, 10, 10); } " +
    ".theme-light { --color-base-00: rgb(250, 240, 230); } body { --font-text-theme: Georgia, serif; } .nav-file-title.is-active { outline: 3px solid rgb(1, 2, 3); }";
  const r = await w.webContents.executeJavaScript(`(async () => {
    const out = {}, wait = (ms) => new Promise((x) => setTimeout(x, ms)), d = cfDesktop.plugins.themes;
    setTheme("dark");
    const plain = getComputedStyle(document.body).backgroundColor;
    await d.importFiles("Fixture Theme", ${JSON.stringify(css)}, JSON.stringify({ name: "Fixture Theme", version: "1.2.3", author: "Someone" }));
    out.listed = (await d.list()).map((t) => t.name + "@" + t.manifest.version);
    setTheme("dark");
    renderSidebar(); await wait(50);
    out.classes = ["#workarea.workspace", "#side.mod-left-split", ".side-item.nav-file", ".side-item-row.nav-file-title", ".pane-col.workspace-leaf", ".tab.workspace-tab-header", "#activity.workspace-ribbon", "body.theme-dark"]
      .filter((s) => !document.querySelector(s));
    await ThemeHost.use("Fixture Theme");
    await wait(100);
    const cs = (s, p) => getComputedStyle(document.querySelector(s))[p];
    out.bg = cs("body", "backgroundColor");
    out.acc = getComputedStyle(document.body).getPropertyValue("--acc").trim();
    out.h1 = document.querySelector(".ln-h1") ? cs(".ln-h1", "color") : "no heading";
    out.font = cs(".editor", "fontFamily");
    out.activeRow = document.querySelector(".side-item.on .nav-file-title") ? getComputedStyle(document.querySelector(".side-item.on .nav-file-title")).outlineColor : "none on";
    out.custom = [PluginApp.app.customCss.theme, Object.keys(PluginApp.app.customCss.themes).join(","), PluginApp.app.vault.getConfig("cssTheme")];
    setTheme("light"); await wait(50);
    out.light = cs("body", "backgroundColor");
    setTheme("dark");
    PluginManager.open("themes"); await wait(50);
    out.tab = (document.querySelector('.cfp-row[data-theme-name="Fixture Theme"]') || {}).textContent || "";
    PluginManager.close();
    await ThemeHost.use(null); await wait(50);
    out.off = [document.body.classList.contains("cf-obs-theme"), !!document.getElementById("cfObsidianTheme"), getComputedStyle(document.body).backgroundColor === plain];
    await d.uninstall("Fixture Theme");
    out.gone = (await d.list()).length;
    return out;
  })()`);
  check("themes: a theme's files install and list", JSON.stringify(r.listed) === JSON.stringify(["Fixture Theme@1.2.3"]), JSON.stringify(r.listed));
  check("themes: Obsidian's class names are on CarbonFibre's parts", !r.classes.length, "missing: " + r.classes.join(" "));
  check("themes: the theme's base colours reach CarbonFibre (background, accent, headings)", r.bg === "rgb(10, 20, 30)" && /hsl\(120|rgb\(51, 153, 51\)/.test(r.acc) && r.h1 === "rgb(200, 10, 10)", JSON.stringify([r.bg, r.acc, r.h1]));
  check("themes: its fonts too", /Georgia/.test(r.font), r.font);
  check("themes: its rules for Obsidian's classes apply (active note in the list)", r.activeRow === "rgb(1, 2, 3)", r.activeRow);
  check("themes: light and dark follow the moon/sun button", r.light === "rgb(250, 240, 230)", r.light);
  check("themes: app.customCss and the vault config name the theme in use", r.custom[0] === "Fixture Theme" && r.custom[1] === "Fixture Theme" && r.custom[2] === "Fixture Theme", JSON.stringify(r.custom));
  check("themes: the Themes tab lists it as in use", /Fixture Theme/.test(r.tab) && /In use/.test(r.tab), r.tab);
  check("themes: CarbonFibre's own look comes back", r.off.every((x, i) => i < 2 ? !x : x), JSON.stringify(r.off));
  check("themes: removing a theme deletes it", r.gone === 0, String(r.gone));
}

/* settings pages described with getSettingDefinitions (Obsidian 1.13+): groups, controls bound to a key,
   visible/disabled predicates, and sub-pages */
async function defsCheck(w) {
  const code = `"use strict";
var obsidian = require("obsidian");
class Tab extends obsidian.PluginSettingTab {
  getSettingDefinitions() { return [
    { name: "Intro", desc: "About", render: (s) => s.addButton((b) => b.setButtonText("Go")) },
    { type: "group", heading: "Look", items: [
      { name: "Fancy", control: { type: "toggle", key: "fancy" } },
      { name: "Scheme", control: { type: "dropdown", key: "scheme", options: { a: "A", b: "B" } }, visible: () => this.plugin.settings.fancy },
      { name: "Size", control: { type: "slider", key: "size", min: 1, max: 9, step: 1, displayFormat: (n) => n + " px" } },
      { name: "Label", control: { type: "text", key: "label", validate: (v) => v.length > 5 ? "Too long" : "" } } ] },
    { type: "page", name: "More", items: [{ name: "Deep", control: { type: "toggle", key: "deep" } }] } ]; }
}
class P extends obsidian.Plugin { async onload() { this.settings = Object.assign({ fancy: false, scheme: "a", size: 3, label: "hi", deep: false }, await this.loadData()); this.addSettingTab(new Tab(this.app, this)); } }
module.exports = P;
`;
  await store.place("cf-defs", { manifest: JSON.stringify({ id: "cf-defs", name: "Defs fixture", version: "1.0.0" }), main: code, styles: null });
  const r = await w.webContents.executeJavaScript(`(async () => {
    const wait = (ms) => new Promise((x) => setTimeout(x, ms));
    await PluginHost.enable("cf-defs");
    PluginManager.open("installed"); PluginManager.openSettings("cf-defs"); await wait(150);
    const box = () => document.querySelector(".cfp-settings");
    const out = { heads: [...box().querySelectorAll(".setting-group > .setting-item-heading")].map((e) => e.textContent),
      names: [...box().querySelectorAll(".setting-item-name")].map((e) => e.textContent),
      schemeHidden: [...box().querySelectorAll(".setting-item")].find((e) => e.textContent.includes("Scheme")).hidden,
      slider: (box().querySelector(".cfp-slider-value") || {}).textContent };
    const tog = box().querySelector(".checkbox-container"); tog.click(); await wait(200);
    out.schemeShown = ![...box().querySelectorAll(".setting-item")].find((e) => e.textContent.includes("Scheme")).hidden;
    const text = box().querySelector(".setting-item-control input[type=text]"); text.value = "far too long"; text.dispatchEvent(new Event("input")); await wait(200);
    out.invalid = (box().querySelector(".cfp-err:not([hidden])") || {}).textContent;
    out.saved = JSON.parse(await cfDesktop.plugins.loadData("cf-defs"));
    [...box().querySelectorAll("button")].find((b) => b.textContent === "Open").click(); await wait(100);
    out.page = [...box().querySelectorAll(".setting-item-name")].map((e) => e.textContent);
    PluginManager.close(); await PluginHost.disable("cf-defs");
    return out;
  })()`);
  check("1.13 settings: groups and items render", JSON.stringify(r.heads) === JSON.stringify(["Look"]) && ["Intro", "Fancy", "Scheme", "Size", "Label", "More"].every((n) => r.names.includes(n)), JSON.stringify(r.names));
  check("1.13 settings: visible predicates hide, and update after a change", r.schemeHidden === true && r.schemeShown === true);
  check("1.13 settings: slider shows its formatted value", r.slider === "3 px", r.slider);
  check("1.13 settings: changes save through setControlValue", r.saved && r.saved.fancy === true, JSON.stringify(r.saved));
  check("1.13 settings: validate rejects without saving", r.invalid === "Too long" && r.saved.label === "hi", r.invalid);
  check("1.13 settings: a sub-page opens with its own items", r.page.includes("Deep"), JSON.stringify(r.page));
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
