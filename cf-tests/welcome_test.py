import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))   # the app under test
import json
from playwright.sync_api import sync_playwright
# First visit: the app asks where notes should live (a folder, or this browser). Browsers without the
# folder API get the reason instead of a button that fails. Returning visitors aren't asked again.
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-64s %s %s" % (label, "ok" if good else "FAIL", detail))
with sync_playwright() as p:
    b = p.chromium.launch()
    # ---- a browser with the folder API ----
    ctx = b.new_context(viewport={"width": 1280, "height": 800}); pg = ctx.new_page()
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF); pg.evaluate("() => localStorage.clear()"); pg.reload(); pg.wait_for_timeout(700)
    E = lambda js, *a: pg.evaluate(js, *a)
    win = ".nsw-win"
    check("a first visit opens the dialog", pg.locator(win).is_visible())
    check("focus starts on 'Choose a folder'", E("() => document.activeElement.dataset.nsw") == "folder")
    check("both choices are offered", pg.locator("[data-nsw]:not([disabled])").count() == 2)
    pg.keyboard.press("Tab"); pg.keyboard.press("Tab")
    check("Tab stays inside the dialog", E("() => !!document.activeElement.closest('.nsw-dialog')"))
    E("() => { window.__picked = 0; window.showDirectoryPicker = () => { window.__picked++; return Promise.reject(new Error('cancelled')); }; }")
    pg.click("[data-nsw=folder]"); pg.wait_for_timeout(200)
    check("'Choose a folder' opens the folder picker and closes the dialog", E("() => window.__picked") == 1 and not pg.locator(win).is_visible())
    pg.reload(); pg.wait_for_timeout(700)
    check("not asked again after a choice", not pg.locator(win).is_visible())
    pg.click("#btnFolder"); pg.wait_for_timeout(200)
    check("the status bar's Open folder goes straight to the picker", not pg.locator(win).is_visible())
    # someone with notes already in this browser is never interrupted
    E("() => { localStorage.clear(); localStorage.setItem('carbonfibre-v1', JSON.stringify({ notes: [{ id: 1, title: 'Old', content: 'x' }], seq: 2 })); }")
    pg.reload(); pg.wait_for_timeout(700)
    check("existing notes in this browser: no dialog", not pg.locator(win).is_visible())
    check("no page errors", not errs, str(errs[:2]))
    ctx.close()
    # ---- a browser without the folder API (Firefox, Safari, phones) ----
    ctx = b.new_context(viewport={"width": 390, "height": 800}); pg = ctx.new_page()
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.add_init_script("delete window.showDirectoryPicker; delete Window.prototype.showDirectoryPicker")
    pg.goto("file://" + CF); pg.evaluate("() => localStorage.clear()"); pg.reload(); pg.wait_for_timeout(700)
    E = lambda js, *a: pg.evaluate(js, *a)
    check("no folder API: the dialog still opens", pg.locator(win).is_visible())
    check("the folder choice is disabled, with the reason", pg.locator("[data-nsw=folder]").is_disabled() and "can’t open folders" in pg.locator(".nsw-why").inner_text())
    check("focus starts on 'Use browser storage'", E("() => document.activeElement.dataset.nsw") == "local")
    w = E("() => { const d = document.querySelector('.nsw-dialog').getBoundingClientRect(); return [d.left, d.right, innerWidth]; }")
    check("the dialog fits a phone screen", w[0] >= 0 and w[1] <= w[2], str(w))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(150)
    check("Escape closes it", not pg.locator(win).is_visible())
    check("Open folder shows on a narrow screen", pg.locator("#btnFolder").is_visible())
    pg.click("#btnFolder"); pg.wait_for_timeout(200)
    check("Open folder explains instead of throwing", pg.locator(win).is_visible())
    check("no page errors", not errs, str(errs[:2]))
    b.close()
print("ALL PASS" if ok else "FAILURES")
