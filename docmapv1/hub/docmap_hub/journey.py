"""v0.9: «Percorso del cliente» — where each customer is, and the ONE next thing to do.

Computed from what the hub already knows (registry, vault, last checks, prepared packages): nothing to fill in by
hand. Each step is ``{id, title, done, hint, action}``; ``action`` tells the page which button to show:

  {"do": "deploy",  "env_id"}        publish the site (plan → confirm, automatic rollback)
  {"do": "promote", "instance_id"}   publish in production the version verified on staging
  {"do": "setup",   "env_id"}        configure the site: setup.php run by the hub, codes into the vault
  {"do": "check"}                    check every site and server now
  {"do": "tab",     "tab"}           open a tab of the customer page (licences, packages…)
  {"do": "env",     "env_id"}        open the environment (to write the sede address, …)
"""

from __future__ import annotations

from . import sitesetup as SS
from .vault import Vault


def _step(sid, title, done, hint="", action=None):
    return {"id": sid, "title": title, "done": bool(done), "hint": hint, "action": None if done else action}


def for_customer(hub, cid: str, *, packages: dict | None = None) -> dict:
    reg = hub.registry
    cust = reg.get_customer(cid)
    insts = reg.list_instances(cust["id"])
    envs = [e for e in reg.list_environments() if e["customer_id"] == cust["id"]]
    vault_rows = Vault(reg).list()
    has_secret = lambda eid, kind, label=None: any(  # noqa: E731
        s["env_id"] == eid and s["kind"] == kind and (label is None or s.get("label") == label) for s in vault_rows)
    steps = []
    if not insts:
        steps.append(_step("installazioni", "Scegli sede e/o sito online e emetti la licenza", False,
                           "Il modo più semplice: «Nuovo cliente» rifà il percorso guidato con questi dati.",
                           {"do": "tab", "tab": "licenze"}))
        return _wrap(steps)
    missing = [i["label"] for i in insts if reg.latest_licence(i["id"]) is None]
    steps.append(_step("licenza", "Licenza emessa", not missing,
                       "Manca per: " + ", ".join(missing) if missing else "", {"do": "tab", "tab": "licenze"}))

    web = [e for e in envs if e["kind"] == "web-php"]
    by_inst: dict[str, dict] = {}
    for e in web:
        by_inst.setdefault(e["instance_id"], {})[e["name"]] = e
    for iid, ee in by_inst.items():
        stg, prod = ee.get("staging"), ee.get("production")
        if stg:
            steps.append(_step(f"pub-{stg['id']}", "Sito di prova pubblicato", stg.get("deployed_version"),
                               "Serve l'accesso FTP in cassaforte (o carica a mano l'autoinstall)."
                               if not has_secret(stg["id"], "ftp") else "Carica i file del sito di prova.",
                               {"do": "deploy", "env_id": stg["id"]}))
            steps.append(_step(f"cfg-{stg['id']}", "Sito di prova configurato (database e codici)",
                               SS.is_configured(hub, stg),
                               "L'hub lancia setup.php e mette i codici in cassaforte, senza copiare nulla a mano.",
                               {"do": "setup", "env_id": stg["id"]}))
        if prod:
            verified = stg is not None and stg.get("verified_version")
            pub_action = ({"do": "promote", "instance_id": iid} if verified else {"do": "deploy", "env_id": prod["id"]})
            steps.append(_step(f"pub-{prod['id']}", "Sito pubblicato in produzione", prod.get("deployed_version"),
                               "Pubblica in produzione la versione già provata." if verified else
                               "Pubblica il sito.", pub_action))
            steps.append(_step(f"cfg-{prod['id']}", "Sito di produzione configurato (database e codici)",
                               SS.is_configured(hub, prod),
                               "Database diverso da quello di prova, con i suoi codici: li crea l'hub.",
                               {"do": "setup", "env_id": prod["id"]}))
            steps.append(_step(f"chk-{prod['id']}", "Sito controllato e raggiungibile", prod["status"] == "running",
                               "Premi «Controlla» per verificarlo da qui.", {"do": "check"}))

    sede = [i for i in insts if i.get("notes") == "onboarding:sede"]
    for i in sede:
        pk = (packages or {}).get("sede")
        steps.append(_step(f"pkg-{i['id']}", "Pacchetto per il PC dello studio pronto", pk,
                           "Preparalo dalla scheda «Pubblica».", {"do": "tab", "tab": "pubblica"}))
        se = next((e for e in envs if e["instance_id"] == i["id"]), None)
        installed = se is not None and se.get("url") and se["status"] == "running"
        steps.append(_step(f"inst-{i['id']}", "DocMap installato sul PC dello studio", installed,
                           "Sul PC del cliente: estrai lo zip e lancia installa.bat. Poi scrivi qui l'indirizzo che "
                           "mostra alla fine (https://IP:8443/) e premi «Controlla» (dallo studio o in VPN).",
                           {"do": "env", "env_id": se["id"]} if se else {"do": "tab", "tab": "pubblica"}))
        if by_inst:
            prod = next((ee.get("production") for ee in by_inst.values() if ee.get("production")), None)
            if prod:
                steps.append(_step(f"bridge-{i['id']}", "Codice del ponte pronto (sincronizzazione sede ⇄ online)",
                                   has_secret(prod["id"], "admin_token", SS.BRIDGE_USER),
                                   "Si crea configurando il sito di produzione; poi in sede configura-sync.ps1.",
                                   {"do": "setup", "env_id": prod["id"]}))
    return _wrap(steps)


def _wrap(steps: list[dict]) -> dict:
    nxt = next((s for s in steps if not s["done"]), None)
    return {"steps": steps, "done": sum(1 for s in steps if s["done"]), "total": len(steps),
            "next": nxt, "complete": nxt is None}
