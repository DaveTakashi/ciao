"""SQLite registry of the hub: resellers, customers, instances, issued
licences and an append-only audit log (events).

Migrations are additive only (never drop a column or table) and recorded in
``meta.schema_version``. Running :func:`Registry.migrate` again is a no-op.
"""

from __future__ import annotations

import json
import re
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
    # v0.2: environments (production / staging / demo-*), port reservations, encrypted vault,
    # deploy history, hub settings, per-customer key escrow flag (default OFF).
    (2, [
        "ALTER TABLE customers ADD COLUMN key_escrow INTEGER NOT NULL DEFAULT 0",
        """CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )""",
        """CREATE TABLE IF NOT EXISTS environments (
            id TEXT PRIMARY KEY,
            instance_id TEXT NOT NULL REFERENCES instances(id),
            name TEXT NOT NULL,
            kind TEXT NOT NULL,
            url TEXT,
            api_url TEXT,
            port INTEGER,
            status TEXT NOT NULL DEFAULT 'new',
            app_version TEXT,
            deployed_version TEXT,
            verified_version TEXT,
            verified_code_hash TEXT,
            verified_at TEXT,
            last_check TEXT,
            last_check_json TEXT,
            last_deploy_at TEXT,
            last_backup_at TEXT,
            expires_at TEXT,
            settings_json TEXT,
            notes TEXT,
            created_at TEXT NOT NULL,
            UNIQUE(instance_id, name)
        )""",
        """CREATE TABLE IF NOT EXISTS port_reservations (
            port INTEGER PRIMARY KEY,
            env_id TEXT NOT NULL UNIQUE REFERENCES environments(id),
            reserved_at TEXT NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS secrets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            env_id TEXT NOT NULL REFERENCES environments(id),
            kind TEXT NOT NULL,
            label TEXT NOT NULL DEFAULT '',
            nonce BLOB NOT NULL,
            ciphertext BLOB NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(env_id, kind, label)
        )""",
        """CREATE TABLE IF NOT EXISTS deploys (
            id TEXT PRIMARY KEY,
            env_id TEXT NOT NULL,
            version TEXT,
            code_hash TEXT,
            dry_run INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL,
            started_at TEXT NOT NULL,
            finished_at TEXT,
            details_json TEXT
        )""",
    ]),
    # Future migrations: append (3, ["ALTER TABLE ... ADD COLUMN ..."]) here.
]
SCHEMA_VERSION = MIGRATIONS[-1][0]


ENV_KINDS = ("web-php", "local-python", "studio-python")
ENV_NAME_RE = re.compile(r"production|staging|demo-[a-z0-9][a-z0-9-]{0,39}")


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
        self.conn = sqlite3.connect(str(self.path), check_same_thread=False, timeout=15)
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

    # -- settings (v0.2) ---------------------------------------------------
    def get_setting(self, key: str, default: str | None = None) -> str | None:
        r = self.conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        return r[0] if r and r[0] is not None else default

    def set_setting(self, key: str, value: str | None, log: bool = True) -> None:
        with self.conn:
            if value is None:
                self.conn.execute("DELETE FROM settings WHERE key=?", (key,))
            else:
                self.conn.execute("INSERT INTO settings(key, value) VALUES(?, ?) "
                                  "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, str(value)))
            if log and not key.startswith("vault."):
                self.log("setting.set", "setting", key, {"value": value}, commit=False)

    def settings(self) -> dict:
        return {r[0]: r[1] for r in self.conn.execute(
            "SELECT key, value FROM settings WHERE key NOT LIKE 'vault.%' ORDER BY key")}

    # -- key escrow (v0.2) -------------------------------------------------
    def set_key_escrow(self, customer: str, on: bool) -> dict:
        c = self.get_customer(customer)
        with self.conn:
            self.conn.execute("UPDATE customers SET key_escrow=? WHERE id=?", (1 if on else 0, c["id"]))
            self.log("customer.key_escrow", "customer", c["id"], {"key_escrow": bool(on)}, commit=False)
        return self.get_customer(c["id"])

    def customer_of_env(self, env: dict) -> dict:
        inst = self.get_instance(env["instance_id"])
        return self.get_customer(inst["customer_id"])

    # -- environments (v0.2) -----------------------------------------------
    def add_environment(self, instance: str, name: str, kind: str, *, url: str | None = None,
                        api_url: str | None = None, settings: dict | None = None,
                        expires_at: str | None = None, notes: str | None = None) -> dict:
        inst = self.get_instance(instance)
        name = (name or "").strip().lower()
        if not ENV_NAME_RE.fullmatch(name):
            raise RegistryError("Nome di ambiente non valido: usa production, staging oppure demo-<nome> "
                                "(lettere minuscole, cifre e trattini).")
        if kind not in ENV_KINDS:
            raise RegistryError(f"Tipo di ambiente non valido: {kind} (usa {', '.join(ENV_KINDS)}).")
        if self.conn.execute("SELECT 1 FROM environments WHERE instance_id=? AND name=?",
                             (inst["id"], name)).fetchone():
            raise RegistryError(f"L'installazione '{inst['label']}' ha già un ambiente '{name}'.")
        eid = "env-" + uuid.uuid4().hex[:12]
        with self.conn:
            self.conn.execute(
                "INSERT INTO environments(id,instance_id,name,kind,url,api_url,status,expires_at,settings_json,"
                "notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (eid, inst["id"], name, kind, url, api_url, "new", expires_at,
                 json.dumps(settings or {}, ensure_ascii=False, sort_keys=True), notes, _now()))
            self.log("env.add", "environment", eid, {"instance_id": inst["id"], "name": name, "kind": kind,
                                                     "url": url, "api_url": api_url, "expires_at": expires_at},
                     commit=False)
        return self.get_environment(eid)

    @staticmethod
    def _env_row(r) -> dict:
        d = dict(r)
        d["settings"] = json.loads(d.get("settings_json") or "{}")
        d["last_check_data"] = json.loads(d["last_check_json"]) if d.get("last_check_json") else None
        return d

    def get_environment(self, ref: str, name: str | None = None) -> dict:
        """By env id, or by (instance ref, env name)."""
        if name is None:
            r = self.conn.execute("SELECT * FROM environments WHERE id=?", ((ref or "").strip(),)).fetchone()
            if not r:
                raise RegistryError(f"Ambiente non trovato: '{ref}'.")
            return self._env_row(r)
        inst = self.get_instance(ref)
        r = self.conn.execute("SELECT * FROM environments WHERE instance_id=? AND name=?",
                              (inst["id"], (name or "").strip().lower())).fetchone()
        if not r:
            raise RegistryError(f"L'installazione '{inst['label']}' non ha un ambiente '{name}'.")
        return self._env_row(r)

    def list_environments(self, instance: str | None = None) -> list[dict]:
        sql = ("SELECT e.*, i.label AS instance_label, c.name AS customer_name, c.id AS customer_id, "
               "c.key_escrow AS key_escrow, "
               "(SELECT l.expires_at FROM licences l WHERE l.instance_id=i.id "
               " ORDER BY l.expires_at DESC, l.issued_at DESC LIMIT 1) AS licence_expires_at "
               "FROM environments e JOIN instances i ON i.id=e.instance_id JOIN customers c ON c.id=i.customer_id")
        args: tuple = ()
        if instance:
            sql += " WHERE e.instance_id=?"
            args = (self.get_instance(instance)["id"],)
        sql += (" ORDER BY c.name COLLATE NOCASE, i.label COLLATE NOCASE, "
                "CASE e.name WHEN 'production' THEN 0 WHEN 'staging' THEN 1 ELSE 2 END, e.name")
        return [self._env_row(r) for r in self.conn.execute(sql, args)]

    ENV_UPDATABLE = ("url", "api_url", "port", "status", "app_version", "deployed_version", "verified_version",
                     "verified_code_hash", "verified_at", "last_check", "last_check_json", "last_deploy_at",
                     "last_backup_at", "expires_at", "settings_json", "notes")

    def update_environment(self, env_id: str, log_action: str | None = None, **fields) -> dict:
        bad = set(fields) - set(self.ENV_UPDATABLE) - {"settings"}
        if bad:
            raise RegistryError(f"Campi non modificabili: {', '.join(sorted(bad))}")
        if "settings" in fields:
            fields["settings_json"] = json.dumps(fields.pop("settings") or {}, ensure_ascii=False, sort_keys=True)
        if fields:
            cols = ", ".join(f"{k}=?" for k in fields)
            with self.conn:
                self.conn.execute(f"UPDATE environments SET {cols} WHERE id=?", (*fields.values(), env_id))
                if log_action:
                    self.log(log_action, "environment", env_id,
                             {k: v for k, v in fields.items() if k != "last_check_json"}, commit=False)
        return self.get_environment(env_id)

    def delete_environment_row(self, env_id: str, details: dict | None = None) -> None:
        """Remove the registry row (secrets and port reservation first). Files are archived by the caller."""
        env = self.get_environment(env_id)
        with self.conn:
            n = self.conn.execute("DELETE FROM secrets WHERE env_id=?", (env_id,)).rowcount
            self.conn.execute("DELETE FROM port_reservations WHERE env_id=?", (env_id,))
            self.conn.execute("DELETE FROM environments WHERE id=?", (env_id,))
            d = {"instance_id": env["instance_id"], "name": env["name"], "kind": env["kind"], "secrets_removed": n}
            d.update(details or {})
            self.log("env.delete", "environment", env_id, d, commit=False)

    # -- deploy history (v0.2) ---------------------------------------------
    def add_deploy(self, env_id: str, version: str | None, code_hash: str | None, dry_run: bool) -> str:
        did = "dep-" + uuid.uuid4().hex[:12]
        with self.conn:
            self.conn.execute(
                "INSERT INTO deploys(id,env_id,version,code_hash,dry_run,status,started_at) VALUES(?,?,?,?,?,?,?)",
                (did, env_id, version, code_hash, 1 if dry_run else 0, "running", _now()))
        return did

    def finish_deploy(self, deploy_id: str, status: str, details: dict | None = None) -> None:
        with self.conn:
            self.conn.execute("UPDATE deploys SET status=?, finished_at=?, details_json=? WHERE id=?",
                              (status, _now(), json.dumps(details or {}, ensure_ascii=False, sort_keys=True,
                                                          default=str), deploy_id))

    def list_deploys(self, env_id: str | None = None, limit: int = 20) -> list[dict]:
        sql, args = "SELECT * FROM deploys", ()
        if env_id:
            sql, args = sql + " WHERE env_id=?", (env_id,)
        return [dict(r) for r in self.conn.execute(sql + " ORDER BY started_at DESC, rowid DESC LIMIT ?",
                                                   (*args, limit))]
