"""Build CarbonFibre.html from src/: the files listed in src/manifest.txt, joined in order.
    python build.py                       writes ../CarbonFibre.html (next to src/)
    python build.py OUT.html              writes OUT.html
    python build.py --check FILE.html     says whether FILE.html is exactly what src/ builds
One step besides joining: the Content-Security-Policy's __SCRIPT_HASHES__ becomes the SHA-256 of each
<script> block, so the page runs its own scripts and nothing injected into it."""
import base64, hashlib, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src")
SCRIPT_RE = re.compile(r"<script>(.*?)</script>", re.S)
def script_hashes(text):
    return " ".join("'sha256-%s'" % base64.b64encode(hashlib.sha256(m.encode("utf-8")).digest()).decode()
                    for m in SCRIPT_RE.findall(text))
def build():
    parts = [l.strip() for l in open(os.path.join(SRC, "manifest.txt"), encoding="utf-8") if l.strip() and not l.startswith("#")]
    text = "".join(open(os.path.join(SRC, p), encoding="utf-8", newline="").read() for p in parts)
    if text.count("__SCRIPT_HASHES__") != 1: sys.exit("build: expected one __SCRIPT_HASHES__ in the CSP")
    if text.count("<script") != len(SCRIPT_RE.findall(text)):   # a stray "<script" (in a comment, say) would skew the hashes
        sys.exit("build: every <script must open a plain <script>...</script> block")
    return text.replace("__SCRIPT_HASHES__", script_hashes(text)), len(parts)
if __name__ == "__main__":
    text, n = build()
    if len(sys.argv) > 2 and sys.argv[1] == "--check":
        other = open(sys.argv[2], encoding="utf-8", newline="").read()
        same = other == text
        print("identical" if same else "DIFFERENT: %s is not what src/ builds" % sys.argv[2]); sys.exit(0 if same else 1)
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "CarbonFibre.html")
    open(out, "w", encoding="utf-8", newline="").write(text)
    print("built %s from %d files (%d bytes)" % (out, n, len(text.encode("utf-8"))))
