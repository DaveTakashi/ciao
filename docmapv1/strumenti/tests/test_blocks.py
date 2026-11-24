import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import fixtures as F  # noqa: E402
from PIL import Image  # noqa: E402

from docmap_strumenti import media as M  # noqa: E402
from docmap_strumenti import providers as PR  # noqa: E402
from docmap_strumenti import validators as V  # noqa: E402
from docmap_strumenti.blocks.convert import deskew_angle  # noqa: E402
from docmap_strumenti.blocks.pages import parse_ranges  # noqa: E402
from docmap_strumenti.engine import Context, Engine  # noqa: E402

HAS_TESS = bool(PR.tesseract_cmd({}))


def run(rec, d: Path, settings=None, files=None):
    ctx = Context(d / "job", d / "in", d / "out", settings or {})
    e = Engine(dict({"name": "prova blocchi"}, **rec), ctx)
    res = e.run(e.collect(files))
    return res, {Path(i["path"]).name: i for i in res["items"]}


class Base(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.mkdtemp()
        self.d = Path(self.td)
        (self.d / "in").mkdir()

    def tearDown(self):
        shutil.rmtree(self.td, ignore_errors=True)

    def outs(self):
        return sorted(p.relative_to(self.d / "out").as_posix() for p in (self.d / "out").rglob("*") if p.is_file()) \
            if (self.d / "out").is_dir() else []


class PagesTest(Base):
    def test_ranges(self):
        self.assertEqual(parse_ranges("all", 4), [1, 2, 3, 4])
        self.assertEqual(parse_ranges("1-2,4", 5), [1, 2, 4])
        self.assertEqual(parse_ranges("-2", 5), [4, 5])
        self.assertEqual(parse_ranges("3-", 5), [3, 4, 5])
        self.assertEqual(parse_ranges("even", 5), [2, 4])

    def test_split_pdf_and_tiff(self):
        F.save_pdf(self.d / "in" / "doc.pdf", [F.page([f"Pagina {i}"]) for i in range(1, 4)])
        F.save_tiff(self.d / "in" / "scan.tif", [F.page([f"Foglio {i}"]) for i in range(1, 3)])
        res, _ = run({"steps": [{"block": "split_pages"}, {"block": "route", "with": {"to": "{src_name}/{file}"}}]}, self.d)
        self.assertEqual(self.outs(), ["doc/doc_p001.pdf", "doc/doc_p002.pdf", "doc/doc_p003.pdf",
                                       "scan/scan_p001.tif", "scan/scan_p002.tif"])
        self.assertEqual(M.page_count(self.d / "out" / "doc" / "doc_p002.pdf"), 1)
        self.assertEqual(res["meters"]["page"], 5)

    def test_split_pdf_to_png_needs_rendering(self):
        F.save_pdf(self.d / "in" / "doc.pdf", [F.page(["A"]), F.page(["B"])])
        run({"steps": [{"block": "split_pages", "with": {"format": "png", "dpi": 100}},
                       {"block": "route", "with": {"to": "{file}"}}]}, self.d)
        self.assertEqual(self.outs(), ["doc_p001.png", "doc_p002.png"])
        with Image.open(self.d / "out" / "doc_p001.png") as im:
            self.assertGreater(im.size[0], 500)

    def test_segment_by_blank_pages_and_every(self):
        txt = lambda t: F.page([t, "Seconda riga del documento", "Terza riga con altre parole", "Quarta riga"])  # noqa: E731
        pages = [txt("Doc 1 a"), txt("Doc 1 b"), F.blank(), txt("Doc 2"), F.blank(), txt("Doc 3 a"), txt("Doc 3 b")]
        F.save_tiff(self.d / "in" / "lotto.tif", pages)
        res, by = run({"steps": [{"block": "segment", "with": {"by": "blank"}}]}, self.d)
        self.assertEqual([i["pages"] for i in res["items"]], [2, 1, 2])
        self.assertEqual(sorted(by), ["lotto_doc001.tif", "lotto_doc002.tif", "lotto_doc003.tif"])
        shutil.rmtree(self.d / "job", ignore_errors=True)
        res, _ = run({"steps": [{"block": "segment", "with": {"by": "every", "every": 3}}]}, self.d)
        self.assertEqual([i["pages"] for i in res["items"]], [3, 3, 1])

    def test_segment_by_value_change_with_text_layer(self):
        F.text_pdf(self.d / "in" / "fatture.pdf", [["Fattura n. 101", "riga"], ["segue fattura 101"], ["Fattura n. 102"],
                                                    ["Fattura n. 103"], ["allegato"]])
        res, by = run({"steps": [{"block": "segment", "with": {"by": "value_change", "pattern": r"Fattura n\. (\d+)",
                                                               "field": "numero", "engine": "text"}},
                                 {"block": "route", "with": {"to": "fattura_{numero}.pdf"}}]}, self.d)
        self.assertEqual([(i["fields"]["numero"]["v"], i["pages"]) for i in res["items"]], [("101", 2), ("102", 1), ("103", 2)])
        self.assertEqual(self.outs(), ["fattura_101.pdf", "fattura_102.pdf", "fattura_103.pdf"])
        self.assertEqual(M.page_count(self.d / "out" / "fattura_103.pdf"), 2)

    def test_merge_by_field(self):
        for n, (num, pg) in enumerate([("7", 1), ("8", 1), ("7", 2)]):
            F.text_pdf(self.d / "in" / f"p{n}.pdf", [[f"Pratica {num} pagina {pg}"]])
        res, by = run({"steps": [{"block": "ocr", "with": {"engine": "text"}},
                                 {"block": "extract", "with": {"field": "pratica", "method": "regex", "pattern": r"Pratica (\d+)"}},
                                 {"block": "merge", "with": {"key": "{pratica}", "name": "pratica_{key}"}},
                                 {"block": "route", "with": {"to": "{file}"}}]}, self.d)
        self.assertEqual(self.outs(), ["pratica_7.pdf", "pratica_8.pdf"])
        self.assertEqual(M.page_count(self.d / "out" / "pratica_7.pdf"), 2)


class ConvertTest(Base):
    def test_images_to_pdf_and_tiff_g4(self):
        F.page(["Uno"]).convert("RGB").save(self.d / "in" / "a.jpg", "JPEG")
        F.save_tiff(self.d / "in" / "b.tif", [F.page(["Due"]), F.page(["Tre"])])
        run({"steps": [{"block": "convert", "with": {"to": "pdf"}}, {"block": "route", "with": {"to": "{name}.pdf"}}]}, self.d)
        self.assertEqual(self.outs(), ["a.pdf", "b.pdf"])
        self.assertEqual(M.page_count(self.d / "out" / "b.pdf"), 2)
        shutil.rmtree(self.d / "out")
        shutil.rmtree(self.d / "job", ignore_errors=True)
        run({"steps": [{"block": "image", "with": {"bw": True, "deskew": False, "to": "tiff"}},
                       {"block": "route", "with": {"to": "{name}.tif"}}]}, self.d)
        with Image.open(self.d / "out" / "b.tif") as im:
            self.assertEqual((im.mode, getattr(im, "n_frames", 1), im.info.get("compression")), ("1", 2, "group4"))

    def test_pdf_to_multipage_tiff_and_pages_as_jpeg(self):
        F.save_pdf(self.d / "in" / "d.pdf", [F.page(["A"]), F.page(["B"]), F.page(["C"])])
        res, by = run({"steps": [{"block": "convert", "with": {"to": "tiff", "dpi": 100}}]}, self.d)
        f = next(iter(by.values()))
        with Image.open(f["path"]) as im:
            self.assertEqual(getattr(im, "n_frames", 1), 3)
        shutil.rmtree(self.d / "job", ignore_errors=True)
        res, by = run({"steps": [{"block": "convert", "with": {"to": "jpeg", "dpi": 80}}]}, self.d)
        self.assertEqual(sorted(by), ["d_p001.jpg", "d_p002.jpg", "d_p003.jpg"])

    def test_tables_and_text(self):
        (self.d / "in" / "t.csv").write_text("codice;nome\n1;=SOMMA(A1)\n2;Bianchi\n", "utf-8")
        (self.d / "in" / "n.txt").write_text("riga uno\nriga due", "utf-8")
        run({"steps": [{"block": "convert", "with": {"to": "xlsx"}, "when": "ext == csv"},
                       {"block": "convert", "with": {"to": "md"}, "when": "ext == txt"},
                       {"block": "route", "with": {"to": "{file}"}}]}, self.d)
        self.assertEqual(self.outs(), ["n.md", "t.xlsx"])
        rows = M.read_table(self.d / "out" / "t.xlsx")
        self.assertEqual(rows[0], ["codice", "nome"])
        self.assertEqual(rows[1][1], "'=SOMMA(A1)")           # a formula from data is never executed by Excel
        self.assertIn("# n", (self.d / "out" / "n.md").read_text("utf-8"))
        M.write_table([["a", "b"], [1, "x|y"]], self.d / "t.md", "md")
        self.assertIn("x\\|y", (self.d / "t.md").read_text("utf-8"))
        M.write_table([["a", "b"], [1, "x"]], self.d / "t.json", "json")
        self.assertEqual(json.loads((self.d / "t.json").read_text())[0], {"a": 1, "b": "x"})

    def test_deskew(self):
        img = F.page(["Riga di testo abbastanza lunga per il raddrizzamento"] * 8, angle=3)
        self.assertAlmostEqual(deskew_angle(img), -3, delta=0.6)


class ReadAndDataTest(Base):
    def test_mock_ocr_sidecar_and_extract_methods(self):
        F.page(["x"]).save(self.d / "in" / "f1.png")
        (self.d / "in" / "f1.png.txt").write_text(
            "FATTURA N. 2024/77\nData: 5 febbraio 2024\nP.IVA IT01234567897 CF RSSMRA85T10A562S\n"
            "IBAN IT60X0542811101000000123456\nTotale € 1.250,00\nCliente: ACME Spa\nFine", "utf-8")
        steps = [{"block": "ocr", "with": {"engine": "mock"}},
                 {"block": "extract", "with": {"field": "numero", "pattern": r"FATTURA N\. ?([\d/]+)"}},
                 {"block": "extract", "with": {"field": "data", "method": "date"}},
                 {"block": "extract", "with": {"field": "piva", "method": "piva"}},
                 {"block": "extract", "with": {"field": "cf", "method": "cf"}},
                 {"block": "extract", "with": {"field": "iban", "method": "iban"}},
                 {"block": "extract", "with": {"field": "totale", "method": "amount"}},
                 {"block": "extract", "with": {"field": "cliente", "method": "after", "start": "Cliente"}},
                 {"block": "extract", "with": {"field": "cl2", "method": "between", "start": "Cliente:", "end": "Fine"}},
                 {"block": "extract", "with": {"field": "nome", "method": "filename", "pattern": r"f(\d)"}}]
        res, by = run({"input": {"patterns": ["*.png"]}, "steps": steps}, self.d)
        f = by["f1.png"]["fields"]
        self.assertEqual({k: v["v"] for k, v in f.items()},
                         {"numero": "2024/77", "data": "2024-02-05", "piva": "01234567897", "cf": "RSSMRA85T10A562S",
                          "iban": "IT60X0542811101000000123456", "totale": "1250.00", "cliente": "ACME", "cl2": "ACME Spa",
                          "nome": "1"})
        self.assertEqual(by["f1.png"]["status"], "ok")

    def test_validators(self):
        self.assertTrue(V.piva_ok("01234567897"))
        self.assertFalse(V.piva_ok("01234567890"))
        self.assertTrue(V.cf_ok("RSSMRA85T10A562S"))
        self.assertFalse(V.cf_ok("RSSMRA85T10A562X"))
        self.assertTrue(V.iban_ok("IT60 X054 2811 1010 0000 0123 456"))
        self.assertFalse(V.iban_ok("IT61X0542811101000000123456"))
        self.assertEqual(V.parse_date("il 12/03/24 e il 2024-03-12"), ["2024-03-12"])
        self.assertEqual(V.parse_amount("1.234,56"), 1234.56)
        self.assertEqual(V.parse_amount("1,234.56"), 1234.56)
        self.assertEqual(V.amounts("anno 2024, 3 copie, totale 12,50 €"), [12.5])
        self.assertEqual(V.validate("range:1-100", "50")[0], True)
        self.assertEqual(V.validate("in:a,b", "C")[0], False)

    def test_search_with_ocr_errors_and_classify(self):
        (self.d / "in" / "a.txt").write_text("Contratto di locazione, scadenza 2030. Fatlura allegata", "utf-8")
        (self.d / "in" / "b.txt").write_text("Nota di credito n. 4 relativa alla fattura 3", "utf-8")
        (self.d / "in" / "c.txt").write_text("Lettera generica", "utf-8")
        res, by = run({"steps": [
            {"block": "ocr", "with": {"engine": "text"}},
            {"block": "search", "with": {"keywords": ["fattura", "città"], "fuzzy": 0.8, "add_tags": True}},
            {"block": "classify", "with": {"classes": "fattura: fattura\nnota_di_credito: nota di credito\ncontratto: contratto, locazione",
                                           "review_below": 0.5}}]}, self.d)
        self.assertEqual(by["a.txt"]["fields"]["trovate"]["v"], "fattura")          # «Fatlura» found with tolerance
        self.assertEqual(by["a.txt"]["cls"], "contratto")
        self.assertEqual(by["b.txt"]["cls"], "nota_di_credito")
        self.assertEqual(by["c.txt"]["cls"], "altro")
        self.assertEqual(by["c.txt"]["status"], "review")

    def test_lookup_set_tag(self):
        (self.d / "anagrafica.csv").write_text("Codice;Ragione sociale;Multi\n00042;Rossi Srl;M-1\n", "utf-8")
        (self.d / "in" / "a.txt").write_text("Cliente cod. 42", "utf-8")
        (self.d / "in" / "b.txt").write_text("Cliente cod. 99", "utf-8")
        res, by = run({"steps": [
            {"block": "ocr", "with": {"engine": "text"}},
            {"block": "extract", "with": {"field": "cod", "method": "after", "start": "cod.", "pattern": r"(\d+)"}},
            {"block": "lookup", "with": {"table": str(self.d / "anagrafica.csv"), "from_field": "cod", "key_column": "Codice", "match": "digits"}},
            {"block": "set", "with": {"field": "cartella", "value": "{Multi|default:NUOVO}-{cod}"}},
            {"block": "tag", "with": {"tags": ["ft", "{cod}"], "vocabulary": {"fattura": ["ft", "fatt"]}}}]}, self.d)
        a, b = by["a.txt"], by["b.txt"]
        self.assertEqual(a["fields"]["Ragione sociale"]["v"], "Rossi Srl")
        self.assertEqual(a["fields"]["cartella"]["v"], "M-1-42")
        self.assertEqual(a["tags"], ["fattura", "42"])
        self.assertEqual(b["status"], "review")
        self.assertEqual(b["fields"]["cartella"]["v"], "NUOVO-99")

    @unittest.skipUnless(HAS_TESS, "Tesseract non installato")
    def test_real_ocr_on_a_crooked_noisy_scan(self):
        F.save_tiff(self.d / "in" / "s.tif", [F.page(F.invoice(4711, "Verdi Spa"), angle=2, noise=True)])
        res, by = run({"steps": [{"block": "image", "with": {"deskew": True, "grayscale": True, "denoise": True}},
                                 {"block": "ocr", "with": {"engine": "tesseract", "lang": "ita+eng"}},
                                 {"block": "extract", "with": {"field": "numero", "pattern": r"FATTURA\s*N\.?\s*(\d+)"}},
                                 {"block": "extract", "with": {"field": "piva", "method": "piva"}}]}, self.d)
        it = next(iter(by.values()))
        self.assertEqual(it["fields"]["numero"]["v"], "4711")
        self.assertEqual(it["fields"]["piva"]["v"], "01234567897")
        self.assertGreater(it["text_conf"], 0.7)
        self.assertTrue(it["text_by"].startswith("tesseract"))


class ControlAndOutputTest(Base):
    def _items(self, values):
        for i, (a, b) in enumerate(values):
            (self.d / "in" / f"d{i}.txt").write_text(f"A={a}\nB={b}", "utf-8")

    def test_double_reading_agree_vote_unique_rules(self):
        self._items([("100", "100"), ("101", "107"), ("100", "100"), ("01234567890", "x")])
        res, by = run({"steps": [
            {"block": "ocr", "with": {"engine": "text"}},
            {"block": "extract", "with": {"field": "n1", "pattern": r"A=(\w+)"}},
            {"block": "extract", "with": {"field": "n2", "pattern": r"B=(\w+)"}},
            {"block": "check", "with": {"agree": ["n1=n2"], "vote_into": "numero", "unique": ["numero"],
                                        "rules": {"numero": "range:1-999"}}}]}, self.d)
        self.assertEqual(by["d0.txt"]["fields"]["numero"]["conf"], 0.99)
        self.assertEqual(by["d0.txt"]["status"], "review")                    # 100 twice → unique fails
        self.assertIn("numero «100» ripetuto in 2 file", by["d0.txt"]["flags"])
        self.assertEqual(by["d1.txt"]["fields"]["numero"]["choices"], ["107"])
        self.assertTrue(any("letture diverse" in f for f in by["d1.txt"]["flags"]))
        self.assertTrue(any("intervallo" in f for f in by["d3.txt"]["flags"]))

    def test_triple_reading_majority(self):
        (self.d / "in" / "t.txt").write_text("A=5 B=5 C=8", "utf-8")
        res, by = run({"steps": [{"block": "ocr", "with": {"engine": "text"}}] +
                       [{"block": "extract", "with": {"field": k, "pattern": rf"{k.upper()}=(\d)"}} for k in "abc"] +
                       [{"block": "check", "with": {"agree": ["a=b=c"], "vote_into": "n"}}]}, self.d)
        f = by["t.txt"]["fields"]["n"]
        self.assertEqual((f["v"], f["by"]), ("5", "check:maggioranza"))

    def test_route_clone_conflicts_report_and_outside(self):
        (self.d / "in" / "a.txt").write_text("x", "utf-8")
        (self.d / "in" / "sub").mkdir()
        (self.d / "in" / "sub" / "a.txt").write_text("y", "utf-8")
        run({"steps": [{"block": "set", "with": {"field": "k", "value": "K"}},
                       {"block": "route", "with": {"to": "uno/{file}\ndue/{k}_{n:03}.{ext}"}},
                       {"block": "report", "with": {"format": "csv", "name": "rep"}}]}, self.d)
        self.assertEqual(self.outs(), ["due/K_001.txt", "due/K_002.txt", "rep.csv", "uno/a (2).txt", "uno/a.txt"])
        rep = M.read_table(self.d / "out" / "rep.csv")
        self.assertIn("k", rep[0])
        self.assertEqual(len(rep), 3)
        shutil.rmtree(self.d / "job", ignore_errors=True)
        res, _ = run({"steps": [{"block": "set", "with": {"field": "k", "value": ".."}},
                                {"block": "route", "with": {"to": "{k}/../../fuori.txt"}}]}, self.d)
        self.assertTrue(all(i["status"] == "error" for i in res["items"]))
        self.assertFalse((self.d / "fuori.txt").exists())

    def test_route_original_and_src_dir(self):
        F.save_tiff(self.d / "in" / "x" / "s.tif", [F.page(["A"])])
        run({"steps": [{"block": "image", "with": {"bw": True, "to": "png"}},
                       {"block": "route", "with": {"to": "orig/{src_dir}/{file}", "file": "original"}},
                       {"block": "route", "with": {"to": "lav/{src_dir|default:}/{file}"}}]}, self.d)
        self.assertEqual(self.outs(), ["lav/x/s.png", "orig/x/s.tif"])

    def test_rename_in_place_writes_undo_list(self):
        (self.d / "in" / "vecchio.txt").write_text("Pratica 9", "utf-8")
        res, _ = run({"steps": [{"block": "ocr", "with": {"engine": "text"}},
                                {"block": "extract", "with": {"field": "p", "pattern": r"Pratica (\d+)"}},
                                {"block": "rename", "with": {"to": "pratica_{p}", "in_place": True}}]}, self.d)
        self.assertTrue((self.d / "in" / "pratica_9.txt").is_file())
        self.assertFalse((self.d / "in" / "vecchio.txt").exists())
        log = M.read_table(self.d / "job" / "rinominati.csv")
        self.assertTrue(log[1][0].endswith("vecchio.txt") and log[1][1].endswith("pratica_9.txt"))

    def test_filter(self):
        (self.d / "in" / "a.pdf").write_bytes(b"%PDF")
        (self.d / "in" / "b.txt").write_text("x")
        res, by = run({"steps": [{"block": "filter", "with": {"ext": ["pdf"]}}]}, self.d)
        self.assertEqual((by["a.pdf"]["status"], by["b.txt"]["status"]), ("ok", "skip"))
        shutil.rmtree(self.d / "job", ignore_errors=True)
        res, by = run({"steps": [{"block": "filter", "with": {"ext": ["pdf"], "drop": True}}]}, self.d)
        self.assertEqual(list(by), ["a.pdf"])


if __name__ == "__main__":
    unittest.main()
