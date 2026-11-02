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
