import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))   # the app under test
import json
from playwright.sync_api import sync_playwright
content = "# Cursor\n\nFirst line of the shift log here.\n\nShort\n" + "\n".join("Filler line %d" % i for i in range(1, 60)) + "\nLast line."
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-62s %s %s" % (label, "ok" if good else "FAIL", detail))
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1200, "height": 700})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF)
    pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-v1', s); }", json.dumps({"notes": [{"id": 1, "title": "Cursor", "content": content}], "seq": 2}))
    pg.reload(); pg.wait_for_timeout(500)
    E = lambda js, *a: pg.evaluate(js, *a)
    # record every flight: where from, where to
    E("""() => { window.__fl = []; const orig = Element.prototype.animate;
      Element.prototype.animate = function (kf, opt) { if (this.classList && this.classList.contains('ninja-cur')) window.__fl.push({ from: kf[0].transform, to: kf[4].transform, d: opt.duration, e: opt.easing }); return orig.call(this, kf, opt); }; }""")
    fl = lambda: E("() => window.__fl.splice(0)")
    xy = lambda t: [round(float(v.replace("px", ""))) for v in t.replace("translate3d(", "").split(",")[:2]]
    # where the caret should be: measured independently from a mirror of the text box
    TRUE = """() => { const ta = document.activeElement, cs = getComputedStyle(ta), m = document.createElement('span');
      m.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:' + cs.font + ';letter-spacing:' + cs.letterSpacing;
      m.textContent = ta.value.slice(0, ta.selectionEnd); document.body.appendChild(m); const w = m.getBoundingClientRect().width; m.remove();
      const r = ta.getBoundingClientRect(); return [Math.round(r.left + parseFloat(cs.paddingLeft) + w), Math.round(r.top + parseFloat(cs.paddingTop))]; }"""
    pg.locator(".pane-col .editor-inner > div").nth(2).click(); pg.wait_for_timeout(150); fl()
    pg.keyboard.press("Home"); pg.wait_for_timeout(120); fl()
    pg.keyboard.press("End"); pg.wait_for_timeout(120)
    f = fl(); t = E(TRUE)
    check("End: one flight, landing exactly on the caret", len(f) == 1 and abs(xy(f[0]["to"])[0] - t[0]) <= 1, "to %s, caret at %s" % (xy(f[0]["to"]) if f else None, t))
    check("...from where the caret was (line start)", len(f) == 1 and xy(f[0]["from"])[0] < xy(f[0]["to"])[0] - 100)
    check("75 ms on the plugin's easing", f and f[0]["d"] == 75 and f[0]["e"] == "cubic-bezier(0.34, 1.26, 0.84, 1)")
    for k in range(3): pg.keyboard.press("ArrowLeft")
    pg.wait_for_timeout(120); f = fl(); t = E(TRUE)
    check("arrow keys mid-word: lands on the caret", f and abs(xy(f[-1]["to"])[0] - t[0]) <= 1, "to %s, caret %s" % (xy(f[-1]["to"]) if f else None, t))
    pg.keyboard.press("ArrowDown"); pg.wait_for_timeout(120); f = fl()
    check("Down onto an empty line: a flight down to the line's start", f and xy(f[-1]["to"])[1] > xy(f[-1]["from"])[1])
    pg.locator(".pane-col .editor-inner > div").nth(30).click(); pg.wait_for_timeout(150); f = fl()
    check("clicking far away: one long flight", len(f) >= 1 and abs(xy(f[-1]["to"])[1] - xy(f[-1]["from"])[1]) > 300, str([xy(x["from"]) + xy(x["to"]) for x in f]))
    pg.keyboard.press("Shift"); pg.wait_for_timeout(120)
    check("no flight when the caret didn't move", fl() == [])
    before = E(TRUE)
    moved = E("() => { const s = panes[0].editorEl, a = s.scrollTop; s.scrollTop += 200; return s.scrollTop - a; }"); pg.wait_for_timeout(150); fl()
    pg.keyboard.press("ArrowLeft"); pg.wait_for_timeout(120); f = fl()
    want = before[1] - moved
    check("after scrolling, a move starts where the old caret now is on screen", f and abs(xy(f[-1]["from"])[1] - 4 - want) <= 2, "from y %s, old caret now at y %s (scrolled %spx)" % (xy(f[-1]["from"])[1] - 4 if f else None, want, moved))
    pg.keyboard.type("abc"); pg.wait_for_timeout(120); f = fl()
    check("typing: small flights a character at a time, as in the plugin", len(f) >= 1)
    labels = E("() => palCommands().map(c => c.label).filter(l => l.startsWith('Cursor trail'))")
    check("the palette has the toggle", labels == ["Cursor trail: on (turn off)"], str(labels))
    E("() => ninjaSet(false)")
    pg.keyboard.press("Home"); pg.wait_for_timeout(120)
    check("turned off: no flights", fl() == [])
    pg.reload(); pg.wait_for_timeout(400)
    check("...and it stays off after a reload", E("() => NINJA.on") is False)
    print("  errors:", errs or "none"); ok &= not errs
    b.close()
    b = p.chromium.launch(); ctx = b.new_context(reduced_motion="reduce"); pg = ctx.new_page()
    pg.goto("file://" + CF); pg.evaluate("() => localStorage.clear()"); pg.reload(); pg.wait_for_timeout(300)
    check("Windows 'reduce animations' on: the trail starts off", pg.evaluate("() => NINJA.on") is False)
    b.close()
print("ALL PASS" if ok else "FAILURES")
