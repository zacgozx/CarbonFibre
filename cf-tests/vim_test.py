import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
from playwright.sync_api import sync_playwright
# Vim keys (off by default): motions, operators with motions and text objects, counts, insert, visual,
# put, undo, repeat, search and :s. Each check starts from the same text.
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-66s %s %s" % (label, "ok" if good else "FAIL", detail))
TEXT = "first line here\nsecond (inner words) line\nthird \"quoted text\" end\nfourth line"
notes = [{"id": 1, "title": "V", "content": TEXT}]
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1200, "height": 800})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF)
    pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-welcomed', '1'); localStorage.setItem('carbonfibre-v1', s); }", json.dumps({"notes": notes, "seq": 2}))
    pg.reload(); pg.wait_for_timeout(500)
    E = lambda js, *a: pg.evaluate(js, *a)
    E("() => openInPane(1, panes[0])"); pg.wait_for_timeout(150)
    check("off by default: keys type as usual", E("() => Vim.on") is False)
    E("() => { panes[0].setActive(0, 0); }"); pg.keyboard.type("j"); pg.wait_for_timeout(50)
    check("...j typed a j", E("() => panes[0].lines[0]") == "jfirst line here")
    E("() => { histUndo(panes[0]); Vim.toggle(); }"); pg.wait_for_timeout(50)
    check("the status bar shows NORMAL", "NORMAL" in E("() => document.getElementById('sbVim').textContent"))

    def reset(l=0, c=0):
        E("t => { const q = panes[0]; q.deactivate(); q.lines = t.split('\\n'); q.commit(true); q.render(); Vim.mode = 'normal'; Vim.vis = null; Vim.keys = ''; Vim.show(); }", TEXT)
        E("a => panes[0].setActive(a[0], a[1])", [l, c]); pg.wait_for_timeout(30)
    def keys(seq):
        for k in seq:
            pg.keyboard.press(k)
        pg.wait_for_timeout(40)
    lines = lambda: E("() => panes[0].lines.slice()")
    pos = lambda: E("() => [panes[0].activeLine, panes[0].ta.selectionStart]")

    reset(); keys(["w", "w"]); check("w moves by words", pos() == [0, 11], str(pos()))
    keys(["w"]); check("...and on to the next line", pos() == [1, 0], str(pos()))
    keys(["e"]); check("e: end of word", pos() == [1, 5], str(pos()))
    keys(["b", "b"]); check("b: back across the line break", pos() == [0, 11], str(pos()))
    keys(["2", "j"]); check("2j keeps the column", pos() == [2, 11], str(pos()))
    keys(["$"]); check("$: last character", pos() == [2, 22], str(pos()))
    keys(["0"]); check("0: start of line", pos() == [2, 0], str(pos()))
    keys(["G"]); check("G: last line", pos()[0] == 3)
    keys(["g", "g"]); check("gg: first line", pos()[0] == 0)
    keys(["f", "l"]); check("fl: to the next l", pos() == [0, 6], str(pos()))

    print("OPERATORS")
    reset(); keys(["d", "w"]); check("dw deletes a word", lines()[0] == "line here", lines()[0])
    keys(["u"]); check("u undoes it", lines()[0] == "first line here")
    keys(["Control+r"]); check("Ctrl+R redoes it (it used to read as the < operator)", lines()[0] == "line here", lines()[0])
    reset(); keys(["d", "d"]); check("dd deletes the line", lines()[0] == "second (inner words) line")
    keys(["p"]); check("p puts it back below", lines()[1] == "first line here", str(lines()[:2]))
    reset(); keys(["2", "d", "d"]); check("2dd deletes two lines", lines()[0] == "third \"quoted text\" end")
    reset(1, 10); keys(["c", "i", "("]); pg.keyboard.type("X"); keys(["Escape"])
    check("ci( changes inside the brackets", lines()[1] == "second (X) line", lines()[1])
    check("Esc goes back to normal mode", E("() => Vim.mode") == "normal")
    reset(2, 9); keys(["d", "i", "\""]); check("di\" deletes inside the quotes", lines()[2] == "third \"\" end", lines()[2])
    reset(0, 1); keys(["c", "w"]); pg.keyboard.type("ONE"); keys(["Escape"])
    check("cw changes to the end of the word", lines()[0] == "fONE line here", lines()[0])
    reset(); keys(["y", "y", "j", "P"]); check("yy then P puts a copy above", lines()[1] == "first line here" and lines()[2].startswith("second"), str(lines()[:3]))
    reset(); keys(["x", "x"]); check("x deletes a character", lines()[0] == "rst line here")
    keys(["."]); check(". repeats the last change", lines()[0] == "st line here", lines()[0])
    reset(); keys(["d", "w", "j", "."]); check(". repeats dw on another line", lines()[1] == "(inner words) line", lines()[1])
    reset(); keys(["J"]); check("J joins the next line", lines()[0] == "first line here second (inner words) line", lines()[0])
    reset(); keys(["~", "~"]); check("~ flips case", lines()[0].startswith("FIrst"))
    reset(); keys([">", ">"]); check(">> indents", lines()[0] == "  first line here")
    reset(); keys(["r", "R"]); check("r replaces a character", lines()[0] == "Rirst line here")

    print("INSERT")
    reset(); keys(["A"]); pg.keyboard.type("!"); keys(["Escape"]); check("A types at the end", lines()[0] == "first line here!")
    reset(); keys(["o"]); pg.keyboard.type("new"); keys(["Escape"]); check("o opens a line below", lines()[1] == "new")
    reset(); keys(["I"]); check("I: insert mode at the start", E("() => Vim.mode") == "insert" and pos() == [0, 0])
    keys(["Escape"])

    print("VISUAL")
    reset(); keys(["v", "e", "d"]); check("v e d deletes the word", lines()[0] == " line here", lines()[0])
    reset(); keys(["V", "j", "d"]); check("V j d deletes two lines", lines()[0].startswith("third"), str(lines()[:1]))
    reset(); keys(["v", "j", "y"]); check("v j y yanks across lines", E("() => Vim.reg.text") == "first line here\ns", E("() => Vim.reg.text"))
    check("...and leaves visual mode", E("() => Vim.mode") == "normal" and not E("() => panes[0].allSelected"))

    print("SEARCH AND :s")
    reset(); E("() => { Vim.search = { q: 'line', back: false }; }"); keys(["n"]); check("n finds the next match", pos() == [0, 6], str(pos()))
    keys(["n"]); check("...and the one after", pos() == [1, 21], str(pos()))
    reset(); E("() => Vim.ex(panes[0], '%s/line/LINE/g')"); pg.wait_for_timeout(50)
    check(":%s replaces in every line", lines()[0] == "first LINE here" and lines()[3] == "fourth LINE", str(lines()))
    E("() => Vim.ex(panes[0], '3')"); check(":3 goes to line 3", pos()[0] == 2)
    check("Ctrl+ shortcuts still reach the app (Ctrl+Z not taken)", E("() => { const e = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, cancelable: true }); return Vim.key(panes[0], panes[0].ta, e); }") is False)
    E("() => Vim.toggle()")
    check("off again: keys type", E("() => Vim.on") is False)
    check("no errors", not errs, errs[:2])
    b.close()
print("ALL PASS" if ok else "FAILURES"); sys.exit(0 if ok else 1)
