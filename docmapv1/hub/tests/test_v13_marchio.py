"""v0.13: white label (brand.js + reseller / customer brand on every site and package) and the price list (one source,
plans.json) with per-customer quotes."""

import io
import json
import os
import sys
import tempfile
import unittest
import zipfile
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from docmap_hub import branding as BR  # noqa: E402
from docmap_hub import pricing as P  # noqa: E402
from docmap_hub.registry import RegistryError  # noqa: E402
from docmap_hub.runner import run_build_deploy  # noqa: E402
from docmap_hub.service import Hub  # noqa: E402

DOCMAP = Path(__file__).resolve().parents[2]


def cli(*argv, data_dir):
    from docmap_hub.cli import main
    out, err = io.StringIO(), io.StringIO()
    with mock.patch.dict(os.environ, {"DOCMAP_HUB_DIR": str(data_dir)}), redirect_stdout(out), redirect_stderr(err):
        rc = main(list(argv))
    return rc, out.getvalue(), err.getvalue()


def brand_of(folder: Path) -> dict:
    t = (folder / "brand.js").read_text("utf-8")
    return json.loads(t[t.index("{", t.index("DOCMAP_BRAND")):t.rindex("}") + 1])


class TestBrand(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.hub = Hub(self.tmp / "hub")
        self.reg = self.hub.registry

    def test_product_brand_is_brand_js(self):
        b = BR.product_brand(self.reg)
        self.assertEqual(b["product_name"], brand_of(DOCMAP)["product_name"])
        self.assertEqual(BR.brand_name(self.reg), b["product_name"])
        self.assertTrue(BR.hub_title(self.reg).startswith(b["product_name"]))

    def test_reseller_then_customer_brand(self):
        r = self.reg.add_reseller("Rivendo", branding={"product_name": "Archivi Rivendo", "primary_color": "#0A5C8A"})
        c = self.reg.add_customer("Studio Uno", None, None, r["id"], None)
        self.assertEqual(BR.brand_for_customer(self.reg, self.reg.get_customer(c["id"]))["product_name"], "Archivi Rivendo")
        self.reg.update_customer(c["id"], extra={"brand": {"product_name": "Archivio Uno", "mark": "AU"}})
        over = BR.customer_override(self.reg, self.reg.get_customer(c["id"]))
        self.assertEqual(over, {"product_name": "Archivio Uno", "primary_color": "#0A5C8A", "mark": "AU"})
        full = BR.brand_for_customer(self.reg, self.reg.get_customer(c["id"]))
        self.assertEqual((full["product_name"], full["primary_color"], full["website"]),
                         ("Archivio Uno", "#0A5C8A", ""))   # the original vendor's site never leaks to a reseller
        self.assertEqual(BR.customer_override(self.reg, self.reg.add_customer("Senza", None, None, None, None)), {})

    def test_build_deploy_writes_the_customer_brand(self):
        site = self.tmp / "site"
        run_build_deploy(site, slug="uno", brand={"product_name": "Archivio Uno", "file_prefix": "ArchivioUno"})
        b = brand_of(site)
        self.assertEqual((b["product_name"], b["file_prefix"]), ("Archivio Uno", "ArchivioUno"))
        self.assertEqual(json.loads((site / "manifest.webmanifest").read_text("utf-8"))["short_name"], "Archivio Uno")
        self.assertTrue((site / "server-php" / "brand.php").is_file())
        with self.assertRaises(Exception):
            run_build_deploy(self.tmp / "bad", slug="x", brand={"product_name": "X", "primary_color": "blu"})

    def test_cli_marchio(self):
        d = self.tmp / "cli"
        rc, o, e = cli("customer", "add", "--name", "Studio Due", data_dir=d)
        self.assertEqual(rc, 0, e)
        rc, o, e = cli("marchio", "imposta", "--cliente", "Studio Due", "--nome", "Archivio Due", "--colore", "#123456", data_dir=d)
        self.assertEqual(rc, 0, e)
        rc, o, e = cli("marchio", "mostra", "--cliente", "Studio Due", data_dir=d)
        self.assertIn("«Archivio Due»", o)
        rc, o, e = cli("marchio", "imposta", "--cliente", "Studio Due", "--colore", "blu", data_dir=d)
        self.assertNotEqual(rc, 0)
        self.assertIn("primary_color", o + e)
        rc, o, e = cli("marchio", "imposta", "--cliente", "Studio Due", "--azzera", data_dir=d)
        self.assertEqual(rc, 0, e)
        rc, o, e = cli("marchio", "mostra", "--cliente", "Studio Due", data_dir=d)
        self.assertIn("quello del prodotto", o)
        rc, o, e = cli("reseller", "add", "--name", "Rivendo", data_dir=d)
        rc, o, e = cli("marchio", "imposta", "--rivenditore", "Rivendo", "--nome", "Archivi Rivendo", data_dir=d)
        self.assertEqual(rc, 0, e)
        self.assertIn("Archivi Rivendo", o)

    def test_validation_refuses_qr_address_and_html(self):
        self.assertTrue(BR.validate_override(self.reg, {"qr_base": "https://x.example"}))
        self.assertTrue(BR.validate_override(self.reg, {"product_name": "A <b>"}))
        self.assertEqual(BR.validate_override(self.reg, {"product_name": "Archivio Tre"}), [])


class TestListino(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.hub = Hub(self.tmp / "hub")
        self.reg = self.hub.registry
        self.lst = P.load_listino(self.hub.dir)

    def test_listino_md_is_generated_from_plans_json(self):
        md = (DOCMAP / "docs" / "commerciale" / "LISTINO.md").read_text("utf-8")
        self.assertEqual(md, P.render_markdown(self.lst, BR.brand_name(self.reg)),
                         "LISTINO.md non è allineato a plans.json: python -m docmap_hub listino --md ../docs/commerciale/LISTINO.md")

    def test_every_plan_has_a_price(self):
        for pid, p in self.lst["plans"].items():
            self.assertIn("monthly_eur", p.get("price", {}), pid)
            self.assertGreaterEqual(p["price"]["yearly_eur"], 0)

    def test_quote_list_discount_agreed(self):
        c = self.reg.add_customer("Studio Q", None, None, None, None)
        q = P.quote(self.lst, self.reg.get_customer(c["id"]))
        self.assertEqual((q["plan"], q["agreed_eur"], q["custom"]), ("studio", 39, False))
        P.set_quote(self.reg, c["id"], {"plan": "studio_pro", "discount_pct": 10, "modules": ["retention"]})
        q = P.quote(self.lst, self.reg.get_customer(c["id"]))
        self.assertEqual((q["list_eur"], q["agreed_eur"]), (98, 88.2))
        P.set_quote(self.reg, c["id"], {"monthly_eur": 70, "discount_pct": None, "billing": "yearly"})
        q = P.quote(self.lst, self.reg.get_customer(c["id"]))
        self.assertEqual((q["list_eur"], q["agreed_eur"], q["how"]), (980, 700, "canone concordato"))
        P.set_quote(self.reg, c["id"], {}, clear=True)
        self.assertNotIn("preventivo", BR.customer_extra(self.reg.get_customer(c["id"])))
        with self.assertRaises(RegistryError):
            P.set_quote(self.reg, c["id"], {"price": 1})
        with self.assertRaises(RegistryError):
            P.set_quote(self.reg, c["id"], {"discount_pct": 120})

    def test_list_price_change_reaches_customers_without_quote_only(self):
        a = self.reg.add_customer("Listino", None, None, None, None)
        b = self.reg.add_customer("Concordato", None, None, None, None)
        P.set_quote(self.reg, b["id"], {"monthly_eur": 30})
        local = {"plans": {"studio": {"price": {"monthly_eur": 45, "yearly_eur": 450}}}}
        (self.hub.dir / "plans.json").write_text(json.dumps(local), "utf-8")
        lst = P.load_listino(self.hub.dir)
        self.assertEqual(P.quote(lst, self.reg.get_customer(a["id"]))["agreed_eur"], 45)
        self.assertEqual(P.quote(lst, self.reg.get_customer(b["id"]))["agreed_eur"], 30)
        self.assertEqual(lst["plans"]["studio"]["limits"]["users"], 5, "a local plans.json keeps the bundled limits")

    def test_cli_preventivo(self):
        d = self.tmp / "cli"
        cli("customer", "add", "--name", "Studio P", data_dir=d)
        rc, o, e = cli("cliente", "preventivo", "Studio P", "--piano", "conto_terzi", "--sconto", "5", data_dir=d)
        self.assertEqual(rc, 0, e)
        self.assertIn("180,50 €/mese", o)
        rc, o, e = cli("cliente", "preventivo", "Studio P", "--piano", "inesistente", data_dir=d)
        self.assertNotEqual(rc, 0)
        rc, o, e = cli("listino", data_dir=d)
        self.assertIn("studio_pro", o)


class TestApi(unittest.TestCase):
    def test_commercial_read_and_write(self):
        from types import SimpleNamespace
        from docmap_hub import api as A
        hub = Hub(Path(tempfile.mkdtemp()) / "hub")
        app = SimpleNamespace(hub=hub)
        c = hub.registry.add_customer("Studio Api", None, None, None, None)
        m = A.customer_commercial(app, c["id"])
        self.assertEqual((m["quote"]["agreed_eur"], m["brand"]["product_name"], m["own_brand"]), (39, BR.brand_name(hub.registry), {}))
        m = A.set_customer_commercial(app, c["id"], {"preventivo": {"plan": "studio_pro", "discount_pct": 20, "modules": None},
                                                    "brand": {"product_name": "Archivio Api", "mark": "", "website": ""}})
        self.assertEqual((m["quote"]["agreed_eur"], m["brand"]["product_name"], m["own_brand"]), (71.2, "Archivio Api", {"product_name": "Archivio Api"}))
        with self.assertRaises(RegistryError):
            A.set_customer_commercial(app, c["id"], {"brand": {"product_name": "X", "primary_color": "rosso"}})
        m = A.set_customer_commercial(app, c["id"], {"preventivo_azzera": True, "brand": {}})
        self.assertEqual((m["quote"]["custom"], m["own_brand"]), (False, {}))


class TestPackagesCarryTheBrand(unittest.TestCase):
    def test_workstation_leggimi_and_shortcut_use_the_customer_brand(self):
        from docmap_hub import packages
        src = Path(packages.__file__).read_text("utf-8")
        self.assertIn('"prodotto": bn', src)
        self.assertIn("$prod = if ($cfg.prodotto)", packages.PS1)
        self.assertNotIn('"DocMap -', packages.PS1)

    def test_autoinstall_note_is_a_template(self):
        from docmap_hub import packages
        txt = packages.AUTOINSTALL_NOTE.format(prodotto="Archivio Zeta", url="https://x/", path="/x/")
        self.assertTrue(txt.startswith("Archivio Zeta - pacchetto"))


if __name__ == "__main__":
    unittest.main()
