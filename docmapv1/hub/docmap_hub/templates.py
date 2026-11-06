"""v0.10: «Modelli cliente» — a new customer in two clicks.

A template is a complete project draft (same format as «Crea progetto con AI», ``docmap-progetto/1``) WITHOUT the
customer's identity: plan, installations, demo yes/no, how the site is published (default hosting / own FTP / by
hand), people and archives to create, tags. Picking a template in «Nuovo cliente» fills every mask; the customer's
name and VAT number are the only things to type. Templates are separate from customers: changing or deleting a
template never touches the customers created with it.

Placeholders in string values, expanded when a template is applied:
  ``{nome}``  the customer's name                  ``{slug}``  the name as a web folder (studio-rossi)
  ``{sito}`` / ``{sito-demo}``                     address of the site / of the demo on the default hosting
  ``{cartella}`` / ``{cartella-demo}``             their folders on the default hosting

Ten built-in templates are added the first time (``templates.seeded``); they can be changed or deleted like any
other, and «Ripristina i modelli predefiniti» puts back the missing ones (never overwrites).
"""

from __future__ import annotations

import copy
import json
import re
import uuid

from . import hosting as H
from .registry import RegistryError, _now

SEEDED = "templates.seeded"
DEFAULT = "templates.default"
CUSTOMER_KEYS = ("ragione_sociale", "partita_iva", "email", "pec", "referente", "telefono", "indirizzo", "citta",
                 "provincia", "codice_sdi", "codice_multi", "note")


class TemplateError(RegistryError):
    pass


def _people(*rows):
    return [{"nome": n, "email": "", "ruolo": r} for n, r in rows]


def _arch(*names):
    return [{"nome": n, "note": ""} for n in names]


# key, name, description, overrides of the empty draft
BUILTIN: list[tuple[str, str, str, dict]] = [
    ("commercialista-online", "Commercialista · solo online",
     "Il caso più comune: sito sul tuo hosting, niente PC in sede, niente demo.",
     {"progetto": {"installazioni": ["online"]}, "licenza": {"piano": "studio"},
      "online": {"staging": False},
      "cliente": {"etichette": ["commercialista"]},
      "utenti_iniziali": _people(("titolare", "admin"), ("segreteria", "editor")),
      "archivi": _arch("Archivio corrente")}),
    ("commercialista-online-demo", "Commercialista · online con demo",
     "Come il precedente, più un sito demo per provare gli aggiornamenti prima del sito vero.",
     {"progetto": {"installazioni": ["online"]}, "licenza": {"piano": "studio"},
      "online": {"staging": True},
      "cliente": {"etichette": ["commercialista"]},
      "utenti_iniziali": _people(("titolare", "admin"), ("segreteria", "editor")),
      "archivi": _arch("Archivio corrente")}),
    ("commercialista-sede-online", "Commercialista · sede + online",
     "Server sul PC dello studio e sito online, sincronizzati. Piano Studio Pro.",
     {"progetto": {"installazioni": ["sede", "online"]}, "licenza": {"piano": "studio_pro"},
      "online": {"staging": False},
      "cliente": {"etichette": ["commercialista"]},
      "utenti_iniziali": _people(("titolare", "admin"), ("segreteria", "editor")),
      "archivi": _arch("Archivio corrente", "Archivio storico")}),
    ("commercialista-sede", "Commercialista · solo sede",
     "Tutto sul PC dello studio, niente internet (on-premise).",
     {"progetto": {"installazioni": ["sede"]}, "licenza": {"piano": "studio"},
      "cliente": {"etichette": ["commercialista", "on-premise"]},
      "utenti_iniziali": _people(("titolare", "admin"), ("segreteria", "editor")),
      "archivi": _arch("Archivio corrente")}),
    ("studio-grande", "Studio grande · sede + online + demo",
     "Più sedi o tante persone: server in sede, sito online e demo. Piano Studio Pro.",
     {"progetto": {"installazioni": ["sede", "online"]}, "licenza": {"piano": "studio_pro"},
      "online": {"staging": True},
      "cliente": {"etichette": ["commercialista", "studio grande"]},
      "utenti_iniziali": _people(("titolare", "admin"), ("segreteria", "editor"), ("collaboratori", "viewer")),
      "archivi": _arch("Archivio corrente", "Archivio storico")}),
    ("conto-terzi-online", "Archiviazione conto terzi · online",
     "Azienda che archivia per i suoi clienti: sito online con demo, piano Conto terzi.",
     {"progetto": {"installazioni": ["online"]}, "licenza": {"piano": "conto_terzi"},
      "online": {"staging": True},
      "cliente": {"etichette": ["conto terzi"]},
      "utenti_iniziali": _people(("responsabile", "admin"), ("magazzino", "editor")),
      "archivi": _arch("Magazzino")}),
    ("conto-terzi-sede-online", "Archiviazione conto terzi · sede + online",
     "Magazzino con PC server e sito online sincronizzati, piano Conto terzi.",
     {"progetto": {"installazioni": ["sede", "online"]}, "licenza": {"piano": "conto_terzi"},
      "online": {"staging": True},
      "cliente": {"etichette": ["conto terzi"]},
      "utenti_iniziali": _people(("responsabile", "admin"), ("magazzino", "editor")),
      "archivi": _arch("Magazzino")}),
    ("prova-gratuita", "Prova gratuita · 30 giorni",
     "Trattativa: sito online con piano di prova (1 mese). Cliente segnato «in trattativa».",
     {"progetto": {"installazioni": ["online"]}, "licenza": {"piano": "trial", "mesi": 1},
      "online": {"staging": False},
      "cliente": {"stato": "prospect", "etichette": ["prova"]},
      "utenti_iniziali": _people(("titolare", "admin")),
      "archivi": _arch("Archivio di prova")}),
    ("rivenditore", "Cliente di un rivenditore · online",
     "Sito online per un cliente portato da un rivenditore: scegli il rivenditore nel primo passo.",
     {"progetto": {"installazioni": ["online"]}, "licenza": {"piano": "studio"},
      "online": {"staging": False},
      "cliente": {"etichette": ["rivenditore"]},
      "utenti_iniziali": _people(("titolare", "admin"), ("segreteria", "editor")),
      "archivi": _arch("Archivio corrente")}),
    ("appliance", "Appliance · PC dedicato",
     "Un PC preparato da te e consegnato al cliente: solo sede, piano Appliance.",
     {"progetto": {"installazioni": ["sede"]}, "licenza": {"piano": "appliance"},
      "cliente": {"etichette": ["appliance"]},
      "utenti_iniziali": _people(("titolare", "admin"), ("segreteria", "editor")),
      "archivi": _arch("Archivio corrente")}),
]


def _deep_update(dst: dict, src: dict) -> dict:
    for k, v in src.items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            _deep_update(dst[k], v)
        else:
            dst[k] = copy.deepcopy(v)
    return dst


def builtin_data(over: dict) -> dict:
    """Draft data of a built-in template: published on the default hosting, names from the customer."""
    from . import pipeline as P
    d = copy.deepcopy(P.TEMPLATE)
    over = copy.deepcopy(over)
    staging = bool((over.get("online") or {}).pop("staging", False))
    _deep_update(d, over)
    d["progetto"]["nome"] = "DocMap {nome}"
    d["progetto"]["nome_studio"] = "{nome}"
    if "online" in d["progetto"]["installazioni"]:
        d["online"]["indirizzo"] = "{sito}"
        d["online"]["staging"] = "{sito-demo}" if staging else ""
        d["online"]["ftp"].update(modo="dominio", cartella="{cartella}",
                                  cartella_staging="{cartella-demo}" if staging else "")
    else:
        d["online"]["ftp"]["modo"] = "nessuno"
    d["online"]["ftp"]["password"] = ""
    d["online"]["ftp_staging"]["password"] = ""
    d["postazioni"] = []
    return d


# ---------------------------------------------------------------------------
# storage
# ---------------------------------------------------------------------------

def _row(r) -> dict:
    d = dict(r)
    d["data"] = json.loads(d.pop("json"))
    return d


def ensure_seeded(reg) -> None:
    if reg.get_setting(SEEDED):
        return
    _insert_builtins(reg)
    reg.set_setting(SEEDED, _now(), log=False)
    if not reg.get_setting(DEFAULT):
        reg.set_setting(DEFAULT, "tpl-" + BUILTIN[0][0], log=False)


def _insert_builtins(reg) -> int:
    n = 0
    have = {r[0] for r in reg.conn.execute("SELECT builtin FROM customer_templates WHERE builtin IS NOT NULL")}
    names = {r[0].lower() for r in reg.conn.execute("SELECT name FROM customer_templates")}
    with reg.conn:
        for pos, (key, name, desc, over) in enumerate(BUILTIN):
            if key in have or name.lower() in names:
                continue
            now = _now()
            reg.conn.execute("INSERT INTO customer_templates(id,name,description,json,builtin,position,created_at,"
                             "updated_at) VALUES(?,?,?,?,?,?,?,?)",
                             ("tpl-" + key, name, desc, json.dumps(builtin_data(over), ensure_ascii=False, sort_keys=True),
                              key, pos, now, now))
            n += 1
    return n


def restore_builtins(reg) -> int:
    n = _insert_builtins(reg)
    reg.log("template.restore", details={"added": n})
    return n


def summary(d: dict) -> dict:
    inst = d["progetto"]["installazioni"]
    return {"installazioni": inst, "piano": d["licenza"]["piano"], "mesi": d["licenza"]["mesi"],
            "demo": "online" in inst and bool(d["online"]["staging"]),
            "ftp": d["online"]["ftp"]["modo"] if "online" in inst else None,
            "persone": len(d["utenti_iniziali"]), "archivi": len(d["archivi"])}


def list_templates(reg) -> list[dict]:
    ensure_seeded(reg)
    default = reg.get_setting(DEFAULT)
    out = []
    for r in reg.conn.execute("SELECT * FROM customer_templates ORDER BY position, name COLLATE NOCASE"):
        t = _row(r)
        from . import pipeline as P
        t["summary"] = summary(P.normalize(t["data"]))
        t["default"] = t["id"] == default
        out.append(t)
    return out


def get(reg, ref: str) -> dict:
    ensure_seeded(reg)
    r = reg.conn.execute("SELECT * FROM customer_templates WHERE id=? OR name=? COLLATE NOCASE", (ref, ref)).fetchone()
    if r is None:
        raise TemplateError(f"Modello cliente non trovato: {ref}.")
    return _row(r)


def _check_name(reg, name: str, tid: str | None = None) -> str:
    name = (name or "").strip()
    if not name or len(name) > 80:
        raise TemplateError("Dai un nome al modello (al massimo 80 caratteri).")
    r = reg.conn.execute("SELECT id FROM customer_templates WHERE name=? COLLATE NOCASE", (name,)).fetchone()
    if r and r[0] != tid:
        raise TemplateError(f"Esiste già un modello chiamato «{name}».")
    return name


def from_draft(d: dict) -> dict:
    """Draft data → template data: no customer identity, the customer's name and web folder become placeholders."""
    from . import pipeline as P
    d = P.normalize(copy.deepcopy(d))
    name = d["cliente"]["ragione_sociale"].strip()
    slug = web_slug(name) if name else ""
    on, f = d["online"], d["online"]["ftp"]
    # the default-hosting values first (exact), then any other occurrence of the folder name
    if f["modo"] == "dominio":
        for key, ph in (("indirizzo", "{sito}"), ("staging", "{sito-demo}")):
            if on[key]:
                on[key] = ph
        for key, ph in (("cartella", "{cartella}"), ("cartella_staging", "{cartella-demo}")):
            if f[key]:
                f[key] = ph

    def generic(v):
        if not isinstance(v, str) or not v:
            return v
        if name:
            v = v.replace(name, "{nome}")
        if slug and len(slug) >= 3:
            v = re.sub(rf"(?<![a-z0-9]){re.escape(slug)}(?![a-z0-9])", "{slug}", v)
        return v
    for k in ("indirizzo", "staging"):
        on[k] = generic(on[k])
    for k in ("cartella", "cartella_staging"):
        f[k] = generic(f[k])
    for k in ("nome", "nome_studio", "note"):
        d["progetto"][k] = generic(d["progetto"][k])
    for k in CUSTOMER_KEYS:
        d["cliente"][k] = ""
    f["password"] = ""
    on["ftp_staging"]["password"] = ""
    d["progetto"]["modello"] = ""
    d["domande_aperte"] = []
    return d


def create(reg, name: str, data: dict, description: str = "") -> dict:
    from . import pipeline as P
    ensure_seeded(reg)
    name = _check_name(reg, name)
    tid = "tpl-" + uuid.uuid4().hex[:10]
    now = _now()
    pos = (reg.conn.execute("SELECT max(position) FROM customer_templates").fetchone()[0] or 0) + 1
    with reg.conn:
        reg.conn.execute("INSERT INTO customer_templates(id,name,description,json,builtin,position,created_at,updated_at)"
                         " VALUES(?,?,?,?,NULL,?,?,?)",
                         (tid, name, (description or "").strip()[:300],
                          json.dumps(from_draft(P.normalize(data)), ensure_ascii=False, sort_keys=True), pos, now, now))
        reg.log("template.add", "template", tid, {"name": name}, commit=False)
    return get(reg, tid)


def save(reg, tid: str, *, data: dict | None = None, name: str | None = None, description: str | None = None) -> dict:
    from . import pipeline as P
    t = get(reg, tid)
    fields, args = [], []
    if name is not None:
        fields.append("name=?")
        args.append(_check_name(reg, name, t["id"]))
    if description is not None:
        fields.append("description=?")
        args.append(description.strip()[:300])
    if data is not None:
        fields.append("json=?")
        args.append(json.dumps(from_draft(P.normalize(data)), ensure_ascii=False, sort_keys=True))
    if not fields:
        return t
    fields.append("updated_at=?")
    args.append(_now())
    with reg.conn:
        reg.conn.execute(f"UPDATE customer_templates SET {', '.join(fields)} WHERE id=?", (*args, t["id"]))
        reg.log("template.update", "template", t["id"], {"name": name or t["name"], "data": data is not None},
                commit=False)
    return get(reg, t["id"])


def delete(reg, tid: str) -> None:
    t = get(reg, tid)
    with reg.conn:
        reg.conn.execute("DELETE FROM customer_templates WHERE id=?", (t["id"],))
        reg.log("template.delete", "template", t["id"], {"name": t["name"]}, commit=False)
    if reg.get_setting(DEFAULT) == t["id"]:
        reg.set_setting(DEFAULT, None, log=False)


def set_default(reg, tid: str | None) -> None:
    if tid:
        tid = get(reg, tid)["id"]
    reg.set_setting(DEFAULT, tid or None)


# ---------------------------------------------------------------------------
# apply

LEGAL_FORMS = re.compile(r"\b(s\.?\s?r\.?\s?l\.?s?|s\.?\s?p\.?\s?a\.?|s\.?\s?a\.?\s?s\.?|s\.?\s?n\.?\s?c\.?|"
                         r"s\.?\s?t\.?\s?p\.?|s\.?\s?s\.?|soc\.?\s+coop\.?|onlus)(?=\W|$)", re.I)


def web_slug(name: str) -> str:
    """Web folder from a company name: «Studio Rossi & Associati S.r.l.» → studio-rossi-associati."""
    from .onboarding import slugify
    base = LEGAL_FORMS.sub(" ", name or "")
    return slugify(base if re.search(r"[^\W_]", base) else (name or "")) or "studio"


def free_slug(reg, slug: str) -> str:
    """The slug, or slug-2, slug-3… when another site of the hub already uses that folder name."""
    used = set()
    for e in reg.list_environments():
        u = (e.get("url") or "").rstrip("/")
        if u:
            used.add(u.rsplit("/", 1)[-1])
    cand, n = slug, 2
    suffix = (H.get(reg) or {}).get("staging_suffix") or H.DEFAULT_SUFFIX
    while cand in used or cand + suffix in used:
        cand, n = f"{slug}-{n}", n + 1
    return cand


# ---------------------------------------------------------------------------

def apply(hub, tref: str | None, name: str, vat: str = "", installazioni: list | None = None) -> dict:
    """Draft data for a new customer from a template (None = the empty masks)."""
    from . import pipeline as P
    reg = hub.registry
    name = (name or "").strip()
    if not name:
        raise TemplateError("Scrivi la ragione sociale.")
    if tref:
        t = get(reg, tref)
        d = P.normalize(copy.deepcopy(t["data"]))
        d["progetto"]["modello"] = t["name"]
    else:
        d = P.normalize(copy.deepcopy(P.TEMPLATE))
        d["progetto"]["nome"], d["progetto"]["nome_studio"] = "DocMap {nome}", "{nome}"
        d["online"]["ftp"]["password"] = ""
        d["postazioni"], d["utenti_iniziali"], d["archivi"] = [], [], []
        if H.get(reg):  # empty masks still publish on the default hosting when there is one
            d["online"].update(indirizzo="{sito}", staging="")
            d["online"]["ftp"].update(modo="dominio", cartella="{cartella}", cartella_staging="")
    if isinstance(installazioni, list) and installazioni:
        d["progetto"]["installazioni"] = [x for x in ("sede", "online") if x in installazioni]
    slug = free_slug(reg, web_slug(name))
    site = H.site_for(reg, slug, staging=True)
    values = {"{nome}": name, "{slug}": slug, "{sito}": site["indirizzo"], "{sito-demo}": site["staging"],
              "{cartella}": site["cartella"], "{cartella-demo}": site["cartella_staging"]}

    def expand(v):
        if isinstance(v, str):
            for k in sorted(values, key=len, reverse=True):
                v = v.replace(k, values[k])
            return v
        if isinstance(v, dict):
            return {k: expand(x) for k, x in v.items()}
        if isinstance(v, list):
            return [expand(x) for x in v]
        return v
    d = expand(d)
    d["cliente"]["ragione_sociale"] = name
    d["cliente"]["partita_iva"] = (vat or "").strip()
    return P.normalize(d)
