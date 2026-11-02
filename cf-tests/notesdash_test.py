import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
from playwright.sync_api import sync_playwright
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-62s %s %s" % (label, "ok" if good else "FAIL", detail))
SHOT = os.environ.get("CF_SHOT")
VAULT = """() => {
  const H = 3600e3, now = Date.now();
  state.backend = 'folder'; state.folders = [{ path: 'Incidents' }, { path: 'Incidents/2026' }, { path: 'Runbooks' }, { path: 'Daily' }];
  const mk = (path, content, hoursAgo) => ({ id: path, path: path, title: path.split('/').pop().replace(/\\.md$/, ''), content: content, handle: null, parent: null, mtime: now - hoursAgo * H });
  state.notes = [
    mk('Exchange troubleshooting log.md', '# Exchange troubleshooting log\\nForwarders queued for 40 minutes after **HEC** restart.\\n- [ ] check tokens\\n- [ ] confirm backlog\\n- [x] restart', 1),
    mk('Shift handover.md', '# Shift handover\\n\\n## Open incidents\\n- INC0048812 still open', 5),
    mk('Runbooks/Splunk HEC restart.md', '# Splunk HEC restart\\nSteps to restart the HEC input safely.', 30),
    mk('Runbooks/Sensu decommission.md', '# Sensu decommission\\n- [ ] remove checks', 50),
    mk('Daily/2026-10-13.md', '# 2026-10-13\\nlog', 2)
  ].concat(Array.from({ length: 10 }, (_, i) => mk('Incidents/2026/INC00490' + i + '.md', '# INC00490' + i + '\\nIncident note ' + i, 3 + i)));
  Object.keys(pinned).forEach(k => delete pinned[k]);
  pinned['Exchange troubleshooting log.md'] = 1; pinned['Shift handover.md'] = 1; pinned['folder:Runbooks'] = 1; pinned['folder:Incidents'] = 1; savePins();
  tb.tasks = []; const t = tbAdd('INC0048812', 'Exchange node not reporting', 45); t.noteId = 'Exchange troubleshooting log.md'; tbStart(t);
  window.createNote = function (dir) { window.__made = dir; };
  renderSidebar(); tb.view = 'notes'; tbShow(); tbRenderAll(); }"""
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1500, "height": 950}, color_scheme=os.environ.get("CF_SCHEME", "light"))
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF); pg.evaluate("() => localStorage.clear()"); pg.reload(); pg.wait_for_timeout(400)
    E = lambda js, *a: pg.evaluate(js, *a)
    E(VAULT); pg.wait_for_timeout(300)
    check("the switch reads Dashboard, Notes, Board", E("() => [...document.querySelectorAll('.tb.show .tb-view')].map(v => v.textContent)") == ["Dashboard", "Notes", "Board"])
    check("the tab is titled Notes while that view shows", E("() => document.querySelector('.tab-board .tab-lbl').textContent.trim()") == "Notes")
    cards = E("() => [...document.querySelectorAll('.tb.show .tbn-card h4')].map(h => h.textContent)")
    check("pinned notes as cards, most recently edited first", cards == ["Exchange troubleshooting log", "Shift handover"], str(cards))
    c0 = E("() => { const c = document.querySelector('.tb.show .tbn-card'); return { pv: c.querySelector('.tbn-pv').textContent, todo: (c.querySelector('.tbn-todo') || {}).textContent, ticket: (c.querySelector('.tbn-ticket') || {}).textContent, when: c.querySelector('.tbn-when').textContent }; }")
    check("a card shows a preview without markdown", c0["pv"] == "Forwarders queued for 40 minutes after HEC restart.", c0["pv"])
    check("...its open checkboxes and its ticket", c0["todo"] == "2 open tasks" and c0["ticket"] == "INC0048812", str(c0))
    check("...and when it was edited", c0["when"] == "1h ago", c0["when"])
    check("a heading-only note previews its first real line", E("() => document.querySelectorAll('.tb.show .tbn-card .tbn-pv')[1].textContent") == "INC0048812 still open")
    fs = E("() => [...document.querySelectorAll('.tb.show .tbn-folder')].map(f => f.querySelector('.tbn-fname').textContent + ':' + f.querySelector('.tbd-count').textContent + ':' + f.querySelectorAll('.tbn-row').length)")
    check("a panel per pinned folder, with its count (subfolders included)", fs == ["Incidents:10:8", "Runbooks:2:2"], str(fs))
    check("a subfolder note shows its path", E("() => document.querySelector('.tb.show .tbn-folder .tbn-row .tbn-sub').textContent") == "2026/")
    pg.locator(".tb.show .tbn-more").click(); pg.wait_for_timeout(150)
    check("'Show all 10' expands the folder", E("() => document.querySelectorAll('.tb.show .tbn-folder')[0].querySelectorAll('.tbn-row').length") == 10)
    rec = E("() => [...document.querySelectorAll('.tb.show .tbn-recent .tbn-row-t')].map(r => r.textContent)")
    check("Recent notes leaves out the pinned ones", rec[0] == "Daily/2026-10-13" and "Exchange troubleshooting log" not in rec, str(rec[:3]))
    print("CLICKS")
    pg.locator(".tb.show .tbn-folder", has_text="Runbooks").locator("[data-newin]").click(); pg.wait_for_timeout(100)
    check("+ New note creates one in that folder", E("() => window.__made") == "Runbooks")
    pg.locator(".tb.show .tbn-recent .tbn-row").first.hover(); pg.locator(".tb.show .tbn-recent .tbn-row").first.locator("[data-pin]").click(); pg.wait_for_timeout(200)
    check("the star on a recent note pins it (it joins the cards)", "2026-10-13" in E("() => [...document.querySelectorAll('.tb.show .tbn-card h4')].map(h => h.textContent).join(',')"))
    pg.locator(".tb.show .tbn-card", has_text="2026-10-13").hover(); pg.locator(".tb.show .tbn-card", has_text="2026-10-13").locator("[data-unpin]").click(); pg.wait_for_timeout(200)
    check("the star on a card unpins it", E("() => document.querySelectorAll('.tb.show .tbn-card').length") == 2)
    pg.locator(".tb.show .tbn-folder", has_text="Runbooks").locator("[data-unpin-folder]").click(); pg.wait_for_timeout(200)
    check("the star on a folder panel unpins the folder", E("() => [...document.querySelectorAll('.tb.show .tbn-folder .tbn-fname')].map(f => f.textContent)") == ["Incidents"])
    if SHOT:
        E("() => { pinned['folder:Runbooks'] = 1; savePins(); tbRenderAll(); }"); pg.wait_for_timeout(200); pg.screenshot(path=SHOT)
    pg.locator(".tb.show .tbn-card").first.click(); pg.wait_for_timeout(300)
    check("clicking a card opens the note", E("() => panes.some(q => q.type === 'note' && q.note() && q.note().title === 'Exchange troubleshooting log')"))
    pg.keyboard.press("Control+p"); pg.keyboard.type(">notes dashboard"); pg.wait_for_timeout(100); pg.keyboard.press("Enter"); pg.wait_for_timeout(300)
    check("Ctrl+P 'Open notes dashboard' goes straight there", E("() => tb.view === 'notes' && !document.querySelector('.tb.show .tb-notes').hidden"))
    E("() => { state.backend = 'browser'; Object.keys(pinned).filter(k => k.startsWith('folder:')).forEach(k => delete pinned[k]); tbRenderAll(); }")
    check("in browser storage, the folders panel says folders come with a vault", "vault folder" in E("() => document.querySelector('.tb.show .tbn-nofolders').textContent"))
    print("  errors:", errs or "none"); ok &= not errs
    b.close()
print("ALL PASS" if ok else "FAILURES")
