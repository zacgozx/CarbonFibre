import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))   # the app under test
import json, time
from playwright.sync_api import sync_playwright
SRC = open(os.path.join(HERE, 'state_src.txt')).read()
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-64s %s %s" % (label, "ok" if good else "FAIL", detail))
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1500, "height": 950}, color_scheme="dark")
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF)
    pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-v1', s); }", json.dumps({"notes": [{"id": 1, "title": "IR", "content": "# Incident response\n\n```mermaid\n" + SRC + "\n```\n"}], "seq": 2}))
    pg.reload(); pg.wait_for_timeout(600)
    E = lambda js, *a: pg.evaluate(js, *a)
    g = E("src => { const g = parseMermaid(src); const ids = Object.keys(g.nodes); return { states: ids.filter(i => !g.nodes[i].pseudo && !g.nodes[i].note && g.nodes[i].defined !== false).length, starts: ids.filter(i => g.nodes[i].pseudo === 'start').length, ends: ids.filter(i => g.nodes[i].pseudo === 'end').length, notes: ids.filter(i => g.nodes[i].note).length, edges: g.edges.length, groups: g.groups.length, nested: g.groups.filter(x => x.parent).length, deepest: Math.max(...g.groups.map(x => { let d = 0, y = x; while (y.parent) { y = y.parent; d++; } return d; })), styled: ids.filter(i => g.nodes[i].style && g.nodes[i].style.fill && !g.nodes[i].pseudo && !g.nodes[i].note).length, warnings: g.warnings, label: g.nodes.AlertValidation.label, groupTitle: g.groups[0].title }; }", SRC)
    print("  parsed:", g)
    check("every state parsed, no lines skipped", g["warnings"] == [] and g["states"] == 114, "%d states" % g["states"])
    check("23 boxes, nested three deep (Investigation > Parallel > Technical)", g["groups"] == 23 and g["deepest"] == 2, "%d groups, %d nested" % (g["groups"], g["nested"]))
    check("a start dot and end ring per box that uses [*]", g["starts"] == 8 and g["ends"] == 8, "%d starts, %d ends" % (g["starts"], g["ends"]))
    check("the four notes", g["notes"] == 4)
    check("classDef colours on the classed states (52)", g["styled"] == 52, str(g["styled"]))
    check("CamelCase ids read as words ('Alert Validation')", g["label"] == "Alert Validation")
    t0 = time.time()
    pg.get_by_text("convert to sketch", exact=False).first.click(); pg.wait_for_timeout(500)
    print("    convert took %.1f s" % (time.time() - t0))
    check("convert to sketch makes a sketch", pg.locator(".pane-col .skp-img").count() == 1 or pg.locator(".pane-col [data-sketch]").count() >= 1)
    pg.locator(".pane-col .skp-img").first.click(); pg.wait_for_timeout(600)
    r = E("""() => { const els = sk.elements.filter(e => !e.isDeleted), rects = els.filter(e => e.type === 'rectangle'), st = els.filter(e => e.type === 'stencil'), links = els.filter(e => skIsConnector(e));
        const inside = (a, b) => a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.width <= b.x + b.width + 1 && a.y + a.height <= b.y + b.height + 1;
        let overlapsBox = 0; for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) { const a = st[i], c = st[j]; if (a.x < c.x + c.width && c.x < a.x + a.width && a.y < c.y + c.height && c.y < a.y + a.height) overlapsBox++; }
        return { boxes: rects.length, shapes: st.length, links: links.length, labelled: links.filter(l => l.label).length, shapeOverlaps: overlapsBox,
                 titles: els.filter(e => e.type === 'text').map(t => t.text).slice(0, 3) }; }""")
    print("  sketch:", r)
    check("23 boxes, every link drawn (161 + 4 note links), 34 labelled", r["boxes"] == 23 and r["links"] == 165 and r["labelled"] == 34, str(r))
    check("no shapes overlap", r["shapeOverlaps"] == 0, str(r["shapeOverlaps"]))
    nest = E("""() => { const rects = sk.elements.filter(e => e.type === 'rectangle'), txt = sk.elements.filter(e => e.type === 'text');
        const box = t => rects.find(r => Math.abs(r.x + 10 - t.x) < 2 && Math.abs(r.y + 8 - t.y) < 2), byTitle = s => box(txt.find(t => t.text === s));
        const inside = (a, b) => a && b && a.x > b.x && a.y > b.y && a.x + a.width < b.x + b.width && a.y + a.height < b.y + b.height;
        /* sibling boxes in one parent must not overlap */
        const boxes = rects.map(r => ({ r: r, t: txt.find(t => Math.abs(r.x + 10 - t.x) < 2 && Math.abs(r.y + 8 - t.y) < 2) }));
        const parentOf = b => boxes.filter(o => o !== b && inside(b.r, o.r)).sort((x, y) => x.r.width * x.r.height - y.r.width * y.r.height)[0];
        let siblingOverlaps = [];
        boxes.forEach((a, i) => boxes.forEach((c, j) => { if (j <= i || inside(a.r, c.r) || inside(c.r, a.r)) return;
          if (a.r.x < c.r.x + c.r.width && c.r.x < a.r.x + a.r.width && a.r.y < c.r.y + c.r.height && c.r.y < a.r.y + a.r.height) siblingOverlaps.push((a.t ? a.t.text : '?') + ' / ' + (c.t ? c.t.text : '?')); }));
        return { siblingOverlaps: siblingOverlaps, techInParallel: inside(byTitle('Technical Investigation'), byTitle('Parallel Workstreams')), parallelInInvestigation: inside(byTitle('Parallel Workstreams'), byTitle('03 — Coordinated Investigation')),
                 signalInIntake: inside(byTitle('Signal Quality Gate'), byTitle('01 — Detection & Intake')) }; }""")
    so = nest.pop("siblingOverlaps")
    check("nested boxes sit inside their outer boxes", all(nest.values()), str(nest))
    check("no two boxes overlap unless one is inside the other", so == [], str(so[:4]))
    nd = E("""() => { const els = sk.elements.filter(e => !e.isDeleted), notes = els.filter(e => e.type === 'stencil' && e.fill === '#fef9c3');
        return notes.map(nt => { const link = els.find(l => skIsConnector(l) && l.fromId === nt.id), tgt = link && skFindEl(link.toId);
          if (!tgt) return 'unlinked';
          const gap = nt.x - (tgt.x + tgt.width);
          return Math.round(gap) + 'px right of ' + (tgt.type === 'rectangle' ? 'its box' : 'its state') + ', top ' + Math.round(nt.y - tgt.y) + 'px below its top'; }); }""")
    check("each note sits just right of the box it describes", len(nd) == 4 and all(x.startswith("40px right of its box") for x in nd), str(nd))
    E("() => document.getElementById('skFit').click()"); pg.wait_for_timeout(300)
    pg.screenshot(path="/tmp/cf_test.png", clip={"x": 390, "y": 78, "width": 1110, "height": 870})
    E("() => { const t = sk.elements.find(e => e.type === 'text' && e.text === '03 — Coordinated Investigation'); sk.cam.x = t.x + 600; sk.cam.y = t.y + 330; sk.cam.k = 0.75; skDraw(); }"); pg.wait_for_timeout(300)
    pg.screenshot(path="/tmp/cf_test.png", clip={"x": 390, "y": 78, "width": 1110, "height": 870})
    print("  errors:", errs or "none"); ok &= not errs
    b.close()
print("ALL PASS" if ok else "FAILURES")
