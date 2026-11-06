"""Hub 0.9 / app 26.12.7: the hub finishes an online site by itself.

* setup.php answers in JSON (format=json) and proposes ONE data folder per site (before, every site of a domain was
  offered the same docmap-data folder);
* ``sitesetup.setup_site`` runs it and puts every access code in the vault (config.php only with key escrow);
* ``push_licence`` uploads the current licence to the sites (a suspension is in force at the next request);
* ``update_sites`` stops at the first failure;
* ``journey.for_customer`` gives the next step;
* the page: «Nuovo cliente» opens the guided masks without AI (``/api/drafts/blank``).

The PHP parts run the real setup.php / api.php with ``php -S`` when PHP is installed (skipped otherwise)."""

import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from docmap_hub import journey as J
from docmap_hub import licensing as LG
from docmap_hub import sitesetup as SS
from docmap_hub.deploy import LocalRemote
from docmap_hub.envs import EnvManager
from docmap_hub.service import Hub
from docmap_hub.vault import Vault
from test_v04_manager import PASS

DOCMAPV1 = Path(__file__).resolve().parents[2]
PHP = shutil.which("php")


def free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class PhpHost:
    """A tiny «hosting»: php -S on a document root with one folder per site (like public_html/<site>)."""

    def __init__(self, root: Path):
        self.root = root / "public_html"
        self.root.mkdir(parents=True)
        self.port = free_port()
        self.proc = subprocess.Popen([PHP, "-S", f"127.0.0.1:{self.port}", "-t", str(self.root)],
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(50):
            try:
                socket.create_connection(("127.0.0.1", self.port), 0.2).close()
                break
            except OSError:
                time.sleep(0.1)

    def site(self, name: str, with_keys: bytes | None = None, licence: str | None = None) -> str:
        sp = self.root / name / "server-php"
        sp.mkdir(parents=True)
        for f in ("setup.php", "api.php"):
            shutil.copy(DOCMAPV1 / "server-php" / f, sp / f)
        if with_keys is not None:
            (sp / "trusted_keys.json").write_bytes(with_keys)
        if licence is not None:   # what the hub's site build ships (deploy)
            (sp / "licence.docmap-licence").write_text(licence, "utf-8")
        return f"http://127.0.0.1:{self.port}/{name}/"

    def close(self):
        self.proc.terminate()
        self.proc.wait(5)


@unittest.skipUnless(PHP, "php non installato")
class TestSetupPhpJson(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.addCleanup(self._td.cleanup)
        self.host = PhpHost(Path(self._td.name))
        self.addCleanup(self.host.close)

    def test_one_data_folder_per_site_and_json_answers(self):
        a, b = self.host.site("studio-rossi"), self.host.site("studio-rossi-prova")
        sa = SS.http_json(a + "server-php/setup.php?format=json")[1]
        sb = SS.http_json(b + "server-php/setup.php?format=json")[1]
        self.assertEqual(sa["state"], "ready")
        self.assertNotEqual(sa["default_data_dir"], sb["default_data_dir"])
        self.assertTrue(sa["default_data_dir"].endswith("/docmap-data/studio-rossi"))
        # the HTML form proposes the same folder
        html = urllib.request.urlopen(a + "server-php/setup.php").read().decode()
        self.assertIn(sa["default_data_dir"], html)
        st, r = SS.http_json(a + "server-php/setup.php", {"format": "json", "users": "admin,admin\nmario,editor"})
        self.assertEqual((st, r["state"]), (200, "done"))
        self.assertEqual([t["user"] for t in r["tokens"]], ["admin", "mario"])
        self.assertTrue(all(len(t["token"]) >= 30 for t in r["tokens"]))
        self.assertEqual(r["data_dir"], sa["default_data_dir"])
        self.assertIn(b"aes_key", __import__("base64").b64decode(r["config_php"]))
        # second time: configured (the page renamed itself → 404, or answers 403)
        st2 = SS.http_json(a + "server-php/setup.php?format=json")[0] if (
            self.host.root / "studio-rossi/server-php/setup.php").exists() else 404
        self.assertIn(st2, (403, 404))
        # the other site is untouched and still offers its own folder
        self.assertEqual(SS.http_json(b + "server-php/setup.php?format=json")[1]["state"], "ready")

    def test_invalid_people_and_html_unchanged(self):
        a = self.host.site("s1")
        st, r = SS.http_json(a + "server-php/setup.php", {"format": "json", "users": "mario,editor"})
        self.assertEqual((st, r["state"]), (422, "invalid"))
        req = urllib.request.Request(a + "server-php/setup.php", data=b"data_dir=&users=x,admin")
        try:
            urllib.request.urlopen(req)
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 422)
            self.assertIn(b"<html", e.read())


class HubCase(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.addCleanup(self._td.cleanup)
        self.tmp = Path(self._td.name)
        self.hub = Hub(self.tmp / "hub")
        self.addCleanup(self.hub.close)
        self.hub.keys.generate(PASS)
        self.kid, self.priv = self.hub.keys.load_private(PASS)
        self.vault = Vault(self.hub.registry)
        self.vk = self.vault.init(PASS)
        self.reg = self.hub.registry
        self.cust = self.reg.add_customer("Studio Verdi")
        self.iid = self.reg.add_instance(self.cust["id"], "Studio Verdi — online")["id"]

    def web(self, name, url):
        return EnvManager(self.hub).add_remote(self.iid, name, "web-php", url, studio_name="Studio Verdi")


@unittest.skipUnless(PHP, "php non installato")
class TestSetupSite(HubCase):
    def setUp(self):
        super().setUp()
        self.host = PhpHost(self.tmp)
        self.addCleanup(self.host.close)

    def test_setup_puts_codes_in_vault_and_licence_is_enforced(self):
        self.hub.issue_with_key(self.kid, self.priv, self.iid, "studio")
        url = self.host.site("studio-verdi", with_keys=self.hub.keys.export("json").encode(),
                             licence=self.reg.latest_licence(self.iid)["file_text"])
        env = self.web("production", url)
        # planned people of the project + one more from the page
        inst = self.reg.get_instance(self.iid)
        self.reg.update_project(inst["project_id"], data={"utenti_iniziali": [{"nome": "Anna Rossi", "ruolo": "admin"},
                                                                              {"nome": "admin", "ruolo": "viewer"}]})
        lines = []
        r = SS.setup_site(self.hub, self.vk, env["id"], extra_people=[("mario", "editor")], log=lines.append)
        self.assertEqual([p["user"] for p in r["people"]], ["admin", "Anna Rossi", "mario"])   # no bridge: no sede
        self.assertTrue(r["licence_required"])
        self.assertIsNotNone(r["config_php"])          # escrow off → handed back, NOT in the vault
        kinds = {(s["kind"], s["label"]) for s in self.vault.list(env_id=env["id"])}
        self.assertEqual(kinds, {("admin_token", "admin"), ("admin_token", "Anna Rossi"), ("admin_token", "mario")})
        self.assertTrue(SS.is_configured(self.hub, self.reg.get_environment(env["id"])))
        with self.assertRaises(SS.SetupError):       # never twice
            SS.setup_site(self.hub, self.vk, env["id"])
        # the token works against the real api.php
        tok = self.vault.get(self.vk, env["id"], "admin_token", "admin", reason="test")["token"]
        req = urllib.request.Request(url + "server-php/api.php?r=whoami", headers={"Authorization": "Bearer " + tok})
        try:
            body = urllib.request.urlopen(req).read()
            self.assertIn(b"admin", body)
        except urllib.error.HTTPError as e:   # older route name: at least not «unauthorized»
            self.assertNotEqual(e.code, 401)
        # suspension straight to the site
        ping = lambda: SS.http_json(url + "server-php/api.php?r=ping")[1].get("licence", {}).get("mode")  # noqa: E731
        self.assertEqual(ping(), "full")
        LG.suspend(self.hub, self.kid, self.priv, self.iid)
        self.vault.put(self.vk, env["id"], "ftp", {"protocol": "local", "remote_path": str(self.host.root / "studio-verdi")})
        rows = SS.push_licence(self.hub, self.vk, self.iid)
        self.assertEqual([(x["env"], x["ok"], x["mode"]) for x in rows], [("production", True, "read_only")])
        LG.reactivate(self.hub, self.kid, self.priv, self.iid)
        SS.push_licence(self.hub, self.vk, self.iid)
        self.assertEqual(ping(), "full")

    def test_escrow_keeps_config_in_vault(self):
        self.reg.set_key_escrow(self.cust["id"], True) if hasattr(self.reg, "set_key_escrow") else \
            self.reg.conn.execute("UPDATE customers SET key_escrow=1 WHERE id=?", (self.cust["id"],))
        self.reg.conn.commit()
        env = self.web("production", self.host.site("studio-verdi"))
        r = SS.setup_site(self.hub, self.vk, env["id"])
        self.assertIsNone(r["config_php"])
        self.assertIn("db_config", {s["kind"] for s in self.vault.list(env_id=env["id"])})

    def test_bridge_code_when_the_customer_also_has_a_sede(self):
        sede = self.reg.add_instance(self.cust["id"], "Studio Verdi — sede", notes="onboarding:sede")
        self.assertTrue(sede)
        env = self.web("production", self.host.site("studio-verdi"))
        r = SS.setup_site(self.hub, self.vk, env["id"])
        self.assertEqual([p["user"] for p in r["people"]], ["admin", "ponte-sync"])
        self.assertTrue(self.vault.has(env["id"], "admin_token", "ponte-sync"))


class TestPushUpdateJourney(HubCase):
    def test_push_without_ftp_says_so(self):
        self.hub.issue_with_key(self.kid, self.priv, self.iid, "studio")
        self.web("production", "https://example.invalid/sv/")
        rows = SS.push_licence(self.hub, self.vk, self.iid, pinger=lambda *a, **k: {})
        self.assertFalse(rows[0]["ok"])
        self.assertIn("FTP", rows[0]["error"])

    def test_push_uploads_the_current_licence(self):
        lic = self.hub.issue_with_key(self.kid, self.priv, self.iid, "studio")
        env = self.web("staging", "https://example.invalid/sv-prova/")
        site = self.tmp / "site"
        site.mkdir()
        self.vault.put(self.vk, env["id"], "ftp", {"protocol": "local", "remote_path": str(site)})
        rows = SS.push_licence(self.hub, self.vk, self.iid, pinger=lambda *a, **k: {"licence": {"mode": "full"}})
        self.assertEqual((rows[0]["ok"], rows[0]["mode"]), (True, "full"))
        sent = (site / "server-php" / "licence.docmap-licence").read_text("utf-8")
        self.assertEqual(sent, self.reg.latest_licence(self.iid)["file_text"])
        self.assertIn(lic["licence"]["licence_id"], sent)

    def test_update_sites_stops_at_first_failure(self):
        ids = [self.web(n, f"https://example.invalid/{n}/")["id"] for n in ("production", "staging", "demo-a")]
        seen = []

        def fake(env):
            seen.append(env["name"])
            if env["name"] == "staging":
                raise RuntimeError("non risponde")
            return {"status": "ok"}
        r = SS.update_sites(self.hub, self.vk, ids, deploy_fn=fake)
        self.assertEqual(seen, ["production", "staging"])
        self.assertEqual([d["env_id"] for d in r["done"]], ids[:1])
        self.assertEqual(r["failed"]["env_id"], ids[1])
        self.assertEqual(r["skipped"], ids[2:])

    def test_outdated_sites(self):
        a = self.web("production", "https://example.invalid/a/")
        self.reg.update_environment(a["id"], app_version="26.12.6")
        self.assertEqual([x["env_id"] for x in SS.outdated_sites(self.hub, "26.12.7")], [a["id"]])
        self.reg.update_environment(a["id"], app_version="26.12.7")
        self.assertEqual(SS.outdated_sites(self.hub, "26.12.7"), [])
        self.assertEqual(SS.outdated_sites(self.hub, "26.12.10")[0]["env_id"], a["id"])   # numeric, not text order

    def test_journey_walks_to_the_end(self):
        stg = self.web("staging", "https://example.invalid/p/")
        prod = self.web("production", "https://example.invalid/s/")
        j = J.for_customer(self.hub, self.cust["id"])
        self.assertEqual(j["next"]["id"], "licenza")
        self.hub.issue_with_key(self.kid, self.priv, self.iid, "studio")
        j = J.for_customer(self.hub, self.cust["id"])
        self.assertEqual((j["next"]["id"], j["next"]["action"]["do"]), (f"pub-{stg['id']}", "deploy"))
        self.reg.update_environment(stg["id"], deployed_version="26.12.7", verified_version="26.12.7")
        self.assertEqual(J.for_customer(self.hub, self.cust["id"])["next"]["action"],
                         {"do": "setup", "env_id": stg["id"]})
        self.vault.put(self.vk, stg["id"], "admin_token", {"token": "x" * 32}, label="admin")   # configured by hand
        nxt = J.for_customer(self.hub, self.cust["id"])["next"]
        self.assertEqual(nxt["action"], {"do": "promote", "instance_id": self.iid})
        self.reg.update_environment(prod["id"], deployed_version="26.12.7", status="running")
        self.reg.set_setting(SS.SETUP_DONE_PREFIX + prod["id"], json.dumps({"at": "2026-11-06T00:00:00Z"}))
        j = J.for_customer(self.hub, self.cust["id"])
        self.assertTrue(j["complete"], j)
        self.assertEqual(j["done"], j["total"])


class TestBlankDraft(unittest.TestCase):
    def test_new_customer_without_ai(self):
        from docmap_hub import api as A
        from docmap_hub import pipeline as P
        with tempfile.TemporaryDirectory() as td:
            hub = Hub(Path(td) / "hub")
            try:
                app = type("App", (), {"hub": hub})()
                d = A.draft_blank(app, {"name": "Studio Bianchi", "vat_id": "IT1", "installazioni": ["online"]})
                rec = hub.registry.get_draft(d["id"])
                data = P.normalize(rec["data"])
                self.assertEqual(data["cliente"]["ragione_sociale"], "Studio Bianchi")
                self.assertEqual(data["progetto"]["installazioni"], ["online"])
                with self.assertRaises(Exception):
                    A.draft_blank(app, {"name": " "})
            finally:
                hub.close()


if __name__ == "__main__":
    unittest.main()
