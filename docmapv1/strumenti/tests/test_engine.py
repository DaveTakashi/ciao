import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from docmap_strumenti import recipe as RC  # noqa: E402
from docmap_strumenti import registry as R  # noqa: E402
from docmap_strumenti.engine import Context, Engine, list_inputs, preview  # noqa: E402
from docmap_strumenti.items import Item, TemplateError, render, safe_part  # noqa: E402


class TemplateTest(unittest.TestCase):
    def test_variables_and_filters(self):
        v = {"numero": "12/2024", "cliente": "Rossi & Figli", "page": 3, "src_dir": "a/b"}
        self.assertEqual(render("{numero}", v), "12_2024")            # a value is ONE name: «/» never makes folders
        self.assertEqual(render("{src_dir}/{page:03}", v), "a/b/003")  # src_dir keeps its sub-folders
        self.assertEqual(render("{cliente|slug}", v), "rossi-figli")
        self.assertEqual(render("{cliente|upper|first:5}", v), "ROSSI")
        self.assertEqual(render("{x|default:SENZA}", v), "SENZA")
        self.assertEqual(render("{numero|digits}", v), "122024")
        with self.assertRaises(TemplateError):
            render("{manca}", v)

    def test_safe_part(self):
        self.assertEqual(safe_part('a:b*c?"d'), "a_b_c__d")
        self.assertEqual(safe_part("CON"), "_CON")
        self.assertEqual(safe_part("  .. "), "_")


class RecipeTest(unittest.TestCase):
    def test_validate_errors_are_clear(self):
        with self.assertRaisesRegex(RC.RecipeError, "nome"):
            RC.validate({"steps": [{"block": "ocr"}]})
        with self.assertRaisesRegex(RC.RecipeError, "passi"):
            RC.validate({"name": "x x", "steps": []})
        with self.assertRaisesRegex(R.ParamError, "sconosciuto"):
            RC.validate({"name": "aa", "steps": [{"block": "nessuno"}]})
        with self.assertRaisesRegex(RC.RecipeError, "parametro sconosciuto"):
            RC.validate({"name": "aa", "steps": [{"block": "ocr", "with": {"motore": "x"}}]})
        with self.assertRaisesRegex(RC.RecipeError, "non è tra"):
            RC.validate({"name": "aa", "steps": [{"block": "ocr", "with": {"engine": "magia"}}]})
        with self.assertRaisesRegex(RC.RecipeError, "regolare"):
            RC.validate({"name": "aa", "steps": [{"block": "extract", "with": {"field": "n", "pattern": "(("}}]})
        with self.assertRaisesRegex(RC.RecipeError, "condizione"):
            RC.validate({"name": "aa", "steps": [{"block": "ocr", "when": "boh boh"}]})

    def test_store_versions(self):
        with tempfile.TemporaryDirectory() as td:
            st = RC.Store(Path(td))
            r1 = st.save({"name": "Prova ricetta", "steps": [{"block": "ocr"}]})
            self.assertEqual((r1["id"], r1["version"]), ("prova-ricetta", 1))
            self.assertEqual(st.save(r1)["version"], 1)                 # nothing changed: no new version
            r2 = st.save(dict(r1, description="nuova"))
            self.assertEqual(r2["version"], 2)
            self.assertEqual(st.get("prova-ricetta", 1)["description"], "")
            self.assertEqual(st.list()[0]["versions"], [1, 2])
            st.archive("prova-ricetta")
            self.assertEqual(st.list(), [])
            self.assertTrue(any(p.name.startswith("_archiviata-") for p in (Path(td) / "ricette").iterdir()))

    def test_templates_all_valid(self):
        ts = RC.templates()
        self.assertGreaterEqual(len(ts), 10)
        for t in ts:
            self.assertTrue(t["description"], t["id"])

    def test_conditions(self):
        it = Item(id="1", path="/x/a.pdf", src="a.pdf", pages=3, text="Fattura n. 12", cls="fattura")
        it.set_field("numero", "12", 0.7)
        for expr, want in [("pages > 1", True), ("cls == fattura", True), ("numero != ''", True), ("numero is empty", False),
                           ("text ~ (?i)fattura", True), ("conf.numero < 0.8", True), ("ext in pdf,tif", True),
                           ("cls == nota or pages >= 3", True), ("cls == nota and pages >= 3", False)]:
            self.assertEqual(RC.matches(it, expr), want, expr)


class EngineTest(unittest.TestCase):
    def test_catalogue(self):
        names = {b["name"] for b in R.catalog()}
        self.assertGreaterEqual(len(names), 20)
        for b in R.catalog():
            self.assertTrue(b["help"] and b["label"], b["name"])
            for p in b["params"]:
                self.assertIn(p["type"], R.TYPES, (b["name"], p["name"]))

    def test_inputs_natural_order_and_skips(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            for n in ("f10.pdf", "f2.pdf", "F1.PDF", "x.txt", ".nascosto.pdf", "Thumbs.db"):
                (d / n).write_text("x")
            (d / "sub").mkdir()
            (d / "sub" / "f3.pdf").write_text("x")
            got = [p.relative_to(d).as_posix() for p in list_inputs(d, ["*.pdf"])]
            self.assertEqual(got, ["F1.PDF", "f2.pdf", "f10.pdf", "sub/f3.pdf"])
            self.assertEqual(len(list_inputs(d, ["*.pdf"], recursive=False)), 3)

    def test_one_bad_file_does_not_stop_the_others_and_when(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            (d / "in").mkdir()
            (d / "in" / "a.txt").write_text("Fattura n. 5")
            (d / "in" / "b.txt").write_text("niente")
            (d / "in" / "rotto.pdf").write_bytes(b"non un pdf")
            rec = {"name": "mix", "steps": [
                {"block": "ocr", "with": {"engine": "text"}},
                {"block": "extract", "with": {"field": "n", "pattern": r"n\.\s*(\d+)"}},
                {"block": "set", "with": {"field": "tipo", "value": "fattura"}, "when": "n != ''"},
                {"block": "route", "with": {"to": "{tipo|default:altro}/{file}"}}]}
            ctx = Context(d / "job", d / "in", d / "out", {})
            e = Engine(rec, ctx)
            res = e.run(e.collect())
            by = {Path(i["src"]).name: i for i in res["items"]}
            self.assertEqual(by["rotto.pdf"]["status"], "error")
            self.assertEqual(by["a.txt"]["fields"]["tipo"]["v"], "fattura")
            self.assertNotIn("tipo", by["b.txt"]["fields"])
            self.assertTrue((d / "out" / "fattura" / "a.txt").is_file())
            self.assertTrue((d / "out" / "_da_verificare" / "b.txt").is_file())   # «n» not found → review folder

    def test_preview_has_a_snapshot_per_step_and_touches_nothing(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            f = d / "a.txt"
            f.write_text("Totale 1.234,56 EUR del 3 marzo 2024")
            rec = {"name": "pv", "steps": [{"block": "ocr", "with": {"engine": "text"}},
                                            {"block": "extract", "with": {"field": "totale", "method": "amount"}},
                                            {"block": "extract", "with": {"field": "data", "method": "date"}},
                                            {"block": "route", "with": {"to": "{data}/{file}", "mode": "move"}}]}
            res = preview(rec, f, {}, d / "w")
            self.assertEqual(len(res["steps"]), 4)
            it = res["items"][0]
            self.assertEqual(it["fields"]["totale"]["v"], "1234.56")
            self.assertEqual(it["fields"]["data"]["v"], "2024-03-03")
            self.assertEqual(res["outputs"], ["2024-03-03/a.txt"])
            self.assertTrue(f.is_file())          # «move» never moves in a preview
            res2 = preview(rec, f, {}, d / "w2", upto=1)
            self.assertEqual(len(res2["steps"]), 1)


if __name__ == "__main__":
    unittest.main()
