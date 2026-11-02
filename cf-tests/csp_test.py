import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))   # the app under test
import json
from playwright.sync_api import sync_playwright
# The Content-Security-Policy: the app's own features run without a single violation, and anything
# injected into the page (an inline handler, a script, a network request) is refused.
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-64s %s %s" % (label, "ok" if good else "FAIL", detail))
NOTE = ("# Plan\n\nA [[Other]] link, #tag, **bold** and https://example.com\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n"
        "```mermaid\ngraph LR\n  A[Start] --> B{Check}\n  B --> C[Done]\n```\n\n- [ ] task\n")
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1400, "height": 900}, accept_downloads=True)
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.add_init_script("window.__cspv = []; document.addEventListener('securitypolicyviolation', e => window.__cspv.push(e.violatedDirective + ' ' + e.blockedURI))")
    pg.goto("file://" + CF)
    meta = pg.evaluate("() => (document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]') || {}).content || ''")
    check("the page carries a CSP with script hashes and no network", "'sha256-" in meta and "connect-src 'none'" in meta and "unsafe-inline' ;" not in meta.split("script-src")[1].split(";")[0], meta[:60])
    pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-v1', s); }", json.dumps({"notes": [{"id": 1, "title": "Plan", "content": NOTE}, {"id": 2, "title": "Other", "content": "back to [[Plan]]"}], "seq": 3}))
    pg.reload(); pg.wait_for_timeout(800)
    E = lambda js, *a: pg.evaluate(js, *a)
    check("the app boots under the policy", E("() => typeof panes !== 'undefined' && panes.length > 0"))
    E("() => panes[0].open(1)"); pg.wait_for_timeout(400)
    E("() => { window.showSaveFilePicker = undefined; }")              # take the download path
    steps = [("graph", "() => openGraph()"), ("back to the note", "() => panes[0].open(1)"),
             ("sketch library", "() => openSketchLibrary()"),
             ("a sheet", "() => { const s = createSheet('Budget', [['a','b'],['1','=A2*2']]); openSheetInPane(panes[0], s.id); }"),
             ("back to the note", "() => panes[0].open(1)"),
             ("docx export", "() => exportNote('docx')"), ("pdf export (print frame)", "() => { window.print = () => {}; exportNote('pdf'); }")]
    for label, js in steps:
        try: E(js)
        except Exception as e: errs.append(label + ": " + str(e)[:120])
        pg.wait_for_timeout(500)
    pg.keyboard.press("Escape")
    v = E("() => window.__cspv")
    check("no policy violations from the app's own features", v == [], str(v[:4]))
    E("() => { const d = document.createElement('div'); d.innerHTML = '<img src=x onerror=\"window.__inj = 1\">'; document.body.appendChild(d);"
      " const s = document.createElement('script'); s.textContent = 'window.__inj2 = 1'; document.body.appendChild(s);"
      " const a = document.createElement('a'); a.href = 'javascript:window.__inj3 = 1'; document.body.appendChild(a); a.click(); }")
    pg.wait_for_timeout(300)
    check("an injected inline handler doesn't run", E("() => window.__inj") is None)
    check("an injected script doesn't run", E("() => window.__inj2") is None)
    check("a javascript: link doesn't run", E("() => window.__inj3") is None)
    check("network requests are refused", E("() => fetch('data:text/plain,x').then(() => 'sent', () => 'refused')") == "refused")
    check("no page errors", not errs, str(errs[:2]))
    b.close()
print("ALL PASS" if ok else "FAILURES")
