"""v12.8: the Claude request built by ai_anthropic() and the parsing of its answer (no network: urlopen is replaced).
    python3 -m unittest discover -s tests"""
import io
import json
import os
import sys
import unittest
import urllib.error
import urllib.request
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from docmap_server import api  # noqa: E402


class FakeResp(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class Ctx:
    def __init__(self, **c):
        self.c = dict({"ai_api_key": "sk-test", "ai_model": "claude-opus-5-5", "ai_effort": "low", "ai_timeout": 30}, **c)


class AiAnthropicTest(unittest.TestCase):
    def call(self, answer, status=200, **cfg):
        seen = {}

        def fake(req, timeout=None):
            seen["url"], seen["headers"], seen["body"], seen["timeout"] = req.full_url, dict(req.header_items()), json.loads(req.data), timeout
            if status != 200:
                raise urllib.error.HTTPError(req.full_url, status, "err", {}, io.BytesIO(json.dumps(answer).encode()))
            return FakeResp(json.dumps(answer).encode())
        hints = api.ai_hints({"tags": {0: "Fatture", 1: "Bilanci"}, "year_from": 2015, "year_to": 2022, "client": "Rossi"})
        with mock.patch.object(urllib.request, "urlopen", fake):
            out = api.ai_anthropic(Ctx(**cfg), {"raw": b"\xff\xd8jpeg", "mime": "image/jpeg"}, "fatture 2019", hints)
        return out, seen, hints

    def test_request_shape(self):
        ans = {"model": "claude-opus-5-5", "stop_reason": "end_turn", "content": [{"type": "thinking", "thinking": ""},
               {"type": "text", "text": json.dumps({"company": "Rossi", "title": "Fatture", "year_from": 2019, "year_to": 0, "doc_type": "fatture",
                                                     "tags": ["fatture", "Altro"], "notes": "", "text": "ROSSI FATTURE 2019", "confidence": 0.876, "empty_spine": False})}]}
        out, seen, hints = self.call(ans)
        self.assertEqual(seen["url"], "https://api.anthropic.com/v1/messages")
        h = {k.lower(): v for k, v in seen["headers"].items()}
        self.assertEqual(h["anthropic-version"], "2026-10-21")
        self.assertEqual(h["x-api-key"], "sk-test")
        self.assertEqual(h["anthropic-beta"], "server-side-fallback-2026-07-01")
        b = seen["body"]
        self.assertEqual(b["model"], "claude-opus-5-5")
        self.assertEqual(b["fallbacks"], "default")
        self.assertEqual(b["output_config"]["effort"], "low")
        self.assertEqual(b["output_config"]["format"]["type"], "json_schema")
        self.assertNotIn("thinking", b)   # Opus 5.5: thinking cannot be disabled, effort is the control
        self.assertNotIn("temperature", b)
        c = b["messages"][0]["content"]
        self.assertEqual(c[0]["type"], "image")
        self.assertEqual(c[0]["source"]["media_type"], "image/jpeg")
        self.assertIn("Fatture, Bilanci", c[1]["text"])
        self.assertIn("fatture 2019", c[1]["text"])
        r = api.ai_norm(out["result"], hints)
        self.assertEqual((r["year_from"], r["year_to"]), (2019, 2019))
        self.assertEqual(r["tags"], ["Fatture"])   # only tags offered in the hints
        self.assertEqual(r["confidence"], 0.88)

    def test_haiku_has_no_fallback(self):
        ans = {"model": "claude-haiku-5-5", "content": [{"type": "text", "text": "{}"}]}
        out, seen, _ = self.call(ans, ai_model="claude-haiku-5-5")
        self.assertNotIn("fallbacks", seen["body"])
        self.assertNotIn("anthropic-beta", {k.lower() for k in seen["headers"]})
        self.assertEqual(out["model"], "claude-haiku-5-5")

    def test_refusal_and_errors(self):
        with self.assertRaises(api.ApiError) as e:
            self.call({"stop_reason": "refusal", "content": []})
        self.assertEqual(e.exception.code_name, "ai_refused")
        with self.assertRaises(api.ApiError) as e:
            self.call({"type": "error", "error": {"message": "invalid x-api-key"}}, status=401)
        self.assertEqual((e.exception.status, e.exception.code_name), (502, "ai_error"))
        self.assertIn("invalid x-api-key", e.exception.message)
        with self.assertRaises(api.ApiError) as e:
            self.call({"content": [{"type": "text", "text": "not json"}]})
        self.assertEqual(e.exception.code_name, "ai_error")
        with self.assertRaises(api.ApiError) as e:
            api.ai_anthropic(Ctx(ai_api_key=""), None, "x", api.ai_hints({}))
        self.assertEqual(e.exception.code_name, "ai_off")


if __name__ == "__main__":
    unittest.main()
