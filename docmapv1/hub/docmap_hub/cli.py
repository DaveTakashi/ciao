"""Command line of DocMap Hub: ``python -m docmap_hub <comando>``.

Messages for the user are in Italian. The passphrase of the signing key is
asked interactively; for scripts and tests it can come from the environment
variable ``DOCMAP_HUB_PASSPHRASE`` or from ``--passphrase-file``.
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import sys
from pathlib import Path

from . import __version__
from . import licence as L
from .keys import KeyError_, KeyStore
from .registry import RegistryError
from .service import Hub

ENV_PASSPHRASE = "DOCMAP_HUB_PASSPHRASE"

MODE_IT = {
    L.MODE_FULL: "VALIDA",
    L.MODE_GRACE: "IN TOLLERANZA",
    L.MODE_READ_ONLY: "SOLA LETTURA",
    L.MODE_INVALID: "NON VALIDA",
}


class CliError(Exception):
    pass


def out(msg: str = "") -> None:
    print(msg)


def get_passphrase(args, confirm: bool = False, prompt: str = "Passphrase della chiave di firma: ") -> str:
    if getattr(args, "passphrase_file", None):
        return Path(args.passphrase_file).read_text("utf-8").strip("\r\n")
    env = os.environ.get(ENV_PASSPHRASE)
    if env:
        return env
    p = getpass.getpass(prompt)
    if confirm:
        if getpass.getpass("Ripeti la passphrase: ") != p:
            raise CliError("Le due passphrase non coincidono.")
    return p


def _limit(v) -> str:
    return "illimitato" if v is None else str(v)


def table(rows: list[list], headers: list[str]) -> None:
    rows = [[("" if c is None else str(c)) for c in r] for r in rows]
    w = [max([len(h)] + [len(r[i]) for r in rows]) for i, h in enumerate(headers)]
    out("  ".join(h.ljust(w[i]) for i, h in enumerate(headers)))
    out("  ".join("-" * x for x in w))
    for r in rows:
        out("  ".join(c.ljust(w[i]) for i, c in enumerate(r)))
    if not rows:
        out("(nessun elemento)")


def describe_status(st: L.LicenceStatus) -> None:
    lic = st.licence or {}
    out(f"Stato:        {MODE_IT[st.mode]} ({st.mode})")
    out(f"Messaggio:    {st.message_it}")
    if lic:
        cust = lic.get("customer") or {}
        out(f"Licenza:      {lic.get('licence_id')}")
        out(f"Cliente:      {cust.get('name')}" + (f"  P.IVA {cust['vat_id']}" if cust.get("vat_id") else ""))
        out(f"Installazione:{' '}{lic.get('instance_id')}")
        out(f"Piano:        {lic.get('plan')}")
        out(f"Validità:     dal {lic.get('valid_from')} al {lic.get('expires_at')} "
            f"(+{lic.get('grace_days')} giorni di tolleranza)")
        if st.days_left is not None:
            out(f"Giorni:       {st.days_left} alla scadenza" +
                (f", {st.grace_days_left} di tolleranza rimasti" if st.mode == L.MODE_GRACE else ""))
        limits = lic.get("limits") or {}
        out("Limiti:       " + ", ".join(f"{k}={_limit(v)}" for k, v in sorted(limits.items())))
        out("Funzioni:     " + (", ".join(lic.get("features") or []) or "-"))
        if lic.get("reseller"):
            out(f"Rivenditore:  {lic['reseller'].get('name')} ({lic['reseller'].get('id')})")
        if lic.get("branding"):
            out(f"Marchio:      {json.dumps(lic['branding'], ensure_ascii=False)}")
        out(f"Chiave:       {lic.get('key_id')}")
    for d in st.details:
        out(f"Dettaglio:    {d}")


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def cmd_init(hub: Hub, args) -> int:
    out(f"Hub inizializzato in: {hub.dir}")
    out(f"Registro: {hub.registry.path} (schema {hub.registry.schema_version()})")
    if not hub.keys.active_id:
        out("Passo successivo: crea la chiave di firma con  python -m docmap_hub keygen")
    hub.registry.log("hub.init", details={"dir": str(hub.dir)})
    return 0


def cmd_keygen(hub: Hub, args) -> int:
    if hub.keys.active_id and not args.rotate:
        raise CliError("Esiste già una chiave attiva. Per sostituirla usa 'keygen --rotate' "
                       "(le licenze già emesse restano valide).")
    p = get_passphrase(args, confirm=True)
    info = hub.keys.generate(p, rotate=args.rotate)
    hub.registry.log("key.rotate" if args.rotate else "key.generate", "key", info.key_id,
                     {"public_b64": info.public_b64})
    out(f"Chiave di firma creata: {info.key_id}")
    out(f"Chiave pubblica (base64): {info.public_b64}")
    out("IMPORTANTE: fai subito un backup della cartella dati e annota la passphrase in un luogo sicuro.")
    out("Senza chiave privata e passphrase non potrai più rinnovare le licenze.")
    if args.rotate:
        out("Ricorda: distribuisci il nuovo file delle chiavi pubbliche (export-public-key) alle installazioni.")
    return 0


def cmd_keys_list(hub: Hub, args) -> int:
    table([[k.key_id, k.status, k.created_at, k.public_b64] for k in hub.keys.list()],
          ["chiave", "stato", "creata", "pubblica (base64)"])
    return 0


def cmd_export_public_key(hub: Hub, args) -> int:
    text = hub.keys.export(args.format, args.key_id)
    if args.out:
        Path(args.out).write_text(text, "utf-8", newline="\n")
        out(f"Chiave pubblica scritta in: {args.out}")
    else:
        sys.stdout.write(text)
    return 0


def cmd_plans(hub: Hub, args) -> int:
    table([[pid, p.get("label"), p.get("duration_months"), p.get("grace_days"),
            ", ".join(f"{k}={_limit(v)}" for k, v in p.get("limits", {}).items()),
            ", ".join(p.get("features", []))] for pid, p in hub.plans.items()],
          ["piano", "nome", "mesi", "tolleranza", "limiti", "funzioni"])
    return 0


def cmd_reseller_add(hub: Hub, args) -> int:
    branding = None
    if args.product_name:
        branding = {"product_name": args.product_name}
        for k in ("logo_url", "primary_color", "support_email"):
            if getattr(args, k):
                branding[k] = getattr(args, k)
    r = hub.registry.add_reseller(args.name, args.vat, args.email, branding, args.notes)
    out(f"Rivenditore aggiunto: {r['name']}  id={r['id']}")
    if not branding:
        out("Nota: senza --product-name le licenze dei suoi clienti non avranno marchio personalizzato.")
    return 0


def cmd_reseller_list(hub: Hub, args) -> int:
    table([[r["id"], r["name"], r["vat_id"], r["email"],
            (r["branding"] or {}).get("product_name", "")] for r in hub.registry.list_resellers()],
          ["id", "nome", "p.iva", "email", "marchio"])
    return 0


def cmd_customer_add(hub: Hub, args) -> int:
    c = hub.registry.add_customer(args.name, args.vat, args.email, args.reseller, args.notes)
    out(f"Cliente aggiunto: {c['name']}  id={c['id']}")
    out(f"Passo successivo: python -m docmap_hub instance add --customer {c['id']}")
    return 0


def cmd_customer_list(hub: Hub, args) -> int:
    table([[c["id"], c["name"], c["vat_id"], c["email"], c["reseller_name"]]
           for c in hub.registry.list_customers()], ["id", "nome", "p.iva", "email", "rivenditore"])
    return 0


def cmd_instance_add(hub: Hub, args) -> int:
    i = hub.registry.add_instance(args.customer, args.label, args.kind, args.id, args.notes)
    out(f"Installazione registrata: {i['label']}  id={i['id']}")
    out("Questo identificativo va nella configurazione del server del cliente (instance_id).")
    return 0


def cmd_instance_list(hub: Hub, args) -> int:
    table([[i["id"], i["customer_name"], i["label"], i["kind"], i["licence_expires_at"] or "nessuna"]
           for i in hub.registry.list_instances(args.customer)],
          ["id", "cliente", "nome", "tipo", "scadenza licenza"])
    return 0


def _parse_overrides(args) -> dict:
    kw: dict = {}
    limits = {}
    for k in L.LIMIT_KEYS:
        v = getattr(args, k, None)
        if v is not None:
            limits[k] = None if v < 0 else v
    if limits:
        kw["limits"] = limits
    if getattr(args, "months", None) is not None:
        kw["months"] = args.months
    if getattr(args, "expires", None):
        kw["expires_at"] = L.parse_time(args.expires if "T" in args.expires else args.expires + "T23:59:59Z")
    if getattr(args, "grace_days", None) is not None:
        kw["grace_days"] = args.grace_days
    kw["add_features"] = args.feature or []
    kw["remove_features"] = args.no_feature or []
    unknown = [f for f in kw["add_features"] if f not in L.KNOWN_FEATURES]
    if unknown:
        out(f"Attenzione: funzioni non standard: {', '.join(unknown)}")
    return kw


def _deliver(res: dict, args) -> None:
    lic = res["licence"]
    out(f"Licenza emessa: {lic['licence_id']}")
    out(f"Cliente: {lic['customer']['name']}  piano: {lic['plan']}  scadenza: {lic['expires_at']}")
    out(f"File: {res['path']}")
    if getattr(args, "out", None):
        Path(args.out).write_text(res["text"], "utf-8", newline="\n")
        out(f"Copia scritta in: {args.out}")
    out("Invia il file al cliente: va copiato nella cartella dati del server come 'licence.docmap-licence'.")


def cmd_licence_issue(hub: Hub, args) -> int:
    p = get_passphrase(args)
    res = hub.issue(p, args.instance, args.plan, **_parse_overrides(args))
    _deliver(res, args)
    return 0


def cmd_licence_renew(hub: Hub, args) -> int:
    p = get_passphrase(args)
    res = hub.renew(p, args.ref, months=args.months, plan=args.plan)
    _deliver(res, args)
    return 0


def cmd_licence_list(hub: Hub, args) -> int:
    rows = []
    for l in hub.registry.list_licences(args.instance):
        full = hub.registry.get_licence(l["id"])
        st = hub.status_of(full["file_text"])
        rows.append([l["id"][:8], l["customer_name"], l["instance_label"], l["plan"],
                     l["expires_at"], MODE_IT[st.mode], st.days_left, "sì" if l["supersedes"] else ""])
    table(rows, ["licenza", "cliente", "installazione", "piano", "scadenza", "stato", "giorni", "rinnovo"])
    return 0


def _read_licence_arg(hub: Hub, ref: str) -> str:
    p = Path(ref)
    if p.exists():
        return p.read_text("utf-8-sig")
    try:
        return hub.registry.get_licence(ref)["file_text"]
    except RegistryError:
        raise CliError(f"File o licenza non trovata: {ref}")


def _public_keys_for(hub: Hub, args) -> dict:
    if getattr(args, "public_keys", None):
        return L.load_public_keys_json(Path(args.public_keys).read_text("utf-8"))
    return hub.keys.public_keys()


def cmd_licence_show(hub: Hub, args) -> int:
    text = _read_licence_arg(hub, args.file)
    st = L.verify(text, _public_keys_for(hub, args), instance_id=args.instance_id)
    if args.json:
        out(json.dumps(st.to_dict(), indent=2, ensure_ascii=False))
    else:
        describe_status(st)
    return 0


def cmd_licence_verify(hub: Hub, args) -> int:
    text = _read_licence_arg(hub, args.file)
    st = L.verify(text, _public_keys_for(hub, args), instance_id=args.instance_id)
    if args.json:
        out(json.dumps(st.to_dict(), indent=2, ensure_ascii=False))
    else:
        describe_status(st)
    # exit code: 0 full, 1 grace, 2 read_only, 3 invalid
    return {L.MODE_FULL: 0, L.MODE_GRACE: 1, L.MODE_READ_ONLY: 2, L.MODE_INVALID: 3}[st.mode]


def cmd_log(hub: Hub, args) -> int:
    table([[e["at"], e["action"], e["entity"], e["entity_id"], e["details_json"]]
           for e in hub.registry.events(args.limit)], ["quando", "azione", "tipo", "id", "dettagli"])
    return 0


def cmd_backup(hub: Hub, args) -> int:
    path = hub.backup(args.out)
    out(f"Backup creato: {path}")
    out("Copialo su una chiavetta USB o un disco esterno e in un secondo luogo (es. cloud personale).")
    out("Le chiavi private nel backup restano cifrate: senza passphrase non servono a nessuno.")
    return 0


def cmd_web(hub: Hub, args) -> int:
    from .web import serve
    p = get_passphrase(args)
    return serve(hub, p, host="127.0.0.1", port=args.port, open_browser=not args.no_browser)


# ---------------------------------------------------------------------------
# v0.2: vault, environments, ports, deploy, status
# ---------------------------------------------------------------------------

VAULT_PROMPT = "Passphrase della cassaforte (di solito la stessa della chiave di firma): "


def vault_passphrase(args, confirm: bool = False) -> str:
    from .vault import vault_passphrase_from_env
    return vault_passphrase_from_env() or get_passphrase(args, confirm=confirm, prompt=VAULT_PROMPT)


def get_vault_key(hub: Hub, args):
    from .vault import Vault
    v = Vault(hub.registry)
    if not v.initialized:
        raise CliError("Cassaforte non ancora creata: esegui prima 'vault init'.")
    return v.unlock(vault_passphrase(args))


def confirm_yes(args, question: str) -> bool:
    if getattr(args, "yes", False):
        return True
    try:
        ans = input(question + " Scrivi 'si' per confermare: ")
    except EOFError:
        return False
    return ans.strip().lower() in ("si", "sì", "s", "yes", "y")


def _fields(args) -> dict:
    data: dict = {}
    if getattr(args, "json_file", None):
        data.update(json.loads(Path(args.json_file).read_text("utf-8-sig")))
    if getattr(args, "content_file", None):
        data["content"] = Path(args.content_file).read_text("utf-8-sig")
        data.setdefault("format", "php" if args.content_file.lower().endswith(".php") else "json")
    for f in getattr(args, "field", None) or []:
        if "=" not in f:
            raise CliError(f"Campo non valido: '{f}' (usa nome=valore; valore '?' = lo scrivo senza mostrarlo).")
        k, v = f.split("=", 1)
        if v == "?":
            v = getpass.getpass(f"{k}: ")
        data[k.strip()] = v
    return data


def cmd_vault_init(hub: Hub, args) -> int:
    from .vault import Vault
    p = vault_passphrase(args, confirm=True)
    Vault(hub.registry).init(p)
    out("Cassaforte creata. I segreti sono cifrati (AES-256-GCM) con una chiave ricavata dalla passphrase (scrypt).")
    if hub.keys.active_id and not hub.keys.check_passphrase(p):
        out("Nota: questa passphrase è DIVERSA da quella della chiave di firma: conservale entrambe. Per la pagina "
            "web imposta DOCMAP_HUB_VAULT_PASSPHRASE oppure sblocca la cassaforte dalla pagina.")
    return 0


def cmd_vault_status(hub: Hub, args) -> int:
    from .vault import Vault
    v = Vault(hub.registry)
    out(f"Cassaforte: {'creata' if v.initialized else 'non ancora creata (vault init)'}")
    out(f"Segreti custoditi: {len(v.list())}")
    for c in hub.registry.list_customers():
        out(f"  {c['name']}: custodia chiave (key escrow) {'ATTIVA' if c.get('key_escrow') else 'spenta'}")
    return 0


def cmd_vault_set(hub: Hub, args) -> int:
    from .vault import Vault
    env = hub.registry.get_environment(args.instance, args.env)
    data = _fields(args)
    vk = get_vault_key(hub, args)
    r = Vault(hub.registry).put(vk, env["id"], args.kind, data, args.label or "")
    out(f"Segreto salvato: {r['kind']}" + (f" ({r['label']})" if r["label"] else "")
        + f" per {env['name']} · campi: {', '.join(r['fields'])}")
    return 0


def cmd_vault_list(hub: Hub, args) -> int:
    from .vault import Vault
    iid = hub.registry.get_instance(args.instance)["id"] if args.instance else None
    table([[s["customer_name"], s["instance_label"], s["env_name"], s["kind"], s["label"], s["updated_at"]]
           for s in Vault(hub.registry).list(instance_id=iid)],
          ["cliente", "installazione", "ambiente", "tipo", "etichetta", "aggiornato"])
    return 0


def cmd_vault_reveal(hub: Hub, args) -> int:
    from .vault import Vault
    env = hub.registry.get_environment(args.instance, args.env)
    vk = get_vault_key(hub, args)  # always asks the passphrase again
    data = Vault(hub.registry).get(vk, env["id"], args.kind, args.label or "", reason=args.reason or "reveal (cli)")
    out(json.dumps(data, indent=2, ensure_ascii=False))
    return 0


def cmd_vault_delete(hub: Hub, args) -> int:
    from .vault import Vault
    env = hub.registry.get_environment(args.instance, args.env)
    if not confirm_yes(args, f"Elimino il segreto {args.kind} di {env['name']}?"):
        out("Annullato.")
        return 1
    ok = Vault(hub.registry).delete(env["id"], args.kind, args.label or "")
    out("Segreto eliminato." if ok else "Nessun segreto con questi dati.")
    return 0 if ok else 1


def cmd_vault_change_passphrase(hub: Hub, args) -> int:
    from .vault import Vault
    old = vault_passphrase(args)
    new = os.environ.get("DOCMAP_HUB_VAULT_NEW_PASSPHRASE") or getpass.getpass("Nuova passphrase della cassaforte: ")
    if not os.environ.get("DOCMAP_HUB_VAULT_NEW_PASSPHRASE") and getpass.getpass("Ripeti: ") != new:
        raise CliError("Le due passphrase non coincidono.")
    n = Vault(hub.registry).change_passphrase(old, new)
    out(f"Passphrase cambiata; {n} segreti cifrati di nuovo. Fai subito un backup.")
    return 0


def cmd_vault_export(hub: Hub, args) -> int:
    from .vault import Vault
    data = Vault(hub.registry).export_data()
    Path(args.out).write_text(json.dumps(data, indent=1), "utf-8", newline="\n")
    hub.registry.log("vault.export", details={"file": str(args.out), "secrets": len(data["secrets"])})
    out(f"Esportazione (ancora cifrata) scritta in {args.out}: {len(data['secrets'])} segreti.")
    return 0


def cmd_vault_import(hub: Hub, args) -> int:
    from .vault import Vault
    data = json.loads(Path(args.file).read_text("utf-8"))
    vk = get_vault_key(hub, args)
    ep = os.environ.get("DOCMAP_HUB_VAULT_IMPORT_PASSPHRASE") or getpass.getpass(
        "Passphrase della cassaforte da cui viene il file: ")
    r = Vault(hub.registry).import_data(vk, data, ep, overwrite=args.overwrite)
    out(f"Importati {r['imported']}, già presenti {r['skipped']}, senza ambiente {r['missing_env']}, "
        f"rifiutati per custodia spenta {r.get('refused_escrow', 0)}.")
    return 0


def cmd_customer_set(hub: Hub, args) -> int:
    from .vault import Vault
    if args.key_escrow is not None:
        on = args.key_escrow == "on"
        v = Vault(hub.registry)
        if not on:
            n = v.escrowed_count(args.customer)
            if n and not args.purge:
                raise CliError(f"La cassaforte contiene {n} configurazioni del database di questo cliente: "
                               "aggiungi --purge per eliminarle insieme allo spegnimento della custodia.")
            if n:
                v.purge_escrow(args.customer)
                out(f"Eliminate {n} configurazioni del database dalla cassaforte.")
        c = hub.registry.set_key_escrow(args.customer, on)
        out(f"{c['name']}: custodia della chiave {'ATTIVA' if on else 'spenta'}.")
        if on:
            out("Ricorda: serve il consenso scritto del cliente (nomina a responsabile del trattamento, GDPR art. 28).")
    return 0


def _env_rows(envs):
    return [[e["customer_name"], e["instance_label"], e["name"], e["kind"], e.get("port") or "",
             e["status"], e.get("app_version") or "", e.get("url") or e.get("api_url") or "",
             (e.get("expires_at") or "")[:10]] for e in envs]


def cmd_env_list(hub: Hub, args) -> int:
    table(_env_rows(hub.registry.list_environments(args.instance)),
          ["cliente", "installazione", "ambiente", "tipo", "porta", "stato", "versione", "indirizzo", "scade"])
    return 0


def cmd_env_add(hub: Hub, args) -> int:
    from .envs import EnvManager
    e = EnvManager(hub).add_remote(args.instance, args.name, args.kind, args.url, args.api_url, args.base_path,
                                   args.slug, args.domain, args.studio_name, args.notes, ca=args.ca)
    out(f"Ambiente registrato: {e['name']} ({e['kind']})  API: {e.get('api_url')}")
    if e["kind"] == "web-php":
        out("Passo successivo: credenziali FTP nella cassaforte, es.:")
        out(f"  vault set --instance \"{args.instance}\" --env {e['name']} --kind ftp --field host=ftp.esempio.it "
            "--field user=... --field password=? --field remote_path=/public_html/studio-de")
    return 0


def cmd_env_set(hub: Hub, args) -> int:
    e = hub.registry.get_environment(args.instance, args.name)
    s = dict(e.get("settings") or {})
    for k in ("base_path", "slug", "domain", "studio_name"):
        if getattr(args, k) is not None:
            s[k] = getattr(args, k)
    fields = {"settings": s}
    if args.url is not None:
        fields["url"] = args.url
    if args.api_url is not None:
        fields["api_url"] = args.api_url
    e = hub.registry.update_environment(e["id"], log_action="env.update", **fields)
    out(f"Ambiente aggiornato: {e['name']}  url={e.get('url')}  api={e.get('api_url')}  impostazioni={e['settings']}")
    return 0


def cmd_env_create_local(hub: Hub, args) -> int:
    from .envs import EnvManager
    vk = get_vault_key(hub, args)
    r = EnvManager(hub).create_local(args.instance, args.name, vk, args.studio_name or "", build_app=not args.no_app)
    e = r["env"]
    out(f"Ambiente locale creato: {e['name']} · porta riservata {e.get('port')} · cartella "
        f"{hub.dir / 'envs' / e['instance_id'] / e['name']}")
    out("Codici di accesso custoditi nella cassaforte: " + ", ".join(f"{t['user']} ({t['role']})" for t in r["tokens"]))
    if r.get("app") and r["app"].get("error"):
        out(f"Attenzione: web app non costruita ({r['app']['error']}); l'API funziona lo stesso.")
    out(f"Avvialo con: env start --instance \"{args.instance}\" --name {e['name']}")
    return 0


def cmd_env_start(hub: Hub, args) -> int:
    from .runner import LocalRunner
    e = hub.registry.get_environment(args.instance, args.name)
    r = LocalRunner(hub.dir, hub.registry).start(e)
    if r.get("already"):
        out(f"Già in esecuzione su http://127.0.0.1:{r['port']}/ (versione {r.get('app_version')}).")
    else:
        if r.get("moved_from"):
            out(f"La porta {r['moved_from']} era occupata da un altro programma: spostato sulla {r['port']}.")
        out(f"Avviato: http://127.0.0.1:{r['port']}/  (API {r['api_url']}, versione {r.get('app_version')})")
    return 0


def cmd_env_stop(hub: Hub, args) -> int:
    from .runner import LocalRunner
    e = hub.registry.get_environment(args.instance, args.name)
    r = LocalRunner(hub.dir, hub.registry).stop(e)
    out("Fermato." if r["stopped"] else "Non era in esecuzione.")
    return 0


def cmd_env_status(hub: Hub, args) -> int:
    from .runner import LocalRunner
    e = hub.registry.get_environment(args.instance, args.name)
    if e["kind"] != "local-python":
        from .runner import ping
        r = ping(e["api_url"], timeout=args.timeout) if e.get("api_url") else {"ok": False, "error": "manca api_url"}
        out(json.dumps(r, indent=2, ensure_ascii=False))
        return 0 if r.get("ok") else 1
    r = LocalRunner(hub.dir, hub.registry).status(e)
    out(f"Stato: {r['state']} · porta {r['port']} · pid {r['pid']} · versione {r.get('app_version')}")
    return 0 if r["state"] == "running" else 1


def cmd_env_clone(hub: Hub, args) -> int:
    from .envs import EnvManager
    vk = get_vault_key(hub, args)
    r = EnvManager(hub).clone_data(args.instance, args.src, args.dst, vk, dry_run=args.dry_run)
    rep = r["report"]
    out(f"Copia dati {r['from']} → {r['to']} ({'prova, nulla scritto' if args.dry_run else 'eseguita'}), "
        f"uscita {r['exit']}")
    res = (rep or {}).get("result", {}).get("a_to_b") if isinstance(rep, dict) else None
    if res:
        out(json.dumps(res, indent=1, ensure_ascii=False))
    return 0 if r["exit"] in (0, 1) else 2


def cmd_env_demo_create(hub: Hub, args) -> int:
    from .envs import EnvManager
    vk = get_vault_key(hub, args)
    src = None if (args.src or "").lower() in ("", "none", "nessuno") else args.src
    r = EnvManager(hub).demo_create(args.instance, args.days, vk, src, args.label)
    out(f"Demo creata: {r['env']['name']} · scade {r['expires_at'][:10]} · porta {r['env'].get('port')}")
    if r["clone"]:
        out(f"Dati copiati da {r['clone']['from']} (uscita {r['clone']['exit']}).")
    out("Alla scadenza 'env purge-expired' la ferma e sposta i suoi dati in _trash.")
    return 0


def cmd_env_purge(hub: Hub, args) -> int:
    from .envs import EnvManager
    r = EnvManager(hub).purge_expired()
    for x in r:
        out(f"Archiviato: {x['env']['name']} → {x['archived_to']}")
    if not r:
        out("Nessun ambiente scaduto.")
    return 0


def cmd_env_delete(hub: Hub, args) -> int:
    from .envs import EnvManager
    e = hub.registry.get_environment(args.instance, args.name)
    if e["name"] != "production" and not confirm_yes(
            args, f"Elimino l'ambiente {e['name']} ({e['kind']}): dati locali spostati in _trash, segreti eliminati."):
        out("Annullato.")
        return 1
    r = EnvManager(hub).delete(args.instance, args.name, production=args.production, confirm=args.confirm)
    out(f"Ambiente {r['env']['name']} eliminato dal registro."
        + (f" Dati archiviati in {r['archived_to']}." if r["archived_to"] else "")
        + (" Il sito remoto NON è stato toccato." if r["remote_untouched"] else ""))
    return 0


def cmd_ports_list(hub: Hub, args) -> int:
    from .ports import PortManager
    pm = PortManager(hub.registry)
    a, b = pm.range
    out(f"Intervallo: {a}-{b}")
    table([[r["port"], r["instance_label"], r["env_name"], r["status"], "libera" if r["free_now"] else "in uso",
            r["reserved_at"]] for r in pm.list()], ["porta", "installazione", "ambiente", "stato", "adesso", "riservata"])
    return 0


def cmd_ports_set_range(hub: Hub, args) -> int:
    from .ports import PortManager
    a, b = PortManager(hub.registry).set_range(args.start, args.end)
    out(f"Intervallo delle porte: {a}-{b}. Gli ambienti fuori intervallo si spostano al prossimo avvio.")
    return 0


def cmd_ports_check(hub: Hub, args) -> int:
    from .ports import PortManager, is_free
    owner = PortManager(hub.registry).owner(args.port)
    out(f"Porta {args.port}: {'libera' if is_free(args.port) else 'IN USO'}" +
        (f" · riservata a {owner}" if owner else ""))
    return 0


def _print_plan(r: dict) -> None:
    p = r.get("plan") or {}
    out(f"Ambiente {r['env']}: versione sul server {r.get('remote_version') or '?'} → da pubblicare {r['version']}")
    out(f"Da caricare ({len(p.get('upload', []))}):")
    for it in p.get("upload", [])[:40]:
        out(f"  + {it['path']}  [{it['why']}]")
    if len(p.get("upload", [])) > 40:
        out(f"  … e altri {len(p['upload']) - 40}")
    for it in p.get("protected", []):
        out(f"  = {it['path']}  PROTETTO: {it['why']}")
    if p.get("obsolete"):
        out(f"File sul server non più nel programma (NON cancellati): {len(p['obsolete'])}")
        for o in p["obsolete"][:10]:
            out(f"  ? {o}")


def _deploy_common(hub, args, fn, env_for_build: str):
    from .deploy import build_for
    vk = get_vault_key(hub, args)
    out("Costruisco il deploy con tools/build_deploy.py …")
    build = build_for(hub, hub.registry.get_environment(args.instance, env_for_build))
    try:
        kw = dict(insecure_ftp=args.insecure_ftp, overwrite_htaccess=args.overwrite_htaccess,
                  trust_host_key=args.trust_host_key, log=out, build=build)
        return _deploy_steps(hub, args, fn, vk, kw)
    finally:
        build.cleanup()


def _deploy_steps(hub, args, fn, vk, kw):
    dry = fn(hub, vk, args.instance, dry_run=True, **kw)
    _print_plan(dry)
    if args.dry_run:
        out("Prova (dry-run): nulla è stato modificato sul server.")
        return 0
    if not dry["plan"]["upload"]:
        out("Niente da caricare: il server è già aggiornato.")
        return 0
    if not confirm_yes(args, "Procedo con backup, caricamento e controllo?"):
        out("Annullato: nulla è stato modificato.")
        return 1
    r = fn(hub, vk, args.instance, dry_run=False, **kw)
    out(f"Backup del server prima del caricamento: {r.get('backup_dir')}")
    if r.get("config_php_untouched") is False:
        out("ATTENZIONE: config.php sul server risulta cambiato durante il deploy!")
    return 0


def cmd_deploy(hub: Hub, args) -> int:
    from .deploy import deploy

    def fn(h, vk, inst, **kw):
        return deploy(h, vk, inst, args.env, **kw)
    return _deploy_common(hub, args, fn, args.env)


def cmd_promote(hub: Hub, args) -> int:
    from .deploy import promote
    return _deploy_common(hub, args, promote, "production")


def cmd_status(hub: Hub, args) -> int:
    from .health import status_rows
    rows = status_rows(hub)
    if args.json:
        out(json.dumps(rows, indent=1, ensure_ascii=False))
        return 0
    table([[r["customer"], r["instance"], r["env"], r["kind"], r["status"],
            {True: "sì", False: "no", None: "?"}[r["reachable"]], r["app_version"] or "",
            (r["licence_expires_at"] or "nessuna")[:10] + (f" ({r['licence_days_left']} gg)"
                                                         if r["licence_days_left"] is not None else ""),
            (r["last_backup_at"] or "")[:16], (r["last_check"] or "")[:16]] for r in rows],
          ["cliente", "installazione", "ambiente", "tipo", "stato", "raggiungibile", "versione", "licenza",
           "ultimo backup", "ultimo controllo"])
    return 0


def cmd_check_all(hub: Hub, args) -> int:
    from .health import check_all
    from .vault import Vault
    vk = None
    if not args.no_secrets and Vault(hub.registry).initialized and (
            os.environ.get(ENV_PASSPHRASE) or os.environ.get("DOCMAP_HUB_VAULT_PASSPHRASE")
            or getattr(args, "passphrase_file", None)):
        vk = get_vault_key(hub, args)
    res = check_all(hub, vk, timeout=args.timeout)
    ok = sum(1 for r in res.values() if r.get("ok"))
    out(f"Controllati {len(res)} ambienti: {ok} rispondono.")
    return cmd_status(hub, argparse.Namespace(json=False))


def cmd_settings_show(hub: Hub, args) -> int:
    from .runner import RunnerError, server_python_dir, server_python_exe
    from .ports import PortManager
    for k, v in hub.registry.settings().items():
        out(f"{k} = {v}")
    try:
        d = server_python_dir(hub.registry)
        out(f"(server-python in uso: {d} · python: {server_python_exe(hub.registry, d)})")
    except RunnerError as exc:
        out(f"(server-python: {exc})")
    a, b = PortManager(hub.registry).range
    out(f"(porte: {a}-{b})")
    return 0


SETTING_KEYS = ("server_python_dir", "server_python_exe", "docmap_dir", "installer_dir", "ports.range")


def cmd_settings_set(hub: Hub, args) -> int:
    if args.key not in SETTING_KEYS:
        raise CliError(f"Impostazione sconosciuta: {args.key} (usa {', '.join(SETTING_KEYS)}).")
    if args.key == "ports.range":
        from .ports import parse_range
        parse_range(args.value)
    hub.registry.set_setting(args.key, None if args.value == "" else args.value)
    out(f"{args.key} = {args.value}")
    return 0


def cmd_server_check(hub: Hub, args) -> int:
    from .runner import check_server_python
    r = check_server_python(hub.registry)
    out(f"server-python: {r['server_python_dir']}")
    out(f"python:        {r['python']}")
    out("Pronto: fastapi, uvicorn e cryptography presenti." if r["ok"] else
        f"NON pronto: {r['error']}. Esegui una volta run_windows.bat nella cartella server-python "
        "(crea .venv con i pacchetti).")
    return 0 if r["ok"] else 1


# ---------------------------------------------------------------------------
# v0.3: cliente nuovo (onboarding in un passo)
# ---------------------------------------------------------------------------

def _cliente_req(args):
    from .onboarding import ClienteNuovo
    inst = {"sede": ("sede",), "online": ("online",), "entrambe": ("sede", "online")}[args.installazioni]
    ftp = None
    if args.ftp_host or args.ftp_protocollo == "local":
        pw = args.ftp_password
        if pw in (None, "", "?"):
            pw = os.environ.get("DOCMAP_HUB_FTP_PASSWORD") or (
                getpass.getpass("Password FTP (non si vede): ") if args.ftp_protocollo != "local" else "")
        ftp = {"protocol": args.ftp_protocollo, "host": args.ftp_host, "user": args.ftp_utente, "password": pw,
               "port": args.ftp_porta, "remote_path": args.ftp_cartella}
    return ClienteNuovo(nome=args.nome, piano=args.piano, piva=args.piva, email=args.email, rivenditore=args.rivenditore,
                        custodia_chiave=args.custodia_chiave == "on", installazioni=inst, nome_studio=args.nome_studio,
                        url_online=args.url_online, url_staging=args.url_staging, url_sede=args.url_sede, ftp=ftp,
                        ftp_cartella_staging=args.ftp_cartella_staging, note=args.note)


def cmd_cliente_nuovo(hub: Hub, args) -> int:
    from .onboarding import Onboarding, collect_secrets, write_scheda
    req = _cliente_req(args)
    req.validate(hub)
    vk = get_vault_key(hub, args) if req.ftp else None
    p = get_passphrase(args)
    r = Onboarding(hub, log=out).run(req, passphrase=p, vk=vk, rigenera=args.rigenera, build=not args.senza_pacchetti)
    out(f"Cliente: {req.nome}  ·  cartella: {r['dir']}")
    for x in r["created"]:
        out(f"  + {x}")
    for x in r["reused"]:
        out(f"  = {x} (già presente)")
    out("Codici di installazione (instance_id):")
    for role, iid in r["instances"].items():
        out(f"  {role:7s} {iid}")
    f = r["files"]
    out("File preparati:")
    for k in ("pacchetto_sede_zip", "sito_staging_zip", "sito_production_zip", "scheda", "sync_modello", "guida"):
        if f.get(k):
            out(f"  {k:20s} {f[k]}")
    if "online" in r["instances"]:
        users = "davide,admin" + ("\nponte-sync,editor" if "sede" in r["instances"] else "")
        out("Online, prossimi passi: hosting (cartella + SSL + FTP), poi")
        env = "staging" if "staging" in r["envs"]["online"] else "production"
        out(f"  python -m docmap_hub deploy --instance {r['instances']['online'][:8]} --env {env} --dry-run")
        out(f"  setup.php: persone e ruoli, per esempio:  {users.replace(chr(10), ' | ')}")
        if "sede" in r["instances"]:
            out(f"  token ponte-sync in cassaforte:  python -m docmap_hub cliente token-ponte --cliente \"{req.nome}\" --salva")
    if "sede" in r["instances"]:
        out("Sede: copia lo zip del pacchetto su chiavetta e lancia installa.bat sul PC del cliente.")
    out("Stampa la scheda cliente (nessun segreto dentro). Guida: GUIDA-NUOVO-CLIENTE.md")
    if args.con_segreti:
        vk2 = get_vault_key(hub, args)
        path = write_scheda(hub, r["customer_id"], collect_secrets(hub, vk2, r["customer_id"]))
        out(f"Scheda CON SEGRETI: {path}  (stampala ed elimina il file)")
    return 0


def cmd_cliente_scheda(hub: Hub, args) -> int:
    from .onboarding import collect_secrets, write_scheda
    secrets = None
    if args.con_segreti:
        secrets = collect_secrets(hub, get_vault_key(hub, args), args.cliente)
    path = write_scheda(hub, args.cliente, secrets)
    out(f"Scheda cliente: {path}" + ("  (CONTIENE SEGRETI: stampala ed elimina il file)" if secrets is not None else ""))
    return 0


def cmd_cliente_token_ponte(hub: Hub, args) -> int:
    from .onboarding import Onboarding
    ob = Onboarding(hub, log=out)
    vk = get_vault_key(hub, args)
    if args.salva:
        tok = os.environ.get("DOCMAP_HUB_BRIDGE_TOKEN") or getpass.getpass(
            "Token di ponte-sync mostrato da setup.php (non si vede): ")
        r = ob.save_bridge_token(vk, args.cliente, tok)
        out(f"Token del ponte salvato in cassaforte ({r['kind']} · {r['label']}).")
    if args.esporta:
        path = ob.export_bridge_token(vk, args.cliente, Path(args.esporta))
        out(f"Token scritto in {path}: portalo sul PC della sede (configura-sync.ps1 -TokenFile …) e poi eliminalo.")
    if not (args.salva or args.esporta):
        raise CliError("Usa --salva (mette il token in cassaforte) e/o --esporta FILE (lo scrive per la chiavetta).")
    return 0


def cmd_cliente_elenco(hub: Hub, args) -> int:
    from .onboarding import Onboarding
    ob = Onboarding(hub, log=out)
    rows = []
    for c in hub.registry.list_customers():
        roles = [r for r in ("sede", "online") if ob.find_instance(c["id"], r)]
        exp = [i["licence_expires_at"][:10] for i in hub.registry.list_instances(c["id"]) if i["licence_expires_at"]]
        d = hub.dir / "clienti"
        folder = next((f.parent.name for f in d.glob("*/cliente.json")
                       if json.loads(f.read_text("utf-8")).get("customer_id") == c["id"]), "") if d.exists() else ""
        rows.append([c["name"], c["vat_id"], "+".join(roles) or "(a mano)", min(exp) if exp else "", folder])
    table(rows, ["cliente", "p.iva", "installazioni", "prima scadenza", "cartella clienti/"])
    return 0


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="python -m docmap_hub",
                                 description="DocMap Hub: licenze, ambienti (produzione/staging/demo), cassaforte, porte e deploy.")
    ap.add_argument("--version", action="version", version=f"DocMap Hub {__version__}")
    ap.add_argument("--dir", help="cartella dati dell'hub (predefinita: %%APPDATA%%\\DocMapHub "
                                  "o ~/.docmap-hub, oppure variabile DOCMAP_HUB_DIR)")
    ap.add_argument("--passphrase-file", help="legge la passphrase da un file (solo per automazioni)")
    sub = ap.add_subparsers(dest="cmd", metavar="comando")

    def add(name, fn, help_, parent=sub):
        p = parent.add_parser(name, help=help_, description=help_)
        p.set_defaults(fn=fn, help_parser=p)
        return p

    add("init", cmd_init, "crea la cartella dati e il registro")
    p = add("keygen", cmd_keygen, "crea la chiave di firma Ed25519 (protetta da passphrase)")
    p.add_argument("--rotate", action="store_true", help="sostituisce la chiave attiva (la vecchia resta per la verifica)")
    p = add("keys", None, "chiavi di firma")
    ks = p.add_subparsers(dest="sub", metavar="azione")
    add("list", cmd_keys_list, "elenca le chiavi", ks)
    p = add("export-public-key", cmd_export_public_key, "esporta la chiave pubblica per i server")
    p.add_argument("--format", choices=["json", "base64", "pem"], default="json",
                   help="json = tutte le chiavi (consigliato per il server); base64/pem = una sola chiave")
    p.add_argument("--key-id", help="chiave da esportare (predefinita: quella attiva)")
    p.add_argument("--out", help="file di destinazione")
    add("plans", cmd_plans, "mostra i piani e i loro valori predefiniti")

    p = add("reseller", None, "rivenditori")
    rs = p.add_subparsers(dest="sub", metavar="azione")
    q = add("add", cmd_reseller_add, "aggiunge un rivenditore", rs)
    q.add_argument("--name", required=True)
    q.add_argument("--vat", help="partita IVA")
    q.add_argument("--email")
    q.add_argument("--product-name", help="nome commerciale del prodotto rivenduto (marchio)")
    q.add_argument("--logo-url")
    q.add_argument("--primary-color", help="es. #0a5c8a")
    q.add_argument("--support-email")
    q.add_argument("--notes")
    add("list", cmd_reseller_list, "elenca i rivenditori", rs)

    p = add("customer", None, "clienti (studi)")
    cs = p.add_subparsers(dest="sub", metavar="azione")
    q = add("add", cmd_customer_add, "aggiunge un cliente", cs)
    q.add_argument("--name", required=True)
    q.add_argument("--vat", help="partita IVA")
    q.add_argument("--email")
    q.add_argument("--reseller", help="id o nome del rivenditore che ha venduto la licenza")
    q.add_argument("--notes")
    add("list", cmd_customer_list, "elenca i clienti", cs)

    p = add("instance", None, "installazioni (un server per cliente)")
    ins = p.add_subparsers(dest="sub", metavar="azione")
    q = add("add", cmd_instance_add, "registra un'installazione", ins)
    q.add_argument("--customer", required=True, help="id o nome del cliente")
    q.add_argument("--label", help="nome descrittivo (es. 'PC archivio sede Milano')")
    q.add_argument("--kind", default="onprem", choices=["onprem", "cloud", "appliance"])
    q.add_argument("--id", help="instance_id già generato dal server (altrimenti ne crea uno)")
    q.add_argument("--notes")
    q = add("list", cmd_instance_list, "elenca le installazioni", ins)
    q.add_argument("--customer")

    p = add("licence", None, "licenze")
    ls = p.add_subparsers(dest="sub", metavar="azione")
    q = add("issue", cmd_licence_issue, "emette una licenza firmata", ls)
    q.add_argument("--instance", required=True, help="id (o prefisso) o nome dell'installazione")
    q.add_argument("--plan", required=True)
    q.add_argument("--months", type=int, help="durata in mesi (predefinita dal piano)")
    q.add_argument("--expires", help="scadenza esplicita, AAAA-MM-GG o ISO UTC")
    q.add_argument("--grace-days", type=int)
    for k in L.LIMIT_KEYS:
        q.add_argument(f"--{k}", type=int, help=f"limite {k} (-1 = illimitato)")
    q.add_argument("--feature", action="append", help="aggiunge una funzione (ripetibile)")
    q.add_argument("--no-feature", action="append", help="toglie una funzione del piano (ripetibile)")
    q.add_argument("--out", help="copia del file di licenza in questo percorso")
    q = add("renew", cmd_licence_renew, "rinnova una licenza (nuovo file, stessa installazione)", ls)
    q.add_argument("ref", help="id della licenza o dell'installazione")
    q.add_argument("--months", type=int)
    q.add_argument("--plan", help="cambia piano al rinnovo")
    q.add_argument("--out")
    q = add("list", cmd_licence_list, "elenca le licenze emesse", ls)
    q.add_argument("--instance")
    for name, fn, h in (("show", cmd_licence_show, "mostra il contenuto e lo stato di un file di licenza"),
                        ("verify", cmd_licence_verify, "verifica un file di licenza (codice di uscita 0/1/2/3)")):
        q = add(name, fn, h, ls)
        q.add_argument("file", help="file .docmap-licence (o id di una licenza del registro)")
        q.add_argument("--instance-id", help="controlla che sia intestata a questa installazione")
        q.add_argument("--public-keys", help="file JSON delle chiavi pubbliche (predefinito: quelle dell'hub)")
        q.add_argument("--json", action="store_true")

    q = add("log", cmd_log, "registro delle operazioni dell'hub")
    q.add_argument("--limit", type=int, default=50)
    q = add("backup", cmd_backup, "crea un archivio .zip con chiavi, registro e licenze emesse")
    q.add_argument("--out", help="percorso del file .zip (predefinito: <cartella dati>/backups/)")
    q = add("web", cmd_web, "pagina di amministrazione locale (solo 127.0.0.1)")
    q.add_argument("--port", type=int, default=8765)
    q.add_argument("--no-browser", action="store_true")

    # -- v0.2 ------------------------------------------------------------
    p = sub.choices["customer"]
    cs = [a for a in p._actions if isinstance(a, argparse._SubParsersAction)][0]
    q = add("set", cmd_customer_set, "modifica un cliente (custodia della chiave)", cs)
    q.add_argument("--customer", required=True)
    q.add_argument("--key-escrow", choices=["on", "off"],
                   help="on = l'hub può custodire config/aes_key (serve il consenso del cliente)")
    q.add_argument("--purge", action="store_true", help="con --key-escrow off: elimina le configurazioni custodite")

    def env_ref(q, name_opt="--name"):
        q.add_argument("--instance", required=True, help="id (o prefisso) o nome dell'installazione")
        q.add_argument(name_opt, required=True, dest="name" if name_opt == "--name" else name_opt.strip("-"),
                       help="production, staging o demo-…")

    p = add("vault", None, "cassaforte delle credenziali (cifrata)")
    vs = p.add_subparsers(dest="sub", metavar="azione")
    add("init", cmd_vault_init, "crea la cassaforte", vs)
    add("status", cmd_vault_status, "stato della cassaforte e della custodia chiavi", vs)
    q = add("set", cmd_vault_set, "salva o sostituisce un segreto", vs)
    q.add_argument("--instance", required=True)
    q.add_argument("--env", required=True)
    q.add_argument("--kind", required=True, choices=["db_config", "admin_token", "superadmin", "ftp", "basic_auth", "note"])
    q.add_argument("--label", default="")
    q.add_argument("--field", action="append", help="nome=valore (ripetibile); valore ? = digitato senza mostrarlo")
    q.add_argument("--json-file", help="campi da un file JSON")
    q.add_argument("--content-file", help="db_config: file config.json / config.php")
    q = add("list", cmd_vault_list, "elenca i segreti (senza mostrarli)", vs)
    q.add_argument("--instance")
    q = add("reveal", cmd_vault_reveal, "mostra un segreto (chiede la passphrase, resta nel registro)", vs)
    q.add_argument("--instance", required=True)
    q.add_argument("--env", required=True)
    q.add_argument("--kind", required=True)
    q.add_argument("--label", default="")
    q.add_argument("--reason", help="motivo (scritto nel registro delle operazioni)")
    q = add("delete", cmd_vault_delete, "elimina un segreto", vs)
    q.add_argument("--instance", required=True)
    q.add_argument("--env", required=True)
    q.add_argument("--kind", required=True)
    q.add_argument("--label", default="")
    q.add_argument("--yes", action="store_true")
    add("change-passphrase", cmd_vault_change_passphrase, "cambia la passphrase della cassaforte", vs)
    q = add("export", cmd_vault_export, "esporta la cassaforte (resta cifrata)", vs)
    q.add_argument("--out", required=True)
    q = add("import", cmd_vault_import, "importa un'esportazione (anche da un altro hub)", vs)
    q.add_argument("file")
    q.add_argument("--overwrite", action="store_true")

    p = add("env", None, "ambienti delle installazioni: production, staging, demo-…")
    es = p.add_subparsers(dest="sub", metavar="azione")
    q = add("list", cmd_env_list, "elenca gli ambienti", es)
    q.add_argument("--instance")
    q = add("add", cmd_env_add, "registra un ambiente remoto (web-php o studio-python)", es)
    env_ref(q)
    q.add_argument("--kind", required=True, choices=["web-php", "studio-python"])
    q.add_argument("--url", required=True, help="indirizzo dell'app, es. https://docmap.pr-it.it/studio-de/")
    q.add_argument("--api-url", help="predefinito: <url>server-php/api.php")
    q.add_argument("--base-path")
    q.add_argument("--slug")
    q.add_argument("--domain")
    q.add_argument("--studio-name")
    q.add_argument("--notes")
    q.add_argument("--ca", help="studio-python: certificato della CA dello studio (DocMap-CA-studio.crt)")
    q = add("set", cmd_env_set, "modifica indirizzi e impostazioni di deploy di un ambiente", es)
    env_ref(q)
    for k in ("--url", "--api-url", "--base-path", "--slug", "--domain", "--studio-name"):
        q.add_argument(k)
    q = add("create-local", cmd_env_create_local, "crea un ambiente local-python sul PC del hub", es)
    env_ref(q)
    q.add_argument("--studio-name")
    q.add_argument("--no-app", action="store_true", help="non costruire la web app (solo API)")
    for name, fn, h in (("start", cmd_env_start, "avvia un ambiente locale"),
                        ("stop", cmd_env_stop, "ferma un ambiente locale"),
                        ("status", cmd_env_status, "stato di un ambiente")):
        q = add(name, fn, h, es)
        env_ref(q)
        if name == "status":
            q.add_argument("--timeout", type=float, default=5.0)
    q = add("clone-data", cmd_env_clone, "copia i dati da un ambiente a uno locale (una direzione)", es)
    q.add_argument("--instance", required=True)
    q.add_argument("--from", dest="src", required=True)
    q.add_argument("--to", dest="dst", required=True)
    q.add_argument("--dry-run", action="store_true")
    q = add("demo", None, "ambienti demo temporanei", es)
    ds = q.add_subparsers(dest="sub2", metavar="azione")
    q = add("create", cmd_env_demo_create, "crea una demo con i dati di un ambiente, a scadenza", ds)
    q.add_argument("--instance", required=True)
    q.add_argument("--days", type=int, default=7)
    q.add_argument("--from", dest="src", default="production", help="ambiente da copiare ('none' = demo vuota)")
    q.add_argument("--label", help="nome dopo demo- (predefinito: data + codice)")
    add("purge-expired", cmd_env_purge, "ferma gli ambienti scaduti e sposta i dati in _trash", es)
    q = add("delete", cmd_env_delete, "elimina un ambiente (dati locali in _trash; il sito remoto non si tocca)", es)
    env_ref(q)
    q.add_argument("--yes", action="store_true")
    q.add_argument("--production", action="store_true")
    q.add_argument("--confirm", help="per production: il nome esatto dell'installazione")

    p = add("ports", None, "porte degli ambienti locali")
    ps = p.add_subparsers(dest="sub", metavar="azione")
    add("list", cmd_ports_list, "porte riservate e se sono libere adesso", ps)
    q = add("set-range", cmd_ports_set_range, "cambia l'intervallo (predefinito 18400-18999)", ps)
    q.add_argument("start", type=int)
    q.add_argument("end", type=int)
    q = add("check", cmd_ports_check, "dice se una porta è libera", ps)
    q.add_argument("port", type=int)

    for name, fn, h in (("deploy", cmd_deploy, "pubblica la web app su un ambiente web-php (FTPS/SFTP)"),
                        ("promote", cmd_promote, "pubblica in production la versione verificata su staging")):
        q = add(name, fn, h)
        q.add_argument("--instance", required=True)
        if name == "deploy":
            q.add_argument("--env", required=True)
        q.add_argument("--dry-run", action="store_true", help="mostra solo cosa cambierebbe")
        q.add_argument("--yes", action="store_true", help="non chiede conferma dopo il piano")
        q.add_argument("--insecure-ftp", action="store_true", help="consente FTP senza cifratura (sconsigliato)")
        q.add_argument("--overwrite-htaccess", action="store_true",
                       help="sostituisce anche i .htaccess modificati a mano sul server")
        q.add_argument("--trust-host-key", action="store_true", help="SFTP: memorizza la chiave di un server nuovo")

    q = add("status", cmd_status, "stato di tutte le installazioni e i loro ambienti")
    q.add_argument("--json", action="store_true")
    q = add("check-all", cmd_check_all, "controlla adesso tutti gli ambienti (ping con timeout)")
    q.add_argument("--timeout", type=float, default=5.0)
    q.add_argument("--no-secrets", action="store_true", help="non usa le password delle cartelle protette")

    p = add("settings", None, "impostazioni del hub")
    ss = p.add_subparsers(dest="sub", metavar="azione")
    add("show", cmd_settings_show, "mostra le impostazioni", ss)
    q = add("set", cmd_settings_set, "imposta un valore (vuoto = predefinito)", ss)
    q.add_argument("key", help=", ".join(SETTING_KEYS))
    q.add_argument("value")
    add("server-check", cmd_server_check, "controlla che server-python sia pronto per gli ambienti locali")

    # -- v0.3 ------------------------------------------------------------
    p = add("cliente", None, "nuovo cliente in un passo: registro, licenze, pacchetti, scheda")
    cl = p.add_subparsers(dest="sub", metavar="azione")
    q = add("nuovo", cmd_cliente_nuovo, "crea (o completa) un cliente con le sue installazioni sede / online", cl)
    q.add_argument("--nome", required=True, help="nome del cliente (es. 'Studio Rossi')")
    q.add_argument("--piva", help="partita IVA (serve a ritrovarlo alla seconda esecuzione)")
    q.add_argument("--email")
    q.add_argument("--piano", required=True, help="piano della licenza (vedi 'plans')")
    q.add_argument("--rivenditore", help="id o nome del rivenditore (facoltativo)")
    q.add_argument("--custodia-chiave", choices=["on", "off"], default="off",
                   help="on = l'hub può custodire la chiave del database (serve il consenso scritto del cliente)")
    q.add_argument("--installazioni", choices=["sede", "online", "entrambe"], default="sede",
                   help="sede = PC del cliente; online = sito web; entrambe = tutte e due con la sincronizzazione")
    q.add_argument("--nome-studio", help="nome mostrato nell'app (predefinito: il nome del cliente)")
    q.add_argument("--url-online", help="indirizzo del sito, es. https://docmap.pr-it.it/studio-rossi/ o https://archivio.studiorossi.it/")
    q.add_argument("--url-staging", help="indirizzo di prova (staging), es. https://docmap.pr-it.it/studio-rossi-prova/")
    q.add_argument("--url-sede", help="indirizzo in rete locale, se già noto (es. https://192.168.1.10:8443/)")
    q.add_argument("--ftp-protocollo", choices=["ftps", "sftp", "ftp", "local"], default="ftps")
    q.add_argument("--ftp-host")
    q.add_argument("--ftp-utente")
    q.add_argument("--ftp-password", help="'?' o vuoto = chiesta senza mostrarla (oppure DOCMAP_HUB_FTP_PASSWORD)")
    q.add_argument("--ftp-porta", type=int)
    q.add_argument("--ftp-cartella", help="cartella del sito sul server FTP, es. /public_html/studio-rossi")
    q.add_argument("--ftp-cartella-staging", help="cartella dello staging, es. /public_html/studio-rossi-prova")
    q.add_argument("--note")
    q.add_argument("--rigenera", action="store_true", help="rifà pacchetti e siti (i vecchi vanno in _trash)")
    q.add_argument("--senza-pacchetti", action="store_true", help="solo registro, licenze e scheda (niente pacchetti)")
    q.add_argument("--con-segreti", action="store_true",
                   help="scrive ANCHE una scheda con i codici della cassaforte (chiede la passphrase)")
    q = add("scheda", cmd_cliente_scheda, "rifà la scheda cliente stampabile", cl)
    q.add_argument("--cliente", required=True)
    q.add_argument("--con-segreti", action="store_true", help="copia con i codici (chiede la passphrase della cassaforte)")
    q = add("token-ponte", cmd_cliente_token_ponte, "token del ponte web-sede (ponte-sync): in cassaforte e/o su file", cl)
    q.add_argument("--cliente", required=True)
    q.add_argument("--salva", action="store_true", help="chiede il token mostrato da setup.php e lo salva in cassaforte")
    q.add_argument("--esporta", help="scrive il token in questo file (es. E:\\token-ponte.txt) per configura-sync.ps1")
    add("elenco", cmd_cliente_elenco, "clienti, installazioni e cartelle preparate", cl)
    return ap


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")
        except (AttributeError, ValueError):
            pass
    ap = build_parser()
    args = ap.parse_args(argv)
    if not getattr(args, "fn", None):
        # no command, or a group (e.g. 'customer') without its action
        getattr(args, "help_parser", ap).print_help()
        return 2
    try:
        with Hub(args.dir) as hub:
            return int(args.fn(hub, args) or 0)
    except (CliError, KeyError_, RegistryError, L.LicenceError, OSError, ValueError) as exc:
        print(f"Errore: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nInterrotto.", file=sys.stderr)
        return 130
