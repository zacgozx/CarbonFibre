/* ============================================================
   Obsidian plugins 4/5: the host. Loads each enabled plugin's code (served by the desktop app from
   app://carbonfibre/plugin-code/), hands it the "obsidian" module built here, and connects what
   plugins register (commands, ribbon buttons, status bar items, code block renderers, post
   processors, editor suggestions, views) to CarbonFibre. Every hook into CarbonFibre's own code
   checks PluginHost.running first, so with no plugins nothing changes.
   ============================================================ */

/* stands in for CodeMirror's modules: any property or call gives back itself, so plugins that
   build editor extensions still load; the extensions themselves never run */
const PluginStub = (function () {
  const proto = Object.create(null);
  let proxy = null;
  const target = function () {};
  proxy = new Proxy(target, {
    get: function (t, k) {
      if (k === Symbol.toPrimitive) return function () { return ""; };
      if (k === Symbol.hasInstance) return function () { return false; };
      if (k === Symbol.iterator) return function* () { /* empty */ };
      if (k === "then" || k === "toJSON" || k === "__esModule") return undefined;
      if (k === "prototype") return proto;
      if (k === "toString" || k === "valueOf") return function () { return ""; };
      return proxy;
    },
    apply: function () { return proxy; },
    construct: function () { return proxy; },
    set: function () { return true; }
  });
  return proxy;
})();

/* Node's "path" and "events", small versions; enough for the plugins that only need these */
const PluginNode = {
  path: {
    sep: "/", delimiter: ":",
    normalize: function (p) { const abs = String(p)[0] === "/", out = []; String(p).split("/").forEach(function (s) { if (s === "..") out.pop(); else if (s && s !== ".") out.push(s); }); return (abs ? "/" : "") + out.join("/"); },
    join: function () { return PluginNode.path.normalize(Array.prototype.slice.call(arguments).filter(function (s) { return s !== ""; }).join("/")) || "."; },
    resolve: function () { return PluginNode.path.join.apply(null, arguments); },
    basename: function (p, ext) { const b = String(p).replace(/\/+$/, "").split("/").pop(); return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b; },
    dirname: function (p) { const i = String(p).replace(/\/+$/, "").lastIndexOf("/"); return i <= 0 ? (String(p)[0] === "/" ? "/" : ".") : String(p).slice(0, i); },
    extname: function (p) { const m = /(\.[^./]+)$/.exec(String(p)); return m ? m[1] : ""; },
    isAbsolute: function (p) { return String(p)[0] === "/"; },
    relative: function (a, b) { return String(b).replace(String(a).replace(/\/?$/, "/"), ""); },
    parse: function (p) { const base = PluginNode.path.basename(p), ext = PluginNode.path.extname(p); return { root: String(p)[0] === "/" ? "/" : "", dir: PluginNode.path.dirname(p), base: base, ext: ext, name: ext ? base.slice(0, -ext.length) : base }; },
    format: function (o) { return (o.dir ? o.dir + "/" : "") + (o.base || (o.name || "") + (o.ext || "")); }
  },
  events: null
};
class PluginEmitter {
  constructor() { this._l = {}; }
  on(n, f) { (this._l[n] = this._l[n] || []).push(f); return this; }
  addListener(n, f) { return this.on(n, f); }
  once(n, f) { const w = function () { this.off(n, w); f.apply(this, arguments); }.bind(this); return this.on(n, w); }
  off(n, f) { this._l[n] = (this._l[n] || []).filter(function (x) { return x !== f; }); return this; }
  removeListener(n, f) { return this.off(n, f); }
  removeAllListeners(n) { if (n) delete this._l[n]; else this._l = {}; return this; }
  emit(n) { const a = Array.prototype.slice.call(arguments, 1), l = (this._l[n] || []).slice(); l.forEach(function (f) { f.apply(this, a); }, this); return l.length > 0; }
  listenerCount(n) { return (this._l[n] || []).length; }
  setMaxListeners() { return this; }
}
PluginNode.events = PluginEmitter;
PluginNode.util = {
  promisify: function (fn) { return function () { const a = Array.prototype.slice.call(arguments), self = this; return new Promise(function (res, rej) { fn.apply(self, a.concat(function (e, v) { if (e) rej(e); else res(v); })); }); }; },
  inspect: function (v) { try { return typeof v === "string" ? v : JSON.stringify(v); } catch (e) { return String(v); } },
  format: function (f) { const a = Array.prototype.slice.call(arguments, 1); let i = 0; return String(f).replace(/%[sdifjoO%]/g, function (m) { if (m === "%%") return "%"; const v = a[i++]; return m === "%j" ? JSON.stringify(v) : String(v); }) + (i < a.length ? " " + a.slice(i).join(" ") : ""); },
  inherits: function (c, p) { c.super_ = p; Object.setPrototypeOf(c.prototype, p.prototype); },
  deprecate: function (fn) { return fn; },
  debuglog: function () { return function () {}; },
  isDeepStrictEqual: function (a, b) { try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return a === b; } },
  TextEncoder: window.TextEncoder, TextDecoder: window.TextDecoder,
  types: { isDate: function (v) { return v instanceof Date; }, isRegExp: function (v) { return v instanceof RegExp; }, isPromise: function (v) { return v instanceof Promise; } },
  isArray: Array.isArray, isString: function (v) { return typeof v === "string"; }, isFunction: function (v) { return typeof v === "function"; }
};
PluginNode.url = { URL: window.URL, URLSearchParams: window.URLSearchParams,
  parse: function (u) { try { const x = new URL(u); return { href: x.href, protocol: x.protocol, host: x.host, hostname: x.hostname, port: x.port, pathname: x.pathname, search: x.search, query: x.search.slice(1), hash: x.hash }; } catch (e) { return { href: u, pathname: u }; } },
  format: function (o) { return typeof o === "string" ? o : o.href || ""; },
  fileURLToPath: function (u) { return decodeURIComponent(String(u).replace(/^file:\/\//, "")); }, pathToFileURL: function (p) { return new URL("file://" + encodeURI(p)); } };
PluginNode.assert = Object.assign(function (v, m) { if (!v) throw new Error(m || "Assertion failed"); }, {
  ok: function (v, m) { if (!v) throw new Error(m || "Assertion failed"); }, equal: function (a, b, m) { if (a != b) throw new Error(m || "Assertion failed"); }, // eslint-disable-line eqeqeq -- Node's loose equal
  strictEqual: function (a, b, m) { if (a !== b) throw new Error(m || "Assertion failed"); }, deepEqual: function () {}, deepStrictEqual: function () {}, notEqual: function () {}, fail: function (m) { throw new Error(m || "Failed"); } });
PluginNode.querystring = {
  parse: function (s) { const o = {}; new URLSearchParams(String(s || "")).forEach(function (v, k) { o[k] = v; }); return o; },
  stringify: function (o) { return new URLSearchParams(o || {}).toString(); }, escape: encodeURIComponent, unescape: decodeURIComponent };
PluginNode.os = { EOL: "\n", platform: function () { return (window.cfDesktop && window.cfDesktop.platform) || "browser"; }, homedir: function () { return ""; }, tmpdir: function () { return ""; },
  hostname: function () { return "carbonfibre"; }, type: function () { return ""; }, arch: function () { return ""; }, release: function () { return ""; }, cpus: function () { return []; } };
PluginNode.tty = { isatty: function () { return false; } };
/* any other Node or Electron module: loads, but using it throws, so plugins that only need it for
   optional desktop features still start */
PluginNode.missing = function (name) {
  const fail = function () { throw new Error('"' + name + '" isn\'t available to plugins in CarbonFibre (no Node.js or Electron)'); };
  let p = null;
  p = new Proxy(function () {}, {
    get: function (t, k) {
      if (k === Symbol.toPrimitive) return function () { return ""; };
      if (k === "then" || k === "__esModule" || typeof k === "symbol") return undefined;
      if (k === "default") return p;
      return p;
    },
    apply: fail, construct: fail, set: function () { return true; }
  });
  return p;
};
PluginEmitter.EventEmitter = PluginEmitter;
PluginEmitter.default = PluginEmitter;

/* ---- the Plugin base class ---- */
class PluginPlugin extends PluginComponent {
  constructor(app, manifest) { super(); this.app = app; this.manifest = manifest; this.leaves = new Set(); }
  addCommand(cmd) { return PluginHost.addCommand(this, cmd); }
  removeCommand(id) { PluginHost.commands.delete(this.manifest.id + ":" + id); }
  addRibbonIcon(icon, title, cb) {
    const b = document.createElement("button");
    b.className = "act-btn side-dock-ribbon-action cfp-ribbon";
    pluginTooltip(b, title);
    b.innerHTML = PluginIcons.svg(icon, 22);
    b.addEventListener("click", function (e) { try { cb(e); } catch (er) { console.error(er); } });
    const bar = document.getElementById("activity"), spacer = bar && bar.querySelector(".act-spacer");
    if (bar) bar.insertBefore(b, spacer);
    this.register(function () { b.remove(); });
    return b;
  }
  addStatusBarItem() {
    const el = document.createElement("div");
    el.className = "status-bar-item sb-item plugin-" + String(this.manifest.id).replace(/[^\w-]/g, "-");
    const right = document.querySelector("#statusbar .sb-right");
    if (right) right.insertBefore(el, right.firstChild);
    this.register(function () { el.remove(); });
    return el;
  }
  addSettingTab(tab) {
    const id = this.manifest.id;
    PluginHost.settingTabs.set(id, tab);
    this.register(function () { if (PluginHost.settingTabs.get(id) === tab) PluginHost.settingTabs.delete(id); });
  }
  loadData() {
    return cfDesktopPlugins().loadData(this.manifest.id).then(function (t) {
      if (!t) return null;
      try { return JSON.parse(t); } catch (e) { console.warn("CarbonFibre: settings of " + this.manifest.id + " aren't valid JSON", e); return null; }
    }.bind(this));
  }
  saveData(data) { return cfDesktopPlugins().saveData(this.manifest.id, JSON.stringify(data === undefined ? null : data, null, 2)); }
  registerView(type, creator) {
    PluginHost.views[type] = { plugin: this, creator: creator };
    this.register(function () {
      PluginDock.leaves.slice().forEach(function (l) { if (l.view && l.view.getViewType() === type) l.detach(); });
      delete PluginHost.views[type];
    });
  }
  registerExtensions() {}
  registerBasesView() { return false; }
  registerHoverLinkSource() {}
  registerEditorExtension() {}
  registerObsidianProtocolHandler() {}
  registerMarkdownPostProcessor(fn, sortOrder) {
    const e = { fn: fn, sortOrder: sortOrder || 0, plugin: this };
    PluginHost.post.push(e);
    PluginHost.post.sort(function (a, b) { return a.sortOrder - b.sortOrder; });
    this.register(function () { const i = PluginHost.post.indexOf(e); if (i !== -1) PluginHost.post.splice(i, 1); PluginHost.rerenderSoon(); });
    PluginHost.rerenderSoon();
    return fn;
  }
  registerMarkdownCodeBlockProcessor(lang, handler, sortOrder) {
    const key = String(lang).toLowerCase(), e = { fn: handler, plugin: this, sortOrder: sortOrder || 0 };
    PluginHost.blocks.set(key, e);
    this.register(function () { if (PluginHost.blocks.get(key) === e) PluginHost.blocks.delete(key); PluginHost.rerenderSoon(); });
    PluginHost.rerenderSoon();
    return handler;
  }
  registerEditorSuggest(s) {
    PluginHost.suggests.push(s);
    this.register(function () { const i = PluginHost.suggests.indexOf(s); if (i !== -1) PluginHost.suggests.splice(i, 1); s.close(); });
  }
  onUserEnable() {}
  onExternalSettingsChange() {}
}

class PluginEditorSuggest extends PluginPopoverSuggest {
  constructor(app) {
    super(app);
    this.context = null;
    this.limit = 100;
    this.instructionsEl = document.createElement("div");
    this.instructionsEl.className = "prompt-instructions";
    this.suggestEl.appendChild(this.instructionsEl);
  }
  setInstructions(list) {
    this.instructionsEl.textContent = "";
    (list || []).forEach(function (ins) {
      const d = document.createElement("div"); d.className = "prompt-instruction";
      d.innerHTML = '<span class="prompt-instruction-command"></span><span></span>';
      d.firstChild.textContent = ins.command; d.lastChild.textContent = ins.purpose;
      this.instructionsEl.appendChild(d);
    }, this);
  }
  close() { super.close(); this.context = null; }
  onTrigger() { return null; }
  getSuggestions() { return []; }
}

class PluginMarkdownRenderChild extends PluginComponent {
  constructor(containerEl) { super(); this.containerEl = containerEl; }
}
class PluginMarkdownRenderer extends PluginMarkdownRenderChild {
  static render(app, markdown, el, sourcePath, component) { return PluginHost.renderMarkdown(markdown, el, sourcePath, component); }
  static renderMarkdown(markdown, el, sourcePath, component) { return PluginHost.renderMarkdown(markdown, el, sourcePath, component); }
}
class PluginMarkdownPreviewRenderer {
  static registerPostProcessor(fn, sortOrder) { PluginHost.post.push({ fn: fn, sortOrder: sortOrder || 0, plugin: null }); PluginHost.rerenderSoon(); }
  static unregisterPostProcessor(fn) { PluginHost.post = PluginHost.post.filter(function (e) { return e.fn !== fn; }); PluginHost.rerenderSoon(); }
  static registerDomEvents() {}
  static createCodeBlockPostProcessor() { return function () {}; }
}
class PluginHoverPopover extends PluginComponent {
  constructor(parent, targetEl) { super(); this.targetEl = targetEl; this.hoverEl = document.createElement("div"); this.hoverEl.className = "popover hover-popover"; this.state = 0; }
  hide() { this.hoverEl.remove(); }
}
class PluginNoAdapter {}
/* newer Obsidian: a modal with a message and buttons */
class PluginConfirmationModal extends PluginModal {
  constructor(app) { super(app); this.buttonContainerEl = document.createElement("div"); this.buttonContainerEl.className = "modal-button-container"; this.modalEl.appendChild(this.buttonContainerEl); }
  addButton(cls, text, cb) {
    const b = document.createElement("button");
    if (cls) b.className = cls;
    b.textContent = text;
    b.addEventListener("click", function (e) { if (cb) cb(e); this.close(); }.bind(this));
    this.buttonContainerEl.appendChild(b);
    return this;
  }
  addCancelButton(cb) { return this.addButton("", "Cancel", cb); }
}
/* any other Obsidian class a plugin extends: an empty component, so the plugin still loads */
const PluginUnknown = { classes: {}, seen: new Set() };

/* ---- the "obsidian" module ---- */
const PluginApi = {
  apiVersion: "1.8.10",
  getAllTags(cache) {
    if (!cache) return null;
    const out = (PluginText.tagsFrom(cache.frontmatter) || []).concat((cache.tags || []).map(function (t) { return t.tag; }));
    return out.length ? out : null;
  },
  resolveSubpath(cache, subpath) {
    if (!cache || !subpath) return null;
    const s = String(subpath).replace(/^#/, "");
    if (s[0] === "^") {
      const b = cache.blocks && cache.blocks[s.slice(1).toLowerCase()];
      return b ? { type: "block", block: b, start: b.position.start, end: b.position.end } : null;
    }
    const parts = s.split("#").map(function (x) { return PluginText.stripHeading(x).toLowerCase(); }), hs = cache.headings || [];
    let k = -1, from = 0;
    parts.forEach(function (part) {
      for (let i = from; i < hs.length; i++) if (PluginText.stripHeading(hs[i].heading).toLowerCase() === part) { k = i; from = i + 1; return; }
      k = -2;
    });
    if (k < 0) return null;
    const cur = hs[k], next = hs.slice(k + 1).find(function (h) { return h.level <= cur.level; }) || null;
    return { type: "heading", current: cur, next: next, start: cur.position.start, end: next ? next.position.start : null };
  },
  iterateRefs(refs, cb) { return (refs || []).some(function (r) { return cb(r) === true; }); },
  iterateCacheRefs(cache, cb) {
    if (!cache) return false;
    return PluginApi.iterateRefs(cache.links, cb) || PluginApi.iterateRefs(cache.embeds, cb) || PluginApi.iterateRefs(cache.frontmatterLinks, cb);
  },
  module: null,
  build() {
    if (PluginApi.module) return PluginApi.module;
    const mac = PluginKeymap.mac, platform = (window.cfDesktop && window.cfDesktop.platform) || "";
    /* request and requestUrl here are for code that doesn't come from a plugin; plugins get their own (PluginNet) */
    const offline = function () { return Promise.reject(new Error("Only plugins can use the internet, and only once you allow it")); };
    const m = {
      ConfirmationModal: PluginConfirmationModal, SettingPage: PluginSettingTab,
      Plugin: PluginPlugin, Component: PluginComponent, Events: PluginEvents, Notice: PluginNotice, Modal: PluginModal,
      SuggestModal: PluginSuggestModal, FuzzySuggestModal: PluginFuzzySuggestModal, PopoverSuggest: PluginPopoverSuggest,
      AbstractInputSuggest: PluginAbstractInputSuggest, EditorSuggest: PluginEditorSuggest, Menu: PluginMenu, MenuItem: PluginMenuItem,
      MenuSeparator: PluginMenuSeparator, Setting: PluginSetting, SettingGroup: PluginSettingGroup, PluginSettingTab: PluginSettingTab, SettingTab: PluginSettingTab,
      BaseComponent: PluginBaseComponent, ValueComponent: PluginValueComponent, AbstractTextComponent: PluginAbstractTextComponent,
      TextComponent: PluginTextComponent, TextAreaComponent: PluginTextAreaComponent, SearchComponent: PluginSearchComponent,
      MomentFormatComponent: PluginMomentFormatComponent, ToggleComponent: PluginToggleComponent, DropdownComponent: PluginDropdownComponent,
      SliderComponent: PluginSliderComponent, ButtonComponent: PluginButtonComponent, ExtraButtonComponent: PluginExtraButtonComponent,
      ColorComponent: PluginColorComponent, ProgressBarComponent: PluginProgressBarComponent,
      setIcon: function (el, id) { PluginIcons.set(el, id); }, addIcon: function (id, svg) { PluginIcons.custom[id] = String(svg); },
      removeIcon: function (id) { delete PluginIcons.custom[id]; }, getIcon: PluginIcons.get, getIconIds: PluginIcons.ids,
      setTooltip: pluginTooltip, displayTooltip: pluginTooltip,
      normalizePath: PluginText.normalizePath, debounce: PluginText.debounce, moment: PluginTime.moment,
      parseYaml: function (s) { return PluginYaml.parse(s); }, stringifyYaml: function (o) { return PluginYaml.stringify(o); },
      getAllTags: PluginApi.getAllTags, parseFrontMatterTags: PluginText.tagsFrom, parseFrontMatterAliases: PluginText.aliasesFrom,
      parseFrontMatterEntry: PluginText.entry, parseFrontMatterStringArray: PluginText.stringArray, getFrontMatterInfo: PluginText.frontMatterInfo,
      parseLinktext: PluginText.parseLinktext, getLinkpath: function (t) { return PluginText.parseLinktext(t).path; },
      stripHeading: PluginText.stripHeading, stripHeadingForLink: PluginText.stripHeadingForLink, htmlToMarkdown: PluginText.htmlToMarkdown,
      sanitizeHTMLToDom: PluginText.sanitize, arrayBufferToBase64: PluginText.b64, base64ToArrayBuffer: PluginText.unb64, arrayBufferToHex: PluginText.hex,
      getBlobArrayBuffer: function (b) { return b.arrayBuffer(); },
      prepareFuzzySearch: PluginSearch.fuzzy, prepareSimpleSearch: PluginSearch.simple,
      prepareQuery: function (q) { return { query: String(q || ""), tokens: String(q || "").split(/\s+/).filter(Boolean), fuzzy: String(q || "").toLowerCase().split("") }; },
      fuzzySearch: function (q, text) { return PluginSearch.fuzzy(q && q.query !== undefined ? q.query : q)(text); },
      renderMatches: PluginSearch.renderMatches,
      renderResults: function (el, text, result, offset) { PluginSearch.renderMatches(el, text, result && result.matches, offset); },
      sortSearchResults: function (list) { list.sort(function (a, b) { return ((b.match || b).score || 0) - ((a.match || a).score || 0); }); },
      Keymap: PluginKeymap, Scope: PluginScope, Platform: {
        isDesktop: true, isMobile: false, isDesktopApp: false, isMobileApp: false, isIosApp: false, isAndroidApp: false, isPhone: false, isTablet: false,
        isMacOS: mac || platform === "darwin", isWin: platform === "win32", isLinux: platform === "linux", isSafari: false, resourcePathPrefix: "app://local/" },
      TAbstractFile: PluginTAbstractFile, TFile: PluginTFile, TFolder: PluginTFolder, Vault: PluginVault, MetadataCache: PluginMetadataCache,
      Workspace: PluginWorkspace, WorkspaceLeaf: PluginWorkspaceLeaf, WorkspaceItem: PluginWorkspaceItem, WorkspaceParent: PluginWorkspaceParent,
      WorkspaceSplit: PluginWorkspaceSplit, WorkspaceTabs: PluginWorkspaceTabs, WorkspaceRoot: PluginWorkspaceRoot, WorkspaceSidedock: PluginWorkspaceSidedock,
      WorkspaceContainer: PluginWorkspaceContainer, WorkspaceWindow: PluginWorkspaceWindow, WorkspaceFloating: PluginWorkspaceFloating,
      WorkspaceRibbon: PluginWorkspaceRibbon, WorkspaceMobileDrawer: PluginWorkspaceMobileDrawer,
      View: PluginView, ItemView: PluginItemView, FileView: PluginFileView, EditableFileView: PluginEditableFileView, TextFileView: PluginTextFileView,
      MarkdownView: PluginMarkdownView, MarkdownRenderer: PluginMarkdownRenderer, MarkdownRenderChild: PluginMarkdownRenderChild,
      MarkdownPreviewRenderer: PluginMarkdownPreviewRenderer, MarkdownPreviewView: class {}, MarkdownEditView: class {}, MarkdownSourceView: class {},
      HoverPopover: PluginHoverPopover, Editor: PluginEditor, App: Object, FileManager: PluginFileManager, Tasks: class {},
      apiVersion: PluginApi.apiVersion,
      requireApiVersion: function (v) {
        const a = String(v).split(".").map(Number), b = PluginApi.apiVersion.split(".").map(Number);
        for (let i = 0; i < 3; i++) { if ((b[i] || 0) > (a[i] || 0)) return true; if ((b[i] || 0) < (a[i] || 0)) return false; }
        return true;
      },
      resolveSubpath: PluginApi.resolveSubpath, iterateCacheRefs: PluginApi.iterateCacheRefs, iterateRefs: PluginApi.iterateRefs,
      getLanguage: function () { return "en"; },
      FileSystemAdapter: PluginNoAdapter, CapacitorAdapter: class {},
      loadMathJax: function () { return Promise.resolve(); }, finishRenderMath: function () { return Promise.resolve(); },
      renderMath: function (src, display) { const el = document.createElement(display ? "div" : "span"); el.className = "math"; el.textContent = src; return el; },
      loadMermaid: function () { return Promise.reject(new Error("Mermaid isn't available to plugins in CarbonFibre")); },
      loadPdfJs: function () { return Promise.reject(new Error("PDF viewing isn't available in CarbonFibre")); },
      loadPrism: function () { return Promise.resolve({ languages: {}, highlightElement: function () {}, highlight: function (s) { return esc(String(s)); } }); },
      request: offline, requestUrl: function () { const p = offline(); p.json = p; p.text = p; p.arrayBuffer = p; return p; },
      editorInfoField: PluginStub, editorEditorField: PluginStub, editorViewField: PluginStub, editorLivePreviewField: PluginStub, livePreviewState: PluginStub
    };
    PluginApi.module = new Proxy(m, {
      get: function (t, k) {
        if (k in t || typeof k !== "string") return t[k];
        PluginUnknown.seen.add(k);
        if (!/^[A-Z]/.test(k)) return undefined;
        if (!PluginUnknown.classes[k]) PluginUnknown.classes[k] = class extends PluginComponent { constructor(app) { super(); this.app = app; } };
        return PluginUnknown.classes[k];
      }
    });
    return PluginApi.module;
  }
};

/* ---- the internet, per plugin (desktop app) ----
   The page itself can't reach the network (connect-src 'none'). A plugin you allowed sends its
   requests through the app instead: requestUrl and request from "obsidian", and a plain fetch(),
   are each plugin's own, carrying its id. The app's main process makes the request only if that
   plugin was granted access in the app's dialog (desktop/main.js askNetwork), which the page can't
   answer. Plugins share one page, so this keeps well-behaved plugins to what you allowed; it isn't
   a wall between plugins. */
const PluginNet = {
  modules: new Map(),
  nameOf(id) { const e = (PluginHost.installed || []).find(function (p) { return p.id === id; }); return (e && e.manifest && e.manifest.name) || id; },
  clean(e) { return new Error(String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "")); },
  /* Obsidian's RequestUrlParam (or a bare address) -> one request through the app */
  send(id, req) {
    const r = typeof req === "string" ? { url: req } : Object.assign({}, req || {});
    let body = r.body;
    if (body instanceof ArrayBuffer) body = new Uint8Array(body);
    else if (ArrayBuffer.isView(body)) body = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
    else if (body != null) body = String(body);
    const d = cfDesktopPlugins();
    if (!d || !d.request) return Promise.reject(new Error("The internet is only offered to plugins in the desktop app"));
    return d.request(id, { url: String(r.url || ""), method: r.method, headers: r.headers || {}, contentType: r.contentType, body: body })
      .catch(function (e) { throw PluginNet.clean(e); });
  },
  response(res) {
    const buf = res.body.buffer.slice(res.body.byteOffset, res.body.byteOffset + res.body.byteLength);
    let text = null;
    const readText = function () { if (text === null) text = new TextDecoder().decode(res.body); return text; };
    return { status: res.status, headers: res.headers, arrayBuffer: buf,
      get text() { return readText(); }, get json() { return JSON.parse(readText()); } };
  },
  requestUrl(id, req) {
    const throwOn = !(req && typeof req === "object" && req.throw === false);
    const p = PluginNet.send(id, req).then(function (res) {
      const out = PluginNet.response(res);
      if (throwOn && out.status >= 400) { const e = new Error("Request failed, status " + out.status); e.status = out.status; e.headers = out.headers; throw e; }
      return out;
    });
    /* Obsidian's response promise also answers .json, .text and .arrayBuffer directly */
    p.json = p.then(function (r) { return r.json; });
    p.text = p.then(function (r) { return r.text; });
    p.arrayBuffer = p.then(function (r) { return r.arrayBuffer; });
    [p.json, p.text, p.arrayBuffer].forEach(function (q) { q.catch(function () {}); });   /* unread ones don't report */
    return p;
  },
  request(id, req) { return PluginNet.requestUrl(id, Object.assign({}, typeof req === "string" ? { url: req } : req, { throw: true })).then(function (r) { return r.text; }); },
  /* a fetch() for one plugin: the same request, answered as a standard Response */
  fetchFor(id) {
    return function (input, init) {
      init = init || {};
      const isReq = typeof Request !== "undefined" && input instanceof Request;
      const url = isReq ? input.url : String(input && input.href ? input.href : input);
      const headers = {};
      new Headers(init.headers || (isReq ? input.headers : undefined)).forEach(function (v, k) { headers[k] = v; });
      const method = init.method || (isReq ? input.method : "GET");
      const bodyP = init.body != null ? Promise.resolve(init.body) : isReq && !/^(GET|HEAD)$/i.test(method) ? input.arrayBuffer() : Promise.resolve(null);
      return bodyP.then(function (b) {
        if (b instanceof Blob) return b.arrayBuffer();
        if (b instanceof URLSearchParams) { if (!headers["content-type"]) headers["content-type"] = "application/x-www-form-urlencoded;charset=UTF-8"; return String(b); }
        return b;
      }).then(function (b) {
        return PluginNet.send(id, { url: url, method: method, headers: headers, body: b });
      }).then(function (res) {
        const st = res.status >= 200 && res.status <= 599 ? res.status : 502;
        const noBody = st === 204 || st === 205 || st === 304 || /^HEAD$/i.test(method);
        const out = new Response(noBody ? null : res.body, { status: st, headers: res.headers });
        try { Object.defineProperty(out, "url", { value: res.url }); } catch (e) { /* read-only here */ }
        return out;
      }).catch(function (e) { throw new TypeError("Failed to fetch: " + e.message); });
    };
  },
  /* each plugin's own "obsidian" module: the shared one, with its own request and requestUrl */
  moduleFor(id) {
    if (PluginNet.modules.has(id)) return PluginNet.modules.get(id);
    const base = PluginApi.build();
    const own = { request: function (r) { return PluginNet.request(id, r); }, requestUrl: function (r) { return PluginNet.requestUrl(id, r); } };
    const m = new Proxy(base, { get: function (t, k) { return Object.prototype.hasOwnProperty.call(own, k) ? own[k] : base[k]; } });
    PluginNet.modules.set(id, m);
    return m;
  },
  requireFor(id) { return function (name) { return String(name) === "obsidian" ? PluginNet.moduleFor(id) : PluginHost.require(name); }; },
  /* switching a plugin on: one that uses the internet asks once (the app's dialog) */
  askIfNeeded(entry) {
    const d = cfDesktopPlugins();
    if (!entry || !entry.compat || !entry.compat.net || entry.network !== null || !d.askNetwork) return Promise.resolve();
    return d.askNetwork(entry.id).catch(function () { return false; });
  }
};

/* ---- the host ---- */
const PluginHost = {
  running: false,
  installed: [],
  instances: new Map(),
  errors: new Map(),
  defined: new Map(),
  commands: new Map(),
  settingTabs: new Map(),
  views: {},
  blocks: new Map(),
  post: [],
  suggests: [],
  activeSuggest: null,
  renderChildren: [],
  pendingSource: null,
  notesAreReady: false,
  available() { return !!cfDesktopPlugins(); },

  /* the CommonJS require a plugin's code gets */
  require(name) {
    const n = String(name);
    if (n === "obsidian") return PluginApi.build();
    if (/^@codemirror\//.test(n) || /^@lezer\//.test(n)) return PluginStub;
    if (n === "path" || n === "node:path" || n === "path-browserify") return PluginNode.path;
    if (n === "events" || n === "node:events") return PluginNode.events;
    if (n === "moment") return PluginTime.moment;
    const base = n.replace(/^node:/, "");
    if (["util", "url", "assert", "querystring", "os", "tty"].indexOf(base) !== -1) return PluginNode[base];
    return PluginNode.missing(n);
  },
  process: { platform: (window.cfDesktop && window.cfDesktop.platform) || "browser", env: {}, versions: {}, argv: [], browser: true,
    nextTick: function (cb) { const a = Array.prototype.slice.call(arguments, 1); queueMicrotask(function () { cb.apply(null, a); }); }, cwd: function () { return "/"; }, on: function () {} },

  define(id, factory) { PluginHost.defined.set(String(id), factory); },
  /* Obsidian's private factory for an embedded note editor; some plugins (Kanban) take its editor
     class at start. They get a stand-in, so they load; inline editing through it won't work. */
  markdownEmbed(ctx) {
    class EmbeddedEditorStub extends PluginComponent { constructor() { super(); this.editor = null; } set() {} destroy() {} }
    const editMode = Object.create(Object.create(EmbeddedEditorStub.prototype));
    return { containerEl: (ctx && ctx.containerEl) || document.createElement("div"), editable: false, editMode: editMode,
      showEditor: function () {}, showPreview: function () {}, load: function () {}, unload: function () {}, set: function () {} };
  },

  start() {
    if (PluginHost.running || !PluginHost.available()) return;
    PluginHost.running = true;
    window.__cfPluginDefine = PluginHost.define;
    const app = {
      appId: "carbonfibre", title: "CarbonFibre", isMobile: false, lastEvent: null,
      vault: new PluginVault(), metadataCache: new PluginMetadataCache(), fileManager: new PluginFileManager(),
      keymap: { pushScope: function () {}, popScope: function () {}, getRootScope: function () { return app.scope; } },
      scope: new PluginScope(),
      loadLocalStorage: function (k) { try { const v = localStorage.getItem("carbonfibre-plugin-ls:" + k); return v === null ? null : JSON.parse(v); } catch (e) { return null; } },
      saveLocalStorage: function (k, v) { if (v === null || v === undefined) localStorage.removeItem("carbonfibre-plugin-ls:" + k); else storeSet("carbonfibre-plugin-ls:" + k, JSON.stringify(v)); },
      commands: {
        get commands() { const o = {}; PluginHost.commands.forEach(function (c, id) { o[id] = c.cmd; }); return o; },
        executeCommandById: function (id) { const c = PluginHost.commands.get(id); return c ? PluginHost.runCommand(c.cmd, false) : false; },
        executeCommand: function (cmd) { return PluginHost.runCommand(cmd, false); },
        findCommand: function (id) { const c = PluginHost.commands.get(id); return c ? c.cmd : undefined; },
        listCommands: function () { return Array.from(PluginHost.commands.values()).map(function (c) { return c.cmd; }); },
        addCommand: function (cmd) { PluginHost.commands.set(cmd.id, { cmd: cmd, plugin: null }); },
        removeCommand: function (id) { PluginHost.commands.delete(id); }
      },
      plugins: {
        plugins: {}, manifests: {}, enabledPlugins: new Set(),
        getPlugin: function (id) { return app.plugins.plugins[id] || null; },
        isEnabled: function (id) { return app.plugins.enabledPlugins.has(id); },
        enablePlugin: function (id) { return PluginHost.enable(id); }, disablePlugin: function (id) { return PluginHost.disable(id); },
        enablePluginAndSave: function (id) { return PluginHost.enable(id); }, disablePluginAndSave: function (id) { return PluginHost.disable(id); },
        loadManifests: function () { return Promise.resolve(); }
      },
      internalPlugins: { plugins: {}, config: {}, getPluginById: function () { return null; }, getEnabledPluginById: function () { return null; } },
      setting: {
        open: function () { PluginManager.open("installed"); }, close: function () { PluginManager.close(); },
        openTabById: function (id) { PluginManager.openSettings(id); }, activeTab: null, pluginTabs: []
      },
      customCss: { theme: "", snippets: [], enabledSnippets: new Set(), setTheme: function () {}, getSnippetPath: function () { return ""; }, readSnippets: function () {} },
      hotkeyManager: { getHotkeys: function () { return []; }, getDefaultHotkeys: function () { return []; }, printHotkeyForCommand: function () { return ""; } },
      viewRegistry: { viewByType: PluginHost.views, typeByExtension: { md: "markdown" }, getTypeByExtension: function (e) { return e === "md" ? "markdown" : undefined; }, isExtensionRegistered: function (e) { return e === "md"; } },
      embedRegistry: { embedByExtension: { md: PluginHost.markdownEmbed } },
      metadataTypeManager: { properties: {}, types: {}, getPropertyInfo: function () { return null; }, getAllProperties: function () { return {}; }, setType: function () {}, getTypeInfo: function () { return { expected: { type: "text" } }; } },
      dom: { appContainerEl: document.body, workspaceEl: document.getElementById("workarea") },
      getTheme: function () { return document.documentElement.getAttribute("data-theme") === "light" ? "moonstone" : "obsidian"; },
      getAccentColor: function () { return getComputedStyle(document.documentElement).getPropertyValue("--acc").trim(); },
      openWithDefaultApp: function () {}, showInFolder: function () {}, emulateMobile: function () {}, isDarkMode: function () { return app.getTheme() === "obsidian"; }
    };
    app.workspace = new PluginWorkspace();
    PluginApp.app = app;
    window.app = app;
    PluginHost.wire();
    PluginHost.followTheme();
    cfDesktopPlugins().list().then(function (list) {
      PluginHost.installed = list || [];
      let chain = Promise.resolve();
      PluginHost.installed.forEach(function (p) {
        if (p.enabled && p.compat.level !== "no") chain = chain.then(function () { return PluginHost.load(p).catch(function () {}); });
      });
      return chain;
    }).then(function () {
      if (PluginHost.notesAreReady) app.workspace.markReady();
      if (typeof PluginManager !== "undefined") PluginManager.refresh();
    }).catch(function (e) { console.error("CarbonFibre plugins:", e); });
  },

  loadScript(id) {
    return new Promise(function (resolve, reject) {
      PluginHost.defined.delete(id);
      const s = document.createElement("script");
      s.src = "app://carbonfibre/plugin-code/" + encodeURIComponent(id) + ".js?v=" + Date.now();
      s.onload = function () { s.remove(); const f = PluginHost.defined.get(id); if (f) resolve(f); else reject(new Error("The plugin's code didn't load (it may have a syntax error)")); };
      s.onerror = function () { s.remove(); reject(new Error("Couldn't load the plugin's code")); };
      document.head.appendChild(s);
    });
  },
  load(entry) {
    const id = entry.id;
    if (PluginHost.instances.has(id)) return Promise.resolve();
    PluginHost.errors.delete(id);
    PluginDom.install();                               /* Obsidian's element helpers, from the first plugin on */
    if (!window.CodeMirror) window.CodeMirror = PluginStub;   /* Obsidian's old editor global; plugins define modes on it */
    const app = PluginApp.app;
    return cfDesktopPlugins().styles(id).then(function (css) {
      if (css) {
        const st = document.createElement("style");
        st.setAttribute("data-cf-plugin", id);
        st.textContent = css;
        document.head.appendChild(st);
      }
      return PluginHost.loadScript(id);
    }).then(function (factory) {
      const module = { exports: {} };
      factory.call(window, PluginNet.requireFor(id), module, module.exports, PluginHost.process, window, PluginNet.fetchFor(id));
      const Cls = module.exports && (module.exports.default || module.exports);
      if (typeof Cls !== "function") throw new Error("main.js doesn't export a plugin");
      const manifest = Object.assign({}, entry.manifest, { id: id, dir: ".obsidian/plugins/" + id });
      const inst = new Cls(app, manifest);
      if (!(inst instanceof PluginPlugin)) throw new Error("main.js doesn't export an Obsidian plugin");
      PluginHost.instances.set(id, inst);
      app.plugins.plugins[id] = inst;
      app.plugins.manifests[id] = manifest;
      app.plugins.enabledPlugins.add(id);
      return Promise.resolve(inst.load()).then(function () { return inst; });
    }).then(function (inst) {
      if (PluginApp.app.workspace.layoutReady) PluginApp.app.workspace.trigger("layout-change");
      return inst;
    }).catch(function (e) {
      console.error("CarbonFibre: plugin " + id + " failed to load", e);
      PluginHost.errors.set(id, String((e && e.message) || e));
      PluginHost.unloadInstance(id);
      throw e;
    });
  },
  unloadInstance(id) {
    const inst = PluginHost.instances.get(id), app = PluginApp.app;
    if (inst) { try { inst.unload(); } catch (e) { console.error(e); } }
    PluginHost.instances.delete(id);
    if (app) { delete app.plugins.plugins[id]; app.plugins.enabledPlugins.delete(id); }
    document.querySelectorAll('style[data-cf-plugin="' + CSS.escape(id) + '"]').forEach(function (s) { s.remove(); });
    PluginHost.commands.forEach(function (c, k) { if (k.indexOf(id + ":") === 0) PluginHost.commands.delete(k); });
    PluginHost.rerenderSoon();
  },
  enable(id) {
    return cfDesktopPlugins().setEnabled(id, true).then(function () { return cfDesktopPlugins().list(); }).then(function (list) {
      PluginHost.installed = list;
      const entry = list.find(function (p) { return p.id === id; });
      if (!entry) throw new Error("Not installed: " + id);
      return PluginNet.askIfNeeded(entry).then(function () { return cfDesktopPlugins().list(); });
    }).then(function (list) {
      PluginHost.installed = list;
      const entry = list.find(function (p) { return p.id === id; });
      if (!entry) throw new Error("Not installed: " + id);
      if (!PluginHost.running) PluginHost.start();
      return PluginHost.load(entry).then(function () { if (PluginHost.notesAreReady) PluginApp.app.workspace.markReady(); });
    });
  },
  disable(id) {
    PluginHost.unloadInstance(id);
    PluginHost.errors.delete(id);
    return cfDesktopPlugins().setEnabled(id, false).then(function () { return cfDesktopPlugins().list(); }).then(function (list) { PluginHost.installed = list; });
  },

  /* ---- commands ---- */
  addCommand(plugin, cmd) {
    const full = Object.assign({}, cmd);
    full.id = plugin.manifest.id + ":" + cmd.id;
    full.name = (plugin.manifest.name || plugin.manifest.id) + ": " + cmd.name;
    PluginHost.commands.set(full.id, { cmd: full, plugin: plugin });
    plugin.register(function () { PluginHost.commands.delete(full.id); });
    return full;
  },
  editorContext() {
    const p = focusedPane || panes[0];
    if (!p || p.type !== "note" || !p.note()) return null;
    const v = PluginApp.app.workspace.leafFor(p).view;
    return { editor: v.editor, view: v };
  },
  /* checking: only ask whether the command can run now */
  runCommand(c, checking) {
    try {
      if (c.editorCheckCallback || c.editorCallback) {
        const ctx = PluginHost.editorContext();
        if (!ctx) return false;
        if (c.editorCheckCallback) return !!c.editorCheckCallback(checking, ctx.editor, ctx.view) || (!checking && true);
        if (checking) return true;
        const r = c.editorCallback(ctx.editor, ctx.view);
        if (r && r.catch) r.catch(function (e) { console.error(e); });
        return true;
      }
      if (c.checkCallback) return !!c.checkCallback(checking) || (!checking && true);
      if (checking) return typeof c.callback === "function";
      if (c.callback) { const r = c.callback(); if (r && r.catch) r.catch(function (e) { console.error(e); }); }
      return true;
    } catch (e) {
      console.error("CarbonFibre: plugin command failed", c.id, e);
      if (!checking) pushToastLike("That plugin command failed: " + (e.message || e));
      return false;
    }
  },
  hotkeyText(c) {
    const h = c.hotkeys && c.hotkeys[0];
    if (!h) return "";
    return (h.modifiers || []).map(function (m) { return m === "Mod" ? (PluginKeymap.mac ? "Cmd" : "Ctrl") : m; }).concat(String(h.key).length === 1 ? String(h.key).toUpperCase() : h.key).join("+");
  },
  /* the palette's list: the Plugins window, then every plugin command that can run now */
  paletteCommands() {
    const list = [
      { label: "Plugins: manage installed plugins", run: function () { PluginManager.open("installed"); } },
      { label: "Plugins: browse community plugins", run: function () { PluginManager.open("browse"); } }
    ];
    if (!PluginHost.running) return list;
    PluginHost.commands.forEach(function (entry) {
      const c = entry.cmd;
      if (!PluginHost.runCommand(c, true)) return;
      list.push({ label: c.name, key: PluginHost.hotkeyText(c), run: function () {
        const sp = pal.spot;
        if (sp && panes.indexOf(sp.pane) !== -1 && sp.pane.type === "note") sp.pane.setActive(Math.min(sp.line, sp.pane.lines.length - 1), sp.col);
        PluginHost.runCommand(c, false);
      } });
    });
    return list;
  },

  /* ---- rendering: code blocks and post processors ---- */
  rerenderTimer: 0,
  rerenderSoon() {
    if (PluginHost.rerenderTimer) return;
    PluginHost.rerenderTimer = requestAnimationFrame(function () {
      PluginHost.rerenderTimer = 0;
      panes.forEach(function (p) {
        if (p.type !== "note" || !p.lines) return;
        p.fmeta = computeFenceMeta(p.lines);
        if (p.rerenderLines) p.rerenderLines();
        if (p.mode === "split" && p.renderPreview) p.renderPreview();
      });
    });
  },
  /* called from computeFenceMeta: fenced blocks a plugin renders become one card */
  markBlocks(ls, meta) {
    if (!PluginHost.running || !PluginHost.blocks.size) return;
    for (let i = 0; i < ls.length; i++) {
      if (!meta[i] || meta[i].fence !== "open") continue;
      const lang = String(meta[i].lang || "").split(/\s+/)[0].toLowerCase();
      if (!lang || lang === "excalidraw" || !PluginHost.blocks.has(lang)) continue;
      let j = i + 1;
      while (j < ls.length && meta[j].fence !== "close") j++;
      meta[i].plug = lang;
      meta[i].plugBody = ls.slice(i + 1, j).join("\n");
      meta[i].plugEnd = j;
      for (let k = i + 1; k <= j && k < ls.length; k++) meta[k].plugHidden = true;
      i = j;
    }
  },
  blockHtml(fenceInfo, idx) {
    return '<span data-deco="1" class="cfp-block" data-plugblock="' + idx + '"><span class="cfp-block-bar"><span class="cfp-block-lang">' + esc(fenceInfo.plug) + "</span>" +
      (idx >= 0 ? '<span class="cfp-block-edit" data-plugedit="' + idx + '" role="button" tabindex="-1" title="Edit the text of this block">Edit source</span>' : "") +
      '</span><span class="cfp-block-out"></span></span>';
  },
  /* called from makeRenderedNode, for every rendered line */
  afterRender(div, raw, fenceInfo, idx) {
    if (!PluginHost.running) return;
    const isBlock = fenceInfo && fenceInfo.plug;
    if (!isBlock && (!PluginHost.post.length || (fenceInfo && (fenceInfo.fence || fenceInfo.plugHidden)))) return;
    const given = PluginHost.pendingSource;
    requestAnimationFrame(function () {
      if (!div.isConnected) return;
      const pane = panes.find(function (p) { return p.root.contains(div); });
      const n = pane && pane.type === "note" && pane.note();
      const source = given !== null ? given : n ? PluginApp.notePath(n) : "";
      if (isBlock) PluginHost.fillBlock(div, fenceInfo, idx, source, pane);
      else PluginHost.postProcess(div, source, idx);
    });
  },
  context(el, source, lineStart, lineEnd) {
    const file = PluginApp.app.vault.getFileByPath(source), cache = file ? PluginApp.app.metadataCache.getFileCache(file) : null;
    return {
      docId: source, sourcePath: source, frontmatter: cache && cache.frontmatter, el: el, containerEl: el, remainingNestingLevel: 4, displayMode: false,
      addChild: function (child) { PluginHost.renderChildren.push({ child: child, el: el }); child.load(); },
      getSectionInfo: function () { return file ? { text: file.note.content || "", lineStart: Math.max(0, lineStart), lineEnd: Math.max(0, lineEnd) } : null; }
    };
  },
  fillBlock(div, fenceInfo, idx, source, pane) {
    const reg = PluginHost.blocks.get(fenceInfo.plug), out = div.querySelector(".cfp-block-out");
    if (!reg || !out) return;
    const host = div.querySelector(".cfp-block");
    host.addEventListener("mousedown", function (e) {
      const ed = e.target.closest("[data-plugedit]");
      e.stopPropagation();
      if (ed && pane) { e.preventDefault(); PluginHost.editBlock(pane, idx); }
    });
    host.addEventListener("click", function (e) { e.stopPropagation(); });
    const el = document.createElement("div");
    el.className = "block-language-" + fenceInfo.plug;
    out.appendChild(el);
    try {
      const r = reg.fn(fenceInfo.plugBody || "", el, PluginHost.context(el, source, idx, fenceInfo.plugEnd || idx));
      if (r && r.catch) r.catch(function (e) { PluginHost.blockError(el, e); });
    } catch (e) { PluginHost.blockError(el, e); }
  },
  blockError(el, e) {
    console.error(e);
    const d = document.createElement("div");
    d.className = "cfp-block-error";
    d.textContent = "The plugin couldn't show this block: " + ((e && e.message) || e);
    el.appendChild(d);
  },
  editBlock(pane, idx) {
    const meta = pane.fmeta && pane.fmeta[idx];
    if (!meta || !meta.plug) return;
    const m = new PluginModal(PluginApp.app);
    m.setTitle("Edit " + meta.plug + " block");
    m.modalEl.classList.add("cfp-block-modal");
    const ta = document.createElement("textarea");
    ta.className = "cfp-block-src";
    ta.value = meta.plugBody || "";
    ta.spellcheck = false;
    m.contentEl.appendChild(ta);
    const row = document.createElement("div");
    row.className = "modal-button-container";
    const cancel = new PluginButtonComponent(row).setButtonText("Cancel").onClick(function () { m.close(); });
    new PluginButtonComponent(row).setButtonText("Save").setCta().onClick(function () {
      const end = meta.plugEnd;
      const body = ta.value.replace(/\r\n?/g, "\n").split("\n");
      pane.applyLines(idx + 1, end - 1, body, { line: idx, col: 0 });
      m.close();
    });
    m.contentEl.appendChild(row);
    m.onOpen = function () { setTimeout(function () { ta.focus(); }, 0); };
    m.open();
    return cancel;
  },
  postProcess(div, source, idx) {
    const ctx = PluginHost.context(div, source, idx, idx);
    PluginHost.post.forEach(function (e) {
      try { const r = e.fn(div, ctx); if (r && r.catch) r.catch(function (er) { console.error(er); }); } catch (er) { console.error(er); }
    });
  },
  renderMarkdown(markdown, el, sourcePath, component) {
    el.classList.add("markdown-rendered");
    const was = PluginHost.pendingSource;
    PluginHost.pendingSource = sourcePath || "";
    try { renderMarkdownInto(el, String(markdown === undefined ? "" : markdown)); } finally { PluginHost.pendingSource = was; }
    if (!el._cfLinks) {
      Object.defineProperty(el, "_cfLinks", { value: true });
      el.addEventListener("click", function (e) { linkClick(e); });
    }
    return component === undefined ? Promise.resolve() : Promise.resolve();
  },
  sweepChildren() {
    PluginHost.renderChildren = PluginHost.renderChildren.filter(function (r) {
      if (r.el.isConnected) return true;
      try { r.child.unload(); } catch (e) { console.error(e); }
      return false;
    });
  },

  /* ---- events from CarbonFibre ---- */
  modifyTimers: new Map(),
  noteChanged(n) {
    if (!PluginHost.running || !PluginApp.app) return;
    clearTimeout(PluginHost.modifyTimers.get(n));
    PluginHost.modifyTimers.set(n, setTimeout(function () {
      PluginHost.modifyTimers.delete(n);
      if (state.notes.indexOf(n) === -1) return;
      const app = PluginApp.app, f = PluginApp.fileFor(n);
      app.metadataCache.resolvedCache = null;
      app.vault.trigger("modify", f);
      app.metadataCache.trigger("changed", f, n.content, app.metadataCache.getFileCache(f));
      app.metadataCache.trigger("resolved");
    }, 300));
  },
  noteCreated(n) {
    if (!PluginHost.running || !PluginApp.app) return;
    const app = PluginApp.app, f = PluginApp.fileFor(n);
    app.metadataCache.resolvedCache = null;
    app.vault.trigger("create", f);
    app.metadataCache.trigger("changed", f, n.content, app.metadataCache.getFileCache(f));
    app.metadataCache.trigger("resolved");
  },
  noteDeleted(n) {
    if (!PluginHost.running || !PluginApp.app) return;
    const app = PluginApp.app, f = PluginApp.fileFor(n);
    f.deleted = true;
    app.metadataCache.resolvedCache = null;
    app.vault.trigger("delete", f);
    app.metadataCache.trigger("deleted", f, null);
    app.metadataCache.trigger("resolved");
  },
  noteRenamed(n, oldPath) {
    if (!PluginHost.running || !PluginApp.app || oldPath === PluginApp.notePath(n)) return;
    const app = PluginApp.app, f = PluginApp.fileFor(n);
    app.metadataCache.resolvedCache = null;
    app.vault.trigger("rename", f, oldPath);
    app.metadataCache.trigger("resolved");
  },
  fileOpened(p) {
    if (!PluginHost.running || !PluginApp.app) return;
    const n = p.type === "note" && p.note(), ws = PluginApp.app.workspace;
    ws.trigger("file-open", n ? PluginApp.fileFor(n) : null);
    ws.trigger("active-leaf-change", ws.leafFor(p));
  },
  notesReady() {
    PluginHost.notesAreReady = true;
    if (!PluginHost.running || !PluginApp.app) return;
    PluginApp.app.metadataCache.resolvedCache = null;
    PluginApp.app.workspace.markReady();
    PluginApp.app.workspace.trigger("layout-change");
    PluginApp.app.metadataCache.trigger("resolved");
  },
  editorChanged(p) {
    if (!PluginHost.running || !PluginApp.app) return;
    const leaf = PluginApp.app.workspace.leafFor(p);
    if (p.type === "note" && p.note()) PluginApp.app.workspace.trigger("editor-change", leaf.view.editor, leaf.view);
  },

  /* ---- editor suggestions (autocomplete popups from plugins) ---- */
  paneOfTextarea(t) { return t && t.tagName === "TEXTAREA" ? panes.find(function (p) { return p.ta === t; }) || null : null; },
  caretPoint(p) {
    const ta = p.ta, r = ta.getBoundingClientRect(), cs = getComputedStyle(ta);
    const c = PluginHost.measure || (PluginHost.measure = document.createElement("canvas").getContext("2d"));
    c.font = cs.font;
    const w = c.measureText(ta.value.slice(0, ta.selectionStart)).width;
    return { x: r.left + parseFloat(cs.paddingLeft || "0") + Math.min(w, r.width - 20), y: r.bottom + 2, top: r.top };
  },
  suggestFor(p) {
    const app = PluginApp.app, view = app.workspace.leafFor(p).view, editor = view.editor, file = view.file;
    const cursor = editor.getCursor();
    for (let i = 0; i < PluginHost.suggests.length; i++) {
      const s = PluginHost.suggests[i];
      let ctx = null;
      try { ctx = s.onTrigger(cursor, editor, file); } catch (e) { console.error(e); }
      if (!ctx) { if (s.isOpen) s.close(); continue; }
      PluginHost.suggests.forEach(function (o) { if (o !== s && o.isOpen) o.close(); });
      s.context = Object.assign({}, ctx, { editor: editor, file: file });
      const myCtx = s.context;
      Promise.resolve().then(function () { return s.getSuggestions(myCtx); }).then(function (list) {
        if (s.context !== myCtx) return;
        list = (list || []).slice(0, s.limit || 100);
        if (!list.length || !p.ta) { s.close(); return; }
        s.chooser.setSuggestions(list);
        s.open();
        PluginHost.activeSuggest = s;
        const pt = PluginHost.caretPoint(p);
        s.placeAt(pt.x, pt.y, pt.top);
      }).catch(function (e) { console.error(e); });
      return;
    }
    PluginHost.activeSuggest = null;
  },
  wire() {
    document.addEventListener("input", function (e) {
      const p = PluginHost.paneOfTextarea(e.target);
      if (!p) return;
      PluginApp.lastCursor.set(p, { line: p.activeLine, ch: p.ta.selectionStart });
      PluginHost.editorChanged(p);
      if (PluginHost.suggests.length) PluginHost.suggestFor(p);
    }, true);
    document.addEventListener("keydown", function (e) {
      const s = PluginHost.activeSuggest;
      if (s && s.isOpen && PluginHost.paneOfTextarea(e.target) && s.handleKey(e)) { e.stopPropagation(); return; }
    }, true);
    document.addEventListener("keyup", function (e) {
      const p = PluginHost.paneOfTextarea(e.target);
      if (p && p.activeLine !== null) PluginApp.lastCursor.set(p, { line: p.activeLine, ch: p.ta.selectionStart });
    }, true);
    document.addEventListener("focusout", function (e) {
      if (PluginHost.paneOfTextarea(e.target) && PluginHost.activeSuggest) { PluginHost.activeSuggest.close(); PluginHost.activeSuggest = null; }
    }, true);
    /* hotkeys plugins ask for */
    document.addEventListener("keydown", function (e) {
      if (e.defaultPrevented || PluginModals.open.length) return;
      PluginApp.app.lastEvent = e;
      PluginHost.commands.forEach(function (entry) {
        const c = entry.cmd;
        (c.hotkeys || []).forEach(function (h) {
          if (e.defaultPrevented || String(h.key).toLowerCase() !== String(e.key).toLowerCase() || !PluginKeymap.modsMatch(e, h.modifiers || [])) return;
          if (!PluginHost.runCommand(c, true)) return;
          e.preventDefault();
          PluginHost.runCommand(c, false);
        });
      });
    });
    let lastPane = null;
    document.addEventListener("focusin", function (e) {
      const p = panes.find(function (q) { return q.root.contains(e.target); });
      if (!p || p === lastPane) return;
      lastPane = p;
      PluginApp.app.workspace.trigger("active-leaf-change", PluginApp.app.workspace.leafFor(p));
    });
    window.addEventListener("resize", function () { PluginApp.app.workspace.trigger("resize"); });
    window.addEventListener("beforeunload", function () { PluginApp.app.workspace.trigger("quit", { add: function () {} }); });
    setInterval(PluginHost.sweepChildren, 10000);
  },
  followTheme() {
    const apply = function () {
      const light = document.documentElement.getAttribute("data-theme") === "light";
      document.body.classList.toggle("theme-light", light);
      document.body.classList.toggle("theme-dark", !light);
      if (PluginApp.app) PluginApp.app.workspace.trigger("css-change");
    };
    document.body.classList.add("is-desktop", "cf-plugins-on");
    apply();
    new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }
};
