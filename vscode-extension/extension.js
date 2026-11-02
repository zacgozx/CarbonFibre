"use strict";
/* CarbonFibre in VS Code: one webview panel running the same app as the website (media/carbonfibre.html,
   built from carbonfibre-src by build.py), working on a notes folder through host.js. */
const vscode = require("vscode");
const { Host, pageHtml } = require("./host");

const VIEW_TYPE = "carbonfibre";
let current = null;            /* { panel, host } while the panel is open: one CarbonFibre at a time */

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("carbonfibre.open", () => openPanel(context)),
    vscode.commands.registerCommand("carbonfibre.openFolder", async () => {
      const r = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: "Open notes folder" });
      if (r && r.length) openPanel(context, r[0], true);
    }),
    /* after a restart, VS Code brings the panel back */
    vscode.window.registerWebviewPanelSerializer(VIEW_TYPE, {
      deserializeWebviewPanel: async (panel) => { await setup(context, panel, await notesFolder(false)); }
    })
  );
}

/* the notes folder: the setting, else the first workspace folder; asks when there is neither */
async function notesFolder(ask) {
  const setting = String(vscode.workspace.getConfiguration("carbonfibre").get("notesFolder") || "").trim();
  const ws = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  if (setting) {
    if (/^([a-zA-Z]:[\\/]|\/|\\\\)/.test(setting)) return vscode.Uri.file(setting);
    if (ws) return vscode.Uri.joinPath(ws.uri, ...setting.split(/[\\/]+/).filter(Boolean));
  }
  if (ws) return ws.uri;
  if (!ask) return null;
  const r = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: "Open notes folder" });
  return r && r.length ? r[0] : null;
}

async function openPanel(context, folder, replace) {
  if (current && !replace) { current.panel.reveal(); return; }
  const uri = folder || await notesFolder(true);
  if (!uri) return;
  if (current) current.panel.dispose();
  const panel = vscode.window.createWebviewPanel(VIEW_TYPE, "CarbonFibre", vscode.ViewColumn.Active, {
    enableScripts: true,
    retainContextWhenHidden: true,           /* switching tabs keeps your place and anything unsaved */
    localResourceRoots: []                   /* the page is self-contained: it loads nothing */
  });
  await setup(context, panel, uri);
}

async function setup(context, panel, folder) {
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "icon.png");
  panel.webview.options = { enableScripts: true, localResourceRoots: [] };   /* again here: a panel restored after a restart needs them too */
  const host = new Host(vscode, (m) => panel.webview.postMessage(m), context.workspaceState);
  host.setVault(folder);
  current = { panel: panel, host: host };

  const disposables = [];
  disposables.push(panel.webview.onDidReceiveMessage((m) => host.handle(m)));
  /* hidden or closing: the page saves what it has now (its own save-everything path) */
  disposables.push(panel.onDidChangeViewState((e) => { if (!e.webviewPanel.visible) panel.webview.postMessage({ type: "flush" }); }));
  if (folder) {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, "**/*.{md,csv,excalidraw}"));
    let t = null;
    const changed = (uri) => { clearTimeout(t); t = setTimeout(() => host.changedOnDisk(uri), 400); };
    disposables.push(watcher, watcher.onDidChange(changed), watcher.onDidCreate(changed), watcher.onDidDelete(changed));
  }
  disposables.push(vscode.window.onDidChangeActiveColorTheme(() => panel.webview.postMessage({ type: "theme" })));
  panel.onDidDispose(() => {
    disposables.forEach((d) => d.dispose());
    if (current && current.panel === panel) current = null;
  });

  const appUri = vscode.Uri.joinPath(context.extensionUri, "media", "carbonfibre.html");
  const appHtml = new TextDecoder("utf-8").decode(await vscode.workspace.fs.readFile(appUri));
  panel.webview.html = pageHtml(appHtml, { storage: host.storage() });
  if (!folder) vscode.window.showInformationMessage("CarbonFibre: open a folder (or set carbonfibre.notesFolder) to keep notes as files. Until then they're kept in this workspace's storage.");
}

function deactivate() {}

module.exports = { activate, deactivate };
