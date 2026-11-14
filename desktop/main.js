/* CarbonFibre desktop: the same one-file app in an Electron window, for macOS, Windows and Linux.
   The page is served from app://carbonfibre/ (a private, secure origin), so its storage and
   folder access work exactly as in Chromium. The page gets no Node access: only the dialog and
   plugin calls in preload.js. Obsidian plugins (plugins/store.js) run inside the page; the page's
   Content-Security-Policy is widened for their code only here in the desktop app, never on the web,
   and still blocks every network request. */
"use strict";
const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, session, shell } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fsp = require("node:fs/promises");
const plugins = require("./plugins/store");

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

/* the page as served in the desktop app: its script lock also allows plugin code from
   app://carbonfibre/plugin-code/, and code that plugins build from strings (Obsidian allows this, and
   many plugins need it). Injected <script> tags and inline handlers stay blocked; the network too. */
async function pageResponse() {
  const html = await fsp.readFile(PAGE, "utf8");
  const out = html.replace(/(<meta http-equiv="Content-Security-Policy" content="[^"]*?script-src )/, "$1" + ORIGIN + "/plugin-code/ 'unsafe-eval' ");
  return new Response(out, { headers: { "content-type": "text/html; charset=utf-8" } });
}

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true } }
]);

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let pluginsOn = false;   /* any plugin enabled: links opened from the page are confirmed first */

/* With plugins running, a link opened from the page could carry note text out in its address,
   so the system browser only opens after the person says yes. */
function openExternalChecked(url) {
  if (!/^(https?|mailto):/i.test(url)) return;
  if (!pluginsOn) { shell.openExternal(url); return; }
  const shown = url.length > 300 ? url.slice(0, 300) + "\u2026" : url;
  dialog.showMessageBox(win, { type: "question", buttons: ["Open", "Cancel"], defaultId: 0, cancelId: 1,
    message: "Open this link in your browser?", detail: shown }).then((r) => { if (r.response === 0) shell.openExternal(url); });
}

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
    openExternalChecked(url);
    return { action: "deny" };
  });
  wc.on("will-navigate", (e, url) => {
    if (url.startsWith(ORIGIN + "/")) return;
    e.preventDefault();
    openExternalChecked(url);
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

/* ---- Obsidian plugins (plugins/store.js) ---- */
function plugHandle(name, fn) {
  ipcMain.handle("cf:plug:" + name, async (e, ...args) => {
    if (!fromApp(e)) throw new Error("Not allowed");
    return fn(e, ...args);
  });
}
plugHandle("list", () => plugins.list());
plugHandle("catalog", (_e, refresh) => plugins.catalog(!!refresh));
plugHandle("check", (_e, id) => plugins.check(String(id)));
plugHandle("install", (_e, id) => plugins.install(String(id)));
plugHandle("installFolder", async (e) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
    title: "Choose a plugin folder (it holds manifest.json and main.js)", properties: ["openDirectory"] });
  if (r.canceled || !r.filePaths.length) return null;
  return plugins.installFromDir(r.filePaths[0]);
});
plugHandle("importFiles", (_e, id, files) => plugins.place(String(id), {
  manifest: String(files && files.manifest || ""), main: String(files && files.main || ""),
  styles: files && files.styles != null ? String(files.styles) : null, data: files && files.data != null ? String(files.data) : null }));
plugHandle("uninstall", (_e, id) => plugins.uninstall(String(id)));
plugHandle("setEnabled", async (_e, id, on) => { const list = await plugins.setEnabled(String(id), !!on); pluginsOn = list.length > 0; return list; });
plugHandle("styles", (_e, id) => plugins.styles(String(id)));
plugHandle("loadData", (_e, id) => plugins.loadData(String(id)));
plugHandle("saveData", (_e, id, text) => plugins.saveData(String(id), String(text)));
plugHandle("fs", (_e, op, id, rel, text) => {
  const f = plugins.pluginFs[op];
  if (typeof f !== "function" || !Object.prototype.hasOwnProperty.call(plugins.pluginFs, op)) throw new Error("Unknown operation");
  return f(String(id), String(rel || ""), text);
});
plugHandle("openRepo", (_e, repo) => {
  if (/^[\w.-]+\/[\w.-]+$/.test(String(repo))) shell.openExternal("https://github.com/" + repo);
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
  protocol.handle("app", async (req) => {
    const u = new URL(req.url);
    if (u.host === "carbonfibre" && (u.pathname === "/" || u.pathname === "/index.html")) return pageResponse();
    const pc = u.host === "carbonfibre" && /^\/plugin-code\/([^/]+)\.js$/.exec(u.pathname);
    if (pc) {
      const code = await plugins.wrappedCode(decodeURIComponent(pc[1])).catch(() => null);
      return code == null ? new Response("Not found", { status: 404 })
        : new Response(code, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" } });
    }
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

  plugins.anyEnabled().then((on) => { pluginsOn = on; }).catch(() => {});
  buildMenu();
  createWindow();
  app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("web-contents-created", (_e, wc) => {
  wc.on("will-attach-webview", (e) => e.preventDefault());
});
