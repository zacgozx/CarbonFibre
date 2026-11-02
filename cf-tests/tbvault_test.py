import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
if not os.path.exists(CF): CF = "/mnt/user-data/outputs/CarbonFibre.html"
from playwright.sync_api import sync_playwright
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-62s %s %s" % (label, "ok" if good else "FAIL", detail))
MOCK = """() => {   /* an in-memory folder with the File System Access interface Edge provides */
  function file(name) { return { kind: 'file', name, data: '', mtime: Date.now(),
      createWritable() { const f = this; let buf = ''; return Promise.resolve({ write(t) { buf += t; return Promise.resolve(); }, close() { f.data = buf; f.mtime = Date.now(); return Promise.resolve(); } }); },
      getFile() { const f = this; return Promise.resolve({ text: () => Promise.resolve(f.data), lastModified: f.mtime }); } }; }
  function dir(name) { return { kind: 'directory', name, kids: {},
      getDirectoryHandle(n, o) { if (!this.kids[n]) { if (!(o && o.create)) return Promise.reject(new DOMException('missing', 'NotFoundError')); this.kids[n] = dir(n); } return Promise.resolve(this.kids[n]); },
      getFileHandle(n, o) { if (!this.kids[n]) { if (!(o && o.create)) return Promise.reject(new DOMException('missing', 'NotFoundError')); this.kids[n] = file(n); } return Promise.resolve(this.kids[n]); },
      async *values() { for (const k in this.kids) yield this.kids[k]; } }; }
  window.__vault = dir('vault'); state.backend = 'folder'; state.dirHandle = window.__vault; }"""
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1400, "height": 850})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF)
    pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-v1', s); }", json.dumps({"notes": [{"id": 1, "title": "INC0048812 Exchange node not reporting", "content": "# INC0048812 Exchange node not reporting"}, {"id": 2, "title": "Shift log", "content": "# Shift log"}], "seq": 3}))
    pg.reload(); pg.wait_for_timeout(500)
    E = lambda js, *a: pg.evaluate(js, *a)
    E(MOCK)
    print("SAVED INTO THE VAULT")
    E("() => { tbAdd('CHG0031204', 'Payroll downtime', 20); tbSave(); }"); pg.wait_for_timeout(800)
    v = E("() => { const d = __vault.kids['.carbonfibre']; return d && d.kids['taskboard.json'] ? JSON.parse(d.kids['taskboard.json'].data) : null; }")
    check("a change writes .carbonfibre/taskboard.json into the vault", v and any(t["id"] == "CHG0031204" for t in v["tasks"]), str(v and [t["id"] for t in v["tasks"]]))
    check("...with when it was saved", v and v.get("savedAt", 0) > 0)
    print("OPENING THE VAULT: THE NEWER COPY WINS")
    E("() => { const d = __vault.kids['.carbonfibre'], f = d.kids['taskboard.json'], v = JSON.parse(f.data); v.tasks.push({ uid: 'fromlaptop', id: 'INC0099999', type: 'inc', name: 'Added on the other laptop', noteId: null, mins: 0, est: 30, state: 'open', clearedAt: null }); v.savedAt = Date.now() + 60000; f.data = JSON.stringify(v); }")
    E("() => tbLoadVault()"); pg.wait_for_timeout(300)
    check("a newer vault copy replaces this one", E("() => tb.tasks.some(t => t.id === 'INC0099999')"))
    E("() => { const d = __vault.kids['.carbonfibre'], f = d.kids['taskboard.json'], v = JSON.parse(f.data); v.tasks = []; v.savedAt = 1; f.data = JSON.stringify(v); }")
    E("() => tbLoadVault()"); pg.wait_for_timeout(400)
    check("an older vault copy is replaced by this one", E("() => tb.tasks.length") >= 2 and len(json.loads(E("() => __vault.kids['.carbonfibre'].kids['taskboard.json'].data"))["tasks"]) >= 2)
    E("() => { delete __vault.kids['.carbonfibre']; }"); E("() => tbLoadVault()"); pg.wait_for_timeout(400)
    check("no copy in the vault yet: this one is written there", E("() => !!(__vault.kids['.carbonfibre'] && __vault.kids['.carbonfibre'].kids['taskboard.json'])"))
    print("DRAGGING A NOTE ONTO THE BOARD")
    E("() => { tb.tasks = []; tbSave(); tbShow(); renderSidebar(); }"); pg.wait_for_timeout(200)
    def drop_note(title, lane):
        E("""a => { const item = [...document.querySelectorAll('#notesList .side-item')].find(e => e.textContent.includes(a.title)), dt = new DataTransfer();
            item.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
            const L = document.querySelector('.tb.show [data-drop="' + a.lane + '"]'), r = L.getBoundingClientRect(), o = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 30, clientY: r.top + 120 };
            L.dispatchEvent(new DragEvent('dragover', o)); L.dispatchEvent(new DragEvent('drop', o)); item.dispatchEvent(new DragEvent('dragend', { bubbles: true })); }""", {"title": title, "lane": lane})
        pg.wait_for_timeout(200)
    drop_note("INC0048812", "open")
    t = E("() => tb.tasks.map(t => [t.id, t.name, t.state, t.noteId])")
    check("dropping a note on To do: a task with its ticket and name, linked to it", t == [["INC0048812", "Exchange node not reporting", "open", 1]], str(t))
    drop_note("INC0048812", "open")
    check("dropping the same note again doesn't add it twice", E("() => tb.tasks.length") == 1)
    drop_note("Shift log", "run")
    check("dropping on Working on starts its clock", E("() => tbRunning() && tbRunning().name") == "Shift log")
    print("  errors:", errs or "none"); ok &= not errs
    b.close()
print("ALL PASS" if ok else "FAILURES")
