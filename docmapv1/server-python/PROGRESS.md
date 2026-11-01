# PROGRESS — server-python (porting 1:1 di server-php/api.php)

Newest entries last. Resume from the last "Next step".

## 2026-11-01 — start
- Read api.php, setup.php, config.sample.php, php-router.php, PORTING.md, API-CONTRACT.md, openapi.yaml, validate_schemas.py.
- Baseline: `NODE_PATH=/opt/node22/lib/node_modules python3 docmapv1/docs/python/tools/validate_schemas.py` → all checks passed (against PHP).
- Plan: docmap_server/{phpcompat,phpconfig,crypto,api,web,licence,setup_cmd,__main__}.py; tests/diff_test.py; tests/validate_python.py.
- Next step: write phpcompat.py (PHP value model: arrays as dicts with int keys, json_encode/decode twins, casts, canon, strnatcasecmp, ts_ms).
