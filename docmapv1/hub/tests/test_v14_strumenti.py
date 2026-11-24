"""v0.14: Strumenti in the plans. The licence carries ``strumenti`` / ``strumenti_remote`` and ``strumenti_credits``;
the hub gives each installation a token on the provider's remote Strumenti server and its monthly credits follow the
licence (suspended = 0 credits, reactivated = plan credits again). Runs against a REAL Strumenti server in remote mode."""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
STRU = HERE.parents[1] / "strumenti"
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

from docmap_hub import licence as L  # noqa: E402
from docmap_hub import licensing as LG  # noqa: E402
from docmap_hub import strumenti as ST  # noqa: E402
from docmap_hub.service import Hub  # noqa: E402
from docmap_hub.vault import Vault  # noqa: E402
from test_v04_manager import PASS, WebHarness  # noqa: E402

try:
    sys.path.insert(0, str(STRU))
    sys.path.insert(0, str(STRU / "tests"))
    from test_jobs_server import Srv  # noqa: E402
except ImportError:          # Strumenti folder or its requirements missing
    Srv = None


class TestPlans(unittest.TestCase):
    def test_plans_carry_strumenti(self):
        plans = json.loads((HERE.parent / "docmap_hub" / "plans.json").read_text("utf-8"))["plans"]
        self.assertIn("strumenti_credits", L.LIMIT_KEYS)
        self.assertTrue({"strumenti", "strumenti_remote"} <= set(L.KNOWN_FEATURES))
        for name, p in plans.items():
            self.assertIn("strumenti", p["features"], name)
            self.assertIn("strumenti_credits", p["limits"], name)
        self.assertIn("strumenti_remote", plans["studio_pro"]["features"])
        self.assertNotIn("strumenti_remote", plans["studio"]["features"])


@unittest.skipIf(Srv is None, "Strumenti not importable")
class TestRemoteTokens(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.addCleanup(self._td.cleanup)
        self.tmp = Path(self._td.name)
        self.srv = Srv(self.tmp / "stru", remote=True)
        self.addCleanup(self.srv.close)
        self.hub = Hub(self.tmp / "hub")
        self.addCleanup(self.hub.close)
        self.hub.keys.generate(PASS)
        self.kid, self.priv = self.hub.keys.load_private(PASS)
        self.vk = Vault(self.hub.registry).init(PASS)
        c = self.hub.registry.add_customer("Studio Remoto")
        self.iid = self.hub.registry.add_instance(c["id"], "Sede")["id"]

    def token_row(self):
        rows = [t for t in self.srv.call("/api/tokens")[1]["tokens"] if t["tenant"] == self.iid]
        return rows

    def test_config_needs_vault_and_key_is_encrypted(self):
        with self.assertRaises(ST.StrumentiError):
            ST.set_config(self.hub.registry, None, self.srv.url, "x")
        with self.assertRaises(ST.StrumentiError):
            ST.set_config(self.hub.registry, self.vk, "ftp://x", "")
        ST.set_config(self.hub.registry, self.vk, self.srv.url + "/", self.srv.app.key)
        raw = self.hub.registry.get_setting(ST.CONFIG)
        self.assertNotIn(self.srv.app.key, raw)                       # never in clear in the registry
        self.assertEqual(ST.config(self.hub.registry), {"url": self.srv.url, "has_key": True})
        ST.set_config(self.hub.registry, None, self.srv.url, "")      # same address, key kept
        self.assertTrue(ST.config(self.hub.registry)["has_key"])
        self.assertEqual(ST.ping(self.hub.registry, self.vk)["version"], self.srv.call("/api/info")[1]["version"])
        ST.set_config(self.hub.registry, self.vk, self.srv.url, "chiave-sbagliata")
        with self.assertRaises(ST.StrumentiError):
            ST.ping(self.hub.registry, self.vk)
        db = (self.tmp / "hub").glob("*.sqlite*")
        self.assertFalse(any(self.srv.app.key.encode() in f.read_bytes() for f in db))   # nowhere in the registry

    def test_token_follows_the_licence(self):
        ST.set_config(self.hub.registry, self.vk, self.srv.url, self.srv.app.key)
        self.hub.issue_with_key(self.kid, self.priv, self.iid, "studio")             # no remote in this plan
        with self.assertRaisesRegex(ST.StrumentiError, "non comprende"):
            ST.issue_token(self.hub, self.vk, self.iid)
        self.hub.renew_with_key(self.kid, self.priv, self.iid, plan="studio_pro")
        credits = self.hub.plans["studio_pro"]["limits"]["strumenti_credits"]
        r = ST.issue_token(self.hub, self.vk, self.iid)
        self.assertTrue(r["token"].startswith("dms_"))
        self.assertEqual((r["credits"], r["plan"]), (credits, "studio_pro"))
        self.assertNotIn(r["token"], json.dumps(ST.issued(self.hub.registry)))       # shown once, never stored
        st, info = self.srv.call("/api/info", key=r["token"])
        self.assertEqual((st, info["admin"], info["tenant"], info["credits"]["limit_month"]), (200, False, self.iid, credits))
        # a second token replaces the first
        r2 = ST.issue_token(self.hub, self.vk, self.iid)
        self.assertEqual(self.srv.call("/api/info", key=r["token"])[0], 401)
        self.assertEqual(self.srv.call("/api/info", key=r2["token"])[0], 200)
        # suspended: 0 credits, the token stays (reactivation restores it)
        LG.suspend(self.hub, self.kid, self.priv, self.iid, reason="prova")
        rec = ST.sync(self.hub, self.vk, self.iid)
        self.assertEqual(rec["credits"], 0)
        self.assertIn("suspended", rec["reason"])
        self.assertEqual(self.srv.call("/api/info", key=r2["token"])[1]["credits"]["limit_month"], 0)
        LG.reactivate(self.hub, self.kid, self.priv, self.iid)
        self.assertEqual(ST.sync_all(self.hub, self.vk)[self.iid]["credits"], credits)
        self.assertEqual(self.srv.call("/api/info", key=r2["token"])[1]["credits"]["limit_month"], credits)
        v = ST.view(self.hub.registry)
        self.assertEqual([x["instance_id"] for x in v["rows"]], [self.iid])
        self.assertTrue(v["rows"][0]["entitlement"]["allowed"])
        # revoke
        self.assertEqual(ST.revoke(self.hub, self.vk, self.iid), 1)
        self.assertEqual(self.srv.call("/api/info", key=r2["token"])[0], 401)
        self.assertEqual(ST.issued(self.hub.registry), {})
        self.assertIsNone(ST.sync(self.hub, self.vk, self.iid))

    def test_unreachable_server_is_reported(self):
        ST.set_config(self.hub.registry, self.vk, "http://127.0.0.1:9", self.srv.app.key)
        self.hub.issue_with_key(self.kid, self.priv, self.iid, "studio_pro")
        with self.assertRaisesRegex(ST.StrumentiError, "non raggiungibile"):
            ST.issue_token(self.hub, self.vk, self.iid)


@unittest.skipIf(Srv is None, "Strumenti not importable")
class TestWeb(WebHarness, unittest.TestCase):
    def test_routes(self):
        self.start(passphrase=None)
        srv = Srv(Path(self._td.name) / "stru", remote=True)
        self.addCleanup(srv.close)
        self.assertEqual(self.login()[0], 200)
        api = lambda path, body=None: (lambda r: (r[0], r[2]))(self.call(path, body))  # noqa: E731
        st, v = api("/api/strumenti")
        self.assertEqual((st, v["config"], v["rows"]), (200, None, []))
        st, v = api("/api/strumenti", {"url": srv.url, "admin_key": srv.app.key})
        self.assertEqual((st, v["config"]["has_key"]), (200, True), v)
        self.assertEqual(api("/api/strumenti/ping", {})[0], 200)
        app = self.httpd.app
        c = app.hub.registry.add_customer("Studio Web")
        iid = app.hub.registry.add_instance(c["id"], "Sede")["id"]
        app.hub.issue_with_key(app.key_id, app.private_key, iid, "conto_terzi")
        st, t = api(f"/api/instances/{iid}/strumenti/token", {})
        self.assertEqual(st, 200, t)
        self.assertTrue(t["token"].startswith("dms_"))
        st, v = api("/api/strumenti/sync", {})
        self.assertEqual((st, v["synced"][iid]["credits"]), (200, t["credits"]))
        st, v = api(f"/api/instances/{iid}/strumenti/revoke", {})
        self.assertEqual((st, v["revoked"], v["rows"]), (200, 1, []))


if __name__ == "__main__":
    unittest.main()
