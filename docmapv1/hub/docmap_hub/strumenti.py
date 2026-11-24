"""Strumenti on the provider's remote server (hub 0.14).

The provider (Dave) runs ``python -m docmap_strumenti serve --remote`` on a server of his. Customers whose plan has the
feature ``strumenti_remote`` get a token for it; the monthly credits of that token follow the licence:

* ``issue_token(iid)``  - new token for an installation (tenant = installation id, plan and ``strumenti_credits`` of
                          its licence in force). Shown ONCE: the hub keeps only that it was issued.
* ``sync(iid)``         - the token's credits follow the licence: plan credits while the licence is active, not
                          expired and has ``strumenti_remote``; 0 when it is suspended, revoked, expired or the feature
                          was removed (the token is not deleted, so a reactivation restores it without a new token).
* ``revoke(iid)``       - the token stops working.

The hub talks to the Strumenti server with its ADMIN key (``chiave-locale.txt`` of that server), stored encrypted with
the vault key (AES-256-GCM, same scheme as the vault) in the registry settings, never in clear and never shown again.
Every use is logged (``strumenti.key.use``) without the key. Network errors are reported, never fatal for a licence.
"""

from __future__ import annotations

import base64
import json
import secrets
import urllib.error
import urllib.request
from datetime import datetime, timezone

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from . import licence as L
from .registry import RegistryError

CONFIG = "strumenti.remote"
ISSUED = "strumenti.tokens"
AAD = b"hub|strumenti|admin_key"
FEATURE = "strumenti_remote"
LIMIT = "strumenti_credits"
TIMEOUT = 20


class StrumentiError(RegistryError):
    pass


def _jget(reg, key):
    try:
        v = reg.get_setting(key)
        return json.loads(v) if v else None
    except ValueError:
        return None


def _jset(reg, key, value) -> None:
    reg.set_setting(key, json.dumps(value, ensure_ascii=False, sort_keys=True) if value is not None else None, log=False)


def config(reg) -> dict | None:
    c = _jget(reg, CONFIG)
    return {"url": c["url"], "has_key": bool(c.get("ct"))} if c and c.get("url") else None


def set_config(reg, vk, url: str, admin_key: str | None) -> dict | None:
    """Address of the Strumenti server and its admin key (kept when ``admin_key`` is empty and the address is the same)."""
    url = (url or "").strip().rstrip("/")
    if not url:
        reg.set_setting(CONFIG, None)
        reg.log("strumenti.config", details={"url": None})
        return None
    if not url.startswith(("https://", "http://")):
        raise StrumentiError("L'indirizzo del server degli Strumenti deve iniziare con https:// (o http:// solo in prova).")
    cur = _jget(reg, CONFIG) or {}
    rec = {"url": url}
    if admin_key:
        if vk is None:
            raise StrumentiError("Cassaforte chiusa: aprila per salvare la chiave del server degli Strumenti.")
        nonce = secrets.token_bytes(12)
        rec["nonce"] = base64.b64encode(nonce).decode()
        rec["ct"] = base64.b64encode(AESGCM(vk.key).encrypt(nonce, admin_key.strip().encode(), AAD)).decode()
    elif cur.get("ct"):
        rec["nonce"], rec["ct"] = cur["nonce"], cur["ct"]
    _jset(reg, CONFIG, rec)
    reg.log("strumenti.config", details={"url": url, "key": bool(rec.get("ct"))})
    return config(reg)


def _admin_key(reg, vk, reason: str) -> tuple[str, str]:
    c = _jget(reg, CONFIG) or {}
    if not c.get("url") or not c.get("ct"):
        raise StrumentiError("Server degli Strumenti non impostato: Impostazioni › Strumenti (indirizzo e chiave).")
    if vk is None:
        raise StrumentiError("Cassaforte chiusa: serve per usare la chiave del server degli Strumenti.")
    try:
        key = AESGCM(vk.key).decrypt(base64.b64decode(c["nonce"]), base64.b64decode(c["ct"]), AAD).decode()
    except (InvalidTag, ValueError, KeyError):
        raise StrumentiError("Chiave del server degli Strumenti illeggibile: salvala di nuovo.") from None
    reg.log("strumenti.key.use", details={"reason": reason})
    return c["url"], key


def _call(url: str, key: str, path: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url + path, data=data, method="POST" if data else "GET",
                                 headers={"X-Key": key, "Content-Type": "application/json", "X-User": "hub"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read() or b"{}").get("error")
        except ValueError:
            msg = None
        raise StrumentiError(f"Server degli Strumenti: {msg or 'errore ' + str(e.code)}") from None
    except (urllib.error.URLError, OSError, ValueError) as e:
        raise StrumentiError(f"Server degli Strumenti non raggiungibile: {getattr(e, 'reason', e)}") from None


def ping(reg, vk) -> dict:
    url, key = _admin_key(reg, vk, "prova del collegamento")
    info = _call(url, key, "/api/info")
    if not info.get("admin"):
        raise StrumentiError("La chiave non è quella di amministratore del server degli Strumenti.")
    if not info.get("remote_mode"):
        raise StrumentiError("Il server risponde ma non è avviato per i clienti (serve --remote).")
    return {"version": info.get("version"), "url": url}


def entitlement(reg, iid: str, now: datetime | None = None) -> dict:
    """What the licence in force allows on the remote server: {allowed, credits, plan, reason}."""
    now = now or datetime.now(timezone.utc)
    cur = reg.latest_licence(iid)
    if cur is None:
        return {"allowed": False, "credits": 0, "plan": "", "reason": "nessuna licenza"}
    lic = cur["licence"]
    plan = lic.get("plan") or ""
    if (lic.get("status") or L.STATUS_ACTIVE) != L.STATUS_ACTIVE:
        return {"allowed": False, "credits": 0, "plan": plan, "reason": "licenza " + lic.get("status", "")}
    if FEATURE not in (lic.get("features") or []):
        return {"allowed": False, "credits": 0, "plan": plan, "reason": "il piano non comprende il server remoto"}
    try:
        grace_end = L.parse_time(lic["expires_at"]).timestamp() + int(lic.get("grace_days") or 0) * 86400
    except (KeyError, ValueError, TypeError):
        grace_end = 0
    if now.timestamp() > grace_end:
        return {"allowed": False, "credits": 0, "plan": plan, "reason": "licenza scaduta"}
    credits = (lic.get("limits") or {}).get(LIMIT)
    return {"allowed": True, "credits": credits, "plan": plan, "reason": ""}


def issued(reg) -> dict:
    return _jget(reg, ISSUED) or {}


def _mark(reg, iid: str, rec: dict | None) -> None:
    d = issued(reg)
    if rec is None:
        d.pop(iid, None)
    else:
        d[iid] = rec
    _jset(reg, ISSUED, d)


def issue_token(hub, vk, instance: str) -> dict:
    reg = hub.registry
    iid = reg.get_instance(instance)["id"]
    ent = entitlement(reg, iid)
    if not ent["allowed"]:
        raise StrumentiError(f"Niente gettone per il server degli Strumenti: {ent['reason']}.")
    url, key = _admin_key(reg, vk, f"gettone per {iid}")
    cust = reg.get_customer(reg.get_instance(iid)["customer_id"])
    _call(url, key, "/api/tokens", {"tenant": iid, "revoke": True})          # one valid token per installation
    tok = _call(url, key, "/api/tokens", {"tenant": iid, "label": cust["name"], "plan": ent["plan"],
                                          "credits_month": ent["credits"]})["token"]
    now = L.format_time(datetime.now(timezone.utc))
    _mark(reg, iid, {"at": now, "plan": ent["plan"], "credits": ent["credits"], "synced_at": now})
    reg.log("strumenti.token", "instance", iid, {"plan": ent["plan"], "credits": ent["credits"]})
    return {"token": tok, "url": url, "tenant": iid, "credits": ent["credits"], "plan": ent["plan"]}


def sync(hub, vk, instance: str) -> dict | None:
    """Credits of the installation's token follow its licence. None when no token was issued from this hub."""
    reg = hub.registry
    iid = reg.get_instance(instance)["id"]
    rec = issued(reg).get(iid)
    if rec is None:
        return None
    ent = entitlement(reg, iid)
    credits = ent["credits"] if ent["allowed"] else 0
    url, key = _admin_key(reg, vk, f"crediti di {iid}")
    _call(url, key, "/api/tokens", {"tenant": iid, "update": True, "credits_month": credits, "plan": ent["plan"]})
    rec.update({"plan": ent["plan"], "credits": credits, "synced_at": L.format_time(datetime.now(timezone.utc)),
                "reason": ent["reason"]})
    _mark(reg, iid, rec)
    reg.log("strumenti.sync", "instance", iid, {"credits": credits, "reason": ent["reason"]})
    return rec


def sync_all(hub, vk) -> dict:
    out = {}
    for iid in list(issued(hub.registry)):
        try:
            out[iid] = sync(hub, vk, iid)
        except (StrumentiError, RegistryError) as e:
            out[iid] = {"error": str(e)}
    return out


def revoke(hub, vk, instance: str) -> int:
    reg = hub.registry
    iid = reg.get_instance(instance)["id"]
    url, key = _admin_key(reg, vk, f"revoca del gettone di {iid}")
    n = _call(url, key, "/api/tokens", {"tenant": iid, "revoke": True}).get("revoked", 0)
    _mark(reg, iid, None)
    reg.log("strumenti.revoke", "instance", iid)
    return n


def view(reg) -> dict:
    rows = []
    for iid, rec in sorted(issued(reg).items()):
        try:
            inst = reg.get_instance(iid)
            cust = reg.get_customer(inst["customer_id"])
            label, cname = inst["label"], cust["name"]
        except RegistryError:
            label, cname = iid, "?"
        rows.append({"instance_id": iid, "instance_label": label, "customer": cname, **rec,
                     "entitlement": entitlement(reg, iid)})
    return {"config": config(reg), "rows": rows}
