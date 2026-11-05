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
  * the signature is checked against the TRUSTED keys: the constant TRUSTED_LICENCE_KEYS PLUS the file
    `docmap_server/trusted_keys.json` next to this module (written by `installer-windows/docmap_tools.py pacchetto
    --chiave-pubblica <file of python -m docmap_hub export-public-key>`, same JSON format: {"keys": {key_id: base64}}).
    THREAT MODEL: the file lives in the server CODE folder, not in the data folder. Whoever can write the code folder can
    already run any code as the server (so no file there can be "more" trusted than the code itself); whoever can only
    write the data folder (a backup restore, a synced folder, the web user of a PHP host) cannot add a key. On the studio
    PC the installer makes C:\\DocMap\\server writable only by Administrators/SYSTEM. A malformed file or an invalid key
    is ignored (logged), never fatal: the worst case is "licence not verified" = read-only, never data loss.
    The configuration key `licence_public_keys` ({key_id: base64}) adds keys and exists ONLY FOR TESTS / DEVELOPMENT —
    never set it on a customer's installation;
  * the status is cached and verified again at most every 10 minutes, or at once when the licence / instance file
    changes (mtime, size);
  * `full` / `grace` → writable; `read_only` / `invalid` → write routes answer 403 `licence_read_only`
    (reads, pull and exports keep working: the licence never locks the data);
  * limits: a push that would create binders beyond `limits.binders`, or a token_create for a new user beyond
    `limits.users`, answers 403 `licence_limit`. Nothing is ever deleted or hidden when a limit is exceeded.

Licence channel (hub 0.7): a licence may carry `update_url` (signed). `python -m docmap_server licence update` — and,
while `serve` runs with enforcement on, a background check every 6 hours — downloads that address (or the
configuration's `licence_update_url`), verifies signature + installation, and installs the file ONLY if it was issued
after the installed one (so an old, longer licence can never be put back: neither by the channel nor by
`licence install`, unless `--force`). This is how a suspension, a reactivation, a limit change or a short automatic
renewal made on the hub reaches the server with no inbound connection. Network errors are logged, never fatal.
"""
from __future__ import annotations

import base64
import binascii
import json
import logging
import os
import re
import shutil
import threading
import time

from . import licence_verify as L

#: Public keys trusted for licence signatures: {key_id: base64 Ed25519 public key}, from
#: `python -m docmap_hub export-public-key`. Empty until the first production key is exported by the hub.
TRUSTED_LICENCE_KEYS: dict[str, str] = {}

#: Extra trusted keys shipped with the code (see the threat model above). Same format as `export-public-key --format json`.
TRUSTED_KEYS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "trusted_keys.json")
TRUSTED_KEYS_MAX_BYTES = 64 * 1024
KEY_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$")
log = logging.getLogger("docmap.licence")
_file_cache: dict = {}   # path -> (fingerprint, keys)

RECHECK_SECONDS = 600
UPDATE_SECONDS = 6 * 3600
UPDATE_FIRST_SECONDS = 60
UPDATE_MAX_BYTES = 64 * 1024
UPDATE_TIMEOUT = 20
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


def valid_public_key_b64(v) -> bool:
    """A base64 text that decodes to exactly 32 bytes (Ed25519 raw public key)."""
    if not isinstance(v, str) or not v.strip() or len(v) > 100:
        return False
    try:
        return len(base64.b64decode(v.strip(), validate=True)) == 32
    except (binascii.Error, ValueError):
        return False


def load_trusted_keys_file(path: str = None) -> dict:
    """{key_id: base64} from trusted_keys.json; {} when the file is missing or unreadable. Never raises."""
    path = path or TRUSTED_KEYS_FILE
    fp = _stat(path)
    if fp is None:
        return {}
    hit = _file_cache.get(path)
    if hit and hit[0] == fp:
        return dict(hit[1])
    keys = {}
    try:
        if fp[1] > TRUSTED_KEYS_MAX_BYTES:
            raise ValueError("file too large (%d bytes)" % fp[1])
        with open(path, "rb") as f:
            obj = json.loads(f.read().decode("utf-8-sig"))
        raw = obj.get("keys") if isinstance(obj, dict) else None
        if not isinstance(raw, dict):
            raise ValueError("no 'keys' object")
        for k, v in raw.items():
            if KEY_ID_RE.match(str(k)) and valid_public_key_b64(v):
                keys[str(k)] = v.strip()
            else:
                log.warning("docmap: trusted_keys.json: key %r ignored (invalid key id or not a 32-byte base64 Ed25519 key)", str(k)[:70])
    except (OSError, ValueError, UnicodeDecodeError) as e:
        log.warning("docmap: trusted_keys.json ignored (%s): %s", path, e)
        keys = {}
    _file_cache[path] = (fp, keys)
    return dict(keys)


def trusted_keys(c) -> dict:
    keys = load_trusted_keys_file()
    keys.update(TRUSTED_LICENCE_KEYS)          # the constant wins over the file on the same key id
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
        _file_cache.clear()


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


# ---------------------------------------------------------------- install / update from the hub's channel
def _issued(st) -> str:
    lic = st.licence if st and st.signature_ok and isinstance(st.licence, dict) else {}
    v = lic.get("issued_at")
    return v if isinstance(v, str) else ""


def check_candidate(dd: str, raw: bytes, keys: dict, force: bool = False, allow_same: bool = False):
    """(status, None) when `raw` may replace the installed licence, else (status, reason in Italian)."""
    iid = read_instance_id(dd)
    st = L.verify(raw, keys, instance_id=iid)
    if not st.signature_ok or st.mode == L.MODE_INVALID:
        return st, "Licenza rifiutata: " + st.message_it
    cur = evaluate(dd, keys)
    if not force and cur.signature_ok and cur.licence:
        if st.licence.get("licence_id") == cur.licence.get("licence_id"):
            return st, (None if allow_same else "È già la licenza installata.")
        if L.parse_time(st.licence["issued_at"]) < L.parse_time(cur.licence["issued_at"]):
            return st, ("Licenza più vecchia di quella installata (emessa il %s, installata emessa il %s): "
                        "non sostituita." % (st.licence["issued_at"], cur.licence["issued_at"]))
    return st, None


def install_bytes(dd: str, raw: bytes, st) -> bool:
    """Atomic install (the previous file is kept as licence.prev); returns True if there was a previous one."""
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
    if read_instance_id(dd) is None:
        write_instance_id(dd, st.licence["instance_id"])
    clear_cache()
    return had_prev


def update_url(c, keys=None):
    """The configured `licence_update_url`, else the `update_url` signed inside the installed licence."""
    u = c.get("licence_update_url") if isinstance(c, dict) else None
    if isinstance(u, str) and u.startswith(("https://", "http://")):
        return u
    st = evaluate(c["data_dir"], keys if keys is not None else trusted_keys(c))
    lic = st.licence if st.signature_ok and isinstance(st.licence, dict) else {}
    u = lic.get("update_url")
    return u if isinstance(u, str) and u.startswith(("https://", "http://")) else None


def fetch_update(c, opener=None) -> dict:
    """Download, verify and (if newer) install the next licence. Never raises: returns {"result": ...}."""
    import urllib.request
    dd = c.get("data_dir") if isinstance(c, dict) else None
    if not isinstance(dd, str) or not os.path.isdir(dd):
        return {"result": "error", "message": "data_dir mancante"}
    keys = trusted_keys(c)
    url = update_url(c, keys)
    if not url:
        return {"result": "no_url", "message": "Nessun indirizzo di aggiornamento (la licenza non ne contiene)."}
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "DocMap-server licence update",
                                                   "Cache-Control": "no-cache"})
        op = opener or urllib.request.urlopen
        with op(req, timeout=UPDATE_TIMEOUT) as r:
            raw = r.read(UPDATE_MAX_BYTES + 1)
        if len(raw) > UPDATE_MAX_BYTES:
            raise ValueError("file troppo grande")
    except Exception as e:   # noqa: BLE001 - offline, 404, TLS: try again later
        return {"result": "error", "url": url, "message": "Download non riuscito: %s" % e}
    st, why = check_candidate(dd, raw, keys)
    if why:
        return {"result": "unchanged", "url": url, "message": why}
    install_bytes(dd, raw, st)
    log.warning("docmap: new licence installed from %s (%s, mode %s)", url, st.licence.get("licence_id"), st.mode)
    return {"result": "installed", "url": url, "licence_id": st.licence.get("licence_id"),
            "mode": evaluate(dd, keys).mode, "message": "Nuova licenza installata."}


_updater = {"thread": None, "last": None}


def start_updater(config_path: str, read_config=None):
    """Background check while `serve` runs: first after 1 minute, then every 6 hours. Only with enforcement on."""
    if _updater["thread"] is not None:
        return _updater["thread"]
    stop = threading.Event()

    def loop():
        wait = UPDATE_FIRST_SECONDS
        while not stop.wait(wait):
            wait = UPDATE_SECONDS
            try:
                if read_config is None:
                    from .phpconfig import read_config_file as rc
                else:
                    rc = read_config
                c = rc(config_path)
                if required(c):
                    _updater["last"] = fetch_update(c)
                    if _updater["last"]["result"] == "error":
                        log.info("docmap: licence update: %s", _updater["last"]["message"])
            except Exception as e:   # noqa: BLE001 - never kill the server for this
                log.warning("docmap: licence update failed: %s", e)
    t = threading.Thread(target=loop, daemon=True, name="docmap-licence-update")
    t.stop = stop  # type: ignore[attr-defined]
    _updater["thread"] = t
    t.start()
    return t


# ---------------------------------------------------------------- CLI: python -m docmap_server licence install|status|update
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
    if not keys:
        print("ATTENZIONE: nessuna chiave pubblica fidata (manca %s): nessuna licenza può risultare valida. "
              "Reinstalla con il pacchetto preparato dal hub (docmap_tools.py pacchetto --chiave-pubblica …)." % TRUSTED_KEYS_FILE)
    if args.licence_cmd == "status":
        print("File licenza:  " + licence_path(dd))
        print("Chiavi fidate: %s" % (", ".join(sorted(keys)) or "nessuna"))
        print(describe(evaluate(dd, keys), c))
        print("Aggiornamento: " + (update_url(c, keys) or "nessun indirizzo (licenza senza canale)"))
        return 0
    if args.licence_cmd == "update":
        r = fetch_update(c)
        print(r["message"])
        if r.get("url"):
            print("Indirizzo: " + r["url"])
        if r["result"] == "installed":
            print(describe(evaluate(dd, keys), c))
        return 0 if r["result"] in ("installed", "unchanged") else 1
    # install
    try:
        with open(args.file, "rb") as f:
            raw = f.read()
    except OSError as e:
        print("Errore: impossibile leggere %s: %s" % (args.file, e))
        return 2
    iid = read_instance_id(dd)
    st, why = check_candidate(dd, raw, keys, force=bool(getattr(args, "force", False)), allow_same=True)
    if why:
        print(("Licenza RIFIUTATA: " + st.message_it) if why.startswith("Licenza rifiutata") else why)
        if st.details:
            print("Dettagli: " + "; ".join(st.details))
        print("La licenza attuale non è stata modificata.")
        return 1
    cur = licence_path(dd)
    had_prev = install_bytes(dd, raw, st)
    if iid is None:
        print("Identità dell'installazione impostata: %s (%s)" % (st.licence["instance_id"], instance_path(dd)))
    print("Licenza installata in " + cur + (" (la precedente è in %s)" % LICENCE_PREV if had_prev else ""))
    print(describe(evaluate(dd, keys), c))
    print("Il server in esecuzione la vede entro pochi secondi (il file è cambiato): non serve riavviarlo.")
    return 0
