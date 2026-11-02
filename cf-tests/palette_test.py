import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
from playwright.sync_api import sync_playwright
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-66s %s %s" % (label, "ok" if good else "FAIL", detail))
def rgb(h): return "rgb(%d, %d, %d)" % (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16))
content = "# N\nThe <span style=\"color:red\">red</span> and <span style=\"color:teal\">teal</span> words.\nx"
with sync_playwright() as p:
    b = p.chromium.launch()
    for scheme in ("dark", "light"):
        pg = b.new_page(viewport={"width": 1300, "height": 700}, color_scheme=scheme)
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto("file://" + CF)
        pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-v1', s); }", json.dumps({"notes": [{"id": 1, "title": "N", "content": content}], "seq": 2}))
        pg.reload(); pg.wait_for_timeout(500); pg.evaluate("() => panes[0].deactivate()")
        E = lambda js, *a: pg.evaluate(js, *a)
        pal = E("() => PALETTE.map(c => [c.key, c.dark, c.light])")
        shade = {k: (d if scheme == "dark" else l) for k, d, l in pal}
        got = E("() => [...panes[0].linesEl.querySelectorAll('.tc')].map(e => getComputedStyle(e).color)")
        check("%-5s: note text 'red' and 'teal' use the palette's shades" % scheme, got == [rgb(shade["red"]), rgb(shade["teal"])], str(got))
        sw = E("() => SK_PALETTE.map(c => c.hex)")
        check("%-5s: the sketch swatches are the palette (dark shades)" % scheme, sw == [d for k, d, l in pal])
        ink = E("() => PALETTE.map(c => skInk(c.dark))")
        check("%-5s: a swatch on the board draws the same shade as text" % scheme, [i.lower() for i in ink] == [shade[k].lower() for k, d, l in pal], str(ink[:3]))
        check("%-5s: text colours are the palette minus ink" % scheme, E("() => TEXT_COLOURS") == [k for k, d, l in pal if k != "ink"])
        check("%-5s: the palette commands list every text colour" % scheme, E("() => palCommands().filter(c => c.label.startsWith('Text colour:')).length") == len(pal))
        check("%-5s: an older drawing's colour still maps on the light page" % scheme, E("() => skInk('#c2453f')").lower() == ("#c2453f" if scheme == "dark" else "#b4323f"))
        check("%-5s: Mermaid shapes take their colours from the palette" % scheme, E("() => [MM_INK['fc-diamond'], MM_INK['fc-pill']]") == [dict((k, d) for k, d, l in pal)[x] for x in ("orange", "blue")])
        print("  errors:", errs or "none"); ok &= not errs
        pg.close()
    b.close()
print("ALL PASS" if ok else "FAILURES")
