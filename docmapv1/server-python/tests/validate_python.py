#!/usr/bin/env python3
"""Runs docmapv1/docs/python/tools/validate_schemas.py UNCHANGED, but step 4 starts the Python server instead of
`php -S`: every route and error case is validated against openapi.yaml, then the Python server's docmap.sqlite is
opened and the byte claims of PORTING.md are re-checked (blob layout + AAD, HMAC index, canonical JSON hash,
key_check, journal meta/items).

    NODE_PATH=/opt/node22/lib/node_modules python3 docmapv1/server-python/tests/validate_python.py [--no-browser --samples DIR]

Same requirements as validate_schemas.py (jsonschema, referencing, pyyaml, cryptography; node + playwright for step 2).
"""
import base64
import hashlib
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
PYROOT = HERE.parent
TOOLS = PYROOT.parent / "docs" / "python" / "tools"
sys.path.insert(0, str(TOOLS))
sys.dont_write_bytecode = True   # never leave a __pycache__ in docs/python/tools (another team's folder)

import validate_schemas as vs  # noqa: E402


def step_python(api, registry, ws, work):
    print("\n[4] live Python server (docmap_server) against openapi.yaml — replaces the php -S step")
    srv = work / "srv"
    data_dir = work / "data"
    srv.mkdir()
    data_dir.mkdir()
    key = os.urandom(32)
    toks = {"admin": "adm-" + os.urandom(12).hex(), "editor": "edi-" + os.urandom(12).hex(), "viewer": "vie-" + os.urandom(12).hex()}
    cfg_tokens = ",\n".join(
        f"    ['user' => 'Test {r}', 'role' => '{r}', 'token_sha256' => '{hashlib.sha256(t.encode()).hexdigest()}']" for r, t in toks.items())
    cfg = srv / "config.php"   # the same config.php validate_schemas.py writes for PHP
    cfg.write_text(
        "<?php\nif (!defined('DOCMAP_API')) { http_response_code(404); exit; }\nreturn [\n"
        f"  'data_dir' => '{data_dir}',\n  'aes_key' => '{base64.b64encode(key).decode()}',\n"
        f"  'tokens' => [\n{cfg_tokens}\n  ],\n  'max_fails' => 3, 'lock_seconds' => 2, 'studio_name' => 'Studio di prova',\n];\n", encoding="utf-8")
    port = vs.free_port()
    log = open(work / "python-server.log", "wb")
    proc = subprocess.Popen([sys.executable, "-m", "docmap_server", "serve", "--config", str(cfg), "--port", str(port),
                             "--api-path", "/api.php", "--log-level", "warning"], cwd=str(PYROOT), stdout=log, stderr=log)
    try:
        a = vs.Api(f"http://127.0.0.1:{port}/api.php")
        for _ in range(100):
            try:
                a.call("ping")
                break
            except Exception:  # noqa: BLE001
                time.sleep(0.1)
        p = a.call("ping")[1]
        vs.check(isinstance(p, dict) and str(p.get("php", "")).startswith("Python"), f"the server under test is the Python port (ping php={p.get('php') if isinstance(p, dict) else p})")
        vs.run_routes(api, registry, a, toks, ws, key, data_dir)
    finally:
        proc.terminate()
        proc.wait(timeout=10)
        log.close()


if __name__ == "__main__":
    if not shutil.which("node") and "--no-browser" not in sys.argv:
        print("note: node not found; pass --no-browser --samples DIR with files from export_samples.js")
    vs.step_php = step_python
    vs.main()
