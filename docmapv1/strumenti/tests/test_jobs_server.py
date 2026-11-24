import base64
import json
import shutil
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from docmap_strumenti import jobs as J  # noqa: E402
from docmap_strumenti import settings as S  # noqa: E402
from docmap_strumenti.server import App, make_handler  # noqa: E402

REVIEW_RECIPE = {"name": "Numeri con verifica", "steps": [
    {"block": "ocr", "with": {"engine": "text"}},
    {"block": "extract", "with": {"field": "numero", "pattern": r"N\. (\d+)"}},
    {"block": "review", "with": {"which": "flagged", "fields": ["numero"], "choices": ["fattura", "nota"], "choice_field": "tipo"}},
    {"block": "route", "with": {"to": "{numero}/{file}"}},
    {"block": "report", "with": {"format": "csv", "name": "rep"}}]}


def write_inputs(d: Path):
    d.mkdir(parents=True, exist_ok=True)
    (d / "a.txt").write_text("Documento N. 10", "utf-8")
    (d / "b.txt").write_text("Documento senza numero", "utf-8")
    (d / "c.txt").write_text("Documento N. 12", "utf-8")


def wait(fn, timeout=30.0):
    t = time.time()
    while time.time() - t < timeout:
        v = fn()
        if v:
            return v
        time.sleep(0.1)
    raise AssertionError("timeout")


class QueueTest(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.mkdtemp()
        self.d = Path(self.td)
        self.store = J.Store(self.d / "dati")
        write_inputs(self.d / "in")

    def tearDown(self):
        shutil.rmtree(self.td, ignore_errors=True)

    def test_pause_review_undo_resume_and_audit_chain(self):
        st = self.store
        job = st.create(REVIEW_RECIPE, str(self.d / "in"), str(self.d / "out"))
        q = J.Queue(st, lambda: {})
        st.update(job["id"], status="running")
        q.run_job(job["id"])
        j = st.get(job["id"])
        self.assertEqual(j["status"], "waiting_review")
        self.assertFalse((self.d / "out").exists())          # nothing written before the people decide
        todo = J.review_list(st, job["id"])
        self.assertEqual([x["src"] for x in todo], ["b.txt"])
        iid = todo[0]["id"]
        J.review_apply(st, job["id"], iid, "set", "anna", {"numero": "11"})
        J.review_apply(st, job["id"], iid, "undo", "anna")
        _, items = st.items(job["id"])
        self.assertEqual(next(i for i in items if i.id == iid).value("numero"), "")
        J.review_apply(st, job["id"], iid, "certify", "anna", {"numero": "11", "tipo": "nota"}, note="letto a mano")
        _, items = st.items(job["id"])
        it = next(i for i in items if i.id == iid)
        self.assertEqual((it.status, it.fields["numero"]["by"], it.fields["numero"]["certified"]), ("ok", "human", True))
        self.assertEqual(it.fields["numero"]["machine"]["v"], "")          # the machine reading stays, for training
        self.assertEqual(J.review_list(st, job["id"]), [])
        q.resume(job["id"])
        st.update(job["id"], status="running")
        q.run_job(job["id"])
        j = st.get(job["id"])
        self.assertEqual(j["status"], "done")
        outs = sorted(p.relative_to(self.d / "out").as_posix() for p in (self.d / "out").rglob("*") if p.is_file())
        self.assertEqual(outs, ["10/a.txt", "11/b.txt", "12/c.txt", "rep.csv"])
        ok, n = st.audit_verify()
        self.assertEqual((ok, n), (True, 3))
        c = sqlite3.connect(st.path)                     # changing an old decision breaks the chain
        c.execute("UPDATE audit SET user = 'mario' WHERE id = 1")
        c.commit()
        c.close()
        self.assertEqual(st.audit_verify(), (False, 1))

    def test_resume_without_reviewing_routes_to_review_folder(self):
        st = self.store
        job = st.create(REVIEW_RECIPE, str(self.d / "in"), str(self.d / "out"))
        q = J.Queue(st, lambda: {})
        st.update(job["id"], status="running")
        q.run_job(job["id"])
        q.resume(job["id"])
        st.update(job["id"], status="running")
        q.run_job(job["id"])
        self.assertEqual(st.get(job["id"])["status"], "done")
        self.assertTrue((self.d / "out" / "_da_verificare" / "b.txt").is_file())

    def test_credits_metered_and_limited(self):
        st = self.store
        s = {"ocr": {"mock_text": "N. 5"}, "credits": {"costs": {"ocr_page": 2}, "local_month": 3}}
        rec = {"name": "mock ocr", "input": {"patterns": ["*.png"]}, "steps": [{"block": "ocr", "with": {"engine": "mock"}}]}
        from PIL import Image
        for n in range(3):
            Image.new("L", (50, 50), 255).save(self.d / "in" / f"{n}.png")
        job = st.create(rec, str(self.d / "in"), str(self.d / "out"))
        q = J.Queue(st, lambda: s)
        st.update(job["id"], status="running")
        q.run_job(job["id"])
        j = st.get(job["id"])
        self.assertEqual(j["status"], "failed")
        self.assertIn("crediti", j["error"])
        self.assertEqual(st.used("local"), 2)
        self.assertEqual(st.usage()[0]["kind"], "ocr_page")

    def test_tokens(self):
        tok = self.store.token_create("studio-rossi", "prova", "pro", 100)
        self.assertEqual(self.store.token_check(tok)["tenant"], "studio-rossi")
        self.assertIsNone(self.store.token_check(tok + "x"))
        self.assertEqual(self.store.limit("studio-rossi", {}), 100)
        self.store.token_revoke("studio-rossi")
        self.assertIsNone(self.store.token_check(tok))


class Srv:
    """A real server on a free port, in a thread."""

    def __init__(self, data: Path, remote: bool = False):
        self.app = App(data, remote)
        allowed = set() if remote else {"127.0.0.1", "localhost"}
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(self.app, allowed))
        self.httpd.daemon_threads = True
        self.url = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        self.app.queue.start()
        threading.Thread(target=self.httpd.serve_forever, kwargs={"poll_interval": 0.1}, daemon=True).start()

    def close(self):
        self.app.queue.stop()
        self.httpd.shutdown()
        self.httpd.server_close()

    def call(self, path, body=None, key=None, raw=False, headers=None, method=None):
        h = {"X-Key": self.app.key if key is None else key, **(headers or {})}
        data = None
        if body is not None:
            if isinstance(body, (bytes, bytearray)):
                data = bytes(body)
            else:
                data = json.dumps(body).encode()
                h["Content-Type"] = "application/json"
        req = urllib.request.Request(self.url + path, data=data, headers=h, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                b = r.read()
                return (r.status, b) if raw else (r.status, json.loads(b))
        except urllib.error.HTTPError as e:
            b = e.read()
            return e.code, (b if raw else json.loads(b or b"{}"))


class ServerTest(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.mkdtemp()
        self.d = Path(self.td)
        write_inputs(self.d / "in")
        self.s = Srv(self.d / "dati")

    def tearDown(self):
        self.s.close()
        shutil.rmtree(self.td, ignore_errors=True)

    def test_auth_host_ui_and_templates_seeded(self):
        self.assertEqual(self.s.call("/api/info", key="")[0], 401)
        self.assertEqual(self.s.call("/api/info", key="sbagliata")[0], 401)
        st, info = self.s.call("/api/info")
        self.assertEqual((st, info["admin"]), (200, True))
        st, page = self.s.call("/", raw=True)
        self.assertIn(b"Strumenti", page)
        self.assertNotIn(b"{{BRAND}}", page)
        self.assertEqual(self.s.call("/api/info", headers={"Host": "evil.example"})[0], 403)   # DNS rebinding
        st, r = self.s.call("/api/recipes")
        self.assertGreaterEqual(len(r["recipes"]), 10)       # the example recipes are the user's from the start
        self.assertEqual(len(self.s.call("/api/blocks")[1]["blocks"]), 20)

    def test_preview_upload_job_review_download(self):
        st, r = self.s.call("/api/recipes", {"recipe": REVIEW_RECIPE})
        rid = r["recipe"]["id"]
        st, up = self.s.call("/api/sample", b"Documento N. 77", headers={"X-Name-B64": base64.b64encode("prova è.txt".encode()).decode()})
        self.assertEqual(st, 200)
        st, pv = self.s.call("/api/preview", {"recipe_id": rid, "sample": up["sample"]})
        self.assertEqual(pv["items"][0]["fields"]["numero"]["v"], "77")
        self.assertEqual(pv["outputs"], ["77/prova è.txt", "rep.csv"])
        st, img = self.s.call(f"/api/preview-file?work={pv['work']}&path={urllib.request.quote(pv['items'][0]['path'])}", raw=True)
        self.assertTrue(img.startswith(b"\x89PNG"))
        st, bad = self.s.call(f"/api/preview-file?work={pv['work']}&path=/etc/passwd", raw=True)
        self.assertEqual(st, 404)
        st, j = self.s.call("/api/jobs", {"recipe_id": rid, "input_dir": str(self.d / "in"), "output_dir": str(self.d / "out")})
        jid = j["job"]["id"]
        wait(lambda: self.s.call(f"/api/jobs/{jid}")[1]["job"]["status"] == "waiting_review")
        items = self.s.call(f"/api/jobs/{jid}/items?status=review")[1]["items"]
        self.assertEqual(len(items), 1)
        st, img = self.s.call(f"/api/jobs/{jid}/items/{items[0]['id']}/image", raw=True)
        self.assertTrue(img.startswith(b"\x89PNG"))
        st, r = self.s.call(f"/api/jobs/{jid}/items/{items[0]['id']}", {"action": "certify", "fields": {"numero": "11"}},
                            headers={"X-User": "Anna"})
        self.assertEqual(r["item"]["meta"]["reviewed_by"], "Anna")
        self.s.call(f"/api/jobs/{jid}/resume", {})
        wait(lambda: self.s.call(f"/api/jobs/{jid}")[1]["job"]["status"] == "done")
        st, z = self.s.call(f"/api/jobs/{jid}/download", raw=True)
        names = sorted(zipfile.ZipFile(__import__("io").BytesIO(z)).namelist())
        self.assertEqual(names, ["10/a.txt", "11/b.txt", "12/c.txt", "rep.csv"])
        self.assertEqual(len(self.s.call(f"/api/jobs/{jid}/audit")[1]["audit"]), 1)
        st, fs = self.s.call("/api/fs?path=" + urllib.request.quote(str(self.d / "in")))
        self.assertEqual([f["name"] for f in fs["files"]], ["a.txt", "b.txt", "c.txt"])

    def test_settings_mask_secrets(self):
        self.s.call("/api/settings", {"settings": {"ai": {"provider": "anthropic", "api_key": "sk-segreta"},
                                                   "endpoints": {"ocr": {"url": "https://x.example/ocr", "token": "t1"}}}})
        st, r = self.s.call("/api/settings")
        self.assertEqual(r["settings"]["ai"]["api_key"], S.MASK)
        self.assertEqual(r["settings"]["endpoints"]["ocr"]["token"], S.MASK)
        self.s.call("/api/settings", {"settings": r["settings"]})            # saving the masked copy keeps the secrets
        self.assertEqual(S.load(self.s.app.dir)["ai"]["api_key"], "sk-segreta")
        self.assertEqual(S.load(self.s.app.dir)["endpoints"]["ocr"]["token"], "t1")


class RemoteTest(unittest.TestCase):
    """A light PC sends a job to a remote worker, the review is done through the local UI, results come home."""

    def setUp(self):
        self.td = tempfile.mkdtemp()
        self.d = Path(self.td)
        write_inputs(self.d / "in")
        self.remote = Srv(self.d / "server", remote=True)
        self.tok = self.remote.app.store.token_create("studio-rossi", credits_month=1000)
        self.local = Srv(self.d / "pc")
        S.save(self.local.app.dir, {"remote": {"url": self.remote.url, "token": self.tok, "poll_s": 0.2}})

    def tearDown(self):
        self.local.close()
        self.remote.close()
        shutil.rmtree(self.td, ignore_errors=True)

    def test_tenant_limits(self):
        self.assertEqual(self.remote.call("/api/info", key=self.tok)[1]["admin"], False)
        self.assertEqual(self.remote.call("/api/fs", key=self.tok)[0], 403)
        self.assertEqual(self.remote.call("/api/settings", key=self.tok)[0], 403)
        st, r = self.remote.call("/api/jobs", {"recipe": REVIEW_RECIPE, "input_dir": "/etc"}, key=self.tok)
        self.assertEqual(st, 403)                                   # a tenant never names server folders
        st, r = self.remote.call("/api/preview", {"recipe": REVIEW_RECIPE, "sample_path": "/etc/hosts"}, key=self.tok)
        self.assertEqual(st, 403)

    def test_remote_job_with_review_through_the_local_pc(self):
        st, j = self.local.call("/api/jobs", {"recipe": REVIEW_RECIPE, "input_dir": str(self.d / "in"),
                                               "output_dir": str(self.d / "out"), "run_on": "remote"})
        self.assertEqual(st, 200, j)
        jid = j["job"]["id"]
        self.assertEqual(j["job"]["mode"], "remote")
        wait(lambda: self.local.call(f"/api/jobs/{jid}")[1]["job"]["status"] == "waiting_review")
        items = self.local.call(f"/api/jobs/{jid}/items?status=review")[1]["items"]       # proxied to the server
        self.assertEqual([i["src"] for i in items], ["b.txt"])
        st, img = self.local.call(f"/api/jobs/{jid}/items/{items[0]['id']}/image", raw=True)
        self.assertTrue(img.startswith(b"\x89PNG"))
        st, r = self.local.call(f"/api/jobs/{jid}/items/{items[0]['id']}", {"action": "certify", "fields": {"numero": "11"}})
        self.assertEqual(st, 200, r)
        self.local.call(f"/api/jobs/{jid}/resume", {})
        wait(lambda: self.local.call(f"/api/jobs/{jid}")[1]["job"]["status"] == "done")
        outs = sorted(p.relative_to(self.d / "out").as_posix() for p in (self.d / "out").rglob("*") if p.is_file())
        self.assertEqual(outs, ["10/a.txt", "11/b.txt", "12/c.txt", "rep.csv"])
        rj = self.remote.app.store.list("studio-rossi")
        self.assertEqual((len(rj), rj[0]["tenant"], rj[0]["status"]), (1, "studio-rossi", "done"))
        self.assertEqual(self.remote.call("/api/jobs", key=self.remote.app.store.token_create("altro"))[1]["jobs"], [])

    def test_licence_without_remote(self):
        S.save(self.local.app.dir, {"licence": {"modes": ["local"]}})
        st, r = self.local.call("/api/jobs", {"recipe": REVIEW_RECIPE, "input_dir": str(self.d / "in"), "run_on": "remote"})
        self.assertEqual(st, 403)
        self.assertIn("licenza", r["error"])


class FakeAI(BaseHTTPRequestHandler):
    """OpenAI-compatible, Anthropic and custom endpoint, all in one fake service."""
    seen: list = []

    def log_message(self, *a):
        return

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        FakeAI.seen.append((self.path, dict(self.headers), body))
        if self.path.endswith("/chat/completions"):
            out = {"model": body["model"], "choices": [{"message": {"content": "```json\n" + json.dumps(
                {"cliente": {"value": "ACME", "confidence": 0.95}, "numero": {"value": "9", "confidence": 0.4}}) + "\n```"}}]}
        elif self.path.endswith("/v1/messages"):
            out = {"model": body["model"], "content": [{"type": "text", "text": json.dumps({"value": "42", "confidence": 0.9})}]}
        else:
            out = {"fields": {"esito": {"value": "ok", "confidence": 0.8}}, "tags": ["controllato"],
                   "file": {"name": "timbrato.txt", "data": base64.b64encode(b"TIMBRATO").decode()}}
        b = json.dumps(out).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)


class ExternalTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), FakeAI)
        cls.url = f"http://127.0.0.1:{cls.httpd.server_address[1]}"
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def setUp(self):
        self.td = tempfile.mkdtemp()
        self.d = Path(self.td)
        (self.d / "in").mkdir()
        from PIL import Image
        Image.new("RGB", (300, 400), "white").save(self.d / "in" / "doc.png")
        FakeAI.seen.clear()

    def tearDown(self):
        shutil.rmtree(self.td, ignore_errors=True)

    def _run(self, steps, settings):
        from docmap_strumenti.engine import Context, Engine
        ctx = Context(self.d / "job", self.d / "in", self.d / "out", settings)
        e = Engine({"name": "esterni", "steps": steps}, ctx)
        return e.run(e.collect())["items"][0], ctx

    def test_ai_block_openai_compatible_with_image(self):
        it, ctx = self._run([{"block": "ai", "with": {"fields": ["cliente", "numero"], "prompt": "Leggi {name}"}}],
                            {"ai": {"provider": "openai_compatible", "base_url": self.url + "/v1", "model": "m-1", "api_key": "k"}})
        self.assertEqual(it["fields"]["cliente"]["v"], "ACME")
        self.assertEqual(it["status"], "review")                  # «numero» at 40 % goes to a person
        path, headers, body = FakeAI.seen[0]
        self.assertEqual(headers["Authorization"], "Bearer k")
        self.assertTrue(body["messages"][0]["content"][1]["image_url"]["url"].startswith("data:image/jpeg;base64,"))
        self.assertIn("Leggi doc", body["messages"][0]["content"][0]["text"])
        self.assertEqual(ctx.meters["ai_call"], 1)

    def test_extract_ai_anthropic_format(self):
        it, _ = self._run([{"block": "extract", "with": {"field": "n", "method": "ai", "prompt": "il numero"}}],
                          {"ai": {"provider": "anthropic", "base_url": self.url, "api_key": "sk"}})
        self.assertEqual(it["fields"]["n"]["v"], "42")
        path, headers, body = FakeAI.seen[0]
        headers = {k.lower(): v for k, v in headers.items()}
        self.assertEqual((path, headers["x-api-key"], body["model"]), ("/v1/messages", "sk", "claude-haiku-5-5"))
        self.assertIn("output_config", body)

    def test_http_endpoint_fields_tags_and_new_file(self):
        it, ctx = self._run([{"block": "http", "with": {"endpoint": "timbro", "op": "timbra", "extra": {"x": "{name}"}}}],
                            {"endpoints": {"timbro": {"url": self.url + "/timbra", "token": "t"}}})
        self.assertEqual((it["fields"]["esito"]["v"], it["tags"]), ("ok", ["controllato"]))
        self.assertEqual(Path(it["path"]).read_bytes(), b"TIMBRATO")
        path, headers, body = FakeAI.seen[0]
        self.assertEqual((body["op"], body["extra"], headers["Authorization"]), ("timbra", {"x": "doc"}, "Bearer t"))
        self.assertEqual(base64.b64decode(body["file"]["data"])[:4], b"\x89PNG")

    def test_unknown_endpoint_is_a_clear_error(self):
        it, _ = self._run([{"block": "http", "with": {"endpoint": "nessuno"}}], {})
        self.assertEqual(it["status"], "error")
        self.assertIn("non configurato", it["flags"][0])


if __name__ == "__main__":
    unittest.main()
