#!/usr/bin/env python3
"""DocMap — checks docs/python/schema/*.schema.json and docs/python/openapi.yaml against the REAL program.

What it does (every step prints OK / FAIL; exit code 0 only if everything passes):

  1. Loads the 7 JSON Schemas and openapi.yaml, checks they are valid schemas and that every $ref resolves.
  2. Runs tools/export_samples.js (headless Chromium + Playwright) which builds a small archive with the app's own
     functions and writes: workspace_backup.json, sync_package.json, sync_package_enc.json, records.json.
     Validates each file against its schema; decrypts sync_package_enc.json in Python (PBKDF2 + AES-256-GCM) and
     validates the plaintext too.
  3. Static check: the routes of server-php/api.php ($reads / $writes + ping) are exactly the paths of openapi.yaml,
     with the same minimum role (x-docmap-role).
  4. If `php` is on the PATH: starts `php -S` on a temporary copy of server-php/api.php with a generated config.php,
     calls every route (and the error cases 400/401/403/404/405/409/422/429) and validates each JSON answer against
     the response schema of openapi.yaml. Then it opens the server's docmap.sqlite with Python and proves the claims of
     PORTING.md: AES-256-GCM blob layout and AAD, HMAC index (40 hex chars), canonical JSON + SHA-256 (= new_hash of the
     journal and `hash` of patch), key_check.

Usage (from anywhere):
    NODE_PATH=<node_modules with playwright> python3 docs/python/tools/validate_schemas.py [--samples DIR] [--no-browser] [--no-php]

Needs: Python 3.9+, jsonschema>=4.18 (+ referencing), PyYAML, cryptography; node + playwright for step 2; php 8 with
pdo_sqlite and openssl for step 4. Writes only in a temporary folder (or in --samples DIR).
"""
import argparse
import base64
import hashlib
import hmac
import json
import os
import re
import shutil
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

try:
    import yaml
    from jsonschema import Draft202012Validator
    from referencing import Registry, Resource
    from referencing.jsonschema import DRAFT202012
except ImportError as e:  # pragma: no cover
    sys.exit(f"missing Python package ({e}): pip install jsonschema referencing pyyaml cryptography")

HERE = Path(__file__).resolve().parent
PYDOCS = HERE.parent                       # docmapv1/docs/python
ROOT = PYDOCS.parent.parent                # docmapv1
SCHEMA_DIR = PYDOCS / "schema"
OPENAPI = PYDOCS / "openapi.yaml"
API_PHP = ROOT / "server-php" / "api.php"

FAILS = []


def ok(msg):
    print("  OK   " + msg)


def bad(msg):
    FAILS.append(msg)
    print("  FAIL " + msg)


def check(cond, msg):
    (ok if cond else bad)(msg)
    return cond


# ---------------------------------------------------------------- schemas and registry
def load_registry():
    resources = []
    schemas = {}
    for f in sorted(SCHEMA_DIR.glob("*.schema.json")):
        doc = json.loads(f.read_text(encoding="utf-8"))
        schemas[f.name] = doc
        resources.append((f.as_uri(), Resource(contents=doc, specification=DRAFT202012)))
    api = yaml.safe_load(OPENAPI.read_text(encoding="utf-8"))
    resources.append((OPENAPI.as_uri(), Resource(contents=api, specification=DRAFT202012)))
    return schemas, api, Registry().with_resources(resources)


def validator_for(registry, uri):
    return Draft202012Validator({"$ref": uri}, registry=registry)


def validate(registry, uri, instance, label):
    errs = sorted(validator_for(registry, uri).iter_errors(instance), key=lambda e: list(e.absolute_path))
    if errs:
        for e in errs[:8]:
            bad(f"{label}: {'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message[:300]}")
        return False
    ok(label)
    return True


def schema_uri(name):
    return (SCHEMA_DIR / name).as_uri()


def comp_uri(name):
    return OPENAPI.as_uri() + "#/components/schemas/" + name


def walk_refs(node, base, registry, label):
    """Every $ref of node resolves (relative to base)."""
    n = 0
    resolver = registry.resolver(base_uri=base)
    stack = [node]
    while stack:
        x = stack.pop()
        if isinstance(x, dict):
            r = x.get("$ref")
            if isinstance(r, str):
                try:
                    resolver.lookup(r)
                    n += 1
                except Exception as e:  # noqa: BLE001
                    bad(f"{label}: $ref {r} does not resolve ({e})")
            stack.extend(x.values())
        elif isinstance(x, list):
            stack.extend(x)
    return n


def step_schemas(schemas, api, registry):
    print("\n[1] schemas and openapi.yaml")
    for name, doc in schemas.items():
        try:
            Draft202012Validator.check_schema(doc)
            ok(f"{name}: valid JSON Schema 2020-12")
        except Exception as e:  # noqa: BLE001
            bad(f"{name}: {e}")
        n = walk_refs(doc, schema_uri(name), registry, name)
        ok(f"{name}: {n} $ref resolved")
    check(str(api.get("openapi", "")).startswith("3.1"), "openapi.yaml: OpenAPI 3.1")
    for cname, s in api["components"]["schemas"].items():
        try:
            Draft202012Validator.check_schema(s)
        except Exception as e:  # noqa: BLE001
            bad(f"openapi components.schemas.{cname}: {e}")
    n = walk_refs(api, OPENAPI.as_uri(), registry, "openapi.yaml")
    ok(f"openapi.yaml: {len(api['components']['schemas'])} component schemas valid, {n} $ref resolved")


# ---------------------------------------------------------------- samples from the real app
def decrypt_package(env):
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    import unicodedata
    pw = unicodedata.normalize("NFC", "passphrase-di-prova-123").encode("utf-8")
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=base64.b64decode(env["kdf"]["salt"]), iterations=int(env["kdf"]["iterations"]))
    key = kdf.derive(pw)
    plain = AESGCM(key).decrypt(base64.b64decode(env["iv"]), base64.b64decode(env["ct"]), b"docmap-sync-enc/1")
    return json.loads(plain.decode("utf-8"))


def step_samples(registry, samples_dir, run_browser):
    print("\n[2] real files written by the app (headless Chromium)")
    if run_browser:
        js = HERE / "export_samples.js"
        env = dict(os.environ)
        if not env.get("NODE_PATH"):
            env["NODE_PATH"] = str(ROOT / "tests" / "node_modules")
        p = subprocess.run(["node", str(js), str(samples_dir)], capture_output=True, text=True, env=env, timeout=240)
        if p.returncode != 0:
            bad("export_samples.js failed: " + (p.stderr or p.stdout)[-1500:])
            return
        ok("export_samples.js: " + p.stdout.strip()[-400:])
    f = lambda n: json.loads((samples_dir / n).read_text(encoding="utf-8"))  # noqa: E731
    ws = f("workspace_backup.json")
    validate(registry, schema_uri("workspace_backup.schema.json"), ws, f"workspace_backup.json ({len(ws['binders'])} binders, {len(ws['locations'])} locations, {len(ws.get('sync_journal', []))} journal entries)")
    check(len(ws.get("locations", [])) >= 6 and len(ws.get("sync_journal", [])) >= 2 and len(ws.get("activity_log", [])) >= 1,
          "workspace_backup.json carries locations, sync_journal and activity_log")
    pkg = f("sync_package.json")
    validate(registry, schema_uri("sync_package.schema.json"), pkg, f"sync_package.json ({pkg['counts']})")
    check(len(pkg.get("tombstones", [])) >= 1, "sync_package.json has at least one tombstone")
    validate(registry, schema_uri("sync_package.schema.json") + "#/$defs/plain", pkg, "sync_package.json is the plain variant")
    enc = f("sync_package_enc.json")
    validate(registry, schema_uri("sync_package.schema.json") + "#/$defs/encrypted", enc, "sync_package_enc.json is the encrypted variant")
    try:
        dec = decrypt_package(enc)
        ok("sync_package_enc.json decrypted in Python (PBKDF2-SHA256 + AES-256-GCM, AAD docmap-sync-enc/1)")
        validate(registry, schema_uri("sync_package.schema.json") + "#/$defs/plain", dec, "decrypted package is a valid plain package")
    except Exception as e:  # noqa: BLE001
        bad(f"sync_package_enc.json: decryption failed: {e}")
    rec = f("records.json")
    for k in ["binder", "client", "location", "archive", "activity_log_entry", "sync_journal_entry"]:
        if not check(rec.get(k) is not None, f"records.json has a {k}"):
            continue
        validate(registry, schema_uri(k + ".schema.json"), rec[k], f"records.json {k}")
    # every record of the backup also against the single schemas (already done through $ref) + no unknown top keys
    props = json.loads((SCHEMA_DIR / "binder.schema.json").read_text())["properties"].keys()
    extra = sorted({k for b in ws["binders"] for k in b} - set(props))
    check(not extra, f"binder keys written by the app are all described in binder.schema.json {extra or ''}")
    props = json.loads((SCHEMA_DIR / "location.schema.json").read_text())["properties"].keys()
    extra = sorted({k for b in ws["locations"] for k in b} - set(props))
    check(not extra, f"location keys written by the app are all described in location.schema.json {extra or ''}")
    props = json.loads((SCHEMA_DIR / "archive.schema.json").read_text())["properties"].keys()
    extra = sorted({k for b in ws.get("archives", []) for k in b} - set(props))
    check(len(ws.get("archives", [])) >= 1 and not extra, f"archive keys written by the app are all described in archive.schema.json {extra or ''}")
    props = json.loads((SCHEMA_DIR / "workspace_backup.schema.json").read_text())["properties"].keys()
    extra = sorted(set(ws) - set(props))
    check(not extra, f"workspace top-level keys are all described {extra or ''}")
    return ws


# ---------------------------------------------------------------- static route check
def php_routes():
    src = API_PHP.read_text(encoding="utf-8")
    out = {"ping": None}
    for var in ("reads", "writes"):
        m = re.search(r"\$" + var + r"\s*=\s*\[(.*?)\];", src)
        for k, v in re.findall(r"'(\w+)'\s*=>\s*'(\w+)'", m.group(1)):
            out[k] = (v, var)
    return out


def step_routes(api):
    print("\n[3] routes of api.php vs openapi.yaml")
    routes = php_routes()
    paths = {p.strip("/"): v for p, v in api["paths"].items()}
    check(set(routes) == set(paths), f"same routes ({len(routes)}): {sorted(routes)}")
    for r, spec in routes.items():
        if r not in paths:
            continue
        op = next(iter(paths[r].values()))
        if spec is None:
            check(op.get("security") == [], f"{r}: no token")
            continue
        role, kind = spec
        check(op.get("x-docmap-role") == role, f"{r}: role {role}")
        meth = next(iter(paths[r].keys()))
        check((meth == "post") == (kind == "writes"), f"{r}: {'POST only' if kind == 'writes' else 'GET (or POST)'}")
        check(op.get("x-docmap-route") == r, f"{r}: x-docmap-route")


# ---------------------------------------------------------------- reference implementation (PORTING.md §3-§5)
CANON_SKIP = ("updated_at", "short_url", "location_code", "selected_for_print")


def canon(v, top=True):
    """Python twin of canon() in api.php (and jrCanon in 06i-journal.js)."""
    if isinstance(v, dict):
        if not v:
            return []                     # PHP: {} decoded as [] → list
        keys = list(v.keys())
        if keys == [str(i) for i in range(len(keys))]:
            return [canon(v[k], False) for k in keys]      # PHP sees "0".."n" keys as a list
        out = {}
        for k in sorted(v.keys(), key=lambda s: s.encode("utf-8")):   # ksort on byte strings
            if top and k in CANON_SKIP:
                continue
            if k.startswith("_"):
                continue
            out[k] = canon(v[k], False)
        return out
    if isinstance(v, list):
        return [canon(x, False) for x in v]
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return str(int(v)) if v.is_integer() and abs(v) < 1e15 else repr(v)
    return v


def jenc(v):
    """json_encode(JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES): compact, UTF-8, U+2028/2029 still escaped."""
    s = json.dumps(v, ensure_ascii=False, separators=(",", ":"))
    return s.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")


def canon_hash(data):
    return hashlib.sha256(jenc(canon(data)).encode("utf-8")).hexdigest()


def blob_decrypt(key, blob, aad):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    blob = bytes(blob)
    assert blob[0] == 1 and len(blob) >= 29, "blob version byte"
    iv, tag, ct = blob[1:13], blob[13:29], blob[29:]
    return AESGCM(key).decrypt(iv, ct + tag, aad.encode("utf-8")).decode("utf-8")


def hidx(key, v):
    return None if v == "" else hmac.new(key, ("docmap-idx/" + v).encode("utf-8"), hashlib.sha256).hexdigest()[:40]


# ---------------------------------------------------------------- live php server
def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Api:
    def __init__(self, base):
        self.base = base

    def call(self, route, method="GET", token=None, body=None, query=None, headers=None, raw=None):
        q = "?r=" + route + "".join(f"&{k}={urllib.request.quote(str(v))}" for k, v in (query or {}).items())
        h = {"Accept": "application/json"}
        if token:
            h["X-DocMap-Token"] = token
        h.update(headers or {})
        data = None
        if raw is not None:
            data = raw.encode("utf-8")
            h.setdefault("Content-Type", "application/json")
        elif body is not None:
            data = json.dumps(body).encode("utf-8")
            h.setdefault("Content-Type", "application/json")
        req = urllib.request.Request(self.base + q, data=data, method=method, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.status, json.loads(r.read() or b"null"), dict(r.headers)
        except urllib.error.HTTPError as e:
            txt = e.read()
            try:
                j = json.loads(txt)
            except Exception:  # noqa: BLE001
                j = {"_raw": txt[:300].decode("utf-8", "replace")}
            return e.code, j, dict(e.headers)


def response_schema(api, route, status):
    path = api["paths"]["/" + route]
    op = next(iter(path.values()))
    resp = op["responses"].get(str(status))
    if resp is None:
        return None
    if "$ref" in resp:
        resp = api["components"]["responses"][resp["$ref"].rsplit("/", 1)[1]]
    sch = resp["content"]["application/json"]["schema"]
    return OPENAPI.as_uri() + sch["$ref"] if sch["$ref"].startswith("#") else (OPENAPI.parent / sch["$ref"]).as_uri()


def expect(api, registry, res, route, status, label, code=None):
    st, body, _ = res
    if not check(st == status, f"{route} {label}: HTTP {status}" + ("" if st == status else f" (got {st}: {json.dumps(body)[:300]})")):
        return body
    uri = response_schema(api, route, status)
    if not check(uri is not None, f"{route}: response {status} documented in openapi.yaml"):
        return body
    validate(registry, uri, body, f"{route} {label}: body matches openapi")
    if code:
        check(body.get("error", {}).get("code") == code, f"{route} {label}: error.code {code}")
    return body


def iso_now(offset_ms=0):
    t = time.time() + offset_ms / 1000
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(t)) + ".%03dZ" % int((t % 1) * 1000)


def step_php(api, registry, ws, work):
    print("\n[4] live server-php/api.php (php -S) against openapi.yaml")
    if not shutil.which("php"):
        print("  SKIP php not on the PATH")
        return
    srv = work / "srv"
    data_dir = work / "data"
    srv.mkdir()
    data_dir.mkdir()
    shutil.copy(API_PHP, srv / "api.php")
    key = os.urandom(32)
    toks = {"admin": "adm-" + os.urandom(12).hex(), "editor": "edi-" + os.urandom(12).hex(), "viewer": "vie-" + os.urandom(12).hex()}
    cfg_tokens = ",\n".join(
        f"    ['user' => 'Test {r}', 'role' => '{r}', 'token_sha256' => '{hashlib.sha256(t.encode()).hexdigest()}']" for r, t in toks.items())
    (srv / "config.php").write_text(
        "<?php\nif (!defined('DOCMAP_API')) { http_response_code(404); exit; }\nreturn [\n"
        f"  'data_dir' => '{data_dir}',\n  'aes_key' => '{base64.b64encode(key).decode()}',\n"
        f"  'tokens' => [\n{cfg_tokens}\n  ],\n  'max_fails' => 3, 'lock_seconds' => 2, 'studio_name' => 'Studio di prova',\n];\n", encoding="utf-8")
    port = free_port()
    proc = subprocess.Popen(["php", "-S", f"127.0.0.1:{port}", "-t", str(srv)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        a = Api(f"http://127.0.0.1:{port}/api.php")
        for _ in range(50):
            try:
                a.call("ping")
                break
            except Exception:  # noqa: BLE001
                time.sleep(0.1)
        run_routes(api, registry, a, toks, ws, key, data_dir)
    finally:
        proc.terminate()
        proc.wait(timeout=10)


def run_routes(api, registry, a, toks, ws, key, data_dir):
    A, E, V = toks["admin"], toks["editor"], toks["viewer"]
    dev = {"X-DocMap-Device": "dev-validator", "X-DocMap-Device-Name": "PC%20validatore", "X-DocMap-App": "26.11.1"}
    p = expect(api, registry, a.call("ping"), "ping", 200, "no token")
    check(p.get("features") == ["journal", "device_info", "locations", "archives", "access_log"] and p.get("schema") == 3, f"ping features/schema {p.get('features')} {p.get('schema')}")
    expect(api, registry, a.call("me", token=E, headers=dev), "me", 200, "editor")
    expect(api, registry, a.call("me"), "me", 401, "no token", "token_missing")
    st, b, _ = a.call("nope", token=E)
    check(st == 404 and b["error"]["code"] == "no_route", "unknown route → 404 no_route")
    validate(registry, comp_uri("Error"), b, "no_route body is an Error")
    expect(api, registry, a.call("push", method="GET", token=E), "push", 405, "GET", "method")
    expect(api, registry, a.call("push", method="POST", token=E, raw="not json"), "push", 400, "bad body", "bad_json")
    expect(api, registry, a.call("pull", token=V, query={"since": 0, "log_since": 0}), "pull", 200, "empty server since=0")

    # push the real records of the sample backup (the PC's first upload)
    now = iso_now()
    recs = []
    for t, arr in (("binder", ws["binders"]), ("client", ws["clients"]), ("location", ws["locations"]), ("archive", ws.get("archives", []))):
        for r in arr:
            d = dict(r)
            d["updated_at"] = d.get("updated_at") or now
            recs.append({"type": t, "id": d["id"], "updated_at": d["updated_at"], "data": d})
    tomb_id = "b-validator-deleted"
    body = {"records": recs, "tombstones": [{"type": "binder", "id": tomb_id, "code": "ZZ9", "deletedAt": now, "who": "Schema Test"}],
            "settings": {"updated_at": now, "data": {"studioName": "Studio di prova", "destTemplate": ws["settings"]["destTemplate"]}},
            "activity_log": ws.get("activity_log", [])[:20], "deviceId": "dev-validator", "operator": "Schema Test"}
    expect(api, registry, a.call("push", method="POST", token=V, body=body), "push", 403, "viewer", "forbidden")
    r = expect(api, registry, a.call("push", method="POST", token=E, body=body, headers=dev), "push", 200, f"editor, {len(recs)} records")
    check(r.get("applied") == len(recs) + 1, f"push applied {r.get('applied')} = records + tombstone")
    push_jid = r.get("journal_id")
    # same push again → same; an older copy → rejected older with current
    r = expect(api, registry, a.call("push", method="POST", token=E, body={"records": recs[:1], "deviceId": "dev-validator"}), "push", 200, "same content again")
    check(r.get("same") == 1, "identical record → same")
    old = json.loads(json.dumps(recs[0]))
    old["updated_at"] = "2001-01-01T00:00:00.000Z"
    old["data"]["updated_at"] = old["updated_at"]
    old["data"]["notes"] = "older copy"
    r = expect(api, registry, a.call("push", method="POST", token=E, body={"records": [old], "deviceId": "dev-validator"}), "push", 200, "older record")
    check(len(r.get("rejected", [])) == 1 and r["rejected"][0]["reason"] == "older" and "current" in r["rejected"][0], "older record → rejected older + current")

    r = expect(api, registry, a.call("pull", token=V, query={"since": 0, "log_since": 0}, headers=dev), "pull", 200, "since=0 after push")
    check(len(r.get("records", [])) == len(recs) and len(r.get("tombstones", [])) == 1 and r.get("counts") is not None, "pull returns records, tombstone, counts")
    for rec in r.get("records", [])[:400]:
        sch = {"binder": "binder.schema.json", "client": "client.schema.json", "location": "location.schema.json", "archive": "archive.schema.json"}[rec["type"]]
        errs = list(validator_for(registry, schema_uri(sch)).iter_errors(rec["data"]))
        if errs:
            bad(f"pull record {rec['type']}/{rec['id']} vs {sch}: {errs[0].message[:200]}")
            break
    else:
        ok("every pulled record data matches its record schema")

    binder = next(b for b in ws["binders"] if b["speaking_code"] == "PS1")
    loc_b01 = next(l for l in ws["locations"] if l["seg"] == "B01")
    loc_b02 = next(l for l in ws["locations"] if l["seg"] == "B02")
    rb = expect(api, registry, a.call("binder", token=V, query={"qr": binder["short_code"]}), "binder", 200, "by qr")
    expect(api, registry, a.call("binder", token=V, query={"code": "ps1"}), "binder", 200, "by speaking code (lower case)")
    expect(api, registry, a.call("binder", token=V, query={"qr": "dm26NOTHERE0"}), "binder", 404, "unknown qr", "not_found")
    expect(api, registry, a.call("location", token=V, query={"qr": loc_b01["short_code"]}), "location", 200, "by qr")
    expect(api, registry, a.call("location", token=V, query={"code": loc_b01["code"].lower()}), "location", 200, "by code")
    rr = expect(api, registry, a.call("resolve", token=V, query={"qr": loc_b01["short_code"]}), "resolve", 200, "location qr")
    check(rr.get("type") == "location" and rr.get("count", 0) >= 1, "resolve → location with the binder inside")
    rr = expect(api, registry, a.call("resolve", token=V, query={"qr": binder["short_code"]}), "resolve", 200, "binder qr")
    check(rr.get("type") == "binder", "resolve → binder")

    etag = rb["etag"]
    expect(api, registry, a.call("patch", method="POST", token=E, body={"id": binder["id"], "patch": {"company_name": "x"}, "base_updated_at": etag}), "patch", 422, "field not allowed", "field_not_allowed")
    expect(api, registry, a.call("patch", method="POST", token=E, body={"id": binder["id"], "patch": {"location_id": "nope-location"}, "base_updated_at": etag}), "patch", 422, "unknown location", "invalid_location")
    rp = expect(api, registry, a.call("patch", method="POST", token=E, headers=dev, body={"id": binder["id"], "patch": {"location_id": loc_b02["id"], "notes": "spostato dal validatore"}, "base_updated_at": etag, "operator": "Telefono test"}), "patch", 200, "move to B02")
    check(rp.get("binder", {}).get("location_code") == loc_b02["code"], f"patch recomputes location_code = {loc_b02['code']}")
    rc = expect(api, registry, a.call("patch", method="POST", token=E, body={"id": binder["id"], "patch": {"notes": "vecchia base"}, "base_updated_at": etag}), "patch", 409, "stale base", "conflict")
    check("current" in rc and rc.get("current_etag") == rp.get("etag") and "current" in rc.get("error", {}), "409 carries current + current_etag (top level and inside error)")
    expect(api, registry, a.call("patch", method="POST", token=E, body={"id": "b-none", "patch": {"notes": "x"}}), "patch", 404, "unknown binder", "not_found")

    expect(api, registry, a.call("tokens", token=E), "tokens", 403, "editor", "forbidden")
    tc = expect(api, registry, a.call("token_create", method="POST", token=A, body={"user": "Telefono Anna", "role": "editor"}), "token_create", 200, "admin")
    expect(api, registry, a.call("token_create", method="POST", token=A, body={"user": "<bad>"}), "token_create", 422, "bad user name", "invalid")
    expect(api, registry, a.call("me", token=tc.get("token")), "me", 200, "new db token works")
    expect(api, registry, a.call("tokens", token=A), "tokens", 200, "admin")
    expect(api, registry, a.call("token_revoke", method="POST", token=A, body={"id": tc.get("id")}), "token_revoke", 200, "revoke")
    expect(api, registry, a.call("token_revoke", method="POST", token=A, body={"id": tc.get("id")}), "token_revoke", 404, "again", "not_found")
    expect(api, registry, a.call("token_revoke", method="POST", token=A, body={"id": "cfg:0"}), "token_revoke", 422, "config token", "invalid")

    expect(api, registry, a.call("journal", token=V), "journal", 403, "viewer", "forbidden")
    jl = expect(api, registry, a.call("journal", token=E), "journal", 200, "editor (own entries)")
    ja = expect(api, registry, a.call("journal", token=A, query={"limit": 200}), "journal", 200, "admin (all)")
    check(all("ip" in it for it in ja.get("items", [])) and not any("ip" in it for it in jl.get("items", [])), "ip only for admin")
    je = expect(api, registry, a.call("journal", token=A, query={"entry": rp.get("journal_id")}), "journal", 200, "one entry with versions")
    item = je["items"][0]["records"][0]
    check(item.get("new_hash") == rp.get("hash"), "patch hash = journal new_hash")
    check(item.get("prev") is not None and item.get("new") is not None, "entry= returns prev / new")
    check(item.get("new_hash") == canon_hash(item["new"]), "Python canon_hash(new) == server new_hash (canonical JSON reproduced)")
    check(item.get("prev_hash") == canon_hash(item["prev"]), "Python canon_hash(prev) == server prev_hash")
    expect(api, registry, a.call("journal", token=A, query={"entry": 999999}), "journal", 404, "unknown entry", "not_found")
    jf = expect(api, registry, a.call("journal", token=A, query={"code": "ps1"}), "journal", 200, "filter by code (HMAC index)")
    check(len(jf.get("items", [])) >= 2, f"code filter finds the push and the patch ({len(jf.get('items', []))})")
    expect(api, registry, a.call("journal_restore", method="POST", token=E, body={"jid": rp.get("journal_id"), "n": 1}), "journal_restore", 403, "editor", "forbidden")
    rs = expect(api, registry, a.call("journal_restore", method="POST", token=A, body={"jid": rp.get("journal_id"), "n": 1, "version": "prev"}), "journal_restore", 200, "restore prev")
    check(rs.get("updated_at", "") > rp.get("etag", ""), "restored version is a NEW write (updated_at later)")
    expect(api, registry, a.call("journal_restore", method="POST", token=A, body={"jid": 0, "n": 0}), "journal_restore", 422, "bad jid", "invalid")
    expect(api, registry, a.call("journal_restore", method="POST", token=A, body={"jid": 999999, "n": 1}), "journal_restore", 404, "unknown item", "not_found")

    # ---- v12 access log: the binder / location / resolve reads above were recorded; seen, access, last_seen
    expect(api, registry, a.call("binder", token=V, headers=dev, query={"qr": binder["short_code"], "via": "nfc"}), "binder", 200, "via=nfc (access_log)")
    sn = expect(api, registry, a.call("seen", method="POST", token=E, headers=dev, body={"items": [
        {"type": "binder", "id": binder["id"], "code": "PS1", "at": iso_now(-60000), "via": "nav"},
        {"type": "binder", "id": binder["id"], "code": "PS1", "at": "2001-01-01T00:00:00.000Z"},
        {"type": "nope", "id": binder["id"], "at": iso_now()}]}), "seen", 200, "editor, 1 valid + 2 skipped")
    check(sn.get("recorded") == 1 and sn.get("skipped") == 2, f"seen recorded 1, skipped 2 ({sn.get('recorded')}, {sn.get('skipped')})")
    expect(api, registry, a.call("seen", method="POST", token=E, body={"items": [{"id": binder["id"], "at": iso_now()}] * 501}), "seen", 413, "501 items", "too_large")
    expect(api, registry, a.call("seen", method="POST", token=E, body={"nope": 1}), "seen", 400, "no items", "invalid")
    expect(api, registry, a.call("access", token=V), "access", 403, "viewer", "forbidden")
    ae = expect(api, registry, a.call("access", token=E), "access", 200, "editor (own rows)")
    aa = expect(api, registry, a.call("access", token=A, query={"limit": 200}), "access", 200, "admin (all)")
    check(len(aa.get("items", [])) >= len(ae.get("items", [])) >= 1 and all(it.get("user") == "Test editor" for it in ae.get("items", [])), "access: editor sees only own rows, admin sees all")
    check(all("ip" in it for it in aa.get("items", [])) and not any("ip" in it for it in ae.get("items", [])), "access: ip only for admin")
    check(any(it.get("via") == "nfc" and it.get("route") == "binder" for it in aa.get("items", [])) and any(it.get("route") == "seen" for it in aa.get("items", [])), "access: binder read with via=nfc and the seen item are listed")
    af = expect(api, registry, a.call("access", token=A, query={"code": "ps1", "via": "nav"}), "access", 200, "filter code + via (HMAC index)")
    check(len(af.get("items", [])) >= 1 and all(it["target"]["code"] == "PS1" and it["via"] == "nav" for it in af.get("items", [])), "access code/via filter")
    expect(api, registry, a.call("access", token=A, query={"type": "nope"}), "access", 422, "bad type", "invalid")
    pg = expect(api, registry, a.call("access", token=A, query={"limit": 1}), "access", 200, "page of 1")
    check(pg.get("more") is True and isinstance(pg.get("next_before"), int), "access paging: more + next_before")
    ls = expect(api, registry, a.call("last_seen", token=V, query={"type": "binder", "id": binder["id"]}), "last_seen", 200, "viewer, by id")
    check(ls.get("total", 0) >= 2 and 1 <= len(ls.get("items", [])) <= 5, f"last_seen total {ls.get('total')} (max 5 items by default)")
    expect(api, registry, a.call("last_seen", token=V, query={"code": "PS1", "limit": 50}), "last_seen", 200, "by code, limit capped at 20")
    expect(api, registry, a.call("last_seen", token=V), "last_seen", 400, "no id / code", "invalid")
    m = expect(api, registry, a.call("me", token=V), "me", 200, "remember_minutes")
    check("remember_minutes" in m and m["remember_minutes"] is None, "me.remember_minutes = null (config default)")

    # ---- storage claims (PORTING.md §3): blob layout, AAD, HMAC index, key_check
    db = sqlite3.connect(str(data_dir / "docmap.sqlite"))
    db.row_factory = sqlite3.Row
    kc = db.execute("SELECT v FROM meta WHERE k='key_check'").fetchone()[0]
    check(blob_decrypt(key, base64.b64decode(kc), "meta/key_check") == "docmap-key-check", "meta key_check = base64(blob 'docmap-key-check', AAD meta/key_check)")
    check(db.execute("SELECT v FROM meta WHERE k='schema'").fetchone()[0] == "3", "meta schema = 3")
    row = db.execute("SELECT * FROM records WHERE type='binder' AND id=?", (binder["id"],)).fetchone()
    blob = bytes(row["payload"])
    check(blob[0] == 1, "record blob starts with version byte 0x01")
    d = json.loads(blob_decrypt(key, blob, f"records/binder/{binder['id']}"))
    check("updated_at" not in d and d.get("speaking_code") == "PS1", "record payload decrypts with AAD records/<type>/<id> (updated_at kept only in the column)")
    try:
        blob_decrypt(key, blob, "records/binder/other")
        bad("wrong AAD must fail")
    except Exception:  # noqa: BLE001
        ok("a wrong AAD fails the GCM tag check")
    check(row["k_short"] == hidx(key, d["short_code"]) and len(row["k_short"]) == 40, "k_short = HMAC-SHA256(key, 'docmap-idx/'+short_code)[:40]")
    check(row["k_code"] == hidx(key, d["speaking_code"].strip().upper()), "k_code = hidx(upper(trim(speaking_code)))")
    exp_cab = hidx(key, d.get("room_code", "") + "\x1f" + d.get("cabinet_code", "")) if (d.get("room_code") or d.get("cabinet_code")) else None
    check(row["k_cab"] == exp_cab, "k_cab = hidx(room + '\\x1f' + cabinet) or NULL")
    lrow = db.execute("SELECT * FROM records WHERE type='location' AND id=?", (loc_b01["id"],)).fetchone()
    ld = json.loads(blob_decrypt(key, lrow["payload"], f"records/location/{loc_b01['id']}"))
    check(lrow["k_code"] == hidx(key, ld["code"].upper()) and lrow["k_short"] == hidx(key, ld["short_code"]), "location k_code / k_short")
    srow = db.execute("SELECT json FROM settings_shared").fetchone()
    check(json.loads(blob_decrypt(key, srow["json"], "settings/subset")).get("studioName") == "Studio di prova", "settings blob AAD settings/subset")
    arow = db.execute("SELECT id, payload FROM activity_log LIMIT 1").fetchone()
    if arow:
        check(json.loads(blob_decrypt(key, arow["payload"], "activity/" + arow["id"])).get("id") == arow["id"], "activity blob AAD activity/<id>")
    jrow = db.execute("SELECT * FROM sync_journal WHERE jid=?", (push_jid,)).fetchone()
    meta = json.loads(blob_decrypt(key, jrow["meta"], f"journal/{push_jid}"))
    check(meta.get("user") == "Test editor" and meta.get("device_id") == "dev-validator", "journal meta AAD journal/<jid> (user, device)")
    check(jrow["k_user"] == hidx(key, "user/test editor") and jrow["k_device"] == hidx(key, "device/dev-validator"), "journal k_user = hidx('user/'+lower(user)), k_device = hidx('device/'+id)")
    it = db.execute("SELECT * FROM sync_journal_items WHERE jid=? AND id=?", (push_jid, binder["id"])).fetchone()
    pl = json.loads(blob_decrypt(key, it["payload"], f"journal/{push_jid}/{it['n']}"))
    check(it["k_code"] == hidx(key, "PS1") and it["new_hash"] == canon_hash(pl["new"]), "journal item AAD journal/<jid>/<n>, k_code, new_hash = canon_hash(new)")
    tt = db.execute("SELECT * FROM sync_journal_items WHERE jid=? AND id=?", (push_jid, tomb_id)).fetchone()
    check(tt is not None and tt["new_hash"] == hashlib.sha256(f"deleted:binder/{tomb_id}@{now}".encode()).hexdigest(), "tombstone hash = sha256('deleted:<type>/<id>@<deletedAt>')")
    acc = db.execute("SELECT * FROM access_log WHERE route='seen' ORDER BY aid DESC LIMIT 1").fetchone()
    am = json.loads(blob_decrypt(key, acc["meta"], f"access/{acc['aid']}"))
    check(am.get("user") == "Test editor" and am.get("device_id") == "dev-validator" and am.get("code") == "PS1", "access_log meta AAD access/<aid> (user, device, code)")
    check(acc["k_user"] == hidx(key, "user/test editor") and acc["k_device"] == hidx(key, "device/dev-validator") and acc["k_code"] == hidx(key, "PS1"), "access_log k_user / k_device / k_code HMAC indexes")
    db.close()

    # ---- rate limit last (it locks this IP): 401 token_invalid with left, then 429 locked + Retry-After
    st, b, _ = a.call("me", token="wrong-1")
    expect(api, registry, (st, b, {}), "me", 401, "wrong token", "token_invalid")
    check(isinstance(b.get("error", {}).get("left"), int), "401 token_invalid carries left")
    a.call("me", token="wrong-2")
    a.call("me", token="wrong-3")
    st, b, h = a.call("me", token=E)
    expect(api, registry, (st, b, h), "me", 429, "locked even with a good token", "locked")
    check(any(k.lower() == "retry-after" for k in h), "429 has Retry-After")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--samples", help="folder for the sample files (default: temporary)")
    ap.add_argument("--no-browser", action="store_true", help="do not run export_samples.js: validate the files already in --samples")
    ap.add_argument("--no-php", action="store_true", help="skip the live php step")
    args = ap.parse_args()
    work = Path(tempfile.mkdtemp(prefix="docmap-validate-"))
    samples = Path(args.samples).resolve() if args.samples else work / "samples"
    samples.mkdir(parents=True, exist_ok=True)
    schemas, api, registry = load_registry()
    step_schemas(schemas, api, registry)
    ws = step_samples(registry, samples, not args.no_browser)
    step_routes(api)
    if ws and not args.no_php:
        step_php(api, registry, ws, work)
    shutil.rmtree(work, ignore_errors=True)
    print("\nRESULT: " + ("all checks passed" if not FAILS else f"{len(FAILS)} FAILED"))
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
