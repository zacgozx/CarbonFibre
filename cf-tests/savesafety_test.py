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
  
  const root = dir('vault'), put = (path, text) => { const parts = path.split('/'); let d = root; parts.slice(0, -1).forEach(p => { d.kids[p] = d.kids[p] || dir(p); d = d.kids[p]; }); d.kids[parts[parts.length - 1]] = file(parts[parts.length - 1], text); };
  put('Note.md', '# Note\\nmine'); put('sheets/Hosts.csv', 'Host,CPU\\nidx01,40\\n'); put('sketch/Box.excalidraw', data);
  window.__vault = root;
  window.__f = path => { let d = root; const parts = path.split('/'); for (const p of parts.slice(0, -1)) d = d.kids[p]; return d.kids[parts[parts.length - 1]]; };
  window.__theirs = (path, text) => { const f = __f(path); f.data = text; f.mtime = Date.now() + 10000; };   /* changed by someone else */
  window.__prompts = []; window.__answer = 'keep'; window.prompt = (m, v) => { __prompts.push(m.split('\\n')[0]); return __answer; };
  window.alert = () => {};
  state.dirHandle = root; state.backend = 'folder'; return loadFolder(); }"""
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1300, "height": 800})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF); pg.evaluate("() => localStorage.clear()"); pg.reload(); pg.wait_for_timeout(400)
    E = lambda js, *a: pg.evaluate(js, *a)
    E(SETUP, DRAW); pg.wait_for_timeout(500)
    print("SHEETS")
    E("() => { const sh = sheets.find(s => s.title === 'Hosts'); sh.rows[1][1] = '41'; sheetDirty(sh); __theirs('sheets/Hosts.csv', 'Host,CPU\\nidx01,99\\n'); __answer = 'take'; flushSheets(); }"); pg.wait_for_timeout(500)
    check("a CSV changed on disk is not overwritten silently: you're asked", E("() => __prompts.length") == 1 and "Hosts.csv" in E("() => __prompts[0]"), str(E("() => __prompts")))
    check("'take' uses the file's version", E("() => sheets.find(s => s.title === 'Hosts').rows[1][1]") == "99" and E("() => __f('sheets/Hosts.csv').data").find("99") > 0)
    E("() => { const sh = sheets.find(s => s.title === 'Hosts'); sh.rows[1][1] = '42'; sheetDirty(sh); __theirs('sheets/Hosts.csv', 'Host,CPU\\nidx01,77\\n'); __answer = 'keep'; flushSheets(); }"); pg.wait_for_timeout(500)
    check("'keep' overwrites with yours", "42" in E("() => __f('sheets/Hosts.csv').data"))
    E("() => { const sh = sheets.find(s => s.title === 'Hosts'); sh.rows[1][1] = '43'; sheetDirty(sh); __theirs('sheets/Hosts.csv', 'Host,CPU\\nidx01,55\\n'); __answer = 'copy'; flushSheets(); }"); pg.wait_for_timeout(500)
    names = E("() => Object.keys(__vault.kids.sheets.kids)")
    check("'copy' saves yours alongside and shows theirs", any("conflict" in n for n in names) and E("() => sheets.find(s => s.title === 'Hosts').rows[1][1]") == "55", str(names))
    n0 = E("() => __prompts.length")
    E("() => { const sh = sheets.find(s => s.title === 'Hosts'); sh.rows[1][1] = '1'; sheetDirty(sh); flushSheets(); sh.rows[1][1] = '2'; sheetDirty(sh); flushSheets(); }"); pg.wait_for_timeout(600)
    check("two saves in a row: no false conflict from our own write", E("() => __prompts.length") == n0 and "idx01,2" in E("() => __f('sheets/Hosts.csv').data"))
    print("SKETCH FILES")
    E("() => openSketchFile('Box')"); pg.wait_for_timeout(300)
    E("() => { skInsertDrawing([{ id: 'n1', type: 'rectangle', x: 0, y: 0, width: 40, height: 20, strokeColor: '#7fc08f' }], 200, 200); __theirs('sketch/Box.excalidraw', JSON.stringify({ type: 'excalidraw', version: 2, elements: [] })); __answer = 'take'; skPersist(); }"); pg.wait_for_timeout(500)
    check("a sketch file changed on disk: you're asked", any("Box.excalidraw" in x for x in E("() => __prompts")))
    check("'take' reloads the board with the file's drawing", E("() => sk.elements.length") == 0)
    n1 = E("() => __prompts.length")
    E("() => { skInsertDrawing([{ id: 'n2', type: 'rectangle', x: 0, y: 0, width: 40, height: 20, strokeColor: '#7fc08f' }], 200, 200); skPersist(); skInsertDrawing([{ id: 'n3', type: 'rectangle', x: 0, y: 0, width: 40, height: 20, strokeColor: '#7fc08f' }], 300, 200); skPersist(); }"); pg.wait_for_timeout(600)
    check("rapid saves of a drawing: no false conflict, last one wins", E("() => __prompts.length") == n1 and len(json.loads(E("() => __f('sketch/Box.excalidraw').data"))["elements"]) == 2)
    E("() => closeSketch()"); pg.wait_for_timeout(200)
    print("NOTES (unchanged behaviour)")
    E("() => { const n = state.notes.find(n => n.title === 'Note'); n.content = '# Note\\nmine, edited'; __theirs('Note.md', '# Note\\ntheirs'); __answer = 'keep'; return writeNoteFile(n); }"); pg.wait_for_timeout(300)
    check("a note changed on disk still asks, and 'keep' writes yours", any("Note.md" in x for x in E("() => __prompts")) and "mine, edited" in E("() => __f('Note.md').data"))
    print("CLOSING THE BROWSER")
    fire = "() => { const ev = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(ev); return ev.defaultPrevented; }"
    pg.wait_for_timeout(400)
    check("everything saved: no 'Leave site?' prompt", E(fire) is False, str(E("() => [writesInFlight, Object.keys(dirty).length]")))
    E("() => { const n = state.notes.find(n => n.title === 'Note'); panes[0].open(n.id); markDirty(n); }")
    check("a note not yet written: the browser asks before leaving", E(fire) is True)
    pg.wait_for_timeout(800)
    E("() => { writesInFlight++; }")
    check("a write still in progress: the browser asks", E(fire) is True)
    E("() => { writesInFlight--; state.backend = 'local'; state.dirHandle = null; Object.keys(dirty).forEach(k => delete dirty[k]); }")
    check("browser storage (saves at once): no prompt", E(fire) is False)
    print("  errors:", errs or "none"); ok &= not errs
    b.close()
print("ALL PASS" if ok else "FAILURES")
