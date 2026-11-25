"""Gateway workstation: token, IP filter, routing by model, queue (429), /dm/v1/read, reasoning removed."""

import json
import sys
import threading
import unittest
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from docmap_workstation import gateway as G  # noqa: E402

TOKEN = "dmws_prova"


def start(cfg_extra=None):
    cfg = G.load_config(None)
    cfg.update({"name": "ws-test", "port": 0, "tokens": [{"name": "test", "sha256": G.hash_token(TOKEN)}],
                "backends": [{"name": "m1", "url": "mock:", "models": {"inkling-2-mini": "thinkingmachines/Inkling-2-Mini"}},
                             {"name": "m2", "url": "mock:think", "models": {"pensa": "x/pensa"}}]})
    cfg.update(cfg_extra or {})
    box = {}
    ev = threading.Event()

    def ready(gw, httpd):
        box.update(gw=gw, httpd=httpd)
        ev.set()
    threading.Thread(target=G.serve, args=(cfg, ready), daemon=True).start()
    ev.wait(5)
    return box, f"http://127.0.0.1:{box['httpd'].server_address[1]}"


def req(url, body=None, token=TOKEN):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = "Bearer " + token
    r = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, headers=h,
                               method="POST" if body is not None else "GET")
    try:
        with urllib.request.urlopen(r, timeout=10) as x:
            return x.status, json.loads(x.read()), dict(x.headers)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read()), dict(e.headers)


class GatewayTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.box, cls.url = start()

    @classmethod
    def tearDownClass(cls):
        cls.box["httpd"].shutdown()

    def test_ping_without_token_health_with_token(self):
        self.assertEqual(req(self.url + "/dm/v1/ping", token=None)[0], 200)
        self.assertEqual(req(self.url + "/dm/v1/health", token=None)[0], 401)
        self.assertEqual(req(self.url + "/dm/v1/health", token="sbagliato")[0], 401)
        st, j, _ = req(self.url + "/dm/v1/health")
        self.assertEqual(st, 200)
        self.assertTrue(j["ok"])
        self.assertEqual(j["name"], "ws-test")
        self.assertIn("inkling-2-mini", j["models"])
        self.assertIn("max_parallel", j["queue"])

    def test_models_openai_style(self):
        st, j, _ = req(self.url + "/v1/models")
        self.assertEqual([m["id"] for m in j["data"]], ["inkling-2-mini", "pensa"])

    def test_chat_routes_and_hides_backend_id(self):
        st, j, h = req(self.url + "/v1/chat/completions", {"model": "inkling-2-mini", "messages": [{"role": "user", "content": "x"}]})
        self.assertEqual(st, 200)
        self.assertEqual(j["model"], "inkling-2-mini")
        self.assertEqual(h.get("X-DM-Backend"), "m1")
        st, j, _ = req(self.url + "/v1/chat/completions", {"model": "nessuno", "messages": []})
        self.assertEqual(st, 404)
        self.assertEqual(j["error"]["type"], "unknown_model")

    def test_read_ocr_and_json_strip_reasoning(self):
        st, j, _ = req(self.url + "/dm/v1/read", {"task": "ocr", "model": "pensa", "image": {"mime": "image/png", "data": "AAAA"}})
        self.assertEqual(st, 200)
        self.assertEqual(j["text"], "TESTO DI PROVA")
        st, j, _ = req(self.url + "/dm/v1/read", {"task": "json", "model": "inkling-2-mini", "prompt": "leggi"})
        self.assertEqual(j["result"]["ok"], True)
        self.assertEqual(req(self.url + "/dm/v1/read", {"task": "altro"})[0], 400)

    def test_stream_refused(self):
        self.assertEqual(req(self.url + "/v1/chat/completions", {"model": "pensa", "stream": True, "messages": []})[0], 400)


class QueueAndIpTest(unittest.TestCase):
    def test_busy_answers_429(self):
        box, url = start({"max_waiting": 1, "backends": [{"name": "lento", "url": "mock:slow", "models": {"m": "m"}, "max_parallel": 1}]})
        try:
            with ThreadPoolExecutor(6) as ex:
                codes = list(ex.map(lambda _: req(url + "/v1/chat/completions", {"model": "m", "messages": []})[0], range(6)))
            self.assertIn(200, codes)
            self.assertIn(429, codes)
        finally:
            box["httpd"].shutdown()

    def test_ip_filter(self):
        box, url = start({"allow_ips": ["10.8.0."]})
        try:
            self.assertEqual(req(url + "/dm/v1/health")[0], 403)
        finally:
            box["httpd"].shutdown()

    def test_token_per_project_with_allowed_models(self):
        box, url = start({"tokens": [{"name": "dl", "sha256": G.hash_token(TOKEN), "project": "progetto-a", "models": ["pensa"]}]})
        try:
            self.assertEqual(req(url + "/dm/v1/health")[1]["models"], ["pensa"])
            self.assertEqual([m["id"] for m in req(url + "/v1/models")[1]["data"]], ["pensa"])
            st, j, _ = req(url + "/v1/chat/completions", {"model": "inkling-2-mini", "messages": []})
            self.assertEqual((st, j["error"]["type"]), (403, "forbidden_model"))
            self.assertEqual(req(url + "/v1/chat/completions", {"model": "pensa", "messages": []})[0], 200)
        finally:
            box["httpd"].shutdown()

    def test_slot_group_one_job_per_gpu(self):
        box, url = start({"max_waiting": 8, "slot_groups": {"gpu0": 1}, "backends": [
            {"name": "a", "url": "mock:slow", "models": {"a": "a"}, "max_parallel": 4, "slot_group": "gpu0"},
            {"name": "b", "url": "mock:slow", "models": {"b": "b"}, "max_parallel": 4, "slot_group": "gpu0"}]})
        try:
            import time as _t
            t0 = _t.monotonic()
            with ThreadPoolExecutor(4) as ex:
                codes = list(ex.map(lambda m: req(url + "/v1/chat/completions", {"model": m, "messages": []})[0], ["a", "b", "a", "b"]))
            self.assertEqual(codes, [200] * 4)
            self.assertGreaterEqual(_t.monotonic() - t0, 1.1)   # 4 × 0.3 s one after the other: the GPU is shared
        finally:
            box["httpd"].shutdown()

    def test_new_token_only_hash_saved(self):
        import tempfile
        from docmap_workstation.__main__ import main
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "w.json"
            main(["token-nuovo", "--config", str(p), "--nome", "hub", "--progetto", "archivio", "--modelli", "a, b"])
            raw = json.loads(p.read_text())
            self.assertEqual((raw["tokens"][0]["project"], raw["tokens"][0]["models"]), ("archivio", ["a", "b"]))
            self.assertEqual(raw["tokens"][0]["name"], "hub")
            self.assertEqual(len(raw["tokens"][0]["sha256"]), 64)


    def test_disabled_backend_is_ignored_and_example_has_only_ollama_on(self):
        gw = G.Gateway(dict(G.load_config(None), backends=[{"name": "a", "url": "mock:", "models": {"x": "x"}},
                                                          {"name": "b", "url": "mock:", "enabled": False, "models": {"y": "y"}}]))
        self.assertEqual([b.name for b in gw.backends], ["a"])
        ex = json.loads((Path(__file__).resolve().parent.parent / "workstation.esempio.json").read_text("utf-8"))
        self.assertEqual([b["name"] for b in ex["backends"] if b.get("enabled", True)], ["ollama"])


    def test_relative_log_file_beside_the_config(self):
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "w.json"
            p.write_text(json.dumps({"log_file": "accessi.jsonl"}), "utf-8")
            self.assertEqual(G.load_config(p)["log_file"], str(Path(td).resolve() / "accessi.jsonl"))


if __name__ == "__main__":
    unittest.main()
