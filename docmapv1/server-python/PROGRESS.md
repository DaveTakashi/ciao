# PROGRESS — server-python (porting 1:1 di server-php/api.php)

Newest entries last. Resume from the last "Next step".

## 2026-11-01 — start
- Read api.php, setup.php, config.sample.php, php-router.php, PORTING.md, API-CONTRACT.md, openapi.yaml, validate_schemas.py.
- Baseline: `NODE_PATH=/opt/node22/lib/node_modules python3 docmapv1/docs/python/tools/validate_schemas.py` → all checks passed (against PHP).
- Plan: docmap_server/{phpcompat,phpconfig,crypto,api,web,licence,setup_cmd,__main__}.py; tests/diff_test.py; tests/validate_python.py.
- Next step: write phpcompat.py (PHP value model: arrays as dicts with int keys, json_encode/decode twins, casts, canon, strnatcasecmp, ts_ms).

## 2026-11-01 — core written
- Done: phpcompat.py (PHP array model, json_encode/decode twins, (string)/(int) casts and float formats checked vs
  php, canon, ksort cmp, strnatcasecmp port, ts_ms checked vs php), crypto.py, phpconfig.py (config.php var_export /
  hand-written / J-style + config.json), api.py (all routes), web.py (API path + static with php-router deny rules),
  licence.py (hook), setup_cmd.py, __main__.py.

## 2026-11-02 — diff test green
- tests/diff_test.py: `python3 docmapv1/server-python/tests/diff_test.py` → Ran 5 tests OK
  (test_1 149 request pairs identical, test_2 9 tables identical decrypted, test_3 switch PHP↔Python 28 pairs,
  test_4 IP lock 9 pairs, test_5 v10.1 db upgraded by Python = by PHP 5 pairs).
- Lessons: php -S (cli-server SAPI) has opcache ON: config.php rewrites are seen only after ~2 s (test sleeps 2.2 s and
  bumps mtime). Tombstone restore hash includes server time → registered as volatile in the test.
- Next step: tests/validate_python.py (reuse docs/python/tools/validate_schemas.py against the Python server).

## 2026-11-02 — validator + docs
- tests/validate_python.py: `NODE_PATH=/opt/node22/lib/node_modules python3 docmapv1/server-python/tests/validate_python.py`
  → "RESULT: all checks passed" (262 OK; validate_schemas.py imported unchanged, step 4 swapped for the Python server).
- Added requirements.txt, README.md (IT), run_windows.bat (CRLF), run_unix.sh, .gitattributes.
- Next step: review leftovers (Windows path edge cases in static_response, robustness), final commit.

## 2026-11-02 — final state (all proofs green)
- Commands (from the repo root) and last results:
  - `python3 docmapv1/server-python/tests/diff_test.py` → Ran 5 tests, OK (149 + 28 + 9 + 5 request pairs identical,
    9 tables identical after decryption). Also OK with Python 3.11 (`/usr/bin/python3.11` venv + requirements.txt).
  - `NODE_PATH=/opt/node22/lib/node_modules python3 docmapv1/server-python/tests/validate_python.py` → "RESULT: all checks passed" (262 OK).
  - Concurrency smoke: 40 parallel pushes × 50 records → 2000 applied, no "database is locked".
- Known differences (README "Differenze note"): ping `php` = "Python 3.x"; PHP relative date strings ("now", "@123")
  not parsed (treated as invalid = 0); byte-cut UTF-8 in substr() stored as U+FFFD (same JSON output).
- Licence hook: docmap_server/licence.py current_mode() → 'full'; 'read_only' makes write routes answer 403 licence_read_only.
- Next step (optional): hook DOCMAP_TEST_SERVER_CMD into tests/suite.js (not ours to edit: other team) so the Playwright
  suite W/X/J can run against `python -m docmap_server serve --config {config} --port {port} --root {root}`.

## 2026-11-02 — F3 licence integration done
- docmap_server/licence_verify.py = byte-identical copy of hub/docmap_hub/licence.py (hub commit 327a7dc); test_0 asserts equality.
- docmap_server/licence.py rewritten: OFF unless config `licence_required: true`; TRUSTED_LICENCE_KEYS constant (empty)
  + `licence_public_keys` config override (tests/dev only); cache, re-verify every 600 s or on mtime/size change of
  licence/instance file; instance_id adopted from first genuine licence. api.py: write_block → 403 licence_read_only
  (error has mode/reasons/message_it), push binder limit + token_create users limit → 403 licence_limit, `licence`
  object in me (detailed) / ping (short) only when required. CLI `python -m docmap_server licence install|status`.
- `python3 docmapv1/server-python/tests/test_licence.py` → Ran 9 tests OK; diff_test → 5 OK; validate_python → all checks passed.
- Next step: F2 — tests/php-shim/php + tests/run_suite_python.sh, run suite W/X/J with Python vs PHP.

## 2026-11-02 — F2 shim written
- Server: `--php-layout` (web.create_app(php_layout=True)): with --root, every existing, non-denied <dir>/api.php is the
  API with <dir>/config.php (config next to the api.php requested, as php -S does). Proofs still green.
- tests/php-shim/php: `-S h:p -t root router` → Python server (api.php = current server-php/api.php → Python; legacy
  api.php content (X/J v10.1 from git 68ae170) and other .php (setup.php) → real php -S on an internal port; static →
  Python); anything else → exec real php (first php on PATH outside the shim dir). DOCMAP_SHIM_LEGACY_PHP=0 = all api.php to Python.
- tests/run_suite_python.sh: PATH=shim:..., runs node suite.js in docmapv1/tests, log in _trash/suite-python.log.
- jsqr/pngjs not installed globally: npm i'd them in the session scratchpad and added to NODE_PATH.
- Next step: run PHP baseline + Python suite, compare W/X/J, write SUITE-RESULTS.md.

## 2026-11-02 — F2 suite results (SUITE-RESULTS.md)
- PHP baseline `node suite.js`: RESULT 1093 passed, 0 failed, errors none.
- Python via shim (default, v10.1 api.php + setup.php on real php): 1093 passed, 0 failed, errors none.
- Python pure (DOCMAP_SHIM_LEGACY_PHP=0): 1092 passed, 1 failed — "J: v10.1 API … schema 1, no journal" (inherent: the
  "old server" is then the v11 Python). No Python bugs found; api.py unchanged by F2.
- Next step: optional — get a DOCMAP_TEST_SERVER_CMD hook into suite.js (other team) so the shim is not needed.
