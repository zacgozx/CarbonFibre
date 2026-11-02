"use strict";
/* The extension's half of the host bridge (the page's half is carbonfibre-src/src/js/01-host-bridge.js).
   The page asks; this answers with vscode.workspace.fs and VS Code's own dialogs. The page can only
   reach folders this side handed it: the notes folder, and folders or files the person picked in a
   VS Code dialog. Every path is checked to stay inside one of those. */

const STORE_KEY = "carbonfibre.storage";
const LINK_SCHEMES = ["http:", "https:", "mailto:"];

class Host {
  /* vscode: the API (passed in, so tests can supply a stand-in); post: sends a message to the page;
     state: a Memento (workspaceState) for the page's localStorage */
  constructor(vscode, post, state) {
    this.vscode = vscode;
    this.post = post;
    this.state = state;
    this.roots = new Map();
    this.nextRoot = 1;
    this.vaultRoot = null;
    this.recentWrites = new Map();
  }

  addRoot(uri) {
    for (const [id, u] of this.roots) if (u.toString() === uri.toString()) return id;
    const id = "r" + this.nextRoot++;
    this.roots.set(id, uri);
    return id;
  }
  setVault(uri) { this.vaultRoot = uri ? this.addRoot(uri) : null; }

  /* a page path ("a/b/c.md") under a root, refused if it could step outside it */
  resolve(root, path) {
    const base = this.roots.get(root);
    if (!base) throw this.err("NotAllowedError", "Unknown folder");
    const segs = String(path || "").split("/").filter(function (s) { return s !== ""; });
    for (const s of segs) {
      if (s === "." || s === ".." || /[\\\0]/.test(s) || /^[a-zA-Z]:$/.test(s)) throw this.err("NotAllowedError", "Path not allowed: " + path);
    }
    return segs.length ? this.vscode.Uri.joinPath(base, ...segs) : base;
  }
  err(name, message) { const e = new Error(message); e.name = name; return e; }
  async stat(uri) {
    try { return await this.vscode.workspace.fs.stat(uri); } catch (e) { return null; }
  }
  isDir(st) { return !!st && (st.type & this.vscode.FileType.Directory) !== 0; }

  storage() { return Object.assign({}, this.state.get(STORE_KEY) || {}); }

  /* one message from the page; requests (with an id) get a reply */
  async handle(m) {
    if (!m || typeof m.op !== "string") return;
    if (m.id === undefined) { await this.notify(m); return; }
    try {
      const result = await this.request(m);
      this.post({ type: "reply", id: m.id, result: result === undefined ? null : result });
    } catch (e) {
      this.post({ type: "reply", id: m.id, error: { name: e.name || "Error", message: e.message || String(e) } });
    }
  }

  async notify(m) {
    const vs = this.vscode;
    if (m.op === "store.set" || m.op === "store.remove" || m.op === "store.clear") {
      const s = m.op === "store.clear" ? {} : this.storage();
      if (m.op === "store.set") s[String(m.key)] = String(m.value);
      if (m.op === "store.remove") delete s[String(m.key)];
      await this.state.update(STORE_KEY, s);
    } else if (m.op === "openExternal") {
      let uri = null;
      try { uri = vs.Uri.parse(String(m.url)); } catch (e) { uri = null; }
      if (uri && LINK_SCHEMES.indexOf(uri.scheme + ":") !== -1) await vs.env.openExternal(uri);
    } else if (m.op === "alert") {
      vs.window.showInformationMessage(String(m.message || ""));
    }
  }

  async request(m) {
    const vs = this.vscode, fs = vs.workspace.fs;
    switch (m.op) {
      case "vault": {
        if (!this.vaultRoot) return null;
        const u = this.roots.get(this.vaultRoot);
        return { root: this.vaultRoot, name: this.baseName(u) };
      }
      case "dir": {
        const uri = this.resolve(m.root, m.path), st = await this.stat(uri);
        if (st && !this.isDir(st)) throw this.err("TypeMismatchError", "Not a folder: " + m.path);
        if (!st) {
          if (!m.create) throw this.err("NotFoundError", "No folder " + m.path);
          await fs.createDirectory(uri);
        }
        return true;
      }
      case "file": {
        const uri = this.resolve(m.root, m.path), st = await this.stat(uri);
        if (st && this.isDir(st)) throw this.err("TypeMismatchError", "Not a file: " + m.path);
        if (!st) {
          if (!m.create) throw this.err("NotFoundError", "No file " + m.path);
          await fs.writeFile(uri, new Uint8Array(0));
        }
        return true;
      }
      case "list": {
        const uri = this.resolve(m.root, m.path);
        const items = await fs.readDirectory(uri);
        return items.map(([name, type]) => ({ name: name, kind: (type & vs.FileType.Directory) ? "directory" : "file" }));
      }
      case "read": {
        const uri = this.resolve(m.root, m.path), st = await this.stat(uri);
        if (!st) throw this.err("NotFoundError", "No file " + m.path);
        const data = await fs.readFile(uri);
        return { data: data, mtime: st.mtime };
      }
      case "write": {
        const uri = this.resolve(m.root, m.path);
        this.recentWrites.set(uri.toString(), Date.now());
        await fs.writeFile(uri, toBytes(m.data));
        const st = await this.stat(uri);
        return { mtime: st ? st.mtime : Date.now() };
      }
      case "remove": {
        const uri = this.resolve(m.root, m.path);
        if (!String(m.path || "").trim()) throw this.err("NotAllowedError", "Can't remove the folder itself");
        if (!(await this.stat(uri))) throw this.err("NotFoundError", "Nothing at " + m.path);
        this.recentWrites.set(uri.toString(), Date.now());
        await fs.delete(uri, { recursive: !!m.recursive, useTrash: false });
        return true;
      }
      case "pickFolder": {
        const r = await vs.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: "Use this folder" });
        if (!r || !r.length) return null;
        return { root: this.addRoot(r[0]), name: this.baseName(r[0]) };
      }
      case "pickSaveFile": {
        const name = String(m.suggestedName || "export").replace(/[\\/]/g, "-");
        const base = this.vaultRoot ? this.roots.get(this.vaultRoot) : undefined;
        const r = await vs.window.showSaveDialog({ defaultUri: base ? vs.Uri.joinPath(base, name) : undefined, saveLabel: "Save" });
        if (!r) return null;
        const parent = vs.Uri.joinPath(r, "..");
        return { root: this.addRoot(parent), path: this.baseName(r), name: this.baseName(r) };
      }
      case "confirm": {
        const pick = await vs.window.showWarningMessage(String(m.message || ""), { modal: true }, "OK");
        return pick === "OK";
      }
      case "choose": {
        const choices = (m.choices || []).map(String);
        const pick = await vs.window.showWarningMessage(String(m.message || ""), { modal: true }, ...choices.map(cap));
        return pick ? choices[choices.map(cap).indexOf(pick)] : null;
      }
      case "prompt": {
        const v = await vs.window.showInputBox({ prompt: String(m.message || ""), value: m.value == null ? "" : String(m.value), ignoreFocusOut: true });
        return v === undefined ? null : v;
      }
      default:
        throw this.err("NotSupportedError", "Unknown request " + m.op);
    }
  }

  /* a file changed in the notes folder: tell the page, unless the page made the change itself */
  changedOnDisk(uri) {
    const t = this.recentWrites.get(uri.toString());
    if (t && Date.now() - t < 3000) return false;
    this.post({ type: "changed" });
    return true;
  }

  baseName(uri) { const p = uri.path.replace(/\/+$/, ""); return p.slice(p.lastIndexOf("/") + 1) || p; }
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* bytes from the page: a Uint8Array, an ArrayBuffer, or (if the transport flattened it) an array or index-keyed object */
function toBytes(d) {
  if (d instanceof Uint8Array) return d;
  if (d instanceof ArrayBuffer) return new Uint8Array(d);
  if (Array.isArray(d)) return Uint8Array.from(d);
  if (d && Array.isArray(d.data)) return Uint8Array.from(d.data);
  if (d && typeof d === "object") return Uint8Array.from(Object.keys(d).sort((a, b) => a - b).map((k) => d[k]));
  if (typeof d === "string") return new TextEncoder().encode(d);
  return new Uint8Array(0);
}

/* the app's page, with the starting data put in front of its script: the page's localStorage as this
   workspace last left it. JSON in a non-script type is never run, so the page's CSP is unaffected. */
function pageHtml(appHtml, seed) {
  const json = JSON.stringify(seed).replace(/</g, "\\u003c");
  const tag = '<script type="application/json" id="cf-host">' + json + "</script>";
  const i = appHtml.indexOf("<body>");
  if (i === -1) throw new Error("CarbonFibre page has no <body>");
  return appHtml.slice(0, i + 6) + "\n" + tag + appHtml.slice(i + 6);
}

module.exports = { Host, pageHtml, toBytes, STORE_KEY };
