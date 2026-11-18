import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
from playwright.sync_api import sync_playwright
# The Sketch button with no note in front of you (an empty pane, the board, the graph) starts a new
# sketch instead of doing nothing; with a note open it still inserts a board at the cursor.
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-66s %s %s" % (label, "ok" if good else "FAIL", detail))
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1300, "height": 800})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF)
    pg.evaluate("() => { localStorage.clear(); localStorage.setItem('carbonfibre-welcomed', '1'); }")
    pg.reload(); pg.wait_for_timeout(500)
    E = lambda js, *a: pg.evaluate(js, *a)
    check("start: no notes, nothing open", E("() => state.notes.length === 0 && !panes[0].note()"))
    E("() => document.getElementById('btnSketch').click()"); pg.wait_for_timeout(100)
    said = E("() => document.getElementById('saveState').textContent"); pg.wait_for_timeout(300)
    check("no note open: a new note holding a sketch, and the board opens on it", E("() => { const n = panes.map(q => q.note()).find(Boolean); return !!n && /^Sketch \\d{4}-/.test(n.title) && /```excalidraw/.test(n.content) && !!sk; }"), str(E("() => state.notes.map(n => n.title)")))
    check("...and it says why", "No note open" in said, said)
    E("() => { if (typeof closeSketch === 'function' && sk) closeSketch(); }"); pg.wait_for_timeout(200)
    E("() => { state.notes.push({ id: 900, title: 'Under', content: 'plain', path: null, handle: null, parent: null }); panes[0].open(900); tbOpenInPane(panes[0]); }"); pg.wait_for_timeout(300)
    E("() => document.getElementById('btnSketch').click()"); pg.wait_for_timeout(400)
    check("with the board in front, the note under it isn't touched", E("() => findNote(900).content") == "plain" and E("() => state.notes.filter(n => /^Sketch /.test(n.title)).length") == 2)
    E("() => { if (typeof closeSketch === 'function' && sk) closeSketch(); }"); pg.wait_for_timeout(200)
    E("() => { panes[0].open(900); panes[0].focusThis(); }"); pg.wait_for_timeout(200)
    E("() => document.getElementById('btnSketch').click()"); pg.wait_for_timeout(400)
    check("with a note open it still inserts a board into that note", "```excalidraw" in E("() => findNote(900).content") and E("() => state.notes.filter(n => /^Sketch /.test(n.title)).length") == 2)
    E("() => { if (typeof closeSketch === 'function' && sk) closeSketch(); }"); pg.wait_for_timeout(200)
    E("() => { window.__made = 0; window.sketchCanWrite = () => true; window.newSketchFile = () => { window.__made++; }; tbOpenInPane(panes[0]); }")
    E("() => document.getElementById('btnSketch').click()"); pg.wait_for_timeout(200)
    check("with a sketch folder, it's a new sketch file instead", E("() => window.__made") == 1)
    check("no errors", not errs, errs[:2])
    b.close()
print("ALL PASS" if ok else "FAILURES"); sys.exit(0 if ok else 1)
