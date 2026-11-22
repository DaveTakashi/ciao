"""v0.2: deploy by FTPS / FTP to a local test FTP server (pyftpdlib), protected files,
backup first, rollback on a failed health check, promote rule.

pyftpdlib (and pyOpenSSL for FTPS) are needed ONLY for these tests and are not hub
dependencies: install them in a scratch folder and point DOCMAP_HUB_TEST_DEPS at it, e.g.
    pip install --target /tmp/hubtestdeps pyftpdlib pyOpenSSL
    DOCMAP_HUB_TEST_DEPS=/tmp/hubtestdeps python -m unittest discover -s tests
Without them the FTP tests are skipped (the 'local' folder transport is still tested).
"""

import datetime as _dt
import json
import os
import sys
import tempfile
import threading
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if os.environ.get("DOCMAP_HUB_TEST_DEPS"):
    sys.path.insert(0, os.environ["DOCMAP_HUB_TEST_DEPS"])

from docmap_hub import deploy as D
from docmap_hub.deploy import DeployError
from docmap_hub.service import Hub
from docmap_hub.vault import Vault

PASS = "una-passphrase-lunga"

try:
    from pyftpdlib.authorizers import DummyAuthorizer
    from pyftpdlib.handlers import FTPHandler
    from pyftpdlib.servers import ThreadedFTPServer
    from pyftpdlib.ioloop import IOLoop
    import logging
    _lg = logging.getLogger("pyftpdlib")
    _lg.setLevel(int(os.environ.get("FTPLOG", "30")))
    _lg.addHandler(logging.StreamHandler())  # (pyftpdlib installs a verbose INFO handler if none exists)
    _lg.propagate = False
    HAVE_FTP = True
except Exception:  # pragma: no cover
    HAVE_FTP = False
try:
    from pyftpdlib.handlers import TLS_FTPHandler
    HAVE_FTPS = HAVE_FTP
except Exception:  # pragma: no cover
    HAVE_FTPS = False


def make_cert(d: Path):
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.x509.oid import NameOID
    import ipaddress
    key = ec.generate_private_key(ec.SECP256R1())
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "localhost")])
    now = _dt.datetime.now(_dt.timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(now - _dt.timedelta(days=1))
            .not_valid_after(now + _dt.timedelta(days=2))
            .add_extension(x509.SubjectAlternativeName([x509.DNSName("localhost"),
                                                        x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]), False)
            .add_extension(x509.BasicConstraints(ca=True, path_length=None), True)
            .sign(key, hashes.SHA256()))
    c, k = d / "cert.pem", d / "key.pem"
    c.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    k.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                    serialization.NoEncryption()))
    return str(c), str(k)


def start_ftp(root: Path, tls_files=None):
    auth = DummyAuthorizer()
    auth.add_user("dave", "pw-ftp-test", str(root), perm="elradfmwMT")
    base = TLS_FTPHandler if tls_files else FTPHandler
    handler = type("H", (base,), {})
    handler.authorizer = auth
    if tls_files:
        handler.certfile, handler.keyfile = tls_files
        handler.tls_control_required = True
        handler.tls_data_required = True
    srv = ThreadedFTPServer(("127.0.0.1", 0), handler, ioloop=IOLoop())
    t = threading.Thread(target=srv.serve_forever, kwargs={"timeout": 0.2}, daemon=True)
    t.start()

    def stop():
        # wait for the serving thread too: its own final close_all() would otherwise race with
        # (and shut down) the server of the next test (pyftpdlib keeps a class-level exit flag)
        srv.close_all()
        t.join(10)
    return srv, srv.address[1], stop


class Pinger:
    """Fake ?r=ping: answers the version currently in the remote server-php/api.php (or a forced one)."""

    def __init__(self, site: Path, force=None):
        self.site, self.force, self.calls = site, force, 0

    def __call__(self, url, auth):
        self.calls += 1
        if self.force is not None:
            return {"ok": True, "app_version": self.force}
        v = D.app_version_of(self.site / "server-php" / "api.php")
        return {"ok": v is not None, "app_version": v, "error": None if v else "404"}


class DeployBase(unittest.TestCase):
    tls = False

    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.addCleanup(self._td.cleanup)
        self.tmp = Path(self._td.name)
        self.hub = Hub(self.tmp / "hub")
        self.addCleanup(self.hub.close)
        self.reg = self.hub.registry
        self.vault = Vault(self.reg)
        self.vk = self.vault.init(PASS)
        c = self.reg.add_customer("Studio Rossi")
        self.inst = self.reg.add_instance(c["id"], label="PC Rossi")
        self.ftp_root = self.tmp / "ftproot"
        (self.ftp_root / "staging").mkdir(parents=True)
        (self.ftp_root / "prod").mkdir(parents=True)
        self.st = self.reg.add_environment(self.inst["id"], "staging", "web-php",
                                           url="https://h.invalid/studio-st/",
                                           api_url="https://h.invalid/studio-st/server-php/api.php",
                                           settings={"base_path": "/studio-st/", "slug": "studio-st",
                                                     "domain": "https://h.invalid"})
        self.pr = self.reg.add_environment(self.inst["id"], "production", "web-php",
                                           url="https://h.invalid/studio-de/",
                                           api_url="https://h.invalid/studio-de/server-php/api.php",
                                           settings={"base_path": "/studio-de/", "slug": "studio-de",
                                                     "domain": "https://h.invalid"})

    def site(self, env="staging"):
        return self.ftp_root / ("staging" if env == "staging" else "prod")


@unittest.skipUnless(HAVE_FTP, "pyftpdlib non installato (vedi docstring): test FTP saltati")
class TestDeployFTP(DeployBase):
    tls = True

    def setUp(self):
        super().setUp()
        if self.tls and not HAVE_FTPS:
            self.skipTest("pyOpenSSL non installato: FTPS non provabile")
        tls_files = make_cert(self.tmp) if self.tls else None
        self.srv, self.port, stop = start_ftp(self.ftp_root, tls_files)
        self.addCleanup(stop)
        for env, path in ((self.st, "/staging"), (self.pr, "/prod")):
            sec = {"host": "127.0.0.1", "port": self.port, "user": "dave", "password": "pw-ftp-test",
                   "remote_path": path, "protocol": "ftps" if self.tls else "ftp"}
            if self.tls:
                sec["cafile"] = tls_files[0]
            self.vault.put(self.vk, env["id"], "ftp", sec)
        self.build = D.build_for(self.hub, self.st)
        self.addCleanup(self.build.cleanup)

    def run_deploy(self, env="staging", **kw):
        kw.setdefault("insecure_ftp", not self.tls)
        kw.setdefault("health_delay", 0)
        kw.setdefault("health_tries", 2)
        kw.setdefault("pinger", Pinger(self.site(env)))
        return D.deploy(self.hub, self.vk, self.inst["id"], env, **kw)

    def test_dry_run_upload_protect_rollback(self):
        site = self.site()
        # 1. dry-run on an empty server: everything planned, nothing written
        r = self.run_deploy(dry_run=True, build=self.build)
        self.assertEqual(r["status"], "dry-run")
        self.assertEqual(len(r["plan"]["upload"]), len(self.build.files()))
        self.assertEqual(r["plan"]["upload"][-1]["path"], D.MANIFEST)
        self.assertEqual(list(site.iterdir()), [])

        # 2. first real deploy
        r = self.run_deploy(build=self.build)
        self.assertEqual(r["status"], "ok")
        self.assertTrue((site / "index.html").exists())
        self.assertTrue((site / "server-php" / "setup.php").exists())
        self.assertEqual((site / D.MANIFEST).read_bytes(), (self.build.dir / D.MANIFEST).read_bytes())
        env = self.reg.get_environment(self.st["id"])
        self.assertEqual(env["deployed_version"], self.build.version)
        self.assertEqual(env["verified_code_hash"], self.build.code_hash)
        self.assertFalse(any(p.name.endswith(".dmtmp") for p in site.rglob("*")))

        # 3. second deploy with nothing changed: nothing to upload
        r = self.run_deploy(dry_run=True, build=self.build)
        self.assertEqual(r["plan"]["upload"], [])

        # 4. the studio ran setup.php, customised .htaccess, has data; an old index.html on the server
        (site / "server-php" / "config.php").write_text("<?php return ['aes_key' => 'SEGRETA'];", "utf-8")
        (site / "server-php" / "setup.php").rename(site / "server-php" / "setup.php.disabled")
        (site / "server-php" / "data" / "docmap.sqlite").write_bytes(b"SQLite format 3\x00dati")
        custom = (site / ".htaccess").read_text("utf-8") + "\n# regola aggiunta a mano\n"
        (site / ".htaccess").write_text(custom, "utf-8")
        old_index = b"<html>vecchia versione</html>"
        (site / "index.html").write_bytes(old_index)
        r = self.run_deploy(dry_run=True, build=self.build)
        up = [i["path"] for i in r["plan"]["upload"]]
        prot = {i["path"] for i in r["plan"]["protected"]}
        self.assertIn("index.html", up)
        self.assertNotIn(".htaccess", up)
        self.assertIn(".htaccess", prot)
        self.assertIn("server-php/setup.php", prot)
        self.assertIn("server-php/data/.htaccess", prot)

        r = self.run_deploy(build=self.build)
        self.assertEqual(r["status"], "ok")
        self.assertTrue(r["config_php_untouched"])
        self.assertEqual((site / ".htaccess").read_text("utf-8"), custom)
        self.assertFalse((site / "server-php" / "setup.php").exists())
        self.assertEqual((site / "server-php" / "data" / "docmap.sqlite").read_bytes(), b"SQLite format 3\x00dati")
        bdir = Path(r["backup_dir"])
        self.assertEqual((bdir / "before" / "index.html").read_bytes(), old_index)
        self.assertEqual((bdir / "data" / "docmap.sqlite").read_bytes(), b"SQLite format 3\x00dati")
        # key escrow OFF: config.php is NOT kept by the hub (only its fingerprint)
        self.assertFalse(any("SEGRETA" in p.read_text("utf-8", "replace") for p in bdir.rglob("*") if p.is_file()))
        meta = json.loads((bdir / "backup.json").read_text("utf-8"))
        self.assertFalse(meta["config_php"]["in_vault"])
        self.assertFalse(self.vault.has(self.st["id"], "db_config", D.CONFIG))
        self.assertTrue(self.reg.get_environment(self.st["id"])["last_backup_at"])

        # 5. failed health check → rollback to the previous files
        (site / "index.html").write_bytes(old_index)
        with self.assertRaises(DeployError) as cm:
            self.run_deploy(build=self.build, pinger=Pinger(site, force="0.0.0-rotto"))
        self.assertIn("rimesso", str(cm.exception))
        self.assertEqual((site / "index.html").read_bytes(), old_index)
        dep = self.reg.list_deploys(self.st["id"], limit=1)[0]
        self.assertEqual(dep["status"], "rolled-back")

        # 6. key escrow ON: config.php goes into the vault (encrypted), never in plain files
        self.reg.set_key_escrow("Studio Rossi", True)
        r = self.run_deploy(build=self.build)
        self.assertEqual(r["status"], "ok")
        cfg = self.vault.get(self.vk, self.st["id"], "db_config", D.CONFIG, reason="test")
        self.assertIn("SEGRETA", cfg["content"])

        # 7. --overwrite-htaccess replaces the customised file
        r = self.run_deploy(build=self.build, overwrite_htaccess=True)
        self.assertNotIn("regola aggiunta a mano", (site / ".htaccess").read_text("utf-8"))

    def test_promote_rule(self):
        with self.assertRaises(DeployError) as cm:
            D.promote(self.hub, self.vk, self.inst["id"], insecure_ftp=not self.tls,
                      pinger=Pinger(self.site("prod")), health_delay=0)
        self.assertIn("staging", str(cm.exception))
        self.assertEqual(self.run_deploy(build=self.build)["status"], "ok")
        # production has another base path: same code hash anyway → allowed
        r = D.promote(self.hub, self.vk, self.inst["id"], insecure_ftp=not self.tls,
                      pinger=Pinger(self.site("prod")), health_delay=0, health_tries=1)
        self.assertEqual(r["status"], "ok")
        prod_cfg = (self.site("prod") / "docmap.config.js").read_text("utf-8")
        self.assertIn("/studio-de/", prod_cfg)
        self.assertEqual(self.reg.get_environment(self.pr["id"])["deployed_version"], self.build.version)
        # code changed after the staging test → refused
        self.reg.update_environment(self.st["id"], verified_code_hash="0" * 64)
        with self.assertRaises(DeployError) as cm:
            D.promote(self.hub, self.vk, self.inst["id"], insecure_ftp=not self.tls,
                      pinger=Pinger(self.site("prod")), health_delay=0)
        self.assertIn("non è quello provato", str(cm.exception))


@unittest.skipUnless(HAVE_FTP, "pyftpdlib non installato: test FTP saltati")
class TestDeployPlainFTP(TestDeployFTP):
    tls = False

    def test_plain_ftp_needs_flag(self):
        with self.assertRaises(DeployError) as cm:
            self.run_deploy(build=self.build, insecure_ftp=False, dry_run=True)
        self.assertIn("--insecure-ftp", str(cm.exception))

    test_promote_rule = None  # covered by the FTPS class


class TestDeployLocalAndErrors(DeployBase):
    def test_local_folder_transport_and_errors(self):
        site = self.site()
        self.vault.put(self.vk, self.st["id"], "ftp", {"protocol": "local", "remote_path": str(site)})
        r = D.deploy(self.hub, self.vk, self.inst["id"], "staging", pinger=Pinger(site), health_delay=0)
        self.assertEqual(r["status"], "ok")
        self.assertTrue((site / "scan.html").exists())
        # local-python env cannot be deployed by FTP
        loc = self.reg.add_environment(self.inst["id"], "demo-x", "local-python")
        with self.assertRaises(DeployError):
            D.deploy(self.hub, self.vk, self.inst["id"], "demo-x")
        self.assertTrue(loc)
        # missing FTP credentials → clear message
        with self.assertRaises(Exception) as cm:
            D.deploy(self.hub, self.vk, self.inst["id"], "production", dry_run=True)
        self.assertIn("manca 'ftp'", str(cm.exception))

    def test_sftp_without_paramiko_message(self):
        try:
            import paramiko  # noqa: F401
            self.skipTest("paramiko installato")
        except ImportError:
            pass
        with self.assertRaises(DeployError) as cm:
            D.open_remote({"protocol": "sftp", "host": "h", "user": "u", "password": "p", "remote_path": "/x"},
                          known_hosts=self.tmp / "kh")
        self.assertIn("paramiko", str(cm.exception))

    def test_manifest_and_code_hash(self):
        m = D.parse_manifest("a" * 64 + "  index.html\n" + "b" * 64 + "  docmap.config.js\nrubbish\n")
        self.assertEqual(set(m), {"index.html", "docmap.config.js"})
        m2 = dict(m, **{"docmap.config.js": "c" * 64})
        self.assertEqual(D.code_hash(m), D.code_hash(m2))      # per-environment file ignored
        m3 = dict(m, **{"index.html": "d" * 64})
        self.assertNotEqual(D.code_hash(m), D.code_hash(m3))


if __name__ == "__main__":
    unittest.main()
