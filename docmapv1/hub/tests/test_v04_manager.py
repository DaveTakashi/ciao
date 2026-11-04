"""v0.4: client-centric manager — registry schema 3 (projects, workstations, drafts, customer details),
locked start + browser login (one passphrase, 'Ricorda su questo PC'), first setup from the page, JSON API
with CSRF header, single-page app served with a strict CSP."""

import json
import os
import sqlite3
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from docmap_hub import autoaccess
from docmap_hub.registry import MIGRATIONS, Registry, RegistryError, SCHEMA_VERSION
from docmap_hub.service import Hub
from docmap_hub.vault import Vault

PASS = "una-passphrase-lunga"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


class TestRegistryV3(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.addCleanup(self._td.cleanup)
        self.dir = Path(self._td.name)

    def test_upgrade_from_schema_2_keeps_data_and_adds_projects(self):
        con = sqlite3.connect(str(self.dir / "registry.sqlite3"))
        con.execute("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)")
        for v, stmts in MIGRATIONS[:2]:
            for sql in stmts:
                con.execute(sql)
        con.execute("INSERT INTO meta VALUES('schema_version','2')")
        con.execute("INSERT INTO customers(id,name,created_at) VALUES('cus-1','Studio Vecchio','2026-01-01T00:00:00Z')")
        con.execute("INSERT INTO instances(id,customer_id,label,kind,created_at) VALUES('i-1','cus-1','Sede','onprem','2026-01-01T00:00:00Z')")
        con.execute("INSERT INTO instances(id,customer_id,label,kind,created_at) VALUES('i-2','cus-1','Online','cloud','2026-01-01T00:00:00Z')")
        con.commit()
        con.close()
        r = Registry(self.dir)
        self.addCleanup(r.close)
        self.assertEqual(r.schema_version(), SCHEMA_VERSION)
        # copy of the old registry taken before migrating
        self.assertTrue(list((self.dir / "backups").glob("registro-prima-dello-schema-*-da-2-*.sqlite3")))
        projects = r.list_projects("cus-1")
        self.assertEqual(len(projects), 1)
        self.assertEqual(projects[0]["name"], "DocMap Studio Vecchio")
        self.assertEqual({i["project_id"] for i in r.list_instances("cus-1")}, {projects[0]["id"]})
        self.assertEqual(r.get_customer("cus-1")["status"], "active")
        # running the migration again changes nothing
        r.migrate()
        self.assertEqual(len(r.list_projects()), 1)

    def test_projects_workstations_drafts(self):
        r = Registry(self.dir)
        self.addCleanup(r.close)
        c = r.add_customer("Studio Rossi")
        i = r.add_instance(c["id"], "Sede")              # default project created on the fly
        p = r.get_project(i["project_id"])
        p2 = r.add_project(c["id"], "Seconda sede")
        r.move_instance(i["id"], p2["id"])
        self.assertEqual(r.get_instance(i["id"])["project_id"], p2["id"])
        other = r.add_customer("Altro")
        with self.assertRaises(RegistryError):
            r.move_instance(i["id"], r.add_project(other["id"], "X")["id"])
        w = r.add_workstation(p["id"], "PC Luigi", "Sala studio")
        with self.assertRaises(RegistryError):
            r.add_workstation(p["id"], "pc luigi")       # same name in the same project
        r.update_workstation(w["id"], log_action="workstation.revoke", status="revoked")
        r.add_workstation(p["id"], "PC Luigi")            # a revoked name can be reused
        c2 = r.update_customer(c["id"], extra={"city": "Parma", "tags": ["pilota"], "bogus": 1}, status="prospect")
        self.assertEqual(json.loads(c2["extra_json"]), {"city": "Parma", "tags": ["pilota"]})
        c2 = r.update_customer(c["id"], extra={"city": ""})
        self.assertEqual(json.loads(c2["extra_json"]), {"tags": ["pilota"]})
        with self.assertRaises(RegistryError):
            r.update_customer(c["id"], name="  ")
        d = r.save_draft({"cliente": {"nome": "X"}}, title="Bozza X")
        d = r.save_draft({"cliente": {"nome": "Y"}}, draft_id=d["id"], title="Bozza Y")
        self.assertEqual((d["data"]["cliente"]["nome"], len(r.list_drafts())), ("Y", 1))
        r.delete_draft(d["id"])
        self.assertEqual(r.list_drafts(), [])


class TestManagerWeb(unittest.TestCase):
    def start(self, passphrase=PASS, keys=True):
        from docmap_hub.web import make_server
        self._td = tempfile.TemporaryDirectory()
        self.addCleanup(self._td.cleanup)
        self.hub = Hub(Path(self._td.name) / "hub")
        if keys:
            self.hub.keys.generate(PASS)
            Vault(self.hub.registry).init(PASS)
        self.httpd = make_server(self.hub, passphrase, port=0)
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.addCleanup(self._stop)
        self.opener = urllib.request.build_opener(NoRedirect)
        self.cookie, self.csrf = None, None

    def _stop(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.hub.close()

    def call(self, path, body=None, csrf=True, ctype="application/json", raw=False):
        data = None if body is None else (body if isinstance(body, bytes) else json.dumps(body).encode())
        r = urllib.request.Request(self.base + path, data=data)
        if body is not None:
            r.add_header("Content-Type", ctype)
            if csrf and self.csrf:
                r.add_header("X-CSRF", self.csrf)
        if self.cookie:
            r.add_header("Cookie", self.cookie)
        try:
            resp = self.opener.open(r, timeout=20)
            code, headers, text = resp.status, dict(resp.headers), resp.read()
        except urllib.error.HTTPError as e:
            code, headers, text = e.code, dict(e.headers), e.read()
        if raw:
            return code, headers, text
        return code, headers, json.loads(text.decode() or "null")

    def login(self, p=PASS, **kw):
        code, h, j = self.call("/api/login", dict(passphrase=p, **kw))
        if code == 200:
            self.cookie = h["Set-Cookie"].split(";")[0]
            self.csrf = j["csrf"]
        return code, j

    def test_locked_start_then_browser_login(self):
        self.start(passphrase=None)
        self.assertFalse(self.httpd.app.unlocked)
        code, _, s = self.call("/api/session")
        self.assertEqual((code, s["logged"], s["unlocked"], s["has_keys"]), (200, False, False, True))
        code, _, _ = self.call("/api/overview")
        self.assertEqual(code, 401)
        code, j = self.login("sbagliata-sbagliata")
        self.assertEqual(code, 403)
        self.assertFalse(self.httpd.app.unlocked)
        code, j = self.login()
        self.assertEqual(code, 200)
        self.assertTrue(self.httpd.app.unlocked)
        self.assertIsNotNone(self.httpd.app.vault_key)   # one passphrase opens key and vault
        code, _, s = self.call("/api/session")
        self.assertEqual((s["logged"], s["vault"], s["csrf"]), (True, "open", self.csrf))
        # the 0.3 form login keeps working with the unlocked page
        code, h, _ = self.call("/login", b"passphrase=" + PASS.encode(), ctype="application/x-www-form-urlencoded", raw=True)
        self.assertEqual(code, 303)

    def test_first_setup_from_the_page(self):
        self.start(passphrase=None, keys=False)
        code, _, s = self.call("/api/session")
        self.assertFalse(s["has_keys"])
        code, _, j = self.call("/api/setup", {"passphrase": PASS, "repeat": PASS + "x"})
        self.assertEqual(code, 400)
        code, _, j = self.call("/api/setup", {"passphrase": "corta", "repeat": "corta"})
        self.assertEqual(code, 400)
        code, h, j = self.call("/api/setup", {"passphrase": PASS, "repeat": PASS})
        self.assertEqual(code, 200)
        self.assertTrue(self.hub.keys.active_id)
        self.assertTrue(Vault(self.hub.registry).check(PASS))
        code, _, j = self.call("/api/setup", {"passphrase": PASS, "repeat": PASS})
        self.assertEqual(code, 400)                      # never twice

    def test_api_flow_customer_project_workstation_licence(self):
        self.start()
        self.login()
        # writes need JSON + the CSRF header
        code, _, _ = self.call("/api/customers", {"name": "Studio Rossi"}, csrf=False)
        self.assertEqual(code, 403)
        code, _, _ = self.call("/api/customers", b"name=x", ctype="application/x-www-form-urlencoded")
        self.assertEqual(code, 415)
        code, _, j = self.call("/api/customers", {"name": "Studio Rossi", "vat_id": "IT0123",
                                                   "extra": {"city": "Parma", "tags": ["pilota"]}})
        self.assertEqual(code, 200, j)
        cid, pid = j["id"], j["project_id"]
        code, _, j = self.call("/api/customers", {"name": " "})
        self.assertEqual((code, "obbligatorio" in j["error"]), (400, True))
        code, _, j = self.call("/api/instances", {"project_id": pid, "label": "Sito online", "kind": "cloud"})
        iid = j["id"]
        self.hub.registry.add_environment(iid, "production", "web-php", url="https://x.example/st/")
        code, _, j = self.call("/api/workstations", {"project_id": pid, "name": "PC Luigi", "tag": "Sala"})
        wid = j["id"]
        code, _, j = self.call("/api/workstations", {"project_id": pid, "name": "PC Luigi"})
        self.assertEqual(code, 400)
        code, _, j = self.call("/api/licences", {"instance_id": iid, "plan": "studio", "limits": {"users": "3", "binders": ""}})
        self.assertEqual(code, 200, j)
        lid = j["id"]
        code, _, d = self.call(f"/api/customers/{cid}")
        self.assertEqual(d["customer"]["extra"]["city"], "Parma")
        self.assertEqual(len(d["projects"]), 1)
        p = d["projects"][0]
        self.assertEqual([i["label"] for i in p["instances"]], ["Sito online"])
        self.assertEqual(p["instances"][0]["role"], "online")
        self.assertEqual(p["instances"][0]["licence"]["limits"]["users"], 3)
        self.assertEqual([w["name"] for w in p["workstations"]], ["PC Luigi"])
        self.assertTrue(any(e["text"] == "Licenza emessa" and "Studio Rossi" in (e["subject"] or "") for e in d["events"]))
        code, _, j = self.call(f"/api/licences/{lid}/renew", {"months": "6"})
        self.assertEqual(code, 200)
        code, _, ld = self.call(f"/api/licences/{j['id']}")
        self.assertEqual((ld["verify"]["mode"], len(ld["history"])), ("full", 2))
        self.assertEqual({h["state"] for h in ld["history"]}, {"active", "superseded"})
        code, _, j = self.call(f"/api/workstations/{wid}", {"revoke": True})
        self.assertEqual(self.hub.registry.get_workstation(wid)["status"], "revoked")
        code, _, lst = self.call("/api/customers")
        self.assertEqual((lst[0]["name"], lst[0]["workstations"], lst[0]["plans"]), ("Studio Rossi", 0, ["studio"]))
        code, _, res = self.call("/api/search?q=ross")
        self.assertIn("customer", {r["type"] for r in res})
        code, _, res = self.call("/api/search?q=luigi")
        self.assertEqual(res[0]["type"], "workstation")
        code, _, ov = self.call("/api/overview")
        self.assertEqual((ov["kpi"]["customers"], ov["kpi"]["envs"]), (1, 1))
        self.assertTrue(any(a["kind"] == "env" for a in ov["alerts"]))   # never checked
        code, _, ins = self.call("/api/instances")
        self.assertEqual((ins[0]["customer_name"], ins[0]["licence"]["plan"]), ("Studio Rossi", "studio"))
        code, _, j = self.call(f"/api/customers/{cid}", {"status": "suspended", "extra": {"city": "Fidenza"}})
        self.assertEqual(self.hub.registry.customer_view(self.hub.registry.get_customer(cid))["extra"]["city"], "Fidenza")
        code, _, j = self.call("/api/nope")
        self.assertEqual(code, 404)

    def test_remember_on_this_pc(self):
        self.start()
        self.login()
        code, _, j = self.call("/api/remember", {"on": True, "passphrase": "sbagliata!"})
        self.assertEqual(code, 400)
        self.assertFalse(autoaccess.path(self.hub.dir).exists())
        code, _, j = self.call("/api/remember", {"on": True, "passphrase": PASS})
        self.assertEqual((code, j["remembered"]), (200, True))
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("DOCMAP_HUB_NO_AUTO", None)
            self.assertEqual(autoaccess.load(self.hub.dir)["signing"], PASS)
        code, _, s = self.call("/api/session")
        self.assertTrue(s["remembered"])
        code, _, j = self.call("/api/remember", {"on": False})
        self.assertFalse(autoaccess.path(self.hub.dir).exists())

    def test_login_with_remember_checkbox(self):
        self.start(passphrase=None)
        code, j = self.login(remember=True)
        self.assertEqual(code, 200)
        self.assertTrue(autoaccess.path(self.hub.dir).exists())

    def test_spa_static_and_csp(self):
        self.start()
        code, h, _ = self.call("/", raw=True)
        self.assertEqual((code, h["Location"]), (303, "/login"))
        code, h, body = self.call("/login", raw=True)
        self.assertEqual(code, 200)
        self.assertIn("script-src 'self'", h["Content-Security-Policy"])
        self.assertEqual(h["Content-Security-Policy"].count("default-src"), 1)
        self.assertNotIn(b"http://", body)
        self.assertNotIn(b"https://", body)
        for f, t in (("app.js", "javascript"), ("app.css", "css")):
            code, h, body = self.call(f"/ui/{f}", raw=True)
            self.assertEqual(code, 200)
            self.assertIn(t, h["Content-Type"])
            self.assertNotRegex(body.decode(), r"(src|href)=\"https?://")   # no external assets
        for bad in ("/ui/../web.py", "/ui/%2e%2e/web.py", "/ui/app.py", "/ui/fonts/../../keys.py"):
            code, _, _ = self.call(bad, raw=True)
            self.assertEqual(code, 404, bad)


if __name__ == "__main__":
    unittest.main()
