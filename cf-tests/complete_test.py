import os, sys, json, datetime
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
from playwright.sync_api import sync_playwright
# Completion in the editor: Enter makes a new line (it used to take the suggestion), Tab picks; Enter
# picks a [[link]] or a choice moved to with the arrows. Letters in order match ("splk" -> Splunk),
# words used more rank higher, picks are remembered, the best word shows faintly, and /snippets expand.
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-66s %s %s" % (label, "ok" if good else "FAIL", detail))
notes = [{"id": 1, "title": "Alpha", "content": "# Alpha\n\nstart"},
         {"id": 2, "title": "Logs", "content": "Splunk Splunk Splunk searches. Splunkbase apps. Spreadsheet once. ObsidianVault and my-vault."},
         {"id": 3, "title": "Ops", "content": "Kubernetes kubectl Kubernetes"}]
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1300, "height": 800})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF)
    pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-welcomed', '1'); localStorage.setItem('carbonfibre-v1', s); }", json.dumps({"notes": notes, "seq": 4}))
    pg.reload(); pg.wait_for_timeout(500)
    E = lambda js, *a: pg.evaluate(js, *a)
    E("() => openInPane(1, panes[0])"); pg.wait_for_timeout(150)
    def fresh_line():
        E("() => { const q = panes[0]; q.setActive(2, q.lines[2].length); }"); pg.wait_for_timeout(60)
        pg.keyboard.press("End"); pg.keyboard.press("Enter"); pg.wait_for_timeout(60)
    lines = lambda: E("() => panes[0].lines.slice()")
    popup = lambda: E("() => { const a = document.querySelector('.ac'); return a ? [...a.querySelectorAll('.ac-item .ac-word')].map(x => x.textContent) : null; }")
    ghost = lambda: E("() => { const g = document.querySelector('.ac-ghost'); return g ? g.textContent : null; }")

    fresh_line()
    pg.keyboard.type("Splu"); pg.wait_for_timeout(80)
    check("typing offers words from the vault, most used first", (popup() or [None])[0] == "Splunk", str(popup()))
    check("the rest of the best word shows faintly after the caret", ghost() == "nk", str(ghost()))
    pg.keyboard.press("Enter"); pg.wait_for_timeout(80)
    L = lines()
    check("Enter starts a new line and keeps what you typed (the bug)", L[3] == "Splu" and L[4] == "" and popup() is None, str(L[2:6]))
    check("...and the faint word is gone", ghost() is None)

    pg.keyboard.type("Splu"); pg.wait_for_timeout(80)
    pg.keyboard.press("Tab"); pg.wait_for_timeout(80)
    check("Tab picks it", lines()[4] == "Splunk", str(lines()[4]))

    pg.keyboard.press("Enter"); pg.keyboard.type("splk"); pg.wait_for_timeout(80)
    check("letters in order match: 'splk' finds Splunk", (popup() or [None])[0] == "Splunk", str(popup()))
    check("...with the matched letters in bold", E("() => [...document.querySelector('.ac-item b') ? document.querySelectorAll('.ac-item.on b') : []].map(x => x.textContent).join('')").lower() == "splk")
    check("no faint word when it isn't a straight continuation", ghost() is None, str(ghost()))
    pg.keyboard.press("ArrowDown"); pg.wait_for_timeout(40)
    picked = (popup() or ["", ""])[1]
    pg.keyboard.press("Enter"); pg.wait_for_timeout(80)
    check("after moving with the arrows, Enter picks the highlighted one", lines()[5] == picked and picked != "", str([lines()[5], picked]))

    pg.keyboard.press("Enter"); pg.keyboard.type("vault"); pg.wait_for_timeout(80)
    check("the start of a part matches: 'vault' finds ObsidianVault", "ObsidianVault" in (popup() or []), str(popup()))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(40)
    check("Esc closes the popup", popup() is None)

    print("RANKING")
    pg.keyboard.press("Enter"); pg.keyboard.type("Kub"); pg.wait_for_timeout(80)
    check("a capital first letter: picks keep it ('Kub' -> Kubernetes, Kubectl)", popup() == ["Kubernetes", "Kubectl"], str(popup()))
    pg.keyboard.press("Escape")
    for _ in range(3):
        pg.keyboard.press("Enter"); pg.keyboard.type("kub"); pg.wait_for_timeout(60)
        if (popup() or [""])[0] != "kubectl": pg.keyboard.press("ArrowDown")
        pg.keyboard.press("Tab"); pg.wait_for_timeout(60)
    pg.keyboard.press("Enter"); pg.keyboard.type("kub"); pg.wait_for_timeout(1700)
    pg.keyboard.press("Backspace"); pg.keyboard.type("b"); pg.wait_for_timeout(80)
    check("words you pick climb to the top", (popup() or [""])[0] == "kubectl", str(popup()))
    check("...and are remembered", "kubectl" in json.loads(E("() => localStorage.getItem('carbonfibre-complete-picks')") or "{}"))
    pg.keyboard.press("Escape")

    print("SNIPPETS")
    pg.keyboard.press("Enter"); pg.keyboard.type("/"); pg.wait_for_timeout(80)
    check("'/' at a line start lists the snippets", popup() and "/date" in popup() and "/todo" in popup(), str(popup()))
    pg.keyboard.type("da"); pg.keyboard.press("Tab"); pg.wait_for_timeout(80)
    today = E("() => { const d = new Date(), z = n => (n < 10 ? '0' : '') + n; return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); }")
    check("/date expands to today's date", lines()[panes_i := E("() => panes[0].activeLine")] == today, str(lines()[panes_i]))
    pg.keyboard.press("Enter"); pg.keyboard.type("/todo"); pg.keyboard.press("Tab"); pg.keyboard.type("buy milk"); pg.wait_for_timeout(80)
    check("/todo makes a checkbox", lines()[E("() => panes[0].activeLine")] == "- [ ] buy milk", str(lines()[-3:]))
    pg.keyboard.press("Enter"); pg.keyboard.press("Enter"); pg.keyboard.type("Met at /ti"); pg.keyboard.press("Tab"); pg.wait_for_timeout(80)
    check("/time works after other words", __import__("re").match(r"^Met at \d\d:\d\d$", lines()[E("() => panes[0].activeLine")]) is not None, lines()[E("() => panes[0].activeLine")])
    pg.keyboard.press("Enter"); pg.keyboard.type("and/or"); pg.wait_for_timeout(80)
    check("a slash inside a word (and/or) offers nothing", popup() is None, str(popup()))
    pg.keyboard.press("Enter"); pg.keyboard.type("x /to"); pg.wait_for_timeout(80)
    check("line-start snippets aren't offered mid-line", popup() is None or "/todo" not in popup(), str(popup()))
    pg.keyboard.press("Escape")

    print("LINKS")
    pg.keyboard.press("Enter"); pg.keyboard.type("see [[Lo"); pg.wait_for_timeout(80)
    check("[[ offers note titles", popup() == ["Logs"], str(popup()))
    pg.keyboard.press("Enter"); pg.wait_for_timeout(80)
    check("Enter still picks a link", lines()[E("() => panes[0].activeLine")] == "see [[Logs]]", lines()[E("() => panes[0].activeLine")])
    pg.keyboard.press("Enter"); pg.keyboard.type("Splu"); pg.wait_for_timeout(80)
    check("screen readers: a listbox the editor points to, the highlighted option marked", E("() => { const ta = document.activeElement, a = document.querySelector('.ac'); return a.getAttribute('role') === 'listbox' && ta.getAttribute('aria-controls') === a.id && document.getElementById(ta.getAttribute('aria-activedescendant')).getAttribute('aria-selected') === 'true'; }"))
    pg.keyboard.press("ArrowLeft"); pg.wait_for_timeout(40)
    check("moving the caret closes the popup", popup() is None and ghost() is None)
    check("no errors", not errs, errs[:2])
    b.close()
print("ALL PASS" if ok else "FAILURES"); sys.exit(0 if ok else 1)
