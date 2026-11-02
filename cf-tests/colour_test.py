import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
from playwright.sync_api import sync_playwright
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-62s %s %s" % (label, "ok" if good else "FAIL", detail))
content = "# Notes\nThe indexer is down today\n- first item\n- second item\n### Heading three\nLast line"
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1300, "height": 700})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF)
    pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-v1', s); }", json.dumps({"notes": [{"id": 1, "title": "Notes", "content": content}], "seq": 2}))
    pg.reload(); pg.wait_for_timeout(500)
    E = lambda js, *a: pg.evaluate(js, *a)
    L = lambda: E("() => panes[0].lines.slice()")
    def pick(colour):
        pg.keyboard.press("Alt+c"); pg.wait_for_timeout(120)
        pg.keyboard.type(" " + colour); pg.wait_for_timeout(80); pg.keyboard.press("Enter"); pg.wait_for_timeout(200)
    pg.locator(".pane-col .editor-inner > div").nth(1).click(); pg.wait_for_timeout(80)
    E("() => panes[0].ta.setSelectionRange(4, 14)")                    # "indexer is"
    pg.keyboard.press("Alt+c"); pg.wait_for_timeout(120)
    check("Alt+C opens the palette filtered to text colours", E("() => [...document.querySelectorAll('#cmdList .cmd-row .cmd-label')].map(e => e.textContent).every(t => t.startsWith('Text colour'))") and E("() => document.querySelectorAll('#cmdList .cmd-row').length") == E("() => TEXT_COLOURS.length + 1"))   # every palette text colour, plus remove
    pg.keyboard.press("Escape"); pg.wait_for_timeout(100)
    E("() => { panes[0].setActive(1, 4); panes[0].ta.setSelectionRange(4, 14); }")
    pick("red")
    check("the selected words are coloured (Obsidian-style span)", L()[1] == 'The <span style="color:red">indexer is</span> down today', L()[1])
    E("() => { panes[0].setActive(1, 30); panes[0].ta.setSelectionRange(30, 34); }")    # inside the span
    pick("blue")
    check("colouring coloured text switches its colour (no nesting)", L()[1] == 'The <span style="color:blue">indexer is</span> down today', L()[1])
    E("() => { panes[0].setActive(1, 30); panes[0].ta.setSelectionRange(30, 32); }")
    pick("remove")
    check("'remove' takes the colour off", L()[1] == "The indexer is down today", L()[1])
    pg.keyboard.press("Control+z"); pg.wait_for_timeout(150)
    check("undo brings the colour back", "color:blue" in L()[1], L()[1])
    E("() => panes[0].clearSelectAll()"); pg.locator(".pane-col .editor-inner > div").nth(2).click(); pg.keyboard.press("Home")
    pg.keyboard.press("Shift+ArrowDown"); pg.keyboard.press("Shift+End"); pg.wait_for_timeout(80)
    pick("green")
    check("a multi-line highlight: each line's text, after its bullet", L()[2:4] == ['- <span style="color:green">first item</span>', '- <span style="color:green">second item</span>'], str(L()[2:4]))
    E("() => panes[0].clearSelectAll()"); pg.locator(".pane-col .editor-inner > div").nth(5).click(); pg.wait_for_timeout(80)
    E("() => { const ta = panes[0].ta; ta.setSelectionRange(3, 3); }")
    pick("purple")
    check("nothing selected: the whole line's text", L()[5] == '<span style="color:purple">Last line</span>', L()[5])
    pg.locator(".pane-col .editor-inner > div").nth(0).click(); pg.wait_for_timeout(150)     # edit another line, so line 5 shows formatted
    shown = E("() => { const s = panes[0].linesEl.children[5].querySelector('.tc-purple'); return s && [s.textContent, getComputedStyle(s).color]; }")
    check("it shows coloured, tags hidden", shown and shown[0] == "Last line", str(shown))
    col = E("""() => { const el = panes[0].linesEl.children[5], sp = el.querySelector('.tc'), r = document.createRange(); r.setStart(sp.firstChild, 5); r.setEnd(sp.firstChild, 6);
        const b = r.getBoundingClientRect(); const c = rawCaretFromClick(panes[0].lines[5], panes[0].fmeta[5], el, b.left + 1, b.top + b.height / 2); return panes[0].lines[5].slice(c, c + 4); }""")
    check("clicking inside coloured text lands on the right character", col == "line", repr(col))
    if col != "line":
        print("   debug:", E("""() => { const el = panes[0].linesEl.children[5], sp = el.querySelector('.tc'), r = document.createRange(); r.setStart(sp.firstChild, 5); r.setEnd(sp.firstChild, 6);
            const b = r.getBoundingClientRect(), hit = document.elementFromPoint(b.left + 1, b.top + b.height / 2), cr = document.caretRangeFromPoint(b.left + 1, b.top + b.height / 2);
            return { rect: [Math.round(b.left), Math.round(b.top)], hit: hit && (hit.className || hit.tagName), caretIn: cr && cr.startContainer.textContent.slice(0, 20), vis: visibleOffsetFromPoint(el, b.left + 1, b.top + b.height / 2), raw: panes[0].lines[5], active: panes[0].activeLine }; }"""))
    print("  errors:", errs or "none"); ok &= not errs
    b.close()
print("ALL PASS" if ok else "FAILURES")
