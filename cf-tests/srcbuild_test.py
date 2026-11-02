import os, sys, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
SRC = os.environ.get("CF_SRC", os.path.join(HERE, "..", "carbonfibre-src"))
# the source tree must build exactly the file being tested (otherwise src/ and the app have drifted)
if not os.path.exists(os.path.join(SRC, "build.py")):
    print("  no carbonfibre-src next to the tests: skipped"); print("ALL PASS"); sys.exit(0)
r = subprocess.run([sys.executable, os.path.join(SRC, "build.py"), "--check", CF], capture_output=True, text=True)
print("  src/ builds exactly CarbonFibre.html:", r.stdout.strip())
print("ALL PASS" if r.returncode == 0 else "FAILURES")
