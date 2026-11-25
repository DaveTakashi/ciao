"""AI + OCR base 0.4.0: provider modules, task routing, cascade, consensus, plugins, OCR registry, «ai confronta»."""

import tempfile
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace

from docmap_strumenti import ai as AI
from docmap_strumenti import ai_cli as CLI
from docmap_strumenti import ocr_engines as OE
from docmap_strumenti import providers as PR
from docmap_strumenti.ai import plugins as PL
from docmap_strumenti.blocks import reading as RD

from fixtures import page


def mock(answer, model="m", delay=0.0):
    """A mock profile whose answer is fixed (or an exception), optionally slow (to prove the parallel run)."""
    def r(prompt, image):
        if delay:
            time.sleep(delay)
        return answer
    return {"provider": "mock", "model": model, "mock_response": r}


def settings(profiles: dict, **ai) -> dict:
    return {"ai": {"provider": "", "profiles": profiles, **ai}}


class ProviderModulesTest(unittest.TestCase):
    def test_every_family_is_a_module(self):
        ids = set(AI.PROVIDERS)
        for want in ("anthropic", "openai", "gemini", "openai_compatible", "mistral", "openrouter", "vllm", "ollama",
                     "lmstudio", "llamacpp", "workstation", "mock"):
            self.assertIn(want, ids)
        d = {p["id"]: p for p in AI.describe({})["providers"]}
        self.assertIn("api.mistral.ai", AI.PROVIDERS["mistral"].default_base)
        self.assertIn("openrouter.ai", AI.PROVIDERS["openrouter"].default_base)
        self.assertIn("1234", AI.PROVIDERS["lmstudio"].default_base)
        self.assertIn("8080", AI.PROVIDERS["llamacpp"].default_base)
        self.assertFalse(d["ollama"]["cloud"])
        self.assertTrue(d["anthropic"]["cloud"])

    def test_old_module_still_works(self):
        from docmap_strumenti import ai_registry as AR
        self.assertIs(AR.ADAPTERS, AI.PROVIDERS)
        self.assertTrue(callable(AR.call))

    def test_vision_check_skips_to_fallback(self):
        s = settings({"cieco": {"provider": "mock", "model": "cieco", "fallback": ["vista"]},
                      "vista": mock({"text": "ok", "confidence": 0.9}, "vede")},
                     models={"mock": {"cieco": {"vision": False}}})
        r = AI.call(s, "leggi", (b"x", "image/png"), None, "cieco")
        self.assertEqual(r["profile"], "vista")
        self.assertIn("immagini", r["attempts"][0]["error"])


class TaskRoutingTest(unittest.TestCase):
    def test_tasks_map_then_profile_named_like_task_then_default(self):
        s = settings({"veloce": mock({"text": "v"}), "ocr": mock({"text": "o"}), "base": mock({"text": "b"})},
                     tasks={"extract": "veloce"}, default_profile="base")
        self.assertEqual(AI.call(s, "x", task="extract")["profile"], "veloce")
        self.assertEqual(AI.call(s, "x", task="ocr")["profile"], "ocr")
        self.assertEqual(AI.call(s, "x", task="classify")["profile"], "base")
        self.assertEqual(AI.call(s, "x", None, None, "ocr", task="extract")["profile"], "ocr")   # the step wins

    def test_ocr_ai_uses_ocr_profile(self):
        s = settings({"lettura": mock({"text": "ROSSI", "confidence": 0.8}, "vlm")})
        s["ocr"] = {"ai_profile": "lettura"}
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "a.png"
            page(["ROSSI"], (300, 200)).save(f)
            r = PR.ocr_ai(f, 1, s)
        self.assertEqual((r["text"], r["profile"], r["by"]), ("ROSSI", "lettura", "ai:vlm"))


class CascadeTest(unittest.TestCase):
    def base(self, first_conf):
        return settings({"locale": mock({"text": "rossi", "confidence": first_conf}, "piccolo"),
                         "qualita": mock({"text": "ROSSI SRL", "confidence": 0.95}, "grande"),
                         "cascata": {"strategy": "cascade", "steps": ["locale", "qualita"], "min_conf": 0.8}})

    def test_stops_when_sure(self):
        r = AI.call(self.base(0.9), "x", None, None, "cascata")
        self.assertEqual(r["model"], "piccolo")
        self.assertEqual(len(r["steps"]), 1)

    def test_escalates_when_unsure_and_keeps_best(self):
        r = AI.call(self.base(0.4), "x", None, None, "cascata")
        self.assertEqual(r["model"], "grande")
        self.assertEqual([x["model"] for x in r["steps"]], ["piccolo", "grande"])
        self.assertEqual(r["profile"], "cascata")

    def test_step_that_fails_is_skipped(self):
        s = self.base(0.4)
        s["ai"]["profiles"]["locale"] = mock(AI.AIError("spenta", retry=True))
        r = AI.call(s, "x", None, None, "cascata")
        self.assertEqual(r["model"], "grande")
        self.assertTrue(r["attempts"])


class ConsensusTest(unittest.TestCase):
    def test_agreement_raises_confidence_disagreement_lowers_it(self):
        s = settings({"a": mock({"text": "ROSSI SRL", "client": "Rossi", "confidence": 0.7}, "a", 0.3),
                      "b": mock({"text": "Rossi Srl", "client": "Rossi", "confidence": 0.6}, "b", 0.3),
                      "c": mock({"text": "ROSSI SRL", "client": "Bianchi", "confidence": 0.9}, "c", 0.3),
                      "tre": {"strategy": "consensus", "members": ["a", "b", "c"], "min_agree": 2}})
        t0 = time.monotonic()
        r = AI.call(s, "x", None, None, "tre")
        self.assertLess(time.monotonic() - t0, 0.8)            # members run in parallel (3 × 0.3 s)
        res = r["result"]
        self.assertEqual(res["client"], "Rossi")               # 2 of 3
        self.assertEqual(res["_consensus"]["client"]["agree"], 2)
        self.assertEqual(res["_consensus"]["text"]["agree"], 3)   # case and spaces do not count
        self.assertEqual(len(r["members"]), 3)
        self.assertEqual(r["provider"], "consensus")

    def test_one_voice_is_never_sure(self):
        s = settings({"a": mock({"text": "X", "confidence": 0.99}),
                      "b": mock(AI.AIError("giù", retry=True)),
                      "due": {"strategy": "consensus", "members": ["a", "b"]}})
        r = AI.call(s, "x", None, None, "due")
        self.assertLessEqual(r["result"]["confidence"], 0.49)
        self.assertTrue(r["result"]["_consensus_partial"])

    def test_merge_years(self):
        m = AI.merge([{"year_from": 2019, "year_to": 2020, "confidence": 0.8},
                      {"year_from": 2019, "year_to": 2021, "confidence": 0.8}], 2)
        self.assertEqual(m["year_from"], 2019)
        self.assertEqual(m["_consensus"]["year_from"]["agree"], 2)


PLUGIN_OK = '''
from docmap_strumenti.ai import Provider, register_provider
from docmap_strumenti.ocr_engines import OcrEngine, register_ocr

@register_provider
class Eco(Provider):
    id, label, family = "eco_test", "Eco", "prove"
    def call(self, p, settings, req):
        return {"model": "eco", "result": {"text": req.prompt[:5], "confidence": 1}, "usage": {}}

@register_ocr
class Fisso(OcrEngine):
    id, label = "fisso_test", "Fisso"
    def read(self, path, page, settings, opts):
        return {"text": "letto", "conf": 0.7, "by": "fisso_test"}
'''


class PluginTest(unittest.TestCase):
    def test_good_and_broken_plugin(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "buono.py").write_text(PLUGIN_OK, "utf-8")
            (Path(d) / "rotto.py").write_text("import modulo_che_non_esiste\n", "utf-8")
            rows = {r["name"]: r for r in PL.load({"ai": {"plugins_dir": d}})}
        try:
            self.assertTrue(rows["buono"]["ok"])
            self.assertFalse(rows["rotto"]["ok"])
            self.assertIn("ModuleNotFoundError", rows["rotto"]["error"])
            s = settings({"eco": {"provider": "eco_test"}})
            self.assertEqual(AI.call(s, "ciao mondo", None, None, "eco")["result"]["text"], "ciao ")
            self.assertIn("fisso_test", OE.ENGINE_CHOICES)
            self.assertIn("fisso_test", RD.ENGINES)              # the OCR block offers it
        finally:
            AI.PROVIDERS.pop("eco_test", None)
            OE.ENGINES.pop("fisso_test", None)
            if "fisso_test" in OE.ENGINE_CHOICES:
                OE.ENGINE_CHOICES.remove("fisso_test")


class ExamplePluginsTest(unittest.TestCase):
    def test_examples_load(self):
        d = Path(__file__).resolve().parents[1] / "esempi-plugin"
        rows = PL.load({"ai": {"plugins_dir": str(d)}})
        try:
            self.assertEqual({r["name"]: r["ok"] for r in rows}, {"esempio_easyocr": True, "esempio_fornitore": True},
                             [r["error"] for r in rows])
            self.assertEqual(AI.PROVIDERS["mio_servizio"].default_base, "https://api.example.invalid/v1")
            self.assertIn("easyocr", OE.ENGINES)
        finally:
            for k in ("mio_servizio", "esempio_http"):
                AI.PROVIDERS.pop(k, None)
            OE.ENGINES.pop("easyocr", None)
            if "easyocr" in OE.ENGINE_CHOICES:
                OE.ENGINE_CHOICES.remove("easyocr")
            PL.load({"ai": {"plugins_dir": ""}})


class _Fake(OE.OcrEngine):
    def __init__(self, id, conf, fail=False):
        self.id, self.label, self.conf, self.fail, self.calls = id, id, conf, fail, 0
        self.meters = ()

    def read(self, path, page, settings, opts):
        self.calls += 1
        if self.fail:
            raise PR.ProviderError(self.id + " rotto")
        return {"text": self.id, "conf": self.conf, "by": self.id}


class OcrRegistryTest(unittest.TestCase):
    def setUp(self):
        self.lock = threading.Lock()
        self.engines = {"f1": _Fake("f1", 0.5), "f2": _Fake("f2", 0.9), "f3": _Fake("f3", 0.6)}
        for e in self.engines.values():
            OE.ENGINES[e.id] = e

    def tearDown(self):
        for k in self.engines:
            OE.ENGINES.pop(k, None)

    def read(self, ocr):
        it = SimpleNamespace(p=Path("x.png"), kind="image", src="x.png", page=1)
        ctx = SimpleNamespace(settings={"ocr": ocr}, meter=lambda m: None, input_dir=None)
        return RD.page_text(it, 1, ctx, "auto")

    def test_auto_keeps_first_available(self):
        t, info = self.read({"auto_order": ["f1", "f2"]})
        self.assertEqual(t, "f1")
        self.assertEqual(self.engines["f2"].calls, 0)

    def test_escalate_below_goes_on_and_keeps_best(self):
        t, info = self.read({"auto_order": ["f1", "f2", "f3"], "escalate_below": 0.8})
        self.assertEqual(t, "f2")                           # 0.9 ≥ 0.8: stops there
        self.assertEqual(self.engines["f3"].calls, 0)

    def test_broken_engine_is_skipped(self):
        self.engines["f1"].fail = True
        t, info = self.read({"auto_order": ["f1", "f3"]})
        self.assertEqual(t, "f3")
        self.assertIn("f1 rotto", info["tried"][0])

    def test_order_and_describe(self):
        self.assertEqual(OE.order({}), OE.AUTO_ORDER)
        self.assertEqual(OE.order({"ocr": {"auto_order": ["nessuno", "tesseract"]}}), ["tesseract"])
        ids = {e["id"] for e in OE.describe({})["engines"]}
        self.assertTrue({"text", "tesseract", "paddleocr", "remote", "ai"} <= ids)
        with self.assertRaises(ValueError):
            OE.register_ocr(_Fake("auto", 1))


class CompareTest(unittest.TestCase):
    def test_compare_readers_with_truth(self):
        s = settings({"buono": mock({"text": "FATTURA ROSSI", "confidence": 0.9}, "b"),
                      "scarso": mock({"text": "FATURA R0SSI", "confidence": 0.5}, "s")})
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            for n in ("a", "b"):
                page(["FATTURA ROSSI"], (400, 200)).save(d / f"{n}.png")
            (d / "a.vero.txt").write_text("Fattura Rossi", "utf-8")
            out = d / "r.csv"
            res = CLI.compare(s, d, ["ai:buono", "ai:scarso", "ocr:inesistente"], out)
            self.assertEqual(res["files"], 2)
            sm = res["summary"]
            self.assertEqual(sm["ai:buono"]["truth_sim_mean"], 1.0)
            self.assertLess(sm["ai:scarso"]["truth_sim_mean"], 1.0)
            self.assertEqual(sm["ocr:inesistente"]["ok"], 0)
            self.assertIn("ai:buono = ai:scarso", res["agreement"])
            self.assertIn("somiglianza_al_vero", out.read_text("utf-8-sig").splitlines()[0])


if __name__ == "__main__":
    unittest.main()
