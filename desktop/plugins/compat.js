/* Decides, from a plugin's code alone, how well an Obsidian plugin will run in CarbonFibre.
   Nothing is executed: the code is only read. The answer is one of
     "ok"       uses only what CarbonFibre provides
     "partial"  loads and runs, but some features are missing (listed in `notes`)
     "no"       it can't run at all (no code)
   and `net: true` when it uses the internet through what the page provides (request, requestUrl, a plain
   fetch(), XMLHttpRequest): it then asks for internet access when switched on; `node: true` when it uses
   Node.js or Electron: it then asks for Node.js (as every plugin has in Obsidian). Neither lowers the level.
   A static read can't be sure: desktop/test/live.js runs the most popular plugins for real.
   The lists below must match what the page provides (carbonfibre-src/src/js/plugins/);
   desktop/test/run.js (npm test) checks that every SUPPORTED name exists there. Bump VERSION whenever a rule changes, so cached answers are redone. */
"use strict";

const VERSION = 10;

/* names exported by the "obsidian" module that the page provides and that work */
const SUPPORTED = [
  "AbstractInputSuggest", "AbstractTextComponent", "addIcon", "apiVersion", "App", "arrayBufferToBase64", "arrayBufferToHex",
  "base64ToArrayBuffer", "BaseComponent", "ButtonComponent", "ColorComponent", "Component", "debounce", "displayTooltip",
  "DropdownComponent", "EditableFileView", "Editor", "EditorSuggest", "Events", "ExtraButtonComponent", "FileManager", "FileView",
  "FuzzySuggestModal", "fuzzySearch", "getAllTags", "getBlobArrayBuffer", "getFrontMatterInfo", "getIcon", "getIconIds", "getLanguage",
  "getLinkpath", "htmlToMarkdown", "ItemView", "iterateCacheRefs", "iterateRefs", "Keymap", "MarkdownRenderChild", "MarkdownRenderer",
  "MarkdownView", "Menu", "MenuItem", "MenuSeparator", "MetadataCache", "Modal", "moment", "MomentFormatComponent", "normalizePath",
  "Notice", "parseFrontMatterAliases", "parseFrontMatterEntry", "parseFrontMatterStringArray", "parseFrontMatterTags", "parseLinktext",
  "parseYaml", "Platform", "Plugin", "PluginSettingTab", "PopoverSuggest", "prepareFuzzySearch", "prepareQuery", "prepareSimpleSearch",
  "ProgressBarComponent", "removeIcon", "renderMatches", "renderResults", "requireApiVersion", "resolveSubpath", "sanitizeHTMLToDom",
  "Scope", "SearchComponent", "setIcon", "Setting", "SettingTab", "setTooltip", "SliderComponent", "sortSearchResults", "stringifyYaml",
  "stripHeading", "stripHeadingForLink", "SuggestModal", "TAbstractFile", "TextAreaComponent", "TextComponent", "TextFileView", "TFile",
  "TFolder", "ToggleComponent", "ValueComponent", "Vault", "View", "Workspace", "WorkspaceContainer", "WorkspaceFloating", "WorkspaceItem",
  "WorkspaceLeaf", "WorkspaceMobileDrawer", "WorkspaceParent", "WorkspaceRibbon", "WorkspaceRoot", "WorkspaceSidedock", "WorkspaceSplit",
  "WorkspaceTabs", "WorkspaceWindow", "MarkdownPreviewRenderer", "MarkdownPreviewView", "MarkdownEditView", "MarkdownSourceView",
  "HoverPopover", "Tasks", "SettingGroup"
];
/* provided so the plugin loads, but they do nothing useful here */
const PARTIAL = {
  CapacitorAdapter: "Mobile-only parts are switched off",
  loadMathJax: "Math (LaTeX) rendering isn't available",
  renderMath: "Math (LaTeX) rendering isn't available",
  finishRenderMath: "Math (LaTeX) rendering isn't available",
  loadMermaid: "Obsidian's Mermaid renderer isn't available",
  loadPdfJs: "PDF viewing isn't available",
  loadPrism: "Obsidian's code highlighter isn't available",
  editorInfoField: "Obsidian editor internals (CodeMirror) aren't available",
  editorEditorField: "Obsidian editor internals (CodeMirror) aren't available",
  editorViewField: "Obsidian editor internals (CodeMirror) aren't available",
  editorLivePreviewField: "Obsidian editor internals (CodeMirror) aren't available",
  livePreviewState: "Obsidian editor internals (CodeMirror) aren't available"
};
/* the internet, through the app: allowed per plugin, when the person says yes */
const NET = ["request", "requestUrl"];
const BLOCKED = {};
/* every name the real "obsidian" module exports that matters here; anything else seen after
   `obsidian.` in a bundle is not an Obsidian API name and is ignored */
const KNOWN = new Set(SUPPORTED.concat(Object.keys(PARTIAL), NET, Object.keys(BLOCKED)));

/* Node.js modules: the page has a small "path" and "events"; the rest don't exist */
const NODE_SHIMMED = new Set(["path", "events", "util", "url", "assert", "querystring", "tty", "buffer", "node:path", "node:events", "node:util", "node:url", "node:assert", "node:querystring", "node:tty", "node:buffer"]);
const NODE = new Set(["fs", "fs/promises", "os", "crypto", "child_process", "electron", "http", "https", "net", "tls", "dgram", "dns",
  "url", "stream", "util", "buffer", "zlib", "worker_threads", "cluster", "readline", "tty", "assert", "querystring", "string_decoder",
  "process", "v8", "vm", "module", "perf_hooks", "timers", "constants", "http2", "inspector", "async_hooks", "stream/promises",
  "original-fs", "@electron/remote"]);

function uniq(a) { return Array.from(new Set(a)); }

/* the names a bundle takes from require("obsidian"), however the bundler spelled it */
function obsidianNames(code) {
  const names = new Set();
  const vars = new Set(["obsidian"]);
  let m;
  /* var x = require("obsidian") / __toESM(require("obsidian")): look back from each require
     (a forward regex over [\w$]+ is far too slow on bundles holding megabytes of base64) */
  const reqRe = /require\(\s*["']obsidian["']\s*\)/g;
  const backs = [];
  while ((m = reqRe.exec(code))) backs.push(code.slice(Math.max(0, m.index - 3000), m.index));
  backs.forEach(function (before) {
    const v = /([A-Za-z_$][\w$]{0,80})\s*=\s*(?:\(0,\s*)?(?:[\w$]{1,40}\()?\s*$/.exec(before.slice(-200));
    if (v) vars.add(v[1]);
    const d = /\{([^{}]*)\}\s*=\s*$/.exec(before);
    if (d) d[1].split(",").forEach(function (part) {
      const n = part.split(":")[0].trim();
      if (KNOWN.has(n)) names.add(n);
    });
  });
  const wp = code.match(/obsidian__WEBPACK_IMPORTED_MODULE_\d+__(?:_default)?/g);
  if (wp) wp.forEach(function (v) { vars.add(v); });
  vars.forEach(function (v) {
    const re = new RegExp("(?:^|[^\\w$.])" + v.replace(/\$/g, "\\$") + "(?:_\\d+)?\\.([A-Za-z_$][\\w$]*)", "g");
    let k;
    while ((k = re.exec(code))) if (KNOWN.has(k[1])) names.add(k[1]);
  });
  return names;
}

function requiredModules(code) {
  const out = new Set();
  const re = /\brequire\(\s*["']([^"']+)["']\s*\)/g;
  let m;
  while ((m = re.exec(code))) out.add(m[1]);
  return out;
}

function count(code, re) { const m = code.match(re); return m ? m.length : 0; }

/* code: the plugin's main.js; manifest: its manifest.json (parsed); info: catalog entry (name, description) */
function analyze(code, manifest, info) {
  code = String(code || "");
  manifest = manifest || {};
  info = info || {};
  const reasons = [], notes = [];
  if (!code.trim()) return { version: VERSION, level: "no", reasons: ["The plugin has no code (main.js is missing or empty)"], notes: [] };
  const text = [manifest.name, manifest.description, info.name, info.description].filter(Boolean).join(" ");

  /* Obsidian API names */
  const names = obsidianNames(code);
  let net = false;
  names.forEach(function (n) {
    if (NET.indexOf(n) !== -1) net = true;
    else if (BLOCKED[n]) reasons.push(BLOCKED[n]);
    else if (PARTIAL[n]) notes.push(PARTIAL[n]);
  });

  /* Node.js and Electron: offered per plugin, when you allow it (the app asks) */
  const mods = requiredModules(code);
  const node = [];
  mods.forEach(function (mod) {
    const base = mod.replace(/^node:/, "");
    if (NODE_SHIMMED.has(mod)) return;
    if (NODE.has(base) || NODE.has(mod)) node.push(base);
  });
  if (/\b(?:window|globalThis|self)\.require\s*\(/.test(code)) node.push("require");
  const usesNode = node.length > 0;
  if (usesNode) notes.push("Uses Node.js (" + uniq(node).slice(0, 6).join(", ") + "): asks for it when you switch it on; without it, those parts are off");
  if (names.has("FileSystemAdapter") && !usesNode) notes.push("Paths on disk need Node.js access, which this plugin doesn't ask for");

  /* fetch(), XMLHttpRequest: each plugin's own, through its internet permission. Sockets aren't offered (Node.js has its own) */
  if (count(code, /(?:^|[^\w$.])fetch\s*\(|new\s+XMLHttpRequest\b/g)) net = true;
  if (count(code, /\b(?:window|globalThis|self)\.fetch\s*\(/g)) { net = true; notes.push("Calls window.fetch, which only works through its internet permission when called as fetch()"); }
  if (count(code, /new\s+WebSocket\b|new\s+EventSource\b/g) && !usesNode) notes.push("Live connections (WebSocket, EventSource) aren't offered to plugins");

  /* CodeMirror: Obsidian's editor. CarbonFibre has its own editor, so editor extensions don't run */
  const cm = Array.from(mods).filter(function (m2) { return /^@codemirror\/|^@lezer\//.test(m2); });
  const editorExt = /\.registerEditorExtension\s*\(/.test(code);
  if (cm.length || editorExt) {
    const hooks = count(code, /\.(addCommand|addRibbonIcon|registerView|registerMarkdownCodeBlockProcessor|registerMarkdownPostProcessor|addStatusBarItem|registerEditorSuggest)\s*\(/g);
    const big = count(code, /\.addCommand\s*\(/g) >= 3 || /\.registerView\s*\(|\.registerMarkdownCodeBlockProcessor\s*\(|\.registerMarkdownPostProcessor\s*\(/.test(code);
    if (editorExt && !big && hooks < 2) notes.push("Works by changing Obsidian's editor (CodeMirror), which CarbonFibre doesn't use yet: it loads but does little");
    else if (editorExt) notes.push("Its editor decorations (CodeMirror extensions) don't show; commands, views and rendering work");
    else notes.push("Some editor-specific parts (CodeMirror) are inactive");
  }

  /* private Obsidian internals */
  const internals = [];
  if (/\.cm\.(dispatch|state|dom|contentDOM|scrollDOM|posAtCoords|coordsAtPos|focus|plugin)\b|editor\.cm\b|\.cm\s*instanceof/.test(code)) internals.push("the editor's internals");
  if (/\.internalPlugins\b/.test(code)) internals.push("core plugins");
  if (/\.viewRegistry\b|\.embedRegistry\b/.test(code)) internals.push("view registry");
  if (/\.customCss\b/.test(code)) internals.push("themes and snippets");
  if (/\bmonkey-around\b|\baround\s*\(\s*[\w$.]+\.prototype/.test(code)) internals.push("patching Obsidian's classes");
  if (internals.length) notes.push("Uses private Obsidian internals (" + uniq(internals).join(", ") + "); those parts may not work");

  /* settings for an Obsidian theme (Minimal, AnuPpuccin, ...): they style that theme's CSS, which only applies once that theme is installed (Plugins, Themes) */
  if (/\btheme\b/i.test(text) && /\b(body|document\.body)\.(addClass|toggleClass|classList)\b|\bcustomCss\b/.test(code)) notes.push("Made for an Obsidian theme: install that theme in Plugins, Themes, and its settings apply to the colours and fonts it controls");
  if (/\.registerObsidianProtocolHandler\s*\(/.test(code)) notes.push("obsidian:// links aren't handled");
  if (/\.registerExtensions\s*\(/.test(code)) notes.push("Opening non-Markdown file types isn't supported");
  if (/\.registerBasesView\s*\(|\.BasesView\b/.test(code)) notes.push("Obsidian Bases views aren't available");

  const level = reasons.length ? "no" : notes.length ? "partial" : "ok";
  return { version: VERSION, level: level, reasons: uniq(reasons), notes: uniq(notes), net: (net || usesNode) && level !== "no", node: usesNode };
}

module.exports = { VERSION, SUPPORTED, PARTIAL, NET, BLOCKED, analyze };
