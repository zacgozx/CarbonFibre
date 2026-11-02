import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
from playwright.sync_api import sync_playwright
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-62s %s %s" % (label, "ok" if good else "FAIL", detail))
SHOT = os.environ.get("CF_SHOT")
VAULT = """() => {
  const D = 864e5, now = Date.now();
  state.backend = 'folder'; state.folders = [{ path: 'Incidents' }, { path: 'Changes' }, { path: 'Daily' }, { path: 'Runbooks' }];
  const mk = (path, content, daysAgo) => ({ id: path, path: path, title: path.split('/').pop().replace(/\\.md$/, ''), content: content, handle: null, parent: null, mtime: now - daysAgo * D });
  state.notes = [
    mk('Incidents/INC0048812 Exchange node.md', '# INC0048812\\nForwarders stopped after the HEC restart. #splunk #exchange\\n- [ ] check tokens\\nSee [[Splunk HEC restart]]', 1),
    mk('Incidents/INC0048654 ExtraHop gap.md', '# INC0048654\\nCapture gap overnight on the ExtraHop sensor. #extrahop', 3),
    mk('Changes/CHG0031204 Payroll downtime.md', '# CHG0031204\\nPayroll batch downtime window, Sensu silenced. #sensu', 40),
    mk('Daily/2026-10-23.md', '# 2026-10-23\\nQuiet morning, two incidents.', 1),
    mk('Daily/2026-09-02.md', '# 2026-09-02\\nOld daily.', 51),
    mk('Runbooks/Splunk HEC restart.md', '# Splunk HEC restart\\nSteps to restart the HEC input safely. #splunk', 10),
    mk('Shift handover.md', '# Shift handover\\nOpen items for the next shift.', 2),
    mk('Ideas.md', '# Ideas\\nSome loose thoughts about dashboards.', 70)
  ];
  renderSidebar(); }"""
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1500, "height": 900}, color_scheme=os.environ.get("CF_SCHEME", "light"))
    pg.add_init_script("try { localStorage.setItem('carbonfibre-welcomed', '1'); } catch (e) {}")   # a returning user: no first-visit dialog
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF); pg.evaluate("() => localStorage.clear()"); pg.reload(); pg.wait_for_timeout(400)
    E = lambda js, *a: pg.evaluate(js, *a)
    E(VAULT); pg.wait_for_timeout(200)
    E("() => document.querySelector('.pane-col').dispatchEvent(new KeyboardEvent('keydown', { key: '\u02dc', code: 'KeyN', altKey: true, bubbles: true, cancelable: true }))"); pg.wait_for_timeout(300)
    check("Alt+N / Option+N opens All notes", E("() => tb.view === 'notes' && tb.notesMode === 'all' && !!document.querySelector('.tb.show .tbn-table')"))
    check("...with the search box ready to type in", E("() => document.activeElement && document.activeElement.classList.contains('tbn-search')"))
    rows = lambda: E("() => [...document.querySelectorAll('.tb.show .tbn-table tbody tr[data-open]')].map(r => r.querySelector('.tbn-tt').childNodes[r.querySelector('.tbn-pin') ? 1 : 0].textContent.trim() + '|' + r.querySelector('.tbn-type').textContent)")
    types = dict(r.split("|") for r in rows())
    check("types worked out from names and folders", types.get("INC0048812 Exchange node") == "Incident" and types.get("CHG0031204 Payroll downtime") == "Change" and types.get("2026-10-23") == "Daily"
          and types.get("Splunk HEC restart") == "Runbook" and types.get("Shift handover") == "Handover" and types.get("Ideas") == "Note", str(types))
    chips = E("() => [...document.querySelectorAll('.tb.show .tbn-types .tbn-chip')].map(c => c.textContent)")
    check("type chips with counts", chips == ["Any", "Incident2", "Change1", "Daily2", "Handover1", "Runbook1", "Note1"], str(chips))
    r0 = E("() => { const r = [...document.querySelectorAll('.tb.show .tbn-table tbody tr[data-open]')].find(x => x.textContent.includes('INC0048812')); return [r.querySelector('.tbn-pv2').textContent, [...r.querySelectorAll('.tbn-tag')].map(t => t.textContent)]; }")
    check("a preview line and tags under each name", r0[0] == "Forwarders stopped after the HEC restart. #splunk #exchange" and r0[1] == ["#exchange", "#splunk"], str(r0))
    pg.locator(".tb.show .tbn-types .tbn-chip", has_text="Incident").click(); pg.wait_for_timeout(150)
    check("the Incident chip shows only incidents", sorted(r.split("|")[0] for r in rows()) == ["INC0048654 ExtraHop gap", "INC0048812 Exchange node"])
    pg.locator(".tb.show .tbn-types .tbn-chip", has_text="Any").click(); pg.wait_for_timeout(150)
    pg.locator(".tb.show .tbn-search").fill("#splunk"); pg.wait_for_timeout(200)
    check("search by #tag", sorted(r.split("|")[0] for r in rows()) == ["INC0048812 Exchange node", "Splunk HEC restart"], str(rows()))
    pg.locator(".tb.show .tbn-search").fill("hec restart"); pg.wait_for_timeout(200)
    check("several words: every one must appear (name, folder, preview)", sorted(r.split("|")[0] for r in rows()) == ["INC0048812 Exchange node", "Splunk HEC restart"], str(rows()))
    pg.locator(".tb.show .tbn-search").fill(""); pg.wait_for_timeout(200)
    pg.select_option(".tb.show .tbn-group", "type"); pg.wait_for_timeout(200)
    g = E("() => [...document.querySelectorAll('.tb.show .tbn-grp td')].map(t => t.textContent)")
    check("group by type: headers in type order with counts", g == ["Incident2", "Change1", "Daily2", "Handover1", "Runbook1", "Note1"], str(g))
    pg.select_option(".tb.show .tbn-group", "folder"); pg.wait_for_timeout(200)
    g = E("() => [...document.querySelectorAll('.tb.show .tbn-grp td')].map(t => t.textContent)")
    check("group by folder", g == ["Changes1", "Daily2", "Incidents2", "Runbooks1", "(top level)2"], str(g))
    pg.select_option(".tb.show .tbn-group", "month"); pg.wait_for_timeout(200)
    check("group by month: newest month first", E("() => document.querySelectorAll('.tb.show .tbn-grp').length") >= 2 and E("() => { const g = [...document.querySelectorAll('.tb.show .tbn-grp td')].map(t => t.textContent); return g[0].includes(new Date().getFullYear()) && !g[g.length - 1].startsWith(new Date().toLocaleDateString(undefined, { month: 'long' })); }"))
    if SHOT:
        pg.select_option(".tb.show .tbn-group", "type"); pg.wait_for_timeout(200); pg.screenshot(path=SHOT)
    pg.select_option(".tb.show .tbn-group", "none"); pg.wait_for_timeout(150)
    pg.locator(".tb.show .tbn-table tbody tr[data-open]", has_text="Ideas").click(); pg.wait_for_timeout(250)
    check("with one pane, a note opens in place", E("() => panes[0].type === 'note' && panes[0].note().title") == "Ideas")
    E("() => { addPane(panes[0], 'Shift handover.md'); }"); pg.wait_for_timeout(200)
    pg.locator("#actLibrary").click(); pg.wait_for_timeout(300)
    lib = E("() => panes.findIndex(q => q.type === 'taskboard')")
    check("the rail's library button opens it", lib >= 0 and E("() => tb.notesMode") == "all")
    pg.locator(".tb.show .tbn-table tbody tr[data-open]", has_text="ExtraHop").click(); pg.wait_for_timeout(250)
    check("with another pane, a note opens beside the library (library stays)", E("i => panes[i].type === 'taskboard' && panes.some((q, k) => k !== i && q.type === 'note' && q.note().title.startsWith('INC0048654'))", lib), str(E("() => panes.map(q => q.type + ':' + (q.note && q.note() ? q.note().title : ''))")))
    print("  errors:", errs or "none"); ok &= not errs
    b.close()
print("ALL PASS" if ok else "FAILURES")
