import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))   # the app under test
import json, sys
from playwright.sync_api import sync_playwright
path = sys.argv[1] if len(sys.argv) > 1 else CF
LINES = ["# Heading one", "## Heading two", "### Heading three", "Plain text with **bold** and *italic* and `code` and ==mark==",
         "- bullet item with [[Wiki link]]", "1. numbered item", "- [ ] task to do", "- [x] task done", "> a quote line", "Link https://example.com here #tag",
         "```C++", "int main() { return 0; }", "```", "```", "| Host | Status |", "| --- | --- |", "| idx01 | up |", "", "```mermaid", "graph TD", "```", "~~struck~~ and <u>u</u>"]
content = "\n".join(LINES)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1200, "height": 900}, color_scheme="dark")
    pg.goto("file://" + path)
    pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-v1', s); }", json.dumps({"notes": [{"id": 1, "title": "Align", "content": content}], "seq": 2}))
    pg.reload(); pg.wait_for_timeout(500)
    bad = []
    for i, raw in enumerate(LINES):
        if not raw: continue
        pg.evaluate("i => panes[0].setActive(i, panes[0].lines[i].length)", i); pg.wait_for_timeout(40)
        r = pg.evaluate("""() => { const p = panes[0], el = p.linesEl.children[p.activeLine], hl = el.querySelector('.ta-hl'), ta = p.ta;
          if (!hl) return null;
          /* where the visible copy puts the end of the text, against where the text box puts it */
          const rg = document.createRange(); rg.selectNodeContents(hl); const hr = rg.getBoundingClientRect();
          const m = document.createElement('span'), cs = getComputedStyle(ta);
          m.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:' + cs.font + ';letter-spacing:' + cs.letterSpacing;
          m.textContent = ta.value; document.body.appendChild(m); const w = m.getBoundingClientRect().width; m.remove();
          return { hl: hr.width, ta: w, text: ta.value }; }""")
        if r and abs(r["hl"] - r["ta"]) > 1.5: bad.append("%-28s copy %.0fpx vs text %.0fpx" % (repr(raw)[:28], r["hl"], r["ta"]))
    print("  lines whose visible copy doesn't line up with the text being edited: %s" % (len(bad) or "none"))
    for x in bad: print("   ", x)
    b.close()
