"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cfPrompt", {
  init: () => ipcRenderer.invoke("cf:prompt-init"),
  size: (h) => ipcRenderer.send("cf:prompt-size", h),
  done: (v) => ipcRenderer.send("cf:prompt-done", v)
});
