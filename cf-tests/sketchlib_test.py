import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
from playwright.sync_api import sync_playwright
# The sketch board's library panel: tabs and search stay put when switching Shapes/Files; one search
# box serves both, keeping each tab's words; the Files tab doesn't say "Nothing matches" over its
# drawings; typing doesn't blank the thumbnails.
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-66s %s %s" % (label, "ok" if good else "FAIL", detail))
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1300, "height": 800})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF)
    pg.evaluate("() => { localStorage.clear(); localStorage.setItem('carbonfibre-welcomed','1'); }"); pg.reload(); pg.wait_for_timeout(500)
    E = lambda js, *a: pg.evaluate(js, *a)
    E("""() => { createNote(''); state.renamingId = null; renderSidebar(); insertSketch(); state.sketchHandle = { name: 'sketch copy' };
      const doc = JSON.stringify(skDoc([{ id: 'a', type: 'rectangle', x: 0, y: 0, width: 80, height: 50 }]));
      sketchFiles.length = 0; ['Network', 'Racks', 'templates/Box'].forEach(n => sketchFiles.push({ path: n + '.excalidraw', text: doc })); skLibOpen(true); }""")
    pg.wait_for_timeout(300)
    pos = lambda: E("() => [...document.querySelectorAll('#skLibrary [data-lib]')].map(b => Math.round(b.getBoundingClientRect().top)).concat(Math.round(document.getElementById('skLibSearch').getBoundingClientRect().top))")
    p1 = pos(); pg.fill("#skLibSearch", "data"); pg.wait_for_timeout(100)
    E("() => skLibTab('files')"); pg.wait_for_timeout(300)
    check("switching to Files: the tabs and the search box don't move", pos() == p1, str([p1, pos()]))
    check("the search box switches to the Files tab's own words", E("() => [document.getElementById('skLibSearch').placeholder, document.getElementById('skLibSearch').value]") == ["Find a drawing", ""])
    check("no 'Nothing matches' over the drawings", E("() => getComputedStyle(document.getElementById('skLibEmpty')).display") == "none")
    pg.wait_for_timeout(300)
    E("() => document.querySelectorAll('#skTemplates [data-thumb]').forEach(t => t.dataset.mark = '1')")
    has_img = E("() => [...document.querySelectorAll('#skTemplates [data-thumb]')].every(t => t.querySelector('img'))")
    pg.fill("#skLibSearch", "ra"); pg.wait_for_timeout(60)
    check("typing searches the drawings (every folder)", E("() => [...document.querySelectorAll('#skTemplates .skl-card[data-skfile]')].map(c => c.dataset.skfile)") == ["Racks.excalidraw"], str(E("() => [...document.querySelectorAll('#skTemplates .skl-card[data-skfile]')].map(c => c.dataset.skfile)")))
    check("...and the thumbnails show at once, not blank", has_img and E("() => [...document.querySelectorAll('#skTemplates [data-thumb]')].every(t => t.querySelector('img'))"))
    E("() => skLibTab('stencils')"); pg.wait_for_timeout(100)
    check("back to Shapes: its own search words come back", E("() => document.getElementById('skLibSearch').value") == "data" and pos() == p1)
    check("no errors", not errs, errs[:2])
    b.close()
print("ALL PASS" if ok else "FAILURES"); sys.exit(0 if ok else 1)
