"""DocMap licence format and OFFLINE verifier.

STANDALONE MODULE: it depends only on the Python standard library and on
``cryptography``. The DocMap server copies or imports this file as is, so it
must never import anything else from ``docmap_hub``.

A licence is a JSON object signed with Ed25519. The signature covers the
canonical JSON of the ``licence`` object (keys sorted, compact separators,
UTF-8, no ASCII escaping). The file on disk (``*.docmap-licence``) is::

    {
      "format": 1,
      "key_id": "dmk20261101-ab12",
      "licence": { ...see REQUIRED_FIELDS... },
      "signature": "<base64 Ed25519 signature of canonical_json(licence)>"
    }

Golden rule (ROADMAP D5): a licence never locks the data.

* ``full``      - valid and not expired: everything allowed.
* ``grace``     - expired less than ``grace_days`` ago: everything allowed,
                  the app shows a renewal banner.
* ``read_only`` - expired beyond grace, or not yet valid: data readable,
                  exports allowed, no writes.
* ``invalid``   - missing, unreadable, tampered, unknown key, wrong
                  instance: callers MUST treat it like ``read_only``.

Optional fields (hub 0.7; older verifiers ignore them, so the hub also writes
them in a way that old verifiers already read correctly):

* ``status``     - ``active`` (default), ``suspended`` or ``revoked``. A
                   suspended/revoked licence is ``read_only`` with its own
                   reason. The hub also issues it already expired with
                   ``grace_days`` 0, so an older server goes read-only too.
* ``resume``     - for a suspended licence: the ``valid_from``/``expires_at``/
                   ``grace_days`` to restore on reactivation (hub bookkeeping).
* ``update_url`` - where the server can download the next licence of this
                   installation (``http(s)://``). The signature protects it.
"""

from __future__ import annotations

import base64
import binascii
import json
import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

FORMAT = 1
FILE_EXTENSION = ".docmap-licence"
DEFAULT_GRACE_DAYS = 30
#: Tolerance for a PC clock running slightly behind when checking valid_from.
CLOCK_SKEW = timedelta(hours=24)
#: In ``full`` mode, ``expiring_soon`` becomes True this many days before expiry.
WARN_DAYS = 30

MODE_FULL = "full"
MODE_GRACE = "grace"
MODE_READ_ONLY = "read_only"
MODE_INVALID = "invalid"
MODES = (MODE_FULL, MODE_GRACE, MODE_READ_ONLY, MODE_INVALID)

KNOWN_FEATURES = (
    "sync_server",
    "mobile_scan",
    "status_events",
    "ai_credits",
    "white_label",
)
LIMIT_KEYS = ("users", "binders", "archives")

REQUIRED_FIELDS = (
    "licence_id",
    "format",
    "customer",
    "instance_id",
    "plan",
    "issued_at",
    "valid_from",
    "expires_at",
    "grace_days",
    "limits",
    "features",
    "reseller",
    "branding",
    "key_id",
)

# Reason codes (stable, English, machine readable). ``MESSAGES_IT`` gives the
# Italian sentence to show to the user.
R_OK = "ok"
R_EXPIRING_SOON = "expiring_soon"
R_EXPIRED_IN_GRACE = "expired_in_grace"
R_EXPIRED = "expired_beyond_grace"
R_NOT_YET_VALID = "not_yet_valid"
R_MISSING = "missing"
R_BAD_FILE = "bad_file"
R_BAD_FORMAT = "unsupported_format"
R_BAD_FIELDS = "bad_fields"
R_UNKNOWN_KEY = "unknown_key"
R_KEY_MISMATCH = "key_id_mismatch"
R_BAD_SIGNATURE = "bad_signature"
R_INSTANCE_MISMATCH = "instance_mismatch"
R_SUSPENDED = "suspended"
R_REVOKED = "revoked"

STATUS_ACTIVE = "active"
STATUS_SUSPENDED = "suspended"
STATUS_REVOKED = "revoked"
STATUSES = (STATUS_ACTIVE, STATUS_SUSPENDED, STATUS_REVOKED)
UPDATE_URL_MAX = 400

MESSAGES_IT = {
    R_OK: "Licenza valida.",
    R_EXPIRING_SOON: "La licenza scade tra pochi giorni: contatta il fornitore per il rinnovo.",
    R_EXPIRED_IN_GRACE: "Licenza scaduta: periodo di tolleranza in corso. Rinnova per evitare la sola lettura.",
    R_EXPIRED: "Licenza scaduta oltre la tolleranza: archivio in sola lettura. I dati restano consultabili ed esportabili.",
    R_NOT_YET_VALID: "La licenza non è ancora attiva (data di inizio futura): archivio in sola lettura.",
    R_MISSING: "Nessuna licenza installata: archivio in sola lettura.",
    R_BAD_FILE: "File di licenza illeggibile: archivio in sola lettura.",
    R_BAD_FORMAT: "Formato di licenza non supportato da questa versione: archivio in sola lettura.",
    R_BAD_FIELDS: "Licenza incompleta o con campi non validi: archivio in sola lettura.",
    R_UNKNOWN_KEY: "Licenza firmata con una chiave sconosciuta: archivio in sola lettura.",
    R_KEY_MISMATCH: "Licenza incoerente (identificativo chiave): archivio in sola lettura.",
    R_BAD_SIGNATURE: "Firma della licenza non valida (file modificato?): archivio in sola lettura.",
    R_INSTANCE_MISMATCH: "La licenza è intestata a un'altra installazione: archivio in sola lettura.",
    R_SUSPENDED: "Licenza sospesa dal fornitore: archivio in sola lettura. I dati restano consultabili ed esportabili.",
    R_REVOKED: "Licenza revocata: archivio in sola lettura. I dati restano consultabili ed esportabili.",
}


class LicenceError(ValueError):
    """Raised by the signing helpers on malformed input."""


# --------------------------------------------------------------------------
# Canonical JSON and time helpers
# --------------------------------------------------------------------------

def canonical_json(obj: Any) -> bytes:
    """Deterministic UTF-8 JSON: sorted keys, compact, no ASCII escaping.

    Floats are rejected: their textual form is not stable across languages,
    and nothing in a licence needs them.
    """
    _reject_floats(obj)
    return json.dumps(
        obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")


def _reject_floats(obj: Any) -> None:
    if isinstance(obj, float):
        raise LicenceError("float values are not allowed in a licence")
    if isinstance(obj, dict):
        for k, v in obj.items():
            if not isinstance(k, str):
                raise LicenceError("licence keys must be strings")
            _reject_floats(v)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            _reject_floats(v)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def format_time(dt: datetime) -> str:
    """ISO 8601 UTC with a trailing Z, seconds precision."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_time(value: str) -> datetime:
    """Parse an ISO 8601 UTC timestamp ending in Z (or with an offset)."""
    if not isinstance(value, str) or not value:
        raise ValueError("timestamp must be a non-empty string")
    v = value.strip()
    if v.endswith("Z") or v.endswith("z"):
        v = v[:-1] + "+00:00"
    dt = datetime.fromisoformat(v)
    if dt.tzinfo is None:
        raise ValueError("timestamp must be UTC (end with Z)")
    return dt.astimezone(timezone.utc)


def _as_utc(now: datetime | None) -> datetime:
    if now is None:
        return utcnow()
    if now.tzinfo is None:
        return now.replace(tzinfo=timezone.utc)
    return now.astimezone(timezone.utc)


def _days(delta: timedelta) -> int:
    """Whole days, rounded away from zero (0.5 days left -> 1, -0.5 -> -1)."""
    s = delta.total_seconds()
    if s >= 0:
        return math.ceil(s / 86400)
    return -math.ceil(-s / 86400)


# --------------------------------------------------------------------------
# Keys
# --------------------------------------------------------------------------

def load_public_key(value: bytes | str | Ed25519PublicKey) -> Ed25519PublicKey:
    """Accept raw 32 bytes, base64 text (str or bytes) or a PEM public key."""
    if isinstance(value, Ed25519PublicKey):
        return value
    if isinstance(value, str):
        value = value.strip().encode("ascii")
    if not isinstance(value, (bytes, bytearray)):
        raise LicenceError("public key must be bytes, str or Ed25519PublicKey")
    value = bytes(value)
    if value.lstrip().startswith(b"-----BEGIN"):
        key = serialization.load_pem_public_key(value)
        if not isinstance(key, Ed25519PublicKey):
            raise LicenceError("PEM key is not Ed25519")
        return key
    if len(value) == 32:
        return Ed25519PublicKey.from_public_bytes(value)
    try:
        raw = base64.b64decode(value.strip(), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise LicenceError("public key is not valid base64") from exc
    if len(raw) != 32:
        raise LicenceError("Ed25519 public key must be 32 bytes")
    return Ed25519PublicKey.from_public_bytes(raw)


def load_public_keys_json(data: bytes | str) -> dict[str, Ed25519PublicKey]:
    """Load a public keys bundle ``{"keys": {key_id: base64}}`` (as written by
    ``python -m docmap_hub export-public-key --format json``)."""
    obj = json.loads(data)
    keys = obj.get("keys") if isinstance(obj, dict) else None
    if not isinstance(keys, dict):
        raise LicenceError("public keys bundle must contain a 'keys' object")
    return {str(k): load_public_key(v) for k, v in keys.items()}


# --------------------------------------------------------------------------
# Field validation
# --------------------------------------------------------------------------

def validate_fields(lic: Any) -> list[str]:
    """Return a list of problems (English, for logs). Empty list = OK."""
    errs: list[str] = []
    if not isinstance(lic, dict):
        return ["licence is not an object"]
    for f in REQUIRED_FIELDS:
        if f not in lic:
            errs.append(f"missing field: {f}")
    if errs:
        return errs
    if lic["format"] != FORMAT:
        errs.append("format must be 1")
    for f in ("licence_id", "instance_id", "plan", "key_id"):
        if not isinstance(lic[f], str) or not lic[f].strip():
            errs.append(f"{f} must be a non-empty string")
    cust = lic["customer"]
    if not isinstance(cust, dict) or not isinstance(cust.get("name"), str) or not cust["name"].strip():
        errs.append("customer.name is required")
    for f in ("issued_at", "valid_from", "expires_at"):
        try:
            parse_time(lic[f])
        except (ValueError, TypeError):
            errs.append(f"{f} is not an ISO UTC timestamp")
    if not errs and parse_time(lic["expires_at"]) <= parse_time(lic["valid_from"]):
        errs.append("expires_at must be after valid_from")
    g = lic["grace_days"]
    if not isinstance(g, int) or isinstance(g, bool) or g < 0:
        errs.append("grace_days must be a non-negative integer")
    limits = lic["limits"]
    if not isinstance(limits, dict):
        errs.append("limits must be an object")
    else:
        for k, v in limits.items():
            if v is not None and (not isinstance(v, int) or isinstance(v, bool) or v < 0):
                errs.append(f"limits.{k} must be a non-negative integer or null")
    feats = lic["features"]
    if not isinstance(feats, list) or not all(isinstance(x, str) for x in feats):
        errs.append("features must be a list of strings")
    res = lic["reseller"]
    if res is not None and (not isinstance(res, dict) or not res.get("id") or not res.get("name")):
        errs.append("reseller must be null or {id, name}")
    br = lic["branding"]
    if br is not None and (not isinstance(br, dict) or not isinstance(br.get("product_name"), str)):
        errs.append("branding must be null or {product_name, ...}")
    if "status" in lic and lic["status"] not in STATUSES:
        errs.append("status must be one of " + ", ".join(STATUSES))
    if "update_url" in lic:
        u = lic["update_url"]
        if not isinstance(u, str) or not u.startswith(("https://", "http://")) or len(u) > UPDATE_URL_MAX \
                or any(c.isspace() for c in u):
            errs.append("update_url must be an http(s) URL")
    if "resume" in lic and not isinstance(lic["resume"], dict):
        errs.append("resume must be an object")
    return errs


# --------------------------------------------------------------------------
# Signing (used by the hub; the server never needs it)
# --------------------------------------------------------------------------

def sign_licence(lic: dict, private_key: Ed25519PrivateKey) -> dict:
    """Return the file object ``{format, key_id, licence, signature}``."""
    errs = validate_fields(lic)
    if errs:
        raise LicenceError("; ".join(errs))
    sig = private_key.sign(canonical_json(lic))
    return {
        "format": FORMAT,
        "key_id": lic["key_id"],
        "licence": lic,
        "signature": base64.b64encode(sig).decode("ascii"),
    }


def encode_licence_file(file_obj: dict) -> bytes:
    """Human-readable text for a ``.docmap-licence`` file (UTF-8, LF)."""
    return (json.dumps(file_obj, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


# --------------------------------------------------------------------------
# Verification
# --------------------------------------------------------------------------

@dataclass
class LicenceStatus:
    mode: str
    reasons: list[str] = field(default_factory=list)
    licence: dict | None = None
    #: True only when the Ed25519 signature checked out with a known key.
    signature_ok: bool = False
    #: Days until ``expires_at`` (negative once expired). None if unknown.
    days_left: int | None = None
    #: Days of grace remaining (only meaningful in grace mode).
    grace_days_left: int | None = None
    expiring_soon: bool = False
    details: list[str] = field(default_factory=list)

    @property
    def writable(self) -> bool:
        """The app may create/modify data."""
        return self.mode in (MODE_FULL, MODE_GRACE)

    @property
    def read_only(self) -> bool:
        return not self.writable

    @property
    def show_banner(self) -> bool:
        return self.mode != MODE_FULL or self.expiring_soon

    @property
    def features(self) -> frozenset[str]:
        """Features of a genuinely signed licence (empty when invalid).

        In ``read_only`` the features are still reported (e.g. branding of a
        white-label instance must keep showing); writes are governed by
        :attr:`writable`, not by the features.
        """
        if not self.signature_ok or not self.licence:
            return frozenset()
        return frozenset(self.licence.get("features") or [])

    def has_feature(self, name: str) -> bool:
        return name in self.features

    @property
    def limits(self) -> dict:
        if not self.signature_ok or not self.licence:
            return {}
        return dict(self.licence.get("limits") or {})

    @property
    def branding(self) -> dict | None:
        if not self.signature_ok or not self.licence:
            return None
        return self.licence.get("branding")

    @property
    def message_it(self) -> str:
        """Main Italian sentence for the app banner."""
        for r in self.reasons:
            if r != R_OK:
                msg = MESSAGES_IT.get(r, "")
                if r == R_EXPIRING_SOON and self.days_left is not None:
                    return f"La licenza scade tra {self.days_left} giorni: contatta il fornitore per il rinnovo."
                if r == R_EXPIRED_IN_GRACE and self.grace_days_left is not None:
                    return (f"Licenza scaduta: restano {self.grace_days_left} giorni di tolleranza, "
                            "poi l'archivio passa in sola lettura. Rinnova la licenza.")
                return msg
        return MESSAGES_IT[R_OK]

    def to_dict(self) -> dict:
        return {
            "mode": self.mode,
            "writable": self.writable,
            "reasons": list(self.reasons),
            "message_it": self.message_it,
            "signature_ok": self.signature_ok,
            "days_left": self.days_left,
            "grace_days_left": self.grace_days_left,
            "expiring_soon": self.expiring_soon,
            "features": sorted(self.features),
            "limits": self.limits,
            "branding": self.branding,
            "licence": self.licence,
            "details": list(self.details),
        }


def _invalid(reason: str, licence: dict | None = None, details: list[str] | None = None) -> LicenceStatus:
    return LicenceStatus(mode=MODE_INVALID, reasons=[reason], licence=licence, details=details or [])


def missing() -> LicenceStatus:
    """Status to use when no licence file is installed."""
    return _invalid(R_MISSING)


def verify(
    file_bytes: bytes | str | None,
    public_keys: Mapping[str, bytes | str | Ed25519PublicKey],
    now: datetime | None = None,
    instance_id: str | None = None,
) -> LicenceStatus:
    """Verify a ``.docmap-licence`` file offline.

    :param file_bytes: content of the file (None/empty -> ``invalid``/missing).
    :param public_keys: trusted keys, ``{key_id: raw 32 bytes | base64 | PEM}``.
    :param now: evaluation time (default: current UTC time).
    :param instance_id: if given, the licence must be for this instance.
    Never raises on bad input: it returns ``mode == "invalid"``.
    """
    if file_bytes is None or (isinstance(file_bytes, (bytes, str)) and not file_bytes.strip()):
        return missing()
    try:
        if isinstance(file_bytes, (bytes, bytearray)):
            text = bytes(file_bytes).decode("utf-8-sig")
        else:
            text = file_bytes
        obj = json.loads(text)
    except (UnicodeDecodeError, ValueError) as exc:
        return _invalid(R_BAD_FILE, details=[str(exc)])
    if not isinstance(obj, dict) or not isinstance(obj.get("licence"), dict):
        return _invalid(R_BAD_FILE, details=["no 'licence' object"])
    lic = obj["licence"]
    if obj.get("format") != FORMAT or lic.get("format") != FORMAT:
        return _invalid(R_BAD_FORMAT, licence=lic)
    key_id = obj.get("key_id")
    if not isinstance(key_id, str) or key_id != lic.get("key_id"):
        return _invalid(R_KEY_MISMATCH, licence=lic)
    if key_id not in public_keys:
        return _invalid(R_UNKNOWN_KEY, licence=lic, details=[f"key_id {key_id!r} not trusted"])
    try:
        pub = load_public_key(public_keys[key_id])
        sig = base64.b64decode(str(obj.get("signature", "")), validate=True)
        pub.verify(sig, canonical_json(lic))
    except (InvalidSignature, binascii.Error, ValueError, LicenceError) as exc:
        return _invalid(R_BAD_SIGNATURE, licence=lic, details=[type(exc).__name__])
    errs = validate_fields(lic)
    if errs:
        return _invalid(R_BAD_FIELDS, licence=lic, details=errs)
    if instance_id is not None and lic["instance_id"] != instance_id:
        return _invalid(R_INSTANCE_MISMATCH, licence=lic,
                        details=[f"licence for {lic['instance_id']}, this is {instance_id}"])

    t = _as_utc(now)
    valid_from = parse_time(lic["valid_from"])
    expires = parse_time(lic["expires_at"])
    grace_end = expires + timedelta(days=lic["grace_days"])
    days_left = _days(expires - t)
    st = LicenceStatus(mode=MODE_FULL, licence=lic, signature_ok=True, days_left=days_left)

    if lic.get("status") in (STATUS_SUSPENDED, STATUS_REVOKED):
        st.mode = MODE_READ_ONLY
        st.grace_days_left = 0
        st.reasons = [R_SUSPENDED if lic["status"] == STATUS_SUSPENDED else R_REVOKED]
    elif t + CLOCK_SKEW < valid_from:
        st.mode = MODE_READ_ONLY
        st.reasons = [R_NOT_YET_VALID]
    elif t < expires:
        st.mode = MODE_FULL
        st.expiring_soon = days_left <= WARN_DAYS
        st.reasons = [R_EXPIRING_SOON] if st.expiring_soon else [R_OK]
    elif t < grace_end:
        st.mode = MODE_GRACE
        st.grace_days_left = _days(grace_end - t)
        st.reasons = [R_EXPIRED_IN_GRACE]
    else:
        st.mode = MODE_READ_ONLY
        st.grace_days_left = 0
        st.reasons = [R_EXPIRED]
    return st


# --------------------------------------------------------------------------
# Limits
# --------------------------------------------------------------------------

@dataclass
class LimitsReport:
    #: False when usage is above a limit or when the app is not writable.
    ok: bool
    #: ``{name: {"used": n, "limit": m}}`` where used > limit.
    exceeded: dict = field(default_factory=dict)
    #: names where used >= limit: adding one more is not allowed.
    at_limit: list = field(default_factory=list)
    #: ``{name: limit or None}`` (None = unlimited) as applied.
    limits: dict = field(default_factory=dict)

    def can_add(self, name: str) -> bool:
        """True if one more ``name`` (e.g. a user) may be created."""
        return name not in self.at_limit


def check_limits(status: LicenceStatus, usage: Mapping[str, int]) -> LimitsReport:
    """Compare current usage (e.g. ``{"users": 3, "binders": 1200}``) with
    the licence limits. A missing key or ``None`` limit means unlimited.

    When the status is not writable every limit is reported as reached
    (nothing may be added), but nothing is ever deleted or hidden.
    """
    limits = status.limits
    applied = {k: limits.get(k) for k in set(limits) | set(usage)}
    rep = LimitsReport(ok=True, limits=applied)
    for name, used in usage.items():
        lim = limits.get(name)
        if not status.writable:
            rep.at_limit.append(name)
            continue
        if lim is None:
            continue
        if used > lim:
            rep.exceeded[name] = {"used": used, "limit": lim}
            rep.ok = False
        if used >= lim:
            rep.at_limit.append(name)
    if not status.writable:
        rep.ok = False
    rep.at_limit.sort()
    return rep
