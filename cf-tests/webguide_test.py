import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
from playwright.sync_api import sync_playwright
# Fixes from the modern web guidance scan: Enter while composing Japanese/Chinese/Korean text does
# nothing; questions with a few answers are a real dialog with buttons; scrollbars use the standard
# properties with a visible thumb; the theme follows a change made in another tab.
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-66s %s %s" % (label, "ok" if good else "FAIL", detail))
notes = [{"id": i, "title": t, "content": "# " + t} for i, t in enumerate(["Alpha", "Bravo"], 1)]
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1300, "height": 800})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF)
    pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-welcomed', '1'); localStorage.setItem('carbonfibre-v1', s); }", json.dumps({"notes": notes, "seq": 3}))
    pg.reload(); pg.wait_for_timeout(500)
    E = lambda js, *a: pg.evaluate(js, *a)
    print("TYPING WITH AN INPUT METHOD")
    E("() => palOpen('')"); pg.wait_for_timeout(150)
    pg.keyboard.type("Bravo"); pg.wait_for_timeout(150)
    E("() => document.getElementById('cmdIn').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }))"); pg.wait_for_timeout(150)
    check("Enter that confirms composed characters doesn't pick a result", E("() => document.getElementById('cmdPal').classList.contains('show') || getComputedStyle(document.getElementById('cmdPal')).display !== 'none'") and E("() => focusedPane.note().title") == "Alpha")
    E("() => document.getElementById('cmdIn').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true, cancelable: true }))"); pg.wait_for_timeout(150)
    check("...nor does Safari's late one (keyCode 229)", E("() => focusedPane.note().title") == "Alpha")
    E("() => document.getElementById('cmdIn').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }))"); pg.wait_for_timeout(200)
    check("an ordinary Enter still opens it (the same event, not composing)", E("() => focusedPane.note().title") == "Bravo")

    print("A QUESTION WITH A FEW ANSWERS")
    E("() => { window.__ans = 'pending'; Dialogs.choose('Which one?\\nSome detail.', ['keep', 'copy'], 'copy', { keep: 'Keep mine', copy: 'Keep both' }).then(v => window.__ans = v); }"); pg.wait_for_timeout(150)
    check("it's a modal dialog with one button per answer", E("() => { const d = document.querySelector('dialog.cf-ask'); return !!d && d.open && d.matches(':modal') && [...d.querySelectorAll('button')].map(b => b.textContent).join('|'); }") == "Keep mine|Keep both")
    check("the safe answer has the focus", E("() => document.activeElement.textContent") == "Keep both")
    check("it's named by its question", E("() => document.getElementById(document.querySelector('dialog.cf-ask').getAttribute('aria-labelledby')).textContent") == "Which one?")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(150)
    check("Esc gives the safe answer and removes it", E("() => window.__ans") == "copy" and E("() => !document.querySelector('dialog.cf-ask')"))
    E("() => { Dialogs.choose('Again?', ['keep', 'copy'], 'copy', { keep: 'Keep mine', copy: 'Keep both' }).then(v => window.__ans = v); }"); pg.wait_for_timeout(150)
    pg.get_by_role("button", name="Keep mine").click(); pg.wait_for_timeout(150)
    check("clicking an answer gives that answer", E("() => window.__ans") == "keep")

    print("SCROLLBARS, THEME")
    check("scrollbars use the standard colours", any(c in E("() => getComputedStyle(document.documentElement).scrollbarColor") for c in ("rgb(112, 112, 120)", "rgb(126, 126, 135)")) and "rgb" in E("() => getComputedStyle(document.documentElement).scrollbarColor"), E("() => getComputedStyle(document.documentElement).scrollbarColor"))
    start = E("() => document.documentElement.getAttribute('data-theme')")
    E("() => window.dispatchEvent(new StorageEvent('storage', { key: 'carbonfibre-theme', newValue: 'light' }))"); pg.wait_for_timeout(100)
    light = E("() => document.documentElement.getAttribute('data-theme')")
    E("() => window.dispatchEvent(new StorageEvent('storage', { key: 'carbonfibre-theme', newValue: 'dark' }))"); pg.wait_for_timeout(100)
    check("the theme follows a change made in another tab", light == "light" and E("() => document.documentElement.getAttribute('data-theme')") is None, str([start, light]))
    check("no errors", not errs, errs[:2])
    b.close()
print("ALL PASS" if ok else "FAILURES"); sys.exit(0 if ok else 1)
