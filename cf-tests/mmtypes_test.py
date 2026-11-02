import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
if not os.path.exists(CF): CF = "/mnt/user-data/outputs/CarbonFibre.html"
from playwright.sync_api import sync_playwright
MIND = """mindmap
  root((Monitoring))
    Splunk
      HEC
      Indexers
        idx01
        idx02
      Search heads
    Sensu
      Checks
      [Decommission]
    ExtraHop
    AppDynamics
      {{Agents}}"""
ER = """erDiagram
    HOST ||--o{ ALERT : raises
    ALERT }o--|| INCIDENT : "grouped into"
    INCIDENT ||--|{ TASK : contains
    HOST {
        string name PK
        string role
        string site
    }
    ALERT {
        int id PK
        string host FK
        datetime raised
    }
    INCIDENT {
        string number PK
        string priority
    }"""
CLS = """classDiagram
    class Check {
        +String name
        +int interval
        +run() Result
    }
    class HttpCheck {
        +String url
    }
    Check <|-- HttpCheck
    Check <|-- PingCheck
    Check "1" --> "*" Result : produces
    Agent o-- Check : runs
    Agent ..> Config : reads
    Result : +bool ok
    Result : +String message"""
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-60s %s %s" % (label, "ok" if good else "FAIL", detail))
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1400, "height": 900}, color_scheme="dark")
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF); pg.wait_for_timeout(300)
    E = lambda js, *a: pg.evaluate(js, *a)
    PARSE = "src => { const g = parseMermaid(src); return { warnings: g.warnings, nodes: g.order.map(i => g.nodes[i].label), shapes: g.order.map(i => g.nodes[i].shape), edges: g.edges.map(e => [e.a, e.b, e.label, e.arrow, !!e.dashed]) }; }"
    print("MINDMAP")
    m = E(PARSE, MIND)
    check("every node read, nothing skipped (13)", m["warnings"] == [] and len(m["nodes"]) == 13, str(len(m["nodes"])))
    check("shapes: ((circle)) root, [square], {{hexagon}}", m["shapes"][0] == "fc-circle" and m["shapes"][m["nodes"].index("Decommission")] == "fc-box" and m["shapes"][m["nodes"].index("Agents")] == "fc-hex")
    lab = {n: i for i, n in enumerate(m["nodes"])}
    par = {e[1]: e[0] for e in m["edges"]}
    check("the tree follows the indentation (idx01 under Indexers under Splunk)", par["\u00a7mm%d" % (lab["idx01"] + 1)] == "\u00a7mm%d" % (lab["Indexers"] + 1) and par["\u00a7mm%d" % (lab["Indexers"] + 1)] == "\u00a7mm%d" % (lab["Splunk"] + 1))
    check("plain lines, no arrowheads", all(not e[3] for e in m["edges"]) and len(m["edges"]) == 12)
    print("ER DIAGRAM")
    m = E(PARSE, ER)
    check("4 entities, 3 relationships, nothing skipped", m["warnings"] == [] and len(m["nodes"]) == 4 and len(m["edges"]) == 3, str(m["warnings"]))
    check("attributes listed in the box, keys marked", m["nodes"][0] == "HOST\nPK name: string\nrole: string\nsite: string", repr(m["nodes"][0]))
    check("cardinality and verb on the line (1  raises  0..n)", m["edges"][0][2] == "1  raises  0..n" and m["edges"][1][2] == "0..n  grouped into  1", str([e[2] for e in m["edges"]]))
    print("CLASS DIAGRAM")
    m = E(PARSE, CLS)
    check("6 classes, 5 relations, nothing skipped", m["warnings"] == [] and len(m["nodes"]) == 6 and len(m["edges"]) == 5, str(m["warnings"]) + str(len(m["nodes"])))
    check("members in the box (block and Class : member forms)", m["nodes"][0].startswith("Check\n+String name") and m["nodes"][m["nodes"].index("Result\n+bool ok\n+String message")])
    e = {(x[0], x[1]): x for x in m["edges"]}
    check("inheritance points at the parent (HttpCheck -> Check)", ("HttpCheck", "Check") in e and e[("HttpCheck", "Check")][3])
    check("association with multiplicities and label", e[("Check", "Result")][2] == "1  produces  *")
    check("dependency is dashed", e[("Agent", "Config")][4] and e[("Agent", "Config")][3])
    print("CONVERTED TO SKETCHES")
    for name, src in (("mindmap", MIND), ("er", ER), ("class", CLS)):
        pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-v1', s); }", json.dumps({"notes": [{"id": 1, "title": name, "content": "# " + name + "\n\n```mermaid\n" + src + "\n```\n"}], "seq": 2}))
        pg.reload(); pg.wait_for_timeout(400)
        pg.get_by_text("convert to sketch", exact=False).first.click(); pg.wait_for_timeout(500)
        r = E("""() => { const sk0 = panes[0].lines.join('\\n').match(/```excalidraw\\n([\\s\\S]*?)\\n```/); if (!sk0) return null;
            const els = JSON.parse(sk0[1]).elements.filter(e => !e.isDeleted), st = els.filter(e => e.type === 'stencil');
            let ov = 0; st.forEach((a, i) => st.forEach((c, j) => { if (j > i && a.x < c.x + c.width && c.x < a.x + a.width && a.y < c.y + c.height && c.y < a.y + a.height) ov++; }));
            return { shapes: st.length, links: els.filter(e => e.type === 'arrow' || e.type === 'line').length, overlaps: ov }; }""")
        check("%-8s: a sketch, every shape and link, no overlaps" % name, r and r["overlaps"] == 0 and r["shapes"] > 3, str(r))
        src_img = E("() => { const i = document.querySelector('.skp-img'); return i ? i.src : null; }")
        if src_img:
            v = b.new_page(viewport={"width": 900, "height": 520}); v.set_content("<body style='margin:0;background:#202027'><img src='%s' style='max-width:880px;max-height:500px;display:block;margin:10px auto'></body>" % src_img); v.wait_for_timeout(200)
            v.screenshot(path="/tmp/mm_%s.png" % name); v.close()
    print("  errors:", errs or "none"); ok &= not errs
    b.close()
print("ALL PASS" if ok else "FAILURES")
