"""Build the extension's copy of the app: media/carbonfibre.html, from carbonfibre-src (the same build as
the website). Run before packaging:  python build.py  then  npx @vscode/vsce package --skip-license"""
import os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(HERE, "media", "carbonfibre.html")
os.makedirs(os.path.dirname(out), exist_ok=True)
sys.exit(subprocess.call([sys.executable, os.path.join(HERE, "..", "carbonfibre-src", "build.py"), out]))
