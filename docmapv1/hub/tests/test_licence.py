import base64
import json
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from docmap_hub import licence as L

T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)


def make_licence(key_id="k1", **over):
    lic = {
        "licence_id": "0b5c2f9e-1111-4222-8333-444455556666",
        "format": 1,
        "customer": {"name": "Studio Rossi è Associati", "vat_id": "IT01234567890"},
        "instance_id": "inst-1",
        "plan": "studio",
        "issued_at": "2026-01-01T00:00:00Z",
        "valid_from": "2026-01-01T00:00:00Z",
        "expires_at": "2027-01-01T00:00:00Z",
        "grace_days": 30,
        "limits": {"users": 5, "binders": 100, "archives": None},
        "features": ["mobile_scan", "sync_server"],
        "reseller": None,
        "branding": None,
        "key_id": key_id,
    }
    lic.update(over)
    return lic


class Base(unittest.TestCase):
    def setUp(self):
        self.priv = Ed25519PrivateKey.generate()
        self.pub_raw = self.priv.public_key().public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        self.keys = {"k1": self.pub_raw}

    def signed(self, **over) -> bytes:
        return L.encode_licence_file(L.sign_licence(make_licence(**over), self.priv))


class TestCanonical(unittest.TestCase):
    def test_sorted_compact_utf8(self):
        self.assertEqual(L.canonical_json({"b": 1, "a": {"d": [1, 2], "c": "è"}}),
                         '{"a":{"c":"è","d":[1,2]},"b":1}'.encode("utf-8"))

    def test_stable_regardless_of_insertion_order(self):
        a = make_licence()
        b = dict(reversed(list(make_licence().items())))
        self.assertEqual(L.canonical_json(a), L.canonical_json(b))

    def test_golden_value(self):
        # Pin the exact bytes so that any implementation (server, other
        # languages) can check its canonicalisation against this.
        self.assertEqual(L.canonical_json({"z": None, "a": True, "m": [3, "x"]}), b'{"a":true,"m":[3,"x"],"z":null}')

    def test_floats_rejected(self):
        with self.assertRaises(L.LicenceError):
            L.canonical_json({"a": 1.5})


class TestSignVerify(Base):
    def test_roundtrip_full(self):
        st = L.verify(self.signed(), self.keys, now=T0 + timedelta(days=10))
        self.assertEqual(st.mode, L.MODE_FULL)
        self.assertTrue(st.writable and st.signature_ok)
        self.assertEqual(st.days_left, 355)
        self.assertEqual(st.reasons, [L.R_OK])
        self.assertTrue(st.has_feature("sync_server"))
        self.assertFalse(st.has_feature("white_label"))
        self.assertEqual(st.licence["customer"]["name"], "Studio Rossi è Associati")

    def test_accepts_str_and_base64_and_pem_keys(self):
        pem = self.priv.public_key().public_bytes(serialization.Encoding.PEM,
                                                  serialization.PublicFormat.SubjectPublicKeyInfo)
        for k in (base64.b64encode(self.pub_raw).decode(), pem, self.priv.public_key()):
            st = L.verify(self.signed().decode("utf-8"), {"k1": k}, now=T0)
            self.assertEqual(st.mode, L.MODE_FULL)

    def test_file_is_readable_json(self):
        obj = json.loads(self.signed())
        self.assertEqual(set(obj), {"format", "key_id", "licence", "signature"})
        self.assertEqual(obj["key_id"], "k1")

    def test_bom_tolerated(self):
        st = L.verify(b"\xef\xbb\xbf" + self.signed(), self.keys, now=T0)
        self.assertEqual(st.mode, L.MODE_FULL)

    def test_reformatting_does_not_break_signature(self):
        obj = json.loads(self.signed())
        text = json.dumps(obj, indent=None)  # different whitespace/ordering
        self.assertEqual(L.verify(text, self.keys, now=T0).mode, L.MODE_FULL)


class TestTampering(Base):
    def test_changed_field(self):
        obj = json.loads(self.signed())
        obj["licence"]["limits"]["users"] = 500
        st = L.verify(json.dumps(obj), self.keys, now=T0)
        self.assertEqual(st.mode, L.MODE_INVALID)
        self.assertEqual(st.reasons, [L.R_BAD_SIGNATURE])
        self.assertFalse(st.writable)
        self.assertEqual(st.features, frozenset())
        self.assertEqual(st.limits, {})

    def test_extended_expiry(self):
        obj = json.loads(self.signed())
        obj["licence"]["expires_at"] = "2099-01-01T00:00:00Z"
        self.assertEqual(L.verify(json.dumps(obj), self.keys, now=T0).mode, L.MODE_INVALID)

    def test_added_field(self):
        obj = json.loads(self.signed())
        obj["licence"]["extra"] = 1
        self.assertEqual(L.verify(json.dumps(obj), self.keys, now=T0).reasons, [L.R_BAD_SIGNATURE])

    def test_bad_signature_encoding(self):
        obj = json.loads(self.signed())
        obj["signature"] = "!!!notbase64"
        self.assertEqual(L.verify(json.dumps(obj), self.keys, now=T0).mode, L.MODE_INVALID)

    def test_signed_by_other_key_same_id(self):
        other = Ed25519PrivateKey.generate()
        text = L.encode_licence_file(L.sign_licence(make_licence(), other))
        self.assertEqual(L.verify(text, self.keys, now=T0).reasons, [L.R_BAD_SIGNATURE])

    def test_key_id_mismatch(self):
        obj = json.loads(self.signed())
        obj["key_id"] = "k2"
        st = L.verify(json.dumps(obj), {"k1": self.pub_raw, "k2": self.pub_raw}, now=T0)
        self.assertEqual(st.reasons, [L.R_KEY_MISMATCH])

    def test_unknown_key(self):
        st = L.verify(self.signed(key_id="k9"), self.keys, now=T0)
        self.assertEqual(st.mode, L.MODE_INVALID)
        self.assertEqual(st.reasons, [L.R_UNKNOWN_KEY])

    def test_garbage_and_missing(self):
        self.assertEqual(L.verify(b"\x00\xffnot json", self.keys).reasons, [L.R_BAD_FILE])
        self.assertEqual(L.verify(b"[1,2]", self.keys).reasons, [L.R_BAD_FILE])
        self.assertEqual(L.verify(None, self.keys).reasons, [L.R_MISSING])
        self.assertEqual(L.verify(b"   ", self.keys).reasons, [L.R_MISSING])
        self.assertEqual(L.missing().mode, L.MODE_INVALID)

    def test_unsupported_format(self):
        obj = json.loads(self.signed())
        obj["format"] = 2
        self.assertEqual(L.verify(json.dumps(obj), self.keys, now=T0).reasons, [L.R_BAD_FORMAT])

    def test_instance_mismatch(self):
        st = L.verify(self.signed(), self.keys, now=T0, instance_id="other")
        self.assertEqual(st.reasons, [L.R_INSTANCE_MISMATCH])
        self.assertEqual(L.verify(self.signed(), self.keys, now=T0, instance_id="inst-1").mode, L.MODE_FULL)

    def test_sign_rejects_bad_fields(self):
        with self.assertRaises(L.LicenceError):
            L.sign_licence(make_licence(expires_at="2025-01-01T00:00:00Z"), self.priv)
        bad = make_licence()
        del bad["customer"]
        with self.assertRaises(L.LicenceError):
            L.sign_licence(bad, self.priv)


class TestExpiry(Base):
    EXP = datetime(2027, 1, 1, tzinfo=timezone.utc)

    def mode_at(self, t, **over):
        return L.verify(self.signed(**over), self.keys, now=t)

    def test_boundaries(self):
        s = timedelta(seconds=1)
        self.assertEqual(self.mode_at(self.EXP - s).mode, L.MODE_FULL)
        st = self.mode_at(self.EXP)
        self.assertEqual(st.mode, L.MODE_GRACE)
        self.assertEqual(st.grace_days_left, 30)
        st = self.mode_at(self.EXP + timedelta(days=30) - s)
        self.assertEqual(st.mode, L.MODE_GRACE)
        self.assertTrue(st.writable)
        st = self.mode_at(self.EXP + timedelta(days=30))
        self.assertEqual(st.mode, L.MODE_READ_ONLY)
        self.assertFalse(st.writable)
        self.assertEqual(st.reasons, [L.R_EXPIRED])
        # read_only still exposes features/branding (genuine licence)
        self.assertTrue(st.has_feature("mobile_scan"))

    def test_days_left_and_warning(self):
        st = self.mode_at(self.EXP - timedelta(days=10, hours=12))
        self.assertEqual(st.mode, L.MODE_FULL)
        self.assertEqual(st.days_left, 11)
        self.assertTrue(st.expiring_soon and st.show_banner)
        self.assertIn("11 giorni", st.message_it)
        st = self.mode_at(self.EXP - timedelta(days=200))
        self.assertFalse(st.expiring_soon or st.show_banner)
        st = self.mode_at(self.EXP + timedelta(days=5))
        self.assertEqual(st.days_left, -5)
        self.assertEqual(st.grace_days_left, 25)
        self.assertIn("25 giorni", st.message_it)

    def test_zero_grace(self):
        self.assertEqual(self.mode_at(self.EXP, grace_days=0).mode, L.MODE_READ_ONLY)

    def test_not_yet_valid_with_clock_skew(self):
        over = dict(valid_from="2026-06-01T00:00:00Z")
        vf = datetime(2026, 6, 1, tzinfo=timezone.utc)
        self.assertEqual(self.mode_at(vf - timedelta(hours=23), **over).mode, L.MODE_FULL)
        st = self.mode_at(vf - timedelta(days=3), **over)
        self.assertEqual(st.mode, L.MODE_READ_ONLY)
        self.assertEqual(st.reasons, [L.R_NOT_YET_VALID])

    def test_naive_now_is_utc(self):
        self.assertEqual(L.verify(self.signed(), self.keys, now=datetime(2026, 5, 1)).mode, L.MODE_FULL)


class TestLimits(Base):
    def test_within_and_over(self):
        st = L.verify(self.signed(), self.keys, now=T0)
        r = L.check_limits(st, {"users": 3, "binders": 100, "archives": 999})
        self.assertTrue(r.ok)
        self.assertEqual(r.at_limit, ["binders"])
        self.assertTrue(r.can_add("users"))
        self.assertFalse(r.can_add("binders"))
        self.assertTrue(r.can_add("archives"))  # None = unlimited
        r = L.check_limits(st, {"users": 6})
        self.assertFalse(r.ok)
        self.assertEqual(r.exceeded, {"users": {"used": 6, "limit": 5}})

    def test_read_only_blocks_adding(self):
        st = L.verify(self.signed(), self.keys, now=datetime(2030, 1, 1, tzinfo=timezone.utc))
        r = L.check_limits(st, {"users": 1})
        self.assertFalse(r.ok)
        self.assertFalse(r.can_add("users"))
        inv = L.verify(None, self.keys)
        self.assertFalse(L.check_limits(inv, {"binders": 0}).can_add("binders"))


class TestStandalone(unittest.TestCase):
    def test_imports_only_stdlib_and_cryptography(self):
        import ast
        with open(L.__file__, encoding="utf-8") as fh:
            src = fh.read()
        mods = set()
        for node in ast.walk(ast.parse(src)):
            if isinstance(node, ast.Import):
                mods |= {a.name.split(".")[0] for a in node.names}
            elif isinstance(node, ast.ImportFrom):
                self.assertEqual(node.level, 0, "no relative imports in licence.py")
                mods.add(node.module.split(".")[0])
        allowed = {"__future__", "base64", "binascii", "json", "math", "dataclasses", "datetime",
                   "typing", "cryptography"}
        self.assertLessEqual(mods, allowed)

    def test_to_dict_is_json(self):
        json.dumps(L.verify(None, {}).to_dict())


if __name__ == "__main__":
    unittest.main()
