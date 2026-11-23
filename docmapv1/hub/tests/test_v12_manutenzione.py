"""v0.12: upkeep for future updates — registry migrations from every old schema, data written by a newer hub,
backup on the first run of a new version, «Controllo dell'hub», backup verification and a safe restore."""

import io
import json
import os
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
import zipfile
from contextlib import redirect_stderr, redirect_stdout
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from docmap_hub import __version__
from docmap_hub import backups as B
from docmap_hub import doctor
from docmap_hub.registry import MIGRATIONS, SCHEMA_VERSION, Registry
from docmap_hub.service import Hub, version_tuple
from test_v04_manager import PASS, WebHarness


def cli(*argv, data_dir):
    from docmap_hub.cli import main
    out, err = io.StringIO(), io.StringIO()
    with mock.patch.dict(os.environ, {"DOCMAP_HUB_DIR": str(data_dir)}), redirect_stdout(out), redirect_stderr(err):
        rc = main(list(argv))
    return rc, out.getvalue(), err.getvalue()


def old_registry(data_dir: Path, schema: int) -> Path:
    """A registry as an old hub left it: only the first `schema` migrations, one customer and one instance."""
    data_dir.mkdir(parents=True, exist_ok=True)
    db = data_dir / "registry.sqlite3"
    conn = sqlite3.connect(str(db))
    conn.execute("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)")
    for v, stmts in MIGRATIONS:
        if v > schema:
            break
        for sql in stmts:
            conn.execute(sql)
    conn.execute("INSERT INTO meta VALUES('schema_version', ?)", (str(schema),))
    conn.execute("INSERT INTO customers(id, name, created_at) VALUES('cus-old', 'Studio Vecchio', '2026-01-01T00:00:00Z')")
    conn.execute("INSERT INTO instances(id, customer_id, label, created_at) "
                 "VALUES('ins-old', 'cus-old', 'sede', '2026-01-01T00:00:00Z')")
    conn.commit()
    conn.close()
    return db


class Base(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.addCleanup(self._td.cleanup)
        self.tmp = Path(self._td.name)
        self.dir = self.tmp / "hub"


class TestMigrations(Base):
    def test_every_old_schema_upgrades_without_losing_data(self):
        for schema in range(1, SCHEMA_VERSION):
            with self.subTest(schema=schema):
                d = self.tmp / f"s{schema}"
                old_registry(d, schema)
                with Registry(d) as reg:
                    self.assertEqual(reg.schema_version(), SCHEMA_VERSION)
                    self.assertEqual(reg.get_customer("cus-old")["name"], "Studio Vecchio")
                    inst = reg.get_instance("ins-old")
                    self.assertTrue(inst.get("project_id"), "v3 backfill gives every instance a project")
                    self.assertIsNone(reg.newer_schema)
                    reg.add_customer("Studio Nuovo")              # the upgraded registry is writable
                copies = list((d / "backups").glob(f"registro-prima-dello-schema-{SCHEMA_VERSION}-da-{schema}-*"))
                self.assertEqual(len(copies), 1, "a copy of the old registry is kept before migrating")
                facts = B._registry_facts(copies[0])
                self.assertEqual((facts["schema"], facts["integrity"]), (schema, "ok"))
                with Registry(d) as reg:                          # second open: no-op, no second copy
                    self.assertEqual(len(reg.list_customers()), 2)
                self.assertEqual(len(list((d / "backups").glob("registro-prima-*"))), 1)

    def test_data_from_a_newer_hub_is_reported_not_touched(self):
        Hub(self.dir).close()
        conn = sqlite3.connect(str(self.dir / "registry.sqlite3"))
        conn.execute("UPDATE meta SET value='99' WHERE key='schema_version'")
        conn.commit()
        conn.close()
        with Registry(self.dir) as reg:
            self.assertEqual(reg.newer_schema, 99)
            self.assertEqual(reg.schema_version(), 99)          # never lowered
        rep = doctor.run(self.dir)
        self.assertEqual(rep["level"], "error")
        self.assertIn("schema", [r["id"] for r in rep["results"] if r["level"] == "error"])


class TestVersionTracking(Base):
    def _meta(self, key, value):
        conn = sqlite3.connect(str(self.dir / "registry.sqlite3"))
        if value is None:
            conn.execute("DELETE FROM meta WHERE key=?", (key,))
        else:
            conn.execute("INSERT INTO meta VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, value))
        conn.commit()
        conn.close()

    def upgrade_backups(self):
        return sorted((self.dir / "backups").glob(f"{B.UPGRADE_PREFIX}*.zip"))

    def test_fresh_hub_no_backup_then_new_version_backs_up_once(self):
        with Hub(self.dir) as hub:
            self.assertIsNone(hub.upgrade)
            self.assertEqual(hub.registry.get_meta("hub_version"), __version__)
        self.assertEqual(self.upgrade_backups(), [])
        # data left by 0.11.2 (no hub_version at all): first run of this version → backup + event
        self._meta("hub_version", None)
        self._meta("hub_version_max", None)
        with Hub(self.dir) as hub:
            hub.registry.add_customer("Studio Rossi")
            self.assertIsNotNone(hub.upgrade)
            self.assertIsNone(hub.upgrade["from"])
            self.assertTrue(hub.upgrade["backup"].startswith(f"{B.UPGRADE_PREFIX}{__version__}-"))
            self.assertIn("hub.upgrade", [e["action"] for e in hub.registry.events(10)])
        self.assertEqual(len(self.upgrade_backups()), 1)
        self.assertTrue(B.verify(self.upgrade_backups()[0])["ok"])
        with Hub(self.dir) as hub:
            self.assertEqual(B.list_backups(hub)[0]["kind"], "aggiornamento")
        with Hub(self.dir) as hub:                                # same version again: nothing
            self.assertIsNone(hub.upgrade)
        self._meta("hub_version", "0.11.2")
        with Hub(self.dir) as hub:
            self.assertEqual(hub.upgrade["from"], "0.11.2")

    def test_older_hub_on_newer_data_is_flagged_not_backed_up(self):
        Hub(self.dir).close()
        self._meta("hub_version", "9.0.0")
        self._meta("hub_version_max", "9.0.0")
        before = len(list((self.dir / "backups").glob("*")))
        with Hub(self.dir) as hub:
            self.assertTrue(hub.upgrade["older"])
            self.assertEqual(hub.registry.get_meta("hub_version_max"), "9.0.0")
        self.assertEqual(len(list((self.dir / "backups").glob("*"))), before)
        rep = doctor.run(self.dir)
        self.assertIn("version", [r["id"] for r in rep["results"] if r["level"] == "warn"])

    def test_version_tuple(self):
        self.assertLess(version_tuple("0.9.0"), version_tuple("0.10.0"))
        self.assertLess(version_tuple("0.11.2"), version_tuple("0.12.0"))
        self.assertLess(version_tuple(None), version_tuple("0.1"))


class TestVerifyRestore(Base):
    def setUp(self):
        super().setUp()
        self.hub = Hub(self.dir)
        self.hub.keys.generate(PASS)
        self.hub.registry.add_customer("Studio Prima")
        self.good = self.hub.backup()
        self.hub.close()

    def test_verify_good_backup(self):
        r = B.verify(self.good)
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["counts"]["customers"], 1)
        self.assertEqual(r["schema"], SCHEMA_VERSION)
        self.assertTrue(r["active_key"])

    def test_verify_finds_broken_backups(self):
        cut = self.tmp / "tagliato.zip"
        cut.write_bytes(self.good.read_bytes()[: self.good.stat().st_size // 2])
        self.assertIn("zip", " ".join(B.verify(cut)["problems"]))
        # garbage registry
        bad = self.tmp / "registro-rotto.zip"
        with zipfile.ZipFile(self.good) as src, zipfile.ZipFile(bad, "w") as dst:
            for n in src.namelist():
                dst.writestr(n, b"non sono sqlite " * 200 if n == "registry.sqlite3" else src.read(n))
        self.assertFalse(B.verify(bad)["ok"])
        # missing private key / foreign files / no registry
        nokey = self.tmp / "senza-chiave.zip"
        with zipfile.ZipFile(self.good) as src, zipfile.ZipFile(nokey, "w") as dst:
            for n in src.namelist():
                if not n.endswith(".key.pem"):
                    dst.writestr(n, src.read(n))
            dst.writestr("../fuori.txt", b"x")
        probs = " ".join(B.verify(nokey)["problems"])
        self.assertIn("chiave privata attiva", probs)
        self.assertIn("../fuori.txt", probs)
        empty = self.tmp / "vuoto.zip"
        with zipfile.ZipFile(empty, "w") as z:
            z.writestr("plans.json", "{}")
        self.assertIn("manca il registro", " ".join(B.verify(empty)["problems"]))
        self.assertFalse(B.verify(self.tmp / "non-esiste.zip")["ok"])

    def test_restore_puts_back_and_keeps_current_aside(self):
        with Hub(self.dir) as hub:
            hub.registry.add_customer("Studio Dopo")
            key_before = hub.keys.active_id
        (self.dir / "clienti").mkdir()
        (self.dir / "clienti" / "pacchetto.txt").write_text("resta")
        res = B.restore(self.dir, self.good)
        with Hub(self.dir) as hub:
            names = [c["name"] for c in hub.registry.list_customers()]
            self.assertEqual(hub.keys.active_id, key_before)
            hub.keys.load_private(PASS)                          # the restored key still opens
        self.assertEqual(names, ["Studio Prima"])
        aside = Path(res["aside"])
        self.assertTrue((aside / "registry.sqlite3").exists())
        self.assertEqual(B._registry_facts(aside / "registry.sqlite3")["counts"]["customers"], 2)
        self.assertEqual((self.dir / "clienti" / "pacchetto.txt").read_text(), "resta")   # not touched

    def test_restore_refuses_bad_backup_and_open_page(self):
        bad = self.tmp / "x.zip"
        bad.write_bytes(b"PK broken")
        with self.assertRaises(Exception):
            B.restore(self.dir, bad)
        self.assertTrue((self.dir / "registry.sqlite3").exists())   # nothing moved

        class H(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(401)
                self.end_headers()

            def log_message(self, *a):
                pass
        srv = HTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.server_close)
        self.addCleanup(srv.shutdown)
        (self.dir / "pagina-hub.txt").write_text(f"http://127.0.0.1:{srv.server_address[1]}/\n")
        with mock.patch.dict(os.environ, {"NO_PROXY": "127.0.0.1"}):
            with self.assertRaisesRegex(Exception, "pagina dell'hub è aperta"):
                B.restore(self.dir, self.good)
        srv.shutdown()
        srv.server_close()
        time.sleep(0.2)
        res = B.restore(self.dir, self.good)                        # stale marker: page closed → ok
        self.assertTrue(res["aside"])

    def test_restore_of_a_registry_copy(self):
        old_registry(self.tmp / "old", 2)
        with Registry(self.tmp / "old"):
            pass
        copy = next((self.tmp / "old" / "backups").glob("registro-prima-*"))
        res = B.restore(self.dir, copy)
        self.assertEqual(res["kind"], "registro")
        with Hub(self.dir) as hub:                                  # migrated again on open, keys untouched
            self.assertEqual(hub.registry.get_customer("cus-old")["name"], "Studio Vecchio")
            self.assertTrue(hub.keys.active_id)

    def test_automatic_backup_is_verified(self):
        with Hub(self.dir) as hub:
            r = B.run(hub, auto=True)
        self.assertTrue(r["verified"])
        self.assertEqual(r["verify_problems"], [])


class TestCli(Base):
    def test_controllo_verifica_ripristina(self):
        with Hub(self.dir) as hub:
            hub.keys.generate(PASS)
            hub.registry.add_customer("Studio Uno")
            hub.backup()
            hub.registry.add_customer("Studio Due")
        rc, out, _ = cli("controllo", data_dir=self.dir)
        self.assertEqual(rc, 0, out)
        self.assertIn("Registro integro", out)
        rc, out, _ = cli("controllo", "--json", data_dir=self.dir)
        self.assertIn(json.loads(out)["level"], ("ok", "warn"))
        rc, out, _ = cli("verifica-backup", "--tutti", data_dir=self.dir)
        self.assertEqual(rc, 0, out)
        self.assertIn("OK ", out)
        rc, out, err = cli("ripristina-backup", "--ultimo", data_dir=self.dir)   # no tty and no --si
        self.assertEqual(rc, 1)
        self.assertIn("--si", err)
        rc, out, err = cli("ripristina-backup", "--ultimo", "--si", data_dir=self.dir)
        self.assertEqual(rc, 0, err)
        self.assertIn("Fatto: 1 clienti", out)
        with Hub(self.dir) as hub:
            self.assertIn("hub.restore", [e["action"] for e in hub.registry.events(5)])

    def test_damaged_registry_message_not_traceback(self):
        self.dir.mkdir(parents=True)
        (self.dir / "registry.sqlite3").write_bytes(b"questo non e un database " * 100)
        rc, out, err = cli("customer", "list", data_dir=self.dir)
        self.assertEqual(rc, 1)
        self.assertIn("ripristina-backup", err)
        self.assertNotIn("Traceback", err)
        rc, out, _ = cli("controllo", data_dir=self.dir)
        self.assertEqual(rc, 1)
        self.assertIn("ERRORE", out)

    def test_every_command_has_help(self):
        from docmap_hub.cli import build_parser
        ap = build_parser()
        sub = next(a for a in ap._actions if a.__class__.__name__ == "_SubParsersAction")

        def walk(parser, path):
            for a in parser._actions:
                if a.__class__.__name__ == "_SubParsersAction":
                    for name, p in a.choices.items():
                        yield from walk(p, path + [name])
            yield path
        n = 0
        for path in walk(ap, []):
            if not path:
                continue
            buf = io.StringIO()
            with redirect_stdout(buf), self.assertRaises(SystemExit) as cm:
                build_parser().parse_args(path + ["--help"])
            self.assertEqual(cm.exception.code, 0, path)
            n += 1
        self.assertGreater(n, 60)
        self.assertIn("controllo", sub.choices)


class TestWeb(WebHarness, unittest.TestCase):
    def setUp(self):
        self.start()
        self.assertEqual(self.login()[0], 200)

    def test_check_and_verify_api(self):
        code, _, r = self.call("/api/hub/check")
        self.assertEqual(code, 200, r)
        ids = {x["id"] for x in r["results"]}
        self.assertTrue({"python", "registry", "keys", "backup"} <= ids)
        name = B.run(self.hub, auto=False)["name"]
        code, _, v = self.call("/api/backups/verify", {"name": name})
        self.assertEqual(code, 200, v)
        self.assertTrue(v["ok"], v)
        self.assertEqual(self.call("/api/backups/verify", {"name": "../registry.sqlite3"})[0], 400)
        self.assertEqual(self.call("/api/backups/verify", {"name": name}, csrf=False)[0], 403)


class TestSituazione(Base):
    def test_rows_and_csv(self):
        from docmap_hub import report
        with Hub(self.dir) as hub:
            hub.keys.generate(PASS)
            reg = hub.registry
            c = reg.add_customer("=Studio Rossi", vat_id="IT0123")
            inst = reg.add_instance(c["id"], label="sede")
            reg.add_environment(inst["id"], "production", "web-php", url="https://esempio.test/rossi/")
            plan = next(iter(hub.plans))
            hub.issue(PASS, inst["id"], plan, months=12)
            reg.add_customer("Studio Senza Niente")
            data = report.rows(hub)
            self.assertEqual(len(data), 2)
            r = next(x for x in data if x["env"] == "production")
            self.assertEqual((r["kind"], r["licence_state"], r["plan"]), ("sito online", "attiva", plan))
            self.assertEqual(next(x for x in data if x["customer"] == "Studio Senza Niente")["licence_state"], "nessuna")
            raw = report.to_csv(data)
            self.assertTrue(raw.startswith("﻿".encode()))
            text = raw.decode("utf-8-sig")
            self.assertIn("Cliente;P.IVA;", text)
            self.assertIn("'=Studio Rossi", text)                 # no Excel formula from a name
            self.assertNotIn(PASS, text)
            rc, out, _ = cli("cliente", "situazione", data_dir=self.dir)
            self.assertEqual(rc, 0)
            self.assertIn("Studio Senza Niente", out)
            dest = self.tmp / "s.csv"
            rc, out, _ = cli("cliente", "situazione", "--csv", str(dest), data_dir=self.dir)
            self.assertEqual(rc, 0)
            self.assertTrue(dest.read_bytes().startswith(b"\xef\xbb\xbf"))

    def test_licence_states(self):
        from datetime import datetime, timedelta, timezone
        from docmap_hub import report
        now = datetime(2026, 11, 23, tzinfo=timezone.utc)
        f = lambda d: (now + timedelta(days=d)).strftime("%Y-%m-%dT%H:%M:%SZ")  # noqa: E731
        self.assertEqual(report.licence_state({"expires_at": f(-1)}, now), "scaduta")
        self.assertTrue(report.licence_state({"expires_at": f(10)}, now).startswith("in scadenza"))
        self.assertEqual(report.licence_state({"expires_at": f(100)}, now), "attiva")
        self.assertEqual(report.licence_state({"expires_at": f(100), "status": "suspended"}, now), "sospesa")
        self.assertEqual(report.licence_state({"expires_at": f(100), "status": "revoked"}, now), "revocata")


class TestSituazioneWeb(WebHarness, unittest.TestCase):
    def setUp(self):
        self.start()

    def test_download_needs_login(self):
        code, _, _ = self.call("/scarica/situazione-clienti.csv", raw=True)
        self.assertIn(code, (302, 303))
        self.assertEqual(self.login()[0], 200)
        self.call("/api/customers", {"name": "Studio Web"})
        code, h, data = self.call("/scarica/situazione-clienti.csv", raw=True)
        self.assertEqual(code, 200)
        self.assertIn("text/csv", h["Content-Type"])
        self.assertIn("Studio Web", data.decode("utf-8-sig"))


if __name__ == "__main__":
    unittest.main()
