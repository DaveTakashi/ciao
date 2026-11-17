"""v0.10: «Hosting predefinito» — one FTP access for every site Dave puts on his own hosting.

Dave's usual set-up: one domain (``https://docmap.pr-it.it/``), one FTP account, one folder per customer
(``/studio-rossi/``) and, when wanted, a demo next to it (``/studio-rossi-demo/``). Before 0.10 every new customer
needed the FTP host, user, password and both folders typed again. Now they are written ONCE here; a customer template
in «dominio» mode derives address and folders from the customer's name, and the hub copies this access (with the
customer's folder) into the vault entry of each new site. A customer can still have his own FTP (mode «cliente»),
and his demo another one (``online.ftp_staging``).

The password is encrypted with the vault key (AES-256-GCM, associated data ``hub|hosting|default``) and stored in
``settings``; the rest is plain JSON. Nothing is copied to existing sites: changing the default only affects the
customers created afterwards (their own vault entries can be changed from «Accessi»).
"""

from __future__ import annotations

import base64
import json
import re
import secrets as _secrets

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .registry import RegistryError
from .vault import VaultKey, VaultLocked, validate as validate_secret

KEY = "hosting.default"
AAD = b"hub|hosting|default"
DEFAULT_SUFFIX = "-demo"
SUFFIX_RE = re.compile(r"^-[a-z0-9][a-z0-9-]{0,19}$")


class HostingError(RegistryError):
    pass


def _raw(reg) -> dict | None:
    v = reg.get_setting(KEY)
    if not v:
        return None
    try:
        return json.loads(v)
    except ValueError:
        return None


def get(reg) -> dict | None:
    """Public view (no password): {base_url, protocol, host, port, user, base_folder, staging_suffix, has_password}."""
    r = _raw(reg)
    if not r:
        return None
    out = {k: r.get(k) for k in ("base_url", "protocol", "host", "port", "user", "base_folder", "staging_suffix")}
    out["staging_suffix"] = out.get("staging_suffix") or DEFAULT_SUFFIX
    out["has_password"] = bool(r.get("secret")) or r.get("protocol") == "local"
    return out


def _norm_base_url(u: str) -> str:
    u = (u or "").strip()
    if not u.startswith("https://"):
        raise HostingError("L'indirizzo del dominio deve iniziare con https:// (es. https://docmap.pr-it.it/).")
    if "?" in u or "#" in u:
        raise HostingError("Indirizzo del dominio: niente ?… o #….")
    return u if u.endswith("/") else u + "/"


def _norm_folder(f: str, protocol: str) -> str:
    f = (f or "").strip() or "/"
    if protocol == "local":
        return f.rstrip("/") or "/"
    if not f.startswith("/"):
        f = "/" + f
    return f if f.endswith("/") else f + "/"


def set_default(reg, vk: VaultKey | None, data: dict) -> dict:
    """Save the default hosting. ``password`` empty = keep the saved one."""
    cur = _raw(reg) or {}
    proto = str(data.get("protocol") or cur.get("protocol") or "ftps").lower()
    rec = {"base_url": _norm_base_url(data.get("base_url") or cur.get("base_url") or ""),
           "protocol": proto,
           "host": (data.get("host") if data.get("host") is not None else cur.get("host") or "").strip(),
           "user": (data.get("user") if data.get("user") is not None else cur.get("user") or "").strip(),
           "port": None,
           "base_folder": _norm_folder(data.get("base_folder") if data.get("base_folder") is not None
                                       else cur.get("base_folder") or "/", proto),
           "staging_suffix": (data.get("staging_suffix") or cur.get("staging_suffix") or DEFAULT_SUFFIX).strip().lower()}
    port = data.get("port", cur.get("port"))
    if port not in (None, ""):
        try:
            rec["port"] = int(port)
        except (TypeError, ValueError):
            raise HostingError("Porta non valida.") from None
    if not SUFFIX_RE.match(rec["staging_suffix"]):
        raise HostingError("Suffisso della demo: un trattino seguito da lettere o numeri, es. -demo o -prova.")
    pw = data.get("password") or ""
    secret = cur.get("secret")
    if pw:
        if vk is None:
            raise VaultLocked("Cassaforte chiusa: serve per salvare la password FTP.")
        nonce = _secrets.token_bytes(12)
        ct = AESGCM(vk.key).encrypt(nonce, pw.encode("utf-8"), AAD)
        secret = {"nonce": base64.b64encode(nonce).decode(), "ct": base64.b64encode(ct).decode()}
    rec["secret"] = secret
    # same rules as an FTP access in the vault (host, user and password required except for 'local')
    validate_secret("ftp", {"protocol": proto, "host": rec["host"], "user": rec["user"],
                            "password": "x" if (secret or proto == "local") else "", "port": rec["port"],
                            "remote_path": rec["base_folder"]})
    reg.set_setting(KEY, json.dumps(rec, sort_keys=True), log=False)
    reg.log("hosting.set", "setting", KEY, {k: rec[k] for k in ("base_url", "protocol", "host", "user", "base_folder",
                                                                   "staging_suffix")} | {"password": bool(pw)})
    return get(reg)


def clear(reg) -> None:
    reg.set_setting(KEY, None, log=False)
    reg.log("hosting.clear", "setting", KEY)


def _password(reg, vk: VaultKey | None) -> str:
    r = _raw(reg) or {}
    if r.get("protocol") == "local":
        return ""
    s = r.get("secret")
    if not s:
        raise HostingError("Hosting predefinito senza password FTP: completalo in Impostazioni → Hosting predefinito.")
    if vk is None:
        raise VaultLocked("Cassaforte chiusa: serve per usare l'accesso FTP dell'hosting predefinito.")
    try:
        return AESGCM(vk.key).decrypt(base64.b64decode(s["nonce"]), base64.b64decode(s["ct"]), AAD).decode("utf-8")
    except (InvalidTag, ValueError, KeyError):
        raise HostingError("Password dell'hosting predefinito illeggibile (cassaforte diversa?): riscrivila in "
                           "Impostazioni → Hosting predefinito.") from None


def ftp_access(reg, vk: VaultKey | None, folder: str) -> dict:
    """The vault payload of the default access, pointed at ``folder``."""
    r = _raw(reg)
    if not r:
        raise HostingError("Nessun hosting predefinito: impostalo una volta in Impostazioni → Hosting predefinito "
                           "(dominio, FTP, cartella).")
    out = {"protocol": r["protocol"], "remote_path": folder}
    if r["protocol"] != "local":
        out.update(host=r["host"], user=r["user"], password=_password(reg, vk))
        if r.get("port"):
            out["port"] = r["port"]
    return out


def site_for(reg, slug: str, *, staging: bool) -> dict:
    """{indirizzo, staging, cartella, cartella_staging} for a customer slug on the default hosting."""
    r = get(reg)
    if not r:
        return {"indirizzo": "", "staging": "", "cartella": "", "cartella_staging": ""}
    suffix = r["staging_suffix"]
    base_f = r["base_folder"] or "/"
    join = (lambda name: base_f.rstrip("/") + "/" + name) if r["protocol"] == "local" else (
        lambda name: base_f + name + "/")
    out = {"indirizzo": f"{r['base_url']}{slug}/", "cartella": join(slug), "staging": "", "cartella_staging": ""}
    if staging:
        out.update(staging=f"{r['base_url']}{slug}{suffix}/", cartella_staging=join(slug + suffix))
    return out


def reencrypt(reg, old_vk: VaultKey, new_vk: VaultKey) -> str | None:
    """Vault passphrase change: the setting re-encrypted with the new key (None when there is nothing to do)."""
    r = _raw(reg)
    if not r or not r.get("secret"):
        return None
    s = r["secret"]
    pw = AESGCM(old_vk.key).decrypt(base64.b64decode(s["nonce"]), base64.b64decode(s["ct"]), AAD)
    nonce = _secrets.token_bytes(12)
    r["secret"] = {"nonce": base64.b64encode(nonce).decode(),
                   "ct": base64.b64encode(AESGCM(new_vk.key).encrypt(nonce, pw, AAD)).decode()}
    return json.dumps(r, sort_keys=True)
