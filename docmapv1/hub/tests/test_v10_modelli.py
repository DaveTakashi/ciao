"""Hub 0.10: a new customer in a few clicks.

* «Modelli cliente»: ten built-in templates (seeded once), create / save / delete / restore, the customer identity
  never enters a template, the site address follows the customer's name;
* «Hosting predefinito»: one FTP for the sites on Dave's own hosting, the password encrypted with the vault key
  (and re-encrypted when the vault passphrase changes); a customer can still have his own FTP, and his demo another;
* a draft from a template → onboarding: FTP access of each site in the vault with its own folder;
* two customers can never get the same site address;
* «Attiva tutto» does the missing online steps in order, only on empty folders, stops at the first error;
* «Kit di consegna»: one zip with a welcome letter per person, the technician's sheet and the config.php copies.
The set-up step runs the real setup.php with ``php -S`` when PHP is installed."""

import base64
import io
import json
import os
import shutil
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from docmap_hub import activate as AC
from docmap_hub import api as A
from docmap_hub import hosting as H
from docmap_hub import pipeline as P
from docmap_hub import sitesetup as SS
from docmap_hub import templates as T
from docmap_hub.onboarding import Onboarding
from docmap_hub.registry import MIGRATIONS
from docmap_hub.service import Hub
from docmap_hub.vault import Vault
from test_v04_manager import PASS
from test_v09_percorso import PHP, PhpHost

HOST = {"base_url": "https://docmap.pr-it.it", "protocol": "ftps", "host": "ftp.pr-it.it", "user": "docmap@pr-it.it",
        "password": "segreta-dell-hosting", "base_folder": "/"}


class Case(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.addCleanup(self._td.cleanup)
        self.tmp = Path(self._td.name)
        self.hub = Hub(self.tmp / "hub")
        self.addCleanup(self.hub.close)
        self.reg = self.hub.registry
        self.hub.keys.generate(PASS)
        self.key = self.hub.keys.load_private(PASS)
        self.vault = Vault(self.reg)
        self.vk = self.vault.init(PASS)

    def create(self, name, tpl, vat="", **over):
        """Template → draft → onboarding (what «Crea il cliente» does), without building packages."""
        d = T.apply(self.hub, tpl, name, vat)
        for path, v in over.items():
            node = d
            ks = path.split(".")
            for k in ks[:-1]:
                node = node[k]
            node[ks[-1]] = v
        d = P.normalize(d)
        chk = P.validate(self.hub, d)
        self.assertEqual(chk["errors"], [], chk)
        acc = H.ftp_access(self.reg, self.vk, d["online"]["ftp"]["cartella"]) if d["online"]["ftp"]["modo"] == "dominio" \
            and "online" in d["progetto"]["installazioni"] else None
        req = P.to_request(d, over.get("_pw"), hosting_access=acc, ftp_staging_password="pw-demo")
        rep = Onboarding(self.hub, log=lambda *_: None).run(req, key=self.key, vk=self.vk, build=False)
        P.apply_extras(self.hub, d, rep, "test")
        return d, rep


class TestTemplates(Case):
    def test_seeded_once_and_editable(self):
        ts = T.list_templates(self.reg)
        self.assertEqual(len(ts), 10)
        self.assertEqual(sum(t["default"] for t in ts), 1)
        self.assertTrue(all(t["data"]["cliente"]["ragione_sociale"] == "" for t in ts))
        plans = {t["summary"]["piano"] for t in ts}
        self.assertTrue(plans <= set(self.hub.plans), plans)
        T.delete(self.reg, ts[0]["id"])
        self.assertEqual(len(T.list_templates(self.reg)), 9)          # not re-seeded behind Dave's back
        self.assertEqual(T.restore_builtins(self.reg), 1)
        self.assertEqual(T.restore_builtins(self.reg), 0)             # never duplicates
        with self.assertRaises(T.TemplateError):
            T.create(self.reg, ts[1]["name"], ts[1]["data"])          # unique names

    def test_schema_migration_is_additive(self):
        self.assertEqual(MIGRATIONS[-1][0], 4)
        self.assertEqual(self.reg.schema_version(), 4)
        cols = [r[1] for r in self.reg.conn.execute("PRAGMA table_info(customer_templates)")]
        self.assertIn("json", cols)

    def test_apply_without_hosting_asks_for_it(self):
        d = T.apply(self.hub, "tpl-commercialista-online", "Studio Neri S.r.l.", "01234567890")
        errs = {e["path"] for e in P.validate(self.hub, d)["errors"]}
        self.assertIn("online.ftp.modo", errs)

    def test_apply_with_hosting_fills_everything(self):
        H.set_default(self.reg, self.vk, HOST)
        d = T.apply(self.hub, "tpl-commercialista-online-demo", "Studio Neri S.r.l.", "01234567890")
        self.assertEqual(d["online"]["indirizzo"], "https://docmap.pr-it.it/studio-neri/")
        self.assertEqual(d["online"]["staging"], "https://docmap.pr-it.it/studio-neri-demo/")
        self.assertEqual((d["online"]["ftp"]["cartella"], d["online"]["ftp"]["cartella_staging"]),
                         ("/studio-neri/", "/studio-neri-demo/"))
        self.assertEqual(d["progetto"]["nome_studio"], "Studio Neri S.r.l.")
        self.assertEqual(d["progetto"]["modello"], "Commercialista · online con demo")
        self.assertEqual(P.validate(self.hub, d)["errors"], [])
        self.assertEqual(P.needs_ftp_password(d), {"ftp": False, "ftp_staging": False})   # nothing to type

    def test_save_from_draft_keeps_no_identity(self):
        H.set_default(self.reg, self.vk, HOST)
        d = T.apply(self.hub, "tpl-commercialista-online", "Studio Neri", "01234567890")
        d["cliente"]["email"] = "neri@example.invalid"
        d["licenza"]["piano"] = "studio_pro"
        d["utenti_iniziali"].append({"nome": "magazzino", "email": "", "ruolo": "viewer"})
        t = T.create(self.reg, "Il mio modello", d, "prova")
        txt = json.dumps(t["data"])
        for leak in ("Studio Neri", "studio-neri", "01234567890", "neri@example.invalid"):
            self.assertNotIn(leak, txt)
        self.assertEqual(t["data"]["online"]["indirizzo"], "{sito}")
        d2 = T.apply(self.hub, t["id"], "Studio Bruni", "")
        self.assertEqual(d2["online"]["indirizzo"], "https://docmap.pr-it.it/studio-bruni/")
        self.assertEqual(d2["licenza"]["piano"], "studio_pro")
        self.assertIn("magazzino", [u["nome"] for u in d2["utenti_iniziali"]])
        T.save(self.reg, t["id"], data=dict(d2, licenza={"piano": "studio", "mesi": 6, "limiti": {}}))
        self.assertEqual(T.get(self.reg, t["id"])["data"]["licenza"]["mesi"], 6)

    def test_web_slug(self):
        self.assertEqual(T.web_slug("Studio Rossi & Associati S.r.l."), "studio-rossi-associati")
        self.assertEqual(T.web_slug("Alfa S.p.A."), "alfa")
        self.assertEqual(T.web_slug("S.r.l."), "s-r-l")         # only a legal form: keep the name

    def test_api_blank_with_template(self):
        H.set_default(self.reg, self.vk, HOST)
        app = type("App", (), {"hub": self.hub, "vault_key": self.vk})()
        v = A.draft_blank(app, {"name": "Studio Gialli", "template": "tpl-prova-gratuita"})
        self.assertEqual(v["data"]["licenza"]["piano"], "trial")
        self.assertEqual(v["data"]["cliente"]["stato"], "prospect")
        self.assertEqual(v["check"]["errors"], [])
        self.assertIn("passwords", v)
        view = A.templates_view(app)
        self.assertEqual(len(view["templates"]), 10)
        self.assertTrue(view["hosting"]["has_password"])


class TestHosting(Case):
    def test_password_encrypted_and_reencrypted(self):
        with self.assertRaises(Exception):
            H.set_default(self.reg, None, HOST)          # a password needs the vault
        H.set_default(self.reg, self.vk, HOST)
        raw = self.reg.get_setting(H.KEY)
        self.assertNotIn("segreta", raw)
        self.assertEqual(H.ftp_access(self.reg, self.vk, "/x/")["password"], "segreta-dell-hosting")
        H.set_default(self.reg, None, {"user": "altro@pr-it.it"})          # no password = keep it
        self.assertEqual(H.ftp_access(self.reg, self.vk, "/x/")["user"], "altro@pr-it.it")
        self.vault.change_passphrase(PASS, PASS + "-nuova")
        vk2 = self.vault.unlock(PASS + "-nuova")
        self.assertEqual(H.ftp_access(self.reg, vk2, "/x/")["password"], "segreta-dell-hosting")
        self.assertFalse(any("segreta" in (e[0] or "") for e in self.reg.conn.execute(
            "SELECT details_json FROM events").fetchall()))

    def test_suffix_and_url_checks(self):
        with self.assertRaises(H.HostingError):
            H.set_default(self.reg, self.vk, dict(HOST, base_url="http://x.it/"))
        with self.assertRaises(H.HostingError):
            H.set_default(self.reg, self.vk, dict(HOST, staging_suffix="demo"))
        H.set_default(self.reg, self.vk, dict(HOST, staging_suffix="-prova", base_folder="public_html"))
        s = H.site_for(self.reg, "studio-x", staging=True)
        self.assertEqual(s["cartella_staging"], "/public_html/studio-x-prova/")


class TestOnboardingFromTemplate(Case):
    def test_domain_ftp_goes_to_each_site_with_its_folder(self):
        H.set_default(self.reg, self.vk, HOST)
        d, rep = self.create("Studio Neri", "tpl-commercialista-online-demo")
        envs = rep["envs"]["online"]
        prod = self.vault.get(self.vk, envs["production"], "ftp", reason="t")
        stg = self.vault.get(self.vk, envs["staging"], "ftp", reason="t")
        self.assertEqual((prod["host"], prod["remote_path"], prod["password"]),
                         ("ftp.pr-it.it", "/studio-neri/", "segreta-dell-hosting"))
        self.assertEqual(stg["remote_path"], "/studio-neri-demo/")
        self.assertEqual(self.reg.get_environment(envs["staging"])["url"], "https://docmap.pr-it.it/studio-neri-demo/")
        # the project keeps the people of the template: they get their codes when the site is configured
        cust = self.reg.get_customer(rep["customer_id"])
        inst = self.reg.get_instance(rep["instances"]["online"])
        self.assertEqual([u["nome"] for u in self.reg.get_project(inst["project_id"])["data"]["utenti_iniziali"]],
                         ["titolare", "segreteria"])
        self.assertEqual(json.loads(cust["extra_json"])["tags"], ["commercialista"])

    def test_same_name_never_shares_a_site(self):
        H.set_default(self.reg, self.vk, HOST)
        self.create("Studio Neri", "tpl-commercialista-online")
        d = T.apply(self.hub, "tpl-commercialista-online", "Studio Neri S.r.l.", "99999999999")
        self.assertEqual(d["online"]["indirizzo"], "https://docmap.pr-it.it/studio-neri-2/")   # free folder
        d["online"]["indirizzo"] = "https://docmap.pr-it.it/studio-neri/"                         # forced by hand
        errs = [e["msg"] for e in P.validate(self.hub, d)["errors"] if e["path"] == "online.indirizzo"]
        self.assertTrue(errs and "Studio Neri" in errs[0], errs)

    def test_own_ftp_and_other_ftp_for_the_demo(self):
        d = T.apply(self.hub, "tpl-commercialista-online-demo", "Studio Viola", "")
        d["online"].update(indirizzo="https://archivio.studioviola.it/", staging="https://prova.studioviola.it/")
        d["online"]["ftp"].update(modo="cliente", host="ftp.studioviola.it", utente="viola", cartella="/www/",
                                  cartella_staging="/prova/")
        d["online"]["ftp_staging"].update(host="ftp.altro.it", utente="viola-demo")
        d = P.normalize(d)
        self.assertEqual(P.validate(self.hub, d)["errors"], [])
        self.assertEqual(P.needs_ftp_password(d), {"ftp": True, "ftp_staging": True})
        req = P.to_request(d, "pw-sito", ftp_staging_password="pw-demo")
        rep = Onboarding(self.hub, log=lambda *_: None).run(req, key=self.key, vk=self.vk, build=False)
        envs = rep["envs"]["online"]
        prod = self.vault.get(self.vk, envs["production"], "ftp", reason="t")
        stg = self.vault.get(self.vk, envs["staging"], "ftp", reason="t")
        self.assertEqual((prod["host"], prod["password"]), ("ftp.studioviola.it", "pw-sito"))
        self.assertEqual((stg["host"], stg["user"], stg["password"], stg["remote_path"]),
                         ("ftp.altro.it", "viola-demo", "pw-demo", "/prova/"))

    def test_old_drafts_still_work(self):
        d = P.normalize(P.EXAMPLE)          # an AI draft from 0.5-0.9: own FTP with host
        self.assertEqual(d["online"]["ftp"]["modo"], "cliente")
        d2 = P.normalize({"cliente": {"ragione_sociale": "X"}, "progetto": {"installazioni": ["online"]},
                          "online": {"indirizzo": "https://x.it/"}})
        self.assertEqual(d2["online"]["ftp"]["modo"], "nessuno")


class FakeDeploy:
    """Stands in for deploy.py: «publishes» setup.php/api.php into the local folder of the site."""

    def __init__(self, hub, vk, existing=None):
        self.hub, self.vk, self.calls, self.existing = hub, vk, [], existing or set()

    class Build:
        def cleanup(self):
            pass

    def build_for(self, hub, env):
        return self.Build()

    def _folder(self, env):
        return Path(Vault(self.hub.registry).get(self.vk, env["id"], "ftp", reason="t")["remote_path"])

    def deploy(self, hub, vk, instance, env_name, *, dry_run=False, build=None, log=None, **kw):
        env = hub.registry.get_environment(instance, env_name)
        if dry_run:
            return {"remote_version": "26.12.6" if env_name in self.existing else None}
        self.calls.append(("deploy", env_name))
        sp = self._folder(env) / "server-php"
        sp.mkdir(parents=True, exist_ok=True)
        docmap = Path(__file__).resolve().parents[2]
        for f in ("setup.php", "api.php"):
            shutil.copy(docmap / "server-php" / f, sp / f)
        fields = {"deployed_version": "26.12.7", "app_version": "26.12.7", "status": "running"}
        if env_name == "staging":
            fields.update(verified_version="26.12.7", verified_code_hash="x")
        hub.registry.update_environment(env["id"], **fields)
        return {"status": "ok"}

    def promote(self, hub, vk, instance, build=None, log=None, **kw):
        r = self.deploy(hub, vk, instance, "production", build=build, log=log)
        self.calls[-1] = ("promote", "production")
        return r


@unittest.skipUnless(PHP, "php non installato")
class TestActivateAndKit(Case):
    def setUp(self):
        super().setUp()
        self.host = PhpHost(self.tmp)
        self.addCleanup(self.host.close)
        H.set_default(self.reg, self.vk, {"base_url": "https://docmap.pr-it.it/", "protocol": "local",
                                          "base_folder": str(self.host.root)})

    def _point_to_php(self, rep):
        """The sites answer on the local php -S (the registry keeps https in production)."""
        for name, eid in rep["envs"]["online"].items():
            env = self.reg.get_environment(eid)
            slug = env["url"].rstrip("/").rsplit("/", 1)[1]
            url = f"http://127.0.0.1:{self.host.port}/{slug}/"
            self.reg.update_environment(eid, url=url, api_url=url + "server-php/api.php")

    def test_activate_in_order_then_one_kit(self):
        d, rep = self.create("Studio Neri", "tpl-commercialista-online-demo")
        self._point_to_php(rep)
        cid = rep["customer_id"]
        labels = [s["do"] for s in AC.plan(self.hub, cid)]
        self.assertEqual(labels, ["deploy", "setup", "deploy", "setup", "check"])
        fake = FakeDeploy(self.hub, self.vk)
        r = AC.activate_customer(self.hub, self.vk, cid, deploy_mod=fake, check_fn=lambda: {})
        self.assertIsNone(r["failed"], r)
        self.assertEqual(fake.calls, [("deploy", "staging"), ("promote", "production")])   # the verified version
        self.assertEqual(set(r["configs"]), {"staging", "production"})                      # no escrow → handed back
        self.assertEqual(r["people"]["production"], ["admin", "titolare", "segreteria"])
        self.assertEqual(AC.plan(self.hub, cid), [])
        # one data folder per site (the 0.9 fix, now with the template's folders)
        dirs = {json.loads(self.reg.get_setting(SS.SETUP_DONE_PREFIX + e))["data_dir"] for e in rep["envs"]["online"].values()}
        self.assertEqual(len(dirs), 2)
        name, data = AC.build_kit(self.hub, self.vk, cid, r["configs"])
        z = zipfile.ZipFile(io.BytesIO(data))
        names = set(z.namelist())
        self.assertTrue({"LEGGIMI.txt", "1-lettere-di-benvenuto.html", "2-scheda-tecnica.html",
                         "config/sito-vero-config.php", "config/demo-config.php"} <= names, names)
        letters = z.read("1-lettere-di-benvenuto.html").decode()
        tok = self.vault.get(self.vk, rep["envs"]["online"]["production"], "admin_token", "titolare", reason="t")["token"]
        self.assertIn(tok, letters)
        self.assertEqual(letters.count('class="p"'), 2)      # titolare, segreteria (not admin / ponte-sync)
        self.assertIn(b"aes_key", z.read("config/sito-vero-config.php"))
        self.assertFalse(list((self.tmp / "hub").rglob("*kit*.zip")))   # never written to disk by the hub

    def test_never_overwrites_a_folder_with_docmap(self):
        d, rep = self.create("Studio Rosa", "tpl-commercialista-online")
        self._point_to_php(rep)
        fake = FakeDeploy(self.hub, self.vk, existing={"production"})
        r = AC.activate_customer(self.hub, self.vk, rep["customer_id"], deploy_mod=fake, check_fn=lambda: {})
        self.assertIn("già DocMap", r["failed"]["error"])
        self.assertEqual(fake.calls, [])
        self.assertEqual(r["done"], [])

    def test_stops_at_first_failure(self):
        d, rep = self.create("Studio Blu", "tpl-commercialista-online-demo")
        self._point_to_php(rep)
        fake = FakeDeploy(self.hub, self.vk)

        def bad_setup(env_id):
            raise SS.SetupError("setup.php non risponde")
        r = AC.activate_customer(self.hub, self.vk, rep["customer_id"], deploy_mod=fake, setup_fn=bad_setup,
                                 check_fn=lambda: {})
        self.assertEqual(r["done"], ["Pubblica il sito demo"])
        self.assertIn("setup.php", r["failed"]["error"])
        self.assertEqual(fake.calls, [("deploy", "staging")])   # production untouched

    def test_missing_ftp_is_said_before_anything(self):
        d = T.apply(self.hub, "tpl-commercialista-online", "Studio Grigio", "")
        d["online"]["ftp"]["modo"] = "nessuno"
        d = P.normalize(d)
        rep = Onboarding(self.hub, log=lambda *_: None).run(P.to_request(d, None), key=self.key, vk=self.vk, build=False)
        with self.assertRaises(AC.ActivateError):
            AC.activate_customer(self.hub, self.vk, rep["customer_id"], deploy_mod=FakeDeploy(self.hub, self.vk))


if __name__ == "__main__":
    unittest.main()
