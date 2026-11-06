"""Test dei backup cifrati (.docmap-backup), del Kit di emergenza (.docmap-key) e di verifica-backup.

    python3 -m unittest discover -s docmapv1/installer-windows/tests -v

Solo libreria standard + unittest; serve `cryptography` (c'è nel venv del server). La parte con il server vero
(kit → config ricostruita → il server riapre il database) si salta se mancano fastapi/uvicorn.
"""
import base64
import datetime as dt
import hashlib
import io
import json
import os
import re
import shutil
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request
import zipfile
from contextlib import redirect_stderr, redirect_stdout
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
INST = os.path.dirname(HERE)
DOCMAP = os.path.dirname(INST)
SERVER_PY = os.path.join(DOCMAP, "server-python")
sys.path.insert(0, INST)
sys.path.insert(0, HERE)
import docmap_tools as T  # noqa: E402
from test_docmap_tools import make_base, count_rows, plain_zip, HAVE_CRYPTO, HAVE_SERVER  # noqa: E402

T.SCRYPT_LOG2N = 14
NOPROXY = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def enc_bytes(data, secret="segreto-di-prova-123", chunk=64, log2n=10, magic=T.BK_MAGIC):
    out = io.BytesIO()
    T.encrypt_stream(io.BytesIO(data), out, secret, magic, log2n=log2n, chunk_size=chunk)
    return out.getvalue()


def dec_bytes(blob, secret="segreto-di-prova-123", magic=T.BK_MAGIC):
    out = io.BytesIO()
    T.decrypt_stream(io.BytesIO(blob), out, secret, magic)
    return out.getvalue()


def jl(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def rd(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def run_cli(*args, stdin=None):
    out, err = io.StringIO(), io.StringIO()
    with redirect_stdout(out), redirect_stderr(err), mock.patch.object(sys, "stdin", stdin or io.StringIO("")):
        code = T.main(list(args))
    return code, out.getvalue(), err.getvalue()


@unittest.skipUnless(HAVE_CRYPTO, "serve cryptography")
class FormatTest(unittest.TestCase):
    def test_roundtrip_chunk_boundaries(self):
        chunk = 64
        for n in (0, 1, 15, 16, 63, 64, 65, 127, 128, 129, 64 * 10, 64 * 10 + 3):
            data = os.urandom(n)
            blob = enc_bytes(data, chunk=chunk)
            chunks = max(1, -(-n // chunk))
            self.assertEqual(len(blob), T.HEADER_LEN + n + chunks * T.TAG_LEN, n)
            self.assertEqual(dec_bytes(blob), data, n)

    def test_streaming_large_with_default_chunk(self):
        data = os.urandom(3 * T.CHUNK_SIZE + 12345)
        blob = enc_bytes(data, chunk=T.CHUNK_SIZE)
        self.assertEqual(hashlib.sha256(dec_bytes(blob)).digest(), hashlib.sha256(data).digest())

    def test_every_byte_flip_is_detected(self):
        data = os.urandom(200)
        blob = enc_bytes(data)
        for i in range(len(blob)):
            bad = bytearray(blob)
            bad[i] ^= 0x01
            with self.assertRaises(T.ToolError, msg="byte %d" % i):
                dec_bytes(bytes(bad))

    def test_truncation_extension_and_reordering(self):
        data = os.urandom(64 * 4)
        blob = enc_bytes(data)
        for cut in range(len(blob)):
            with self.assertRaises(T.ToolError, msg="troncato a %d" % cut):
                dec_bytes(blob[:cut])
        with self.assertRaises(T.ToolError):
            dec_bytes(blob + b"\x00")
        h, n = T.HEADER_LEN, 64 + T.TAG_LEN
        c = [blob[h + i * n:h + (i + 1) * n] for i in range(4)]
        with self.assertRaises(T.ToolError):
            dec_bytes(blob[:h] + c[1] + c[0] + c[2] + c[3])            # blocchi scambiati
        with self.assertRaises(T.ToolError):
            dec_bytes(blob[:h] + c[0] + c[1] + c[3])                   # blocco tolto
        with self.assertRaises(T.ToolError):                           # file senza l'ultimo blocco: il penultimo non è "ultimo"
            dec_bytes(blob[:h] + c[0] + c[1] + c[2])

    def test_wrong_passphrase(self):
        blob = enc_bytes(b"dati riservati")
        with self.assertRaises(T.PassphraseError) as cm:
            dec_bytes(blob, "un'altra passphrase")
        self.assertIn("Passphrase dei backup sbagliata", str(cm.exception))
        # più passphrase: vale la prima che apre il file
        out = io.BytesIO()
        _, used = T.decrypt_stream(io.BytesIO(blob), out, ["no", "", "segreto-di-prova-123"])
        self.assertEqual(used, "segreto-di-prova-123")
        # decrypt_file non crea il file di destinazione se la passphrase è sbagliata
        with tempfile.TemporaryDirectory() as t:
            src = os.path.join(t, "x.docmap-backup")
            with open(src, "wb") as f:
                f.write(blob)
            dst = os.path.join(t, "x.zip")
            with self.assertRaises(T.PassphraseError):
                T.decrypt_file(src, dst, "sbagliata")
            self.assertEqual(os.listdir(t), ["x.docmap-backup"])

    def test_code_forms_and_kind(self):
        code = T.generate_code()
        self.assertRegex(code, r"^([0-9A-HJKMNP-TV-Z]{5}-){5}[0-9A-HJKMNP-TV-Z]{5}$")
        blob = enc_bytes(b"kit", code, magic=T.KEY_MAGIC)
        typed = code.lower().replace("-", " ").replace("0", "o").replace("1", "l")
        self.assertEqual(dec_bytes(blob, typed, T.KEY_MAGIC), b"kit")
        with self.assertRaisesRegex(T.ToolError, "kit di emergenza"):
            dec_bytes(blob, code, T.BK_MAGIC)                            # un kit non è un backup
        with self.assertRaises(T.PassphraseError) as cm:
            dec_bytes(blob, T.generate_code(), T.KEY_MAGIC)
        self.assertIn("Codice di recupero sbagliato", str(cm.exception))
        with self.assertRaisesRegex(T.ToolError, "intestazione"):
            dec_bytes(b"PK\x03\x04" + b"\x00" * 100)
        self.assertEqual(T.canonical_secret("  Una frase lunga  "), "Una frase lunga")

    def test_header_params_validated(self):
        blob = bytearray(enc_bytes(b"x"))
        blob[10] = 40                                                  # log2(N) assurdo → rifiutato prima di scrypt
        with self.assertRaisesRegex(T.ToolError, "parametri"):
            dec_bytes(bytes(blob))

    def test_default_scrypt_parameters(self):
        out = io.BytesIO()
        t0 = time.time()
        T.encrypt_stream(io.BytesIO(b"ciao"), out, "passphrase-vera", log2n=17)
        blob = out.getvalue()
        hdr = T.read_header(io.BytesIO(blob))
        self.assertEqual((hdr["log2n"], hdr["r"], hdr["p"], hdr["chunk"]), (17, 8, 1, T.CHUNK_SIZE))
        self.assertEqual(dec_bytes(blob, "passphrase-vera"), b"ciao")
        self.assertLess(time.time() - t0, 30)


@unittest.skipUnless(HAVE_CRYPTO, "serve cryptography")
class EncryptedBackupTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.base = make_base(self.tmp)
        self.p = T.paths(self.base)
        self.db = os.path.join(self.p["dati"], "docmap.sqlite")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def valid_key(self):
        cfg = jl(self.p["config"])
        cfg["aes_key"] = base64.b64encode(os.urandom(32)).decode()
        with open(self.p["config"], "w", encoding="utf-8") as f:
            json.dump(cfg, f)

    def test_passphrase_file(self):
        self.assertEqual(T.read_passphrases(self.base), [])
        pp, created = T.ensure_passphrase(self.base)
        self.assertTrue(created)
        self.assertEqual(T.ensure_passphrase(self.base), (pp, False))
        with open(T.passphrase_path(self.base), encoding="utf-8") as f:
            txt = f.read()
        self.assertTrue(txt.startswith("# DocMap"))
        if os.name == "posix":
            self.assertEqual(os.stat(T.passphrase_path(self.base)).st_mode & 0o077, 0)
        r1 = T.make_backup(self.base, now=dt.datetime(2026, 11, 1, 12, 30))
        code, out, _ = run_cli("--base", self.base, "passphrase-backup", "--nuova")
        self.assertEqual(code, 0)
        new = T.read_passphrases(self.base)
        self.assertEqual(new[1], pp)                                   # la vecchia resta per i backup già fatti
        r2 = T.make_backup(self.base, now=dt.datetime(2026, 11, 2, 12, 30))
        self.assertTrue(T.secret_opens(r2["file"], new[0]))
        self.assertFalse(T.secret_opens(r2["file"], pp))
        T.restore_backup(self.base, r1["file"])                        # backup vecchio: si apre con la precedente
        code, out, _ = run_cli("--base", self.base, "passphrase-backup", "--mostra")
        self.assertEqual(out.strip(), new[0])
        with mock.patch.dict(os.environ, {"DOCMAP_PASSPHRASE": "corta"}):
            self.assertEqual(run_cli("--base", self.base, "passphrase-backup", "--imposta")[0], 2)
        with mock.patch.dict(os.environ, {"DOCMAP_PASSPHRASE": "una passphrase scelta dallo studio"}):
            self.assertEqual(run_cli("--base", self.base, "passphrase-backup", "--imposta")[0], 0)
        self.assertEqual(T.read_passphrases(self.base)[:3], ["una passphrase scelta dallo studio", new[0], pp])

    def test_restore_wrong_passphrase_changes_nothing(self):
        r = T.make_backup(self.base, now=dt.datetime(2026, 11, 2, 12, 30))
        con = sqlite3.connect(self.db)
        con.execute("DELETE FROM records")
        con.commit()
        con.close()
        os.replace(T.passphrase_path(self.base), os.path.join(self.tmp, "pp-altrove.txt"))   # PC senza la passphrase giusta
        T.ensure_passphrase(self.base)
        before = sorted(os.listdir(self.p["dati"]))
        with mock.patch.dict(os.environ, {"DOCMAP_PASSPHRASE": "sbagliata-sbagliata"}):
            code, out, err = run_cli("--base", self.base, "ripristina", r["file"])
        self.assertEqual(code, 3)
        self.assertIn("Passphrase dei backup sbagliata", err)
        self.assertIn("nulla è stato cambiato", err)
        self.assertEqual(sorted(os.listdir(self.p["dati"])), before)
        self.assertEqual(count_rows(self.db), 0)
        self.assertFalse([n for n in os.listdir(self.p["backup"]) if n.startswith("_decifrato")])   # niente in chiaro lasciato
        with open(os.path.join(self.tmp, "pp-altrove.txt"), encoding="utf-8") as f:
            right = [ln.strip() for ln in f if ln.strip() and not ln.startswith("#")][0]
        with mock.patch.dict(os.environ, {"DOCMAP_PASSPHRASE": right}):
            code, out, err = run_cli("--base", self.base, "ripristina", r["file"])
        self.assertEqual(code, 0, err)
        self.assertEqual(count_rows(self.db), 5)
        self.assertTrue(json.loads(out)["passphrase_aggiunta"])

    def test_restore_corrupted_backup_changes_nothing(self):
        r = T.make_backup(self.base, now=dt.datetime(2026, 11, 2, 12, 30))
        with open(r["file"], "r+b") as f:
            f.seek(T.HEADER_LEN + 100)
            b = f.read(1)
            f.seek(T.HEADER_LEN + 100)
            f.write(bytes([b[0] ^ 0xFF]))
        before = sorted(os.listdir(self.p["dati"]))
        with self.assertRaisesRegex(T.ToolError, "danneggiato o manomesso"):
            T.restore_backup(self.base, r["file"])
        self.assertEqual(sorted(os.listdir(self.p["dati"])), before)

    def test_legacy_zip_restore(self):
        r = T.make_backup(self.base, now=dt.datetime(2026, 11, 2, 12, 30))
        legacy = os.path.join(self.p["backup"], "docmap_20261101_1230.zip")
        shutil.copyfile(plain_zip(self.base, r["file"], self.tmp), legacy)
        os.replace(T.passphrase_path(self.base), os.path.join(self.tmp, "pp.txt"))   # un vecchio zip non ne ha bisogno
        con = sqlite3.connect(self.db)
        con.execute("DELETE FROM records")
        con.commit()
        con.close()
        self.assertFalse(T.verify_backup_file(self.base, legacy)["cifrato"])
        res = T.restore_backup(self.base, legacy)
        self.assertFalse(res["cifrato"])
        self.assertEqual(count_rows(self.db), 5)
        self.assertIn("docmap_20261101_1230.zip", T.list_backups(self.p["backup"]))
        code, out, _ = run_cli("--base", self.base, "elenco-backup")
        self.assertIn(".zip", out)
        self.assertIn(".docmap-backup", out)

    def test_export_plain_needs_confirmation(self):
        r = T.make_backup(self.base, now=dt.datetime(2026, 11, 2, 12, 30))
        out_zip = os.path.join(self.tmp, "emergenza.zip")
        code, out, err = run_cli("--base", self.base, "esporta-in-chiaro", r["file"], "--out", out_zip)
        self.assertEqual(code, 2)
        self.assertIn("conferma", err)
        self.assertFalse(os.path.exists(out_zip))
        code, out, err = run_cli("--base", self.base, "esporta-in-chiaro", r["file"], "--out", out_zip, "--conferma", "si")
        self.assertEqual(code, 2)
        code, out, err = run_cli("--base", self.base, "esporta-in-chiaro", r["file"], "--out", out_zip, "--conferma", "ESPORTA IN CHIARO")
        self.assertEqual(code, 0, err)
        self.assertEqual(T.verify_zip(out_zip)["righe"], {"records": 5})
        self.assertEqual(run_cli("--base", self.base, "esporta-in-chiaro", r["file"], "--out", out_zip,
                                 "--conferma", "ESPORTA IN CHIARO")[0], 2)    # mai sopra un file esistente

    def test_verifica_backup_without_server_key_check(self):
        """Database finto (senza meta/key_check): integrità ok, chiave 'nessun controllo'; chiave malformata = errore."""
        T.make_backup(self.base, now=dt.datetime(2026, 11, 2, 12, 0))
        with self.assertRaisesRegex(T.ToolError, "non valida"):         # a*44 non sono 32 byte
            T.verify_latest_backup(self.base)
        self.valid_key()
        T.make_backup(self.base, now=dt.datetime(2026, 11, 2, 12, 30))
        res = T.verify_latest_backup(self.base)
        self.assertEqual(res["esito"], "ok")
        self.assertEqual(res["integrita"], "ok")
        self.assertEqual(res["chiave"], "nessun controllo")
        self.assertEqual(res["righe"], {"records": 5})

    def _reencrypt(self, zpath, mutate):
        """Riscrive lo zip in chiaro con `mutate(nome, dati) -> dati` (MANIFEST ricalcolato) e lo cifra come backup nuovo."""
        out = os.path.join(self.tmp, "mod.zip")
        with zipfile.ZipFile(zpath) as zin, zipfile.ZipFile(out, "w") as zout:
            man = json.loads(zin.read("MANIFEST.json"))
            for n in zin.namelist():
                if n == "MANIFEST.json":
                    continue
                data = mutate(n, zin.read(n))
                man["file"][n] = hashlib.sha256(data).hexdigest()
                zout.writestr(n, data)
            zout.writestr("MANIFEST.json", json.dumps(man))
        final = os.path.join(self.p["backup"], "docmap_20301231_2359.docmap-backup")   # il più recente
        T.encrypt_file(out, final, T.read_passphrases(self.base)[0])
        return final

    def test_verifica_backup_detects_corrupted_database(self):
        r = T.make_backup(self.base, now=dt.datetime(2026, 11, 2, 12, 30))
        pz = plain_zip(self.base, r["file"], self.tmp)

        def corrupt(n, data):
            if n != "docmap.sqlite":
                return data
            b = bytearray(data)
            for i in range(4096 + 16, min(len(b), 8192)):               # rovina la seconda pagina (la tabella)
                b[i] = 0xAB
            return bytes(b)
        self._reencrypt(pz, corrupt)
        code, out, err = run_cli("--base", self.base, "verifica-backup")
        self.assertEqual(code, 6, out + err)
        self.assertIn("integrità", err)
        state = jl(os.path.join(self.p["log"], T.VERIFY_STATE))
        self.assertEqual(state["esito"], "errore")
        # file cifrato rovinato: stesso codice di uscita
        with open(r["file"], "r+b") as f:
            f.seek(-5, 2)
            f.write(b"XXXXX")
        code, out, err = run_cli("--base", self.base, "verifica-backup", "--file", r["file"])
        self.assertEqual(code, 6)
        self.assertIn("danneggiato", err)

    def test_verifica_backup_skips_when_recent(self):
        self.valid_key()
        T.make_backup(self.base, now=dt.datetime(2026, 11, 2, 12, 30))
        res = T.verify_latest_backup(self.base, now=dt.datetime(2026, 11, 2, 13, 0))
        self.assertFalse(res["saltata"])
        res = T.verify_latest_backup(self.base, if_older_days=7, now=dt.datetime(2026, 11, 5, 13, 0))
        self.assertTrue(res["saltata"])
        res = T.verify_latest_backup(self.base, if_older_days=7, now=dt.datetime(2026, 11, 10, 13, 0))
        self.assertFalse(res["saltata"])
        self.assertEqual(res["esito"], "ok")
        shutil.move(self.p["backup"], os.path.join(self.tmp, "backup-spostati"))
        with self.assertRaisesRegex(T.ToolError, "Nessun backup"):
            T.verify_latest_backup(self.base)

    def test_kit_status_and_page(self):
        self.assertEqual(T.kit_status(self.base)["stato"], "mancante")
        k = T.make_kit(self.base, os.path.join(self.tmp, "kit", "studio"), now=dt.datetime(2026, 11, 3, 10, 0))
        self.assertTrue(k["kit"].endswith("studio.docmap-key"))
        self.assertTrue(k["pagina"].endswith("studio.html"))
        self.assertEqual(T.kit_status(self.base)["stato"], "ok")
        html = rd(k["pagina"])
        groups = re.findall(r'<div class=code>(.*?)</div>', html)[0]
        code = "-".join(re.findall(r"<span>([0-9A-Z]{5})</span>", groups))
        self.assertEqual(len(code), 35)
        self.assertIn(T.read_passphrases(self.base)[0], html)
        self.assertNotIn("<script", html)                              # pagina statica, niente QR né script
        with open(k["kit"], "rb") as f:
            raw = f.read()
        self.assertTrue(raw.startswith(T.KEY_MAGIC))
        self.assertNotIn(b"aaaa", raw)
        payload = T.read_kit(k["kit"], code)
        self.assertEqual(payload["config"]["aes_key"], "a" * 44)
        self.assertEqual(payload["passphrase_backup"], T.read_passphrases(self.base))
        with self.assertRaises(T.ToolError):
            T.make_kit(self.base, k["kit"])                            # mai sopra un kit esistente
        run_cli("--base", self.base, "passphrase-backup", "--nuova")
        self.assertEqual(T.kit_status(self.base)["stato"], "da-rifare")
        r = T.make_backup(self.base, now=dt.datetime(2026, 11, 3, 12, 30))
        self.assertEqual(r["kit"], "da-rifare")
        code2, out, _ = run_cli("--base", self.base, "kit-emergenza")
        self.assertEqual(code2, 0)
        self.assertTrue(json.loads(out)["kit"].startswith(os.path.join(self.p["config_dir"], "kit-emergenza")))
        self.assertEqual(json.loads(run_cli("--base", self.base, "stato-kit")[1])["stato"], "ok")


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


@unittest.skipUnless(HAVE_SERVER, "servono fastapi, uvicorn e cryptography")
class KitWithRealServerTest(unittest.TestCase):
    """Database scritto dal server Python vero → backup cifrato + kit → config persa → recupera-chiave → il server riapre
    il database e restituisce i record; verifica-backup legge davvero i record con la chiave."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.base = os.path.join(self.tmp, "DocMap")
        self.p = T.paths(self.base)
        os.makedirs(self.base)
        r = subprocess.run([sys.executable, "-m", "docmap_server", "setup", "--config", self.p["config"], "--data-dir",
                            self.p["dati"], "--user", "davide,admin"], cwd=SERVER_PY, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.token = [ln.split()[-1] for ln in r.stdout.splitlines() if ln.startswith("davide")][0]
        self.procs = []

    def tearDown(self):
        for pr, log in self.procs:
            pr.terminate()
            try:
                pr.wait(10)
            except subprocess.TimeoutExpired:
                pr.kill()
            log.close()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def start(self):
        port = free_port()
        log = open(os.path.join(self.tmp, "server-%d.log" % port), "ab")
        pr = subprocess.Popen([sys.executable, "-m", "docmap_server", "serve", "--config", self.p["config"], "--port", str(port),
                               "--log-level", "warning"], cwd=SERVER_PY, stdout=log, stderr=log)
        self.procs.append((pr, log))
        url = "http://127.0.0.1:%d/api" % port
        for _ in range(150):
            try:
                NOPROXY.open(url + "?r=ping", timeout=2).read()
                return url
            except Exception:   # noqa: BLE001
                time.sleep(0.1)
        raise RuntimeError("server non partito")

    def call(self, url, route, body=None):
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(url + "?r=" + route, data=data, method="POST" if data else "GET")
        req.add_header("X-DocMap-Token", self.token)
        if data:
            req.add_header("Content-Type", "application/json")
        try:
            with NOPROXY.open(req, timeout=20) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"null")

    def test_kit_rebuilds_config_and_database_opens(self):
        url = self.start()
        now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        recs = [{"type": "binder", "id": "b-%d" % i, "updated_at": now,
                 "data": {"id": "b-%d" % i, "speaking_code": "B%d" % i, "binder_title": "Faldone %d" % i}} for i in range(7)]
        recs.append({"type": "client", "id": "c-1", "updated_at": now, "data": {"id": "c-1", "name": "Cliente Rossi"}})
        st, b = self.call(url, "push", {"records": recs, "tombstones": [], "deviceId": "dev-test", "operator": "Test"})
        self.assertEqual(st, 200, b)

        bk = T.make_backup(self.base)
        v = T.verify_latest_backup(self.base)
        self.assertEqual(v["esito"], "ok")
        self.assertEqual(v["chiave"], "ok")
        self.assertTrue(v["chiave_uguale_a_quella_attuale"])
        self.assertEqual(v["record_per_tipo"], {"binder": 7, "client": 1})
        self.assertEqual(v["record_letti"], 8)
        self.assertEqual(v["record_illeggibili"], 0)

        kit = T.make_kit(self.base)
        html = rd(kit["pagina"])
        code = "".join(re.findall(r"<span>([0-9A-Z]{5})</span>", html))
        for pr, log in self.procs:
            pr.terminate()
            pr.wait(10)

        # "disastro": config e passphrase spariscono (altro PC, disco rifatto…), il database resta
        lost = os.path.join(self.tmp, "_persi")
        os.makedirs(lost)
        orig = jl(self.p["config"])
        for f in (self.p["config"], T.passphrase_path(self.base)):
            os.replace(f, os.path.join(lost, os.path.basename(f)))

        with mock.patch.dict(os.environ, {"DOCMAP_CODICE": T.generate_code()}):
            code_rc, out, err = run_cli("--base", self.base, "recupera-chiave", "--kit", kit["kit"])
        self.assertEqual(code_rc, 3)
        self.assertIn("Codice di recupero sbagliato", err)
        self.assertFalse(os.path.exists(self.p["config"]))

        with mock.patch.dict(os.environ, {"DOCMAP_CODICE": code.lower()}):
            code_rc, out, err = run_cli("--base", self.base, "recupera-chiave", "--kit", kit["kit"])
        self.assertEqual(code_rc, 0, err)
        res = json.loads(out)
        self.assertEqual(res["database"]["chiave"], "ok")
        self.assertEqual(res["database"]["record_letti"], 8)
        new = jl(self.p["config"])
        self.assertEqual(new["aes_key"], orig["aes_key"])
        self.assertEqual(new["tokens"], orig["tokens"])
        self.assertEqual(new["data_dir"], self.p["dati"])
        self.assertTrue(T.secret_opens(bk["file"], T.read_passphrases(self.base)[0]))   # anche i backup si riaprono

        url = self.start()                                             # il server riapre il database con la chiave recuperata
        st, b = self.call(url, "pull")
        self.assertEqual(st, 200, b)
        self.assertEqual(sorted(r["id"] for r in b["records"]), sorted(r["id"] for r in recs))
        self.assertEqual({r["id"]: r["data"].get("binder_title") for r in b["records"]}["b-3"], "Faldone 3")

    def test_recover_does_not_overwrite_other_key_without_flag(self):
        kit = T.make_kit(self.base)
        code = "".join(re.findall(r"<span>([0-9A-Z]{5})</span>", rd(kit["pagina"])))
        cfg = jl(self.p["config"])
        orig_key = cfg["aes_key"]
        cfg["aes_key"] = base64.b64encode(os.urandom(32)).decode()       # installazione nuova con un'altra chiave
        with open(self.p["config"], "w", encoding="utf-8") as f:
            json.dump(cfg, f)
        with self.assertRaisesRegex(T.ToolError, "un'altra chiave"):
            T.recover_key(self.base, kit["kit"], code)
        self.assertNotEqual(jl(self.p["config"])["aes_key"], orig_key)
        res = T.recover_key(self.base, kit["kit"], code, replace=True)
        self.assertEqual(jl(self.p["config"])["aes_key"], orig_key)
        self.assertEqual(jl(res["config_precedente"])["aes_key"], cfg["aes_key"])


if __name__ == "__main__":
    unittest.main()
