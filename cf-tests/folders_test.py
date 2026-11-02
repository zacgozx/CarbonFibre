import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))   # the app under test
import json
from playwright.sync_api import sync_playwright
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-64s %s %s" % (label, "ok" if good else "FAIL", detail))
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1300, "height": 900}, color_scheme="dark")
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF); pg.wait_for_timeout(400)
    E = lambda js, *a: pg.evaluate(js, *a)
    # a vault opened as a folder: notes with paths, and the folders they live in
    E("""() => { state.backend = 'folder';
      state.folders = [{ path: 'Incidents' }, { path: 'Incidents/2026' }, { path: 'Runbooks' }, { path: 'Personal' }];
      const mk = (path, i) => ({ id: path, path: path, title: path.split('/').pop().replace(/\\.md$/, ''), content: '# x', handle: null, parent: null, mtime: i });
      state.notes = ['Incidents/INC1.md', 'Incidents/2026/INC2.md', 'Runbooks/Splunk restart.md', 'Runbooks/HEC.md', 'Personal/Ideas.md', 'Inbox.md'].map(mk);
      window.moveNote = function (id, dir) { const n = state.notes.find(x => x.id === id); const name = n.path.split('/').pop(); n.path = n.id = (dir ? dir + '/' : '') + name; renderSidebar(); };
      Object.keys(pinned).forEach(k => delete pinned[k]); renderSidebar(); }""")
    pg.wait_for_timeout(150)
    heads = lambda: E("() => [...document.querySelectorAll('#notesList .fold-head .fold-name')].map(e => e.textContent)")
    check("the folder tree shows", heads()[:3] == ["Incidents", "2026", "Personal"], str(heads()))
    print("4. PINNED FOLDERS")
    pin = pg.locator("#notesList .fold-head", has=pg.locator(".fold-name", has_text="Runbooks")).locator(".fold-pin")
    check("each folder has a pin button", pin.count() == 1)
    pin.click(); pg.wait_for_timeout(150)
    order = E("() => [...document.querySelectorAll('#notesList > *')].map(e => e.className.split(' ')[0] + ':' + (e.querySelector && e.querySelector('.fold-name') ? e.querySelector('.fold-name').textContent : e.textContent.trim().slice(0, 14)))")
    check("the pinned folder moves under Pinned, at the top", order[0].startswith("pin-head") and "Runbooks" in order[1], str(order[:3]))
    inside = E("() => [...document.querySelectorAll('#notesList .pin-folders .side-item')].map(e => e.textContent.trim())")
    check("...with its notes inside it", any("HEC" in t for t in inside) and any("Splunk restart" in t for t in inside), str(inside))
    check("...and it's not repeated further down", E("() => [...document.querySelectorAll('#notesList > .fold-head .fold-name')].map(e => e.textContent)").count("Runbooks") == 0)
    pg.locator("#notesList .fold-head", has=pg.locator(".fold-name", has_text="2026")).locator(".fold-pin").click(); pg.wait_for_timeout(150)
    names = E("() => [...document.querySelectorAll('#notesList .pin-folders > .fold-head .fold-name')].map(e => e.textContent)")
    check("a nested folder pinned shows its full path (Incidents/2026)", "Incidents/2026" in names, str(names))
    pg.reload(); pg.wait_for_timeout(400)
    check("pins are remembered", E("() => isFolderPinned('Runbooks') && isFolderPinned('Incidents/2026')"))
    print("2. DRAG HIGHLIGHT")
    E("""() => { state.backend = 'folder'; state.folders = [{ path: 'Incidents' }, { path: 'Runbooks' }];
      const mk = (path, i) => ({ id: path, path: path, title: path.split('/').pop().replace(/\\.md$/, ''), content: '# x', handle: null, parent: null, mtime: i });
      state.notes = ['Incidents/INC1.md', 'Runbooks/HEC.md', 'Inbox.md'].map(mk);
      window.moveNote = function (id, dir) { const n = state.notes.find(x => x.id === id); n.path = n.id = (dir ? dir + '/' : '') + n.path.split('/').pop(); renderSidebar(); };
      Object.keys(pinned).forEach(k => delete pinned[k]); renderSidebar(); }""")
    pg.wait_for_timeout(150)
    src = pg.locator("#notesList .side-item", has_text="Inbox").first
    dst = pg.locator("#notesList .fold-head", has=pg.locator(".fold-name", has_text="Runbooks")).first
    src.drag_to(dst); pg.wait_for_timeout(200)
    check("dragging a note onto a folder moves it", E("() => state.notes.some(n => n.path === 'Runbooks/Inbox.md')"))
    check("...and leaves nothing highlighted afterwards", E("() => document.querySelectorAll('.side-list.drop-root, .fold-head.drop').length") == 0)
    print("  errors:", errs or "none"); ok &= not errs
    b.close()
print("ALL PASS" if ok else "FAILURES")
