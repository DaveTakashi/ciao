"""v0.3: 'cliente nuovo' end to end in a temp hub dir.

keys + vault → cliente nuovo (sede + online with staging, FTP 'local' transport) → per-client installer package
(trusted_keys.json + licence + sync template + client data), web deploy folders/zips, printable client sheet;
the PACKAGED server (installer-windows layout, real `python -m docmap_server`) installs the licence and reports it
`full`; the sheet contains no secret; a second run creates nothing new; --rigenera moves the old packages to _trash;
sede-only / online-only variants; validation errors; bridge token in the vault + export; sheet WITH secrets only on
request (0600); the web page form runs the same wizard as a job.
"""

import io
import json
import os
import re
import stat
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.dont_write_bytecode = True

from docmap_hub import cli
from docmap_hub.onboarding import ClienteNuovo, Onboarding, OnboardingError, scheda_html
from docmap_hub.runner import DOCMAPV1
from docmap_hub.service import Hub
from docmap_hub.vault import Vault

PASS = "una-passphrase-lunga"
FTP_PW = "Ftp-Segreta-987"
BRIDGE = "TokenPonteSegreto_abc123"
SERVER_PY = DOCMAPV1 / "server-python"
INSTALLER = DOCMAPV1 / "installer-windows"

try:
    import cryptography  # noqa: F401
    HAVE_CRYPTO = True
except ImportError:
    HAVE_CRYPTO = False


def run_cli(hub_dir, *args, env=None):
    old = dict(os.environ)
    os.environ.update({"DOCMAP_HUB_PASSPHRASE": PASS, "DOCMAP_HUB_FTP_PASSWORD": FTP_PW})
    os.environ.update(env or {})
    o, e = io.StringIO(), io.StringIO()
    try:
        with redirect_stdout(o), redirect_stderr(e):
            rc = cli.main(["--dir", str(hub_dir)] + list(args))
    finally:
        os.environ.clear()
        os.environ.update(old)
    return rc, o.getvalue(), e.getvalue()


@unittest.skipUnless(HAVE_CRYPTO and (INSTALLER / "docmap_tools.py").is_file() and (DOCMAPV1 / "tools" / "build_deploy.py").is_file(),
                     "servono cryptography, installer-windows e tools/build_deploy.py")
class TestClienteNuovo(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._td = tempfile.TemporaryDirectory(prefix="dm-hub-onb-")
        cls.tmp = Path(cls._td.name)
        cls.hub_dir = cls.tmp / "hub"
        with Hub(cls.hub_dir) as h:
            h.keys.generate(PASS)
            Vault(h.registry).init(PASS)
        cls.remote = cls.tmp / "hosting" / "studio-rossi"
        cls.remote_st = cls.tmp / "hosting" / "studio-rossi-prova"
        cls.remote.mkdir(parents=True)
        cls.remote_st.mkdir(parents=True)
        cls.args = ["cliente", "nuovo", "--nome", "Studio Rossi", "--piva", "IT 01234567890", "--email", "info@rossi.example",
                    "--piano", "studio", "--installazioni", "entrambe",
                    "--url-online", "https://docmap.pr-it.it/studio-rossi/",
                    "--url-staging", "https://docmap.pr-it.it/studio-rossi-prova/",
                    "--ftp-protocollo", "local", "--ftp-cartella", str(cls.remote),
                    "--ftp-cartella-staging", str(cls.remote_st)]
        rc, cls.out1, err = run_cli(cls.hub_dir, *cls.args)
        assert rc == 0, cls.out1 + err
        cls.cdir = cls.hub_dir / "clienti" / "studio-rossi"
        cls.man = json.loads((cls.cdir / "cliente.json").read_text("utf-8"))

    @classmethod
    def tearDownClass(cls):
        cls._td.cleanup()

    def hub(self):
        h = Hub(self.hub_dir)
        self.addCleanup(h.close)
        return h

    # -- registry ----------------------------------------------------------
    def test_registry_objects(self):
        h = self.hub()
        custs = h.registry.list_customers()
        self.assertEqual([c["name"] for c in custs], ["Studio Rossi"])
        insts = h.registry.list_instances()
        self.assertEqual(sorted(i["kind"] for i in insts), ["cloud", "onprem"])
        envs = {(e["instance_id"], e["name"]): e for e in h.registry.list_environments()}
        self.assertEqual(len(envs), 3)
        on = self.man["installazioni"]["online"]
        prod, st = envs[(on, "production")], envs[(on, "staging")]
        self.assertEqual(prod["settings"]["base_path"], "/studio-rossi/")
        self.assertEqual(prod["settings"]["domain"], "https://docmap.pr-it.it")
        self.assertEqual(prod["api_url"], "https://docmap.pr-it.it/studio-rossi/server-php/api.php")
        self.assertEqual(st["settings"]["slug"], "studio-rossi-prova")
        self.assertEqual(envs[(self.man["installazioni"]["sede"], "production")]["kind"], "studio-python")
        v = Vault(h.registry)
        vk = v.unlock(PASS)
        self.assertEqual(v.get(vk, prod["id"], "ftp", reason="test")["remote_path"], str(self.remote))
        self.assertEqual(v.get(vk, st["id"], "ftp", reason="test")["remote_path"], str(self.remote_st))
        self.assertEqual(len(h.registry.list_licences()), 2)

    # -- installer package --------------------------------------------------
    def test_installer_package(self):
        zp = Path(self.man["file"]["pacchetto_sede_zip"])
        self.assertTrue(zp.is_file())
        with zipfile.ZipFile(zp) as z:
            names = set(z.namelist())
            for n in ("installa.bat", "configura-sync.ps1", "server/docmap_server/trusted_keys.json",
                      "cliente/licence.docmap-licence", "cliente/sync-profile.template.json", "cliente/cliente.json"):
                self.assertIn(n, names)
            info = json.loads(z.read("cliente/cliente.json"))
            tpl = json.loads(z.read("cliente/sync-profile.template.json"))
            tk = json.loads(z.read("server/docmap_server/trusted_keys.json"))
            blob = b"".join(z.read(n) for n in names if n.startswith("cliente/") or n.endswith(".json"))
        self.assertEqual(info["nome_studio"], "Studio Rossi")
        self.assertEqual(info["instance_id"], self.man["installazioni"]["sede"])
        self.assertTrue(info["licenza"]["verificata"])
        self.assertEqual(tpl["a"]["url"], "https://docmap.pr-it.it/studio-rossi/server-php/api.php")
        h = self.hub()
        self.assertEqual(set(tk["keys"]), set(h.keys.public_keys()))
        for secret in (FTP_PW.encode(), PASS.encode(), b"PRIVATE KEY"):
            self.assertNotIn(secret, blob)
        if (DOCMAPV1 / "docs" / "GUIDA-NUOVO-CLIENTE.md").is_file():
            self.assertIn("GUIDA-NUOVO-CLIENTE.md", names)

    def test_packaged_server_verifies_licence_full(self):
        """Like installa.ps1: C:\\DocMap from the package, setup, licence install, abilita-licenza → full."""
        work = Path(tempfile.mkdtemp(dir=self.tmp, prefix="studio-pc-"))
        with zipfile.ZipFile(self.man["file"]["pacchetto_sede_zip"]) as z:
            z.extractall(work / "pkg")
        base = work / "DocMap"
        (base / "config").mkdir(parents=True)
        (base / "dati").mkdir()
        import shutil
        shutil.copytree(work / "pkg" / "server", base / "server")
        cfg = base / "config" / "config.json"
        env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
        r = subprocess.run([sys.executable, "-m", "docmap_server", "setup", "--config", str(cfg), "--data-dir", str(base / "dati"),
                            "--user", "davide,admin", "--studio-name", "Studio Rossi"], cwd=base / "server",
                           capture_output=True, text=True, env=env)
        self.assertEqual(r.returncode, 0, r.stderr)
        lic = work / "pkg" / "cliente" / "licence.docmap-licence"
        r = subprocess.run([sys.executable, "-m", "docmap_server", "licence", "install", str(lic), "--config", str(cfg)],
                           cwd=base / "server", capture_output=True, text=True, env=env)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("(full)", r.stdout)
        r = subprocess.run([sys.executable, str(work / "pkg" / "docmap_tools.py"), "--base", str(base), "abilita-licenza"],
                           capture_output=True, text=True, env=env)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIs(json.loads(cfg.read_text("utf-8"))["licence_required"], True)
        r = subprocess.run([sys.executable, "-m", "docmap_server", "licence", "status", "--config", str(cfg)],
                           cwd=base / "server", capture_output=True, text=True, env=env)
        self.assertIn("(full)", r.stdout)
        self.assertNotIn("DISATTIVATO", r.stdout)
        self.assertEqual(json.loads((base / "dati" / "instance.json").read_text())["instance_id"], self.man["installazioni"]["sede"])
        # the generic server (no trusted_keys.json) would NOT accept it: the key really comes from the package file
        (base / "server" / "docmap_server" / "trusted_keys.json").rename(work / "moved-trusted.json")
        r = subprocess.run([sys.executable, "-m", "docmap_server", "licence", "status", "--config", str(cfg)],
                           cwd=base / "server", capture_output=True, text=True, env=env)
        self.assertIn("(invalid)", r.stdout)

    # -- web deploy ---------------------------------------------------------
    def test_web_deploy_folders(self):
        for name, base_path in (("production", "/studio-rossi/"), ("staging", "/studio-rossi-prova/")):
            site = Path(self.man["file"][f"sito_{name}"])
            self.assertTrue((site / "server-php" / "api.php").is_file())
            self.assertTrue((site / "server-php" / "setup.php").is_file())
            self.assertFalse((site / "server-php" / "config.php").exists())
            js = (site / "docmap.config.js").read_text("utf-8")
            self.assertIn(base_path, js)
            self.assertIn("Studio Rossi", js)
            self.assertTrue(Path(self.man["file"][f"sito_{name}_zip"]).is_file())

    def test_deploy_dry_run_uses_wizard_settings(self):
        rc, out, err = run_cli(self.hub_dir, "deploy", "--instance", self.man["installazioni"]["online"], "--env", "staging",
                               "--dry-run")
        self.assertEqual(rc, 0, out + err)
        self.assertIn("Prova (dry-run)", out)
        self.assertIn("da pubblicare", out)
        self.assertFalse(self.remote_st.exists() and any(self.remote_st.rglob("*.php")), "dry-run uploads nothing")

    # -- client sheet -------------------------------------------------------
    def test_sheet_has_no_secrets_and_no_external_assets(self):
        html_ = (self.cdir / "scheda-cliente.html").read_text("utf-8")
        for s in (FTP_PW, PASS, BRIDGE):
            self.assertNotIn(s, html_)
        self.assertNotRegex(html_, r"<(script|link|img|iframe)\b")
        self.assertNotRegex(html_, r"(src|href)\s*=")
        self.assertNotIn("@import", html_)
        for needle in ("Studio Rossi", "IT 01234567890", self.man["installazioni"]["sede"], self.man["installazioni"]["online"],
                       "https://docmap.pr-it.it/studio-rossi/", "Kit di emergenza", "ponte-sync", "Prossimi passi", "studio"):
            self.assertIn(needle, html_)

    # -- idempotence ---------------------------------------------------------
    def test_rerun_is_idempotent_then_rigenera(self):
        zp = Path(self.man["file"]["pacchetto_sede_zip"])
        mtime = zp.stat().st_mtime_ns
        h = self.hub()
        n_ev = len(h.registry.events(10000))
        rc, out, err = run_cli(self.hub_dir, *self.args)
        self.assertEqual(rc, 0, out + err)
        self.assertNotIn("  + ", out.split("Codici")[0])
        self.assertIn("già presente", out)
        h2 = self.hub()
        self.assertEqual(len(h2.registry.list_customers()), 1)
        self.assertEqual(len(h2.registry.list_instances()), 2)
        self.assertEqual(len(h2.registry.list_environments()), 3)
        self.assertEqual(len(h2.registry.list_licences()), 2)
        self.assertEqual(zp.stat().st_mtime_ns, mtime)
        # same customer found by VAT even with another spelling of the name
        rc, out, err = run_cli(self.hub_dir, "cliente", "nuovo", "--nome", "STUDIO ROSSI srl", "--piva", "IT01234567890",
                               "--piano", "studio", "--installazioni", "sede", "--senza-pacchetti")
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(len(self.hub().registry.list_customers()), 1)
        # --rigenera: old packages to _trash, new ones built
        rc, out, err = run_cli(self.hub_dir, *(self.args + ["--rigenera"]))
        self.assertEqual(rc, 0, out + err)
        self.assertTrue(zp.is_file())
        trash = list((self.cdir / "_trash").glob("*/sede/*.zip"))
        self.assertEqual(len(trash), 1)
        self.assertEqual(len(self.hub().registry.list_licences()), 2)
        self.assertGreater(len(self.hub().registry.events(10000)), n_ev)

    # -- variants and errors -------------------------------------------------
    def test_variants_and_validation(self):
        rc, out, err = run_cli(self.hub_dir, "cliente", "nuovo", "--nome", "Studio Solo Sede", "--piano", "studio")
        self.assertEqual(rc, 0, out + err)
        d = self.hub_dir / "clienti" / "studio-solo-sede"
        with zipfile.ZipFile(next((d / "sede").glob("*.zip"))) as z:
            self.assertNotIn("cliente/sync-profile.template.json", z.namelist())
            self.assertIn("cliente/licence.docmap-licence", z.namelist())
        self.assertFalse((d / "online").exists())
        rc, out, err = run_cli(self.hub_dir, "cliente", "nuovo", "--nome", "Archivio Bianchi", "--piano", "studio",
                               "--installazioni", "online", "--url-online", "https://archivio.bianchi.example")
        self.assertEqual(rc, 0, out + err)
        h = self.hub()
        ob = Onboarding(h, log=lambda *_: None)
        cust = ob.find_customer("Archivio Bianchi", None)
        e = h.registry.get_environment(ob.find_instance(cust["id"], "online")["id"], "production")
        self.assertEqual((e["settings"]["base_path"], e["url"]), ("/", "https://archivio.bianchi.example/"))
        self.assertFalse((self.hub_dir / "clienti" / "archivio-bianchi" / "sede").exists())
        bad = [
            (["--installazioni", "online"], "indirizzo"),
            (["--installazioni", "online", "--url-online", "http://x.example/"], "https"),
            (["--installazioni", "entrambe", "--url-online", "https://x.example/a/", "--url-staging", "https://x.example/b/",
              "--ftp-protocollo", "local", "--ftp-cartella", "/tmp/a"], "staging"),
            (["--installazioni", "sede", "--url-online", "https://x.example/"], "solo con"),
            (["--piano", "inesistente"], "Piano"),
        ]
        for extra, msg in bad:
            argv = ["cliente", "nuovo", "--nome", "Errato", "--piano", "studio"] + extra
            rc, out, err = run_cli(self.hub_dir, *argv)
            self.assertEqual(rc, 1, (extra, out))
            self.assertIn(msg.lower(), err.lower(), extra)
        self.assertIsNone(Onboarding(self.hub(), log=lambda *_: None).find_customer("Errato", None))

    def test_bridge_token_and_sheet_with_secrets(self):
        rc, out, err = run_cli(self.hub_dir, "cliente", "token-ponte", "--cliente", "Studio Rossi", "--salva",
                               env={"DOCMAP_HUB_BRIDGE_TOKEN": BRIDGE})
        self.assertEqual(rc, 0, out + err)
        exp = self.tmp / "token-ponte.txt"
        rc, out, err = run_cli(self.hub_dir, "cliente", "token-ponte", "--cliente", "Studio Rossi", "--esporta", str(exp))
        self.assertEqual(rc, 0, out + err)
        self.assertEqual(exp.read_text().strip(), BRIDGE)
        if os.name == "posix":
            self.assertEqual(stat.S_IMODE(exp.stat().st_mode), 0o600)
        rc, out, err = run_cli(self.hub_dir, "cliente", "token-ponte", "--cliente", "Studio Rossi", "--esporta", str(exp))
        self.assertEqual(rc, 1, "never overwrites an existing file")
        rc, out, err = run_cli(self.hub_dir, "cliente", "scheda", "--cliente", "Studio Rossi")
        self.assertEqual(rc, 0)
        plain = (self.cdir / "scheda-cliente.html").read_text("utf-8")
        self.assertNotIn(BRIDGE, plain)
        self.assertRegex(plain, r"ponte-sync[^<]*\)</td><td>[^<]*cassaforte del hub <span class='ok'>sì")
        rc, out, err = run_cli(self.hub_dir, "cliente", "scheda", "--cliente", "Studio Rossi", "--con-segreti")
        self.assertEqual(rc, 0, out + err)
        sec = self.cdir / "scheda-cliente-CON-SEGRETI.html"
        body = sec.read_text("utf-8")
        self.assertIn(BRIDGE, body)
        self.assertIn("CONTIENE CODICI SEGRETI", body)
        if os.name == "posix":
            self.assertEqual(stat.S_IMODE(sec.stat().st_mode), 0o600)
        self.assertIn("onboarding.scheda_segreti", [e["action"] for e in self.hub().registry.events(50)])
        rc, out, err = run_cli(self.hub_dir, "cliente", "elenco")
        self.assertIn("sede+online", out)


@unittest.skipUnless(HAVE_CRYPTO and (INSTALLER / "docmap_tools.py").is_file(), "servono cryptography e installer-windows")
class TestClienteNuovoWeb(unittest.TestCase):
    def setUp(self):
        from docmap_hub.web import make_server

        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *a, **k):
                return None
        self._td = tempfile.TemporaryDirectory()
        self.addCleanup(self._td.cleanup)
        self.hub = Hub(Path(self._td.name) / "hub")
        self.hub.keys.generate(PASS)
        Vault(self.hub.registry).init(PASS)
        self.httpd = make_server(self.hub, PASS, port=0)
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.addCleanup(self._stop)
        self.opener = urllib.request.build_opener(NoRedirect, urllib.request.ProxyHandler({}))
        self.cookie = None
        _, h, _ = self.req("/login", {"passphrase": PASS})
        self.cookie = h["Set-Cookie"].split(";")[0]
        _, _, body = self.req("/clienti")
        self.csrf = body.split("name='csrf' value='")[1].split("'")[0]

    def _stop(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.hub.close()

    def req(self, path, data=None):
        r = urllib.request.Request(self.base + path, data=urllib.parse.urlencode(data).encode() if data is not None else None)
        if self.cookie:
            r.add_header("Cookie", self.cookie)
        try:
            resp = self.opener.open(r, timeout=60)
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers), e.read().decode("utf-8", "replace")
        return resp.status, dict(resp.headers), resp.read().decode("utf-8", "replace")

    def test_form_runs_wizard(self):
        code, _, body = self.req("/clienti")
        self.assertEqual(code, 200)
        self.assertIn("Nuovo cliente", body)
        code, _, _ = self.req("/clienti/nuovo", {"nome": "X"})                    # CSRF required
        self.assertEqual(code, 403)
        code, h, _ = self.req("/clienti/nuovo", {"csrf": self.csrf, "nome": "Studio Web", "piano": "studio",
                                                 "installazioni": "online"})       # missing URL → error at once
        self.assertEqual(code, 303)
        self.assertIn("err=", h["Location"])
        code, h, _ = self.req("/clienti/nuovo", {"csrf": self.csrf, "nome": "Studio Web", "piva": "IT999", "piano": "studio",
                                                 "installazioni": "sede"})
        self.assertEqual(code, 303)
        loc = h["Location"]
        self.assertTrue(loc.startswith("/job/"), loc)
        end = time.time() + 300
        while time.time() < end:
            _, _, body = self.req(loc)
            if "in corso" not in body:
                break
            time.sleep(0.5)
        self.assertNotIn("ERRORE", body)
        self.assertIn("/clienti/studio-web/scheda", body)
        code, _, sheet = self.req("/clienti/studio-web/scheda")
        self.assertEqual(code, 200)
        self.assertIn("Scheda cliente", sheet)
        self.assertEqual(self.req("/clienti/..%2f..%2fx/scheda")[0], 404)
        code, _, body = self.req("/clienti")
        self.assertIn("studio-web", body)


if __name__ == "__main__":
    unittest.main()
