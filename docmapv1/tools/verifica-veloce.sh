#!/usr/bin/env bash
# DocMap — fast checks (~3 min) for agents and CI. Full regression = tests/suite.js (~35 min), before every release.
#   bash docmapv1/tools/verifica-veloce.sh          (from the repo root or anywhere)
# Needs: python 3.11+ with fastapi uvicorn cryptography pyftpdlib, php 8 with pdo_sqlite, node + playwright.
set -u
cd "$(dirname "$0")/.."
fail=0
step(){ echo; echo "== $1"; }
run(){ "$@" || { echo "  ✗ FAILED: $*"; fail=1; }; }
step "syntax: JavaScript"
for f in assets/js/*.js docmap.config.js hub/docmap_hub/ui/app.js; do node --check "$f" || { echo "  ✗ $f"; fail=1; }; done
step "syntax: PHP"
for f in server-php/*.php; do run php -l "$f" >/dev/null; done
step "hub (Python)";              (cd hub && run python3 -m unittest discover -s tests)
step "server-python";             (cd server-python && run python3 -m unittest discover -s tests)
step "PHP <-> Python parity";     run python3 server-python/tests/diff_test.py
step "PHP <-> Python licence";    run python3 server-python/tests/diff_licence_test.py
step "installer-windows";         (cd installer-windows && run python3 -m unittest discover -s tests)
step "smoke test app (Playwright)"; (cd tests && NODE_PATH="${NODE_PATH:-$(npm root -g)}" run node smoke.js)
step "v12.6 licenza e stato sync (Playwright + php)"; (cd tests && NODE_PATH="${NODE_PATH:-$(npm root -g)}" run node v126.js)
echo
if [ $fail = 0 ]; then echo "VERIFICA VELOCE: tutto OK"; else echo "VERIFICA VELOCE: ci sono errori (vedi ✗ sopra)"; fi
exit $fail
