/* The only things the page can reach outside itself: native dialogs. No Node, no files. */
"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cfDesktop", {
  platform: process.platform,
  confirm: (message) => ipcRenderer.invoke("cf:confirm", String(message)),
  prompt: (message, value) => ipcRenderer.invoke("cf:prompt", String(message), value == null ? "" : String(value)),
  choose: (message, choices) => ipcRenderer.invoke("cf:choose", String(message), Array.from(choices || [], String)),
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
    openRepo: (repo) => ipcRenderer.invoke("cf:plug:openRepo", String(repo))
  }
});
