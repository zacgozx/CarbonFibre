/* CarbonFibre desktop: the same one-file app in an Electron window, for macOS, Windows and Linux.
   The page is served from app://carbonfibre/ (a private, secure origin), so its storage and
   folder access work exactly as in Chromium. The page gets no Node access: only the four
   dialog calls in preload.js. */
"use strict";
const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, session, shell } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ORIGIN = "app://carbonfibre";
const PAGE = app.isPackaged
  ? path.join(process.resourcesPath, "page", "index.html")
  : path.join(__dirname, "page", "index.html");
const FILES = {
  "/": PAGE,
  "/index.html": PAGE,
  "/prompt.html": path.join(__dirname, "prompt.html"),
  "/prompt.js": path.join(__dirname, "prompt.js")
};

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true } }
]);

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;

function fromApp(e) {
  const url = (e.senderFrame && e.senderFrame.url) || "";
  return url.startsWith(ORIGIN + "/");
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 480,
    minHeight: 360,
    show: false,
    title: "CarbonFibre",
    backgroundColor: "#1a1a1f",
    autoHideMenuBar: process.platform !== "darwin",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: true
    }
  });
  win.once("ready-to-show", () => win.show());
  win.on("closed", () => { win = null; });

  const wc = win.webContents;
  /* links: web and mail links open in the system browser; the window itself never navigates away */
  wc.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  wc.on("will-navigate", (e, url) => {
    if (url.startsWith(ORIGIN + "/")) return;
    e.preventDefault();
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
  });
  /* the page asks before leaving while folder writes are still going (Electron would otherwise just refuse to close) */
  wc.on("will-prevent-unload", (e) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: "warning",
      buttons: ["Wait", "Close anyway"],
      defaultId: 0,
      cancelId: 0,
      message: "CarbonFibre is still saving to your folder.",
      detail: "Close now and the latest changes may not reach the disk."
    });
    if (choice === 1) e.preventDefault();
  });

  win.loadURL(ORIGIN + "/index.html");
}

/* ---- dialogs for the page (Dialogs.confirm / prompt / choose) ---- */
ipcMain.handle("cf:confirm", async (e, message) => {
  if (!fromApp(e)) return false;
  const r = await dialog.showMessageBox(BrowserWindow.fromWebContents(e.sender), {
    type: "question", buttons: ["OK", "Cancel"], defaultId: 0, cancelId: 1, message: String(message)
  });
  return r.response === 0;
});

ipcMain.handle("cf:choose", async (e, message, choices) => {
  if (!fromApp(e) || !Array.isArray(choices)) return null;
  const list = choices.map(String);
  const r = await dialog.showMessageBox(BrowserWindow.fromWebContents(e.sender), {
    type: "question", buttons: list.concat("Cancel"), cancelId: list.length, message: String(message), noLink: true
  });
  return r.response < list.length ? list[r.response] : null;
});

/* Electron has no text-input dialog, so a prompt is a small modal window of our own */
const prompts = new Map();   /* prompt window webContents id -> { message, value, resolve } */
ipcMain.handle("cf:prompt", (e, message, value) => {
  if (!fromApp(e)) return null;
  const parent = BrowserWindow.fromWebContents(e.sender);
  return new Promise((resolve) => {
    const p = new BrowserWindow({
      parent, modal: true, show: false, width: 460, height: 180, useContentSize: true,
      resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
      title: "CarbonFibre", backgroundColor: "#202027", autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, "prompt-preload.js"), contextIsolation: true, sandbox: true }
    });
    const id = p.webContents.id;
    let done = false;
    const finish = (v) => { if (done) return; done = true; prompts.delete(id); resolve(v); if (!p.isDestroyed()) p.close(); };
    prompts.set(id, { message: String(message), value: String(value == null ? "" : value), finish });
    p.on("closed", () => finish(null));
    p.webContents.on("will-navigate", (ev) => ev.preventDefault());
    p.loadURL(ORIGIN + "/prompt.html");
  });
});
ipcMain.handle("cf:prompt-init", (e) => {
  const p = prompts.get(e.sender.id);
  return p ? { message: p.message, value: p.value } : null;
});
ipcMain.on("cf:prompt-size", (e, h) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w || !prompts.has(e.sender.id)) return;
  w.setContentSize(460, Math.max(120, Math.min(600, Math.ceil(Number(h) || 180))));
  w.show();
});
ipcMain.on("cf:prompt-done", (e, v) => {
  const p = prompts.get(e.sender.id);
  if (p) p.finish(v == null ? null : String(v));
});

function buildMenu() {
  const mac = process.platform === "darwin";
  const template = [
    ...(mac ? [{ role: "appMenu" }] : []),
    { label: "File", submenu: [mac ? { role: "close" } : { role: "quit" }] },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }]),
        { type: "separator" },
        { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    { role: "windowMenu" }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on("second-instance", () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  protocol.handle("app", (req) => {
    const u = new URL(req.url);
    const file = u.host === "carbonfibre" ? FILES[u.pathname] : null;
    if (!file) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });

  /* what the app uses: folders, clipboard, timer notifications. Everything else is refused. */
  const allowed = new Set(["fileSystem", "clipboard-read", "clipboard-sanitized-write", "notifications"]);
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    cb(allowed.has(permission) && wc.getURL().startsWith(ORIGIN + "/"));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission, origin) => {
    return allowed.has(permission) && String(origin || "").startsWith(ORIGIN);
  });

  buildMenu();
  createWindow();
  app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("web-contents-created", (_e, wc) => {
  wc.on("will-attach-webview", (e) => e.preventDefault());
});
