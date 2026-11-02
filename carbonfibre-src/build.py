"""Build CarbonFibre.html from src/: the files listed in src/manifest.txt, joined in order.
    python build.py                       writes ../CarbonFibre.html (next to src/)
    python build.py OUT.html              writes OUT.html
    python build.py --check FILE.html     says whether FILE.html is exactly what src/ builds"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src")
def build():
    parts = [l.strip() for l in open(os.path.join(SRC, "manifest.txt"), encoding="utf-8") if l.strip() and not l.startswith("#")]
    return "".join(open(os.path.join(SRC, p), encoding="utf-8", newline="").read() for p in parts), len(parts)
if __name__ == "__main__":
    text, n = build()
    if len(sys.argv) > 2 and sys.argv[1] == "--check":
        other = open(sys.argv[2], encoding="utf-8", newline="").read()
        same = other == text
        print("identical" if same else "DIFFERENT: %s is not what src/ builds" % sys.argv[2]); sys.exit(0 if same else 1)
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "CarbonFibre.html")
    open(out, "w", encoding="utf-8", newline="").write(text)
    print("built %s from %d files (%d bytes)" % (out, n, len(text.encode("utf-8"))))
