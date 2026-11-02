import json, sys, os
ok = True
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
content = "# Runbook\n\nRestart the **HEC input** on `idx01` and check the backlog drains.\n- first bullet with *emphasis*\n- second bullet here\n\n```bash\nsystemctl restart splunk\ntail -f splunkd.log\n```\n\nLast line of plain text here."
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1200, "height": 720}, color_scheme="light")
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF)
    pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-v1', s); }", json.dumps({"notes": [{"id": 1, "title": "Runbook", "content": content}], "seq": 2}))
    pg.reload(); pg.wait_for_timeout(500)
    E = lambda js, *a: pg.evaluate(js, *a)
    # the screen point of raw column c on line i, measured on a rendered copy of the line (as the user sees it before pressing)
    def pt(i, c):
        return E("""a => { const el = panes[0].linesEl.children[a[0]], hl = el.querySelector('.ta-hl');
            if (hl) { const w = document.createTreeWalker(hl, NodeFilter.SHOW_TEXT); let n, left = a[1]; while ((n = w.nextNode())) { if (left < n.length) { const r = document.createRange(); r.setStart(n, left); r.setEnd(n, left + 1); const b = r.getBoundingClientRect(); return [b.left + 1, b.top + b.height / 2]; } left -= n.length; } }
            const v = visibleFromRaw(panes[0].lines[a[0]], panes[0].fmeta[a[0]], a[1]), rg = rangeOfVisible(el, v, v + 1), b = rg.getBoundingClientRect(); return [b.left + 1, b.top + b.height / 2]; }""", [i, c])
    def case(name, click_line, a, z):
        E("() => { panes[0].clearSelectAll(); }")
        if click_line is not None:
            q = pt(click_line, 2); pg.mouse.click(q[0], q[1]); pg.wait_for_timeout(120)
        s = pt(*a); e = pt(*z)
        pg.mouse.move(s[0], s[1]); pg.mouse.down(); pg.mouse.move(e[0], e[1], steps=10); pg.wait_for_timeout(100)
        tint = E("() => { const h = CSS.highlights.get('cf-sel'); return h ? [...h].map(r => r.toString()).join('|') : ''; }")
        pg.mouse.up(); pg.wait_for_timeout(150)
        sel = E("() => panes[0].allSelected ? panes[0].selectedText() : (panes[0].ta ? panes[0].ta.value.slice(panes[0].ta.selectionStart, panes[0].ta.selectionEnd) : '')")
        want = "\n".join(E("() => panes[0].lines.slice()")[min(a[0], z[0]):max(a[0], z[0]) + 1])
        lo, hi = (a, z) if (a[0], a[1]) <= (z[0], z[1]) else (z, a)
        L = E("() => panes[0].lines.slice()")
        want = L[lo[0]][lo[1]:] if lo[0] != hi[0] else L[lo[0]][lo[1]:hi[1]]
        if lo[0] != hi[0]: want = "\n".join([want] + L[lo[0] + 1:hi[0]] + [L[hi[0]][:hi[1]]])
        global ok; ok &= sel == want and bool(tint)
        print("  %-40s %s  got=%r" % (name, "ok  " if sel == want and tint else "FAIL", sel[-50:]) + ("" if sel == want else "  want=%r" % want[-50:]))
    case("no line being edited: down 3 lines", None, (2, 9), (4, 9))
    case("edited line ABOVE, drag below it", 0, (3, 4), (4, 9))
    case("edited line BELOW, drag above it", 7, (2, 9), (3, 8))
    case("drag ends ON the edited line", 4, (2, 9), (4, 9))
    case("drag starts on edited line (native)", 2, (2, 9), (4, 9))
    case("upwards across lines", None, (4, 9), (2, 9))
    case("within one formatted line", None, (2, 9), (2, 27))
    case("into a code block", None, (3, 6), (8, 7))
    print("  errors:", errs or "none"); ok &= not errs
    b.close()
print("ALL PASS" if ok else "FAILURES")
