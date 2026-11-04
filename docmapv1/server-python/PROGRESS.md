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

## 2026-11-02 — F5 v12 parity (api.php v12, merged in 16270a2)
- api.py: DM_SCHEMA 3 (MIGRATIONS[3] = access_log + 5 indexes, existence-keyed like PHP), DM_TYPES + archive, status_event;
  rec_write status_event HMAC indexes (k_short 'st/b|l/<target>', k_code 'stbox/<box>'); st_key/st_events/st_types →
  binder/location `status_events` + `status_types`; acc_via/acc_write/acc_after_read/acc_prune/acc_meta/acc_target_where,
  routes access (editor own / admin all + ip), last_seen (viewer), seen (POST viewer, ≤500, dedupe ± window); `via` on
  binder/location/resolve (logged after a successful read, never fails the read); config defaults access_keep_days 365,
  access_dedupe_seconds 120, remember_minutes null; me.remember_minutes (is_numeric → (int) else null); ping features.
- Licence: `seen` exempt from licence_read_only (LICENCE_AUDIT_WRITES): an audit record of a read, like the access_log row of a
  binder read. status_event/archive pushes are blocked like any push. access/last_seen are reads.
- diff_test.py: + test_1b_v12 (88 pairs + content asserts), test_5 now v10.1 → schema 3, + test_6_upgrade_v11 (v11.1 api.php of
  32c3485: copies upgraded by PHP v12 / Python v12 compared incl. decrypted DB; one folder upgraded by Python then served by PHP
  v12 and the reverse; v11.1 PHP still serves the schema-3 file). dump_db decrypts access_log.meta.
  Mutation check: wrong event order / wrong via whitelist / seen ± window bounds (inclusive) are all caught (read-dedupe `at >=` vs `>` is not: sub-ms timing).
- Final results (repo root):
  - `python3 docmapv1/server-python/tests/diff_test.py` → Ran 7 tests OK (149 + 88 + 28 + 9 + 7 + 25 pairs, 10 tables identical decrypted).
  - `NODE_PATH=/opt/node22/lib/node_modules python3 docmapv1/server-python/tests/validate_python.py` → "RESULT: all checks passed" (337 OK).
  - `python3 docmapv1/server-python/tests/test_licence.py` → Ran 9 tests OK.
  - Suite (SUITE-RESULTS.md): PHP as is → stops in section A (opcache revalidate_freq 2 s vs config.php rewritten and read
    at once); PHP with opcache.revalidate_freq=0 → 1232/1232; Python via shim → run 1 1231/1232 (flaky browser-only M check,
    regex 8642 in random base64), run 2 1232/1232. No Python bug found by the suite.
- Next step: none required for F5; optional — ask the suite owners to make section A wait > 2 s (or bump mtime) after
  rewriting config.php, so the plain PHP baseline does not depend on opcache settings.

## 2026-11-02 — Ponte server ⇄ server `sync-remote` (web ⇄ studio)
- New `docmap_server/sync_remote.py` (stdlib + phpcompat) and subcommand `python -m docmap_server sync-remote PROFILE
  [--dry-run] [--json] [--direction both|a-to-b|b-to-a] [--example]`. API client of both sides (works PHP⇄Python,
  Python⇄Python, PHP⇄PHP): token (or env var), optional HTTP Basic, `ca` file (studio CA) or `insecure_lan` (LAN only);
  http:// to a public host refused; no proxy for LAN hosts; never retries after 401/403/429.
- Algorithm: pull both sides since their cursors (all pages; log separately), per-record LWW with the server's own
  comparison (ts_ms, canon/CANON_SKIP, location code/level), exact tie with different content = conflict (nobody touched,
  kept in state `open_conflicts` until edited), push in batches (500 records / 1000 log / ≤90% max_body_mb, 413 → split),
  server `rejected/older` → its newer `current` is sent to the other side. Cursors move only when that side's changes
  reached the other side; `known` map suppresses echoes; state written atomically; lock file per profile.
- Decisions: settings = LWW on the block (same as the server's push rule), tie → conflict `settings/subset`;
  activity_log = union by id (as the desktop client pushes/pulls it), full history on first run except, for logs > 1000
  entries, entry seq 1 (contract limit: log_since=0 = newest 1000). `who` on the receiving side = the bridge (push has no
  per-record author); tombstones keep theirs. Licence read_only side (ping/me licence.mode or a 403): pulled, never pushed.
- Tests `tests/test_sync_remote.py` (10): dry-run leaves both DB data tables byte-identical; PHP⇄Python convergence
  (13 items + settings + log identical) and 2nd run applies 0 with an empty plan; a-to-b / b-to-a leave the other side
  untouched; deletions + concurrent edits (newer wins both ways); exact tie → exit 1, both untouched, stays open, resolved
  by a newer save; crash after the first push batch (test hook DOCMAP_SYNC_TEST_EXIT_AFTER_PUSHES) → resume applies the
  remaining 20, converges, lock taken over; errors exit 2 (wrong token, unreachable, missing token, viewer token, public
  http); Python⇄Python with a location tombstone; licence read_only side; HTTPS with the CA made by
  installer-windows/docmap_tools.ensure_certificates (refused without `ca`, accepted with it / insecure_lan on 127.0.0.1).
  Mutation check: no echo suppression, tie treated as a win, cursor moved on failure → each caught.
- Guide `GUIDA-SYNC-WEB-LOCALE.md` (Italian: tokens, C:\DocMap\sync + icacls, profile, dry-run, schtasks every 10 min as
  SYSTEM via sincronizza.bat, conflicts, logs, errors, security); README section.
- Next step: try it on the studio Windows PC against the real SiteGround site (dry-run first).

## 2026-11-03 — Chiavi fidate da `docmap_server/trusted_keys.json`; versione 26.12.5
- `licence.py`: `load_trusted_keys_file()` (cache per mtime/dimensione, max 64 KB, BOM ammesso, key id e base64 32 byte
  controllati, chiavi non valide ignorate con log `docmap.licence`, JSON rovinato → {} con log); `trusted_keys()` = file +
  costante (la costante vince sullo stesso id); `licence status/install` avvisano se non c'è nessuna chiave. Modello delle
  minacce nel docstring e nel README.
- `api.py`: DM_APP_VERSION 26.12.5 (merge dell'app v12.5, il PHP ha lo stesso valore).
- Test nuovo `tests/test_trusted_keys.py` (9). Risultati: diff_test 7 OK, test_licence 9 OK, test_trusted_keys 9 OK,
  test_setup 2 OK, test_sync_remote 10 OK, validate_python "RESULT: all checks passed".
