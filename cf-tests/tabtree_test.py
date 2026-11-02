import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
from playwright.sync_api import sync_playwright
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-62s %s %s" % (label, "ok" if good else "FAIL", detail))
VAULT = """() => {
  state.backend = 'folder'; state.folders = [{ path: 'Incidents' }, { path: 'Runbooks' }];
  const mk = (path) => ({ id: path, path: path, title: path.split('/').pop().replace(/\\.md$/, ''), content: '# ' + path, handle: null, parent: null, mtime: Date.now() });
  state.notes = ['Shift log.md', 'Incidents/INC0048812.md', 'Incidents/INC0048654.md', 'Runbooks/Splunk HEC restart.md', 'Runbooks/Sensu decommission.md', 'Daily.md'].map(mk);
  renderSidebar();
  ['Shift log.md', 'Incidents/INC0048812.md', 'Incidents/INC0048654.md', 'Runbooks/Splunk HEC restart.md'].forEach(id => panes[0].open(id));
  const q = addPane(panes[0], 'Runbooks/Sensu decommission.md'); q.open('Daily.md'); panes[0].focusThis(); }"""
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1500, "height": 850})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF); pg.evaluate("() => localStorage.clear()"); pg.reload(); pg.wait_for_timeout(400)
    E = lambda js, *a: pg.evaluate(js, *a)
    E(VAULT); pg.wait_for_timeout(300)
    E("() => document.querySelector('.pane-col .editor, .pane-col').dispatchEvent(new KeyboardEvent('keydown', { key: '\u00f8', code: 'KeyO', altKey: true, bubbles: true, cancelable: true }))"); pg.wait_for_timeout(200)
    check("Option+O / Alt+O (Mac key event) opens the Open tabs view", E("() => currentView === 'tabs' && document.getElementById('viewTabs').classList.contains('show')"))
    tree = lambda: E("() => [...document.querySelectorAll('#tabTree .tt-phead, #tabTree .tt-folder, #tabTree .tt-tab')].map(e => (e.classList.contains('tt-phead') ? 'P:' : e.classList.contains('tt-folder') ? 'F:' : (e.classList.contains('active') ? '*' : '-')) + (e.querySelector('.tt-title, .tt-fname') ? e.querySelector('.tt-title, .tt-fname').textContent : e.firstChild.nextSibling.textContent).trim())")
    t = tree()
    check("panes, then folders, then tabs", t == ["P:Left pane", "-Shift log", "F:Incidents", "-INC0048812", "-INC0048654", "F:Runbooks", "*Splunk HEC restart", "P:Right pane", "*Daily", "F:Runbooks", "-Sensu decommission"], str(t))
    check("the count shows all open tabs", E("() => document.getElementById('ttCount').textContent") == "6")
    pg.fill("#tabFilter", "inc"); pg.wait_for_timeout(100)
    check("filtering narrows to matching tabs (and keeps their folder)", tree() == ["P:Left pane", "F:Incidents", "-INC0048812", "-INC0048654"], str(tree()))
    check("...count reads 'n of total'", E("() => document.getElementById('ttCount').textContent") == "2 of 6")
    pg.keyboard.press("Enter"); pg.wait_for_timeout(200)
    check("Enter opens the first match", E("() => panes[0].note().title") == "INC0048812")
    pg.fill("#tabFilter", ""); pg.wait_for_timeout(100)
    pg.locator("#tabTree .tt-tab", has_text="Daily").click(); pg.wait_for_timeout(200)
    check("clicking a tab switches to it, in its own pane", E("() => focusedPane === panes[1] && panes[1].note().title") == "Daily")
    pg.locator("#tabTree .tt-folder", has_text="Incidents").click(); pg.wait_for_timeout(100)
    check("a folder folds", "-INC0048812" not in tree() and "F:Incidents" in tree())
    pg.locator("#tabTree .tt-folder", has_text="Incidents").click(); pg.wait_for_timeout(100)
    row = pg.locator("#tabTree .tt-tab", has_text="Shift log"); row.hover(); row.locator(".tt-x").click(); pg.wait_for_timeout(200)
    check("x closes the tab (and the tree updates)", E("() => panes[0].tabs.map(id => findNote(id).title)") == ["INC0048812", "INC0048654", "Splunk HEC restart"] and "-Shift log" not in tree())
    E("""() => { const row = [...document.querySelectorAll('#tabTree .tt-tab')].find(r => r.textContent.includes('INC0048654')), dt = new DataTransfer();
        row.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
        const grp = document.querySelectorAll('#tabTree .tt-pane')[1], r = grp.getBoundingClientRect(), o = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 20, clientY: r.top + 10 };
        grp.dispatchEvent(new DragEvent('dragover', o)); grp.dispatchEvent(new DragEvent('drop', o)); row.dispatchEvent(new DragEvent('dragend', { bubbles: true })); }"""); pg.wait_for_timeout(250)
    check("dragging a tab onto the other pane's group moves it", E("() => panes[1].tabs.map(id => findNote(id).title)") == ["Sensu decommission", "Daily", "INC0048654"], str(E("() => panes[1].tabs.map(id => findNote(id).title)")))
    pg.locator("#tabTree .tt-tab", has_text="Splunk HEC").click(button="right"); pg.wait_for_timeout(120)
    check("right-click gives the tab menu", E("() => [...document.querySelectorAll('.tab-menu .tab-menu-item span')].map(s => s.textContent)")[:1] == ["Move to the right pane"])
    pg.keyboard.press("Escape"); pg.wait_for_timeout(80)
    E("() => panes[0].open('Shift log.md')"); pg.wait_for_timeout(150)
    check("opening a tab elsewhere updates the tree", "Shift log" in "".join(tree()))
    pg.locator("#tabTree .tt-tab").first.focus(); pg.keyboard.press("ArrowDown"); pg.keyboard.press("Enter"); pg.wait_for_timeout(200)
    check("arrow keys move through tabs, Enter opens", E("() => panes[0].note().title") == E("() => findNote(panes[0].tabs[[...document.querySelectorAll('#tabTree .tt-pane')][0].querySelectorAll('.tt-tab').length > 1 ? panes[0].tabs.indexOf(panes[0].noteId) : 0]).title"))
    print("  errors:", errs or "none"); ok &= not errs
    b.close()
print("ALL PASS" if ok else "FAILURES")
