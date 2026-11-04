"""v0.2: local environments with the real server-python (setup, start, ping, port move,
clone-data through sync-remote, demo, purge to _trash, check-all)."""

import json
import os
import socket
import sys
import tempfile
import unittest
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from docmap_hub import health
from docmap_hub.envs import EnvError, EnvManager
from docmap_hub.ports import PortManager, is_free
from docmap_hub.runner import RunnerError, check_server_python, parse_setup_tokens
from docmap_hub.service import Hub
from docmap_hub.vault import Vault

PASS = "una-passphrase-lunga"


def _server_ready():
    try:
        return check_server_python()["ok"]
    except RunnerError:
        return False


SERVER_OK = _server_ready()


def _free_block(n=8):
    for start in range(43000, 60000, 41):
        if all(is_free(p) for p in range(start, start + n)):
            return start
    raise unittest.SkipTest("nessun blocco di porte libere")


def api(url, route, token, body=None):
    req = urllib.request.Request(url + "?r=" + route, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"X-DocMap-Token": token, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


class TestParse(unittest.TestCase):
    def test_parse_setup_tokens(self):
        out = ("Fatto\n\nPersona    Ruolo   Codice di accesso (token)\n"
               "admin      admin   AAA-bbb_1\nponte-hub  editor  CCC\n")
        self.assertEqual(parse_setup_tokens(out), [{"user": "admin", "role": "admin", "token": "AAA-bbb_1"},
                                                   {"user": "ponte-hub", "role": "editor", "token": "CCC"}])


@unittest.skipUnless(SERVER_OK, "server-python non avviabile (servono fastapi, uvicorn, cryptography)")
class TestLocalEnvs(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.addCleanup(self._td.cleanup)
        self.hub = Hub(Path(self._td.name) / "hub")
        self.addCleanup(self.hub.close)
        self.reg = self.hub.registry
        base = _free_block()
        PortManager(self.reg).set_range(base, base + 7)
        self.base = base
        self.vk = Vault(self.reg).init(PASS)
        c = self.reg.add_customer("Studio Demo")
        self.inst = self.reg.add_instance(c["id"], label="PC Demo")
        self.em = EnvManager(self.hub)
        self.held = []
        self.addCleanup(self._cleanup)

    def _cleanup(self):
        for s in self.held:
            s.close()
        for e in self.reg.list_environments():
            if e["kind"] == "local-python":
                try:
                    self.em.runner.stop(e)
                except Exception:
                    pass

    def test_create_start_move_clone_demo_purge(self):
        # staging on Dave's PC: setup + tokens in the vault + port reserved (no app build: faster)
        r = self.em.create_local(self.inst["id"], "staging", self.vk, "Studio Demo", build_app=False)
        st = r["env"]
        self.assertEqual(st["status"], "stopped")
        self.assertTrue((self.hub.dir / "envs" / self.inst["id"] / "staging" / "config.json").exists())
        users = {s["label"] for s in self.em.vault.list(env_id=st["id"])}
        self.assertEqual(users, {"admin", "ponte-hub"})
        port = st["port"]
        self.assertTrue(self.base <= port <= self.base + 7)

        # another program takes the reserved port → start moves the environment
        s = socket.socket()
        s.bind(("127.0.0.1", port))
        s.listen(1)
        self.held.append(s)
        res = self.em.runner.start(st)
        self.assertEqual(res["moved_from"], port)
        self.assertNotEqual(res["port"], port)
        self.assertTrue(res["app_version"])
        st = self.reg.get_environment(st["id"])
        self.assertEqual(st["status"], "running")
        self.assertEqual(self.em.runner.status(st)["state"], "running")
        self.assertTrue(self.em.runner.start(st)["already"])

        # put a record in "production" (here: a studio-python env that is really the staging server)
        admin = self.em.vault.get(self.vk, st["id"], "admin_token", "admin", reason="test")["token"]
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        pr = api(st["api_url"], "push", admin, {"deviceId": "test", "records": [
            {"type": "binder", "id": "dm-test-binder-1", "updated_at": now,
             "data": {"id": "dm-test-binder-1", "title": "Faldone di prova", "updated_at": now}}]})
        self.assertEqual(pr.get("applied"), 1, pr)
        prod = self.em.add_remote(self.inst["id"], "production", "studio-python", url=st["url"], api_url=st["api_url"])
        self.em.vault.put(self.vk, prod["id"], "admin_token", {"user": "admin", "token": admin}, label="admin")

        # demo with real data needs key escrow (GDPR)
        with self.assertRaises(EnvError):
            self.em.demo_create(self.inst["id"], 7, self.vk, "production", label="rossi")
        self.assertFalse(any(e["name"] == "demo-rossi" for e in self.reg.list_environments()))
        self.reg.set_key_escrow("Studio Demo", True)
        d = self.em.demo_create(self.inst["id"], 7, self.vk, "production", label="rossi2")
        demo = self.reg.get_environment(d["env"]["id"])
        self.assertEqual(d["clone"]["exit"], 0, d["clone"])
        self.assertNotIn(demo["port"], (st["port"],))
        demo_admin = self.em.vault.get(self.vk, demo["id"], "admin_token", "admin", reason="test")["token"]
        pulled = api(demo["api_url"], "pull&since=0", demo_admin)
        ids = [x.get("id") for x in pulled.get("records", [])]
        self.assertIn("dm-test-binder-1", ids)
        # the profile written for sync-remote holds no token
        prof = Path(d["clone"]["profile"]).read_text("utf-8")
        self.assertNotIn(admin, prof)
        self.assertNotIn(demo_admin, prof)

        # clone never writes into production
        with self.assertRaises(EnvError):
            self.em.clone_data(self.inst["id"], "staging", "production", self.vk)

        # check-all sees both local servers
        res = health.check_all(self.hub, self.vk, timeout=5)
        self.assertTrue(all(r["ok"] for r in res.values()), res)
        rows = health.status_rows(self.hub)
        self.assertEqual({r["env"] for r in rows}, {"production", "staging", d["env"]["name"]})

        # purge-expired: stop, release the port, move the data to _trash
        self.assertEqual(self.em.purge_expired(), [])
        out = self.em.purge_expired(now=datetime.now(timezone.utc) + timedelta(days=8))
        self.assertEqual([x["env"]["name"] for x in out], [d["env"]["name"]])
        self.assertTrue(Path(out[0]["archived_to"]).is_dir())
        self.assertIn("_trash", out[0]["archived_to"])
        self.assertFalse((self.hub.dir / "envs" / self.inst["id"] / d["env"]["name"]).exists())
        self.assertIsNone(PortManager(self.reg).reserved(demo["id"]))
        self.assertEqual(self.em.vault.list(env_id=demo["id"]), [])

        # stop staging
        self.assertTrue(self.em.runner.stop(st)["stopped"])
        self.assertEqual(self.em.runner.status(st)["state"], "stopped")

    def test_local_env_serves_web_app(self):
        r = self.em.create_local(self.inst["id"], "staging", self.vk, "Studio Demo", build_app=True)
        self.assertTrue(r["app"] and r["app"].get("version"), r["app"])
        res = self.em.runner.start(r["env"])
        self.assertEqual(res["app_version"], r["app"]["version"])
        with urllib.request.urlopen(f"http://127.0.0.1:{res['port']}/", timeout=10) as resp:
            self.assertIn(b"<html", resp.read(4000).lower())
        # the app built for the local env talks to the local API (server-php/api.php path)
        with urllib.request.urlopen(f"http://127.0.0.1:{res['port']}/server-php/api.php?r=ping", timeout=10) as resp:
            self.assertTrue(json.loads(resp.read())["ok"])
        self.em.runner.stop(r["env"])


if __name__ == "__main__":
    unittest.main()
