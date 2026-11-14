/* The only things the page can reach outside itself: native dialogs, and the plugin calls below
   (internet requests only for plugins you allowed). No Node, no files.
   Except: a window opened while a plugin you allowed Node.js is on (main.js createWindow) has no
   sandbox and no isolation, and gets Node's built-in modules below, for those plugins (the page's
   plugin host hands them only to plugins you allowed; plugins share the page, so that's a courtesy
   between plugins, not a wall). */
"use strict";
const { contextBridge, ipcRenderer } = require("electron");

const api = {
  platform: process.platform,
  confirm: (message) => ipcRenderer.invoke("cf:confirm", String(message)),
  prompt: (message, value) => ipcRenderer.invoke("cf:prompt", String(message), value == null ? "" : String(value)),
  choose: (message, choices) => ipcRenderer.invoke("cf:choose", String(message), Array.from(choices || [], String)),
  /* updates (updater.js): the page shows them; installing asks in the app's own dialog first */
  updates: {
    state: () => ipcRenderer.invoke("cf:update:state"),
    install: () => ipcRenderer.invoke("cf:update:install"),
    onChange: (cb) => { if (typeof cb === "function") ipcRenderer.on("cf:update", (_e, st) => cb(st)); }
  },
  /* Obsidian plugins: installed list, the community catalog, settings files (see plugins/store.js) */
  plugins: {
    list: () => ipcRenderer.invoke("cf:plug:list"),
    catalog: (refresh) => ipcRenderer.invoke("cf:plug:catalog", !!refresh),
    check: (id) => ipcRenderer.invoke("cf:plug:check", String(id)),
    install: (id) => ipcRenderer.invoke("cf:plug:install", String(id)),
    installFolder: () => ipcRenderer.invoke("cf:plug:installFolder"),
    importFiles: (id, files) => ipcRenderer.invoke("cf:plug:importFiles", String(id), files),
    uninstall: (id) => ipcRenderer.invoke("cf:plug:uninstall", String(id)),
    setEnabled: (id, on) => ipcRenderer.invoke("cf:plug:setEnabled", String(id), !!on),
    styles: (id) => ipcRenderer.invoke("cf:plug:styles", String(id)),
    loadData: (id) => ipcRenderer.invoke("cf:plug:loadData", String(id)),
    saveData: (id, text) => ipcRenderer.invoke("cf:plug:saveData", String(id), String(text)),
    fs: (op, id, rel, text) => ipcRenderer.invoke("cf:plug:fs", String(op), String(id), String(rel || ""), text == null ? undefined : String(text)),
    openRepo: (repo) => ipcRenderer.invoke("cf:plug:openRepo", String(repo)),
    /* the internet: asking shows the app's own dialog (only you can say yes); taking it away needs no dialog */
    askNetwork: (id) => ipcRenderer.invoke("cf:plug:askNetwork", String(id)),
    revokeNetwork: (id) => ipcRenderer.invoke("cf:plug:revokeNetwork", String(id)),
    request: (id, opts) => ipcRenderer.invoke("cf:plug:request", String(id), opts),
    /* Node.js, the same way (the dialog may reopen the window, answering "reopen") */
    askNode: (id) => ipcRenderer.invoke("cf:plug:askNode", String(id)),
    revokeNode: (id) => ipcRenderer.invoke("cf:plug:revokeNode", String(id)),
    vaultPath: (name) => ipcRenderer.invoke("cf:plug:vaultPath", String(name)),
    askVaultPath: (name) => ipcRenderer.invoke("cf:plug:askVaultPath", String(name)),
    /* Obsidian themes: CSS only (plugins/themes.js) */
    themes: {
      catalog: (refresh) => ipcRenderer.invoke("cf:plug:themeCatalog", !!refresh),
      list: () => ipcRenderer.invoke("cf:plug:themeList"),
      install: (name) => ipcRenderer.invoke("cf:plug:themeInstall", String(name)),
      importFiles: (name, css, manifest) => ipcRenderer.invoke("cf:plug:themeImport", String(name), String(css || ""), manifest == null ? null : String(manifest)),
      uninstall: (name) => ipcRenderer.invoke("cf:plug:themeUninstall", String(name)),
      use: (name) => ipcRenderer.invoke("cf:plug:themeUse", name == null ? "" : String(name)),
      css: (name) => ipcRenderer.invoke("cf:plug:themeCss", name == null ? "" : String(name))
    },
    /* app.secretStorage: "all", or "set" with a name and value (empty removes it) */
    secrets: (op, name, value) => ipcRenderer.invoke("cf:plug:secrets", String(op), name == null ? "" : String(name), value == null ? "" : String(value)),
    /* the notes folder's files for app://carbonfibre/vault/ addresses: the app asks, the page reads */
    onVaultRead: (cb) => {
      if (typeof cb !== "function") return;
      ipcRenderer.removeAllListeners("cf:vault:read");
      ipcRenderer.on("cf:vault:read", (_e, id, rel) => {
        Promise.resolve().then(() => cb(String(rel))).then((b) => b ? new Uint8Array(b) : null, () => null)
          .then((bytes) => ipcRenderer.send("cf:vault:data", id, bytes));
      });
    }
  }
};

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld("cfDesktop", api);
} else {
  /* Node.js for plugins: Node's own modules and Electron's, nothing from the app's files */
  const builtin = new Set(require("node:module").builtinModules);
  api.node = {
    require(name) {
      const n = String(name), bare = n.replace(/^node:/, "");
      if (n !== "electron" && !builtin.has(bare)) throw new Error("Not a Node.js module: " + n);
      return require(n);
    },
    process,
    Buffer
  };
  Object.defineProperty(window, "cfDesktop", { value: Object.freeze(api), configurable: false, writable: false });
  window.Buffer = Buffer;
}
