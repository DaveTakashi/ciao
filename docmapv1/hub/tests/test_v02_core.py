"""v0.2: registry migration, vault (cassaforte), port manager, CLI basics."""

import contextlib
import io
import json
import os
import socket
import sqlite3
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from docmap_hub import cli
from docmap_hub.ports import PortError, PortManager, is_free
from docmap_hub.registry import Registry, RegistryError
from docmap_hub.service import Hub
from docmap_hub.vault import EscrowRefused, Vault, VaultError, WrongVaultPassphrase

PASS = "una-passphrase-lunga"


class TempHub(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.addCleanup(self._td.cleanup)
        self.dir = Path(self._td.name) / "hub"
        self.hub = Hub(self.dir)
        self.addCleanup(self.hub.close)
        self.reg = self.hub.registry
        self.cust = self.reg.add_customer("Studio Rossi")
        self.inst = self.reg.add_instance(self.cust["id"], label="PC Rossi")
        self.prod = self.reg.add_environment(self.inst["id"], "production", "web-php",
                                             url="https://example.invalid/studio-de/",
                                             api_url="https://example.invalid/studio-de/server-php/api.php")


class TestRegistryV02(TempHub):
    def test_migration_from_v1_database(self):
        # a v0.1 database (schema 1) upgrades in place, data kept
        d = Path(self._td.name) / "old"
        d.mkdir()
        con = sqlite3.connect(str(d / "registry.sqlite3"))
        from docmap_hub.registry import MIGRATIONS
        con.execute("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)")
        for sql in MIGRATIONS[0][1]:
            con.execute(sql)
        con.execute("INSERT INTO meta VALUES('schema_version','1')")
        con.execute("INSERT INTO customers(id,name,created_at) VALUES('cus-1','Vecchio','2026-01-01T00:00:00Z')")
        con.commit()
        con.close()
        r = Registry(d)
        from docmap_hub.registry import SCHEMA_VERSION
        self.assertEqual(r.schema_version(), SCHEMA_VERSION)  # upgraded straight to the latest schema
        c = r.get_customer("Vecchio")
        self.assertEqual(c["key_escrow"], 0)
        r.close()

    def test_environment_rules(self):
        with self.assertRaises(RegistryError):
            self.reg.add_environment(self.inst["id"], "production", "web-php")  # duplicate
        with self.assertRaises(RegistryError):
            self.reg.add_environment(self.inst["id"], "Prova!", "web-php")
        with self.assertRaises(RegistryError):
            self.reg.add_environment(self.inst["id"], "staging", "ftp-magic")
        st = self.reg.add_environment("PC Rossi", "staging", "local-python")
        self.assertEqual(self.reg.get_environment("pc rossi", "staging")["id"], st["id"])
        names = [e["name"] for e in self.reg.list_environments()]
        self.assertEqual(names, ["production", "staging"])
        e = self.reg.update_environment(st["id"], settings={"a": 1}, status="running")
        self.assertEqual((e["settings"], e["status"]), ({"a": 1}, "running"))
        with self.assertRaises(RegistryError):
            self.reg.update_environment(st["id"], id="x")


class TestVault(TempHub):
    def test_init_unlock_put_get_audit(self):
        v = Vault(self.reg)
        self.assertFalse(v.initialized)
        with self.assertRaises(VaultError):
            v.init("corta")
        vk = v.init(PASS)
        with self.assertRaises(VaultError):
            v.init(PASS)
        with self.assertRaises(WrongVaultPassphrase):
            v.unlock("passphrase-sbagliata")
        self.assertEqual(v.unlock(PASS).fingerprint, vk.fingerprint)
        self.assertNotIn(vk.key.hex(), repr(vk))
        v.put(vk, self.prod["id"], "ftp", {"host": "ftp.example.it", "user": "dave", "password": "Segretissima-1",
                                           "remote_path": "/public_html/studio-de"})
        with self.assertRaises(VaultError):
            v.put(vk, self.prod["id"], "ftp", {"host": "h", "user": "u", "password": "p", "remote_path": "/x",
                                               "protocol": "telnet"})
        got = v.get(vk, self.prod["id"], "ftp", reason="test")
        self.assertEqual((got["protocol"], got["port"], got["password"]), ("ftps", 21, "Segretissima-1"))
        # nothing readable at rest
        con = sqlite3.connect(str(self.reg.path))
        dump = "\n".join(con.iterdump())
        con.close()
        self.assertNotIn("Segretissima-1", dump)
        self.assertNotIn(PASS, dump)
        # every reveal is audited, without the secret
        ev = [e for e in self.reg.events(100) if e["action"] == "vault.reveal"]
        self.assertEqual(len(ev), 1)
        self.assertIn('"reason": "test"', ev[0]["details_json"])
        self.assertNotIn("Segretissima", json.dumps(self.reg.events(100)))
        # ciphertext bound to its row (env|kind|label): moving it to another row fails
        self.reg.conn.execute("UPDATE secrets SET label='altro' WHERE kind='ftp'")
        self.reg.conn.commit()
        with self.assertRaises(VaultError):
            v.get(vk, self.prod["id"], "ftp", "altro", reason="test")
        self.assertIsNone(v.get(vk, self.prod["id"], "basic_auth", reason="t", required=False))
        with self.assertRaises(VaultError):
            v.get(vk, self.prod["id"], "basic_auth", reason="t")

    def test_key_escrow_gdpr(self):
        v = Vault(self.reg)
        vk = v.init(PASS)
        cfg = {"content": '{"aes_key": "AAAA", "data_dir": "/x"}', "format": "json"}
        with self.assertRaises(EscrowRefused):
            v.put(vk, self.prod["id"], "db_config", cfg)
        with self.assertRaises(EscrowRefused):  # aes_key smuggled in a note
            v.put(vk, self.prod["id"], "note", {"text": "aes_key = AAAA"})
        self.reg.set_key_escrow("Studio Rossi", True)
        v.put(vk, self.prod["id"], "db_config", cfg)
        self.assertEqual(v.escrowed_count("Studio Rossi"), 1)
        self.assertEqual(v.purge_escrow("Studio Rossi"), 1)
        self.assertEqual(v.escrowed_count("Studio Rossi"), 0)

    def test_change_passphrase_export_import_backup(self):
        v = Vault(self.reg)
        vk = v.init(PASS)
        v.put(vk, self.prod["id"], "basic_auth", {"user": "studio", "password": "pw-cartella"})
        v.put(vk, self.prod["id"], "admin_token", {"user": "admin", "token": "tok123"}, label="admin")
        self.assertEqual(v.change_passphrase(PASS, "nuova-passphrase-x"), 2)
        with self.assertRaises(WrongVaultPassphrase):
            v.unlock(PASS)
        vk2 = v.unlock("nuova-passphrase-x")
        self.assertEqual(v.get(vk2, self.prod["id"], "basic_auth", reason="t")["password"], "pw-cartella")
        exp = v.export_data()
        self.assertNotIn("pw-cartella", json.dumps(exp))
        # backup contains the (encrypted) export
        bk = self.hub.backup(Path(self._td.name) / "bk.zip")
        z = zipfile.ZipFile(bk)
        self.assertIn("vault-export.json", z.namelist())
        self.assertNotIn(b"pw-cartella", z.read("vault-export.json"))
        # import into another hub (same instance id, matched by instance + env name)
        other = Hub(Path(self._td.name) / "hub2")
        try:
            c = other.registry.add_customer("Studio Rossi")
            other.registry.add_instance(c["id"], label="PC Rossi", instance_id=self.inst["id"])
            other.registry.add_environment(self.inst["id"], "production", "web-php")
            ov = Vault(other.registry)
            ovk = ov.init("passphrase-del-secondo")
            with self.assertRaises(WrongVaultPassphrase):
                ov.import_data(ovk, exp, "sbagliata-sbagliata")
            r = ov.import_data(ovk, exp, "nuova-passphrase-x")
            self.assertEqual(r["imported"], 2)
            env2 = other.registry.get_environment(self.inst["id"], "production")
            self.assertEqual(ov.get(ovk, env2["id"], "admin_token", "admin", reason="t")["token"], "tok123")
            self.assertEqual(ov.import_data(ovk, exp, "nuova-passphrase-x")["skipped"], 2)
        finally:
            other.close()


def _hold(port, host="127.0.0.1", family=socket.AF_INET):
    s = socket.socket(family, socket.SOCK_STREAM)
    s.bind((host, port))
    s.listen(1)
    return s


def _free_block(n=6):
    """Find n consecutive free ports for an isolated range."""
    for start in range(41000, 60000, 37):
        if all(is_free(p) for p in range(start, start + n)):
            return start
    raise unittest.SkipTest("nessun blocco di porte libere")


class TestPorts(TempHub):
    def setUp(self):
        super().setUp()
        self.pm = PortManager(self.reg)
        self.base = _free_block()
        self.pm.set_range(self.base, self.base + 5)
        self.envs = [self.reg.add_environment(self.inst["id"], n, "local-python")
                     for n in ("staging", "demo-a", "demo-b")]
        self.held = []
        self.addCleanup(lambda: [s.close() for s in self.held])

    def test_allocate_skips_busy_and_reserved(self):
        self.held.append(_hold(self.base))                 # another program on the first port
        p1 = self.pm.allocate(self.envs[0]["id"])
        self.assertEqual(p1, self.base + 1)
        self.assertEqual(self.pm.allocate(self.envs[0]["id"]), p1)  # stable
        p2 = self.pm.allocate(self.envs[1]["id"])
        self.assertNotEqual(p1, p2)
        self.assertEqual(self.reg.get_environment(self.envs[1]["id"])["port"], p2)
        # the database itself forbids two environments on one port
        with self.assertRaises(sqlite3.IntegrityError):
            self.reg.conn.execute("INSERT INTO port_reservations(port, env_id, reserved_at) VALUES(?,?,?)",
                                  (p1, self.envs[2]["id"], "x"))
        self.reg.conn.rollback()
        self.assertEqual(self.pm.release(self.envs[0]["id"]), p1)
        self.assertIsNone(self.reg.get_environment(self.envs[0]["id"])["port"])
        self.assertEqual(self.pm.allocate(self.envs[2]["id"]), p1)  # released port reused

    def test_ensure_moves_when_port_taken(self):
        p = self.pm.allocate(self.envs[0]["id"])
        self.assertEqual(self.pm.ensure(self.envs[0]["id"]), (p, None))
        self.held.append(_hold(p, "0.0.0.0"))             # some program grabbed it meanwhile
        new, moved = self.pm.ensure(self.envs[0]["id"])
        self.assertEqual(moved, p)
        self.assertNotEqual(new, p)
        self.assertEqual(self.pm.reserved(self.envs[0]["id"]), new)
        mv = [e for e in self.reg.events(20) if e["action"] == "port.move"]
        self.assertEqual(len(mv), 1)
        self.assertIn(f'"from": {p}', mv[0]["details_json"])
        rows = self.pm.list()
        self.assertEqual([r["port"] for r in rows], [new])
        self.assertTrue(rows[0]["free_now"])

    def test_ipv6_listener_detected(self):
        if not socket.has_ipv6:
            self.skipTest("IPv6 non disponibile")
        try:
            s = _hold(self.base + 2, "::1", socket.AF_INET6)
        except OSError:
            self.skipTest("::1 non disponibile")
        self.held.append(s)
        self.assertFalse(is_free(self.base + 2))

    def test_range_exhausted_and_validation(self):
        with self.assertRaises(PortError):
            self.pm.set_range(80, 90)
        self.pm.set_range(self.base, self.base + 1)
        for p in (self.base, self.base + 1):
            self.held.append(_hold(p))
        with self.assertRaises(PortError):
            self.pm.allocate(self.envs[0]["id"])


def run_cli(*argv):
    o, e = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(o), contextlib.redirect_stderr(e):
        rc = cli.main(list(argv))
    return rc, o.getvalue(), e.getvalue()


class TestCliV02(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.addCleanup(self._td.cleanup)
        self.d = str(Path(self._td.name) / "hub")
        self._old = os.environ.get(cli.ENV_PASSPHRASE)
        os.environ[cli.ENV_PASSPHRASE] = PASS
        self.addCleanup(lambda: os.environ.pop(cli.ENV_PASSPHRASE, None) if self._old is None
                        else os.environ.__setitem__(cli.ENV_PASSPHRASE, self._old))

    def c(self, *a):
        return run_cli("--dir", self.d, *a)

    def test_vault_env_status_flow(self):
        self.assertEqual(self.c("keygen")[0], 0)
        self.assertEqual(self.c("vault", "init")[0], 0)
        self.c("customer", "add", "--name", "Studio Bianchi")
        self.c("instance", "add", "--customer", "Studio Bianchi", "--label", "PC Bianchi")
        rc, o, e = self.c("env", "add", "--instance", "PC Bianchi", "--name", "production", "--kind", "web-php",
                          "--url", "https://docmap.example.it/studio-bi/")
        self.assertEqual(rc, 0, e)
        self.assertIn("server-php/api.php", o)
        env = json.loads(self.c("status", "--json")[1])[0]
        self.assertEqual((env["env"], env["kind"], env["api_url"]),
                         ("production", "web-php", "https://docmap.example.it/studio-bi/server-php/api.php"))
        rc, o, e = self.c("vault", "set", "--instance", "PC Bianchi", "--env", "production", "--kind", "ftp",
                          "--field", "host=ftp.example.it", "--field", "user=u", "--field", "password=pw-ftp-1",
                          "--field", "remote_path=/public_html/studio-bi")
        self.assertEqual(rc, 0, e)
        rc, o, _ = self.c("vault", "list")
        self.assertIn("ftp", o)
        self.assertNotIn("pw-ftp-1", o)
        rc, o, _ = self.c("vault", "reveal", "--instance", "PC Bianchi", "--env", "production", "--kind", "ftp",
                          "--reason", "controllo")
        self.assertEqual(json.loads(o)["password"], "pw-ftp-1")
        rc, _, e = self.c("vault", "set", "--instance", "PC Bianchi", "--env", "production", "--kind", "db_config",
                          "--field", 'content={"aes_key":"x"}')
        self.assertEqual(rc, 1)
        self.assertIn("key-escrow on", e)
        self.assertEqual(self.c("customer", "set", "--customer", "Studio Bianchi", "--key-escrow", "on")[0], 0)
        self.assertEqual(self.c("vault", "set", "--instance", "PC Bianchi", "--env", "production", "--kind",
                                "db_config", "--field", 'content={"aes_key":"x"}')[0], 0)
        rc, _, e = self.c("customer", "set", "--customer", "Studio Bianchi", "--key-escrow", "off")
        self.assertEqual(rc, 1)
        self.assertIn("--purge", e)
        self.assertEqual(self.c("customer", "set", "--customer", "Studio Bianchi", "--key-escrow", "off",
                                "--purge")[0], 0)
        # deleting production needs --production --confirm "<name>"
        rc, _, e = self.c("env", "delete", "--instance", "PC Bianchi", "--name", "production")
        self.assertEqual(rc, 1)
        self.assertIn("--confirm", e)
        rc, o, e = self.c("env", "delete", "--instance", "PC Bianchi", "--name", "production", "--production",
                          "--confirm", "PC Bianchi")
        self.assertEqual(rc, 0, e)
        self.assertIn("NON è stato toccato", o)
        rc, o, _ = self.c("log", "--limit", "100")
        for a in ("vault.init", "vault.store", "vault.reveal", "env.add", "env.delete", "customer.key_escrow"):
            self.assertIn(a, o)
        rc, o, _ = self.c("ports", "list")
        self.assertIn("18400-18999", o)
        self.assertEqual(self.c("settings", "set", "ports.range", "19000-19100")[0], 0)
        self.assertIn("19000-19100", self.c("ports", "list")[1])
        self.assertEqual(self.c("settings", "set", "ports.range", "1-2")[0], 1)
        self.assertEqual(self.c("env")[0], 2)  # group without action → help

    def test_cli_deploy_dry_run_and_studio_env(self):
        self.assertEqual(self.c("vault", "init")[0], 0)
        self.c("customer", "add", "--name", "Studio Verdi")
        self.c("instance", "add", "--customer", "Studio Verdi", "--label", "PC Verdi")
        self.assertEqual(self.c("env", "add", "--instance", "PC Verdi", "--name", "staging", "--kind", "web-php",
                                "--url", "https://h.invalid/studio-ve/")[0], 0)
        rc, o, e = self.c("env", "add", "--instance", "PC Verdi", "--name", "production", "--kind", "studio-python",
                          "--url", "https://192.168.1.10:8443/", "--ca", "C:/DocMap/certificati/DocMap-CA-studio.crt")
        self.assertEqual(rc, 0, e)
        self.assertIn("https://192.168.1.10:8443/api", o)
        site = Path(self._td.name) / "site"
        site.mkdir()
        self.assertEqual(self.c("vault", "set", "--instance", "PC Verdi", "--env", "staging", "--kind", "ftp",
                                "--field", "protocol=local", "--field", f"remote_path={site}")[0], 0)
        rc, o, e = self.c("deploy", "--instance", "PC Verdi", "--env", "staging", "--dry-run")
        self.assertEqual(rc, 0, e)
        self.assertIn("Prova (dry-run)", o)
        self.assertIn("+ 404.html", o)
        self.assertEqual(list(site.iterdir()), [])
        rc, _, e = self.c("promote", "--instance", "PC Verdi", "--dry-run")
        self.assertEqual(rc, 1)
        self.assertIn("web-php", e)


if __name__ == "__main__":
    unittest.main()
