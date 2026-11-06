"""Encryption at rest, byte-compatible with api.php: blob = 0x01 | iv(12) | tag(16) | ciphertext, AES-256-GCM,
AAD = "<table>/<type>/<id>"; HMAC-SHA256 index columns (first 40 hex chars of HMAC(key, 'docmap-idx/' + value))."""
from __future__ import annotations

import hashlib
import hmac
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class CryptoError(Exception):
    pass


def enc(key: bytes, plain: str, aad: str) -> bytes:
    iv = os.urandom(12)
    ct_tag = AESGCM(key).encrypt(iv, plain.encode("utf-8"), aad.encode("utf-8"))
    return b"\x01" + iv + ct_tag[-16:] + ct_tag[:-16]


def dec(key: bytes, blob, aad: str) -> str:
    """Returns the plaintext; raises CryptoError('unreadable' | 'key') like dec() in api.php."""
    if isinstance(blob, str):
        blob = blob.encode("latin-1", "replace")   # PDO hands TEXT columns as strings: same length test
    if not isinstance(blob, (bytes, bytearray, memoryview)) or len(blob) < 29 or bytes(blob[:1]) != b"\x01":
        raise CryptoError("unreadable")
    blob = bytes(blob)
    try:
        raw = AESGCM(key).decrypt(blob[1:13], blob[29:] + blob[13:29], aad.encode("utf-8"))
    except InvalidTag:
        raise CryptoError("key")
    return raw.decode("utf-8", "surrogateescape")


def hidx(key: bytes, v: str):
    if v == "":
        return None
    return hmac.new(key, ("docmap-idx/" + v).encode("utf-8"), hashlib.sha256).hexdigest()[:40]


def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()
