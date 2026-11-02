import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
from playwright.sync_api import sync_playwright
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-62s %s %s" % (label, "ok" if good else "FAIL", detail))
notes = [{"id": i, "title": t, "content": "# " + t} for i, t in enumerate(["Alpha", "Bravo", "Charlie", "Delta", "Echo"], 1)]
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1500, "height": 850})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF)
    pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-v1', s); }", json.dumps({"notes": notes, "seq": 6}))
    pg.reload(); pg.wait_for_timeout(400)
    E = lambda js, *a: pg.evaluate(js, *a)
    E("() => { [1, 2, 3].forEach(id => panes[0].open(id)); const q = addPane(panes[0], 4); q.open(5); panes[0].open(1); }"); pg.wait_for_timeout(300)
    tabs = lambda: E("() => panes.map(q => q.tabs.map(id => findNote(id).title))")
    shown = lambda: E("() => panes.map(q => q.type === 'note' && q.note() ? q.note().title : null)")
    check("start: two panes", tabs() == [["Alpha", "Bravo", "Charlie"], ["Delta", "Echo"]], str(tabs()))
    def drag_tab(from_pane, title, to_pane, before_title=None, onto_page=False):
        E("""a => { const src = panes[a.from].tabsEl, t = [...src.querySelectorAll('.tab[data-id]')].find(x => x.textContent.includes(a.title)), dt = new DataTransfer();
            t.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
            const dst = panes[a.to]; let target, x, y;
            if (a.page) { target = dst.root.querySelector('.editor') || dst.root; const r = target.getBoundingClientRect(); x = r.left + 100; y = r.top + 100; }
            else if (a.before) { target = [...dst.tabsEl.querySelectorAll('.tab[data-id]')].find(x => x.textContent.includes(a.before)); const r = target.getBoundingClientRect(); x = r.left + 4; y = r.top + 8; }
            else { target = dst.tabsEl; const tl = [...dst.tabsEl.querySelectorAll('.tab[data-id]')].pop(); const r = tl.getBoundingClientRect(); x = r.right + 30; y = r.top + 8; target = document.elementFromPoint(x, y) || dst.tabsEl; }
            const o = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y };
            target.dispatchEvent(new DragEvent('dragover', o)); window.__marks = document.querySelectorAll('.drop-before, .drop-after, .drop-into, .tab-drop-on').length;
            target.dispatchEvent(new DragEvent('drop', o)); t.dispatchEvent(new DragEvent('dragend', { bubbles: true })); }""",
          {"from": from_pane, "title": title, "to": to_pane, "before": before_title, "page": onto_page})
        pg.wait_for_timeout(250)
    print("DRAGGING")
    drag_tab(0, "Bravo", 1, before_title="Echo")
    check("a tab dragged onto the other bar lands where it's dropped", tabs() == [["Alpha", "Charlie"], ["Delta", "Bravo", "Echo"]], str(tabs()))
    check("...a marker showed where it would land", E("() => window.__marks") >= 1)
    check("...and it opens there", shown()[1] == "Bravo", str(shown()))
    drag_tab(1, "Echo", 0, onto_page=True)
    check("dropped on the other pane's page: added at the end", tabs() == [["Alpha", "Charlie", "Echo"], ["Delta", "Bravo"]], str(tabs()))
    drag_tab(0, "Echo", 0, before_title="Alpha")
    check("dragged along its own bar: reordered", tabs()[0] == ["Echo", "Alpha", "Charlie"], str(tabs()))
    print("RIGHT-CLICK MENU")
    pg.locator(".pane-col").nth(0).locator(".tab[data-id]", has_text="Charlie").click(button="right"); pg.wait_for_timeout(150)
    items = E("() => [...document.querySelectorAll('.tab-menu .tab-menu-item')].map(b => b.querySelector('span').textContent + (b.disabled ? ' (off)' : ''))")
    check("right-click offers move to the other pane, a new split, close", items == ["Move to the right pane", "Move to a new split", "Close"], str(items))
    pg.locator(".tab-menu-item", has_text="Move to the right pane").click(); pg.wait_for_timeout(250)
    check("'Move to the right pane' moves it", tabs() == [["Echo", "Alpha"], ["Delta", "Bravo", "Charlie"]], str(tabs()))
    pg.locator(".pane-col").nth(1).locator(".tab[data-id]", has_text="Delta").click(button="right"); pg.wait_for_timeout(150)
    pg.locator(".tab-menu-item", has_text="Move to a new split").click(); pg.wait_for_timeout(300)
    check("'Move to a new split' opens a third pane with it", tabs() == [["Echo", "Alpha"], ["Bravo", "Charlie"], ["Delta"]], str(tabs()))
    print("KEYBOARD")
    E("() => panes[0].focusThis()"); pg.locator(".pane-col").nth(0).locator(".tab[data-id]", has_text="Alpha").click(); pg.wait_for_timeout(100)
    pg.keyboard.press("Control+Alt+ArrowRight"); pg.wait_for_timeout(250)
    check("Ctrl+Alt+Right moves the current tab to the next pane", tabs() == [["Echo"], ["Bravo", "Charlie", "Alpha"], ["Delta"]], str(tabs()))
    pg.keyboard.press("Control+Alt+ArrowLeft"); pg.wait_for_timeout(250)
    check("Ctrl+Alt+Left moves it back", tabs() == [["Echo", "Alpha"], ["Bravo", "Charlie"], ["Delta"]], str(tabs()))
    print("LAST TAB, EDITS, RELOAD")
    drag_tab(2, "Delta", 1, before_title="Bravo")
    check("moving a pane's last tab closes that pane", tabs() == [["Echo", "Alpha"], ["Delta", "Bravo", "Charlie"]], str(tabs()))
    pg.locator(".pane-col").nth(0).locator(".tab[data-id]", has_text="Alpha").click(); pg.wait_for_timeout(100)
    pg.locator(".pane-col").nth(0).locator(".editor-inner > div").nth(0).click(); pg.keyboard.press("End"); pg.keyboard.type(" edited")
    drag_tab(0, "Alpha", 1)
    check("text typed just before the move is kept", E("() => state.notes.find(n => n.title === 'Alpha').content") == "# Alpha edited", E("() => state.notes.find(n => n.title === 'Alpha').content"))
    pg.wait_for_timeout(800); pg.reload(); pg.wait_for_timeout(600)
    check("the arrangement survives a reload", tabs() == [["Echo"], ["Delta", "Bravo", "Charlie", "Alpha"]], str(tabs()))
    print("  errors:", errs or "none"); ok &= not errs
    b.close()
print("ALL PASS" if ok else "FAILURES")
