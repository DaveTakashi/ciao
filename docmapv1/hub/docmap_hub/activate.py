"""v0.10: «Attiva tutto» and the «Kit di consegna».

``activate_customer`` does, in order and only what is still missing, every online step of the customer journey:
publish the demo → configure it → publish production (the version verified on the demo when there is one) →
configure it → check. It stops at the first error (the deploy itself puts the files back). It only publishes on
EMPTY folders: if a folder already holds DocMap, it stops and leaves that site to the normal «Pubblica» (plan, read,
confirm), so «Attiva tutto» can never overwrite a site that is already working.

``build_kit`` makes ONE zip to hand over (to Dave, who forwards it or installs it himself): a welcome letter per
person with the address and the access code, the technician's sheet (bridge code, demo codes), the customer sheet,
and the copies of ``config.php`` produced by «Attiva tutto» (only in memory: without key escrow the hub never
stores them). The zip is kept in memory by the job and downloaded from the page; it is never written to disk.
"""

from __future__ import annotations

import base64
import html
import io
import zipfile
from datetime import datetime

from . import sitesetup as SS
from .registry import RegistryError
from .vault import Vault, VaultKey


class ActivateError(RegistryError):
    pass


def _web_envs(reg, cid: str) -> list[tuple[str, dict | None, dict | None]]:
    """[(instance_id, staging, production)] of the customer's online installations."""
    by: dict[str, dict] = {}
    for e in reg.list_environments():
        if e["customer_id"] == cid and e["kind"] == "web-php" and e["name"] in ("staging", "production"):
            by.setdefault(e["instance_id"], {})[e["name"]] = e
    return [(iid, ee.get("staging"), ee.get("production")) for iid, ee in by.items()]


def plan(hub, cid: str) -> list[dict]:
    """What «Attiva tutto» would do now: [{do, env_id, label}] (empty = nothing left online)."""
    reg = hub.registry
    steps = []
    for iid, stg, prod in _web_envs(reg, cid):
        if stg:
            if not stg.get("deployed_version"):
                steps.append({"do": "deploy", "env_id": stg["id"], "label": "Pubblica il sito demo"})
            if not SS.is_configured(hub, stg):
                steps.append({"do": "setup", "env_id": stg["id"], "label": "Configura il sito demo (database e codici)"})
        if prod:
            if not prod.get("deployed_version"):
                steps.append({"do": "deploy", "env_id": prod["id"], "instance_id": iid,
                              "label": "Pubblica il sito vero" + (" (la versione provata sulla demo)" if stg else "")})
            if not SS.is_configured(hub, prod):
                steps.append({"do": "setup", "env_id": prod["id"], "label": "Configura il sito vero (database e codici)"})
            if prod["status"] != "running" or not prod.get("deployed_version"):
                steps.append({"do": "check", "env_id": prod["id"], "label": "Controlla che risponda"})
    return steps


def _check_one(hub, vk: VaultKey, env_id: str) -> dict:
    """Ping ONLY this site (check_all would ping every customer's sites: slow with hundreds of them)."""
    from . import health
    t = [x for x in health.targets(hub, vk) if x["env_id"] == env_id]
    res = health.probe_all(t, timeout=10.0)
    health.store_results(hub, res)
    return res.get(env_id) or {}


def running_activation(jobs, cid: str):
    """The «Attiva tutto» job already running for this customer, if any (two at once would deploy twice)."""
    return next((j for j in jobs if j.kind == "customer-activate" and j.status == "running"
                 and (j.params or {}).get("customer_id") == cid), None)


def _missing_ftp(hub, cid: str) -> list[str]:
    reg, vault = hub.registry, Vault(hub.registry)
    out = []
    for _iid, stg, prod in _web_envs(reg, cid):
        for e in (stg, prod):
            if e and not e.get("deployed_version") and not vault.has(e["id"], "ftp"):
                out.append(e["name"])
    return out


def activate_customer(hub, vk: VaultKey, cid: str, *, log=lambda m: None, deploy_mod=None, setup_fn=None,
                      check_fn=None) -> dict:
    """Run every missing online step. Returns {done:[label], failed:{label,error}|None, configs:{env_name: b64},
    people:{env_name:[user]}}."""
    from . import deploy as D
    from . import health
    D = deploy_mod or D
    setup_fn = setup_fn or (lambda env_id: SS.setup_site(hub, vk, env_id, log=log))
    check_fn = check_fn or (lambda env_id: _check_one(hub, vk, env_id))
    reg = hub.registry
    cust = reg.get_customer(cid)
    steps = plan(hub, cust["id"])
    if not steps:
        return {"done": [], "failed": None, "configs": {}, "people": {}, "nothing": True}
    missing = _missing_ftp(hub, cust["id"])
    if missing:
        raise ActivateError("Manca l'accesso FTP per: " + ", ".join(missing) + ". Aggiungilo dalla scheda del sito "
                            "(Accessi) oppure imposta l'hosting predefinito e rifai il cliente dal modello.")
    done, configs, people = [], {}, {}
    total = len(steps)
    for i, st in enumerate(steps, 1):
        env = reg.get_environment(st["env_id"])
        log(f"[{i}/{total}] {st['label']} …")
        try:
            if st["do"] == "deploy":
                build = D.build_for(hub, env)
                try:
                    dry = D.deploy(hub, vk, env["instance_id"], env["name"], dry_run=True, build=build, log=log)
                    if dry.get("remote_version"):
                        raise ActivateError(
                            f"Nella cartella del sito {env['name']} c'è già DocMap (versione {dry['remote_version']}): "
                            "«Attiva tutto» pubblica solo su cartelle vuote. Usa «Pubblica» (con il piano da leggere).")
                    if dry.get("remote_file_count"):
                        raise ActivateError(
                            f"La cartella del sito {env['name']} non è vuota ({dry['remote_file_count']} file di un "
                            "altro sito?): «Attiva tutto» pubblica solo su cartelle vuote. Controlla l'indirizzo e la "
                            "cartella del sito oppure usa «Pubblica» (con il piano da leggere).")
                    stg = next((s for _, s, p in _web_envs(reg, cust["id"]) if p and p["id"] == env["id"]), None)
                    if env["name"] == "production" and stg and reg.get_environment(stg["id"]).get("verified_version"):
                        D.promote(hub, vk, env["instance_id"], build=build, log=log)
                    else:
                        D.deploy(hub, vk, env["instance_id"], env["name"], build=build, log=log)
                finally:
                    build.cleanup()
            elif st["do"] == "setup":
                r = setup_fn(env["id"])
                people[env["name"]] = [p["user"] for p in r.get("people") or []]
                if r.get("config_php"):
                    configs[env["name"]] = r["config_php"]
            elif st["do"] == "check":
                r = check_fn(env["id"]) or {}
                if r and not r.get("ok"):
                    raise ActivateError(f"Il sito non risponde: {r.get('error') or 'errore'}.")
        except Exception as exc:  # noqa: BLE001 — stop at the first failure, say which step
            failed = {"label": st["label"], "error": str(exc)}
            log(f"FERMO a «{st['label']}»: {exc}")
            reg.log("customer.activate", "customer", cust["id"], {"done": len(done), "failed": st["label"]})
            return {"done": done, "failed": failed, "configs": configs, "people": people}
        done.append(st["label"])
    reg.log("customer.activate", "customer", cust["id"], {"done": len(done), "failed": None})
    log("Fatto: tutto online e configurato.")
    return {"done": done, "failed": None, "configs": configs, "people": people}


# ---------------------------------------------------------------------------
# delivery kit
# ---------------------------------------------------------------------------

LETTER_CSS = """
body{font:15px/1.5 system-ui,Segoe UI,Arial,sans-serif;color:#111;margin:0}
.p{max-width:720px;margin:0 auto;padding:36px 28px;page-break-after:always}
.p:last-child{page-break-after:auto}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 8px}
.mut{color:#555}.box{border:1px solid #bbb;border-radius:8px;padding:14px 16px;margin:14px 0}
.code{font:600 15px/1.4 ui-monospace,Consolas,monospace;word-break:break-all;background:#f3f3f3;padding:8px 10px;border-radius:6px}
ol li{margin:4px 0}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:13px}
@media print{.noprint{display:none}}
"""
ROLE_IT = {"admin": "amministratore", "editor": "operatore", "viewer": "sola lettura"}


def _e(v) -> str:
    return html.escape(str(v if v is not None else ""))


def _codes(hub, vk: VaultKey, cid: str) -> list[dict]:
    """[{env, env_id, url, studio, user, role, token}] from the vault (each read is audited)."""
    reg, vault = hub.registry, Vault(hub.registry)
    out = []
    for _iid, stg, prod in _web_envs(reg, cid):
        for e in (prod, stg):
            if not e:
                continue
            for s in vault.list(env_id=e["id"]):
                if s["kind"] != "admin_token":
                    continue
                d = vault.get(vk, e["id"], "admin_token", s.get("label") or "", reason="kit di consegna")
                out.append({"env": e["name"], "env_id": e["id"], "url": e.get("url") or "",
                            "studio": (e.get("settings") or {}).get("studio_name") or "",
                            "user": d.get("user") or s.get("label"), "role": d.get("role") or "editor",
                            "token": d.get("token") or ""})
    return out


def letters_html(cust: dict, codes: list[dict]) -> str:
    people = [c for c in codes if c["env"] == "production" and c["user"] not in (SS.HUB_ADMIN, SS.BRIDGE_USER)]
    pages = []
    for c in people:
        pages.append(f"""<div class="p"><h1>Benvenuto in DocMap, {_e(c['user'])}</h1>
<div class="mut">{_e(cust['name'])} · archivio dei faldoni</div>
<div class="box"><b>Indirizzo</b><div class="code">{_e(c['url'])}</div>
<b style="display:block;margin-top:10px">Il tuo codice di accesso</b><div class="code">{_e(c['token'])}</div>
<div class="mut" style="margin-top:6px">Ruolo: {_e(ROLE_IT.get(c['role'], c['role']))}. Il codice è personale: non darlo ad altri.</div></div>
<h2>Primo accesso (telefono o computer)</h2>
<ol><li>Apri l'indirizzo qui sopra (oppure inquadra il QR di un faldone).</li>
<li>Alla schermata <b>Primo accesso</b> scegli un nome utente e un PIN per questo dispositivo.</li>
<li>Scrivi il <b>codice di accesso</b> qui sopra. Da quel momento basta il PIN.</li></ol>
<p class="mut">Se il codice non funziona o lo perdi, chiedine uno nuovo all'amministratore dello studio: quello vecchio si
revoca e smette di funzionare.</p></div>""")
    if not pages:
        pages.append('<div class="p"><h1>Nessuna persona</h1><p>Il progetto non prevede persone oltre ai codici tecnici: '
                     'gli accessi si creano dall\'app (amministratore).</p></div>')
    return (f"<!doctype html><html lang='it'><meta charset='utf-8'><title>Lettere di benvenuto · {_e(cust['name'])}</title>"
            f"<style>{LETTER_CSS}</style><body>{''.join(pages)}</body></html>")


def tech_html(cust: dict, codes: list[dict], configs: dict, escrow: bool) -> str:
    rows = "".join(f"<tr><td>{'sito vero' if c['env'] == 'production' else 'demo'}</td><td>{_e(c['user'])}</td>"
                   f"<td>{_e(ROLE_IT.get(c['role'], c['role']))}</td><td class='code'>{_e(c['token'])}</td></tr>"
                   for c in codes)
    cfg = ("<p>Le copie di <b>config.php</b> sono nella cartella <b>config</b> di questo kit: contengono la chiave del "
           "database. Consegnale al cliente (chiavetta o gestore di password) e cancellale da qui: l'hub non le "
           "conserva. Senza copia, se il file sul server si perde, i dati online non si leggono più.</p>"
           if configs else
           ("<p>La chiave del database è custodita nella cassaforte del hub (custodia autorizzata dal cliente).</p>"
            if escrow else
            "<p><b>Nessuna copia di config.php in questo kit</b> (sito non raggiungibile via FTP?): rifai il kit più "
            "tardi o scarica <b>server-php/config.php</b> via FTP e consegnalo al cliente.</p>"))
    return (f"<!doctype html><html lang='it'><meta charset='utf-8'><title>Scheda tecnica · {_e(cust['name'])}</title>"
            f"<style>{LETTER_CSS}</style><body><div class='p'><h1>Scheda tecnica · {_e(cust['name'])}</h1>"
            f"<p class='mut'>Per chi installa. Contiene codici riservati: non lasciarla in giro.</p>"
            f"<h2>Codici di accesso</h2><table><tr><th>Sito</th><th>Utente</th><th>Ruolo</th><th>Codice</th></tr>{rows or '<tr><td colspan=4>Nessuno</td></tr>'}</table>"
            f"<p class='mut'><b>admin</b> è il codice dell'amministratore (tuo); <b>{SS.BRIDGE_USER}</b> serve solo al "
            f"server in sede per sincronizzarsi (configura-sync.ps1).</p><h2>Chiave del database</h2>{cfg}</div></body></html>")


def fetch_configs(hub, vk: VaultKey, cid: str, *, skip=(), remote_for=None, log=lambda m: None) -> tuple[dict, list]:
    """Copies of ``server-php/config.php`` read back from the customer's sites over their FTP access.

    So a lost or never-downloaded kit is not a lost database key: «Kit di consegna» can be made again at any time
    with the copies. Returns ({env_name: b64}, [env_name not read])."""
    from .deploy import CONFIG, open_remote
    reg, vault = hub.registry, Vault(hub.registry)
    got, missing = {}, []
    for _iid, stg, prod in _web_envs(reg, cid):
        for e in (prod, stg):
            if not e or e["name"] in skip or not SS.is_configured(hub, e):
                continue
            try:
                sec = vault.get(vk, e["id"], "ftp", reason="kit di consegna: copia di config.php", required=False)
                if not sec:
                    raise ActivateError("nessun accesso FTP")
                rem = remote_for(e, sec) if remote_for else open_remote(sec, known_hosts=hub.dir / "known_hosts")
                try:
                    b = rem.read(CONFIG)
                finally:
                    rem.close()
                if not b:
                    raise ActivateError("config.php non trovato sul sito")
                got[e["name"]] = base64.b64encode(b).decode()
                log(f"  copia di config.php ripresa dal sito {e['name']}")
            except Exception as exc:  # noqa: BLE001 — the kit is still useful without it; say so
                missing.append(e["name"])
                log(f"  config.php del sito {e['name']} non ripreso: {exc}")
    return got, missing


def build_kit(hub, vk: VaultKey, cid: str, configs: dict | None = None, *, fetch: bool = True, remote_for=None,
              log=lambda m: None) -> tuple[str, bytes]:
    from .onboarding import Onboarding, scheda_html
    from .templates import web_slug
    reg = hub.registry
    cust = reg.get_customer(cid)
    codes = _codes(hub, vk, cust["id"])
    configs = dict(configs or {})
    escrow = bool(cust.get("key_escrow"))
    missing = []
    if fetch and not escrow:
        more, missing = fetch_configs(hub, vk, cust["id"], skip=tuple(configs), remote_for=remote_for, log=log)
        configs.update(more)
    slug = web_slug(cust["name"])
    stamp = datetime.now().strftime("%Y%m%d-%H%M")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("LEGGIMI.txt", (
            f"Kit di consegna · {cust['name']} · {stamp}\r\n\r\n"
            "1-lettere-di-benvenuto.html  una pagina per persona: indirizzo, codice di accesso, primo accesso.\r\n"
            "                             Stampala o mandala a ognuno (ogni codice è personale).\r\n"
            "2-scheda-tecnica.html        tutti i codici (anche admin e ponte-sync): solo per chi installa.\r\n"
            "3-scheda-cliente.html        riepilogo del cliente (indirizzi, licenze, pacchetti).\r\n"
            + ("config/                      copie di config.php (chiave del database): consegnale al cliente.\r\n"
               if configs else "")
            + (f"ATTENZIONE: copia di config.php non ripresa per: {', '.join(missing)} (riprovala più tardi o "
               "scaricala via FTP: server-php/config.php).\r\n" if missing else "")
            + "\r\nContiene codici riservati: consegnalo su chiavetta o in modo sicuro, poi cancella le copie.\r\n"))
        z.writestr("1-lettere-di-benvenuto.html", letters_html(cust, codes))
        z.writestr("2-scheda-tecnica.html", tech_html(cust, codes, configs, escrow))
        try:
            z.writestr("3-scheda-cliente.html", scheda_html(hub, cust["id"]))
        except Exception:  # noqa: BLE001 — the sheet is a convenience
            pass
        for env_name, b64 in configs.items():
            z.writestr(f"config/{'sito-vero' if env_name == 'production' else 'demo'}-config.php",
                       base64.b64decode(b64))
        sede = Onboarding(hub, log=lambda *_: None).find_instance(cust["id"], "sede")
        if sede:
            z.writestr("4-sede-LEGGIMI.txt",
                       "Il pacchetto per il PC dello studio si scarica dalla scheda del cliente → Pubblica "
                       "(«Pacchetto per la sede»): è grande e resta a parte.\r\n")
    reg.log("customer.kit", "customer", cust["id"], {"codes": len(codes), "config_php": sorted(configs)})
    return f"DocMap-kit-{slug}-{stamp}.zip", buf.getvalue()
