"""SQLite registry of the hub: resellers, customers, instances, issued
licences and an append-only audit log (events).

Migrations are additive only (never drop a column or table) and recorded in
``meta.schema_version``. Running :func:`Registry.migrate` again is a no-op.
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from .licence import format_time

DB_NAME = "registry.sqlite3"

MIGRATIONS: list[tuple[int, list[str]]] = [
    (1, [
        """CREATE TABLE IF NOT EXISTS resellers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            vat_id TEXT,
            email TEXT,
            branding_json TEXT,
            notes TEXT,
            created_at TEXT NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS customers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            vat_id TEXT,
            email TEXT,
            reseller_id TEXT REFERENCES resellers(id),
            notes TEXT,
            created_at TEXT NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS instances (
            id TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL REFERENCES customers(id),
            label TEXT,
            kind TEXT NOT NULL DEFAULT 'onprem',
            notes TEXT,
            created_at TEXT NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS licences (
            id TEXT PRIMARY KEY,
            instance_id TEXT NOT NULL REFERENCES instances(id),
            customer_id TEXT NOT NULL REFERENCES customers(id),
            plan TEXT NOT NULL,
            key_id TEXT NOT NULL,
            issued_at TEXT NOT NULL,
            valid_from TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            supersedes TEXT,
            licence_json TEXT NOT NULL,
            file_text TEXT NOT NULL
        )""",
        "CREATE INDEX IF NOT EXISTS ix_licences_instance ON licences(instance_id, expires_at)",
        """CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            at TEXT NOT NULL,
            action TEXT NOT NULL,
            entity TEXT,
            entity_id TEXT,
            details_json TEXT
        )""",
    ]),
    # Future migrations: append (2, ["ALTER TABLE ... ADD COLUMN ..."]) here.
]
SCHEMA_VERSION = MIGRATIONS[-1][0]


class RegistryError(Exception):
    """Error with an Italian message for the user."""


def _now() -> str:
    return format_time(datetime.now(timezone.utc))


def _row(r: sqlite3.Row | None) -> dict | None:
    return dict(r) if r is not None else None


class Registry:
    def __init__(self, data_dir: Path):
        self.path = Path(data_dir) / DB_NAME
        self.path.parent.mkdir(parents=True, exist_ok=True)
        # check_same_thread=False: the web page serves requests one at a time from a
        # worker thread; access stays serialised.
        self.conn = sqlite3.connect(str(self.path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")
        self.migrate()

    def close(self) -> None:
        self.conn.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    # -- schema ------------------------------------------------------------
    def schema_version(self) -> int:
        self.conn.execute("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)")
        r = self.conn.execute("SELECT value FROM meta WHERE key='schema_version'").fetchone()
        return int(r[0]) if r else 0

    def migrate(self) -> int:
        current = self.schema_version()
        for version, stmts in MIGRATIONS:
            if version <= current:
                continue
            with self.conn:
                for sql in stmts:
                    self.conn.execute(sql)
                self.conn.execute(
                    "INSERT INTO meta(key, value) VALUES('schema_version', ?) "
                    "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (str(version),))
            current = version
        self.conn.commit()
        return current

    # -- audit log ---------------------------------------------------------
    def log(self, action: str, entity: str | None = None, entity_id: str | None = None,
            details: Any = None, commit: bool = True) -> None:
        self.conn.execute(
            "INSERT INTO events(at, action, entity, entity_id, details_json) VALUES(?,?,?,?,?)",
            (_now(), action, entity, entity_id,
             json.dumps(details, ensure_ascii=False, sort_keys=True) if details is not None else None))
        if commit:
            self.conn.commit()

    def events(self, limit: int = 50) -> list[dict]:
        return [dict(r) for r in self.conn.execute(
            "SELECT * FROM events ORDER BY id DESC LIMIT ?", (limit,))]

    # -- lookup helpers ----------------------------------------------------
    def _find(self, table: str, ref: str, label: str) -> dict:
        """Find by exact id, unique id prefix, or exact name (case-insensitive)."""
        ref = (ref or "").strip()
        if not ref:
            raise RegistryError(f"Specifica {label}.")
        r = self.conn.execute(f"SELECT * FROM {table} WHERE id=?", (ref,)).fetchone()
        if r:
            return dict(r)
        rows = self.conn.execute(f"SELECT * FROM {table} WHERE id LIKE ?", (ref + "%",)).fetchall()
        if len(rows) == 1:
            return dict(rows[0])
        if len(rows) > 1:
            raise RegistryError(f"Identificativo ambiguo per {label}: '{ref}'. Usa più caratteri.")
        name_col = "label" if table == "instances" else "name"
        if table != "licences":
            rows = self.conn.execute(
                f"SELECT * FROM {table} WHERE lower({name_col})=lower(?)", (ref,)).fetchall()
            if len(rows) == 1:
                return dict(rows[0])
            if len(rows) > 1:
                raise RegistryError(f"Più elementi con il nome '{ref}' per {label}: usa l'identificativo.")
        raise RegistryError(f"{label.capitalize()} non trovato: '{ref}'.")

    # -- resellers ---------------------------------------------------------
    def add_reseller(self, name: str, vat_id: str | None = None, email: str | None = None,
                     branding: dict | None = None, notes: str | None = None) -> dict:
        if not (name or "").strip():
            raise RegistryError("Il nome del rivenditore è obbligatorio.")
        rid = "res-" + uuid.uuid4().hex[:12]
        with self.conn:
            self.conn.execute(
                "INSERT INTO resellers(id,name,vat_id,email,branding_json,notes,created_at) VALUES(?,?,?,?,?,?,?)",
                (rid, name.strip(), vat_id, email,
                 json.dumps(branding, ensure_ascii=False, sort_keys=True) if branding else None, notes, _now()))
            self.log("reseller.add", "reseller", rid, {"name": name, "branding": branding}, commit=False)
        return self.get_reseller(rid)

    def get_reseller(self, ref: str) -> dict:
        r = self._find("resellers", ref, "rivenditore")
        r["branding"] = json.loads(r["branding_json"]) if r.get("branding_json") else None
        return r

    def list_resellers(self) -> list[dict]:
        out = []
        for r in self.conn.execute("SELECT * FROM resellers ORDER BY name COLLATE NOCASE"):
            d = dict(r)
            d["branding"] = json.loads(d["branding_json"]) if d.get("branding_json") else None
            out.append(d)
        return out

    # -- customers ---------------------------------------------------------
    def add_customer(self, name: str, vat_id: str | None = None, email: str | None = None,
                     reseller: str | None = None, notes: str | None = None) -> dict:
        if not (name or "").strip():
            raise RegistryError("Il nome del cliente è obbligatorio.")
        reseller_id = self.get_reseller(reseller)["id"] if reseller else None
        cid = "cus-" + uuid.uuid4().hex[:12]
        with self.conn:
            self.conn.execute(
                "INSERT INTO customers(id,name,vat_id,email,reseller_id,notes,created_at) VALUES(?,?,?,?,?,?,?)",
                (cid, name.strip(), vat_id, email, reseller_id, notes, _now()))
            self.log("customer.add", "customer", cid,
                     {"name": name, "vat_id": vat_id, "reseller_id": reseller_id}, commit=False)
        return self.get_customer(cid)

    def get_customer(self, ref: str) -> dict:
        return self._find("customers", ref, "cliente")

    def list_customers(self) -> list[dict]:
        return [dict(r) for r in self.conn.execute(
            "SELECT c.*, r.name AS reseller_name FROM customers c "
            "LEFT JOIN resellers r ON r.id=c.reseller_id ORDER BY c.name COLLATE NOCASE")]

    # -- instances ---------------------------------------------------------
    def add_instance(self, customer: str, label: str | None = None, kind: str = "onprem",
                     instance_id: str | None = None, notes: str | None = None) -> dict:
        cust = self.get_customer(customer)
        if kind not in ("onprem", "cloud", "appliance"):
            raise RegistryError("Tipo di installazione non valido (onprem, cloud, appliance).")
        iid = (instance_id or "").strip() or str(uuid.uuid4())
        if self.conn.execute("SELECT 1 FROM instances WHERE id=?", (iid,)).fetchone():
            raise RegistryError(f"Installazione già registrata: {iid}")
        with self.conn:
            self.conn.execute(
                "INSERT INTO instances(id,customer_id,label,kind,notes,created_at) VALUES(?,?,?,?,?,?)",
                (iid, cust["id"], label or cust["name"], kind, notes, _now()))
            self.log("instance.add", "instance", iid,
                     {"customer_id": cust["id"], "label": label, "kind": kind}, commit=False)
        return self.get_instance(iid)

    def get_instance(self, ref: str) -> dict:
        return self._find("instances", ref, "installazione")

    def list_instances(self, customer: str | None = None) -> list[dict]:
        sql = ("SELECT i.*, c.name AS customer_name, "
               "(SELECT l.expires_at FROM licences l WHERE l.instance_id=i.id "
               " ORDER BY l.expires_at DESC, l.issued_at DESC LIMIT 1) AS licence_expires_at "
               "FROM instances i JOIN customers c ON c.id=i.customer_id")
        args: tuple = ()
        if customer:
            sql += " WHERE i.customer_id=?"
            args = (self.get_customer(customer)["id"],)
        sql += " ORDER BY c.name COLLATE NOCASE, i.label COLLATE NOCASE"
        return [dict(r) for r in self.conn.execute(sql, args)]

    # -- licences ----------------------------------------------------------
    def add_licence(self, lic: dict, file_text: str, supersedes: str | None = None) -> dict:
        inst = self.get_instance(lic["instance_id"])
        with self.conn:
            self.conn.execute(
                "INSERT INTO licences(id,instance_id,customer_id,plan,key_id,issued_at,valid_from,expires_at,"
                "supersedes,licence_json,file_text) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (lic["licence_id"], inst["id"], inst["customer_id"], lic["plan"], lic["key_id"],
                 lic["issued_at"], lic["valid_from"], lic["expires_at"], supersedes,
                 json.dumps(lic, ensure_ascii=False, sort_keys=True), file_text))
            self.log("licence.renew" if supersedes else "licence.issue", "licence", lic["licence_id"],
                     {"instance_id": inst["id"], "plan": lic["plan"], "expires_at": lic["expires_at"],
                      "supersedes": supersedes, "key_id": lic["key_id"]}, commit=False)
        return self.get_licence(lic["licence_id"])

    def get_licence(self, ref: str) -> dict:
        d = self._find("licences", ref, "licenza")
        d["licence"] = json.loads(d["licence_json"])
        return d

    def latest_licence(self, instance: str) -> dict | None:
        iid = self.get_instance(instance)["id"]
        r = self.conn.execute(
            "SELECT id FROM licences WHERE instance_id=? ORDER BY expires_at DESC, issued_at DESC LIMIT 1",
            (iid,)).fetchone()
        return self.get_licence(r[0]) if r else None

    def list_licences(self, instance: str | None = None) -> list[dict]:
        sql = ("SELECT l.id, l.instance_id, l.customer_id, l.plan, l.key_id, l.issued_at, l.valid_from, "
               "l.expires_at, l.supersedes, c.name AS customer_name, i.label AS instance_label "
               "FROM licences l JOIN customers c ON c.id=l.customer_id JOIN instances i ON i.id=l.instance_id")
        args: Iterable = ()
        if instance:
            sql += " WHERE l.instance_id=?"
            args = (self.get_instance(instance)["id"],)
        sql += " ORDER BY l.expires_at DESC, l.issued_at DESC"
        return [dict(r) for r in self.conn.execute(sql, tuple(args))]
