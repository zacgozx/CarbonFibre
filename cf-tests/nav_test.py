import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))   # the app under test
import json, sys
from playwright.sync_api import sync_playwright
path = sys.argv[1] if len(sys.argv) > 1 else CF
content = "# Long note\n\n" + "\n".join("Line %d of the shift log, with some text to read." % i for i in range(1, 121))
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1200, "height": 700})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + path)
    pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-v1', s); }", json.dumps({"notes": [{"id": 1, "title": "Long", "content": content}], "seq": 2}))
    pg.reload(); pg.wait_for_timeout(500)
    E = lambda js, *a: pg.evaluate(js, *a)
    VIS = """i => { const p = panes[0], el = p.linesEl.children[i], sc = p.linesEl.closest('.editor') || p.linesEl.parentNode;
      const r = el.getBoundingClientRect(), v = sc.getBoundingClientRect(); return { top: Math.round(r.top - v.top), bottom: Math.round(v.bottom - r.bottom), visible: r.top >= v.top && r.bottom <= v.bottom }; }"""
    pg.locator(".pane-col .editor-inner > div").nth(3).click()
    for i in range(40): pg.keyboard.press("ArrowDown")
    pg.wait_for_timeout(150)
    a = E("() => panes[0].activeLine"); print("  after 40x Down: caret on line %d, %s" % (a, E(VIS, a)))
    for i in range(25): pg.keyboard.press("Shift+ArrowDown")
    pg.wait_for_timeout(150)
    sel = E("() => [panes[0].allSelected, panes[0].selFrom, panes[0].selTo, panes[0].selFocus]"); end = sel[3] if sel[0] else E("() => panes[0].activeLine")
    print("  after 25x Shift+Down: selection %s, its moving end line %d: %s" % (sel[:3], end, E(VIS, end)))
    for i in range(50): pg.keyboard.press("Shift+ArrowUp")
    pg.wait_for_timeout(150)
    sel = E("() => [panes[0].allSelected, panes[0].selFrom, panes[0].selTo, panes[0].selFocus]"); top = sel[3] if sel[0] else E("() => panes[0].activeLine")
    print("  after 50x Shift+Up: selection %s, its moving end line %d: %s" % (sel, top, E(VIS, top)))
    pg.keyboard.press("ArrowDown"); pg.wait_for_timeout(100)
    for i in range(70): pg.keyboard.press("ArrowDown")
    pg.wait_for_timeout(150)
    a = E("() => panes[0].activeLine"); print("  70x Down to the end: caret on line %d, %s" % (a, E(VIS, a)))
    print("  errors:", errs or "none")
    b.close()
