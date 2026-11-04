"""Keys, registry, CLI end-to-end and web page tests (all in temp dirs)."""

import contextlib
import io
import json
import os
import sqlite3
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from docmap_hub import cli, licence as L, paths
from docmap_hub.keys import KeyError_, KeyStore, WrongPassphrase
from docmap_hub.registry import MIGRATIONS, SCHEMA_VERSION, Registry, RegistryError
from docmap_hub.service import Hub, add_months

PASS = "una-passphrase-lunga"


class TempDir(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.dir = Path(self._td.name) / "hub"
        self.addCleanup(self._td.cleanup)


class TestPaths(unittest.TestCase):
    def test_env_override(self):
        old = os.environ.get(paths.ENV_DIR)
        os.environ[paths.ENV_DIR] = "/x/y"
        try:
            self.assertEqual(paths.default_data_dir(), Path("/x/y"))
        finally:
            if old is None:
                del os.environ[paths.ENV_DIR]
            else:
                os.environ[paths.ENV_DIR] = old


class TestKeys(TempDir):
    def test_generate_load_rotate_export(self):
        ks = KeyStore(self.dir)
        with self.assertRaises(KeyError_):
            ks.generate("corta")
        k1 = ks.generate(PASS)
        pem = (self.dir / "keys" / f"{k1.key_id}.key.pem").read_bytes()
        self.assertIn(b"ENCRYPTED", pem)
        self.assertNotIn(PASS.encode(), pem)
        kid, priv = ks.load_private(PASS)
        self.assertEqual(kid, k1.key_id)
        with self.assertRaises(WrongPassphrase):
            ks.load_private("passphrase-sbagliata")
        with self.assertRaises(KeyError_):
            ks.generate(PASS)  # already active, no --rotate
        with self.assertRaises(WrongPassphrase):
            ks.generate("altra-passphrase-x", rotate=True)
        k2 = ks.generate(PASS, rotate=True)
        self.assertEqual(ks.active_id, k2.key_id)
        self.assertEqual({k.key_id: k.status for k in ks.list()},
                         {k1.key_id: "retired", k2.key_id: "active"})
        bundle = L.load_public_keys_json(ks.export("json"))
        self.assertEqual(set(bundle), {k1.key_id, k2.key_id})
        self.assertEqual(ks.export("base64").strip(), k2.public_b64)
        self.assertIn("BEGIN PUBLIC KEY", ks.export("pem", k1.key_id))
        L.load_public_key(ks.export("pem"))


class TestRegistry(TempDir):
    def test_migration_idempotent(self):
        r = Registry(self.dir)
        self.assertEqual(r.schema_version(), SCHEMA_VERSION)
        r.add_customer("Studio A")
        self.assertEqual(r.migrate(), SCHEMA_VERSION)
        r.close()
        r = Registry(self.dir)  # reopen: no error, data kept
        self.assertEqual(len(r.list_customers()), 1)
        self.assertEqual(r.migrate(), SCHEMA_VERSION)
        r.close()

    def test_additive_future_migration(self):
        r = Registry(self.dir)
        r.add_customer("Studio A")
        r.close()
        MIGRATIONS.append((SCHEMA_VERSION + 1, ["ALTER TABLE customers ADD COLUMN phone TEXT"]))
        try:
            r = Registry(self.dir)
            self.assertEqual(r.schema_version(), SCHEMA_VERSION + 1)
            self.assertIn("phone", r.list_customers()[0])
            r.migrate()  # second run: nothing to do
            r.close()
        finally:
            MIGRATIONS.pop()

    def test_lookup_and_events(self):
        with Registry(self.dir) as r:
            res = r.add_reseller("Rete", branding={"product_name": "Archivio X"})
            c = r.add_customer("Studio B", reseller="rete")
            self.assertEqual(c["reseller_id"], res["id"])
            i = r.add_instance(c["id"][:8], label="PC1")
            self.assertEqual(r.get_instance("pc1")["id"], i["id"])
            with self.assertRaises(RegistryError):
                r.add_instance(c["id"], instance_id=i["id"])
            with self.assertRaises(RegistryError):
                r.get_customer("inesistente")
            actions = [e["action"] for e in r.events()]
            self.assertEqual(actions, ["instance.add", "customer.add", "reseller.add"])


class TestService(TempDir):
    def test_issue_renew_reseller(self):
        with Hub(self.dir) as hub:
            hub.keys.generate(PASS)
            res = hub.registry.add_reseller("Rete Studi", branding={"product_name": "ArchivioFacile"})
            c = hub.registry.add_customer("Studio Verdi", reseller=res["id"])
            i = hub.registry.add_instance(c["id"])
            now = datetime(2026, 3, 31, 10, tzinfo=timezone.utc)
            out = hub.issue(PASS, i["id"], "studio", limits={"users": 7}, now=now)
            lic = out["licence"]
            self.assertEqual(lic["expires_at"], "2027-03-31T10:00:00Z")
            self.assertEqual(lic["limits"], {"users": 7, "binders": 5000, "archives": 3})
            self.assertIn("white_label", lic["features"])
            self.assertEqual(lic["branding"], {"product_name": "ArchivioFacile"})
            self.assertEqual(lic["reseller"]["name"], "Rete Studi")
            self.assertTrue(out["path"].exists())
            # renewal before expiry extends from the old expiry
            r2 = hub.renew(PASS, i["id"], now=now + timedelta(days=300))
            self.assertEqual(r2["licence"]["expires_at"], "2028-03-31T10:00:00Z")
            self.assertEqual(r2["licence"]["limits"]["users"], 7)
            self.assertEqual(hub.registry.latest_licence(i["id"])["supersedes"], lic["licence_id"])
            # renewal after expiry starts from now
            r3 = hub.renew(PASS, r2["licence"]["licence_id"], months=1,
                           now=datetime(2029, 1, 15, tzinfo=timezone.utc))
            self.assertEqual(r3["licence"]["expires_at"], "2029-02-15T00:00:00Z")
            with self.assertRaises(RegistryError):
                hub.issue(PASS, i["id"], "piano-inesistente")

    def test_add_months_end_of_month(self):
        self.assertEqual(add_months(datetime(2026, 1, 31), 1), datetime(2026, 2, 28))
        self.assertEqual(add_months(datetime(2026, 11, 15), 14), datetime(2028, 1, 15))


def run_cli(*argv) -> tuple[int, str, str]:
    o, e = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(o), contextlib.redirect_stderr(e):
        rc = cli.main(list(argv))
    return rc, o.getvalue(), e.getvalue()


class TestCli(TempDir):
    def setUp(self):
        super().setUp()
        self._old = os.environ.get(cli.ENV_PASSPHRASE)
        os.environ[cli.ENV_PASSPHRASE] = PASS
        self.addCleanup(self._restore)

    def _restore(self):
        if self._old is None:
            os.environ.pop(cli.ENV_PASSPHRASE, None)
        else:
            os.environ[cli.ENV_PASSPHRASE] = self._old

    def c(self, *argv):
        return run_cli("--dir", str(self.dir), *argv)

    def test_end_to_end(self):
        d = str(self.dir)
        rc, o, _ = self.c("init")
        self.assertEqual(rc, 0)
        self.assertIn("Hub inizializzato", o)
        self.assertEqual(self.c("keygen")[0], 0)
        rc, _, e = self.c("keygen")
        self.assertEqual(rc, 1)
        self.assertIn("--rotate", e)
        self.assertEqual(self.c("reseller", "add", "--name", "Rete Studi", "--product-name", "ArchivioFacile")[0], 0)
        self.assertEqual(self.c("customer", "add", "--name", "Studio Rossi", "--vat", "IT0123")[0], 0)
        self.assertEqual(self.c("customer", "add", "--name", "Studio Neri", "--reseller", "Rete Studi")[0], 0)
        self.assertEqual(self.c("instance", "add", "--customer", "Studio Rossi", "--label", "PC Rossi",
                                "--id", "11111111-aaaa-bbbb-cccc-000000000001")[0], 0)
        self.assertEqual(self.c("instance", "add", "--customer", "Studio Neri", "--label", "PC Neri")[0], 0)
        rc, o, _ = self.c("customer", "list")
        self.assertIn("Studio Neri", o)
        self.assertIn("Rete Studi", o)

        lic_path = Path(d) / "rossi.docmap-licence"
        rc, o, e = self.c("licence", "issue", "--instance", "PC Rossi", "--plan", "studio_pro",
                          "--users", "8", "--binders", "-1", "--feature", "white_label",
                          "--no-feature", "ai_credits", "--out", str(lic_path))
        self.assertEqual(rc, 0, e)
        lic = json.loads(lic_path.read_text("utf-8"))["licence"]
        self.assertEqual(lic["limits"], {"users": 8, "binders": None, "archives": 10})
        self.assertNotIn("ai_credits", lic["features"])
        self.assertIn("white_label", lic["features"])
        self.assertEqual(lic["instance_id"], "11111111-aaaa-bbbb-cccc-000000000001")

        rc, o, _ = self.c("licence", "verify", str(lic_path))
        self.assertEqual(rc, 0)
        self.assertIn("VALIDA", o)
        rc, o, _ = self.c("licence", "show", str(lic_path), "--json")
        self.assertEqual(json.loads(o)["mode"], "full")
        rc, o, _ = self.c("licence", "verify", str(lic_path), "--instance-id", "altro")
        self.assertEqual(rc, 3)

        # export the public keys and verify as the server would (standalone)
        pk = Path(d) / "pub.json"
        self.assertEqual(self.c("export-public-key", "--out", str(pk))[0], 0)
        st = L.verify(lic_path.read_bytes(), L.load_public_keys_json(pk.read_text()))
        self.assertEqual(st.mode, L.MODE_FULL)

        # tampered file -> exit code 3
        bad = Path(d) / "bad.docmap-licence"
        bad.write_text(lic_path.read_text("utf-8").replace('"users": 8', '"users": 99'), "utf-8")
        rc, o, _ = self.c("licence", "verify", str(bad))
        self.assertEqual(rc, 3)
        self.assertIn("NON VALIDA", o)

        # reseller client gets branding
        rc, o, e = self.c("licence", "issue", "--instance", "PC Neri", "--plan", "studio", "--months", "1")
        self.assertEqual(rc, 0, e)
        rc, o, _ = self.c("licence", "renew", "PC Neri")
        self.assertEqual(rc, 0)
        rc, o, _ = self.c("licence", "list")
        self.assertEqual(o.count("VALIDA"), 3)

        # rotation keeps old licences verifiable
        self.assertEqual(self.c("keygen", "--rotate")[0], 0)
        self.assertEqual(self.c("licence", "verify", str(lic_path))[0], 0)
        rc, o, _ = self.c("keys", "list")
        self.assertIn("retired", o)

        bk = Path(d) / "bk.zip"
        self.assertEqual(self.c("backup", "--out", str(bk))[0], 0)
        import zipfile
        names = zipfile.ZipFile(bk).namelist()
        self.assertIn("registry.sqlite3", names)
        self.assertTrue(any(n.endswith(".key.pem") for n in names))
        self.assertIn("keys/keys.json", names)

        rc, o, _ = self.c("log")
        for action in ("hub.backup", "key.generate", "key.rotate", "licence.issue", "licence.renew", "customer.add"):
            self.assertIn(action, o)

        # wrong passphrase
        os.environ[cli.ENV_PASSPHRASE] = "sbagliata-sbagliata"
        rc, _, e = self.c("licence", "issue", "--instance", "PC Rossi", "--plan", "studio")
        self.assertEqual(rc, 1)
        self.assertIn("Passphrase errata", e)

        # no private key material or passphrase in the registry
        con = sqlite3.connect(str(Path(d) / "registry.sqlite3"))
        dump = "\n".join(con.iterdump())
        con.close()
        self.assertNotIn(PASS, dump)
        self.assertNotIn("PRIVATE KEY", dump)

    def test_group_without_action_prints_help(self):
        rc, o, _ = self.c("customer")
        self.assertEqual(rc, 2)
        self.assertIn("add", o)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


class TestWeb(TempDir):
    def setUp(self):
        super().setUp()
        from docmap_hub.web import make_server
        self.hub = Hub(self.dir)
        self.hub.keys.generate(PASS)
        c = self.hub.registry.add_customer("Studio Web")
        self.inst = self.hub.registry.add_instance(c["id"], label="PC Web")
        with self.assertRaises(WrongPassphrase):
            make_server(self.hub, "passphrase-errata")
        self.httpd = make_server(self.hub, PASS, port=0)
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        self.t = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.t.start()
        self.addCleanup(self._stop)
        self.opener = urllib.request.build_opener(NoRedirect)

    def _stop(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.hub.close()

    def req(self, path, data=None, cookie=None, host=None):
        r = urllib.request.Request(self.base + path,
                                   data=urllib.parse.urlencode(data).encode() if data is not None else None)
        if cookie:
            r.add_header("Cookie", cookie)
        if host:
            r.add_header("Host", host)
        try:
            resp = self.opener.open(r, timeout=10)
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers), e.read().decode("utf-8", "replace")
        return resp.status, dict(resp.headers), resp.read().decode("utf-8", "replace")

    def test_login_issue_download(self):
        code, h, _ = self.req("/")
        self.assertEqual((code, h["Location"]), (303, "/login"))
        code, _, _ = self.req("/", host="evil.example:80")
        self.assertEqual(code, 400)
        code, _, body = self.req("/login", {"passphrase": "no"})
        self.assertEqual(code, 403)
        code, h, _ = self.req("/login", {"passphrase": PASS})
        self.assertEqual(code, 303)
        cookie = h["Set-Cookie"].split(";")[0]
        code, _, body = self.req("/", cookie=cookie)
        self.assertEqual(code, 200)
        self.assertIn("Studio Web", body)
        self.assertNotIn("http://", body.replace(self.base, ""))  # no external assets
        csrf = body.split("name='csrf' value='")[1].split("'")[0]
        # missing CSRF token -> refused
        code, _, _ = self.req("/issue", {"instance": self.inst["id"], "plan": "studio"}, cookie=cookie)
        self.assertEqual(code, 403)
        code, h, _ = self.req("/issue", {"instance": self.inst["id"], "plan": "studio", "users": "3",
                                         "csrf": csrf}, cookie=cookie)
        self.assertEqual(code, 303)
        lid = urllib.parse.parse_qs(urllib.parse.urlsplit(h["Location"]).query)["new"][0]
        code, h, body = self.req(f"/download/{lid}", cookie=cookie)
        self.assertEqual(code, 200)
        self.assertIn("attachment", h["Content-Disposition"])
        st = L.verify(body.encode(), self.hub.keys.public_keys(), instance_id=self.inst["id"])
        self.assertEqual(st.mode, L.MODE_FULL)
        self.assertEqual(st.limits["users"], 3)
        code, h, _ = self.req("/renew", {"ref": lid, "csrf": csrf}, cookie=cookie)
        self.assertEqual(code, 303)
        self.assertEqual(len(self.hub.registry.list_licences()), 2)
        # errors are reported, not crashing
        code, h, _ = self.req("/issue", {"instance": "nope", "plan": "studio", "csrf": csrf}, cookie=cookie)
        self.assertIn("err=", h["Location"])
        code, _, body = self.req("/?err=%3Cscript%3E", cookie=cookie)
        self.assertNotIn("<script>", body)


if __name__ == "__main__":
    unittest.main()
