import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
from playwright.sync_api import sync_playwright
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-62s %s %s" % (label, "ok" if good else "FAIL", detail))
SHOT = os.environ.get("CF_SHOT")
VAULT = """() => {
  const D = 864e5, now = Date.now();
  state.backend = 'folder'; state.folders = [{ path: 'Incidents' }, { path: 'Runbooks' }, { path: 'Daily' }];
  const mk = (path, content, daysAgo) => ({ id: path, path: path, title: path.split('/').pop().replace(/[.]md$/, ''), content: content, handle: null, parent: null, mtime: now - daysAgo * D });
  const notes = [
    mk('Shift log.md', '# Shift log\\nSee [[Splunk HEC restart]] and [[INC0048812]].\\n- [ ] hand over', 0.1),
    mk('Untitled.md', '# Untitled\\n', 3), mk('Untitled 2.md', '# Untitled 2\\nsome words here', 40), mk('Scratch.md', '# Scratch\\n', 1),
    mk('Incidents/INC0048812.md', '# INC0048812\\nExchange node not reporting. Links back to [[Shift log]].\\n- [ ] check tokens\\n- [ ] backlog', 0.5),
    mk('Runbooks/Splunk HEC restart.md', '# Splunk HEC restart\\nSteps to restart the input safely across the cluster.', 60),
    mk('Runbooks/Sensu decommission.md', '# Sensu decommission\\nOld steps, nobody links here.', 90)
  ];
  for (let i = 0; i < 33; i++) notes.push(mk('Daily/2026-09-' + String(i + 1).padStart(2, '0') + '.md', '# 2026-09-' + (i + 1) + '\\nLog for the day ' + i + ' with a few words.', 30 + i));
  state.notes = notes;
  Object.keys(pinned).forEach(k => delete pinned[k]); pinned['Shift log.md'] = 1; savePins();
  tb.tasks = []; const t = tbAdd('INC0048812', 'Exchange node not reporting', 45); t.noteId = 'Incidents/INC0048812.md';
  renderSidebar(); tb.view = 'notes'; tb.notesMode = 'all'; tbShow(); tbRenderAll(); }"""
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1500, "height": 950}, color_scheme=os.environ.get("CF_SCHEME", "light"))
    pg.add_init_script("try { localStorage.setItem('carbonfibre-welcomed', '1'); } catch (e) {}")   # a returning user: no first-visit dialog
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    dialogs = []; pg.on("dialog", lambda d: (dialogs.append(d.message), d.accept()))
    pg.goto("file://" + CF); pg.evaluate("() => localStorage.clear()"); pg.reload(); pg.wait_for_timeout(400)
    E = lambda js, *a: pg.evaluate(js, *a)
    E(VAULT); pg.wait_for_timeout(300)
    names = lambda: E("() => [...document.querySelectorAll('.tb.show .tbn-table tbody tr[data-open]')].map(r => r.querySelector('.tbn-tt').childNodes[r.querySelector('.tbn-pin') ? 1 : 0].textContent)")
    summary = E("() => document.querySelector('.tb.show .tbn-sum').textContent")
    check("a summary of everything", summary == "40 notes in 3 folders \u00b7 3 untitled or empty \u00b7 37 not linked \u00b7 36 not edited in 30+ days", summary)
    chips = E("() => [...document.querySelectorAll('.tb.show .tbn-chip[data-chip]')].map(c => c.textContent)")   # the original chip row (types are a separate row)
    check("filter chips with counts", chips == ["All40", "Untitled or empty3", "Not linked37", "Not edited in 30+ days36", "Open tasks2", "On the board1", "Pinned1"], str(chips))
    check("All: newest first", names()[:3] == ["Shift log", "INC0048812", "Scratch"], str(names()[:3]))
    pg.locator(".tb.show .tbn-chip[data-chip='tidy']").click(); pg.wait_for_timeout(150)
    check("'Untitled or empty' surfaces the junk", sorted(names()) == ["Scratch", "Untitled", "Untitled 2"], str(names()))
    check("...flagged untitled / empty", E("() => [...document.querySelectorAll('.tb.show .tbn-flag')].map(f => f.textContent).join(',')") == "empty,untitled,empty,untitled", E("() => [...document.querySelectorAll('.tb.show .tbn-flag')].map(f => f.textContent).join(',')"))
    pg.locator(".tb.show .tbn-chip[data-chip='orphan']").click(); pg.wait_for_timeout(150)
    check("'Not linked': nothing links in or out", "Sensu decommission" in names() and "Shift log" not in names() and "Splunk HEC restart" not in names())
    pg.locator(".tb.show .tbn-chip[data-chip='all']").click(); pg.wait_for_timeout(150)
    pg.locator(".tb.show .tbn-search").fill("runbooks"); pg.wait_for_timeout(150)
    check("search by folder", sorted(names()) == ["Sensu decommission", "Splunk HEC restart"], str(names()))
    pg.locator(".tb.show .tbn-search").fill("tokens"); pg.wait_for_timeout(150)
    check("text isn't searched unless asked", names() == [])
    pg.locator(".tb.show .tbn-textcb").check(); pg.wait_for_timeout(150)
    check("'search text too' finds it inside notes", names() == ["INC0048812"], str(names()))
    pg.locator(".tb.show .tbn-search").fill(""); pg.locator(".tb.show .tbn-textcb").uncheck(); pg.wait_for_timeout(150)
    pg.locator(".tb.show .tbn-table th[data-sort='words']").click(); pg.wait_for_timeout(150)
    check("sort by a column (words, most first)", names()[0] == "INC0048812", str(names()[:2]))
    pg.locator(".tb.show .tbn-table th[data-sort='edited']").click(); pg.wait_for_timeout(100)
    print("BULK")
    pg.locator(".tb.show .tbn-chip[data-chip='tidy']").click(); pg.wait_for_timeout(150)
    pg.locator(".tb.show .tbn-table thead [data-selall]").check(); pg.wait_for_timeout(150)
    check("select all shown: the bulk bar appears", E("() => document.querySelector('.tb.show .tbn-bulk b').textContent") == "3 selected")
    if SHOT: pg.screenshot(path=SHOT)
    pg.locator(".tb.show .tbn-bulk [data-bulk='pin']").click(); pg.wait_for_timeout(150)
    check("Pin pins them all", all(E("() => !!pinned[%s]" % json.dumps(i)) for i in ["Untitled.md", "Untitled 2.md", "Scratch.md"]))
    pg.locator(".tb.show .tbn-chip[data-chip='tidy']").click(); pg.locator(".tb.show .tbn-table thead [data-selall]").check(); pg.wait_for_timeout(100)
    pg.locator(".tb.show .tbn-bulk [data-bulk='delete']").click(); pg.wait_for_timeout(250)
    check("delete asks once, listing them", len(dialogs) == 1 and "Move 3 notes to .trash?" in dialogs[0] and "Scratch.md" in dialogs[0], str(dialogs))
    check("...and removes all three", E("() => state.notes.length") == 37 and E("() => !state.notes.some(n => /^Untitled|^Scratch/.test(n.title))"))
    check("...the counts update", E("() => document.querySelector('.tb.show .tbn-chip[data-chip=tidy] span').textContent") == "0")
    pg.locator(".tb.show .tbn-chip[data-chip='all']").click(); pg.wait_for_timeout(100)
    pg.locator(".tb.show .tbn-table tbody tr").first.locator(".tbn-t").click(); pg.wait_for_timeout(250)
    check("clicking a note opens it", E("() => panes.some(q => q.type === 'note' && q.note() && q.note().title === 'Shift log')"))
    E("() => { tb.view = 'notes'; tbShow(); tbRenderAll(); }"); pg.wait_for_timeout(150)
    pg.locator(".tb.show [data-nmode='overview']").click(); pg.wait_for_timeout(150)
    check("Overview / All notes switch", E("() => !!document.querySelector('.tb.show .tbn-pinned') && !document.querySelector('.tb.show .tbn-all')"))
    print("  errors:", errs or "none"); ok &= not errs
    b.close()
print("ALL PASS" if ok else "FAILURES")
