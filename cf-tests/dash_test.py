import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
from playwright.sync_api import sync_playwright
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-62s %s %s" % (label, "ok" if good else "FAIL", detail))
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1500, "height": 950})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF)
    pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-v1', s); }", json.dumps({"notes": [{"id": 1, "title": "Exchange troubleshooting log", "content": "# x"}], "seq": 2}))
    pg.reload(); pg.wait_for_timeout(400)
    E = lambda js, *a: pg.evaluate(js, *a)
    E("""() => { const M = 60e3, d0 = new Date(); d0.setHours(0, 0, 0, 0);
      const a = tbAdd('INC0048812', 'Exchange node not reporting', 45); a.mins = 50; a.noteId = 1;
      tbAdd('CHG0031204', 'Payroll downtime', 20); const w = tbAdd('RITM0098233', 'Access request', 15); w.state = 'held';
      const d = tbAdd('INC0048654', 'Capture gap', 45); d.state = 'done'; d.clearedAt = tbDay();
      timeLog.push({ task: 'INC0048654 Capture gap', noteId: null, start: d0.getTime() + 9 * 3600e3, end: d0.getTime() + 9 * 3600e3 + 40 * M, actual: 40 * M });
      timeLog.push({ task: 'RITM0098233 Access', noteId: null, start: d0.getTime() + 10 * 3600e3, end: d0.getTime() + 10 * 3600e3 + 20 * M, actual: 20 * M });
      tbSave(); tbShow(); }"""); pg.wait_for_timeout(300)
    check("the board opens on the Dashboard", E("() => !document.querySelector('.tb.show .tb-dash').hidden && document.querySelector('.tb.show .tb-board').hidden"))
    titles = E("() => [...document.querySelectorAll('.tb.show .tbd-head h3')].map(h => h.textContent)")
    check("four panels: tickets and the week on the left, type and activity on the right", titles == ["My tickets", "Last 7 days", "Time by type", "Activity"], str(titles))
    check("quick actions sit in the header (+ Task, then the New note group)", E("() => [...document.querySelectorAll('.tb.show .tb-qa')].map(b => b.innerText.trim())") == ["+ Task", "Incident note", "Change note", "Daily note"] and E("() => !!document.querySelector('.tb.show .tb-qa-group [data-qa=inc]')"))
    stats = E("() => [...document.querySelectorAll('.tb.show .tbd-kpi')].map(k => k.querySelector('.tbd-kpi-l').textContent + ': ' + k.querySelector('b').textContent)")
    check("figure cards: logged, done, to do, waiting, over estimate", stats == ["Logged today: 1h 00m", "Done today: 1", "To do: 2", "Waiting: 1", "Over estimate: 1"], str(stats))
    check("...each with a line underneath (change since yesterday, or context)", E("() => document.querySelectorAll('.tb.show .tbd-kpi .tbd-delta').length") == 5)
    rows = E("() => [...document.querySelectorAll('.tb.show .tbd-table tbody tr')].map(r => r.querySelector('.tbd-key').textContent + '|' + r.querySelector('.tbd-lane').textContent)")
    check("My tickets lists the open ones with their lane", rows == ["INC0048812|To do", "CHG0031204|To do", "RITM0098233|Waiting"], str(rows))
    check("an over-estimate ticket's time is marked", E("() => document.querySelector('.tb.show .tbd-table tbody tr .tbd-time').classList.contains('over')"))
    check("the linked note shows under its ticket", E("() => document.querySelector('.tb.show .tbd-note').textContent") == "Exchange troubleshooting log")
    leg = E("() => [...document.querySelectorAll('.tb.show .tbd-legend li')].map(l => l.textContent)")
    check("time by type: Incident 40, Request item 20", leg == ["Incident40m", "Request item20m"], str(leg))
    check("7 days of bars", E("() => document.querySelectorAll('.tb.show .tbd-day').length") == 7)
    pg.locator(".tb.show .tbd-table tr", has_text="CHG0031204").locator("[data-start]").click(); pg.wait_for_timeout(200)
    check("the row's \u25b6 starts that ticket's clock", E("() => tbRunning() && tbRunning().id") == "CHG0031204")
    check("...and the running row offers \u2713 Done", pg.locator(".tb.show .tbd-table tr.running [data-done]").count() == 1)
    acts = E("() => [...document.querySelectorAll('.tb.show .tbd-act')].map(a => a.textContent)")
    check("Activity records events as they happen (newest first)", acts and "CHG0031204 started" in acts[0], str(acts[:2]))
    pg.locator(".tb.show .tbd-table tbody tr", has_text="RITM0098233").click(); pg.wait_for_timeout(300)
    check("clicking a ticket row shows its card on the board", E("() => tb.view === 'board' && document.activeElement && document.activeElement.dataset.uid === tb.tasks.find(t => t.id === 'RITM0098233').uid"))
    pg.click(".tb.show .tb-view[data-view='dash']"); pg.wait_for_timeout(200)
    pg.locator(".tb.show .tbd-note").click(); pg.wait_for_timeout(300)
    check("clicking the linked note opens it", E("() => panes.some(q => q.type === 'note' && q.note() && q.note().title === 'Exchange troubleshooting log')"))
    E("() => tbShow()"); pg.wait_for_timeout(200)
    pg.click(".tb.show .tb-qa[data-qa='task']"); pg.wait_for_timeout(200)
    check("'+ Task' in the header goes to the board's add box", E("() => tb.view === 'board' && document.activeElement.classList.contains('tb-quick-in')"))
    pg.wait_for_timeout(700); pg.reload(); pg.wait_for_timeout(500); E("() => tbShow()"); pg.wait_for_timeout(200)
    check("the chosen view is remembered", E("() => tb.view") == "board" and not E("() => document.querySelector('.tb.show .tb-board').hidden"))
    print("  errors:", errs or "none"); ok &= not errs
    b.close()
print("ALL PASS" if ok else "FAILURES")
