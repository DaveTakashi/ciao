#!/usr/bin/env bash
# DocMap — fast checks (~4 min) for agents and CI. Full regression = tests/suite.js (~35 min), before every release.
#   bash docmapv1/tools/verifica-veloce.sh          (from the repo root or anywhere)
# Needs: python 3.11+ with fastapi uvicorn cryptography pyftpdlib, php 8 with pdo_sqlite, node + playwright.
# The tools (strumenti/) install their requirements.txt when missing; tesseract-ocr (+ ita) enables their real-OCR test.
set -u
cd "$(dirname "$0")/.."
fail=0
step(){ echo; echo "== $1"; }
# run() inside ( … ) cannot set fail in this shell: it also returns 1, and every ( … ) line adds || fail=1
run(){ "$@" || { echo "  ✗ FAILED: $*"; fail=1; return 1; }; }
step "syntax: JavaScript"
for f in assets/js/*.js docmap.config.js brand.js hub/docmap_hub/ui/app.js strumenti/docmap_strumenti/ui/app.js; do node --check "$f" || { echo "  ✗ $f"; fail=1; }; done
step "lint: JavaScript (globals between files, eslint bug rules)"
if NODE_PATH="${NODE_PATH:-$(npm root -g)}" node -e "require('eslint')" 2>/dev/null; then
  NODE_PATH="${NODE_PATH:-$(npm root -g)}" run node tools/lint-js.js
else echo "  (eslint not installed: npm install -g eslint — skipped)"; fi
step "lint: Python (pyflakes, only real bugs)"; run python3 tools/lint-py.py
step "brand (white label): brand.js valid, derived files aligned, no product name in strings"
run node --check brand.js && run python3 tools/brand.py controlla
step "CI: .github/workflows/docmap-ci.yml = ci/docmap-ci.yml"
if [ -f ../.github/workflows/docmap-ci.yml ]; then run cmp -s ci/docmap-ci.yml ../.github/workflows/docmap-ci.yml && echo "  OK same file"
else echo "  (CI not active: .github/workflows/docmap-ci.yml missing)"; fi
step "syntax: PHP"
for f in server-php/*.php; do run php -l "$f" >/dev/null; done
step "hub (Python)";              (cd hub && run python3 -m unittest discover -s tests) || fail=1
step "strumenti (ricette, blocchi, coda, server, remoto)"
python3 -c "import PIL, pypdf, openpyxl, numpy, pypdfium2" 2>/dev/null || python3 -m pip install -q -r strumenti/requirements.txt
(cd strumenti && run python3 -m unittest discover -s tests) || fail=1
step "server-python";             (cd server-python && run python3 -m unittest discover -s tests) || fail=1
step "PHP <-> Python parity";     run python3 server-python/tests/diff_test.py
step "PHP <-> Python licence";    run python3 server-python/tests/diff_licence_test.py
step "zip completo (tools/crea-zip.py)"; ZD=$(mktemp -d); run python3 tools/crea-zip.py --out "$ZD" >/dev/null
step "installer-windows";         (cd installer-windows && run python3 -m unittest discover -s tests) || fail=1
step "app: test Playwright (smoke, unit, aggiornamento, v12.6 … v12.17), più file insieme (tests/run.js)"
# smoke · unit (pure functions, 2 time zones) · upgrade (real previous releases from git → current: no data lost)
# v126 licence + sync · v128 inventory · v129 PWA + stopwatch · v129b theme + Ctrl+K · v1210 picks + signed hand-over
# v1210b lost-item QR · v1210c forecasts · v1210d «Oggi», undo, empty states · v1210e return reminders
# v1211 new year, disposal, «Dove lo metto?», voice search
# v1212 inventory phases 3-4: station, chain, verify, scanner, documents, templates, prices, report, local AI
# v1214 sturdier inventory: busy server pauses, full phone memory, rescue copy, estimate before the job
# v1215 faster inventory: burst of several labels per frame, target with the expected end time
# v1216 box level and binder level: labelling plan, count per box, binders without a label, box photo with QR positions, training data
# v1217 AI reading foundations: field confidence + prompt version, fields to check, tag vocabulary of the client, test bench
(cd tests && NODE_PATH="${NODE_PATH:-$(npm root -g)}" run node run.js) || fail=1
echo
if [ $fail = 0 ]; then echo "VERIFICA VELOCE: tutto OK"; else echo "VERIFICA VELOCE: ci sono errori (vedi ✗ sopra)"; fi
exit $fail
