import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
from playwright.sync_api import sync_playwright
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-64s %s %s" % (label, "ok" if good else "FAIL", detail))
CLUSTER = {"type": "excalidraw", "version": 2, "elements": [
  {"id": "a1", "type": "rectangle", "x": 0, "y": 0, "width": 120, "height": 60, "strokeColor": "#e2e3e5", "label": "Indexer"},
  {"id": "b2", "type": "rectangle", "x": 200, "y": 0, "width": 120, "height": 60, "strokeColor": "#e2e3e5", "label": "Search head"},
  {"id": "c3", "type": "arrow", "x": 120, "y": 30, "width": 80, "height": 0, "points": [[0, 0], [80, 0]], "fromId": "a1", "toId": "b2", "strokeColor": "#e8a06a"}]}
SMALL = {"type": "excalidraw", "version": 2, "elements": [{"id": "z9", "type": "rectangle", "x": 0, "y": 0, "width": 80, "height": 40, "strokeColor": "#8ab4e0", "label": "Cache"}]}
MOCK = """data => {
  function file(name, text) { return { kind: 'file', name, data: text || '', mtime: Date.now(),
      createWritable() { const f = this; let buf = ''; return Promise.resolve({ write(t) { buf += t; return Promise.resolve(); }, close() { f.data = buf; f.mtime = Date.now(); return Promise.resolve(); } }); },
      getFile() { const f = this; return Promise.resolve({ text: () => Promise.resolve(f.data), lastModified: f.mtime }); } }; }
  function dir(name) { return { kind: 'directory', name, kids: {},
      getDirectoryHandle(n, o) { if (!this.kids[n]) { if (!(o && o.create)) return Promise.reject(new DOMException('missing', 'NotFoundError')); this.kids[n] = dir(n); } return Promise.resolve(this.kids[n]); },
      getFileHandle(n, o) { if (!this.kids[n]) { if (!(o && o.create)) return Promise.reject(new DOMException('missing', 'NotFoundError')); this.kids[n] = file(n); } return Promise.resolve(this.kids[n]); },
      removeEntry(n) { delete this.kids[n]; return Promise.resolve(); },
      async *values() { for (const k in this.kids) yield this.kids[k]; } }; }
  const root = dir('vault'), put = (path, text) => { const parts = path.split('/'); let d = root; parts.slice(0, -1).forEach(p => { d.kids[p] = d.kids[p] || dir(p); d = d.kids[p]; }); d.kids[parts[parts.length - 1]] = file(parts[parts.length - 1], text); };
  put('sketch/network/splunk/cluster.excalidraw', data.cluster); put('sketch/templates/Cache-aside.excalidraw', data.small);
  put('Runbook.md', '# Runbook\\n\\n![[sketch/network/splunk/cluster.excalidraw]]\\n\\nend');
  put('Inline.md', '# Inline\\n\\n```excalidraw\\n' + data.small + '\\n```\\n\\nafter');
  window.__vault = root; window.__get = path => { let d = root; const parts = path.split('/'); for (const p of parts.slice(0, -1)) { d = d.kids[p]; if (!d) return null; } const f = d.kids[parts[parts.length - 1]]; return f ? f.data : null; };
  window.confirm = () => true; window.prompt = (m, v) => window.__promptAnswer || v;
  state.dirHandle = root; state.backend = 'folder'; return loadFolder(); }"""
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1400, "height": 900})
    pg.add_init_script("try { localStorage.setItem('carbonfibre-welcomed', '1'); } catch (e) {}")   # a returning user: no first-visit dialog
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF); pg.evaluate("() => localStorage.clear()"); pg.reload(); pg.wait_for_timeout(400)
    E = lambda js, *a: pg.evaluate(js, *a)
    E(MOCK, {"cluster": json.dumps(CLUSTER), "small": json.dumps(SMALL)}); pg.wait_for_timeout(500)
    print("STORAGE")
    check("drawings in nested sketch/ folders, named by their path", sorted(E("() => sketchFiles.map(f => f.path)")) == ["network/splunk/cluster", "templates/Cache-aside"])
    E("() => { const n = state.notes.find(n => n.title === 'Runbook'); panes[0].open(n.id); panes[0].deactivate(); }"); pg.wait_for_timeout(300)
    check("an embed in a note shows the drawing", E("() => { const c = panes[0].linesEl.querySelector('.skp-file'); return !!(c && c.querySelector('img.skp-img') && c.dataset.skfile === 'network/splunk/cluster'); }"))
    print("THE LIBRARY WINDOW")
    E("() => document.querySelector('.pane-col').dispatchEvent(new KeyboardEvent('keydown', { key: '\u02da', code: 'KeyK', altKey: true, bubbles: true, cancelable: true }))"); pg.wait_for_timeout(250)
    check("Alt+K / Option+K opens the library", E("() => !document.getElementById('sklWin').hidden"))
    tree = E("() => [...document.querySelectorAll('#sklWin .skl-node span')].map(s => s.textContent)")
    check("the folder tree goes all the way down", tree == ["sketch", "network", "splunk", "templates"], str(tree))
    pg.locator("#sklWin .skl-node", has_text="splunk").click(); pg.wait_for_timeout(200)
    check("a folder shows its drawings, with a thumbnail", E("() => [...document.querySelectorAll('#sklWin .skl-card[data-skfile]')].map(c => c.dataset.skfile)") == ["network/splunk/cluster"]
          and E("() => new Promise(r => setTimeout(() => r(!!document.querySelector('#sklWin .skl-thumb img')), 200))"))
    check("...and breadcrumbs back up", E("() => document.querySelector('#sklWin .skl-crumbs').textContent") == "sketch \u203a network \u203a splunk")
    pg.locator("#sklWin .skl-crumb", has_text="sketch").click(); pg.locator("#sklWin .skl-q").fill("cache"); pg.wait_for_timeout(150)
    check("search looks in every folder", E("() => [...document.querySelectorAll('#sklWin .skl-card[data-skfile]')].map(c => c.dataset.skfile)") == ["templates/Cache-aside"])
    pg.locator("#sklWin .skl-q").fill(""); pg.keyboard.press("Escape"); pg.wait_for_timeout(100)
    print("DROPPING INTO A NOTE")
    E("() => openSketchLibrary()"); pg.locator("#sklWin .skl-node", has_text="templates").click(); pg.wait_for_timeout(100)
    E("""() => { const card = document.querySelector('#sklWin .skl-card[data-skfile]'), dt = new DataTransfer();
        card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt })); window.__dt = dt; }"""); pg.wait_for_timeout(100)
    check("the library window gets out of the way when a drag starts", E("() => document.getElementById('sklWin').hidden"))
    E("""() => { const dt = window.__dt, line = panes[0].linesEl.children[0], r = line.getBoundingClientRect(), o = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 40, clientY: r.top + 8 };
        panes[0].editorEl.dispatchEvent(new DragEvent('dragover', o)); panes[0].editorEl.dispatchEvent(new DragEvent('drop', o)); }"""); pg.wait_for_timeout(300)
    check("dropping a drawing on a note embeds it below that line", E("() => panes[0].lines[1]") == "![[sketch/templates/Cache-aside.excalidraw]]", E("() => panes[0].lines.slice(0, 3)"))
    print("DROPPING INTO A SKETCH (A COPY)")
    E("() => { const n = state.notes.find(n => n.title === 'Inline'); panes[0].open(n.id); openSketch(panes[0], 2); }"); pg.wait_for_timeout(500)
    before = E("() => sk.elements.length")
    E("""() => { const dt = new DataTransfer(); dt.setData('text/x-cf-sketch', 'network/splunk/cluster');
        const r = skCanvas.getBoundingClientRect(), o = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + r.width * 0.7, clientY: r.top + r.height * 0.6 };
        skCanvas.dispatchEvent(new DragEvent('dragover', o)); skCanvas.dispatchEvent(new DragEvent('drop', o)); }"""); pg.wait_for_timeout(300)
    added = E("() => sk.elements.length") - before
    check("the drawing's shapes are copied in", added == 3, str(added))
    cp = E("() => { const ids = new Set(sk.elements.map(e => e.id)), arr = sk.elements.find(e => e.type === 'arrow' && e.fromId); return { fresh: !ids.has('a1') && !ids.has('b2'), linked: arr && ids.has(arr.fromId) && ids.has(arr.toId) && arr.fromId !== 'a1', sel: sk.sels.length }; }")
    check("...with new ids, the arrow still joining the copied boxes", cp["fresh"] and cp["linked"], str(cp))
    check("...selected, so it moves as one piece", cp["sel"] == 3)
    E("() => skUndo()"); pg.wait_for_timeout(100)
    check("one undo takes the whole drop back", E("() => sk.elements.length") == before)
    E("() => closeSketch()"); pg.wait_for_timeout(200)
    print("EDITING A FILE")
    E("() => openSketchFile('templates/Cache-aside')"); pg.wait_for_timeout(400)
    check("a sketch file opens in the board", E("() => !!sk && sk.file === 'templates/Cache-aside' && sk.elements.length === 1"))
    E("() => { skInsertDrawing([{ id: 'q1', type: 'rectangle', x: 0, y: 0, width: 50, height: 30, strokeColor: '#7fc08f', label: 'New' }], 300, 300); skPersist(); }"); pg.wait_for_timeout(300)
    check("saving writes back to the file", len(json.loads(E("() => __get('sketch/templates/Cache-aside.excalidraw')"))["elements"]) == 2)
    E("() => closeSketch()"); pg.wait_for_timeout(200)
    print("RENAME, MOVE, DELETE")
    E("() => sketchRename('network/splunk/cluster', 'network/splunk/cluster v2')"); pg.wait_for_timeout(400)
    check("renaming moves the file", E("() => __get('sketch/network/splunk/cluster v2.excalidraw') !== null && __get('sketch/network/splunk/cluster.excalidraw') === null"))
    check("...and rewrites the embed in the note", "![[sketch/network/splunk/cluster v2.excalidraw]]" in E("() => state.notes.find(n => n.title === 'Runbook').content"))
    E("() => sketchRename('network', 'infra', true)"); pg.wait_for_timeout(400)
    check("moving a folder moves what's in it, embeds follow", E("() => __get('sketch/infra/splunk/cluster v2.excalidraw') !== null") and "![[sketch/infra/splunk/cluster v2.excalidraw]]" in E("() => state.notes.find(n => n.title === 'Runbook').content"))
    E("() => sketchDelete('infra/splunk/cluster v2')"); pg.wait_for_timeout(400)
    E("() => { const n = state.notes.find(n => n.title === 'Runbook'); panes[0].open(n.id); panes[0].deactivate(); }"); pg.wait_for_timeout(200)
    check("deleting keeps a copy in the sketch folder's .trash", E("() => !!(__vault.kids.sketch.kids['.trash'] && Object.keys(__vault.kids.sketch.kids['.trash'].kids).length)") and "cluster v2" not in " ".join(E("() => sketchFiles.map(f => f.path)")))
    check("...and its embed says it's missing", "Missing sketch" in E("() => panes[0].linesEl.textContent"))
    print("MOVING SKETCHES OUT OF NOTES")
    E("() => migrateSketchesToFiles()"); pg.wait_for_timeout(600)
    inl = E("() => state.notes.find(n => n.title === 'Inline').content")
    check("an inline sketch becomes a file, the note gets an embed", "![[sketch/Inline/1.excalidraw]]" in inl and "```excalidraw" not in inl, inl[:80])
    check("...the file holds the drawing", len(json.loads(E("() => __get('sketch/Inline/1.excalidraw')"))["elements"]) == 1)
    check("...and the note was copied to .trash first", any("before sketch files" in k for k in E("() => Object.keys(__vault.kids['.trash'].kids)")))
    print("THE BOARD'S FILES TAB")
    E("() => { const n = state.notes.find(n => n.title === 'Runbook'); panes[0].open(n.id); }")
    E("() => openSketchFile('Inline/1')"); pg.wait_for_timeout(300)
    E("() => { skLibOpen(true); skLibTab('files'); }"); pg.wait_for_timeout(200)
    check("the board's library has a Files tab showing the same browser", E("() => document.querySelector('#skTemplates.show .skl-tree') !== null && document.querySelectorAll('#skLibrary [data-lib]')[1].textContent === 'Files'"))
    print("  errors:", errs or "none"); ok &= not errs
    b.close()
print("ALL PASS" if ok else "FAILURES")
