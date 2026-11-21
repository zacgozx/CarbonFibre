import os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
from playwright.sync_api import sync_playwright
# Sheet formulas that went wrong: ROUND as Excel rounds, long chains asked for from their far end,
# MIN and MAX over very large ranges.
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-66s %s %s" % (label, "ok" if good else "FAIL", detail))
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF); pg.wait_for_timeout(500)
    E = pg.evaluate
    calc = """rows => { const c = makeSheetCalc(() => rows, 'X'); return rows[0].map((_, i) => { const v = c.value(0, i); return shIsErr(v) ? v.err : v; }); }"""
    r = E(calc, [["=ROUND(1.005, 2)", "=ROUND(-2.5, 0)", "=ROUND(2.5, 0)", "=ROUND(2.675, 2)", "=ROUND(1234.5, -2)", "=ROUND(-1.005, 2)", "=ROUND(0, 2)"]])
    check("ROUND as Excel: 1.005 -> 1.01, -2.5 -> -3, 2.5 -> 3, 2.675 -> 2.68, -2 places", r == [1.01, -3, 3, 2.68, 1200, -1.01, 0], str(r))
    for n in (2000, 20000):
        v = E("""n => { const rows = [['1']]; for (let i = 1; i < n; i++) rows.push(['=A' + i + '+1']); const c = makeSheetCalc(() => rows, 'X'); const v = c.value(n - 1, 0); return shIsErr(v) ? v.err : v; }""", n)
        check("a %d-row chain asked for from its end gives %d, not #ERROR!" % (n, n), v == n, str(v))
    v = E("""() => { const rows = [['1', '=A2000'], ['', '']]; for (let i = 2; i <= 2000; i++) rows[i - 1] = ['=A' + (i - 1) + '+1', '']; const c = makeSheetCalc(() => rows, 'X'); const t = c.value(0, 1), m = c.value(1999, 0); return [shIsErr(t) ? t.err : t, shIsErr(m) ? m.err : m]; }""")
    check("...and a total at the top pointing at the last row", v == [2000, 2000], str(v))
    check("a real cycle still says #CYCLE!", E(calc, [["=B1", "=A1"]])[0] == "#CYCLE!")
    v = E("""() => { const rows = [['=MAX(A2:A200001)', '=MIN(A2:A200001)']]; for (let i = 0; i < 200000; i++) rows.push([String(i - 5), '']); const c = makeSheetCalc(() => rows, 'X'); return [c.value(0, 0), c.value(0, 1)]; }""")
    check("MAX and MIN over 200,000 cells", v == [199994, -5], str(v))
    check("no errors", not errs, errs[:2])
    b.close()
print("ALL PASS" if ok else "FAILURES"); sys.exit(0 if ok else 1)
