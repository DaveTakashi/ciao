"""v0.2 pages of the local web page: environments, vault (reveal asks the passphrase again),
deploy plan → confirm (job), ports, status / check-all (background job)."""

import os
import re
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from docmap_hub import deploy as D
from docmap_hub.service import Hub
from docmap_hub.vault import Vault

PASS = "una-passphrase-lunga"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


class TestWebV02(unittest.TestCase):
    def setUp(self):
        from docmap_hub.web import make_server
        self._td = tempfile.TemporaryDirectory()
        self.addCleanup(self._td.cleanup)
        self.tmp = Path(self._td.name)
        self.hub = Hub(self.tmp / "hub")
        self.hub.keys.generate(PASS)
        Vault(self.hub.registry).init(PASS)
        c = self.hub.registry.add_customer("Studio Web")
        self.inst = self.hub.registry.add_instance(c["id"], label="PC Web")
        self.httpd = make_server(self.hub, PASS, port=0)
        self.assertIsNotNone(self.httpd.app.vault_key)
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.addCleanup(self._stop)
        self.opener = urllib.request.build_opener(NoRedirect)
        code, h, _ = self.req("/login", {"passphrase": PASS})
        self.cookie = h["Set-Cookie"].split(";")[0]
        _, _, body = self.req("/envs")
        self.csrf = body.split("name='csrf' value='")[1].split("'")[0]

    def _stop(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.hub.close()

    def req(self, path, data=None):
        r = urllib.request.Request(self.base + path,
                                   data=urllib.parse.urlencode(data).encode() if data is not None else None)
        if getattr(self, "cookie", None):
            r.add_header("Cookie", self.cookie)
        try:
            resp = self.opener.open(r, timeout=30)
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers), e.read().decode("utf-8", "replace")
        return resp.status, dict(resp.headers), resp.read().decode("utf-8", "replace")

    def post(self, path, **data):
        data["csrf"] = self.csrf
        return self.req(path, data)

    def wait_job(self, location, timeout=120):
        end = time.time() + timeout
        while time.time() < end:
            code, _, body = self.req(location)
            self.assertEqual(code, 200)
            if "in corso" not in body:
                return body
            time.sleep(0.3)
        self.fail("job non terminato")

    def test_pages_vault_deploy_status(self):
        for p in ("/", "/envs", "/vault", "/deploy", "/ports", "/status"):
            code, _, body = self.req(p)
            self.assertEqual(code, 200, p)
            self.assertIn("Istanze &amp; ambienti", body)
        # CSRF still required on the new forms
        code, _, _ = self.req("/env/add", {"instance": self.inst["id"], "name": "staging", "kind": "web-php",
                                           "url": "https://h.invalid/st/"})
        self.assertEqual(code, 403)
        code, h, _ = self.post("/env/add", instance=self.inst["id"], name="staging", kind="web-php",
                               url="https://h.invalid/studio-st/")
        self.assertEqual(code, 303)
        self.assertIn("ok=", h["Location"])
        env = self.hub.registry.get_environment(self.inst["id"], "staging")
        self.assertEqual(env["api_url"], "https://h.invalid/studio-st/server-php/api.php")
        # vault: store FTP ('local' folder transport) and basic auth
        site = self.tmp / "site"
        site.mkdir()
        code, h, _ = self.post("/vault/set", env=env["id"], kind="ftp", protocol="local", remote_path=str(site))
        self.assertIn("ok=", h["Location"])
        self.post("/vault/set", env=env["id"], kind="basic_auth", user="studio", password="pw-cartella-1")
        code, _, body = self.req("/vault")
        self.assertIn("basic_auth", body)
        self.assertNotIn("pw-cartella-1", body)
        # escrow off → db_config refused, error shown on the vault page
        code, h, _ = self.post("/vault/set", env=env["id"], kind="db_config", content='{"aes_key":"x"}')
        self.assertTrue(h["Location"].startswith("/vault?err="))
        # reveal: wrong passphrase refused, right one shows the secret and is audited
        code, h, _ = self.post("/vault/reveal", env=env["id"], kind="basic_auth", label="", passphrase="sbagliata!!")
        self.assertIn("err=", h["Location"])
        code, _, body = self.post("/vault/reveal", env=env["id"], kind="basic_auth", label="", passphrase=PASS)
        self.assertEqual(code, 200)
        self.assertIn("pw-cartella-1", body)
        self.assertTrue(any(e["action"] == "vault.reveal" for e in self.hub.registry.events(50)))

        # deploy: plan (dry-run job) → confirm
        code, h, _ = self.post("/deploy/plan", env=env["id"])
        self.assertEqual(code, 303)
        body = self.wait_job(h["Location"])
        self.assertIn("Conferma il deploy", body, body[-3000:])
        self.assertEqual(list(site.iterdir()), [])            # dry-run wrote nothing
        job = h["Location"].rsplit("/", 1)[1]
        code, h2, _ = self.post("/deploy/run", job=job)        # missing confirmation box → refused
        self.assertIn("err=", h2["Location"])
        # the health check will fail (h.invalid is not reachable) → automatic rollback, reported
        code, h2, _ = self.post("/deploy/run", job=job, sure="1")
        body = self.wait_job(h2["Location"], timeout=180)
        self.assertIn("non riuscito", body)
        self.assertIn("rimesso", body)
        self.assertTrue((site / "index.html").exists())       # new files are left, nothing existed before
        dep = self.hub.registry.list_deploys(limit=1)[0]
        self.assertEqual(dep["status"], "rolled-back")

        # ports page + range change
        code, h, _ = self.post("/ports/range", start="18500", end="18600")
        self.assertIn("ok=", h["Location"])
        self.assertIn("18500-18600", self.req("/ports")[2])

        # status: check-all runs in the background
        code, h, _ = self.post("/check-all")
        self.assertTrue(h["Location"].startswith("/job/"))
        body = self.wait_job(h["Location"], timeout=60)
        self.assertIn("completato", body)
        code, _, body = self.req("/status")
        self.assertIn("staging", body)
        self.assertRegex(body, re.compile("non raggiungibile|no<", re.S))

        # delete needs the confirmation box; production would need its name
        code, h, _ = self.post("/env/delete", env=env["id"])
        self.assertIn("err=", h["Location"])
        code, h, _ = self.post("/env/delete", env=env["id"], sure="1")
        self.assertIn("ok=", h["Location"])
        self.assertEqual(self.hub.registry.list_environments(), [])


if __name__ == "__main__":
    unittest.main()
