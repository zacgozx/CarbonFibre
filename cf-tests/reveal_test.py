import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
from playwright.sync_api import sync_playwright
# One rule for everything you click: if it's already open, that pane is shown (and its tab flashes);
# if it's a background tab, that pane switches to it; only otherwise does it open. Nothing opens twice,
# and clicking the board or graph button never closes them.
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-66s %s %s" % (label, "ok" if good else "FAIL", detail))
notes = [{"id": i, "title": t, "content": "# " + t + "\n\nSee [[Alpha]]"} for i, t in enumerate(["Alpha", "Bravo", "Charlie", "Delta"], 1)]
sheets = [{"id": "s1", "title": "Budget", "rows": [["a", "b"], ["1", "2"]]}]
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1500, "height": 850})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF)
    pg.evaluate("a => { localStorage.clear(); localStorage.setItem('carbonfibre-welcomed', '1'); localStorage.setItem('carbonfibre-v1', a[0]); localStorage.setItem('carbonfibre-sheets', a[1]); }",
                [json.dumps({"notes": notes, "seq": 5}), json.dumps(sheets)])
    pg.reload(); pg.wait_for_timeout(500)
    E = lambda js, *a: pg.evaluate(js, *a)
    # pane 0: Alpha (showing); pane 1: Charlie in the background, Bravo showing
    E("() => { panes[0].open(1); const q = addPane(panes[0], 3); q.open(2); q.focusThis(); }"); pg.wait_for_timeout(250)
    state = lambda: E("() => ({ shown: panes.map(q => q.type === 'note' && q.note() ? q.note().title : q.type), tabs: panes.map(q => q.tabs.map(id => findNote(id).title)), focus: panes.indexOf(focusedPane) })")
    click_note = lambda title, shift=False: E("a => { const it = [...document.querySelectorAll('#notesList .side-item')].find(x => x.querySelector('.side-item-title').textContent === a[0]); it.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: a[1] })); }", [title, shift])
    s0 = state()
    check("start: Alpha | Bravo (Charlie behind it), right pane focused", s0 == {"shown": ["Alpha", "Bravo"], "tabs": [["Alpha"], ["Charlie", "Bravo"]], "focus": 1}, str(s0))

    click_note("Alpha"); pg.wait_for_timeout(150)
    s = state()
    check("clicking a note open in the other pane shows that pane", s["focus"] == 0 and s["shown"] == ["Alpha", "Bravo"], str(s))
    check("...without adding it to the pane you were in", s["tabs"][1] == ["Charlie", "Bravo"], str(s["tabs"]))
    check("...and its tab flashes, so you see where", E("() => !!panes[0].tabsEl.querySelector('.tab.on.tab-reveal')"))

    click_note("Charlie"); pg.wait_for_timeout(150)
    s = state()
    check("a background tab in another pane: that pane switches to it", s["focus"] == 1 and s["shown"] == ["Alpha", "Charlie"] and s["tabs"][0] == ["Alpha"], str(s))

    click_note("Bravo", shift=True); pg.wait_for_timeout(150)
    check("Shift+click on an open note doesn't open a second copy", len(E("() => panes")) == 2 and state()["tabs"] == [["Alpha"], ["Charlie", "Bravo"]], str(state()))

    E("() => panes[0].focusThis()")
    click_note("Delta"); pg.wait_for_timeout(150)
    s = state()
    check("a note that isn't open opens in the pane you're in", s["shown"][0] == "Delta" and s["focus"] == 0 and s["tabs"][1] == ["Charlie", "Bravo"], str(s))

    E("() => { panes[1].focusThis(); const wl = panes[1].root.querySelector('[data-wikilink]'); wl && wl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); }"); pg.wait_for_timeout(200)
    s = state()
    check("a [[link]] to a note open elsewhere shows it there", s["focus"] == 0 and s["shown"][0] == "Alpha" and "Alpha" not in s["tabs"][1], str(s))

    print("SHEETS, BOARD, GRAPH")
    E("() => { panes[0].focusThis(); [...document.querySelectorAll('.sheet-item')].find(x => x.textContent.includes('Budget')).click(); }"); pg.wait_for_timeout(200)
    check("a sheet opens where you are", E("() => panes[0].type") == "sheet")
    E("() => { panes[1].focusThis(); [...document.querySelectorAll('.sheet-item')].find(x => x.textContent.includes('Budget')).click(); }"); pg.wait_for_timeout(200)
    check("clicking it again from the other pane shows the open one", E("() => [panes[0].type, panes[1].type, panes.indexOf(focusedPane)]") == ["sheet", "note", 0], str(E("() => [panes[0].type, panes[1].type, panes.indexOf(focusedPane)]")))
    E("() => document.getElementById('actBoard').click()"); pg.wait_for_timeout(250)
    board_at = E("() => panes.findIndex(q => q.type === 'taskboard')")
    check("the board button opens the board", board_at >= 0, str(board_at))
    E("() => document.getElementById('actBoard').click()"); pg.wait_for_timeout(200)
    check("clicking it again keeps it open and shows it (it used to close)", E("() => panes.findIndex(q => q.type === 'taskboard')") == board_at and E("() => panes.indexOf(focusedPane)") == board_at)
    E("() => { panes[1].focusThis(); document.getElementById('actGraph').click(); }"); pg.wait_for_timeout(250)
    E("() => document.getElementById('actGraph').click()"); pg.wait_for_timeout(150)
    check("the graph button opens the graph, and a second click keeps it open", E("() => state.graphOpen") is True)
    E("() => graphPane.tabsEl.querySelector('.tab-graph .tab-x').click()"); pg.wait_for_timeout(150)
    check("the Graph tab's \u00d7 closes it", E("() => state.graphOpen") is False and E("() => !document.querySelector('.tab-graph')"))
    print("SPLIT")
    n0 = E("() => panes.length")
    E("() => document.getElementById('btnDual').click()"); pg.wait_for_timeout(200)
    check("Split adds a pane; it never closes the one you're in", E("() => panes.length") == min(n0 + 1, 6), str([n0, E("() => panes.length")]))
    E("() => { while (panes.length < MAX_PANES) document.getElementById('btnDual').click(); document.getElementById('btnDual').click(); }"); pg.wait_for_timeout(200)
    check("...and at six panes it stays at six", E("() => panes.length") == 6)
    check("no errors", not errs, errs[:2])
    b.close()
print("ALL PASS" if ok else "FAILURES"); sys.exit(0 if ok else 1)
