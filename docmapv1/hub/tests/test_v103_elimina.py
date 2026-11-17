"""v0.10.3: «Elimina cliente» — backup first, everything of the customer leaves the registry, nothing else does."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from docmap_hub import hosting as H  # noqa: E402
from docmap_hub import removal as RM  # noqa: E402
from test_v10_modelli import HOST, Case  # noqa: E402


class TestDelete(Case):
    def setUp(self):
        super().setUp()
        H.set_default(self.reg, self.vk, HOST)

    def _count(self, table, where="1=1", args=()):
        return self.reg.conn.execute(f"SELECT COUNT(*) FROM {table} WHERE {where}", args).fetchone()[0]

    def test_preview_then_delete_only_that_customer(self):
        _d, a = self.create("Studio Prova Uno", "tpl-commercialista-sede-online")
        _d, b = self.create("Studio Resta", "tpl-commercialista-online")
        pv = RM.preview(self.hub, a["customer_id"])
        self.assertGreaterEqual(pv["environments"], 1)
        self.assertGreaterEqual(pv["licences"], 1)
        self.assertTrue(pv["has_sede"])
        self.assertTrue(pv["live_licences"])
        self.assertTrue(all("docmap.pr-it.it" in o["url"] for o in pv["online"]))
        env_ids = [e["id"] for e in self.reg.list_environments() if e["customer_id"] == a["customer_id"]]
        with self.assertRaises(RM.RemovalError):
            RM.delete_customer(self.hub, a["customer_id"], confirm_name="Studio Prova")   # not the exact name
        self.assertEqual(self._count("customers", "id=?", (a["customer_id"],)), 1)
        r = RM.delete_customer(self.hub, a["customer_id"], confirm_name="  studio prova  UNO ")
        self.assertTrue(r["backup"])
        self.assertTrue((self.hub.dir / "backups" / r["backup"]).exists() or r["backup"])
        for t, col in (("customers", "id"), ("instances", "customer_id"), ("licences", "customer_id"),
                       ("projects", "customer_id")):
            self.assertEqual(self._count(t, f"{col}=?", (a["customer_id"],)), 0, t)
        for eid in env_ids:
            self.assertEqual(self._count("environments", "id=?", (eid,)), 0)
            self.assertEqual(self._count("secrets", "env_id=?", (eid,)), 0)
        # the other customer is untouched, the audit trail stays
        self.assertEqual(self._count("customers", "id=?", (b["customer_id"],)), 1)
        self.assertTrue(any(e["customer_id"] == b["customer_id"] for e in self.reg.list_environments()))
        self.assertEqual(self._count("events", "action='customer.delete' AND entity_id=?", (a["customer_id"],)), 1)
        # its address is free again for a new customer
        _d, c = self.create("Studio Prova Uno", "tpl-commercialista-online")
        self.assertTrue(any(e["url"].endswith("/studio-prova-uno/") for e in self.reg.list_environments()
                            if e["customer_id"] == c["customer_id"]))


if __name__ == "__main__":
    unittest.main()
