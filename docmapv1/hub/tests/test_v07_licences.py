"""v0.7: licence control at a distance — suspend / reactivate / revoke / modify (each a new signed licence that
supersedes the current one), short automatic renewal, licence channel (published files with the signed update_url),
whole hub exported in one encrypted file and imported on a new PC."""

import os
import sys
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from docmap_hub import backups as B
from docmap_hub import licence as L
from docmap_hub import licensing as LG
from docmap_hub.registry import RegistryError
from docmap_hub.service import Hub
from test_v04_manager import PASS, WebHarness


class TestLifecycle(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.addCleanup(self._td.cleanup)
        self.tmp = Path(self._td.name)
        self.hub = Hub(self.tmp / "hub")
        self.addCleanup(self.hub.close)
        self.hub.keys.generate(PASS)
        self.kid, self.priv = self.hub.keys.load_private(PASS)
        c = self.hub.registry.add_customer("Studio Ciclo")
        self.iid = self.hub.registry.add_instance(c["id"], "Sede")["id"]
        self.first = self.hub.issue_with_key(self.kid, self.priv, self.iid, "studio")

    def verify(self, res):
        return L.verify(res["text"], self.hub.keys.public_keys(), instance_id=self.iid)

    def test_suspend_reactivate_revoke_modify(self):
        orig_exp = self.first["licence"]["expires_at"]
        s = LG.suspend(self.hub, self.kid, self.priv, self.iid, reason="insoluto")
        st = self.verify(s)
        self.assertEqual((st.mode, st.reasons), ("read_only", ["suspended"]))
        self.assertEqual(LG.current(self.hub.registry, self.iid)["id"], s["licence"]["licence_id"])
        self.assertEqual(s["licence"]["resume"]["expires_at"], orig_exp)
        with self.assertRaises(RegistryError):
            LG.suspend(self.hub, self.kid, self.priv, self.iid)            # already suspended
        with self.assertRaises(RegistryError):
            LG.modify(self.hub, self.kid, self.priv, self.iid, limits={"users": 9})
        r = LG.reactivate(self.hub, self.kid, self.priv, self.iid)
        self.assertEqual(r["licence"]["expires_at"], orig_exp)
        self.assertNotIn("status", r["licence"])
        self.assertEqual(self.verify(r).mode, "full")
        self.assertGreater(r["licence"]["issued_at"], s["licence"]["issued_at"])
        m = LG.modify(self.hub, self.kid, self.priv, self.iid, limits={"binders": 500, "users": -1},
                      add_features=["ai_credits"], grace_days=10)
        self.assertEqual((m["licence"]["limits"]["binders"], m["licence"]["limits"]["users"]), (500, None))
        self.assertIn("ai_credits", m["licence"]["features"])
        with self.assertRaises(RegistryError):
            LG.modify(self.hub, self.kid, self.priv, self.iid, add_features=["teletrasporto"])
        # revoke: read-only, renewals blocked, auto-renew off; reactivate lifts it
        LG.set_autorenew(self.hub.registry, self.iid, {"days": 30})
        v = LG.suspend(self.hub, self.kid, self.priv, self.iid, revoke=True)
        self.assertEqual(self.verify(v).reasons, ["revoked"])
        self.assertIsNone(LG.get_autorenew(self.hub.registry, self.iid))
        with self.assertRaises(RegistryError):
            self.hub.renew_with_key(self.kid, self.priv, self.iid)
        LG.reactivate(self.hub, self.kid, self.priv, self.iid)
        self.assertFalse(LG.is_revoked(self.hub.registry, self.iid))

    def test_renew_of_a_suspended_licence_reactivates_with_the_old_grace(self):
        LG.suspend(self.hub, self.kid, self.priv, self.iid)
        r = self.hub.renew_with_key(self.kid, self.priv, self.iid, months=6)
        self.assertEqual(self.verify(r).mode, "full")
        self.assertEqual(r["licence"]["grace_days"], self.first["licence"]["grace_days"])
        self.assertNotIn("status", r["licence"])

    def test_reactivate_after_expiry_needs_months(self):
        now = datetime.now(timezone.utc)
        LG.suspend(self.hub, self.kid, self.priv, self.iid)
        later = now + timedelta(days=500)
        with self.assertRaises(RegistryError):
            LG.reactivate(self.hub, self.kid, self.priv, self.iid, now=later)
        r = LG.reactivate(self.hub, self.kid, self.priv, self.iid, months=2, now=later)
        self.assertGreater(L.parse_time(r["licence"]["expires_at"]), later + timedelta(days=55))

    def test_autorenew_short_licences(self):
        reg = self.hub.registry
        with self.assertRaises(RegistryError):
            LG.set_autorenew(reg, self.iid, {"days": 3})
        until = (datetime.now(timezone.utc) + timedelta(days=50)).strftime("%Y-%m-%d")
        LG.set_autorenew(reg, self.iid, {"days": 35, "renew_before": 10, "until": until})
        self.assertEqual(LG.autorenew_due(self.hub), [])                     # a 12-month licence: not due
        LG.modify(self.hub, self.kid, self.priv, self.iid, expires_at=datetime.now(timezone.utc) + timedelta(days=5))
        self.assertEqual(LG.autorenew_due(self.hub), [self.iid])
        r = LG.renew_short(self.hub, self.kid, self.priv, self.iid)
        days = (L.parse_time(r["licence"]["expires_at"]) - datetime.now(timezone.utc)).days
        self.assertIn(days, (34, 35))
        self.assertEqual(LG.autorenew_due(self.hub), [])
        # never past 'until'
        far = datetime.now(timezone.utc) + timedelta(days=30)
        r = LG.renew_short(self.hub, self.kid, self.priv, self.iid, now=far)
        self.assertLessEqual(L.parse_time(r["licence"]["expires_at"]), L.parse_time(LG.get_autorenew(reg, self.iid)["until"]))
        self.assertEqual(LG.autorenew_due(self.hub, now=far + timedelta(days=60)), [])

    def test_channel_address_inside_licences_and_publish(self):
        from docmap_hub.deploy import LocalRemote
        reg = self.hub.registry
        own = reg.add_customer("QR7")
        env = reg.add_environment(reg.add_instance(own["id"], "Sito")["id"], "production", "web-php",
                                  url="https://qr7.example/docmap")
        with self.assertRaises(RegistryError):
            LG.set_channel(reg, reg.add_environment(reg.add_instance(own["id"], "PC")["id"], "production",
                                                    "studio-python", url="https://10.0.0.2/")["id"])
        LG.set_channel(reg, env["id"])
        self.assertEqual(LG.pending(reg), [])                                # old licence has no address
        m = LG.modify(self.hub, self.kid, self.priv, self.iid)               # re-issue = address added
        url = m["licence"]["update_url"]
        self.assertTrue(url.startswith("https://qr7.example/docmap/licenze/") and url.endswith(".docmap-licence"))
        self.assertEqual(len(LG.pending(reg)), 1)
        site = self.tmp / "site"
        site.mkdir()
        r = LG.publish(self.hub, None, remote=LocalRemote(site))
        self.assertEqual(r["published"], 1)
        f = site / "licenze" / url.rsplit("/", 1)[1]
        self.assertEqual(f.read_text("utf-8"), m["text"])
        self.assertIn("Options -Indexes", (site / "licenze" / ".htaccess").read_text())
        self.assertEqual(LG.pending(reg), [])
        # the deploy never reports the channel folder as obsolete
        from docmap_hub.deploy import NEVER_REPORT_OBSOLETE
        self.assertTrue("licenze/x".startswith(NEVER_REPORT_OBSOLETE))

    def test_encrypted_export_and_import(self):
        name, data = B.export_encrypted(self.hub, "una passphrase lunga!")
        self.assertTrue(name.endswith(".docmap-hub"))
        self.assertNotIn(b"Studio Ciclo", data)
        with self.assertRaises(RegistryError):
            B.export_encrypted(self.hub, "corta")
        with self.assertRaises(RegistryError):
            B.import_encrypted(data, "sbagliata sbagliata", self.tmp / "nuovo")
        with self.assertRaises(RegistryError):
            B.import_encrypted(data, "una passphrase lunga!", self.hub.dir)   # never over an existing hub
        r = B.import_encrypted(data, "una passphrase lunga!", self.tmp / "nuovo")
        self.assertGreaterEqual(r["files"], 3)
        with Hub(self.tmp / "nuovo") as h2:
            self.assertEqual(h2.registry.list_customers()[0]["name"], "Studio Ciclo")
            self.assertEqual(h2.keys.load_private(PASS)[0], self.kid)
            self.assertEqual(len(h2.registry.list_licences()), 1)

    def test_cli_export_import(self):
        from docmap_hub.cli import main
        os.environ["DOCMAP_HUB_EXPORT_PASSPHRASE"] = "passphrase export 123"
        self.addCleanup(os.environ.pop, "DOCMAP_HUB_EXPORT_PASSPHRASE", None)
        out = self.tmp / "exp.docmap-hub"
        self.assertEqual(main(["--dir", str(self.hub.dir), "esporta-hub", "--out", str(out)]), 0)
        self.assertEqual(main(["--dir", str(self.tmp / "pc-nuovo"), "importa-hub", str(out)]), 0)
        self.assertTrue((self.tmp / "pc-nuovo" / "registry.sqlite3").is_file())
        self.assertEqual(main(["--dir", str(self.tmp / "pc-nuovo"), "importa-hub", str(out)]), 1)


class TestLicencesWeb(WebHarness, unittest.TestCase):
    def setUp(self):
        self.start()
        self.assertEqual(self.login()[0], 200)
        reg = self.hub.registry
        own = reg.add_customer("QR7")
        oi = reg.add_instance(own["id"], "Sito QR7")
        self.chan = reg.add_environment(oi["id"], "production", "web-php", url="https://qr7.example/")["id"]
        self.site = Path(self._td.name) / "canale"
        self.site.mkdir()
        c = reg.add_customer("Studio Web")
        self.iid = reg.add_instance(c["id"], "Sede")["id"]

    def wait(self, jid, timeout=60):
        end = time.time() + timeout
        while time.time() < end:
            j = self.call(f"/api/jobs/{jid}")[2]
            if j["status"] != "running":
                return j
            time.sleep(0.2)
        self.fail("job troppo lungo")

    def test_channel_actions_autorenew_export(self):
        code, _, ch = self.call("/api/licence-channel")
        self.assertIsNone(ch["channel"])
        self.assertIn(self.chan, [e["id"] for e in ch["envs"]])
        self.call(f"/api/envs/{self.chan}/secrets", {"kind": "ftp", "protocol": "local", "remote_path": str(self.site)})
        code, _, ch = self.call("/api/licence-channel", {"env_id": self.chan})
        self.assertEqual(ch["channel"]["base_url"], "https://qr7.example/licenze/")
        code, _, r = self.call("/api/licences", {"instance_id": self.iid, "plan": "studio"})
        lid = r["id"]
        code, _, d = self.call(f"/api/licences/{lid}")
        self.assertTrue(d["control"]["update_url"].startswith("https://qr7.example/licenze/"))
        self.assertFalse(d["control"]["published"])
        # suspend → new licence, published at once (vault open)
        code, _, r = self.call(f"/api/instances/{self.iid}/licence/suspend", {"reason": "prova"})
        self.assertEqual(code, 200, r)
        self.assertEqual(self.wait(r["publish_job"])["status"], "ok")
        code, _, d = self.call(f"/api/licences/{r['id']}")
        self.assertEqual((d["row"]["state"], d["control"]["status"], d["control"]["published"]), ("suspended", "suspended", True))
        self.assertEqual(d["verify"]["mode"], "read_only")
        files = list((self.site / "licenze").glob("*.docmap-licence"))
        self.assertEqual(len(files), 1)
        self.assertIn('"status": "suspended"', files[0].read_text())
        code, _, ov = self.call("/api/overview")
        self.assertTrue(any(a["title"].startswith("Licenza sospesa") for a in ov["alerts"]))
        # revoke needs the box; reactivate
        self.assertEqual(self.call(f"/api/instances/{self.iid}/licence/revoke", {})[0], 400)
        code, _, r = self.call(f"/api/instances/{self.iid}/licence/reactivate", {})
        self.assertEqual(code, 200, r)
        self.wait(r["publish_job"])
        # modify limits + features
        code, _, r = self.call(f"/api/instances/{self.iid}/licence/modify",
                               {"limits": {"binders": "250"}, "features": ["sync_server", "mobile_scan"], "grace_days": "15"})
        self.assertEqual(code, 200, r)
        self.wait(r["publish_job"])
        lic = self.call(f"/api/licences/{r['id']}")[2]["licence"]
        self.assertEqual((lic["limits"]["binders"], lic["features"], lic["grace_days"]), (250, ["mobile_scan", "sync_server"], 15))
        # auto-renew with a short licence now
        code, _, r = self.call(f"/api/instances/{self.iid}/licence/autorenew", {"on": True, "days": 30, "now": True})
        self.assertEqual(code, 200, r)
        self.wait(r["publish_job"])
        d = self.call(f"/api/licences/{r['id']}")[2]
        self.assertEqual(d["control"]["autorenew"]["days"], 30)
        self.assertLessEqual(d["row"]["days_left"], 30)
        # vault closed → change waits, alert in Panoramica, then publish from the channel page
        self.call("/api/vault/lock", {})
        code, _, r = self.call(f"/api/instances/{self.iid}/licence/modify", {"limits": {"users": "7"}})
        self.assertIsNone(r["publish_job"])
        ov = self.call("/api/overview")[2]
        self.assertTrue(any(a["kind"] == "channel" for a in ov["alerts"]))
        self.assertEqual(self.call("/api/licence-channel/publish", {})[0], 400)    # vault closed
        self.call("/api/vault/unlock", {"passphrase": PASS})
        code, _, r = self.call("/api/licence-channel/publish", {})
        self.assertEqual(self.wait(r["job"])["status"], "ok")
        self.assertFalse(any(a["kind"] == "channel" for a in self.call("/api/overview")[2]["alerts"]))
        # scheduler tick: nothing due, nothing pending
        from docmap_hub.licensing import Scheduler
        self.assertEqual(Scheduler(self.httpd.app).tick(), {"renewed": [], "published": 0})
        # encrypted export, downloadable from the backups list
        self.assertEqual(self.call("/api/export", {"passphrase": "abc", "again": "abc"})[0], 400)
        code, _, e = self.call("/api/export", {"passphrase": "export lungo 123", "again": "export lungo 123"})
        self.assertEqual(code, 200, e)
        items = self.call("/api/backups")[2]["items"]
        self.assertIn("esportazione", [b["kind"] for b in items if b["name"] == e["name"]])
        code, _, data = self.call(f"/scarica/backup/{e['name']}", raw=True)
        self.assertTrue(data.startswith(B.EXPORT_MAGIC))


if __name__ == "__main__":
    unittest.main()
