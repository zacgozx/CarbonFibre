import json, random
import os as _os; exec(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)) if '__file__' in dir() else '.', 'mm_user.py')).read())
def st(i, shape, label, col="#8fe0a0"):
    random.seed(sum(map(ord, i)))
    return {"id": i, "type": "stencil", "shape": shape, "label": label, "x": random.randint(0, 1400), "y": random.randint(0, 700), "width": 76, "height": 62,
            "strokeColor": col, "strokeWidth": 2, "fill": "transparent", "isDeleted": False, "angle": 0, "opacity": 100}
def ln(a, b, k, both=False):
    e = {"id": "L%d" % k, "type": "arrow", "x": 0, "y": 0, "width": 0, "height": 0, "points": [[0, 0], [0, 0]], "fromId": a, "toId": b, "label": "", "strokeColor": "#d99a5b", "strokeWidth": 2, "isDeleted": False, "angle": 0, "opacity": 100, "curve": "elbow"}
    if both: e["startArrowhead"] = "arrow"; e["endArrowhead"] = "arrow"
    return e
def doc(els, title): return "# %s\n\n```excalidraw\n" % title + json.dumps({"type":"excalidraw","version":2,"source":"CarbonFibre","elements":els,"appState":{},"files":{}}, separators=(",",":")) + "\n```\n"
# busy: loops, cross links, skipped levels
bn = [("user","user","User"),("lap","laptop","Laptop"),("q","queue","Queue"),("lb","lb","Load balancer"),("sp1","processor","Stream processor"),("sp2","processor","Stream processor"),
      ("st1","storage","Storage"),("st2","storage","Storage"),("sv1","service","Service"),("sv2","service","Service"),("s1","server","Server"),("s2","server","Server"),("s3","server","Server"),("s4","server","Server")]
bl = [("user","lap"),("lap","q"),("q","lb"),("lb","sp1"),("lb","sp2"),("sp1","st1"),("sp2","st2"),("st1","sv1"),("st2","sv2"),("sv1","s1"),("sv1","s2"),("sv2","s3"),("sv2","s4"),("sv1","sp1"),("sv2","sp2"),
      ("q","sv1"),("q","sv2"),("user","st1"),("user","st2"),("user","sp1"),("user","sp2"),("user","sv1")]
BUSY = doc([st(*n) for n in bn] + [ln(a, b, k) for k, (a, b) in enumerate(bl)], "Busy")
# cognos: fan-outs (wrap), fan-ins, shared splitter, two-way pairs
P, B = "#e07a8a", "#6e8fe8"
ce = [st("users","user","Users"), st("ws","laptop","(Org) - Workstations"), st("lb","lb","reports.prod.example.local"), st("fls","server","HOSTFLS00001PRD",P),
      st("w3","service","HOSTWEB00003PRD",P), st("w2","service","NODEWEB00002PRD",B), st("w1","service","HOSTWEB00001PRD",P),
      st("cmx3","service","HOSTCMX00003PRD",P), st("cmx1","service","HOSTCMX00001PRD",P), st("sql","database","HOSTSQL00001PRD",P), st("epsql","database","NODESQL00001PRD",B)]
cl = [("users","ws"),("ws","lb"),("lb","w3"),("lb","w2"),("lb","w1"),("fls","w3"),("fls","w2"),("fls","w1"),("cmx3","sql")]
for n in (12,14,2,4,6): ce.append(st("bj%d"%n,"service","HOSTAPP%05dPRD"%n,P)); cl += [("w3","bj%d"%n),("bj%d"%n,"cmx3")]
for n in (8,10,12,7,9,11,17): ce.append(st("ep%d"%n,"service","NODEAPP%05dPRD"%n,B)); cl.append(("w2","ep%d"%n))
for n in (11,13,15,1,5): ce.append(st("bi%d"%n,"service","HOSTAPP%05dPRD"%n,P)); cl += [("w1","bi%d"%n),("bi%d"%n,"cmx1")]
COGNOS = doc(ce + [ln(a, b, k) for k, (a, b) in enumerate(cl)] + [ln("cmx3","cmx1",900,True), ln("sql","epsql",901,True)], "Cognos")
EMPTY = doc([], "T")
MM_SAMPLES = {"infra": MM,
 "classic": "graph LR\n  A[Alert fires] --> B{Known issue?}\n  B -->|yes| C[Apply runbook fix]\n  B -->|no| D[Triage in Splunk]\n  D -.-> E[(Incident DB)]\n  D ==> F((On-call))\n  C & F --> G[Close ticket]\n  G <--> A",
 "groups": "flowchart TB\n  subgraph S1[Front]\n    a1[Web] --> a2[API]\n  end\n  subgraph S2[Back]\n    direction LR\n    b1[Queue] --> b2[Worker]\n  end\n  a2 --> b1\n  c1:::hot --> a1\n  classDef hot fill:#fee2e2,stroke:#dc2626",
 "loops": "graph TD\n  A --> B --> C --> D\n  D --> B\n  C --> A\n  A --> E --> F\n  F --> C\n  B --> G[(DB)]\n  E --> G",
 "rl": "graph RL\n  x1 --> x2 & x3 & x4\n  x2 --> x5\n  x3 --> x5\n  x4 --> x6 --> x5"}
