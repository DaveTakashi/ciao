"""Pacchetto PERSONALE del cliente (preparato dal hub) e configurazione del ponte web <-> studio, parte Python.

    python3 -m unittest discover -s docmapv1/installer-windows/tests -v

Copre: lettura/validazione della chiave pubblica esportata dal hub; pacchetto con trusted_keys.json, licenza (verificata
con il verificatore impacchettato), cliente.json, modello di sincronizzazione SENZA segreti, documenti; rifiuti (modello
con token, licenza senza chiave, licenza firmata con un'altra chiave, chiave non valida); info-pacchetto; abilita-licenza;
codice "ponte-sync" (impronta nel formato del server, sostituito alla seconda volta, accettato da un server vero);
profilo del ponte (campi, permessi 0600, sincronizza.bat, stato spostato se cambia il sito); configura-sync da riga di
comando con il token in variabile d'ambiente (mai negli argomenti).
"""
import io
import json
import hashlib
import os
import socket
import stat
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request
from contextlib import redirect_stdout, redirect_stderr

HERE = os.path.dirname(os.path.abspath(__file__))
INST = os.path.dirname(HERE)
DOCMAP = os.path.dirname(INST)
HUB = os.path.join(DOCMAP, "hub")
SERVER_PY = os.path.join(DOCMAP, "server-python")
sys.path.insert(0, INST)
sys.dont_write_bytecode = True
import docmap_tools as T  # noqa: E402

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

WEB_API = "https://docmap.pr-it.it/studio-rossi/server-php/api.php"


def jload(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def jdump(obj, p):
    with open(p, "w", encoding="utf-8") as f:
        json.dump(obj, f)


def make_base(tmp, porta=8443):
    base = os.path.join(tmp, "DocMap")
    p = T.paths(base)
    os.makedirs(p["config_dir"])
    os.makedirs(p["dati"])
    jdump({"data_dir": p["dati"], "aes_key": "a" * 44, "studio_name": "Studio Rossi", "allowed_origins": ["null"],
           "tokens": [{"user": "davide", "role": "admin", "token_sha256": "0" * 64}]}, p["config"])
    T.ensure_settings(base, {"porta": porta, "nome_studio": "Studio Rossi"})
    return base


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


@unittest.skipUnless(HAVE_CRYPTO and os.path.isdir(HUB), "servono cryptography e docmapv1/hub")
class PersonalPackageTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sys.path.insert(0, HUB)
        from docmap_hub.service import Hub
        cls.td = tempfile.TemporaryDirectory(prefix="dm-pkg-cliente-")
        cls.tmp = cls.td.name
        cls.hub = Hub(os.path.join(cls.tmp, "hub"))
        cls.hub.keys.generate("passphrase-di-prova")
        cls.pub = os.path.join(cls.tmp, "public-keys.json")
        with open(cls.pub, "w", encoding="utf-8") as f:
            f.write(cls.hub.keys.export("json"))
        c = cls.hub.registry.add_customer("Studio Rossi", "IT01234567890")
        cls.inst = cls.hub.registry.add_instance(c["id"], "Studio Rossi — sede")
        cls.lic = str(cls.hub.issue("passphrase-di-prova", cls.inst["id"], "studio")["path"])
        cls.model = os.path.join(cls.tmp, "modello.json")
        jdump({"name": "Web ⇄ Studio Rossi", "a": {"label": "Web", "url": WEB_API, "basic_user": ""}, "direction": "both"}, cls.model)
        cls.doc = os.path.join(cls.tmp, "SCHEDA.html")
        with open(cls.doc, "w", encoding="utf-8") as f:
            f.write("<p>scheda</p>")
        cls.pkg = os.path.join(cls.tmp, "pkg")
        cls.res = T.build_package(cls.pkg, make_zip=True, public_keys=cls.pub, licence=cls.lic, studio_name="Studio Rossi",
                                  sync_model=cls.model, client_info={"cliente": "Studio Rossi", "instance_id": cls.inst["id"]},
                                  documents=[cls.doc])

    @classmethod
    def tearDownClass(cls):
        cls.hub.close()
        cls.td.cleanup()

    def test_public_keys_file(self):
        keys = T.read_public_keys_file(self.pub)
        self.assertEqual(set(keys), set(json.loads(self.hub.keys.export("json"))["keys"]))
        bad = os.path.join(self.tmp, "bad.json")
        for content in ("{nope", '{"keys": {}}', '{"keys": {"k1": "AAAA"}}', '{"keys": {"bad id": "%s"}}' % list(keys.values())[0]):
            with open(bad, "w") as f:
                f.write(content)
            with self.assertRaises(T.ToolError):
                T.read_public_keys_file(bad)

    def test_package_contents(self):
        r = self.res
        self.assertTrue(r["personale"] and r["sync"])
        self.assertTrue(r["licenza"]["verificata"])
        self.assertEqual(r["licenza"]["mode"], "full")
        self.assertEqual(T.check_package(self.pkg), [])
        tk = jload(os.path.join(self.pkg, "server", "docmap_server", "trusted_keys.json"))
        self.assertEqual(tk["keys"], T.read_public_keys_file(self.pub))
        info = T.package_info(self.pkg)
        self.assertEqual((info["cliente"], info["nome_studio"], info["instance_id"]), ("Studio Rossi", "Studio Rossi", self.inst["id"]))
        self.assertEqual(info["licenza"]["instance_id"], self.inst["id"])
        self.assertTrue(info["file_licenza"].endswith(os.path.join("cliente", "licence.docmap-licence")))
        tpl = jload(info["file_modello_sync"])
        self.assertEqual(tpl["a"]["url"], WEB_API)
        self.assertTrue(os.path.isfile(os.path.join(self.pkg, "SCHEDA.html")))
        self.assertTrue(os.path.isfile(os.path.join(self.pkg, "configura-sync.ps1")))
        with open(os.path.join(self.pkg, "PACCHETTO-MANIFEST.txt"), encoding="utf-8") as f:
            man = f.read()
        self.assertIn("server/docmap_server/trusted_keys.json", man)
        self.assertIn("cliente/licence.docmap-licence", man)

    def test_no_secrets_in_package(self):
        import zipfile
        with zipfile.ZipFile(self.res["zip"]) as z:
            for n in z.namelist():
                if n.startswith("cliente/") or n.endswith("trusted_keys.json"):
                    body = z.read(n).decode("utf-8")
                    self.assertNotIn('"token"', body, n)
                    self.assertNotIn("PRIVATE", body, n)
            self.assertFalse([n for n in z.namelist() if n.endswith((".key", "config.json"))])

    def test_generic_package_info_empty(self):
        self.assertEqual(T.package_info(self.tmp), {})

    def test_rejections(self):
        n = [0]

        def out():
            n[0] += 1
            return os.path.join(self.tmp, "rej-%d" % n[0])
        with_token = os.path.join(self.tmp, "tok.json")
        jdump({"a": {"url": WEB_API, "token": "segreto"}}, with_token)
        http_model = os.path.join(self.tmp, "http.json")
        jdump({"a": {"url": "http://docmap.example/server-php/api.php"}}, http_model)
        for kw in ({"sync_model": with_token}, {"sync_model": http_model}, {"licence": self.lic},
                   {"public_keys": os.path.join(self.tmp, "manca.json")}, {"documents": [os.path.join(self.tmp, "manca.md")]}):
            with self.subTest(kw=list(kw)):
                o = out()
                with self.assertRaises(T.ToolError):
                    T.build_package(o, **kw)
                self.assertFalse(os.path.exists(o), "nessuna cartella mezza fatta")
        # licence signed by another hub's key
        from docmap_hub.service import Hub
        other = Hub(os.path.join(self.tmp, "hub2"))
        try:
            other.keys.generate("passphrase-di-prova")
            pub2 = os.path.join(self.tmp, "pub2.json")
            with open(pub2, "w") as f:
                f.write(other.keys.export("json"))
        finally:
            other.close()
        with self.assertRaises(T.ToolError) as cm:
            T.build_package(out(), public_keys=pub2, licence=self.lic)
        self.assertIn("non è tra le chiavi", str(cm.exception))

    def test_cli_pacchetto(self):
        o = os.path.join(self.tmp, "cli-pkg")
        info = os.path.join(self.tmp, "info.json")
        jdump({"cliente": "Studio Rossi"}, info)
        buf = io.StringIO()
        with redirect_stdout(buf):
            rc = T.main(["pacchetto", "--out", o, "--chiave-pubblica", self.pub, "--licenza", self.lic, "--nome-studio", "Studio R",
                         "--sync-modello", self.model, "--cliente-json", info])
        self.assertEqual(rc, 0)
        self.assertTrue(json.loads(buf.getvalue())["personale"])
        buf = io.StringIO()
        with redirect_stdout(buf):
            self.assertEqual(T.main(["info-pacchetto", o]), 0)
        self.assertEqual(json.loads(buf.getvalue())["nome_studio"], "Studio R")


class SyncSetupTest(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory(prefix="dm-sync-cfg-")
        self.base = make_base(self.td.name)
        self.p = T.paths(self.base)
        self.tpl = T.sync_template({"name": "Web ⇄ Studio", "a": {"url": WEB_API, "label": "Web"}})

    def tearDown(self):
        self.td.cleanup()

    def test_template_rules(self):
        self.assertEqual(self.tpl["direction"], "both")
        self.assertEqual(self.tpl["ogni_minuti"], 10)
        for bad in ({}, {"a": "x"}, {"a": {"url": "ftp://x"}}, {"a": {"url": WEB_API, "basic_pass": "pw"}},
                    {"a": {"url": WEB_API}, "b": {"token": "t"}}):
            with self.assertRaises(T.ToolError):
                T.sync_template(bad)

    def test_enable_licence_required(self):
        self.assertEqual(T.enable_licence_required(self.base), {"licence_required": True, "cambiato": True})
        cfg = jload(self.p["config"])
        self.assertIs(cfg["licence_required"], True)
        self.assertEqual(cfg["aes_key"], "a" * 44)                        # nient'altro cambia
        self.assertEqual(T.enable_licence_required(self.base)["cambiato"], False)

    def test_bridge_token(self):
        t1 = T.add_bridge_token(self.base)
        cfg = jload(self.p["config"])
        ent = [t for t in cfg["tokens"] if t["user"] == T.BRIDGE_USER]
        self.assertEqual(len(ent), 1)
        self.assertEqual(ent[0]["role"], "editor")
        self.assertEqual(ent[0]["token_sha256"], hashlib.sha256(t1.encode()).hexdigest())
        self.assertNotIn(t1, json.dumps(cfg))
        t2 = T.add_bridge_token(self.base)
        cfg = jload(self.p["config"])
        self.assertNotEqual(t1, t2)
        self.assertEqual(len([t for t in cfg["tokens"] if t["user"] == T.BRIDGE_USER]), 1)
        self.assertEqual([t["user"] for t in cfg["tokens"]], ["davide", T.BRIDGE_USER])

    def test_profile(self):
        r = T.make_sync_profile(self.base, self.tpl, "web-token-123", "local-tok")
        prof = jload(r["profilo"])
        self.assertEqual(prof["a"]["url"], WEB_API)
        self.assertEqual(prof["a"]["token"], "web-token-123")
        self.assertEqual(prof["b"]["url"], "https://127.0.0.1:8443/api")
        self.assertEqual(prof["b"]["token"], "local-tok")
        self.assertEqual(prof["b"]["ca"], os.path.join(self.p["certificati"], T.CA_CERT))
        self.assertFalse(prof["a"]["insecure_lan"] or prof["b"]["insecure_lan"])
        if os.name == "posix":
            self.assertEqual(stat.S_IMODE(os.stat(r["profilo"]).st_mode), 0o600)
        with open(r["bat"], "rb") as f:
            bat = f.read().decode()
        self.assertIn("\r\n", bat)
        self.assertIn("-m docmap_server sync-remote", bat)
        self.assertIn(r["profilo"], bat)
        self.assertNotIn("web-token-123", bat)
        # the profile is accepted by the bridge itself (same keys it reads)
        sys.path.insert(0, SERVER_PY)
        from docmap_server import sync_remote as SR
        self.assertTrue({"a", "b", "direction"} <= set(SR.DEFAULT_PROFILE))
        for side in ("a", "b"):
            self.assertTrue(set(prof[side]) <= set(SR.DEFAULT_PROFILE[side]) | {"token"}, side)
        # same site again: state kept; other site: state moved to _vecchi
        state = r["profilo"][:-5] + ".state.json"
        jdump({"runs": 3}, state)
        T.make_sync_profile(self.base, self.tpl, "web-token-456", "local-tok")
        self.assertTrue(os.path.isfile(state))
        other = T.sync_template({"a": {"url": "https://altro.example/x/server-php/api.php"}})
        r3 = T.make_sync_profile(self.base, other, "web-token-789", "local-tok")
        self.assertFalse(os.path.isfile(state))
        self.assertTrue(os.path.isfile(r3["stato_precedente_spostato"]))
        for bad in ("", "  ", "con spazi dentro"):
            with self.assertRaises(T.ToolError):
                T.make_sync_profile(self.base, self.tpl, bad, "x")

    def test_cli_configura_sync_token_from_env(self):
        os.makedirs(self.p["sync"])
        jdump(self.tpl, os.path.join(self.p["sync"], T.SYNC_TEMPLATE))
        os.environ["DOCMAP_SYNC_TOKEN_WEB"] = "tok-from-env"
        try:
            buf = io.StringIO()
            with redirect_stdout(buf):
                rc = T.main(["--base", self.base, "configura-sync"])
        finally:
            del os.environ["DOCMAP_SYNC_TOKEN_WEB"]
        self.assertEqual(rc, 0)
        out = buf.getvalue()
        self.assertNotIn("tok-from-env", out)
        self.assertEqual(jload(os.path.join(self.p["sync"], T.SYNC_PROFILE))["a"]["token"], "tok-from-env")
        # token from a file
        tf = os.path.join(self.td.name, "token.txt")
        with open(tf, "w", encoding="utf-8-sig") as f:
            f.write("tok-from-file\n")
        with redirect_stdout(io.StringIO()):
            self.assertEqual(T.main(["--base", self.base, "configura-sync", "--token-web-file", tf]), 0)
        self.assertEqual(jload(os.path.join(self.p["sync"], T.SYNC_PROFILE))["a"]["token"], "tok-from-file")
        # no template → clear error, config untouched
        os.replace(os.path.join(self.p["sync"], T.SYNC_TEMPLATE), os.path.join(self.td.name, "moved.json"))
        with open(self.p["config"]) as f:
            before = f.read()
        err = io.StringIO()
        with redirect_stderr(err), redirect_stdout(io.StringIO()):
            self.assertEqual(T.main(["--base", self.base, "configura-sync", "--token-web-file", tf]), 2)
        self.assertIn("Modello", err.getvalue())
        with open(self.p["config"]) as f:
            self.assertEqual(f.read(), before)

    @unittest.skipUnless(HAVE_SERVER, "servono fastapi, uvicorn e cryptography")
    def test_bridge_token_accepted_by_real_server(self):
        port = free_port()
        tok = T.add_bridge_token(self.base)
        cfg = jload(self.p["config"])
        cfg["aes_key"] = __import__("base64").b64encode(os.urandom(32)).decode()
        jdump(cfg, self.p["config"])
        log = open(os.path.join(self.td.name, "srv.log"), "wb")
        proc = subprocess.Popen([sys.executable, "-m", "docmap_server", "serve", "--config", self.p["config"], "--port", str(port),
                                 "--log-level", "warning"], cwd=SERVER_PY, stdout=log, stderr=log)
        try:
            body = None
            for _ in range(100):
                try:
                    req = urllib.request.Request("http://127.0.0.1:%d/api?r=me" % port,
                                                 headers={"Authorization": "Bearer " + tok, "Origin": "null"})
                    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
                    body = json.loads(opener.open(req, timeout=2).read())
                    break
                except Exception:   # noqa: BLE001
                    time.sleep(0.1)
            self.assertIsNotNone(body)
            self.assertEqual((body["user"], body["role"]), (T.BRIDGE_USER, "editor"))
        finally:
            proc.terminate()
            proc.wait(10)
            log.close()


if __name__ == "__main__":
    unittest.main()
