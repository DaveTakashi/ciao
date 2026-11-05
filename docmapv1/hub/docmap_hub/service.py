"""Hub operations shared by the CLI and the local web page."""

from __future__ import annotations

import calendar
import json
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import licence as L
from . import paths
from .keys import KeyStore
from .registry import Registry, RegistryError

PLANS_FILE = Path(__file__).with_name("plans.json")


def load_plans(data_dir: Path | None = None) -> dict:
    """Plans from ``<data dir>/plans.json`` if present, else the bundled file."""
    src = PLANS_FILE
    if data_dir is not None and (Path(data_dir) / "plans.json").exists():
        src = Path(data_dir) / "plans.json"
    return json.loads(src.read_text("utf-8"))["plans"]


def add_months(dt: datetime, months: int) -> datetime:
    m = dt.month - 1 + months
    y = dt.year + m // 12
    m = m % 12 + 1
    d = min(dt.day, calendar.monthrange(y, m)[1])
    return dt.replace(year=y, month=m, day=d)


def slug(text: str) -> str:
    s = re.sub(r"[^A-Za-z0-9]+", "-", text or "").strip("-").lower()
    return s[:40] or "licenza"


class Hub:
    def __init__(self, data_dir=None):
        self.dir = paths.ensure(paths.resolve(data_dir))
        self.registry = Registry(self.dir)
        self.keys = KeyStore(self.dir)
        self.plans = load_plans(self.dir)

    def close(self):
        self.registry.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    # -- licences ----------------------------------------------------------
    def build_licence(self, instance: str, plan: str, key_id: str, *, months: int | None = None,
                      expires_at: datetime | None = None, valid_from: datetime | None = None,
                      grace_days: int | None = None, limits: dict | None = None,
                      add_features=(), remove_features=(), now: datetime | None = None) -> dict:
        if plan not in self.plans:
            raise RegistryError(f"Piano sconosciuto: '{plan}'. Piani disponibili: {', '.join(self.plans)}.")
        p = self.plans[plan]
        inst = self.registry.get_instance(instance)
        cust = self.registry.get_customer(inst["customer_id"])
        reseller = self.registry.get_reseller(cust["reseller_id"]) if cust.get("reseller_id") else None
        now = now or datetime.now(timezone.utc)
        start = valid_from or now
        if expires_at is None:
            expires_at = add_months(start, months if months is not None else int(p.get("duration_months", 12)))
        lim = dict(p.get("limits") or {})
        lim.update(limits or {})
        feats = [f for f in p.get("features", []) if f not in set(remove_features)]
        for f in add_features:
            if f not in feats:
                feats.append(f)
        branding = None
        if reseller:
            branding = reseller.get("branding")
            if branding and "white_label" not in feats and "white_label" not in set(remove_features):
                feats.append("white_label")
        customer = {"name": cust["name"]}
        if cust.get("vat_id"):
            customer["vat_id"] = cust["vat_id"]
        if cust.get("email"):
            customer["email"] = cust["email"]
        lic = {
            "licence_id": str(uuid.uuid4()),
            "format": L.FORMAT,
            "customer": customer,
            "instance_id": inst["id"],
            "plan": plan,
            "issued_at": L.format_time(now),
            "valid_from": L.format_time(start),
            "expires_at": L.format_time(expires_at),
            "grace_days": int(grace_days if grace_days is not None else p.get("grace_days", L.DEFAULT_GRACE_DAYS)),
            "limits": lim,
            "features": sorted(feats),
            "reseller": {"id": reseller["id"], "name": reseller["name"]} if reseller else None,
            "branding": branding,
            "key_id": key_id,
        }
        from .licensing import update_url  # v0.7: where the server fetches its next licence
        url = update_url(self.registry, inst["id"])
        if url:
            lic["update_url"] = url
        return lic

    def _sign_and_store(self, lic: dict, private_key, supersedes: str | None = None) -> dict:
        file_obj = L.sign_licence(lic, private_key)
        text = L.encode_licence_file(file_obj).decode("utf-8")
        # Self-check with the public keys before handing the file out.
        st = L.verify(text, self.keys.public_keys(), instance_id=lic["instance_id"])
        if not st.signature_ok:
            raise RegistryError(f"Autoverifica fallita: {st.reasons}")
        self.registry.add_licence(lic, text, supersedes=supersedes)
        out = self.dir / "issued" / self.licence_filename(lic)
        out.write_text(text, "utf-8", newline="\n")
        return {"licence": lic, "text": text, "path": out, "status": st}

    @staticmethod
    def licence_filename(lic: dict) -> str:
        return (f"{slug(lic['customer']['name'])}_{lic['instance_id'][:8]}_"
                f"{lic['expires_at'][:10]}_{lic['licence_id'][:6]}{L.FILE_EXTENSION}")

    def issue(self, passphrase: str, instance: str, plan: str, **kw) -> dict:
        key_id, priv = self.keys.load_private(passphrase)
        return self.issue_with_key(key_id, priv, instance, plan, **kw)

    def issue_with_key(self, key_id, priv, instance: str, plan: str, **kw) -> dict:
        lic = self.build_licence(instance, plan, key_id, **kw)
        return self._sign_and_store(lic, priv)

    def renew(self, passphrase: str, ref: str, **kw) -> dict:
        key_id, priv = self.keys.load_private(passphrase)
        return self.renew_with_key(key_id, priv, ref, **kw)

    def renew_with_key(self, key_id, priv, ref: str, *, months: int | None = None,
                       plan: str | None = None, now: datetime | None = None) -> dict:
        """Renew from a licence id, or from an instance (its latest licence).

        The new licence is valid immediately; it extends from the old expiry
        if that is still in the future, otherwise from now. Limits and
        features come from the previous licence unless the plan changes.
        """
        try:
            old = self.registry.get_licence(ref)
        except RegistryError:
            old = self.registry.latest_licence(ref)
            if old is None:
                raise RegistryError(f"Nessuna licenza da rinnovare per '{ref}'.")
        prev = old["licence"]
        if prev.get("status") == L.STATUS_REVOKED:
            raise RegistryError("Licenza revocata: annulla prima la revoca (Riattiva) se vuoi rinnovarla.")
        if isinstance(prev.get("resume"), dict):  # renewing a suspended licence reactivates it
            prev = dict(prev, expires_at=prev["resume"].get("expires_at") or prev["expires_at"],
                        grace_days=int(prev["resume"].get("grace_days", L.DEFAULT_GRACE_DAYS)))
        now = now or datetime.now(timezone.utc)
        new_plan = plan or prev["plan"]
        base = max(now, L.parse_time(prev["expires_at"]))
        n = months if months is not None else int(self.plans.get(new_plan, {}).get("duration_months", 12))
        kw = dict(months=None, expires_at=add_months(base, n), valid_from=now, now=now)
        if new_plan == prev["plan"]:
            kw.update(limits=prev["limits"], grace_days=prev["grace_days"])
            lic = self.build_licence(prev["instance_id"], new_plan, key_id, **kw)
            lic["features"] = sorted(set(prev["features"]) | ({"white_label"} if lic["branding"] else set()))
        else:
            lic = self.build_licence(prev["instance_id"], new_plan, key_id, **kw)
        return self._sign_and_store(lic, priv, supersedes=prev["licence_id"])

    def backup(self, out: Path | None = None) -> Path:
        """Zip of keys (private keys stay encrypted), a consistent copy of the
        registry (SQLite backup API), plans.json and issued licence files."""
        import sqlite3
        import tempfile
        import zipfile
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        out = Path(out) if out else self.dir / "backups" / f"docmap-hub-backup-{stamp}.zip"
        out.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory() as td:
            snap = Path(td) / "registry.sqlite3"
            dst = sqlite3.connect(str(snap))
            with dst:
                self.registry.conn.backup(dst)
            dst.close()
            with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
                z.write(snap, "registry.sqlite3")
                for sub in ("keys", "issued"):
                    for f in sorted((self.dir / sub).glob("*")):
                        if f.is_file() and not f.name.endswith(".tmp"):
                            z.write(f, f"{sub}/{f.name}")
                if (self.dir / "plans.json").exists():
                    z.write(self.dir / "plans.json", "plans.json")
                # v0.2: the vault, still encrypted (also inside registry.sqlite3; this copy is for
                # 'vault import' into another hub). Without the master passphrase it is unreadable.
                from .vault import Vault
                z.writestr("vault-export.json", json.dumps(Vault(self.registry).export_data(), indent=1))
                if (self.dir / "known_hosts").exists():
                    z.write(self.dir / "known_hosts", "known_hosts")
        self.registry.log("hub.backup", details={"file": str(out)})
        return out

    def status_of(self, file_text: str, now: datetime | None = None) -> L.LicenceStatus:
        return L.verify(file_text, self.keys.public_keys(), now=now)
