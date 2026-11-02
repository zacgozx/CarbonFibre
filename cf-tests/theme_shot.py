import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))   # the app under test
import json, sys
from playwright.sync_api import sync_playwright
NOTE = "\n".join(["# Splunk HEC outage", "Raised as [[INC0048812 Exchange node not reporting]] after alerts from the **indexer cluster**. See https://docs.splunk.com for HEC limits.", "",
    "## What happened", "- HEC on `idx01` returned **503** from 02:10", "- Forwarders queued for 40 minutes", "- [x] Restarted the HEC input", "- [ ] Confirm backlog drained", "",
    "> Vendor says the token limit was hit during the batch window.", "", "### Hosts", "| Host | Role | Status |", "| --- | --- | --- |", "| idx01 | indexer | down |", "| idx02 | indexer | up |", "",
    "```bash", "systemctl restart splunk", "tail -f /opt/splunk/var/log/splunk/splunkd.log", "```", "", "```mermaid", "graph LR", "  A --> B", "```", "", "Follow up with #monitoring on Monday."])
CONTRAST = open(os.path.join(HERE, 'contrast_js.txt')).read()
with sync_playwright() as p:
    b = p.chromium.launch()
    for scheme in ("dark", "light"):
        pg = b.new_page(viewport={"width": 1300, "height": 900}, color_scheme=scheme)
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto("file://" + CF)
        pg.evaluate("s => { localStorage.clear(); localStorage.setItem('carbonfibre-v1', s); }", json.dumps({"notes": [{"id": 1, "title": "Splunk HEC outage", "content": NOTE}, {"id": 2, "title": "INC0048812 Exchange node not reporting", "content": "# x"}], "seq": 3}))
        pg.reload(); pg.wait_for_timeout(600)
        pg.evaluate("() => panes[0].deactivate()"); pg.wait_for_timeout(100)
        fails = pg.evaluate(CONTRAST, 'body *')
        print("  %-5s text below 4.5:1: %s | errors: %s" % (scheme, fails or "none", errs or "none"))
        pg.screenshot(path="/tmp/theme_%s.png" % scheme)
        pg.close()
    b.close()
