
/* ============================================================
   Host bridge: CarbonFibre inside the VS Code extension (vscode-extension/).
   In a browser nothing here changes anything: HostBridge.active stays false, and Dialogs uses the
   browser's own confirm and prompt.
   Inside VS Code the page runs in a webview, which has no folder picker, no pop-up dialogs, no
   downloads and no lasting browser storage. The extension supplies each over postMessage:
   - folders: FileSystemDirectoryHandle / FileSystemFileHandle look-alikes whose reads and writes
     the extension carries out with vscode.workspace.fs, only inside folders it handed over;
   - dialogs: confirm, prompt and choose become VS Code's own modal message and input box;
   - storage: localStorage reads come from a copy the extension seeds into the page, and every
     write goes back to the extension's per-workspace storage;
   - links open in the system browser, and the theme follows VS Code's.
   ============================================================ */
const HostBridge = {
  active: false,
  api: null,
  seq: 0,
  waiting: new Map(),
  store: {},
  seed: {},
  init() {
    if (typeof window.acquireVsCodeApi !== "function") return;
    HostBridge.api = window.acquireVsCodeApi();
    HostBridge.active = true;
    const el = document.getElementById("cf-host");
    try { HostBridge.seed = el ? JSON.parse(el.textContent) : {}; } catch (e) { HostBridge.seed = {}; }
    HostBridge.store = Object.assign({}, HostBridge.seed.storage || {});
    window.addEventListener("message", HostBridge.onMessage);
    HostBridge.patchStorage();
    HostBridge.patchWindow();
    HostBridge.followTheme();
  },
  /* one request to the extension; the answer comes back as a "reply" message with the same id */
  call(op, args) {
    const id = ++HostBridge.seq;
    return new Promise(function (resolve, reject) {
      HostBridge.waiting.set(id, { resolve: resolve, reject: reject });
      HostBridge.api.postMessage(Object.assign({ op: op, id: id }, args || {}));
    });
  },
  post(op, args) { HostBridge.api.postMessage(Object.assign({ op: op }, args || {})); },
  onMessage(e) {
    const m = e.data || {};
    if (m.type === "reply") {
      const w = HostBridge.waiting.get(m.id);
      if (!w) return;
      HostBridge.waiting.delete(m.id);
      if (m.error) w.reject(new DOMException(m.error.message || "failed", m.error.name || "Error"));
      else w.resolve(m.result);
    } else if (m.type === "flush") {
      window.dispatchEvent(new Event("beforeunload"));   /* the app's own save-everything-now path */
    } else if (m.type === "changed") {
      pushToastLike("Notes changed outside CarbonFibre. Press Reload (bottom left) to see them.");
    } else if (m.type === "theme") {
      HostBridge.themeChanged();
    }
  },

  /* ---- storage: the page's localStorage, kept by the extension ---- */
  patchStorage() {
    const proto = Storage.prototype, real = { get: proto.getItem, set: proto.setItem, remove: proto.removeItem, clear: proto.clear };
    let ls = null;
    try { ls = window.localStorage; } catch (e) { ls = null; }
    const mine = function (s) { return s === ls; };
    proto.getItem = function (k) {
      if (!mine(this)) return real.get.call(this, k);
      k = String(k);
      return Object.prototype.hasOwnProperty.call(HostBridge.store, k) ? HostBridge.store[k] : null;
    };
    proto.setItem = function (k, v) {
      if (!mine(this)) return real.set.call(this, k, v);
      HostBridge.store[String(k)] = String(v);
      HostBridge.post("store.set", { key: String(k), value: String(v) });
    };
    proto.removeItem = function (k) {
      if (!mine(this)) return real.remove.call(this, k);
      delete HostBridge.store[String(k)];
      HostBridge.post("store.remove", { key: String(k) });
    };
    proto.clear = function () {
      if (!mine(this)) return real.clear.call(this);
      HostBridge.store = {};
      HostBridge.post("store.clear");
    };
  },

  /* ---- folders, saving files, links and messages ---- */
  patchWindow() {
    window.showDirectoryPicker = function () {
      return HostBridge.call("pickFolder").then(function (r) {
        if (!r) throw new DOMException("No folder chosen", "AbortError");
        return HostBridge.dir(r.root, "", r.name);
      });
    };
    window.showSaveFilePicker = function (opts) {
      return HostBridge.call("pickSaveFile", { suggestedName: (opts && opts.suggestedName) || "" }).then(function (r) {
        if (!r) throw new DOMException("No file chosen", "AbortError");
        return HostBridge.file(r.root, r.path, r.name);
      });
    };
    window.open = function (url) {
      HostBridge.post("openExternal", { url: String(url || "") });
      return null;
    };
    window.alert = function (message) { HostBridge.post("alert", { message: String(message) }); };
  },
  vault() {
    return HostBridge.call("vault").then(function (r) { return r ? HostBridge.dir(r.root, "", r.name) : null; });
  },
  join(path, name) {
    name = String(name);
    if (!name || name === "." || name === ".." || /[\\/]/.test(name)) throw new TypeError("Name is not allowed: " + name);
    return path ? path + "/" + name : name;
  },
  dir(root, path, name) {
    const h = {
      kind: "directory", name: name, root: root, path: path,
      getDirectoryHandle(n, o) {
        let p; try { p = HostBridge.join(path, n); } catch (e) { return Promise.reject(e); }
        return HostBridge.call("dir", { root: root, path: p, create: !!(o && o.create) }).then(function () { return HostBridge.dir(root, p, String(n)); });
      },
      getFileHandle(n, o) {
        let p; try { p = HostBridge.join(path, n); } catch (e) { return Promise.reject(e); }
        return HostBridge.call("file", { root: root, path: p, create: !!(o && o.create) }).then(function () { return HostBridge.file(root, p, String(n)); });
      },
      removeEntry(n, o) {
        let p; try { p = HostBridge.join(path, n); } catch (e) { return Promise.reject(e); }
        return HostBridge.call("remove", { root: root, path: p, recursive: !!(o && o.recursive) }).then(function () {});
      },
      values() { return HostBridge.listing(h, function (c) { return c; }); },
      entries() { return HostBridge.listing(h, function (c) { return [c.name, c]; }); },
      keys() { return HostBridge.listing(h, function (c) { return c.name; }); },
      queryPermission() { return Promise.resolve("granted"); },
      requestPermission() { return Promise.resolve("granted"); },
      isSameEntry(o) { return Promise.resolve(!!o && o.root === root && o.path === path && o.kind === "directory"); }
    };
    h[Symbol.asyncIterator] = h.entries;
    return h;
  },
  /* an async iterator over a folder's children, read in one request */
  listing(h, shape) {
    let items = null, i = 0;
    const it = {
      next() {
        const ready = items ? Promise.resolve() : HostBridge.call("list", { root: h.root, path: h.path }).then(function (r) { items = r || []; });
        return ready.then(function () {
          if (i >= items.length) return { done: true, value: undefined };
          const c = items[i++], p = h.path ? h.path + "/" + c.name : c.name;
          return { done: false, value: shape(c.kind === "directory" ? HostBridge.dir(h.root, p, c.name) : HostBridge.file(h.root, p, c.name)) };
        });
      }
    };
    it[Symbol.asyncIterator] = function () { return it; };
    return it;
  },
  file(root, path, name) {
    return {
      kind: "file", name: name, root: root, path: path,
      getFile() {
        return HostBridge.call("read", { root: root, path: path }).then(function (r) {
          return new File([HostBridge.bytes(r.data)], name, { lastModified: r.mtime || Date.now() });
        });
      },
      createWritable() {
        const chunks = [];
        return Promise.resolve({
          write(d) {
            if (d && typeof d === "object" && d.type === "write") d = d.data;
            chunks.push(d);
            return Promise.resolve();
          },
          close() {
            return new Blob(chunks).arrayBuffer().then(function (buf) {
              return HostBridge.call("write", { root: root, path: path, data: new Uint8Array(buf) });
            }).then(function () {});
          },
          abort() { chunks.length = 0; return Promise.resolve(); }
        });
      },
      queryPermission() { return Promise.resolve("granted"); },
      requestPermission() { return Promise.resolve("granted"); },
      isSameEntry(o) { return Promise.resolve(!!o && o.root === root && o.path === path && o.kind === "file"); }
    };
  },
  /* bytes arrive as a Uint8Array; anything else a transport might flatten them to is read too */
  bytes(d) {
    if (d instanceof Uint8Array) return d;
    if (d instanceof ArrayBuffer) return new Uint8Array(d);
    if (Array.isArray(d)) return Uint8Array.from(d);
    if (d && Array.isArray(d.data)) return Uint8Array.from(d.data);   /* a Node Buffer flattened to JSON */
    if (d && typeof d === "object") return Uint8Array.from(Object.keys(d).sort(function (a, b) { return a - b; }).map(function (k) { return d[k]; }));
    return new Uint8Array(0);
  },

  /* ---- theme: VS Code marks its webviews' body with vscode-light, vscode-dark or vscode-high-contrast ---- */
  themeKind() {
    const c = document.body ? document.body.classList : null;
    return c && (c.contains("vscode-light") || c.contains("vscode-high-contrast-light")) ? "light" : "dark";
  },
  followTheme() {
    HostBridge.themeChanged();
    if (document.body && window.MutationObserver) new MutationObserver(HostBridge.themeChanged).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  },
  themeChanged() {
    let saved = null;
    try { saved = localStorage.getItem("carbonfibre-theme"); } catch (e) { saved = null; }
    const t = saved === "light" || saved === "dark" ? saved : HostBridge.themeKind();
    if (t === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
    if (typeof appIconApply === "function" && document.getElementById("appLogo")) { try { appIconApply(); } catch (e) {} }
  }
};

/* Asking before doing something. Each returns a promise, because VS Code's dialogs answer later. */
const Dialogs = {
  confirm(message) {
    return HostBridge.active ? HostBridge.call("confirm", { message: String(message) }).then(Boolean) : Promise.resolve(window.confirm(message));
  },
  prompt(message, value) {
    if (HostBridge.active) return HostBridge.call("prompt", { message: String(message), value: value == null ? "" : String(value) }).then(function (v) { return v == null ? null : String(v); });
    return Promise.resolve(window.prompt(message, value == null ? "" : value));
  },
  /* one of a few answers, as buttons in VS Code; in a browser, typed into a prompt */
  choose(message, choices, fallback) {
    if (HostBridge.active) return HostBridge.call("choose", { message: String(message), choices: choices }).then(function (v) { return v || fallback; });
    const typed = window.prompt(message + "\n\nType " + choices.join(", ") + ":", fallback);
    const v = String(typed || fallback).trim().toLowerCase();
    return Promise.resolve(choices.indexOf(v) !== -1 ? v : fallback);
  }
};
HostBridge.init();
