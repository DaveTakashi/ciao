#!/usr/bin/env python3
"""Trusted licence keys shipped with the code: docmap_server/trusted_keys.json (no code edit needed).

  python3 docmapv1/server-python/tests/test_trusted_keys.py

Keys and licences come from the REAL hub (docmapv1/hub) in a temp folder. Checks: the hub's export-public-key JSON is
accepted as is and makes a real licence `full` (licence.evaluate, the same path the API uses); a tampered / truncated /
oversized file is ignored safely (no exception, no keys, a log line); an invalid key (not base64, wrong length, bad key
id) is ignored with a log line while the valid keys in the same file still count; the constant wins over the file on
the same key id; the file is re-read when it changes.
"""
import json
import logging
import os
import shutil
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
PYROOT = os.path.dirname(HERE)
HUB = os.path.join(os.path.dirname(PYROOT), "hub")
sys.path.insert(0, PYROOT)
sys.path.insert(0, HUB)
sys.dont_write_bytecode = True

from docmap_server import licence as SL  # noqa: E402
from docmap_hub.service import Hub  # noqa: E402

PASS = "test passphrase"


class TrustedKeysFile(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.work = tempfile.mkdtemp(prefix="dm-trusted-")
        cls.hub = Hub(os.path.join(cls.work, "hub"))
        cls.hub.keys.generate(PASS)
        cls.export = cls.hub.keys.export("json")
        c = cls.hub.registry.add_customer("Studio Chiavi", "IT01234567890")
        cls.inst = cls.hub.registry.add_instance(c["id"], "sede")
        cls.lic = cls.hub.issue(PASS, cls.inst["id"], "studio")["text"]
        cls.data = os.path.join(cls.work, "data")
        os.makedirs(os.path.join(cls.data, "licence"))
        with open(SL.licence_path(cls.data), "w", encoding="utf-8") as f:
            f.write(cls.lic)

    @classmethod
    def tearDownClass(cls):
        cls.hub.close()
        trash = os.path.join(PYROOT, "_trash")
        os.makedirs(trash, exist_ok=True)
        shutil.move(cls.work, os.path.join(trash, "test-trusted-" + os.path.basename(cls.work)))

    def setUp(self):
        self.path = os.path.join(self.work, "trusted_keys-%s.json" % self.id().rsplit(".", 1)[-1])
        self._orig = SL.TRUSTED_KEYS_FILE
        SL.TRUSTED_KEYS_FILE = self.path
        SL.clear_cache()

    def tearDown(self):
        SL.TRUSTED_KEYS_FILE = self._orig
        SL.clear_cache()

    def write(self, text):
        with open(self.path, "w", encoding="utf-8") as f:
            f.write(text)
        st = os.stat(self.path)
        os.utime(self.path, ns=(st.st_atime_ns, st.st_mtime_ns + 1_000_000))   # force a new fingerprint

    def mode(self):
        cfg = {"data_dir": self.data, "licence_required": True}
        return SL.evaluate(self.data, SL.trusted_keys(cfg)).mode

    def test_default_location_is_the_code_folder(self):
        self.assertEqual(os.path.dirname(self._orig), os.path.dirname(os.path.abspath(SL.__file__)))
        self.assertEqual(os.path.basename(self._orig), "trusted_keys.json")

    def test_missing_file_no_keys_licence_invalid(self):
        self.assertEqual(SL.load_trusted_keys_file(), {})
        self.assertEqual(self.mode(), "invalid")

    def test_hub_export_makes_licence_full(self):
        self.write(self.export)
        keys = SL.trusted_keys({})
        self.assertEqual(set(keys), set(json.loads(self.export)["keys"]))
        self.assertEqual(self.mode(), "full")

    def test_tampered_json_ignored_safely(self):
        for bad in (self.export[:-20], "{not json", "[]", '{"keys": []}', "\xff\xfe garbage", ""):
            with self.subTest(bad=bad[:15]):
                self.write(bad)
                with self.assertLogs("docmap.licence", logging.WARNING) as cm:
                    self.assertEqual(SL.load_trusted_keys_file(), {})
                self.assertIn("ignored", "\n".join(cm.output))
                self.assertEqual(self.mode(), "invalid")

    def test_oversized_file_ignored(self):
        self.write(json.dumps({"keys": json.loads(self.export)["keys"], "pad": "x" * (SL.TRUSTED_KEYS_MAX_BYTES + 10)}))
        with self.assertLogs("docmap.licence", logging.WARNING):
            self.assertEqual(SL.load_trusted_keys_file(), {})

    def test_invalid_keys_ignored_valid_kept(self):
        good = json.loads(self.export)["keys"]
        obj = {"keys": dict(good)}
        obj["keys"]["k-notb64"] = "not base64 !!!"
        obj["keys"]["k-short"] = "AAAA"
        obj["keys"]["bad id with spaces"] = list(good.values())[0]
        obj["keys"]["k-number"] = 12345
        self.write(json.dumps(obj))
        with self.assertLogs("docmap.licence", logging.WARNING) as cm:
            keys = SL.load_trusted_keys_file()
        self.assertEqual(set(keys), set(good))
        self.assertEqual(len([l for l in cm.output if "ignored" in l]), 4)
        self.assertEqual(self.mode(), "full")

    def test_constant_wins_on_same_key_id(self):
        kid = next(iter(json.loads(self.export)["keys"]))
        other = Hub(os.path.join(self.work, "hub-other"))
        try:
            other.keys.generate(PASS)
            wrong = json.loads(other.keys.export("json"))["keys"]
        finally:
            other.close()
        self.write(json.dumps({"keys": {kid: list(wrong.values())[0]}}))   # attacker-ish file: same id, other key
        self.assertEqual(self.mode(), "invalid")
        saved = dict(SL.TRUSTED_LICENCE_KEYS)
        SL.TRUSTED_LICENCE_KEYS[kid] = json.loads(self.export)["keys"][kid]
        try:
            SL.clear_cache()
            self.assertEqual(self.mode(), "full")
        finally:
            SL.TRUSTED_LICENCE_KEYS.clear()
            SL.TRUSTED_LICENCE_KEYS.update(saved)

    def test_reread_after_change(self):
        self.write("{}")
        with self.assertLogs("docmap.licence", logging.WARNING):
            self.assertEqual(SL.load_trusted_keys_file(), {})
        self.write(self.export)
        self.assertEqual(len(SL.load_trusted_keys_file()), 1)

    def test_bom_accepted(self):
        self.write("﻿" + self.export)
        self.assertEqual(len(SL.load_trusted_keys_file()), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
