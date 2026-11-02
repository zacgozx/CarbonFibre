import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))   # the app under test
import json
from playwright.sync_api import sync_playwright
# Any screen: on a phone the side panel starts closed and gets out of the way; a wide table scrolls
# sideways with its columns lined up instead of breaking every word; on a very large screen the
# note's text grows a little and sits in a readable column. A laptop is unchanged.
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-64s %s %s" % (label, "ok" if good else "FAIL", detail))
WIDE = "| " + " | ".join("Column %d" % k for k in range(1, 9)) + " |\n|" + "---|" * 8 + "\n| " + " | ".join("value %d" % k for k in range(1, 9)) + " |\n"
NOTES = [{"id": 1, "title": "Welcome", "content": "# Welcome\n\n| Name | Value | Notes |\n|---|---|---|\n| a | 1 | long text |\n\n" + WIDE + "\nSome text.\n"},
         {"id": 2, "title": "Other", "content": "# Other\n\nback to [[Welcome]]\n"}]
def page(b, w, h, touch=False):
    pg = b.new_page(viewport={"width": w, "height": h}, has_touch=touch)
    # the notes are in place before the app's own script runs, so nothing it saves at startup can race them
    seed = json.dumps(json.dumps({"notes": NOTES, "seq": 3}))
    pg.add_init_script("try { localStorage.setItem('carbonfibre-welcomed', '1'); localStorage.setItem('carbonfibre-v1', %s); } catch (e) {}" % seed)
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF); pg.wait_for_timeout(700)
    pg.evaluate("() => panes[0].open(1)"); pg.wait_for_timeout(300)
    return pg, errs
side_open = lambda pg: pg.evaluate("() => !document.getElementById('side').classList.contains('side-closed')")
with sync_playwright() as p:
    b = p.chromium.launch()
    print("PHONE (390 x 800)")
    pg, errs = page(b, 390, 800, touch=True)
    E = lambda js, *a: pg.evaluate(js, *a)
    check("the side panel starts closed", not side_open(pg))
    check("nothing is wider than the screen", E("() => document.documentElement.scrollWidth <= innerWidth"))
    pg.click("#btnSidebar"); pg.wait_for_timeout(200)
    check("the menu button opens it, over the editor", side_open(pg) and E("() => getComputedStyle(document.getElementById('side')).position") == "absolute")
    pg.locator("#notesList .side-item[data-nid]", has_text="Other").click(); pg.wait_for_timeout(300)
    check("picking a note opens it and closes the panel", not side_open(pg) and E("() => panes[0].note().title") == "Other")
    pg.click("#btnSidebar"); pg.wait_for_timeout(200)
    pg.mouse.click(370, 400); pg.wait_for_timeout(200)
    check("tapping the editor closes it", not side_open(pg))
    E("() => panes[0].open(1)"); pg.wait_for_timeout(300)
    rows = E("""() => [...document.querySelectorAll('.ln-trow')].map(r => ({ w: Math.round(r.getBoundingClientRect().width), h: Math.round(r.getBoundingClientRect().height),
        cells: [...r.querySelectorAll('.tcell')].map(c => Math.round(c.getBoundingClientRect().left)) }))""")
    small, wide = rows[:2], rows[2:]
    check("a short header doesn't break mid-word ('Name' on one line)", small[0]["h"] < 40, str(small[0]))
    check("a wide table's rows are all the same width", len({r["w"] for r in wide}) == 1, str([r["w"] for r in wide]))
    check("...its columns line up row to row", all(r["cells"] == wide[0]["cells"] for r in wide))
    ed = E("() => { const e = panes[0].root.querySelector('.editor'); return [e.scrollWidth, e.clientWidth]; }")
    check("...and the editor scrolls sideways to show it", ed[0] > ed[1], str(ed))
    check("no page errors", not errs, str(errs[:2]))
    pg.close()
    print("LAPTOP (1400 x 900)")
    pg, errs = page(b, 1400, 900)
    E = lambda js, *a: pg.evaluate(js, *a)
    check("the side panel is open and beside the editor", side_open(pg) and E("() => getComputedStyle(document.getElementById('side')).position") != "absolute")
    pg.locator("#notesList .side-item[data-nid]", has_text="Other").click(); pg.wait_for_timeout(300)
    check("picking a note leaves it open", side_open(pg))
    check("the editor's text is the usual 15px", E("() => getComputedStyle(panes[0].root.querySelector('.editor')).fontSize") == "15px")
    check("no page errors", not errs, str(errs[:2]))
    pg.close()
    print("4K AT 100% (3840 x 2160)")
    pg, errs = page(b, 3840, 2160)
    E = lambda js, *a: pg.evaluate(js, *a)
    fs = E("() => parseFloat(getComputedStyle(panes[0].root.querySelector('.editor')).fontSize)")
    check("the editor's text is larger (at most 19px)", 15 < fs <= 19, str(fs))
    col = E("() => { const i = panes[0].root.querySelector('.editor-inner').getBoundingClientRect(), e = panes[0].root.querySelector('.editor').getBoundingClientRect(); return [Math.round(i.width), Math.round(e.width), Math.round(i.left - e.left), Math.round(e.right - i.right)]; }")
    check("the note sits in a centred column, not edge to edge", col[0] < col[1] * 0.7 and abs(col[2] - col[3]) < 4, str(col))
    check("no page errors", not errs, str(errs[:2]))
    pg.close()
    b.close()
print("ALL PASS" if ok else "FAILURES")
