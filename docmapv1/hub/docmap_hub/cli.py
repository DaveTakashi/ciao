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


def get_passphrase(args, confirm: bool = False) -> str:
    if getattr(args, "passphrase_file", None):
        return Path(args.passphrase_file).read_text("utf-8").strip("\r\n")
    env = os.environ.get(ENV_PASSPHRASE)
    if env:
        return env
    p = getpass.getpass("Passphrase della chiave di firma: ")
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
# Parser
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="python -m docmap_hub",
                                 description="DocMap Hub: emissione e registro delle licenze DocMap.")
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
    except (CliError, KeyError_, RegistryError, L.LicenceError) as exc:
        print(f"Errore: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nInterrotto.", file=sys.stderr)
        return 130
