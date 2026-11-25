"""Data blocks: extract a field, classify, look up a table, set a value, tag."""

from __future__ import annotations

import json
import re
from pathlib import Path

from .. import media as M
from .. import providers as PR
from .. import validators as V
from ..items import REVIEW, item_vars, render
from ..registry import P, block
from .reading import fold

METHODS = ["regex", "after", "between", "keyword", "number_range", "date", "amount", "piva", "cf", "iban", "email",
           "filename", "ai"]


def source_text(it, src: str) -> str:
    if src == "text":
        return it.text
    if src == "filename":
        return it.p.stem
    if src == "src":
        return it.src
    if src.startswith("field:"):
        return str(it.value(src[6:], "") or "")
    if src.startswith("page:"):       # one page of the text read by OCR (pages separated by \f)
        parts = it.text.split("\f")
        n = int(src[5:] or 1)
        return parts[n - 1] if 0 < n <= len(parts) else (parts[n] if n < 0 and -n <= len(parts) else "")
    if src == "first_lines":
        return "\n".join(it.text.splitlines()[:15])
    return it.text


def _pick(values: list, occurrence: str):
    if not values:
        return None
    if occurrence == "last":
        return values[-1]
    if occurrence == "all":
        return values
    if occurrence.isdigit():
        n = int(occurrence)
        return values[n - 1] if 0 < n <= len(values) else None
    return values[0]


def _norm(v, how: str):
    if v is None or isinstance(v, list):
        return v
    s = str(v)
    for h in (how or "").split(","):
        h = h.strip()
        if h == "upper":
            s = s.upper()
        elif h == "lower":
            s = s.lower()
        elif h == "digits":
            s = re.sub(r"\D", "", s)
        elif h == "nospace":
            s = re.sub(r"\s", "", s)
        elif h == "strip_zeros":
            s = s.lstrip("0") or "0"
        elif h.startswith("pad:"):
            s = s.zfill(int(h[4:]))
    return s.strip(" \t.:;,")


def extract_values(it, p) -> tuple[list, float]:
    """Candidates found by the method, and the method's own confidence."""
    text = source_text(it, p["source"])
    m = p["method"]
    flags = re.I | re.M
    if m in ("regex", "filename"):
        if not p["pattern"]:
            raise ValueError("serve la regola (espressione regolare)")
        rx = re.compile(p["pattern"], flags)
        src = it.p.stem if m == "filename" else text
        vals = []
        for mm in rx.finditer(src):
            g = mm.groupdict()
            vals.append(next((v for v in g.values() if v), None) if g else (mm.group(1) if mm.groups() else mm.group(0)))
        return [v for v in vals if v], 0.95
    if m == "after":
        if not p["start"]:
            raise ValueError("serve la parola dopo cui leggere")
        rx = re.compile(re.escape(p["start"]) + r"[\s:.#n°º]*" + (p["pattern"] or r"([\w./-]+)"), flags)
        return [mm.group(1) if mm.groups() else mm.group(0) for mm in rx.finditer(text)], 0.9
    if m == "between":
        if not p["start"] or not p["end"]:
            raise ValueError("servono le parole di inizio e di fine")
        rx = re.compile(re.escape(p["start"]) + r"\s*([\s\S]*?)\s*" + re.escape(p["end"]), flags)
        return [mm.group(1).strip() for mm in rx.finditer(text) if mm.group(1).strip()], 0.85
    if m == "keyword":
        from .reading import find_keyword
        out = [kw for kw in p["keywords"] if find_keyword(text, kw, True, p["fuzzy"])]
        return out, 0.9
    if m == "number_range":
        lo = p["min"] if p["min"] is not None else float("-inf")
        hi = p["max"] if p["max"] is not None else float("inf")
        nums = [n for n in re.findall(r"(?<![\d.,])\d+(?![\d])", text) if lo <= int(n) <= hi]
        return nums, 0.7
    if m == "date":
        return V.parse_date(text), 0.85
    if m == "amount":
        return [f"{v:.2f}" for v in V.amounts(text)], 0.75
    if m in ("piva", "cf", "iban", "email"):
        vals = [re.sub(r"\s", "", mm.group(1)).upper() if m != "email" else mm.group(1) for mm in V.PATTERNS[m].finditer(text)]
        good = []
        for v in vals:
            if V.CHECKS[m](v):
                good.append(v)
            elif m == "iban":          # glued to the next word: the longest valid prefix
                for n in range(len(v) - 1, 14, -1):
                    if V.CHECKS[m](v[:n]):
                        good.append(v[:n])
                        break
        return good, 0.98
    raise ValueError(f"metodo sconosciuto: {m}")


@block("extract", "Leggi un campo", "dati",
       help="Trova un valore nel testo letto (o nel nome del file) e lo salva in un campo da usare dopo per nomi e "
            "cartelle: regola (espressione regolare), «dopo la parola», «tra due parole», parole chiave, numero in un "
            "intervallo, data, importo, partita IVA, codice fiscale, IBAN, e-mail (con controllo della cifra), o AI. "
            "Se trova valori diversi o niente, il file va a verifica.",
       params=[P("field", "field", "", "Nome del campo", "es. numero, cliente, anno", required=True),
               P("method", "choice", "regex", "Metodo", choices=METHODS),
               P("source", "str", "text", "Dove cercare", "text, first_lines, page:1, page:-1, filename, src, field:nome"),
               P("pattern", "regex", "", "Regola", "per regex: il gruppo (…) è il valore; es. Fattura\\s*n\\.?\\s*(\\d+)"),
               P("start", "str", "", "Dopo la parola / da"),
               P("end", "str", "", "Fino alla parola"),
               P("keywords", "list", [], "Parole chiave", "per «keyword»"),
               P("fuzzy", "float", 0.0, "Tolleranza errori OCR", min=0, max=1),
               P("min", "float", None, "Minimo", "per «number_range»"),
               P("max", "float", None, "Massimo", "per «number_range»"),
               P("occurrence", "str", "first", "Quale", "first, last, all, 2 (il secondo)"),
               P("normalize", "str", "", "Pulizia del valore", "upper, lower, digits, nospace, strip_zeros, pad:6"),
               P("prompt", "text", "", "Istruzione per l'AI", "per «ai»: cosa deve leggere"),
               P("use_image", "bool", False, "L'AI guarda anche l'immagine"),
               P("default", "str", "", "Valore se non trova", "vuoto = lascia vuoto"),
               P("required", "bool", True, "Obbligatorio", "se manca, il file va a verifica"),
               P("ambiguous_review", "bool", True, "Valori diversi → verifica"),
               P("profile", "str", "", "Profilo AI (metodo AI)", "vuoto = Impostazioni › AI › Compiti")],
       meters=["ai_call"])
def extract(it, p, ctx):
    if p["method"] == "ai":
        return extract_ai(it, p, ctx)
    vals, conf = extract_values(it, p)
    vals = [_norm(v, p["normalize"]) for v in vals if v not in (None, "")]
    distinct = list(dict.fromkeys(str(v) for v in vals))
    v = _pick(vals, p["occurrence"])
    if isinstance(v, list):
        v = ", ".join(dict.fromkeys(str(x) for x in v))
    if len(distinct) > 1 and p["occurrence"] == "first" and p["ambiguous_review"]:
        conf = min(conf, 0.6)
        it.flag(f"{p['field']}: più valori ({', '.join(distinct[:4])})")
    if p["source"] in ("text", "first_lines") or p["source"].startswith("page:"):
        if it.text_conf is not None:
            conf = conf * (0.5 + 0.5 * it.text_conf)   # what OCR read badly is less sure
    if v in (None, ""):
        if p["default"]:
            it.set_field(p["field"], p["default"], 0.3, "default")
            if p["required"]:
                it.flag(f"{p['field']}: non trovato, messo «{p['default']}»")
        else:
            it.set_field(p["field"], "", 0.0, p["method"])
            if p["required"]:
                it.flag(f"{p['field']}: non trovato")
        return it
    alts = [x for x in distinct if x != str(v)][:5]
    it.set_field(p["field"], v, conf, p["method"], **({"choices": alts} if alts else {}))
    return it


def extract_ai(it, p, ctx):
    desc = p["prompt"] or f"il valore del campo «{p['field']}»"
    text = source_text(it, p["source"])[:12000]
    prompt = (f"Da questo documento leggi {desc}. Rispondi con JSON {{\"value\": \"…\", \"confidence\": 0..1}}; "
              "value vuoto se non c'è.\n\nTesto letto (può avere errori di OCR):\n" + text)
    ctx.meter("ai_call")
    img = PR.image_payload(it.p, it.page if it.ext == "pdf" else 1) if p["use_image"] and it.kind in ("image", "pdf") else None
    r = PR.ai_json(ctx.settings, prompt, img, {"type": "object", "properties": {"value": {"type": "string"},
                                                                                 "confidence": {"type": "number"}},
                                               "required": ["value", "confidence"], "additionalProperties": False},
                   profile=p.get("profile") or None, task="extract")
    res = r["result"]
    v = _norm(res.get("value"), p["normalize"])
    conf = res.get("confidence") if isinstance(res.get("confidence"), (int, float)) else 0.5
    if v in (None, ""):
        it.set_field(p["field"], p["default"] or "", 0.0, "ai:" + r["model"])
        if p["required"]:
            it.flag(f"{p['field']}: non trovato (AI)")
    else:
        it.set_field(p["field"], v, float(conf), "ai:" + r["model"])
    return it


def parse_classes(spec) -> list[dict]:
    """JSON ``[{"class": "fattura", "any": ["fattura", "invoice"], "all": [], "none": [], "regex": ""}]`` or text
    ``fattura: fattura, invoice`` (one class per line)."""
    if isinstance(spec, list):
        return spec
    s = str(spec or "").strip()
    if s.startswith("["):
        return json.loads(s)
    out = []
    for line in s.splitlines():
        if ":" in line:
            c, _, kws = line.partition(":")
            out.append({"class": c.strip(), "any": [k.strip() for k in kws.split(",") if k.strip()]})
    return out


@block("classify", "Classifica", "dati",
       help="Decide il tipo di documento (fattura, nota di credito, F24, contratto…) dalle parole che contiene, con "
            "regole semplici («fattura: fattura, invoice, ft.» una per riga) o con l'AI. Se è incerto va a verifica.",
       params=[P("classes", "text", "", "Classi e parole", "una per riga: classe: parola1, parola2", required=True),
               P("method", "choice", "rules", "Metodo", choices=["rules", "ai"]),
               P("default", "str", "altro", "Classe se nessuna corrisponde"),
               P("field", "field", "tipo", "Salva anche nel campo"),
               P("review_below", "float", 0.5, "Verifica sotto", "affidabilità sotto cui chiede a una persona", min=0, max=1),
               P("fuzzy", "float", 0.0, "Tolleranza errori OCR", min=0, max=1),
               P("profile", "str", "", "Profilo AI (metodo AI)", "vuoto = Impostazioni › AI › Compiti")],
       meters=["ai_call"])
def classify(it, p, ctx):
    from .reading import find_keyword
    classes = parse_classes(p["classes"])
    if not classes:
        raise ValueError("nessuna classe definita")
    names = [c["class"] for c in classes]
    if p["method"] == "ai":
        ctx.meter("ai_call")
        r = PR.ai_json(ctx.settings, "Classifica questo documento in una di queste classi: " + ", ".join(names) +
                       f" (o «{p['default']}» se nessuna va bene). Rispondi con JSON {{\"class\": \"…\", \"confidence\": 0..1}}."
                       "\n\nTesto:\n" + it.text[:10000], profile=p.get("profile") or None, task="classify")
        c = str(r["result"].get("class") or p["default"])
        conf = float(r["result"].get("confidence") or 0.5)
        if c not in names + [p["default"]]:
            c, conf = p["default"], 0.2
        by = "ai:" + r["model"]
        scores = {}
    else:
        scores = {}
        for c in classes:
            any_ = [k for k in c.get("any", []) if find_keyword(it.text, k, True, p["fuzzy"])]
            all_ = c.get("all", [])
            none_ = c.get("none", [])
            if all_ and not all(find_keyword(it.text, k, True, p["fuzzy"]) for k in all_):
                continue
            if none_ and any(find_keyword(it.text, k, True, 0) for k in none_):
                continue
            sc = sum(len(k.split()) for k in any_) + sum(len(k.split()) for k in all_)   # «nota di credito» beats «fattura»
            if c.get("regex") and re.search(c["regex"], it.text, re.I | re.M):
                sc += 2
            if sc:
                scores[c["class"]] = scores.get(c["class"], 0) + sc
        if scores:
            ranked = sorted(scores.items(), key=lambda kv: -kv[1])
            c = ranked[0][0]
            total = sum(scores.values())
            conf = ranked[0][1] / total if len(ranked) > 1 else min(1.0, 0.6 + 0.2 * ranked[0][1])
        else:
            c, conf = p["default"], 0.0
        by = "rules"
    it.cls = c
    if p["field"]:
        it.set_field(p["field"], c, conf, by, **({"choices": [k for k in names if k != c]} if names else {}))
    it.meta["class_scores"] = scores
    if conf < p["review_below"]:
        it.flag(f"tipo incerto ({c}, {int(conf * 100)}%)")
    return it


@block("lookup", "Cerca in una tabella", "dati",
       help="Completa i campi con un elenco (CSV o Excel): per esempio dal codice cliente letto prende ragione sociale "
            "e Codice Multi. Se il valore non è nell'elenco il file va a verifica.",
       params=[P("table", "path", "", "File della tabella", "CSV o XLSX; percorso completo o relativo alla cartella di partenza", required=True),
               P("from_field", "field", "", "Campo da cercare", required=True),
               P("key_column", "str", "", "Colonna della tabella con la chiave", required=True),
               P("columns", "list", [], "Colonne da copiare", "vuoto = tutte"),
               P("prefix", "str", "", "Prefisso dei campi copiati"),
               P("match", "choice", "exact", "Confronto", choices=["exact", "folded", "digits"]),
               P("on_missing", "choice", "review", "Se non lo trova", choices=["review", "keep", "error", "skip"])])
def lookup(it, p, ctx):
    path = Path(p["table"])
    if not path.is_absolute() and ctx.input_dir:
        path = ctx.input_dir / path
    cache = ctx.cache.setdefault("tables", {})
    key = (str(path), p["key_column"], p["match"])
    if key not in cache:
        rows = M.read_table(path)
        if not rows:
            raise ValueError("tabella vuota")
        head = [str(h or "").strip() for h in rows[0]]
        if p["key_column"] not in head:
            raise ValueError(f"la tabella non ha la colonna «{p['key_column']}» (ha: {', '.join(head[:12])})")
        ki = head.index(p["key_column"])
        index = {}
        for r in rows[1:]:
            if ki < len(r) and r[ki] not in (None, ""):
                index.setdefault(_key(r[ki], p["match"]), dict(zip(head, r)))
        cache[key] = (head, index)
    head, index = cache[key]
    v = it.value(p["from_field"], "")
    row = index.get(_key(v, p["match"])) if v not in (None, "") else None
    if row is None:
        if p["on_missing"] == "review":
            it.flag(f"{p['from_field']} «{v}» non è nell'elenco")
        elif p["on_missing"] == "error":
            raise ValueError(f"{p['from_field']} «{v}» non è nell'elenco")
        elif p["on_missing"] == "skip":
            it.status = "skip"
        return it
    conf = (it.fields.get(p["from_field"]) or {}).get("conf")
    for col in (p["columns"] or [h for h in head if h != p["key_column"]]):
        if col in row:
            it.set_field(p["prefix"] + col, "" if row[col] is None else str(row[col]), conf, "lookup")
    return it


def _key(v, how: str) -> str:
    s = str(v).strip()
    if how == "folded":
        return re.sub(r"\s+", " ", fold(s))
    if how == "digits":
        return re.sub(r"\D", "", s).lstrip("0")
    return s


@block("set", "Imposta un campo", "dati",
       help="Scrive un valore in un campo: fisso («2024») o composto con le variabili («{cliente}-{anno}», «{n:05}»).",
       params=[P("field", "field", "", "Campo", required=True),
               P("value", "template", "", "Valore", "es. {cliente}-{anno}, ARCHIVIO, {src_dir}", required=True),
               P("only_if_empty", "bool", False, "Solo se è vuoto")])
def set_(it, p, ctx):
    from .files import vars_with_counter
    if p["only_if_empty"] and it.value(p["field"], "") not in (None, ""):
        return it
    v = render(p["value"], vars_with_counter(it, ctx, p["value"]), path_safe=False)
    it.set_field(p["field"], v, 1.0, "set")
    return it


@block("tag", "Aggiungi tag", "dati",
       help="Aggiunge tag fissi, presi dai campi o normalizzati con un vocabolario (sinonimi → tag giusto). Con «Solo "
            "vocabolario» un tag sconosciuto non entra e il file va a verifica.",
       params=[P("tags", "list", [], "Tag", "fissi o con variabili, es. {tipo}, {anno}"),
               P("vocabulary", "json", None, "Vocabolario", "JSON {\"fattura\": [\"ft\", \"invoice\"], …}"),
               P("only_vocabulary", "bool", False, "Solo vocabolario")])
def tag(it, p, ctx):
    voc = p["vocabulary"] or {}
    syn = {}
    for t, al in voc.items():
        syn[fold(t)] = t
        for a in al or []:
            syn[fold(a)] = t
    for raw in p["tags"]:
        v = render(raw, item_vars(it, ctx.vars), path_safe=False) if "{" in raw else raw
        for t in [x.strip() for x in v.split(",") if x.strip()]:
            norm = syn.get(fold(t))
            if norm is None and voc and p["only_vocabulary"]:
                it.flag(f"tag non nel vocabolario: {t}", REVIEW)
                it.meta.setdefault("tag_suggestions", []).append(t)
                continue
            t = norm or t
            if t not in it.tags:
                it.tags.append(t)
    return it
