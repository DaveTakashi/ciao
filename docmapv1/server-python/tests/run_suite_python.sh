#!/bin/sh
# Run the real Playwright suite (docmapv1/tests/suite.js, unchanged) with the Python server in place of `php -S`.
# The php shim (tests/php-shim/php) goes first on PATH: `php -S …` starts the Python server (setup.php still runs on the
# real php through the shim's fallback), `php -r …` and everything else go to the real php.
#   sh docmapv1/server-python/tests/run_suite_python.sh [log file]      (default: docmapv1/server-python/_trash/suite-python.log)
# Needs what the suite needs: node + playwright (chromium), jsqr, pngjs (NODE_PATH), python3 with pypdfium2, php 8 CLI
# with pdo_sqlite + openssl (for setup.php and the suite's own `php -r` checks), git history (commit 68ae170).
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
PYROOT=$(dirname "$HERE")
TESTS=$(dirname "$PYROOT")/tests
LOG=${1:-$PYROOT/_trash/suite-python.log}
mkdir -p "$(dirname "$LOG")"
PATH="$HERE/php-shim:$PATH"
export PATH
export DOCMAP_SHIM_LOG="${DOCMAP_SHIM_LOG:-$LOG.shim}"
command -v php | grep -q php-shim || { echo "php shim not first on PATH" >&2; exit 2; }
cd "$TESTS" || exit 2
node suite.js > "$LOG" 2>&1
rc=$?
grep -E '^RESULT|^errors' "$LOG"
echo "exit $rc — full log: $LOG"
exit $rc
