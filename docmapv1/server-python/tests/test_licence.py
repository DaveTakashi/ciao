#!/usr/bin/env python3
"""Licence integration tests (roadmap F3) for the Python server.

  python3 docmapv1/server-python/tests/test_licence.py        (stdlib unittest + the server's requirements)

Keys and licences are made with the REAL hub (docmapv1/hub: Hub, KeyStore, registry, export-public-key CLI) in a temp
folder; the public key goes to the server through the test-only config key `licence_public_keys`. A server with
"licence_required": true is started and its HTTP answers are checked while the installed licence file is swapped:
missing, full (with limits), expired in grace, expired beyond grace, tampered, wrong instance. A second server with
enforcement off (the default) must behave like the PHP one: writes accepted, no `licence` object in me / ping.
"""
import base64
import hashlib
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
PYROOT = os.path.dirname(HERE)
DOCMAP = os.path.dirname(PYROOT)
HUB = os.path.join(DOCMAP, "hub")
API = "/api"
sys.path.insert(0, PYROOT)
sys.path.insert(0, HUB)
sys.dont_write_bytecode = True     # never write __pycache__ into docmapv1/hub (another team's folder)

from docmap_hub.service import Hub  # noqa: E402

TOK = {"dave": "lic-admin-" + os.urandom(8).hex(), "mario": "lic-ed-" + os.urandom(8).hex()}
PASS = "test passphrase"
NOW = datetime.now(timezone.utc)
INSTANCE = "11111111-2222-4333-8444-555555555555"


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


class Srv:
    def __init__(self, work, name, required, pubkeys):
        self.dir = os.path.join(work, name)
        self.data = os.path.join(self.dir, "data")
        os.makedirs(self.data)
        self.config = os.path.join(self.dir, "config.json")
        cfg = {"data_dir": self.data, "aes_key": base64.b64encode(os.urandom(32)).decode(),
               "tokens": [{"user": "dave", "role": "admin", "token_sha256": hashlib.sha256(TOK["dave"].encode()).hexdigest()},
                          {"user": "mario", "role": "editor", "token_sha256": hashlib.sha256(TOK["mario"].encode()).hexdigest()},
                          {"user": "old", "role": "editor", "token": "x", "disabled": True}],
               "allowed_origins": ["null"], "max_fails": 100, "studio_name": "Studio Licenza"}
        if required:
            cfg["licence_required"] = True
            cfg["licence_public_keys"] = pubkeys          # TESTS ONLY
        with open(self.config, "w", encoding="utf-8") as f:
            json.dump(cfg, f)
        self.port = free_port()
        self.log = open(os.path.join(self.dir, "server.log"), "ab")
        self.proc = subprocess.Popen([sys.executable, "-m", "docmap_server", "serve", "--config", self.config, "--port", str(self.port),
                                      "--log-level", "warning"], cwd=PYROOT, stdout=self.log, stderr=self.log)
        for _ in range(100):
            try:
                urllib.request.urlopen(self.url("ping"), timeout=2).read()
                return
            except Exception:   # noqa: BLE001
                time.sleep(0.1)
        raise RuntimeError("server did not start")

    def url(self, route, **q):
        return "http://127.0.0.1:%d%s?r=%s%s" % (self.port, API, route, "".join("&%s=%s" % kv for kv in q.items()))

    def call(self, route, body=None, tok="dave", **q):
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(self.url(route, **q), data=data, method="POST" if body is not None else "GET")
        if tok:
            req.add_header("X-DocMap-Token", TOK[tok])
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def stop(self):
        self.proc.terminate()
        self.proc.wait(10)
        self.log.close()

    def install(self, text):
        """Put a licence file in place by hand (as a copy would), with a new mtime so the cache sees it at once."""
        d = os.path.join(self.data, "licence")
        os.makedirs(d, exist_ok=True)
        p = os.path.join(d, "licence.docmap-licence")
        with open(p, "w", encoding="utf-8") as f:
            f.write(text)
        t = time.time() + Srv._bump
        Srv._bump += 5
        os.utime(p, (t, t))

    _bump = 10


_n = [0]


def binder(id_=None):
    _n[0] += 1
    id_ = id_ or "b-lic-%d-%s" % (_n[0], os.urandom(3).hex())
    u = iso(datetime.now(timezone.utc) + timedelta(seconds=_n[0]))
    return {"type": "binder", "id": id_, "updated_at": u, "data": {"id": id_, "code": "F%d" % _n[0], "title": "Faldone", "updated_at": u}}


class LicenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.work = tempfile.mkdtemp(prefix="docmap-lic-")
        hubdir = os.path.join(cls.work, "hub")
        # keys with the hub CLI (as Dave does), licences with the hub library
        env = dict(os.environ, DOCMAP_HUB_PASSPHRASE=PASS, PYTHONDONTWRITEBYTECODE="1")
        for args in (["init"], ["keygen"], ["export-public-key", "--out", os.path.join(cls.work, "pub.json")]):
            r = subprocess.run([sys.executable, "-m", "docmap_hub", "--dir", hubdir] + args, cwd=HUB, env=env, capture_output=True, text=True)
            assert r.returncode == 0, r.stdout + r.stderr
        with open(os.path.join(cls.work, "pub.json"), encoding="utf-8") as f:
            cls.pubkeys = json.load(f)["keys"]
        cls.hub = Hub(hubdir)
        cls.key_id, cls.priv = cls.hub.keys.load_private(PASS)
        cust = cls.hub.registry.add_customer("Studio Licenza Srl", "IT01234567890")
        cls.hub.registry.add_instance(cust["id"], "PC studio", "onprem", INSTANCE)
        cls.hub.registry.add_instance(cust["id"], "Altro PC", "onprem", "99999999-0000-4000-8000-000000000000")

        def issue(instance=INSTANCE, expires=NOW + timedelta(days=365), valid_from=NOW - timedelta(days=1), grace=30, limits=None):
            res = cls.hub.issue_with_key(cls.key_id, cls.priv, instance, "studio", expires_at=expires, valid_from=valid_from,
                                         grace_days=grace, limits=limits or {"users": 3, "binders": 3, "archives": 1}, now=valid_from)
            return res["text"]

        cls.lic_full = issue()
        cls.lic_grace = issue(expires=NOW - timedelta(days=5), valid_from=NOW - timedelta(days=370))
        cls.lic_expired = issue(expires=NOW - timedelta(days=40), valid_from=NOW - timedelta(days=400))
        cls.lic_other = issue(instance="99999999-0000-4000-8000-000000000000")
        t = json.loads(cls.lic_full)
        t["licence"]["limits"]["binders"] = 100000            # tampered: signature no longer matches
        cls.lic_tampered = json.dumps(t, indent=2)
        cls.on = Srv(cls.work, "on", True, cls.pubkeys)
        cls.off = Srv(cls.work, "off", False, cls.pubkeys)

    @classmethod
    def tearDownClass(cls):
        cls.on.stop()
        cls.off.stop()
        cls.hub.close()
        trash = os.path.join(PYROOT, "_trash")
        os.makedirs(trash, exist_ok=True)
        shutil.move(cls.work, os.path.join(trash, "test-licence-" + os.path.basename(cls.work)))

    def cli(self, *args, config=None):
        return subprocess.run([sys.executable, "-m", "docmap_server", "licence"] + list(args) + ["--config", config or self.on.config],
                              cwd=PYROOT, capture_output=True, text=True)

    def assert_writes_blocked(self, srv, mode, reason):
        s, b = srv.call("push", {"records": [binder()]}, tok="mario")
        self.assertEqual((s, b["error"]["code"]), (403, "licence_read_only"), b)
        self.assertEqual(b["error"]["mode"], mode)
        self.assertIn(reason, b["error"]["reasons"])
        self.assertTrue(b["error"]["message_it"])
        for route, body in (("patch", {"type": "binder", "id": "x"}), ("token_create", {"user": "zz", "role": "viewer"}),
                            ("token_revoke", {"id": "db:00"}), ("journal_restore", {"jid": 1})):
            s, b = srv.call(route, body)
            self.assertEqual((s, b["error"]["code"]), (403, "licence_read_only"), (route, b))
        # v12 record types go through push: blocked like every other record
        for rec in ({"type": "status_event", "id": "se-ro", "updated_at": iso(NOW), "data": {"id": "se-ro", "at": iso(NOW), "target_type": "binder", "target_id": "b-x"}},
                    {"type": "archive", "id": "ar-ro", "updated_at": iso(NOW), "data": {"id": "ar-ro", "name": "Storico"}}):
            s, b = srv.call("push", {"records": [rec]}, tok="mario")
            self.assertEqual((s, b["error"]["code"]), (403, "licence_read_only"), (rec["type"], b))
        # reads, pull and exports keep working (v12: access, last_seen too)
        for route in ("me", "pull", "tokens", "journal", "access"):
            s, b = srv.call(route)
            self.assertEqual(s, 200, (route, b))
        s, b = srv.call("last_seen", tok="mario", id="b-x")
        self.assertEqual(s, 200, b)
        # v12 `seen` is an audit record of a read (POST, but not a data write): it keeps working in read_only
        at = iso(datetime.now(timezone.utc) - timedelta(minutes=5))
        sid = "b-seen-" + os.urandom(4).hex()
        s, b = srv.call("seen", {"items": [{"type": "binder", "id": sid, "at": at}]}, tok="mario")
        self.assertEqual((s, b.get("recorded")), (200, 1), b)
        s, b = srv.call("access", limit=200)
        self.assertEqual(s, 200, b)
        self.assertIn((sid, "seen"), [(it["target"]["id"], it["route"]) for it in b["items"]])
        s, b = srv.call("me")
        self.assertEqual((b["licence"]["mode"], b["licence"]["writable"]), (mode, False))
        s, b = srv.call("ping", tok=None)
        self.assertEqual((s, b["licence"]["mode"]), (200, mode))

    def test_0_vendored_verifier_is_identical(self):
        hub_file = os.path.join(HUB, "docmap_hub", "licence.py")
        if not os.path.isfile(hub_file):
            self.skipTest("docmapv1/hub not present")
        with open(hub_file, "rb") as a, open(os.path.join(PYROOT, "docmap_server", "licence_verify.py"), "rb") as b:
            self.assertEqual(a.read(), b.read(), "re-copy hub/docmap_hub/licence.py to server-python/docmap_server/licence_verify.py")

    def test_1_off_by_default(self):
        srv = self.off
        srv.install(self.lic_tampered)          # even a bad licence changes nothing when enforcement is off
        s, b = srv.call("push", {"records": [binder() for _ in range(5)]}, tok="mario")
        self.assertEqual((s, b["applied"]), (200, 5), b)
        s, b = srv.call("token_create", {"user": "nuovo", "role": "viewer"})
        self.assertEqual(s, 200, b)
        s, b = srv.call("me")
        self.assertEqual(s, 200)
        self.assertNotIn("licence", b)
        self.assertEqual(sorted(b), ["remember_minutes", "role", "server_time", "studio_name", "token_id", "user"])
        s, b = srv.call("ping", tok=None)
        self.assertNotIn("licence", b)
        r = self.cli("status", config=srv.config)
        self.assertIn("DISATTIVATO", r.stdout)

    def test_2_missing(self):
        self.assert_writes_blocked(self.on, "invalid", "missing")
        s, b = self.on.call("me")
        self.assertIsNone(b["licence"]["licence"])
        self.assertFalse(os.path.exists(os.path.join(self.on.data, "instance.json")))

    def test_3_cli_install_and_full(self):
        r = self.cli("install", os.path.join(self.work, "nope.docmap-licence"))
        self.assertEqual(r.returncode, 2)
        p = os.path.join(self.work, "tampered.docmap-licence")
        with open(p, "w", encoding="utf-8") as f:
            f.write(self.lic_tampered)
        r = self.cli("install", p)
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("RIFIUTATA", r.stdout)
        self.assertFalse(os.path.exists(os.path.join(self.on.data, "licence", "licence.docmap-licence")))
        p = os.path.join(self.work, "full.docmap-licence")
        with open(p, "w", encoding="utf-8") as f:
            f.write(self.lic_full)
        r = self.cli("install", p)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("VALIDA (full)", r.stdout)
        with open(os.path.join(self.on.data, "instance.json"), encoding="utf-8") as f:
            self.assertEqual(json.load(f)["instance_id"], INSTANCE)      # adopted from the first valid licence
        r = self.cli("install", p)                                       # again: the previous one is kept as .prev
        self.assertEqual(r.returncode, 0)
        self.assertTrue(os.path.isfile(os.path.join(self.on.data, "licence", "licence.prev.docmap-licence")))
        r = self.cli("status")
        self.assertIn("Studio Licenza Srl", r.stdout)
        self.assertIn("binders 3", r.stdout)
        s, b = self.on.call("me")
        lic = b["licence"]
        self.assertEqual((lic["mode"], lic["writable"], lic["licence"]["plan"], lic["licence"]["customer"]["name"]),
                         ("full", True, "studio", "Studio Licenza Srl"))
        self.assertEqual(lic["limits"], {"users": 3, "binders": 3, "archives": 1})
        s, b = self.on.call("ping", tok=None)
        self.assertEqual(b["licence"]["mode"], "full")
        self.assertNotIn("licence", b["licence"])                      # no customer data in the public ping

    def test_4_limits(self):
        srv = self.on
        srv.install(self.lic_full)
        b1, b2 = binder(), binder()
        s, b = srv.call("push", {"records": [b1, b2]}, tok="mario")
        self.assertEqual((s, b["applied"]), (200, 2), b)
        s, b = srv.call("push", {"records": [binder(), binder()]}, tok="mario")    # 2 + 2 > 3
        self.assertEqual((s, b["error"]["code"], b["error"]["limit"], b["error"]["max"]), (403, "licence_limit", "binders", 3), b)
        s, b = srv.call("pull")
        self.assertEqual(len([r for r in b["records"] if r["type"] == "binder"]), 2)  # nothing of the refused push was saved
        upd = binder(b1["id"])                                                      # updating an existing binder is fine
        s, b = srv.call("push", {"records": [upd, binder()]}, tok="mario")          # 2 + 1 = 3
        self.assertEqual((s, b["applied"]), (200, 2), b)
        s, b = srv.call("push", {"records": [binder()]}, tok="mario")
        self.assertEqual((s, b["error"]["code"]), (403, "licence_limit"))
        s, b = srv.call("push", {"tombstones": [{"type": "binder", "id": b2["id"], "deletedAt": iso(datetime.now(timezone.utc) + timedelta(hours=1))}]}, tok="mario")
        self.assertEqual((s, b["applied"]), (200, 1), b)                            # deleting is always allowed
        s, b = srv.call("push", {"records": [binder()]}, tok="mario")               # back to 2 live → one more fits
        self.assertEqual(s, 200, b)
        s, b = srv.call("push", {"records": [{"type": "client", "id": "c-1", "updated_at": iso(NOW), "data": {"name": "x"}}]}, tok="mario")
        self.assertEqual(s, 200, b)                                                 # clients are not limited
        # users: dave + mario (the disabled config token does not count) → limit 3
        s, b = srv.call("token_create", {"user": "anna", "role": "editor"})
        self.assertEqual(s, 200, b)
        s, b = srv.call("token_create", {"user": "bruno", "role": "viewer"})
        self.assertEqual((s, b["error"]["code"], b["error"]["limit"]), (403, "licence_limit", "users"), b)
        s, b = srv.call("token_create", {"user": "mario", "role": "editor"})    # a 2nd token for an existing user is fine
        self.assertEqual(s, 200, b)

    def test_5_grace(self):
        self.on.install(self.lic_grace)
        s, b = self.on.call("me")
        lic = b["licence"]
        self.assertEqual((lic["mode"], lic["writable"], lic["grace_days_left"]), ("grace", True, 25), lic)
        self.assertIn("tolleranza", lic["message_it"])
        s, b = self.on.call("push", {"records": [{"type": "client", "id": "c-grace", "updated_at": iso(datetime.now(timezone.utc)), "data": {"name": "g"}}]}, tok="mario")
        self.assertEqual((s, b["applied"]), (200, 1), b)

    def test_6_expired_beyond_grace(self):
        self.on.install(self.lic_expired)
        self.assert_writes_blocked(self.on, "read_only", "expired_beyond_grace")

    def test_7_tampered(self):
        self.on.install(self.lic_tampered)
        self.assert_writes_blocked(self.on, "invalid", "bad_signature")

    def test_8_wrong_instance(self):
        self.on.install(self.lic_other)
        self.assert_writes_blocked(self.on, "invalid", "instance_mismatch")
        self.on.install(self.lic_full)                                           # and back: writable again at once
        s, b = self.on.call("push", {"records": [{"type": "client", "id": "c-back", "updated_at": iso(datetime.now(timezone.utc)), "data": {"name": "b"}}]}, tok="mario")
        self.assertEqual(s, 200, b)


if __name__ == "__main__":
    unittest.main(verbosity=2)
