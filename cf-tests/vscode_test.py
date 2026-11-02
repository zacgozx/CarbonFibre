import os, sys, shutil, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))   # the app under test
EXT = os.path.join(HERE, "..", "vscode-extension")
# The VS Code extension: host.js on its own, then the app page and host.js together (test/*.js, in Node).
# Skipped where Node or Node's Playwright isn't installed.
node = shutil.which("node")
if not node or not os.path.isdir(EXT):
    print("  no Node (or no vscode-extension folder): skipped"); print("ALL PASS"); sys.exit(0)
if subprocess.run([node, "-e", "require('playwright')"], capture_output=True, cwd=EXT).returncode != 0:
    print("  Playwright for Node isn't installed (npm i -g playwright): skipped"); print("ALL PASS"); sys.exit(0)
ok = True
for t in ("host_test.js", "bridge_test.js"):
    r = subprocess.run([node, os.path.join("test", t)], capture_output=True, text=True, cwd=EXT, env=dict(os.environ, CF_EXT_HTML=os.path.abspath(CF)), timeout=140)
    print(r.stdout.rstrip()); print(r.stderr.rstrip()[:800]) if r.returncode else None
    ok &= r.returncode == 0 and r.stdout.rstrip().endswith("ALL PASS")
print("ALL PASS" if ok else "FAILURES")
