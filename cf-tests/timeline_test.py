import os, sys, json, re
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
from playwright.sync_api import sync_playwright
# The Timeline: in a note with a "## Timeline" heading, ticking a step stamps the time and lists it in
# the section; unticking takes it off; your own entries stay; Alt+Enter and /log add one; Copy timeline
# gives plain lines. A note without the heading is never changed.
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-66s %s %s" % (label, "ok" if good else "FAIL", detail))
INC = "# INC1 Forwarder down\n\n## Actions taken\n- [ ] Put downtime on host group\n- [ ] Restart forwarder\n- [ ] Confirm events in index\n\n## Timeline\n- 09:05 Picked up\n\n## Follow-up\n- [ ] Write it up"
PLAIN = "# Shopping\n\n- [ ] Milk\n- [ ] Bread"
TIME = re.compile(r"\d\d:\d\d")
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1300, "height": 850}, permissions=["clipboard-read", "clipboard-write"]); pg = ctx.new_page()
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF)
    pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-welcomed', '1'); localStorage.setItem('carbonfibre-v1', s); }",
                json.dumps({"notes": [{"id": 1, "title": "INC1 Forwarder down", "content": INC}, {"id": 2, "title": "Shopping", "content": PLAIN}], "seq": 3}))
    pg.reload(); pg.wait_for_timeout(500)
    E = lambda js, *a: pg.evaluate(js, *a)
    lines = lambda: E("() => panes[0].lines.slice()")
    def section():
        L = lines(); out = []
        for l in L[L.index("## Timeline") + 1:]:
            if l.startswith("#"): break
            if l.startswith("- "): out.append(l)
        return out
    tick = lambda i: E("i => panes[0].linesEl.children[i].querySelector('[data-check]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))", i)
    E("() => openInPane(1, panes[0])"); pg.wait_for_timeout(200)
    now = E("() => Timeline.now()")

    tick(4); pg.wait_for_timeout(100)
    L = lines()
    check("ticking a step writes the time at its end", L[4] == "- [x] Restart forwarder " + now, L[4])
    check("...and lists it in the Timeline, after the earlier entry", section()[:2] == ["- 09:05 Picked up", "- " + now + " Restart forwarder"], str(section()))
    E("() => histUndo(panes[0])"); pg.wait_for_timeout(50)
    check("...one undo step for both", lines()[4] == "- [ ] Restart forwarder" and section() == ["- 09:05 Picked up"], str([lines()[4], section()]))
    E("() => histRedo(panes[0])"); pg.wait_for_timeout(50)
    check("the step stays readable in Live view (no raw markdown)", E("() => panes[0].linesEl.children[4].textContent.includes('Restart forwarder ' + Timeline.now())"))
    tick(4); pg.wait_for_timeout(100)
    check("unticking takes the time off and the entry out", lines()[4] == "- [ ] Restart forwarder" and section() == ["- 09:05 Picked up"], str([lines()[4], section()]))
    check("steps under other headings count too (Follow-up)", E("() => { const l = panes[0].lines.slice(); l[l.length - 1] = '- [x] Write it up'; return Timeline.apply(l, [l.length - 1]).some(x => /^- \\d\\d:\\d\\d Write it up$/.test(x)); }"))

    print("YOUR OWN ENTRIES")
    E("() => { panes[0].setActive(3, 0); }"); pg.wait_for_timeout(50)
    pg.keyboard.press("Alt+Enter"); pg.wait_for_timeout(150)
    check("Alt+Enter on a line adds its text to the timeline", "- " + now + " Put downtime on host group" in section(), str(section()))
    check("...and leaves the line itself as it was", lines()[3] == "- [ ] Put downtime on host group")
    E("() => { const q = panes[0]; q.setActive(5, q.lines[5].length); }"); pg.keyboard.press("End"); pg.keyboard.press("Enter")
    pg.on("dialog", lambda d: d.accept("queue draining"))
    pg.keyboard.type("/log"); pg.keyboard.press("Tab"); pg.wait_for_timeout(300)
    check("/log asks and adds the answer", "- " + now + " queue draining" in section(), str(section()))
    tick(3); pg.wait_for_timeout(100)
    check("ticking a step whose text is also your entry keeps one entry, not two", sum(1 for l in section() if l.endswith("Put downtime on host group")) == 1, str(section()))
    check("your entries survive the section being rebuilt", "- 09:05 Picked up" in section() and "- " + now + " queue draining" in section())

    print("COPY")
    pg.locator(".tl-copy").click(); pg.wait_for_timeout(200)
    clip = E("() => navigator.clipboard.readText()")
    first = clip.split("\n")[0]
    check("Copy timeline: the note and the day, then plain 'HH:MM text' lines", first.startswith("INC1 Forwarder down, ") and "09:05 Picked up" in clip and "- " not in clip, clip[:200])
    check("the button doesn't put the heading into editing", E("() => panes[0].activeLine === null || panes[0].lines[panes[0].activeLine] !== '## Timeline'"))

    print("THE STRIP")
    E("() => openInPane(1, panes[0])"); pg.wait_for_timeout(150)
    E("() => panes[0].deactivate()"); pg.wait_for_timeout(100)
    st = E("() => { const s = document.querySelector('.tl-strip'); return s && { dots: s.querySelectorAll('.tl-dot').length, own: s.querySelectorAll('.tl-dot.tl-own').length, sum: s.querySelector('.tl-sum').textContent }; }")
    n = len(section())
    check("the Timeline is drawn as a strip under its heading, one dot per entry", st and st["dots"] == n, str(st))
    check("...ticked steps filled, your own entries hollow", st and st["own"] == n - 1, str(st))
    check("...with a summary of the span", st and st["sum"].startswith("%d entries" % n), str(st))
    dot = pg.locator(".tl-strip .tl-dot:not(.tl-own)").first
    tip = E("() => document.querySelector('.tl-strip .tl-dot:not(.tl-own)').title")
    check("hovering a dot says what it is and how long after the one before", "a ticked step" in tip and "after the one before" in tip, tip)
    dot.click(); pg.wait_for_timeout(150)
    check("clicking a step's dot goes to the step", E("() => panes[0].activeLine") == 3, str(E("() => panes[0].activeLine")))
    E("() => panes[0].deactivate()"); pg.wait_for_timeout(100)
    span = lambda: E("() => { const s = document.querySelector('.tl-strip'); return +s.dataset.b - +s.dataset.a; }")
    s0 = span(); pg.locator(".tl-strip [data-tl-act='in']").click(); pg.wait_for_timeout(50)
    check("+ zooms in", span() < s0 * 0.8, str([s0, span()]))
    pg.locator(".tl-strip [data-tl-act='fit']").click(); pg.wait_for_timeout(50)
    check("Fit shows all of it again", abs(span() - s0) < 0.01)
    box = pg.locator(".tl-strip .tl-track").bounding_box(); a0 = E("() => +document.querySelector('.tl-strip').dataset.a"); act0 = E("() => panes[0].activeLine")
    pg.mouse.move(box["x"] + box["width"] * 0.6, box["y"] + 10); pg.mouse.down(); pg.mouse.move(box["x"] + box["width"] * 0.3, box["y"] + 10, steps=6); pg.mouse.up()
    check("dragging pans along the axis", E("() => +document.querySelector('.tl-strip').dataset.a") > a0 + 0.5, str([a0, E("() => +document.querySelector('.tl-strip').dataset.a")]))
    check("...and never puts the heading into editing (the line being edited stays as it was)", E("() => panes[0].activeLine") == act0, str([act0, E("() => panes[0].activeLine")]))
    pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + 10); pg.keyboard.down("Control"); pg.mouse.wheel(0, -200); pg.keyboard.up("Control"); pg.wait_for_timeout(50)
    check("Ctrl+scroll zooms", span() < s0, str([s0, span()]))
    E("() => { const q = panes[0], i = q.lines.indexOf('## Timeline') + 1; q.setActive(i, q.lines[i].length); }")
    pg.keyboard.type(" extra"); E("() => panes[0].deactivate()"); pg.wait_for_timeout(150)
    check("editing an entry redraws the strip", "Picked up extra" in E("() => document.querySelector('.tl-strip').textContent"))

    print("NOTES WITHOUT A TIMELINE")
    E("() => openInPane(2, panes[0])"); pg.wait_for_timeout(150)
    tick(2); pg.wait_for_timeout(100)
    check("a note without a ## Timeline is never stamped", lines()[2] == "- [x] Milk", lines()[2])
    E("() => { panes[0].setActive(3, 0); }"); pg.keyboard.press("Alt+Enter"); pg.wait_for_timeout(150)
    check("Alt+Enter there makes the section, at the end", lines()[-2:] == ["## Timeline", "- " + now + " Bread"], str(lines()[-3:]))
    check("the Change template has a Timeline now too", E("() => TEMPLATES.find(t => /^Change/.test(t.name)).body.includes('## Timeline')"))
    check("no errors", not errs, errs[:2])
    b.close()
print("ALL PASS" if ok else "FAILURES"); sys.exit(0 if ok else 1)
