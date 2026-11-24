"""Recipes: JSON documents (format ``docmap-ricetta/1``), checked before use and saved with every version kept.

    {"format": "docmap-ricetta/1", "id": "fatture-per-numero", "version": 3, "name": "Fatture TIFF per numero",
     "description": "…", "input": {"patterns": ["*.tif", "*.tiff"], "recursive": true},
     "steps": [{"id": "leggi", "block": "ocr", "with": {"engine": "auto"}},
               {"id": "numero", "block": "extract", "with": {"field": "numero", "method": "regex", "pattern": "…"}},
               {"block": "route", "with": {"to": "{numero}/{file}"}, "when": "numero != ''"}]}

A recipe never holds folders of a specific PC nor secrets (API keys stay in the settings of the worker): the same
recipe runs on any PC, on the hub or on a remote worker, and can be shared between customers as a template.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from . import RECIPE_FORMAT
from . import registry as R

ID_RE = re.compile(r"[a-z0-9][a-z0-9-]{1,63}")
TEMPLATES_DIR = Path(__file__).with_name("templates")
_COND_RE = re.compile(r"^\s*([A-Za-z_][\w.]*)\s*(==|!=|~|!~|>=|<=|>|<|is empty|is not empty|in)\s*(.*?)\s*$")


class RecipeError(ValueError):
    pass


def slug(s: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return (s or "ricetta")[:60]


def validate(rec: dict) -> dict:
    """Normalized copy of a recipe, or RecipeError with a message for a person."""
    if not isinstance(rec, dict):
        raise RecipeError("la ricetta deve essere un oggetto JSON")
    fmt = rec.get("format", RECIPE_FORMAT)
    if fmt != RECIPE_FORMAT:
        raise RecipeError(f"formato «{fmt}» non riconosciuto (atteso {RECIPE_FORMAT})")
    name = str(rec.get("name") or "").strip()
    if not name:
        raise RecipeError("la ricetta non ha un nome")
    rid = str(rec.get("id") or slug(name))
    if not ID_RE.fullmatch(rid):
        raise RecipeError(f"id «{rid}» non valido: minuscole, cifre e trattini")
    steps = rec.get("steps")
    if not isinstance(steps, list) or not steps:
        raise RecipeError("la ricetta non ha passi")
    inp = rec.get("input") or {}
    if not isinstance(inp, dict):
        raise RecipeError("«input» deve essere un oggetto")
    pats = inp.get("patterns") or ["*"]
    if isinstance(pats, str):
        pats = [x.strip() for x in pats.split(",") if x.strip()]
    out_steps, seen = [], set()
    for i, s in enumerate(steps, 1):
        if not isinstance(s, dict) or not s.get("block"):
            raise RecipeError(f"passo {i}: manca il blocco")
        b = R.get(str(s["block"]))
        sid = str(s.get("id") or f"{i:02d}-{b.name}")
        if not re.fullmatch(r"[A-Za-z0-9][\w-]{0,40}", sid):
            raise RecipeError(f"passo {i}: id «{sid}» non valido")
        if sid in seen:
            raise RecipeError(f"passo {i}: id «{sid}» ripetuto")
        seen.add(sid)
        try:
            b.resolve(s.get("with"))
        except R.ParamError as e:
            raise RecipeError(f"passo {i} ({sid}): {e}") from None
        when = s.get("when") or ""
        if when:
            try:
                parse_condition(when)
            except RecipeError as e:
                raise RecipeError(f"passo {i} ({sid}): {e}") from None
        out_steps.append({"id": sid, "block": b.name, "with": dict(s.get("with") or {}),
                          **({"when": when} if when else {}), **({"label": str(s["label"])} if s.get("label") else {}),
                          **({"enabled": False} if s.get("enabled") is False else {})})
    out = {"format": RECIPE_FORMAT, "id": rid, "version": int(rec.get("version") or 1), "name": name,
           "description": str(rec.get("description") or ""), "tags": list(rec.get("tags") or []),
           "input": {"patterns": pats, "recursive": bool(inp.get("recursive", True)),
                     "exclude": list(inp.get("exclude") or [])},
           "steps": out_steps}
    for k in ("vars", "review", "updated", "author", "notes", "run_on"):
        if k in rec:
            out[k] = rec[k]
    if out.get("run_on") not in (None, "local", "remote", "auto"):
        raise RecipeError("«run_on» deve essere local, remote o auto")
    return out


# -- conditions («when») ------------------------------------------------------------------------------------------

def parse_condition(expr: str) -> list:
    """``numero != ''``, ``cls == fattura``, ``text ~ (?i)nota di credito``, ``pages > 1``, ``cliente is empty``,
    ``ext in pdf,tif``; several joined with `` and `` / `` or `` (and binds first)."""
    out = []
    for alt in re.split(r"\s+or\s+", expr.strip()):
        group = []
        for part in re.split(r"\s+and\s+", alt):
            m = _COND_RE.match(part)
            if not m:
                raise RecipeError(f"condizione non capita: «{part}»")
            name, op, val = m.groups()
            val = val.strip()
            if len(val) >= 2 and val[0] == val[-1] and val[0] in "'\"":
                val = val[1:-1]
            if op in ("~", "!~"):
                try:
                    re.compile(val)
                except re.error as e:
                    raise RecipeError(f"espressione regolare non valida in «{part}»: {e}") from None
            group.append((name, op, val))
        out.append(group)
    return out


def _lookup(it, name: str):
    if name in ("text", "cls", "status", "group", "src", "id"):
        return getattr(it, name)
    if name == "ext":
        return it.ext
    if name == "kind":
        return it.kind
    if name in ("page", "pages"):
        return getattr(it, name) or 0
    if name == "tags":
        return ",".join(it.tags)
    if name.startswith("conf."):
        f = it.fields.get(name[5:]) or {}
        return f.get("conf") if isinstance(f, dict) else None
    if name == "text_conf":
        return it.text_conf
    return it.value(name, "")


def _num(x):
    try:
        return float(str(x).replace(",", "."))
    except (TypeError, ValueError):
        return None


def matches(it, expr: str | list) -> bool:
    groups = parse_condition(expr) if isinstance(expr, str) else expr
    for group in groups:
        ok = True
        for name, op, val in group:
            cur = _lookup(it, name)
            s = "" if cur is None else str(cur)
            if op == "==":
                r = s == val
            elif op == "!=":
                r = s != val
            elif op == "~":
                r = re.search(val, s) is not None
            elif op == "!~":
                r = re.search(val, s) is None
            elif op == "is empty":
                r = s.strip() == ""
            elif op == "is not empty":
                r = s.strip() != ""
            elif op == "in":
                r = s.lower() in [x.strip().lower() for x in val.split(",")]
            else:
                a, b = _num(cur), _num(val)
                r = a is not None and b is not None and {">": a > b, "<": a < b, ">=": a >= b, "<=": a <= b}[op]
            if not r:
                ok = False
                break
        if ok:
            return True
    return False


# -- store (one folder per recipe, every version kept) ------------------------------------------------------------

class Store:
    def __init__(self, data_dir: Path):
        self.dir = Path(data_dir) / "ricette"
        self.dir.mkdir(parents=True, exist_ok=True)

    def _versions(self, rid: str) -> list[int]:
        d = self.dir / rid
        if not d.is_dir():
            return []
        return sorted(int(m.group(1)) for p in d.glob("v*.json") if (m := re.fullmatch(r"v(\d+)\.json", p.name)))

    def list(self) -> list[dict]:
        out = []
        for d in sorted(self.dir.iterdir()) if self.dir.is_dir() else []:
            if d.is_dir() and ID_RE.fullmatch(d.name):
                try:
                    r = self.get(d.name)
                except RecipeError:
                    continue
                out.append({"id": r["id"], "name": r["name"], "version": r["version"], "description": r["description"],
                            "steps": len(r["steps"]), "updated": r.get("updated", ""), "tags": r.get("tags", []),
                            "versions": self._versions(d.name)})
        return out

    def get(self, rid: str, version: int | None = None) -> dict:
        if not ID_RE.fullmatch(rid or ""):
            raise RecipeError("ricetta sconosciuta")
        vs = self._versions(rid)
        if not vs:
            raise RecipeError(f"ricetta «{rid}» non trovata")
        v = version or vs[-1]
        if v not in vs:
            raise RecipeError(f"la ricetta «{rid}» non ha la versione {v}")
        return json.loads((self.dir / rid / f"v{v}.json").read_text("utf-8"))

    def save(self, rec: dict, author: str = "") -> dict:
        """Saves a NEW version (the old ones stay, a job always records which version it ran)."""
        r = validate(rec)
        vs = self._versions(r["id"])
        if vs:
            cur = self.get(r["id"])
            same = {k: v for k, v in cur.items() if k not in ("version", "updated", "author")}
            new = {k: v for k, v in r.items() if k not in ("version", "updated", "author")}
            if same == new:
                return cur
        r["version"] = (vs[-1] + 1) if vs else 1
        r["updated"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        if author:
            r["author"] = author
        d = self.dir / r["id"]
        d.mkdir(parents=True, exist_ok=True)
        tmp = d / f".v{r['version']}.tmp"
        tmp.write_text(json.dumps(r, ensure_ascii=False, indent=2), "utf-8")
        tmp.replace(d / f"v{r['version']}.json")
        return r

    def archive(self, rid: str) -> None:
        """Hides a recipe without deleting it (folder renamed with a leading underscore)."""
        d = self.dir / rid
        if d.is_dir():
            n = 1
            while (self.dir / f"_archiviata-{rid}-{n}").exists():
                n += 1
            d.rename(self.dir / f"_archiviata-{rid}-{n}")


def templates() -> list[dict]:
    out = []
    for p in sorted(TEMPLATES_DIR.glob("*.json")):
        try:
            r = validate(json.loads(p.read_text("utf-8")))
        except (ValueError, RecipeError):
            continue
        out.append(r)
    return out
