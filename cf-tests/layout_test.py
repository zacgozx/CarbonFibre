import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
from playwright.sync_api import sync_playwright
# The movable layout: split down, a tab dropped on a pane's edge (after a short hold) splits it,
# floating panes, a note popped out into its own window that stays in step with this one, the sidebar
# on the right, all of it back after a reload, and "Reset the layout". Plus diagrams and the network.
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-66s %s %s" % (label, "ok" if good else "FAIL", detail))
notes = [{"id": i, "title": t, "content": "# " + t + "\n\nbody " + t + ("\n\n[[Alpha]]" if t != "Alpha" else "")} for i, t in enumerate(["Alpha", "Bravo", "Charlie", "Delta"], 1)]
notes.append({"id": 5, "title": "Charts", "content": "```mermaid\npie title Pets\n  \"Dogs\" : 3\n  \"Cats\" : 2\n```\n\n```mermaid\nsequenceDiagram\n  Alice->>Bob: Hi\n```\n\n```mermaid\nflowchart TD\n  A --> B\n```\n\n```mermaid\ngantt\n  title x\n```"})
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1400, "height": 850}); pg = ctx.new_page()
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF)
    pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-welcomed', '1'); localStorage.setItem('carbonfibre-v1', s); }", json.dumps({"notes": notes, "seq": 6}))
    pg.reload(); pg.wait_for_timeout(500)
    E = lambda js, *a: pg.evaluate(js, *a)
    cols = lambda: E("() => [...document.querySelectorAll('#workarea > .pane-stack')].map(s => [...s.querySelectorAll(':scope > .pane-col')].map(c => { const q = panes.find(p => p.root === c); return q.note() ? q.note().title : '-'; }))")
    E("() => openInPane(1, panes[0])"); pg.wait_for_timeout(100)

    pg.keyboard.down("Alt"); pg.locator("#btnDual").click(); pg.keyboard.up("Alt"); pg.wait_for_timeout(150)
    check("Alt+click on Split splits down: two panes in one column", cols() == [["Alpha", "Alpha"]], str(cols()))
    E("() => { panes[1].open(2); splitPane(panes[1], 'right', 3); }"); pg.wait_for_timeout(150)
    check("split right of the lower pane makes a new column", cols() == [["Alpha", "Bravo"], ["Charlie"]], str(cols()))
    check("the lower pane is under the upper one", E("() => panes[1].root.getBoundingClientRect().top > panes[0].root.getBoundingClientRect().bottom - 2"))

    print("DROPPING A TAB ON AN EDGE")
    E("() => { panes[2].open(4); }"); pg.wait_for_timeout(100)
    drag = """a => { const [from, to, fx, fy, wait] = a, col = panes[to].root, r = col.getBoundingClientRect();
      const dt = new DataTransfer(); dt.setData('text/x-cf-tab', JSON.stringify({ pane: from, id: '4' }));
      const at = { clientX: r.left + r.width * fx, clientY: r.top + r.height * fy, bubbles: true, cancelable: true, dataTransfer: dt };
      const target = document.elementFromPoint(at.clientX, at.clientY);
      target.dispatchEvent(new DragEvent('dragover', at));
      return new Promise(res => setTimeout(() => { target.dispatchEvent(new DragEvent('dragover', at));
        const shown = document.querySelector('.split-hint') ? document.querySelector('.split-hint').dataset.side : null;
        target.dispatchEvent(new DragEvent('drop', at)); document.dispatchEvent(new DragEvent('dragend', { bubbles: true })); res(shown); }, wait)); }"""
    n0 = E("() => panes.length")
    quick = E(drag, [2, 0, 0.5, 0.97, 50])
    check("a quick drop near the edge moves the tab (no split without the hold)", quick is None and E("() => panes.length") == n0, str([quick, E("() => panes.length")]))
    E("() => { panes[2].open(4); }"); pg.wait_for_timeout(50)
    held = E(drag, [2, 0, 0.5, 0.97, 420])
    check("held near the bottom edge: the hint shows, the drop splits down", held == "down" and E("() => panes.length") == n0 + 1, str([held, E("() => panes.length")]))
    check("...with the tab in the new pane", "Delta" in cols()[0], str(cols()))

    print("FLOATING")
    E("() => floatPane(panes[panes.length - 1], true)"); pg.wait_for_timeout(100)
    fl = E("() => { const q = panes[panes.length - 1], r = q.root.getBoundingClientRect(), w = document.getElementById('workarea').getBoundingClientRect(); return { on: q.root.classList.contains('floating'), inside: r.right <= w.right + 1 && r.left >= w.left - 1 }; }")
    check("Float lifts a pane over the others, inside the window", fl["on"] and fl["inside"], str(fl))
    bar = pg.locator(".pane-col.floating .pane-bar"); bb = bar.bounding_box()
    before = E("() => panes[panes.length - 1].floating.x")
    pg.mouse.move(bb["x"] + 180, bb["y"] + 18); pg.mouse.down(); pg.mouse.move(bb["x"] + 80, bb["y"] + 60, steps=5); pg.mouse.up()
    check("dragging its bar moves it", E("() => panes[panes.length - 1].floating.x") < before - 50, str([before, E("() => panes[panes.length - 1].floating.x")]))

    print("SIDEBAR AND MEMORY")
    head = pg.locator("#viewNotes .side-head .side-title"); hb = head.bounding_box()
    pg.mouse.move(hb["x"] + 5, hb["y"] + 5); pg.mouse.down(); pg.mouse.move(1200, hb["y"] + 5, steps=8); pg.mouse.up(); pg.wait_for_timeout(100)
    check("dragging the sidebar's title past the middle docks it on the right", E("() => document.body.classList.contains('side-right') && document.getElementById('side').getBoundingClientRect().left > 700"))
    E("() => saveSession()")
    shape = cols(); pg.reload(); pg.wait_for_timeout(900)
    check("after a reload: the same columns and rows", cols() == shape, str([shape, cols()]))
    check("...the floating pane floats again", E("() => panes.some(q => q.floating && q.root.classList.contains('floating'))"))
    check("...and the sidebar is still on the right", E("() => document.body.classList.contains('side-right')"))
    E("() => resetLayout()"); pg.wait_for_timeout(150)
    check("Reset the layout: one pane, sidebar on the left", E("() => panes.length") == 1 and not E("() => document.body.classList.contains('side-right')"))

    print("POP OUT")
    E("() => { openInPane(2, panes[0]); openInPane(1, panes[0], { here: true }); }"); pg.wait_for_timeout(100)
    with ctx.expect_page() as pi:
        E("() => PopOut.open(panes[0])")
    pop = pi.value; pop.on("pageerror", lambda e: errs.append("popout: " + str(e)))
    pop.wait_for_timeout(900)
    pv = pop.evaluate("() => ({ title: document.title, text: panes[0].note() && panes[0].note().content, bare: document.body.classList.contains('cf-popout') && getComputedStyle(document.querySelector('.side')).display === 'none' })")
    check("the note opens in its own window, just the note", pv["title"].startswith("Alpha") and pv["text"].startswith("# Alpha") and pv["bare"], str(pv))
    check("...and moves out of the pane it was in", "1" not in E("() => panes[0].tabs.map(String)"), str(E("() => panes[0].tabs")))
    pop.evaluate("() => { const q = panes[0]; q.setActive(2, q.lines[2].length); }"); pop.keyboard.type(" typed there"); pop.wait_for_timeout(700)
    check("typing there saves here", E("() => findNote(1).content").endswith("body Alpha typed there"), E("() => findNote(1).content"))
    E("() => { const n = findNote(1); n.content += '\\nadded here'; markDirty(n); }")
    pop.evaluate("() => panes[0].deactivate()"); pg.wait_for_timeout(600)
    check("an edit here shows there", pop.evaluate("() => findNote(1).content").endswith("added here"))
    check("that window never writes storage", pop.evaluate("() => { localStorage.setItem('cf-x', '1'); return true; }") and E("() => localStorage.getItem('cf-x')") is None)
    pop.evaluate("() => openInPane(2)"); pg.wait_for_timeout(200)
    check("a link opened there opens here", E("() => panes[0].note().title") == "Bravo")
    E("() => openInPane(1)"); pg.wait_for_timeout(100)
    check("opening a popped-out note here goes to its window instead of a second copy", E("() => panes.every(q => !q.tabs.some(t => String(t) === '1'))"))
    print("POP OUT: DRAG A TAB OUT OF THE WINDOW")
    E("() => openInPane(3, panes[0])"); pg.wait_for_timeout(100)
    out_js = """a => { const t = [...panes[0].tabsEl.querySelectorAll('.tab[data-id]')].find(x => x.dataset.id === '3');
      const dt = new DataTransfer(); t.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      t.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt, screenX: a[0], screenY: a[1] })); }"""
    E(out_js, [E("() => window.screenX + window.outerWidth / 2"), E("() => window.screenY + window.outerHeight / 2")]); pg.wait_for_timeout(300)
    check("a tab let go inside the window doesn't pop out", len(ctx.pages) == 2)
    with ctx.expect_page() as pi2:
        E(out_js, [E("() => window.screenX + window.outerWidth + 200"), E("() => window.screenY + 200")])
    pop2 = pi2.value; pop2.wait_for_timeout(900)
    check("a tab let go outside the window comes out into its own window", pop2.evaluate("() => document.body.classList.contains('cf-popout') && panes[0].note() && panes[0].note().title") == "Charlie")
    check("...and leaves the pane", "3" not in E("() => panes[0].tabs.map(String)"))
    pop2.close(); pg.wait_for_timeout(300)

    print("POP OUT: THE MAIN WINDOW RELOADED OR CLOSED")
    E("() => flushPersist()"); pg.reload(); pg.wait_for_timeout(200)
    pop.evaluate("() => { const q = panes[0]; q.setActive(2, q.lines[2].length); }"); pop.keyboard.type(" during reload"); pop.wait_for_timeout(3500)
    check("typed while the main window reloaded: saved once it's back", "during reload" in E("() => findNote(1).content"), E("() => findNote(1).content")[-60:])
    check("...and the two are in touch again (no warning bar)", pop.evaluate("() => !document.getElementById('popOffline')"))
    E("() => flushPersist()"); pg.wait_for_timeout(100)
    check("...and it was saved to storage", "during reload" in E("() => JSON.parse(localStorage.getItem('carbonfibre-v1')).notes.find(n => n.id === 1).content"))
    pg2 = ctx.new_page(); pg2.goto("about:blank")
    pg.close(); pop.wait_for_timeout(1800)
    bar = pop.evaluate("() => { const b = document.getElementById('popOffline'); return b ? b.textContent : null; }")
    check("main window closed: a bar says changes aren't saved, with Copy", bar and "closed" in bar and "Copy this note" in bar, str(bar))
    pop.close()
    pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); pg.goto("file://" + CF); pg.wait_for_timeout(700)
    E = lambda js, *a: pg.evaluate(js, *a)
    pg.wait_for_timeout(100)
    E("() => openInPane(1)"); pg.wait_for_timeout(100)
    check("once its window is closed, it opens here again", E("() => panes[0].note().title") == "Alpha")

    print("DIAGRAMS AND THE NETWORK")
    E("() => openInPane(5, panes[0], { here: true })"); pg.wait_for_timeout(400)
    kinds = E("() => [...document.querySelectorAll('.mmd')].map(x => x.classList.contains('mmd-err') ? 'error' : (x.querySelector('img').naturalWidth > 50 ? 'drawn' : 'blank'))")
    check("pie, sequence and flowchart are drawn under their code; gantt says it can't", kinds == ["drawn", "drawn", "drawn", "error"], str(kinds))
    check("Edit as sketch only where there's a sketch form (not pie or sequence)", E("() => [...document.querySelectorAll('.mmd')].map(x => !!x.querySelector('[data-mermaid]'))") == [False, False, True, False])
    pg.locator(".mmd img").first.click(); pg.wait_for_timeout(300)
    check("clicking a diagram opens it full window", E("() => !!document.querySelector('.mmd-full')"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(100)
    check("Esc closes it", E("() => !document.querySelector('.mmd-full')"))
    E("() => openGraph()"); pg.wait_for_timeout(500)
    check("the graph opens as the Network", E("() => document.getElementById('graphTitle').textContent") == "Network")
    pg.fill("#graphFind", "char"); pg.press("#graphFind", "Enter"); pg.wait_for_timeout(200)
    check("Find a note selects the best match", E("() => graphSel && graphSel.title") == "Charlie", str(E("() => graphSel && graphSel.title")))
    check("no errors", not errs, errs[:2])
    b.close()
print("ALL PASS" if ok else "FAILURES"); sys.exit(0 if ok else 1)
