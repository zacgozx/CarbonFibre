import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
from playwright.sync_api import sync_playwright
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-66s %s %s" % (label, "ok" if good else "FAIL", detail))
DRAW = json.dumps({"type": "excalidraw", "version": 2, "elements": [{"id": "a1", "type": "rectangle", "x": 0, "y": 0, "width": 100, "height": 50, "strokeColor": "#e2e3e5", "label": "Box"}]})
SETUP = """data => {
  function file(name, text) { return { kind: 'file', name, data: text || '', mtime: Date.now(),
      createWritable() { const f = this; let buf = ''; return Promise.resolve({ write(t) { buf += t; return Promise.resolve(); }, close() { f.data = buf; f.mtime = Date.now(); return Promise.resolve(); } }); },
      getFile() { const f = this; return Promise.resolve({ text: () => Promise.resolve(f.data), lastModified: f.mtime }); } }; }
  function dir(name) { return { kind: 'directory', name, kids: {},
      getDirectoryHandle(n, o) { if (!this.kids[n]) { if (!(o && o.create)) return Promise.reject(new DOMException('missing', 'NotFoundError')); this.kids[n] = dir(n); } return Promise.resolve(this.kids[n]); },
      getFileHandle(n, o) { if (!this.kids[n]) { if (!(o && o.create)) return Promise.reject(new DOMException('missing', 'NotFoundError')); this.kids[n] = file(n); } return Promise.resolve(this.kids[n]); },
      removeEntry(n) { delete this.kids[n]; return Promise.resolve(); },
      async *values() { for (const k in this.kids) yield this.kids[k]; } }; }
  
  const mk = () => dir('root'), put = (root, path, text) => { const parts = path.split('/'); let d = root; parts.slice(0, -1).forEach(p => { d.kids[p] = d.kids[p] || dir(p); d = d.kids[p]; }); d.kids[parts[parts.length - 1]] = file(parts[parts.length - 1], text); };
  const mine = mk(); put(mine, 'network/splunk/cluster.excalidraw', data); put(mine, 'Quick box.excalidraw', data);
  const vault = mk(); put(vault, 'sketch/vault-only.excalidraw', data); put(vault, 'Note.md', '# Note\\n\\n![[sketch/network/splunk/cluster.excalidraw]]\\n');
  window.__mine = mine; window.__vault = vault;
  window.__get = (root, path) => { let d = root; const parts = path.split('/'); for (const p of parts.slice(0, -1)) { d = d.kids[p]; if (!d) return null; } const f = d.kids[parts[parts.length - 1]]; return f ? f.data : null; };
  window.showDirectoryPicker = () => Promise.resolve(mine);
  window.confirm = () => true; }"""
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1300, "height": 800})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF); pg.evaluate("() => localStorage.clear()")
    pg.evaluate("d => localStorage.setItem('carbonfibre-sketches', JSON.stringify({ 'Old one': { text: d, mtime: 1 } }))", DRAW)
    pg.reload(); pg.wait_for_timeout(400)
    E = lambda js, *a: pg.evaluate(js, *a)
    E(SETUP, DRAW)
    print("NO FOLDER YET (browser storage mode)")
    check("drawings in browser storage are not used as the library", E("() => sketchFiles.length") == 0)
    E("() => openSketchLibrary()"); pg.wait_for_timeout(150)
    check("the library asks you to choose a folder", "Choose the folder on your computer" in E("() => document.getElementById('sklWin').textContent"))
    E("() => sketchLibClose(); newSketchFile('')"); pg.wait_for_timeout(150)
    check("'New drawing' without a folder saves nothing to the browser", E("() => sketchFiles.length") == 0 and E("() => !document.getElementById('sklWin').hidden"))
    print("CHOOSING A FOLDER")
    pg.locator("#sklWin [data-skchoose]").first.click(); pg.wait_for_timeout(600)
    paths = sorted(E("() => sketchFiles.map(f => f.path)"))
    check("its drawings, subfolders included, become the library", "network/splunk/cluster" in paths and "Quick box" in paths, str(paths))
    check("drawings that were in browser storage are moved into it (asked once)", "Old one" in paths and E("() => __get(__mine, 'Old one.excalidraw')") is not None)
    check("...and browser storage is cleared of them", E("() => localStorage.getItem('carbonfibre-sketches')") is None)
    check("the library says where it reads from", "root" in E("() => document.querySelector('#sklWin .skl-where').textContent"))
    E("() => newSketchFile('network')"); pg.wait_for_timeout(400)
    check("new drawings are saved into the chosen folder", E("() => __get(__mine, 'network/Untitled sketch.excalidraw')") is not None)
    E("() => closeSketch()"); E("() => sketchDelete('Quick box')"); pg.wait_for_timeout(300)
    check("delete keeps a copy in the folder's .trash", E("() => !!(__mine.kids['.trash'] && Object.keys(__mine.kids['.trash'].kids).length) && __get(__mine, 'Quick box.excalidraw') === null"))
    print("WITH A VAULT TOO")
    E("() => { state.dirHandle = __vault; state.backend = 'folder'; return loadFolder(); }"); pg.wait_for_timeout(600)
    paths = sorted(E("() => sketchFiles.map(f => f.path)"))
    check("the chosen folder wins over the vault's sketch/", "network/splunk/cluster" in paths and "vault-only" not in paths, str(paths))
    E("() => { const n = state.notes.find(n => n.title === 'Note'); panes[0].open(n.id); panes[0].deactivate(); }"); pg.wait_for_timeout(300)
    check("an embed in a vault note finds the drawing in the chosen folder", E("() => !!panes[0].linesEl.querySelector('.skp-file img')"))
    E("() => forgetSketchFolder()"); pg.wait_for_timeout(600)
    check("Forget: back to the vault's sketch/ folder", sorted(E("() => sketchFiles.map(f => f.path)")) == ["vault-only"])
    print("  errors:", errs or "none"); ok &= not errs
    b.close()
print("ALL PASS" if ok else "FAILURES")
