"""Licence enforcement for the Python server (roadmap phase F3).

The verifier is `licence_verify.py`, a byte-identical copy of `docmapv1/hub/docmap_hub/licence.py` (never edit it here:
re-copy it from the hub; tests/test_licence.py checks that the two files are equal when the hub folder exists).

COMPATIBILITY: enforcement is OFF unless the configuration says `"licence_required": true` (config.json) /
`'licence_required' => true` (config.php). When it is off the server behaves exactly like server-php/api.php: no
licence check, no `licence` object in `me` / `ping`. So upgrading an existing studio never puts it in read-only.

When it is on:
  * the licence is `<data_dir>/licence/licence.docmap-licence`, the installation identity `<data_dir>/instance.json`
    (`{"instance_id": "…"}`; if it is missing, the instance_id of the first genuinely signed licence is adopted and
    written there, as hub/README.md §6 says);
  * the signature is checked against TRUSTED_LICENCE_KEYS (a constant in the code: whoever can write in the data folder
    must not be able to replace the key). The configuration key `licence_public_keys` ({key_id: base64}) adds keys
    and exists ONLY FOR TESTS / DEVELOPMENT — never set it on a customer's installation;
  * the status is cached and verified again at most every 10 minutes, or at once when the licence / instance file
    changes (mtime, size);
  * `full` / `grace` → writable; `read_only` / `invalid` → write routes answer 403 `licence_read_only`
    (reads, pull and exports keep working: the licence never locks the data);
  * limits: a push that would create binders beyond `limits.binders`, or a token_create for a new user beyond
    `limits.users`, answers 403 `licence_limit`. Nothing is ever deleted or hidden when a limit is exceeded.
"""
from __future__ import annotations

import json
import os
import shutil
import threading
import time

from . import licence_verify as L

#: Public keys trusted for licence signatures: {key_id: base64 Ed25519 public key}, from
#: `python -m docmap_hub export-public-key`. Empty until the first production key is exported by the hub.
TRUSTED_LICENCE_KEYS: dict[str, str] = {}

RECHECK_SECONDS = 600
READ_ONLY_MESSAGE = "licence expired or missing: the server is in read-only mode"
LIMIT_MESSAGE = "licence limit reached: %s"
LICENCE_DIR = "licence"
LICENCE_FILE = "licence.docmap-licence"
LICENCE_PREV = "licence.prev.docmap-licence"
INSTANCE_FILE = "instance.json"

_lock = threading.Lock()
_cache: dict = {}   # data_dir -> (fingerprint, checked_at, status)


# ---------------------------------------------------------------- configuration
def required(c) -> bool:
    """True only when the configuration explicitly turns enforcement on."""
    v = c.get("licence_required") if isinstance(c, dict) else None
    return v is True or (type(v) is int and v == 1)


def trusted_keys(c) -> dict:
    keys = dict(TRUSTED_LICENCE_KEYS)
    extra = c.get("licence_public_keys") if isinstance(c, dict) else None   # TESTS / DEVELOPMENT ONLY
    if isinstance(extra, dict):
        for k, v in extra.items():
            if isinstance(v, str):
                keys[str(k)] = v
    return keys


def licence_path(data_dir: str) -> str:
    return os.path.join(data_dir, LICENCE_DIR, LICENCE_FILE)


def instance_path(data_dir: str) -> str:
    return os.path.join(data_dir, INSTANCE_FILE)


def read_instance_id(data_dir: str):
    try:
        with open(instance_path(data_dir), "rb") as f:
            obj = json.loads(f.read().decode("utf-8-sig"))
        iid = obj.get("instance_id") if isinstance(obj, dict) else None
        return iid if isinstance(iid, str) and iid.strip() else None
    except (OSError, ValueError, UnicodeDecodeError):
        return None


def write_instance_id(data_dir: str, instance_id: str) -> None:
    tmp = instance_path(data_dir) + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps({"instance_id": instance_id}, indent=2) + "\n")
    os.replace(tmp, instance_path(data_dir))


def _stat(p):
    try:
        s = os.stat(p)
        return (s.st_mtime_ns, s.st_size)
    except OSError:
        return None


# ---------------------------------------------------------------- verification
def evaluate(data_dir: str, keys: dict, now=None) -> L.LicenceStatus:
    """Verify the installed licence now (no cache). Adopts the instance_id when instance.json is missing."""
    try:
        with open(licence_path(data_dir), "rb") as f:
            raw = f.read()
    except OSError:
        raw = None
    iid = read_instance_id(data_dir)
    st = L.verify(raw, keys, now=now, instance_id=iid)
    if iid is None and st.signature_ok and st.licence and isinstance(st.licence.get("instance_id"), str):
        try:
            write_instance_id(data_dir, st.licence["instance_id"])
        except OSError:
            pass
    return st


def status(c) -> L.LicenceStatus:
    """Cached status for the configuration `c` (re-verified every RECHECK_SECONDS or when the files change)."""
    dd = c["data_dir"]
    keys = trusted_keys(c)
    fp = (_stat(licence_path(dd)), _stat(instance_path(dd)), tuple(sorted(keys.items())))
    now = time.monotonic()
    with _lock:
        hit = _cache.get(dd)
        if hit and hit[0] == fp and now - hit[1] < RECHECK_SECONDS:
            return hit[2]
    st = evaluate(dd, keys)
    fp = (_stat(licence_path(dd)), _stat(instance_path(dd)), fp[2])   # instance.json may have just been written
    with _lock:
        _cache[dd] = (fp, now, st)
    return st


def clear_cache() -> None:
    with _lock:
        _cache.clear()


def current_mode(c=None) -> str:
    """'full' when enforcement is off; otherwise the verifier's mode (full, grace, read_only, invalid)."""
    if not required(c):
        return "full"
    return status(c).mode


# ---------------------------------------------------------------- API helpers (called by api.handle)
def summary(st: L.LicenceStatus, detailed: bool) -> dict:
    """The `licence` object of `me` (detailed) and `ping` (short, no customer data: ping needs no token)."""
    out = {"mode": st.mode, "writable": st.writable, "message_it": st.message_it, "reasons": list(st.reasons),
           "days_left": st.days_left, "grace_days_left": st.grace_days_left, "expiring_soon": st.expiring_soon}
    if detailed:
        lic = st.licence if st.signature_ok and st.licence else {}
        cust = lic.get("customer") if isinstance(lic.get("customer"), dict) else {}
        out.update({"features": sorted(st.features), "limits": st.limits, "branding": st.branding,
                    "licence": {"licence_id": lic.get("licence_id"), "customer": {"name": cust.get("name")},
                                "plan": lic.get("plan"), "valid_from": lic.get("valid_from"),
                                "expires_at": lic.get("expires_at"), "instance_id": lic.get("instance_id")}
                    if lic else None})
    return out


def write_block(c):
    """None when writes are allowed, else (message, extra) for the 403 licence_read_only answer."""
    if not required(c):
        return None
    st = status(c)
    if st.writable:
        return None
    return READ_ONLY_MESSAGE, {"mode": st.mode, "reasons": list(st.reasons), "message_it": st.message_it}


def limit_block(c, name: str, used: int, adding: int = 1):
    """None when `adding` more `name` (users, binders) fit the licence, else (message, extra) for 403 licence_limit."""
    if not required(c) or adding <= 0:
        return None
    st = status(c)
    rep = L.check_limits(st, {name: used + adding - 1})
    if rep.can_add(name):
        return None
    return LIMIT_MESSAGE % name, {"limit": name, "max": st.limits.get(name), "used": used, "adding": adding,
                                  "message_it": "Limite della licenza raggiunto (%s): contatta il fornitore per ampliare il piano." % name}


# ---------------------------------------------------------------- CLI: python -m docmap_server licence install|status
MODE_IT = {L.MODE_FULL: "VALIDA", L.MODE_GRACE: "IN TOLLERANZA", L.MODE_READ_ONLY: "SOLA LETTURA", L.MODE_INVALID: "NON VALIDA"}


def describe(st: L.LicenceStatus, c) -> str:
    lic = st.licence or {}
    lines = ["Stato:         %s (%s)" % (MODE_IT.get(st.mode, st.mode), st.mode), "Messaggio:     " + st.message_it]
    if lic:
        cust = lic.get("customer") if isinstance(lic.get("customer"), dict) else {}
        lines += ["Cliente:       %s" % cust.get("name"), "Piano:         %s" % lic.get("plan"),
                  "Installazione: %s" % lic.get("instance_id"),
                  "Validità:      dal %s al %s (+%s giorni di tolleranza)" % (lic.get("valid_from"), lic.get("expires_at"), lic.get("grace_days"))]
        lim = lic.get("limits") if isinstance(lic.get("limits"), dict) else {}
        lines.append("Limiti:        " + ", ".join("%s %s" % (k, "illimitato" if v is None else v) for k, v in sorted(lim.items())))
    if st.days_left is not None:
        lines.append("Giorni alla scadenza: %d" % st.days_left)
    if st.mode == L.MODE_GRACE and st.grace_days_left is not None:
        lines.append("Giorni di tolleranza rimasti: %d" % st.grace_days_left)
    if not required(c):
        lines.append("Nota: il controllo della licenza è DISATTIVATO (manca \"licence_required\": true nella configurazione):"
                     " il server accetta le scritture comunque.")
    return "\n".join(lines)


def cli(args, config_path: str) -> int:
    from .phpconfig import read_config_file
    try:
        c = read_config_file(config_path)
    except Exception as e:   # noqa: BLE001
        print("Errore: configurazione non leggibile (%s): %s" % (config_path, e))
        return 2
    dd = c.get("data_dir") if isinstance(c, dict) else None
    if not isinstance(dd, str) or not os.path.isdir(dd):
        print("Errore: data_dir mancante o inesistente nella configurazione %s" % config_path)
        return 2
    keys = trusted_keys(c)
    if args.licence_cmd == "status":
        print("File licenza:  " + licence_path(dd))
        print(describe(evaluate(dd, keys), c))
        return 0
    # install
    try:
        with open(args.file, "rb") as f:
            raw = f.read()
    except OSError as e:
        print("Errore: impossibile leggere %s: %s" % (args.file, e))
        return 2
    iid = read_instance_id(dd)
    st = L.verify(raw, keys, instance_id=iid)
    if not st.signature_ok or st.mode == L.MODE_INVALID:
        print("Licenza RIFIUTATA: " + st.message_it)
        if st.details:
            print("Dettagli: " + "; ".join(st.details))
        print("La licenza attuale non è stata modificata.")
        return 1
    ldir = os.path.join(dd, LICENCE_DIR)
    os.makedirs(ldir, exist_ok=True)
    cur = licence_path(dd)
    had_prev = os.path.isfile(cur)
    if had_prev:
        shutil.copy2(cur, os.path.join(ldir, LICENCE_PREV))
    tmp = cur + ".tmp"
    with open(tmp, "wb") as f:
        f.write(raw)
    os.replace(tmp, cur)
    if iid is None:
        write_instance_id(dd, st.licence["instance_id"])
        print("Identità dell'installazione impostata: %s (%s)" % (st.licence["instance_id"], instance_path(dd)))
    clear_cache()
    print("Licenza installata in " + cur + (" (la precedente è in %s)" % LICENCE_PREV if had_prev else ""))
    print(describe(evaluate(dd, keys), c))
    print("Il server in esecuzione la vede entro pochi secondi (il file è cambiato): non serve riavviarlo.")
    return 0
