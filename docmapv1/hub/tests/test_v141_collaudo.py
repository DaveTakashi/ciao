"""Hub 0.14.1, found walking the real path for Dave's first full test (2026-11-25):

* «Attiva tutto» on a brand-new customer stopped at the first file with «550 No such file or directory»: the FTP
  upload never created the site's own folder (the 'local' transport did, so only real FTP failed) — see
  test_v03_ftp_root for the FTP case;
* «Prova il collegamento» of the default hosting: logs in and reads the base folder, changes nothing, and says in
  plain words what is wrong (wrong password, server down) before the first customer.
"""

import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from docmap_hub import hosting as H  # noqa: E402
from docmap_hub.service import Hub  # noqa: E402
from docmap_hub.vault import Vault  # noqa: E402
from test_v04_manager import PASS  # noqa: E402

try:
    from test_v02_deploy import HAVE_FTP, start_ftp
except Exception:  # pragma: no cover
    HAVE_FTP = False


class HostingTest(unittest.TestCase):
    def setUp(self):
        td = tempfile.TemporaryDirectory()
        self.addCleanup(td.cleanup)
        self.tmp = Path(td.name)
        self.hub = Hub(self.tmp / "hub")
        self.addCleanup(self.hub.close)
        self.reg = self.hub.registry
        self.vk = Vault(self.reg).init(PASS)

    def test_nothing_to_test(self):
        with self.assertRaises(H.HostingError):
            H.test_connection(self.reg, self.vk)

    def test_local_folder(self):
        www = self.tmp / "www"
        (www / "altro-sito").mkdir(parents=True)
        H.set_default(self.reg, self.vk, {"base_url": "https://x.example.it", "protocol": "local", "base_folder": str(www)})
        r = H.test_connection(self.reg, self.vk)
        self.assertTrue(r["ok"], r)
        self.assertEqual(list((www).iterdir()), [www / "altro-sito"])   # nothing written

    @unittest.skipUnless(HAVE_FTP, "pyftpdlib non installato")
    def test_ftp_right_and_wrong_password(self):
        root = self.tmp / "ftp"
        (root / "studio-a").mkdir(parents=True)
        srv, port, stop = start_ftp(root)
        self.addCleanup(stop)
        host = {"base_url": "https://x.example.it", "protocol": "ftps", "host": "127.0.0.1", "port": port,
                "user": "dave", "password": "pw-ftp-test", "base_folder": "/"}
        H.set_default(self.reg, self.vk, host)
        from docmap_hub import deploy as D
        plain = lambda sec: D.FTPRemote(sec["host"], sec["port"], sec["user"], sec["password"], sec["remote_path"], tls=False)
        r = H.test_connection(self.reg, self.vk, open_remote=plain)
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["files"], 1)
        H.set_default(self.reg, self.vk, dict(host, password="sbagliata"))
        r = H.test_connection(self.reg, self.vk, open_remote=plain)
        self.assertFalse(r["ok"])
        self.assertIn("accesso rifiutato", r["message"])
        H.set_default(self.reg, self.vk, dict(host, base_folder="/manca/"))
        r = H.test_connection(self.reg, self.vk, open_remote=plain)
        self.assertFalse(r["ok"])
        self.assertIn("non c'è per questo account FTP", r["message"])
        self.assertEqual(sorted(p.name for p in root.iterdir()), ["studio-a"])


if __name__ == "__main__":
    unittest.main()
