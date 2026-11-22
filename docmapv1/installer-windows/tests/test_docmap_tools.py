"""Test di docmap_tools.py (parte non-Windows dell'installazione in sede). Solo libreria standard + unittest.

    python3 -m unittest discover -s docmapv1/installer-windows/tests -v

I test su certificati e server HTTPS si saltano se mancano `cryptography` / `fastapi` / `uvicorn`.
"""
import datetime as dt
import io
import json
import os
import shutil
import socket
import sqlite3
import ssl
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.request
import zipfile
from contextlib import redirect_stderr, redirect_stdout

HERE = os.path.dirname(os.path.abspath(__file__))
INST = os.path.dirname(HERE)
DOCMAP = os.path.dirname(INST)
SERVER_PY = os.path.join(DOCMAP, "server-python")
sys.path.insert(0, INST)
import docmap_tools as T  # noqa: E402

T.SCRYPT_LOG2N = 14          # test più veloci (l'intestazione registra il parametro); test_crypto_backup prova anche 2^17

try:
    import cryptography  # noqa: F401
    HAVE_CRYPTO = True
except ImportError:
    HAVE_CRYPTO = False
try:
    import fastapi  # noqa: F401
    import uvicorn  # noqa: F401
    HAVE_SERVER = HAVE_CRYPTO
except ImportError:
    HAVE_SERVER = False


def jload(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def jdump(obj, path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f)


def wfile(path, data: bytes):
    with open(path, "wb") as f:
        f.write(data)


def make_base(tmp, with_db=True, rows=5):
    """Una finta C:\\DocMap: config.json, dati con docmap.sqlite (WAL), licence/, instance.json."""
    base = os.path.join(tmp, "DocMap")
    p = T.paths(base)
    os.makedirs(p["config_dir"])
    os.makedirs(os.path.join(p["dati"], "licence"))
    cfg = {"data_dir": p["dati"], "aes_key": "a" * 44, "tokens": [], "allowed_origins": ["null"]}
    with open(p["config"], "w", encoding="utf-8") as f:
        json.dump(cfg, f)
    with open(os.path.join(p["dati"], "licence", "licence.docmap-licence"), "w") as f:
        f.write('{"licence": 1}')
    with open(os.path.join(p["dati"], "instance.json"), "w") as f:
        f.write('{"instance_id": "abc"}')
    with open(os.path.join(p["dati"], ".htaccess"), "w") as f:
        f.write("Require all denied\n")
    if with_db:
        con = sqlite3.connect(os.path.join(p["dati"], "docmap.sqlite"))
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("CREATE TABLE records (id INTEGER PRIMARY KEY, body BLOB)")
        con.executemany("INSERT INTO records (body) VALUES (?)", [(os.urandom(64),) for _ in range(rows)])
        con.commit()
        con.close()
    return base


def plain_zip(base, path, out_dir):
    """Decifra un .docmap-backup con la passphrase della base (per guardarci dentro nei test)."""
    out = os.path.join(out_dir, os.path.basename(path) + ".zip")
    T.decrypt_file(path, out, T.read_passphrases(base))
    return out


def count_rows(db):
    con = sqlite3.connect(db)
    try:
        return con.execute("SELECT COUNT(*) FROM records").fetchone()[0]
    finally:
        con.close()


class SettingsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.base = os.path.join(self.tmp, "DocMap")
        os.makedirs(self.base)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_defaults_without_file(self):
        s = T.load_settings(self.base)
        self.assertEqual(s["porta"], 8443)
        self.assertEqual(s["backup_da_tenere"], 30)
        self.assertFalse(os.path.exists(T.paths(self.base)["impostazioni"]))

    def test_ensure_creates_then_keeps_user_values(self):
        T.ensure_settings(self.base, {"nome_studio": "Studio Rossi"})
        p = T.paths(self.base)["impostazioni"]
        raw = jload(p)
        raw["porta"] = 9443
        raw["seconda_destinazione"] = "E:\\Backup"
        raw["voce_futura"] = "x"
        del raw["ora_backup"]
        jdump(raw, p)
        s = T.ensure_settings(self.base, {"nome_studio": ""})        # vuoto = non cambia
        self.assertEqual(s["porta"], 9443)
        self.assertEqual(s["nome_studio"], "Studio Rossi")
        self.assertEqual(s["seconda_destinazione"], "E:\\Backup")
        raw2 = jload(p)
        self.assertEqual(raw2["voce_futura"], "x")
        self.assertEqual(raw2["ora_backup"], "12:30")                 # chiave mancante aggiunta

    def test_bad_values_fall_back(self):
        p = T.paths(self.base)["impostazioni"]
        with open(p, "w", encoding="utf-8-sig") as f:                 # anche con BOM (Blocco note)
            json.dump({"porta": "abc", "backup_da_tenere": 0, "ora_backup": "25:99", "nome_studio": 5, "porta_http": "8081"}, f)
        s = T.load_settings(self.base)
        self.assertEqual(s["porta"], 8443)
        self.assertEqual(s["porta_http"], 8081)
        self.assertEqual(s["backup_da_tenere"], 1)
        self.assertEqual(s["ora_backup"], "12:30")
        self.assertEqual(s["nome_studio"], "")

    def test_broken_json(self):
        with open(T.paths(self.base)["impostazioni"], "w") as f:
            f.write("{porta: 1")
        with self.assertRaises(T.ToolError):
            T.load_settings(self.base)

    def test_slug_and_config_js(self):
        self.assertEqual(T.slugify("Studio Rossi & Figli è"), "studio-rossi-figli-e")
        self.assertEqual(T.slugify("!!!"), "studio")
        js = T.config_js({"nome_studio": "Studio \"Rossi\"", "slug": "studio-rossi"})
        body = json.loads(js.split("Object.freeze(", 1)[1].rsplit(");", 1)[0])
        self.assertEqual(body, {"mode": "web", "basePath": "/", "apiBase": "/api", "studioSlug": "studio-rossi",
                                "studioName": "Studio \"Rossi\""})

    def test_ips_and_urls(self):
        self.assertTrue(T.is_lan_ipv4("192.168.1.20"))
        self.assertTrue(T.is_lan_ipv4("172.20.0.3"))
        self.assertFalse(T.is_lan_ipv4("172.32.0.1"))
        self.assertFalse(T.is_lan_ipv4("192.0.2.2"))                  # rete di documentazione: fuori dalla CA
        self.assertFalse(T.is_lan_ipv4("127.0.0.1"))
        self.assertFalse(T.is_lan_ipv4("fe80::1"))
        self.assertEqual(T.choose_ip(["10.0.0.5", "192.168.1.20"]), "192.168.1.20")
        self.assertEqual(T.choose_ip(["10.0.0.5", "192.168.1.20"], "10.0.0.5"), "10.0.0.5")
        self.assertEqual(T.choose_ip([]), "127.0.0.1")
        u = T.urls(dict(T.DEFAULT_SETTINGS), "192.168.1.20")
        self.assertEqual(u["app"], "https://192.168.1.20:8443/")
        self.assertEqual(u["api"], "https://192.168.1.20:8443/api")
        self.assertEqual(u["certificato"], "http://192.168.1.20:8080/")
        self.assertEqual(u["qr_dest"], "https://192.168.1.20:8443/q/{short_code}")
        self.assertEqual(T.urls(dict(T.DEFAULT_SETTINGS, porta=443, porta_http=0), "10.0.0.1")["certificato"], "")
        txt, html = T.address_texts(dict(T.DEFAULT_SETTINGS, nome_studio="Studio <R>"), "192.168.1.20", ["192.168.1.20", "10.0.0.5"])
        self.assertIn("https://192.168.1.20:8443/", txt)
        self.assertIn("10.0.0.5", txt)
        self.assertIn("\r\n", txt)
        self.assertIn('src="app/assets/js/01-qr.js"', html)
        self.assertIn("Studio &lt;R&gt;", html)
        self.assertTrue(os.path.isfile(os.path.join(DOCMAP, "assets", "js", "01-qr.js")))


class RetentionTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_names(self):
        now = dt.datetime(2026, 11, 2, 9, 5)
        self.assertEqual(T.backup_name(now), "docmap_20261102_0905.docmap-backup")
        self.assertEqual(T.backup_name(now, {"docmap_20261102_0905.docmap-backup"}), "docmap_20261102_0905_2.docmap-backup")
        self.assertEqual(T.backup_name(now, {"docmap_20261102_0905.zip"}), "docmap_20261102_0905_2.docmap-backup")   # vecchio zip
        self.assertEqual(T.backup_name(now, {"docmap_20261102_0905.docmap-backup", "docmap_20261102_0905_2.zip"}),
                         "docmap_20261102_0905_3.docmap-backup")
        self.assertEqual(T.backup_name(now, ext=".zip"), "docmap_20261102_0905.zip")

    def test_order_and_retention(self):
        names = ["docmap_20261101_1230.zip", "docmap_20261102_0905.zip", "docmap_20261102_0905_2.zip",
                 "docmap_20251231_2359.zip", "docmap_20261102_0905_10.zip"]
        for n in names + ["altro.zip", "docmap_2026.zip", "docmap_20261102_0905.zip.parziale"]:
            open(os.path.join(self.tmp, n), "w").close()
        os.makedirs(os.path.join(self.tmp, "docmap_20300101_0000.zip"))   # una cartella col nome giusto: ignorata
        self.assertEqual(T.list_backups(self.tmp), ["docmap_20261102_0905_10.zip", "docmap_20261102_0905_2.zip",
                                                    "docmap_20261102_0905.zip", "docmap_20261101_1230.zip", "docmap_20251231_2359.zip"])
        trash = os.path.join(self.tmp, "_cestino")
        removed = T.apply_retention(self.tmp, 3, trash)
        self.assertEqual(removed, ["docmap_20261101_1230.zip", "docmap_20251231_2359.zip"])
        self.assertTrue(os.path.isfile(os.path.join(trash, "docmap_20251231_2359.zip")))
        self.assertEqual(len(T.list_backups(self.tmp)), 3)
        self.assertTrue(os.path.isfile(os.path.join(self.tmp, "altro.zip")))
        self.assertEqual(T.apply_retention(self.tmp, 0), ["docmap_20261102_0905_2.zip", "docmap_20261102_0905.zip"])  # minimo 1
        self.assertEqual(T.list_backups(os.path.join(self.tmp, "non-esiste")), [])

    def test_mixed_encrypted_and_legacy(self):
        for n in ("docmap_20261101_1230.zip", "docmap_20261103_1230.docmap-backup", "docmap_20261102_1230.zip",
                  "docmap_20261104_1230.docmap-backup", "docmap_20261104_1230.docmap-backup.parziale"):
            open(os.path.join(self.tmp, n), "w").close()
        self.assertEqual(T.list_backups(self.tmp), ["docmap_20261104_1230.docmap-backup", "docmap_20261103_1230.docmap-backup",
                                                    "docmap_20261102_1230.zip", "docmap_20261101_1230.zip"])
        self.assertEqual(T.apply_retention(self.tmp, 2, os.path.join(self.tmp, "_c")),
                         ["docmap_20261102_1230.zip", "docmap_20261101_1230.zip"])


class BackupRestoreTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.base = make_base(self.tmp)
        self.p = T.paths(self.base)
        self.db = os.path.join(self.p["dati"], "docmap.sqlite")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_backup_contents(self):
        r = T.make_backup(self.base, now=dt.datetime(2026, 11, 2, 12, 30))
        self.assertEqual(r["nome"], "docmap_20261102_1230.docmap-backup")
        self.assertTrue(r["cifrato"])
        self.assertTrue(r["passphrase_creata"])
        self.assertEqual(r["kit"], "mancante")
        self.assertEqual(r["righe"], {"records": 5})
        with open(r["file"], "rb") as f:
            raw = f.read()
        self.assertTrue(raw.startswith(T.BK_MAGIC))
        self.assertNotIn(b"aaaaaaaa", raw)                            # la chiave (a*44) non si vede
        self.assertNotIn(b"PK\x03\x04", raw)                           # né lo zip
        with zipfile.ZipFile(plain_zip(self.base, r["file"], self.tmp)) as z:
            names = set(z.namelist())
            man = json.loads(z.read("MANIFEST.json"))
        self.assertEqual(names, {"docmap.sqlite", "config/config.json", "dati/licence/licence.docmap-licence",
                                 "dati/instance.json", "dati/.htaccess", "MANIFEST.json"})
        self.assertEqual(set(man["file"]), names - {"MANIFEST.json"})
        self.assertEqual(T.verify_backup_file(self.base, r["file"])["righe"], {"records": 5})
        self.assertEqual([n for n in os.listdir(self.p["backup"])], ["docmap_20261102_1230.docmap-backup"])   # niente file temporanei
        r2 = T.make_backup(self.base, now=dt.datetime(2026, 11, 2, 12, 31))
        self.assertFalse(r2["passphrase_creata"])                    # la stessa passphrase per tutti i backup

    def test_backup_while_writing(self):
        """Copia coerente mentre un altro processo/thread scrive (WAL): il conteggio nello zip è quello di un istante."""
        stop = threading.Event()
        written = [0]

        def writer():
            con = sqlite3.connect(self.db, timeout=30)
            while not stop.is_set():
                con.execute("INSERT INTO records (body) VALUES (?)", (os.urandom(2048),))
                con.commit()
                written[0] += 1
            con.close()
        th = threading.Thread(target=writer)
        th.start()
        try:
            time.sleep(0.3)
            results = [T.make_backup(self.base, now=dt.datetime(2026, 11, 2, 12, i)) for i in range(3)]
        finally:
            stop.set()
            th.join()
        self.assertGreater(written[0], 10)
        for r in results:
            with zipfile.ZipFile(plain_zip(self.base, r["file"], self.tmp)) as z:
                d = tempfile.mkdtemp(dir=self.tmp)
                z.extract("docmap.sqlite", d)
            n = count_rows(os.path.join(d, "docmap.sqlite"))
            self.assertEqual(n, r["righe"]["records"])
            self.assertGreaterEqual(n, 5)
            self.assertFalse(os.path.exists(os.path.join(d, "docmap.sqlite-wal")))
        self.assertLessEqual(results[0]["righe"]["records"], results[2]["righe"]["records"])

    def test_retention_and_second_destination(self):
        second = os.path.join(self.tmp, "USB", "BackupDocMap")
        T.ensure_settings(self.base, {"seconda_destinazione": second})
        for i in range(5):
            r = T.make_backup(self.base, keep=3, now=dt.datetime(2026, 11, 1 + i, 12, 30))
            self.assertIsNone(r["seconda_errore"])
        self.assertEqual(T.list_backups(self.p["backup"]), ["docmap_20261105_1230.docmap-backup", "docmap_20261104_1230.docmap-backup",
                                                            "docmap_20261103_1230.docmap-backup"])
        self.assertEqual(len(T.list_backups(second)), 5)             # seconda_da_tenere = 30
        self.assertEqual(r["tolti"], ["docmap_20261102_1230.docmap-backup"])
        with open(os.path.join(second, "docmap_20261105_1230.docmap-backup"), "rb") as f:
            self.assertTrue(f.read(8) == T.BK_MAGIC)                  # anche la copia su chiavetta/NAS è cifrata
        # chiavetta non collegata: il backup principale va lo stesso
        blocker = os.path.join(self.tmp, "file-non-cartella")
        open(blocker, "w").close()
        r = T.make_backup(self.base, now=dt.datetime(2026, 11, 6, 12, 30), second=os.path.join(blocker, "x"))
        self.assertTrue(os.path.isfile(r["zip"]))
        self.assertIn("non riuscita", r["seconda_errore"])

    def test_backup_without_database(self):
        os.remove(self.db)
        for side in ("-wal", "-shm"):
            if os.path.exists(self.db + side):
                os.remove(self.db + side)
        r = T.make_backup(self.base, now=dt.datetime(2026, 11, 2, 8, 0))
        man = T.verify_backup_file(self.base, r["file"])
        self.assertIn("nota", man)

    def test_verify_rejects_tampered_and_foreign(self):
        r = T.make_backup(self.base, now=dt.datetime(2026, 11, 2, 12, 30))
        r = {"zip": plain_zip(self.base, r["file"], self.tmp)}       # controlli dello zip in chiaro (vecchi backup)
        bad = os.path.join(self.tmp, "manomesso.zip")
        with zipfile.ZipFile(r["zip"]) as zin, zipfile.ZipFile(bad, "w") as zout:
            for n in zin.namelist():
                data = zin.read(n)
                if n == "config/config.json":
                    data = data.replace(b"aaaa", b"bbbb")
                zout.writestr(n, data)
        with self.assertRaisesRegex(T.ToolError, "MANIFEST"):
            T.verify_zip(bad)
        other = os.path.join(self.tmp, "altro.zip")
        with zipfile.ZipFile(other, "w") as z:
            z.writestr("ciao.txt", "x")
        with self.assertRaisesRegex(T.ToolError, "non è un backup"):
            T.verify_zip(other)
        evil = os.path.join(self.tmp, "evil.zip")
        with zipfile.ZipFile(r["zip"]) as zin, zipfile.ZipFile(evil, "w") as zout:
            for n in zin.namelist():
                zout.writestr(n, zin.read(n))
            zout.writestr("dati/../../fuori.txt", "x")
        with self.assertRaisesRegex(T.ToolError, "Percorso"):
            T.verify_zip(evil)
        notzip = os.path.join(self.tmp, "x.zip")
        wfile(notzip, b"ciao")
        with self.assertRaisesRegex(T.ToolError, "zip valido"):
            T.verify_zip(notzip)
        with self.assertRaises(T.ToolError):
            T.verify_zip(os.path.join(self.tmp, "manca.zip"))

    def test_restore_same_key(self):
        r = T.make_backup(self.base, now=dt.datetime(2026, 11, 2, 12, 30))
        self.assertTrue(r["file"].endswith(".docmap-backup"))
        con = sqlite3.connect(self.db)
        con.execute("DELETE FROM records")
        con.commit()
        con.close()
        res = T.restore_backup(self.base, r["zip"], now=dt.datetime(2026, 11, 3, 9, 0, 0))
        self.assertTrue(res["cifrato"])
        self.assertFalse(res["passphrase_aggiunta"])
        self.assertEqual(count_rows(self.db), 5)
        self.assertFalse(res["config_ripristinata"])
        safety = res["copia_di_sicurezza"]
        self.assertTrue(safety.endswith("_prima-del-ripristino_20261103_090000"))
        self.assertEqual(count_rows(os.path.join(safety, "docmap.sqlite")), 0)    # i dati "sbagliati" restano qui
        self.assertTrue(os.path.isfile(os.path.join(safety, "config.json")))
        self.assertTrue(os.path.isfile(os.path.join(self.p["dati"], "licence", "licence.docmap-licence")))
        self.assertTrue(os.path.isfile(os.path.join(self.p["dati"], ".htaccess")))
        # un backup dopo il ripristino non include la copia di sicurezza
        r2 = T.make_backup(self.base, now=dt.datetime(2026, 11, 3, 9, 5))
        with zipfile.ZipFile(plain_zip(self.base, r2["file"], self.tmp)) as z:
            self.assertFalse(any("_prima-del-ripristino" in n for n in z.namelist()))

    def test_restore_other_key_restores_config(self):
        r = T.make_backup(self.base, now=dt.datetime(2026, 11, 2, 12, 30))
        # "PC nuovo": installazione nuova con un'altra chiave e un'altra cartella dati
        tmp2 = tempfile.mkdtemp(dir=self.tmp)
        base2 = make_base(tmp2, with_db=False)
        p2 = T.paths(base2)
        cfg2 = jload(p2["config"])
        cfg2["aes_key"] = "z" * 44
        jdump(cfg2, p2["config"])
        T.ensure_passphrase(base2)                                   # il PC nuovo ha già la sua passphrase (diversa)
        with self.assertRaises(T.PassphraseError):
            T.restore_backup(base2, r["zip"])
        self.assertFalse(os.path.exists(os.path.join(p2["dati"], "docmap.sqlite")))   # niente toccato
        old_pp = T.read_passphrases(self.base)[0]
        res = T.restore_backup(base2, r["zip"], passphrase=old_pp.lower().replace("-", " "))   # scritta "a mano"
        self.assertTrue(res["config_ripristinata"])
        self.assertTrue(res["passphrase_aggiunta"])
        self.assertEqual(T.read_passphrases(base2)[1], old_pp)       # i backup vecchi si riaprono senza riscriverla
        cfg = jload(p2["config"])
        self.assertEqual(cfg["aes_key"], "a" * 44)
        self.assertEqual(cfg["data_dir"], p2["dati"])                 # la cartella dati resta quella del PC nuovo
        self.assertEqual(count_rows(os.path.join(p2["dati"], "docmap.sqlite")), 5)
        self.assertEqual(jload(os.path.join(res["copia_di_sicurezza"], "config.json"))["aes_key"], "z" * 44)

    def test_restore_failure_puts_data_back(self):
        r = T.make_backup(self.base, now=dt.datetime(2026, 11, 2, 12, 30))
        con = sqlite3.connect(self.db)
        con.execute("INSERT INTO records (body) VALUES (x'00')")
        con.commit()
        con.close()
        orig = T._restore_files

        def boom(*a, **k):
            wfile(os.path.join(self.p["dati"], "docmap.sqlite"), b"mezzo file")
            raise OSError("disco pieno")
        T._restore_files = boom
        try:
            with self.assertRaises(OSError):
                T.restore_backup(self.base, r["zip"])
        finally:
            T._restore_files = orig
        self.assertEqual(count_rows(self.db), 6)                      # i dati di prima sono di nuovo al loro posto
        self.assertTrue(os.path.isfile(os.path.join(self.p["dati"], "instance.json")))

    def test_cli(self):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            self.assertEqual(T.main(["--base", self.base, "backup"]), 0)
            self.assertEqual(T.main(["--base", self.base, "elenco-backup"]), 0)
            self.assertEqual(T.main(["--base", os.path.join(self.tmp, "vuota"), "backup"]), 2)
        self.assertIn("Configurazione non trovata", err.getvalue())
        self.assertIn(".docmap-backup", out.getvalue())


class MiddlewareTest(unittest.TestCase):
    def test_rewrite(self):
        self.assertEqual(T.rewrite_path("/q/dm26ABCDEF12"), "/scan.html")
        self.assertEqual(T.rewrite_path("/q/dm26L0000001/"), "/scan.html")
        self.assertEqual(T.rewrite_path("/q/assets/js/01-qr.js"), "/assets/js/01-qr.js")
        self.assertEqual(T.rewrite_path("/q/vendor/jsqr.js"), "/vendor/jsqr.js")
        self.assertEqual(T.rewrite_path("/q/docmap.config.js"), "/docmap.config.js")
        self.assertEqual(T.rewrite_path("/q/" + "a" * 41), "/q/" + "a" * 41)
        self.assertEqual(T.rewrite_path("/q/a/b"), "/q/a/b")
        self.assertEqual(T.rewrite_path("/index.html"), "/index.html")

    def test_asgi(self):
        import asyncio
        seen = []

        async def app(scope, receive, send):
            seen.append((scope["path"], scope.get("raw_path")))
            await send({"type": "http.response.start", "status": 200, "headers": [(b"x-content-type-options", b"nosniff")]})
            await send({"type": "http.response.body", "body": b""})

        sent = []

        async def send(m):
            sent.append(m)

        async def go(path):
            await T.lan_middleware(app, ("/api",))({"type": "http", "path": path, "raw_path": path.encode()}, None, send)
        asyncio.run(go("/q/dm26ABCDEF12"))
        self.assertEqual(seen[-1], ("/scan.html", b"/scan.html"))
        hdr = dict(sent[0]["headers"])
        self.assertIn(b"content-security-policy", hdr)
        self.assertEqual([k for k, _ in sent[0]["headers"]].count(b"x-content-type-options"), 1)
        sent.clear()
        asyncio.run(go("/api"))
        self.assertEqual(seen[-1][0], "/api")
        self.assertNotIn(b"content-security-policy", dict(sent[0]["headers"]))


@unittest.skipUnless(HAVE_CRYPTO, "serve 'cryptography'")
class CertTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.d = os.path.join(self.tmp, "certificati")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def load(self, name):
        from cryptography import x509
        with open(os.path.join(self.d, name), "rb") as f:
            return x509.load_pem_x509_certificate(f.read())

    def test_create_keep_renew(self):
        from cryptography import x509
        r = T.ensure_certificates(self.d, "Studio Rossi", "PC-Ufficio", ["192.168.1.20"])
        self.assertTrue(r["ca_creata"] and r["server_emesso"])
        self.assertEqual(r["dns"], ["localhost", "pc-ufficio", "pc-ufficio.local"])
        self.assertEqual(r["ip"], ["127.0.0.1", "192.168.1.20"])
        ca = self.load(T.CA_CERT)
        nc = ca.extensions.get_extension_for_class(x509.NameConstraints)
        self.assertTrue(nc.critical)
        srv = self.load(T.SRV_CERT)
        days = (srv.not_valid_after_utc - srv.not_valid_before_utc).days
        self.assertLessEqual(days, 825)
        # stessa rete: niente da rifare
        r2 = T.ensure_certificates(self.d, "Studio Rossi", "PC-Ufficio", ["192.168.1.20"])
        self.assertFalse(r2["ca_creata"] or r2["server_emesso"])
        # IP cambiato: nuovo certificato del server, stessa CA (i telefoni non devono rifare niente)
        r3 = T.ensure_certificates(self.d, "Studio Rossi", "PC-Ufficio", ["192.168.1.77", "8.8.8.8"])
        self.assertTrue(r3["server_emesso"])
        self.assertFalse(r3["ca_creata"])
        self.assertEqual(r3["ip"], ["127.0.0.1", "192.168.1.77"])
        self.assertEqual(self.load(T.CA_CERT).fingerprint(ca.signature_hash_algorithm), ca.fingerprint(ca.signature_hash_algorithm))
        # vicino alla scadenza: rinnovo
        later = dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=T.SERVER_DAYS - 30)
        self.assertTrue(T.ensure_certificates(self.d, "Studio Rossi", "PC-Ufficio", ["192.168.1.77"], now=later)["server_emesso"])
        # nome del PC cambiato: il nome nuovo è fuori dai vincoli della CA e non entra nel certificato
        r4 = T.ensure_certificates(self.d, "Studio Rossi", "PC-Nuovo", ["192.168.1.77"])
        self.assertNotIn("pc-nuovo", r4["dns"])
        self.assertIn("pc-nuovo.local", r4["dns"])                    # .local è ammesso

    def test_chain_verifies_with_python_ssl(self):
        """Server TLS con il certificato emesso: Python (con X509_STRICT dalla 3.13) lo accetta usando la CA dello studio."""
        r = T.ensure_certificates(self.d, "Studio", "pc", [])
        sctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        sctx.load_cert_chain(r["cert"], r["key"])
        srv = socket.socket()
        srv.bind(("127.0.0.1", 0))
        srv.listen(1)
        port = srv.getsockname()[1]
        err = []

        def accept():
            try:
                c, _ = srv.accept()
                with sctx.wrap_socket(c, server_side=True) as s:
                    s.recv(1)
            except Exception as e:   # noqa: BLE001
                err.append(e)
        th = threading.Thread(target=accept)
        th.start()
        cctx = ssl.create_default_context(cafile=r["ca"])
        with socket.create_connection(("127.0.0.1", port)) as c, cctx.wrap_socket(c, server_hostname="127.0.0.1") as s:
            self.assertEqual(s.version()[:3], "TLS")
            s.send(b"x")
        th.join(5)
        srv.close()
        # con un'altra CA no
        other = os.path.join(self.tmp, "altra")
        T.ensure_certificates(other, "Altro", "pc", [])
        cctx2 = ssl.create_default_context(cafile=os.path.join(other, T.CA_CERT))
        srv = socket.socket()
        srv.bind(("127.0.0.1", 0))
        srv.listen(1)
        port = srv.getsockname()[1]
        th = threading.Thread(target=accept)
        th.start()
        with self.assertRaises(ssl.SSLError):
            with socket.create_connection(("127.0.0.1", port)) as c, cctx2.wrap_socket(c, server_hostname="127.0.0.1"):
                pass
        th.join(5)
        srv.close()


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


@unittest.skipUnless(HAVE_SERVER, "servono fastapi, uvicorn e cryptography")
class ServeEndToEndTest(unittest.TestCase):
    """Come dopo installa.ps1: C:\\DocMap con app, server, config (setup del server), poi `serve` in un altro processo."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.pkg = os.path.join(cls.tmp, "pacchetto")
        res = T.build_package(cls.pkg, make_zip=True)
        cls.zip = res["zip"]
        cls.base = os.path.join(cls.tmp, "DocMap")
        p = cls.p = T.paths(cls.base)
        os.makedirs(cls.base)
        shutil.copytree(os.path.join(cls.pkg, "app"), p["app"])
        shutil.copytree(os.path.join(cls.pkg, "server"), p["server"])
        os.makedirs(p["strumenti"])
        shutil.copyfile(os.path.join(cls.pkg, "docmap_tools.py"), os.path.join(p["strumenti"], "docmap_tools.py"))
        cls.port, cls.hport = free_port(), free_port()
        T.ensure_settings(cls.base, {"nome_studio": "Studio Prova", "slug": "studio-prova", "porta": cls.port, "porta_http": cls.hport})
        r = subprocess.run([sys.executable, "-m", "docmap_server", "setup", "--config", p["config"], "--data-dir", p["dati"],
                            "--user", "davide,admin", "--studio-name", "Studio Prova"], cwd=p["server"], capture_output=True, text=True)
        assert r.returncode == 0, r.stderr
        cls.token = [ln.split()[-1] for ln in r.stdout.splitlines() if ln.startswith("davide")][0]
        with redirect_stdout(io.StringIO()):
            assert T.main(["--base", cls.base, "config-js"]) == 0
        cls.log = open(os.path.join(cls.tmp, "serve.out"), "w")
        cls.proc = subprocess.Popen([sys.executable, os.path.join(p["strumenti"], "docmap_tools.py"), "--base", cls.base, "serve"],
                                    cwd=cls.base, stdout=cls.log, stderr=subprocess.STDOUT)
        cls.ca = os.path.join(p["certificati"], T.CA_CERT)
        T.ping_wait("https://127.0.0.1:%d/api" % cls.port, cls.ca, seconds=30)

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        try:
            cls.proc.wait(10)
        except subprocess.TimeoutExpired:
            cls.proc.kill()
        cls.log.close()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def get(self, path, headers=None, https=True, method="GET", data=None):
        if https:
            url, ctx = "https://127.0.0.1:%d%s" % (self.port, path), ssl.create_default_context(cafile=self.ca)
        else:
            url, ctx = "http://127.0.0.1:%d%s" % (self.hport, path), None

        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *a, **k):
                return None
        opener = urllib.request.build_opener(NoRedirect, urllib.request.HTTPSHandler(context=ctx))
        req = urllib.request.Request(url, headers=headers or {}, method=method, data=data)
        try:
            with opener.open(req, timeout=10) as r:
                return r.status, dict(r.headers), r.read()
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers), e.read()

    def test_ping_and_cli(self):
        body = T.ping("https://127.0.0.1:%d/api" % self.port, self.ca)
        self.assertTrue(body["ok"])
        out = io.StringIO()
        with redirect_stdout(out):
            self.assertEqual(T.main(["--base", self.base, "ping"]), 0)
        self.assertIn('"ok": true', out.getvalue())

    def test_app_and_qr_routes(self):
        st, h, b = self.get("/")
        self.assertEqual(st, 200)
        self.assertIn(b"<html", b.lower())
        self.assertIn("content-security-policy", h)
        st, h, b = self.get("/q/dm26ABCDEF12")
        self.assertEqual(st, 200)
        with open(os.path.join(self.p["app"], "scan.html"), "rb") as f:
            self.assertEqual(b, f.read())
        st, _, b = self.get("/q/assets/js/01-qr.js")
        self.assertEqual(st, 200)
        self.assertIn(b"DMQR", b)
        st, _, b = self.get("/docmap.config.js")
        self.assertIn(b'"apiBase": "/api"', b)
        self.assertIn(b'"studioName": "Studio Prova"', b)
        self.assertEqual(self.get("/.htaccess")[0], 403)

    def test_api_same_origin_with_token(self):
        origin = "https://127.0.0.1:%d" % self.port
        st, h, b = self.get("/api?r=me", {"Authorization": "Bearer " + self.token, "Origin": origin})
        self.assertEqual(st, 200, b)
        self.assertEqual(json.loads(b)["user"], "davide")
        self.assertNotIn("content-security-policy", h)                # le risposte dell'API restano quelle del server
        st, _, b = self.get("/api?r=me", {"Authorization": "Bearer sbagliato", "Origin": origin})
        self.assertEqual(st, 401)

    def test_cert_page_http(self):
        st, h, b = self.get("/", https=False)
        self.assertEqual(st, 200)
        self.assertIn("Scarica il certificato".encode(), b)
        self.assertIn(b"Studio Prova", b)
        st, h, b = self.get("/DocMap-CA-studio.crt", https=False)
        with open(self.ca, "rb") as f:
            self.assertEqual(b, f.read())
        st, h, _ = self.get("/q/dm26ABCDEF12?x=1", {"Host": "192.168.1.20:%d" % self.hport}, https=False)
        self.assertEqual(st, 302)
        self.assertEqual(h["location"], "https://192.168.1.20:%d/q/dm26ABCDEF12?x=1" % self.port)

    def test_backup_while_serving_and_address_files(self):
        # una richiesta che crea il database
        self.get("/api?r=pull", {"Authorization": "Bearer " + self.token, "Origin": "https://127.0.0.1:%d" % self.port})
        r = T.make_backup(self.base)
        man = T.verify_backup_file(self.base, r["file"])
        self.assertIn("config/config.json", man["file"])
        self.assertTrue(os.path.isfile(self.p["leggimi"]))
        self.assertTrue(os.path.isfile(self.p["pagina_qr"]))
        self.assertTrue(os.path.isfile(os.path.join(self.p["log"], "server.log")))

    def test_package(self):
        self.assertEqual(T.check_package(self.pkg), [])
        self.assertFalse(os.path.exists(os.path.join(self.pkg, "app", "server-php")))
        self.assertTrue(os.path.isfile(os.path.join(self.pkg, "PACCHETTO-MANIFEST.txt")))
        with zipfile.ZipFile(self.zip) as z:
            names = set(z.namelist())
        self.assertIn("installa.bat", names)
        self.assertIn("server/docmap_server/api.py", names)
        self.assertFalse(any("__pycache__" in n for n in names))
        with self.assertRaises(T.ToolError):
            T.build_package(self.pkg)                                  # mai sopra una cartella piena
        self.assertEqual(T.check_package(self.tmp)[:1], ["app/index.html"])


if __name__ == "__main__":
    unittest.main()
