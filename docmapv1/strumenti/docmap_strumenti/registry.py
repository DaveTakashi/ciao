"""Block registry. A block is a small, reusable operation with typed parameters; recipes combine them.

    @block("rename", "Rinomina", "file", help="…", params=[P("to", "template", "{name}", "Nuovo nome")])
    def rename(it, p, ctx): ...            # kind="map": one item in, one item / a list / None out

    @block("merge", …, kind="batch")
    def merge(items, p, ctx): ...          # kind="batch": the whole list in, a new list out

The parameter schema is also what the editor in the browser shows (labels and help in Italian), so a new block is
usable from the interface without writing any HTML.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

BLOCKS: dict[str, "Block"] = {}
TYPES = {"str", "text", "int", "float", "bool", "choice", "list", "template", "regex", "path", "json", "field", "fields"}
CATEGORIES = {
    "file": "File e cartelle", "pagine": "Pagine e segmenti", "conversione": "Conversione e ottimizzazione",
    "lettura": "Lettura (OCR e testo)", "dati": "Campi e dati", "controllo": "Controllo e verifica",
    "esterni": "AI e servizi esterni", "uscita": "Uscita e report",
}


class ParamError(ValueError):
    pass


@dataclass
class P:
    name: str
    type: str = "str"
    default: object = None
    label: str = ""
    help: str = ""
    choices: list | None = None
    required: bool = False
    min: float | None = None
    max: float | None = None

    def to_dict(self) -> dict:
        d = {k: v for k, v in self.__dict__.items() if v is not None}
        return d


@dataclass
class Block:
    name: str
    label: str
    category: str
    fn: object
    kind: str = "map"
    help: str = ""
    params: list = field(default_factory=list)
    meters: list = field(default_factory=list)   # what it can consume: page, ocr_page, ai_call, http_call

    def to_dict(self) -> dict:
        return {"name": self.name, "label": self.label, "category": self.category,
                "category_label": CATEGORIES.get(self.category, self.category), "kind": self.kind, "help": self.help,
                "params": [p.to_dict() for p in self.params], "meters": self.meters}

    def resolve(self, given: dict | None) -> dict:
        """Parameters of a step with defaults, types checked. Unknown names are an error (typos would be silent)."""
        given = dict(given or {})
        known = {p.name for p in self.params}
        extra = sorted(set(given) - known)
        if extra:
            raise ParamError(f"blocco «{self.name}»: parametro sconosciuto {', '.join(extra)}")
        out = {}
        for p in self.params:
            v = given.get(p.name, p.default)
            if v is None:
                if p.required:
                    raise ParamError(f"blocco «{self.name}»: manca «{p.label or p.name}»")
                out[p.name] = None
                continue
            out[p.name] = _coerce(self.name, p, v)
        return out


def _coerce(bname: str, p: P, v):
    where = f"blocco «{bname}», «{p.label or p.name}»"
    t = p.type
    try:
        if t == "int":
            v = int(v)
        elif t == "float":
            v = float(v)
        elif t == "bool":
            v = v if isinstance(v, bool) else str(v).strip().lower() in ("1", "true", "si", "sì", "yes", "on")
        elif t in ("list", "fields"):
            if isinstance(v, str):
                v = [x.strip() for x in re.split(r"[,\n;]", v) if x.strip()]
            if not isinstance(v, list):
                raise ParamError(f"{where}: serve un elenco")
        elif t == "json":
            if isinstance(v, str):
                v = json.loads(v) if v.strip() else None
        elif t == "regex":
            re.compile(str(v))
            v = str(v)
        elif t == "choice":
            v = str(v)
            if p.choices and v not in p.choices:
                raise ParamError(f"{where}: «{v}» non è tra {', '.join(map(str, p.choices))}")
        else:
            v = v if isinstance(v, str) else str(v)
    except re.error as e:
        raise ParamError(f"{where}: espressione regolare non valida ({e})") from None
    except (TypeError, ValueError) as e:
        if isinstance(e, ParamError):
            raise
        raise ParamError(f"{where}: valore non valido «{v}»") from None
    if t in ("int", "float"):
        if p.min is not None and v < p.min:
            raise ParamError(f"{where}: minimo {p.min}")
        if p.max is not None and v > p.max:
            raise ParamError(f"{where}: massimo {p.max}")
    return v


def block(name: str, label: str, category: str, help: str = "", params=None, kind: str = "map", meters=None):
    def deco(fn):
        if name in BLOCKS:
            raise RuntimeError(f"block {name} registered twice")
        BLOCKS[name] = Block(name, label, category, fn, kind, help, list(params or []), list(meters or []))
        return fn
    return deco


def get(name: str) -> Block:
    load_all()
    if name not in BLOCKS:
        raise ParamError(f"blocco sconosciuto: «{name}»")
    return BLOCKS[name]


def catalog() -> list[dict]:
    load_all()
    return [b.to_dict() for b in sorted(BLOCKS.values(), key=lambda b: (list(CATEGORIES).index(b.category)
                                                                          if b.category in CATEGORIES else 99, b.name))]


_LOADED = []


def load_all() -> None:
    if not _LOADED:
        _LOADED.append(True)
        from . import blocks  # noqa: F401  (registers every block)
