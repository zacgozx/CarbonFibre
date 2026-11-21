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
        for l in L[next(i for i, l in enumerate(L) if l.startswith("## Timeline")) + 1:]:
            if l.startswith("#"): break
            if l.startswith("- "): out.append(l)
        return out
    tick = lambda i: E("i => panes[0].linesEl.children[i].querySelector('[data-check]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))", i)
    E("() => openInPane(1, panes[0])"); pg.wait_for_timeout(200)
    now = E("() => Timeline.now()"); today = E("() => Timeline.today()")

    tick(4); pg.wait_for_timeout(100)
    L = lines()
    check("ticking a step writes the time at its end", L[4] == "- [x] Restart forwarder " + now, L[4])
    check("the first entry puts today's date on the heading", lines()[7] == "## Timeline " + today, lines()[7])
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
    E("() => { const q = panes[0], i = q.lines.findIndex(l => l.startsWith('## Timeline')) + 1; q.setActive(i, q.lines[i].length); }")
    pg.keyboard.type(" extra"); E("() => panes[0].deactivate()"); pg.wait_for_timeout(150)
    check("editing an entry redraws the strip", "Picked up extra" in E("() => document.querySelector('.tl-strip').textContent"))

    print("NOTES WITHOUT A TIMELINE")
    E("() => openInPane(2, panes[0])"); pg.wait_for_timeout(150)
    tick(2); pg.wait_for_timeout(100)
    check("a note without a ## Timeline is never stamped", lines()[2] == "- [x] Milk", lines()[2])
    E("() => { panes[0].setActive(3, 0); }"); pg.keyboard.press("Alt+Enter"); pg.wait_for_timeout(150)
    check("Alt+Enter there makes the section, dated today, at the end", lines()[-2] == "## Timeline " + E("() => Timeline.today()") and re.match(r"^- \d\d:\d\d Bread$", lines()[-1]), str(lines()[-3:]))

    print("PAST MIDNIGHT")
    mid = ["# INC2", "", "- [x] Failover 23:58", "- [ ] Restart", "", "## Timeline 2026-11-20", "- 23:50 Paged", "- 2026-11-21 00:20 Queue drained", "- 23:58 Failover"]
    srt = E("l => Timeline.apply(l, []).slice(6)", mid)
    check("entries on the next day sort after the evening ones", srt == ["- 23:50 Paged", "- 23:58 Failover", "- 2026-11-21 00:20 Queue drained"], str(srt))
    tk = E("""l => { const t = Timeline.today, n = Timeline.now; Timeline.today = () => '2026-11-21'; Timeline.now = () => '00:05';
      try { const x = l.slice(); x[3] = '- [x] Restart'; return Timeline.apply(x, [3]); } finally { Timeline.today = t; Timeline.now = n; } }""", mid)
    check("ticking after midnight stamps the day too, and lists it in order", tk[3] == "- [x] Restart 2026-11-21 00:05" and tk[6:] == ["- 23:50 Paged", "- 23:58 Failover", "- 2026-11-21 00:05 Restart", "- 2026-11-21 00:20 Queue drained"], str(tk))
    tk[3] = "- [ ] Restart 2026-11-21 00:05"; un = E("([l]) => Timeline.apply(l, [3])", [tk])
    check("...and unticking takes both away", un[3] == "- [ ] Restart" and not any("Restart" in l for l in un[6:]), str(un))
    dd = E("l => Timeline.data(l).map(e => e.t)", mid)
    check("the strip draws the next day after, not before (minutes from the heading's day)", dd == [23 * 60 + 50, 23 * 60 + 58, 1440 + 20], str(dd))
    check("whole days are counted across daylight saving changes", E("() => [Timeline.days('2026-04-04', '2026-04-05'), Timeline.days('2026-10-03', '2026-10-05'), Timeline.days('2026-12-31', '2027-01-01')]") == [1, 2, 1])

    print("SETTING THE DAY")
    E("s => { const n = findNote(1); n.content = s; openInPane(1, panes[0]); panes[0].reload(); panes[0].render(); }", "\n".join(mid))
    E("() => panes[0].deactivate()"); pg.wait_for_timeout(150)
    picker = pg.locator(".tl-date"); act0 = E("() => panes[0].activeLine")
    check("the heading has the browser's date picker, showing its day", picker.count() == 1 and picker.input_value() == "2026-11-20", str(picker.count()))
    check("...and the day isn't repeated in the heading's text", "2026-11-20" not in E("() => panes[0].linesEl.children[5].textContent"))
    picker.fill("2026-11-21"); pg.wait_for_timeout(150)
    L = lines()
    check("picking a day writes it into the heading", L[5] == "## Timeline 2026-11-21", L[5])
    check("...and entries on that day lose their now-unneeded date", "- 00:20 Queue drained" in L, str(L[5:]))
    check("the line being edited didn't change (the picker doesn't open the heading)", E("() => panes[0].activeLine") == act0, str([act0, E("() => panes[0].activeLine")]))
    picker = pg.locator(".tl-date"); picker.fill(""); pg.wait_for_timeout(150)
    check("clearing it takes the day off the heading", lines()[5] == "## Timeline", lines()[5])
    check("the Change template has a Timeline now too", E("() => TEMPLATES.find(t => /^Change/.test(t.name)).body.includes('## Timeline')"))
    check("no errors", not errs, errs[:2])
    b.close()
print("ALL PASS" if ok else "FAILURES"); sys.exit(0 if ok else 1)
