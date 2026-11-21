import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
from playwright.sync_api import sync_playwright
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-64s %s %s" % (label, "ok" if good else "FAIL", detail))
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1300, "height": 800})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF)
    pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-v1', s); }", json.dumps({"notes": [{"id": 1, "title": "N", "content": "# N"}], "seq": 2}))
    pg.reload(); pg.wait_for_timeout(400)
    E = lambda js, *a: pg.evaluate(js, *a)
    print("A FULL BROWSER STORAGE")
    E("""() => { window.__toasts = []; const orig = pushToastLike; window.pushToastLike = m => { __toasts.push(m); };
        Storage.prototype.__set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k !== '__probe') throw new DOMException('full', 'QuotaExceededError'); return this.__set(k, v); }; }""")
    E("() => { pinned['1'] = 1; savePins(); }"); E("() => { tbSave(); }"); pg.wait_for_timeout(700)
    E("() => { const sh = createSheet('S', [['a']]); flushSheets(); }"); pg.wait_for_timeout(200)
    check("saving into a full storage doesn't break anything", not errs, str(errs))
    toasts = E("() => __toasts.filter(t => t.startsWith('Browser storage is full'))")
    check("...you're told, once (not once per failed write)", len(toasts) == 1, str(len(toasts)))
    E("() => { panes[0].open(1); panes[0].setActive(0, 3); panes[0].ta.value += ' edited'; panes[0].ta.dispatchEvent(new InputEvent('input', { bubbles: true })); flushPersist(); }"); pg.wait_for_timeout(200)
    check("a note that can't be saved shows 'Save failed'", E("() => document.getElementById('saveState').textContent") == "Save failed", E("() => document.getElementById('saveState').textContent"))
    E("() => { Storage.prototype.setItem = Storage.prototype.__set; }")
    print("  errors:", errs or "none"); ok &= not errs
    b.close()
print("ALL PASS" if ok else "FAILURES")
