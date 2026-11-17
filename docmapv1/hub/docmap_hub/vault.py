"""Credential vault of the hub ("Cassaforte").

Secrets belong to one *environment* (production / staging / demo-* of an
installation) and are stored in the ``secrets`` table of the registry,
encrypted at rest:

* key = scrypt(master passphrase, salt, N=2^15, r=8, p=1) → 32 bytes;
  salt and KDF parameters in ``settings`` (``vault.*``), plus a *verifier*
  (a known text encrypted with the key) to tell a wrong passphrase apart.
* each secret = AES-256-GCM, random 96-bit nonce, associated data
  ``"<env_id>|<kind>|<label>"`` (a ciphertext copied onto another row does
  not decrypt).
* the master passphrase is never stored; by default it is the same
  passphrase as the signing key (``keygen``). ``DOCMAP_HUB_VAULT_PASSPHRASE``
  can hold a different one.

GDPR rule (key escrow): a customer's ``key_escrow`` flag is OFF by default.
While it is OFF the vault refuses any secret that would let Dave read the
customer's data: kind ``db_config`` and any payload carrying ``aes_key``.

Every reveal (decryption of a secret for display or use) is written to
``events`` (``vault.reveal`` with the reason), never the secret itself.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets as _secrets
from dataclasses import dataclass
from datetime import datetime, timezone

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .licence import format_time
from .registry import Registry, RegistryError

KDF_N_LOG2 = 15
KDF_R = 8
KDF_P = 1
VERIFIER_TEXT = b"docmap-hub-vault-v1"
MIN_PASSPHRASE = 10
EXPORT_FORMAT = "docmap-hub-vault-export"

KINDS = ("db_config", "admin_token", "superadmin", "ftp", "basic_auth", "note")
KIND_IT = {
    "db_config": "configurazione del database (config.json / config.php, con aes_key)",
    "admin_token": "codice di accesso (token) di un utente",
    "superadmin": "credenziali superadmin",
    "ftp": "accesso FTP/SFTP per il deploy",
    "basic_auth": "password della cartella protetta (HTTP Basic)",
    "note": "nota libera",
}
FTP_PROTOCOLS = ("ftps", "sftp", "ftp", "local")
ESCROW_KINDS = ("db_config",)


class VaultError(RegistryError):
    """Vault error with an Italian message."""


class VaultLocked(VaultError):
    pass


class WrongVaultPassphrase(VaultError):
    pass


class EscrowRefused(VaultError):
    pass


@dataclass(frozen=True)
class VaultKey:
    key: bytes
    fingerprint: str

    def __repr__(self) -> str:  # never print the key
        return f"VaultKey({self.fingerprint})"


def _now() -> str:
    return format_time(datetime.now(timezone.utc))


def derive(passphrase: str, salt: bytes, n_log2: int = KDF_N_LOG2, r: int = KDF_R, p: int = KDF_P) -> bytes:
    return hashlib.scrypt((passphrase or "").encode("utf-8"), salt=salt, n=2 ** n_log2, r=r, p=p,
                          maxmem=256 * 1024 * 1024, dklen=32)


def _aad(env_id: str, kind: str, label: str) -> bytes:
    return f"{env_id}|{kind}|{label}".encode("utf-8")


def _contains_aes_key(obj) -> bool:
    if isinstance(obj, dict):
        return any(str(k).lower() == "aes_key" or _contains_aes_key(v) for k, v in obj.items())
    if isinstance(obj, (list, tuple)):
        return any(_contains_aes_key(v) for v in obj)
    if isinstance(obj, str):
        return "aes_key" in obj.lower()
    return False


def validate(kind: str, data: dict) -> dict:
    """Check and normalise a secret payload. Returns a new dict."""
    if kind not in KINDS:
        raise VaultError(f"Tipo di segreto sconosciuto: {kind} (usa {', '.join(KINDS)}).")
    if not isinstance(data, dict) or not data:
        raise VaultError("Il segreto è vuoto.")
    d = {str(k): v for k, v in data.items() if v is not None and v != ""}
    if kind == "ftp":
        proto = str(d.get("protocol") or "ftps").lower()
        if proto not in FTP_PROTOCOLS:
            raise VaultError(f"Protocollo non valido: {proto} (ftps, sftp, ftp; 'local' solo per prove).")
        d["protocol"] = proto
        if proto != "local":
            for f in ("host", "user", "password"):
                if not d.get(f):
                    raise VaultError(f"Accesso FTP: manca il campo '{f}'.")
            default_port = 22 if proto == "sftp" else 21
            try:
                d["port"] = int(d.get("port") or default_port)
            except (TypeError, ValueError):
                raise VaultError("Accesso FTP: porta non valida.")
        if not d.get("remote_path"):
            raise VaultError("Accesso FTP: manca 'remote_path' (cartella del sito, es. /public_html/studio-de).")
    elif kind in ("basic_auth", "superadmin"):
        if not d.get("user") or not d.get("password"):
            raise VaultError("Servono 'user' e 'password'.")
    elif kind == "admin_token":
        if not d.get("token"):
            raise VaultError("Manca 'token'.")
        d.setdefault("user", "admin")
    elif kind == "db_config":
        if not d.get("content"):
            raise VaultError("Manca 'content' (testo di config.json o config.php).")
    elif kind == "note":
        if not d.get("text"):
            raise VaultError("Manca 'text'.")
    return d


class Vault:
    def __init__(self, registry: Registry):
        self.reg = registry

    # -- setup / unlock ----------------------------------------------------
    @property
    def initialized(self) -> bool:
        return self.reg.get_setting("vault.salt") is not None

    def init(self, passphrase: str) -> VaultKey:
        if self.initialized:
            raise VaultError("La cassaforte esiste già (per cambiare passphrase: vault change-passphrase).")
        if len(passphrase or "") < MIN_PASSPHRASE:
            raise VaultError(f"La passphrase deve avere almeno {MIN_PASSPHRASE} caratteri.")
        salt = _secrets.token_bytes(16)
        key = derive(passphrase, salt)
        self._write_header(salt, key)
        self.reg.log("vault.init", details={"kdf": f"scrypt N=2^{KDF_N_LOG2} r={KDF_R} p={KDF_P}"})
        return self._vk(key)

    def _write_header(self, salt: bytes, key: bytes) -> None:
        nonce = _secrets.token_bytes(12)
        ver = AESGCM(key).encrypt(nonce, VERIFIER_TEXT, b"verifier")
        self.reg.set_setting("vault.salt", base64.b64encode(salt).decode("ascii"))
        self.reg.set_setting("vault.kdf", json.dumps({"alg": "scrypt", "n_log2": KDF_N_LOG2, "r": KDF_R, "p": KDF_P}))
        self.reg.set_setting("vault.verifier", base64.b64encode(nonce + ver).decode("ascii"))

    @staticmethod
    def _vk(key: bytes) -> VaultKey:
        return VaultKey(key, hashlib.sha256(b"fp" + key).hexdigest()[:12])

    def unlock(self, passphrase: str) -> VaultKey:
        if not self.initialized:
            raise VaultLocked("Cassaforte non ancora creata: esegui 'vault init'.")
        salt = base64.b64decode(self.reg.get_setting("vault.salt"))
        kdf = json.loads(self.reg.get_setting("vault.kdf") or "{}")
        key = derive(passphrase, salt, kdf.get("n_log2", KDF_N_LOG2), kdf.get("r", KDF_R), kdf.get("p", KDF_P))
        blob = base64.b64decode(self.reg.get_setting("vault.verifier"))
        try:
            if AESGCM(key).decrypt(blob[:12], blob[12:], b"verifier") != VERIFIER_TEXT:
                raise InvalidTag()
        except InvalidTag:
            raise WrongVaultPassphrase("Passphrase della cassaforte errata.") from None
        return self._vk(key)

    def check(self, passphrase: str) -> bool:
        try:
            self.unlock(passphrase)
            return True
        except VaultError:
            return False

    # -- escrow ------------------------------------------------------------
    def _escrow_allowed(self, env: dict) -> bool:
        return bool(self.reg.customer_of_env(env).get("key_escrow"))

    def _check_escrow(self, env: dict, kind: str, data: dict) -> None:
        if kind in ESCROW_KINDS or (kind != "db_config" and _contains_aes_key(data)):
            if not self._escrow_allowed(env):
                cust = self.reg.customer_of_env(env)
                raise EscrowRefused(
                    f"Il cliente '{cust['name']}' non ha autorizzato la custodia della chiave (key escrow spento): "
                    "l'hub non conserva la configurazione del database né la aes_key, perché chi le ha può leggere "
                    "i dati dello studio. Per attivarla, con il consenso scritto del cliente: "
                    f"customer set --customer \"{cust['name']}\" --key-escrow on")

    # -- secrets -----------------------------------------------------------
    def put(self, vk: VaultKey, env_id: str, kind: str, data: dict, label: str = "") -> dict:
        env = self.reg.get_environment(env_id)
        data = validate(kind, data)
        self._check_escrow(env, kind, data)
        label = (label or "").strip()
        nonce = _secrets.token_bytes(12)
        ct = AESGCM(vk.key).encrypt(nonce, json.dumps(data, ensure_ascii=False, sort_keys=True).encode("utf-8"),
                                    _aad(env["id"], kind, label))
        now = _now()
        with self.reg.conn:
            existed = self.reg.conn.execute("SELECT 1 FROM secrets WHERE env_id=? AND kind=? AND label=?",
                                            (env["id"], kind, label)).fetchone()
            self.reg.conn.execute(
                "INSERT INTO secrets(env_id,kind,label,nonce,ciphertext,created_at,updated_at) VALUES(?,?,?,?,?,?,?) "
                "ON CONFLICT(env_id,kind,label) DO UPDATE SET nonce=excluded.nonce, ciphertext=excluded.ciphertext, "
                "updated_at=excluded.updated_at", (env["id"], kind, label, nonce, ct, now, now))
            self.reg.log("vault.update" if existed else "vault.store", "environment", env["id"],
                         {"kind": kind, "label": label, "fields": sorted(data)}, commit=False)
        return {"env_id": env["id"], "kind": kind, "label": label, "fields": sorted(data)}

    def _row(self, env_id: str, kind: str, label: str = ""):
        return self.reg.conn.execute("SELECT * FROM secrets WHERE env_id=? AND kind=? AND label=?",
                                     (env_id, kind, label or "")).fetchone()

    def has(self, env_id: str, kind: str, label: str = "") -> bool:
        return self._row(env_id, kind, label) is not None

    def get(self, vk: VaultKey | None, env_id: str, kind: str, label: str = "", *, reason: str,
            required: bool = True) -> dict | None:
        """Decrypt a secret. Every call is audited (``vault.reveal``) with its reason."""
        if vk is None:
            raise VaultLocked("Cassaforte chiusa: serve la passphrase.")
        r = self._row(env_id, kind, label)
        if r is None:
            if required:
                env = self.reg.get_environment(env_id)
                raise VaultError(f"Nella cassaforte manca '{kind}'" + (f" ({label})" if label else "")
                                 + f" per l'ambiente {env['name']}. Aggiungilo con: vault set …")
            return None
        try:
            pt = AESGCM(vk.key).decrypt(r["nonce"], r["ciphertext"], _aad(env_id, kind, label or ""))
        except InvalidTag:
            raise VaultError("Segreto illeggibile (passphrase diversa o dato alterato).") from None
        self.reg.log("vault.reveal", "environment", env_id, {"kind": kind, "label": label or "", "reason": reason})
        return json.loads(pt)

    def list(self, env_id: str | None = None, instance_id: str | None = None) -> list[dict]:
        sql = ("SELECT s.id, s.env_id, s.kind, s.label, s.created_at, s.updated_at, e.name AS env_name, "
               "e.instance_id, i.label AS instance_label, c.name AS customer_name "
               "FROM secrets s JOIN environments e ON e.id=s.env_id JOIN instances i ON i.id=e.instance_id "
               "JOIN customers c ON c.id=i.customer_id")
        cond, args = [], []
        if env_id:
            cond.append("s.env_id=?")
            args.append(env_id)
        if instance_id:
            cond.append("e.instance_id=?")
            args.append(instance_id)
        if cond:
            sql += " WHERE " + " AND ".join(cond)
        sql += " ORDER BY c.name, i.label, e.name, s.kind, s.label"
        return [dict(r) for r in self.reg.conn.execute(sql, args)]

    def delete(self, env_id: str, kind: str, label: str = "") -> bool:
        with self.reg.conn:
            n = self.reg.conn.execute("DELETE FROM secrets WHERE env_id=? AND kind=? AND label=?",
                                      (env_id, kind, label or "")).rowcount
            if n:
                self.reg.log("vault.delete", "environment", env_id, {"kind": kind, "label": label or ""},
                             commit=False)
        return bool(n)

    def purge_escrow(self, customer: str) -> int:
        """Remove every db_config secret of a customer (used when escrow is switched off)."""
        cust = self.reg.get_customer(customer)
        rows = self.reg.conn.execute(
            "SELECT s.env_id, s.kind, s.label FROM secrets s JOIN environments e ON e.id=s.env_id "
            "JOIN instances i ON i.id=e.instance_id WHERE i.customer_id=? AND s.kind IN (%s)"
            % ",".join("?" * len(ESCROW_KINDS)), (cust["id"], *ESCROW_KINDS)).fetchall()
        for r in rows:
            self.delete(r["env_id"], r["kind"], r["label"])
        return len(rows)

    def escrowed_count(self, customer: str) -> int:
        cust = self.reg.get_customer(customer)
        return self.reg.conn.execute(
            "SELECT COUNT(*) FROM secrets s JOIN environments e ON e.id=s.env_id JOIN instances i "
            "ON i.id=e.instance_id WHERE i.customer_id=? AND s.kind='db_config'", (cust["id"],)).fetchone()[0]

    # -- passphrase change -------------------------------------------------
    def change_passphrase(self, old: str, new: str) -> int:
        if len(new or "") < MIN_PASSPHRASE:
            raise VaultError(f"La nuova passphrase deve avere almeno {MIN_PASSPHRASE} caratteri.")
        old_vk = self.unlock(old)
        salt = _secrets.token_bytes(16)
        new_key = derive(new, salt)
        rows = self.reg.conn.execute("SELECT * FROM secrets").fetchall()
        re_enc = []
        for r in rows:
            aad = _aad(r["env_id"], r["kind"], r["label"])
            pt = AESGCM(old_vk.key).decrypt(r["nonce"], r["ciphertext"], aad)
            n = _secrets.token_bytes(12)
            re_enc.append((n, AESGCM(new_key).encrypt(n, pt, aad), _now(), r["id"]))
        from . import hosting  # v0.10: the default hosting's FTP password is encrypted with the same key
        hosting_new = hosting.reencrypt(self.reg, old_vk, VaultKey(new_key, ""))
        with self.reg.conn:
            for t in re_enc:
                self.reg.conn.execute("UPDATE secrets SET nonce=?, ciphertext=?, updated_at=? WHERE id=?", t)
        if hosting_new:
            self.reg.set_setting(hosting.KEY, hosting_new, log=False)
        self._write_header(salt, new_key)
        self.reg.log("vault.change_passphrase", details={"secrets": len(rows)})
        return len(rows)

    # -- export / import ---------------------------------------------------
    def export_data(self) -> dict:
        """Encrypted export (no decryption needed): header + rows, base64. Safe to put in a backup."""
        if not self.initialized:
            return {"format": EXPORT_FORMAT, "version": 1, "initialized": False, "secrets": []}
        rows = self.reg.conn.execute(
            "SELECT s.*, e.instance_id, e.name AS env_name FROM secrets s JOIN environments e ON e.id=s.env_id "
            "ORDER BY s.id").fetchall()
        return {
            "format": EXPORT_FORMAT, "version": 1, "initialized": True,
            "salt": self.reg.get_setting("vault.salt"),
            "kdf": json.loads(self.reg.get_setting("vault.kdf") or "{}"),
            "verifier": self.reg.get_setting("vault.verifier"),
            "secrets": [{"env_id": r["env_id"], "instance_id": r["instance_id"], "env_name": r["env_name"],
                         "kind": r["kind"], "label": r["label"],
                         "nonce": base64.b64encode(r["nonce"]).decode("ascii"),
                         "ciphertext": base64.b64encode(r["ciphertext"]).decode("ascii"),
                         "created_at": r["created_at"], "updated_at": r["updated_at"]} for r in rows],
        }

    def import_data(self, vk: VaultKey, data: dict, export_passphrase: str, overwrite: bool = False) -> dict:
        """Merge an export into this vault: decrypt with the export's passphrase, re-encrypt with ``vk``.

        Rows are matched to environments by env id, else by (instance id, env name).
        Escrow rules apply to the imported rows too.
        """
        if data.get("format") != EXPORT_FORMAT:
            raise VaultError("File non riconosciuto: non è un'esportazione della cassaforte del hub.")
        if not data.get("initialized"):
            return {"imported": 0, "skipped": 0, "missing_env": 0}
        salt = base64.b64decode(data["salt"])
        kdf = data.get("kdf") or {}
        key = derive(export_passphrase, salt, kdf.get("n_log2", KDF_N_LOG2), kdf.get("r", KDF_R), kdf.get("p", KDF_P))
        blob = base64.b64decode(data["verifier"])
        try:
            AESGCM(key).decrypt(blob[:12], blob[12:], b"verifier")
        except InvalidTag:
            raise WrongVaultPassphrase("Passphrase dell'esportazione errata.") from None
        res = {"imported": 0, "skipped": 0, "missing_env": 0, "refused_escrow": 0}
        for s in data.get("secrets", []):
            try:
                env = self.reg.get_environment(s["env_id"])
            except RegistryError:
                try:
                    env = self.reg.get_environment(s["instance_id"], s["env_name"])
                except RegistryError:
                    res["missing_env"] += 1
                    continue
            if self.has(env["id"], s["kind"], s["label"]) and not overwrite:
                res["skipped"] += 1
                continue
            pt = AESGCM(key).decrypt(base64.b64decode(s["nonce"]), base64.b64decode(s["ciphertext"]),
                                     _aad(s["env_id"], s["kind"], s["label"]))
            try:
                self.put(vk, env["id"], s["kind"], json.loads(pt), s["label"])
                res["imported"] += 1
            except EscrowRefused:
                res["refused_escrow"] += 1
        self.reg.log("vault.import", details=res)
        return res


def passphrase_matches(a: str, b: str) -> bool:
    return hmac.compare_digest((a or "").encode(), (b or "").encode())


ENV_VAULT_PASSPHRASE = "DOCMAP_HUB_VAULT_PASSPHRASE"


def vault_passphrase_from_env() -> str | None:
    return os.environ.get(ENV_VAULT_PASSPHRASE) or None
