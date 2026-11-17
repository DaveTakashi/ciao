"""v0.11: «Sposta il sito» — new address (same hosting, other folder), data copied by the real bridge from the old
site to the new one (both real setup.php/api.php on php -S), old folder redirected, resumable, cancellable."""

import os
import sys
import unittest
import zipfile
import io
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from docmap_hub import activate as AC  # noqa: E402
from docmap_hub import move as M  # noqa: E402
from docmap_hub import packages as PK  # noqa: E402
from docmap_hub import sitesetup as SS  # noqa: E402
from docmap_hub.runner import server_python_dir  # noqa: E402
from test_v09_percorso import PHP  # noqa: E402
import test_v10_modelli as V10  # noqa: E402
from test_v10_modelli import FakeDeploy  # noqa: E402

sys.path.insert(0, str(server_python_dir(None)))
from docmap_server import sync_remote as SR  # noqa: E402


def binder(i, code):
    at = "2026-11-01T10:00:%02d.000Z" % i
    return {"type": "binder", "id": f"b-{i}", "updated_at": at,
            "data": {"id": f"b-{i}", "speaking_code": code, "company_name": f"Cliente {code} S.r.l.", "category": "IVA",
                     "short_code": "dm26Mv%04dQx" % i, "contents_items": [], "created_at": at, "updated_at": at}}


@unittest.skipUnless(PHP, "php non installato")
class TestMove(V10.TestActivateAndKit):
    def _php_url(self, folder_url: str) -> str:
        from urllib.parse import urlsplit
        return f"http://127.0.0.1:{self.host.port}{urlsplit(folder_url).path}"

    def _side(self, api_url, token):
        return SR.Side("a", {"url": api_url, "token": token}, {"id": "test", "name": "test"}, str(self.tmp))

    def _online(self, name):
        d, rep = self.create(name, "tpl-commercialista-online")
        self._point_to_php(rep)
        cid = rep["customer_id"]
        r = AC.activate_customer(self.hub, self.vk, cid, deploy_mod=FakeDeploy(self.hub, self.vk),
                                 check_fn=lambda env_id: {})
        self.assertIsNone(r["failed"], r)
        return cid, rep["envs"]["online"]["production"]

    def _setup_fn(self, env_id):
        env = self.reg.get_environment(env_id)
        u = self._php_url(env["url"])
        self.reg.update_environment(env_id, url=u, api_url=u + "server-php/api.php")
        return SS.setup_site(self.hub, self.vk, env_id)

    def _sync_fn(self, old, new):
        return M._sync(self.hub, old, dict(new, api_url=self.reg.get_environment(self.eid)["api_url"]), lambda m: None)

    def test_move_copies_data_redirects_and_makes_kit(self):
        cid, self.eid = self._online("Studio Trasloco")
        env = self.reg.get_environment(self.eid)
        tok = self.vault.get(self.vk, self.eid, "admin_token", "admin", reason="t")["token"]
        old_side = self._side(env["api_url"], tok)
        old_side.call("push", body={"records": [binder(i, f"TR{i:03d}") for i in range(1, 6)], "tombstones": [],
                                    "settings": None, "activity_log": [], "deviceId": "t", "operator": "t"})
        old_folder = Path(self.vault.get(self.vk, self.eid, "ftp", reason="t")["remote_path"])
        pv = M.preview(self.hub, self.eid, "https://docmap.pr-it.it/archivio/trasloco-2026")
        self.assertEqual(pv["url"], "https://docmap.pr-it.it/archivio/trasloco-2026/")
        self.assertTrue(pv["folder"].endswith("/archivio/trasloco-2026"))
        had_htaccess = (old_folder / ".htaccess").exists()
        (self.host.root / "archivio").mkdir()
        fake = FakeDeploy(self.hub, self.vk)
        r = M.move_site(self.hub, self.vk, self.eid, "https://docmap.pr-it.it/archivio/trasloco-2026/",
                        deploy_mod=fake, setup_fn=self._setup_fn, sync_fn=self._sync_fn)
        self.assertEqual(fake.calls, [("deploy", "production")])
        self.assertEqual(len(r["done"]), 4, r)
        # the data are on the new site, with new codes
        env2 = self.reg.get_environment(self.eid)
        tok2 = self.vault.get(self.vk, self.eid, "admin_token", "admin", reason="t")["token"]
        self.assertNotEqual(tok, tok2)
        got = self._side(env2["api_url"], tok2).call("pull", query={"since": "0"})
        ids = {x.get("id") for x in got.get("records") or got.get("items") or []}
        self.assertTrue({f"b-{i}" for i in range(1, 6)} <= ids, got)
        # the old folder redirects every path (QR included) to the new address; the old .htaccess is kept
        ht = (old_folder / ".htaccess").read_text("utf-8")
        self.assertIn("RedirectMatch 301 ^/studio\\-trasloco/(.*)$ https://docmap.pr-it.it/archivio/trasloco-2026/$1", ht)
        self.assertEqual((old_folder / M.HTACCESS_KEEP).exists(), had_htaccess)
        self.assertIsNone(M.state(self.reg, self.eid))
        self.assertEqual(self.reg.get_environment(self.eid)["settings"]["base_path"], "/archivio/trasloco-2026/")
        # kit with the new codes and the new config.php
        _n, data = AC.build_kit(self.hub, self.vk, cid, r["configs"], fetch=False)
        z = zipfile.ZipFile(io.BytesIO(data))
        self.assertIn("config/sito-vero-config.php", z.namelist())
        self.assertIn(tok2, z.read("2-scheda-tecnica.html").decode())

    def test_refuses_bad_or_taken_addresses(self):
        _cid, eid = self._online("Studio Fermo")
        _cid2, eid2 = self._online("Studio Altro")
        for bad in ("http://docmap.pr-it.it/x/", "https://docmap.pr-it.it/a b/", "https://docmap.pr-it.it/../x/"):
            with self.assertRaises(M.MoveError):
                M.preview(self.hub, eid, bad)
        other = self.reg.get_environment(eid2)["url"]
        with self.assertRaises(M.MoveError):
            M.preview(self.hub, eid, other)
        with self.assertRaises(M.MoveError):     # not under the default hosting → needs another FTP
            M.preview(self.hub, eid, "https://docmap.it/studio-fermo/")
        pv = M.preview(self.hub, eid, "https://docmap.it/studio-fermo/", "cliente", "/public_html/studio-fermo/")
        self.assertEqual(pv["folder"], "/public_html/studio-fermo/")

    def test_failure_keeps_state_and_cancel_goes_back(self):
        cid, self.eid = self._online("Studio Ritorno")
        before = self.reg.get_environment(self.eid)
        tok = self.vault.get(self.vk, self.eid, "admin_token", "admin", reason="t")["token"]
        people = {s["label"] for s in self.vault.list(env_id=self.eid) if s["kind"] == "admin_token"}

        def bad_setup(env_id):
            raise SS.SetupError("setup.php non risponde")
        with self.assertRaises(SS.SetupError):
            M.move_site(self.hub, self.vk, self.eid, "https://docmap.pr-it.it/ritorno-nuovo/",
                        deploy_mod=FakeDeploy(self.hub, self.vk), setup_fn=bad_setup, sync_fn=self._sync_fn)
        st = M.state(self.reg, self.eid)
        self.assertEqual(st["steps"], ["deploy"])
        with self.assertRaises(M.MoveError):     # another address while one move is open
            M.move_site(self.hub, self.vk, self.eid, "https://docmap.pr-it.it/altro/", deploy_mod=FakeDeploy(self.hub, self.vk))
        M.cancel(self.hub, self.vk, self.eid)
        after = self.reg.get_environment(self.eid)
        self.assertEqual(after["url"], before["url"])
        self.assertEqual(self.vault.get(self.vk, self.eid, "admin_token", "admin", reason="t")["token"], tok)
        self.assertEqual({s["label"] for s in self.vault.list(env_id=self.eid) if s["kind"] == "admin_token"}, people)
        self.assertTrue(SS.is_configured(self.hub, after))
        self.assertIsNone(M.state(self.reg, self.eid))


class TestReadyPackage(V10.TestActivateAndKit):
    def test_sede_package_gets_bridge_code_in_memory_only(self):
        d, rep = self.create("Studio Pacchetto", "tpl-commercialista-sede-online")
        cid = rep["customer_id"]
        pdir = PK.client_dir(self.hub, cid) / "sede"
        pdir.mkdir(parents=True, exist_ok=True)
        src = pdir / "DocMap-studio-pacchetto-sede.zip"
        with zipfile.ZipFile(src, "w") as z:
            z.writestr("DocMap-studio-pacchetto-sede/installa.bat", "@echo off\r\n")
            z.writestr("DocMap-studio-pacchetto-sede/cliente/cliente.json", "{}")
        eid = rep["envs"]["online"]["production"]
        self.vault.put(self.vk, eid, "admin_token", {"user": SS.BRIDGE_USER, "role": "editor", "token": "tok-ponte-123"},
                       label=SS.BRIDGE_USER)
        name, data, has = PK.sede_ready_zip(self.hub, self.vk, cid)
        self.assertTrue(has)
        z = zipfile.ZipFile(io.BytesIO(data))
        self.assertEqual(z.read("DocMap-studio-pacchetto-sede/cliente/token-ponte.txt").decode().strip(), "tok-ponte-123")
        self.assertIn("-NonChiedere", z.read("DocMap-studio-pacchetto-sede/INSTALLA-SENZA-DOMANDE.bat").decode())
        self.assertNotIn(b"tok-ponte-123", src.read_bytes())          # never on the hub disk
        _n, data2, has2 = PK.sede_ready_zip(self.hub, None, cid)       # vault closed: plain package
        self.assertFalse(has2)

    def test_workstation_opens_the_online_site(self):
        d, rep = self.create("Studio Postazioni", "tpl-commercialista-online")
        p = self.reg.list_projects(rep["customer_id"])[0]
        w = self.reg.add_workstation(p["id"], "PC Luigi")
        name, data = PK.workstation_zip(self.hub, w["id"])
        z = zipfile.ZipFile(io.BytesIO(data))
        cfg = [n for n in z.namelist() if n.endswith("postazione.json")][0]
        import json
        c = json.loads(z.read(cfg))
        self.assertTrue(c["indirizzo_online"].startswith("https://docmap.pr-it.it/studio-postazioni/"))
        leggimi = z.read([n for n in z.namelist() if n.endswith("LEGGIMI.txt")][0]).decode()
        self.assertIn("anche se il PC server dello studio e spento", leggimi)


if __name__ == "__main__":
    unittest.main()


# The base class's own tests run in test_v10_modelli; here only the new ones.
for _cls in (TestMove, TestReadyPackage):
    for _n in dir(V10.TestActivateAndKit):
        if _n.startswith("test") and _n not in _cls.__dict__:
            setattr(_cls, _n, None)
