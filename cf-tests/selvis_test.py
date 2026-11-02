import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
from playwright.sync_api import sync_playwright
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-66s %s %s" % (label, "ok" if good else "FAIL", detail))
# On the line being edited, the visible text is a copy under an invisible text box: the highlight
# painted on the text box must be see-through, or highlighted words vanish (a light-mode bug once).
with sync_playwright() as p:
    b = p.chromium.launch()
    for scheme in ("light", "dark"):
        pg = b.new_page(viewport={"width": 1100, "height": 420}, color_scheme=scheme)
        pg.goto("file://" + CF)
        pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-v1', s); }", json.dumps({"notes": [{"id": 1, "title": "N", "content": "# N\n\nHey Matt this is in context to the following search."}], "seq": 2}))
        pg.reload(); pg.wait_for_timeout(400)
        pg.locator(".pane-col .editor-inner > div").nth(2).click(); pg.wait_for_timeout(100)
        r = pg.evaluate("""() => { const ta = panes[0].ta, cs = getComputedStyle(ta, '::selection'), bg = cs.backgroundColor, m = bg.match(/rgba?\\(([^)]+)\\)/);
            const a = m ? (m[1].split(',').length > 3 ? parseFloat(m[1].split(',')[3]) : 1) : 1;
            const page = getComputedStyle(document.documentElement, '::selection').backgroundColor; return { bg: bg, alpha: a, textColor: getComputedStyle(ta).color, page: page }; }""")
        check("%-5s: the editing line's highlight is see-through" % scheme, r["alpha"] < 0.6, r["bg"])
        check("%-5s: the page's own highlight is see-through too" % scheme, not r["page"].startswith("rgb(") or r["page"] == "rgba(0, 0, 0, 0)", r["page"])
        pg.close()
    b.close()
print("ALL PASS" if ok else "FAILURES")
