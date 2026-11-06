"""v0.7: licence control at a distance.

* **Lifecycle** — every change issues a NEW signed licence that supersedes the current one (the old file is never
  edited): ``suspend`` (read-only now, data never locked), ``reactivate``, ``revoke`` (end of contract: read-only,
  auto-renew off, renewals blocked until reactivated), ``modify`` (limits, features, expiry, grace).
  A suspended/revoked licence carries ``status`` for new verifiers AND is already expired with ``grace_days`` 0, so
  servers installed before 0.7 go read-only as well. ``resume`` keeps the dates to restore.
* **Channel** — the hub publishes each installation's current licence file on a web space Dave controls (a
  registered ``web-php`` environment, folder ``licenze/``), at an unguessable address that is written, signed, inside
  the licence (``update_url``). The DocMap server downloads it by itself (``python -m docmap_server licence update``,
  and every 6 hours while it runs), verifies the signature and installation, and installs it only if it is newer.
  The files contain no secret; the signature makes tampering useless.
* **Auto-renew** — per installation: short licences (e.g. 35 days) renewed when ``renew_before`` days are left,
  optionally until a date. If Dave stops it (or suspends), the installation goes read-only by itself at the end of
  the short period plus its grace: control without any connection *to* the customer.
"""

from __future__ import annotations

import copy
import json
import secrets
import threading
import uuid
from datetime import datetime, timedelta, timezone

from . import licence as L
from .registry import RegistryError

CHANNEL_SETTING = "licence.channel"
FOLDER = "licenze"
TOKEN_PREFIX = "licence.token."
PUBLISHED_PREFIX = "licence.published."
AUTORENEW_PREFIX = "licence.autorenew."
REVOKED_PREFIX = "licence.revoked."
AUTORENEW_DEFAULT = {"days": 35, "renew_before": 10, "until": None}
CHECK_EVERY = 30 * 60
INDEX_HTML = b"<!doctype html><title>DocMap</title>\n"
HTACCESS = (b"Options -Indexes\n<IfModule mod_mime.c>\nAddType application/json .docmap-licence\n</IfModule>\n"
            b"<IfModule mod_headers.c>\nHeader set Cache-Control \"no-store\"\nHeader set X-Robots-Tag \"noindex\"\n"
            b"</IfModule>\n")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _jget(reg, key):
    v = reg.get_setting(key)
    try:
        return json.loads(v) if v else None
    except ValueError:
        return None


def _jset(reg, key, value) -> None:
    reg.set_setting(key, json.dumps(value, ensure_ascii=False, sort_keys=True) if value is not None else None, log=False)


# ---------------------------------------------------------------------------
# channel
# ---------------------------------------------------------------------------

def channel(reg) -> dict | None:
    """{env_id, env_name, base_url} or None. ``base_url`` ends with ``/licenze/``."""
    c = _jget(reg, CHANNEL_SETTING)
    if not c or not c.get("env_id"):
        return None
    try:
        e = reg.get_environment(c["env_id"])
    except RegistryError:
        return None
    url = (e.get("url") or "").rstrip("/") + "/" + FOLDER + "/"
    inst = reg.get_instance(e["instance_id"])
    return {"env_id": e["id"], "label": f"{inst['label']} · {e['name']}", "customer_id": inst["customer_id"],
            "base_url": url, "url_ok": url.startswith(("https://", "http://"))}


def set_channel(reg, env_id: str | None) -> dict | None:
    if not env_id:
        reg.set_setting(CHANNEL_SETTING, None)
        reg.log("licence.channel", details={"env_id": None})
        return None
    e = reg.get_environment(env_id)
    if e["kind"] != "web-php":
        raise RegistryError("Il canale delle licenze deve essere un sito online (web-php) con accesso FTP.")
    if not (e.get("url") or "").startswith(("https://", "http://")):
        raise RegistryError("Il sito scelto non ha un indirizzo http(s).")
    _jset(reg, CHANNEL_SETTING, {"env_id": e["id"]})
    reg.log("licence.channel", "environment", e["id"])
    return channel(reg)


def token_for(reg, iid: str, create: bool = True) -> str | None:
    t = reg.get_setting(TOKEN_PREFIX + iid)
    if not t and create:
        t = secrets.token_urlsafe(18).replace("-", "x").replace("_", "y")
        reg.set_setting(TOKEN_PREFIX + iid, t, log=False)
    return t


def update_url(reg, iid: str) -> str | None:
    ch = channel(reg)
    if not ch or not ch["url_ok"]:
        return None
    return ch["base_url"] + token_for(reg, iid) + L.FILE_EXTENSION


# ---------------------------------------------------------------------------
# state
# ---------------------------------------------------------------------------

def current(reg, iid: str) -> dict | None:
    """The installation's licence in force: the newest one not superseded."""
    return reg.latest_licence(iid)


def status_of(lic: dict) -> str:
    return lic.get("status") or L.STATUS_ACTIVE


def is_revoked(reg, iid: str) -> bool:
    return bool(reg.get_setting(REVOKED_PREFIX + iid))


def _need_current(reg, iid: str) -> dict:
    cur = current(reg, iid)
    if cur is None:
        raise RegistryError("Questa installazione non ha ancora una licenza: emettila prima.")
    return cur


def _derive(hub, cur: dict, key_id: str, now: datetime) -> dict:
    """A copy of the current licence with a new id, issue time, key and (current) update_url."""
    lic = copy.deepcopy(cur["licence"])
    # issued_at strictly increases per installation: servers install only a licence issued after theirs
    issued = max(now, L.parse_time(cur["licence"]["issued_at"]) + timedelta(seconds=1))
    lic.update(licence_id=str(uuid.uuid4()), issued_at=L.format_time(issued), key_id=key_id)
    url = update_url(hub.registry, lic["instance_id"])
    if url:
        lic["update_url"] = url
    else:
        lic.pop("update_url", None)
    return lic


def _store(hub, priv, lic: dict, cur: dict, action: str, details: dict | None = None) -> dict:
    res = hub._sign_and_store(lic, priv, supersedes=cur["id"])
    hub.registry.log(action, "licence", lic["licence_id"], dict(details or {}, instance_id=lic["instance_id"]))
    return res


def suspend(hub, key_id, priv, iid: str, *, revoke: bool = False, reason: str = "", now: datetime | None = None) -> dict:
    reg, now = hub.registry, now or _now()
    iid = reg.get_instance(iid)["id"]
    cur = _need_current(reg, iid)
    prev = cur["licence"]
    st = status_of(prev)
    if st == L.STATUS_REVOKED or (st == L.STATUS_SUSPENDED and not revoke):
        raise RegistryError("La licenza è già " + ("revocata." if st == L.STATUS_REVOKED else "sospesa."))
    lic = _derive(hub, cur, key_id, now)
    resume = prev.get("resume") if isinstance(prev.get("resume"), dict) else {
        "valid_from": prev["valid_from"], "expires_at": prev["expires_at"], "grace_days": prev["grace_days"]}
    lic.update(status=L.STATUS_REVOKED if revoke else L.STATUS_SUSPENDED, resume=resume, grace_days=0,
               valid_from=L.format_time(now - timedelta(minutes=2)), expires_at=L.format_time(now - timedelta(minutes=1)))
    if revoke:
        reg.set_setting(REVOKED_PREFIX + iid, L.format_time(now), log=False)
        set_autorenew(reg, iid, None)
    return _store(hub, priv, lic, cur, "licence.revoke" if revoke else "licence.suspend", {"reason": reason[:200]})


def reactivate(hub, key_id, priv, iid: str, *, months: int | None = None, now: datetime | None = None) -> dict:
    """Back to the dates kept in ``resume``; with ``months`` (or if those dates are past) extended from now."""
    reg, now = hub.registry, now or _now()
    iid = reg.get_instance(iid)["id"]
    cur = _need_current(reg, iid)
    prev = cur["licence"]
    if status_of(prev) == L.STATUS_ACTIVE:
        raise RegistryError("La licenza è già attiva.")
    res = prev.get("resume") or {}
    lic = _derive(hub, cur, key_id, now)
    for k in ("status", "resume"):
        lic.pop(k, None)
    exp = L.parse_time(res.get("expires_at") or prev["expires_at"])
    if months:
        from .service import add_months
        exp = add_months(max(exp, now), int(months))
    if exp <= now + timedelta(days=1):
        raise RegistryError("Durante la sospensione la licenza è scaduta: indica di quanti mesi prolungarla.")
    lic.update(valid_from=L.format_time(now), expires_at=L.format_time(exp),
               grace_days=int(res.get("grace_days", L.DEFAULT_GRACE_DAYS)))
    reg.set_setting(REVOKED_PREFIX + iid, None, log=False)
    return _store(hub, priv, lic, cur, "licence.reactivate", {"expires_at": lic["expires_at"]})


def modify(hub, key_id, priv, iid: str, *, limits: dict | None = None, add_features=(), remove_features=(),
           expires_at: datetime | None = None, grace_days: int | None = None, now: datetime | None = None) -> dict:
    """Same licence with other limits / features / expiry / grace (also: re-issue to add the channel address)."""
    reg, now = hub.registry, now or _now()
    iid = reg.get_instance(iid)["id"]
    cur = _need_current(reg, iid)
    if status_of(cur["licence"]) != L.STATUS_ACTIVE:
        raise RegistryError("Licenza sospesa o revocata: riattivala prima di modificarla.")
    lic = _derive(hub, cur, key_id, now)
    if limits:
        lim = dict(lic["limits"])
        for k, v in limits.items():
            if k not in L.LIMIT_KEYS:
                raise RegistryError(f"Limite sconosciuto: {k}")
            lim[k] = None if v is None or v == -1 else int(v)
            if lim[k] is not None and lim[k] < 0:
                raise RegistryError("I limiti sono numeri da 0 in su (vuoto o -1 = illimitato).")
        lic["limits"] = lim
    feats = [f for f in lic["features"] if f not in set(remove_features)]
    for f in add_features:
        if f not in L.KNOWN_FEATURES:
            raise RegistryError(f"Funzione sconosciuta: {f}")
        if f not in feats:
            feats.append(f)
    lic["features"] = sorted(feats)
    if expires_at is not None:
        if expires_at <= now:
            raise RegistryError("La nuova scadenza deve essere nel futuro.")
        lic["expires_at"] = L.format_time(expires_at)
        if L.parse_time(lic["valid_from"]) >= expires_at:
            lic["valid_from"] = L.format_time(now)
    if grace_days is not None:
        if not 0 <= int(grace_days) <= 365:
            raise RegistryError("Tolleranza: da 0 a 365 giorni.")
        lic["grace_days"] = int(grace_days)
    return _store(hub, priv, lic, cur, "licence.modify",
                  {"limits": lic["limits"], "features": lic["features"], "expires_at": lic["expires_at"]})


# ---------------------------------------------------------------------------
# auto-renew (short licences)
# ---------------------------------------------------------------------------

def get_autorenew(reg, iid: str) -> dict | None:
    return _jget(reg, AUTORENEW_PREFIX + iid)


def set_autorenew(reg, iid: str, policy: dict | None) -> dict | None:
    if policy is None:
        _jset(reg, AUTORENEW_PREFIX + iid, None)
        reg.log("licence.autorenew", "instance", iid, {"on": False})
        return None
    p = dict(AUTORENEW_DEFAULT)
    p.update({k: v for k, v in policy.items() if k in AUTORENEW_DEFAULT})
    p["days"], p["renew_before"] = int(p["days"]), int(p["renew_before"])
    if not 7 <= p["days"] <= 366:
        raise RegistryError("Durata della licenza breve: da 7 a 366 giorni.")
    if not 1 <= p["renew_before"] < p["days"]:
        raise RegistryError("Rinnova quando mancano: almeno 1 giorno e meno della durata.")
    if p["until"]:
        try:
            p["until"] = L.format_time(datetime.fromisoformat(str(p["until"])[:10]).replace(tzinfo=timezone.utc))
        except ValueError:
            raise RegistryError("Data «fino al» non valida (AAAA-MM-GG).")
    if is_revoked(reg, iid):
        raise RegistryError("Licenza revocata: riattivala prima.")
    _jset(reg, AUTORENEW_PREFIX + iid, p)
    reg.log("licence.autorenew", "instance", iid, {"on": True, "days": p["days"], "until": p["until"]})
    return p


def renew_short(hub, key_id, priv, iid: str, now: datetime | None = None, allow_shorter: bool = False) -> dict:
    """Issue the next short licence now (expiry = now + days, never past ``until``). ``allow_shorter``: switch a
    long licence to a short one right away (the control Dave wants when he turns auto-renew on)."""
    reg, now = hub.registry, now or _now()
    pol = get_autorenew(reg, iid)
    if not pol:
        raise RegistryError("Rinnovo automatico non attivo per questa installazione.")
    cur = _need_current(reg, iid)
    if status_of(cur["licence"]) != L.STATUS_ACTIVE:
        raise RegistryError("Licenza sospesa o revocata: niente rinnovo automatico.")
    exp = now + timedelta(days=pol["days"])
    if pol.get("until"):
        exp = min(exp, L.parse_time(pol["until"]))
    if not allow_shorter and exp <= L.parse_time(cur["licence"]["expires_at"]):
        raise RegistryError("Niente da rinnovare: la licenza attuale scade già dopo.")
    lic = _derive(hub, cur, key_id, now)
    lic.update(valid_from=L.format_time(now), expires_at=L.format_time(exp))
    return _store(hub, priv, lic, cur, "licence.autorenew.issue", {"expires_at": lic["expires_at"]})


def autorenew_due(hub, now: datetime | None = None) -> list[str]:
    reg, now = hub.registry, now or _now()
    out = []
    for (key, val) in reg.conn.execute("SELECT key, value FROM settings WHERE key LIKE ?", (AUTORENEW_PREFIX + "%",)):
        if not val:
            continue
        iid = key[len(AUTORENEW_PREFIX):]
        try:
            pol = json.loads(val)
            cur = current(reg, iid)
        except (ValueError, RegistryError):
            continue
        if not cur or status_of(cur["licence"]) != L.STATUS_ACTIVE:
            continue
        if pol.get("until") and now >= L.parse_time(pol["until"]):
            continue
        left = L.parse_time(cur["licence"]["expires_at"]) - now
        if left <= timedelta(days=int(pol.get("renew_before", 10))):
            out.append(iid)
    return out


# ---------------------------------------------------------------------------
# publishing
# ---------------------------------------------------------------------------

def published_id(reg, iid: str) -> str | None:
    return reg.get_setting(PUBLISHED_PREFIX + iid)


def channel_view(reg) -> list[dict]:
    """One row per installation with a licence: address, published or not."""
    out = []
    for i in reg.list_instances():
        cur = current(reg, i["id"])
        if not cur:
            continue
        lic = cur["licence"]
        url = lic.get("update_url")
        out.append({"instance_id": i["id"], "instance_label": i["label"], "customer_name": i["customer_name"],
                    "customer_id": i["customer_id"], "licence_id": cur["id"], "status": status_of(lic),
                    "update_url": url, "published": published_id(reg, i["id"]) == cur["id"],
                    "autorenew": get_autorenew(reg, i["id"])})
    return out


def pending(reg) -> list[dict]:
    return [r for r in channel_view(reg) if r["update_url"] and not r["published"]]


def publish(hub, vk, iids: list[str] | None = None, *, remote=None, log=lambda m: None) -> dict:
    """Upload the current licence of each installation (only those whose licence carries the channel address)."""
    from .deploy import open_remote
    from .vault import Vault
    reg = hub.registry
    ch = channel(reg)
    if not ch:
        raise RegistryError("Canale delle licenze non impostato (Impostazioni → Canale delle licenze).")
    rows = [r for r in channel_view(reg) if r["update_url"] and (iids is None or r["instance_id"] in iids)]
    rows = [r for r in rows if r["update_url"].startswith(ch["base_url"])]
    own = remote is None
    if own:
        if vk is None:
            raise RegistryError("Cassaforte chiusa: serve l'accesso FTP del sito del canale.")
        sec = Vault(reg).get(vk, ch["env_id"], "ftp", reason="pubblicazione licenze")
        log(f"Mi collego al canale ({ch['label']})…")
        remote = open_remote(sec, known_hosts=hub.dir / "known_hosts")
    done = []
    try:
        remote.upload_bytes(INDEX_HTML, f"{FOLDER}/index.html")
        remote.upload_bytes(HTACCESS, f"{FOLDER}/.htaccess")
        for r in rows:
            rec = reg.get_licence(r["licence_id"])
            name = r["update_url"].rsplit("/", 1)[1]
            remote.upload_bytes(rec["file_text"].encode("utf-8"), f"{FOLDER}/{name}")
            reg.set_setting(PUBLISHED_PREFIX + r["instance_id"], r["licence_id"], log=False)
            done.append(r["instance_id"])
            log(f"Pubblicata: {r['customer_name']} · {r['instance_label']}")
    finally:
        if own:
            remote.close()
    reg.log("licence.publish", details={"count": len(done)})
    return {"published": len(done), "instances": done, "base_url": ch["base_url"]}


# ---------------------------------------------------------------------------
# background: auto-renew + publish while the hub page is open (needs the hub unlocked)
# ---------------------------------------------------------------------------

class Scheduler:
    def __init__(self, app):
        self.app = app
        self.stop = threading.Event()
        self.error: str | None = None
        self.last: dict | None = None

    def tick(self) -> dict | None:
        from .service import Hub
        app = self.app
        if not getattr(app, "unlocked", False) or app.private_key is None:
            return None
        out = {"renewed": [], "published": 0}
        with app.lock, Hub(app.hub.dir) as h:
            for iid in autorenew_due(h):
                try:
                    renew_short(h, app.key_id, app.private_key, iid)
                    out["renewed"].append(iid)
                except RegistryError as exc:
                    self.error = str(exc)
            if channel(h.registry) and pending(h.registry) and app.vault_key is not None:
                try:
                    out["published"] = publish(h, app.vault_key)["published"]
                    self.error = None
                except Exception as exc:  # network down: retry at the next tick, say it in Panoramica
                    self.error = f"Pubblicazione delle licenze non riuscita: {exc}"
                    h.registry.log("licence.publish.error", details={"error": str(exc)[:300]})
        self.last = out
        return out

    def start(self) -> threading.Thread:
        def loop():
            wait = 30
            while not self.stop.wait(wait):
                try:
                    self.tick()
                except Exception as exc:
                    self.error = str(exc)
                wait = CHECK_EVERY
        t = threading.Thread(target=loop, daemon=True, name="hub-licences")
        t.start()
        return t
