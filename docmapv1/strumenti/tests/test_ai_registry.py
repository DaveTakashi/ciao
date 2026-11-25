"""Agnostic AI layer: request shape of every provider, aliases, profiles + fallbacks, workstation pool + gateway."""

import json
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from docmap_strumenti import ai_registry as AR
from docmap_strumenti import providers as PR
from docmap_strumenti import settings as S
from docmap_strumenti import workstations as WS

WS_DIR = Path(__file__).resolve().parents[2] / "workstation"
ANSWER = {"text": "ROSSI SRL", "confidence": 0.9}


class Fake:
    """A local HTTP server that records the requests and answers like the chosen provider."""

    def __init__(self, kind: str, status: int = 200):
        self.kind, self.status, self.calls = kind, status, []
        fake = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)))
                fake.calls.append({"path": self.path, "headers": dict(self.headers), "body": body})
                txt = json.dumps(ANSWER)
                if fake.kind == "anthropic":
                    out = {"model": body["model"], "content": [{"type": "text", "text": txt}], "stop_reason": "end_turn",
                           "usage": {"input_tokens": 11, "output_tokens": 7}}
                elif fake.kind == "gemini":
                    out = {"modelVersion": "g-test", "candidates": [{"content": {"parts": [{"text": "pensiero", "thought": True},
                                                                                          {"text": txt}]}, "finishReason": "STOP"}],
                           "usageMetadata": {"promptTokenCount": 3, "candidatesTokenCount": 4}}
                else:   # chat completions; a local reasoning model without a parser puts <think> in the answer
                    out = {"model": body["model"], "choices": [{"message": {"content": "<think>bla</think>" + txt,
                                                                            "reasoning_content": "x"}}],
                           "usage": {"prompt_tokens": 5, "completion_tokens": 6}}
                raw = json.dumps(out if fake.status == 200 else {"error": {"message": "occupato"}}).encode()
                self.send_response(fake.status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.httpd.server_address[1]}"

    def close(self):
        self.httpd.shutdown()


IMG = (b"\xff\xd8fake", "image/jpeg")


class ProvidersTest(unittest.TestCase):
    def test_anthropic_alias_schema_effort(self):
        f = Fake("anthropic")
        try:
            s = {"ai": {"provider": "anthropic", "model": "best", "api_key": "k", "base_url": f.url, "effort": "low"}}
            r = PR.ai_json(s, "leggi", IMG, {"type": "object", "properties": {"text": {"type": "string"}}})
            b = f.calls[0]["body"]
            self.assertEqual(f.calls[0]["path"], "/v1/messages")
            self.assertEqual(b["model"], "claude-opus-5-5")                 # alias from ai_models.json
            self.assertEqual(b["output_config"]["effort"], "low")
            self.assertEqual(b["output_config"]["format"]["type"], "json_schema")
            self.assertEqual(b["messages"][0]["content"][0]["type"], "image")
            self.assertEqual(r["result"], ANSWER)
            self.assertEqual(r["usage"], {"in": 11, "out": 7})
            self.assertEqual((r["provider"], r["profile"]), ("anthropic", "predefinito"))
        finally:
            f.close()

    def test_openai_uses_max_completion_tokens_and_json_schema(self):
        f = Fake("openai")
        try:
            s = {"ai": {"provider": "openai", "model": "un-modello", "keys": {"openai": "k"}, "base_url": f.url + "/v1"}}
            r = PR.ai_json(s, "leggi", IMG, {"type": "object", "properties": {"text": {}}})
            b = f.calls[0]["body"]
            self.assertIn("max_completion_tokens", b)
            self.assertNotIn("max_tokens", b)
            self.assertEqual(b["response_format"]["type"], "json_schema")
            self.assertEqual(f.calls[0]["headers"]["Authorization"], "Bearer k")
            self.assertEqual(r["result"], ANSWER)                           # <think> removed
        finally:
            f.close()

    def test_gemini_native_skips_thoughts(self):
        f = Fake("gemini")
        try:
            s = {"ai": {"provider": "gemini", "model": "gem-x", "keys": {"gemini": "gk"}, "base_url": f.url + "/v1beta"}}
            r = PR.ai_json(s, "leggi", IMG)
            c = f.calls[0]
            self.assertEqual(c["path"], "/v1beta/models/gem-x:generateContent")
            self.assertEqual(c["headers"]["X-Goog-Api-Key"], "gk")
            self.assertEqual(c["body"]["generationConfig"]["responseMimeType"], "application/json")
            self.assertEqual(c["body"]["contents"][0]["parts"][1]["inline_data"]["mime_type"], "image/jpeg")
            self.assertEqual(r["result"], ANSWER)
            self.assertEqual(r["model"], "g-test")
        finally:
            f.close()

    def test_vllm_alias_and_extra_body(self):
        f = Fake("chat")
        try:
            s = {"ai": {"provider": "vllm", "model": "inkling-2-mini", "base_url": f.url + "/v1",
                        "extra_body": {"chat_template_kwargs": {"x": 1}}}}
            PR.ai_json(s, "leggi")
            b = f.calls[0]["body"]
            self.assertEqual(b["model"], "thinkingmachines/Inkling-2-Mini")
            self.assertEqual(b["chat_template_kwargs"], {"x": 1})
            self.assertNotIn("Authorization", f.calls[0]["headers"])
        finally:
            f.close()

    def test_missing_keys_and_off(self):
        with self.assertRaises(PR.ProviderError):
            PR.ai_json({"ai": {"provider": "openai", "model": "m"}}, "x")
        with self.assertRaises(PR.ProviderError):
            PR.ai_json({"ai": {}}, "x")
        self.assertFalse(PR.ai_enabled({"ai": {}}))
        self.assertTrue(PR.ai_enabled({"ai": {"provider": "mock"}}))

    def test_clean_answer(self):
        self.assertEqual(AR.clean_answer("<think>a\nb</think> {\"a\":1}"), '{"a":1}')
        self.assertEqual(AR.clean_answer("ragiono…</think>{\"a\":1}"), '{"a":1}')


class ProfilesTest(unittest.TestCase):
    def test_old_settings_are_profile_predefinito(self):
        r = PR.ai_json({"ai": {"provider": "mock"}}, "x")
        self.assertEqual(r["profile"], "predefinito")
        self.assertEqual(r["model"], "mock")

    def test_unknown_profile_falls_back_to_default(self):
        r = PR.ai_json({"ai": {"provider": "mock"}}, "x", profile="ocr")
        self.assertEqual(r["profile"], "predefinito")

    def test_fallback_when_busy(self):
        busy = Fake("chat", status=429)
        try:
            s = {"ai": {"provider": "mock", "default_profile": "locale",
                        "profiles": {"locale": {"provider": "vllm", "model": "m", "base_url": busy.url, "fallback": ["predefinito"]}}}}
            r = PR.ai_json(s, "x")
            self.assertEqual(r["profile"], "predefinito")
            self.assertEqual(r["attempts"][0]["profile"], "locale")
        finally:
            busy.close()

    def test_no_fallback_on_hard_error(self):
        bad = Fake("chat", status=400)
        try:
            s = {"ai": {"provider": "mock", "profiles": {"x": {"provider": "vllm", "model": "m", "base_url": bad.url, "fallback": "predefinito"}}}}
            with self.assertRaises(PR.ProviderError):
                PR.ai_json(s, "x", profile="x")
        finally:
            bad.close()

    def test_fallback_loop_is_cut(self):
        s = {"ai": {"profiles": {"a": {"provider": "mock", "fallback": ["b"]}, "b": {"provider": "mock", "fallback": ["a"]}}}}
        self.assertEqual([p["_name"] for p in AR.chain(s, "a")], ["a", "b"])

    def test_user_alias_wins(self):
        s = {"ai": {"aliases": {"anthropic": {"best": "claude-sonnet-5-5"}}}}
        self.assertEqual(AR.resolve_model("anthropic", "best", s), "claude-sonnet-5-5")
        self.assertEqual(AR.resolve_model("anthropic", "", {}), "claude-haiku-5-5")
        self.assertEqual(AR.resolve_model("openai", "id-vero", {}), "id-vero")

    def test_describe_has_no_secrets(self):
        d = json.dumps(AR.describe({"ai": {"provider": "anthropic", "api_key": "SEGRETO"}}))
        self.assertNotIn("SEGRETO", d)
        self.assertIn('"has_key": true', d)


class SettingsSecretsTest(unittest.TestCase):
    def test_new_secrets_masked_and_kept(self):
        with tempfile.TemporaryDirectory() as td:
            S.save(Path(td), {"ai": {"keys": {"gemini": "G1"}, "profiles": {"q": {"provider": "openai", "api_key": "P1"}}},
                              "workstations": {"pool": [{"name": "w1", "url": "http://x", "token": "T1"}]}})
            pub = S.public(S.load(Path(td)))
            txt = json.dumps(pub)
            for sec in ("G1", "P1", "T1"):
                self.assertNotIn(sec, txt)
            S.save(Path(td), pub)   # the browser sends back the masked values: the real ones stay
            s = S.load(Path(td))
            self.assertEqual(s["ai"]["keys"]["gemini"], "G1")
            self.assertEqual(s["ai"]["profiles"]["q"]["api_key"], "P1")
            self.assertEqual(s["workstations"]["pool"][0]["token"], "T1")
            S.save(Path(td), {"ai": {"profiles": {}}})   # a removed profile really goes away
            self.assertEqual(S.load(Path(td))["ai"]["profiles"], {})


@unittest.skipUnless((WS_DIR / "docmap_workstation").is_dir(), "workstation gateway not in this tree")
class WorkstationPoolTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sys.path.insert(0, str(WS_DIR))
        from docmap_workstation import gateway as G
        cls.G = G
        cls.servers = []

    def gw(self, name, backends, max_waiting=16):
        cfg = self.G.load_config(None)
        cfg.update({"name": name, "port": 0, "tokens": [{"name": "t", "sha256": self.G.hash_token("tok")}],
                    "backends": backends, "max_waiting": max_waiting})
        box, ev = {}, threading.Event()
        threading.Thread(target=self.G.serve, args=(cfg, lambda g, h: (box.update(h=h), ev.set())), daemon=True).start()
        ev.wait(5)
        self.servers.append(box["h"])
        return f"http://127.0.0.1:{box['h'].server_address[1]}"

    def setUp(self):
        WS.reset()

    @classmethod
    def tearDownClass(cls):
        for h in cls.servers:
            h.shutdown()

    def test_route_by_model_and_skip_down(self):
        a = self.gw("ws-a", [{"name": "b", "url": "mock:", "models": {"altro": "x"}}])
        b = self.gw("ws-b", [{"name": "b", "url": "mock:think", "models": {"inkling-2-mini": "t/I"}}])
        s = {"ai": {"provider": "workstation", "model": "ocr"},
             "workstations": {"pool": [{"name": "spento", "url": "http://127.0.0.1:9", "token": "tok"},
                                       {"name": "a", "url": a, "token": "tok"}, {"name": "b", "url": b, "token": "tok"}]}}
        r = PR.ai_json(s, "leggi", IMG)
        self.assertEqual(r["workstation"], "b")           # only b publishes the model (alias ocr → inkling-2-mini)
        self.assertEqual(r["result"]["text"], "TESTO DI PROVA")
        st = {x["name"]: x for x in WS.status(s)}
        self.assertFalse(st["spento"]["ok"])
        self.assertTrue(st["b"]["ok"])

    def test_wrong_token_means_no_workstation(self):
        a = self.gw("ws-c", [{"name": "b", "url": "mock:", "models": {"m": "m"}}])
        s = {"ai": {"provider": "workstation", "model": "m"}, "workstations": {"pool": [{"name": "c", "url": a, "token": "no"}]}}
        with self.assertRaises(PR.ProviderError) as e:
            PR.ai_json(s, "x")
        self.assertIn("nessuna workstation", str(e.exception))

    def test_pin_and_fallback_to_cloud_profile(self):
        a = self.gw("ws-d", [{"name": "b", "url": "mock:", "models": {"m": "m"}}])
        s = {"ai": {"provider": "mock", "default_profile": "ws",
                    "profiles": {"ws": {"provider": "workstation", "model": "m", "workstations": ["altra"], "fallback": ["predefinito"]}}},
             "workstations": {"pool": [{"name": "d", "url": a, "token": "tok"}]}}
        r = PR.ai_json(s, "x")
        self.assertEqual(r["profile"], "predefinito")     # pinned to a workstation that is not in the pool → next profile


if __name__ == "__main__":
    unittest.main()


class ServerAiTest(unittest.TestCase):
    def test_api_ai_describe_and_test(self):
        from tests.test_jobs_server import Srv
        with tempfile.TemporaryDirectory() as td:
            s = Srv(Path(td))
            try:
                st, r = s.call("/api/settings", {"settings": {"ai": {"provider": "mock", "keys": {"gemini": "SEGRETO"},
                                                                     "profiles": {"ocr": {"provider": "mock", "model": "m-ocr"}}}}})
                self.assertEqual(st, 200)
                st, d = s.call("/api/ai")
                self.assertEqual(st, 200)
                self.assertEqual({p["name"] for p in d["profiles"]}, {"predefinito", "ocr"})
                self.assertIn("gemini", [p["id"] for p in d["providers"]])
                self.assertNotIn("SEGRETO", json.dumps(d))
                self.assertEqual(d["workstations"], [])
                st, t = s.call("/api/ai/test", {"profile": "ocr"})
                self.assertEqual((t["ok"], t["profile"], t["model"]), (True, "ocr", "m-ocr"))
                st, t = s.call("/api/ai/test", {"profile": "nessuno"})
                self.assertEqual(t["profile"], "predefinito")
            finally:
                s.close()
