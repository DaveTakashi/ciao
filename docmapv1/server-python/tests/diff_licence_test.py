#!/usr/bin/env python3
"""Licence enforcement, side by side: server-php/api.php (v12.6) and the Python server must answer the SAME with
'licence_required' => true, while the installed licence file is swapped.

  python3 docmapv1/server-python/tests/diff_licence_test.py     (needs php 8 with pdo_sqlite + sodium, cryptography)

Licences are signed with a throw-away Ed25519 key by the hub's own signer (licence_verify.sign_licence); the public
key reaches both servers through the TEST-ONLY config key 'licence_public_keys'. Scenarios: missing, full with limits
(binders, users), expiring soon, grace, beyond grace, not yet valid, suspended, revoked, tampered, unknown key, wrong
installation, bad fields. For each: ping, me, pull, a push, token_create, seen. Then: a PHP-only check that a licence
shipped with the site (server-php/licence.docmap-licence) is installed into the data folder only when newer.
"""
import base64
import copy
import json
import os
import shutil
import sys
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
sys.dont_write_bytecode = True

import diff_test as D  # noqa: E402
from docmap_server import licence_verify as LV  # noqa: E402
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey  # noqa: E402
from cryptography.hazmat.primitives import serialization  # noqa: E402

KEY_ID = "dmktest-0001"
PRIV = Ed25519PrivateKey.generate()
PUB = base64.b64encode(PRIV.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)).decode()
OTHER = Ed25519PrivateKey.generate()
IID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
NOW = datetime.now(timezone.utc)


def z(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def lic(n=0, **over):
    base = {"licence_id": "lic-%04d" % n, "format": 1, "customer": {"name": "Studio Licenza è"}, "instance_id": IID,
            "plan": "studio", "issued_at": z(NOW - timedelta(days=60) + timedelta(minutes=n)), "valid_from": z(NOW - timedelta(days=60)),
            "expires_at": z(NOW + timedelta(days=300)), "grace_days": 30, "limits": {"binders": 3, "users": 6, "archives": None},
            "features": ["sync_server", "mobile_scan"], "reseller": None, "branding": None, "key_id": KEY_ID}
    base.update(over)
    return base


def fileb(l, key=PRIV, tamper=None):
    f = LV.sign_licence(l, key) if key is PRIV else dict(LV.sign_licence(dict(l, key_id=l["key_id"]), key))
    if tamper:
        f = copy.deepcopy(f)
        tamper(f)
    return LV.encode_licence_file(f)


SCEN = [
    ("missing", None),
    ("full", lambda: fileb(lic(1))),
    ("expiring_soon", lambda: fileb(lic(2, expires_at=z(NOW + timedelta(days=10))))),
    ("grace", lambda: fileb(lic(3, expires_at=z(NOW - timedelta(days=5))))),
    ("beyond_grace", lambda: fileb(lic(4, expires_at=z(NOW - timedelta(days=50))))),
    ("not_yet_valid", lambda: fileb(lic(5, valid_from=z(NOW + timedelta(days=5)), expires_at=z(NOW + timedelta(days=400))))),
    ("suspended", lambda: fileb(lic(6, status="suspended", grace_days=0))),
    ("revoked", lambda: fileb(lic(7, status="revoked"))),
    ("tampered", lambda: fileb(lic(8), tamper=lambda f: f["licence"].update(plan="pro"))),
    ("unknown_key", lambda: fileb(lic(9), key=OTHER)),
    ("wrong_instance", lambda: fileb(lic(10, instance_id="99999999-bbbb-4ccc-8ddd-eeeeeeeeeeee"))),
    ("garbage", lambda: b"{not json"),
    ("unicode_and_url", lambda: fileb(lic(11, customer={"name": "Studio “Ünïcødé” / 東京"}, update_url="https://example.invalid/licenze/x.docmap-licence",
                                         branding={"product_name": "ArchivioPro"}, limits={}))),
    ("full_again", lambda: fileb(lic(12))),
]


WRITABLE = ("full", "expiring_soon", "grace", "unicode_and_url", "full_again")


class LicenceDiff(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.work = tempfile.mkdtemp(prefix="docmap-licdiff-")
        cls.php = D.Server("php", cls.work)
        cls.py = D.Server("py", cls.work)
        extra = ", 'licence_required' => true, 'licence_public_keys' => ['%s' => '%s']" % (KEY_ID, PUB)
        for s in (cls.php, cls.py):
            s.write_config(extra=extra)
            with open(os.path.join(s.data, "instance.json"), "w", encoding="utf-8") as f:
                json.dump({"instance_id": IID}, f)
        cls.php.start()
        cls.py.start()
        cls.duo = D.Duo(cls.php, cls.py)

    @classmethod
    def tearDownClass(cls):
        cls.php.stop()
        cls.py.stop()
        shutil.rmtree(cls.work, ignore_errors=True)

    def put(self, raw):
        for s in (self.php, self.py):
            d = os.path.join(s.data, "licence")
            os.makedirs(d, exist_ok=True)
            p = os.path.join(d, "licence.docmap-licence")
            if raw is None:
                if os.path.exists(p):
                    os.replace(p, p + ".off")
            else:
                with open(p, "wb") as f:
                    f.write(raw)
        time.sleep(0.05)

    def test_1_scenarios(self):
        du = self.duo
        n = 0
        for name, mk in SCEN:
            self.put(mk() if mk else None)
            du.both(name + " ping", "ping")
            du.both(name + " me", "me", token=D.A)
            du.both(name + " pull", "pull", token=D.E)
            n += 1
            at = "2025-11-0%dT08:00:00.000Z" % (1 + n % 9)
            ok_ = name in WRITABLE
            r = du.both(name + " push edit", "push", token=D.E, body={"deviceId": "d", "records": [D.B("lic-b1", "LIC-001", at)]},
                        expect=200 if ok_ else 403)
            if not ok_:
                self.assertEqual(r["php"][1]["error"]["code"], "licence_read_only", name)
            self.assertEqual(r["php"][1].get("error", {}).get("message_it", "x") != "", True)
            du.both(name + " seen", "seen", token=D.V, body={"items": [{"type": "binder", "id": "lic-b1", "via": "qr"}]}, ignore=("server_time",), expect=200)
            du.both(name + " pull", "pull", token=D.V, expect=200)
            du.both(name + " token_create (existing user)", "token_create", token=D.A, body={"user": "mario", "role": "editor"},
                    reg=lambda j: [j.get("token", ""), j.get("id", "")])
        print("  scenarios: %d comparisons OK, %d differences" % (du.ok, len(du.fails)))
        self.assertEqual(du.fails, [])

    def test_2_limits(self):
        du = self.duo
        self.put(fileb(lic(20, limits={"binders": 3, "users": 5})))
        recs = [D.B("lim-%d" % i, "LIM-%03d" % i, "2025-11-10T08:00:00.000Z") for i in range(5)]
        du.both("limit: push 5 new binders (over)", "push", token=D.E, body={"deviceId": "d", "records": recs}, expect=403)
        du.both("limit: push 2 new binders (fits)", "push", token=D.E, body={"deviceId": "d", "records": recs[:2]}, expect=200)
        du.both("limit: push 1 more (over)", "push", token=D.E, body={"deviceId": "d", "records": recs[2:3]}, expect=403)
        du.both("limit: users at limit", "token_create", token=D.A, body={"user": "nuovo1", "role": "viewer"},
                reg=lambda j: [j.get("token", ""), j.get("id", "")])
        du.both("limit: users over", "token_create", token=D.A, body={"user": "nuovo2", "role": "viewer"})
        print("  limits: %d comparisons OK in total, %d differences" % (du.ok, len(du.fails)))
        self.assertEqual(du.fails, [])

    def test_3_php_shipped_licence(self):
        """PHP only: server-php/licence.docmap-licence is installed when it is genuine and newer, never when older."""
        sp = self.php.sp
        ship = os.path.join(sp, "licence.docmap-licence")
        self.put(fileb(lic(30)))
        with open(ship, "wb") as f:
            f.write(fileb(lic(29, plan="vecchio")))          # older → ignored
        st, j, _, _ = self.php.call("me", token=D.A)
        self.assertEqual(j["licence"]["licence"]["licence_id"], "lic-0030")
        with open(ship, "wb") as f:
            f.write(fileb(lic(31, plan="nuovo")))            # newer → installed
        st, j, _, _ = self.php.call("me", token=D.A)
        self.assertEqual((j["licence"]["licence"]["licence_id"], j["licence"]["licence"]["plan"]), ("lic-0031", "nuovo"))
        self.assertTrue(os.path.exists(os.path.join(self.php.data, "licence", "licence.prev.docmap-licence")))
        with open(ship, "wb") as f:
            f.write(fileb(lic(32), key=OTHER))                # not genuine → ignored
        st, j, _, _ = self.php.call("me", token=D.A)
        self.assertEqual(j["licence"]["licence"]["licence_id"], "lic-0031")
        os.remove(ship)


if __name__ == "__main__":
    unittest.main(verbosity=2)
