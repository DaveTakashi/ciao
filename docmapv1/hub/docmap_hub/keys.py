"""Ed25519 signing keys of the hub, with rotation.

Layout inside ``<data dir>/keys/``::

    keys.json                 index: active key id + every key ever made
    <key_id>.key.pem          private key, PKCS8 PEM encrypted with the passphrase
    <key_id>.pub.pem          public key (PEM, safe to share)

Old keys are never deleted: they are marked ``retired`` and remain in the
public keys bundle so that licences already issued keep verifying.
"""

from __future__ import annotations

import base64
import json
import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

from .licence import format_time

MIN_PASSPHRASE = 10


class KeyError_(Exception):
    """Base error for key operations (message in Italian)."""


class WrongPassphrase(KeyError_):
    pass


class NoActiveKey(KeyError_):
    pass


def new_key_id(now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    return f"dmk{now.strftime('%Y%m%d')}-{secrets.token_hex(2)}"


def public_raw(pub: Ed25519PublicKey) -> bytes:
    return pub.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)


def public_b64(pub: Ed25519PublicKey) -> str:
    return base64.b64encode(public_raw(pub)).decode("ascii")


def public_pem(pub: Ed25519PublicKey) -> bytes:
    return pub.public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)


def _write_private(path: Path, data: bytes) -> None:
    # Create with 0600 where the OS supports it (no-op semantics on Windows).
    fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as fh:
        fh.write(data)


@dataclass
class KeyInfo:
    key_id: str
    created_at: str
    status: str  # active | retired
    public_b64: str


class KeyStore:
    def __init__(self, data_dir: Path):
        self.dir = Path(data_dir) / "keys"
        self.index_path = self.dir / "keys.json"

    # -- index -------------------------------------------------------------
    def _load(self) -> dict:
        if not self.index_path.exists():
            return {"active": None, "keys": []}
        return json.loads(self.index_path.read_text("utf-8"))

    def _save(self, idx: dict) -> None:
        self.dir.mkdir(parents=True, exist_ok=True)
        tmp = self.index_path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(idx, indent=2, ensure_ascii=False) + "\n", "utf-8")
        os.replace(tmp, self.index_path)

    def list(self) -> list[KeyInfo]:
        return [KeyInfo(**k) for k in self._load()["keys"]]

    @property
    def active_id(self) -> str | None:
        return self._load().get("active")

    # -- generation --------------------------------------------------------
    def generate(self, passphrase: str, rotate: bool = False) -> KeyInfo:
        if len(passphrase or "") < MIN_PASSPHRASE:
            raise KeyError_(f"La passphrase deve avere almeno {MIN_PASSPHRASE} caratteri.")
        idx = self._load()
        if idx.get("active") and not rotate:
            raise KeyError_("Esiste già una chiave attiva. Per sostituirla usa 'keygen --rotate'.")
        if idx.get("active"):
            # Rotation requires knowing the current passphrase-protected key.
            self.load_private(passphrase, idx["active"])
        self.dir.mkdir(parents=True, exist_ok=True)
        priv = Ed25519PrivateKey.generate()
        key_id = new_key_id()
        while (self.dir / f"{key_id}.key.pem").exists():
            key_id = new_key_id()
        enc = priv.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.BestAvailableEncryption(passphrase.encode("utf-8")),
        )
        _write_private(self.dir / f"{key_id}.key.pem", enc)
        pub = priv.public_key()
        (self.dir / f"{key_id}.pub.pem").write_bytes(public_pem(pub))
        for k in idx["keys"]:
            if k["status"] == "active":
                k["status"] = "retired"
        info = KeyInfo(key_id=key_id, created_at=format_time(datetime.now(timezone.utc)),
                       status="active", public_b64=public_b64(pub))
        idx["keys"].append(info.__dict__)
        idx["active"] = key_id
        self._save(idx)
        return info

    # -- loading -----------------------------------------------------------
    def load_private(self, passphrase: str, key_id: str | None = None) -> tuple[str, Ed25519PrivateKey]:
        key_id = key_id or self.active_id
        if not key_id:
            raise NoActiveKey("Nessuna chiave di firma: esegui prima 'keygen'.")
        path = self.dir / f"{key_id}.key.pem"
        if not path.exists():
            raise KeyError_(f"File della chiave privata mancante: {path}")
        try:
            key = serialization.load_pem_private_key(path.read_bytes(), (passphrase or "").encode("utf-8"))
        except (ValueError, TypeError) as exc:
            raise WrongPassphrase("Passphrase errata.") from exc
        if not isinstance(key, Ed25519PrivateKey):
            raise KeyError_("La chiave non è Ed25519.")
        return key_id, key

    def check_passphrase(self, passphrase: str) -> bool:
        try:
            self.load_private(passphrase)
            return True
        except WrongPassphrase:
            return False

    def public_keys(self) -> dict[str, bytes]:
        """``{key_id: raw 32 bytes}`` of every key (active and retired)."""
        return {k.key_id: base64.b64decode(k.public_b64) for k in self.list()}

    # -- export ------------------------------------------------------------
    def export(self, fmt: str = "json", key_id: str | None = None) -> str:
        keys = self.list()
        if not keys:
            raise NoActiveKey("Nessuna chiave di firma: esegui prima 'keygen'.")
        if fmt == "json":
            return json.dumps({"format": 1, "active": self.active_id,
                               "keys": {k.key_id: k.public_b64 for k in keys}},
                              indent=2, sort_keys=True) + "\n"
        key_id = key_id or self.active_id
        info = next((k for k in keys if k.key_id == key_id), None)
        if info is None:
            raise KeyError_(f"Chiave sconosciuta: {key_id}")
        if fmt == "base64":
            return info.public_b64 + "\n"
        if fmt == "pem":
            return (self.dir / f"{key_id}.pub.pem").read_text("ascii")
        raise KeyError_(f"Formato non supportato: {fmt} (usa json, base64 o pem)")
