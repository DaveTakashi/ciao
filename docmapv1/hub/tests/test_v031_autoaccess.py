"""v0.3.1: accesso automatico (passphrases remembered on this PC) and 'info'."""
import io
import os
import tempfile
import unittest
import urllib.request
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

from docmap_hub import autoaccess
from docmap_hub.cli import main

PASS = "una-passphrase-lunga"
VPASS = "altra-passphrase-cassaforte"
ENVS = ("DOCMAP_HUB_PASSPHRASE", "DOCMAP_HUB_VAULT_PASSPHRASE", "DOCMAP_HUB_NO_AUTO", "DOCMAP_HUB_VAULT_NEW_PASSPHRASE")


def run(*argv, env=None):
    buf = io.StringIO()
    with mock.patch.dict(os.environ, env or {}, clear=False), redirect_stdout(buf):
        for k in ENVS:
            if k not in (env or {}):
                os.environ.pop(k, None)
        rc = main(list(argv))
    return rc, buf.getvalue()


class AutoAccessTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.d = self.tmp.name
        self.assertEqual(run("--dir", self.d, "init")[0], 0)
        self.assertEqual(run("--dir", self.d, "keygen", env={"DOCMAP_HUB_PASSPHRASE": PASS})[0], 0)
        self.assertEqual(run("--dir", self.d, "vault", "init",
                             env={"DOCMAP_HUB_PASSPHRASE": PASS, "DOCMAP_HUB_VAULT_PASSPHRASE": VPASS})[0], 0)

    def tearDown(self):
        self.tmp.cleanup()

    def test_activate_then_commands_need_no_passphrase(self):
        rc, txt = run("--dir", self.d, "accesso-automatico", "attiva",
                      env={"DOCMAP_HUB_PASSPHRASE": PASS, "DOCMAP_HUB_VAULT_PASSPHRASE": VPASS})
        self.assertEqual(rc, 0, txt)
        p = Path(self.d) / autoaccess.FILE
        self.assertTrue(p.exists())
        self.assertNotIn(PASS, p.read_text())
        if os.name == "posix":
            self.assertEqual(p.stat().st_mode & 0o077, 0)
        # no env, no prompt: getpass must never be called
        with mock.patch("getpass.getpass", side_effect=AssertionError("prompt!")):
            self.assertEqual(run("--dir", self.d, "customer", "add", "--name", "Studio Auto")[0], 0)
            rc, txt = run("--dir", self.d, "cliente", "nuovo", "--nome", "Studio Auto", "--piano", "studio",
                          "--installazioni", "sede")
            self.assertEqual(rc, 0, txt)
            self.assertEqual(run("--dir", self.d, "vault", "status")[0], 0)
            self.assertIn("ATTIVO", run("--dir", self.d, "accesso-automatico", "stato")[1])
        self.assertEqual(run("--dir", self.d, "accesso-automatico", "disattiva")[0], 0)
        self.assertFalse(p.exists())

    def test_wrong_passphrase_refused(self):
        rc, _ = run("--dir", self.d, "accesso-automatico", "attiva", env={"DOCMAP_HUB_PASSPHRASE": "sbagliata-xxxx"})
        self.assertEqual(rc, 1)
        self.assertFalse((Path(self.d) / autoaccess.FILE).exists())

    def test_vault_change_passphrase_updates_stored_file(self):
        run("--dir", self.d, "accesso-automatico", "attiva",
            env={"DOCMAP_HUB_PASSPHRASE": PASS, "DOCMAP_HUB_VAULT_PASSPHRASE": VPASS})
        rc, txt = run("--dir", self.d, "vault", "change-passphrase", env={"DOCMAP_HUB_VAULT_NEW_PASSPHRASE": PASS})
        self.assertEqual(rc, 0, txt)
        st = autoaccess.load(Path(self.d))
        self.assertEqual((st["signing"], st["vault"]), (PASS, None))  # now ONE passphrase
        with mock.patch("getpass.getpass", side_effect=AssertionError("prompt!")):
            self.assertEqual(run("--dir", self.d, "vault", "status")[0], 0)

    def test_info(self):
        rc, txt = run("--dir", self.d, "info")
        self.assertEqual(rc, 0)
        self.assertIn("NON toccare", txt)

    def test_web_auto_login_token_single_use(self):
        from docmap_hub.service import Hub
        from docmap_hub.web import make_server
        import threading
        with Hub(self.d) as hub:
            httpd = make_server(hub, PASS, port=0)
            t = threading.Thread(target=httpd.serve_forever, daemon=True)
            t.start()
            try:
                tok = httpd.app.make_auto_token()
                base = f"http://127.0.0.1:{httpd.server_address[1]}"

                class NoRedirect(urllib.request.HTTPRedirectHandler):
                    def redirect_request(self, *a, **k):
                        return None
                op = urllib.request.build_opener(NoRedirect)

                def get(u):
                    try:
                        return op.open(base + u)
                    except urllib.error.HTTPError as e:
                        return e
                r1 = get("/auto?t=" + tok)
                self.assertEqual((r1.code, r1.headers["Location"]), (303, "/"))
                self.assertIn("HttpOnly", r1.headers["Set-Cookie"])
                r2 = get("/auto?t=" + tok)
                self.assertEqual(r2.headers["Location"], "/login")
            finally:
                httpd.shutdown()
                httpd.server_close()


if __name__ == "__main__":
    unittest.main()
