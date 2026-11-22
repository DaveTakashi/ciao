"""v0.5: Pipeline 1 "Crea progetto con AI" (prompt, JSON paste → draft, validation, review, confirm) and the
downloadable packages (workstation client, autoinstall web)."""

import io
import json
import os
import sys
import time
import unittest
import zipfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from docmap_hub import pipeline as P
from docmap_hub.registry import RegistryError
from test_v04_manager import WebHarness


def example(**over):
    d = json.loads(json.dumps(P.EXAMPLE))
    for path, v in over.items():
        node = d
        ks = path.split("__")
        for k in ks[:-1]:
            node = node[k]
        node[ks[-1]] = v
    return d


class TestPipelineUnit(unittest.TestCase):
    def test_extract_json_from_chat_answers(self):
        js = json.dumps(P.EXAMPLE)
        self.assertEqual(P.extract_json(js)["formato"], P.FORMAT)
        self.assertEqual(P.extract_json(f"Ecco il JSON:\n```json\n{js}\n```\nFammi sapere!")["formato"], P.FORMAT)
        self.assertEqual(P.extract_json(f"Testo prima {js} testo dopo")["cliente"]["citta"], "Parma")
        with self.assertRaises(RegistryError):
            P.extract_json("niente json qui")
        with self.assertRaises(RegistryError) as cm:
            P.extract_json('{"cliente": {"ragione_sociale": "x",}}')
        self.assertIn("riga", str(cm.exception))

    def test_normalize_fills_template_and_drops_junk(self):
        d = P.normalize({"cliente": {"ragione_sociale": " Studio X ", "partita_iva": "IT 01234567890", "boh": 1},
                         "progetto": {"installazioni": ["Sede", "sede", "online"]},
                         "postazioni": [{"nome": ""}, {"nome": "PC 1", "etichetta": None}],
                         "utenti_iniziali": [{"nome": "A", "ruolo": "capo"}], "licenza": {"mesi": "12"}})
        self.assertEqual(d["cliente"]["ragione_sociale"], "Studio X")
        self.assertEqual(d["cliente"]["partita_iva"], "01234567890")
        self.assertNotIn("boh", d["cliente"])
        self.assertEqual(d["progetto"]["installazioni"], ["sede", "online"])
        self.assertEqual(d["postazioni"], [{"nome": "PC 1", "etichetta": ""}])
        self.assertEqual(d["utenti_iniziali"][0]["ruolo"], "editor")
        self.assertEqual(d["licenza"]["mesi"], 12)
        self.assertEqual(set(d), set(P.TEMPLATE))

    def test_secrets_never_kept(self):
        d, warn = P.strip_secrets(P.normalize(example(online__ftp__password="Segreto!123")))
        self.assertEqual(d["online"]["ftp"]["password"], "{{PASSWORD_FTP}}")
        self.assertTrue(warn)
        d, warn = P.strip_secrets(P.normalize(example()))
        self.assertEqual(warn, [])

    def test_prompt_contains_template_plans_and_rules(self):
        from docmap_hub.service import Hub
        import tempfile
        with tempfile.TemporaryDirectory() as td, Hub(td) as hub:
            t = P.build_prompt(hub)
        self.assertIn(P.FORMAT, t)
        self.assertIn("{{PASSWORD_FTP}}", t)
        self.assertIn("studio_pro", t)
        self.assertIn('"postazioni"', t)
        self.assertIn("Mai password", t)


class TestPipelineWeb(WebHarness, unittest.TestCase):
    def setUp(self):
        self.start()
        self.login()

    def wait(self, job):
        for _ in range(600):
            code, _, j = self.call(f"/api/jobs/{job}")
            if j["status"] != "running":
                return j
            time.sleep(0.2)
        self.fail("job non terminato")

    def test_draft_validation_and_confirm_online_without_ftp(self):
        code, _, pp = self.call("/api/pipeline/prompt")
        self.assertIn("studio", pp["plans"])
        bad = example(cliente__ragione_sociale="", progetto__installazioni=["online"], online__indirizzo="http://x",
                      online__ftp__host="", licenza__piano="oro")
        code, _, dv = self.call("/api/drafts", {"text": "Ecco:\n```json\n" + json.dumps(bad) + "\n```"})
        self.assertEqual(code, 200, dv)
        paths = {e["path"] for e in dv["check"]["errors"]}
        self.assertTrue({"cliente.ragione_sociale", "online.indirizzo", "licenza.piano"} <= paths, paths)
        did = dv["id"]
        code, _, j = self.call(f"/api/drafts/{did}/confirm", {})
        self.assertEqual(code, 400)                                      # errors block the confirmation
        data = dv["data"]
        data["cliente"]["ragione_sociale"] = "Studio Rossi & Associati"
        data["online"]["indirizzo"] = "https://docmap.example/studio-rossi/"
        data["online"]["staging"] = ""
        data["licenza"]["piano"] = "studio_pro"
        code, _, dv = self.call(f"/api/drafts/{did}", {"data": data})
        self.assertEqual(dv["check"]["errors"], [])
        self.assertTrue(any("autoinstall" in w["msg"] for w in dv["check"]["warnings"]))
        code, _, j = self.call(f"/api/drafts/{did}/confirm", {"build": False})
        self.assertEqual(code, 200, j)
        res = self.wait(j["job"])
        self.assertEqual(res["status"], "ok", res)
        cid = res["result"]["customer_id"]
        code, _, cd = self.call(f"/api/customers/{cid}")
        self.assertEqual(cd["customer"]["extra"]["city"], "Parma")
        self.assertEqual(cd["customer"]["extra"]["tags"], ["commercialista", "pilota"])
        self.assertEqual(len(cd["projects"]), 1)
        p = cd["projects"][0]
        self.assertEqual(p["name"], "DocMap Studio Rossi")
        self.assertEqual(p["data"]["archivi"][1]["nome"], "Archivio storico")
        self.assertEqual([w["name"] for w in p["workstations"]], ["PC Luigi", "PC Reception"])
        self.assertEqual(p["instances"][0]["licence"]["limits"]["users"], 8)       # custom limit from the JSON
        self.assertEqual(p["instances"][0]["licence"]["plan"], "studio_pro")
        self.assertEqual(self.hub.registry.get_draft(did)["status"], "confirmed")
        code, _, j = self.call(f"/api/drafts/{did}/confirm", {})
        self.assertEqual(code, 400)                                      # not twice by accident
        # autoinstall web: built on demand, then downloadable with the note inside
        env = [e for e in self.hub.registry.list_environments() if e["customer_id"] == cid][0]
        code, _, raw = self.call(f"/scarica/web/{env['id']}", raw=True)
        self.assertEqual(code, 404)
        code, _, j = self.call(f"/api/envs/{env['id']}/package", {})
        self.assertEqual(self.wait(j["job"])["status"], "ok")
        code, h, raw = self.call(f"/scarica/web/{env['id']}", raw=True)
        self.assertEqual(code, 200)
        names = zipfile.ZipFile(io.BytesIO(raw)).namelist()
        self.assertIn("LEGGIMI-AUTOINSTALL.txt", names)
        self.assertIn("server-php/setup.php", names)
        self.assertNotIn("server-php/config.php", names)
        code, _, cd = self.call(f"/api/customers/{cid}")
        self.assertIsNotNone(cd["packages"]["web"][env["id"]])

    def test_workstation_client_zip(self):
        code, _, dv = self.call("/api/drafts", {"text": json.dumps(example(progetto__installazioni=["sede"],
                                                                           sede__indirizzo="https://192.168.1.20:8443/"))})
        code, _, j = self.call(f"/api/drafts/{dv['id']}/confirm", {"build": False})
        res = self.wait(j["job"])
        self.assertEqual(res["status"], "ok", res)
        ws = self.hub.registry.list_workstations()
        code, h, raw = self.call(f"/scarica/postazione/{ws[0]['id']}", raw=True)
        self.assertEqual(code, 200)
        self.assertIn("attachment", h["Content-Disposition"])
        z = zipfile.ZipFile(io.BytesIO(raw))
        folder = z.namelist()[0].split("/")[0]
        self.assertEqual(folder, "DocMap-studio-rossi-associati-pc-luigi")
        cfg = json.loads(z.read(f"{folder}/postazione.json"))
        self.assertEqual((cfg["postazione"], cfg["indirizzo_server"]), ("PC Luigi", "https://192.168.1.20:8443/"))
        ps1 = z.read(f"{folder}/collega-questo-pc.ps1").decode("utf-8-sig")
        self.assertIn("Cert:\\CurrentUser\\Root", ps1)
        self.assertNotIn("password", json.dumps(cfg).lower())
        self.assertIsNotNone(self.hub.registry.get_workstation(ws[0]["id"])["built_at"])
        self.hub.registry.update_workstation(ws[0]["id"], status="revoked")
        code, _, _ = self.call(f"/scarica/postazione/{ws[0]['id']}", raw=True)
        self.assertEqual(code, 404)

    def test_ftp_password_required_and_kept_out_of_the_draft(self):
        code, _, dv = self.call("/api/drafts", {"text": json.dumps(example(progetto__installazioni=["online"],
                                                                           online__ftp__password="Vera!Password"))})
        self.assertTrue(any("password vera" in w["msg"] for w in dv["check"]["warnings"]))
        self.assertNotIn("Vera!Password", json.dumps(self.hub.registry.get_draft(dv["id"])["data"]))
        code, _, j = self.call(f"/api/drafts/{dv['id']}/confirm", {"build": False})
        self.assertEqual((code, "password FTP" in j["error"]), (400, True))


if __name__ == "__main__":
    unittest.main()
