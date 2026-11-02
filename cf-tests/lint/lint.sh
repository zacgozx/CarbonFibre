#!/bin/bash
# Lint the JavaScript inside CarbonFibre.html. Needs Node and npm; the first run installs ESLint
# into ~/.cf-lint. Run with: bash lint.sh            (lints ../../CarbonFibre.html)
#                            bash lint.sh path/file   (lints another copy)
#   bash lint.sh --strict src/js/NN-file.js   new-code rules for one source file you changed:
#                                             let/const instead of var, === instead of ==
HERE="$(cd "$(dirname "$0")" && pwd)"; TOOL="$HOME/.cf-lint"
STRICT=""; if [ "$1" = "--strict" ]; then STRICT=1; shift; fi
F="${1:-$HERE/../../CarbonFibre.html}"
mkdir -p "$TOOL"
if [ ! -x "$TOOL/node_modules/.bin/eslint" ]; then
  (cd "$TOOL" && { npm init -y >/dev/null 2>&1; true; } && npm install eslint@8.57.0 --silent >/dev/null 2>&1)
fi
if [ ! -x "$TOOL/node_modules/.bin/eslint" ]; then echo "ESLint could not be installed (needs Node and npm): NOT linted"; exit 2; fi
[ -f "$F" ] || { echo "No file at $F: NOT linted"; exit 2; }
if [ -n "$STRICT" ]; then                        # one source file, new-code rules only (names from other files are fine)
  case "$F" in */pane/*|*/grid/*) echo "$F is part of a larger function: check it through the built file"; exit 2;; esac
  OUT=$("$TOOL/node_modules/.bin/eslint" --no-eslintrc --no-ignore -c "$HERE/strict.json" -f unix "$F" 2>&1); CODE=$?
  if [ $CODE -gt 1 ]; then echo "$OUT" | head -5; echo "ESLint failed to run: NOT linted"; exit 2; fi
  N=$(echo "$OUT" | grep -c ':[0-9]*:[0-9]*:')
  echo "$OUT" | grep ':[0-9]*:[0-9]*:' | head -40
  echo "strict findings: $N"; [ "$N" = "0" ]; exit $?
fi
python3 - "$F" "$TOOL/app.js" <<'PY'
import re, sys
s = open(sys.argv[1], encoding='utf-8').read()
open(sys.argv[2], 'w', encoding='utf-8').write("\n".join(re.findall(r'<script(?![^>]*src)[^>]*>(.*?)</script>', s, re.S)))
PY
OUT=$("$TOOL/node_modules/.bin/eslint" --no-eslintrc --no-ignore -c "$HERE/.eslintrc.json" -f unix "$TOOL/app.js" 2>&1); CODE=$?
N=$(echo "$OUT" | grep -c 'app.js:')
if [ $CODE -gt 1 ]; then echo "$OUT" | head -5; echo "ESLint failed to run: NOT linted"; exit 2; fi
echo "$OUT" | grep 'app.js:' | head -30
echo "findings: $N"
[ "$N" = "0" ]
