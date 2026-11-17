"""v0.11: «Sposta il sito» — move a customer's online site to another address, with its data.

The new address can be anything served over HTTPS: another folder of the same domain, a new domain
(``https://docmap.it/studio-rossi/``), a domain with a deeper path (``https://archivio.studiorossi.it/docmap/2026/``)
or the root of a domain. The FTP access of the new place is one of:

* ``dominio``  — the «Hosting predefinito» (the address must be under its domain; the folder follows the path);
* ``stesso``   — the same FTP account the site uses now, another folder;
* ``cliente``  — another FTP account (host, user, password, folder), e.g. the customer's own hosting.

How the data travel: NOT by copying database files (they live outside the web folder, often out of reach of the FTP
account, and the database key is tied to them). The hub publishes DocMap at the new address, configures it (new
database, new key, new access codes in the vault) and then copies every record from the old site to the new one with
the same bridge the office server uses (``docmap_server sync-remote``, old → new): faldoni, clienti, ubicazioni,
archivi, movimenti, eliminazioni, impostazioni condivise and activity log. Nothing is deleted on the old site.

Last (optional, on by default): the old folder gets an ``.htaccess`` that redirects every address to the same path
under the new one (``…/studio-de/q/<code>`` → ``…/nuovo/q/<code>``), so printed QR labels and bookmarks keep working
even before the qr7.it destination is changed. The previous ``.htaccess`` is kept as ``.htaccess.prima-dello-spostamento``.

Resumable: every step is recorded in the setting ``move.<env_id>``; running the move again with the same address
continues from the first step not done. What a move cannot do by itself (said in the result and in the kit):
the office server's bridge must be pointed to the new address (``aggiorna-ponte`` folder of the kit) and people sign in
again with their new codes (welcome letters in the kit).
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

from . import hosting as H
from . import sitesetup as SS
from .registry import RegistryError
from .vault import Vault, VaultKey

PREFIX = "move."
NOTE_LABEL = "sito-precedente"
HTACCESS_KEEP = ".htaccess.prima-dello-spostamento"


class MoveError(RegistryError):
    pass


def norm_url(u: str) -> str:
    u = (u or "").strip()
    p = urlsplit(u)
    if p.scheme != "https" or not p.netloc:
        raise MoveError("Il nuovo indirizzo deve iniziare con https:// (es. https://docmap.it/studio-rossi/).")
    if p.query or p.fragment or ".." in p.path:
        raise MoveError("Nuovo indirizzo: niente ?…, #… o «..».")
    path = re.sub(r"/{2,}", "/", p.path or "/")
    if not re.fullmatch(r"/([A-Za-z0-9._~-]+/)*([A-Za-z0-9._~-]+)?", path):
        raise MoveError("Nuovo indirizzo: nel percorso solo lettere, numeri, punto, trattino e /.")
    if not path.endswith("/"):
        path += "/"
    return f"https://{p.netloc.lower()}{path}"


def state(reg, env_id: str) -> dict | None:
    v = reg.get_setting(PREFIX + env_id)
    return json.loads(v) if v else None


def _save_state(reg, env_id: str, st: dict | None) -> None:
    reg.set_setting(PREFIX + env_id, json.dumps(st, sort_keys=True) if st is not None else None, log=False)


def _folder_on_hosting(reg, url: str) -> str:
    h = H.get(reg)
    if not h:
        raise MoveError("Nessun hosting predefinito: impostalo (Impostazioni) o scegli un altro accesso FTP.")
    base = h["base_url"]
    if not url.startswith(base):
        raise MoveError(f"Il nuovo indirizzo non è sul dominio dell'hosting predefinito ({base}): scegli «stesso FTP» "
                        "con la cartella, oppure «FTP del cliente».")
    rel = url[len(base):].strip("/")
    bf = h["base_folder"] or "/"
    if h["protocol"] == "local":
        return bf.rstrip("/") + ("/" + rel if rel else "")
    return bf + (rel + "/" if rel else "")


def customer_of(reg, env: dict) -> dict:
    """The customer an environment belongs to (get_environment rows carry only the instance)."""
    return reg.get_customer(reg.get_instance(env["instance_id"])["customer_id"])


def preview(hub, env_id: str, new_url: str, ftp_mode: str = "dominio", folder: str | None = None) -> dict:
    reg = hub.registry
    env = reg.get_environment(env_id)
    if env["kind"] != "web-php":
        raise MoveError("Si spostano solo i siti online (web-php).")
    url = norm_url(new_url)
    if url == (env.get("url") or ""):
        raise MoveError("È già il suo indirizzo.")
    for e in reg.list_environments():
        if e["id"] != env["id"] and (e.get("url") or "").rstrip("/") == url.rstrip("/"):
            raise MoveError(f"L'indirizzo {url} è già di un altro sito del hub ({e['customer_name']} · {e['name']}).")
    if ftp_mode not in ("dominio", "stesso", "cliente"):
        raise MoveError("Accesso FTP: dominio, stesso o cliente.")
    if ftp_mode == "dominio":
        folder = _folder_on_hosting(reg, url)
    elif not (folder or "").strip():
        raise MoveError("Scrivi la cartella del nuovo sito come la vede l'account FTP (es. /public_html/docmap/).")
    cust = customer_of(reg, env)
    has_sede = any(i.get("kind") == "onprem" for i in reg.list_instances(cust["id"]))
    return {"env": {"id": env["id"], "name": env["name"], "url": env.get("url"), "customer": cust["name"]},
            "url": url, "api_url": url + "server-php/api.php", "folder": folder, "ftp_mode": ftp_mode,
            "has_sede": has_sede, "resume": state(reg, env["id"])}


def _sync(hub, old: dict, new: dict, log) -> dict:
    """Copy every record old → new with the server bridge (a subprocess of the hub's Python, tokens via env)."""
    from .runner import server_python_dir
    sp = server_python_dir(hub.registry)
    with tempfile.TemporaryDirectory(prefix="docmap-hub-move-") as td:
        prof = Path(td) / "sposta.json"
        prof.write_text(json.dumps({
            "name": "Sposta il sito",
            "a": {"label": "Sito precedente", "url": old["api_url"], "token": "", "token_env": "DOCMAP_SYNC_A_TOKEN",
                  "basic_user": "", "basic_pass": "", "ca": "", "insecure_lan": False, "max_body_mb": 20},
            "b": {"label": "Sito nuovo", "url": new["api_url"], "token": "", "token_env": "DOCMAP_SYNC_B_TOKEN",
                  "basic_user": "", "basic_pass": "", "ca": "", "insecure_lan": False, "max_body_mb": 20},
            "direction": "a-to-b", "sync_settings": True, "sync_activity_log": True}), "utf-8")
        env = dict(os.environ, DOCMAP_SYNC_A_TOKEN=old["token"], DOCMAP_SYNC_B_TOKEN=new["token"],
                   PYTHONPATH=str(sp) + os.pathsep + os.environ.get("PYTHONPATH", ""), PYTHONIOENCODING="utf-8")
        r = subprocess.run([sys.executable, "-m", "docmap_server", "sync-remote", str(prof), "--direction", "a-to-b",
                            "--json"], cwd=str(sp), env=env, capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=3600)
    try:
        rep = json.loads(r.stdout)
    except ValueError:
        rep = {"errors": [(r.stderr or r.stdout or "").strip()[-400:]]}
    if r.returncode == 2 or rep.get("errors"):
        raise MoveError("Copia dei dati non riuscita: " + "; ".join(map(str, rep.get("errors") or ["errore"]))[:600])
    log("  dati copiati dal sito precedente (" + _counts(rep) + ")")
    return rep


def _counts(rep: dict) -> str:
    try:
        tot = rep.get("totals") or rep.get("pushed") or {}
        return ", ".join(f"{k}: {v}" for k, v in tot.items()) or "fatto"
    except AttributeError:
        return "fatto"


def redirect_htaccess(old_url: str, new_url: str, current: bytes | None) -> bytes:
    path = urlsplit(old_url).path or "/"
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rules = (f"# DocMap: sito spostato il {stamp} su {new_url}\n"
             f"# Il file di prima è in {HTACCESS_KEEP}. Ogni indirizzo va allo stesso percorso del sito nuovo\n"
             "# (anche i QR: .../q/<codice>).\n"
             f"RedirectMatch 301 ^{re.escape(path)}(.*)$ {new_url}$1\n")
    return rules.encode("utf-8")


def move_site(hub, vk: VaultKey, env_id: str, new_url: str, *, ftp_mode: str = "dominio", folder: str | None = None,
              ftp: dict | None = None, redirect_old: bool = True, log=lambda m: None, deploy_mod=None, setup_fn=None,
              sync_fn=None, remote_for=None) -> dict:
    """Move a web site; returns {done:[…], url, configs, people, sync, redirect, notes:[…]} (raises at the first error,
    the state stays and the same call resumes)."""
    from . import deploy as D
    from .deploy import open_remote
    D = deploy_mod or D
    reg, vault = hub.registry, Vault(hub.registry)
    pv = preview(hub, env_id, new_url, ftp_mode, folder)
    env = reg.get_environment(env_id)
    url, api_url, folder = pv["url"], pv["api_url"], pv["folder"]
    st = state(reg, env["id"])
    if st and st.get("new_url") != url:
        raise MoveError(f"C'è già uno spostamento in corso verso {st.get('new_url')}: finiscilo (stesso indirizzo) "
                        "oppure annullalo.")
    done = []
    if not st:
        # 1. remember the old site (address, FTP, admin code) in the vault, then point the hub at the new place
        old_ftp = vault.get(vk, env["id"], "ftp", reason="sposta il sito", required=False)
        old_admin = vault.get(vk, env["id"], "admin_token", "admin", reason="sposta il sito", required=False)
        if not old_admin:
            raise MoveError("Manca in cassaforte il codice admin del sito di adesso: senza, i dati non si possono "
                            "copiare. Aggiungilo da Accessi (codice admin del sito) e riprova.")
        if ftp_mode == "dominio":
            new_ftp = H.ftp_access(reg, vk, folder)
        elif ftp_mode == "stesso":
            if not old_ftp:
                raise MoveError("Il sito di adesso non ha un accesso FTP in cassaforte: scegli «FTP del cliente».")
            new_ftp = dict(old_ftp, remote_path=folder)
        else:
            f = dict(ftp or {})
            if not (f.get("host") and f.get("user")):
                raise MoveError("FTP del cliente: servono almeno server (host), utente e password.")
            f.setdefault("protocol", "ftps")
            f["remote_path"] = folder
            new_ftp = f
        from .vault import validate
        new_ftp = validate("ftp", new_ftp)
        codes = [{"label": c.get("label") or "", "data": vault.get(vk, env["id"], "admin_token", c.get("label") or "",
                                                                reason="sposta il sito")}
                 for c in vault.list(env_id=env["id"]) if c["kind"] == "admin_token"]
        vault.put(vk, env["id"], "note", {"text": json.dumps(
            {"url": env.get("url"), "api_url": env.get("api_url"), "token": old_admin["token"], "ftp": old_ftp,
             "codes": codes, "settings": env.get("settings") or {}, "setup": SS.setup_state(reg, env["id"]),
             "deployed_version": env.get("deployed_version")})}, label=NOTE_LABEL)
        for s in vault.list(env_id=env["id"]):
            if s["kind"] == "admin_token":
                vault.delete(env["id"], "admin_token", s.get("label") or "")
        reg.set_setting(SS.SETUP_DONE_PREFIX + env["id"], None, log=False)
        vault.put(vk, env["id"], "ftp", new_ftp)
        p = urlsplit(url)
        settings = dict(env.get("settings") or {})
        settings.update(base_path=p.path or "/", domain=f"https://{p.netloc}",
                        slug=p.path.strip("/").split("/")[-1] or settings.get("slug") or "studio")
        reg.update_environment(env["id"], log_action="env.move", url=url, api_url=api_url, deployed_version=None,
                               status="unknown", settings=settings)
        st = {"new_url": url, "old_url": env.get("url"), "at": datetime.now(timezone.utc).isoformat(), "steps": []}
        _save_state(reg, env["id"], st)
        reg.log("site.move.start", "environment", env["id"], {"from": st["old_url"], "to": url, "ftp_mode": ftp_mode})
        log(f"Sposto {customer_of(reg, env)['name']} · {env['name']}: {st['old_url']} → {url}")
    old = json.loads(vault.get(vk, env["id"], "note", NOTE_LABEL, reason="sposta il sito")["text"])
    env = reg.get_environment(env["id"])

    def step(name, label, fn):
        if name in st["steps"]:
            return None
        log(f"{label} …")
        out = fn()
        st["steps"].append(name)
        _save_state(reg, env["id"], st)
        done.append(label)
        return out

    def do_deploy():
        build = D.build_for(hub, env)
        try:
            dry = D.deploy(hub, vk, env["instance_id"], env["name"], dry_run=True, build=build, log=log)
            if dry.get("remote_version") or dry.get("remote_file_count"):
                raise MoveError(f"La cartella del nuovo indirizzo non è vuota ({dry.get('remote_file_count') or 'DocMap'}"
                                " file): scegli una cartella vuota.")
            D.deploy(hub, vk, env["instance_id"], env["name"], build=build, log=log)
        finally:
            build.cleanup()
    step("deploy", "Pubblico DocMap al nuovo indirizzo", do_deploy)
    res = {"configs": {}, "people": {}}

    def do_setup():
        r = (setup_fn or (lambda eid: SS.setup_site(hub, vk, eid, log=log)))(env["id"])
        res["people"][env["name"]] = [p["user"] for p in r.get("people") or []]
        if r.get("config_php"):
            res["configs"][env["name"]] = r["config_php"]
    step("setup", "Configuro il nuovo sito (database, chiave, codici)", do_setup)

    def do_sync():
        new_tok = vault.get(vk, env["id"], "admin_token", "admin", reason="sposta il sito")["token"]
        return (sync_fn or (lambda o, n: _sync(hub, o, n, log)))(
            {"api_url": old["api_url"], "token": old["token"]}, {"api_url": api_url, "token": new_tok})
    res["sync"] = step("sync", "Copio i dati dal sito precedente", do_sync)

    def do_redirect():
        if not old.get("ftp"):
            log("  il sito precedente non ha un accesso FTP in cassaforte: niente reindirizzamento")
            return {"done": False, "why": "nessun FTP"}
        rem = remote_for(old["ftp"]) if remote_for else open_remote(old["ftp"], known_hosts=hub.dir / "known_hosts")
        try:
            cur = rem.read(".htaccess")
            if cur is not None and not rem.read(HTACCESS_KEEP):
                rem.upload_bytes(cur, HTACCESS_KEEP)
            rem.upload_bytes(redirect_htaccess(old["url"], url, cur), ".htaccess")
        finally:
            rem.close()
        log(f"  il vecchio indirizzo {old['url']} ora porta a {url} (anche i QR)")
        return {"done": True}
    if redirect_old and old.get("url"):
        res["redirect"] = step("redirect", "Reindirizzo il vecchio indirizzo al nuovo", do_redirect)
    reg.log("site.move.done", "environment", env["id"], {"from": old.get("url"), "to": url, "steps": st["steps"]})
    vault.delete(env["id"], "note", NOTE_LABEL)
    _save_state(reg, env["id"], None)
    notes = ["Le persone entrano con i codici nuovi (lettere di benvenuto nel kit)."]
    if pv["has_sede"]:
        notes.append("Server in sede: esegui aggiorna-ponte\\AGGIORNA-PONTE.bat del kit sul PC server (come "
                     "amministratore): il ponte passa al nuovo indirizzo.")
    if not (redirect_old and (res.get("redirect") or {}).get("done")):
        notes.append(f"Su qr7.it cambia la destinazione in {url}q/<codice>.")
    log("Fatto: il sito è al nuovo indirizzo con i suoi dati.")
    return {"done": done, "url": url, "old_url": old.get("url"), "configs": res["configs"], "people": res["people"],
            "sync": res.get("sync"), "redirect": res.get("redirect"), "notes": notes, "has_sede": pv["has_sede"]}


def cancel(hub, vk: VaultKey, env_id: str) -> dict:
    """Undo a move that did not finish: the hub points back to the old site (nothing is deleted anywhere)."""
    reg, vault = hub.registry, Vault(hub.registry)
    env = reg.get_environment(env_id)
    st = state(reg, env["id"])
    if not st:
        raise MoveError("Nessuno spostamento in corso per questo sito.")
    if "sync" in st["steps"]:
        raise MoveError("I dati sono già stati copiati: completa lo spostamento (stesso indirizzo) invece di annullarlo.")
    old = json.loads(vault.get(vk, env["id"], "note", NOTE_LABEL, reason="annulla spostamento")["text"])
    for s in vault.list(env_id=env["id"]):
        if s["kind"] == "admin_token":
            vault.delete(env["id"], "admin_token", s.get("label") or "")
    for c in old.get("codes") or [{"label": "admin", "data": {"user": "admin", "role": "admin", "token": old["token"]}}]:
        vault.put(vk, env["id"], "admin_token", c["data"], label=c["label"])
    if old.get("ftp"):
        vault.put(vk, env["id"], "ftp", old["ftp"])
    if old.get("setup"):
        reg.set_setting(SS.SETUP_DONE_PREFIX + env["id"], json.dumps(old["setup"]), log=False)
    reg.update_environment(env["id"], log_action="env.move.cancel", url=old["url"], api_url=old["api_url"],
                           settings=old.get("settings") or {}, status="unknown",
                           deployed_version=old.get("deployed_version"))
    vault.delete(env["id"], "note", NOTE_LABEL)
    _save_state(reg, env["id"], None)
    return {"url": old["url"]}


BRIDGE_BAT = ("@echo off\r\n"
              "rem DocMap - il ponte del server in sede passa al NUOVO indirizzo del sito (da eseguire sul PC server).\r\n"
              "setlocal\r\ncd /d \"%~dp0\"\r\n"
              "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"C:\\DocMap\\strumenti\\configura-sync.ps1\" "
              "-Modello \"%~dp0sync-profile.template.json\" -TokenFile \"%~dp0token-ponte.txt\"\r\n"
              "pause\r\nendlocal\r\n")


def bridge_files(hub, vk: VaultKey, cid: str, url: str, customer_name: str) -> dict:
    """``aggiorna-ponte/`` for the kit: the bridge template with the new address, the new ponte-sync code, a .bat."""
    from .packages import bridge_token
    tok = bridge_token(hub, vk, cid)
    if not tok:
        return {}
    tpl = {"formato": 1, "name": f"Web ⇄ Studio — {customer_name}"[:120],
           "a": {"label": "Web (online)", "url": url.rstrip("/") + "/server-php/api.php", "basic_user": ""},
           "direction": "both", "ogni_minuti": 10}
    return {"aggiorna-ponte/sync-profile.template.json": json.dumps(tpl, ensure_ascii=False, indent=2) + "\n",
            "aggiorna-ponte/token-ponte.txt": tok + "\r\n",
            "aggiorna-ponte/AGGIORNA-PONTE.bat": BRIDGE_BAT,
            "aggiorna-ponte/LEGGIMI.txt": ("Il sito si e spostato su " + url + ".\r\nSul PC server dello studio, come "
                                           "amministratore: doppio clic su AGGIORNA-PONTE.bat.\r\nPoi cancella questa "
                                           "cartella (contiene il codice del ponte).\r\n")}
