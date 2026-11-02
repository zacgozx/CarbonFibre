"""Run every CarbonFibre test. Needs Python 3 and Playwright (pip install playwright; playwright install chromium).
   python run_all.py                       tests ../CarbonFibre.html, 3 at a time
   python run_all.py -j 1                  one at a time (slower; for a busy machine)
   python run_all.py sheet                 only tests whose name contains "sheet"
   CF_HTML=C:/path/CarbonFibre.html python run_all.py   tests another copy
Tests run side by side because most of their time is spent waiting for the page to settle;
each runs in its own browser, so they don't share state."""
import os, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[1:]
jobs = int(os.environ.get("CF_JOBS", "3"))
if "-j" in args:
    k = args.index("-j"); jobs = max(1, int(args[k + 1])); del args[k:k + 2]
only = args[0] if args else ""
tests = [t for t in sorted(f for f in os.listdir(HERE) if f.endswith("_test.py")) + ["theme_shot.py"] if only in t]
LIMIT = 150                                  # seconds: one hung test can't stall the suite
def run(t):
    t0 = time.time()
    try:
        out = subprocess.run([sys.executable, os.path.join(HERE, t)], capture_output=True, text=True, cwd=HERE, timeout=LIMIT)
        tail = (out.stdout.strip().splitlines() or ["(no output)"])[-1]
        bad = out.returncode != 0 or "FAIL" in out.stdout or "Error" in out.stderr
        detail = "" if not bad else "\n".join(l for l in (out.stdout + out.stderr).splitlines() if "FAIL" in l or "Error" in l)[:600]
    except subprocess.TimeoutExpired:
        tail, bad, detail = "timed out after %ds" % LIMIT, True, ""
    return t, bad, tail, detail, time.time() - t0
t0 = time.time()
with ThreadPoolExecutor(max_workers=jobs) as pool:
    results = list(pool.map(run, tests))           # reported in name order
failed = []
for t, bad, tail, detail, d in results:
    print("%-22s %5.1fs  %s" % (t, d, ("FAILED  " if bad else "") + tail))
    if bad:
        failed.append(t)
        if detail: print("      " + detail.replace("\n", "\n      "))
print("\n%d of %d passed in %.0fs (%d at a time)" % (len(tests) - len(failed), len(tests), time.time() - t0, jobs))
sys.exit(1 if failed else 0)
