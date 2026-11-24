"""Licence of a Strumenti installation (Strumenti 0.2, hub 0.14).

The verifier is ``licence_verify.py``, a byte-identical copy of ``docmapv1/hub/docmap_hub/licence.py`` (never edit it
here: re-copy it; ``tests/test_licence.py`` checks the two files are equal when the hub folder exists).

What the licence decides (only when one is installed, or when ``settings.licence.required`` is true):

* feature ``strumenti``        → new jobs and previews may run on this PC;
* feature ``strumenti_remote`` → jobs may also be sent to the provider's remote server;
* limit ``strumenti_credits``  → credits per calendar month on this PC (None = unlimited);
* mode ``read_only`` / ``invalid`` (expired beyond grace, suspended, revoked, tampered, unknown key) → no new jobs and
  no previews; reviews, resuming a paused job, results and downloads keep working: a licence never locks the data.

Without a licence and without ``required`` everything behaves as in 0.1 (``settings.licence.modes``,
``settings.credits.local_month``): installing a licence is what switches the rules on.

Files: ``<data>/licenza/licence.docmap-licence`` and ``<data>/licenza/instance.json`` (the first genuine licence installed
fixes the installation; a licence for another installation is refused unless forced). Trusted keys: the file
``trusted_keys.json`` NEXT TO THIS MODULE (code folder, written by ``python -m docmap_strumenti licenza chiave``; whoever
can write the code folder can already run any code), plus ``settings.licence.public_keys`` for TESTS / DEVELOPMENT only.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime
from pathlib import Path

from . import licence_verify as L

DIR = "licenza"
FILE = "licence.docmap-licence"
INSTANCE = "instance.json"
KEYS_FILE = Path(__file__).with_name("trusted_keys.json")
MAX_BYTES = 64 * 1024

F_LOCAL = "strumenti"
F_REMOTE = "strumenti_remote"
LIMIT = "strumenti_credits"

_cache: dict = {}
_lock = threading.Lock()


class LicenceInstallError(ValueError):
    pass


def lic_path(data_dir: Path) -> Path:
    return Path(data_dir) / DIR / FILE


def _fp(p: Path):
    try:
        s = p.stat()
        return (s.st_mtime_ns, s.st_size)
    except OSError:
        return None


def trusted_keys(settings: dict) -> dict:
    keys: dict = {}
    try:
        if KEYS_FILE.is_file() and KEYS_FILE.stat().st_size <= MAX_BYTES:
            obj = json.loads(KEYS_FILE.read_text("utf-8-sig"))
            for k, v in ((obj or {}).get("keys") or {}).items():
                if isinstance(v, str):
                    keys[str(k)] = v.strip()
    except (OSError, ValueError, AttributeError):
        keys = {}
    extra = (settings.get("licence") or {}).get("public_keys")     # TESTS / DEVELOPMENT ONLY
    if isinstance(extra, dict):
        keys.update({str(k): v for k, v in extra.items() if isinstance(v, str)})
    return keys


def instance_id(data_dir: Path) -> str | None:
    try:
        v = json.loads((Path(data_dir) / DIR / INSTANCE).read_text("utf-8-sig")).get("instance_id")
        return v if isinstance(v, str) and v.strip() else None
    except (OSError, ValueError, AttributeError):
        return None


def _verify(raw: bytes | None, settings: dict, iid: str | None, now: datetime | None = None) -> L.LicenceStatus:
    keys = trusted_keys(settings)
    good = {}
    for k, v in keys.items():           # a malformed key is ignored, never fatal
        try:
            good[k] = L.load_public_key(v)
        except (ValueError, TypeError, L.LicenceError):
            continue
    return L.verify(raw, good, now=now, instance_id=iid)


def status(data_dir: Path, settings: dict, now: datetime | None = None) -> L.LicenceStatus:
    """The installed licence, verified (cached until the file or the trusted keys change)."""
    p = lic_path(data_dir)
    key = (str(p), _fp(p), _fp(KEYS_FILE), json.dumps((settings.get("licence") or {}).get("public_keys") or {}, sort_keys=True),
           instance_id(data_dir), (now or L.utcnow()).strftime("%Y%m%d%H"))
    with _lock:
        hit = _cache.get(str(p))
        if hit and hit[0] == key:
            return hit[1]
    raw = p.read_bytes() if p.is_file() and p.stat().st_size <= MAX_BYTES else None
    st = _verify(raw, settings, instance_id(data_dir), now)
    with _lock:
        _cache[str(p)] = (key, st)
    return st


def entitlements(data_dir: Path, settings: dict, now: datetime | None = None) -> dict:
    """What this installation may do now. ``enforced`` False = 0.1 behaviour (no licence installed, none required)."""
    lic_cfg = settings.get("licence") or {}
    installed = lic_path(data_dir).is_file()
    if not installed and not lic_cfg.get("required"):
        modes = [m for m in (lic_cfg.get("modes") or ["local", "remote"]) if m in ("local", "remote")]
        lm = (settings.get("credits") or {}).get("local_month")
        return {"enforced": False, "can_run": True, "modes": modes or ["local"],
                "credits_month": int(lm) if lm not in (None, "") else None, "reason": "", "message": "", "licence": None}
    st = status(data_dir, settings, now)
    lic = st.licence or {}
    feats = st.features if st.licence else frozenset()
    writable = st.writable and F_LOCAL in feats
    modes = (["local"] if F_LOCAL in feats else []) + (["remote"] if F_REMOTE in feats else [])
    lim = st.limits.get(LIMIT) if st.licence else 0
    own = (settings.get("credits") or {}).get("local_month")   # the studio may set a lower cap of its own
    if own not in (None, "") and (lim is None or int(own) < lim):
        lim = int(own)
    if st.writable and st.licence and F_LOCAL not in feats:
        msg = "La licenza non comprende gli Strumenti: chiedi al fornitore di aggiungerli al piano."
    else:
        msg = _msg(st.message_it)
    return {"enforced": True, "can_run": bool(writable), "modes": modes if writable else [],
            "credits_month": lim, "reason": (st.reasons or [""])[0], "message": msg, "mode": st.mode,
            "licence": {"plan": lic.get("plan"), "customer": (lic.get("customer") or {}).get("name"),
                        "instance_id": lic.get("instance_id"), "expires_at": lic.get("expires_at"),
                        "features": sorted(feats), "limits": dict(st.limits) if st.licence else {},
                        "status": lic.get("status", "active"), "days_left": st.days_left} if st.licence else None}


def _msg(text: str) -> str:
    """The verifier speaks of the archive; here the read-only state means: no new jobs."""
    return (text or "").replace("archivio in sola lettura", "nessun lavoro nuovo (verifiche e risultati restano disponibili)") \
        .replace("l'archivio passa in sola lettura", "non si potranno avviare lavori nuovi")


def install(data_dir: Path, settings: dict, raw: bytes, force: bool = False, now: datetime | None = None) -> dict:
    """Verify and install a licence file. Refused: not genuine, for another installation, older than the installed one."""
    if not raw or len(raw) > MAX_BYTES:
        raise LicenceInstallError("file di licenza vuoto o troppo grande")
    iid = instance_id(data_dir)
    st = _verify(raw, settings, None, now)
    if st.mode == L.MODE_INVALID or not st.licence:
        raise LicenceInstallError(_msg(st.message_it))
    lic = st.licence
    if iid and lic.get("instance_id") != iid and not force:
        raise LicenceInstallError("questa licenza è di un'altra installazione (usa «forza» solo se hai cambiato PC)")
    cur = status(data_dir, settings, now)
    if cur.licence and not force and cur.licence.get("instance_id") == lic.get("instance_id") \
            and L.parse_time(lic["issued_at"]) < L.parse_time(cur.licence["issued_at"]):
        raise LicenceInstallError("è più vecchia della licenza installata")
    d = Path(data_dir) / DIR
    d.mkdir(parents=True, exist_ok=True)
    tmp = d / (FILE + ".tmp")
    tmp.write_bytes(raw)
    os.replace(tmp, d / FILE)
    if not iid or force:
        (d / INSTANCE).write_text(json.dumps({"instance_id": lic["instance_id"]}, indent=2) + "\n", "utf-8")
    with _lock:
        _cache.clear()
    return entitlements(data_dir, settings, now)


def write_trusted_key(key_id: str, public_b64: str) -> Path:
    """Adds a hub public key to ``trusted_keys.json`` next to this module (code folder)."""
    L.load_public_key(public_b64)                       # raises on a bad key
    keys = {}
    try:
        keys = (json.loads(KEYS_FILE.read_text("utf-8")) or {}).get("keys") or {}
    except (OSError, ValueError, AttributeError):
        keys = {}
    keys[key_id] = public_b64.strip()
    KEYS_FILE.write_text(json.dumps({"keys": keys}, indent=2) + "\n", "utf-8")
    with _lock:
        _cache.clear()
    return KEYS_FILE
