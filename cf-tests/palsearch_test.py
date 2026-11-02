import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
from playwright.sync_api import sync_playwright
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-64s %s %s" % (label, "ok" if good else "FAIL", detail))
content = "# Notes\nThe indexer is down today\n- first item\n- second item\nLast line"
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1300, "height": 700}, color_scheme=os.environ.get("CF_SCHEME", "light"))
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF)
    pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-v1', s); }", json.dumps({"notes": [{"id": 1, "title": "Notes", "content": content}, {"id": 2, "title": "Colour ideas", "content": "# Colour ideas"}], "seq": 3}))
    pg.reload(); pg.wait_for_timeout(500)
    E = lambda js, *a: pg.evaluate(js, *a)
    L = lambda: E("() => panes[0].lines.slice()")
    pg.locator(".pane-col .editor-inner > div").nth(1).click(); pg.wait_for_timeout(100)
    print("CMD+P AND OPTION+C")
    pg.keyboard.press("Meta+p"); pg.wait_for_timeout(120)
    pg.keyboard.type("colour"); pg.wait_for_timeout(120)
    rows = E("() => [...document.querySelectorAll('#cmdList .cmd-row .cmd-label')].map(e => e.textContent)")
    check("Cmd+P 'colour': matching notes first, then the colour commands", rows[:1] == ["Colour ideas"] and any(r.startswith("Text colour:") for r in rows[1:]), str(rows[:4]))
    pg.fill("#cmdIn", "text colour"); pg.wait_for_timeout(120)
    rows = E("() => [...document.querySelectorAll('#cmdList .cmd-row .cmd-label')].map(e => e.textContent)")
    check("Cmd+P 'text colour' (no > needed) lists the colour commands", rows and all(r.startswith("Text colour:") for r in rows), str(rows[:3]))
    pg.fill("#cmdIn", "text color"); pg.wait_for_timeout(120)
    rows = E("() => [...document.querySelectorAll('#cmdList .cmd-row .cmd-label')].map(e => e.textContent)")
    check("...'text color' (US spelling) finds them too", any(r.startswith("Text colour:") for r in rows), str(rows[:3]))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(100)
    E("() => document.querySelector('.pane-col textarea, .line-ta').dispatchEvent(new KeyboardEvent('keydown', { key: '\u00e7', code: 'KeyC', altKey: true, bubbles: true, cancelable: true }))"); pg.wait_for_timeout(150)
    check("Option+C on a Mac (types \u00e7) opens the colour list", E("() => pal.open && document.getElementById('cmdIn').value") == ">Text colour")
    print("  errors:", errs or "none"); ok &= not errs
    b.close()
print("ALL PASS" if ok else "FAILURES")

