import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))   # the app under test
import json
from playwright.sync_api import sync_playwright
content = "\n".join(["# Incident notes", "", "Line one keep", "Line two remove", "Line three remove", "Line four remove", "Line five keep", "",
                     "- **Splunk** HEC down on `idx01`", "- restart done", "", "| Host | Status |", "| --- | --- |", "| idx01 | up |", "", "```", "systemctl restart splunk", "```"])
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-60s %s %s" % (label, "ok" if good else "FAIL", detail))
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1300, "height": 850})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF)
    pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-v1', s); }", json.dumps({"notes": [{"id": 1, "title": "Incident notes", "content": content}], "seq": 2}))
    pg.reload(); pg.wait_for_timeout(500)
    E = lambda js, *a: pg.evaluate(js, *a)
    ln = lambda i: pg.locator(".pane-col .editor-inner > div").nth(i)
    def drag_select(a, z):
        s0 = pg.evaluate("""i => { const el = panes[0].linesEl.children[i], r = el.getBoundingClientRect(), cs = getComputedStyle(el); return [r.left + parseFloat(cs.paddingLeft) + 1, r.top + r.height / 2]; }""", a)
        z0 = pg.evaluate("""i => { const el = panes[0].linesEl.children[i], r = el.getBoundingClientRect(); return [r.right - 4, r.top + r.height / 2]; }""", z)
        pg.mouse.move(s0[0], s0[1]); pg.mouse.down()
        pg.mouse.move(z0[0], z0[1], steps=6); pg.mouse.up(); pg.wait_for_timeout(100)
    def drop(at_line, data, dx=50):
        bb = ln(at_line).bounding_box()
        E("""a => { const dt = new DataTransfer(); Object.entries(a.data).forEach(([k, v]) => dt.setData(k, v));
            const t = document.elementFromPoint(a.x, a.y);
            const o = { bubbles: true, cancelable: true, clientX: a.x, clientY: a.y, dataTransfer: dt };
            t.dispatchEvent(new DragEvent('dragover', o)); t.dispatchEvent(new DragEvent('drop', o)); }""", {"x": bb["x"] + (bb["width"] - 8 if dx == "end" else dx), "y": bb["y"] + bb["height"] / 2, "data": data})
        pg.wait_for_timeout(150)
    lines = lambda: E("() => panes[0].lines.slice()")
    print("DROP")
    drag_select(3, 5)
    check("dragging across lines highlights them", E("() => panes[0].allSelected && panes[0].selFrom === 3 && panes[0].selTo === 5"))
    drop(4, {"text/plain": "Dropped replacement"})
    check("dropping over the highlight replaces it", lines()[2:5] == ["Line one keep", "Dropped replacement", "Line five keep"], str(lines()[2:5]))
    pg.keyboard.press("Control+z"); pg.wait_for_timeout(150)
    check("one undo brings the highlighted lines back", lines()[3:6] == ["Line two remove", "Line three remove", "Line four remove"])
    drag_select(3, 5)
    drop(4, {"text/html": "<p>From <b>Outlook</b></p><ul><li>first</li><li>second</li></ul>", "text/plain": "From Outlook\nfirst\nsecond"})
    got = lines()[3:7]
    check("web/Office content dropped in becomes markdown", "**Outlook**" in " ".join(got) and any(l.startswith("- first") or l.startswith("* first") for l in got), str(got))
    pg.keyboard.press("Control+z"); pg.wait_for_timeout(150)
    E("() => panes[0].clearSelectAll()")
    drop(2, {"text/plain": " INSERTED"}, dx="end")
    check("with nothing highlighted, a drop goes in where it lands", lines()[2] == "Line one keep INSERTED", repr(lines()[2]))
    drop(2, {"text/plain": "A\nB"}, dx="end")
    check("a multi-line drop splits the line around it", lines()[2:4] == ["Line one keep INSERTEDA", "B"], str(lines()[2:4]))
    pg.keyboard.press("Control+z"); pg.keyboard.press("Control+z"); pg.wait_for_timeout(150)
    print("TYPING AND PASTE STILL REPLACE")
    drag_select(3, 5); pg.keyboard.type("X"); pg.wait_for_timeout(100)
    check("typing over the highlight replaces it", lines()[3] == "X" and lines()[4] == "Line five keep")
    pg.keyboard.press("Control+z"); pg.wait_for_timeout(150)
    print("COPY FOR TEAMS")
    E("() => { window.__clip = {}; const o = DataTransfer.prototype.setData; DataTransfer.prototype.setData = function (k, v) { window.__clip[k] = v; return o.call(this, k, v); }; }")
    drag_select(8, 17); pg.keyboard.press("Control+c"); pg.wait_for_timeout(150)
    clip = E("() => window.__clip")
    check("Ctrl+C puts the markdown on the clipboard as plain text", clip.get("text/plain", "").startswith("- **Splunk** HEC down"))
    h = clip.get("text/html", "")
    check("...and formatted HTML (bold, list, table, code block)", all(t in h for t in ("<strong>Splunk</strong>", "<ul>", "<table", "<th", "<pre", "systemctl restart splunk")), h[:120])
    check("styles are inline (Teams drops style sheets)", "<style" not in h and 'style="border:1px solid' in h)
    pg.keyboard.press("Control+x"); pg.wait_for_timeout(150)
    check("Ctrl+X copies the same and removes the lines", "text/html" in E("() => window.__clip") and "systemctl restart splunk" not in "\n".join(lines()))
    pg.keyboard.press("Control+z"); pg.wait_for_timeout(150)
    check("palette offers 'Copy note as formatted text (Teams, Outlook)'", "Copy note as formatted text (Teams, Outlook)" in E("() => palCommands().map(c => c.label)"))
    pv = b.new_page(); pv.set_content("<body style='background:#fff;padding:16px;width:620px'>" + h + "</body>"); pv.wait_for_timeout(200)
    pv.screenshot(path="/tmp/cf_test.png", clip={"x": 0, "y": 0, "width": 660, "height": 300})   # a separate page: the app's pending save still has its page
    print("  errors:", errs or "none"); ok &= not errs
    b.close()
print("ALL PASS" if ok else "FAILURES")
