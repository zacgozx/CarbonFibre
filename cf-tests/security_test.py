import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))   # the app under test
import json
from playwright.sync_api import sync_playwright
# Hostile content: notes, sheets and a task board (as a shared vault folder could hold them) carry
# markup meant to break out of text and attributes. Nothing may become a real element, no script may
# run, links may only be web or email, and the app refuses to run framed inside another page.
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-64s %s %s" % (label, "ok" if good else "FAIL", detail))
P = lambda n: "X\"'><img id=pwn%d src=x onerror=\"window.__x=%d\"><svg id=pwns%d></svg>" % (n, n, n)
BODY = ("# Head %s\n\n[link %s](%s) [[%s]] #tag%s\n\n- [ ] task %s\n\n| a %s | b |\n|---|---|\n| %s | x |\n\n"
        "<span style=\"color: red\">%s</span>\n\n```mermaid\ngraph TD\nA[%s] --> B\n```\n\n```%s\ncode\n```\n\n> quote %s\n\n"
        "[js](javascript:alert(1)) [tab](java\tscript:alert(1)) [file](file:///etc/passwd) [handler](ms-msdt:/id) [data](data:text/html,x) "
        "[ok](https://example.com) [mail](someone@example.com) [host](example.com:8080/x)") % tuple(P(i) for i in range(2, 14))
NOTES = {"notes": [{"id": 1, "title": "T " + P(1), "content": BODY}, {"id": 2, "title": P(5), "content": "back to [[T " + P(1) + "]]"}]}
SHEETS = [{"id": "s1", "title": "S " + P(14), "rows": [["h " + P(15), "b"], [P(16), "=1+1"]]}]
BOARD = {"tasks": [{"uid": "u\"><img id=pwnU src=x>", "id": "INC1 " + P(17), "type": "inc\"><img id=pwnT src=x>", "name": "N " + P(18), "noteId": 1,
                    "mins": 5, "est": 1, "state": "open\"><img id=pwnS src=x>", "clearedAt": None},
                   {"uid": "u2", "id": "CHG2", "type": "chg", "name": "n2", "noteId": None, "mins": 0, "est": 0, "state": "run", "clearedAt": None}],
         "events": [{"at": 9e12, "uid": "u2", "id": "CHG2 " + P(19), "name": "e", "type": "chg", "what": "added\"><img id=pwnE src=x>"}],
         "snowBase": "javascript:alert(1)//", "seq": 3}
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1400, "height": 900})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF)
    pg.evaluate("""([n, s, t]) => { localStorage.clear(); localStorage.setItem('carbonfibre-welcomed', '1');
      localStorage.setItem('carbonfibre-v1', n); localStorage.setItem('carbonfibre-sheets', s); localStorage.setItem('carbonfibre-taskboard', t); }""",
                [json.dumps(NOTES), json.dumps(SHEETS), json.dumps(BOARD)])
    pg.reload(); pg.wait_for_timeout(900)
    E = lambda js, *a: pg.evaluate(js, *a)
    check("the hostile board still loads (cleaned, not dropped)", E("() => tb.tasks.length === 2"))
    injected = lambda: E("() => [...document.querySelectorAll('[id^=pwn]')].map(e => e.id + ':' + e.tagName).concat(window.__x ? ['script ' + window.__x] : [])")
    steps = [("a note", "() => openInPane(1)"), ("its backlink", "() => openInPane(2)"), ("open tabs", "() => showView('tabs')"),
             ("search", "() => showView('search')"), ("all notes", "() => document.getElementById('actLibrary').click()"),
             ("task board", "() => document.getElementById('actBoard').click()"),
             ("board views", "() => ['Board', 'Notes', 'Dashboard'].forEach(v => { const b = [...document.querySelectorAll('.tb-view')].find(x => x.textContent.trim() === v); if (b) b.click(); })"),
             ("graph", "() => { openGraph(); graphSelect(graphData.order[0]); }"), ("graph closed", "() => closeGraph()"),
             ("the palette", "() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true })); }")]
    bad = []
    for name, js in steps:
        try: E(js)
        except Exception as e: print("    (step %s: %s)" % (name, str(e).splitlines()[0][:80]))
        pg.wait_for_timeout(350)
        hit = injected()
        if hit: bad.append(name + ": " + ", ".join(hit))
    check("no hostile title, text, cell or board field becomes markup", not bad, " | ".join(bad)[:300])
    E("() => openInPane(1)"); pg.wait_for_timeout(300)
    hrefs = E("() => [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href'))")
    check("links are web or email only (javascript:, file:, handlers dropped)", all(h.startswith(("https:", "http:", "mailto:", "#", "blob:")) for h in hrefs), str([h for h in hrefs if not h.startswith(("https:", "http:", "mailto:", "#"))])[:200])
    check("...and the safe ones still work", "https://example.com" in hrefs and "mailto:someone@example.com" in hrefs and "https://example.com:8080/x" in hrefs, str(hrefs)[:200])
    check("a link that isn't opened still shows its text", E("() => [...document.querySelectorAll('.xl-off')].map(e => e.textContent)") [:2] == ["js", "tab"])
    check("normalizeUrl", E("""() => [normalizeUrl('JaVaScRiPt:x'), normalizeUrl(' java\\tscript:x'), normalizeUrl('\\u0001javascript:x'), normalizeUrl('vbscript:x'),
        normalizeUrl('file:///c:/x'), normalizeUrl('ms-msdt:x'), normalizeUrl('https://a.b'), normalizeUrl('a.b/c')].join('|')""") == "||||||https://a.b|https://a.b/c")
    check("a board's ServiceNow address must be https (a vault can't plant javascript:)", E("() => tbTicketUrl(tb.tasks[1]) === '' && tb.snowBase === ''"))
    check("board fields are kept to known values", E("() => tb.tasks[0].state === 'open' && /^[\\w-]+$/.test(tb.tasks[0].uid) && tb.events.length === 0"))
    check("no errors from hostile data", not errs, errs[:2])
    # framed inside another page (clickjacking): the app hides itself
    import tempfile
    host = os.path.join(tempfile.mkdtemp(), "host.html")
    open(host, "w").write('<iframe id="f" src="file://%s" style="width:800px;height:600px"></iframe>' % CF)
    fr = b.new_page(); fr.goto("file://" + host); fr.wait_for_timeout(1500)
    frame = [f for f in fr.frames if f.url.startswith("file://") and f != fr.main_frame]
    check("inside an iframe it won't show (no clickjacking)", frame and frame[0].evaluate("() => getComputedStyle(document.documentElement).display") == "none")
    b.close()
print("ALL PASS" if ok else "FAILURES"); sys.exit(0 if ok else 1)
