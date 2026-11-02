import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
from playwright.sync_api import sync_playwright
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-64s %s %s" % (label, "ok" if good else "FAIL", detail))
content = "# Runbook\n\nRestart the **HEC input** on `idx01` and check the backlog drains.\n## Checks after restart\nConfirm *forwarders* reconnect within five minutes.\n\n```bash\nsystemctl restart splunk\ntail -f splunkd.log\n```\n\nLast line of plain text here."
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1200, "height": 650}, color_scheme=os.environ.get("CF_SCHEME", "light"))
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF)
    pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-v1', s); }", json.dumps({"notes": [{"id": 1, "title": "Runbook", "content": content}], "seq": 2}))
    pg.reload(); pg.wait_for_timeout(500); pg.evaluate("() => panes[0].deactivate()")
    E = lambda js, *a: pg.evaluate(js, *a)
    # the screen position of the n-th visible character of a line
    at = lambda line, n: E("""a => { const el = panes[0].linesEl.children[a[0]], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: x => x.parentElement.closest('[data-deco]') ? 2 : 1 }); let node, left = a[1];
        while ((node = w.nextNode())) { if (left < node.length) { const r = document.createRange(); r.setStart(node, left); r.setEnd(node, left + 1); const b = r.getBoundingClientRect(); return [b.left + b.width * 0.3, b.top + b.height / 2]; } left -= node.length; } return null; }""", [line, n])
    tops = lambda: E("() => [...panes[0].linesEl.children].map(e => Math.round(e.getBoundingClientRect().top))")
    before = tops()
    s = at(2, 33); pg.mouse.move(s[0], s[1]); pg.mouse.down()                      # in "on idx01 ..."
    e = at(4, 11); pg.mouse.move(e[0], e[1], steps=8); pg.wait_for_timeout(120)    # "Confirm for|warders": visible char 11 = 'w'
    check("the far end stays formatted (no raw markdown appears)", E("() => !document.querySelector('.ln-rawsel') && !panes[0].linesEl.children[4].textContent.includes('*')"))
    tinted = E("() => { const h = CSS.highlights.get('cf-sel'); return h ? [...h].map(r => r.toString()).join('|') : null; }")
    check("both ends tinted in place: from the start point, to exactly under the pointer", tinted == "d check the backlog drains.|Confirm for", repr(tinted))
    check("nothing moved while dragging", tops()[:9] == before[:9])
    e2 = at(8, 7); pg.mouse.move(e2[0], e2[1], steps=6); pg.wait_for_timeout(120)  # into the code block: "tail -f| splunkd.log"
    tinted = E("() => { const h = CSS.highlights.get('cf-sel'); return h ? [...h].map(r => r.toString()).join('|') : null; }")
    check("dragging into a code block tints up to the pointer there", tinted.endswith("|tail -f"), repr(tinted))
    check("...the line it left is untinted and formatted again", E("() => !panes[0].linesEl.children[4].textContent.includes('*') && panes[0].linesEl.children[4].classList.contains('ln-sel')"))
    pg.mouse.up(); pg.wait_for_timeout(100)
    check("on release it becomes the selection (raw markdown included)", E("() => panes[0].selectedText()").endswith("\ntail -f"), repr(E("() => panes[0].selectedText()")[-24:]))
    pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(100)
    check("clearing the highlight removes the tint", E("() => !CSS.highlights.get('cf-sel')"))
    print("  errors:", errs or "none"); ok &= not errs
    b.close()
print("ALL PASS" if ok else "FAILURES")
