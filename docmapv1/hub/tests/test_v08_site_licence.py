"""App 26.12.6: a web-php site built by the hub carries the hub's public key and the installation's current licence,
so api.php can check the licence (setup.php turns licence_required on when trusted_keys.json is present)."""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from docmap_hub import deploy as DP
from docmap_hub import licence as L
from docmap_hub import licensing as LG
from docmap_hub.envs import EnvManager
from docmap_hub.service import Hub
from test_v04_manager import PASS


class TestSiteLicence(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.addCleanup(self._td.cleanup)
        self.hub = Hub(Path(self._td.name) / "hub")
        self.addCleanup(self.hub.close)
        self.hub.keys.generate(PASS)
        self.kid, self.priv = self.hub.keys.load_private(PASS)
        c = self.hub.registry.add_customer("Studio Sito")
        self.iid = self.hub.registry.add_instance(c["id"], "Online")["id"]
        self.env = EnvManager(self.hub).add_remote(self.iid, "production", "web-php", "https://example.invalid/studio-sito/",
                                                   studio_name="Studio Sito")

    def build(self):
        b = DP.build_for(self.hub, self.hub.registry.get_environment(self.env["id"]))
        self.addCleanup(b.cleanup)
        return b

    def test_without_licence_the_site_is_plain(self):
        b = self.build()
        self.assertFalse((b.dir / "server-php" / "trusted_keys.json").exists())
        self.assertNotIn("server-php/licence.docmap-licence", b.manifest)

    def test_site_carries_key_and_current_licence(self):
        self.hub.issue_with_key(self.kid, self.priv, self.iid, "studio")
        b1 = self.build()
        sp = b1.dir / "server-php"
        keys = json.loads((sp / "trusted_keys.json").read_text("utf-8"))["keys"]
        st = L.verify((sp / "licence.docmap-licence").read_bytes(), keys, instance_id=self.iid)
        self.assertEqual(st.mode, "full")
        self.assertIn("server-php/licence.docmap-licence", b1.manifest)
        # a suspension reaches the site with the next deploy, and does not change the code identity (promote check)
        LG.suspend(self.hub, self.kid, self.priv, self.iid)
        b2 = self.build()
        st2 = L.verify((b2.dir / "server-php" / "licence.docmap-licence").read_bytes(), keys, instance_id=self.iid)
        self.assertEqual(st2.reasons, ["suspended"])
        self.assertEqual(b1.code_hash, b2.code_hash)
        self.assertNotEqual(b1.manifest["server-php/licence.docmap-licence"], b2.manifest["server-php/licence.docmap-licence"])


if __name__ == "__main__":
    unittest.main()
