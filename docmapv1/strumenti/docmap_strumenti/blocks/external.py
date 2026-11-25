"""External blocks: AI analysis with any provider, and any HTTP service of yours (e.g. a Python server)."""

from __future__ import annotations

import base64

from .. import providers as PR
from ..items import item_vars, render
from ..registry import P, block
from .files import unique_path


@block("ai", "Analizza con l'AI", "esterni",
       help="Chiede a un modello AI (Claude, OpenAI, Gemini, servizio compatibile, Ollama, le tue workstation: si sceglie nelle Impostazioni) "
            "di leggere il documento e compilare più campi insieme, con l'affidabilità di ognuno. Sotto la soglia, il "
            "file va a verifica. Consuma crediti.",
       params=[P("fields", "list", [], "Campi da compilare", "es. cliente, numero, data, totale", required=True),
               P("prompt", "text", "Leggi dal documento i campi richiesti.", "Istruzione",
                 "puoi usare le variabili, es. «Il documento è di {cliente}»"),
               P("use_image", "bool", True, "Guarda l'immagine"),
               P("use_text", "bool", True, "Usa il testo letto"),
               P("classes", "list", [], "Classi possibili", "se l'AI deve anche classificare"),
               P("tags", "list", [], "Tag possibili", "l'AI sceglie tra questi"),
               P("review_below", "float", 0.7, "Verifica sotto", min=0, max=1),
               P("profile", "str", "", "Profilo AI", "vuoto = predefinito; es. qualita, veloce, ocr (Impostazioni › AI)")],
       meters=["ai_call"])
def ai(it, p, ctx):
    props = {f: {"type": "object", "properties": {"value": {"type": "string"}, "confidence": {"type": "number"}},
                 "required": ["value", "confidence"], "additionalProperties": False} for f in p["fields"]}
    if p["classes"]:
        props["_class"] = {"type": "string", "enum": p["classes"]}
    if p["tags"]:
        props["_tags"] = {"type": "array", "items": {"type": "string", "enum": p["tags"]}}
    schema = {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}
    instr = render(p["prompt"], item_vars(it, ctx.vars), path_safe=False)
    prompt = (instr + "\nCampi: " + ", ".join(p["fields"]) +
              ". Per ogni campo rispondi {\"value\": \"…\", \"confidence\": 0..1}; value vuoto se non c'è."
              + (f" «_class»: una tra {', '.join(p['classes'])}." if p["classes"] else "")
              + (f" «_tags»: quelli adatti tra {', '.join(p['tags'])}." if p["tags"] else ""))
    if p["use_text"] and it.text:
        prompt += "\n\nTesto letto (può avere errori di OCR):\n" + it.text[:12000]
    img = None
    if p["use_image"] and it.kind in ("image", "pdf"):
        img = PR.image_payload(it.p, it.page if it.ext == "pdf" and it.page else 1)
    ctx.meter("ai_call")
    r = PR.ai_json(ctx.settings, prompt, img, schema, profile=p.get("profile") or None, task="analyze")
    res, by = r["result"], "ai:" + str(r["model"])
    if isinstance(res.get("_consensus"), dict):   # several models compared: keep who agreed, for the review
        it.meta["ai_consensus"] = res["_consensus"]
    for f in p["fields"]:
        x = res.get(f)
        if isinstance(x, dict):
            v, c = x.get("value"), x.get("confidence")
        else:
            v, c = x, None
        c = float(c) if isinstance(c, (int, float)) else 0.5
        v = "" if v is None else str(v).strip()
        it.set_field(f, v, c if v else 0.0, by)
        if c < p["review_below"] or not v:
            it.flag(f"{f}: AI incerta ({int(c * 100)}%)" if v else f"{f}: l'AI non l'ha trovato")
    if p["classes"] and isinstance(res.get("_class"), str):
        it.cls = res["_class"]
    if p["tags"] and isinstance(res.get("_tags"), list):
        for t in res["_tags"]:
            if t in p["tags"] and t not in it.tags:
                it.tags.append(t)
    return it


def _fill(x, v):
    """Variables inside every string of a JSON value ({"cliente": "{cliente}"})."""
    if isinstance(x, str):
        return render(x, v, path_safe=False) if "{" in x else x
    if isinstance(x, list):
        return [_fill(i, v) for i in x]
    if isinstance(x, dict):
        return {k: _fill(i, v) for k, i in x.items()}
    return x


@block("http", "Servizio esterno", "esterni",
       help="Manda il file e i campi a un servizio tuo (per esempio un server Python con un OCR potente, un gestionale, "
            "un controllo anagrafico). Il servizio risponde in JSON con campi, testo, tag o un file nuovo che "
            "sostituisce quello attuale. L'indirizzo e la chiave si scrivono una volta nelle Impostazioni › Servizi "
            "esterni, mai nella ricetta.",
       params=[P("endpoint", "str", "", "Servizio", "nome dato nelle Impostazioni", required=True),
               P("op", "str", "", "Operazione", "testo libero passato al servizio (es. «estrai», «timbra»)"),
               P("send_file", "bool", True, "Invia il file"),
               P("send_text", "bool", False, "Invia il testo letto"),
               P("extra", "json", None, "Dati in più", "JSON con variabili, es. {\"cliente\": \"{cliente}\"}"),
               P("review_below", "float", 0.0, "Verifica sotto", min=0, max=1)],
       meters=["http_call"])
def http(it, p, ctx):
    v = item_vars(it, ctx.vars)
    extra = _fill(p["extra"], v) if p["extra"] else {}
    payload = {"op": p["op"], "id": it.id, "src": it.src, "page": it.page,
               "fields": {k: f.get("v") for k, f in it.fields.items() if isinstance(f, dict)},
               "tags": it.tags, "cls": it.cls, "extra": extra}
    if p["send_text"]:
        payload["text"] = it.text
    ctx.meter("http_call")
    j = PR.call_endpoint(ctx.settings, p["endpoint"], payload, it.p if p["send_file"] else None)
    by = "http:" + p["endpoint"]
    for k, x in (j.get("fields") or {}).items():
        val, conf = (x.get("value"), x.get("confidence")) if isinstance(x, dict) else (x, None)
        it.set_field(k, "" if val is None else val, float(conf) if isinstance(conf, (int, float)) else 0.9, by)
        if p["review_below"] and isinstance(conf, (int, float)) and conf < p["review_below"]:
            it.flag(f"{k}: servizio incerto ({int(conf * 100)}%)")
    if isinstance(j.get("text"), str):
        it.text, it.text_by = j["text"], by
        if isinstance(j.get("conf"), (int, float)):
            it.text_conf = float(j["conf"])
    for t in j.get("tags") or []:
        if t not in it.tags:
            it.tags.append(str(t))
    if isinstance(j.get("cls"), str):
        it.cls = j["cls"]
    f = j.get("file")
    if isinstance(f, dict) and f.get("data"):
        name = str(f.get("name") or it.p.name).replace("/", "_").replace("\\", "_")
        dest = unique_path(ctx.step_dir() / it.id / name)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(base64.b64decode(f["data"]))
        it.path = str(dest)
    for fl in j.get("flags") or []:
        it.flag(str(fl))
    return it
