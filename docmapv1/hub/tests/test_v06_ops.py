"""v0.6: everything from the manager — deploy/promote with plan → confirm → automatic checks, vault per
environment (save, reveal with the passphrase again, delete), environments added from the project,
automatic hub backups (schedule, pruning, second folder, download)."""

import os
import sys
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from docmap_hub import backups as B
from test_v04_manager import PASS, WebHarness


class TestBackups(unittest.TestCase):
    def setUp(self):
        import tempfile
        from docmap_hub.service import Hub
        self._td = tempfile.TemporaryDirectory()
        self.addCleanup(self._td.cleanup)
        self.tmp = Path(self._td.name)
        self.hub = Hub(self.tmp / "hub")
        self.addCleanup(self.hub.close)
        self.hub.keys.generate(PASS)

    def test_due_run_prune_copy(self):
        self.assertTrue(B.due(self.hub))                       # never done → due
        copy = self.tmp / "chiavetta"
        copy.mkdir()
        B.set_config(self.hub.registry, keep=2, copy_dir=str(copy))
        names = []
        for i in range(3):
            r = B.run(self.hub, auto=True)
            names.append(r["name"])
            self.assertEqual(r["copied_to"], str(copy / r["name"]))
            time.sleep(1.1)                                     # distinct timestamps in the name
        autos = [b["name"] for b in B.list_backups(self.hub) if b["kind"] == "auto"]
        self.assertEqual(sorted(autos), sorted(names[1:]))     # oldest automatic one pruned
        self.assertFalse(B.due(self.hub))
        # a manual backup and the pre-migration copies are never pruned
        manual = B.run(self.hub, auto=False)
        (self.hub.dir / "backups" / "registro-prima-dello-schema-3-da-2-x.sqlite3").write_bytes(b"x")
        B.run(self.hub, auto=True)
        kinds = {b["name"]: b["kind"] for b in B.list_backups(self.hub)}
        self.assertEqual(kinds[manual["name"]], "manuale")
        self.assertIn("registro-prima-dello-schema-3-da-2-x.sqlite3", kinds)
        self.assertEqual(sum(1 for k in kinds.values() if k == "auto"), 2)
        # zip contents: registry + keys, private key still encrypted
        import zipfile
        with zipfile.ZipFile(B.path_of(self.hub, manual["name"])) as z:
            self.assertIn("registry.sqlite3", z.namelist())
            self.assertTrue(any(n.startswith("keys/") for n in z.namelist()))

    def test_missing_copy_folder_does_not_lose_the_backup(self):
        copy = self.tmp / "usb"
        copy.mkdir()
        B.set_config(self.hub.registry, copy_dir=str(copy))
        copy.rmdir()                                            # stick removed
        r = B.run(self.hub, auto=True)
        self.assertIsNone(r["copied_to"])
        self.assertTrue(r["copy_error"])
        self.assertTrue(B.path_of(self.hub, r["name"]).is_file())

    def test_config_validation_and_off(self):
        from docmap_hub.registry import RegistryError
        with self.assertRaises(RegistryError):
            B.set_config(self.hub.registry, every_hours=0)
        with self.assertRaises(RegistryError):
            B.set_config(self.hub.registry, copy_dir=str(self.tmp / "non-esiste"))
        B.set_config(self.hub.registry, auto=False)
        self.assertFalse(B.due(self.hub))
        with self.assertRaises(RegistryError):
            B.path_of(self.hub, "../registry.sqlite3")

    def test_scheduler_tick(self):
        s = B.Scheduler(self.hub.dir)
        self.assertIsNotNone(s.tick())
        self.assertIsNone(s.tick())                             # not due again
        later = datetime.now(timezone.utc) + timedelta(hours=25)
        self.assertTrue(B.due(self.hub, now=later))


class TestOpsWeb(WebHarness, unittest.TestCase):
    def setUp(self):
        self.start()
        self.assertEqual(self.login()[0], 200)
        code, _, c = self.call("/api/customers", {"name": "Studio Deploy"})
        self.assertEqual(code, 200, c)
        self.cid = c["id"]
        code, _, d = self.call(f"/api/customers/{self.cid}")
        self.pid = d["projects"][0]["id"]
        code, _, i = self.call("/api/instances", {"project_id": self.pid, "label": "Sito online", "kind": "cloud"})
        self.iid = i["id"]

    def add_env(self, name):
        code, _, e = self.call("/api/envs", {"instance_id": self.iid, "kind": "web-php", "name": name,
                                             "url": f"https://h.invalid/{name}/"})
        self.assertEqual(code, 200, e)
        return e["id"]

    def wait(self, jid, timeout=180):
        end = time.time() + timeout
        while time.time() < end:
            code, _, j = self.call(f"/api/jobs/{jid}")
            if j["status"] != "running":
                return j
            time.sleep(0.3)
        self.fail("job troppo lungo")

    def test_environment_secrets_vault(self):
        eid = self.add_env("production")
        code, _, d = self.call(f"/api/customers/{self.cid}")
        env = d["projects"][0]["instances"][0]["envs"][0]
        self.assertEqual((env["name"], env["api_url"]), ("production", "https://h.invalid/production/server-php/api.php"))
        # vault closed → clear error, then open it from the app
        self.call("/api/vault/lock", {})
        code, _, j = self.call(f"/api/envs/{eid}/secrets", {"kind": "basic_auth", "user": "u", "password": "segreto-123"})
        self.assertEqual(code, 400)
        self.assertIn("Cassaforte chiusa", j["error"])
        code, _, j = self.call("/api/vault/unlock", {"passphrase": "sbagliata-sbagliata"})
        self.assertEqual(code, 400)
        code, _, j = self.call("/api/vault/unlock", {"passphrase": PASS})
        self.assertEqual((code, j["vault"]), (200, "open"))
        code, _, j = self.call(f"/api/envs/{eid}/secrets", {"kind": "basic_auth", "user": "u", "password": "segreto-123"})
        self.assertEqual(code, 200, j)
        code, _, lst = self.call(f"/api/envs/{eid}/secrets")
        self.assertEqual([s["kind"] for s in lst["items"]], ["basic_auth"])
        self.assertNotIn("segreto-123", str(lst))
        code, _, d = self.call(f"/api/customers/{self.cid}")
        self.assertNotIn("segreto-123", str(d))
        # reveal needs the passphrase again and is audited
        code, _, j = self.call(f"/api/envs/{eid}/secrets/reveal", {"kind": "basic_auth", "passphrase": "no-no-no-no"})
        self.assertEqual(code, 400)
        code, _, j = self.call(f"/api/envs/{eid}/secrets/reveal", {"kind": "basic_auth", "passphrase": PASS})
        self.assertEqual(j["data"]["password"], "segreto-123")
        self.assertTrue(any(e["action"] == "vault.reveal" for e in self.hub.registry.events(30)))
        # delete needs confirmation
        self.assertEqual(self.call(f"/api/envs/{eid}/secrets/delete", {"kind": "basic_auth"})[0], 400)
        self.assertEqual(self.call(f"/api/envs/{eid}/secrets/delete", {"kind": "basic_auth", "sure": True})[0], 200)
        # edit addresses
        code, _, _ = self.call(f"/api/envs/{eid}", {"api_url": "ftp://x"})
        self.assertEqual(code, 400)
        code, _, _ = self.call(f"/api/envs/{eid}", {"api_url": "https://h.invalid/api.php"})
        self.assertEqual(self.hub.registry.get_environment(eid)["api_url"], "https://h.invalid/api.php")
        # start/stop only for environments on this PC
        self.assertEqual(self.call(f"/api/envs/{eid}/start", {})[0], 400)

    def test_deploy_plan_confirm_and_promote(self):
        site_st, site_pr = Path(self._td.name) / "sito-st", Path(self._td.name) / "sito-pr"
        site_st.mkdir()
        site_pr.mkdir()
        st, pr = self.add_env("staging"), self.add_env("production")
        for eid, folder in ((st, site_st), (pr, site_pr)):
            code, _, j = self.call(f"/api/envs/{eid}/secrets", {"kind": "ftp", "protocol": "local", "remote_path": str(folder)})
            self.assertEqual(code, 200, j)
        # promote refused before staging is verified (error comes from the plan job)
        code, _, r = self.call(f"/api/instances/{self.iid}/promote-plan", {})
        self.assertEqual(self.wait(r["job"])["status"], "error")
        # plan: nothing written, plan visible, confirm needs the box
        code, _, r = self.call(f"/api/envs/{st}/deploy-plan", {})
        self.assertEqual(code, 200, r)
        plan = self.wait(r["job"])
        self.assertEqual(plan["status"], "ok", plan)
        p = plan["plan"]
        self.assertGreater(p["upload_count"], 10)
        self.assertGreater(p["valid_seconds"], 1700)
        self.assertEqual(list(site_st.iterdir()), [])
        self.assertEqual(self.call(f"/api/jobs/{plan['id']}/confirm", {})[0], 400)
        version = p["version"]
        with mock.patch("docmap_hub.deploy.ping", return_value={"ok": True, "app_version": version}):
            code, _, r = self.call(f"/api/jobs/{plan['id']}/confirm", {"sure": True})
            self.assertEqual(code, 200, r)
            # the same plan cannot be confirmed twice
            self.assertEqual(self.call(f"/api/jobs/{plan['id']}/confirm", {"sure": True})[0], 400)
            run = self.wait(r["job"])
            self.assertEqual(run["status"], "ok", run)
            self.assertEqual(run["result"]["status"], "ok")
            self.assertTrue((site_st / "index.html").is_file())
            self.assertEqual(self.hub.registry.get_environment(st)["verified_version"], version)
            # promote: same code to production
            code, _, r = self.call(f"/api/instances/{self.iid}/promote-plan", {})
            pp = self.wait(r["job"])
            self.assertEqual(pp["status"], "ok", pp)
            code, _, r = self.call(f"/api/jobs/{pp['id']}/confirm", {"sure": True})
            run = self.wait(r["job"])
            self.assertEqual(run["status"], "ok", run)
        self.assertTrue((site_pr / "index.html").is_file())
        self.assertEqual(self.hub.registry.get_environment(pr)["deployed_version"], version)
        # a second plan on staging: nothing to upload, confirm refused
        code, _, r = self.call(f"/api/envs/{st}/deploy-plan", {})
        again = self.wait(r["job"])
        self.assertEqual(again["plan"]["upload_count"], 0)
        self.assertEqual(self.call(f"/api/jobs/{again['id']}/confirm", {"sure": True})[0], 400)
        # expired plan refused
        job = self.httpd.app.jobs.get(again["id"])
        job.finished = time.time() - 4000
        self.assertEqual(self.call(f"/api/jobs/{again['id']}/confirm", {"sure": True})[0], 400)

    def test_backups_api_and_download(self):
        code, _, b = self.call("/api/backups")
        self.assertTrue(b["config"]["auto"])
        code, _, r = self.call("/api/backups/now", {})
        j = self.wait(r["job"])
        self.assertEqual(j["status"], "ok", j)
        name = j["result"]["name"]
        code, _, b = self.call("/api/backups")
        self.assertIn(name, [x["name"] for x in b["items"]])
        code, h, data = self.call(f"/scarica/backup/{name}", raw=True)
        self.assertEqual(code, 200)
        self.assertEqual(data[:2], b"PK")
        self.assertEqual(self.call("/scarica/backup/..%2Fregistry.sqlite3", raw=True)[0], 404)
        code, _, b = self.call("/api/backups", {"auto": False, "keep": 5})
        self.assertEqual((b["config"]["auto"], b["config"]["keep"]), (False, 5))
        code, _, ov = self.call("/api/overview")
        self.assertTrue(any(a["kind"] == "backup" for a in ov["alerts"]))
        # CSRF still enforced on the new writes
        self.assertEqual(self.call("/api/backups/now", {}, csrf=False)[0], 403)


if __name__ == "__main__":
    unittest.main()
