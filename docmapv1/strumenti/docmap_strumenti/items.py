"""The unit of work that flows through a recipe: an *item* (a file, or one page / one segment of a file).

Every block receives the list of items and returns a new list. Items are plain JSON-friendly objects, saved after
every step (``state.json`` of the job), so a job can stop for the manual review and resume later, even after a restart.
"""

from __future__ import annotations

import re
import string
import unicodedata
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path

IMAGE_EXT = {"jpg", "jpeg", "png", "tif", "tiff", "bmp", "gif", "webp"}
PDF_EXT = {"pdf"}
TEXT_EXT = {"txt", "md", "markdown", "log"}
TABLE_EXT = {"csv", "tsv", "xlsx", "xlsm", "json", "jsonl"}
DOC_EXT = {"docx"}
MULTIPAGE_EXT = {"pdf", "tif", "tiff", "gif"}

# Status of an item: ok = goes on; review = waits for a person; error = a step failed; skip = filtered out.
OK, REVIEW, ERROR, SKIP = "ok", "review", "error", "skip"


def kind_of(ext: str) -> str:
    e = ext.lower().lstrip(".")
    if e in IMAGE_EXT:
        return "image"
    if e in PDF_EXT:
        return "pdf"
    if e in TEXT_EXT:
        return "text"
    if e in TABLE_EXT:
        return "table"
    if e in DOC_EXT:
        return "doc"
    return "other"


@dataclass
class Item:
    id: str
    path: str                       # current file (absolute)
    src: str                        # original file, relative to the input folder
    page: int | None = None         # 1-based page of the original, when the item is one page
    pages: int | None = None        # pages of the current file (when known)
    text: str = ""
    text_conf: float | None = None  # 0..1, mean OCR confidence
    text_by: str = ""               # which engine produced the text
    fields: dict = field(default_factory=dict)   # name -> {"v", "conf", "by", "certified", "alt"?}
    tags: list = field(default_factory=list)
    cls: str = ""                   # class assigned by «classify»
    status: str = OK
    flags: list = field(default_factory=list)    # why it needs a person, or why it failed
    out: list = field(default_factory=list)      # files written to the output
    group: str = ""                 # key set by «merge» / «segment»
    meta: dict = field(default_factory=dict)
    log: list = field(default_factory=list)

    # -- helpers -------------------------------------------------------------------------------------------------
    @property
    def p(self) -> Path:
        return Path(self.path)

    @property
    def ext(self) -> str:
        return self.p.suffix.lower().lstrip(".")

    @property
    def kind(self) -> str:
        return kind_of(self.ext)

    def value(self, name: str, default=None):
        f = self.fields.get(name)
        return f.get("v", default) if isinstance(f, dict) else default

    def set_field(self, name: str, value, conf: float | None = 1.0, by: str = "", **extra) -> None:
        old = self.fields.get(name) if isinstance(self.fields.get(name), dict) else {}
        if old.get("certified") and by != "human":
            # a value certified by a person is never overwritten by a machine; the machine answer is kept aside
            old.setdefault("alt", []).append({"v": value, "conf": conf, "by": by})
            return
        f = {"v": value, "conf": None if conf is None else round(float(conf), 3), "by": by}
        f.update(extra)
        self.fields[name] = f

    def flag(self, reason: str, status: str = REVIEW) -> None:
        if reason not in self.flags:
            self.flags.append(reason)
        if self.status in (OK, REVIEW):
            self.status = status

    def note(self, step: str, msg: str) -> None:
        self.log.append({"step": step, "msg": msg[:500]})

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "Item":
        names = {f for f in cls.__dataclass_fields__}  # type: ignore[attr-defined]
        return cls(**{k: v for k, v in d.items() if k in names})

    def child(self, new_id: str, path: str, **changes) -> "Item":
        d = self.to_dict()
        d.update(id=new_id, path=path, out=[], log=list(self.log))
        d.update(changes)
        return Item.from_dict(d)


# -- variables and templates ------------------------------------------------------------------------------------

_BAD = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def safe_part(s, max_len: int = 120) -> str:
    """One folder or file name: no characters Windows refuses, no trailing dots/spaces, never empty."""
    s = unicodedata.normalize("NFC", str(s if s is not None else ""))
    s = _BAD.sub("_", s).strip().strip(".")
    s = re.sub(r"\s+", " ", s)
    if s.upper() in {"CON", "PRN", "AUX", "NUL"} | {f"COM{i}" for i in range(1, 10)} | {f"LPT{i}" for i in range(1, 10)}:
        s = "_" + s
    return (s[:max_len].rstrip(" .") or "_")


class _Vars(dict):
    def __missing__(self, key):
        raise KeyError(key)


def item_vars(it: Item, extra: dict | None = None) -> dict:
    src = Path(it.src)
    now = datetime.now()
    v = {
        "name": it.p.stem, "ext": it.ext, "file": it.p.name,
        "src_name": src.stem, "src_ext": src.suffix.lower().lstrip("."), "src_dir": str(src.parent).replace("\\", "/") if str(src.parent) != "." else "",
        "parent": src.parent.name, "page": it.page or 0, "pages": it.pages or 0, "id": it.id,
        "cls": it.cls, "tags": "-".join(it.tags), "group": it.group, "status": it.status,
        "date": now.strftime("%Y-%m-%d"), "year": now.strftime("%Y"), "month": now.strftime("%m"), "day": now.strftime("%d"),
        "time": now.strftime("%H%M%S"),
    }
    for k, f in it.fields.items():
        if isinstance(f, dict):
            v[k] = "" if f.get("v") is None else f.get("v")
    for k, val in (it.meta.get("vars") or {}).items():
        v.setdefault(k, val)
    if extra:
        v.update(extra)
    return v


PATH_VARS = {"src_dir"}   # variables that keep their «/» (sub-folders); every other value is one name


class TemplateError(ValueError):
    pass


def template_fields(tpl: str) -> list[str]:
    out = []
    for _, name, _, _ in string.Formatter().parse(tpl or ""):
        if name:
            out.append(name.split(".")[0].split("[")[0])
    return out


def render(tpl: str, variables: dict, path_safe: bool = True) -> str:
    """``{numero}``, ``{page:03}``, ``{name|upper}``, ``{cliente|slug}``, ``{x|default:SENZA}``.

    With ``path_safe`` every value is cleaned for a file name (``/`` written in the template still makes folders).
    """
    out = []
    for lit, name, spec, conv in string.Formatter().parse(tpl or ""):
        out.append(lit)
        if name is None:
            continue
        filters = []
        if "|" in name:
            name, *filters = name.split("|")
        if spec and "|" in spec:
            spec, *more = spec.split("|")
            filters += more
        name = name.strip()
        if spec and filters and filters[-1].strip() in ("first", "last", "default", "pad"):
            filters[-1] = filters[-1].strip() + ":" + spec       # {x|first:4}: the «:4» belongs to the filter
            spec = ""
        default = None
        for f in filters:
            if f.startswith("default:"):
                default = f[8:]
        if name in variables and variables[name] not in (None, ""):
            val = variables[name]
        elif default is not None:
            val = default
        else:
            raise TemplateError(f"variabile mancante: {name}")
        if spec:
            try:
                val = format(int(val), spec) if re.fullmatch(r"-?\d+", str(val)) else format(str(val), spec)
            except (ValueError, TypeError):
                val = str(val)
        val = str(val)
        for f in filters:
            f = f.strip()
            if f == "upper":
                val = val.upper()
            elif f == "lower":
                val = val.lower()
            elif f == "title":
                val = val.title()
            elif f == "slug":
                val = re.sub(r"[^A-Za-z0-9]+", "-", unicodedata.normalize("NFKD", val).encode("ascii", "ignore").decode()).strip("-").lower()
            elif f == "digits":
                val = re.sub(r"\D", "", val)
            elif f == "trim":
                val = val.strip()
            elif f.startswith("first:"):
                val = val[: int(f[6:] or 0)]
            elif f.startswith("pad:"):
                val = val.zfill(int(f[4:] or 0))
            elif f.startswith("last:"):
                n = int(f[5:] or 0)
                val = val[-n:] if n else ""
        if path_safe and name in PATH_VARS:
            val = "/".join(safe_part(x) for x in val.replace("\\", "/").split("/") if x not in ("", ".", ".."))
        elif path_safe:
            val = safe_part(val) if val != "" else ""
        out.append(val)
    return "".join(out)
