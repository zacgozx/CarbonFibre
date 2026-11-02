import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
if not os.path.exists(CF): CF = "/mnt/user-data/outputs/CarbonFibre.html"
from playwright.sync_api import sync_playwright
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-62s %s %s" % (label, "ok" if good else "FAIL", detail))
notes = [{"id": 1, "title": "Exchange troubleshooting log", "content": "# Exchange troubleshooting log\nsteps so far"},
         {"id": 2, "title": "Splunk HEC runbook", "content": "# Splunk HEC runbook"}, {"id": 3, "title": "Payroll window notes", "content": "# Payroll window notes"}]
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1400, "height": 850})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF)
    pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-v1', s); }", json.dumps({"notes": notes, "seq": 4}))
    pg.reload(); pg.wait_for_timeout(400)
    pg.evaluate("() => { tb.view = 'board'; }")   # these checks are about the board's lanes and cards
    E = lambda js, *a: pg.evaluate(js, *a)
    E("() => { tbAdd('INC0048812', 'Exchange node not reporting', 45); tbAdd('CHG0031204', 'Payroll downtime', 20); tbShow(); }"); pg.wait_for_timeout(200)
    link = lambda tid: E("id => { const t = tb.tasks.find(x => x.id === id); const n = t.noteId != null && findNote(t.noteId); return n ? n.title : null; }", tid)
    card = lambda tid: pg.locator(".tb.show .tb-card", has=pg.locator(".id", has_text=tid)).first
    print("FROM THE CARD")
    check("an unlinked card offers 'Link a note...'", card("INC0048812").locator(".tb-notelink").text_content() == "Link a note\u2026")
    (card("INC0048812").hover(), card("INC0048812").locator(".tb-more").click()); pg.wait_for_timeout(100)
    items = E("() => [...document.querySelectorAll('.tb.show .tb-menu-item')].map(b => b.textContent)")
    check("the menu has 'Link to a note...'", "Link to a note\u2026" in items, str(items))
    pg.locator(".tb.show .tb-menu-item", has_text="Link to a note").click(); pg.wait_for_timeout(150)
    check("it opens a searchable list of notes", E("() => pal.open && pal.pick && pal.pick.kind === 'note'") and "Link INC0048812" in E("() => document.getElementById('cmdIn').placeholder"))
    pg.keyboard.type("exchange trouble"); pg.wait_for_timeout(100); pg.keyboard.press("Enter"); pg.wait_for_timeout(200)
    check("picking one links that existing note (any name)", link("INC0048812") == "Exchange troubleshooting log", str(link("INC0048812")))
    check("the card shows the note's name", card("INC0048812").locator(".tb-notelink").text_content() == "Exchange troubleshooting log")
    check("...and picking didn't open the note or make a new one", E("() => state.notes.length") == 3)
    card("INC0048812").locator(".tb-notelink").click(); pg.wait_for_timeout(300)
    check("clicking the note name opens that note", E("() => panes.some(q => q.type === 'note' && q.note() && q.note().title === 'Exchange troubleshooting log')"))
    E("() => tbShow()"); pg.wait_for_timeout(150)
    (card("INC0048812").hover(), card("INC0048812").locator(".tb-more").click()); pg.wait_for_timeout(100)
    items = E("() => [...document.querySelectorAll('.tb.show .tb-menu-item')].map(b => b.textContent)")
    check("once linked, the menu offers Change and Unlink", "Change linked note\u2026" in items and "Unlink note" in items, str(items))
    pg.locator(".tb.show .tb-menu-item", has_text="Unlink note").click(); pg.wait_for_timeout(150)
    check("Unlink removes the link (the note itself stays)", link("INC0048812") is None and E("() => state.notes.length") == 3)
    print("DRAG AND DROP")
    E("() => renderSidebar()")
    def drop(title, target_js):
        E("""a => { const item = [...document.querySelectorAll('#notesList .side-item')].find(e => e.textContent.includes(a.title)), dt = new DataTransfer();
            item.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
            const T = (new Function('return ' + a.target))(), r = T.getBoundingClientRect(), o = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 20, clientY: r.top + 10 };
            T.dispatchEvent(new DragEvent('dragover', o)); T.dispatchEvent(new DragEvent('drop', o)); item.dispatchEvent(new DragEvent('dragend', { bubbles: true })); }""", {"title": title, "target": target_js})
        pg.wait_for_timeout(200)
    drop("Payroll window notes", "[...document.querySelectorAll('.tb.show .tb-card')].find(c => c.textContent.includes('CHG0031204'))")
    check("dropping a note on a card links it to that card", link("CHG0031204") == "Payroll window notes" and E("() => tb.tasks.length") == 2, str(link("CHG0031204")))
    drop("Splunk HEC runbook", "document.querySelector('.tb.show [data-drop=\"held\"]')")
    check("dropping on a lane's empty space still makes a new task", E("() => tb.tasks.length") == 3 and E("() => tb.tasks.some(t => t.name === 'Splunk HEC runbook' && t.state === 'held')"))
    print("FROM THE NOTE")
    E("() => openInPane(1, panes[0])"); pg.wait_for_timeout(200)
    pg.keyboard.press("Control+p"); pg.keyboard.type(">link this note"); pg.wait_for_timeout(100); pg.keyboard.press("Enter"); pg.wait_for_timeout(200)
    rows = E("() => [...document.querySelectorAll('#cmdList .cmd-row .cmd-label')].map(e => e.textContent)")
    check("'link this note to a task' lists your open tasks", "INC0048812  Exchange node not reporting" in rows and len(rows) == 3, str(rows))
    pg.keyboard.type("INC00488"); pg.wait_for_timeout(100); pg.keyboard.press("Enter"); pg.wait_for_timeout(200)
    check("picking one links this note to it", link("INC0048812") == "Exchange troubleshooting log")
    pg.wait_for_timeout(700); pg.reload(); pg.wait_for_timeout(500)
    pg.evaluate("() => { tb.view = 'board'; }")   # these checks are about the board's lanes and cards
    check("links survive a reload", E("() => { const t = tb.tasks.find(x => x.id === 'INC0048812'); return findNote(t.noteId) && findNote(t.noteId).title; }") == "Exchange troubleshooting log")
    pg.keyboard.press("Control+p"); pg.wait_for_timeout(100)
    check("the palette is back to normal afterwards", E("() => !pal.pick") and "Search notes" in E("() => document.getElementById('cmdIn').placeholder"))
    print("  errors:", errs or "none"); ok &= not errs
    b.close()
print("ALL PASS" if ok else "FAILURES")
