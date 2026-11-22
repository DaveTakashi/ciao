"""Pipeline 1 — "Crea progetto con AI" (v0.5).

AI-agnostic by design: the hub never calls an AI. It gives the owner one long prompt (context + rules +
the complete JSON template + a filled example) to paste into any chatbot or agent; the owner talks to it,
pastes the JSON it returns back into the hub, reviews the generated draft section by section, types the
secrets himself, and confirms. Confirming runs the same idempotent onboarding as ``cliente nuovo`` and then
applies what onboarding does not know (customer details, project name, workstations, initial users and
archives as the project's plan).

Secrets never travel through the AI: the template carries placeholders like ``{{PASSWORD_FTP}}``. A real-
looking password pasted in the JSON is accepted but flagged (and never stored in the draft).
"""

from __future__ import annotations

import copy
import json
import re

from . import __version__
from .registry import RegistryError

FORMAT = "docmap-progetto/1"
PLACEHOLDER_RE = re.compile(r"^\{\{[A-Z0-9_ ]+\}\}$")
SECRET_PATHS = (("online", "ftp", "password"), ("online", "ftp_staging", "password"))
PLACEHOLDERS = {"ftp": "{{PASSWORD_FTP}}", "ftp_staging": "{{PASSWORD_FTP_STAGING}}"}
FTP_MODES = ("dominio", "cliente", "nessuno")   # v0.10: default hosting / own FTP / manual upload

TEMPLATE: dict = {
    "formato": FORMAT,
    "cliente": {
        "ragione_sociale": "",
        "partita_iva": "",
        "email": "",
        "pec": "",
        "referente": "",
        "telefono": "",
        "indirizzo": "",
        "citta": "",
        "provincia": "",
        "codice_sdi": "",
        "codice_multi": "",
        "stato": "active",
        "etichette": [],
        "colore": "",
        "rivenditore": "",
        "note": "",
    },
    "progetto": {
        "nome": "",
        "nome_studio": "",
        "installazioni": ["sede", "online"],
        "custodia_chiave": False,
        "modello": "",
        "note": "",
    },
    "licenza": {
        "piano": "studio",
        "mesi": None,
        "limiti": {"utenti": None, "faldoni": None, "archivi": None},
    },
    "online": {
        "indirizzo": "",
        "staging": "",
        "ftp": {
            "modo": "",
            "protocollo": "ftps",
            "host": "",
            "porta": None,
            "utente": "",
            "password": "{{PASSWORD_FTP}}",
            "cartella": "",
            "cartella_staging": "",
        },
        "ftp_staging": {
            "protocollo": "ftps",
            "host": "",
            "porta": None,
            "utente": "",
            "password": "{{PASSWORD_FTP_STAGING}}",
        },
    },
    "sede": {
        "indirizzo": "",
        "pc_server": "",
    },
    "postazioni": [
        {"nome": "", "etichetta": ""},
    ],
    "utenti_iniziali": [
        {"nome": "", "email": "", "ruolo": "admin"},
    ],
    "archivi": [
        {"nome": "Archivio 1", "note": ""},
    ],
    "domande_aperte": [],
}

EXAMPLE: dict = {
    "formato": FORMAT,
    "cliente": {
        "ragione_sociale": "Studio Rossi & Associati",
        "partita_iva": "01234567890",
        "email": "segreteria@studiorossi.it",
        "pec": "studiorossi@pec.it",
        "referente": "Dott.ssa Anna Rossi",
        "telefono": "+39 0521 000000",
        "indirizzo": "Via Roma 1",
        "citta": "Parma",
        "provincia": "PR",
        "codice_sdi": "M5UXCR1",
        "codice_multi": "",
        "stato": "active",
        "etichette": ["commercialista", "pilota"],
        "colore": "#2f5bea",
        "rivenditore": "",
        "note": "Due sedi, archivio cartaceo di 1.800 faldoni. Vuole partire a gennaio.",
    },
    "progetto": {
        "nome": "DocMap Studio Rossi",
        "nome_studio": "Studio Rossi",
        "installazioni": ["sede", "online"],
        "custodia_chiave": False,
        "note": "Server sul PC della segreteria, sito su docmap.pr-it.it.",
    },
    "licenza": {"piano": "studio_pro", "mesi": 12, "limiti": {"utenti": 8, "faldoni": None, "archivi": None}},
    "online": {
        "indirizzo": "https://docmap.pr-it.it/studio-rossi/",
        "staging": "https://docmap.pr-it.it/studio-rossi-prova/",
        "ftp": {
            "protocollo": "ftps",
            "host": "ftp.esempio.it",
            "porta": None,
            "utente": "docmap@pr-it.it",
            "password": "{{PASSWORD_FTP}}",
            "cartella": "/studio-rossi/",
            "cartella_staging": "/studio-rossi-prova/",
        },
    },
    "sede": {"indirizzo": "", "pc_server": "PC Segreteria"},
    "postazioni": [{"nome": "PC Luigi", "etichetta": "Sala studio"}, {"nome": "PC Reception", "etichetta": "Ingresso"}],
    "utenti_iniziali": [
        {"nome": "Anna Rossi", "email": "anna@studiorossi.it", "ruolo": "admin"},
        {"nome": "Luigi Bianchi", "email": "", "ruolo": "editor"},
    ],
    "archivi": [{"nome": "Archivio corrente", "note": "Uffici piano terra"},
                {"nome": "Archivio storico", "note": "Cantina, scaffali 1-12"}],
    "domande_aperte": ["Confermare l'indirizzo IP fisso del PC della segreteria."],
}

ROLES = ("admin", "editor", "viewer")


# ---------------------------------------------------------------------------
# the prompt
# ---------------------------------------------------------------------------

def build_prompt(hub) -> str:
    plans = "\n".join(f"  - `{k}`: {v.get('label', k)} — durata {v.get('duration_months', 12)} mesi, limiti "
                      f"{_limits_txt(v.get('limits') or {})}" for k, v in hub.plans.items())
    resellers = ", ".join(r["name"] for r in hub.registry.list_resellers()) or "nessuno (vendita diretta)"
    return f"""Sei l'assistente di Dave per preparare un nuovo progetto DocMap (codice DM26) da caricare nel suo DocMap Hub (versione {__version__}).

## Cos'è DocMap
DocMap è un sistema "phygital" per archivi cartacei di commercialisti, professionisti, enti e aziende di archiviazione conto terzi: ogni faldone ha un'etichetta con QR (dominio qr7.it), una posizione sugli scaffali e uno storico (prestiti, rientri). Si installa in due modi, anche insieme:
- **sede**: un PC dello studio fa da server (programma Python, database cifrato, backup cifrati); gli altri PC e i telefoni dello studio si collegano in rete locale. Ogni PC aggiuntivo è una **postazione** con un nome (es. "PC Luigi").
- **online**: un sito web (PHP) su un hosting, es. https://docmap.pr-it.it/<nome-studio>/, caricato via FTP/FTPS/SFTP. Può avere uno **staging** (sito di prova) con indirizzo e cartella diversi.
Con sede + online i dati si sincronizzano da soli ogni 10 minuti.

## Il tuo compito
1. Fammi le domande che servono, **poche alla volta**, in italiano semplice, per compilare il JSON qui sotto. Se ti ho già dato documenti o hai accesso ai miei file, usali e chiedimi solo quello che manca.
2. Non inventare dati: se una cosa non la sai, lascia "" (o null) e aggiungi una domanda in `domande_aperte`.
3. **Mai password, chiavi o token reali nel JSON.** Per la password FTP lascia esattamente `{{{{PASSWORD_FTP}}}}`: la scrivo io nell'hub.
4. Alla fine restituisci **un solo blocco di codice JSON valido** (niente commenti, niente testo dentro il blocco), con TUTTE le chiavi del modello, pronto da copiare e incollare.

## Regole dei campi
- `formato`: lascia "{FORMAT}".
- `cliente.ragione_sociale`: obbligatoria. `partita_iva`: 11 cifre (o codice fiscale), senza "IT". `stato`: "active" (cliente) o "prospect" (trattativa). `colore`: "#RRGGBB" o "". `etichette`: parole brevi. `rivenditore`: uno tra: {resellers}; altrimenti "".
- `progetto.nome`: es. "DocMap <nome breve>". `nome_studio`: come appare nell'app e sulle etichette. `installazioni`: ["sede"], ["online"] oppure ["sede", "online"]. `custodia_chiave`: true solo se il cliente ha firmato il consenso a farmi conservare la sua chiave (di solito false).
- `licenza.piano`: uno di questi:
{plans}
  `mesi`: null = durata del piano. `limiti`: null = quelli del piano; -1 = illimitato.
- `online` (solo se c'è "online"): `indirizzo` e `staging` completi in https e diversi tra loro, finiscono con "/". `ftp.protocollo`: "ftps" (consigliato), "sftp" o "ftp". `ftp.cartella`: la cartella sul server FTP che corrisponde all'indirizzo (es. "/studio-rossi/"); `cartella_staging` diversa. Se non c'è online lascia tutto "".
- `sede` (solo se c'è "sede"): `indirizzo` = indirizzo del server in rete locale se già noto (es. "https://192.168.1.20:8443/"), altrimenti "". `pc_server`: quale PC fa da server.
- `postazioni`: gli altri PC dello studio, ciascuno con `nome` univoco ed `etichetta` facoltativa (stanza, uso). Lista vuota se nessuno.
- `utenti_iniziali`: chi userà DocMap; `ruolo` = "admin", "editor" o "viewer". Almeno un admin.
- `archivi`: gli archivi fisici da creare (nome + note su dove sono).
- `domande_aperte`: cose da verificare prima di installare.

## Modello completo (da compilare)
```json
{json.dumps(TEMPLATE, ensure_ascii=False, indent=2)}
```

## Esempio compilato (solo per capire, non copiarne i dati)
```json
{json.dumps(EXAMPLE, ensure_ascii=False, indent=2)}
```

Inizia ora: salutami in una riga e fammi la prima domanda.
"""


def _limits_txt(lim: dict) -> str:
    names = {"users": "utenti", "binders": "faldoni", "archives": "archivi"}
    return ", ".join(f"{names.get(k, k)} {'illimitati' if v is None else v}" for k, v in lim.items()) or "nessuno"


# ---------------------------------------------------------------------------
# parse + validate
# ---------------------------------------------------------------------------

def extract_json(text: str) -> dict:
    """The pasted text may be the bare JSON, a ```json block, or a whole chat answer around it."""
    t = (text or "").strip()
    if not t:
        raise RegistryError("Incolla il JSON preparato dall'AI.")
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", t, re.S)
    if m:
        t = m.group(1)
    else:
        a, b = t.find("{"), t.rfind("}")
        if a < 0 or b <= a:
            raise RegistryError("Non trovo un JSON nel testo incollato (deve iniziare con { e finire con }).")
        t = t[a:b + 1]
    t = t.replace("“", '"').replace("”", '"')          # curly quotes from some chat apps
    try:
        data = json.loads(t)
    except json.JSONDecodeError as exc:
        raise RegistryError(f"JSON non valido alla riga {exc.lineno}, colonna {exc.colno}: {exc.msg}. "
                            "Chiedi all'AI di restituirlo di nuovo in un solo blocco di codice.") from None
    if not isinstance(data, dict):
        raise RegistryError("Il JSON deve essere un oggetto { … }.")
    return data


def _merge(template, data):
    """Template shape with the pasted values: missing keys get defaults, unknown keys are dropped."""
    if isinstance(template, dict):
        src = data if isinstance(data, dict) else {}
        return {k: _merge(v, src.get(k)) for k, v in template.items()}
    if isinstance(template, list):
        if not isinstance(data, list):
            return []
        if template and isinstance(template[0], dict):
            return [_merge(template[0], x) for x in data if isinstance(x, dict)]
        return [x for x in data if isinstance(x, (str, int, float))]
    if data is None:
        return None if template is None else template if not isinstance(template, str) else ""
    if isinstance(template, bool):
        return bool(data)
    if template is None or isinstance(template, (int, float)) and not isinstance(template, bool):
        return data if isinstance(data, (int, float)) and not isinstance(data, bool) else _num(data)
    return str(data).strip() if not isinstance(data, (dict, list)) else ""


def _num(v):
    try:
        return int(str(v).strip()) if str(v).strip() not in ("", "None", "null") else None
    except ValueError:
        return None


def normalize(data: dict) -> dict:
    d = _merge(TEMPLATE, data)
    d["formato"] = FORMAT
    # empty placeholder rows the AI may leave in lists
    d["postazioni"] = [p for p in d["postazioni"] if p["nome"]]
    d["utenti_iniziali"] = [u for u in d["utenti_iniziali"] if u["nome"] or u["email"]]
    d["archivi"] = [a for a in d["archivi"] if a["nome"]]
    d["cliente"]["etichette"] = [str(x).strip() for x in d["cliente"]["etichette"] if str(x).strip()]
    d["progetto"]["installazioni"] = [x for x in dict.fromkeys(str(i).strip().lower() for i in d["progetto"]["installazioni"])
                                      if x]
    d["cliente"]["partita_iva"] = re.sub(r"^IT", "", d["cliente"]["partita_iva"].replace(" ", ""), flags=re.I)
    if d["cliente"]["stato"] not in ("active", "prospect"):
        d["cliente"]["stato"] = "active"
    for u in d["utenti_iniziali"]:
        u["ruolo"] = u["ruolo"].lower() if u["ruolo"].lower() in ROLES else "editor"
    f = d["online"]["ftp"]
    f["modo"] = f["modo"].lower()
    if f["modo"] not in FTP_MODES:   # drafts before 0.10 and AI drafts: own FTP if a host is given
        f["modo"] = "cliente" if f["host"] else "nessuno"
    return d


def strip_secrets(d: dict) -> tuple[dict, list[str]]:
    """Remove real-looking secrets from the draft (they are typed in the review step). Returns warnings."""
    d = copy.deepcopy(d)
    warn = []
    for path in SECRET_PATHS:
        node = d
        for k in path[:-1]:
            node = node.get(k) or {}
        v = node.get(path[-1]) if isinstance(node, dict) else None
        if isinstance(v, str) and v and not PLACEHOLDER_RE.match(v):
            warn.append(f"{'.'.join(path)}: c'era una password vera nel JSON. Non l'ho salvata nella bozza: scrivila "
                        "nel passo Online. Se il JSON è passato da un'AI esterna, cambia quella password.")
        if isinstance(node, dict) and path[-1] in node:
            node[path[-1]] = PLACEHOLDERS[path[1]]
    return d, warn


def validate(hub, d: dict) -> dict:
    """{"errors": [{path, msg}], "warnings": [...]} — errors block the confirmation, warnings don't."""
    errs, warns = [], []

    def e(path, msg):
        errs.append({"path": path, "msg": msg})

    def w(path, msg):
        warns.append({"path": path, "msg": msg})
    c, p, lic, on, se = d["cliente"], d["progetto"], d["licenza"], d["online"], d["sede"]
    if not c["ragione_sociale"]:
        e("cliente.ragione_sociale", "Manca la ragione sociale.")
    if c["partita_iva"] and not re.fullmatch(r"\d{11}|[A-Z0-9]{16}", c["partita_iva"].upper()):
        w("cliente.partita_iva", "La P.IVA non ha 11 cifre (né è un codice fiscale di 16 caratteri): controllala.")
    if c["email"] and "@" not in c["email"]:
        e("cliente.email", "Email non valida.")
    if c["colore"] and not re.fullmatch(r"#[0-9a-fA-F]{6}", c["colore"]):
        w("cliente.colore", "Colore non nel formato #RRGGBB: verrà ignorato.")
    if c["rivenditore"]:
        try:
            hub.registry.get_reseller(c["rivenditore"])
        except RegistryError:
            e("cliente.rivenditore", f"Rivenditore '{c['rivenditore']}' non trovato nell'hub.")
    same = None
    if c["ragione_sociale"]:
        from .onboarding import Onboarding
        try:
            same = Onboarding(hub).find_customer(c["ragione_sociale"], c["partita_iva"] or None)
        except RegistryError as exc:
            e("cliente.partita_iva", str(exc))
            same = None
        if same:
            w("cliente.ragione_sociale", f"Esiste già il cliente «{same['name']}» con questa P.IVA o questo nome: la "
                                         "conferma aggiunge il progetto a lui (non crea un doppione).")
    inst = p["installazioni"]
    if not inst or any(i not in ("sede", "online") for i in inst):
        e("progetto.installazioni", "Scegli sede, online oppure entrambe.")
    if lic["piano"] not in hub.plans:
        e("licenza.piano", f"Piano sconosciuto '{lic['piano']}'. Piani: {', '.join(hub.plans)}.")
    if lic["mesi"] is not None and not (1 <= lic["mesi"] <= 120):
        e("licenza.mesi", "Durata tra 1 e 120 mesi (o vuota).")
    for k, v in (lic["limiti"] or {}).items():
        if v is not None and v < -1:
            e(f"licenza.limiti.{k}", "Usa un numero ≥ 0, -1 per illimitato o vuoto per il valore del piano.")
    if "online" in inst:
        if not on["indirizzo"].startswith("https://"):
            e("online.indirizzo", "Serve l'indirizzo completo in https, es. https://docmap.pr-it.it/studio-rossi/.")
        if on["staging"] and not on["staging"].startswith("https://"):
            e("online.staging", "Anche lo staging deve essere in https.")
        if on["staging"] and on["staging"].rstrip("/") == on["indirizzo"].rstrip("/"):
            e("online.staging", "Staging e produzione devono avere indirizzi diversi.")
        for key in ("indirizzo", "staging"):   # v0.10: two customers on the same site = one database for both
            u = on[key].rstrip("/")
            if not u:
                continue
            for env in hub.registry.list_environments():
                if (env.get("url") or "").rstrip("/") == u and (not same or env["customer_id"] != same["id"]):
                    e(f"online.{key}", f"Questo indirizzo è già il sito di «{env['customer_name']}» "
                                       f"({env['name']}): scegline un altro.")
                    break
        f = on["ftp"]
        fs = on["ftp_staging"]
        if f["modo"] == "dominio":
            from . import hosting as H
            hd = H.get(hub.registry)
            if not hd:
                e("online.ftp.modo", "Accesso FTP «del dominio» scelto, ma l'hosting predefinito non è impostato: "
                                     "Impostazioni → Hosting predefinito (una volta sola), oppure scegli «FTP del cliente».")
            elif not hd["has_password"]:
                e("online.ftp.modo", "L'hosting predefinito non ha la password FTP: completalo in Impostazioni.")
            if not f["cartella"]:
                e("online.ftp.cartella", "Manca la cartella del sito sull'hosting (es. /studio-rossi/).")
            if on["staging"] and not f["cartella_staging"]:
                e("online.ftp.cartella_staging", "Con la demo serve anche la sua cartella (es. /studio-rossi-demo/).")
            if f["cartella_staging"] and f["cartella_staging"].rstrip("/") == f["cartella"].rstrip("/"):
                e("online.ftp.cartella_staging", "La cartella della demo deve essere diversa da quella del sito.")
        elif f["modo"] == "nessuno":
            w("online.ftp", "Nessun FTP: potrai scaricare il pacchetto «autoinstall web» e caricarlo a mano.")
        elif f["host"]:
            if f["protocollo"] not in ("ftps", "sftp", "ftp"):
                e("online.ftp.protocollo", "Protocollo: ftps, sftp o ftp.")
            if f["protocollo"] == "ftp":
                w("online.ftp.protocollo", "FTP senza cifratura: la password viaggia in chiaro. Usa ftps se l'hosting lo permette.")
            if not f["utente"]:
                e("online.ftp.utente", "Manca l'utente FTP.")
            if not f["cartella"]:
                e("online.ftp.cartella", "Manca la cartella FTP del sito (es. /studio-rossi/).")
            if on["staging"] and not f["cartella_staging"]:
                e("online.ftp.cartella_staging", "Con lo staging serve anche la sua cartella FTP.")
            if f["cartella_staging"] and f["cartella_staging"].rstrip("/") == f["cartella"].rstrip("/"):
                e("online.ftp.cartella_staging", "La cartella di staging deve essere diversa da quella di produzione.")
        else:
            e("online.ftp.host", "FTP del cliente scelto: scrivi l'host (oppure scegli «FTP del dominio» o «nessuno»).")
        if fs["host"]:
            if not on["staging"]:
                w("online.ftp_staging", "C'è un FTP per la demo ma la demo non è prevista: verrà ignorato.")
            elif f["modo"] == "nessuno":
                e("online.ftp_staging", "FTP della demo senza FTP del sito: scegli prima come si pubblica il sito.")
            if fs["protocollo"] not in ("ftps", "sftp", "ftp"):
                e("online.ftp_staging.protocollo", "Protocollo: ftps, sftp o ftp.")
            if not fs["utente"]:
                e("online.ftp_staging.utente", "Manca l'utente FTP della demo.")
    elif on["indirizzo"] or on["ftp"]["host"]:
        w("online", "Ci sono dati online ma l'installazione online non è scelta: verranno ignorati.")
    if "sede" in inst and se["indirizzo"] and not se["indirizzo"].startswith("https://"):
        w("sede.indirizzo", "L'indirizzo del server in sede di solito è https://<ip>:8443/.")
    names = [x["nome"].lower() for x in d["postazioni"]]
    if len(names) != len(set(names)):
        e("postazioni", "Due postazioni con lo stesso nome.")
    if d["utenti_iniziali"] and not any(u["ruolo"] == "admin" for u in d["utenti_iniziali"]):
        w("utenti_iniziali", "Nessun amministratore tra gli utenti iniziali.")
    for q in d["domande_aperte"]:
        w("domande_aperte", f"Domanda aperta: {q}")
    return {"errors": errs, "warnings": warns}


def title_of(d: dict) -> str:
    return (d["progetto"]["nome"] or d["cliente"]["ragione_sociale"] or "Nuovo progetto")[:120]


# ---------------------------------------------------------------------------
# API helpers used by api.py
# ---------------------------------------------------------------------------

def draft_view(hub, rec: dict) -> dict:
    d = normalize(rec["data"])
    return {"id": rec["id"], "title": rec.get("title"), "status": rec["status"], "data": d,
            "check": validate(hub, d), "passwords": needs_ftp_password(d), "result": rec.get("result"), "updated_at": rec["updated_at"],
            "created_at": rec["created_at"]}


def create_draft(hub, text: str) -> dict:
    raw = extract_json(text)
    if raw.get("formato") not in (FORMAT, None, ""):
        raise RegistryError(f"Formato '{raw.get('formato')}' non riconosciuto: questo hub legge {FORMAT}.")
    d, warn = strip_secrets(normalize(raw))
    rec = hub.registry.save_draft(d, title=title_of(d))
    v = draft_view(hub, rec)
    v["check"]["warnings"] = [{"path": "online.ftp.password", "msg": m} for m in warn] + v["check"]["warnings"]
    return v


def update_draft(hub, did: str, data: dict) -> dict:
    rec = hub.registry.get_draft(did)
    if rec["status"] == "confirmed":
        raise RegistryError("Questa bozza è già stata confermata.")
    d, warn = strip_secrets(normalize(data))
    rec = hub.registry.save_draft(d, draft_id=rec["id"], title=title_of(d))
    v = draft_view(hub, rec)
    v["check"]["warnings"] = [{"path": "online.ftp.password", "msg": m} for m in warn] + v["check"]["warnings"]
    return v


def needs_ftp_password(d: dict) -> dict:
    """Which passwords the confirmation must ask for: {"ftp": bool, "ftp_staging": bool}."""
    on, inst = d["online"], d["progetto"]["installazioni"]
    online = "online" in inst
    return {"ftp": online and on["ftp"]["modo"] == "cliente" and bool(on["ftp"]["host"]),
            "ftp_staging": online and bool(on["staging"]) and on["ftp"]["modo"] != "nessuno"
                           and bool(on["ftp_staging"]["host"])}


def to_request(d: dict, ftp_password: str | None, *, hosting_access: dict | None = None,
               ftp_staging_password: str | None = None):
    """Draft → ClienteNuovo for the onboarding. ``hosting_access`` = the default hosting's FTP (mode «dominio»)."""
    from .onboarding import ClienteNuovo
    c, p, lic, on, se = d["cliente"], d["progetto"], d["licenza"], d["online"], d["sede"]
    inst = tuple(p["installazioni"])
    ftp = None
    f = on["ftp"]
    if "online" in inst and f["modo"] == "dominio" and hosting_access:
        ftp = dict(hosting_access, remote_path=f["cartella"])
    elif "online" in inst and f["modo"] == "cliente" and f["host"]:
        ftp = {"protocol": f["protocollo"], "host": f["host"], "user": f["utente"], "password": ftp_password or "",
               "remote_path": f["cartella"]}
        if f["porta"]:
            ftp["port"] = f["porta"]
    ftp_staging = None
    fs = on["ftp_staging"]
    if ftp and on["staging"] and fs["host"]:
        ftp_staging = {"protocol": fs["protocollo"], "host": fs["host"], "user": fs["utente"],
                       "password": ftp_staging_password or "", "remote_path": f["cartella_staging"]}
        if fs["porta"]:
            ftp_staging["port"] = fs["porta"]
    kw: dict = {}
    if lic["mesi"]:
        kw["months"] = int(lic["mesi"])
    names = {"utenti": "users", "faldoni": "binders", "archivi": "archives"}
    lim = {names[k]: (None if v == -1 else v) for k, v in (lic["limiti"] or {}).items() if v is not None and k in names}
    if lim:
        kw["limits"] = lim
    return ClienteNuovo(
        nome=c["ragione_sociale"], piano=lic["piano"], piva=c["partita_iva"] or None, email=c["email"] or None,
        rivenditore=c["rivenditore"] or None, custodia_chiave=bool(p["custodia_chiave"]), installazioni=inst,
        nome_studio=p["nome_studio"] or None, url_online=(on["indirizzo"] or None) if "online" in inst else None,
        url_staging=(on["staging"] or None) if "online" in inst else None,
        url_sede=(se["indirizzo"] or None) if "sede" in inst else None, ftp=ftp,
        ftp_cartella_staging=(on["ftp"]["cartella_staging"] or None) if ftp and on["staging"] else None,
        ftp_staging=ftp_staging,
        note=c["note"] or None, licenza_kw=kw)


def apply_extras(hub, d: dict, rep: dict, draft_id: str) -> list[str]:
    """After onboarding: customer details, project name + plan data, workstations. Idempotent."""
    reg, done = hub.registry, []
    c, p = d["cliente"], d["progetto"]
    cid = rep["customer_id"]
    extra = {"pec": c["pec"], "contact": c["referente"], "phone": c["telefono"], "address": c["indirizzo"],
             "city": c["citta"], "province": c["provincia"], "sdi": c["codice_sdi"], "codice_multi": c["codice_multi"],
             "tags": c["etichette"], "color": c["colore"] if re.fullmatch(r"#[0-9a-fA-F]{6}", c["colore"] or "") else ""}
    reg.update_customer(cid, extra={k: v for k, v in extra.items() if v}, status=c["stato"])
    done.append("dati anagrafici del cliente")
    pid = None
    for iid in rep["instances"].values():
        pid = reg.get_instance(iid).get("project_id") or pid
    if pid is None:
        pid = reg.add_project(cid, p["nome"] or f"DocMap {c['ragione_sociale']}")["id"]
    reg.update_project(pid, name=p["nome"] or reg.get_project(pid)["name"], notes=p["note"] or None,
                       data={"nome_studio": p["nome_studio"], "utenti_iniziali": d["utenti_iniziali"],
                             "archivi": d["archivi"], "pc_server": d["sede"]["pc_server"], "bozza": draft_id})
    done.append("progetto con utenti e archivi previsti")
    existing = {w["name"].lower() for w in reg.list_workstations(pid) if w["status"] != "revoked"}
    for w in d["postazioni"]:
        if w["nome"].lower() in existing:
            continue
        reg.add_workstation(pid, w["nome"], w["etichetta"] or None, notes=f"bozza {draft_id}")
        done.append(f"postazione {w['nome']}")
    rep["project_id"] = pid
    return done
