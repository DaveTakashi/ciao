#!/usr/bin/env python3
"""Side-by-side test: the real server-php/api.php (php -S + tests/php-router.php) and the Python port receive the SAME
scripted requests and must answer the same (status, JSON, relevant headers), then write the same database.

  python3 docmapv1/server-python/tests/diff_test.py            (stdlib only: unittest + urllib; needs php 8 + pdo_sqlite)

Each server gets its own deploy root and data folder but the SAME aes_key and tokens. Volatile values are normalised
before comparing: server-generated times (now_iso) → "<now>", random ids/tokens → "<rand:N>" (by order of
appearance on each server), the `php` field of ping. Everything else must be byte-identical JSON.

Tests:
  test_1_sequence     ~200 request pairs: ping, me, push (new/same/older/tie/invalid/too large/tombstones/settings/log),
                      pull, binder/location/resolve, patch (good/stale/forced/bad field/bad location/If-Match), tokens,
                      token_create/revoke, journal (filters, entry), journal_restore, errors (no/wrong token, bad_json,
                      too_large, wrong method, unknown route), CORS (null, foreign, same origin), OPTIONS, static files
                      and deny rules
  test_2_database     the two docmap.sqlite files hold the same rows (payloads decrypted, HMAC indexes identical)
  test_3_switch       PHP data dir opened by Python and Python data dir opened by PHP: same answers, cross writes
  test_4_lock         IP lock: 401 token_invalid + left, 429 locked + Retry-After even with a good token, unlock
  test_1b_v12         v12: ping features, me.remember_minutes (config variants), archive / status_event push + pull
                      (same, tie, undo_of, tombstones), binder / location / resolve with status_events + status_types and
                      the `via` parameter, access (filters, paging, roles), last_seen, seen (dedupe, skips, 413/400/405),
                      access_dedupe_seconds = 0, access_keep_days = 0 then pruning
  test_5_upgrade      a v10.1 database (git 68ae170 api.php, schema 1) upgraded in place by Python = by PHP v12 (1 → 2 → 3)
  test_6_upgrade_v11  a v11.1 database (git 32c3485 api.php, schema 2) upgraded to schema 3 by Python = by PHP v12; one
                      data folder upgraded by Python then served by PHP v12 (and the reverse); v11.1 PHP still serves it
"""
import base64
import hashlib
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
import unittest
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PYROOT = os.path.dirname(HERE)                         # docmapv1/server-python
DOCMAP = os.path.dirname(PYROOT)                       # docmapv1
REPO = os.path.dirname(DOCMAP)
SRV_PHP = os.path.join(DOCMAP, "server-php")
ROUTER = os.path.join(DOCMAP, "tests", "php-router.php")
API_PATH = "/studio-de/server-php/api.php"
sys.path.insert(0, PYROOT)

from docmap_server.crypto import dec as blob_dec  # noqa: E402

KEY = os.urandom(32)
TOK = {"dave": "dtok-admin-" + os.urandom(9).hex(), "mario": "dtok-ed-" + os.urandom(9).hex(),
       "anna": "dtok-ed2-" + os.urandom(9).hex(), "lucia": "dtok-v-" + os.urandom(9).hex()}
A, E, E2, V = TOK["dave"], TOK["mario"], TOK["anna"], TOK["lucia"]
DEV = {"X-DocMap-Device": "dev-diff", "X-DocMap-Device-Name": "PC%20diff%20%C3%A8", "X-DocMap-App": "26.11.1"}
PHONE = {"X-DocMap-Device": "phone-diff", "X-DocMap-Device-Name": "Telefono%20Lucia", "X-DocMap-App": "26.12.0"}
T0 = time.time()

HEX32 = re.compile(r"[0-9a-f]{32}")
ISO_RE = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z")


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def php_config(data_dir, max_fails=50, lock_seconds=60, max_body_mb=1, extra=""):
    toks = ", ".join("['user' => '%s', 'role' => '%s', 'token_sha256' => '%s']" % (u, r, hashlib.sha256(TOK[u].encode()).hexdigest())
                     for u, r in (("dave", "admin"), ("mario", "editor"), ("anna", "editor"), ("lucia", "viewer")))
    return ("<?php\nif (!defined('DOCMAP_API')) { http_response_code(404); exit; }\nreturn ['data_dir' => %s, 'aes_key' => '%s',\n"
            "  'tokens' => [%s, ['user' => 'off', 'role' => 'admin', 'token' => 'disabled-token', 'disabled' => true]],\n"
            "  'allowed_origins' => ['null', 'https://ok.example'], 'max_fails' => %d, 'lock_seconds' => %d, 'max_body_mb' => %d,\n"
            "  'studio_name' => 'Studio Diff è'%s];\n") % (json.dumps(data_dir), base64.b64encode(KEY).decode(), toks, max_fails, lock_seconds, max_body_mb, extra)


class Server:
    """One server under test: its deploy root (studio-de/server-php/ + static files), data dir, process."""

    def __init__(self, kind, work):
        self.kind = kind
        self.root = os.path.join(work, kind, "root")
        self.data = os.path.join(work, kind, "data")
        self.sp = os.path.join(self.root, "studio-de", "server-php")
        os.makedirs(os.path.join(self.sp, "data"))
        os.makedirs(self.data)
        shutil.copy(os.path.join(SRV_PHP, "api.php"), self.sp)
        shutil.copy(os.path.join(SRV_PHP, ".htaccess"), self.sp)
        shutil.copy(os.path.join(SRV_PHP, "data", ".htaccess"), os.path.join(self.sp, "data"))
        shutil.copy(os.path.join(SRV_PHP, "data", "index.html"), os.path.join(self.sp, "data"))
        shutil.copy(os.path.join(SRV_PHP, "config.sample.php"), self.sp)
        with open(os.path.join(self.root, "studio-de", "index.html"), "w", encoding="utf-8") as f:
            f.write("<!DOCTYPE html><title>DocMap diff</title><p>ciao è</p>\n")
        with open(os.path.join(self.root, "studio-de", "app.js"), "w", encoding="utf-8") as f:
            f.write("console.log('x');\n")
        self.config = os.path.join(self.sp, "config.php")
        self.port = free_port()
        self.proc = None
        self.log = open(os.path.join(work, kind, "server.log"), "ab")

    _mt = [time.time()]

    def write_config(self, data_dir=None, **kw):
        with open(self.config, "w", encoding="utf-8") as f:
            f.write(php_config(data_dir or self.data, **kw))
        Server._mt[0] = max(Server._mt[0] + 10, time.time())
        os.utime(self.config, (Server._mt[0], Server._mt[0]))

    def start(self, config=None):
        if self.kind.startswith("php"):
            cmd = ["php", "-S", "127.0.0.1:%d" % self.port, "-t", self.root, ROUTER]
        else:
            cmd = [sys.executable, "-m", "docmap_server", "serve", "--config", config or self.config, "--port", str(self.port),
                   "--root", self.root, "--log-level", "warning"]
        if self.log.closed:
            self.log = open(self.log.name, "ab")
        self.proc = subprocess.Popen(cmd, cwd=PYROOT, stdout=self.log, stderr=self.log)
        for _ in range(100):
            try:
                urllib.request.urlopen("http://127.0.0.1:%d%s?r=ping" % (self.port, API_PATH), timeout=2).read()
                return
            except Exception:   # noqa: BLE001
                time.sleep(0.1)
        raise RuntimeError(self.kind + " server did not start")

    def stop(self):
        if self.proc:
            self.proc.terminate()
            try:
                self.proc.wait(10)
            except subprocess.TimeoutExpired:
                self.proc.kill()
            self.proc = None
        self.log.close()

    @property
    def origin(self):
        return "http://127.0.0.1:%d" % self.port

    def call(self, route, method=None, token=None, body=None, raw=None, query=None, headers=None, path=None):
        url = self.origin + (path if path is not None else API_PATH)
        if route is not None:
            url += "?r=" + route + "".join("&%s=%s" % (k, urllib.request.quote(str(v), safe="")) for k, v in (query or {}).items())
        h = {}
        if token:
            h["X-DocMap-Token"] = token
        h.update(headers or {})
        data = None
        if raw is not None:
            data = raw if isinstance(raw, bytes) else raw.encode("utf-8")
            h.setdefault("Content-Type", "text/plain;charset=UTF-8")
        elif body is not None:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            h.setdefault("Content-Type", "application/json")
        m = method or ("POST" if data is not None else "GET")
        req = urllib.request.Request(url, data=data, method=m, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                st, txt, hd = r.status, r.read(), r.headers
        except urllib.error.HTTPError as e:
            st, txt, hd = e.code, e.read(), e.headers
        try:
            j = json.loads(txt) if txt else None
        except ValueError:
            j = {"_raw": txt.decode("utf-8", "replace")[:200]}
        return st, j, {k.lower(): v for k, v in hd.items()}, txt


HDRS = ("content-type", "cache-control", "x-content-type-options", "referrer-policy", "etag", "retry-after", "vary",
        "access-control-allow-origin", "access-control-allow-methods", "access-control-allow-headers",
        "access-control-expose-headers", "access-control-max-age")


class Norm:
    """Per-server normaliser: server times → <now>, random values → <rand:N> in order of first appearance."""

    def __init__(self):
        self.rand = {}

    def reg(self, value):
        if value not in self.rand:
            self.rand[value] = "<rand:%d>" % (len(self.rand) + 1)

    def s(self, v):
        if v in self.rand:
            return self.rand[v]
        def rep(m):
            t = m.group(0)
            try:
                ts = time.mktime(time.strptime(t[:19], "%Y-%m-%dT%H:%M:%S")) - time.timezone
            except ValueError:
                return t
            return "<now>" if T0 - 120 <= ts <= time.time() + 120 else t
        v = ISO_RE.sub(rep, v)
        if HEX32.fullmatch(v):
            return "<hex32>"
        for k, r in self.rand.items():
            if k in v:
                v = v.replace(k, r)
        return v

    def __call__(self, v):
        if isinstance(v, dict):
            return {k: self(x) for k, x in v.items()}
        if isinstance(v, list):
            return [self(x) for x in v]
        if isinstance(v, str):
            return self.s(v)
        return v


def first_diff(a, b, path="$"):
    if type(a) is not type(b):
        return "%s: %r vs %r" % (path, a, b)
    if isinstance(a, dict):
        if list(a.keys()) != list(b.keys()):
            return "%s keys: %s vs %s" % (path, list(a.keys()), list(b.keys()))
        for k in a:
            r = first_diff(a[k], b[k], path + "." + str(k))
            if r:
                return r
        return None
    if isinstance(a, list):
        if len(a) != len(b):
            return "%s len %d vs %d" % (path, len(a), len(b))
        for i, (x, y) in enumerate(zip(a, b)):
            r = first_diff(x, y, "%s[%d]" % (path, i))
            if r:
                return r
        return None
    return None if a == b else "%s: %r vs %r" % (path, a, b)


class Duo:
    def __init__(self, php, py):
        self.php, self.py = php, py
        self.n = {"php": Norm(), "py": Norm()}
        self.ok = 0
        self.fails = []
        self.saved = {"php": {}, "py": {}}

    def both(self, label, route, expect=None, reg=None, ignore=(), **kw):
        """Same request to both servers (kw values may be callables(kind, saved) for per-server values).
        reg(json) → random values of the answer to register in each server's normaliser before comparing."""
        res = {}
        for kind, srv in (("php", self.php), ("py", self.py)):
            k2 = {k: (v(kind, self.saved[kind]) if callable(v) else v) for k, v in kw.items()}
            res[kind] = srv.call(route, **k2)
            if reg and isinstance(res[kind][1], dict) and res[kind][0] == 200:
                for x in reg(res[kind][1]):
                    self.n[kind].reg(x)
        self.compare(label, res, expect, ignore)
        return res

    def compare(self, label, res, expect=None, ignore=()):
        (s1, j1, h1, t1), (s2, j2, h2, t2) = res["php"], res["py"]
        n1, n2 = self.n["php"], self.n["py"]
        probs = []
        if s1 != s2:
            probs.append("status php=%s py=%s" % (s1, s2))
        if expect is not None and s1 != expect:
            probs.append("php status %s != expected %s" % (s1, expect))
        a, b = n1(j1), n2(j2)
        try:   # 429: retry_in is "seconds left", the two requests may straddle a second boundary
            ra, rb = a["error"]["retry_in"], b["error"]["retry_in"]
            if abs(ra - rb) <= 1:
                a = json.loads(json.dumps(a))
                a["error"]["retry_in"] = rb
        except (KeyError, TypeError):
            pass
        if ignore and isinstance(a, dict) and isinstance(b, dict):
            a = {k: v for k, v in a.items() if k not in ignore}
            b = {k: v for k, v in b.items() if k not in ignore}
        if isinstance(a, dict) and a.get("php") is not None and "api" in a:
            a = dict(a, php="<runtime>")
            b = dict(b, php="<runtime>") if isinstance(b, dict) else b
        if a != b:
            probs.append("json differs at " + str(first_diff(a, b))[:800])
        for h in HDRS:
            v1, v2 = h1.get(h), h2.get(h)
            if h == "content-type" and v1 and v2:
                v1, v2 = v1.lower().replace(" ", ""), v2.lower().replace(" ", "")
            if h == "retry-after" and v1 and v2 and abs(int(v1) - int(v2)) <= 1:
                continue
            if v1 is not None and v2 is not None:
                v1, v2 = n1.s(v1), n2.s(v2)
            if v1 != v2:
                probs.append("header %s php=%r py=%r" % (h, v1, v2))
        if j1 is None and j2 is None and t1 != t2:
            probs.append("raw body differs php=%r py=%r" % (t1[:200], t2[:200]))
        if probs:
            self.fails.append(label + ": " + "; ".join(probs))
            print("  DIFF " + label + "\n    " + "\n    ".join(probs))
        else:
            self.ok += 1
        return not probs


def B(id_, code, at, **x):
    d = {"id": id_, "speaking_code": code, "company_name": "Ornitorinco Diff " + code + " S.r.l.", "category": "IVA",
         "short_code": "dm26Df" + code[-3:] + "Qx", "room_code": "R", "cabinet_code": "7", "shelf_code": "β",
         "contents_items": [{"year": "2025", "description": "Fatture è", "status": "archive"}], "tags": "diff", "location_id": "",
         "location_code": "", "created_at": "2025-10-01T08:00:00.000Z", "updated_at": at}
    d.update(x)
    return {"type": "binder", "id": id_, "updated_at": at, "data": d}


def L(id_, seg, parent, code, level, sc, at="2025-10-02T08:00:00.000Z", **x):
    d = {"id": id_, "seg": seg, "parent_id": parent, "code": code, "level": level, "kind": ["Magazzino", "Armadio", "Scatola"][min(level, 2)],
         "name": "Nodo " + seg, "short_code": sc, "notes": "", "sort": level, "created_at": at, "updated_at": at}
    d.update(x)
    return {"type": "location", "id": id_, "updated_at": at, "data": d}


class DiffTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.work = tempfile.mkdtemp(prefix="docmap-diff-")
        cls.php = Server("php", cls.work)
        cls.py = Server("py", cls.work)
        cls.php.start()
        cls.py.start()
        cls.duo = Duo(cls.php, cls.py)

    failed = False

    def run(self, result=None):
        r = super().run(result)
        if result is not None and (result.failures or result.errors):
            DiffTest.failed = True
        return r

    @classmethod
    def tearDownClass(cls):
        cls.php.stop()
        cls.py.stop()
        if cls.failed or os.environ.get("DOCMAP_KEEP"):
            print("\nwork folder kept for inspection: " + cls.work)
        else:
            shutil.rmtree(cls.work, ignore_errors=True)

    def assertNoDiff(self, duo, start_fails=0):
        print("  -> %d comparisons OK, %d differences" % (duo.ok, len(duo.fails)))
        self.assertEqual(duo.fails[start_fails:], [])

    # ------------------------------------------------------------------ 1
    def test_1_sequence(self):
        d = self.duo
        # no config yet
        d.both("ping without config", "ping", 200)
        d.both("me without config → 500 config", "me", 500, token=E)
        self.php.write_config()
        self.py.write_config()
        d.both("ping", "ping", 200)
        d.both("OPTIONS ping", "ping", 204, method="OPTIONS")
        d.both("ping HEAD", "ping", 200, method="HEAD")
        d.both("me editor + device headers", "me", 200, token=E, headers=DEV)
        d.both("me Bearer", "me", 200, headers={"Authorization": "Bearer " + V})
        d.both("me _token in text/plain body", "me", 200, method="POST", raw=json.dumps({"_token": A, "_device": {"id": "d1", "name": "N", "app": "x"}}))
        d.both("me no token", "me", 401)
        d.both("me disabled config token", "me", 401, token="disabled-token")
        d.both("unknown route (before token)", "nope", 404)
        d.both("empty route", "", 404, token=E)
        d.both("push GET → 405", "push", 405, token=E)
        d.both("me PUT → 405", "me", 405, method="PUT", token=E)
        d.both("me DELETE → 405", "me", 405, method="DELETE", token=E)
        d.both("push bad json", "push", 400, token=E, raw="not json")
        d.both("push JSON string", "push", 400, token=E, raw='"x"')
        d.both("push JSON null", "push", 400, token=E, raw="null")
        d.both("push lone surrogate", "push", 400, token=E, raw='{"a":"\\ud800"}')
        d.both("push NaN", "push", 400, token=E, raw='{"a":NaN}')
        d.both("me bad json but header token (body not read)", "me", 200, token=E, raw="not json")
        d.both("me bad json without header token", "me", 400, raw="not json")
        d.both("push JSON list body", "push", 200, token=E, raw="[1,2]")
        d.both("push too large", "push", 413, token=E, raw="{" + " " * (1048576 + 10) + "}")
        d.both("me too large but header token", "me", 200, token=E, raw="x" * (1048576 + 10))
        d.both("pull empty server", "pull", 200, token=V, query={"since": 0, "log_since": 0})
        d.both("pull array param since[]=", "pull", 200, token=V, query={"since[]": 1})
        d.both("binder array param → 500", "binder", 500, token=V, query={"qr[]": "x"})
        d.both("viewer cannot push", "push", 403, token=V, body={"records": []})

        # ---- first upload (PC): binders, client, locations, tombstone, settings, activity log
        locs = [L("l-mag", "MAG1", "", "MAG1", 0, "dm26LMag00001"), L("l-a1", "A1", "l-mag", "MAG1-A1", 1, "dm26LArm00001"),
                L("l-b10", "B10", "l-a1", "MAG1-A1-B10", 2, "dm26LBox00010"), L("l-b2", "B2", "l-a1", "MAG1-A1-B2", 2, "dm26LBox00002"),
                L("l-b01", "b01", "l-a1", "MAG1-A1-b01", 2, "dm26LBox00001")]
        bins = [B("j-x", "JRX", "2025-10-10T09:00:00.000Z", notes="riga1\nriga2   \U0001F600 / \\ \"q\"", location_id="l-b10", location_code="MAG1-A1-B10"),
                B("j-y", "JRY", "2025-10-11T09:00:00.000Z", extra={}, nums={"0": "a", "1": "b"}, f=1.0, g=2.5, big=1e20, flag=True, nil=None, _private="p"),
                B("j-z", "jrz", "2025-10-12T09:00:00.000Z", location_id="l-b10"),
                B("j-w", "JRW10", "2025-10-13T09:00:00.000Z", room_code="", cabinet_code="", location_id="l-b10"),
                B("j-v", "JRW9", "2025-10-13T09:00:00.000Z", location_id="l-b10", selected_for_print=True, short_url="https://qr7.it/x")]
        cl = {"type": "client", "id": "j-c1", "updated_at": "2025-10-09T09:00:00.000Z",
              "data": {"id": "j-c1", "name": "Ornitorinco Diff JRX S.r.l.", "multi_code": "J901", "updated_at": "2025-10-09T09:00:00.000Z"}}
        logs = [{"id": "log-1", "at": "2025-10-01T08:00:00.000Z", "who": "Dave", "action": "binder.create", "summary": "Creato è", "details": {}},
                {"id": "log-2", "who": "Dave", "action": "x"}, {"id": "bad id!", "action": "x"}, "not an object"]
        settings = {"updated_at": "2025-10-05T10:00:00.000Z", "data": {"studioName": "Studio Diff", "catColors": {}, "locLevels": ["Magazzino", "Armadio"]}}
        first = {"records": bins + [cl] + locs, "tombstones": [{"type": "binder", "id": "j-gone", "code": "JRG", "deletedAt": "2025-10-05T10:00:00.000Z", "who": "Dave"}],
                 "settings": settings, "activity_log": logs, "deviceId": "dev-diff", "operator": "Dave PC"}
        r = d.both("push first upload", "push", 200, token=E, body=first, headers=DEV)
        for k in ("php", "py"):
            d.saved[k]["jid_first"] = r[k][1]["journal_id"]
        d.both("push same again → same", "push", 200, token=E, body={"records": bins[:2], "deviceId": "dev-diff"})
        r = d.both("pull since=0", "pull", 200, token=V, query={"since": 0, "log_since": 0}, headers=DEV)
        for k in ("php", "py"):
            d.saved[k]["jid_pull"] = r[k][1]["journal_id"]
        d.both("pull since=3 log_since=1", "pull", 200, token=V, query={"since": 3, "log_since": 1})
        d.both("pull via text/plain body", "pull", 200, method="POST", raw=json.dumps({"_token": V, "since": 5}))

        # ---- LWW
        older = B("j-x", "JRX", "2025-10-01T09:00:00.000Z", notes="vecchia")
        newer = B("j-y", "JRY", "2025-10-20T09:00:00.000Z", notes="nuova")
        tie = B("j-z", "jrz", "2025-10-12T09:00:00.000Z", notes="diversa")
        same_loc = L("l-b2", "B2", "l-a1", "MAG1-A1-B2-CHANGED", 7, "dm26LBox00002")
        tie_loc = L("l-b01", "b01", "l-a1", "MAG1-A1-b01", 2, "dm26LBox00001", notes="altra")
        d.both("push older/newer/tie/same-location/tie-location", "push", 200, token=E, body={"records": [older, newer, tie, same_loc, tie_loc], "deviceId": "dev-diff", "operator": "0"})
        bad = [{"type": "nope", "id": "a", "updated_at": "2025-10-01T00:00:00.000Z", "data": {}},
               {"type": "binder", "id": "bad id", "updated_at": "2025-10-01T00:00:00.000Z", "data": {}},
               {"type": "binder", "id": "b-nodata", "updated_at": "2025-10-01T00:00:00.000Z"},
               {"type": "binder", "id": "b-nodate", "data": {"x": 1}},
               {"type": "binder", "id": "b-baddate", "updated_at": "ieri", "data": {"x": 1}},
               {"type": "binder", "id": "b-datedata", "data": {"x": 1, "updated_at": "2025-10-02T00:00:00+02:00"}},
               {"type": "binder", "id": "b-big", "updated_at": "2025-10-01T00:00:00.000Z", "data": {"notes": "x" * 270000}},
               {"type": ["arr"], "id": 5, "data": "str"}, 7, "str",
               {"type": "client", "id": "c-list", "updated_at": "2025-10-03T00:00:00Z", "data": ["a", "b"]},
               {"type": "client", "id": "c-empty", "updated_at": "2025-10-03", "data": {}}]
        d.both("push invalid records", "push", 500, token=E, body={"records": bad})   # type array → (string) warning → 500 in PHP
        d.both("push invalid records (no array type)", "push", 200, token=E, body={"records": bad[:7] + bad[8:]})
        d.both("push tombstones: older rejected, newer applied, unknown applied, invalid",
               "push", 200, token=E, body={"tombstones": [{"type": "binder", "id": "j-w", "code": "JRW10", "deletedAt": "2025-10-01T00:00:00.000Z"},
                                                         {"type": "binder", "id": "j-v", "code": "JRW9", "deletedAt": "2025-10-25T00:00:00.000Z", "who": "Anna"},
                                                         {"type": "binder", "id": "j-gone", "deletedAt": "2025-10-04T00:00:00.000Z"},
                                                         {"type": "binder", "id": "j-new-gone", "code": "NG", "deletedAt": "2025-10-25T00:00:00.000Z"},
                                                         {"type": "binder", "id": "j-z", "code": "jrz", "deletedAt": "2025-10-12T09:00:00.000Z"},
                                                         {"type": "x", "id": "y", "deletedAt": "2025-10-25T00:00:00.000Z"}],
                                          "deviceId": "dev-diff"})
        d.both("push resurrect j-v + settings older (ignored) + log", "push", 200, token=E2,
               body={"records": [B("j-v", "JRW9", "2025-10-26T00:00:00.000Z", location_id="l-b10")],
                     "settings": {"updated_at": "2025-10-01T00:00:00.000Z", "data": {"studioName": "old"}},
                     "activity_log": [{"id": "log-3", "at": "2025-10-26T00:00:00.000Z", "action": "y"}, {"id": "log-1", "action": "dup"}]}, headers=DEV)
        d.both("push settings newer", "push", 200, token=E, body={"settings": {"updated_at": "2025-10-27T00:00:00.000Z", "data": {"studioName": "nuovo", "x": []}}})
        d.both("pull since=0 after LWW", "pull", 200, token=V, query={"since": 0})
        d.both("pull since=10", "pull", 200, token=E, query={"since": 10, "log_since": 2})
        d.both("pull since=999 (nothing new)", "pull", 200, token=E, query={"since": 999, "log_since": 999})

        # ---- binder / location / resolve
        d.both("binder by qr", "binder", 200, token=V, query={"qr": "dm26DfJRXQx"})
        d.both("binder by code lower", "binder", 200, token=V, query={"code": " jrx "})
        d.both("binder by code (lower stored)", "binder", 200, token=V, query={"code": "JRZ"})
        d.both("binder unknown qr", "binder", 404, token=V, query={"qr": "dm26NOTHERE0"})
        d.both("binder bad qr", "binder", 400, token=V, query={"qr": "a b"})
        d.both("binder nothing", "binder", 400, token=V)
        d.both("binder kept (older tombstone rejected)", "binder", 200, token=V, query={"qr": "dm26DfW10Qx"})
        d.both("binder deleted", "binder", 404, token=V, query={"qr": "dm26DfW9Qx"})
        d.both("binder params in POST body", "binder", 200, method="POST", token=V, body={"qr": "dm26DfJRYQx"})
        d.both("location by qr", "location", 200, token=V, query={"qr": "dm26LBox00010"})
        d.both("location by id (root)", "location", 200, token=V, query={"id": "l-mag"})
        d.both("location by id (A1, natural sort of children)", "location", 200, token=V, query={"id": "l-a1"})
        d.both("location by code lower", "location", 200, token=V, query={"code": "mag1-a1-b10"})
        d.both("location bad id", "location", 400, token=V, query={"id": "a b"})
        d.both("location unknown", "location", 404, token=V, query={"id": "nope"})
        d.both("location nothing", "location", 400, token=V)
        d.both("resolve location", "resolve", 200, token=V, query={"qr": "dm26LBox00010"})
        d.both("resolve binder", "resolve", 200, token=V, query={"qr": "dm26DfjrzQx"})
        d.both("resolve unknown location", "resolve", 404, token=V, query={"qr": "dm26LNone0000"})
        d.both("resolve unknown binder", "resolve", 404, token=V, query={"qr": "dm26None"})
        d.both("resolve bad", "resolve", 400, token=V, query={"qr": ""})

        # ---- patch
        d.both("patch bad field", "patch", 422, token=E, body={"id": "j-x", "patch": {"company_name": "x"}, "base_updated_at": "2025-10-10T09:00:00.000Z"})
        d.both("patch list patch", "patch", 422, token=E, body={"id": "j-x", "patch": ["a"]})
        d.both("patch no patch", "patch", 400, token=E, body={"id": "j-x"})
        d.both("patch bad id", "patch", 400, token=E, body={"id": "a b", "patch": {}})
        d.both("patch unknown binder", "patch", 404, token=E, body={"id": "b-none", "patch": {"notes": "x"}})
        d.both("patch deleted binder", "patch", 404, token=E, body={"id": "j-gone", "patch": {"notes": "x"}, "force": True})
        d.both("patch location_code alone", "patch", 422, token=E, body={"id": "j-x", "patch": {"location_code": "X"}, "base_updated_at": "2025-10-10T09:00:00.000Z"})
        d.both("patch invalid location id", "patch", 422, token=E, body={"id": "j-x", "patch": {"location_id": "a b"}, "base_updated_at": "2025-10-10T09:00:00.000Z"})
        d.both("patch unknown location", "patch", 422, token=E, body={"id": "j-x", "patch": {"location_id": "nope-loc"}, "base_updated_at": "2025-10-10T09:00:00.000Z"})
        r = d.both("patch move to B2 + notes", "patch", 200, token=E, headers=DEV,
                   body={"id": "j-x", "patch": {"location_id": "l-b2", "notes": "spostato", "location_code": "ignored"}, "base_updated_at": "2025-10-10T09:00:00.000Z",
                         "operator": "Telefono", "log": {"id": "plog-1", "who": "Tel", "action": "binder.locate", "details": {"via": "phone"}}})
        for k in ("php", "py"):
            d.saved[k]["etag1"] = r[k][1].get("etag")
            d.saved[k]["jid_patch"] = r[k][1].get("journal_id")
        d.both("patch stale base → 409", "patch", 409, token=E, body={"id": "j-x", "patch": {"notes": "vecchia base"}, "base_updated_at": "2025-10-10T09:00:00.000Z"})
        r = d.both("patch via If-Match + clear location", "patch", 200, token=E,
                   headers=lambda k, s: {"If-Match": '"%s"' % s["etag1"]}, body={"id": "j-x", "patch": {"location_id": "", "location_code": "R-7"}})
        d.both("patch forced, no log, operator empty → user", "patch", 200, token=E2, body={"id": "j-y", "patch": {"archive_state": "CHECKED_OUT", "tags": "t"}, "force": 1, "operator": "  "})
        d.both("patch log list + location_id non-string", "patch", 200, token=E, body={"id": "j-z", "patch": {"location_id": 5}, "force": "yes", "log": [1, 2], "deviceId": "dev-body"})
        d.both("binder after patches", "binder", 200, token=V, query={"qr": "dm26DfJRXQx"})
        d.both("location B2 after patch", "location", 200, token=V, query={"id": "l-b2"})

        # ---- tokens
        d.both("tokens editor → 403", "tokens", 403, token=E)
        d.both("token_create bad name", "token_create", 422, token=A, body={"user": "<bad>"})
        d.both("token_create bad role", "token_create", 422, token=A, body={"user": "Anna", "role": "root"})
        d.both("token_create empty", "token_create", 422, token=A, body={"user": "   "})
        rnd = lambda j: [j["id"][3:], j["token"]]   # noqa: E731
        r = d.both("token_create Telefono Anna", "token_create", 200, reg=rnd, token=A, body={"user": " Telefono Ànna ", "role": "editor"})
        d.both("token_create viewer via query", "token_create", 200, reg=rnd, token=A, query={"user": "Lettore", "role": "viewer"}, method="POST")
        for k in ("php", "py"):
            d.saved[k]["tok_id"], d.saved[k]["tok"] = r[k][1]["id"], r[k][1]["token"]
        d.both("me with the new db token", "me", 200, token=lambda k, s: s["tok"])
        d.both("tokens admin", "tokens", 200, token=A)
        d.both("token_revoke", "token_revoke", 200, token=A, body=lambda k, s: {"id": s["tok_id"]})
        d.both("token_revoke again → 404", "token_revoke", 404, token=A, body=lambda k, s: {"id": s["tok_id"]})
        d.both("token_revoke cfg → 422", "token_revoke", 422, token=A, body={"id": "cfg:0"})
        d.both("me with revoked token → 401", "me", 401, token=lambda k, s: s["tok"])
        d.both("me good token resets the counter", "me", 200, token=E)

        # ---- journal
        d.both("journal viewer → 403", "journal", 403, token=V)
        d.both("journal editor own", "journal", 200, token=E)
        d.both("journal editor2 own", "journal", 200, token=E2)
        d.both("journal admin all", "journal", 200, token=A, query={"limit": 200})
        d.both("journal admin page 1", "journal", 200, token=A, query={"limit": 3})
        d.both("journal admin page 2", "journal", 200, token=A, query={"limit": 3, "before": 10})
        d.both("journal entry (patch)", "journal", 200, token=A, query=lambda k, s: {"entry": s["jid_patch"]})
        d.both("journal entry (first push)", "journal", 200, token=A, query=lambda k, s: {"entry": s["jid_first"]})
        d.both("journal unknown entry", "journal", 404, token=A, query={"entry": 99999})
        d.both("journal editor sees no other entry", "journal", 404, token=E2, query=lambda k, s: {"entry": s["jid_first"]})
        d.both("journal code filter", "journal", 200, token=A, query={"code": "jrx"})
        d.both("journal record filter", "journal", 200, token=A, query={"record": "j-z"})
        d.both("journal route + device filter", "journal", 200, token=A, query={"route": "push", "device": "dev-diff"})
        d.both("journal user filter", "journal", 200, token=A, query={"user": "ANNA"})
        d.both("journal from/to day", "journal", 200, token=A, query={"from": "2000-01-01", "to": time.strftime("%Y-%m-%d", time.gmtime())})
        d.both("journal to in the past", "journal", 200, token=A, query={"to": "2001-01-01"})
        d.both("journal limit 0 → 1", "journal", 200, token=A, query={"limit": 0})

        # ---- journal_restore
        TH = lambda j: [hashlib.sha256(("deleted:%s/%s@%s" % (j["type"], j["id"], j["updated_at"])).encode()).hexdigest()] if j.get("deleted") else []   # noqa: E731
        F = lambda n, **x: (lambda k, s: dict({"jid": s["jid_first"], "n": n}, **x))   # noqa: E731
        d.both("restore editor → 403", "journal_restore", 403, token=E, body=F(1))
        d.both("restore bad jid", "journal_restore", 422, token=A, body={"jid": 0, "n": 0})
        d.both("restore bad version", "journal_restore", 422, token=A, body=F(1, version="x"))
        d.both("restore unknown", "journal_restore", 404, token=A, body={"jid": 99999, "n": 1})
        d.both("restore settings item → 422", "journal_restore", 422, token=A, body=F(13))
        d.both("restore pull item → 422", "journal_restore", 422, token=A, body=lambda k, s: {"jid": s["jid_pull"], "n": 1, "version": "prev"})
        d.both("restore pull item new", "journal_restore", 422, token=A, body=lambda k, s: {"jid": s["jid_pull"], "n": 1, "version": "new"})
        d.both("restore patch prev", "journal_restore", 200, reg=TH, token=A, body=lambda k, s: {"jid": s["jid_patch"], "n": 1, "version": "prev"})
        d.both("restore new of a create", "journal_restore", 200, reg=TH, token=A, body=F(2, version="new"))
        d.both("restore prev of a create → tombstone", "journal_restore", 200, reg=TH, token=A, body=F(3, version="prev"))
        d.both("restore tombstone item new → tombstone", "journal_restore", 200, reg=TH, token=A, body=F(12, version="new"))
        d.both("restore via query params", "journal_restore", 200, reg=TH, token=A, method="POST", query={"jid": 3, "n": 4, "version": "new"})
        d.both("pull after restores", "pull", 200, token=V, query={"since": 0})
        d.both("journal admin after restores", "journal", 200, token=A, query={"limit": 5})

        # ---- CORS
        d.both("CORS null origin", "me", 200, token=E, headers={"Origin": "null"})
        d.both("CORS allowed https origin", "me", 200, token=E, headers={"Origin": "https://ok.example"})
        d.both("CORS foreign origin → 403", "me", 403, token=E, headers={"Origin": "https://evil.example"})
        d.both("CORS same origin", "me", 200, token=E, headers=lambda k, s: {"Origin": (self.php if k == "php" else self.py).origin})
        d.both("CORS same origin other scheme", "me", 200, token=E, headers=lambda k, s: {"Origin": (self.php if k == "php" else self.py).origin.replace("http:", "https:")})
        d.both("CORS null + 401 keeps headers", "me", 401, headers={"Origin": "null"})
        d.both("OPTIONS null origin", "push", 204, method="OPTIONS", headers={"Origin": "null", "Access-Control-Request-Method": "POST"})
        d.both("OPTIONS foreign origin → 403", "push", 403, method="OPTIONS", headers={"Origin": "https://evil.example"})
        d.both("OPTIONS no origin", "pull", 204, method="OPTIONS")
        d.both("OPTIONS unknown route", "nope", 204, method="OPTIONS")
        d.both("ping foreign origin (no CORS headers, 200)", "ping", 200, headers={"Origin": "https://evil.example"})
        d.both("ping null origin", "ping", 200, headers={"Origin": "null"})

        # ---- static files and deny rules (php-router.php)
        for p, exp in (("/studio-de/index.html", 200), ("/studio-de/", 200), ("/studio-de/app.js", 200), ("/studio-de/server-php/config.php", 403),
                       ("/studio-de/server-php/config.sample.php", 403), ("/studio-de/server-php/data/", 403), ("/studio-de/server-php/data/index.html", 403),
                       ("/studio-de/server-php/.htaccess", 403), ("/.htaccess", 403), ("/studio-de/nothing.html", 404), ("/studio-de/%2e%2e/x", 400),
                       ("/studio-de/server-php/x.sqlite", 403), ("/studio-de/server-php/data/docmap.sqlite", 403)):
            d.both("static " + p, None, exp, path=p)
        self.assertNoDiff(d)

    # ------------------------------------------------------------------ 1b
    def test_1b_v12(self):
        """v12 routes and record types, side by side (runs on the data written by test_1)."""
        d = Duo(self.php, self.py)
        d.n = self.duo.n
        dbs = [os.path.join(s.data, "docmap.sqlite") for s in (self.php, self.py)]

        def config(extra=""):
            self.php.write_config(extra=extra)
            self.py.write_config(extra=extra)
            time.sleep(2.2)   # opcache of php -S

        d.both("ping v12: schema 3 + features", "ping", 200)
        d.both("me remember_minutes default null", "me", 200, token=V)
        for val in ("480", "-1", "0", "'45 '", "'abc'", "1.9", "true", "'1e3'"):
            config(", 'remember_minutes' => %s" % val)
            d.both("me remember_minutes = " + val, "me", 200, token=V)
        config()

        # ---- archive + status_event records (push / pull, LWW, append-only, undo_of)
        def SE(id_, at, tt, tid, **x):
            e = {"id": id_, "at": at, "user": "Mario", "device": "dev-diff", "target_type": tt, "target_id": tid, "doc_id": "", "status_id": "taken",
                 "holder": "Mario", "due_date": "", "date": "", "note": "", "via": "scan", "box_id": "", "batch_id": "", "code": "", "doc_text": "", "undo_of": ""}
            e.update(x)
            return {"type": "status_event", "id": id_, "updated_at": at if isinstance(at, str) else "2025-10-29T00:00:00.000Z", "data": e}
        arch = {"type": "archive", "id": "ar-1", "updated_at": "2025-10-15T08:00:00.000Z",
                "data": {"id": "ar-1", "name": "Archivio storico è", "code": "ST", "color": "#AA0000", "description": "", "sort": 1,
                         "levels": [{"name": "Stanza", "prefix": "S"}, {"name": "Scatola", "prefix": "B"}], "qr_levels": [1],
                         "created_at": "2025-10-15T08:00:00.000Z", "updated_at": "2025-10-15T08:00:00.000Z"}}
        evs = [SE("se-1", "2025-10-20T10:00:00.000Z", "binder", "j-x", code="JRX"),
               SE("se-0", "2025-10-20T10:00:00.000Z", "document", "j-x", doc_id="d1", doc_text="2025: Fatture è"),
               SE("se-3", "2025-10-21T10:00:00.000Z", "location", "l-b10", via="box", code="MAG1-A1-B10"),
               SE("se-4", "2025-10-21T10:00:00.000Z", "binder", "j-z", via="box", box_id="l-b10", batch_id="bt-1"),
               SE("se-5", "2025-10-22T10:00:00.000Z", "binder", "j-y", via="box", box_id="l-b10", batch_id="bt-1", status_id="to_entity", due_date="2025-12-31"),
               SE("se-6", "2025-10-23T10:00:00.000Z", "binder", "j-y", status_id="returned"),
               SE("se-7", "2025-10-24T10:00:00.000Z", "binder", "j-x", status_id="", via="undo", undo_of="se-1"),
               SE("se-8", "2025-10-25T10:00:00.000Z", "binder", "j-x", box_id=0),
               SE("se-9", "2025-10-25T11:00:00.000Z", "location", ""),
               SE("se-10", None, "binder", "j-x")]
        d.both("push archive + status events", "push", 200, token=E, headers=DEV, body={"records": [arch] + evs, "deviceId": "dev-diff", "operator": "Mario"})
        d.both("push the same events again → same", "push", 200, token=E, body={"records": evs[:3] + [arch], "deviceId": "dev-diff"})
        tie = SE("se-1", "2025-10-20T10:00:00.000Z", "binder", "j-x", note="cambiato")
        d.both("push event, same id + time, other content (tie)", "push", 200, token=E, body={"records": [tie], "deviceId": "dev-diff"})
        d.both("push archive newer + older", "push", 200, token=E, body={"records": [
            dict(arch, updated_at="2025-10-16T08:00:00.000Z", data=dict(arch["data"], name="Archivio storico 2", updated_at="2025-10-16T08:00:00.000Z")),
            dict(arch, updated_at="2025-10-01T08:00:00.000Z")], "deviceId": "dev-diff"})
        d.both("push event target_id array → 500 (PHP warning)", "push", 500, token=E, body={"records": [SE("se-bad", "2025-10-27T10:00:00.000Z", "binder", ["x"])]})
        d.both("push tombstones: event se-9, archive ar-gone", "push", 200, token=E, body={"tombstones": [
            {"type": "status_event", "id": "se-9", "code": "", "deletedAt": "2025-10-27T00:00:00.000Z"},
            {"type": "archive", "id": "ar-gone", "code": "OLD", "deletedAt": "2025-10-27T00:00:00.000Z"}], "deviceId": "dev-diff"})
        d.both("binder: status_types null (settings without statusTypes)", "binder", 200, token=V, query={"qr": "dm26DfJRXQx"})
        d.both("push settings statusTypes {} ", "push", 200, token=E, body={"settings": {"updated_at": "2025-10-28T00:00:00.000Z", "data": {"studioName": "nuovo", "statusTypes": {}}}})
        d.both("binder: statusTypes {} → null", "binder", 200, token=V, query={"code": "jrx"})
        d.both("push settings statusTypes list", "push", 200, token=E, body={"settings": {"updated_at": "2025-10-29T00:00:00.000Z", "data": {
            "studioName": "nuovo", "statusTypes": [{"id": "taken", "label": "Preso", "presence": "out"}, {"id": "returned", "label": "Reinserito", "presence": "in"}]}}})
        d.both("pull since=0 with archive + status_event", "pull", 200, token=V, query={"since": 0, "log_since": 0})

        # ---- binder / location / resolve: status_events + status_types, via
        r = d.both("binder qr via=nfc", "binder", 200, token=V, headers=PHONE, query={"qr": "dm26DfJRXQx", "via": "nfc"})
        self.assertEqual(sorted(e["id"] for e in r["php"][1]["status_events"]), ["se-0", "se-1", "se-10", "se-7", "se-8"])
        self.assertEqual(r["php"][1]["status_types"][0]["id"], "taken")
        d.both("binder qr via=nfc again (deduped)", "binder", 200, token=V, headers=PHONE, query={"qr": "dm26DfJRXQx", "via": "nfc"})
        d.both("binder qr via=' NAV '", "binder", 200, token=V, headers=PHONE, query={"qr": "dm26DfJRXQx", "via": " NAV "})
        d.both("binder qr via=bogus → qr", "binder", 200, token=V, headers=PHONE, query={"qr": "dm26DfJRXQx", "via": "bogus"})
        d.both("binder code (default via search)", "binder", 200, token=E, headers=DEV, query={"code": "JRY"})
        d.both("binder via in POST body (array → default)", "binder", 200, method="POST", token=E2, body={"qr": "dm26DfJRYQx", "via": ["x"]})
        d.both("binder 404 (nothing logged)", "binder", 404, token=V, query={"qr": "dm26NOTHERE0", "via": "qr"})
        r = d.both("location B10: events of box, binders, left with box", "location", 200, token=V, headers=PHONE, query={"id": "l-b10", "via": "nav"})
        self.assertEqual(sorted(e["id"] for e in r["php"][1]["status_events"]), ["se-0", "se-1", "se-10", "se-3", "se-4", "se-5", "se-6", "se-7", "se-8"])
        d.both("location by qr (via default qr)", "location", 200, token=V, headers=PHONE, query={"qr": "dm26LBox00010"})
        d.both("location A1 (no events)", "location", 200, token=E, query={"code": "MAG1-A1"})
        d.both("resolve location via=search", "resolve", 200, token=V, headers=PHONE, query={"qr": "dm26LBox00010", "via": "search"})
        d.both("resolve binder", "resolve", 200, token=E2, query={"qr": "dm26DfJRYQx"})

        # ---- access
        d.both("access viewer → 403", "access", 403, token=V)
        d.both("access GET only? POST works too (read route)", "access", 200, method="POST", token=E, body={"limit": 3})
        d.both("access editor own", "access", 200, token=E)
        d.both("access editor2 own (user filter ignored)", "access", 200, token=E2, query={"user": "lucia"})
        d.both("access admin all", "access", 200, token=A, query={"limit": 200})
        r = d.both("access admin page 1", "access", 200, token=A, query={"limit": 4})
        for k in ("php", "py"):
            d.saved[k]["acc_next"] = r[k][1].get("next_before")
        d.both("access admin page 2", "access", 200, token=A, query=lambda k, s: {"limit": 4, "before": s["acc_next"]})
        for label, q, st in (("type binder", {"type": "binder"}, 200), ("type location", {"type": "location"}, 200), ("type bad → 422", {"type": "x"}, 422),
                             ("target", {"target": "j-x"}, 200), ("id alias", {"id": "l-b10"}, 200), ("target bad → 400", {"target": "a b"}, 400),
                             ("code lower", {"code": "jrx"}, 200), ("via nfc", {"via": "NFC"}, 200), ("via bogus → none", {"via": "zzz"}, 200),
                             ("route resolve", {"route": "resolve"}, 200), ("user LUCIA", {"user": "LUCIA"}, 200), ("device", {"device": "phone-diff"}, 200),
                             ("from/to day", {"from": "2000-01-01", "to": time.strftime("%Y-%m-%d", time.gmtime())}, 200), ("to past", {"to": "2001-01-01"}, 200),
                             ("limit 0 → 1", {"limit": 0}, 200), ("limit 999 → 200", {"limit": 999}, 200), ("array param → 500", {"code[]": "x"}, 500)):
            d.both("access " + label, "access", st, token=A, query=q)

        # ---- last_seen
        for label, q, st, tok in (("no target → 400", {}, 400, V), ("type only → 400", {"type": "binder"}, 400, V), ("type bad → 422", {"type": "x", "id": "j-x"}, 422, V),
                                  ("by id", {"type": "binder", "id": "j-x"}, 200, V), ("by target", {"target": "j-x"}, 200, E), ("by code", {"code": "JRX"}, 200, V),
                                  ("location", {"type": "location", "id": "l-b10"}, 200, V), ("limit 1", {"id": "j-x", "limit": 1}, 200, V),
                                  ("limit 50 → 20", {"id": "j-x", "limit": 50}, 200, A), ("bad id → 400", {"id": "a b"}, 400, V),
                                  ("unknown → empty", {"id": "nope"}, 200, V)):
            d.both("last_seen " + label, "last_seen", st, token=tok, query=q)
        d.both("last_seen no token → 401", "last_seen", 401, query={"id": "j-x"})

        # ---- seen
        now = time.time()
        iso = lambda dt: time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(now + dt)) + ".000Z"   # noqa: E731
        d.both("seen GET → 405", "seen", 405, token=V)
        d.both("seen no items → 400", "seen", 400, token=V, body={})
        d.both("seen items string → 400", "seen", 400, token=V, body={"items": "x"})
        d.both("seen 501 items → 413", "seen", 413, token=V, body={"items": [{"id": "j-x", "at": iso(-60)}] * 501})
        items = [{"type": "binder", "id": "j-x", "code": "JRX", "at": iso(-3600), "via": "nav"},
                 {"type": "location", "id": "l-b10", "code": "MAG1-A1-B10", "at": iso(-7200), "via": "QR"},
                 {"id": "j-y", "code": "JRY", "at": iso(-86400 * 3)},
                 {"type": "binder", "id": "j-z", "at": iso(240), "via": "bogus"},
                 {"type": "binder", "id": "j-z", "at": iso(900)},
                 {"type": "binder", "id": "j-z", "at": iso(-86400 * 400)},
                 {"type": "client", "id": "j-c1", "at": iso(-60)},
                 {"type": "binder", "id": "a b", "at": iso(-60)},
                 {"type": "binder", "id": 5, "at": iso(-60)},
                 {"type": "binder", "id": "j-x", "at": "ieri"},
                 {"type": "binder", "id": "j-x"},
                 "not an object", 7,
                 {"type": "binder", "id": "j-x", "code": "riga\x01 " + "è" * 120, "at": iso(-1800), "via": "search"}]
        r = d.both("seen mixed items (viewer, phone)", "seen", 200, token=V, headers=PHONE, body={"items": items})
        self.assertEqual((r["php"][1]["recorded"], r["php"][1]["skipped"]), (5, 9))
        r = d.both("seen re-sent → all skipped", "seen", 200, token=V, headers=PHONE, body={"items": items})
        self.assertEqual((r["php"][1]["recorded"], r["php"][1]["skipped"]), (0, 14))
        r = d.both("seen at +60 s → deduped, +200 s → recorded, ±120 s exactly → deduped (inclusive window)", "seen", 200, token=V, headers=PHONE, body={"items": [
            {"id": "j-x", "at": iso(-3600 + 60)}, {"id": "j-x", "at": iso(-3600 + 200)}, {"id": "j-x", "at": iso(-3600 - 120)}, {"id": "j-x", "at": iso(-1800 + 120)},
            {"id": "j-x", "at": iso(-1800 + 121)}]})
        self.assertEqual((r["php"][1]["recorded"], r["php"][1]["skipped"]), (2, 3))
        d.both("seen same item, other device → recorded", "seen", 200, token=V, headers=DEV, body={"items": [{"id": "j-x", "at": iso(-3600)}]})
        d.both("seen items as object, _device in body", "seen", 200, token=E, body={"items": {"a": {"id": "j-y", "at": iso(-120)}}, "_device": {"id": "pc-x", "name": "PC X", "app": "26.12.0"}})
        d.both("seen type array → 500 (rolled back)", "seen", 500, token=E, body={"items": [{"id": "j-y", "at": iso(-130)}, {"type": ["x"], "id": "j-y", "at": iso(-60)}]})
        d.both("seen _token in text/plain body", "seen", 200, method="POST", raw=json.dumps({"_token": V, "items": [{"id": "j-v", "at": iso(-10)}]}))
        d.both("access route=seen", "access", 200, token=A, query={"route": "seen", "limit": 100})
        d.both("last_seen j-x after seen", "last_seen", 200, token=V, query={"id": "j-x", "limit": 20})

        # ---- access_dedupe_seconds 0 + access_keep_days 0, then pruning with 365
        config(", 'access_dedupe_seconds' => 0, 'access_keep_days' => 0")
        for i in range(2):
            d.both("dedupe 0: binder read %d" % (i + 1), "binder", 200, token=V, headers=PHONE, query={"qr": "dm26DfJRXQx", "via": "nfc"})
        d.both("keep 0: seen from 2020 accepted, exact resend skipped", "seen", 200, token=V, headers=PHONE, body={"items": [
            {"id": "j-x", "at": "2020-01-01T00:00:00.000Z"}, {"id": "j-x", "at": "2020-01-01T00:00:00.000Z"}, {"id": "j-x", "at": "2020-01-01T00:00:01.000Z"}]})
        d.both("access after dedupe 0 / keep 0", "access", 200, token=A, query={"limit": 12})
        for db in dbs:
            with sqlite3.connect(db) as c:
                c.execute("DELETE FROM meta WHERE k = 'access_pruned_at'")
        config(", 'access_keep_days' => '365'")
        d.both("keep 365: read prunes the 2020 rows", "location", 200, token=V, query={"id": "l-b2"})
        for db in dbs:
            with sqlite3.connect(db) as c:
                self.assertEqual(c.execute("SELECT COUNT(*) FROM access_log WHERE at < '2021'").fetchone()[0], 0)
                self.assertIsNotNone(c.execute("SELECT v FROM meta WHERE k = 'access_pruned_at'").fetchone())
        d.both("access after pruning", "access", 200, token=A, query={"limit": 200})
        config()
        self.assertNoDiff(d)

    # ------------------------------------------------------------------ 2
    def test_2_database(self):
        dumps = {}
        for kind, srv in (("php", self.php), ("py", self.py)):
            dumps[kind] = dump_db(os.path.join(srv.data, "docmap.sqlite"), self.duo.n[kind])
        fails = []
        for table in dumps["php"]:
            a, b = dumps["php"][table], dumps["py"].get(table)
            if a != b:
                fails.append(table)
                print("  DB DIFF %s at %s" % (table, str(first_diff(a, b))[:1500]))
        print("  -> tables compared: %s; rows: %s" % (len(dumps["php"]), {t: len(v) for t, v in dumps["php"].items()}))
        self.assertEqual(fails, [])
        self.assertEqual(set(dumps["php"]), set(dumps["py"]))

    # ------------------------------------------------------------------ 3
    def test_3_switch(self):
        """PHP → Python and back on the SAME data folder."""
        work = self.work
        # Python server on the PHP data dir (its own config file, same key/tokens) vs PHP on the same dir
        py_on_php = Server("py-on-php", work)
        py_on_php.write_config(data_dir=self.php.data)
        py_on_php.start()
        php_on_py = Server("php-on-py", work)
        php_on_py.write_config(data_dir=self.py.data)
        php_on_py.start()
        try:
            d1 = Duo(self.php, py_on_php)            # both read the PHP-written file
            d1.n["py"] = d1.n["php"]
            reads = [("pull 0", "pull", {"since": 0, "log_since": 0}, V), ("pull 7", "pull", {"since": 7}, V),
                     ("journal all", "journal", {"limit": 200}, A), ("journal entry 2", "journal", {"entry": 2}, A),
                     ("tokens", "tokens", None, A), ("binder", "binder", {"qr": "dm26DfJRXQx"}, V), ("location", "location", {"id": "l-a1"}, V)]
            for label, route, q, tok in reads:
                d1.both("PHP file read by Python: " + label, route, 200, token=tok, query=q, ignore=("journal_id",))
            # Python writes into the PHP file, PHP reads it back (and vice versa)
            st, j, _, _ = py_on_php.call("push", token=E, body={"records": [B("x-1", "XPY1", "2025-11-01T00:00:00.000Z")], "deviceId": "dev-x",
                                                               "activity_log": [{"id": "x-log", "action": "z"}]}, headers=DEV)
            self.assertEqual(st, 200, j)
            st, j2, _, _ = py_on_php.call("patch", token=E, body={"id": "x-1", "patch": {"notes": "dal Python"}, "base_updated_at": "2025-11-01T00:00:00.000Z"})
            self.assertEqual(st, 200, j2)
            for label, route, q, tok in reads + [("pull since push", "pull", {"since": j["seq"] - 1}, V),
                                                 ("journal entry (python push)", "journal", {"entry": j["journal_id"]}, A),
                                                 ("journal entry (python patch)", "journal", {"entry": j2["journal_id"]}, A)]:
                d1.both("after Python write, same answers: " + label, route, 200, token=tok, query=q, ignore=("journal_id",))
            st, j3, _, _ = self.php.call("patch", token=E, body={"id": "x-1", "patch": {"notes": "dal PHP"}, "base_updated_at": j2["etag"]})
            self.assertEqual(st, 200, j3)
            d1.both("PHP patch on Python's write, both read it", "binder", 200, token=V, query={"qr": "dm26DfPY1Qx"})
            d1.both("journal after the mixed writes", "journal", 200, token=A, query={"limit": 4})
            # PHP on the Python-written file
            d2 = Duo(php_on_py, self.py)
            d2.n["py"] = d2.n["php"]
            for label, route, q, tok in reads:
                d2.both("Python file read by PHP: " + label, route, 200, token=tok, query=q, ignore=("journal_id",))
            st, j, _, _ = php_on_py.call("push", token=E, body={"records": [B("x-2", "XPH2", "2025-11-02T00:00:00.000Z")], "deviceId": "dev-y"})
            self.assertEqual(st, 200, j)
            d2.both("PHP write in the Python file, read by both", "pull", 200, token=V, query={"since": j["seq"] - 1}, ignore=("journal_id",))
            d2.both("journal entry written by PHP", "journal", 200, token=A, query={"entry": j["journal_id"]})
            total = Duo(self.php, self.py)
            total.ok = d1.ok + d2.ok
            total.fails = d1.fails + d2.fails
            self.assertNoDiff(total)
        finally:
            py_on_php.stop()
            php_on_py.stop()

    # ------------------------------------------------------------------ 4
    def test_4_lock(self):
        d = Duo(self.php, self.py)
        d.n = self.duo.n
        self.php.write_config(max_fails=3, lock_seconds=2)
        self.py.write_config(max_fails=3, lock_seconds=2)
        time.sleep(2.2)   # opcache of php -S revalidates config.php every 2 s
        d.both("wrong token 1", "me", 401, token="wrong-1")
        d.both("wrong token 2 (Bearer)", "me", 401, headers={"Authorization": "Bearer wrong-2"})
        d.both("wrong token 3 → lock starts", "me", 401, raw=json.dumps({"_token": "wrong-3"}))
        d.both("locked even with a good token", "me", 429, token=E)
        d.both("ping still answers while locked", "ping", 200)
        time.sleep(2.3)
        d.both("lock expired, wrong again → longer lock", "me", 401, token="wrong-4")
        d.both("locked again (4 s)", "pull", 429, token=V)
        time.sleep(4.3)
        d.both("good token after the lock", "me", 200, token=E)
        d.both("counter reset: wrong token left=2", "me", 401, token="wrong-5")
        self.php.write_config()
        self.py.write_config()
        time.sleep(2.2)
        self.assertNoDiff(d)

    # ------------------------------------------------------------------ 5
    def test_5_upgrade(self):
        """v10.1 database (schema 1, written by the v10.1 api.php) opened by Python v12 = opened by PHP v12."""
        try:
            old = subprocess.check_output(["git", "show", "68ae170:docmapv1/server-php/api.php"], cwd=REPO)
        except Exception:   # noqa: BLE001
            self.skipTest("git commit 68ae170 (v10.1 api.php) not available")
        work = self.work
        v10 = Server("php-v10", work)
        with open(os.path.join(v10.sp, "api.php"), "wb") as f:
            f.write(old)
        v10.write_config()
        v10.start()
        try:
            st, j, _, _ = v10.call("push", token=E, body={"records": [B("u-1", "UP1", "2025-10-01T00:00:00.000Z"), B("u-2", "UP2", "2025-10-02T00:00:00.000Z")],
                                                          "tombstones": [{"type": "binder", "id": "u-0", "code": "UP0", "deletedAt": "2025-10-01T00:00:00.000Z"}],
                                                          "settings": {"updated_at": "2025-10-01T00:00:00.000Z", "data": {"studioName": "v10"}},
                                                          "activity_log": [{"id": "u-log", "action": "a"}], "deviceId": "dev-v10"})
            self.assertEqual(st, 200, j)
            st, j, _, _ = v10.call("token_create", token=A, body={"user": "Vecchio", "role": "viewer"})
            self.assertEqual(st, 200, j)
        finally:
            v10.stop()
        db = os.path.join(v10.data, "docmap.sqlite")
        with sqlite3.connect(db) as c:
            self.assertEqual(c.execute("SELECT v FROM meta WHERE k='schema'").fetchone()[0], "1")
        copy_php, copy_py = os.path.join(work, "up-php"), os.path.join(work, "up-py")
        for dst in (copy_php, copy_py):
            os.makedirs(dst)
            for f in os.listdir(v10.data):
                shutil.copy(os.path.join(v10.data, f), dst)
        php11 = Server("php-v11-up", work)
        php11.write_config(data_dir=copy_php)
        php11.start()
        py11 = Server("py-v11-up", work)
        py11.write_config(data_dir=copy_py)
        py11.start()
        try:
            d = Duo(php11, py11)
            d.both("first request after the upgrade: pull since=0", "pull", 200, token=V, query={"since": 0, "log_since": 0})
            d.both("ping schema 3", "ping", 200)
            d.both("tokens of the v10.1 database", "tokens", 200, token=A)
            d.both("push on the upgraded db", "push", 200, token=E, body={"records": [B("u-1", "UP1", "2025-10-05T00:00:00.000Z")], "deviceId": "dev-v11"})
            d.both("journal on the upgraded db", "journal", 200, token=A)
            d.both("binder read on the upgraded db (access row)", "binder", 200, token=V, query={"qr": "dm26DfUP1Qx", "via": "nav"})
            d.both("access on the upgraded db", "access", 200, token=A)
            for kind, path in (("php", copy_php), ("py", copy_py)):
                with sqlite3.connect(os.path.join(path, "docmap.sqlite")) as c:
                    meta = dict(c.execute("SELECT k, v FROM meta").fetchall())
                    tabs = sorted(r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%'"))
                d.saved[kind]["meta"] = (meta.get("schema"), sorted(meta), tabs)
            self.assertEqual(d.saved["php"]["meta"], d.saved["py"]["meta"])
            self.assertEqual(d.saved["py"]["meta"][0], "3")
            self.assertIn("access_log", d.saved["py"]["meta"][2])
            self.assertNoDiff(d)
        finally:
            php11.stop()
            py11.stop()

    # ------------------------------------------------------------------ 6
    def test_6_upgrade_v11(self):
        """v11.1 database (schema 2, written by the v11.1 api.php of git 32c3485) → schema 3: Python v12 = PHP v12;
        one folder upgraded by Python then served by PHP v12 (and the reverse); v11.1 PHP keeps serving a schema-3 file."""
        try:
            old = subprocess.check_output(["git", "show", "32c3485:docmapv1/server-php/api.php"], cwd=REPO)
        except Exception:   # noqa: BLE001
            self.skipTest("git commit 32c3485 (v11.1 api.php) not available")
        work = self.work
        v11 = Server("php-v11-1", work)
        with open(os.path.join(v11.sp, "api.php"), "wb") as f:
            f.write(old)
        v11.write_config()
        v11.start()
        try:
            st, j, _, _ = v11.call("push", token=E, headers=DEV, body={
                "records": [B("w-1", "WV1", "2025-10-01T00:00:00.000Z", location_id="wl-box", location_code="W1-B1"), B("w-2", "WV2", "2025-10-02T00:00:00.000Z"),
                            L("wl-root", "W1", "", "W1", 0, "dm26LWwww0001"), L("wl-box", "B1", "wl-root", "W1-B1", 1, "dm26LWwww0002"),
                            {"type": "client", "id": "w-c", "updated_at": "2025-10-01T00:00:00.000Z", "data": {"id": "w-c", "name": "Cliente W"}},
                            # a v12 record type sent to a v11.1 server: rejected invalid (the server keeps the log entry)
                            {"type": "status_event", "id": "se-w0", "updated_at": "2025-10-03T00:00:00.000Z", "data": {"id": "se-w0", "target_type": "binder", "target_id": "w-1"}}],
                "tombstones": [{"type": "binder", "id": "w-0", "code": "WV0", "deletedAt": "2025-10-01T00:00:00.000Z"}],
                "settings": {"updated_at": "2025-10-01T00:00:00.000Z", "data": {"studioName": "v11.1", "statusTypes": [{"id": "taken"}]}},
                "activity_log": [{"id": "w-log", "action": "status.set", "details": {"events": [{"id": "se-w0"}]}}], "deviceId": "dev-v11", "operator": "Mario"})
            self.assertEqual(st, 200, j)
            self.assertEqual([x["reason"] for x in j["rejected"]], ["invalid"])
            for route, kw in (("patch", {"body": {"id": "w-2", "patch": {"notes": "v11.1"}, "base_updated_at": "2025-10-02T00:00:00.000Z"}}),
                              ("token_create", {"body": {"user": "Vecchio", "role": "viewer"}, "token": A}),
                              ("pull", {"query": {"since": 0}, "method": "GET"}), ("binder", {"query": {"qr": "dm26DfWV1Qx"}, "method": "GET"})):
                st, j, _, _ = v11.call(route, **dict({"token": E}, **kw))
                self.assertEqual(st, 200, (route, j))
            st, j, _, _ = v11.call("access", token=A)
            self.assertEqual(st, 404, j)   # no access log before v12
        finally:
            v11.stop()
        src = v11.data
        with sqlite3.connect(os.path.join(src, "docmap.sqlite")) as c:
            self.assertEqual(c.execute("SELECT v FROM meta WHERE k='schema'").fetchone()[0], "2")
        dirs = {}
        for name in ("up11-php", "up11-py", "same-py-first", "same-php-first"):
            dirs[name] = os.path.join(work, name)
            os.makedirs(dirs[name])
            for f in os.listdir(src):
                shutil.copy(os.path.join(src, f), dirs[name])
        servers = []

        def srv(kind, name, data_dir):
            s = Server(kind + "-" + name, work)
            s.write_config(data_dir=data_dir)
            s.start()
            servers.append(s)
            return s

        try:
            # (a) two copies: PHP v12 upgrades one, Python v12 the other; same answers, same files
            php12, py12 = srv("php", "up11", dirs["up11-php"]), srv("py", "up11", dirs["up11-py"])
            d = Duo(php12, py12)
            d.both("v11.1 db, first request: binder read (upgrade + access row)", "binder", 200, token=V, headers=PHONE, query={"qr": "dm26DfWV1Qx", "via": "nfc"})
            d.both("ping schema 3", "ping", 200)
            d.both("location of the v11.1 db", "location", 200, token=V, headers=PHONE, query={"qr": "dm26LWwww0002"})
            d.both("pull since=0 of the v11.1 db", "pull", 200, token=V, query={"since": 0, "log_since": 0})
            d.both("journal written by v11.1", "journal", 200, token=A, query={"limit": 200})
            d.both("tokens of the v11.1 db", "tokens", 200, token=A)
            d.both("push a status_event (now accepted)", "push", 200, token=E, body={"records": [
                {"type": "status_event", "id": "se-w1", "updated_at": "2025-10-04T00:00:00.000Z",
                 "data": {"id": "se-w1", "at": "2025-10-04T00:00:00.000Z", "target_type": "binder", "target_id": "w-1", "box_id": "wl-box", "status_id": "taken"}}], "deviceId": "dev-v12"})
            d.both("binder with status events + types", "binder", 200, token=E, query={"code": "WV1"})
            d.both("seen on the upgraded db", "seen", 200, token=V, body={"items": [{"id": "w-2", "at": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(time.time() - 600))}]})
            d.both("access on the upgraded db", "access", 200, token=A)
            d.both("last_seen on the upgraded db", "last_seen", 200, token=V, query={"code": "wv1"})
            for kind, path in (("php", dirs["up11-php"]), ("py", dirs["up11-py"])):
                with sqlite3.connect(os.path.join(path, "docmap.sqlite")) as c:
                    meta = dict(c.execute("SELECT k, v FROM meta").fetchall())
                    tabs = sorted(r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%'"))
                d.saved[kind]["meta"] = (meta.get("schema"), sorted(meta), tabs)
            self.assertEqual(d.saved["php"]["meta"], d.saved["py"]["meta"])
            self.assertEqual(d.saved["py"]["meta"][0], "3")
            self.assertIn("migrated_3_at", d.saved["py"]["meta"][1])
            dp = dump_db(os.path.join(dirs["up11-php"], "docmap.sqlite"), d.n["php"])
            dy = dump_db(os.path.join(dirs["up11-py"], "docmap.sqlite"), d.n["py"])
            for t in dp:
                if dp[t] != dy.get(t):
                    d.fails.append("db table %s differs: %s" % (t, str(first_diff(dp[t], dy.get(t)))[:600]))
            # (b) ONE folder: Python v12 upgrades it, then PHP v12 serves the same file (and the reverse)
            for first, name in (("py", "same-py-first"), ("php", "same-php-first")):
                a1 = srv(first, name, dirs[name])
                st, j, _, _ = a1.call("binder", token=V, headers=PHONE, query={"qr": "dm26DfWV1Qx", "via": "qr"})
                self.assertEqual(st, 200, j)
                st, j, _, _ = a1.call("seen", token=E, headers=DEV, body={"items": [{"id": "w-2", "code": "WV2", "at": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(time.time() - 300))}]})
                self.assertEqual((st, j.get("recorded")), (200, 1), j)
                a2 = srv("php" if first == "py" else "py", name + "-2", dirs[name])
                dd = Duo(a2, a1) if first == "py" else Duo(a1, a2)
                dd.n["py"] = dd.n["php"]
                for label, route, q, tok in (("access", "access", {"limit": 50}, A), ("last_seen", "last_seen", {"id": "w-1"}, V), ("tokens", "tokens", None, A),
                                             ("journal", "journal", {"limit": 50}, A), ("location", "location", {"id": "wl-box"}, V),
                                             ("binder (deduped read)", "binder", {"qr": "dm26DfWV1Qx", "via": "qr"}, V)):
                    dd.both("same folder upgraded by %s: %s" % (first, label), route, 200, token=tok, query=q, headers=PHONE)
                dd.both("same folder: seen re-sent from the other server → skipped", "seen", 200, token=E, headers=DEV,
                        body={"items": [{"id": "w-2", "at": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(time.time() - 300))}]}, ignore=("server_time",))
                d.ok += dd.ok
                d.fails += dd.fails
            # (c) the v11.1 PHP still serves a folder upgraded to schema 3 by Python (no downgrade needed)
            v11b = Server("php-v11-1-again", work)
            with open(os.path.join(v11b.sp, "api.php"), "wb") as f:
                f.write(old)
            v11b.write_config(data_dir=dirs["up11-py"])
            v11b.start()
            servers.append(v11b)
            for route, q in (("pull", {"since": 0}), ("binder", {"qr": "dm26DfWV1Qx"}), ("journal", {"limit": 5})):
                st, j, _, _ = v11b.call(route, token=A, query=q)
                self.assertEqual(st, 200, (route, j))
            with sqlite3.connect(os.path.join(dirs["up11-py"], "docmap.sqlite")) as c:
                self.assertEqual(c.execute("SELECT v FROM meta WHERE k='schema'").fetchone()[0], "3")
            self.assertNoDiff(d)
        finally:
            for s in servers:
                s.stop()


def dump_db(path, norm):
    """Every table of a docmap.sqlite with encrypted columns decrypted (normalised): what a reader of the file sees."""
    c = sqlite3.connect(path)
    c.row_factory = sqlite3.Row
    out = {}
    for (t,) in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").fetchall():
        rows = []
        for r in c.execute("SELECT * FROM %s ORDER BY rowid" % t).fetchall():
            d = dict(r)
            if t == "records" and d["payload"] is not None:
                d["payload"] = json.loads(blob_dec(KEY, d["payload"], "records/%s/%s" % (d["type"], d["id"])))
            elif t == "settings_shared":
                d["json"] = json.loads(blob_dec(KEY, d["json"], "settings/subset"))
            elif t == "activity_log":
                d["payload"] = json.loads(blob_dec(KEY, d["payload"], "activity/" + d["id"]))
            elif t == "sync_journal" and d["meta"] is not None:
                d["meta"] = json.loads(blob_dec(KEY, d["meta"], "journal/%d" % d["jid"]))
            elif t == "sync_journal_items":
                d["payload"] = json.loads(blob_dec(KEY, d["payload"], "journal/%d/%d" % (d["jid"], d["n"])))
            elif t == "access_log" and d["meta"] is not None:
                d["meta"] = json.loads(blob_dec(KEY, d["meta"], "access/%d" % d["aid"]))
            elif t == "meta" and d["k"] == "key_check":
                d["v"] = blob_dec(KEY, base64.b64decode(d["v"]), "meta/key_check")
            elif t == "auth_fail":
                d["until"] = d["at"] = "<time>"
            elif t == "tokens":
                d["token_sha256"] = "<sha>"
                norm.reg(d["id"])
            for k, v in list(d.items()):
                if isinstance(v, bytes):
                    d[k] = "<blob %d>" % len(v)
            rows.append(norm(d))
        out[t] = rows
    c.close()
    return out


if __name__ == "__main__":
    unittest.main(verbosity=2)
