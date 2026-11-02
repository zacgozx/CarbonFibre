import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))   # the app under test
import json, sys
from playwright.sync_api import sync_playwright
path = sys.argv[1] if len(sys.argv) > 1 else CF
content = "\n".join(["# Notes", "", "keep one", "remove two", "remove three", "remove four", "keep five", "", "source line A", "source line B"])
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-62s %s %s" % (label, "ok" if good else "FAIL", detail))
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1300, "height": 850}, permissions=["clipboard-read", "clipboard-write"])
    pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + path)
    pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-v1', s); }", json.dumps({"notes": [{"id": 1, "title": "Notes", "content": content}], "seq": 2}))
    pg.reload(); pg.wait_for_timeout(500)
    E = lambda js, *a: pg.evaluate(js, *a)
    ln = lambda i: pg.locator(".pane-col .editor-inner > div").nth(i)
    lines = lambda: E("() => panes[0].lines.slice()")
    def reset():
        E("c => { panes[0].lines = c.split('\\n'); panes[0].commit(true); panes[0].activeLine = null; panes[0].render(); }", content); pg.wait_for_timeout(100)
    def drag_select(a, z):
        s0 = pg.evaluate("""i => { const el = panes[0].linesEl.children[i], r = el.getBoundingClientRect(), cs = getComputedStyle(el); return [r.left + parseFloat(cs.paddingLeft) + 1, r.top + r.height / 2]; }""", a)
        z0 = pg.evaluate("""i => { const el = panes[0].linesEl.children[i], r = el.getBoundingClientRect(); return [r.right - 4, r.top + r.height / 2]; }""", z)
        pg.mouse.move(s0[0], s0[1]); pg.mouse.down()
        pg.mouse.move(z0[0], z0[1], steps=6); pg.mouse.up(); pg.wait_for_timeout(100)
    def clip(text): E("t => navigator.clipboard.writeText(t)", text); pg.wait_for_timeout(50)
    want = ["keep one", "PASTED X", "PASTED Y", "keep five"]
    # 1 drag-select then Ctrl+V
    clip("PASTED X\nPASTED Y"); drag_select(3, 5); pg.keyboard.press("Control+v"); pg.wait_for_timeout(200)
    check("drag-select, Ctrl+V: lines replaced by the clipboard", lines()[2:6] == want, str(lines()[2:6]))
    print("     focus after drag:", E("() => document.activeElement.tagName + '.' + document.activeElement.className"))
    reset()
    # 2 click a line, Shift+Down twice, Ctrl+V
    ln(3).click(); pg.keyboard.press("Home"); pg.keyboard.press("Shift+ArrowDown"); pg.keyboard.press("Shift+ArrowDown"); pg.keyboard.press("Shift+ArrowDown"); pg.wait_for_timeout(100)
    print("     after Shift+Down x2: allSelected=%s from=%s to=%s" % tuple(E("() => [panes[0].allSelected, panes[0].selFrom, panes[0].selTo]")))
    pg.keyboard.press("Control+v"); pg.wait_for_timeout(200)
    check("Shift+arrow select, Ctrl+V: lines replaced", lines()[2:6] == want, str(lines()[2:6]))
    reset()
    # 3 copy lines from the note itself, then select others and paste
    drag_select(8, 9); pg.keyboard.press("Control+c"); pg.wait_for_timeout(100)
    drag_select(3, 5); pg.keyboard.press("Control+v"); pg.wait_for_timeout(200)
    check("copy lines in the note, select others, Ctrl+V: replaced", lines()[2:6] == ["keep one", "source line A", "source line B", "keep five"], str(lines()[2:6]))
    reset()
    # 4 Ctrl+A then paste
    clip("ALL NEW"); ln(2).click(); pg.keyboard.press("Control+a"); pg.keyboard.press("Control+v"); pg.wait_for_timeout(200)
    check("Ctrl+A, Ctrl+V: whole note replaced", lines() == ["ALL NEW"], str(lines()[:3]))
    print("  errors:", errs or "none"); ok &= not errs
    b.close()
print("ALL PASS" if ok else "FAILURES")
