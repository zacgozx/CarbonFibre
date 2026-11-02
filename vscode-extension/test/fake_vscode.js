"use strict";
/* A stand-in for the parts of the vscode API host.js uses, backed by the real disk, with dialogs
   that answer from a script. Only for tests. */
const fs = require("fs"), path = require("path");
class Uri {
  constructor(scheme, p) { this.scheme = scheme; this.path = p; this.fsPath = p; }
  static file(p) { return new Uri("file", path.resolve(p)); }
  static parse(s) { const m = /^([a-zA-Z][\w+.-]*):(.*)$/.exec(s); if (!m) throw new Error("bad uri"); const u = new Uri(m[1].toLowerCase(), m[2]); u.raw = s; return u; }
  static joinPath(u, ...segs) { return new Uri(u.scheme, path.posix.normalize(path.posix.join(u.path, ...segs))); }
  toString() { return this.raw || this.scheme + "://" + this.path; }
}
const FileType = { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 };
function make() {
  const log = { info: [], external: [], asked: [] };
  const answers = { warning: [], input: [], open: [], save: [] };
  const take = (q) => (q.length ? q.shift() : undefined);
  const vscode = {
    Uri, FileType,
    workspace: { fs: {
      async stat(u) { const s = fs.statSync(u.path); return { type: s.isDirectory() ? FileType.Directory : FileType.File, mtime: s.mtimeMs, size: s.size }; },
      async readDirectory(u) { return fs.readdirSync(u.path, { withFileTypes: true }).map((d) => [d.name, d.isDirectory() ? FileType.Directory : FileType.File]); },
      async readFile(u) { return new Uint8Array(fs.readFileSync(u.path)); },
      async writeFile(u, data) { fs.mkdirSync(path.dirname(u.path), { recursive: true }); fs.writeFileSync(u.path, Buffer.from(data)); },
      async createDirectory(u) { fs.mkdirSync(u.path, { recursive: true }); },
      async delete(u, o) { fs.rmSync(u.path, { recursive: !!(o && o.recursive) }); }
    } },
    window: {
      async showWarningMessage(msg, opts, ...items) { log.asked.push({ msg, items }); return take(answers.warning); },
      async showInputBox(o) { log.asked.push({ prompt: o.prompt, value: o.value }); return take(answers.input); },
      async showInformationMessage(msg) { log.info.push(msg); },
      async showOpenDialog() { return take(answers.open); },
      async showSaveDialog() { return take(answers.save); }
    },
    env: { async openExternal(u) { log.external.push(u.toString()); return true; } }
  };
  const memento = { data: {}, get(k) { return this.data[k]; }, async update(k, v) { this.data[k] = v; } };
  return { vscode, log, answers, memento };
}
module.exports = { make, Uri };
