#!/usr/bin/env python3
"""Licence channel (hub 0.7): the server downloads its next licence from the signed `update_url`.

  python3 docmapv1/server-python/tests/test_licence_channel.py

Licences come from the REAL hub (docmapv1/hub): a channel on a web environment, an issued licence carrying
`update_url`, then suspension / reactivation / limit change published by the hub. The server side is exercised through
`licence.fetch_update` with a fake opener (no network) and through the CLI for `install --force`.
"""
import base64
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
PYROOT = os.path.dirname(HERE)
HUB = os.path.join(os.path.dirname(PYROOT), "hub")
sys.path.insert(0, PYROOT)
sys.path.insert(0, HUB)
sys.dont_write_bytecode = True

from docmap_hub import licensing  # noqa: E402
from docmap_hub.service import Hub  # noqa: E402
from docmap_server import licence as SL  # noqa: E402

PASS = "test passphrase"


class FakeWeb:
    """urlopen stand-in: serves the files the hub 'published' into a folder, by URL."""

    def __init__(self, base_url, folder):
        self.base_url, self.folder, self.calls = base_url, Path(folder), []

    def __call__(self, req, timeout=None):
        url = req.full_url
        self.calls.append(url)
        if not url.startswith(self.base_url):
            raise OSError("404")
        f = self.folder / url[len(self.base_url):]
        if not f.is_file():
            raise OSError("404 " + f.name)
        return io.BytesIO(f.read_bytes())


class ChannelTests(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.addCleanup(self.td.cleanup)
        w = Path(self.td.name)
        self.hub = Hub(w / "hub")
        self.addCleanup(self.hub.close)
        self.kid = self.hub.keys.generate(PASS)
        self.kid, self.priv = self.hub.keys.load_private(PASS)
        pub = {k.key_id: k.public_b64 for k in self.hub.keys.list()}
        r = self.hub.registry
        own = r.add_customer("QR7 Srl")
        oi = r.add_instance(own["id"], "Sito QR7", "cloud")
        env = r.add_environment(oi["id"], "production", "web-php", url="https://lic.example.it/")
        licensing.set_channel(r, env["id"])
        c = r.add_customer("Studio Canale")
        self.iid = r.add_instance(c["id"], "Server sede")["id"]
        self.site = w / "site"
        self.site.mkdir()
        self.data = w / "srv-data"
        self.data.mkdir()
        self.cfg = {"data_dir": str(self.data), "licence_required": True, "licence_public_keys": pub}
        self.cfgfile = w / "config.json"
        self.cfgfile.write_text(json.dumps(self.cfg), "utf-8")
        self.web = FakeWeb("https://lic.example.it/licenze/", self.site / "licenze")
        SL.clear_cache()

    def _export_pub(self):
        out = subprocess.run([sys.executable, "-m", "docmap_hub", "--dir", str(self.hub.dir), "export-public-key",
                              "--format", "json"], cwd=HUB, capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, out.stderr)
        return out.stdout

    def publish(self):
        from docmap_hub.deploy import LocalRemote
        return licensing.publish(self.hub, None, remote=LocalRemote(self.site))

    def install_first(self):
        res = self.hub.issue_with_key(self.kid, self.priv, self.iid, "studio")
        self.assertTrue(res["licence"]["update_url"].startswith("https://lic.example.it/licenze/"))
        st, why = SL.check_candidate(str(self.data), res["text"].encode(), SL.trusted_keys(self.cfg))
        self.assertIsNone(why)
        SL.install_bytes(str(self.data), res["text"].encode(), st)
        return res

    def test_suspend_reactivate_modify_reach_the_server(self):
        first = self.install_first()
        self.assertEqual(SL.evaluate(str(self.data), SL.trusted_keys(self.cfg)).mode, "full")
        # nothing new published yet → unchanged
        self.assertEqual(self.publish()["published"], 1)
        self.assertEqual(SL.fetch_update(self.cfg, opener=self.web)["result"], "unchanged")
        # suspend on the hub → publish → the server goes read-only with the right reason
        licensing.suspend(self.hub, self.kid, self.priv, self.iid, reason="insoluto")
        self.assertEqual(len(licensing.pending(self.hub.registry)), 1)
        self.publish()
        self.assertEqual(licensing.pending(self.hub.registry), [])
        r = SL.fetch_update(self.cfg, opener=self.web)
        self.assertEqual((r["result"], r["mode"]), ("installed", "read_only"))
        st = SL.evaluate(str(self.data), SL.trusted_keys(self.cfg))
        self.assertEqual(st.reasons, ["suspended"])
        self.assertIn("sospesa", st.message_it)
        # the old, longer licence cannot be put back (channel or CLI), unless --force
        old = self.data / "old.docmap-licence"
        old.write_text(first["text"], "utf-8")
        st2, why = SL.check_candidate(str(self.data), first["text"].encode(), SL.trusted_keys(self.cfg))
        self.assertIn("più vecchia", why)
        cli = [sys.executable, "-m", "docmap_server", "licence", "install", str(old), "--config", str(self.cfgfile)]
        r2 = subprocess.run(cli, cwd=PYROOT, capture_output=True, text=True)
        self.assertEqual(r2.returncode, 1, r2.stdout)
        # reactivate + new limits → published → the server is writable again with the new limits
        licensing.reactivate(self.hub, self.kid, self.priv, self.iid)
        licensing.modify(self.hub, self.kid, self.priv, self.iid, limits={"binders": 900})
        self.publish()
        r = SL.fetch_update(self.cfg, opener=self.web)
        self.assertEqual((r["result"], r["mode"]), ("installed", "full"))
        self.assertEqual(SL.evaluate(str(self.data), SL.trusted_keys(self.cfg)).limits["binders"], 900)
        r3 = subprocess.run(cli + ["--force"], cwd=PYROOT, capture_output=True, text=True)
        self.assertEqual(r3.returncode, 0, r3.stdout + r3.stderr)

    def test_wrong_or_broken_files_are_never_installed(self):
        self.install_first()
        other = self.hub.registry.add_instance(self.hub.registry.list_customers()[0]["id"], "Altro")["id"]
        res = self.hub.issue_with_key(self.kid, self.priv, other, "studio")
        url = SL.update_url(self.cfg)
        folder = self.site / "licenze"
        folder.mkdir()
        (folder / url.rsplit("/", 1)[1]).write_text(res["text"], "utf-8")       # another installation's licence
        self.assertEqual(SL.fetch_update(self.cfg, opener=self.web)["result"], "unchanged")
        (folder / url.rsplit("/", 1)[1]).write_text(res["text"].replace("studio", "studia", 1), "utf-8")
        self.assertEqual(SL.fetch_update(self.cfg, opener=self.web)["result"], "unchanged")
        (folder / url.rsplit("/", 1)[1]).unlink()
        self.assertEqual(SL.fetch_update(self.cfg, opener=self.web)["result"], "error")   # offline / 404: retried later
        self.assertEqual(SL.evaluate(str(self.data), SL.trusted_keys(self.cfg)).mode, "full")

    def test_old_verifier_compatibility(self):
        """A suspended licence is also already expired with no grace: a verifier ignoring 'status' says read-only."""
        self.install_first()
        res = licensing.suspend(self.hub, self.kid, self.priv, self.iid)
        lic = dict(res["licence"])
        lic.pop("status")
        from docmap_hub import licence as L
        self.assertEqual(lic["grace_days"], 0)
        self.assertLess(L.parse_time(lic["expires_at"]), L.utcnow())


if __name__ == "__main__":
    unittest.main(verbosity=2)
