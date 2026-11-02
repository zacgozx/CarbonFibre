import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
OLD = os.environ.get("CF_OLD")      # optional: a previous build to compare the board's text with
from playwright.sync_api import sync_playwright
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-64s %s %s" % (label, "ok" if good else "FAIL", detail))
BOARD = """() => { const M = 60e3, d0 = new Date(); d0.setHours(0, 0, 0, 0);
  tb.tasks = []; const a = tbAdd('INC0048812', 'Exchange', 45); a.mins = 50; const c = tbAdd('CHG0031204', 'Payroll', 90); c.mins = 125;
  const w = tbAdd('RITM0098233', 'Access', 15); w.state = 'held'; w.mins = 7;
  timeLog.length = 0; timeLog.push({ task: 'INC0048812 x', start: d0.getTime() + 9 * 3600e3, end: d0.getTime() + 9 * 3600e3 + 65 * M, actual: 65 * M });
  tbSave(); tb.view = 'dash'; tbShow(); tbRenderAll(); }"""
TEXT = "() => [...document.querySelectorAll('.tb.show .tbd-kpi b, .tb.show .tbd-time, .tb.show .tbd-legend b, .tb.show .tbd-day b')].map(e => e.textContent).concat((tb.view = 'board', tbRenderAll(), [...document.querySelectorAll('.tb.show .tb-cardtop .t')].map(e => e.textContent)))"
def board_text(path):
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1500, "height": 900})
        pg.goto("file://" + path)
        pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-v1', s); }", json.dumps({"notes": [{"id": 1, "title": "N", "content": "# N"}], "seq": 2}))
        pg.reload(); pg.wait_for_timeout(400); pg.evaluate(BOARD); pg.wait_for_timeout(300)
        t = pg.evaluate(TEXT); b.close(); return t
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1300, "height": 800})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF)
    pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-v1', s); }", json.dumps({"notes": [{"id": 1, "title": "N", "content": "# N"}], "seq": 2}))
    pg.reload(); pg.wait_for_timeout(400)
    E = lambda js, *a: pg.evaluate(js, *a)
    print("ONE COMPACT TIME FORMAT")
    got = E("() => [0, 5, 59.4, 60, 65, 125.6, 600].map(tbMinShort)")
    check("tbMinShort: 0m 5m 59m 1h 00m 1h 05m 2h 06m 10h 00m", got == ["0m", "5m", "59m", "1h 00m", "1h 05m", "2h 06m", "10h 00m"], str(got))
    check("the long form is unchanged", E("() => [38, 65].map(tbMin)") == ["38 min", "1 h 05 min"], str(E("() => [38, 65].map(tbMin)")))
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
if OLD:
    a, n = board_text(OLD), board_text(CF)
    check("board and dashboard times read exactly as in the previous build", a == n, "\\n    before %s\\n    after  %s" % (a, n) if a != n else str(n[:6]))
print("ALL PASS" if ok else "FAILURES")
