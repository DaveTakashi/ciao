import base64
import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from cryptography.hazmat.primitives import serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey  # noqa: E402

from docmap_strumenti import licence_verify as L  # noqa: E402
from docmap_strumenti import licensing as LI  # noqa: E402
from docmap_strumenti import settings as S  # noqa: E402
from test_jobs_server import Srv, write_inputs  # noqa: E402

HUB_FILE = Path(__file__).resolve().parents[2] / "hub" / "docmap_hub" / "licence.py"
NOW = datetime(2026, 11, 24, 12, 0, tzinfo=timezone.utc)


def keypair(kid="dmk-test-1"):
    k = Ed25519PrivateKey.generate()
    pub = base64.b64encode(k.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)).decode()
    return kid, k, pub


def licence(kid, key, *, instance="inst-a", features=("strumenti",), credits=5, issued=None, valid_from=None,
            expires=None, grace=30, status=None):
    issued = issued or NOW - timedelta(days=1)
    lic = {"licence_id": "lic-" + instance + "-" + issued.strftime("%H%M%S%f"), "format": 1, "customer": {"name": "Studio Prova"},
           "instance_id": instance, "plan": "studio", "issued_at": L.format_time(issued),
           "valid_from": L.format_time(valid_from or NOW - timedelta(days=2)),
           "expires_at": L.format_time(expires or NOW + timedelta(days=300)), "grace_days": grace,
           "limits": {"users": 5, "strumenti_credits": credits}, "features": list(features), "reseller": None,
           "branding": None, "key_id": kid}
    if status:
        lic["status"] = status
    return L.encode_licence_file(L.sign_licence(lic, key))


class LicenceTest(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.d = Path(self.td.name)
        self.kid, self.key, self.pub = keypair()
        S.save(self.d, {"licence": {"public_keys": {self.kid: self.pub}}})
        self.s = S.load(self.d)

    def tearDown(self):
        self.td.cleanup()

    def test_verifier_is_a_byte_identical_copy_of_the_hub(self):
        if not HUB_FILE.is_file():
            self.skipTest("hub folder not present")
        self.assertEqual(HUB_FILE.read_bytes(), (Path(LI.__file__).with_name("licence_verify.py")).read_bytes(),
                         "re-copy hub/docmap_hub/licence.py to strumenti/docmap_strumenti/licence_verify.py")
        self.assertIn("strumenti_credits", L.LIMIT_KEYS)
        self.assertIn("strumenti_remote", L.KNOWN_FEATURES)

    def test_without_licence_nothing_changes(self):
        e = LI.entitlements(self.d, self.s, NOW)
        self.assertEqual((e["enforced"], e["can_run"], e["modes"]), (False, True, ["local", "remote"]))
        S.save(self.d, {"licence": {"required": True}})
        e = LI.entitlements(self.d, S.load(self.d), NOW)
        self.assertEqual((e["enforced"], e["can_run"], e["modes"]), (True, False, []))
        self.assertIn("nessun lavoro nuovo", e["message"])

    def test_plan_decides_modes_and_credits(self):
        LI.install(self.d, self.s, licence(self.kid, self.key, credits=5), now=NOW)
        e = LI.entitlements(self.d, self.s, NOW)
        self.assertEqual((e["enforced"], e["can_run"], e["modes"], e["credits_month"]), (True, True, ["local"], 5))
        self.assertEqual(e["licence"]["plan"], "studio")
        S.save(self.d, {"credits": {"local_month": 3}})            # the studio may set a lower cap of its own
        self.assertEqual(LI.entitlements(self.d, S.load(self.d), NOW)["credits_month"], 3)
        LI.install(self.d, self.s, licence(self.kid, self.key, features=("strumenti", "strumenti_remote"), credits=None), now=NOW)
        e = LI.entitlements(self.d, S.load(self.d), NOW)
        self.assertEqual((e["modes"], e["credits_month"]), (["local", "remote"], 3))
        eff = S.effective(self.d)
        self.assertEqual(eff["licence"]["modes"], e["modes"])

    def test_blocked_cases(self):
        LI.install(self.d, self.s, licence(self.kid, self.key, features=("mobile_scan",)), now=NOW)
        e = LI.entitlements(self.d, self.s, NOW)
        self.assertFalse(e["can_run"])
        self.assertIn("non comprende gli Strumenti", e["message"])
        LI.install(self.d, self.s, licence(self.kid, self.key, issued=NOW - timedelta(hours=1), status="suspended",
                                           expires=NOW - timedelta(days=1), grace=0), now=NOW)
        e = LI.entitlements(self.d, self.s, NOW)
        self.assertEqual((e["can_run"], e["mode"]), (False, "read_only"))
        self.assertIn("sospesa", e["message"])

    def test_install_refuses_bad_files(self):
        with self.assertRaisesRegex(LI.LicenceInstallError, "chiave sconosciuta"):
            kid2, k2, _ = keypair("dmk-altro")
            LI.install(self.d, self.s, licence(kid2, k2), now=NOW)
        good = licence(self.kid, self.key)
        bad = json.loads(good)
        bad["licence"]["limits"]["strumenti_credits"] = 999999
        with self.assertRaisesRegex(LI.LicenceInstallError, "Firma"):
            LI.install(self.d, self.s, json.dumps(bad).encode(), now=NOW)
        LI.install(self.d, self.s, good, now=NOW)
        with self.assertRaisesRegex(LI.LicenceInstallError, "altra installazione"):
            LI.install(self.d, self.s, licence(self.kid, self.key, instance="inst-b"), now=NOW)
        with self.assertRaisesRegex(LI.LicenceInstallError, "più vecchia"):
            LI.install(self.d, self.s, licence(self.kid, self.key, issued=NOW - timedelta(days=9)), now=NOW)
        LI.install(self.d, self.s, licence(self.kid, self.key, instance="inst-b"), force=True, now=NOW)
        self.assertEqual(LI.instance_id(self.d), "inst-b")


class LicenceServerTest(unittest.TestCase):
    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.d = Path(self.td.name)
        write_inputs(self.d / "in")
        self.kid, self.key, self.pub = keypair()
        S.save(self.d / "dati", {"licence": {"public_keys": {self.kid: self.pub}}})
        self.s = Srv(self.d / "dati")

    def tearDown(self):
        self.s.close()
        self.td.cleanup()

    def job(self, run_on="local"):
        rec = {"name": "lic", "steps": [{"block": "ocr", "with": {"engine": "text"}}], "input": {"patterns": ["*.txt"]}}
        return self.s.call("/api/jobs", {"recipe": rec, "input_dir": str(self.d / "in"), "output_dir": str(self.d / "out"), "run_on": run_on})

    def test_licence_route_and_gates(self):
        self.assertEqual(self.s.call("/api/licence")[1]["licence"]["enforced"], False)
        st, r = self.s.call("/api/licence", licence(self.kid, self.key, features=("mobile_scan",)))
        self.assertEqual(st, 200, r)
        self.assertFalse(r["licence"]["can_run"])
        st, r = self.job()
        self.assertEqual(st, 403)
        self.assertIn("non comprende gli Strumenti", r["error"])
        self.assertEqual(self.s.call("/api/preview", {"recipe": {"name": "x", "steps": [{"block": "ocr"}]}, "sample_path": str(self.d / "in" / "a.txt")})[0], 403)
        self.assertEqual(self.s.call("/api/jobs")[0], 200)                       # results stay readable
        info = self.s.call("/api/info")[1]
        self.assertFalse(info["licence"]["can_run"])
        st, r = self.s.call("/api/licence", licence(self.kid, self.key, issued=NOW, credits=7))
        self.assertEqual((st, r["licence"]["can_run"], r["licence"]["credits_month"]), (200, True, 7))
        self.assertEqual(self.s.call("/api/info")[1]["credits"]["limit_month"], 7)
        self.assertEqual(self.job("remote")[0], 403)                             # plan without remote execution
        st, r = self.job()
        self.assertEqual(st, 200, r)
        self.assertEqual(self.s.call("/api/licence", b"{rotto")[0], 400)

    def test_token_update_for_the_hub(self):
        tok = self.s.call("/api/tokens", {"tenant": "inst-a", "credits_month": 100, "plan": "studio"})[1]["token"]
        st, r = self.s.call("/api/tokens", {"tenant": "inst-a", "update": True, "credits_month": 0, "plan": "studio_pro"})
        self.assertEqual((st, r["updated"]), (200, 1))
        t = [x for x in self.s.call("/api/tokens")[1]["tokens"] if x["tenant"] == "inst-a"][0]
        self.assertEqual((t["credits_month"], t["plan"]), (0, "studio_pro"))
        self.assertTrue(tok.startswith("dms_"))


if __name__ == "__main__":
    unittest.main()
