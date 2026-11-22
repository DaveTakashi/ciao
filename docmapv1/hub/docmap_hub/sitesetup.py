"""v0.9: the hub finishes an online site by itself.

* ``setup_site`` — runs the site's one-time ``setup.php`` from the hub (JSON mode, app 26.12.7): the people of the
  project get their access codes, and the codes go straight into the encrypted vault. Before 0.9 Dave opened
  setup.php in the browser, typed the people, copied every token by hand and saved each one with a command.
  The database key (``config.php``) is kept by the hub ONLY with key escrow (written consent of the customer);
  otherwise it is handed back once, to be saved for the customer.
* ``push_licence`` — after a suspension, reactivation, renewal or change, the new signed licence is uploaded to every
  online site of that installation (``server-php/licence.docmap-licence``, the same file a deploy ships): api.php
  installs it at the next request. No licence channel needed; the channel remains for the sede servers.
* ``outdated_sites`` / ``update_sites`` — every online site behind the version of this hub, updated one after the
  other with the usual deploy (server backup, check, automatic rollback), stopping at the first failure.
"""

from __future__ import annotations

import base64
import json
import re
import ssl
import urllib.error
import urllib.parse
import urllib.request

from .registry import RegistryError
from .vault import VaultKey

HUB_ADMIN = "admin"
BRIDGE_USER = "ponte-sync"
NAME_RE = re.compile(r"^[\w ._@-]{1,60}$", re.UNICODE)
SETUP_DONE_PREFIX = "site.setup."
ROLES = {"admin", "editor", "viewer"}


class SetupError(RegistryError):
    pass


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

def _opener(url: str, cafile: str | None = None):
    handlers: list = []
    if url.startswith("https:"):
        ctx = ssl.create_default_context(cafile=cafile or None)
        ctx.minimum_version = ssl.TLSVersion.TLSv1_2
        handlers.append(urllib.request.HTTPSHandler(context=ctx))
    host = (urllib.parse.urlsplit(url).hostname or "").lower()
    if host in ("127.0.0.1", "localhost", "::1"):
        handlers.append(urllib.request.ProxyHandler({}))
    return urllib.request.build_opener(*handlers)


def http_json(url: str, data: dict | None = None, *, timeout: float = 30.0, cafile: str | None = None,
              basic_auth: tuple[str, str] | None = None) -> tuple[int, dict]:
    """GET (data None) or form POST → (status, json). Never raises for HTTP errors; raises SetupError otherwise."""
    body = urllib.parse.urlencode(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, headers={"User-Agent": "docmap-hub/0.9", "Accept": "application/json"})
    if basic_auth:
        req.add_header("Authorization", "Basic " + base64.b64encode(f"{basic_auth[0]}:{basic_auth[1]}".encode()).decode())
    try:
        with _opener(url, cafile).open(req, timeout=timeout) as r:
            status, raw = r.status, r.read(1 << 20)
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read(1 << 20)
    except ssl.SSLError as e:
        raise SetupError(f"Certificato HTTPS non valido per {url}: {e}. Attiva SSL (Let's Encrypt) sul dominio.")
    except (urllib.error.URLError, OSError) as e:
        raise SetupError(f"Il sito non risponde ({url}): {getattr(e, 'reason', e)}.")
    try:
        return status, json.loads(raw.decode("utf-8", "replace"))
    except ValueError:
        snippet = raw[:120].decode("utf-8", "replace").strip().replace("\n", " ")
        if status == 404:
            raise SetupError(f"setup.php non c'è ({url}): o il sito è già configurato (setup.php rinominato in "
                             "setup.php.disabled) oppure non è ancora pubblicato (deploy).")
        if status == 401:
            raise SetupError("Il sito chiede una password (cartella protetta): togli la protezione o salva "
                             "l'accesso «basic_auth» in cassaforte.")
        raise SetupError(f"Risposta inattesa da {url} (HTTP {status}): {snippet or 'vuota'}. "
                         "Il sito ha una versione di DocMap precedente alla 26.12.7? Ripubblicalo (deploy).")


# ---------------------------------------------------------------------------
# set-up
# ---------------------------------------------------------------------------

def _web_env(reg, env_ref: str, name: str | None = None) -> dict:
    env = reg.get_environment(env_ref, name)
    if env["kind"] != "web-php":
        raise SetupError("La configurazione automatica vale solo per i siti online (web-php).")
    if not env.get("url"):
        raise SetupError("L'ambiente non ha l'indirizzo del sito: impostalo prima.")
    return env


def _has_sede(reg, customer_id: str) -> bool:
    for i in reg.list_instances(customer_id):
        if i.get("notes") == "onboarding:sede":
            return True
        if any(e["kind"] in ("studio-python", "local-python") for e in reg.list_environments(i["id"])):
            return True
    return False


def people_for(reg, env: dict, extra: list[tuple[str, str]] | None = None) -> list[tuple[str, str]]:
    """Who gets an access code: the hub's admin, the bridge (if the customer also has a sede server), the people
    planned in the project (utenti_iniziali) and ``extra``. Names are unique (case-insensitive)."""
    inst = reg.get_instance(env["instance_id"])
    out: list[tuple[str, str]] = [(HUB_ADMIN, "admin")]
    if _has_sede(reg, inst["customer_id"]):
        out.append((BRIDGE_USER, "editor"))
    planned = []
    if inst.get("project_id"):
        try:
            planned = reg.get_project(inst["project_id"])["data"].get("utenti_iniziali") or []
        except RegistryError:
            planned = []
    cand = [((u.get("nome") or "").strip(), (u.get("ruolo") or "editor").strip().lower()) for u in planned]
    cand += list(extra or [])
    seen = {n.lower() for n, _ in out}
    for name, role in cand:
        name = re.sub(r"[^\w ._@-]+", "", name, flags=re.UNICODE).strip()[:60]
        if not name or name.lower() in seen:
            continue
        out.append((name, role if role in ROLES else "editor"))
        seen.add(name.lower())
    return out


def setup_state(reg, env_id: str) -> dict | None:
    v = reg.get_setting(SETUP_DONE_PREFIX + env_id)
    try:
        return json.loads(v) if v else None
    except ValueError:
        return None


def is_configured(hub, env: dict) -> bool:
    """Configured by the hub, or by hand with at least the admin token saved in the vault."""
    if setup_state(hub.registry, env["id"]):
        return True
    from .vault import Vault
    return any(s["kind"] == "admin_token" for s in Vault(hub.registry).list(env_id=env["id"]))


def setup_site(hub, vk: VaultKey, env_ref: str, env_name: str | None = None, *, extra_people=None,
               studio_name: str | None = None, data_dir: str | None = None, timeout: float = 30.0,
               log=lambda m: None) -> dict:
    """Run setup.php of a web-php environment. Returns {people:[{user,role,saved}], data_dir, config_php (base64 or
    None when kept in the vault), escrow, licence_required}."""
    from .vault import Vault
    reg = hub.registry
    env = _web_env(reg, env_ref, env_name)
    vault = Vault(reg)
    done = setup_state(reg, env["id"])
    if done:
        raise SetupError(f"Sito già configurato dall'hub il {done.get('at', '?')[:10]}: i codici sono in cassaforte "
                         "(«Accessi»). Per altre persone crea i codici dall'app (amministratore).")
    cafile = (env.get("settings") or {}).get("ca") or None
    ba = vault.get(vk, env["id"], "basic_auth", reason="configurazione del sito", required=False)
    auth = (ba["user"], ba["password"]) if ba else None
    url = env["url"].rstrip("/") + "/server-php/setup.php?format=json"
    log(f"Controllo {url} …")
    st, j = http_json(url, timeout=timeout, cafile=cafile, basic_auth=auth)
    state = j.get("state")
    if st == 403 and state == "configured":
        raise SetupError("Il sito è già configurato (config.php esiste). Se i codici non sono in cassaforte, "
                         "salvali da «Accessi» oppure crea nuovi codici dall'app (amministratore).")
    if st == 409 or state == "existing_db":
        raise SetupError("Sul server c'è già un database DocMap in quella cartella: l'hub non crea una chiave nuova. "
                         "Rimetti la copia di config.php (guida AGGIORNARE-IL-SERVER.md).")
    if not j.get("ok"):
        raise SetupError(j.get("error") or f"setup.php ha risposto HTTP {st}.")
    if not j.get("https") and env["url"].startswith("https:"):
        log("Attenzione: il server non si riconosce in HTTPS (proxy?): i codici viaggiano comunque cifrati dall'hub.")
    people = people_for(reg, env, extra_people)
    cust = reg.customer_of_env(env)
    name = studio_name if studio_name is not None else ((env.get("settings") or {}).get("studio_name") or "")
    form = {"format": "json", "users": "\n".join(f"{n},{r}" for n, r in people), "allow_file": "1",
            "studio_name": name}
    if data_dir:
        form["data_dir"] = data_dir
    log(f"Configuro il database online: {len(people)} persone ({', '.join(n for n, _ in people)}) …")
    st, j = http_json(url, form, timeout=timeout, cafile=cafile, basic_auth=auth)
    if not j.get("ok") or j.get("state") != "done":
        raise SetupError(j.get("error") or f"setup.php non ha completato la configurazione (HTTP {st}).")
    saved = []
    for t in j.get("tokens") or []:
        label = t["user"] if t["user"] != HUB_ADMIN else "admin"
        vault.put(vk, env["id"], "admin_token", {"user": t["user"], "role": t["role"], "token": t["token"]}, label=label)
        saved.append({"user": t["user"], "role": t["role"], "saved": True})
        log(f"  codice di {t['user']} ({t['role']}) → cassaforte")
    escrow = bool(cust.get("key_escrow"))
    cfg_b64 = j.get("config_php") or ""
    keep_out = cfg_b64
    if escrow and cfg_b64:
        from .deploy import CONFIG
        vault.put(vk, env["id"], "db_config", {"content": base64.b64decode(cfg_b64).decode("utf-8"), "format": "php"},
                  label=CONFIG)
        keep_out = None
        log("  config.php (chiave del database) → cassaforte (custodia autorizzata dal cliente)")
    else:
        log("  config.php (chiave del database): NON resta nell'hub (custodia spenta). Scarica la copia e "
            "consegnala al cliente.")
    rec = {"at": _now_iso(), "data_dir": j.get("data_dir"), "people": [p["user"] for p in saved],
           "licence_required": bool(j.get("licence_required")), "disabled": bool(j.get("disabled"))}
    reg.set_setting(SETUP_DONE_PREFIX + env["id"], json.dumps(rec, sort_keys=True), log=False)
    reg.log("site.setup", "environment", env["id"], {"people": rec["people"], "data_dir": rec["data_dir"],
                                                     "escrow": escrow})
    if not j.get("disabled"):
        log("Nota: setup.php non si è potuto rinominare, ma non funziona più finché esiste config.php.")
    log(f"Fatto: database in {j.get('data_dir')}" + (" · licenza controllata dal sito" if rec["licence_required"] else ""))
    return {"env_id": env["id"], "people": saved, "data_dir": j.get("data_dir"), "config_php": keep_out,
            "escrow": escrow, "licence_required": rec["licence_required"]}


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


# ---------------------------------------------------------------------------
# licence straight to the sites
# ---------------------------------------------------------------------------

def push_licence(hub, vk: VaultKey, instance: str, *, remote_for=None, pinger=None, log=lambda m: None) -> list[dict]:
    """Upload the installation's current licence to each of its web-php environments that has an FTP access in the
    vault. Returns [{env, ok, mode, error}]. Environments without FTP are reported (deploy or channel needed)."""
    from .deploy import open_remote
    from .runner import ping
    from .vault import Vault
    reg = hub.registry
    inst = reg.get_instance(instance)
    cur = reg.latest_licence(inst["id"])
    if not cur or not cur.get("file_text"):
        raise SetupError("Questa installazione non ha una licenza da inviare.")
    vault = Vault(reg)
    out = []
    for env in reg.list_environments(inst["id"]):
        if env["kind"] != "web-php":
            continue
        row = {"env": env["name"], "env_id": env["id"], "ok": False, "mode": None, "error": None}
        sec = vault.get(vk, env["id"], "ftp", reason="invio della licenza", required=False)
        if not sec:
            row["error"] = "nessun accesso FTP in cassaforte: arriva con il prossimo deploy o dal canale"
            log(f"{env['name']}: {row['error']}")
            out.append(row)
            continue
        try:
            rem = remote_for(env, sec) if remote_for else open_remote(sec)
            try:
                rem.upload_bytes(cur["file_text"].encode("utf-8"), "server-php/licence.docmap-licence")
            finally:
                rem.close()
            r = (pinger or ping)(env.get("api_url") or (env["url"].rstrip("/") + "/server-php/api.php"),
                                 timeout=10.0, cafile=(env.get("settings") or {}).get("ca") or None)
            row["mode"] = (r.get("licence") or {}).get("mode")
            row["ok"] = True
            log(f"{env['name']}: licenza caricata" + (f" · il sito ora dice: {row['mode']}" if row["mode"] else
                                                       " (il sito non controlla la licenza: non è stato configurato dall'hub 0.8+)"))
        except Exception as exc:  # noqa: BLE001 - reported per site
            row["error"] = str(exc)
            log(f"{env['name']}: invio non riuscito: {exc}")
        out.append(row)
    reg.log("licence.push", "instance", inst["id"], {"sites": [{k: r[k] for k in ("env", "ok", "mode")} for r in out]})
    return out


# ---------------------------------------------------------------------------
# update every site
# ---------------------------------------------------------------------------

def _vt(v: str | None) -> tuple:
    try:
        return tuple(int(x) for x in str(v or "").split("."))
    except ValueError:
        return ()


def outdated_sites(hub, target_version: str, *, include_staging: bool = False) -> list[dict]:
    """web-php environments whose last known version is older than ``target_version`` (unknown = included)."""
    out = []
    for e in hub.registry.list_environments():
        if e["kind"] != "web-php" or (e["name"] != "production" and not include_staging):
            continue
        if e["name"].startswith("demo-"):
            continue
        if _vt(e.get("app_version")) >= _vt(target_version) and e.get("app_version"):
            continue
        out.append({"env_id": e["id"], "customer": e["customer_name"], "instance": e["instance_label"],
                    "instance_id": e["instance_id"], "env": e["name"], "url": e.get("url"),
                    "version": e.get("app_version")})
    return out


def update_sites(hub, vk: VaultKey, env_ids: list[str], *, deploy_fn=None, log=lambda m: None) -> dict:
    """Deploy the current version to each environment in order; stop at the first failure (the failed site is put
    back as it was by the deploy itself). Returns {done:[…], failed:{…}|None, skipped:[…]}."""
    from . import deploy as D
    reg = hub.registry
    fn = deploy_fn or (lambda env: D.deploy(hub, vk, env["instance_id"], env["name"], log=log))
    done, failed = [], None
    for i, eid in enumerate(env_ids):
        env = reg.get_environment(eid)
        label = f"{reg.customer_of_env(env)['name']} · {env['name']}"
        log(f"[{i + 1}/{len(env_ids)}] {label} …")
        try:
            res = fn(env)
        except Exception as exc:  # noqa: BLE001
            failed = {"env_id": eid, "label": label, "error": str(exc)}
            log(f"FERMO: {label} non aggiornato ({exc}). Gli altri restano come sono.")
            break
        if isinstance(res, dict) and res.get("ok") is False:
            failed = {"env_id": eid, "label": label, "error": res.get("error") or "deploy non riuscito"}
            log(f"FERMO: {label}: {failed['error']}")
            break
        done.append({"env_id": eid, "label": label})
    skipped = env_ids[len(done) + (1 if failed else 0):]
    reg.log("sites.update", details={"done": len(done), "failed": bool(failed), "skipped": len(skipped)})
    return {"done": done, "failed": failed, "skipped": skipped}


def available_version(reg) -> str | None:
    """Version of DocMap that this hub would publish now (the app folder next to the hub)."""
    from .runner import app_version_of, build_deploy_script
    try:
        return app_version_of(build_deploy_script(reg).parent.parent / "server-php" / "api.php")
    except Exception:  # noqa: BLE001
        return None
