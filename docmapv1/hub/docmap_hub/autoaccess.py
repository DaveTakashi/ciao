"""Automatic access ("accesso automatico"): the hub remembers its passphrases on this PC.

Opt-in, for an owner who prefers comfort on his own PC (and for an AI agent that runs hub commands
for him). ``accesso-automatico attiva`` asks the passphrase(s) once, checks them, and stores them in
``<hub data dir>/accesso-automatico.json``:

* on Windows encrypted with DPAPI for the current Windows user (the file is useless on another PC
  or for another Windows account, but any program running as this user can read it);
* elsewhere base64 in a file readable only by the owner (0600).

Risk, stated plainly: whoever (or whatever program) uses this Windows account can sign licences and
read the vault without typing anything. The keys stay encrypted on disk and in backups; turning the
mode off (``accesso-automatico disattiva``) removes the file. Environment variables and
``--passphrase-file`` still win over the stored file.
"""

from __future__ import annotations

import base64
import json
import os
import sys
from pathlib import Path

FILE = "accesso-automatico.json"
ENV_SIGN = "DOCMAP_HUB_PASSPHRASE"
ENV_VAULT = "DOCMAP_HUB_VAULT_PASSPHRASE"
ENV_OFF = "DOCMAP_HUB_NO_AUTO"  # set to 1 to ignore the stored file (tests, one-off checks)


def path(data_dir: Path) -> Path:
    return Path(data_dir) / FILE


# -- Windows DPAPI (current user) ------------------------------------------------------------------

def _dpapi(data: bytes, protect: bool) -> bytes:
    import ctypes
    from ctypes import wintypes

    class BLOB(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    crypt32, kernel32 = ctypes.windll.crypt32, ctypes.windll.kernel32
    buf = ctypes.create_string_buffer(data, len(data))
    src = BLOB(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
    dst = BLOB()
    fn = crypt32.CryptProtectData if protect else crypt32.CryptUnprotectData
    ok = (fn(ctypes.byref(src), "DocMapHub" if protect else None, None, None, None, 0x1, ctypes.byref(dst))
          if protect else fn(ctypes.byref(src), None, None, None, None, 0x1, ctypes.byref(dst)))
    if not ok:
        raise OSError("DPAPI: cifratura/decifratura non riuscita (file creato da un altro utente o PC?)")
    try:
        return ctypes.string_at(dst.pbData, dst.cbData)
    finally:
        kernel32.LocalFree.argtypes = [ctypes.c_void_p]
        kernel32.LocalFree(ctypes.cast(dst.pbData, ctypes.c_void_p))


def _is_windows() -> bool:
    return sys.platform.startswith("win")


def _enc(text: str, method: str) -> str:
    raw = text.encode("utf-8")
    if method == "dpapi":
        raw = _dpapi(raw, True)
    return base64.b64encode(raw).decode("ascii")


def _dec(value: str, method: str) -> str:
    raw = base64.b64decode(value)
    if method == "dpapi":
        raw = _dpapi(raw, False)
    return raw.decode("utf-8")


# -- API -------------------------------------------------------------------------------------------

def save(data_dir: Path, signing: str, vault: str | None) -> dict:
    method = "dpapi" if _is_windows() else "file"
    try:
        doc = {"v": 1, "method": method, "signing": _enc(signing, method),
               "vault": _enc(vault, method) if vault else None}
        if method == "dpapi" and _dec(doc["signing"], method) != signing:
            raise OSError("verifica DPAPI non riuscita")
    except OSError as exc:  # DPAPI unavailable: owner-only file instead, and say so
        print(f"Avviso: cifratura di Windows non disponibile ({exc}); uso un file leggibile solo da te.", file=sys.stderr)
        method = "file"
        doc = {"v": 1, "method": method, "signing": _enc(signing, method),
               "vault": _enc(vault, method) if vault else None}
    p = path(data_dir)
    tmp = p.with_suffix(".tmp")
    fd = os.open(str(tmp), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(doc, fh)
    os.replace(tmp, p)
    try:
        os.chmod(p, 0o600)
    except OSError:
        pass
    return {"path": str(p), "method": method}


def load(data_dir: Path) -> dict | None:
    """{'signing': str, 'vault': str|None, 'method': str} or None (not active / disabled / unreadable)."""
    if os.environ.get(ENV_OFF) == "1":
        return None
    p = path(data_dir)
    if not p.exists():
        return None
    try:
        doc = json.loads(p.read_text("utf-8"))
        return {"signing": _dec(doc["signing"], doc["method"]),
                "vault": _dec(doc["vault"], doc["method"]) if doc.get("vault") else None,
                "method": doc["method"]}
    except Exception as exc:  # broken file: behave as if off, but say it
        print(f"Avviso: accesso automatico non leggibile ({exc}); le passphrase verranno chieste.", file=sys.stderr)
        return None


def remove(data_dir: Path) -> bool:
    p = path(data_dir)
    if p.exists():
        p.unlink()
        return True
    return False


def apply_to_environ(data_dir: Path) -> bool:
    """Put the stored passphrases in this process's environment (never in a child's command line).
    Variables already set by the user win. Returns True if the stored file was used."""
    st = load(data_dir)
    if not st:
        return False
    used = False
    if not os.environ.get(ENV_SIGN):
        os.environ[ENV_SIGN] = st["signing"]
        used = True
    if not os.environ.get(ENV_VAULT):
        os.environ[ENV_VAULT] = st["vault"] or st["signing"]
        used = True
    return used
