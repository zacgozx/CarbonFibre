import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
if not os.path.exists(CF): CF = "/mnt/user-data/outputs/CarbonFibre.html"
from playwright.sync_api import sync_playwright
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-62s %s %s" % (label, "ok" if good else "FAIL", detail))
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1400, "height": 850})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF)
    pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-v1', s); }", json.dumps({"notes": [{"id": 1, "title": "N", "content": "# N"}], "seq": 2}))
    pg.reload(); pg.wait_for_timeout(400)
    E = lambda js, *a: pg.evaluate(js, *a)
    E("""() => { createSheet('Hosts', [['Host', 'CPU'], ['idx01', '40'], ['idx02', '55'], ['sh01', '20']]);
      createSheet('Q1 2026', [['Jan', '10'], ['Feb', '12'], ['Mar', '9']]);
      const sh = createSheet('Report', [['Item', 'Value'], ['Hosts CPU total', '=SUM(Hosts!B2:B4)'], ['Q1 total', "=SUM('Q1 2026'!B1:B3)"], ['sh01 CPU', '=VLOOKUP("sh01", Hosts!A2:B4, 2, FALSE)'], ['Total', '=B2+B3'], ['Missing', '=Nope!A1']]);
      openSheetInPane(panes[0], sh.id); }"""); pg.wait_for_timeout(300)
    cell = lambda r, c: pg.locator(".sheet-wrap.show td[data-r='%d'][data-c='%d']" % (r, c)).text_content()
    raw = lambda r, c: E("p => panes[0].grid.sheet.rows[p[0]][p[1]]", [r, c])
    print("OTHER SHEETS")
    check("=SUM(Hosts!B2:B4) reads the Hosts sheet (115)", cell(1, 1) == "115", cell(1, 1))
    check("='Q1 2026'!... with a quoted name (31)", cell(2, 1) == "31", cell(2, 1))
    check("VLOOKUP into another sheet (20)", cell(3, 1) == "20", cell(3, 1))
    check("an unknown sheet shows #REF!", cell(5, 1) == "#REF!", cell(5, 1))
    print("ROWS AND COLUMNS")
    pg.locator(".sheet-wrap.show td[data-r='1'][data-c='0']").click(); pg.click(".sheet-wrap.show [data-sh='row+']"); pg.wait_for_timeout(150)
    check("insert a row above: =B2+B3 becomes =B2+B4, result unchanged", raw(5, 1) == "=B2+B4" and cell(5, 1) == "146", raw(5, 1) + " -> " + cell(5, 1))
    pg.locator(".sheet-wrap.show td[data-r='1'][data-c='0']").click(); pg.click(".sheet-wrap.show [data-sh='row-']"); pg.wait_for_timeout(150)
    check("delete a referenced row: that reference becomes #REF!", raw(4, 1) == "=#REF!+B3" and cell(4, 1) == "#REF!", raw(4, 1))
    pg.keyboard.press("Control+z"); pg.keyboard.press("Control+z"); pg.wait_for_timeout(150)
    check("undo restores the formulas", raw(4, 1) == "=B2+B3" and cell(4, 1) == "146", raw(4, 1))
    pg.locator(".sheet-wrap.show td[data-r='0'][data-c='0']").click(); pg.click(".sheet-wrap.show [data-sh='col+']"); pg.wait_for_timeout(150)
    check("insert a column after A: =B2+B3 becomes =C2+C3", raw(4, 2) == "=C2+C3" and cell(4, 2) == "146", raw(4, 2))
    pg.keyboard.press("Control+z"); pg.wait_for_timeout(100)
    print("CHANGING ANOTHER SHEET UPDATES REFERENCES TO IT")
    E("() => openSheetInPane(panes[0], sheets.find(s => s.title === 'Hosts').id)"); pg.wait_for_timeout(200)
    pg.locator(".sheet-wrap.show td[data-r='1'][data-c='0']").click(); pg.click(".sheet-wrap.show [data-sh='row+']"); pg.wait_for_timeout(150)
    rep = E("() => sheets.find(s => s.title === 'Report').rows.map(r => r[1])")
    check("a row added in Hosts: Report's Hosts!B2:B4 becomes B2:B5", rep[1] == "=SUM(Hosts!B2:B5)" and rep[3] == '=VLOOKUP("sh01", Hosts!A2:B5, 2, FALSE)', str(rep[1:4]))
    print("SORTING")
    E("""() => { const sh = createSheet('Calc', [['Qty', 'Price', 'Total'], ['3', '10', '=A2*B2'], ['1', '50', '=A3*B3'], ['2', '20', '=A4*B4']]); openSheetInPane(panes[0], sh.id); }"""); pg.wait_for_timeout(200)
    pg.locator(".sheet-wrap.show .sh-sortbtn[data-sort='0']").click(); pg.wait_for_timeout(150)   # the letter selects; its button sorts
    got = E("() => panes[0].grid.sheet.rows.slice(1).map(r => r.join(' '))")
    check("sorting moves each row's formula with it (=A2*B2 stays its own row)", got == ["1 50 =A2*B2", "2 20 =A3*B3", "3 10 =A4*B4"], str(got))
    check("...so every total is still right", [cell(r, 2) for r in (1, 2, 3)] == ["50", "40", "30"])
    print("FILLING")
    E("""() => { const sh = createSheet('Fill', [['=\\'Q1 2026\\'!B1', ''], ['', ''], ['', '']]); openSheetInPane(panes[0], sh.id); }"""); pg.wait_for_timeout(200)
    pg.locator(".sheet-wrap.show td[data-r='0'][data-c='0']").click(); pg.keyboard.down("Shift"); pg.locator(".sheet-wrap.show td[data-r='2'][data-c='0']").click(); pg.keyboard.up("Shift")
    pg.keyboard.press("Control+d"); pg.wait_for_timeout(150)
    check("Ctrl+D with a quoted sheet name: the name stays, the cell moves", [raw(1, 0), raw(2, 0)] == ["='Q1 2026'!B2", "='Q1 2026'!B3"] and [cell(1, 0), cell(2, 0)] == ["12", "9"], str([raw(1, 0), raw(2, 0)]))
    print("  errors:", errs or "none"); ok &= not errs
    b.close()
print("ALL PASS" if ok else "FAILURES")
