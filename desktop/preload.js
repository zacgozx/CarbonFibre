/* The only things the page can reach outside itself: native dialogs. No Node, no files. */
"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cfDesktop", {
  platform: process.platform,
  confirm: (message) => ipcRenderer.invoke("cf:confirm", String(message)),
  prompt: (message, value) => ipcRenderer.invoke("cf:prompt", String(message), value == null ? "" : String(value)),
  choose: (message, choices) => ipcRenderer.invoke("cf:choose", String(message), Array.from(choices || [], String))
});
