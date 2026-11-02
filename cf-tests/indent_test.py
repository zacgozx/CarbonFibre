import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))   # the app under test
import json, sys
from playwright.sync_api import sync_playwright
path = sys.argv[1] if len(sys.argv) > 1 else CF
content = "# Notes\n  indented two\n    indented four\n\tindented tab\n- [ ] task\n  - nested bullet\nplain line"
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1200, "height": 700})
    pg.goto("file://" + path)
    pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-v1', s); }", json.dumps({"notes": [{"id": 1, "title": "Notes", "content": content}], "seq": 2}))
    pg.reload(); pg.wait_for_timeout(500)
    L = lambda: pg.evaluate("() => panes[0].lines.slice()")
    pg.locator(".pane-col .editor-inner > div").nth(2).click(); pg.wait_for_timeout(100)
    pg.keyboard.press("Control+a"); pg.keyboard.press("Shift+Tab"); pg.wait_for_timeout(150)
    print("  Ctrl+A, Shift+Tab:", L())
    print("  still highlighted:", pg.evaluate("() => [panes[0].allSelected, panes[0].selFrom, panes[0].selTo]"))
    b.close()
